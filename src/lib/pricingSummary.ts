import type { Renewal } from '../types';
import { calculateHistoryStats, calculatePriceChange } from './calculations';
import { formatCurrency, formatHours, formatPercent, formatSignedCurrency } from './format';

export function buildPricingSummary(renewal: Renewal): string {
  const { pricing, labor } = renewal;
  const change = calculatePriceChange(pricing.previousAnnualPrice, pricing.proposedAnnualPrice);
  const history = calculateHistoryStats(labor.history);
  const mileageCost = pricing.annualMileageCharge === null
    ? null
    : Math.round(pricing.annualMileageCharge / 1.2 * 100) / 100;
  const notes = pricing.pricingChangeNotes.trim();

  return [
    'Contract pricing update:',
    `Previous annual price: ${formatCurrency(pricing.previousAnnualPrice)}`,
    `Proposed annual price: ${formatCurrency(pricing.proposedAnnualPrice)}`,
    `Annual change: ${change ? formatSignedCurrency(change.difference) : '—'}`,
    `Percent change: ${change ? formatPercent(change.percent) : 'n/a'}`,
    '',
    `avg hours: ${formatHours(history.averageHours)}`,
    `Proposed quoted labor hours: ${formatHours(labor.quotedHours)}`,
    `Labor rate: ${formatCurrency(pricing.laborRatePerHour)}/hour`,
    `Mileage cost: ${formatCurrency(mileageCost)}`,
    ...(notes ? ['', `Notes about pricing changes: ${notes}`] : []),
  ].join('\n');
}
