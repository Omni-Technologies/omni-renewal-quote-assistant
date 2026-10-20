import type {
  HistoricalHoursEntry,
  InspectorCount,
  InspectorOverride,
  PricingDetails,
} from '../types';

export interface HistoryStats {
  /** Number of entries with a real, non-blank hours value. */
  validYears: number;
  totalHours: number;
  averageHours: number | null;
  /** Average rounded UP to whole hours. Suggestions only — never auto-quoted. */
  recommendedHours: number | null;
}

export function isValidHours(hours: number | null): hours is number {
  return typeof hours === 'number' && Number.isFinite(hours) && hours >= 0;
}

export function calculateHistoryStats(
  history: readonly HistoricalHoursEntry[],
): HistoryStats {
  const valid = history.filter((entry) => isValidHours(entry.hours));
  const totalHours = valid.reduce((sum, entry) => sum + (entry.hours ?? 0), 0);
  const averageHours = valid.length > 0 ? totalHours / valid.length : null;

  return {
    validYears: valid.length,
    totalHours,
    averageHours,
    recommendedHours:
      averageHours === null ? null : Math.ceil(averageHours - 1e-9),
  };
}

/** Quoted hours minus historical average. Positive means quoting more time. */
export function hoursDifference(
  quotedHours: number | null,
  averageHours: number | null,
): number | null {
  if (!isValidHours(quotedHours) || averageHours === null) return null;
  return quotedHours - averageHours;
}

/**
 * Established travel / mileage rule: $50 per eight-hour block, rounded UP.
 * This is a suggested D-Tools unit cost, not a total proposal amount.
 */
export function suggestedMileageUnitCost(hours: number | null): number | null {
  if (hours === null || !Number.isFinite(hours) || hours <= 0) return null;
  return Math.ceil(hours / 8) * 50;
}

export function autoInspectorCount(hours: number | null): InspectorCount {
  return isValidHours(hours) && hours > 8 ? 2 : 1;
}

export function effectiveInspectorCount(
  hours: number | null,
  override: InspectorOverride,
): InspectorCount {
  if (override === 'one') return 1;
  if (override === 'two') return 2;
  return autoInspectorCount(hours);
}

export function effectiveMileageUnitCost(
  hours: number | null,
  override: number | null,
): number | null {
  return override !== null ? override : suggestedMileageUnitCost(hours);
}

export interface PriceChange {
  difference: number;
  percent: number | null;
}

export function calculatePriceChange(
  previous: number | null,
  proposed: number | null,
): PriceChange | null {
  if (previous === null || proposed === null) return null;
  if (!Number.isFinite(previous) || !Number.isFinite(proposed)) return null;
  const difference = proposed - previous;
  const percent = previous > 0 ? (difference / previous) * 100 : null;
  return { difference, percent };
}

export function hasLowLaborRate(laborRate: number | null): boolean {
  return laborRate !== null && Number.isFinite(laborRate) && laborRate < 90;
}

export function isValidPrice(price: number | null): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0;
}

export function describePricing(pricing: PricingDetails): string {
  if (!isValidPrice(pricing.proposedAnnualPrice)) return 'No proposed price';
  return `$${pricing.proposedAnnualPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} / year`;
}
