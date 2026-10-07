/* Ball Trail and Star Flight: steering by a held finger and by tilt, hedges, five-route garden and six-animal journey endings/replay,
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
      const go = async id => { await page.evaluate(id => window.__toyPhone.go(id), id); await page.clock.runFor(2300); };
      const state = () => page.evaluate(() => window.__toyPhone.motionGames());
      const run = ms => page.clock.runFor(ms);
      const sensor = (beta, gamma) => page.evaluate(([beta, gamma]) => { const e = new Event('deviceorientation'); Object.assign(e, {alpha:0, beta, gamma}); window.dispatchEvent(e); }, [beta, gamma]);
      const lit = id => page.locator(`#${id} ${id==='starflight'?'.mg-foodslots':'.mg-got'} span.on`).count();
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
      check(await page.locator('#balltrail .mg-route').count() === 1, `${tag}: a visible route preview guides the first turns`);
      const board = await page.locator('#balltrail .mg-board').boundingBox();
      check(board.width > 200 && board.y >= 0 && board.y + board.height <= viewport.height && board.x + board.width <= viewport.width, `${tag}: the field is big and fits on screen ${JSON.stringify(board)}`);
      check(Math.abs((board.width - 18) - (board.height - 24)) < 1.5, `${tag}: the inside of the field is square`);
      check(await lit('balltrail') === 0 && await page.locator('#balltrail .mg-got span').count() === 5, `${tag}: five empty star slots`);

      // The texture must roll on front/back travel too, and stop when the ball stops.
      let st;
      const texture = () => page.locator('#balltrail .mg-me canvas').evaluate(c=>c.toDataURL());
      const initialTexture = await texture();
      await hold('balltrail',15,42,1000);
      st = await state();
      check(Math.abs(st.rotation[0])>.1 && await texture() !== initialTexture, `${tag}: forward travel rotates the sphere about its horizontal axis`);
      const stoppedTexture = await texture();await run(300);
      check(await texture() === stoppedTexture, `${tag}: releasing touch stops motion and texture rolling together`);
      await hold('balltrail',15,15,1000);
      check(await texture() !== stoppedTexture, `${tag}: backward travel rolls the texture back, not just slides`);
      await go('balltrail');

      // tilt: the first reading is the grip; tipping right from it rolls the ball right, until the hedge stops it
      st = await state(); const x0 = st.x;
      await sensor(35, 0); await sensor(35, 18); await run(400);
      check((await state()).x > x0 + 2, `${tag}: tipping the phone right rolls the ball right`);
      for (let i = 0; i < 8; i++){ await sensor(35, 18); await run(300); }
      check((await state()).x < 42 - 5, `${tag}: the hedge stops the ball`);
      const hedgeTexture=await texture();await sensor(35,18);await run(300);
      check(await texture()===hedgeTexture,`${tag}: pushing against a hedge does not spin a stationary ball`);
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
      await run(4600); st = await state();
      check(!st.done && st.round === 1 && st.maze === 1 && Math.abs(st.x - 13) < .5, `${tag}: the next maze starts by itself`);
      await page.screenshot({animations:'disabled', path:path.join(__dirname, 'screenshots', `motion-maze-${tag}.png`)});
      for (const [x, y] of [[13, 86], [50, 86], [50, 20], [87, 20], [85, 86]]) await hold('balltrail', x, y);
      st = await state();
      check(st.done && st.got === 2, `${tag}: the two-hedge maze can be finished with a finger ${JSON.stringify(st)}`);

      // Each later path is hand checked with the full ball radius, including both horizontal routes.
      const laterPaths = [
        [[87,86],[50,86],[50,20],[13,20],[14,85]],
        [[16,17],[82,17],[82,51],[16,51],[16,83],[82,83]],
        [[17,17],[17,50],[83,50],[83,83],[17,83]]
      ];
      for(const pathPoints of laterPaths){
        await run(4600); const route=(await state()).round;
        for(const [px,py] of pathPoints) await hold('balltrail',px,py,2600);
        check((await state()).done && (await state()).got===route+1, `${tag}: distinct route ${route+1} is reachable with the whole ball`);
      }
      await run(6000);
      check((await state()).round===4 && (await state()).got===5, `${tag}: five-star garden remains finished until replay`);
      check(await page.locator('#balltrail .mg-finish .px').count()>=5, `${tag}: the ending displays all five earned stars`);
      await page.screenshot({animations:'disabled',path:path.join(__dirname,'screenshots',`motion-garden-finish-${tag}.png`)});
      await page.locator('#balltrail .mg-replay').click(); await run(2300);
      check((await state()).round===0 && (await state()).got===0 && !(await state()).done, `${tag}: garden replay starts a fresh five-route journey`);

      // leaving stops listening; a reading after that does nothing
      await go('home'); st = await state();
      check(st.id === null && !st.tilt, `${tag}: leaving the game stops listening for tilt`);
      await sensor(20, 40);

      // --- Star Flight: longer food stages, alternating flying/ground animals.
      await page.evaluate(()=>window.__toyPhone.go('starflight'));
      const introFood = await page.locator('#starflight .mg-star').first().evaluate(e=>e.style.top);
      await run(1000);
      check(await page.locator('#starflight .mg-next').count()===1 && await page.locator('#starflight .mg-star').first().evaluate(e=>e.style.top)===introFood, `${tag}: animal and food preview pauses falling food before play`);
      await run(1400);
      check(await page.locator('#starflight .mg-journey span').count()===6, `${tag}: the visual journey includes all six animals`);
      check((await state()).tilt && (await state()).target===8 && await lit('starflight') === 0, `${tag}: the first animal needs eight blueberries, not five quick stars`);
      const flapBefore=await page.locator('#starflight .mg-me').evaluate(e=>e.style.getPropertyValue('--flap'));await run(250);
      check(await page.locator('#starflight .mg-wing').count()===1 && await page.locator('#starflight .mg-me').evaluate(e=>e.style.getPropertyValue('--flap'))!==flapBefore, `${tag}: flying animals flap a simple pixel wing`);
      const campaign=[['parrot','blueberry',true,1,8],['dog','bone',false,1,8],['eagle','fish',true,2,10],['monkey','banana',false,2,10],['butterfly','flower',true,3,12],['panda','bamboo',false,3,12]];
      for(const [animal,food,flying,difficulty,target] of campaign){
        check(await page.locator('#starflight .mg-habitat').getAttribute('aria-label'), `${tag}: each animal has a named habitat`);
        st=await state();check(st.animal===animal&&st.food===food&&st.flying===flying&&st.level===difficulty&&st.target===target,`${tag}: stage ${st.round+1} is ${animal}/${food}, level ${difficulty}, goal ${target}`);
        if(animal==='parrot'||animal==='dog'||animal==='butterfly')await page.screenshot({animations:'disabled',path:path.join(__dirname,'screenshots',`motion-playing-${animal}-${tag}.png`)});
        if(!flying){
          const groundY=st.y;await hold('starflight',85,15,600);check(Math.abs((await state()).y-groundY)<.01,`${tag}: ${animal} touch steering stays on the ground`);
          await sensor(35,0);await sensor(55,0);await run(500);check(Math.abs((await state()).y-groundY)<.01,`${tag}: ${animal} ignores forward/back tilt`);
          const sideX=(await state()).x;await sensor(35,20);await run(200);check((await state()).x>sideX&&Math.abs((await state()).y-groundY)<.01,`${tag}: sideways tilt moves ${animal} along the ground`);
          check(await page.locator('#starflight .mg-wing').count()===0,`${tag}: ground animals have no flying wings`);
        }
        if(difficulty>1){
          let hit=false;
          for(let i=0;i<100&&!hit;i++){st=await state();const bad=st.stars.find(s=>!s.good);await hold('starflight',bad.x,Math.max(6,Math.min(94,bad.y+4)),200);hit=(await state()).rejected>0;}
          st=await state();check(hit&&st.got<target&&!st.done,`${tag}: another animal's food gives a gentle cue instead of ending the stage`);
        }
        for(let i=0;i<550&&!(await state()).done;i++){
          st=await state();const near=st.stars.filter(s=>s.good).reduce((a,b)=>Math.hypot(st.x-a.x,st.y-a.y)<Math.hypot(st.x-b.x,st.y-b.y)?a:b);
          await hold('starflight',near.x,Math.max(6,Math.min(94,near.y+4)),200);
        }
        st=await state();check(await page.locator('#starflight .mg-journey .visited').count()===st.round+1,`${tag}: only animals already helped are marked visited`);check(st.done&&st.got===target&&await lit('starflight')===target,`${tag}: ${animal} stage completes only after ${target} matching foods`);
        if(animal==='parrot'||animal==='dog'||animal==='butterfly')await page.screenshot({animations:'disabled',path:path.join(__dirname,'screenshots',`motion-${animal}-${tag}.png`)});
        if(animal!=='panda'){await run(5400);check(!(await state()).done&&(await state()).got===0,`${tag}: the next animal starts with an empty collection`);}
      }
      await run(6000);
      check((await state()).animal==='panda' && (await state()).done && await page.locator('#starflight .mg-finish .mg-friends .px').count()===6,`${tag}: the six-animal ending stays for a deliberate replay`);
      await page.screenshot({animations:'disabled',path:path.join(__dirname,'screenshots',`motion-journey-finish-${tag}.png`)});
      await page.locator('#starflight .mg-replay').click(); await run(2300);
      check((await state()).animal==='parrot' && (await state()).level===1 && (await state()).got===0,`${tag}: replay resets the journey to its calm first encounter`);
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
