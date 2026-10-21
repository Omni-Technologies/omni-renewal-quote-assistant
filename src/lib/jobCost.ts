import type {
  DtoolsProject,
  DtoolsProjectDecision,
  JobCostDataset,
  JobCostPhase,
  JobCostProject,
  JobCostRecord,
  Renewal,
} from '../types';
import {
  classifyProjectName,
  collapseSpaces,
  contractPositionOf,
  deriveSiteLabel,
  normalizeText,
  parseWorkDate,
  projectKeyFor,
  siteKeyFor,
  titleYears,
} from './dtools';

/* ------------------------------------------------------------------------- */
/* "Project Job Cost (By Phase)" workbook parsing                            */
/* ------------------------------------------------------------------------- */

/**
 * The export is a sequence of blocks: a project header row, one or more project
 * rows, a phase header row, phase rows, then a "Total:" footer. Column sets can
 * differ per block, so every header row is mapped by name.
 */
export interface JobCostTableInput {
  table: unknown[][];
  fileName: string;
  sheetName: string;
  datasetId: string;
  fileIndex: number;
  date1904?: boolean;
}

export interface ParsedJobCostTable {
  records: JobCostRecord[];
  warnings: string[];
}

const TIMESHEET_TOLERANCE = 0.01;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return collapseSpaces(String(value));
}

