'use strict';
const version=require('../package.json').version;
const {chromium}=require(process.env.JIGOU_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tmp/cases');
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const port=process.env.JIGOU_TEST_PORT||'4174',server=require('node:child_process').spawn(process.execPath,[path.join(root,'tools/server.cjs')],{cwd:root,env:{...process.env,JIGOU_PORT:port},windowsHide:true,stdio:['ignore','pipe','pipe']});
  process.on('exit',()=>server.kill());
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('本机测试服务器启动超时')),5000);server.once('error',reject);server.stderr.once('data',data=>reject(new Error(String(data))));server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
  const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
  const context=()=>browser.newContext({viewport:{width:1440,height:1024},acceptDownloads:true});
  const url=`http://127.0.0.1:${port}/${process.env.JIGOU_TEST_PAGE||''}?qa=1`;
  async function newStudent(){const c=await context(),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);return p;}
  async function exportCase(p,name){await p.locator('#export-btn').click();const pending=p.waitForEvent('download');await p.locator('#save-btn').click();const download=await pending,file=path.join(out,name);await download.saveAs(file);assert.match(download.suggestedFilename(),/\.机构\.json$/);return {file,data:JSON.parse(fs.readFileSync(file,'utf8'))};}
  async function importCase(p,file){await p.locator('#file-input').setInputFiles(file);await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('机构已导入'));}
  let second;
  try{
    const first=await newStudent();await first.locator('#examples-btn').click();await first.locator('[data-example="attached"]').click();
    await first.locator('#rename-btn').click();await first.locator('#action-input').fill('同学甲的伸出杆练习');await first.locator('#action-dialog [value="ok"]').click();
    await first.locator('#show-grid').uncheck();await first.locator('#show-dimensions').uncheck();await first.locator('#snap-grid').uncheck();
    await first.locator('#motion-metric').selectOption('angular');await first.locator('#speed-node').selectOption('T2');
    await first.locator('#angle-input').fill('125');await first.locator('#angle-input').press('Enter');
    await first.locator('#trace-cycle-btn').click();await first.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已绘制一周轨迹'));
    const reading=await first.locator('#speed-value').textContent(),shared=await exportCase(first,'分享案例.json');
    assert.equal(shared.data.attachments.length,3);assert.equal(shared.data.case.restoreTraces,true);assert.equal(shared.data.case.angle,125);assert.equal(shared.data.case.metric,'angular');
    assert.equal(await first.locator('#case-count').textContent(),'1');await exportCase(first,'重复导出.json');assert.equal(await first.locator('#case-count').textContent(),'1');
    second=await newStudent();assert.equal(await second.locator('#case-count').textContent(),'0');await importCase(second,shared.file);
    assert.equal(await second.locator('#document-name').textContent(),'同学甲的伸出杆练习');assert.equal(await second.locator('[data-attachment]').count(),3);
    assert.equal(await second.locator('#show-grid').isChecked(),false);assert.equal(await second.locator('#show-dimensions').isChecked(),false);assert.equal(await second.locator('#snap-grid').isChecked(),false);
    assert.equal(await second.locator('#motion-metric').inputValue(),'angular');assert.equal(await second.locator('#speed-node').inputValue(),'T2');assert.equal(await second.locator('#angular-reference').inputValue(),'L2');
    assert.equal(await second.locator('#angle-input').inputValue(),'125.0');assert.equal(await second.locator('#speed-value').textContent(),reading);assert.ok(await second.locator('#stage path[opacity=".85"]').count()>0);
    assert.deepEqual((await exportCase(second,'接收者重新导出.json')).data,shared.data);
    await importCase(second,shared.file);assert.equal(await second.locator('#case-count').textContent(),'1');
    await second.reload();assert.equal(await second.locator('#case-count').textContent(),'1');await second.locator('[data-case="0"]').click();assert.equal(await second.locator('#motion-metric').inputValue(),'angular');assert.equal(await second.locator('#angle-input').inputValue(),'125.0');
    await second.locator('#step-btn').click();assert.equal(await second.locator('#angle-input').inputValue(),'127.0');
    console.log('PASS: two independent students share editable structure, attachments, driver, angle, display settings and rebuilt trajectories; library reload and deduplication');
    const invalid=JSON.parse(JSON.stringify(shared.data));invalid.case.angularReferences.T2='L1';const bad=path.join(out,'无效案例.json');fs.writeFileSync(bad,JSON.stringify(invalid));
    await second.locator('#file-input').setInputFiles(bad);await second.waitForFunction(()=>document.querySelector('#toast').textContent.includes('导入失败'));
    assert.equal(await second.locator('#angle-input').inputValue(),'127.0');assert.equal(await second.locator('[data-attachment]').count(),3);assert.equal(await second.locator('#case-count').textContent(),'1');assert.equal(await second.locator('#file-input').inputValue(),'');
    const broken=path.join(out,'错误语法.json');fs.writeFileSync(broken,'{"nodes":');await second.locator('#file-input').setInputFiles(broken);await second.waitForFunction(()=>document.querySelector('#toast').textContent.includes('导入失败'));assert.equal(await second.locator('#document-name').textContent(),shared.data.name);
    const tooLarge=path.join(out,'超大文件.json');fs.writeFileSync(tooLarge,' '.repeat(12*1024*1024+1));await second.locator('#file-input').setInputFiles(tooLarge);await second.waitForFunction(()=>document.querySelector('#toast').textContent.includes('12 MB'));assert.equal(await second.locator('#case-count').textContent(),'1');
    await second.locator('[data-tool="node"]').click();const stage=await second.locator('#stage').boundingBox();await second.mouse.click(stage.x+stage.width*.8,stage.y+stage.height*.8);assert.equal(await second.locator('#node-stat').textContent(),'5');
    await second.locator('#file-input').setInputFiles(shared.file);await second.locator('#action-dialog').waitFor({state:'visible'});await second.locator('#action-dialog [value="cancel"]').click();await second.waitForFunction(()=>!document.querySelector('#file-input').value);assert.equal(await second.locator('#node-stat').textContent(),'5');assert.equal(await second.locator('#case-count').textContent(),'1');
    await second.locator('#file-input').setInputFiles(shared.file);await second.locator('#action-dialog [value="ok"]').click();await second.waitForFunction(()=>document.querySelector('#toast').textContent.includes('机构已导入'));assert.equal(await second.locator('#node-stat').textContent(),'4');
    await second.locator('#undo-btn').click();assert.equal(await second.locator('#node-stat').textContent(),'5');await exportCase(second,'含孤立点案例.json');
    console.log('PASS: invalid JSON, invalid references and oversized imports preserve the current design; cancel and undo restore edits; isolated points remain exportable');
    await second.locator('[data-remove-case="0"]').click();assert.equal(await second.locator('#node-stat').textContent(),'5');assert.equal(await second.locator('#case-count').textContent(),'1');
    await importCase(second,shared.file);await second.locator('#fit-btn').click();await second.screenshot({path:path.join(root,`docs/界面预览_机构分享_${version}.png`),fullPage:true});
    await second.locator('#motion-metric').selectOption('acceleration');const acc=await exportCase(second,'加速度案例.json');await importCase(first,acc.file);assert.equal(await first.locator('#motion-metric').inputValue(),'acceleration');
    const legacy=JSON.parse(fs.readFileSync(path.join(root,'examples/曲柄滑块.json'),'utf8'));legacy.version=1;delete legacy.attachments;const old=path.join(out,'旧版案例.json');fs.writeFileSync(old,'\uFEFF'+JSON.stringify(legacy));await importCase(second,old);assert.equal(await second.locator('#document-name').textContent(),'曲柄滑块');assert.equal(await second.locator('#motion-metric').inputValue(),'speed');assert.equal((await exportCase(second,'旧版再分享.json')).data.attachments.length,0);
    console.log('PASS: acceleration sharing, v1 migration, UTF-8 BOM, case removal and re-export after switching mechanisms');
    const limited=await context();await limited.addInitScript(items=>localStorage.setItem('jigou-workshop-qa-cases-v1',JSON.stringify(items)),Array.from({length:30},(_,i)=>({...shared.data,name:'案例 '+i})));
    const full=await limited.newPage();full.on('pageerror',e=>errors.push(e.message));await full.goto(url);assert.equal(await full.locator('#case-count').textContent(),'30');await full.locator('#file-input').setInputFiles(shared.file);await full.waitForFunction(()=>document.querySelector('#toast').textContent.includes('列表已满'));assert.equal(await full.locator('#document-name').textContent(),shared.data.name);assert.equal(await full.locator('#case-count').textContent(),'30');await exportCase(full,'列表已满仍可分享.json');await limited.close();
    const blocked=await context();await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage disabled','QuotaExceededError');};});const noStore=await blocked.newPage();noStore.on('pageerror',e=>errors.push(e.message));await noStore.goto(url);await noStore.locator('#file-input').setInputFiles(shared.file);await noStore.waitForFunction(()=>document.querySelector('#toast').textContent.includes('不可用'));assert.equal(await noStore.locator('[data-attachment]').count(),3);await exportCase(noStore,'存储不可用仍可分享.json');await blocked.close();
    await second.setViewportSize({width:390,height:844});assert.ok(await second.locator('#open-btn').isVisible());assert.ok(await second.locator('#export-btn').isVisible());assert.ok(await second.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    assert.deepEqual(errors,[]);console.log('PASS: full library and unavailable storage retain file sharing; mobile import/export remain accessible; no page errors');
  }catch(e){if(second)await second.screenshot({path:path.join(out,'浏览器检查失败.png'),fullPage:true});throw e;}finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
