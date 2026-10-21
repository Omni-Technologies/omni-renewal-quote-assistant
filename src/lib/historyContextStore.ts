import { useMemo, useSyncExternalStore } from 'react';
import type { DtoolsProject, JobCostDataset, JobCostProject, Renewal } from '../types';
import { loadDtoolsHistory, loadJobCost } from './db';
import { buildProjects } from './dtools';
import { buildJobCostProjects, jobCostForRenewal } from './jobCost';

/**
 * Read-only history shared by the renewal workspace: job-cost projects with
 * their timesheet comparison, and the verified timesheet projects used to find
 * a renewal's site. Loaded lazily and reloaded after imports, decision edits
 * and restores.
 */
export interface HistoryContext {
  loaded: boolean;
  jobCostDataset: JobCostDataset | null;
  jobCostProjects: JobCostProject[];
  /** Null when no timesheet history is imported. */
  timesheetProjects: DtoolsProject[] | null;
}

const EMPTY: HistoryContext = {
  loaded: false,
  jobCostDataset: null,
  jobCostProjects: [],
  timesheetProjects: null,
};

let snapshot = EMPTY;
let started = false;
let generation = 0;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

async function reload(): Promise<void> {
  const current = ++generation;
  try {
    const [jobCost, timesheet] = await Promise.all([loadJobCost(), loadDtoolsHistory()]);
    if (current !== generation) return;
    const decisions = new Map((timesheet?.decisions ?? []).map((decision) => [decision.key, decision]));
    const timesheetProjects = timesheet ? buildProjects(timesheet.rows, decisions) : null;
    snapshot = {
      loaded: true,
      jobCostDataset: jobCost?.dataset ?? null,
      jobCostProjects: jobCost ? buildJobCostProjects(jobCost.projects, decisions, timesheetProjects) : [],
      timesheetProjects,
    };
  } catch (error) {
    console.error('History context load failed', error);
    if (current !== generation) return;
    snapshot = { ...EMPTY, loaded: true };
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    void reload();
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Reloads now, for example right after an import. */
export function reloadHistoryContext(): Promise<void> {
  started = true;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = null;
  return reload();
}

/** Reloads shortly after a change; bursts of decision edits share one reload. */
export function invalidateHistoryContext(): void {
  if (!started) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    void reload();
  }, 250);
}

export function useHistoryContext(): HistoryContext {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/** Included job-cost projects for the renewal's site and frequency; null without job-cost history. */
export function useRenewalJobCost(renewal: Renewal): JobCostProject[] | null {
  const history = useHistoryContext();
  return useMemo(
    () => history.jobCostDataset
      ? jobCostForRenewal(renewal, history.jobCostProjects, history.timesheetProjects ?? [])
      : null,
    [renewal, history],
  );
}
