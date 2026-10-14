(function (root) {
  'use strict';
  const G = root.JiGou.geometry;
  const colors = ['#3877e8', '#14a59b', '#e59633', '#9b70d5', '#e16880', '#64768d'];
  function validate(input) {
    if (!input || input.format !== 'jigou-workshop' || ![1,2,3,4,5,6,7,8,9].includes(input.version)) throw new Error('文件格式不匹配，需要机构工坊 v1～v9 JSON 文件。');
    if (!Array.isArray(input.nodes) || !Array.isArray(input.links) || !Array.isArray(input.sliders)) throw new Error('文件缺少铰点、连杆或导轨列表。');
    if (input.nodes.length > 80 || input.links.length > 150 || input.sliders.length > 40) throw new Error('首版最多支持 80 个铰点、150 根连杆和 40 条导轨。');
    const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6;
    const idOK = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id);
    const ids = new Set(), linkIds = new Set();
    if(input.version>=2&&!Array.isArray(input.attachments))throw new Error('文件缺少杆上点和伸出杆列表。');
    if(input.version>=3&&!Array.isArray(input.bodies))throw new Error('文件缺少整体构件列表。');
    if(input.bodies!==undefined&&(!Array.isArray(input.bodies)||input.bodies.length>20))throw new Error('最多支持 20 个整体构件。');
    if(input.attachments!==undefined&&(!Array.isArray(input.attachments)||input.attachments.length>150))throw new Error('最多支持 150 个杆上点或伸出杆。');
    const m = { format: 'jigou-workshop', version: 9, name: String(input.name || '未命名机构').slice(0,80), nodes: [], links: [], sliders: [], attachments: [], bodies: [], gears: [], meshes: [], cams: [], synthesis:null, motor: null };
    for (const n of input.nodes) {
      if (!idOK(n.id) || ids.has(n.id) || !finite(n.x) || !finite(n.y)) throw new Error('铰点 ID 重复或坐标无效。');
      ids.add(n.id);
      m.nodes.push({ id: n.id, name: String(n.name || n.id).slice(0,40), x: n.x, y: n.y, fixed: !!n.fixed, trace: !!n.trace });
    }
    const pairs = new Set();
    for (const l of input.links) {
      const pair = [l.a, l.b].sort().join('|');
      if (!idOK(l.id) || linkIds.has(l.id) || !ids.has(l.a) || !ids.has(l.b) || l.a === l.b || pairs.has(pair) || !finite(l.length) || l.length < 0.1) throw new Error('连杆引用、ID 或长度无效，或存在重复连杆。');
      linkIds.add(l.id); pairs.add(pair);
      m.links.push({ id: l.id, name: String(l.name || l.id).slice(0,40), a: l.a, b: l.b, length: l.length, color: /^#[0-9a-fA-F]{6}$/.test(l.color) ? l.color : colors[m.links.length % colors.length] });
    }
    for(const l of input.links.filter(l=>l.rotor)){if(input.version<6)throw new Error('齿轮参考杆需要 v6 格式。');m.links.find(p=>p.id===l.id).rotor=true;}
    for(const source of input.nodes.filter(n=>n.onLink!==undefined)){
      const pin=source.onLink,l=pin&&m.links.find(l=>l.id===pin.link),n=m.nodes.find(n=>n.id===source.id);
      if(input.version<4||!pin||!l||[l.a,l.b].includes(n.id)||!finite(pin.t)||pin.t<=0||pin.t>=1||Math.min(pin.t,1-pin.t)*l.length<.1)throw new Error('杆上铰点需要 v4 格式、有效母杆和距端点至少 0.1 mm 的连接位置。');
      n.onLink={link:l.id,t:pin.t};
    }
    const visiting=new Set(),visited=new Set();
    function checkPin(n){if(visited.has(n.id))return;if(visiting.has(n.id))throw new Error('杆上铰点的母杆依赖不能构成循环。');visiting.add(n.id);if(n.onLink){const l=m.links.find(l=>l.id===n.onLink.link);for(const id of [l.a,l.b])checkPin(m.nodes.find(n=>n.id===id));}visiting.delete(n.id);visited.add(n.id);}
    for(const n of m.nodes)checkPin(n);
    for(const n of m.nodes.filter(n=>n.onLink)){const l=m.links.find(l=>l.id===n.onLink.link),a=m.nodes.find(n=>n.id===l.a),b=m.nodes.find(n=>n.id===l.b),t=n.onLink.t;if(G.distance(n,{x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t})>1e-4)throw new Error('杆上铰点坐标与母杆连接位置不一致。');}
    const bodyIds=new Set(),bodyEdges=new Set();
    // Only migrate the recognisable built-in legacy Jansen example, never arbitrary loops.
    const legacyJansen=input.version<3&&!input.bodies&&input.name==='Jansen 行走机构'&&m.nodes.length===8&&m.links.length===11
      &&m.nodes.filter(n=>n.fixed).map(n=>n.id).sort().join('|')==='A|O'
      &&[['L2','O','C','上摇杆 b'],['L3','O','D','上三角边 d'],['L4','C','D','上三角边 e'],['L9','E','F','足部三角边 g'],['L10','F','H','足部三角边 h'],['L11','E','H','足部三角边 i']].every(([id,a,b,name])=>m.links.some(l=>l.id===id&&l.a===a&&l.b===b&&l.name===name));
    const outlines=legacyJansen?[{id:'R1',name:'上部刚性三角 O-C-D',nodes:['O','C','D'],color:'#3877e8'},{id:'R2',name:'足部刚性三角 E-F-H',nodes:['E','F','H'],color:'#14a59b'}]:input.bodies||[];
    for(const body of outlines){
      if(!idOK(body.id)||bodyIds.has(body.id)||!Array.isArray(body.nodes)||body.nodes.length<3||body.nodes.length>12||new Set(body.nodes).size!==body.nodes.length||body.nodes.some(id=>!ids.has(id)))throw new Error('整体构件需要 3～12 个不同的轮廓顶点和有效 ID。');
      const points=body.nodes.map(id=>m.nodes.find(n=>n.id===id));
      for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(G.distance(points[i],points[j])<.1)throw new Error('整体构件顶点不能重合，点间距离至少 0.1 mm。');
      let area=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];area+=p.x*q.y-p.y*q.x;}
      if(Math.abs(area)<1e-6)throw new Error('整体构件轮廓不能退化成直线。');
      const edges=body.nodes.map((a,i)=>{const b=body.nodes[(i+1)%body.nodes.length],l=m.links.find(l=>l.a===a&&l.b===b||l.a===b&&l.b===a);if(!l||bodyEdges.has(l.id))throw new Error('整体构件边界需要连杆，同一边不能归属两个整体构件。');if(Math.abs(l.length-G.distance(m.nodes.find(n=>n.id===a),m.nodes.find(n=>n.id===b)))>1e-4)throw new Error('整体构件边长与初始轮廓不一致，请调整顶点坐标。');bodyEdges.add(l.id);return l.id;});
      for(const l of m.links.filter(l=>body.nodes.includes(l.a)&&body.nodes.includes(l.b)&&!edges.includes(l.id))){if(bodyEdges.has(l.id))throw new Error('同一杆件不能归属两个整体构件。');if(Math.abs(l.length-G.distance(m.nodes.find(n=>n.id===l.a),m.nodes.find(n=>n.id===l.b)))>1e-4)throw new Error('构件内部杆长与初始轮廓不一致。');bodyEdges.add(l.id);edges.push(l.id);}
      bodyIds.add(body.id);m.bodies.push({id:body.id,name:String(body.name||body.id).slice(0,40),nodes:[...body.nodes],links:edges,color:/^#[0-9a-fA-F]{6}$/.test(body.color)?body.color:colors[m.bodies.length%colors.length]});
    }
    const sliderIds = new Set(), sliderNodes = new Set();
    for (const s of input.sliders) {
      if (!idOK(s.id) || sliderIds.has(s.id) || !ids.has(s.node) || sliderNodes.has(s.node) || !s.origin || !finite(s.origin.x) || !finite(s.origin.y) || !finite(s.angle)) throw new Error('导轨参数无效，或同一个铰点存在多条导轨。');
      sliderIds.add(s.id); sliderNodes.add(s.node);
      m.sliders.push({ id: s.id, node: s.node, origin: { x: s.origin.x, y: s.origin.y }, angle: s.angle });
      const clean=m.sliders.at(-1);
      if(s.guide!==undefined){if(input.version<5||!linkIds.has(s.guide))throw new Error('活动导轨需要 v5 格式和有效母杆。');const host=m.links.find(l=>l.id===s.guide);if([host.a,host.b].includes(s.node)||m.nodes.find(n=>n.id===s.node)?.onLink?.link===s.guide)throw new Error('滑块点不能同时固定在导槽母杆上，请使用独立铰点。');clean.guide=s.guide;}
      if(s.block!==undefined){const block=m.links.find(l=>l.id===s.block);if(input.version<5||!block||!finite(s.blockAngle)||!([block.a,block.b].includes(s.node)||m.nodes.find(n=>n.id===s.node)?.onLink?.link===block.id)||block.id===s.guide||s.guide&&bodyForLink(m,s.guide)?.id===bodyForLink(m,block.id)?.id&&bodyForLink(m,block.id))throw new Error('固连滑块需要有效连接杆、相对角度，并与导轨属于不同构件。');clean.block=s.block;clean.blockAngle=s.blockAngle;}
      if(s.length!==undefined){if(!finite(s.length)||s.length<1)throw new Error('导轨显示长度至少 1 mm。');clean.length=s.length;}
    }
    const attachmentIds=new Set();
    for(const p of input.attachments||[]){
      if(!idOK(p.id)||ids.has(p.id)||attachmentIds.has(p.id)||!linkIds.has(p.link)||!finite(p.t)||p.t<0||p.t>1||!finite(p.along)||!finite(p.normal))throw new Error('杆上点或伸出杆的 ID、母杆或局部坐标无效。');
      const arm=!!p.arm;if(arm&&(Math.hypot(p.along,p.normal)<.1||Math.hypot(p.along,p.normal)>1e6))throw new Error('伸出杆长度范围为 0.1～1000000 mm。');
      if(!arm&&(p.along!==0||p.normal!==0))throw new Error('杆上点必须位于母杆上，偏置请使用伸出杆。');
      attachmentIds.add(p.id);m.attachments.push({id:p.id,name:String(p.name||p.id).slice(0,40),link:p.link,t:p.t,along:p.along,normal:p.normal,arm,trace:!!p.trace});
    }
    if (input.motor) {
      const d = input.motor, l = m.links.find(l => l.id === d.link), pivot = m.nodes.find(n => n.id === d.pivot);
      if (!l || d.pivot!==null&&(!pivot||!pivot.fixed||![l.a,l.b].includes(d.pivot)) || d.pivot===null&&input.version<5 || !finite(d.initialAngle) || !finite(d.rpm) || Math.abs(d.rpm) > 300) throw new Error('角度输入需要有效连杆；转速或摆动频率范围为 −300～300。');
      if(pivot&&m.nodes.find(n=>n.id===(l.a===pivot.id?l.b:l.a)).fixed||!pivot&&[l.a,l.b].every(id=>m.nodes.find(n=>n.id===id).fixed))throw new Error('固定构件不能作为运动输入。');
      m.motor = { link: d.link, pivot: d.pivot, initialAngle: d.initialAngle, rpm: d.rpm };
      if(d.sampleTurns!==undefined){if(input.version<6||!Number.isInteger(d.sampleTurns)||d.sampleTurns<1||d.sampleTurns>300)throw new Error('轨迹采样圈数为 1～300。');m.motor.sampleTurns=d.sampleTurns;}
      if(d.mode!==undefined&&!['rotate','swing'].includes(d.mode))throw new Error('输入模式无效。');
      if(d.mode==='swing'){
        if(input.version<5||!finite(d.minAngle)||!finite(d.maxAngle)||d.maxAngle-d.minAngle<.1||d.maxAngle-d.minAngle>360||d.initialAngle<d.minAngle-1e-6||d.initialAngle>d.maxAngle+1e-6)throw new Error('区间摆动需要 v5 格式，起始角度在范围内，摆幅为 0.1～360°。');
        Object.assign(m.motor,{mode:'swing',minAngle:d.minAngle,maxAngle:d.maxAngle});
        if(d.initialPhase!==undefined){if(!finite(d.initialPhase)||Math.abs((d.minAngle+d.maxAngle)/2+(d.maxAngle-d.minAngle)/2*Math.sin(G.rad(d.initialPhase))-d.initialAngle)>1e-4)throw new Error('摆动相位与起始角度不一致。');m.motor.initialPhase=d.initialPhase;}
      }
    }
    if(input.version>=6&&(!Array.isArray(input.gears)||!Array.isArray(input.meshes)))throw new Error('文件缺少齿轮或啮合列表。');
    (root.JiGou.gears||(typeof require==='function'?require('./gears.js'):null)).validate(input,m);
    (root.JiGou.cams||(typeof require==='function'?require('./cams.js'):null)).validate(input,m);
    if(input.synthesis!=null){if(input.version<9&&['fivebar','planetary'].includes(input.synthesis.settings?.family))throw new Error('新增合成类型需要 v9 机构文件，请使用机构工坊 2.1。');if(input.version<8)throw new Error('轨迹合成设计需要 v8 机构文件，请使用机构工坊 2.0。');m.synthesis=(root.JiGou.synthesis||(typeof require==='function'?require('./synthesis.js'):null)).metadata(input.synthesis);}
    return m;
  }
  function empty() { return { format: 'jigou-workshop', version: 9, name: '我的新机构', nodes: [], links: [], sliders: [], attachments: [], bodies: [], gears: [], meshes: [], cams: [], synthesis:null, motor: null }; }
  function jansenExample(){
    // Jansen's published proportions, with a=38 and l=7.8 as ground offsets.
    // Upper rigid triangle O-C-D and foot triangle E-F-H use three bars each.
    const m=empty(),angle=40,O={x:0,y:0},A={x:38,y:7.8};
    const B={x:A.x+15*Math.cos(G.rad(angle)),y:A.y+15*Math.sin(G.rad(angle))};
    const C=G.circles(O,41.5,B,50)[0],D=G.circles(O,40.1,C,55.8)[0];
    const E=G.circles(O,39.3,B,61.9)[1],F=G.circles(D,39.4,E,36.7)[1],H=G.circles(F,65.7,E,49)[1];
    m.name='Jansen 行走机构';
    m.nodes=Object.entries({O,A,B,C,D,E,F,H}).map(([id,p])=>({id,name:id==='O'?'固定支点 O':id==='A'?'曲柄轴 A':id==='H'?'足端 H':id,x:p.x,y:p.y,fixed:id==='O'||id==='A',trace:id==='H'}));
    const rods=[['A','B',15,'输入曲柄 m'],['O','C',41.5,'上摇杆 b'],['O','D',40.1,'上三角边 d'],['C','D',55.8,'上三角边 e'],['B','C',50,'上连杆 j'],['O','E',39.3,'下摇杆 c'],['B','E',61.9,'下连杆 k'],['D','F',39.4,'传动连杆 f'],['E','F',36.7,'足部三角边 g'],['F','H',65.7,'足部三角边 h'],['E','H',49,'足部三角边 i']];
    m.links=rods.map(([a,b,length,name],i)=>({id:'L'+(i+1),a,b,length,name,color:colors[i%colors.length]}));
    m.bodies=[{id:'R1',name:'上部刚性三角 O-C-D',nodes:['O','C','D'],color:'#3877e8'},{id:'R2',name:'足部刚性三角 E-F-H',nodes:['E','F','H'],color:'#14a59b'}];
    m.motor={link:'L1',pivot:'A',initialAngle:angle,rpm:12};
    return validate(m);
  }
  function example(type) {
    if(['camtranslate','camrocker'].includes(type))return(root.JiGou.cams||require('./cams.js')).example(type);
    if(['externalgear','internalgear','worm','geartrain','planetary','flapping'].includes(type))return(root.JiGou.gears||require('./gears.js')).example(type);
    if(type==='jansen')return jansenExample();
    if(['doublecrank','doublerocker','rotguide','movingguide','rockblock','sine','doubleslider','doubleblock','pantograph'].includes(type))return extendedExample(type);
    const m = empty(), node = (id, x, y, fixed = false, trace = false) => m.nodes.push({id,name:id,x,y,fixed,trace});
    const link = (id, a, b, name) => m.links.push({id,a,b,name,length:G.distance(m.nodes.find(n=>n.id===a),m.nodes.find(n=>n.id===b)),color:colors[m.links.length%colors.length]});
    const angle = 40, B = { x: 45*Math.cos(G.rad(angle)), y: 45*Math.sin(G.rad(angle)) };
    node('A',0,0,true); node('B',B.x,B.y);
    if (type === 'slider') {
      m.name = '曲柄滑块';
      const C = G.circleLine(B,155,{x:0,y:0},0)[0];
      node('C',C.x,C.y,false,true);
      link('L1','A','B','输入曲柄'); link('L2','B','C','连杆');
      m.sliders.push({id:'S1',node:'C',origin:{x:0,y:0},angle:0});
    } else {
      m.name = type === 'multi' ? '多杆轨迹机构' : '曲柄摇杆';
      const D = {x:160,y:0}, C = G.circles(B,150,D,100)[0];
      node('C',C.x,C.y,false,true); node('D',D.x,D.y,true);
      link('L1','A','B','输入曲柄'); link('L2','B','C','连杆'); link('L3','D','C','输出摇杆');
      if (type === 'multi') {
        m.nodes.find(n=>n.id==='C').trace=false;
        const E = {x:B.x+0.48*(C.x-B.x)-0.38*(C.y-B.y),y:B.y+0.48*(C.y-B.y)+0.38*(C.x-B.x)};
        const H = {x:-70,y:-70}, F = G.circles(E,170,H,140)[0];
        node('E',E.x,E.y); node('F',F.x,F.y,false,true); node('H',H.x,H.y,true);
        link('L4','B','E','三角构件边 1'); link('L5','C','E','三角构件边 2'); link('L6','E','F','延伸连杆'); link('L7','H','F','末端摇杆');
      }
    }
    m.motor = {link:'L1',pivot:'A',initialAngle:angle,rpm:12};
    if(type==='attached'){
      m.name='杆上点与伸出杆';m.nodes.find(n=>n.id==='C').trace=false;
      m.attachments=[{id:'T1',name:'杆上点 T1',link:'L2',t:.5,along:0,normal:0,arm:false,trace:true},{id:'T2',name:'垂直伸出端 T2',link:'L2',t:.5,along:0,normal:50,arm:true,trace:true},{id:'T3',name:'侧向伸出端 T3',link:'L2',t:.72,along:35,normal:-35,arm:true,trace:true}];
    }
    return validate(m);
  }
  function extendedExample(type){
    const m=empty(),node=(id,p,fixed=false,trace=false)=>{m.nodes.push({id,name:id,x:p.x,y:p.y,fixed,trace});return p;},get=id=>m.nodes.find(n=>n.id===id),rod=(id,a,b,name)=>m.links.push({id,a,b,name,color:colors[m.links.length%colors.length],length:G.distance(get(a),get(b))}),polar=(p,r,angle)=>({x:p.x+r*Math.cos(G.rad(angle)),y:p.y+r*Math.sin(G.rad(angle))}),drive=(link,pivot,angle=40)=>m.motor={link,pivot,initialAngle:angle,rpm:12};
    if(type==='doublecrank'||type==='doublerocker'){
      const rocker=type==='doublerocker',angle=rocker?45:40,A=node('A',{x:0,y:0},true),D=node('D',{x:rocker?140:40,y:0},true),B=node('B',polar(A,70,angle),false,true),C=node('C',G.circles(B,90,D,rocker?60:80)[0],false,true);
      rod('L1','A','B','主动件');rod('L2','B','C','连杆');rod('L3','D','C',rocker?'输出摇杆':'输出曲柄');drive('L1','A',angle);m.name=rocker?'双摇杆机构':'双曲柄机构';if(rocker)Object.assign(m.motor,{mode:'swing',minAngle:20,maxAngle:70});
    }else if(type==='rotguide'||type==='rockblock'){
      const rotating=type==='rotguide',A=node('A',{x:0,y:0},true),B=node('B',polar(A,rotating?70:45,40),false,true),D=node('D',{x:rotating?40:130,y:0},true);rod('L1','A','B','输入曲柄');
      if(rotating){const a=G.deg(Math.atan2(B.y-D.y,B.x-D.x));node('E',polar(D,130,a),false,true);rod('L2','D','E','转动槽杆');m.sliders.push({id:'S1',node:'B',guide:'L2',origin:{x:0,y:0},angle:0,length:260});}
      else{const a=G.deg(Math.atan2(D.y-B.y,D.x-B.x));node('C',polar(B,210,a),false,true);rod('L2','B','C','穿过摇块的导杆');m.sliders.push({id:'S1',node:'D',guide:'L2',origin:{x:0,y:0},angle:0,length:260});}
      drive('L1','A');m.name=rotating?'转动导杆机构':'曲柄摇块机构';
    }else if(type==='movingguide'){
      const A=node('A',{x:0,y:0},true),B=node('B',polar(A,45,40)),C=node('C',G.circleLine(B,155,{x:0,y:0},0)[0],false,true);node('E',{x:C.x+180,y:0},false,true);rod('L1','A','B','输入曲柄');rod('L2','B','C','连接杆');rod('L3','C','E','移动导杆');m.sliders.push({id:'S1',node:'C',origin:{x:220,y:0},angle:0,block:'L3',blockAngle:0,length:90});drive('L1','A');m.name='移动导杆机构（定块）';
    }else if(type==='sine'){
      const A=node('A',{x:0,y:0},true),B=node('B',polar(A,40,40),false,true);node('C',{x:B.x,y:-80},false,true);node('D',{x:B.x,y:80});rod('L1','A','B','输入曲柄');rod('L2','C','D','平移槽杆');m.sliders.push({id:'S1',node:'C',origin:{x:0,y:-80},angle:0,block:'L2',blockAngle:90,length:180},{id:'S2',node:'B',guide:'L2',origin:{x:0,y:0},angle:0,length:200});drive('L1','A');m.name='正弦机构';
    }else if(type==='doubleslider'){
      node('B',{x:-140*Math.cos(G.rad(40)),y:0},false,true);node('C',{x:0,y:140*Math.sin(G.rad(40))},false,true);rod('L1','B','C','椭圆仪连杆');m.sliders.push({id:'S1',node:'B',origin:{x:0,y:0},angle:0,length:350},{id:'S2',node:'C',origin:{x:0,y:0},angle:90,length:350});m.attachments.push({id:'T1',name:'椭圆轨迹点',link:'L1',t:.35,along:0,normal:0,arm:false,trace:true});drive('L1',null);m.name='双滑块机构（椭圆仪）';
    }else if(type==='doubleblock'){
      const A=node('A',{x:0,y:0},true),D=node('D',{x:120,y:0},true),angle=40,u={x:Math.cos(G.rad(angle)),y:Math.sin(G.rad(angle))};node('B',polar(A,22,angle));node('F',polar(D,22,angle+90));const C=node('C',{x:120*u.x*u.x,y:120*u.x*u.y},false,true);node('E',polar(C,90,angle),false,true);rod('L1','A','B','主动转块');rod('L2','D','F','从动转块');rod('L3','C','E','十字导槽构件');m.sliders.push({id:'S1',node:'A',guide:'L3',origin:{x:0,y:0},angle:0,block:'L1',blockAngle:0,length:300},{id:'S2',node:'D',guide:'L3',origin:{x:0,y:0},angle:90,block:'L2',blockAngle:0,length:280});drive('L1','A');m.name='双转块机构';
    }else{
      const O=node('O',{x:0,y:0},true),F=node('F',{x:70,y:60},true),B=node('B',polar(F,20,40),false,true),A=node('A',G.circles(O,60,B,90)[0]),D=node('D',{x:2*A.x,y:2*A.y}),C=node('C',{x:D.x+B.x-A.x,y:D.y+B.y-A.y});rod('L1','F','B','输入曲柄');rod('L2','O','D','基准长杆');get('A').onLink={link:'L2',t:.5};rod('L3','A','B','平行杆 1');rod('L4','B','C','平行杆 2');rod('L5','D','C','输出延伸母杆');m.attachments.push({id:'T1',name:'放大输出 Q（2 倍）',link:'L5',t:1,along:90,normal:0,arm:true,trace:true});drive('L1','F');m.name='位移缩放机构（2 倍缩放仪）';get('B').name='输入轨迹点 P';
    }
    return validate(m);
  }
  const catalog=[['fourbar','曲柄摇杆','旋转 → 往复摆动'],['doublecrank','双曲柄机构','两个连架杆整周旋转'],['doublerocker','双摇杆机构','20°～70° 平滑往返输入'],['slider','曲柄滑块','旋转 → 直线往复'],['rotguide','转动导杆机构','滑块沿活动槽杆移动'],['movingguide','移动导杆机构','导杆与滑块固连、沿机架移动'],['rockblock','曲柄摇块机构','固定铰接摇块、导杆穿过'],['sine','正弦机构','两个移动副、正弦直线输出'],['doubleslider','双滑块机构','两个垂直导轨、椭圆轨迹'],['doubleblock','双转块机构','两转块与十字导槽'],['pantograph','位移缩放机构','输出轨迹与位移为输入的 2 倍'],['multi','多杆轨迹','闭环连接与末端轨迹'],['attached','杆上点与伸出杆','刚性附着与运动学分析'],['jansen','Jansen 行走机构','单腿步态 · 足端闭合轨迹'],['externalgear','外啮合齿轮','20 → 40 齿 · i = −2'],['internalgear','内啮合齿轮','20 → 80 齿 · i = +4'],['worm','阿基米德圆柱蜗杆传动','ZA 型简图 · 1 头 → 40 齿 · i = +40'],['geartrain','复合定轴轮系','两级减速 · 同轴固连 · i = +6'],['planetary','行星轮系','40 / 20 / 80 齿 · 齿圈固定 · i = +3'],['flapping','齿轮连杆扑翼机','外啮合同步齿轮与左右翼摇杆'],['camtranslate','直动从动件平面凸轮','滚子直动 · 推程、停歇与回程'],['camrocker','摆动从动件平面凸轮','滚子摆杆 · 定制轮廓与摆角']];
  function observers(model){return [...model.nodes.map(n=>({...n,type:'nodes'})),...(model.attachments||[]).map(p=>({...p,type:'attachments'}))];}
  function frame(model,linkId,positions){
    const link=model.links.find(l=>l.id===linkId),pos=positions||Object.fromEntries(model.nodes.map(n=>[n.id,n]));
    if(!link)return null;const a=pos[link.a],b=pos[link.b],length=G.distance(a,b);
    const u={x:(b.x-a.x)/Math.max(length,1e-12),y:(b.y-a.y)/Math.max(length,1e-12)};
    return {a,b,u,n:{x:-u.y,y:u.x},length};
  }
  function attachmentPose(model,p,positions){
    const f=frame(model,p.link,positions),anchor={x:f.a.x+(f.b.x-f.a.x)*p.t,y:f.a.y+(f.b.y-f.a.y)*p.t};
    return {anchor,x:anchor.x+f.u.x*p.along+f.n.x*p.normal,y:anchor.y+f.u.y*p.along+f.n.y*p.normal};
  }
  function positions(model,base){
    const result={...(base||Object.fromEntries(model.nodes.map(n=>[n.id,n])))};
    for(const p of model.attachments||[])result[p.id]=attachmentPose(model,p,result);
    return result;
  }
  function referenceLinks(model,point){return point.type==='attachments'?[model.links.find(l=>l.id===point.link)]:model.links.filter(l=>l.a===point.id||l.b===point.id||l.id===model.nodes.find(n=>n.id===point.id)?.onLink?.link);}
  function railPose(model,rail,positions){
    const f=rail.guide&&frame(model,rail.guide,positions),angle=rail.angle+(f?G.deg(Math.atan2(f.u.y,f.u.x)):0),a=G.rad(angle),u={x:Math.cos(a),y:Math.sin(a)};
    const origin=f?{x:f.a.x+f.u.x*rail.origin.x+f.n.x*rail.origin.y,y:f.a.y+f.u.y*rail.origin.x+f.n.y*rail.origin.y}:rail.origin;
    return{origin,u,n:{x:-u.y,y:u.x},angle,parent:f};
  }
  function railProjection(model,rail,point,positions){
    const f=railPose(model,rail,positions),q=(point.x-f.origin.x)*f.u.x+(point.y-f.origin.y)*f.u.y;
    return{x:f.origin.x+q*f.u.x,y:f.origin.y+q*f.u.y,q};
  }
  function railTravel(model,frames,seed={}){
    const result=Object.fromEntries(Object.entries(seed).map(([id,r])=>[id,{...r}]));
    for(const frame of frames){const pos=frame.positions||frame;for(const rail of model.sliders){const point=pos[rail.node];if(!point)continue;const q=railProjection(model,rail,point,pos).q;if(!Number.isFinite(q))continue;const r=result[rail.id]||(result[rail.id]={min:q,max:q});r.min=Math.min(r.min,q);r.max=Math.max(r.max,q);}}
    return result;
  }
  function railBounds(model,rail,positions,ranges={},padding=8){
    const pos=positions||Object.fromEntries(model.nodes.map(n=>[n.id,n])),q=railProjection(model,rail,pos[rail.node],pos).q,r=ranges?.[rail.id],min=Math.min(q,r?.min??q),max=Math.max(q,r?.max??q),center=(min+max)/2,half=Math.max(rail.length||260,max-min+2*padding)/2;
    return{min:center-half,max:center+half,travelMin:min,travelMax:max};
  }
  function syncPins(model){
    const done=new Set(),moved=[];function sync(n){if(done.has(n.id))return;if(n.onLink){const l=model.links.find(l=>l.id===n.onLink.link),a=model.nodes.find(n=>n.id===l.a),b=model.nodes.find(n=>n.id===l.b);sync(a);sync(b);const t=n.onLink.t,x=a.x*(1-t)+b.x*t,y=a.y*(1-t)+b.y*t;if(Math.hypot(n.x-x,n.y-y)>1e-10)moved.push(n.id);n.x=x;n.y=y;}done.add(n.id);}for(const n of model.nodes)sync(n);return moved;
  }
  function addPin(model,linkId,t){
    const l=model.links.find(l=>l.id===linkId);if(!l)throw new Error('请先选择母杆。');
    if(t*l.length<.1)return l.a;if((1-t)*l.length<.1)return l.b;
    const existing=model.nodes.find(n=>n.onLink?.link===linkId&&Math.abs(n.onLink.t-t)*l.length<.1);if(existing)return existing.id;
    const id=M.nextId(observers(model),'J'),a=model.nodes.find(n=>n.id===l.a),b=model.nodes.find(n=>n.id===l.b);model.nodes.push({id,name:`杆上铰点 ${id}`,x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t,fixed:false,trace:true,onLink:{link:linkId,t}});return id;
  }
  function prune(model){
    let previous;do{previous=model.nodes.length+model.links.length;model.links=model.links.filter(l=>model.nodes.some(n=>n.id===l.a)&&model.nodes.some(n=>n.id===l.b));model.nodes=model.nodes.filter(n=>!n.onLink||model.links.some(l=>l.id===n.onLink.link));}while(previous!==model.nodes.length+model.links.length);
    model.sliders=model.sliders.filter(s=>model.nodes.some(n=>n.id===s.node));model.attachments=model.attachments.filter(p=>model.links.some(l=>l.id===p.link));
    model.sliders=model.sliders.filter(s=>(!s.guide||model.links.some(l=>l.id===s.guide))&&(!s.block||model.links.some(l=>l.id===s.block)));
    model.bodies=model.bodies.filter(b=>b.nodes.every(n=>model.nodes.some(p=>p.id===n))&&b.nodes.every((a,i)=>model.links.some(l=>[l.a,l.b].includes(a)&&[l.a,l.b].includes(b.nodes[(i+1)%b.nodes.length]))));
    model.gears=(model.gears||[]).filter(g=>model.links.some(l=>l.id===g.link)&&model.nodes.some(n=>n.id===g.center));model.meshes=(model.meshes||[]).filter(s=>model.gears.some(g=>g.id===s.a)&&model.gears.some(g=>g.id===s.b)&&(!s.carrier||model.links.some(l=>l.id===s.carrier)));
    model.cams=(model.cams||[]).filter(c=>model.links.some(l=>l.id===c.link)&&model.nodes.some(n=>n.id===c.center)&&model.nodes.some(n=>n.id===c.node)&&(c.type==='translate'?model.sliders.some(s=>s.id===c.guide):model.links.some(l=>l.id===c.followerLink)&&model.nodes.some(n=>n.id===c.pivot)));
    if(model.motor&&!model.links.some(l=>l.id===model.motor.link))model.motor=null;
  }
  function bodyForLink(model,id){return (model.bodies||[]).find(b=>b.links.includes(id));}
  // Invisible pair distances lock the entire outline; they are not rods or joints.
  function constraintLinks(model){
    const result=[...model.links],pairs=new Set(result.map(l=>[l.a,l.b].sort().join('|'))),nodes=new Map(model.nodes.map(n=>[n.id,n]));
    for(const body of model.bodies||[])for(let i=0;i<body.nodes.length;i++)for(let j=i+1;j<body.nodes.length;j++){
      const a=body.nodes[i],b=body.nodes[j],pair=[a,b].sort().join('|');if(pairs.has(pair))continue;
      pairs.add(pair);result.push({a,b,length:G.distance(nodes.get(a),nodes.get(b)),body:body.id});
    }
    return result;
  }
  function mobility(model) {
    const nodes = new Map(model.nodes.map(n => [n.id, n]));
    const bodies=model.bodies||[],grouped=new Set(bodies.flatMap(b=>b.links));
    const components=[...bodies.map(b=>({id:'body:'+b.id,type:'body',nodes:[...b.nodes,...model.nodes.filter(n=>n.onLink&&b.links.includes(n.onLink.link)).map(n=>n.id)]})),...model.links.filter(l=>!grouped.has(l.id)).map(l=>({id:'link:'+l.id,type:'rod',nodes:[l.a,l.b,...model.nodes.filter(n=>n.onLink?.link===l.id).map(n=>n.id)]}))];
    const active=components.filter(c=>c.nodes.filter(id=>nodes.get(id).fixed).length<2),rods=active.filter(c=>c.type==='rod'),activeBodies=active.filter(c=>c.type==='body');
    const groundNodes=new Set(model.nodes.filter(n=>n.fixed).map(n=>n.id));
    for(const c of components.filter(c=>!active.includes(c)))for(const id of c.nodes)groundNodes.add(id);
    const member=l=>components.find(c=>c.id==='link:'+l||c.id==='body:'+bodyForLink(model,l)?.id),ground=c=>!c||!active.includes(c);
    const pairs=model.sliders.filter(s=>{const host=member(s.guide);return s.block?!(ground(member(s.block))&&ground(host)):!nodes.get(s.node).fixed||!ground(host);});
    const sliders = pairs.filter(s=>!s.block);
    const joints = model.nodes.map(node => {
      const count = active.filter(c=>c.nodes.includes(node.id)).length
        + (sliders.some(s => s.node === node.id) ? 1 : 0) + (groundNodes.has(node.id) ? 1 : 0);
      return {id:node.id, name:node.name, rotational:Math.max(0,count-1),bodyPoint:!node.onLink&&count===1&&components.some(c=>c.type==='body'&&c.nodes.includes(node.id))};
    });
    const n = rods.length + activeBodies.length + sliders.length, rotational = joints.reduce((sum,j) => sum+j.rotational,0);
    const prismatic = pairs.length, lower = rotational + prismatic, higher = (model.meshes||[]).length+(model.cams||[]).length;
    const isolated = model.nodes.filter(p => !p.fixed && !p.onLink && !model.links.some(l => l.a===p.id || l.b===p.id) && !sliders.some(s => s.node===p.id)).length;
    return {n, gearRods:rods.filter(c=>(model.gears||[]).some(g=>'link:'+g.link===c.id)).length, rods:rods.length, bodies:activeBodies.length, sliders:sliders.length, rotational, prismatic, lower, higher, dof:3*n-2*lower-higher, joints, isolated};
  }
  const M = { validate, empty, example, catalog, mobility, railPose, railProjection, railTravel, railBounds, bodyForLink, constraintLinks, syncPins, addPin, prune, observers, frame, attachmentPose, positions, referenceLinks, colors, nextId(items,prefix) { let i=1; while(items.some(x=>x.id===prefix+i)) i++; return prefix+i; } };
  root.JiGou.model = M;
  if (typeof module !== 'undefined') module.exports = M;
})(globalThis);
