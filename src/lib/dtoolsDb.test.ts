import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DtoolsProjectDecision } from '../types';
import { buildProjects, defaultDecision, parseDtoolsTable } from './dtools';
import {
  db,
  exportBackupData,
  loadDtoolsHistory,
  parseBackupJson,
  replaceDtoolsHistory,
  resetDtoolsDecision,
  restoreBackupData,
  saveDtoolsDecision,
} from './db';

const HEADER = [
  'Approved',
  'Entity',
  'Date',
  'Resource',
  'Resource Email',
  'Client Name',
  'Project Name',
  'Project Number',
  'Project Manager',
  'Name',
  'Number',
  'Duration',
  'Created On',
  'Updated On',
  'Updated By',
];

function makeRows(durations: string[]): unknown[][] {
  return durations.map((duration, index) => [
    'True',
    'Task',
    '5/1/2025',
    `Inspector ${index + 1}`,
    `i${index + 1}@example.com`,
    'Example Client',
    'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
    '25-1000',
    'Drew Cassidy',
    'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
    `7500${index}`,
    duration,
    '5/2/2025',
    '5/2/2025',
    `Inspector ${index + 1}`,
  ]);
}

function parse(datasetId: string, durations = ['8', '7.5', '1']) {
  return parseDtoolsTable({
    header: HEADER,
    rows: makeRows(durations),
    fileName: 'timesheet.csv',
    fileType: 'csv',
    sheetName: 'CSV',
    fingerprint: 'same-file-fingerprint',
    datasetId,
    importedAt: 1_700_000_000_000,
  });
}

beforeEach(async () => {
  await db.renewals.clear();
  await db.dtoolsDatasets.clear();
  await db.dtoolsRows.clear();
  await db.dtoolsDecisions.clear();
});

