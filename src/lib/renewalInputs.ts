import type { Renewal } from '../types';
import { effectiveMileageUnitCost } from './calculations';

export function updateMileageCost(renewal: Renewal, cost: number | null): Renewal {
  const values = {
    mileageCostOverride: cost,
    annualMileageCharge: cost === null ? null : Math.round(cost * 1.2 * 100) / 100,
  };
  return renewal.labor.quotedHours === null
    ? updateRenewalPricing(renewal, values)
    : updateRenewalLabor({ ...renewal, pricing: { ...renewal.pricing, ...values } }, { quotedHours: renewal.labor.quotedHours });
}

export function updateRenewalPricing(
  renewal: Renewal,
  values: Partial<Renewal['pricing']>,
): Renewal {
  const pricing = { ...renewal.pricing, ...values };
  const recalculate = 'proposedAnnualPrice' in values || 'laborRatePerHour' in values || 'annualMileageCharge' in values || 'mileageCostOverride' in values;
  if ('annualMileageCharge' in values && !('mileageCostOverride' in values)) {
    pricing.mileageCostOverride = undefined;
  }
  if (recalculate && pricing.mileageCostOverride === null && pricing.proposedAnnualPrice !== null &&
    pricing.laborRatePerHour !== null && pricing.laborRatePerHour > 0) {
    const blocks = Math.max(1, Math.ceil(pricing.proposedAnnualPrice / (8 * pricing.laborRatePerHour + 60)));
    const cost = renewal.labor.mileageOverride ?? blocks * 50;
    pricing.annualMileageCharge = Math.round(cost * 1.2 * 100) / 100;
  }
  let hours = pricing.proposedAnnualPrice !== null &&
    pricing.annualMileageCharge !== null && pricing.annualMileageCharge >= 0 &&
    pricing.proposedAnnualPrice >= pricing.annualMileageCharge &&
    pricing.laborRatePerHour !== null && pricing.laborRatePerHour > 0
    ? Math.round(((pricing.proposedAnnualPrice - pricing.annualMileageCharge) / pricing.laborRatePerHour) * 100) / 100
    : null;
  if (hours !== null && hours > 0 && pricing.mileageCostOverride === null && renewal.labor.mileageOverride === null &&
    Math.ceil(hours / 8) * 60 !== pricing.annualMileageCharge) hours = null;
  return {
    ...renewal,
    pricing,
    labor: recalculate ? { ...renewal.labor, quotedHours: hours } : renewal.labor,
  };
}

export function updateRenewalLabor(
  renewal: Renewal,
  values: Partial<Renewal['labor']>,
): Renewal {
  const labor = { ...renewal.labor, ...values };
  const pricing = { ...renewal.pricing };
  const recalculate = 'quotedHours' in values || ('mileageOverride' in values && pricing.mileageCostOverride === null);
  if (pricing.mileageCostOverride === null && labor.quotedHours !== null && recalculate) {
    const cost = effectiveMileageUnitCost(labor.quotedHours, labor.mileageOverride);
    pricing.annualMileageCharge = cost === null ? 60 : Math.round(cost * 1.2 * 100) / 100;
  }
  const { laborRatePerHour, annualMileageCharge } = pricing;
  const price = labor.quotedHours !== null && labor.quotedHours >= 0 &&
    laborRatePerHour !== null && laborRatePerHour > 0 &&
    annualMileageCharge !== null && annualMileageCharge >= 0
    ? Math.round((labor.quotedHours * laborRatePerHour + annualMileageCharge) * 100) / 100
    : null;
  return {
    ...renewal,
    labor,
    pricing: recalculate
      ? { ...pricing, proposedAnnualPrice: price }
      : renewal.pricing,
  };
}

export function parseAddressCity(address: string): { siteCity: string; siteState: string } | null {
  const match = address.trim().match(/(?:,|\n)\s*([A-Za-z][A-Za-z .'-]*?)\s*,?\s+([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:\s*,?\s*(?:USA|US|United States))?\s*$/i);
  return match ? { siteCity: match[1].trim(), siteState: match[2].toUpperCase() } : null;
}
