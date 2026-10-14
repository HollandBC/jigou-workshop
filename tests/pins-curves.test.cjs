'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry.js'),M=require('../src/model.js'),S=require('../src/solver.js'),K=require('../src/motion.js'),V=require('../src/view.js'),Q=require('../src/curves.js'),C=require('../src/cases.js');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function crank(){const m=M.empty();m.nodes=[{id:'A',name:'A',x:0,y:0,fixed:true,trace:false},{id:'B',name:'B',x:40,y:0,fixed:false,trace:true}];m.links=[{id:'L1',name:'曲柄',a:'A',b:'B',length:40,color:'#3877e8'}];m.motor={link:'L1',pivot:'A',initialAngle:0,rpm:12};return M.validate(m);}
function branched(){const m=crank(),j=M.addPin(m,'L1',.5);m.nodes.push({id:'F',name:'滑动端',x:120,y:0,fixed:false,trace:true});m.links.push({id:'L2',name:'从杆上铰点引出的新杆',a:j,b:'F',length:100,color:'#14a59b'});m.sliders.push({id:'S1',node:'F',origin:{x:0,y:0},angle:0});return M.validate(m);}
test('杆上铰点不拆母杆、不增加自由度，整周位置与速度加速度符合刚体圆周公式',()=>{
  const m=crank(),id=M.addPin(m,'L1',.25),clean=M.validate(m),f=M.mobility(clean),sweep=S.sweep(clean),w=12*Math.PI/30;assert.equal(f.n,1);assert.equal(f.lower,1);assert.equal(f.dof,1);assert.equal(f.isolated,0);assert.equal(S.analyze(clean).remaining,0);assert.equal(sweep.ok,true);
  for(const frame of sweep.frames){const a=G.rad(frame.angle),p=frame.positions[id],k=K.analyze(clean,frame.positions);assert.equal(k.ok,true,k.message);near(p.x,10*Math.cos(a));near(p.y,10*Math.sin(a));near(k.nodes[id].vx,-w*10*Math.sin(a));near(k.nodes[id].vy,w*10*Math.cos(a));near(k.nodes[id].ax,-w*w*p.x);near(k.nodes[id].ay,-w*w*p.y);}
});
test('从杆上铰点引出的连杆和滑块构成可驱动闭环，整周符合独立滑块公式',()=>{
  const m=branched(),sweep=S.sweep(m),f=M.mobility(m);assert.equal(sweep.ok,true,sweep.message);assert.equal(f.n,3);assert.equal(f.lower,4);assert.equal(f.dof,1);assert.equal(f.joints.find(j=>j.id==='J1').rotational,1);assert.equal(S.analyze(m).remaining,0);
  for(const frame of sweep.frames){const a=G.rad(frame.angle),expected=20*Math.cos(a)+Math.sqrt(100**2-(20*Math.sin(a))**2);near(frame.positions.F.x,expected);near(frame.positions.F.y,0);near(G.distance(frame.positions.J1,frame.positions.F),100);assert.equal(K.analyze(m,frame.positions).ok,true);}
});
test('嵌套杆上铰点继承各自母杆的仿射运动，修改参数和文件往返保留约束',()=>{
  const m=branched(),id=M.addPin(m,'L2',.3),clean=M.validate(m),r=S.solve(clean,47),k=K.analyze(clean,r.positions);assert.equal(r.ok,true,r.message);assert.equal(k.ok,true,k.message);
  for(const axis of ['x','y'])near(r.positions[id][axis],.7*r.positions.J1[axis]+.3*r.positions.F[axis]);for(const field of ['vx','vy','ax','ay'])near(k.nodes[id][field],.7*k.nodes.J1[field]+.3*k.nodes.F[field]);
  assert.deepEqual(C.read(JSON.parse(JSON.stringify(C.write(clean)))).model,clean);assert.ok(V.snapshot(clean,{showGrid:false,traces:{}}).includes('data-rod-pin="true"'));
  m.nodes.find(n=>n.id===id).onLink.t=.6;M.syncPins(m);assert.doesNotThrow(()=>M.validate(m));near(m.nodes.find(n=>n.id===id).x,.4*m.nodes.find(n=>n.id==='J1').x+.6*m.nodes.find(n=>n.id==='F').x);
});
test('杆上铰点增加实际铰接副，删除母杆级联清理约束并可保留其他节点',()=>{
  const m=branched();M.addPin(m,'L2',.5);m.links=m.links.filter(l=>l.id!=='L1');M.prune(m);assert.equal(m.nodes.some(n=>n.onLink),false);assert.equal(m.links.length,0);assert.equal(m.motor,null);assert.ok(m.nodes.some(n=>n.id==='F'));assert.doesNotThrow(()=>M.validate(m));
  const triangle=M.example('jansen');M.addPin(triangle,'L10',.5);const clean=M.validate(triangle);assert.equal(M.mobility(clean).n,7);assert.equal(M.mobility(clean).lower,10);assert.equal(S.analyze(clean).dof,1);
});
test('坏母杆、端点重合、非有限参数、坐标不一致及依赖循环不能导入',()=>{
  const m=branched();for(const modify of [x=>x.nodes.find(n=>n.onLink).onLink.link='Unknown',x=>x.nodes.find(n=>n.onLink).onLink.t=0,x=>x.nodes.find(n=>n.onLink).onLink.t=NaN,x=>x.nodes.find(n=>n.onLink).x=99,x=>x.nodes.find(n=>n.onLink).onLink.link='L2',x=>x.version=3]){const bad=G.clone(m);modify(bad);assert.throws(()=>M.validate(bad));}
  const cycle=branched();M.addPin(cycle,'L2',.5);cycle.nodes.find(n=>n.id==='J1').onLink={link:'L2',t:.5};assert.throws(()=>M.validate(cycle));
  const ordinary=M.example('attached');ordinary.version=3;assert.equal(M.validate(ordinary).version,9);assert.equal(M.validate(ordinary).attachments.length,3);
});
test('函数曲线的节点速度符合独立滑块导数，角度和时间范围正确',()=>{
  const m=M.example('slider'),before=JSON.stringify(m),data=Q.sample(m),lines=Q.series(m,data,['B','C'],'speed','angle'),w=12*Math.PI/30;assert.equal(data.ok,true,data.message);assert.equal(lines[0].points.length,361);assert.equal(JSON.stringify(m),before);
  for(const p of lines[1].points){const a=G.rad(p.x),v=w*(-45*Math.sin(a)-45**2*Math.sin(a)*Math.cos(a)/Math.sqrt(155**2-45**2*Math.sin(a)**2));near(p.y,Math.abs(v));}for(const p of lines[0].points)near(p.y,45*w);
  const time=Q.series(m,data,['C'],'speed','time');near(time[0].points.at(-1).x,5);assert.equal(Q.layout(lines,'speed','angle',true).xMax,360);assert.ok(Q.svg(lines,'speed','angle',true).includes('data-curve="C"'));
  m.motor.rpm=300;const fast=Q.sample(m),short=Q.series(m,fast,['C'],'speed','time');near(Q.layout(short,'speed','time',true).xMax,.2);
});
test('反转时间曲线遵守转向，角速度参考杆可切换，CSV 保留符号与单位',()=>{
  const m=M.example('slider');m.motor.rpm=-12;const data=Q.sample(m);assert.equal(data.frames[1].angle,39);near(data.frames.at(-1).time,5);
  const crank=Q.series(m,data,['B'],'angular','angle',{B:'L1'}),coupler=Q.series(m,data,['B'],'angular','angle',{B:'L2'}),w=-12*Math.PI/30;for(const p of crank[0].points)near(p.y,w);for(const p of coupler[0].points){const a=G.rad(p.x);near(p.y,-w*45*Math.cos(a)/Math.sqrt(155**2-45**2*Math.sin(a)**2));}
  const csv=Q.csv(crank,'angular','angle');assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('rad/s'));assert.ok(csv.includes('-1.256637'));assert.equal(csv.split('\r\n').length,362);
});
test('零转速不伪造时间，未闭合机构返回部分区间，曲线空值保持断开',()=>{
  const m=crank();m.motor.rpm=0;const data=Q.sample(m);assert.equal(data.ok,true);assert.ok(data.frames.every(f=>f.time===null));const line=Q.series(m,data,['B'],'speed','angle');assert.ok(line[0].points.every(p=>p.y===0));
  const unavailable=Q.sample(M.empty());assert.equal(unavailable.ok,false);assert.equal(unavailable.frames.length,0);
  const partial=M.example('fourbar');partial.links[1].length=120;partial.links[2].length=50;const d=Q.sample(partial);assert.equal(d.ok,false);assert.ok(d.frames.length>1);assert.ok(d.message.includes('仅显示已求解'));
  const svg=Q.svg([{id:'B',color:'#3877e8',points:[{x:0,y:1},{x:1,y:null},{x:2,y:3}]}],'speed','angle',false);assert.equal((svg.match(/data-curve="B" d="M[^\"]*M/g)||[]).length,1);
});
test('X–Y 圆周轨迹按运动顺序闭合，并以相同像素每毫米显示两个坐标',()=>{
  const m=crank(),start=37;m.motor.initialAngle=start;m.nodes[1].x=40*Math.cos(G.rad(start));m.nodes[1].y=40*Math.sin(G.rad(start));
  const before=JSON.stringify(m),data=Q.sample(m),line=Q.series(m,data,['B'],'y','x')[0];assert.equal(data.ok,true);assert.equal(line.points.length,361);assert.equal(JSON.stringify(m),before);
  for(const [i,p]of line.points.entries()){const a=G.rad(start+i);near(p.x,40*Math.cos(a));near(p.y,40*Math.sin(a));near(p.phase,start+i);near(p.time,i/72);}
  near(line.points[0].x,line.points.at(-1).x);near(line.points[0].y,line.points.at(-1).y);assert.ok(line.points.some((p,i)=>i&&p.x<line.points[i-1].x));assert.ok(line.points.some((p,i)=>i&&p.x>line.points[i-1].x));
  const layout=Q.layout([line],'y','x',true);near(layout.px(40)-layout.px(0),layout.py(0)-layout.py(40));
  const svg=Q.svg([line],'y','x',true);assert.ok(svg.includes('X 坐标 / mm'));assert.ok(svg.includes('Y 坐标 / mm'));
});
test('偏置与直线 X–Y 轨迹的等比例边界不强制包含远处原点，零转速坐标仍可显示',()=>{
  const m=crank();for(const n of m.nodes){n.x+=1000;n.y+=500;}m.motor.rpm=0;
  const data=Q.sample(m),lines=Q.series(m,data,['B'],'y','x'),layout=Q.layout(lines,'y','x',true);assert.ok(layout.xMin>800);assert.ok(layout.yMin>400);assert.ok(lines[0].points.every(p=>p.time===null&&Number.isFinite(p.x)&&Number.isFinite(p.y)));near(layout.px(1)-layout.px(0),layout.py(0)-layout.py(1));
  const slider=M.example('slider'),straight=Q.series(slider,Q.sample(slider),['C'],'y','x'),a=Q.layout(straight,'y','x',true);assert.ok(straight[0].points.every(p=>Math.abs(p.y)<1e-9));assert.ok(a.yMax>a.yMin);near(a.px(1)-a.px(0),a.py(0)-a.py(1));
});
test('分速度对比保留正负号，两个分量符合圆周解析导数且合成为原有线速度',()=>{
  const m=crank(),w=12*Math.PI/30,data=Q.sample(m),lines=Q.series(m,data,['B'],'components','angle'),speed=Q.series(m,data,['B'],'speed','angle')[0];assert.equal(lines.length,2);assert.equal(lines[0].color,lines[1].color);assert.equal(lines[1].dash,'7 4');
  for(const [i,p]of lines[0].points.entries()){const a=G.rad(p.x),vy=lines[1].points[i];near(p.y,-40*w*Math.sin(a));near(vy.y,40*w*Math.cos(a));near(Math.hypot(p.y,vy.y),speed.points[i].y);}
  assert.ok(lines.every(l=>l.points.some(p=>p.y>1)&&l.points.some(p=>p.y< -1)));
  const csv=Q.csv(lines,'components','angle');assert.ok(csv.includes('Vx'));assert.ok(csv.includes('Vy'));assert.equal(csv.split('\r\n').length,362);assert.ok(Q.svg(lines,'components','angle',true).includes('stroke-dasharray="7 4"'));
});
test('X–Y CSV 分别保存各节点坐标与公共相位时间，不把不同节点当作同一个 X 横轴',()=>{
  const m=crank(),data=Q.sample(m),lines=Q.series(m,data,['A','B'],'y','x'),csv=Q.csv(lines,'y','x'),rows=csv.split('\r\n');assert.ok(rows[0].includes('"A_X_mm","A_Y_mm","B_X_mm","B_Y_mm"'));assert.equal(rows.length,362);
  const row=rows[1].split(',').map(Number);assert.equal(row.length,7);near(row[3],0);near(row[4],0);near(row[5],40);near(row[6],0);near(Number(rows.at(-1).split(',')[1]),360);
  const components=Q.series(m,data,['A','B'],'components','x'),combined=Q.csv(components,'components','x');assert.equal(components.length,4);assert.equal(combined.split('\r\n')[1].split(',').length,9);assert.equal((combined.split('\r\n')[0].match(/_X_mm/g)||[]).length,2);
});
test('分速度曲线不把奇异位形空值变为零，X–Y 几何在该帧保持可用',()=>{
  const m=crank(),data=Q.sample(m);data.frames[10]={...data.frames[10],motion:{ok:false}};
  const lines=Q.series(m,data,['B'],'components','time');assert.equal(lines[0].points[10].y,null);assert.equal(lines[1].points[10].y,null);
  assert.equal(Q.csv(lines,'components','time').split('\r\n')[11].split(',').slice(1).join(','),',');
  const xy=Q.series(m,data,['B'],'y','x');assert.ok(Number.isFinite(xy[0].points[10].x)&&Number.isFinite(xy[0].points[10].y));
});
