/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildProjects, buildSiteSummaries, classifyProjectName, computeHistoryAverage, parseCsvTable, parseDtoolsTable, parseDurationHours, parseWorkDate, searchSites, selectionSummary } from './dtools';
import { readDtoolsFile } from './dtoolsImport';

const source = readFileSync(fileURLToPath(new URL('../../Time Sheets Oct 19, 2026 02 57.csv', import.meta.url)));
const oracle = JSON.parse(readFileSync(fileURLToPath(new URL('../../audit/source-verification.json', import.meta.url)), 'utf8'));
const table = parseCsvTable(source.toString('utf8'));
const input = { header: table[0], rows: table.slice(1), fileName: 'Time Sheets Oct 19, 2026 02 57.csv', fileType: 'csv' as const, sheetName: 'CSV', fingerprint: 'audit', datasetId: 'audit', importedAt: 1 };
const parsed = parseDtoolsTable(input);
const projects = buildProjects(parsed.rows);

describe('independent full-source reconciliation', () => {
  it('matches the unchanged source hash, every physical row and all 1,153 independent Decimal project sums', () => {
    expect(createHash('sha256').update(source).digest('hex')).toBe(oracle.source_sha256);
    expect(parsed.rows).toHaveLength(6380);
    expect(projects).toHaveLength(1153);
    expect(parsed.invalidRows).toEqual([]);
    expect(new Set(parsed.rows.map((row) => row.sourceRow)).size).toBe(6380);
    for (const independent of oracle.projects) {
      const project = projects.find((item) => item.projectNumber === independent.project_number && item.projectName === independent.project_name);
      expect(project, independent.project_number).toBeDefined();
      expect(project!.approvedHours, independent.project_number).toBeCloseTo(Number(independent.approved_hours), 7);
      expect(project!.unapprovedHours).toBeCloseTo(Number(independent.unapproved_hours), 7);
      expect(project!.entries.map((entry) => entry.row.sourceRow).sort((a, b) => a - b)).toEqual([...independent.source_rows].sort((a: number, b: number) => a - b));
      for (const entry of project!.entries) {
        const original = independent.rows.find((row: { source_row: number }) => row.source_row === entry.row.sourceRow);
        expect(entry.row.duration).toBe(Number(original.Duration));
        expect(entry.row.resource).toBe(original.Resource);
        expect(entry.row.clientName).toBe(original['Client Name']);
        expect(entry.row.projectNumber).toBe(original['Project Number']);
        expect(entry.row.projectName).toBe(original['Project Name']);
        expect(entry.row.taskName).toBe(original.Name);
        expect(entry.row.approved).toBe(original.Approved === 'True');
        const [month, day, year] = original.Date.split('/');
        expect(entry.row.date).toBe(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      }
      if (project!.included) {
        expect(project!.totalHours).toBeCloseTo(project!.entries.filter((entry) => entry.included).reduce((sum, entry) => sum + entry.row.duration, 0), 7);
        expect(project!.entries.filter((entry) => entry.included).every((entry) => entry.row.approved && !entry.row.taskFlag)).toBe(true);
      }
      if (/^(?:WAR )?SVC\b/i.test(project!.projectName) || /deficien|discrepanc|troubleshoot/i.test(project!.projectName)) expect(project!.included).toBe(false);
    }
  });

  it('reads the actual source through the real file importer and preserves its decimal hours', async () => {
    const file = new File([source], input.fileName);
    const actual = await readDtoolsFile(file);
    expect(actual.dataset.validRows).toBe(6380);
    expect(actual.dataset.projectCount).toBe(1153);
    expect(actual.rows[0].duration).toBe(0.46666667);
    expect(actual.rows[0].sourceRow).toBe(2);
  });

  it('imports all actual source values through a generated XLSX without changing hours or row mapping', async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const rows = table.map((row, index) => index === 0 ? row : row.map((cell, column) => column === 11 ? Number(cell) : cell));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Timesheets');
    const actual = await readDtoolsFile(new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'source-values.xlsx'));
    expect(actual.rows).toHaveLength(6380);
    expect(actual.rows.map((row) => [row.projectNumber, row.projectName, row.duration, row.approved, row.date, row.sourceRow])).toEqual(parsed.rows.map((row) => [row.projectNumber, row.projectName, row.duration, row.approved, row.date, row.sourceRow]));
  });

  it('independently verifies three annual years, both frequencies, and a missing-year legacy project', () => {
    const byNumber = (number: string) => projects.find((project) => project.projectNumber === number)!;
    for (const example of Object.values(oracle.review_examples) as Array<{ project_number: string; approved_hours: string }>) {
      expect(byNumber(example.project_number).approvedHours).toBeCloseTo(Number(example.approved_hours), 7);
    }
    expect(byNumber('25-1179').totalHours).toBeCloseTo(18.61666667, 7);
    expect(byNumber('24-1859').classification).toBe('review');
    expect(byNumber('25-0539').effectiveFrequency).toBe('Annual');
    expect(byNumber('25-2043').effectiveFrequency).toBe('Semi-Annual');
    expect(byNumber('25-0539').siteKey).toBe(byNumber('25-2043').siteKey);
    expect(byNumber('24-0179').classification).toBe('review');
    expect(byNumber('24-1718').classification).toBe('review');
    expect(byNumber('22-0253').classification).toBe('review');
    const selected = projects.filter((project) => ['22-0256', '23-1097', '24-1501'].includes(project.projectNumber));
    expect(selected).toHaveLength(3);
    expect(computeHistoryAverage(selected, new Set(selected.map((project) => project.key)), 'Annual').averagePerVisit).toBeCloseTo((115.5 + 795.896 + 857) / 3, 7);
    const summary = selectionSummary(selected, new Set(selected.map((project) => project.key)), 'Annual');
    expect(summary).toHaveLength(3);
    expect(summary.every((project) => project.entries?.length && project.entries.every((entry) => entry.row.sourceFile === input.fileName))).toBe(true);
    const crossYear = byNumber('23-0359');
    expect(crossYear.classification).toBe('annual');
    expect(crossYear.effectiveYear).toBe(2023);
    expect(crossYear.totalHours).toBeCloseTo(849.91666667, 7);
    expect(crossYear.entries.some((entry) => entry.row.date.startsWith('2024-'))).toBe(true);
  });

  it('joins the actual New Berlin UWCU and full-name history without merging other branches', () => {
    const sites = buildSiteSummaries(projects);
    const matches = searchSites(sites, 'New Berlin');
    const uw = matches.filter((site) => site.clientName === 'UW Credit Union');
    expect(uw).toHaveLength(1);
    const grouped = projects.filter((project) => project.siteKey === uw[0].siteKey);
    expect(grouped.map((project) => project.projectNumber).sort()).toEqual(['23-0519', '24-0186', '24-2222', '25-0942']);
    expect(grouped.find((project) => project.projectNumber === '24-0186')?.totalHours).toBe(10);
    expect(grouped.find((project) => project.projectNumber === '24-2222')?.totalHours).toBeCloseTo(12.65, 7);
    expect(grouped.find((project) => project.projectNumber === '25-0942')?.totalHours).toBeCloseTo(11.76666667, 7);
    expect(searchSites(sites, 'UW Credit Union').length).toBeGreaterThan(1);
  });

  it('searches original project titles and keeps parent-client locations separate', () => {
    const sites = buildSiteSummaries(projects);
    const matches = searchSites(sites, 'I&T - FA Decade Annual 2026');
    expect(matches.some((site) => site.siteLabel === 'Decade Properties')).toBe(true);
    expect(searchSites(sites, 'SSM').length).toBeGreaterThan(1);
    expect(new Set(searchSites(sites, 'SSM').map((site) => site.siteKey)).size).toBe(searchSites(sites, 'SSM').length);
  });
});

