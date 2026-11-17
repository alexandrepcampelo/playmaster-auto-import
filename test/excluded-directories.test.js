import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExcludedDirectoryStore,normalizeExcludedDirectory } from '../src/excluded-directories.js';

test('normalizes relative exclusion paths and rejects traversal',()=>{
  assert.equal(normalizeExcludedDirectory('Músicas\\Rock Nacional'),'Músicas/Rock Nacional');
  assert.throws(()=>normalizeExcludedDirectory('../fora'),/caminho informado/);
  assert.throws(()=>normalizeExcludedDirectory('/etc'),/relativo/);
});

test('persists exclusions, matches descendants and restores a directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'pm-exclusions-'));
  try{
    const store=new ExcludedDirectoryStore({dataDir:root,libraryDir:join(root,'library')});
    await store.init();
    const item=await store.add('Músicas/Rock Nacional');
    assert.equal(store.isExcluded('Músicas/Rock Nacional'),true);
    assert.equal(store.isExcluded('Músicas/Rock Nacional/Anos 80'),true);
    assert.equal(store.isExcluded('Músicas/Pop'),false);
    const restored=await store.remove(item.id);
    assert.equal(restored.path,'Músicas/Rock Nacional');
    assert.equal(store.isExcluded('Músicas/Rock Nacional'),false);
    const saved=JSON.parse(await readFile(join(root,'catalog-exclusions.json'),'utf8'));
    assert.deepEqual(saved.items,[]);
  }finally{await rm(root,{recursive:true,force:true});}
});
