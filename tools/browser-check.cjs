'use strict';
// Optional UI verification; install Playwright separately or set JIGOU_PLAYWRIGHT.
const {chromium}=require(process.env.JIGOU_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1024},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:4173/?qa=1');
    await page.locator('#stage [data-node="C"]').waitFor();
    for(const tool of ['node','link','slider']){
      await page.locator(`[data-tool="${tool}"]`).click();
      await page.keyboard.press('Escape');assert.ok(await page.locator(`[data-tool="${tool}"]`).evaluate(el=>el.classList.contains('active')));
      await page.keyboard.press('Escape');assert.ok(await page.locator('[data-tool="select"]').evaluate(el=>el.classList.contains('active')));
    }
    console.log('PASS: three drawing tools return to select after two Escape presses');
    await page.locator('#show-grid').uncheck();assert.equal(await page.locator('#stage rect[fill="url(#grid)"]').count(),0);
    await page.locator('#show-grid').check();assert.equal(await page.locator('#stage rect[fill="url(#grid)"]').count(),1);
    const stageBox=await page.locator('#stage').boundingBox();await page.mouse.move(stageBox.x+stageBox.width/2,stageBox.y+stageBox.height/2);
    await page.mouse.wheel(0,-3600);await page.waitForFunction(()=>document.querySelector('#grid-value').textContent==='1 mm');
    await page.mouse.wheel(0,3600);await page.waitForFunction(()=>document.querySelector('#grid-value').textContent!=='1 mm');await page.locator('#fit-btn').click();
    console.log('PASS: wheel changes grid spacing; minimum is 1 mm; grid toggle works');
    await page.locator('[data-dimension="L1"]').click();await page.locator('#action-input').fill('50');
    await page.locator('#action-input').press('Enter');
    await page.waitForFunction(()=>document.querySelector('[data-dimension="L1"] text').textContent==='50.0');
    assert.equal(await page.locator('[data-dimension="L1"] text').textContent(),'50.0');
    assert.equal(await page.locator('#inspector input[data-property="length"]').inputValue(),'50.000');
    await page.locator('#undo-btn').click();assert.equal(await page.locator('[data-dimension="L1"] text').textContent(),'45.0');
    await page.locator('[data-dimension="L1"]').click();await page.locator('#action-input').fill('');await page.locator('#action-dialog button[value="cancel"]').click();assert.equal(await page.locator('[data-dimension="L1"] text').textContent(),'45.0');
    console.log('PASS: clicking dimension edits length and undo restores it');
    await page.locator('[data-tool="link"]').click();await page.mouse.click(stageBox.x+70,stageBox.y+75);
    const b=await page.locator('[data-node="B"] > circle').last().boundingBox(),bx=b.x+b.width/2,by=b.y+b.height/2;
    await page.mouse.move(bx+13,by);await page.waitForFunction(()=>document.querySelector('#canvas-hint').textContent.includes('已吸附铰点 B'));
    await page.mouse.click(bx+13,by);assert.equal(await page.locator('#node-stat').textContent(),'5');assert.equal(await page.locator('#link-stat').textContent(),'4');
    console.log('PASS: proximity snap reuses joint B and adds only one endpoint');
    await page.reload();await page.locator('#trace-cycle-btn').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已绘制一周轨迹'));
    assert.ok(await page.locator('#stage path').count()>30);assert.match(await page.locator('#mobility-expression').textContent(),/3 × 3 − 2 × 4 − 0 = 1/);
    const trace=await page.locator('#stage path[opacity=".85"]').first().evaluate(el=>{
      const p=el.getPointAtLength(el.getTotalLength()/2),m=el.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};
    });await page.mouse.move(trace.x,trace.y);await page.locator('#trace-tooltip').waitFor({state:'visible'});
    assert.match(await page.locator('#trace-tooltip').textContent(),/mm\/s/);
    console.log('PASS: full-cycle colored trace, numeric hover speed and mobility formula');
    await page.mouse.move(40,40);
    fs.mkdirSync(path.join(root,'output/pdf'),{recursive:true});fs.mkdirSync(path.join(root,'tmp/pdfs'),{recursive:true});
    await page.locator('#export-btn').click();const pdfDownload=page.waitForEvent('download');await page.locator('#pdf-btn').click();
    await (await pdfDownload).saveAs(path.join(root,'tmp/pdfs/基础机构_检查.pdf'));
    await page.screenshot({path:path.join(root,'docs/界面预览_基础_1.0.png'),fullPage:true});
    await page.locator('#show-traces').uncheck();
    await page.locator('#export-btn').click();const hiddenDownload=page.waitForEvent('download');await page.locator('#pdf-btn').click();await(await hiddenDownload).saveAs(path.join(root,'tmp/pdfs/无轨迹_检查.pdf'));
    await page.locator('#show-traces').check();
    await page.locator('#export-btn').click();const csvDownload=page.waitForEvent('download');await page.locator('#csv-btn').click();await(await csvDownload).saveAs(path.join(root,'tmp/pdfs/速度轨迹_检查.csv'));
    const csv=fs.readFileSync(path.join(root,'tmp/pdfs/速度轨迹_检查.csv'),'utf8');assert.equal(csv.trim().split(/\r?\n/).length,362);assert.match(csv,/速度_mm_s/);
    console.log('PASS: actual PDF with trace, PDF without trace, CSV with 361 velocity samples');
    await page.locator('#examples-btn').click();await page.locator('[data-example="slider"]').click();if(await page.locator('#action-dialog').isVisible())await page.locator('#action-dialog button[value="ok"]').click();
    assert.match(await page.locator('#mobility-expression').textContent(),/3 × 3 − 2 × 4 − 0 = 1/);
    assert.match(await page.locator('#mobility-counts').textContent(),/转动 3 \+ 移动 1/);
    console.log('PASS: slider counted as a moving body and prismatic pair');
    assert.deepEqual(errors,[]);console.log('PASS: no page errors');
  }catch(e){
    fs.mkdirSync(path.join(root,'tmp/pdfs'),{recursive:true});await page.screenshot({path:path.join(root,'tmp/pdfs/浏览器检查失败.png'),fullPage:true});
    console.error('stage box:',await page.locator('#stage').boundingBox(),'dimension box:',await page.locator('[data-dimension="L1"]').boundingBox());throw e;
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
