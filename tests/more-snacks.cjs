/* More Snacks (R-31), the School game about "who has more?", with real taps:
   - it's on the School menu, with the number games, and opens with a demonstration: two rows lined up, one next to one;
   - every question shows two animals, each with a pile of 1 to 5 of its own snack, never the same number; the piles on
     screen hold exactly those snacks, none touching, inside their cards;
   - gently harder through one play: gaps of three, two, then one; tidy piles, then scattered; one round where the smaller
     pile is spread out and the bigger one bunched up;
   - over 300 plays the answer is on the left about half the time, and neither "the bigger pile" nor "the side" is a
     shortcut;
   - a wrong tap says "Let's line them up!" and lines the snacks up (the extra ones glow); a second wrong tap makes the
     right card glow; a right tap gives a star, names who has more and shows the line-up;
   - six stars, then the end; every line has a recording.
   Portrait, landscape and a small phone. Run in Chromium, or with --webkit. */
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
let NAME = {};   // (what the narrator calls each animal: Snack Time's names, "puppy" for the dog)

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    for (const viewport of [{width:390, height:844}, {width:844, height:390}, {width:320, height:568}]){
      const tag = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({viewport, hasTouch:true, isMobile:true});
      await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
      await context.addInitScript(() => localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'})));
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => { if (!/assets\/voice\/\w+\.mp3 due to access control checks/.test(e.message)) errors.push(e.message); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
      await page.touchscreen.tap(viewport.width/2, viewport.height/2); await page.waitForTimeout(300);
      const state = () => page.evaluate(() => window.__toyPhone.adventure());
      NAME = Object.fromEntries((await page.evaluate(() => window.__toyPhone.snackPals())).map(p => [p.a, p.n]));
      const said = () => page.evaluate(() => window.__toyPhone.voice().log.map(l => typeof l === 'string' ? l : l.text));
      const touch = async selector => { const box = await page.locator(selector).first().boundingBox(); await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); };

      // the menu card, with the number games
      await page.evaluate(() => window.__toyPhone.go('school')); await page.waitForTimeout(400);
      const menu = await page.$$eval('#schoolList .gamecard', bs => bs.map(b => b.getAttribute('aria-label')));
      check(menu.indexOf('More Snacks') === menu.indexOf('Dino Picnic') + 1, `${tag}: More Snacks is on the School menu, after Dino Picnic`);
      await page.locator('#schoolList .gamecard[aria-label="More Snacks"]').scrollIntoViewIfNeeded();
      await touch('#schoolList .gamecard[aria-label="More Snacks"]'); await page.waitForTimeout(500);
      let st = await state();
      check(st.id === 'moresnacks' && st.phase === 'page' && /^Watch! Let's line them up\. The \w+ has more!$/.test(st.line) && await page.locator('#moresnacks .ml-rows .ml-extra').count() === 2,
        `${tag}: it starts with a demonstration: one and three lined up, two extra ("${st.line}")`);

      if (viewport.width === 390){
        // the plan, over many plays
        const plays = await page.evaluate(() => Array.from({length:300}, () => window.__toyPhone.adventurePlan('moresnacks').filter(r => !r.page)));
        const all = plays.flat();
        check(plays.every(p => p.length === 6) && all.every(r => r.counts.length === 2 && r.counts[0] !== r.counts[1] && r.counts.every(n => n >= 1 && n <= 5)),
          'every question: two piles of 1 to 5, never the same');
        check(all.every(r => r.choices[r.counts.indexOf(Math.max(...r.counts))] === r.right), 'the right answer is always the animal with more');
        const gaps = plays.map(p => p.map(r => Math.abs(r.counts[0] - r.counts[1])));
        check(gaps.every(g => g[0] === 3 && g[1] === 2 && g[2] === 2 && g[3] === 1 && g[4] >= 1 && g[4] <= 2 && g[5] === 1), 'gently harder: gaps of three, two, two, one, then one or two, then one');
        check(plays.every(p => p.map(r => r.lay).join() === 'tidy,tidy,scatter,tidy,trick,scatter'), 'tidy piles first, then scattered, with one bunched-versus-spread round');
        const left = all.filter(r => r.choices[0] === r.right).length / all.length;
        check(left > .44 && left < .56, `the answer is on the left ${(left*100).toFixed(0)}% of the time`);
        check(plays.every(p => p.every(r => r.choices[0] !== r.choices[1])), 'two different animals each time');
        const pals = new Set(all.flatMap(r => r.choices)), countable = (await page.evaluate(() => window.__toyPhone.snackPals())).map(p => p.a);
        check(pals.size === countable.length && countable.length >= 30 && ['bunny', 'squirrel', 'pig', 'hedgehog', 'goat', 'dragon'].every(a => pals.has(a)),
          `Snack Time's animals with snacks you can count take turns (${pals.size}), the newest friends among them`);
      }

      // play it through with real taps: one wrong tap and one second wrong tap along the way
      await page.waitForFunction(() => window.__toyPhone.adventure().phase === 'ask', null, {timeout:15000});
      for (let q = 0; q < 6; q++){
        await page.waitForFunction(n => { const s = window.__toyPhone.adventure(); return s.phase === 'ask' && !s.busy && s.solved === n; }, q, {timeout:15000});
        st = await state();
        const piles = await page.$$eval('#moresnacks .sa-choice', bs => bs.map(b => {
          const card = b.getBoundingClientRect(), items = [...b.querySelectorAll('.ml-item')].map(i => { const r = i.getBoundingClientRect(); return {l:r.left, t:r.top, r:r.right, b:r.bottom}; });
          const inside = items.every(i => i.l >= card.left - 1 && i.r <= card.right + 1 && i.t >= card.top - 1 && i.b <= card.bottom + 1);
          const touching = items.some((a, x) => items.some((c, y) => x < y && a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1));
          return {key:b.dataset.choice, n:items.length, inside, touching, w:card.width, h:card.height, size:items[0] ? items[0].r - items[0].l : 0};
        }));
        check(piles.length === 2 && piles.map(p => p.n).join() === st.counts.join() && piles.every(p => p.inside && !p.touching && p.size >= 22),
          `${tag} question ${q + 1} (${st.lay}): ${st.counts.join(' and ')} snacks on screen, inside their cards, none touching, ${Math.round(Math.min(...piles.map(p => p.size)))}px or more`);
        if (st.lay === 'trick'){
          const spread = await page.$$eval('#moresnacks .sa-choice', bs => bs.map(b => { const r = [...b.querySelectorAll('.ml-item')].map(i => i.getBoundingClientRect());
            return (Math.max(...r.map(x => x.right)) - Math.min(...r.map(x => x.left))) * (Math.max(...r.map(x => x.bottom)) - Math.min(...r.map(x => x.top))); }));
          const few = st.counts.indexOf(Math.min(...st.counts));
          check(spread[few] > spread[1 - few] * 1.5, `${tag}: the smaller pile takes up more space than the bigger one`);
        }
        const wrong = st.choices.find(c => c !== st.right);
        if (q === 1){
          await touch(`#moresnacks [data-choice="${wrong}"]`); await page.waitForTimeout(400);
          await page.waitForFunction(() => window.__toyPhone.voice().log.some(l => (typeof l === 'string' ? l : l.text) === "Let's line them up!"), null, {timeout:5000}).catch(() => {});
          const extra = await page.locator('#moresnacks .sa-scene .ml-extra').count();
          check((await state()).solved === 1 && (await said()).includes("Let's line them up!") && extra === Math.abs(st.counts[0] - st.counts[1]) && await page.locator('#moresnacks .sa-scene .ml-rows').count() === 1,
            `${tag}: a wrong tap lines the snacks up, ${extra} extra glowing, and says "Let's line them up!"`);
          await touch(`#moresnacks [data-choice="${wrong}"]`); await page.waitForTimeout(300);
          check(await page.locator(`#moresnacks .sa-choice.hint[data-choice="${st.right}"]`).count() === 1, `${tag}: a second wrong tap makes the right card glow`);
        }
        await touch(`#moresnacks [data-choice="${st.right}"]`); await page.waitForTimeout(300);
        const after = await state();
        check(after.solved === q + 1 && await page.locator('#moresnacks .sa-scene .ml-rows').count() === 1, `${tag}: the ${st.right} has more: a star, and the line-up shows why`);
        await page.waitForFunction(r => window.__toyPhone.voice().log.some(l => (typeof l === 'string' ? l : l.text) === `Yes! The ${r} has more!`), NAME[st.right] || st.right, {timeout:8000});
      }
      await page.waitForFunction(() => window.__toyPhone.adventure().phase === 'done', null, {timeout:15000});
      await page.waitForFunction(() => window.__toyPhone.voice().log.some(l => (typeof l === 'string' ? l : l.text) === 'You found who has more!'), null, {timeout:8000});
      check((await state()).solved === 6 && await page.locator('#moresnacks .sa-finish').isVisible(), `${tag}: six stars, then the end`);

      if (viewport.width === 390){
        const needed = ['More Snacks!', 'Who has more snacks?', "Let's line them up!", 'You found who has more!', 'Yes! The puppy has more!', 'Watch! Let\'s line them up. The frog has more!',
          'Yes! The hedgehog has more!', 'Watch! Let\'s line them up. The little dragon has more!'];
        const missing = await page.evaluate(ls => ls.filter(l => !window.__toyPhone.voiceFile(l)), needed);
        check(missing.length === 0, `the lines are recorded ${missing.join(', ')}`);
      }
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
