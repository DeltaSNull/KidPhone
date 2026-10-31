/* Snack Time, the journey (R-30, R-32), with real taps:
   - 54 animals in seven places (farm, forest, garden, seaside, jungle, savanna, Dino Land), each with its own snack:
     no two animals share one; every animal and snack has a picture, every call a sound, every line a recording;
   - the kitty still wants her milk (the family's pick);
   - it starts on the farm, with the farm's scenery and only farm animals; the foods offered always include the one
     wanted, never two that look alike;
   - once a few animals are fed, some ask for two of something you can count: two in the bubble, a bite and "One more!",
     then the meal; never two of milk or hay;
   - when everyone at a place is fed, they march past in a picnic parade ("Everyone on the farm is full!"), then the bus
     drives on to the next place ("Off to the forest!") and its animals come; with Reduce Motion the parade stands still;
     leaving in the middle stops it;
   - the map button shows every place as a picture card ("Where shall we go?"), with a star on places visited; tapping
     one goes there.
   Portrait, and landscape with Reduce Motion. Run in Chromium, or with --webkit. */
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
const UNCOUNTABLE = ['milk', 'bamboo', 'corn', 'watermelon', 'grass', 'meat', 'hay', 'oats', 'clover', 'honey', 'cheese', 'grapes', 'cherries', 'eucalyptus', 'krill', 'seaweed', 'lettuce', 'ribs', 'dates', 'peas'];
const LOOKALIKE = [['strawberry', 'raspberry', 'cherries'], ['leaf', 'eucalyptus', 'lettuce', 'cabbage', 'clover', 'fern'], ['fish', 'salmon'], ['shrimp', 'krill'],
  ['meat', 'ham', 'steak', 'ribs', 'sausage'], ['fly', 'cricket', 'beetle'], ['orange', 'mango', 'pumpkin'], ['peanut', 'acorn', 'dates', 'pinecone'], ['grass', 'hay', 'oats'], ['flower', 'sunflower']];
