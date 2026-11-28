/* Train Tracks, the track puzzle, with real taps:
   - it's in the Games menu, fifth, for one player, and its card opens it on the farm: "Turn the tracks! Help the train
     get to the station!", "Tap a track to turn it!", a short line of three pieces and a hand on the one that's wrong;
   - a tap turns a piece on a wooden plate a quarter (a piece without a plate doesn't turn); the rails glow gold from the
     engine as far as they join up, further with each right turn;
   - joined up to the station: "All aboard! Choo choo!", the train follows the rails, picks up every animal by the track
     (each into its own car) and pulls in; praise, a step lit along the top, the next puzzle;
   - all 28 puzzles of the journey, made fresh: the route joins the engine's side to the station's, passes every
     passenger, starts unsolved, and grows: from 3 pieces to a 6 x 5 grid, 0 to 3 passengers, decoys, full grids;
   - twelve taps that don't reach further: one piece of the route that's still wrong glows ("Try turning this one!");
   - four puzzles finish a place: "Off to the forest!", "Welcome to the forest!"; the map picks any place (stars on the
     finished ones); after Dino Land: "You drove the train all the way! Wow!" and round again, all at the hardest;
   - the hardest puzzle fits the screen with cells a finger can hit, clear of the controls, and is solved by tapping.
   Portrait (the journey), landscape with Reduce Motion, and short Safari. Run in Chromium, or with --webkit. */
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
const SHOTS = process.env.SHOTS;
const YAY = ['You did it!', 'Great driving!', 'The train made it!', 'Toot toot! Hooray!'];

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const [viewport, reducedMotion, full] of [[{width:390, height:844}, 'no-preference', true], [{width:844, height:390}, 'reduce', false], [{width:390, height:664}, 'no-preference', false]]){
      const tag = `${viewport.width}x${viewport.height}${reducedMotion === 'reduce' ? ' (reduced motion)' : ''}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true, reducedMotion});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        let s = 2024; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;   // (the same puzzles every run)
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      const st = () => page.evaluate(() => window.__toyPhone.tracks());
      const log = () => page.evaluate(() => window.__toyPhone.voice().log.length);
      const said = n => page.evaluate(n => window.__toyPhone.voice().log.slice(n).map(l => typeof l === 'string' ? l : l.text), n);
      const sayWait = (line, after, timeout = 15000) => page.waitForFunction(([t, n]) => window.__toyPhone.voice().log.slice(n).some(l => (typeof l === 'string' ? l : l.text) === t), [line, after], {timeout});
      const modeWait = (m, timeout = 25000) => page.waitForFunction(m => window.__toyPhone.tracks().mode === m, m, {timeout});
      const cellAt = (r, c) => page.locator(`#ctBoard .ct-cell[data-r="${r}"][data-c="${c}"]`);
      const touch = async (r, c) => { const b = await cellAt(r, c).boundingBox(); await page.touchscreen.tap(b.x + b.width/2, b.y + b.height/2); };
      const shot = async name => { if (SHOTS) await page.screenshot({path:path.join(SHOTS, `tracks-${viewport.width}x${viewport.height}-${name}.png`)}); };
      // solve by tapping the route's pieces in order; with the first k pieces right, at least k glow (a wrong piece can lead
      // the gold off along a decoy for a moment, so it isn't always longer than before, but it always covers what's right)
      const solve = async (strict = true) => {
        await page.waitForFunction(() => !document.querySelector('#ctBoard').getAnimations().length, null, {timeout:5000});   // (once the new board has zoomed in)
        const s = await st(); let covered = true;
        for (const [i, [r, c]] of s.route.entries()){
          for (let k = 0; k < 4 && !(await st()).cells.find(x => x.r === r && x.c === c).ok; k++){ await touch(r, c); await page.waitForTimeout(120); }
          const now = await st();
          if (now.mode !== 'play' && now.mode !== 'intro') break;   // (the train has gone)
          if (now.lit < i + 1) covered = false;
        }
        if (strict) check(covered, `${tag}: ${s.place} ${s.level + 1}: the gold covers every piece put right, from the engine on`);
      };
      const ride = async (s, n0) => {
        await sayWait('All aboard! Choo choo!', n0);
        await page.waitForFunction(() => ['arrive', 'travel', 'intro', 'play'].includes(window.__toyPhone.tracks().mode) && window.__toyPhone.tracks().mode !== 'ride', null, {timeout:30000});
        const after = await said(n0);
        check(after.some(l => YAY.includes(l)) || await page.waitForFunction(([n, y]) => window.__toyPhone.voice().log.slice(n).some(l => y.includes(typeof l === 'string' ? l : l.text)), [n0, YAY], {timeout:9000}).then(() => true),
          `${tag}: ${s.place} ${s.level + 1}: the train goes ("All aboard!"), pulls into the station, and gets praise`);
      };

      // 1. the card, and the first puzzle on the farm
      await page.evaluate(() => window.__toyPhone.go('games')); await page.waitForTimeout(400);
      const names = await page.$$eval('#gameList .gamecard', cs => cs.map(c => c.getAttribute('aria-label')));
      check(names[4] === 'Train Tracks', `${tag}: Train Tracks is fifth in the Games menu ${JSON.stringify(names)}`);
      const card = page.locator('.gamecard[aria-label="Train Tracks"]');
      check((await card.locator('.gplay').textContent()).trim() === '1 player', `${tag}: its card says 1 player`);
      await card.scrollIntoViewIfNeeded(); const cb = await card.boundingBox(); const n0 = await log();
      await page.touchscreen.tap(cb.x + cb.width/2, cb.y + cb.height/2);
      await page.waitForFunction(() => !document.querySelector('#tracks').hidden);
      await sayWait('Turn the tracks! Help the train get to the station!', n0); await sayWait('Tap a track to turn it!', n0);
      await modeWait('play'); await page.waitForTimeout(400);
      let s = await st();
      check(s.place === 'farm' && s.level === 0 && s.route.length === 3 && s.cells.filter(c => c.turns).length === 1 && !s.done, `${tag}: it opens on the farm: a line of three pieces, one to turn`);
      check(await page.locator('#ctHand').isVisible(), `${tag}: a hand shows which piece to tap`);
      await shot('first');
      const fixed = s.cells.find(c => !c.turns), turnable = s.cells.find(c => c.turns);
      const tf0 = await cellAt(fixed.r, fixed.c).locator('img').evaluate(i => i.style.transform);
      await touch(fixed.r, fixed.c); await page.waitForTimeout(250);
      check(await cellAt(fixed.r, fixed.c).locator('img').evaluate(i => i.style.transform) === tf0 && (await st()).cells.find(c => c.r === fixed.r && c.c === fixed.c).ok, `${tag}: a piece without a plate doesn't turn`);
      const lit0 = (await st()).lit, n1 = await log();
      await touch(turnable.r, turnable.c);
      s = await st();
      check(s.lit === 3 && s.done && s.mode === 'ride' && await page.locator('#ctHand').isHidden(), `${tag}: one tap turns it: the gold runs all the way (${lit0} to ${s.lit} pieces), the hand goes, the train goes`);
      await ride(s, n1);
      await page.waitForFunction(() => window.__toyPhone.tracks().level === 1, null, {timeout:15000});
      check((await page.locator('#ctSteps .ct-step.done').count()) === 1, `${tag}: the next puzzle, and one step lit along the top`);

      // 2. every puzzle of the journey is well made (fresh each time)
      const plan = [];
      for (let p = 0; p < 7; p++) for (let l = 0; l < 4; l++){
        await page.evaluate(([p, l]) => window.__toyPhone.tracksJump(p, l), [p, l]); await page.waitForTimeout(80);
        const q = await st();
        const onRoute = new Set(q.route.map(([r, c]) => r + ',' + c)), riders = q.cells.filter(c => c.pass);
        plan.push({p, l, cells:q.Wd*q.Ht, route:q.route.length, riders:riders.length, decoys:q.cells.filter(c => c.decoy).length, wrong:q.cells.filter(c => c.step >= 0 && !c.ok).length,
          ok:!q.done && riders.every(c => onRoute.has(c.r + ',' + c.c) && c.step > 0 && c.step < q.route.length - 1) && q.cells.filter(c => c.step >= 0).length === q.route.length});
      }
      check(plan.every(x => x.ok && x.wrong >= 1), `${tag}: all 28 puzzles: the route passes every passenger (never its first or last piece) and starts unsolved`);
      const at = (p, l) => plan.find(x => x.p === p && x.l === l);
      check(at(0, 0).cells === 3 && at(6, 3).cells === 30 && at(0, 0).riders === 0 && at(1, 0).riders === 1 && at(2, 2).riders === 2 && at(6, 3).riders === 3 && at(0, 3).decoys === 0 && at(1, 2).decoys > 0 && at(3, 0).decoys + at(3, 0).route === at(3, 0).cells,
        `${tag}: they grow: ${plan.filter(x => x.l === 0).map(x => `${x.cells} cells/${x.route} route/${x.riders} riders`).join(', ')}`);

      // 3. a passenger, picked up on the way (forest)
      await page.evaluate(() => window.__toyPhone.tracksJump(1, 0)); await modeWait('play');
      s = await st(); const rider = s.cells.find(c => c.pass);
      check(s.goal === `Pick up the ${rider.pass === 'dog' ? 'puppy' : rider.pass} on the way!` || /^Pick up the .+ on the way!$/.test(s.goal), `${tag}: a passenger by the track: "${s.goal}"`);
      // stuck: twelve taps that don't reach further make a wrong piece of the route glow
      const decoy = s.cells.find(c => c.decoy);
      if (decoy && full){
        const n2 = await log();
        for (let k = 0; k < 12; k++){ await touch(decoy.r, decoy.c); await page.waitForTimeout(150); }
        const h = (await st()).hint, hc = (await st()).cells.find(c => h && c.r === h[0] && c.c === h[1]);
        check(!!h, `${tag}: the hint is already visible while the child is still tapping`);
        await sayWait('Try turning this one!', n2, 6000);
        check(hc && hc.step >= 0 && !hc.ok && await cellAt(h[0], h[1]).evaluate(e => e.classList.contains('hint')), `${tag}: twelve taps that don't help: a wrong piece of the route glows ("Try turning this one!")`);
      }
      let n3 = await log(); await solve();
      await ride(s, n3);
      check((await st()).picked.length === 1, `${tag}: the ${rider.pass} got on (its own car)`);

      // 4. the hardest puzzle: fits, a finger can hit it, clear of the controls, solved by tapping
      await page.evaluate(() => window.__toyPhone.tracksJump(6, 3)); await modeWait('play'); await page.waitForTimeout(450);
      s = await st();
      const boxes = await page.$$eval('#ctBoard .ct-cell', cs => cs.map(c => { const r = c.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; }));
      const ctrl = await page.$$eval('#tracks .game-back, #tracks .round', cs => cs.map(c => { const r = c.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; }));
      const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      check(boxes.every(b => b.w >= 50 && b.x >= 0 && b.y >= 0 && b.x + b.w <= viewport.width + 1 && b.y + b.h <= viewport.height + 1) && !boxes.some(b => ctrl.some(c => hit(b, c))),
        `${tag}: Dino Land 4: ${s.Wd}x${s.Ht}, cells ${Math.round(boxes[0].w)}px, all on screen and clear of the controls`);
      await shot('hardest');

      if (full){   // (solving the hardest and the round after it take a while in WebKit; the other layouts check it fits and ride the forest puzzle)
        n3 = await log(); await solve(); await ride(s, n3);
        check((await st()).picked.length === 3, `${tag}: all three passengers ride along ${JSON.stringify((await st()).picked)}`);
        await sayWait('You drove the train all the way! Wow!', n3, 20000);
        await page.waitForFunction(() => window.__toyPhone.tracks().place === 'farm' && window.__toyPhone.tracks().mode === 'play', null, {timeout:30000});
        s = await st();
        check(s.lap === 1 && s.Wd*s.Ht === 30 && s.cells.filter(c => c.pass).length === 3, `${tag}: after Dino Land: "You drove the train all the way! Wow!" and round again from the farm, at the hardest (${s.Wd}x${s.Ht})`);

        // 5. a whole place: four puzzles, then the train goes on (farm)
        await page.evaluate(() => window.__toyPhone.tracksJump(0, 0)); await modeWait('play');
        for (let l = 0; l < 4; l++){
          s = await st(); const n4 = await log(); await solve(l > 0); await ride(s, n4);
          if (l < 3) await page.waitForFunction(l => window.__toyPhone.tracks().level === l + 1, l, {timeout:15000});
        }
        const n5 = (await log()) - 3;
        await sayWait('Off to the forest!', n5, 20000); await sayWait('Welcome to the forest!', n5, 20000);
        s = await st();
        check(s.place === 'forest' && s.level === 0 && s.visited.includes('farm'), `${tag}: four puzzles finish the farm: "Off to the forest!", "Welcome to the forest!"`);
        // 6. the map
        const n6 = await log(); await page.locator('#ctMapBtn').tap(); await sayWait('Where shall we go?', n6);
        const cards = await page.$$eval('#ctMap .st-place', cs => cs.map(c => ({k:c.dataset.place, star:!!c.querySelector('.st-place-star')})));
        check(cards.length === 7 && cards.find(c => c.k === 'farm').star && !cards.find(c => c.k === 'jungle').star, `${tag}: the map: seven places, a star on the farm`);
        await shot('map');
        await page.locator('#ctMap .st-place[data-place="seaside"]').tap(); await modeWait('play');
        s = await st(); check(s.place === 'seaside' && s.level === 0 && await page.locator('#ctMap').isHidden(), `${tag}: a tap on the seaside goes there`);
        // the map picked while the train goes on to the next place: the new puzzle shows (it used to stay hidden, slid away)
        await page.evaluate(() => window.__toyPhone.tracksJump(0, 3)); await modeWait('play');
        s = await st(); const n7 = await log(); await solve(false); await ride(s, n7);
        await modeWait('travel', 30000); await page.waitForTimeout(300);
        await page.locator('#ctMapBtn').tap(); await page.waitForTimeout(300);
        await page.locator('#ctMap .st-place[data-place="jungle"]').tap(); await modeWait('play'); await page.waitForTimeout(500);
        const look = await page.locator('#ctBoard').evaluate(b => { const cs = getComputedStyle(b), r = b.getBoundingClientRect(); return {opacity:cs.opacity, transform:cs.transform, left:r.left, right:r.right}; });
        check((await st()).place === 'jungle' && look.opacity === '1' && look.transform === 'none' && look.left >= 0 && look.right <= viewport.width,
          `${tag}: the map picked on the way to the next place: the new puzzle shows ${JSON.stringify(look)}`);
      }

      if (viewport.width > viewport.height){
        const opener = page.locator('#ctMapBtn'), farm = page.locator('#ctMap [data-place="farm"]');
        await opener.tap();
        await farm.waitFor();
        const box = await farm.boundingBox();
        await page.touchscreen.tap(box.x + 8, box.y + box.height / 2);
        check(!(await st()).map && (await st()).place === 'farm', `${tag}: the Farm card responds right to its left edge`);
        await modeWait('play'); await page.waitForTimeout(150);

        await opener.press('Enter');
        check(await farm.evaluate(b => document.activeElement === b), `${tag}: opening the map by keyboard focuses the current place`);
        await page.keyboard.press('Shift+Tab');
        check(await opener.evaluate(b => document.activeElement === b), `${tag}: the map button is adjacent to the cards in tab order`);
        await page.keyboard.press('Shift+Tab');
        check(await page.locator('#tracks .game-back').evaluate(b => document.activeElement === b), `${tag}: Games is reachable from the map by keyboard`);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        check(!(await st()).map && await opener.evaluate(b => document.activeElement === b), `${tag}: choosing a place by keyboard returns focus to the map button`);
      }

      // the Games button goes back, and leaving stops it
      await page.locator('#tracks .game-back').tap(); await page.waitForTimeout(500);
      check(await page.locator('#games').isVisible() && (await st()).mode === 'off', `${tag}: the Games button goes back to the Games menu and stops the game`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
