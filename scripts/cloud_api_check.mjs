import assert from 'node:assert/strict';

// Synthetic data against a local `wrangler dev` database only (empty D1 on start).
// API_URL defaults to http://127.0.0.1:8799. Set EXPECT_LOCKED=1 to check that
// a server without the local-dev bypass refuses every API request.
const base = (process.env.API_URL || 'http://127.0.0.1:8799').replace(/\/$/, '');
async function call(path, method = 'GET', body) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  });
  const text = await response.text();
  return { status: response.status, body: text ? (response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text) : null };
}

// Against the hosted site, Cloudflare Access answers first with a 302 to its login page.
if (process.env.EXPECT_LOCKED) {
  const behindAccess = !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base);
  for (const [path, method] of [['renewals', 'GET'], ['history/jobcost', 'GET'], ['renewals/x', 'DELETE'], ['restore', 'POST']]) {
    const response = await fetch(`${base}/api/${path}`, {
      method,
      redirect: 'manual',
      body: method === 'POST' ? '{"renewals":[]}' : undefined,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
    });
    assert.equal(response.status, behindAccess ? 302 : 401, `${method} ${path} should be refused`);
  }
  const page = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(page.status, behindAccess ? 302 : 200);
  console.log('cloud_api_check (locked) passed');
  process.exit(0);
}
// The write checks leave synthetic history behind (there is no history delete),
// so they must never touch the real database. Wipe local D1 before the browser check.
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  throw new Error(`Refusing write checks against ${base}; only EXPECT_LOCKED=1 may target the hosted site.`);
}

const tag = `check-${Date.now()}`;
const renewal = (id, name, updatedAt = Date.now()) => ({ id: `${tag}-${id}`, updatedAt, company: { companyName: name } });

assert.equal((await call(`renewals/${tag}-a`, 'PUT', renewal('a', 'Alpha'))).status, 204);
assert.equal((await call('renewals', 'PUT', [renewal('b', 'Beta'), renewal('c', 'Gamma')])).status, 204);
assert.equal((await call(`renewals/${tag}-a`, 'PUT', renewal('a', 'Alpha edited'))).status, 204);
assert.equal((await call(`renewals/${tag}-c`, 'DELETE')).status, 204);
assert.equal((await call(`renewals/${tag}-a`, 'PUT', renewal('zzz', 'Mismatch'))).status, 400);
const formPost = await fetch(`${base}/api/restore`, { method: 'POST', body: '{"renewals":[]}', headers: { 'content-type': 'text/plain' } });
assert.equal(formPost.status, 415, 'non-JSON writes (cross-site forms) must be refused');
const names = async () => (await call('renewals')).body
  .filter((row) => row.id.startsWith(tag)).map((row) => row.company.companyName).sort();
assert.deepEqual(await names(), ['Alpha edited', 'Beta']);

const decisionKey = `${tag}/client|site #1`;
assert.equal((await call(`decisions/${encodeURIComponent(decisionKey)}`, 'PUT', { key: decisionKey, choice: 'keep' })).status, 204);
assert.ok((await call('decisions')).body.some((row) => row.key === decisionKey));

// ~6 MB of rows forces several chunks, like the real timesheet export.
const rows = Array.from({ length: 15000 }, (_, i) => ({ id: `r${i}`, datasetId: 'ds1', note: 'x'.repeat(380) }));
assert.equal((await call('history/dtools', 'PUT', { dataset: { id: 'ds1', importedAt: 1 }, items: rows })).status, 204);
let dtools = (await call('history/dtools')).body;
assert.equal(dtools.dataset.id, 'ds1');
assert.equal(dtools.items.length, rows.length);
assert.equal(dtools.items.at(-1).id, 'r14999');
const smaller = rows.slice(0, 10).map((row) => ({ ...row, datasetId: 'ds2' }));
assert.equal((await call('history/dtools', 'PUT', { dataset: { id: 'ds2', importedAt: 2 }, items: smaller })).status, 204);
dtools = (await call('history/dtools')).body;
assert.equal(dtools.dataset.id, 'ds2');
assert.equal(dtools.items.length, 10, 'replacing history must not leave old chunks behind');
assert.equal((await call('history/jobcost')).body, null);

// Restore merges: Alpha and Beta exist (kept, unchanged), Delta is new.
const summary = (await call('restore', 'POST', {
  renewals: [renewal('a', 'Alpha from backup'), renewal('b', 'Beta from backup'), renewal('d', 'Delta')],
  dtools: { dataset: { id: 'old', importedAt: 0 }, rows: [{ id: 'old1', datasetId: 'old' }], decisions: [
    { key: decisionKey, choice: 'from backup' }, { key: `${tag}-new`, choice: 'new' },
  ] },
  jobCost: { dataset: { id: 'jc1', importedAt: 1, projectCount: 1 }, projects: [{ id: 'p1', datasetId: 'jc1' }] },
})).body;
assert.deepEqual(summary, {
  added: 1, kept: 2, firstAddedId: `${tag}-d`, dtoolsAdded: false, jobCostAdded: true, decisionsAdded: 1,
});
assert.deepEqual(await names(), ['Alpha edited', 'Beta', 'Delta']);
assert.equal((await call('history/dtools')).body.dataset.id, 'ds2');
assert.equal((await call('decisions')).body.find((row) => row.key === decisionKey).choice, 'keep');
assert.equal((await call('history/jobcost')).body.items[0].id, 'p1');

for (const id of ['a', 'b', 'd']) await call(`renewals/${tag}-${id}`, 'DELETE');
await call(`decisions/${encodeURIComponent(decisionKey)}`, 'DELETE');
await call(`decisions/${encodeURIComponent(`${tag}-new`)}`, 'DELETE');
assert.deepEqual(await names(), []);
console.log('cloud_api_check passed');
