const $ = id => document.getElementById(id);
const number = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('ru-RU').format(value);
const time = iso => iso ? new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Krasnoyarsk', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit'
}).format(new Date(iso)) + ' КРСК' : 'Нет данных';
let accessToken = sessionStorage.getItem('vyron-control-access') || '';
let schemaChecked = false;
let current = null;
let eventCursor = null;
let eventHistoryExtended = false;
let eventRows = [];
let macAgentToken = '';
const macAgentInstallCommand =
  'curl -fsSL https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/feature/vyron-control-cloud-mvp-20261113/apps/vyron-control/public/install-mac-agent.sh | bash';
const showLogin = error => {
  $('login').hidden = false;
  $('dashboard').hidden = true;
  $('logout').hidden = true;
  $('login-error').textContent = error || '';
};
const showDashboard = () => {
  $('login').hidden = true;
  $('dashboard').hidden = false;
  $('logout').hidden = false;
};
async function api(path, method = 'GET', body = undefined) {
  const response = await fetch(path, {
    method, cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Ошибка подключения');
    error.status = response.status;
    throw error;
  }
  return data;
}
function make(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value !== undefined) el.textContent = value;
  return el;
}
function displayAggregate(prefix, object) {
  $(prefix).textContent = object.covered ? number(object.value) : '—';
  $(prefix === 'total-subs' ? 'subs-covered' :
    prefix === 'total-views' ? 'views-covered' : 'videos-covered')
    .textContent = `${object.covered} из ${object.total} каналов`;
}
function renderChannels(channels) {
  const needle = $('search').value.trim().toLocaleLowerCase('ru-RU');
  const visible = channels.filter(ch =>
    ch.name.toLocaleLowerCase('ru-RU').includes(needle) || ch.id.toLowerCase().includes(needle));
  if($('channel-sort').value==='growth')visible.sort((a,b)=>
    ((b.subscribers??0)-(b.previousSubscribers??b.subscribers??0))-
    ((a.subscribers??0)-(a.previousSubscribers??a.subscribers??0))||
    a.name.localeCompare(b.name,'ru'));
  else visible.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  const list = $('channels');
  list.replaceChildren();
  if (!visible.length) {
    list.append(make('div', 'empty', channels.length ? 'Каналы не найдены.' :
      'Каналы ещё не подключены. Добавь их ID в конфигурацию сервиса.'));
    return;
  }
  for (const ch of visible) {
    const row = make('div', 'channel-row');
    const left = make('div', 'channel-name');
    const link = make('a', '', ch.name);
    link.href = 'https://www.youtube.com/channel/' + encodeURIComponent(ch.id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    left.append(link, make('small', '', ch.updatedAt ? 'Обновлено ' + time(ch.updatedAt) : 'Ожидает первой синхронизации'));
    const details = make('div', 'channel-details');
    const vals = [
      [ch.subscribersHidden ? 'Скрыто' : number(ch.subscribers), 'Подписчики'],
      [number(ch.views), 'Просмотры'],
      [number(ch.videos), 'Видео']
    ];
    for (const [value, label] of vals) {
      const el = make('div', 'channel-number');
      el.append(make('strong', '', value), make('small', '', label));
      details.append(el);
    }
    if (ch.previousSubscribers !== null && ch.subscribers !== null) {
      const difference = ch.subscribers - ch.previousSubscribers;
      const delta = make('small', 'delta' + (difference < 0 ? ' negative' : ''),
        (difference > 0 ? '+' : '') + number(difference));
      details.children[0].append(delta);
    }
    row.append(left, details);
    if (ch.analytics) {
      const a = ch.analytics;
      const extras = make('div', 'channel-analytics');
      const fields = [
        ['Период', number(a.periodDays) + ' дн.'],
        ['Просмотры', number(a.views)],
        ['Время просмотра', a.watchMinutes == null ? '—' : number(Math.round(a.watchMinutes)) + ' мин'],
        ['Удержание', a.averageViewPercentage == null ? '—' : a.averageViewPercentage.toFixed(1) + '%'],
        ['CTR', a.impressionCtr == null ? 'Нет данных API' : a.impressionCtr.toFixed(1) + '%']
      ];
      for (const [label, value] of fields) {
        const item = make('span', '', label + ': ' + value);
        extras.append(item);
      }
      extras.append(make('span', 'mac-stale-label',
        'Analytics 360° · кеш Mac от ' + time(a.updatedAt)));
      row.append(extras);
    }
    list.append(row);
  }
}
function renderEvents(events) {
  const list = $('events');
  list.replaceChildren();
  if (!events.length) {
    list.append(make('div', 'empty', 'Новые рубежи появятся после следующих обновлений. Первый снимок задаёт исходную точку.'));
    return;
  }
  for (const event of events) {
    const row = make('div', 'event');
    const text = make('div', 'event-text');
    text.append(make('strong', '', '🎉 ' + event.name),
      make('span', '', event.type === 'subscriber_milestone' ? number(event.milestone) + ' подписчиков' : event.type.replaceAll('_',' ')),
      make('span', '', time(event.detectedAt)));
    row.append(text);
    list.append(row);
  }
}
function render(data) {
  current = data;
  displayAggregate('total-subs', data.totalSubscribers);
  displayAggregate('total-views', data.totalViews);
  displayAggregate('total-videos', data.totalVideos);
  $('quota').textContent = number(data.quota.spent) + ' / ' + number(data.quota.budget);
  $('quota-day').textContent = 'Дата квоты Google (PT): ' + data.quota.day;
  $('quota-progress').style.width = Math.min(100, data.quota.spent / data.quota.budget * 100) + '%';
  $('channel-count').textContent = '(' + data.channels.length + ')';
  $('last-sync').textContent = 'Последний успешный запрос: ' + time(data.lastSuccessAt);
  $('state-label').textContent = data.lastError ? 'Ошибка: ' + data.lastError :
    data.syncing ? 'Идёт синхронизация…' :
    data.configured ? 'Сервис готов к обновлению' : 'Требуется настройка YouTube API';
  $('refresh').disabled = !data.configured || data.syncing;
  renderChannels(data.channels);
  if (!eventHistoryExtended) renderEvents(data.events);
  renderDevices(data);
}
async function load() {
  if (!accessToken) return showLogin('');
  try {
    if (!schemaChecked) {
      const healthResponse = await fetch('/api/health', {cache:'no-store'});
      const health = await healthResponse.json().catch(() => null);
      if (health?.d1?.bound && health?.d1?.schema === false) {
        const bootstrapped = await api('/api/admin/bootstrap', 'POST', {});
        if (!bootstrapped.ok) throw new Error('Не удалось подготовить схему D1.');
        const verifyResponse = await fetch('/api/health', {cache:'no-store'});
        const verified = await verifyResponse.json().catch(() => null);
        if (!verifyResponse.ok || !verified?.ok) throw new Error('Схема D1 всё ещё неполная.');
      } else if (!health?.ok) {
        throw new Error(health?.error || 'Не удалось проверить базу D1.');
      }
      schemaChecked = true;
    }
    const data = await api('/api/status');
    showDashboard();
    render(data);
    if (!eventHistoryExtended) await fetchEventHistory(true);
    await loadOauthProfiles();
    await updatePushState();
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem('vyron-control-access');
      accessToken = '';
      showLogin('Неверный ключ доступа.');
    } else {
      $('state-label').textContent = error.message;
    }
  }
}
async function fetchEventHistory(reset=false) {
  const params=new URLSearchParams({
    category:$('event-filter').value,limit:'50'
  });
  if(!reset && eventCursor) {
    params.set('beforeAt',eventCursor.beforeAt);
    params.set('beforeId',eventCursor.beforeId);
  }
  try {
    const result=await api('/api/events?'+params);
    eventCursor=result.nextCursor||null;
    eventRows=reset?result.events:[...eventRows,...result.events];
    renderEvents(eventRows);
    $('events-more').hidden=!eventCursor;
  }catch(error) {
    if(reset && current){
      eventRows=current.events||[];
      renderEvents(eventRows);
      $('events-more').hidden=true;
    }
  }
}
$('event-filter').addEventListener('change',()=>{
  eventHistoryExtended=false;
  eventCursor=null;eventRows=[];
  fetchEventHistory(true);
});
$('events-more').addEventListener('click',()=>{
  eventHistoryExtended=true;
  const button=$('events-more');
  button.disabled=true;
  fetchEventHistory(false).finally(()=>{button.disabled=false;});
});
function renderDevices(data) {
  const devices = data.devices || [];
  const device = devices[0];
  $('mac-agent-prepare').textContent = device ? 'Переустановить Mac Bridge' : 'Подключить Mac';
  const button = $('mac-status-request');
  const commandList=$('mac-command-list');
  commandList.replaceChildren();
  button.disabled = !device;
  if (!device) {
    $('mac-indicator').textContent = 'Нет подключения';
    $('mac-state').textContent = 'Не подключён';
    $('mac-last').textContent = 'Ожидаем Mac Bridge';
    $('mac-renders').textContent = '—';
    $('mac-uploads').textContent = '—';
    $('mac-uploaded').textContent = '—';
    for(const id of ['mac-uploaded-today','mac-rendered-today','mac-upload-failures','mac-channels-bound'])$(id).textContent='—';
    return;
  }
  const recent = device.lastSeenAt &&
    Date.now() - Date.parse(device.lastSeenAt) < 180000;
  $('mac-indicator').textContent = recent ? '● Mac онлайн' : '○ Mac спит / нет связи';
  $('mac-state').textContent = recent ? 'На связи' : 'Последнее состояние';
  $('mac-last').textContent = 'Последний сигнал: ' + time(device.lastSeenAt);
  const s = device.status || {};
  $('mac-renders').textContent = number(s.rendersActive);
  $('mac-uploads').textContent = number(s.uploadsQueued);
  $('mac-uploaded').textContent = number(s.uploadsCompleted);
  $('mac-uploaded-today').textContent = number(s.uploadsToday);
  $('mac-rendered-today').textContent = number(s.rendersCompletedToday);
  $('mac-upload-failures').textContent = number(s.uploadFailuresToday);
  $('mac-channels-bound').textContent = s.channelsTotal == null ? '—' : number(s.channelsBound) + ' / ' + number(s.channelsTotal);
  button.dataset.deviceId = device.id;
  const recentCommands = data.commands || [];
  const queued = recentCommands.filter(c => c.target_device===device.id && c.state==='queued');
  if (queued.length) $('mac-command-feedback').textContent =
    queued.length + ' команд в ожидании подтверждения Mac.';
  for(const command of recentCommands.filter(c=>c.target_device===device.id).slice(0,5)) {
    const row=make('div','command-row');
    row.append(make('span','',command.kind==='request_status'?'Запрос состояния':command.kind),
      make('small','',command.state+' · '+time(command.updated_at)));
    if(command.state==='queued') {
      const cancel=make('button','ghost','Отменить');
      cancel.addEventListener('click',async()=>{
        cancel.disabled=true;
        try {
          const result=await api('/api/commands/'+encodeURIComponent(command.id)+'/cancel','POST',{});
          $('mac-command-feedback').textContent=result.cancelled
            ?'Ожидающая команда отменена.':'Команда уже была принята Mac и не отменена.';
          await load();
        }catch(error){
          $('mac-command-feedback').textContent='Ошибка отмены: '+error.message;
          cancel.disabled=false;
        }
      });
      row.append(cancel);
    }
    commandList.append(row);
  }
}
$('mac-status-request').addEventListener('click', async () => {
  const button = $('mac-status-request');
  const targetDevice = button.dataset.deviceId;
  if (!targetDevice) return;
  button.disabled = true;
  try {
    const result = await api('/api/commands','POST',{
      id:crypto.randomUUID().replaceAll('-',''),kind:'request_status',targetDevice
    });
    $('mac-command-feedback').textContent = result.queued
      ? 'Команда добавлена в очередь — ожидаем ответ Mac.'
      : 'Команда уже существует; проверьте журнал.';
    await load();
  } catch(error) {
    $('mac-command-feedback').textContent = 'Не удалось отправить: '+error.message;
  } finally {button.disabled = false;}
});
$('mac-agent-prepare').addEventListener('click', async () => {
  const button=$('mac-agent-prepare'),message=$('mac-agent-message');
  button.disabled=true;
  message.textContent='Создаём отдельный ключ только для телеметрии Mac…';
  try {
    const result=await api('/api/mac/agent-token','POST',{});
    if(typeof result.agentToken!=='string'||result.agentToken.length<32)
      throw new Error('Сервер не вернул корректный ключ агента.');
    macAgentToken=result.agentToken;
    $('mac-agent-command').textContent=macAgentInstallCommand;
    $('mac-agent-command').hidden=false;
    $('mac-agent-copy-command').hidden=false;
    $('mac-agent-copy-token').hidden=false;
    message.textContent='Сначала скопируй команду установки и запусти её в Терминале на Mac. Когда скрипт попросит ключ, вернись сюда, скопируй ключ агента и вставь его в Терминал. Ввод ключа будет скрыт.';
  }catch(error) {
    message.textContent='Не удалось подготовить Mac Bridge: '+error.message;
  }finally {button.disabled=false;}
});
$('mac-agent-copy-command').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(macAgentInstallCommand);
    $('mac-agent-message').textContent='Команда скопирована. Вставь её в Терминал на Mac и нажми Enter.';
  }catch(error) {
    $('mac-agent-message').textContent='Не удалось скопировать команду. Выдели её в поле ниже и скопируй вручную.';
  }
});
$('mac-agent-copy-token').addEventListener('click', async () => {
  if(!macAgentToken)return;
  try {
    await navigator.clipboard.writeText(macAgentToken);
    $('mac-agent-message').textContent='Ключ агента скопирован. Вставь его в скрытый запрос Терминала. Не отправляй ключ в чат.';
  }catch(error) {
    $('mac-agent-message').textContent='Не удалось скопировать ключ. Повтори на HTTPS-странице в актуальном Chrome.';
  }
});

