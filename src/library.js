const consumers=new Set(['traffic','studio']);
const deliveryStatuses=new Set(['synced','error']);

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

export function publicLibraryItem(item){
  if(!item || item.status!=='ready') return null;
  return {
    id:item.id,
    fileName:item.fileName,
    title:item.title,
    artist:item.artist,
    album:item.album,
    year:item.year,
    category:item.category,
    duration:finite(item.duration),
    checksum:item.checksum,
    size:finite(item.size),
    sourceFormat:item.sourceFormat,
    outputFormat:item.outputFormat,
    inputLufs:finite(item.inputLufs),
    outputLufs:finite(item.outputLufs),
    truePeak:finite(item.truePeak),
    cueIn:finite(item.cueIn)??0,
    cueOut:finite(item.cueOut)??0,
    publishedAt:item.publishedAt||item.updatedAt||item.createdAt,
    audioUrl:`/api/library/${encodeURIComponent(item.id)}/audio`,
    deliveries:item.deliveries||{}
  };
}

export function parseLibraryQuery(searchParams){
  const limit=Math.max(1,Math.min(Number(searchParams.get('limit'))||100,500));
  const category=String(searchParams.get('category')||'').trim();
  const consumer=String(searchParams.get('consumer')||'').trim().toLowerCase();
  if(consumer && !consumers.has(consumer)){
    const error=new Error('consumer deve ser traffic ou studio.');
    error.statusCode=400;
    throw error;
  }
  const afterValue=String(searchParams.get('after')||'').trim();
  let after='';
  if(afterValue){
    const parsed=Date.parse(afterValue);
    if(!Number.isFinite(parsed)){
      const error=new Error('O parâmetro after deve ser uma data ISO válida.');
      error.statusCode=400;
      throw error;
    }
    after=new Date(parsed).toISOString();
  }
  return {limit,category,consumer,after};
}

export function validateAcknowledgement(input){
  const consumer=String(input?.consumer||'').trim().toLowerCase();
  const status=String(input?.status||'').trim().toLowerCase();
  const message=String(input?.message||'').trim().slice(0,500);
  if(!consumers.has(consumer)){
    const error=new Error('consumer deve ser traffic ou studio.');
    error.statusCode=400;
    throw error;
  }
  if(!deliveryStatuses.has(status)){
    const error=new Error('status deve ser synced ou error.');
    error.statusCode=400;
    throw error;
  }
  return {consumer,status,message};
}
