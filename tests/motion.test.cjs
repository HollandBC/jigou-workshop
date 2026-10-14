'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../src/geometry.js'),M=require('../src/model.js'),S=require('../src/solver.js'),K=require('../src/motion.js');
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('滑块加速度逐度符合独立二阶解析导数',()=>{
  const m=M.example('slider'),omega=m.motor.rpm*2*Math.PI/60;
  for(let angle=0;angle<360;angle++){
    const r=S.solve(m,angle),k=K.analyze(m,r.positions);assert.equal(k.ok,true,k.message);
    const a=G.rad(angle),s=Math.sin(a),c=Math.cos(a),q=Math.sqrt(155**2-45**2*s*s);
    const derivative=-45*c-45**2*(c*c-s*s)/q-45**4*s*s*c*c/q**3;
    close(k.nodes.C.ax,derivative*omega**2,1e-6);close(k.nodes.C.ay,0);close(k.nodes.B.acceleration,45*omega**2);
    close(k.links.L1.omega,omega);close(k.links.L1.alpha,0);
  }
});
test('刚性杆上点、垂直和斜向伸出端遵守独立圆周运动公式',()=>{
  const m=M.empty();m.nodes=[{id:'A',name:'A',x:0,y:0,fixed:true},{id:'B',name:'B',x:45,y:0}];m.links=[{id:'L1',name:'曲柄',a:'A',b:'B',length:45}];m.motor={link:'L1',pivot:'A',initialAngle:0,rpm:12};
  m.attachments=[{id:'T1',link:'L1',t:.5,along:0,normal:0,arm:false,trace:true},{id:'T2',link:'L1',t:.5,along:0,normal:50,arm:true,trace:true},{id:'T3',link:'L1',t:.5,along:35,normal:-35,arm:true,trace:true}];
  const valid=M.validate(m),omega=valid.motor.rpm*2*Math.PI/60;
  for(let angle=0;angle<=360;angle+=3){const r=S.solve(valid,angle),pos=M.positions(valid,r.positions),k=K.analyze(valid,r.positions);assert.equal(k.ok,true,k.message);
    for(const p of valid.attachments){const a=G.rad(angle),rx=45*p.t+p.along,ry=p.normal,x=rx*Math.cos(a)-ry*Math.sin(a),y=rx*Math.sin(a)+ry*Math.cos(a),v=k.attachments[p.id];close(pos[p.id].x,x);close(pos[p.id].y,y);close(v.vx,-omega*y);close(v.vy,omega*x);close(v.ax,-omega*omega*x);close(v.ay,-omega*omega*y);close(v.omega,omega);}
  }
});
test('多杆的节点和附着点加速度、杆角速度与独立中心差分一致',()=>{
  for(const kind of ['fourbar','multi','attached']){
    const m=M.example(kind),angle=57,h=.0005,r=S.solve(m,angle),left=S.solve(m,angle-h,r.positions),right=S.solve(m,angle+h,r.positions),k=K.analyze(m,r.positions),kl=K.analyze(m,left.positions),kr=K.analyze(m,right.positions),dt=2*h/(m.motor.rpm*6);
    assert.ok(k.ok&&kl.ok&&kr.ok);
    for(const p of M.observers(m)){const group=p.type==='attachments'?'attachments':'nodes',v=k[group][p.id],l=kl[group][p.id],q=kr[group][p.id];close(v.ax,(q.vx-l.vx)/dt,1e-4);close(v.ay,(q.vy-l.vy)/dt,1e-4);}
    for(const l of m.links){const angleOf=pos=>Math.atan2(pos[l.b].y-pos[l.a].y,pos[l.b].x-pos[l.a].x),delta=angleOf(right.positions)-angleOf(left.positions);close(k.links[l.id].omega,Math.atan2(Math.sin(delta),Math.cos(delta))/dt,1e-6);close(k.links[l.id].alpha,(kr.links[l.id].omega-kl.links[l.id].omega)/dt,1e-5);}
  }
});
test('加速度按转速平方缩放，反转保持同位形加速度',()=>{
  const m=M.example('attached'),r=S.solve(m,70),original=K.analyze(m,r.positions);
  for(const rpm of [24,-12,0]){m.motor.rpm=rpm;const k=K.analyze(m,r.positions);assert.equal(k.ok,true,k.message);for(const p of M.observers(m)){const group=p.type==='attachments'?'attachments':'nodes',a=k[group][p.id],b=original[group][p.id];close(a.ax,b.ax*(rpm/12)**2);close(a.ay,b.ay*(rpm/12)**2);}}
});
test('附着点整周回到原位，保持局部坐标且不增加自由度',()=>{
  const m=M.example('attached'),baseline=M.example('fourbar'),sweep=S.sweep(m);assert.equal(sweep.ok,true);
  assert.deepEqual(S.analyze(m),S.analyze(baseline));assert.equal(M.mobility(m).dof,1);assert.equal(M.mobility(m).n,3);
  for(const f of sweep.frames)for(const p of m.attachments){const pose=M.attachmentPose(m,p,f.positions),frame=M.frame(m,p.link,f.positions),dx=pose.x-pose.anchor.x,dy=pose.y-pose.anchor.y;close(dx*frame.u.x+dy*frame.u.y,p.along);close(dx*frame.n.x+dy*frame.n.y,p.normal);}
  const first=M.positions(m,sweep.frames[0].positions),last=M.positions(m,sweep.frames.at(-1).positions);for(const p of m.attachments)close(G.distance(first[p.id],last[p.id]),0);
});
test('旧 v1 文件迁移保留机构，v4 往返保留全部附着结构',()=>{
  const legacy=G.clone(M.example('fourbar'));legacy.version=1;delete legacy.attachments;
  const upgraded=M.validate(legacy);assert.equal(upgraded.version,9);assert.deepEqual(upgraded.attachments,[]);assert.deepEqual(upgraded.nodes,legacy.nodes);assert.deepEqual(upgraded.motor,legacy.motor);
  const m=M.example('attached');assert.deepEqual(M.validate(JSON.parse(JSON.stringify(m))),m);
});
test('附着结构导入拒绝错误引用、越界位置、节点 ID 冲突和零长分支',()=>{
  for(const update of [p=>p.link='Missing',p=>p.t=1.1,p=>p.id='A',p=>{p.arm=true;p.along=0;p.normal=0;},p=>{p.arm=true;p.along=800000;p.normal=800000;},p=>p.normal=Infinity]){const m=M.example('attached');update(m.attachments[0]);assert.throws(()=>M.validate(m));}
  const m=M.example('attached');m.version=10;assert.throws(()=>M.validate(m));
});
test('运动学分析不修改模型和坐标；切换量与角速度参考杆使用已记录数据',()=>{
  const m=M.example('attached'),r=S.solve(m,40),before=JSON.stringify(m),pose=JSON.stringify(r.positions),k=K.analyze(m,r.positions),pos=M.positions(m,r.positions);
  assert.equal(JSON.stringify(m),before);assert.equal(JSON.stringify(r.positions),pose);
  const p=M.observers(m).find(p=>p.id==='T2'),sample=K.sample(m,p,k,pos,40);close(K.value({metric:'speed'},p,sample),k.attachments.T2.speed);close(K.value({metric:'acceleration'},p,sample),k.attachments.T2.acceleration);close(K.value({metric:'angular'},p,sample),k.links.L2.omega);
  const joint=M.observers(m).find(p=>p.id==='C'),s=K.sample(m,joint,k,pos,40);close(K.value({metric:'angular',angularReferences:{C:'L2'}},joint,s),k.links.L2.omega);close(K.value({metric:'angular',angularReferences:{C:'L3'}},joint,s),k.links.L3.omega);
});
test('奇异或未闭合位形不输出伪加速度',()=>{
  const m=M.example('fourbar');m.links[1].length=70;m.links[2].length=45;assert.equal(K.analyze(m,{A:{x:0,y:0},B:{x:45,y:0},C:{x:115,y:0},D:{x:160,y:0}}).ok,false);
});
