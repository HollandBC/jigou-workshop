(function(root){
  'use strict';
  const G=root.JiGou.geometry;
  const swing=m=>m.motor?.mode==='swing';
  function phaseForAngle(model,angle,near){
    if(!swing(model))return angle;
    const d=model.motor,mid=(d.minAngle+d.maxAngle)/2,amp=(d.maxAngle-d.minAngle)/2;
    const first=G.deg(Math.asin(G.clamp((angle-mid)/amp,-1,1)));
    if(!Number.isFinite(near))return first;
    const candidates=[first,180-first].map(p=>p+360*Math.round((near-p)/360));
    return candidates.reduce((a,b)=>Math.abs(a-near)<=Math.abs(b-near)?a:b);
  }
  function initialPhase(model){return swing(model)?model.motor.initialPhase??phaseForAngle(model,model.motor.initialAngle):model.motor?.initialAngle||0;}
  function at(model,phase){
    const d=model.motor,rate=(d?.rpm||0)*Math.PI/30;
    if(!swing(model))return{phase,angle:phase,omega:rate,alpha:0};
    const mid=(d.minAngle+d.maxAngle)/2,amp=(d.maxAngle-d.minAngle)/2,p=G.rad(phase);
    return{phase,angle:mid+amp*Math.sin(p),omega:G.rad(amp)*rate*Math.cos(p),alpha:-G.rad(amp)*rate*rate*Math.sin(p)};
  }
  function fromPositions(model,positions){
    const d=model.motor;if(!d)return{omega:0,alpha:0};const l=model.links.find(l=>l.id===d.link),a=positions[d.pivot||l.a],b=positions[d.pivot?(l.a===d.pivot?l.b:l.a):l.b];
    let angle=G.deg(Math.atan2(b.y-a.y,b.x-a.x));
    if(swing(model))angle+=360*Math.round(((d.minAngle+d.maxAngle)/2-angle)/360);
    return at(model,phaseForAngle(model,angle));
  }
  function plan(model,step=1){
    const start=initialPhase(model),direction=model.motor?.rpm<0?-1:1,frames=[];
    const span=360*(swing(model)?1:model.motor?.sampleTurns||1);step=Math.max(step,span/3600);
    for(let i=0;i<=Math.ceil(span/step);i++){const travel=Math.min(span,i*step),drive=at(model,start+direction*travel);frames.push({...drive,time:model.motor?.rpm?travel/(Math.abs(model.motor.rpm)*6):null});}
    return frames;
  }
  const D={swing,phaseForAngle,initialPhase,at,fromPositions,plan};root.JiGou.drive=D;if(typeof module!=='undefined')module.exports=D;
})(globalThis);
