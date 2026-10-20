import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const field = (name) => page.getByLabel(name, { exact: true });
const disclosure = (name) => page.locator('summary').filter({ hasText: name }).first();
const screenshot = async (name) => {
  await page.waitForTimeout(200);
  await page.screenshot({ path: fileURLToPath(new URL(`../artifacts/layout/${name}.png`, import.meta.url)) });
};
try {
  await mkdir(new URL('../artifacts/layout/', import.meta.url), { recursive: true });
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
  await field('Import D-Tools timesheet export').setInputFiles(fileURLToPath(new URL('../src/lib/__fixtures__/dtools-observed.csv', import.meta.url)));
  await field('Search company, client, or location').waitFor();
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await field('Start with historical hours').waitFor();
  assert.equal(await field('Start with historical hours').isVisible(), true);
  assert.equal(await field('Proposed annual contract price').isVisible(), true);
  assert.equal(await field('Proposed quoted labor hours').isVisible(), true);
  assert.equal(await page.locator('details:not([open])').count(), 0);
  const orderedSections = ['Company & contract', 'Contract pricing', 'Historical hours & travel', 'SOW clause controls', 'Scope of work', 'Proposal email', 'Renewal process'];
  const summaries = await page.getByLabel('Renewal form', { exact: true }).locator(':scope > details > summary, :scope > div > details > summary').allTextContents();
  assert.equal(summaries.length, orderedSections.length);
  summaries.forEach((text, index) => assert.ok(text.trim().startsWith(orderedSections[index]), `Section ${index}: ${text}`));
  await field('Start with historical hours').fill('New Berlin');
  await page.getByRole('region', { name: 'Historical hours results' }).waitFor();
  assert.equal(await field('Company name').isVisible(), true);
  await page.getByRole('button', { name: 'Hide results', exact: true }).click();
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await field('Company name').fill('Layout review company');
  await field('Location name').fill('Sample location');
  await field('Full site address').fill('123 Main Street, Madison, WI 53703');
  await field('D-Tools project number').fill('26-1234');
  await field('Proposed quoted labor hours').fill('13');
  assert.equal(await field('Proposed annual contract price').inputValue(), '1290');
  await field('Proposed annual contract price').fill('1380');
  assert.equal(await field('Proposed quoted labor hours').inputValue(), '14');
  await page.getByLabel('Renewal workspace', { exact: true }).evaluate((node) => { node.scrollTop = 0; });
  await screenshot('desktop-workflow-order');
  await field('Annual mileage cost').fill('100');
  assert.equal(await field('Annual mileage charge').inputValue(), '120');
  await disclosure('More pricing details').click();
  await field('Labor rate per hour').fill('80');
  assert.equal(await disclosure('Contract pricing').locator('..').getByText('Labor rate under $90 — check with Mike before proceeding.', { exact: true }).isVisible(), true);
  await field('Labor rate per hour').fill('90');
  await disclosure('Company & contract').click();
  assert.match(await field('Email subject').inputValue(), /Sample location/);
  await page.locator('details input[type="checkbox"]').first().check();
  for (const name of orderedSections) {
    const summary = disclosure(name);
    if (await summary.locator('..').getAttribute('open') !== null) await summary.click();
    assert.equal(await summary.locator('..').getAttribute('open'), null);
    await summary.click();
    assert.equal(await summary.locator('..').getAttribute('open'), '');
  }
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('details').evaluateAll((nodes) => nodes.forEach((node) => { node.open = true; }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: horizontal overflow`);
    assert.equal(await field('Proposed quoted labor hours').count(), 1);
    if (width >= 1280) {
      const boxes = await Promise.all(orderedSections.slice(0, 6).map((name) => disclosure(name).locator('..').boundingBox()));
      const [company, pricing, history, controls, scope, email] = boxes;
      assert.equal(company.y, pricing.y);
      assert.equal(pricing.y, history.y);
      assert.ok(company.x < pricing.x && pricing.x < history.x);
      assert.equal(controls.x, company.x);
      assert.equal(controls.y, scope.y);
      assert.equal(scope.x, pricing.x);
      assert.ok(scope.width > pricing.width * 1.9);
      assert.ok(controls.y >= Math.max(company.y + company.height, pricing.y + pricing.height, history.y + history.height));
      assert.ok(email.y >= Math.max(controls.y + controls.height, scope.y + scope.height));
      const sidebar = await page.locator('aside').boundingBox();
      assert.equal(company.x - (sidebar.x + sidebar.width), 8);
      const overflow = await page.locator('.workspace-column').evaluateAll((columns) => columns.flatMap((column) => {
        const parent = column.getBoundingClientRect();
        return [...column.querySelectorAll('input, select, textarea, [role="group"]')].filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && (rect.left < parent.left || rect.right > parent.right + 1);
        }).map((node) => node.getAttribute('aria-label') || node.tagName);
      }));
      assert.deepEqual(overflow, [], `${width}: controls must fit inside their columns`);
      if (width === 1440) {
        await page.getByLabel('Renewal workspace', { exact: true }).evaluate((node) => { node.scrollTop = 0; });
        await screenshot('desktop-three-columns');
        await disclosure('SOW clause controls').scrollIntoViewIfNeeded();
        await screenshot('desktop-sow-row');
      }
    }
    await page.locator('details').evaluateAll((nodes) => nodes.forEach((node) => { node.open = false; }));
    if (width === 390) await screenshot('mobile-workflow-order');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await disclosure('Proposal email').focus();
  await page.keyboard.press('Enter');
  assert.equal(await field('Email subject').isVisible(), true);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await screenshot('desktop-dark-unified');
  await page.waitForTimeout(700);
  await page.reload();
  await field('Proposed quoted labor hours').waitFor();
  assert.equal(await field('Proposed quoted labor hours').inputValue(), '14');
  assert.equal(await field('Proposed annual contract price').inputValue(), '1380');
  assert.deepEqual(errors, []);
  console.log('PASS: three-column desktop placement, company aligned to sidebar, two-column SOW preview, email below, expanded defaults, collapse/reopen, history search, linked price/hours, keyboard, dark mode, reload, and 390–1440px layouts. No page errors.');
} finally {
  await browser.close();
}
