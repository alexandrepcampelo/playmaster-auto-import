import { createReadStream } from 'node:fs';

export async function uploadFile(config,file){
  const response=await fetch(`${config.apiUrl}/api/uploads`,{
    method:'POST',
    headers:{
      authorization:`Bearer ${config.apiToken}`,
      'content-type':'application/octet-stream',
      'content-length':String(file.size),
      'x-file-name-b64':Buffer.from(file.fileName).toString('base64'),
      'x-category-b64':Buffer.from(file.category).toString('base64')
    },
    body:createReadStream(file.path),
    duplex:'half'
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||`Falha HTTP ${response.status}`);
  return result;
}
