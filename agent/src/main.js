import { loadConfig } from './config.js';
import { discoverFiles } from './files.js';
import { AgentState } from './state.js';
import { uploadFile } from './client.js';
import { syncLibraryDirectories } from './directories.js';
import { copyIntoLocalLibrary } from './local-library.js';

const config=await loadConfig();
const state=new AgentState(config.stateFile);
await state.init();
let running=false;

async function cycle(){
  if(running) return;
  running=true;
  try{
    if(config.mode==='remote-upload'&&config.libraryRoot){
      try{
        const sync=await syncLibraryDirectories(config);
        if(sync&&(sync.created||sync.existing)) console.log(`Biblioteca local sincronizada: ${sync.created} criada(s), ${sync.existing} já existente(s).`);
      }catch(error){console.error(`Falha ao sincronizar pastas da Biblioteca: ${error.message}`);}
    }
    const files=await discoverFiles(config.folders);
    for(const file of files) state.observe(file);
    await state.persist();

    let pending;
    while((pending=state.next())){
      state.markUploading(pending.path);
      await state.persist();
      try{
        if(config.mode==='local-library'){
          const result=await copyIntoLocalLibrary(config,pending);
          state.markCopied(pending.path,result);
          console.log(`${result.duplicate?'Já existente':'Copiado para a biblioteca'}: ${pending.fileName} → ${result.destination}`);
        }else{
          const result=await uploadFile(config,pending);
          state.markSent(pending.path,result);
          console.log(`${result.duplicate?'Duplicado':'Enviado'}: ${pending.fileName}${result.item?.id?` (${result.item.id})`:''}`);
        }
      }catch(error){
        state.markError(pending.path,error);
        console.error(`Falha ao processar ${pending.fileName}: ${error.message}`);
      }
      await state.persist();
    }
  }catch(error){
    console.error(`Falha no ciclo do agente: ${error.message}`);
  }finally{running=false;}
}

console.log(`PlayMaster Agent ativo em modo ${config.mode}. Monitorando ${config.folders.length} pasta(s).`);
await cycle();
setInterval(()=>void cycle(),config.scanIntervalMs);