async function loadOauthProfiles() {
  const counter=$('oauth-count'),button=$('oauth-connect'),message=$('oauth-message');
  const container=$('oauth-profiles');
  try {
    const result=await api('/api/oauth/profiles');
    button.disabled=!result.configured;
    counter.textContent=String(result.profiles?.length||0)+' подключено';
    message.textContent=result.configured
      ? 'Подключение защищено Google OAuth. На Mac ничего менять не требуется.'
      : 'Google OAuth ещё не настроен в Cloudflare.';
    container.replaceChildren();
    for(const profile of result.profiles||[]) {
      const line=make('div','oauth-profile');
      const name=make('span','',profile.channel_name+' · '+profile.channel_id);
      const status=make('small','',
        profile.last_error?'Ошибка обновления: '+profile.last_error:
        profile.last_success_at?'Обновлено '+time(profile.last_success_at):
        'Ожидает первой синхронизации');
      const disconnect=make('button','ghost','Отключить');
      disconnect.addEventListener('click',async()=>{
        if(!window.confirm('Отключить облачный доступ к аналитике '+profile.channel_name+'?'))return;
        disconnect.disabled=true;
        try {
          await api('/api/oauth/disconnect','POST',{channelId:profile.channel_id});
          await loadOauthProfiles();
        }catch(e){message.textContent='Ошибка: '+e.message;disconnect.disabled=false;}
      });
      line.append(name,status,disconnect);
      container.append(line);
    }
  }catch(error){
    counter.textContent='OAuth недоступен';
    button.disabled=true;
    message.textContent='OAuth-сервер ещё не развернут или недоступен.';
  }
}
$('oauth-connect').addEventListener('click',async()=>{
  const button=$('oauth-connect');
  button.disabled=true;
  try{
    const result=await api('/api/oauth/start','POST',{});
    if(!/^https:\/\/accounts\.google\.com\//.test(result.authorizationUrl))
      throw new Error('Неверная ссылка авторизации');
    window.location.assign(result.authorizationUrl);
  }catch(e){
    $('oauth-message').textContent='Ошибка подключения: '+e.message;
    button.disabled=false;
  }
});
const oauthOutcome=new URLSearchParams(window.location.search).get('oauth');
if(oauthOutcome==='connected'||oauthOutcome==='denied'||oauthOutcome==='failed'){
  $('oauth-message').textContent=oauthOutcome==='connected'
    ?'Google-канал подключён. Обновления начнутся в ближайший запланированный интервал.'
    :oauthOutcome==='denied'?'Доступ Google не предоставлен.':'Не удалось подключить Google. Проверь настройку OAuth.';
  window.history.replaceState({},'',window.location.pathname);
}
function vapidKeyToBytes(value) {
  const normalized=value.replaceAll('-','+').replaceAll('_','/');
  const raw=atob(normalized+'='.repeat((4-normalized.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function updatePushState() {
  const state=$('push-state'),msg=$('push-message');
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||
      !('Notification' in window)||!window.isSecureContext){
    state.textContent='Не поддерживается';
    $('push-enable').disabled=true;
    msg.textContent='Нужен HTTPS и поддерживаемый браузер. На iPhone добавь сайт на экран Домой.';
    return;
  }
  try {
    const setup=await api('/api/push/public-key');
    if(!setup.supported||!setup.publicKey) {
      state.textContent='Не настроено';
      $('push-enable').disabled=true;
      msg.textContent='Администратор ещё не настроил VAPID-ключи в Cloudflare.';
      return;
    }
    const registration=await navigator.serviceWorker.register('/service-worker.js');
    const sub=await registration.pushManager.getSubscription();
    const granted=Notification.permission==='granted';
    const enabled=Boolean(sub)&&granted;
    state.textContent=enabled?'● Активны':'Не подключены';
    $('push-enable').disabled=enabled;
    $('push-disable').hidden=!enabled;
  }catch(error){
    state.textContent='Недоступно';
    msg.textContent='Push сейчас недоступен: '+error.message;
  }
}
$('push-enable').addEventListener('click',async()=>{
  const button=$('push-enable'),msg=$('push-message');
  button.disabled=true;
  try {
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||
       !('Notification' in window)||!window.isSecureContext)
      throw new Error('Установи веб-приложение на главный экран iPhone и открой его по HTTPS.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('Разрешение на уведомления не предоставлено.');
    const config=await api('/api/push/public-key');
    if(!config.publicKey)throw new Error('VAPID-ключ ещё не настроен.');
    const reg=await navigator.serviceWorker.register('/service-worker.js');
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,applicationServerKey:vapidKeyToBytes(config.publicKey)
    });
    await api('/api/push/subscribe','POST',sub.toJSON());
    msg.textContent='Уведомления подключены. Новые события будут приходить на iPhone.';
    await updatePushState();
  }catch(error){
    msg.textContent='Не удалось включить: '+error.message;
    button.disabled=false;
  }
});
$('push-disable').addEventListener('click',async()=>{
  const msg=$('push-message'),button=$('push-disable');
  button.disabled=true;
  try {
    const reg=await navigator.serviceWorker.getRegistration();
    const subscription=await reg?.pushManager?.getSubscription();
    if(subscription){
      await api('/api/push/unsubscribe','POST',{endpoint:subscription.endpoint});
      await subscription.unsubscribe();
    }
    msg.textContent='Push-уведомления отключены.';
    await updatePushState();
  }catch(error){
    msg.textContent='Ошибка отключения: '+error.message;
  }finally{button.disabled=false;}
});
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  accessToken = $('access-token').value.trim();
  sessionStorage.setItem('vyron-control-access', accessToken);
  await load();
});
$('logout').addEventListener('click', () => {
  sessionStorage.removeItem('vyron-control-access');
  accessToken = '';
  current = null;
  $('access-token').value = '';
  showLogin('');
});
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  $('state-label').textContent = 'Запрашиваем свежие счётчики YouTube…';
  try {
    const result = await api('/api/refresh', 'POST');
    render(result.status);
  } catch (error) {
    $('state-label').textContent = 'Ошибка: ' + error.message;
    await load();
  } finally {
    $('refresh').disabled = false;
  }
});
$('search').addEventListener('input', () => {
  if (current) renderChannels(current.channels);
});
$('channel-sort').addEventListener('change', () => {
  if (current) renderChannels(current.channels);
});
// Local UI polling is free: it does NOT make a YouTube API request.
setInterval(() => { if (accessToken && !document.hidden) load(); }, 15_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && accessToken) load();
});
load();
