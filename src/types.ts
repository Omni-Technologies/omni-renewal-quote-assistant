/**
 * Domain model for the OMNI Renewal Quote Assistant.
 *
 * Business logic lives in `src/lib` and depends only on these types, never on
 * React. Future D-Tools Excel import support is modelled here (see
 * `ImportedLaborRecord`) so the quote editor does not need to be rewritten.
 */

export const RENEWAL_STATUSES = [
  'Draft',
  'Ready for Julie Review',
  'Changes Requested',
  'Approved',
  'Completed',
] as const;

export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

export const INSPECTION_FREQUENCIES = [
  'Annual',
  'Semi-Annual',
  'Quarterly',
  'Monthly',
] as const;

export type InspectionFrequency = (typeof INSPECTION_FREQUENCIES)[number];

export type InspectorCount = 1 | 2;

export type InspectorOverride = 'one' | 'two' | null;

export type BillingChoice = 'annual' | 'deposit';

export interface CompanyLocation {
  /** Exact company name used in Microsoft Teams. */
  companyName: string;
  /** Client name exactly as listed in D-Tools. */
  clientName: string;
  /** Name used in the SOW and the D-Tools project name. */
  locationName: string;
  /** Street / full site address inserted into the SOW. */
  siteAddress: string;
  siteCity: string;
  siteState: string;
  inspectionFrequency: InspectionFrequency;
  emailSystemType?: 'Fire Alarm' | 'Intrusion' | 'Nurse Call';
  emailGreeting?: 'Good Day' | 'Good morning' | 'Good afternoon';
  startYear: number;
  startYearSource?: 'next-year' | 'manual';
  durationYears: number;
  dtoolsProjectNumber: string;
  companyQuotingNotes: string;
  internalRenewalNotes: string;
}

export interface PricingDetails {
  previousAnnualPrice: number | null;
  proposedAnnualPrice: number | null;
  laborRatePerHour: number | null;
  annualMileageCharge: number | null;
  mileageCostOverride?: number | null;
  pricingChangeNotes: string;
}

export interface HistoricalHoursEntry {
  id: string;
  yearLabel: string;
  /** `null` means blank / not supplied. Blank must never count as zero. */
  hours: number | null;
}

/** Audit trail for hours applied from the D-Tools Historical Hours explorer. */
export interface LaborImportSummary {
  datasetId: string;
  fileName: string;
  importedAt: number;
  clientName: string;
  siteLabel: string;
  frequency: string;
  basis: string;
  projects: Array<{
    projectKey: string;
    projectName: string;
    projectNumber: string;
    year: number;
    hours: number;
    entryCount: number;
    frequency?: 'Annual' | 'Semi-Annual';
    entries?: DtoolsProjectEntry[];
  }>;
}

export interface LaborPlan {
  source: 'manual' | 'imported';
  history: HistoricalHoursEntry[];
  /** Actual hours being quoted. Independent from the historical average. */
  quotedHours: number | null;
  quotedHoursReason: string;
  mileageOverride: number | null;
  inspectorOverride: InspectorOverride;
  /** Present only when history was applied from imported D-Tools timesheets. */
  importSummary?: LaborImportSummary | null;
}

export interface SowRuleSelections {
  isHospital: boolean;
  /** `null` = follow the automatic Madison, WI suggestion. */
  madisonOverride: boolean | null;
  /** `null` = follow the calculated inspector count. */
  singleInspectorOverride: boolean | null;
  /** `null` = automatic (not hospital AND one inspector). */
  facpOverride: boolean | null;
  /** `null` = automatic from the proposed annual price. */
  annualBillingOverride: boolean | null;
  /** `null` = automatic from the proposed annual price. */
  depositOverride: boolean | null;
  /** Required only when the proposed annual price is exactly $10,000. */
  billingChoiceAt10000: BillingChoice | null;
  /** Acknowledges a deliberate both/neither billing combination. */
  billingExceptionAcknowledged: boolean;
}

