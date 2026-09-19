import { readdir,stat } from 'node:fs/promises';
import { extname,join } from 'node:path';

const supported=new Set(['.mp3','.wav','.flac','.aac','.m4a','.ogg']);

async function walk(directory,category,result){
  const entries=await readdir(directory,{withFileTypes:true});
  for(const entry of entries){
    const path=join(directory,entry.name);
    if(entry.isDirectory()) await walk(path,category,result);
    else if(entry.isFile() && supported.has(extname(entry.name).toLowerCase())){
      const info=await stat(path);
      result.push({path,fileName:entry.name,category,size:info.size,mtimeMs:info.mtimeMs,fingerprint:`${info.size}:${info.mtimeMs}`});
    }
  }
}

export async function discoverFiles(folders){
  const result=[];
  for(const folder of folders){
    try{
      await walk(folder.path,folder.category,result);
    }catch(error){
      if(error.code!=='ENOENT') throw error;
    }
  }
  return result;
}
