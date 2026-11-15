const $dir=id=>document.getElementById(id);
let selectedDirectoryIds=new Set();
let pathToCopy='';
let directoryLibraryRoot='';
let directoryBrowserPath='/';
let directoryBrowserMode='folders';
let directoryEditingItem=null;
let directoryEditorPausedForFolderImport=false;
function isIOSFilePicker(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function openICloudFolderPicker(){
 const picker=document.createElement('input');
 picker.type='file';picker.multiple=true;picker.setAttribute('webkitdirectory','');picker.setAttribute('directory','');picker.accept='audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg';
 picker.style.position='fixed';picker.style.left='-10000px';picker.style.width='1px';picker.style.height='1px';picker.style.opacity='0';
 picker.addEventListener('change',()=>{
  const files=[...(picker.files||[])];picker.remove();
  if(!files.length)return;
  const input=$dir('importFiles');
  openImport();selectImportMode('folder');
  const transfer=new DataTransfer();files.forEach(file=>transfer.items.add(file));input.files=transfer.files;
  $dir('importTitle').textContent='Importar pasta do iCloud Drive';
  $dir('importDescription').textContent='Os áudios encontrados na pasta escolhida serão enviados ao armazenamento temporário do AutoImport. A pasta do iCloud não será vinculada como caminho permanente da Biblioteca.';
  renderUploadQueue();
  $dir('directoryModal').hidden=true;directoryEditorPausedForFolderImport=true;
 });
 picker.addEventListener('cancel',()=>picker.remove(),{once:true});
 document.body.appendChild(picker);
 picker.click();
}
function directoryEscape(value){const node=document.createElement('span');node.textContent=String(value??'');return node.innerHTML;}
function directoryGlyph(icon){return ({folder:'▰',music:'♫',commercial:'$',megaphone:'◖',link:'↔',wave:'≋',headphones:'♬',microphone:'♩',voice:'🎙',clock:'◷',thermometer:'♨',news:'▤',star:'★',archive:'▣'})[icon]||'▰';}
function orderedDirectories(items){
 const roots=items.filter(item=>item.type==='folder').sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 return roots.flatMap(root=>[root,...items.filter(item=>item.type==='subfolder'&&item.parentId===root.id).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))]);
}
function renderDirectorySettings(){
 const wrap=$dir('directoryTableWrap');if(!wrap)return;
 const items=orderedDirectories(Array.isArray(catalogDirectories)?catalogDirectories:[]);
 if(!items.length){wrap.innerHTML='<p class="empty">Nenhum diretório cadastrado. Use Novo para criar a primeira pasta.</p>';$dir('directoryDelete').disabled=true;return;}
 const rows=items.map(item=>{
  const selected=selectedDirectoryIds.has(item.id);
  const parent=item.type==='subfolder'?catalogDirectories.find(row=>row.id===item.parentId):null;
  const rootName=parent?.name||item.name;
  const path=directoryEscape(item.destinationPath||item.path);
  const iconMarkup=item.customIcon?'<img class="directory-custom-icon" src="/api/catalog-icon?path='+encodeURIComponent(item.customIcon)+'" alt="">':directoryGlyph(item.icon);
  return `<tr class="${parent?'subfolder-row':''}">
   <td class="directory-name-cell"><input class="directory-select" type="checkbox" data-id="${directoryEscape(item.id)}" ${selected?'checked':''} aria-label="Selecionar ${directoryEscape(item.name)}"><span class="catalog-directory-icon icon-${directoryEscape(item.icon)}">${iconMarkup}</span><strong>${directoryEscape(item.name)}</strong></td>
   <td><span class="directory-type-pill">${directoryEscape(rootName)}</span></td>
   <td><div class="directory-path-cell"><span title="${path}">${path}</span><button class="directory-open-button" type="button" data-open-path="${directoryEscape(item.id)}" title="Ver caminho" aria-label="Ver caminho de ${directoryEscape(item.name)}">↗</button></div></td>
   <td><label class="directory-toggle" title="Autocatalogar"><input type="checkbox" data-toggle="autoCatalog" data-id="${directoryEscape(item.id)}" ${item.autoCatalog?'checked':''}><span></span></label></td>
   <td><label class="directory-toggle" title="Ativo"><input type="checkbox" data-toggle="active" data-id="${directoryEscape(item.id)}" ${item.active?'checked':''}><span></span></label></td>
   <td><button class="directory-edit-button" type="button" data-edit-directory="${directoryEscape(item.id)}" title="Editar diretório" aria-label="Editar ${directoryEscape(item.name)}">✎</button></td>
  </tr>`;
 }).join('');
 wrap.innerHTML=`<table class="directory-table"><thead><tr><th>Pasta / subpasta</th><th>Pasta principal</th><th>Caminho do diretório</th><th>Autocatalogar</th><th>Ativo</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table>`;
 $dir('directoryDelete').disabled=selectedDirectoryIds.size===0;
}
function refreshDirectorySelects(){
 const roots=(catalogDirectories||[]).filter(item=>item.type==='folder');
 for(const id of ['importCategory','manageCategory']){
  const select=$dir(id);if(!select)continue;
  const previous=select.value;
  select.innerHTML=roots.map(item=>`<option value="${directoryEscape(item.name)}">${directoryEscape(item.name)}</option>`).join('');
  if(roots.some(item=>item.name===previous))select.value=previous;
 }
 const parent=$dir('directoryParent');
 if(parent){
  const previous=parent.value;
  parent.innerHTML=roots.map(item=>`<option value="${directoryEscape(item.id)}">${directoryEscape(item.name)}</option>`).join('')+'<option value="__new_parent__">＋ Nova pasta...</option>';
  if(roots.some(item=>item.id===previous))parent.value=previous;else if(previous==='__new_parent__')parent.value=previous;
 }
}
async function loadDirectorySettings(){
 const result=await actionRequest('/api/catalog-directories');
 catalogDirectories=result.items||[];
 directoryLibraryRoot=result.inboxDir||'';
 refreshDirectorySelects();renderDirectorySettings();renderLibrary();
}
function directoryBaseFor(item){
 if(!item)return directoryLibraryRoot;
 if(item.type==='subfolder')return catalogDirectories.find(row=>row.id===item.parentId)?.path||directoryLibraryRoot;
 const parts=item.path.split(/[\\/]/);parts.pop();return parts.join('/')||directoryLibraryRoot;
}
function updateDirectoryTypeFields(){
 const subfolder=$dir('directoryType').value==='subfolder';
 const parent=catalogDirectories.find(row=>row.id===$dir('directoryParent').value);
 const creatingParent=subfolder&&$dir('directoryParent').value==='__new_parent__';
 $dir('directoryNewParentField').hidden=!creatingParent;
 $dir('directoryNewParentName').required=creatingParent;
 const logicalRoot='iCloud Drive/Playmaster/biblioteca';
 $dir('directoryParentField').hidden=!subfolder;
 $dir('directoryNameLabel').textContent=subfolder?'Nome da subpasta':'Nome da pasta';
 $dir('directoryPathLabelTitle').textContent='Destino na Biblioteca';
 $dir('directoryBrowse').hidden=true;
 $dir('directoryBrowse').disabled=true;
 const newParentName=$dir('directoryNewParentName').value.trim();
 const logicalParent=subfolder?(creatingParent?logicalRoot+'/'+(newParentName||'Nova pasta'):(parent?.destinationPath||logicalRoot+'/'+(parent?.name||''))):logicalRoot;
 const name=$dir('directoryName').value.trim();
 $dir('directoryPath').value=logicalParent+(name?'/'+name:'');
 $dir('directoryPathHint').textContent=(subfolder?'A nova subpasta será criada dentro da pasta principal selecionada.':'A nova pasta será criada diretamente dentro da biblioteca.')+' A criação física no iCloud Drive depende da integração local autorizada do Windows; este cadastro registra o destino sem mover ou apagar áudios.';
}
function openDirectoryEditor(item=null){
 directoryEditingItem=item;
 $dir('directoryForm').reset();
 $dir('directoryId').value=item?.id||'';
 $dir('directoryName').value=item?.name||'';
 $dir('directoryType').value=item?.type||'folder';
 $dir('directoryIcon').value=item?.icon||'folder';
 $dir('directoryCustomIcon').value=item?.customIcon||'';
 $dir('directoryAutoCatalog').checked=item?Boolean(item.autoCatalog):true;
 $dir('directoryActive').checked=item?Boolean(item.active):true;
 refreshDirectorySelects();
 if(item?.parentId)$dir('directoryParent').value=item.parentId;
 updateDirectoryTypeFields();
 $dir('directoryModalTitle').textContent=item?'Editar pasta':($dir('directoryType').value==='subfolder'?'Nova subpasta':'Nova pasta');
 $dir('directorySave').textContent=item?'Salvar alterações':($dir('directoryType').value==='subfolder'?'Criar subpasta':'Criar pasta');
 $dir('directoryError').textContent='';
 $dir('directoryModal').hidden=false;
 document.body.classList.add('modal-open');
 $dir('directoryName').focus();
}
function closeDirectoryEditor(){
 $dir('directoryModal').hidden=true;
 document.body.classList.remove('modal-open');
 directoryEditingItem=null;
}
async function saveDirectory(event){
 event.preventDefault();
 const button=$dir('directorySave');button.disabled=true;$dir('directoryError').textContent='';
 const id=$dir('directoryId').value;
 const type=$dir('directoryType').value;
 const creatingParent=type==='subfolder'&&$dir('directoryParent').value==='__new_parent__';
 const payload={
  name:$dir('directoryName').value.trim(),type,
  parentId:type==='subfolder'&&!creatingParent?$dir('directoryParent').value:'',
  icon:$dir('directoryIcon').value,
  customIcon:$dir('directoryCustomIcon').value.trim(),
  basePath:type==='subfolder'&&!creatingParent?(catalogDirectories.find(row=>row.id===$dir('directoryParent').value)?.path||directoryLibraryRoot):(directoryEditingItem?directoryBaseFor(directoryEditingItem):directoryLibraryRoot),
  autoCatalog:$dir('directoryAutoCatalog').checked,
  active:$dir('directoryActive').checked
 };
 try{
  if(creatingParent){
   const parentName=$dir('directoryNewParentName').value.trim();
   if(!parentName)throw new Error('Informe o nome da nova pasta principal.');
   const existing=catalogDirectories.find(item=>item.type==='folder'&&item.name.toLocaleLowerCase('pt-BR')===parentName.toLocaleLowerCase('pt-BR'));
   let parentItem=existing;
   if(!parentItem){
    const parentResult=await actionRequest('/api/catalog-directories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:parentName,type:'folder',parentId:'',icon:'folder',customIcon:'',basePath:directoryLibraryRoot,autoCatalog:true,active:true})});
    parentItem=parentResult.item;
    catalogDirectories=[...catalogDirectories,parentItem];
   }
   refreshDirectorySelects();
   $dir('directoryParent').value=parentItem.id;
   $dir('directoryNewParentName').value='';
   updateDirectoryTypeFields();
   payload.parentId=parentItem.id;
   payload.basePath=parentItem.path;
  }
  const result=await actionRequest(id?`/api/catalog-directories/${encodeURIComponent(id)}`:'/api/catalog-directories',{method:id?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(id)selectedDirectoryIds.delete(id);
  catalogDirectories=id?catalogDirectories.map(item=>item.id===id?result.item:item):[...catalogDirectories,result.item];
  refreshDirectorySelects();renderDirectorySettings();renderLibrary();closeDirectoryEditor();
 }catch(error){$dir('directoryError').textContent=error.message;}
 finally{button.disabled=false;}
}
async function browseDirectory(path){
 const result=await actionRequest('/api/catalog-directories/browse?mode='+directoryBrowserMode+'&path='+encodeURIComponent(path||'/'));
 directoryBrowserPath=result.path;
 $dir('directoryBrowserCurrent').textContent=result.path;
 $dir('directoryBrowserUp').disabled=!result.parent;
 $dir('directoryBrowserUp').dataset.parent=result.parent||'';
 const folderRows=result.folders.map(folder=>'<button type="button" class="directory-browser-entry" data-browse-path="'+directoryEscape(folder.path)+'"><span>📁</span><strong>'+directoryEscape(folder.name)+'</strong><span>›</span></button>').join('');
 const fileRows=(result.files||[]).map(file=>'<button type="button" class="directory-browser-entry directory-icon-file" data-select-icon="'+directoryEscape(file.path)+'"><span>🖼️</span><strong>'+directoryEscape(file.name)+'</strong><span>＋</span></button>').join('');
 $dir('directoryBrowserList').innerHTML=(folderRows+fileRows)||'<p class="directory-browser-empty">Não há pastas ou imagens neste local.</p>';
}
async function openDirectoryBrowser(mode='folders'){
 directoryBrowserMode=mode;
 try{
  await browseDirectory('/');
  $dir('directoryBrowserTitle').textContent=mode==='icons'?'Buscar ícone':'Selecionar caminho';
  $dir('directoryBrowserDescription').textContent=mode==='icons'?'Escolha uma imagem PNG, JPG, WEBP ou GIF no computador/servidor.':'Navegue a partir da raiz do computador para escolher uma pasta.';
  $dir('directoryBrowserSelect').hidden=mode==='icons';
  $dir('directoryBrowserError').textContent='';
  $dir('directoryBrowserModal').hidden=false;
  document.body.classList.add('modal-open');
 }catch(error){$dir('directoryError').textContent=error.message;}
}
function closeDirectoryBrowser(){
 $dir('directoryBrowserModal').hidden=true;
 $dir('directoryBrowserSelect').hidden=false;
 document.body.classList.add('modal-open');
}
async function openDirectoryPath(id){
 try{
  const result=await actionRequest(`/api/catalog-directories/${encodeURIComponent(id)}/open`);
  pathToCopy=result.destinationPath||result.path;$dir('directoryPathTitle').textContent=result.name;$dir('directoryPathValue').textContent=result.destinationPath||result.path;
  $dir('directoryPathStatus').textContent='Destino previsto no iCloud Drive. A criação física será feita quando houver acesso autorizado à pasta sincronizada no computador.';
  $dir('directoryPathModal').hidden=false;document.body.classList.add('modal-open');
 }catch(error){alert(error.message);}
}
function closeDirectoryPath(){$dir('directoryPathModal').hidden=true;document.body.classList.remove('modal-open');}
async function updateDirectoryFlag(id,key,value){
 const item=catalogDirectories.find(row=>row.id===id);if(!item)return;
 const parent=item.type==='subfolder'?catalogDirectories.find(row=>row.id===item.parentId):null;
 const basePath=parent?.path||directoryBaseFor(item);
 try{
  await actionRequest(`/api/catalog-directories/${encodeURIComponent(id)}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...item,basePath,[key]:value})});
  await loadDirectorySettings();
 }catch(error){alert(error.message);await loadDirectorySettings();}
}
$dir('directoryNew').addEventListener('click',()=>openDirectoryEditor());
$dir('directoryDelete').addEventListener('click',async()=>{
 const ids=[...selectedDirectoryIds];if(!ids.length)return;
 if(!confirm(`Excluir ${ids.length} cadastro(s) selecionado(s)? Os diretórios físicos e os áudios não serão apagados.`))return;
 try{for(const id of ids)await actionRequest(`/api/catalog-directories/${encodeURIComponent(id)}`,{method:'DELETE'});selectedDirectoryIds.clear();await loadDirectorySettings();}
 catch(error){alert(error.message);await loadDirectorySettings();}
});
$dir('directoryRefresh').addEventListener('click',()=>loadDirectorySettings().catch(error=>alert(error.message)));
$dir('directoryForm').addEventListener('submit',saveDirectory);
$dir('directoryType').addEventListener('change',()=>{updateDirectoryTypeFields();$dir('directoryModalTitle').textContent=$dir('directoryType').value==='subfolder'?'Nova subpasta':'Nova pasta';$dir('directorySave').textContent=$dir('directoryType').value==='subfolder'?'Criar subpasta':'Criar pasta';});
$dir('directoryParent').addEventListener('change',updateDirectoryTypeFields);
$dir('directoryName').addEventListener('input',updateDirectoryTypeFields);
$dir('directoryBrowse').addEventListener('click',()=>{});
$dir('directoryIconBrowse').addEventListener('click',()=>openDirectoryBrowser('icons'));
$dir('directoryBrowserList').addEventListener('click',event=>{const icon=event.target.closest('[data-select-icon]');if(!icon)return;$dir('directoryCustomIcon').value=icon.dataset.selectIcon;closeDirectoryBrowser();});
$dir('directoryModalClose').addEventListener('click',closeDirectoryEditor);
$dir('directoryCancel').addEventListener('click',closeDirectoryEditor);
$dir('directoryModal').addEventListener('click',event=>{if(event.target===event.currentTarget)closeDirectoryEditor();});
$dir('directoryBrowserClose').addEventListener('click',closeDirectoryBrowser);
$dir('directoryBrowserCancel').addEventListener('click',closeDirectoryBrowser);
$dir('directoryBrowserUp').addEventListener('click',async event=>{const parent=event.currentTarget.dataset.parent;if(parent)try{await browseDirectory(parent);}catch(error){$dir('directoryBrowserError').textContent=error.message;}});
$dir('directoryBrowserList').addEventListener('click',async event=>{
 const entry=event.target.closest('[data-browse-path]');if(!entry)return;
 try{await browseDirectory(entry.dataset.browsePath);}catch(error){$dir('directoryBrowserError').textContent=error.message;}
});
$dir('directoryBrowserSelect').addEventListener('click',()=>{
 $dir('directoryPath').value=directoryBrowserPath;
 closeDirectoryBrowser();
});
$dir('directoryBrowserModal').addEventListener('click',event=>{if(event.target===event.currentTarget)closeDirectoryBrowser();});
$dir('directoryPathClose').addEventListener('click',closeDirectoryPath);
$dir('directoryPathDone').addEventListener('click',closeDirectoryPath);
$dir('directoryPathModal').addEventListener('click',event=>{if(event.target===event.currentTarget)closeDirectoryPath();});
document.addEventListener('playmaster:import-closed',()=>{if(directoryEditorPausedForFolderImport){$dir('directoryModal').hidden=false;document.body.classList.add('modal-open');directoryEditorPausedForFolderImport=false;}});
$dir('directoryPathCopy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(pathToCopy);$dir('directoryPathCopy').textContent='Caminho copiado';}
 catch{$dir('directoryPathValue').textContent=pathToCopy+' (selecione e copie manualmente)';}
});
$dir('directoryTableWrap').addEventListener('change',event=>{
 const checkbox=event.target.closest('.directory-select');
 if(checkbox){if(checkbox.checked)selectedDirectoryIds.add(checkbox.dataset.id);else selectedDirectoryIds.delete(checkbox.dataset.id);$dir('directoryDelete').disabled=selectedDirectoryIds.size===0;return;}
 const toggle=event.target.closest('[data-toggle]');if(toggle)updateDirectoryFlag(toggle.dataset.id,toggle.dataset.toggle,toggle.checked);
});
$dir('directoryTableWrap').addEventListener('click',event=>{
 const edit=event.target.closest('[data-edit-directory]');
 if(edit){const item=catalogDirectories.find(row=>row.id===edit.dataset.editDirectory);if(item)openDirectoryEditor(item);return;}
 const open=event.target.closest('[data-open-path]');if(open)openDirectoryPath(open.dataset.openPath);
});
document.querySelector('[data-view="settings"]')?.addEventListener('click',()=>loadDirectorySettings().catch(error=>{$dir('directoryTableWrap').innerHTML=`<p class="empty">${directoryEscape(error.message)}</p>`;}));
document.querySelectorAll('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>{
 const directories=button.dataset.settingsTab==='directories';
 document.querySelectorAll('[data-settings-tab]').forEach(tab=>tab.classList.toggle('active',tab===button));
 $dir('directorySettingsPane').hidden=!directories;$dir('generalSettingsPane').hidden=directories;
 if(directories)loadDirectorySettings().catch(error=>{$dir('directoryTableWrap').innerHTML=`<p class="empty">${directoryEscape(error.message)}</p>`;});
}));
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){
  if(!$dir('directoryModal').hidden)closeDirectoryEditor();
  if(!$dir('directoryBrowserModal').hidden)closeDirectoryBrowser();
  if(!$dir('directoryPathModal').hidden)closeDirectoryPath();
 }
});
window.renderDirectorySettings=renderDirectorySettings;
window.refreshDirectorySelects=refreshDirectorySelects;
