import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Renewal } from '../types';
import {
  buildBackup,
  db,
  deleteRenewal,
  listRenewals,
  parseBackupJson,
  replaceRenewals,
  saveRenewal,
} from './db';
import { cloneForNextContract, createRenewal, normalizeRenewal, validateBackupRenewal } from './model';
import { createManualDraft, generateSow } from './sow';
import { makeRenewal } from './testHelpers';
import { CHECKLIST_TOTAL, checklistProgress } from './workflow';

beforeEach(async () => {
  await db.renewals.clear();
});

describe('saved renewals', () => {
  it('preserves email preferences through save, backup and duplication and defaults older records', async () => {
    const renewal = createRenewal();
    renewal.company.emailSystemType = 'Nurse Call';
    renewal.company.emailGreeting = 'Good morning';
    await saveRenewal(renewal);
    expect((await listRenewals())[0].company).toEqual(renewal.company);
    expect(cloneForNextContract(renewal).company.emailSystemType).toBe('Nurse Call');
    const restored = parseBackupJson(JSON.stringify(buildBackup([renewal])));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.renewals[0].company).toEqual(renewal.company);
    delete renewal.company.emailSystemType;
    delete renewal.company.emailGreeting;
    expect(normalizeRenewal(renewal)?.company).toMatchObject({ emailSystemType: 'Fire Alarm', emailGreeting: 'Good Day' });
    expect(validateBackupRenewal(renewal).ok).toBe(true);
  });
  it('defaults proposals to next year and corrects only unmarked current-year drafts', async () => {
    const year = new Date().getFullYear();
    expect(createRenewal(new Date(year, 5, 1).getTime()).company.startYear).toBe(year + 1);
    const legacy = createRenewal();
    legacy.company.startYear = year;
    delete legacy.company.startYearSource;
    legacy.labor.history = legacy.labor.history.map((entry, index) => ({ ...entry, yearLabel: String(year - 3 + index) }));
    await saveRenewal(legacy);
    const [loaded] = await listRenewals();
    expect(loaded.company.startYear).toBe(year + 1);
    expect(loaded.labor.history.map((entry) => entry.yearLabel)).toEqual([year - 2, year - 1, year].map(String));
    const withActualHours = { ...legacy, labor: { ...legacy.labor, history: [{ id: 'actual', yearLabel: String(year - 1), hours: 13 }] } };
    expect(normalizeRenewal(withActualHours)?.labor.history).toEqual(withActualHours.labor.history);
    expect(normalizeRenewal(loaded)).toEqual(loaded);
    expect(normalizeRenewal({ ...legacy, status: 'Approved' })?.company.startYear).toBe(year);
    expect(normalizeRenewal({ ...legacy, company: { ...legacy.company, startYearSource: 'manual' } })?.company.startYear).toBe(year);
    expect(normalizeRenewal({ ...legacy, createdAt: new Date(year - 1, 5, 1).getTime() })?.company.startYear).toBe(year);
  });
  it('repairs legacy UW Credit default mileage without changing hours or custom mileage', async () => {
    const legacy = makeRenewal({
      company: { companyName: 'UW Credit Union' },
      pricing: { proposedAnnualPrice: 1230, laborRatePerHour: 90, annualMileageCharge: 60 },
      labor: { quotedHours: 13 },
    });
    delete legacy.pricing.mileageCostOverride;
    await saveRenewal(legacy);
    const [loaded] = await listRenewals();
    expect(loaded.labor.quotedHours).toBe(13);
    expect(loaded.pricing.annualMileageCharge).toBe(120);
    expect(loaded.pricing.proposedAnnualPrice).toBe(1290);
    expect(loaded.company).toEqual(legacy.company);
    expect(normalizeRenewal(loaded)).toEqual(loaded);
    await saveRenewal(loaded);
    expect((await listRenewals())[0]).toEqual(loaded);
    const custom = normalizeRenewal({ ...legacy, pricing: { ...legacy.pricing, annualMileageCharge: 90, proposedAnnualPrice: 1260 } });
    expect(custom?.pricing.proposedAnnualPrice).toBe(1260);
    expect(custom?.pricing.annualMileageCharge).toBe(90);
    const restored = parseBackupJson(JSON.stringify(buildBackup([legacy])));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.renewals[0].pricing.proposedAnnualPrice).toBe(1290);
  });
  it('preserves a deliberately empty manual SOW draft after reload', async () => {
    const renewal = makeRenewal();
    renewal.sowDraft = createManualDraft('', generateSow(renewal));
    await saveRenewal(renewal);
    expect((await listRenewals())[0].sowDraft).toEqual(renewal.sowDraft);
  });
  it('saves and reloads every renewal field', async () => {
    const renewal = makeRenewal({
      company: {
        companyName: 'Maple Grove Property Management',
        clientName: 'MGPM - DTools',
        locationName: 'Maple Grove Apartments',
        siteAddress: '1234 Maple Grove Rd',
        siteCity: 'Sun Prairie',
        siteState: 'WI',
        dtoolsProjectNumber: '24-1122',
        companyQuotingNotes: 'Always quote two inspectors.',
        internalRenewalNotes: 'Call Dana before sending.',
        startYear: 2025,
      },
      sow: {
        isHospital: true,
        madisonOverride: true,
        billingChoiceAt10000: null,
      },
      status: 'Ready for Julie Review',
    });

    renewal.labor.history[0].hours = 12.5;
    renewal.labor.history[1].hours = null;
    renewal.checklist['teams-dtools'] = true;
    renewal.checklist['julie'] = true;
    const generated = generateSow(renewal);
    renewal.sowDraft = createManualDraft(`${generated}\nExtra clause.`, generated);

    await saveRenewal(renewal);
    const reloaded = await listRenewals();

    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toEqual(renewal);
    expect(reloaded[0].company.dtoolsProjectNumber).toBe('24-1122');
    expect(reloaded[0].labor.history[1].hours).toBeNull();
    expect(reloaded[0].sowDraft?.text).toContain('Extra clause.');
    expect(checklistProgress(reloaded[0].checklist)).toBe(2);
  });

  it('updates an existing record without creating a duplicate', async () => {
    const renewal = makeRenewal();
    await saveRenewal(renewal);
    await saveRenewal({ ...renewal, status: 'Approved' });
    const reloaded = await listRenewals();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].status).toBe('Approved');
  });

  it('keeps the Sent To Mike For Review First status through save and load', async () => {
    const renewal = makeRenewal({ status: 'Sent To Mike For Review First' });
    expect(normalizeRenewal(renewal)?.status).toBe('Sent To Mike For Review First');
    await saveRenewal(renewal);
    expect((await listRenewals())[0].status).toBe('Sent To Mike For Review First');
  });

  it('deletes a record', async () => {
    const renewal = makeRenewal();
    await saveRenewal(renewal);
    await deleteRenewal(renewal.id);
    expect(await listRenewals()).toHaveLength(0);
  });
});

