const $=selector=>document.querySelector(selector);

function escapeText(value){
  const span=document.createElement('span');
  span.textContent=String(value??'');
  return span.innerHTML;
}

function statusLabel(status){
  return ({received:'Recebido',processing:'Processando',ready:'Pronto',error:'Erro'})[status]||status;
}

async function refresh(){
  const button=$('#refresh');
  button.disabled=true;
  try{
    const [statusResponse,itemsResponse]=await Promise.all([fetch('/api/status'),fetch('/api/imports?limit=30')]);
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
setInterval(refresh,10000);
refresh();
