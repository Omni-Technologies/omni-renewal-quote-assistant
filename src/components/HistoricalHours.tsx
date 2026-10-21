import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  DtoolsDataset,
  DtoolsProject,
  DtoolsProjectDecision,
  DtoolsRow,
  DtoolsSiteSummary,
  Renewal,
} from '../types';
import {
  buildHistoryEntries,
  buildProjects,
  buildSiteSummaries,
  computeHistoryAverage,
  defaultDecision,
  defaultSelectedKeys,
  searchSites,
  selectionSummary,
  type HistoryApplyPayload,
} from '../lib/dtools';
import { readDtoolsFile } from '../lib/dtoolsImport';
import {
  loadDtoolsHistory,
  replaceDtoolsHistory,
  resetDtoolsDecision,
  saveDtoolsDecision,
} from '../lib/db';
import { formatDateTime, formatHours } from '../lib/format';
import { invalidateHistoryContext, useHistoryContext } from '../lib/historyContextStore';
import { jobCostForSite } from '../lib/jobCost';
import { JobCostImportPanel, JobCostTable } from './JobCostHistory';
import {
  Banner,
  ConfirmDialog,
  NumberInput,
  Segmented,
  TextInput,
} from './ui';

const CLASSIFICATION_LABEL: Record<DtoolsProject['classification'], string> = {
  annual: 'Confirmed annual',
  'semi-annual': 'Confirmed semi-annual',
  excluded: 'Excluded other work',
  review: 'Needs review',
};

const CLASSIFICATION_STYLE: Record<DtoolsProject['classification'], string> = {
  annual:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  'semi-annual':
    'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
  excluded:
    'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
  review:
    'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
};

function chipClass(classification: DtoolsProject['classification']): string {
  return `inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${CLASSIFICATION_STYLE[classification]}`;
}

function decisionMapOf(decisions: readonly DtoolsProjectDecision[]) {
  return new Map(decisions.map((decision) => [decision.key, decision]));
}

