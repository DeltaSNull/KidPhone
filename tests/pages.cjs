/* GitHub Pages check. Runs the "Gather the site" step from .github/workflows/deploy-pages.yml, serves the result
   under /KidPhone/ the way GitHub Pages serves a project site (https://<user>.github.io/<repo>/), then opens it as an
   iPhone (Safari) and as an Android phone (Chrome): every file the page asks for must load from the subpath, taps
   must work, and the offline cache must work from the subpath too. Run: npm run test:pages */
const { chromium, webkit } = require('playwright');
const ENGINE = process.argv.includes('--webkit') ? 'webkit' : 'chromium';
const BROWSER = { chromium, webkit }[ENGINE];
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const BASE = '/KidPhone/';   // the repository name
const OPTIONAL = ['assets/sounds/sounds.json', 'assets/family/family.json'];   // the page asks for these; a 404 means "none"
const sleep = ms => new Promise(r => setTimeout(r, ms));
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? '  ok   ' : '  FAIL ') + msg); };

/* the workflow's own copy step, run on a copy of what a checkout holds (the files git tracks or would add), so this
   checks exactly what gets published */
function gatherSite() {
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');
  const m = yml.match(/- name: Gather the site\n +run: \|\n((?: {10}.*\n|\n)+)/);
  if (!m) throw new Error('no "Gather the site" step in deploy-pages.yml');
  const script = m[1].split('\n').map(l => l.slice(10)).join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidphone-pages-'));
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO }).toString().split('\0').filter(f => f && fs.existsSync(path.join(REPO, f)));
  files.forEach(f => { fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(tmp, f)); });
  execFileSync('bash', ['-euo', 'pipefail', '-c', script], { cwd: tmp, stdio: ['ignore', 'ignore', 'inherit'] });
  return path.join(tmp, '_site');
}

