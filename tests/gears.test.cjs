'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry'),M=require('../src/model'),B=require('../src/gears'),D=require('../src/drive'),S=require('../src/solver'),K=require('../src/motion'),C=require('../src/cases'),Z=require('../src/editing'),V=require('../src/view'),Q=require('../src/curves');
const near=(a,b,t=3e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`),node=(m,id)=>m.nodes.find(n=>n.id===id);
for(const[key,expected,turns]of [['externalgear',-.5,2],['internalgear',.25,4],['worm',1/40,40],['geartrain',1/6,6],['planetary',-1,3],['flapping',-1,1]])test(`${key}：完整轮系周期、独立传动比、线速度与二阶运动学`,()=>{
  const m=M.example(key),before=JSON.stringify(m),r=S.sweep(m,5),output=key==='geartrain'?m.gears[3]:m.gears[1];assert.equal(r.ok,true,r.message);assert.equal(M.mobility(m).dof,1);assert.equal(M.mobility(m).higher,m.meshes.length);assert.equal(S.analyze(m).dof,1);assert.equal(S.analyze(m).remaining,0);assert.equal(m.motor.sampleTurns,turns);
  for(let i=0;i<r.frames.length;i+=7){const f=r.frames[i],k=K.analyze(m,f.positions,f.drive);assert.equal(k.ok,true,k.message);near(k.links[output.link].omega,expected*f.drive.omega);near(k.links[output.link].alpha,0);for(const l of m.links)near(G.distance(f.positions[l.a],f.positions[l.b]),l.length);assert.equal(B.check(m,f.positions),true);}
  for(const n of m.nodes)near(G.distance(r.frames[0].positions[n.id],r.frames.at(-1).positions[n.id]),0);assert.equal(JSON.stringify(m),before);
});
test('行星齿圈固定时 Willis 方程与行星架公转、行星轮自转同时成立；改为行星架输入仍可驱动',()=>{
  let m=M.example('planetary');for(const degrees of [40,180,400,760,1120,-500]){const r=S.solve(m,degrees),k=K.analyze(m,r.positions,D.at(m,degrees));assert.equal(r.ok,true);assert.equal(k.ok,true);near(k.links.L2.omega,Math.PI/3);near(k.links.L3.omega,-Math.PI);near((k.links.L1.omega-k.links.L2.omega)/(k.links.L4.omega-k.links.L2.omega),-80/40);const a=G.rad(10+(degrees-40)/3);near(r.positions.P.x,60*Math.cos(a));near(r.positions.P.y,60*Math.sin(a));near(k.nodes.P.speed,60*Math.PI/3);near(k.nodes.P.acceleration,60*(Math.PI/3)**2);}
  m.motor={link:'L2',pivot:'O',initialAngle:10,rpm:10,sampleTurns:1};m=M.validate(m);const r=S.solve(m,100),k=K.analyze(m,r.positions,D.at(m,100));assert.equal(r.ok,true);assert.equal(k.ok,true);near(k.links.L1.omega,3*k.links.L2.omega);near(B.ratios(m).L1,3);
});
test('行星架固定、齿圈自由时定轴总比正确；解除两项约束的差动不伪造确定转速',()=>{
  let m=M.example('planetary');node(m,'P').fixed=true;node(m,'R').fixed=false;m=M.validate(m);near(B.ratios(m).L4,-.5);const r=S.solve(m,90),k=K.analyze(m,r.positions,D.at(m,90));assert.equal(r.ok,true);near(k.links.L2.omega,0);near(k.links.L4.omega,-Math.PI/2);
  node(m,'P').fixed=false;m=M.validate(m);assert.equal(S.analyze(m).dof,2);assert.equal(S.solve(m,90).code,'underconstrained');assert.deepEqual(B.ratios(m),{L1:1});assert.equal(B.cycleTurns(m),null);
});
test('跨越零角和连续多周、反转、单次大角度求解均保持齿轮相位，分享保存累计输入角度',()=>{
  const m=M.example('externalgear');let previous=null;for(let a=-320;a<=1480;a+=10){const r=S.solve(m,a,previous);assert.equal(r.ok,true);near(B.angle(m,'L2',r.positions),G.rad(20-(a-40)/2));previous=r.positions;}
  const r=S.solve(m,940),file=C.write(m,{angle:940,speedNode:'B',restoreTraces:true}),read=C.read(JSON.parse(JSON.stringify(file))),copy=S.solve(read.model,read.presentation.angle);assert.equal(file.version,9);assert.equal(read.presentation.angle,940);near(G.distance(r.positions.B,copy.positions.B),0);assert.equal(Object.keys(r.positions).length,m.nodes.length);assert.equal(JSON.stringify(r.positions).includes('__angles'),false);
});
test('蜗杆头数、正方向约定、负输入转速及摆动角加速度遵守独立公式',()=>{
  let m=M.example('worm');m.gears[0].starts=2;m.meshes[0].direction=-1;m.motor.rpm=-60;m=M.validate(m);let r=S.solve(m,300),k=K.analyze(m,r.positions,D.at(m,300));near(k.links.L2.omega,Math.PI*.1);near(B.train(m,k)[1].ratio,-20);
  m.motor={...m.motor,rpm:15,mode:'swing',minAngle:20,maxAngle:70,initialPhase:D.phaseForAngle({...m,motor:{...m.motor,mode:'swing',minAngle:20,maxAngle:70}},40)};m=M.validate(m);for(const p of [30,90,180,270]){const d=D.at(m,p),r=S.solve(m,d.angle),k=K.analyze(m,r.positions,d);assert.equal(k.ok,true);near(k.links.L2.omega,-.05*d.omega);near(k.links.L2.alpha,-.05*d.alpha);}
});
test('复合轮系同轴齿轮合为一个刚体，扑翼机构左右尖端位置速度加速度镜像且每周摆动',()=>{
  const c=M.example('geartrain');assert.equal(M.mobility(c).n,3);assert.equal(c.gears[1].link,c.gears[2].link);near(B.ratios(c).L3,1/6);
  const m=M.example('flapping'),r=S.sweep(m,4),ys=[];for(const f of r.frames){const pos=M.positions(m,f.positions),k=K.analyze(m,f.positions,f.drive);near(pos.T1.x,-pos.T2.x);near(pos.T1.y,pos.T2.y);near(k.attachments.T1.vx,-k.attachments.T2.vx);near(k.attachments.T1.vy,k.attachments.T2.vy);near(k.attachments.T1.ax,-k.attachments.T2.ax);near(k.attachments.T1.ay,k.attachments.T2.ay);ys.push(pos.T1.y);}assert.ok(Math.max(...ys)-Math.min(...ys)>20);assert.equal(M.mobility(m).dof,1);
});
test('齿数与模数修改对齐定轴轮系，行星齿数兼容条件和轨道半径同步调整',()=>{
  let m=M.example('geartrain');B.resize(m,'G2','teeth',50);m=M.validate(m);assert.equal(B.check(m,Object.fromEntries(m.nodes.map(n=>[n.id,n]))),true);near(B.ratios(m).L3,2/15);B.resize(m,'G1','module',3);m=M.validate(m);assert.deepEqual(m.gears.map(g=>g.module),[3,3,2,2]);near(node(m,'P').x-node(m,'O').x,105);near(node(m,'Q').x-node(m,'P').x,80);
  m=M.example('planetary');B.resize(m,'G1','teeth',50);m=M.validate(m);assert.equal(m.gears[2].teeth,90);near(m.links.find(l=>l.id==='L2').length,70);near(B.ratios(m).L2,50/140);assert.equal(S.sweep(m,5).ok,true);
});
test('齿轮轴心编辑平移定轴轮系，活动行星轴沿公转圆移动；偏心点可连接真实铰点',()=>{
  let m=M.example('externalgear');const old=G.clone(m);Z.moveNode(m,'O',{x:20,y:15});m=M.validate(m);for(const n of m.nodes){near(n.x,node(old,n.id).x+20);near(n.y,node(old,n.id).y+15);}assert.equal(S.sweep(m,5).ok,true);
  m=M.example('planetary');Z.moveNode(m,'P',{x:20,y:70});m=M.validate(m);near(G.distance(node(m,'O'),node(m,'P')),60);assert.equal(S.solve(m,60).ok,true);
  m=M.example('externalgear');const pin=M.addPin(m,'L2',.5);m=M.validate(m);const r=S.solve(m,90),k=K.analyze(m,r.positions,D.at(m,90));near(G.distance(r.positions.P,r.positions[pin]),7);near(k.nodes[pin].speed,7*Math.PI/2);near(k.nodes[pin].acceleration,7*(Math.PI/2)**2);
});
test('齿轮约束 Jacobian 和加速度与独立坐标扰动、轨迹中心差分一致',()=>{
  const m=M.example('planetary'),r=S.solve(m,90),p=r.positions,ids=m.nodes.map(n=>n.id),e=S.equations(m,p,ids),dt=1e-4,w=m.motor.rpm*6,k=K.analyze(m,p,D.at(m,90));for(let col=0;col<ids.length*2;col++){const a=G.clone(p),b=G.clone(p),id=ids[Math.floor(col/2)],axis=col%2?'y':'x',h=1e-5;B.anchors(m,a,p);B.anchors(m,b,p);a[id][axis]+=h;b[id][axis]-=h;const ea=S.equations(m,a,ids),eb=S.equations(m,b,ids);for(let row=0;row<e.residuals.length;row++)near((ea.residuals[row]-eb.residuals[row])/(2*h),e.jacobian[row][col],2e-5);}
  const minus=S.solve(m,90-w*dt,p).positions,plus=S.solve(m,90+w*dt,p).positions;for(const id of ['P','B'])for(const axis of ['x','y']){near((plus[id][axis]-minus[id][axis])/(2*dt),k.nodes[id]['v'+axis],1e-4);near((plus[id][axis]-2*p[id][axis]+minus[id][axis])/(dt*dt),k.nodes[id]['a'+axis],3e-4);}
});
test('无效齿数、模数、中心距、轴引用和活动行星架拒绝导入，删母杆级联清理啮合',()=>{
  const source=M.example('planetary');for(const mutate of [m=>m.gears[0].teeth=2,m=>m.gears[0].module=NaN,m=>m.gears[0].center='B',m=>m.meshes[0].carrier='L1',m=>m.meshes[1].type='external',m=>m.gears[2].teeth=100,m=>m.version=5,m=>m.gears[0].kind='constructor',m=>m.meshes[0].type='toString',m=>m.meshes.push({...m.meshes[0],id:'H3'})]){const m=G.clone(source);mutate(m);assert.throws(()=>M.validate(m));}
  const m=G.clone(source);m.links=m.links.filter(l=>l.id!=='L3');M.prune(m);assert.equal(m.gears.length,2);assert.equal(m.meshes.length,0);assert.doesNotThrow(()=>M.validate(m));
});
test('多周曲线不折叠角度，缩减采样保留完整周期端点，SVG/PDF 快照包括齿轮并清除绘图草稿',()=>{
  const m=M.example('worm'),data=Q.sample(m);assert.equal(data.ok,true);assert.equal(data.angleCycle,false);assert.equal(data.frames.length,3601);near(data.frames.at(-1).angle-data.frames[0].angle,14400);const lines=Q.series(m,data,['B'],'angular','angle',{B:'L2'});near(lines[0].points[0].x,40);near(lines[0].points.at(-1).x,14440);near(lines[0].points[0].y,Math.PI/40);
  const svg=V.snapshot(m,{angle:40,showDimensions:true,showTraces:true,traces:{},showGrid:false,gearDraft:{point:{x:100,y:100}},meshFirst:'G1',selection:{type:'gears',id:'G1'}});assert.match(svg,/data-gear="G1"/);assert.match(svg,/data-mesh="H1"/);assert.doesNotMatch(svg,/data-gear-preview|data-selection-highlight/);assert.match(svg,/i = 40/);
});
test('连杆间接驱动齿轮时仍保持啮合，并显示随位形变化的瞬时总传动比',()=>{
  let m=M.example('fourbar');B.create(m,'D','C',{teeth:20,module:2});m.nodes.push({id:'Q',name:'输出轴',x:220,y:0,fixed:true,trace:false},{id:'R',name:'输出偏心点',x:230,y:0,fixed:false,trace:true});B.create(m,'Q','R',{teeth:40,module:2});B.mesh(m,'G1','G2','external');m=M.validate(m);const result=S.sweep(m,2),ratios=[];assert.equal(result.ok,true);assert.equal(M.mobility(m).dof,1);assert.equal(B.cycleTurns(m),null);
  for(const f of result.frames){const k=K.analyze(m,f.positions,f.drive),report=B.train(m,k);assert.equal(k.ok,true);near(k.links.L4.omega,-.5*k.links.L3.omega);near(k.links.L4.alpha,-.5*k.links.L3.alpha);assert.equal(report[1].instant,true);if(report[1].ratio!==null){near(report[1].ratio,k.links.L1.omega/k.links.L4.omega);ratios.push(report[1].ratio);}}
  assert.ok(Math.max(...ratios)-Math.min(...ratios)>2);
});