export interface ManualSowDraft {
  text: string;
  /** Generated SOW at the moment editing began; used to detect staleness. */
  sourceGeneratedText: string;
  /**
   * Generated SOW the user explicitly reviewed against this manual draft.
   * Null until the user acknowledges changed inputs; never overwritten by
   * editing the draft text.
   */
  reviewedGeneratedText: string | null;
  editedAt: number;
}

export interface Renewal {
  id: string;
  schemaVersion: 1;
  status: RenewalStatus;
  company: CompanyLocation;
  pricing: PricingDetails;
  labor: LaborPlan;
  sow: SowRuleSelections;
  sowDraft: ManualSowDraft | null;
  /** Checklist item id -> completed. */
  checklist: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
}

/** Backup envelope written by "Export all". */
export interface BackupFile {
  format: 'omni-renewal-quote-backup';
  version: 2;
  exportedAt: string;
  app: 'OMNI Renewal Quote Assistant';
  renewals: Renewal[];
  dtools: {
    dataset: DtoolsDataset | null;
    rows: DtoolsRow[];
    decisions: DtoolsProjectDecision[];
  };
  /** Absent in backups made before job-cost import existed. */
  jobCost?: {
    dataset: JobCostDataset | null;
    projects: JobCostRecord[];
  };
}

/* ------------------------------------------------------------------------- */
/* D-Tools timesheet history                                                  */
/* ------------------------------------------------------------------------- */

export type DtoolsClassification =
  | 'annual'
  | 'semi-annual'
  | 'excluded'
  | 'review';

export type DtoolsYearSource = 'title' | 'work-dates' | 'manual' | null;

/**
 * One normalized D-Tools timesheet row. Every row keeps its original workbook
 * location so any calculated total can be traced back to D-Tools.
 */
export interface DtoolsRow {
  id: string;
  datasetId: string;
  sourceRow: number;
  approved: boolean;
  entity: string;
  /** ISO date (`YYYY-MM-DD`) of the work. */
  date: string;
  dateMs: number;
  resource: string;
  resourceEmail: string;
  clientName: string;
  projectName: string;
  projectNumber: string;
  projectManager: string;
  taskName: string;
  taskNumber: string;
  /** Decimal hours exactly as exported. Never multiplied or divided. */
  duration: number;
  createdOn: string;
  updatedOn: string;
  updatedBy: string;
  sourceFile: string;
  sourceSheet: string;
  projectKey: string;
  siteKey: string;
  siteLabel: string;
  classification: DtoolsClassification;
  frequency: 'Annual' | 'Semi-Annual' | null;
  serviceYear: number | null;
  yearSource: DtoolsYearSource;
  /** Human-readable explanation of every automatic identification rule. */
  reasons: string[];
  /** Set when this individual row looks like non-inspection work. */
  taskFlag: string | null;
  includedByDefault: boolean;
}

export interface DtoolsDataset {
  id: string;
  fileName: string;
  fileType: 'csv' | 'xlsx';
  sheetName: string;
  fingerprint: string;
  importedAt: number;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  unapprovedRows: number;
  projectCount: number;
  annualCount: number;
  semiAnnualCount: number;
  excludedCount: number;
  reviewCount: number;
}

/** Persisted manual verification for one D-Tools project. */
export interface DtoolsProjectDecision {
  /** Stable project identity (`project number + normalized title`). */
  key: string;
  projectNumber: string;
  projectName: string;
  action: 'auto' | 'include' | 'exclude';
  /** Manual frequency correction. `null` follows the automatic rule. */
  frequency: 'Annual' | 'Semi-Annual' | null;
  /** Manual inspection-year correction. `null` follows the automatic rule. */
  year: number | null;
  note: string;
  /** Manually supplied original quoted hours. Never inferred from actuals. */
  quotedHours: number | null;
  /** Include entries whose task names look unrelated to inspection work. */
  includeFlaggedEntries: boolean;
  averageSelected?: boolean;
  updatedAt: number;
}

export interface DtoolsProjectEntry {
  row: DtoolsRow;
  included: boolean;
  exclusionReason: string | null;
}

