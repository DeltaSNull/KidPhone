/* Call-button containment and game navigation: old animations must not alter resumed play. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),wk=process.argv.includes('--webkit');
const only=process.env.REVIEW_ONLY;
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/KidPhone/,'')||'/';
 const file=path.join(root,rel==='/'?'index.html':rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(wk?webkit:chromium).launch();
 try{
 for(const [label,width,height] of [['portrait',390,844],['landscape',844,390],['safari-bars',390,664]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
  await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.addInitScript(()=>localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',look:'drag',tilt:'touch'})));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(v,msg)=>{assert.ok(v,label+': '+msg);console.log('ok '+label+': '+msg);};
  const go=async name=>{await page.evaluate(name=>window.__toyPhone.go(name),name);await page.waitForTimeout(350);};
  const players=async(game,n=1)=>{await page.locator(`#${game} [data-n="${n}"]`).tap();await page.waitForTimeout(160);};
  await page.goto(`http://127.0.0.1:${server.address().port}/KidPhone/`);await page.waitForFunction(()=>window.__toyPhone);
  if(!only||only==='phone'){
   await go('phone');await page.locator('[data-ptab="keypad"]').tap();await page.waitForTimeout(200);
   const centered=await page.locator('#dialCall').evaluate(el=>{
    const b=el.getBoundingClientRect(),i=el.querySelector('img').getBoundingClientRect(),s=getComputedStyle(el),top=b.top+parseFloat(s.borderTopWidth),bottom=b.bottom-parseFloat(s.borderBottomWidth);
    return i.top>=top&&i.bottom<=bottom&&Math.abs((i.top+i.bottom)/2-(top+bottom)/2)<1&&Math.abs((i.left+i.right)/2-(b.left+b.right)/2)<1;
   });check(centered,'Call icon fits and is centered inside the framed button');
   fs.mkdirSync(path.join(root,'tests/screenshots'),{recursive:true});await page.screenshot({path:path.join(root,`tests/screenshots/phone-review-${label}.png`)});
   await page.locator('.key[aria-label="1"]').tap();await page.locator('#dialCall').tap();check(await page.locator('#call').isVisible(),'centered Call button still starts a call');await page.locator('#hangupBtn').tap();
  }
  if(!only||only==='dino'||only==='egg'){
   await go('dinobuddies');await players('dinobuddies');
   const side=page.locator('.db-side').first(),before=await page.evaluate(()=>window.__toyPhone.dino().fill);
   await side.dispatchEvent('pointerdown',{pointerId:1,clientX:100,clientY:100});
   await page.evaluate(()=>{window.__toyPhone.go('home');window.__toyPhone.go('dinobuddies');});await players('dinobuddies');await page.waitForTimeout(900);
   check(await page.evaluate(()=>window.__toyPhone.dino().fill)===before,'an old treat cannot fill the egg after leaving and returning');
   await side.dispatchEvent('pointerdown',{pointerId:2,clientX:100,clientY:100});await page.waitForFunction(n=>window.__toyPhone.dino().fill===n+1,before);check(true,'a new treat still lands after returning');
   const staysInNest=await page.locator('#dbEgg').evaluate(el=>{
    const animation=el.getAnimations()[0];if(!animation)return false;animation.pause();
    const nest=el.parentElement.getBoundingClientRect(),center=(nest.left+nest.right)/2;
    const fits=[0,75,175,249].every(t=>{animation.currentTime=t;const r=el.getBoundingClientRect();return Math.abs((r.left+r.right)/2-center)<=10;});animation.finish();return fits;
   });check(staysInNest,'egg wiggle stays centered over its nest throughout the animation');
  }
  if(!only||only==='hatch'){
   await go('dinobuddies');await players('dinobuddies');
   const initial=await page.evaluate(()=>window.__toyPhone.dino()),side=page.locator('.db-side').first();
   for(let i=initial.fill;i<16;i++){await side.dispatchEvent('pointerdown',{pointerId:20+i,clientX:100,clientY:100});await page.waitForTimeout(130);}
   await page.waitForFunction(()=>document.getElementById('dbEgg').classList.contains('db-gone'));
   await page.evaluate(()=>window.__toyPhone.go('home'));
   check(await page.evaluate(()=>window.__toyPhone.dino().family)===initial.family+1,'leaving a hatch keeps the earned baby immediately');
   await go('dinobuddies');await players('dinobuddies');await page.waitForTimeout(2900);
   const resumed=await page.evaluate(()=>window.__toyPhone.dino());check(resumed.fill===0&&resumed.family===initial.family+1,'hatch return has a fresh egg without duplicate rewards or old timers');
  }
  if(!only||only==='paint'){
   await go('paintpals');await players('paintpals');
   const side=page.locator('.pp-side').first(),r=await side.boundingBox();
   await side.dispatchEvent('pointerdown',{pointerId:3,clientX:r.x+22,clientY:r.y+24});const before=await page.evaluate(()=>window.__toyPhone.paint().painted[0]);
   await page.evaluate(()=>window.__toyPhone.go('home'));await page.waitForTimeout(700);
   check(await page.evaluate(()=>window.__toyPhone.paint().painted[0])===before,'leaving cancels a paint drop before it changes the picture');
   await go('paintpals');await players('paintpals');check(await page.evaluate(()=>window.__toyPhone.paint().painted[0])===before,'returning preserves the unfinished picture');
   const next=await side.boundingBox();await side.dispatchEvent('pointerdown',{pointerId:4,clientX:next.x+22,clientY:next.y+24});await page.waitForFunction(n=>window.__toyPhone.paint().painted[0]>n,before);check(true,'new paint drops work after returning');
  }
  check(errors.length===0,'no script errors '+errors.join('; '));await context.close();
 }
 console.log('Phone/game review checks passed ('+(wk?'webkit':'chromium')+').');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
