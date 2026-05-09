// Screenshot every slide at 1920x1080 for visual sanity pass.
// Run: node _screenshot-all.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const slides = [
  '01-cover',
  '02-problem',
  '03-existing-solutions',
  '04-the-idea',
  '05-three-roles',
  '06-architecture',
  '07-contract',
  '08-verifier',
  '09-four-verdicts',
  '10-issue-reissue-revoke',
  '11-testing-deployment',
  '12-closing',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push({ slide: 'unknown', error: e.message }));

for (const slide of slides) {
  const url = 'file:///' + resolve(__dirname, `${slide}.html`).replaceAll('\\', '/');
  const errs = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500); // wait for fonts + animations to settle
  await page.screenshot({
    path: resolve(__dirname, `_screenshot-${slide}.png`),
    fullPage: false,
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  console.log(`✓ ${slide}.html  errors: ${errs.length}`);
  if (errs.length) errs.forEach((e) => console.log(`    ! ${e}`));
}

await browser.close();
console.log('\nDone. 12 screenshots written to slides/_screenshot-*.png');
