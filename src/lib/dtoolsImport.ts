import {
  parseCsvTable,
  parseDtoolsTable,
  hasDtoolsHeaders,
  type ParsedDtoolsImport,
} from './dtools';
import { isJobCostHeader, mergeJobCostFiles, parseJobCostTable } from './jobCost';
import type { JobCostDataset, JobCostRecord } from '../types';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dataset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fingerprint(data: BufferSource): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

export interface DtoolsImportError {
  message: string;
}

export async function readDtoolsFile(
  file: File,
  importedAt = Date.now(),
): Promise<ParsedDtoolsImport> {
  const name = file.name || 'timesheet-export';
  const extension = name.split('.').pop()?.toLowerCase();
  const datasetId = newId();

  if (extension === 'csv') {
    const text = await file.text();
    const table = parseCsvTable(text);
    if (table.length === 0) throw new Error('The CSV file is empty.');
    return parseDtoolsTable({
      header: table[0],
      rows: table.slice(1),
      fileName: name,
      fileType: 'csv',
      sheetName: 'CSV',
      fingerprint: await fingerprint(new TextEncoder().encode(text)),
      datasetId,
      importedAt,
    });
  }

  if (extension === 'xlsx' || extension === 'xlsm' || extension === 'xls') {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true });
    const candidates: Array<{ sheetName: string; table: unknown[][]; headerIndex: number }> = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet['!ref']) continue;
      const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: '',
        blankrows: true,
        range: { s: { r: 0, c: 0 }, e: XLSX.utils.decode_range(sheet['!ref']).e },
      });
      const headerIndex = table.findIndex((row) => hasDtoolsHeaders(row));
      if (headerIndex >= 0) candidates.push({ sheetName, table, headerIndex });
    }
    if (candidates.length === 0) {
      throw new Error('No worksheet in that workbook contains the D-Tools timesheet columns.');
    }
    if (candidates.length > 1) {
      throw new Error('Multiple timesheet worksheets were found. Export a single timesheet worksheet to avoid silently omitting or duplicating labor.');
    }
    const { sheetName, table, headerIndex } = candidates[0];
    const sheet = workbook.Sheets[sheetName];
    const columns = table[headerIndex].map((cell) => String(cell).toLowerCase().replace(/[^a-z]/g, ''));
    for (let index = headerIndex + 1; index < table.length; index += 1) {
      for (let column = 0; column < columns.length; column += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: index, c: column })];
        if (!cell) continue;
        if (['duration', 'hours', 'laborhours'].includes(columns[column]) && cell.z && XLSX.SSF.is_date(cell.z)) {
          throw new Error(`Duration at ${sheetName}!${XLSX.utils.encode_cell({ r: index, c: column })} uses a date/time format. Export decimal hours before importing.`);
        }
        if (['date', 'workdate'].includes(columns[column]) && typeof cell.v === 'number' && workbook.Workbook?.WBProps?.date1904) {
          table[index][column] = cell.v + 1462;
        }
        if (['projectnumber', 'projectno', 'projectid', 'number', 'tasknumber'].includes(columns[column]) && cell.t === 'n') {
          table[index][column] = XLSX.utils.format_cell(cell);
        }
      }
    }
    return parseDtoolsTable({
      header: table[headerIndex],
      rows: table.slice(headerIndex + 1),
      sourceRows: table.slice(headerIndex + 1).map((_, index) => headerIndex + index + 2),
      fileName: name,
      fileType: 'xlsx',
      sheetName,
      fingerprint: await fingerprint(buffer),
      datasetId,
      importedAt,
    });
  }

  throw new Error('Choose a D-Tools .csv or .xlsx timesheet export.');
}

/**
 * Reads one or more "Project Job Cost (By Phase)" workbooks into a single
 * dataset that replaces the previous job-cost import.
 */
export async function readJobCostFiles(
  files: readonly File[],
  importedAt = Date.now(),
): Promise<{ dataset: JobCostDataset; records: JobCostRecord[]; warnings: string[] }> {
  if (files.length === 0) throw new Error('Choose at least one D-Tools job-cost workbook.');
  const XLSX = await import('xlsx');
  const datasetId = newId();
  const parsed: Array<{ fileName: string; sheetName: string; fingerprint: string; records: JobCostRecord[] }> = [];
  const warnings: string[] = [];
  for (const [fileIndex, file] of files.entries()) {
    const name = file.name || `job-cost-${fileIndex + 1}.xlsx`;
    if (!/\.(xlsx|xlsm|xls)$/i.test(name)) {
      throw new Error(`${name} is not an Excel workbook. Export Project Job Cost (By Phase) to Excel.`);
    }
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const candidates: Array<{ sheetName: string; table: unknown[][] }> = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet['!ref']) continue;
      const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
        range: { s: { r: 0, c: 0 }, e: XLSX.utils.decode_range(sheet['!ref']).e },
      });
      if (table.some((row) => isJobCostHeader(row))) candidates.push({ sheetName, table });
    }
    if (candidates.length === 0) {
      throw new Error(`${name} is not a D-Tools Project Job Cost (By Phase) export.`);
    }
    if (candidates.length > 1) {
      throw new Error(`${name} has several job-cost worksheets. Export a single worksheet.`);
    }
    const { sheetName, table } = candidates[0];
    const result = parseJobCostTable({
      table,
      fileName: name,
      sheetName,
      datasetId,
      fileIndex,
      date1904: Boolean(workbook.Workbook?.WBProps?.date1904),
    });
    warnings.push(...result.warnings);
    parsed.push({ fileName: name, sheetName, fingerprint: await fingerprint(buffer), records: result.records });
  }
  const merged = mergeJobCostFiles(datasetId, importedAt, parsed);
  return { ...merged, warnings: [...warnings, ...merged.warnings] };
}
