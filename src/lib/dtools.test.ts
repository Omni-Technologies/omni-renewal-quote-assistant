import { describe, expect, it } from 'vitest';
import type { DtoolsProjectDecision } from '../types';
import {
  applyHistoryToRenewal,
  buildHistoryEntries,
  buildProjects,
  buildSiteSummaries,
  classifyProjectName,
  computeHistoryAverage,
  defaultDecision,
  defaultSelectedKeys,
  deriveSiteLabel,
  inferServiceYear,
  parseCsvTable,
  parseDtoolsTable,
  parseDurationHours,
  searchSites,
  selectionSummary,
} from './dtools';
import { makeRenewal } from './testHelpers';
import { calculateHistoryStats } from './calculations';
import observedCsv from './__fixtures__/dtools-observed.csv?raw';

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

type Values = Record<string, string | number | boolean>;

function row(overrides: Values = {}): unknown[] {
  const values: Values = {
    Approved: 'True',
    Entity: 'Task',
    Date: '5/1/2025',
    Resource: 'Inspector A',
    'Resource Email': 'a@example.com',
    'Client Name': 'Example Client',
    'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
    'Project Number': '25-1000',
    'Project Manager': 'Drew Cassidy',
    Name: 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
    Number: '75000',
    Duration: '8',
    'Created On': '5/2/2025',
    'Updated On': '5/2/2025',
    'Updated By': 'Inspector A',
    ...overrides,
  };
  return HEADER.map((header) => values[header] ?? '');
}

function parse(rows: unknown[][], id = 'ds-test') {
  return parseDtoolsTable({
    header: HEADER,
    rows,
    fileName: 'fixture.csv',
    fileType: 'csv',
    sheetName: 'CSV',
    fingerprint: `fp-${id}`,
    datasetId: id,
    importedAt: 1_700_000_000_000,
  });
}

function decision(
  project: ReturnType<typeof buildProjects>[number],
  values: Partial<DtoolsProjectDecision> = {},
): DtoolsProjectDecision {
  return {
    ...defaultDecision(project),
    ...values,
    updatedAt: 1,
  };
}

