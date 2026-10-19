function httpError(statusCode,message){const error=new Error(message);error.statusCode=statusCode;return error}

export function createWeatherService({apiKey,location,fetchImpl=fetch,clock=()=>Date.now(),cacheTtlMs=15*60*1000}){
  let cache=null;
  return {
    async get(){
      const now=clock();
      if(cache&&now<cache.expiresAt)return cache.value;
      if(!apiKey){
        if(cache)return {...cache.value,stale:true};
        throw httpError(503,"Integração meteorológica ainda não configurada.");
      }
      try{
        const url=new URL("https://api.weatherapi.com/v1/forecast.json");
        url.search=new URLSearchParams({key:apiKey,q:location,days:"1",aqi:"no",alerts:"no"}).toString();
        const response=await fetchImpl(url,{signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw httpError(502,"O serviço meteorológico está temporariamente indisponível.");
        const payload=await response.json();
        const current=payload?.current;
        const day=payload?.forecast?.forecastday?.[0]?.day;
        const values=[current?.temp_c,current?.humidity,day?.maxtemp_c,day?.mintemp_c].map(Number);
        if(values.some(value=>!Number.isFinite(value)))throw httpError(502,"O serviço meteorológico retornou dados incompletos.");
        const value={
          temperatureC:values[0],
          humidity:values[1],
          maximumC:values[2],
          minimumC:values[3],
          isDay:Number(current?.is_day)===1,
          updatedAt:String(current?.last_updated||""),
          location:[payload?.location?.name,payload?.location?.region].filter(Boolean).join(", ")||"Jundiaí/SP",
          source:"WeatherAPI"
        };
        cache={value,expiresAt:now+cacheTtlMs};
        return value;
      }catch(error){
        if(cache)return {...cache.value,stale:true};
        if(error?.statusCode)throw error;
        throw httpError(502,"Não foi possível consultar o serviço meteorológico.");
      }
    }
  }
}
