import type {
  DtoolsClassification,
  DtoolsDataset,
  DtoolsProject,
  DtoolsProjectDecision,
  DtoolsProjectEntry,
  DtoolsRow,
  DtoolsSiteSummary,
  DtoolsYearSource,
  HistoricalHoursEntry,
  LaborImportSummary,
  Renewal,
} from '../types';

/* ------------------------------------------------------------------------- */
/* Text normalization                                                        */
/* ------------------------------------------------------------------------- */

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function projectKeyFor(projectNumber: string, projectName: string): string {
  const number = normalizeText(projectNumber) || 'no-number';
  return `${number}::${normalizeText(projectName)}`;
}

export function deriveSiteLabel(projectName: string): string {
  let label = collapseSpaces(projectName);
  const prefixes = [
    /^(?:WAR\s+)?SVC\s*[-–—]\s*/i,
    /^FA\s*[-–—]\s*I\s*&\s*T\s*[-–—]?\s*/i,
    /^NC\s*[-–—]\s*I\s*&\s*T\s*[-–—]?\s*/i,
    /^I\s*&\s*T\s*[-–—/]?\s*/i,
    /^I\s+AND\s+T\s*[-–—/]?\s*/i,
    /^FA\s+[-–—]?\s*/i,
    /^NC\s+[-–—]?\s*/i,
    /^INT\s*[-–—]\s*/i,
    /^SEC\s*[-–—]\s*/i,
  ];
  for (let guard = 0; guard < 4; guard += 1) {
    const before = label;
    for (const prefix of prefixes) label = label.replace(prefix, '');
    if (label === before) break;
  }
  const suffixes = [
    /\bsemi[\s-]*(?:annual|anual|annal|annul|annaul|annuall)\b/gi,
    /\b(?:annual|anual|annal|annul|annaul|annuall)\b/gi,
    /\bfire\s+alarm\s+inspections?\b/gi,
    /\bfire\s+alarm\b/gi,
    /\bfire\s+inspections?\b/gi,
    /\bfa\s+inspections?\b/gi,
    /\binspections?\b/gi,
    /\b\d+\s*of\s*\d+\b/gi,
    /\b\d+\s*(?:yr|year|years)\b/gi,
    /\+\s*extended\s+warranty\b/gi,
    /\b(?:19|20)\d{2}\b(?=[\s/|,;:()-]*$)/g,
  ];
  for (const suffix of suffixes) label = label.replace(suffix, ' ');
  label = collapseSpaces(
    label
      .replace(/[\s\-–—/|,;:]+$/g, '')
      .replace(/^[\s\-–—/|,;:]+/g, '')
      .replace(/\s+[-–—]\s+$/g, ''),
  );
  return label || collapseSpaces(projectName);
}

export function siteKeyFor(clientName: string, projectName: string): string {
  const client = normalizeText(clientName).replace(/\buwcu\b/g, 'uw credit union');
  const expandedSite = normalizeText(deriveSiteLabel(projectName))
    .replace(/\buwcu\b/g, 'uw credit union')
    .replace(/\bhs\b/g, 'high school');
  if (
    ['penske auto', 'pag madison t1 dba east madison toyota'].includes(client) &&
    ['east madison toyota', 'east madison toyota penske auto'].includes(expandedSite)
  ) {
    return 'pag madison t1 dba east madison toyota::east madison toyota';
  }
  const site = expandedSite.startsWith('uw credit union ')
    ? expandedSite.replace(/ branch$/, '')
    : expandedSite;
  const siteName = /^(?:wisconsin department of natural resources(?: dnr)?|wisconsin dnr)$/.test(site)
    ? 'wisconsin dnr'
    : site;
  // Titles sometimes repeat client words ("ProHealth Care - Hartland Clinic" vs
  // "Hartland Clinic", "St. Mary's Madison Hospital" vs "St. Mary's Hospital").
  // Within one client only the remaining words, in any order, identify the site.
  const clientWords = new Set(client.split(' '));
  const siteWords = [...new Set(siteName.split(' ').filter((word) => word && !clientWords.has(word)))].sort();
  return `${client}::${siteWords.join(' ')}`;
}

/* ------------------------------------------------------------------------- */
/* Date / duration parsing                                                   */
/* ------------------------------------------------------------------------- */

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseWorkDate(value: unknown): { iso: string; ms: number } | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const iso = isoFromParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
    return iso ? { iso, ms: new Date(`${iso}T00:00:00`).getTime() } : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 80000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
      const iso = isoFromParts(
        utc.getUTCFullYear(),
        utc.getUTCMonth() + 1,
        utc.getUTCDate(),
      );
      return iso ? { iso, ms: new Date(`${iso}T00:00:00`).getTime() } : null;
    }
    return null;
  }

  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s|$)/);
  if (us) {
    let year = Number(us[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const iso = isoFromParts(year, Number(us[1]), Number(us[2]));
    return iso ? { iso, ms: new Date(`${iso}T00:00:00`).getTime() } : null;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
  if (isoMatch) {
    const iso = isoFromParts(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
    return iso ? { iso, ms: new Date(`${iso}T00:00:00`).getTime() } : null;
  }

  return null;
}

/** D-Tools exports decimal hours. Values are never multiplied or divided. */
export function parseDurationHours(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/,/g, '');
  if (!text) return null;
  const clock = text.match(/^(\d+):([0-5]\d)(?::[0-5]\d)?$/);
  if (clock) {
    return Number(clock[1]) + Number(clock[2]) / 60 + Number(text.split(':')[2] ?? 0) / 3600;
  }
  if (!/^\d*\.?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseApproved(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'y', 'approved'].includes(value.trim().toLowerCase());
}

/* ------------------------------------------------------------------------- */
/* CSV parsing                                                               */
/* ------------------------------------------------------------------------- */

/** RFC-4180 CSV parser. Handles quoted commas, escaped quotes and newlines. */
export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (quoted) throw new Error('The CSV contains an unterminated quoted field. Export it again from D-Tools.');
  return rows;
}

/* ------------------------------------------------------------------------- */
/* Classification                                                            */
/* ------------------------------------------------------------------------- */

export interface ProjectClassification {
  classification: DtoolsClassification;
  frequency: 'Annual' | 'Semi-Annual' | null;
  reasons: string[];
  contractPosition: string | null;
  isFireAlarm: boolean;
}

const EXCLUSION_RULES: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\s*(?:WAR\s+)?SVC\s*[-–—]/i,
    reason: 'Excluded: SVC service project',
  },
  {
    pattern: /\btroubleshoot(?:ing)?\b/i,
    reason: 'Excluded: troubleshooting work',
  },
  {
    pattern: /\bdeficien(?:cy|cies)\b/i,
    reason: 'Excluded: deficiency work',
  },
  {
    pattern: /\bdiscrepan(?:cy|cies)\b/i,
    reason: 'Excluded: discrepancy work',
  },
  {
    pattern: /\brepairs?\b/i,
    reason: 'Excluded: repair work',
  },
  {
    pattern: /\breplace(?:ment)?\b/i,
    reason: 'Excluded: replacement work',
  },
  {
    pattern: /\bcorrective(?:\s+work)?\b/i,
    reason: 'Excluded: corrective work',
  },
  {
    pattern: /^\s*service\s*[-–—]/i,
    reason: 'Excluded: service project',
  },
  {
    pattern: /\bservice\s+(?:call|work|ticket|request|order)\b/i,
    reason: 'Excluded: service call',
  },
];

