import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { access,mkdir,rename,rm } from 'node:fs/promises';
import { basename,extname,join,parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';

const allowedExtensions=new Set(['.mp3','.wav','.flac','.aac','.m4a','.ogg']);

export function decodeMetadata(value){
  if(!value) return '';
  try{
    return Buffer.from(String(value),'base64').toString('utf8');
  }catch{
    return '';
  }
}

export function safeFileName(value){
  const input=basename(String(value||'audio')).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,'').trim();
  const extension=extname(input).toLowerCase();
  if(!allowedExtensions.has(extension)) throw new Error('Formato de áudio não permitido.');
  const stem=parse(input).name.replace(/[<>:"/\\|?*]/g,'-').replace(/\.+$/,'').trim().slice(0,180)||'audio';
  return `${stem}${extension}`;
}

export function safeCategory(value){
  return String(value||'Outros').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*.]/g,'-').trim().slice(0,80)||'Outros';
}

export function safeSubcategory(value){
  return String(value||'').normalize('NFC').split(/[\\/]+/).map(part=>part.replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'-').replace(/\.+$/,'').trim().slice(0,80)).filter(Boolean).join('/').slice(0,500);
}

export function safeRelativeAudioPath(value,fileName){
  const raw=String(value||'').replaceAll('\\','/');
  if(!raw) return '';
  const parts=raw.split('/').filter(Boolean);
  if(parts.length<2) return '';
  if(parts.some(part=>part==='.'||part==='..'||/^[a-z]:$/i.test(part))) throw new Error('O caminho relativo do áudio não é permitido.');
  // The first component is the folder selected in the browser; keep its name as the catalog root.
  return parts.map(part=>part.normalize('NFC').replace(/[\\u0000-\\u001f\\u007f<>:"|?*]/g,'-').replace(/\\.+$/,'').trim().slice(0,120)).filter(Boolean).join('/');
}

async function availablePath(directory,fileName){
  const parsed=parse(fileName);
  let candidate=join(directory,fileName);
  try{
    await access(candidate);
  }catch{
    return candidate;
  }
  candidate=join(directory,`${parsed.name}-${Date.now()}-${randomUUID().slice(0,8)}${parsed.ext}`);
  return candidate;
}

export async function receiveUpload(req,{inboxDir,maxBytes,directoryStore}){
  const fileName=safeFileName(decodeMetadata(req.headers['x-file-name-b64']));
  const relativeAudioPath=safeRelativeAudioPath(decodeMetadata(req.headers['x-relative-path-b64']),fileName);
  const relativeParts=relativeAudioPath.split('/').filter(Boolean);
  const category=relativeParts.length>1?safeCategory(relativeParts[0]):safeCategory(decodeMetadata(req.headers['x-category-b64']));
  const subcategory=relativeParts.length>1?safeSubcategory(relativeParts.slice(1,-1).join('/')):safeSubcategory(decodeMetadata(req.headers['x-subcategory-b64']));
  const declaredSize=Number(req.headers['content-length']);
  if(Number.isFinite(declaredSize) && declaredSize>maxBytes) throw Object.assign(new Error('Arquivo excede o limite permitido.'),{statusCode:413});

  const categoryDir=relativeParts.length>1?join(inboxDir,...relativeParts.slice(0,-1)):subcategory?join(inboxDir,category,...subcategory.split('/')):join(inboxDir,category);
  await mkdir(categoryDir,{recursive:true});
  const filePath=await availablePath(categoryDir,fileName);
  const temporary=join(categoryDir,`.upload-${randomUUID()}.tmp`);
  let size=0;
  const limiter=new Transform({
    transform(chunk,encoding,callback){
      size+=chunk.length;
      if(size>maxBytes) callback(Object.assign(new Error('Arquivo excede o limite permitido.'),{statusCode:413}));
      else callback(null,chunk);
    }
  });

  try{
    await pipeline(req,limiter,createWriteStream(temporary,{flags:'wx'}));
    if(size===0) throw Object.assign(new Error('O arquivo enviado está vazio.'),{statusCode:400});
    await rename(temporary,filePath);
    return {filePath,fileName,category,subcategory,relativeAudioPath,size};
  }catch(error){
    await rm(temporary,{force:true});
    throw error;
  }
}
