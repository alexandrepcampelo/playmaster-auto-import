import { copyFile, mkdir, lstat, realpath, stat } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

function safeSegment(value){
  const name=String(value||'Outros').normalize('NFC').replace(/[\\\\/<>:"|?*\\x00-\\x1f]/g,'-').trim();
  if(!name || name==='.' || name==='..') throw new Error('Categoria de destino inválida.');
  return name.slice(0,80);
}
async function ensureInside(root,target){
  const actual=await realpath(target);
  if(actual!==root && !actual.startsWith(root+sep)) throw new Error('Destino fora da biblioteca local autorizada.');
  return actual;
}
export async function copyIntoLocalLibrary(config,file){
  const root=resolve(config.libraryRoot);
  await mkdir(root,{recursive:true});
  const realRoot=await realpath(root);
  const category=safeSegment(file.category);
  const folder=join(realRoot,category);
  await mkdir(folder,{recursive:true});
  await ensureInside(realRoot,folder);
  const sourceInfo=await lstat(file.path);
  if(!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error('O arquivo de origem não é um arquivo regular.');
  const extension=extname(file.fileName).toLowerCase();
  const allowed=new Set(['.mp3','.wav','.flac','.aac','.m4a','.ogg']);
  if(!allowed.has(extension)) throw new Error('Formato de áudio não permitido.');
  const parsed=basename(file.fileName,extension);
  let destination=join(folder,basename(file.fileName));
  let suffix=2;
  while(true){
    try{
      const existing=await lstat(destination);
      if(existing.isSymbolicLink() || !existing.isFile()) throw new Error('Já existe um destino que não é arquivo regular.');
      const existingInfo=await stat(destination);
      if(existingInfo.size===sourceInfo.size) return {destination,duplicate:true};
      destination=join(folder,parsed+' ('+suffix+++')'+extension);
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      break;
    }
  }
  await copyFile(file.path,destination);
  const copied=await stat(destination);
  if(copied.size!==sourceInfo.size) throw new Error('A cópia local não foi concluída integralmente.');
  return {destination,duplicate:false};
}
