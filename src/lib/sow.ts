import type { Renewal, SowRuleSelections } from '../types';
import {
  calculateHistoryStats,
  effectiveInspectorCount,
  hasLowLaborRate,
  hoursDifference,
  isValidPrice,
} from './calculations';

/**
 * The canonical Omni Technologies annual inspection renewal SOW.
 *
 * Wording below must stay byte-for-byte identical to the supplied contract
 * template. Only the conditionally included bullets are filtered out.
 */
export const CORE_PARAGRAPHS = {
  ownerNotification:
    '•Owner is responsible for notifying building occupants and arranging monitoring of the fire alarm system during the inspection.',
  normalHours:
    '•Inspections will be performed during normal business hours. Omni Technologies will coordinate scheduling at least two weeks in advance.',
  customerDelay:
    '•If Omni cannot locate a device or access an area due to customer delay, additional T&M charges may apply.',
  elevator:
    '•Coordination and fees associated with the elevator company (if devices within the shaft require testing) are the responsibility of the owner.',
  lift: "•Owner is responsible for providing a lift if required to properly and safely test any device(s) not easily accessible on a standard 8' A-frame ladder",
  detectorCleaning: '•Detector cleaning will be provided as necessary.',
  annualInspection:
    '•Provide one annual inspection in accordance with the state and local codes each year for the duration of this contract.',
  nfpaReport:
    '•A complete NFPA test report will be provided upon completion. All addressable devices will be bar coded and logged with the Building Reports system.',
} as const;

export const CONDITIONAL_CLAUSES = {
  singleInspector: '•Labor is quoted with a single inspector.',
  annualBilling:
    '•Amount listed per year will be billed after completion of annual inspection each year for the duration of this contract.',
  deposit:
    '•40% deposit is required upon acceptance of this proposal to initiate scheduling.',
  madison:
    '•Includes AHJ test report submission fee to upload test documentation to City of Madison.',
  facp:
    '•Labor is not included for an inspector to actively monitor the fire alarm control panel (FACP) for the duration of the inspection. The FACP functions will be bypassed and offline while the system is being tested, and the owner is to provide the necessary staff to actively monitor the FACP if desired.',
} as const;

export type ConditionalClauseId = keyof typeof CONDITIONAL_CLAUSES;

export interface ClauseDecision {
  auto: boolean;
  effective: boolean;
  overridden: boolean;
}

export type BillingState = 'annual' | 'deposit' | 'both' | 'neither';

export interface BillingEvaluation {
  price: number | null;
  /** True when the price is $10,000 and no choice/override resolves it. */
  requiresChoiceAtThreshold: boolean;
  /** True when a blank price or unresolved $10,000 leaves no billing clause. */
  unresolved: boolean;
  /** Both or neither selected deliberately — needs acknowledgement. */
  contradiction: boolean;
  state: BillingState;
  annual: ClauseDecision;
  deposit: ClauseDecision;
}

export interface SowEvaluation {
  durationYears: number;
  startYear: number;
  endYear: number;
  contractEndDate: string;
  inspectorCount: 1 | 2;
  autoInspectorCount: 1 | 2;
  singleInspector: ClauseDecision;
  facp: ClauseDecision;
  madison: ClauseDecision;
  annualBilling: ClauseDecision;
  deposit: ClauseDecision;
  billing: BillingEvaluation;
  /** True when the site city/state automatically qualifies for the Madison fee. */
  madisonAuto: boolean;
  isMadison: boolean;
  isHospital: boolean;
}

export function normalizeState(state: string): string {
  return state.trim().toLowerCase();
}

/** Madison qualification uses the verified city + state, never a text search. */
export function isMadisonSite(city: string, state: string): boolean {
  const normalizedState = normalizeState(state);
  return (
    city.trim().toLowerCase() === 'madison' &&
    (normalizedState === 'wi' || normalizedState === 'wisconsin')
  );
}

export function safeYear(year: number): number {
  return Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear();
}

export function safeDuration(years: number): number {
  return Number.isFinite(years) && years >= 1 ? Math.trunc(years) : 1;
}

