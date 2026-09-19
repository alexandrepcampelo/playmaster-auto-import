const $=selector=>document.querySelector(selector);

function showLogin(message=''){
  $('#appView').hidden=true;
  $('#loginView').hidden=false;
  $('#loginError').textContent=message;
}

function showApp(){
  $('#loginView').hidden=true;
  $('#appView').hidden=false;
}

function escapeText(value){
  const span=document.createElement('span');
  span.textContent=String(value??'');
  return span.innerHTML;
}

function statusLabel(status){
  return ({received:'Recebido',processing:'Processando',ready:'Pronto',error:'Erro'})[status]||status;
}

function stageLabel(item){
  return ({preserving:'Preservando',analyzing:'Analisando',converting:'Normalizando',verifying:'Verificando',ready:'Pronto',error:'Com erro'})[item.processingStage]||statusLabel(item.status);
}

function stageProgress(item){
  if(item.status==='ready') return 100;
  if(item.status==='error') return 100;
  return ({preserving:12,analyzing:38,converting:72,verifying:92})[item.processingStage]||8;
}

function formatDuration(value,precision=false){
  if(value===null || value===undefined || value==='') return '—';
  const seconds=Number(value);
  if(!Number.isFinite(seconds) || seconds<0) return '—';
  const minutes=Math.floor(seconds/60);
  const remainder=seconds-minutes*60;
  return precision?`${String(minutes).padStart(2,'0')}:${remainder.toFixed(2).padStart(5,'0')}`:`${String(minutes).padStart(2,'0')}:${String(Math.floor(remainder)).padStart(2,'0')}`;
}

function metric(value,suffix=''){
  if(value===null || value===undefined || value==='') return '—';
  const number=Number(value);
  return Number.isFinite(number)?`${number.toFixed(1)}${suffix}`:'—';
}

function itemTemplate(item){
  const progress=stageProgress(item);
  const state=item.status==='ready'?'ready':item.status==='error'?'error':'working';
  const title=item.title||item.fileName;
  const format=item.sourceFormat?`${item.sourceFormat}${item.outputFormat?' → MP3':''}`:'Formato original';
  const audioUrl=`/api/imports/${encodeURIComponent(item.id)}/audio`;
  return `<div class="process-item ${state}">
    <div class="process-head">
      <span class="item-icon category-${escapeText(item.category).toLowerCase().replace(/[^a-z0-9]/g,'-')}">♫</span>
      <span class="process-name"><strong>${escapeText(title)}</strong><small>${escapeText(item.id)} · ${escapeText(item.category)} · ${escapeText(format)}</small></span>
      <span class="process-status ${state}">${escapeText(stageLabel(item))}</span>
      ${item.status==='ready' && item.processedPath?`<button class="play-audio" type="button" data-url="${escapeText(audioUrl)}">▶ Ouvir</button>`:`<b class="process-percent">${progress}%</b>`}
    </div>
    ${item.status==='ready'?`<div class="metrics">
      <span><small>DURAÇÃO</small><strong>${formatDuration(item.duration,true)}</strong></span>
      <span><small>VOLUME</small><strong>${metric(item.outputLufs,' LUFS')}</strong></span>
      <span><small>CUE IN</small><strong>${formatDuration(item.cueIn,true)}</strong></span>
      <span><small>CUE OUT</small><strong>${formatDuration(item.cueOut,true)}</strong></span>
      <span><small>PICO</small><strong>${metric(item.truePeak,' dBTP')}</strong></span>
      <span><small>SAÍDA</small><strong>${escapeText(item.outputFormat||'Original')}</strong></span>
    </div><p class="ready-note">✓ Pronto para Traffic e Studio Air</p>`:
    item.status==='error'?`<p class="error-note">${escapeText(item.error||'Não foi possível processar este áudio.')}</p>`:
    `<div class="stage-bar"><i style="width:${progress}%"></i></div><div class="stage-steps"><span>Metadados</span><span>Volume</span><span>Silêncio</span><span>Cue Points</span></div>`}
  </div>`;
}

function encodeMetadata(value){
  const bytes=new TextEncoder().encode(value);
  let binary='';
  for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary);
}

function selectedFiles(){
  return [...$('#importFiles').files];
}

function renderUploadQueue(states={}){
  const files=selectedFiles();
  $('#startImport').disabled=files.length===0;
  $('#uploadQueue').innerHTML=files.length?files.map((file,index)=>{
    const state=states[index]||{label:'Aguardando',progress:0,type:'waiting'};
    const marker=state.type==='done'?'✓':state.type==='error'?'!':String(index+1);
    return `<div class="upload-row">
      <span class="file-symbol">♫</span><span class="upload-info"><strong>${escapeText(file.name)}</strong><small>${(file.size/1024/1024).toFixed(1)} MB · ${escapeText(state.label)}</small><i><b style="width:${state.progress}%"></b></i></span>
      <span class="upload-state ${state.type}">${marker}</span>
    </div>`;
  }).join(''):'<p class="queue-empty">Os arquivos escolhidos aparecerão aqui.</p>';
}

function openImport(){
  $('#importModal').hidden=false;
  document.body.classList.add('modal-open');
}

function closeImport(){
  $('#importModal').hidden=true;
  document.body.classList.remove('modal-open');
}

