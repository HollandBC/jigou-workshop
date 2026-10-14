(function(root){
  'use strict';
  const {geometry:G,model:M,motion:K}=root.JiGou;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function speedRange(state){const max=state.metricMax?.[state.metric||'speed']??state.speedMax??0;if(max<1e-8)return 1;const unit=10**Math.floor(Math.log10(max));return Math.ceil(max/unit)*unit;}
  function speedColor(speed,max){
    const t=G.clamp(speed/Math.max(max,1e-8),0,1),stops=[[56,119,232],[20,165,155],[234,174,57],[224,79,65]];
    const i=Math.min(2,Math.floor(t*3)),f=t*3-i;
    return '#'+stops[i].map((v,j)=>Math.round(v+(stops[i+1][j]-v)*f).toString(16).padStart(2,'0')).join('');
  }
  function render(stage,model,state,view){
    const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),s=view.scale;
    const ox=w/2+view.x,oy=h/2+view.y,pos=M.positions(model,state.positions),observers=M.observers(model);
    const r=5.5/s, sw=1/s, text=(p,label,color='#8294ac',dx=0,dy=0,size=11)=>`<text transform="translate(${p.x+dx/s} ${p.y-dy/s}) scale(1 -1)" fill="${color}" font-size="${size/s}" font-family="Segoe UI,Microsoft YaHei,sans-serif" text-anchor="middle" paint-order="stroke" stroke="white" stroke-width="${3/s}" stroke-linejoin="round">${esc(label)}</text>`;
    const grid=G.gridStep(s)*s,maxSpeed=speedRange(state);
    let content=`<defs><pattern id="grid" width="${grid}" height="${grid}" x="${((ox%grid)+grid)%grid}" y="${((oy%grid)+grid)%grid}" patternUnits="userSpaceOnUse"><path d="M ${grid} 0 H 0 V ${grid}" fill="none" stroke="#e9eef5" stroke-width=".7"/></pattern></defs><rect width="100%" height="100%" fill="white"/>`;
    if(state.showGrid)content+='<rect width="100%" height="100%" fill="url(#grid)"/>';
    content+=`<g transform="translate(${ox} ${oy}) scale(${s} ${-s})">`;
    content+=root.JiGou.drafting?.backgroundSVG(state.drawing?.background)||'';
    const extent=Math.max(w,h)/s*2;
    content+=`<path d="M ${-extent} 0 H ${extent} M 0 ${-extent} V ${extent}" stroke="#edf1f6" stroke-width="${sw}"/>`;
    content+=root.JiGou.gears.svg(model,state.positions||pos,state,s);
    content+=root.JiGou.cams.svg(model,state.positions||pos,state,s);
    if(state.showTraces&&model.synthesis){const d=model.synthesis,t=root.JiGou.synthesis.prepare(d.target.points,d.settings),p=t.points;content+=`<polyline data-synthesis-target="true" points="${[...p,...(t.closed?[p[0]]:[])].map(q=>`${q.x},${q.y}`).join(' ')}" fill="none" stroke="#e59633" stroke-dasharray="${7/s} ${5/s}" stroke-width="${1.8/s}" opacity=".85" pointer-events="none"/>`;}
    if(state.showTraces) for(const n of observers.filter(n=>n.trace)) {
      const path=state.traces[n.id]||[];
      if(path.length>1){
        if(state.showSpeed){
          const buckets=Array.from({length:32},()=>[]),missing=[];
          for(let i=1;i<path.length;i++){
            const a=path[i-1],b=path[i],va=K.value(state,n,a),vb=K.value(state,n,b),speed=Number.isFinite(va)&&Number.isFinite(vb)?(Math.abs(va)+Math.abs(vb))/2:null;
            const target=speed===null?missing:buckets[Math.min(31,Math.floor(G.clamp(speed/maxSpeed,0,1)*32))];
            target.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
          }
          for(let i=0;i<32;i++)if(buckets[i].length)content+=`<path d="${buckets[i].join(' ')}" fill="none" stroke="${speedColor((i+.5)/32*maxSpeed,maxSpeed)}" stroke-width="${2.5/s}" stroke-linecap="round" opacity=".85"/>`;
          if(missing.length)content+=`<path d="${missing.join(' ')}" fill="none" stroke="#a6b2c4" stroke-dasharray="${3/s} ${3/s}" stroke-width="${2/s}"/>`;
        }else content+=`<polyline points="${path.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#19afa2" opacity=".65" stroke-width="${1.6/s}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    }
    if(state.gearDraft){const p=state.gearDraft.node?pos[state.gearDraft.node]:state.gearDraft.point,r=state.gearRadius||20;content+=`<circle data-gear-preview="true" cx="${p.x}" cy="${p.y}" r="${r}" fill="#3877e814" stroke="#3877e8" stroke-width="${1.5/s}" stroke-dasharray="${5/s} ${4/s}" pointer-events="none"/>`;if(state.pointer)content+=`<path d="M ${p.x} ${p.y} L ${state.pointer.x} ${state.pointer.y}" stroke="#3877e8" stroke-width="${2/s}" stroke-dasharray="${4/s} ${4/s}" pointer-events="none"/>`;}
    for(const body of model.bodies||[]){
      const active=state.selection?.type==='bodies'&&state.selection.id===body.id;
      content+=`<g data-body="${body.id}" role="button" tabindex="0" aria-label="整体刚性构件 ${esc(body.name)}" style="cursor:pointer"><title>${esc(body.name)} · 整体刚性构件</title><polygon ${active?'data-selection-highlight="body"':''} points="${body.nodes.map(id=>`${pos[id].x},${pos[id].y}`).join(' ')}" fill="${active?'#3877e8':body.color}" fill-opacity="${active?0.28:0.12}" stroke="${active?'#2863df':body.color}" stroke-opacity="${active?1:.5}" stroke-width="${(active?3:1)/s}"/></g>`;
    }
    for(const l of model.links){
      const a=pos[l.a],b=pos[l.b],active=state.selection?.type==='links'&&state.selection.id===l.id;
      content+=`<g data-link="${l.id}" role="button" tabindex="0" aria-label="连杆 ${esc(l.name)}，${l.length.toFixed(2)} 毫米" style="cursor:pointer"><path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="transparent" stroke-width="${20/s}"/>`;
      if(active)content+=`<path data-selection-highlight="link" d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="#3877e8" stroke-width="${19/s}" stroke-linecap="round" opacity=".25"/><path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="#2863df" stroke-width="${10/s}" stroke-linecap="round"/>`;
      content+=`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="${l.color}" stroke-width="${5/s}" stroke-linecap="round"/>`;
      if(state.showDimensions&&!l.rotor){const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},label=l.length.toFixed(1),width=Math.max(32,label.length*7),dy=(model.attachments||[]).some(p=>p.link===l.id&&Math.abs(p.t-.5)*G.distance(a,b)*s<40)?18:-14;content+=`<g data-dimension="${l.id}" role="button" tabindex="0" aria-label="修改${esc(l.name)}的长度" style="cursor:text"><title>点击修改杆长 / mm</title><rect x="${mid.x-width/2/s}" y="${mid.y-(dy+9)/s}" width="${width/s}" height="${19/s}" rx="${4/s}" fill="white" fill-opacity=".92"/>${text(mid,label,l.color,0,dy,11)}</g>`;}
      if(model.motor?.link===l.id){const p=model.motor.pivot?pos[model.motor.pivot]:{x:(a.x+b.x)/2,y:(a.y+b.y)/2};content+=`<path d="M ${p.x-14/s} ${p.y-3/s} A ${14/s} ${14/s} 0 1 0 ${p.x+9/s} ${p.y+11/s}" fill="none" stroke="${l.color}" stroke-width="${1.2/s}" opacity=".7"/><path d="m ${p.x+9/s} ${p.y+11/s} l ${-5/s} ${1/s} l ${2/s} ${-5/s}" fill="none" stroke="${l.color}" stroke-width="${1.2/s}"/>`;}
      content+='</g>';
    }
    for(const rail of model.sliders){
      const f=M.railPose(model,rail,pos),{u,n}=f,p=f.origin,b=M.railBounds(model,rail,pos,state.railRanges),active=state.selection?.type==='sliders'&&state.selection.id===rail.id;
      const line=side=>`M ${p.x+u.x*b.min+n.x*side*7/s} ${p.y+u.y*b.min+n.y*side*7/s} L ${p.x+u.x*b.max+n.x*side*7/s} ${p.y+u.y*b.max+n.y*side*7/s}`;
      content+=`<g data-slider="${rail.id}" ${rail.guide?'data-moving-guide="true"':''} data-guide-min="${b.min}" data-guide-max="${b.max}" role="button" tabindex="0" aria-label="${rail.guide?'活动导槽':'机架导轨'} ${esc(rail.id)}" style="cursor:move"><title>拖动导轨；活动导槽带动安装母杆平移</title>`;
      if(active)content+=`<path data-selection-highlight="slider" d="M ${p.x+u.x*b.min} ${p.y+u.y*b.min} L ${p.x+u.x*b.max} ${p.y+u.y*b.max}" stroke="#3877e8" stroke-width="${22/s}" opacity=".15" pointer-events="none"/>`;
      for(const side of [-1,1])content+=`<path d="${line(side)}" fill="none" stroke="transparent" stroke-width="${6/s}" pointer-events="stroke"/><path data-guide-line="${rail.id}" d="${line(side)}" fill="none" stroke="${active?'#3877e8':rail.guide?'#48a79e':'#b4c4da'}" stroke-width="${1.5/s}" stroke-dasharray="${5/s} ${4/s}" pointer-events="none"/>`;
      content+='</g>';
    }
    for(const item of model.attachments||[]){
      const p=pos[item.id],anchor=p.anchor,active=state.selection?.type==='attachments'&&state.selection.id===item.id,parent=model.links.find(l=>l.id===item.link);
      content+=`<g data-attachment="${item.id}" role="button" tabindex="0" aria-label="${item.arm?'伸出杆':'杆上点'} ${esc(item.name)}" style="cursor:pointer">`;
      if(item.arm){
        content+=`<path d="M ${anchor.x} ${anchor.y} L ${p.x} ${p.y}" stroke="transparent" stroke-width="${20/s}"/>`;
        if(active)content+=`<path data-selection-highlight="arm" d="M ${anchor.x} ${anchor.y} L ${p.x} ${p.y}" stroke="#3877e8" stroke-width="${19/s}" opacity=".25" stroke-linecap="round"/><path d="M ${anchor.x} ${anchor.y} L ${p.x} ${p.y}" stroke="#2863df" stroke-width="${10/s}" stroke-linecap="round"/>`;
        content+=`<path d="M ${anchor.x} ${anchor.y} L ${p.x} ${p.y}" stroke="${parent.color}" stroke-width="${4.5/s}" stroke-linecap="round"/><rect x="${anchor.x-3/s}" y="${anchor.y-3/s}" width="${6/s}" height="${6/s}" fill="${parent.color}" stroke="white" stroke-width="${sw}"/>`;
        if(state.showDimensions)content+=text({x:(anchor.x+p.x)/2,y:(anchor.y+p.y)/2},Math.hypot(item.along,item.normal).toFixed(1),parent.color,12,-7,10);
      }
      if(active)content+=`<circle data-selection-highlight="attachment" cx="${p.x}" cy="${p.y}" r="${16/s}" fill="#3877e833" stroke="#2863df" stroke-width="${2/s}" pointer-events="none"/>`;
      content+=`<g data-attachment-tip="${item.id}" style="cursor:grab"><circle cx="${p.x}" cy="${p.y}" r="${6/s}" fill="${active?'#3877e8':'#fff6e5'}" stroke="${active?'white':'#cc8426'}" stroke-width="${2/s}"/><path d="M ${p.x-2.5/s} ${p.y} h ${5/s} M ${p.x} ${p.y-2.5/s} v ${5/s}" stroke="${active?'white':'#cc8426'}" stroke-width="${sw}"/>${text(p,item.name,active?'#2863df':'#a37431',0,-20,11)}</g></g>`;
    }
    const joints=M.mobility(model).joints;
    for(const node of model.nodes){
      const p=pos[node.id],active=state.selection?.type==='nodes'&&state.selection.id===node.id;
      const bodyPoint=joints.find(j=>j.id===node.id).bodyPoint;
      const slider=model.sliders.find(x=>x.node===node.id);
      content+=`<g data-node="${node.id}" ${node.onLink?'data-rod-pin="true"':''} ${bodyPoint?'data-body-point="true"':''} role="button" tabindex="0" aria-label="${node.onLink?'杆上铰点':bodyPoint?'构件观测点':'铰点'} ${esc(node.name)}${node.fixed?'，固定':''}" style="cursor:${state.tool==='select'?'grab':'crosshair'}">`;
      if(node.onLink)content+=`<circle cx="${p.x}" cy="${p.y}" r="${9/s}" fill="white" stroke="#14a59b" stroke-width="${1.4/s}"/>`;
      if(node.fixed){content+=`<path d="M ${p.x} ${p.y-4/s} l ${-10/s} ${-13/s} h ${20/s} z" fill="#f0f3f8" stroke="#8e9fb5" stroke-width="${sw}"/><path d="M ${p.x-13/s} ${p.y-18/s} h ${26/s}" stroke="#8e9fb5" stroke-width="${sw}"/>`;for(let j=-12;j<12;j+=6) content+=`<path d="m ${p.x+j/s} ${p.y-18/s} l ${-4/s} ${-5/s}" stroke="#b1bdcd" stroke-width="${sw}"/>`;}
      if(slider&&!model.cams.some(c=>c.node===node.id))content+=`<rect transform="translate(${p.x} ${p.y}) rotate(${M.railPose(model,slider,pos).angle})" x="${-10/s}" y="${-8/s}" width="${20/s}" height="${16/s}" rx="${2/s}" fill="#eef7f7" stroke="#14a59b" stroke-width="${1.5/s}"/>`;
      if(active||state.pending===node.id)content+=`<circle data-selection-highlight="node" cx="${p.x}" cy="${p.y}" r="${active?17/s:12/s}" fill="#3877e833" stroke="#2863df" stroke-width="${2/s}" pointer-events="none"/>`;
      if(state.snapNode===node.id)content+=`<circle cx="${p.x}" cy="${p.y}" r="${16/s}" fill="#14a59b22" stroke="#14a59b" stroke-width="${1.6/s}" pointer-events="none"/><path d="M ${p.x-21/s} ${p.y} h ${6/s} M ${p.x+15/s} ${p.y} h ${6/s} M ${p.x} ${p.y-21/s} v ${6/s} M ${p.x} ${p.y+15/s} v ${6/s}" stroke="#14a59b" stroke-width="${sw}" pointer-events="none"/>`;
      content+=`<circle cx="${p.x}" cy="${p.y}" r="${active?7/s:r}" fill="${active?'#3877e8':bodyPoint?'#14a59b':'white'}" stroke="${active||bodyPoint?'white':'#566f91'}" stroke-width="${active?2.5/s:1.8/s}"/><circle cx="${p.x}" cy="${p.y}" r="${1.7/s}" fill="${active||bodyPoint?'white':node.trace?'#14a59b':'#657f9f'}"/>${text(p,node.name,active?'#2863df':'#536c8b',node.fixed?-17:0,node.fixed?14:-21,active?12:11)}</g>`;
    }
    if(state.tool==='select'&&!state.playing&&state.selection?.type==='sliders'){
      const rail=model.sliders.find(s=>s.id===state.selection.id);if(rail){const f=M.railPose(model,rail,pos),p={x:f.origin.x+f.n.x*23/s,y:f.origin.y+f.n.y*23/s};content+=`<g data-rail-handle="${rail.id}" role="button" tabindex="0" aria-label="拖动导轨 ${esc(rail.id)}" style="cursor:move"><title>拖动导轨基点；活动导槽带动母杆</title><path d="M ${f.origin.x} ${f.origin.y} L ${p.x} ${p.y}" stroke="#3877e8" stroke-width="${sw}" stroke-dasharray="${3/s} ${3/s}" pointer-events="none"/><circle cx="${p.x}" cy="${p.y}" r="${8/s}" fill="white" stroke="#3877e8" stroke-width="${1.8/s}"/><path d="M ${p.x-4/s} ${p.y} h ${8/s} M ${p.x} ${p.y-4/s} v ${8/s}" stroke="#3877e8" stroke-width="${1.5/s}" pointer-events="none"/>${text(p,'拖动导轨','#3877e8',0,-18,10)}</g>`;}
    }
    if(state.loopDraft?.length){
      const vertices=state.loopDraft.map(v=>v.id?pos[v.id]:v),preview=state.pointer?[...vertices,state.pointer]:vertices;
      content+=`<g data-loop-preview="true" pointer-events="none"><polyline points="${preview.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${state.loopRigid?'#14a59b':'#3877e8'}" stroke-width="${2/s}" stroke-dasharray="${6/s} ${4/s}"/>`;
      if(state.loopRigid&&vertices.length>=3)content+=`<polygon points="${vertices.map(p=>`${p.x},${p.y}`).join(' ')}" fill="#14a59b" fill-opacity=".08"/>`;
      for(let i=0;i<vertices.length;i++){const p=vertices[i],first=i===0;content+=`<circle cx="${p.x}" cy="${p.y}" r="${(state.loopSnap===i?14:first?9:5)/s}" fill="${first?'#e6f7f4':'white'}" stroke="${first?'#14a59b':'#3877e8'}" stroke-width="${2/s}"/>`;if(first)content+=text(p,'起点','#14a59b',0,19,10);}
      content+='</g>';
    }
    if(state.sliderDraft){const p=state.sliderDraft.node?pos[state.sliderDraft.node]:state.sliderDraft.point,q=state.pointer||{x:p.x+40,y:p.y};content+=`<g data-slider-preview="true" pointer-events="none"><path d="M ${p.x} ${p.y} L ${q.x} ${q.y}" stroke="#14a59b" stroke-width="${2/s}" stroke-dasharray="${5/s} ${4/s}"/><rect x="${p.x-10/s}" y="${p.y-8/s}" width="${20/s}" height="${16/s}" fill="#e4f6f2" stroke="#14a59b" stroke-width="${1.5/s}"/></g>`;}
    if(state.pending&&state.pointer){const a=pos[state.pending],b=state.pointer;content+=`<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="#3877e8" stroke-width="${2/s}" stroke-dasharray="${5/s} ${4/s}"/>`;}
    if(state.hoverLink){const p=state.hoverLink.foot;content+=`<circle cx="${p.x}" cy="${p.y}" r="${9/s}" fill="#14a59b22" stroke="#14a59b" stroke-width="${2/s}" pointer-events="none"/>`;}
    if(state.armDraft){const draft=M.attachmentPose(model,state.armDraft,state.positions);content+=`<g pointer-events="none"><path d="M ${draft.anchor.x} ${draft.anchor.y} L ${draft.x} ${draft.y}" stroke="#cc8426" stroke-width="${3/s}" stroke-dasharray="${6/s} ${4/s}"/><circle cx="${draft.x}" cy="${draft.y}" r="${6/s}" fill="#fff6e5" stroke="#cc8426" stroke-width="${1.5/s}"/>${text(draft,Math.hypot(state.armDraft.along,state.armDraft.normal).toFixed(1)+' mm','#a37431',0,-18,11)}</g>`;}
    if(state.showTraces&&state.showSpeed){
      const id=state.speedNode,point=observers.find(n=>n.id===id),p=pos[id],metric=state.metric||'speed',meta=K.metadata[metric];
      const v=state.motion?.ok?(point?.type==='attachments'?state.motion.attachments[id]:state.motion.nodes[id]):state.velocities?.ok?{vx:state.velocities.nodes[id]?.x,vy:state.velocities.nodes[id]?.y,speed:state.velocities.nodes[id]?.speed}:null;
      if(v&&p&&metric!=='angular'&&v[metric]>1e-8){
        const value=v[metric],vx=metric==='acceleration'?v.ax:v.vx,vy=metric==='acceleration'?v.ay:v.vy,length=(22+44*G.clamp(value/maxSpeed,0,1))/s,ux=vx/value,uy=vy/value;
        const tip={x:p.x+ux*length,y:p.y+uy*length},color=speedColor(value,maxSpeed);
        content+=`<g data-motion-arrow="${metric}" pointer-events="none"><path d="M ${p.x} ${p.y} L ${tip.x} ${tip.y} m ${(-ux*8-uy*4)/s} ${(-uy*8+ux*4)/s} L ${tip.x} ${tip.y} l ${(-ux*8+uy*4)/s} ${(-uy*8-ux*4)/s}" fill="none" stroke="${color}" stroke-width="${2/s}" stroke-linecap="round"/>${text(tip,`${value.toFixed(1)} ${meta.unit}`,color,0,-13,11)}</g>`;
      }
      if(metric==='angular'&&point&&state.motion?.ok){const sample=K.sample(model,point,state.motion,pos,state.angle),omega=K.value(state,point,sample);if(Number.isFinite(omega)&&Math.abs(omega)>1e-8){
        const sign=omega<0?-1:1,radius=24/s,angles=Array.from({length:25},(_,i)=>G.rad(30+sign*i*10)),pts=angles.map(a=>({x:p.x+radius*Math.cos(a),y:p.y+radius*Math.sin(a)})),end=pts.at(-1),a=angles.at(-1),ux=-sign*Math.sin(a),uy=sign*Math.cos(a),color=speedColor(Math.abs(omega),maxSpeed);
        content+=`<g data-motion-arrow="angular" pointer-events="none"><polyline points="${pts.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${2/s}"/><path d="M ${end.x+(-ux*7-uy*4)/s} ${end.y+(-uy*7+ux*4)/s} L ${end.x} ${end.y} l ${(-ux*7+uy*4)/s} ${(-uy*7-ux*4)/s}" fill="none" stroke="${color}" stroke-width="${2/s}"/>${text(p,`${omega.toFixed(2)} rad/s`,color,0,42,11)}</g>`;
      }}
      const h=state.hoverSample;if(h){const value=K.value(state,h,h);content+=`<circle cx="${h.x}" cy="${h.y}" r="${6/s}" fill="white" stroke="${Number.isFinite(value)?speedColor(Math.abs(value),maxSpeed):'#a6b2c4'}" stroke-width="${2/s}" pointer-events="none"/>`;}
    }
    if(!model.nodes.length&&!state.loopDraft?.length)content+=text({x:-view.x/s,y:view.y/s},'点击“铰点”、“连杆”或“闭合回路”，开始搭建你的机构','#a0aec0',0,0,15);
    if(state.showDimensions)content+=root.JiGou.drafting?.svg(state.drawing,pos,s)||'';
    for(const id of state.measureDraft||[]){const p=pos[id];if(p)content+=`<circle data-measure-pick="${id}" cx="${p.x}" cy="${p.y}" r="${13/s}" fill="none" stroke="#b57925" stroke-width="${2/s}" pointer-events="none"/>`;}
    stage.innerHTML=content+'</g>';
    stage.setAttribute('viewBox',`0 0 ${w} ${h}`);
  }
  function fit(stage,model,state,view,includeTraces=false){
    const points=[...Object.values(M.positions(model,state.positions)),...root.JiGou.gears.extents(model,state.positions),...root.JiGou.cams.extents(model,state.positions)];
    points.push(...(root.JiGou.drafting?.backgroundPoints(state.drawing?.background)||[]));
    for(const rail of model.sliders){const f=M.railPose(model,rail,state.positions),b=M.railBounds(model,rail,state.positions,state.railRanges);for(const q of [b.min,b.max])points.push({x:f.origin.x+q*f.u.x,y:f.origin.y+q*f.u.y});if(state.selection?.type==='sliders'&&state.selection.id===rail.id)points.push(f.origin);}
    if(includeTraces&&state.showTraces){for(const n of M.observers(model).filter(n=>n.trace))points.push(...(state.traces[n.id]||[]));if(model.synthesis)points.push(...model.synthesis.target.points);}
    if(!points.length){view.scale=2;view.x=view.y=0;return;}
    const [minX,maxX,minY,maxY]=points.reduce((b,p)=>[Math.min(b[0],p.x),Math.max(b[1],p.x),Math.min(b[2],p.y),Math.max(b[3],p.y)],[Infinity,-Infinity,Infinity,-Infinity]);
    const w=stage.clientWidth,h=stage.clientHeight;
    view.scale=G.clamp(Math.min((w-130)/Math.max(100,maxX-minX),(h-140)/Math.max(90,maxY-minY)),0.1,8);
    view.x=-(minX+maxX)/2*view.scale;view.y=(minY+maxY)/2*view.scale;
  }
  function world(stage,view,event){const r=stage.getBoundingClientRect();return{x:(event.clientX-r.left-r.width/2-view.x)/view.scale,y:-(event.clientY-r.top-r.height/2-view.y)/view.scale};}
  function snapshot(model,state,width=1120,height=650){
    const stage={clientWidth:width,clientHeight:height,innerHTML:'',setAttribute(){}},view={scale:2,x:0,y:0};
    const clean={...state,selection:null,pending:null,pointer:null,snapNode:null,hoverSample:null,hoverLink:null,armBase:null,armDraft:null,loopDraft:[],loopSnap:null,sliderDraft:null,gearDraft:null,meshFirst:null,measureDraft:[],tool:'select'};
    fit(stage,model,clean,view,true);render(stage,model,clean,view);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${stage.innerHTML}</svg>`;
  }
  function thumbnail(model){const pos=M.positions(model),points=[...Object.values(pos),...root.JiGou.gears.extents(model,pos),...root.JiGou.cams.extents(model,pos)],minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),scale=Math.min(64/Math.max(50,maxX-minX),44/Math.max(40,maxY-minY)),x=p=>8+(p.x-minX)*scale,y=p=>52-(p.y-minY)*scale;let out='<svg viewBox="0 0 80 60" aria-hidden="true">';if(model.gears?.length)out+=`<g transform="translate(${8-minX*scale} ${52+minY*scale}) scale(${scale} ${-scale})">${root.JiGou.gears.svg(model,pos,{gearThumbnail:true},scale)}</g>`;if(model.cams?.length)out+=`<g transform="translate(${8-minX*scale} ${52+minY*scale}) scale(${scale} ${-scale})">${root.JiGou.cams.svg(model,pos,{gearThumbnail:true},scale)}</g>`;for(const l of model.links)out+=`<path d="M ${x(pos[l.a])} ${y(pos[l.a])} L ${x(pos[l.b])} ${y(pos[l.b])}" stroke="${l.color}"/>`;for(const p of model.attachments)if(p.arm)out+=`<path d="M ${x(pos[p.id].anchor)} ${y(pos[p.id].anchor)} L ${x(pos[p.id])} ${y(pos[p.id])}"/>`;for(const p of model.nodes)out+=`<circle cx="${x(p)}" cy="${y(p)}" r="${p.fixed?2.7:1.8}"/>`;for(const s of model.sliders){const p=pos[s.node],angle=-M.railPose(model,s,pos).angle;out+=`<rect transform="translate(${x(p)} ${y(p)}) rotate(${angle})" x="-4" y="-3" width="8" height="6" rx="1" fill="#e6f6f2"/>`;}return out+'</svg>';}
  root.JiGou.view={render,fit,world,esc,speedColor,speedRange,snapshot,thumbnail};
  if(typeof module!=='undefined')module.exports=root.JiGou.view;
})(globalThis);
