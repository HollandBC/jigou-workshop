(function(root){
  'use strict';
  const {geometry:G,model:M}=root.JiGou;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const empty=()=>({version:1,background:null,measurements:[]});
  // Image data strings are immutable; share them across undo states.
  const clone=d=>({...d,background:d.background?{...d.background}:null,measurements:d.measurements.map(m=>({...m,points:[...m.points]}))});
  function number(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(label+'超出有效范围。');return v;}
  function read(input,model){
    if(input===undefined||input===null)return empty();if(!input||input.version!==1||!Array.isArray(input.measurements)||input.measurements.length>80)throw new Error('绘图辅助数据版本或测量数量无效。');
    const result=empty(),ids=new Set(),points=new Set(M.observers(model).map(p=>p.id));
    if(input.background){const b=input.background;if(typeof b.data!=='string'||b.data.length>4000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(b.data))throw new Error('底图需要内嵌 PNG、JPEG 或 WebP 图像。');
      if(typeof b.visible!=='boolean')throw new Error('底图显示状态无效。');
      result.background={data:b.data,name:String(b.name||'底图').slice(0,80),pixelWidth:number(b.pixelWidth,1,4096,'底图像素宽度'),pixelHeight:number(b.pixelHeight,1,4096,'底图像素高度'),x:number(b.x,-1e6,1e6,'底图 X'),y:number(b.y,-1e6,1e6,'底图 Y'),width:number(b.width,.01,1e6,'底图宽度'),rotation:number(b.rotation,-360,360,'底图角度'),opacity:number(b.opacity,.05,1,'底图不透明度'),visible:b.visible};
    }
    for(const m of input.measurements){if(!m||typeof m.id!=='string'||! /^[A-Za-z0-9_-]{1,40}$/.test(m.id)||ids.has(m.id)||!['distance','angle'].includes(m.type)||!Array.isArray(m.points)||m.points.length!==(m.type==='distance'?2:3)||new Set(m.points).size!==m.points.length||m.points.some(p=>!points.has(p))||typeof m.visible!=='boolean')throw new Error('测量类型、编号或关联点无效。');ids.add(m.id);result.measurements.push({id:m.id,name:String(m.name||m.id).slice(0,60),type:m.type,points:[...m.points],visible:m.visible});}
    return result;
  }
  function prune(drawing,model){const ids=new Set(M.observers(model).map(n=>n.id));drawing.measurements=drawing.measurements.filter(m=>m.points.every(id=>ids.has(id)));return drawing;}
  function active(d){return !!d&&(!!d.background||d.measurements.length>0);}
  function measure(item,pos){
    const points=item.points.map(id=>pos[id]);if(points.some(p=>!p))return {value:null,points};
    if(item.type==='distance')return{value:G.distance(...points),points,unit:'mm'};
    const [a,o,b]=points,ax=a.x-o.x,ay=a.y-o.y,bx=b.x-o.x,by=b.y-o.y,length=Math.hypot(ax,ay)*Math.hypot(bx,by);
    return{value:length<1e-12?null:G.deg(Math.acos(G.clamp((ax*bx+ay*by)/length,-1,1))),points,unit:'°'};
  }
  function calibrate(b,a,c,length){number(length,.001,1e6,'已知距离');const pixels=G.distance(a,c);if(pixels<2)throw new Error('标定点太接近，请重新选择两个不同位置。');return {...b,width:number(length*b.pixelWidth/pixels,.01,1e6,'标定后底图宽度')};}
  function backgroundPoints(b){if(!b||!b.visible)return[];const w=b.width/2,h=w*b.pixelHeight/b.pixelWidth,t=G.rad(b.rotation);return[[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>({x:b.x+x*Math.cos(t)-y*Math.sin(t),y:b.y+x*Math.sin(t)+y*Math.cos(t)}));}
  function backgroundSVG(b){if(!b||!b.visible)return'';const h=b.width*b.pixelHeight/b.pixelWidth;return`<g data-background="true" pointer-events="none" opacity="${b.opacity}" transform="translate(${b.x} ${b.y}) rotate(${b.rotation})"><image href="${esc(b.data)}" x="${-b.width/2}" y="${-h/2}" width="${b.width}" height="${h}" transform="scale(1 -1)" preserveAspectRatio="none"/></g>`;}
  function segments(item,pos,offset=12){
    const m=measure(item,pos),p=m.points;if(p.some(q=>!q))return{...m,lines:[],label:null};
    if(item.type==='distance'){const [a,b]=p,length=G.distance(a,b)||1,n={x:-(b.y-a.y)/length,y:(b.x-a.x)/length},c={x:a.x+n.x*offset,y:a.y+n.y*offset},d={x:b.x+n.x*offset,y:b.y+n.y*offset};return{...m,lines:[[a,c],[b,d],[c,d]],label:{x:(c.x+d.x)/2,y:(c.y+d.y)/2}};}
    const [a,o,b]=p;return{...m,lines:[[o,a],[o,b]],label:{x:o.x,y:o.y+offset}};
  }
  function svg(drawing,pos,scale){if(!drawing)return'';let out='';for(const item of drawing.measurements.filter(m=>m.visible)){
    const q=segments(item,pos,(item.type==='distance'?-28:54)/scale);if(!q.label)continue;out+=`<g data-measurement="${item.id}" data-measurement-value="${q.value===null?'':q.value}" pointer-events="none">`;
    for(const [a,b] of q.lines)out+=`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="#b57925" stroke-width="${1.2/scale}" stroke-dasharray="${4/scale} ${3/scale}"/>`;
    const text=q.value===null?'未定义':q.value.toFixed(2)+' '+q.unit;out+=`<text transform="translate(${q.label.x} ${q.label.y}) scale(1 -1)" text-anchor="middle" font-size="${12/scale}" font-family="Microsoft YaHei,Segoe UI,sans-serif" fill="#9b621e" paint-order="stroke" stroke="white" stroke-width="${4/scale}">${esc(item.name)} · ${text}</text></g>`;
  }return out;}
  // R2000 entities retain world coordinates (millimetres), independently of zoom.
  function dxf(model,state={}){
    const pos=M.positions(model,state.positions),lines=[],layers=['LINKS','JOINTS','GUIDES','CAM_PROFILE','GEAR_PITCH','TRACES','MEASUREMENTS','LABELS'];let handle=0x100;
    const put=(...a)=>lines.push(...a.map(String)),num=v=>{if(!Number.isFinite(v))throw new Error('DXF 坐标无效。');return Number(v.toFixed(7));};
    const entity=(type,layer,sub)=>put(0,type,5,(handle++).toString(16).toUpperCase(),100,'AcDbEntity',8,layer,100,sub);
    const line=(a,b,layer)=>{entity('LINE',layer,'AcDbLine');put(10,num(a.x),20,num(a.y),30,0,11,num(b.x),21,num(b.y),31,0);};
    const circle=(p,r,layer)=>{entity('CIRCLE',layer,'AcDbCircle');put(10,num(p.x),20,num(p.y),30,0,40,num(r));};
    const poly=(pts,closed,layer)=>{const valid=pts.filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y));if(valid.length<2)return;entity('LWPOLYLINE',layer,'AcDbPolyline');put(90,valid.length,70,closed?1:0);for(const p of valid)put(10,num(p.x),20,num(p.y));};
    const text=(p,value,layer='LABELS')=>{entity('TEXT',layer,'AcDbText');put(10,num(p.x),20,num(p.y),30,0,40,3,1,String(value).replace(/[^\x20-\x7e]/g,'_'),50,0);};
    put(999,'JiGou Workshop 2.3 - world coordinates in mm',0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,9,'$MEASUREMENT',70,1,0,'ENDSEC',0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',5,'20',100,'AcDbSymbolTable',70,1,0,'LTYPE',5,'21',100,'AcDbSymbolTableRecord',100,'AcDbLinetypeTableRecord',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'ENDTAB',0,'TABLE',2,'LAYER',5,'22',100,'AcDbSymbolTable',70,layers.length);
    for(let i=0;i<layers.length;i++)put(0,'LAYER',5,(0x23+i).toString(16).toUpperCase(),100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,layers[i],70,0,62,[3,7,4,6,5,1,2,7][i],6,'CONTINUOUS');
    put(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'BLOCKS',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
    for(const l of model.links)line(pos[l.a],pos[l.b],'LINKS');
    for(const n of M.observers(model)){circle(pos[n.id],1.5,'JOINTS');text({x:pos[n.id].x+2,y:pos[n.id].y+2},n.id);}
    for(const a of model.attachments.filter(p=>p.arm))line(pos[a.id].anchor,pos[a.id],'LINKS');
    for(const s of model.sliders){const f=M.railPose(model,s,pos),b=M.railBounds(model,s,pos,state.railRanges);for(const d of [-3,3])line({x:f.origin.x+f.u.x*b.min+f.n.x*d,y:f.origin.y+f.u.y*b.min+f.n.y*d},{x:f.origin.x+f.u.x*b.max+f.n.x*d,y:f.origin.y+f.u.y*b.max+f.n.y*d},'GUIDES');}
    for(const g of model.gears)circle(pos[g.center],root.JiGou.gears.radius(g),'GEAR_PITCH');
    for(const c of model.cams){const o=pos[c.center],t=root.JiGou.cams.angle(model,c,pos);poly(root.JiGou.cams.data(model,c).profile.map(p=>{const q=root.JiGou.cams.rotate(p,t);return{x:o.x+q.x,y:o.y+q.y};}),true,'CAM_PROFILE');if(c.rollerRadius)circle(pos[c.node],c.rollerRadius,'CAM_PROFILE');}
    if(state.showTraces){for(const n of M.observers(model).filter(n=>n.trace))poly(state.traces?.[n.id]||[],false,'TRACES');if(model.synthesis){const t=root.JiGou.synthesis.prepare(model.synthesis.target.points,model.synthesis.settings);poly(t.points,t.closed,'TRACES');}}
    if(state.showDimensions!==false){for(const l of model.links.filter(l=>!l.rotor)){const a=pos[l.a],b=pos[l.b];text({x:(a.x+b.x)/2,y:(a.y+b.y)/2+3},l.id+' '+l.length.toFixed(3)+' mm');}
      for(const item of state.drawing?.measurements.filter(m=>m.visible)||[]){const q=segments(item,pos,item.type==='distance'?-12:12);for(const [a,b] of q.lines)line(a,b,'MEASUREMENTS');if(q.label&&q.value!==null)text(q.label,item.id+' '+q.value.toFixed(3)+(item.type==='angle'?' deg':' mm'),'MEASUREMENTS');}}
    put(0,'ENDSEC',0,'EOF');return lines.join('\r\n')+'\r\n';
  }
  const X={empty,clone,read,prune,active,measure,calibrate,backgroundPoints,backgroundSVG,svg,dxf};root.JiGou.drafting=X;if(typeof module!=='undefined')module.exports=X;
})(globalThis);
