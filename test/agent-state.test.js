import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentState } from '../agent/src/state.js';

test('aguarda o arquivo estabilizar e mantém fila após reiniciar',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'playmaster-agent-'));
  const stateFile=join(directory,'state.json');
  try{
    const state=new AgentState(stateFile);
    await state.init();
    const file={path:'C:\\Audio\\teste.mp3',fileName:'teste.mp3',category:'Músicas',size:100,mtimeMs:1,fingerprint:'100:1'};
    state.observe(file,1);
    assert.equal(state.next(1),null);
    state.observe(file,2);
    assert.equal(state.next(2).fileName,'teste.mp3');
    await state.persist();

    const restored=new AgentState(stateFile);
    await restored.init();
    assert.equal(restored.next(3).category,'Músicas');
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});
