'use strict';
const {chromium}=require(process.env.JIGOU_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const near=(a,b,t=.11)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
(async()=>{
  const port=process.env.JIGOU_TEST_PORT||'4182';
  const server=spawn(process.execPath,[path.join(root,'tools/server.cjs')],{cwd:root,env:{...process.env,JIGOU_PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
  process.on('exit',()=>server.kill());
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('服务器启动超时')),5000);server.once('error',reject);server.stderr.once('data',x=>reject(Error(String(x))));server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1024},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Advance the app's RAF queue deterministically; no timing hooks enter production code.
  await page.addInitScript(()=>{
    let clock=1000,next=1;const frames=new Map();
    window.requestAnimationFrame=callback=>{const id=next++;frames.set(id,callback);return id;};
    window.cancelAnimationFrame=id=>frames.delete(id);
    window.__advancePlayback=(count,dt=16)=>{for(let i=0;i<count;i++){clock+=dt;const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(clock);}};
  });
  const angle=async()=>Number(await page.locator('#angle-input').inputValue());
  const running=async()=>assert.match(await page.locator('#play-btn').textContent(),/暂停仿真/);
  const advance=async(count,dt=16)=>page.evaluate(([n,d])=>window.__advancePlayback(n,d),[count,dt]);
  const rate=async value=>page.locator('#playback-rate').evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  async function pick(key){await page.locator('#examples-btn').click();await page.locator(`[data-example="${key}"]`).click();if(await page.locator('#action-dialog').isVisible())await page.locator('#action-dialog [value="ok"]').click();}
  async function rpm(value){await page.locator('#rpm-input').fill(String(value));await page.locator('#rpm-input').press('Enter');}
  async function csv(){await page.locator('#export-btn').click();const download=page.waitForEvent('download');await page.locator('#csv-btn').click();const file=await(await download).path();return fs.readFileSync(file,'utf8');}
  try{
    await page.goto(`http://127.0.0.1:${port}/${process.env.JIGOU_TEST_PAGE||''}?qa=1`);
    assert.equal(await page.locator('.version').textContent(),version);
    assert.equal(await page.locator('#playback-rate-value').textContent(),'1×');
    await rate(.25);assert.equal(await page.locator('#playback-rate-value').textContent(),'0.25×');
    const start=await angle();await page.locator('#play-btn').click();await advance(11);near(await angle()-start,12*6*.16*.25);await running();
    // Change the rate during playback without changing phase, direction or RPM.
    const slow=await angle();await rate(4);near(await angle(),slow,0);await running();await advance(10);near(await angle()-slow,12*6*.16*4);assert.equal(await page.locator('#rpm-input').inputValue(),'12');
    const fast=await angle();await page.locator('#playback-reset').click();near(await angle(),fast,0);await running();await advance(10);near(await angle()-fast,12*6*.16);assert.equal(await page.locator('#playback-rate-value').textContent(),'1×');
    await page.locator('#play-btn').click();const stopped=await angle();await advance(100);near(await angle(),stopped,0);
    // Resume after a long paused interval: first frame must not jump forward.
    await page.locator('#play-btn').click();await advance(1,10000);near(await angle(),stopped,0);await advance(1);near(await angle()-stopped,12*6*.016);await page.locator('#play-btn').click();
    // Playback settings leave the real instantaneous readings and exported data intact.
    await pick('flapping');await page.locator('#reset-btn').click();await rate(.1);
    const physical=await page.locator('#speed-value').textContent(),slowCSV=await csv();
    await rate(4);assert.equal(await page.locator('#speed-value').textContent(),physical);assert.equal(await csv(),slowCSV);assert.equal(await page.locator('#rpm-input').inputValue(),'30');
    // The preference persists across examples and a fresh page, separate from the model.
    await rate(.25);await page.reload();assert.equal(await page.locator('#playback-rate-value').textContent(),'0.25×');await pick('fourbar');assert.equal(await page.locator('#playback-rate-value').textContent(),'0.25×');
    await rpm(-12);const reverse=await angle();await page.locator('#play-btn').click();await advance(11);near(await angle()-reverse,-12*6*.16*.25);await running();await page.locator('#play-btn').click();
    await rpm(0);await page.locator('#play-btn').click();assert.match(await page.locator('#play-btn').textContent(),/运行仿真/);assert.match(await page.locator('#toast').textContent(),/非零/);
    // A complete double-rocker swing respects its angle bounds at high playback rate.
    await pick('doublerocker');await rate(4);await page.locator('#play-btn').click();
    const bounds=await page.evaluate(()=>[Number(document.querySelector('#swing-min').value),Number(document.querySelector('#swing-max').value)]);
    let low=Infinity,high=-Infinity;for(let i=0;i<80;i++){await advance(5);const a=await angle();low=Math.min(low,a);high=Math.max(high,a);assert.ok(a>=bounds[0]-.1&&a<=bounds[1]+.1);}
    assert.ok(low<bounds[0]+1&&high>bounds[1]-1);await running();await page.locator('#play-btn').click();
    await pick('flapping');await rate(.25);await page.locator('#fit-btn').click();await page.locator('#play-btn').click();await advance(8);await page.mouse.move(15,15);
    await page.locator('#toast').evaluate(e=>{e.style.transition='none';e.classList.remove('visible');});
    await page.screenshot({path:path.join(root,`docs/界面预览_仿真调速_${version}.png`),fullPage:true});await page.locator('#play-btn').click();
    for(const width of [390,320]){
      await page.setViewportSize({width,height:1000});await page.locator('#fit-btn').click();await rate(.5);
      const dims=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert.ok(dims.document<=width&&dims.body<=width,JSON.stringify(dims));
      assert.ok(await page.locator('#playback-rate').isVisible());await page.locator('#play-btn').click();await advance(5);await running();await page.locator('#play-btn').click();
      if(width===390)await page.screenshot({path:path.join(root,`docs/界面预览_仿真调速_手机_${version}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1440,height:1024});
    await page.locator('#new-btn').click();if(await page.locator('#action-dialog').isVisible())await page.locator('#action-dialog [value="ok"]').click();assert.ok(await page.locator('#playback-rate').isDisabled());assert.ok(await page.locator('#playback-reset').isDisabled());
    // Also drag the native range control while the real browser clock is running.
    const live=await browser.newPage({viewport:{width:1440,height:1024}});live.on('pageerror',e=>errors.push(e.message));
    await live.goto(`http://127.0.0.1:${port}/${process.env.JIGOU_TEST_PAGE||''}?qa=1`);await live.locator('#play-btn').click();
    const box=await live.locator('#playback-rate').boundingBox();await live.mouse.move(box.x+box.width*.3,box.y+box.height/2);await live.mouse.down();await live.mouse.move(box.x+box.width*.8,box.y+box.height/2,{steps:8});await live.mouse.up();
    assert.ok(Number(await live.locator('#playback-rate').inputValue())>3);assert.match(await live.locator('#play-btn').textContent(),/暂停仿真/);
    const actual=Number(await live.locator('#angle-input').inputValue());await live.waitForFunction(a=>Number(document.querySelector('#angle-input').value)!==a,actual,{timeout:3000});
    await live.locator('#playback-reset').click();assert.equal(await live.locator('#playback-rate-value').textContent(),'1×');assert.match(await live.locator('#play-btn').textContent(),/暂停仿真/);await live.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: 0.1–4x live playback, exact elapsed-time progression, native slider dragging during real playback, 1x reset, pause/resume, reverse/zero RPM, swing bounds, unchanged physical CSV/readings, preference persistence, no-motor state, 390/320 px layouts.');
  }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
