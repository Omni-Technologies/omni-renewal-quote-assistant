/**
 * Hosted backend: serves the built app and a small JSON API over one D1
 * database. Every /api request must carry a valid Cloudflare Access login for
 * ALLOWED_EMAIL; with Access settings missing, the API refuses everything.
 */

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAIL?: string;
  /** Set only in .dev.vars for `wrangler dev`; honoured only on localhost. */
  LOCAL_DEV_NO_AUTH?: string;
}

type Kind = 'dtools' | 'jobcost';
interface Keyed { id?: unknown; key?: unknown; updatedAt?: unknown }
interface HistoryBody { dataset: Keyed; items: unknown[] }
interface RestoreBody {
  renewals: Keyed[];
  dtools?: { dataset: Keyed | null; rows: unknown[]; decisions: Keyed[] } | null;
  jobCost?: { dataset: Keyed | null; projects: unknown[] } | null;
}

const CHUNK_CHARS = 500_000;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (!(await authorized(request, env, url))) throw new HttpError(401, 'Not signed in.');
      return await route(request, env, url.pathname.slice(5).split('/').map(decodeURIComponent));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);
      return new Response(message, { status, headers: { 'cache-control': 'no-store' } });
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, parts: string[]): Promise<Response> {
  const method = request.method;
  const [resource, param] = parts;
  if (parts.length > 2) throw new HttpError(404, 'Not found.');

  if (resource === 'renewals') {
    if (method === 'GET' && !param) {
      const { results } = await env.DB.prepare('SELECT data FROM renewals').all<{ data: string }>();
      return json(results.map((row) => JSON.parse(row.data)));
    }
    if (method === 'PUT' && !param) {
      const renewals = await body<Keyed[]>(request);
      if (!Array.isArray(renewals)) throw new HttpError(400, 'Expected a list of renewals.');
      if (renewals.length) await env.DB.batch(renewals.map((renewal) => upsertRenewal(env, renewal)));
      return empty();
    }
    if (method === 'PUT' && param) {
      const renewal = await body<Keyed>(request);
      if (renewal.id !== param) throw new HttpError(400, 'Renewal id does not match the URL.');
      await upsertRenewal(env, renewal).run();
      return empty();
    }
    if (method === 'DELETE' && param) {
      await env.DB.prepare('DELETE FROM renewals WHERE id = ?').bind(param).run();
      return empty();
    }
  }

  if (resource === 'decisions') {
    if (method === 'GET' && !param) {
      const { results } = await env.DB.prepare('SELECT data FROM decisions').all<{ data: string }>();
      return json(results.map((row) => JSON.parse(row.data)));
    }
    if (method === 'PUT' && param) {
      const decision = await body<Keyed>(request);
      if (decision.key !== param) throw new HttpError(400, 'Decision key does not match the URL.');
      await env.DB.prepare('INSERT OR REPLACE INTO decisions (key, data) VALUES (?, ?)')
        .bind(param, JSON.stringify(decision)).run();
      return empty();
    }
    if (method === 'DELETE' && param) {
      await env.DB.prepare('DELETE FROM decisions WHERE key = ?').bind(param).run();
      return empty();
    }
  }

  if (resource === 'history' && (param === 'dtools' || param === 'jobcost')) {
    if (method === 'GET') return json(await readHistory(env, param));
    if (method === 'PUT') {
      const history = await body<HistoryBody>(request);
      if (typeof history?.dataset?.id !== 'string' || !Array.isArray(history.items) || history.items.length === 0) {
        throw new HttpError(400, 'Expected a dataset and its rows.');
      }
      await env.DB.batch(writeHistory(env, param, history.dataset, history.items, true));
      return empty();
    }
  }

  if (resource === 'restore' && method === 'POST' && !param) {
    return json(await restore(env, await body<RestoreBody>(request)));
  }

  throw new HttpError(404, 'Not found.');
}

function upsertRenewal(env: Env, renewal: Keyed, conflict: 'REPLACE' | 'IGNORE' = 'REPLACE'): D1PreparedStatement {
  if (typeof renewal?.id !== 'string' || !renewal.id) throw new HttpError(400, 'Renewal is missing its id.');
  const updatedAt = typeof renewal.updatedAt === 'number' ? renewal.updatedAt : Date.now();
  return env.DB.prepare(`INSERT OR ${conflict} INTO renewals (id, data, updated_at) VALUES (?, ?, ?)`)
    .bind(renewal.id, JSON.stringify(renewal), updatedAt);
}

async function readHistory(env: Env, kind: Kind): Promise<{ dataset: unknown; items: unknown[] } | null> {
  const [datasetResult, chunkResult] = await env.DB.batch<{ data: string }>([
    env.DB.prepare('SELECT data FROM datasets WHERE kind = ?').bind(kind),
    env.DB.prepare('SELECT data FROM dataset_chunks WHERE kind = ? ORDER BY seq').bind(kind),
  ]);
  const dataset = datasetResult.results[0];
  if (!dataset) return null;
  return {
    dataset: JSON.parse(dataset.data),
    items: chunkResult.results.flatMap((chunk) => JSON.parse(chunk.data) as unknown[]),
  };
}

