import type { HistoricalHoursEntry, Renewal } from '../types';
import { createRenewal } from './model';

export interface RenewalOverrides {
  company?: Partial<Renewal['company']>;
  pricing?: Partial<Renewal['pricing']>;
  labor?: Partial<Omit<Renewal['labor'], 'history'>> & {
    history?: Array<HistoricalHoursEntry | number | null>;
  };
  sow?: Partial<Renewal['sow']>;
  sowDraft?: Renewal['sowDraft'];
  status?: Renewal['status'];
}

export function makeHistory(values: Array<number | null>): HistoricalHoursEntry[] {
  return values.map((hours, index) => ({
    id: `h${index}`,
    yearLabel: String(2023 + index),
    hours,
  }));
}

export function makeRenewal(overrides: RenewalOverrides = {}): Renewal {
  const base = createRenewal(1_700_000_000_000);
  const labor = overrides.labor ?? {};
  return {
    ...base,
    status: overrides.status ?? base.status,
    company: {
      ...base.company,
      locationName: 'Maple Grove Apartments',
      siteAddress: '1234 Maple Grove Rd',
      siteCity: 'Sun Prairie',
      siteState: 'WI',
      ...overrides.company,
    },
    pricing: {
      ...base.pricing,
      previousAnnualPrice: 4200,
      proposedAnnualPrice: 4650,
      laborRatePerHour: 110,
      ...overrides.pricing,
    },
    labor: {
      ...base.labor,
      history:
        labor.history === undefined
          ? makeHistory([12.5, 14, 15.5])
          : labor.history.map((entry, index) =>
              typeof entry === 'number' || entry === null
                ? { id: `h${index}`, yearLabel: String(2023 + index), hours: entry }
                : entry,
            ),
      quotedHours: 'quotedHours' in labor ? (labor.quotedHours ?? null) : 14,
      quotedHoursReason: labor.quotedHoursReason ?? '',
      mileageOverride: labor.mileageOverride ?? null,
      inspectorOverride: labor.inspectorOverride ?? null,
    },
    sow: {
      ...base.sow,
      ...overrides.sow,
    },
    sowDraft: overrides.sowDraft ?? null,
  };
}
