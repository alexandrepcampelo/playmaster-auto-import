import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class AgentState{
  constructor(filePath){
    this.filePath=filePath;
    this.data={version:1,files:{}};
    this.writeQueue=Promise.resolve();
  }

  async init(){
    await mkdir(dirname(this.filePath),{recursive:true});
    try{
      const saved=JSON.parse(await readFile(this.filePath,'utf8'));
      if(saved?.files){
        this.data=saved;
        for(const file of Object.values(this.data.files)){
          if(file.status==='uploading') file.status='pending';
        }
      }
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      await this.persist();
    }
  }

  observe(file,now=Date.now()){
    const current=this.data.files[file.path];
    if(!current || current.fingerprint!==file.fingerprint){
      this.data.files[file.path]={...file,status:'observing',stableScans:0,attempts:0,nextAttemptAt:0,updatedAt:now};
      return;
    }
    Object.assign(current,file,{updatedAt:now});
    if(current.status==='observing'){
      current.stableScans+=1;
      if(current.stableScans>=1) current.status='pending';
    }
  }

  next(now=Date.now()){
    return Object.values(this.data.files).find(file=>['pending','error'].includes(file.status) && file.nextAttemptAt<=now)||null;
  }

  markUploading(path){
    const file=this.data.files[path];
    if(file) file.status='uploading';
  }

  markSent(path,result){
    const file=this.data.files[path];
    if(file) Object.assign(file,{status:'sent',remoteId:result?.item?.id||'',duplicate:Boolean(result?.duplicate),error:'',sentAt:Date.now()});
  }

  markError(path,error){
    const file=this.data.files[path];
    if(!file) return;
    file.attempts+=1;
    file.status='error';
    file.error=String(error.message||error);
    file.nextAttemptAt=Date.now()+Math.min(30*60_000,5_000*(2**Math.min(file.attempts-1,8)));
  }

  persist(){
    this.writeQueue=this.writeQueue.then(async()=>{
      const temporary=`${this.filePath}.tmp`;
      await writeFile(temporary,JSON.stringify(this.data,null,2));
      await rename(temporary,this.filePath);
    });
    return this.writeQueue;
  }
}
