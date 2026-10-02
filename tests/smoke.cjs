/* Smoke test: drives every screen of the toy phone at iPhone sizes (portrait and landscape),
   taps every button, records what the page says and plays, and fails on any console error.
   Run: npm test   (screenshots land in tests/screenshots/) */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const failures = [];
const warnings = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? '  ok   ' : '  FAIL ') + msg); };

/* ---------- tiny static server for the toy-phone folder ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('not found'); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

/* ---------- fixtures: Baloo 2 from npm (no network needed) and a pretend family contact ---------- */
function fontCss() {
  try {
    const dir = path.dirname(require.resolve('@fontsource/baloo-2/package.json'));
    return [600, 800].map(w => `@font-face{font-family:"Baloo 2";font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, 'files', `baloo-2-latin-${w}-normal.woff2`)).toString('base64')}) format("woff2")}`).join('\n');
  } catch (e) { return '/* Baloo 2 not installed: fallback fonts */'; }
}
function wavDataUri(seconds = 0.8) {
  const rate = 16000, n = Math.round(rate * seconds), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 330) * 8000 * Math.min(1, (n - i) / 800)), 44 + i * 2);
  return 'data:audio/wav;base64,' + buf.toString('base64');
}
const FAMILY_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8FD8F5"/><circle cx="50" cy="42" r="22" fill="#F2C9A0"/><rect x="22" y="66" width="56" height="40" rx="20" fill="#3D8FE0"/><circle cx="42" cy="40" r="3"/><circle cx="58" cy="40" r="3"/><path d="M42 50 Q50 57 58 50" stroke="#000" stroke-width="3" fill="none"/></svg>');

/* record what the page plays and says */
function instrument() {
  window.__osc = 0; window.__said = []; window.__decoded = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  const osc = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { window.__osc++; return osc.call(this); };
  const dec = AC.prototype.decodeAudioData;
  AC.prototype.decodeAudioData = function (buf, ok, bad) { return dec.call(this, buf, b => { window.__decoded++; ok && ok(b); }, bad); };
  if (window.speechSynthesis) {
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { window.__said.push(u.text); try { speak(u); } catch (e) {} };
  }
}

