import { describe, expect, it } from 'vitest';
import type { Renewal } from '../types';
import {
  CONDITIONAL_CLAUSES,
  CORE_PARAGRAPHS,
  EDWARDS_WARRANTY,
  acknowledgeManualDraft,
  canCopySow,
  createManualDraft,
  evaluateSow,
  generateSow,
  isManualDraftOutdated,
  manualDraftNeedsReview,
  meriterLocationName,
  resolveSowText,
  validateSow,
  validateSowText,
} from './sow';
import { makeRenewal } from './testHelpers';

function sow(renewal: Renewal): string {
  return generateSow(renewal);
}

function evaluate(renewal: Renewal) {
  return evaluateSow(renewal);
}

function issueIds(renewal: Renewal): string[] {
  return validateSow(renewal, evaluateSow(renewal)).map((issue) => issue.id);
}

const BILLING_MULTI_YEAR =
  '•The amount listed will be billed after completion of the inspection(s) each year for the duration of this contract.';

const BASE = makeRenewal({
  company: { startYear: 2026 },
  labor: { quotedHours: 8 },
});

describe('Standard template', () => {
  it('produces the supplied wording, order, bullets and line breaks exactly', () => {
    expect(sow(BASE)).toBe([
      'Omni Technologies is pleased to present the following 3-Year proposal for Annual Fire Alarm System Inspections and Testing for Maple Grove Property Management.',
      '',
      'Location(s) Included:',
      '•Maple Grove Apartments – located at 1234 Maple Grove Rd.',
      '',
      'Description of Work:',
      '•Provide one annual inspection in accordance with applicable state and local codes each year for the duration of this contract.',
      '•A complete NFPA test report will be provided upon completion. All addressable devices will be bar coded and logged with the Building Reports system.',
      '•Detector cleaning will be provided as necessary.',
      '',
      'Notes:',
      '•Labor is quoted with a single inspector.',
      '•Owner is responsible for notifying building occupants and arranging monitoring of the fire alarm system during the inspection.',
      '•Inspections will be performed during normal business hours. Omni Technologies will coordinate scheduling at least two weeks in advance.',
      "•Owner is responsible for providing a lift if required to properly and safely test any devices not easily accessible on a standard 8' A-frame ladder.",
      '•If Omni Technologies cannot locate a device or access an area due to customer delay, additional T&M charges may apply.',
      '•Coordination and fees associated with the elevator company (if devices within the shaft require testing) are the responsibility of the owner.',
      BILLING_MULTI_YEAR,
      '•Labor is not included for an inspector to actively monitor the fire alarm control panel (FACP) for the duration of the inspection. The FACP functions will be bypassed and offline while the system is being tested, and the owner is responsible for providing the necessary staff to actively monitor the FACP if desired.',
      '',
      'Contract End Date: 12/31/2028',
    ].join('\n'));
  });

  it('includes every optional clause with semi-annual, multi-location, deposit and Madison', () => {
    const renewal = makeRenewal({
      company: {
        startYear: 2027,
        siteAddress: '1234 Maple Grove Rd, Sun Prairie, WI 53590',
        additionalLocations: [
          { id: 'b', locationName: 'Maple Grove East', siteAddress: '40 East Way, Madison, WI 53704' },
          { id: 'c', locationName: 'Maple Grove West', siteAddress: '9 West Ln, Verona, WI 53593.' },
        ],
      },
      pricing: { proposedAnnualPrice: 12000 },
      labor: { quotedHours: 6 },
      sow: { inspectionScope: 'Annual and Semi-Annual' },
    });
    expect(sow(renewal)).toBe([
      'Omni Technologies is pleased to present the following 3-Year proposal for Annual and Semi-Annual Fire Alarm System Inspections and Testing for Maple Grove Property Management.',
      '',
      'Location(s) Included:',
      '•Maple Grove Apartments – located at 1234 Maple Grove Rd, Sun Prairie, WI 53590.',
      '•Maple Grove East – located at 40 East Way, Madison, WI 53704.',
      '•Maple Grove West – located at 9 West Ln, Verona, WI 53593.',
      '',
      'Description of Work:',
      '•Provide one annual inspection and one semi-annual inspection in accordance with applicable state and local codes each year for the duration of this contract.',
      CORE_PARAGRAPHS.nfpaReport,
      CORE_PARAGRAPHS.detectorCleaning,
      '',
      'Notes:',
      CONDITIONAL_CLAUSES.singleInspector,
      CORE_PARAGRAPHS.ownerNotification,
      CORE_PARAGRAPHS.normalHours,
      CORE_PARAGRAPHS.lift,
      CORE_PARAGRAPHS.customerDelay,
      CORE_PARAGRAPHS.elevator,
      BILLING_MULTI_YEAR,
      '•A 40% deposit is required upon acceptance of this proposal to initiate scheduling.',
      '•Includes AHJ test report submission fee for uploading test documentation to City of Madison.',
      CONDITIONAL_CLAUSES.facp,
      '',
      'Contract End Date: 12/31/2029',
    ].join('\n'));
  });

  it('drops the "each year for the duration" wording from a one-year contract', () => {
    const renewal = makeRenewal({ company: { durationYears: 1, startYear: 2027 } });
    const text = sow(renewal);
    expect(text).toContain('following 1-Year proposal for Annual Fire Alarm');
    expect(text).toContain(
      '\n•Provide one annual inspection in accordance with applicable state and local codes.\n',
    );
    expect(text).toContain('\n•The amount listed will be billed after completion of the inspection(s).\n');
    expect(text).not.toContain('each year for the duration');
    expect(text).toContain('Contract End Date: 12/31/2027');
  });

  it('uses the contract duration in the opening sentence', () => {
    const renewal = makeRenewal({ company: { durationYears: 5, startYear: 2027 } });
    const text = sow(renewal);
    expect(text).toContain('following 5-Year proposal');
    expect(text).toContain('Contract End Date: 12/31/2031');
  });

  it('names the company in the opening and lists the location, never the client name', () => {
    const renewal = makeRenewal({
      company: {
        companyName: 'Maple Grove Property Management',
        clientName: 'MGPM - DTools',
        locationName: 'Maple Grove Apartments',
        siteAddress: '1234 Maple Grove Rd, Sun Prairie, WI 53590',
      },
    });
    const text = sow(renewal);
    expect(text).toContain('Inspections and Testing for Maple Grove Property Management.\n');
    expect(text).toContain('•Maple Grove Apartments – located at 1234 Maple Grove Rd, Sun Prairie, WI 53590.\n');
    expect(text).not.toContain('MGPM - DTools');
    expect(text).not.toContain('INSERT');
  });

  it('uses real bullet characters and newlines, never Markdown', () => {
    const text = sow(BASE);
    expect(text).toContain('\n\nDescription of Work:\n•Provide one annual inspection');
    expect(text).not.toContain('**');
    expect(text).not.toContain('- ');
    expect(text).not.toContain('<');
  });
});