function detectOtherDiscipline(text: string): string[] {
  const found: string[] = [];
  if (/\bnurse\s*call\b/i.test(text)) found.push('nurse call');
  if (/\bintrusion\b/i.test(text)) found.push('intrusion');
  if (/\bCCTV\b/i.test(text) || /\bcamera/i.test(text)) found.push('CCTV');
  if (/\bsecurity\b/i.test(text)) found.push('security');
  if (/^\s*NC\s*[-–—]/i.test(text) || /I\s*&\s*T\s*[-–—]\s*NC\b/i.test(text)) {
    found.push('nurse call');
  }
  if (/^\s*INT\s*[-–—]/i.test(text) || /I\s*&\s*T\s*[-–—]\s*INT\b/i.test(text)) {
    found.push('intrusion');
  }
  if (/^\s*SEC\s*[-–—]/i.test(text) || /I\s*&\s*T\s*[-–—]\s*SEC\b/i.test(text)) {
    found.push('security');
  }
  if (/\bAV\b/.test(text)) found.push('AV');
  return [...new Set(found)];
}

/**
 * Deterministic project classification. Ambiguous projects deliberately land
 * in `review` instead of being guessed into an inspection average.
 */
export function classifyProjectName(projectName: string): ProjectClassification {
  const text = collapseSpaces(projectName);
  const reasons: string[] = [];
  const reviewReasons: string[] = [];

  for (const rule of EXCLUSION_RULES) {
    if (rule.pattern.test(text)) {
      return {
        classification: 'excluded',
        frequency: null,
        reasons: [rule.reason],
        contractPosition: contractPositionOf(text),
        isFireAlarm: false,
      };
    }
  }

  const isFireAlarm =
    /\bfire\s*alarm\b/i.test(text) ||
    /\bfire\s+inspection\b/i.test(text) ||
    /\bFA\b/i.test(text);
  const otherDisciplines = detectOtherDiscipline(text);
  const mixed = isFireAlarm && otherDisciplines.length > 0;

  if (!isFireAlarm) {
    return {
      classification: 'excluded',
      frequency: null,
      reasons: [
        otherDisciplines.length > 0
          ? `Excluded: ${otherDisciplines.join(', ')} work, not fire alarm`
          : 'Excluded: no fire alarm inspection signal in the project title',
      ],
      contractPosition: contractPositionOf(text),
      isFireAlarm: false,
    };
  }

  if (mixed) {
    const message = `Title mixes fire alarm with ${otherDisciplines.join(', ')}; confirm scope.`;
    reasons.push(message);
    reviewReasons.push(message);
  }

  if (!/\binspections?\b|\bI\s*(?:&|AND)\s*T\b/i.test(text)) {
    const message = 'No explicit inspection scope in the title; confirm this is inspection work.';
    reasons.push(message);
    reviewReasons.push(message);
  }
  if (/\b(?:quarterly|monthly)\b/i.test(text)) {
    const message = 'Title includes another inspection frequency; confirm scope.';
    reasons.push(message);
    reviewReasons.push(message);
  }

  const withoutSemi = text.replace(
    /\bsemi[\s-]*(?:annual|anual|annal|annul|annaul|annuall)\b/gi,
    ' ',
  );
  const hasSemi = /\bsemi[\s-]*(?:annual|anual|annal|annul|annaul|annuall)\b/i.test(text);
  const hasAnnual = /\b(?:annual|anual|annal|annul|annaul|annuall)\b/i.test(withoutSemi);
  let frequency: 'Annual' | 'Semi-Annual' | null = null;
  if (hasSemi && !hasAnnual) frequency = 'Semi-Annual';
  else if (hasAnnual && !hasSemi) frequency = 'Annual';
  else if (hasSemi && hasAnnual) {
    const message = 'Title contains both Annual and Semi-Annual wording.';
    reasons.push(message);
    reviewReasons.push(message);
  } else {
    const message = 'No reliable Annual or Semi-Annual wording.';
    reasons.push(message);
    reviewReasons.push(message);
  }
  if (frequency !== null && !/\bannual\b/i.test(text)) {
    reasons.push('Recognized a misspelled Annual/Semi-Annual word in the title.');
  }

  const contractPosition = contractPositionOf(text);
  if (contractPosition) {
    const [position, total] = contractPosition.split(' of ').map(Number);
    if (position > total) {
      const message = `Contract position ${contractPosition} is inconsistent.`;
      reasons.push(message);
      reviewReasons.push(message);
    }
  }

  if (reviewReasons.length > 0 || frequency === null) {
    return {
      classification: 'review',
      frequency,
      reasons,
      contractPosition,
      isFireAlarm,
    };
  }

  return {
    classification: frequency === 'Annual' ? 'annual' : 'semi-annual',
    frequency,
    reasons: [
      ...reasons,
      `Confirmed ${frequency.toLowerCase()} fire alarm inspection title.`,
    ],
    contractPosition,
    isFireAlarm,
  };
}