function sendFile(file,category,onProgress){
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open('POST','/api/uploads');
    request.setRequestHeader('content-type','application/octet-stream');
    request.setRequestHeader('x-file-name-b64',encodeMetadata(file.name));
    request.setRequestHeader('x-category-b64',encodeMetadata(category));
    request.upload.onprogress=event=>{ if(event.lengthComputable) onProgress(Math.round((event.loaded/event.total)*100)); };
    request.onload=()=>{
      let result={};
      try{ result=JSON.parse(request.responseText); }catch{}
      if(request.status>=200 && request.status<300) resolve(result);
      else reject(new Error(result.error||`Falha HTTP ${request.status}`));
    };
    request.onerror=()=>reject(new Error('Falha de conexão durante o envio.'));
    request.send(file);
  });
}

async function refresh(){
  const button=$('#refresh');
  button.disabled=true;
  try{
    const [statusResponse,itemsResponse]=await Promise.all([fetch('/api/status'),fetch('/api/imports?limit=30')]);
    if(statusResponse.status===401 || itemsResponse.status===401){
      showLogin('Sua sessão expirou. Entre novamente.');
      return;
    }
    if(!statusResponse.ok || !itemsResponse.ok) throw new Error('Servidor indisponível');
    const status=await statusResponse.json();
    const {items}=await itemsResponse.json();
    $('#total').textContent=status.counts.total;
    $('#processing').textContent=status.counts.processing+status.counts.received;
    $('#ready').textContent=status.counts.ready;
    $('#errors').textContent=status.counts.error;
    $('#outputProfile').textContent=status.audioProfile.output;
    $('#normalizationProfile').textContent=`${status.audioProfile.targetLufs} LUFS · pico máximo ${status.audioProfile.truePeakDb} dBTP`;
    $('#originals').textContent=status.originalsDir;
    $('#processed').textContent=status.processedDir;
    const container=$('#items');
    container.innerHTML=items.length?items.map(itemTemplate).join(''):'<p class="empty">Nenhum áudio recebido até o momento.</p>';
    document.querySelector('.connection span').textContent='Serviço conectado';
    document.querySelector('.connection i').style.background='#31ef72';
  }catch(error){
    document.querySelector('.connection span').textContent='Serviço desconectado';
    document.querySelector('.connection i').style.background='#ff526e';
  }finally{
    button.disabled=false;
  }
}

let activeAudioButton=null;
$('#items').addEventListener('click',async event=>{
  const button=event.target.closest('.play-audio');
  if(!button) return;
  const player=$('#previewPlayer');
  if(activeAudioButton===button && !player.paused){
    player.pause();
    button.textContent='▶ Ouvir';
    return;
  }
  if(activeAudioButton) activeAudioButton.textContent='▶ Ouvir';
  activeAudioButton=button;
  if(player.getAttribute('src')!==button.dataset.url) player.src=button.dataset.url;
  try{
    await player.play();
    button.textContent='Ⅱ Pausar';
  }catch{
    button.textContent='Erro ao ouvir';
  }
});
$('#previewPlayer').addEventListener('ended',()=>{ if(activeAudioButton) activeAudioButton.textContent='▶ Ouvir'; });

$('#refresh').addEventListener('click',refresh);
$('#openImport').addEventListener('click',openImport);
$('#closeImport').addEventListener('click',closeImport);
$('#cancelImport').addEventListener('click',closeImport);
$('#importModal').addEventListener('click',event=>{ if(event.target===event.currentTarget) closeImport(); });
$('#importFiles').addEventListener('change',()=>renderUploadQueue());
$('#importForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const files=selectedFiles();
  const states={};
  $('#startImport').disabled=true;
  for(let index=0;index<files.length;index++){
    states[index]={label:'Enviando 0%',progress:0,type:'sending'};
    renderUploadQueue(states);
    try{
      const result=await sendFile(files[index],$('#importCategory').value,progress=>{
        states[index]={label:`Enviando ${progress}%`,progress,type:'sending'};
        renderUploadQueue(states);
      });
      states[index]={label:result.duplicate?'Arquivo já existente':result.queued?`Recebido · ${result.item?.id||'ID gerado'}`:`Concluído · ${result.item?.id||'ID gerado'}`,progress:100,type:'done'};
    }catch(error){
      states[index]={label:error.message,progress:100,type:'error'};
    }
    renderUploadQueue(states);
  }
  await refresh();
});
$('#loginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.currentTarget.querySelector('button');
  button.disabled=true;
  $('#loginError').textContent='';
  try{
    const response=await fetch('/api/login',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({username:$('#username').value,password:$('#password').value})
    });
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||'Não foi possível entrar.');
    $('#password').value='';
    showApp();
    await refresh();
  }catch(error){
    showLogin(error.message);
  }finally{
    button.disabled=false;
  }
});

$('#logout').addEventListener('click',async()=>{
  await fetch('/api/logout',{method:'POST'});
  showLogin();
});

async function start(){
  try{
    const response=await fetch('/api/me');
    if(!response.ok) return showLogin();
    showApp();
    await refresh();
  }catch{
    showLogin('Não foi possível conectar ao serviço.');
  }
}

setInterval(()=>{ if(!$('#appView').hidden) refresh(); },10000);
start();
