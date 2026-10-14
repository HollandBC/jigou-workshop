'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry'),M=require('../src/model'),D=require('../src/drive'),S=require('../src/solver'),K=require('../src/motion'),Z=require('../src/editing'),V=require('../src/view');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`),node=(m,id)=>m.nodes.find(n=>n.id===id);
function finish(m){M.syncPins(m);for(const l of m.links)l.length=G.distance(node(m,l.a),node(m,l.b));if(m.motor){const l=m.links.find(l=>l.id===m.motor.link),a=node(m,m.motor.pivot||l.a),b=node(m,l.a===a.id?l.b:l.a);m.motor.initialAngle=((G.deg(Math.atan2(b.y-a.y,b.x-a.x))%360)+360)%360;}return M.validate(m);}
function bindings(m){for(const s of m.sliders){const p=node(m,s.node),f=M.railPose(m,s);near((p.x-f.origin.x)*f.n.x+(p.y-f.origin.y)*f.n.y,0);if(s.block){const b=M.frame(m,s.block),d=Math.atan2(b.u.y,b.u.x)-G.rad(f.angle+s.blockAngle);near(Math.atan2(Math.sin(d),Math.cos(d)),0);}}}
test('活动导槽滑块拖动沿母杆投影，不改写导槽偏置或断开安装关系',()=>{
  const m=M.example('sine'),s=m.sliders[1],old=G.clone(s),b={...node(m,'B')},c={...node(m,'C')},d={...node(m,'D')};Z.moveNode(m,'B',{x:b.x+70,y:b.y+11});near(node(m,'B').x,c.x);near(node(m,'B').y,b.y+11);assert.deepEqual(s,old);assert.deepEqual(node(m,'C'),c);assert.deepEqual(node(m,'D'),d);bindings(m);const clean=finish(m),sweep=S.sweep(clean);assert.equal(sweep.ok,true,sweep.message);for(const f of sweep.frames)assert.equal(K.analyze(clean,f.positions,f.drive).ok,true);
});
test('机架导轨滑块仅沿轨道移动，垂直拖动不移动导轨',()=>{
  const m=M.example('slider'),s=m.sliders[0],old=G.clone(s),c={...node(m,s.node)};Z.moveNode(m,s.node,{x:c.x+12,y:c.y+40});near(node(m,s.node).x,c.x+12);near(node(m,s.node).y,c.y);assert.deepEqual(s,old);bindings(m);assert.equal(S.solve(finish(m),m.motor.initialAngle).ok,true);
});
test('与槽杆固连的滑块拖动时整杆平移，第二移动副继续绑定',()=>{
  const m=M.example('sine'),c={...node(m,'C')},d={...node(m,'D')},rails=G.clone(m.sliders);Z.moveNode(m,'C',{x:c.x+13,y:c.y-30});near(node(m,'C').x,c.x+13);near(node(m,'C').y,c.y);near(node(m,'D').x,d.x+13);near(node(m,'D').y,d.y);near(G.distance(node(m,'C'),node(m,'D')),160);near(node(m,'B').x,node(m,'C').x);assert.deepEqual(m.sliders,rails);bindings(m);assert.equal(S.sweep(finish(m)).ok,true);
});
test('编辑固连杆端点保持锁定方向，允许沿杆调整长度',()=>{
  const m=M.example('sine'),d={...node(m,'D')};Z.moveNode(m,'D',{x:d.x+50,y:d.y+15});near(node(m,'D').x,node(m,'C').x);near(node(m,'D').y,d.y+15);bindings(m);near(finish(m).links[1].length,175);
});
test('机架导轨独立平移，滑块与固连杆跟随法向位移',()=>{
  const m=M.example('sine'),s=m.sliders[0],o={...s.origin},c={...node(m,'C')},d={...node(m,'D')},b={...node(m,'B')};Z.moveRail(m,s.id,{x:12,y:18});near(s.origin.x,o.x+12);near(s.origin.y,o.y+18);near(node(m,'C').x,c.x);near(node(m,'C').y,c.y+18);near(node(m,'D').y,d.y+18);near(node(m,'B').x,b.x);near(node(m,'B').y,b.y);bindings(m);assert.equal(S.sweep(finish(m)).ok,true);
});
test('活动导槽整体平移带动安装母杆，局部偏置和滑块约束保持不变',()=>{
  const m=M.example('rotguide'),s=m.sliders[0],old=G.clone(s),a={...node(m,'D')},b={...node(m,'E')};Z.moveRail(m,s.id,{x:8,y:6});near(node(m,'D').x,a.x+8);near(node(m,'D').y,a.y+6);near(node(m,'E').x,b.x+8);near(node(m,'E').y,b.y+6);near(G.distance(node(m,'D'),node(m,'E')),130);assert.deepEqual(s,old);bindings(m);assert.equal(S.sweep(finish(m)).ok,true);
});
test('编辑导槽母杆端点时滑块跟随新轨道，局部安装坐标保持不变',()=>{
  const m=M.example('rotguide'),s=m.sliders[0],old=G.clone(s),e={...node(m,'E')};Z.moveNode(m,'E',{x:e.x+20,y:e.y-9});assert.deepEqual(s,old);bindings(m);assert.equal(S.solve(finish(m),m.motor.initialAngle).ok,true);
});
test('行程范围采用活动导槽局部坐标，覆盖固定轨道和完整移动行程',()=>{
  const m=M.example('sine'),frames=S.sweep(m).frames,ranges=M.railTravel(m,frames);near(ranges.S1.min,-40);near(ranges.S1.max,40);near(ranges.S2.min,40);near(ranges.S2.max,120);for(const s of m.sliders){s.length=1;const b=M.railBounds(m,s,null,ranges);assert.ok(b.min<=ranges[s.id].min-8);assert.ok(b.max>=ranges[s.id].max+8);for(const f of frames){const q=M.railProjection(m,s,f.positions[s.node],f.positions).q;assert.ok(q>=b.min&&q<=b.max);}}
  const rotating=M.example('rotguide'),r=M.railTravel(rotating,S.sweep(rotating).frames);near(r.S1.min,30);near(r.S1.max,110);const s=rotating.sliders[0];s.length=1;const b=M.railBounds(rotating,s,null,r);near(b.min,22);near(b.max,118);
});
test('两种导轨都为虚线，显示范围与 PDF 快照一致且不包含拖动手柄',()=>{
  const m=M.example('sine'),state={traces:{},railRanges:M.railTravel(m,S.sweep(m).frames),tool:'select',selection:{type:'sliders',id:'S1'}};for(const s of m.sliders)s.length=1;const stage={clientWidth:1100,clientHeight:650,innerHTML:'',setAttribute(){}};V.render(stage,m,state,{scale:2,x:0,y:0});for(const s of m.sliders)assert.match(stage.innerHTML,new RegExp('data-guide-line="'+s.id+'"[^>]*stroke-dasharray='));assert.match(stage.innerHTML,/data-rail-handle="S1"/);const svg=V.snapshot(m,state);assert.doesNotMatch(svg,/data-rail-handle/);near(Number(svg.match(/data-slider="S2"[^>]*data-guide-min="([^"]+)"/)[1]),32);
});
test('固连滑块带动整体刚性构件平移，轮廓尺寸和导槽关联保持不变',()=>{
  const m=M.example('sine'),d=node(m,'D'),c=node(m,'C');m.nodes.push({id:'E',name:'板件角点',x:d.x+30,y:d.y,fixed:false,trace:false});m.links.push({id:'L3',name:'板边',a:'D',b:'E',length:30,color:M.colors[0]},{id:'L4',name:'板边',a:'E',b:'C',length:Math.hypot(30,160),color:M.colors[0]});m.bodies.push({id:'R1',name:'整体槽板',nodes:['C','D','E'],color:M.colors[0]});const clean=M.validate(m),before=G.clone(clean);Z.moveNode(clean,'C',{x:c.x+8,y:c.y});for(const id of ['C','D','E']){near(node(clean,id).x,node(before,id).x+8);near(node(clean,id).y,node(before,id).y);}for(const l of clean.links.filter(l=>l.id!=='L1'))near(G.distance(node(clean,l.a),node(clean,l.b)),l.length);bindings(clean);assert.equal(M.mobility(finish(clean)).dof,1);
});
