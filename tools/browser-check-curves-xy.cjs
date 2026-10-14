'use strict';
const {chromium}=require(process.env.JIGOU_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,out=path.join(root,'tmp/curves-xy');
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
(async()=>{
  fs.mkdirSync(out,{recursive:true});const port=process.env.JIGOU_TEST_PORT||'4183';
  const server=spawn(process.execPath,[path.join(root,'tools/server.cjs')],{cwd:root,env:{...process.env,JIGOU_PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});process.on('exit',()=>server.kill());
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('服务器启动超时')),5000);server.once('error',reject);server.stderr.once('data',x=>reject(Error(String(x))));server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
  const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1024},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function pick(key){await page.locator('#examples-btn').click();await page.locator(`[data-example="${key}"]`).click();if(await page.locator('#action-dialog').isVisible())await page.locator('#action-dialog [value="ok"]').click();}
  async function curves(){await page.locator('#curves-btn').click();await page.waitForFunction(()=>document.querySelector('#curve-status').textContent.includes('已计算'));}
  async function select(ids){for(const element of await page.locator('[data-curve-point]').all())await element.uncheck();for(const id of ids)await page.locator(`[data-curve-point="${id}"]`).check();}
  async function exportFile(button,name){await page.locator('#curve-export-open').click();const download=page.waitForEvent('download');await page.locator(button).click();const file=path.join(out,name);await(await download).saveAs(file);assert.ok(await page.locator('#curves-dialog').isVisible());return file;}
  async function hover(id,fraction=.25){const point=await page.locator(`[data-curve="${id}"]`).evaluate((e,t)=>{const p=e.getPointAtLength(e.getTotalLength()*t),q=new DOMPoint(p.x,p.y).matrixTransform(e.getScreenCTM());return{x:q.x,y:q.y};},fraction);await page.mouse.move(point.x,point.y);assert.ok(await page.locator('#curve-tooltip').isVisible());return page.locator('#curve-tooltip').textContent();}
  async function screenshot(name){await page.mouse.move(10,10);await page.locator('#toast').evaluate(e=>{e.style.transition='none';e.classList.remove('visible');});await page.screenshot({path:path.join(root,`docs/界面预览_${name}_${version}.png`),fullPage:true});}
  try{
    await page.goto(`http://127.0.0.1:${port}/${process.env.JIGOU_TEST_PAGE||''}?qa=1`);assert.equal(await page.locator('.version').textContent(),version);
    await pick('slider');await curves();await select(['B','C']);await page.locator('[data-curve-preset="xy"]').click();
    assert.equal(await page.locator('#curve-x').inputValue(),'x');assert.equal(await page.locator('#curve-y').inputValue(),'y');assert.equal(await page.locator('[data-curve]').count(),2);assert.ok((await page.locator('#curve-plot').textContent()).includes('X 坐标 / mm'));assert.ok((await page.locator('#curve-status').textContent()).includes('相同的长度比例'));
    const tooltip=await hover('B');assert.ok(tooltip.includes('B：X')&&tooltip.includes('C：X')&&tooltip.includes('Y ')&&tooltip.includes('时间'));assert.equal(await page.locator('[data-curve-marker]').count(),2);await screenshot('XY轨迹对比');
    const csv=fs.readFileSync(await exportFile('#curve-csv-btn','曲柄滑块_XY轨迹.csv'),'utf8'),rows=csv.split('\r\n'),first=rows[1].split(',').map(Number),a=40*Math.PI/180;
    assert.ok(rows[0].includes('"B_X_mm","B_Y_mm","C_X_mm","C_Y_mm"'));assert.equal(rows.length,362);near(first[0],40);near(first[3],45*Math.cos(a));near(first[4],45*Math.sin(a));near(first[5],45*Math.cos(a)+Math.sqrt(155**2-(45*Math.sin(a))**2));near(first[6],0);
    fs.writeFileSync(path.join(root,`output/csv/曲柄滑块_XY轨迹_${version}.csv`),csv);
    const xyPDF=await exportFile('#curve-pdf-btn','曲柄滑块_XY轨迹对比.pdf');assert.equal(fs.readFileSync(xyPDF).subarray(0,5).toString(),'%PDF-');fs.copyFileSync(xyPDF,path.join(root,`output/pdf/曲柄滑块_XY轨迹对比_${version}.pdf`));
    await page.locator('#curve-y').selectOption('vx');assert.equal(await page.locator('[data-curve-preset="xy"]').getAttribute('aria-pressed'),'false');await page.locator('#curve-x').selectOption('angle');await page.locator('#curve-x').selectOption('x');assert.equal(await page.locator('#curve-y').inputValue(),'y');await page.locator('#curves-done').click();
    await pick('attached');await curves();await select(['B','T2']);await page.locator('[data-curve-preset="components"]').click();
    assert.equal(await page.locator('#curve-y').inputValue(),'components');assert.equal(await page.locator('[data-curve]').count(),4);assert.equal(await page.locator('[data-curve][stroke-dasharray="7 4"]').count(),2);
    const velocityTip=await hover('B-vx');assert.ok(velocityTip.includes('B · Vx')&&velocityTip.includes('B · Vy')&&velocityTip.includes('mm/s'));await screenshot('分速度对比');
    const velocityCSV=fs.readFileSync(await exportFile('#curve-csv-btn','两个节点的分速度.csv'),'utf8'),vrows=velocityCSV.split('\r\n');assert.ok(vrows[0].includes('Vx')&&vrows[0].includes('Vy'));assert.equal(vrows[1].split(',').length,5);
    const at90=vrows.find(row=>row.startsWith('90.000000,'));assert.ok(at90);const values=at90.split(',').map(Number);near(values[1],-45*12*Math.PI/30);near(values[2],0);
    fs.writeFileSync(path.join(root,`output/csv/节点分速度对比_${version}.csv`),velocityCSV);
    await select(['B','C','D','T1','T2','T3']);assert.equal(await page.locator('[data-curve]').count(),12);await page.locator('[data-curve-point="A"]').click();assert.equal(await page.locator('[data-curve-point="A"]').isChecked(),false);assert.equal(await page.locator('[data-curve]').count(),12);await screenshot('分速度_六节点');
    const componentPDF=await exportFile('#curve-pdf-btn','六节点分速度对比.pdf');assert.equal(fs.readFileSync(componentPDF).subarray(0,5).toString(),'%PDF-');fs.copyFileSync(componentPDF,path.join(root,`output/pdf/六节点分速度对比_${version}.pdf`));
    await page.locator('#curve-x').selectOption('time');assert.ok((await page.locator('#curve-plot').textContent()).includes('时间 / s'));await page.locator('#curves-done').click();
    await pick('planetary');await curves();await select(['P','B']);await page.locator('[data-curve-preset="xy"]').click();assert.ok((await page.locator('#curve-status').textContent()).includes('输入 3 周'));const planetary=fs.readFileSync(await exportFile('#curve-csv-btn','行星轮系_XY轨迹.csv'),'utf8').split('\r\n');assert.equal(planetary.length,1082);const p0=planetary[1].split(',').map(Number),pn=planetary.at(-1).split(',').map(Number);for(let i=3;i<7;i++)near(p0[i],pn[i]);near(pn[2],6);await page.locator('#curves-done').click();
    await pick('slider');await page.locator('#rpm-input').fill('0');await page.locator('#rpm-input').press('Enter');await curves();await select(['B','C']);await page.locator('[data-curve-preset="xy"]').click();assert.equal(await page.locator('#curve-export-open').isDisabled(),false);assert.equal(await page.locator('[data-curve]').count(),2);await page.locator('#curves-done').click();
    await pick('attached');await curves();await select(['B','T2']);
    for(const width of [390,320]){
      await page.setViewportSize({width,height:1000});await page.locator('[data-curve-preset="xy"]').click();assert.ok(await page.locator('#curve-plot').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await hover('B');assert.ok((await page.locator('#curve-tooltip').textContent()).includes('Y '));
      await page.locator('[data-curve-preset="components"]').click();assert.equal(await page.locator('[data-curve]').count(),4);await hover('B-vx');assert.ok((await page.locator('#curve-tooltip').textContent()).includes('Vy'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390)await screenshot('分速度对比_手机');
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: XY presets/axis switching/phase order/multi-node hover and coordinate CSV/PDF, paired signed Vx/Vy with solid/dashed lines, 6-node/12-line export, 3-turn planetary closure, zero-RPM geometry, 390/320 px layouts.');
  }catch(e){console.log(await page.evaluate(()=>({toast:document.querySelector('#toast').textContent,curve:document.querySelector('#curve-status').textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id)})));await page.screenshot({path:path.join(out,'检查失败.png')});throw e;}finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
