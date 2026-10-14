'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry.js'),M=require('../src/model.js'),S=require('../src/solver.js');
function verify(model,result){
  assert.equal(result.ok,true,result.message);
  for(const l of model.links)assert.ok(Math.abs(G.distance(result.positions[l.a],result.positions[l.b])-l.length)<S.tolerance,`杆长变化 ${l.id}`);
  for(const n of model.nodes.filter(n=>n.fixed)){assert.equal(result.positions[n.id].x,n.x);assert.equal(result.positions[n.id].y,n.y);}
  for(const s of model.sliders){const p=result.positions[s.node],a=G.rad(s.angle);assert.ok(Math.abs(-(p.x-s.origin.x)*Math.sin(a)+(p.y-s.origin.y)*Math.cos(a))<S.tolerance);}
}
for(const kind of ['fourbar','slider','multi'])test(`${kind}: 整周闭合、固定点、连续性与往返一致`,()=>{
  const model=M.example(kind),sweep=S.sweep(model,1);assert.equal(sweep.ok,true,sweep.message);assert.equal(sweep.frames.length,361);assert.equal(S.analyze(model).dof,1);assert.equal(S.analyze(model).remaining,0);
  for(const frame of sweep.frames)verify(model,{ok:true,...frame});
  for(let i=1;i<sweep.frames.length;i++)for(const n of model.nodes){const d=G.distance(sweep.frames[i-1].positions[n.id],sweep.frames[i].positions[n.id]);assert.ok(d<8,`位形跳跃 ${n.id}: ${d}`);}
  for(const n of model.nodes)assert.ok(G.distance(sweep.frames[0].positions[n.id],sweep.frames[360].positions[n.id])<1e-7);
  let previous=sweep.frames.at(-1).positions;for(let angle=399;angle>=40;angle--){const r=S.solve(model,angle,previous);verify(model,r);previous=r.positions;}
  for(const n of model.nodes)assert.ok(G.distance(previous[n.id],sweep.frames[0].positions[n.id])<1e-7);
});
test('曲柄滑块与独立解析公式一致，包括四个象限和死点',()=>{
  const m=M.example('slider');let prior=null;
  for(let angle=0;angle<=360;angle++){
    const r=S.solve(m,angle,prior);verify(m,r);
    const theta=G.rad(angle),expected=45*Math.cos(theta)+Math.sqrt(155**2-(45*Math.sin(theta))**2);
    assert.ok(Math.abs(r.positions.C.x-expected)<1e-8);assert.ok(Math.abs(r.positions.C.y)<1e-8);prior=r.positions;
  }
});
test('平移、旋转后的导轨与机构仍满足几何约束',()=>{
  const m=M.example('slider'),theta=G.rad(31),transform=p=>({x:200+p.x*Math.cos(theta)-p.y*Math.sin(theta),y:-80+p.x*Math.sin(theta)+p.y*Math.cos(theta)});
  for(const n of m.nodes)Object.assign(n,transform(n));m.sliders[0].origin=transform(m.sliders[0].origin);m.sliders[0].angle=31;m.motor.initialAngle+=31;
  const r=S.sweep(m,2);assert.equal(r.ok,true,r.message);for(const frame of r.frames)verify(m,{ok:true,...frame});
});
test('驱动后仍有自由运动时拒绝输出伪确定结果',()=>{
  const m=M.example('fourbar');m.nodes.push({id:'P1',name:'孤立铰点',x:20,y:200,fixed:false,trace:false});
  const r=S.solve(m,40);assert.equal(r.ok,false);assert.equal(r.code,'underconstrained');assert.equal(S.analyze(m).remaining,2);
});
test('不可能闭合的杆长被拒绝',()=>{
  const m=M.example('fourbar');m.links[1].length=10;m.links[2].length=10;
  const r=S.solve(m,40);assert.equal(r.ok,false);assert.equal(r.code,'infeasible');assert.ok(r.residual>S.tolerance);
});
test('无法旋转一整周的机构在首个失败角度停止导出',()=>{
  const m=M.example('fourbar');m.links[1].length=85;m.links[2].length=75;
  const r=S.sweep(m);assert.equal(r.ok,false);assert.ok(r.frames.length>0&&r.frames.length<361);assert.ok(Number.isFinite(r.angle));
});
test('三点平台闭环进入数值求解，仍保持全部尺寸',()=>{
  const m=M.empty();m.name='三点平台';
  m.nodes=[{id:'A',x:-60,y:0,fixed:true},{id:'B',x:-60+40*Math.cos(G.rad(35)),y:40*Math.sin(G.rad(35))},{id:'C',x:10,y:35},{id:'D',x:70,y:0,fixed:true},{id:'E',x:45,y:40},{id:'F',x:25,y:65},{id:'H',x:0,y:100,fixed:true}];
  m.links=[['A','B'],['B','C'],['D','E'],['H','F'],['C','E'],['E','F'],['F','C']].map(([a,b],i)=>({id:'L'+(i+1),a,b,length:G.distance(m.nodes.find(n=>n.id===a),m.nodes.find(n=>n.id===b))}));
  m.motor={link:'L1',pivot:'A',initialAngle:35,rpm:12};const valid=M.validate(m),r=S.solve(valid,37);
  verify(valid,r);assert.equal(r.method,'numeric');assert.ok(r.iterations>0);assert.equal(S.analyze(valid).remaining,0);
});
test('求解器不改变编辑模型和调用者的上一帧坐标',()=>{
  const m=M.example('multi'),r=S.solve(m,40),before=JSON.stringify(m),guess=JSON.stringify(r.positions);
  verify(m,S.solve(m,45,r.positions));assert.equal(JSON.stringify(m),before);assert.equal(JSON.stringify(r.positions),guess);
});
test('JSON 保存读取往返保留全部模型属性',()=>{
  for(const kind of ['fourbar','slider','multi']){const m=M.example(kind);assert.deepEqual(M.validate(JSON.parse(JSON.stringify(m))),m);}
});
test('导入验证拒绝非有限坐标、重复杆件和无效驱动',()=>{
  const m=M.example('fourbar');m.nodes[0].x=Infinity;assert.throws(()=>M.validate(m));
  const n=M.example('fourbar');n.links.push({...n.links[0],id:'L4'});assert.throws(()=>M.validate(n));
  const o=M.example('fourbar');o.motor.pivot='B';assert.throws(()=>M.validate(o));
  const p=M.example('fourbar');p.nodes[0].id='__proto__';assert.throws(()=>M.validate(p));
});
test('几何求交识别相切、分离、包含及同心退化',()=>{
  const a={x:0,y:0};assert.equal(G.circles(a,1,{x:3,y:0},1).length,0);assert.equal(G.circles(a,5,{x:1,y:0},1).length,0);assert.equal(G.circles(a,1,a,1).length,0);
  const r=G.circles(a,1,{x:2,y:0},1);assert.equal(r.length,2);assert.deepEqual(r[0],{x:1,y:0});
});
