'use strict';
// Optional preview server. The released app also runs directly from index.html.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.JIGOU_PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    const relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end('Forbidden');return;}
    fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
  }catch{res.writeHead(400);res.end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`机构工坊 http://127.0.0.1:${port}`));