function writeHistory(env: Env, kind: Kind, dataset: Keyed, items: readonly unknown[], replace: boolean): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  if (replace) {
    statements.push(
      env.DB.prepare('DELETE FROM dataset_chunks WHERE kind = ?').bind(kind),
      env.DB.prepare('DELETE FROM datasets WHERE kind = ?').bind(kind),
    );
  }
  statements.push(env.DB.prepare('INSERT INTO datasets (kind, data) VALUES (?, ?)').bind(kind, JSON.stringify(dataset)));
  let chunk: unknown[] = [];
  let size = 0;
  let seq = 0;
  const flush = () => {
    if (!chunk.length) return;
    statements.push(env.DB.prepare('INSERT INTO dataset_chunks (kind, seq, data) VALUES (?, ?, ?)')
      .bind(kind, seq++, JSON.stringify(chunk)));
    chunk = [];
    size = 0;
  };
  for (const item of items) {
    const itemSize = JSON.stringify(item).length;
    if (size + itemSize > CHUNK_CHARS) flush();
    chunk.push(item);
    size += itemSize;
  }
  flush();
  return statements;
}

/** Same merge rules as the browser restore: add what is missing, never overwrite. */
async function restore(env: Env, backup: RestoreBody) {
  if (!Array.isArray(backup?.renewals)) throw new HttpError(400, 'Expected a backup.');
  const [renewalIds, decisionKeys, datasetKinds] = await env.DB.batch<{ id: string }>([
    env.DB.prepare('SELECT id FROM renewals'),
    env.DB.prepare('SELECT key AS id FROM decisions'),
    env.DB.prepare('SELECT kind AS id FROM datasets'),
  ]);
  const existing = new Set(renewalIds.results.map((row) => row.id));
  const decided = new Set(decisionKeys.results.map((row) => row.id));
  const kinds = new Set(datasetKinds.results.map((row) => row.id));

  const missing = backup.renewals.filter((renewal) => !existing.has(String(renewal.id)));
  // IGNORE: a renewal saved by another device since the read above is kept.
  const statements = missing.map((renewal) => upsertRenewal(env, renewal, 'IGNORE'));
  const summary = {
    added: new Set(missing.map((renewal) => renewal.id)).size,
    kept: new Set(backup.renewals.filter((renewal) => existing.has(String(renewal.id))).map((renewal) => renewal.id)).size,
    firstAddedId: typeof missing[0]?.id === 'string' ? missing[0].id : null,
    dtoolsAdded: false,
    jobCostAdded: false,
    decisionsAdded: 0,
  };

  if (backup.dtools) {
    const { dataset, rows, decisions } = backup.dtools;
    if (dataset && !kinds.has('dtools')) {
      statements.push(...writeHistory(env, 'dtools', dataset, rows, false));
      summary.dtoolsAdded = true;
    }
    const newDecisions = decisions.filter((decision) => typeof decision.key === 'string' && !decided.has(decision.key));
    for (const decision of newDecisions) {
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO decisions (key, data) VALUES (?, ?)')
        .bind(decision.key as string, JSON.stringify(decision)));
    }
    summary.decisionsAdded = new Set(newDecisions.map((decision) => decision.key)).size;
  }
  if (backup.jobCost?.dataset && !kinds.has('jobcost')) {
    statements.push(...writeHistory(env, 'jobcost', backup.jobCost.dataset, backup.jobCost.projects, false));
    summary.jobCostAdded = true;
  }
  if (statements.length) await env.DB.batch(statements);
  return summary;
}

async function body<T>(request: Request): Promise<T> {
  // Cross-site forms cannot send JSON, so this also blocks forged writes.
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Expected a JSON request.');
  }
  try {
    return await request.json<T>();
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function empty(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

/* ------------------------------------------------------------------------- */
/* Cloudflare Access login check                                             */
/* ------------------------------------------------------------------------- */

let cachedKeys: { domain: string; at: number; keys: (JsonWebKey & { kid?: string })[] } | null = null;

async function accessKeys(domain: string, kid: string) {
  const fresh = cachedKeys && cachedKeys.domain === domain && Date.now() - cachedKeys.at < 3_600_000;
  if (!fresh || !cachedKeys!.keys.some((key) => key.kid === kid)) {
    const response = await fetch(`${domain}/cdn-cgi/access/certs`);
    if (!response.ok) throw new HttpError(503, `Could not load Cloudflare Access keys (${response.status}).`);
    const { keys } = await response.json<{ keys: (JsonWebKey & { kid?: string })[] }>();
    cachedKeys = { domain, at: Date.now(), keys };
  }
  return cachedKeys!.keys;
}

async function authorized(request: Request, env: Env, url: URL): Promise<boolean> {
  if (env.LOCAL_DEV_NO_AUTH === 'true' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) return true;
  const domain = env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, '').replace(/^(?!https:\/\/)/, 'https://');
  if (!domain || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const [header, payload, signature] = token?.split('.') ?? [];
  if (!header || !payload || !signature) return false;
  try {
    const head = JSON.parse(base64UrlText(header)) as { alg?: string; kid?: string };
    const claims = JSON.parse(base64UrlText(payload)) as {
      aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string;
    };
    if (head.alg !== 'RS256' || !head.kid) return false;
    const jwk = (await accessKeys(domain, head.kid)).find((key) => key.kid === head.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, base64UrlBytes(signature), new TextEncoder().encode(`${header}.${payload}`),
    );
    const now = Date.now() / 1000;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    return valid
      && audiences.includes(env.ACCESS_AUD)
      && claims.iss === domain
      && typeof claims.exp === 'number' && claims.exp > now
      && (claims.nbf ?? 0) <= now + 60
      && claims.email?.toLowerCase() === env.ALLOWED_EMAIL.toLowerCase();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return false;
  }
}

function base64UrlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function base64UrlText(value: string): string {
  return new TextDecoder().decode(base64UrlBytes(value));
}
