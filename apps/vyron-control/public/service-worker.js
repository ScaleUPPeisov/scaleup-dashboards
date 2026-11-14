/* VYRON CONTROL PWA shell cache. Private API responses are never cached. */
const SHELL_CACHE='vyron-control-shell-v2';
const SHELL_ASSETS=['/','/styles.css','/app.js','/migration-crypto.js','/manifest.webmanifest','/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE)
    .then(cache=>cache.addAll(SHELL_ASSETS))
    .catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith('vyron-control-shell-')&&key!==SHELL_CACHE)
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

/* Web Push for installed iPhone PWA. No API credentials. */
self.addEventListener('push', event => {
  let data={};
  try {data=event.data?.json()||{};}catch{}
  const title=String(data.title||'VYRON CONTROL').slice(0,100);
  const body=String(data.body||'Появилось новое событие').slice(0,200);
  const tag=String(data.tag||'vyron-control-event').slice(0,100);
  event.waitUntil(self.registration.showNotification(title,{
    body,tag,renotify:false,
    icon:'/icon.svg',badge:'/icon.svg',
    data:{url:'/'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    const opened=windows.find(client=>client.url.startsWith(self.registration.scope));
    if(opened)return opened.focus();
    return clients.openWindow('/');
  }));
});
