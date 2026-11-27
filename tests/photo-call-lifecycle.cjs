/* Late family voice and real-camera saves must still belong to the action that started them. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(
  'window.__toyPhone = {',
  'window.lifecycleProbe = {Photos, PhotoDB, MAX_PHOTOS, loadClip, openSettings};\nwindow.__toyPhone = {'
);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
  if (file.endsWith('index.html')) res.end(html);
  else fs.createReadStream(file).pipe(res);
});

function familyWav(){
  const wav = Buffer.alloc(44 + 11200);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 44; i < wav.length; i += 2) wav.writeInt16LE(Math.round(Math.sin(i * .5) * 2000), i);
  return wav;
}

async function checkCall(context, origin){
  const page = await context.newPage();
  await context.route('**/assets/family/family.json', route => route.fulfill({
    json:{contacts:[{name:'Test caller', clips:['delayed-test.wav']}]}
  }));
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await context.route('**/delayed-test.wav', async route => {
    await delayed;
    await route.fulfill({body:familyWav(), contentType:'audio/wav'});
  });
  await context.addInitScript(() => {
    window.testFamilyStarts = 0;
    const node = AudioBufferSourceNode.prototype, start = node.start;
    node.start = function(...args){
      if (Math.abs((this.buffer?.duration ?? 0) - .7) < .001) window.testFamilyStarts++;
      return start.apply(this, args);
    };
  });
  await page.goto(origin);
  await page.locator('[data-app="phone"]').tap();
  await page.getByRole('button', {name:'Call Test caller'}).tap();
  await page.waitForFunction(() => window.__toyPhone.call() === 'talking');
  await page.waitForTimeout(500);
  await page.locator('#hangupBtn').tap();
  await page.waitForFunction(() => window.__toyPhone.call() === null);
  release();
  await page.waitForFunction(async () => !!(await window.lifecycleProbe.loadClip('assets/family/delayed-test.wav')));
  const late = await page.evaluate(() => window.testFamilyStarts);

  // The same decoded file still plays on a subsequent active call.
  await page.getByRole('button', {name:'Call Test caller'}).tap();
  await page.waitForFunction(before => window.testFamilyStarts > before, late);
  assert.equal(late, 0, 'family audio that finishes loading after Hang Up stays silent');
  await page.close();
}

async function checkPhotos(context, origin){
  // Use a synthetic video stream so capture and encoding run without a real camera.
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const frame = document.createElement('canvas');
      frame.width = 320;
      frame.height = 240;
      const paint = frame.getContext('2d'), stream = frame.captureStream(15);
      const track = stream.getVideoTracks()[0];
      const draw = () => {
        if (track.readyState !== 'live') return;
        paint.fillStyle = '#7658A7';
        paint.fillRect(0, 0, frame.width, frame.height);
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
      return stream;
    };
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => window.lifecycleProbe.PhotoDB.ok() && window.__toyPhone.photos() > 0)
    .catch(error => { throw Error('Photo storage did not start', {cause:error}); });
  await page.locator('[data-app="camera"]').tap();
  await page.locator('[data-mode="photo"]').tap();
  await page.waitForFunction(() => document.querySelector('#camVideo').videoWidth > 0)
    .catch(async error => { throw Error('The fake camera did not start: ' + JSON.stringify(await page.evaluate(() => window.__toyPhone.cam())), {cause:error}); });

  // Capture a real frame, but pause its encoding across the parent's clear.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    window.restorePhotoEncoding = () => { HTMLCanvasElement.prototype.toBlob = original; };
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args){
      original.call(this, blob => { window.encodedPhoto = () => callback(blob); }, ...args);
    };
  });
  await page.locator('#shutter').tap();
  await page.waitForFunction(() => window.encodedPhoto)
    .catch(error => { throw Error('The real shutter did not encode a frame', {cause:error}); });
  await page.evaluate(() => window.lifecycleProbe.openSettings());
  await page.locator('#clearBtn').tap();
  await page.locator('#yesClear').tap();
  await page.evaluate(() => {
    window.encodedPhoto();
    window.restorePhotoEncoding();
  });
  await page.waitForTimeout(300);
  const afterEncode = await page.evaluate(() => window.__toyPhone.photos());

  // Hold publication after the database accepts the blob, then clear before the write's caller resumes.
  const afterWrite = await page.evaluate(async () => {
    const {Photos, PhotoDB} = window.lifecycleProbe;
    Photos.clear();
    const actualPut = PhotoDB.put;
    let release, saved;
    const committed = new Promise(resolve => { saved = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    PhotoDB.put = async (id, blob) => {
      await actualPut(id, blob);
      saved();
      await pending;
    };
    try {
      const add = Photos.addBlob(new Blob(['test photo']), {names:[]});
      await committed;
      Photos.clear();
      release();
      await add;
      return Photos.list.length;
    } finally {
      PhotoDB.put = actualPut;
    }
  });

  // A fresh capture after the clear can still fall back to browser storage.
  await page.locator('#doneBtn').tap();
  await page.evaluate(() => {
    window.lifecycleProbe.PhotoDB.put = async () => { throw Error('Test quota failure'); };
  });
  await page.locator('#shutter').tap();
  await page.waitForFunction(() => window.__toyPhone.photoInfo().some(photo => photo.real && !photo.db));
  await page.reload();
  await page.waitForFunction(() => window.__toyPhone.photoInfo().some(photo => photo.real && photo.src.startsWith('data:')));

  const albums = await page.evaluate(async () => {
    const {Photos, PhotoDB, MAX_PHOTOS} = window.lifecycleProbe;
    Photos.clear();
    const blob = new Blob(['test photo']);
    await Promise.all(Array.from({length:MAX_PHOTOS - 1}, () => Photos.addBlob(blob, {names:[]})));
    await Promise.all([Photos.addBlob(blob, {names:[]}), Photos.addBlob(blob, {names:[]})]);
    const cap = Photos.list.length;
    const before = Photos.list.map(photo => photo.id);
    const actualPut = PhotoDB.put;
    PhotoDB.put = async () => { throw Error('Test quota failure'); };
    try { await Photos.addBlob(blob, {names:[]}); }
    catch {}
    finally { PhotoDB.put = actualPut; }
    return {cap, expected:MAX_PHOTOS, before, after:Photos.list.map(photo => photo.id)};
  });
  assert.deepEqual({
    afterEncode, afterWrite, count:albums.cap, failedWriteKeptPhotos:albums.after.join() === albums.before.join()
  }, {
    afterEncode:0, afterWrite:0, count:albums.expected, failedWriteKeptPhotos:true
  }, 'clear beats pending captures, overlapping writes respect the album limit, and a rejected write keeps existing photos');
  await page.close();
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
    const outcomes = [];
    for (const run of [checkCall, checkPhotos]){
      const context = await browser.newContext({
        viewport:{width:390, height:844}, isMobile:true, hasTouch:true, permissions:['camera']
      });
      await context.addInitScript(() => {
        if (!localStorage.getItem('toyphone.settings')){
          localStorage.setItem('toyphone.settings', JSON.stringify({incoming:false, camera:'both', look:'drag', tilt:'off'}));
        }
      });
      try { await run(context, origin); }
      catch (error){ outcomes.push(error); }
      finally { await context.close(); }
    }
    if (outcomes.length) throw new AggregateError(outcomes, 'Phone and Camera/Photos regressions');
    console.log('Phone audio and Camera/Photos lifecycle checks passed.');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
