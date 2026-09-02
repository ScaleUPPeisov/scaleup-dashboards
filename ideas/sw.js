const CACHE='ideas-shell-v7';
const APP_URL='https://scaleuppeisov.github.io/scaleup-dashboards/ideas/';
const SHELL=['./','./index.html','./app.js?v=5','./manifest.webmanifest?v=5','./icon.svg'];
const MESSAGES=[
  'Посмотреть свежую подборку',
  'Новые изображения готовы',
  'Коллекция обновлена',
  'Открыть новую подборку',
  'Свежие изображения уже внутри',
  'Новая подборка доступна',
  'Обновление коллекции',
  'Доступны новые материалы',
  'Открыть изображения',
  'Добавлены новые идеи',
  'Свежая подборка уже доступна',
  'Новые материалы в коллекции'
];
self.addEventListener('install',(event)=>{event.waitUntil(caches.open(CACHE).then((c)=>c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting()))});
self.addEventListener('activate',(event)=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter((k)=>k.startsWith('ideas-shell-')&&k!==CACHE).map((k)=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',(event)=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;event.respondWith((async()=>{try{const fresh=await fetch(req,{cache:'no-store'});if(fresh.ok){const c=await caches.open(CACHE);c.put(req,fresh.clone()).catch(()=>{})}return fresh}catch{return(await caches.match(req))||(await caches.match('./index.html'))||Response.error()}})())});
self.addEventListener('push',(event)=>{let data={};try{data=event.data?event.data.json():{}}catch{}const body=MESSAGES[Math.floor(Math.random()*MESSAGES.length)];event.waitUntil(self.registration.showNotification('Ideas',{body,icon:'./icon.svg',badge:'./icon.svg',tag:'ideas-'+Date.now(),renotify:true,silent:false,data:{url:APP_URL}}))});
self.addEventListener('notificationclick',(event)=>{event.notification.close();event.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of list){try{const u=new URL(client.url);if(u.pathname.startsWith('/scaleup-dashboards/ideas/')&&'focus'in client){await client.focus();if('navigate'in client&&client.url!==APP_URL)await client.navigate(APP_URL);return}}catch{}}if(self.clients.openWindow)await self.clients.openWindow(APP_URL)})())});