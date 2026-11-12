import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const field = (name) => page.getByLabel(name, { exact: true });
  const preview = async () => (await page.locator('pre').innerText()).replace(/\r\n/g, '\n');
  const copyButton = page.getByRole('button', { name: 'Copy Scope of Work', exact: true });

  await page.goto(process.env.PAGES_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  await field('Company name').fill('Example company');
  await field('Location name').fill('Example branch');
  await field('Full site address').fill('1 Test Rd, Madison, WI 53703');
  await field('Contract start year').fill('2027');
  await field('Contract duration in years').fill('3');
  await field('Proposed quoted labor hours').fill('8');

  assert.equal(await field('SOW template').inputValue(), 'standard');
  assert.equal(await field('SOW inspections included').inputValue(), 'Annual');
  await page.getByRole('group', { name: 'Healthcare or hospital location', exact: true }).waitFor();
  let text = await preview();
  assert.match(text, /^Omni Technologies is pleased to present the following 3-Year proposal for Annual Fire Alarm System Inspections and Testing for Example company\.\n\nLocation\(s\) Included:\n•Example branch – located at 1 Test Rd, Madison, WI 53703\.\n\nDescription of Work:\n/);
  assert.match(text, /\n•Includes AHJ test report submission fee for uploading test documentation to City of Madison\.\n/);
  assert.match(text, /\n•The amount listed will be billed after completion of the inspection\(s\) each year for the duration of this contract\.\n/);
  assert.doesNotMatch(text, /40% deposit/);
  assert.match(text, /\n\nContract End Date: 12\/31\/2029$/);
  assert.equal(await copyButton.isEnabled(), true, 'Complete standard SOW can be copied');

  await field('SOW inspections included').selectOption('Annual and Semi-Annual');
  text = await preview();
  assert.match(text, /proposal for Annual and Semi-Annual Fire Alarm System Inspections and Testing/);
  assert.match(text, /•Provide one annual inspection and one semi-annual inspection in accordance with applicable state and local codes each year for the duration of this contract\./);

  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  assert.match(await preview(), /\n•\(INSERT LOCATION NAME\) – located at \(INSERT FULL ADDRESS\)\.\n/);
  assert.equal(await copyButton.isEnabled(), false, 'Blank additional location blocks copy');
  await field('Additional location 2 name').fill('Example annex');
  await field('Additional location 2 full address').fill('2 Annex Rd, Verona, WI 53593');
  assert.match(await preview(), /•Example branch – located at 1 Test Rd, Madison, WI 53703\.\n•Example annex – located at 2 Annex Rd, Verona, WI 53593\.\n\nDescription of Work:/);
  assert.equal(await copyButton.isEnabled(), true);

  await field('Proposed annual contract price').fill('12000');
  assert.match(await preview(), /each year for the duration of this contract\.\n•A 40% deposit is required upon acceptance of this proposal to initiate scheduling\.\n/);

  await field('SOW template').selectOption('standard-warranty');
  text = await preview();
  assert.match(text, /Example company\.\n\nExtended Parts Warranty Included: At no additional cost, eligible Edwards fire alarm components qualify for a manufacturer’s parts warranty .* Coverage is subject to Edwards’ approval and warranty terms\. Warranty certificate is available upon request\.\n\nLocation\(s\) Included:\n/);

  await field('SOW template').selectOption('meriter');
  text = await preview();
  assert.equal(text, [
    'Omni Technologies is pleased to present the following three-year proposal for the Annual & Semi-Annual Fire Alarm System Inspection and Tests, and Monitoring for the Meriter Example branch located at 1 Test Rd, Madison, WI 53703.',
    '',
    'Annual & Semi-Annual Inspections Description of Work:',
    '',
    '•Provide one annual inspection and test and one semi-annual inspection at each location listed within this proposal in accordance with the state and local codes.',
    '•A complete NFPA test report will be provided upon completion. All devices will be bar coded and logged with the Building Reports system.',
    '•Detector cleaning will be provided as necessary.',
    '',
    'Notes:',
    '•Work shall be performed during normal business hours. Omni Technologies will schedule the dates of the inspection at least two weeks prior to the inspection.',
    '•Coordination and fees associated with the elevator company, if there are devices in the shaft to be tested, are the responsibility of the owner.',
    '',
    'Monitoring Description of Work:',
    '',
    '•Provide 3 years of 24/7/365 off-site monitoring for the fire alarm system at the Meriter Example branch, as listed within the proposal.',
    '',
    'Contract Dates: July 1, 2027 – June 30, 2030',
    '',
    '*INSERT CHART - SEE PREVIOUS MERITER PROPOSALS]*',
  ].join('\n'));
  assert.equal(await field('SOW inspections included').isDisabled(), true);
  assert.equal(await page.getByText('Billing language', { exact: true }).count(), 0);
  await page.getByText(/ends with the INSERT CHART placeholder — add the chart/).waitFor();

  await copyButton.click();
  await page.getByText('Scope of Work copied — paste into D-Tools Text Format.', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), text);

  await page.waitForTimeout(700);
  await page.reload();
  await field('SOW template').waitFor();
  assert.equal(await field('SOW template').inputValue(), 'meriter');
  assert.equal(await field('Additional location 2 name').inputValue(), 'Example annex');
  await field('SOW template').selectOption('standard');
  assert.equal(await field('SOW inspections included').inputValue(), 'Annual and Semi-Annual');
  assert.match(await preview(), /•Example annex – located at 2 Annex Rd, Verona, WI 53593\./);
  await page.getByRole('button', { name: 'Remove additional location 2', exact: true }).click();
  assert.doesNotMatch(await preview(), /Example annex/);

  assert.deepEqual(errors, []);
  console.log('PASS: standard, warranty and Meriter SOW templates; inspections dropdown; additional locations; deposit at $10,000+; Meriter copy; persistence after reload');
} finally {
  await browser.close();
}
