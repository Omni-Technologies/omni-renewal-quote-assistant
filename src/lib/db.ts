import Dexie, { type Table } from 'dexie';
import type {
  BackupFile,
  DtoolsDataset,
  DtoolsProjectDecision,
  DtoolsRow,
  Renewal,
} from '../types';
import { normalizeRenewal, validateBackupRenewal } from './model';
import { parseDurationHours, parseWorkDate, refreshDtoolsHistory } from './dtools';

export class OmniDatabase extends Dexie {
  renewals!: Table<Renewal, string>;
  dtoolsDatasets!: Table<DtoolsDataset, string>;
  dtoolsRows!: Table<DtoolsRow, string>;
  dtoolsDecisions!: Table<DtoolsProjectDecision, string>;

  constructor(name = 'omni-renewal-quote') {
    super(name);
    this.version(1).stores({
      renewals: 'id, updatedAt, status',
    });
    this.version(2).stores({
      dtoolsDatasets: 'id, importedAt, fingerprint',
      dtoolsRows: 'id, datasetId, projectKey, clientName, [datasetId+projectKey]',
      dtoolsDecisions: 'key, updatedAt',
    });
  }
}

/** All client data stays in this browser profile's IndexedDB. */
export const db = new OmniDatabase();
let pendingDecisionWrite: Promise<unknown> = Promise.resolve();

export async function listRenewals(): Promise<Renewal[]> {
  const rows = await db.renewals.toArray();
  return rows
    .map((row) => normalizeRenewal(row))
    .filter((row): row is Renewal => row !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveRenewal(renewal: Renewal): Promise<void> {
  await db.renewals.put(renewal);
}

export async function deleteRenewal(id: string): Promise<void> {
  await db.renewals.delete(id);
}

export async function replaceRenewals(renewals: readonly Renewal[]): Promise<void> {
  await db.transaction('rw', db.renewals, async () => {
    for (const renewal of renewals) {
      await db.renewals.put(renewal);
    }
  });
}

/* ------------------------------------------------------------------------- */
/* D-Tools timesheet history                                                 */
/* ------------------------------------------------------------------------- */

export interface DtoolsStoreSnapshot {
  dataset: DtoolsDataset;
  rows: DtoolsRow[];
  decisions: DtoolsProjectDecision[];
}

export async function loadDtoolsHistory(): Promise<DtoolsStoreSnapshot | null> {
  return db.transaction('r', db.dtoolsDatasets, db.dtoolsRows, db.dtoolsDecisions, async () => {
    const dataset = await db.dtoolsDatasets.orderBy('importedAt').last();
    if (!dataset) return null;
    const [rows, decisions] = await Promise.all([
      db.dtoolsRows.where('datasetId').equals(dataset.id).toArray(),
      db.dtoolsDecisions.toArray(),
    ]);
    const refreshed = refreshDtoolsHistory(dataset, rows);
    return { dataset: refreshed.dataset, rows: refreshed.rows, decisions };
  });
}

/**
 * Replaces the active dataset atomically. Saved renewals and manual project
 * decisions are deliberately untouched, and a re-import can never stack two
 * copies of the same workbook into one total.
 */
export async function replaceDtoolsHistory(
  dataset: DtoolsDataset,
  rows: readonly DtoolsRow[],
): Promise<void> {
  if (rows.length === 0 || rows.some((row) => row.datasetId !== dataset.id)) {
    throw new Error('The timesheet has no usable rows or contains rows from another import.');
  }
  await db.transaction(
    'rw',
    db.dtoolsDatasets,
    db.dtoolsRows,
    async () => {
      await db.dtoolsRows.clear();
      await db.dtoolsDatasets.clear();
      await db.dtoolsDatasets.put(dataset);
      await db.dtoolsRows.bulkPut([...rows]);
    },
  );
}

export async function saveDtoolsDecision(
  decision: DtoolsProjectDecision,
): Promise<void> {
  const write = pendingDecisionWrite.catch(() => {}).then(() => db.dtoolsDecisions.put(decision));
  pendingDecisionWrite = write;
  await write;
}

export async function resetDtoolsDecision(key: string): Promise<void> {
  const write = pendingDecisionWrite.catch(() => {}).then(() => db.dtoolsDecisions.delete(key));
  pendingDecisionWrite = write;
  await write;
}

export function buildBackup(
  renewals: readonly Renewal[],
  dtools: BackupFile['dtools'] = { dataset: null, rows: [], decisions: [] },
): BackupFile {
  return {
    format: 'omni-renewal-quote-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'OMNI Renewal Quote Assistant',
    renewals: [...renewals],
    dtools,
  };
}

export async function exportBackupData(): Promise<BackupFile> {
  await pendingDecisionWrite;
  return db.transaction('r', db.renewals, db.dtoolsDatasets, db.dtoolsRows, db.dtoolsDecisions, async () => {
    const [renewals, datasets, rows, decisions] = await Promise.all([
      listRenewals(),
      db.dtoolsDatasets.toArray(),
      db.dtoolsRows.toArray(),
      db.dtoolsDecisions.toArray(),
    ]);
    const dataset = datasets.sort((a, b) => b.importedAt - a.importedAt)[0] ?? null;
    const refreshed = dataset ? refreshDtoolsHistory(dataset, rows.filter((row) => row.datasetId === dataset.id)) : null;
    return buildBackup(renewals, {
      dataset: refreshed?.dataset ?? null,
      rows: refreshed?.rows ?? [],
      decisions,
    });
  });
}

export async function restoreBackupData(
  backup: Extract<BackupParseResult, { ok: true }>,
): Promise<void> {
  await pendingDecisionWrite;
  if (backup.dtools === null) {
    await replaceRenewals(backup.renewals);
    return;
  }
  const { dataset, rows, decisions } = backup.dtools;
  await db.transaction('rw', db.renewals, db.dtoolsDatasets, db.dtoolsRows, db.dtoolsDecisions, async () => {
    await db.renewals.bulkPut(backup.renewals);
    await db.dtoolsRows.clear();
    await db.dtoolsDatasets.clear();
    await db.dtoolsDecisions.clear();
    if (dataset) await db.dtoolsDatasets.put(dataset);
    if (rows.length) await db.dtoolsRows.bulkPut(rows);
    if (decisions.length) await db.dtoolsDecisions.bulkPut(decisions);
  });
}

export type BackupParseResult =
  | {
      ok: true;
      renewals: Renewal[];
      skipped: number;
      exportedAt: string | null;
      dtools: BackupFile['dtools'] | null;
    }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasFields(
  value: Record<string, unknown>,
  strings: readonly string[],
  numbers: readonly string[],
  booleans: readonly string[] = [],
): boolean {
  return strings.every((field) => typeof value[field] === 'string') &&
    numbers.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field])) &&
    booleans.every((field) => typeof value[field] === 'boolean');
}

