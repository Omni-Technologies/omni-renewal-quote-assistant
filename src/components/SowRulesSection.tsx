import { ListChecks, RotateCcw } from 'lucide-react';
import type { Renewal, SowInspectionScope, SowTemplate } from '../types';
import { SOW_INSPECTION_SCOPES, SOW_TEMPLATES } from '../types';
import {
  evaluateSow,
  SOW_TEMPLATE_LABELS,
  type ClauseDecision,
} from '../lib/sow';
import { formatCurrency } from '../lib/format';
import {
  Banner,
  Group,
  SectionCard,
  Segmented,
  Switch,
  YesNo,
} from './ui';

function depositAutoDescription(price: number | null): string {
  if (price === null) return 'Enter a proposed annual price to resolve this automatically.';
  return price >= 10000
    ? 'Included automatically because the annual price is $10,000 or more.'
    : 'Removed automatically because the annual price is under $10,000.';
}

function ClauseRow({
  title,
  description,
  decision,
  onChange,
  onReset,
}: {
  title: string;
  description: string;
  decision: ClauseDecision;
  onChange: (next: boolean) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800/80">
      <div className="pt-0.5">
        <Switch
          checked={decision.effective}
          onChange={onChange}
          label={`Include ${title}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200">
            {title}
          </span>
          <span
            className={
              decision.effective
                ? 'chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }
          >
            {decision.effective ? 'Included' : 'Removed'}
          </span>
          {decision.overridden ? (
            <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              Manual
            </span>
          ) : (
            <span className="chip bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              Auto
            </span>
          )}
        </div>
        <p className="hint mt-0.5">{description}</p>
      </div>
      {decision.overridden ? (
        <button
          type="button"
          className="btn-ghost h-7 w-7 shrink-0 p-0"
          onClick={onReset}
          title="Reset this clause to automatic"
          aria-label={`Reset ${title} to automatic`}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function SowRulesSection({
  renewal,
  update,
}: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
}) {
  const { company, pricing, labor, sow } = renewal;
  const evaluation = evaluateSow(renewal);
  const meriter = sow.template === 'meriter';
  const patchSow = (values: Partial<Renewal['sow']>) =>
    update((current) => ({
      ...current,
      sow: { ...current.sow, ...values },
    }));

  const resetAll = () => {
    update((current) => ({
      ...current,
      labor: { ...current.labor, inspectorOverride: null },
      sow: {
        ...current.sow,
        madisonOverride: null,
        singleInspectorOverride: null,
        facpOverride: null,
        annualBillingOverride: null,
        depositOverride: null,
      },
    }));
  };

  return (
    <SectionCard
      icon={<ListChecks className="h-4 w-4" />}
      title="SOW clause controls"
      description="Automatic rules first, with explicit overrides where needed."
      actions={
        <button type="button" className="btn-ghost btn-xs" onClick={resetAll}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to auto
        </button>
      }
    >
      <div className="workspace-stack-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Group
          label="SOW template"
          hint={
            meriter
              ? 'Annual & semi-annual inspections plus monitoring, July 1 – June 30 contract.'
              : sow.template === 'standard-warranty'
                ? 'Standard SOW with the Edwards extended parts warranty paragraph.'
                : 'Single or multi-location fire alarm inspection SOW.'
          }
        >
          <select
            className="input"
            value={sow.template}
            aria-label="SOW template"
            onChange={(event) => patchSow({ template: event.target.value as SowTemplate })}
          >
            {SOW_TEMPLATES.map((template) => (
              <option key={template} value={template}>
                {SOW_TEMPLATE_LABELS[template]}
              </option>
            ))}
          </select>
        </Group>
        <Group
          label="Inspections included"
          hint={
            meriter
              ? 'The Meriter template always includes annual and semi-annual inspections.'
              : 'Adds the semi-annual inspection to the SOW opening and description of work.'
          }
        >
          <select
            className="input"
            value={meriter ? 'Annual and Semi-Annual' : sow.inspectionScope}
            aria-label="SOW inspections included"
            disabled={meriter}
            onChange={(event) =>
              patchSow({ inspectionScope: event.target.value as SowInspectionScope })
            }
          >
            {SOW_INSPECTION_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </Group>
      </div>

      {meriter ? (
        <div className="mt-3">
          <Banner severity="info">
            The Meriter template uses fixed wording: no billing, deposit, Madison,
            single-inspector or FACP notes, and it ends with the INSERT CHART
            placeholder for the chart from a previous Meriter proposal.
          </Banner>
        </div>
      ) : null}

      <div className="workspace-stack-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {meriter ? null : (
          <>
            <Group label="Healthcare / hospital location?" hint="YES removes the FACP monitoring sentence.">
              <YesNo
                value={sow.isHospital}
                onChange={(value) => patchSow({ isHospital: value })}
                ariaLabel="Healthcare or hospital location"
              />
            </Group>
            <Group
              label="Site located in Madison?"
              hint={
                evaluation.madisonAuto
                  ? 'Auto-suggested YES from a Madison, WI location.'
                  : 'Auto-suggested from the verified city and state only.'
              }
            >
              <div className="flex items-center gap-2">
                <YesNo
                  value={evaluation.isMadison}
                  onChange={(value) => patchSow({ madisonOverride: value })}
                  ariaLabel="Site located in Madison"
                />
                {evaluation.madisonAuto ? (
                  <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    Auto
                  </span>
                ) : null}
              </div>
            </Group>
          </>
        )}
        <Group
          label="Inspector count"
          hint={`Automatic: ${evaluation.autoInspectorCount} inspector${evaluation.autoInspectorCount === 1 ? '' : 's'} from ${labor.quotedHours ?? '—'} quoted hours.`}
        >
          <Segmented
            ariaLabel="SOW inspector count"
            value={labor.inspectorOverride ?? 'auto'}
            options={[
              { value: 'auto', label: `Auto (${evaluation.autoInspectorCount})` },
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two' },
            ]}
            onChange={(value) =>
              update((current) => ({
                ...current,
                labor: {
                  ...current.labor,
                  inspectorOverride:
                    value === 'auto' ? null : (value as 'one' | 'two'),
                },
              }))
            }
          />
        </Group>
      </div>

      {meriter ? null : (
        <>
          <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
              <div>
                <div className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">
                  Billing language
                </div>
                <div className="hint">
                  Proposed annual price: {formatCurrency(pricing.proposedAnnualPrice)}
                </div>
              </div>
              <span
                className={
                  evaluation.depositUnresolved
                    ? 'chip bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                    : 'chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }
              >
                {evaluation.depositUnresolved
                  ? 'Needs resolution'
                  : evaluation.annualBilling.effective && evaluation.deposit.effective
                    ? 'Billing + 40% deposit'
                    : evaluation.annualBilling.effective
                      ? 'Billing after completion'
                      : evaluation.deposit.effective
                        ? '40% deposit only'
                        : 'No billing clause'}
              </span>
            </div>

            <div className="space-y-3 px-3 py-3">
              {pricing.proposedAnnualPrice === null ? (
                <Banner severity="info">
                  Proposed annual price is blank. The 40% deposit is never inferred from the
                  previous contract price — enter a price or set the deposit clause below.
                </Banner>
              ) : null}

              <div>
                <ClauseRow
                  title="Billing after completion"
                  description="Always included by the template; turn off only for an exceptional contract."
                  decision={evaluation.annualBilling}
                  onChange={(next) => patchSow({ annualBillingOverride: next })}
                  onReset={() => patchSow({ annualBillingOverride: null })}
                />
                <ClauseRow
                  title="40% deposit"
                  description={depositAutoDescription(pricing.proposedAnnualPrice)}
                  decision={evaluation.deposit}
                  onChange={(next) => patchSow({ depositOverride: next })}
                  onReset={() => patchSow({ depositOverride: null })}
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="label">Conditional clauses</div>
              <div className="hint">Toggle to override · reset icon restores auto</div>
            </div>
            <div className="mt-1">
              <ClauseRow
                title="Single-inspector sentence"
                description="Included when the quote uses one inspector (8 hours or fewer). Two inspectors removes it entirely."
                decision={evaluation.singleInspector}
                onChange={(next) => patchSow({ singleInspectorOverride: next })}
                onReset={() => patchSow({ singleInspectorOverride: null })}
              />
              <ClauseRow
                title="FACP monitoring sentence"
                description="Included only when the site is not healthcare AND one inspector is quoted."
                decision={evaluation.facp}
                onChange={(next) => patchSow({ facpOverride: next })}
                onReset={() => patchSow({ facpOverride: null })}
              />
              <ClauseRow
                title="Madison AHJ submission fee"
                description="Included when any listed location is in Madison, Wisconsin (city + state, never a text search)."
                decision={evaluation.madison}
                onChange={(next) => patchSow({ madisonOverride: next })}
                onReset={() => patchSow({ madisonOverride: null })}
              />
            </div>
          </div>
        </>
      )}

      <div className="mt-4 space-y-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {evaluation.inspectorCount === 1 ? 'One' : 'Two'} inspector
            {evaluation.inspectorCount === 1 ? '' : 's'}
          </span>{' '}
          {meriter ? (
            <>· Meriter · contract dates {evaluation.meriterContractDates}</>
          ) : (
            <>
              · {evaluation.locations.length} location{evaluation.locations.length === 1 ? '' : 's'} ·{' '}
              {evaluation.isHospital ? 'Healthcare' : 'Non-healthcare'} ·{' '}
              {evaluation.isMadison ? 'Madison AHJ fee' : 'No Madison fee'} · end date{' '}
              {evaluation.contractEndDate}
            </>
          )}
        </div>
        {company.companyQuotingNotes.trim() ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/5">
            <div className="label text-amber-700 dark:text-amber-400">
              Company quoting notes
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
              {company.companyQuotingNotes}
            </p>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
        {meriter
          ? 'The Meriter wording is fixed apart from location, address, duration and contract dates.'
          : 'Core clauses — detector cleaning, elevator coordination, lift responsibility, scheduling, T&M and owner notification — always remain in the SOW.'}{' '}
        Use the manual draft for genuinely exceptional edits.
      </p>
    </SectionCard>
  );
}
