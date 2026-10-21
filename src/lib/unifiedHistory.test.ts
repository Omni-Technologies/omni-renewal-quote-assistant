import { describe, expect, it } from 'vitest';
import type { DtoolsProjectDecision, LaborImportSummary, Renewal } from '../types';
import {
  buildProjects,
  buildSiteSummaries,
  defaultDecision,
  defaultSelectedKeys,
  parseDtoolsTable,
  selectionSummary,
} from './dtools';
import { parseJobCostTable } from './jobCost';
import { validateBackupRenewal } from './model';
import { makeRenewal } from './testHelpers';
import { buildUnifiedHistory, occurrenceRows } from './unifiedHistory';

const PROJECT_HEADER = ['Client', 'Name', 'Number', 'Status', 'Start Date', 'Budgeted Hours', 'Actual Hours', 'Project Manager', 'Resources'];
const PHASE_HEADER = [null, 'Phase', 'Budgeted Hours', 'Actual Hours', 'Budgeted Labor Cost'];
const NAME = (year: number) => `I&T - FA Example Building Annual Fire Alarm Inspection ${year}`;
const SERVICE = 'Example Building Panel Replacement';

function jobCostRecords() {
  return parseJobCostTable({
    table: [
      ['Project Job Cost (By Phase)'],
      PROJECT_HEADER,
      ['Example Client', NAME(2025), '25-1000', 'Completed', '5/1/2025', 14, 16.5, 'PM', 'Inspector 1'],
      [],
      PHASE_HEADER,
      [null, 'Labor', 12, 15, 1080],
      [null, 'Travel', 2, 1.5, 180],
      [null, 'Total:'],
      [null, null, 14, 16.5, 1260],
      PROJECT_HEADER,
      ['Example Client', NAME(2026), '26-1000', 'Completed', '3/2/2026', 15, 18, 'PM', ''],
      ['Example Client', NAME(2024), '24-1000', 'Completed', '4/1/2024', 13, 12, 'PM', ''],
      ['Example Client', NAME(2023), '23-1000', 'Completed', '4/1/2023', 13, 11, 'PM', ''],
      ['Example Client', NAME(2022), '22-1000', 'Active', '4/1/2022', 13, 0, 'PM', ''],
      ['Example Client', SERVICE, '24-2000', 'Completed', '6/1/2024', 8, 8, 'PM', ''],
      [],
      PHASE_HEADER,
      [null, 'Travel', 4, 3, 360],
      [null, 'Total:'],
      [null, null, 62, 49, 2520],
      ['Grand Total:', null, null, null, null, 76, 65.5],
    ],
    fileName: 'job-cost.xlsx',
    sheetName: 'Sheet1',
    datasetId: 'jc-1',
    fileIndex: 0,
  }).records;
}

const TIMESHEET_HEADER = [
  'Approved', 'Entity', 'Date', 'Resource', 'Resource Email', 'Client Name', 'Project Name', 'Project Number',
  'Project Manager', 'Name', 'Number', 'Duration', 'Created On', 'Updated On', 'Updated By',
];

const TIMESHEET_ROWS = [
  { year: 2025, number: '25-1000', hours: '9' },
  { year: 2025, number: '25-1000', hours: '7.5' },
  { year: 2026, number: '26-1000', hours: '17' },
];

function timesheet(
  decisions: ReadonlyMap<string, DtoolsProjectDecision> = new Map(),
  entries: { year: number; number: string; hours: string; name?: string }[] = TIMESHEET_ROWS,
) {
  const rows = entries.map((entry, index) => [
    'True', 'Task', `5/1/${entry.year}`, `Inspector ${index + 1}`, `i${index + 1}@example.com`, 'Example Client',
    entry.name ?? NAME(entry.year), entry.number, 'PM', entry.name ?? NAME(entry.year), `7500${index}`, entry.hours, `5/2/${entry.year}`,
    `5/2/${entry.year}`, `Inspector ${index + 1}`,
  ]);
  const parsed = parseDtoolsTable({
    header: TIMESHEET_HEADER,
    rows,
    fileName: 'timesheet.csv',
    fileType: 'csv',
    sheetName: 'CSV',
    fingerprint: 'timesheet',
    datasetId: 'ts-1',
    importedAt: 1_700_000_000_000,
  });
  return buildProjects(parsed.rows, decisions);
}

function withSummary(projects: LaborImportSummary['projects']): Renewal {
  const base = makeRenewal();
  return {
    ...base,
    labor: {
      ...base.labor,
      source: 'imported',
      importSummary: {
        datasetId: 'ts-1',
        fileName: 'job-cost.xlsx + timesheet.csv',
        importedAt: 1_700_000_000_000,
        clientName: 'Example Client',
        siteLabel: 'Example Building',
        frequency: 'Annual',
        basis: 'Annual inspection totals · D-Tools job-cost actual hours',
        projects,
      },
    },
  };
}

