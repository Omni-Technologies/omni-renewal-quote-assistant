import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic renewals in a fresh browser context only; never run against a real profile.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const dir = mkdtempSync(join(tmpdir(), 'restore-merge-check-'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (error) => errors.push(error.message));
const field = (name) => page.getByLabel(name, { exact: true });
const companies = () => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('omni-renewal-quote');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const request = open.result.transaction('renewals').objectStore('renewals').getAll();
    request.onsuccess = () => resolve(request.result.map((renewal) => renewal.company.companyName).sort());
  };
}));
async function newRenewal(name) {
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await field('Company name').fill(name);
  await page.getByText(/^Saved \d/).waitFor();
}
try {
  await page.goto(process.env.PAGES_URL || 'http://127.0.0.1:5173');
  await newRenewal('Backup Only Co');
  await newRenewal('Shared Co');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup', exact: true }).click(),
  ]);
  const backupPath = join(dir, 'backup.json');
  await download.saveAs(backupPath);

  // Work done in this browser after the backup: edit one, delete one, add one.
  await field('Company name').fill('Shared Co edited here');
  await page.getByText(/^Saved \d/).waitFor();
  await newRenewal('Made Here Co');
  assert.deepEqual(await companies(), ['Backup Only Co', 'Made Here Co', 'Shared Co edited here']);
  await page.getByText('Backup Only Co').first().click();
  await page.getByRole('button', { name: 'Delete renewal', exact: true }).click();
  await page.getByRole('button', { name: 'Delete renewal', exact: true }).last().click();
  await page.waitForFunction(async () => !document.body.innerText.includes('Backup Only Co'));
  assert.deepEqual(await companies(), ['Made Here Co', 'Shared Co edited here']);

  await field('Restore backup file').setInputFiles(backupPath);
  await page.getByText('Restore data from backup?', { exact: true }).waitFor();
  await page.getByText(/never overwritten or removed/).waitFor();
  await page.getByRole('button', { name: 'Restore backup', exact: true }).last().click();
  await page.getByText(/Added 1 missing renewal from backup; kept 1 already in this browser unchanged/).waitFor();
  assert.deepEqual(await companies(), ['Backup Only Co', 'Made Here Co', 'Shared Co edited here']);
  await page.reload();
  await field('Company name').waitFor();
  assert.deepEqual(await companies(), ['Backup Only Co', 'Made Here Co', 'Shared Co edited here']);
  assert.deepEqual(errors, []);
  console.log('restore_merge_check passed');
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
