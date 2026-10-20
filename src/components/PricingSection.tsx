import { DollarSign } from 'lucide-react';
import type { Renewal } from '../types';
import { updateMileageCost, updateRenewalLabor, updateRenewalPricing } from '../lib/renewalInputs';
import { calculatePriceChange, hasLowLaborRate } from '../lib/calculations';
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from '../lib/format';
import { Banner, Field, NumberInput, SectionCard, TextArea } from './ui';

export function PricingSection({
  renewal,
  update,
}: {
  renewal: Renewal;
  update: (updater: (renewal: Renewal) => Renewal) => void;
}) {
  const { pricing } = renewal;
  const patch = (values: Partial<Renewal['pricing']>) =>
    update((current) => updateRenewalPricing(current, values));

  const change = calculatePriceChange(
    pricing.previousAnnualPrice,
    pricing.proposedAnnualPrice,
  );
  const lowRate = hasLowLaborRate(pricing.laborRatePerHour);
  const mileageCost = pricing.annualMileageCharge === null
    ? null
    : Math.round(pricing.annualMileageCharge / 1.2 * 100) / 100;
  const mileageMarkup = mileageCost === null || pricing.annualMileageCharge === null
    ? null
    : Math.round((pricing.annualMileageCharge - mileageCost) * 100) / 100;

  return (
    <SectionCard
      icon={<DollarSign className="h-4 w-4" />}
      title="Contract pricing"
      description="Proposed annual price drives the SOW billing language."
    >
      <div className="workspace-field-grid grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field
          label="Proposed annual contract price"
          required
          hint="Price and hours update each other."
        >
          <NumberInput
            value={pricing.proposedAnnualPrice}
            onChange={(value) => patch({ proposedAnnualPrice: value })}
            placeholder="0.00"
            min={0}
            step={0.01}
            prefix="$"
            ariaLabel="Proposed annual contract price"
          />
        </Field>
        <Field
          label="Proposed quoted labor hours"
          required
          hint="Includes labor only; mileage is added."
        >
          <NumberInput
            value={renewal.labor.quotedHours}
            onChange={(value) => update((current) => updateRenewalLabor(current, { quotedHours: value }))}
            placeholder="0.00"
            min={0}
            step={0.25}
            suffix="hrs"
            ariaLabel="Proposed quoted labor hours"
          />
        </Field>
        <Field label="Labor rate per hour" hint="Warns below $90.">
          <NumberInput
            value={pricing.laborRatePerHour}
            onChange={(value) => patch({ laborRatePerHour: value })}
            placeholder="0.00"
            min={0}
            step={0.01}
            prefix="$"
            ariaLabel="Labor rate per hour"
          />
        </Field>
      </div>
      <details className="mt-3 group" open>
        <summary className="cursor-pointer text-xs font-semibold text-brand-700 dark:text-brand-300">More pricing details</summary>
      <div className="workspace-field-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Previous annual contract price" hint="Historical comparison only.">
          <NumberInput value={pricing.previousAnnualPrice}
            onChange={(value) => patch({ previousAnnualPrice: value })}
            placeholder="0.00" min={0} step={0.01} prefix="$"
            ariaLabel="Previous annual contract price" />
        </Field>
        <Field label="Annual mileage cost" hint={pricing.mileageCostOverride === null ? 'Automatic: $50 per eight-hour block, plus 20% markup.' : 'Manual cost override. A 20% markup is added automatically.'}>
          <NumberInput
            value={mileageCost}
            onChange={(value) => update((current) => updateMileageCost(current, value))}
            min={0}
            step={0.01}
            prefix="$"
            ariaLabel="Annual mileage cost"
          />
          {pricing.mileageCostOverride !== null ? (
            <button type="button" className="btn-ghost btn-xs mt-1" onClick={() => update((current) => updateRenewalLabor(
              { ...current, pricing: { ...current.pricing, mileageCostOverride: null } },
              { quotedHours: current.labor.quotedHours },
            ))}>
              Use automatic mileage
            </button>
          ) : null}
        </Field>
        <Field label="Annual mileage charge" hint={`Cost ${formatCurrency(mileageCost)} + 20% markup ${formatCurrency(mileageMarkup)}. This customer charge is included in the annual price.`}>
          <NumberInput
            value={pricing.annualMileageCharge}
            onChange={(value) => patch({ annualMileageCharge: value })}
            min={0}
            step={0.01}
            prefix="$"
            ariaLabel="Annual mileage charge"
            disabled
          />
        </Field>
      </div>

      <div className="workspace-stat-grid mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="stat">
          <div className="stat-label">Annual change</div>
          <div className="stat-value">
            {change ? formatSignedCurrency(change.difference) : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Percent change</div>
          <div className="stat-value">
            {change ? formatPercent(change.percent) : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Proposed per year</div>
          <div className="stat-value">
            {formatCurrency(pricing.proposedAnnualPrice)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Field label="Notes about pricing changes">
          <TextArea
            value={pricing.pricingChangeNotes}
            onChange={(value) => patch({ pricingChangeNotes: value })}
            placeholder="Raised to cover travel time and added devices..."
            rows={2}
            ariaLabel="Notes about pricing changes"
          />
        </Field>
      </div>
      </details>
      {lowRate ? (
        <div className="mt-3">
          <Banner severity="warning">
            Labor rate under $90 — check with Mike before proceeding.
          </Banner>
        </div>
      ) : null}
    </SectionCard>
  );
}
