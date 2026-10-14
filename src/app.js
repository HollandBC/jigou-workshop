(function(){
  'use strict';
  const {geometry:G,model:M,cases:C,solver:S,motion:K,view:V,exporter:E,curves:Q,drive:D,editing:Z,gears:B,cams:T}=globalThis.JiGou;
  const $=id=>document.getElementById(id), esc=V.esc, stage=$('stage');
  const qa=new URLSearchParams(location.search).get('qa')==='1';
  const STORAGE=qa?'jigou-workshop-qa-v1':'jigou-workshop-v1';
  const PLAYBACK_STORAGE=STORAGE+'-playback-rate';
  const CASE_STORAGE=qa?'jigou-workshop-qa-cases-v1':'jigou-workshop-cases-v1';
  let savedCases=[],activeCase=null,caseStorageOK=true,caseLoadWarning='';
  try{const items=JSON.parse(localStorage.getItem(CASE_STORAGE)||'[]');if(!Array.isArray(items)||items.length>30)throw new Error();for(const item of items){try{const c=C.read(item);savedCases.push(C.write(c.model,c.presentation));}catch{caseStorageOK=false;}}}catch{caseStorageOK=false;}
  let model=M.example('fourbar'), undo=[],redo=[], listType='nodes',toastTimer,drag=null,changed=false,escapeCount=0;
  const state={selection:null,tool:'select',pending:null,pointer:null,snapNode:null,hoverSample:null,hoverLink:null,armBase:null,armDraft:null,positions:null,traces:{},showGrid:true,showDimensions:true,showTraces:true,showSpeed:true,speedNode:null,speedMax:0,metric:'speed',metricMax:{},angularReferences:{},motion:null,velocities:null,angle:40,playing:false,playbackRate:1,lastResult:null};
  try{const rate=Number(localStorage.getItem(PLAYBACK_STORAGE));if(Number.isFinite(rate)&&rate>=.1&&rate<=4)state.playbackRate=Math.round(rate*20)/20;}catch{}
  const view={scale:2,x:0,y:0};
  const X=globalThis.JiGou.drafting;state.drawing=X.empty();state.measureDraft=[];
  let motionCache=null,motionModel=null,motionPositions=null,guideRangeModel=null;
  let curveData=null,curveModel=null,curveLines=[],curveSelected=[],curveBusy=false,returnToCurves=false;
  function currentMotion(){if(!motionCache||motionModel!==model||motionPositions!==state.positions){motionModel=model;motionPositions=state.positions;motionCache=K.analyze(model,state.positions||Object.fromEntries(model.nodes.map(n=>[n.id,n])),D.at(model,state.phase));}return motionCache;}
  let storageOK=true;
  try{const saved=qa?null:localStorage.getItem(STORAGE);if(saved){const next=C.read(JSON.parse(saved));model=next.model;state.drawing=next.presentation.drawing||X.empty();}}catch{storageOK=false;}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
  function persist(){X.prune(state.drawing,model);changed=true;activeCase=null;renderCases();try{localStorage.setItem(STORAGE,JSON.stringify(C.write(model,X.active(state.drawing)?{drawing:state.drawing}:{})));storageOK=true;}catch{storageOK=false;}$('autosave-state').textContent=storageOK?'已自动保存到当前浏览器':'请使用“导出 → 机构 JSON”保存文件';}
  function renderCases(){
    $('case-count').textContent=savedCases.length;
    $('case-list').innerHTML=savedCases.length?savedCases.map((c,i)=>`<div class="case-row ${c===activeCase?'active':''}"><button class="case-load" data-case="${i}" title="加载案例：${esc(c.name)}"><svg aria-hidden="true"><use href="#i-link"/></svg><span><strong>${esc(c.name)}</strong><small>${c.links.length} 根杆 / 参考杆${c.gears.length?` · ${c.gears.length} 齿轮`:''} · ${c.attachments.length} 个附着点</small></span></button><button class="case-remove icon-button" data-remove-case="${i}" aria-label="从案例列表移除 ${esc(c.name)}" title="从列表移除"><svg><use href="#i-trash"/></svg></button></div>`).join(''):'<p class="case-empty">还没有分享案例，点击顶部“导入机构”或“导出 → 机构 JSON”开始。</p>';
  }
  function persistCases(){try{localStorage.setItem(CASE_STORAGE,JSON.stringify(savedCases));caseStorageOK=true;}catch{caseStorageOK=false;}renderCases();}
  function rememberCase(file){
    const c=C.read(file),next=C.write(c.model,c.presentation),key=JSON.stringify(next);
    let item=savedCases.find(x=>JSON.stringify(x)===key);
    if(!item){if(savedCases.length>=30)return '案例列表已满，文件仍可导入和导出；移除旧案例后可加入列表。';savedCases.unshift(next);item=next;}
    activeCase=item;persistCases();return caseStorageOK?'':'本次案例可继续使用，但浏览器存储不足或不可用，请保留导出的文件。';
  }
  function historyEntry(){return{model:G.clone(model),drawing:X.clone(state.drawing)};}
  function snapshot(){undo.push(historyEntry());if(undo.length>100)undo.shift();redo=[];}
  function changeDrawing(fn){const before=X.clone(state.drawing);snapshot();try{fn(state.drawing);state.drawing=X.read(state.drawing,model);persist();refresh();}catch(e){state.drawing=before;undo.pop();refresh();throw e;}}
  function pause(){state.playing=false;lastTime=0;$('play-btn').innerHTML='<svg><use href="#i-play"/></svg><span>运行仿真</span>';$('stage-state').textContent='编辑模式';}
  function materialize(){
    pause();
    if(state.positions){for(const n of model.nodes){n.x=state.positions[n.id].x;n.y=state.positions[n.id].y;}if(model.motor){model.motor.initialAngle=D.swing(model)?state.angle:normalize(state.angle);if(D.swing(model))model.motor.initialPhase=normalize(state.phase);}}
    state.positions=null;clearTraces();state.lastResult=null;
  }
  function clearTraces(){guideRangeModel=null;state.railRanges={};state.traces={};state.speedMax=0;state.metricMax={};state.hoverSample=null;motionCache=null;$('trace-tooltip').hidden=true;}
  function initial(){pause();state.positions=null;clearTraces();state.phase=D.initialPhase(model);state.angle=D.at(model,state.phase).angle;state.lastResult=null;state.pending=null;state.snapNode=null;state.armBase=null;state.armDraft=null;state.hoverLink=null;state.loopDraft=[];state.loopSnap=null;state.sliderDraft=null;state.gearDraft=null;state.meshFirst=null;sliderReadout();loopReadout();}
  function normalize(a){return ((a%360)+360)%360;}
  function rememberPose(result){
    state.positions=result.positions;state.lastResult=result;state.motion=currentMotion();
    const pos=M.positions(model,result.positions);
    if(state.showTraces)for(const n of M.observers(model).filter(n=>n.trace)){const pts=state.traces[n.id]||(state.traces[n.id]=[]),p=pos[n.id];if(!pts.length||G.distance(pts[pts.length-1],p)>0.08||Math.abs(state.angle-pts.at(-1).angle)>=.5)pts.push(K.sample(model,n,state.motion,pos,state.angle));if(pts.length>4000)pts.shift();}
  }
  function moveTo(target,record=true){
    if(!model.motor){toast('先选择连杆，将它设为角度输入。');return false;}
    if(D.swing(model)&&(target<model.motor.minAngle-1e-6||target>model.motor.maxAngle+1e-6)){toast('输入角度超出摆动范围。');readouts();return false;}
    const diff=target-state.angle,steps=Math.max(1,Math.ceil(Math.abs(diff)/2)),start=state.angle;
    if(steps>2000&&model.gears.length&&!D.swing(model)){const result=S.solve(model,target,state.positions);if(!result.ok){toast(result.message);return false;}state.angle=state.phase=target;if(record)rememberPose(result);else{state.positions=result.positions;state.lastResult=result;}readouts();draw();return true;}
    if(steps>2000){toast('输入角度跨度过大，请使用 0～360° 的角度。');return false;}
    let previous=state.positions;
    for(let i=1;i<=steps;i++){
      const angle=start+diff*i/steps,r=S.solve(model,angle,previous);
      if(!r.ok){state.lastResult=r;pause();readouts();draw();toast(r.message);return false;}
      previous=r.positions;state.angle=angle;state.phase=D.phaseForAngle(model,angle,state.phase);if(record)rememberPose(r);else{state.positions=r.positions;state.lastResult=r;}
    }
    readouts();draw();return true;
  }
  function advancePhase(target,record=true){
    const start=state.phase,steps=Math.max(1,Math.ceil(Math.abs(target-start)/2));let previous=state.positions;
    for(let i=1;i<=steps;i++){const phase=start+(target-start)*i/steps,drive=D.at(model,phase),r=S.solve(model,drive.angle,previous);if(!r.ok){state.lastResult=r;pause();readouts();draw();toast(r.message);return false;}previous=r.positions;state.phase=phase;state.angle=drive.angle;if(record)rememberPose(r);else{state.positions=r.positions;state.lastResult=r;}}
    readouts();draw();return true;
  }
  function recalculateLengths(nodeId){
    motionCache=null;
    const affected=new Set([nodeId,...M.syncPins(model)]);
    for(const l of model.links.filter(l=>!nodeId||affected.has(l.a)||affected.has(l.b))){const a=model.nodes.find(n=>n.id===l.a),b=model.nodes.find(n=>n.id===l.b);l.length=Math.max(0.1,G.distance(a,b));}
    if(model.motor){const l=model.links.find(l=>l.id===model.motor.link),p=model.nodes.find(n=>n.id===(model.motor.pivot||l.a)),tip=model.nodes.find(n=>n.id===(l.a===p.id?l.b:l.a));let angle=G.deg(Math.atan2(tip.y-p.y,tip.x-p.x));if(D.swing(model))angle+=360*Math.round(((model.motor.minAngle+model.motor.maxAngle)/2-angle)/360);else angle=normalize(angle);model.motor.initialAngle=angle;state.angle=angle;state.phase=D.phaseForAngle(model,angle,state.phase);if(D.swing(model))model.motor.initialPhase=normalize(state.phase);}
  }
  function change(fn,close=false){
    const before=G.clone(model);snapshot();materialize();
    try{
      fn();model=M.validate(model);
      if(close&&model.motor){const result=S.solve(model,model.motor.initialAngle,null);state.lastResult=result;if(result.ok)for(const n of model.nodes){n.x=result.positions[n.id].x;n.y=result.positions[n.id].y;}else toast(result.message);}
      state.phase=D.initialPhase(model);state.angle=D.at(model,state.phase).angle;persist();refresh();return true;
    }catch(e){model=before;undo.pop();initial();refresh();toast(e.message);return false;}
  }
  function speedReadout(){
    const nodes=M.observers(model);
    if(!nodes.some(n=>n.id===state.speedNode))state.speedNode=nodes.find(n=>n.trace)?.id||nodes.find(n=>!n.fixed)?.id||nodes[0]?.id||null;
    const options=nodes.map(n=>`<option value="${n.id}" ${n.id===state.speedNode?'selected':''}>${esc(n.name)}</option>`).join('')||'<option value="">先添加轨迹点或开启记录</option>';
    if($('speed-node').innerHTML!==options)$('speed-node').innerHTML=options;
    $('speed-node').disabled=!nodes.length;
    const pos=M.positions(model,state.positions);state.motion=currentMotion();
    for(const point of nodes){const links=M.referenceLinks(model,point);if(!links.some(l=>l.id===state.angularReferences[point.id]))state.angularReferences[point.id]=links[0]?.id;}
    const point=nodes.find(n=>n.id===state.speedNode),references=point?M.referenceLinks(model,point):[];
    const referenceOptions=references.map(l=>`<option value="${l.id}" ${l.id===state.angularReferences[state.speedNode]?'selected':''}>${esc(l.name)}</option>`).join('')||'<option value="">没有参考杆</option>';
    if($('angular-reference').innerHTML!==referenceOptions)$('angular-reference').innerHTML=referenceOptions;
    $('angular-reference').disabled=point?.type==='attachments'||!references.length;$('angular-reference-label').hidden=state.metric!=='angular';
    const sample=point?K.sample(model,point,state.motion,pos,state.angle):null,value=point?K.value(state,point,sample):null,meta=K.metadata[state.metric];
    $('speed-value').textContent=Number.isFinite(value)?value.toFixed(2):'—';$('metric-unit').textContent=meta.unit;$('reading-unit').textContent=meta.unit;
    $('speed-components').textContent=Number.isFinite(value)?state.metric==='angular'?`${Math.abs(value)<1e-8?'静止':value>0?'逆时针':'顺时针'} · ${(G.deg(value)).toFixed(2)} °/s`:`${meta.component}x ${sample[state.metric==='acceleration'?'ax':'vx'].toFixed(2)} · ${meta.component}y ${sample[state.metric==='acceleration'?'ay':'vy'].toFixed(2)} ${meta.unit}`:!nodes.length?'选择铰点或添加杆上轨迹点':state.motion.message||'此点没有角速度参考杆';
    let max=Number.isFinite(value)?Math.abs(value):0;
    for(const p of nodes.filter(n=>n.trace))for(const sample of state.traces[p.id]||[]){const v=K.value(state,p,sample);if(Number.isFinite(v))max=Math.max(max,Math.abs(v));}
    state.metricMax[state.metric]=max;state.speedMax=state.metricMax.speed||0;
    const range=V.speedRange(state);$('speed-max').textContent=`${range<10?Number(range.toPrecision(3)):range} ${meta.unit} · 大`;
    $('metric-note').textContent=state.metric==='angular'?'角速度属于参考杆；逆时针为正。轨迹颜色按绝对值，悬停显示正负值。':'悬停轨迹查看数值。箭头表示方向，长度按色标缩放。';
    $('speed-legend').hidden=!state.showSpeed||!state.showTraces;
    $('trace-cycle-btn').disabled=!model.motor;
  }
  function guideRanges(){
    if(!model.sliders.length){state.railRanges={};guideRangeModel=model;return;}
    if(guideRangeModel!==model&&!drag?.moved){let result=null;try{if(model.motor)result=S.sweep(model,1);}catch{}state.railRanges=M.railTravel(model,result?.frames||[]);state.railRangeComplete=!!result?.ok;guideRangeModel=model;}
    state.railRanges=M.railTravel(model,[state.positions||Object.fromEntries(model.nodes.map(n=>[n.id,n]))],state.railRanges);
  }
  function draw(){guideRanges();speedReadout();V.render(stage,model,state,view);gearReadout();$('zoom-value').textContent=`${Math.round(view.scale*100)}%`;$('grid-value').textContent=`${G.gridStep(view.scale)} mm`;const item=state.selection?.type==='attachments'&&model.attachments.find(p=>p.id===state.selection.id);if(item&&$('attachment-position-value')){const p=M.attachmentPose(model,item,state.positions);$('attachment-position-value').textContent=`${p.x.toFixed(2)}, ${p.y.toFixed(2)}`;}}
  function playbackReadout(){
    const text=Number(state.playbackRate.toFixed(2))+'×';
    $('playback-rate').value=state.playbackRate;$('playback-rate').setAttribute('aria-valuetext',text+' 播放速度');$('playback-rate-value').value=text;
    $('playback-rate').disabled=!model.motor;$('playback-reset').disabled=!model.motor||state.playbackRate===1;
  }
  function setPlaybackRate(value){
    if(!Number.isFinite(value)||value<.1||value>4)return;
    state.playbackRate=Math.round(value*20)/20;playbackReadout();
    try{localStorage.setItem(PLAYBACK_STORAGE,String(state.playbackRate));}catch{}
  }
  function readouts(){
    playbackReadout();
    const oscillating=D.swing(model),angle=oscillating?state.angle:normalize(state.angle);$('angle-range').min=oscillating?model.motor.minAngle:0;$('angle-range').max=oscillating?model.motor.maxAngle:360;$('angle-range').value=angle;$('angle-input').value=angle.toFixed(1);$('input-mode').disabled=!model.motor;$('input-mode').value=oscillating?'swing':'rotate';$('swing-controls').hidden=!oscillating;
    if(oscillating){$('swing-min').value=model.motor.minAngle;$('swing-max').value=model.motor.maxAngle;}$('rpm-label').textContent=oscillating?'频率':'转速';$('rpm-unit').textContent=oscillating?'次/分':'rpm';$('drive-law').textContent=oscillating?'正弦往返 · 端点平滑换向':'恒定转速';$('trace-cycle-btn').textContent=oscillating?'绘制往返轨迹':model.gears.length?`绘制轨迹（输入 ${model.motor?.sampleTurns||1} 周）`:'绘制一周轨迹';
    $('angle-range').disabled=!model.motor;$('angle-input').disabled=!model.motor;$('rpm-input').disabled=!model.motor;
    if(document.activeElement!==$('rpm-input'))$('rpm-input').value=model.motor?.rpm??12;
    $('undo-btn').disabled=!undo.length;$('redo-btn').disabled=!redo.length;$('delete-btn').disabled=!state.selection;
    const r=state.lastResult;$('solver-state').className=r&&!r.ok?'failure':'';
    const msg=r&&!r.ok?(r.code==='underconstrained'?'约束不足':'无法闭合'):state.playing?'仿真运行中':r?'已求解':'就绪';
    $('solver-state').innerHTML=`<i class="status-dot"></i>${msg}`;
    $('solver-error').textContent=r?`约束误差 ${Number.isFinite(r.residual)?r.residual.toExponential(1):'—'} mm`:'约束误差 —';
  }
  function summary(){
    const a=S.analyze(model);$('node-stat').textContent=model.nodes.length;$('link-stat').textContent=model.links.length;$('dof-stat').textContent=a.dof;
    const f=M.mobility(model);$('mobility-expression').textContent=`3 × ${f.n} − 2 × ${f.lower} − ${f.higher} = ${f.dof}`;
    $('mobility-counts').innerHTML=`<div><span>活动构件 n</span><strong>${f.n}（杆 ${f.rods-f.gearRods}${f.gearRods?` + 齿轮固连 ${f.gearRods}`:''} + 整体 ${f.bodies} + 滑块 ${f.sliders}）</strong></div><div><span>低副 Pₗ</span><strong>${f.lower}（转动 ${f.rotational} + 移动 ${f.prismatic}）</strong></div><div><span>高副 Pₕ</span><strong>${f.higher}</strong></div>`;
    $('joint-counts').textContent='转动副：'+(f.joints.filter(j=>j.rotational).map(j=>`${j.name} × ${j.rotational}`).join('，')||'0')+(f.joints.some(j=>j.bodyPoint)?'；构件上的观测点（转动副 0）：'+f.joints.filter(j=>j.bodyPoint).map(j=>j.name).join('，'):'');
    $('analysis-note').textContent=!model.nodes.length?'先添加铰点和连杆':!model.motor?'选择连杆设置角度输入':a.remaining>0?`驱动后仍有 ${a.remaining} 个局部自由度，请补充约束`:a.dof===1?'一个角度输入，驱动后局部自由度为 0':'已配置驱动，请运行检查闭合情况';
    $('document-name').textContent=model.name;
    if(f.isolated)$('analysis-note').textContent+=`；${f.isolated} 个孤立点未计入构件公式`;
  }
  function parts(){
    $('parts-count').textContent=model.nodes.length+model.links.length+model.sliders.length+model.attachments.length+model.bodies.length+model.gears.length+model.meshes.length+model.cams.length;
    const items=model[listType];
    $('parts-list').innerHTML=items.length?items.map(item=>{
      const selected=state.selection?.type===listType&&state.selection.id===item.id;
      const icon=listType==='nodes'||listType==='attachments'?`<span class="part-icon">${esc(item.id)}</span>`:listType==='links'?`<span class="color-dot" style="background:${item.color}"></span>`:listType==='bodies'?'<span class="part-icon">▱</span>':listType==='gears'?'<span class="part-icon">⚙</span>':listType==='meshes'?'<span class="part-icon">⇄</span>':'<span class="part-icon">↔</span>';
      const detail=listType==='nodes'?(item.fixed?'固定':item.trace?'轨迹':'活动'):listType==='links'?`${item.length.toFixed(1)} mm`:listType==='attachments'?(item.arm?'伸出杆':'杆上点'):listType==='bodies'?`${item.nodes.length} 顶点 · 刚性`:listType==='gears'?(item.kind==='worm'?`${item.starts} 头`:`${item.teeth} 齿`):listType==='cams'?(item.type==='translate'?'直动':'摆动'):listType==='meshes'?B.types[item.type]:`${item.angle.toFixed(0)}°`;
      return `<button class="part-row ${selected?'selected':''}" data-part="${item.id}" title="${esc(item.name||item.id)}" aria-label="选择${{nodes:'节点',links:'连杆',sliders:'导轨',attachments:'附着点',bodies:'整体构件',gears:'齿轮',meshes:'啮合',cams:'凸轮'}[listType]} ${esc(item.name||item.id)}">${icon}<span>${esc(item.name||item.id)}</span><span class="part-detail">${detail}</span></button>`;
    }).join(''):'<p class="empty-list">还没有元素。使用画布上方的工具开始添加。</p>';
  }
  const field=(label,key,value,type='number',attrs='')=>`<label class="field">${label}<input type="${type}" data-property="${key}" value="${esc(value)}" ${attrs}></label>`;
  function inspector(){
    const sel=state.selection,item=sel&&model[sel.type].find(x=>x.id===sel.id);
    if(!item){state.selection=null;$('selection-tag').textContent='未选择';$('inspector').innerHTML=`<div class="empty-selection"><div class="illustration"><svg><use href="#i-select"/></svg></div><strong>让一个想法动起来</strong><p>点击铰点或连杆查看属性。<br>调整尺寸，探索机构的运动。</p></div>`;return;}
    $('selection-tag').textContent=sel.type==='nodes'?(item.onLink?'杆上铰点':M.mobility(model).joints.find(j=>j.id===item.id).bodyPoint?'构件观测点':'铰点'):sel.type==='links'?'连杆':sel.type==='attachments'?(item.arm?'伸出杆':'杆上点'):sel.type==='bodies'?'整体构件':sel.type==='gears'?B.kinds[item.kind]:sel.type==='cams'?'凸轮':sel.type==='meshes'?'啮合':'导轨';
    if(sel.type==='nodes'){
      const pin=item.onLink,parent=pin&&model.links.find(l=>l.id===pin.link);
      $('inspector').innerHTML=field('名称','name',item.name,'text','maxlength="40"')+(pin?`<div class="property-info"><span>母杆</span><strong>${esc(parent.name)}</strong></div>`+field('连接位置 / %（从母杆 A 端）','pinPercent',(pin.t*100).toFixed(3),'number','min="0" max="100" step="1"')+`<p class="attachment-note">铰点固定在母杆上，可连接新的独立连杆。拖动时沿母杆调整位置；母杆保持整体刚性。</p>`:`<div class="field-grid">${field('X / mm','x',item.x.toFixed(3),'number','step="1"')}${field('Y / mm','y',item.y.toFixed(3),'number','step="1"')}</div>`)+`<div class="property-info"><span>连接状态</span><strong>${item.fixed?'固定支点':'活动铰点'}</strong></div><label class="check-row"><input type="checkbox" data-property="trace" ${item.trace?'checked':''}>记录运动轨迹</label><p class="property-note">使用绘图栏“固定铰点”点击此点可切换固定状态。编辑时采用当前位形并重新确定相邻杆长。</p>`;
      const rail=model.sliders.find(s=>s.node===item.id);if(rail)$('inspector').insertAdjacentHTML('beforeend',`<p class="attachment-note">滑块沿${rail.guide?esc(model.links.find(l=>l.id===rail.guide).name)+'的活动导槽':'机架导轨'}拖动，导轨位置保持不变。${rail.block?'与 '+esc(model.links.find(l=>l.id===rail.block).name)+' 固连，移动时整杆平移。':''}调整导轨请选择虚线或左侧“导轨”列表，再拖动蓝色手柄。</p>`);
    }else if(sel.type==='links'){
      const a=model.nodes.find(n=>n.id===item.a),b=model.nodes.find(n=>n.id===item.b),driven=model.motor?.link===item.id;
      $('inspector').innerHTML=field('名称','name',item.name,'text','maxlength="40"')+`<div class="property-info"><span>连接</span><strong>${esc(a.name)} ↔ ${esc(b.name)}</strong></div>`+field('杆长 / mm','length',item.length.toFixed(3),'number','min="0.1" max="1000000" step="1"')+`<label class="field">显示颜色<input type="color" data-property="color" value="${item.color}"></label>`+(driven?`<button id="remove-motor" class="primary-soft">已设为角度输入 · 移除</button>`:!(a.fixed&&b.fixed)?`<button id="set-motor" class="primary-soft">设为角度输入</button>`:'<p class="property-note">两端都固定的杆属于机架，不能设置角度输入。</p>')+'<div class="attachment-actions"><button id="add-midpoint">添加中点轨迹</button><button id="start-arm">画伸出杆</button></div><p class="property-note">点击数字改杆长；用“杆上点”工具选择任意位置。伸出杆与母杆刚性连接。</p>';
      const body=M.bodyForLink(model,item.id);if(body){$('inspector').querySelector('[data-property="length"]').disabled=true;$('inspector').insertAdjacentHTML('beforeend',`<p class="attachment-note">属于 ${esc(body.name)}。轮廓边不能单独改长；拖动顶点或编辑顶点坐标可重塑整体构件。</p>`);}
    }else if(sel.type==='cams'){
      $('inspector').innerHTML=field('名称','name',item.name,'text','maxlength="40"')+`<div class="property-info"><span>从动件</span><strong>${item.type==='translate'?'直动':'摆动'} · ${esc(item.node)}</strong></div><div class="property-info"><span>轮廓来源</span><strong>${item.source==='drawn'?'手绘轮廓':'参数化 · '+T.laws[item.law]}</strong></div><div class="property-info"><span>滚子半径</span><strong>${item.rollerRadius} mm</strong></div><button id="edit-cam" class="primary-soft">打开凸轮设计 · 修改轮廓</button><button id="cam-reference" class="primary-soft">选择凸轮轴参考杆</button><p class="attachment-note">从动件节点可连接其他杆件。轮廓、安装和运动参数在独立设计窗口修改；一个凸轮接触计作一个高副。</p>`;
    }else if(sel.type==='gears'){
      const center=model.nodes.find(n=>n.id===item.center),ref=model.links.find(l=>l.id===item.link),driven=model.motor?.link===item.link,fixed=[ref.a,ref.b].every(id=>model.nodes.find(n=>n.id===id).fixed),opts=model.links.filter(l=>[l.a,l.b].includes(item.center));
      $('inspector').innerHTML=field('名称','name',item.name,'text','maxlength="40"')+`<div class="property-info"><span>轴心</span><strong>${esc(center.name)} · ${center.fixed?'固定轴':'活动轴'}</strong></div><label class="field">类型<select data-property="kind">${Object.entries(B.kinds).map(([id,name])=>`<option value="${id}" ${id===item.kind?'selected':''}>${name}</option>`).join('')}</select></label>`+(item.kind==='worm'?field('蜗杆头数','starts',item.starts,'number','min="1" max="8" step="1"'):field('齿数 z','teeth',item.teeth,'number','min="8" max="300" step="1"'))+field('模数 m / mm','module',item.module,'number','min="0.1" max="100" step="0.1"')+`<label class="field">固连参考杆 / 同轴构件<select data-property="link">${opts.map(l=>`<option value="${l.id}" ${l.id===item.link?'selected':''}>${esc(l.name)}</option>`).join('')}</select></label><label class="field">颜色<input type="color" data-property="color" value="${item.color}"></label><div class="property-info"><span>${item.kind==='worm'?'示意尺寸':'分度圆直径 d = mz'}</span><strong>${(B.radius(item)*2).toFixed(2)} mm</strong></div>`+(driven?'<button id="remove-motor" class="primary-soft">已设为角度输入 · 移除</button>':fixed?'<p class="property-note">此构件固定。用“固定铰点”工具解除参考杆末端的固定后可转动。</p>':'<button id="set-motor" class="primary-soft">设为角度输入</button>')+`<button id="gear-reference" class="primary-soft">选择固连杆 · 连接偏心点</button><p class="attachment-note">齿轮与参考杆为一个刚体；同轴齿轮选择同一参考杆。杆长是偏心距，可连接连杆或添加轨迹点。改变齿数 / 模数会同步调整啮合中心距；模数同步到直接 / 间接啮合的齿轮，同轴复合轮的另一组模数可独立设置。${item.kind==='worm'?'蜗杆参考点仅表示转动相位，画布为正交轴的平面传动示意。':''}</p>`;
    }else if(sel.type==='meshes'){
      const options=(items,current)=>items.map(([id,name])=>`<option value="${id}" ${id===current?'selected':''}>${esc(name)}</option>`).join(''),gs=model.gears.map(g=>[g.id,g.name]),ratio=B.terms(model,item).ratio;
      $('inspector').innerHTML=field('名称','name',item.name,'text','maxlength="40"')+`<label class="field">齿轮 A（输入参考）<select data-property="a">${options(gs,item.a)}</select></label><label class="field">齿轮 B（输出参考）<select data-property="b">${options(gs,item.b)}</select></label><label class="field">啮合类型<select data-property="type">${options(Object.entries(B.types),item.type)}</select></label><label class="field">行星架 H<select data-property="carrier">${options([['','机架（定轴）'],...model.links.map(l=>[l.id,l.name])],item.carrier||'')}</select></label>`+(item.type==='worm'?`<label class="field">输出轴正方向<select data-property="direction">${options([['1','正向'],['-1','反向']],String(item.direction))}</select></label>`:'')+`<div class="property-info"><span>${item.carrier?'相对行星架 iᴴ':'定轴比 iAB'}</span><strong>${Number(ratio.toFixed(6))}</strong></div><div class="mesh-formula">${esc(B.formula(model,item))}</div><p class="attachment-note">${item.carrier?'iᴴ = (ωA − ωH) / (ωB − ωH)。总传动比见“齿轮传动”；自由差动需固定或驱动另一个构件。':'iAB = ωA / ωB。蜗杆正方向依照图示的轴向相位约定。'}</p><button id="remove-mesh" class="primary-soft">取消此啮合，保留齿轮</button>`;
    }else if(sel.type==='bodies'){

      $('inspector').innerHTML=field('名称','name',item.name,'text','maxlength="40"')+`<label class="field">填充颜色<input type="color" data-property="color" value="${item.color}"></label><div class="property-info"><span>轮廓顶点</span><strong>${item.nodes.map(esc).join(' · ')}</strong></div><p class="attachment-note">这是一个整体刚性构件，边界之间没有相对运动。与其他构件共享的顶点才计入转动副；仅属于该构件的点可记录轨迹。</p><button id="release-body" class="primary-soft">释放为独立杆件</button><p class="property-note">释放保留所有边和节点，恢复边之间的铰接。拖动轮廓顶点可修改初始形状。</p>`;
    }else if(sel.type==='attachments'){
      const parent=model.links.find(l=>l.id===item.link),point=M.attachmentPose(model,item,state.positions);
      $('inspector').innerHTML=field('名称','name',item.name,'text','maxlength="40"')+`<div class="property-info"><span>母杆</span><strong>${esc(parent.name)}</strong></div>`+field('连接位置 / %（从母杆 A 端）','percent',(item.t*100).toFixed(3),'number','min="0" max="100" step="1"')+(item.arm?`<div class="field-grid">${field('伸出长度 / mm','armLength',Math.hypot(item.along,item.normal).toFixed(3),'number','min="0.1" max="1000000" step="1"')}${field('相对母杆角度 / °','armAngle',G.deg(Math.atan2(item.normal,item.along)).toFixed(3),'number','step="1"')}</div><div class="field-grid">${field('沿杆偏置 / mm','along',item.along.toFixed(3),'number','step="1"')}${field('侧向偏置 / mm','normal',item.normal.toFixed(3),'number','step="1"')}</div>`:'')+`<label class="check-row"><input type="checkbox" data-property="trace" ${item.trace?'checked':''}>记录运动轨迹</label><div class="property-info"><span>当前位置 / mm</span><strong>${point.x.toFixed(2)}, ${point.y.toFixed(2)}</strong></div><p class="attachment-note">${item.arm?'伸出杆与母杆刚性连接，端点随母杆运动。90° 为左侧垂直伸出，−90° 为右侧。可拖动端点调整。':'该点固定在母杆的相对位置，可沿杆拖动。'} 不增加活动构件或自由度。</p>`;
    }else{
      const links=M.referenceLinks(model,{id:item.node,type:'nodes'}).filter(l=>l.id!==item.guide),options=(items,selected)=>items.map(([id,name])=>`<option value="${id}" ${id===selected?'selected':''}>${esc(name)}</option>`).join('');
      $('inspector').innerHTML=`<div class="property-info"><span>滑块铰点</span><strong>${esc(item.node)}</strong></div><label class="field">导轨安装<select data-property="guide">${options([['','机架固定'],...model.links.filter(l=>l.id!==item.block).map(l=>[l.id,l.name])],item.guide||'')}</select></label><label class="field">滑块连接<select data-property="block">${options([['','铰接滑块（可相对转动）'],...links.map(l=>[l.id,'固连：'+l.name])],item.block||'')}</select></label>`+field(item.guide?'相对母杆方向 / °':'导轨方向 / °','angle',Number(item.angle.toFixed(3)),'number','step="1"')+`<div class="field-grid">${field(item.guide?'局部沿杆位置 / mm':'基点 X / mm','originX',Number(item.origin.x.toFixed(3)),'number','step="1"')}${field(item.guide?'局部侧向位置 / mm':'基点 Y / mm','originY',Number(item.origin.y.toFixed(3)),'number','step="1"')}</div>`+(item.block?field('固连杆与导轨夹角 / °','blockAngle',Number(item.blockAngle.toFixed(3)),'number','step="1"'):'')+field('最小显示长度 / mm','length',Number((item.length||260).toFixed(3)),'number','min="1" step="10"')+'<p class="property-note">两种导轨均以虚线显示，自动覆盖运动周期中的滑块行程；此处设置最小显示长度，不限制行程。拖动滑块沿导轨调整位置；拖动虚线或蓝色手柄移动导轨，活动导槽会带动安装母杆。固连滑块随整杆平移。固定铰点也可作为摇块中心。</p>';
    }
    if(sel.type==='sliders'){const b=M.railBounds(model,item,state.positions,state.railRanges),r=state.railRanges?.[item.id];$('inspector').insertAdjacentHTML('beforeend',`<div class="property-info"><span>自动显示长度</span><strong>${(b.max-b.min).toFixed(2)} mm</strong></div><div class="property-info"><span>${state.railRangeComplete?'周期滑动行程':'已知滑动范围'}</span><strong>${r?(r.max-r.min).toFixed(2):'0.00'} mm</strong></div>${state.railRangeComplete?'':`<p class="property-note">${model.motor?'当前机构尚不能完成周期，显示范围涵盖已求解部分与当前滑块位置。':'设置角度输入后，会自动计算完整周期的导轨范围。'}</p>`}`);}
    if(sel.type==='attachments'){const values=$('inspector').querySelectorAll('.property-info strong');values[values.length-1].id='attachment-position-value';}
    $('inspector').insertAdjacentHTML('afterbegin',`<div class="selection-banner">● 已选择 ${esc(item.name||item.id)}</div>`);
  }
  function cleanRotors(){for(const l of [...model.links].filter(l=>l.rotor&&!model.gears.some(g=>g.link===l.id)&&!model.cams.some(c=>c.link===l.id))){const used=model.attachments.some(p=>p.link===l.id)||model.nodes.some(n=>n.onLink?.link===l.id)||model.links.some(p=>p.id!==l.id&&[p.a,p.b].includes(l.b))||model.sliders.some(p=>p.guide===l.id||p.block===l.id||p.node===l.b)||model.bodies.some(b=>b.links.includes(l.id));if(used)continue;model.links=model.links.filter(p=>p.id!==l.id);if(!model.links.some(p=>[p.a,p.b].includes(l.b))&&!model.gears.some(g=>g.center===l.b))model.nodes=model.nodes.filter(n=>n.id!==l.b);}M.prune(model);}
  function gearOptions(){
    const worm=$('gear-kind').value==='worm';$('gear-teeth-label').hidden=worm;$('gear-starts-label').hidden=!worm;state.gearRadius=B.radius({kind:$('gear-kind').value,teeth:Number($('gear-teeth').value)||20,module:Number($('gear-module').value)||2});$('gear-instruction').textContent=state.gearDraft?'再选偏心点，可选择现有杆端；偏心距与分度圆分别设置':'先选轴心（空白处固定轴），再选偏心点或现有杆端';
    const chosen=$('mesh-carrier').value;$('mesh-carrier').innerHTML='<option value="">机架（定轴）</option>'+model.links.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');if(model.links.some(l=>l.id===chosen))$('mesh-carrier').value=chosen;$('mesh-direction-label').hidden=$('mesh-kind').value!=='worm';$('mesh-instruction').textContent=state.meshFirst?`已选 ${model.gears.find(g=>g.id===state.meshFirst)?.name||''}，再选择另一只齿轮`:'依次点击两只齿轮；蜗杆先选';
  }
  function gearReadout(){
    $('gear-train').hidden=!model.gears.length;if(!model.gears.length)return;const rr=B.ratios(model),fmt=v=>Number.isFinite(v)?Number(v.toFixed(4)):'—',items=B.train(model,state.motion),carrier=[...new Set(model.meshes.filter(s=>s.carrier).map(s=>s.carrier))];
    $('gear-ratios').innerHTML=items.map(g=>`<button class="gear-row" data-gear-part="${g.id}"><strong>${esc(g.name)}</strong><span>${g.fixed?'固定':g.stopped?'瞬时停转':g.ratio===null?'比值待定':(g.instant?'瞬时 i = ':'i = ')+fmt(g.ratio)}</span><small>${fmt(g.rpm)} rpm · ω = ${fmt(g.omega)} rad/s</small></button>`).join('')+carrier.map(id=>{const w=state.motion?.ok?state.motion.links[id]?.omega:null,r=rr[id],name=model.links.find(l=>l.id===id).name;return`<button class="gear-row" data-carrier-part="${id}"><strong>${esc(name)}</strong><span>${r===undefined?'比值待定':Math.abs(r)<1e-9?'固定':'i = '+fmt(1/r)}</span><small>${fmt(w===null?null:w*30/Math.PI)} rpm · ω = ${fmt(w)} rad/s</small></button>`;}).join('');
    $('mesh-formulas').innerHTML=model.meshes.map(s=>`<div class="mesh-formula">${esc(model.gears.find(g=>g.id===s.a).name)} A → ${esc(model.gears.find(g=>g.id===s.b).name)} B<br>${esc(B.formula(model,s))}<br>${s.carrier?'相对行星架 iᴴ':'定轴 iAB'} = ${fmt(B.terms(model,s).ratio)} <button data-mesh-part="${s.id}">编辑啮合</button></div>`).join('');
    $('gear-sampling').hidden=!model.motor||D.swing(model);if(document.activeElement!==$('gear-turns'))$('gear-turns').value=model.motor?.sampleTurns||1;const turns=B.cycleTurns(model);$('gear-full-cycle').disabled=!model.motor||turns===null||!Object.keys(rr).length;$('gear-cycle-note').textContent=D.swing(model)?'摆动模式按一个往返周期采样。':turns===null?'不能确定常比周期或周期超过 300 输入周，请设置观察圈数。':!Object.keys(rr).length?'先设置输入并约束轮系，即可确定总传动比。':`轮系回位需要输入 ${turns} 周；当前采样 ${model.motor?.sampleTurns||1} 周，累计输入 ${state.angle.toFixed(1)}°。`;
  }
  for(const id of ['gear-kind','gear-teeth','gear-module','gear-starts','mesh-kind'])$(id).addEventListener('change',()=>{gearOptions();draw();});
  $('gear-ratios').addEventListener('click',e=>{const g=e.target.closest('[data-gear-part]')?.dataset.gearPart,c=e.target.closest('[data-carrier-part]')?.dataset.carrierPart;if(g||c)select(g?'gears':'links',g||c);});$('mesh-formulas').addEventListener('click',e=>{const id=e.target.closest('[data-mesh-part]')?.dataset.meshPart;if(id)select('meshes',id);});
  $('gear-turns').onchange=()=>change(()=>{if(model.motor)model.motor.sampleTurns=Number($('gear-turns').value);});$('gear-full-cycle').onclick=()=>change(()=>{if(model.motor)model.motor.sampleTurns=B.cycleTurns(model)||1;});
  function refresh(){draw();parts();inspector();summary();readouts();}
  function select(type,id){state.selection={type,id};if(type==='attachments'||type==='nodes')state.speedNode=id;if(type==='links'&&state.metric==='angular'){const points=M.observers(model),current=points.find(p=>p.id===state.speedNode),candidate=current&&M.referenceLinks(model,current).some(l=>l.id===id)?current:points.find(p=>M.referenceLinks(model,p).some(l=>l.id===id)&&!p.fixed);if(candidate){state.speedNode=candidate.id;state.angularReferences[candidate.id]=id;}}refresh();}
  function setTool(tool){
    state.measureDraft=[];if(tool.startsWith('measure-'))pause();
    if(['point','arm','loop','fixed','pin','slider','gear','mesh'].includes(tool))pause();state.tool=tool;state.pending=null;state.snapNode=null;state.hoverLink=null;state.armBase=null;state.armDraft=null;state.loopDraft=[];state.loopSnap=null;state.sliderDraft=null;state.gearDraft=null;state.meshFirst=null;escapeCount=0;
    document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));$('attachment-options').hidden=!['point','arm'].includes(tool);$('loop-options').hidden=tool!=='loop';
    if(tool==='loop')$('loop-mode').value='hinged';loopReadout();
    $('slider-options').hidden=tool!=='slider';sliderReadout();$('gear-options').hidden=tool!=='gear';$('mesh-options').hidden=tool!=='mesh';gearOptions();
    $('arm-direction-label').hidden=tool!=='arm';$('attachment-instruction').textContent=tool==='point'?'点击母杆任意位置添加轨迹点':'先点击母杆，再点击伸出端位置';
    $('canvas-hint').textContent={gear:'先选轴心，再选偏心点 / 现有杆端 · 空白轴心默认固定',mesh:'依次选择两只齿轮 · 活动轴心需选择行星架',select:'拖动铰点调整结构 · 滚轮缩放 · 右键平移',node:'点击画布添加铰点 · 连按两次 Esc 回到选择',fixed:'空白处添加固定铰点 · 点击已有铰点切换固定 / 活动',pin:'点击母杆添加铰点，随后直接绘制新连杆',link:'靠近铰点自动吸附 · 连按两次 Esc 回到选择',loop:'连续点击顶点，点回起点或 Enter 闭合 · 顶点保持铰接',slider:'先选滑块点，再点方向或母杆 · 属性中设置固连',point:'点击杆上的位置创建轨迹点 · Esc 两次回到选择',arm:'先点击母杆确定连接点，再点击伸出端位置'}[tool];if(tool.startsWith('measure-'))$('canvas-hint').textContent=tool==='measure-distance'?'依次选择两个点测量距离 · Esc 取消':'依次选择 A、顶点、B 测量角度 · Esc 取消';draw();
  }
  function sliderReadout(){const moving=$('slider-frame').value==='moving';$('slider-instruction').textContent=state.sliderDraft?(moving?'再点击安装导槽的母杆':'再点击一个方向点，确定导轨方向'):'先点击滑块铰点或空白位置';}
  $('slider-frame').onchange=()=>{state.sliderDraft=null;sliderReadout();draw();};$('cancel-slider').onclick=()=>{state.sliderDraft=null;sliderReadout();draw();};
  function railOriginAt(s,point){if(s.guide){const f=M.frame(model,s.guide),dx=point.x-f.a.x,dy=point.y-f.a.y;s.origin={x:dx*f.u.x+dy*f.u.y,y:dx*f.n.x+dy*f.n.y};}else s.origin={x:point.x,y:point.y};}
  function loopReadout(){
    const count=state.loopDraft?.length||0,rigid=$('loop-mode').value==='rigid';
    state.loopRigid=rigid;$('finish-loop').disabled=count<3;$('finish-loop').textContent=rigid?'生成整体构件':'闭合回路';
    $('loop-instruction').textContent=(count?`已选 ${count} 个顶点 · `:'')+(rigid?'闭合后作为一个刚性构件':'点回起点闭合 · 顶点保持铰接');
    if(state.tool==='loop')$('canvas-hint').textContent=`已选 ${count} 个顶点 · 点回起点或 Enter 闭合${rigid?' · 整体刚性':' · 保持铰接'}`;
  }
  function loopPoint(vertex){return vertex.id?(state.positions?.[vertex.id]||model.nodes.find(n=>n.id===vertex.id)):vertex;}
  function loopHit(p){
    return (state.loopDraft||[]).findIndex(vertex=>G.distance(p,loopPoint(vertex))*view.scale<=14);
  }
  function finishLoop(){
    const draft=G.clone(state.loopDraft||[]),rigid=$('loop-mode').value==='rigid';if(draft.length<3){toast('闭合回路至少需要三个不同顶点。');return;}
    if(!rigid&&draft.every(v=>v.id)&&draft.every((v,i)=>model.links.some(l=>[l.a,l.b].includes(v.id)&&[l.a,l.b].includes(draft[(i+1)%draft.length].id)))){setTool('select');toast('这些节点已经形成闭合回路。');return;}
    const ok=change(()=>{
      const ids=draft.map(v=>v.id||addNode(v)),edges=[];
      for(let i=0;i<ids.length;i++){
        const a=ids[i],b=ids[(i+1)%ids.length];let link=model.links.find(l=>l.a===a&&l.b===b||l.a===b&&l.b===a);
        if(!link){const length=G.distance(model.nodes.find(n=>n.id===a),model.nodes.find(n=>n.id===b));if(length<.1)throw new Error('轮廓顶点不能重合，边长至少 0.1 mm。');const id=M.nextId(model.links,'L');link={id,name:`连杆 ${id}`,a,b,length,color:M.colors[model.links.length%M.colors.length]};model.links.push(link);}
        edges.push(link.id);
      }
      if(rigid){const id=M.nextId(model.bodies,'R');model.bodies.push({id,name:`整体构件 ${id}`,nodes:ids,links:edges,color:M.colors[model.bodies.length%M.colors.length]});state.selection={type:'bodies',id};}
      else state.selection={type:'links',id:edges.at(-1)};
    });
    if(ok){setTool('select');refresh();toast(rigid?'已生成整体刚性构件。':'已闭合连杆回路，各顶点保持铰接；可整组撤销。');}
  }
  $('finish-loop').onclick=finishLoop;
  $('loop-mode').onchange=()=>{state.loopDraft=[];state.loopSnap=null;loopReadout();draw();};
  function addNode(p,fixed=false){const id=M.nextId(M.observers(model),'P');model.nodes.push({id,name:id,x:p.x,y:p.y,fixed,trace:false});return id;}
  function switchFixed(id){const item=model.nodes.find(n=>n.id===id);item.fixed=!item.fixed;if(model.motor){const l=model.links.find(l=>l.id===model.motor.link);if(model.motor.pivot&&model.motor.pivot===id&&!item.fixed||[l.a,l.b].includes(id)&&model.motor.pivot&&model.motor.pivot!==id&&item.fixed||!model.motor.pivot&&[l.a,l.b].every(x=>model.nodes.find(n=>n.id===x).fixed))model.motor=null;}}
  function snapped(p){const step=G.gridStep(view.scale);return $('snap-grid').checked?{x:Math.round(p.x/step)*step,y:Math.round(p.y/step)*step}:p;}
  function jointAt(p){return $('snap-joints').checked?G.snapNode(model.nodes,state.positions,p,view.scale):null;}
  function linkAt(p){let best=null,distance=14/view.scale;const pos=M.positions(model,state.positions);for(const link of model.links){const hit=G.projectSegment(p,pos[link.a],pos[link.b]);if(hit.distance<=distance){best={...hit,link:link.id};distance=hit.distance;}}return best;}
  function addAttachment(link,t,vector=null){const id=M.nextId(M.observers(model),'T');model.attachments.push({id,name:id,link,t,along:vector?.along||0,normal:vector?.normal||0,arm:!!vector,trace:true});state.selection={type:'attachments',id};state.speedNode=id;return id;}
  function armDraft(p){const base=state.armBase;if(!base)return null;const f=M.frame(model,base.link,state.positions),anchor={x:f.a.x+(f.b.x-f.a.x)*base.t,y:f.a.y+(f.b.y-f.a.y)*base.t},dx=p.x-anchor.x,dy=p.y-anchor.y;return{...base,along:$('arm-direction').value==='perpendicular'?0:dx*f.u.x+dy*f.u.y,normal:dx*f.n.x+dy*f.n.y,arm:true};}
  function removeSelection(){
    if(!state.selection)return;const {type,id}=state.selection;
    change(()=>{
      if(type==='nodes'){model.nodes=model.nodes.filter(n=>n.id!==id);model.links=model.links.filter(l=>l.a!==id&&l.b!==id);model.sliders=model.sliders.filter(s=>s.node!==id);}
      else model[type]=model[type].filter(x=>x.id!==id);
      if(type==='gears')cleanRotors();
      M.prune(model);
      state.selection=null;
    });
  }
  function actionDialog(title,description,initialValue=null,numeric=false){
    const d=$('action-dialog');$('action-title').textContent=title;$('action-description').textContent=description;
    $('action-input-label').hidden=initialValue===null;$('action-input-caption').textContent=numeric?'杆长 / mm':'名称';
    const input=$('action-input');input.type=numeric?'number':'text';input.required=initialValue!==null;input.min=numeric?'0.1':'';input.max=numeric?'1000000':'';input.step=numeric?'any':'';input.value=initialValue??'';
    d.returnValue='';d.showModal();if(initialValue!==null){input.focus();input.select();}
    return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'?{value:$('action-input').value.trim()}:null),{once:true}));
  }
  async function editLength(id){
    pause();const l=model.links.find(l=>l.id===id);if(!l)return;
    state.selection={type:'links',id};refresh();
    const body=M.bodyForLink(model,id);if(body){toast('该边属于整体刚性构件，请拖动轮廓顶点或修改顶点坐标来调整形状。');return;}
    const answer=await actionDialog('修改杆长',`${l.name} · ${l.a} ↔ ${l.b}。确认后按新尺寸重新闭合机构。`,String(Number(l.length.toFixed(6))),true);
    if(!answer)return;const length=Number(answer.value);
    if(!answer.value||!Number.isFinite(length)||length<.1||length>1e6){toast('杆长范围为 0.1～1000000 mm。');return;}
    if(length!==l.length)change(()=>model.links.find(x=>x.id===id).length=length,true);
  }
  $('action-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.form.requestSubmit(e.target.form.querySelector('[value="ok"]'));}});
  async function replaceModel(next,example=null,presentation=null){
    const validated=M.validate(next);
    if(changed&&!(await actionDialog('切换机构','当前机构已自动保存。建议先点击“导出 → 机构 JSON”保留文件；切换后可使用撤销恢复。')))return false;
    snapshot();model=validated;state.drawing=presentation?.drawing?X.read(presentation.drawing,model):X.empty();initial();state.selection=null;state.speedNode=M.observers(model).find(p=>p.trace)?.id||null;state.angularReferences={};setTool('select');persist();changed=false;caseLoadWarning='';
    if(presentation){
      for(const [key,id] of [['showGrid','show-grid'],['showDimensions','show-dimensions'],['showTraces','show-traces'],['showSpeed','show-speed']]){state[key]=presentation[key];$(id).checked=presentation[key];}
      $('snap-grid').checked=presentation.snapGrid;$('snap-joints').checked=presentation.snapJoints;
      state.metric=presentation.metric;$('motion-metric').value=presentation.metric;state.speedNode=presentation.speedNode;state.angularReferences={...presentation.angularReferences};
      if(model.motor){if(D.swing(model))state.phase=presentation.drivePhase;else if(!model.gears.length)state.angle=normalize(state.angle);if(!moveTo(presentation.angle,false))caseLoadWarning=`案例已加载，当前位形未能求解：${state.lastResult?.message||'输入角度不可达'}`;}
      if(presentation.restoreTraces){const result=S.sweep(model,1);if(result.ok)recordCycle(result,M.observers(model).filter(p=>p.trace));else caseLoadWarning=`案例已加载，无法计算完整轨迹：${result.message}`;}
    }
    document.querySelectorAll('[data-example]').forEach(b=>b.classList.toggle('active',b.dataset.example===example));refresh();V.fit(stage,model,state,view);draw();return true;
  }
  function history(direction){
    const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;
    if(!from.length)return;pause();to.push(historyEntry());const entry=from.pop();model=entry.model;state.drawing=entry.drawing;initial();setTool('select');state.selection=null;persist();refresh();
  }
  $('examples-btn').onclick=()=>{pause();$('examples-dialog').showModal();};
  $('examples-close').onclick=()=>$('examples-dialog').close();
  $('examples-dialog').addEventListener('click',e=>{if(e.target===$('examples-dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
  $('examples').addEventListener('click',async e=>{const b=e.target.closest('[data-example]');if(b){$('examples-dialog').close();if(!(await replaceModel(M.example(b.dataset.example),b.dataset.example)))$('examples-dialog').showModal();else $('examples-btn').focus();}});
  $('case-list').addEventListener('click',async e=>{
    const remove=e.target.closest('[data-remove-case]'),load=e.target.closest('[data-case]');
    if(remove){const item=savedCases[Number(remove.dataset.removeCase)];if(item){savedCases.splice(Number(remove.dataset.removeCase),1);if(activeCase===item)activeCase=null;persistCases();toast(caseStorageOK?'已从案例列表移除，当前机构和已导出的文件仍可使用。':'已从本次列表移除，浏览器无法保存列表更改。');}return;}
    if(load){const file=savedCases[Number(load.dataset.case)];if(file){const c=C.read(file);if(await replaceModel(c.model,null,c.presentation)){activeCase=file;renderCases();if(caseLoadWarning)toast(caseLoadWarning);}}}
  });
  document.querySelectorAll('[data-list]').forEach(b=>b.addEventListener('click',()=>{listType=b.dataset.list;document.querySelectorAll('[data-list]').forEach(x=>x.classList.toggle('active',x===b));parts();}));
  $('parts-list').addEventListener('click',e=>{const b=e.target.closest('[data-part]');if(b)select(listType,b.dataset.part);});
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  const editedFields=new WeakSet();
  $('inspector').addEventListener('input',e=>editedFields.add(e.target));
  function applyProperty(e){
    if(e.type==='focusout'&&!editedFields.has(e.target))return;
    editedFields.delete(e.target);
    const key=e.target.dataset.property;if(!key||!state.selection)return;
    const sel={...state.selection},raw=e.target.type==='checkbox'?e.target.checked:e.target.type==='number'?Number(e.target.value):e.target.value;
    const existing=model[sel.type].find(x=>x.id===sel.id),current=key==='originX'?existing.origin?.x:key==='originY'?existing.origin?.y:key==='pinPercent'?existing.onLink?.t*100:key==='percent'?existing.t*100:key==='armLength'?Math.hypot(existing.along,existing.normal):key==='armAngle'?G.deg(Math.atan2(existing.normal,existing.along)):['guide','block','carrier'].includes(key)?existing[key]||'':existing[key];if(current===raw)return;
    if(e.target.type==='number'&&(!e.target.value.trim()||!Number.isFinite(raw))){toast('请输入有效数值。');inspector();return;}
    if(sel.type==='links'&&key==='length'&&M.bodyForLink(model,sel.id)){toast('请修改整体构件的顶点坐标来调整轮廓。');inspector();return;}
    change(()=>{
      const item=model[sel.type].find(x=>x.id===sel.id);
      if(sel.type==='gears'&&['teeth','module','starts'].includes(key)){const prior=B.cycleTurns(model),auto=model.motor?.sampleTurns===prior;B.resize(model,item.id,key,raw);if(auto)model.motor.sampleTurns=B.cycleTurns(model)||1;}
      else if(sel.type==='gears'&&key==='link'){item.link=raw;cleanRotors();}
      else if(sel.type==='meshes'&&key==='direction'){item.direction=Number(raw);}
      else if(sel.type==='meshes'&&['a','b','type','carrier'].includes(key)){item[key]=raw;if(!item.carrier)delete item.carrier;if(item.type==='worm')item.direction=item.direction||1;else delete item.direction;B.align(model,item);}
      else if(sel.type==='sliders'&&key==='guide'){
        const old=M.railPose(model,item),worldOrigin=old.origin;if(raw){item.guide=raw;railOriginAt(item,worldOrigin);const f=M.frame(model,raw);item.angle=old.angle-G.deg(Math.atan2(f.u.y,f.u.x));}else{delete item.guide;item.origin={...worldOrigin};item.angle=old.angle;}
      }else if(sel.type==='sliders'&&key==='block'){if(raw){item.block=raw;const f=M.frame(model,raw);item.blockAngle=G.deg(Math.atan2(f.u.y,f.u.x))-M.railPose(model,item).angle;}else{delete item.block;delete item.blockAngle;}}
      else if(sel.type==='nodes'&&key==='pinPercent'){item.onLink.t=raw/100;const l=model.links.find(l=>l.id===item.onLink.link);if(raw<=0||raw>=100||Math.min(raw,100-raw)/100*l.length<.1)throw new Error('杆上铰点需距两端至少 0.1 mm。');recalculateLengths(item.id);}
      else if(sel.type==='attachments'&&key==='percent')item.t=raw/100;
      else if(sel.type==='attachments'&&['armLength','armAngle'].includes(key)){const length=key==='armLength'?raw:Math.hypot(item.along,item.normal),angle=key==='armAngle'?G.rad(raw):Math.atan2(item.normal,item.along);if(length<.1||length>1e6)throw new Error('伸出杆长度范围为 0.1～1000000 mm。');item.along=length*Math.cos(angle);item.normal=length*Math.sin(angle);}
      else if(sel.type==='nodes'&&['x','y'].includes(key))Z.moveNode(model,item.id,{x:key==='x'?raw:item.x,y:key==='y'?raw:item.y});
      else if(key==='originX'||key==='originY')item.origin[key==='originX'?'x':'y']=raw;
      else item[key]=raw;
      if(sel.type==='nodes'&&['x','y'].includes(key)){
        recalculateLengths();
      }
    },sel.type==='sliders'||sel.type==='gears'||sel.type==='meshes'||key==='length');
  }
  $('inspector').addEventListener('change',applyProperty);
  $('inspector').addEventListener('focusout',applyProperty);
  $('inspector').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.property){e.preventDefault();applyProperty(e);}});
  $('inspector').addEventListener('click',e=>{
    if(e.target.closest('#edit-cam')){camDesigner.open(state.selection.id);return;}
    if(e.target.closest('#cam-reference')){select('links',model.cams.find(c=>c.id===state.selection.id).link);return;}
    if(e.target.closest('#gear-reference')){const g=model.gears.find(g=>g.id===state.selection.id);select('links',g.link);return;}
    if(e.target.closest('#remove-mesh')){removeSelection();return;}
    if(e.target.closest('#release-body')){removeSelection();toast('已释放整体构件，轮廓边保留为独立铰接连杆。');}
    if(e.target.closest('#add-midpoint'))change(()=>addAttachment(state.selection.id,.5));
    if(e.target.closest('#start-arm'))setTool('arm');
    if(e.target.closest('#set-motor'))change(()=>{
      const l=model.links.find(l=>l.id===(state.selection.type==='gears'?model.gears.find(g=>g.id===state.selection.id).link:state.selection.id)),a=model.nodes.find(n=>n.id===l.a),b=model.nodes.find(n=>n.id===l.b),pivot=a.fixed?a:b.fixed?b:null,tip=pivot?.id===b.id?a:b;
      model.motor={link:l.id,pivot:pivot?.id||null,initialAngle:normalize(G.deg(Math.atan2(tip.y-(pivot||a).y,tip.x-(pivot||a).x))),rpm:12};
    });
    if(e.target.closest('#remove-motor'))change(()=>model.motor=null);
  });
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  stage.addEventListener('pointerdown',e=>{
    escapeCount=0;state.hoverSample=null;$('trace-tooltip').hidden=true;
    if(e.button===1||e.button===2){drag={type:'pan',x:e.clientX,y:e.clientY,vx:view.x,vy:view.y};stage.setPointerCapture(e.pointerId);return;}
    if(e.button!==0)return;
    const raw=V.world(stage,view,e),dimension=e.target.closest('[data-dimension]')?.dataset.dimension;
    if(dimension&&state.tool==='select'){editLength(dimension);return;}
    const p=snapped(raw),node=e.target.closest('[data-node]')?.dataset.node||(['link','loop','fixed','pin','slider','gear'].includes(state.tool)?jointAt(raw):null),link=e.target.closest('[data-link]')?.dataset.link,rail=e.target.closest('[data-rail-handle]')?.dataset.railHandle||e.target.closest('[data-slider]')?.dataset.slider;
    const attachment=e.target.closest('[data-attachment]')?.dataset.attachment;
    const gear=e.target.closest('[data-gear]')?.dataset.gear||model.gears.find(g=>g.center===node||model.links.find(l=>l.id===g.link&&[l.a,l.b].includes(node)))?.id,mesh=e.target.closest('[data-mesh]')?.dataset.mesh;
    if(state.tool==='gear'){
      if(!state.gearDraft){state.gearDraft=node?{node}:{point:p};gearOptions();draw();return;}
      const draft=state.gearDraft;if(node&&node===draft.node){toast('请选择不同于轴心的偏心点。');return;}
      if(change(()=>{const center=draft.node||addNode(draft.point,true),tip=node||addNode(p),g=B.create(model,center,tip,{kind:$('gear-kind').value,teeth:Number($('gear-teeth').value),module:Number($('gear-module').value),starts:Number($('gear-starts').value)});state.selection={type:'gears',id:g.id};})){setTool('select');refresh();toast('齿轮已添加，选择啮合或从偏心点绘制连杆。');}return;
    }
    if(state.tool==='mesh'){
      if(!gear){toast('请点击齿轮的轮廓或名称。');return;}
      if(!state.meshFirst){state.meshFirst=gear;gearOptions();draw();return;}
      if(state.meshFirst===gear){toast('请选择另一只齿轮。');return;}
      const first=state.meshFirst;if(change(()=>{const relation=B.mesh(model,first,gear,$('mesh-kind').value,$('mesh-carrier').value,Number($('mesh-direction').value));B.align(model,relation);state.selection={type:'meshes',id:relation.id};if(model.motor)model.motor.sampleTurns=B.cycleTurns(model)||1;},true)){setTool('select');refresh();toast('已建立啮合关系，传动比显示在右侧。');}return;
    }
    if(state.tool==='fixed'){
change(()=>{if(node)switchFixed(node);const id=node||addNode(p,true);state.selection={type:'nodes',id};});return;}
    if(state.tool==='pin'){
      const hit=linkAt(raw);if(!node&&!hit){toast('请点击母杆上的位置。');return;}let id=node;
      if(!id&&!change(()=>{id=M.addPin(model,hit.link,hit.t);state.selection={type:'nodes',id};state.speedNode=id;}))return;
      setTool('link');state.pending=id;state.selection={type:'nodes',id};refresh();toast('铰点已就绪，点击另一个节点或空白处绘制新连杆。');return;
    }
    if(state.tool==='loop'){
      const hit=loopHit(raw),draft=state.loopDraft;
      if(hit===0&&draft.length>=3){finishLoop();return;}
      if(hit>=0||node&&draft.some(v=>v.id===node)){toast('请选取新的顶点，至少三个顶点后点回起点闭合。');return;}
      if(draft.length>=($('loop-mode').value==='rigid'?12:80)){toast('已达到轮廓顶点上限，请闭合或取消。');return;}
      draft.push(node?{id:node}:p);state.pointer=node?loopPoint({id:node}):p;loopReadout();draw();return;
    }
    if(state.tool==='point'||state.tool==='arm'){
      if(state.tool==='arm'&&state.armBase){const draft=armDraft(p);if(Math.hypot(draft.along,draft.normal)<.1){toast('伸出杆长度不能小于 0.1 mm。');return;}change(()=>addAttachment(draft.link,draft.t,draft));state.armBase=null;state.armDraft=null;state.hoverLink=null;setTool('select');refresh();return;}
      const hit=linkAt(raw);if(!hit){toast('请点击母杆上的位置。');return;}
      if(state.tool==='point'){change(()=>addAttachment(hit.link,hit.t));setTool('select');refresh();}
      else{state.armBase={link:hit.link,t:hit.t};state.armDraft=null;$('attachment-instruction').textContent='移动鼠标预览，再点击确定伸出端位置';draw();}return;
    }
    if(state.tool==='node'){change(()=>{const id=addNode(p);state.selection={type:'nodes',id};});return;}
    if(state.tool==='slider'){
      if(!state.sliderDraft){const existing=model.sliders.find(s=>s.node===node);if(existing){select('sliders',existing.id);return;}state.sliderDraft=node?{node}:{point:p};sliderReadout();draw();return;}
      const draft=state.sliderDraft,moving=$('slider-frame').value==='moving',hit=moving?linkAt(raw):null,point=draft.node?(state.positions?.[draft.node]||model.nodes.find(n=>n.id===draft.node)):draft.point;
      if(moving&&!hit){toast('请点击安装导槽的母杆。');return;}
      if(!moving&&G.distance(point,p)<1){toast('方向点与滑块点至少相隔 1 mm。');return;}
      if(!moving&&draft.node&&model.nodes.find(n=>n.id===draft.node).fixed){toast('固定中心请使用活动导槽来创建摇块。');return;}
      const ok=change(()=>{const nodeId=draft.node||addNode(point),id=M.nextId(model.sliders,'S'),rail={id,node:nodeId,origin:{x:point.x,y:point.y},angle:moving?0:G.deg(Math.atan2(p.y-point.y,p.x-point.x)),length:moving?Math.max(180,model.links.find(l=>l.id===hit.link).length*1.6):G.distance(point,p)*2};if(moving){rail.guide=hit.link;railOriginAt(rail,point);}model.sliders.push(rail);state.selection={type:'sliders',id};});
      if(ok){state.sliderDraft=null;sliderReadout();setTool('select');refresh();toast('已建立移动副；可在属性中选择与杆件固连。');}return;
    }
    if(state.tool==='link'){
      let id=node;
      if(!id)change(()=>{id=addNode(p);});
      if(!state.pending){state.pending=id;draw();return;}
      if(id===state.pending){toast('请选择另一个铰点。');return;}
      if(model.links.some(l=>[l.a,l.b].includes(id)&&[l.a,l.b].includes(state.pending))){toast('这两个铰点已经有连杆连接。');return;}
      const a=state.pending;
      change(()=>{const lId=M.nextId(model.links,'L'),length=G.distance(model.nodes.find(n=>n.id===a),model.nodes.find(n=>n.id===id));if(length<0.1)throw new Error('连杆的两个端点不能重合。');model.links.push({id:lId,name:`连杆 ${lId}`,a,b:id,length,color:M.colors[model.links.length%M.colors.length]});state.pending=null;state.selection={type:'links',id:lId};});return;
    }
    if(attachment){select('attachments',attachment);if(e.target.closest('[data-attachment-tip]')){drag={type:'attachment',id:attachment,screenX:e.clientX,screenY:e.clientY,moved:false};stage.setPointerCapture(e.pointerId);}}
    else if(node){select('nodes',node);drag={type:'node',id:node,start:V.world(stage,view,e),screenX:e.clientX,screenY:e.clientY,moved:false};stage.setPointerCapture(e.pointerId);}
    else if(e.target.closest('[data-cam]'))select('cams',e.target.closest('[data-cam]').dataset.cam);
    else if(gear)select('gears',gear);
    else if(mesh)select('meshes',mesh);
    else if(link)select('links',link);
    else if(rail){select('sliders',rail);drag={type:'rail',id:rail,start:raw,screenX:e.clientX,screenY:e.clientY,moved:false};stage.setPointerCapture(e.pointerId);}
    else if(e.target.closest('[data-body]'))select('bodies',e.target.closest('[data-body]').dataset.body);
    else{state.selection=null;refresh();}
  });
  stage.addEventListener('pointermove',e=>{
    const p=V.world(stage,view,e);state.pointer=p;$('pointer-coordinates').textContent=`X ${p.x.toFixed(1)} · Y ${p.y.toFixed(1)} mm`;
    if(drag?.type==='pan'){view.x=drag.vx+e.clientX-drag.x;view.y=drag.vy+e.clientY-drag.y;draw();return;}
    if(drag?.type==='node'||drag?.type==='rail'){
      if(!drag.moved&&Math.hypot(e.clientX-drag.screenX,e.clientY-drag.screenY)<3)return;
      if(!drag.moved){snapshot();materialize();drag.base=G.clone(model);drag.original=drag.type==='node'?G.clone(model.nodes.find(n=>n.id===drag.id)):G.clone(M.railPose(model,model.sliders.find(s=>s.id===drag.id)).origin);drag.moved=true;}
      const next=snapped({x:drag.original.x+p.x-drag.start.x,y:drag.original.y+p.y-drag.start.y}),before=model;
      try{model=G.clone(drag.base);if(drag.type==='node')Z.moveNode(model,drag.id,next);else Z.moveRail(model,drag.id,{x:next.x-drag.original.x,y:next.y-drag.original.y});recalculateLengths();drag.error=null;}catch(error){model=before;motionCache=null;drag.error=error.message;}
      draw();return;
    }
    if(drag?.type==='attachment'){
      if(!drag.moved&&Math.hypot(e.clientX-drag.screenX,e.clientY-drag.screenY)<3)return;
      if(!drag.moved){snapshot();materialize();drag.moved=true;}
      const item=model.attachments.find(x=>x.id===drag.id),f=M.frame(model,item.link),next=snapped(p);
      if(item.arm){const anchor=M.attachmentPose(model,item).anchor,dx=next.x-anchor.x,dy=next.y-anchor.y;item.along=dx*f.u.x+dy*f.u.y;item.normal=dx*f.n.x+dy*f.n.y;}
      else item.t=G.projectSegment(p,f.a,f.b).t;
      motionCache=null;draw();return;
    }
    if(state.tool==='point'||state.tool==='arm'||state.tool==='pin'){state.hoverLink=state.armBase?null:linkAt(p);state.armDraft=armDraft(snapped(p));state.snapNode=state.tool==='pin'?jointAt(p):null;draw();return;}
    if(state.tool==='fixed'){state.snapNode=jointAt(p);draw();return;}
    if(state.tool==='slider'){state.snapNode=jointAt(p);state.hoverLink=$('slider-frame').value==='moving'?linkAt(p):null;sliderReadout();draw();return;}
    if(state.tool==='loop'){
      const hit=loopHit(p),id=jointAt(p);state.loopSnap=hit>=0?hit:null;state.snapNode=hit>=0?state.loopDraft[hit].id:id;
      state.pointer=hit>=0?loopPoint(state.loopDraft[hit]):id?loopPoint({id}):snapped(p);
      $('canvas-hint').textContent=hit===0&&state.loopDraft.length>=3?'已吸附起点 · 点击闭合':`已选 ${state.loopDraft.length} 个顶点 · 点回起点或 Enter 闭合`;draw();return;
    }
    if(state.tool==='link'){
      const id=jointAt(p);state.snapNode=id;state.pointer=id?(state.positions?.[id]||model.nodes.find(n=>n.id===id)):snapped(p);
      $('canvas-hint').textContent=id?`已吸附铰点 ${model.nodes.find(n=>n.id===id).name} · 点击连接`:'靠近铰点自动吸附 · 连按两次 Esc 回到选择';draw();return;
    }
    let sample=null,distance=9/view.scale;
    if(state.tool==='select'&&state.showTraces&&state.showSpeed)for(const n of M.observers(model).filter(n=>n.trace))for(const point of state.traces[n.id]||[]){const d=G.distance(p,point);if(d<distance){sample={...point,id:n.id,name:n.name,type:n.type,link:n.link};distance=d;}}
    const previousSample=state.hoverSample;state.hoverSample=sample;
    const tooltip=$('trace-tooltip');tooltip.hidden=!sample;
    if(sample){const r=stage.getBoundingClientRect(),w=stage.clientWidth,h=stage.clientHeight,value=K.value(state,sample,sample),meta=K.metadata[state.metric];tooltip.textContent=`${sample.name} · ${meta.name} ${Number.isFinite(value)?value.toFixed(2)+' '+meta.unit:'暂不可用'} · ${(D.swing(model)?sample.angle:normalize(sample.angle)).toFixed(1)}°`;tooltip.style.left=G.clamp(e.clientX-r.left+14,8,Math.max(8,w-300))+'px';tooltip.style.top=G.clamp(e.clientY-r.top-45,8,Math.max(8,h-55))+'px';}
    if(state.pending||sample?.id!==previousSample?.id||sample?.angle!==previousSample?.angle)draw();
  });
  stage.addEventListener('pointerleave',()=>{if(drag)return;state.snapNode=null;state.loopSnap=null;state.hoverLink=null;state.hoverSample=null;$('trace-tooltip').hidden=true;draw();});
  function endDrag(){const finished=drag;drag=null;if(finished?.moved){try{model=M.validate(model);persist();}catch(e){const entry=undo.pop();model=entry.model;state.drawing=entry.drawing;initial();toast(e.message);}refresh();if(finished.error)toast(finished.error);}}
  stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);
  stage.addEventListener('keydown',e=>{if(e.key==='Enter'&&state.tool==='loop'){e.preventDefault();e.stopPropagation();finishLoop();return;}if(e.key==='Enter'||e.key===' '){const cam=e.target.closest('[data-cam]')?.dataset.cam;if(cam){e.preventDefault();e.stopPropagation();select('cams',cam);return;}const g=e.target.closest('[data-gear]')?.dataset.gear,m=e.target.closest('[data-mesh]')?.dataset.mesh;if(g||m){e.preventDefault();e.stopPropagation();select(g?'gears':'meshes',g||m);return;}const d=e.target.closest('[data-dimension]')?.dataset.dimension;if(d){e.preventDefault();e.stopPropagation();editLength(d);return;}const n=e.target.closest('[data-node]')?.dataset.node,l=e.target.closest('[data-link]')?.dataset.link,s=e.target.closest('[data-rail-handle]')?.dataset.railHandle||e.target.closest('[data-slider]')?.dataset.slider,a=e.target.closest('[data-attachment]')?.dataset.attachment,b=e.target.closest('[data-body]')?.dataset.body;if(n||l||s||a||b){e.preventDefault();e.stopPropagation();select(a?'attachments':n?'nodes':l?'links':s?'sliders':'bodies',a||n||l||s||b);}}});
  function zoom(factor,point){
    const old=view.scale,next=G.clamp(old*factor,0.1,60),r=stage.getBoundingClientRect(),x=point?point.clientX-r.left-r.width/2:0,y=point?point.clientY-r.top-r.height/2:0;
    view.x=x-(x-view.x)*next/old;view.y=y-(y-view.y)*next/old;view.scale=next;draw();
  }
  stage.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*0.001),e);},{passive:false});
  $('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('fit-btn').onclick=()=>{V.fit(stage,model,state,view,true);draw();};
  function play(){
    if(state.playing){pause();readouts();return;}
    if(!model.motor){toast('先选择连杆，将它设为角度输入。');return;}
    if(model.motor.rpm===0){toast('请把转速 / 频率设置为非零值。');return;}
    if(!moveTo(state.angle))return;
    if(['point','arm','loop','pin','fixed','slider'].includes(state.tool))setTool('select');
    state.pending=null;lastTime=0;state.playing=true;$('play-btn').innerHTML='<svg><use href="#i-pause"/></svg><span>暂停仿真</span>';$('stage-state').textContent='仿真运行中';readouts();
  }
  $('play-btn').onclick=play;
  $('playback-rate').addEventListener('input',()=>setPlaybackRate(Number($('playback-rate').value)));
  $('playback-reset').onclick=()=>setPlaybackRate(1);
  $('step-btn').onclick=()=>{pause();if(D.swing(model))advancePhase(state.phase+(model.motor.rpm<0?-2:2));else moveTo(state.angle+2);};
  $('reset-btn').onclick=()=>{initial();refresh();};
  $('angle-range').addEventListener('input',()=>{pause();moveTo(D.swing(model)?Number($('angle-range').value):Math.floor(state.angle/360)*360+Number($('angle-range').value));});
  function bindNumber(id,handler){const input=$(id);let dirty=false;input.addEventListener('input',()=>dirty=true);const commit=()=>{if(!dirty)return;dirty=false;handler();};input.addEventListener('change',commit);input.addEventListener('focusout',commit);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();}});}
  bindNumber('angle-input',()=>{const value=Number($('angle-input').value),min=D.swing(model)?model.motor.minAngle:0,max=D.swing(model)?model.motor.maxAngle:360;if(!$('angle-input').value.trim()||!Number.isFinite(value)||value<min||value>max){toast(`请输入 ${min}～${max}° 的角度。`);readouts();return;}pause();moveTo(D.swing(model)?value:Math.floor(state.angle/360)*360+value);});
  $('input-mode').onchange=()=>{const mode=$('input-mode').value;if(!model.motor)return;change(()=>{const d=model.motor;if(mode==='swing'){Object.assign(d,{mode:'swing',minAngle:d.initialAngle-30,maxAngle:d.initialAngle+30});delete d.initialPhase;}else{delete d.mode;delete d.minAngle;delete d.maxAngle;delete d.initialPhase;d.initialAngle=normalize(d.initialAngle);}const r=S.sweep(M.validate(model));if(!r.ok)throw new Error(mode==='swing'?`摆动范围内 ${r.angle.toFixed(1)}° 不可达，请调整机构或缩小范围。`:`该机构不能整周回转：${r.angle.toFixed(1)}° 不可达，请使用区间摆动。`);},true);};
  function commitSwing(){if(!D.swing(model))return;const min=Number($('swing-min').value),max=Number($('swing-max').value);if(!$('swing-min').value.trim()||!$('swing-max').value.trim()||!Number.isFinite(min)||!Number.isFinite(max)){toast('请输入有效的摆动范围。');return;}change(()=>{const d=model.motor;d.minAngle=min;d.maxAngle=max;d.initialAngle=G.clamp(d.initialAngle,min,max);delete d.initialPhase;const checked=M.validate(model),r=S.sweep(checked);if(!r.ok)throw new Error(`摆动范围内 ${r.angle.toFixed(1)}° 不可达，请缩小范围。`);},true);}
  $('apply-swing').onclick=commitSwing;for(const id of ['swing-min','swing-max'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitSwing();}});
  bindNumber('rpm-input',()=>{const rpm=Number($('rpm-input').value);if(!$('rpm-input').value.trim()||!Number.isFinite(rpm)||Math.abs(rpm)>300){toast(D.swing(model)?'摆动频率范围为 −300～300 次/分。':'转速范围为 −300～300 rpm。');$('rpm-input').value=model.motor?.rpm??12;return;}if(model.motor?.rpm!==rpm)change(()=>{if(model.motor)model.motor.rpm=rpm;});});
  $('show-dimensions').onchange=()=>{state.showDimensions=$('show-dimensions').checked;draw();};
  $('show-traces').onchange=()=>{state.showTraces=$('show-traces').checked;state.hoverSample=null;$('trace-tooltip').hidden=true;draw();};
  $('show-grid').onchange=()=>{state.showGrid=$('show-grid').checked;draw();};
  $('show-speed').onchange=()=>{state.showSpeed=$('show-speed').checked;state.hoverSample=null;$('trace-tooltip').hidden=true;draw();};
  $('snap-joints').onchange=()=>{state.snapNode=null;draw();};
  $('speed-node').onchange=()=>{state.speedNode=$('speed-node').value;draw();};
  $('motion-metric').onchange=()=>{state.metric=$('motion-metric').value;state.hoverSample=null;$('trace-tooltip').hidden=true;if(state.selection?.type==='links')select('links',state.selection.id);else draw();};
  $('angular-reference').onchange=()=>{state.angularReferences[state.speedNode]=$('angular-reference').value;state.hoverSample=null;$('trace-tooltip').hidden=true;draw();};
  $('arm-direction').onchange=()=>{state.armDraft=state.pointer?armDraft(snapped(state.pointer)):null;draw();};
  $('delete-btn').onclick=removeSelection;$('undo-btn').onclick=()=>history('undo');$('redo-btn').onclick=()=>history('redo');
  $('new-btn').onclick=()=>replaceModel(M.empty());
  $('rename-btn').onclick=async()=>{const a=await actionDialog('重命名机构','为你的设计取个名字。',model.name);if(a?.value)change(()=>model.name=a.value);};
  $('help-btn').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>$('help-dialog').close());
  function filename(ext){return `${model.name.replace(/[\\/:*?"<>|]/g,'_')||'机构'}.${ext}`;}
  function download(contents,name,type){const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function curveReady(){return curveModel===model&&curveData?.frames.length&&curveLines.some(l=>l.points.some(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
  function openExport(fromCurve=false){pause();returnToCurves=fromCurve;if($('curves-dialog').open)$('curves-dialog').close();$('curve-pdf-btn').disabled=!curveReady();$('curve-csv-btn').disabled=!curveReady();$('export-dialog').showModal();}
  function closeExport(){if($('export-dialog').open)$('export-dialog').close();}
  $('export-btn').onclick=()=>openExport();$('export-close').onclick=closeExport;
  $('export-dialog').addEventListener('close',()=>{if(returnToCurves){returnToCurves=false;$('curves-dialog').showModal();}else $('export-btn').focus();});
  function curvePointOptions(){
    const angular=$('curve-y').value==='angular';
    $('curve-points').innerHTML=M.observers(model).map(p=>{const links=M.referenceLinks(model,p),reference=state.angularReferences[p.id]||links[0]?.id;return`<div class="curve-point-option"><label><input type="checkbox" data-curve-point="${p.id}" ${curveSelected.includes(p.id)?'checked':''}>${esc(p.name)}</label>${angular?`<select data-curve-reference="${p.id}" aria-label="${esc(p.name)}角速度参考杆" ${p.type==='attachments'||!links.length?'disabled':''}>${links.map(l=>`<option value="${l.id}" ${l.id===reference?'selected':''}>${esc(l.name)}</option>`).join('')}</select>`:''}</div>`;}).join('');
  }
  function curveExplanation(metric,axis){
    if(axis==='x'&&metric==='y')return 'X、Y 使用相同的长度比例，按运动顺序连接轨迹；悬停查看同一输入位形下各点的坐标。';
    if(metric==='components')return '同色代表同一节点：实线 Vx，虚线 Vy；分速度保留正负号，按输入转速 / 频率计算。';
    return '速度与加速度按当前输入模式及频率计算，不确定数据处曲线断开。';
  }
  function renderCurves(){
    const metric=$('curve-y').value,axis=$('curve-x').value,valid=curveModel===model&&curveData;
    curveLines=valid?Q.series(model,curveData,curveSelected,metric,axis,state.angularReferences):[];
    $('curve-plot').innerHTML=Q.svg(curveLines,metric,axis,!!curveData?.ok&&!!curveData?.angleCycle);$('curve-tooltip').hidden=true;
    $('curve-legend').innerHTML=curveLines.map(l=>{const values=l.points.map(p=>p.y).filter(Number.isFinite),xs=l.points.map(p=>p.x).filter(Number.isFinite),min=values.length?Math.min(...values):null,max=values.length?Math.max(...values):null,range=`${Q.format(min)} ～ ${Q.format(max)} ${Q.metrics[metric].unit}`;return`<div><span class="curve-swatch ${l.dash?'dashed':''}" style="${l.dash?'color:'+l.color:'background:'+l.color}"></span><strong>${esc(l.name)}</strong><small>${axis==='x'?`X ${Q.format(xs.length?Math.min(...xs):null)} ～ ${Q.format(xs.length?Math.max(...xs):null)} mm · ${metric==='y'?'Y ':''}`:''}${range}</small></div>`;}).join('');
    for(const button of document.querySelectorAll('[data-curve-preset]'))button.setAttribute('aria-pressed',String(button.dataset.curvePreset==='xy'?axis==='x'&&metric==='y':metric==='components'));
    $('curve-export-open').disabled=!curveReady();$('curve-compute').disabled=curveBusy||!model.motor;
    if(!curveBusy)$('curve-status').textContent=!model.motor?'请先给机构设置角度输入。':!valid?'点击“计算 / 更新曲线”生成周期数据。':!curveSelected.length?'请选择至少一个节点。':axis==='time'&&model.motor.rpm===0?'转速 / 频率为 0，时间轴不可用；请选择输入角度。':`${curveData.message} ${curveExplanation(metric,axis)}`;
  }
  function computeCurves(){
    if(curveBusy||!model.motor)return;curveBusy=true;$('curve-compute').disabled=true;$('curve-export-open').disabled=true;$('curve-status').textContent='正在求解一个周期的位形及运动学数据…';
    const target=M.validate(G.clone(model)),original=model;
    setTimeout(()=>{try{const data=Q.sample(target);if(model!==original)return;curveData=data;curveModel=original;}catch(e){curveData=null;curveModel=null;$('curve-status').textContent=`计算失败：${e.message}`;toast(e.message);}finally{curveBusy=false;renderCurves();}},30);
  }
  $('curves-btn').onclick=()=>{pause();if(curveModel!==model){curveData=null;curveLines=[];curveSelected=[state.speedNode||M.observers(model).find(p=>!p.fixed)?.id].filter(Boolean);$('curve-y').value=state.metric;$('curve-x').value=D.swing(model)&&model.motor.rpm?'time':'angle';}curvePointOptions();renderCurves();$('curves-dialog').showModal();if(!curveData)computeCurves();};
  $('curves-close').onclick=$('curves-done').onclick=()=>$('curves-dialog').close();
  $('curves-dialog').addEventListener('close',()=>$('curves-btn').focus());$('curve-compute').onclick=computeCurves;
  $('curve-x').onchange=()=>{if($('curve-x').value==='x')$('curve-y').value='y';curvePointOptions();renderCurves();};$('curve-y').onchange=()=>{curvePointOptions();renderCurves();};
  document.querySelectorAll('[data-curve-preset]').forEach(button=>button.onclick=()=>{if(button.dataset.curvePreset==='xy'){$('curve-x').value='x';$('curve-y').value='y';}else{if($('curve-x').value==='x')$('curve-x').value=model.motor?.rpm?'time':'angle';$('curve-y').value='components';}curvePointOptions();renderCurves();});
  $('curve-points').addEventListener('change',e=>{const id=e.target.dataset.curvePoint,reference=e.target.dataset.curveReference;if(id){const checked=[...$('curve-points').querySelectorAll('[data-curve-point]:checked')].map(el=>el.dataset.curvePoint);if(checked.length>6){e.target.checked=false;toast('一张图最多同时对比 6 个节点。');return;}curveSelected=checked;}if(reference)state.angularReferences[reference]=e.target.value;renderCurves();});
  $('curve-plot').addEventListener('pointermove',e=>{
    if(!curveReady())return;const rect=e.currentTarget.getBoundingClientRect(),metric=$('curve-y').value,axis=$('curve-x').value,a=Q.layout(curveLines,metric,axis,curveData.ok&&curveData.angleCycle),x=(e.clientX-rect.left)/rect.width*1100,y=(e.clientY-rect.top)/rect.height*450;
    if(x<a.left||x>a.right||y<a.top||y>a.bottom){$('curve-tooltip').hidden=true;$('curve-plot').querySelector('[data-curve-hover]')?.remove();return;}
    const value=a.xMin+(x-a.left)/(a.right-a.left)*(a.xMax-a.xMin),points=curveLines[0]?.points||[];
    let index=0,nearestLine=curveLines[0];
    if(axis==='x'||D.swing(model)&&axis==='angle'){let cost=Infinity;for(const line of curveLines)for(const[i,p]of line.points.entries()){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;const score=(a.px(p.x)-x)**2+(axis==='x'?1:.2)*(a.py(p.y)-y)**2;if(score<cost){cost=score;index=i;nearestLine=line;}}}
    else{let distance=Infinity;for(const[i,p]of points.entries())if(Number.isFinite(p.x)&&Math.abs(p.x-value)<distance){distance=Math.abs(p.x-value);index=i;}}
    const nearest=nearestLine?.points[index];if(!nearest)return;
    let marks=axis==='x'?'':`<path d="M ${a.px(nearest.x)} ${a.top} V ${a.bottom}" stroke="#879ab3" stroke-dasharray="4 4"/>`;
    for(const line of curveLines){const p=line.points[index];if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))marks+=`<circle data-curve-marker="${line.id}" cx="${a.px(p.x)}" cy="${a.py(p.y)}" r="${line===nearestLine?5:3.5}" fill="white" stroke="${line.color}" stroke-width="2"/>`;}
    $('curve-plot').querySelector('[data-curve-hover]')?.remove();$('curve-plot').insertAdjacentHTML('beforeend',`<g data-curve-hover="true" pointer-events="none">${marks}</g>`);
    const stamp=axis==='time'?`时间 ${Q.format(nearest.x)} s`:axis==='x'?`输入角度 ${Q.format(nearest.angle)}° · 时间 ${Q.format(nearest.time)} s`:`输入角度 ${Q.format(nearest.x)}°${D.swing(model)?` · 时间 ${Q.format(nearest.time)} s`:''}`;
    const tooltip=$('curve-tooltip');tooltip.hidden=false;tooltip.textContent=stamp+'\n'+curveLines.map(l=>{const p=l.points[index];return axis==='x'?`${l.name}：X ${Q.format(p?.x)} mm · ${metric==='y'?'Y ':''}${Q.format(p?.y)} ${Q.metrics[metric].unit}`:`${l.name}：${Q.format(p?.y)} ${Q.metrics[metric].unit}`;}).join('\n');tooltip.style.left=G.clamp(e.clientX-rect.left+12,8,Math.max(8,rect.width-245))+'px';tooltip.style.top='38px';
  });
  $('curve-plot').addEventListener('pointerleave',()=>{$('curve-tooltip').hidden=true;$('curve-plot').querySelector('[data-curve-hover]')?.remove();});
  $('curve-export-open').onclick=()=>openExport(true);
  $('curve-csv-btn').onclick=()=>{if(!curveReady())return;closeExport();download(Q.csv(curveLines,$('curve-y').value,$('curve-x').value),filename('函数曲线.csv'),'text/csv;charset=utf-8');toast('已导出当前节点对比曲线数据。');};
  $('curve-pdf-btn').onclick=async()=>{if(!curveReady())return;closeExport();try{const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="450" viewBox="0 0 1100 450">${Q.svg(curveLines,$('curve-y').value,$('curve-x').value,curveData.ok&&curveData.angleCycle)}</svg>`,meta=Q.metrics[$('curve-y').value];const bytes=await E.chartPDF(svg,model.name,`${Q.axisName($('curve-x').value)} - ${meta.name} / ${meta.unit} · 输入 ${model.motor.rpm} ${D.swing(model)?'次/分':'rpm'}`,curveLines,curveData.message+' '+curveExplanation($('curve-y').value,$('curve-x').value));download(bytes,filename('函数曲线.pdf'),'application/pdf');toast('已导出函数曲线 PDF。');}catch(e){toast('曲线 PDF 导出失败：'+e.message);}};
  $('save-btn').onclick=()=>{
    closeExport();
    const points=M.observers(model),references=Object.fromEntries(points.flatMap(p=>{const link=state.angularReferences[p.id];return M.referenceLinks(model,p).some(l=>l.id===link)?[[p.id,link]]:[];}));
    const file=C.write(model,{showGrid:state.showGrid,snapGrid:$('snap-grid').checked,snapJoints:$('snap-joints').checked,showDimensions:state.showDimensions,showTraces:state.showTraces,showSpeed:state.showSpeed,angle:D.swing(model)||model.gears.length?state.angle:normalize(state.angle),...(D.swing(model)?{drivePhase:normalize(state.phase)}:{}),metric:state.metric,speedNode:state.speedNode,angularReferences:references,restoreTraces:state.showTraces&&points.some(p=>p.trace&&state.traces[p.id]?.length>1),...(X.active(state.drawing)?{drawing:state.drawing}:{})});
    download(JSON.stringify(file,null,2),filename('机构.json'),'application/json;charset=utf-8');changed=false;const warning=rememberCase(file);toast(warning||'已导出机构 JSON。把文件发给同学，对方点击“导入机构”即可编辑和运行。');
  };
  $('open-btn').onclick=()=>$('file-input').click();
  $('dxf-btn').onclick=()=>{closeExport();pause();try{download(X.dxf(model,state),filename('dxf'),'application/dxf');toast('已导出毫米坐标 DXF：当前位形、可见测量及已开启轨迹。');}catch(e){toast('DXF 导出失败：'+e.message);}};
  $('file-input').addEventListener('change',async()=>{
    const file=$('file-input').files[0];if(!file)return;
    try{if(file.size>12*1024*1024)throw new Error('案例文件不能超过 12 MB。');const next=C.read(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));if(await replaceModel(next.model,null,next.presentation)){const warning=rememberCase(C.write(next.model,next.presentation));toast([caseLoadWarning,warning].filter(Boolean).join('；')||'机构已导入，可在“我的案例”中再次加载。');}}catch(e){toast(`导入失败：${e.message}`);}finally{$('file-input').value='';}
  });
  $('pdf-btn').onclick=async()=>{
    closeExport();pause();$('pdf-btn').disabled=true;
    try{toast('正在生成机构与轨迹 PDF…');const bytes=await E.pdf(model,state);download(bytes,filename('pdf'),'application/pdf');toast('已导出 A4 横向 PDF，包含当前位形和开启的轨迹。');}
    catch(e){toast('PDF 导出失败：'+e.message);}finally{$('pdf-btn').disabled=false;}
  };
  function recordCycle(result,nodes){
    clearTraces();for(const n of nodes)if(n.trace)state.traces[n.id]=[];
    for(const f of result.frames){const motion=f.motion||K.analyze(model,f.positions,f.drive),points=f.points||M.positions(model,f.positions);for(const n of nodes)if(n.trace)state.traces[n.id].push(K.sample(model,n,motion,points,f.angle));}
  }
  function cycle(exportCSV=false){
    if(!model.motor){toast('导出轨迹前请先设置角度输入。');return;}
    pause();toast('正在计算一个运动周期与运动学数据…');$('csv-btn').disabled=true;$('trace-cycle-btn').disabled=true;
    setTimeout(()=>{try{
      const result=S.sweep(model,1);if(!result.ok){toast(`无法完成当前运动周期：${normalize(result.angle).toFixed(1)}° 处${result.message}`);return;}
      let nodes=M.observers(model).filter(n=>n.trace);if(!nodes.length){if(!exportCSV){toast('先选择轨迹点或勾选“记录运动轨迹”。');return;}nodes=M.observers(model).filter(n=>!n.fixed);}
      const quote=s=>'"'+String(s).replace(/"/g,'""')+'"';
      for(const f of result.frames){f.motion=K.analyze(model,f.positions,f.drive);f.points=M.positions(model,f.positions);}
      if(exportCSV){const header=['角度_deg','驱动相位_deg','时间_s',...nodes.flatMap(n=>[`${n.name}_X_mm`,`${n.name}_Y_mm`,`${n.name}_Vx_mm_s`,`${n.name}_Vy_mm_s`,`${n.name}_速度_mm_s`,`${n.name}_Ax_mm_s2`,`${n.name}_Ay_mm_s2`,`${n.name}_加速度_mm_s2`,`${n.name}_角速度_rad_s`,`${n.name}_角速度参考杆`]),...model.gears.flatMap(g=>[`${g.name}_角速度_rad_s`,`${g.name}_角加速度_rad_s2`,`${g.name}_转速_rpm`,`${g.name}_总传动比`]),...[...new Set(model.meshes.filter(s=>s.carrier).map(s=>s.carrier))].flatMap(id=>[`${model.links.find(l=>l.id===id).name}_角速度_rad_s`,`${model.links.find(l=>l.id===id).name}_总传动比`]),'最大约束误差_mm'].map(quote).join(',');
        const number=v=>Number.isFinite(v)?v.toFixed(6):'';
        const rows=result.frames.map(f=>[f.angle.toFixed(3),f.phase.toFixed(3),number(f.time),...nodes.flatMap(n=>{const p=K.sample(model,n,f.motion,f.points,f.angle),reference=n.type==='attachments'?n.link:state.angularReferences[n.id]||M.referenceLinks(model,n)[0]?.id;return[number(p.x),number(p.y),number(p.vx),number(p.vy),number(p.speed),number(p.ax),number(p.ay),number(p.acceleration),number(p.angularByLink[reference]),reference||''];}),...B.train(model,f.motion).flatMap(g=>[number(g.omega),number(f.motion.ok?f.motion.links[model.gears.find(x=>x.id===g.id).link].alpha:null),number(g.rpm),number(g.ratio)]),...[...new Set(model.meshes.filter(s=>s.carrier).map(s=>s.carrier))].flatMap(id=>[number(f.motion.ok?f.motion.links[id].omega:null),number(B.ratios(model)[id]?1/B.ratios(model)[id]:null)]),f.residual.toExponential(6)].join(','));
        download('\uFEFF'+[header,...rows].join('\r\n'),filename('csv'),'text/csv;charset=utf-8');}
      recordCycle(result,nodes);
      state.showTraces=true;$('show-traces').checked=true;draw();toast(exportCSV?`已导出 ${result.frames.length} 个位形，含坐标、速度、加速度、角速度与齿轮传动比。`:model.gears.length?`已绘制轨迹（输入 ${model.motor.sampleTurns||1} 周），可导出 PDF 或对比曲线。`:D.swing(model)?'已绘制往返轨迹，可切换显示量或导出 PDF。':'已绘制一周轨迹，可切换显示量、悬停或导出 PDF。');
    }catch(e){toast(`计算失败：${e.message}`);}finally{$('csv-btn').disabled=false;$('trace-cycle-btn').disabled=!model.motor;}},30);
  }
  $('csv-btn').onclick=()=>{closeExport();cycle(true);};$('trace-cycle-btn').onclick=()=>cycle(false);
  document.addEventListener('keydown',e=>{
    if(e.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey?'redo':'undo');}else if(e.key.toLowerCase()==='y'){e.preventDefault();history('redo');}else if(e.key.toLowerCase()==='s'){e.preventDefault();$('save-btn').click();}return;}
    if(e.key==='Escape'){
      if(e.repeat)return;e.preventDefault();state.measureDraft=[];state.pending=null;state.snapNode=null;state.armBase=null;state.armDraft=null;state.hoverLink=null;state.loopDraft=[];state.loopSnap=null;state.sliderDraft=null;state.gearDraft=null;state.meshFirst=null;sliderReadout();loopReadout();gearOptions();
      if(++escapeCount>=2){setTool('select');toast('已回到选择 / 拖动。');}else{$('canvas-hint').textContent='已取消当前绘制步骤 · 再按一次 Esc 回到选择 / 拖动';draw();}return;
    }
    escapeCount=0;
    if(e.key==='Enter'&&state.tool==='loop'){e.preventDefault();finishLoop();return;}
    const tools={r:'gear',m:'mesh',v:'select',p:'node',g:'fixed',j:'pin',l:'link',c:'loop',s:'slider',t:'point',e:'arm'};if(tools[e.key.toLowerCase()])setTool(tools[e.key.toLowerCase()]);
    if(e.key===' '){e.preventDefault();play();}if(e.key==='Delete')removeSelection();if(e.key.toLowerCase()==='f')$('fit-btn').click();
  });
  let lastTime=0;
  globalThis.JiGou.draftdesigner.create({getModel:()=>model,state,stage,view,pause,changeDrawing,setTool,draw,toast,fit:()=>{V.fit(stage,model,state,view);draw();}});
  function tick(time){if(state.playing&&model.motor){const dt=Math.min(0.05,lastTime?(time-lastTime)/1000:0);advancePhase(state.phase+model.motor.rpm*6*dt*state.playbackRate);}lastTime=time;requestAnimationFrame(tick);}
  new ResizeObserver(()=>draw()).observe($('stage-wrap'));
  const camDesigner=globalThis.JiGou.camdesigner.create({getModel:()=>model,getSelection:()=>state.selection,pause,replaceModel,change,validateAssembly:()=>{const checked=M.validate(model),result=S.solve(checked,checked.motor?.initialAngle||0);if(!result.ok)throw new Error('凸轮与当前连接无法闭合：'+result.message);},selectCam:id=>{state.selection={type:'cams',id};},finish:()=>{setTool('select');const c=model.cams.find(c=>c.id===state.selection?.id);if(c)state.speedNode=c.node;refresh();V.fit(stage,model,state,view);draw();toast('凸轮已应用，可运行仿真、观察曲线或导出机构。');}});
  globalThis.JiGou.synthdesigner.create({getModel:()=>model,getSelection:()=>state.selection,getSpeedNode:()=>state.speedNode,pause,replaceModel,download,finish:()=>{setTool('select');state.speedNode='T1';state.showTraces=true;$('show-traces').checked=true;const r=S.sweep(model,1);if(r.ok)recordCycle(r,M.observers(model).filter(p=>p.trace));refresh();V.fit(stage,model,state,view);draw();toast('合成机构已应用：橙色虚线为目标轨迹，可继续编辑、仿真或导出。');}});
  $('examples').innerHTML=M.catalog.map(([key,name,description])=>`<button class="example-card" data-example="${key}">${V.thumbnail(M.example(key))}<div><strong>${esc(name)}</strong><span>${esc(description)}</span></div></button>`).join('');initial();refresh();renderCases();V.fit(stage,model,state,view);draw();$('autosave-state').textContent=storageOK?'自动保存到当前浏览器':'请使用“导出 → 机构 JSON”保存文件';if(!caseStorageOK)toast('部分本地案例无法读取；可以重新导入机构文件。');requestAnimationFrame(tick);
})();
