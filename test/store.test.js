import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImportStore } from '../src/store.js';

test('gera IDs sequenciais e persistentes na VPS',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'playmaster-auto-import-'));
  try{
    const firstStore=new ImportStore({dataDir:directory,stationCode:'PM'});
    await firstStore.init();
    const first=await firstStore.create({fileName:'vinheta.wav'});
    assert.match(first.id,/^PM-\d{4}-00000001$/);

    const secondStore=new ImportStore({dataDir:directory,stationCode:'PM'});
    await secondStore.init();
    const second=await secondStore.create({fileName:'comercial.mp3'});
    assert.match(second.id,/^PM-\d{4}-00000002$/);
    assert.equal(secondStore.list().length,2);
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});
