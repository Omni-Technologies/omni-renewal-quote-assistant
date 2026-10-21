import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, RefreshCw, Upload } from 'lucide-react';
import type { JobCostProject } from '../types';
import { replaceJobCost } from '../lib/db';
import { readJobCostFiles } from '../lib/dtoolsImport';
import { formatDateTime, formatHours } from '../lib/format';
import { reloadHistoryContext, useHistoryContext } from '../lib/historyContextStore';
import { summarizeJobCost } from '../lib/jobCost';
import { Banner, ConfirmDialog } from './ui';

const TIMESHEET_LABEL: Record<NonNullable<JobCostProject['timesheet']>['status'], string> = {
  match: 'Matches timesheet',
  'approved-match': 'Matches approved',
  mismatch: 'Differs',
  'before-timesheet': 'Before timesheet export',
  'not-in-timesheet': 'Not in timesheet',
};

const TIMESHEET_STYLE: Record<NonNullable<JobCostProject['timesheet']>['status'], string> = {
  match: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  'approved-match': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  mismatch: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  'before-timesheet': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  'not-in-timesheet': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function averageLabel(average: { average: number | null; count: number }): string {
  return average.average === null ? '—' : `${formatHours(average.average)} (${average.count})`;
}

/** Average budgeted, actual and travel-budget hours for the pricing block. */
export function JobCostAverageStats({ projects }: { projects: readonly JobCostProject[] }) {
  const summary = summarizeJobCost(projects);
  return (
    <div className="workspace-stat-grid mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Stat label="D-Tools avg budgeted hrs" value={averageLabel(summary.budgeted)} />
      <Stat label="D-Tools avg actual hrs" value={averageLabel(summary.actual)} />
      <Stat label="D-Tools avg travel (budget)" value={averageLabel(summary.travel)} />
    </div>
  );
}

/** Import and summary of the D-Tools "Project Job Cost (By Phase)" workbooks. */
export function JobCostImportPanel({
  notify,
}: {
  notify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
}) {
  const history = useHistoryContext();
  const dataset = history.jobCostDataset;
  const [importing, setImporting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const summary = useMemo(
    () => summarizeJobCost(history.jobCostProjects.filter((project) => project.included)),
    [history.jobCostProjects],
  );
  const mismatches = history.jobCostProjects.filter((project) => project.timesheet?.status === 'mismatch').length;

  function chooseFiles(files: File[]) {
    setError(null);
    if (files.length === 0) return;
    if (dataset) {
      setPendingFiles(files);
      return;
    }
    void performImport(files);
  }

  async function performImport(files: File[]) {
    setImporting(true);
    setError(null);
    try {
      const parsed = await readJobCostFiles(files);
      await replaceJobCost(parsed.dataset, parsed.records);
      await reloadHistoryContext();
      setWarnings(parsed.warnings.slice(0, 8));
      notify(`Imported ${parsed.dataset.projectCount.toLocaleString()} job-cost projects from ${files.length} workbook${files.length === 1 ? '' : 's'}.`);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : 'The job-cost workbooks could not be imported.';
      setError(message);
      notify(message, 'danger');
    } finally {
      setImporting(false);
      setPendingFiles(null);
    }
  }

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <FileSpreadsheet className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
              Budgeted &amp; actual hours (Project Job Cost)
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {dataset
                ? `${dataset.files.map((file) => file.fileName).join(' · ')} · imported ${formatDateTime(dataset.importedAt)}`
                : 'Import the D-Tools Project Job Cost (By Phase) Excel exports. Select every workbook at once; they are combined.'}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : dataset ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {dataset ? 'Replace job-cost workbooks' : 'Import job-cost workbooks'}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          aria-label="Import D-Tools project job-cost workbooks"
          onChange={(event) => {
            chooseFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </div>

      {dataset ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Projects" value={dataset.projectCount.toLocaleString()} />
          <Stat label="Inspection projects" value={summary.projectCount.toLocaleString()} />
          <Stat label="Avg budgeted" value={averageLabel(summary.budgeted)} />
          <Stat label="Avg actual" value={averageLabel(summary.actual)} />
          <Stat label="Avg travel budget" value={averageLabel(summary.travel)} />
          <Stat
            label="Timesheet check"
            value={history.timesheetProjects
              ? `${summary.matchedTimesheet}/${summary.comparedTimesheet} match`
              : 'No timesheet'}
          />
        </div>
      ) : null}
      {dataset && mismatches > 0 ? (
        <div className="mt-2 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
          {mismatches} project{mismatches === 1 ? '' : 's'} have actual hours that differ from the
          timesheet export. They are marked “Differs” in each site’s history.
        </div>
      ) : null}
      {warnings.map((warning) => (
        <div key={warning} className="mt-1 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
          {warning}
        </div>
      ))}
      {error ? (
        <div className="mt-2">
          <Banner severity="danger">{error}</Banner>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingFiles !== null}
        title="Replace the job-cost history?"
        confirmLabel={importing ? 'Importing…' : 'Replace job cost'}
        confirmDisabled={importing}
        onConfirm={() => {
          if (pendingFiles) void performImport(pendingFiles);
        }}
        onCancel={() => setPendingFiles(null)}
        description={
          <div className="space-y-2">
            <p>
              The imported job-cost workbooks will be replaced by{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {pendingFiles?.map((file) => file.name).join(', ')}
              </span>
              .
            </p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Select every job-cost workbook together. Saved renewals, timesheet history and manual
              project decisions are kept.
            </p>
          </div>
        }
      />
    </div>
  );
}

/** Budgeted vs actual hours per project, with the timesheet comparison. */
export function JobCostTable({
  projects,
  title = 'Budgeted vs actual hours (D-Tools job cost)',
  emptyText,
}: {
  projects: readonly JobCostProject[];
  title?: string;
  emptyText?: string;
}) {
  const summary = useMemo(() => summarizeJobCost(projects), [projects]);
  return (
    <div className="space-y-2">
      <div>
        <div className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Averages skip zero-hour projects. Travel is the budgeted Travel phase.
        </div>
      </div>
      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-[12px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyText ?? 'No matching job-cost projects.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Avg budgeted" value={averageLabel(summary.budgeted)} />
            <Stat label="Avg actual" value={averageLabel(summary.actual)} />
            <Stat label="Avg travel budget" value={averageLabel(summary.travel)} />
            <Stat
              label="Timesheet check"
              value={summary.comparedTimesheet > 0
                ? `${summary.matchedTimesheet}/${summary.comparedTimesheet} match`
                : 'Not compared'}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                  <th className="px-2 py-1.5">Year</th>
                  <th className="px-2 py-1.5">Project</th>
                  <th className="px-2 py-1.5">Project #</th>
                  <th className="px-2 py-1.5 text-right">Budgeted</th>
                  <th className="px-2 py-1.5 text-right">Actual</th>
                  <th className="px-2 py-1.5 text-right">Travel</th>
                  <th className="px-2 py-1.5">Timesheet</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.record.id} className="border-t border-slate-100 align-middle dark:border-slate-800">
                    <td className="whitespace-nowrap px-2 py-2 text-[12.5px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {project.year ?? '—'}
                      {project.yearSource === 'start-date' || project.yearSource === 'timesheet' ? (
                        <span className="ml-1 text-[9px] font-medium uppercase text-amber-600 dark:text-amber-400">
                          inferred
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[360px] px-2 py-2">
                      <div className="text-[12px] font-medium text-slate-800 dark:text-slate-200">
                        {project.record.projectName}
                      </div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                        {[project.record.status, project.record.startDate, project.record.resources]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[11.5px] text-slate-600 dark:text-slate-300">
                      {project.record.projectNumber || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-[12px] tabular-nums text-slate-700 dark:text-slate-200">
                      {formatHours(project.record.budgetedHours)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatHours(project.record.actualHours)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-[12px] tabular-nums text-slate-700 dark:text-slate-200">
                      {project.record.sharedPhaseBlock ? 'Shared' : formatHours(project.travelBudgetedHours)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {project.timesheet ? (
                        <span
                          className={`chip ${TIMESHEET_STYLE[project.timesheet.status]}`}
                          title={project.timesheet.totalHours === null
                            ? undefined
                            : `Timesheet ${formatHours(project.timesheet.totalHours)} (approved ${formatHours(project.timesheet.approvedHours)})`}
                        >
                          {project.timesheet.status === 'mismatch'
                            ? `Differs ${formatHours(project.timesheet.difference)}`
                            : TIMESHEET_LABEL[project.timesheet.status]}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
