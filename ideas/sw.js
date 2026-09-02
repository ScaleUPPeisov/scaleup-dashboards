const CACHE='ideas-shell-v8';
const APP_URL='https://scaleuppeisov.github.io/scaleup-dashboards/ideas/';
const SHELL=['./','./index.html','./app.js?v=8','./manifest.webmanifest?v=8','./icon.svg'];
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
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('ideas-shell-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==self.location.origin)return;e.respondWith((async()=>{try{const fresh=await fetch(r,{cache:'no-store'});if(fresh.ok){const c=await caches.open(CACHE);c.put(r,fresh.clone()).catch(()=>{});}return fresh;}catch{return(await caches.match(r))||(await caches.match('./index.html'))||Response.error();}})());});
self.addEventListener('push',e=>{let data={};try{data=e.data?e.data.json():{};}catch{}const body=MESSAGES[Math.floor(Math.random()*MESSAGES.length)];e.waitUntil(self.registration.showNotification('Ideas',{body,icon:'./icon.svg',badge:'./icon.svg',tag:'ideas-'+Date.now(),renotify:true,silent:false,data:{url:APP_URL}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const c of list){if(c.url.startsWith(APP_URL)&&'focus'in c){await c.focus();return;}}if(self.clients.openWindow)await self.clients.openWindow(APP_URL);})());});
