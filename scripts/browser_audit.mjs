import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'audit');
await mkdir(out, { recursive: true });
const source = path.join(root, 'Time Sheets Oct 19, 2026 02 57.csv');
const profilePath = await mkdtemp(path.join(out, 'browser-profile-'));
const browserOptions = { headless: true, viewport: { width: 1600, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
let context = await chromium.launchPersistentContext(profilePath, browserOptions);
let page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [], external = [], results = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (!/^https?:\/\/127\.0\.0\.1:5173\//.test(request.url()) && !request.url().startsWith('blob:')) external.push(request.url()); });
async function step(name, action) {
  const start = performance.now();
  await action();
  const result = { name, ms: Math.round(performance.now() - start), passed: true };
  results.push(result); console.log(`PASS ${name} (${result.ms} ms)`);
}
const body = () => page.locator('body').innerText();
const label = (name) => page.getByLabel(name, { exact: true });
const renewal = () => page.evaluate(async () => (await import('/src/lib/db.ts')).listRenewals().then((items) => items[0]));
const stat = (name) => page.locator('.stat').filter({ has: page.getByText(name, { exact: true }) }).locator('.stat-value').innerText();
let backupPath, metrics, entered;
try {
  await page.goto('http://127.0.0.1:5173');
  await step('Create renewal with manual data', async () => {
    await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
    for (const [name, value] of Object.entries({ 'Company name': 'QA preserved company', 'Client name': 'QA original client', 'Location name': 'QA original location', 'Full site address': '123 QA Street', 'Site city': 'Madison', 'Special company quoting notes': 'Preserve customer instructions', 'Internal renewal notes': 'Preserve internal notes', 'Proposed annual contract price': '9500', 'Proposed quoted labor hours': '17', 'Labor rate per hour': '89' })) await label(name).fill(value);
    await label('Contract start year').fill('2027');
    await label('Contract duration in years').fill('3');
    assert.match(await body(), /Mike/);
    entered = { price: await label('Proposed annual contract price').inputValue(), hours: await label('Proposed quoted labor hours').inputValue() };
    assert.deepEqual(entered, { price: '1693', hours: '17' });
  });
  await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
  await step('Import all original 6,380 source rows', async () => {
    await label('Import D-Tools timesheet export').setInputFiles(source);
    await page.getByText('6,380', { exact: true }).first().waitFor();
    assert.equal(await stat('Rows imported'), '6,380');
    assert.equal(await stat('Unique projects'), '1,153');
    metrics = await page.evaluate(async () => {
      const { loadDtoolsHistory } = await import('/src/lib/db.ts');
      const { buildProjects, buildSiteSummaries } = await import('/src/lib/dtools.ts');
      const snapshot = await loadDtoolsHistory();
      const projects = buildProjects(snapshot.rows);
      return { dataset: snapshot.dataset, sites: buildSiteSummaries(projects).length, includedProjects: projects.filter((p) => p.included).length, includedAnnualHours: projects.filter((p) => p.included && p.effectiveFrequency === 'Annual').reduce((sum, p) => sum + p.totalHours, 0), includedSemiHours: projects.filter((p) => p.included && p.effectiveFrequency === 'Semi-Annual').reduce((sum, p) => sum + p.totalHours, 0), reviewHours: projects.filter((p) => p.classification === 'review').reduce((sum, p) => sum + p.totalHours, 0) };
    });
  });
  await step('Duplicate import leaves totals unchanged', async () => {
    await label('Import D-Tools timesheet export').setInputFiles(source);
    await page.getByRole('button', { name: 'Replace dataset', exact: true }).last().click();
    await page.getByText(/That exact timesheet file is already imported/).waitFor();
    assert.equal(await stat('Rows imported'), '6,380');
  });
  await step('A malformed import preserves the existing full dataset', async () => {
    await label('Import D-Tools timesheet export').setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('Approved,Duration\nTrue,"unfinished') });
    await page.getByRole('button', { name: 'Replace dataset', exact: true }).last().click();
    await page.getByText(/unterminated quoted field/).first().waitFor();
    assert.equal(await stat('Rows imported'), '6,380');
  });
  await step('Search original project text with case and punctuation', async () => {
    await label('Search company, client, or location').fill('i&t - fa DECADE annual 2026');
    await page.getByRole('button').filter({ hasText: 'Decade Properties' }).first().click();
    await page.getByText('Average per inspection', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Expand project details' }).first().click();
    assert.match(await body(), /0\.46666667 h/);
    assert.match(await body(), /David McKaig/);
    assert.match(await body(), /Matt Fedosky/);
    assert.match(await body(), /25-1179/);
  });
  await step('Manual project exclusion persists and can be reset', async () => {
    const decision = page.getByRole('combobox', { name: /^Manual decision for/ }).first();
    const name = await decision.getAttribute('aria-label');
    await decision.selectOption('exclude');
    await page.getByText(/manual exclude/).first().waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
    await label('Search company, client, or location').fill('i&t - fa DECADE annual 2026');
    await page.getByRole('button').filter({ hasText: 'Decade Properties' }).first().click();
    await page.getByRole('button', { name: 'Expand project details' }).first().click();
    assert.equal(await label(name).inputValue(), 'exclude');
    await label(name).selectOption('auto');
    await page.waitForFunction((name) => document.querySelector(`select[aria-label="${name}"]`)?.value === 'auto', name);
  });
  await step('Parent client exposes separate selectable locations', async () => {
    await label('Search company, client, or location').fill('SSM');
    const buttons = page.getByRole('button').filter({ hasText: 'SSM Health' });
    assert.ok(await buttons.count() > 1);
    await label('Search company, client, or location').fill('Cedar Crest Existing Campus');
    await page.getByRole('button').filter({ hasText: 'Cedar Crest Existing Campus/RCAC' }).first().click();
  });
  await step('Annual and Semi-Annual controls keep projects separate', async () => {
    const all = await body(); assert.match(all, /Annual Fire Alarm Inspection 2026/);
    const group = page.getByRole('group', { name: 'Inspection frequency for this site', exact: true });
    await group.getByRole('button', { name: 'Semi-Annual', exact: true }).click();
    await page.getByText('Average per visit', { exact: true }).waitFor();
    assert.match(await body(), /Semi Annual Fire Alarm Inspection 2026/);
    assert.match(await body(), /Selected hours by calendar year/i);
    await group.getByRole('button', { name: 'Annual', exact: true }).click();
  });
  await step('Selection changes average and persists after refresh', async () => {
    const boxes = page.getByRole('checkbox', { name: /in the average$/ });
    const selected = boxes;
    const before = await stat('Selected occurrences');
    const first = selected.first(); const name = await first.getAttribute('aria-label');
    assert.equal(await first.isChecked(), true);
    await first.click();
    await page.waitForFunction((expected) => [...document.querySelectorAll('.stat')].find((node) => node.textContent.toLowerCase().includes('selected occurrences'))?.querySelector('.stat-value')?.textContent !== expected, before, { timeout: 8000 });
    const after = await stat('Selected occurrences');
    await page.reload();
    await page.getByRole('button', { name: 'Historical Hours', exact: true }).click();
    await label('Search company, client, or location').fill('Cedar Crest Existing Campus');
    await page.getByRole('button').filter({ hasText: 'Cedar Crest Existing Campus/RCAC' }).first().click();
    assert.equal(await label(name).isChecked(), false);
    assert.equal(await stat('Selected occurrences'), after);
    await label(name).click();
    await page.waitForFunction((name) => [...document.querySelectorAll('input[type=checkbox]')].find((node) => node.getAttribute('aria-label') === name)?.checked === true, name, { timeout: 8000 });
  });
  let selectedAverage;
  await step('Apply historical hours preserves address, notes, pricing and manual proposed hours', async () => {
    selectedAverage = await stat('Average per inspection');
    await page.getByRole('button', { name: 'Use These Hours for Renewal' }).click();
    await page.getByRole('button', { name: 'Apply to renewal', exact: true }).click();
    await label('Company name').waitFor();
    assert.equal(await label('Company name').inputValue(), 'QA preserved company');
    assert.equal(await label('Full site address').inputValue(), '123 QA Street');
    assert.equal(await label('Special company quoting notes').inputValue(), 'Preserve customer instructions');
    assert.equal(await label('Internal renewal notes').inputValue(), 'Preserve internal notes');
    assert.equal(await label('Proposed annual contract price').inputValue(), entered.price);
    assert.equal(await label('Proposed quoted labor hours').inputValue(), entered.hours);
    assert.equal(await stat('Historical average'), selectedAverage);
    assert.match(await body(), /\$150\.00/);
    await page.locator('summary').filter({ hasText: /\d h actual$/ }).first().click();
    assert.match(await body(), /Source \/ sheet \/ row/);
  });
  await step('Override hours, generate and copy plain-text SOW; route to Julie', async () => {
    await label('Proposed quoted labor hours').fill('8');
    await label('Labor rate per hour').fill('90');
    await page.getByRole('button', { name: 'Copy Scope of Work', exact: true }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(text, /\n•/); assert.match(text, /Contract End Date: 12\/31\/2029/);
    assert.match(text, /Cedar Crest Existing Campus\/RCAC located at 123 QA Street/);
    assert.match(text, /billed after completion of annual inspection/i); assert.doesNotMatch(text, /<[^>]+>/);
    await label('Renewal status').selectOption('Ready for Julie Review');
    assert.match(await body(), /Julie/);
    await label('Proposed quoted labor hours').fill('19');
    assert.match(await body(), /\$150\.00/);
  });
  await step('Save, autosave, checklist and reload retain renewal snapshot', async () => {
    const checklist = page.locator('details').filter({ has: page.getByRole('heading', { name: 'Renewal process', exact: true }) });
    if (!(await checklist.evaluate((element) => element.open))) await checklist.locator('summary').click();
    await checklist.getByRole('checkbox').first().check();
    await page.getByText(/^Saved \d/).waitFor();
    assert.equal((await renewal()).labor.quotedHours, 19);
    assert.ok(Object.values((await renewal()).checklist).some(Boolean));
    await page.reload(); await label('Company name').waitFor();
    assert.equal(await label('Proposed quoted labor hours').inputValue(), '19');
    assert.equal(await label('Renewal status').inputValue(), 'Ready for Julie Review');
    const record = await renewal(); assert.ok(record.labor.importSummary.projects[0].entries.length > 0);
    assert.ok(Object.values(record.checklist).some(Boolean));
  });
  await step('JSON backup includes source rows and decisions; duplicate/delete and restore work', async () => {
    const [file] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.getByRole('button', { name: 'Export backup', exact: true }).click(),
    ]);
    const chunks = []; for await (const chunk of await file.createReadStream()) chunks.push(chunk);
    const content = Buffer.concat(chunks);
    backupPath = path.join(out, 'verified-backup.json'); await writeFile(backupPath, content);
    const backup = JSON.parse(content.toString('utf8'));
    assert.equal(backup.version, 2); assert.equal(backup.dtools.rows.length, 6380);
    assert.ok(backup.dtools.decisions.length > 0);
    await page.getByRole('button', { name: 'Duplicate renewal', exact: true }).click();
    await page.getByRole('button', { name: 'Delete renewal', exact: true }).click();
    await page.getByRole('button', { name: 'Delete renewal', exact: true }).last().click();
    await label('Restore backup file').setInputFiles(backupPath);
    await page.getByText('Restore data from backup?', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Restore backup', exact: true }).last().click();
    await page.getByText(/Added 0 missing renewals from backup; kept 1 already in this browser/).waitFor({ timeout: 30000 });
    assert.equal((await renewal()).labor.importSummary.projects[0].entries.length, backup.renewals[0].labor.importSummary.projects[0].entries.length);
  });
  await step('Browser restart retains source history, decisions, and the saved renewal', async () => {
    await page.getByText(/^Saved \d/).waitFor();
    await context.close();
    context = await chromium.launchPersistentContext(profilePath, browserOptions);
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (!/^https?:\/\/127\.0\.0\.1:5173\//.test(request.url()) && !request.url().startsWith('blob:')) external.push(request.url()); });
    await page.goto('http://127.0.0.1:5173');
    await label('Company name').waitFor();
    assert.equal(await label('Proposed quoted labor hours').inputValue(), '19');
    const snapshot = await page.evaluate(async () => (await import('/src/lib/db.ts')).loadDtoolsHistory());
    assert.equal(snapshot.rows.length, 6380); assert.ok(snapshot.decisions.length > 0);
    assert.ok((await renewal()).labor.importSummary.projects[0].entries.length > 0);
  });
  const session = await context.newCDPSession(page);
  const heap = await session.send('Runtime.getHeapUsage');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await page.screenshot({ path: path.join(out, 'verified-browser.png'), fullPage: true });
  await writeFile(path.join(out, 'browser-verification.json'), JSON.stringify({ results, metrics, heap, errors, external }, null, 2));
  console.log(JSON.stringify({ metrics, heap, errors, external }));
} catch (error) {
  await writeFile(path.join(out, 'browser-failure.txt'), `${error.stack}\n\n${await body()}`);
  await page.screenshot({ path: path.join(out, 'browser-failure.png'), fullPage: true });
  throw error;
} finally { await context.close(); }