describe('Standard + Edwards warranty template', () => {
  it('inserts the exact warranty paragraph between the opening and the locations', () => {
    const renewal = makeRenewal({
      company: { startYear: 2026 },
      labor: { quotedHours: 8 },
      sow: { template: 'standard-warranty' },
    });
    const standard = sow(BASE).split('\n');
    expect(sow(renewal)).toBe([
      standard[0],
      '',
      EDWARDS_WARRANTY,
      '',
      ...standard.slice(2),
    ].join('\n'));
    expect(EDWARDS_WARRANTY).toBe(
      'Extended Parts Warranty Included: At no additional cost, eligible Edwards fire alarm components qualify for a manufacturer’s parts warranty of up to seven (7) years from the original materials ship date. Edwards offers this program as an incentive for customers to retain the certified Edwards dealer that installed their system for ongoing annual inspection and testing. To maintain this extended coverage, Customer must have Omni perform the required annual inspections and tests throughout the warranty period. Coverage is subject to Edwards’ approval and warranty terms. Warranty certificate is available upon request.',
    );
  });

  it('never adds the warranty paragraph to the standard template', () => {
    expect(sow(BASE)).not.toContain('Extended Parts Warranty');
  });
});

describe('Meriter template', () => {
  const MERITER = makeRenewal({
    company: {
      companyName: 'Meriter UnityPoint Health',
      locationName: 'McConnell Hall',
      siteAddress: '123 Example St, Madison, WI 53715',
      siteCity: 'Madison',
      siteState: 'WI',
      startYear: 2027,
      durationYears: 3,
    },
    pricing: { proposedAnnualPrice: null },
    labor: { quotedHours: 16 },
    sow: { template: 'meriter', isHospital: false },
  });

  it('produces the supplied Meriter wording with contract dates and the chart placeholder', () => {
    expect(sow(MERITER)).toBe([
      'Omni Technologies is pleased to present the following three-year proposal for the Annual & Semi-Annual Fire Alarm System Inspection and Tests, and Monitoring for the Meriter McConnell Hall located at 123 Example St, Madison, WI 53715.',
      '',
      'Annual & Semi-Annual Inspections Description of Work:',
      '',
      '•Provide one annual inspection and test and one semi-annual inspection at each location listed within this proposal in accordance with the state and local codes.',
      '•A complete NFPA test report will be provided upon completion. All devices will be bar coded and logged with the Building Reports system.',
      '•Detector cleaning will be provided as necessary.',
      '',
      'Notes:',
      '•Work shall be performed during normal business hours. Omni Technologies will schedule the dates of the inspection at least two weeks prior to the inspection.',
      '•Coordination and fees associated with the elevator company, if there are devices in the shaft to be tested, are the responsibility of the owner.',
      '',
      'Monitoring Description of Work:',
      '',
      '•Provide 3 years of 24/7/365 off-site monitoring for the fire alarm system at the Meriter McConnell Hall, as listed within the proposal.',
      '',
      'Contract Dates: July 1, 2027 – June 30, 2030',
      '',
      '*INSERT CHART - SEE PREVIOUS MERITER PROPOSALS]*',
    ].join('\n'));
  });

  it('does not double "Meriter" when the location name already contains it', () => {
    expect(meriterLocationName('Meriter Hospital')).toBe('Meriter Hospital');
    expect(meriterLocationName('All Meriter Therapy Central')).toBe('All Meriter Therapy Central');
    expect(meriterLocationName('Laboratories')).toBe('Meriter Laboratories');
    expect(meriterLocationName('  ')).toBe('Meriter (INSERT LOCATION NAME)');
    const renewal = { ...MERITER, company: { ...MERITER.company, locationName: 'Meriter Hospital' } };
    expect(sow(renewal)).toContain('Monitoring for the Meriter Hospital located at');
    expect(sow(renewal)).toContain('system at the Meriter Hospital, as listed');
  });

  it('follows the duration and start year for the wording and July–June dates', () => {
    const renewal = { ...MERITER, company: { ...MERITER.company, durationYears: 1, startYear: 2028 } };
    const text = sow(renewal);
    expect(text).toContain('following one-year proposal');
    expect(text).toContain('•Provide 1 year of 24/7/365 off-site monitoring');
    expect(text).toContain('Contract Dates: July 1, 2028 – June 30, 2029');
  });

  it('ignores the standard billing, deposit, Madison, inspector and FACP rules', () => {
    const renewal = {
      ...MERITER,
      labor: { ...MERITER.labor, quotedHours: 6 },
      pricing: { ...MERITER.pricing, proposedAnnualPrice: 25000 },
      sow: { ...MERITER.sow, madisonOverride: true, depositOverride: true },
    };
    const text = sow(renewal);
    for (const clause of Object.values(CONDITIONAL_CLAUSES)) {
      expect(text).not.toContain(clause);
    }
    expect(text).not.toContain('billed after completion');
    expect(text).not.toContain('Contract End Date');
  });

  it('can be copied with a blank price and no company name, with a chart reminder', () => {
    const renewal = { ...MERITER, company: { ...MERITER.company, companyName: '' } };
    const ids = issueIds(renewal);
    expect(canCopySow(validateSow(renewal, evaluateSow(renewal)))).toBe(true);
    expect(ids).toContain('meriter-chart');
    expect(ids).not.toContain('deposit-unresolved');
    expect(ids).not.toContain('company-name');
  });

  it('keeps the chart placeholder copyable in a manual draft', () => {
    expect(validateSowText(sow(MERITER))).toEqual([]);
  });

  it('warns that additional locations are left out of the Meriter SOW', () => {
    const renewal = {
      ...MERITER,
      company: {
        ...MERITER.company,
        additionalLocations: [{ id: 'x', locationName: '', siteAddress: '' }],
      },
    };
    const ids = issueIds(renewal);
    expect(ids).toContain('meriter-locations');
    expect(ids.some((id) => id.startsWith('additional-location-'))).toBe(false);
    expect(sow(renewal)).not.toContain('INSERT LOCATION');
  });
});