describe('fresh and duplicated renewals', () => {
  it('creates a truly blank renewal with no other customer data', () => {
    const renewal = createRenewal();
    expect(renewal.company.companyName).toBe('');
    expect(renewal.company.clientName).toBe('');
    expect(renewal.company.locationName).toBe('');
    expect(renewal.company.siteAddress).toBe('');
    expect(renewal.company.companyQuotingNotes).toBe('');
    expect(renewal.pricing.proposedAnnualPrice).toBeNull();
    expect(renewal.pricing.previousAnnualPrice).toBeNull();
    expect(renewal.labor.quotedHours).toBeNull();
    expect(renewal.labor.history.every((entry) => entry.hours === null)).toBe(true);
    expect(renewal.status).toBe('Draft');
    expect(renewal.sowDraft).toBeNull();
    expect(checklistProgress(renewal.checklist)).toBe(0);
    expect(renewal.sow.billingChoiceAt10000).toBeNull();
    expect(renewal.sow.isHospital).toBe(false);
    expect(renewal.sow.madisonOverride).toBeNull();
  });

  it('does not leak data between two new records', () => {
    const first = makeRenewal();
    first.checklist['julie'] = true;
    const second = createRenewal();
    expect(second.company.locationName).toBe('');
    expect(second.pricing.previousAnnualPrice).toBeNull();
    expect(second.labor.quotedHours).toBeNull();
    expect(second.checklist['julie']).toBe(false);
  });

  it('duplicates for the next contract without carrying approvals or calculations', () => {
    const source = makeRenewal({
      status: 'Approved',
      company: {
        companyName: 'Acme Property',
        clientName: 'Acme D-Tools',
        locationName: 'Acme Tower',
        companyQuotingNotes: 'Two inspectors minimum.',
        internalRenewalNotes: 'Julie approved 2025.',
        startYear: 2025,
        durationYears: 3,
      },
      pricing: {
        previousAnnualPrice: 8000,
        proposedAnnualPrice: 9200,
        laborRatePerHour: 115,
        pricingChangeNotes: 'Raised 15%.',
      },
      labor: { quotedHours: 22, quotedHoursReason: 'Large site.' },
    });
    source.checklist = Object.fromEntries(
      Array.from({ length: CHECKLIST_TOTAL }, (_, index) => [`step-${index}`, true]),
    );
    const generated = generateSow(source);
    source.sowDraft = createManualDraft(`${generated}\nManual.`, generated);

    const copy = cloneForNextContract(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.status).toBe('Draft');
    expect(copy.company.companyName).toBe('Acme Property');
    expect(copy.company.locationName).toBe('Acme Tower');
    expect(copy.company.companyQuotingNotes).toBe('Two inspectors minimum.');
    expect(copy.company.startYear).toBe(2028);
    expect(copy.pricing.previousAnnualPrice).toBe(9200);
    expect(copy.pricing.proposedAnnualPrice).toBeNull();
    expect(copy.pricing.laborRatePerHour).toBe(115);
    expect(copy.labor.quotedHours).toBeNull();
    expect(copy.labor.history.every((entry) => entry.hours === null)).toBe(true);
    expect(copy.sowDraft).toBeNull();
    expect(checklistProgress(copy.checklist)).toBe(0);
    expect(copy.sow.billingChoiceAt10000).toBeNull();
    expect(copy.sow.annualBillingOverride).toBeNull();
  });
});

