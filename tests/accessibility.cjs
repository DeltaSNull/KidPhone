/* Accessibility and legibility (R-25), in three layouts:
   - the parent entry (the clock) is reachable by assistive tech and the keyboard, with a name that says to hold it,
     and a quick tap still never opens Settings (the gate stays a three-second hold);
   - Settings and the PIN screen keep focus inside (the rest of the screen is inert), Tab wraps, Escape closes and
     gives focus back to the clock, the PIN screen says how many digits are in;
   - every number on the phone's screens (status clock, keypad and dialed number, call timer, photo counter, PIN keys,
     Settings values, School menu, game cards) renders with the clear 8-bit digits (or the plain reading font), at a
     readable size, unclipped; white button labels have their ink outline;
   - with reduced motion, CSS loops play once and the flying pictures (JavaScript animations) are instant.
   Run in Chromium, or with --webkit. */
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..');
const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
const check = (condition, message) => { assert.ok(condition, message); console.log('ok  ' + message); };
// the real pixel fonts (from the npm packages), so an ambiguous fallback can't pass for a clear digit
const face = (pkg, family, w) => `@font-face{font-family:"${family}";font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)), 'files', `${pkg}-latin-${w}-normal.woff2`)).toString('base64')}) format("woff2")}`;
const FONTS = [face('pixelify-sans', 'Pixelify Sans', 500), face('pixelify-sans', 'Pixelify Sans', 700), face('press-start-2p', 'Digit Reference', 400)].join('\n');
const SETTINGS = {incoming:false, camera:'pretend', look:'drag', tilt:'off', play:30};

/* every visible text with a digit on screen: its font must draw the digits like the reference 8-bit face (or be the
   plain reading font), at 10px or more, and not be cut off */
