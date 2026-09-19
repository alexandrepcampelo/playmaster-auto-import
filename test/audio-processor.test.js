import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeAudio,convertAudio,probeAudio } from '../src/audio-processor.js';

const execute=promisify(execFile);
const hasFfmpeg=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;

test('converte WAV, normaliza e calcula Cue In/Cue Out',{skip:!hasFfmpeg},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'playmaster-audio-'));
  try{
    const input=join(directory,'entrada.wav');
    await execute('ffmpeg',[
      '-y','-hide_banner','-loglevel','error',
      '-f','lavfi','-i','anullsrc=r=44100:cl=mono:d=0.25',
      '-f','lavfi','-i','sine=frequency=1000:sample_rate=44100:duration=0.60',
      '-f','lavfi','-i','anullsrc=r=44100:cl=mono:d=0.35',
      '-filter_complex','[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]','-map','[out]',
      '-metadata','title=Vinheta de Teste','-metadata','artist=PlayMaster',input
    ]);
    const settings={targetLufs:-16,truePeakDb:-1,silenceThresholdDb:-45,silenceDuration:0.12};
    const analysis=await analyzeAudio(input,settings);
    assert.equal(analysis.title,'Vinheta de Teste');
    assert.equal(analysis.artist,'PlayMaster');
    assert.ok(analysis.cueIn>=0.2 && analysis.cueIn<=0.3);
    assert.ok(analysis.cueOut>=0.8 && analysis.cueOut<=0.9);

    const output=await convertAudio(input,{processedDir:directory,id:'PM-TEST',targetLufs:-16,truePeakDb:-1,measurement:analysis.loudness});
    const processed=await probeAudio(output);
    assert.equal(processed.sourceFormat,'MP3');
    assert.equal(processed.sampleRate,44100);
    assert.equal(processed.channels,2);
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
});
