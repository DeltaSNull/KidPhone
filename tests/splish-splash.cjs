/* Splish Splash, the bath game, with real taps and rubs:
   - it's in the Games menu, third, for one player; its card opens it with "Splish splash!";
   - the pig always comes first ("Here comes the pig! Tap to jump in the mud!"); a tap makes it jump into the puddle,
     and an animal nobody taps jumps in by itself;
   - mud lands on the animal; rubbing the animal turns mud into foam (rubbing the sky does nothing), with a hand that
     shows how for the first animal and a spoken hint when nobody rubs;
   - once most of it is foam the rest foams by itself and it's time to rinse; rubbing rinses, and a finger held still
     keeps the water running and spreading;
   - clean: praise, then the animal walks off into the row of clean friends and the next one (a different animal) comes;
   - five clean friends: a bubble party with the friends in bubbles to pop, then a new row starts;
   - every animal has its own call; the rubber duck squeaks without changing the game; leaving stops everything and
     opening it again starts over with the pig.
   Portrait, landscape with Reduce Motion, and short Safari. Run in Chromium, or with --webkit. */
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
const SHOTS = process.env.SHOTS;   // a folder: also save pictures along the way
const CLEAN = ['Squeaky clean!', 'All clean!', 'Sparkly clean!', 'So shiny!'];

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const [viewport, reducedMotion] of [[{width:390, height:844}, 'no-preference'], [{width:844, height:390}, 'reduce'], [{width:390, height:664}, 'no-preference']]){
      const tag = `${viewport.width}x${viewport.height}${reducedMotion === 'reduce' ? ' (reduced motion)' : ''}`, first = viewport.height === 844;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true, reducedMotion});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        let s = 777; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;   // (the same baths every run)
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      const st = () => page.evaluate(() => window.__toyPhone.splish());
      const said = () => page.evaluate(() => window.__toyPhone.voice().log.map(l => typeof l === 'string' ? l : l.text));
      const sayWait = (lines, after, timeout = 12000) => page.waitForFunction(([ts, n]) => window.__toyPhone.voice().log.slice(n).some(l => ts.includes(typeof l === 'string' ? l : l.text)), [[].concat(lines), after], {timeout});
      const modeWait = (m, timeout = 15000) => page.waitForFunction(m => window.__toyPhone.splish().mode === m, m, {timeout});
      const shot = async name => { if (SHOTS) await page.screenshot({path:path.join(SHOTS, `splish-${viewport.width}x${viewport.height}-${name}.png`)}); };
      const pal = () => page.locator('#ssPal').boundingBox();
      /* rub the way a child does: back and forth across the animal, a row at a time, until it moves on */
      const rub = async (until, rows = 40) => {
        const b = await pal();
        for (let k = 0; k < rows; k++){
          if ((await st()).mode !== until) return k;
          const y = b.y + b.height*(.25 + .08*(k % 10));
          await page.mouse.move(b.x + b.width*.05, y); await page.mouse.down();
          for (let s = 1; s <= 8; s++){ await page.mouse.move(b.x + b.width*(.05 + .11*s), y + (s % 2 ? 6 : -6)); await page.waitForTimeout(12); }
          await page.mouse.up(); await page.waitForTimeout(30);
        }
        return rows;
      };

      await page.evaluate(() => window.__toyPhone.go('games')); await page.waitForTimeout(400);
      const names = await page.$$eval('#gameList .gamecard', cs => cs.map(c => c.getAttribute('aria-label')));
      check(names[2] === 'Splish Splash', `${tag}: Splish Splash is third in the Games menu ${JSON.stringify(names)}`);
      const card = page.locator('.gamecard[aria-label="Splish Splash"]');
      await card.scrollIntoViewIfNeeded(); const cb = await card.boundingBox();
      let n0 = (await said()).length;
      await page.touchscreen.tap(cb.x + cb.width/2, cb.y + cb.height/2);
      await page.waitForFunction(() => !document.querySelector('#splish').hidden);
      await sayWait('Splish splash!', n0); await sayWait('Here comes the pig! Tap to jump in the mud!', n0);
      let s = await st();
      check(s.a === 'pig' && s.mode === 'jump' && s.mud === 0, `${tag}: it opens with "Splish splash!", and the pig comes first and asks to jump in`);

      const calls = await page.evaluate(ks => ks.map(k => window.__toyPhone.splishCall(k)), s.pool);
      check(s.pool.length >= 15 && new Set(calls).size === s.pool.length && calls.every(Boolean), `${tag}: ${s.pool.length} animals, each with its own call`);
      const pics = await page.evaluate(ks => ks.map(k => !!window.__toyPhone.pic(k)), s.pool);
      check(pics.every(Boolean), `${tag}: every animal has a picture`);

      // the scene: a big animal over the puddle, on screen, clear of the Games button; the duck too
      let b = await pal(); const pud = await page.locator('#splish .ss-puddle').boundingBox(), back = await page.locator('#splish .game-back').boundingBox(), dk = await page.locator('#ssDuck').boundingBox();
      const hit = (p, q) => p.x < q.x + q.width - 1 && q.x < p.x + p.width - 1 && p.y < q.y + q.height - 1 && q.y < p.y + p.height - 1;
      check(b.width >= 180 && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width && b.y + b.height <= viewport.height, `${tag}: the animal is big (${Math.round(b.width)}px) and on screen`);
      check(pud.y < b.y + b.height && pud.y + pud.height > b.y + b.height && !hit(back, b) && !hit(back, dk) && dk.width >= 48, `${tag}: it stands in the puddle; the Games button is clear of it and of the duck`);
      await shot('1-arrive');

      // the duck squeaks and changes nothing
      await page.touchscreen.tap(dk.x + dk.width/2, dk.y + dk.height/2); await page.waitForTimeout(200);
      check((await st()).mode === 'jump', `${tag}: tapping the rubber duck doesn't make the animal jump`);

      n0 = (await said()).length;
      if (first){ await page.touchscreen.tap(b.x + b.width/2, b.y + b.height*.6); }
      await modeWait('scrub', first ? 3000 : 15000);
      await sayWait('Splat! So muddy! Scrub scrub scrub!', n0);
      s = await st();
      check(s.mud > 60 && s.mud === s.start && s.foam === 0 && s.hand, `${tag}: ${first ? 'a tap: it jumps' : 'nobody tapped: it jumps by itself'}; ${s.mud} pixels of mud, "Splat! So muddy!", and a hand shows how to rub`);
      await page.waitForTimeout(400); await shot('2-muddy');

      // rubbing the sky does nothing; rubbing the animal makes foam
      const sky = await page.locator('#ssStage').boundingBox();
      await page.mouse.move(sky.x + 20, sky.y + 20); await page.mouse.down(); await page.mouse.move(sky.x + 120, sky.y + 30, {steps:6}); await page.mouse.up();
      check((await st()).mud === s.mud, `${tag}: rubbing the sky cleans nothing`);
      await page.mouse.move(b.x + b.width*.2, b.y + b.height*.8); await page.mouse.down();
      await page.mouse.move(b.x + b.width*.8, b.y + b.height*.8, {steps:8}); await page.mouse.up(); await page.waitForTimeout(100);
      let t = await st();
      check(t.mud < s.mud && t.foam === s.mud - t.mud && !t.hand, `${tag}: one rub turns ${t.foam} pixels of mud into foam, and the hand goes away`);
      await shot('3-foam');

      if (first){   // nobody rubs for a while: a spoken hint and the hand again
        n0 = (await said()).length;
        await sayWait('Rub with your finger! Scrub scrub!', n0, 14000);
        check((await st()).hand, `${tag}: nobody rubs: "Rub with your finger!" and the hand comes back`);
      }

      n0 = (await said()).length;
      await rub('scrub'); await modeWait('rinse', 3000);
      await sayWait('Bubbles! Now rinse them off!', n0);
      t = await st();
      check(t.mud === 0 && t.foam > 0 && t.foam === t.start, `${tag}: most of it scrubbed, the rest foams by itself: "Bubbles! Now rinse them off!"`);
      await page.waitForTimeout(300); await shot('4-rinse');

      // a finger held still keeps the water running, and it spreads
      await page.mouse.move(b.x + b.width*.5, b.y + b.height*.45); await page.mouse.down(); await page.waitForTimeout(120);
      const f1 = (await st()).foam; await page.waitForTimeout(900); const f2 = await st();
      await page.mouse.up();
      check(f2.mode !== 'rinse' || f2.foam < f1, `${tag}: holding a finger still keeps rinsing (${f1} → ${f2.foam} foam)`);
      n0 = (await said()).length;
      await rub('rinse'); await modeWait('shine', 3000);
      check((await st()).foam === 0, `${tag}: rinsed: no mud, no foam`);
      await page.waitForTimeout(250); await shot('5-clean');
      await sayWait(CLEAN, n0);
      await page.waitForFunction(() => window.__toyPhone.splish().friends.length === 1, null, {timeout:6000});
      await modeWait('jump', 6000);
      t = await st();
      check(t.friends[0] === 'pig' && t.a !== 'pig' && await page.locator('#ssRow .ss-slot.got').count() === 1, `${tag}: clean! praise, the pig joins the row, and the ${t.a} comes next`);
      const label = await page.locator('#ssPal').getAttribute('aria-label');
      await sayWait(`Here comes the ${label}! Tap to jump in the mud!`, n0);
      check(true, `${tag}: "Here comes the ${label}! Tap to jump in the mud!"`);

      // four more baths: a bubble party
      const seen = new Set(['pig', t.a]);
      for (let i = 1; i < 5; i++){
        await modeWait('jump', 8000); seen.add((await st()).a);
        b = await pal(); await page.touchscreen.tap(b.x + b.width/2, b.y + b.height*.6);
        await modeWait('scrub', 3000); await rub('scrub'); await modeWait('rinse', 3000); await rub('rinse'); await modeWait('shine', 3000);
        await page.waitForFunction(n => window.__toyPhone.splish().friends.length === n, i + 1, {timeout:9000});
      }
      check(seen.size === 5, `${tag}: five different animals ${JSON.stringify([...seen])}`);
      n0 = (await said()).length - 2;
      await modeWait('party', 4000); await sayWait('Five clean friends! Bubble party!', n0);
      await page.waitForSelector('#ssStage .ss-pb', {timeout:4000}); await page.waitForTimeout(800);
      await shot('6-party');
      const aim = await (await page.waitForFunction(() => {   // (a bubble that has risen fully into view)
        const s = document.getElementById('ssStage').getBoundingClientRect();
        const b = [...document.querySelectorAll('#ssStage .ss-pb:not(.popped)')].map(e => e.getBoundingClientRect()).find(r => r.top > s.top && r.bottom < s.bottom - 4);
        return b && [b.left + b.width/2, b.top + b.height/2];
      }, null, {timeout:8000, polling:50})).jsonValue();
      await page.touchscreen.tap(aim[0], aim[1]); await page.waitForTimeout(80);
      check(await page.locator('#ssStage .ss-pb.popped').count() >= 1, `${tag}: the friends ride bubbles up the screen, and a tap pops one`);
      await modeWait('jump', 25000);
      t = await st();
      check(t.friends.length === 0 && await page.locator('#ssRow .ss-slot.got').count() === 0 && !(await page.locator('#ssStage .ss-pb').count()), `${tag}: after the party a new row starts with the ${t.a}`);

      // leaving stops it; opening it again starts over
      b = await pal(); await page.touchscreen.tap(b.x + b.width/2, b.y + b.height*.6); await modeWait('scrub', 3000);
      await page.mouse.move(b.x + b.width*.3, b.y + b.height*.7); await page.mouse.down(); await page.mouse.move(b.x + b.width*.7, b.y + b.height*.7, {steps:4});
      await page.evaluate(() => window.__toyPhone.go('home')); await page.mouse.up(); await page.waitForTimeout(300);   // (leaving mid-rub)
      check(await page.evaluate(() => window.__toyPhone.timers()) === 0 && (await st()).mode === 'off', `${tag}: leaving in the middle of a rub stops it`);
      await page.evaluate(() => window.__toyPhone.go('splish')); await page.waitForTimeout(400);
      await page.locator('#splish .game-back').tap(); await page.waitForTimeout(500);
      const gone = {app:await page.evaluate(() => [...document.querySelectorAll('.app')].filter(a => !a.hidden).map(a => a.id).join()), menu:await page.locator('#games').isVisible(), timers:await page.evaluate(() => window.__toyPhone.timers()), mode:(await st()).mode};
      check(gone.menu && gone.timers === 0 && gone.mode === 'off', `${tag}: the Games button goes back to the menu and leaves nothing running ${JSON.stringify(gone)}`);
      await page.evaluate(() => window.__toyPhone.go('splish')); await page.waitForTimeout(400);
      t = await st();
      check(t.a === 'pig' && t.friends.length === 0, `${tag}: opening it again starts over with the pig`);
      const fb = (await page.evaluate(() => window.__toyPhone.voice())).fallbacks;
      check(!fb.length, `${tag}: every line said was a recorded clip ${JSON.stringify(fb.slice(0, 4))}`);
      check(!errors.length, `${tag}: no JavaScript errors ${errors.slice(0, 3).join(' | ')}`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