describe('D-Tools parsing and classification', () => {
  it('sums individual timesheet entries into one inspection total (8 + 7.5 + 1 = 16.5)', () => {
    const parsed = parse([
      row({ Duration: '8', Resource: 'Inspector A' }),
      row({ Duration: '7.5', Resource: 'Inspector B', Date: '5/2/2025' }),
      row({ Duration: '1', Resource: 'Inspector A', Date: '5/5/2025', Number: '75001' }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.totalHours).toBeCloseTo(16.5, 10);
    expect(project.entryCount).toBe(3);
    expect(project.inspectorCount).toBe(2);
    expect(project.classification).toBe('annual');
  });

  it('keeps multiple legitimate entries that share a task number', () => {
    const parsed = parse([
      row({ Duration: '8', Number: '77777', Resource: 'Inspector A' }),
      row({ Duration: '7.5', Number: '77777', Resource: 'Inspector B' }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.totalHours).toBeCloseTo(15.5, 10);
    expect(project.entryCount).toBe(2);
  });

  it('reads decimal duration hours without multiplying by 24', () => {
    expect(parseDurationHours('0.46666667')).toBeCloseTo(0.46666667, 8);
    expect(parseDurationHours(8.5)).toBe(8.5);
    expect(parseDurationHours('1:30')).toBe(1.5);
    expect(parseDurationHours('-1')).toBeNull();
    expect(parseDurationHours('')).toBeNull();
  });

  it('keeps annual and semi-annual inspections separate', () => {
    const parsed = parse([
      row({
        'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
        'Project Number': '25-1000',
        Duration: '10',
      }),
      row({
        Date: '10/1/2025',
        'Project Name': 'I&T - FA Example Building Semi Annual Fire Alarm Inspection 2025 2 of 3',
        'Project Number': '25-2000',
        Duration: '4',
        Number: '75002',
      }),
    ]);
    const projects = buildProjects(parsed.rows);
    const site = buildSiteSummaries(projects)[0];
    expect(site.siteKey).toBe(projects[0].siteKey);
    const annual = defaultSelectedKeys(projects, 'Annual');
    const semi = defaultSelectedKeys(projects, 'Semi-Annual');
    expect(computeHistoryAverage(projects, new Set(annual), 'Annual').totalHours).toBe(10);
    expect(computeHistoryAverage(projects, new Set(semi), 'Semi-Annual').totalHours).toBe(4);
  });

  it('excludes SVC, deficiency, discrepancy, troubleshooting and repair work for the same client', () => {
    const names = [
      'SVC - FA I&T Example Building Annual Fire Alarm Inspection Discrepancies 2025',
      'SVC - FA I&T Example Building Annual Fire Alarm Inspection 2025 Deficiencies',
      'I&T - FA Example Building Annual Fire Alarm Troubleshooting 2025',
      'I&T - FA Example Building Annual Fire Alarm Repairs 2025',
      'I&T - FA Example Building Corrective Work 2025',
    ];
    for (const name of names) {
      const result = classifyProjectName(name);
      expect(result.classification).toBe('excluded');
    }
  });

  it('does not reject a legitimate location merely because it contains "Services" or "Svc"', () => {
    expect(
      classifyProjectName(
        'I&T - FA Reedsburg Human Services Annual Fire Alarm Inspection 2 of 3 2026',
      ).classification,
    ).toBe('annual');
    expect(
      classifyProjectName(
        'I&T - FA Green Co Gvnt Svc Bldg Annual Fire Alarm Inspection 2023 5 of 5',
      ).classification,
    ).toBe('annual');
  });

  it('accepts a fire alarm project without a contract position', () => {
    const result = classifyProjectName(
      'I&T - FA Example Building Annual Fire Alarm Inspection 2025',
    );
    expect(result.classification).toBe('annual');
    expect(result.contractPosition).toBeNull();
  });

  it('infers a missing year from work dates and flags it for review', () => {
    const parsed = parse([
      row({
        Date: '3/4/2025',
        'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection',
      }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.serviceYear).toBe(2025);
    expect(project.yearSource).toBe('work-dates');
    expect(project.classification).toBe('review');
    expect(project.included).toBe(false);
    expect(project.reasons.join(' ')).toMatch(/No year in title/);
  });

  it('sends an ambiguous frequency to manual review instead of guessing', () => {
    const result = classifyProjectName(
      'I&T - FA Rock Co. Human Services Fire Alarm Inspection 1 of 5  2026',
    );
    expect(result.classification).toBe('review');
    expect(result.frequency).toBeNull();
    expect(result.reasons.join(' ')).toMatch(/No reliable Annual/);
  });

  it('excludes non-fire-alarm disciplines such as nurse call, intrusion and security', () => {
    expect(
      classifyProjectName(
        'I&T - NC Emerus - Ascension Menomonee Annual Nurse Call Inspection 2026',
      ).classification,
    ).toBe('excluded');
    expect(
      classifyProjectName(
        "I&T - INT St. Mary's Hospital Annual Intrusion & AC Battery Testing Inspection 1 of 3 2025",
      ).classification,
    ).toBe('excluded');
    expect(
      classifyProjectName(
        'I&T - SEC Example Building Annual Panic Button Testing 2023',
      ).classification,
    ).toBe('excluded');
  });

  it('marks mixed fire alarm and other-system titles for review', () => {
    const result = classifyProjectName(
      'I&T - FA/INT/CCTV SSA QBE Sun Prairie Annual FA & INT & CCTV SSA / Semi Annual FA Inspection 2023',
    );
    expect(result.classification).toBe('review');
  });

  it('does not merge similar clients or locations into one site', () => {
    const parsed = parse([
      row({
        'Client Name': 'SSM Health Dean Medical Group',
        'Project Name': 'I&T - FA Dean West Clinic Annual Fire Alarm Inspection 2 of 3 2026',
        'Project Number': '25-2176',
      }),
      row({
        'Client Name': 'SSM Health Dean Medical Group',
        'Project Name': 'I&T - FA Dean WRO Clinic Annual Fire Alarm Inspection 2 of 3 2026',
        'Project Number': '25-2320',
        'Number': '75003',
      }),
    ]);
    const sites = buildSiteSummaries(buildProjects(parsed.rows));
    expect(sites).toHaveLength(2);
    expect(sites[0].siteKey).not.toBe(sites[1].siteKey);
  });

  it('expands UWCU while preserving branch and client boundaries, including saved imports', () => {
    const parsed = parse([
      row({ 'Client Name': 'UWCU', 'Project Name': 'I&T - FA UWCU New Berlin Annual Fire Alarm Inspection 2024', 'Project Number': '24-0186' }),
      row({ 'Client Name': 'UW Credit Union', 'Project Name': 'I&T - FA UW Credit Union - New Berlin Branch Annual Fire Alarm Inspection 2025', 'Project Number': '24-2222' }),
      row({ 'Client Name': 'UW Credit Union', 'Project Name': 'I&T - FA UWCU Madison Annual Fire Alarm Inspection 2025', 'Project Number': '25-0001' }),
      row({ 'Client Name': 'Other Client', 'Project Name': 'I&T - FA UWCU New Berlin Annual Fire Alarm Inspection 2025', 'Project Number': '25-0002' }),
    ]);
    expect(parsed.rows[0].siteKey).toBe(parsed.rows[1].siteKey);
    const projects = buildProjects(parsed.rows.map((entry) => ({ ...entry, siteKey: `old::${entry.projectNumber}` })));
    const first = projects.find((entry) => entry.projectNumber === '24-0186')!;
    expect(projects.find((entry) => entry.projectNumber === '24-2222')?.siteKey).toBe(first.siteKey);
    expect(projects.find((entry) => entry.projectNumber === '25-0001')?.siteKey).not.toBe(first.siteKey);
    expect(projects.find((entry) => entry.projectNumber === '25-0002')?.siteKey).not.toBe(first.siteKey);
    expect(buildSiteSummaries(projects)).toHaveLength(3);
  });

  it('joins exact East Madison Toyota client/title aliases, including saved imports, without merging other sites', () => {
    const parsed = parse([
      row({ 'Client Name': 'Penske Auto', 'Project Name': 'I&T - FA East Madison Toyota Annual Fire Alarm Inspection 2023 4 of 5', 'Project Number': '23-0214' }),
      row({ 'Client Name': 'Penske Auto', 'Project Name': 'I&T - FA East Madison Toyota Annual Fire Alarm Inspection 2024 5 of 5', 'Project Number': '24-0156' }),
      row({ 'Client Name': 'PAG Madison T1 dba East Madison Toyota', 'Project Name': 'I&T - FA East Madison Toyota (Penske Auto) Annual Fire Alarm Inspection 2025', 'Project Number': '24-1792' }),
      row({ 'Client Name': 'PAG Madison T1 dba East Madison Toyota', 'Project Name': 'I&T - FA East Madison Toyota Annual Fire Alarm Inspection 2026', 'Project Number': '26-0593' }),
      row({ 'Client Name': 'Penske Auto', 'Project Name': 'I&T - FA West Madison Toyota Annual Fire Alarm Inspection 2025', 'Project Number': '25-0001' }),
      row({ 'Client Name': 'Other Client', 'Project Name': 'I&T - FA East Madison Toyota Annual Fire Alarm Inspection 2025', 'Project Number': '25-0002' }),
      row({ 'Client Name': 'PAG Madison T1 dba East Madison Toyota', 'Project Name': 'I&T - FA East Madison Toyota Annex Annual Fire Alarm Inspection 2025', 'Project Number': '25-0003' }),
    ]);
    const key = parsed.rows[0].siteKey;
    expect(parsed.rows.slice(0, 4).every((entry) => entry.siteKey === key)).toBe(true);
    const savedRows = parsed.rows.map((entry) => ({ ...entry, siteKey: `old::${entry.projectNumber}` }));
    const originalProject = buildProjects(savedRows).find((project) => project.projectNumber === '24-1792')!;
    const manualDecision = decision(originalProject, { quotedHours: 12, note: 'Keep original quote' });
    const projects = buildProjects(savedRows, new Map([[originalProject.key, manualDecision]]));
    const grouped = projects.filter((project) => project.siteKey === key);
    expect(grouped.map((project) => project.projectNumber).sort()).toEqual(['23-0214', '24-0156', '24-1792', '26-0593']);
    expect(grouped.find((project) => project.projectNumber === '24-1792')?.decision).toEqual(manualDecision);
    expect(grouped.find((project) => project.projectNumber === '23-0214')?.entries[0].row.clientName).toBe('Penske Auto');
    expect(buildSiteSummaries(projects)).toHaveLength(4);
  });

  it('groups the observed Wisconsin DNR site titles across 2024, 2025, and 2026', () => {
    const parsed = parse([
      row({
        'Client Name': 'WI Dept of Natural Resources',
        'Project Name': 'I&T - FA Wisconsin DNR Annual Fire Alarm Inspection 2024 1 of 3',
        'Project Number': '24-0328',
        Date: '5/1/2024',
        Duration: '2.5',
      }),
      row({
        'Client Name': 'WI Dept of Natural Resources',
        'Project Name': 'I&T - FA Wisconsin DNR Annual Fire Alarm Inspection 2025 2 of 3',
        'Project Number': '24-2224',
        Duration: '3.4',
      }),
      row({
        'Client Name': 'WI Dept of Natural Resources',
        'Project Name': 'I&T - FA Wisconsin Department of Natural Resources (DNR) Annual Fire Alarm Inspection 2026 3 of 3',
        'Project Number': '25-0855',
        Date: '5/1/2026',
        Duration: '2.58333333',
      }),
      row({
        'Client Name': 'WI Dept of Natural Resources',
        'Project Name': 'I&T - FA Wisconsin DNR Madison Office Annual Fire Alarm Inspection 2026',
        'Project Number': '26-9999',
        Date: '5/2/2026',
        Duration: '10',
      }),
    ]);
    expect(new Set(parsed.rows.slice(0, 3).map((sourceRow) => sourceRow.siteKey)).size).toBe(1);
    const savedRows = parsed.rows.map((sourceRow) => sourceRow.projectNumber === '25-0855'
      ? { ...sourceRow, siteKey: 'wi dept of natural resources::wisconsin department of natural resources dnr' }
      : sourceRow);
    const projects = buildProjects(savedRows);
    const dnr = projects.filter((project) => project.projectNumber !== '26-9999');
    expect(savedRows[2].siteKey).not.toBe(dnr[0].siteKey);
    expect(new Set(dnr.map((project) => project.siteKey)).size).toBe(1);
    expect(buildSiteSummaries(projects)).toHaveLength(2);
    expect(projects.find((project) => project.projectNumber === '26-9999')?.siteKey).not.toBe(dnr[0].siteKey);
    expect(defaultSelectedKeys(dnr, 'Annual')).toHaveLength(3);
    expect(computeHistoryAverage(dnr, new Set(defaultSelectedKeys(dnr, 'Annual')), 'Annual').averagePerVisit)
      .toBeCloseTo((2.5 + 3.4 + 2.58333333) / 3, 7);
  });

  it('finds sites by case-insensitive partial and punctuated names', () => {
    const parsed = parse(
      [row({
        'Client Name': "SSM Health St. Mary's Hospital Madison",
        'Project Name':
          "I&T - FA St. Mary's Madison Hospital Annual Fire Alarm Inspection 2026 3 of 3",
        'Project Number': '26-0180',
      })],
    );
    const sites = buildSiteSummaries(buildProjects(parsed.rows));
    expect(searchSites(sites, 'st marys madison')).toHaveLength(1);
    expect(searchSites(sites, 'SSM')).toHaveLength(1);
    expect(searchSites(sites, 'nonexistent')).toHaveLength(0);
  });

  it('does not flag "Human Services" task names as service work', () => {
    const parsed = parse([
      row({
        'Client Name': 'Rock County',
        'Project Name':
          'I&T - FA Rock County Human Services Bldg Annual Fire Alarm Inspection 2025 3 of 5',
        'Project Number': '24-0173',
        Name: 'I&T - FA Rock County Human Services Bldg Annual Fire Alarm Inspection',
        Duration: '8',
      }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.flaggedEntries).toBe(0);
    expect(project.totalHours).toBe(8);
  });

  it('recognizes the observed "Annaul" typo without inventing a year', () => {
    const parsed = parse([
      row({
        'Project Name': 'I&T - FA EO Madison Yards Annaul Fire Alarm Inspection 2025',
        'Project Number': '25-1243',
      }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.classification).toBe('annual');
    expect(project.effectiveYear).toBe(2025);
    expect(project.reasons.join(' ')).toMatch(/misspelled/);
  });

  it('excludes flagged entries and never treats an all-flagged project as a zero-hour inspection', () => {
    const parsed = parse([
      row({
        'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
        Duration: '8',
      }),
      row({
        'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
        Number: '75002',
        Duration: '1.75',
        Name: 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3 - Assisting Sprinkler Testing',
      }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.totalHours).toBe(8);
    expect(project.flaggedHours).toBe(1.75);
    expect(project.included).toBe(true);

    const allFlagged = parse([
      row({
        'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3',
        Duration: '2.33',
        Name: 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 1 of 3 - Assisting Sprinkler Testing',
      }),
    ]);
    const [onlyFlagged] = buildProjects(allFlagged.rows);
    expect(onlyFlagged.totalHours).toBe(0);
    expect(onlyFlagged.included).toBe(false);
    expect(defaultSelectedKeys([onlyFlagged], 'Annual')).toHaveLength(0);
    expect(onlyFlagged.reasons.join(' ')).toMatch(/All approved time is flagged/);
  });

  it('excludes unapproved entries from actual hours while keeping them visible', () => {
    const parsed = parse([
      row({ Duration: '8', Approved: 'True' }),
      row({ Duration: '99', Approved: 'False', Number: '75009' }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.totalHours).toBe(8);
    expect(project.unapprovedHours).toBe(99);
    expect(project.entries.filter((entry) => !entry.included).length).toBe(1);
    expect(parsed.dataset.unapprovedRows).toBe(1);
  });

  it('preserves the original source row number for every entry', () => {
    const parsed = parse([
      row({ Duration: '8' }),
      row({ Duration: '4', Number: '75010' }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.entries.map((entry) => entry.row.sourceRow)).toEqual([2, 3]);
  });

  it('treats a December/January project as one inspection occurrence', () => {
    const parsed = parse([
      row({ Date: '12/30/2025', Duration: '6' }),
      row({ Date: '1/6/2026', Duration: '5', Number: '75011' }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.entryCount).toBe(2);
    expect(project.effectiveYear).toBe(2025);
    expect(project.reasons.join(' ')).toMatch(/Work spans 2025–2026/);
    expect(defaultSelectedKeys([project], 'Annual')).toHaveLength(1);
  });

  it('reports malformed rows without throwing or inventing data', () => {
    const parsed = parse([
      row({ Duration: '8' }),
      row({ Duration: 'not-hours', Number: '75012' }),
      row({ Date: 'not-a-date', Number: '75013' }),
      row({ Duration: '2', Number: '75014' }),
    ]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.invalidRows).toHaveLength(2);
    expect(parsed.dataset.rejectedRows).toBe(2);
    expect(parsed.warnings.join(' ')).toMatch(/could not be read/);
  });
});

describe('historical averages and manual decisions', () => {
  it('does not resolve year conflicts or inconsistent scope through a frequency-only correction', () => {
    const parsed = parse([row({ Date: '1/1/2026', 'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2023 1 of 3' })]);
    const [original] = buildProjects(parsed.rows);
    const [corrected] = buildProjects(parsed.rows, new Map([[original.key, decision(original, { frequency: 'Annual' })]]));
    expect(corrected.included).toBe(false);
    const [confirmed] = buildProjects(parsed.rows, new Map([[original.key, decision(original, { year: 2026 })]]));
    expect(confirmed.included).toBe(true);
  });

  it('keeps numeric street locations separate when removing inspection years', () => {
    expect(deriveSiteLabel('I&T - FA 2024 Main Street Annual Fire Alarm Inspection 2026')).toBe('2024 Main Street');
    expect(deriveSiteLabel('I&T - FA 2025 Main Street Annual Fire Alarm Inspection 2026')).toBe('2025 Main Street');
  });
  const annualRows = [
    row({ Date: '6/1/2023', Duration: '10', 'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2023 1 of 3', 'Project Number': '23-1000' }),
    row({ Date: '6/1/2024', Duration: '12', 'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2024 2 of 3', 'Project Number': '24-1000' }),
    row({ Date: '6/1/2025', Duration: '14', 'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2025 3 of 3', 'Project Number': '25-1000' }),
  ];

  it('preserves the selected inspection average when two project numbers share a year', () => {
    const projects = buildProjects(parse([...annualRows, row({ Duration: 30, 'Project Number': '25-2000' })]).rows);
    const keys = new Set(projects.map((project) => project.key));
    const expected = computeHistoryAverage(projects, keys, 'Annual').averagePerVisit;
    const history = buildHistoryEntries(projects, keys, 'Annual');
    expect(history).toHaveLength(4);
    expect(calculateHistoryStats(history).averageHours).toBe(expected);
  });

  it('persists explicit selection overrides without adding an older default occurrence', () => {
    const parsed = parse([...annualRows, row({ Date: '6/1/2022', 'Project Number': '22-1000', 'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection 2022' })]);
    const projects = buildProjects(parsed.rows);
    const latest = projects.find((project) => project.effectiveYear === 2025)!;
    const decisions = new Map([[latest.key, decision(latest, { averageSelected: false })]]);
    const reloaded = buildProjects(parsed.rows, decisions);
    const keys = defaultSelectedKeys(reloaded, 'Annual');
    expect(keys).toHaveLength(2);
    expect(reloaded.filter((project) => keys.includes(project.key)).map((project) => project.effectiveYear).sort()).toEqual([2023, 2024]);
  });

  it('rejects an annualized year with three selected semi-annual projects', () => {
    const projects = buildProjects(parse([1, 2, 3].map((visit) => row({
      Duration: visit, 'Project Number': `25-300${visit}`,
      'Project Name': `I&T - FA Example Building Semi Annual Fire Alarm Inspection 2025 ${visit} of 3`,
    }))).rows);
    const keys = new Set(projects.map((project) => project.key));
    expect(computeHistoryAverage(projects, keys, 'Semi-Annual').annualizedAverage).toBeNull();
    expect(buildHistoryEntries(projects, keys, 'Semi-Annual', 'annualized')).toEqual([]);
    expect(selectionSummary(projects, keys, 'Semi-Annual', 'annualized')).toEqual([]);
  });

  it('averages the most recent three distinct annual occurrences and warns when fewer exist', () => {
    const projects = buildProjects(parse(annualRows).rows);
    const selected = defaultSelectedKeys(projects, 'Annual');
    expect(selected).toHaveLength(3);
    const average = computeHistoryAverage(projects, new Set(selected), 'Annual');
    expect(average.totalHours).toBe(36);
    expect(average.averagePerVisit).toBe(12);
    expect(average.warnings).toHaveLength(0);

    const partial = computeHistoryAverage(
      projects,
      new Set(selected.slice(0, 2)),
      'Annual',
    );
    expect(partial.averagePerVisit).toBe(13);
    expect(partial.warnings.join(' ')).toMatch(/three are normally reviewed/);
  });

  it('applies manual include/exclude decisions immediately to the average', () => {
    const projects = buildProjects(parse(annualRows).rows);
    const target = projects.find((project) => project.effectiveYear === 2025);
    expect(target).toBeDefined();
    const decisions = new Map([
      [target!.key, decision(target!, { action: 'exclude', updatedAt: 2 })],
    ]);
    const updated = buildProjects(parse(annualRows).rows, decisions);
    const selected = defaultSelectedKeys(updated, 'Annual');
    expect(selected).not.toContain(target!.key);
    expect(computeHistoryAverage(updated, new Set(selected), 'Annual').totalHours).toBe(22);
    expect(
      computeHistoryAverage(updated, new Set([target!.key]), 'Annual').averagePerVisit,
    ).toBeNull();
  });

  it('keeps manually entered quoted hours separate from actual hours', () => {
    const projects = buildProjects(parse(annualRows).rows);
    const target = projects.find((project) => project.effectiveYear === 2023);
    expect(target).toBeDefined();
    const decisions = new Map([
      [target!.key, decision(target!, { quotedHours: 20, updatedAt: 2 })],
    ]);
    const updated = buildProjects(parse(annualRows).rows, decisions);
    const project = updated.find((item) => item.key === target!.key);
    expect(project?.decision.quotedHours).toBe(20);
    expect(project?.totalHours).toBe(10);
    expect(project?.approvedHours).toBe(10);
  });

  it('includes a year-inferred project after the user corrects and confirms its year', () => {
    const parsed = parse([
      row({
        Date: '3/4/2025',
        'Project Name': 'I&T - FA Example Building Annual Fire Alarm Inspection',
      }),
    ]);
    const [auto] = buildProjects(parsed.rows);
    expect(auto.included).toBe(false);
    const decisions = new Map([
      [auto.key, decision(auto, { year: 2025, updatedAt: 2 })],
    ]);
    const [resolved] = buildProjects(parsed.rows, decisions);
    expect(resolved.included).toBe(true);
    expect(resolved.effectiveYear).toBe(2025);
    expect(resolved.entries.every((entry) => entry.included)).toBe(true);
  });

  it('requires an explicitly confirmed year before a frequency-only correction includes a review project', () => {
    const parsed = parse([
      row({
        Date: '3/4/2025',
        'Project Name': 'I&T - FA Example Building Fire Alarm Inspection',
      }),
    ]);
    const [auto] = buildProjects(parsed.rows);
    expect(auto.included).toBe(false);
    const frequencyOnly = new Map([
      [auto.key, decision(auto, { frequency: 'Annual', updatedAt: 2 })],
    ]);
    const [stillReview] = buildProjects(parsed.rows, frequencyOnly);
    expect(stillReview.included).toBe(false);
    expect(stillReview.effectiveYear).toBe(2025);

    const withYear = new Map([
      [
        auto.key,
        decision(auto, { frequency: 'Annual', year: 2025, updatedAt: 3 }),
      ],
    ]);
    const [resolved] = buildProjects(parsed.rows, withYear);
    expect(resolved.included).toBe(true);
  });

  it('lets a manually included excluded project be selected and traced like any other occurrence', () => {
    const parsed = parse([
      row({
        'Project Name':
          "SVC - FA I&T St. Mary's Hospital Annual Fire Alarm Inspection 2025 Deficiencies",
        'Project Number': '25-9999',
        Duration: '3',
      }),
    ]);
    const [auto] = buildProjects(parsed.rows);
    expect(auto.classification).toBe('excluded');
    expect(auto.included).toBe(false);
    const decisions = new Map([
      [
        auto.key,
        decision(auto, {
          action: 'include',
          frequency: 'Annual',
          year: 2025,
          updatedAt: 2,
        }),
      ],
    ]);
    const [manual] = buildProjects(parsed.rows, decisions);
    expect(manual.included).toBe(true);
    expect(defaultSelectedKeys([manual], 'Annual')).toEqual([manual.key]);
    expect(computeHistoryAverage([manual], new Set([manual.key]), 'Annual').totalHours).toBe(3);
  });

  it('keeps the applied audit summary consistent with annualized semi-annual entries', () => {
    const parsed = parse([
      row({
        Date: '3/1/2025',
        Duration: '5',
        'Project Name': 'I&T - FA Example Building Semi Annual Fire Alarm Inspection 2025 1 of 3',
        'Project Number': '25-3000',
      }),
      row({
        Date: '9/1/2025',
        Duration: '6',
        'Project Name': 'I&T - FA Example Building Semi Annual Fire Alarm Inspection 2025 2 of 3',
        'Project Number': '25-3001',
        Number: '75020',
      }),
      row({
        Date: '3/1/2026',
        Duration: '4',
        'Project Name': 'I&T - FA Example Building Semi Annual Fire Alarm Inspection 2026 3 of 3',
        'Project Number': '26-3000',
        Number: '75021',
      }),
    ]);
    const projects = buildProjects(parsed.rows);
    const selected = new Set(defaultSelectedKeys(projects, 'Semi-Annual'));
    const entries = buildHistoryEntries(projects, selected, 'Semi-Annual', 'annualized');
    const summary = selectionSummary(projects, selected, 'Semi-Annual', 'annualized');
    expect(entries).toHaveLength(1);
    expect(entries[0].hours).toBe(11);
    expect(summary).toHaveLength(2);
    expect(summary.reduce((sum, project) => sum + project.hours, 0)).toBe(11);
    expect(summary.every((project) => project.year === 2025)).toBe(true);
  });

  it('ignores unapproved stray dates when inferring and checking the inspection year', () => {
    const parsed = parse([
      row({ Date: '6/1/2025', Duration: '8' }),
      row({
        Date: '1/1/2019',
        Duration: '99',
        Approved: 'False',
        Number: '75099',
      }),
    ]);
    const [project] = buildProjects(parsed.rows);
    expect(project.effectiveYear).toBe(2025);
    expect(project.classification).toBe('annual');
    expect(project.reasons.join(' ')).not.toMatch(/conflicts with work dates/);
    expect(project.unapprovedHours).toBe(99);
  });

  it('builds semi-annual visit and annualized history without zero-filling missing visits', () => {
    const parsed = parse([
      row({
        Date: '3/1/2025',
        Duration: '5',
        'Project Name': 'I&T - FA Example Building Semi Annual Fire Alarm Inspection 2025 1 of 3',
        'Project Number': '25-3000',
      }),
      row({
        Date: '9/1/2025',
        Duration: '6',
        'Project Name': 'I&T - FA Example Building Semi Annual Fire Alarm Inspection 2025 2 of 3',
        'Project Number': '25-3001',
        Number: '75020',
      }),
      row({
        Date: '3/1/2026',
        Duration: '4',
        'Project Name': 'I&T - FA Example Building Semi Annual Fire Alarm Inspection 2026 3 of 3',
        'Project Number': '26-3000',
        Number: '75021',
      }),
    ]);
    const projects = buildProjects(parsed.rows);
    const selected = new Set(defaultSelectedKeys(projects, 'Semi-Annual'));
    const visits = buildHistoryEntries(projects, selected, 'Semi-Annual', 'visit');
    expect(visits).toHaveLength(3);
    const annualized = buildHistoryEntries(projects, selected, 'Semi-Annual', 'annualized');
    expect(annualized).toHaveLength(1);
    expect(annualized[0].yearLabel).toBe('2025');
    expect(annualized[0].hours).toBe(11);
    const average = computeHistoryAverage(projects, selected, 'Semi-Annual');
    expect(average.averagePerVisit).toBe(5);
    expect(average.annualizedAverage).toBe(11);
    expect(average.warnings.join(' ')).toMatch(/only one semi-annual visit/);
  });
});

describe('renewal hand-off', () => {
  it('updates history and imported source while preserving pricing, notes, quoted hours and SOW', () => {
    const renewal = makeRenewal({
      company: {
        companyName: 'Existing Company',
        clientName: 'Existing Client',
        locationName: 'Existing Location',
        siteAddress: '500 Existing Ave',
        siteCity: 'Madison',
        companyQuotingNotes: 'Gate code 1234',
        internalRenewalNotes: 'Call first',
      },
      pricing: {
        previousAnnualPrice: 5000,
        proposedAnnualPrice: 5400,
        laborRatePerHour: 110,
        pricingChangeNotes: 'Keep margin',
      },
      labor: { quotedHours: 13, quotedHoursReason: 'Existing reason' },
    });
    const updated = applyHistoryToRenewal(
      renewal,
      {
        clientName: 'SSM Health St. Mary\'s Hospital Madison',
        siteLabel: "St. Mary's Madison Hospital",
        frequency: 'Annual',
        basis: 'Annual inspection totals',
        entries: [{ id: 'e1', yearLabel: '2025', hours: 16.5 }],
        summary: {
          datasetId: 'ds-1',
          fileName: 'timesheet.csv',
          importedAt: 1,
          clientName: "SSM Health St. Mary's Hospital Madison",
          siteLabel: "St. Mary's Madison Hospital",
          frequency: 'Annual',
          basis: 'annual',
          projects: [
            {
              projectKey: 'k1',
              projectName: 'I&T - FA St. Mary\'s Madison Hospital Annual Fire Alarm Inspection 2025 2 of 3',
              projectNumber: '25-0399',
              year: 2025,
              hours: 16.5,
              entryCount: 3,
            },
          ],
        },
      },
      1_800_000_000_000,
    );
    expect(updated.company.siteAddress).toBe('500 Existing Ave');
    expect(updated.company.companyName).toBe('Existing Company');
    expect(updated.company.companyQuotingNotes).toBe('Gate code 1234');
    expect(updated.pricing).toEqual(renewal.pricing);
    expect(updated.labor.quotedHours).toBe(13);
    expect(updated.labor.quotedHoursReason).toBe('Existing reason');
    expect(updated.sow).toEqual(renewal.sow);
    expect(updated.checklist).toEqual(renewal.checklist);
    expect(updated.labor.source).toBe('imported');
    expect(updated.labor.history).toEqual([{ id: 'e1', yearLabel: '2025', hours: 16.5 }]);
    expect(updated.labor.importSummary?.projects[0].projectNumber).toBe('25-0399');
    expect(updated.updatedAt).toBe(1_800_000_000_000);
  });
});

describe('real D-Tools export patterns', () => {
  const parsed = parseDtoolsTable({
    header: parseCsvTable(observedCsv)[0],
    rows: parseCsvTable(observedCsv).slice(1),
    fileName: 'dtools-observed.csv',
    fileType: 'csv',
    sheetName: 'CSV',
    fingerprint: 'observed',
    datasetId: 'observed',
    importedAt: 1,
  });
  const projects = buildProjects(parsed.rows);
  const sites = buildSiteSummaries(projects);
  const byProject = (needle: string) =>
    projects.find((project) => project.projectName.includes(needle));

  it('parses observed rows and keeps real source rows', () => {
    expect(parsed.rows.length).toBeGreaterThan(100);
    expect(parsed.invalidRows).toHaveLength(0);
    expect(parsed.rows[0].sourceRow).toBe(2);
    expect(parsed.dataset.validRows).toBe(parsed.rows.length);
  });

  it('finds the real Decade Properties annual inspection and sums its entries', () => {
    const project = byProject('I&T - FA Decade Properties Annual Fire Alarm Inspection 2 of 3 2026');
    expect(project?.classification).toBe('annual');
    expect(project?.totalHours).toBeGreaterThan(18);
    expect(project?.inspectorCount).toBe(2);
    expect(project?.effectiveYear).toBe(2026);
  });

  it('keeps real nurse call and service work out of fire alarm sites', () => {
    expect(byProject('Emerus - Ascension Menomonee Annual Nurse Call')?.classification).toBe(
      'excluded',
    );
    expect(byProject('SVC - FA I&T Dean Deerfield Clinic')?.classification).toBe('excluded');
    expect(byProject('SVC - FA I&T Investigate Rubins')?.classification).toBe('excluded');
  });

  it('keeps real unapproved rows visible but out of totals', () => {
    const project = byProject("I&T - FA St. Mary's Madison Hospital Annual Fire Alarm Inspection 2026 3 of 3");
    expect(project?.unapprovedHours).toBeGreaterThan(10);
    expect(project?.entries.some((entry) => !entry.row.approved)).toBe(true);
  });

  it('handles observed naming irregularities honestly', () => {
    const noFrequency = byProject('Rock Co. Human Services Fire Alarm Inspection 1 of 5');
    expect(noFrequency?.classification).toBe('review');
    const noAlarmWord = byProject('Verona High School Annual FA Inspection 2024');
    expect(noAlarmWord?.classification).toBe('annual');
    const missingAlarmWord = byProject('Reedsburg Human Services Annual Fire Alarm Inspection 2 of 3 2026');
    expect(missingAlarmWord?.classification).toBe('annual');
  });

  it('exposes separate site groups for the observed client locations', () => {
    expect(sites.length).toBeGreaterThan(1);
    expect(deriveSiteLabel('I&T - FA Decade Properties Annual Fire Alarm Inspection 2 of 3 2026')).toBe(
      'Decade Properties',
    );
    expect(
      inferServiceYear('I&T - FA Example Annual Fire Alarm Inspection 2 of 3 2025', [
        new Date('2026-01-15T00:00:00').getTime(),
      ]).year,
    ).toBe(2025);
  });
});
