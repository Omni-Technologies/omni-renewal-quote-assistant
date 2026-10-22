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
// CLOUD=1 checks the hosted build on `npm run dev:cloud` (empty local D1), reading the API.
const companies = () => process.env.CLOUD ? page.evaluate(async () =>
  (await (await fetch('/api/renewals')).json()).map((renewal) => renewal.company.companyName).sort(),
) : page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('omni-renewal-quote');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const request = open.result.transaction('renewals').objectStore('renewals').getAll();
    request.onsuccess = () => resolve(request.result.map((renewal) => renewal.company.companyName).sort());
  };
}));
// Waits on stored state: cloud creates and saves take a network round trip.
async function until(check) {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  throw new Error('Timed out waiting for saved state');
}
async function rename(name) {
  await field('Company name').fill(name);
  await until(async () => (await companies()).includes(name));
}
async function newRenewal(name) {
  const count = (await companies()).length;
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await until(async () => (await companies()).length === count + 1);
  await until(async () => (await field('Company name').inputValue()) === '');
  await rename(name);
}
try {
  await page.goto(process.env.PAGES_URL || (process.env.CLOUD ? 'http://127.0.0.1:8799' : 'http://127.0.0.1:5173'));
  await newRenewal('Backup Only Co');
  await newRenewal('Shared Co');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup', exact: true }).click(),
  ]);
  const backupPath = join(dir, 'backup.json');
  await download.saveAs(backupPath);

  // Work done in this browser after the backup: edit one, delete one, add one.
  await rename('Shared Co edited here');
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
  await page.getByText(/Added 1 missing renewal from backup; kept 1 already in (this browser|the online database) unchanged/).waitFor();
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
