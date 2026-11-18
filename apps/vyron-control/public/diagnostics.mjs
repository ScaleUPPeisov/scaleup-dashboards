// Owner-initiated diagnostics: never send Push or request OAuth/permissions on mount.
// All API values are snapshots; a successful gateway send is not device delivery.
export function summarizeConnection(health,status,now=Date.now()){
 if(health?.ok!==true||health?.d1?.schema!==true)
   return {ok:false,message:'Worker / D1: схема недоступна'};
 const channels=Array.isArray(status?.channels)?status.channels:[];
 const linked=Number(status?.analyticsHealth?.linkedProfiles);
 const oauth=Number.isSafeInteger(linked)&&linked>=0?linked:
   channels.filter(x=>x.analyticsAuthorized===true).length;
 const devices=Array.isArray(status?.devices)?status.devices:[];
 const latest=devices.slice().sort((a,b)=>
   Date.parse(b.lastSeenAt||0)-Date.parse(a.lastSeenAt||0))[0];
 const age=latest?.lastSeenAt?now-Date.parse(latest.lastSeenAt):Infinity;
 const macOnline=Number.isFinite(age)&&age>=0&&age<180000;
 const jobs=Array.isArray(status?.production?.items)?status.production.items.length:0;
 return {ok:true,channels:channels.length,oauth,macOnline,jobs,
   message:'Worker / D1: доступно · каналы '+channels.length+
     ' · OAuth '+oauth+'/'+channels.length+
     ' · Mac '+(macOnline?'online':'offline')+
     ' · заданий в последнем снимке '+jobs+
     (latest?.lastSeenAt?' · heartbeat '+latest.lastSeenAt:' · heartbeat отсутствует')};
}
export function detectShellVersion(script){
 const hit=String(script||'').match(/vyron-peisov-yt-shell-v[0-9]+/);
 return hit?.[0]||null;
}
export function compareShellVersions(localKeys,remoteSource){
 const latest=detectShellVersion(remoteSource);
 const present=(Array.isArray(localKeys)?localKeys:[]).filter(x=>
   /^vyron-peisov-yt-shell-v[0-9]+$/.test(x));
 const local=present.sort((a,b)=>
   Number(b.split('-v').at(-1))-Number(a.split('-v').at(-1)))[0]||null;
 return {local,latest,current:Boolean(local&&latest&&local===latest),
   available:Boolean(local&&latest)};
}
export async function inspectPwaVersion({serviceWorker,cachesApi,fetchImpl}){
 if(!serviceWorker||!cachesApi)
   return {state:'UNSUPPORTED',message:'Service Worker / Cache Storage недоступны'};
 const registration=await serviceWorker.getRegistration();
 if(!registration?.active)
   return {state:'NOT_INSTALLED',message:'PWA ещё не контролируется установленным Service Worker'};
 const [keys,response]=await Promise.all([
   cachesApi.keys(),
   fetchImpl('/service-worker.js',{method:'GET',cache:'no-store'})
 ]);
 if(!response.ok)throw new Error('SW_VERSION_HTTP_'+response.status);
 const versions=compareShellVersions(keys,await response.text());
 // registration.update() revalidates the installed SW, never clears owner sessionStorage.
 await registration.update();
 if(!versions.available)
   return {state:'UNKNOWN',message:'Нельзя сопоставить локальный и серверный кэш PWA'};
 return versions.current?{state:'CURRENT',message:'Версия актуальна: '+versions.latest, ...versions}:
   {state:'UPDATE_AVAILABLE',message:'На сервере '+versions.latest+
     ', локально '+versions.local+' · обновление запрошено; переоткрой PWA',...versions};
}
export async function inspectPushSubscription({serviceWorker,NotificationClass}){
 if(!serviceWorker||!NotificationClass||NotificationClass.permission!=='granted')
   return {ready:false,reason:'Разрешение не предоставлено или iOS Push недоступен'};
 const registration=await serviceWorker.getRegistration();
 const sub=await registration?.pushManager?.getSubscription();
 return sub?{ready:true}:{ready:false,reason:'Нет активной Push-подписки на этом устройстве'};
}
