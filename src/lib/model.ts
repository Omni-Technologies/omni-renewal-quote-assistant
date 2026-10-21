import type {
  BillingChoice,
  CompanyLocation,
  DtoolsProjectEntry,
  HistoricalHoursEntry,
  InspectorOverride,
  LaborImportSummary,
  LaborPlan,
  PricingDetails,
  Renewal,
  RenewalStatus,
  SowRuleSelections,
} from '../types';
import { INSPECTION_FREQUENCIES, RENEWAL_STATUSES } from '../types';
import { resetChecklist } from './workflow';
import { normalizeText, parseDurationHours, parseWorkDate } from './dtools';
import { updateRenewalLabor } from './renewalInputs';

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultHistory(startYear: number): HistoricalHoursEntry[] {
  return [startYear - 3, startYear - 2, startYear - 1].map((year) => ({
    id: createId(),
    yearLabel: String(year),
    hours: null,
  }));
}

/** Brand-new, entirely empty renewal. Never inherits from another record. */
export function createRenewal(now = Date.now()): Renewal {
  const startYear = new Date(now).getFullYear() + 1;
  return {
    id: createId(),
    schemaVersion: 1,
    status: 'Draft',
    company: {
      companyName: '',
      clientName: '',
      locationName: '',
      siteAddress: '',
      siteCity: '',
      siteState: 'WI',
      inspectionFrequency: 'Annual',
      emailSystemType: 'Fire Alarm',
      emailGreeting: 'Good Day',
      startYear,
      startYearSource: 'next-year',
      durationYears: 3,
      dtoolsProjectNumber: '',
      companyQuotingNotes: '',
      internalRenewalNotes: '',
    },
    pricing: {
      previousAnnualPrice: null,
      proposedAnnualPrice: null,
      laborRatePerHour: 90,
      annualMileageCharge: 60,
      mileageCostOverride: null,
      pricingChangeNotes: '',
    },
    labor: {
      source: 'manual',
      history: defaultHistory(startYear),
      quotedHours: null,
      quotedHoursReason: '',
      mileageOverride: null,
      inspectorOverride: null,
      importSummary: null,
    },
    sow: {
      isHospital: false,
      madisonOverride: null,
      singleInspectorOverride: null,
      facpOverride: null,
      annualBillingOverride: null,
      depositOverride: null,
      billingChoiceAt10000: null,
      billingExceptionAcknowledged: false,
    },
    sowDraft: null,
    checklist: resetChecklist(),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Duplicate for the next contract period. Company/location data and notes are
 * retained; prices, hours, approvals, checklist progress, SOW overrides, and
 * manual drafts are intentionally reset so nothing is inherited accidentally.
 */
export function cloneForNextContract(source: Renewal, now = Date.now()): Renewal {
  const next = createRenewal(now);
  const nextStartYear = source.company.startYear + source.company.durationYears;

  return {
    ...next,
    company: {
      ...source.company,
      startYear: nextStartYear,
      startYearSource: 'manual',
    },
    pricing: {
      previousAnnualPrice: source.pricing.proposedAnnualPrice,
      proposedAnnualPrice: null,
      laborRatePerHour: source.pricing.laborRatePerHour ?? 90,
      annualMileageCharge: source.pricing.annualMileageCharge,
      mileageCostOverride: source.pricing.mileageCostOverride,
      pricingChangeNotes: '',
    },
    labor: {
      source: 'manual',
      history: [nextStartYear - 3, nextStartYear - 2, nextStartYear - 1].map(
        (year) => ({ id: createId(), yearLabel: String(year), hours: null }),
      ),
      quotedHours: null,
      quotedHoursReason: '',
      mileageOverride: null,
      inspectorOverride: null,
      importSummary: null,
    },
    sow: {
      isHospital: source.sow.isHospital,
      madisonOverride: null,
      singleInspectorOverride: null,
      facpOverride: null,
      annualBillingOverride: null,
      depositOverride: null,
      billingChoiceAt10000: null,
      billingExceptionAcknowledged: false,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Runtime normalization — used for backup restore and schema migrations.     */
/* ------------------------------------------------------------------------- */

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asFiniteNumberOr(value: unknown, fallback: number): number {
  const parsed = asNumber(value);
  return parsed === null ? fallback : parsed;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStatus(value: unknown): RenewalStatus {
  return RENEWAL_STATUSES.includes(value as RenewalStatus)
    ? (value as RenewalStatus)
    : 'Draft';
}

function asFrequency(value: unknown): CompanyLocation['inspectionFrequency'] {
  return INSPECTION_FREQUENCIES.includes(
    value as CompanyLocation['inspectionFrequency'],
  )
    ? (value as CompanyLocation['inspectionFrequency'])
    : 'Annual';
}

function normalizeCompany(raw: unknown): CompanyLocation {
  const value = isRecord(raw) ? raw : {};
  return {
    companyName: asString(value.companyName),
    clientName: asString(value.clientName),
    locationName: asString(value.locationName),
    siteAddress: asString(value.siteAddress),
    siteCity: asString(value.siteCity),
    siteState: asString(value.siteState, 'WI'),
    inspectionFrequency: asFrequency(value.inspectionFrequency),
    emailSystemType: value.emailSystemType === 'Intrusion' || value.emailSystemType === 'Nurse Call' ? value.emailSystemType : 'Fire Alarm',
    emailGreeting: value.emailGreeting === 'Good morning' || value.emailGreeting === 'Good afternoon' ? value.emailGreeting : 'Good Day',
    startYear: Math.trunc(
      asFiniteNumberOr(value.startYear, new Date().getFullYear() + 1),
    ),
    startYearSource: value.startYearSource === 'next-year' ? 'next-year' : 'manual',
    durationYears: Math.trunc(asFiniteNumberOr(value.durationYears, 3)),
    dtoolsProjectNumber: asString(value.dtoolsProjectNumber),
    companyQuotingNotes: asString(value.companyQuotingNotes),
    internalRenewalNotes: asString(value.internalRenewalNotes),
  };
}

function normalizePricing(raw: unknown): PricingDetails {
  const value = isRecord(raw) ? raw : {};
  return {
    previousAnnualPrice: asNumber(value.previousAnnualPrice),
    proposedAnnualPrice: asNumber(value.proposedAnnualPrice),
    laborRatePerHour: asNumber(value.laborRatePerHour) ?? 90,
    annualMileageCharge: value.annualMileageCharge === undefined ? 60 : asNumber(value.annualMileageCharge),
    mileageCostOverride: value.mileageCostOverride === undefined
      ? (value.annualMileageCharge === undefined || asNumber(value.annualMileageCharge) === 60
        ? null
        : value.annualMileageCharge === null ? null : (asNumber(value.annualMileageCharge) ?? 0) / 1.2)
      : asNumber(value.mileageCostOverride),
    pricingChangeNotes: asString(value.pricingChangeNotes),
  };
}

function normalizeHistory(raw: unknown): HistoricalHoursEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((entry) => ({
      id: asString(entry.id) || createId(),
      yearLabel: asString(entry.yearLabel),
      hours: asNumber(entry.hours),
    }));
}

function normalizeInspectorOverride(value: unknown): InspectorOverride {
  return value === 'one' || value === 'two' ? value : null;
}

function normalizeImportSummary(raw: unknown): LaborImportSummary | null {
  if (!isRecord(raw)) return null;
  const projects = Array.isArray(raw.projects)
    ? raw.projects.filter(isRecord).map((project) => ({
        projectKey: asString(project.projectKey),
        projectName: asString(project.projectName),
        projectNumber: asString(project.projectNumber),
        year: Math.trunc(asFiniteNumberOr(project.year, 0)),
        hours: asFiniteNumberOr(project.hours, 0),
        entryCount: Math.trunc(asFiniteNumberOr(project.entryCount, 0)),
        ...(project.frequency === 'Annual' || project.frequency === 'Semi-Annual'
          ? { frequency: project.frequency as 'Annual' | 'Semi-Annual' }
          : {}),
        ...(project.hoursSource === 'job-cost' ? { hoursSource: 'job-cost' as const } : {}),
        ...(asNumber(project.timesheetHours) !== null ? { timesheetHours: asNumber(project.timesheetHours) as number } : {}),
        ...(Array.isArray(project.entries)
          ? { entries: project.entries.filter(isValidSnapshotEntry) as DtoolsProjectEntry[] }
          : {}),
      }))
    : [];
  return {
    datasetId: asString(raw.datasetId),
    fileName: asString(raw.fileName),
    importedAt: asFiniteNumberOr(raw.importedAt, 0),
    clientName: asString(raw.clientName),
    siteLabel: asString(raw.siteLabel),
    frequency: asString(raw.frequency),
    basis: asString(raw.basis),
    projects,
  };
}

function isValidSnapshotEntry(value: unknown): value is DtoolsProjectEntry {
  if (!isRecord(value) || !isRecord(value.row)) return false;
  const row = value.row;
  const stringFields = [
    'id', 'datasetId', 'entity', 'date', 'resource', 'resourceEmail', 'clientName',
    'projectName', 'projectNumber', 'projectManager', 'taskName', 'taskNumber',
    'createdOn', 'updatedOn', 'updatedBy', 'sourceFile', 'sourceSheet',
    'projectKey', 'siteKey', 'siteLabel',
  ];
  return typeof value.included === 'boolean' &&
    (value.exclusionReason === null || typeof value.exclusionReason === 'string') &&
    stringFields.every((field) => typeof row[field] === 'string') &&
    typeof row.sourceRow === 'number' && Number.isInteger(row.sourceRow) && row.sourceRow >= 2 &&
    typeof row.dateMs === 'number' && Number.isFinite(row.dateMs) &&
    typeof row.duration === 'number' && parseDurationHours(row.duration) !== null &&
    parseWorkDate(row.date)?.iso === row.date &&
    (row.clientName as string).trim() !== '' && (row.projectName as string).trim() !== '' &&
    row.id === `${row.datasetId}:${row.sourceRow}` &&
    typeof row.approved === 'boolean' && typeof row.includedByDefault === 'boolean' &&
    (!value.included || row.approved === true) &&
    ['annual', 'semi-annual', 'excluded', 'review'].includes(row.classification as string) &&
    ['Annual', 'Semi-Annual', null].includes(row.frequency as string | null) &&
    ['title', 'work-dates', 'manual', null].includes(row.yearSource as string | null) &&
    (row.serviceYear === null || (typeof row.serviceYear === 'number' && Number.isFinite(row.serviceYear))) &&
    (row.taskFlag === null || typeof row.taskFlag === 'string') &&
    Array.isArray(row.reasons) && row.reasons.every((reason) => typeof reason === 'string');
}

function normalizeLabor(raw: unknown): LaborPlan {
  const value = isRecord(raw) ? raw : {};
  return {
    source: value.source === 'imported' ? 'imported' : 'manual',
    history: normalizeHistory(value.history),
    quotedHours: asNumber(value.quotedHours),
    quotedHoursReason: asString(value.quotedHoursReason),
    mileageOverride: asNumber(value.mileageOverride),
    inspectorOverride: normalizeInspectorOverride(value.inspectorOverride),
    importSummary: normalizeImportSummary(value.importSummary),
  };
}

function normalizeSow(raw: unknown): SowRuleSelections {
  const value = isRecord(raw) ? raw : {};
  const choice = value.billingChoiceAt10000;
  return {
    isHospital: asBoolean(value.isHospital),
    madisonOverride: asBooleanOrNull(value.madisonOverride),
    singleInspectorOverride: asBooleanOrNull(value.singleInspectorOverride),
    facpOverride: asBooleanOrNull(value.facpOverride),
    annualBillingOverride: asBooleanOrNull(value.annualBillingOverride),
    depositOverride: asBooleanOrNull(value.depositOverride),
    billingChoiceAt10000:
      choice === 'annual' || choice === 'deposit'
        ? (choice as BillingChoice)
        : null,
    billingExceptionAcknowledged: asBoolean(
      value.billingExceptionAcknowledged,
    ),
  };
}

function normalizeChecklist(raw: unknown): Record<string, boolean> {
  const checklist = resetChecklist();
  if (!isRecord(raw)) return checklist;
  for (const key of Object.keys(checklist)) {
    checklist[key] = asBoolean(raw[key]);
  }
  return checklist;
}

/**
 * Coerce a persisted or imported object into a complete Renewal.
 * Returns null only when the record is not usable at all (no id).
 */
export function normalizeRenewal(raw: unknown): Renewal | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) return null;

  const createdAt = asFiniteNumberOr(raw.createdAt, Date.now());
  const draftRaw = isRecord(raw.sowDraft) ? raw.sowDraft : null;
  const draftText = draftRaw ? asString(draftRaw.text) : '';

  const normalized: Renewal = {
    id: raw.id,
    schemaVersion: 1,
    status: asStatus(raw.status),
    company: normalizeCompany(raw.company),
    pricing: normalizePricing(raw.pricing),
    labor: normalizeLabor(raw.labor),
    sow: normalizeSow(raw.sow),
    sowDraft:
      draftRaw && typeof draftRaw.text === 'string'
        ? {
            text: draftText,
            sourceGeneratedText: asString(draftRaw.sourceGeneratedText),
            reviewedGeneratedText:
              asString(draftRaw.reviewedGeneratedText) || null,
            editedAt: asFiniteNumberOr(draftRaw.editedAt, createdAt),
          }
        : null,
    checklist: normalizeChecklist(raw.checklist),
    createdAt,
    updatedAt: asFiniteNumberOr(raw.updatedAt, createdAt),
  };
  if (isRecord(raw.company) && raw.company.startYearSource === undefined &&
    normalized.status === 'Draft' && normalized.company.startYear === new Date().getFullYear() &&
    normalized.company.startYear === new Date(createdAt).getFullYear()) {
    if (normalized.labor.source === 'manual' && normalized.labor.importSummary === null &&
      normalized.labor.history.length === 3 && normalized.labor.history.every((entry, index) =>
        entry.hours === null && entry.yearLabel === String(normalized.company.startYear - 3 + index))) {
      normalized.labor.history = normalized.labor.history.map((entry) => ({ ...entry, yearLabel: String(Number(entry.yearLabel) + 1) }));
    }
    normalized.company.startYear += 1;
    normalized.company.startYearSource = 'next-year';
  }
  if (isRecord(raw.pricing) && raw.pricing.mileageCostOverride === undefined &&
    normalized.pricing.mileageCostOverride === null && normalized.labor.quotedHours !== null &&
    normalized.labor.quotedHours > 8 && normalized.pricing.proposedAnnualPrice !== null &&
    normalized.pricing.laborRatePerHour !== null &&
    Math.abs(normalized.pricing.proposedAnnualPrice -
      (normalized.labor.quotedHours * normalized.pricing.laborRatePerHour + 60)) < 0.011) {
    return updateRenewalLabor(normalized, { quotedHours: normalized.labor.quotedHours });
  }
  return normalized;
}

export type BackupRenewalValidation =
  | { ok: true; renewal: Renewal }
  | { ok: false; reason: string };

function backupFailure(reason: string): BackupRenewalValidation {
  return { ok: false, reason };
}

function isBackupNumber(value: unknown): boolean {
  return value === null || asNumber(value) !== null;
}

/**
 * Strict validation for records read from a backup file.
 *
 * Unlike `normalizeRenewal` (which keeps old saved rows readable), this rejects
 * structurally incomplete objects before anything reaches IndexedDB. In
 * particular `{ id: <existing id> }` must never be normalized into a blank
 * renewal and upserted over real customer data.
 */
export function validateBackupRenewal(raw: unknown): BackupRenewalValidation {
  if (!isRecord(raw)) return backupFailure('record is not an object');
  if (typeof raw.id !== 'string' || raw.id.trim() === '') {
    return backupFailure('record is missing an id');
  }
  if (raw.schemaVersion !== 1 || !RENEWAL_STATUSES.includes(raw.status as RenewalStatus)) {
    return backupFailure('record has an invalid schema version or status');
  }
  if (!isRecord(raw.checklist) || Object.keys(resetChecklist()).some(
    (field) => typeof (raw.checklist as UnknownRecord)[field] !== 'boolean',
  )) {
    return backupFailure('record has an invalid checklist');
  }
  if (raw.sowDraft !== null) {
    const draft = raw.sowDraft;
    if (
      !isRecord(draft) || typeof draft.text !== 'string' ||
      typeof draft.sourceGeneratedText !== 'string' || asNumber(draft.editedAt) === null ||
      (draft.reviewedGeneratedText !== undefined && draft.reviewedGeneratedText !== null &&
        typeof draft.reviewedGeneratedText !== 'string')
    ) {
      return backupFailure('record has an invalid manual SOW draft');
    }
  }

  for (const field of ['company', 'pricing', 'labor', 'sow'] as const) {
    if (!isRecord(raw[field])) {
      return backupFailure(`record is missing the ${field} object`);
    }
  }

  const company = raw.company as UnknownRecord;
  if (company.emailSystemType !== undefined && !['Fire Alarm', 'Intrusion', 'Nurse Call'].includes(company.emailSystemType as string)) {
    return backupFailure('record has an invalid email system type');
  }
  if (company.emailGreeting !== undefined && !['Good Day', 'Good morning', 'Good afternoon'].includes(company.emailGreeting as string)) {
    return backupFailure('record has an invalid email greeting');
  }
  if (company.startYearSource !== undefined && company.startYearSource !== 'next-year' && company.startYearSource !== 'manual') {
    return backupFailure('record has an invalid contract start year source');
  }
  for (const field of [
    'companyName', 'clientName', 'locationName', 'siteAddress', 'siteCity',
    'siteState', 'dtoolsProjectNumber', 'companyQuotingNotes', 'internalRenewalNotes',
  ]) {
    if (typeof company[field] !== 'string') {
      return backupFailure(`record has an invalid company.${field}`);
    }
  }
  if (
    !INSPECTION_FREQUENCIES.includes(company.inspectionFrequency as CompanyLocation['inspectionFrequency']) ||
    asNumber(company.startYear) === null || asNumber(company.durationYears) === null
  ) {
    return backupFailure('record has invalid contract details');
  }

  const pricing = raw.pricing as UnknownRecord;
  for (const field of ['previousAnnualPrice', 'proposedAnnualPrice', 'laborRatePerHour']) {
    if (!isBackupNumber(pricing[field])) {
      return backupFailure(`record has an invalid pricing.${field}`);
    }
  }
  if (typeof pricing.pricingChangeNotes !== 'string') {
    return backupFailure('record has invalid pricing notes');
  }
  if (pricing.annualMileageCharge !== undefined && (
    !isBackupNumber(pricing.annualMileageCharge) ||
    (asNumber(pricing.annualMileageCharge) ?? 0) < 0
  )) {
    return backupFailure('record has an invalid pricing.annualMileageCharge');
  }
  if (pricing.mileageCostOverride !== undefined && (
    !isBackupNumber(pricing.mileageCostOverride) || (asNumber(pricing.mileageCostOverride) ?? 0) < 0
  )) return backupFailure('record has an invalid mileage cost override');

  const labor = raw.labor as UnknownRecord;
  if (!Array.isArray(labor.history)) {
    return backupFailure('record is missing its labor history list');
  }
  if (labor.history.some((entry) =>
    !isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim() ||
    typeof entry.yearLabel !== 'string' || !isBackupNumber(entry.hours)
  )) {
    return backupFailure('record has an invalid labor history entry');
  }
  if (
    (labor.source !== 'manual' && labor.source !== 'imported') ||
    !isBackupNumber(labor.quotedHours) || !isBackupNumber(labor.mileageOverride) ||
    typeof labor.quotedHoursReason !== 'string' ||
    (labor.inspectorOverride !== null && labor.inspectorOverride !== 'one' && labor.inspectorOverride !== 'two')
  ) {
    return backupFailure('record has invalid labor details');
  }
  if (labor.importSummary !== undefined && labor.importSummary !== null) {
    const summary = labor.importSummary;
    if (
      !isRecord(summary) ||
      typeof summary.datasetId !== 'string' ||
      typeof summary.fileName !== 'string' ||
      typeof summary.clientName !== 'string' ||
      typeof summary.siteLabel !== 'string' ||
      typeof summary.frequency !== 'string' ||
      typeof summary.basis !== 'string' ||
      asNumber(summary.importedAt) === null ||
      !Array.isArray(summary.projects) ||
      summary.projects.some(
        (project) =>
          !isRecord(project) ||
          typeof project.projectKey !== 'string' ||
          typeof project.projectName !== 'string' ||
          typeof project.projectNumber !== 'string' ||
          asNumber(project.year) === null ||
          asNumber(project.hours) === null ||
          asNumber(project.entryCount) === null ||
          (project.frequency !== undefined && project.frequency !== 'Annual' && project.frequency !== 'Semi-Annual') ||
          (project.hoursSource !== undefined && project.hoursSource !== 'job-cost') ||
          (project.timesheetHours !== undefined && asNumber(project.timesheetHours) === null) ||
          (project.hoursSource === 'job-cost' && project.entries !== undefined) ||
          (project.entries !== undefined && (!Array.isArray(project.entries) ||
            project.entries.some((entry) => !isValidSnapshotEntry(entry) ||
              entry.row.projectKey !== project.projectKey || normalizeText(entry.row.projectNumber) !== normalizeText(project.projectNumber as string) ||
              normalizeText(entry.row.projectName) !== normalizeText(project.projectName as string) || entry.row.datasetId !== summary.datasetId) ||
            new Set(project.entries.map((entry) => entry.row.id)).size !== project.entries.length ||
            project.entries.filter((entry) => entry.included).length !== project.entryCount ||
            Math.abs(project.entries.reduce((hours, entry) => hours + (entry.included ? entry.row.duration : 0), 0) - (project.hours as number)) > 1e-8)),
      )
    ) {
      return backupFailure('record has an invalid imported labor summary');
    }
  }

  const sow = raw.sow as UnknownRecord;
  for (const field of ['isHospital', 'billingExceptionAcknowledged']) {
    if (typeof sow[field] !== 'boolean') {
      return backupFailure(`record has an invalid sow.${field}`);
    }
  }
  for (const field of [
    'madisonOverride', 'singleInspectorOverride', 'facpOverride',
    'annualBillingOverride', 'depositOverride',
  ]) {
    if (sow[field] !== null && typeof sow[field] !== 'boolean') {
      return backupFailure(`record has an invalid sow.${field}`);
    }
  }
  if (
    sow.billingChoiceAt10000 !== null &&
    sow.billingChoiceAt10000 !== 'annual' && sow.billingChoiceAt10000 !== 'deposit'
  ) {
    return backupFailure('record has an invalid billing choice');
  }

  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (typeof raw[field] !== 'number' || !Number.isFinite(raw[field])) {
      return backupFailure(`record has an invalid ${field} timestamp`);
    }
  }

  const normalized = normalizeRenewal(raw);
  if (!normalized) return backupFailure('record could not be normalized');

  return { ok: true, renewal: normalized };
}

