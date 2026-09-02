const API = 'https://zwukfrzgezpctzfdidng.supabase.co/functions/v1/ideas-api';
const VAPID_PUBLIC = 'BNK1wT5668BYOi2OhjbZVG24ndAgx8K7BoiFUavWwxnGK1CNOmsgYYGfdak_BjtUDV9SvjPjnZfEUWEETZwMJe0';
const APP_VERSION = '2.4.0';
const $ = (id) => document.getElementById(id);

const state = {
  deviceId: localStorage.getItem('ideas.deviceId') || '',
  deviceSecret: localStorage.getItem('ideas.deviceSecret') || '',
  pairCode: localStorage.getItem('ideas.pairCode') || '',
  pairCodeExpiresAt: localStorage.getItem('ideas.pairCodeExpiresAt') || '',
  status: null,
  busy: false,
  refreshing: false,
};

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setTimeout(() => toast('Ideas установлено. Теперь открой его с иконки'), 200);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function timeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
function saveSession(data) {
  state.deviceId = data.deviceId;
  state.deviceSecret = data.deviceSecret;
  state.pairCode = data.pairCode || state.pairCode;
  state.pairCodeExpiresAt = data.pairCodeExpiresAt || state.pairCodeExpiresAt;
  localStorage.setItem('ideas.deviceId', state.deviceId);
  localStorage.setItem('ideas.deviceSecret', state.deviceSecret);
  localStorage.setItem('ideas.pairCode', state.pairCode || '');
  localStorage.setItem('ideas.pairCodeExpiresAt', state.pairCodeExpiresAt || '');
}
function clearSession() {
  state.deviceId = state.deviceSecret = state.pairCode = state.pairCodeExpiresAt = '';
  state.status = null;
  ['ideas.deviceId','ideas.deviceSecret','ideas.pairCode','ideas.pairCodeExpiresAt'].forEach((k) => localStorage.removeItem(k));
}
function hasSession() { return Boolean(state.deviceId && state.deviceSecret); }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isAndroid() { return /android/i.test(navigator.userAgent); }
function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function online() { return navigator.onLine !== false; }
function notificationsSupported() { return 'Notification' in window && 'serviceWorker' in navigator; }
function notificationPermission() { return 'Notification' in window ? Notification.permission : 'unsupported'; }