function headerMap(row: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  row.forEach((cell, index) => {
    const key = normalizeText(cellText(cell));
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function numberCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateCell(value: unknown, date1904: boolean): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const serial = date1904 ? value + 1462 : value;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  return parseWorkDate(value)?.iso ?? null;
}

export function isJobCostHeader(row: unknown[]): boolean {
  const map = headerMap(row);
  return cellText(row[0]) === 'Client' &&
    ['name', 'number', 'budgeted hours', 'actual hours'].every((key) => map.has(key));
}

export function parseJobCostTable(input: JobCostTableInput): ParsedJobCostTable {
  const { table, fileName, sheetName, datasetId, fileIndex, date1904 = false } = input;
  const records: JobCostRecord[] = [];
  const warnings: string[] = [];
  let header: Map<string, number> | null = null;
  let phaseHeader: Map<string, number> | null = null;
  let mode: 'projects' | 'phases' | 'done' = 'done';
  let blockProjects: JobCostRecord[] = [];
  let phases: JobCostPhase[] = [];
  let sawHeader = false;

  const get = (row: unknown[], map: Map<string, number>, key: string) => {
    const index = map.get(key);
    return index === undefined ? null : row[index];
  };

  const flush = () => {
    const shared = blockProjects.length > 1;
    for (const record of blockProjects) {
      records.push({
        ...record,
        phases: shared ? [] : phases,
        sharedPhaseBlock: shared && phases.length > 0,
      });
    }
    blockProjects = [];
    phases = [];
    phaseHeader = null;
    mode = 'done';
  };

  for (let index = 0; index < table.length; index += 1) {
    const row = table[index] ?? [];
    const sourceRow = index + 1;
    const first = cellText(row[0]);
    const second = cellText(row[1]);

    if (first === 'Client') {
      flush();
      if (!isJobCostHeader(row)) {
        throw new Error(`Row ${sourceRow} of ${fileName} is a project header without Name, Number, Budgeted Hours and Actual Hours columns.`);
      }
      header = headerMap(row);
      sawHeader = true;
      mode = 'projects';
      continue;
    }
    if (first === 'Grand Total:') {
      flush();
      break;
    }
    if (!header) continue;

    if (mode === 'projects') {
      if (!first && second === 'Phase') {
        phaseHeader = headerMap(row);
        mode = 'phases';
        continue;
      }
      const name = cellText(get(row, header, 'name'));
      if (!name) continue;
      const number = cellText(get(row, header, 'number'));
      const budgetedHours = numberCell(get(row, header, 'budgeted hours'));
      const actualHours = numberCell(get(row, header, 'actual hours'));
      if (!number || budgetedHours === null || actualHours === null) {
        warnings.push(`Skipped row ${sourceRow} of ${fileName}: missing project number or hours.`);
        continue;
      }
      blockProjects.push({
        id: `${datasetId}:${fileIndex}:${sourceRow}`,
        datasetId,
        sourceFile: fileName,
        sourceSheet: sheetName,
        sourceRow,
        clientName: cellText(get(row, header, 'client')),
        projectName: name,
        projectNumber: number,
        status: cellText(get(row, header, 'status')),
        state: cellText(get(row, header, 'state')),
        startDate: dateCell(get(row, header, 'start date'), date1904),
        budgetedHours,
        actualHours,
        budgetedLaborCost: numberCell(get(row, header, 'budgeted labor cost')),
        actualLaborCost: numberCell(get(row, header, 'actual labor cost')),
        projectManager: cellText(get(row, header, 'project manager')),
        resources: cellText(get(row, header, 'resources')),
        phases: [],
        sharedPhaseBlock: false,
      });
      continue;
    }

    if (mode === 'phases' && phaseHeader && !first && second) {
      if (second === 'Total:') {
        mode = 'done';
        continue;
      }
      const budgeted = numberCell(get(row, phaseHeader, 'budgeted hours'));
      const actual = numberCell(get(row, phaseHeader, 'actual hours'));
      if (budgeted === null || actual === null) {
        warnings.push(`Ignored phase "${second}" on row ${sourceRow} of ${fileName}: missing hours.`);
        continue;
      }
      phases.push({
        name: second,
        budgetedHours: budgeted,
        actualHours: actual,
        budgetedLaborCost: numberCell(get(row, phaseHeader, 'budgeted labor cost')),
        budgetedProductCost: numberCell(get(row, phaseHeader, 'budgeted product cost')),
      });
    }
  }
  flush();

  if (!sawHeader) {
    throw new Error(`${fileName} is not a D-Tools Project Job Cost (By Phase) export.`);
  }
  if (records.length === 0) {
    throw new Error(`${fileName} contains no project rows.`);
  }
  return { records, warnings };
}

/**
 * Combines several parsed exports into one dataset. The same project may appear
 * in more than one file only when its hours agree; otherwise the import stops,
 * because silently choosing one would hide a D-Tools discrepancy.
 */
export function mergeJobCostFiles(
  datasetId: string,
  importedAt: number,
  files: Array<{ fileName: string; sheetName: string; fingerprint: string; records: JobCostRecord[] }>,
): { dataset: JobCostDataset; records: JobCostRecord[]; warnings: string[] } {
  const byKey = new Map<string, JobCostRecord>();
  const warnings: string[] = [];
  const fingerprints = new Set<string>();
  for (const file of files) {
    if (fingerprints.has(file.fingerprint)) {
      throw new Error(`${file.fileName} was selected twice.`);
    }
    fingerprints.add(file.fingerprint);
    for (const record of file.records) {
      const key = projectKeyFor(record.projectNumber, record.projectName);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, record);
        continue;
      }
      if (
        Math.abs(existing.budgetedHours - record.budgetedHours) > TIMESHEET_TOLERANCE ||
        Math.abs(existing.actualHours - record.actualHours) > TIMESHEET_TOLERANCE
      ) {
        throw new Error(
          `Project ${record.projectNumber} appears in ${existing.sourceFile} row ${existing.sourceRow} and ${record.sourceFile} row ${record.sourceRow} with different hours.`,
        );
      }
      warnings.push(`Project ${record.projectNumber} appears twice; kept ${existing.sourceFile} row ${existing.sourceRow}.`);
    }
  }
  const records = [...byKey.values()];
  return {
    dataset: {
      id: datasetId,
      importedAt,
      projectCount: records.length,
      files: files.map((file) => ({
        fileName: file.fileName,
        sheetName: file.sheetName,
        fingerprint: file.fingerprint,
        projectCount: records.filter((record) => record.sourceFile === file.fileName).length,
      })),
    },
    records,
    warnings,
  };
}

/* ------------------------------------------------------------------------- */
/* Derived project view                                                      */
/* ------------------------------------------------------------------------- */

