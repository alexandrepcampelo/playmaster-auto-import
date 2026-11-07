import http from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createReadStream } from 'node:fs';
import { readFile,rm,stat } from 'node:fs/promises';
import { extname,join,normalize,resolve,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ImportStore } from './store.js';
import { AutoImporter } from './importer.js';
import { LoginLimiter,clearSessionCookie,createSession,parseCookies,secureEqual,sessionCookie,verifySession } from './auth.js';
import { receiveUpload } from './upload.js';
import { receiveArchive } from './archive-upload.js';
import { parseLibraryQuery,publicLibraryItem,validateAcknowledgement } from './library.js';
import { createWeatherService } from './weather.js';

const publicDir=join(fileURLToPath(new URL('.',import.meta.url)),'..','public');
const store=new ImportStore(config);
await store.init();
const importer=new AutoImporter({...config,store});
await importer.init();
const loginLimiter=new LoginLimiter();
const weatherService=createWeatherService({apiKey:config.weatherApiKey,location:config.weatherLocation});

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const audioCategories=new Set(['Músicas','Comerciais','Vinhetas','Intercons','Trilhas','Chamadas','Locução','Voice Track','Hora Certa','Temperatura','Outros']);


function isPublicIp(address){
  const version=isIP(address);
  if(version===4){
    const parts=address.split('.').map(Number);
    const [a,b]=parts;
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));
  }
  if(version===6){
    const ip=address.toLowerCase();
    return !(ip==='::'||ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe8')||ip.startsWith('fe9')||ip.startsWith('fea')||ip.startsWith('feb')||ip.startsWith('::ffff:'));
  }
  return false;
}
async function validateRssTarget(input){
  let target;
  try{target=new URL(input)}catch{return null}
  if(target.protocol!=='https:'||target.username||target.password||(target.port&&target.port!=='443')) return null;
  const host=target.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')) return null;
  const literal=isIP(host);
  const addresses=literal?[{address:host}]:await lookup(host,{all:true,verbatim:true}).catch(()=>[]);
  if(!addresses.length||addresses.some(item=>!isPublicIp(item.address))) return null;
  return target;
}
async function fetchRssFeed(input){
  let target=input;
  for(let redirect=0;redirect<=3;redirect++){
    target=await validateRssTarget(target);
    if(!target) throw Object.assign(new Error('Endereço RSS inválido ou não público.'),{statusCode:400});
    const response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{accept:'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1','user-agent':'PlayMaster Air RSS Reader/1.0'}});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location||redirect===3) throw Object.assign(new Error('Redirecionamento do feed inválido.'),{statusCode:502});
      target=new URL(location,target).href;
      continue;
    }
    if(!response.ok) throw Object.assign(new Error('O site de notícias respondeu HTTP '+response.status+'.'),{statusCode:502});
    const reader=response.body?.getReader();
    if(!reader) throw Object.assign(new Error('O feed RSS veio vazio.'),{statusCode:502});
    const chunks=[];let size=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done) break;
        size+=value.byteLength;
        if(size>512_000){await reader.cancel();throw Object.assign(new Error('O feed RSS excede o limite de 500 KB.'),{statusCode:413})}
        chunks.push(Buffer.from(value));
      }
    }finally{reader.releaseLock()}
    const xml=Buffer.concat(chunks).toString('utf8');
    if(!/<(?:\?xml\b|rss\b|feed\b|rdf:RDF\b)/i.test(xml.slice(0,2048))) throw Object.assign(new Error('O endereço não retornou um feed RSS ou Atom válido.'),{statusCode:422});
    return xml;
  }
  throw Object.assign(new Error('Não foi possível acessar o feed RSS.'),{statusCode:502});
}

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

function requirePanelSession(req,res){
  if(panelSession(req)) return true;
  json(res,401,{error:'Sessão administrativa necessária.'});
  return false;
}

async function removeStoredFile(filePath,baseDir){
  if(!filePath) return;
  const target=resolve(filePath);
  const base=resolve(baseDir);
  if(target!==base && !target.startsWith(`${base}${sep}`)) throw new Error('Caminho de armazenamento inválido.');
  await rm(target,{force:true});
}

