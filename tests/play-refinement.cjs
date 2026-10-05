/* Learning replay/take-back and photo browsing: Chromium and WebKit, three phone layouts. */
const assert = require('node:assert/strict');
const {chromium,webkit} = require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),wk=process.argv.includes('--webkit');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.replace(/^\/KidPhone/,'')||'/';
 const file=path.join(root,name==='/'?'index.html':name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await(wk?webkit:chromium).launch();
 try{
 for(const [label,width,height] of [['portrait',390,844],['landscape',844,390],['safari-bars',390,664]].filter(v=>!process.env.ONLY||v[0]===process.env.ONLY)){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
  await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.route('**/assets/voice/voice.json',r=>r.fulfill({status:404,body:''}));
  await context.addInitScript(()=>localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',look:'drag',vol:1})));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(v,msg)=>{assert.ok(v,label+': '+msg);console.log('ok '+label+': '+msg);};
  const tap=async s=>{await page.locator(s).first().tap();await page.waitForTimeout(160);};
  let holds=0;
  const hold=async()=>{const key=holds++%2?'Space':'Enter';await page.locator('#clock').focus();await page.keyboard.down(key);await page.locator('#settings').waitFor({state:'visible',timeout:10000});await page.keyboard.up(key);};
  await page.goto(`http://127.0.0.1:${server.address().port}/KidPhone/`);await page.waitForFunction(()=>window.__toyPhone);
  const go=async id=>{await page.evaluate(id=>window.__toyPhone.go(id),id);await page.waitForTimeout(750);};
  const state=type=>page.evaluate(type=>type==='as'?window.__toyPhone.school().snack:type==='ns'?window.__toyPhone.numbers().snack:window.__toyPhone.dinos(),type);
  const ready=type=>page.waitForFunction(type=>{const s=type==='as'?window.__toyPhone.school().snack:type==='ns'?window.__toyPhone.numbers().snack:window.__toyPhone.dinos();return s.want!==null;},type,{timeout:10000});
  const fits=async type=>{
   const selectors=type==='as'?['#asReplay','.sc-back']:['#'+type+'Replay','#'+type+'Undo','#'+type+'Feed'];
   const boxes=await page.locator('#'+({as:'abcsnack',ns:'numsnack',dp:'dinopicnic'}[type])).evaluate((root,sels)=>sels.flatMap(sel=>[...root.querySelectorAll(sel)]).filter(el=>!el.hidden).map(el=>{const r=el.getBoundingClientRect();return{id:el.id,x:r.x,y:r.y,w:r.width,h:r.height};}),selectors);
   check(boxes.every(b=>b.w>=44&&b.h>=44&&b.x>=0&&b.y>=0&&b.x+b.w<=width&&b.y+b.h<=height),'new learning controls fit and have at least 44px targets');
  };
  const replay=async type=>{
   const before=await state(type),beforeData=await page.evaluate(()=>localStorage.getItem('toyphone.abc'));
   await tap('#'+type+'Replay');await page.waitForTimeout(300);
   check(JSON.stringify(await state(type))===JSON.stringify(before),'replay leaves '+type+' question and progress unchanged');
   check(await page.evaluate(()=>window.__toyPhone.voice().log.at(-1)?.includes('wants')),'replay speaks current '+type+' question');
   check(await page.evaluate(()=>localStorage.getItem('toyphone.abc'))===beforeData,'replay does not write letter progress');
  };
  await go('abcsnack');await ready('as');await replay('as');await fits('as');
  const abc=await state('as');await tap('.st-food[data-l="'+abc.want+'"]');
  check(await page.locator('#asReplay').isDisabled(),'ABC replay is disabled while eating');
  await go('numsnack');await ready('ns');check(await page.locator('#nsUndo').isDisabled(),'take-back is disabled with no snacks');
  await tap('#nsBasket');await tap('#nsBasket');await page.waitForTimeout(600);await replay('ns');
  await tap('#nsUndo');await page.waitForTimeout(600);check((await state('ns')).got===1&&(await state('ns')).filled===1,'explicit take-back removes one counted snack');
  await tap('#nsFrame');await page.waitForTimeout(500);check((await state('ns')).got===0&&await page.locator('#nsUndo').isDisabled(),'original box take-back remains available');
  await fits('ns');fs.mkdirSync(path.join(root,'tests/screenshots'),{recursive:true});await page.screenshot({path:path.join(root,'tests/screenshots/play-numbers-'+label+'.png')});
  let ns=await state('ns');for(let i=0;i<ns.want;i++)await tap('#nsBasket');await tap('#nsFeed');check(await page.locator('#nsReplay').isDisabled()&&await page.locator('#nsUndo').isDisabled(),'counting controls cannot interrupt correct feeding');
  await go('dinopicnic');await ready('dp');
  await tap('.dp-spread .dp-snack:not(.gone)');await tap('.dp-spread .dp-snack:not(.gone)');await page.waitForTimeout(500);await replay('dp');
  await tap('#dpUndo');await page.waitForTimeout(600);check((await state('dp')).got===1,'Dino take-back returns one snack');
  await tap('#dpPlate');await page.waitForTimeout(500);check((await state('dp')).got===0&&await page.locator('#dpUndo').isDisabled(),'original plate take-back remains available');
  await fits('dp');await page.screenshot({path:path.join(root,'tests/screenshots/play-dinos-'+label+'.png')});
  const spreadFits=async()=>check(await page.locator('.dp-spread').evaluate(el=>{const r=el.getBoundingClientRect(),bs=[...el.querySelectorAll('button')].filter(b=>!b.classList.contains('gone')).map(b=>b.getBoundingClientRect());return bs.every(b=>b.width>=44&&b.top>=r.top&&b.left>=r.left&&b.right<=r.right&&b.bottom<=r.bottom)&&bs.every((b,i)=>bs.slice(i+1).every(c=>b.right<=c.left||c.right<=b.left||b.bottom<=c.top||c.bottom<=b.top));}),'Dino snacks fit without overlapping touch targets');
  await spreadFits();
  for(let round=0;round<3;round++){
   const d=await state('dp');for(let i=0;i<d.want;i++)await tap('.dp-spread .dp-snack:not(.gone)');
   if(round===2)await page.evaluate(()=>{window.savedRandom=Math.random;Math.random=()=>.999;});
   await tap('#dpFeed');await ready('dp');
   if(round===2)await page.evaluate(()=>{Math.random=window.savedRandom;delete window.savedRandom;});
  }
  check((await state('dp')).want===5&&(await state('dp')).spread===8,'later round supports the largest quantity and eight separate choices');
  await spreadFits();await fits('dp');await page.screenshot({path:path.join(root,'tests/screenshots/play-dinos-later-'+label+'.png')});
  await hold();await tap('[data-settings-jump="settingsSchool"]');await tap('[data-count="help"]');await tap('#doneBtn');await ready('dp');check(await page.locator('#dpUndo').isHidden()&&await page.locator('#dpFeed').isHidden(),'changing counting mode restarts current lesson with appropriate controls');
  for(const [id,type] of [['numsnack','ns'],['dinopicnic','dp']]){await go(id);await ready(type);check(await page.locator('#'+type+'Undo').isHidden()&&await page.locator('#'+type+'Feed').isHidden(),'Help count keeps automatic feeding without manual take-back controls');await replay(type);}
  await go('photos');await page.waitForFunction(()=>document.querySelectorAll('#pgrid button').length>=2);
  const tile=page.locator('#pgrid button').first();await tile.dispatchEvent('pointerdown',{pointerId:31,clientX:60,clientY:120});await page.locator('#pgrid').dispatchEvent('scroll');await tile.dispatchEvent('pointerup',{pointerId:31,clientX:60,clientY:120});check(await page.locator('#viewer').isHidden(),'gallery scrolling cancels thumbnail activation');
  await tile.focus();await page.keyboard.press('Enter');check(await page.locator('#viewer').isVisible()&&await page.locator('#pgrid').evaluate(el=>el.inert),'keyboard opens viewer and makes covered thumbnails inert');
  const total=await page.locator('#pgrid button').count();check(await page.locator('#vCount').textContent()==='1 / '+total,'viewer shows photo position');
  await page.keyboard.press('ArrowRight');check(await page.locator('#vCount').textContent()==='2 / '+total,'Right arrow advances one photo');
  await page.keyboard.press('End');check(await page.locator('#vCount').textContent()===total+' / '+total,'End selects final photo');
  await page.keyboard.press('ArrowRight');check(await page.locator('#vCount').textContent()==='1 / '+total,'photo navigation wraps');
  await page.keyboard.press('ArrowLeft');check(await page.locator('#vCount').textContent()===total+' / '+total,'Left arrow wraps backwards');await page.keyboard.press('Home');
  check((await page.locator('#vimg').getAttribute('alt')).length>0,'photo has a descriptive accessible label');
  await page.screenshot({path:path.join(root,'tests/screenshots/play-photos-'+label+'.png')});
  await page.keyboard.press('Escape');check(await page.locator('#viewer').isHidden()&&await tile.evaluate(el=>el===document.activeElement)&&!(await page.locator('#pgrid').evaluate(el=>el.inert)),'Escape returns focus to selected thumbnail and enables gallery');
  check(errors.length===0,'no script errors: '+errors.join('; '));await context.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
