// Neo Glass views: presentation-only layer over the existing /api/status response.
import {buildDeterministicInsights} from './insights-core.mjs';
// No fake channel metrics, no backend writes, no new API quotas.
const $ = id => document.getElementById(id);
const fmt = n => n === null || n === undefined || !Number.isFinite(Number(n))
  ? 'Нет данных' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(Number(n));
const stamp = value => {
  const d = value ? new Date(value) : null;
  return d && Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('ru-RU',{
    day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Krasnoyarsk'
  }).format(d)+' КРСК' : 'Нет данных';
};
const node = (tag,cls,txt) => {
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(txt!==undefined)el.textContent=String(txt);
  return el;
};
let selectedChannelId=null;
let selectedDetailTab='overview';
let latestSnapshot=null;
export function selectNeoChannel(channelId){
  selectedChannelId=channelId;
  selectedDetailTab='overview';
  syncDetailTabs();
}
function syncDetailTabs(){
  document.querySelectorAll('[data-detail-tab]').forEach(button=>{
    const active=button.dataset.detailTab===selectedDetailTab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
  });
  document.querySelectorAll('[data-detail-panel]').forEach(panel=>{
    panel.hidden=panel.dataset.detailPanel!==selectedDetailTab;
  });
}
export function wireNeoGlass({api,refresh}={}){
  document.querySelectorAll('[data-detail-tab]').forEach(button=>{
    button.addEventListener('click',()=>{
      selectedDetailTab=button.dataset.detailTab;
      syncDetailTabs();
    });
  });

  const pushSettings=document.querySelectorAll('[data-push-category]');
  for(const input of pushSettings)input.addEventListener('change',async()=>{
    if(!api)return;
    const value={};
    for(const box of pushSettings)value[box.dataset.pushCategory]=box.checked;
    const message=$('notification-settings-message');
    input.disabled=true;
    try{
      await api('/api/notifications/preferences','POST',value);
      message.textContent='Настройки сохранены в Cloudflare.';
      if(refresh)await refresh();
    }catch(error){
      input.checked=!input.checked;
      message.textContent='Не сохранено: '+error.message;
    }finally{input.disabled=false;}
  });
  $('detail-oauth-connect').addEventListener('click',()=>{
    const action=$('oauth-connect');
    if(action&&!action.disabled)action.click();
    else $('detail-meta').textContent='OAuth-подключение не настроено в облаке. Настройте Google OAuth client с read-only scopes.';
  });
  $('notifications-mark-read').addEventListener('click',async()=>{
    if(!api||!latestSnapshot)return;
    const ids=(latestSnapshot.events||[]).map(x=>x.id).filter(Boolean).slice(0,100);
    if(!ids.length)return;
    const button=$('notifications-mark-read');
    button.disabled=true;
    try{
      await api('/api/notifications/read','POST',{eventIds:ids});
      if(refresh)await refresh();
    }catch(error){
      $('notification-settings-message').textContent='Ошибка сохранения: '+error.message;
    }finally{button.disabled=false;}
  });
}
function mostRecentDevice(data){
  return (data.devices||[]).slice().sort((a,b)=>
    (Date.parse(b.lastSeenAt||'')||0)-(Date.parse(a.lastSeenAt||'')||0))[0]||null;
}
const errors=new Set(['upload_failed','render_failed','agent_error']);
const production=new Set([
  'upload_queued','upload_started','upload_progress','upload_completed','upload_failed',
  'render_started','render_progress','render_completed','render_failed','agent_info','agent_error'
]);
function renderStudio(data){
  const device=mostRecentDevice(data);
  const telemetry=device?.status||{};
  const age=device?.lastSeenAt ? Date.now()-Date.parse(device.lastSeenAt) : Infinity;
  const isOnline=Number.isFinite(age)&&age>=0&&age<180000;
  $('studio-mac-state').textContent=isOnline?'Mac Bridge · Online':device?'Mac Bridge · Offline':'Mac Bridge · Нет подключения';
  $('studio-mac-last').textContent=device?'Последний сигнал: '+stamp(device.lastSeenAt):
    'Телеметрия появится после подключения Mac';
  if(device?.status?.agentLastError)
    $('studio-mac-last').textContent+=' · '+device.status.agentLastError;
  $('studio-live-indicator').classList.toggle('offline',!isOnline);
  $('studio-renders').textContent=fmt(telemetry.rendersActive);
  $('studio-uploads').textContent=fmt(telemetry.uploadsQueued);
  $('studio-ready').textContent=fmt(telemetry.jobsReadyUpload);
  $('studio-event-source').textContent=isOnline?'Живой канал событий':'Последние сохранённые события';
  const snapshot=data.production||{};
  const jobs=Array.isArray(snapshot.items)?snapshot.items:[];
  const channelNames=new Map((data.channels||[]).map(ch=>[ch.id,ch.name]));
  const jobTarget=$('studio-jobs');jobTarget.replaceChildren();
  $('studio-jobs-source').textContent=snapshot.lastSyncAt
    ?'Mac снимок: '+stamp(snapshot.lastSyncAt):'Снимок Mac ещё не получен';
  if(!jobs.length)jobTarget.append(node('p','empty','Нет активных заданий в последнем снимке Mac.'));
  for(const job of jobs.slice(0,40)){
    const row=node('div','neo-feed-item'),body=node('div','neo-feed-copy');
    body.append(node('strong','',job.title||'Видео без названия'),
      node('small','',(channelNames.get(job.channelId)||job.channelId)+' · '+job.status+
        (Number.isInteger(job.progress)?' · '+job.progress+'%':'')+
        ' · '+stamp(job.updatedAt)));
    row.append(node('span','neo-feed-mark',job.status==='ERROR'?'!':'•'),body);
    jobTarget.append(row);
  }
  const calendar=$('studio-calendar');calendar.replaceChildren();
  const planned=jobs.filter(x=>x.plannedPublishAt)
    .slice().sort((a,b)=>Date.parse(a.plannedPublishAt)-Date.parse(b.plannedPublishAt));
  if(!planned.length)calendar.append(node('p','empty',
    'Подтверждённые публикации недоступны. Записи появятся после синхронизации Mac.'));
  for(const item of planned.slice(0,60)){
    const row=node('div','neo-feed-item'),body=node('div','neo-feed-copy');
    body.append(node('strong','',channelNames.get(item.channelId)||item.channelId),
      node('small','','План VYRON: '+stamp(item.plannedPublishAt)+
        ' · YouTube не подтвердил · '+(item.title||'Видео')));
    row.append(node('span','neo-feed-mark','○'),body);calendar.append(row);
  }
  const target=$('studio-feed');
  target.replaceChildren();
  const rows=(data.events||[]).filter(e=>production.has(e.type)).slice(0,8);
  if(!rows.length){
    target.append(node('p','empty','Событий производства пока нет. Прогресс не моделируется.'));
    return;
  }
  for(const e of rows){
    const item=node('article','neo-feed-item'+(errors.has(e.type)?' neo-feed-error':''));
    const text=node('div','neo-feed-copy');
    text.append(node('strong','',e.name||e.title||e.type),node('small','',String(e.type||'event')+' · '+stamp(e.detectedAt)));
    item.append(node('span','neo-feed-mark',errors.has(e.type)?'!':'•'),text);
    target.append(item);
  }
}
function insightCard(title,body,metric,type='normal'){
  const item=node('article','neo-insight-item'+(type==='critical'?' neo-insight-critical':''));
  item.append(node('strong','',title),node('p','',body),node('small','',metric));
  return item;
}
function renderInsights(data){
  const channels=data.channels||[];
  const reports=channels.filter(x=>x.analytics?.source==='GOOGLE_ANALYTICS_API');
  const linked=Number(data.analyticsHealth?.linkedProfiles ?? data.analyticsSummary?.authorized);
  const missing=Number.isFinite(linked)?Math.max(0,channels.length-linked):null;
  const device=mostRecentDevice(data);
  const age=device?.lastSeenAt?Date.now()-Date.parse(device.lastSeenAt):Infinity;
  const online=Number.isFinite(age)&&age>=0&&age<180000;
  const target=$('insights-priorities');target.replaceChildren();
  let count=0;
  if(missing!==null&&missing>0){
    target.append(insightCard('Закрыть пробелы авторизации',
      'Без авторизации Google Analytics глубинная аналитика этих каналов недоступна.',
      'Нет OAuth: '+missing+' / '+channels.length,'critical'));count++;
  }
  if(reports.length<channels.length){
    target.append(insightCard('Проверить полноту Analytics',
      'Не для всех каналов есть подтверждённый отчёт. Нулевые показатели не подставляются.',
      'Готовые Google-отчёты: '+reports.length+' / '+channels.length));count++;
  }
  if(device&&!online){
    target.append(insightCard('Восстановить связь с Mac Bridge',
      'Облачные показатели могут обновляться отдельно, но локальный прогресс производства сейчас не подтверждён.',
      'Последний сигнал: '+stamp(device.lastSeenAt)));count++;
  }
  if(data.lastError){
    target.append(insightCard('Проверить последнюю ошибку облака',
      String(data.lastError).slice(0,210),
      'Источник: /api/status · lastError','critical'));count++;
  }
  const comparable=reports.filter(x=>Number(x.analytics?.periodDays)===28)
    .sort((a,b)=>(Number(b.analytics.views)||0)-(Number(a.analytics.views)||0));
  if(comparable.length>1){
    const best=comparable[0];
    target.append(insightCard('Лидер по просмотрам за 28 дней',
      'Проверь последние публикации и источники трафика лидера — это наблюдение, не прогноз.',
      best.name+': '+fmt(best.analytics.views)+' просмотров · YouTube Analytics'));count++;
  }
  for(const insight of buildDeterministicInsights(data).slice(0,8)){
    target.append(insightCard(insight.title,insight.body,insight.evidence,
      insight.severity==='critical'?'critical':'normal'));
    count++;
  }
  if(!count)target.append(node('p','empty',channels.length?
    'По доступным полям нет подтверждённых приоритетных отклонений.':'Сеть пока не загружена.'));
  $('insights-brief').textContent=channels.length
    ?'Сеть: '+channels.length+' каналов · '+reports.length+' с Google Analytics'
    :'Ожидаем подключённые каналы';
  $('insights-explainer').textContent='Рекомендации: '+count+
    '. Источник: текущий серверный снимок, без выдуманных прогнозов.';
}
function drawLine(svg,rows){
  svg.replaceChildren();
  const points=(rows||[]).filter(x=>Number.isFinite(Number(x.views))&&x.date)
    .slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-28);
  if(points.length<2)return false;
  const values=points.map(x=>Number(x.views));
  const hi=Math.max(1,...values),low=Math.min(0,...values);
  const x=i=>12+i*296/(values.length-1);
  const y=v=>108-((v-low)/(hi-low||1))*88;
  const d=values.map((v,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2)).join(' ');
  const ns='http://www.w3.org/2000/svg';
  const defs=document.createElementNS(ns,'defs');
  const gradient=document.createElementNS(ns,'linearGradient');gradient.setAttribute('id','neo-detail-fill');
  gradient.setAttribute('x1','0');gradient.setAttribute('x2','0');gradient.setAttribute('y1','0');gradient.setAttribute('y2','1');
  for(const [offset,opacity] of [['0%','.30'],['100%','0']]){
    const stop=document.createElementNS(ns,'stop');stop.setAttribute('offset',offset);
    stop.setAttribute('stop-color','#ab91ff');stop.setAttribute('stop-opacity',opacity);gradient.append(stop);
  }
  defs.append(gradient);svg.append(defs);
  const area=document.createElementNS(ns,'path');
  area.setAttribute('d',d+' L308,113 L12,113 Z');area.setAttribute('fill','url(#neo-detail-fill)');
  const line=document.createElementNS(ns,'path');
  line.setAttribute('d',d);line.setAttribute('stroke','#b29aff');line.setAttribute('fill','none');
  line.setAttribute('stroke-width','2.5');line.setAttribute('stroke-linecap','round');
  line.setAttribute('stroke-linejoin','round');svg.append(area,line);
  return true;
}
function renderChannel(data){
  if(!selectedChannelId)return;
  const ch=(data.channels||[]).find(x=>x.id===selectedChannelId);
  if(!ch){
    $('detail-title').textContent='Канал не найден';
    $('detail-meta').textContent='Канал отсутствует в текущем снимке. Вернись в каталог.';
    return;
  }
  const a=ch.analytics?.source==='GOOGLE_ANALYTICS_API'?ch.analytics:null;
  $('detail-title').textContent=ch.name;
  $('detail-oauth-connect').hidden=ch.analyticsAuthorized!==false;
  $('detail-meta').textContent=(ch.analyticsAuthorized===false?'Нет OAuth · ':'')+
    'Публичные данные: '+stamp(ch.updatedAt);
  $('detail-subs').textContent=ch.subscribersHidden?'Скрыты':fmt(ch.subscribers);
  $('detail-views').textContent=fmt(ch.views);
  $('detail-watch').textContent=a&&a.watchMinutes!=null?fmt(a.watchMinutes/60)+' ч':'Нет данных';
  $('detail-source').textContent=a?'YouTube Analytics API · '+stamp(a.updatedAt)+
    ' · период '+fmt(a.periodDays)+' дней':'Публичные метрики YouTube · расширенные отчёты недоступны';
  const hasSeries=drawLine($('detail-chart'),a?.daily||[]);
  $('detail-chart-caption').textContent=hasSeries
    ?'YouTube Analytics API · '+stamp(a.updatedAt)
    :'Нет подтверждённой ежедневной динамики просмотров';
  const videos=$('detail-top-videos');videos.replaceChildren();
  const best=a?.reports?.topVideos||[];
  if(!best.length)videos.append(node('p','empty','Нет подтверждённых данных по видео.'));
  for(const v of best.slice(0,8)){
    const row=node('div','neo-feed-item'),name=v.videoId||'Видео без ID';
    const aLink=node('a','neo-video-link',name);
    if(v.videoId){
      aLink.href='https://www.youtube.com/watch?v='+encodeURIComponent(v.videoId);
      aLink.target='_blank';aLink.rel='noopener noreferrer';
    }
    row.append(aLink,node('small','',fmt(v.views)+' просмотров'));videos.append(row);
  }
  const audience=$('detail-audience-metrics');audience.replaceChildren();
  const fields=[
    ['Средняя длительность',a?.averageViewDuration!=null?fmt(a.averageViewDuration)+' сек':'Нет данных'],
    ['Среднее удержание',a?.averageViewPercentage!=null?fmt(a.averageViewPercentage)+'%':'Нет данных'],
    ['Подписчики: прирост',fmt(a?.subscribersGained)],
    ['Подписчики: отток',fmt(a?.subscribersLost)],
    ['Источники трафика',Array.isArray(a?.reports?.trafficSources)?fmt(a.reports.trafficSources.length)+' категорий':'Нет данных'],
    ['CTR миниатюр','Нет данных: недоступно в текущем ответе API']
  ];
  for(const [name,value] of fields){
    const row=node('div','neo-audience-line');row.append(node('span','',name),node('strong','',value));
    audience.append(row);
  }
  const days=ch.scheduledContentDays;
  const localPlanned=(data.production?.items||[])
    .filter(row=>row.channelId===ch.id&&row.plannedPublishAt)
    .slice().sort((a,b)=>String(a.plannedPublishAt).localeCompare(String(b.plannedPublishAt)));
  $('detail-schedule-note').textContent=Number.isFinite(days)&&days>=0
    ?'Подтверждённый остаток по будущим публикациям: '+days+' дней.'
    :'Подтверждённого расписания YouTube нет. Локальных планов VYRON: '+
     localPlanned.length+'. Последний снимок Mac: '+stamp(data.production?.lastSyncAt)+
     '. Эти планы не используются для расчёта остатка дней.';
}
function renderNotifications(data){
  const events=(data.events||[]).slice(0,80);
  const state=data.notifications||{};
  const read=new Set(state.readIds||[]);
  const unread=events.filter(e=>e.id&&!read.has(e.id)&&
    Date.now()-Date.parse(e.detectedAt||0)<7*86400000);
  $('attention-count').hidden=unread.length===0;
  $('attention-count').textContent=unread.length>99?'99+':String(unread.length);
  $('notifications-open').setAttribute('aria-label',unread.length
    ?'Центр уведомлений, непрочитанных: '+unread.length:'Центр уведомлений');
  for(const box of document.querySelectorAll('[data-push-category]')){
    box.checked=state.categories?.[box.dataset.pushCategory]!==false;
  }
  const feed=$('neo-notifications');feed.replaceChildren();
  if(!events.length){
    feed.append(node('p','empty','Событий пока нет. Уведомления не создаются искусственно.'));
    return;
  }
  for(const e of events.slice(0,16)){
    const row=node('article','neo-notification'+(read.has(e.id)?' is-read':'')+
      (errors.has(e.type)?' is-critical':''));
    const body=node('div','neo-feed-copy');
    body.append(node('strong','',e.name||e.title||e.type||'Событие'),
      node('small','',stamp(e.detectedAt)+' · '+(e.type||'system')));
    const delivery=state.deliveries?.[e.id];
    const deliveryState=delivery?.sent?'Передано Push-шлюзу · '+delivery.sent:
      delivery?.failed?'Ошибка Push · '+delivery.failed:
      delivery?.sending?'Push отправляется':
      delivery?.retry?'Повторная отправка':'Push: нет попыток отправки';
    body.append(node('small','neo-delivery-state',deliveryState));
    row.append(node('span','neo-notification-indicator',read.has(e.id)?'○':'●'),body);
    feed.append(row);
  }
}
export function renderNeoGlass(data){
  latestSnapshot=data;
  renderStudio(data);
  renderInsights(data);
  renderChannel(data);
  renderNotifications(data);
}
