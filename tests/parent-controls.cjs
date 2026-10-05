/* Behavioral checks for parent access policy. Run in Chromium or with --webkit. */
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..');
const useWebkit = process.argv.includes('--webkit');
const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/KidPhone/, '') || '/';
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
const check = (condition, message) => { assert.ok(condition, message); console.log('ok  ' + message); };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (useWebkit ? webkit : chromium).launch(useWebkit ? {} : {args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true});
    const errors = [];
    await context.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:''}));
    await context.route('https://fonts.gstatic.com/**', r => r.abort());
    await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    // These checks don't use the recorded voice, so it stays off: after the first touch the toy fetches its clips in the
    // background, and WebKit reports every download a reload cuts off as an "access control checks" page error (see
    // tests/pages.cjs). Waiting for the downloads to finish took long enough to outlast the 30-second PIN cooldown.
    // Without voice.json the toy speaks as it does from a file:// page, and nothing is downloading when a test reloads.
    await context.route('**/assets/voice/voice.json', r => r.fulfill({status:404, body:''}));
    const reload = () => page.reload();
    await page.addInitScript(() => {
      // Only seed once; reload assertions must exercise persisted application writes.
      if (!localStorage.getItem('toyphone.settings')) localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', silent:false}));
      if (sessionStorage.getItem('restoreCamera')) window.claude = {hot:{data:{app:'camera'}}};
      window.permissionCalls = {motion:0, camera:0};
      window.DeviceOrientationEvent ||= class {};
      window.DeviceOrientationEvent.requestPermission = () => { window.permissionCalls.motion++; return Promise.resolve('granted'); };
      const media = navigator.mediaDevices;
      if (media){ const original = media.getUserMedia.bind(media); media.getUserMedia = (...args) => { window.permissionCalls.camera++; return original(...args); }; }
    });
    const url = `http://127.0.0.1:${server.address().port}/KidPhone/index.html`;
    const visible = id => page.locator(id).isVisible();
    const tap = async selector => { await page.locator(selector).first().tap(); await page.waitForTimeout(140); };
    const waitVisible = id => page.locator(id).waitFor({state:'visible'});
    const pin = async digits => { for (const digit of digits) await tap(`[data-pin="${digit}"]`); };
    const hold = async () => {
      // Keep holding until the PIN gate or settings opens, like a parent would: the page's 3-second timer can fire
      // late on a busy runner, and letting go at a fixed 3.1 s then cancels the hold.
      await page.locator('#clock').dispatchEvent('pointerdown', {pointerId:1});
      await page.waitForTimeout(2900);
      await page.waitForFunction(() => !document.getElementById('parentGate').hidden || !document.getElementById('settings').hidden, null, {timeout:10000});
      await page.locator('#clock').dispatchEvent('pointerup', {pointerId:1});
    };
    const unlock = async digits => { await hold(); await waitVisible('#parentGate'); await pin(digits); try { await waitVisible('#settings'); } catch(e) { console.log('PIN gate state:', await page.locator('#pinMessage').textContent(), await page.locator('#pinDots').textContent()); throw e; } };
    const go = name => page.evaluate(name => window.__toyPhone.go(name), name);
    await page.goto(url); await page.waitForFunction(() => window.__toyPhone);
    check(await visible('#home'), 'legacy/default launch preserves full phone');
    await hold(); await waitVisible('#settings');
    await tap('[data-vol="3"]');
    check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).vol) === 3, 'volume still saves from the expanded settings sheet');
    await tap('[data-access="school"]'); await waitVisible('#parentGate');
    check(!(await visible('#settings')), 'enabling restrictions requires PIN setup first');
    check(await page.locator('[data-pin="5"]').evaluate(el => /Press Start 2P/.test(getComputedStyle(el).fontFamily)) && await page.locator('[data-pin="Clear"]').evaluate(el => !/Press Start 2P/.test(getComputedStyle(el).fontFamily)), 'PIN digits use the 8-bit number font (5 never reads as S); Back and Clear stay in words');
    await pin('2580'); await pin('2581');
    check(/did not match/.test(await page.locator('#pinMessage').textContent()), 'mismatched confirmation does not set PIN');
    check(await page.evaluate(() => !JSON.parse(localStorage.getItem('toyphone.access') || '{}').pin), 'mismatch leaves stored PIN unset');
    await pin('2580'); await pin('2580'); await waitVisible('#settings');
    const policy = await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.access')));
    check(policy.mode === 'school' && policy.pin.hash.length === 64 && !JSON.stringify(policy).includes('2580'), 'school mode and salted PIN digest saved without plaintext PIN');
    await tap('#doneBtn'); check(await visible('#school'), 'School-only activation enters School');
    for (const route of ['home','camera','photos','games','wildtap','dinobuddies','snacktime','paintpals','balltrail','starflight','phone','music','unknown']){
      await go(route); check(await visible('#school'), `${route} cannot escape School-only mode`);
    }
    await go('abczoo'); check(await visible('#abczoo'), 'school lessons remain available');
    await tap('#homeBtn'); check(await visible('#school'), 'physical Home returns to School');
    await page.evaluate(() => window.__toyPhone.ringIn());
    check(await page.evaluate(() => window.__toyPhone.call()) === null, 'forced test ring also respects disabled Phone');
    await hold(); await pin('1111');
    check(!(await visible('#settings')) && /did not match/.test(await page.locator('#pinMessage').textContent()), 'wrong PIN does not open settings');
    await tap('#homeBtn'); check(!(await visible('#parentGate')), 'Home cancels PIN entry without unlocking');
    // Store permission-enabled preferences to ensure access policy wins over old camera settings.
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('toyphone.settings')); s.camera='both'; s.look='move'; localStorage.setItem('toyphone.settings', JSON.stringify(s)); sessionStorage.setItem('restoreCamera','1'); });
    await reload(); await page.waitForFunction(() => window.__toyPhone);
    check(await visible('#school') && !(await visible('#ready')), 'reload blocks restored Camera state and skips permission onboarding');
    check(await page.evaluate(() => permissionCalls.motion + permissionCalls.camera) === 0, 'disabled camera requests neither motion nor media permission');
    await unlock('2580');
    check(await page.locator('[data-camera="both"]').isDisabled(), 'camera controls disabled while camera unavailable');
    await tap('#doneBtn');
    check(await page.evaluate(() => permissionCalls.motion + permissionCalls.camera) === 0, 'Done does not trigger disabled motion permission');
    await unlock('2580'); await tap('#parentPinBtn'); await pin('3690'); await pin('3690'); await waitVisible('#settings');
    await tap('#doneBtn'); await hold(); await pin('2580');
    check(!(await visible('#settings')), 'old PIN rejected after changing PIN');
    await pin('3690'); await waitVisible('#settings');
    await tap('[data-access="custom"]');
    for (const app of ['games','camera','photos','phone','school']) await tap(`[data-allow="${app}"]`);
    await tap('[data-allow="music"]');
    check(/at least one/.test(await page.locator('#accessNote').textContent()), 'Custom cannot disable every app');
    await tap('#doneBtn'); await tap('#homeBtn');
    check(await page.locator('.appicon:visible').count() === 1, 'Custom home displays only allowed app');
    await go('abcsnack'); check(await visible('#home'), 'disabled School also blocks its nested lessons');
    await go('music'); check(await visible('#music'), 'allowed Custom app works');
    await tap('#homeBtn'); await unlock('3690'); await tap('[data-access="full"]'); await tap('#doneBtn'); await tap('#homeBtn');
    check(await page.locator('.appicon:visible').count() === 6, 'Full phone restores all apps');
    // Calls must stop immediately when the parent restricts the app.
    await page.evaluate(() => window.__toyPhone.ringIn());
    await page.waitForFunction(() => window.__toyPhone.call() === 'ringing');
    await unlock('3690'); await tap('[data-access="school"]');
    check(await page.evaluate(() => window.__toyPhone.call()) === null, 'switching to School-only ends active call');
    await tap('#doneBtn');
    // A real fake-device stream exercises resource shutdown in Chromium.
    if (!useWebkit){
      await unlock('3690'); await tap('[data-access="full"]'); await tap('#doneBtn'); await go('camera');
      await tap('[data-mode="photo"]');
      await page.waitForFunction(() => window.__toyPhone.cam().tracks > 0);
      await unlock('3690'); await tap('[data-access="school"]');
      check(await page.evaluate(() => window.__toyPhone.cam().tracks) === 0, 'School-only stops active camera stream');
      await tap('#doneBtn');
    }
    await page.setViewportSize({width:844,height:390}); await hold();
    check(await page.locator('[data-pin="0"]').evaluate(el => { const r=el.getBoundingClientRect(), s=el.closest('.sheet').getBoundingClientRect(); return r.top >= s.top && r.bottom <= s.bottom; }), 'entire PIN keypad fits in landscape without scrolling');
    check(await page.locator('#pinKeys .sbtn').evaluateAll(keys => keys.every(k => k.scrollWidth <= k.clientWidth)), 'every PIN key label fits inside its key in landscape');
    fs.mkdirSync(path.join(ROOT, 'tests/screenshots'), {recursive:true});
    await page.screenshot({path:path.join(ROOT, `tests/screenshots/parent-pin-${useWebkit?'webkit':'chromium'}.png`)});
    await pin('3690'); await waitVisible('#settings');
    // Backgrounding must relock parent settings even if the phone remains on the same page.
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable:true, value:'hidden'}); document.dispatchEvent(new Event('visibilitychange')); });
    check(!(await visible('#settings')), 'backgrounding closes and relocks settings');
    await reload(); await page.waitForFunction(() => window.__toyPhone);
    await hold();
    for (let i=0; i<5; i++) await pin('1111');
    check(/wait 30/.test(await page.locator('#pinMessage').textContent()), 'five bad PINs trigger cooldown');
    await reload(); await page.waitForFunction(() => window.__toyPhone); await hold(); await pin('3690');
    check(!(await visible('#settings')) && /wait/.test(await page.locator('#pinMessage').textContent()), 'PIN cooldown survives reload');
    // The service worker is intentionally HTTPS-only; exercise actual cached offline launch on the secure localhost origin.
    await page.evaluate(async () => { await navigator.serviceWorker.register('/KidPhone/sw.js', {scope:'/KidPhone/'}); await navigator.serviceWorker.ready; });
    await reload(); await page.waitForFunction(() => navigator.serviceWorker.controller && window.__toyPhone);
    check(await visible('#school'), 'a launch under the service worker preserves School-only policy');
    if (useWebkit){
      // Playwright WebKit on Linux throws an internal browser error when a service-worker-controlled page is reloaded after
      // context.setOffline(true) (see tests/pages.cjs). The policy lives in localStorage, not the network, so check that the
      // worker cached the offline shell; Chromium below does the full forced-offline launch.
      const cached = await page.evaluate(async () => ({index:!!(await caches.match('index.html')), manifest:!!(await caches.match('manifest.webmanifest'))}));
      check(cached.index && cached.manifest, 'WebKit service worker cached the offline shell ' + JSON.stringify(cached));
    } else {
      await page.waitForTimeout(800); await context.setOffline(true); await reload(); await page.waitForFunction(() => window.__toyPhone);
      check(await visible('#school'), 'cached offline launch preserves School-only policy');
    }
    check(errors.length === 0, 'no JavaScript errors: ' + errors.join('; '));
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => server.close());
