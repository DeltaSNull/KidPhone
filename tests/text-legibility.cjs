/* Render real counters with the pixel fonts loaded; a system-font fallback must not hide ambiguous digits. */
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'..'), useWebkit=process.argv.includes('--webkit');
const face=(pkg,family,w)=>`@font-face{font-family:"${family}";font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)),'files',`${pkg}-latin-${w}-normal.woff2`)).toString('base64')})}`;
const fonts=[face('pixelify-sans','Pixelify Sans',500),face('pixelify-sans','Pixelify Sans',700),face('press-start-2p','Digit Reference',400)].join('\n');
const server=http.createServer((req,res)=>{const p=path.join(ROOT,new URL(req.url,'http://local').pathname),f=p===ROOT+path.sep?path.join(p,'index.html'):p;if(!f.startsWith(ROOT+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.setHeader('content-type',f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream');fs.createReadStream(f).pipe(res);});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await(useWebkit?webkit:chromium).launch();
  try{for(const viewport of [{width:390,height:844},{width:844,height:390},{width:375,height:667}]){
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true});
    await context.addInitScript(()=>{
      localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',look:'drag',tilt:'off'}));
      localStorage.setItem('toyphone.photos',JSON.stringify(Array.from({length:24},(_,i)=>({id:'legibility-'+i,t:i}))));
    });
    await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:fonts}));
    await context.route('https://fonts.gstatic.com/**',r=>r.abort());
    await context.route('**/assets/family/family.json',r=>r.fulfill({json:{contacts:[]}}));
    await context.route('**/assets/voice/voice.json',r=>r.fulfill({status:404,body:''}));
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const nativeScroll=async(selector,app)=>{
    if(!useWebkit&&await page.locator(selector).evaluate(el=>el.scrollHeight>el.clientHeight)){
      await page.locator(selector).evaluate(el=>el.scrollTop=0);const b=await page.locator(selector+' > button').first().boundingBox();const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
      for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2-i*8}]});await page.waitForTimeout(20);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
      assert.ok(await page.locator(selector).evaluate(el=>el.scrollTop>0),app+': a finger drag starting on a card scrolls the list');
      assert.ok(await page.locator('#'+app).isVisible(),app+': scrolling never activates a card');await cdp.detach();
    }
    };
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__toyPhone);
    await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>document.fonts.load('128px "Digit Reference"','0123456789'));
    const clock=page.locator('#clock');await clock.focus();await page.keyboard.down('Enter');await page.waitForTimeout(3250);await page.keyboard.up('Enter');
    await page.locator('#settings').waitFor({state:'visible'});
    assert.equal(await page.locator('#photoCount').textContent(),'24 photos','real persisted photo count');
    // Compare normalized rendered ink with the already-approved clear number font, independently of CSS family names.
    const compare=async selector=>page.locator(selector).evaluate(el=>{
      const s=getComputedStyle(el),c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
      function ink(d,font){g.clearRect(0,0,256,256);g.fillStyle='#000';g.font=font;g.fillText(d,24,196);const data=g.getImageData(0,0,256,256).data;let x0=256,x1=0,y0=256,y1=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(data[(y*256+x)*4+3]>128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return Array.from({length:28*28},(_,i)=>{const x=x0+Math.floor((i%28+.5)*(x1-x0+1)/28),y=y0+Math.floor((Math.floor(i/28)+.5)*(y1-y0+1)/28);return data[(y*256+x)*4+3]>128;});}
      return [...'0123456789'].map(d=>{const a=ink(d,`${s.fontWeight} 128px ${s.fontFamily}`),b=ink(d,'400 128px "Digit Reference"');return {digit:d,difference:a.filter((v,i)=>v!==b[i]).length/a.length};});
    });
    const counter=await compare('#photoCount');assert.ok(counter.every(d=>d.difference<.06),'photo count must use unambiguous digits: '+JSON.stringify(counter));
    assert.ok(await page.locator('.vtxt small').evaluateAll(els=>els.every(el=>parseFloat(getComputedStyle(el).fontSize)>=14)), 'settings explanations must not shrink below 14px');
    assert.ok(await page.locator('#dbCue').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14),'Dino turn instructions must not shrink below 14px');
    await page.locator('[data-settings-jump="settingsTools"]').tap();await page.locator('#photoCount').scrollIntoViewIfNeeded();
    const shot=path.join(ROOT,'tests/screenshots',`legibility-${useWebkit?'webkit':'chromium'}-${viewport.width}x${viewport.height}`);fs.mkdirSync(path.dirname(shot),{recursive:true});
    await page.screenshot({path:shot+'-settings.png'});
    assert.ok(await page.locator('#photoCount').evaluate(el=>el.scrollWidth<=el.clientWidth),'photo counter is not clipped');
    await page.locator('#doneBtn').tap();await page.evaluate(()=>window.__toyPhone.go('school'));
    const label=page.locator('#schoolList .gamecard[aria-label="123 Zoo"] .gname');
    assert.ok((await compare('#schoolList .gamecard[aria-label="123 Zoo"] .gname')).every(d=>d.difference<.06),'School menu numbers are clear without special number markup');
    await label.scrollIntoViewIfNeeded();await page.screenshot({path:shot+'-school.png'});
    await nativeScroll('#schoolList','school');
    for(const id of ['sorting','patterntrain','storytime','feelings']){
      await page.evaluate(id=>window.__toyPhone.go(id),id);await page.waitForTimeout(150);
      assert.ok(!/\d/.test(await page.locator('#'+id).innerText()),id+' shows progress as stars, with no numbers to read');
    }
    // A future plain text update must inherit the correction, including font-weight 500 body copy.
    await page.evaluate(()=>{const p=document.createElement('p');p.id='futureCounter';p.textContent='25 of 28';p.style.fontWeight='500';document.body.append(p);});
    assert.ok((await compare('#futureCounter')).every(d=>d.difference<.06),'new plain numeric text inherits clear digits');
    await page.evaluate(()=>document.getElementById('futureCounter').remove());
    await page.evaluate(()=>window.__toyPhone.go('phone'));await page.waitForTimeout(350);
    assert.ok(await page.locator('#contacts .nm').evaluateAll(names=>names.every(el=>{const box=el.closest('.contact').getBoundingClientRect(), range=document.createRange();range.selectNodeContents(el);return el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight&&[...range.getClientRects()].every(r=>r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom);})), 'every full animal name fits without an ellipsis');
    assert.ok(await page.locator('#contacts .nm').evaluateAll(names=>names.filter(el=>el.textContent!=='Alexandropoulos'&&!el.textContent.includes(' ')).every(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length===1;})), 'single-word animal names stay intact');
    assert.ok(await page.locator('#contacts .contact').evaluateAll(cards=>cards.every(el=>{const b=el.getBoundingClientRect(),face=el.querySelector('.face').getBoundingClientRect(),name=el.querySelector('.nm').getBoundingClientRect();return face.top>=b.top&&face.bottom<=name.top&&name.bottom<=b.bottom;})), 'portraits and full names fit without overlap, including a long family name');
    await page.screenshot({path:shot+'-contacts.png'});
    await page.evaluate(()=>window.__toyPhone.go('games'));await page.waitForTimeout(350);
    for(const card of await page.locator('#gameList .gamecard').all()){
      await card.scrollIntoViewIfNeeded();
      assert.ok(await card.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('.gname,.gplay')].every(label=>{const range=document.createRange();range.selectNodeContents(label);return [...range.getClientRects()].every(r=>r.top>=b.top&&r.bottom<=b.bottom&&r.left>=b.left&&r.right<=b.right);});}), 'game title and player note are fully visible within their card');
    }
    await nativeScroll('#gameList','games');
    await page.locator('#gameList .gamecard').first().scrollIntoViewIfNeeded();
    const first=page.locator('#gameList .gamecard').first();
    await first.dispatchEvent('pointerdown',{pointerId:77,clientX:100,clientY:200});
    await page.locator('#gameList').evaluate(el=>{el.scrollTop=30;el.dispatchEvent(new Event('scroll'));});
    await first.dispatchEvent('pointerup',{pointerId:77,clientX:100,clientY:200});
    assert.ok(await page.locator('#games').isVisible(),'scrolling game cards never opens a game');
    await first.scrollIntoViewIfNeeded();await page.screenshot({path:shot+'-games.png'});
    await first.tap();assert.ok(await page.locator('#wildtap').isVisible(),'stationary card tap still opens its game');
    // A long optional family contact must not crowd portraits or make a card unreachable.
    await page.route('**/assets/family/family.json',r=>r.fulfill({json:{contacts:[{name:'Alexandropoulos',color:'#BFE3F7'}]}}));
    await page.reload();await page.waitForFunction(()=>window.__toyPhone);await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>window.__toyPhone.go('phone'));await page.waitForTimeout(350);
    assert.ok(await page.locator('#contacts .contact, #schoolList .gamecard').evaluateAll(cards=>cards.every(el=>getComputedStyle(el).touchAction==='pan-y')), 'contact and School cards allow native vertical touch scrolling');
    assert.ok(await page.locator('#contacts .nm').allTextContents().then(names=>names.includes('Alexandropoulos')), 'long family contact fixture loaded');
    for(const card of await page.locator('#contacts .contact').all()){
      await card.scrollIntoViewIfNeeded();
      assert.ok(await card.evaluate(el=>{const b=el.getBoundingClientRect(),p=el.closest('#contacts').getBoundingClientRect(),face=el.querySelector('.face').getBoundingClientRect(),name=el.querySelector('.nm').getBoundingClientRect();return b.top>=p.top-1&&b.bottom<=p.bottom+1&&face.top>=b.top&&face.bottom<=name.top&&name.bottom<=b.bottom;}), 'long-name contacts are reachable, with portraits above labels');
    }
    await nativeScroll('#contacts','phone');
    await page.screenshot({path:shot+'-family-contacts.png'});
    assert.deepEqual(errors,[]);console.log('PASS text and numeral rendering '+viewport.width+'x'+viewport.height);await context.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
