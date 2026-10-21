import type {
  DtoolsProject,
  DtoolsProjectDecision,
  JobCostProject,
  JobCostRecord,
  JobCostTimesheetStatus,
} from '../types';
import { classifyProjectName, defaultDecision, normalizeText, titleYears } from './dtools';
import { buildJobCostProjects } from './jobCost';

/**
 * One inspection history built from both D-Tools exports. Job cost is the
 * primary source: every occurrence with a job-cost record counts its job-cost
 * actual hours. The timesheet fills in occurrences with no job-cost record (or
 * one with no actual hours yet) and is kept as a cross-check, with its eligible
 * hours on `timesheetHours` and its rows still viewable. Job-cost projects with
 * no timesheet rows for their project number become occurrences of their own.
 * Every occurrence links to its job-cost record so budgeted hours can be
 * compared with actuals and with a new quote.
 *
 * `projects` has the same shape as the timesheet explorer's projects, so site
 * grouping, search, default selection, averages and apply work unchanged.
 */
export interface UnifiedHistory {
  projects: DtoolsProject[];
  jobCost: JobCostProject[];
  /** Job-cost record for an occurrence, keyed by the occurrence's project key. */
  jobCostByKey: Map<string, JobCostProject>;
}

const JOB_COST_STATUS_REASON: Partial<Record<JobCostTimesheetStatus, string>> = {
  'before-timesheet': 'Before the timesheet export starts.',
  'not-in-timesheet': 'Project number has no rows in the timesheet export.',
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A timesheet occurrence re-counted at its linked job-cost actual hours. */
function withJobCostHours(project: DtoolsProject, jobCost: JobCostProject): DtoolsProject {
  const actual = jobCost.record.actualHours;
  if (actual <= 0) {
    return {
      ...project,
      reasons: [...project.reasons, 'Job-cost record has no actual hours yet; timesheet hours are counted.'],
    };
  }
  const difference = round2(actual - project.totalHours);
  const reasons = [...project.reasons, 'Hours are D-Tools job-cost actual hours; timesheet rows are a cross-check.'];
  if (Math.abs(difference) > 0.01) {
    reasons.push(`Timesheet counts ${round2(project.totalHours)} h; job cost is ${difference > 0 ? '+' : ''}${difference} h different.`);
  }
  return {
    ...project,
    reasons,
    totalHours: actual,
    timesheetHours: project.totalHours,
    source: 'job-cost',
  };
}

function jobCostOnlyProject(
  project: JobCostProject,
  decision: DtoolsProjectDecision,
  sharesTimesheetNumber: boolean,
): DtoolsProject {
  const { record } = project;
  const automaticYears = titleYears(record.projectName);
  const serviceYear =
    automaticYears.length === 1
      ? automaticYears[0]
      : record.startDate
        ? Number(record.startDate.slice(0, 4))
        : null;
  const effectiveYear = project.year;
  const effectiveFrequency = project.frequency;
  const hasHours = record.actualHours > 0;
  const reasons = [
    'From the D-Tools job-cost export only; hours are job-cost actual hours.',
    `D-Tools status: ${record.status || 'not recorded'}.`,
  ];
  const statusReason = project.timesheet ? JOB_COST_STATUS_REASON[project.timesheet.status] : undefined;
  if (statusReason) reasons.push(statusReason);
  if (project.yearSource === 'start-date') reasons.push('Inspection year taken from the project start date.');
  if (!hasHours) reasons.push('No actual hours recorded; excluded from averages.');
  // Its hours may already be in a timesheet project with the same number; never count it twice.
  if (sharesTimesheetNumber) {
    reasons.push('Project number also has timesheet rows under another title; review before including.');
  }
  if (decision.frequency !== null) reasons.push(`Manual frequency correction: ${decision.frequency}.`);
  if (decision.year !== null) reasons.push(`Manual inspection-year correction: ${decision.year}.`);
  if (decision.action !== 'auto') reasons.push(`Manual project decision: ${decision.action}.`);

  return {
    key: project.key,
    projectNumber: record.projectNumber,
    projectName: record.projectName,
    clientName: record.clientName,
    siteKey: project.siteKey,
    siteLabel: project.siteLabel,
    classification: project.classification,
    frequency: classifyProjectName(record.projectName).frequency,
    serviceYear,
    yearSource:
      project.yearSource === 'title' || project.yearSource === 'manual'
        ? project.yearSource
        : project.yearSource === null ? null : 'work-dates',
    reasons,
    contractPosition: project.contractPosition,
    firstDate: record.startDate ?? '',
    lastDate: record.startDate ?? '',
    entryCount: 0,
    inspectorCount: 0,
    totalHours: record.actualHours,
    approvedHours: record.actualHours,
    unapprovedHours: 0,
    flaggedEntries: 0,
    flaggedHours: 0,
    needsReview: project.classification === 'review' || effectiveYear === null || !hasHours || sharesTimesheetNumber,
    decision,
    effectiveFrequency,
    effectiveYear,
    included:
      project.included && hasHours && effectiveYear !== null && effectiveFrequency !== null &&
      (!sharesTimesheetNumber || decision.action === 'include'),
    entries: [],
    source: 'job-cost',
  };
}

export function buildUnifiedHistory(
  timesheetProjects: readonly DtoolsProject[] | null,
  jobCostRecords: readonly JobCostRecord[],
  decisions: ReadonlyMap<string, DtoolsProjectDecision>,
): UnifiedHistory {
  const timesheet = timesheetProjects ?? [];
  const jobCost = buildJobCostProjects(jobCostRecords, decisions, timesheetProjects);
  const jobCostByKey = new Map<string, JobCostProject>();
  const byNumber = new Map<string, JobCostProject[]>();
  for (const project of jobCost) {
    const number = normalizeText(project.record.projectNumber);
    if (!number) continue;
    byNumber.set(number, [...(byNumber.get(number) ?? []), project]);
  }

  const timesheetKeys = new Set(timesheet.map((project) => project.key));
  const timesheetNumbers = new Set<string>();
  const proposed = new Map<string, JobCostProject>();
  const claims = new Map<string, number>();
  for (const project of timesheet) {
    const number = normalizeText(project.projectNumber);
    const candidates = number ? byNumber.get(number) ?? [] : [];
    if (number) timesheetNumbers.add(number);
    const linked = candidates.find((candidate) => candidate.key === project.key) ??
      (candidates.length === 1 ? candidates[0] : undefined);
    if (!linked) continue;
    proposed.set(project.key, linked);
    claims.set(linked.key, (claims.get(linked.key) ?? 0) + 1);
  }
  const counted: DtoolsProject[] = [];
  for (const project of timesheet) {
    const linked = proposed.get(project.key);
    // One job-cost record counts once: a number-only match is dropped when another
    // timesheet occurrence matches the record exactly or also claims it.
    if (linked && linked.key !== project.key && ((claims.get(linked.key) ?? 0) > 1 || timesheetKeys.has(linked.key))) {
      counted.push({
        ...project,
        reasons: [...project.reasons, `Job-cost record ${linked.record.projectNumber} is shared with another timesheet occurrence; timesheet hours are counted.`],
      });
      continue;
    }
    if (linked) jobCostByKey.set(project.key, linked);
    counted.push(linked ? withJobCostHours(project, linked) : project);
  }
  const linkedJobCost = new Set([...jobCostByKey.values()].map((project) => project.key));

  const added: DtoolsProject[] = [];
  for (const project of jobCost) {
    const number = normalizeText(project.record.projectNumber);
    if (linkedJobCost.has(project.key) || timesheetKeys.has(project.key)) continue;
    const decision = decisions.get(project.key);
    // Unrelated work stays out of the history unless someone included it.
    if (project.classification === 'excluded' && decision?.action !== 'include') continue;
    added.push(jobCostOnlyProject(project, decision ?? defaultDecision({
      key: project.key,
      projectNumber: project.record.projectNumber,
      projectName: project.record.projectName,
    }), Boolean(number && timesheetNumbers.has(number))));
    jobCostByKey.set(project.key, project);
  }

  return { projects: [...counted, ...added], jobCost, jobCostByKey };
}

/** One flat row per occurrence, for tables and spreadsheet exports. */
export interface HistoryOccurrenceRow {
  key: string;
  clientName: string;
  siteLabel: string;
  year: number | null;
  frequency: 'Annual' | 'Semi-Annual' | null;
  projectNumber: string;
  projectName: string;
  /** Which exports have this occurrence. */
  source: 'timesheet' | 'job-cost' | 'both';
  /** Export whose hours are counted: job cost whenever it has actual hours. */
  hoursSource: 'timesheet' | 'job-cost';
  included: boolean;
  /** Hours used for averages: job-cost actual hours, or timesheet hours where job cost has none. */
  hours: number;
  /** Eligible (approved, counted) timesheet hours; null without timesheet rows. */
  timesheetHours: number | null;
  jobCostActualHours: number | null;
  budgetedHours: number | null;
  travelBudgetedHours: number | null;
  /** Job-cost actual minus eligible timesheet hours; null without both, or when job cost has no hours yet. */
  difference: number | null;
  /** True when timesheet hours confirm the job-cost actual hours (within 0.01 h). */
  timesheetVerified: boolean;
  timesheetStatus: JobCostTimesheetStatus | null;
  jobCostStatus: string | null;
}

export function occurrenceRows(
  history: UnifiedHistory,
  projects: readonly DtoolsProject[] = history.projects,
): HistoryOccurrenceRow[] {
  return projects.map((project) => {
    const jobCost = history.jobCostByKey.get(project.key) ?? null;
    const timesheetHours = project.source === 'job-cost'
      ? project.timesheetHours ?? null
      : project.totalHours;
    const difference = jobCost && jobCost.record.actualHours > 0 && timesheetHours !== null
      ? round2(jobCost.record.actualHours - timesheetHours)
      : null;
    return {
      key: project.key,
      clientName: project.clientName,
      siteLabel: project.siteLabel,
      year: project.effectiveYear,
      frequency: project.effectiveFrequency,
      projectNumber: project.projectNumber,
      projectName: project.projectName,
      source: timesheetHours === null ? 'job-cost' : jobCost ? 'both' : 'timesheet',
      hoursSource: project.source ?? 'timesheet',
      included: project.included,
      hours: project.totalHours,
      timesheetHours,
      jobCostActualHours: jobCost?.record.actualHours ?? null,
      budgetedHours: jobCost?.record.budgetedHours ?? null,
      travelBudgetedHours: jobCost?.travelBudgetedHours ?? null,
      difference,
      timesheetVerified: difference !== null && Math.abs(difference) <= 0.01,
      timesheetStatus: jobCost?.timesheet?.status ?? null,
      jobCostStatus: jobCost?.record.status ?? null,
    };
  });
}
