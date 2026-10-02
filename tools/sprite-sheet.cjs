/* Draws every pixel sprite in index.html on one labeled sheet, big enough to see each pixel. Run: npm run sprites
   Writes screenshots/sprites.png. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sprites = [...html.matchAll(/^(\w+):\{pal:\{([^}]*)\}, rows:`\n([^`]*)`/gm)].map(([, name, pal, rows]) =>
  ({ name, pal: Object.fromEntries([...pal.matchAll(/(\w):'(#[0-9A-Fa-f]+)'/g)].map(x => [x[1], x[2]])), rows: rows.split('\n') }));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.setContent(`<body style="margin:0;padding:12px;background:#2B2430;font:13px/1.2 sans-serif;color:#EDE6DA;display:flex;flex-wrap:wrap;gap:10px;width:1176px">
    ${sprites.map((s, i) => `<figure style="margin:0;width:104px;text-align:center"><canvas data-i="${i}" style="display:block;margin:0 auto 4px"></canvas>${s.name}</figure>`).join('')}</body>`);
  await page.evaluate(sprites => document.querySelectorAll('canvas').forEach(c => {
    const s = sprites[c.dataset.i], k = Math.floor(96 / Math.max(s.rows.length, s.rows[0].length));
    c.width = s.rows[0].length * k; c.height = s.rows.length * k;
    const g = c.getContext('2d');
    for (let y=0;y<s.rows.length;y++) for (let x=0;x<s.rows[0].length;x++){ g.fillStyle = (x + y) % 2 ? '#8E8499' : '#9C93A6'; g.fillRect(x * k, y * k, k, k); }   // mid-grey checks: dark and white sprites both show
    s.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (s.pal[ch]) { g.fillStyle = s.pal[ch]; g.fillRect(x * k, y * k, k, k); } }));
  }), sprites);
  await page.screenshot({ path: path.join(root, 'screenshots', 'sprites.png'), fullPage: true });
  await browser.close();
  console.log(`screenshots/sprites.png: ${sprites.length} sprites`);
})();
