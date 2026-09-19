import { createHmac,createHash,randomBytes,timingSafeEqual } from 'node:crypto';

const SESSION_SECONDS=8*60*60;

function digest(value){
  return createHash('sha256').update(String(value)).digest();
}

export function secureEqual(left,right){
  return timingSafeEqual(digest(left),digest(right));
}

function signature(payload,secret){
  return createHmac('sha256',secret).update(payload).digest('base64url');
}

export function createSession(username,secret,now=Date.now()){
  const payload=Buffer.from(JSON.stringify({
    username,
    expiresAt:now+(SESSION_SECONDS*1000),
    nonce:randomBytes(16).toString('base64url')
  })).toString('base64url');
  return `${payload}.${signature(payload,secret)}`;
}

export function verifySession(token,secret,now=Date.now()){
  try{
    const [payload,providedSignature,extra]=String(token||'').split('.');
    if(!payload || !providedSignature || extra || !secureEqual(providedSignature,signature(payload,secret))) return null;
    const session=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if(!session.username || !Number.isFinite(session.expiresAt) || session.expiresAt<=now) return null;
    return session;
  }catch{
    return null;
  }
}

export function parseCookies(header=''){
  return String(header).split(';').reduce((cookies,entry)=>{
    const separator=entry.indexOf('=');
    if(separator<0) return cookies;
    const key=entry.slice(0,separator).trim();
    const value=entry.slice(separator+1).trim();
    if(key) cookies[key]=decodeURIComponent(value);
    return cookies;
  },{});
}

export function sessionCookie(token){
  return `pm_auto_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie(){
  return 'pm_auto_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

export class LoginLimiter{
  constructor({maxAttempts=5,windowMs=15*60*1000}={}){
    this.maxAttempts=maxAttempts;
    this.windowMs=windowMs;
    this.entries=new Map();
  }

  status(key,now=Date.now()){
    const entry=this.entries.get(key);
    if(!entry || entry.resetAt<=now){
      this.entries.delete(key);
      return {blocked:false,retryAfter:0};
    }
    return {blocked:entry.attempts>=this.maxAttempts,retryAfter:Math.ceil((entry.resetAt-now)/1000)};
  }

  fail(key,now=Date.now()){
    const current=this.entries.get(key);
    const entry=!current || current.resetAt<=now?{attempts:0,resetAt:now+this.windowMs}:current;
    entry.attempts+=1;
    this.entries.set(key,entry);
    return this.status(key,now);
  }

  clear(key){
    this.entries.delete(key);
  }
}
