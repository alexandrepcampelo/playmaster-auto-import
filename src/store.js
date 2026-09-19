import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class ImportStore{
  constructor({dataDir,stationCode}){
    this.dataDir=dataDir;
    this.stationCode=stationCode;
    this.filePath=join(dataDir,'imports.json');
    this.state={version:3,counter:0,items:[]};
    this.writeQueue=Promise.resolve();
  }

  async init(){
    await mkdir(this.dataDir,{recursive:true});
    try{
      const saved=JSON.parse(await readFile(this.filePath,'utf8'));
      if(saved && Array.isArray(saved.items)) this.state={
        version:3,
        counter:Number(saved.counter)||0,
        items:saved.items.map(item=>({
          ...item,
          publishedAt:item.publishedAt||(item.status==='ready'?(item.updatedAt||item.createdAt):''),
          deliveries:item.deliveries&&typeof item.deliveries==='object'?item.deliveries:{},
          deletedAt:String(item.deletedAt||''),
          deletedFromStatus:String(item.deletedFromStatus||'')
        }))
      };
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      await this.persist();
    }
  }

  list(limit=100){
    return this.state.items.filter(item=>item.status!=='deleted').slice(-Math.max(1,Math.min(Number(limit)||100,500))).reverse();
  }

  trashed(limit=100){
    return this.state.items.filter(item=>item.status==='deleted').sort((left,right)=>String(right.deletedAt).localeCompare(String(left.deletedAt))).slice(0,Math.max(1,Math.min(Number(limit)||100,500)));
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

  ready({limit=100,category='',consumer='',after=''}={}){
    return this.state.items
      .filter(item=>item.status==='ready')
      .filter(item=>!category || item.category===category)
      .filter(item=>!consumer || item.deliveries?.[consumer]?.status!=='synced')
      .filter(item=>!after || String(item.publishedAt||item.updatedAt||item.createdAt)>after)
      .sort((left,right)=>String(left.publishedAt||left.updatedAt||left.createdAt).localeCompare(String(right.publishedAt||right.updatedAt||right.createdAt)))
      .slice(0,Math.max(1,Math.min(Number(limit)||100,500)));
  }

  counts(){
    return this.state.items.reduce((result,item)=>{
      if(item.status==='deleted'){
        result.deleted+=1;
        return result;
      }
      result.total+=1;
      result[item.status]=(result[item.status]||0)+1;
      return result;
    },{total:0,received:0,processing:0,ready:0,error:0,deleted:0});
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
      publishedAt:'',
      deliveries:{},
      deletedAt:'',
      deletedFromStatus:'',
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
    const previousStatus=item.status;
    for(const key of allowed){
      if(Object.hasOwn(patch,key)) item[key]=patch[key];
    }
    item.updatedAt=new Date().toISOString();
    if(item.status==='ready' && previousStatus!=='ready') item.publishedAt=item.updatedAt;
    await this.persist();
    return item;
  }

  async acknowledge(id,{consumer,status,message}){
    const item=this.findById(id);
    if(!item || item.status!=='ready') return null;
    item.deliveries=item.deliveries&&typeof item.deliveries==='object'?item.deliveries:{};
    item.deliveries[consumer]={status,message:String(message||''),updatedAt:new Date().toISOString()};
    await this.persist();
    return item.deliveries[consumer];
  }

  async revise(id,patch){
    const item=this.findById(id);
    if(!item || item.status==='deleted') return null;
    const allowed=['category','title','artist','album','year'];
    for(const key of allowed){
      if(Object.hasOwn(patch,key)) item[key]=String(patch[key]??'').trim();
    }
    item.updatedAt=new Date().toISOString();
    if(item.status==='ready') item.publishedAt=item.updatedAt;
    item.deliveries={};
    await this.persist();
    return item;
  }

  async trash(id){
    const item=this.findById(id);
    if(!item || item.status==='deleted') return null;
    item.deletedFromStatus=item.status;
    item.status='deleted';
    item.deletedAt=new Date().toISOString();
    item.updatedAt=item.deletedAt;
    await this.persist();
    return item;
  }

  async restore(id){
    const item=this.findById(id);
    if(!item || item.status!=='deleted') return null;
    const restoredStatus=['ready','error','received','processing'].includes(item.deletedFromStatus)?item.deletedFromStatus:(item.processedPath?'ready':'error');
    item.status=restoredStatus;
    item.processingStage=restoredStatus==='ready'?'ready':item.processingStage;
    item.deletedAt='';
    item.deletedFromStatus='';
    item.updatedAt=new Date().toISOString();
    if(restoredStatus==='ready') item.publishedAt=item.updatedAt;
    item.deliveries={};
    await this.persist();
    return item;
  }

  async markForReprocess(id){
    const item=this.findById(id);
    if(!item || item.status==='deleted' || !item.originalPath) return null;
    item.status='processing';
    item.processingStage='analyzing';
    item.error='';
    item.publishedAt='';
    item.deliveries={};
    item.updatedAt=new Date().toISOString();
    await this.persist();
    return item;
  }

  async remove(id){
    const index=this.state.items.findIndex(item=>item.id===id && item.status==='deleted');
    if(index<0) return null;
    const [item]=this.state.items.splice(index,1);
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
