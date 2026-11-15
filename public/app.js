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

const defaultLibraryFolders=['Músicas','Comerciais','Vinhetas','Intercons','Trilhas','Chamadas','Locução','Hora Certa','Temperatura','Outros'];
let selectedFolderCategory='';
let selectedFolderSubcategory='';
let expandedFolders={};

function formatAddedDate(item){
  const value=item.createdAt||item.addedAt||item.importedAt||item.receivedAt||item.created_at||item.updatedAt;
  if(!value) return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('pt-BR');
}

function folderTreeTemplate(){
  const categories=[...new Set([...defaultLibraryFolders,...currentItems.map(item=>item.category||'Outros')])];
  if(!selectedFolderCategory) selectedFolderCategory=categories[0]||'Músicas';
  if(!categories.includes(selectedFolderCategory)){
    selectedFolderCategory=categories[0]||'Músicas';
    selectedFolderSubcategory='';
  }
  return categories.map(category=>{
    const subcategories=[...new Set(currentItems.filter(item=>(item.category||'Outros')===category&&item.subcategory).map(item=>item.subcategory))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const expanded=!!expandedFolders[category];
    const selected=selectedFolderCategory===category&&!selectedFolderSubcategory;
    return `<div class="folder-group">
      <div class="folder-line">
        <button class="folder-toggle" type="button" data-folder-toggle="${escapeText(category)}" aria-label="${expanded?'Recolher':'Expandir'} ${escapeText(category)}">${subcategories.length?(expanded?'⌄':'›'):'·'}</button>
        <button class="folder-select ${selected?'active':''}" type="button" data-folder-category="${escapeText(category)}"><span class="folder-glyph">▰</span><span>${escapeText(category)}</span></button>
      </div>
      ${expanded?subcategories.map(subcategory=>`<button class="folder-select folder-child ${selectedFolderCategory===category&&selectedFolderSubcategory===subcategory?'active':''}" type="button" data-folder-category="${escapeText(category)}" data-folder-subcategory="${escapeText(subcategory)}"><span class="folder-glyph">▰</span><span>${escapeText(subcategory)}</span></button>`).join(''):''}
    </div>`;
  }).join('');
}

function libraryRowTemplate(item){
  const title=item.title||item.fileName||'Áudio sem nome';
  const artist=item.artist||item.artists||'—';
  const duration=formatDuration(item.duration);
  const category=item.category||'Outros';
  const audioUrl=`/api/imports/${encodeURIComponent(item.id)}/audio`;
  const canPlay=item.status==='ready'&&item.processedPath;
  const menu=`<div class="item-actions" data-menu-for="${escapeText(item.id)}" hidden>
    <button type="button" data-action="move" data-id="${escapeText(item.id)}"><span>↪</span>Mover para outra pasta</button>
    <button type="button" data-action="reprocess" data-id="${escapeText(item.id)}"><span>↻</span>Reprocessar áudio</button>
  </div>`;
  return `<div class="library-row" role="row">
    <span class="library-cell selection-cell"><input class="library-select" type="checkbox" data-select-id="${escapeText(item.id)}" aria-label="Selecionar ${escapeText(title)}" ${selectedLibraryIds.has(item.id)?"checked":""}></span>
    <span class="library-cell type-cell" title="${escapeText(category)}">${escapeText(category)}</span>
    <span class="library-cell name-cell" title="${escapeText(title)}"><span class="library-name-wrap">
      ${canPlay?`<button class="play-audio table-play-button" type="button" data-url="${escapeText(audioUrl)}" aria-label="Ouvir ${escapeText(title)}">▶</button>`:''}
      <span class="library-name-text">${escapeText(title)}</span>
      <button class="item-menu-btn table-menu-button" type="button" data-menu-id="${escapeText(item.id)}" aria-label="Mais opções de ${escapeText(title)}" aria-expanded="false">•••</button>
    </span>${menu}</span>
    <span class="library-cell artist-cell" title="${escapeText(artist)}">${escapeText(artist)}</span>
    <span class="library-cell duration-cell">${escapeText(duration)}</span>
    <span class="library-cell date-cell">${escapeText(formatAddedDate(item))}</span>
    <span class="library-cell action-cell"><button class="table-icon-button audio-editor-button" type="button" disabled title="Editor de áudio — em preparação" aria-label="Editor de áudio">≋</button></span>
    <span class="library-cell action-cell"><button class="table-icon-button" type="button" data-action="edit" data-id="${escapeText(item.id)}" title="Editar informações" aria-label="Editar informações">✎</button></span>
    <span class="library-cell action-cell"><button class="table-icon-button delete-icon" type="button" data-action="trash" data-id="${escapeText(item.id)}" title="Excluir da biblioteca" aria-label="Excluir da biblioteca">⌫</button></span>
  </div>`;
}

function renderLibrary(){
  const tree=$('#folderTree');
  if(tree) tree.innerHTML=folderTreeTemplate();
  const container=$('#items');
  if(!container) return;
  if(currentLibraryView==='trash'){
    container.innerHTML=currentItems.length?currentItems.map(trashTemplate).join(''):'<p class="empty">A Lixeira está vazia.</p>';
    updateBulkDeleteButton();
    return;
  }
  const query=$('#librarySearch').value.trim().toLocaleLowerCase('pt-BR');
  const filtered=currentItems.filter(item=>{
    const category=item.category||'Outros';
    if(selectedFolderCategory&&category!==selectedFolderCategory) return false;
    if(selectedFolderSubcategory&&(item.subcategory||'')!==selectedFolderSubcategory) return false;
    if(!query) return true;
    return [item.title,item.fileName,item.artist,item.category,item.subcategory,item.id].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(query));
  });
  const headers=['','Tipo','Nome','Intérpretes','Tempo','Data da adição','Editor','Editar','Excluir'];
  $('#libraryCount').textContent=`${filtered.length} arquivo(s)`;
  container.innerHTML=`<div class="library-table" role="table" aria-label="Arquivos da biblioteca">
    <div class="library-table-head" role="row">${headers.map((label,index)=>index===0?`<span role="columnheader"><input id="selectAllLibrary" class="library-select" type="checkbox" aria-label="Selecionar todos"></span>`:`<span role="columnheader">${label}</span>`).join('')}</div>
    ${filtered.length?filtered.map(libraryRowTemplate).join(''):'<p class="empty">Nenhum arquivo nesta pasta.</p>'}
  </div>`;
  const selectAll=$('#selectAllLibrary');
  if(selectAll){const visible=filtered.map(item=>item.id);selectAll.checked=visible.length>0&&visible.every(id=>selectedLibraryIds.has(id));selectAll.indeterminate=visible.some(id=>selectedLibraryIds.has(id))&&!selectAll.checked;}
  updateBulkDeleteButton();
}

