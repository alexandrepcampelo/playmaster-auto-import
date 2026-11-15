const $dir=id=>document.getElementById(id);
let selectedDirectoryIds=new Set();
let pathToCopy='';
let directoryLibraryRoot='';
let directoryBrowserPath='';
let directoryEditingItem=null;
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
  const path=directoryEscape(item.path);
  return `<tr class="${parent?'subfolder-row':''}">
   <td class="directory-name-cell"><input class="directory-select" type="checkbox" data-id="${directoryEscape(item.id)}" ${selected?'checked':''} aria-label="Selecionar ${directoryEscape(item.name)}"><span class="catalog-directory-icon icon-${directoryEscape(item.icon)}">${directoryGlyph(item.icon)}</span><strong>${directoryEscape(item.name)}</strong></td>
   <td><span class="directory-type-pill">${directoryEscape(rootName)}</span></td>
   <td><div class="directory-path-cell"><span title="${path}">${path}</span><button class="directory-open-button" type="button" data-open-path="${directoryEscape(item.id)}" title="Ver caminho" aria-label="Ver caminho de ${directoryEscape(item.name)}">↗</button></div></td>
   <td><label class="directory-toggle" title="Autocatalogar"><input type="checkbox" data-toggle="autoCatalog" data-id="${directoryEscape(item.id)}" ${item.autoCatalog?'checked':''}><span></span></label></td>
   <td><label class="directory-toggle" title="Ativo"><input type="checkbox" data-toggle="active" data-id="${directoryEscape(item.id)}" ${item.active?'checked':''}><span></span></label></td>
   <td><button class="directory-edit-button" type="button" data-edit-directory="${directoryEscape(item.id)}" title="Editar diretório" aria-label="Editar ${directoryEscape(item.name)}">✎</button></td>
  </tr>`;
 }).join('');
 wrap.innerHTML=`<table class="directory-table"><thead><tr><th>Nome da pasta / subpasta</th><th>Tipo (pasta principal)</th><th>Caminho do diretório</th><th>Autocatalogar</th><th>Ativo</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table>`;
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
  parent.innerHTML=roots.map(item=>`<option value="${directoryEscape(item.id)}">${directoryEscape(item.name)}</option>`).join('');
  if(roots.some(item=>item.id===previous))parent.value=previous;
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
 $dir('directoryParentField').hidden=!subfolder;
 $dir('directoryBrowse').disabled=subfolder;
 $dir('directoryPath').value=subfolder?(catalogDirectories.find(row=>row.id===$dir('directoryParent').value)?.path||''):(directoryEditingItem?directoryBaseFor(directoryEditingItem):directoryLibraryRoot);
 $dir('directoryPathHint').textContent=subfolder?'O caminho será criado dentro da pasta principal selecionada.':'A nova pasta principal será criada dentro deste local. As subpastas usarão automaticamente o caminho da pasta principal.';
}
function openDirectoryEditor(item=null){
 directoryEditingItem=item;
 $dir('directoryForm').reset();
 $dir('directoryId').value=item?.id||'';
 $dir('directoryName').value=item?.name||'';
 $dir('directoryType').value=item?.type||'subfolder';
 $dir('directoryIcon').value=item?.icon||'folder';
 $dir('directoryAutoCatalog').checked=item?Boolean(item.autoCatalog):true;
 $dir('directoryActive').checked=item?Boolean(item.active):true;
 refreshDirectorySelects();
 if(item?.parentId)$dir('directoryParent').value=item.parentId;
 updateDirectoryTypeFields();
 $dir('directoryModalTitle').textContent=item?'Editar diretório':'Novo diretório';
 $dir('directorySave').textContent=item?'Salvar alterações':'Criar diretório';
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
 const payload={
  name:$dir('directoryName').value.trim(),type,
  parentId:type==='subfolder'?$dir('directoryParent').value:'',
  icon:$dir('directoryIcon').value,
  basePath:$dir('directoryPath').value.trim(),
  autoCatalog:$dir('directoryAutoCatalog').checked,
  active:$dir('directoryActive').checked
 };
 try{
  const result=await actionRequest(id?`/api/catalog-directories/${encodeURIComponent(id)}`:'/api/catalog-directories',{method:id?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(id)selectedDirectoryIds.delete(id);
  catalogDirectories=id?catalogDirectories.map(item=>item.id===id?result.item:item):[...catalogDirectories,result.item];
  refreshDirectorySelects();renderDirectorySettings();renderLibrary();closeDirectoryEditor();
 }catch(error){$dir('directoryError').textContent=error.message;}
 finally{button.disabled=false;}
}
async function browseDirectory(path){
 const result=await actionRequest('/api/catalog-directories/browse?path='+encodeURIComponent(path||directoryLibraryRoot));
 directoryBrowserPath=result.path;
 $dir('directoryBrowserCurrent').textContent=result.path;
 $dir('directoryBrowserUp').disabled=!result.parent;
 $dir('directoryBrowserUp').dataset.parent=result.parent||'';
 $dir('directoryBrowserList').innerHTML=result.folders.length?result.folders.map(folder=>`<button type="button" class="directory-browser-entry" data-browse-path="${directoryEscape(folder.path)}"><span>📁</span><strong>${directoryEscape(folder.name)}</strong><span>›</span></button>`).join(''):'<p class="directory-browser-empty">Não há subpastas neste local.</p>';
}
async function openDirectoryBrowser(){
 try{
  await browseDirectory($dir('directoryPath').value||directoryLibraryRoot);
  $dir('directoryBrowserError').textContent='';
  $dir('directoryBrowserModal').hidden=false;
  document.body.classList.add('modal-open');
 }catch(error){$dir('directoryError').textContent=error.message;}
}
function closeDirectoryBrowser(){
 $dir('directoryBrowserModal').hidden=true;
 document.body.classList.add('modal-open');
}
async function openDirectoryPath(id){
 try{
  const result=await actionRequest(`/api/catalog-directories/${encodeURIComponent(id)}/open`);
  pathToCopy=result.path;$dir('directoryPathTitle').textContent=result.name;$dir('directoryPathValue').textContent=result.path;
  $dir('directoryPathStatus').textContent=result.exists?'Diretório encontrado no servidor.':'O diretório ainda não existe no servidor.';
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
$dir('directoryType').addEventListener('change',updateDirectoryTypeFields);
$dir('directoryParent').addEventListener('change',updateDirectoryTypeFields);
$dir('directoryBrowse').addEventListener('click',openDirectoryBrowser);
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