describe('JSON backup and restore', () => {
  it('round-trips all renewals through a backup', () => {
    const records: Renewal[] = [makeRenewal(), makeRenewal({ status: 'Completed' })];
    records[1].company.locationName = 'Second Site';
    const backup = buildBackup(records);
    const result = parseBackupJson(JSON.stringify(backup));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.renewals).toHaveLength(2);
    expect(result.renewals.map((renewal) => renewal.id)).toEqual(
      records.map((renewal) => renewal.id),
    );
    expect(result.renewals[1].company.locationName).toBe('Second Site');
    expect(result.skipped).toBe(0);
  });

  it('rejects files that are not OMNI backups', () => {
    expect(parseBackupJson('not json').ok).toBe(false);
    expect(parseBackupJson('{"format":"something-else","renewals":[]}').ok).toBe(false);
    expect(
      parseBackupJson('{"format":"omni-renewal-quote-backup","version":1,"renewals":{}}').ok,
    ).toBe(false);
    expect(
      parseBackupJson('{"format":"omni-renewal-quote-backup","version":1,"renewals":[]}').ok,
    ).toBe(false);
  });

  it('skips unusable records and reports the count', () => {
    const valid = makeRenewal();
    const backup = buildBackup([valid]);
    const raw = JSON.parse(JSON.stringify(backup)) as Record<string, unknown>;
    (raw.renewals as unknown[]).push({ company: { locationName: 'No id' } });
    // A record carrying an existing ID but nothing else is malformed, never a
    // blank renewal that may overwrite the saved customer record.
    (raw.renewals as unknown[]).push({ id: valid.id });
    const result = parseBackupJson(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.renewals).toHaveLength(1);
    expect(result.renewals[0].id).toBe(valid.id);
    expect(result.skipped).toBe(2);
  });

  it('refuses an id-only record even when its id matches a saved renewal', async () => {
    const existing = makeRenewal({
      company: {
        locationName: 'Real Customer Site',
        companyName: 'Real Customer',
        siteAddress: '500 Real St',
      },
    });
    await saveRenewal(existing);

    const envelope = {
      format: 'omni-renewal-quote-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      app: 'OMNI Renewal Quote Assistant',
      renewals: [{ id: existing.id }],
    };
    const result = parseBackupJson(JSON.stringify(envelope));
    expect(result.ok).toBe(false);

    const validation = validateBackupRenewal({ id: existing.id });
    expect(validation.ok).toBe(false);

    const rows = await listRenewals();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(existing);
    expect(rows[0].company.locationName).toBe('Real Customer Site');
  });

  it('rejects a backup record with core objects missing', () => {
    const partial = {
      id: 'existing-id',
      company: { locationName: 'Looks valid' },
      createdAt: 1,
      updatedAt: 2,
    };
    const validation = validateBackupRenewal(partial);
    expect(validation.ok).toBe(false);
  });

  it('skips empty nested objects with a saved ID while restoring valid records', async () => {
    const existing = makeRenewal({
      company: { companyName: 'Keep Customer', locationName: 'Keep Location' },
      pricing: { proposedAnnualPrice: 9000 },
    });
    await saveRenewal(existing);
    const incoming = makeRenewal({ company: { locationName: 'Restored Site' } });
    const malformed = {
      id: existing.id, company: {}, pricing: {}, labor: { history: [] },
      sow: {}, createdAt: 1, updatedAt: 2,
    };
    const backup = { ...buildBackup([incoming]), renewals: [incoming, malformed] };
    const result = parseBackupJson(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(1);
    await replaceRenewals(result.renewals);
    const rows = await listRenewals();
    expect(rows.find((row) => row.id === existing.id)).toEqual(existing);
    expect(rows.find((row) => row.id === incoming.id)).toEqual(incoming);
    expect(parseBackupJson(JSON.stringify({ ...backup, renewals: [malformed] })).ok).toBe(false);
  });

  it.each(['company', 'pricing', 'labor', 'sow'] as const)(
    'rejects incomplete or mistyped nested fields in %s', (section) => {
      const raw = JSON.parse(JSON.stringify(makeRenewal()));
      for (const field of Object.keys(raw[section])) {
        if (section === 'labor' && field === 'importSummary') continue;
        const missing = structuredClone(raw);
        delete missing[section][field];
        if (section === 'pricing' && field === 'annualMileageCharge') {
          const legacy = validateBackupRenewal(missing);
          expect(legacy.ok).toBe(true);
          if (legacy.ok) expect(legacy.renewal.pricing.annualMileageCharge).toBe(60);
        } else if ((section === 'pricing' && field === 'mileageCostOverride') || (section === 'company' && ['startYearSource', 'emailSystemType', 'emailGreeting'].includes(field))) {
          expect(validateBackupRenewal(missing).ok).toBe(true);
        } else {
          expect(validateBackupRenewal(missing).ok, `${section}.${field} missing`).toBe(false);
        }
        const invalid = structuredClone(raw);
        invalid[section][field] = {};
        expect(validateBackupRenewal(invalid).ok, `${section}.${field} invalid`).toBe(false);
      }
    },
  );

  it('preserves an explicit annual mileage charge through save and backup restore', async () => {
    const renewal = makeRenewal({ pricing: { annualMileageCharge: 110 } });
    await saveRenewal(renewal);
    expect((await listRenewals())[0].pricing.annualMileageCharge).toBe(110);
    const restored = parseBackupJson(JSON.stringify(buildBackup([renewal])));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.renewals[0].pricing.annualMileageCharge).toBe(110);
    const invalid = { ...renewal, pricing: { ...renewal.pricing, annualMileageCharge: -1 } };
    expect(validateBackupRenewal(invalid).ok).toBe(false);
    expect(validateBackupRenewal({ ...invalid, pricing: { ...invalid.pricing, annualMileageCharge: '-1' } }).ok).toBe(false);
  });

  it('rejects a malformed imported labor summary but accepts an absent optional summary', () => {
    const raw = makeRenewal();
    const without = { ...raw, labor: { ...raw.labor, importSummary: undefined } };
    expect(validateBackupRenewal(without).ok).toBe(true);
    const invalid = {
      ...raw,
      labor: { ...raw.labor, importSummary: { datasetId: 'ds', projects: [{}] } },
    };
    expect(validateBackupRenewal(invalid).ok).toBe(false);
  });

  it('preserves an applied history snapshot through save and backup', async () => {
    const renewal = makeRenewal();
    renewal.labor.importSummary = {
      datasetId: 'dataset-1', fileName: 'hours.csv', importedAt: 123,
      clientName: 'Client', siteLabel: 'Site', frequency: 'Annual', basis: 'visit',
      projects: [{
        projectKey: 'project-1', projectName: 'Inspection', projectNumber: '25-1',
        year: 2025, hours: 10, entryCount: 1, frequency: 'Annual',
        entries: [{
          row: {
            id: 'dataset-1:2', datasetId: 'dataset-1', sourceRow: 2, date: '2025-01-01',
            projectKey: 'project-1', taskName: 'Inspection', resource: 'Inspector',
            duration: 10, dateMs: new Date('2025-01-01T00:00:00').getTime(), approved: true,
            entity: 'Task', resourceEmail: 'inspector@example.com', clientName: 'Client',
            projectName: 'Inspection', projectNumber: '25-1', projectManager: 'Manager',
            taskNumber: '1', createdOn: '2025-01-02', updatedOn: '2025-01-02',
            updatedBy: 'Manager', sourceFile: 'hours.csv', sourceSheet: 'CSV',
            siteKey: 'site', siteLabel: 'Site', classification: 'annual',
            frequency: 'Annual', serviceYear: 2025, yearSource: 'title',
            reasons: [], taskFlag: null, includedByDefault: true,
          },
          included: true, exclusionReason: null,
        }],
      }],
    };
    await saveRenewal(renewal);
    const result = parseBackupJson(JSON.stringify(buildBackup(await listRenewals())));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.renewals[0].labor.importSummary).toEqual(renewal.labor.importSummary);
    const malformed = structuredClone(renewal);
    malformed.labor.importSummary!.projects[0].entries![0].included = 'yes' as unknown as boolean;
    expect(validateBackupRenewal(malformed).ok).toBe(false);
    const invalidDate = structuredClone(renewal);
    invalidDate.labor.importSummary!.projects[0].entries![0].row.date = 'not a date';
    expect(validateBackupRenewal(invalidDate).ok).toBe(false);
    const inconsistentHours = structuredClone(renewal);
    inconsistentHours.labor.importSummary!.projects[0].hours = 20;
    expect(validateBackupRenewal(inconsistentHours).ok).toBe(false);
    const duplicatedRows = structuredClone(renewal);
    const duplicatedProject = duplicatedRows.labor.importSummary!.projects[0];
    duplicatedProject.entries!.push(structuredClone(duplicatedProject.entries![0]));
    duplicatedProject.hours *= 2;
    duplicatedProject.entryCount *= 2;
    expect(validateBackupRenewal(duplicatedRows).ok).toBe(false);
    const wrongIdentity = structuredClone(renewal);
    wrongIdentity.labor.importSummary!.projects[0].entries![0].row.projectNumber = 'another-project';
    expect(validateBackupRenewal(wrongIdentity).ok).toBe(false);
    const reviewedClient = structuredClone(renewal);
    reviewedClient.labor.importSummary!.projects[0].entries![0].row.clientName = 'Other recorded client';
    expect(validateBackupRenewal(reviewedClient).ok).toBe(true);
  });

  it('rejects malformed history entries instead of silently normalizing them', () => {
    const raw = makeRenewal();
    for (const entry of [null, {}, { id: 'year-1', yearLabel: '2025' },
      { id: 'year-1', yearLabel: '2025', hours: 'invalid' }]) {
      expect(validateBackupRenewal({ ...raw, labor: { ...raw.labor, history: [entry] } }).ok).toBe(false);
    }
  });

  it.each(['schemaVersion', 'status', 'checklist', 'sowDraft'] as const)(
    'rejects missing or malformed %s before it can overwrite saved data', async (field) => {
      const existing = makeRenewal({ status: 'Approved' });
      existing.checklist.julie = true;
      existing.sowDraft = createManualDraft('Keep this manual SOW', generateSow(existing));
      await saveRenewal(existing);
      for (const missing of [true, false]) {
        const malformed = JSON.parse(JSON.stringify(existing));
        if (missing) delete malformed[field];
        else malformed[field] = {};
        const result = parseBackupJson(JSON.stringify({ ...buildBackup([]), renewals: [malformed] }));
        expect(result.ok).toBe(false);
        if (result.ok) await replaceRenewals(result.renewals);
        expect((await listRenewals())[0]).toEqual(existing);
      }
    },
  );

  it('accepts blank drafts and older numeric strings without inventing missing data', () => {
    const raw = JSON.parse(JSON.stringify(createRenewal()));
    raw.pricing.proposedAnnualPrice = '9000';
    raw.labor.history[0].hours = '12.5';
    raw.sowDraft = { text: '', sourceGeneratedText: 'Original', editedAt: 1 };
    const result = parseBackupJson(JSON.stringify({ ...buildBackup([]), renewals: [raw] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.renewals[0].pricing.proposedAnnualPrice).toBe(9000);
    expect(result.renewals[0].labor.history[0].hours).toBe(12.5);
    expect(result.renewals[0].sowDraft?.text).toBe('');
  });

  it('normalizes old records missing newer optional fields', () => {
    const raw = {
      id: 'legacy-1',
      status: 'Draft',
      company: { locationName: 'Legacy Site', startYear: 2024 },
      pricing: { proposedAnnualPrice: '5000' },
      labor: { history: [{ id: 'a', yearLabel: '2023', hours: '12.5' }], quotedHours: 12.5 },
      createdAt: 123,
      updatedAt: 456,
    };
    const normalized = normalizeRenewal(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.pricing.proposedAnnualPrice).toBe(5000);
    expect(normalized?.labor.history[0].hours).toBe(12.5);
    expect(normalized?.company.siteState).toBe('WI');
    expect(normalized?.checklist['julie']).toBe(false);
    expect(normalized?.schemaVersion).toBe(1);
  });
});
