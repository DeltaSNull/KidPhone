/* Navigation and leaving (R-29), with real taps, in portrait and landscape:
   - every regular game has the same Games button as School's School button (the grid picture, top left, or in the
     tool row of the two-player games), 56px or more, on screen, not on top of anything the children play with or
     another control; it goes back to the Games menu. Wild Tap's inner screens step back with an arrow. Games that
     speak a goal have the berry speaker (Snack Time's is new);
   - leaving any activity (Home) stops it: no timers left for it, no voice, no new sounds, no animations left on its
     screen, no animation-frame loop still running, and sounds it had started fade out at once.
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
// what the children play with in each game: the Games button must not sit on any of it
const PLAY = {wildtap:'#wt-menu .wt-tile', snacktime:'#stFoods .st-food, #stAnimal, #stThink', dinobuddies:'.db-dino, #dbEgg', paintpals:'.pp-easel',
  balltrail:'#balltrail .mg-board', starflight:'#starflight .mg-board'};
const CONTROLS = '.round, .sc-back, .wt-back, .who-btn';
const ACTIVITIES = ['wildtap', 'dinobuddies', 'snacktime', 'paintpals', 'balltrail', 'starflight', 'letterpath', 'abczoo', 'abcsnack', 'numzoo', 'numsnack', 'delivery', 'dinopicnic',
  'sorting', 'patterntrain', 'storytime', 'feelings', 'phone', 'camera', 'photos', 'music'];

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const viewport of [{width:390, height:844}, {width:844, height:390}]){
      const tag = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        if (!localStorage.getItem('toyphone.settings')) localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        // count what keeps happening: animation frames, and sounds started (oscillators, recordings, voice clips)
        window.__raf = 0; window.__snd = 0;
        const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(t => { window.__raf++; cb(t); });
        const AC = window.AudioContext || window.webkitAudioContext;
        for (const m of ['createOscillator', 'createBufferSource']){ const f = AC.prototype[m]; AC.prototype[m] = function(){ window.__snd++; return f.call(this); }; }
      });
      const page = await context.newPage(), errors = [];
      // (WebKit reports a clip download that a reload cuts off as an "access control checks" error; the toy catches it)
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      const touch = async selector => { const box = await page.locator(selector).first().boundingBox(); await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); };
      const box = sel => page.locator(sel).evaluateAll(els => els.filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(); return {l:r.left, t:r.top, r:r.right, b:r.bottom, w:r.width, h:r.height}; }));
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);

      // 1. the Games button in every regular game
      for (const g of Object.keys(PLAY)){
        await page.evaluate(g => window.__toyPhone.go(g), g); await page.waitForTimeout(500);
        if (await page.locator(`#${g} .who-btn:visible`).count()){ await touch(`#${g} .who-btn:visible`); await page.waitForTimeout(400); }   // (two-player games ask how many first)
        const [back] = await box(`#${g} .game-back`), plays = await box(`#${g} ${PLAY[g].split(', ').join(`, #${g} `)}`.replace(`#${g} #${g}`, `#${g}`));
        const others = (await page.locator(`#${g} :is(${CONTROLS})`).evaluateAll(els => els.filter(e => !e.classList.contains('game-back') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(); return {l:r.left, t:r.top, r:r.right, b:r.bottom}; })));
        check(back && back.w >= 56 && back.h >= 56 && back.l >= 0 && back.t >= 0 && back.r <= viewport.width && back.b <= viewport.height && await page.locator(`#${g} .game-back`).getAttribute('aria-label') === 'Games',
          `${tag} ${g}: a Games button, ${back && Math.round(back.w)}px, on screen`);
        check(plays.length > 0 && !plays.some(p => hit(back, p)) && !others.some(o => hit(back, o)), `${tag} ${g}: it isn't on anything the children play with, or on another control`);
        await touch(`#${g} .game-back`); await page.waitForTimeout(400);
        check(await page.locator('#games').isVisible(), `${tag} ${g}: it goes back to the Games menu`);
      }
      await page.evaluate(() => window.__toyPhone.go('wildtap')); await page.waitForTimeout(400);
      await touch('#wildtap [data-wt="find"]'); await page.waitForTimeout(400);
      check(await page.locator('#wtRepeat').isVisible() && await page.locator('#wt-find .wt-back').evaluate(b => b.querySelector('img') && b.querySelector('img').getAttribute('alt') !== null), `${tag} wildtap: Find It has the speaker, and an arrow back to the Wild Tap menu`);
      await touch('#wt-find .wt-back'); await page.waitForTimeout(300);
      check(await page.locator('#wt-menu').isVisible(), `${tag} wildtap: the arrow steps back to the Wild Tap menu`);
      await page.evaluate(() => window.__toyPhone.go('snacktime')); await page.waitForTimeout(500);
      check(await page.locator('#snacktime').isVisible() && await page.locator('#stReplay').isHidden(), `${tag} snacktime: with "Animal names" off (the default) the wish isn't said, so there's no speaker`);
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('toyphone.settings')); s.voice = {...(s.voice || {}), names:true}; localStorage.setItem('toyphone.settings', JSON.stringify(s)); });
      await page.reload(); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded); await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      await page.evaluate(() => window.__toyPhone.go('snacktime')); await page.waitForTimeout(1600);
      const said = (await page.evaluate(() => window.__toyPhone.voice().log)).length;
      check(await page.locator('#stReplay').isVisible(), `${tag} snacktime: with it on, the berry speaker shows`);
      await touch('#stReplay'); await page.waitForTimeout(700);
      check((await page.evaluate(() => window.__toyPhone.voice().log)).length > said, `${tag} snacktime: the speaker says what the animal wants again`);

      // 2. leaving any activity stops it
      await page.evaluate(() => window.__toyPhone.go('home')); await page.waitForTimeout(800);
      const base = await page.evaluate(() => new Promise(done => { const r0 = window.__raf; setTimeout(() => done(window.__raf - r0), 1500); }));
      for (const a of ACTIVITIES){
        await page.evaluate(a => window.__toyPhone.go(a), a); await page.waitForTimeout(700);
        await page.touchscreen.tap(viewport.width/2, viewport.height*.55); await page.waitForTimeout(250);
        await page.evaluate(() => { window.__oldBus = window.__toyPhone.fxNode(); });
        await touch('#homeBtn'); await page.waitForTimeout(400);
        const after = await page.evaluate(a => new Promise(done => {
          const t = window.__toyPhone, s0 = window.__snd, r0 = window.__raf, v0 = t.voice().log.length, timers = t.timers();
          setTimeout(() => {
            const left = document.getElementById(a), anims = document.getAnimations().filter(x => x.effect && x.effect.target && left.contains(x.effect.target) && x.playState === 'running');
            done({sounds:window.__snd - s0, frames:window.__raf - r0, said:t.voice().log.length - v0, timers, anims:anims.length, speaking:t.voice().speaking,
              faded:!window.__oldBus || (window.__oldBus !== t.fxNode() && window.__oldBus.gain.value < .05)});
          }, 1500);
        }), a);
        check(after.timers === 0 && after.said === 0 && !after.speaking && after.sounds === 0 && after.anims === 0 && after.frames <= base + 6 && after.faded,
          `${tag} ${a}: leaving stops everything ${JSON.stringify(after)} (home's own frames: ${base})`);
      }
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
