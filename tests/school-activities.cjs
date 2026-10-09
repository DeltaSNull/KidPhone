/* Sorting Station, Pattern Train, Story Time and Feelings Friends, played with real taps in three layouts:
   picture-only questions (nothing to read), three answers in a fresh order, Sorting's exact match drawn exactly the
   same, gentle misses with a glowing hint after two, stars and automatic next rounds, a full play to the end screen,
   Pattern Train's free train, the speaker repeating without changing anything, leaving mid-cheer, and School only.
   Run in Chromium, or with --webkit. */
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
const IDS = ['sorting', 'patterntrain', 'storytime', 'feelings'];

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const viewport of [{width:390, height:844}, {width:844, height:390}, {width:375, height:667}]){
      const tag = `${viewport.width}x${viewport.height}`;
      const full = viewport.width === 390;   // every round to the end in portrait; the other layouts check the screens and one round (CI time)
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true});
      await context.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:''}));
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        localStorage.setItem('toyphone.access', JSON.stringify({mode:'school'}));
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone);
      const go = async id => { await page.evaluate(id => window.__toyPhone.go(id), id); await page.waitForTimeout(300); };
      const state = () => page.evaluate(() => window.__toyPhone.adventure());
      const touch = async selector => {
        const box = await page.locator(selector).first().boundingBox();
        await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2);
      };
      const asking = id => page.waitForFunction(id => { const a = window.__toyPhone.adventure(); return a.id === id && a.phase === 'ask' && !a.busy; }, id, {timeout:20000});
      const moved = step => page.waitForFunction(step => { const a = window.__toyPhone.adventure(); return a.step !== step || a.phase === 'done'; }, step, {timeout:20000});

      for (const id of IDS){
        await go(id);
        check(await page.locator(`#${id}:visible`).count() === 1, `${tag} ${id}: opens in School only`);
        await asking(id);
        let st = await state();
        // nothing to read: the only text on a question screen is the "?" of a missing train car or a thought
        const text = (await page.locator(`#${id}`).innerText()).replace(/\s+/g, '');
        check(/^\?*$/.test(text), `${tag} ${id}: the question is pictures and voice, no words on screen (${JSON.stringify(text)})`);
        check(st.choices.length === 3 || (id === 'feelings' && st.choices.length >= 2), `${tag} ${id}: picture answers ${JSON.stringify(st.choices)}`);
        check(new Set(st.choices).size === st.choices.length && st.choices.includes(st.right), `${tag} ${id}: the answers are different and one is right`);
        const boxes = await page.locator(`#${id} .sa-choice, #${id} .sc-back, #${id} .lesson-replay`).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, r.width, r.height]; }));
        check(boxes.every(([l, t, r, b, w, h]) => l >= 0 && t >= 0 && r <= viewport.width && b <= viewport.height && w >= 56 && h >= 56),
          `${tag} ${id}: every button is on screen and big enough ${JSON.stringify(boxes.map(b => b.slice(4).map(Math.round)))}`);

        // the speaker says it again and changes nothing
        await touch(`#${id} .lesson-replay`); await page.waitForTimeout(200);
        const again = await state();
        check(again.step === st.step && again.right === st.right && JSON.stringify(again.choices) === JSON.stringify(st.choices) && again.solved === 0,
          `${tag} ${id}: the speaker repeats without changing the question`);

        // two wrong taps: no star, and the right answer glows
        const wrong = st.choices.filter(c => c !== st.right);
        await touch(`#${id} [data-choice="${wrong[0]}"]`); await page.waitForTimeout(250);
        await touch(`#${id} [data-choice="${wrong[1] || wrong[0]}"]`); await page.waitForTimeout(250);
        st = await state();
        check(st.solved === 0 && st.misses === 2 && await page.locator(`#${id} [data-choice="${st.right}"].hint`).count() === 1, `${tag} ${id}: two misses earn nothing and the right one glows`);

        // play to the end, tapping the right answers (one round only in the other layouts)
        for (let n = 0, rounds = 0; n < 40 && (full || rounds < 1); n++){
          st = await state();
          if (st.phase === 'done') break;
          if (st.phase !== 'ask' || st.busy){ await page.waitForTimeout(200); continue; }
          if (id === 'sorting' && /same one/.test(st.ask)){
            const same = await page.evaluate(() => { const a = window.__toyPhone.adventure(), s = document.querySelector('#sorting .sa-scene img'), c = document.querySelector(`#sorting [data-choice="${a.right}"] img`); return s.getAttribute('src') === c.getAttribute('src'); });
            check(same, `${tag} sorting: "the same one" is drawn exactly the same, size included`);
          }
          await touch(`#${id} [data-choice="${st.right}"]`); rounds++;
          await page.waitForTimeout(150);
          check((await state()).solved === st.solved + 1, `${tag} ${id}: a right answer lights a star (${st.ask})`);
          await moved(st.step);
        }
        st = await state();
        if (!full){ await touch(`#${id} .sc-back`); await page.waitForTimeout(250); continue; }
        check(st.phase === 'done' && st.solved === st.total && await page.locator(`#${id} .sa-again:visible`).count() === 1, `${tag} ${id}: every star lit, then the end screen with play again`);
        check(/Together/.test(await page.locator(`#${id} .sa-together`).innerText()), `${tag} ${id}: the end screen has an idea for the grown-up`);
        if (id === 'patterntrain'){
          await touch('#patterntrain .sa-train-own'); await page.waitForTimeout(200);
          for (let i = 1; i <= 3; i++){ await touch(`#patterntrain .sa-choice:nth-child(${i})`); await page.waitForTimeout(150); }
          check((await state()).phase === 'free' && await page.locator('#patterntrain .sa-car').count() === 3, `${tag} patterntrain: after the stars, the kids make their own train`);
        }
        await touch(`#${id} .sc-back`); await page.waitForTimeout(250);
        check(await page.locator('#school:visible').count() === 1, `${tag} ${id}: the School button goes back to School`);
      }

      // a fresh order every time: the right answer doesn't stay in one place
      const spots = new Set();
      for (let i = 0; i < 8; i++){ await go('sorting'); await asking('sorting'); const a = await state(); spots.add(a.choices.indexOf(a.right)); }
      check(spots.size > 1, `${tag}: the right answer moves around (${[...spots]})`);
      // leaving during the cheer: nothing goes on behind School
      await asking('sorting'); const a = await state();
      await touch(`#sorting [data-choice="${a.right}"]`); await go('school'); await page.waitForTimeout(2500);
      check((await state()).id === null && await page.locator('#school:visible').count() === 1, `${tag}: leaving during the cheer cancels the next round`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
