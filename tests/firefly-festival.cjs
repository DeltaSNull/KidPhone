/* Play Firefly Festival with real touches in four phone layouts. */
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
      const hint = game.locator('#ffHint');
      const next = game.getByRole('button', {name:'Next puzzle', exact:true});
      const replay = game.getByRole('button', {name:'Say it again'});
      const challenge = game.getByRole('button', {name:'Switch puzzles'});
      const walk = game.getByRole('button', {name:'Lanterns', exact:true});
      const playAgain = game.getByRole('button', {name:'Play again'});
      const states = () => lamps.evaluateAll(nodes => nodes.map(node => node.dataset.lit));
      await game.waitFor({state:'visible'});
      const checkLayout = async () => {
        await page.waitForTimeout(350);
        const targets = await game.locator('button:visible, .ff-lantern').evaluateAll(nodes => [...new Set(nodes)].map(node => {
          const {x,y,width,height} = node.getBoundingClientRect();
          return {x,y,width,height,button:node.tagName === 'BUTTON'};
        }));
        for (const [i,a] of targets.entries()){
          assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height, 'elements fit the phone');
          if (a.button) assert.ok(a.width >= 44 && a.height >= 44, 'touch targets are at least 44 pixels');
          for (const b of targets.slice(i + 1)){
            const overlap = a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 &&
              a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
            assert.equal(overlap, false, 'lanterns and controls do not overlap');
          }
        }
      };
      assert.equal(await game.locator('.ff-switch:visible').count(), 0, 'the first puzzle shows only the lanterns');
      assert.deepEqual(await states(), ['true','false','true']);
      const dark = game.getByRole('button', {name:'Light lantern 2'});
      assert.equal(await dark.getAttribute('data-hint'), 'true', 'the firefly visits the lantern that needs a tap');
      const prompt = 'Tap a dark lantern to light it!';
      const saidPrompt = () => page.evaluate(line => window.__toyPhone.voice().log.filter(spoken => spoken === line).length, prompt);
      await page.waitForFunction(line => window.__toyPhone.voice().log.includes(line), prompt);
      const beforeReplay = await saidPrompt();
      await replay.tap();
      await page.waitForFunction(([line, before]) => window.__toyPhone.voice().log.filter(spoken => spoken === line).length > before, [prompt, beforeReplay]);
      assert.deepEqual(await states(), ['true','false','true'], 'replaying the prompt keeps the puzzle');
      if (process.env.FIREFLY_SHOTS && width === 390){
        await page.screenshot({path:path.join(process.env.FIREFLY_SHOTS, 'first-lights.png')});
      }
      if (reducedMotion === 'reduce'){
        await dark.press('Enter');
        assert.equal(await next.evaluate(button => document.activeElement === button), true, 'a keyboard solve focuses the next round');
      } else {
        await dark.tap();
      }
      assert.deepEqual(await states(), ['true','true','true'], 'activating the dark lantern directly lights it');
      assert.equal(await game.locator('.ff-dance').isVisible(), true, 'the fireflies immediately celebrate');
      const bright = await lamps.nth(1).boundingBox();
      await page.touchscreen.tap(bright.x + bright.width / 2, bright.y + bright.height / 2);
      assert.deepEqual(await states(), ['true','true','true'], 'touching a lit lantern leaves it lit');

      for (let round = 1; round < 6; round++){
        await next.tap();
        if (round === 5) await checkLayout();
        while (await game.locator('.ff-lantern[data-lit="false"]').count()){
          await game.locator('.ff-lantern[data-lit="false"]').first().tap();
        }
      }
      assert.equal(await playAgain.isVisible(), true, 'the lantern journey ends with a replay button');
      assert.equal(await game.locator('.ff-switch:visible').count(), 0, 'finishing the lantern journey never opens the switch puzzles');
      await playAgain.tap();
      assert.deepEqual(await states(), ['true','false','true']);

      await challenge.tap();
      assert.equal(await challenge.getAttribute('aria-pressed'), 'true');
      assert.equal(await game.locator('.ff-switch:visible').count(), 4, 'the four-lantern switch puzzle is opt-in');
      const harderPrompt = 'Can you light all the lanterns? One switch can flip more than one lantern!';
      const spoken = await page.evaluate(() => window.__toyPhone.voice().log.length);
      await page.waitForTimeout(550);
      await replay.tap();
      await page.waitForFunction(([line, from]) => window.__toyPhone.voice().log.slice(from).includes(line), [harderPrompt, spoken], {timeout:5000});

      const solve = async () => {
        let presses = 0;
        while (await next.isHidden() && await playAgain.isHidden()){
          assert.ok(++presses <= 5, 'the hint reaches a solution within five moves');
          const before = await states();
          await hint.tap();
          assert.deepEqual(await states(), before, 'the hint leaves the next move to the player');
          await game.locator('.ff-switch[data-hint="true"]').tap();
          await page.waitForTimeout(120);
        }
        assert.ok((await states()).every(state => state === 'true'));
        return presses;
      };

      const preview = game.locator('.ff-switch').nth(1);
      const shownResult = await preview.locator('.ff-switch-preview').evaluateAll(nodes => nodes.map(node => node.dataset.resultLit));
      assert.deepEqual(shownResult, ['true','true'], 'the switch previews both lanterns it will light');
      await switches.nth(0).tap();
      const mixed = await preview.locator('.ff-switch-preview').evaluateAll(nodes => nodes.map(node => node.dataset.resultLit));
      assert.deepEqual(mixed, ['false','true'], 'one switch can preview a lantern dimming and another lighting');
      await preview.tap();
      assert.deepEqual((await states()).slice(0,2), mixed, 'the lamps change exactly as the switch preview showed');
      for (let round = 0; round < 3; round++){
        await solve();
        await next.tap();
      }
      assert.equal(await lamps.count(), 5);
      assert.equal(await switches.count(), 5);
      await checkLayout();

      for (let i = 0; i < 3; i++){
        await switches.nth(1).tap();
        await page.waitForTimeout(120);
      }
      assert.equal(await game.locator('.ff-switch[data-hint="true"]').count(), 1, 'repeating a move without progress offers help');
      const before = await states();
      await switches.nth(4).focus();
      await page.keyboard.press('Enter');
      const after = await states();
      assert.deepEqual(after.map((lit,i) => lit !== before[i]), [false,true,true,true,false], 'keyboard activation flips three marked lanterns');
      await game.getByRole('button', {name:'Games', exact:true}).tap();
      await card.tap();
      assert.deepEqual(await states(), after, 'coming back from Games preserves the unsolved lantern pattern');
      assert.equal(await challenge.getAttribute('aria-pressed'), 'true', 'returning keeps the selected mode');
      await solve();
      if (process.env.FIREFLY_SHOTS) await page.screenshot({path:path.join(process.env.FIREFLY_SHOTS, `fireflies-${width}.png`)});
      await walk.tap();
      assert.deepEqual(await states(), ['true','false','true'], 'one tap returns to the simple lantern game');
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