export interface DtoolsProject {
  key: string;
  projectNumber: string;
  projectName: string;
  clientName: string;
  siteKey: string;
  siteLabel: string;
  classification: DtoolsClassification;
  frequency: 'Annual' | 'Semi-Annual' | null;
  serviceYear: number | null;
  yearSource: DtoolsYearSource;
  reasons: string[];
  contractPosition: string | null;
  firstDate: string;
  lastDate: string;
  entryCount: number;
  inspectorCount: number;
  totalHours: number;
  approvedHours: number;
  unapprovedHours: number;
  flaggedEntries: number;
  flaggedHours: number;
  needsReview: boolean;
  decision: DtoolsProjectDecision;
  effectiveFrequency: 'Annual' | 'Semi-Annual' | null;
  effectiveYear: number | null;
  included: boolean;
  entries: DtoolsProjectEntry[];
}

export interface DtoolsSiteSummary {
  siteKey: string;
  clientName: string;
  siteLabel: string;
  projectNames?: string[];
  projectCount: number;
  annualCount: number;
  semiAnnualCount: number;
  reviewCount: number;
  excludedCount: number;
  includedCount: number;
  totalHours: number;
  years: number[];
}

/* ------------------------------------------------------------------------- */
/* D-Tools project job cost (budgeted vs actual hours)                        */
/* ------------------------------------------------------------------------- */

export interface JobCostPhase {
  name: string;
  budgetedHours: number;
  actualHours: number;
  budgetedLaborCost: number | null;
  budgetedProductCost: number | null;
}

/** One project row from a "Project Job Cost (By Phase)" export. */
export interface JobCostRecord {
  id: string;
  datasetId: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  clientName: string;
  projectName: string;
  projectNumber: string;
  status: string;
  state: string;
  /** ISO date (`YYYY-MM-DD`) or null when D-Tools has no start date. */
  startDate: string | null;
  budgetedHours: number;
  actualHours: number;
  budgetedLaborCost: number | null;
  actualLaborCost: number | null;
  projectManager: string;
  resources: string;
  /** Empty when the phase block is shared by several projects. */
  phases: JobCostPhase[];
  sharedPhaseBlock: boolean;
}

export interface JobCostDataset {
  id: string;
  importedAt: number;
  projectCount: number;
  files: Array<{
    fileName: string;
    sheetName: string;
    fingerprint: string;
    projectCount: number;
  }>;
}

export type JobCostTimesheetStatus =
  | 'match'
  | 'approved-match'
  | 'mismatch'
  | 'before-timesheet'
  | 'not-in-timesheet';

export interface JobCostProject {
  record: JobCostRecord;
  key: string;
  siteKey: string;
  siteLabel: string;
  classification: DtoolsClassification;
  frequency: 'Annual' | 'Semi-Annual' | null;
  year: number | null;
  yearSource: 'manual' | 'title' | 'timesheet' | 'start-date' | null;
  contractPosition: string | null;
  included: boolean;
  /** Budgeted Travel phase hours; null without a single-project Travel phase. */
  travelBudgetedHours: number | null;
  /** Null when no timesheet history is imported to compare against. */
  timesheet: {
    status: JobCostTimesheetStatus;
    /** Approved plus unapproved timesheet hours for the project number. */
    totalHours: number | null;
    approvedHours: number | null;
    difference: number | null;
  } | null;
}

/**
 * Reserved for the future D-Tools Excel/CSV import module. Not populated by
 * Version 1, but the shape is fixed now so matching and review screens can be
 * added without migrating saved renewals.
 */
export interface ImportedLaborRecord {
  id: string;
  renewalId: string;
  sourceSystem: 'dtools-excel' | 'dtools-csv' | 'manual';
  sourceFile: string;
  sourceRow: number;
  projectId: string;
  projectName: string;
  companyName: string;
  clientName: string;
  locationName: string;
  serviceYear: number | null;
  serviceType: string;
  /** Raw billable / inspection hours from the export. */
  hours: number;
  matchConfidence: number;
  matchReasons: string[];
  reviewStatus: 'suggested' | 'accepted' | 'rejected' | 'needs-review';
  includedInAverage: boolean;
}
