(function(root){
  'use strict';
  const {geometry:G,model:M}=root.JiGou;
  const EPS=1e-8;
  function component(model,link){const body=M.bodyForLink(model,link),l=model.links.find(l=>l.id===link);return body?body.nodes:[l.a,l.b];}
  function translate(model,link,delta){for(const id of component(model,link)){const n=model.nodes.find(n=>n.id===id);n.x+=delta.x;n.y+=delta.y;}M.syncPins(model);}
  function rotate(model,link,pivot,angle){const c=Math.cos(angle),s=Math.sin(angle);for(const id of component(model,link)){const n=model.nodes.find(n=>n.id===id),x=n.x-pivot.x,y=n.y-pivot.y;n.x=pivot.x+c*x-s*y;n.y=pivot.y+s*x+c*y;}M.syncPins(model);}
  // Editing keeps the prismatic constraints intact; incident rod lengths are
  // recalculated by the UI after this geometric operation.
  function reconcile(model){
    for(let iteration=0;iteration<24;iteration++){
      M.syncPins(model);
      for(const rail of model.sliders){
        const n=model.nodes.find(n=>n.id===rail.node);
        if(rail.block){const f=M.frame(model,rail.block),desired=G.rad(M.railPose(model,rail).angle+rail.blockAngle),diff=desired-Math.atan2(f.u.y,f.u.x),turn=Math.atan2(Math.sin(diff),Math.cos(diff));if(Math.abs(turn)>EPS)rotate(model,rail.block,{x:n.x,y:n.y},turn);}
        const p=M.railProjection(model,rail,n),delta={x:p.x-n.x,y:p.y-n.y};
        if(Math.hypot(delta.x,delta.y)>EPS){if(rail.block)translate(model,rail.block,delta);else if(n.onLink)translate(model,n.onLink.link,delta);else{n.x=p.x;n.y=p.y;}}
      }
      M.syncPins(model);
      const error=Math.max(0,...model.sliders.map(s=>{const n=model.nodes.find(n=>n.id===s.node),f=M.railPose(model,s),line=Math.abs((n.x-f.origin.x)*f.n.x+(n.y-f.origin.y)*f.n.y);if(!s.block)return line;const b=M.frame(model,s.block),d=Math.atan2(b.u.y,b.u.x)-G.rad(f.angle+s.blockAngle);return Math.max(line,Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))*b.length);}));
      if(error<1e-6)return;
    }
    throw new Error('这次移动与现有移动副约束冲突，已保留原来的位置。');
  }
  function moveNode(model,id,target){
    const n=model.nodes.find(n=>n.id===id),rail=model.sliders.find(s=>s.node===id);
    if(root.JiGou.cams?.moveNode(model,id,target)){reconcile(model);return;}
    if(root.JiGou.gears?.moveCenter(model,id,target)){reconcile(model);return;}
    if(rail){
      const p=M.railProjection(model,rail,target),delta={x:p.x-n.x,y:p.y-n.y};
      if(rail.block)translate(model,rail.block,delta);else if(n.onLink)translate(model,n.onLink.link,delta);else{n.x=p.x;n.y=p.y;}
    }else if(n.onLink){const f=M.frame(model,n.onLink.link),margin=.1/Math.max(f.length,.2);n.onLink.t=G.clamp(G.projectSegment(target,f.a,f.b).t,margin,1-margin);M.syncPins(model);}
    else{
      const solid=model.sliders.find(s=>s.block&&component(model,s.block).includes(id)&&s.node!==id);
      if(solid){const base=model.nodes.find(n=>n.id===solid.node),f=M.frame(model,solid.block),q=(target.x-base.x)*f.u.x+(target.y-base.y)*f.u.y,normal=(n.x-base.x)*f.n.x+(n.y-base.y)*f.n.y;n.x=base.x+q*f.u.x+normal*f.n.x;n.y=base.y+q*f.u.y+normal*f.n.y;}
      else{n.x=target.x;n.y=target.y;}
    }
    reconcile(model);
  }
  function moveRail(model,id,delta){
    const rail=model.sliders.find(s=>s.id===id);
    if((model.cams||[]).some(c=>c.guide===id))throw new Error('凸轮从动件导轨由安装参数确定，请在凸轮设计窗口修改偏距和方向。');
    if(rail.guide)translate(model,rail.guide,delta);
    else{rail.origin.x+=delta.x;rail.origin.y+=delta.y;}
    reconcile(model);
  }
  root.JiGou.editing={moveNode,moveRail,reconcile};
  if(typeof module!=='undefined')module.exports=root.JiGou.editing;
})(globalThis);
