const API='https://zwukfrzgezpctzfdidng.supabase.co/functions/v1/ideas-api';
const VAPID_PUBLIC='BNK1wT5668BYOi2OhjbZVG24ndAgx8K7BoiFUavWwxnGK1CNOmsgYYGfdak_BjtUDV9SvjPjnZfEUWEETZwMJe0';
const APP_VERSION='2.5.0';
const $=(id)=>document.getElementById(id);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

const state={
  deviceId:localStorage.getItem('ideas.deviceId')||'',
  deviceSecret:localStorage.getItem('ideas.deviceSecret')||'',
  pairCode:localStorage.getItem('ideas.pairCode')||'',
  pairCodeExpiresAt:localStorage.getItem('ideas.pairCodeExpiresAt')||'',
  status:null,busy:false,refreshing:false,
};
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;toast('Ideas установлено');});

function timeout(p,ms,msg){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg)),ms))]);}
function hasSession(){return Boolean(state.deviceId&&state.deviceSecret);}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function isAndroid(){return /android/i.test(navigator.userAgent);}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
function notificationsSupported(){return 'Notification'in window&&'serviceWorker'in navigator;}
function permission(){return 'Notification'in window?Notification.permission:'unsupported';}
function online(){return navigator.onLine!==false;}

function saveSession(data){
  state.deviceId=data.deviceId;state.deviceSecret=data.deviceSecret;
  state.pairCode=data.pairCode||state.pairCode;state.pairCodeExpiresAt=data.pairCodeExpiresAt||state.pairCodeExpiresAt;
  localStorage.setItem('ideas.deviceId',state.deviceId);localStorage.setItem('ideas.deviceSecret',state.deviceSecret);
  localStorage.setItem('ideas.pairCode',state.pairCode||'');localStorage.setItem('ideas.pairCodeExpiresAt',state.pairCodeExpiresAt||'');
}
function clearSession(){
  state.deviceId=state.deviceSecret=state.pairCode=state.pairCodeExpiresAt='';state.status=null;
  ['ideas.deviceId','ideas.deviceSecret','ideas.pairCode','ideas.pairCodeExpiresAt'].forEach(k=>localStorage.removeItem(k));
}
async function api(action,extra={}){
  if(!online())throw new Error('Нет подключения к интернету');
  const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
  try{
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},signal:c.signal,body:JSON.stringify({action,deviceId:state.deviceId,deviceSecret:state.deviceSecret,...extra})});
    const data=await r.json().catch(()=>({}));
    if(r.status===401&&data.code==='SESSION_INVALID'){clearSession();showSetup('choice');}
    if(!r.ok){const e=new Error(data.error||`Ошибка ${r.status}`);e.status=r.status;e.code=data.code||'';throw e;}
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('Сервер отвечает слишком долго');throw e;}finally{clearTimeout(t);}
}

function toast(text,ms=2200){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(window.__ideasToast);window.__ideasToast=setTimeout(()=>el.classList.remove('show'),ms);}
function setMainBusy(v){state.busy=v;$('mainBtn').disabled=v;$('mainBtn').classList.toggle('loading',v);}
function setView(mode){['choice','created','joining','notifyOnly','settingsPanel','pinPanel'].forEach(id=>$(id).classList.toggle('hidden',id!==mode));}
function showSetup(mode='choice'){ $('setup').classList.remove('hidden');setView(mode);if(mode==='created')updateCodeView();if(mode==='settingsPanel')renderSettings();if(mode==='pinPanel'){setTimeout(()=>{$('sendPin').focus();},100);} }
function hideSetup(){$('setup').classList.add('hidden');}