describe('unified inspection history', () => {
  it('counts job-cost actual hours for every year, keeping timesheet hours as a cross-check', () => {
    const history = buildUnifiedHistory(timesheet(), jobCostRecords(), new Map());
    const numbers = history.projects.map((project) => project.projectNumber).sort();
    expect(numbers).toEqual(['22-1000', '23-1000', '24-1000', '25-1000', '26-1000']);
    const bySource = Object.fromEntries(history.projects.map((project) => [project.projectNumber, project.source ?? 'timesheet']));
    expect(bySource).toMatchObject({ '25-1000': 'job-cost', '26-1000': 'job-cost', '24-1000': 'job-cost', '23-1000': 'job-cost' });
    const linked = history.projects.find((project) => project.projectNumber === '25-1000');
    expect(linked).toMatchObject({ totalHours: 16.5, timesheetHours: 16.5 });
    expect(linked?.entries).toHaveLength(2);
    const differs = history.projects.find((project) => project.projectNumber === '26-1000');
    expect(differs).toMatchObject({ totalHours: 18, timesheetHours: 17 });
    expect(differs?.reasons.join(' ')).toContain('Timesheet counts 17');
    expect(history.jobCostByKey.get(linked!.key)?.record.budgetedHours).toBe(14);
  });

  it('keeps every occurrence on one site and selects the three most recent years by default', () => {
    const history = buildUnifiedHistory(timesheet(), jobCostRecords(), new Map());
    const sites = buildSiteSummaries(history.projects);
    expect(sites).toHaveLength(1);
    expect(sites[0].years).toEqual([2026, 2025, 2024, 2023]);
    const selected = defaultSelectedKeys(history.projects, 'Annual');
    const years = history.projects
      .filter((project) => selected.includes(project.key))
      .map((project) => project.effectiveYear)
      .sort();
    expect(years).toEqual([2024, 2025, 2026]);
    const older = history.projects.find((project) => project.projectNumber === '23-1000');
    expect(older).toMatchObject({ included: true, effectiveYear: 2023, totalHours: 11, entryCount: 0, entries: [] });
  });

  it('never counts a job-cost row with no actual hours and skips unrelated work', () => {
    const history = buildUnifiedHistory(timesheet(), jobCostRecords(), new Map());
    const empty = history.projects.find((project) => project.projectNumber === '22-1000');
    expect(empty).toMatchObject({ included: false, needsReview: true });
    expect(history.projects.some((project) => project.projectNumber === '24-2000')).toBe(false);
  });

  it('includes unrelated job-cost work only after a manual include', () => {
    const records = jobCostRecords();
    const service = buildUnifiedHistory(null, records, new Map()).jobCost.find((project) => project.record.projectNumber === '24-2000')!;
    const decision: DtoolsProjectDecision = {
      ...defaultDecision({ key: service.key, projectNumber: '24-2000', projectName: SERVICE }),
      action: 'include',
      updatedAt: 1,
    };
    const history = buildUnifiedHistory(timesheet(), records, new Map([[service.key, decision]]));
    expect(history.projects.find((project) => project.projectNumber === '24-2000')?.decision.action).toBe('include');
  });

  it('keeps an unlinked job-cost title that shares a timesheet project number visible but uncounted', () => {
    const records = jobCostRecords();
    const renamed = { ...records.find((record) => record.projectNumber === '25-1000')!, id: 'renamed', projectName: `${NAME(2025)} Rev` };
    const history = buildUnifiedHistory(timesheet(), [...records, renamed], new Map());
    const shared = history.projects.filter((project) => project.projectNumber === '25-1000');
    expect(shared).toHaveLength(2);
    expect(shared.find((project) => project.timesheetHours === undefined)).toMatchObject({ included: false, needsReview: true });
    expect(shared.find((project) => project.timesheetHours !== undefined)).toMatchObject({ included: true, totalHours: 16.5 });
  });

  it('counts a shared job-cost record once when several timesheet titles share its number', () => {
    const entries = [
      { year: 2026, number: '26-1000', hours: '9', name: `${NAME(2026)} Part A` },
      { year: 2026, number: '26-1000', hours: '8', name: `${NAME(2026)} Part B` },
    ];
    // Shared-number titles start unchecked; include both by hand, as a user could.
    const decisions = new Map(timesheet(new Map(), entries).map((project) => [project.key, {
      ...defaultDecision({ key: project.key, projectNumber: project.projectNumber, projectName: project.projectName }),
      action: 'include' as const,
      updatedAt: 1,
    }]));
    const history = buildUnifiedHistory(timesheet(decisions, entries), jobCostRecords(), decisions);
    const shared = history.projects.filter((project) => project.projectNumber === '26-1000');
    expect(shared.filter((project) => project.included)).toHaveLength(2);
    const counted = shared.filter((project) => project.included).reduce((hours, project) => hours + project.totalHours, 0);
    expect(counted).toBe(17);
    expect(shared.every((project) => project.source !== 'job-cost' || project.timesheetHours === undefined)).toBe(true);
    expect(shared.find((project) => project.timesheetHours === undefined && project.source === 'job-cost'))
      .toMatchObject({ included: false, needsReview: true, totalHours: 18 });
  });

  it('fills in from the timesheet when the linked job-cost record has no actual hours yet', () => {
    const records = jobCostRecords().map((record) =>
      record.projectNumber === '26-1000' ? { ...record, actualHours: 0 } : record,
    );
    const history = buildUnifiedHistory(timesheet(), records, new Map());
    const project = history.projects.find((candidate) => candidate.projectNumber === '26-1000');
    expect(project).toMatchObject({ totalHours: 17, included: true });
    expect(project?.source ?? 'timesheet').toBe('timesheet');
    expect(occurrenceRows(history).find((row) => row.projectNumber === '26-1000')).toMatchObject({
      hoursSource: 'timesheet',
      hours: 17,
      difference: null,
      timesheetVerified: false,
    });
  });

  it('builds the history from job cost alone when no timesheet export is loaded', () => {
    const history = buildUnifiedHistory(null, jobCostRecords(), new Map());
    expect(history.projects.every((project) => project.source === 'job-cost')).toBe(true);
    expect(history.projects.map((project) => project.projectNumber).sort()).toEqual([
      '22-1000', '23-1000', '24-1000', '25-1000', '26-1000',
    ]);
  });

  it('applies job-cost-only occurrences as a backup-valid summary without source rows', () => {
    const history = buildUnifiedHistory(timesheet(), jobCostRecords(), new Map());
    const keys = new Set(history.projects.filter((project) => project.included).map((project) => project.key));
    const picked = selectionSummary(history.projects, keys, 'Annual');
    const jobCostOnly = picked.find((project) => project.projectNumber === '24-1000');
    expect(jobCostOnly).toMatchObject({ hours: 12, entryCount: 0 });
    expect(jobCostOnly).not.toHaveProperty('entries');
    const linked = picked.find((project) => project.projectNumber === '25-1000');
    expect(linked).toMatchObject({ hours: 16.5, entryCount: 0, hoursSource: 'job-cost', timesheetHours: 16.5 });
    expect(linked).not.toHaveProperty('entries');
    const renewal = withSummary(picked);
    const restored = validateBackupRenewal(JSON.parse(JSON.stringify(renewal)));
    expect(restored).toMatchObject({ ok: true });
    const restoredLinked = restored.ok
      ? restored.renewal.labor.importSummary?.projects.find((project) => project.projectNumber === '25-1000')
      : undefined;
    expect(restoredLinked).toMatchObject({ hoursSource: 'job-cost', timesheetHours: 16.5 });
  });

  it('rejects a backup summary that mixes job-cost hours with timesheet rows', () => {
    const history = buildUnifiedHistory(timesheet(), jobCostRecords(), new Map());
    const timesheetOnly = selectionSummary(timesheet(), new Set(timesheet().map((project) => project.key)), 'Annual')
      .filter((project) => project.projectNumber === '25-1000');
    const linked = selectionSummary(history.projects, new Set([history.projects.find((p) => p.projectNumber === '25-1000')!.key]), 'Annual')[0];
    const mixed = { ...linked, entries: timesheetOnly[0].entries };
    expect(validateBackupRenewal(JSON.parse(JSON.stringify(withSummary([mixed]))))).toMatchObject({ ok: false });
    expect(validateBackupRenewal(JSON.parse(JSON.stringify(withSummary([timesheetOnly[0]]))))).toMatchObject({ ok: true });
  });

  it('flattens occurrences with budgeted and actual hours for spreadsheet exports', () => {
    const history = buildUnifiedHistory(timesheet(), jobCostRecords(), new Map());
    const rows = Object.fromEntries(occurrenceRows(history).map((row) => [row.projectNumber, row]));
    expect(rows['25-1000']).toMatchObject({
      source: 'both',
      hours: 16.5,
      timesheetHours: 16.5,
      jobCostActualHours: 16.5,
      budgetedHours: 14,
      travelBudgetedHours: 2,
      difference: 0,
    });
    expect(rows['25-1000']).toMatchObject({ hoursSource: 'job-cost', timesheetVerified: true });
    expect(rows['26-1000']).toMatchObject({
      source: 'both',
      hours: 18,
      hoursSource: 'job-cost',
      timesheetHours: 17,
      jobCostActualHours: 18,
      difference: 1,
      timesheetVerified: false,
    });
    expect(rows['24-1000']).toMatchObject({ source: 'job-cost', hours: 12, timesheetHours: null, budgetedHours: 13, difference: null });
  });
});
