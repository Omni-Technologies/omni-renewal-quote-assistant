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
  const copy = page.getByRole('button', { name: 'Copy pricing', exact: true });
  const copied = async () => {
    await copy.click();
    await page.getByText('Pricing summary copied — paste into your Teams list comment.', { exact: true }).waitFor();
    return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  };
  await page.goto(process.env.PAGES_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'New Renewal', exact: true }).click();
  assert.match(await copied(), /Previous annual price: —\nProposed annual price: —\nAnnual change: —\nPercent change: n\/a/);
  assert.match(await copied(), /avg hours: —/);
  assert.doesNotMatch(await copied(), /Notes about pricing changes:/);
  await field('Company name').fill('Example company');
  await field('Location name').fill('Example branch');
  await field('D-Tools project number').fill('TEST-1234');
  await field('Contract start year').fill('2027');
  await field('Contract duration in years').fill('3');
  await field('Previous annual contract price').fill('1000');
  await field('Proposed quoted labor hours').fill('13');
  const historyHours = page.getByLabel(/^Inspection hours for /);
  await historyHours.nth(0).fill('10');
  await historyHours.nth(1).fill('12');
  await field('Notes about pricing changes').fill('Added devices and travel.\nReviewed with Mike.');
  const expected = [
    'Contract pricing update:',
    'Previous annual price: $1,000.00',
    'Proposed annual price: $1,290.00',
    'Annual change: +$290.00',
    'Percent change: +29.0%',
    '',
    'avg hours: 11 h',
    'Proposed quoted labor hours: 13 h',
    'Labor rate: $90.00/hour',
    'Mileage cost: $100.00',
    '',
    'Notes about pricing changes: Added devices and travel.\nReviewed with Mike.',
  ].join('\n');
  await page.locator('summary').filter({ hasText: 'More pricing details' }).click();
  assert.equal(await copied(), expected, 'Collapsed pricing details still copy all values');
  await page.locator('summary').filter({ hasText: 'More pricing details' }).click();
  await field('Notes about pricing changes').fill('   ');
  const noNotes = await copied();
  assert.equal(noNotes, expected.split('\n\nNotes about pricing changes:')[0], 'Whitespace-only notes omit the line and trailing blank section');
  await field('Notes about pricing changes').fill('Added devices and travel.\nReviewed with Mike.');
  await historyHours.nth(2).fill('0');
  assert.match(await copied(), /avg hours: 7\.33 h/);
  await historyHours.nth(2).fill('');
  await field('Previous annual contract price').fill('1500');
  assert.match(await copied(), /Annual change: −\$210\.00\nPercent change: -14\.0%/);
  await field('Previous annual contract price').fill('1290');
  assert.match(await copied(), /Annual change: \$0\.00\nPercent change: 0\.0%/);
  await field('Previous annual contract price').fill('0');
  assert.match(await copied(), /Annual change: \+\$1,290\.00\nPercent change: n\/a/);
  await field('Annual mileage cost').fill('150');
  const manual = await copied();
  assert.match(manual, /Proposed annual price: \$1,350\.00/);
  assert.match(manual, /Mileage cost: \$150\.00/);
  assert.doesNotMatch(manual, /markup|mileage charge|Company:|Location:|D-Tools project:|Contract:/i);
  await page.waitForTimeout(700);
  await page.reload();
  await copy.waitFor();
  assert.equal(await copied(), manual, 'Saved reload copies the same pricing');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard blocked'); }; });
  await copy.click();
  const fallback = field('Pricing summary for Teams');
  await fallback.waitFor();
  assert.equal(await fallback.inputValue(), manual);
  assert.equal(await fallback.evaluate((node) => node.value.slice(node.selectionStart, node.selectionEnd)), manual);
  await field('Notes about pricing changes').fill('Updated notes after fallback');
  await copy.click();
  assert.match(await fallback.inputValue(), /Notes about pricing changes: Updated notes after fallback$/);
  assert.equal(await fallback.evaluate((node) => node.selectionEnd - node.selectionStart), (await fallback.inputValue()).length);
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await copy.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: horizontal overflow`);
    const bounds = await copy.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `${width}: copy button fits`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: compact pricing clipboard text, optional notes, average hours with blank/zero handling, collapsed details, price changes, mileage cost only, saved reload, selected fallback, fresh edits and desktop/mobile containment. No page errors.');
} finally {
  await browser.close();
}
