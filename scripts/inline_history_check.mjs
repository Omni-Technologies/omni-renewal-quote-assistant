import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const field = (name) => page.getByLabel(name, { exact: true });
const results = page.getByRole('region', { name: 'Historical hours results' });
try {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
  await field('Import D-Tools timesheet export').setInputFiles(fileURLToPath(new URL('../Time Sheets Oct 19, 2026 02 57.csv', import.meta.url)));
  await field('Search company, client, or location').waitFor();
  const historySearch = field('Search company, client, or location');
  await historySearch.fill('East Madison Toyota');
  const toyota = page.getByRole('button').filter({ hasText: 'PAG Madison T1 dba East Madison Toyota' });
  await toyota.waitFor();
  assert.equal(await toyota.count(), 1);
  await toyota.click();
  for (const number of ['23-0214', '24-0156', '24-1792', '26-0593']) {
    await page.getByText(number, { exact: true }).waitFor();
  }
  await page.evaluate(async () => {
    const { db } = await import('/src/lib/db.ts');
    await db.dtoolsRows.toCollection().modify((row) => {
      if (/East Madison Toyota/.test(row.projectName)) row.siteKey = `old::${row.projectNumber}`;
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
  await historySearch.fill('East Madison Toyota');
  await toyota.waitFor();
  assert.equal(await toyota.count(), 1);
  await toyota.click();
  for (const number of ['23-0214', '24-0156', '24-1792', '26-0593']) {
    await page.getByText(number, { exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await field('Company name').fill('Keep company');
  await field('Full site address').fill('123 Main Street, Madison, WI 53703');
  await field('Proposed quoted labor hours').fill('13');
  await field('Notes about pricing changes').fill('Keep pricing notes');
  await field('Start with historical hours').fill('New Ber');
  const site = results.getByRole('button').filter({ hasText: /UW Credit Union/ }).filter({ hasText: /New Berlin/ });
  await site.waitFor();
  assert.equal(await site.count(), 1);
  assert.equal(await field('Company name').isVisible(), true);
  assert.equal(await page.getByRole('heading', { name: 'Historical Hours', exact: true }).isVisible(), false);
  await site.click();
  const apply = results.getByRole('button', { name: 'Use These Hours for Renewal', exact: true });
  await apply.waitFor();
  for (const number of ['23-0519', '24-0186', '24-2222', '25-0942']) assert.match(await results.innerText(), new RegExp(number));
  await field('Start with historical hours').fill('zzzz-no-such-site');
  assert.equal(await apply.isVisible(), false, 'Changing to an unrelated search hides the previous site apply action');
  await field('Start with historical hours').fill('New Berlin');
  await site.click();
  await apply.click();
  await page.getByRole('button', { name: 'Apply to renewal', exact: true }).click();
  await results.waitFor({ state: 'detached' });
  assert.match(await field('Location name').inputValue(), /New Berlin/);
  assert.equal(await field('Company name').inputValue(), 'Keep company');
  assert.equal(await field('Full site address').inputValue(), '123 Main Street, Madison, WI 53703');
  assert.equal(await field('Proposed quoted labor hours').inputValue(), '13');
  assert.equal(await field('Proposed annual contract price').inputValue(), '1290');
  assert.equal(await field('Notes about pricing changes').inputValue(), 'Keep pricing notes');
  assert.ok(await page.getByLabel(/^Inspection hours for /).count() > 0);
  await field('Start with historical hours').fill('Dance Studio 3-D');
  await results.getByRole('button').filter({ hasText: 'Dance Studio 3-D' }).first().waitFor();
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await field('Start with historical hours').press('Escape');
  assert.equal(await results.isVisible(), false);
  await page.waitForTimeout(700);
  await page.reload();
  await field('Location name').waitFor();
  assert.match(await field('Location name').inputValue(), /New Berlin/);
  assert.equal(await field('Proposed annual contract price').inputValue(), '1290');
  assert.deepEqual(errors, []);
  const duplicatePage = await browser.newPage();
  duplicatePage.on('pageerror', (error) => errors.push(error.message));
  await duplicatePage.goto('http://127.0.0.1:5173');
  await duplicatePage.getByRole('button', { name: 'Historical Hours', exact: true }).click();
  const csv = [
    'Approved,Date,Resource,Client Name,Project Name,Project Number,Name,Number,Duration',
    ...Array.from({ length: 45 }, (_, index) => `True,10/16/2026,Inspector,Client ${String(index).padStart(2, '0')},I&T - FA Main Office Annual Fire Alarm Inspection 2026,26-${index},Inspection,${index},4`),
  ].join('\n');
  await duplicatePage.getByLabel('Import D-Tools timesheet export', { exact: true }).setInputFiles({ name: 'duplicate-sites.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await duplicatePage.getByLabel('Search company, client, or location', { exact: true }).waitFor();
  await duplicatePage.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await duplicatePage.getByLabel('Start with historical hours', { exact: true }).fill('Client 44');
  const duplicateResults = duplicatePage.getByRole('region', { name: 'Historical hours results' });
  await duplicateResults.getByRole('button').filter({ hasText: 'Client 44' }).click();
  await duplicateResults.getByRole('button', { name: 'Use These Hours for Renewal', exact: true }).waitFor();
  assert.equal(await duplicatePage.getByLabel('Start with historical hours', { exact: true }).inputValue(), 'Main Office');
  assert.deepEqual(errors, []);
  await duplicatePage.close();
  console.log('PASS: East Madison Toyota 2023–2026 grouping and saved-import refresh, live inline filtering, site selection, source history, stale-selection guard, confirmed apply without navigation, preserved manual fields, narrow layout, dismissal and saved reload. No page errors.');
} finally {
  await browser.close();
}
