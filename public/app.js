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
    $('#station').textContent=status.stationCode;
    $('#inbox').textContent=status.inboxDir;
    $('#originals').textContent=status.originalsDir;
    $('#interval').textContent=`${status.pollIntervalMs/1000} segundos`;
    const container=$('#items');
    container.innerHTML=items.length?items.map(item=>`
      <div class="item">
        <span class="item-icon">♫</span>
        <span><strong>${escapeText(item.fileName)}</strong><small>${escapeText(item.id)} · ${escapeText(item.category)}</small></span>
        <span class="status ${item.status==='error'?'error':''}">${escapeText(statusLabel(item.status))}</span>
      </div>`).join(''):'<p class="empty">Nenhum áudio recebido até o momento.</p>';
    document.querySelector('.connection span').textContent='Serviço conectado';
    document.querySelector('.connection i').style.background='#31ef72';
  }catch(error){
    document.querySelector('.connection span').textContent='Serviço desconectado';
    document.querySelector('.connection i').style.background='#ff526e';
  }finally{
    button.disabled=false;
  }
}

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
      states[index]={label:result.duplicate?'Arquivo já existente':`Concluído · ${result.item?.id||'ID gerado'}`,progress:100,type:'done'};
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
