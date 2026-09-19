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
  return ({received:'Recebido',processing:'Processando',ready:'Pronto',error:'Erro',deleted:'Na Lixeira'})[status]||status;
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

function categoryClass(category){
  return String(category||'Outros').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'-');
}

function itemTemplate(item){
  const progress=stageProgress(item);
  const state=item.status==='ready'?'ready':item.status==='error'?'error':'working';
  const title=item.title||item.fileName;
  const format=item.sourceFormat?`${item.sourceFormat}${item.outputFormat?' → MP3':''}`:'Formato original';
  const audioUrl=`/api/imports/${encodeURIComponent(item.id)}/audio`;
  return `<div class="process-item ${state}">
    <div class="process-head">
      <span class="item-icon category-${categoryClass(item.category)}">♫</span>
      <span class="process-name"><strong>${escapeText(title)}</strong><small>${escapeText(item.id)} · ${escapeText(item.category)} · ${escapeText(format)}</small></span>
      <span class="process-status ${state}">${escapeText(stageLabel(item))}</span>
      ${item.status==='ready' && item.processedPath?`<button class="play-audio" type="button" data-url="${escapeText(audioUrl)}">▶ Ouvir</button>`:`<b class="process-percent">${progress}%</b>`}
      <button class="item-menu-btn" type="button" data-menu-id="${escapeText(item.id)}" aria-label="Opções de ${escapeText(title)}" aria-expanded="false">•••</button>
    </div>
    <div class="item-actions" data-menu-for="${escapeText(item.id)}" hidden>
      <button type="button" data-action="move" data-id="${escapeText(item.id)}"><span>↪</span>Mover para outra pasta</button>
      <button type="button" data-action="edit" data-id="${escapeText(item.id)}"><span>✎</span>Editar informações</button>
      <button type="button" data-action="reprocess" data-id="${escapeText(item.id)}"><span>↻</span>Reprocessar áudio</button>
      <button class="danger" type="button" data-action="trash" data-id="${escapeText(item.id)}"><span>♲</span>Excluir da biblioteca</button>
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

function formatDate(value){
  if(!value) return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
}

function trashTemplate(item){
  const title=item.title||item.fileName;
  return `<div class="trash-item">
    <span class="item-icon category-${categoryClass(item.category)}">♫</span>
    <span class="process-name"><strong>${escapeText(title)}</strong><small>${escapeText(item.id)} · ${escapeText(item.category)} · excluído em ${escapeText(formatDate(item.deletedAt))}</small></span>
    <div class="trash-actions"><button type="button" data-action="restore" data-id="${escapeText(item.id)}">↶ Restaurar</button><button class="danger" type="button" data-action="purge" data-id="${escapeText(item.id)}">Excluir definitivamente</button></div>
  </div>`;
}

function encodeMetadata(value){
  const bytes=new TextEncoder().encode(value);
  let binary='';
  for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary);
}

const supportedAudioExtensions=['.mp3','.wav','.flac','.aac','.m4a','.ogg'];
let importMode='files';
let currentLibraryView='active';
let currentItems=[];
let manageMode='move';

function selectedFiles(){
  const files=[...$('#importFiles').files];
  if(importMode==='folder') return files.filter(file=>supportedAudioExtensions.some(extension=>file.name.toLowerCase().endsWith(extension)));
  return files;
}

function renderUploadQueue(states={}){
  const files=selectedFiles();
  $('#startImport').disabled=files.length===0;
  $('#uploadQueue').innerHTML=files.length?files.map((file,index)=>{
    const state=states[index]||{label:'Aguardando',progress:0,type:'waiting'};
    const marker=state.type==='done'?'✓':state.type==='error'?'!':String(index+1);
    return `<div class="upload-row">
      <span class="file-symbol">${importMode==='zip'?'▰':'♫'}</span><span class="upload-info"><strong>${escapeText(file.webkitRelativePath||file.name)}</strong><small>${(file.size/1024/1024).toFixed(1)} MB · ${escapeText(state.label)}</small><i><b style="width:${state.progress}%"></b></i></span>
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

function sendFile(file,category,onProgress,archive=false){
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open('POST',archive?'/api/uploads/archive':'/api/uploads');
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

function selectImportMode(mode){
  importMode=mode;
  document.querySelectorAll('.source-tab').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));
  const input=$('#importFiles');
  input.value='';
  input.removeAttribute('webkitdirectory');
  input.removeAttribute('directory');
  if(mode==='folder'){
    input.multiple=true;
    input.accept='audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg';
    input.setAttribute('webkitdirectory','');
    input.setAttribute('directory','');
    $('#dropTitle').textContent='Escolher uma pasta de áudio';
    $('#dropHint').textContent='Os áudios compatíveis das subpastas também serão incluídos';
    $('#dropNote').textContent='Arquivos que não forem de áudio serão ignorados';
  }else if(mode==='zip'){
    input.multiple=false;
    input.accept='.zip,application/zip,application/x-zip-compressed';
    $('#dropTitle').textContent='Escolher um arquivo ZIP';
    $('#dropHint').textContent='O pacote será verificado e descompactado com segurança';
    $('#dropNote').textContent='Somente os áudios compatíveis serão importados';
  }else{
    input.multiple=true;
    input.accept='audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg';
    $('#dropTitle').textContent='Escolher arquivos de áudio';
    $('#dropHint').textContent='MP3, WAV, FLAC, AAC, M4A ou OGG · até 1 GB por arquivo';
    $('#dropNote').textContent='Os originais serão preservados';
  }
  renderUploadQueue();
}

