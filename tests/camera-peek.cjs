/* Real canvas pixels must stay behind cover; hidden animals must not earn photo credit.
   Test-only access is injected into the served script, never into the shipped app. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),wk=process.argv.includes('--webkit');
const probe=`window.__cameraProbe={SCENES,pose,drawAnimal,inShot,snapshot,AP,A,renderScene,
 photo:()=>Photos.list[0], aim:(phase)=>{stopPretend();const a=SCENES.savanna.animals.find(a=>a.n==='hippo');
 cam.scene='savanna';cam.x=a.x-vfW/camScale()/2;cam.y=a.hideBelow-vfH/camScale()/2;
 performance.now=()=>((2+phase-a.phase)*a.period)*1000;
 renderScene(vg,SCENES.savanna,cam.x,cam.y,camScale()*dpr,vfc.width,vfc.height,performance.now()/1000);}};`;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('window.__toyPhone = {',probe+'\nwindow.__toyPhone = {');
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/KidPhone/,'')||'/';
 const file=path.join(root,rel==='/'?'index.html':rel);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'application/octet-stream');
 if(file===path.join(root,'index.html'))res.end(html);else fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await(wk?webkit:chromium).launch();
 try{
 for(const [label,width,height] of [['portrait',390,844],['landscape',844,390],['safari-bars',390,664]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
  await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await context.route('https://fonts.gstatic.com/**',r=>r.abort());
  await context.addInitScript(()=>localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',look:'drag',tilt:'touch'})));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/KidPhone/`);await page.waitForFunction(()=>window.__cameraProbe);
  const results=await page.evaluate(()=>{
   const {SCENES,pose,drawAnimal,inShot,AP,A,renderScene}=window.__cameraProbe,out=[];
   for(const [scene,sc] of Object.entries(SCENES))for(const a of sc.animals.filter(a=>a.m==='peek')){
    let hidden=0,exposed=0,leaks=0,hiddenCredit=0,visibleCredit=0;
    const c=document.createElement('canvas');c.width=640;c.height=400;const g=c.getContext('2d');
    for(let i=0;i<80;i++){
     const t=(((i/80-a.phase)+1)%1)*a.period;
     g.clearRect(0,0,c.width,c.height);drawAnimal(g,a,pose(a,t),0,0);
     const d=g.getImageData(0,0,c.width,c.height).data;let pixels=0;
     for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]){
      pixels++;if(y>=Math.round(A(a.hideBelow)))leaks++;
     }
     const captured=inShot(sc,0,0,3200,2000,t).some(x=>x.n===a.n);
     if(pixels===0){hidden++;if(captured)hiddenCredit++;}
     if(pixels>0){exposed++;if(captured)visibleCredit++;}
    }
    const sceneDifference=p=>{
     const t=(((p-a.phase)+1)%1)*a.period,cv=document.createElement('canvas');cv.width=240;cv.height=180;
     const ctx=cv.getContext('2d'),x=a.x-200,y=a.hideBelow-220;
     renderScene(ctx,sc,x,y,.6,240,180,t);const actual=ctx.getImageData(0,0,240,180).data;
     const items=sc.items;try{sc.items=items.filter(it=>it.a!==a);renderScene(ctx,sc,x,y,.6,240,180,t);}finally{sc.items=items;}
     const without=ctx.getImageData(0,0,240,180).data;let changed=0;
     for(let i=0;i<actual.length;i+=4)if(actual[i]!==without[i]||actual[i+1]!==without[i+1]||actual[i+2]!==without[i+2])changed++;
     return changed;
    };
    out.push({scene,name:a.n,hidden,exposed,leaks,hiddenCredit,visibleCredit,hiddenScene:sceneDifference(.04),visibleScene:sceneDifference(.54)});
   }return out;
  });
  for(const r of results){
   if(process.env.PEEK_ONLY!=='hide')assert.equal(r.leaks,0,`${label} ${r.name}: no pixels escape below cover`);
   if(process.env.PEEK_ONLY!=='clip'){
    assert.ok(r.hidden>=12,`${label} ${r.name}: fully hidden for a meaningful pause (${r.hidden}/80 frames)`);
    assert.ok(r.exposed>=20&&r.visibleCredit>=20,`${label} ${r.name}: pops out long enough to photograph ${JSON.stringify(r)}`);
    assert.equal(r.hiddenCredit,0,`${label} ${r.name}: invisible animals receive no photo credit`);
    assert.equal(r.hiddenScene,0,`${label} ${r.name}: hidden animal leaves no pixels in the finished scene`);
    const minimumVisible={'zebra':1200,'baby dinosaur':600}[r.name]||20;
    assert.ok(r.visibleScene>=minimumVisible,`${label} ${r.name}: popped-out animal has enough visible picture area to recognize (${r.visibleScene})`);
   }
   console.log('ok '+label+' '+r.scene+' '+r.name+' '+JSON.stringify(r));
  }
  fs.mkdirSync(path.join(root,'tests/screenshots'),{recursive:true});
  if(label==='portrait'){
   const sheets=await page.evaluate(()=>{
    const {SCENES,renderScene}=window.__cameraProbe,out={};
    for(const [scene,sc] of Object.entries(SCENES)){
     const animals=sc.animals.filter(a=>a.m==='peek'),sheet=document.createElement('canvas');sheet.width=640;sheet.height=animals.length*260;
     const g=sheet.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,sheet.width,sheet.height);
     animals.forEach((a,i)=>[.04,.54].forEach((p,j)=>{
      const c=document.createElement('canvas');c.width=320;c.height=240;
      renderScene(c.getContext('2d'),sc,a.x-200,a.hideBelow-220,.8,320,240,((p-a.phase+1)%1)*a.period);
      g.drawImage(c,j*320,i*260+20);g.fillStyle='#000';g.font='14px sans-serif';g.fillText(a.n+(j?' — popped out':' — hidden'),j*320+8,i*260+15);
     }));out[scene]=sheet.toDataURL('image/png');
    }return out;
   });
   for(const [scene,src] of Object.entries(sheets))fs.writeFileSync(path.join(root,`tests/screenshots/camera-peek-${scene}.png`),Buffer.from(src.split(',')[1],'base64'));
  }
  await page.evaluate(()=>window.__toyPhone.go('camera'));await page.waitForTimeout(400);
  await page.evaluate(()=>window.__cameraProbe.aim(.04));await page.locator('#shutter').tap();
  let photo=await page.evaluate(()=>window.__cameraProbe.photo());
  assert.ok(photo&&!photo.names.includes('hippo'),label+': shutter saves a photo without crediting the hidden hippo');
  const oldId=photo.id;
  await page.evaluate(()=>window.__cameraProbe.aim(.54));await page.locator('#shutter').tap();
  photo=await page.evaluate(()=>window.__cameraProbe.photo());
  assert.ok(photo&&photo.id!==oldId&&photo.names.includes('hippo'),label+': shutter captures and names the popped-out hippo');
  console.log('ok '+label+': actual shutter distinguishes hidden and popped-out hippo');
  assert.equal(errors.length,0,label+': no script errors');await context.close();
 }
 console.log('Camera peek checks passed ('+(wk?'webkit':'chromium')+').');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
