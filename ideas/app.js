const API = 'https://zwukfrzgezpctzfdidng.supabase.co/functions/v1/ideas-api';
const VAPID_PUBLIC = 'BNK1wT5668BYOi2OhjbZVG24ndAgx8K7BoiFUavWwxnGK1CNOmsgYYGfdak_BjtUDV9SvjPjnZfEUWEETZwMJe0';
const $ = (id) => document.getElementById(id);

const state = {
  deviceId: localStorage.getItem('ideas.deviceId') || '',
  deviceSecret: localStorage.getItem('ideas.deviceSecret') || '',
  pairCode: localStorage.getItem('ideas.pairCode') || '',
  pairCodeExpiresAt: localStorage.getItem('ideas.pairCodeExpiresAt') || '',
  status: null,
  busy: false,
};

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
function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function online() { return navigator.onLine !== false; }

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
  $('installHint').classList.toggle('hidden', !(isIOS() && !isStandalone() && ['created','notifyOnly','settingsPanel'].includes(mode)));
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
async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Уведомления не поддерживаются этим браузером');
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
  try { await reg.update(); } catch {}
  return navigator.serviceWorker.ready;
}
async function currentSubscription() {
  try { return (await ensureServiceWorker()).pushManager.getSubscription(); } catch { return null; }
}
async function enablePush({ quiet = false } = {}) {
  if (isIOS() && !isStandalone()) {
    if (!quiet) { showSetup(hasSession() ? 'notifyOnly' : 'choice'); $('installHint').classList.remove('hidden'); }
    throw new Error('Сначала добавь Ideas на экран Домой');
  }
  if (!('Notification' in window)) throw new Error('Уведомления не поддерживаются');
  let permission = Notification.permission;
  if (permission !== 'granted') {
    if (quiet) return false;
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано');
  const reg = await ensureServiceWorker();
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) });
  await api('subscribe', { subscription: subscription.toJSON() });
  return true;
}

function renderSettings() {
  const s = state.status || {};
  $('linkState').textContent = s.paired ? 'Готово' : 'Ожидает второго устройства';
  $('pushState').textContent = s.ownPushReady && Notification.permission === 'granted' ? 'Включены' : 'Нужна настройка';
  $('partnerState').textContent = s.partnerPushReady ? 'Готово' : s.paired ? 'Нужна настройка' : 'Не подключено';
  $('repairBtn').textContent = s.ownPushReady ? 'Проверить уведомления' : 'Включить уведомления';
}

async function refreshStatus({ autoRepair = true } = {}) {
  if (!hasSession()) return;
  try {
    const s = await api('status');
    state.status = s;
    if (s.pairCode) { state.pairCode=s.pairCode; localStorage.setItem('ideas.pairCode',s.pairCode); }
    if (s.pairCodeExpiresAt) { state.pairCodeExpiresAt=s.pairCodeExpiresAt; localStorage.setItem('ideas.pairCodeExpiresAt',s.pairCodeExpiresAt); }

    if (autoRepair && isStandalone() && Notification.permission === 'granted' && !s.ownPushReady) {
      try { await enablePush({quiet:true}); state.status = await api('status'); } catch {}
    }

    if (!state.status.paired) {
      showSetup('created');
      return;
    }
    if (Notification.permission !== 'granted' || !state.status.ownPushReady) {
      showSetup('notifyOnly');
      return;
    }
    hideSetup();
  } catch (e) {
    if (e.status !== 401) toast('Нет связи с сервером');
  }
}