describe('inspectors and FACP', () => {
  it('includes the single-inspector and FACP clauses for an 8-hour non-healthcare job', () => {
    const renewal = makeRenewal({ labor: { quotedHours: 8 } });
    const text = sow(renewal);
    expect(text).toContain(CONDITIONAL_CLAUSES.singleInspector);
    expect(text).toContain(CONDITIONAL_CLAUSES.facp);
  });

  it('removes the single-inspector and FACP clauses for a 16-hour job', () => {
    const renewal = makeRenewal({ labor: { quotedHours: 16 } });
    const text = sow(renewal);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.singleInspector);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.facp);
    expect(text).not.toContain('single inspector');
  });

  it('removes the FACP clause for healthcare regardless of inspector count', () => {
    for (const quotedHours of [8, 14, 16]) {
      const renewal = makeRenewal({
        sow: { isHospital: true },
        labor: { quotedHours },
      });
      expect(sow(renewal)).not.toContain(CONDITIONAL_CLAUSES.facp);
    }
    const one = makeRenewal({
      sow: { isHospital: true },
      labor: { quotedHours: 8 },
    });
    expect(sow(one)).toContain(CONDITIONAL_CLAUSES.singleInspector);
  });

  it('allows an explicit inspector override', () => {
    const two = makeRenewal({
      labor: { quotedHours: 6, inspectorOverride: 'two' },
    });
    expect(evaluate(two).inspectorCount).toBe(2);
    expect(sow(two)).not.toContain(CONDITIONAL_CLAUSES.singleInspector);
    expect(sow(two)).not.toContain(CONDITIONAL_CLAUSES.facp);

    const one = makeRenewal({
      labor: { quotedHours: 20, inspectorOverride: 'one' },
    });
    expect(evaluate(one).inspectorCount).toBe(1);
    expect(sow(one)).toContain(CONDITIONAL_CLAUSES.singleInspector);
    expect(sow(one)).toContain(CONDITIONAL_CLAUSES.facp);
  });

  it('lets an override remove the FACP clause without inventing replacement text', () => {
    const renewal = makeRenewal({ sow: { facpOverride: false } });
    const text = sow(renewal);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.facp);
    expect(text).not.toContain('two inspector');
    expect(text).toContain(CORE_PARAGRAPHS.lift);
  });
});

