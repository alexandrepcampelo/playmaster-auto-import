import { resolve } from 'node:path';

function positiveInteger(value,fallback){
  const parsed=Number(value);
  return Number.isInteger(parsed) && parsed>0?parsed:fallback;
}

function required(name,minLength){
  const encoded=String(process.env[`${name}_B64`]||'');
  const value=encoded?Buffer.from(encoded,'base64').toString('utf8'):String(process.env[name]||'');
  if(value.length<minLength) throw new Error(`${name} deve ter pelo menos ${minLength} caracteres.`);
  return value;
}

export const config={
  port:positiveInteger(process.env.PORT,3600),
  dataDir:resolve(process.env.DATA_DIR||'./data'),
  inboxDir:resolve(process.env.INBOX_DIR||'./storage/inbox'),
  originalsDir:resolve(process.env.ORIGINALS_DIR||'./storage/originals'),
  stationCode:String(process.env.STATION_CODE||'PM').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,8)||'PM',
  pollIntervalMs:positiveInteger(process.env.POLL_INTERVAL_MS,3000),
  adminUser:String(process.env.AUTO_IMPORT_ADMIN_USER||'admin').trim(),
  adminPassword:required('AUTO_IMPORT_ADMIN_PASSWORD',12),
  apiToken:required('AUTO_IMPORT_API_TOKEN',32),
  sessionSecret:required('AUTO_IMPORT_SESSION_SECRET',32)
};
