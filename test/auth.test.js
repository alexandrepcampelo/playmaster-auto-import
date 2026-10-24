import test from 'node:test';
import assert from 'node:assert/strict';
import { LoginLimiter,SESSION_SECONDS,createSession,parseCookies,secureEqual,sessionCookie,verifySession } from '../src/auth.js';

test('cria, valida e expira uma sessão assinada',()=>{
  const secret='segredo-de-sessao-com-mais-de-32-caracteres';
  const token=createSession('admin',secret,1_000);
  assert.equal(verifySession(token,secret,2_000).username,'admin');
  assert.match(sessionCookie(token),new RegExp(`Max-Age=${SESSION_SECONDS}`));
  assert.equal(verifySession(`${token}alterado`,secret,2_000),null);
  assert.equal(verifySession(token,secret,1_000+(SESSION_SECONDS*1000)+1),null);
});

test('compara credenciais e interpreta cookies',()=>{
  assert.equal(secureEqual('segredo','segredo'),true);
  assert.equal(secureEqual('segredo','outro'),false);
  assert.deepEqual(parseCookies('tema=azul; pm_auto_session=abc.def'),{tema:'azul',pm_auto_session:'abc.def'});
});

test('bloqueia tentativas repetidas de login',()=>{
  const limiter=new LoginLimiter({maxAttempts:2,windowMs:1_000});
  assert.equal(limiter.fail('ip:admin',100).blocked,false);
  assert.equal(limiter.fail('ip:admin',200).blocked,true);
  assert.equal(limiter.status('ip:admin',1_101).blocked,false);
});
