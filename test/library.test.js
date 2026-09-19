import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLibraryQuery,publicLibraryItem,validateAcknowledgement } from '../src/library.js';

test('expõe somente os dados seguros da biblioteca central',()=>{
  const item=publicLibraryItem({
    id:'PM-2026-00000001',status:'ready',fileName:'vinheta.wav',title:'Vinheta',artist:'Rádio',
    category:'Vinhetas',duration:5.25,checksum:'abc',size:123,sourceFormat:'WAV',outputFormat:'MP3',
    inputLufs:-20,outputLufs:-16,truePeak:-1,cueIn:0.2,cueOut:5,publishedAt:'2026-09-19T12:00:00.000Z',
    processedPath:'/segredo/processado.mp3',originalPath:'/segredo/original.wav',deliveries:{}
  });
  assert.equal(item.audioUrl,'/api/library/PM-2026-00000001/audio');
  assert.equal(item.processedPath,undefined);
  assert.equal(item.originalPath,undefined);
});

test('valida consulta incremental e confirmação do consumidor',()=>{
  const params=new URLSearchParams('limit=50&category=Vinhetas&consumer=traffic&after=2026-09-19T12:00:00Z');
  assert.deepEqual(parseLibraryQuery(params),{
    limit:50,category:'Vinhetas',consumer:'traffic',after:'2026-09-19T12:00:00.000Z'
  });
  assert.deepEqual(validateAcknowledgement({consumer:'Traffic',status:'synced',message:'ok'}),{
    consumer:'traffic',status:'synced',message:'ok'
  });
  assert.throws(()=>validateAcknowledgement({consumer:'windows',status:'synced'}),/traffic ou studio/);
  assert.throws(()=>parseLibraryQuery(new URLSearchParams('consumer=windows')),/traffic ou studio/);
});
