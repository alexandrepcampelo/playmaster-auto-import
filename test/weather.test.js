import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherService } from '../src/weather.js';

function response(payload,{ok=true}={}){return {ok,json:async()=>payload}}

test('normaliza tempo atual e extrema diária e mantém cache por 15 minutos',async()=>{
  let now=1000,calls=0;
  const service=createWeatherService({
    apiKey:'test-key',location:'-23.1857,-46.8978',clock:()=>now,
    fetchImpl:async url=>{
      calls++;
      assert.equal(new URL(url).searchParams.get('q'),'-23.1857,-46.8978');
      return response({
        location:{name:'Jundiaí',region:'São Paulo'},
        current:{temp_c:22.5,humidity:64,is_day:0,last_updated:'2026-10-14 12:00'},
        forecast:{forecastday:[{day:{maxtemp_c:28.1,mintemp_c:17.3}}]}
      });
    }
  });
  const first=await service.get();
  assert.deepEqual(first,{temperatureC:22.5,humidity:64,maximumC:28.1,minimumC:17.3,isDay:false,updatedAt:'2026-10-14 12:00',location:'Jundiaí, São Paulo',source:'WeatherAPI'});
  now+=14*60*1000;
  assert.equal((await service.get()).temperatureC,22.5);
  assert.equal(calls,1);
  now+=2*60*1000;
  await service.get();
  assert.equal(calls,2);
});

test('sem chave retorna indisponível sem consultar provedor',async()=>{
  let calls=0;
  const service=createWeatherService({apiKey:'',location:'Jundiaí',fetchImpl:async()=>{calls++}});
  await assert.rejects(service.get(),error=>error.statusCode===503);
  assert.equal(calls,0);
});

test('mantém a leitura anterior quando a atualização falha',async()=>{
  let now=0,calls=0;
  const service=createWeatherService({
    apiKey:'test-key',location:'Jundiaí',clock:()=>now,
    fetchImpl:async()=>{
      calls++;
      if(calls>1)return response({}, {ok:false});
      return response({location:{name:'Jundiaí'},current:{temp_c:21,humidity:60,last_updated:'2026-10-14 12:00'},forecast:{forecastday:[{day:{maxtemp_c:27,mintemp_c:16}}]}});
    }
  });
  await service.get();
  now=16*60*1000;
  assert.equal((await service.get()).stale,true);
});
