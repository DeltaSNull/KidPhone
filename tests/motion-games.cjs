/* Sensor permission, actual steering/collisions, complete rounds, access, and teardown. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(ROOT,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.mp3')?'audio/mpeg':'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 fs.mkdirSync(path.join(__dirname,'screenshots'),{recursive:true});
 const browser=await (process.argv.includes('--webkit')?webkit:chromium).launch();
 try{
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:375,height:667}]){
   const context=await browser.newContext({viewport,hasTouch:true,isMobile:true});
   await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
   await context.route('https://fonts.gstatic.com/**',r=>r.abort());
   await context.route('**/assets/family/family.json',r=>r.fulfill({json:{contacts:[]}}));
   await context.addInitScript(()=>{
    localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',look:'drag',silent:false}));
    // Games allowed, Camera disabled: shared camera policy must not block game sensors.
    localStorage.setItem('toyphone.access',JSON.stringify({mode:'custom',apps:{games:true,school:true,camera:false,photos:false,music:false,phone:false}}));
    window.permissionCount=0;window.permissionResult='granted';
    window.DeviceOrientationEvent ||= class {};
    window.DeviceOrientationEvent.requestPermission=()=>{window.permissionCount++;return window.permissionResult==='pending'?new Promise(r=>window.resolveMotion=r):Promise.resolve(window.permissionResult);};
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__toyPhone);
   await page.clock.install();
   // Replace the orientation object: WebKit's native angle can ignore an own-property shadow.
   await page.evaluate(()=>{window.motionOrientation={angle:0};Object.defineProperty(screen,'orientation',{configurable:true,get:()=>window.motionOrientation});});
   assert.equal(await page.evaluate(()=>screen.orientation.angle),0);
   const go=async id=>{await page.evaluate(id=>window.__toyPhone.go(id),id);await page.clock.runFor(500);};
   const state=()=>page.evaluate(()=>window.__toyPhone.motionGames());
   const advance=ms=>page.clock.runFor(ms);
   const click=sel=>page.locator(sel).dispatchEvent('click');
   const sensor=(beta,gamma)=>page.evaluate(([beta,gamma])=>{const e=new Event('deviceorientation');Object.assign(e,{beta,gamma,alpha:0});window.dispatchEvent(e);},[beta,gamma]);
   await go('games');assert.equal(await page.locator('#gameList button').count(),6);
   await go('balltrail');assert.equal(await page.evaluate(()=>window.permissionCount),0);
   const board=page.locator('#balltrail .motion-board');
   const rect=await board.boundingBox();assert.ok(rect.width>120&&rect.height>120);
   assert.ok(rect.y+rect.height<=viewport.height,'board fits');
   await advance(700);await click('#balltrail [data-motion-tilt]');await sensor(35,0);await sensor(35,18);await advance(350);
   assert.ok((await state()).x>18,'tilt moves ball right: '+JSON.stringify(await page.evaluate(()=>({state:window.__toyPhone.motionGames(),permissionCount:window.permissionCount,note:document.querySelector('#balltrail .motion-note').textContent,hidden:document.hidden,settings:document.querySelector('#settings').hidden,time:performance.now()}))));
   for(let i=0;i<5;i++){await sensor(35,18);await advance(300);}
   assert.ok((await state()).x<27,'hedge blocks ball');
   await page.locator('#balltrail [data-motion-center]').dispatchEvent('pointerdown');
   const centered=(await state()).x;await sensor(35,18);await advance(300);assert.ok(Math.abs((await state()).x-centered)<.1,'recenter stops drift');
   await advance(2000);assert.equal((await state()).mode,'touch','stale sensor falls back');
   const steer=async(x,y,ms=2200)=>{const r=await board.boundingBox();await page.mouse.move(r.x+r.width*x/100,r.y+r.height*y/100);await page.mouse.down();await advance(ms);await page.mouse.up();};
   // Down around first hedge, up around second, then into the star garden.
   await steer(15,76);await steer(50,76);await steer(50,20);await steer(85,20);await steer(85,86);
   assert.ok((await state()).done,'maze can be completed using touch');
   await page.locator('#balltrail [data-motion-again]').dispatchEvent('pointerdown');assert.equal((await state()).done,false);
   await go('starflight');
   const flight=page.locator('#starflight .motion-board');
   // Follow live stars with real pointer input; no score/position mutation hooks.
   for(let i=0;i<240&&!(await state()).done;i++){
    const st=await state(),star=st.stars.reduce((a,b)=>Math.hypot(st.x-a.x,st.y-a.y)<Math.hypot(st.x-b.x,st.y-b.y)?a:b);
    const r=await flight.boundingBox();await page.mouse.move(r.x+r.width*star.x/100,r.y+r.height*Math.max(6,Math.min(94,star.y))/100);await page.mouse.down();await advance(200);await page.mouse.up();
   }
   assert.equal((await state()).score,5,'flight ends after five catches');assert.ok((await state()).done);
   await go('balltrail');await page.evaluate(()=>window.permissionResult='denied');await advance(700);await click('#balltrail [data-motion-tilt]');assert.equal((await state()).mode,'touch');
   await page.evaluate(()=>window.permissionResult='granted');await advance(700);await click('#balltrail [data-motion-tilt]');
   await page.evaluate(()=>window.motionOrientation.angle=90);assert.equal(await page.evaluate(()=>screen.orientation.angle),90);await sensor(35,0);await sensor(53,0);await advance(300);assert.ok((await state()).x>18,'landscape rotates tilt axes');
   await go('home');assert.equal((await state()).id,null);await sensor(20,40);assert.equal((await state()).listening,false);
   await go('balltrail');await page.evaluate(()=>window.permissionResult='pending');await advance(700);await click('#balltrail [data-motion-tilt]');await go('home');await page.evaluate(()=>window.resolveMotion('granted'));assert.equal((await state()).listening,false,'late permission cannot restart departed game');
   await go('games');await page.screenshot({animations:'disabled',path:`tests/screenshots/motion-menu-${viewport.width}.png`});
   await go('balltrail');await page.screenshot({animations:'disabled',path:`tests/screenshots/motion-maze-${viewport.width}.png`});
   await go('starflight');await page.screenshot({animations:'disabled',path:`tests/screenshots/motion-flight-${viewport.width}.png`});
   assert.deepEqual(errors,[]);await context.close();console.log(`PASS motion ${viewport.width}x${viewport.height}`);
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