/* GitHub Pages in miniature: only BASE exists, /KidPhone redirects to /KidPhone/, folders serve index.html */
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown' };
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      if (u === BASE.slice(0, -1)) { rsp.writeHead(301, { location: BASE }); return rsp.end(); }
      if (!u.startsWith(BASE)) { rsp.writeHead(404); return rsp.end('not found'); }
      let rel = u.slice(BASE.length); if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const f = path.join(dir, rel);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('not found'); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const PHONES = {
  'iPhone Safari': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  'Android Chrome': { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' }
};

async function run(browser, origin, name) {
  console.log(`\n=== ${ENGINE} ${name}, served from ${origin}${BASE}`);
  const context = await browser.newContext({ ...PHONES[name], isMobile: true, hasTouch: true });
  await context.addInitScript(() => { if (!localStorage.getItem('toyphone.settings')) localStorage.setItem('toyphone.settings', JSON.stringify({ incoming: false })); });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const bad = [], errors = [];
  page.on('response', r => {
    const u = new URL(r.url());
    if (u.origin !== origin || (r.status() >= 300 && r.status() < 400)) return;   // other sites (Google Fonts) and the /KidPhone redirect
    if (!u.pathname.startsWith(BASE)) bad.push(`${u.pathname} (outside ${BASE}: an absolute path)`);
    else if (r.status() >= 400 && !OPTIONAL.includes(u.pathname.slice(BASE.length))) bad.push(`${u.pathname} ${r.status()}`);
  });
  /* errors about this site's files count; Google Fonts can't be reached from the test machine once the offline worker fetches it, so skip other sites */
  page.on('console', m => { const at = m.location().url || ''; if (m.type() === 'error' && !OPTIONAL.some(f => at.endsWith(f)) && !(at && !at.startsWith(origin))) errors.push(m.text() + (at ? ' at ' + at : '')); });
  page.on('pageerror', e => errors.push(e.message));

  const tap = async sel => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error('not on screen: ' + sel); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
  const shown = sel => page.evaluate(s => !document.querySelector(s).hidden, sel);

  await page.goto(origin + BASE.slice(0, -1));   // the address without the trailing slash, as people type it
  await page.waitForLoadState('load'); await sleep(600);
  check(page.url() === origin + BASE, `${BASE.slice(0, -1)} redirects to ${BASE}`);
  check(await shown('#home'), 'index.html opens on the home screen');
  if (await shown('#ready')) { await tap('#readySkip'); await sleep(300); }   // (the Getting ready card: Not now)
  check(!(await shown('#ready')), 'the Getting ready card can be put off with Not now');

  /* Add to Home Screen pieces resolve inside the subpath */
  const pwa = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]').href, m = await (await fetch(link)).json();
    const icons = await Promise.all([...m.icons.map(i => new URL(i.src, link).href), document.querySelector('link[rel=apple-touch-icon]').href]
      .map(async u => ({ u, ok: (await fetch(u)).ok })));
    return { start: new URL(m.start_url, link).href, scope: new URL(m.scope, link).href, icons };
  });
  check(pwa.start === origin + BASE && pwa.scope === origin + BASE, `manifest start_url and scope are ${BASE}`);
  check(pwa.icons.every(i => i.ok), `home-screen icons load (${pwa.icons.length})`);
  check(await page.evaluate(() => [...document.querySelectorAll('img.px')].every(i => i.complete && i.naturalWidth > 0)), 'every pixel sprite loads');
  const v = await page.evaluate(async () => { const t = window.__toyPhone.voice(); const f = Object.values(await (await fetch('assets/voice/voice.json')).json().then(j => j.clips))[0][0];
    const r = await fetch('assets/voice/' + f); return { loaded: t.loaded, clips: t.clips, clip: r.ok && (await r.arrayBuffer()).byteLength }; });
  check(v.loaded && v.clips > 500 && v.clip > 900, `the recorded voice loads from ${BASE} (${v.clips} lines; a clip is ${v.clip} bytes)`);

  /* touch: open apps with real taps, then home */
  await tap('[data-app=phone]'); await sleep(900);
  check(await shown('#phone'), 'tapping Phone opens it');
  await tap('#homeBtn'); await sleep(700);
  check(await shown('#home'), 'the home button goes home');
  await tap('[data-app=camera]'); await sleep(1200);
  const before = await page.evaluate(() => window.__toyPhone.photos());
  await tap('#shutter'); await sleep(900);
  check(await page.evaluate(() => window.__toyPhone.photos()) === before + 1, 'tapping the shutter takes a photo');
  await tap('#homeBtn'); await sleep(700);

  /* offline: the service worker installs with the subpath as its scope and serves the toy with no network.
     (The page registers it itself on https; this local server is http, so register it the same way here.) */
  const scope = await page.evaluate(async () => { const r = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return r.scope; });
  check(scope === origin + BASE, `service worker scope is ${BASE}`);
  await page.reload(); await sleep(800);   // a load under the worker fills its cache
  await context.setOffline(true);
  await page.reload(); await sleep(800);
  check(await shown('#home'), 'with no network, the toy still opens from the offline cache');
  await context.setOffline(false);

  check(!bad.length, `every file loads from ${BASE} ${bad.length ? JSON.stringify(bad.slice(0, 6)) : ''}`);
  check(!errors.length, `no console errors ${errors.length ? JSON.stringify(errors.slice(0, 4)) : ''}`);
  await context.close();
}

(async () => {
  const site = gatherSite();
  const published = fs.readdirSync(site, { recursive: true }).map(String).sort();
  const byDir = {}; published.filter(f => path.extname(f)).forEach(f => { const d = path.dirname(f); byDir[d] = (byDir[d] || 0) + 1; });
  console.log('published: ' + Object.entries(byDir).map(([d, n]) => `${d === '.' ? '(top)' : d} ${n}`).join(', '));
  check(published.includes('index.html'), 'index.html is the entry point');
  check(!published.some(f => /^(tests|tools|node_modules|dist)\b|^assets\/family\/|package/.test(f)), 'only the toy is published (no tests, tools or family files)');
  const srv = await serve(site);
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await BROWSER.launch();
  try { for (const name of Object.keys(PHONES)) await run(browser, origin, name); }
  finally { await browser.close(); srv.close(); fs.rmSync(path.dirname(site), { recursive: true, force: true }); }
  console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