async function createPair() {
  $('createBtn').disabled = true;
  try {
    const data = await api('create_pair');
    saveSession(data);
    showSetup('created');
  } catch (e) { toast(e.message); }
  finally { $('createBtn').disabled = false; }
}
async function joinPair() {
  const pairCode = $('codeInput').value.replace(/\D/g,'').slice(0,6);
  if (pairCode.length !== 6) return toast('Введи 6 цифр');
  $('confirmJoinBtn').disabled = true;
  try {
    const data = await api('join_pair',{pairCode});
    saveSession(data);
    showSetup('notifyOnly');
  } catch (e) { toast(e.message === 'Срок действия кода истёк' ? 'Попроси новый код' : e.message); }
  finally { $('confirmJoinBtn').disabled = false; }
}
async function rotateCode() {
  $('rotateCodeBtn').disabled = true;
  try {
    const data = await api('rotate_code');
    state.pairCode=data.pairCode; state.pairCodeExpiresAt=data.pairCodeExpiresAt;
    localStorage.setItem('ideas.pairCode',state.pairCode); localStorage.setItem('ideas.pairCodeExpiresAt',state.pairCodeExpiresAt);
    updateCodeView(); toast('Новый код готов');
  } catch(e) { toast(e.message); }
  finally { $('rotateCodeBtn').disabled = false; }
}
async function activateUpdates() {
  const btn = $('notifyOnly').classList.contains('hidden') ? $('enableBtn') : $('notifyBtn');
  btn.disabled = true;
  try { await enablePush(); toast('Готово'); await refreshStatus({autoRepair:false}); }
  catch(e) { toast(e.message,2400); }
  finally { btn.disabled = false; }
}
async function repairPush() {
  $('repairBtn').disabled=true;
  try { await enablePush(); await refreshStatus({autoRepair:false}); renderSettings(); toast('Уведомления работают'); }
  catch(e){ toast(e.message,2400); }
  finally { $('repairBtn').disabled=false; }
}
async function disconnect() {
  if (!confirm('Разорвать связь между двумя устройствами?')) return;
  $('disconnectBtn').disabled=true;
  try { await api('disconnect'); } catch(e) { if (e.status !== 401) return toast(e.message); }
  try { const sub=await currentSubscription(); if(sub) await sub.unsubscribe(); } catch {}
  clearSession(); $('codeInput').value=''; showSetup('choice'); toast('Связь удалена');
  $('disconnectBtn').disabled=false;
}
async function sendSignal() {
  if (state.busy) return;
  if (!hasSession()) return showSetup('choice');
  setMainBusy(true);
  try {
    if (Notification.permission !== 'granted') await enablePush();
    const result = await api('send_signal');
    if (result.sent > 0) toast('Подборка обновлена');
  } catch(e) {
    if (/уведомлен|экран Домой|разрешен/i.test(e.message)) showSetup('notifyOnly');
    if (/Второе устройство/i.test(e.message)) showSetup('created');
    toast(e.message.includes('втор') ? 'Подборка пока недоступна' : e.message,2200);
  } finally { setTimeout(() => setMainBusy(false),700); }
}

$('createBtn').addEventListener('click',createPair);
$('joinBtn').addEventListener('click',()=>showSetup('joining'));
$('backBtn').addEventListener('click',()=>showSetup('choice'));
$('confirmJoinBtn').addEventListener('click',joinPair);
$('enableBtn').addEventListener('click',activateUpdates);
$('notifyBtn').addEventListener('click',activateUpdates);
$('rotateCodeBtn').addEventListener('click',rotateCode);
$('mainBtn').addEventListener('click',sendSignal);
$('settingsBtn').addEventListener('click',async()=>{ if(!hasSession()) return showSetup('choice'); await refreshStatus({autoRepair:false}); showSetup('settingsPanel'); });
$('closeSettingsBtn').addEventListener('click',()=>hideSetup());
$('repairBtn').addEventListener('click',repairPush);
$('disconnectBtn').addEventListener('click',disconnect);
$('codeInput').addEventListener('input',(e)=>{ e.target.value=e.target.value.replace(/\D/g,'').slice(0,6); });
$('codeInput').addEventListener('keydown',(e)=>{ if(e.key==='Enter') joinPair(); });

window.addEventListener('load',async()=>{
  try { await ensureServiceWorker(); } catch {}
  if(!hasSession()) showSetup('choice'); else await refreshStatus();
});
window.addEventListener('online',()=>{ if(hasSession()) refreshStatus(); });
window.addEventListener('offline',()=>toast('Нет подключения к интернету'));
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&hasSession()) refreshStatus(); });