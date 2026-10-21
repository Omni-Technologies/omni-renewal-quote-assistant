import type { Renewal } from '../types';
import { calculateHistoryStats, calculatePriceChange } from './calculations';
import { formatCurrency, formatHours, formatPercent, formatSignedCurrency } from './format';

export function buildPricingSummary(renewal: Renewal): string {
  const { company, pricing, labor } = renewal;
  const change = calculatePriceChange(pricing.previousAnnualPrice, pricing.proposedAnnualPrice);
  const history = calculateHistoryStats(labor.history);
  const mileageCost = pricing.annualMileageCharge === null
    ? null
    : Math.round(pricing.annualMileageCharge / 1.2 * 100) / 100;
  const mileageMarkup = mileageCost === null || pricing.annualMileageCharge === null
    ? null
    : Math.round((pricing.annualMileageCharge - mileageCost) * 100) / 100;
  const context = [
    company.companyName.trim() && `Company: ${company.companyName.trim()}`,
    company.locationName.trim() && `Location: ${company.locationName.trim()}`,
    company.dtoolsProjectNumber.trim() && `D-Tools project: ${company.dtoolsProjectNumber.trim()}`,
    `Contract: ${company.inspectionFrequency}, ${company.durationYears} ${company.durationYears === 1 ? 'year' : 'years'} (${company.startYear}–${company.startYear + company.durationYears - 1})`,
  ].filter(Boolean);

  return [
    'Contract pricing update',
    ...context,
    '',
    `Previous annual price: ${formatCurrency(pricing.previousAnnualPrice)}`,
    `Proposed annual price: ${formatCurrency(pricing.proposedAnnualPrice)}`,
    `Annual change: ${change ? formatSignedCurrency(change.difference) : '—'}`,
    `Percent change: ${change ? formatPercent(change.percent) : 'n/a'}`,
    '',
    `Historical average hours: ${formatHours(history.averageHours)} (${history.validYears} ${history.validYears === 1 ? 'entry' : 'entries'})`,
    `Proposed quoted labor hours: ${formatHours(labor.quotedHours)}`,
    `Labor rate: ${formatCurrency(pricing.laborRatePerHour)}/hour`,
    `Annual mileage cost: ${formatCurrency(mileageCost)}`,
    `Mileage markup (20%): ${formatCurrency(mileageMarkup)}`,
    `Annual mileage charge (included in annual price): ${formatCurrency(pricing.annualMileageCharge)}`,
    '',
    `Notes about pricing changes: ${pricing.pricingChangeNotes.trim() || 'None'}`,
  ].join('\n');
}
