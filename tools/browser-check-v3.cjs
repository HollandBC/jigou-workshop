'use strict';
const {chromium}=require(process.env.JIGOU_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1024},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  async function rodPosition(t){return page.evaluate(t=>{
    const screen=id=>{const c=document.querySelector(`[data-node="${id}"] > circle:last-of-type`),p=c.ownerSVGElement.createSVGPoint();p.x=c.cx.baseVal.value;p.y=c.cy.baseVal.value;const q=p.matrixTransform(c.getScreenCTM());return{x:q.x,y:q.y};};
    const a=screen('B'),b=screen('C'),length=Math.hypot(b.x-a.x,b.y-a.y);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,ux:(b.x-a.x)/length,uy:(b.y-a.y)/length};
  },t);}
  async function clickAt(p){await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);}
  async function download(id,name){await page.locator('#export-btn').click();const pending=page.waitForEvent('download');await page.locator(id).click();await(await pending).saveAs(path.join(root,name));}
  try{
    fs.mkdirSync(path.join(root,'tmp/pdfs'),{recursive:true});fs.mkdirSync(path.join(root,'output/pdf'),{recursive:true});
    await page.goto('http://127.0.0.1:4173/?qa=1');await page.locator('#examples-btn').click();await page.locator('[data-example="attached"]').click();
    await page.locator('[data-attachment="T2"]').waitFor();
    assert.equal(await page.locator('#dof-stat').textContent(),'1');assert.equal(await page.locator('#link-stat').textContent(),'3');
    await page.locator('[data-tool="point"]').click();const p=await rodPosition(.35);await clickAt(p);
    await page.locator('[data-attachment="T4"]').waitFor();
    assert.ok(Math.abs(Number(await page.locator('[data-property="percent"]').inputValue())-35)<.01);
    assert.ok(await page.locator('[data-property="trace"]').isChecked());assert.equal(await page.locator('#speed-node').inputValue(),'T4');
    assert.equal(await page.locator('[data-selection-highlight="attachment"]').count(),1);
    console.log('PASS: arbitrary rod point at 35%, selected highlight, automatic trace');
    await page.locator('[data-tool="arm"]').click();const base=await rodPosition(.48);await clickAt(base);
    await page.mouse.move(base.x-base.uy*120+base.ux*25,base.y+base.ux*120+base.uy*25);
    assert.ok(await page.locator('#stage path[stroke-dasharray]').count()>0);
    await page.mouse.click(base.x-base.uy*120+base.ux*25,base.y+base.ux*120+base.uy*25);
    await page.locator('[data-attachment="T5"]').waitFor();
    assert.ok(Math.abs(Number(await page.locator('[data-property="along"]').inputValue()))<1e-6);
    assert.ok(Math.abs(Number(await page.locator('[data-property="normal"]').inputValue()))>5);
    assert.equal(await page.locator('[data-selection-highlight="arm"]').count(),1);
    console.log('PASS: two-click perpendicular rigid extension with preview and highlight');
    await page.locator('[data-tool="arm"]').click();await page.locator('#arm-direction').selectOption('free');const side=await rodPosition(.7);await clickAt(side);
    await clickAt({x:side.x-side.uy*85+side.ux*60,y:side.y+side.ux*85+side.uy*60});await page.locator('[data-attachment="T6"]').waitFor();
    assert.ok(Math.abs(Number(await page.locator('[data-property="along"]').inputValue()))>5);
    assert.ok(Math.abs(Number(await page.locator('[data-property="normal"]').inputValue()))>5);
    console.log('PASS: arbitrary-angle rigid extension');
    const validLength=await page.locator('[data-property="armLength"]').inputValue();await page.locator('[data-property="armLength"]').fill('-5');await page.locator('[data-property="armLength"]').press('Enter');assert.equal(await page.locator('[data-property="armLength"]').inputValue(),validLength);
    await page.locator('#snap-grid').uncheck();
    const tip=await page.locator('[data-attachment="T4"] [data-attachment-tip] > circle').boundingBox(),destination=await rodPosition(.8);
    await page.mouse.move(tip.x+tip.width/2,tip.y+tip.height/2);await page.mouse.down();await page.mouse.move(destination.x,destination.y,{steps:8});await page.mouse.up();
    assert.ok(Math.abs(Number(await page.locator('[data-property="percent"]').inputValue())-80)<.01);
    await page.locator('#undo-btn').click();
    await page.locator('[data-tool="select"]').click();await page.locator('[data-attachment="T4"] [data-attachment-tip] > circle').click();
    assert.ok(Math.abs(Number(await page.locator('[data-property="percent"]').inputValue())-35)<.01);
    console.log('PASS: dragging attached point keeps it on rod; undo restores relative position');
    await page.locator('#motion-metric').selectOption('acceleration');assert.equal(await page.locator('#reading-unit').textContent(),'mm/s²');assert.ok(Number(await page.locator('#speed-value').textContent())>0);
    await page.locator('#motion-metric').selectOption('angular');assert.equal(await page.locator('#reading-unit').textContent(),'rad/s');assert.equal(await page.locator('#angular-reference').inputValue(),'L2');assert.ok(await page.locator('#angular-reference').isDisabled());
    await page.locator('[data-list="links"]').click();await page.locator('[data-part="L1"]').click();assert.equal(await page.locator('#angular-reference').inputValue(),'L1');assert.ok(Math.abs(Number(await page.locator('#speed-value').textContent())-12*2*Math.PI/60)<.01);assert.equal(await page.locator('[data-selection-highlight="link"]').count(),1);
    await page.locator('[data-list="nodes"]').click();await page.locator('[data-part="C"]').click();await page.locator('#angular-reference').selectOption('L3');assert.equal(await page.locator('[data-selection-highlight="node"]').count(),1);
    console.log('PASS: acceleration/angular options, crank omega and explicit joint reference');
    await page.locator('[data-list="attachments"]').click();await page.locator('[data-part="T2"]').click();
    await page.locator('#angle-input').fill('120');await page.locator('#angle-input').press('Enter');await page.waitForFunction(()=>document.querySelector('#solver-state').textContent.includes('已求解'));
    await page.locator('#trace-cycle-btn').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已绘制一周轨迹'));
    assert.ok(await page.locator('#stage path[opacity=".85"]').count()>3);
    const curve=await page.locator('#stage path[opacity=".85"]').first().evaluate(el=>{const p=el.getPointAtLength(el.getTotalLength()/2),m=el.getScreenCTM();return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};});
    await page.mouse.move(curve.x,curve.y);await page.locator('#trace-tooltip').waitFor({state:'visible'});assert.match(await page.locator('#trace-tooltip').textContent(),/rad\/s/);
    await page.mouse.move(40,40);
    await download('#pdf-btn','tmp/pdfs/伸出杆_角速度_检查.pdf');
    await page.locator('#motion-metric').selectOption('acceleration');
    await download('#pdf-btn','output/pdf/杆上点与伸出杆_加速度轨迹_0.8.pdf');
    await page.screenshot({path:path.join(root,'docs/界面预览_附着结构_1.0.png'),fullPage:true});
    await download('#csv-btn','tmp/pdfs/伸出杆_运动学_检查.csv');await download('#save-btn','tmp/pdfs/附着结构_往返.json');
    const model=JSON.parse(fs.readFileSync(path.join(root,'tmp/pdfs/附着结构_往返.json'),'utf8'));assert.equal(model.version,9);assert.equal(model.attachments.length,6);assert.equal(model.links.length,3);
    const csv=fs.readFileSync(path.join(root,'tmp/pdfs/伸出杆_运动学_检查.csv'),'utf8');assert.equal(csv.trim().split(/\r?\n/).length,362);assert.match(csv,/T4_加速度_mm_s2/);assert.match(csv,/T6_角速度_rad_s/);
    await page.locator('#file-input').setInputFiles(path.join(root,'tmp/pdfs/附着结构_往返.json'));await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('机构已导入'));assert.equal(await page.locator('[data-attachment]').count(),6);
    await page.locator('[data-list="links"]').click();await page.locator('[data-part="L2"]').click();await page.locator('#delete-btn').click();assert.equal(await page.locator('[data-attachment]').count(),0);await page.locator('#undo-btn').click();assert.equal(await page.locator('[data-attachment]').count(),6);
    console.log('PASS: full-cycle traces, hover angular value, acceleration/angular PDF, expanded CSV, JSON roundtrip, cascade delete and undo');
    for(const tool of ['point','arm']){await page.locator(`[data-tool="${tool}"]`).click();await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.ok(await page.locator('[data-tool="select"]').evaluate(el=>el.classList.contains('active')));}
    await page.reload();await page.locator('#examples-btn').click();await page.locator('[data-example="attached"]').click();await page.locator('[data-list="attachments"]').click();await page.locator('[data-part="T2"]').click();
    const initialCoordinates=await page.locator('#attachment-position-value').textContent();
    await page.locator('#motion-metric').selectOption('acceleration');await page.locator('#angle-input').fill('120');await page.locator('#angle-input').press('Enter');
    await page.waitForFunction(previous=>document.querySelector('#attachment-position-value').textContent!==previous,initialCoordinates);
    await page.locator('#trace-cycle-btn').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已绘制一周轨迹'));await page.locator('#fit-btn').click();
    await download('#pdf-btn','output/pdf/杆上点与伸出杆_加速度轨迹_0.8.pdf');await page.screenshot({path:path.join(root,'docs/界面预览_附着结构_1.0.png'),fullPage:true});
    console.log('PASS: live attached-point coordinates, fit includes traces, final clean sample');
    assert.deepEqual(errors,[]);console.log('PASS: new tools support Escape and no page errors');
  }catch(e){await page.screenshot({path:path.join(root,'tmp/pdfs/浏览器检查失败_v3.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
