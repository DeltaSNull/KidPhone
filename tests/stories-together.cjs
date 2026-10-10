/* Story Time's "read together" and Feelings Friends' flexible feelings (R-27), with real taps:
   - the shelf offers two ways to read (pictures, spoken when tapped): with questions (the default, as before) or
     together; reading together, a page is read and then waits for the grown-up's arrow (no turning by itself, no
     questions), the speaker and the picture read it again, the back arrow returns a page, each page has a short
     idea for the grown-up, and the last arrow ends the story; with questions it plays as before;
   - Feelings: each friend's second page says how that friend reacts; "What can help?" has two kind answers that are
     both right (asking for a hug, a grown-up, a big breath) and grabbing a toy, which never is; the face still only
     shows after the feeling is named (tests/school-activities.cjs checks that in full).
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
const REACTIONS = /wags|jumps up and down|tears|cry|stomps|shouts|hides and shakes|swims away/;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const viewport of [{width:390, height:844}, {width:844, height:390}]){
      const tag = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => {
        localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
        localStorage.setItem('toyphone.access', JSON.stringify({mode:'school'}));
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      const state = () => page.evaluate(() => window.__toyPhone.adventure());
      const log = () => page.evaluate(() => window.__toyPhone.voice().log);
      const touch = async selector => { const box = await page.locator(selector).first().boundingBox(); await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); };
      const visible = selector => page.locator(selector).first().isVisible();
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(200);

      // the shelf's two ways to read
      await page.evaluate(() => window.__toyPhone.go('storytime')); await page.waitForTimeout(400);
      check(await visible('#storytime .sa-modes') && await page.locator('#storytime [data-mode="questions"]').getAttribute('aria-pressed') === 'true',
        `${tag}: the shelf offers two ways to read, with questions chosen at first`);
      const boxes = await page.locator('#storytime .sa-mode, #storytime .sc-back, #storytime .lesson-replay').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => [r.left, r.top, r.right, r.bottom]));
      const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]));
      check(!overlap && boxes.every(([l, t, r, b]) => l >= 0 && t >= 0 && r <= viewport.width && b <= viewport.height), `${tag}: the two buttons sit between the back and speaker buttons, on screen`);
      let n = (await log()).length;
      await touch('#storytime [data-mode="together"]'); await page.waitForTimeout(600);
      check((await state()).mode === 'together' && (await log()).slice(n).includes('Read together!') && await page.locator('#storytime [data-mode="together"]').getAttribute('aria-pressed') === 'true',
        `${tag}: tapping the grown-up picture chooses "Read together!" (spoken)`);

      // reading together: the page waits for the grown-up
      await touch('#storytime [data-book="seed"]');
      await page.waitForFunction(() => window.__toyPhone.adventure().phase === 'page');
      await page.waitForTimeout(6000);
      let st = await state();
      check(st.step === 0 && st.phase === 'page' && !st.turning, `${tag}: reading together, the first page stays after it's read`);
      check(await visible('#storytime .sa-next') && !(await page.locator('#storytime .sa-prev').evaluate(e => getComputedStyle(e).visibility === 'visible')),
        `${tag}: there's a next-page arrow, and no back arrow on the first page`);
      check(/Duck|seed/.test(await page.locator('#storytime .sa-talk').innerText()), `${tag}: the page has an idea for the grown-up ("${await page.locator('#storytime .sa-talk').innerText()}")`);
      n = (await log()).length; await touch('#storytime .lesson-replay'); await page.waitForTimeout(300);
      check((await log()).slice(n).includes('Duck plants a seed.') && (await state()).step === 0, `${tag}: the speaker reads the page again, and it still waits`);
      n = (await log()).length; await touch('#storytime .sa-scene'); await page.waitForTimeout(300);
      check((await log()).slice(n).includes('Duck plants a seed.'), `${tag}: so does the picture`);
      await touch('#storytime .sa-next'); await page.waitForTimeout(300);
      st = await state();
      check(st.step === 1 && (await log()).at(-1) === 'Duck gives it water.', `${tag}: the arrow turns the page and it's read`);
      await touch('#storytime .sa-prev'); await page.waitForTimeout(300);
      check((await state()).step === 0, `${tag}: the back arrow returns a page`);
      for (let i = 0; i < 3; i++){ await touch('#storytime .sa-next'); await page.waitForTimeout(350); }
      st = await state();
      check(st.phase === 'done' && st.total === 0 && await visible('#storytime .sa-more') && !(await log()).some(l => /^What /.test(l)),
        `${tag}: after the last page the story ends, with no questions`);
      await touch('#storytime .sa-more'); await page.waitForTimeout(300);
      check((await state()).phase === 'shelf' && (await state()).mode === 'together', `${tag}: the book button returns to the shelf, still reading together`);

      // back to questions: as before
      await touch('#storytime [data-mode="questions"]'); await page.waitForTimeout(300);
      await touch('#storytime [data-book="egg"]');
      await page.waitForFunction(() => { const a = window.__toyPhone.adventure(); return a.phase === 'ask'; }, null, {timeout:30000});
      check(!(await visible('#storytime .sa-turns')) && (await state()).total > 0, `${tag}: with questions, pages turn by themselves and the questions come`);

      // Feelings: each friend's reaction; two kind answers are both right
      const plans = await page.evaluate(() => Array.from({length:40}, () => window.__toyPhone.adventurePlan('feelings')));
      const second = plans.flatMap(p => p.filter((r, i) => r.page && p[i + 1] && !p[i + 1].page)).map(r => r.line);
      check(second.length && second.every(l => REACTIONS.test(l)), `${tag}: every friend's second page says how that friend reacts (${[...new Set(second)].length} stories)`);
      const helps = plans.flatMap(p => p.filter(r => /^What can help/.test(r.ask || '')));
      check(helps.every(r => r.choices.length === 3 && r.choices.includes('take')), `${tag}: "What can help?" offers two kind answers and grabbing the toy`);
      await page.evaluate(() => window.__toyPhone.go('feelings')); await page.waitForTimeout(400);
      let k = 0;
      for (; k < 20; k++){ await page.evaluate(k => window.__toyPhone.adventureJump(k), k); st = await state(); if (/^What can help/.test(st.ask || '')) break; }
      await page.waitForFunction(() => window.__toyPhone.adventure().phase === 'ask');
      st = await state();
      check(st.rights.length === 2 && !st.rights.includes('take'), `${tag}: ${st.ask} ${JSON.stringify(st.rights)} are both right`);
      await touch('#feelings [data-choice="take"]'); await page.waitForTimeout(900);   // (the line waits for the "uh-uh" to finish)
      check((await state()).solved === 0 && (await state()).misses === 1 && (await log()).at(-1) === 'Be gentle. Try again!', `${tag}: grabbing the toy gets "Be gentle. Try again!" (${JSON.stringify((await log()).slice(-2))})`);
      const name = st.ask.replace(/^What can help (\w+)\?$/, '$1'), other = st.rights[1];
      await touch(`#feelings [data-choice="${other}"]`); await page.waitForTimeout(900);
      const said = (await log()).slice(-3).join(' | ');
      check((await state()).solved === 1 && (other !== 'hug' || said.includes(`${name} can ask for a hug!`)), `${tag}: the second kind answer is right too (${other}: "${said}")`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