describe('Madison AHJ fee', () => {
  it('includes the Madison AHJ fee when Madison YES', () => {
    const renewal = makeRenewal({ sow: { madisonOverride: true } });
    expect(sow(renewal)).toContain(CONDITIONAL_CLAUSES.madison);
  });

  it('removes the Madison AHJ fee when Madison NO', () => {
    const renewal = makeRenewal({ sow: { madisonOverride: false } });
    expect(sow(renewal)).not.toContain(CONDITIONAL_CLAUSES.madison);
  });

  it('auto-suggests Madison for city Madison, Wisconsin', () => {
    const renewal = makeRenewal({
      company: { siteCity: 'madison', siteState: 'wi' },
    });
    expect(evaluate(renewal).madisonAuto).toBe(true);
    expect(evaluate(renewal).madison.effective).toBe(true);
    expect(sow(renewal)).toContain(CONDITIONAL_CLAUSES.madison);
  });

  it('auto-suggests Madison when an additional location address is in Madison, WI', () => {
    const renewal = makeRenewal({
      company: {
        additionalLocations: [
          { id: 'b', locationName: 'Annex', siteAddress: '40 East Way, Madison, WI 53704' },
        ],
      },
    });
    expect(evaluate(renewal).madisonAuto).toBe(true);
    expect(sow(renewal)).toContain(CONDITIONAL_CLAUSES.madison);
  });

  it('does not detect Madison from a street name alone', () => {
    const renewal = makeRenewal({
      company: {
        siteAddress: '500 Madison Ave',
        siteCity: 'Sun Prairie',
        siteState: 'WI',
        additionalLocations: [
          { id: 'b', locationName: 'Annex', siteAddress: '12 Madison St, Verona, WI 53593' },
        ],
      },
    });
    expect(evaluate(renewal).madisonAuto).toBe(false);
    expect(sow(renewal)).not.toContain(CONDITIONAL_CLAUSES.madison);
  });

  it('does not auto-suggest Madison when the state is not Wisconsin', () => {
    const renewal = makeRenewal({
      company: { siteCity: 'Madison', siteState: 'MN' },
    });
    expect(evaluate(renewal).madisonAuto).toBe(false);
    expect(sow(renewal)).not.toContain(CONDITIONAL_CLAUSES.madison);
    expect(issueIds(renewal)).toContain('madison-state');
  });
});

