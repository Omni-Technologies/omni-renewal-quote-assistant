import { useState } from 'react';
import { Building2, CopyPlus, MapPin, Search, Trash2 } from 'lucide-react';
import type { Renewal, RenewalStatus } from '../types';
import { RENEWAL_STATUSES } from '../types';
import { formatDateTime, formatHours, formatShortDate } from '../lib/format';
import { calculateHistoryStats } from '../lib/calculations';
import { CompanySection } from './CompanySection';
import { PricingSection } from './PricingSection';
import { ProjectNameSection } from './ProjectNameSection';
import { ProposalEmailSection } from './ProposalEmailSection';
import { LaborSection } from './LaborSection';
import { SowRulesSection } from './SowRulesSection';
import { ChecklistSection } from './ChecklistSection';
import { SowPreview } from './SowPreview';
import { HistoricalHours } from './HistoricalHours';
import type { HistoryApplyPayload } from '../lib/dtools';

export function RenewalWorkspace({
  renewal,
  update,
  onDuplicate,
  onDelete,
  notify,
  onApplyHistory,
}: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  notify: (message: string, tone?: 'success' | 'danger' | 'info') => void;
  onApplyHistory: (payload: HistoryApplyPayload) => Promise<void>;
}) {
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = calculateHistoryStats(renewal.labor.history);

  const title =
    renewal.company.locationName.trim() ||
    renewal.company.companyName.trim() ||
    'Untitled renewal';
  const companyLine = [renewal.company.companyName, renewal.company.clientName]
    .filter(Boolean)
    .join(' · ');
  const cityLine = [renewal.company.siteCity, renewal.company.siteState]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {title}
            </h1>
            <span
              className="text-[10.5px] text-slate-400 dark:text-slate-500"
              title={`Created ${formatDateTime(renewal.createdAt)}`}
            >
              Updated {formatShortDate(renewal.updatedAt)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
            {companyLine ? (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {companyLine}
              </span>
            ) : (
              <span className="italic text-slate-400">No company entered yet</span>
            )}
            {cityLine ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {cityLine}
              </span>
            ) : null}
            {renewal.company.dtoolsProjectNumber ? (
              <span className="tabular-nums">
                D-Tools #{renewal.company.dtoolsProjectNumber}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            className="input input-sm w-48 font-medium"
            value={renewal.status}
            aria-label="Renewal status"
            onChange={(event) =>
              update((current) => ({
                ...current,
                status: event.target.value as RenewalStatus,
              }))
            }
          >
            {RENEWAL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            onClick={onDuplicate}
            title="Duplicate for the next contract period"
          >
            <CopyPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Duplicate</span>
          </button>
          <button
            type="button"
            className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={onDelete}
            title="Delete renewal"
            aria-label="Delete renewal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Renewal workspace">
        <div className="grid w-full grid-cols-1 items-start gap-3 p-2 xl:grid-cols-3" aria-label="Renewal form">
              <div className="min-w-0 rounded-xl border border-brand-200 bg-brand-50/60 p-3 xl:col-span-3 dark:border-brand-500/30 dark:bg-brand-500/5">
              <form onSubmit={(event) => { event.preventDefault(); setHistoryOpen(true); }}>
                <label htmlFor="renewal-history-search" className="mb-2 block text-xs font-semibold text-brand-800 dark:text-brand-200">Start with historical hours</label>
                <div className="flex gap-2">
                  <input id="renewal-history-search" type="search" className="input min-w-0 flex-1"
                    placeholder="Search company or location…" value={historyQuery}
                    onKeyDown={(event) => { if (event.key === 'Escape') setHistoryOpen(false); }}
                    onChange={(event) => { setHistoryQuery(event.target.value); setHistoryOpen(Boolean(event.target.value.trim())); }} />
                  <button type="button" className="btn-secondary" aria-expanded={historyOpen} aria-controls="renewal-history-results"
                    onClick={() => setHistoryOpen((current) => !current)}><Search className="h-4 w-4" />{historyOpen ? 'Hide results' : 'Search history'}</button>
                </div>
              </form>
              {historyOpen ? (
                <div id="renewal-history-results" className="mt-3 max-h-[70vh] overflow-y-auto" role="region" aria-label="Historical hours results">
                  <HistoricalHours renewal={renewal} notify={notify}
                    inlineSearch={{ query: historyQuery, onQuery: setHistoryQuery }}
                    onApply={async (payload) => { await onApplyHistory(payload); setHistoryOpen(false); setHistoryQuery(''); }} />
                </div>
              ) : null}
              </div>
              <details className="card workspace-column" open>
                <summary className="workspace-disclosure">Company & contract <span className="font-normal text-slate-500">{renewal.company.startYear}–{renewal.company.startYear + renewal.company.durationYears - 1}</span></summary>
                <div className="space-y-3 p-2">
                  <CompanySection renewal={renewal} update={update} />
                  <ProjectNameSection renewal={renewal} notify={notify} />
                </div>
              </details>
              <details className="card workspace-column" open>
                <summary className="workspace-disclosure">Contract pricing</summary>
                <div className="p-2"><PricingSection renewal={renewal} update={update} /></div>
              </details>
              <details className="card workspace-column" open>
                <summary className="workspace-disclosure">Historical hours & travel <span className="font-normal text-slate-500">Average {formatHours(history.averageHours)}</span></summary>
                <div className="p-2"><LaborSection renewal={renewal} update={update} /></div>
              </details>
              <details className="card workspace-column" open>
                <summary className="workspace-disclosure">SOW clause controls</summary>
                <div className="p-2"><SowRulesSection renewal={renewal} update={update} /></div>
              </details>
              <details className="card min-w-0 xl:col-span-2" open>
                <summary className="workspace-disclosure">Scope of work</summary>
                <div className="h-[656px] p-2"><SowPreview renewal={renewal} update={update} notify={notify} /></div>
              </details>
              <details className="card min-w-0 xl:col-span-3" open>
                <summary className="workspace-disclosure">Proposal email</summary>
                <div className="p-2"><ProposalEmailSection renewal={renewal} update={update} notify={notify} /></div>
              </details>
              <div className="min-w-0 xl:col-span-3"><ChecklistSection renewal={renewal} update={update} expanded /></div>
        </div>
      </div>
    </div>
  );
}
