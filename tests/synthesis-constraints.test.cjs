'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry'),M=require('../src/model');require('../src/gears');require('../src/cams');require('../src/drive');const S=require('../src/solver'),F=require('../src/cases'),X=require('../src/synthesis');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);

test('未提供原机构尺寸时，倾斜机架的硬约束与目标行进次序同时成立',async()=>{
  const anchors=[{x:-47,y:22},{x:49,y:94}],p=[.35,1.2,.8,.7,.3];
  const points=X.profile('fourbar',p,true,1,360).map(q=>({x:-47+96*q.x-72*q.y,y:22+72*q.x+96*q.y})).reverse(),before=JSON.stringify({points,anchors});
  const r=await X.run(points,{family:'auto',quality:'quick',anchors,tolerance:2});assert.ok(r.ok,r.message);
  assert.ok(r.candidates.some(c=>c.type==='fourbar'));assert.ok(r.candidates.some(c=>c.type==='fivebar'));assert.ok(r.candidates.every(c=>['fourbar','fivebar'].includes(c.type)));
  assert.ok(r.candidates[0].rms<2,r.candidates[0].rms);
  for(const c of r.candidates){for(const[id,index]of [['O',0],['D',1]]){const n=c.model.nodes.find(n=>n.id===id);assert.equal(n.fixed,true);near(n.x,anchors[index].x);near(n.y,anchors[index].y);}assert.ok(S.sweep(c.model,2).ok);assert.equal(M.mobility(c.model).dof,1);}
  assert.equal(JSON.stringify({points,anchors}),before);
  const c=r.candidates[0],m=G.clone(c.model);m.synthesis=X.metadata({version:1,target:{points,source:'drawn'},settings:r.options});const reopened=F.read(JSON.parse(JSON.stringify(F.write(m)))).model;assert.deepEqual(reopened.synthesis.settings.anchors,anchors);assert.ok(S.sweep(reopened,2).ok);
});

test('目标文件可在求解前保存固定铰点与尺寸范围，旧目标继续读取',()=>{
  const points=[{x:0,y:0},{x:40,y:30},{x:80,y:-10}],constraints={minLength:5,maxLength:200,anchors:[{x:-20,y:-30},{x:100,y:-30}]},before=JSON.stringify({points,constraints});
  const file=X.writePath(points,false,'带安装约束的目标',constraints),loaded=X.readPath(JSON.parse(JSON.stringify(file)));assert.equal(file.version,1);assert.deepEqual(loaded.constraints,constraints);assert.deepEqual(loaded.points,points);assert.equal(loaded.closed,false);assert.equal(JSON.stringify({points,constraints}),before);
  file.constraints.anchors[0].x=999;assert.equal(constraints.anchors[0].x,-20);assert.equal(loaded.constraints.anchors[0].x,-20);
  const old=X.writePath(points,false);assert.ok(!Object.hasOwn(X.readPath(old),'constraints'));assert.deepEqual(X.readPath(X.writePath(points,false,'无支点',{minLength:3,maxLength:300})).constraints,{minLength:3,maxLength:300});
});

test('坏的目标文件约束不会以无约束目标继续求解，导出也拒绝坏约束',()=>{
  const points=[{x:0,y:0},{x:30,y:20}],file=X.writePath(points,false);
  for(const constraints of [null,[],{minLength:'2'},{minLength:50,maxLength:20},{anchors:[]},{anchors:[{x:0,y:0},{x:0,y:0}]},{anchors:[{x:0,y:0},{x:900,y:0}]},{anchors:[{x:0,y:0},{x:Infinity,y:0}]},{anchors:[{x:0,y:0},{x:20,y:0},{x:40,y:0}]}]){assert.throws(()=>X.readPath({...file,constraints}));assert.throws(()=>X.writePath(points,false,'坏约束',constraints));}
});