describe('D-Tools history persistence', () => {
  it('does not inflate totals when the same workbook is imported twice', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const afterFirst = await loadDtoolsHistory();
    expect(afterFirst?.rows).toHaveLength(3);
    expect(buildProjects(afterFirst?.rows ?? [])[0].totalHours).toBeCloseTo(16.5, 10);

    const second = parse('dataset-2');
    await replaceDtoolsHistory(second.dataset, second.rows);
    const afterSecond = await loadDtoolsHistory();
    expect(afterSecond?.dataset.id).toBe('dataset-2');
    expect(afterSecond?.rows).toHaveLength(3);
    expect(buildProjects(afterSecond?.rows ?? [])[0].totalHours).toBeCloseTo(16.5, 10);
  });

  it('reloads saved project decisions after an import replacement', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const [project] = buildProjects(first.rows);
    const saved: DtoolsProjectDecision = {
      ...defaultDecision(project),
      action: 'exclude',
      year: 2025,
      note: 'Verified against D-Tools',
      quotedHours: 18,
      updatedAt: 123,
    };
    await saveDtoolsDecision(saved);

    const second = parse('dataset-2');
    await replaceDtoolsHistory(second.dataset, second.rows);
    const snapshot = await loadDtoolsHistory();
    expect(snapshot?.decisions).toEqual([saved]);
    const [rebuilt] = buildProjects(
      snapshot?.rows ?? [],
      new Map((snapshot?.decisions ?? []).map((item) => [item.key, item])),
    );
    expect(rebuilt.decision.note).toBe('Verified against D-Tools');
    expect(rebuilt.included).toBe(false);

    await resetDtoolsDecision(saved.key);
    const reset = await loadDtoolsHistory();
    expect(reset?.decisions).toHaveLength(0);
  });

  it('keeps the last rapid manual decision change and includes it in a backup', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const decision = defaultDecision(buildProjects(first.rows)[0]);
    const firstWrite = saveDtoolsDecision({ ...decision, action: 'exclude', updatedAt: 1 });
    const secondWrite = saveDtoolsDecision({ ...decision, action: 'include', updatedAt: 2 });
    const backup = await exportBackupData();
    await Promise.all([firstWrite, secondWrite]);
    expect(backup.dtools.decisions).toEqual([{ ...decision, action: 'include', updatedAt: 2 }]);
  });

  it('leaves existing history intact when a malformed file is rejected before writing', async () => {
    const good = parse('dataset-1');
    await replaceDtoolsHistory(good.dataset, good.rows);

    expect(() =>
      parseDtoolsTable({
        header: ['Approved', 'Date'],
        rows: [['True', '5/1/2025']],
        fileName: 'bad.csv',
        fileType: 'csv',
        sheetName: 'CSV',
        fingerprint: 'bad',
        datasetId: 'bad-dataset',
        importedAt: 1,
      }),
    ).toThrow(/missing required D-Tools columns/);

    const snapshot = await loadDtoolsHistory();
    expect(snapshot?.dataset.id).toBe('dataset-1');
    expect(snapshot?.rows).toHaveLength(3);
  });

  it('rejects an empty replacement without erasing the active history', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    await expect(replaceDtoolsHistory(parse('dataset-2', []).dataset, [])).rejects.toThrow(/no usable rows/);
    expect((await loadDtoolsHistory())?.dataset.id).toBe('dataset-1');
  });

  it('keeps incomplete-project review warnings when cached rows are reclassified', async () => {
    const imported = parse('dataset-incomplete', ['8', 'bad duration']);
    expect(imported.dataset.rejectedRows).toBe(1);
    await replaceDtoolsHistory(imported.dataset, imported.rows);
    const refreshed = await loadDtoolsHistory();
    expect(refreshed?.rows[0].classification).toBe('review');
    expect(refreshed?.rows[0].includedByDefault).toBe(false);
    expect(refreshed?.rows[0].reasons).toContain('Some source rows for this project were rejected; confirm scope and repair the export before using this incomplete total.');
    expect(refreshed?.dataset.reviewCount).toBe(1);
    expect(refreshed?.dataset.rejectedRows).toBe(1);
  });

  it.each([
    ['project name', 6],
    ['client name', 5],
  ])('marks a sibling project incomplete when a source row lacks %s', (_name, column) => {
    const sourceRows = makeRows(['8', '7']);
    sourceRows[1][column] = '';
    const imported = parseDtoolsTable({
      header: HEADER, rows: sourceRows, fileName: 'timesheet.csv', fileType: 'csv',
      sheetName: 'CSV', fingerprint: 'incomplete', datasetId: 'dataset-incomplete',
      importedAt: 1_700_000_000_000,
    });
    expect(imported.invalidRows).toHaveLength(1);
    expect(imported.rows[0].classification).toBe('review');
    expect(imported.rows[0].reasons.join(' ')).toMatch(/source rows.*rejected/);
  });

  it('rolls back a replacement when an IndexedDB row write fails', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const second = parse('dataset-2');
    const badRow = { ...second.rows[0], reasons: [() => 'cannot clone'] } as unknown as typeof second.rows[number];
    await expect(replaceDtoolsHistory(second.dataset, [badRow])).rejects.toThrow();
    expect((await loadDtoolsHistory())?.dataset.id).toBe('dataset-1');
    expect((await loadDtoolsHistory())?.rows).toEqual(first.rows);
  });

  it('backs up and restores history and manual decisions with renewals', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const decision = { ...defaultDecision(buildProjects(first.rows)[0]), action: 'exclude' as const, note: 'Manual review', updatedAt: 123 };
    await saveDtoolsDecision(decision);
    const parsed = parseBackupJson(JSON.stringify(await exportBackupData()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.dtools?.rows).toHaveLength(3);
    await db.dtoolsRows.clear();
    await db.dtoolsDatasets.clear();
    await db.dtoolsDecisions.clear();
    await restoreBackupData(parsed);
    expect(await loadDtoolsHistory()).toEqual({ dataset: first.dataset, rows: first.rows, decisions: [decision] });
  });

  it('keeps the current browser timesheet history and decisions, adding only missing decisions', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const projects = buildProjects(first.rows);
    const kept = { ...defaultDecision(projects[0]), action: 'exclude' as const, note: 'Old', updatedAt: 1 };
    await saveDtoolsDecision(kept);
    const parsed = parseBackupJson(JSON.stringify(await exportBackupData()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.dtools) return;
    const newer = parse('dataset-2');
    await replaceDtoolsHistory(newer.dataset, newer.rows);
    const changed = { ...kept, action: 'include' as const, note: 'Changed here', updatedAt: 2 };
    await saveDtoolsDecision(changed);
    const missing = { ...defaultDecision(projects[0]), key: 'missing-key', updatedAt: 3 };
    parsed.dtools.decisions.push(missing);
    const summary = await restoreBackupData(parsed);
    expect(summary).toMatchObject({ dtoolsAdded: false, decisionsAdded: 1 });
    const loaded = await loadDtoolsHistory();
    expect(loaded?.dataset.id).toBe('dataset-2');
    expect(await db.dtoolsDatasets.count()).toBe(1);
    expect(loaded?.decisions.find((decision) => decision.key === kept.key)).toEqual(changed);
    expect(loaded?.decisions.find((decision) => decision.key === 'missing-key')).toEqual(missing);
  });

  it('rejects malformed D-Tools backup data before changing any saved data', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const backup = await exportBackupData();
    const damaged = structuredClone(backup);
    damaged.dtools.rows[0].duration = Number.NaN;
    const parsed = parseBackupJson(JSON.stringify(damaged));
    expect(parsed.ok).toBe(false);
    expect((await loadDtoolsHistory())?.rows).toEqual(first.rows);
  });

  it.each([
    ['date', 'not a date'],
    ['duration', -1],
    ['clientName', ''],
    ['projectName', ''],
    ['sourceRow', 1],
  ])('rejects a backup row with invalid %s without replacing history', async (field, value) => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const backup = structuredClone(await exportBackupData());
    (backup.dtools.rows[0] as unknown as Record<string, unknown>)[field as string] = value;
    expect(parseBackupJson(JSON.stringify(backup)).ok).toBe(false);
    expect((await loadDtoolsHistory())?.rows).toEqual(first.rows);
  });

  it('rejects a malformed saved average selection in a backup', async () => {
    const first = parse('dataset-1');
    await replaceDtoolsHistory(first.dataset, first.rows);
    const decision = { ...defaultDecision(buildProjects(first.rows)[0]), averageSelected: true };
    await saveDtoolsDecision(decision);
    const backup = await exportBackupData();
    const malformed = structuredClone(backup) as unknown as { dtools: { decisions: Array<Record<string, unknown>> } };
    malformed.dtools.decisions[0].averageSelected = 'yes';
    expect(parseBackupJson(JSON.stringify(malformed)).ok).toBe(false);
  });
});
