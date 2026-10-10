/* Story narration and replay (R-24), with real taps: a story page turns only after its line has been heard, judged by
   the sound itself, not a guess at its length. The speaker and the picture both read the current page again, from the
   start, near the beginning or the end of a page, and the page waits for that reading; mashing them never stacks
   voices or turns more than one page; a slow clip is waited for; the back arrow and Home stop the story and its voice;
   in the background nothing moves on, and back in front the page is read again before it turns; an answered round
   left in the background goes on when the toy comes back. Feelings Friends' pages behave the same.
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
const WEBKIT = process.argv.includes('--webkit');

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (WEBKIT ? webkit : chromium).launch();
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    for (const viewport of [{width:390, height:844}, {width:844, height:390}]){
      const tag = `${viewport.width}x${viewport.height}`, portrait = viewport.width < viewport.height;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true});
      await context.route('https://fonts.googleapis.com/**', r => r.fulfill({contentType:'text/css', body:''}));
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      // a slow network for some clips: their requests are held back until the test lets them through
      let slow = null; const held = [];
      await context.route('**/assets/voice/*.mp3', async r => { if (slow && slow(r.request().url())){ await new Promise(go => held.push(go)); } await r.continue(); });
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        localStorage.setItem('toyphone.access', JSON.stringify({mode:'school'}));
        // a record of the story and the voice every 25 ms, to see when a page turned and whether the voice was still talking
        window.__rec = [];
        setInterval(() => { const t = window.__toyPhone; if (!t) return; const a = t.adventure(), v = t.voice();
          window.__rec.push({t:performance.now(), id:a.id, step:a.step, phase:a.phase, book:a.book, speaking:v.speaking, sources:v.sources, played:v.played, said:v.log.length, turning:a.turning}); }, 25);
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      const state = () => page.evaluate(() => window.__toyPhone.adventure());
      const voice = () => page.evaluate(() => window.__toyPhone.voice());
      const now = () => page.evaluate(() => performance.now());
      const rec = since => page.evaluate(since => window.__rec.filter(r => r.t >= since), since);
      const touch = async selector => { const box = await page.locator(selector).first().boundingBox(); await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); };
      const setHidden = hidden => page.evaluate(h => { if (h) Object.defineProperty(document, 'visibilityState', {configurable:true, value:'hidden'}); else delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }, hidden);
      const until = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, {timeout});
      const turned = async step => { await until(step => window.__toyPhone.adventure().step !== step, step, 20000); await page.waitForTimeout(80); };   // (the record catches up)
      // when the page turned, how long had the voice been quiet? (the last moment it was talking, before the turn)
      const quietBeforeTurn = (samples, step) => {
        const i = samples.findIndex(r => r.step !== step); if (i < 1) return null;
        const talk = samples.slice(0, i).filter(r => r.speaking).pop();
        return talk ? samples[i].t - talk.t : null;
      };
      const openBook = async key => {
        await page.evaluate(() => window.__toyPhone.go('storytime')); await until(() => window.__toyPhone.adventure().phase === 'shelf');
        await page.waitForTimeout(350);   // (the opening zoom)
        await touch(`#storytime [data-book="${key}"]`);
        await until(key => { const a = window.__toyPhone.adventure(); return a.book === key && a.phase === 'page'; }, key);
      };

      // a first tap unlocks the sound, like a child's first touch
      await page.touchscreen.tap(viewport.width/2, viewport.height/2);
      await page.waitForTimeout(300);

      // 1. a page turns only after its line has been heard
      let t0 = await now();
      await openBook('seed');
      await turned(0);
      let samples = await rec(t0);
      let quiet = quietBeforeTurn(samples.filter(r => r.book === "seed"), 0);
      check(quiet !== null && quiet >= 650 && samples.some(r => r.played > samples[0].played),
        `${tag}: the first page turns after its line was heard, then a pause (${quiet && Math.round(quiet)} ms of quiet)`);

      // 2. the speaker reads the page again near its beginning, and the page waits for that reading
      let st = await state(); const step2 = st.step;
      await page.waitForTimeout(250);
      t0 = await now(); const said = (await voice()).log.length;
      await touch('#storytime .lesson-replay');
      await until(n => window.__toyPhone.voice().log.length > n, said);
      check((await voice()).log.at(-1) === st.line, `${tag}: the speaker on a story page reads that page again ("${st.line}")`);
      await turned(step2);
      samples = await rec(t0); quiet = quietBeforeTurn(samples, step2);
      check(quiet !== null && quiet >= 650, `${tag}: after a replay near the start, the page waits for the whole reading (${quiet && Math.round(quiet)} ms of quiet before turning)`);

      // 3. near the end: the line is over and the page is about to turn; the picture reads it again and the page waits
      st = await state(); const step3 = st.step;
      await until(() => window.__toyPhone.adventure().turning);
      t0 = await now();
      await touch('#storytime .sa-scene');
      await page.waitForTimeout(60);
      const again = await state();
      check(again.step === step3 && !again.turning && (await voice()).log.at(-1) === st.line, `${tag}: tapping the picture just before the page turns reads it again instead`);
      await turned(step3);
      samples = await rec(t0); quiet = quietBeforeTurn(samples, step3);
      check(quiet !== null && quiet >= 650, `${tag}: and the page turns only after that reading (${quiet && Math.round(quiet)} ms of quiet)`);

      // 4. mashing the picture and the speaker: one voice at a time, one page turned, after the last reading
      await page.evaluate(() => window.__toyPhone.go('feelings'));
      await until(() => { const a = window.__toyPhone.adventure(); return a.id === 'feelings' && a.phase === 'page'; });
      await page.waitForTimeout(350);
      st = await state(); const step4 = st.step; t0 = await now();
      for (let i = 0; i < 8; i++){ await touch(i % 2 ? '#feelings .lesson-replay' : '#feelings .sa-scene'); await page.waitForTimeout(110); }
      const mashed = await state();
      check(mashed.step === step4 && mashed.phase === 'page', `${tag}: eight quick taps on a Feelings page don't turn it`);
      await turned(step4);
      samples = await rec(t0);
      const turnAt = samples.findIndex(r => r.step !== step4), after = samples.slice(turnAt);
      quiet = quietBeforeTurn(samples, step4);
      check(Math.max(...samples.slice(0, turnAt).map(r => r.sources)) <= 2, `${tag}: mashing never stacks voices (at most ${Math.max(...samples.slice(0, turnAt).map(r => r.sources))} clips at once)`);
      check(quiet !== null && quiet >= 650 && after.every(r => r.step <= step4 + 1), `${tag}: then exactly one page turns, after the last reading (${quiet && Math.round(quiet)} ms of quiet)`);

      // 5. a slow clip: the page waits for it to arrive and be heard (a guessed length would have turned it mid-line)
      if (portrait){
        slow = url => /assets\/voice\//.test(url);
        t0 = await now();
        await openBook('rain');
        await page.waitForTimeout(2500);
        st = await state();
        check(st.step === 0 && held.length > 0, `${tag}: while the first page's clip is still loading, the page stays (${held.length} request(s) waiting)`);
        slow = null; held.splice(0).forEach(go => go());
        await turned(0);
        samples = await rec(t0); quiet = quietBeforeTurn(samples, 0);
        check(quiet !== null && quiet >= 650 && samples.some(r => r.played > samples[0].played), `${tag}: once it arrives the line plays, then the page turns (${quiet && Math.round(quiet)} ms of quiet)`);
      }

      // 6. the back arrow mid-page: the shelf, and nothing more of the story
      await openBook('egg');
      await page.waitForTimeout(300);
      let log = (await voice()).log.length;
      await touch('#storytime .sc-back');
      await page.waitForTimeout(4500);
      st = await state(); let v = await voice();
      check(st.phase === 'shelf' && st.book === null && !st.turning, `${tag}: the back arrow mid-page goes to the shelf and stays there`);
      check(JSON.stringify(v.log.slice(log)) === '["Pick a story!"]' && !v.speaking, `${tag}: after the back arrow only the shelf speaks (${JSON.stringify(v.log.slice(log))})`);

      // 7. Home mid-page: School, no story voice or page turn behind it
      await touch('#storytime [data-book="egg"]');
      await until(() => window.__toyPhone.adventure().phase === 'page');
      await page.waitForTimeout(300);
      log = (await voice()).log.length;
      await touch('#homeBtn');
      await page.waitForTimeout(4500);
      st = await state(); v = await voice();
      check(st.id === null && await page.locator('#school:visible').count() === 1, `${tag}: Home mid-page leaves the story`);
      check(v.log.slice(log).every(l => !/Owl|egg|Chick/.test(l)) && !v.speaking && !v.waiting, `${tag}: and nothing of it is said or waited for afterwards (${JSON.stringify(v.log.slice(log))})`);

      // 8. the background mid-page: nothing moves on; back in front, the page is read again before it turns
      await openBook('egg');
      await page.waitForTimeout(300);
      st = await state(); const step8 = st.step;
      await setHidden(true);
      log = (await voice()).log.length;
      await page.waitForTimeout(5000);
      st = await state(); v = await voice();
      check(st.step === step8 && st.phase === 'page' && !st.turning && v.log.length === log && !v.speaking, `${tag}: in the background the page doesn't turn and nothing is said`);
      t0 = await now();
      await setHidden(false);
      await page.waitForTimeout(1500);
      if ((await voice()).played === v.played){   // (an engine that needs a tap to start again: the reading waits for it)
        check((await state()).step === step8 && (await voice()).waiting, `${tag}: back in front with the sound still asleep, the page waits for a tap`);
        await touch('#storytime .sa-scene');
      }
      await turned(step8);
      samples = await rec(t0); quiet = quietBeforeTurn(samples, step8);
      check(quiet !== null && quiet >= 650 && samples.some(r => r.played > v.played), `${tag}: back in front, the page is read again, then turns (${quiet && Math.round(quiet)} ms of quiet)`);

      // 9. an answered round left in the background goes on when the toy comes back
      await until(() => { const a = window.__toyPhone.adventure(); return a.phase === 'ask' && !a.busy; }, null, 30000);
      st = await state();
      await touch(`#storytime [data-choice="${st.right}"]`);
      await setHidden(true);
      await page.waitForTimeout(3500);
      check((await state()).step === st.step, `${tag}: an answer just before the background doesn't move on behind it`);
      await setHidden(false);
      await turned(st.step);
      check((await state()).step === st.step + 1, `${tag}: back in front, the next round comes`);

      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
