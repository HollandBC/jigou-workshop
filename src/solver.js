(function (root) {
  'use strict';
  const {geometry:G,model:M} = root.JiGou;
  const D=root.JiGou.drive||(typeof require==='function'?require('./drive.js'):null);
  const B=root.JiGou.gears||(typeof require==='function'?require('./gears.js'):null);
  const C=root.JiGou.cams||(typeof require==='function'?require('./cams.js'):null);
  const TOLERANCE = 1e-5; // mm; verified residual, not iteration count, controls acceptance.
  function setup(model, angle, guess, drive = true) {
    const positions = Object.create(null), known = new Set();
    for (const n of model.nodes) {
      const p = guess && guess[n.id];
      positions[n.id] = { x: p && Number.isFinite(p.x) ? p.x : n.x, y: p && Number.isFinite(p.y) ? p.y : n.y };
      if (n.fixed) { positions[n.id] = {x:n.x,y:n.y}; known.add(n.id); }
    }
    if (model.motor?.pivot && drive) {
      const d = model.motor, l = model.links.find(l=>l.id===d.link), base = positions[d.pivot], tip = l.a===d.pivot ? l.b : l.a;
      positions[tip] = {x:base.x+l.length*Math.cos(G.rad(angle)),y:base.y+l.length*Math.sin(G.rad(angle))};
      known.add(tip);
    }
    B.anchors(model,positions,guess,drive&&model.motor?angle:undefined);
    if(drive)B.seed(model,positions);
    if(drive)C.seed(model,positions,known);
    const variables = model.nodes.filter(n=>!known.has(n.id)).map(n=>n.id);
    return {positions,known,variables};
  }
  function angularGradient(positions,link){const a=positions[link.a],b=positions[link.b],dx=b.x-a.x,dy=b.y-a.y,den=Math.max(1e-20,dx*dx+dy*dy);return{x:-dy/den,y:dx/den};}
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function equations(model, positions, variables,driveAngle) {
    const ix = new Map(variables.map((id,i)=>[id,i*2])), size = variables.length*2, residuals=[], jacobian=[];
    for (const l of M.constraintLinks(model)) {
      const a=positions[l.a],b=positions[l.b],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy), row=new Array(size).fill(0);
      residuals.push(d-l.length);
      const denom=Math.max(d,1e-12);
      if(ix.has(l.a)){const i=ix.get(l.a);row[i]+=dx/denom;row[i+1]+=dy/denom;}
      if(ix.has(l.b)){const i=ix.get(l.b);row[i]-=dx/denom;row[i+1]-=dy/denom;}
      jacobian.push(row);
    }
    for(const n of model.nodes.filter(n=>n.onLink)){
      const l=model.links.find(l=>l.id===n.onLink.link),t=n.onLink.t;
      for(const [axis,offset]of [['x',0],['y',1]]){const row=new Array(size).fill(0);residuals.push(positions[n.id][axis]-(1-t)*positions[l.a][axis]-t*positions[l.b][axis]);for(const [id,weight]of [[n.id,1],[l.a,t-1],[l.b,-t]])if(ix.has(id))row[ix.get(id)+offset]+=weight;jacobian.push(row);}
    }
    for (const s of model.sliders) {
      const p=positions[s.node],f=M.railPose(model,s,positions),row=new Array(size).fill(0);
      const add=(id,x,y)=>{if(ix.has(id)){const i=ix.get(id);row[i]+=x;row[i+1]+=y;}};
      residuals.push((p.x-f.origin.x)*f.n.x+(p.y-f.origin.y)*f.n.y);add(s.node,f.n.x,f.n.y);
      if(s.guide){const l=model.links.find(l=>l.id===s.guide),a=positions[l.a],z={x:p.x-a.x,y:p.y-a.y},q=-f.u.x*z.x-f.u.y*z.y,g=angularGradient(positions,l);add(l.a,-f.n.x-q*g.x,-f.n.y-q*g.y);add(l.b,q*g.x,q*g.y);}
      jacobian.push(row);
      if(s.block){const l=model.links.find(l=>l.id===s.block),a=positions[l.a],b=positions[l.b],g=angularGradient(positions,l),scale=l.length,locked=new Array(size).fill(0),addAngle=(id,x,y)=>{if(ix.has(id)){locked[ix.get(id)]+=x*scale;locked[ix.get(id)+1]+=y*scale;}};
        residuals.push(wrap(Math.atan2(b.y-a.y,b.x-a.x)-G.rad(f.angle+s.blockAngle))*scale);addAngle(l.a,-g.x,-g.y);addAngle(l.b,g.x,g.y);
        if(s.guide){const parent=model.links.find(l=>l.id===s.guide),pg=angularGradient(positions,parent);addAngle(parent.a,pg.x,pg.y);addAngle(parent.b,-pg.x,-pg.y);}jacobian.push(locked);
      }
    }
    const gearEquations=B.equations(model,positions,variables);residuals.push(...gearEquations.residuals);jacobian.push(...gearEquations.jacobian);
    const camEquations=C.equations(model,positions,variables);residuals.push(...camEquations.residuals);jacobian.push(...camEquations.jacobian);
    if(model.motor?.pivot===null&&driveAngle!==undefined){const l=model.links.find(l=>l.id===model.motor.link),a=positions[l.a],b=positions[l.b],g=angularGradient(positions,l),row=new Array(size).fill(0);residuals.push(wrap(Math.atan2(b.y-a.y,b.x-a.x)-G.rad(driveAngle))*l.length);for(const[id,sign]of [[l.a,-1],[l.b,1]])if(ix.has(id)){row[ix.get(id)]+=sign*g.x*l.length;row[ix.get(id)+1]+=sign*g.y*l.length;}jacobian.push(row);}
    return {residuals,jacobian,max:Math.max(0,...residuals.map(Math.abs)),cost:residuals.reduce((s,r)=>s+r*r,0)};
  }
  function analytic(model, state) {
    const {positions,known}=state, preferences=G.clone(positions),constraints=M.constraintLinks(model);
    for (let pass=0;pass<model.nodes.length;pass++) {
      const before=known.size;C.seed(model,positions,known);let progress=known.size>before;
      for (const n of model.nodes) {
        if(known.has(n.id)) continue;
        if(n.onLink){const l=model.links.find(l=>l.id===n.onLink.link);if(known.has(l.a)&&known.has(l.b)){const t=n.onLink.t;positions[n.id]={x:(1-t)*positions[l.a].x+t*positions[l.b].x,y:(1-t)*positions[l.a].y+t*positions[l.b].y};known.add(n.id);progress=true;continue;}}
        const neighbors=constraints.filter(l=>(l.a===n.id&&known.has(l.b))||(l.b===n.id&&known.has(l.a)))
          .map(l=>({p:positions[l.a===n.id?l.b:l.a],r:l.length}));
        const slider=model.sliders.find(s=>s.node===n.id&&(!s.guide||model.links.filter(l=>l.id===s.guide).some(l=>known.has(l.a)&&known.has(l.b))));
        let candidates=[];
        if(slider&&neighbors.length){const rail=M.railPose(model,slider,positions);candidates=G.circleLine(neighbors[0].p,neighbors[0].r,rail.origin,rail.angle);}
        if(!candidates.length) for(let i=0;i<neighbors.length&&!candidates.length;i++) for(let j=i+1;j<neighbors.length&&!candidates.length;j++)
          candidates=G.circles(neighbors[i].p,neighbors[i].r,neighbors[j].p,neighbors[j].r);
        if(candidates.length) {positions[n.id]=G.nearest(candidates,preferences[n.id]);known.add(n.id);progress=true;}
      }
      if(!progress) break;
    }
  }
  function analyze(model) {
    const free=setup(model,model.motor?.initialAngle||0,null,false);
    const e=equations(model,free.positions,free.variables),rank=G.rank(e.jacobian);
    const driven=setup(model,model.motor?.initialAngle||0,null,true), de=equations(model,driven.positions,driven.variables,model.motor?.initialAngle);
    const remaining=driven.variables.length*2-G.rank(de.jacobian);
    return {dof:free.variables.length*2-rank,remaining,variables:free.variables.length*2,constraints:e.residuals.length,rank,redundant:e.residuals.length-rank};
  }
  function solve(model,angle,guess,options={}) {
    try{return solvePose(model,angle,guess,options);}catch(error){return{ok:false,code:'infeasible',message:error.message,residual:Infinity};}
  }
  function solvePose(model,angle,guess,options={}) {
    const state=setup(model,angle,guess),{positions,variables}=state;
    const initial=equations(model,positions,variables,angle);
    if(!options.allowUnderconstrained && variables.length*2-G.rank(initial.jacobian)>0)
      return {ok:false,code:'underconstrained',message:'驱动后仍有未约束的运动，请补充固定铰点、连杆或导轨。',residual:initial.max};
    analytic(model,state);
    let e=equations(model,positions,variables,angle),lambda=1e-3,iterations=0;
    for(;e.max>1e-8&&iterations<100;iterations++) {
      const size=variables.length*2;
      if(!size) break;
      const A=Array.from({length:size},()=>new Array(size).fill(0)), b=new Array(size).fill(0);
      for(let r=0;r<e.residuals.length;r++) for(let i=0;i<size;i++) {
        b[i]-=e.jacobian[r][i]*e.residuals[r];
        for(let j=0;j<size;j++) A[i][j]+=e.jacobian[r][i]*e.jacobian[r][j];
      }
      for(let i=0;i<size;i++) A[i][i]+=lambda;
      const delta=G.linear(A,b);
      if(!delta) break;
      const candidate=G.clone(positions);Object.defineProperty(candidate,'__angles',{value:positions.__angles,writable:true,configurable:true});
      for(let i=0;i<variables.length;i++) { candidate[variables[i]].x+=delta[i*2];candidate[variables[i]].y+=delta[i*2+1]; }
      const next=equations(model,candidate,variables,angle);
      if(next.cost<e.cost) {for(const id of variables) positions[id]=candidate[id];e=next;lambda=Math.max(1e-12,lambda/3);}
      else {lambda*=8;if(lambda>1e12) break;}
    }
    if(e.max>TOLERANCE || !B.check(model,positions) || Object.values(positions).some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))
      return {ok:false,code:'infeasible',message:'当前角度无法闭合，或求解未收敛。请检查杆长、装配状态和驱动范围。',residual:e.max,iterations};
    B.stamp(model,positions);
    return {ok:true,positions,residual:e.max,iterations,method:iterations?'numeric':'analytic'};
  }
  function sweep(model,step=1) {
    let previous=null;const frames=[];
    for(const drive of D.plan(model,step)) {
      const {angle}=drive,result=solve(model,angle,previous);
      if(!result.ok) return {ok:false,frames,angle,...result};
      frames.push({...drive,drive,positions:result.positions,residual:result.residual});previous=result.positions;
    }
    return {ok:true,frames};
  }
  // Differentiate the length/guide constraints: J * velocity = 0.
  // Known crank velocity uses rpm, so results do not depend on animation fps.
  function velocities(model, positions,drive=D.fromPositions(model,positions)) {
    if (!model.motor) return {ok:false,message:'请先设置旋转输入。'};
    const ids=model.nodes.map(n=>n.id), known=new Map(), d=model.motor;
    for(const n of model.nodes.filter(n=>n.fixed))known.set(n.id,{x:0,y:0,speed:0});
    const link=model.links.find(l=>l.id===d.link),tip=link.a===d.pivot?link.b:link.a;
    const omega=drive.omega;
    if(d.pivot){const base=positions[d.pivot],p=positions[tip];known.set(tip,{x:-omega*(p.y-base.y),y:omega*(p.x-base.x)});}
    const unknown=ids.filter(id=>!known.has(id)),columns=unknown.flatMap(id=>[ids.indexOf(id)*2,ids.indexOf(id)*2+1]);
    const e=equations(model,positions,ids,d.pivot===null?drive.angle:undefined);
    if(e.max>TOLERANCE*10)return {ok:false,message:'当前位形未闭合，速度暂不可用。'};
    const A=e.jacobian.map(row=>columns.map(c=>row[c])), b=e.jacobian.map(row=>{
      let sum=0;for(const [id,v]of known){const i=ids.indexOf(id)*2;sum+=row[i]*v.x+row[i+1]*v.y;}return(d.pivot===null&&row===e.jacobian.at(-1)?link.length*omega:0)-sum;
    });
    const size=columns.length;
    if(G.rank(A,1e-7)<size)return {ok:false,message:'当前位形接近奇异位置，速度无法唯一确定。'};
    const normal=Array.from({length:size},()=>new Array(size).fill(0)),rhs=new Array(size).fill(0);
    for(let r=0;r<A.length;r++)for(let i=0;i<size;i++){rhs[i]+=A[r][i]*b[r];for(let j=0;j<size;j++)normal[i][j]+=A[r][i]*A[r][j];}
    const v=G.linear(normal,rhs);
    if(!v||v.some(x=>!Number.isFinite(x)))return {ok:false,message:'速度求解失败。'};
    const error=Math.max(0,...A.map((row,r)=>Math.abs(row.reduce((sum,x,i)=>sum+x*v[i],0)-b[r])));
    if(error>1e-6*Math.max(1,...b.map(Math.abs)))return {ok:false,message:'当前约束不兼容，速度暂不可用。'};
    const result=Object.fromEntries(known);
    for(let i=0;i<unknown.length;i++)result[unknown[i]]={x:v[2*i],y:v[2*i+1]};
    for(const value of Object.values(result))value.speed=Math.hypot(value.x,value.y);
    return {ok:true,nodes:result,residual:error};
  }
  function angleCurvature(model,id,positions,v){const l=model.links.find(l=>l.id===id),a=positions[l.a],b=positions[l.b],dx=b.x-a.x,dy=b.y-a.y,dvx=v[l.b].x-v[l.a].x,dvy=v[l.b].y-v[l.a].y,den=dx*dx+dy*dy,w=(dx*dvy-dy*dvx)/den;return{omega:w,eta:-2*w*(dx*dvx+dy*dvy)/den};}
  function guideForcing(model,s,positions,v){
    let normal=0;if(s.guide){const f=M.railPose(model,s,positions),l=model.links.find(l=>l.id===s.guide),a=positions[l.a],p=positions[s.node],z={x:p.x-a.x,y:p.y-a.y},dz={x:v[s.node].x-v[l.a].x,y:v[s.node].y-v[l.a].y},{omega:w,eta}=angleCurvature(model,s.guide,positions,v);normal=2*w*(f.u.x*dz.x+f.u.y*dz.y)+eta*(f.u.x*z.x+f.u.y*z.y)+w*w*(f.n.x*z.x+f.n.y*z.y);}
    const result=[normal];if(s.block)result.push(model.links.find(l=>l.id===s.block).length*((s.guide?angleCurvature(model,s.guide,positions,v).eta:0)-angleCurvature(model,s.block,positions,v).eta));return result;
  }
  root.JiGou.solver={solve,analyze,sweep,velocities,equations,guideForcing,angleCurvature,tolerance:TOLERANCE};
  if(typeof module!=='undefined') module.exports=root.JiGou.solver;
})(globalThis);
