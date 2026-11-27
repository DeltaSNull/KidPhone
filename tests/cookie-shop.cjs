/* Cookie Shop, with real taps:
   - it's in the Games menu, sixth, for one player; it opens with "Welcome to the cookie shop!", "Make a cookie just like
     this one!" and the order, said and shown in the customer's bubble; at first only the three shapes, and nothing to
     serve until a shape is picked;
   - a wrong cookie: the customer shakes its head, says what to look at ("Look at the shape!", "Look at the color!",
     "Count the candies!", "Look at the sprinkles!"), that row of tools glows, the cookie stays; after two tries the order
     grows big; the right one: munched, "Yum! Just right!" (or another thank-you), a face in the row, the next customer;
   - stages: three happy customers bring frosting ("Now with frosting!"), three more candies, four more sprinkles, more
     colours and a square, four more memory ("Now remember the cookie!": the bubble closes once the order is said, a tap
     peeks, then it closes again); frosting before a shape: "Pick a shape first!"; the arrow takes a candy back;
   - five happy customers: "Five happy customers! Hooray!" and a fresh row; the cookie picker jumps to any stage;
   - every tool, the plate and the buttons are on screen, big enough, and don't overlap the customer or each other.
   Portrait (all stages), landscape with Reduce Motion, and short Safari. Run in Chromium, or with --webkit. */
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
const YUM = ['Yum! Just right!', 'Mmm, delicious!', 'Thank you! Yummy!'];

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
        let s = 31337; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;   // (the same customers every run)
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      const st = () => page.evaluate(() => window.__toyPhone.cookies());
      const log = () => page.evaluate(() => window.__toyPhone.voice().log.length);
      const sayWait = (line, after, timeout = 15000) => page.waitForFunction(([t, n]) => window.__toyPhone.voice().log.slice(n).some(l => (typeof l === 'string' ? l : l.text) === t), [line, after], {timeout});
      const sayAny = (lines, after, timeout = 15000) => page.waitForFunction(([ts, n]) => window.__toyPhone.voice().log.slice(n).some(l => ts.includes(typeof l === 'string' ? l : l.text)), [lines, after], {timeout});
      const modeWait = (m, timeout = 15000) => page.waitForFunction(m => window.__toyPhone.cookies().mode === m, m, {timeout});
      const touch = async sel => { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width/2, b.y + b.height/2); await page.waitForTimeout(190); };   // (the tools ignore taps closer than 150 ms)
      const shot = async name => { if (SHOTS) await page.screenshot({path:path.join(SHOTS, `cookies-${viewport.width}x${viewport.height}-${name}.png`)}); };
      // make the ordered cookie with real taps (from a fresh plate), or a changed one
      const build = async (o, change = {}) => {
        const c = {...o, ...change}, s = await st();
        await touch(`.ck-tool[data-shape="${c.shape}"]`);
        if (s.tools.includes('pink')) await touch(`.ck-tool[data-frost="${c.frost || 'none'}"]`);
        for (let i = 0; i < c.candies; i++) await touch('.ck-tool[data-extra="candy"]');
        if (c.sprinkles) await touch('.ck-tool[data-extra="sprinkles"]');
      };
      const happyOne = async () => {
        await modeWait('make'); const s = await st(), n = await log();
        await build(s.order); await touch('#ckServe');
        await sayAny(YUM, n); await page.waitForFunction(h => window.__toyPhone.cookies().happy === h && window.__toyPhone.cookies().mode !== 'eat', s.happy + 1, {timeout:15000});
        return s;
      };

      // 1. the card and the first customer
      await page.evaluate(() => window.__toyPhone.go('games')); await page.waitForTimeout(400);
      const names = await page.$$eval('#gameList .gamecard', cs => cs.map(c => c.getAttribute('aria-label')));
      check(names[5] === 'Cookie Shop', `${tag}: Cookie Shop is sixth in the Games menu ${JSON.stringify(names)}`);
      const card = page.locator('.gamecard[aria-label="Cookie Shop"]');
      check((await card.locator('.gplay').textContent()).trim() === '1 player', `${tag}: its card says 1 player`);
      await card.scrollIntoViewIfNeeded(); const cb = await card.boundingBox(); const n0 = await log();
      await page.touchscreen.tap(cb.x + cb.width/2, cb.y + cb.height/2);
      await page.waitForFunction(() => !document.querySelector('#cookies').hidden);
      await sayWait('Welcome to the cookie shop!', n0); await sayWait('Make a cookie just like this one!', n0);
      let s = await st(); await sayWait(s.said, n0);
      check(s.stage === 1 && JSON.stringify(s.tools) === '["circle","star","heart"]' && await page.locator('#ckOrder img').count() === 1 && await page.locator('#ckUndo').isHidden(),
        `${tag}: it opens with a hello, "Make a cookie just like this one!" and "${s.said}" (in the bubble too); just the three shapes`);
      check(await page.locator('#ckServe').isDisabled() && await page.locator('#ckCookie').isHidden(), `${tag}: an empty plate, and nothing to serve yet`);
      await shot('first');

      // 2. layout: on screen, big enough, nothing on top of anything (at the fullest stage)
      if (!full){ await page.evaluate(() => window.__toyPhone.cookiesJump(3)); await modeWait('make'); await touch('.ck-tool[data-shape="star"]'); }
      const layout = async label => {
        const R = sel => page.$$eval(sel, es => es.filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; }));
        const tools = await R('#cookies .ck-tool'), btns = await R('#cookies #ckUndo, #cookies #ckServe, #cookies .game-back, #cookies .round'), cust = await R('#cookies .ck-pal, #cookies .ck-think'), plate = await R('#ckPlate');
        const hit = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1, on = b => b.x >= 0 && b.y >= 0 && b.x + b.w <= viewport.width + 1 && b.y + b.h <= viewport.height + 1;
        const all = [...tools, ...btns, ...plate], rd = b => [b.x, b.y, b.w, b.h].map(Math.round).join(',');
        const bad = [...all.flatMap((a, i) => all.filter((b, j) => i < j && hit(a, b)).map(b => `overlap ${rd(a)} / ${rd(b)}`)), ...cust.flatMap(c => all.filter(b => hit(c, b)).map(b => `customer ${rd(c)} / ${rd(b)}`)),
          ...[...tools, ...btns, ...plate, ...cust].filter(b => !on(b)).map(b => `off screen ${rd(b)}`), ...tools.filter(b => b.w < 44).map(b => `small ${rd(b)}`), ...plate.filter(b => b.w < 100).map(b => `small plate ${rd(b)}`)];
        check(bad.length === 0,
          `${tag}: ${label}: ${tools.length} tools (${Math.round(tools[0].w)}px), the plate (${Math.round(plate[0].w)}px), the buttons and the customer all on screen, none on another ${bad.slice(0, 4).join('; ')}`);
      };
      if (!full) await layout('the fullest stage');

      if (full){
        // 3. a wrong cookie, then the right one
        await modeWait('make'); s = await st();
        const other = ['circle', 'star', 'heart'].find(x => x !== s.order.shape);
        let n1 = await log(); await build(s.order, {shape:other}); await touch('#ckServe');
        await sayWait('Look at the shape!', n1);
        let w = await st();
        check(w.misses === 1 && w.happy === 0 && JSON.stringify(w.look) === '["shape"]' && w.cur.shape === other && w.mode === 'make', `${tag}: the wrong shape: "Look at the shape!", the shapes glow, the cookie stays`);
        n1 = await log(); await touch('#ckServe'); await sayWait('Look at the shape!', n1);
        check((await st()).big, `${tag}: a second try: the order grows big beside the cookie`);
        await shot('wrong');
        n1 = await log(); await touch(`.ck-tool[data-shape="${s.order.shape}"]`); await touch('#ckServe');
        await sayAny(YUM, n1); await page.waitForFunction(() => window.__toyPhone.cookies().happy === 1 && window.__toyPhone.cookies().mode !== 'eat', null, {timeout:15000});
        check((await page.locator('#ckRow .ss-slot.got').count()) === 1, `${tag}: the right shape: munched, a thank-you, a face in the row`);
        await page.waitForFunction(() => window.__toyPhone.cookies().mode === 'make', null, {timeout:15000});
        check((await st()).cur.shape === null && await page.locator('#ckCookie').isHidden(), `${tag}: the next customer, and a clean plate`);
        // 4. two more, and frosting arrives
        await happyOne(); let n2 = await log(); await happyOne();
        await sayWait('Now with frosting!', n2); await modeWait('make'); s = await st();
        check(s.stage === 2 && s.tools.includes('pink') && s.tools.length === 6, `${tag}: three happy customers: "Now with frosting!", three colours`);
        n2 = await log(); await touch('.ck-tool[data-frost="pink"]'); await sayWait('Pick a shape first!', n2);
        check((await st()).cur.frost === null, `${tag}: frosting before a shape: "Pick a shape first!"`);
        const otherF = ['pink', 'blue', 'yellow'].find(x => x !== s.order.frost);
        n2 = await log(); await build(s.order, {frost:otherF}); await touch('#ckServe'); await sayWait('Look at the color!', n2);
        check(JSON.stringify((await st()).look) === '["frost"]', `${tag}: the wrong frosting: "Look at the color!", the frosting glows`);
        n2 = await log(); await touch(`.ck-tool[data-frost="${s.order.frost}"]`); await touch('#ckServe'); await sayAny(YUM, n2);
        await page.waitForFunction(() => window.__toyPhone.cookies().mode === 'make' && window.__toyPhone.cookies().happy === 4, null, {timeout:15000});
        // 5. five happy customers
        n2 = await log(); await happyOne(); await sayWait('Five happy customers! Hooray!', n2);
        await page.waitForFunction(() => window.__toyPhone.cookies().mode === 'make', null, {timeout:20000});
        check((await page.locator('#ckRow .ss-slot.got').count()) === 0, `${tag}: five happy customers: "Five happy customers! Hooray!", and a fresh row`);
        // 6. candies (stage 3): count them; the arrow takes one back
        n2 = await log(); await happyOne(); await sayWait('Now with candies!', n2); await modeWait('make'); s = await st();
        check(s.stage === 3 && s.tools.includes('candy') && await page.locator('#ckUndo').isVisible(), `${tag}: "Now with candies!", the candy jar and the take-back arrow`);
        n2 = await log(); await build(s.order, {candies:s.order.candies + 1}); await touch('#ckServe'); await sayWait('Count the candies!', n2);
        check(JSON.stringify((await st()).look) === '["extra"]' && (await st()).cur.candies === s.order.candies + 1, `${tag}: one candy too many: "Count the candies!", the candies glow`);
        await touch('#ckUndo');
        check((await st()).cur.candies === s.order.candies, `${tag}: the arrow takes one back`);
        n2 = await log(); await touch('#ckServe'); await sayAny(YUM, n2); await page.waitForFunction(() => window.__toyPhone.cookies().mode === 'make' && window.__toyPhone.cookies().happy === 7, null, {timeout:15000});
        await shot('candies');
        // 7. sprinkles (stage 4)
        await happyOne(); await happyOne(); n2 = await log(); await happyOne(); await sayWait('Now with sprinkles too!', n2); await modeWait('make'); s = await st();   // (candies take four happy customers)
        check(s.stage === 4 && s.tools.includes('sprinkles') && s.tools.includes('square') && s.tools.includes('chocolate') && s.tools.includes('none'), `${tag}: "Now with sprinkles too!": sprinkles, a square, five colours and plain`);
        await layout('the fullest stage');
        n2 = await log(); await build(s.order, {sprinkles:!s.order.sprinkles}); await touch('#ckServe'); await sayWait('Look at the sprinkles!', n2);
        check(JSON.stringify((await st()).look) === '["extra"]', `${tag}: sprinkles wrong: "Look at the sprinkles!"`);
        n2 = await log(); await touch('.ck-tool[data-extra="sprinkles"]'); await touch('#ckServe'); await sayAny(YUM, n2);
        await page.waitForFunction(() => window.__toyPhone.cookies().mode === 'make' && window.__toyPhone.cookies().happy === 11, null, {timeout:20000});
        await shot('sprinkles');
        // 8. memory (stage 5)
        await happyOne(); await happyOne(); n2 = await log(); await happyOne();
        await sayWait('Now remember the cookie!', n2); await sayWait('Remember the cookie!', n2);
        s = await st(); await sayWait(s.said, n2);
        await page.waitForFunction(() => window.__toyPhone.cookies().closed, null, {timeout:8000});
        check((await st()).stage === 5 && await page.locator('#ckOrder').evaluate(e => getComputedStyle(e).visibility) === 'hidden', `${tag}: "Now remember the cookie!": once the order is said, the bubble closes`);
        // (watch the bubble's class from inside the page, so a peek that opens and closes again at once still shows)
        await page.evaluate(() => { const t = document.querySelector('#ckThink'); window.__peeks = []; new MutationObserver(() => window.__peeks.push(t.classList.contains('closed') ? 'closed' : 'open')).observe(t, {attributes:true, attributeFilter:['class']}); });
        const under = await page.evaluate(() => { const r = document.querySelector('#ckThink').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return e ? (e.id || e.className || e.tagName) : 'nothing'; });
        await touch('#ckThink');
        const opened = await page.waitForFunction(() => !window.__toyPhone.cookies().closed, null, {timeout:2000}).then(() => true, () => false);
        check(opened, `${tag}: a tap on the bubble peeks at the order ${opened ? '' : JSON.stringify({under, classes:await page.evaluate(() => window.__peeks), state:await st()})}`);
        await page.waitForFunction(() => window.__toyPhone.cookies().closed, null, {timeout:6000});
        check(true, `${tag}: ...and it closes again`);
        await shot('memory');
        n2 = await log(); await build(s.order); await touch('#ckServe'); await sayAny(YUM, n2);
        check(true, `${tag}: made from memory: munched`);
        // 9. the cookie picker
        await page.waitForFunction(() => window.__toyPhone.cookies().mode === 'make', null, {timeout:20000});
        n2 = await log(); await page.locator('#ckLevels').tap(); await sayWait('Which cookies today?', n2);
        const cards = await page.$$eval('#ckMap .ck-pick', cs => cs.map(c => ({n:c.dataset.stage, star:!!c.querySelector('.st-place-star')})));
        check(cards.length === 5 && cards.slice(0, 4).every(c => c.star) && !cards[4].star, `${tag}: the cookie picker: five stages, stars on the four done`);
        await shot('picker');
        await page.locator('#ckMap .ck-pick[data-stage="2"]').tap(); await modeWait('make');
        s = await st(); check(s.stage === 2 && s.tools.length === 6 && await page.locator('#ckMap').isHidden(), `${tag}: a tap on the second goes back to frosting`);
      } else {
        // a cookie made and served, with Reduce Motion or on a short screen
        const h = (await st()).happy; await happyOne(); check((await st()).happy === h + 1, `${tag}: a cookie made and served`);
      }

      if (viewport.width > viewport.height){
        const opener = page.locator('#ckLevels'), first = page.locator('#ckMap [data-stage="1"]');
        await opener.tap();
        await first.waitFor();
        const box = await first.boundingBox();
        await page.touchscreen.tap(box.x + 8, box.y + box.height / 2);
        check(!(await st()).map && (await st()).stage === 1, `${tag}: the first cookie card responds right to its left edge`);
        await modeWait('make');

        await opener.press('Enter');
        check(await first.evaluate(b => document.activeElement === b), `${tag}: opening the picker by keyboard focuses the current stage`);
        await page.keyboard.press('Shift+Tab');
        check(await opener.evaluate(b => document.activeElement === b), `${tag}: the cookie picker button is adjacent to the cards in tab order`);
        await page.keyboard.press('Shift+Tab');
        check(await page.locator('#cookies .game-back').evaluate(b => document.activeElement === b), `${tag}: Games is reachable from the picker by keyboard`);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        check(!(await st()).map && await opener.evaluate(b => document.activeElement === b), `${tag}: choosing a stage by keyboard returns focus to the picker button`);
      }

      // the Games button goes back, and leaving stops it
      await page.locator('#cookies .game-back').tap(); await page.waitForTimeout(500);
      check(await page.locator('#games').isVisible() && (await st()).mode === 'off', `${tag}: the Games button goes back to the Games menu and stops the game`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