export function contractPositionOf(text: string): string | null {
  const match = text.match(/\b(\d+)\s*of\s*(\d+)\b/i);
  return match ? `${match[1]} of ${match[2]}` : null;
}

/* ------------------------------------------------------------------------- */
/* Year inference                                                            */
/* ------------------------------------------------------------------------- */

interface YearInference {
  year: number | null;
  source: DtoolsYearSource;
  reasons: string[];
  needsReview: boolean;
}

export function titleYears(projectName: string): number[] {
  return [
    ...new Set(
      [...projectName.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((match) =>
        Number(match[1]),
      ),
    ),
  ];
}

function workYears(dates: number[]): number[] {
  return [...new Set(dates.map((ms) => new Date(ms).getFullYear()))];
}

export function inferServiceYear(
  projectName: string,
  dates: number[],
): YearInference {
  const years = titleYears(projectName);
  const reasons: string[] = [];
  let needsReview = false;
  let year: number | null = null;
  let source: DtoolsYearSource = null;

  if (years.length === 1) {
    year = years[0];
    source = 'title';
    reasons.push(`Inspection year ${year} taken from the project title.`);
  } else if (years.length > 1) {
    reasons.push(`Multiple years appear in the title (${years.join(', ')}).`);
    needsReview = true;
  }

  const actualYears = workYears(dates);
  if (year === null && actualYears.length > 0) {
    const counts = new Map<number, number>();
    for (const ms of dates) {
      const value = new Date(ms).getFullYear();
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    year = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    source = 'work-dates';
    needsReview = true;
    reasons.push(
      actualYears.length === 1
        ? `No year in title; inferred ${year} from work dates.`
        : `No year in title; work dates span ${actualYears.join(', ')}. Inferred ${year}; confirm it.`,
    );
  }

  if (year !== null && dates.length > 0) {
    const minYear = Math.min(...actualYears);
    const maxYear = Math.max(...actualYears);
    if (minYear < year - 1 || maxYear > year + 1) {
      needsReview = true;
      reasons.push(
        `Title year ${year} conflicts with work dates in ${minYear}–${maxYear}.`,
      );
    } else if (minYear !== maxYear) {
      reasons.push(
        `Work spans ${minYear}–${maxYear}; kept as one inspection occurrence.`,
      );
    }
  }

  if (year === null) {
    needsReview = true;
    reasons.push('No inspection year could be determined.');
  }

  return { year, source, reasons, needsReview };
}

/* ------------------------------------------------------------------------- */
/* Table parsing                                                             */
/* ------------------------------------------------------------------------- */

const HEADER_ALIASES: Record<string, string> = {
  approved: 'approved',
  entity: 'entity',
  date: 'date',
  workdate: 'date',
  resource: 'resource',
  resourceemail: 'resourceEmail',
  email: 'resourceEmail',
  clientname: 'clientName',
  client: 'clientName',
  projectname: 'projectName',
  project: 'projectName',
  projectnumber: 'projectNumber',
  projectno: 'projectNumber',
  projectid: 'projectNumber',
  projectmanager: 'projectManager',
  pm: 'projectManager',
  name: 'taskName',
  taskname: 'taskName',
  task: 'taskName',
  number: 'taskNumber',
  tasknumber: 'taskNumber',
  duration: 'duration',
  hours: 'duration',
  laborhours: 'duration',
  createdon: 'createdOn',
  created: 'createdOn',
  updatedon: 'updatedOn',
  updated: 'updatedOn',
  updatedby: 'updatedBy',
};

function headerKey(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function buildHeaderMap(header: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = HEADER_ALIASES[headerKey(cell)];
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

export function hasDtoolsHeaders(header: unknown[]): boolean {
  const map = buildHeaderMap(header);
  return REQUIRED_HEADERS.every(([key]) => map.has(key));
}

export interface InvalidDtoolsRow {
  sourceRow: number;
  reason: string;
}

export interface ParsedDtoolsImport {
  dataset: DtoolsDataset;
  rows: DtoolsRow[];
  invalidRows: InvalidDtoolsRow[];
  warnings: string[];
}

interface RawTimesheetRow {
  sourceRow: number;
  approved: boolean;
  entity: string;
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
  duration: number;
  createdOn: string;
  updatedOn: string;
  updatedBy: string;
  projectKey: string;
}

export interface DtoolsTableInput {
  header: unknown[];
  rows: unknown[][];
  fileName: string;
  fileType: 'csv' | 'xlsx';
  sheetName: string;
  fingerprint: string;
  datasetId: string;
  importedAt: number;
  sourceRows?: number[];
}

const REQUIRED_HEADERS: Array<[string, string]> = [
  ['approved', 'Approved'],
  ['date', 'Date'],
  ['resource', 'Resource'],
  ['clientName', 'Client Name'],
  ['projectName', 'Project Name'],
  ['projectNumber', 'Project Number'],
  ['taskName', 'Name'],
  ['taskNumber', 'Number'],
  ['duration', 'Duration'],
];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Convert a D-Tools Excel/CSV table into classified, source-traceable rows.
 * Malformed rows are reported and skipped; valid rows are never mixed with
 * another file and no value is fabricated.
 */
export function parseDtoolsTable(input: DtoolsTableInput): ParsedDtoolsImport {
  const headerMap = buildHeaderMap(input.header);
  const missing = REQUIRED_HEADERS.filter(([key]) => !headerMap.has(key));
  if (missing.length > 0) {
    throw new Error(
      `This file is missing required D-Tools columns: ${missing
        .map(([, label]) => label)
        .join(', ')}.`,
    );
  }

  const invalidRows: InvalidDtoolsRow[] = [];
  const rawRows: RawTimesheetRow[] = [];
  const incompleteProjects = new Set<string>();
  const incompleteNumbers = new Set<string>();

  input.rows.forEach((row, index) => {
    const sourceRow = input.sourceRows?.[index] ?? index + 2;
    if (!row.some((cell) => cellText(cell).trim() !== '')) return;

    const get = (key: string): unknown => {
      const column = headerMap.get(key);
      return column === undefined ? '' : row[column];
    };
    const markIncomplete = () => {
      const number = cellText(get('projectNumber')).trim();
      incompleteProjects.add(projectKeyFor(number, cellText(get('projectName'))));
      if (number) incompleteNumbers.add(number);
    };

    const parsedDate = parseWorkDate(get('date'));
    if (!parsedDate) {
      invalidRows.push({ sourceRow, reason: 'Unreadable work date' });
      markIncomplete();
      return;
    }
    const duration = parseDurationHours(get('duration'));
    if (duration === null) {
      invalidRows.push({ sourceRow, reason: 'Unreadable duration' });
      markIncomplete();
      return;
    }
    const projectName = cellText(get('projectName'));
    const clientName = cellText(get('clientName'));
    if (!projectName.trim()) {
      invalidRows.push({ sourceRow, reason: 'Missing project name' });
      markIncomplete();
      return;
    }
    if (!clientName.trim()) {
      invalidRows.push({ sourceRow, reason: 'Missing client name' });
      markIncomplete();
      return;
    }
    const projectNumber = cellText(get('projectNumber')).trim();

    rawRows.push({
      sourceRow,
      approved: parseApproved(get('approved')),
      entity: cellText(get('entity')),
      date: parsedDate.iso,
      dateMs: parsedDate.ms,
      resource: cellText(get('resource')),
      resourceEmail: cellText(get('resourceEmail')),
      clientName,
      projectName,
      projectNumber,
      projectManager: cellText(get('projectManager')),
      taskName: cellText(get('taskName')),
      taskNumber: cellText(get('taskNumber')),
      duration,
      createdOn: cellText(get('createdOn')),
      updatedOn: cellText(get('updatedOn')),
      updatedBy: cellText(get('updatedBy')),
      projectKey: projectKeyFor(projectNumber, projectName),
    });
  });

  const groups = new Map<string, RawTimesheetRow[]>();
  for (const row of rawRows) {
    const group = groups.get(row.projectKey) ?? [];
    group.push(row);
    groups.set(row.projectKey, group);
  }

  const warnings: string[] = [];
  const projectMeta = new Map<
    string,
    {
      classification: DtoolsClassification;
      frequency: 'Annual' | 'Semi-Annual' | null;
      year: number | null;
      yearSource: DtoolsYearSource;
      reasons: string[];
      siteKey: string;
      siteLabel: string;
      needsReview: boolean;
    }
  >();

  const numberToTitles = new Map<string, Set<string>>();
  for (const group of groups.values()) {
    const first = group[0];
    if (!first.projectNumber) continue;
    const titles = numberToTitles.get(first.projectNumber) ?? new Set<string>();
    titles.add(normalizeText(first.projectName));
    numberToTitles.set(first.projectNumber, titles);
  }

  for (const [key, group] of groups) {
    const first = group[0];
    const auto = classifyProjectName(first.projectName);
    const approvedDates = group.filter((row) => row.approved).map((row) => row.dateMs);
    const year = inferServiceYear(
      first.projectName,
      approvedDates.length > 0 ? approvedDates : group.map((row) => row.dateMs),
    );
    const reasons = [...auto.reasons, ...year.reasons];
    let classification = auto.classification;
    let needsReview = auto.classification === 'review' || year.needsReview;
    if (year.needsReview && classification !== 'excluded') {
      classification = 'review';
    }
    if ((incompleteProjects.has(key) || incompleteNumbers.has(first.projectNumber)) && classification !== 'excluded') {
      reasons.push('Some source rows for this project were rejected; confirm scope and repair the export before using this incomplete total.');
      needsReview = true;
      classification = 'review';
    }

    if (!first.projectNumber || new Set(group.map((row) => normalizeText(row.clientName))).size > 1) {
      reasons.push('Missing project number or conflicting clients; confirm project identity.');
      needsReview = true;
      if (classification !== 'excluded') classification = 'review';
    }

    if (
      first.projectNumber &&
      (numberToTitles.get(first.projectNumber)?.size ?? 0) > 1
    ) {
      reasons.push('Project number is shared by more than one project title.');
      needsReview = true;
      if (classification !== 'excluded') classification = 'review';
    }

    const spanDays =
      approvedDates.length > 1
        ? Math.round(
            (Math.max(...approvedDates) - Math.min(...approvedDates)) / 86_400_000,
          )
        : 0;
    if (spanDays > 400 && classification !== 'excluded') {
      reasons.push(
        `Approved entries span ${spanDays} days; this may be more than one inspection occurrence.`,
      );
      needsReview = true;
      classification = 'review';
    }

    const sortedDates = [...new Set(approvedDates)].sort((a, b) => a - b);
    const longGap = sortedDates.some((date, index) =>
      index > 0 && date - sortedDates[index - 1] > 60 * 86_400_000,
    );
    if (auto.frequency === 'Semi-Annual' && spanDays > 90 && longGap && classification !== 'excluded') {
      reasons.push('Semi-annual entries may cover multiple visits or staged completion; confirm scope before treating this project as one visit.');
      needsReview = true;
      classification = 'review';
    }

    const siteLabel = deriveSiteLabel(first.projectName);
    projectMeta.set(key, {
      classification,
      frequency: auto.frequency,
      year: year.year,
      yearSource: year.source,
      reasons,
      siteKey: siteKeyFor(first.clientName, first.projectName),
      siteLabel,
      needsReview,
    });
  }

  const projectCount = groups.size;
  const counts: Record<DtoolsClassification, number> = {
    annual: 0,
    'semi-annual': 0,
    excluded: 0,
    review: 0,
  };
  for (const meta of projectMeta.values()) counts[meta.classification] += 1;

  const rows: DtoolsRow[] = rawRows.map((row) => {
    const meta = projectMeta.get(row.projectKey);
    if (!meta) throw new Error(`Missing project classification for row ${row.sourceRow}.`);
    const taskFlag = taskFlagFor(row.taskName, row.projectName);
    return {
      id: `${input.datasetId}:${row.sourceRow}`,
      datasetId: input.datasetId,
      sourceRow: row.sourceRow,
      approved: row.approved,
      entity: row.entity,
      date: row.date,
      dateMs: row.dateMs,
      resource: row.resource,
      resourceEmail: row.resourceEmail,
      clientName: row.clientName,
      projectName: row.projectName,
      projectNumber: row.projectNumber,
      projectManager: row.projectManager,
      taskName: row.taskName,
      taskNumber: row.taskNumber,
      duration: row.duration,
      createdOn: row.createdOn,
      updatedOn: row.updatedOn,
      updatedBy: row.updatedBy,
      sourceFile: input.fileName,
      sourceSheet: input.sheetName,
      projectKey: row.projectKey,
      siteKey: meta.siteKey,
      siteLabel: meta.siteLabel,
      classification: meta.classification,
      frequency: meta.frequency,
      serviceYear: meta.year,
      yearSource: meta.yearSource,
      reasons: meta.reasons,
      taskFlag,
      includedByDefault:
        row.approved &&
        meta.classification !== 'excluded' &&
        meta.classification !== 'review' &&
        taskFlag === null,
    };
  });

  if (invalidRows.length > 0) {
    warnings.push(
      `${invalidRows.length} row${invalidRows.length === 1 ? '' : 's'} could not be read and were skipped.`,
    );
  }
  if (rows.some((row) => !row.approved)) {
    warnings.push(
      `${rows.filter((row) => !row.approved).length} unapproved entr${
        rows.filter((row) => !row.approved).length === 1 ? 'y is' : 'ies are'
      } excluded from actual hours by default.`,
    );
  }

  return {
    dataset: {
      id: input.datasetId,
      fileName: input.fileName,
      fileType: input.fileType,
      sheetName: input.sheetName,
      fingerprint: input.fingerprint,
      importedAt: input.importedAt,
      totalRows: rows.length + invalidRows.length,
      validRows: rows.length,
      rejectedRows: invalidRows.length,
      unapprovedRows: rows.filter((row) => !row.approved).length,
      projectCount,
      annualCount: counts.annual,
      semiAnnualCount: counts['semi-annual'],
      excludedCount: counts.excluded,
      reviewCount: counts.review,
    },
    rows,
    invalidRows,
    warnings,
  };
}

export function refreshDtoolsHistory(dataset: DtoolsDataset, rows: readonly DtoolsRow[]): ParsedDtoolsImport {
  const incompleteReason = 'Some source rows for this project were rejected; confirm scope and repair the export before using this incomplete total.';
  const incompleteProjects = new Set(rows.filter((row) => row.reasons.includes(incompleteReason)).map((row) => row.projectKey));
  const header = ['Approved', 'Entity', 'Date', 'Resource', 'Resource Email', 'Client Name', 'Project Name', 'Project Number', 'Project Manager', 'Name', 'Number', 'Duration', 'Created On', 'Updated On', 'Updated By'];
  const parsed = parseDtoolsTable({
    header,
    rows: rows.map((row) => [row.approved, row.entity, row.date, row.resource, row.resourceEmail, row.clientName, row.projectName, row.projectNumber, row.projectManager, row.taskName, row.taskNumber, row.duration, row.createdOn, row.updatedOn, row.updatedBy]),
    sourceRows: rows.map((row) => row.sourceRow),
    fileName: dataset.fileName,
    fileType: dataset.fileType,
    sheetName: dataset.sheetName,
    fingerprint: dataset.fingerprint,
    datasetId: dataset.id,
    importedAt: dataset.importedAt,
  });
  if (parsed.rows.length !== rows.length) {
    throw new Error('Saved D-Tools history contains unreadable rows; the original import must be restored or re-imported.');
  }
  parsed.dataset.totalRows = dataset.totalRows;
  parsed.dataset.rejectedRows = dataset.rejectedRows;
  if (incompleteProjects.size > 0) {
    for (const row of parsed.rows) {
      if (!incompleteProjects.has(row.projectKey) || row.classification === 'excluded') continue;
      row.classification = 'review';
      row.includedByDefault = false;
      if (!row.reasons.includes(incompleteReason)) row.reasons.push(incompleteReason);
    }
    const classifications = new Map(parsed.rows.map((row) => [row.projectKey, row.classification]));
    parsed.dataset.annualCount = [...classifications.values()].filter((value) => value === 'annual').length;
    parsed.dataset.semiAnnualCount = [...classifications.values()].filter((value) => value === 'semi-annual').length;
    parsed.dataset.excludedCount = [...classifications.values()].filter((value) => value === 'excluded').length;
    parsed.dataset.reviewCount = [...classifications.values()].filter((value) => value === 'review').length;
  }
  return parsed;
}

function taskFlagFor(taskName: string, projectName: string): string | null {
  const task = normalizeText(taskName);
  const project = normalizeText(projectName);
  const detail = task.startsWith(project) ? task.slice(project.length) : task;
  if (!detail) return null;
  if (
    /\b(?:service|troubleshoot(?:ing)?|deficien(?:cy|cies)?|discrepan(?:cy|cies)?|repairs?|replace(?:ment)?|corrective)\b/.test(
      detail,
    )
  ) {
    return 'Task wording indicates service, deficiency, repair or corrective work.';
  }
  if (/\bsprinkler\b/.test(detail)) {
    return 'Task references sprinkler work, not fire alarm inspection.';
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* Project / site aggregation                                                */
/* ------------------------------------------------------------------------- */

export function defaultDecision(project: {
  key: string;
  projectNumber: string;
  projectName: string;
}): DtoolsProjectDecision {
  return {
    key: project.key,
    projectNumber: project.projectNumber,
    projectName: project.projectName,
    action: 'auto',
    frequency: null,
    year: null,
    note: '',
    quotedHours: null,
    includeFlaggedEntries: false,
    updatedAt: 0,
  };
}

export function buildProjects(
  rows: readonly DtoolsRow[],
  decisions: ReadonlyMap<string, DtoolsProjectDecision> = new Map(),
): DtoolsProject[] {
  const groups = new Map<string, DtoolsRow[]>();
  for (const row of rows) {
    const group = groups.get(row.projectKey) ?? [];
    group.push(row);
    groups.set(row.projectKey, group);
  }

  const projects: DtoolsProject[] = [];
  for (const [key, group] of groups) {
    const first = group[0];
    const decision =
      decisions.get(key) ??
      defaultDecision({
        key,
        projectNumber: first.projectNumber,
        projectName: first.projectName,
      });
    const classification = first.classification;
    const frequency = first.frequency;
    const effectiveFrequency = decision.frequency ?? frequency;
    const effectiveYear = decision.year ?? first.serviceYear;
    const flagged = group.filter((row) => row.approved && row.taskFlag);
    const approved = group.filter((row) => row.approved);
    const approvedHours = approved.reduce((sum, row) => sum + row.duration, 0);
    const flaggedHours = flagged.reduce((sum, row) => sum + row.duration, 0);
    const countedHours =
      decision.includeFlaggedEntries || flagged.length === 0
        ? approvedHours
        : approvedHours - flaggedHours;
    const hasCountedHours = countedHours > 0;
    const noApprovedEntries = approved.length === 0;
    const reasons = [...first.reasons];
    if (noApprovedEntries) {
      reasons.push('No approved timesheet entries; excluded from averages.');
    } else if (!hasCountedHours && flagged.length > 0) {
      reasons.push(
        'All approved time is flagged as non-inspection work; excluded from averages until reviewed.',
      );
    } else if (!hasCountedHours) {
      reasons.push('No counted inspection hours; excluded from averages.');
    }

    let included: boolean;
    const scopeReview = first.reasons.some((reason) =>
      /mixes|both Annual and Semi-Annual|shared by more than one|may be more than one inspection|confirm scope|project identity|explicit inspection scope|inconsistent/i.test(reason),
    );
    // A year inferred from work dates is still unconfirmed until the user
    // supplies it explicitly. A title year is already confirmed.
    const yearConfirmed =
      decision.year !== null || (first.yearSource === 'title' && !first.reasons.some((reason) => /conflict|Multiple years/i.test(reason)));
    const autoResolvedReview =
      classification === 'review' &&
      !scopeReview &&
      yearConfirmed &&
      effectiveFrequency !== null &&
      effectiveYear !== null &&
      (decision.frequency !== null || decision.year !== null);
    if (decision.action === 'include') {
      included = effectiveYear !== null && effectiveFrequency !== null && hasCountedHours;
    } else if (decision.action === 'exclude') included = false;
    else {
      included =
        hasCountedHours &&
        (autoResolvedReview ||
          ((classification === 'annual' || classification === 'semi-annual') &&
            effectiveYear !== null));
    }

    if (decision.frequency !== null) {
      reasons.push(`Manual frequency correction: ${decision.frequency}.`);
    }
    if (decision.year !== null) {
      reasons.push(`Manual inspection-year correction: ${decision.year}.`);
    }
    if (decision.action !== 'auto') {
      reasons.push(`Manual project decision: ${decision.action}.`);
    }

    const entries: DtoolsProjectEntry[] = [...group]
      .sort((a, b) => a.dateMs - b.dateMs || a.sourceRow - b.sourceRow)
      .map((row) => {
        let exclusionReason: string | null = null;
        if (!row.approved) exclusionReason = 'Unapproved entry';
        else if (row.taskFlag && !decision.includeFlaggedEntries) {
          exclusionReason = row.taskFlag;
        } else if (decision.action === 'exclude') {
          exclusionReason = 'Project manually excluded';
        } else if (classification === 'excluded' && !included) {
          exclusionReason = 'Project excluded as unrelated work';
        } else if (classification === 'review' && !included) {
          exclusionReason = 'Project needs manual review';
        } else if (effectiveYear === null) {
          exclusionReason = 'No inspection year determined';
        } else if (effectiveFrequency === null) {
          exclusionReason = 'No inspection frequency confirmed';
        }
        return {
          row,
          included: exclusionReason === null,
          exclusionReason,
        };
      });

    const dates = group.map((row) => row.dateMs);
    projects.push({
      key,
      projectNumber: first.projectNumber,
      projectName: first.projectName,
      clientName: first.clientName,
      siteKey: siteKeyFor(first.clientName, first.projectName),
      siteLabel: first.siteLabel,
      classification,
      frequency,
      serviceYear: first.serviceYear,
      yearSource: first.yearSource,
      reasons,
      contractPosition: contractPositionOf(first.projectName),
      firstDate: new Date(Math.min(...dates)).toISOString().slice(0, 10),
      lastDate: new Date(Math.max(...dates)).toISOString().slice(0, 10),
      entryCount: group.length,
      inspectorCount: new Set(approved.map((row) => row.resource).filter(Boolean)).size,
      totalHours: countedHours,
      approvedHours,
      unapprovedHours: group
        .filter((row) => !row.approved)
        .reduce((sum, row) => sum + row.duration, 0),
      flaggedEntries: flagged.length,
      flaggedHours,
      needsReview:
        classification === 'review' ||
        effectiveYear === null ||
        !hasCountedHours ||
        (first.reasons.some((reason) => /span|spans|conflict|shared|more than one/i.test(reason)) &&
          decision.year === null),
      decision,
      effectiveFrequency,
      effectiveYear,
      included,
      entries,
    });
  }

  return projects.sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName) ||
      a.siteLabel.localeCompare(b.siteLabel) ||
      (b.effectiveYear ?? 0) - (a.effectiveYear ?? 0),
  );
}

export function buildSiteSummaries(
  projects: readonly DtoolsProject[],
): DtoolsSiteSummary[] {
  const groups = new Map<string, DtoolsProject[]>();
  for (const project of projects) {
    const group = groups.get(project.siteKey) ?? [];
    group.push(project);
    groups.set(project.siteKey, group);
  }

  return [...groups.entries()]
    .map(([siteKey, group]) => {
      const first = group[0];
      const counted = group.filter((project) => project.included);
      return {
        siteKey,
        clientName: first.clientName,
        siteLabel: first.siteLabel,
        projectCount: group.length,
        annualCount: group.filter((project) => project.classification === 'annual').length,
        semiAnnualCount: group.filter((project) => project.classification === 'semi-annual').length,
        reviewCount: group.filter((project) => project.classification === 'review').length,
        excludedCount: group.filter((project) => project.classification === 'excluded').length,
        includedCount: counted.length,
        totalHours: counted.reduce((sum, project) => sum + project.totalHours, 0),
        projectNames: group.map((project) => project.projectName),
        years: [
          ...new Set(
            counted
              .map((project) => project.effectiveYear)
              .filter((year): year is number => year !== null),
          ),
        ].sort((a, b) => b - a),
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.siteLabel.localeCompare(b.siteLabel));
}

export function searchSites(
  sites: readonly DtoolsSiteSummary[],
  query: string,
  limit = 30,
): DtoolsSiteSummary[] {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return sites.slice(0, limit);
  const scored = sites
    .map((site) => {
      const haystack = normalizeText(`${site.clientName} ${site.siteLabel} ${(site.projectNames ?? []).join(' ')}`);
      const full = tokens.join(' ');
      let score = 0;
      if (haystack === full) score = 100;
      else if (haystack.startsWith(full)) score = 80;
      else if (haystack.includes(full)) score = 60;
      else if (tokens.every((token) => haystack.includes(token))) score = 40;
      return { site, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.site.clientName.localeCompare(b.site.clientName) ||
        a.site.siteLabel.localeCompare(b.site.siteLabel),
    );
  return scored.slice(0, limit).map((item) => item.site);
}

/* ------------------------------------------------------------------------- */
/* Averages and renewal hand-off                                             */
/* ------------------------------------------------------------------------- */

export interface HistoryAverage {
  averagePerVisit: number | null;
  selectedCount: number;
  totalHours: number;
  annualizedAverage: number | null;
  completeYears: number;
  yearTotals: Array<{ year: number; hours: number; visits: number }>;
  warnings: string[];
}

export function defaultSelectedKeys(
  projects: readonly DtoolsProject[],
  frequency: 'Annual' | 'Semi-Annual',
): string[] {
  const eligible = projects
    .filter(
      (project) =>
        project.included &&
        project.effectiveFrequency === frequency &&
        project.effectiveYear !== null,
    )
    .sort(
      (a, b) =>
        (b.effectiveYear ?? 0) - (a.effectiveYear ?? 0) ||
        Number(b.source === 'job-cost') - Number(a.source === 'job-cost') ||
        b.lastDate.localeCompare(a.lastDate),
    );

  if (frequency === 'Annual') {
    const seen = new Set<number>();
    const keys: string[] = [];
    for (const project of eligible) {
      const year = project.effectiveYear as number;
      if (seen.has(year)) continue;
      seen.add(year);
      keys.push(project.key);
      if (keys.length === 3) break;
    }
    return eligible.filter((project) => project.decision.averageSelected === true ||
      (keys.includes(project.key) && project.decision.averageSelected !== false)).map((project) => project.key);
  }

  const seenVisits = new Map<number, number>();
  const keys: string[] = [];
  for (const project of eligible) {
    const year = project.effectiveYear as number;
    const count = seenVisits.get(year) ?? 0;
    if (count >= 2) continue;
    seenVisits.set(year, count + 1);
    keys.push(project.key);
    if (keys.length === 6) break;
  }
  return eligible.filter((project) => project.decision.averageSelected === true ||
    (keys.includes(project.key) && project.decision.averageSelected !== false)).map((project) => project.key);
}

export function computeHistoryAverage(
  projects: readonly DtoolsProject[],
  selectedKeys: ReadonlySet<string>,
  frequency: 'Annual' | 'Semi-Annual',
): HistoryAverage {
  const selected = projects.filter(
    (project) =>
      selectedKeys.has(project.key) &&
      project.included &&
      project.effectiveFrequency === frequency &&
      project.effectiveYear !== null,
  );
  const totalHours = selected.reduce((sum, project) => sum + project.totalHours, 0);
  const byYear = new Map<number, { hours: number; visits: number }>();
  for (const project of selected) {
    const year = project.effectiveYear as number;
    const current = byYear.get(year) ?? { hours: 0, visits: 0 };
    current.hours += project.totalHours;
    current.visits += 1;
    byYear.set(year, current);
  }
  const yearTotals = [...byYear.entries()]
    .map(([year, value]) => ({ year, ...value }))
    .sort((a, b) => b.year - a.year);
  const complete = yearTotals.filter((entry) => entry.visits === 2);
  const warnings: string[] = [];

  const duplicateYears = yearTotals.filter((entry) => entry.visits > 1);
  if (frequency === 'Annual' && duplicateYears.length > 0) {
    warnings.push(
      `More than one annual inspection is selected for ${duplicateYears
        .map((entry) => entry.year)
        .join(', ')}. Confirm that they are distinct occurrences.`,
    );
  }
  if (frequency === 'Annual' && yearTotals.length < 3) {
    warnings.push(
      `Only ${yearTotals.length} annual occurrence${yearTotals.length === 1 ? '' : 's'} selected; three are normally reviewed.`,
    );
  }
  if (frequency === 'Semi-Annual') {
    if (yearTotals.some((entry) => entry.visits > 2)) {
      warnings.push('More than two projects are selected in a semi-annual year. That year is excluded from annualized hours until the two visits are confirmed.');
    }
    if (yearTotals.length < 3) {
      warnings.push(
        `Only ${yearTotals.length} semi-annual year${yearTotals.length === 1 ? '' : 's'} selected; three are normally reviewed.`,
      );
    }
    if (yearTotals.some((entry) => entry.visits < 2)) {
      warnings.push(
        'Some selected years have only one semi-annual visit. Annualized hours need two visits.',
      );
    }
    if (complete.length === 0) {
      warnings.push('No year has two semi-annual visits, so no annualized average is available.');
    }
  }

  return {
    averagePerVisit:
      selected.length > 0 ? totalHours / selected.length : null,
    selectedCount: selected.length,
    totalHours,
    annualizedAverage:
      complete.length > 0
        ? complete.reduce((sum, entry) => sum + entry.hours, 0) / complete.length
        : null,
    completeYears: complete.length,
    yearTotals,
    warnings,
  };
}

function newEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hours-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Convert selected inspection occurrences into the renewal editor's history
 * entries. Semi-annual years without two visits are omitted, never zero-filled.
 */
export function buildHistoryEntries(
  projects: readonly DtoolsProject[],
  selectedKeys: ReadonlySet<string>,
  frequency: 'Annual' | 'Semi-Annual',
  basis: 'visit' | 'annualized' = 'visit',
): HistoricalHoursEntry[] {
  const selected = projects
    .filter(
      (project) =>
        selectedKeys.has(project.key) &&
        project.included &&
        project.effectiveFrequency === frequency &&
        project.effectiveYear !== null,
    )
    .sort(
      (a, b) =>
        (a.effectiveYear ?? 0) - (b.effectiveYear ?? 0) ||
        a.firstDate.localeCompare(b.firstDate),
    );

  if (frequency === 'Annual') {
    return selected.map((project) => ({
      id: newEntryId(),
      yearLabel: String(project.effectiveYear),
      hours: project.totalHours,
    }));
  }

  if (basis === 'annualized') {
    const byYear = new Map<number, { hours: number; visits: number }>();
    for (const project of selected) {
      const year = project.effectiveYear as number;
      const current = byYear.get(year) ?? { hours: 0, visits: 0 };
      current.hours += project.totalHours;
      current.visits += 1;
      byYear.set(year, current);
    }
    return [...byYear.entries()]
      .filter(([, value]) => value.visits === 2)
      .sort((a, b) => a[0] - b[0])
      .map(([year, value]) => ({
        id: newEntryId(),
        yearLabel: String(year),
        hours: value.hours,
      }));
  }

  const visitCounts = new Map<number, number>();
  return selected.map((project) => {
    const year = project.effectiveYear as number;
    const visit = (visitCounts.get(year) ?? 0) + 1;
    visitCounts.set(year, visit);
    return {
      id: newEntryId(),
      yearLabel: `${year} visit ${visit}`,
      hours: project.totalHours,
    };
  });
}

export function selectionSummary(
  projects: readonly DtoolsProject[],
  selectedKeys: ReadonlySet<string>,
  frequency?: 'Annual' | 'Semi-Annual',
  basis: 'visit' | 'annualized' = 'visit',
): LaborImportSummary['projects'] {
  const eligible = projects.filter(
    (project) =>
      selectedKeys.has(project.key) &&
      project.included &&
      project.effectiveYear !== null &&
      (frequency === undefined || project.effectiveFrequency === frequency),
  );
  const yearVisits = new Map<number, number>();
  for (const project of eligible) {
    const year = project.effectiveYear as number;
    yearVisits.set(year, (yearVisits.get(year) ?? 0) + 1);
  }
  const contributing =
    frequency === 'Semi-Annual' && basis === 'annualized'
      ? eligible.filter(
          (project) =>
            (yearVisits.get(project.effectiveYear as number) ?? 0) === 2,
        )
      : eligible;
  return contributing
    .sort((a, b) => (a.effectiveYear ?? 0) - (b.effectiveYear ?? 0))
    .map((project) => ({
      projectKey: project.key,
      projectName: project.projectName,
      projectNumber: project.projectNumber,
      year: project.effectiveYear as number,
      hours: project.totalHours,
      entryCount: project.source === 'job-cost' ? 0 : project.entries.filter((entry) => entry.included).length,
      frequency: project.effectiveFrequency ?? undefined,
      // Job-cost hours are not the sum of timesheet rows, so only timesheet-counted hours keep their rows.
      ...(project.source === 'job-cost'
        ? {
            hoursSource: 'job-cost' as const,
            ...(project.timesheetHours !== undefined ? { timesheetHours: project.timesheetHours } : {}),
          }
        : { entries: project.entries }),
    }));
}

export interface HistoryApplyPayload {
  clientName: string;
  siteLabel: string;
  frequency: 'Annual' | 'Semi-Annual';
  basis: string;
  entries: HistoricalHoursEntry[];
  summary: LaborImportSummary;
}

/**
 * Applies selected history to a renewal without touching manually entered
 * address, pricing, quoted hours, notes, SOW rules, or checklist state.
 */
export function applyHistoryToRenewal(
  renewal: Renewal,
  payload: HistoryApplyPayload,
  now = Date.now(),
): Renewal {
  const latestProject = payload.summary.projects[payload.summary.projects.length - 1];
  return {
    ...renewal,
    company: {
      ...renewal.company,
      clientName: payload.clientName,
      locationName: payload.siteLabel,
      inspectionFrequency: payload.frequency,
      dtoolsProjectNumber:
        renewal.company.dtoolsProjectNumber || latestProject?.projectNumber || '',
    },
    labor: {
      ...renewal.labor,
      source: 'imported',
      history: payload.entries,
      importSummary: payload.summary,
    },
    updatedAt: now,
  };
}
