(function(root){
  'use strict';
  const {geometry:G,model:M}=root.JiGou;
  const S=()=>root.JiGou.solver||(typeof require==='function'?require('./solver.js'):null);
  const TAU=2*Math.PI,clamp=G.clamp;
  const qualities={quick:{population:40,generations:90,samples:32},balanced:{population:64,generations:220,samples:48},thorough:{population:90,generations:480,samples:64}};
  const families={fourbar:'四杆机构',slider:'曲柄滑块',fivebar:'齿轮联动五杆',planetary:'行星齿轮轨迹机构'};
  const dimensions={fourbar:5,slider:4,fivebar:8,planetary:3};
  const gearPairs={fivebar:[[20,20],[40,20],[20,40],[60,20],[20,60]],planetary:[[24,12],[36,12],[48,12],[60,12],[30,12],[24,16],[24,18]]};
  function gearSpec(type,p){const pairs=gearPairs[type];if(!pairs)return null;const index=clamp(Math.round(p[type==='fivebar'?7:2]),0,pairs.length-1),[a,b]=pairs[index];let x=a,y=b;while(y){const r=x%y;x=y;y=r;}return{a,b,index,ratio:type==='fivebar'?-a/b:1-a/b,turns:b/x};}
  const cycle=(type,p)=>gearSpec(type,p)?.turns||1;
  function sizeLabels(type){return type==='fourbar'?'机架 / 曲柄 / 连杆 / 摇杆':type==='fivebar'?'机架 / 主动曲柄 / 联动曲柄 / 轨迹连杆 / 闭合连杆':type==='planetary'?'行星架 / 偏心杆':'曲柄 / 连杆';}
  function gearSummary(fit){const g=fit.gear;return g?`${fit.type==='fivebar'?'主动 / 联动':'齿圈 / 行星'}齿数 ${g.a} / ${g.b} · ${fit.closed===false?'一次往返 / 周期':`${fit.turns} 输入圈 / 周期`}`:'';}
  function cleanPoints(input){
    if(!Array.isArray(input)||input.length<2||input.length>1200)throw new Error('目标轨迹需要 2～1200 个点。');
    const points=[];for(const p of input){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e5||Math.abs(p.y)>1e5)throw new Error('轨迹坐标无效，单位应为 mm。');const q={x:p.x,y:p.y};if(!points.length||G.distance(points.at(-1),q)>1e-7)points.push(q);}
    if(points.length<2)throw new Error('轨迹不能只有一个位置。');return points;
  }
  function bounds(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};}
  function resample(points,count,closed=false,offset=0){
    let pts=points.slice(),endTheta;if(closed&&G.distance(pts[0],pts.at(-1))<1e-7){endTheta=pts.at(-1).theta;pts=pts.slice(0,-1);}
    if(closed)pts.push({...pts[0],...(Number.isFinite(pts[0].theta)?{theta:Number.isFinite(endTheta)?endTheta:pts[0].theta+TAU}:{} )});
    const lengths=[0];for(let i=1;i<pts.length;i++)lengths.push(lengths.at(-1)+G.distance(pts[i-1],pts[i]));const total=lengths.at(-1);if(total<1e-6)throw new Error('轨迹长度太小。');
    const out=[];for(let i=0;i<count;i++){const fraction=closed?((i/count+offset)%1+1)%1:i/(count-1),distance=fraction*total;let low=0,high=lengths.length-1;while(high-low>1){const mid=(low+high)>>1;if(lengths[mid]<=distance)low=mid;else high=mid;}const a=pts[low],b=pts[Math.min(low+1,pts.length-1)],t=(distance-lengths[low])/Math.max(1e-12,lengths[low+1]-lengths[low]);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,...(Number.isFinite(a.theta)&&Number.isFinite(b.theta)?{theta:a.theta+(b.theta-a.theta)*t}:{})});}return out;
  }
  function prepare(input,options={}){
    const raw=cleanPoints(input),closed=options.closed!==false,count=clamp(Math.round(options.samples||48),16,96),passes=clamp(Math.round(options.smoothing||0),0,5);let points=raw;
    if(closed&&G.distance(points[0],points.at(-1))<1e-7)points=points.slice(0,-1);
    points=resample(points,Math.max(count,Math.min(240,points.length)),closed);
    for(let k=0;k<passes;k++)points=points.map((p,i)=>{if(!closed&&(i===0||i===points.length-1))return p;const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return{x:(a.x+2*p.x+b.x)/4,y:(a.y+2*p.y+b.y)/4};});
    const b=bounds(points),span=Math.hypot(b.maxX-b.minX,b.maxY-b.minY);if(span<.1)throw new Error('目标轨迹尺寸至少为 0.1 mm。');
    return{raw,points:resample(points,count,closed),closed,count,span,bounds:b,smoothing:passes};
  }
  function options(input={}){
    const o={family:'auto',quality:'balanced',minLength:2,maxLength:800,tolerance:2,allowReverse:true,closed:true,smoothing:0,...input};
    if(!['auto',...Object.keys(families)].includes(o.family)||!Object.hasOwn(qualities,o.quality))throw new Error('求解类型或搜索精度无效。');
    for(const key of ['minLength','maxLength','tolerance'])if(!Number.isFinite(o[key]))throw new Error('杆长与误差需要有效数字。');
    if(o.minLength<.1||o.maxLength<=o.minLength||o.maxLength>1e5||o.tolerance<=0||o.tolerance>1e4)throw new Error('请检查杆长范围与目标 RMS 误差。');
    if(typeof o.closed!=='boolean'||typeof o.allowReverse!=='boolean'||!Number.isInteger(o.smoothing)||o.smoothing<0||o.smoothing>5)throw new Error('轨迹闭合、方向或平滑设置无效。');
    if(o.anchors){let p;try{p=cleanPoints(o.anchors);}catch{throw new Error('固定支点间距或坐标无效，请设置两个不同的位置。');}if(p.length!==2||G.distance(...p)<o.minLength||G.distance(...p)>o.maxLength)throw new Error('固定支点间距需要位于杆长范围内。');o.anchors=p;if(['slider','planetary'].includes(o.family))throw new Error('锁定两支点适用于四杆或齿轮联动五杆，请切换类型或自动比较。');}
    return o;
  }
  function pose(type,p,theta,branch=1){
    if(type==='planetary'){const g=gearSpec(type,p),P={x:Math.cos(theta),y:Math.sin(theta)},beta=p[1]+g.ratio*theta,B={x:P.x+p[0]*Math.cos(beta),y:P.y+p[0]*Math.sin(beta)};return{O:{x:0,y:0},P,B,T:B,R:{x:g.a/(g.a-g.b),y:0}};}
    if(type==='fivebar'){const g=gearSpec(type,p),A={x:p[0]*Math.cos(theta),y:p[0]*Math.sin(theta)},phi=p[6]+g.ratio*theta,D={x:1,y:0},E={x:1+p[1]*Math.cos(phi),y:p[1]*Math.sin(phi)},dx=E.x-A.x,dy=E.y-A.y,d=Math.hypot(dx,dy);if(d<1e-8)return null;const a=(p[2]**2-p[3]**2+d*d)/(2*d),h2=p[2]**2-a*a;if(h2<1e-8)return null;const h=branch*Math.sqrt(h2),B={x:A.x+a*dx/d-h*dy/d,y:A.y+a*dy/d+h*dx/d},ux=(B.x-A.x)/p[2],uy=(B.y-A.y)/p[2],T={x:A.x+p[4]*(B.x-A.x)-p[5]*uy,y:A.y+p[4]*(B.y-A.y)+p[5]*ux};return{O:{x:0,y:0},A,B,D,E,T};}
    const r=type==='fourbar'?p[0]:1,A={x:r*Math.cos(theta),y:r*Math.sin(theta)};let B,D;
    if(type==='fourbar'){
      D={x:1,y:0};const l=p[1],s=p[2],dx=1-A.x,dy=-A.y,d=Math.hypot(dx,dy);if(d<1e-8)return null;const a=(l*l-s*s+d*d)/(2*d),h2=l*l-a*a;if(h2<1e-8)return null;const h=branch*Math.sqrt(h2);B={x:A.x+a*dx/d-h*dy/d,y:A.y+a*dy/d+h*dx/d};
    }else{const l=p[0],e=p[1],h2=l*l-(e-A.y)**2;if(h2<1e-8)return null;B={x:A.x+branch*Math.sqrt(h2),y:e};}
    const dx=B.x-A.x,dy=B.y-A.y,l=Math.hypot(dx,dy),t=type==='fourbar'?p[3]:p[2],off=type==='fourbar'?p[4]:p[3],T={x:A.x+t*dx-off*dy/l,y:A.y+t*dy+off*dx/l};return{O:{x:0,y:0},A,B,D,T};
  }
  function profile(type,p,closed,branch=1,count=120){
    const index=dimensions[type],start=closed?0:p[index],span=closed?TAU*cycle(type,p):p[index+1];
    if(closed){if(type==='fourbar'){if(Math.abs(1-p[0])<=Math.abs(p[1]-p[2])+.002||1+p[0]>=p[1]+p[2]-.002)return null;}else if(type==='slider'&&p[0]<=1+Math.abs(p[1])+.002)return null;}
    const out=[];for(let i=0;i<=count;i++){const theta=start+span*i/count,q=pose(type,p,theta,branch);if(!q)return null;out.push({...q.T,theta});}return out;
  }
  function transform(p,t){return{x:t.x+t.a*p.x-t.b*p.y,y:t.y+t.b*p.x+t.a*p.y,...(Number.isFinite(p.theta)?{theta:p.theta}:{})};}
  function align(curve,target,shift=0,reverse=false,anchors=null){
    const n=target.length,selected=target.map((_,i)=>curve[((reverse?shift-i:shift+i)%n+n)%n]);
    let t;if(anchors){const [a,b]=anchors;t={x:a.x,y:a.y,a:b.x-a.x,b:b.y-a.y};}
    else{let cx=0,cy=0,tx=0,ty=0;for(let i=0;i<n;i++){cx+=selected[i].x;cy+=selected[i].y;tx+=target[i].x;ty+=target[i].y;}cx/=n;cy/=n;tx/=n;ty/=n;let u=0,v=0,den=0;for(let i=0;i<n;i++){const x=selected[i].x-cx,y=selected[i].y-cy,X=target[i].x-tx,Y=target[i].y-ty;u+=x*X+y*Y;v+=x*Y-y*X;den+=x*x+y*y;}if(den<1e-12)return null;const a=u/den,b=v/den;t={a,b,x:tx-a*cx+b*cy,y:ty-b*cx-a*cy};}
    let sum=0,max=0;const fitted=[];for(let i=0;i<n;i++){const p=transform(selected[i],t),d=G.distance(p,target[i]);sum+=d*d;max=Math.max(max,d);fitted.push(p);}return{rms:Math.sqrt(sum/n),max,transform:t,scale:Math.hypot(t.a,t.b),fitted,shift,reverse};
  }
  function evaluate(type,p,target,opts,branch=1,detail=false){
    const dense=profile(type,p,target.closed,branch,detail?360:96);if(!dense)return null;
    const curve=resample(dense,target.count,target.closed);let best=null;
    for(const reverse of opts.allowReverse?[false,true]:[false])for(let shift=0;shift<(target.closed?target.count:1);shift++){
      const fit=align(curve,target.points,target.closed?shift:reverse?target.count-1:0,reverse,opts.anchors);if(!fit)continue;
      const lengths=(type==='fourbar'?[1,p[0],p[1],p[2]]:type==='fivebar'?[1,p[0],p[1],p[2],p[3]]:[1,p[0]]).map(x=>x*fit.scale);if(lengths.some(x=>x<opts.minLength||x>opts.maxLength))continue;
      const gear=gearSpec(type,p);if(gear){const module=2*fit.scale/(type==='fivebar'?gear.a+gear.b:gear.a-gear.b);if(module<.1||module>100)continue;}
      if(!best||fit.rms<best.rms)best={...fit,type,parameters:p.slice(),branch,lengths,score:fit.rms/target.span};
    }
    if(best&&detail){best.curve=dense.map(p=>transform(p,best.transform));best.target=target.points;best.closed=target.closed;best.gear=gearSpec(type,p);best.turns=target.closed?cycle(type,p):1;best.fitted=best.fitted.map(q=>({...transform(pose(type,p,q.theta,branch).T,best.transform),theta:q.theta}));best.errors=best.fitted.map((p,i)=>G.distance(p,target.points[i]));best.rms=Math.sqrt(best.errors.reduce((s,e)=>s+e*e,0)/best.errors.length);best.max=Math.max(...best.errors);best.score=best.rms/target.span;}
    return best;
  }
  function parameterBounds(type,closed){const ranges=type==='fourbar'?[[.08,1.65],[.18,3.6],[.18,3.6],[-1.5,2.5],[-2,2]]:type==='slider'?[[1.05,5],[-2,2],[-1.5,2.5],[-2,2]]:type==='fivebar'?[[.08,.95],[.08,.95],[.5,3.6],[.5,3.6],[-1.5,2.5],[-2,2],[-Math.PI,Math.PI],[0,4]]:[[.08,2.5],[-Math.PI,Math.PI],[0,6]];if(!closed)ranges.push([-Math.PI,Math.PI],[G.rad(20),G.rad(300)]);return ranges;}
  function seeds(type,closed){const values=type==='fourbar'?[[.35,1.2,.8,.5,0],[.3,1.1,.9,.8,.4],[.5,1.5,1.1,.5,-.4],[.4,1.2,1.2,1.3,.6],[1.35,1.5,1.5,.5,0],[.18,.9,.9,.5,.7]]:type==='slider'?[[2.5,0,.5,0],[4,0,.5,.8],[2.8,.5,.25,-.3],[2,0,1,0],[3.5,0,0,0]]:type==='fivebar'?[[.25,.3,1.25,1.15,.7,.15,.4,0],[.35,.2,1.4,1.2,1,0,0,1],[.3,.3,1.3,1.3,.6,.3,1,2],[.15,.25,1.1,1.2,.8,-.2,-1,3],[.2,.15,1.15,1.25,.5,.1,.8,4]]:gearPairs.planetary.flatMap((_,i)=>[[.5,0,i],[1,0,i],[.3,.5,i]]);return values.map(p=>closed?p:[...p,G.rad(20),Math.PI]);}
  function random(seed){let x=(seed>>>0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
  function abort(signal){if(signal?.aborted){const e=new Error('求解已取消');e.name='AbortError';throw e;}}
  function infer(model,pointId){
    if(!model.motor?.pivot||model.cams.length||model.bodies.length)return null;
    if(model.gears.length)return inferGeared(model,pointId);
    const motor=model.links.find(l=>l.id===model.motor.link),O=model.nodes.find(n=>n.id===model.motor.pivot),A=model.nodes.find(n=>n.id===(motor.a===O.id?motor.b:motor.a)),coupler=model.links.find(l=>l.id!==motor.id&&[l.a,l.b].includes(A.id));if(!coupler)return null;
    const B=model.nodes.find(n=>n.id===(coupler.a===A.id?coupler.b:coupler.a)),rocker=model.links.find(l=>l.id!==coupler.id&&l.id!==motor.id&&[l.a,l.b].includes(B.id)),slider=model.sliders.find(s=>s.node===B.id&&!s.guide),point=M.observers(model).find(n=>n.id===pointId);let type,scale,alpha,D;
    if(rocker){D=model.nodes.find(n=>n.id===(rocker.a===B.id?rocker.b:rocker.a));if(!D?.fixed)return null;type='fourbar';scale=G.distance(O,D);alpha=Math.atan2(D.y-O.y,D.x-O.x);}
    else if(slider){type='slider';scale=motor.length;alpha=G.rad(slider.angle);}else return null;
    if(!point||scale<.1)return null;const world=M.positions(model),P=world[pointId],dx=B.x-A.x,dy=B.y-A.y,L=G.distance(A,B),t=((P.x-A.x)*dx+(P.y-A.y)*dy)/L**2,off=((P.y-A.y)*dx-(P.x-A.x)*dy)/L/scale;
    if(point.type==='attachments'&&point.link!==coupler.id||point.type==='nodes'&&![A.id,B.id].includes(pointId))return null;
    const theta=Math.atan2(A.y-O.y,A.x-O.x)-alpha;let params,branch;
    if(type==='fourbar'){params=[motor.length/scale,L/scale,rocker.length/scale,t,off];const cross=(D.x-A.x)*(B.y-A.y)-(D.y-A.y)*(B.x-A.x);branch=cross>=0?1:-1;}
    else{const n={x:-Math.sin(alpha),y:Math.cos(alpha)},e=((B.x-O.x)*n.x+(B.y-O.y)*n.y)/scale;params=[L/scale,e,t,off];branch=((B.x-A.x)*Math.cos(alpha)+(B.y-A.y)*Math.sin(alpha))>=0?1:-1;}
    if(model.motor.mode==='swing')params.push(G.rad(model.motor.minAngle)-alpha,G.rad(model.motor.maxAngle-model.motor.minAngle));
    return{type,parameters:params,branch,transform:{x:O.x,y:O.y,a:scale*Math.cos(alpha),b:scale*Math.sin(alpha)},theta};
  }
  function inferGeared(model,pointId){
    const nodes=Object.fromEntries(model.nodes.map(n=>[n.id,n])),point=M.positions(model)[pointId];if(!point||model.motor.link!=='L1'||!nodes.O)return null;
    let type,scale,alpha,theta,p,branch=1;
    if(model.meshes.length===1&&model.meshes[0].type==='external'&&['A','B','D','E'].every(id=>nodes[id])&&nodes.O.fixed&&nodes.D.fixed){
      type='fivebar';scale=G.distance(nodes.O,nodes.D);alpha=Math.atan2(nodes.D.y-nodes.O.y,nodes.D.x-nodes.O.x);theta=Math.atan2(nodes.A.y-nodes.O.y,nodes.A.x-nodes.O.x)-alpha;
      const a=model.gears.find(g=>g.link==='L1'),b=model.gears.find(g=>g.link==='L3'),index=gearPairs.fivebar.findIndex(pair=>a&&b&&Math.abs(pair[0]/pair[1]-a.teeth/b.teeth)<1e-8);if(index<0)return null;
      const dx=nodes.B.x-nodes.A.x,dy=nodes.B.y-nodes.A.y,L=Math.hypot(dx,dy),t=((point.x-nodes.A.x)*dx+(point.y-nodes.A.y)*dy)/(L*L),off=((point.y-nodes.A.y)*dx-(point.x-nodes.A.x)*dy)/L/scale,beta=Math.atan2(nodes.E.y-nodes.D.y,nodes.E.x-nodes.D.x)-alpha+a.teeth/b.teeth*theta;
      p=[G.distance(nodes.O,nodes.A)/scale,G.distance(nodes.D,nodes.E)/scale,L/scale,G.distance(nodes.E,nodes.B)/scale,t,off,Math.atan2(Math.sin(beta),Math.cos(beta)),index];branch=(nodes.E.x-nodes.A.x)*dy-(nodes.E.y-nodes.A.y)*dx>=0?1:-1;
    }else if(model.meshes.length===1&&model.meshes[0].type==='internal'&&model.meshes[0].carrier==='L1'&&['P','B','R'].every(id=>nodes[id])){
      type='planetary';const a=model.gears.find(g=>g.kind==='ring'),b=model.gears.find(g=>g.kind==='spur'),index=gearPairs.planetary.findIndex(pair=>a&&b&&Math.abs(pair[0]/pair[1]-a.teeth/b.teeth)<1e-8);if(index<0)return null;scale=G.distance(nodes.O,nodes.P);alpha=Math.atan2(nodes.R.y-nodes.O.y,nodes.R.x-nodes.O.x);theta=Math.atan2(nodes.P.y-nodes.O.y,nodes.P.x-nodes.O.x)-alpha;
      const beta=Math.atan2(point.y-nodes.P.y,point.x-nodes.P.x)-alpha-(1-a.teeth/b.teeth)*theta;p=[G.distance(nodes.P,point)/scale,Math.atan2(Math.sin(beta),Math.cos(beta)),index];
    }else return null;
    if(!Number.isFinite(scale)||scale<.1)return null;if(model.motor.mode==='swing')p.push(G.rad(model.motor.minAngle)-alpha,G.rad(model.motor.maxAngle-model.motor.minAngle));return{type,parameters:p,branch,transform:{x:nodes.O.x,y:nodes.O.y,a:scale*Math.cos(alpha),b:scale*Math.sin(alpha)},theta};
  }
  function buildGeared(fit,target){
    const p=fit.parameters,type=fit.type,t=fit.transform,alpha=Math.atan2(t.b,t.a),index=dimensions[type],start=target.closed?fit.fitted[0].theta:p[index],span=target.closed?TAU*cycle(type,p):p[index+1],theta=target.closed?start:fit.reverse?start+span:start,q=pose(type,p,theta,fit.branch),m=M.empty(),g=gearSpec(type,p);
    if(!q)throw new Error('候选初始位形无法闭合。');m.name='轨迹合成 · '+families[type];
    const node=(id,fixed=false)=>{const n=transform(q[id],t);m.nodes.push({id,name:id,x:n.x,y:n.y,fixed,trace:false});};
    const link=(id,a,b,name,color)=>m.links.push({id,a,b,name,length:G.distance(m.nodes.find(n=>n.id===a),m.nodes.find(n=>n.id===b)),color});
    const gear=(id,center,link,kind,teeth,module,color,name)=>m.gears.push({id,center,link,kind,teeth,module,color,name});
    if(type==='fivebar'){
      for(const id of ['O','A','B','D','E'])node(id,['O','D'].includes(id));link('L1','O','A','主动曲柄','#3877e8');link('L2','A','B','轨迹连杆','#14a59b');link('L3','D','E','齿轮联动曲柄','#9b70d5');link('L4','E','B','闭合连杆','#e59633');
      const module=2*fit.scale/(g.a+g.b);gear('G1','O','L1','spur',g.a,module,'#3877e8','主动齿轮');gear('G2','D','L3','spur',g.b,module,'#9b70d5','联动齿轮');m.meshes.push({id:'H1',name:'五杆同步外啮合',a:'G1',b:'G2',type:'external'});
      let t0=clamp(p[4],0,1),along=(p[4]-t0)*m.links[1].length,normal=p[5]*fit.scale;if(Math.hypot(along,normal)>1e-12&&Math.hypot(along,normal)<.1){t0=p[4]<.5?1:0;along=(p[4]-t0)*m.links[1].length;}const arm=Math.hypot(along,normal)>=.1;m.attachments.push({id:'T1',name:'合成轨迹点 P',link:'L2',t:t0,along:arm?along:0,normal:arm?normal:0,arm,trace:true});
    }else{
      for(const id of ['O','P','B','R'])node(id,['O','R'].includes(id));link('L1','O','P','输入行星架','#3877e8');link('L2','P','B','行星轮偏心杆','#14a59b');link('L0','O','R','固定齿圈参考方向','#a8b8cd');m.links.find(l=>l.id==='L0').rotor=true;
      const module=2*fit.scale/(g.a-g.b);gear('G0','O','L0','ring',g.a,module,'#9b70d5','固定内齿圈');gear('G1','P','L2','spur',g.b,module,'#3877e8','行星轮');m.meshes.push({id:'H1',name:'行星轮内啮合',a:'G0',b:'G1',type:'internal',carrier:'L1'});m.attachments.push({id:'T1',name:'行星偏心轨迹点 P',link:'L2',t:1,along:0,normal:0,arm:false,trace:true});
    }
    m.motor={link:'L1',pivot:'O',initialAngle:G.deg(alpha+theta),rpm:target.closed&&fit.reverse?-12:12,...(target.closed?{sampleTurns:g.turns}:{mode:'swing',minAngle:G.deg(alpha+start),maxAngle:G.deg(alpha+start+span),initialPhase:fit.reverse?90:-90})};return M.validate(m);
  }
  function build(fit,target,opts){
    if(gearPairs[fit.type])return buildGeared(fit,target);
    const p=fit.parameters,type=fit.type,t=fit.transform,alpha=Math.atan2(t.b,t.a),closed=target.closed,start=closed?fit.fitted[0].theta:p[type==='fourbar'?5:4],span=closed?TAU:p[type==='fourbar'?6:5],theta=closed?start:fit.reverse?start+span:start,q=pose(type,p,theta,fit.branch),m=M.empty();
    if(!q)throw new Error('候选初始位形无法闭合。');m.name='轨迹合成 · '+families[type];
    for(const id of ['O','A','B',...(type==='fourbar'?['D']:[])]){const a=transform(q[id],t);m.nodes.push({id,name:({O:'输入支点 O',A:'曲柄端 A',B:type==='slider'?'滑块 B':'连杆端 B',D:'固定支点 D'})[id],x:a.x,y:a.y,fixed:id==='O'||id==='D',trace:false});}
    const link=(id,a,b,name,color)=>m.links.push({id,a,b,name,length:G.distance(m.nodes.find(n=>n.id===a),m.nodes.find(n=>n.id===b)),color});link('L1','O','A','主动曲柄','#3877e8');link('L2','A','B','轨迹连杆','#14a59b');if(type==='fourbar')link('L3','D','B','从动杆','#e59633');else{const origin=transform({x:0,y:p[1]},t);m.sliders.push({id:'S1',node:'B',origin,angle:G.deg(alpha),length:Math.max(100,4*fit.scale)});}
    const ratio=type==='fourbar'?p[3]:p[2],off=(type==='fourbar'?p[4]:p[3])*fit.scale;let t0=clamp(ratio,0,1),along=(ratio-t0)*m.links[1].length;
    if(Math.hypot(along,off)>1e-12&&Math.hypot(along,off)<.1){t0=ratio<.5?1:0;along=(ratio-t0)*m.links[1].length;}
    const arm=Math.hypot(along,off)>=.1;m.attachments.push({id:'T1',name:'合成轨迹点 P',link:'L2',t:t0,along:arm?along:0,normal:arm?off:0,arm,trace:true});
    m.motor={link:'L1',pivot:'O',initialAngle:G.deg(alpha+theta),rpm:closed&&fit.reverse?-12:12};
    if(!closed)Object.assign(m.motor,{mode:'swing',minAngle:G.deg(alpha+start),maxAngle:G.deg(alpha+start+span),initialPhase:fit.reverse?90:-90});
    return M.validate(m);
  }
  async function run(input,settings={},hooks={}){
    const opts=options(settings),quality=qualities[opts.quality],target=prepare(input,{...opts,samples:quality.samples}),rand=random(settings.seed??24681357),types=opts.anchors?(opts.family==='auto'?['fourbar','fivebar']:[opts.family]):opts.family==='auto'?Object.keys(families):[opts.family],tasks=types.flatMap(type=>(type==='planetary'?[1]:[1,-1]).map(branch=>({type,branch}))),archive=[],representatives=[],startTime=Date.now();let evaluations=0,finished=0,lastYield=Date.now();
    const report=(fraction,phase)=>hooks.onProgress?.({fraction,phase,evaluations,bestRms:archive.length?Math.min(...archive.map(x=>x.rms)):null,elapsed:(Date.now()-startTime)/1000});
    let validating=false;
    async function yieldIfNeeded(force=false){abort(hooks.signal);if(force||Date.now()-lastYield>22){report(validating?.96:finished/tasks.length*.94,validating?'检查完整运动周期':'搜索候选');await new Promise(resolve=>setTimeout(resolve,0));lastYield=Date.now();abort(hooks.signal);}}
    const score=(type,p,branch)=>{evaluations++;return evaluate(type,p,target,opts,branch);};
    for(const [taskIndex,{type,branch}]of tasks.entries()){
      const ranges=parameterBounds(type,target.closed),N=quality.population,dimension=ranges.length,pop=[],fits=[],baseSeeds=seeds(type,target.closed);if(settings.initial?.type===type&&settings.initial.parameters.length===dimension)baseSeeds.unshift(settings.initial.parameters);
      for(let i=0;i<N;i++){let p;if(i<baseSeeds.length)p=baseSeeds[i].slice();else{p=ranges.map(([a,b])=>a+rand()*(b-a));if(type==='fourbar'&&target.closed){p[0]=.1+rand()*.8;p[1]=.7+rand()*2;p[2]=p[1]+(rand()-.5)*(1-p[0])*1.8;}if(type==='slider'&&target.closed)p[1]=(rand()-.5)*Math.min(2,p[0]-1)*1.5;}pop.push(p);fits.push(score(type,p,branch));await yieldIfNeeded();}
      for(let gen=0;gen<quality.generations;gen++){
        for(let i=0;i<N;i++){let a,b,c;do{a=Math.floor(rand()*N);}while(a===i);do{b=Math.floor(rand()*N);}while(b===i||b===a);do{c=Math.floor(rand()*N);}while(c===i||c===a||c===b);const forced=Math.floor(rand()*dimension),factor=.5+rand()*.4,p=pop[i].map((v,j)=>{if(j!==forced&&rand()>.85)return v;const x=pop[a][j]+factor*(pop[b][j]-pop[c][j]),[lo,hi]=ranges[j];return x<lo||x>hi?lo+rand()*(hi-lo):x;}),fit=score(type,p,branch);if(fit&&(!fits[i]||fit.score<fits[i].score)){pop[i]=p;fits[i]=fit;}}
        const best=fits.filter(Boolean).sort((a,b)=>a.score-b.score)[0];if(best){archive.push(best);if(archive.length>80){archive.sort((a,b)=>a.score-b.score);archive.splice(60);}}finished=taskIndex+(gen+1)/quality.generations;await yieldIfNeeded();
      }
      let winners=fits.filter(Boolean).sort((a,b)=>a.score-b.score).slice(0,3);
      for(let fit of winners){let steps=ranges.map(([a,b])=>(b-a)*.035);for(let round=0;round<22;round++){let improved=false;for(let j=0;j<dimension;j++)for(const sign of [-1,1]){const p=fit.parameters.slice();p[j]=clamp(p[j]+sign*steps[j],...ranges[j]);const f=score(type,p,branch);if(f&&f.score<fit.score){fit=f;improved=true;}await yieldIfNeeded();}if(!improved)steps=steps.map(v=>v*.55);}archive.push(fit);representatives.push(fit);}finished=taskIndex+1;await yieldIfNeeded(true);
    }
    abort(hooks.signal);validating=true;report(.96,'检查完整运动周期');archive.push(...representatives);archive.sort((a,b)=>a.score-b.score);const selected=[],candidates=[];
    // Preserve a result from each requested topology as well as distinct low-error alternatives.
    for(const type of types){const f=archive.find(x=>x.type===type);if(f)selected.push(f);}for(const f of archive){if(selected.length>=8)break;if(!selected.some(x=>x.type===f.type&&x.parameters.every((v,j)=>Math.abs(v-f.parameters[j])<.015)))selected.push(f);}
    for(const fit of selected){await yieldIfNeeded(true);const detail=evaluate(fit.type,fit.parameters,target,opts,fit.branch,true);if(!detail)continue;try{const model=build(detail,target,opts),sweep=S().sweep(model,1);if(!sweep.ok||M.mobility(model).dof!==1)continue;detail.model=model;detail.frames=sweep.frames.length;detail.complete=true;detail.reached=detail.rms<=opts.tolerance;candidates.push(detail);}catch{}abort(hooks.signal);}
    candidates.sort((a,b)=>a.rms-b.rms);const finalists=[];for(const type of types){const c=candidates.find(c=>c.type===type);if(c)finalists.push(c);}for(const c of candidates){if(finalists.length>=6)break;if(!finalists.includes(c))finalists.push(c);}finalists.sort((a,b)=>a.rms-b.rms);report(1,'求解完成');return{target,options:opts,candidates:finalists,evaluations,elapsed:(Date.now()-startTime)/1000,ok:finalists.length>0,message:finalists.length?'已找到可运行的候选机构。':'当前约束下未找到可运行的机构，请放宽杆长、支点限制或改变目标形状。'};
  }
  function capture(model,pointId){
    const point=M.observers(model).find(p=>p.id===pointId);if(!point||point.fixed)throw new Error('请选择活动节点、杆上点或伸出端。');const sweep=S().sweep(model,2);if(!sweep.ok)throw new Error('原机构无法完成运动周期：'+sweep.message);let points,closed=model.motor?.mode!=='swing';
    if(!closed){points=[];let previous=null;for(let i=0;i<=180;i++){const theta=model.motor.minAngle+(model.motor.maxAngle-model.motor.minAngle)*i/180,r=S().solve(model,theta,previous);if(!r.ok)throw new Error('原机构摆动行程无法闭合。');previous=r.positions;const p=M.positions(model,r.positions)[pointId];points.push({x:p.x,y:p.y});}}
    else points=sweep.frames.map(f=>{const p=M.positions(model,f.positions)[pointId];return{x:p.x,y:p.y};});
    if(points.length>1200)points=resample(points,1000,closed);cleanPoints(points);return{points,closed,name:model.name+' · '+point.name,source:'mechanism',initial:infer(model,pointId)};
  }
  function metadata(input){
    if(input==null)return null;if(!input||input.version!==1||!input.target||!input.settings)throw new Error('轨迹合成设计数据无效。');const points=cleanPoints(input.target.points),o=options(input.settings);prepare(points,o);return{version:1,target:{points,name:String(input.target.name||'目标轨迹').slice(0,80),source:['mechanism','drawn','import','preset'].includes(input.target.source)?input.target.source:'import'},settings:{family:o.family,quality:o.quality,minLength:o.minLength,maxLength:o.maxLength,tolerance:o.tolerance,allowReverse:o.allowReverse,closed:o.closed,smoothing:o.smoothing,...(o.anchors?{anchors:o.anchors}:{})}};
  }
  function pathConstraints(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('目标轨迹的约束设置无效。');
    if(Object.hasOwn(input,'anchors')&&(!Array.isArray(input.anchors)||input.anchors.length!==2))throw new Error('固定铰点约束需要两个位置。');
    const o=options({...(Object.hasOwn(input,'minLength')?{minLength:input.minLength}:{}),...(Object.hasOwn(input,'maxLength')?{maxLength:input.maxLength}:{}),...(Object.hasOwn(input,'anchors')?{anchors:input.anchors}:{})});
    return{minLength:o.minLength,maxLength:o.maxLength,...(o.anchors?{anchors:o.anchors}:{})};
  }
  function readPath(input){if(!input||input.format!=='jigou-trajectory'||input.version!==1||input.unit!=='mm'||typeof input.closed!=='boolean')throw new Error('需要机构工坊轨迹 v1 文件（单位 mm）。');const points=cleanPoints(input.points);prepare(points,{closed:input.closed});return{points,closed:input.closed,name:String(input.name||'导入轨迹').slice(0,80),source:'import',...(Object.hasOwn(input,'constraints')?{constraints:pathConstraints(input.constraints)}:{})};}
  function writePath(points,closed,name='目标轨迹',constraints){const result={format:'jigou-trajectory',version:1,unit:'mm',name:String(name).slice(0,80),closed:!!closed,points:cleanPoints(points)};prepare(result.points,{closed:result.closed});if(constraints!==undefined)result.constraints=pathConstraints(constraints);return result;}
  function csv(fit,target){const header='点序号,目标X_mm,目标Y_mm,候选X_mm,候选Y_mm,位置偏差_mm';return '\uFEFF'+[header,...fit.fitted.map((p,i)=>[i+1,target.points[i].x,target.points[i].y,p.x,p.y,G.distance(p,target.points[i])].map(x=>Number(x.toFixed(6))).join(','))].join('\r\n');}
  root.JiGou.synthesis={families,qualities,gearPairs,gearSpec,cycle,sizeLabels,gearSummary,cleanPoints,bounds,resample,prepare,options,pose,profile,align,evaluate,parameterBounds,seeds,infer,build,run,capture,metadata,readPath,writePath,csv};if(typeof module!=='undefined')module.exports=root.JiGou.synthesis;
})(globalThis);
