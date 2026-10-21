import { HardDrive, Plus, Search } from 'lucide-react';
import type { Renewal } from '../types';
import { timeAgo } from '../lib/format';
import { StatusBadge } from './ui';

export function Sidebar({
  renewals,
  selectedId,
  query,
  onQuery,
  onSelect,
  onNew,
}: {
  renewals: Renewal[];
  selectedId: string | null;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? renewals.filter((renewal) =>
        [
          renewal.company.companyName,
          renewal.company.clientName,
          renewal.company.locationName,
          renewal.company.dtoolsProjectNumber,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
    : renewals;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex 2xl:w-64 dark:border-slate-800 dark:bg-slate-900">
      <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="label">Renewals</div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-slate-400">
              {renewals.length}
            </span>
            <button
              type="button"
              className="btn-ghost h-6 w-6 p-0"
              onClick={onNew}
              aria-label="New renewal"
              title="New renewal"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="input input-sm pl-8"
            placeholder="Search company, client, location"
            value={query}
            aria-label="Search renewals"
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
              {renewals.length === 0 ? 'No renewals yet' : 'No matches'}
            </p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {renewals.length === 0
                ? 'Create your first renewal to get started.'
                : 'Try a company, client, or location name.'}
            </p>
            {renewals.length === 0 ? (
              <button type="button" className="btn-primary btn-xs mt-3" onClick={onNew}>
                <Plus className="h-3.5 w-3.5" />
                New renewal
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((renewal) => {
              const selected = renewal.id === selectedId;
              const title =
                renewal.company.locationName.trim() ||
                renewal.company.companyName.trim() ||
                'Untitled renewal';
              const subtitle =
                renewal.company.companyName.trim() || renewal.company.clientName.trim();

              return (
                <li key={renewal.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(renewal.id)}
                    aria-current={selected ? 'true' : undefined}
                    title={[title, subtitle].filter(Boolean).join(' — ')}
                    className={
                      selected
                        ? 'w-full rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-2 text-left dark:border-brand-500/30 dark:bg-brand-500/10'
                        : 'w-full rounded-lg border border-transparent px-2.5 py-2 text-left hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-800/50'
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={
                          selected
                            ? 'truncate text-[12.5px] font-semibold text-brand-900 dark:text-brand-100'
                            : 'truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-200'
                        }
                      >
                        {title}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {timeAgo(renewal.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {subtitle || 'No company name'}
                    </div>
                    <div className="mt-1.5">
                      <StatusBadge status={renewal.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <div className="flex items-start gap-2 text-[10.5px] leading-snug text-slate-400 dark:text-slate-500">
          <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Saved locally in this browser. No cloud, account, or telemetry. Export a JSON
            backup regularly.
          </span>
        </div>
      </div>
    </aside>
  );
}
