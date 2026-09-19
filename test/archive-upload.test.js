import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedAudio,safeArchiveEntry } from '../src/archive-upload.js';

test('aceita caminhos internos seguros e identifica áudios no ZIP',()=>{
  assert.equal(safeArchiveEntry('campanha/comercial.mp3'),'campanha/comercial.mp3');
  assert.equal(isSupportedAudio('subpasta/Vinheta.WAV'),true);
  assert.equal(isSupportedAudio('capa.jpg'),false);
});

test('bloqueia caminhos perigosos dentro do ZIP',()=>{
  assert.throws(()=>safeArchiveEntry('../../etc/passwd'),/não permitido/);
  assert.throws(()=>safeArchiveEntry('/arquivo.mp3'),/não permitido/);
  assert.throws(()=>safeArchiveEntry('C:\\arquivo.mp3'),/não permitido/);
});
