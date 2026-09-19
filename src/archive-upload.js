import { createReadStream,createWriteStream } from 'node:fs';
import { access,mkdir,rename,rm } from 'node:fs/promises';
import { basename,extname,join,parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { decodeMetadata,safeCategory,safeFileName } from './upload.js';

const audioExtensions=new Set(['.mp3','.wav','.flac','.aac','.m4a','.ogg']);

export function safeArchiveEntry(value){
  const normalized=String(value||'').replaceAll('\\','/');
  const parts=normalized.split('/');
  if(!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || parts.some(part=>part==='..')){
    throw new Error('O ZIP contém um caminho de arquivo não permitido.');
  }
  return normalized;
}

export function isSupportedAudio(value){
  return audioExtensions.has(extname(String(value||'')).toLowerCase());
}

function safeArchiveName(value){
  const name=basename(String(value||'arquivos.zip')).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').trim();
  if(extname(name).toLowerCase()!=='.zip') throw new Error('Selecione um arquivo ZIP válido.');
  return name.slice(0,200)||'arquivos.zip';
}

async function availablePath(directory,fileName){
  const parsed=parse(fileName);
  let candidate=join(directory,fileName);
  try{await access(candidate);}catch{return candidate;}
  return join(directory,`${parsed.name}-${Date.now()}-${randomUUID().slice(0,8)}${parsed.ext}`);
}

function openZip(filePath){
  return new Promise((resolve,reject)=>yauzl.open(filePath,{lazyEntries:true,autoClose:false,validateEntrySizes:true},(error,zip)=>error?reject(error):resolve(zip)));
}

function openEntry(zip,entry){
  return new Promise((resolve,reject)=>zip.openReadStream(entry,(error,stream)=>error?reject(error):resolve(stream)));
}

async function extractZip(filePath,{inboxDir,category,maxFiles,maxExtractedBytes}){
  const categoryDir=join(inboxDir,category);
  await mkdir(categoryDir,{recursive:true});
  const zip=await openZip(filePath);
  const extracted=[];
  let count=0;
  let expandedSize=0;
  try{
    await new Promise((resolve,reject)=>{
      let stopped=false;
      const fail=error=>{
        if(stopped) return;
        stopped=true;
        try{zip.close();}catch{}
        reject(error);
      };
      zip.on('error',fail);
      zip.on('end',()=>{if(!stopped){stopped=true;resolve();}});
      zip.on('entry',async entry=>{
        try{
          const entryName=safeArchiveEntry(entry.fileName);
          if(entryName.endsWith('/') || !isSupportedAudio(entryName)) return zip.readEntry();
          count+=1;
          expandedSize+=Number(entry.uncompressedSize)||0;
          if(count>maxFiles) throw new Error(`O ZIP excede o limite de ${maxFiles} áudios.`);
          if(expandedSize>maxExtractedBytes) throw new Error('O conteúdo descompactado excede o limite permitido.');
          const fileName=safeFileName(basename(entryName));
          const destination=await availablePath(categoryDir,fileName);
          const temporary=join(categoryDir,`.archive-${randomUUID()}.tmp`);
          const stream=await openEntry(zip,entry);
          let written=0;
          const limiter=new Transform({transform(chunk,encoding,callback){
            written+=chunk.length;
            if(written>maxExtractedBytes) callback(new Error('Um arquivo do ZIP excede o limite permitido.'));
            else callback(null,chunk);
          }});
          try{
            await pipeline(stream,limiter,createWriteStream(temporary,{flags:'wx'}));
            await rename(temporary,destination);
          }catch(error){
            await rm(temporary,{force:true});
            throw error;
          }
          extracted.push(destination);
          zip.readEntry();
        }catch(error){fail(error);}
      });
      zip.readEntry();
    });
    if(!extracted.length) throw new Error('O ZIP não contém arquivos de áudio compatíveis.');
    return extracted;
  }catch(error){
    await Promise.all(extracted.map(path=>rm(path,{force:true})));
    throw error;
  }finally{
    try{zip.close();}catch{}
  }
}

export async function receiveArchive(req,{inboxDir,tempDir,maxBytes,maxFiles,maxExtractedBytes}){
  const fileName=safeArchiveName(decodeMetadata(req.headers['x-file-name-b64']));
  const category=safeCategory(decodeMetadata(req.headers['x-category-b64']));
  const declaredSize=Number(req.headers['content-length']);
  if(Number.isFinite(declaredSize) && declaredSize>maxBytes) throw Object.assign(new Error('O ZIP excede o limite permitido.'),{statusCode:413});
  await mkdir(tempDir,{recursive:true});
  const temporary=join(tempDir,`.upload-${randomUUID()}.zip`);
  let size=0;
  const limiter=new Transform({transform(chunk,encoding,callback){
    size+=chunk.length;
    if(size>maxBytes) callback(Object.assign(new Error('O ZIP excede o limite permitido.'),{statusCode:413}));
    else callback(null,chunk);
  }});
  try{
    await pipeline(req,limiter,createWriteStream(temporary,{flags:'wx'}));
    if(size===0) throw Object.assign(new Error('O arquivo ZIP está vazio.'),{statusCode:400});
    const files=await extractZip(temporary,{inboxDir,category,maxFiles,maxExtractedBytes});
    return {fileName,category,size,files};
  }finally{
    await rm(temporary,{force:true});
  }
}
