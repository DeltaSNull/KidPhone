/* Makes the Add to Home Screen icons from the appIcon pixel sprite in index.html. Run: npm run icons
   Each pixel becomes a solid square (6x for 192, 16x for 512). 180 is the 192 picture with its outer pixel ring trimmed. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/^appIcon:\{pal:\{([^}]*)\}, rows:`\n([^`]*)`/m);
if (!m) throw new Error('appIcon sprite not found in index.html');
const pal = Object.fromEntries([...m[1].matchAll(/(\w):'(#[0-9A-Fa-f]+)'/g)].map(x => [x[1], x[2]]));
const rows = m[2].split('\n');

(async () => {
  const browser = await chromium.launch();
  for (const [size, k, crop] of [[192, 6, 0], [512, 16, 0], [180, 6, 6]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent('<style>html,body{margin:0}canvas{display:block}</style><canvas></canvas>');
    await page.evaluate(({ pal, rows, size, k, crop }) => {
      const c = document.querySelector('canvas'); c.width = size; c.height = size;
      const g = c.getContext('2d');
      rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * k - crop, y * k - crop, k, k); } }));
    }, { pal, rows, size, k, crop });
    await page.screenshot({ path: path.join(root, 'icons', `icon-${size}.png`) });
    await page.close();
    console.log(`icons/icon-${size}.png`);
  }
  await browser.close();
})();
