import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CloudDownload,
  CloudUpload,
  FolderOpen,
  History,
  Loader2,
  Moon,
  Plus,
  Sun,
} from 'lucide-react';
import type { Renewal } from './types';
import {
  deleteRenewal,
  exportBackupData,
  listRenewals,
  parseBackupJson,
  restoreBackupData,
  saveRenewal,
  type BackupParseResult,
} from './lib/db';
import { cloneForNextContract, createRenewal } from './lib/model';
import { runAfterSave, SaveQueue } from './lib/saveQueue';
import { formatDateTime } from './lib/format';
import { Sidebar } from './components/Sidebar';
import { RenewalWorkspace } from './components/RenewalWorkspace';
import { HistoricalHours } from './components/HistoricalHours';
import { applyHistoryToRenewal, type HistoryApplyPayload } from './lib/dtools';
import { ConfirmDialog, Toast } from './components/ui';

type Theme = 'light' | 'dark';
type View = 'renewals' | 'history';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type ToastState = { message: string; tone: 'success' | 'danger' | 'info' } | null;

interface RestorePreview {
  fileName: string;
  backup: Extract<BackupParseResult, { ok: true }>;
}

function initialTheme(): Theme {
  const stored = localStorage.getItem('omni-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>('renewals');
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Renewal | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);

  const selected = useMemo(
    () => renewals.find((renewal) => renewal.id === selectedId) ?? null,
    [renewals, selectedId],
  );

  const notify = useCallback(
    (message: string, tone: 'success' | 'danger' | 'info' = 'success') => {
      setToast({ message, tone });
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 4200);
    },
    [],
  );

  // oxlint-disable-next-line react/refs -- stable SaveQueue instance; retry timers are internal, not render state.
  const [saveQueue] = useState(() =>
    new SaveQueue({
      save: saveRenewal,
      onDirty: () => setSaveState('saving'),
      onSaved: (savedAt) => {
        setLastSaved(savedAt);
        setSaveState('saved');
      },
      onError: (error) => {
        setSaveState('error');
        console.error('Save failed; changes retained for retry', error);
        notify(
          'Could not save to this browser. Your edits are retained and retrying automatically.',
          'danger',
        );
      },
    }),
  );

  function notifySaveBlocked(action: string) {
    notify(
      `${action} was cancelled because current changes could not be saved. Your edits are still queued and will retry.`,
      'danger',
    );
  }

  /* Initial load ---------------------------------------------------------- */
  useEffect(() => {
    let active = true;
    listRenewals()
      .then((rows) => {
        if (!active) return;
        setRenewals(rows);
        setSelectedId(rows[0]?.id ?? null);
        setLoading(false);
        if (rows.length > 0) setLastSaved(rows[0].updatedAt);
      })
      .catch((error) => {
        if (!active) return;
        setLoading(false);
        setSaveState('error');
        console.error('Load failed', error);
        notify('Could not read saved renewals from this browser.', 'danger');
      });
    return () => {
      active = false;
    };
  }, [notify]);

  /* Theme ----------------------------------------------------------------- */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('omni-theme', theme);
  }, [theme]);

  /* Autosave -------------------------------------------------------------- */
  useEffect(() => {
    if (!selected || loading) return;
    saveQueue.enqueue(selected);
    const timer = window.setTimeout(() => void saveQueue.flush(), 400);
    return () => window.clearTimeout(timer);
  }, [selected, loading, saveQueue]);

  useEffect(() => {
    function flush() {
      void saveQueue.flush();
    }
    function onVisibilityChange() {
      flush();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', flush);
    window.addEventListener('focus', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', flush);
      window.removeEventListener('focus', flush);
    };
  }, [saveQueue]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const update = useCallback(
    (updater: (renewal: Renewal) => Renewal) => {
      if (!selectedId) return;
      setSaveState('saving');
      setRenewals((current) =>
        current.map((renewal) =>
          renewal.id === selectedId
            ? { ...updater(renewal), updatedAt: Date.now() }
            : renewal,
        ),
      );
    },
    [selectedId],
  );

  const applyHistory = useCallback(
    async (payload: HistoryApplyPayload) => {
      if (!selectedId) {
        const renewal = applyHistoryToRenewal(createRenewal(), payload);
        await saveRenewal(renewal);
        setRenewals((current) => [renewal, ...current]);
        setSelectedId(renewal.id);
        setQuery('');
        setSaveState('saved');
        setLastSaved(renewal.updatedAt);
        setView('renewals');
        return;
      }
      setSaveState('saving');
      setRenewals((current) =>
        current.map((renewal) =>
          renewal.id === selectedId
            ? applyHistoryToRenewal(renewal, payload)
            : renewal,
        ),
      );
      setView('renewals');
    },
    [selectedId],
  );

  async function selectRenewal(id: string) {
    if (id === selectedId) return;
    const switched = await runAfterSave(saveQueue, () => setSelectedId(id));
    if (!switched) notifySaveBlocked('Switching renewals');
  }

  async function createNew() {
    try {
      const created = await runAfterSave(saveQueue, async () => {
        const renewal = createRenewal();
        await saveRenewal(renewal);
        setRenewals((current) => [renewal, ...current]);
        setSelectedId(renewal.id);
        setQuery('');
        setSaveState('saved');
        setLastSaved(Date.now());
        setView('renewals');
        notify('New renewal created.');
      });
      if (!created) notifySaveBlocked('Creating a renewal');
    } catch (error) {
      console.error('Create failed', error);
      notify('The new renewal could not be saved.', 'danger');
    }
  }

  async function duplicateSelected() {
    if (!selected) return;
    try {
      const duplicated = await runAfterSave(saveQueue, async () => {
        const copy = cloneForNextContract(selected);
        await saveRenewal(copy);
        setRenewals((current) => [copy, ...current]);
        setSelectedId(copy.id);
        setQuery('');
        setSaveState('saved');
        setLastSaved(Date.now());
        notify(
          `Duplicated for the next contract (${copy.company.startYear}). Prices, hours, approvals, SOW overrides and checklist were reset.`,
          'info',
        );
      });
      if (!duplicated) notifySaveBlocked('Duplicating the renewal');
    } catch (error) {
      console.error('Duplicate failed', error);
      notify('The renewal could not be duplicated.', 'danger');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      const deleted = await runAfterSave(saveQueue, async () => {
        await deleteRenewal(target.id);
        saveQueue.remove(target.id);
        const remaining = renewals.filter((renewal) => renewal.id !== target.id);
        setRenewals(remaining);
        if (selectedId === target.id) setSelectedId(remaining[0]?.id ?? null);
        setDeleteTarget(null);
        notify('Renewal deleted.');
      });
      if (!deleted) notifySaveBlocked('Deleting the renewal');
    } catch (error) {
      console.error('Delete failed', error);
      notify('The renewal could not be deleted.', 'danger');
    }
  }

  async function exportBackup() {
    const flushed = await saveQueue.flush();
    if (!flushed) {
      notifySaveBlocked('Export');
      return;
    }
    let backup;
    try {
      backup = await exportBackupData();
    } catch (error) {
      console.error('Backup export failed', error);
      notify('Could not read all saved data for the backup.', 'danger');
      return;
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `omni-renewal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify(`Exported ${backup.renewals.length} renewal${backup.renewals.length === 1 ? '' : 's'} to JSON.`);
  }

  async function handleRestoreFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const result: BackupParseResult = parseBackupJson(text);
      if (!result.ok) {
        notify(result.error, 'danger');
        return;
      }
      setRestorePreview({
        fileName: file.name,
        backup: result,
      });
    } catch (error) {
      console.error('Restore read failed', error);
      notify('Could not read that backup file.', 'danger');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function confirmRestore() {
    if (!restorePreview) return;
    const preview = restorePreview;
    setRestoreBusy(true);
    try {
      const restored = await runAfterSave(saveQueue, async () => {
        await restoreBackupData(preview.backup);
        const rows = await listRenewals();
        setRenewals(rows);
        if (preview.backup.dtools) setHistoryVersion((version) => version + 1);
        setSelectedId(preview.backup.renewals[0]?.id ?? rows[0]?.id ?? null);
        setQuery('');
        setSaveState('saved');
        setLastSaved(Date.now());
        notify(
          `Restored ${preview.backup.renewals.length} renewal${preview.backup.renewals.length === 1 ? '' : 's'} from backup.`,
        );
        setRestorePreview(null);
      });
      if (!restored) notifySaveBlocked('Restore');
    } catch (error) {
      console.error('Restore failed', error);
      notify('Restore failed while writing to this browser.', 'danger');
    } finally {
      setRestoreBusy(false);
    }
  }

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Save failed'
        : lastSaved
          ? `Saved ${new Date(lastSaved).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}`
          : 'Saved locally';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-3 text-white sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}omni-logo.png`} alt="OMNI Technologies logo" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain shadow-sm" />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold tracking-[0.08em]">OMNI</span>
              <span className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300 sm:inline">
                Internal
              </span>
            </div>
            <div className="truncate text-[11px] text-slate-400">
              Renewal Quote Assistant
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="mr-1 hidden items-center gap-0.5 rounded-lg bg-white/10 p-0.5 sm:flex">
            <button
              type="button"
              className={
                view === 'renewals'
                  ? 'rounded-md bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white'
                  : 'rounded-md px-2.5 py-1 text-[12px] font-semibold text-slate-300 hover:text-white'
              }
              onClick={() => setView('renewals')}
            >
              Renewals
            </button>
            <button
              type="button"
              className={
                view === 'history'
                  ? 'inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white'
                  : 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold text-slate-300 hover:text-white'
              }
              onClick={() => setView('history')}
            >
              <History className="h-3.5 w-3.5" />
              Historical Hours
            </button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white sm:hidden"
            onClick={() => setView(view === 'history' ? 'renewals' : 'history')}
            title={view === 'history' ? 'Back to renewals' : 'Open Historical Hours'}
            aria-label={view === 'history' ? 'Back to renewals' : 'Open Historical Hours'}
          >
            {view === 'history' ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <History className="h-4 w-4" />
            )}
          </button>
          <div
            className="mr-1 hidden items-center gap-1.5 text-[11px] text-slate-400 md:flex"
            title={lastSaved ? formatDateTime(lastSaved) : undefined}
          >
            {saveState === 'saving' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
            ) : saveState === 'error' ? (
              <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />
            )}
            <span className="hidden lg:inline">{saveLabel}</span>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => void exportBackup()}
            title="Export renewals and D-Tools history to a JSON backup"
            aria-label="Export backup"
          >
            <CloudDownload className="h-4 w-4" />
            <span className="hidden lg:inline">Export</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => fileInputRef.current?.click()}
            title="Restore data from a JSON backup"
            aria-label="Restore backup"
          >
            <CloudUpload className="h-4 w-4" />
            <span className="hidden lg:inline">Restore</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Restore backup file"
            onChange={(event) => void handleRestoreFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-brand-400"
            onClick={() => void createNew()}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">New Renewal</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {view === 'renewals' ? (
          <Sidebar
            renewals={renewals}
            selectedId={selectedId}
            query={query}
            onQuery={setQuery}
            onSelect={(id) => void selectRenewal(id)}
            onNew={() => void createNew()}
          />
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
          {view === 'history' ? (
            <div className="min-h-0 flex-1">
              <HistoricalHours key={historyVersion} renewal={selected} onApply={applyHistory} notify={notify} />
            </div>
          ) : (
            <>
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white p-2 md:hidden dark:border-slate-800 dark:bg-slate-900">
            <select
              className="input input-sm flex-1"
              value={selectedId ?? ''}
              aria-label="Choose renewal"
              onChange={(event) => {
                if (event.target.value) void selectRenewal(event.target.value);
              }}
            >
              {renewals.length === 0 ? <option value="">No renewals yet</option> : null}
              {renewals.map((renewal) => (
                <option key={renewal.id} value={renewal.id}>
                  {renewal.company.locationName ||
                    renewal.company.companyName ||
                    'Untitled renewal'}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading renewals…
                </div>
              </div>
            ) : selected ? (
              <RenewalWorkspace
                key={selected.id}
                renewal={selected}
                update={update}
                onDuplicate={() => void duplicateSelected()}
                onDelete={() => setDeleteTarget(selected)}
                notify={notify}
                onApplyHistory={applyHistory}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md text-center">
                  <img src={`${import.meta.env.BASE_URL}omni-logo.png`} alt="OMNI Technologies logo" width={72} height={72} className="mx-auto h-[72px] w-[72px] rounded-2xl border border-slate-200 bg-white object-contain shadow-card" />
                  <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {renewals.length === 0 ? 'Prepare your next renewal' : 'Select a renewal'}
                  </h1>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {renewals.length === 0
                      ? 'Enter the company and location, review historical hours, confirm the contractual clauses, and copy the finished Scope of Work into D-Tools.'
                      : 'Choose a renewal from the list, or create a new one.'}
                  </p>
                  <button
                    type="button"
                    className="btn-primary mt-4"
                    onClick={() => void createNew()}
                  >
                    <Plus className="h-4 w-4" />
                    New renewal
                  </button>
                  <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
                    All records stay in this browser on this PC. No cloud or account.
                  </p>
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </main>
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-40">
        {toast ? (
          <Toast
            message={toast.message}
            tone={toast.tone}
            onClose={() => setToast(null)}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this renewal?"
        description={
          <div className="space-y-2">
            <p>
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {deleteTarget?.company.locationName ||
                  deleteTarget?.company.companyName ||
                  'Untitled renewal'}
              </span>{' '}
              will be permanently removed from this browser.
            </p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              This cannot be undone. Export a JSON backup first if you may need it later.
            </p>
          </div>
        }
        confirmLabel="Delete renewal"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={restorePreview !== null}
        title="Restore data from backup?"
        confirmLabel={restoreBusy ? 'Restoring…' : 'Restore backup'}
        confirmDisabled={restoreBusy}
        description={
          restorePreview ? (
            <div className="space-y-2">
              <p>
                Restoring{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {restorePreview.backup.renewals.length} renewal
                  {restorePreview.backup.renewals.length === 1 ? '' : 's'}
                </span>{' '}
                from <span className="font-mono text-[12px]">{restorePreview.fileName}</span>.
              </p>
              {restorePreview.backup.exportedAt ? (
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Backup exported {formatDateTime(Date.parse(restorePreview.backup.exportedAt))}.
                </p>
              ) : null}
              {restorePreview.backup.skipped > 0 ? (
                <p className="text-[12px] text-amber-700 dark:text-amber-300">
                  {restorePreview.backup.skipped} unusable record
                  {restorePreview.backup.skipped === 1 ? '' : 's'} will be skipped.
                </p>
              ) : null}
              {restorePreview.backup.dtools ? (
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  The current D-Tools history and decisions will be replaced with {restorePreview.backup.dtools.rows.length} timesheet rows and {restorePreview.backup.dtools.decisions.length} manual decisions from this backup.
                </p>
              ) : null}
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Records with the same ID are updated; other saved renewals are left in
                place.
              </p>
            </div>
          ) : null
        }
        onConfirm={() => void confirmRestore()}
        onCancel={() => setRestorePreview(null)}
      />
    </div>
  );
}
