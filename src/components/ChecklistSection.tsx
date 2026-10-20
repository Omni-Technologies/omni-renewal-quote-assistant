import { CheckSquare, ChevronDown, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { Renewal } from '../types';
import { RENEWAL_CHECKLIST, CHECKLIST_TOTAL, checklistProgress } from '../lib/workflow';
import { ConfirmDialog } from './ui';

export function ChecklistSection({
  renewal,
  update,
  expanded = false,
}: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
  expanded?: boolean;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const done = checklistProgress(renewal.checklist);
  const percent = Math.round((done / CHECKLIST_TOTAL) * 100);

  const toggle = (id: string, checked: boolean) =>
    update((current) => ({
      ...current,
      checklist: { ...current.checklist, [id]: checked },
    }));

  const reset = () => {
    update((current) => ({
      ...current,
      checklist: Object.fromEntries(
        RENEWAL_CHECKLIST.map((step) => [step.id, false]),
      ),
    }));
    setConfirmReset(false);
  };

  return (
    <>
      <details className="card group" open={expanded}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="text-slate-400 dark:text-slate-500">
            <CheckSquare className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Renewal process
              </h2>
              <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {done} / {CHECKLIST_TOTAL}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <span className="hidden text-[11px] text-slate-400 sm:block">
            {percent}% complete
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="hint">
              Sending to Julie, not the customer. Progress is saved per renewal.
            </p>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset progress
            </button>
          </div>
          <ol className="space-y-0.5">
            {RENEWAL_CHECKLIST.map((step, index) => {
              const checked = Boolean(renewal.checklist[step.id]);
              return (
                <li key={step.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900"
                      checked={checked}
                      onChange={(event) => toggle(step.id, event.target.checked)}
                    />
                    <span className="w-4 shrink-0 text-right text-[10.5px] tabular-nums text-slate-400">
                      {index + 1}.
                    </span>
                    <span
                      className={
                        checked
                          ? 'text-[12px] leading-snug text-slate-400 line-through dark:text-slate-500'
                          : 'text-[12px] leading-snug text-slate-700 dark:text-slate-300'
                      }
                    >
                      {step.label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
        </div>
      </details>

      <ConfirmDialog
        open={confirmReset}
        title="Reset renewal process?"
        description="This clears checklist progress only. Company information, hours, pricing and the SOW are not changed."
        confirmLabel="Reset checklist"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
