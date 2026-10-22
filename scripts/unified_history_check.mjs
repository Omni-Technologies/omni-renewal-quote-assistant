import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic timesheet CSV and job-cost workbook only; never point this at customer exports.
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const NAME = (year) => `I&T - FA Example Building Annual Fire Alarm Inspection ${year}`;
const PROJECT_HEADER = ['Client', 'Name', 'Number', 'Status', 'Start Date', 'Budgeted Hours', 'Actual Hours', 'Project Manager', 'Resources'];
const PHASE_HEADER = [null, 'Phase', 'Budgeted Hours', 'Actual Hours', 'Budgeted Labor Cost'];
const table = [
  ['Project Job Cost (By Phase)'],
  PROJECT_HEADER,
  ['Example Client', NAME(2025), '25-1000', 'Completed', '5/1/2025', 14, 16.5, 'PM', 'Inspector 1'],
  [],
  PHASE_HEADER,
  [null, 'Labor', 12, 15, 1080],
  [null, 'Travel', 2, 1.5, 180],
  [null, 'Total:'],
  [null, null, 14, 16.5, 1260],
  PROJECT_HEADER,
  ['Example Client', NAME(2026), '26-1000', 'Completed', '3/2/2026', 15, 18, 'PM', ''],
  ['Example Client', NAME(2024), '24-1000', 'Completed', '4/1/2024', 13, 12, 'PM', ''],
  ['Example Client', NAME(2023), '23-1000', 'Completed', '4/1/2023', 13, 11, 'PM', ''],
  [],
  PHASE_HEADER,
  [null, 'Travel', 4, 3, 360],
  [null, 'Total:'],
  [null, null, 41, 41, 2520],
  ['Grand Total:', null, null, null, null, 55, 57.5],
];
const header = [
  'Approved', 'Entity', 'Date', 'Resource', 'Resource Email', 'Client Name', 'Project Name', 'Project Number',
  'Project Manager', 'Name', 'Number', 'Duration', 'Created On', 'Updated On', 'Updated By',
];
const timesheetRows = [
  { year: 2025, number: '25-1000', hours: '9' },
  { year: 2025, number: '25-1000', hours: '7.5' },
  { year: 2026, number: '26-1000', hours: '17' },
].map((entry, index) => [
  'True', 'Task', `5/1/${entry.year}`, `Inspector ${index + 1}`, `i${index + 1}@example.com`, 'Example Client',
  NAME(entry.year), entry.number, 'PM', NAME(entry.year), `7500${index}`, entry.hours, `5/2/${entry.year}`,
  `5/2/${entry.year}`, `Inspector ${index + 1}`,
]);
const csv = [header, ...timesheetRows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

const dir = mkdtempSync(join(tmpdir(), 'unified-history-check-'));
const csvPath = join(dir, 'Time Sheets synthetic.csv');
writeFileSync(csvPath, csv);
const workbookPath = join(dir, 'Project Job Cost (By Phase) - synthetic.xlsx');
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(table), 'Sheet1');
XLSX.writeFile(book, workbookPath);

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const errors = [];
let page;
const field = (name) => page.getByLabel(name, { exact: true });
const include = (year) => field(`Include ${NAME(year)} in the average`);
const row = (number) => page.locator('tr').filter({ has: page.getByText(number, { exact: true }) }).first();
// Each run gets a fresh browser context, so IndexedDB starts empty.
async function openHistory() {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.PAGES_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
}
async function applySelection(expectedYears) {
  await page.getByRole('button', { name: 'Use These Hours for Renewal', exact: true }).click();
  await page.getByRole('button', { name: 'Apply to renewal', exact: true }).click();
  await field('Proposed quoted labor hours').waitFor();
  const applied = page.getByLabel(/^Inspection hours for /);
  assert.equal(await applied.count(), expectedYears, `${expectedYears} selected years applied`);
  return Promise.all(Array.from({ length: expectedYears }, (_, index) => applied.nth(index).inputValue()));
}
try {
  // Job-cost workbooks alone must give a complete, usable history.
  await openHistory();
  await field('Import D-Tools project job-cost workbooks').setInputFiles(workbookPath);
  await field('Search company, client, or location').fill('Example');
  const onlySite = page.getByRole('button').filter({ hasText: 'Example Building' });
  await onlySite.first().waitFor();
  await onlySite.click();
  for (const year of [2026, 2025, 2024, 2023]) await include(year).waitFor();
  for (const number of ['26-1000', '25-1000', '24-1000']) assert.match(await row(number).innerText(), /D-Tools .* · start /);
  await page.getByText('Budgeted vs actual hours (D-Tools job cost)').waitFor();
  const onlyHours = await applySelection(3);
  assert.deepEqual([...onlyHours].sort(), ['12', '16.5', '18'], 'Job-cost-only apply uses job-cost actual hours');
  assert.match(await page.locator('body').innerText(), /D-Tools job-cost actual hours/);
  await page.close();

  await openHistory();
  await field('Import D-Tools timesheet export').setInputFiles(csvPath);
  await field('Search company, client, or location').waitFor();
  await field('Import D-Tools project job-cost workbooks').setInputFiles(workbookPath);
  await page.getByRole('button', { name: 'Replace job-cost workbooks', exact: true }).waitFor();
  await field('Search company, client, or location').fill('Example');
  const site = page.getByRole('button').filter({ hasText: 'Example Building' });
  await site.first().waitFor();
  assert.equal(await site.count(), 1, 'Timesheet and job-cost years share one site');
  await site.click();

  for (const year of [2026, 2025, 2024, 2023]) await include(year).waitFor();
  for (const year of [2026, 2025, 2024]) assert.equal(await include(year).isChecked(), true, `${year} selected by default`);
  assert.equal(await include(2023).isChecked(), false, 'Older year visible but unselected');
  assert.match(await row('24-1000').innerText(), /D-Tools .* · start /);
  assert.match(await row('23-1000').innerText(), /D-Tools .* · start /);
  // Original layout: no source/budgeted columns; job-cost hours replace timesheet totals.
  assert.equal(await page.getByRole('columnheader', { name: 'Source', exact: true }).count(), 0);
  assert.match(await row('26-1000').innerText(), /\t18 h\t/);
  assert.doesNotMatch(await row('26-1000').innerText(), /timesheet/i);
  assert.match(await row('25-1000').innerText(), /\t16\.5 h\t/);
  await page.getByText('Budgeted vs actual hours (D-Tools job cost)').waitFor();

  await include(2023).click();
  await page.waitForFunction((label) => document.querySelector(`input[aria-label="${label}"]`)?.checked, `Include ${NAME(2023)} in the average`);
  const bothHours = await applySelection(4);
  assert.deepEqual([...bothHours].sort(), ['11', '12', '16.5', '18'], 'Job-cost actual hours win over timesheet totals');
  assert.match(await page.locator('body').innerText(), /D-Tools job-cost actual hours/);
  assert.deepEqual(errors, []);
  console.log('unified_history_check passed');
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
