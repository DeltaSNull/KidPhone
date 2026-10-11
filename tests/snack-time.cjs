/* Snack Time, expanded (R-30), with real taps:
   - the kitty wants her milk again (the family's pick), and the whale, sloth, crab, leopard and owl come for snacks too;
   - once a few animals are fed, some ask for two ("The eagle wants two fish!"): the bubble shows two, the first right
     tap is a bite and "One more!", the second is the meal; it is only ever two of a food you can count (never two milk);
   - every tenth animal fed, all ten march past in a picnic parade, then the next animal comes; with reduced motion they
     stand still in a row instead; leaving in the middle of the parade stops it;
   - every new line has a recording.
   Portrait and landscape. Run in Chromium, or with --webkit. */
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
const UNCOUNTABLE = ['milk', 'bamboo', 'corn', 'watermelon', 'grass', 'meat'];
let allTwos = 0;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const [viewport, reducedMotion] of [[{width:390, height:844}, 'no-preference'], [{width:844, height:390}, 'reduce']]){
      const tag = `${viewport.width}x${viewport.height}${reducedMotion === 'reduce' ? ' (reduced motion)' : ''}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true, reducedMotion});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off', voice:{names:true}}));
        let s = 12345; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;   // (the same animals every run)
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      const snack = () => page.evaluate(() => window.__toyPhone.snack());
      const said = () => page.evaluate(() => window.__toyPhone.voice().log.map(l => typeof l === 'string' ? l : l.text));
      const touch = async selector => { const box = await page.locator(selector).first().boundingBox(); await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); };
      const ready = async () => { await page.waitForFunction(() => window.__toyPhone.snack().want, null, {timeout:20000}); await page.waitForTimeout(550); return snack(); };

      await page.evaluate(() => window.__toyPhone.go('snacktime'));
      const foods = (await ready()).foods;
      check(foods.cat === 'milk', `${tag}: the kitty wants milk again`);
      check(['whale', 'sloth', 'crab', 'leopard', 'owl'].every(a => foods[a]), `${tag}: the whale, sloth, crab, leopard and owl come too (${Object.keys(foods).length} animals)`);
      const needed = ['The kitty wants some milk!', 'Yum! The kitty loves milk!', 'One more!', 'Picnic parade! Ten full tummies!', 'The owl wants two flies!', 'The whale wants a shrimp!'];
      const missing = await page.evaluate(ls => ls.filter(l => !window.__toyPhone.voiceFile(l)), needed);
      check(missing.length === 0, `${tag}: the new lines are recorded ${missing.join(', ')}`);

      // feed ten animals with real taps; check the "two" rounds and the parade on the way
      let twos = 0, wrongTwo = [];
      for (let fedNow = 0; fedNow < 10;){
        let st = await ready();
        if (st.two){
          twos++; if (UNCOUNTABLE.includes(st.want)) wrongTwo.push(st.want);
          if (twos === 1){
            check(await page.locator('#stWant .px').count() === 2 && (await said()).some(l => / wants two /.test(l)), `${tag}: the ${st.animal} asks for two ${st.want}: two in the bubble, and it says so`);
            await touch(`#stFoods [data-food="${st.want}"]`);
            await page.waitForFunction(() => window.__toyPhone.snack().want && window.__toyPhone.snack().need === 1, null, {timeout:5000});
            await page.waitForTimeout(300);
            check((await snack()).fed === fedNow && await page.locator('#stWant .px').count() === 1 && (await said()).includes('One more!'),
              `${tag}: the first is a bite: one left in the bubble, "One more!", not fed yet`);
            await touch(`#stFoods [data-food="${st.want}"]`);
            await page.waitForFunction(n => window.__toyPhone.snack().fed === n + 1, fedNow, {timeout:5000});
            check(true, `${tag}: the second one is the meal`);
            fedNow++; continue;
          }
          await touch(`#stFoods [data-food="${st.want}"]`); await page.waitForFunction(() => window.__toyPhone.snack().need === 1 && window.__toyPhone.snack().want, null, {timeout:5000}); await page.waitForTimeout(300);
        }
        await touch(`#stFoods [data-food="${st.want}"]`);
        await page.waitForFunction(n => window.__toyPhone.snack().fed > n, fedNow, {timeout:5000}).catch(() => {});   // (a tap during the cards' deal bounce is tried again)
        fedNow = (await snack()).fed;
      }
      allTwos += twos;   // (which animals ask for two is random; the portrait run has had two of them)
      check(wrongTwo.length === 0, `${tag}: ${twos} "two" rounds, never two of a food you can't count`);
      await page.waitForFunction(() => window.__toyPhone.snack().parade, null, {timeout:15000});
      await page.waitForTimeout(600);
      const parade = await page.evaluate(() => { const p = document.querySelector('.st-parade'); return {n:p.querySelectorAll('.s').length, still:p.classList.contains('still'), moving:p.getAnimations({subtree:true}).filter(a => a.playState === 'running').length}; });
      await page.waitForFunction(() => window.__toyPhone.voice().log.some(l => /Picnic parade/.test(typeof l === 'string' ? l : l.text)), null, {timeout:5000}).catch(() => {});
      check(parade.n === 10 && (await said()).includes('Picnic parade! Ten full tummies!'), `${tag}: ten fed: all ten march in a picnic parade, and it says so (${parade.n}; ${(await said()).slice(-3).join(' / ')})`);
      check(reducedMotion === 'reduce' ? parade.still && parade.moving === 0 : !parade.still && parade.moving >= 10,
        `${tag}: ${reducedMotion === 'reduce' ? 'with reduced motion they stand still in a row' : 'they march across'} (${parade.moving} moving)`);
      if (reducedMotion === 'reduce'){
        await page.evaluate(() => window.__toyPhone.go('home')); await page.waitForTimeout(300);
        check(await page.evaluate(() => !document.querySelector('.st-parade') && window.__toyPhone.timers() === 0), `${tag}: leaving in the middle of the parade stops it`);
      } else {
        await page.waitForFunction(() => !window.__toyPhone.snack().parade && window.__toyPhone.snack().want, null, {timeout:15000});
        check((await snack()).fed === 10, `${tag}: after the parade the next animal comes`);
      }
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
    check(allTwos >= 1, `"two" rounds came up (${allTwos})`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