async function run(browser, base, name, viewport, { family = true } = {}) {
  console.log(`\n=== ${name} ${viewport.width}x${viewport.height}${family ? '' : ' (no family file)'}`);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(instrument);
  // random incoming calls (every 1-3 min) would interrupt the scripted taps; "Ring now" still tests them
  await page.addInitScript(() => { if (!localStorage.getItem('toyphone.settings')) localStorage.setItem('toyphone.settings', JSON.stringify({ incoming: false, vol: 2 })); });
  const css = fontCss();
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: css }));
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  await page.route('**/assets/family/family.json', r => family
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ contacts: [{ name: 'Daddy', photo: FAMILY_PHOTO, clips: [wavDataUri(0.8), wavDataUri(0.5)], color: '#BFE3F7' }] }) })
    : r.fulfill({ status: 404, body: 'not found' }));
  // a dropped-in real recording replaces the lion's synth voice
  await page.route('**/assets/sounds/sounds.json', r => family
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ lion: wavDataUri(1.0) }) })
    : r.fulfill({ status: 404, body: 'not found' }));
  await page.goto(base + '/index.html');
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);

  const cdp = await context.newCDPSession(page);
  const center = async sel => { const l = page.locator(sel).first(); if (await l.isVisible()) await l.evaluate(el => el.scrollIntoView({ block: 'nearest' })); const b = await l.boundingBox(); if (!b) throw new Error('not visible: ' + sel); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const tapXY = async (x, y) => { await page.touchscreen.tap(x, y); await sleep(140); };
  const tap = async sel => { const [x, y] = await center(sel); await tapXY(x, y); };
  const tapAll = async sel => { const n = await page.locator(sel).count(); for (let i = 0; i < n; i++) { const b = await page.locator(sel).nth(i).boundingBox(); if (b) await tapXY(b.x + b.width / 2, b.y + b.height / 2); } return n; };
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const drag = async (from, to, steps = 10) => { await touch('touchStart', [from]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]]); await sleep(16); } await touch('touchEnd', []); await sleep(150); };
  const shot = async n => page.screenshot({ path: path.join(OUT, `${name}-${n}.png`) });
  const state = () => page.evaluate(() => window.__toyPhone.call());
  const said = () => page.evaluate(() => window.__said.slice());
  const osc = () => page.evaluate(() => window.__osc);
  const visible = sel => page.locator(sel).first().isVisible();
  const home = async () => { await tap('#homeBtn'); await sleep(2200); };

  /* the page must fit: no sideways scroll, home button big and on screen */
  const fits = async where => {
    const r = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, small = [], off = [];
      document.querySelectorAll('button').forEach(b => {
        const s = b.getBoundingClientRect(); if (!s.width || b.closest('[hidden]') || b.closest('.sheet')) return;
        if (s.left < -1 || s.top < -1 || s.right > vw + 1 || s.bottom > vh + 1) off.push(b.getAttribute('aria-label') || b.className);
        if (Math.min(s.width, s.height) < 76) small.push(`${b.getAttribute('aria-label') || b.className} ${Math.round(s.width)}x${Math.round(s.height)}`);
      });
      return { sw: document.documentElement.scrollWidth, vw, off, small };
    });
    check(r.sw <= r.vw, `${where}: no sideways scroll`);
    check(!r.off.length, `${where}: every button on screen ${r.off.join(', ')}`);
    if (r.small.length) warnings.push(`${name} ${where}: under 76px: ${r.small.join(', ')}`);
  };

  // --- first touch unlocks sound and speech
  await tapXY(viewport.width * 0.6, 22);   // a tap on the status bar (not a button)
  await shot('1-home');
  await fits('home');
  const homeBtn = await page.locator('#homeBtn').boundingBox();
  check(homeBtn.width >= 80 && homeBtn.height >= 80, 'home button is at least 80px');
  const tile = await page.locator('.appicon .tile').first().boundingBox();
  check(tile.width >= 120 && tile.height >= 120, `app icons are at least 120px (${Math.round(tile.width)})`);
  check(await page.evaluate(() => !document.querySelector('a[href^="tel:"]')), 'no tel: links');
  let before = await osc();
  if (await visible('.friend')) { await tapAll('.friend'); check(await osc() > before, 'home friends make sounds'); }
  if (name === 'portrait') {
    const calls = ['roar','bigroar','trumpet','munch','neigh','ooh','bray','hippo','bellow','huff','stego','screech','snort','growl','squawk','honk','thump','ribbit','hoot','yawn','moo'];
    const bad = [];
    for (const n of calls) {
      const r = await page.evaluate(n => window.__toyPhone.renderFx(n, 3).then(r => { let p = 0; for (const v of r.data) p = Math.max(p, Math.abs(v)); return { p, len: r.len }; }), n);
      if (!(r.p > 0.1 && r.p < 0.99 && r.len > 0.2 && r.len < 2.5)) bad.push(`${n} peak ${r.p.toFixed(2)} len ${r.len}`);
    }
    check(!bad.length, `all ${calls.length} animal calls render, are audible and don't clip ${bad.join(', ')}`);
  }
  if (family) check(await page.evaluate(() => window.__decoded) >= 1, 'a recording listed in sounds.json is loaded');

  // --- PHONE: contacts and a full outgoing call
  await tap('[data-app="phone"]'); await sleep(500);
  check((await said()).some(s => /Who do you want to call/.test(s)), 'phone speaks its prompt');
  const nContacts = await page.locator('.contact').count();
  check(nContacts === (family ? 13 : 12), `contacts grid shows ${nContacts} portraits`);
  await shot('2-phone-contacts');
  await fits('phone contacts');
  await tap(`.contact[aria-label="Call Lion"]`);
  check(await state() === 'dialing', 'tapping Lion dials');
  await sleep(5300);
  check(await state() === 'talking', 'Lion answers after the ringback');
  await sleep(3000);   // the lion roars first (up to ~2s), then says hello
  const s1 = await said();
  check(s1.includes('Calling Lion!') && s1.some(s => /It's Lion/.test(s)), 'Lion says hello');
  check(/^\d\d:\d\d$/.test(await page.locator('#callTime').textContent()), 'call timer runs');
  await shot('3-call');
  await fits('call');
  await tap('#callFace');
  await sleep(9000);   // next line comes after the sound, the speech and a short pause
  check((await said()).length > s1.length, 'Lion keeps talking every ~6s');
  await tap('#hangupBtn');
  check(await state() === 'ending', 'hang up ends the call');
  await sleep(1300);
  check((await said()).includes('Bye bye!'), 'Lion says bye bye');
  await sleep(900);
  check(await state() === null, 'call screen closes');

  if (family) {
    const dec0 = await page.evaluate(() => window.__decoded);
    await tap(`.contact[aria-label="Call Daddy"]`);
    await sleep(6000);
    check(await state() === 'talking' && await page.evaluate(() => window.__decoded) > dec0, 'family contact plays a recorded clip');
    await tap('#hangupBtn'); await sleep(2200);
  }

  // --- PHONE: keypad
  await tap('[data-ptab="keypad"]'); await sleep(250);
  before = await osc();
  const nKeys = await tapAll('.key');
  check(nKeys === 12 && await osc() >= before + 24, 'all 12 keys play touch tones');
  check((await page.locator('#dial').textContent()) === '3456789*0#', 'dial shows the last 10 presses');
  await shot('4-keypad');
  await fits('keypad');
  await tap('#dialCall');
  check(await state() === 'dialing', 'green button calls an animal');
  await sleep(600);
  await tap('#hangupBtn'); await sleep(2200);
  check(await state() === null, 'hanging up while ringing works');
  await tap('[data-ptab="contacts"]');
  await home();

  // --- PARENT SETTINGS and an incoming call
  await tap('#clock'); await sleep(300);
  check(await page.locator('#settings').isHidden(), 'a quick tap on the clock does not open settings');
  const [cx, cy] = await center('#clock');
  await touch('touchStart', [[cx, cy]]); await sleep(3300); await touch('touchEnd', []); await sleep(300);
  check(await visible('#settings'), 'holding the clock 3s opens parent settings');
  await shot('5-settings');
  await tapAll('[data-vol]');
  await tap('[data-incoming="1"]'); await tap('[data-incoming="0"]');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).incoming) === false, 'incoming calls setting is saved');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).vol) === 3, 'volume setting is saved');
  await tap('#testSound');
  await tap('#testRing'); await sleep(1500);
  check(await state() === 'ringing', 'Ring now starts an incoming call');
  await sleep(1200);
  await shot('6-incoming');
  await fits('incoming');
  await tap('#answerBtn'); await sleep(1500);
  check(await state() === 'talking', 'green button answers');
  await home();
  check(await state() === null, 'home button ends a call');
  await page.evaluate(() => window.__toyPhone.ringIn()); await sleep(800);
  await tap('#declineBtn'); await sleep(900);
  check((await said()).includes('Okay, bye bye!'), 'declining: caller says Okay, bye bye!');
  await sleep(1500);

  // --- CAMERA
  const photos0 = await page.evaluate(() => window.__toyPhone.photos());
  check(photos0 === 4, `album starts with 4 sample photos (${photos0})`);
  await tap('[data-app="camera"]'); await sleep(700);
  await shot('7-camera');
  await fits('camera');
  for (const k of ['Jungle', 'Dino valley', 'Savanna']) { await tap(`.scenebtn[aria-label="${k}"]`); await sleep(250); }
  const vf = await page.locator('#vf').boundingBox();
  const camX0 = await page.evaluate(() => document.querySelector('#vfc').toDataURL().length);
  await drag([vf.x + vf.width * 0.8, vf.y + vf.height / 2], [vf.x + vf.width * 0.2, vf.y + vf.height / 2]);
  await sleep(400);
  check(await page.evaluate(() => document.querySelector('#vfc').toDataURL().length) !== camX0, 'dragging pans the scene');
  await tapXY(vf.x + vf.width / 2, vf.y + vf.height * 0.6);
  await tap('#shutter'); await sleep(700);
  check(await page.evaluate(() => window.__toyPhone.photos()) === photos0 + 1, 'shutter saves a photo');
  check((await said()).some(s => /picture/i.test(s)), 'camera says what is in the picture');
  await tap('#zoomBtn'); await sleep(500);
  await tap('#shutter'); await sleep(700);
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.photos'))[0]);
  const src = await page.evaluate(id => localStorage.getItem('toyphone.photo.' + id), meta.id);
  check(src.startsWith('data:image/jpeg') && src.length < 250000, `photo is a small JPEG (${Math.round(src.length / 1024)} KB)`);
  await shot('8-camera-zoom');
  await tap('#lastShot'); await sleep(700);
  check(await visible('#viewer'), 'thumbnail opens the photo');

  // --- PHOTOS
  await shot('9-photo-viewer');
  await fits('photo viewer');
  await tap('#vNext'); await tap('#vPrev');
  const st = await page.locator('#vstage').boundingBox();
  await drag([st.x + st.width * 0.75, st.y + st.height / 2], [st.x + st.width * 0.2, st.y + st.height / 2], 6);
  await tap('#vstage');
  await tap('#vGrid'); await sleep(300);
  check(await page.locator('#viewer').isHidden(), 'grid button shows all photos');
  await shot('10-photos');
  await fits('photos');
  const pic = await page.locator('.pic').first().boundingBox();
  await touch('touchStart', [[pic.x + pic.width / 2, pic.y + pic.height / 2]]); await sleep(60); await touch('touchEnd', []); await sleep(400);
  check(await visible('#viewer'), 'tapping a thumbnail opens it');
  await home();

  // --- MUSIC
  await tap('[data-app="music"]'); await sleep(600);
  before = await osc();
  await tapAll('.bar');
  check(await osc() >= before + 24, 'every xylophone bar plays');
  await shot('11-xylophone');
  await fits('xylophone');
  const bars = page.locator('.bar');
  const b0 = await bars.nth(0).boundingBox(), b7 = await bars.nth(7).boundingBox();
  before = await osc();
  await drag([b0.x + b0.width / 2, b0.y + b0.height / 2], [b7.x + b7.width / 2, b7.y + b7.height / 2], 16);
  check(await osc() >= before + 15, 'sliding a finger across the bars plays them all');
  const b2 = await bars.nth(2).boundingBox(), b5 = await bars.nth(5).boundingBox();
  before = await osc();
  await touch('touchStart', [[b2.x + b2.width / 2, b2.y + b2.height / 2], [b5.x + b5.width / 2, b5.y + b5.height / 2]]); await sleep(50); await touch('touchEnd', []);
  check(await osc() >= before + 6, 'two fingers at once play two bars');
  await tap('[data-mtab="drums"]'); await sleep(200);
  before = await osc();
  await tapAll('.pad');
  check(await osc() > before, 'drum pads play');
  await shot('12-drums');
  await fits('drums');
  await tap('[data-mtab="piano"]'); await sleep(200);
  before = await osc();
  await tapAll('.pkey');
  check(await osc() >= before + 16, 'every animal piano key plays');
  await shot('13-piano');
  await fits('piano');
  await tap('[data-mtab="songs"]'); await sleep(200);
  for (const s of await page.locator('.song').all()) { const b = await s.boundingBox(); await tapXY(b.x + b.width / 2, b.y + b.height / 2); await sleep(300); }
  await tap('#songStop');
  await tap('.song[aria-label="Old MacDonald"]');
  before = await osc();
  await sleep(3000);
  check(await osc() > before + 20, 'a song plays');
  await shot('14-songs');
  await fits('songs');
  await tap('#dancer');
  await tap('#songStop'); await tap('#songPlay'); await sleep(400); await tap('#songStop');
  await home();

  // --- GAMES: the picker, then both games
  await tap('[data-app="games"]'); await sleep(600);
  check((await said()).some(s => /Pick a game/.test(s)), 'games speaks its prompt');
  check(await page.locator('.gamecard').count() === 2, 'games list shows Wild Tap and Dino Buddies');
  await shot('16-games');
  await fits('games');
  await tap('.gamecard[aria-label="Wild Tap"]'); await sleep(600);
  check(await visible('#wt-menu'), 'Wild Tap opens on its menu');
  await shot('17-wildtap');
  await fits('wild tap menu');
  for (const w of ['safari', 'zoo', 'dino']) {
    await tap(`[data-wt="${w}"]`); await sleep(300);
    before = await osc();
    await tapAll('#wtAnimals .wt-pad');
    check(await osc() > before + 6, `Wild Tap ${w}: every animal makes its sound`);
    if (w === 'safari') { await shot('18-wildtap-safari'); await fits('wild tap safari'); }
    await tap('#wt-world .wt-back'); await sleep(250);
  }
  await tap('[data-wt="find"]'); await sleep(900);
  const target = await page.evaluate(() => document.getElementById('wtFindQ').textContent.replace(/^Where is the |\?$/g, ''));
  await tap(`#wtChoices .wt-choice[aria-label="${target}"]`); await sleep(300);
  check(await page.locator('#wtStickers .s').count() === 1, 'Find It: finding the animal earns a sticker');
  await shot('19-wildtap-find');
  await fits('wild tap find it');
  await tap('#wtRepeat');
  await tap('#wt-find .wt-back'); await sleep(250);
  await tap('[data-wt="egg"]'); await sleep(300);
  for (let i = 0; i < 6; i++) await tap('#wtEggwrap');
  await sleep(1400);
  check(await visible('#wtNewegg'), 'Hatch: six taps hatch the egg');
  await shot('20-wildtap-egg');
  await fits('wild tap egg');
  await tap('#wtNewegg');
  await tap('#wt-egg .wt-back'); await sleep(250);
  await tap('[data-wt="bubbles"]'); await sleep(2500);
  const bub = await page.locator('.wt-bub:not(.popped)').first().boundingBox();
  if (bub) await tapXY(bub.x + bub.width / 2, bub.y + bub.height / 2);
  check(await page.locator('.wt-bub.popped').count() >= 1, 'Bubbles: tapping a bubble pops it');
  await shot('21-wildtap-bubbles');
  await home();
  check(await page.locator('.wt-bub').count() === 0, 'leaving Wild Tap stops the bubbles');
  await tap('[data-app="games"]'); await sleep(500);
  await tap('.gamecard[aria-label="Dino Buddies"]'); await sleep(600);
  check(await visible('.db-a'), 'Dino Buddies opens');
  const da = await page.locator('.db-a').boundingBox(), db = await page.locator('.db-b').boundingBox();
  const inside = r => [r.x + r.width * (0.25 + 0.5 * Math.random()), r.y + r.height * (0.25 + 0.5 * Math.random())];
  for (let i = 0; i < 13; i++) { await touch('touchStart', [inside(da), inside(db)]); await sleep(30); await touch('touchEnd', []); await sleep(150); }
  await sleep(500);
  await shot('22-dinobuddies');
  await fits('dino buddies');
  await sleep(3500);
  check((await page.evaluate(() => window.__toyPhone.dino())).family >= 1, 'Dino Buddies: both kids tapping at once hatch the shared egg');
  check((await said()).some(s => /A baby/.test(s)), 'Dino Buddies says which baby hatched');
  check(!!(await page.evaluate(() => localStorage.getItem('toyphone.dinobuddies'))), 'the hatched family is remembered');
  await home();

  // --- clearing photos (parent) leaves a friendly empty album
  const [kx, ky] = await center('#clock');
  await touch('touchStart', [[kx, ky]]); await sleep(3300); await touch('touchEnd', []); await sleep(300);
  await tap('#clearBtn'); await sleep(150);
  check(await visible('#confirmClear'), 'clear photos asks first');
  await tap('#yesClear'); await sleep(150);
  check(await page.evaluate(() => window.__toyPhone.photos()) === 0, 'photos cleared');
  await tap('#doneBtn');
  await tap('[data-app="photos"]'); await sleep(600);
  await shot('15-photos-empty');
  check(await visible('#goCam'), 'empty album shows a big camera button');
  await tap('#goCam'); await sleep(500);
  check(await visible('#camera'), 'the big camera button opens the camera');
  await home();

  // --- toddler mash: 250 random touches (some two-handed), then home must still work
  const W = viewport.width, H = viewport.height;
  for (let i = 0; i < 250; i++) {
    const p1 = [Math.random() * W, Math.random() * H];
    if (i % 5 === 0) { await touch('touchStart', [p1, [Math.random() * W, Math.random() * H]]); await sleep(30); await touch('touchEnd', []); }
    else { await touch('touchStart', [p1]); if (i % 7 === 0) await touch('touchMove', [[p1[0] + 60, p1[1] + 10]]); await touch('touchEnd', []); }
    await sleep(25);
  }
  await page.evaluate(() => document.getElementById('settings').hidden = true);
  await tap('#homeBtn'); await sleep(2300);
  check(await page.evaluate(() => !document.getElementById('home').hidden && document.getElementById('call').hidden), 'after mashing, home button still gets home');

  const real = errors.filter(e => family || !/404|Failed to load resource/.test(e));
  check(!real.length, `no console errors ${real.length ? JSON.stringify(real.slice(0, 5)) : ''}`);
  await context.close();
}

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    if (process.env.ONLY !== 'landscape') await run(browser, base, 'portrait', { width: 390, height: 844 });
    if (process.env.ONLY !== 'portrait') await run(browser, base, 'landscape', { width: 844, height: 390 });
    if (!process.env.QUICK) await run(browser, base, 'safari-bars', { width: 390, height: 664 }, { family: false });
  } catch (e) { failures.push('crashed: ' + e.stack); console.error(e); }
  await browser.close(); srv.close();
  if (warnings.length) console.log('\nSize notes:\n  ' + warnings.join('\n  '));
  console.log(failures.length ? `\n${failures.length} FAILED:\n  ` + failures.join('\n  ') : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
})();