describe('billing language', () => {
  it('always includes the billing line and adds no deposit under $10,000', () => {
    const renewal = makeRenewal({ pricing: { proposedAnnualPrice: 9999.99 } });
    const text = sow(renewal);
    expect(text).toContain(BILLING_MULTI_YEAR);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.deposit);
  });

  it('adds the 40% deposit at exactly $10,000 and above, keeping the billing line', () => {
    for (const price of [10000, 12000]) {
      const renewal = makeRenewal({ pricing: { proposedAnnualPrice: price } });
      const text = sow(renewal);
      expect(text).toContain(`${BILLING_MULTI_YEAR}\n${CONDITIONAL_CLAUSES.deposit}`);
      expect(canCopySow(validateSow(renewal, evaluateSow(renewal)))).toBe(true);
    }
  });

  it('blocks copying while a blank price leaves the deposit undecided', () => {
    const renewal = makeRenewal({
      pricing: { proposedAnnualPrice: null, previousAnnualPrice: 12000 },
    });
    const evaluation = evaluateSow(renewal);
    expect(evaluation.depositUnresolved).toBe(true);
    const text = sow(renewal);
    expect(text).toContain(BILLING_MULTI_YEAR);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.deposit);
    expect(issueIds(renewal)).toContain('deposit-unresolved');
    expect(canCopySow(validateSow(renewal, evaluation))).toBe(false);
  });

  it('lets an explicit deposit choice resolve a blank price', () => {
    for (const depositOverride of [true, false]) {
      const renewal = makeRenewal({
        pricing: { proposedAnnualPrice: null },
        sow: { depositOverride },
      });
      expect(evaluateSow(renewal).depositUnresolved).toBe(false);
      expect(sow(renewal).includes(CONDITIONAL_CLAUSES.deposit)).toBe(depositOverride);
      expect(canCopySow(validateSow(renewal, evaluateSow(renewal)))).toBe(true);
    }
  });

  it('lets overrides remove the billing line or the automatic deposit', () => {
    const noBilling = makeRenewal({ sow: { annualBillingOverride: false } });
    expect(sow(noBilling)).not.toContain('billed after completion');
    expect(evaluate(noBilling).annualBilling.overridden).toBe(true);

    const noDeposit = makeRenewal({
      pricing: { proposedAnnualPrice: 15000 },
      sow: { depositOverride: false },
    });
    expect(sow(noDeposit)).not.toContain(CONDITIONAL_CLAUSES.deposit);
    expect(evaluate(noDeposit).deposit.overridden).toBe(true);
  });
});

describe('contract end date', () => {
  it('ends on 12/31 of the final year for three-year contracts', () => {
    const cases: Array<[number, string]> = [
      [2025, '12/31/2027'],
      [2026, '12/31/2028'],
      [2027, '12/31/2029'],
    ];
    for (const [startYear, expected] of cases) {
      const renewal = makeRenewal({ company: { startYear, durationYears: 3 } });
      expect(evaluateSow(renewal).contractEndDate).toBe(expected);
      expect(sow(renewal)).toContain(`Contract End Date: ${expected}`);
    }
  });

  it('scales the end date with a non-standard duration', () => {
    const renewal = makeRenewal({ company: { startYear: 2025, durationYears: 2 } });
    expect(sow(renewal)).toContain('Contract End Date: 12/31/2026');
  });
});