async function streamProcessedAudio(req,res,item){
  if(!item?.processedPath || item.status==='deleted') return json(res,404,{error:'Áudio processado ainda não está disponível.'});
  const info=await stat(item.processedPath);
  const range=String(req.headers.range||'').match(/^bytes=(\d*)-(\d*)$/);
  const headers={'content-type':extname(item.processedPath).toLowerCase()==='.wav'?'audio/wav':'audio/mpeg','accept-ranges':'bytes','cache-control':'private, no-store'};
  if(range){
    const start=range[1]?Number(range[1]):0;
    const end=range[2]?Math.min(Number(range[2]),info.size-1):info.size-1;
    if(!Number.isInteger(start) || !Number.isInteger(end) || start<0 || end<start || start>=info.size){
      res.writeHead(416,{'content-range':`bytes */${info.size}`});
      return res.end();
    }
    res.writeHead(206,{...headers,'content-range':`bytes ${start}-${end}/${info.size}`,'content-length':end-start+1});
    return createReadStream(item.processedPath,{start,end}).pipe(res);
  }
  res.writeHead(200,{...headers,'content-length':info.size});
  createReadStream(item.processedPath).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/api/health') return json(res,200,{ok:true,service:'playmaster-auto-import',version:'0.3.0'});
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
    if(url.pathname==='/api/rss' && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      const feedUrl=url.searchParams.get('url')||'';
      try{
        const xml=await fetchRssFeed(feedUrl);
        res.writeHead(200,{'content-type':'application/xml; charset=utf-8','cache-control':'private, no-store'});
        return res.end(xml);
      }catch(error){return json(res,error.statusCode||502,{error:error.name==='TimeoutError'?'O site demorou para responder.':error.message||'Não foi possível carregar o feed RSS.'});}
    }
    if(url.pathname==='/api/weather' && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      try{return json(res,200,await weatherService.get());}
      catch(error){return json(res,error.statusCode||502,{error:error.message||'Dados meteorológicos indisponíveis.'});}
    }
    if(url.pathname==='/api/status' && !requireReadAccess(req,res)) return;
    if(url.pathname==='/api/status') return json(res,200,{
      ok:true,counts:store.counts(),inboxDir:config.inboxDir,originalsDir:config.originalsDir,processedDir:config.processedDir,
      stationCode:config.stationCode,pollIntervalMs:config.pollIntervalMs,
      audioProfile:{output:'MP3 320 kbps CBR · 44,1 kHz',targetLufs:config.targetLufs,truePeakDb:config.truePeakDb}
    });
    if(url.pathname==='/api/imports' && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      return json(res,200,{items:store.list(url.searchParams.get('limit'),url.searchParams.get('offset'),url.searchParams.get('q'))});
    }
    if(url.pathname==='/api/trash' && req.method==='GET'){
      if(!requirePanelSession(req,res)) return;
      return json(res,200,{items:store.trashed(url.searchParams.get('limit'))});
    }
    const importItemMatch=url.pathname.match(/^\/api\/imports\/([^/]+)$/);
    if(importItemMatch && req.method==='PATCH'){
      if(!requirePanelSession(req,res)) return;
      const input=await body(req);
      const patch={};
      if(Object.hasOwn(input,'category')){
        const category=String(input.category||'').trim();
        if(!audioCategories.has(category)) return json(res,400,{error:'Pasta de áudio inválida.'});
        patch.category=category;
      }
      if(Object.hasOwn(input,'subcategory')) patch.subcategory=['Hora Certa','Temperatura'].includes(patch.category)?String(input.subcategory||'').normalize('NFC').replace(/[\\/<>:"|?*\u0000-\u001f]/g,'-').trim().slice(0,80):'';
      else if(patch.category && !['Hora Certa','Temperatura'].includes(patch.category)) patch.subcategory='';
      for(const [key,max] of [['title',200],['artist',200],['album',200],['year',12]]){
        if(Object.hasOwn(input,key)) patch[key]=String(input[key]??'').trim().slice(0,max);
      }
      if(!Object.keys(patch).length) return json(res,400,{error:'Nenhuma alteração informada.'});
      const item=await store.revise(decodeURIComponent(importItemMatch[1]),patch);
      return item?json(res,200,{ok:true,item}):json(res,404,{error:'Áudio não encontrado.'});
    }
    if(importItemMatch && req.method==='DELETE'){
      if(!requirePanelSession(req,res)) return;
      const item=await store.trash(decodeURIComponent(importItemMatch[1]));
      return item?json(res,200,{ok:true,item}):json(res,404,{error:'Áudio não encontrado.'});
    }
    const reprocessMatch=url.pathname.match(/^\/api\/imports\/([^/]+)\/reprocess$/);
    if(reprocessMatch && req.method==='POST'){
      if(!requirePanelSession(req,res)) return;
      const result=await importer.reprocess(decodeURIComponent(reprocessMatch[1]),{background:true});
      return result?json(res,202,{ok:true,...result}):json(res,404,{error:'Áudio original não encontrado para reprocessamento.'});
    }
    const restoreMatch=url.pathname.match(/^\/api\/trash\/([^/]+)\/restore$/);
    if(restoreMatch && req.method==='POST'){
      if(!requirePanelSession(req,res)) return;
      const item=await store.restore(decodeURIComponent(restoreMatch[1]));
      return item?json(res,200,{ok:true,item}):json(res,404,{error:'Item da Lixeira não encontrado.'});
    }
    const trashItemMatch=url.pathname.match(/^\/api\/trash\/([^/]+)$/);
    if(trashItemMatch && req.method==='DELETE'){
      if(!requirePanelSession(req,res)) return;
      const id=decodeURIComponent(trashItemMatch[1]);
      const item=store.findById(id);
      if(!item || item.status!=='deleted') return json(res,404,{error:'Item da Lixeira não encontrado.'});
      await removeStoredFile(item.originalPath,config.originalsDir);
      await removeStoredFile(item.processedPath,config.processedDir);
      await store.remove(id);
      return json(res,200,{ok:true,id});
    }
    if(url.pathname==='/api/library' && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      const query=parseLibraryQuery(url.searchParams);
      const items=store.ready(query).map(publicLibraryItem);
      return json(res,200,{items,count:items.length});
    }
    const libraryItemMatch=url.pathname.match(/^\/api\/library\/([^/]+)$/);
    if(libraryItemMatch && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      const item=publicLibraryItem(store.findById(decodeURIComponent(libraryItemMatch[1])));
      return item?json(res,200,{item}):json(res,404,{error:'Áudio pronto não encontrado.'});
    }
    const libraryAudioMatch=url.pathname.match(/^\/api\/library\/([^/]+)\/audio$/);
    if(libraryAudioMatch && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      return await streamProcessedAudio(req,res,store.findById(decodeURIComponent(libraryAudioMatch[1])));
    }
    const libraryAckMatch=url.pathname.match(/^\/api\/library\/([^/]+)\/ack$/);
    if(libraryAckMatch && req.method==='POST'){
      if(!hasApiToken(req)) return json(res,401,{error:'Token de API necessário.'});
      const acknowledgement=validateAcknowledgement(await body(req));
      const delivery=await store.acknowledge(decodeURIComponent(libraryAckMatch[1]),acknowledgement);
      return delivery?json(res,200,{ok:true,delivery}):json(res,404,{error:'Áudio pronto não encontrado.'});
    }
    const audioMatch=url.pathname.match(/^\/api\/imports\/([^/]+)\/audio$/);
    if(audioMatch && req.method==='GET'){
      if(!requireReadAccess(req,res)) return;
      return await streamProcessedAudio(req,res,store.findById(decodeURIComponent(audioMatch[1])));
    }
    if(url.pathname==='/api/imports/register' && req.method==='POST'){
      if(!hasApiToken(req) && !panelSession(req)) return json(res,401,{error:'Autenticação necessária.'});
      const input=await body(req);
      if(!input.fileName) return json(res,400,{error:'fileName é obrigatório.'});
      return json(res,201,{item:await store.create({...input,status:'received',source:input.source||'windows-agent'})});
    }
    if(url.pathname==='/api/uploads/archive' && req.method==='POST'){
      if(!hasApiToken(req) && !panelSession(req)) return json(res,401,{error:'Autenticação necessária.'});
      const archive=await receiveArchive(req,config);
      const results=await Promise.all(archive.files.map(filePath=>importer.ingest(filePath,{background:true})));
      await Promise.all(results.map((result,index)=>result?.duplicate?rm(archive.files[index],{force:true}):null));
      const items=results.filter(Boolean).map(result=>result.item).filter(Boolean);
      return json(res,202,{
        ok:true,queued:true,count:items.length,duplicates:results.filter(result=>result?.duplicate).length,
        items,received:{fileName:archive.fileName,category:archive.category,subcategory:archive.subcategory,size:archive.size}
      });
    }
    if(url.pathname==='/api/voice-track' && req.method==='POST'){
      if(!hasApiToken(req) && !panelSession(req)) return json(res,401,{error:'Autenticação necessária.'});
      const upload=await receiveUpload(req,{inboxDir:config.processedDir,maxBytes:config.maxUploadBytes});
      if(upload.category!=='Voice Track' || extname(upload.fileName).toLowerCase()!=='.wav'){
        await rm(upload.filePath,{force:true});
        return json(res,400,{error:'Voice Track aceita apenas arquivos WAV.'});
      }
      const duration=Number(req.headers['x-audio-duration']);
      try{
        const item=await store.create({
          fileName:upload.fileName,category:'Voice Track',source:'voice-track',
          originalPath:upload.filePath,processedPath:upload.filePath,
          size:upload.size,duration:Number.isFinite(duration)&&duration>=0&&duration<86400?duration:0,
          title:upload.fileName.replace(/\.wav$/i,''),sourceFormat:'WAV',
          outputFormat:'WAV original',processingStage:'ready',status:'ready'
        });
        return json(res,201,{ok:true,ready:true,item:publicLibraryItem(item)});
      }catch(error){await rm(upload.filePath,{force:true});throw error}
    }
    if(url.pathname==='/api/uploads' && req.method==='POST'){
      if(!hasApiToken(req) && !panelSession(req)) return json(res,401,{error:'Autenticação necessária.'});
      const upload=await receiveUpload(req,{inboxDir:config.inboxDir,maxBytes:config.maxUploadBytes});
      const result=await importer.ingest(upload.filePath,{background:true});
      if(result?.duplicate) await rm(upload.filePath,{force:true});
      return json(res,result?.duplicate?200:202,{
        ok:true,duplicate:Boolean(result?.duplicate),reclassified:Boolean(result?.reclassified),queued:Boolean(result?.queued),item:result?.item||null,
        received:{fileName:upload.fileName,category:upload.category,subcategory:upload.subcategory,size:upload.size}
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
