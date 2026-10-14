'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry.js'),M=require('../src/model.js'),S=require('../src/solver.js');
require('../src/motion.js');
const V=require('../src/view.js'),E=require('../src/export.js');
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('构件法自由度：四杆、曲柄滑块和复合铰链多杆机构',()=>{
  const four=M.mobility(M.example('fourbar'));assert.equal(four.n,3);assert.equal(four.rotational,4);assert.equal(four.lower,4);assert.equal(four.dof,1);
  const slider=M.mobility(M.example('slider'));assert.equal(slider.n,3);assert.equal(slider.rods,2);assert.equal(slider.sliders,1);assert.equal(slider.rotational,3);assert.equal(slider.prismatic,1);assert.equal(slider.dof,1);
  const multi=M.mobility(M.example('multi'));assert.equal(multi.n,7);assert.equal(multi.rotational,10);assert.equal(multi.dof,1);
  assert.equal(multi.joints.find(j=>j.id==='B').rotational,2);
});
test('构件法排除固定机架杆并标识孤立活动点',()=>{
  const m=M.example('fourbar');m.links.push({id:'Ground',a:'A',b:'D',length:160});m.nodes.push({id:'P1',x:0,y:100,fixed:false});
  const f=M.mobility(m);assert.equal(f.n,3);assert.equal(f.dof,1);assert.equal(f.isolated,1);
});
test('滑块速度符合独立解析导数，包含两处零速度',()=>{
  const m=M.example('slider'),omega=m.motor.rpm*2*Math.PI/60;
  for(let angle=0;angle<360;angle++){
    const r=S.solve(m,angle),v=S.velocities(m,r.positions);assert.equal(v.ok,true,v.message);
    const a=G.rad(angle),dx=-45*Math.sin(a)-45**2*Math.sin(a)*Math.cos(a)/Math.sqrt(155**2-45**2*Math.sin(a)**2);
    close(v.nodes.C.x,dx*omega);close(v.nodes.C.y,0);close(v.nodes.B.speed,45*Math.abs(omega));close(v.nodes.A.speed,0);
  }
});
test('三类机构速度满足杆长导数与独立中心差分',()=>{
  for(const kind of ['fourbar','slider','multi']){
    const m=M.example(kind),r=S.solve(m,53),v=S.velocities(m,r.positions);assert.equal(v.ok,true,v.message);
    const h=.0001,left=S.solve(m,53-h,r.positions),right=S.solve(m,53+h,r.positions),seconds=2*h/(m.motor.rpm*6);
    assert.ok(left.ok&&right.ok);
    for(const n of m.nodes){close(v.nodes[n.id].x,(right.positions[n.id].x-left.positions[n.id].x)/seconds,1e-5);close(v.nodes[n.id].y,(right.positions[n.id].y-left.positions[n.id].y)/seconds,1e-5);}
    for(const l of m.links){const a=r.positions[l.a],b=r.positions[l.b],va=v.nodes[l.a],vb=v.nodes[l.b];close((a.x-b.x)*(va.x-vb.x)+(a.y-b.y)*(va.y-vb.y),0,1e-6);}
  }
});
test('转速比例、反向与停止时速度遵守运动学比例',()=>{
  const m=M.example('multi'),r=S.solve(m,55),original=S.velocities(m,r.positions);
  for(const rpm of [24,-12,0]){m.motor.rpm=rpm;const v=S.velocities(m,r.positions);assert.equal(v.ok,true);for(const n of m.nodes){close(v.nodes[n.id].x,original.nodes[n.id].x*rpm/12);close(v.nodes[n.id].y,original.nodes[n.id].y*rpm/12);}}
});
test('未闭合与欠约束位形不返回伪速度',()=>{
  const m=M.example('fourbar');m.nodes.push({id:'P1',x:0,y:0});const pos=Object.fromEntries(m.nodes.map(n=>[n.id,n]));assert.equal(S.velocities(m,pos).ok,false);
  const slider=M.example('slider');slider.links[1].length=10;assert.equal(S.velocities(slider,Object.fromEntries(slider.nodes.map(n=>[n.id,n]))).ok,false);
});
test('两圆相切的奇异四杆位形显示速度不可唯一确定',()=>{
  const m=M.example('fourbar');m.links[1].length=70;m.links[2].length=45;
  const positions={A:{x:0,y:0},B:{x:45,y:0},C:{x:115,y:0},D:{x:160,y:0}};
  const v=S.velocities(m,positions);assert.equal(v.ok,false);assert.match(v.message,/奇异/);
});
test('缩放网格保持 1 mm 下限，吸附铰点使用恒定屏幕半径',()=>{
  for(const scale of [.1,.2,1,2,4,10,20,60])assert.ok(G.gridStep(scale)>=1);
  assert.equal(G.gridStep(20),1);assert.equal(G.gridStep(60),1);assert.equal(G.gridStep(.1),200);
  const nodes=[{id:'P1',x:0,y:0}];
  for(const scale of [.1,1,10,60]){assert.equal(G.snapNode(nodes,null,{x:13/scale,y:0},scale),'P1');assert.equal(G.snapNode(nodes,null,{x:15/scale,y:0},scale),null);}
  assert.equal(G.snapNode(nodes,{P1:{x:100,y:20}},{x:102,y:20},2),'P1');
});
test('导出视野包括开启的完整轨迹，尺寸与速度图保留',()=>{
  const m=M.example('fourbar'),r=S.solve(m,40),state={positions:r.positions,traces:{C:[{x:-400,y:-200,speed:1},{x:400,y:200,speed:5}]},showTraces:true,showSpeed:true,showGrid:false,showDimensions:true,speedNode:'C',speedMax:5,velocities:S.velocities(m,r.positions)};
  const svg=V.snapshot(m,state);assert.match(svg,/viewBox="0 0 1120 650"/);assert.match(svg,/M -400 -200 L 400 200/);assert.match(svg,/data-dimension="L1"/);assert.match(svg,/mm\/s/);assert.doesNotMatch(svg,/fill="url\(#grid\)"/);
  const hidden=V.snapshot(m,{...state,showTraces:false});assert.doesNotMatch(hidden,/M -400 -200 L 400 200/);
});
test('PDF writer binary xref points to exact object offsets',()=>{
  const bytes=E.jpegPDF(new Uint8Array([255,216,255,0,128,255,217]),10,10),s=Buffer.from(bytes).toString('latin1');
  assert.match(s,/%PDF-1.4/);const start=Number(s.match(/startxref\n(\d+)/)[1]);assert.equal(s.slice(start,start+4),'xref');
  const entries=s.slice(start).split('\n').slice(3,8);for(let i=0;i<5;i++){const offset=Number(entries[i].slice(0,10));assert.equal(s.slice(offset,offset+7),`${i+1} 0 obj`);}
});
