/* VYRON PWA v13: coherent, immutable static cache; APIs never cached. */
const SHELL_CACHE='vyron-peisov-yt-shell-v13';
const SHELL_ASSETS=['/','/styles.css','/neo-glass.css','/app.js','/recovery.js',
 '/neo-glass.mjs','/insights-core.mjs','/analytics-window.mjs','/diagnostics.mjs',
 '/migration-crypto.js','/event-utils.mjs','/manifest.webmanifest','/icon.svg'];
async function populateShell(cache){
 const all=await Promise.all(SHELL_ASSETS.map(async path=>{
  const response=await fetch(new Request(path,{cache:'reload'}));
  const contentType=response.headers.get('Content-Type')||'';
  if(!response.ok||
   (/\.(?:mjs|js)$/.test(path)&&!/javascript|ecmascript/i.test(contentType))||
   (/\.css$/.test(path)&&!/text\/css/i.test(contentType))||
   (path==='/'&&!/text\/html/i.test(contentType)))
    throw Error('Unexpected asset '+path);
  return {path,response};
 }));
 await Promise.all(all.map(({path,response})=>cache.put(path,response)));
}
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(SHELL_CACHE);
  try{await populateShell(cache);await self.skipWaiting();}
  catch(e){await caches.delete(SHELL_CACHE);throw e;}
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(SHELL_CACHE);
  const complete=(await Promise.all(SHELL_ASSETS.map(p=>cache.match(p)))).every(Boolean);
  if(!complete)throw Error('Incomplete shell');
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>(k.startsWith('vyron-control-shell-')||
    k.startsWith('vyron-peisov-yt-shell-'))&&k!==SHELL_CACHE)
   .map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
function recoveryPage(){
 return new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VYRON восстановление</title><h1>VYRON не загрузился</h1><p>Подключись к интернету и обнови страницу. Сессия не удалена.</p><a href="/">Попробовать снова</a></html>',
  {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||
    url.pathname==='/build-info.json')return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(SHELL_CACHE);
   const cached=await cache.match('/');
   if(cached)return cached;
   try{const response=await fetch(request);return response.ok?response:recoveryPage();}
   catch{return recoveryPage();}
  })());
  return;
 }
 if(SHELL_ASSETS.includes(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(SHELL_CACHE);
   const cached=await cache.match(url.pathname);
   if(cached)return cached;
   try{const response=await fetch(request);return response.ok?response:Response.error();}
   catch{return Response.error();}
  })());
 }
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='VYRON_PWA_VERSION_PROBE')return;
 event.waitUntil((async()=>{
  let complete=false;
  try{const cache=await caches.open(SHELL_CACHE);
   complete=(await Promise.all(SHELL_ASSETS.map(path=>cache.match(path)))).every(Boolean);
  }catch{}
  event.ports?.[0]?.postMessage({cacheName:SHELL_CACHE,complete});
 })());
});

/* Web Push for installed iPhone PWA. No API credentials. */
self.addEventListener('push', event => {
  let data={};
  try {data=event.data?.json()||{};}catch{}
  const title=String(data.title||'VYRON PEISOV YT').slice(0,100);
  const body=String(data.body||'Появилось новое событие').slice(0,200);
  const tag=String(data.tag||'vyron-control-event').slice(0,100);
  const view=['studio','analytics','channels','notifications'].includes(data.view)
    ?data.view:'notifications';
  const destination='/?view='+encodeURIComponent(view);
  event.waitUntil(self.registration.showNotification(title,{
    body,tag,renotify:false,
    icon:'/icon.svg',badge:'/icon.svg',
    data:{url:destination}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const requested=event.notification.data?.url||'/?view=notifications';
  const destination=new URL(requested,self.location.origin);
  if(destination.origin!==self.location.origin||
     !['studio','analytics','channels','notifications'].includes(destination.searchParams.get('view')))
    destination.href=self.location.origin+'/?view=notifications';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
    const opened=windows.find(client=>client.url.startsWith(self.registration.scope));
    if(opened){
      try{const navigated=await opened.navigate(destination.href);if(navigated)return navigated.focus();}
      catch{};
      return opened.focus();
    }
    return clients.openWindow(destination.href);
  }));
});
