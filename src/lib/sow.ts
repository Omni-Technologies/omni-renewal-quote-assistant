import type { Renewal, SowInspectionScope, SowTemplate } from '../types';
import {
  calculateHistoryStats,
  effectiveInspectorCount,
  hasLowLaborRate,
  hoursDifference,
  isValidPrice,
} from './calculations';
import { parseAddressCity } from './renewalInputs';

export const SOW_TEMPLATE_LABELS: Record<SowTemplate, string> = {
  standard: 'Standard inspection',
  'standard-warranty': 'Standard + Edwards warranty',
  meriter: 'Meriter (inspections + monitoring)',
};

/**
 * The Omni Technologies inspection SOW templates: Standard, Standard with the
 * Edwards extended parts warranty, and Meriter.
 *
 * Wording below must stay byte-for-byte identical to the supplied templates.
 * Bracketed template options are resolved from the renewal, and only the
 * conditionally included bullets are filtered out.
 */
export const CORE_PARAGRAPHS = {
  nfpaReport:
    '•A complete NFPA test report will be provided upon completion. All addressable devices will be bar coded and logged with the Building Reports system.',
  detectorCleaning: '•Detector cleaning will be provided as necessary.',
  ownerNotification:
    '•Owner is responsible for notifying building occupants and arranging monitoring of the fire alarm system during the inspection.',
  normalHours:
    '•Inspections will be performed during normal business hours. Omni Technologies will coordinate scheduling at least two weeks in advance.',
  lift: "•Owner is responsible for providing a lift if required to properly and safely test any devices not easily accessible on a standard 8' A-frame ladder.",
  customerDelay:
    '•If Omni Technologies cannot locate a device or access an area due to customer delay, additional T&M charges may apply.',
  elevator:
    '•Coordination and fees associated with the elevator company (if devices within the shaft require testing) are the responsibility of the owner.',
} as const;

export const CONDITIONAL_CLAUSES = {
  singleInspector: '•Labor is quoted with a single inspector.',
  deposit:
    '•A 40% deposit is required upon acceptance of this proposal to initiate scheduling.',
  madison:
    '•Includes AHJ test report submission fee for uploading test documentation to City of Madison.',
  facp:
    '•Labor is not included for an inspector to actively monitor the fire alarm control panel (FACP) for the duration of the inspection. The FACP functions will be bypassed and offline while the system is being tested, and the owner is responsible for providing the necessary staff to actively monitor the FACP if desired.',
} as const;

export const EDWARDS_WARRANTY =
  'Extended Parts Warranty Included: At no additional cost, eligible Edwards fire alarm components qualify for a manufacturer’s parts warranty of up to seven (7) years from the original materials ship date. Edwards offers this program as an incentive for customers to retain the certified Edwards dealer that installed their system for ongoing annual inspection and testing. To maintain this extended coverage, Customer must have Omni perform the required annual inspections and tests throughout the warranty period. Coverage is subject to Edwards’ approval and warranty terms. Warranty certificate is available upon request.';

export const MERITER_PARAGRAPHS = {
  inspectionHeading: 'Annual & Semi-Annual Inspections Description of Work:',
  inspection:
    '•Provide one annual inspection and test and one semi-annual inspection at each location listed within this proposal in accordance with the state and local codes.',
  nfpaReport:
    '•A complete NFPA test report will be provided upon completion. All devices will be bar coded and logged with the Building Reports system.',
  detectorCleaning: '•Detector cleaning will be provided as necessary.',
  normalHours:
    '•Work shall be performed during normal business hours. Omni Technologies will schedule the dates of the inspection at least two weeks prior to the inspection.',
  elevator:
    '•Coordination and fees associated with the elevator company, if there are devices in the shaft to be tested, are the responsibility of the owner.',
  monitoringHeading: 'Monitoring Description of Work:',
  chart: '*INSERT CHART - SEE PREVIOUS MERITER PROPOSALS]*',
} as const;

const EACH_YEAR = ' each year for the duration of this contract';

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
];

export type ConditionalClauseId = keyof typeof CONDITIONAL_CLAUSES;

export interface ClauseDecision {
  auto: boolean;
  effective: boolean;
  overridden: boolean;
}

export interface SowLocation {
  locationName: string;
  siteAddress: string;
}

