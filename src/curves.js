(function(root){
  'use strict';
  const {geometry:G,model:M,solver:S,motion:K,view:V,drive:D}=root.JiGou;
  const metrics={...K.metadata,x:{name:'X 坐标',unit:'mm'},y:{name:'Y 坐标',unit:'mm'},vx:{name:'X 方向分速度 Vx',unit:'mm/s'},vy:{name:'Y 方向分速度 Vy',unit:'mm/s'},components:{name:'分速度 Vx / Vy',unit:'mm/s'},ax:{name:'X 加速度',unit:'mm/s²'},ay:{name:'Y 加速度',unit:'mm/s²'}};
  const axisName=axis=>axis==='x'?'X 坐标 / mm':axis==='time'?'时间 / s':'输入角度 / °';
  const normalize=a=>((a%360)+360)%360;
  function sample(model){
    if(!model.motor)return{ok:false,frames:[],message:'请先给机构设置旋转输入。'};
    const frames=[];let previous=null;
    for(const drive of D.plan(model)){
      const {angle}=drive,result=S.solve(model,angle,previous);if(!result.ok)return{ok:false,frames,angleCycle:!D.swing(model)&&!model.gears.length,message:`仅显示已求解的区间：${angle.toFixed(1)}° 处${result.message}`};
      const positions=M.positions(model,result.positions),motion=K.analyze(model,result.positions,drive);frames.push({...drive,positions,motion});previous=result.positions;
    }
    return{ok:true,frames,angleCycle:!D.swing(model)&&!model.gears.length,message:D.swing(model)?'已计算一个往返周期，每 1° 驱动相位采样。':model.gears.length?`已计算输入 ${model.motor.sampleTurns||1} 周，共 ${frames.length} 个位形；每个位形保留累计输入角度。`:'已计算一周，每 1° 一个位形。'};
  }
  function reading(point,frame,metric,reference){
    if(metric==='x'||metric==='y')return frame.positions[point.id][metric];if(!frame.motion.ok)return null;
    if(metric==='angular')return frame.motion.links[point.type==='attachments'?point.link:reference]?.omega??null;
    return(point.type==='attachments'?frame.motion.attachments[point.id]:frame.motion.nodes[point.id])?.[metric]??null;
  }
  function series(model,data,ids,metric='speed',axis='angle',references={}){
    const all=M.observers(model),points=ids.map(id=>all.find(p=>p.id===id)).filter(Boolean),result=[];
    for(const [index,point]of points.entries()){
      const reference=references[point.id]||M.referenceLinks(model,point)[0]?.id;
      const angleCycle=data.angleCycle??!D.swing(model);let frames=data.ok&&axis==='angle'&&angleCycle?data.frames.slice(0,-1):data.frames;
      for(const quantity of metric==='components'?['vx','vy']:[metric]){
        // Coordinate plots retain phase order and the closing endpoint, including both branches.
        let samples=frames.map(f=>({x:axis==='x'?reading(point,f,'x',reference):axis==='time'?f.time:data.ok&&angleCycle?normalize(f.angle):f.angle,y:reading(point,f,quantity,reference),angle:angleCycle?normalize(f.angle):f.angle,time:f.time,phase:f.phase}));
        if(axis==='angle'&&data.ok&&angleCycle){samples.sort((a,b)=>a.x-b.x);const zero=samples.find(p=>Math.abs(p.x)<1e-8);if(zero)samples.push({...zero,x:360});}
        result.push({id:metric==='components'?`${point.id}-${quantity}`:point.id,pointId:point.id,pointName:point.name,name:metric==='components'?`${point.name} · ${quantity==='vx'?'Vx':'Vy'}`:point.name,color:M.colors[index%M.colors.length],dash:metric==='components'&&quantity==='vy'?'7 4':'',metric:quantity,reference,points:samples});
      }
    }
    return result;
  }
  function layout(lines,metric,axis,fullCycle){
    const xs=lines.flatMap(l=>l.points.map(p=>p.x)).filter(Number.isFinite),ys=lines.flatMap(l=>l.points.map(p=>p.y)).filter(Number.isFinite);
    let xMin=axis==='angle'&&fullCycle?0:Math.min(0,...xs),xMax=axis==='angle'&&fullCycle?360:Math.max(1,...xs);
    if(axis==='time'&&xs.length){xMax=Math.max(...xs);if(xMax<=xMin)xMax=xMin+1;}
    if(axis==='angle'&&!fullCycle&&xs.length){xMin=Math.min(...xs);xMax=Math.max(...xs);if(xMin===xMax)xMax=xMin+1;}
    let yMin=Math.min(0,...ys),yMax=Math.max(0,...ys);if(yMax-yMin<1e-8){yMax=yMin+1;}else{const pad=(yMax-yMin)*.08;if(yMin<0)yMin-=pad;yMax+=pad;}
    const left=85,right=1070,top=35,bottom=390;
    if(axis==='x'){
      const pairs=lines.flatMap(l=>l.points).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
      const px=pairs.map(p=>p.x),py=pairs.map(p=>p.y);
      xMin=pairs.length?Math.min(...px):0;xMax=pairs.length?Math.max(...px):1;
      yMin=pairs.length?Math.min(...py):0;yMax=pairs.length?Math.max(...py):1;
      const cx=(xMin+xMax)/2,cy=(yMin+yMax)/2;
      let width=Math.max(xMax-xMin,1)*1.12,height=Math.max(yMax-yMin,1)*1.12;
      if(metric==='y'){const aspect=(right-left)/(bottom-top);if(width/height<aspect)width=height*aspect;else height=width/aspect;}
      xMin=cx-width/2;xMax=cx+width/2;yMin=cy-height/2;yMax=cy+height/2;
    }
    return{xMin,xMax,yMin,yMax,left,right,top,bottom,px:x=>left+(x-xMin)/(xMax-xMin)*(right-left),py:y=>bottom-(y-yMin)/(yMax-yMin)*(bottom-top),metric,axis};
  }
  function format(n){if(!Number.isFinite(n))return'—';if(Math.abs(n)>=1e5||Math.abs(n)>0&&Math.abs(n)<.001)return n.toExponential(2);return Number(n.toFixed(3)).toString();}
  function ticks(min,max){
    const target=(max-min)/6,unit=10**Math.floor(Math.log10(target)),step=[1,2,5,10].reduce((a,b)=>Math.abs(a*unit-target)<Math.abs(b*unit-target)?a:b)*unit,result=[];
    for(let i=Math.ceil(min/step-1e-9);i<=Math.floor(max/step+1e-9);i++)result.push(Number((i*step).toPrecision(12)));
    return result;
  }
  function svg(lines,metric,axis,fullCycle){
    const a=layout(lines,metric,axis,fullCycle),meta=metrics[metric],text=(x,y,value,anchor='middle')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" fill="#667f9e" font-size="12" font-family="Microsoft YaHei,Segoe UI,sans-serif">${V.esc(value)}</text>`;
    let result='<rect width="1100" height="450" fill="white"/>';
    for(const value of axis==='angle'&&fullCycle?[0,60,120,180,240,300,360]:ticks(a.xMin,a.xMax)){const x=a.px(value);result+=`<path d="M ${x} ${a.top} V ${a.bottom}" stroke="#e9eef5"/>`+text(x,a.bottom+24,format(value));}
    for(const value of ticks(a.yMin,a.yMax)){const y=a.py(value);result+=`<path d="M ${a.left} ${y} H ${a.right}" stroke="#e9eef5"/>`+text(a.left-12,y+4,format(value),'end');}
    if(axis==='x'&&a.xMin<0&&a.xMax>0)result+=`<path d="M ${a.px(0)} ${a.top} V ${a.bottom}" stroke="#bccada" stroke-dasharray="5 4"/>`;
    if(a.yMin<0&&a.yMax>0)result+=`<path d="M ${a.left} ${a.py(0)} H ${a.right}" stroke="#bccada" stroke-dasharray="5 4"/>`;
    result+=`<path d="M ${a.left} ${a.top} V ${a.bottom} H ${a.right}" fill="none" stroke="#8ca0b9"/>`+text((a.left+a.right)/2,440,axisName(axis))+text(a.left,18,`${meta.name} / ${meta.unit}`,'start');
    for(const line of lines){let path='',connected=false;for(const p of line.points){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){connected=false;continue;}path+=`${connected?'L':'M'} ${a.px(p.x).toFixed(3)} ${a.py(p.y).toFixed(3)} `;connected=true;}result+=`<path data-curve="${line.id}" d="${path}" fill="none" stroke="${line.color}" ${line.dash?`stroke-dasharray="${line.dash}"`:''} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;}
    if(!lines.some(l=>l.points.some(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))))result+=text(550,210,'请选择节点并计算曲线');
    return result;
  }
  function csv(lines,metric,axis){
    const quote=s=>'"'+String(s).replace(/"/g,'""')+'"',base=lines[0]?.points||[],meta=metrics[metric];
    if(axis==='x'){
      const groups=[];for(const line of lines){let group=groups.find(g=>g.id===(line.pointId||line.id));if(!group){group={id:line.pointId||line.id,name:line.pointName||line.name,lines:[]};groups.push(group);}group.lines.push(line);}
      const header=['输入角度_deg','驱动相位_deg','时间_s',...groups.flatMap(g=>[`${g.name}_X_mm`,...g.lines.map(l=>`${g.name}_${(l.metric||metric)==='y'?'Y_mm':metrics[l.metric||metric].name+'_'+metrics[l.metric||metric].unit}`)])].map(quote).join(',');
      const cell=n=>Number.isFinite(n)?n.toFixed(6):'';
      return'\uFEFF'+[header,...base.map((p,i)=>[cell(p.angle),cell(p.phase),cell(p.time),...groups.flatMap(g=>[cell(g.lines[0].points[i]?.x),...g.lines.map(l=>cell(l.points[i]?.y))])].join(','))].join('\r\n');
    }
    const header=[axis==='time'?'时间_s':'输入角度_deg',...lines.map(l=>{const m=metrics[l.metric||metric]||meta;return`${l.pointName||l.name}_${m.name}_${m.unit}`;})].map(quote).join(',');
    return'\uFEFF'+[header,...base.map((p,i)=>[Number.isFinite(p.x)?p.x.toFixed(6):'',...lines.map(l=>Number.isFinite(l.points[i]?.y)?l.points[i].y.toFixed(6):'')].join(','))].join('\r\n');
  }
  const Q={sample,series,layout,svg,csv,metrics,format,axisName};root.JiGou.curves=Q;if(typeof module!=='undefined')module.exports=Q;
})(globalThis);
