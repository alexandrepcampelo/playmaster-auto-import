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

test('publica itens prontos e registra entregas sem republicá-los',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'playmaster-auto-import-'));
  try{
    const store=new ImportStore({dataDir:directory,stationCode:'PM'});
    await store.init();
    const created=await store.create({fileName:'comercial.wav',category:'Comerciais',status:'processing'});
    const ready=await store.update(created.id,{status:'ready',processedPath:'/audio.mp3'});
    assert.ok(ready.publishedAt);
    assert.equal(store.ready({after:'2000-01-01T00:00:00.000Z'}).length,1);
    const delivery=await store.acknowledge(created.id,{consumer:'traffic',status:'synced',message:'importado'});
    assert.equal(delivery.status,'synced');
    assert.equal(store.ready({after:ready.publishedAt}).length,0);
    assert.equal(store.ready({consumer:'traffic'}).length,0);
    assert.equal(store.ready({consumer:'studio'}).length,1);

    const restored=new ImportStore({dataDir:directory,stationCode:'PM'});
    await restored.init();
    assert.equal(restored.findById(created.id).deliveries.traffic.status,'synced');
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});

test('corrige categoria, envia à lixeira, restaura e remove definitivamente',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'playmaster-auto-import-'));
  try{
    const store=new ImportStore({dataDir:directory,stationCode:'PM'});
    await store.init();
    const created=await store.create({fileName:'comercial.wav',category:'Músicas',status:'processing'});
    await store.update(created.id,{status:'ready',processedPath:'/audio.mp3'});
    const revised=await store.revise(created.id,{category:'Comerciais',title:'Comercial corrigido'});
    assert.equal(revised.category,'Comerciais');
    assert.equal(revised.title,'Comercial corrigido');

    await store.trash(created.id);
    assert.equal(store.list().length,0);
    assert.equal(store.trashed().length,1);
    assert.equal(store.counts().deleted,1);
    assert.equal(store.ready().length,0);

    const restored=await store.restore(created.id);
    assert.equal(restored.status,'ready');
    assert.equal(store.list().length,1);

    await store.trash(created.id);
    const removed=await store.remove(created.id);
    assert.equal(removed.id,created.id);
    assert.equal(store.findById(created.id),null);
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});