describe('validation and copy gating', () => {
  it('blocks copying when required location details are missing', () => {
    const renewal = makeRenewal({
      company: { locationName: '', siteAddress: '' },
    });
    const issues = validateSow(renewal, evaluateSow(renewal));
    expect(canCopySow(issues)).toBe(false);
    expect(issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining(['location', 'address']),
    );
  });

  it('requires the company name for the standard templates', () => {
    for (const template of ['standard', 'standard-warranty'] as const) {
      const renewal = makeRenewal({ company: { companyName: '  ' }, sow: { template } });
      expect(issueIds(renewal)).toContain('company-name');
      expect(sow(renewal)).toContain('Inspections and Testing for (INSERT COMPANY NAME).');
    }
  });

  it('blocks an additional location missing its name or address', () => {
    const renewal = makeRenewal({
      company: {
        additionalLocations: [
          { id: 'ok', locationName: 'Annex', siteAddress: '2 Annex Rd' },
          { id: 'half', locationName: 'North', siteAddress: ' ' },
        ],
      },
    });
    expect(issueIds(renewal)).toEqual(expect.arrayContaining(['additional-location-half']));
    expect(issueIds(renewal)).not.toContain('additional-location-ok');
    expect(sow(renewal)).toContain('•North – located at (INSERT FULL ADDRESS).');
    expect(canCopySow(validateSow(renewal, evaluateSow(renewal)))).toBe(false);
  });

  it('blocks copying without quoted hours', () => {
    const renewal = makeRenewal({ labor: { quotedHours: null } });
    expect(
      canCopySow(validateSow(renewal, evaluateSow(renewal))),
    ).toBe(false);
  });

  it('warns for fewer than three valid historical years', () => {
    const renewal = makeRenewal({ labor: { history: [12, null, null] } });
    expect(issueIds(renewal)).toContain('few-years');
  });

  it('warns when quoted hours differ from the average without a reason', () => {
    const renewal = makeRenewal({ labor: { quotedHours: 20 } });
    expect(issueIds(renewal)).toContain('hours-reason');

    const withReason = makeRenewal({
      labor: { quotedHours: 20, quotedHoursReason: 'Added devices last year.' },
    });
    expect(issueIds(withReason)).not.toContain('hours-reason');
  });

  it('surfaces the Mike warning through validation', () => {
    const renewal = makeRenewal({ pricing: { laborRatePerHour: 89 } });
    expect(issueIds(renewal)).toContain('low-rate');
  });

  it('allows copying a complete, resolved renewal', () => {
    const renewal = makeRenewal({ company: { startYear: 2025 } });
    const issues = validateSow(renewal, evaluateSow(renewal));
    expect(canCopySow(issues)).toBe(true);
  });
});