async function refresh(){
  const button=$('#refresh');
  button.disabled=true;
  try{
    const endpoint=currentLibraryView==='trash'?'/api/trash?limit=100':'/api/imports?limit=30';
    const [statusResponse,itemsResponse]=await Promise.all([fetch('/api/status'),fetch(endpoint)]);
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
    $('#trashCount').textContent=status.counts.deleted||0;
    $('#trashTabCount').textContent=status.counts.deleted||0;
    $('#outputProfile').textContent=status.audioProfile.output;
    $('#normalizationProfile').textContent=`${status.audioProfile.targetLufs} LUFS · pico máximo ${status.audioProfile.truePeakDb} dBTP`;
    $('#originals').textContent=status.originalsDir;
    $('#processed').textContent=status.processedDir;
    currentItems=items;
    const container=$('#items');
    container.innerHTML=items.length
      ?items.map(currentLibraryView==='trash'?trashTemplate:itemTemplate).join('')
      :`<p class="empty">${currentLibraryView==='trash'?'A Lixeira está vazia.':'Nenhum áudio recebido até o momento.'}</p>`;
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

function closeItemMenus(except=''){
  document.querySelectorAll('.item-actions').forEach(menu=>{
    if(menu.dataset.menuFor!==except) menu.hidden=true;
  });
  document.querySelectorAll('.item-menu-btn').forEach(button=>{
    if(button.dataset.menuId!==except) button.setAttribute('aria-expanded','false');
  });
}

function findCurrentItem(id){
  return currentItems.find(item=>item.id===id);
}

function openManage(item,mode){
  if(!item) return;
  manageMode=mode;
  $('#manageId').value=item.id;
  $('#manageError').textContent='';
  $('#moveFields').hidden=mode!=='move';
  $('#editFields').hidden=mode!=='edit';
  $('#manageTitle').textContent=mode==='move'?'Mover para outra pasta':'Editar informações';
  $('#manageDescription').textContent=mode==='move'?'Corrija a classificação sem reenviar ou reprocessar o áudio.':'Atualize os dados exibidos na biblioteca e no Studio Air.';
  $('#manageCategory').value=item.category;
  $('#manageTitleInput').value=item.title||item.fileName||'';
  $('#manageArtist').value=item.artist||'';
  $('#manageAlbum').value=item.album||'';
  $('#manageYear').value=item.year||'';
  $('#manageModal').hidden=false;
  document.body.classList.add('modal-open');
}

function closeManage(){
  $('#manageModal').hidden=true;
  document.body.classList.remove('modal-open');
}

async function actionRequest(url,options={}){
  const response=await fetch(url,options);
  let result={};
  try{result=await response.json();}catch{}
  if(response.status===401){
    showLogin('Sua sessão expirou. Entre novamente.');
    throw new Error('Sessão expirada.');
  }
  if(!response.ok) throw new Error(result.error||`Falha HTTP ${response.status}`);
  return result;
}

$('#items').addEventListener('click',async event=>{
  const menuButton=event.target.closest('.item-menu-btn');
  if(menuButton){
    event.stopPropagation();
    const id=menuButton.dataset.menuId;
    const menu=[...document.querySelectorAll('.item-actions')].find(row=>row.dataset.menuFor===id);
    if(!menu) return;
    const willOpen=menu.hidden;
    closeItemMenus(id);
    menu.hidden=!willOpen;
    menuButton.setAttribute('aria-expanded',String(willOpen));
    return;
  }
  const actionButton=event.target.closest('[data-action]');
  if(!actionButton) return;
  const {action,id}=actionButton.dataset;
  const item=findCurrentItem(id);
  if(!item) return;
  closeItemMenus();
  try{
    if(action==='move' || action==='edit') return openManage(item,action);
    if(action==='reprocess'){
      if(!confirm(`Reprocessar “${item.title||item.fileName}” usando o arquivo original?`)) return;
      await actionRequest(`/api/imports/${encodeURIComponent(id)}/reprocess`,{method:'POST'});
    }else if(action==='trash'){
      if(!confirm(`Mover “${item.title||item.fileName}” para a Lixeira?`)) return;
      await actionRequest(`/api/imports/${encodeURIComponent(id)}`,{method:'DELETE'});
    }else if(action==='restore'){
      await actionRequest(`/api/trash/${encodeURIComponent(id)}/restore`,{method:'POST'});
    }else if(action==='purge'){
      if(!confirm(`Excluir definitivamente “${item.title||item.fileName}”? Esta ação também apaga os arquivos armazenados e não pode ser desfeita.`)) return;
      await actionRequest(`/api/trash/${encodeURIComponent(id)}`,{method:'DELETE'});
    }
    await refresh();
  }catch(error){
    alert(error.message);
  }
});

document.addEventListener('click',event=>{ if(!event.target.closest('.item-actions')) closeItemMenus(); });
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    closeItemMenus();
    if(!$('#manageModal').hidden) closeManage();
    else if(!$('#importModal').hidden) closeImport();
  }
});

