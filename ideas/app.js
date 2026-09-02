const API = 'https://zwukfrzgezpctzfdidng.supabase.co/functions/v1/ideas-api';
const VAPID_PUBLIC = 'BNK1wT5668BYOi2OhjbZVG24ndAgx8K7BoiFUavWwxnGK1CNOmsgYYGfdak_BjtUDV9SvjPjnZfEUWEETZwMJe0';

const $ = (id) => document.getElementById(id);
const state = {
  deviceId: localStorage.getItem('ideas.deviceId') || '',
  deviceSecret: localStorage.getItem('ideas.deviceSecret') || '',
  pairCode: localStorage.getItem('ideas.pairCode') || '',
};

function saveSession(data) {
  state.deviceId = data.deviceId;
  state.deviceSecret = data.deviceSecret;
  state.pairCode = data.pairCode;
  localStorage.setItem('ideas.deviceId', state.deviceId);
  localStorage.setItem('ideas.deviceSecret', state.deviceSecret);
  localStorage.setItem('ideas.pairCode', state.pairCode);
}

function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function hasSession() { return Boolean(state.deviceId && state.deviceSecret); }

async function api(action, extra = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, deviceId: state.deviceId, deviceSecret: state.deviceSecret, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(window.__ideasToast);
  window.__ideasToast = setTimeout(() => el.classList.remove('show'), 1700);
}

function showSetup(mode = 'choice') {
  $('setup').classList.remove('hidden');
  $('choice').classList.toggle('hidden', mode !== 'choice');
  $('created').classList.toggle('hidden', mode !== 'created');
  $('joining').classList.toggle('hidden', mode !== 'joining');
  $('notifyOnly').classList.toggle('hidden', mode !== 'notify');
  $('installHint').classList.toggle('hidden', !(isIOS() && !isStandalone()));
  if (mode === 'created') $('pairCode').textContent = state.pairCode || '------';
}

function hideSetup() { $('setup').classList.add('hidden'); }

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Уведомления не поддерживаются этим браузером');
  await navigator.serviceWorker.register('./sw.js', { scope: './' });
  return await navigator.serviceWorker.ready;
}

async function enablePush() {
  if (isIOS() && !isStandalone()) {
    showSetup(hasSession() ? 'notify' : 'choice');
    $('installHint').classList.remove('hidden');
    throw new Error('Сначала добавь Ideas на экран Домой');
  }
  if (!('Notification' in window)) throw new Error('Уведомления не поддерживаются');
  let permission = Notification.permission;
  if (permission !== 'granted') permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано');

  const reg = await ensureServiceWorker();
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  await api('subscribe', { subscription: subscription.toJSON() });
  return true;
}

async function refreshStatus() {
  if (!hasSession()) return;
  try {
    const s = await api('status');
    if (s.pairCode) {
      state.pairCode = s.pairCode;
      localStorage.setItem('ideas.pairCode', s.pairCode);
    }
    $('status').textContent = s.paired && s.partnerPushReady ? 'Синхронизировано' : s.paired ? 'Подключено' : 'Ожидание';
    if (Notification.permission !== 'granted') showSetup('notify');
    else if (!s.paired) showSetup('created');
    else hideSetup();
  } catch {
    $('status').textContent = 'Подборки';
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
  const pairCode = $('codeInput').value.replace(/\D/g, '').slice(0, 6);
  if (pairCode.length !== 6) return toast('Введи 6 цифр');
  $('confirmJoinBtn').disabled = true;
  try {
    const data = await api('join_pair', { pairCode });
    saveSession(data);
    showSetup('notify');
  } catch (e) { toast(e.message); }
  finally { $('confirmJoinBtn').disabled = false; }
}

async function activateUpdates() {
  try {
    await enablePush();
    toast('Готово');
    await refreshStatus();
  } catch (e) { toast(e.message); }
}

async function sendSignal() {
  if (!hasSession()) return showSetup('choice');
  const btn = $('mainBtn');
  btn.disabled = true;
  try {
    if (Notification.permission !== 'granted') await enablePush();
    await api('send_signal');
    toast('Обновлено');
  } catch (e) {
    if (/уведомлен|экран Домой|разрешен/i.test(e.message)) showSetup('notify');
    toast(e.message.includes('втор') ? 'Подборка пока недоступна' : e.message);
  } finally { setTimeout(() => { btn.disabled = false; }, 500); }
}

$('createBtn').addEventListener('click', createPair);
$('joinBtn').addEventListener('click', () => showSetup('joining'));
$('backBtn').addEventListener('click', () => showSetup('choice'));
$('confirmJoinBtn').addEventListener('click', joinPair);
$('enableBtn').addEventListener('click', activateUpdates);
$('notifyBtn').addEventListener('click', activateUpdates);
$('mainBtn').addEventListener('click', sendSignal);
$('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });

window.addEventListener('load', async () => {
  try { await ensureServiceWorker(); } catch {}
  if (!hasSession()) showSetup('choice');
  else await refreshStatus();
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshStatus(); });