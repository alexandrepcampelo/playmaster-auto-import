import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class ImportStore{
  constructor({dataDir,stationCode}){
    this.dataDir=dataDir;
    this.stationCode=stationCode;
    this.filePath=join(dataDir,'imports.json');
    this.state={version:1,counter:0,items:[]};
    this.writeQueue=Promise.resolve();
  }

  async init(){
    await mkdir(this.dataDir,{recursive:true});
    try{
      const saved=JSON.parse(await readFile(this.filePath,'utf8'));
      if(saved && Array.isArray(saved.items)) this.state={version:1,counter:Number(saved.counter)||0,items:saved.items};
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      await this.persist();
    }
  }

  list(limit=100){
    return this.state.items.slice(-Math.max(1,Math.min(Number(limit)||100,500))).reverse();
  }

  findByChecksum(checksum){
    return this.state.items.find(item=>item.checksum===checksum)||null;
  }

  findBySourcePath(sourcePath){
    return this.state.items.find(item=>item.sourcePath===sourcePath)||null;
  }

  findById(id){
    return this.state.items.find(item=>item.id===id)||null;
  }

  counts(){
    return this.state.items.reduce((result,item)=>{
      result.total+=1;
      result[item.status]=(result[item.status]||0)+1;
      return result;
    },{total:0,received:0,processing:0,ready:0,error:0});
  }

  async create(input){
    const next=this.state.counter+1;
    const year=new Date().getUTCFullYear();
    const item={
      id:`${this.stationCode}-${year}-${String(next).padStart(8,'0')}`,
      fileName:String(input.fileName||'audio'),
      category:String(input.category||'Outros'),
      source:String(input.source||'auto-import'),
      sourcePath:String(input.sourcePath||''),
      originalPath:String(input.originalPath||''),
      processedPath:String(input.processedPath||''),
      checksum:String(input.checksum||''),
      size:Number(input.size)||0,
      duration:Number(input.duration)||0,
      title:String(input.title||''),
      artist:String(input.artist||''),
      album:String(input.album||''),
      year:String(input.year||''),
      sourceFormat:String(input.sourceFormat||''),
      outputFormat:String(input.outputFormat||''),
      inputLufs:null,
      outputLufs:null,
      truePeak:null,
      cueIn:0,
      cueOut:0,
      processingStage:String(input.processingStage||''),
      status:String(input.status||'received'),
      error:'',
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    this.state.counter=next;
    this.state.items.push(item);
    await this.persist();
    return item;
  }

  async update(id,patch){
    const item=this.state.items.find(row=>row.id===id);
    if(!item) return null;
    const allowed=['category','originalPath','processedPath','checksum','duration','title','artist','album','year','sourceFormat','outputFormat','inputLufs','outputLufs','truePeak','cueIn','cueOut','processingStage','status','error'];
    for(const key of allowed){
      if(Object.hasOwn(patch,key)) item[key]=patch[key];
    }
    item.updatedAt=new Date().toISOString();
    await this.persist();
    return item;
  }

  persist(){
    this.writeQueue=this.writeQueue.then(async()=>{
      const temporary=`${this.filePath}.tmp`;
      await writeFile(temporary,JSON.stringify(this.state,null,2));
      await rename(temporary,this.filePath);
    });
    return this.writeQueue;
  }
}