$('#activeTab').addEventListener('click',async()=>{
  currentLibraryView='active';
  $('#activeTab').classList.add('active');
  $('#trashTab').classList.remove('active');
  await refresh();
});
$('#trashTab').addEventListener('click',async()=>{
  currentLibraryView='trash';
  $('#trashTab').classList.add('active');
  $('#activeTab').classList.remove('active');
  await refresh();
});
$('#closeManage').addEventListener('click',closeManage);
$('#cancelManage').addEventListener('click',closeManage);
$('#manageModal').addEventListener('click',event=>{ if(event.target===event.currentTarget) closeManage(); });
$('#manageForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#saveManage');
  button.disabled=true;
  $('#manageError').textContent='';
  try{
    const id=$('#manageId').value;
    const payload=manageMode==='move'
      ?{category:$('#manageCategory').value}
      :{title:$('#manageTitleInput').value,artist:$('#manageArtist').value,album:$('#manageAlbum').value,year:$('#manageYear').value};
    await actionRequest(`/api/imports/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    closeManage();
    await refresh();
  }catch(error){
    $('#manageError').textContent=error.message;
  }finally{
    button.disabled=false;
  }
});

$('#refresh').addEventListener('click',refresh);
$('#openImport').addEventListener('click',openImport);
$('#closeImport').addEventListener('click',closeImport);
$('#cancelImport').addEventListener('click',closeImport);
$('#importModal').addEventListener('click',event=>{ if(event.target===event.currentTarget) closeImport(); });
document.querySelectorAll('.source-tab').forEach(button=>button.addEventListener('click',()=>selectImportMode(button.dataset.mode)));
$('#importFiles').addEventListener('change',()=>renderUploadQueue());
$('#importForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const files=selectedFiles();
  const states={};
  $('#startImport').disabled=true;
  if(importMode==='zip'){
    const file=files[0];
    if(!file?.name.toLowerCase().endsWith('.zip')){
      states[0]={label:'Selecione um arquivo ZIP válido',progress:100,type:'error'};
      return renderUploadQueue(states);
    }
    states[0]={label:'Enviando pacote 0%',progress:0,type:'sending'};
    renderUploadQueue(states);
    try{
      const result=await sendFile(file,$('#importCategory').value,progress=>{
        states[0]={label:progress===100?'Verificando e extraindo...':`Enviando pacote ${progress}%`,progress,type:'sending'};
        renderUploadQueue(states);
      },true);
      states[0]={label:`${result.count||0} áudio(s) recebido(s)${result.duplicates?` · ${result.duplicates} repetido(s)`:''}`,progress:100,type:'done'};
    }catch(error){
      states[0]={label:error.message,progress:100,type:'error'};
    }
    renderUploadQueue(states);
    await refresh();
    return;
  }
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
