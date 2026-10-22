import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { JobCostDataset, JobCostRecord } from '../types';
import {
  buildBackup,
  db,
  exportBackupData,
  loadJobCost,
  parseBackupJson,
  replaceJobCost,
  restoreBackupData,
} from './db';
import { makeRenewal } from './testHelpers';

function record(datasetId: string, overrides: Partial<JobCostRecord> = {}): JobCostRecord {
  return {
    id: `${datasetId}:0:3`,
    datasetId,
    sourceFile: 'job-cost.xlsx',
    sourceSheet: 'Sheet1',
    sourceRow: 3,
    clientName: 'Example Client',
    projectName: 'I&T - FA Example Building Annual Fire Alarm Inspection 2025',
    projectNumber: '25-1000',
    status: 'Completed',
    state: '',
    startDate: '2025-05-01',
    budgetedHours: 14,
    actualHours: 16.5,
    budgetedLaborCost: 1260,
    actualLaborCost: null,
    projectManager: 'PM',
    resources: 'Inspector 1',
    phases: [{ name: 'Travel', budgetedHours: 2, actualHours: 1.5, budgetedLaborCost: 180, budgetedProductCost: null }],
    sharedPhaseBlock: false,
    ...overrides,
  };
}

function dataset(id: string): JobCostDataset {
  return {
    id,
    importedAt: 1_700_000_000_000,
    projectCount: 1,
    files: [{ fileName: 'job-cost.xlsx', sheetName: 'Sheet1', fingerprint: id, projectCount: 1 }],
  };
}

function renewal(id: string, companyName: string, updatedAt = 1_700_000_000_000) {
  const base = makeRenewal();
  return { ...base, id, updatedAt, company: { ...base.company, companyName } };
}

beforeEach(async () => {
  await db.renewals.clear();
  await db.jobCostDatasets.clear();
  await db.jobCostProjects.clear();
});

describe('job-cost persistence', () => {
  it('replaces the previous import instead of adding to it', async () => {
    await replaceJobCost(dataset('jc-1'), [record('jc-1')]);
    await replaceJobCost(dataset('jc-2'), [record('jc-2', { actualHours: 18 })]);
    const loaded = await loadJobCost();
    expect(loaded?.dataset.id).toBe('jc-2');
    expect(loaded?.projects.map((project) => project.actualHours)).toEqual([18]);
  });

  it('round-trips job-cost history through a backup', async () => {
    await db.renewals.put(makeRenewal());
    await replaceJobCost(dataset('jc-1'), [record('jc-1')]);
    const parsed = parseBackupJson(JSON.stringify(await exportBackupData()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.jobCost?.projects).toHaveLength(1);
    await db.jobCostProjects.clear();
    await db.jobCostDatasets.clear();
    await restoreBackupData(parsed);
    expect(await loadJobCost()).toEqual({ dataset: dataset('jc-1'), projects: [record('jc-1')] });
  });

  it('keeps current job-cost history when restoring an older backup without it', async () => {
    await replaceJobCost(dataset('jc-1'), [record('jc-1')]);
    const older: Record<string, unknown> = { ...buildBackup([makeRenewal()]) };
    delete older.jobCost;
    const parsed = parseBackupJson(JSON.stringify(older));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.jobCost).toBeNull();
    await restoreBackupData(parsed);
    expect((await loadJobCost())?.projects).toHaveLength(1);
  });

  it('keeps current job-cost history when the backup was made before any job-cost import', async () => {
    const parsed = parseBackupJson(JSON.stringify(await exportBackupData()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.jobCost).toBeNull();
    await replaceJobCost(dataset('jc-1'), [record('jc-1')]);
    await restoreBackupData(parsed);
    expect((await loadJobCost())?.projects).toHaveLength(1);
  });

  it('keeps the current browser job-cost history when the backup has older job cost', async () => {
    await replaceJobCost(dataset('jc-1'), [record('jc-1')]);
    const parsed = parseBackupJson(JSON.stringify(await exportBackupData()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await replaceJobCost(dataset('jc-2'), [record('jc-2', { actualHours: 18 })]);
    expect((await restoreBackupData(parsed)).jobCostAdded).toBe(false);
    expect(await loadJobCost()).toEqual({ dataset: dataset('jc-2'), projects: [record('jc-2', { actualHours: 18 })] });
    expect(await db.jobCostProjects.count()).toBe(1);
  });

  it('adds only missing renewals and never overwrites or removes ones made here', async () => {
    const shared = renewal('shared', 'Old Co', 1);
    const onlyInBackup = renewal('backup-only', 'Backup Co');
    const parsed = parseBackupJson(JSON.stringify(buildBackup([shared, onlyInBackup])));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const edited = renewal('shared', 'Edited Here', 5);
    const madeHere = renewal('made-here', 'New Here');
    await db.renewals.bulkPut([edited, madeHere]);
    expect(await restoreBackupData(parsed)).toMatchObject({ added: 1, kept: 1, firstAddedId: 'backup-only' });
    expect(await db.renewals.get('shared')).toEqual(edited);
    expect(await db.renewals.get('made-here')).toEqual(madeHere);
    expect((await db.renewals.get('backup-only'))?.company.companyName).toBe('Backup Co');
    expect(await db.renewals.count()).toBe(3);
  });

  it('rejects a backup with malformed job-cost rows', async () => {
    await replaceJobCost(dataset('jc-1'), [record('jc-1')]);
    const backup = buildBackup([makeRenewal()], undefined, {
      dataset: dataset('jc-2'),
      projects: [{ ...record('jc-2'), actualHours: 'lots' as unknown as number }],
    });
    const parsed = parseBackupJson(JSON.stringify(backup));
    expect(parsed).toEqual({ ok: false, error: 'The backup contains invalid D-Tools job-cost history.' });
    expect((await loadJobCost())?.dataset.id).toBe('jc-1');
  });
});
