/* Offline readiness (R-28): Settings says what's saved for offline use and only says "Ready offline" after checking
   every needed file in the service worker's cache.
   - School only: after the first tap the voice of School (and the toy's own files) downloads by itself, not the
     other apps'; Settings then says "Ready offline: School" with the number of files checked;
   - downloads that fail are retried, counted and offered again ("Try again"); once they come through, it's ready;
   - "Save everything" saves every app's voice, the animals' own voices included;
   - a file removed from the cache, or no service worker, means "not ready" again;
   - with the network off (Chromium), a reload opens the toy and a story is read from the saved clips.
   The cache name in index.html must match sw.js. Run in Chromium, or with --webkit. */
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..');
const WEBKIT = process.argv.includes('--webkit');
const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg', '.png':'image/png', '.webmanifest':'application/manifest+json'};
let blocked = new Set();   // voice clips the "network" refuses for now (refused by the server: the service worker's own requests don't pass through the test's routes)
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (blocked.has(path.basename(pathname))){ res.writeHead(503); res.end(); return; }
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
const check = (condition, message) => { assert.ok(condition, message); console.log('ok  ' + message); };

(async () => {
  const swName = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const CACHE = '([^']+)'/)[1];
  const pageName = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/const CACHE = '([^']+)';\s+\/\/ the cache in sw\.js/)[1];
  check(swName === pageName, `the page saves into the service worker's own cache (${pageName})`);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (WEBKIT ? webkit : chromium).launch();
  try {
    const context = await browser.newContext({viewport:{width:390, height:844}, hasTouch:true, isMobile:true});
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:''}));
    await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
    await context.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
      localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
      localStorage.setItem('toyphone.access', JSON.stringify({mode:'school'}));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(base); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
    // (the page registers the worker itself only on https; this test server is http)
    await page.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
    const off = () => page.evaluate(() => window.__toyPhone.offline());
    const note = () => page.locator('#offlineNote').innerText();
    const cached = files => page.evaluate(async files => { const hits = await Promise.all(files.map(f => caches.match(f))); return hits.filter(Boolean).length; }, files);
    const openSettings = async () => { await page.locator('#clock').focus(); await page.keyboard.down('Enter'); await page.waitForTimeout(3250); await page.keyboard.up('Enter'); await page.locator('#settings').waitFor({state:'visible'}); };
    const closeSettings = async () => { await page.locator('#doneBtn').tap(); await page.locator('#settings').waitFor({state:'hidden'}); };
    const idle = () => page.waitForFunction(() => { const o = window.__toyPhone.offline(); return !o.busy && o.missing !== null; }, null, {timeout:180000});

    const school = await page.evaluate(() => window.__toyPhone.offline().files(false));
    const every = await page.evaluate(() => window.__toyPhone.offline().files(true));
    const gamesOnly = every.filter(f => !school.includes(f));
    check(school.length > 100 && gamesOnly.length > 500, `School only needs ${school.length} files; everything is ${every.length}`);

    // the first tap starts the quiet download of what's switched on, with a few clips failing at first
    const some = school.filter(f => /\.mp3$/.test(f) && f.startsWith('assets/voice/')).slice(5, 9);
    blocked = new Set(some.map(f => path.basename(f)));
    await page.touchscreen.tap(195, 500);
    await page.waitForFunction(() => window.__toyPhone.offline().busy, null, {timeout:10000});
    await idle();
    let o = await off();
    check(o.missing === some.length && o.failed === some.length, `the automatic download saves School's files, retrying; ${o.failed} that kept failing are counted`);
    check(await cached(gamesOnly.slice(0, 200)) === 0, 'it doesn\'t download the apps that are switched off');
    await openSettings(); await idle();
    check(/Not ready offline: 4 files couldn't download/.test(await note()) && await page.locator('#offlineGet').innerText() === 'Try again',
      `Settings says it isn't ready and offers Try again ("${await note()}")`);
    blocked = new Set();
    await page.locator('#offlineGet').scrollIntoViewIfNeeded(); await page.locator('#offlineGet').tap();
    await page.waitForTimeout(200); await idle();
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(await page.locator('#settings').isHidden(), 'Escape still closes Settings after the Save button had the focus (it disables itself while saving)');
    await openSettings(); await idle();
    o = await off();
    check(o.missing === 0 && /^Ready offline: School \([\d,]+ files checked on this phone\)\.$/.test(await note()), `after Try again: "${await note()}"`);
    check(await cached(school) === school.length, `every one of School's ${school.length} files is really in the cache`);

    // a missing file means not ready
    await page.evaluate(async f => { const c = await caches.open((await caches.keys())[0]); await c.delete(f); }, some[0]);
    await closeSettings(); await openSettings(); await idle();
    check(/^Not ready offline yet: [\d,]+ of [\d,]+ files saved for School\.$/.test(await note()) && (await off()).missing === 1, `a file gone from the cache: "${await note()}"`);

    // everything
    await page.locator('#offlineAll').tap(); await page.waitForTimeout(200); await idle();
    check(/^Ready offline: everything \([\d,]+ files checked on this phone\)\.$/.test(await note()) && await cached(every) === every.length,
      `Save everything: "${await note()}", all ${every.length} files cached (the animals' own voices too)`);

    // no service worker: not ready, whatever is cached
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.unregister(); });
    await closeSettings(); await openSettings(); await idle();
    check(/offline helper isn't installed/.test(await note()), `without the service worker: "${await note()}"`);
    await page.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
    await closeSettings();

    // the network off: a reload still opens the toy, and a story is read from the saved clips (Chromium; WebKit crashes on a forced-offline reload)
    if (!WEBKIT){
      await page.reload(); await page.waitForFunction(() => window.__toyPhone && navigator.serviceWorker.controller);
      await context.setOffline(true);
      await page.reload(); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded, null, {timeout:15000});
      await page.touchscreen.tap(195, 500); await page.waitForTimeout(300);
      await page.evaluate(() => window.__toyPhone.go('storytime')); await page.waitForTimeout(500);
      const book = await page.locator('#storytime [data-book="seed"]').boundingBox();
      await page.touchscreen.tap(book.x + book.width/2, book.y + book.height/2);
      await page.waitForFunction(() => window.__toyPhone.voice().last && /Duck plants a seed/.test(window.__toyPhone.voice().last.text), null, {timeout:15000});
      const v = await page.evaluate(() => window.__toyPhone.voice());
      check(v.fallbacks.length === 0, 'with the network off, a reload opens the toy and the story is read from the saved recordings');
      await context.setOffline(false);
    }
    check(errors.length === 0, `no JavaScript errors ${errors.join('; ')}`);
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
