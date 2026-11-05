/* Match Up, the flip-two memory game, with real taps:
   - it's in the Games menu, second, for one player;
   - it starts at 3x3: four pairs and a star in the middle that's always up; then 4x4 (eight pairs); then 5x5
     (twelve pairs and a star), and 5x5 again after that;
   - every card starts face down; a tap turns it over and the animal makes its call; no two pairs on a board are the same
     animal, and every animal on a board has a different call (so pairs can be found by ear);
   - two that don't match stay up for a moment and turn back by themselves; a tap on a third card turns them back at once;
   - two that match stay up, glow and get praise ("Just the same!"); a matched card can't be turned back;
   - when every pair is found: "Hooray!", then the next board and "Find the same one!";
   - the board is square and fits on screen, the cards are big enough for a small finger, and leaving stops everything.
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
const SHOTS = process.env.SHOTS;   // a folder: also save a picture of each board

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const [viewport, reducedMotion] of [[{width:390, height:844}, 'no-preference'], [{width:844, height:390}, 'reduce'], [{width:390, height:664}, 'no-preference']]){
      const tag = `${viewport.width}x${viewport.height}${reducedMotion === 'reduce' ? ' (reduced motion)' : ''}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true, reducedMotion});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        let s = 4242; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;   // (the same cards every run)
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      const st = () => page.evaluate(() => window.__toyPhone.match());
      const said = () => page.evaluate(() => window.__toyPhone.voice().log.map(l => typeof l === 'string' ? l : l.text));
      const sayWait = (line, after, timeout = 9000) => page.waitForFunction(([t, n]) => window.__toyPhone.voice().log.slice(n).some(l => (typeof l === 'string' ? l : l.text) === t), [line, after], {timeout});
      const cardEls = () => page.locator('#muBoard .mu-card:not(.mu-free)');
      const touch = async i => { const box = await cardEls().nth(i).boundingBox(); await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); };

      await page.evaluate(() => window.__toyPhone.go('games')); await page.waitForTimeout(400);
      const names = await page.$$eval('#gameList .gamecard', cs => cs.map(c => c.getAttribute('aria-label')));
      check(names[1] === 'Match Up', `${tag}: Match Up is second in the Games menu ${JSON.stringify(names)}`);
      const card = page.locator('.gamecard[aria-label="Match Up"]');
      await card.scrollIntoViewIfNeeded(); const cb = await card.boundingBox();
      let n0 = (await said()).length;
      await page.touchscreen.tap(cb.x + cb.width/2, cb.y + cb.height/2);
      await page.waitForFunction(() => !document.querySelector('#matchup').hidden);
      await sayWait('Find the same one!', n0);
      check(true, `${tag}: tapping its card opens it and says "Find the same one!"`);

      for (const [lv, size, pairs] of [[0, 3, 4], [1, 4, 8], [2, 5, 12], [2, 5, 12]]){
        await page.waitForTimeout(500);
        let s = await st();
        check(s.level === lv && s.n === size && s.need === pairs && s.cards.length === pairs*2, `${tag}: board ${size}x${size} with ${pairs} pairs`);
        check(s.cards.every(c => !c.up && !c.got), `${tag}: ${size}x${size}: every card starts face down`);
        const kinds = [...new Set(s.cards.map(c => c.a))];
        check(kinds.length === pairs && kinds.every(k => s.cards.filter(c => c.a === k).length === 2), `${tag}: ${size}x${size}: each animal is on exactly two cards`);
        const calls = await page.evaluate(ks => ks.map(k => window.__toyPhone.matchCall(k)), kinds);
        check(new Set(calls).size === kinds.length && calls.every(Boolean), `${tag}: ${size}x${size}: every animal on the board has its own call ${JSON.stringify(calls)}`);
        const free = await page.locator('#muBoard .mu-free').count();
        check(free === (size % 2), `${tag}: ${size}x${size}: ${size % 2 ? 'a star in the middle' : 'no star'}`);
        if (free){ const all = await page.$$eval('#muBoard > .mu-card', cs => cs.findIndex(c => c.classList.contains('mu-free'))); check(all === (size*size - 1)/2, `${tag}: ${size}x${size}: the star is in the very middle`); }
        const bb = await page.locator('#muBoard').boundingBox();
        check(Math.abs(bb.width - bb.height) < 2 && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= viewport.width && bb.y + bb.height <= viewport.height, `${tag}: ${size}x${size}: the board is square and on screen ${JSON.stringify(bb)}`);
        const cbox = await cardEls().first().boundingBox();
        check(cbox.width >= 48 && cbox.height >= 48, `${tag}: ${size}x${size}: cards are at least 48px (${Math.round(cbox.width)}x${Math.round(cbox.height)})`);
        const back = await page.locator('#muSteps').boundingBox(), gb = await page.locator('#matchup .game-back').boundingBox();
        check(!(gb.x < bb.x + bb.width && gb.x + gb.width > bb.x && gb.y < bb.y + bb.height && gb.y + gb.height > bb.y), `${tag}: ${size}x${size}: the Games button is clear of the cards`);
        check(await page.locator('#muSteps .mu-step.on').count() === 1 && back.width > 0, `${tag}: ${size}x${size}: the three board pictures show which board this is`);
        if (SHOTS) await page.screenshot({path:path.join(SHOTS, `match-${viewport.width}x${viewport.height}-${size}.png`)});

        // a wrong pair first: both stay up, then turn back by themselves
        const firstA = s.cards[0].a, other = s.cards.findIndex(c => c.a !== firstA);
        await touch(0); await page.waitForTimeout(150);
        check((await st()).cards[0].up, `${tag}: ${size}x${size}: a tap turns a card over`);
        await touch(other); await page.waitForTimeout(250);
        s = await st();
        check(s.cards[0].up && s.cards[other].up && !s.cards[0].got, `${tag}: ${size}x${size}: two different animals stay up for a moment`);
        if (lv === 0 && size === 3){
          await page.waitForFunction(() => window.__toyPhone.match().cards.every(c => !c.up), null, {timeout:5000});
          check(true, `${tag}: ...and turn back over by themselves`);
          // a wrong pair, then a tap on a third card: the two turn back at once and the third turns up
          const third = s.cards.findIndex((c, i) => i !== 0 && i !== other && c.a !== firstA);
          await touch(0); await page.waitForTimeout(120); await touch(other); await page.waitForTimeout(200); await touch(third); await page.waitForTimeout(150);
          s = await st();
          check(!s.cards[0].up && !s.cards[other].up && s.cards[third].up, `${tag}: a tap on a third card turns the wrong two back at once`);
          await touch(s.cards.findIndex(c => c.a !== s.cards[third].a)); await page.waitForTimeout(150);   // (one more, so the third has a wrong partner and turns back)
          await page.waitForFunction(() => window.__toyPhone.match().cards.every(c => !c.up), null, {timeout:5000});
        } else await page.waitForFunction(() => window.__toyPhone.match().cards.every(c => !c.up), null, {timeout:5000});

        // now every pair, the way a kid who remembers does it
        const done = new Set();
        for (let i = 0; i < s.cards.length; i++){
          if (done.has(i)) continue;
          const j = s.cards.findIndex((c, k) => k !== i && c.a === s.cards[i].a);
          done.add(i); done.add(j);
          n0 = (await said()).length;
          await touch(i); await page.waitForTimeout(120); await touch(j);
          const last = done.size === s.cards.length;
          await page.waitForFunction(([a, b]) => { const c = window.__toyPhone.match().cards; return c[a].got && c[b].got; }, [i, j], {timeout:5000});
          if (!last){
            await page.waitForFunction(n => window.__toyPhone.voice().log.length > n, n0, {timeout:6000});
            const line = (await said()).slice(n0).pop();
            if (done.size === 2) check(['Just the same!', 'Yay!', 'Yes! Just the same!', 'Wow!'].includes(line), `${tag}: ${size}x${size}: a match stays up and gets praise ("${line}")`);
            if (done.size === 2){ await touch(i); await page.waitForTimeout(150); check((await st()).cards[i].up, `${tag}: ${size}x${size}: a matched card stays up when tapped`); }
            await page.waitForTimeout(250);
          } else {
            await sayWait('Hooray!', n0);
            check((await page.$$eval('#muBoard .mu-card.got', cs => cs.length)) === s.cards.length, `${tag}: ${size}x${size}: every pair found: all glow and "Hooray!"`);
            await sayWait('Find the same one!', n0, 12000);
          }
        }
      }

      // a star tap does nothing to the game; leaving stops it
      await page.locator('#muBoard .mu-free').tap(); await page.waitForTimeout(150);
      check((await st()).cards.every(c => !c.up), `${tag}: tapping the star turns nothing over`);
      await touch(0); await page.waitForTimeout(100);
      await page.locator('#matchup .game-back').tap(); await page.waitForTimeout(500);
      check(await page.locator('#games').isVisible() && await page.evaluate(() => window.__toyPhone.timers()) === 0, `${tag}: the Games button goes back to the menu and leaves no timers running`);
      await page.evaluate(() => window.__toyPhone.go('matchup')); await page.waitForTimeout(400);
      check((await st()).n === 3, `${tag}: opening it again starts at 3x3`);
      const fb = (await page.evaluate(() => window.__toyPhone.voice())).fallbacks;
      check(!fb.length, `${tag}: every line said was a recorded clip ${JSON.stringify(fb.slice(0, 4))}`);
      check(!errors.length, `${tag}: no JavaScript errors ${errors.slice(0, 3).join(' | ')}`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