function parseBackupDtools(raw: unknown): BackupFile['dtools'] | false {
  if (!isRecord(raw) || !Array.isArray(raw.rows) || !Array.isArray(raw.decisions)) return false;
  const dataset = raw.dataset;
  if (dataset !== null && (
    !isRecord(dataset) ||
    !hasFields(dataset, ['id', 'fileName', 'fileType', 'sheetName', 'fingerprint'], [
      'importedAt', 'totalRows', 'validRows', 'rejectedRows', 'unapprovedRows',
      'projectCount', 'annualCount', 'semiAnnualCount', 'excludedCount', 'reviewCount',
    ]) ||
    !['csv', 'xlsx'].includes(dataset.fileType as string) ||
    !(dataset.id as string).trim()
  )) return false;
  if ((dataset === null && raw.rows.length > 0) || (dataset !== null && (
    raw.rows.length === 0 || dataset.validRows !== raw.rows.length ||
    dataset.totalRows !== (dataset.validRows as number) + (dataset.rejectedRows as number)
  ))) return false;
  const ids = new Set<string>();
  const sourceRows = new Set<number>();
  for (const row of raw.rows) {
    if (!isRecord(row) || !hasFields(row, [
      'id', 'datasetId', 'entity', 'date', 'resource', 'resourceEmail', 'clientName',
      'projectName', 'projectNumber', 'projectManager', 'taskName', 'taskNumber',
      'createdOn', 'updatedOn', 'updatedBy', 'sourceFile', 'sourceSheet',
      'projectKey', 'siteKey', 'siteLabel',
    ], ['sourceRow', 'dateMs', 'duration'], ['approved', 'includedByDefault']) ||
      !Array.isArray(row.reasons) || row.reasons.some((reason: unknown) => typeof reason !== 'string') ||
      !['annual', 'semi-annual', 'excluded', 'review'].includes(row.classification as string) ||
      !['Annual', 'Semi-Annual', null].includes(row.frequency as string | null) ||
      !['title', 'work-dates', 'manual', null].includes(row.yearSource as string | null) ||
      (row.serviceYear !== null && (typeof row.serviceYear !== 'number' || !Number.isFinite(row.serviceYear))) ||
      (row.taskFlag !== null && typeof row.taskFlag !== 'string') ||
      row.datasetId !== (dataset as Record<string, unknown>).id ||
      !(row.clientName as string).trim() || !(row.projectName as string).trim() ||
      !Number.isInteger(row.sourceRow) || (row.sourceRow as number) < 2 ||
      sourceRows.has(row.sourceRow as number) ||
      row.id !== `${row.datasetId}:${row.sourceRow}` || ids.has(row.id as string) ||
      parseDurationHours(row.duration) === null ||
      parseWorkDate(row.date)?.iso !== row.date
    ) return false;
    ids.add(row.id as string);
    sourceRows.add(row.sourceRow as number);
  }
  const keys = new Set<string>();
  for (const decision of raw.decisions) {
    if (!isRecord(decision) || !hasFields(decision, [
      'key', 'projectNumber', 'projectName', 'note',
    ], ['updatedAt'], ['includeFlaggedEntries']) ||
      !['auto', 'include', 'exclude'].includes(decision.action as string) ||
      !['Annual', 'Semi-Annual', null].includes(decision.frequency as string | null) ||
      (decision.year !== null && (typeof decision.year !== 'number' || !Number.isFinite(decision.year))) ||
      (decision.quotedHours !== null && (typeof decision.quotedHours !== 'number' || !Number.isFinite(decision.quotedHours))) ||
      (decision.averageSelected !== undefined && typeof decision.averageSelected !== 'boolean') ||
      !(decision.key as string).trim() || keys.has(decision.key as string)
    ) return false;
    keys.add(decision.key as string);
  }
  if (dataset) {
    try {
      refreshDtoolsHistory(dataset as unknown as DtoolsDataset, raw.rows as DtoolsRow[]);
    } catch {
      return false;
    }
  }
  return raw as unknown as BackupFile['dtools'];
}

