import { describe, expect, it } from 'vitest';
import { createRenewal } from './model';
import { parseAddressCity, updateMileageCost, updateRenewalLabor, updateRenewalPricing } from './renewalInputs';

describe('renewal input conveniences', () => {
  it('adds 20% markup to mileage cost and matches the D-Tools examples in both directions', () => {
    const renewal = updateMileageCost(createRenewal(), 100);
    expect(renewal.pricing.annualMileageCharge).toBe(120);
    expect(updateRenewalLabor(renewal, { quotedHours: 14 }).pricing.proposedAnnualPrice).toBe(1380);
    expect(updateRenewalLabor(renewal, { quotedHours: 13 }).pricing.proposedAnnualPrice).toBe(1290);
    expect(updateRenewalPricing(renewal, { proposedAnnualPrice: 1290 }).labor.quotedHours).toBe(13);
    expect(updateRenewalPricing(renewal, { proposedAnnualPrice: 1380 }).labor.quotedHours).toBe(14);
    expect(updateMileageCost(createRenewal(), 50).pricing.annualMileageCharge).toBe(60);
    expect(updateMileageCost(renewal, 0).pricing.annualMileageCharge).toBe(0);
    expect(updateMileageCost(renewal, null).pricing.annualMileageCharge).toBeNull();
    expect(updateMileageCost(renewal, 12.34).pricing.annualMileageCharge).toBe(14.81);
  });

  it('automatically follows mileage blocks in both directions while preserving manual overrides', () => {
    const renewal = createRenewal();
    for (const [hours, charge, total] of [[5, 60, 510], [8, 60, 780], [13, 120, 1290], [14, 120, 1380], [16, 120, 1560], [17, 180, 1710]]) {
      const quoted = updateRenewalLabor(renewal, { quotedHours: hours });
      expect(quoted.pricing.annualMileageCharge).toBe(charge);
      expect(quoted.pricing.proposedAnnualPrice).toBe(total);
      const priced = updateRenewalPricing(renewal, { proposedAnnualPrice: total });
      expect(priced.pricing.annualMileageCharge).toBe(charge);
      expect(priced.labor.quotedHours).toBe(hours);
    }
    expect(updateRenewalPricing(renewal, { proposedAnnualPrice: 800 }).labor.quotedHours).toBeNull();
    const quoted = updateRenewalLabor(renewal, { quotedHours: 13 });
    const changedMileage = updateMileageCost(quoted, 110);
    expect(changedMileage.labor.quotedHours).toBe(13);
    expect(changedMileage.pricing.proposedAnnualPrice).toBe(1302);
    const unitCostOverride = updateRenewalLabor(quoted, { mileageOverride: 150 });
    expect(unitCostOverride.pricing.annualMileageCharge).toBe(180);
    expect(unitCostOverride.pricing.proposedAnnualPrice).toBe(1350);
    expect(updateRenewalPricing(quoted, { pricingChangeNotes: 'Reviewed' }).pricing.annualMileageCharge).toBe(120);
    const manual = updateMileageCost(renewal, 50);
    expect(updateRenewalLabor(manual, { quotedHours: 13 }).pricing.proposedAnnualPrice).toBe(1230);
  });
  it('defaults to $90 and recalculates hours from the chosen rate', () => {
    const fresh = createRenewal();
    expect(fresh.pricing.laborRatePerHour).toBe(90);
    expect(fresh.pricing.annualMileageCharge).toBe(60);
    const priced = updateRenewalPricing(fresh, { proposedAnnualPrice: 510 });
    expect(priced.labor.quotedHours).toBe(5);
    expect(updateRenewalPricing(priced, { laborRatePerHour: 100 }).labor.quotedHours).toBe(4.5);
    expect(updateRenewalPricing(priced, { annualMileageCharge: 0 }).labor.quotedHours).toBe(5.67);
    expect(updateRenewalPricing(priced, { annualMileageCharge: 600 }).labor.quotedHours).toBeNull();
    expect(updateRenewalPricing(priced, { annualMileageCharge: null }).labor.quotedHours).toBeNull();
    expect(updateRenewalPricing(priced, { laborRatePerHour: 0 }).labor.quotedHours).toBeNull();
    expect(updateRenewalPricing(priced, { proposedAnnualPrice: null }).labor.quotedHours).toBeNull();
  });

  it('preserves manually edited hours when changing unrelated pricing notes', () => {
    const renewal = createRenewal();
    renewal.labor.quotedHours = 17;
    expect(updateRenewalPricing(renewal, { pricingChangeNotes: 'Reviewed' }).labor.quotedHours).toBe(17);
  });

  it('calculates annual price from hours, including mileage, without rounding the entered hours', () => {
    const renewal = createRenewal();
    const quoted = updateRenewalLabor(renewal, { quotedHours: 5 });
    expect(quoted.pricing.proposedAnnualPrice).toBe(510);
    expect(updateRenewalPricing(quoted, { proposedAnnualPrice: 600 }).labor.quotedHours).toBe(6);
    expect(updateRenewalLabor(quoted, { quotedHours: 0 }).pricing.proposedAnnualPrice).toBe(60);
    const fractional = updateRenewalLabor(quoted, { quotedHours: 5.12345 });
    expect(fractional.pricing.proposedAnnualPrice).toBe(521.11);
    expect(fractional.labor.quotedHours).toBe(5.12345);
    expect(updateRenewalLabor(quoted, { quotedHours: null }).pricing.proposedAnnualPrice).toBeNull();
    expect(updateRenewalLabor(quoted, { quotedHoursReason: 'Reviewed' }).pricing.proposedAnnualPrice).toBe(510);
    expect(updateRenewalLabor({ ...quoted, pricing: { ...quoted.pricing, laborRatePerHour: 0 } }, { quotedHours: 5 }).pricing.proposedAnnualPrice).toBeNull();
  });

  it('extracts cities and states without confusing street names for a city', () => {
    expect(parseAddressCity('101 S Webster St, Madison, WI 53703')).toEqual({ siteCity: 'Madison', siteState: 'WI' });
    expect(parseAddressCity('123 Main St, Sun Prairie WI 53590-1234')).toEqual({ siteCity: 'Sun Prairie', siteState: 'WI' });
    expect(parseAddressCity('123 Main St\nLake Mills, WI 53551')).toEqual({ siteCity: 'Lake Mills', siteState: 'WI' });
    expect(parseAddressCity('123 Madison Ave')).toBeNull();
  });
});
