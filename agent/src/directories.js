import { mkdir,lstat,realpath } from 'node:fs/promises';
import { dirname,join,resolve,sep } from 'node:path';

async function report(config,payload){
  try{
    await fetch(`${config.apiUrl}/api/agent/library-sync`,{
      method:'POST',
      headers:{authorization:`Bearer ${config.apiToken}`,'content-type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(10000)
    });
  }catch{}
}

export async function syncLibraryDirectories(config){
  if(!config.libraryRoot) return null;
  const root=resolve(config.libraryRoot);
  let created=0;
  let existing=0;
  await report(config,{status:'syncing',libraryRoot:root});
  try{
    await mkdir(root,{recursive:true});
    const rootReal=await realpath(root);
    const response=await fetch(`${config.apiUrl}/api/agent/library-directories`,{
      headers:{authorization:`Bearer ${config.apiToken}`},
      signal:AbortSignal.timeout(15000)
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error||`Falha HTTP ${response.status} ao consultar pastas.`);
    if(!Array.isArray(payload.items)) throw new Error('Resposta de diretórios inválida.');
    for(const item of payload.items){
      const relativePath=String(item.relativePath||'');
      const segments=relativePath.split('/');
      if(!relativePath||segments.some(part=>!part||part==='.'||part==='..'||/[\\\\<>:"|?*\\x00-\\x1f]/.test(part))) continue;
      let current=rootReal;
      for(const segment of segments){
        const candidate=join(current,segment);
        let wasCreated=false;
        try{
          await mkdir(candidate);
          wasCreated=true;
        }catch(error){
          if(error.code!=='EEXIST') throw error;
        }
        const info=await lstat(candidate);
        if(info.isSymbolicLink()||!info.isDirectory()) throw new Error(`Caminho existente não é uma pasta segura: ${candidate}`);
        const actual=await realpath(candidate);
        if(actual!==rootReal&&!actual.startsWith(rootReal+sep)) throw new Error('A pasta de destino aponta para fora da Biblioteca autorizada.');
        current=actual;
        if(wasCreated) created+=1;
      }
      if(segments.length&&created===0) existing+=1;
    }
    await report(config,{status:'connected',libraryRoot:rootReal,created,existing});
    return {created,existing,libraryRoot:rootReal};
  }catch(error){
    await report(config,{status:'error',libraryRoot:root,error:error.message});
    throw error;
  }
}
