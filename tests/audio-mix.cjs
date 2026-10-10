/* Modelled audio checks (R-26): every Music pad, rapid taps, overlapping hits and narration with effects, rendered
   offline through the toy's own output (the volume setting's level, then its compressor) at all four volume settings,
   then measured the way a phone speaker would play them (a 350 Hz high-pass, then the loudest 150 ms, K-weighted).
   - nothing clips (peak under 0.98), even two kids mashing every pad at Loud;
   - the six drums, the eight xylophone bars and the eight animal-piano keys each stay close in loudness, and the
     three instruments stay close to each other, at every volume;
   - each volume step is louder than the one before;
   - the narrator stays on top of the cheers and drums it's mixed with.
   This is a model. How it sounds on the family's iPhone is a separate, physical check (R-04).
   Run in Chromium, or with --webkit. */
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..');
const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.mp3':'audio/mpeg'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'content-type':types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
const check = (condition, message) => { assert.ok(condition, message); console.log('ok  ' + message); };
// the smoke test's phone-speaker model and hit loudness, shared rather than copied
const smoke = fs.readFileSync(path.join(__dirname, 'smoke.cjs'), 'utf8');
const phoneSpeaker = new Function(smoke.match(/function phoneSpeaker[\s\S]*?\n}\n/)[0] + 'return phoneSpeaker;')();
const hitLoudness = new Function(smoke.match(/function hitLoudness[\s\S]*?\n}\n/)[0] + 'return hitLoudness;')();
const VOL = ['Quiet', 'Soft', 'Medium', 'Loud'];
const median = a => { const b = [...a].sort((x, y) => x - y); return (b[(b.length - 1) >> 1] + b[b.length >> 1]) / 2; };
const spread = a => Math.max(...a) - Math.min(...a);

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await (process.argv.includes('--webkit') ? webkit : chromium).launch();
  try {
    const page = await browser.newPage();
    await page.route('**/assets/family/family.json', r => r.fulfill({json:{contacts:[]}}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForFunction(() => window.__toyPhone && window.__toyPhone.voice().loaded);
    const pads = await page.evaluate(() => window.__toyPhone.pads());
    const timed = await page.evaluate(() => typeof OfflineAudioContext.prototype.suspend === 'function');
    const voice = await page.evaluate(() => window.__toyPhone.voiceFile('Yes! The pattern goes on!'));
    const render = async (events, secs, vol) => Float64Array.from(await page.evaluate(([e, s, v]) => window.__toyPhone.renderMix(e, s, v), [events, secs, vol]));
    const measure = async (events, secs, vol) => { const x = await render(events, secs, vol); let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v)); return {loud:hitLoudness(phoneSpeaker(x, 44100), 44100), peak}; };
    const at = (list, gap) => list.map((e, j) => timed ? {...e, at:+(j*gap).toFixed(3)} : e);   // (no timed starts: all at once, which is harder still)
    const medians = [];
    for (let v = 0; v < 4; v++){
      const level = {drum:[], xylo:[], piano:[]}; let peak = 0;
      for (const kind of Object.keys(level)) for (let i = 0; i < pads[kind]; i++){ const m = await measure([{pad:kind, i}], 2, v); level[kind].push(m.loud); peak = Math.max(peak, m.peak); }
      const all = Object.values(level).flat();
      check(peak < .98, `${VOL[v]}: no single pad clips (loudest peak ${peak.toFixed(2)})`);
      check(spread(level.drum) <= 3 && spread(level.xylo) <= 1.5 && spread(level.piano) <= 5,
        `${VOL[v]}: drums within ${spread(level.drum).toFixed(1)} dB, xylophone bars within ${spread(level.xylo).toFixed(1)} dB, piano keys within ${spread(level.piano).toFixed(1)} dB`);
      const m3 = [median(level.drum), median(level.xylo), median(level.piano)];
      check(spread(m3) <= 4, `${VOL[v]}: the three instruments are within ${spread(m3).toFixed(1)} dB of each other (drums ${m3[0].toFixed(1)}, xylophone ${m3[1].toFixed(1)}, piano ${m3[2].toFixed(1)})`);
      medians.push(median(all));
      const one = await measure([{pad:'drum', i:2}], 2, v);
      const rapid = await measure(at(Array.from({length:8}, () => ({pad:'drum', i:2})), .11), 2, v);
      check(rapid.peak < .98 && rapid.loud - one.loud <= 10, `${VOL[v]}: eight quick taps on one drum don't clip (peak ${rapid.peak.toFixed(2)}, ${(rapid.loud - one.loud).toFixed(1)} dB over one tap)`);
      const together = await measure(Array.from({length:pads.drum}, (_, i) => ({pad:'drum', i})), 2, v);
      const gliss = await measure(at(Array.from({length:pads.xylo}, (_, i) => ({pad:'xylo', i})), .04), 2, v);
      const mash = await measure(at([...['drum', 'piano', 'xylo'].flatMap(k => Array.from({length:pads[k]}, (_, i) => ({pad:k, i})))], .05), 2.5, v);
      check(Math.max(together.peak, gliss.peak, mash.peak) < .98,
        `${VOL[v]}: overlapping hits don't clip (all drums at once ${together.peak.toFixed(2)}, a xylophone run ${gliss.peak.toFixed(2)}, every pad mashed ${mash.peak.toFixed(2)})`);
      const said = await measure([{voice}], 2.5, v), cheer = await measure([{fx:'cheer'}], 2.5, v);
      const both = await measure(at([{fx:'pop'}, {voice}, {fx:'cheer'}, {pad:'drum', i:0}], .12), 2.5, v);
      check(said.loud - cheer.loud >= 3 && Math.abs(both.loud - said.loud) <= 1.5 && both.peak < .98,
        `${VOL[v]}: the narrator stays on top: ${(said.loud - cheer.loud).toFixed(1)} dB over a cheer; with a pop, a cheer and a drum the mix is ${(both.loud - said.loud).toFixed(1)} dB from the voice alone, peak ${both.peak.toFixed(2)}`);
    }
    check(medians.every((m, v) => !v || m - medians[v - 1] >= 1.5), `each volume step is louder (${medians.slice(1).map((m, v) => '+' + (m - medians[v]).toFixed(1)).join(', ')} dB)`);
    if (!timed) console.log('note: this browser\'s offline audio can\'t start sounds mid-render, so rapid and overlapping hits started together (a harder case)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
