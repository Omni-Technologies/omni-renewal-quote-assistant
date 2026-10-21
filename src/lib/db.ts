import Dexie, { type Table } from 'dexie';
import type {
  BackupFile,
  DtoolsDataset,
  DtoolsProjectDecision,
  DtoolsRow,
  JobCostDataset,
  JobCostRecord,
  Renewal,
} from '../types';
import { normalizeRenewal, validateBackupRenewal } from './model';
import { parseDurationHours, parseWorkDate, refreshDtoolsHistory } from './dtools';

export class OmniDatabase extends Dexie {
  renewals!: Table<Renewal, string>;
  dtoolsDatasets!: Table<DtoolsDataset, string>;
  dtoolsRows!: Table<DtoolsRow, string>;
  dtoolsDecisions!: Table<DtoolsProjectDecision, string>;
  jobCostDatasets!: Table<JobCostDataset, string>;
  jobCostProjects!: Table<JobCostRecord, string>;

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
    this.version(3).stores({
      jobCostDatasets: 'id, importedAt',
      jobCostProjects: 'id, datasetId, projectNumber',
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

/* ------------------------------------------------------------------------- */
/* D-Tools project job cost                                                  */
/* ------------------------------------------------------------------------- */

export interface JobCostStoreSnapshot {
  dataset: JobCostDataset;
  projects: JobCostRecord[];
}

export async function loadJobCost(): Promise<JobCostStoreSnapshot | null> {
  return db.transaction('r', db.jobCostDatasets, db.jobCostProjects, async () => {
    const dataset = await db.jobCostDatasets.orderBy('importedAt').last();
    if (!dataset) return null;
    const projects = await db.jobCostProjects.where('datasetId').equals(dataset.id).toArray();
    return { dataset, projects };
  });
}

/**
 * Replaces the job-cost dataset atomically. Timesheet history, decisions and
 * renewals are untouched.
 */
export async function replaceJobCost(
  dataset: JobCostDataset,
  projects: readonly JobCostRecord[],
): Promise<void> {
  if (
    projects.length === 0 ||
    projects.length !== dataset.projectCount ||
    projects.some((project) => project.datasetId !== dataset.id)
  ) {
    throw new Error('The job-cost import has no projects or contains projects from another import.');
  }
  await db.transaction('rw', db.jobCostDatasets, db.jobCostProjects, async () => {
    await db.jobCostProjects.clear();
    await db.jobCostDatasets.clear();
    await db.jobCostDatasets.put(dataset);
    await db.jobCostProjects.bulkPut([...projects]);
  });
}

export function buildBackup(
  renewals: readonly Renewal[],
  dtools: BackupFile['dtools'] = { dataset: null, rows: [], decisions: [] },
  jobCost: NonNullable<BackupFile['jobCost']> = { dataset: null, projects: [] },
): BackupFile {
  return {
    format: 'omni-renewal-quote-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'OMNI Renewal Quote Assistant',
    renewals: [...renewals],
    dtools,
    jobCost,
  };
}

export async function exportBackupData(): Promise<BackupFile> {
  await pendingDecisionWrite;
  return db.transaction('r', [
    db.renewals, db.dtoolsDatasets, db.dtoolsRows, db.dtoolsDecisions, db.jobCostDatasets, db.jobCostProjects,
  ], async () => {
    const [renewals, datasets, rows, decisions, jobCostDatasets, jobCostProjects] = await Promise.all([
      listRenewals(),
      db.dtoolsDatasets.toArray(),
      db.dtoolsRows.toArray(),
      db.dtoolsDecisions.toArray(),
      db.jobCostDatasets.toArray(),
      db.jobCostProjects.toArray(),
    ]);
    const dataset = datasets.sort((a, b) => b.importedAt - a.importedAt)[0] ?? null;
    const refreshed = dataset ? refreshDtoolsHistory(dataset, rows.filter((row) => row.datasetId === dataset.id)) : null;
    const jobCostDataset = jobCostDatasets.sort((a, b) => b.importedAt - a.importedAt)[0] ?? null;
    return buildBackup(renewals, {
      dataset: refreshed?.dataset ?? null,
      rows: refreshed?.rows ?? [],
      decisions,
    }, {
      dataset: jobCostDataset,
      projects: jobCostDataset
        ? jobCostProjects.filter((project) => project.datasetId === jobCostDataset.id)
        : [],
    });
  });
}

/**
 * Renewals are merged by id. Timesheet history is replaced only when the
 * backup carries it, and job cost likewise, so restoring an older backup never
 * erases data it did not contain.
 */
export async function restoreBackupData(
  backup: Extract<BackupParseResult, { ok: true }>,
): Promise<void> {
  await pendingDecisionWrite;
  await db.transaction('rw', [
    db.renewals, db.dtoolsDatasets, db.dtoolsRows, db.dtoolsDecisions, db.jobCostDatasets, db.jobCostProjects,
  ], async () => {
    for (const renewal of backup.renewals) {
      await db.renewals.put(renewal);
    }
    if (backup.dtools) {
      const { dataset, rows, decisions } = backup.dtools;
      await db.dtoolsRows.clear();
      await db.dtoolsDatasets.clear();
      await db.dtoolsDecisions.clear();
      if (dataset) await db.dtoolsDatasets.put(dataset);
      if (rows.length) await db.dtoolsRows.bulkPut(rows);
      if (decisions.length) await db.dtoolsDecisions.bulkPut(decisions);
    }
    if (backup.jobCost) {
      const { dataset, projects } = backup.jobCost;
      await db.jobCostProjects.clear();
      await db.jobCostDatasets.clear();
      if (dataset) await db.jobCostDatasets.put(dataset);
      if (projects.length) await db.jobCostProjects.bulkPut(projects);
    }
  });
}

export type BackupParseResult =
  | {
      ok: true;
      renewals: Renewal[];
      skipped: number;
      exportedAt: string | null;
      dtools: BackupFile['dtools'] | null;
      /** Null when the backup predates job-cost import. */
      jobCost: NonNullable<BackupFile['jobCost']> | null;
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

function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function parseBackupJobCost(raw: unknown): NonNullable<BackupFile['jobCost']> | false {
  if (!isRecord(raw) || !Array.isArray(raw.projects)) return false;
  const dataset = raw.dataset;
  if (dataset === null) return raw.projects.length === 0 ? { dataset: null, projects: [] } : false;
  if (
    !isRecord(dataset) ||
    !hasFields(dataset, ['id'], ['importedAt', 'projectCount']) ||
    !(dataset.id as string).trim() ||
    dataset.projectCount !== raw.projects.length ||
    raw.projects.length === 0 ||
    !Array.isArray(dataset.files) ||
    dataset.files.length === 0 ||
    dataset.files.some((file: unknown) =>
      !isRecord(file) || !hasFields(file, ['fileName', 'sheetName', 'fingerprint'], ['projectCount']))
  ) return false;
  const ids = new Set<string>();
  for (const project of raw.projects) {
    if (!isRecord(project) || !hasFields(project, [
      'id', 'datasetId', 'sourceFile', 'sourceSheet', 'clientName', 'projectName', 'projectNumber',
      'status', 'state', 'projectManager', 'resources',
    ], ['sourceRow', 'budgetedHours', 'actualHours'], ['sharedPhaseBlock']) ||
      project.datasetId !== dataset.id ||
      !(project.id as string).trim() || ids.has(project.id as string) ||
      !(project.projectNumber as string).trim() || !(project.projectName as string).trim() ||
      !isNullableNumber(project.budgetedLaborCost) || !isNullableNumber(project.actualLaborCost) ||
      (project.startDate !== null && (
        typeof project.startDate !== 'string' || parseWorkDate(project.startDate)?.iso !== project.startDate
      )) ||
      !Array.isArray(project.phases) ||
      project.phases.some((phase: unknown) =>
        !isRecord(phase) || !hasFields(phase, ['name'], ['budgetedHours', 'actualHours']) ||
        !isNullableNumber(phase.budgetedLaborCost) || !isNullableNumber(phase.budgetedProductCost))
    ) return false;
    ids.add(project.id as string);
  }
  return raw as unknown as NonNullable<BackupFile['jobCost']>;
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

  const envelope = parsed as {
    renewals?: unknown; exportedAt?: unknown; version?: unknown; dtools?: unknown; jobCost?: unknown;
  };
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
  const jobCost = envelope.version === 2 && envelope.jobCost !== undefined
    ? parseBackupJobCost(envelope.jobCost)
    : null;
  if (jobCost === false) {
    return { ok: false, error: 'The backup contains invalid D-Tools job-cost history.' };
  }

  return {
    ok: true,
    renewals,
    skipped,
    dtools,
    // A backup made before any job-cost import must not wipe a later import.
    jobCost: jobCost?.dataset ? jobCost : null,
    exportedAt:
      typeof envelope.exportedAt === 'string' ? envelope.exportedAt : null,
  };
}