function codeSecondsLeft(){if(!state.pairCodeExpiresAt)return null;return Math.max(0,Math.ceil((new Date(state.pairCodeExpiresAt).getTime()-Date.now())/1000));}
function updateCodeView(){
  $('pairCode').textContent=state.pairCode||'------';const left=codeSecondsLeft();
  if(left===null){$('codeTimer').textContent='';return;}
  if(left<=0){$('codeTimer').textContent='Код истёк';$('rotateCodeBtn').classList.remove('hidden');}
  else{$('rotateCodeBtn').classList.add('hidden');$('codeTimer').textContent=`Код действует ещё ${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;}
}
setInterval(()=>{if(!$('created').classList.contains('hidden'))updateCodeView();},1000);

function b64u(s){const pad='='.repeat((4-s.length%4)%4),b=(s+pad).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from([...atob(b)].map(c=>c.charCodeAt(0)));}
async function requireInstalled(){
  if(isIOS()&&!isStandalone())throw new Error('На iPhone добавь Ideas на экран Домой и открой с иконки');
  if(isAndroid()&&!isStandalone()){
    if(deferredInstallPrompt){try{await deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;}catch{}}
    throw new Error('На Android сначала установи Ideas из меню браузера и открой с иконки');
  }
}
async function ensureSW(){
  if(!('serviceWorker'in navigator))throw new Error('Уведомления не поддерживаются');
  const reg=await timeout(navigator.serviceWorker.register('./sw.js?v=8',{scope:'./',updateViaCache:'none'}),7000,'Не удалось запустить уведомления');
  try{await timeout(reg.update(),2500,'');}catch{}
  if(reg.active)return reg;
  return timeout(navigator.serviceWorker.ready,8000,'Служба уведомлений запускается слишком долго');
}
async function currentSubscription(){try{const reg=await ensureSW();return reg.pushManager?await timeout(reg.pushManager.getSubscription(),5000,'Не удалось проверить подписку'):null;}catch{return null;}}
async function enablePush(progress=()=>{}){
  if(!notificationsSupported())throw new Error('Push-уведомления не поддерживаются');
  await requireInstalled();
  let p=permission();
  if(p==='denied')throw new Error('Уведомления запрещены в настройках устройства');
  if(p!=='granted'){progress('Разреши уведомления…');p=await Notification.requestPermission();}
  if(p!=='granted')throw new Error('Разрешение на уведомления не выдано');
  progress('Подключаю…');
  const reg=await ensureSW();if(!reg.pushManager)throw new Error('Push недоступен');
  let sub=await timeout(reg.pushManager.getSubscription(),5000,'Не удалось проверить подписку');
  if(!sub)sub=await timeout(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(VAPID_PUBLIC)}),10000,'Не удалось создать push-подписку');
  await api('subscribe',{subscription:sub.toJSON()});return true;
}

function renderSettings(){
  const s=state.status||{};
  $('linkState').textContent=s.paired?'Готово':'Ожидает второго устройства';
  $('pushState').textContent=s.ownPushReady&&permission()==='granted'?'Включены':'Нужна настройка';
  $('partnerState').textContent=s.partnerPushReady?'Готово':s.paired?'Нужна настройка':'Не подключено';
  $('repairBtn').textContent=s.ownPushReady?'Переподключить обновления':'Включить обновления';
}
async function refreshStatus({quiet=false,autoRepair=true}={}){
  if(!hasSession()||state.refreshing)return;state.refreshing=true;
  try{
    let s=await api('status');state.status=s;
    if(s.pairCode){state.pairCode=s.pairCode;localStorage.setItem('ideas.pairCode',s.pairCode);}
    if(s.pairCodeExpiresAt){state.pairCodeExpiresAt=s.pairCodeExpiresAt;localStorage.setItem('ideas.pairCodeExpiresAt',s.pairCodeExpiresAt);}
    if(autoRepair&&isStandalone()&&notificationsSupported()&&permission()==='granted'&&!s.ownPushReady){try{const sub=await currentSubscription();if(sub)await api('subscribe',{subscription:sub.toJSON()});s=await api('status');state.status=s;}catch{}}
    if(!s.paired){showSetup('created');return;}
    if(permission()!=='granted'||!s.ownPushReady){showSetup('notifyOnly');return;}
    hideSetup();
  }catch(e){if(!quiet&&e.status!==401)toast(e.message||'Нет связи с сервером',3000);}finally{state.refreshing=false;}
}

async function createPair(){const b=$('createBtn');b.disabled=true;try{const d=await api('create_pair');saveSession(d);showSetup('created');}catch(e){toast(e.message,3000);}finally{b.disabled=false;}}
async function joinPair(){const code=$('codeInput').value.replace(/\D/g,'').slice(0,6);if(code.length!==6)return toast('Введи 6 цифр');const b=$('confirmJoinBtn');b.disabled=true;try{const d=await api('join_pair',{pairCode:code});saveSession(d);$('codeInput').value='';showSetup('notifyOnly');}catch(e){toast(e.code==='CODE_EXPIRED'?'Попроси новый код':e.message,3200);}finally{b.disabled=false;}}
async function rotateCode(){const b=$('rotateCodeBtn');b.disabled=true;try{const d=await api('rotate_code');state.pairCode=d.pairCode;state.pairCodeExpiresAt=d.pairCodeExpiresAt;localStorage.setItem('ideas.pairCode',d.pairCode);localStorage.setItem('ideas.pairCodeExpiresAt',d.pairCodeExpiresAt);updateCodeView();toast('Новый код готов');}catch(e){toast(e.message);}finally{b.disabled=false;}}
async function activateUpdates(e){const b=e.currentTarget,old=b.textContent;b.disabled=true;try{await enablePush(t=>b.textContent=t);b.textContent='Готово ✓';toast('Уведомления включены');await sleep(300);await refreshStatus({autoRepair:false});}catch(err){toast(err.message,4500);}finally{setTimeout(()=>{b.textContent=old;b.disabled=false;},400);}}
async function repairPush(){const b=$('repairBtn'),old=b.textContent;b.disabled=true;try{const sub=await currentSubscription();if(sub)try{await sub.unsubscribe();}catch{}await enablePush(t=>b.textContent=t);await refreshStatus({quiet:true,autoRepair:false});renderSettings();toast('Уведомления подключены');}catch(e){toast(e.message,4500);}finally{b.textContent=old;b.disabled=false;}}
async function testPush(){const b=$('testPushBtn');b.disabled=true;try{await api('test_self_push');toast('Тестовое уведомление отправлено');}catch(e){toast(e.message,4000);}finally{b.disabled=false;}}
async function disconnect(){if(!confirm('Сбросить связь между устройствами?'))return;const b=$('disconnectBtn');b.disabled=true;try{await api('disconnect');try{const s=await currentSubscription();if(s)await s.unsubscribe();}catch{}clearSession();$('codeInput').value='';hideSetup();showSetup('choice');toast('Связь удалена');}catch(e){toast(e.message);}finally{b.disabled=false;}}

async function openSendPin(){
  if(state.busy)return;if(!hasSession())return showSetup('choice');setMainBusy(true);
  try{
    const s=await api('status');state.status=s;
    if(!s.paired){showSetup('created');return;}
    if(!s.partnerPushReady){toast('На втором устройстве не включены обновления',3600);return;}
    $('sendPin').value='';showSetup('pinPanel');
  }catch(e){toast(e.message,3600);}finally{setMainBusy(false);}
}
async function confirmSend(){
  const pin=$('sendPin').value.replace(/\D/g,'').slice(0,4);if(pin.length!==4)return toast('Введи 4 цифры');
  const b=$('confirmSendBtn');b.disabled=true;
  try{const r=await api('send_signal',{pin});if(r.sent>0){$('sendPin').value='';hideSetup();toast('Подборка обновлена');}}
  catch(e){
    if(e.code==='INVALID_SEND_PIN'){ $('sendPin').value='';$('sendPin').classList.remove('shake');void $('sendPin').offsetWidth;$('sendPin').classList.add('shake');toast('Код неверный',2600);setTimeout(()=>$('sendPin').focus(),50); }
    else if(e.code==='PARTNER_PUSH_MISSING'){hideSetup();toast('На втором устройстве не включены обновления',4000);}
    else if(e.code==='PARTNER_MISSING'){showSetup('created');toast('Второе устройство ещё не подключено',3500);}
    else toast(e.message,4000);
  }finally{b.disabled=false;}
}

$('createBtn').addEventListener('click',createPair);
$('joinBtn').addEventListener('click',()=>showSetup('joining'));
$('backBtn').addEventListener('click',()=>showSetup('choice'));
$('confirmJoinBtn').addEventListener('click',joinPair);
$('rotateCodeBtn').addEventListener('click',rotateCode);
$('enableBtn').addEventListener('click',activateUpdates);
$('notifyBtn').addEventListener('click',activateUpdates);
$('settingsBtn').addEventListener('click',async()=>{if(!hasSession())return showSetup('choice');await refreshStatus({quiet:true});showSetup('settingsPanel');});
$('closeSettingsBtn').addEventListener('click',hideSetup);
$('repairBtn').addEventListener('click',repairPush);
$('testPushBtn').addEventListener('click',testPush);
$('disconnectBtn').addEventListener('click',disconnect);
$('mainBtn').addEventListener('click',openSendPin);
$('cancelSendBtn').addEventListener('click',hideSetup);
$('confirmSendBtn').addEventListener('click',confirmSend);
$('sendPin').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,4);});
$('sendPin').addEventListener('keydown',e=>{if(e.key==='Enter')confirmSend();});
$('codeInput').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,6);});
window.addEventListener('online',()=>refreshStatus({quiet:true}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshStatus({quiet:true});});

(async function boot(){
  try{await ensureSW();}catch{}
  if(!hasSession())showSetup('choice');else await refreshStatus({quiet:true});
  setInterval(()=>refreshStatus({quiet:true}),6000);
})();