describe('manual SOW drafts', () => {
  it('never silently overwrites manual edits when inputs change', () => {
    const original = makeRenewal();
    const generated = generateSow(original);
    const draft = createManualDraft(
      `${generated}\n\nSpecial note: elevator access is through the loading dock.`,
      generated,
    );
    const edited: Renewal = { ...original, sowDraft: draft };

    expect(isManualDraftOutdated(edited, generated)).toBe(false);
    expect(resolveSowText(edited, generated)).toBe(draft.text);

    const changed: Renewal = {
      ...edited,
      company: { ...edited.company, locationName: 'Maple Grove North' },
    };
    const newGenerated = generateSow(changed);
    expect(newGenerated).not.toBe(generated);
    expect(isManualDraftOutdated(changed, newGenerated)).toBe(true);
    expect(manualDraftNeedsReview(changed, newGenerated)).toBe(true);
    // The draft survives untouched; generated text is preserved separately.
    expect(resolveSowText(changed, newGenerated)).toBe(draft.text);
    expect(changed.sowDraft?.sourceGeneratedText).toBe(generated);

    const reviewed = acknowledgeManualDraft(changed, newGenerated);
    expect(manualDraftNeedsReview(reviewed, newGenerated)).toBe(false);
    expect(reviewed.sowDraft?.text).toBe(draft.text);

    const changedAgain: Renewal = {
      ...reviewed,
      company: { ...reviewed.company, siteAddress: '99 New Address' },
    };
    expect(manualDraftNeedsReview(changedAgain, generateSow(changedAgain))).toBe(true);
  });

  it('requires review of a manual draft when the template changes', () => {
    const original = makeRenewal();
    const generated = generateSow(original);
    const edited: Renewal = { ...original, sowDraft: createManualDraft(generated, generated) };
    const switched: Renewal = { ...edited, sow: { ...edited.sow, template: 'standard-warranty' } };
    expect(manualDraftNeedsReview(switched, generateSow(switched))).toBe(true);
    expect(resolveSowText(switched, generateSow(switched))).toBe(generated);
  });

  it('blocks an empty manual draft from being copied', () => {
    expect(validateSowText('   \n\t ').map((issue) => issue.id)).toContain(
      'manual-empty',
    );
  });

  it('blocks unresolved INSERT placeholders in a manual draft', () => {
    const draft = 'Omni Technologies ... at (INSERT LOCATION NAME) located at 123 Main St.';
    expect(validateSowText(draft).map((issue) => issue.id)).toContain(
      'manual-placeholder',
    );
    expect(validateSowText('at INSERT FULL ADDRESS located...').length).toBeGreaterThan(0);
    expect(validateSowText('for (INSERT COMPANY NAME).').length).toBeGreaterThan(0);
  });

  it('accepts a resolved manual draft', () => {
    const renewal = makeRenewal();
    expect(validateSowText(generateSow(renewal))).toEqual([]);
  });

  it('returns generated text when no manual draft exists', () => {
    const renewal = makeRenewal();
    expect(resolveSowText(renewal, generateSow(renewal))).toBe(generateSow(renewal));
  });
});

describe('every meaningful standard SOW condition combination', () => {
  const hours = [4, 8, 9, 16, 24];
  const healthcare = [false, true];
  const madison = [false, true];
  const prices = [9000, 10000, 12000];
  const templates = ['standard', 'standard-warranty'] as const;
  const scopes = ['Annual', 'Annual and Semi-Annual'] as const;

  it('applies the inspector, healthcare, Madison, billing, warranty and scope rules consistently', () => {
    for (const quotedHours of hours) {
      for (const isHospital of healthcare) {
        for (const isMadison of madison) {
          for (const price of prices) {
            for (const template of templates) {
              for (const inspectionScope of scopes) {
                const renewal = makeRenewal({
                  company: {
                    siteCity: isMadison ? 'Madison' : 'Sun Prairie',
                    siteState: 'WI',
                    startYear: 2026,
                  },
                  pricing: { proposedAnnualPrice: price },
                  labor: { quotedHours },
                  sow: { isHospital, madisonOverride: isMadison, template, inspectionScope },
                });
                const evaluation = evaluateSow(renewal);
                const text = sow(renewal);
                const oneInspector = evaluation.inspectorCount === 1;

                expect(text.includes(CONDITIONAL_CLAUSES.singleInspector)).toBe(oneInspector);
                expect(text.includes(CONDITIONAL_CLAUSES.facp)).toBe(oneInspector && !isHospital);
                expect(text.includes(CONDITIONAL_CLAUSES.madison)).toBe(isMadison);
                expect(text).toContain(BILLING_MULTI_YEAR);
                expect(text.includes(CONDITIONAL_CLAUSES.deposit)).toBe(price >= 10000);
                expect(text.includes(EDWARDS_WARRANTY)).toBe(template === 'standard-warranty');
                expect(text.includes('one semi-annual inspection')).toBe(
                  inspectionScope === 'Annual and Semi-Annual',
                );
                expect(text).toContain(`proposal for ${inspectionScope} Fire Alarm System`);
                expect(text).toContain('Contract End Date: 12/31/2028');
                expect(canCopySow(validateSow(renewal, evaluation))).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});
