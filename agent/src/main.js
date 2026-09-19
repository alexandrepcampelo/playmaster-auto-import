import { loadConfig } from './config.js';
import { discoverFiles } from './files.js';
import { AgentState } from './state.js';
import { uploadFile } from './client.js';

const config=await loadConfig();
const state=new AgentState(config.stateFile);
await state.init();
let running=false;

async function cycle(){
  if(running) return;
  running=true;
  try{
    const files=await discoverFiles(config.folders);
    for(const file of files) state.observe(file);
    await state.persist();

    let pending;
    while((pending=state.next())){
      state.markUploading(pending.path);
      await state.persist();
      try{
        const result=await uploadFile(config,pending);
        state.markSent(pending.path,result);
        console.log(`${result.duplicate?'Duplicado':'Enviado'}: ${pending.fileName}${result.item?.id?` (${result.item.id})`:''}`);
      }catch(error){
        state.markError(pending.path,error);
        console.error(`Falha ao enviar ${pending.fileName}: ${error.message}`);
      }
      await state.persist();
    }
  }catch(error){
    console.error(`Falha no ciclo do agente: ${error.message}`);
  }finally{
    running=false;
  }
}

console.log(`PlayMaster Agent ativo. Monitorando ${config.folders.length} pasta(s).`);
await cycle();
setInterval(()=>void cycle(),config.scanIntervalMs);
