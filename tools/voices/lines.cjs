/* Prints every line the toy can say (who + text) as JSON, read from index.html itself: node tools/voices/lines.cjs */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch(), page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.resolve(__dirname, '..', '..', 'index.html'));
  await page.waitForTimeout(500);
  const lines = await page.evaluate(() => window.__toyPhone.voiceLines());
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  process.stdout.write(JSON.stringify(lines));
})();
