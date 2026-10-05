/* Animal Delivery: meaningful object/location choices, spatial transfer, finite route and navigation cleanup. */
const assert = require('node:assert/strict');
const {chromium,webkit} = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const ROOT=path.resolve(__dirname,'..'), useWebkit=process.argv.includes('--webkit');
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.join(ROOT,pathname==='/'?'index.html':pathname);
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.mp3':'audio/mpeg','.png':'image/png'};
  res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
const check=(ok,msg)=>{assert.ok(ok,msg);console.log('ok  '+msg);};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  fs.mkdirSync(path.join(__dirname,'screenshots'),{recursive:true});
  const browser=await(useWebkit?webkit:chromium).launch();
  try{
    for(const viewport of [{width:390,height:844},{width:844,height:390},{width:375,height:667}]){
      const tag=`${viewport.width}x${viewport.height}`, context=await browser.newContext({viewport,hasTouch:true,isMobile:true});
      await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await context.route('https://fonts.gstatic.com/**',r=>r.abort());
      await context.route('**/assets/family/family.json',r=>r.fulfill({json:{contacts:[]}}));
      await context.route('**/assets/voice/voice.json',r=>r.fulfill({status:404,body:''}));
      await context.addInitScript(()=>localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',look:'drag',tilt:'off',silent:false})));
      const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__toyPhone);
      // Real time keeps Web Animations and setTimeout on the same clock in both engines. A fake JS clock does not
      // advance WebKit's animation completion events consistently. Wait on game state, not a fixed animation delay.
      const run=ms=>page.waitForTimeout(ms), state=()=>page.evaluate(()=>window.__toyPhone.delivery());
      const tap=async s=>{const r=await page.locator(s).boundingBox();assert.ok(r,s+' is visible');await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);await run(100);};
      const go=async id=>{await page.evaluate(id=>window.__toyPhone.go(id),id);await run(500);await page.waitForTimeout(400);};
      const settle=async()=>{await page.waitForTimeout(500);await run(100);};
      const pick=async()=>{const d=await state();await tap(`.ad-parcel[data-item="${d.itemKey}"]`);};
      const deliver=async()=>{
        const d=await state();await pick();await tap(`.ad-spot[data-spot="${d.target}"]`);
        await page.waitForFunction(n=>window.__toyPhone.delivery().rights===n,d.rights+1,{polling:50,timeout:5000});
        check((await state()).rights===d.rights+1,`${tag}: delivery ${d.rights+1} accepted once`);
        await page.waitForFunction(()=>{const d=window.__toyPhone.delivery();return d.done||!d.busy;},null,{polling:50,timeout:7000});
      };
      const fits=async()=>{
        const boxes=await page.locator('#delivery button:visible').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,r.width,r.height];}));
        check(boxes.every(([l,t,r,b,w,h])=>l>=0&&t>=0&&r<=viewport.width+1&&b<=viewport.height+1&&w>=44&&h>=44),`${tag}: controls fit and every touch target is at least 44px ${JSON.stringify(boxes)}`);
      };
      await go('delivery');let d=await state();
      check(await page.locator('#adAnimal').count()===0&&d.choices.length===1,`${tag}: no carrier animal beside the single first pickup`);
      await fits();await page.screenshot({path:path.join(__dirname,`screenshots/delivery-start-${tag}.png`)});
      const clips=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/voice/voice.json'),'utf8')).clips;
      const missing=await page.evaluate(()=>window.__toyPhone.voiceLines().filter(l=>l.s.startsWith('Put the ')||l.s==='You did it!'));
      check(missing.every(l=>clips[l.who+'|'+l.s]),`${tag}: delivery instructions and ending have existing recorded clips`);
      // A canceled drag must not submit a parcel.
      await page.locator('#adParcel').dispatchEvent('pointerdown',{pointerId:21,clientX:100,clientY:600});
      await page.locator('#adParcel').dispatchEvent('pointermove',{pointerId:21,clientX:130,clientY:560});
      await page.locator('#adParcel').dispatchEvent('pointercancel',{pointerId:21,clientX:130,clientY:560});
      check((await state()).rights===0&&await page.locator('.ad-float').count()===0,`${tag}: canceled drag leaves the route unchanged`);
      for(let i=0;i<3;i++)await deliver();
      d=await state();check(d.level===1&&d.choices.length===3&&d.selected===null&&d.target==='underTable',`${tag}: three successes introduce object choice and under the table`);
      await fits();await page.screenshot({path:path.join(__dirname,`screenshots/delivery-choice-${tag}.png`)});
      const wrong=d.choices.find(k=>k!==d.itemKey);
      await tap(`.ad-parcel[data-item="${wrong}"]`);await tap(`.ad-spot[data-spot="${d.target}"]`);await settle();
      check((await state()).rights===3&&(await state()).pickMisses===1&&(await state()).selected===null,`${tag}: wrong object cannot earn a delivery at the right destination`);
      await run(500);await tap(`.ad-parcel[data-item="${wrong}"]`);
      check(await page.locator(`.ad-parcel.hint[data-item="${d.itemKey}"]`).count()===1,`${tag}: repeated pickup misses gently highlight the requested object`);
      await pick();const wrongSpot=d.spots.find(k=>k!==d.target);
      for(let i=0;i<2;i++){await tap(`.ad-spot[data-spot="${wrongSpot}"]`);await settle();await run(1500);}
      check((await state()).rights===3&&(await state()).hint.includes(d.target),`${tag}: wrong destinations stay uncounted and offer a spatial hint`);
      const before=(await state()).rights;await tap('#adReplay');check((await state()).rights===before,`${tag}: replay does not answer the question`);
      for(let i=0;i<3;i++)await deliver();
      d=await state();check(d.mirrored&&d.spots.length===5,`${tag}: final stage transfers relations to a mirrored garden`);
      const tree=await page.locator('[data-place="tree"]').boundingBox(), table=await page.locator('[data-place="table"]').boundingBox();
      check(tree.x>table.x,`${tag}: tree and table really exchange screen sides`);
      await page.screenshot({path:path.join(__dirname,`screenshots/delivery-mirrored-${tag}.png`)});
      const relations=new Set();for(let i=0;i<3;i++){relations.add((await state()).target);await deliver();}
      check(relations.has('underTree')&&relations.has('nextBox'),`${tag}: route includes both new final-stage relations`);
      check((await state()).done&&await page.locator('#adFinish').isVisible()&&await page.locator('#adRoute .done').count()===9,`${tag}: nine deliveries finish the route without endless advancement`);
      await run(6000);check((await state()).rights===9,`${tag}: finished route waits for the child`);
      await fits();await tap('#adAgain');check((await state()).rights===0&&!(await state()).done&&(await state()).choices.length===1,`${tag}: replay starts a fresh simple route`);
      await run(500);d=await state();await tap(`.ad-spot[data-spot="${d.target}"]`);await go('school');await settle();await run(4000);
      check(await page.locator('#school').isVisible()&&await page.locator('.ad-float').count()===0&&(await state()).rights===0,`${tag}: navigation during flight cancels stale delivery completion`);
      check(errors.length===0,`${tag}: no JavaScript errors ${errors.join('; ')}`);await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
