/* Ball Trail and Star Flight: steering by a held finger and by tilt, hedges, the five star slots, rounds that roll on,
   motion only after a grown-up allowed it (never asked from a game), Touch only, turning the screen, and cleanup.
   Run in Chromium, or with --webkit. The page's clock is faked, so a "hold for two seconds" takes no real time. */
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..');
const useWebkit = process.argv.includes('--webkit');
const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg', '.png':'image/png', '.webmanifest':'application/manifest+json'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
const check = (condition, message) => { assert.ok(condition, message); console.log('ok  ' + message); };

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(path.join(__dirname, 'screenshots'), {recursive:true});
  const browser = await (useWebkit ? webkit : chromium).launch();
  try {
    for (const viewport of [{width:390, height:844}, {width:844, height:390}, {width:375, height:667}]){
      const tag = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true});
      await context.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:''}));
      await context.route('https://fonts.gstatic.com/**', r => r.abort());
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        // Games allowed, Camera off: the tilt games still get motion, with their own setting.
        const tilt = sessionStorage.getItem('test.tilt') || 'on';
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', silent:false, tilt}));
        localStorage.setItem('toyphone.access', JSON.stringify({mode:'custom', apps:{games:true, school:true, camera:false, photos:false, music:false, phone:false}}));
        // Safari's motion question, as the toy sees it: counted, answered with whatever the test says
        window.permissionCount = 0; window.permissionResult = sessionStorage.getItem('test.perm') || 'granted';
        window.DeviceOrientationEvent ||= class {};
        window.DeviceOrientationEvent.requestPermission = () => { window.permissionCount++; return Promise.resolve(window.permissionResult); };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const open = async () => {
        await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone);
        await page.clock.install();
        // A stand-in for the screen's turn: WebKit's own angle can ignore a property set over it.
        await page.evaluate(() => { window.turn = {angle:0}; Object.defineProperty(screen, 'orientation', {configurable:true, get:() => window.turn}); });
        await page.clock.runFor(100);
      };
      const go = async id => { await page.evaluate(id => window.__toyPhone.go(id), id); await page.clock.runFor(500); };
      const state = () => page.evaluate(() => window.__toyPhone.motionGames());
      const run = ms => page.clock.runFor(ms);
      const sensor = (beta, gamma) => page.evaluate(([beta, gamma]) => { const e = new Event('deviceorientation'); Object.assign(e, {alpha:0, beta, gamma}); window.dispatchEvent(e); }, [beta, gamma]);
      const lit = id => page.locator(`#${id} .mg-got span.on`).count();
      // hold a finger at (x, y), in percent of the field, for a while, then let go
      const hold = async (id, x, y, ms = 2200) => {
        const r = await page.locator(`#${id} .mg-board`).boundingBox(), b = 9;   // (inside the bezel: 9px each side and on top)
        await page.mouse.move(r.x + b + (r.width - 2*b)*x/100, r.y + b + (r.width - 2*b)*y/100);
        await page.mouse.down(); await run(ms); await page.mouse.up(); await run(50);
      };

      await open();
      const asked = await page.evaluate(() => window.permissionCount);
      check(asked >= 1, `${tag}: when the toy opens it checks for Safari's earlier yes to motion (no question without a tap)`);
      await go('games');
      const cards = await page.$$eval('#gameList .gamecard', cs => cs.map(c => c.getAttribute('aria-label')));
      check(JSON.stringify(cards) === JSON.stringify(['Wild Tap', 'Snack Time', 'Dino Buddies', 'Paint Pals', 'Ball Trail', 'Star Flight']), `${tag}: the two tilt games come after the four the kids know ${JSON.stringify(cards)}`);

      // --- Ball Trail
      await go('balltrail');
      check(await page.evaluate(() => window.permissionCount) === asked, `${tag}: opening a tilt game never asks Safari`);
      check((await state()).tilt, `${tag}: with motion allowed, the game listens for tilt`);
      check(await page.locator('#balltrail button').count() === 0, `${tag}: no buttons on the kids' screen`);
      const board = await page.locator('#balltrail .mg-board').boundingBox();
      check(board.width > 200 && board.y >= 0 && board.y + board.height <= viewport.height && board.x + board.width <= viewport.width, `${tag}: the field is big and fits on screen ${JSON.stringify(board)}`);
      check(Math.abs((board.width - 18) - (board.height - 24)) < 1.5, `${tag}: the inside of the field is square`);
      check(await lit('balltrail') === 0 && await page.locator('#balltrail .mg-got span').count() === 5, `${tag}: five empty star slots`);

      // tilt: the first reading is the grip; tipping right from it rolls the ball right, until the hedge stops it
      let st = await state(); const x0 = st.x;
      await sensor(35, 0); await sensor(35, 18); await run(400);
      check((await state()).x > x0 + 2, `${tag}: tipping the phone right rolls the ball right`);
      for (let i = 0; i < 8; i++){ await sensor(35, 18); await run(300); }
      check((await state()).x < 42 - 5, `${tag}: the hedge stops the ball`);
      // a finger lifted: tilt counts from how the phone is held now, so the same tip no longer rolls it
      st = await state();
      await hold('balltrail', st.x, st.y, 200);
      const x1 = (await state()).x;
      await sensor(35, 18); await sensor(35, 18); await run(600);
      check(Math.abs((await state()).x - x1) < .3, `${tag}: letting go re-centers tilt`);
      // the screen turned a quarter: the phone's front-back tip now moves the ball sideways
      await go('balltrail');
      await page.evaluate(() => { window.turn.angle = 90; }); await sensor(35, 0); await run(50);
      st = await state(); await sensor(53, 0); await run(400);
      check((await state()).x > st.x + 2, `${tag}: in landscape the tilt follows the screen`);
      await page.evaluate(() => { window.turn.angle = 0; });

      // a held finger steers: around the hedge and into the star garden
      await go('balltrail'); await sensor(35, 0);
      await hold('balltrail', 15, 82); await hold('balltrail', 82, 82, 2600);
      st = await state();
      check(st.done && st.got === 1 && await lit('balltrail') === 1, `${tag}: reaching the star lights the first slot ${JSON.stringify(st)}`);
      await run(2600); st = await state();
      check(!st.done && st.round === 1 && st.maze === 1 && Math.abs(st.x - 13) < .5, `${tag}: the next maze starts by itself`);
      await page.screenshot({animations:'disabled', path:path.join(__dirname, 'screenshots', `motion-maze-${tag}.png`)});
      for (const [x, y] of [[13, 86], [50, 86], [50, 20], [87, 20], [85, 86]]) await hold('balltrail', x, y);
      st = await state();
      check(st.done && st.got === 2, `${tag}: the two-hedge maze can be finished with a finger ${JSON.stringify(st)}`);

      // leaving stops listening; a reading after that does nothing
      await go('home'); st = await state();
      check(st.id === null && !st.tilt, `${tag}: leaving the game stops listening for tilt`);
      await sensor(20, 40);

      // --- Star Flight: follow the nearest star with a finger until five are caught
      await go('starflight');
      check((await state()).tilt && await lit('starflight') === 0, `${tag}: Star Flight starts with five empty slots`);
      for (let i = 0; i < 300 && !(await state()).done; i++){
        st = await state();
        const near = st.stars.reduce((a, b) => Math.hypot(st.x - a.x, st.y - a.y) < Math.hypot(st.x - b.x, st.y - b.y) ? a : b);
        await hold('starflight', near.x, Math.max(6, Math.min(94, near.y + 4)), 200);
      }
      st = await state();
      check(st.done && st.got === 5 && await lit('starflight') === 5, `${tag}: five stars caught fill the slots`);
      await page.screenshot({animations:'disabled', path:path.join(__dirname, 'screenshots', `motion-flight-${tag}.png`)});
      await run(3400); st = await state();
      check(!st.done && st.got === 0 && await lit('starflight') === 0, `${tag}: after the cheer the slots start over`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);

      // --- motion not allowed: touch still steers, and the game still never asks
      await page.evaluate(() => sessionStorage.setItem('test.perm', 'denied'));
      await open(); await go('balltrail');
      const before = await page.evaluate(() => window.permissionCount);
      st = await state();
      check(!st.tilt, `${tag}: with motion not allowed, the game doesn't listen for tilt`);
      await hold('balltrail', 15, 80, 1000);
      check((await state()).y > st.y + 5 && await page.evaluate(() => window.permissionCount) === before, `${tag}: a finger still steers, and nothing asks Safari`);

      // --- Touch only (settings): no tilt even with motion allowed
      await page.evaluate(() => { sessionStorage.removeItem('test.perm'); sessionStorage.setItem('test.tilt', 'off'); });
      await open(); await go('balltrail');
      check(!(await state()).tilt && await page.evaluate(() => window.permissionCount) === 0, `${tag}: Touch only: no tilt, and motion is never asked for`);
      await page.evaluate(() => sessionStorage.clear());

      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