describe('import safety regressions', () => {
  it('flags incomplete project totals after a rejected row and honors manual project exclusion in source rows', () => {
    const rows = [table[1], [...table[2]]];
    rows[1][11] = 'invalid';
    const result = parseDtoolsTable({ ...input, rows });
    const [project] = buildProjects(result.rows);
    expect(project.classification).toBe('review');
    expect(project.included).toBe(false);
    const original = projects.find((item) => item.projectNumber === '25-1179')!;
    const [excluded] = buildProjects(original.entries.map((entry) => entry.row), new Map([[original.key, { ...original.decision, action: 'exclude' }]]));
    expect(excluded.entries.every((entry) => !entry.included)).toBe(true);
  });

  it('does not accept a partial total when a rejected sibling has both a missing name and an invalid date', () => {
    const rejected = [...table[2]];
    rejected[2] = 'invalid date';
    rejected[6] = '';
    const result = parseDtoolsTable({ ...input, rows: [table[1], rejected] });
    expect(result.invalidRows).toHaveLength(1);
    const [project] = buildProjects(result.rows);
    expect(project.classification).toBe('review');
    expect(project.included).toBe(false);
  });

  it('requires approval and identity columns, rejects malformed CSV, and parses seconds and fractional date serials correctly', () => {
    expect(() => parseDtoolsTable({ ...input, header: input.header.map((name) => name === 'Approved' ? 'Unknown' : name) })).toThrow(/Approved/);
    expect(() => parseCsvTable('a,b\n"unfinished')).toThrow(/unterminated/);
    expect(parseDurationHours('01:30:30')).toBeCloseTo(1.5083333333, 9);
    expect(parseWorkDate(45778.9)?.iso).toBe(parseWorkDate(45778)?.iso);
    expect(classifyProjectName('FA Annual Battery Replacement 2025').classification).toBe('excluded');
    expect(classifyProjectName('fa annual maintenance 2025').classification).toBe('review');
  });
});