export function calculateEndYear(startYear: number, durationYears: number): number {
  return safeYear(startYear) + safeDuration(durationYears) - 1;
}

/** Always December 31 of the final contract year, formatted MM/DD/YYYY. */
export function contractEndDate(startYear: number, durationYears: number): string {
  return `12/31/${calculateEndYear(startYear, durationYears)}`;
}

function clause(
  auto: boolean,
  override: boolean | null,
): ClauseDecision {
  return {
    auto,
    effective: override ?? auto,
    overridden: override !== null && override !== auto,
  };
}

function evaluateBilling(rules: SowRuleSelections, price: number | null): BillingEvaluation {
  let autoAnnual = false;
  let autoDeposit = false;
  let requiresChoiceAtThreshold = false;

  if (isValidPrice(price)) {
    if (price === 10000) {
      if (rules.billingChoiceAt10000 === 'annual') autoAnnual = true;
      else if (rules.billingChoiceAt10000 === 'deposit') autoDeposit = true;
      else requiresChoiceAtThreshold = true;
    } else if (price < 10000) {
      autoAnnual = true;
    } else {
      autoDeposit = true;
    }
  }

  const annual = clause(autoAnnual, rules.annualBillingOverride);
  const deposit = clause(autoDeposit, rules.depositOverride);

  const both = annual.effective && deposit.effective;
  const neither = !annual.effective && !deposit.effective;
  // A blank price or an unresolved $10,000 price must never silently produce a
  // "neither" document, even if the user switched both clauses off by hand.
  const unresolved = neither && (price === null || requiresChoiceAtThreshold);

  return {
    price,
    requiresChoiceAtThreshold,
    unresolved,
    contradiction: (both || neither) && !unresolved,
    state: both ? 'both' : neither ? 'neither' : annual.effective ? 'annual' : 'deposit',
    annual,
    deposit,
  };
}

export function evaluateSow(renewal: Renewal): SowEvaluation {
  const { company, labor, sow } = renewal;
  const autoCount = labor.quotedHours !== null && labor.quotedHours > 8 ? 2 : 1;
  const inspectorCount = effectiveInspectorCount(
    labor.quotedHours,
    labor.inspectorOverride,
  );
  const madisonAuto = isMadisonSite(company.siteCity, company.siteState);
  const isMadison = sow.madisonOverride ?? madisonAuto;

  const billing = evaluateBilling(sow, renewal.pricing.proposedAnnualPrice);

  return {
    durationYears: safeDuration(company.durationYears),
    startYear: safeYear(company.startYear),
    endYear: calculateEndYear(company.startYear, company.durationYears),
    contractEndDate: contractEndDate(company.startYear, company.durationYears),
    inspectorCount,
    autoInspectorCount: autoCount,
    singleInspector: clause(inspectorCount === 1, sow.singleInspectorOverride),
    // Rule D: FACP is included only when NOT a hospital AND one inspector.
    facp: clause(!sow.isHospital && inspectorCount === 1, sow.facpOverride),
    madison: clause(madisonAuto, sow.madisonOverride),
    annualBilling: billing.annual,
    deposit: billing.deposit,
    billing,
    madisonAuto,
    isMadison,
    isHospital: sow.isHospital,
  };
}

function openingParagraph(renewal: Renewal, evaluation: SowEvaluation): string {
  const location = renewal.company.locationName.trim() || '(INSERT LOCATION NAME)';
  const address = renewal.company.siteAddress.trim() || '(INSERT FULL ADDRESS)';
  return `Omni Technologies is pleased to present the following ${evaluation.durationYears}-year proposal for an Annual Fire Alarm System inspection and test at ${location} located at ${address}.`;
}