function auditDigits(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d', {willReadFrequently:true});
  const ink = (d, font) => { g.clearRect(0, 0, 256, 256); g.fillStyle = '#000'; g.font = font; g.fillText(d, 24, 196); const data = g.getImageData(0, 0, 256, 256).data;
    let x0 = 256, x1 = 0, y0 = 256, y1 = 0; for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if (data[(y*256 + x)*4 + 3] > 128){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < x0) return []; const o = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++){ const px = Math.floor(x0 + (x + .5)*(x1 - x0 + 1)/16), py = Math.floor(y0 + (y + .5)*(y1 - y0 + 1)/16); o.push(data[(py*256 + px)*4 + 3] > 128 ? 1 : 0); } return o; };
  const out = [], seen = new Set(), walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());){
    if (!/\d/.test(n.textContent)) continue; const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('script,style,[hidden],.sr')) continue; const r = el.getBoundingClientRect(); if (r.width < 1 || r.bottom < 0 || r.top > innerHeight) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity === 0) continue;
    const sheet = el.closest('.sheet'); if (sheet){ const b = sheet.getBoundingClientRect(); if (r.bottom < b.top || r.top > b.bottom) continue; }
    const reading = /Trebuchet/.test(s.fontFamily.split(',')[0]);
    const diff = [...new Set(n.textContent.match(/\d/g))].map(d => { const a = ink(d, `${s.fontWeight} 128px ${s.fontFamily}`), b = ink(d, '400 128px "Digit Reference"'); return a.length ? a.filter((v, i) => v !== b[i]).length/a.length : 1; });
    out.push({text:n.textContent.trim().slice(0, 30), font:s.fontFamily.split(',')[0], size:+parseFloat(s.fontSize).toFixed(1), clear:reading || diff.every(x => x < .06),
      clip:(el.scrollWidth > el.clientWidth + 1 && s.overflow !== 'visible') || r.right > innerWidth + 1 || r.left < -1});
  }
  return out;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    for (const viewport of [{width:390, height:844}, {width:844, height:390}, {width:320, height:568}]){
      const tag = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true});
      await context.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:FONTS}));
      await context.route('https://fonts.gstatic.com/**', r => r.abort());
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(s => {
        if (!sessionStorage.getItem('seeded')){ sessionStorage.setItem('seeded', '1');
          localStorage.setItem('toyphone.settings', JSON.stringify(s));
          localStorage.setItem('toyphone.photos', JSON.stringify(Array.from({length:24}, (_, i) => ({id:'a11y-' + i, t:i})))); }
      }, SETTINGS);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForFunction(() => window.__toyPhone);
      await page.evaluate(() => document.fonts.ready); await page.evaluate(() => document.fonts.load('128px "Digit Reference"', '0123456789'));
      const go = async a => { await page.evaluate(a => window.__toyPhone.go(a), a); await page.waitForTimeout(450); };
      const digits = async label => {
        const found = await page.evaluate(auditDigits);
        const bad = found.filter(x => !x.clear || x.clip || x.size < 10);
        check(found.length > 0 && bad.length === 0, `${tag} ${label}: ${found.length} numbers, all clear 8-bit or reading digits, unclipped, 10px+ ${JSON.stringify(bad)}`);
        return found;
      };
      const holdClock = async () => { await page.locator('#clock').focus(); await page.keyboard.down('Enter'); await page.waitForTimeout(3250); await page.keyboard.up('Enter'); };
      const inertOutside = () => page.evaluate(() => ['#status', '#apps', '#call'].map(q => document.querySelector(q).inert));

      // the parent entry
      const entry = page.getByRole('button', {name:/Parent settings: hold for 3 seconds/});
      check(await entry.count() === 1 && await page.locator('#status').getAttribute('aria-hidden') === null, `${tag}: the clock is a named button that assistive tech can reach (the status bar isn't hidden)`);
      check(await page.locator('#status > .sicons').getAttribute('aria-hidden') === 'true', `${tag}: the battery and signal icons stay hidden as decoration`);
      const box = await page.locator('#clock').boundingBox();
      await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); await page.waitForTimeout(400);
      check(await page.locator('#settings').isHidden(), `${tag}: a quick tap on the clock doesn't open Settings`);

      // Settings: focus stays inside, the rest is out of reach, Escape returns to the clock
      await holdClock(); await page.locator('#settings').waitFor({state:'visible'});
      check(await page.evaluate(() => document.activeElement.id) === 'doneBtn', `${tag}: holding the clock opens Settings with focus on Done`);
      check((await inertOutside()).every(Boolean), `${tag}: while Settings is open, the status bar, the apps and the call screen are inert`);
      await page.keyboard.press('Shift+Tab');
      check(await page.evaluate(() => !!document.activeElement.closest('#settings')), `${tag}: Shift+Tab from the first control wraps inside Settings`);
      check(await page.locator('#doneBtn').evaluate(el => getComputedStyle(el).textShadow !== 'none'), `${tag}: the white Done label has its ink outline`);
      // numbers in Settings, scrolled through
      const sheet = page.locator('#settings .sheet'), height = await sheet.evaluate(e => e.scrollHeight);
      let inSettings = 0;
      for (let y = 0; y < height; y += Math.round(viewport.height*.6)){ await sheet.evaluate((e, y) => { e.scrollTop = y; }, y); inSettings += (await page.evaluate(auditDigits)).filter(x => !x.clear || x.clip || x.size < 10).length; }
      check(inSettings === 0, `${tag} settings: every number on the sheet is clear and unclipped`);
      await page.keyboard.press('Escape');
      check(await page.locator('#settings').isHidden() && await page.evaluate(() => document.activeElement.id) === 'clock', `${tag}: Escape closes Settings and focus returns to the clock`);
      check((await inertOutside()).every(x => !x), `${tag}: after closing, nothing is left inert`);

      // the screens with numbers
      await digits('home');
      await go('phone'); await page.locator('[data-ptab="keypad"]').tap(); await page.waitForTimeout(250);
      for (const k of ['2', '8', '1', '7', '5']) await page.locator(`#keys .key[aria-label="${k}"]`).tap();
      const keypad = await digits('keypad and dialed number');
      check(['1', '2', '5', '7', '8'].every(d => keypad.some(x => x.text === d)), `${tag}: the keypad's digits were checked`);
      await page.locator('[data-ptab="contacts"]').tap(); await page.waitForTimeout(250);
      await page.locator('#contacts .contact').first().tap(); await page.waitForFunction(() => window.__toyPhone.call() === 'talking', null, {timeout:15000});
      const callNums = await digits('call timer');
      check(callNums.some(x => /^\d\d:\d\d$/.test(x.text)), `${tag}: the call timer was checked`);
      await page.locator('#hangupBtn').tap(); await page.waitForTimeout(1200);
      await go('photos'); await page.locator('#pgrid button').nth(1).tap(); await page.waitForTimeout(350);
      check((await digits('photo viewer')).some(x => x.text === '2 / 24'), `${tag}: the photo counter "2 / 24" was checked`);
      await page.keyboard.press('Escape');
      for (const a of ['school', 'games']) await (async () => { await go(a); await digits(a + ' menu'); })();

      // the PIN screen
      await page.evaluate(() => localStorage.setItem('toyphone.access', JSON.stringify({mode:'full', pin:{salt:'00', hash:'none'}, pinEnabled:true})));
      await page.reload(); await page.waitForFunction(() => window.__toyPhone); await page.evaluate(() => document.fonts.ready);
      await holdClock(); await page.locator('#parentGate').waitFor({state:'visible'});
      check((await inertOutside()).every(Boolean) && await page.evaluate(() => document.activeElement.id) === 'pinCancel', `${tag}: the PIN screen opens with focus inside and the rest inert`);
      await page.keyboard.press('2'); await page.keyboard.press('8');
      check(await page.locator('#pinSaid').textContent() === '2 of 4 digits entered' && await page.locator('#pinSaid').getAttribute('aria-live') === 'polite', `${tag}: the PIN screen tells a screen reader how many digits are in`);
      check((await digits('PIN keys')).filter(x => /^\d$/.test(x.text)).length === 10, `${tag}: all ten PIN keys were checked`);
      await page.keyboard.press('Tab');
      check(await page.evaluate(() => !!document.activeElement.closest('#parentGate')), `${tag}: Tab stays inside the PIN screen`);
      await page.keyboard.press('Escape');
      check(await page.locator('#parentGate').isHidden() && await page.evaluate(() => document.activeElement.id) === 'clock' && (await inertOutside()).every(x => !x),
        `${tag}: Escape on the PIN screen returns focus to the clock, nothing left inert`);
      await holdClock(); await page.locator('#parentGate').waitFor({state:'visible'});
      await page.locator('#homeBtn').tap(); await page.waitForTimeout(300);
      check(await page.locator('#parentGate').isHidden() && await page.locator('#settings').isHidden() && (await inertOutside()).every(x => !x), `${tag}: Home still closes the PIN screen, like a phone's own button`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }

    // reduced motion: loops play once; a flying treat is instant
    const context = await browser.newContext({viewport:{width:390, height:844}, hasTouch:true, isMobile:true, reducedMotion:'reduce'});
    await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
    await context.addInitScript(s => localStorage.setItem('toyphone.settings', JSON.stringify(s)), SETTINGS);
    const page = await context.newPage();
    await page.goto(base); await page.waitForFunction(() => window.__toyPhone);
    const counts = await page.evaluate(() => [...document.querySelectorAll('#breakTime .bt-zzz, .lesson-replay, #home .appicon')].map(e => getComputedStyle(e).animationIterationCount));
    check(counts.length > 0 && counts.every(c => c === '1'), `reduced motion: CSS animations play once, never a fast loop (${[...new Set(counts)]})`);
    await page.evaluate(() => window.__toyPhone.go('dinobuddies')); await page.waitForTimeout(500);
    await page.locator('#dinobuddies .who-btn').last().tap(); await page.waitForTimeout(400);   // (two players: both halves feed the egg)
    const side = await page.locator('#dinobuddies [role=button]').last().boundingBox(), fill = await page.evaluate(() => window.__toyPhone.dino().fill);
    await page.touchscreen.tap(side.x + side.width/2, side.y + side.height/2); await page.waitForTimeout(30);
    const long = await page.evaluate(() => document.getAnimations().filter(a => !(window.CSSAnimation && a instanceof CSSAnimation) && !(window.CSSTransition && a instanceof CSSTransition)).map(a => a.effect.getTiming().duration).filter(d => d > 1));
    await page.waitForTimeout(300);
    check(await page.evaluate(() => window.__toyPhone.dino().fill) > fill, 'reduced motion: a tap still feeds the egg');
    check(long.length === 0, `reduced motion: flying treats in Dino Buddies don't glide (${JSON.stringify(long)})`);
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
