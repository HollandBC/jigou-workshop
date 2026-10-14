'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry'),M=require('../src/model');require('../src/gears');require('../src/cams');const S=require('../src/solver'),K=require('../src/motion'),D=require('../src/drive'),F=require('../src/cases'),V=require('../src/view'),X=require('../src/synthesis');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function independentFour(){const points=[];for(let i=0;i<=360;i++){const a=G.rad(i),O={x:0,y:0},D={x:130,y:0},A={x:31*Math.cos(a),y:31*Math.sin(a)},B=G.circles(A,141,D,94)[0],dx=B.x-A.x,dy=B.y-A.y;points.push({x:42+A.x+.42*dx-35*dy/141,y:-18+A.y+.42*dy+35*dx/141});}return points;}
function independentSlider(){const points=[];for(let i=0;i<=360;i++){const a=G.rad(i),A={x:34*Math.cos(a),y:34*Math.sin(a)},B={x:A.x+Math.sqrt(95**2-(12-A.y)**2),y:12},dx=B.x-A.x,dy=B.y-A.y,p={x:A.x+.4*dx-22*dy/95,y:A.y+.4*dy+22*dx/95},co=Math.cos(.37),si=Math.sin(.37);points.push({x:co*p.x-si*p.y+25,y:si*p.x+co*p.y-12});}return points;}
let fourResult,sliderResult,lineResult;
test('目标按弧长均匀采样，闭合不重复终点，开放保留端点，平滑不改变开放端点',()=>{
  const raw=[{x:0,y:0},{x:1,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20},{x:0,y:0}],copy=JSON.stringify(raw),p=X.resample(raw,8,true);assert.equal(p.length,8);for(let i=0;i<8;i++)near(G.distance(p[i],p[(i+1)%8]),10);assert.equal(JSON.stringify(raw),copy);const open=X.prepare(raw.slice(0,4),{closed:false,smoothing:3});assert.deepEqual(open.points[0],raw[0]);assert.deepEqual(open.points.at(-1),raw[3]);assert.ok(open.span>20);
});
test('拒绝空、静止、非法坐标与过密轨迹，约束及轨迹文件经过独立验证',()=>{
  for(const p of [[],[{x:0,y:0}],[{x:1,y:1},{x:1,y:1}],[{x:NaN,y:0},{x:1,y:1}],new Array(1201).fill({x:1,y:1})])assert.throws(()=>X.prepare(p));
  for(const o of [{family:'other'},{quality:'x'},{minLength:10,maxLength:5},{tolerance:0},{anchors:[{x:0,y:0},{x:0,y:0}]},{smoothing:9}])assert.throws(()=>X.options(o));
  const f=X.writePath([{x:0,y:0},{x:20,y:10}],false,'轨迹');assert.deepEqual(X.readPath(f).points,f.points);assert.throws(()=>X.readPath({...f,unit:'m'}));assert.throws(()=>X.readPath({...f,version:2}));
});
test('四杆解析位形满足独立圆交与全部杆长，两装配分支及局部输出坐标正确',()=>{
  const p=[.35,1.2,.8,.6,.3];for(const branch of [1,-1])for(let deg=0;deg<360;deg+=15){const q=X.pose('fourbar',p,G.rad(deg),branch),B=G.circles(q.A,1.2,q.D,.8)[branch===1?0:1];near(G.distance(q.B,B),0);near(G.distance(q.O,q.A),.35);near(G.distance(q.A,q.B),1.2);near(G.distance(q.B,q.D),.8);const dx=q.B.x-q.A.x,dy=q.B.y-q.A.y;near(q.T.x,q.A.x+.6*dx-.3*dy/1.2);near(q.T.y,q.A.y+.6*dy+.3*dx/1.2);}
  assert.equal(X.profile('fourbar',[1,1,1,.5,0],true),null);assert.equal(X.profile('fourbar',[.8,.4,.4,.5,0],true),null);
});
test('曲柄滑块解析位形满足偏置导轨、独立滑块公式及左右装配分支',()=>{
  const p=[2.8,.3,.5,.2];for(const branch of [1,-1])for(let deg=0;deg<360;deg+=15){const q=X.pose('slider',p,G.rad(deg),branch);near(q.B.x,Math.cos(G.rad(deg))+branch*Math.sqrt(2.8**2-(.3-Math.sin(G.rad(deg)))**2));near(q.B.y,.3);near(G.distance(q.A,q.B),2.8);}assert.equal(X.profile('slider',[1.1,.5,.5,0],true),null);
});
test('最小二乘安装变换保持尺寸和顺序，闭合相位与反向比较均可恢复独立目标',()=>{
  const c=[{x:0,y:0},{x:3,y:1},{x:4,y:5},{x:-1,y:3}],t={a:1.8,b:.6,x:40,y:-23},pts=c.map(p=>({x:t.x+t.a*p.x-t.b*p.y,y:t.y+t.b*p.x+t.a*p.y})),fit=X.align(c,pts);near(fit.rms,0);near(fit.transform.a,t.a);near(fit.transform.b,t.b);near(fit.transform.x,t.x);near(fit.transform.y,t.y);const shifted=pts.map((_,i)=>pts[(2-i+c.length)%c.length]);near(X.align(c,shifted,2,true).rms,0);
});
test('未知四杆轨迹经过全局搜索产生低误差且可运行的候选，不依赖原机构尺寸',async()=>{
  const points=independentFour(),before=JSON.stringify(points);fourResult=await X.run(points,{family:'fourbar',quality:'quick',tolerance:1,seed:8765});assert.ok(fourResult.ok,fourResult.message);assert.ok(fourResult.candidates[0].rms<1,fourResult.candidates[0].rms);assert.equal(JSON.stringify(points),before);assert.ok(fourResult.candidates.length>=2);
  for(const c of fourResult.candidates){assert.equal(c.complete,true);assert.equal(c.model.version,9);assert.equal(M.mobility(c.model).dof,1);assert.equal(S.analyze(c.model).remaining,0);assert.ok(S.sweep(c.model,4).ok);assert.ok(c.lengths.every(l=>l>=2&&l<=800));}
});
test('未知偏置曲柄滑块轨迹可逆向求解，候选输出与真实求解器一致',async()=>{
  sliderResult=await X.run(independentSlider(),{family:'slider',quality:'quick',tolerance:1});assert.ok(sliderResult.ok);assert.ok(sliderResult.candidates[0].rms<1,sliderResult.candidates[0].rms);
  for(const c of [...sliderResult.candidates,...fourResult.candidates])for(let i=0;i<c.fitted.length;i+=5){const p=c.fitted[i],alpha=Math.atan2(c.transform.b,c.transform.a),r=S.solve(c.model,G.deg(alpha+p.theta));assert.ok(r.ok,r.message);near(G.distance(M.positions(c.model,r.positions).T1,p),0,1e-7);assert.ok(K.analyze(c.model,r.positions).ok);}
});
test('开放直线生成可完整往返的摆动机构，目标顺序对应一个行程',async()=>{
  const points=Array.from({length:60},(_,i)=>({x:-80+160*i/59,y:25}));lineResult=await X.run(points,{family:'slider',quality:'quick',closed:false,tolerance:1});assert.ok(lineResult.ok);const c=lineResult.candidates[0];assert.ok(c.rms<1,c.rms);assert.equal(c.model.motor.mode,'swing');const sweep=S.sweep(c.model);assert.ok(sweep.ok);near(G.distance(M.positions(c.model,sweep.frames[0].positions).T1,M.positions(c.model,sweep.frames.at(-1).positions).T1),0);near(c.target[0].x,-80);near(c.target.at(-1).x,80);
});
test('锁定四杆支点时世界安装位置保持，不通过自由旋转或缩放绕过约束',async()=>{
  const p=[.35,1.2,.8,.7,.3],anchors=[{x:10,y:15},{x:110,y:15}],points=X.profile('fourbar',p,true,1,360).map(q=>({x:10+100*q.x,y:15+100*q.y})),r=await X.run(points,{family:'fourbar',quality:'quick',anchors,initial:{type:'fourbar',parameters:p},tolerance:.1});assert.ok(r.ok);const c=r.candidates[0];assert.ok(c.rms<.1,c.rms);assert.deepEqual(c.model.nodes.find(n=>n.id==='O'),{id:'O',name:'输入支点 O',x:10,y:15,fixed:true,trace:false});near(G.distance(c.model.nodes.find(n=>n.id==='D'),anchors[1]),0);assert.ok(c.lengths.every(l=>l>=2&&l<=800));
});
test('预先取消及进度中取消会停止搜索，进度有序且不修改输入目标',async()=>{
  const points=independentFour(),old=JSON.stringify(points),a=new AbortController();a.abort();await assert.rejects(X.run(points,{quality:'quick'},{signal:a.signal}),{name:'AbortError'});const b=new AbortController(),progress=[];await assert.rejects(X.run(points,{quality:'thorough'},{signal:b.signal,onProgress:p=>{progress.push(p.fraction);b.abort();}}),{name:'AbortError'});assert.ok(progress.length);assert.equal(JSON.stringify(points),old);
  const all=[];await X.run([{x:0,y:0},{x:100,y:0}],{closed:false,quality:'quick',family:'slider'},{onProgress:p=>all.push(p.fraction)});assert.equal(all.at(-1),1);for(let i=1;i<all.length;i++)assert.ok(all[i]>=all[i-1]);
});
test('现有轨迹可提取，杆上伸出端初值正确，摆动仅提取一个行程且原模型不改变',()=>{
  const m=M.example('fourbar');m.attachments.push({id:'T1',name:'设计轨迹点',link:'L2',t:.5,along:0,normal:25,arm:true,trace:true});const clean=M.validate(m),before=JSON.stringify(clean),c=X.capture(clean,'T1');assert.equal(c.closed,true);assert.equal(c.initial.type,'fourbar');const q=X.pose(c.initial.type,c.initial.parameters,c.initial.theta,c.initial.branch),t=c.initial.transform,P=M.positions(clean).T1;near(P.x,t.x+t.a*q.T.x-t.b*q.T.y);near(P.y,t.y+t.b*q.T.x+t.a*q.T.y);assert.equal(JSON.stringify(clean),before);
  const swing=M.example('doublerocker'),r=X.capture(swing,'B');assert.equal(r.closed,false);assert.equal(r.points.length,181);assert.equal(r.initial.parameters.length,7);assert.throws(()=>X.capture(clean,'A'));assert.throws(()=>X.capture(clean,'missing'));
});
test('v8 机构与目标完整保存重开，旧格式可迁移，坏设计数据不能导入',()=>{
  const r=fourResult,c=r.candidates[0],m=G.clone(c.model);m.synthesis=X.metadata({version:1,target:{points:r.target.raw,name:'复现目标',source:'drawn'},settings:r.options});const file=F.write(m,{speedNode:'T1',restoreTraces:true}),copy=F.read(JSON.parse(JSON.stringify(file)));assert.deepEqual(copy.model,m);assert.equal(copy.model.synthesis.target.name,'复现目标');assert.ok(S.sweep(copy.model,3).ok);for(const patch of [m=>m.version=7,m=>m.synthesis.version=2,m=>m.synthesis.target.points=[{x:0,y:0}],m=>m.synthesis.settings.tolerance=0]){const bad=G.clone(m);patch(bad);assert.throws(()=>M.validate(bad));}const old=M.example('fourbar');old.version=7;delete old.synthesis;assert.equal(M.validate(old).version,9);
});
test('报告 RMS、最大误差与 CSV 逐点偏差一致，主画布及快照包含可隐藏的目标',()=>{
  const r=sliderResult,c=r.candidates[0],sum=c.fitted.reduce((v,p,i)=>v+G.distance(p,r.target.points[i])**2,0);near(Math.sqrt(sum/c.fitted.length),c.rms);near(Math.max(...c.errors),c.max);const csv=X.csv(c,r.target);assert.match(csv,/目标X_mm/);assert.equal(csv.split('\r\n').length,c.fitted.length+1);const m=G.clone(c.model);m.synthesis=X.metadata({version:1,target:{points:r.target.raw},settings:r.options});assert.match(V.snapshot(m,{showTraces:true,traces:{}}),/data-synthesis-target=/);assert.doesNotMatch(V.snapshot(m,{showTraces:false}),/data-synthesis-target=/);
});
test('自动比较保留四种可行拓扑代表，候选有明确达标状态且搜索不承诺任意精确重建',async()=>{
  const r=await X.run(independentFour(),{quality:'quick',tolerance:.000001});assert.ok(r.ok);for(const type of Object.keys(X.families))assert.ok(r.candidates.some(c=>c.type===type),type);assert.ok(r.candidates.length<=6);assert.ok(r.candidates.every(c=>c.reached===false));
});
