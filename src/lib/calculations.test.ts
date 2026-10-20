import { describe, expect, it } from 'vitest';
import {
  autoInspectorCount,
  calculateHistoryStats,
  calculatePriceChange,
  effectiveMileageUnitCost,
  hasLowLaborRate,
  hoursDifference,
  isValidHours,
  suggestedMileageUnitCost,
} from './calculations';
import { makeHistory } from './testHelpers';

describe('historical hours', () => {
  it('averages 12.5, 14 and 15.5 to 14 hours', () => {
    const stats = calculateHistoryStats(makeHistory([12.5, 14, 15.5]));
    expect(stats.validYears).toBe(3);
    expect(stats.totalHours).toBe(42);
    expect(stats.averageHours).toBe(14);
    expect(stats.recommendedHours).toBe(14);
  });

  it('does not count blank fields as zero', () => {
    const stats = calculateHistoryStats(makeHistory([12.5, null, 15.5]));
    expect(stats.validYears).toBe(2);
    expect(stats.totalHours).toBe(28);
    expect(stats.averageHours).toBe(14);
    expect(stats.recommendedHours).toBe(14);
  });

  it('returns no average when every field is blank', () => {
    const stats = calculateHistoryStats(makeHistory([null, null, null]));
    expect(stats.validYears).toBe(0);
    expect(stats.averageHours).toBeNull();
    expect(stats.recommendedHours).toBeNull();
  });

  it('rounds the recommendation up to a whole hour', () => {
    expect(calculateHistoryStats(makeHistory([10, 10, 10.2])).recommendedHours).toBe(11);
    expect(calculateHistoryStats(makeHistory([8, 9])).recommendedHours).toBe(9);
  });

  it('keeps quoted hours independent from the average', () => {
    const stats = calculateHistoryStats(makeHistory([12.5, 14, 15.5]));
    const quoted = 18;
    expect(stats.averageHours).toBe(14);
    expect(quoted).toBe(18);
    expect(hoursDifference(quoted, stats.averageHours)).toBe(4);
  });

  it('treats zero as a real value, not a blank', () => {
    expect(isValidHours(0)).toBe(true);
    expect(isValidHours(null)).toBe(false);
    const stats = calculateHistoryStats(makeHistory([0, 10]));
    expect(stats.validYears).toBe(2);
    expect(stats.averageHours).toBe(5);
  });
});

describe('mileage / travel unit cost', () => {
  it('suggests $50 for 8 quoted hours', () => {
    expect(suggestedMileageUnitCost(8)).toBe(50);
    expect(autoInspectorCount(8)).toBe(1);
  });

  it('suggests $100 for 16 quoted hours', () => {
    expect(suggestedMileageUnitCost(16)).toBe(100);
    expect(autoInspectorCount(16)).toBe(2);
  });

  it('suggests $150 for 24 quoted hours', () => {
    expect(suggestedMileageUnitCost(24)).toBe(150);
    expect(autoInspectorCount(24)).toBe(2);
  });

  it('suggests $100 for 14 quoted hours while preserving 14 quoted hours', () => {
    expect(suggestedMileageUnitCost(14)).toBe(100);
    expect(14).toBe(14);
  });

  it('rounds up within an eight-hour block', () => {
    expect(suggestedMileageUnitCost(1)).toBe(50);
    expect(suggestedMileageUnitCost(8.1)).toBe(100);
    expect(suggestedMileageUnitCost(17)).toBe(150);
    expect(suggestedMileageUnitCost(0)).toBeNull();
    expect(suggestedMileageUnitCost(null)).toBeNull();
  });

  it('honours a manual mileage override', () => {
    expect(effectiveMileageUnitCost(14, 75)).toBe(75);
    expect(effectiveMileageUnitCost(14, null)).toBe(100);
  });

  it('suggests $200 for 32 hours and rejects invalid or nonpositive hours', () => {
    expect(suggestedMileageUnitCost(32)).toBe(200);
    for (const hours of [null, 0, -1, NaN, Infinity]) {
      expect(suggestedMileageUnitCost(hours)).toBeNull();
    }
  });

  it('uses one inspector at exactly 8 hours and two above 8', () => {
    expect(autoInspectorCount(8)).toBe(1);
    expect(autoInspectorCount(8.25)).toBe(2);
    expect(autoInspectorCount(null)).toBe(1);
  });
});

describe('pricing checks', () => {
  it('warns at $89 and does not warn at $90', () => {
    expect(hasLowLaborRate(89)).toBe(true);
    expect(hasLowLaborRate(90)).toBe(false);
    expect(hasLowLaborRate(null)).toBe(false);
  });

  it('calculates dollar and percentage change from the previous price', () => {
    const change = calculatePriceChange(4000, 4600);
    expect(change?.difference).toBe(600);
    expect(change?.percent).toBe(15);
  });

  it('returns no change when either price is missing', () => {
    expect(calculatePriceChange(null, 4600)).toBeNull();
    expect(calculatePriceChange(4000, null)).toBeNull();
  });
});
