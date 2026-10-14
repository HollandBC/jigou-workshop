'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry.js'),M=require('../src/model.js'),S=require('../src/solver.js'),K=require('../src/motion.js'),C=require('../src/cases.js');
// Independent law-of-cosines construction, not the production circle solver.
function intersect(p,r,q,s,side){const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy),phi=Math.atan2(dy,dx)+side*Math.acos((r*r+d*d-s*s)/(2*r*d));return{x:p.x+r*Math.cos(phi),y:p.y+r*Math.sin(phi)};}
function reference(angle){const theta=angle*Math.PI/180,O={x:0,y:0},A={x:38,y:7.8},B={x:38+15*Math.cos(theta),y:7.8+15*Math.sin(theta)},C=intersect(O,41.5,B,50,1),D=intersect(O,40.1,C,55.8,1),E=intersect(O,39.3,B,61.9,-1),F=intersect(D,39.4,E,36.7,-1),H=intersect(F,65.7,E,49,-1);return{O,A,B,C,D,E,F,H};}
function close(a,b,tolerance=1e-7){assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);}
test('Jansen 整周与独立余弦定理一致，杆长、固定点、装配分支和足端步态正确',()=>{
  const m=M.example('jansen'),sweep=S.sweep(m);assert.equal(sweep.ok,true,sweep.message);assert.equal(sweep.frames.length,361);assert.equal(m.nodes.length,8);assert.equal(m.links.length,11);assert.equal(S.analyze(m).dof,1);assert.equal(S.analyze(m).remaining,0);assert.equal(M.mobility(m).dof,1);
  for(const f of sweep.frames){const expected=reference(f.angle);for(const n of m.nodes){close(f.positions[n.id].x,expected[n.id].x);close(f.positions[n.id].y,expected[n.id].y);}for(const l of m.links)close(G.distance(f.positions[l.a],f.positions[l.b]),l.length);}
  const first=sweep.frames[0].positions,last=sweep.frames.at(-1).positions;for(const n of m.nodes)close(G.distance(first[n.id],last[n.id]),0);
  const y=sweep.frames.map(f=>f.positions.H.y),min=Math.min(...y),low=sweep.frames.filter(f=>f.positions.H.y<min+.8).map(f=>f.positions.H.x);assert.ok(Math.max(...y)-min>20);assert.ok(Math.max(...low)-Math.min(...low)>50,'足端应有长而近水平的支撑段');
});
test('Jansen 连续正反两周无装配跳跃，运动学在整周均可求解',()=>{
  const m=M.example('jansen');for(const sign of [1,-1]){let previous=null;for(let i=0;i<=720;i++){const angle=40+sign*i,r=S.solve(m,angle,previous);assert.equal(r.ok,true,r.message);assert.equal(K.analyze(m,r.positions).ok,true);if(previous)for(const n of m.nodes)assert.ok(G.distance(r.positions[n.id],previous[n.id])<1.1);previous=r.positions;}for(const n of m.nodes)close(G.distance(previous[n.id],n),0);}
});
test('Jansen 足端速度和加速度与独立轨迹中心差分一致，可往返分享',()=>{
  const m=M.example('jansen'),sweep=S.sweep(m),omega=m.motor.rpm*2*Math.PI/60,h=.0001,dt=h*Math.PI/180/omega;
  for(const angle of [40,90,177,270]){const r=sweep.frames[angle-40],k=K.analyze(m,r.positions),left=reference(angle-h).H,right=reference(angle+h).H,center=reference(angle).H,v=k.nodes.H;assert.equal(k.ok,true,k.message);close(v.vx,(right.x-left.x)/(2*dt),1e-5);close(v.vy,(right.y-left.y)/(2*dt),1e-5);close(v.ax,(right.x-2*center.x+left.x)/(dt*dt),.04);close(v.ay,(right.y-2*center.y+left.y)/(dt*dt),.04);close(k.links.L1.omega,omega);}
  const file=C.write(m,{angle:177,metric:'acceleration',speedNode:'H',restoreTraces:true}),decoded=C.read(JSON.parse(JSON.stringify(file)));assert.deepEqual(decoded.model,m);assert.equal(decoded.presentation.speedNode,'H');assert.equal(decoded.presentation.restoreTraces,true);assert.equal(m.nodes.filter(n=>n.trace)[0].id,'H');
});
