import { copyFile,mkdir,readdir,stat } from 'node:fs/promises';
import { basename,extname,join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const supportedExtensions=new Set(['.mp3','.wav','.flac','.aac','.m4a','.ogg']);

async function checksum(filePath){
  const hash=createHash('sha256');
  await new Promise((resolve,reject)=>{
    const stream=createReadStream(filePath);
    stream.on('data',chunk=>hash.update(chunk));
    stream.on('end',resolve);
    stream.on('error',reject);
  });
  return hash.digest('hex');
}

async function walk(directory){
  const entries=await readdir(directory,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const path=join(directory,entry.name);
    if(entry.isDirectory()) files.push(...await walk(path));
    else if(entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

export class AutoImporter{
  constructor({inboxDir,originalsDir,pollIntervalMs,store}){
    this.inboxDir=inboxDir;
    this.originalsDir=originalsDir;
    this.pollIntervalMs=pollIntervalMs;
    this.store=store;
    this.known=new Map();
    this.timer=null;
    this.scanning=false;
  }

  async init(){
    await mkdir(this.inboxDir,{recursive:true});
    await mkdir(this.originalsDir,{recursive:true});
    await this.scan();
    this.timer=setInterval(()=>void this.scan(),this.pollIntervalMs);
    this.timer.unref?.();
  }

  async scan(){
    if(this.scanning) return;
    this.scanning=true;
    try{
      const files=await walk(this.inboxDir);
      for(const filePath of files) await this.receive(filePath);
    }finally{
      this.scanning=false;
    }
  }

  async receive(filePath){
    const info=await stat(filePath);
    const signature=`${info.size}:${info.mtimeMs}`;
    if(this.known.get(filePath)===signature) return;
    this.known.set(filePath,signature);
    const relativePath=relative(this.inboxDir,filePath);
    const category=relativePath.includes('/')?relativePath.split('/')[0]:'Outros';
    const digest=await checksum(filePath);
    if(this.store.state.items.some(item=>item.checksum===digest)) return;

    const item=await this.store.create({
      fileName:basename(filePath),category,source:'vps-inbox',sourcePath:relativePath,
      size:info.size,checksum:digest,status:'processing'
    });
    try{
      const originalPath=join(this.originalsDir,`${item.id}${extname(filePath).toLowerCase()}`);
      await copyFile(filePath,originalPath);
      await this.store.update(item.id,{originalPath,status:'ready'});
    }catch(error){
      await this.store.update(item.id,{status:'error',error:error.message});
    }
  }

  stop(){
    if(this.timer) clearInterval(this.timer);
  }
}
