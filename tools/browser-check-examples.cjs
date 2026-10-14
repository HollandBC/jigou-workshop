'use strict';
const version=require('../package.json').version;
const {chromium}=require(process.env.JIGOU_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/examples');
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const port=process.env.JIGOU_TEST_PORT||'4174',server=require('node:child_process').spawn(process.execPath,[path.join(root,'tools/server.cjs')],{cwd:root,env:{...process.env,JIGOU_PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
  process.on('exit',()=>server.kill());
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('本机测试服务器启动超时')),5000);server.once('error',reject);server.stderr.once('data',data=>reject(new Error(String(data))));server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
  const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1024},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  async function pick(kind){await page.locator('#examples-btn').click();await page.locator(`[data-example="${kind}"]`).click();await page.locator('#examples-dialog').waitFor({state:'hidden'});}
  async function exportCase(name){await page.locator('#export-btn').click();const pending=page.waitForEvent('download');await page.locator('#save-btn').click();const file=path.join(out,name);await(await pending).saveAs(file);return file;}
  try{
    await page.goto(`http://127.0.0.1:${port}/${process.env.JIGOU_TEST_PAGE||''}?qa=1`);
    assert.equal(await page.locator('#examples-btn').count(),1);assert.equal(await page.locator('#examples-dialog').isVisible(),false);assert.equal(await page.locator('.left-panel [data-example]').count(),0);
    await page.locator('#examples-btn').click();assert.equal(await page.locator('#examples-dialog [data-example]').count(),22);await page.screenshot({path:path.join(root,`docs/界面预览_示例选择_${version}.png`),fullPage:true});
    await page.keyboard.press('Escape');assert.equal(await page.locator('#examples-dialog').isVisible(),false);await page.locator('#examples-btn').click();await page.locator('#examples-close').click();assert.equal(await page.locator('#examples-dialog').isVisible(),false);
    for(const [kind,name] of [['slider','曲柄滑块'],['multi','多杆轨迹机构'],['attached','杆上点与伸出杆'],['fourbar','曲柄摇杆'],['jansen','Jansen 行走机构']]){await pick(kind);assert.equal(await page.locator('#document-name').textContent(),name);assert.ok(await page.locator('#examples-btn').evaluate(el=>el===document.activeElement));}
    assert.equal(await page.locator('#node-stat').textContent(),'8');assert.equal(await page.locator('#link-stat').textContent(),'11');assert.equal(await page.locator('#dof-stat').textContent(),'1');assert.equal(await page.locator('#speed-node').inputValue(),'H');
    assert.ok(await page.locator('#mobility-expression').textContent()==='3 × 7 − 2 × 10 − 0 = 1');
    await page.locator('#play-btn').click();await page.waitForFunction(()=>Number(document.querySelector('#angle-input').value)>45);await page.locator('#examples-btn').click();assert.equal(await page.locator('#play-btn').textContent(),'运行仿真');await page.keyboard.press('Escape');
    await page.locator('#reset-btn').click();await page.locator('#trace-cycle-btn').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已绘制一周轨迹'));assert.ok(await page.locator('#stage path[opacity=".85"]').count()>0);
    for(const [metric,unit] of [['speed','mm/s'],['acceleration','mm/s²'],['angular','rad/s']]){await page.locator('#motion-metric').selectOption(metric);assert.equal(await page.locator('#reading-unit').textContent(),unit);assert.notEqual(await page.locator('#speed-value').textContent(),'—');}
    await page.locator('#motion-metric').selectOption('speed');await page.locator('#fit-btn').click();await page.mouse.move(15,15);await page.screenshot({path:path.join(root,`docs/界面预览_Jansen_${version}.png`),fullPage:true});
    const file=await exportCase('Jansen分享案例.json'),saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.nodes.length,8);assert.equal(saved.links.length,11);assert.equal(saved.nodes.find(n=>n.id==='H').trace,true);assert.equal(saved.case.restoreTraces,true);
    await pick('slider');await page.locator('#file-input').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('机构已导入'));assert.equal(await page.locator('#document-name').textContent(),'Jansen 行走机构');assert.ok(await page.locator('#stage path[opacity=".85"]').count()>0);
    await page.locator('[data-list="links"]').click();await page.locator('[data-part="L5"]').click();await page.locator('[data-property="length"]').fill('51');await page.locator('[data-property="length"]').press('Enter');
    await page.locator('#examples-btn').click();await page.locator('[data-example="slider"]').click();await page.locator('#action-dialog').waitFor({state:'visible'});await page.locator('#action-dialog [value="cancel"]').click();await page.locator('#examples-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#document-name').textContent(),'Jansen 行走机构');await page.keyboard.press('Escape');await page.locator('#undo-btn').click();
    await exportCase('撤销后案例.json');
    console.log('PASS: single examples button, 22 cases, Escape/close/focus, Jansen simulation and motion metrics, editable lengths, sharing and cancelled switches');
    for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('#examples-btn').isVisible());assert.ok(await page.locator('#open-btn').isVisible());assert.ok(await page.locator('#export-btn').isVisible());const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,parts:[...document.querySelectorAll('.app-header,.editor-panel,.editor-toolbar,.tool-group,.transport-row,.rpm-control,.angle-row,.right-panel')].map(e=>({element:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))}));if(layout.scroll>layout.width)console.log(layout);assert.ok(layout.scroll<=layout.width);await page.locator('#examples-btn').click();assert.ok(await page.locator('[data-example="jansen"]').isVisible());await page.locator('[data-example="jansen"]').click();await page.locator('#examples-dialog').waitFor({state:'hidden'});}
    assert.deepEqual(errors,[]);console.log('PASS: mobile 390/320 px example picker and file sharing remain accessible; no page errors');
  }catch(e){await page.screenshot({path:path.join(out,'浏览器检查失败.png'),fullPage:true});throw e;}finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
