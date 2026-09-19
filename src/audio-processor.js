import { spawn } from 'node:child_process';
import { mkdir,rename,rm } from 'node:fs/promises';
import { basename,extname,join } from 'node:path';
import { randomUUID } from 'node:crypto';

function run(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
    const stdout=[];
    const stderr=[];
    child.stdout.on('data',chunk=>stdout.push(chunk));
    child.stderr.on('data',chunk=>stderr.push(chunk));
    child.on('error',error=>reject(new Error(`${command} não está disponível: ${error.message}`)));
    child.on('close',code=>{
      const result={stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')};
      if(code===0) resolve(result);
      else reject(new Error(`${command} encerrou com código ${code}: ${result.stderr.slice(-1200)}`));
    });
  });
}

function number(value,fallback=null){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:fallback;
}

function rounded(value,digits=2){
  return Number.isFinite(value)?Number(value.toFixed(digits)):null;
}

function tagsFrom(probe){
  const formatTags=probe.format?.tags||{};
  const streamTags=probe.streams?.find(stream=>stream.codec_type==='audio')?.tags||{};
  const tags={...streamTags,...formatTags};
  const read=(...keys)=>{
    const match=Object.entries(tags).find(([key])=>keys.includes(key.toLowerCase()));
    return String(match?.[1]||'').trim();
  };
  return {title:read('title'),artist:read('artist','album_artist'),album:read('album'),year:read('date','year').slice(0,4)};
}

export async function probeAudio(filePath){
  const {stdout}=await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',filePath]);
  const probe=JSON.parse(stdout);
  const audio=probe.streams?.find(stream=>stream.codec_type==='audio');
  if(!audio) throw new Error('O arquivo não contém uma faixa de áudio válida.');
  const duration=number(probe.format?.duration,number(audio.duration,0));
  return {
    duration:rounded(duration,3)||0,
    sourceFormat:String(audio.codec_name||extname(filePath).slice(1)||'desconhecido').toUpperCase(),
    sampleRate:number(audio.sample_rate,0)||0,
    channels:number(audio.channels,0)||0,
    bitRate:number(probe.format?.bit_rate,number(audio.bit_rate,0))||0,
    ...tagsFrom(probe)
  };
}

function loudnessJson(log){
  const matches=[...log.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if(!matches.length) return {};
  try{return JSON.parse(matches.at(-1)[0]);}catch{return {};}
}

function cuePoints(log,duration){
  const events=[...log.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)].map(match=>({type:match[1],time:Number(match[2])}));
  let cueIn=0;
  if(events[0]?.type==='start' && events[0].time<=0.1){
    const firstEnd=events.find(event=>event.type==='end');
    if(firstEnd) cueIn=firstEnd.time;
  }
  let cueOut=duration;
  const lastStart=[...events].reverse().find(event=>event.type==='start');
  if(lastStart && lastStart.time>duration*0.5){
    const laterEnd=events.find(event=>event.type==='end' && event.time>lastStart.time);
    if(!laterEnd || laterEnd.time>=duration-0.15) cueOut=lastStart.time;
  }
  return {cueIn:rounded(Math.max(0,cueIn),3)||0,cueOut:rounded(Math.max(cueIn,cueOut),3)||duration};
}

export async function analyzeAudio(filePath,{targetLufs,truePeakDb,silenceThresholdDb,silenceDuration}){
  const probe=await probeAudio(filePath);
  const filter=`silencedetect=noise=${silenceThresholdDb}dB:d=${silenceDuration},loudnorm=I=${targetLufs}:LRA=11:TP=${truePeakDb}:print_format=json`;
  const {stderr}=await run('ffmpeg',['-hide_banner','-nostdin','-i',filePath,'-af',filter,'-f','null','-']);
  const loudness=loudnessJson(stderr);
  return {
    ...probe,
    ...cuePoints(stderr,probe.duration),
    inputLufs:number(loudness.input_i),
    inputTruePeak:number(loudness.input_tp),
    loudness
  };
}

function measuredLoudnorm(settings,measurement){
  const required=['input_i','input_lra','input_tp','input_thresh','target_offset'];
  const valid=required.every(key=>Number.isFinite(Number(measurement[key])));
  const base=`loudnorm=I=${settings.targetLufs}:LRA=11:TP=${settings.truePeakDb}`;
  if(!valid) return `${base}:print_format=summary`;
  return `${base}:measured_I=${measurement.input_i}:measured_LRA=${measurement.input_lra}:measured_TP=${measurement.input_tp}:measured_thresh=${measurement.input_thresh}:offset=${measurement.target_offset}:linear=true:print_format=summary`;
}

export async function convertAudio(inputPath,{processedDir,id,targetLufs,truePeakDb,measurement}){
  await mkdir(processedDir,{recursive:true});
  const destination=join(processedDir,`${id}.mp3`);
  const temporary=join(processedDir,`.processing-${randomUUID()}.mp3`);
  try{
    await run('ffmpeg',[
      '-y','-hide_banner','-nostdin','-i',inputPath,'-map_metadata','0','-vn',
      '-af',measuredLoudnorm({targetLufs,truePeakDb},measurement),
      '-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','320k','-write_xing','1',temporary
    ]);
    await rename(temporary,destination);
    return destination;
  }catch(error){
    await rm(temporary,{force:true});
    throw error;
  }
}

export function displayTitle(metadata,filePath){
  return metadata.title||basename(filePath,extname(filePath));
}
