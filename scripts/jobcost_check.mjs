import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic job-cost workbook only; never point this at customer exports.
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PROJECT_HEADER = ['Client', 'Name', 'Number', 'Status', 'Start Date', 'Budgeted Hours', 'Actual Hours', 'Project Manager', 'Resources'];
const PHASE_HEADER = [null, 'Phase', 'Budgeted Hours', 'Actual Hours', 'Budgeted Labor Cost'];
const NAME = (year) => `I&T - FA Example Building Annual Fire Alarm Inspection ${year}`;
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
  ['Example Client', NAME(2026), '26-1000', 'Active', '3/2/2026', 15, 18, 'PM', ''],
  ['Example Client', NAME(2024), '24-1000', 'Completed', '4/1/2024', 13, 12, 'PM', ''],
  [],
  PHASE_HEADER,
  [null, 'Travel', 4, 3, 360],
  [null, 'Total:'],
  [null, null, 28, 30, 2520],
  ['Grand Total:', null, null, null, null, 42, 46.5],
];
const dir = mkdtempSync(join(tmpdir(), 'jobcost-check-'));
const workbookPath = join(dir, 'Project Job Cost (By Phase) - synthetic.xlsx');
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(table), 'Sheet1');
XLSX.writeFile(book, workbookPath);

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const field = (name) => page.getByLabel(name, { exact: true });
const statValue = (scope, label) => scope.locator('.stat').filter({ has: page.getByText(label, { exact: true }) }).locator('.stat-value');
try {
  await page.goto(process.env.PAGES_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
  await field('Import D-Tools project job-cost workbooks').setInputFiles(workbookPath);
  await statValue(page, 'Inspection projects').waitFor();
  assert.equal(await statValue(page, 'Projects').innerText(), '3');
  assert.equal(await statValue(page, 'Inspection projects').innerText(), '3');
  assert.match(await statValue(page, 'Avg budgeted').innerText(), /^14(\.0+)?\s*h? \(3\)$/);
  assert.match(await statValue(page, 'Avg actual').innerText(), /^15\.5\s*h? \(3\)$/);
  assert.match(await statValue(page, 'Avg travel budget').innerText(), /^2(\.0+)?\s*h? \(1\)$/);
  await page.getByRole('button', { name: 'Replace job-cost workbooks', exact: true }).waitFor();

  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await field('Company name').fill('Example Company');
  await field('D-Tools project number').fill('26-1000');
  await field('Proposed quoted labor hours').fill('13');
  await statValue(page, 'D-Tools avg budgeted hrs').waitFor();
  assert.match(await statValue(page, 'D-Tools avg budgeted hrs').innerText(), /\(3\)$/);
  assert.match(await statValue(page, 'D-Tools avg actual hrs').innerText(), /^15\.5/);
  assert.match(await statValue(page, 'D-Tools avg travel (budget)').innerText(), /\(1\)$/);
  assert.equal(await field('Proposed annual contract price').inputValue(), '1290', 'Pricing math unchanged');
  const labor = page.locator('table').filter({ hasText: '25-1000' });
  await labor.waitFor();
  for (const number of ['24-1000', '25-1000', '26-1000']) assert.match(await labor.innerText(), new RegExp(number));
  assert.match(await labor.innerText(), /Shared/);

  await field('D-Tools project number').fill('99-9999');
  await page.getByText('No D-Tools job-cost projects match this site and frequency.', { exact: true }).waitFor();
  assert.equal(await labor.count(), 0);

  await page.setViewportSize({ width: 390, height: 900 });
  await field('D-Tools project number').fill('26-1000');
  await labor.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No page-level horizontal scroll at 390px');

  await page.waitForTimeout(700);
  await page.reload();
  await statValue(page, 'D-Tools avg actual hrs').waitFor();
  assert.match(await statValue(page, 'D-Tools avg actual hrs').innerText(), /^15\.5/);
  assert.deepEqual(errors, []);
  console.log('jobcost_check passed');
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
