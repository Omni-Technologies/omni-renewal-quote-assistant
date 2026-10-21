import { describe, expect, it } from 'vitest';
import type { DtoolsProjectDecision, JobCostRecord } from '../types';
import { buildProjects, defaultDecision, parseDtoolsTable } from './dtools';
import {
  buildJobCostProjects,
  jobCostForRenewal,
  jobCostForSite,
  mergeJobCostFiles,
  parseJobCostTable,
  summarizeJobCost,
} from './jobCost';
import { makeRenewal } from './testHelpers';

const PROJECT_HEADER = [
  'Client',
  'Name',
  'Number',
  'Status',
  'Start Date',
  'Budgeted Hours',
  'Actual Hours',
  'Project Manager',
  'Resources',
];
const PHASE_HEADER = [null, 'Phase', 'Budgeted Hours', 'Actual Hours', 'Budgeted Labor Cost'];

const ANNUAL_2025 = 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3';
const ANNUAL_2026 = 'I&T - FA Example Building Annual Fire Alarm Inspection 2026 2 of 3';
const ANNUAL_2020 = 'I&T - FA Example Building Annual Fire Alarm Inspection 2020';

function table(): unknown[][] {
  return [
    ['Project Job Cost (By Phase)'],
    PROJECT_HEADER,
    ['Example Client', ANNUAL_2025, '25-1000', 'Completed', 45778, 14, 16.5, 'PM', 'Inspector 1'],
    [],
    PHASE_HEADER,
    [null, 'Labor', 12, 15, 1080],
    [null, 'Travel', 2, 1.5, 180],
    [null, 'Total:'],
    [null, null, 14, 16.5, 1260],
    PROJECT_HEADER,
    ['Example Client', ANNUAL_2026, '26-1000', 'Active', '3/2/2026', 15, 18, 'PM', ''],
    ['Example Client', ANNUAL_2020, '20-1000', 'Completed', '4/1/2020', 13, 12, 'PM', ''],
    [],
    PHASE_HEADER,
    [null, 'Travel', 4, 3, 360],
    [null, 'Total:'],
    [null, null, 28, 30, 2520],
    ['Grand Total:', null, null, null, null, 42, 46.5],
  ];
}

function parse(datasetId = 'jc-1', fileIndex = 0) {
  return parseJobCostTable({
    table: table(),
    fileName: 'job-cost.xlsx',
    sheetName: 'Sheet1',
    datasetId,
    fileIndex,
  });
}

