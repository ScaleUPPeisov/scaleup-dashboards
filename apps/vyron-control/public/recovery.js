// Standalone CSP-safe boot watchdog. Never reads tokens, cookies or storage.
(()=>{
 const show=message=>{
  if(window.__vyronBootReady)return;
  const panel=document.getElementById('boot-recovery');
  if(!panel)return;
  const info=panel.querySelector('p');
  if(info)info.textContent=message+' Сохранённые сессии и данные не удаляются.';
  panel.hidden=false;
 };
 window.addEventListener('error',event=>{
  if(event.target?.tagName==='SCRIPT')show('Не удалось загрузить JavaScript-модуль.');
 },true);
 window.addEventListener('unhandledrejection',()=>{
  if(!window.__vyronBootReady)show('Ошибка JavaScript при запуске.');
 });
 document.addEventListener('DOMContentLoaded',()=>{
  const button=document.getElementById('recover-reload');
  button?.addEventListener('click',async()=>{
   button.disabled=true;
   try{const reg=await navigator.serviceWorker?.getRegistration();await reg?.update();}
   catch{}
   location.reload();
  });
  setTimeout(()=>show('Превышено время ожидания загрузки приложения.'),9000);
 });
})();
