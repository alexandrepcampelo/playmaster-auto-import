import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class CatalogDirectoryStore{
  constructor({dataDir,libraryDir}){
    this.filePath=join(dataDir,'catalog-directories.json');
    this.libraryDir=libraryDir;
    this.libraryBasePath=libraryDir;
    this.items=[];
    this.writeQueue=Promise.resolve();
  }

  async init(){
    await mkdir(join(this.filePath,'..'),{recursive:true});
    await mkdir(this.libraryDir,{recursive:true});
    try{
      const saved=JSON.parse(await readFile(this.filePath,'utf8'));
      this.items=Array.isArray(saved.items)?saved.items:[];
      let migrated=false;
      for(const item of this.items){
        const parent=this.items.find(row=>row.id===item.parentId);
        const expected=parent?join(parent.path,item.name):join(this.libraryDir,item.name);
        if(item.path!==expected || item.destinationPath!==expected){
          item.path=expected;
          item.destinationPath=expected;
          migrated=true;
        }
      }
      if(migrated) await this.persist();
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      this.items=[];
      await this.persist();
    }
  }

  list(){return [...this.items].sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name,'pt-BR'):a.type==='folder'?-1:1);}
  find(id){return this.items.find(item=>item.id===id)||null;}

  async create(input){
    const now=new Date().toISOString();
    const item={id:randomUUID(),...input,destinationPath:input.path,createdAt:now,updatedAt:now};
    this.items.push(item);
    await this.persist();
    return item;
  }

  async update(id,input){
    const index=this.items.findIndex(item=>item.id===id);
    if(index<0) return null;
    this.items[index]={...this.items[index],...input,destinationPath:input.path,updatedAt:new Date().toISOString()};
    await this.persist();
    return this.items[index];
  }

  async remove(id){
    const index=this.items.findIndex(item=>item.id===id);
    if(index<0) return null;
    const [item]=this.items.splice(index,1);
    await this.persist();
    return item;
  }

  persist(){
    this.writeQueue=this.writeQueue.then(async()=>{
      const temporary=this.filePath+'.tmp';
      await writeFile(temporary,JSON.stringify({version:2,items:this.items},null,2));
      await rename(temporary,this.filePath);
    });
    return this.writeQueue;
  }
}
