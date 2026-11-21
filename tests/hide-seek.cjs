/* Hide and Seek, with real taps:
   - it's in the Games menu, fourth, for one player, and its card opens it;
   - "Here comes the zebra!": an animal walks in, makes its call, "Watch!", and hides behind one of three bushes
     (out of sight while you look for it); every animal in a row of ten is different, with its own call;
   - the first two rounds the bushes stay put; from the third they swap places (one swap, then more), and the animal is
     behind the same bush wherever it went; with Reduce Motion the swaps still move, slowly, so they can be followed;
   - "Where is the Zebra?": a wrong bush says "Try again!" (no star), a second wrong one "Look closely!" and the right
     bush glows; waiting, the animal peeks over its bush; the right bush: "Yes! You found the Zebra!" and a star;
   - five found: "Hooray!" and a new row; ten: "Wow! Ten animals! You are a super explorer!", then four bushes;
   - the bushes are big, on screen, apart, and clear of the Games button.
   Portrait (all ten), landscape with Reduce Motion, and short Safari. Run in Chromium, or with --webkit. */
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

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const [viewport, reducedMotion, rounds] of [[{width:390, height:844}, 'no-preference', 11], [{width:844, height:390}, 'reduce', 4], [{width:390, height:664}, 'no-preference', 3]]){
      const tag = `${viewport.width}x${viewport.height}${reducedMotion === 'reduce' ? ' (reduced motion)' : ''}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true, reducedMotion});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        let s = 777; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;   // (the same game every run)
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      const st = () => page.evaluate(() => window.__toyPhone.hide());
      const log = () => page.evaluate(() => window.__toyPhone.voice().log.length);
      const sayWait = (line, after, timeout = 15000) => page.waitForFunction(([t, n]) => window.__toyPhone.voice().log.slice(n).some(l => (typeof l === 'string' ? l : l.text) === t), [line, after], {timeout});
      const modeWait = (m, timeout = 20000) => page.waitForFunction(m => window.__toyPhone.hide().mode === m, m, {timeout});
      const bush = i => page.locator('#hideseek .hs-bush').nth(i);
      const touch = async i => { const b = await bush(i).boundingBox(); await page.touchscreen.tap(b.x + b.width/2, b.y + b.height/2); };
      const shot = async name => { if (SHOTS) await page.screenshot({path:path.join(SHOTS, `hideseek-${viewport.width}x${viewport.height}-${name}.png`)}); };
      const Name = a => ({trex:'T rex'})[a] || a[0].toUpperCase() + a.slice(1), here = a => a === 'trex' ? 'T rex' : a;

      await page.evaluate(() => window.__toyPhone.go('games')); await page.waitForTimeout(400);
      const names = await page.$$eval('#gameList .gamecard', cs => cs.map(c => c.getAttribute('aria-label')));
      check(names[3] === 'Hide and Seek', `${tag}: Hide and Seek is fourth in the Games menu ${JSON.stringify(names)}`);
      const card = page.locator('.gamecard[aria-label="Hide and Seek"]');
      check((await card.locator('.gplay').textContent()).trim() === '1 player', `${tag}: its card says 1 player`);
      await card.scrollIntoViewIfNeeded(); const cb = await card.boundingBox(); const n0 = await log();
      await page.touchscreen.tap(cb.x + cb.width/2, cb.y + cb.height/2);
      await page.waitForFunction(() => !document.querySelector('#hideseek').hidden);

      const pool = (await st()).pool, calls = await page.evaluate(ks => ks.map(k => window.__toyPhone.hideCall(k)), pool);
      check(pool.length === 10 && new Set(calls).size === 10 && calls.every(Boolean), `${tag}: ten animals, each with its own call ${JSON.stringify(calls)}`);
      const seen = [];
      for (let r = 0; r < rounds; r++){
        const n1 = await log();
        let slept = false;
        if (r === 0 && viewport.height === 664){ slept = true;   // the phone sleeps mid-"Here comes...": the voice is hushed, but the round still goes on
          await page.waitForFunction(() => window.__toyPhone.voice().log.some(l => /^Here comes/.test(typeof l === 'string' ? l : l.text)), null, {timeout:15000});
          const vis = v => page.evaluate(v => { Object.defineProperty(document, 'visibilityState', {configurable:true, get:() => v}); document.dispatchEvent(new Event('visibilitychange')); }, v);
          await vis('hidden'); await page.waitForTimeout(1200); await vis('visible');
          const nb = await log(); await modeWait('seek', 25000);
          await sayWait(`Where is the ${Name((await st()).a)}?`, nb); check(true, `${tag}: hushed mid-line (the phone slept), the round still goes on and asks "Where is...?"`);
        }
        if (!slept){
          await modeWait('hide');
          const s0 = await st();
          await sayWait(`Here comes the ${here(s0.a)}!`, r ? n1 : n0); await sayWait('Watch!', r ? n1 : n0);
        }
        if (r === 0) await shot('watch');
        if (r === 2){ await modeWait('shuffle');
          const tr = () => page.evaluate(() => [...document.querySelectorAll('#hideseek .hs-bush')].map(b => getComputedStyle(b).transform).join('|'));
          await page.waitForTimeout(150); const a = await tr(); await page.waitForTimeout(250); const b = await tr();
          check(a !== b && /matrix/.test(a + b), `${tag}: the bushes visibly slide while they swap${reducedMotion === 'reduce' ? ' (with Reduce Motion too)' : ''}`); await shot('swap'); }
        await modeWait('seek');
        const s = await st(); seen.push(s.a);
        check(s.n === (r < 10 ? 3 : 4) && s.hider >= 0, `${tag}: round ${r + 1}: the ${s.a} hides behind one of ${s.n} bushes`);
        check(r >= 2 || JSON.stringify(s.slots) === JSON.stringify([...Array(s.n).keys()]), `${tag}: round ${r + 1}: ${r < 2 ? 'the bushes stay put' : `${s.swaps} swap(s), bushes now ${JSON.stringify(s.slots)}`}`);
        await sayWait(`Where is the ${Name(s.a)}?`, slept ? n0 : n1);
        check(await page.locator('#hsPal').evaluate(e => getComputedStyle(e).opacity) === '0', `${tag}: round ${r + 1}: the ${s.a} is out of sight while you look`);
        // the hiding bush is where its slot says, so the shuffle carried it there
        const boxes = []; for (let i = 0; i < s.n; i++) boxes.push(await bush(i).boundingBox());
        const order = boxes.map((b, i) => [b.x, i]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
        check(order.every((i, k) => s.slots[i] === k), `${tag}: round ${r + 1}: the bushes stand in their places on screen`);
        if (r === 0){
          const back = await page.locator('#hideseek .game-back').boundingBox(), hit = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
          check(boxes.every(b => b.width >= 76 && b.height >= 64 && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width && b.y + b.height <= viewport.height && !hit(b, back))
            && boxes.every((b, i) => boxes.every((c, j) => i === j || !hit(b, c))), `${tag}: the bushes are big (${Math.round(boxes[0].width)}x${Math.round(boxes[0].height)}), on screen, apart, and clear of the Games button`);
        }
        if (r === 1){
          const wrong = [...Array(s.n).keys()].filter(i => i !== s.hider), n2 = await log();
          await touch(wrong[0]); await sayWait('Try again!', n2);
          check((await st()).got === r && (await st()).mode === 'seek', `${tag}: a wrong bush: "Try again!", and no star`);
          const n3 = await log(); await page.waitForTimeout(400); await touch(wrong[1]); await sayWait('Look closely!', n3);
          const g = await st(); check(g.glow[s.hider] && g.glow.filter(Boolean).length === 1, `${tag}: a second wrong one: "Look closely!", and the right bush glows`);
          await page.waitForFunction(() => getComputedStyle(document.querySelector('#hsPal')).opacity === '1', null, {timeout:3000});
          await page.waitForTimeout(550);   // (it rises for 0.4 s, stays up, then ducks)
          const pb = await page.locator('#hsPal').boundingBox(), hb = await bush(s.hider).boundingBox();
          check(pb.y < hb.y && pb.x + pb.width/2 > hb.x && pb.x + pb.width/2 < hb.x + hb.width, `${tag}: ...and the ${s.a} peeks out over its bush`);
          await shot('peek');
        }
        if (r === 2 && viewport.height === 844){
          await page.waitForTimeout(8600);
          check(await page.locator('#hsPal').evaluate(e => getComputedStyle(e).opacity) === '1', `${tag}: waiting a while, the ${s.a} peeks over its bush by itself`);
        }
        const n4 = await log(); await touch(s.hider);
        await sayWait(`Yes! You found the ${Name(s.a)}!`, n4);
        const f = await st();
        check(f.got === r + 1 && (await page.locator('#hsRow .ss-slot.got').count()) === (r % 5) + 1, `${tag}: round ${r + 1}: "Yes! You found the ${Name(s.a)}!" and a star (${f.got} found)`);
        if (r === 0) await shot('found');
        if (r === 4 || r === 9){
          const line = r === 4 ? 'Hooray!' : 'Wow! Ten animals! You are a super explorer!';
          await sayWait(line, n4, 20000); check(true, `${tag}: ${r + 1} found: "${line}"`);
          await modeWait('arrive'); check((await page.locator('#hsRow .ss-slot.got').count()) === 0, `${tag}: ...then a new row of stars`);
        }
      }
      if (rounds > 10){
        check(new Set(seen.slice(0, 10)).size === 10, `${tag}: the first ten are ten different animals ${JSON.stringify(seen.slice(0, 10))}`);
        check(seen.length === 11, `${tag}: after ten, the game goes on with four bushes`);
      }
      // the Games button goes back, and leaving stops it
      await page.locator('#hideseek .game-back').tap(); await page.waitForTimeout(500);
      check(await page.locator('#games').isVisible() && (await st()).mode === 'off', `${tag}: the Games button goes back to the Games menu and stops the game`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
