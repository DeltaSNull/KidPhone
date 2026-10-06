/* Audio recovery after tab/background/BFCache return, and piano sound consistency. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),wk=process.argv.includes('--webkit');
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/KidPhone/,'')||'/';
 const file=path.join(root,rel==='/'?'index.html':rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':file.endsWith('.mp3')?'audio/mpeg':'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(wk?webkit:chromium).launch();
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await context.route('https://fonts.gstatic.com/**',r=>r.abort());
 await context.addInitScript(()=>{
  localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',look:'drag',vol:1,schoolFx:'quiet'}));
  window.__audioContexts=[];window.__osc=0;window.__src=0;window.__stops=[];
  const AC=window.AudioContext||window.webkitAudioContext,osc=AC.prototype.createOscillator,src=AC.prototype.createBufferSource;
  AC.prototype.createOscillator=function(){if(!window.__audioContexts.includes(this))window.__audioContexts.push(this);window.__osc++;const o=osc.call(this),stop=o.stop.bind(o);o.stop=t=>{window.__stops.push(t-this.currentTime);stop(t);};return o;};
  AC.prototype.createBufferSource=function(){if(!window.__audioContexts.includes(this))window.__audioContexts.push(this);window.__src++;return src.call(this);};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(v,msg)=>{assert.ok(v,msg);console.log('ok '+msg);},tap=async s=>{await page.locator(s).first().tap();await page.waitForTimeout(160);};
 await page.goto(`http://127.0.0.1:${server.address().port}/KidPhone/`);await page.waitForFunction(()=>window.__toyPhone?.recorded().includes('quack')&&window.__toyPhone.voice().loaded);
 await page.evaluate(()=>window.__toyPhone.go('music'));await tap('[data-mtab="piano"]');
 for(let i=0;i<8;i++){
  const before=await page.evaluate(()=>({osc:__osc,src:__src,stops:__stops.length}));await tap(`.pkey[data-i="${i}"]`);
  const after=await page.evaluate(()=>({osc:__osc,src:__src,stops:__stops.slice(-3)}));check(after.osc>before.osc,'piano key '+i+' uses synthesized notes');
  if(i===5){check(after.src===before.src,'duck piano does not play the real-world quack clip');check(Math.max(...after.stops)<.7,'duck piano is short like its neighbors');}
 }
 const recorded=await page.evaluate(()=>window.__toyPhone.recorded().slice().sort().join(','));
 async function recover(kind){
  await page.evaluate(()=>window.__toyPhone.go('music'));await tap('[data-mtab="piano"]');await tap('.pkey[data-i="5"]');
  const before=await page.evaluate(()=>{window.__oldAudio=__audioContexts.at(-1);return window.__toyPhone.sound().rebuilds;});
  await page.evaluate(kind=>{
   if(kind==='closed'){__oldAudio.close();return;}
   if(kind==='bfcache'){window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));return;}
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
  },kind);await page.waitForTimeout(120);
  const starts=await page.evaluate(()=>__osc+__src);
  if(kind!=='closed'&&kind!=='bfcache'){
   await page.evaluate(()=>window.__toyPhone.go('nums'));await page.waitForTimeout(350);
   check(await page.evaluate(()=>__osc+__src)===starts,'background callbacks do not play or queue sound');
  }
  await page.evaluate(kind=>{
   if(kind==='frozen'){
    // Model Safari's misleading running state and a render clock that no longer advances.
    Object.defineProperty(__oldAudio,'state',{configurable:true,value:'running'});
    Object.defineProperty(__oldAudio,'currentTime',{configurable:true,value:123});
   }
   if(kind!=='closed'){
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:kind==='bfcache'}));
   }
   window.__toyPhone.go('music');
  },kind);
  await tap('[data-mtab="piano"]');await tap('.pkey[data-i="5"]');
  const recovered=await page.evaluate(()=>({different:__audioContexts.at(-1)!==__oldAudio,state:window.__toyPhone.sound().state,rebuilds:window.__toyPhone.sound().rebuilds,time:__audioContexts.at(-1).currentTime}));
  await page.waitForTimeout(120);
  check(recovered.different&&recovered.state==='running'&&recovered.rebuilds===before+1,kind+': first interaction replaces the stale engine once');
  check(await page.evaluate(t=>__audioContexts.at(-1).currentTime>t,recovered.time),kind+': recovered render clock advances');
  await tap('.pkey[data-i="5"]');check(await page.evaluate(()=>window.__toyPhone.sound().rebuilds)===recovered.rebuilds,kind+': normal taps do not rebuild again');
  check(await page.evaluate(()=>window.__toyPhone.recorded().slice().sort().join(','))===recorded,kind+': decoded recordings survive recovery');
 }
 for(const kind of ['hidden','frozen','bfcache','closed','hidden'])await recover(kind);
 await page.evaluate(()=>window.__toyPhone.go('numsnack'));await page.waitForTimeout(1200);
 check(await page.evaluate(()=>window.__toyPhone.fxLevel())===.35,'School quiet setting survives recovery');
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('toyphone.settings')).vol)===1,'parent volume selection survives recovery');
 const spokenBefore=await page.evaluate(()=>window.__toyPhone.voice().played);
 await tap('#nsReplay');await page.waitForTimeout(1800);
 check(await page.evaluate(()=>window.__toyPhone.voice().played)>spokenBefore,'recorded lesson narration still plays after recovery');
 check(errors.length===0,'no page errors '+errors.join('; '));await context.close();
 console.log('Audio return checks passed ('+(wk?'webkit':'chromium')+').');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
