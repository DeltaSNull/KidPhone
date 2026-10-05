/* WebKit compatibility smoke test.
   This is deliberately smaller than tests/smoke.cjs: Chromium keeps the exhaustive interaction/audio/camera suite,
   while this test exercises the shipped app in Playwright WebKit at iPhone portrait and landscape sizes. */
const { webkit } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
  console.log((ok ? '  ok   ' : '  FAIL ') + msg);
};

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json'
};

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, rsp) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const file = path.join(ROOT, u);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        rsp.writeHead(404);
        return rsp.end('not found');
      }
      rsp.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      fs.createReadStream(file).pipe(rsp);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function run(browser, base, name, viewport) {
  console.log(`\n=== WebKit ${name} ${viewport.width}x${viewport.height}`);
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(() => {
    localStorage.setItem('toyphone.settings', JSON.stringify({
      incoming: false,
      vol: 2,
      silent: false,
      camera: 'pretend',
      look: 'drag'
    }));
  });
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  await page.route('**/assets/family/family.json', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ contacts: [] })
  }));

  const tap = async selector => {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible' });
    await loc.tap();
    await sleep(250);
  };
  const visible = selector => page.locator(selector).first().isVisible();
  const home = async () => { await tap('#homeBtn'); await sleep(350); };

  await page.goto(base + '/index.html');
  await page.waitForFunction(() => !!window.__toyPhone);
  await sleep(700);

  if (await visible('#ready')) await tap('#readySkip');

  check(await visible('#home'), 'opens on the home screen');
  check(await page.locator('.appicon').count() === 6, 'shows all six apps');

  const layout = await page.evaluate(() => {
    const b = document.querySelector('#homeBtn').getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      homeButton: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
    };
  });
  check(layout.scrollWidth <= layout.innerWidth + 1, 'home has no horizontal overflow');
  check(layout.homeButton.left >= -1 && layout.homeButton.top >= -1 &&
    layout.homeButton.right <= viewport.width + 1 && layout.homeButton.bottom <= viewport.height + 1,
    'home button stays on screen');

  await tap('[data-app="phone"]');
  check(await visible('#phone') && await page.locator('.contact').count() >= 12, 'Phone opens with the animal contacts');
  await home();

  const beforePhotos = await page.evaluate(() => window.__toyPhone.photos());
  await tap('[data-app="camera"]');
  const camera = await page.evaluate(() => window.__toyPhone.cam());
  check(camera.mode === 'safari', 'Camera uses the pretend camera in the WebKit smoke test');
  await tap('#shutter');
  await sleep(500);
  check(await page.evaluate(() => window.__toyPhone.photos()) === beforePhotos + 1, 'pretend camera takes and stores a photo');
  await home();

  await tap('[data-app="photos"]');
  check(await visible('#photos') && await page.locator('#pgrid .pic').count() > 0, 'Photos opens with saved pictures');
  await home();

  await tap('[data-app="music"]');
  check(await visible('#music') && await page.locator('.bar').count() > 0, 'Music opens');
  await tap('.bar');
  await home();

  await tap('[data-app="games"]');
  check(await page.locator('#gameList .gamecard').count() === 6, 'Games shows all six games');
  await tap('.gamecard[aria-label="Wild Tap"]');
  check(await visible('#wt-menu'), 'Wild Tap opens');
  await home();

  await tap('[data-app="school"]');
  check(await page.locator('#school .gamecard').count() >= 5, 'School shows its learning games');
  await tap('.gamecard[aria-label="ABC Zoo"]');
  check(await page.locator('#azGrid .az-tile').count() === 26, 'ABC Zoo renders all 26 letters');
  await home();

  const storage = await page.evaluate(async () => {
    localStorage.setItem('webkit-ci-probe', 'ok');
    const local = localStorage.getItem('webkit-ci-probe') === 'ok';
    localStorage.removeItem('webkit-ci-probe');
    const idb = await new Promise(resolve => {
      try {
        const req = indexedDB.open('webkit-ci-probe', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('x');
        req.onsuccess = () => { req.result.close(); indexedDB.deleteDatabase('webkit-ci-probe'); resolve(true); };
        req.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
    return { local, idb };
  });
  check(storage.local && storage.idb, 'localStorage and IndexedDB are available');

  const realErrors = errors.filter(e => !/favicon|Failed to load resource/i.test(e));
  check(!realErrors.length, `no WebKit console/page errors ${realErrors.length ? JSON.stringify(realErrors.slice(0, 4)) : ''}`);
  await context.close();
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await webkit.launch();
  try {
    await run(browser, base, 'portrait', { width: 390, height: 844 });
    await run(browser, base, 'landscape', { width: 844, height: 390 });
  } catch (e) {
    failures.push('crashed: ' + e.stack);
    console.error(e);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures.length ? `\n${failures.length} FAILED:\n  ` + failures.join('\n  ') : '\nAll WebKit checks passed.');
  process.exit(failures.length ? 1 : 0);
})();
