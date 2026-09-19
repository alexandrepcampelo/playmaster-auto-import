import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMetadata,safeCategory,safeFileName } from '../src/upload.js';

test('decodifica metadados UTF-8 enviados pelo agente',()=>{
  const encoded=Buffer.from('Música de Verão.mp3').toString('base64');
  assert.equal(decodeMetadata(encoded),'Música de Verão.mp3');
});

test('aceita somente arquivos de áudio e neutraliza caminhos',()=>{
  assert.equal(safeFileName('../../vinheta?.MP3'),'vinheta-.mp3');
  assert.throws(()=>safeFileName('arquivo.exe'),/Formato de áudio/);
  assert.equal(safeCategory('../Comerciais/2026'),'---Comerciais-2026');
});
