/* Play Firefly Festival with real touches in three phone layouts. */
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const path = require('node:path');
const http = require('node:http');
const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');

const root = path.resolve(__dirname, '..');
const contentTypes = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg'};
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, pathname === '/' ? 'index.html' : '.' + pathname);
  if (!file.startsWith(root + path.sep) || !(await stat(file).catch(() => null))?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {'content-type':contentTypes[path.extname(file)] || 'application/octet-stream'});
  createReadStream(file).pipe(res);
});

const layouts = [
  {width:390, height:844, reducedMotion:'no-preference'},
  {width:844, height:390, reducedMotion:'reduce'},
  {width:320, height:540, reducedMotion:'no-preference'},
  {width:480, height:320, reducedMotion:'reduce'}
];

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
    for (const {width, height, reducedMotion} of layouts) {
      const context = await browser.newContext({viewport:{width,height}, reducedMotion, isMobile:true, hasTouch:true});
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', tilt:'off'}));
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/assets/family/family.json', route => route.fulfill({json:{contacts:[]}}));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.__toyPhone?.voice().loaded);
      await page.locator('.appicon[data-app="games"]').tap();
      const card = page.getByRole('button', {name:'Firefly Festival'});
      assert.equal(await card.count(), 1, 'Firefly Festival appears in the Games menu');
      await card.tap();
      const game = page.locator('#fireflies');
      const lamps = game.locator('.ff-lantern');
      const switches = game.locator('.ff-switch');
      const hint = game.getByRole('button', {name:'Show me a switch'});
      const next = game.getByRole('button', {name:'Next puzzle', exact:true});
      const replay = game.getByRole('button', {name:'Say it again'});
      const moonlight = game.getByRole('button', {name:'Moonlight mix'});
      const states = () => lamps.evaluateAll(nodes => nodes.map(node => node.dataset.lit));
      await game.waitFor({state:'visible'});
      assert.deepEqual(await states(), ['true','false','true']);
      assert.equal(await switches.nth(1).getAttribute('data-hint'), 'true');
      const goal = 'Can you light all the lanterns?';
      const saidGoal = () => page.evaluate(goal => window.__toyPhone.voice().log.filter(line => line === goal).length, goal);
      await page.waitForFunction(goal => window.__toyPhone.voice().log.includes(goal), goal);
      const beforeReplay = await saidGoal();
      await replay.tap();
      await page.waitForFunction(([goal, before]) => window.__toyPhone.voice().log.filter(line => line === goal).length > before, [goal, beforeReplay]);
      assert.deepEqual(await states(), ['true','false','true'], 'replaying the prompt keeps the puzzle');
      await switches.nth(0).tap();
      assert.deepEqual(await states(), ['false','false','true'], 'a single switch flips one lantern');
      await page.waitForTimeout(120); // shared same-button tap throttle
      await switches.nth(0).tap();
      assert.deepEqual(await states(), ['true','false','true'], 'pressing again undoes a move');

      const solve = async () => {
        let presses = 0;
        while (await next.isHidden() && await game.getByRole('button', {name:'Play again'}).isHidden()) {
          assert.ok(++presses <= 5, 'the hint reaches a solution within five moves');
          const before = await states();
          await hint.tap();
          assert.deepEqual(await states(), before, 'the hint leaves the next move to the child');
          await game.locator('.ff-switch[data-hint="true"]').tap();
          await page.waitForTimeout(120);
        }
        assert.ok((await states()).every(state => state === 'true'));
        assert.equal(await game.locator('.ff-dance').isVisible(), true);
        return presses;
      };

      if (width === 390) {
        for (let i = 0; i < 6; i++) {
          await solve();
          await next.tap();
        }
        assert.equal(await moonlight.getAttribute('aria-pressed'), 'true', 'six rounds introduce Moonlight mix');
      } else {
        await moonlight.tap();
      }

      assert.equal(await lamps.count(), 5);
      assert.equal(await switches.count(), 5);
      await page.waitForTimeout(350);
      const targets = await game.locator('button:visible, .ff-lantern').evaluateAll(nodes => nodes.map(node => {
        const {x,y,width,height} = node.getBoundingClientRect();
        return {x,y,width,height,button:node.tagName === 'BUTTON'};
      }));
      for (const [i,a] of targets.entries()) {
        assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height, 'elements fit the phone');
        if (a.button) assert.ok(a.width >= 44 && a.height >= 44, 'touch targets are at least 44 pixels');
        for (const b of targets.slice(i + 1)) {
          const overlap = a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 &&
            a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
          assert.equal(overlap, false, 'lanterns and controls do not overlap');
        }
      }
      for (let i = 0; i < 3; i++) {
        await switches.nth(1).tap();
        await page.waitForTimeout(120);
      }
      assert.equal(await game.locator('.ff-switch[data-hint="true"]').count(), 1, 'repeating a move without making progress offers help');
      const before = await states();
      await switches.nth(4).focus();
      await page.keyboard.press('Enter');
      const after = await states();
      assert.deepEqual(after.map((lit,i) => lit !== before[i]), [false,true,true,true,false], 'keyboard activation flips three marked lanterns');
      await solve();
      if (process.env.FIREFLY_SHOTS) await page.screenshot({path:path.join(process.env.FIREFLY_SHOTS, `fireflies-${width}.png`)});
      for (let i = 0; i < 3; i++) {
        await next.tap();
        if (i === 2) assert.equal(await solve(), 5, 'the finale needs five switch presses');
        else await solve();
      }
      await game.getByRole('button', {name:'Play again'}).tap();
      assert.deepEqual(await states(), ['true','false','true']);
      await game.getByRole('button', {name:'Games', exact:true}).tap();
      await card.tap();
      assert.deepEqual(await states(), ['true','false','true'], 'reopening starts a fresh visit');
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.__toyPhone.voiceMissing()), []);
      console.log(`Firefly Festival passes at ${width}x${height} (${reducedMotion})`);
      await context.close();
    }
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
