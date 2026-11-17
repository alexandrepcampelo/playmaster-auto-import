import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyIntoLocalLibrary } from '../agent/src/local-library.js';

test('copia áudio para categoria local sem enviar para servidor',async()=>{
  const base=await mkdtemp(join(tmpdir(),'pm-local-library-'));
  try{
    const source=join(base,'entrada');const library=join(base,'biblioteca');
    await mkdir(source);const audio=join(source,'vinheta.wav');await writeFile(audio,Buffer.from('audio-local'));
    const config={libraryRoot:library};
    const file={path:audio,fileName:'vinheta.wav',category:'Vinhetas'};
    const first=await copyIntoLocalLibrary(config,file);
    assert.equal(first.duplicate,false);
    assert.equal(await readFile(first.destination,'utf8'),'audio-local');
    const second=await copyIntoLocalLibrary(config,file);
    assert.equal(second.duplicate,true);
    assert.equal(second.destination,first.destination);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('não aceita extensão não suportada',async()=>{
  const base=await mkdtemp(join(tmpdir(),'pm-local-library-'));
  try{
    const source=join(base,'entrada.exe');await writeFile(source,'no');
    await assert.rejects(()=>copyIntoLocalLibrary({libraryRoot:join(base,'lib')},{path:source,fileName:'entrada.exe',category:'Outros'}),/Formato de áudio/);
  }finally{await rm(base,{recursive:true,force:true});}
});