interface TimesheetTotals {
  totalHours: number;
  approvedHours: number;
}

function numberKey(projectNumber: string): string {
  return normalizeText(projectNumber);
}

export function timesheetStartYear(projects: readonly DtoolsProject[]): number | null {
  if (projects.length === 0) return null;
  return Number(projects.reduce((min, project) => project.firstDate < min ? project.firstDate : min, projects[0].firstDate).slice(0, 4));
}

/**
 * Builds the job-cost view. Manual decisions are shared with the timesheet
 * explorer by project key, so an include/exclude or year correction made there
 * applies here too. Timesheet hours are compared by project number.
 */
export function buildJobCostProjects(
  records: readonly JobCostRecord[],
  decisions: ReadonlyMap<string, DtoolsProjectDecision>,
  timesheetProjects: readonly DtoolsProject[] | null,
): JobCostProject[] {
  const totals = new Map<string, TimesheetTotals>();
  const timesheetByKey = new Map<string, DtoolsProject>();
  const timesheetYear = new Map<string, number>();
  for (const project of timesheetProjects ?? []) {
    timesheetByKey.set(project.key, project);
    const key = numberKey(project.projectNumber);
    if (!key) continue;
    const current = totals.get(key) ?? { totalHours: 0, approvedHours: 0 };
    current.totalHours += project.approvedHours + project.unapprovedHours;
    current.approvedHours += project.approvedHours;
    totals.set(key, current);
    if (project.effectiveYear !== null && !timesheetYear.has(key)) {
      timesheetYear.set(key, project.effectiveYear);
    }
  }
  const startYear = timesheetProjects ? timesheetStartYear(timesheetProjects) : null;

  return records.map((record) => {
    const key = projectKeyFor(record.projectNumber, record.projectName);
    const decision = decisions.get(key);
    const classified = classifyProjectName(record.projectName);
    const frequency = decision?.frequency ?? classified.frequency;
    const years = titleYears(record.projectName);
    const number = numberKey(record.projectNumber);

    let year: number | null = null;
    let yearSource: JobCostProject['yearSource'] = null;
    if (decision?.year != null) {
      year = decision.year;
      yearSource = 'manual';
    } else if (years.length === 1) {
      year = years[0];
      yearSource = 'title';
    } else if (timesheetYear.has(number)) {
      year = timesheetYear.get(number) ?? null;
      yearSource = 'timesheet';
    } else if (record.startDate) {
      year = Number(record.startDate.slice(0, 4));
      yearSource = 'start-date';
    }

    let included: boolean;
    if (decision?.action === 'exclude') included = false;
    else if (decision?.action === 'include') included = frequency !== null;
    else {
      included =
        classified.classification === 'annual' ||
        classified.classification === 'semi-annual' ||
        (timesheetByKey.get(key)?.included ?? false);
    }

    const travel = record.phases.find((phase) => /^travel$/i.test(phase.name));
    let timesheet: JobCostProject['timesheet'] = null;
    if (timesheetProjects) {
      const found = totals.get(number);
      if (found) {
        const difference = round2(record.actualHours - found.totalHours);
        timesheet = {
          status: Math.abs(difference) <= TIMESHEET_TOLERANCE
            ? 'match'
            : Math.abs(record.actualHours - found.approvedHours) <= TIMESHEET_TOLERANCE
              ? 'approved-match'
              : 'mismatch',
          totalHours: round2(found.totalHours),
          approvedHours: round2(found.approvedHours),
          difference,
        };
      } else {
        timesheet = {
          status: year !== null && startYear !== null && year < startYear
            ? 'before-timesheet'
            : 'not-in-timesheet',
          totalHours: null,
          approvedHours: null,
          difference: null,
        };
      }
    }

    return {
      record,
      key,
      siteKey: siteKeyFor(record.clientName, record.projectName),
      siteLabel: deriveSiteLabel(record.projectName),
      classification: classified.classification,
      frequency,
      year,
      yearSource,
      contractPosition: contractPositionOf(record.projectName),
      included,
      travelBudgetedHours: travel ? travel.budgetedHours : null,
      timesheet,
    };
  });
}

