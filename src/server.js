import http from 'node:http';
import { readFile,rm } from 'node:fs/promises';
import { extname,join,normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ImportStore } from './store.js';
import { AutoImporter } from './importer.js';
import { LoginLimiter,clearSessionCookie,createSession,parseCookies,secureEqual,sessionCookie,verifySession } from './auth.js';
import { receiveUpload } from './upload.js';

const publicDir=join(fileURLToPath(new URL('.',import.meta.url)),'..','public');
const store=new ImportStore(config);
await store.init();
const importer=new AutoImporter({...config,store});
await importer.init();
const loginLimiter=new LoginLimiter();

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

function clientKey(req,username=''){
  const forwarded=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return `${forwarded||req.socket.remoteAddress||'unknown'}:${String(username).toLowerCase()}`;
}

function bearerToken(req){
  const match=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i);
  return match?.[1]||'';
}

function panelSession(req){
  const token=parseCookies(req.headers.cookie).pm_auto_session;
  return verifySession(token,config.sessionSecret);
}

function hasApiToken(req){
  const token=bearerToken(req);
  return Boolean(token) && secureEqual(token,config.apiToken);
}

function requireReadAccess(req,res){
  if(panelSession(req) || hasApiToken(req)) return true;
  json(res,401,{error:'Autenticação necessária.'});
  return false;
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/api/health') return json(res,200,{ok:true,service:'playmaster-auto-import',version:'0.1.0'});
    if(url.pathname==='/api/login' && req.method==='POST'){
      const input=await body(req);
      const key=clientKey(req,input.username);
      const limit=loginLimiter.status(key);
      if(limit.blocked){
        res.setHeader('retry-after',String(limit.retryAfter));
        return json(res,429,{error:'Muitas tentativas. Aguarde alguns minutos.'});
      }
      const validUser=secureEqual(input.username||'',config.adminUser);
      const validPassword=secureEqual(input.password||'',config.adminPassword);
      if(!validUser || !validPassword){
        const failed=loginLimiter.fail(key);
        if(failed.blocked) res.setHeader('retry-after',String(failed.retryAfter));
        return json(res,failed.blocked?429:401,{error:'Usuário ou senha inválidos.'});
      }
      loginLimiter.clear(key);
      res.setHeader('set-cookie',sessionCookie(createSession(config.adminUser,config.sessionSecret)));
      return json(res,200,{ok:true,user:config.adminUser});
    }
    if(url.pathname==='/api/logout' && req.method==='POST'){
      res.setHeader('set-cookie',clearSessionCookie());
      return json(res,200,{ok:true});
    }
    if(url.pathname==='/api/me' && req.method==='GET'){
      const session=panelSession(req);
      return session?json(res,200,{authenticated:true,user:session.username}):json(res,401,{authenticated:false});
    }
    if(url.pathname==='/api/status' && !requireReadAccess(req,res)) return;
    if(url.pathname==='/api/status') return json(res,200,{
      ok:true,counts:store.counts(),inboxDir:config.inboxDir,originalsDir:config.originalsDir,
      stationCode:config.stationCode,pollIntervalMs:config.pollIntervalMs
    });
    if(url.pathname==='/api/imports' && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      return json(res,200,{items:store.list(url.searchParams.get('limit'))});
    }
    if(url.pathname==='/api/imports/register' && req.method==='POST'){
      if(!hasApiToken(req)) return json(res,401,{error:'Token de integração inválido.'});
      const input=await body(req);
      if(!input.fileName) return json(res,400,{error:'fileName é obrigatório.'});
      return json(res,201,{item:await store.create({...input,status:'received',source:input.source||'windows-agent'})});
    }
    if(url.pathname==='/api/uploads' && req.method==='POST'){
      if(!hasApiToken(req)) return json(res,401,{error:'Token de integração inválido.'});
      const upload=await receiveUpload(req,{inboxDir:config.inboxDir,maxBytes:config.maxUploadBytes});
      const result=await importer.ingest(upload.filePath);
      if(result?.duplicate) await rm(upload.filePath,{force:true});
      return json(res,result?.duplicate?200:201,{
        ok:true,duplicate:Boolean(result?.duplicate),item:result?.item||null,
        received:{fileName:upload.fileName,category:upload.category,size:upload.size}
      });
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
    json(res,error.statusCode||500,{error:error.statusCode?error.message:'Erro interno do Auto Import.'});
  }
});

server.listen(config.port,'0.0.0.0',()=>console.log(`PlayMaster Auto Import ativo na porta ${config.port}`));

function shutdown(){
  importer.stop();
  server.close(()=>process.exit(0));
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
