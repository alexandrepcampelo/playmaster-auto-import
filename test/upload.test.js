import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeMetadata,safeCategory,safeFileName,safeRelativeAudioPath,safeSubcategory } from '../src/upload.js';

test('decodifica metadados UTF-8 enviados pelo agente',()=>{
  const encoded=Buffer.from('Música de Verão.mp3').toString('base64');
  assert.equal(decodeMetadata(encoded),'Música de Verão.mp3');
});

test('aceita somente arquivos de áudio e neutraliza caminhos',()=>{
  assert.equal(safeFileName('../../vinheta?.MP3'),'vinheta-.mp3');
  assert.throws(()=>safeFileName('arquivo.exe'),/Formato de áudio/);
  assert.equal(safeCategory('../Comerciais/2026'),'---Comerciais-2026');
});

test('normaliza a subcategoria da Hora Certa sem permitir caminhos',()=>{
  assert.equal(safeSubcategory('Voz Masculina'),'Voz Masculina');
  assert.equal(safeSubcategory('Voz Masculina/01'),'Voz Masculina/01');
  assert.equal(safeSubcategory('../Voz/Feminina'),'Voz/Feminina');
  assert.equal(safeSubcategory(''),'');
});

test('preserva a hierarquia da pasta selecionada sem aceitar traversal',()=>{
  assert.equal(safeRelativeAudioPath('Músicas/Pop/Anos 90/faixa.mp3','faixa.mp3'),'Músicas/Pop/Anos 90/faixa.mp3');
  assert.throws(()=>safeRelativeAudioPath('Músicas/../segredo/faixa.mp3','faixa.mp3'),/caminho relativo/);
  assert.equal(safeRelativeAudioPath('faixa.mp3','faixa.mp3'),'');
});
