'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry'),M=require('../src/model');require('../src/gears');require('../src/cams');const S=require('../src/solver'),K=require('../src/motion'),D=require('../src/drive'),F=require('../src/cases'),X=require('../src/synthesis');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function fiveTarget(){return Array.from({length:501},(_,i)=>{const angle=i*2*Math.PI/500,A={x:25.6*Math.cos(angle),y:25.6*Math.sin(angle)},E={x:80+18.4*Math.cos(-.4-2*angle),y:18.4*Math.sin(-.4-2*angle)},B=G.circles(A,116,E,97.6)[0],dx=B.x-A.x,dy=B.y-A.y;return{x:15+A.x+.65*dx-16*dy/116,y:-10+A.y+.65*dy+16*dx/116};});}
function planetTarget(ratio=2.5,e=.38){return Array.from({length:801},(_,i)=>{const a=i*4*Math.PI/800;return{x:15+80*(Math.cos(a)+e*Math.cos(-.2+(1-ratio)*a)),y:-10+80*(Math.sin(a)+e*Math.sin(-.2+(1-ratio)*a))};});}
let five,planet;
test('五杆两曲柄遵守离散齿比，闭合端满足独立圆交及两杆长，两个装配分支有效',()=>{
  const p=[.32,.23,1.45,1.22,.65,.2,-.4,1];for(const branch of [1,-1])for(let i=0;i<360;i+=17){const theta=G.rad(i),q=X.pose('fivebar',p,theta,branch),hits=G.circles(q.A,p[2],q.E,p[3]);assert.ok(q);near(Math.min(...hits.map(h=>G.distance(h,q.B))),0);near(G.distance(q.A,q.B),p[2]);near(G.distance(q.E,q.B),p[3]);near(q.E.x,1+.23*Math.cos(-.4-2*theta));near(q.E.y,.23*Math.sin(-.4-2*theta));}
});
test('内齿圈行星轨迹遵守独立内滚公式，整数与分数齿比的完整周期正确',()=>{
  for(const [index,ratio,turns] of [[0,2,1],[2,4,1],[4,2.5,2],[6,4/3,3]]){const p=[.38,-.2,index];assert.equal(X.cycle('planetary',p),turns);for(const theta of [.23,1.34,4.1]){const q=X.pose('planetary',p,theta);near(q.T.x,Math.cos(theta)+.38*Math.cos(-.2-(ratio-1)*theta));near(q.T.y,Math.sin(theta)+.38*Math.sin(-.2-(ratio-1)*theta));}const curve=X.profile('planetary',p,true,1,360);near(G.distance(curve[0],curve.at(-1)),0);near(curve.at(-1).theta,turns*2*Math.PI);}
});
test('未知五杆目标搜索成真实单输入机构，不预设原尺寸，完整周期和齿比成立',async()=>{
  const raw=fiveTarget(),before=JSON.stringify(raw);five=await X.run(raw,{family:'fivebar',quality:'quick',tolerance:2});assert.ok(five.ok);assert.ok(five.candidates[0].rms<2,five.candidates[0].rms);assert.equal(JSON.stringify(raw),before);for(const c of five.candidates){assert.equal(c.model.links.length,4);assert.equal(c.model.gears.length,2);assert.equal(c.model.meshes[0].type,'external');assert.equal(M.mobility(c.model).dof,1);assert.equal(S.analyze(c.model).remaining,0);assert.ok(S.sweep(c.model,3).ok);assert.ok(c.lengths.every(n=>n>=2&&n<=800));}
});
test('两输入周的未知行星目标搜索出闭合候选，完整回位而非只检查第一圈',async()=>{
  planet=await X.run(planetTarget(),{family:'planetary',quality:'quick',tolerance:.5});assert.ok(planet.ok);assert.ok(planet.candidates[0].rms<.5);for(const c of planet.candidates){assert.equal(c.gear.turns,2);assert.equal(c.model.motor.sampleTurns,2);assert.equal(c.frames,721);assert.equal(M.mobility(c.model).dof,1);const frames=S.sweep(c.model,2).frames,first=M.positions(c.model,frames[0].positions).T1,last=M.positions(c.model,frames.at(-1).positions).T1,half=M.positions(c.model,frames[180].positions).T1;near(G.distance(first,last),0);assert.ok(G.distance(first,half)>5);}
});
test('新候选采样位置与真实约束求解及速度一致，重建初值能还原相位和齿数比',()=>{
  for(const c of [five.candidates[0],planet.candidates[0]]){const alpha=Math.atan2(c.transform.b,c.transform.a);for(let i=0;i<c.fitted.length;i+=4){const p=c.fitted[i],r=S.solve(c.model,G.deg(alpha+p.theta));assert.ok(r.ok);near(G.distance(M.positions(c.model,r.positions).T1,p),0,1e-7);const k=K.analyze(c.model,r.positions);assert.ok(k.ok);if(c.type==='planetary')near(k.links.L2.omega/k.links.L1.omega,c.gear.ratio);else near(k.links.L3.omega/k.links.L1.omega,c.gear.ratio);}const initial=X.infer(c.model,'T1');assert.equal(initial.type,c.type);assert.equal(X.gearSpec(initial.type,initial.parameters).ratio,c.gear.ratio);const q=X.pose(c.type,initial.parameters,initial.theta,initial.branch),t=initial.transform;near(G.distance({x:t.x+t.a*q.T.x-t.b*q.T.y,y:t.y+t.b*q.T.x+t.a*q.T.y},M.positions(c.model).T1),0);}
});
test('五杆可锁定两个世界支点，行星拒绝不适用的两支点约束',async()=>{
  const p=[.25,.3,1.25,1.15,.7,.15,.4,0],anchors=[{x:10,y:-20},{x:110,y:-20}],raw=X.profile('fivebar',p,true,1,500).map(q=>({x:10+100*q.x,y:-20+100*q.y})),r=await X.run(raw,{family:'fivebar',quality:'quick',anchors,initial:{type:'fivebar',parameters:p},tolerance:.2});assert.ok(r.ok);assert.ok(r.candidates[0].rms<.2);near(G.distance(r.candidates[0].model.nodes.find(n=>n.id==='O'),anchors[0]),0);near(G.distance(r.candidates[0].model.nodes.find(n=>n.id==='D'),anchors[1]),0);assert.throws(()=>X.options({family:'planetary',anchors}),/四杆或齿轮联动五杆/);
});
test('多圈角度在闭合弧长重采样中保持连续，反向与开放目标均生成实际往返驱动',async()=>{
  const p=[.4,.2,4],curve=X.profile('planetary',p,true,1,360),sample=X.resample(curve,64,true);assert.ok(sample.at(-1).theta>2*Math.PI);const raw=Array.from({length:201},(_,i)=>{const a=.3+1.5*i/200;return{x:70*(Math.cos(a)+.4*Math.cos(.2-1.5*a)),y:70*(Math.sin(a)+.4*Math.sin(.2-1.5*a))};}),r=await X.run(raw,{family:'planetary',quality:'quick',closed:false,tolerance:1});assert.ok(r.ok);assert.ok(r.candidates[0].rms<1);assert.equal(r.candidates[0].model.motor.mode,'swing');assert.match(X.gearSummary(r.candidates[0]),/一次往返/);assert.ok(S.sweep(r.candidates[0].model,2).ok);
});
test('v9 保存四类设置与齿轮关系，兼容 v8 原始设计，旧编号不能携带新增类型',()=>{
  for(const r of [five,planet]){const m=G.clone(r.candidates[0].model);m.synthesis=X.metadata({version:1,target:{points:r.target.raw,name:'新类型目标'},settings:r.options});const data=F.write(m,{speedNode:'T1',restoreTraces:true}),copy=F.read(JSON.parse(JSON.stringify(data)));assert.equal(copy.model.version,9);assert.deepEqual(copy.model,m);const old=G.clone(data);old.version=8;assert.throws(()=>M.validate(old),/v9/);}const old=M.example('fourbar');old.version=8;old.synthesis=null;assert.equal(M.validate(old).version,9);
});
test('非对称五杆的反向目标保持次序，生成反转输入和正确齿轮相位',()=>{
  const p=[.32,.23,1.45,1.22,.65,.2,-.4,1],raw=fiveTarget().slice().reverse(),opts=X.options({family:'fivebar',quality:'quick'}),target=X.prepare(raw,{samples:64}),fit=X.evaluate('fivebar',p,target,opts,1,true);assert.ok(fit.reverse);assert.ok(fit.rms<.25,fit.rms);const m=X.build(fit,target,opts);assert.equal(m.motor.rpm,-12);assert.ok(S.sweep(m,2).ok);const plan=D.plan(m,10);assert.ok(plan.at(-1).angle<plan[0].angle);const initial=M.positions(m).T1;near(G.distance(initial,fit.fitted[0]),0,1e-7);
});
