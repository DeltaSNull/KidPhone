/* Earned partial paintings survive player changes; missions retain the call deadline. */
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,webkit}=require('playwright');
(async()=>{
  const browser=await(process.argv.includes('--webkit')?webkit:chromium).launch();
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    await page.addInitScript(()=>localStorage.setItem('toyphone.settings',JSON.stringify({incoming:false,camera:'pretend',tilt:'off'})));
    await page.goto('file://'+path.join(process.env.SOCIAL_ROOT||path.resolve(__dirname,'..'),'index.html'));
    await page.waitForFunction(()=>window.__toyPhone);
    const go=id=>page.evaluate(id=>window.__toyPhone.go(id),id);
    const click=s=>page.locator(s).dispatchEvent('click',{detail:0});
    await go('paintpals');await click('#paintpals [data-n="2"]');
    await page.locator('.pp-side').first().evaluate(el=>{
      const r=el.querySelector('canvas').getBoundingClientRect();let id=100;
      for(let y=r.top;y<r.bottom;y+=5){
        el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,clientX:r.left,clientY:y,bubbles:true}));
        el.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,clientX:r.right,clientY:y,bubbles:true}));
        el.dispatchEvent(new PointerEvent('pointerup',{pointerId:id++,bubbles:true}));
      }
    });
    assert.deepEqual(await page.evaluate(()=>window.__toyPhone.paint().done),[true,false]);
    await go('home');await go('paintpals');await click('#paintpals [data-n="1"]');
    assert.equal(await page.evaluate(()=>window.__toyPhone.paint().gallery),1,'completed first player picture is preserved');
    await go('home');await go('paintpals');await click('#paintpals [data-n="2"]');
    assert.equal(await page.evaluate(()=>window.__toyPhone.paint().gallery),1,'no duplicate picture');
    await page.clock.install();await go('phone');await click('#contacts button:first-child');
    await page.clock.runFor(6000);assert.equal(await page.evaluate(()=>window.__toyPhone.call()),'talking');
    await click('#friendMission');await page.clock.fastForward(190000);
    assert.notEqual(await page.evaluate(()=>window.__toyPhone.call()),'talking','mission retains the three-minute limit');
    console.log('PASS painting preservation and mission deadline');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
