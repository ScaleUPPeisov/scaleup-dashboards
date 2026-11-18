/* VYRON PEISOV YT PWA shell cache. Private API responses are never cached. */
const SHELL_CACHE='vyron-peisov-yt-shell-v11';
const SHELL_ASSETS=['/','/styles.css','/neo-glass.css','/app.js','/neo-glass.mjs','/insights-core.mjs','/analytics-window.mjs','/diagnostics.mjs','/migration-crypto.js','/event-utils.mjs','/manifest.webmanifest','/icon.svg'];

self.addEventListener('install',event=>{
  // Never activate a new worker with an incomplete offline shell. Otherwise
  // WebKit may discard the new version and revert to its previous controller.
  event.waitUntil(caches.open(SHELL_CACHE)
    .then(cache=>cache.addAll(SHELL_ASSETS))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>(key.startsWith('vyron-control-shell-')||key.startsWith('vyron-peisov-yt-shell-'))&&key!==SHELL_CACHE)
      .map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response.ok){
          const cache=await caches.open(SHELL_CACHE);
          await cache.put('/',response.clone());
        }
        return response;
      }catch{
        return await caches.match('/')||Response.error();
      }
    })());
    return;
  }
  if(SHELL_ASSETS.includes(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL_CACHE);
      const cached=await cache.match(request);
      try{
        const response=await fetch(request);
        if(response.ok)await cache.put(request,response.clone());
        return response;
      }catch{
        return cached||Response.error();
      }
    })());
  }
});

/* Active Service Worker version probe. Also repairs a shell cache that a retiring
   worker may have evicted during concurrent activation on WebKit. No API caching. */
self.addEventListener('message',event=>{
  if(event.data?.type!=='VYRON_PWA_VERSION_PROBE')return;
  event.waitUntil((async()=>{
    let complete=false;
    try{
      const cache=await caches.open(SHELL_CACHE);
      if(!await cache.match('/'))await cache.addAll(SHELL_ASSETS);
      complete=Boolean(await cache.match('/'));
    }catch{} // Offline: report incomplete rather than claim cache integrity.
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
