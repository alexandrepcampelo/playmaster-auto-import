import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname,join,normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ImportStore } from './store.js';
import { AutoImporter } from './importer.js';

const publicDir=join(fileURLToPath(new URL('.',import.meta.url)),'..','public');
const store=new ImportStore(config);
await store.init();
const importer=new AutoImporter({...config,store});
await importer.init();

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};

function json(res,status,payload){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(payload));
}

async function body(req){
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>1_000_000) throw new Error('Corpo da requisição excede 1 MB.');
    chunks.push(chunk);
  }
  return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/api/health') return json(res,200,{ok:true,service:'playmaster-auto-import',version:'0.1.0'});
    if(url.pathname==='/api/status') return json(res,200,{
      ok:true,counts:store.counts(),inboxDir:config.inboxDir,originalsDir:config.originalsDir,
      stationCode:config.stationCode,pollIntervalMs:config.pollIntervalMs
    });
    if(url.pathname==='/api/imports' && req.method==='GET') return json(res,200,{items:store.list(url.searchParams.get('limit'))});
    if(url.pathname==='/api/imports/register' && req.method==='POST'){
      const input=await body(req);
      if(!input.fileName) return json(res,400,{error:'fileName é obrigatório.'});
      return json(res,201,{item:await store.create({...input,status:'received',source:input.source||'windows-agent'})});
    }
    const route=url.pathname==='/'?'/index.html':url.pathname;
    const safe=normalize(route).replace(/^(\.\.[/\\])+/, '');
    const filePath=join(publicDir,safe);
    if(!filePath.startsWith(publicDir)) return json(res,403,{error:'Acesso negado.'});
    const data=await readFile(filePath);
    res.writeHead(200,{'content-type':mime[extname(filePath)]||'application/octet-stream'});
    res.end(data);
  }catch(error){
    if(error.code==='ENOENT') return json(res,404,{error:'Não encontrado.'});
    console.error(error);
    json(res,500,{error:'Erro interno do Auto Import.'});
  }
});

server.listen(config.port,'0.0.0.0',()=>console.log(`PlayMaster Auto Import ativo na porta ${config.port}`));

function shutdown(){
  importer.stop();
  server.close(()=>process.exit(0));
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
