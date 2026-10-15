'use strict';
// Read-only validation of the packaged examples and standalone offline source.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const name of ['geometry','model','gears','cams','drive','cases','solver','motion','view','curves','synthesis'])require(path.join(root,'src',name+'.js'));
const {cases:F,solver:S,model:M,synthesis:X}=globalThis.JiGou;
const examples=fs.readdirSync(path.join(root,'examples')).filter(n=>n.endsWith('.json'));
for(const name of examples){
  const data=JSON.parse(fs.readFileSync(path.join(root,'examples',name),'utf8')),{model,presentation}=F.read(data);
  assert.equal(data.version,9,name);assert.deepEqual(F.read(F.write(model,presentation)).model,model,name);
  const cycle=S.sweep(model,2);assert.ok(cycle.ok,`${name}: ${cycle.message}`);assert.ok(cycle.frames.length>1,name);
  if(model.synthesis){assert.equal(M.mobility(model).dof,1,name);X.prepare(model.synthesis.target.points,model.synthesis.settings);}
}
const targets=fs.readdirSync(path.join(root,'examples','轨迹目标')).filter(n=>n.endsWith('.轨迹.json'));
for(const name of targets)X.readPath(JSON.parse(fs.readFileSync(path.join(root,'examples','轨迹目标',name),'utf8')));
const index=fs.readFileSync(path.join(root,'index.html'),'utf8'),offline=fs.readFileSync(path.join(root,'机构工坊_离线版.html'),'utf8');
const sources=[...index.matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1]);
assert.equal(sources.length,18);assert.ok(!/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(offline));
for(const file of sources){const source=fs.readFileSync(path.join(root,file),'utf8');new vm.Script(source,{filename:file});assert.ok(offline.includes(source),file);}
assert.ok(offline.includes(fs.readFileSync(path.join(root,'styles.css'),'utf8')));
const version=require('../package.json').version,manual=fs.readFileSync(path.join(root,`docs/机构工坊_使用说明书_${version}.md`),'utf8');
const references=new Set([...manual.matchAll(/“([^”]+\.机构\.json)”/g)].map(m=>m[1]));
for(const name of references)assert.ok(fs.existsSync(path.join(root,'examples',name)),name);
const handbook=fs.readFileSync(path.join(root,`docs/机构工坊_使用说明书_${version}.html`),'utf8');
assert.equal((handbook.match(/<h2 id="chapter-/g)||[]).length,14);
assert.equal((handbook.match(/data:image\//g)||[]).length,9);
assert.ok(fs.statSync(path.join(root,`output/pdf/机构工坊_使用说明书与案例教程_${version}.pdf`)).size>100000);
console.log(`PASS: ${examples.length} 份 v9 机构文件往返读取与完整周期、${targets.length} 份目标轨迹、${sources.length} 个内嵌脚本与离线版源代码一致；说明书 14 章、9 张内嵌图及 ${references.size} 份直接引用案例文件。`);
