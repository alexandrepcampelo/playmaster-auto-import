import { mkdir,readFile,rename,writeFile } from 'node:fs/promises';
import { join,isAbsolute,relative,resolve,sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export function normalizeExcludedDirectory(value){
  const raw=String(value||'').trim().replace(/\\\\/g,'/');
  if(!raw||raw.startsWith('/')||/^[A-Za-z]:/.test(raw)) throw Object.assign(new Error('Informe um caminho relativo à Biblioteca.'),{statusCode:400});
  const parts=raw.split('/').filter(Boolean);
  if(!parts.length||parts.some(part=>part==='.'||part==='..'||/[<>:"|?*\\x00-\\x1f]/.test(part))) throw Object.assign(new Error('O caminho informado não é válido.'),{statusCode:400});
  return parts.join('/');
}

export class ExcludedDirectoryStore{
  constructor({dataDir,libraryDir}){
    this.filePath=join(dataDir,'catalog-exclusions.json');
    this.libraryDir=resolve(libraryDir);
    this.items=[];
    this.writeQueue=Promise.resolve();
  }
  async init(){
    await mkdir(this.filePath.replace(/[\\/][^\\/]+$/,''),{recursive:true});
    try{
      const saved=JSON.parse(await readFile(this.filePath,'utf8'));
      this.items=Array.isArray(saved.items)?saved.items:[];
    }catch(error){
      if(error.code!=='ENOENT') throw error;
      await this.persist();
    }
  }
  list(){return [...this.items].sort((a,b)=>a.path.localeCompare(b.path,'pt-BR'));}
  isExcluded(path){
    const normalized=String(path||'').replace(/\\\\/g,'/').replace(/^\\/+|\\/+$/g,'');
    return this.items.some(item=>normalized===item.path||normalized.startsWith(item.path+'/'));
  }
  async add(value){
    const path=normalizeExcludedDirectory(value);
    const fullPath=resolve(this.libraryDir,...path.split('/'));
    const rel=relative(this.libraryDir,fullPath);
    if(!rel||rel==='.'||rel.startsWith('..'+sep)||isAbsolute(rel)) throw Object.assign(new Error('O diretório deve estar dentro da Biblioteca.'),{statusCode:400});
    const existing=this.items.find(item=>item.path.toLocaleLowerCase('pt-BR')===path.toLocaleLowerCase('pt-BR'));
    if(existing) return existing;
    const item={id:randomUUID(),path,createdAt:new Date().toISOString()};
    this.items.push(item);
    await this.persist();
    return item;
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