async function api(action, extra = {}) {
  if (!online()) throw new Error('Нет подключения к интернету');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ action, deviceId: state.deviceId, deviceSecret: state.deviceSecret, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.code === 'SESSION_INVALID') {
      clearSession();
      showSetup('choice');
    }
    if (!res.ok) {
      const e = new Error(data.error || `Ошибка ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Сервер отвечает слишком долго');
    throw e;
  } finally { clearTimeout(timer); }
}

function toast(text, ms = 1800) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(window.__ideasToast);
  window.__ideasToast = setTimeout(() => el.classList.remove('show'), ms);
}
function setMainBusy(busy) {
  state.busy = busy;
  $('mainBtn').disabled = busy;
  $('mainBtn').classList.toggle('loading', busy);
}
function setView(mode) {
  ['choice','created','joining','notifyOnly','settingsPanel'].forEach((id) => $(id).classList.toggle('hidden', id !== mode));
  $('installHint').classList.toggle('hidden', !(isIOS() && !isStandalone() && mode === 'created'));
}
function showSetup(mode = 'choice') {
  $('setup').classList.remove('hidden');
  setView(mode);
  if (mode === 'created') updateCodeView();
  if (mode === 'settingsPanel') renderSettings();
}
function hideSetup() { $('setup').classList.add('hidden'); }

function codeSecondsLeft() {
  if (!state.pairCodeExpiresAt) return null;
  return Math.max(0, Math.ceil((new Date(state.pairCodeExpiresAt).getTime() - Date.now()) / 1000));
}
function updateCodeView() {
  $('pairCode').textContent = state.pairCode || '------';
  const left = codeSecondsLeft();
  if (left === null) { $('codeTimer').textContent = ''; return; }
  if (left <= 0) {
    $('codeTimer').textContent = 'Код истёк';
    $('rotateCodeBtn').classList.remove('hidden');
    $('enableBtn').classList.add('hidden');
  } else {
    const m = String(Math.floor(left / 60)).padStart(2,'0');
    const s = String(left % 60).padStart(2,'0');
    $('codeTimer').textContent = `Код действует ещё ${m}:${s}`;
    $('rotateCodeBtn').classList.add('hidden');
    $('enableBtn').classList.remove('hidden');
  }
}
setInterval(() => { if (!$('created').classList.contains('hidden')) updateCodeView(); }, 1000);

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}

async function requireInstalledApp(quiet = false) {
  if (isIOS() && !isStandalone()) {
    if (!quiet) showSetup(hasSession() ? 'notifyOnly' : 'choice');
    throw new Error('Сначала добавь Ideas на экран Домой');
  }
  if (isAndroid() && !isStandalone()) {
    if (quiet) return false;
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice?.outcome === 'accepted') {
          throw new Error('Ideas установлено. Открой приложение с иконки и включи обновления');
        }
      } catch (e) {
        if (/установлено/.test(e?.message || '')) throw e;
      }
    }
    throw new Error('На Android сначала установи Ideas: меню Chrome ⋮ → Установить приложение');
  }
  return true;
}

async function waitForActivatedRegistration(reg) {
  if (reg.active) return reg;
  const worker = reg.installing || reg.waiting;
  if (!worker) {
    await sleep(250);
    const again = await navigator.serviceWorker.getRegistration('./');
    if (again?.active) return again;
    throw new Error('Служба уведомлений ещё не запустилась');
  }
  await new Promise((resolve, reject) => {
    const onState = () => {
      if (worker.state === 'activated') resolve();
      if (worker.state === 'redundant') reject(new Error('Не удалось запустить службу уведомлений'));
    };
    worker.addEventListener('statechange', onState);
    onState();
  });
  return reg;
}
async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Уведомления не поддерживаются этим браузером');
  const reg = await timeout(
    navigator.serviceWorker.register('./sw.js?v=6', { scope: './', updateViaCache: 'none' }),
    6000,
    'Не удалось запустить службу уведомлений'
  );
  try { await timeout(reg.update(), 2500, ''); } catch {}
  if (reg.active) return reg;
  return timeout(waitForActivatedRegistration(reg), 7000, 'Служба уведомлений запускается слишком долго. Закрой Ideas и открой снова');
}
async function currentSubscription() {
  try {
    let reg = await navigator.serviceWorker.getRegistration('./');
    if (!reg?.active) reg = await ensureServiceWorker();
    return reg.pushManager ? await timeout(reg.pushManager.getSubscription(), 5000, 'Не удалось проверить push-подписку') : null;
  } catch { return null; }
}
function pushPermissionError() {
  if (notificationPermission() === 'denied') {
    return new Error('Уведомления запрещены. Открой настройки устройства → Уведомления → Ideas');
  }
  return new Error('Разрешение на уведомления не выдано');
}
async function enablePush({ quiet = false, progress = null } = {}) {
  if (!notificationsSupported()) throw new Error('На этом устройстве push-уведомления не поддерживаются');
  const installed = await requireInstalledApp(quiet);
  if (!installed) return false;

  let permission = notificationPermission();
  if (permission === 'denied') throw pushPermissionError();
  if (permission !== 'granted') {
    if (quiet) return false;
    progress?.('Разреши уведомления…');
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') throw pushPermissionError();

  progress?.('Подключаю…');
  const reg = await ensureServiceWorker();
  if (!reg.pushManager) throw new Error('Push-уведомления недоступны в этой версии браузера');

  let subscription = await timeout(reg.pushManager.getSubscription(), 5000, 'Не удалось проверить push-подписку');
  if (!subscription) {
    subscription = await timeout(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) }),
      10000,
      'Не удалось создать push-подписку. Закрой Ideas и открой снова'
    );
  }
  await api('subscribe', { subscription: subscription.toJSON() });
  return true;
}

function renderSettings() {
  const s = state.status || {};
  $('linkState').textContent = s.paired ? 'Готово' : 'Ожидает второго устройства';
  $('pushState').textContent = s.ownPushReady && notificationPermission() === 'granted' ? 'Включены' : 'Нужна настройка';
  $('partnerState').textContent = s.partnerPushReady ? 'Готово' : s.paired ? 'Нужна настройка' : 'Не подключено';
  $('repairBtn').textContent = s.ownPushReady ? 'Переподключить уведомления' : 'Включить уведомления';
}

async function refreshStatus({ autoRepair = true, quiet = false } = {}) {
  if (!hasSession() || state.refreshing) return;
  state.refreshing = true;
  try {
    const s = await api('status');
    state.status = s;
    if (s.pairCode) { state.pairCode=s.pairCode; localStorage.setItem('ideas.pairCode',s.pairCode); }
    if (s.pairCodeExpiresAt) { state.pairCodeExpiresAt=s.pairCodeExpiresAt; localStorage.setItem('ideas.pairCodeExpiresAt',s.pairCodeExpiresAt); }

    if (autoRepair && notificationsSupported() && isStandalone() && notificationPermission() === 'granted') {
      const localSub = await currentSubscription();
      if (!localSub || !s.ownPushReady) {
        try { await enablePush({quiet:true}); state.status = await api('status'); } catch {}
      }
    }

    if (!state.status.paired) { showSetup('created'); return; }
    if (notificationPermission() !== 'granted' || !state.status.ownPushReady) { showSetup('notifyOnly'); return; }
    hideSetup();
  } catch (e) {
    if (!quiet && e.status !== 401) toast(e.message || 'Нет связи с сервером', 2600);
  } finally { state.refreshing = false; }
}

async function createPair() {
  $('createBtn').disabled = true;
  try { const data=await api('create_pair'); saveSession(data); showSetup('created'); }
  catch(e){ toast(e.message,2600); }
  finally { $('createBtn').disabled=false; }
}
async function joinPair() {
  const pairCode=$('codeInput').value.replace(/\D/g,'').slice(0,6);
  if(pairCode.length!==6) return toast('Введи 6 цифр');
  $('confirmJoinBtn').disabled=true;
  try {
    const data=await api('join_pair',{pairCode});
    saveSession(data);
    $('codeInput').value='';
    showSetup('notifyOnly');
  } catch(e){ toast(e.message==='Срок действия кода истёк'?'Попроси новый код':e.message,2600); }
  finally { $('confirmJoinBtn').disabled=false; }
}
async function rotateCode() {
  $('rotateCodeBtn').disabled=true;
  try {
    const data=await api('rotate_code');
    state.pairCode=data.pairCode; state.pairCodeExpiresAt=data.pairCodeExpiresAt;
    localStorage.setItem('ideas.pairCode',state.pairCode); localStorage.setItem('ideas.pairCodeExpiresAt',state.pairCodeExpiresAt);
    updateCodeView(); toast('Новый код готов');
  } catch(e){ toast(e.message,2600); }
  finally { $('rotateCodeBtn').disabled=false; }
}
async function activateUpdates(event) {
  const btn = event?.currentTarget || ($('notifyOnly').classList.contains('hidden') ? $('enableBtn') : $('notifyBtn'));
  const original = btn.textContent;
  btn.disabled = true;
  try {
    await enablePush({ progress: (text) => { btn.textContent = text; } });
    btn.textContent = 'Готово ✓';
    toast('Уведомления включены');
    await sleep(350);
    await refreshStatus({autoRepair:false});
  } catch(e) {
    toast(e.message || 'Не удалось включить уведомления', 5200);
  } finally {
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 450);
  }
}
async function repairPush() {
  const btn=$('repairBtn');
  const original=btn.textContent;
  btn.disabled=true;
  try {
    const old = await currentSubscription();
    if (old) { try { await old.unsubscribe(); } catch {} }
    await enablePush({progress:(t)=>{btn.textContent=t;}});
    await refreshStatus({autoRepair:false,quiet:true});
    renderSettings();
    toast('Уведомления подключены');
  } catch(e){ toast(e.message,5200); }
  finally { btn.textContent=original; btn.disabled=false; }
}
async function disconnect() {
  if(!confirm('Разорвать связь между двумя устройствами?')) return;
  $('disconnectBtn').disabled=true;
  try {
    try { await api('disconnect'); } catch(e) { if(e.status!==401) throw e; }
    try { const sub=await currentSubscription(); if(sub) await sub.unsubscribe(); } catch {}
    clearSession(); $('codeInput').value=''; showSetup('choice'); toast('Связь удалена');
  } catch(e){ toast(e.message,2600); }
  finally { $('disconnectBtn').disabled=false; }
}
async function sendSignal() {
  if(state.busy) return;
  if(!hasSession()) return showSetup('choice');
  setMainBusy(true);
  try {
    if(notificationPermission()!=='granted') await enablePush();
    const result=await api('send_signal');
    if(result.sent>0) toast('Подборка обновлена');
  } catch(e) {
    if(/уведомлен|экран Домой|разрешен|iOS|push|установи Ideas/i.test(e.message)) showSetup('notifyOnly');
    if(/Второе устройство/i.test(e.message)) showSetup('created');
    toast(e.message.includes('втор')?'Подборка пока недоступна':e.message,4200);
  } finally { setTimeout(()=>setMainBusy(false),700); }
}

$('createBtn').addEventListener('click',createPair);
$('joinBtn').addEventListener('click',()=>showSetup('joining'));
$('backBtn').addEventListener('click',()=>showSetup('choice'));
$('confirmJoinBtn').addEventListener('click',joinPair);
$('enableBtn').addEventListener('click',activateUpdates);
$('notifyBtn').addEventListener('click',activateUpdates);
$('rotateCodeBtn').addEventListener('click',rotateCode);
$('mainBtn').addEventListener('click',sendSignal);
$('settingsBtn').addEventListener('click',async()=>{ if(!hasSession()) return showSetup('choice'); await refreshStatus({autoRepair:false,quiet:true}); showSetup('settingsPanel'); });
$('closeSettingsBtn').addEventListener('click',hideSetup);
$('repairBtn').addEventListener('click',repairPush);
$('disconnectBtn').addEventListener('click',disconnect);
$('codeInput').addEventListener('input',(e)=>{ e.target.value=e.target.value.replace(/\D/g,'').slice(0,6); });
$('codeInput').addEventListener('keydown',(e)=>{ if(e.key==='Enter') joinPair(); });

window.addEventListener('load',async()=>{
  ensureServiceWorker().catch(()=>{});
  if(!hasSession()) showSetup('choice'); else await refreshStatus({autoRepair:false});
});
window.addEventListener('online',()=>{ if(hasSession()) refreshStatus({quiet:true}); });
window.addEventListener('offline',()=>toast('Нет подключения к интернету'));
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&hasSession()) refreshStatus({quiet:true,autoRepair:false}); });
setInterval(()=>{ if(document.visibilityState==='visible'&&hasSession()) refreshStatus({quiet:true,autoRepair:false}); },12000);