const TIMESHEET_HEADER = [
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

function timesheetProjects(entries: Array<{ approved: boolean; hours: string }>) {
  const parsed = parseDtoolsTable({
    header: TIMESHEET_HEADER,
    rows: entries.map((entry, index) => [
      entry.approved ? 'True' : 'False',
      'Task',
      '5/1/2025',
      `Inspector ${index + 1}`,
      `i${index + 1}@example.com`,
      'Example Client',
      ANNUAL_2025,
      '25-1000',
      'PM',
      ANNUAL_2025,
      `7500${index}`,
      entry.hours,
      '5/2/2025',
      '5/2/2025',
      `Inspector ${index + 1}`,
    ]),
    fileName: 'timesheet.csv',
    fileType: 'csv',
    sheetName: 'CSV',
    fingerprint: 'timesheet',
    datasetId: 'ts-1',
    importedAt: 1_700_000_000_000,
  });
  return buildProjects(parsed.rows);
}

describe('job-cost workbook parsing', () => {
  it('reads project rows, a single-project phase block and stops at Grand Total', () => {
    const { records, warnings } = parse();
    expect(warnings).toEqual([]);
    expect(records.map((record) => record.projectNumber)).toEqual(['25-1000', '26-1000', '20-1000']);
    const [first, second] = records;
    expect(first).toMatchObject({
      clientName: 'Example Client',
      status: 'Completed',
      startDate: '2025-05-01',
      budgetedHours: 14,
      actualHours: 16.5,
      resources: 'Inspector 1',
      sharedPhaseBlock: false,
    });
    expect(first.phases.map((phase) => phase.name)).toEqual(['Labor', 'Travel']);
    expect(second.startDate).toBe('2026-03-02');
  });

  it('does not assign a shared phase block to any one project', () => {
    const { records } = parse();
    expect(records[1].phases).toEqual([]);
    expect(records[1].sharedPhaseBlock).toBe(true);
    expect(records[2].sharedPhaseBlock).toBe(true);
  });

  it('rejects a workbook that is not a job-cost export', () => {
    expect(() =>
      parseJobCostTable({ table: [['Something else']], fileName: 'x.xlsx', sheetName: 'S', datasetId: 'd', fileIndex: 0 }),
    ).toThrow('x.xlsx is not a D-Tools Project Job Cost (By Phase) export.');
  });

  it('rejects a header with no project rows', () => {
    expect(() =>
      parseJobCostTable({ table: [PROJECT_HEADER], fileName: 'x.xlsx', sheetName: 'S', datasetId: 'd', fileIndex: 0 }),
    ).toThrow('x.xlsx contains no project rows.');
  });
});

describe('job-cost merge', () => {
  it('keeps one copy of a project that appears in two files with the same hours', () => {
    const merged = mergeJobCostFiles('jc-1', 1, [
      { fileName: 'a.xlsx', sheetName: 'S', fingerprint: 'a', records: parse('jc-1', 0).records },
      { fileName: 'b.xlsx', sheetName: 'S', fingerprint: 'b', records: parse('jc-1', 1).records.slice(0, 1) },
    ]);
    expect(merged.records).toHaveLength(3);
    expect(merged.dataset.projectCount).toBe(3);
    expect(merged.warnings).toHaveLength(1);
  });

  it('stops when the same project has different hours in two files', () => {
    const changed: JobCostRecord = { ...parse('jc-1', 1).records[0], sourceFile: 'b.xlsx', actualHours: 20 };
    expect(() =>
      mergeJobCostFiles('jc-1', 1, [
        { fileName: 'a.xlsx', sheetName: 'S', fingerprint: 'a', records: parse().records },
        { fileName: 'b.xlsx', sheetName: 'S', fingerprint: 'b', records: [changed] },
      ]),
    ).toThrow(/Project 25-1000 appears in .* with different hours/);
  });

  it('stops when the same file is selected twice', () => {
    const { records } = parse();
    expect(() =>
      mergeJobCostFiles('jc-1', 1, [
        { fileName: 'a.xlsx', sheetName: 'S', fingerprint: 'same', records },
        { fileName: 'a copy.xlsx', sheetName: 'S', fingerprint: 'same', records },
      ]),
    ).toThrow('a copy.xlsx was selected twice.');
  });
});

describe('job-cost projects', () => {
  it('compares actual hours with the timesheet by project number', () => {
    const ts = timesheetProjects([
      { approved: true, hours: '8' },
      { approved: true, hours: '7.5' },
      { approved: true, hours: '1' },
    ]);
    const projects = buildJobCostProjects(parse().records, new Map(), ts);
    expect(projects.map((project) => project.timesheet?.status)).toEqual([
      'match',
      'not-in-timesheet',
      'before-timesheet',
    ]);
    expect(projects[0].timesheet).toMatchObject({ totalHours: 16.5, approvedHours: 16.5, difference: 0 });
    expect(projects[0].travelBudgetedHours).toBe(2);
    expect(projects[1].travelBudgetedHours).toBeNull();
  });

  it('marks approved-only matches and mismatches', () => {
    const approvedOnly = timesheetProjects([
      { approved: true, hours: '16.5' },
      { approved: false, hours: '2' },
    ]);
    expect(buildJobCostProjects(parse().records, new Map(), approvedOnly)[0].timesheet?.status).toBe('approved-match');
    const different = timesheetProjects([{ approved: true, hours: '10' }]);
    expect(buildJobCostProjects(parse().records, new Map(), different)[0].timesheet).toMatchObject({
      status: 'mismatch',
      difference: 6.5,
    });
  });

  it('has no timesheet comparison without timesheet history', () => {
    const projects = buildJobCostProjects(parse().records, new Map(), null);
    expect(projects.every((project) => project.timesheet === null)).toBe(true);
    expect(projects.map((project) => project.year)).toEqual([2025, 2026, 2020]);
    expect(projects.every((project) => project.included && project.frequency === 'Annual')).toBe(true);
  });

  it('applies a shared manual exclude decision', () => {
    const [timesheetProject] = timesheetProjects([{ approved: true, hours: '16.5' }]);
    const decision: DtoolsProjectDecision = { ...defaultDecision(timesheetProject), action: 'exclude', updatedAt: 1 };
    const projects = buildJobCostProjects(parse().records, new Map([[decision.key, decision]]), null);
    expect(projects[0].key).toBe(decision.key);
    expect(projects[0].included).toBe(false);
  });

  it('averages budgeted, actual and travel hours while skipping zero hours', () => {
    const records = parse().records;
    records[2] = { ...records[2], actualHours: 0 };
    const summary = summarizeJobCost(buildJobCostProjects(records, new Map(), null));
    expect(summary.budgeted).toEqual({ average: 14, count: 3 });
    expect(summary.actual).toEqual({ average: 17.25, count: 2 });
    expect(summary.travel).toEqual({ average: 2, count: 1 });
  });

  it('finds a site by project number, then by client and location', () => {
    const projects = buildJobCostProjects(parse().records, new Map(), null);
    const byNumber = makeRenewal({ company: { clientName: 'Other', locationName: 'Other', dtoolsProjectNumber: '26-1000', inspectionFrequency: 'Annual' } });
    expect(jobCostForRenewal(byNumber, projects).map((project) => project.year)).toEqual([2026, 2025, 2020]);
    const byName = makeRenewal({ company: { clientName: 'Example Client', locationName: 'Example Building', dtoolsProjectNumber: '', inspectionFrequency: 'Annual' } });
    expect(jobCostForRenewal(byName, projects)).toHaveLength(3);
    const semi = makeRenewal({ company: { clientName: 'Example Client', locationName: 'Example Building', dtoolsProjectNumber: '', inspectionFrequency: 'Semi-Annual' } });
    expect(jobCostForRenewal(semi, projects)).toHaveLength(0);
    expect(jobCostForSite(projects, projects[0].siteKey, 'Annual')).toHaveLength(3);
  });
});
