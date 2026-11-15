import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const defaults=[
  ['Músicas','music'],['Comerciais','commercial'],['Vinhetas','megaphone'],
  ['Intercons','link'],['Trilhas','wave'],['Chamadas','headphones'],
  ['Locução','microphone'],['Voice Track','voice'],['Hora Certa','clock'],
  ['Temperatura','thermometer'],['Jornalismo','news'],['Outros','folder']
];

export class CatalogDirectoryStore{
  constructor({dataDir,inboxDir}){
    this.filePath=join(dataDir,'catalog-directories.json');
    this.inboxDir=inboxDir;
    this.items=[];
    this.writeQueue=Promise.resolve();
  }

  async init(){
    await mkdir(join(this.filePath,'..'),{recursive:true});
    try{
      const saved=JSON.parse(await readFile(this.filePath,'utf8'));
      this.items=Array.isArray(saved.items)?saved.items:[];
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      const now=new Date().toISOString();
      this.items=defaults.map(([name,icon])=>({
        id:randomUUID(),name,type:'folder',parentId:'',icon,
        path:join(this.inboxDir,name),autoCatalog:true,active:true,
        createdAt:now,updatedAt:now
      }));
      await this.persist();
    }
  }

  list(){return [...this.items].sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name,'pt-BR'):a.type==='folder'?-1:1);}
  find(id){return this.items.find(item=>item.id===id)||null;}

  async create(input){
    const now=new Date().toISOString();
    const item={id:randomUUID(),...input,createdAt:now,updatedAt:now};
    this.items.push(item);
    await this.persist();
    return item;
  }

  async update(id,input){
    const index=this.items.findIndex(item=>item.id===id);
    if(index<0) return null;
    this.items[index]={...this.items[index],...input,updatedAt:new Date().toISOString()};
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
      await writeFile(temporary,JSON.stringify({version:1,items:this.items},null,2));
      await rename(temporary,this.filePath);
    });
    return this.writeQueue;
  }
}
