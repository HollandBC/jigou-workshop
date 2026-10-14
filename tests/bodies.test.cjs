'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry.js'),M=require('../src/model.js'),S=require('../src/solver.js'),K=require('../src/motion.js'),C=require('../src/cases.js'),V=require('../src/view.js');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function plate(rigid=true){
  const m=M.empty();m.nodes=[['A',0,0,true],['B',40,0],['C',40,30],['D',0,30]].map(([id,x,y,fixed])=>({id,name:id,x,y,fixed:!!fixed,trace:id==='C'}));
  m.links=[['A','B'],['B','C'],['C','D'],['D','A']].map(([a,b],i)=>({id:'L'+(i+1),name:'L'+(i+1),a,b,length:G.distance(m.nodes.find(n=>n.id===a),m.nodes.find(n=>n.id===b)),color:M.colors[i]}));
  m.motor={link:'L1',pivot:'A',initialAngle:0,rpm:12};if(rigid)m.bodies=[{id:'R1',name:'矩形板',nodes:['A','B','C','D'],color:'#3877e8'}];return M.validate(m);
}
test('Jansen 按实际刚体计 n=7、低副=10，H 为观测点而非转动副',()=>{
  const f=M.mobility(M.example('jansen'));assert.equal(f.n,7);assert.equal(f.rods,5);assert.equal(f.bodies,2);assert.equal(f.rotational,10);assert.equal(f.prismatic,0);assert.equal(f.higher,0);assert.equal(f.dof,1);
  assert.deepEqual(Object.fromEntries(f.joints.map(j=>[j.id,j.rotational])),{O:2,A:1,B:2,C:1,D:1,E:2,F:1,H:0});assert.equal(f.joints.find(j=>j.id==='H').bodyPoint,true);
});
test('铰接四边回路仍可变形，明确合成刚体才消除内部自由度',()=>{
  const hinged=plate(false),rigid=plate();assert.equal(M.mobility(hinged).dof,2);assert.equal(S.analyze(hinged).remaining,1);assert.equal(S.solve(hinged,10).code,'underconstrained');
  assert.equal(M.mobility(rigid).n,1);assert.equal(M.mobility(rigid).lower,1);assert.equal(S.analyze(rigid).dof,1);assert.equal(S.analyze(rigid).remaining,0);assert.equal(M.constraintLinks(rigid).length,6);
});
test('刚性四边形整周保持对角线，位置、速度和加速度符合独立旋转公式',()=>{
  const m=plate(),sweep=S.sweep(m),omega=m.motor.rpm*Math.PI/30,before=JSON.stringify(m);assert.equal(sweep.ok,true,sweep.message);
  for(const frame of sweep.frames){const a=G.rad(frame.angle),k=K.analyze(m,frame.positions);assert.equal(k.ok,true,k.message);for(const n of m.nodes){const p=frame.positions[n.id],x=n.x*Math.cos(a)-n.y*Math.sin(a),y=n.x*Math.sin(a)+n.y*Math.cos(a);near(p.x,x);near(p.y,y);near(k.nodes[n.id].vx,-omega*y);near(k.nodes[n.id].vy,omega*x);near(k.nodes[n.id].ax,-omega*omega*x);near(k.nodes[n.id].ay,-omega*omega*y);}near(G.distance(frame.positions.A,frame.positions.C),50);near(G.distance(frame.positions.B,frame.positions.D),50);}
  assert.equal(JSON.stringify(m),before);
});
test('合成构件的内部实杆不重复计数，释放后恢复独立杆件',()=>{
  const m=plate();m.links.push({id:'L5',name:'对角线',a:'A',b:'C',length:50,color:'#3877e8'});const grouped=M.validate(m);assert.equal(M.mobility(grouped).n,1);assert.equal(grouped.bodies[0].links.length,5);assert.equal(M.constraintLinks(grouped).length,6);m.bodies=[];assert.equal(M.mobility(M.validate(m)).n,5);
});
test('两个顶点固定的整体构件归入机架，不在内部观测点制造转动副',()=>{
  const m=plate();m.nodes.find(n=>n.id==='B').fixed=true;m.motor=null;const grounded=M.validate(m),f=M.mobility(grounded);assert.equal(f.n,0);assert.equal(f.bodies,0);assert.equal(f.lower,0);assert.equal(f.dof,0);assert.equal(S.analyze(grounded).dof,0);assert.ok(f.joints.every(j=>j.rotational===0));assert.equal(f.joints.find(j=>j.id==='C').bodyPoint,true);
});
test('整体构件分享往返及旧版迁移，不自动将普通闭合轮廓合为刚体',()=>{
  const m=plate(),shared=C.write(m,{speedNode:'C',restoreTraces:true});assert.deepEqual(C.read(JSON.parse(JSON.stringify(shared))).model,m);
  const v2=plate(false);v2.version=2;delete v2.bodies;assert.deepEqual(M.validate(v2).bodies,[]);
  const legacy=M.example('jansen');legacy.version=2;delete legacy.bodies;assert.equal(M.mobility(M.validate(legacy)).n,7);
  const released=M.example('jansen');released.bodies=[];assert.equal(M.mobility(M.validate(released)).n,11);
});
test('构件引用、重复边、退化形状和不一致边长在导入时被拒绝',()=>{
  const m=plate();for(const mutate of [x=>delete x.bodies,x=>x.bodies[0].nodes.push('Unknown'),x=>x.bodies.push({...x.bodies[0],id:'R2'}),x=>x.bodies[0].nodes=['A','B','B'],x=>x.links[0].length=41,x=>x.nodes[2].x=0,x=>x.nodes.forEach(n=>n.y=0)]){const bad=G.clone(m);mutate(bad);const before=JSON.stringify(bad);assert.throws(()=>M.validate(bad));assert.equal(JSON.stringify(bad),before);}
});
test('SVG 包含整体轮廓和 H 观测点标识，导出不含绘图草稿',()=>{
  const m=M.example('jansen'),svg=V.snapshot(m,{traces:{},showGrid:false,showTraces:true,showDimensions:true,loopDraft:[{x:0,y:0},{x:20,y:20}]});assert.ok(svg.includes('data-body="R1"'));assert.ok(svg.includes('data-body="R2"'));assert.ok(svg.includes('data-body-point="true"'));assert.ok(!svg.includes('data-loop-preview'));
});
