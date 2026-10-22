import { Clock, Plus, RotateCcw, X } from 'lucide-react';
import type { Renewal } from '../types';
import {
  calculateHistoryStats,
  effectiveInspectorCount,
  effectiveMileageUnitCost,
  hoursDifference,
  suggestedMileageUnitCost,
} from '../lib/calculations';
import { formatCurrency, formatDateTime, formatHours } from '../lib/format';
import { createId } from '../lib/model';
import { updateRenewalLabor } from '../lib/renewalInputs';
import {
  Banner,
  Field,
  NumberInput,
  SectionCard,
  Segmented,
  TextInput,
} from './ui';
import { JobCostTable } from './JobCostHistory';
import { useRenewalJobCost } from '../lib/historyContextStore';

export function LaborSection({
  renewal,
  update,
}: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
}) {
  const { labor } = renewal;
  const stats = calculateHistoryStats(labor.history);
  const jobCost = useRenewalJobCost(renewal);
  const suggestedMileage = suggestedMileageUnitCost(labor.quotedHours);
  const mileage = effectiveMileageUnitCost(labor.quotedHours, labor.mileageOverride);
  const difference = hoursDifference(labor.quotedHours, stats.averageHours);
  const inspectors = effectiveInspectorCount(labor.quotedHours, labor.inspectorOverride);
  const autoInspectors =
    labor.quotedHours !== null && labor.quotedHours > 8 ? 2 : 1;

  const patchLabor = (values: Partial<Renewal['labor']>) =>
    update((current) => updateRenewalLabor(current, values));

  const patchHistory = (id: string, values: { yearLabel?: string; hours?: number | null }) =>
    update((current) => ({
      ...current,
      labor: {
        ...current.labor,
        history: current.labor.history.map((entry) =>
          entry.id === id ? { ...entry, ...values } : entry,
        ),
      },
    }));

  const addYear = () => {
    const years = labor.history
      .map((entry) => Number(entry.yearLabel))
      .filter((year) => Number.isFinite(year));
    const nextYear = years.length > 0 ? Math.max(...years) + 1 : new Date().getFullYear() - 1;
    update((current) => ({
      ...current,
      labor: {
        ...current.labor,
        history: [
          ...current.labor.history,
          { id: createId(), yearLabel: String(nextYear), hours: null },
        ],
      },
    }));
  };

  const removeYear = (id: string) =>
    update((current) => ({
      ...current,
      labor: {
        ...current.labor,
        history: current.labor.history.filter((entry) => entry.id !== id),
      },
    }));

  return (
    <SectionCard
      icon={<Clock className="h-4 w-4" />}
      title="Labor hours & travel"
      description="Historical average and quoted hours are kept separate."
      actions={
        <button type="button" className="btn-secondary btn-xs" onClick={addYear}>
          <Plus className="h-3.5 w-3.5" />
          Add year
        </button>
      }
    >
      {labor.importSummary ? (
        <div className="mb-3 space-y-2 text-[11.5px] text-slate-600 dark:text-slate-300">
          <div>
            Actual labor from {labor.importSummary.fileName} · {labor.importSummary.frequency} · {labor.importSummary.basis}
            <br />Imported {formatDateTime(labor.importSummary.importedAt)}. Original quoted hours are not available from this export.
          </div>
          {labor.importSummary.projects.map((project) => (
            <details key={project.projectKey} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              <summary className="cursor-pointer">{project.year} · {project.projectNumber} · {project.projectName} · {project.hours.toFixed(8)} h actual</summary>
              <div className="mt-2 overflow-x-auto">
                <div>{labor.importSummary?.clientName} · {project.frequency ?? labor.importSummary?.frequency}</div>
                {project.entries ? (
                  <table className="mt-1 w-full min-w-[650px] text-left">
                    <thead><tr><th>Source / sheet / row</th><th>Date</th><th>Inspector</th><th>Task</th><th>Actual hours</th><th>Approved / counted</th></tr></thead>
                    <tbody>{project.entries.map((entry) => (
                      <tr key={entry.row.id}>
                        <td>{entry.row.sourceFile} / {entry.row.sourceSheet} / {entry.row.sourceRow}</td>
                        <td>{entry.row.date}</td><td>{entry.row.resource}</td><td>{entry.row.taskName}</td>
                        <td>{entry.row.duration.toFixed(8)}</td>
                        <td>{entry.row.approved ? 'Approved' : 'Unapproved'} / {entry.included ? 'Counted' : entry.exclusionReason}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : project.hoursSource === 'job-cost' ? (
                  <p>
                    D-Tools job-cost actual hours
                    {project.timesheetHours !== undefined ? ` · timesheet rows total ${project.timesheetHours.toFixed(8)} h` : ' · no timesheet rows for this project'}.
                  </p>
                ) : <p>Older saved summary: reselect this inspection from Historical Hours to preserve its source rows.</p>}
              </div>
            </details>
          ))}
          <p>Source totals above are the original snapshot. Editing historical entries below changes the renewal average.</p>
        </div>
      ) : null}
      <div className="workspace-stack-grid grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {labor.history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <TextInput
              value={entry.yearLabel}
              onChange={(value) => patchHistory(entry.id, { yearLabel: value })}
              className="input-sm w-16 shrink-0 text-center"
              ariaLabel="Historical year label"
            />
            <NumberInput
              value={entry.hours}
              onChange={(value) => patchHistory(entry.id, { hours: value })}
              className="input-sm"
              placeholder="hours"
              min={0}
              step={0.25}
              suffix="hrs"
              ariaLabel={`Inspection hours for ${entry.yearLabel || 'year'}`}
            />
            <button
              type="button"
              className="btn-ghost h-7 w-7 shrink-0 p-0"
              onClick={() => removeYear(entry.id)}
              aria-label={`Remove year ${entry.yearLabel}`}
              title="Remove this year"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="workspace-stat-grid mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="stat">
          <div className="stat-label">Historical entries counted</div>
          <div className="stat-value">{stats.validYears}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total hours</div>
          <div className="stat-value">{formatHours(stats.totalHours)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Historical average</div>
          <div className="stat-value">{formatHours(stats.averageHours)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Recommended (round up)</div>
          <div className="stat-value">{formatHours(stats.recommendedHours)}</div>
        </div>
      </div>

      {labor.importSummary ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-emerald-700 dark:text-emerald-300">
                Actual approved hours imported from D-Tools
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                {labor.importSummary.fileName} · imported{' '}
                {formatDateTime(labor.importSummary.importedAt)} ·{' '}
                {labor.importSummary.frequency} · {labor.importSummary.basis}
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary btn-xs"
              onClick={() => patchLabor({ source: 'manual', importSummary: null })}
              title="Keep the current hours but stop showing them as imported"
            >
              Detach import
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {labor.importSummary.projects.map((project) => (
              <div
                key={`${project.projectKey}-${project.year}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-emerald-200/60 bg-white/70 px-2 py-1 text-[11px] dark:border-emerald-500/20 dark:bg-slate-900/50"
              >
                <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                  <span className="font-semibold tabular-nums">{project.year}</span>{' '}
                  {project.projectName}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                  {project.projectNumber ? `#${project.projectNumber} · ` : ''}
                  {project.hoursSource === 'job-cost'
                    ? 'job cost · '
                    : `${project.entryCount} entr${project.entryCount === 1 ? 'y' : 'ies'} · `}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {formatHours(project.hours)}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] text-emerald-800/80 dark:text-emerald-200/70">
            These are actual timesheet hours, not originally quoted/bid hours. Quoted hours stay
            separate in Contract pricing above.
          </p>
        </div>
      ) : null}

      {jobCost ? (
        <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <JobCostTable
            projects={jobCost}
            emptyText="No D-Tools job-cost projects match this site and frequency. Apply a site from Historical hours or set the D-Tools project number."
          />
        </div>
      ) : null}

      {stats.validYears < 3 ? (
        <div className="mt-3">
          <Banner severity="warning">
            {stats.validYears === 0
              ? 'No historical years entered. Three years are normally reviewed before quoting.'
              : `Only ${stats.validYears} valid historical year${stats.validYears === 1 ? '' : 's'} entered. Three years are normally reviewed.`}
          </Banner>
        </div>
      ) : null}

      <div className="workspace-stack-grid mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="label">Proposed quoted labor hours</div>
              <div className="stat-value">{formatHours(labor.quotedHours)}</div>
              <p className="hint">Edit alongside Contract pricing above.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <button
                type="button"
                className="btn-secondary btn-xs"
                disabled={stats.averageHours === null}
                onClick={() => patchLabor({ quotedHours: stats.averageHours })}
              >
                Use average{stats.averageHours !== null ? ` (${formatHours(stats.averageHours)})` : ''}
              </button>
              <button
                type="button"
                className="btn-secondary btn-xs"
                disabled={stats.recommendedHours === null}
                onClick={() => patchLabor({ quotedHours: stats.recommendedHours })}
              >
                Use recommended{stats.recommendedHours !== null ? ` (${stats.recommendedHours})` : ''}
              </button>
            </div>
          </div>

          {difference === null ? (
            <div className="mt-2 text-[11.5px] text-slate-500 dark:text-slate-400">
              Enter quoted hours to compare against the historical average.
            </div>
          ) : Math.abs(difference) < 0.01 ? (
            <div className="mt-2 text-[11.5px] font-medium text-emerald-700 dark:text-emerald-300">
              Quoted hours match the historical average of{' '}
              {formatHours(stats.averageHours)}.
            </div>
          ) : (
            <div className="mt-2 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
              Quoted {difference > 0 ? '+' : '−'}
              {formatHours(Math.abs(difference))} vs the historical average of{' '}
              {formatHours(stats.averageHours)}.
            </div>
          )}

          <div className="mt-2">
            <Field label="Reason for quoted-hours adjustment" hint="Optional, but recommended when it differs.">
              <TextInput
                value={labor.quotedHoursReason}
                onChange={(value) => patchLabor({ quotedHoursReason: value })}
                className="input-sm"
                placeholder="Added devices, larger site, access delays..."
                ariaLabel="Reason for quoted-hours adjustment"
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <div className="stat-label">Suggested travel / mileage unit cost</div>
              {labor.mileageOverride !== null ? (
                <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  Manual override
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(mileage)}
              </div>
              <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
                Auto rule: {formatCurrency(suggestedMileage)} for{' '}
                {formatHours(labor.quotedHours)}
              </div>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <Field label="Override unit cost" className="w-36">
                <NumberInput
                  value={labor.mileageOverride}
                  onChange={(value) => patchLabor({ mileageOverride: value })}
                  min={0}
                  step={1}
                  prefix="$"
                  placeholder="auto"
                  ariaLabel="Mileage unit cost override"
                />
              </Field>
              <button
                type="button"
                className="btn-ghost btn-xs mb-1"
                disabled={labor.mileageOverride === null}
                onClick={() => patchLabor({ mileageOverride: null })}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
            <p className="hint mt-1">
              $50 per eight-hour block, rounded up. This is a D-Tools unit cost, not the
              proposal total.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="stat-label">Inspector count</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {inspectors} inspector{inspectors === 1 ? '' : 's'}
                  <span className="ml-2 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    auto: {autoInspectors} ({autoInspectors === 1 ? '8 h or fewer' : 'over 8 h'})
                  </span>
                </div>
              </div>
              <Segmented
                ariaLabel="Inspector count override"
                value={labor.inspectorOverride ?? 'auto'}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'one', label: 'One' },
                  { value: 'two', label: 'Two' },
                ]}
                onChange={(value) =>
                  patchLabor({
                    inspectorOverride: value === 'auto' ? null : (value as 'one' | 'two'),
                  })
                }
              />
            </div>
            <p className="hint mt-1">
              Two inspectors removes the single-inspector and FACP monitoring sentences.
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