function noteLines(evaluation: SowEvaluation): string[] {
  const lines: string[] = [];

  if (evaluation.singleInspector.effective) {
    lines.push(CONDITIONAL_CLAUSES.singleInspector);
  }
  lines.push(CORE_PARAGRAPHS.ownerNotification);
  lines.push(CORE_PARAGRAPHS.normalHours);
  lines.push(CORE_PARAGRAPHS.customerDelay);
  lines.push(CORE_PARAGRAPHS.elevator);
  lines.push(CORE_PARAGRAPHS.lift);
  if (evaluation.annualBilling.effective) {
    lines.push(CONDITIONAL_CLAUSES.annualBilling);
  }
  if (evaluation.deposit.effective) {
    lines.push(CONDITIONAL_CLAUSES.deposit);
  }
  if (evaluation.madison.effective) {
    lines.push(CONDITIONAL_CLAUSES.madison);
  }
  if (evaluation.facp.effective) {
    lines.push(CONDITIONAL_CLAUSES.facp);
  }

  return lines;
}

/**
 * Produces the exact plain-text SOW for D-Tools. Bullets are real `•`
 * characters, paragraphs are separated by a single blank line, and no
 * Markdown/HTML is ever emitted.
 */
export function generateSow(
  renewal: Renewal,
  evaluation: SowEvaluation = evaluateSow(renewal),
): string {
  return [
    openingParagraph(renewal, evaluation),
    '',
    'Description of Work:',
    CORE_PARAGRAPHS.annualInspection,
    CORE_PARAGRAPHS.nfpaReport,
    CORE_PARAGRAPHS.detectorCleaning,
    '',
    'Notes:',
    ...noteLines(evaluation),
    '',
    `Contract End Date: ${evaluation.contractEndDate}`,
  ].join('\n');
}

