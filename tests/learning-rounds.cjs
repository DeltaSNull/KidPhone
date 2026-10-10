/* Pattern Train and Sorting answers depend on the idea being taught, not on a shortcut (R-26), and their size rounds
   look right on screen:
   - over 300 fresh plays: the size trains have two answers, identical but for size, and either size can be next;
     Sorting's "same size" has two answers (so the answer is never just the odd one out) and the one in the picture's
     color is the wrong size; every train's answer continues its pattern; no simple guess (the first car, the last
     car, the most or least common car, the car not on the train) always works; the pattern kinds come gently (a
     two-car pattern in colors, animals, sizes, then two-and-one, then three-car), each new kind after a
     demonstration train in other colors;
   - played with real taps: the demonstration's cars hop in turn and its page turns by itself; the speaker replays it;
   - on screen, in narrow portrait (320x568), portrait and landscape, and after turning the phone with the round open:
     the shapes as drawn (their ink, not their boxes) match in size where they should, and a small one is clearly
     smaller than a big one.
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
const size = k => k.split('-')[0], color = k => k.split('-')[1], kind = k => k.split('-')[2];
const unit = seq => [2, 3].find(p => seq.every((c, i) => c === seq[i % p])) || seq.length;

/* the drawn shape in an <img>: its ink width on screen (the picture is scaled to fit its box, then the shape is part of it) */
function inkWidths(selectors){
  const c = document.createElement('canvas'), g = c.getContext('2d', {willReadFrequently:true});
  return selectors.map(q => [...document.querySelectorAll(q)].map(img => {
    const nw = img.naturalWidth, nh = img.naturalHeight; c.width = nw; c.height = nh; g.clearRect(0, 0, nw, nh); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, nw, nh).data; let x0 = nw, x1 = -1;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) if (d[(y*nw + x)*4 + 3] > 40){ if (x < x0) x0 = x; if (x > x1) x1 = x; }
    const scale = Math.min(img.offsetWidth/nw, img.offsetHeight/nh);   // object-fit: contain (layout size: the opening zoom scales the screen)
    return x1 < 0 ? 0 : +((x1 - x0 + 1)*scale).toFixed(1);
  }));
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    const context = await browser.newContext({viewport:{width:390, height:844}, hasTouch:true, isMobile:true});
    await context.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
    await context.addInitScript(() => {
      localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'pretend', look:'drag', tilt:'off'}));
      localStorage.setItem('toyphone.access', JSON.stringify({mode:'school'}));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForFunction(() => window.__toyPhone);

    // 1. many plays as data
    const trains = await page.evaluate(() => Array.from({length:300}, () => window.__toyPhone.adventurePlan('patterntrain')));
    const sorts = await page.evaluate(() => Array.from({length:300}, () => window.__toyPhone.adventurePlan('sorting')));
    const sizeTrains = trains.map(p => p.find(r => r.actual));
    check(sizeTrains.every(r => r.choices.length === 2 && new Set(r.choices.map(size)).size === 2 && new Set(r.choices.map(k => color(k) + kind(k))).size === 1),
      'Pattern Train: the size train has two answers, the same shape and color, one big and one small');
    const nextSizes = new Set(sizeTrains.map(r => size(r.right)));
    check(nextSizes.has('big') && nextSizes.has('small'), `Pattern Train: either size can come next (${[...nextSizes]})`);
    const asked = trains.flatMap(p => p.filter(r => !r.page));
    check(asked.every(r => { const p = unit(r.seq); return r.right === r.seq[r.seq.length - p]; }), 'Pattern Train: every answer continues its train\'s pattern');
    const count = (seq, k) => seq.filter(c => c === k).length, only = a => a.length === 1 ? a[0] : null;
    const guesses = {
      'the first car':r => r.seq[0], 'the last car':r => r.seq.at(-1),
      // (a tie is no guess at all: a child can't pick "the fewest" when two cars are equally few)
      'the most common car':r => only(r.choices.filter(k => count(r.seq, k) === Math.max(...r.choices.map(k => count(r.seq, k))))),
      'the least common car on the train':r => only(r.choices.filter(k => r.seq.includes(k) && count(r.seq, k) === Math.min(...r.choices.filter(k => r.seq.includes(k)).map(k => count(r.seq, k))))),
      'the car not on the train':r => r.choices.find(k => !r.seq.includes(k))};
    for (const [name, guess] of Object.entries(guesses)){
      const hits = asked.filter(r => guess(r) === r.right).length / asked.length;
      check(hits < .75, `Pattern Train: guessing "${name}" doesn't work (right ${Math.round(hits*100)}% of the time)`);
    }
    const kinds = p => p.filter(r => !r.page).map(r => ({2:'AB', 3:new Set(r.seq).size === 2 ? 'AAB' : 'ABC'})[unit(r.seq)]);
    check(trains.every(p => JSON.stringify(kinds(p)) === '["AB","AB","AB","AAB","ABC"]'), 'Pattern Train: patterns come gently: two-car (colors, animals, sizes), then two-and-one, then three-car');
    const demosFirst = trains.every(p => p.every((r, i) => {
      if (r.page) return true;
      const k = kinds([r])[0], firstOfKind = !p.slice(0, i).some(q => !q.page && kinds([q])[0] === k);
      return !firstOfKind || (p[i - 1] && p[i - 1].demo);
    }));
    check(demosFirst, 'Pattern Train: each new kind of pattern comes right after a demonstration train');
    check(trains.every(p => p.filter(r => r.demo).every((d, j) => d.line === (j === 0 ? 'Watch the train!' : 'A new train! Watch!'))), 'Pattern Train: the demonstrations say "Watch the train!", then "A new train! Watch!"');
    const sizeSorts = sorts.map(p => p.find(r => /same size/.test(r.ask)));
    check(sizeSorts.every(r => r.choices.length === 2 && new Set(r.choices.map(size)).size === 2 && size(r.right) === size(r.target)),
      'Sorting: "the same size" has two answers, one of each size (never the odd one out of three)');
    check(sizeSorts.every(r => r.choices.filter(k => color(k) === color(r.target)).every(k => k !== r.right)), 'Sorting: the answer in the picture\'s own color is the wrong size');
    check(new Set(sizeSorts.map(r => size(r.target))).size === 2, 'Sorting: the picture to match is big in some plays and small in others');

    // 2. a demonstration, played: the cars hop in turn, the page turns by itself, the speaker replays it
    await page.touchscreen.tap(195, 420); await page.waitForTimeout(200);
    await page.evaluate(() => window.__toyPhone.go('patterntrain'));
    await page.waitForFunction(() => { const a = window.__toyPhone.adventure(); return a.id === 'patterntrain' && a.phase === 'page'; });
    const hopped = await page.evaluate(() => new Promise(done => { const seen = new Set(), t0 = performance.now();
      const look = () => { document.querySelectorAll('#patterntrain .sa-car').forEach((c, i) => { if (c.classList.contains('hop')) seen.add(i); }); if (performance.now() - t0 < 3200) requestAnimationFrame(look); else done(seen.size); }; look(); }));
    check(hopped === 6 && await page.locator('#patterntrain .sa-q').count() === 0, `Pattern Train: the demonstration is a whole train (no "?") whose six cars hop in turn (${hopped})`);
    const said = (await page.evaluate(() => window.__toyPhone.voice().log)).length;
    const replay = await page.locator('#patterntrain .lesson-replay').boundingBox();
    await page.touchscreen.tap(replay.x + replay.width/2, replay.y + replay.height/2);
    await page.waitForTimeout(150);
    check((await page.evaluate(() => window.__toyPhone.voice().log)).slice(said).includes('Watch the train!') && (await page.evaluate(() => window.__toyPhone.adventure())).phase === 'page',
      'Pattern Train: the speaker replays the demonstration');
    await page.waitForFunction(() => { const a = window.__toyPhone.adventure(); return a.phase === 'ask' && a.ask === 'Now you! What comes next?'; }, null, {timeout:15000});
    check(true, 'Pattern Train: then "Now you! What comes next?"');

    // 3. the size rounds on screen, in three layouts and after turning the phone
    const shot = async (id, step) => {
      await page.evaluate(id => window.__toyPhone.go(id), id); await page.waitForTimeout(400);
      await page.evaluate(step => window.__toyPhone.adventureJump(step), step);
      await page.waitForFunction(() => window.__toyPhone.adventure().phase === 'ask'); await page.waitForTimeout(250);
    };
    const measureSort = async tag => {
      const st = await page.evaluate(() => window.__toyPhone.adventure());
      const [[target], picks] = await page.evaluate(inkWidths, ['#sorting .sa-target img', '#sorting .sa-choices img']);
      const keys = await page.locator('#sorting .sa-choices .sa-choice').evaluateAll(els => els.map(e => e.dataset.choice));
      const right = picks[keys.indexOf(st.right)], wrong = picks[keys.findIndex(k => k !== st.right)];
      check(Math.abs(target - right) <= 1.5 && Math.max(target, wrong)/Math.min(target, wrong) >= 1.45,
        `${tag} sorting: the shape to match is drawn ${target}px wide, the same-size answer ${right}px, the other size ${wrong}px`);
    };
    const measureTrain = async tag => {
      const st = await page.evaluate(() => window.__toyPhone.adventure());
      const [cars, picks] = await page.evaluate(inkWidths, ['#patterntrain .sa-car img', '#patterntrain .sa-choices img']);
      const keys = await page.locator('#patterntrain .sa-choices .sa-choice').evaluateAll(els => els.map(e => e.dataset.choice));
      const seq = await page.locator('#patterntrain .sa-car img').evaluateAll(els => els.map(e => e.alt));
      const big = cars.filter((_, i) => !/^small/.test(seq[i])), small = cars.filter((_, i) => /^small/.test(seq[i]));
      const bigPick = picks[keys.findIndex(k => k.startsWith('big'))], smallPick = picks[keys.findIndex(k => k.startsWith('small'))];
      check(st.choices.length === 2 && Math.abs(big[0] - bigPick) <= 1.5 && Math.abs(small[0] - smallPick) <= 1.5 && bigPick/smallPick >= 1.45,
        `${tag} patterntrain: big cars ${big[0]}px / big answer ${bigPick}px, small cars ${small[0]}px / small answer ${smallPick}px`);
    };
    for (const vp of [{width:320, height:568}, {width:390, height:844}, {width:844, height:390}]){
      const tag = `${vp.width}x${vp.height}`, turned = {width:vp.height, height:vp.width};
      await page.setViewportSize(vp); await page.waitForTimeout(300);
      await shot('sorting', 3); await measureSort(tag);
      await page.setViewportSize(turned); await page.waitForTimeout(600); await measureSort(`${tag} turned to ${turned.width}x${turned.height}`);
      await page.setViewportSize(vp); await page.waitForTimeout(300);
      const sizeStep = (await page.evaluate(() => window.__toyPhone.adventurePlan('patterntrain'))).findIndex(r => r.actual);
      await shot('patterntrain', sizeStep); await measureTrain(tag);
      await page.setViewportSize(turned); await page.waitForTimeout(600); await measureTrain(`${tag} turned to ${turned.width}x${turned.height}`);
    }
    check(errors.length === 0, `no JavaScript errors ${errors.join('; ')}`);
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