export function parseBackupJson(text: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    (parsed as { format?: unknown }).format !== 'omni-renewal-quote-backup'
  ) {
    return {
      ok: false,
      error: 'That file is not an OMNI Renewal Quote Assistant backup.',
    };
  }

  const envelope = parsed as { renewals?: unknown; exportedAt?: unknown; version?: unknown; dtools?: unknown };
  if (envelope.version !== 1 && envelope.version !== 2) {
    return { ok: false, error: `Unsupported backup version: ${String(envelope.version)}.` };
  }
  if (!Array.isArray(envelope.renewals)) {
    return { ok: false, error: 'The backup does not contain a renewal list.' };
  }

  const renewals: Renewal[] = [];
  let skipped = 0;
  for (const raw of envelope.renewals) {
    const validation = validateBackupRenewal(raw);
    if (validation.ok) renewals.push(validation.renewal);
    else skipped += 1;
  }

  if (renewals.length === 0 && envelope.renewals.length > 0 ||
      (renewals.length === 0 && envelope.version === 1)) {
    return { ok: false, error: 'The backup contains no valid renewal records.' };
  }

  const dtools = envelope.version === 2 ? parseBackupDtools(envelope.dtools) : null;
  if (dtools === false) {
    return { ok: false, error: 'The backup contains invalid D-Tools history or decisions.' };
  }

  return {
    ok: true,
    renewals,
    skipped,
    dtools,
    exportedAt:
      typeof envelope.exportedAt === 'string' ? envelope.exportedAt : null,
  };
}
