import { describe, expect, it } from 'vitest';
import type { Renewal } from '../types';
import {
  CONDITIONAL_CLAUSES,
  CORE_PARAGRAPHS,
  acknowledgeManualDraft,
  canCopySow,
  createManualDraft,
  evaluateSow,
  generateSow,
  isManualDraftOutdated,
  manualDraftNeedsReview,
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

const BASE = makeRenewal({
  company: { startYear: 2026 },
  labor: { quotedHours: 8 },
});

describe('SOW core template', () => {
  it('preserves the canonical single-inspector sentence including punctuation', () => {
    expect(sow(BASE)).toContain('\n•Labor is quoted with a single inspector.\n');
  });
  it('preserves all nonconditional wording, order, bullets and line breaks exactly', () => {
    const text = sow(BASE);
    const expected = [
      'Omni Technologies is pleased to present the following 3-year proposal for an Annual Fire Alarm System inspection and test at Maple Grove Apartments located at 1234 Maple Grove Rd.',
      '',
      'Description of Work:',
      CORE_PARAGRAPHS.annualInspection,
      CORE_PARAGRAPHS.nfpaReport,
      CORE_PARAGRAPHS.detectorCleaning,
      '',
      'Notes:',
      CONDITIONAL_CLAUSES.singleInspector,
      CORE_PARAGRAPHS.ownerNotification,
      CORE_PARAGRAPHS.normalHours,
      CORE_PARAGRAPHS.customerDelay,
      CORE_PARAGRAPHS.elevator,
      CORE_PARAGRAPHS.lift,
      CONDITIONAL_CLAUSES.annualBilling,
      CONDITIONAL_CLAUSES.facp,
      '',
      'Contract End Date: 12/31/2028',
    ].join('\n');

    expect(text).toBe(expected);
  });

  it('uses real bullet characters and newlines, never Markdown', () => {
    const text = sow(BASE);
    expect(text).toContain('•Provide one annual inspection');
    expect(text).toContain('\n\nDescription of Work:\n');
    expect(text).not.toContain('**');
    expect(text).not.toContain('- ');
    expect(text).not.toContain('<');
  });

  it('inserts the location name and address, not the company name', () => {
    const renewal = makeRenewal({
      company: {
        companyName: 'Maple Grove Property Management',
        clientName: 'MGPM - DTools',
        locationName: 'Maple Grove Apartments',
        siteAddress: '1234 Maple Grove Rd, Sun Prairie, WI 53590',
      },
    });
    const text = sow(renewal);
    expect(text).toContain('at Maple Grove Apartments located at 1234 Maple Grove Rd, Sun Prairie, WI 53590.');
    expect(text).not.toContain('MGPM - DTools');
    expect(text).not.toContain('INSERT');
  });

  it('uses the contract duration in the opening sentence', () => {
    const renewal = makeRenewal({
      company: { durationYears: 5, startYear: 2027 },
    });
    const text = sow(renewal);
    expect(text).toContain('following 5-year proposal');
    expect(text).toContain('Contract End Date: 12/31/2031');
  });
});

describe('Rule B / Rule D — inspectors and FACP', () => {
  it('includes the single-inspector and FACP clauses for an 8-hour non-hospital job', () => {
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

  it('removes the FACP clause for a hospital regardless of inspector count', () => {
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

describe('Rule C / Rule F — hospital and Madison', () => {
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

  it('does not detect Madison from the street address alone', () => {
    const renewal = makeRenewal({
      company: {
        siteAddress: '500 Madison Ave',
        siteCity: 'Sun Prairie',
        siteState: 'WI',
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
  });
});

describe('Rule E — billing language', () => {
  it('includes annual billing and excludes the deposit below $10,000', () => {
    const renewal = makeRenewal({ pricing: { proposedAnnualPrice: 9000 } });
    const text = sow(renewal);
    expect(text).toContain(CONDITIONAL_CLAUSES.annualBilling);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.deposit);
  });

  it('excludes annual billing and includes the deposit above $10,000', () => {
    const renewal = makeRenewal({ pricing: { proposedAnnualPrice: 12000 } });
    const text = sow(renewal);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.annualBilling);
    expect(text).toContain(CONDITIONAL_CLAUSES.deposit);
  });

  it('requires an explicit choice at exactly $10,000, then inserts only that clause', () => {
    const unresolved = makeRenewal({
      pricing: { proposedAnnualPrice: 10000 },
    });
    const evaluation = evaluateSow(unresolved);
    expect(evaluation.billing.unresolved).toBe(true);
    expect(evaluation.billing.requiresChoiceAtThreshold).toBe(true);
    expect(sow(unresolved)).not.toContain(CONDITIONAL_CLAUSES.annualBilling);
    expect(sow(unresolved)).not.toContain(CONDITIONAL_CLAUSES.deposit);
    expect(
      validateSow(unresolved, evaluation).some((issue) => issue.id === 'billing-unresolved'),
    ).toBe(true);

    const annual = makeRenewal({
      pricing: { proposedAnnualPrice: 10000 },
      sow: { billingChoiceAt10000: 'annual' },
    });
    expect(sow(annual)).toContain(CONDITIONAL_CLAUSES.annualBilling);
    expect(sow(annual)).not.toContain(CONDITIONAL_CLAUSES.deposit);

    const deposit = makeRenewal({
      pricing: { proposedAnnualPrice: 10000 },
      sow: { billingChoiceAt10000: 'deposit' },
    });
    expect(sow(deposit)).not.toContain(CONDITIONAL_CLAUSES.annualBilling);
    expect(sow(deposit)).toContain(CONDITIONAL_CLAUSES.deposit);
  });

  it('never assumes billing language when the proposed price is blank', () => {
    const renewal = makeRenewal({
      pricing: { proposedAnnualPrice: null, previousAnnualPrice: 9000 },
    });
    const evaluation = evaluateSow(renewal);
    expect(evaluation.billing.unresolved).toBe(true);
    const text = sow(renewal);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.annualBilling);
    expect(text).not.toContain(CONDITIONAL_CLAUSES.deposit);
    expect(canCopySow(validateSow(renewal, evaluation))).toBe(false);
  });

  it('allows both/neither only with an explicit acknowledgement', () => {
    const both = makeRenewal({
      pricing: { proposedAnnualPrice: 9000 },
      sow: { depositOverride: true },
    });
    const bothEval = evaluateSow(both);
    expect(bothEval.billing.state).toBe('both');
    expect(bothEval.billing.contradiction).toBe(true);
    expect(canCopySow(validateSow(both, bothEval))).toBe(false);

    const acknowledged = makeRenewal({
      pricing: { proposedAnnualPrice: 9000 },
      sow: { depositOverride: true, billingExceptionAcknowledged: true },
    });
    expect(canCopySow(validateSow(acknowledged, evaluateSow(acknowledged)))).toBe(true);
    expect(sow(acknowledged)).toContain(CONDITIONAL_CLAUSES.annualBilling);
    expect(sow(acknowledged)).toContain(CONDITIONAL_CLAUSES.deposit);
  });

  it('allows an explicit billing choice when the price is blank', () => {
    const renewal = makeRenewal({
      pricing: { proposedAnnualPrice: null },
      sow: { depositOverride: true },
    });
    expect(evaluateSow(renewal).billing.unresolved).toBe(false);
    expect(sow(renewal)).toContain(CONDITIONAL_CLAUSES.deposit);
  });

  it('does not let a blank price become a silent neither with both overrides off', () => {
    const renewal = makeRenewal({
      pricing: { proposedAnnualPrice: null },
      sow: { annualBillingOverride: false, depositOverride: false },
    });
    expect(evaluateSow(renewal).billing.unresolved).toBe(true);
    expect(
      validateSow(renewal, evaluateSow(renewal)).some(
        (issue) => issue.id === 'billing-unresolved',
      ),
    ).toBe(true);
  });
});

describe('Rule G — contract end date', () => {
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

  it('blocks copying without quoted hours', () => {
    const renewal = makeRenewal({ labor: { quotedHours: null } });
    expect(
      canCopySow(validateSow(renewal, evaluateSow(renewal))),
    ).toBe(false);
  });

  it('warns for fewer than three valid historical years', () => {
    const renewal = makeRenewal({ labor: { history: [12, null, null] } });
    const issues = validateSow(renewal, evaluateSow(renewal));
    expect(issues.some((issue) => issue.id === 'few-years')).toBe(true);
  });

  it('warns when quoted hours differ from the average without a reason', () => {
    const renewal = makeRenewal({ labor: { quotedHours: 20 } });
    const issues = validateSow(renewal, evaluateSow(renewal));
    expect(issues.some((issue) => issue.id === 'hours-reason')).toBe(true);

    const withReason = makeRenewal({
      labor: { quotedHours: 20, quotedHoursReason: 'Added devices last year.' },
    });
    expect(
      validateSow(withReason, evaluateSow(withReason)).some(
        (issue) => issue.id === 'hours-reason',
      ),
    ).toBe(false);
  });

  it('surfaces the Mike warning through validation', () => {
    const renewal = makeRenewal({ pricing: { laborRatePerHour: 89 } });
    expect(
      validateSow(renewal, evaluateSow(renewal)).some(
        (issue) => issue.id === 'low-rate',
      ),
    ).toBe(true);
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

describe('every meaningful SOW condition combination', () => {
  const hours = [4, 8, 9, 16, 24];
  const hospitals = [false, true];
  const madison = [false, true];
  const billing = [
    { price: 9000, choice: null },
    { price: 12000, choice: null },
    { price: 10000, choice: 'annual' as const },
  ];

  it('applies the inspector, hospital, Madison and billing rules consistently', () => {
    for (const quotedHours of hours) {
      for (const isHospital of hospitals) {
        for (const isMadison of madison) {
          for (const { price, choice } of billing) {
            const renewal = makeRenewal({
              company: {
                siteCity: isMadison ? 'Madison' : 'Sun Prairie',
                siteState: 'WI',
                startYear: 2026,
              },
              pricing: { proposedAnnualPrice: price },
              labor: { quotedHours },
              sow: {
                isHospital,
                billingChoiceAt10000: choice,
                madisonOverride: isMadison,
              },
            });
            const evaluation = evaluateSow(renewal);
            const text = sow(renewal);
            const oneInspector = evaluation.inspectorCount === 1;

            expect(text.includes(CONDITIONAL_CLAUSES.singleInspector)).toBe(oneInspector);
            expect(text.includes(CONDITIONAL_CLAUSES.facp)).toBe(
              oneInspector && !isHospital,
            );
            expect(text.includes(CONDITIONAL_CLAUSES.madison)).toBe(isMadison);
            expect(text.includes(CONDITIONAL_CLAUSES.annualBilling)).toBe(price < 10000 || choice === 'annual');
            expect(text.includes(CONDITIONAL_CLAUSES.deposit)).toBe(price > 10000);
            expect(text).toContain('Contract End Date: 12/31/2028');
          }
        }
      }
    }
  });
});
