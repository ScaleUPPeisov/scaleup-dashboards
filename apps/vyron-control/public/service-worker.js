/* VYRON CONTROL — Web Push for installed iPhone PWA. No API credentials. */
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
