(function(root){
  'use strict';
  const {view:V,model:M,motion:K}=root.JiGou;
  const encoder=new TextEncoder();
  function concat(parts){const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;}
  // A small, dependency-free PDF writer. The canvas is embedded as a high-resolution
  // JPEG to preserve Chinese fonts on offline machines without font installation.
  function jpegPDF(jpeg,width,height){
    const parts=[],offsets=[0];let length=0;
    const append=bytes=>{parts.push(bytes);length+=bytes.length;},text=s=>append(encoder.encode(s));
    text('%PDF-1.4\n');append(new Uint8Array([37,226,227,207,211,10]));
    const object=(id,body)=>{offsets[id]=length;text(`${id} 0 obj\n${body}\nendobj\n`);};
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4]=length;text(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);append(jpeg);text('\nendstream\nendobj\n');
    const stream='q\n841.89 0 0 595.28 0 0 cm\n/Im0 Do\nQ\n';
    object(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
    const xref=length;text('xref\n0 6\n0000000000 65535 f \n');
    for(let id=1;id<=5;id++)text(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
    text(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return concat(parts);
  }
  function loadSVG(svg){return new Promise((resolve,reject)=>{
    // Data URL SVGs remain origin-clean when rendered from a file:// offline app.
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('机构图渲染失败。'));
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  });}
  async function pdf(model,state){
    await document.fonts.ready;
    const canvas=document.createElement('canvas');canvas.width=2382;canvas.height=1684;
    const ctx=canvas.getContext('2d'),font='"Microsoft YaHei","Segoe UI",sans-serif';
    if(!ctx)throw new Error('当前浏览器不支持图像导出。');
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#3877e8';ctx.fillRect(100,100,8,62);
    ctx.fillStyle='#202f46';ctx.font=`600 43px ${font}`;
    // Fit long user-supplied titles within the header.
    let title=model.name;while(title.length>1&&ctx.measureText(title).width>1750)title=title.slice(0,-2)+'…';
    ctx.fillText(title,130,147);ctx.font=`24px ${font}`;ctx.fillStyle='#8290a3';ctx.fillText('机构工坊 2.2  /  平面机构与运动轨迹',130,190);
    const angle=model.motor?.mode==='swing'?state.angle:((state.angle%360)+360)%360;
    ctx.textAlign='right';ctx.fillText(`输入角度 ${angle.toFixed(1)}°`,2282,142);ctx.fillText(`${model.motor?.mode==='swing'?'摆动频率':'转速'} ${model.motor?.rpm??0} ${model.motor?.mode==='swing'?'次/分':'rpm'}`,2282,181);ctx.textAlign='left';
    ctx.strokeStyle='#e3e9f1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(100,225);ctx.lineTo(2282,225);ctx.stroke();
    const svg=V.snapshot(model,state,1120,620),img=await loadSVG(svg);
    ctx.drawImage(img,100,250,2182,1208);
    ctx.beginPath();ctx.moveTo(100,1465);ctx.lineTo(2282,1465);ctx.stroke();
    const m=M.mobility(model);ctx.font=`23px ${font}`;ctx.fillStyle='#60758f';
    ctx.fillText(`F = 3n − 2Pₗ − Pₕ = 3 × ${m.n} − 2 × ${m.lower} − ${m.higher} = ${m.dof}`,100,1512);
    ctx.font=`21px ${font}`;ctx.fillText(`活动构件 ${m.n}  /  转动副 ${m.rotational}  /  移动副 ${m.prismatic}  /  高副 ${m.higher}`,100,1550);
    if(model.gears.length){const items=root.JiGou.gears.train(model,state.motion),carrier=[...new Set(model.meshes.filter(s=>s.carrier).map(s=>s.carrier))];let report=items.map(g=>`${g.name}: ${g.fixed?'固定':g.ratio===null?'比值待定':'i='+Number(g.ratio.toFixed(4))}`).join('  /  ');for(const id of carrier){const ratio=root.JiGou.gears.ratios(model)[id];report+=`  /  行星架 i=${ratio?Number((1/ratio).toFixed(4)):'待定'}`;}ctx.font=`19px ${font}`;ctx.fillStyle='#60758f';while(ctx.measureText(report).width>2140)report=report.slice(0,-2);ctx.fillText(report,100,1450);}
    const traces=M.observers(model).filter(n=>n.trace&&(state.traces[n.id]||[]).length>1),hasTrace=state.showTraces&&traces.length,meta=K.metadata[state.metric||'speed'];
    if(hasTrace&&state.showSpeed){
      const x=1560,y=1500,w=540,gradient=ctx.createLinearGradient(x,0,x+w,0);
      for(const t of [0,1/3,2/3,1])gradient.addColorStop(t,V.speedColor(t,1));
      ctx.fillStyle=gradient;ctx.fillRect(x,y,w,15);ctx.fillStyle='#60758f';ctx.font=`21px ${font}`;
      ctx.fillText('0 · 小',x,y+45);ctx.textAlign='right';ctx.fillText(`${V.speedRange(state)} ${meta.unit} · 大`,x+w,y+45);ctx.textAlign='left';
      ctx.font=`20px ${font}`;ctx.fillText(`${meta.name}${state.metric==='angular'?'（颜色按绝对值，逆时针为正）':''}`,x,y-16);
    }
    ctx.font=`20px ${font}`;ctx.fillStyle='#8d9caf';
    let note=hasTrace?`显示轨迹：${traces.map(n=>n.name).join('、')}。灰色虚线表示该处数据不可确定。`:'运动轨迹未开启或尚未记录。';
    while(note.length>1&&ctx.measureText(note).width>1400)note=note.slice(0,-2)+'…';ctx.fillText(note,100,1610);
    ctx.textAlign='right';ctx.fillText('尺寸单位 mm  /  A4 横向  /  图形按页面适配',2282,1610);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
    if(!blob)throw new Error('图像编码失败。');
    return jpegPDF(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height);
  }
  async function chartPDF(svg,title,subtitle,lines,note){
    await document.fonts.ready;
    const canvas=document.createElement('canvas');canvas.width=2382;canvas.height=1684;const ctx=canvas.getContext('2d'),font='Microsoft YaHei,Segoe UI,sans-serif';if(!ctx)throw new Error('当前浏览器不支持图像导出。');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#2e496d';ctx.font=`bold 44px ${font}`;ctx.fillText(String(title).slice(0,40)+' · 函数曲线',100,145);ctx.font=`26px ${font}`;ctx.fillStyle='#71869f';ctx.fillText(subtitle,100,205);
    ctx.drawImage(await loadSVG(svg),100,290,2182,893);
    const rows=Math.ceil(lines.length/3),gap=rows>1?Math.min(90,200/(rows-1)):90;
    for(const [i,line]of lines.entries()){const x=100+(i%3)*735,y=1270+Math.floor(i/3)*gap;ctx.strokeStyle=line.color;ctx.lineWidth=5;ctx.setLineDash(line.dash?[12,8]:[]);ctx.beginPath();ctx.moveTo(x,y-14);ctx.lineTo(x+36,y-14);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#506b8d';ctx.font=`24px ${font}`;ctx.fillText(line.name.slice(0,22),x+48,y);}
    ctx.fillStyle='#8a9cb2';ctx.font=`21px ${font}`;ctx.fillText(note.slice(0,90),100,1550);ctx.fillText('机构工坊 · 曲线不确定处断开 · A4 横向',100,1600);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));if(!blob)throw new Error('图像编码失败。');return jpegPDF(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height);
  }
  async function synthesisPDF(svg,title,fit,options){
    await document.fonts.ready;const canvas=document.createElement('canvas');canvas.width=2382;canvas.height=1684;const ctx=canvas.getContext('2d'),font='Microsoft YaHei,Segoe UI,sans-serif';if(!ctx)throw new Error('当前浏览器不支持图像导出。');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#2e496d';ctx.font=`bold 44px ${font}`;ctx.fillText(String(title).slice(0,36)+' · 轨迹合成',100,140);ctx.font=`26px ${font}`;ctx.fillStyle='#71869f';ctx.fillText(`${root.JiGou.synthesis.families[fit.type]} · ${options.closed?'整周回转':'区间摆动'} · 完整运动检查通过 · F = 1`,100,198);
    if(fit.gear){ctx.font=`23px ${font}`;ctx.fillText(root.JiGou.synthesis.gearSummary(fit),100,232);}
    const clean=/<svg[^>]*xmlns=/.test(svg)?svg:svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');ctx.drawImage(await loadSVG(clean),100,250,2182,1266);ctx.fillStyle='#506b8d';ctx.font=`23px ${font}`;ctx.fillText(`RMS ${fit.rms.toFixed(4)} mm  /  最大采样偏差 ${fit.max.toFixed(4)} mm  /  目标 RMS ${options.tolerance} mm`,100,1575);ctx.fillText('橙色虚线：目标轨迹；蓝线：候选轨迹。按弧长与顺序匹配，未指定经过各点的时间。',100,1620);ctx.fillStyle='#8a9cb2';ctx.font=`20px ${font}`;ctx.fillText('机构工坊 2.3 · mm · A4 横向',1880,1620);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));if(!blob)throw new Error('图像编码失败。');return jpegPDF(new Uint8Array(await blob.arrayBuffer()),canvas.width,canvas.height);
  }
  root.JiGou.exporter={pdf,jpegPDF,chartPDF,synthesisPDF};
  if(typeof module!=='undefined')module.exports=root.JiGou.exporter;
})(globalThis);
