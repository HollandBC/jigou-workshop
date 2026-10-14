(function(root){
  'use strict';
  const {geometry:G,model:M}=root.JiGou;
  const TAU=2*Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const defaults={type:'translate',source:'parametric',baseRadius:40,rollerRadius:5,lift:25,swing:24,rise:120,dwell:60,fall:120,law:'cycloidal',offset:0,axisAngle:90,pivotX:75,pivotY:0,armLength:65,side:1,zeroAngle:0};
  const laws={cycloidal:'摆线运动',polynomial:'3-4-5 多项式',harmonic:'简谐运动'};
  const cache=new WeakMap();
  const splineCache=new WeakMap();
  const rotate=(p,a)=>({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)});
  const initial=(m,id)=>m.nodes.find(n=>n.id===id);
  function angle(m,c,pos){const l=m.links.find(l=>l.id===c.link),o=pos?.[c.center]||initial(m,c.center),p=pos?.[l.a===c.center?l.b:l.a]||initial(m,l.a===c.center?l.b:l.a);return Math.atan2(p.y-o.y,p.x-o.x)-G.rad(c.zeroAngle);}
  function law(kind,t){
    if(kind==='harmonic')return{v:(1-Math.cos(Math.PI*t))/2,d:Math.PI*Math.sin(Math.PI*t)/2,dd:Math.PI**2*Math.cos(Math.PI*t)/2};
    if(kind==='polynomial')return{v:10*t**3-15*t**4+6*t**5,d:30*t**2*(1-t)**2,dd:60*t-180*t**2+120*t**3};
    return{v:t-Math.sin(TAU*t)/TAU,d:1-Math.cos(TAU*t),dd:TAU*Math.sin(TAU*t)};
  }
  function displacement(c,theta){
    const a=((theta%TAU)+TAU)%TAU,r=G.rad(c.rise),h=G.rad(c.dwell),f=G.rad(c.fall);
    if(a<r){const q=law(c.law,a/r);return{value:q.v,first:q.d/r,second:q.dd/r**2};}
    if(a<r+h)return{value:1,first:0,second:0};
    if(a<r+h+f){const q=law(c.law,(a-r-h)/f);return{value:1-q.v,first:-q.d/f,second:-q.dd/f**2};}
    return{value:0,first:0,second:0};
  }
  function geometry(m,c){
    const o=initial(m,c.center),a=G.rad(c.axisAngle),u={x:Math.cos(a),y:Math.sin(a)},n={x:-u.y,y:u.x};
    if(c.type==='translate')return{o,u,n,base:Math.sqrt((c.baseRadius+c.rollerRadius)**2-c.offset**2)};
    const p=initial(m,c.pivot),dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy),cos=((c.baseRadius+c.rollerRadius)**2-d*d-c.armLength**2)/(2*d*c.armLength);
    if(!d||cos<=-1+1e-7||cos>=1-1e-7)throw new Error('摆杆长度、支点和基圆不能形成有效接触，请调整支点或杆长。');
    return{o,p,base:Math.atan2(dy,dx)+c.side*Math.acos(cos),direction:Math.atan2(dy,dx)};
  }
  // A periodic cubic radial sketch gives one closed, smooth contour around the shaft.
  function radial(c,phi){
    const values=c.radii,N=values.length,t=((phi/TAU*N)%N+N)%N,i=Math.floor(t),f=t-i;
    let second=splineCache.get(c);if(!second){second=new Array(N).fill(0);for(let pass=0;pass<48;pass++)second=second.map((x,j)=>(6*(values[(j+N-1)%N]-2*values[j]+values[(j+1)%N])-second[(j+N-1)%N]-second[(j+1)%N])/4);splineCache.set(c,second);}
    const a=1-f,b=f,p=values[i],q=values[(i+1)%N],u=second[i],v=second[(i+1)%N],k=N/TAU;
    return{r:a*p+b*q+((a**3-a)*u+(b**3-b)*v)/6,dr:(q-p+(-(3*a*a-1)*u+(3*b*b-1)*v)/6)*k,ddr:(a*u+b*v)*k*k};
  }
  function drawnPoint(c,phi,pitch=false){
    const {r,dr}=radial(c,phi),co=Math.cos(phi),si=Math.sin(phi),p={x:r*co,y:r*si};
    if(pitch&&c.rollerRadius){const tx=dr*co-r*si,ty=dr*si+r*co,d=Math.hypot(tx,ty);p.x+=c.rollerRadius*ty/d;p.y-=c.rollerRadius*tx/d;}
    return p;
  }
  function pitchAt(m,c,theta){const g=geometry(m,c),q=displacement(c,theta);let p;
    if(c.type==='translate'){const s=g.base+c.lift*q.value;p={x:g.u.x*s+g.n.x*c.offset,y:g.u.y*s+g.n.y*c.offset};}
    else{const b=g.base-c.side*G.rad(c.swing)*q.value;p={x:g.p.x-g.o.x+c.armLength*Math.cos(b),y:g.p.y-g.o.y+c.armLength*Math.sin(b)};}
    return rotate(p,-theta);
  }
  function data(m,c){
    let value=cache.get(c);if(value)return value;
    const N=720,pitch=[],profile=[];
    if(c.source==='drawn')for(let i=0;i<N;i++){const a=TAU*i/N;pitch.push(drawnPoint(c,a,true));profile.push(drawnPoint(c,a));}
    else{
      for(let i=0;i<N;i++)pitch.push(pitchAt(m,c,TAU*i/N));
      for(let i=0;i<N;i++){const p=pitch[i],a=pitch[(i+N-1)%N],b=pitch[(i+1)%N],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);profile.push({x:p.x+c.rollerRadius*dy/d,y:p.y-c.rollerRadius*dx/d});}
    }
    value={pitch,profile};cache.set(c,value);return value;
  }
  function drawnValue(m,c,theta){
    const g=geometry(m,c),points=data(m,c).pitch,world=p=>rotate(p,theta),evaluate=phi=>world(drawnPoint(c,phi,true));
    const fn=p=>c.type==='translate'?p.x*g.n.x+p.y*g.n.y-c.offset:(p.x-(g.p.x-g.o.x))**2+(p.y-(g.p.y-g.o.y))**2-c.armLength**2;
    const roots=[],N=points.length;
    for(let i=0;i<N;i++){
      let lo=TAU*i/N,hi=TAU*(i+1)/N,fl=fn(world(points[i])),fh=fn(world(points[(i+1)%N]));
      if(fl*fh>0)continue;
      if(Math.abs(fl)<1e-12)hi=lo;else for(let j=0;j<40;j++){const mid=(lo+hi)/2,fm=fn(evaluate(mid));if(fl*fm<=0){hi=mid;fh=fm;}else{lo=mid;fl=fm;}}
      const p=evaluate((lo+hi)/2);
      if(c.type==='translate'){const s=p.x*g.u.x+p.y*g.u.y;if(s>0)roots.push(s);}
      else{const b=Math.atan2(p.y-(g.p.y-g.o.y),p.x-(g.p.x-g.o.x));if(c.side*wrap(b-g.direction)>1e-5)roots.push(g.base+wrap(b-g.base));}
    }
    const unique=roots.filter((v,i)=>!roots.slice(0,i).some(x=>Math.abs(x-v)<1e-6));
    if(!unique.length)throw new Error('手绘轮廓在当前角度无法接触从动件，请调整轮廓、支点或导轨。');
    if(c.type==='oscillate'&&unique.length!==1)throw new Error('手绘轮廓与摆杆存在多重接触，请平滑轮廓或调整支点。');
    return c.type==='translate'?Math.max(...unique):unique[0];
  }
  function target(m,c,theta,derivatives=true){
    const g=geometry(m,c);if(c.source==='parametric'){const d=displacement(c,theta),scale=c.type==='translate'?c.lift:-c.side*G.rad(c.swing);return{value:g.base+scale*d.value,first:scale*d.first,second:scale*d.second};}
    const value=drawnValue(m,c,theta);if(!derivatives)return{value};
    const h=.0005,a=drawnValue(m,c,theta-h),b=drawnValue(m,c,theta+h);return{value,first:(b-a)/(2*h),second:(b-2*value+a)/(h*h)};
  }
  function follower(m,c,theta){const g=geometry(m,c),t=target(m,c,theta,false).value;return c.type==='translate'?{x:g.o.x+g.u.x*t+g.n.x*c.offset,y:g.o.y+g.u.y*t+g.n.y*c.offset}:{x:g.p.x+c.armLength*Math.cos(t),y:g.p.y+c.armLength*Math.sin(t)};}
  function angular(m,id,pos){const l=m.links.find(l=>l.id===id),a=pos[l.a],b=pos[l.b],dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;return{x:-dy/d,y:dx/d};}
  function equations(m,pos,variables){
    const ix=new Map(variables.map((id,i)=>[id,2*i])),residuals=[],jacobian=[];
    for(const c of m.cams||[]){const t=target(m,c,angle(m,c,pos)),row=new Array(2*variables.length).fill(0),add=(id,x,y)=>{if(ix.has(id)){row[ix.get(id)]+=x;row[ix.get(id)+1]+=y;}},p=pos[c.node],o=pos[c.center];
      if(c.type==='translate'){const {u}=geometry(m,c);residuals.push((p.x-o.x)*u.x+(p.y-o.y)*u.y-t.value);add(c.node,u.x,u.y);add(c.center,-u.x,-u.y);}
      else{const a=pos[c.pivot],g=angular(m,c.followerLink,pos);residuals.push(wrap(Math.atan2(p.y-a.y,p.x-a.x)-t.value)*c.armLength);const l=m.links.find(l=>l.id===c.followerLink),sign=l.b===c.node?1:-1;add(c.node,sign*g.x*c.armLength,sign*g.y*c.armLength);add(c.pivot,-sign*g.x*c.armLength,-sign*g.y*c.armLength);}
      const l=m.links.find(l=>l.id===c.link),g=angular(m,c.link,pos),scale=c.type==='translate'?1:c.armLength;add(l.a,t.first*g.x*scale,t.first*g.y*scale);add(l.b,-t.first*g.x*scale,-t.first*g.y*scale);jacobian.push(row);
    }
    return{residuals,jacobian};
  }
  function forcing(m,pos,v,curvature){return(m.cams||[]).map(c=>{const t=target(m,c,angle(m,c,pos)),a=curvature(m,c.link,pos,v),value=t.second*a.omega**2+t.first*a.eta;return c.type==='translate'?value:c.armLength*(value-curvature(m,c.followerLink,pos,v).eta);});}
  function seed(m,pos,known){for(const c of m.cams||[]){const l=m.links.find(l=>l.id===c.link);if(known.has(l.a)&&known.has(l.b)){pos[c.node]=follower(m,c,angle(m,c,pos));known.add(c.node);}}}
  function designCheck(m,c,cycle=true){
    const d=data(m,c),N=d.pitch.length;let minCurvature=Infinity;
    for(let i=0;i<N;i++){const a=d.pitch[(i+N-1)%N],p=d.pitch[i],b=d.pitch[(i+1)%N],v={x:(b.x-a.x)/2,y:(b.y-a.y)/2},w={x:b.x-2*p.x+a.x,y:b.y-2*p.y+a.y},cross=Math.abs(v.x*w.y-v.y*w.x);if(cross>1e-10)minCurvature=Math.min(minCurvature,Math.hypot(v.x,v.y)**3/cross);}
    if(c.rollerRadius&&minCurvature<c.rollerRadius+.1)throw new Error('滚子半径大于局部曲率半径，轮廓可能根切；请加大基圆、减小滚子或平滑轮廓。');
    if(c.source==='drawn'&&cycle){let previous;for(let i=0;i<=360;i+=2){const q=target(m,c,G.rad(i),false).value;if(previous!==undefined&&Math.abs(q-previous)>(c.type==='translate'?15:.25))throw new Error('手绘从动件运动存在跳变，请平滑轮廓或调整安装参数。');previous=q;}}
    return{minCurvature};
  }
  function toRadii(m,c){const points=data(m,c).profile,values=[];for(let i=0;i<360;i++){const a=G.rad(i),u={x:Math.cos(a),y:Math.sin(a)},roots=[];for(let j=0;j<points.length;j++){const p=points[j],q=points[(j+1)%points.length],dx=q.x-p.x,dy=q.y-p.y,den=dx*u.y-dy*u.x;if(Math.abs(den)<1e-12)continue;const t=-(p.x*u.y-p.y*u.x)/den;if(t>=-1e-9&&t<=1+1e-9){const r=(p.x+t*dx)*u.x+(p.y+t*dy)*u.y;if(r>0)roots.push(r);}}if(!roots.length)throw new Error('当前轮廓不能转换为绕轴闭合的手绘轮廓。');values.push(Math.max(...roots));}return values;}
  function validate(input,m){
    const values=input.cams||[];if(!Array.isArray(values)||values.length>10)throw new Error('最多支持 10 个凸轮。');
    if(input.version<7&&values.length)throw new Error('凸轮约束需要 v7 机构文件，请使用机构工坊 1.1。');
    if(input.version>=7&&!Array.isArray(input.cams))throw new Error('文件缺少凸轮列表。');
    const ids=new Set(),followers=new Set();
    for(const raw of values){const c={};for(const key of Object.keys(defaults))c[key]=raw[key]??defaults[key];
      if(!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(raw.id||'')||ids.has(raw.id)||followers.has(raw.node)||!['translate','oscillate'].includes(c.type)||!['parametric','drawn'].includes(c.source)||!Object.hasOwn(laws,c.law))throw new Error('凸轮 ID、从动件或设计类型无效。');
      const ranges={baseRadius:[5,2000],rollerRadius:[0,100],lift:[0,1000],swing:[0,90],rise:[5,350],dwell:[0,350],fall:[5,350],offset:[-2000,2000],axisAngle:[-360,360],pivotX:[-4000,4000],pivotY:[-4000,4000],armLength:[5,4000],zeroAngle:[-1e6,1e6]};
      for(const[k,[lo,hi]]of Object.entries(ranges))if(!Number.isFinite(c[k])||c[k]<lo||c[k]>hi)throw new Error('凸轮参数 '+k+' 超出范围。');
      if(c.rise+c.dwell+c.fall>360||Math.abs(c.offset)>=c.baseRadius+c.rollerRadius||![1,-1].includes(c.side))throw new Error('推程、远休止和回程角之和应不超过 360°，偏距应小于基圆加滚子半径。');
      const center=initial(m,raw.center),l=m.links.find(l=>l.id===raw.link),node=initial(m,raw.node);
      if(!center?.fixed||!l||![l.a,l.b].includes(raw.center)||!node||node.fixed||node.onLink||[l.a,l.b].includes(node.id)||M.bodyForLink(m,l.id)||[l.a,l.b].every(id=>initial(m,id).fixed))throw new Error('凸轮需要固定轴心、可转动参考杆和独立活动从动件节点。');
      Object.assign(c,{id:raw.id,name:String(raw.name||'凸轮').slice(0,40),center:raw.center,link:raw.link,node:raw.node,color:/^#[0-9a-fA-F]{6}$/.test(raw.color)?raw.color:'#9b70d5'});
      if(c.type==='translate'){const guide=m.sliders.find(s=>s.id===raw.guide);if(!guide||guide.node!==c.node||guide.guide||guide.block||Math.abs(wrap(G.rad(guide.angle-c.axisAngle)))>1e-7)throw new Error('直动凸轮需要方向一致的机架导轨。');const {n}=geometry(m,c);if(Math.abs((guide.origin.x-center.x)*n.x+(guide.origin.y-center.y)*n.y-c.offset)>1e-4)throw new Error('凸轮导轨偏距不匹配。');c.guide=guide.id;}
      else{const p=initial(m,raw.pivot),f=m.links.find(l=>l.id===raw.followerLink);if(!p?.fixed||!f||![[f.a,f.b],[f.b,f.a]].some(([a,b])=>a===p.id&&b===node.id)||Math.abs(f.length-c.armLength)>1e-5)throw new Error('摆动凸轮需要固定摆杆支点和正确的从动杆长。');c.pivot=p.id;c.followerLink=f.id;}
      if(c.source==='drawn'){if(!Array.isArray(raw.radii)||raw.radii.length!==360||raw.radii.some(v=>!Number.isFinite(v)||v<5||v>3000))throw new Error('手绘凸轮需要 360 个有效半径采样。');c.radii=[...raw.radii];}
      designCheck(m,c);m.cams.push(c);ids.add(c.id);followers.add(c.node);
    }
  }
  function install(m,settings={},shaft=null){
    const c={...defaults,...settings,id:M.nextId(m.cams,'C'),name:settings.name||'直动从动件凸轮',color:'#9b70d5'};
    const node=(name,p,fixed=false)=>{const id=M.nextId(m.nodes,'P');m.nodes.push({id,name,...p,fixed,trace:false});return id;};
    const rod=(a,b,name,rotor=false)=>{const id=M.nextId(m.links,'L');m.links.push({id,a,b,name,length:G.distance(initial(m,a),initial(m,b)),color:rotor?'#9b70d5':'#14a59b',...(rotor?{rotor:true}:{})});return id;};
    if(shaft){c.center=shaft.center;c.link=shaft.link;const l=m.links.find(l=>l.id===c.link),a=initial(m,c.center),b=initial(m,l.a===c.center?l.b:l.a);c.zeroAngle=G.deg(Math.atan2(b.y-a.y,b.x-a.x));}
    else{c.center=node('凸轮轴 O',{x:settings.centerX||0,y:settings.centerY||0},true);const o=initial(m,c.center),tip=node('凸轮相位 A',{x:o.x+12,y:o.y});c.link=rod(c.center,tip,'凸轮轴相位杆',true);c.zeroAngle=0;m.motor={link:c.link,pivot:c.center,initialAngle:0,rpm:settings.rpm??12};}
    const o=initial(m,c.center);
    if(c.type==='oscillate')c.pivot=node('摆杆支点 B',{x:o.x+c.pivotX,y:o.y+c.pivotY},true);
    const p=follower(m,c,0);c.node=node('从动件 F',p);initial(m,c.node).trace=true;
    if(c.type==='translate'){c.guide=M.nextId(m.sliders,'S');const a=G.rad(c.axisAngle);m.sliders.push({id:c.guide,node:c.node,origin:{x:o.x-Math.sin(a)*c.offset,y:o.y+Math.cos(a)*c.offset},angle:c.axisAngle,length:100});}
    else c.followerLink=rod(c.pivot,c.node,'凸轮从动摆杆');
    m.cams.push(c);return c;
  }
  function example(type){const m=M.empty(),s={type:type==='camrocker'?'oscillate':'translate'};s.name=s.type==='translate'?'直动从动件平面凸轮机构':'摆动从动件平面凸轮机构';install(m,s);m.name=s.name;return M.validate(m);}
  function update(m,id,settings){
    const old=m.cams.find(c=>c.id===id),node=initial(m,old.node),pivot=old.pivot&&initial(m,old.pivot);
    m.cams=m.cams.filter(c=>c.id!==id);m.sliders=m.sliders.filter(s=>s.id!==old.guide);m.links=m.links.filter(l=>l.id!==old.followerLink);
    const fresh=install(m,settings,{center:old.center,link:old.link}),newNode=initial(m,fresh.node),newPivot=fresh.pivot&&initial(m,fresh.pivot),replacements=new Map([[fresh.node,old.node]]);
    Object.assign(node,{x:newNode.x,y:newNode.y});
    if(pivot&&newPivot){Object.assign(pivot,{x:newPivot.x,y:newPivot.y});replacements.set(newPivot.id,pivot.id);}
    for(const l of m.links){l.a=replacements.get(l.a)||l.a;l.b=replacements.get(l.b)||l.b;}
    for(const s of m.sliders)s.node=replacements.get(s.node)||s.node;
    m.nodes=m.nodes.filter(n=>!replacements.has(n.id));fresh.node=old.node;if(fresh.pivot)fresh.pivot=replacements.get(fresh.pivot)||fresh.pivot;fresh.id=id;
    if(pivot&&!newPivot&&!m.links.some(l=>[l.a,l.b].includes(pivot.id)))m.nodes=m.nodes.filter(n=>n.id!==pivot.id);
    M.prune(m);return fresh;
  }
  function moveNode(m,id,point){
    const cams=m.cams||[],owners=cams.filter(c=>c.center===id);
    if(!owners.length){if(cams.some(c=>c.node===id||c.pivot===id||[m.links.find(l=>l.id===c.link).a,m.links.find(l=>l.id===c.link).b].includes(id)))throw new Error('该点受凸轮约束，请在凸轮设计窗口修改安装参数，或用输入角度调整相位。');return false;}
    const before=Object.fromEntries(m.nodes.map(n=>[n.id,{x:n.x,y:n.y}]));
    if(!root.JiGou.gears.moveCenter(m,id,point)){const n=initial(m,id);n.x=point.x;n.y=point.y;}
    for(const c of cams){const center=initial(m,c.center),d={x:center.x-before[c.center].x,y:center.y-before[c.center].y};if(!d.x&&!d.y)continue;const l=m.links.find(l=>l.id===c.link);for(const target of new Set([l.a,l.b,c.node,c.pivot].filter(Boolean))){const n=initial(m,target);n.x=before[target].x+d.x;n.y=before[target].y+d.y;}if(c.guide){const s=m.sliders.find(s=>s.id===c.guide);s.origin.x+=d.x;s.origin.y+=d.y;}}
    return true;
  }
  function extents(m,pos){return(m.cams||[]).flatMap(c=>{const o=pos?.[c.center]||initial(m,c.center),r=Math.max(...data(m,c).profile.map(p=>Math.hypot(p.x,p.y)))+c.rollerRadius+5,points=[{x:o.x-r,y:o.y-r},{x:o.x+r,y:o.y+r}],p=pos?.[c.node]||initial(m,c.node);if(c.type==='translate'){const {u}=geometry(m,c);points.push({x:p.x+42*u.x,y:p.y+42*u.y});}return points;});}
  function svg(m,pos,state={},scale=1){
    const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));let out='';
    for(const c of m.cams||[]){const o=pos?.[c.center]||initial(m,c.center),p=pos?.[c.node]||initial(m,c.node),a=angle(m,c,pos),selected=state.selection?.type==='cams'&&state.selection.id===c.id,d=data(m,c),path=d.profile.map((p,i)=>(i?'L':'M')+p.x.toFixed(3)+' '+p.y.toFixed(3)).join(' ')+'Z';
      out+=`<g data-cam="${c.id}" role="button" tabindex="0" aria-label="凸轮 ${esc(c.name)}" style="cursor:pointer"><g transform="translate(${o.x} ${o.y}) rotate(${G.deg(a)})"><path data-cam-profile="${c.id}" d="${path}" fill="${c.color}" fill-opacity="${selected ? .3 : .14}" stroke="${selected?'#2863df':c.color}" stroke-width="${(selected?3:1.6)/scale}"/>${c.source==='parametric'?`<circle r="${c.baseRadius}" fill="none" stroke="${c.color}" stroke-opacity=".4" stroke-dasharray="${4/scale} ${4/scale}" stroke-width="${.8/scale}"/>`:''}<circle r="${5/scale}" fill="white" stroke="${c.color}" stroke-width="${1.2/scale}"/></g><text transform="translate(${o.x} ${o.y-Math.max(...d.profile.map(p=>Math.hypot(p.x,p.y)))-20/scale}) scale(1 -1)" text-anchor="middle" fill="${c.color}" font-size="${11/scale}" font-family="Microsoft YaHei,Segoe UI,sans-serif" paint-order="stroke" stroke="white" stroke-width="${3/scale}">${esc(c.name)}</text></g>`;
      if(c.type==='translate'){const {u}=geometry(m,c),end={x:p.x+u.x*42,y:p.y+u.y*42};out+=`<path data-cam-stem="${c.id}" d="M ${p.x} ${p.y} L ${end.x} ${end.y}" stroke="#14a59b" stroke-width="${4/scale}"/><path d="M ${end.x-u.y*12} ${end.y+u.x*12} L ${end.x+u.y*12} ${end.y-u.x*12}" stroke="#14a59b" stroke-width="${2/scale}"/>`;}
      if(c.rollerRadius)out+=`<circle data-cam-roller="${c.id}" cx="${p.x}" cy="${p.y}" r="${c.rollerRadius}" fill="white" stroke="#14a59b" stroke-width="${1.7/scale}"/><circle cx="${p.x}" cy="${p.y}" r="${Math.max(1,c.rollerRadius*.42)}" fill="#e3f5f2" stroke="#14a59b" stroke-width="${.8/scale}"/>`;
    }return out;
  }
  const C={defaults,laws,law,displacement,geometry,angle,target,follower,pitchAt,radial,drawnPoint,data,toRadii,validate,designCheck,equations,forcing,seed,install,update,moveNode,example,svg,extents,rotate};root.JiGou.cams=C;if(typeof module!=='undefined')module.exports=C;
})(globalThis);
