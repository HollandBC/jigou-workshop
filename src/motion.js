(function(root){
  'use strict';
  const {geometry:G,model:M,solver:S}=root.JiGou;
  const D=root.JiGou.drive;
  const metadata={speed:{name:'线速度',unit:'mm/s',component:'V'},acceleration:{name:'线加速度',unit:'mm/s²',component:'A'},angular:{name:'角速度',unit:'rad/s',component:'ω'}};
  function analyze(model,positions,drive=D.fromPositions(model,positions)){
    const velocity=S.velocities(model,positions,drive);
    if(!velocity.ok)return velocity;
    const ids=model.nodes.map(n=>n.id),known=new Map(),d=model.motor,{omega,alpha}=drive;
    for(const n of model.nodes.filter(n=>n.fixed))known.set(n.id,{x:0,y:0});
    const driver=model.links.find(l=>l.id===d.link),tip=driver.a===d.pivot?driver.b:driver.a;
    if(d.pivot){const rx=positions[tip].x-positions[d.pivot].x,ry=positions[tip].y-positions[d.pivot].y;known.set(tip,{x:-(omega**2)*rx-alpha*ry,y:-(omega**2)*ry+alpha*rx});}
    const unknown=ids.filter(id=>!known.has(id)),columns=unknown.flatMap(id=>[ids.indexOf(id)*2,ids.indexOf(id)*2+1]);
    const equations=S.equations(model,positions,ids,d.pivot===null?drive.angle:undefined),forcing=[];
    for(const l of M.constraintLinks(model)){
      const a=positions[l.a],b=positions[l.b],v=velocity.nodes,dx=a.x-b.x,dy=a.y-b.y,len=Math.hypot(dx,dy);
      const vx=v[l.a].x-v[l.b].x,vy=v[l.a].y-v[l.b].y,radial=(dx*vx+dy*vy)/len;
      forcing.push(-(vx*vx+vy*vy-radial*radial)/len);
    }
    for(const node of model.nodes.filter(n=>n.onLink))forcing.push(0,0);
    for(const rail of model.sliders)forcing.push(...S.guideForcing(model,rail,positions,velocity.nodes));
    forcing.push(...root.JiGou.gears.forcing(model,positions,velocity.nodes,S.angleCurvature));
    forcing.push(...root.JiGou.cams.forcing(model,positions,velocity.nodes,S.angleCurvature));
    if(d.pivot===null)forcing.push(driver.length*(alpha-S.angleCurvature(model,driver.id,positions,velocity.nodes).eta));
    const A=equations.jacobian.map(row=>columns.map(c=>row[c])),rhs=equations.jacobian.map((row,r)=>{
      let sum=0;for(const [id,a]of known){const i=ids.indexOf(id)*2;sum+=row[i]*a.x+row[i+1]*a.y;}return forcing[r]-sum;
    });
    const size=columns.length,normal=Array.from({length:size},()=>new Array(size).fill(0)),b=new Array(size).fill(0);
    for(let r=0;r<A.length;r++)for(let i=0;i<size;i++){b[i]+=A[r][i]*rhs[r];for(let j=0;j<size;j++)normal[i][j]+=A[r][i]*A[r][j];}
    const solution=G.linear(normal,b);
    if(!solution||solution.some(v=>!Number.isFinite(v)))return {ok:false,message:'加速度无法唯一确定。'};
    const residual=Math.max(0,...A.map((row,r)=>Math.abs(row.reduce((sum,v,i)=>sum+v*solution[i],0)-rhs[r])));
    if(residual>1e-6*Math.max(1,...rhs.map(Math.abs)))return {ok:false,message:'当前加速度约束不兼容。'};
    const acc=Object.fromEntries(known);for(let i=0;i<unknown.length;i++)acc[unknown[i]]={x:solution[i*2],y:solution[i*2+1]};
    const nodes=Object.fromEntries(ids.map(id=>[id,{vx:velocity.nodes[id].x,vy:velocity.nodes[id].y,speed:velocity.nodes[id].speed,ax:acc[id].x,ay:acc[id].y,acceleration:Math.hypot(acc[id].x,acc[id].y)}])),links={};
    for(const l of model.links){
      const dx=positions[l.b].x-positions[l.a].x,dy=positions[l.b].y-positions[l.a].y,a=nodes[l.a],b=nodes[l.b],denom=dx*dx+dy*dy;
      links[l.id]={omega:(dx*(b.vy-a.vy)-dy*(b.vx-a.vx))/denom,alpha:(dx*(b.ay-a.ay)-dy*(b.ax-a.ax))/denom};
    }
    const attachments={};
    for(const p of model.attachments||[]){
      const l=model.links.find(l=>l.id===p.link),base=nodes[l.a],point=M.attachmentPose(model,p,positions),rx=point.x-positions[l.a].x,ry=point.y-positions[l.a].y,{omega:w,alpha}=links[l.id];
      const vx=base.vx-w*ry,vy=base.vy+w*rx,ax=base.ax-alpha*ry-w*w*rx,ay=base.ay+alpha*rx-w*w*ry;
      attachments[p.id]={vx,vy,speed:Math.hypot(vx,vy),ax,ay,acceleration:Math.hypot(ax,ay),omega:w,alpha};
    }
    return {ok:true,nodes,links,attachments,residual};
  }
  function sample(model,point,motion,positions,angle){
    const value=motion.ok?(point.type==='attachments'?motion.attachments[point.id]:motion.nodes[point.id]):null;
    const angularByLink={};for(const l of M.referenceLinks(model,point))if(l)angularByLink[l.id]=motion.ok?motion.links[l.id].omega:null;
    return {x:positions[point.id].x,y:positions[point.id].y,angle,vx:value?.vx??null,vy:value?.vy??null,speed:value?.speed??null,ax:value?.ax??null,ay:value?.ay??null,acceleration:value?.acceleration??null,angularByLink,omega:value?.omega??null};
  }
  function value(state,point,sample){
    if(!sample)return null;if(state.metric==='angular'){const reference=point.type==='attachments'?point.link:state.angularReferences?.[point.id];return sample.angularByLink?.[reference]??sample.omega??null;}
    return sample[state.metric||'speed'];
  }
  root.JiGou.motion={analyze,sample,value,metadata};
  if(typeof module!=='undefined')module.exports=root.JiGou.motion;
})(globalThis);