const CALLS = ['moo', 'oink', 'peep', 'quack', 'neigh', 'baa', 'maa', 'woof', 'meow', 'growl', 'chitter', 'yip', 'sniff', 'hoot', 'squeak', 'splash', 'trill', 'bellow', 'buzz', 'flutter', 'ribbit', 'flick',
  'bray', 'snap', 'honk', 'screech', 'ooh', 'squawk', 'thump', 'yawn', 'roar', 'munch', 'trumpet', 'snort', 'hippo', 'grumble', 'boing', 'bigroar', 'huff', 'stego', 'fire'];
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
      const sayWait = (line, timeout = 8000) => page.waitForFunction(t => window.__toyPhone.voice().log.some(l => (typeof l === 'string' ? l : l.text) === t), line, {timeout}).catch(() => {});
      const touch = async selector => { const box = await page.locator(selector).first().boundingBox(); await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2); };
      const ready = async () => { await page.waitForFunction(() => window.__toyPhone.snack().want, null, {timeout:25000}); await page.waitForTimeout(550); return snack(); };

      await page.evaluate(() => window.__toyPhone.go('snacktime'));
      let st = await ready();
      const foods = st.foods, animals = Object.keys(foods), places = st.places;
      if (reducedMotion !== 'reduce'){
        check(animals.length === 54 && new Set(Object.values(foods)).size === 54, `54 animals, each with its own snack (${new Set(Object.values(foods)).size} different snacks)`);
        check(places.map(p => p.k).join() === 'farm,forest,garden,seaside,jungle,savanna,dino' && places.reduce((n, p) => n + p.animals.length, 0) === 54,
          `seven places: ${places.map(p => `${p.k} ${p.animals.length}`).join(', ')}`);
        check(foods.cat === 'milk', 'the kitty still wants her milk');
        const drawn = await page.evaluate(ks => ks.filter(k => !/^<img class="px"/.test(window.__toyPhone.pic(k))), [...animals, ...Object.values(foods)]);
        const fx = await page.evaluate(() => window.__toyPhone.fx());
        check(drawn.length === 0 && CALLS.every(n => fx.includes(n)), `every animal and snack has a picture, every call a sound ${drawn.join(', ')}`);
        const missing = await page.evaluate(() => window.__toyPhone.voiceMissing());
        check(missing.length === 0, `every line is recorded ${missing.slice(0, 4).join(', ')}`);
      }
      check(st.place === 'farm' && await page.locator('#snacktime').getAttribute('data-place') === 'farm' && places[0].animals.includes(st.animal),
        `${tag}: it starts on the farm, with a farm animal (the ${st.animal})`);

      // feed everyone on the farm with real taps; check the offers and the "two" rounds on the way
      let twos = 0; const wrongTwo = [], badOffer = [], notHere = [];
      for (let fedNow = 0; fedNow < places[0].animals.length;){
        st = await ready();
        if (!places[0].animals.includes(st.animal)) notHere.push(st.animal);
        if (!st.offered.includes(st.want) || st.offered.some((f, i) => st.offered.some((g, j) => i < j && LOOKALIKE.some(gr => gr.includes(f) && gr.includes(g))))) badOffer.push(st.offered.join('+'));
        if (st.two){
          twos++; if (UNCOUNTABLE.includes(st.want)) wrongTwo.push(st.want);
          if (twos === 1){
            check(await page.locator('#stWant .px').count() === 2 && (await said()).some(l => / wants two /.test(l)), `${tag}: the ${st.animal} asks for two: two in the bubble, and it says so`);
            await touch(`#stFoods [data-food="${st.want}"]`);
            await page.waitForFunction(() => window.__toyPhone.snack().want && window.__toyPhone.snack().need === 1, null, {timeout:5000});
            await page.waitForTimeout(300);
            check((await snack()).fed === fedNow && await page.locator('#stWant .px').count() === 1 && (await said()).includes('One more!'), `${tag}: the first is a bite and "One more!"`);
          } else { await touch(`#stFoods [data-food="${st.want}"]`); await page.waitForFunction(() => window.__toyPhone.snack().need === 1 && window.__toyPhone.snack().want, null, {timeout:5000}); await page.waitForTimeout(300); }
        }
        await touch(`#stFoods [data-food="${st.want}"]`);
        await page.waitForFunction(n => window.__toyPhone.snack().fed > n, fedNow, {timeout:5000}).catch(() => {});   // (a tap during the cards' deal bounce is tried again)
        fedNow = (await snack()).fed;
      }
      allTwos += twos;
      check(notHere.length === 0 && badOffer.length === 0, `${tag}: only farm animals came; every offer had the wanted snack and no look-alikes ${notHere.join(',')} ${badOffer.join(' ')}`);
      check(wrongTwo.length === 0, `${tag}: ${twos} "two" rounds, never two of a snack you can't count`);

      // the farm's picnic parade, then the bus to the forest
      await page.waitForFunction(() => window.__toyPhone.snack().parade, null, {timeout:15000}); await page.waitForTimeout(600);
      const parade = await page.evaluate(() => { const p = document.querySelector('.st-parade'); return {n:p.querySelectorAll('.s').length, still:p.classList.contains('still'), moving:p.getAnimations({subtree:true}).filter(a => a.playState === 'running').length}; });
      await sayWait('Picnic parade! Everyone on the farm is full!');
      check(parade.n === places[0].animals.length && (await said()).includes('Picnic parade! Everyone on the farm is full!'), `${tag}: everyone on the farm marches in a picnic parade (${parade.n}), and it says so`);
      check(reducedMotion === 'reduce' ? parade.still && parade.moving === 0 : !parade.still && parade.moving >= parade.n, `${tag}: ${reducedMotion === 'reduce' ? 'with reduced motion they stand still in a row' : 'they march across'}`);
      if (reducedMotion === 'reduce'){
        await page.evaluate(() => window.__toyPhone.go('home')); await page.waitForTimeout(300);
        check(await page.evaluate(() => !document.querySelector('.st-parade, .st-bus') && window.__toyPhone.timers() === 0), `${tag}: leaving in the middle of the parade stops it`);
        await page.evaluate(() => window.__toyPhone.go('snacktime'));
        st = await ready();
        check(st.place === 'farm', `${tag}: coming back picks up on the farm`);
      } else {
        await page.waitForFunction(() => window.__toyPhone.snack().bus, null, {timeout:20000});
        await sayWait('Off to the forest!');
        check((await said()).includes('Off to the forest!'), `${tag}: then the bus drives on: "Off to the forest!"`);
        await page.waitForFunction(() => window.__toyPhone.snack().place === 'forest' && window.__toyPhone.snack().want, null, {timeout:20000});
        st = await snack();
        check(places[1].animals.includes(st.animal) && await page.locator('#snacktime').getAttribute('data-place') === 'forest' && (await said()).includes('Welcome to the forest!') && st.visited.includes('farm'),
          `${tag}: welcome to the forest: its scenery and its animals (the ${st.animal})`);
      }

      // the map
      await touch('#stMapBtn');
      await page.waitForFunction(() => window.__toyPhone.snack().map, null, {timeout:3000});
      const cards = await page.$$eval('#stMap .st-place', bs => bs.map(b => { const r = b.getBoundingClientRect(); return {k:b.dataset.place, star:!!b.querySelector('.st-place-star'), bg:!!b.style.backgroundImage, w:r.width, h:r.height, b:r.bottom, r:r.right}; }));
      await sayWait('Where shall we go?', 4000);
      check(cards.length === 7 && cards.every(c => c.bg && c.w >= 100 && c.h >= 90 && c.b <= viewport.height && c.r <= viewport.width) && (await said()).includes('Where shall we go?'),
        `${tag}: the map: seven picture cards on screen (${Math.round(Math.min(...cards.map(c => c.w)))}x${Math.round(Math.min(...cards.map(c => c.h)))}px or more), "Where shall we go?"`);
      check(cards.find(c => c.k === 'farm').star && cards.filter(c => c.star).length === 1, `${tag}: a star on the farm, where everyone was fed (${cards.filter(c => c.star).map(c => c.k).join(', ')})`);
      await touch('#stMap [data-place="seaside"]');
      st = await ready();
      check(!(await snack()).map && st.place === 'seaside' && places[3].animals.includes(st.animal) && await page.locator('#snacktime').getAttribute('data-place') === 'seaside',
        `${tag}: tapping the seaside goes there (the ${st.animal})`);
      check(errors.length === 0, `${tag}: no JavaScript errors ${errors.join('; ')}`);
      await context.close();
    }
    check(allTwos >= 1, `"two" rounds came up (${allTwos})`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
