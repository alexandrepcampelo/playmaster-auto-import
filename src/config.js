import { resolve } from 'node:path';

function positiveInteger(value,fallback){
  const parsed=Number(value);
  return Number.isInteger(parsed) && parsed>0?parsed:fallback;
}

export const config={
  port:positiveInteger(process.env.PORT,3600),
  dataDir:resolve(process.env.DATA_DIR||'./data'),
  inboxDir:resolve(process.env.INBOX_DIR||'./storage/inbox'),
  originalsDir:resolve(process.env.ORIGINALS_DIR||'./storage/originals'),
  stationCode:String(process.env.STATION_CODE||'PM').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,8)||'PM',
  pollIntervalMs:positiveInteger(process.env.POLL_INTERVAL_MS,3000)
};
