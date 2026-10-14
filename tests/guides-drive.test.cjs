'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry'),M=require('../src/model'),D=require('../src/drive'),S=require('../src/solver'),K=require('../src/motion'),Q=require('../src/curves'),C=require('../src/cases'),V=require('../src/view');
const near=(a,b,t=2e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`),w=12*Math.PI/30;
for(const[key]of M.catalog.slice(1,11).filter(([k])=>k!=='slider'))test(`${key}：完整运动周期、尺寸、移动副、自由度与运动学`,()=>{
  const m=M.example(key),f=M.mobility(m),result=S.sweep(m);assert.equal(f.dof,1);assert.equal(S.analyze(m).dof,1);assert.equal(S.analyze(m).remaining,0);assert.equal(result.ok,true,result.message);assert.equal(result.frames.length,361);
  for(const frame of result.frames){for(const l of m.links)near(G.distance(frame.positions[l.a],frame.positions[l.b]),l.length);for(const s of m.sliders){const p=frame.positions[s.node],r=M.railPose(m,s,frame.positions);near((p.x-r.origin.x)*r.n.x+(p.y-r.origin.y)*r.n.y,0);}const motion=K.analyze(m,frame.positions,frame.drive);assert.equal(motion.ok,true,motion.message);}
  for(const n of m.nodes)near(G.distance(result.frames[0].positions[n.id],result.frames.at(-1).positions[n.id]),0,1e-4);
});
test('双曲柄输出完整旋转，双摇杆只在设定范围内运动；旋转模式不能闭合双摇杆整周',()=>{
  const m=M.example('doublecrank'),r=S.sweep(m);let turn=0;for(let i=1;i<r.frames.length;i++){const angle=f=>Math.atan2(f.positions.C.y,f.positions.C.x-40),diff=angle(r.frames[i])-angle(r.frames[i-1]);turn+=Math.atan2(Math.sin(diff),Math.cos(diff));}near(Math.abs(turn),2*Math.PI,1e-5);
  const rocker=M.example('doublerocker'),sweep=S.sweep(rocker);near(Math.min(...sweep.frames.map(f=>f.angle)),20);near(Math.max(...sweep.frames.map(f=>f.angle)),70);delete rocker.motor.mode;assert.equal(S.sweep(rocker).ok,false);
});
test('摆动的角速度和角加速度符合独立正弦公式，包括端点平滑换向与反转',()=>{
  const m=M.example('doublerocker'),amp=25*Math.PI/180;for(const phase of [0,30,90,135,180,270,360]){const d=D.at(m,phase),pose=S.solve(m,d.angle),k=K.analyze(m,pose.positions,d);assert.equal(k.ok,true);near(d.angle,45+25*Math.sin(G.rad(phase)));near(k.links.L1.omega,amp*w*Math.cos(G.rad(phase)));near(k.links.L1.alpha,-amp*w*w*Math.sin(G.rad(phase)));}
  m.motor.rpm=-12;const p=D.plan(m);near(p[1].phase,p[0].phase-1);near(p.at(-1).time,5);near(D.at(m,90).omega,0);assert.ok(D.at(m,90).alpha<0);m.motor.rpm=0;assert.ok(D.plan(m).every(f=>f.time===null&&f.omega===0&&f.alpha===0));
});
function unitDerivatives(z,v,a){const r=Math.hypot(z.x,z.y),dot=z.x*v.x+z.y*v.y,second=v.x*v.x+v.y*v.y+z.x*a.x+z.y*a.y;return{u:{x:z.x/r,y:z.y/r},v:{x:v.x/r-z.x*dot/r**3,y:v.y/r-z.y*dot/r**3},a:{x:a.x/r-2*v.x*dot/r**3-z.x*second/r**3+3*z.x*dot**2/r**5,y:a.y/r-2*v.y*dot/r**3-z.y*second/r**3+3*z.y*dot**2/r**5}};}
test('转动导杆与曲柄摇块的速度加速度符合独立单位向量求导，包含移动导槽的相对运动项',()=>{
  for(const key of ['rotguide','rockblock']){const m=M.example(key),sweep=S.sweep(m),rotating=key==='rotguide',radius=rotating?70:45,d=rotating?40:130,L=rotating?130:210;for(const f of sweep.frames){const t=G.rad(f.angle),B={x:radius*Math.cos(t),y:radius*Math.sin(t)},v={x:-w*B.y,y:w*B.x},a={x:-w*w*B.x,y:-w*w*B.y},z=rotating?{x:B.x-d,y:B.y}:{x:d-B.x,y:-B.y},dz=rotating?v:{x:-v.x,y:-v.y},ddz=rotating?a:{x:-a.x,y:-a.y},u=unitDerivatives(z,dz,ddz),k=K.analyze(m,f.positions,f.drive),id=rotating?'E':'C';assert.equal(k.ok,true);for(const axis of ['x','y']){near(f.positions[id][axis],(rotating?(axis==='x'?d:0):B[axis])+L*u.u[axis]);near(k.nodes[id][axis==='x'?'vx':'vy'],(rotating?0:v[axis])+L*u.v[axis]);near(k.nodes[id][axis==='x'?'ax':'ay'],(rotating?0:a[axis])+L*u.a[axis]);}}}
});
test('正弦机构的两移动副产生独立正弦位移、速度、加速度；槽杆不发生转动',()=>{
  const m=M.example('sine');assert.equal(M.mobility(m).prismatic,2);assert.equal(M.mobility(m).n,3);for(const f of S.sweep(m).frames){const t=G.rad(f.angle),k=K.analyze(m,f.positions,f.drive);near(f.positions.C.x,40*Math.cos(t));near(f.positions.C.y,-80);near(k.nodes.C.vx,-40*w*Math.sin(t));near(k.nodes.C.ax,-40*w*w*Math.cos(t));near(k.links.L2.omega,0);near(k.links.L2.alpha,0);}
});
test('双滑块支持无固定端点的角度输入，并生成正确椭圆轨迹与运动学',()=>{
  const m=M.example('doubleslider');assert.equal(m.motor.pivot,null);assert.equal(M.mobility(m).prismatic,2);for(const f of S.sweep(m).frames){const t=G.rad(f.angle),k=K.analyze(m,f.positions,f.drive),p=M.positions(m,f.positions).T1;near(f.positions.B.x,-140*Math.cos(t));near(f.positions.C.y,140*Math.sin(t));near(k.nodes.B.vx,140*w*Math.sin(t));near(k.nodes.B.ax,140*w*w*Math.cos(t));near(k.nodes.C.vy,140*w*Math.cos(t));near(k.nodes.C.ay,-140*w*w*Math.sin(t));near(k.links.L1.omega,w);near(p.x,-91*Math.cos(t));near(p.y,49*Math.sin(t));}
});
test('双转块十字槽的平移轨迹与角速度符合独立公式',()=>{
  const m=M.example('doubleblock'),f=M.mobility(m);assert.equal(f.n,3);assert.equal(f.rotational,2);assert.equal(f.prismatic,2);for(const frame of S.sweep(m).frames){const t=G.rad(frame.angle),k=K.analyze(m,frame.positions,frame.drive);near(frame.positions.C.x,120*Math.cos(t)**2);near(frame.positions.C.y,60*Math.sin(2*t));near(k.nodes.C.vx,-120*w*Math.sin(2*t));near(k.nodes.C.vy,120*w*Math.cos(2*t));near(k.nodes.C.ax,-240*w*w*Math.cos(2*t));near(k.nodes.C.ay,-240*w*w*Math.sin(2*t));near(k.links.L2.omega,w);near(k.links.L3.omega,w);}
});
test('位移缩放仪保持 2 倍位置、位移、速度和加速度关系',()=>{
  const m=M.example('pantograph');for(const f of S.sweep(m).frames){const k=K.analyze(m,f.positions,f.drive),p=M.positions(m,f.positions).T1;near(p.x,2*f.positions.B.x,1e-4);near(p.y,2*f.positions.B.y,1e-4);for(const field of ['vx','vy','ax','ay'])near(k.attachments.T1[field],2*k.nodes.B[field],1e-4);}
});
test('活动导轨与固连滑块 Jacobian 符合坐标扰动数值导数',()=>{
  for(const key of ['rotguide','sine','doubleblock','doubleslider']){const m=M.example(key),pose=Object.fromEntries(m.nodes.map(n=>[n.id,{x:n.x,y:n.y}])),ids=m.nodes.map(n=>n.id),angle=m.motor.pivot===null?m.motor.initialAngle:undefined,eq=S.equations(m,pose,ids,angle),h=1e-4;for(let c=0;c<ids.length*2;c++){const id=ids[Math.floor(c/2)],axis=c%2?'y':'x',plus=G.clone(pose),minus=G.clone(pose);plus[id][axis]+=h;minus[id][axis]-=h;const a=S.equations(m,plus,ids,angle).residuals,b=S.equations(m,minus,ids,angle).residuals;for(let r=0;r<a.length;r++)near(eq.jacobian[r][c],(a[r]-b[r])/(2*h),2e-6);}}
});
test('v5 分享保留活动导轨、固连关系与返程相位；无效引用和摆动范围被拒绝',()=>{
  for(const key of ['sine','doubleblock','doubleslider','doublerocker']){const m=M.example(key),p=D.at(m,160),file=C.write(m,D.swing(m)?{angle:p.angle,drivePhase:p.phase}:{});assert.deepEqual(C.read(JSON.parse(JSON.stringify(file))).model,m);if(D.swing(m))near(C.read(file).presentation.drivePhase,160);}
  for(const update of [m=>m.sliders[1].guide='Missing',m=>m.sliders[0].block='L1',m=>m.sliders[0].blockAngle=NaN,m=>m.version=4]){const m=M.example('sine');update(m);assert.throws(()=>M.validate(m));}
  const m=M.example('doublerocker');for(const update of [x=>x.motor.minAngle=90,x=>x.motor.maxAngle=1000,x=>x.motor.initialPhase=90,x=>x.version=4]){const bad=G.clone(m);update(bad);assert.throws(()=>M.validate(bad));}
  const cleaned=M.example('sine');cleaned.links=cleaned.links.filter(l=>l.id!=='L2');M.prune(cleaned);assert.equal(cleaned.sliders.length,0);assert.doesNotThrow(()=>M.validate(cleaned));assert.ok(V.snapshot(M.example('doubleblock'),{traces:{}}).includes('data-moving-guide="true"'));
});
test('摆动曲线按往返周期采样，时间保留返程符号和同角度两次经过',()=>{
  const m=M.example('doublerocker'),data=Q.sample(m),time=Q.series(m,data,['B'],'angular','time',{B:'L1'}),angle=Q.series(m,data,['B'],'angular','angle',{B:'L1'});assert.equal(data.ok,true);assert.equal(data.angleCycle,false);assert.equal(time[0].points.length,361);near(time[0].points.at(-1).x,5);assert.ok(time[0].points.some(p=>p.y>0)&&time[0].points.some(p=>p.y<0));near(Q.layout(angle,'angular','angle',false).xMin,20);near(Q.layout(angle,'angular','angle',false).xMax,70);
});
