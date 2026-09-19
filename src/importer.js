import { access,copyFile,mkdir,readdir,rm,stat } from 'node:fs/promises';
import { basename,extname,join,relative } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { analyzeAudio,convertAudio,displayTitle } from './audio-processor.js';

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
  constructor({inboxDir,originalsDir,processedDir,pollIntervalMs,targetLufs,truePeakDb,silenceThresholdDb,silenceDuration,store}){
    this.inboxDir=inboxDir;
    this.originalsDir=originalsDir;
    this.processedDir=processedDir;
    this.pollIntervalMs=pollIntervalMs;
    this.audioSettings={targetLufs,truePeakDb,silenceThresholdDb,silenceDuration};
    this.store=store;
    this.known=new Map();
    this.timer=null;
    this.scanPromise=null;
    this.prepareQueue=Promise.resolve();
    this.processQueue=Promise.resolve();
  }

  async init(){
    await mkdir(this.inboxDir,{recursive:true});
    await mkdir(this.originalsDir,{recursive:true});
    await mkdir(this.processedDir,{recursive:true});
    await this.scan();
    this.resumePending();
    this.timer=setInterval(()=>void this.scan(),this.pollIntervalMs);
    this.timer.unref?.();
  }

  resumePending(){
    for(const item of this.store.list(500).reverse()){
      const legacyReady=item.status==='ready' && item.originalPath && !item.processedPath;
      if((item.status!=='processing' && !legacyReady) || !item.originalPath) continue;
      const processing=this.processQueue.then(async()=>{
        await access(item.originalPath);
        if(legacyReady) await this.store.update(item.id,{status:'processing',processingStage:'analyzing',error:''});
        return this.process({item,originalPath:item.originalPath});
      }).catch(async error=>{
        await this.store.update(item.id,{status:'error',processingStage:'error',error:`Não foi possível retomar: ${error.message}`});
      });
      this.processQueue=processing;
    }
  }

  async scan(){
    if(this.scanPromise) return this.scanPromise;
    this.scanPromise=(async()=>{
      const files=await walk(this.inboxDir);
      for(const filePath of files){
        const result=await this.ingest(filePath);
        if(result?.duplicate) await rm(filePath,{force:true});
      }
    })().finally(()=>{ this.scanPromise=null; });
    return this.scanPromise;
  }

  async ingest(filePath,{background=false}={}){
    const preparation=this.prepareQueue.then(()=>this.prepare(filePath));
    this.prepareQueue=preparation.catch(()=>{});
    const accepted=await preparation;
    if(!accepted || accepted.duplicate || accepted.alreadyKnown || accepted.failed) return accepted;
    const processing=this.processQueue.then(()=>this.process(accepted));
    this.processQueue=processing.catch(()=>{});
    if(background) return {...accepted,queued:true};
    return processing;
  }

  async prepare(filePath){
    let info;
    try{info=await stat(filePath);}catch(error){if(error.code==='ENOENT') return null;throw error;}
    const signature=`${info.size}:${info.mtimeMs}`;
    const relativePath=relative(this.inboxDir,filePath);
    if(this.known.get(filePath)===signature){
      const item=this.store.findBySourcePath(relativePath);
      return item?{item,duplicate:false,alreadyKnown:true}:null;
    }
    this.known.set(filePath,signature);
    const category=relativePath.includes('/')?relativePath.split('/')[0]:'Outros';
    const digest=await checksum(filePath);
    const existing=this.store.findByChecksum(digest);
    if(existing) return {item:existing,duplicate:true};

    const item=await this.store.create({
      fileName:basename(filePath),category,source:'vps-inbox',sourcePath:relativePath,
      size:info.size,checksum:digest,status:'processing',processingStage:'preserving'
    });
    try{
      const originalPath=join(this.originalsDir,`${item.id}${extname(filePath).toLowerCase()}`);
      await copyFile(filePath,originalPath);
      const prepared=await this.store.update(item.id,{originalPath,processingStage:'analyzing'});
      await rm(filePath,{force:true});
      return {item:prepared,originalPath,filePath,duplicate:false};
    }catch(error){
      const failed=await this.store.update(item.id,{status:'error',processingStage:'error',error:error.message});
      return {item:failed,duplicate:false,failed:true};
    }
  }

  async process({item,originalPath}){
    try{
      const analysis=await analyzeAudio(originalPath,this.audioSettings);
      await this.store.update(item.id,{
        duration:analysis.duration,title:displayTitle(analysis,item.fileName),artist:analysis.artist,
        album:analysis.album,year:analysis.year,sourceFormat:analysis.sourceFormat,
        inputLufs:analysis.inputLufs,cueIn:analysis.cueIn,cueOut:analysis.cueOut,
        processingStage:'converting'
      });
      const processedPath=await convertAudio(originalPath,{
        processedDir:this.processedDir,id:item.id,targetLufs:this.audioSettings.targetLufs,
        truePeakDb:this.audioSettings.truePeakDb,measurement:analysis.loudness
      });
      await this.store.update(item.id,{processedPath,processingStage:'verifying'});
      const output=await analyzeAudio(processedPath,this.audioSettings);
      const ready=await this.store.update(item.id,{
        processedPath,duration:output.duration,outputFormat:'MP3 320 kbps · 44,1 kHz',
        outputLufs:output.inputLufs,truePeak:output.inputTruePeak,
        cueIn:output.cueIn,cueOut:output.cueOut,processingStage:'ready',status:'ready',error:''
      });
      return {item:ready,duplicate:false};
    }catch(error){
      const failed=await this.store.update(item.id,{status:'error',processingStage:'error',error:error.message});
      return {item:failed,duplicate:false};
    }
  }

  async reprocess(id,{background=true}={}){
    const item=await this.store.markForReprocess(id);
    if(!item) return null;
    const processing=this.processQueue.then(async()=>{
      await access(item.originalPath);
      return this.process({item,originalPath:item.originalPath});
    }).catch(async error=>{
      const failed=await this.store.update(item.id,{status:'error',processingStage:'error',error:error.message});
      return {item:failed,duplicate:false};
    });
    this.processQueue=processing.catch(()=>{});
    return background?{item,queued:true}:processing;
  }

  stop(){
    if(this.timer) clearInterval(this.timer);
  }
}