export function HistoricalHours({
  renewal,
  onApply,
  notify,
  initialQuery = '',
  inlineSearch,
}: {
  renewal: Renewal | null;
  onApply: (payload: HistoryApplyPayload) => Promise<void>;
  notify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
  initialQuery?: string;
  inlineSearch?: { query: string; onQuery: (query: string) => void };
}) {
  const [dataset, setDataset] = useState<DtoolsDataset | null>(null);
  const [rows, setRows] = useState<DtoolsRow[]>([]);
  const [decisions, setDecisions] = useState<DtoolsProjectDecision[]>([]);
  const pendingDecisions = useRef(new Map<string, DtoolsProjectDecision | null>());
  const savedDecisions = useRef(new Map<string, DtoolsProjectDecision>());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [localQuery, setLocalQuery] = useState(initialQuery);
  const query = inlineSearch?.query ?? localQuery;
  const setQuery = inlineSearch?.onQuery ?? setLocalQuery;
  const [frequency, setFrequency] = useState<'Annual' | 'Semi-Annual'>('Annual');
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [basis, setBasis] = useState<'visit' | 'annualized'>('visit');
  const [confirmApply, setConfirmApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewQuery, setReviewQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    loadDtoolsHistory()
      .then((snapshot) => {
        if (!active || !snapshot) return;
        setDataset(snapshot.dataset);
        setRows(snapshot.rows);
        setDecisions(snapshot.decisions);
        pendingDecisions.current = decisionMapOf(snapshot.decisions);
        savedDecisions.current = decisionMapOf(snapshot.decisions);
      })
      .catch((error) => {
        console.error('Historical hours load failed', error);
        notify('Could not read the imported D-Tools history from this browser.', 'danger');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [notify]);

  const projects = useMemo(
    () => buildProjects(rows, decisionMapOf(decisions)),
    [rows, decisions],
  );
  const sites = useMemo(() => buildSiteSummaries(projects), [projects]);
  const searchableSites = useMemo(
    () =>
      sites.filter(
        (site) => site.includedCount > 0 || site.reviewCount > 0,
      ),
    [sites],
  );
  const reviewProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.classification === 'excluded' ||
          project.classification === 'review',
      ),
    [projects],
  );
  const reviewMatches = useMemo(() => {
    const tokens = reviewQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return reviewProjects
      .filter((project) => {
        if (tokens.length === 0) return true;
        const haystack = `${project.clientName} ${project.projectName} ${project.projectNumber}`.toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
  }, [reviewProjects, reviewQuery]);
  const matches = useMemo(
    () => searchSites(searchableSites, query, 40),
    [searchableSites, query],
  );
  const selectedSite = sites.find((site) => site.siteKey === siteKey) ?? null;
  const siteProjects = useMemo(
    () =>
      siteKey
        ? projects.filter((project) => project.siteKey === siteKey)
        : [],
    [projects, siteKey],
  );
  const frequencyProjects = useMemo(
    () =>
      siteProjects.filter(
        (project) =>
          project.effectiveFrequency === frequency &&
          (project.classification !== 'excluded' || project.included),
      ),
    [siteProjects, frequency],
  );
  const average = useMemo(
    () => computeHistoryAverage(siteProjects, selectedKeys, frequency),
    [siteProjects, selectedKeys, frequency],
  );

  useEffect(() => {
    if (!siteKey) return;
    setSelectionTouched(false);
    setBasis('visit');
    setExpanded(new Set());
    // Reset only when the chosen site or frequency changes. Decision edits must
    // not silently discard the user's checkbox selection.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, frequency]);

  useEffect(() => {
    if (selectionTouched || !siteKey) return;
    setSelectedKeys(new Set(defaultSelectedKeys(siteProjects, frequency)));
  }, [siteProjects, frequency, siteKey, selectionTouched]);

  async function importFile(file: File) {
    setImportError(null);
    setWarnings([]);
    if (dataset) {
      setPendingFile(file);
      return;
    }
    await performImport(file);
  }

  async function performImport(file: File) {
    setImporting(true);
    setImportError(null);
    try {
      const parsed = await readDtoolsFile(file);
      if (dataset && parsed.dataset.fingerprint === dataset.fingerprint) {
        notify('That exact timesheet file is already imported. Totals were not changed.');
        setPendingFile(null);
        return;
      }
      await replaceDtoolsHistory(parsed.dataset, parsed.rows);
      invalidateHistoryContext();
      setDataset(parsed.dataset);
      setRows(parsed.rows);
      setWarnings([
        ...parsed.warnings,
        ...parsed.invalidRows
          .slice(0, 5)
          .map((row) => `Skipped row ${row.sourceRow}: ${row.reason}.`),
      ]);
      setSiteKey(null);
      setQuery('');
      setSelectedKeys(new Set());
      setPendingFile(null);
      notify(
        `Imported ${parsed.dataset.validRows.toLocaleString()} timesheet rows from ${parsed.dataset.fileName}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be imported.';
      setImportError(message);
      notify(message, 'danger');
      setPendingFile(null);
    } finally {
      setImporting(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  }

  async function toggleSelected(key: string) {
    const project = projects.find((item) => item.key === key);
    if (!project) return;
    const pending = pendingDecisions.current.get(key);
    const selected = pending?.averageSelected ?? selectedKeys.has(key);
    if (!await persistDecision(project, { averageSelected: !selected })) return;
    setSelectionTouched(true);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (selected) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function persistDecision(
    project: DtoolsProject,
    patch: Partial<DtoolsProjectDecision>,
  ): Promise<boolean> {
    const key = project.key;
    const base = pendingDecisions.current.has(key)
      ? pendingDecisions.current.get(key) ?? defaultDecision(project)
      : savedDecisions.current.get(key) ?? project.decision;
    const next: DtoolsProjectDecision = {
      ...base,
      ...patch,
      key,
      projectNumber: project.projectNumber,
      projectName: project.projectName,
      updatedAt: Date.now(),
    };
    pendingDecisions.current.set(key, next);
    try {
      await saveDtoolsDecision(next);
      savedDecisions.current.set(key, next);
      invalidateHistoryContext();
      setDecisions((current) => [
        ...current.filter((decision) => decision.key !== key),
        next,
      ]);
      return true;
    } catch (error) {
      if (pendingDecisions.current.get(key) === next) {
        const saved = savedDecisions.current.get(key);
        if (saved) pendingDecisions.current.set(key, saved);
        else pendingDecisions.current.delete(key);
      }
      console.error('Decision save failed', error);
      notify('The manual project decision could not be saved.', 'danger');
      return false;
    }
  }

  async function changeDecision(project: DtoolsProject, patch: Partial<DtoolsProjectDecision>) {
    await persistDecision(project, patch);
  }

  async function resetDecision(project: DtoolsProject) {
    const key = project.key;
    pendingDecisions.current.set(key, null);
    try {
      await resetDtoolsDecision(key);
      savedDecisions.current.delete(key);
      invalidateHistoryContext();
      setDecisions((current) => current.filter((decision) => decision.key !== key));
      notify('Project reset to automatic classification.');
    } catch (error) {
      if (pendingDecisions.current.has(key) && pendingDecisions.current.get(key) === null) {
        const saved = savedDecisions.current.get(key);
        if (saved) pendingDecisions.current.set(key, saved);
        else pendingDecisions.current.delete(key);
      }
      console.error('Decision reset failed', error);
      notify('The project decision could not be reset.', 'danger');
    }
  }

  const applyPayload = (): HistoryApplyPayload | null => {
    if (!selectedSite || average.averagePerVisit === null) return null;
    const entries = buildHistoryEntries(
      siteProjects,
      selectedKeys,
      frequency,
      frequency === 'Semi-Annual' ? basis : 'visit',
    );
    if (entries.length === 0) return null;
    const picked = selectionSummary(
      siteProjects,
      selectedKeys,
      frequency,
      frequency === 'Semi-Annual' ? basis : 'visit',
    );
    const basisLabel =
      frequency === 'Annual'
        ? 'Annual inspection totals'
        : basis === 'annualized'
          ? 'Semi-annual calendar-year total (two visits)'
          : 'Semi-annual average per visit';
    return {
      clientName: selectedSite.clientName,
      siteLabel: selectedSite.siteLabel,
      frequency,
      basis: basisLabel,
      entries,
      summary: {
        datasetId: dataset?.id ?? '',
        fileName: dataset?.fileName ?? '',
        importedAt: dataset?.importedAt ?? Date.now(),
        clientName: selectedSite.clientName,
        siteLabel: selectedSite.siteLabel,
        frequency,
        basis: basisLabel,
        projects: picked,
      },
    };
  };

  async function confirmApplyHours() {
    const payload = applyPayload();
    if (!payload) {
      setConfirmApply(false);
      notify(
        'No historical entries can be applied with the current basis. Select a year with two semi-annual visits or switch to per-visit.',
        'danger',
      );
      return;
    }
    setApplying(true);
    try {
      await onApply(payload);
      setConfirmApply(false);
      notify(
        `Applied ${payload.entries.length} historical ${
          payload.entries.length === 1 ? 'entry' : 'entries'
        } to the renewal.`,
      );
    } catch (error) {
      console.error('Apply historical hours failed', error);
      notify('The historical hours could not be applied to the renewal.', 'danger');
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading historical hours…
        </div>
      </div>
    );
  }

  return (
    <div className={inlineSearch ? 'space-y-3' : 'h-full overflow-y-auto p-4'}>
      <div className="mx-auto max-w-[1500px] space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div hidden={Boolean(inlineSearch)}>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Historical Hours
            </h1>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Approved D-Tools timesheets, grouped into inspection occurrences with every
              total traceable to its original row.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {dataset ? 'Replace dataset' : 'Import timesheet'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            aria-label="Import D-Tools timesheet export"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = '';
            }}
          />
        </div>

        {!inlineSearch ? <JobCostImportPanel notify={notify} /> : null}

        {!dataset ? (
          <ImportArea
            importing={importing}
            error={importError}
            onChoose={() => fileRef.current?.click()}
            onDrop={onDrop}
          />
        ) : (
          <>
            {!inlineSearch ? <DatasetSummary dataset={dataset} warnings={warnings} /> : null}
            {inlineSearch && query.trim() ? <p role="status" className="text-xs text-slate-500 dark:text-slate-400">{matches.length} matching sites. Select a site to review and apply its hours.</p> : null}
            {importError ? <Banner severity="danger">{importError}</Banner> : null}

            <div className="card p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                <label className={inlineSearch ? 'hidden' : 'block flex-1'}>
                  <span className="label">Search Company / Client / Location</span>
                  <div className="relative mt-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      className="input pl-9"
                      placeholder={'Try "St. Mary\'s", "Promega", "Verona"…'}
                      value={query}
                      aria-label="Search company, client, or location"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </label>
                <div className="flex items-center gap-2">
                  <span className="label">Frequency</span>
                  <Segmented
                    ariaLabel="Inspection frequency"
                    value={frequency}
                    options={[
                      { value: 'Annual', label: 'Annual' },
                      { value: 'Semi-Annual', label: 'Semi-Annual' },
                    ]}
                    onChange={(value) => {
                      setFrequency(value);
                      setSelectedKeys(new Set());
                    }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {sites.length.toLocaleString()} sites · {projects.length.toLocaleString()}{' '}
                  projects
                </div>
              </div>

              {query.trim() === '' ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-[12px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Type a company, client, or location. Matching sites are listed separately so
                  unrelated locations are never combined.
                </div>
              ) : matches.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-[12px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No client or project site matches “{query}”.
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {matches.map((site) => (
                    <button
                      key={site.siteKey}
                      type="button"
                      onClick={() => {
                        setSiteKey(site.siteKey);
                        setQuery(site.siteLabel);
                      }}
                      className={
                        site.siteKey === siteKey
                          ? 'rounded-xl border border-brand-300 bg-brand-50/60 p-2.5 text-left dark:border-brand-500/40 dark:bg-brand-500/10'
                          : 'rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-brand-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500/30 dark:hover:bg-slate-800/60'
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
                            {site.siteLabel}
                          </div>
                          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {site.clientName}
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {formatHours(site.totalHours)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {site.annualCount > 0 ? (
                          <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                            {site.annualCount} annual
                          </span>
                        ) : null}
                        {site.semiAnnualCount > 0 ? (
                          <span className="chip bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
                            {site.semiAnnualCount} semi
                          </span>
                        ) : null}
                        {site.reviewCount > 0 ? (
                          <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                            {site.reviewCount} review
                          </span>
                        ) : null}
                        {site.years.length > 0 ? (
                          <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {site.years.slice(0, 4).join(' · ')}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedSite && (!inlineSearch || searchSites([selectedSite], query, 1).length > 0) ? (
              <SiteDetail
                site={selectedSite}
                projects={frequencyProjects}
                allProjects={siteProjects}
                frequency={frequency}
                average={average}
                selectedKeys={selectedKeys}
                onToggle={toggleSelected}
                onSelectFrequency={setFrequency}
                expanded={expanded}
                onExpand={(key) =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                onChangeDecision={changeDecision}
                onResetDecision={resetDecision}
                basis={basis}
                onBasis={setBasis}
                renewal={renewal}
                onApply={() => setConfirmApply(true)}
              />
            ) : null}

            <div className="card overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                onClick={() => setShowReview((current) => !current)}
                aria-expanded={showReview}
              >
                <div>
                  <div className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
                    Excluded &amp; needs-review projects
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {reviewProjects.length.toLocaleString()} projects · every exclusion reason is
                    visible here
                  </div>
                </div>
                {showReview ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                )}
              </button>
              {showReview ? (
                <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                  <div className="relative mb-2 max-w-md">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      className="input input-sm pl-8"
                      placeholder="Filter excluded or review projects…"
                      value={reviewQuery}
                      aria-label="Filter excluded and review projects"
                      onChange={(event) => setReviewQuery(event.target.value)}
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
                      <tbody>
                        {reviewMatches.map((project) => (
                          <ProjectRows
                            key={project.key}
                            project={project}
                            open={expanded.has(project.key)}
                            eligible={false}
                            selected={false}
                            onToggle={() => undefined}
                            onExpand={() =>
                              setExpanded((current) => {
                                const next = new Set(current);
                                if (next.has(project.key)) next.delete(project.key);
                                else next.add(project.key);
                                return next;
                              })
                            }
                            onChangeDecision={changeDecision}
                            onResetDecision={resetDecision}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {reviewMatches.length === 0 ? (
                    <div className="py-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
                      No excluded or review projects match that filter.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingFile !== null}
        title="Replace the current timesheet dataset?"
        confirmLabel={importing ? 'Importing…' : 'Replace dataset'}
        confirmDisabled={importing}
        onConfirm={() => {
          if (pendingFile) void performImport(pendingFile);
        }}
        onCancel={() => setPendingFile(null)}
        description={
          <div className="space-y-2">
            <p>
              The current dataset{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {dataset?.fileName}
              </span>{' '}
              will be replaced by{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {pendingFile?.name}
              </span>
              .
            </p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Saved renewals and manual project decisions are kept. The old timesheet rows are
              removed, so the same file cannot be counted twice.
            </p>
          </div>
        }
      />

      <ConfirmDialog
        open={confirmApply}
        title="Apply these historical hours?"
        confirmLabel={applying ? 'Applying…' : 'Apply to renewal'}
        confirmDisabled={applying}
        onConfirm={() => void confirmApplyHours()}
        onCancel={() => setConfirmApply(false)}
        description={
          <div className="space-y-2">
            <p>
              Apply {average.selectedCount} selected{' '}
              {frequency === 'Semi-Annual' ? 'semi-annual visit' : 'annual occurrence'}
              {average.selectedCount === 1 ? '' : 's'} to{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {renewal?.company.locationName || renewal?.company.companyName || 'a new renewal'}
              </span>
              .
            </p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Client name, location, inspection frequency, and the historical-hours list will be
              replaced. Site address, pricing, notes, quoted hours, SOW rules, and the checklist
              are preserved.
            </p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Manual quoted hours are never overwritten. Review the proposed hours after applying.
            </p>
          </div>
        }
      />
    </div>
  );
}

function ImportArea({
  importing,
  error,
  onChoose,
  onDrop,
}: {
  importing: boolean;
  error: string | null;
  onChoose: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="space-y-3">
      <div
        className="card flex min-h-[220px] flex-col items-center justify-center border-dashed p-8 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          <FileSpreadsheet className="h-6 w-6" />
        </span>
        <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Import the approved D-Tools timesheet export
        </h2>
        <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
          Drag the CSV or Excel export here, or choose a file. Everything stays in this browser.
          The export columns Approved, Date, Resource, Client Name, Project Name, Project Number,
          Name, Number and Duration are required.
        </p>
        <button
          type="button"
          className="btn-primary mt-3"
          onClick={onChoose}
          disabled={importing}
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {importing ? 'Importing…' : 'Choose timesheet file'}
        </button>
        {error ? (
          <div className="mt-3 w-full max-w-xl text-left">
            <Banner severity="danger">{error}</Banner>
          </div>
        ) : null}
      </div>
      <Banner severity="info">
        The actual D-Tools export in this project folder is CSV. Excel workbooks are also
        accepted when exactly one worksheet contains the timesheet columns. Duration is read
        as decimal hours exactly as exported.
      </Banner>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function DatasetSummary({
  dataset,
  warnings,
}: {
  dataset: DtoolsDataset;
  warnings: string[];
}) {
  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Database className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
              {dataset.fileName}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {dataset.fileType === 'xlsx' ? `${dataset.sheetName} · ` : ''}imported{' '}
              {formatDateTime(dataset.importedAt)} · {dataset.fileType.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Duplicate imports are prevented by file fingerprint.
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Rows imported" value={dataset.validRows.toLocaleString()} />
        <Stat label="Unique projects" value={dataset.projectCount.toLocaleString()} />
        <Stat label="Annual" value={dataset.annualCount.toLocaleString()} />
        <Stat label="Semi-annual" value={dataset.semiAnnualCount.toLocaleString()} />
        <Stat label="Excluded" value={dataset.excludedCount.toLocaleString()} />
        <Stat label="Needs review" value={dataset.reviewCount.toLocaleString()} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Unapproved rows" value={dataset.unapprovedRows.toLocaleString()} />
        <Stat label="Invalid rows" value={dataset.rejectedRows.toLocaleString()} />
        <Stat label="Approved rows" value={(dataset.validRows - dataset.unapprovedRows).toLocaleString()} />
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {warnings.map((warning) => (
            <div key={warning} className="text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
              {warning}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SiteDetail({
  site,
  projects,
  allProjects,
  frequency,
  average,
  selectedKeys,
  onToggle,
  onSelectFrequency,
  expanded,
  onExpand,
  onChangeDecision,
  onResetDecision,
  basis,
  onBasis,
  renewal,
  onApply,
}: {
  site: DtoolsSiteSummary;
  projects: DtoolsProject[];
  allProjects: DtoolsProject[];
  frequency: 'Annual' | 'Semi-Annual';
  average: ReturnType<typeof computeHistoryAverage>;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onSelectFrequency: (frequency: 'Annual' | 'Semi-Annual') => void;
  expanded: Set<string>;
  onExpand: (key: string) => void;
  onChangeDecision: (
    project: DtoolsProject,
    patch: Partial<DtoolsProjectDecision>,
  ) => Promise<void>;
  onResetDecision: (project: DtoolsProject) => Promise<void>;
  basis: 'visit' | 'annualized';
  onBasis: (basis: 'visit' | 'annualized') => void;
  renewal: Renewal | null;
  onApply: () => void;
}) {
  const annualAvailable = allProjects.some(
    (project) => project.effectiveFrequency === 'Annual',
  );
  const semiAvailable = allProjects.some(
    (project) => project.effectiveFrequency === 'Semi-Annual',
  );
  const mainKeys = new Set(projects.map((project) => project.key));
  const reviewOnly = allProjects.filter(
    (project) =>
      project.classification === 'review' && !mainKeys.has(project.key),
  );
  const excluded = allProjects.filter(
    (project) =>
      project.classification === 'excluded' && !mainKeys.has(project.key),
  );
  const history = useHistoryContext();
  const jobCost = useMemo(
    () => jobCostForSite(history.jobCostProjects, site.siteKey, frequency),
    [history.jobCostProjects, site.siteKey, frequency],
  );
  const canApply =
    average.averagePerVisit !== null &&
    average.selectedCount > 0 &&
    (frequency !== 'Semi-Annual' ||
      basis === 'visit' ||
      average.annualizedAverage !== null);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                {site.siteLabel}
              </h2>
              <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {site.clientName}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              {site.projectCount} project{site.projectCount === 1 ? '' : 's'} ·{' '}
              {site.years.length > 0
                ? `years ${site.years.join(', ')}`
                : 'no confirmed years'}
            </p>
          </div>
          <Segmented
            ariaLabel="Inspection frequency for this site"
            value={frequency}
            options={[
              { value: 'Annual', label: `Annual${annualAvailable ? '' : ' (none)'}` },
              { value: 'Semi-Annual', label: `Semi-Annual${semiAvailable ? '' : ' (none)'}` },
            ]}
            onChange={onSelectFrequency}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3 sm:grid-cols-4 dark:border-slate-800">
        <Stat label="Selected occurrences" value={average.selectedCount} />
        <Stat label="Selected total" value={formatHours(average.totalHours)} />
        <Stat
          label={frequency === 'Annual' ? 'Average per inspection' : 'Average per visit'}
          value={formatHours(average.averagePerVisit)}
        />
        <Stat
          label="Annualized average"
          value={
            frequency === 'Semi-Annual'
              ? average.annualizedAverage === null
                ? 'Not available'
                : formatHours(average.annualizedAverage)
              : formatHours(average.averagePerVisit)
          }
        />
      </div>

      {frequency === 'Semi-Annual' ? (
        <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <div className="label">Selected hours by calendar year</div>
          {average.yearTotals.length === 0 ? (
            <div className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
              No semi-annual visits selected.
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {average.yearTotals.map((entry) => (
                <div
                  key={entry.year}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {entry.year}
                  </span>
                  <span className="ml-1.5 text-slate-500 dark:text-slate-400">
                    {entry.visits} visit{entry.visits === 1 ? '' : 's'}
                  </span>
                  <div className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {formatHours(entry.hours)}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {entry.visits === 2
                      ? 'Calendar-year total'
                      : entry.visits > 2 ? 'Confirm two visits — not annualized' : 'Single visit — not annualized'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {frequency === 'Semi-Annual' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <span className="label">Historical basis</span>
          <Segmented
            ariaLabel="Semi-annual historical basis"
            value={basis}
            options={[
              { value: 'visit', label: 'Per visit' },
              { value: 'annualized', label: 'Calendar year (2 visits)' },
            ]}
            onChange={(value) => onBasis(value as 'visit' | 'annualized')}
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {basis === 'visit'
              ? 'Average per semi-annual inspection visit.'
              : `Annualized from ${average.completeYears} complete year${
                  average.completeYears === 1 ? '' : 's'
                } with two visits.`}
          </span>
        </div>
      ) : null}

      {average.warnings.length > 0 ? (
        <div className="space-y-1 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          {average.warnings.map((warning) => (
            <div key={warning} className="text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <div className="border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              {frequency} inspection occurrences
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Uncheck an occurrence to exclude it from the average. Every total expands to source
              rows. Confirm in D-Tools that the inspection is complete and the export includes all
              its labor; timesheets do not provide completion status.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renewal ? (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Applies to {renewal.company.locationName || renewal.company.companyName || 'renewal'}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                A new renewal will be created with these hours.
              </span>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={!canApply}
              onClick={onApply}
              title={
                frequency === 'Semi-Annual' &&
                basis === 'annualized' &&
                average.annualizedAverage === null
                  ? 'No selected year has two semi-annual visits to annualize.'
                  : undefined
              }
            >
              <Calculator className="h-3.5 w-3.5" />
              Use These Hours for Renewal
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-[12px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No {frequency.toLowerCase()} fire alarm inspection projects were identified for this
            site. Check the other frequency, or review the unclassified projects below.
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                  <th className="w-8 px-2 py-1.5" />
                  <th className="px-2 py-1.5">Year</th>
                  <th className="px-2 py-1.5">Project</th>
                  <th className="px-2 py-1.5">Project #</th>
                  <th className="px-2 py-1.5 text-right">Hours</th>
                  <th className="px-2 py-1.5 text-right">Entries</th>
                  <th className="px-2 py-1.5 text-right">People</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="w-8 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const open = expanded.has(project.key);
                  const eligible =
                    project.included &&
                    project.effectiveYear !== null &&
                    project.effectiveFrequency === frequency;
                  return (
                    <ProjectRows
                      key={project.key}
                      project={project}
                      open={open}
                      eligible={eligible}
                      selected={selectedKeys.has(project.key)}
                      onToggle={() => onToggle(project.key)}
                      onExpand={() => onExpand(project.key)}
                      onChangeDecision={onChangeDecision}
                      onResetDecision={onResetDecision}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {history.jobCostDataset ? (
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <JobCostTable
            projects={jobCost}
            emptyText={`No ${frequency.toLowerCase()} job-cost projects for this site.`}
          />
        </div>
      ) : null}

      {reviewOnly.length > 0 || excluded.length > 0 ? (
        <div className="p-3">
          <div className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
            Needs review or excluded
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            These projects are never added to an average automatically. Expand one to inspect it
            and apply a manual decision.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
              <tbody>
                {[...reviewOnly, ...excluded].map((project) => (
                  <ProjectRows
                    key={project.key}
                    project={project}
                    open={expanded.has(project.key)}
                    eligible={false}
                    selected={false}
                    onToggle={() => undefined}
                    onExpand={() => onExpand(project.key)}
                    onChangeDecision={onChangeDecision}
                    onResetDecision={onResetDecision}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProjectRows({
  project,
  open,
  eligible,
  selected,
  onToggle,
  onExpand,
  onChangeDecision,
  onResetDecision,
}: {
  project: DtoolsProject;
  open: boolean;
  eligible: boolean;
  selected: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onChangeDecision: (
    project: DtoolsProject,
    patch: Partial<DtoolsProjectDecision>,
  ) => Promise<void>;
  onResetDecision: (project: DtoolsProject) => Promise<void>;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 align-middle dark:border-slate-800">
        <td className="px-2 py-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
            checked={selected}
            disabled={!eligible}
            onChange={onToggle}
            aria-label={`Include ${project.projectName} in the average`}
          />
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-[12.5px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {project.effectiveYear ?? '—'}
          {project.yearSource === 'work-dates' ? (
            <span className="ml-1 text-[9px] font-medium uppercase text-amber-600 dark:text-amber-400">
              inferred
            </span>
          ) : null}
        </td>
        <td className="max-w-[360px] px-2 py-2">
          <div className="text-[12px] font-medium text-slate-800 dark:text-slate-200">
            {project.projectName}
          </div>
          <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
            {project.firstDate === project.lastDate
              ? project.firstDate
              : `${project.firstDate} → ${project.lastDate}`}
            {project.flaggedEntries > 0
              ? ` · ${project.flaggedEntries} flagged task${project.flaggedEntries === 1 ? '' : 's'}`
              : ''}
            {project.decision.action !== 'auto'
              ? ` · manual ${project.decision.action}`
              : ''}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-2 font-mono text-[11.5px] text-slate-600 dark:text-slate-300">
          {project.projectNumber || '—'}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-right text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatHours(project.totalHours)}
          {project.flaggedHours > 0 && !project.decision.includeFlaggedEntries ? (
            <div className="text-[9.5px] font-normal text-amber-600 dark:text-amber-400">
              {formatHours(project.flaggedHours)} flagged / excluded
            </div>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
          {project.entries.filter((entry) => entry.row.approved).length}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
          {project.inspectorCount}
        </td>
        <td className="px-2 py-2">
          <span
            className={chipClass(
              project.totalHours <= 0
                ? 'review'
                : project.classification === 'review' && project.included
                  ? 'annual'
                  : project.classification,
            )}
          >
            {project.decision.action === 'include'
              ? 'Manually included'
              : project.decision.action === 'exclude'
                ? 'Manually excluded'
                : project.classification === 'review' && project.included
                  ? 'Resolved by correction'
                  : project.totalHours <= 0
                    ? 'No counted hours'
                    : CLASSIFICATION_LABEL[project.classification]}
          </span>
        </td>
        <td className="px-2 py-2 text-right">
          <button
            type="button"
            className="btn-ghost h-7 w-7 p-0"
            onClick={onExpand}
            aria-label={open ? 'Collapse project details' : 'Expand project details'}
            title={open ? 'Collapse' : 'Expand source rows'}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="bg-slate-50/70 dark:bg-slate-950/40">
          <td colSpan={9} className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
            <ProjectExpanded
              project={project}
              onChangeDecision={onChangeDecision}
              onResetDecision={onResetDecision}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ProjectExpanded({
  project,
  onChangeDecision,
  onResetDecision,
}: {
  project: DtoolsProject;
  onChangeDecision: (
    project: DtoolsProject,
    patch: Partial<DtoolsProjectDecision>,
  ) => Promise<void>;
  onResetDecision: (project: DtoolsProject) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
        <div>
          <div className="label">Automatic identification</div>
          <div className="mt-1 text-[11px]">
            {project.effectiveFrequency ?? 'Frequency needs review'} · Eligible approved hours: {project.totalHours.toFixed(8)}
            {!project.included ? ' · Project excluded from averages' : ''}
          </div>
          <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
            {project.reasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
            {project.contractPosition ? (
              <li>• Contract position {project.contractPosition} is not treated as a year.</li>
            ) : null}
          </ul>
        </div>
        <div>
          <div className="label">Manual decision</div>
          <div className="mt-1">
            <select
              className="input input-sm"
              value={project.decision.action}
              aria-label={`Manual decision for ${project.projectName}`}
              onChange={(event) =>
                void onChangeDecision(project, {
                  action: event.target.value as DtoolsProjectDecision['action'],
                })
              }
            >
              <option value="auto">Automatic</option>
              <option value="include">Include project</option>
              <option value="exclude">Exclude project</option>
            </select>
          </div>
        </div>
        <div>
          <div className="label">Frequency correction</div>
          <div className="mt-1">
            <select
              className="input input-sm"
              value={project.decision.frequency ?? 'auto'}
              aria-label={`Frequency correction for ${project.projectName}`}
              onChange={(event) =>
                void onChangeDecision(project, {
                  frequency:
                    event.target.value === 'auto'
                      ? null
                      : (event.target.value as 'Annual' | 'Semi-Annual'),
                })
              }
            >
              <option value="auto">Automatic ({project.frequency ?? 'none'})</option>
              <option value="Annual">Annual</option>
              <option value="Semi-Annual">Semi-Annual</option>
            </select>
          </div>
        </div>
        <div>
          <div className="label">Inspection year correction</div>
          <div className="mt-1 flex items-end gap-1.5">
            <NumberInput
              value={project.decision.year ?? project.effectiveYear}
              onChange={(value) => void onChangeDecision(project, { year: value })}
              min={1900}
              max={2200}
              step={1}
              className="input-sm w-24"
              ariaLabel={`Inspection year for ${project.projectName}`}
            />
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => void onChangeDecision(project, { year: null })}
              title="Follow the automatic year"
            >
              Auto
            </button>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => void onResetDecision(project)}
              title="Reset every manual decision for this project"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <div>
          <div className="label">Original quoted hours (manual)</div>
          <div className="mt-1 flex items-end gap-2">
            <NumberInput
              value={project.decision.quotedHours}
              onChange={(value) => void onChangeDecision(project, { quotedHours: value })}
              min={0}
              step={0.25}
              suffix="hrs"
              className="input-sm"
              ariaLabel={`Original quoted hours for ${project.projectName}`}
            />
            <span className="hint mb-1">Never inferred from actual hours.</span>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="label">Correction note</div>
          <DecisionNote
            key={`${project.key}:${project.decision.updatedAt}`}
            value={project.decision.note}
            onSave={(note) => void onChangeDecision(project, { note })}
          />
        </div>
      </div>

      {project.flaggedEntries > 0 ? (
        <label className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600"
            checked={project.decision.includeFlaggedEntries}
            onChange={(event) =>
              void onChangeDecision(project, {
                includeFlaggedEntries: event.target.checked,
              })
            }
          />
          <span>
            Include {project.flaggedEntries} flagged task entr
            {project.flaggedEntries === 1 ? 'y' : 'ies'} ({formatHours(project.flaggedHours)})
            in this project total. Verify them in D-Tools first.
          </span>
        </label>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-2 py-1.5">Excel row</th>
              <th className="px-2 py-1.5">Date</th>
              <th className="px-2 py-1.5">Resource</th>
              <th className="px-2 py-1.5 text-right">Hours</th>
              <th className="px-2 py-1.5">Task</th>
              <th className="px-2 py-1.5">Approved</th>
              <th className="px-2 py-1.5">Included</th>
            </tr>
          </thead>
          <tbody>
            {project.entries.map((entry) => (
              <tr
                key={entry.row.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800/70"
              >
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {entry.row.sourceRow}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-[11.5px] tabular-nums text-slate-600 dark:text-slate-300">
                  {entry.row.date}
                </td>
                <td className="px-2 py-1.5 text-[11.5px] text-slate-700 dark:text-slate-200">
                  {entry.row.resource || '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right text-[11.5px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                  {entry.row.duration.toFixed(8)} h
                </td>
                <td className="max-w-[320px] px-2 py-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                  {entry.row.taskName || '—'}
                </td>
                <td className="px-2 py-1.5">
                  {entry.row.approved ? (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                      <XCircle className="h-3 w-3" /> No
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[10.5px]">
                  {entry.included ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      Counted
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">
                      {entry.exclusionReason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {project.entryCount} entries
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> {project.inspectorCount} people
          </span>
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3 w-3" /> {project.clientName}
          </span>
          {project.unapprovedHours > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3" /> {formatHours(project.unapprovedHours)}{' '}
              unapproved excluded
            </span>
          ) : null}
        </div>
        <span>
          Source: {project.entries[0]?.row.sourceFile ?? '—'}
          {project.entries[0]?.row.sourceSheet
            ? ` · ${project.entries[0].row.sourceSheet}`
            : ''}{' '}
          · rows {Math.min(...project.entries.map((entry) => entry.row.sourceRow))}–
          {Math.max(...project.entries.map((entry) => entry.row.sourceRow))}
        </span>
      </div>
    </div>
  );
}

function DecisionNote({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <div className="mt-1 flex items-end gap-2">
      <TextInput
        value={text}
        onChange={setText}
        className="input-sm"
        placeholder="Explain the correction for the audit trail…"
        ariaLabel="Project correction note"
      />
      <button
        type="button"
        className="btn-secondary btn-xs mb-0.5"
        onClick={() => onSave(text)}
      >
        Save note
      </button>
    </div>
  );
}
