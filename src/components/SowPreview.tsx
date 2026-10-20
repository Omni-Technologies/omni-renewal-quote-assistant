import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Copy,
  Pencil,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Renewal } from '../types';
import {
  acknowledgeManualDraft,
  canCopySow,
  createManualDraft,
  evaluateSow,
  generateSow,
  manualDraftNeedsReview,
  resolveSowText,
  validateSow,
  validateSowText,
} from '../lib/sow';
import { Banner, ConfirmDialog } from './ui';

type ConfirmAction = 'reset' | 'refresh' | null;

export function SowPreview({
  renewal,
  update,
  notify,
}: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
  notify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
}) {
  const evaluation = evaluateSow(renewal);
  const generated = generateSow(renewal, evaluation);
  const manual = renewal.sowDraft;
  const text = resolveSowText(renewal, generated);
  const reviewNeeded = manualDraftNeedsReview(renewal, generated);
  const issues = [
    ...validateSow(renewal, evaluation),
    ...(manual ? validateSowText(text) : []),
    ...(reviewNeeded
      ? [
          {
            id: 'manual-review',
            severity: 'error' as const,
            message:
              'Generated inputs changed since this manual draft was written. Review it, then mark it reviewed before copying.',
          },
        ]
      : []),
  ];
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const ready = canCopySow(issues);

  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    if (fallbackText !== null) {
      const node = fallbackRef.current;
      node?.focus();
      node?.select();
    }
  }, [fallbackText]);

  useEffect(
    () => () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function copy() {
    if (!ready) {
      notify('Resolve the blocked items before copying the SOW.', 'danger');
      return;
    }
    // Re-check the exact text at the moment of copying, not just the form.
    const textIssues = manual ? validateSowText(text) : [];
    if (textIssues.length > 0) {
      notify(textIssues[0].message, 'danger');
      return;
    }
    if (manualDraftNeedsReview(renewal, generated)) {
      notify(
        'Review the manual draft against the changed inputs and mark it reviewed before copying.',
        'danger',
      );
      return;
    }
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
      notify('Scope of Work copied — paste into D-Tools Text Format.');
    } catch {
      setFallbackText(text);
    }
  }

  function startEditing() {
    update((current) =>
      current.sowDraft
        ? current
        : { ...current, sowDraft: createManualDraft(generated, generated) },
    );
    setEditing(true);
  }

  function refreshDraft() {
    update((current) => ({
      ...current,
      sowDraft: {
        text: generated,
        sourceGeneratedText: generated,
        reviewedGeneratedText: generated,
        editedAt: Date.now(),
      },
    }));
    setConfirmAction(null);
    notify('Manual draft replaced with the current generated SOW.');
  }

  function markReviewed() {
    update((current) => acknowledgeManualDraft(current, generated));
    notify('Manual draft marked as reviewed against the current inputs.');
  }

  function resetDraft() {
    update((current) => ({ ...current, sowDraft: null }));
    setEditing(false);
    setConfirmAction(null);
    notify('Scope of Work reset to the generated version.');
  }

  const blockedCount = errors.length;

  return (
    <>
      <div className="card flex h-[640px] flex-col overflow-hidden xl:h-full">
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Scope of Work
              </h2>
              <span className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Plain text
              </span>
              {manual ? (
                <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  Manual draft
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Live preview — exactly what will be copied.
            </p>
          </div>
          {ready ? (
            <span className="chip shrink-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Ready
            </span>
          ) : (
            <span className="chip shrink-0 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {blockedCount} to resolve
            </span>
          )}
        </header>

        {issues.length > 0 ? (
          <div className="max-h-36 shrink-0 space-y-1 overflow-y-auto border-b border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/30">
            {[...errors, ...warnings].map((issue) => (
              <div
                key={issue.id}
                className={
                  issue.severity === 'error'
                    ? 'flex items-start gap-1.5 text-[11.5px] leading-snug text-red-700 dark:text-red-300'
                    : 'flex items-start gap-1.5 text-[11.5px] leading-snug text-amber-700 dark:text-amber-300'
                }
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-emerald-50/70 px-3 py-1.5 text-[11.5px] font-medium text-emerald-800 dark:border-slate-800 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            All required details and contract options are resolved.
          </div>
        )}

        {reviewNeeded ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/5">
            <Banner
              severity="warning"
              action={
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-primary btn-xs"
                    onClick={markReviewed}
                  >
                    Mark reviewed
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-xs"
                    onClick={() => setConfirmAction('refresh')}
                  >
                    Refresh
                  </button>
                </div>
              }
            >
              Generated inputs changed since this manual draft was written. Review it
              and mark it reviewed, or refresh it from the generated SOW. Copy is
              blocked until one of those is done.
            </Banner>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {editing && manual ? (
            <textarea
              className="h-full min-h-full w-full resize-none whitespace-pre-wrap bg-transparent p-4 font-mono text-[12.5px] leading-[1.7] text-slate-800 outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500/30 dark:text-slate-200"
              value={manual.text}
              spellCheck={false}
              aria-label="Editable Scope of Work draft"
              onChange={(event) => {
                const value = event.target.value;
                update((current) =>
                  current.sowDraft
                    ? {
                        ...current,
                        sowDraft: {
                          ...current.sowDraft,
                          text: value,
                          editedAt: Date.now(),
                        },
                      }
                    : current,
                );
              }}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-[1.7] text-slate-800 dark:text-slate-200">
              {text}
            </pre>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <button
            type="button"
            className="btn-primary w-full py-2 text-[13px]"
            onClick={() => void copy()}
            disabled={!ready}
            title={
              ready
                ? 'Copy the plain-text Scope of Work'
                : 'Resolve blocking items before copying'
            }
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" strokeWidth={3} />
                Copied to clipboard
              </>
            ) : (
              <>
                <ClipboardCopy className="h-4 w-4" />
                Copy Scope of Work
              </>
            )}
          </button>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={() => (editing ? setEditing(false) : startEditing())}
              >
                <Pencil className="h-3.5 w-3.5" />
                {editing ? 'Done editing' : manual ? 'Edit draft' : 'Edit manually'}
              </button>
              {manual ? (
                <button
                  type="button"
                  className="btn-ghost btn-xs"
                  onClick={() => setConfirmAction('reset')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to generated
                </button>
              ) : null}
            </div>
            <span className="text-[10.5px] text-slate-400 dark:text-slate-500">
              Real • bullets · line breaks preserved
            </span>
          </div>
        </footer>
      </div>

      <ConfirmDialog
        open={confirmAction === 'refresh'}
        title="Replace the manual draft?"
        description="This replaces your edited text with the freshly generated SOW. Manual additions will be lost."
        confirmLabel="Replace draft"
        onConfirm={refreshDraft}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'reset'}
        title="Reset to generated SOW?"
        description="This discards the manual draft and returns to the generated Scope of Work. The renewal inputs are not changed."
        confirmLabel="Reset SOW"
        onConfirm={resetDraft}
        onCancel={() => setConfirmAction(null)}
      />

      {fallbackText !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={() => setFallbackText(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Copy Scope of Work manually"
            className="card relative flex w-full max-w-2xl flex-col shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Copy Scope of Work
                </h2>
                <p className="hint mt-0.5">
                  Automatic clipboard access was blocked. The text is selected below —
                  press Ctrl+C, or use Select all.
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost h-7 w-7 p-0"
                onClick={() => setFallbackText(null)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <textarea
                ref={fallbackRef}
                readOnly
                value={fallbackText}
                className="input h-72 w-full resize-none whitespace-pre-wrap font-mono text-[12px] leading-relaxed"
                onFocus={(event) => event.target.select()}
              />
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  fallbackRef.current?.focus();
                  fallbackRef.current?.select();
                }}
              >
                <Copy className="h-4 w-4" />
                Select all
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setFallbackText(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