/* ------------------------------------------------------------------------- */
/* Averages and renewal matching                                             */
/* ------------------------------------------------------------------------- */

export interface JobCostAverage {
  average: number | null;
  count: number;
}

export interface JobCostSummary {
  projectCount: number;
  budgeted: JobCostAverage;
  actual: JobCostAverage;
  /** Budgeted Travel phase hours; zero-hour (cost-only) travel is skipped. */
  travel: JobCostAverage;
  matchedTimesheet: number;
  comparedTimesheet: number;
}

function averageOf(values: number[]): JobCostAverage {
  const counted = values.filter((value) => value > 0);
  return {
    average: counted.length ? round2(counted.reduce((sum, value) => sum + value, 0) / counted.length) : null,
    count: counted.length,
  };
}

/** Per-project averages. Zero hours mean "not recorded" and are skipped. */
export function summarizeJobCost(projects: readonly JobCostProject[]): JobCostSummary {
  const compared = projects.filter((project) =>
    project.timesheet && ['match', 'approved-match', 'mismatch'].includes(project.timesheet.status));
  return {
    projectCount: projects.length,
    budgeted: averageOf(projects.map((project) => project.record.budgetedHours)),
    actual: averageOf(projects.map((project) => project.record.actualHours)),
    travel: averageOf(projects.map((project) => project.travelBudgetedHours ?? 0)),
    matchedTimesheet: compared.filter((project) => project.timesheet?.status === 'match').length,
    comparedTimesheet: compared.length,
  };
}

export function sortJobCostProjects(projects: readonly JobCostProject[]): JobCostProject[] {
  return [...projects].sort(
    (a, b) =>
      (b.year ?? 0) - (a.year ?? 0) ||
      b.record.projectNumber.localeCompare(a.record.projectNumber),
  );
}

/** Included job-cost projects for one historical site and frequency. */
export function jobCostForSite(
  projects: readonly JobCostProject[],
  siteKey: string,
  frequency: 'Annual' | 'Semi-Annual' | null,
): JobCostProject[] {
  return sortJobCostProjects(projects.filter((project) =>
    project.siteKey === siteKey &&
    project.included &&
    (frequency === null || project.frequency === frequency)));
}

/**
 * Finds the renewal's site from the timesheet projects applied to it, its
 * D-Tools project number, and finally its client and location names.
 */
export function jobCostForRenewal(
  renewal: Renewal,
  projects: readonly JobCostProject[],
  timesheetProjects: readonly DtoolsProject[] = [],
): JobCostProject[] {
  const summary = renewal.labor.importSummary;
  const numbers = new Set(
    [
      renewal.company.dtoolsProjectNumber,
      ...(summary?.projects.map((project) => project.projectNumber) ?? []),
    ]
      .map(numberKey)
      .filter(Boolean),
  );
  const projectKeys = new Set(summary?.projects.map((project) => project.projectKey) ?? []);
  const siteKeys = new Set<string>();
  for (const project of projects) {
    if (numbers.has(numberKey(project.record.projectNumber))) siteKeys.add(project.siteKey);
  }
  for (const project of timesheetProjects) {
    if (projectKeys.has(project.key)) siteKeys.add(project.siteKey);
  }
  if (summary?.clientName && summary.siteLabel) {
    siteKeys.add(siteKeyFor(summary.clientName, summary.siteLabel));
  }
  if (siteKeys.size === 0 && renewal.company.clientName.trim() && renewal.company.locationName.trim()) {
    siteKeys.add(siteKeyFor(renewal.company.clientName, renewal.company.locationName));
  }
  const frequency = renewal.company.inspectionFrequency;
  const wanted = frequency === 'Annual' || frequency === 'Semi-Annual' ? frequency : null;
  return sortJobCostProjects(projects.filter((project) =>
    siteKeys.has(project.siteKey) &&
    project.included &&
    (wanted === null || project.frequency === wanted)));
}
