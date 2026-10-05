/* Shared activation, scroll safety and settings navigation: Chromium and WebKit. */
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
 for(const [label,width,height] of [['portrait',390,844],['landscape',844,390],['safari-bars',390,664]]){
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
  await page.locator('.appicon[data-app="school"]').focus();await page.keyboard.press('Enter');
  check(await page.locator('#school').isVisible(),'keyboard opens a home app');
  await page.locator('#clock').focus();await page.keyboard.down('Enter');await page.waitForTimeout(200);await page.keyboard.up('Enter');await page.waitForTimeout(3100);
  check(!(await page.locator('#settings').isVisible()),'short keyboard clock press does not open settings');
  await hold();check(await page.locator('#doneBtn').evaluate(el=>el===document.activeElement),'long keyboard hold opens and focuses settings');
  for(const [jump,target] of [['settingsSound','settingsSound'],['settingsSchool','settingsSchool'],['settingsTools','settingsTools'],['settingsAccess','settingsAccess']]){
   await tap(`[data-settings-jump="${jump}"]`);
   check(await page.evaluate(id=>{const t=document.getElementById(id).getBoundingClientRect(),h=document.querySelector('#settings .shead').getBoundingClientRect(),s=document.querySelector('#settings .sheet').getBoundingClientRect();return t.top>=h.bottom-2&&t.top<s.bottom;},target),'shortcut reveals '+target+' below sticky header');
  }
  await tap('[data-settings-jump="settingsSound"]');
  const vol=page.locator('[data-vol="3"]'),value=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('toyphone.settings')).vol);
  const event=(type,extra={})=>vol.dispatchEvent(type,{pointerId:9,clientX:100,clientY:200,...extra});
  await event('pointerdown');check(await value()===1,'touch-down does not change settings');await event('pointermove',{clientY:240});await event('pointerup',{clientY:240});check(await value()===1,'scroll gesture does not change settings');
  await event('pointerdown');await event('pointercancel');await event('pointerup');check(await value()===1,'canceled gesture does not change settings');
  await event('pointerdown');await page.locator('#settings .sheet').dispatchEvent('scroll');await event('pointerup');check(await value()===1,'scroll event cancels pending setting tap');
  await tap('[data-vol="3"]');check(await value()===3&&await vol.getAttribute('aria-pressed')==='true','normal touch saves and announces selection');
  await page.locator('[data-vol="2"]').focus();await page.keyboard.press('Space');check(await value()===2,'keyboard changes a setting');
  // A non-idempotent toggle catches duplicate pointer/click activation.
  await tap('[data-settings-jump="settingsAccess"]');await tap('[data-access="custom"]');await tap('[data-allow="games"]');
  check(await page.locator('[data-allow="games"]').getAttribute('aria-checked')==='false','one physical tap toggles exactly once');
  await tap('[data-access="full"]');
  await tap('[data-settings-jump="settingsTools"]');await page.keyboard.press('Escape');check(await page.locator('#clock').evaluate(el=>el===document.activeElement),'Escape closes settings and restores clock focus');
  await hold();check(await page.locator('#settings .sheet').evaluate(el=>el.scrollTop)===0,'reopening resets settings to the top');
  await page.locator('#doneBtn').focus();await page.keyboard.press('Shift+Tab');check(await page.locator('#settings').evaluate(el=>el.contains(document.activeElement)&&document.activeElement.id!=='doneBtn'),'Shift+Tab wraps within settings');await page.keyboard.press('Tab');check(await page.locator('#doneBtn').evaluate(el=>el===document.activeElement),'Tab wraps to Done');
  // The sticky header must not cover scrollIntoView/focus targets (regression found by short-screen smoke).
  for(const selector of ['[data-vol="3"]','[data-incoming="1"]','[data-incoming="0"]','[data-silent="0"]','[data-silent="1"]']){
   const button=page.locator(selector).first();await button.evaluate(el=>el.scrollIntoView({block:'nearest'}));
   check(await button.evaluate(el=>{const b=el.getBoundingClientRect(),h=document.querySelector('#settings .shead').getBoundingClientRect();return b.top>=h.bottom;}),'scrollIntoView clears header: '+selector);
   await button.tap();await page.waitForTimeout(160);
   check(await page.locator('#settings').isVisible(),'setting tap keeps dialog open');
  }
  await tap('[data-settings-jump="settingsAccess"]');
  fs.mkdirSync(path.join(root,'tests/screenshots'),{recursive:true});await page.screenshot({path:path.join(root,`tests/screenshots/refinement-${label}.png`)});
  await tap('#doneBtn');await page.evaluate(()=>window.__toyPhone.go('delivery'));await page.waitForTimeout(700);
  check(await page.locator('#delivery').isVisible(),'delivery opens for visual checks');
  check(await page.locator('#adReplay').evaluate(el=>getComputedStyle(el).backgroundImage!=='none'),'delivery replay has a visible button background');
  await page.screenshot({path:path.join(root,`tests/screenshots/refinement-delivery-${label}.png`)});
  await page.locator('#clock').dispatchEvent('pointerdown',{pointerId:1});await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.waitForTimeout(3300);check(!(await page.locator('#settings').isVisible()),'pagehide cancels an unfinished parent hold');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.__toyPhone.go('delivery');});
  const spoken=await page.evaluate(()=>window.__toyPhone.voice().log.length);await page.waitForTimeout(2000);
  check(await page.evaluate(n=>window.__toyPhone.voice().log.length===n,spoken),'background game timers cannot restart narration');
  check(errors.length===0,'no script errors: '+errors.join('; '));await context.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
