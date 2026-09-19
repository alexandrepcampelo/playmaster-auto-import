import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function positiveInteger(value,fallback){
  const parsed=Number(value);
  return Number.isInteger(parsed) && parsed>0?parsed:fallback;
}

export async function loadConfig(){
  const configPath=resolve(process.env.PLAYMASTER_AGENT_CONFIG||'./agent.config.json');
  const input=JSON.parse(await readFile(configPath,'utf8'));
  const apiToken=String(process.env.PLAYMASTER_API_TOKEN||input.apiToken||'');
  if(apiToken.length<32) throw new Error('Configure PLAYMASTER_API_TOKEN com o token da integração.');
  if(!Array.isArray(input.folders) || input.folders.length===0) throw new Error('Configure ao menos uma pasta monitorada.');
  return {
    apiUrl:String(input.apiUrl||'').replace(/\/+$/,''),
    apiToken,
    scanIntervalMs:positiveInteger(input.scanIntervalMs,5000),
    stateFile:resolve(input.stateFile||'./data/agent-state.json'),
    folders:input.folders.map(folder=>({path:resolve(folder.path),category:String(folder.category||'Outros')}))
  };
}
