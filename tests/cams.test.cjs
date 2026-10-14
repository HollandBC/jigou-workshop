'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry'),M=require('../src/model'),C=require('../src/cams'),S=require('../src/solver'),K=require('../src/motion'),D=require('../src/drive'),F=require('../src/cases'),V=require('../src/view'),Q=require('../src/curves'),B=require('../src/gears'),Z=require('../src/editing');
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const positions=m=>Object.fromEntries(m.nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
function eccentric(type='translate'){
  const m=M.empty(),r=40,e=4,radii=Array.from({length:360},(_,i)=>{const a=G.rad(i);return e*Math.cos(a)+Math.sqrt(r*r-e*e*Math.sin(a)**2);});
  C.install(m,{type,source:'drawn',radii});return M.validate(m);
}
test('两类凸轮独立构件计数为 F=1，整周正反连续闭合且求解不改变模型',()=>{
  for(const type of ['camtranslate','camrocker']){const m=M.example(type),before=JSON.stringify(m),c=m.cams[0],f=M.mobility(m);assert.equal(f.n,2);assert.equal(f.lower,2);assert.equal(f.higher,1);assert.equal(f.dof,1);assert.equal(S.analyze(m).remaining,0);
    for(const rpm of [12,-12]){m.motor.rpm=rpm;const r=S.sweep(m);assert.ok(r.ok,r.message);assert.equal(r.frames.length,361);for(const frame of r.frames){const expected=C.follower(m,c,G.rad(frame.angle));near(G.distance(frame.positions[c.node],expected),0);assert.ok(frame.residual<1e-7);}near(G.distance(r.frames[0].positions[c.node],r.frames.at(-1).positions[c.node]),0);}m.motor.rpm=12;assert.equal(JSON.stringify(m),before);}
});
test('摆线直动从动件的位置、速度与加速度符合独立解析公式及转速缩放',()=>{
  const m=M.example('camtranslate'),c=m.cams[0],beta=2*Math.PI/3;
  for(const rpm of [12,-12,0,24])for(const deg of [15,45,90,150,200,250,330]){m.motor.rpm=rpm;const p=S.solve(m,deg).positions,k=K.analyze(m,p,D.at(m,deg)),a=G.rad(deg),w=rpm*Math.PI/30;assert.ok(k.ok,k.message);let s=0,ds=0,dds=0;
    if(a<beta){const t=a/beta;s=c.lift*(t-Math.sin(2*Math.PI*t)/(2*Math.PI));ds=c.lift*(1-Math.cos(2*Math.PI*t))/beta;dds=c.lift*2*Math.PI*Math.sin(2*Math.PI*t)/beta**2;}
    else if(a<Math.PI)s=c.lift;else if(a<5*Math.PI/3){const t=(a-Math.PI)/beta;s=c.lift*(1-t+Math.sin(2*Math.PI*t)/(2*Math.PI));ds=-c.lift*(1-Math.cos(2*Math.PI*t))/beta;dds=-c.lift*2*Math.PI*Math.sin(2*Math.PI*t)/beta**2;}
    near(p[c.node].y,45+s);near(k.nodes[c.node].vy,ds*w);near(k.nodes[c.node].ay,dds*w*w);near(k.nodes[c.node].vx,0);}
});
test('摆动从动件的角速度、角加速度与圆周加速度符合独立公式',()=>{
  const m=M.example('camrocker'),c=m.cams[0],a=G.rad(45),t=a/G.rad(120),scale=-G.rad(c.swing),w=12*Math.PI/30,ds=(1-Math.cos(2*Math.PI*t))/G.rad(120),dds=2*Math.PI*Math.sin(2*Math.PI*t)/G.rad(120)**2,p=S.solve(m,45).positions,k=K.analyze(m,p,D.at(m,45));
  near(k.links[c.followerLink].omega,scale*ds*w);near(k.links[c.followerLink].alpha,scale*dds*w*w);const q=p[c.node],b=p[c.pivot],omega=scale*ds*w,alpha=scale*dds*w*w;near(k.nodes[c.node].ax,-(omega**2)*(q.x-b.x)-alpha*(q.y-b.y));near(k.nodes[c.node].ay,-(omega**2)*(q.y-b.y)+alpha*(q.x-b.x));
});
test('滚子包络轮廓与整周滚子保持相切，支持偏置导轨与另一侧摆杆',()=>{
  for(const settings of [{type:'translate',offset:10,axisAngle:35},{type:'oscillate',side:-1}]){const m=M.empty();C.install(m,settings);const clean=M.validate(m),c=clean.cams[0],points=C.data(clean,c).profile;
    for(let deg=0;deg<360;deg+=10){const p=S.solve(clean,deg).positions,relative=C.rotate({x:p[c.node].x-p[c.center].x,y:p[c.node].y-p[c.center].y},-G.rad(deg));let distance=Infinity;for(let i=0;i<points.length;i++)distance=Math.min(distance,G.projectSegment(relative,points[i],points[(i+1)%points.length]).distance);near(distance,c.rollerRadius,.006);}}
});
test('手绘偏心圆直动接触按真实轮廓计算，运动学与独立圆交公式一致',()=>{
  const m=eccentric(),c=m.cams[0],before=JSON.stringify(m),value=a=>4*Math.sin(a)+Math.sqrt(45**2-16*Math.cos(a)**2),w=12*Math.PI/30,h=.0002;
  for(let deg=0;deg<360;deg+=15){const a=G.rad(deg),r=S.solve(m,deg);assert.ok(r.ok,r.message);near(r.positions[c.node].y,value(a),.00001);const k=K.analyze(m,r.positions,D.at(m,deg));assert.ok(k.ok,k.message);near(k.nodes[c.node].vy,(value(a+h)-value(a-h))/(2*h)*w,.002);near(k.nodes[c.node].ay,(value(a+h)-2*value(a)+value(a-h))/(h*h)*w*w,.03);}
  assert.equal(JSON.stringify(m),before);
});
test('手绘偏心圆摆动接触符合独立圆圆交点，整周无跳支',()=>{
  const m=eccentric('oscillate'),c=m.cams[0],base=m.nodes.find(n=>n.id===c.pivot);let previous;
  for(let deg=0;deg<=360;deg+=5){const a=G.rad(deg),expected=G.circles({x:4*Math.cos(a),y:4*Math.sin(a)},45,base,65).find(p=>p.y>0),r=S.solve(m,deg,previous);assert.ok(r.ok,r.message);near(G.distance(expected,r.positions[c.node]),0,.00002);previous=r.positions;}
});
test('平滑运动规律的周期端点导数连续，停歇段为零，简谐端点保留加速度',()=>{
  for(const kind of ['cycloidal','polynomial']){const c={...C.defaults,law:kind};for(const deg of [0,120,150,180,300,330,360]){const q=C.displacement(c,G.rad(deg));near(q.first,0);near(q.second,0);}}
  const c={...C.defaults,law:'harmonic'};assert.ok(C.displacement(c,0).second>0);
});
test('v7 参数及手绘分享完整往返，旧格式拒绝携带凸轮约束，异常引用和轮廓被拒绝',()=>{
  for(const m of [M.example('camrocker'),eccentric()]){const file=F.write(m,{angle:72,speedNode:m.cams[0].node}),copy=F.read(JSON.parse(JSON.stringify(file)));assert.equal(file.version,9);assert.deepEqual(copy.model,m);near(G.distance(S.solve(m,72).positions[m.cams[0].node],S.solve(copy.model,72).positions[m.cams[0].node]),0);}
  const source=M.example('camtranslate');for(const patch of [m=>m.version=6,m=>m.cams[0].node='missing',m=>m.cams[0].link='bad',m=>m.cams[0].rise=350,m=>m.cams[0].rollerRadius=101,m=>m.cams[0].offset=50,m=>m.cams[0].law='constructor',m=>m.cams[0].source='other',m=>m.cams[0].radii=[1],m=>m.cams.push({...m.cams[0],id:'C2'})]){const m=G.clone(source);patch(m);if(m.cams[0].radii)m.cams[0].source='drawn';assert.throws(()=>M.validate(m));}
  const old=M.example('fourbar');old.version=6;delete old.cams;assert.equal(M.validate(old).version,9);
});
test('凸轮 Jacobian 与坐标扰动一致，连接从动件的下游连杆也能仿真',()=>{
  for(const key of ['camtranslate','camrocker']){const m=M.example(key),p=S.solve(m,48).positions,ids=m.nodes.map(n=>n.id),e=S.equations(m,p,ids),h=1e-5;for(let i=0;i<ids.length;i++)for(const [axis,offset]of [['x',0],['y',1]]){const plus=G.clone(p),minus=G.clone(p);plus[ids[i]][axis]+=h;minus[ids[i]][axis]-=h;const a=S.equations(m,plus,ids),b=S.equations(m,minus,ids);for(let j=0;j<e.residuals.length;j++)near(e.jacobian[j][i*2+offset],(a.residuals[j]-b.residuals[j])/(2*h),.0001);}}
  const m=M.example('camtranslate'),c=m.cams[0];m.nodes.push({id:'Q',name:'输出滑块',x:100,y:45,fixed:false,trace:true});m.links.push({id:'L2',name:'输出连杆',a:c.node,b:'Q',length:100,color:'#14a59b'});m.sliders.push({id:'S2',node:'Q',origin:{x:0,y:45},angle:0});const clean=M.validate(m),r=S.sweep(clean,3);assert.ok(r.ok,r.message);assert.equal(M.mobility(clean).dof,1);for(const frame of r.frames)assert.ok(K.analyze(clean,frame.positions).ok);
});
test('凸轮设计更新保持输出节点，删除安装约束级联清理且导出包含轮廓',()=>{
  const m=M.example('camtranslate'),c=m.cams[0],id=c.node;C.update(m,c.id,{...c,lift:30});const next=M.validate(m);assert.equal(next.cams[0].node,id);assert.ok(S.sweep(next,3).ok);const svg=V.snapshot(next,{showTraces:false,traces:{}});assert.match(svg,/data-cam-profile=/);assert.match(svg,/data-cam-roller=/);assert.doesNotMatch(svg,/data-selection-highlight/);
  next.sliders=[];M.prune(next);assert.equal(next.cams.length,0);assert.doesNotThrow(()=>M.validate(next));
});
test('凸轮曲线与 CSV 使用真实输入、X-Y 轨迹和分速度，零输入不伪造时间',()=>{
  const m=M.example('camtranslate'),c=m.cams[0],data=Q.sample(m);assert.ok(data.ok);const lines=Q.series(m,data,[c.node],'components','time');assert.equal(lines.length,2);assert.match(Q.csv(lines,'components','time'),/从动件 F.*Y 方向分速度/);m.motor.rpm=0;const zero=Q.sample(m);assert.ok(zero.ok);assert.ok(zero.frames.every(f=>f.time===null));
});
test('ZA 蜗杆示例轴距为节圆半径之和，简图正确显示圆柱蜗杆、传动比及参数编辑',()=>{
  const m=M.example('worm'),a=m.gears[0],b=m.gears[1],p=m.nodes.find(n=>n.id===a.center),q=m.nodes.find(n=>n.id===b.center);near(p.x,q.x);near(q.y-p.y,B.radius(a)+B.radius(b));assert.equal(B.ratios(m)[b.link],1/40);assert.match(V.snapshot(m,{traces:{}}),/data-worm-za="true"/);B.resize(m,b.id,'teeth',60);near(G.distance(p,q),B.radius(a)+B.radius(b));assert.ok(S.sweep(M.validate(m),30).ok);
});
test('拖动凸轮轴心保持整套安装几何，共用齿轮轴心同步，受约束节点拒绝自由移动',()=>{
  for(const key of ['camtranslate','camrocker','externalgear']){const m=M.example(key);if(key==='externalgear')C.install(m,{},{center:m.motor.pivot,link:m.motor.link});const before=G.clone(m),c=m.cams[0],center=m.nodes.find(n=>n.id===c.center),shift={x:23,y:-17};Z.moveNode(m,c.center,{x:center.x+shift.x,y:center.y+shift.y});
    for(const n of m.nodes){const old=before.nodes.find(o=>o.id===n.id);near(n.x,old.x+shift.x);near(n.y,old.y+shift.y);}if(c.guide){const s=m.sliders.find(s=>s.id===c.guide),old=before.sliders.find(s=>s.id===c.guide);near(s.origin.x,old.origin.x+shift.x);near(s.origin.y,old.origin.y+shift.y);}assert.ok(S.sweep(M.validate(m),10).ok);
    for(const id of [c.node,c.pivot,m.links.find(l=>l.id===c.link).b].filter(Boolean)){const unchanged=JSON.stringify(m);assert.throws(()=>Z.moveNode(m,id,{x:0,y:0}),/凸轮设计/);assert.equal(JSON.stringify(m),unchanged);}}
});
test('凸轮更换从动件类型保持输出引用与非零轴相位，并检查完整摆动输入周期',()=>{
  const m=M.example('camtranslate'),id=m.cams[0].id,node=m.cams[0].node,phase=m.nodes.find(n=>n.id===m.links[0].b);phase.x=12*Math.cos(G.rad(35));phase.y=12*Math.sin(G.rad(35));m.motor.initialAngle=35;
  C.update(m,id,{...C.defaults,type:'oscillate'});let clean=M.validate(m);assert.equal(clean.cams[0].node,node);near(clean.cams[0].zeroAngle,35);assert.ok(S.sweep(clean,5).ok);C.update(clean,id,{...C.defaults,type:'translate'});clean=M.validate(clean);assert.equal(clean.cams[0].node,node);near(clean.cams[0].zeroAngle,35);assert.equal(clean.cams[0].pivot,undefined);assert.ok(S.sweep(clean,5).ok);
  clean.motor.mode='swing';clean.motor.minAngle=-45;clean.motor.maxAngle=90;clean.motor.rpm=6;clean.motor.initialAngle=-45;clean=M.validate(clean);const result=S.sweep(clean,5);assert.ok(result.ok,result.message);for(const f of result.frames)assert.ok(K.analyze(clean,f.positions,f.drive).ok);near(G.distance(result.frames[0].positions[node],result.frames.at(-1).positions[node]),0);
});
