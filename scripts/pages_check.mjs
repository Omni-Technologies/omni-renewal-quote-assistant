import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage();
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('response', (response) => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  const url = process.env.PAGES_URL || 'http://127.0.0.1:4173/omni-renewal-quote-assistant/';
  await page.goto(url);
  const logos = page.getByRole('img', { name: 'OMNI Technologies logo', exact: true });
  await logos.nth(1).waitFor();
  await logos.evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  assert.equal(await logos.count(), 2);
  assert.equal(await logos.evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), true);
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  assert.equal(new URL(icon, url).pathname, `${new URL(url).pathname}omni-logo.png`);
  assert.equal((await page.request.get(new URL(icon, url).href)).status(), 200);
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await page.getByLabel('Company name', { exact: true }).fill('Pages smoke test');
  await page.getByLabel('Proposed quoted labor hours', { exact: true }).fill('13');
  assert.equal(await page.getByLabel('Proposed annual contract price', { exact: true }).inputValue(), '1290');
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByLabel('Company name', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Company name', { exact: true }).inputValue(), 'Pages smoke test');
  assert.equal(await page.getByLabel('Proposed annual contract price', { exact: true }).inputValue(), '1290');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  console.log(`PASS: ${url} loads compiled assets and OMNI logos/favicon, creates a renewal, links price/hours and saves across reload. No page or request errors.`);
} finally {
  await browser.close();
}
