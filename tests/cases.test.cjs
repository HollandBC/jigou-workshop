'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../src/geometry.js');const M=require('../src/model.js'),C=require('../src/cases.js');
test('分享文件完整保留附着机构、驱动和课堂显示设置，结构与设置均可往返',()=>{
  const model=M.example('attached'),before=JSON.stringify(model),presentation={angle:123.5,metric:'angular',speedNode:'T2',angularReferences:{T2:'L2',C:'L3'},showGrid:false,snapGrid:false,snapJoints:true,showDimensions:false,showTraces:true,showSpeed:false,restoreTraces:true};
  const file=C.write(model,presentation),loaded=C.read(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(loaded,{model,presentation});assert.deepEqual(M.validate(file),model);assert.equal(JSON.stringify(model),before);assert.deepEqual(C.write(loaded.model,loaded.presentation),file);
});
test('旧 v1 和普通 v2 机构文件可以导入案例并迁移',()=>{
  const v1=M.example('slider');v1.version=1;delete v1.attachments;
  const v2=M.example('attached');v2.version=2;delete v2.bodies;for(const input of [v1,v2]){const {model,presentation}=C.read(input);assert.equal(model.version,9);assert.equal(presentation.angle,40);assert.equal(presentation.metric,'speed');assert.equal(presentation.restoreTraces,false);assert.equal(presentation.showGrid,true);}
});
test('错误案例版本、设置类型、角度和观察引用被拒绝，不修改输入',()=>{
  for(const patch of [{version:3},{showGrid:'false'},{angle:361},{angle:NaN},{metric:'force'},{speedNode:'Unknown'},{angularReferences:{T2:'L1'}},{angularReferences:[]},{restoreTraces:1}]){const file={...M.example('attached'),case:{version:1,...patch}},before=JSON.stringify(file);assert.throws(()=>C.read(file));assert.equal(JSON.stringify(file),before);}
  const file=C.write(M.example('attached'));file.attachments[0].link='Unknown';assert.throws(()=>C.read(file));
});
test('无驱动或没有追踪点的案例不要求重算轨迹，空案例仍可分享',()=>{
  const empty=M.empty(),read=C.read(C.write(empty,{restoreTraces:true}));assert.deepEqual(read.model,empty);assert.equal(read.presentation.restoreTraces,false);assert.equal(read.presentation.speedNode,null);
  const m=M.example('attached');for(const p of [...m.nodes,...m.attachments])p.trace=false;assert.equal(C.read(C.write(m,{restoreTraces:true})).presentation.restoreTraces,false);
});