export interface SowEvaluation {
  template: SowTemplate;
  inspectionScope: SowInspectionScope;
  durationYears: number;
  startYear: number;
  endYear: number;
  contractEndDate: string;
  /** Meriter contract period: July 1 of the start year to June 30 after the final year. */
  meriterContractDates: string;
  /** Primary location first, then any additional locations, trimmed. */
  locations: SowLocation[];
  inspectorCount: 1 | 2;
  autoInspectorCount: 1 | 2;
  singleInspector: ClauseDecision;
  facp: ClauseDecision;
  madison: ClauseDecision;
  annualBilling: ClauseDecision;
  deposit: ClauseDecision;
  /** True when a blank price leaves the 40% deposit undecided. */
  depositUnresolved: boolean;
  /** True when any listed location's city/state automatically qualifies for the Madison fee. */
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

/** Meriter contracts run July 1 – June 30, so a 3-year 2027 start ends June 30, 2030. */
export function meriterContractDates(startYear: number, durationYears: number): string {
  const start = safeYear(startYear);
  return `July 1, ${start} – June 30, ${start + safeDuration(durationYears)}`;
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

function sowLocation(locationName: string, siteAddress: string): SowLocation {
  return {
    locationName: locationName.trim(),
    siteAddress: siteAddress.trim().replace(/\.+$/, ''),
  };
}

export function evaluateSow(renewal: Renewal): SowEvaluation {
  const { company, labor, sow } = renewal;
  const autoCount = labor.quotedHours !== null && labor.quotedHours > 8 ? 2 : 1;
  const inspectorCount = effectiveInspectorCount(
    labor.quotedHours,
    labor.inspectorOverride,
  );
  const madisonAuto =
    isMadisonSite(company.siteCity, company.siteState) ||
    company.additionalLocations.some((location) => {
      const parsed = parseAddressCity(location.siteAddress);
      return parsed !== null && isMadisonSite(parsed.siteCity, parsed.siteState);
    });
  const isMadison = sow.madisonOverride ?? madisonAuto;
  const price = renewal.pricing.proposedAnnualPrice;
  const priceKnown = isValidPrice(price);

  return {
    template: sow.template,
    inspectionScope: sow.inspectionScope,
    durationYears: safeDuration(company.durationYears),
    startYear: safeYear(company.startYear),
    endYear: calculateEndYear(company.startYear, company.durationYears),
    contractEndDate: contractEndDate(company.startYear, company.durationYears),
    meriterContractDates: meriterContractDates(company.startYear, company.durationYears),
    locations: [
      sowLocation(company.locationName, company.siteAddress),
      ...company.additionalLocations.map((location) =>
        sowLocation(location.locationName, location.siteAddress),
      ),
    ],
    inspectorCount,
    autoInspectorCount: autoCount,
    singleInspector: clause(inspectorCount === 1, sow.singleInspectorOverride),
    // FACP is included only when NOT healthcare AND one inspector.
    facp: clause(!sow.isHospital && inspectorCount === 1, sow.facpOverride),
    madison: clause(madisonAuto, sow.madisonOverride),
    // The template keeps the billing line in every SOW; only an override removes it.
    annualBilling: clause(true, sow.annualBillingOverride),
    // Removed only when the annual contract value is under $10,000.
    deposit: clause(priceKnown && price >= 10000, sow.depositOverride),
    depositUnresolved: !priceKnown && sow.depositOverride === null,
    madisonAuto,
    isMadison,
    isHospital: sow.isHospital,
  };
}

function noteLines(evaluation: SowEvaluation): string[] {
  const lines: string[] = [];
  const eachYear = evaluation.durationYears > 1 ? EACH_YEAR : '';

  if (evaluation.singleInspector.effective) {
    lines.push(CONDITIONAL_CLAUSES.singleInspector);
  }
  lines.push(CORE_PARAGRAPHS.ownerNotification);
  lines.push(CORE_PARAGRAPHS.normalHours);
  lines.push(CORE_PARAGRAPHS.lift);
  lines.push(CORE_PARAGRAPHS.customerDelay);
  lines.push(CORE_PARAGRAPHS.elevator);
  if (evaluation.annualBilling.effective) {
    lines.push(`•The amount listed will be billed after completion of the inspection(s)${eachYear}.`);
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

function standardSow(renewal: Renewal, evaluation: SowEvaluation): string[] {
  const company = renewal.company.companyName.trim() || '(INSERT COMPANY NAME)';
  const semiAnnual =
    evaluation.inspectionScope === 'Annual and Semi-Annual' ? ' and one semi-annual inspection' : '';
  const eachYear = evaluation.durationYears > 1 ? EACH_YEAR : '';

  return [
    `Omni Technologies is pleased to present the following ${evaluation.durationYears}-Year proposal for ${evaluation.inspectionScope} Fire Alarm System Inspections and Testing for ${company}.`,
    '',
    ...(evaluation.template === 'standard-warranty' ? [EDWARDS_WARRANTY, ''] : []),
    'Location(s) Included:',
    ...evaluation.locations.map(
      (location) =>
        `•${location.locationName || '(INSERT LOCATION NAME)'} – located at ${location.siteAddress || '(INSERT FULL ADDRESS)'}.`,
    ),
    '',
    'Description of Work:',
    `•Provide one annual inspection${semiAnnual} in accordance with applicable state and local codes${eachYear}.`,
    CORE_PARAGRAPHS.nfpaReport,
    CORE_PARAGRAPHS.detectorCleaning,
    '',
    'Notes:',
    ...noteLines(evaluation),
    '',
    `Contract End Date: ${evaluation.contractEndDate}`,
  ];
}

/** "Meriter" is added in front of the location name unless the name already contains it. */
export function meriterLocationName(locationName: string): string {
  const name = locationName.trim() || '(INSERT LOCATION NAME)';
  return /\bmeriter\b/i.test(name) ? name : `Meriter ${name}`;
}

function meriterSow(evaluation: SowEvaluation): string[] {
  const [location] = evaluation.locations;
  const name = meriterLocationName(location.locationName);
  const years = evaluation.durationYears;

  return [
    `Omni Technologies is pleased to present the following ${NUMBER_WORDS[years] ?? years}-year proposal for the Annual & Semi-Annual Fire Alarm System Inspection and Tests, and Monitoring for the ${name} located at ${location.siteAddress || '(INSERT FULL ADDRESS)'}.`,
    '',
    MERITER_PARAGRAPHS.inspectionHeading,
    '',
    MERITER_PARAGRAPHS.inspection,
    MERITER_PARAGRAPHS.nfpaReport,
    MERITER_PARAGRAPHS.detectorCleaning,
    '',
    'Notes:',
    MERITER_PARAGRAPHS.normalHours,
    MERITER_PARAGRAPHS.elevator,
    '',
    MERITER_PARAGRAPHS.monitoringHeading,
    '',
    `•Provide ${years} year${years === 1 ? '' : 's'} of 24/7/365 off-site monitoring for the fire alarm system at the ${name}, as listed within the proposal.`,
    '',
    `Contract Dates: ${evaluation.meriterContractDates}`,
    '',
    MERITER_PARAGRAPHS.chart,
  ];
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
  return (
    evaluation.template === 'meriter'
      ? meriterSow(evaluation)
      : standardSow(renewal, evaluation)
  ).join('\n');
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
export function validateSow(renewal: Renewal, evaluation: SowEvaluation): SowIssue[] {
  const issues: SowIssue[] = [];
  const { company, labor, pricing } = renewal;
  const meriter = evaluation.template === 'meriter';

  if (!meriter && !company.companyName.trim()) {
    issues.push({
      id: 'company-name',
      severity: 'error',
      message: 'Enter the company name — the SOW opening names the company.',
    });
  }
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
  if (!meriter) {
    company.additionalLocations.forEach((location, index) => {
      if (!location.locationName.trim() || !location.siteAddress.trim()) {
        issues.push({
          id: `additional-location-${location.id}`,
          severity: 'error',
          message: `Additional location ${index + 2} needs both a location name and a full address, or remove it.`,
        });
      }
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

  if (!meriter && evaluation.depositUnresolved) {
    issues.push({
      id: 'deposit-unresolved',
      severity: 'error',
      message:
        'Proposed annual price is blank — the 40% deposit depends on it. Enter the price or set the deposit clause manually.',
    });
  }

  if (meriter && company.additionalLocations.length > 0) {
    issues.push({
      id: 'meriter-locations',
      severity: 'warning',
      message: 'The Meriter template covers one location — additional locations are not included in this SOW.',
    });
  }
  if (meriter) {
    issues.push({
      id: 'meriter-chart',
      severity: 'warning',
      message: 'The Meriter SOW ends with the INSERT CHART placeholder — add the chart from a previous Meriter proposal in D-Tools.',
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
    !meriter &&
    company.siteCity.trim().toLowerCase() === 'madison' &&
    !isMadisonSite(company.siteCity, company.siteState)
  ) {
    issues.push({
      id: 'madison-state',
      severity: 'warning',
      message: 'Site city is Madison but the state is not Wisconsin — the AHJ fee is not auto-included.',
    });
  }

  if (!meriter && (!company.siteCity.trim() || !company.siteState.trim())) {
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
