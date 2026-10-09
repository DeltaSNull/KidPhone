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

/* ---------- tiny static server for the toy ---------- */
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

/* ---------- fixtures: the two pixel fonts from npm (no network needed) and a pretend family contact ---------- */
function fontCss() {
  const face = (pkg, family, w) => { const dir = path.dirname(require.resolve(`@fontsource/${pkg}/package.json`));
    return `@font-face{font-family:"${family}";font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, 'files', `${pkg}-latin-${w}-normal.woff2`)).toString('base64')}) format("woff2")}`; };
  try { return [face('pixelify-sans', 'Pixelify Sans', 500), face('pixelify-sans', 'Pixelify Sans', 700), face('press-start-2p', 'Press Start 2P', 400)].join('\n'); }
  catch (e) { return '/* fonts not installed: fallback fonts */'; }
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

/* Integrated loudness (LUFS, ITU-R BS.1770: K-weighting, 400 ms blocks, absolute and relative gates), for mono samples */
function lufs(x, fs) {
  const biquad = (b, a, s) => { const y = new Float64Array(s.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < s.length; i++) { const v = b[0] * s[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = s[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  let K = Math.tan(Math.PI * 1681.974450955533 / fs), Q = 0.7071752369554196, Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
  let y = biquad([(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], x);
  K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
  y = biquad([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], y);
  const n = Math.round(0.4 * fs), step = Math.round(0.1 * fs), z = [];
  for (let i = 0; i + n <= y.length; i += step) { let e = 0; for (let j = i; j < i + n; j++) e += y[j] * y[j]; z.push(e / n); }
  const L = v => -0.691 + 10 * Math.log10(v), mean = a => a.reduce((t, v) => t + v, 0) / a.length;
  const g1 = z.filter(v => L(v) > -70); if (!g1.length) return -Infinity;
  const g2 = g1.filter(v => L(v) > L(mean(g1)) - 10);
  return L(mean(g2));
}

/* Roughly what a phone's built-in speaker plays: three first-order high-passes at 350 Hz (falling 18 dB an octave below
   it: -11 dB at 300 Hz, -18 dB at 200 Hz, -34 dB at 100 Hz). The toy plays on that speaker, so loudness is judged there. */
function phoneSpeaker(x, fs) {
  const K = Math.tan(Math.PI * 350 / fs), b0 = 1 / (1 + K), a1 = (K - 1) / (K + 1);
  let y = Float64Array.from(x);
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float64Array(y.length); let x1 = 0, y1 = 0;
    for (let i = 0; i < y.length; i++) { const v = b0 * (y[i] - x1) - a1 * y1; x1 = y[i]; y1 = v; out[i] = v; }
    y = out;
  }
  return y;
}

/* record what the page plays and says */
function instrument() {
  window.__osc = 0; window.__src = 0; window.__said = []; window.__decoded = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  const osc = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { window.__osc++; return osc.call(this); };
  const src = AC.prototype.createBufferSource;   // recordings and voice clips (each counts as a sound played)
  AC.prototype.createBufferSource = function () { window.__src++; return src.call(this); };
  const dec = AC.prototype.decodeAudioData;
  AC.prototype.decodeAudioData = function (buf, ok, bad) { return dec.call(this, buf, b => { window.__decoded++; ok && ok(b); }, bad); };
  if (window.speechSynthesis) {
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { window.__said.push(u.text); try { speak(u); } catch (e) {} };
  }
}

/* Added to an iPhone's home screen (the status bar drawn over the top), iOS lays the page out a status bar short of the
   screen and leaves a strip unused at the bottom: the toy then sizes itself to the screen. Stood in for here by a short
   viewport, a status bar and home bar (safe areas) as padding, navigator.standalone, and the screen's real height. */
async function homeScreen(browser, base) {
  console.log('\n=== home screen app 440x956 (laid out 62px short)');
  const open = async screenH => {
    const context = await browser.newContext({ viewport: { width: 440, height: 894 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.addInitScript(h => {
      Object.defineProperty(navigator, 'standalone', { get: () => true });
      Object.defineProperty(screen, 'height', { get: () => h }); Object.defineProperty(screen, 'width', { get: () => 440 });
      const st = document.createElement('style'); st.textContent = ':root{padding-top:62px!important;padding-bottom:34px!important}';   // (env(safe-area-inset-*) is 0 here)
      new MutationObserver((m, o) => { if (document.head) { document.head.appendChild(st); o.disconnect(); } }).observe(document, { childList: true, subtree: true });
    }, screenH);
    await page.goto(base + '/index.html'); await sleep(600);
    const r = await page.evaluate(() => ({ html: document.documentElement.getBoundingClientRect().height, device: document.querySelector('#device').getBoundingClientRect().bottom }));
    await context.close(); return r;
  };
  let r = await open(956);
  check(r.html === 956 && r.device === 956 - 34, `the page fills the whole screen, down to the home bar ${JSON.stringify(r)}`);
  r = await open(894);
  check(r.html === 894 && r.device === 894 - 34, `and is left alone when the layout already fits the screen ${JSON.stringify(r)}`);
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
  // like an iPhone: motion needs permission, and Safari asks only during a finished tap (touchend or click), otherwise a silent no
  await page.addInitScript(() => { window.__motionAsks = []; DeviceOrientationEvent.requestPermission = () => { const t = (window.event && window.event.type) || 'none'; window.__motionAsks.push(t);
    if (sessionStorage.getItem('motionOK') || ['touchend', 'click'].includes(t)) { sessionStorage.setItem('motionOK', '1'); return Promise.resolve('granted'); }   // (a yes is remembered, as Safari does)
    return Promise.reject(new DOMException('Requesting device orientation access requires a user gesture', 'NotAllowedError')); }; });
  // random incoming calls (every 1-3 min) would interrupt the scripted taps; "Ring now" still tests them
  await page.addInitScript(() => { if (!localStorage.getItem('toyphone.settings')) localStorage.setItem('toyphone.settings', JSON.stringify({ incoming: false, vol: 2 })); });
  const css = fontCss();
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: css }));
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  await page.route('**/assets/family/family.json', r => family
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ contacts: [{ name: 'Daddy', photo: FAMILY_PHOTO, clips: [wavDataUri(0.8), wavDataUri(0.5)], color: '#BFE3F7' }] }) })
    : r.fulfill({ status: 404, body: 'not found' }));
  // the real recordings (assets/sounds) load in the family runs; the other run has none, so the synthesized calls play
  if (!family) await page.route('**/assets/sounds/sounds.json', r => r.fulfill({ status: 404, body: 'not found' }));
  await page.goto(base + '/index.html');
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);

  const cdp = await context.newCDPSession(page);
  const center = async sel => { const l = page.locator(sel).first(); if (await l.isVisible()) await l.evaluate(el => el.scrollIntoView({ block: 'nearest' })); const b = await l.boundingBox(); if (!b) throw new Error('not visible: ' + sel); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const tapXY = async (x, y) => { await page.touchscreen.tap(x, y); await sleep(140); };
  const tap = async sel => { const [x, y] = await center(sel); await tapXY(x, y); };
  const tapAll = async sel => { const n = await page.locator(sel).count(); for (let i = 0; i < n; i++) { const loc = page.locator(sel).nth(i); await loc.evaluate(el => { if (el.closest('.sheet')) el.scrollIntoView({ block: 'center' }); }); const b = await loc.boundingBox(); if (b) await tapXY(b.x + b.width / 2, b.y + b.height / 2); } return n; };
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const drag = async (from, to, steps = 10) => { await touch('touchStart', [from]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]]); await sleep(16); } await touch('touchEnd', []); await sleep(150); };
  const shot = async n => page.screenshot({ path: path.join(OUT, `${name}-${n}.png`) });
  const state = () => page.evaluate(() => window.__toyPhone.call());
  const said = () => page.evaluate(() => window.__said.concat(window.__toyPhone.voice().log));   // the phone's speech voice and the recorded clips
  const osc = () => page.evaluate(() => window.__osc + window.__src);   // synthesized sounds, recordings and clips
  const visible = sel => page.locator(sel).first().isVisible();
  const home = async () => { await tap('#homeBtn'); await sleep(2200); };

  /* the page must fit: no sideways scroll, home button big and on screen */
  const fits = async where => {
    const r = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, small = [], off = [];
      document.querySelectorAll('button').forEach(b => {
        const s = b.getBoundingClientRect(); if (!s.width || b.closest('[hidden]') || b.closest('.sheet') || b.closest('.ltrack')) return;   // (the selfie strip slides: only part of it shows)
        // School now has an intentional scrollable menu; its cards are checked individually below.
        if (!b.closest('#schoolList, #gameList') && (s.left < -1 || s.top < -1 || s.right > vw + 1 || s.bottom > vh + 1)) off.push(b.getAttribute('aria-label') || b.className);
        if (Math.min(s.width, s.height) < 76) small.push(`${b.getAttribute('aria-label') || b.className} ${Math.round(s.width)}x${Math.round(s.height)}`);
      });
      return { sw: document.documentElement.scrollWidth, vw, off, small };
    });
    check(r.sw <= r.vw, `${where}: no sideways scroll`);
    check(!r.off.length, `${where}: every button on screen ${r.off.join(', ')}`);
    if (r.small.length) warnings.push(`${name} ${where}: under 76px: ${r.small.join(', ')}`);
  };

  // --- getting ready: when the toy opens, Safari's questions (motion, camera) are asked with one grown-up tap
  check(await visible('#ready') && /Motion/.test(await page.locator('#readyWhat').textContent()) && /Camera/.test(await page.locator('#readyWhat').textContent()),
    'when the toy opens, a Getting ready card asks a grown-up for one tap (motion and the camera still need Safari\'s OK)');
  check((await page.evaluate(() => window.__motionAsks)).every(t => t === 'none'), 'nothing is asked before that tap (Safari would only say no)');
  await shot('0-ready');
  await tap('#readyGo'); await sleep(1500);
  const asks0 = await page.evaluate(() => window.__motionAsks);
  check(!(await visible('#ready')) && asks0.includes('touchend') && asks0.every(t => ['none', 'touchend', 'click'].includes(t)) && (await page.evaluate(() => window.__toyPhone.look())).perm === 'granted',
    `Start asks Safari about motion as the finger lifts, then the camera, and the card goes (${asks0.join(', ')})`);
  check((await page.evaluate(() => window.__toyPhone.cam())).tracks === 0, 'the camera question leaves the camera off afterwards');

  // --- first touch unlocks sound and speech
  await tapXY(viewport.width * 0.6, 22);   // a tap on the status bar (not a button)
  await shot('1-home');
  await fits('home');
  const homeBtn = await page.locator('#homeBtn').boundingBox();
  check(homeBtn.width >= 80 && homeBtn.height >= 80, 'home button is at least 80px');
  const tile = await page.locator('.appicon .tile').first().boundingBox();
  check(tile.width >= 120 && tile.height >= 120, `app icons are at least 120px (${Math.round(tile.width)})`);
  check(await page.evaluate(() => !document.querySelector('a[href^="tel:"]')), 'no tel: links');
  const vb = await page.evaluate(() => window.__toyPhone.voice());
  check(vb.loaded && vb.clips > 500, `the recorded voice loads (${vb.clips} lines)`);
  const missing = await page.evaluate(() => window.__toyPhone.voiceMissing());
  check(!missing.length, `every line the toy can say has a recorded clip ${missing.length} missing ${JSON.stringify(missing.slice(0, 4))}`);
  let before = await osc();
  if (await visible('.friend')) { await tapAll('.friend'); check(await osc() > before, 'home friends make sounds'); }
  if (name === 'portrait') {
    const calls = ['roar','bigroar','trumpet','munch','neigh','ooh','bray','hippo','bellow','huff','stego','screech','snort','growl','squawk','honk','thump','ribbit','hoot','yawn','moo','woof','meow','quack'];
    const bad = [];
    for (const n of calls) {
      const r = await page.evaluate(n => window.__toyPhone.renderFx(n, 3, true).then(r => { let p = 0; for (const v of r.data) p = Math.max(p, Math.abs(v)); return { p, len: r.len }; }), n);
      if (!(r.p > 0.1 && r.p < 0.99 && r.len > 0.2 && r.len < 2.5)) bad.push(`${n} peak ${r.p.toFixed(2)} len ${r.len}`);
    }
    check(!bad.length, `all ${calls.length} animal calls render, are audible and don't clip ${bad.join(', ')}`);
    /* every animal call at about the same loudness on a phone speaker (trimmed to ~-24 LUFS there), so none is a whisper
       or a blast, and none is a deep sound the phone can't play; and never above -19 LUFS full-range (headphones) */
    const loud = [], blast = [];
    for (const n of calls) {
      const d = await page.evaluate(n => window.__toyPhone.renderFx(n, 3, true).then(r => r.data), n);
      let end = d.length; while (end > 0 && Math.abs(d[end - 1]) < 1e-4) end--;
      const x = Float64Array.from(d.slice(0, Math.max(end, 22050))), full = lufs(x, 44100);
      loud.push([n, lufs(phoneSpeaker(x, 44100), 44100)]);
      if (full > -18.5) blast.push(`${n} ${full.toFixed(1)}`);
    }
    const lv = loud.map(v => v[1]), spread = Math.max(...lv) - Math.min(...lv);
    check(spread <= 2.5, `animal calls are within 2.5 dB of each other on a phone speaker (spread ${spread.toFixed(1)} dB: ${loud.sort((a, b) => a[1] - b[1]).filter((v, i, a) => i === 0 || i === a.length - 1).map(v => v[0] + ' ' + v[1].toFixed(1)).join(', ')})`);
    check(!blast.length, `no animal call is louder than -18.5 LUFS full-range ${blast.join(', ')}`);
  }
  if (family) {
    /* every real recording loads, and plays at the toy's level (-24 LUFS on a phone speaker, at most -19 full-range) without clipping */
    const want = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sounds', 'sounds.json'), 'utf8')));
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__toyPhone.recorded().length)) < want.length; i++) await sleep(250);
    const got = await page.evaluate(() => window.__toyPhone.recorded());
    check(want.every(n => got.includes(n)), `all ${want.length} real recordings load (${want.filter(n => !got.includes(n)).join(', ') || 'none missing'})`);
    if (name === 'portrait') {
      const off = [];
      for (const n of got) {
        const r = await page.evaluate(n => window.__toyPhone.renderFx(n, 4).then(r => ({ d: r.data, len: r.len })), n);
        let end = r.d.length; while (end > 0 && Math.abs(r.d[end - 1]) < 1e-4) end--;
        let pk = 0; for (const v of r.d) pk = Math.max(pk, Math.abs(v));
        const x = Float64Array.from(r.d.slice(0, Math.max(end, 22050))), L = lufs(phoneSpeaker(x, 44100), 44100), full = lufs(x, 44100);
        if (!(L > -26 && L < -22 && full < -18.5 && pk < 0.99 && r.len > 0.3 && r.len < 3.6)) off.push(`${n} phone ${L.toFixed(1)} full ${full.toFixed(1)} LUFS peak ${pk.toFixed(2)} ${r.len.toFixed(1)}s`);
      }
      check(!off.length, `every recording plays at the toy's level, under 3.6 s, without clipping ${off.join(', ')}`);
    }
  }

  // --- PHONE: contacts and a full outgoing call
  await tap('[data-app="phone"]'); await sleep(500);
  check(!(await said()).some(s => /Who do you want to call/.test(s)), 'by default the voice stays quiet when an app opens');
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
  const v1 = await page.evaluate(() => window.__toyPhone.voice().last);
  check(v1 && v1.id === 'lion' && v1.phone, `Lion talks in his own recorded voice, through the phone line ${JSON.stringify(v1)}`);
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
  const saidKeys = (await said()).length;
  const nKeys = await tapAll('.key');
  check(nKeys === 12 && await osc() >= before + 24, 'all 12 keys play touch tones');
  check((await said()).length === saidKeys, 'number keys play their tone without the voice talking');
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
  // voice checkboxes: on only where the voice is the point (calls, Find It); the rest start off
  const voiceBoxes = await page.$$eval('[data-voice]', bs => Object.fromEntries(bs.map(b => [b.dataset.voice, b.getAttribute('aria-checked')])));
  check(JSON.stringify(voiceBoxes) === JSON.stringify({ calls: 'true', find: 'true', menus: 'false', names: 'false', camera: 'false', school: 'true', numbers: 'false', music: 'false' }),
    `voice checkboxes start on for calls, Find It and School only ${JSON.stringify(voiceBoxes)}`);
  for (const k of ['menus', 'names', 'camera']) await tap(`[data-voice="${k}"]`);   // turn these on: the checks below hear them
  await tap('[data-voice="numbers"]'); await tap('[data-voice="numbers"]');      // on and off again
  const savedVoice = await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).voice);
  check(savedVoice.menus && savedVoice.names && savedVoice.camera && !savedVoice.numbers && !savedVoice.music && savedVoice.calls, `voice choices are saved ${JSON.stringify(savedVoice)}`);
  await page.evaluate(() => { document.querySelector('#settings .sheet').scrollTop = 0; }); await sleep(100);
  await tapAll('[data-vol]');
  await tap('[data-incoming="1"]'); await tap('[data-incoming="0"]');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).incoming) === false, 'incoming calls setting is saved');
  await tap('[data-silent="0"]'); check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).silent) === false, 'the silent-switch setting turns off');
  await tap('[data-silent="1"]'); check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).silent) === true, 'and back on (the default)');
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
  await sleep(1500);   // the voice waits for the animal's call to finish
  check((await said()).some(s => /picture/i.test(s)), 'camera says what is in the picture');
  await tap('#zoomBtn'); await sleep(500);
  await tap('#shutter'); await sleep(700);
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.photos'))[0]);
  const src = await page.evaluate(id => localStorage.getItem('toyphone.photo.' + id), meta.id);
  check(src.startsWith('data:image/png') && src.length < 250000, `photo is a small pixel-art PNG (${Math.round(src.length / 1024)} KB)`);
  await shot('8-camera-zoom');
  await tap('#zoomBtn'); await sleep(400);

  const holdClock = async () => { const [x, y] = await center('#clock'); await touch('touchStart', [[x, y]]); await sleep(3300); await touch('touchEnd', []); await sleep(300); };
  const tapSetting = async sel => { await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel); await sleep(150); await tap(sel); };   // clear of the sticky header
  // --- LOOK AROUND: the pretend scenes follow the phone (orientation readings stand in for an iPhone's)
  const look = () => page.evaluate(() => window.__toyPhone.look());
  const orient = (a, b, g) => page.evaluate(([a, b, g]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: a, beta: b, gamma: g })), [a, b, g]);
  const hold = async (yaw, pitch, ms = 500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await orient(-yaw, 90 + pitch, 0); await sleep(30); } };   // portrait, upright, turned and tipped by degrees
  const turned = (a, b) => ((a - b + 4800) % 3200) - 1600;
  check(!(await look()).ar, 'until the phone sends its motion, the pretend camera drags as before');
  await hold(0, 0, 800);
  let lk = await look();
  check(lk.ar && lk.following, 'once the phone sends its motion, the pretend camera follows it');
  check((await said()).includes('Move the phone to look all around!'), 'and says "Move the phone to look all around!"');
  await hold(45, 0);
  const lk45 = await look();
  check(Math.abs(turned(lk45.x, lk.x) - 400) < 12, `turning the phone 45 degrees turns the scene 45 degrees (${Math.round(turned(lk45.x, lk.x))} of 400 world units)`);
  let back = 0;
  for (let y = 60; y <= 405; y += 15) { const x0 = (await look()).x; await hold(y, 0, 60); if (turned((await look()).x, x0) < 0) back++; }
  await hold(405, 0, 400); lk = await look();   // (let the smoothing settle)
  check(!back && Math.abs(turned(lk.x, lk45.x)) < 15, `a full turn comes back to the same place: the scene goes all the way round, smoothly (${Math.round(turned(lk.x, lk45.x))})`);
  await shot('8b-camera-look');
  await hold(45, 60);
  check((await look()).y < 0, 'tipping the phone up looks past the top of the scene, into more sky');
  await shot('8c-camera-sky');
  await hold(45, -88, 900);
  lk = await look();
  check(lk.flat && !lk.following, 'laid flat, the phone goes back to plain dragging');
  await drag([vf.x + vf.width * 0.8, vf.y + vf.height / 2], [vf.x + vf.width * 0.2, vf.y + vf.height / 2]); await sleep(300);
  const lkd = await look();
  check(Math.abs(turned(lkd.x, lk.x)) > 100, 'and a drag pans it');
  await hold(45, 0, 700);
  const lku = await look();
  check(lku.following && Math.abs(turned(lku.x, lkd.x)) < 20, 'lifted again, it follows the phone from where it is');
  let n0 = await page.evaluate(() => window.__toyPhone.photos());
  await tap('#shutter'); await sleep(700);
  check(await page.evaluate(() => window.__toyPhone.photos()) === n0 + 1, 'the shutter works while it follows the phone');
  await home();
  await holdClock();
  check(await page.evaluate(() => document.querySelector('[data-look="move"]').classList.contains('on')) && /works/.test(await page.locator('#lookNote').textContent()),
    'parent settings: Move the phone is on, and says it works on this phone');
  await tapSetting('[data-look="drag"]'); await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="camera"]'); await sleep(700); await hold(0, 0, 400);
  check(!(await look()).ar, 'with Drag only, the pretend camera ignores the motion');
  await home(); await holdClock(); await tapSetting('[data-look="move"]'); await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="camera"]'); await sleep(700);
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

  // --- REAL CAMERA (a parent turns it on; Chromium's fake camera stands in for the phone's)
  const cam = () => page.evaluate(() => window.__toyPhone.cam());
  const portraitView = viewport.height > viewport.width;
  await holdClock();
  check(await page.evaluate(() => document.querySelector('[data-camera="both"]').classList.contains('on')), 'the camera setting starts on Both (pretend, photo and selfie)');
  await tapSetting('[data-camera="both"]'); await sleep(1500);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).camera) === 'both', 'the camera setting is saved');
  const camNote = await page.locator('#camNote').textContent();
  check(/allowed/i.test(camNote) && (await cam()).tracks === 0, `choosing a real camera asks for it right away, while a parent is there, then lets it go (${camNote.slice(0, 40)})`);
  await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="camera"]'); await sleep(1500);
  let cs = await cam();
  check(cs.mode === 'safari' && cs.modes.join() === 'safari,photo,selfie' && await page.locator('.cmode').count() === 3, `with Both, the camera opens on pretend and offers photo and selfie (${cs.modes})`);
  await fits('camera with both');
  await tap('[data-mode="photo"]'); await sleep(1500);
  cs = await cam();
  check(cs.mode === 'photo' && cs.state === 'live' && cs.facing === 'environment' && cs.tracks === 1 && cs.playing, `photo mode shows the back camera, live ${JSON.stringify(cs)}`);
  await shot('9b-real-photo');
  await fits('real camera');
  await tap('.czoom[data-z="2"]'); await sleep(300);
  check((await cam()).zoom === 2, 'the 2x zoom button zooms');
  const rv = await page.locator('#vf').boundingBox();
  const swipeVf = () => drag([rv.x + rv.width * 0.8, rv.y + rv.height * 0.4], [rv.x + rv.width * 0.2, rv.y + rv.height * 0.4], 6);
  await swipeVf(); await sleep(500);
  cs = await cam();
  check(cs.look === 'pixel' && cs.fx, `swiping the picture changes the look (${cs.look})`);
  let nPhotos = await page.evaluate(() => window.__toyPhone.photos());
  await tap('#shutter'); await sleep(1200);
  let newest = (await page.evaluate(() => window.__toyPhone.photoInfo()))[0];
  check(await page.evaluate(() => window.__toyPhone.photos()) === nPhotos + 1 && newest.real && newest.db && newest.look === 'pixel' && newest.src.startsWith('blob:'),
    `the shutter saves a real photo, with its look, in the photo database ${JSON.stringify(newest)}`);
  await tap('#flipBtn'); await sleep(1500);
  cs = await cam();
  check(cs.mode === 'selfie' && cs.facing === 'user' && cs.tracks === 1 && cs.playing && cs.look === 'normal', `the flip button turns to the selfie camera ${JSON.stringify(cs)}`);
  check(await visible('#lenses') && await page.locator('.lens').count() >= 15, 'selfie mode shows the strip of costumes and looks');
  before = await osc();
  await tap('.lens[data-i="1"]'); await sleep(900);
  cs = await cam();
  check(cs.costume === 'lion' && await visible('#camCostume') && await osc() > before, `tapping a costume puts it on, and the animal roars (${cs.lens})`);
  const lb = await page.locator('#lenses').boundingBox(), sb = await page.locator('#shutter').boundingBox();
  if (portraitView) { const y = lb.y + lb.height / 2, x = sb.x + sb.width + 30; await drag([x, y], [x - 164, y], 8); }
  else { const x = lb.x + lb.width / 2, y = sb.y + sb.height + 30; await drag([x, y], [x, y - 164], 8); }
  await sleep(700);
  cs = await cam();
  check(cs.costume === 'elephant', `sliding the strip two bubbles over picks the elephant (${cs.lens})`);
  await shot('9c-selfie-costume');
  await fits('selfie');
  await swipeVf(); await sleep(700);
  check((await cam()).costume === 'giraffe', 'swiping across the picture moves to the next costume');
  nPhotos = await page.evaluate(() => window.__toyPhone.photos());
  await tap('#shutter'); await sleep(1200);
  newest = (await page.evaluate(() => window.__toyPhone.photoInfo()))[0];
  check(await page.evaluate(() => window.__toyPhone.photos()) === nPhotos + 1 && newest.costume === 'giraffe', `a selfie is saved with its costume ${JSON.stringify(newest)}`);
  await home();
  cs = await cam();
  check(cs.tracks === 0 && cs.state !== 'live', 'leaving the Camera turns the camera off');
  await tap('[data-app="camera"]'); await sleep(1500);
  cs = await cam();
  check(cs.mode === 'selfie' && cs.tracks === 1, `the Camera opens again in the last mode (${cs.mode})`);
  const setVis = v => page.evaluate(v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
  await setVis('hidden'); await sleep(300);
  check((await cam()).tracks === 0, 'the camera turns off when the toy goes off screen');
  await setVis('visible'); await sleep(1500);
  check((await cam()).tracks === 1, 'and back on when it comes back');
  await home();
  await page.evaluate(() => { const md = navigator.mediaDevices; md.__gum = md.getUserMedia; md.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
  await tap('[data-app="camera"]'); await sleep(1200);
  cs = await cam();
  check(cs.mode === 'safari' && cs.state === 'blocked' && await visible('#vfc') && await page.locator('#camModes').isHidden(), `a refused camera falls back to the pretend one ${JSON.stringify(cs)}`);
  await home(); await holdClock();
  check(/blocked/i.test(await page.locator('#camNote').textContent()), 'settings then say the camera is blocked and how to allow it');
  await page.evaluate(() => { const md = navigator.mediaDevices; md.getUserMedia = md.__gum; });
  await tapSetting('[data-camera="pretend"]'); await tap('#doneBtn'); await sleep(300);

  // --- MUSIC
  await tap('[data-app="music"]'); await sleep(600);
  const saidMusic = (await said()).length;
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
  // the phone can pause the sound engine (a call, Siri, the voice): the next tap must still play, on a new engine if needed
  await page.evaluate(() => window.__toyPhone.pauseSound());
  before = await osc();
  await tap('.pad'); await sleep(300);
  const snd = await page.evaluate(() => window.__toyPhone.sound());
  check(snd.state === 'running' && snd.rebuilds >= 1 && await osc() > before, `after the phone pauses the sound engine, the next tap restarts it and the drum still plays (${JSON.stringify(snd)})`);
  await shot('12-drums');
  await fits('drums');
  await tap('[data-mtab="piano"]'); await sleep(200);
  before = await osc();
  await tapAll('.pkey');
  check(await osc() >= before + 16, 'every animal piano key plays');
  if (family) {
    const duckBefore = await page.evaluate(() => window.__src);
    await tap('.pkey[data-i="5"]');
    check(await page.evaluate(() => window.__src) === duckBefore, 'duck piano keeps the simplified synthesized style of the other keys');
  }
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
  check((await said()).length === saidMusic, `the voice stays quiet in Music: the music is the answer ${JSON.stringify((await said()).slice(saidMusic))}`);
  await home();

  // --- GAMES: the picker, then every game
  await tap('[data-app="games"]'); await sleep(600);
  check((await said()).some(s => /Pick a game/.test(s)), 'games speaks its prompt');
  check(await page.locator('#gameList .gamecard').count() === 6, 'games list shows all six games');
  const notes = await page.$$eval('#gameList .gamecard', cs => cs.map(c => c.getAttribute('aria-label') + ': ' + c.querySelector('.gplay').textContent.trim()));
  check(JSON.stringify(notes) === JSON.stringify(['Wild Tap: 1 player', 'Snack Time: 1 player', 'Dino Buddies: 1 or 2 players', 'Paint Pals: 1 or 2 players', 'Ball Trail: 1 player', 'Star Flight: 1 player']), `each game card says how many players ${JSON.stringify(notes)}`);
  for (const card of await page.locator('#gameList .gamecard').all()) {
    await card.evaluate(b => b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));
    check(await card.evaluate(b => { const r=b.getBoundingClientRect(), p=b.closest('#gameList').getBoundingClientRect(); return r.top>=p.top-1&&r.bottom<=p.bottom+1&&r.left>=p.left-1&&r.right<=p.right+1; }), `Games menu: ${await card.getAttribute('aria-label')} is reachable by scrolling`);
    check(await card.evaluate(b => {const box=b.getBoundingClientRect();return [...b.querySelectorAll('.gname,.gplay')].every(el=>{const range=document.createRange();range.selectNodeContents(el);return [...range.getClientRects()].every(r=>r.top>=box.top&&r.bottom<=box.bottom&&r.left>=box.left&&r.right<=box.right);});}), 'game title and player note fit their card');
  }
  await page.locator('#gameList').evaluate(el => el.scrollTop=0);
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
  check(await visible('#dinobuddies .who'), 'Dino Buddies asks: one player or two?');
  await shot('22a-dinobuddies-who');
  await fits('dino buddies: one player or two');
  await tap('#dinobuddies .who-btn[data-n="2"]'); await sleep(300);
  check(await visible('.db-a') && await visible('.db-b'), 'Dino Buddies opens with a side for each player');
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
  // one player: one dino and the nest, and a smaller egg
  await tap('[data-app="games"]'); await sleep(500);
  await tap('.gamecard[aria-label="Dino Buddies"]'); await sleep(600);
  check(await page.locator('#dinobuddies .who-btn.last[data-n="2"]').count() === 1, 'Dino Buddies remembers the last choice (2 players glows)');
  await tap('#dinobuddies .who-btn[data-n="1"]'); await sleep(300);
  check(await visible('.db-a') && !(await visible('.db-b')), 'Dino Buddies, 1 player: one side fills the screen');
  const famBefore = (await page.evaluate(() => window.__toyPhone.dino())).family;
  for (let i = 0; i < 18; i++) { await tap('.db-a'); await sleep(40); }
  await sleep(900);
  await shot('22b-dinobuddies-solo');
  await fits('dino buddies, 1 player');
  await sleep(3200);
  check((await page.evaluate(() => window.__toyPhone.dino())).family > famBefore, 'Dino Buddies, 1 player: one kid tapping alone hatches the egg');
  await home();

  // --- SNACK TIME (one player): give the animal the food it is thinking of
  await tap('[data-app="games"]'); await sleep(500);
  await tap('.gamecard[aria-label="Snack Time"]'); await sleep(1500);
  for (let i = 0; i < 20 && !(await said()).some(s => / wants /.test(s)); i++) await sleep(300);   // it waits for the intro line to finish
  let snack = await page.evaluate(() => window.__toyPhone.snack());
  check(!!snack.want && snack.choices === 2, `Snack Time: an animal walks in thinking of a food, with 2 to choose from (${snack.animal} wants ${snack.want})`);
  check((await said()).some(s => / wants /.test(s)), 'Snack Time says what the animal wants (Animal names is on)');
  await shot('23-snacktime');
  await fits('snack time');
  const wrong = await page.evaluate(w => [...document.querySelectorAll('#stFoods .st-food')].map(b => b.dataset.food).find(f => f !== w), snack.want);
  await tap(`#stFoods .st-food[data-food="${wrong}"]`); await sleep(500);
  check((await page.evaluate(() => window.__toyPhone.snack())).fed === 0, 'Snack Time: a wrong food only gets a head shake');
  await tap(`#stFoods .st-food[data-food="${wrong}"]`); await sleep(500);
  check(await page.locator(`#stFoods .st-food.hint[data-food="${snack.want}"]`).count() === 1, 'Snack Time: after two tries the right food glows');
  before = await osc();
  await tap(`#stFoods .st-food[data-food="${snack.want}"]`); await sleep(1300);
  check((await page.evaluate(() => window.__toyPhone.snack())).fed === 1 && await page.locator('#stFed .s').count() === 1, 'Snack Time: the right food is eaten and earns a sticker');
  check(await osc() > before + 2, 'Snack Time: eating makes munching and animal sounds');
  await shot('24-snacktime-fed');
  // Departure follows the real animal recording, then the next animal's arrival animation.
  // Wait for playable food choices rather than truncating a long recording with a fixed delay.
  await page.waitForFunction(() => {
    const s = window.__toyPhone.snack(); return !!s.want && s.choices === 2 && s.fed === 1;
  }, null, {polling:50, timeout:12000});
  check((await said()).some(s => /^Yum! The [\w ]+ loves/.test(s)), 'Snack Time says yum (after the munching)');
  snack = await page.evaluate(() => window.__toyPhone.snack());
  check(!!snack.want, `Snack Time: the next animal walks in (${snack.animal})`);
  await home();

  // --- SCHOOL: the Letter Path, ABC Zoo, ABC Snack
  const school = () => page.evaluate(() => window.__toyPhone.school());
  await tap('[data-app="school"]'); await sleep(600);
  check(await page.locator('#schoolList .gamecard').count() === 11, 'School shows its learning games');
  check((await page.$$eval('#schoolList .gamecard', bs => bs.map(b => b.getAttribute('aria-label')))).join() === 'ABC Zoo,123 Zoo,Letter Path,ABC Snack,123 Snack,Dino Picnic,Animal Delivery,Sorting Station,Pattern Train,Story Time,Feelings Friends', 'School preserves the original order and adds the four new activities');
  for (const card of await page.locator('#schoolList .gamecard').all()) {
    await card.evaluate(b => b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));
    check(await card.evaluate(b => { const r=b.getBoundingClientRect(), p=b.closest('#schoolList').getBoundingClientRect(); return r.top>=p.top-1&&r.bottom<=p.bottom+1&&r.left>=p.left-1&&r.right<=p.right+1; }), `School menu: ${await card.getAttribute('aria-label')} is reachable by scrolling`);
  }
  await page.locator('#schoolList').evaluate(el => el.scrollTop=0);
  await shot('28-school'); await fits('school');
  const lp = () => page.evaluate(() => window.__toyPhone.path());
  const until = async (fn, n = 30) => { for (let i = 0; i < n && !(await fn()); i++) await sleep(300); return fn(); };
  await tap('.gamecard[aria-label="Letter Path"]'); await sleep(900);
  const order = await page.$$eval('.lp-stone', bs => bs.map(b => b.dataset.l).join(''));
  check(order === 'abcdefghijklmnopqrstuvwxyz' && (await lp()).open.join('') === 'a', `Letter Path: 26 stones from a to z, only a open (${order})`);
  await shot('28b-letterpath'); await fits('letter path');
  await tap('.lp-stone[data-l="c"]'); await sleep(700);
  check(!(await lp()).lesson && (await said()).includes('Not yet! Tap the bouncing letter!'), 'a stone not open yet: "Not yet! Tap the bouncing letter!"');
  await tap('.lp-stone[data-l="a"]'); await sleep(1000);
  let ls = await lp();
  check(ls.lesson && ls.letter === 'a' && ls.step === 'meet', 'the bouncing stone starts the a lesson with Meet');
  await until(async () => (await lp()).next);
  check((await said()).includes('This is a. A is for apple!') && !(await said()).some(t => / says \//.test(t)) && (await lp()).next, 'Meet: "This is a. A is for apple!" (the letter\'s name, no sound), then the next arrow');
  before = await osc(); await tap('.lp-letters'); await sleep(900);
  check((await said()).includes('A!') && !(await said()).includes('/a/!'), 'tapping the letters says its name');
  await shot('28c-meet'); await fits('meet');
  await tap('#lpNext'); await sleep(900);
  check((await lp()).step === 'trace' && (await lp()).strokes === 2, 'Trace: a is two strokes');
  const cvb = await page.locator('.lp-paper canvas').boundingBox();
  await drag([cvb.x + cvb.width * 0.1, cvb.y + cvb.height * 0.95], [cvb.x + cvb.width * 0.9, cvb.y + cvb.height * 0.95]);
  check((await lp()).stroke === 0 && !(await lp()).traced, 'a scribble away from the letter traces nothing');
  for (let n = 0; n < 6; n++) {
    const pts = await page.evaluate(() => window.__toyPhone.pathPts()); if (!pts) break;
    await touch('touchStart', [pts[0]]); for (let i = 1; i < pts.length; i += 2) await touch('touchMove', [pts[i]]);
    await touch('touchMove', [pts[pts.length - 1]]); await touch('touchEnd', []); await sleep(200);
  }
  check((await lp()).traced === true, 'following the star along each stroke traces a');
  await shot('28d-trace');
  ls = await until(async () => { const x = await lp(); return x.step === 'hear' && x; });
  check(ls && ls.choices.length === 3 && ls.choices.includes('apple'), `Hear: three pictures, one of them starts with A ${JSON.stringify(ls && ls.choices)}`);
  await until(async () => (await said()).includes('Which one starts with A?'));
  check((await said()).includes('Which one starts with A?'), 'Hear asks by name: "Which one starts with A?"');
  await shot('28e-hear'); await fits('hear');
  const wrongW = ls.choices.find(c => c !== ls.want);
  await tap(`.lp-card[data-k="${wrongW}"]`); await sleep(600);
  check((await said()).some(t => t.toLowerCase().startsWith(wrongW + ' ') && /(starts|ends) with [A-Z]!/.test(t)) && (await lp()).misses === 1, `a wrong picture: the voice says what ${wrongW} starts with, and asks again`);
  // each round deals its cards in, growing from nothing: wait for them to land before tapping
  for (let r = 0; r < 4 && (await lp()).step === 'hear'; r++) { await sleep(500); const s1 = await lp(); await tap(`.lp-card[data-k="${s1.want}"]`); await until(async () => { const x = await lp(); return x.step !== 'hear' || x.round !== s1.round; }); }
  ls = await lp();
  check(ls.step === 'find' && ls.choices.length === 3 && ls.choices.includes('a') && ls.want === 'a', `Find: three letters, which one is a? ${JSON.stringify(ls.choices)}`);
  await until(async () => (await said()).includes('Which one is a?'));
  check((await said()).includes('Which one is a?'), 'Find asks by name: "Which one is a?"');
  await shot('28f-find'); await fits('find');
  const plains = [];
  for (let r = 0; r < 5 && (await lp()).step === 'find'; r++) { await sleep(500); const s1 = await lp(); plains[s1.round] = await page.getAttribute('.lp-cards', 'data-plain'); await tap(`.lp-card[data-k="${s1.want}"]`); await until(async () => { const x = await lp(); return x.step !== 'find' || x.round !== s1.round; }); }
  check((await said()).some(t => t === "Yes! That's a!") && !(await said()).some(t => / says \//.test(t)), 'a right letter: "Yes! That\'s a!" (and no letter sounds anywhere in the lesson)');
  check(plains.length === 3 && plains[2] === '1' && !plains[0], `Find: the last round draws the letters in plain ink, so a is found by its shape ${JSON.stringify(plains)}`);
  ls = await lp();
  check(ls.lesson && ls.step === null && ls.stars.a === 2, `the lesson ends with stars: two, for one wrong tap ${JSON.stringify(ls.stars)}`);
  await until(async () => (await said()).includes('You learned a!'));
  await shot('28g-done');
  await until(async () => !(await lp()).lesson, 25);
  ls = await lp();
  check(!ls.lesson && ls.open.join('') === 'ab' && await page.locator('.lp-stone[data-l="a"] .lp-stars i.on').count() === 2, `back on the trail: a shows its two stars and b is open (${ls.open.join('')})`);
  await until(async () => (await said()).includes('Next is b!'));
  check((await said()).includes('Next is b!'), 'and the voice says "Next is b!"');
  await tap('#letterpath .sc-back'); await sleep(500);
  await tap('.gamecard[aria-label="ABC Zoo"]'); await sleep(700);
  check(await page.locator('#azGrid .az-tile').count() === 26, 'ABC Zoo shows all 26 letters');
  before = await osc(); const zs = (await said()).length;
  await tap('.az-tile[data-l="M"]'); await sleep(2600);
  let sc = await school();
  check(sc.zoo.letter === 'M' && await osc() > before, `tapping a letter shows it and its picture makes its sound (${sc.zoo.letter})`);
  check((await said()).slice(zs).includes('M is for monkey!') && !(await said()).slice(zs).some(t => / says /.test(t)), 'and the voice says "M is for monkey!" (no letter sound)');
  const az = await page.evaluate(() => { const b = s => document.querySelector(s).getBoundingClientRect(), g = b('#azGrid'), side = g.left > b('#azStage').right - 2;
    return { side, clear: ['#azLetters', '#azPic', '#azWord'].every(s => side ? b(s).right <= g.left : b(s).bottom <= g.top), gap: Math.round(b('#azWord').top - b('#azPic').bottom),
      tile: [Math.round(b('.az-tile').width), Math.round(b('.az-tile').height)], ink: [...document.querySelectorAll('#azGrid .az-tile')].every(t => { const r = t.getBoundingClientRect(), q = t.querySelector('.glyph').getBoundingClientRect(); return q.bottom <= r.bottom && q.top >= r.top; }) }; });
  check(az.clear && az.gap >= -2 && az.gap <= 8, `ABC Zoo: the letter, picture and word stay clear of the letter tiles, the word just under its picture ${JSON.stringify(az)}`);
  check(az.ink && (az.side || Math.abs(az.tile[0] - az.tile[1]) <= 1), `ABC Zoo: the tiles are square and every letter sits inside its tile ${JSON.stringify(az.tile)}`);
  await shot('29-abczoo'); await fits('abc zoo');
  await tap('#azCase'); await sleep(300);
  check(!(await school()).zoo.small && await page.locator('#azGrid .az-tile img').count() === 26, 'little letters first; the case button shows the capitals');
  await tap('#azSong'); await sleep(1500);
  check((await school()).zoo.singing, 'the song button sings the ABCs, lighting each letter');
  await tap('#azSong'); await sleep(300);
  check(!(await school()).zoo.singing, 'and tapping it again stops');
  await tap('#abczoo .sc-back'); await sleep(500);
  check(await visible('#school'), 'the back button goes back to School');
  await tap('.gamecard[aria-label="ABC Snack"]'); await sleep(1500);
  for (let i = 0; i < 25 && !(await school()).snack.want; i++) await sleep(300);
  sc = await school();
  check(sc.snack.want && sc.snack.mode === 'big' && sc.snack.choices.length === 2 && sc.snack.choices.includes(sc.snack.want) && 'ABCDEF'.includes(sc.snack.want),
    `ABC Snack: an animal asks for a big letter from the first group (A to F, the Letter Path's order), with 2 cookies ${JSON.stringify(sc.snack)}`);
  const asked = () => said().then(a => a.find(t => / wants (an? [A-Z]|a little [a-z])!$/.test(t) && t.toUpperCase().endsWith(` ${sc.snack.want}!`)));
  for (let i = 0; i < 25 && !(await asked()); i++) await sleep(300);   // it waits for the intro line
  check(await page.locator('#asWant .glyph').count() === 0 && !!(await asked()),
    `the letter is asked for out loud, in a few words ("${await asked()}"), never shown in the bubble (the child has to know it)`);
  await shot('30-abcsnack'); await fits('abc snack');
  const wrongL = sc.snack.choices.find(L => L !== sc.snack.want);
  await tap(`#asFoods .st-food[data-l="${wrongL}"]`); await sleep(1800);
  check((await said()).some(t => t.startsWith(`That's ${wrongL}!`)) && (await school()).snack.fed === 0, `a wrong cookie: the voice names it ("That's ${wrongL}!") and asks again`);
  await tap(`#asFoods .st-food[data-l="${sc.snack.want}"]`); await sleep(1500);
  check((await school()).snack.fed === 1 && await page.locator('#asFed .s').count() === 1, 'the right cookie is eaten and earns a letter sticker');
  await home();
  await holdClock();
  await tapSetting('[data-abc="little"]');
  check(/Letters known/.test(await page.locator('#abcNote').textContent()), 'parent settings show the letters learned');
  await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="ABC Snack"]'); await sleep(1500);
  for (let i = 0; i < 25 && !(await school()).snack.want; i++) await sleep(300);
  sc = await school();
  const labels = await page.$$eval('#asFoods .st-food', bs => bs.map(b => b.getAttribute('aria-label')));
  check(sc.snack.level === 1 && (sc.snack.mode === 'little' ? labels.every(l => l.startsWith('little ')) : sc.snack.mode === 'big'), `the "Little letters" setting asks mostly for little letters ${sc.snack.mode} ${JSON.stringify(labels)}`);
  await home();
  // a phone left on the old letter-sounds stage (or the old Sounds setting) now asks by name only
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('toyphone.settings')); st.abc = 'sound'; localStorage.setItem('toyphone.settings', JSON.stringify(st));
    const a = JSON.parse(localStorage.getItem('toyphone.abc') || '{}'); a.lv = 2; a.v = 2; localStorage.setItem('toyphone.abc', JSON.stringify(a)); });
  await page.reload(); await page.waitForFunction(() => window.__toyPhone); await sleep(800);
  const asks = [];
  for (let k = 0; k < 3; k++) {
    await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="ABC Snack"]'); await sleep(1500);
    sc = await until(async () => { const x = await school(); return x.snack.want && x; });
    await until(async () => (await said()).some(t => / wants (an? [A-Z]|a little [a-z])!$/.test(t) && t.toUpperCase().endsWith(` ${sc.snack.want}!`)), 20);
    asks.push(sc.snack.mode); await home();
  }
  check(asks.every(m => m === 'big' || m === 'little') && (await school()).progress.lv <= 1 && !(await said()).some(t => / wants \/[a-z]\//.test(t)),
    `ABC Snack never asks for a letter's sound, even for a phone left on the old sounds stage: it asks by name (${asks.join(', ')})`);
  await holdClock();
  check(await page.locator('[data-abc="sound"]').count() === 0 && await page.locator('[data-abc="little"].on').count() === 1, 'the Sounds choice is gone; the old setting becomes Little letters');
  await tapSetting('[data-abc="auto"]');
  await tapSetting('.lp-chip[data-pl="m"]'); await sleep(400);
  check(/lips together/.test(await page.locator('#pathInfo').textContent()) && /Learned: 1 of 26/.test(await page.locator('#pathNote').textContent()),
    'the parent page: letters learned so far, and a letter shows how to say its sound');
  await until(async () => (await said()).includes('This is m. M is for monkey!'), 10);
  check((await said()).includes('This is m. M is for monkey!'), 'and plays its lesson line');
  await tapSetting('[data-path="open"]'); await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="Letter Path"]'); await sleep(800);
  check((await lp()).open.length === 26 && await page.locator('.lp-stone.locked').count() === 0, 'the "All open" setting opens every letter');
  await home();
  await holdClock(); await tapSetting('[data-path="order"]'); await tap('#doneBtn'); await sleep(300);

  // --- SCHOOL: counting, 123 Zoo and 123 Snack
  const nums = () => page.evaluate(() => window.__toyPhone.numbers());
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="123 Zoo"]'); await sleep(900);
  check(await page.locator('#nzGrid .az-tile').count() === 10 && await page.locator('#nzFrame .nz-cell').count() === 10, '123 Zoo: the numbers 1 to 10 and an empty ten-frame');
  let c0 = (await said()).length; before = await osc();
  await tap('#nzGrid .az-tile[data-n="3"]');
  await until(async () => (await said()).slice(c0).includes('Three zebras!'), 25);
  let nm = await nums(), heard = (await said()).slice(c0);
  check(nm.zoo.n === 3 && nm.zoo.shown === 3 && await page.locator('#nzFrame .nz-cell .art').count() === 3, `tapping 3: three zebras hop into the ten-frame ${JSON.stringify(nm.zoo)}`);
  check(['One!', 'Two!', 'Three!', 'Three zebras!'].every(t => heard.includes(t)) && heard.indexOf('Three!') < heard.indexOf('Three zebras!') && await osc() > before,
    `each one is counted out loud, then "Three zebras!" and they neigh ${JSON.stringify(heard)}`);
  check(await page.locator('#nzNum img, #nzNum canvas').count() > 0, 'the number shows big above the frame');
  await shot('31-123zoo'); await fits('123 zoo');
  c0 = (await said()).length;
  await tap('#nzCount');
  await until(async () => (await said()).slice(c0).includes('You counted to ten!'), 45);
  nm = await nums(); heard = (await said()).slice(c0);
  check(['Count to ten!', 'One!', 'Five!', 'Ten!', 'You counted to ten!'].every(t => heard.includes(t)) && nm.zoo.shown === 10 && !nm.zoo.counting,
    'the 10 button counts ten stars: "Count to ten!", "One!" to "Ten!", then "You counted to ten!"');
  await tap('#numzoo .sc-back'); await sleep(500);
  await tap('.gamecard[aria-label="123 Snack"]'); await sleep(1500);
  // count myself (the default): boxes that don't give the number away, add and take back, then the green check
  const WANTS = / wants (one|two|three) \w+!( Add snacks, then tap the check!)?$/;
  let sn = (await until(async () => { const x = await nums(); return x.snack.want && x; })).snack;
  check(sn.mode === 'self' && sn.want >= 1 && sn.want <= 3 && sn.cells === 5 && sn.filled === 0 && sn.feed, `123 Snack: an animal wants one to three snacks; five empty boxes and a green check, so the boxes don't give it away ${JSON.stringify(sn)}`);
  await until(async () => (await said()).some(t => WANTS.test(t)));
  check((await said()).some(t => WANTS.test(t) && / Add snacks, then tap the check!$/.test(t)), `and says how many, and how to play ("${(await said()).find(t => WANTS.test(t))}")`);
  check(await page.locator('#nsWant img, #nsWant canvas').count() > 0, 'the number shows in its thought bubble');
  await shot('32-123snack'); await fits('123 snack');
  c0 = (await said()).length;
  for (let i = 0; i <= sn.want; i++) { await tap('#nsBasket'); await sleep(550); }
  let sn1 = (await nums()).snack; heard = (await said()).slice(c0);
  check(sn1.got === sn.want + 1 && sn1.filled === sn.want + 1 && await page.locator('#nsFrame .nz-badge').count() === sn.want + 1, `each tap on the basket puts one snack in the next box, numbered ${JSON.stringify(sn1)}`);
  check(['One!', 'Two!', 'Three!', 'Four!'].slice(0, sn.want + 1).every(t => heard.includes(t)), `and counts it out loud ${JSON.stringify(heard)}`);
  await shot('33-123snack-plate');
  c0 = (await said()).length;
  await tap('#nsFeed'); await sleep(700);
  const many = `${['One', 'Two', 'Three', 'Four'][sn.want]} is too many!`;
  check((await nums()).snack.fed === 0 && (await said()).slice(c0).some(t => t.startsWith(many) && WANTS.test(t)), `one too many and the check: "${many}", and it asks again (nothing eaten)`);
  await tap('#nsFrame'); await sleep(600);
  sn1 = (await nums()).snack;
  check(sn1.got === sn.want && sn1.filled === sn.want, `tapping the boxes takes the last snack back ${JSON.stringify(sn1)}`);
  c0 = (await said()).length;
  await tap('#nsFeed');
  await until(async () => (await said()).slice(c0).some(t => /^Yum! (One|Two|Three) \w+!$/.test(t)), 25);
  check((await nums()).snack.fed === 1 && await page.locator('#nsFed .s').count() === 1 && (await said()).slice(c0).some(t => /^Yum! (One|Two|Three) \w+!$/.test(t)),
    'the right number and the check: the animal eats them all, "Yum! Three bones!", and a sticker');
  sn = (await until(async () => { const x = await nums(); return x.snack.want && x; })).snack;
  check(!!sn.want && sn.filled === 0, `the next animal walks in (${sn.animal} wants ${sn.want})`);
  c0 = (await said()).length;
  await tap('#nsFeed'); await sleep(600); await tap('#nsFeed'); await sleep(600);
  sn1 = (await nums()).snack;
  check(sn1.aim === sn.want && (await said()).slice(c0).some(t => WANTS.test(t)), `after two tries with nothing on the plate, the boxes it wants glow (${sn1.aim})`);
  await home();
  // help count (a parent setting): the boxes show how many, and the animal eats when they're full
  await holdClock(); await tapSetting('[data-count="help"]'); await tap('#doneBtn'); await sleep(300);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('toyphone.settings')).count) === 'help', 'the 123 Snack setting is saved');
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="123 Snack"]'); await sleep(1500);
  sn = (await until(async () => { const x = await nums(); return x.snack.want && x; })).snack;
  check(sn.mode === 'help' && sn.cells === sn.want && !sn.feed, `Help count: as many boxes as it wants, no check button ${JSON.stringify(sn)}`);
  for (let i = 0; i < sn.want; i++) { await tap('#nsBasket'); await sleep(550); }
  await until(async () => (await nums()).snack.fed === 1, 25);
  check((await nums()).snack.fed === 1, 'and it eats as soon as the boxes are full');
  await home();
  await holdClock(); await tapSetting('[data-count="self"]'); await tap('#doneBtn'); await sleep(300);

  // --- ANIMAL DELIVERY: put each thing where the voice says (in, on, under, next to)
  const dv = () => page.evaluate(() => window.__toyPhone.delivery());
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="Animal Delivery"]'); await sleep(900);
  let d = await dv();
  check(d.spots.join() === 'inBox,onTable' && ['inBox', 'onTable'].includes(d.target) && !!d.item, `Animal Delivery starts with two spots: in the box or on the table (no "on the box": the box is open) ${JSON.stringify(d)}`);
  const PLACE = { inBox: 'in the box', nextBox: 'next to the box', onTable: 'on the table', underTable: 'under the table', underTree: 'under the tree' };
  await until(async () => (await said()).some(t => t.endsWith(`Put the ${d.item} ${PLACE[d.target]}!`)), 15);
  check((await said()).some(t => t.includes('Animal Delivery! Put each thing where it goes!') && t.endsWith(`Put the ${d.item} ${PLACE[d.target]}!`)), `and says where: "Put the ${d.item} ${PLACE[d.target]}!"`);
  await shot('35-delivery'); await fits('animal delivery');
  const wrongSpot = d.spots.find(k => k !== d.target);
  c0 = (await said()).length;
  await tap(`.ad-spot[data-spot="${wrongSpot}"]`); await sleep(900);
  d = await dv();
  check(d.misses === 1 && d.rights === 0 && (await said()).slice(c0).some(t => t.startsWith(`That's ${PLACE[wrongSpot]}.`)), `a wrong spot is named ("That's ${PLACE[wrongSpot]}.") and it asks again`);
  await until(async () => !(await dv()).busy, 10);
  // drag the thing from the parcel to the right spot, with a finger
  const from = await center('#adParcel'), to = await center(`.ad-spot[data-spot="${d.target}"]`);
  c0 = (await said()).length;
  await drag(from, to, 12); await sleep(900);
  d = await dv();
  check(d.rights === 1 && d.placed === 1 && (await said()).slice(c0).some(t => /^Yes! (In the box|On the table)!$/.test(t)), `dragging it to the right spot: it stays there, "Yes! In the box!" ${JSON.stringify(d)}`);
  for (let k = 0; k < 2; k++) { await until(async () => { const x = await dv(); return !x.busy && x.placed === 0; }, 15); const x = await dv(); await tap(`.ad-spot[data-spot="${x.target}"]`); await sleep(400); }
  await until(async () => { const x = await dv(); return !x.busy && x.placed === 0; }, 15);
  d = await dv();
  check(d.level === 1 && d.spots.join() === 'inBox,onTable,underTable' && d.target === 'underTable', `after three right, under the table joins (on and under at the same table), and it asks about it first ${JSON.stringify(d)}`);
  await tap(`.ad-parcel[data-item="${d.itemKey}"]`);
  await shot('36-delivery-table');
  await tap(`.ad-spot[data-spot="${d.spots.find(k => k !== d.target)}"]`); await sleep(500);
  await until(async () => !(await dv()).busy, 10);
  d = await dv(); await tap(`.ad-spot[data-spot="${d.spots.find(k => k !== d.target)}"]`); await sleep(500);
  await until(async () => !(await dv()).busy, 10);
  check((await dv()).hint.join() === d.target, 'after two tries the right spot glows');
  await home();

  // --- DINO PICNIC: give the dino as many snacks as it wants, from a scattered spread, then the check
  const dino = () => page.evaluate(() => window.__toyPhone.dinos());
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="Dino Picnic"]'); await sleep(1500);
  let dp = await until(async () => { const x = await dino(); return x.want && x; });
  check(dp.want >= 1 && dp.want <= 3 && dp.spread >= dp.want + 3 && dp.feed && dp.rings === 0, `Dino Picnic: a dino wants one to three snacks; more lie scattered on the blanket, and the plate has no boxes ${JSON.stringify(dp)}`);
  await until(async () => (await said()).some(t => / wants (one|two|three) \w+!/.test(t) && t.includes('Tap the snacks to give them, then tap the check!')), 15);
  check((await said()).some(t => / wants (one|two|three) \w+!/.test(t)), `and says what it wants ("${(await said()).find(t => / wants (one|two|three) \w+!/.test(t))}")`);
  await shot('37-dinopicnic'); await fits('dino picnic');
  c0 = (await said()).length;
  for (let i = 0; i <= dp.want; i++) { await tap('#dpSpread .dp-snack:not(.gone)'); await sleep(550); }
  let dp1 = await dino(); heard = (await said()).slice(c0);
  check(dp1.got === dp.want + 1 && dp1.spread === dp.spread - dp.want - 1 && ['One!', 'Two!', 'Three!', 'Four!'].slice(0, dp.want + 1).every(t => heard.includes(t)), `each snack tapped goes onto the plate, counted out loud ${JSON.stringify(dp1)}`);
  c0 = (await said()).length; await tap('#dpFeed'); await sleep(700);
  check((await dino()).fed === 0 && (await said()).slice(c0).some(t => t.startsWith(`${['One', 'Two', 'Three', 'Four'][dp.want]} is too many!`)), 'one too many and the check: "… is too many!", nothing eaten');
  await tap('#dpPlate'); await sleep(600);
  dp1 = await dino();
  check(dp1.got === dp.want && dp1.spread === dp.spread - dp.want, `tapping the plate puts the last snack back on the blanket ${JSON.stringify(dp1)}`);
  c0 = (await said()).length; await tap('#dpFeed');
  await until(async () => (await said()).slice(c0).some(t => /^Yum! (One|Two|Three) \w+!$/.test(t)), 25);
  check((await dino()).fed === 1 && await page.locator('#dpFed .s').count() === 1, 'the right number and the check: the dino eats them, "Yum!", and a sticker');
  await home();
  await holdClock(); await tapSetting('[data-count="help"]'); await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="Dino Picnic"]'); await sleep(1500);
  dp = await until(async () => { const x = await dino(); return x.want && x; });
  check(dp.mode === 'help' && dp.rings === dp.want && !dp.feed, `Help count: rings on the plate show how many, no check button ${JSON.stringify(dp)}`);
  for (let i = 0; i < dp.want; i++) { await tap('#dpSpread .dp-snack:not(.gone)'); await sleep(550); }
  await until(async () => (await dino()).fed === 1, 25);
  check((await dino()).fed === 1, 'and the dino eats as soon as the rings are filled');
  await home();
  await holdClock(); await tapSetting('[data-count="self"]'); await tap('#doneBtn'); await sleep(300);

  // --- School sounds: the lesson voice always speaks; animal sounds and cheers in School can be quieter or off
  await holdClock();
  check(await page.locator('[data-voice="school"]').isDisabled() && await page.locator('[data-voice="find"]').isDisabled()
    && await page.getAttribute('[data-voice="school"]', 'aria-checked') === 'true', 'the School and Find It voices are always on (a question the child must hear never goes silent)');
  await tapSetting('[data-schoolfx="off"]'); await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="ABC Zoo"]'); await sleep(700);
  const fxSchool = await page.evaluate(() => window.__toyPhone.fxLevel());
  c0 = (await said()).length; await tap('#azGrid .az-tile[data-l="C"]'); await sleep(2200);
  check(fxSchool === 0 && (await said()).slice(c0).includes('C is for cat!'), `School sounds Off: no animal sounds in School (level ${fxSchool}), and the voice still says "C is for cat!"`);
  await home();
  check(await page.evaluate(() => window.__toyPhone.fxLevel()) === 1, 'outside School the sounds play as usual');
  await holdClock(); await tapSetting('[data-schoolfx="on"]'); await tap('#doneBtn'); await sleep(300);

  // --- Play time: when it's up, a heads-up; the session ends as the child leaves the game; a grown-up starts more
  await holdClock(); await tapSetting('[data-play="15"]');
  check(/Played 0 of 15 minutes/.test(await page.locator('#playNote').textContent()), 'Play time: 15 minutes, with how much is used');
  await tap('#doneBtn'); await sleep(300);
  await tap('[data-app="school"]'); await sleep(500); await tap('.gamecard[aria-label="123 Zoo"]'); await sleep(800);
  c0 = (await said()).length;
  await page.evaluate(() => window.__toyPhone.playTime(15 * 60000)); await sleep(1600);
  let ps = await page.evaluate(() => window.__toyPhone.session());
  check(ps.ending && !ps.shown && await visible('#breakIc') && (await said()).slice(c0).includes('Almost time for a break!'), `when the time is up: "Almost time for a break!", a moon in the status bar, and the game carries on ${JSON.stringify(ps)}`);
  await tap('#numzoo .sc-back'); await sleep(900);
  ps = await page.evaluate(() => window.__toyPhone.session());
  check(ps.ended && ps.shown && await visible('#breakTime'), `leaving the game ends the session: the sleepy owl covers the toy ${JSON.stringify(ps)}`);
  await until(async () => (await said()).slice(c0).includes('Time for a break! See you soon!'), 15);
  check((await said()).slice(c0).includes('Time for a break! See you soon!'), 'and says "Time for a break! See you soon!"');
  await shot('34-break'); await fits('break');
  await tap('#homeBtn'); await sleep(600);
  check(await visible('#breakTime'), 'the home button does not get past it');
  await page.evaluate(() => window.__toyPhone.ringIn()); await sleep(600);
  check(await state() !== 'ringing', 'and no calls come in');
  await page.reload(); await page.waitForFunction(() => window.__toyPhone); await sleep(800);
  check(await visible('#breakTime'), 'it is still there after closing and opening the toy');
  await holdClock();
  check(/Break time/.test(await page.locator('#playNote').textContent()), 'a grown-up holds the clock: settings say it is break time');
  await tapSetting('#playReset'); await sleep(300);
  ps = await page.evaluate(() => window.__toyPhone.session());
  check(!ps.ended && !ps.shown && ps.used === 0, `Start a new session: the owl goes and the time starts over ${JSON.stringify(ps)}`);
  await tapSetting('[data-play="0"]'); await tap('#doneBtn'); await sleep(300);

  // --- PAINT PALS (two players): both kids rub their own picture at the same time
  await tap('[data-app="games"]'); await sleep(500);
  await tap('.gamecard[aria-label="Paint Pals"]'); await sleep(700);
  check(await visible('#paintpals .who'), 'Paint Pals asks: one player or two?');
  await tap('#paintpals .who-btn[data-n="2"]'); await sleep(400);
  check(await visible('.pp-a') && await visible('.pp-b'), 'Paint Pals, 2 players: a picture for each player');
  const pc = await page.$$eval('.pp-cv', cs => cs.map(c => { const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  check(pc.every(b => b[2] >= 120 && b[2] % 32 === 0), `Paint Pals: each picture is big and pixel-sharp (${pc.map(b => b[2]).join(', ')}px)`);
  // Stay beside each canvas and below the optional toolbar, so this tests paint flinging.
  const corners = await page.$$eval('.pp-side', ss => ss.map(s => { const r = s.getBoundingClientRect(); return [r.x + 12, r.y + r.height / 2]; }));
  check(await page.evaluate(points => points.every(([x, y], i) => document.querySelectorAll('.pp-side')[i].contains(document.elementFromPoint(x, y))), corners), 'Paint Pals: both paint taps reach their own side');
  await touch('touchStart', corners); await sleep(30); await touch('touchEnd', []);
  // Observe the actual paint landing; a fixed sleep can end before Web Animations finish on a busy runner.
  await page.waitForFunction(() => window.__toyPhone.paint().painted.every(v => v > 0), null, {timeout:5000}).catch(() => {});
  let pp = await page.evaluate(() => window.__toyPhone.paint());
  check(pp.painted.every(v => v > 0), `Paint Pals: a tap beside the picture flings paint onto it ${JSON.stringify(pp.painted)}`);
  const sweep = async (r, rows) => {
    const fy = (r + .5) / rows, pt = (b, t) => [b[0] + b[2] * t, b[1] + b[3] * fy];
    await touch('touchStart', [pt(pc[0], .02), pt(pc[1], .02)]);
    for (let i = 1; i <= 14; i++) { await touch('touchMove', [pt(pc[0], .02 + .96 * i / 14), pt(pc[1], .02 + .96 * i / 14)]); await sleep(12); }
    await touch('touchEnd', []); await sleep(40);
  };
  for (let r = 0; r < 3; r++) await sweep(r, 9);
  pp = await page.evaluate(() => window.__toyPhone.paint());
  check(pp.painted.every(v => v > .1) && !pp.done.some(Boolean), `Paint Pals: two fingers rubbing at once paint both pictures ${JSON.stringify(pp.painted)}`);
  await shot('25-paintpals');
  await fits('paint pals');
  for (let r = 3; r < 9; r++) await sweep(r, 9);
  await sleep(900);
  pp = await page.evaluate(() => window.__toyPhone.paint());
  check(pp.done.every(Boolean) && pp.painted.every(v => v === 1), 'Paint Pals: a nearly painted picture finishes itself');
  await shot('26-paintpals-done');
  await sleep(7000);
  pp = await page.evaluate(() => window.__toyPhone.paint());
  check(pp.rounds === 1 && pp.gallery >= 2 && !pp.done.some(Boolean), `Paint Pals: when both are done, the pair goes up on the shelf and a new pair arrives ${JSON.stringify(pp)}`);
  check((await said()).some(s => /^Beautiful!/.test(s)), 'Paint Pals names the finished pair');
  check(!!(await page.evaluate(() => localStorage.getItem('toyphone.paintpals'))), 'the painting shelf is remembered');
  await home();
  // one player: one big picture, then the next animal
  await tap('[data-app="games"]'); await sleep(500);
  await tap('.gamecard[aria-label="Paint Pals"]'); await sleep(700);
  await tap('#paintpals .who-btn[data-n="1"]'); await sleep(500);
  check(await visible('.pp-a') && !(await visible('.pp-b')), 'Paint Pals, 1 player: one picture fills the screen');
  const solo = await page.$eval('.pp-a .pp-cv', c => { const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  check(solo[2] >= pc[0][2] && solo[2] % 32 === 0, `Paint Pals, 1 player: the picture is at least as big (${solo[2]}px)`);
  for (let r = 0; r < 9; r++) {
    const fy = (r + .5) / 9, pt = t => [solo[0] + solo[2] * t, solo[1] + solo[3] * fy];
    await touch('touchStart', [pt(.02)]);
    for (let i = 1; i <= 14; i++) { await touch('touchMove', [pt(.02 + .96 * i / 14)]); await sleep(12); }
    await touch('touchEnd', []); await sleep(40);
  }
  await sleep(900);
  await shot('27-paintpals-solo');
  await fits('paint pals, 1 player');
  pp = await page.evaluate(() => window.__toyPhone.paint());
  check(pp.players === 1 && pp.done[0], 'Paint Pals, 1 player: rubbing alone finishes the picture');
  await sleep(5000);
  pp = await page.evaluate(() => window.__toyPhone.paint());
  check(pp.rounds === 2 && pp.gallery >= 3 && !pp.done[0], `Paint Pals, 1 player: the animal goes up on the shelf and the next one arrives ${JSON.stringify(pp)}`);
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

  check(await page.evaluate(() => !/\p{Extended_Pictographic}/u.test(document.body.innerText)), 'no emoji on screen: every picture is drawn art');
  check(await page.evaluate(() => document.querySelectorAll('svg').length === 0), 'no vector pictures on the page: every picture is pixel art');
  const broken = await page.evaluate(() => [...document.querySelectorAll('img.px')].filter(i => !i.complete || !i.naturalWidth).length);
  check(!broken, `every pixel sprite on the page has loaded (${broken} not)`);
  const garbled = (await said()).filter(t => /\b(?!ABCs?\b)[A-Z]{2,}\b/.test(t) || /([a-z])\1\1/i.test(t));   // (ABC is meant to be spelled out)
  check(!garbled.length, `spoken lines have no ALL-CAPS or stretched words (the voice would spell them out) ${JSON.stringify(garbled.slice(0, 3))}`);
  const fb = (await page.evaluate(() => window.__toyPhone.voice())).fallbacks.filter(t => !/Daddy/.test(t));
  check(!fb.length, `every line said during the run was a recorded clip (only family names use the phone's voice) ${JSON.stringify(fb.slice(0, 4))}`);
  const real = errors.filter(e => family || !/404|Failed to load resource/.test(e));
  check(!real.length, `no console errors ${real.length ? JSON.stringify(real.slice(0, 5)) : ''}`);
  await context.close();
}

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const left = (html.match(/\p{Extended_Pictographic}/gu) || []);
  check(!left.length, `index.html has no emoji (all art is drawn) ${left.slice(0, 10).join(' ')}`);
  check(!/<svg[\s>]/.test(html), 'index.html has no SVG: every picture is a pixel sprite');
  /* every sprite: same-width rows, and a color for every letter */
  const pix = html.slice(html.indexOf('const PIX = {'), html.indexOf('\n};\n', html.indexOf('const PIX = {')));
  const bad = [...pix.matchAll(/^(\w+):\{pal:\{([^}]*)\}, rows:`\n([^`]*)`/gm)].flatMap(([, n, pal, rows]) => {
    const keys = new Set([...pal.matchAll(/(\w):'#/g)].map(m => m[1])), r = rows.split('\n');
    return [...(r.some(x => x.length !== r[0].length) ? [`${n}: uneven rows`] : []), ...[...new Set(r.join(''))].filter(c => c !== '.' && !keys.has(c)).map(c => `${n}: no color for ${c}`)];
  });
  const count = (pix.match(/^\w+:\{pal:/gm) || []).length;
  /* every real animal recording is on disk and credited (author, license, link) in assets/sounds/CREDITS.md */
  const sj = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sounds', 'sounds.json'), 'utf8')), credits = fs.readFileSync(path.join(ROOT, 'assets', 'sounds', 'CREDITS.md'), 'utf8');
  const uncredited = Object.entries(sj).filter(([n, v]) => { const f = typeof v === 'string' ? v : v.file; return !fs.existsSync(path.join(ROOT, 'assets', 'sounds', f)) || !new RegExp(`\\|[^|]*\\b${n}\\b[^|]*\\|\\s*$`, 'm').test(credits); });
  check(!uncredited.length, `all ${Object.keys(sj).length} animal recordings are on disk and credited ${uncredited.map(u => u[0]).join(', ')}`);
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'voice', 'voice.json'), 'utf8'));
  const vbad = Object.entries(vj.clips).filter(([k, [f, ms]]) => { const fp = path.join(ROOT, 'assets', 'voice', f); const sound = /^n\|\/[a-z]\/!$/.test(k);   // (a letter sound on its own, like /k/, is a short puff)
    return !fs.existsSync(fp) || fs.statSync(fp).size < (sound ? 500 : 900) || ms < (sound ? 120 : 200) || ms > 15000; });
  const vfiles = fs.readdirSync(path.join(ROOT, 'assets', 'voice')).filter(f => f.endsWith('.mp3'));
  check(!vbad.length && vfiles.length === new Set(Object.values(vj.clips).map(v => v[0])).size, `all ${vfiles.length} voice clips are on disk, sized and timed sensibly, with none left over ${JSON.stringify(vbad.slice(0, 3))}`);
  check(count > 80 && !bad.length, `all ${count} pixel sprites are well formed ${bad.slice(0, 5).join(', ')}`);
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  // a fake camera (a moving test picture) stands in for the phone's, and its permission question is answered yes
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const only = process.env.ONLY || '';
    if (!only || only === 'portrait') await run(browser, base, 'portrait', { width: 390, height: 844 });
    if (!only || only === 'landscape') await run(browser, base, 'landscape', { width: 844, height: 390 });
    if ((!only && !process.env.QUICK) || only === 'safari-bars') await run(browser, base, 'safari-bars', { width: 390, height: 664 }, { family: false });
    await homeScreen(browser, base);
  } catch (e) { failures.push('crashed: ' + e.stack); console.error(e); }
  await browser.close(); srv.close();
  if (warnings.length) console.log('\nSize notes:\n  ' + warnings.join('\n  '));
  console.log(failures.length ? `\n${failures.length} FAILED:\n  ` + failures.join('\n  ') : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
})();