export interface SowIssue {
  id: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Blocks only on things that would make the copied document wrong or
 * contractually unresolved. Everything else is a visible warning.
 */
export function validateSow(renewal: Renewal, evaluation: SowEvaluation): SowIssue[] {  const issues: SowIssue[] = [];
  const { company, labor, pricing, sow } = renewal;

  if (!company.locationName.trim()) {
    issues.push({
      id: 'location',
      severity: 'error',
      message: 'Enter the location name that belongs in the SOW.',
    });
  }
  if (!company.siteAddress.trim()) {
    issues.push({
      id: 'address',
      severity: 'error',
      message: 'Enter the full site address.',
    });
  }
  if (!Number.isInteger(company.startYear) || company.startYear < 1900 || company.startYear > 2200) {
    issues.push({
      id: 'start-year',
      severity: 'error',
      message: 'Contract start year must be a four-digit year.',
    });
  }
  if (!Number.isInteger(company.durationYears) || company.durationYears < 1) {
    issues.push({
      id: 'duration',
      severity: 'error',
      message: 'Contract duration must be at least one year.',
    });
  }
  if (labor.quotedHours === null || labor.quotedHours < 0) {
    issues.push({
      id: 'quoted-hours',
      severity: 'error',
      message: 'Enter the proposed quoted labor hours — they drive the inspector and mileage rules.',
    });
  }

  if (evaluation.billing.unresolved) {
    issues.push({
      id: 'billing-unresolved',
      severity: 'error',
      message:
        pricing.proposedAnnualPrice === null
          ? 'Proposed annual price is blank. Choose the billing treatment before copying.'
          : 'Proposed annual price is exactly $10,000. Choose annual billing or the 40% deposit.',
    });
  } else if (evaluation.billing.contradiction && !sow.billingExceptionAcknowledged) {
    issues.push({
      id: 'billing-contradiction',
      severity: 'error',
      message:
        evaluation.billing.state === 'both'
          ? 'Both annual billing and the 40% deposit are included. Acknowledge this exception before copying.'
          : 'Neither annual billing nor the 40% deposit is included. Acknowledge this exception before copying.',
    });
  }

  if (evaluation.billing.contradiction && sow.billingExceptionAcknowledged) {
    issues.push({
      id: 'billing-exception',
      severity: 'warning',
      message:
        evaluation.billing.state === 'both'
          ? 'Exceptional contract: both billing clauses are included.'
          : 'Exceptional contract: neither billing clause is included.',
    });
  }

  if (evaluation.billing.requiresChoiceAtThreshold && !evaluation.billing.unresolved) {
    issues.push({
      id: 'threshold-review',
      severity: 'warning',
      message: 'Price is exactly $10,000 — the billing language was manually resolved. Confirm with Julie.',
    });
  }

  const history = calculateHistoryStats(labor.history);
  if (history.validYears > 0 && history.validYears < 3) {
    issues.push({
      id: 'few-years',
      severity: 'warning',
      message: `Only ${history.validYears} valid historical year${history.validYears === 1 ? '' : 's'} entered. Three are normally reviewed.`,
    });
  }
  if (history.validYears === 0) {
    issues.push({
      id: 'no-years',
      severity: 'warning',
      message: 'No historical inspection hours entered yet.',
    });
  }

  if (hasLowLaborRate(pricing.laborRatePerHour)) {
    issues.push({
      id: 'low-rate',
      severity: 'warning',
      message: 'Labor rate under $90 — check with Mike before proceeding.',
    });
  }

  const diff = hoursDifference(labor.quotedHours, history.averageHours);
  if (diff !== null && Math.abs(diff) >= 0.01 && !labor.quotedHoursReason.trim()) {
    issues.push({
      id: 'hours-reason',
      severity: 'warning',
      message: 'Quoted hours differ from the historical average. Add a reason for the adjustment.',
    });
  }

  if (
    company.siteCity.trim().toLowerCase() === 'madison' &&
    !evaluation.madisonAuto
  ) {
    issues.push({
      id: 'madison-state',
      severity: 'warning',
      message: 'Site city is Madison but the state is not Wisconsin — the AHJ fee is not auto-included.',
    });
  }

  if (!company.siteCity.trim() || !company.siteState.trim()) {
    issues.push({
      id: 'site-city-state',
      severity: 'warning',
      message: 'Site city or state is blank — Madison AHJ auto-detection cannot run.',
    });
  }

  return issues;
}

export function canCopySow(issues: readonly SowIssue[]): boolean {
  return !issues.some((issue) => issue.severity === 'error');
}

export function isManualDraftOutdated(
  renewal: Renewal,
  generatedText: string,
): boolean {
  return renewal.sowDraft !== null && renewal.sowDraft.sourceGeneratedText !== generatedText;
}

/**
 * A changed generated SOW must be explicitly reviewed before a manual draft can
 * be copied. Reviewing does not alter the manual text.
 */
export function manualDraftNeedsReview(
  renewal: Renewal,
  generatedText: string,
): boolean {
  const draft = renewal.sowDraft;
  if (!draft) return false;
  return (
    draft.sourceGeneratedText !== generatedText &&
    draft.reviewedGeneratedText !== generatedText
  );
}

export function acknowledgeManualDraft(
  renewal: Renewal,
  generatedText: string,
): Renewal {
  if (!renewal.sowDraft) return renewal;
  return {
    ...renewal,
    sowDraft: {
      ...renewal.sowDraft,
      reviewedGeneratedText: generatedText,
    },
  };
}

const UNRESOLVED_PLACEHOLDER =
  /\(\s*INSERT[^)]*\)|\(GENERATED DATE\)|\bINSERT\s+(?:LOCATION|FULL\s+ADDRESS|COMPANY\s+NAME|CLIENT\s+NAME)\b/i;

/**
 * Validates the exact text that will be copied from a manual draft.
 * Generated-input validation does not cover hand-edited text.
 */
export function validateSowText(text: string): SowIssue[] {
  const issues: SowIssue[] = [];
  if (!text.trim()) {
    issues.push({
      id: 'manual-empty',
      severity: 'error',
      message: 'The manual SOW draft is empty. Add text or reset to the generated SOW.',
    });
  }
  if (UNRESOLVED_PLACEHOLDER.test(text)) {
    issues.push({
      id: 'manual-placeholder',
      severity: 'error',
      message:
        'The manual SOW draft still contains an unresolved INSERT placeholder. Replace it with the real detail.',
    });
  }
  return issues;
}

export function resolveSowText(renewal: Renewal, generatedText: string): string {
  return renewal.sowDraft?.text ?? generatedText;
}

export function createManualDraft(text: string, generatedText: string): {
  text: string;
  sourceGeneratedText: string;
  reviewedGeneratedText: string | null;
  editedAt: number;
} {
  return {
    text,
    sourceGeneratedText: generatedText,
    reviewedGeneratedText: null,
    editedAt: Date.now(),
  };
}
