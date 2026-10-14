(function(root){
  'use strict';
  const M=root.JiGou.model;
  const D=root.JiGou.drive||(typeof require==='function'?require('./drive.js'):null);
  const X=root.JiGou.drafting||(typeof require==='function'?require('./drafting.js'):null);
  const normalize=a=>((a%360)+360)%360;
  function read(input){
    const model=M.validate(input),saved=input.case;
    if(saved!==undefined&&(!saved||typeof saved!=='object'||Array.isArray(saved)||![1,2].includes(saved.version)))throw new Error('案例设置版本不支持，请使用机构工坊案例 v1 / v2 文件。');
    const data=saved||{},presentation={};
    for(const key of ['showGrid','snapGrid','snapJoints','showDimensions','showTraces','showSpeed']){
      if(data[key]!==undefined&&typeof data[key]!=='boolean')throw new Error('案例显示开关必须是布尔值。');
      presentation[key]=data[key]??true;
    }
    const angle=data.angle??(D.swing(model)?model.motor.initialAngle:normalize(model.motor?.initialAngle||0)),min=D.swing(model)?model.motor.minAngle:model.gears.length?-1e6:0,max=D.swing(model)?model.motor.maxAngle:model.gears.length?1e6:360;
    if(typeof angle!=='number'||!Number.isFinite(angle)||angle<min||angle>max)throw new Error('机构输入角度必须在当前输入模式的范围内。');
    presentation.angle=angle;
    if(D.swing(model)){const phase=data.drivePhase??D.phaseForAngle(model,angle,D.initialPhase(model));if(typeof phase!=='number'||!Number.isFinite(phase)||Math.abs(phase)>1e6||Math.abs(D.at(model,phase).angle-angle)>1e-4)throw new Error('机构摆动相位与输入角度不一致。');presentation.drivePhase=phase;}
    presentation.metric=data.metric??'speed';
    if(!['speed','acceleration','angular'].includes(presentation.metric))throw new Error('案例运动学显示量无效。');
    const points=M.observers(model);
    presentation.speedNode=data.speedNode??null;
    if(presentation.speedNode!==null&&!points.some(p=>p.id===presentation.speedNode))throw new Error('案例观察点不存在。');
    const references=data.angularReferences??{};
    if(!references||typeof references!=='object'||Array.isArray(references))throw new Error('案例角速度参考杆设置无效。');
    const entries=Object.entries(references);
    if(entries.length>points.length)throw new Error('案例角速度参考杆数量无效。');
    for(const [id,link] of entries){const point=points.find(p=>p.id===id);if(!point||!M.referenceLinks(model,point).some(l=>l.id===link))throw new Error('案例角速度参考杆与观察点不匹配。');}
    presentation.angularReferences=Object.fromEntries(entries);
    if(data.restoreTraces!==undefined&&typeof data.restoreTraces!=='boolean')throw new Error('案例轨迹设置无效。');
    presentation.restoreTraces=!!data.restoreTraces&&!!model.motor&&points.some(p=>p.trace);
    if(data.drawing!==undefined){if(data.version!==2)throw new Error('绘图辅助需要案例设置 v2，请使用机构工坊 2.2 或更新版。');presentation.drawing=X.read(data.drawing,model);}
    return {model,presentation};
  }
  function write(model,presentation={}){const version=presentation.drawing?2:1,result=read({...model,case:{...presentation,version}});return {...result.model,case:{version,...result.presentation}};}
  const C={read,write};root.JiGou.cases=C;
  if(typeof module!=='undefined')module.exports=C;
})(globalThis);