function updateBulkDeleteButton(){const button=$('#bulkDelete');if(button){button.disabled=currentLibraryView!=='active'||selectedLibraryIds.size===0;button.innerHTML='<span>⌫</span> Excluir'+(selectedLibraryIds.size?' ('+selectedLibraryIds.size+')':'');}}

function itemTemplate(item){
  return libraryRowTemplate(item);
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
    <span class="process-name"><strong>${escapeText(title)}</strong><small>${escapeText(item.id)} · ${escapeText(item.category)}${item.subcategory?` / ${escapeText(item.subcategory)}`:''} · excluído em ${escapeText(formatDate(item.deletedAt))}</small></span>
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
let librarySearchOpen=false;
const selectedLibraryIds=new Set();

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
  $('#importTitle').textContent='Adicionar áudios à Biblioteca';
  $('#importDescription').textContent='Selecione os arquivos e informe a pasta de destino.';
  $('#cdImportNote').hidden=true;
  selectImportMode('files');
  $('#importModal').hidden=false;
  document.body.classList.add('modal-open');
}

function closeImport(){
  $('#importModal').hidden=true;
  document.body.classList.remove('modal-open');
}

function sendFile(file,category,subcategory,onProgress,archive=false){
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open('POST',archive?'/api/uploads/archive':'/api/uploads');
    request.setRequestHeader('content-type','application/octet-stream');
    request.setRequestHeader('x-file-name-b64',encodeMetadata(file.name));
    request.setRequestHeader('x-category-b64',encodeMetadata(category));
    if(['Hora Certa','Temperatura'].includes(category)&&subcategory) request.setRequestHeader('x-subcategory-b64',encodeMetadata(subcategory));
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
    const endpoint=currentLibraryView==='trash'?'/api/trash?limit=100':'/api/imports?limit=500';
    $('#catalogSearchWrap').hidden=currentLibraryView==='trash'||!librarySearchOpen;
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
    renderLibrary();
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
  $('#manageSubcategory').value=item.subcategory||'';
  $('#manageSubcategoryField').hidden=item.category!=='Hora Certa';
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
      selectedLibraryIds.delete(id);
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
  selectedLibraryIds.clear();
  $('#activeTab').classList.add('active');
  $('#trashTab').classList.remove('active');
  await refresh();
});
$('#trashTab').addEventListener('click',async()=>{
  currentLibraryView='trash';
  selectedLibraryIds.clear();
  $('#trashTab').classList.add('active');
  $('#activeTab').classList.remove('active');
  await refresh();
});
$('#closeManage').addEventListener('click',closeManage);
$('#cancelManage').addEventListener('click',closeManage);
$('#manageModal').addEventListener('click',event=>{ if(event.target===event.currentTarget) closeManage(); });
$('#manageCategory').addEventListener('change',()=>{$('#manageSubcategoryField').hidden=!['Hora Certa','Temperatura'].includes($('#manageCategory').value);if(!['Hora Certa','Temperatura'].includes($('#manageCategory').value))$('#manageSubcategory').value='';});
$('#manageForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('#saveManage');
  button.disabled=true;
  $('#manageError').textContent='';
  try{
    const id=$('#manageId').value;
    const payload=manageMode==='move'
      ?{category:$('#manageCategory').value,subcategory:['Hora Certa','Temperatura'].includes($('#manageCategory').value)?$('#manageSubcategory').value:''}
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

let librarySearchTimer=null;
$('#librarySearch').addEventListener('input',()=>{
  clearTimeout(librarySearchTimer);
  librarySearchTimer=setTimeout(()=>renderLibrary(),120);
});
$('#folderTree').addEventListener('click',event=>{
  const toggle=event.target.closest('[data-folder-toggle]');
  if(toggle){
    const category=toggle.dataset.folderToggle;
    expandedFolders[category]=!expandedFolders[category];
    renderLibrary();
    return;
  }
  const select=event.target.closest('[data-folder-category]');
  if(select){
    selectedFolderCategory=select.dataset.folderCategory;
    selectedFolderSubcategory=select.dataset.folderSubcategory||'';
    renderLibrary();
  }
});
$('#refresh').addEventListener('click',refresh);
$('#openImport').addEventListener('click',openImport);
$('#openCdImport').addEventListener('click',()=>{openImport();$('#importTitle').textContent='Importar faixas de CD';$('#importDescription').textContent='Selecione arquivos de áudio extraídos do CD para adicioná-los à Biblioteca.';$('#cdImportNote').hidden=false;});
$('#catalogTrash').addEventListener('click',()=>currentLibraryView==='trash'?$('#activeTab').click():$('#trashTab').click());
$('#toggleLibrarySearch').addEventListener('click',()=>{librarySearchOpen=!librarySearchOpen;$('#catalogSearchWrap').hidden=currentLibraryView==='trash'||!librarySearchOpen;if(librarySearchOpen)$('#librarySearch').focus();else{$('#librarySearch').value='';renderLibrary();}});
$('#bulkDelete').addEventListener('click',async()=>{const ids=[...selectedLibraryIds];if(!ids.length||!confirm('Mover '+ids.length+' áudio(s) selecionado(s) para a Lixeira?'))return;const button=$('#bulkDelete');button.disabled=true;try{for(const id of ids)await actionRequest('/api/imports/'+encodeURIComponent(id),{method:'DELETE'});selectedLibraryIds.clear();await refresh();}catch(error){alert(error.message);await refresh();}finally{updateBulkDeleteButton();}});
$('#items').addEventListener('change',event=>{const checkbox=event.target.closest('.library-select');if(!checkbox)return;if(checkbox.id==='selectAllLibrary'){const visible=[...$('#items').querySelectorAll('[data-select-id]')].map(input=>input.dataset.selectId);visible.forEach(id=>checkbox.checked?selectedLibraryIds.add(id):selectedLibraryIds.delete(id));}else{const id=checkbox.dataset.selectId;checkbox.checked?selectedLibraryIds.add(id):selectedLibraryIds.delete(id);}renderLibrary();});
$('#closeImport').addEventListener('click',closeImport);
$('#cancelImport').addEventListener('click',closeImport);
$('#importModal').addEventListener('click',event=>{ if(event.target===event.currentTarget) closeImport(); });
document.querySelectorAll('.source-tab').forEach(button=>button.addEventListener('click',()=>selectImportMode(button.dataset.mode)));
$('#importFiles').addEventListener('change',()=>renderUploadQueue());
$('#importCategory').addEventListener('change',()=>{$('#importSubcategoryField').hidden=!['Hora Certa','Temperatura'].includes($('#importCategory').value);if(!['Hora Certa','Temperatura'].includes($('#importCategory').value))$('#importSubcategory').value='';});
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
      const result=await sendFile(file,$('#importCategory').value,$('#importSubcategory').value.trim(),progress=>{
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
      const result=await sendFile(files[index],$('#importCategory').value,$('#importSubcategory').value.trim(),progress=>{
        states[index]={label:`Enviando ${progress}%`,progress,type:'sending'};
        renderUploadQueue(states);
      });
      states[index]={label:result.reclassified?`Registro existente atualizado para ${result.item?.category||$('#importCategory').value}${result.item?.subcategory?' / '+result.item.subcategory:''} · ${result.item?.id||''}`:result.duplicate?`Já constava na Biblioteca · ${result.item?.category||'Outros'}${result.item?.subcategory?' / '+result.item.subcategory:''} · ${result.item?.id||''}`:result.queued?`Recebido · ${result.item?.id||'ID gerado'}`:`Concluído · ${result.item?.id||'ID gerado'}`,progress:100,type:'done'};
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


// Navegação do Sidebar e abertura da importação como subaba do Catálogo.
const pageTitles={dashboard:'Painel Principal',company:'Empresa',schedule:'Programação',catalog:'Catálogo',clock:'Hora Certa',temperature:'Temperatura',testimonial:'Testemunhal',journalism:'Jornalismo',reports:'Relatórios',settings:'Configurações'};
function navigateToView(view){
  const target=document.getElementById(view+'View');
  if(!target) return;
  document.querySelectorAll('.page-view').forEach(page=>{page.hidden=page!==target;});
  document.querySelectorAll('.nav-item[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  document.querySelectorAll('.nav-subitem[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  $('#pageTitle').textContent=pageTitles[view]||'PlayMaster Auto Import';
  $('#appView').classList.remove('sidebar-open');
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>navigateToView(button.dataset.view)));

$('#sidebarToggle').addEventListener('click',()=>$('#appView').classList.toggle('sidebar-open'));


// Sidebar recolhível em telas maiores; mantém o menu lateral móvel independente.
const sidebarCollapseToggle=$('#sidebarCollapseToggle');
function setSidebarCollapsed(collapsed){
  $('#appView').classList.toggle('sidebar-collapsed',collapsed);
  sidebarCollapseToggle.setAttribute('aria-label',collapsed?'Expandir menu':'Recolher menu');
  sidebarCollapseToggle.setAttribute('title',collapsed?'Expandir menu':'Recolher menu');
  sidebarCollapseToggle.textContent=collapsed?'›':'‹';
  try{localStorage.setItem('playmasterAutoImportSidebarCollapsed',String(collapsed));}catch{}
}
sidebarCollapseToggle.addEventListener('click',()=>{
  setSidebarCollapsed(!$('#appView').classList.contains('sidebar-collapsed'));
});
try{
  setSidebarCollapsed(localStorage.getItem('playmasterAutoImportSidebarCollapsed')==='true');
}catch{
  setSidebarCollapsed(false);
}
