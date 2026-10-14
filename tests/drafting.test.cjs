'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
for(const name of ['geometry','model','gears','cams','drive','drafting','cases','solver','motion','view','curves','synthesis'])require('../src/'+name+'.js');
const {drafting:X,model:M,cases:C,solver:S,geometry:G,view:V,cams:T}=globalThis.JiGou;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const background=()=>({data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l0AAAAASUVORK5CYII=',name:'标定底图',pixelWidth:400,pixelHeight:200,x:10,y:-20,width:300,rotation:90,opacity:.35,visible:true});
function entities(text){const rows=text.trim().split(/\r?\n/),result=[];assert.equal(rows.length%2,0);let current=null;for(let i=0;i<rows.length;i+=2){const k=Number(rows[i]),v=rows[i+1];if(k===0){if(current)result.push(current);current={type:v,tags:[]};}else if(current)current.tags.push([k,v]);}if(current)result.push(current);return result;}
const value=(e,k)=>e.tags.find(t=>t[0]===k)?.[1];
test('两点标定遵守像素比例，旋转和中心不变，世界边界与纵横比例正确',()=>{
  const b=X.calibrate(background(),{x:50,y:100},{x:250,y:100},160);near(b.width,320);near(b.x,10);near(b.rotation,90);const points=X.backgroundPoints(b);near(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),160);near(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)),320);assert.throws(()=>X.calibrate(b,{x:0,y:0},{x:1,y:0},100));assert.throws(()=>X.calibrate(b,{x:0,y:0},{x:5,y:0},0));
});
test('动态距离与角度使用当前姿态，支持附着点，退化角度明确为未定义',()=>{
  const m=M.example('attached'),a={id:'U1',name:'距离',type:'distance',points:['A','T1'],visible:true},b={id:'U2',name:'角度',type:'angle',points:['B','A','D'],visible:true},p=S.solve(m,70).positions,pos=M.positions(m,p);near(X.measure(a,pos).value,Math.hypot(pos.A.x-pos.T1.x,pos.A.y-pos.T1.y));
  const aa=pos.B,bb=pos.A,cc=pos.D,expected=Math.acos(((aa.x-bb.x)*(cc.x-bb.x)+(aa.y-bb.y)*(cc.y-bb.y))/(Math.hypot(aa.x-bb.x,aa.y-bb.y)*Math.hypot(cc.x-bb.x,cc.y-bb.y)))*180/Math.PI;near(X.measure(b,pos).value,expected);assert.equal(X.measure(b,{A:{x:0,y:0},B:{x:0,y:0},D:{x:1,y:1}}).value,null);
});
test('绘图辅助在案例 v2 中往返保存，机构 v9、自由度与求解不受影响',()=>{
  const m=M.example('attached'),before=JSON.stringify(m),drawing=X.empty();drawing.background=background();drawing.measurements.push({id:'U1',name:'地架间距',type:'distance',points:['A','D'],visible:true});const file=C.write(m,{drawing}),r=C.read(JSON.parse(JSON.stringify(file)));assert.equal(file.case.version,2);assert.equal(file.version,9);assert.deepEqual(r.model,m);assert.deepEqual(r.presentation.drawing,drawing);assert.deepEqual(C.write(r.model,r.presentation),file);assert.equal(JSON.stringify(m),before);assert.equal(M.mobility(r.model).dof,1);assert.ok(S.sweep(r.model,4).ok);assert.equal(C.write(m).case.version,1);
});
test('拒绝外部图片、活动 SVG、错误引用和非法尺寸；删除点后清理测量',()=>{
  const m=M.example('fourbar'),d=X.empty();d.background=background();for(const patch of [{data:'https://example.com/a.png'},{data:'data:image/svg+xml;base64,PHN2Zz4='},{width:NaN},{opacity:2},{pixelWidth:5000}])assert.throws(()=>X.read({...d,background:{...d.background,...patch}},m));
  const bad={id:'U1',type:'distance',points:['A','Unknown'],visible:true};assert.throws(()=>X.read({...d,measurements:[bad]},m));const q={...bad,points:['A','B'],name:'长度'};d.measurements=[q];assert.throws(()=>C.read({...m,case:{version:1,drawing:d}}));const copy=G.clone(m);copy.nodes=copy.nodes.filter(n=>n.id!=='B');X.prune(d,copy);assert.equal(d.measurements.length,0);
});
test('DXF 使用当前世界坐标和毫米单位，不受显示缩放影响并保留杆长',()=>{
  const m=M.example('fourbar'),positions=S.solve(m,100).positions,a=X.dxf(m,{positions}),b=X.dxf(m,{positions,view:{scale:8,x:200,y:300}});assert.equal(a,b);assert.match(a,/\$INSUNITS\r\n70\r\n4/);assert.match(a,/AC1015/);const lines=entities(a).filter(e=>e.type==='LINE'&&value(e,8)==='LINKS');assert.equal(lines.length,m.links.length);lines.forEach((e,i)=>{const p={x:Number(value(e,10)),y:Number(value(e,20))},q={x:Number(value(e,11)),y:Number(value(e,21))};near(p.x,positions[m.links[i].a].x);near(G.distance(p,q),m.links[i].length);});assert.doesNotMatch(a,/NaN|Infinity/);
});
test('DXF 凸轮轮廓闭合且按实际轴角转动，齿轮输出节圆，轨迹开关生效',()=>{
  const m=M.example('camtranslate'),c=m.cams[0],pos=S.solve(m,60).positions,text=X.dxf(m,{positions:pos,showTraces:true,traces:{[c.node]:[{x:1,y:2},{x:3,y:4}]}}),all=entities(text),profile=all.find(e=>e.type==='LWPOLYLINE'&&value(e,8)==='CAM_PROFILE');assert.equal(value(profile,70),'1');assert.ok(Number(value(profile,90))>=360);const p=T.rotate(T.data(m,c).profile[0],T.angle(m,c,pos));near(Number(value(profile,10)),pos[c.center].x+p.x);near(Number(value(profile,20)),pos[c.center].y+p.y);assert.ok(all.some(e=>e.type==='LWPOLYLINE'&&value(e,8)==='TRACES'));assert.ok(!entities(X.dxf(m,{showTraces:false,traces:{[c.node]:[{x:1,y:2},{x:3,y:4}]}})).some(e=>value(e,8)==='TRACES'));
  assert.equal(entities(X.dxf(M.example('planetary'))).filter(e=>e.type==='CIRCLE'&&value(e,8)==='GEAR_PITCH').length,3);
});
test('画布与 PDF 快照包含底图和可见动态标注，不泄漏选点状态或隐藏测量',()=>{
  const m=M.example('fourbar'),d=X.empty();d.background=background();d.measurements=[{id:'U1',name:'距离',type:'distance',points:['A','B'],visible:true}];const svg=V.snapshot(m,{drawing:d,traces:{},showDimensions:true,measureDraft:['A']});assert.match(svg,/data-background=/);assert.match(svg,/data-measurement="U1"/);assert.doesNotMatch(svg,/data-measure-pick/);assert.doesNotMatch(V.snapshot(m,{drawing:d,traces:{},showDimensions:false}),/data-measurement=/);assert.equal(X.backgroundSVG({...background(),visible:false}),'');
});
