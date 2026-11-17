import { copyFile, mkdir, lstat, realpath, stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, extname, join, resolve, sep } from 'node:path';

function safeSegment(value){
  const name=String(value||'Outros').normalize('NFC').replace(/[\\\\/<>:"|?*\\x00-\\x1f]/g,'-').trim();
  if(!name || name==='.' || name==='..') throw new Error('Categoria de destino inválida.');
  return name.slice(0,80);
}
async function digest(path){
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
export async function copyIntoLocalLibrary(config,file){
  const root=resolve(config.libraryRoot);
  await mkdir(root,{recursive:true});
  const realRoot=await realpath(root);
  const folder=join(realRoot,safeSegment(file.category));
  await mkdir(folder,{recursive:true});
  const folderInfo=await lstat(folder);
  if(folderInfo.isSymbolicLink()||!folderInfo.isDirectory()) throw new Error('A pasta de destino não é segura.');
  const actualFolder=await realpath(folder);
  if(actualFolder!==realRoot&&!actualFolder.startsWith(realRoot+sep)) throw new Error('Destino fora da biblioteca local autorizada.');
  const sourceInfo=await lstat(file.path);
  if(!sourceInfo.isFile()||sourceInfo.isSymbolicLink()) throw new Error('O arquivo de origem não é um arquivo regular.');
  const extension=extname(file.fileName).toLowerCase();
  const allowed=new Set(['.mp3','.wav','.flac','.aac','.m4a','.ogg']);
  if(!allowed.has(extension)) throw new Error('Formato de áudio não permitido.');
  const parsed=basename(file.fileName,extension);
  const sourceHash=await digest(file.path);
  let destination=join(actualFolder,basename(file.fileName));
  let suffix=2;
  while(true){
    try{
      const existing=await lstat(destination);
      if(existing.isSymbolicLink()||!existing.isFile()) throw new Error('Já existe um destino que não é arquivo regular.');
      if(await digest(destination)===sourceHash) return {destination,duplicate:true};
      destination=join(actualFolder,`${parsed} (${suffix})${extension}`);
      suffix+=1;
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      break;
    }
  }
  await copyFile(file.path,destination);
  const copied=await stat(destination);
  if(copied.size!==sourceInfo.size||await digest(destination)!==sourceHash) throw new Error('A cópia local não foi concluída integralmente.');
  return {destination,duplicate:false};
}
