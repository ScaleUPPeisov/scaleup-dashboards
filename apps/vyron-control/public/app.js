import {decryptVyronMigration} from './migration-crypto.js';
import {compactProgressEvents} from './event-utils.mjs';

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
let manualRefreshing = false;
let activeMobileView = 'overview';
const macAgentInstallCommand =
  'curl -fsSL https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/feature/vyron-control-mobile-analytics-20261114/apps/vyron-control/public/install-mac-agent.sh | bash';

let serviceWorkerRegistrationPromise=null;
async function ensureServiceWorker() {
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return null;
  if(!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise=navigator.serviceWorker.register('/service-worker.js')
      .catch(error=>{
        serviceWorkerRegistrationPromise=null;
        throw error;
      });
  }
  return serviceWorkerRegistrationPromise;
}
let serviceWorkerReloading=false;
if('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(serviceWorkerReloading)return;
    serviceWorkerReloading=true;
    window.location.reload();
  });
  void ensureServiceWorker().catch(()=>{});
}
const showLogin = error => {
  activeMobileView='overview';
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
  const filterMode=$('channel-filter').value;
  const visible = channels.filter(ch=>{
    const matchesSearch=ch.name.toLocaleLowerCase('ru-RU').includes(needle)||
      ch.id.toLowerCase().includes(needle);
    if(!matchesSearch)return false;
    if(filterMode==='analytics')return ch.analytics?.source==='GOOGLE_ANALYTICS_API';
    if(filterMode==='needs-auth')return ch.analyticsAuthorized===false;
    if(filterMode==='awaiting-report')
      return ch.analyticsAuthorized===true&&ch.analytics?.source!=='GOOGLE_ANALYTICS_API';
    if(filterMode==='public-pending')return !ch.updatedAt;
    return true;
  });
  $('channel-count').textContent=visible.length===channels.length
    ?'('+channels.length+')':'('+visible.length+' / '+channels.length+')';
  const sortMode=$('channel-sort').value;
  if(sortMode==='growth')visible.sort((a,b)=>
    ((b.subscribers??0)-(b.previousSubscribers??b.subscribers??0))-
    ((a.subscribers??0)-(a.previousSubscribers??a.subscribers??0))||
    a.name.localeCompare(b.name,'ru'));
  else if(sortMode==='views')visible.sort((a,b)=>
    (b.analytics?.views??b.views??0)-(a.analytics?.views??a.views??0));
  else if(sortMode==='watchtime')visible.sort((a,b)=>
    (b.analytics?.watchMinutes??0)-(a.analytics?.watchMinutes??0));
  else if(sortMode==='retention')visible.sort((a,b)=>
    (b.analytics?.averageViewPercentage??0)-(a.analytics?.averageViewPercentage??0));
  else visible.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  const list = $('channels');
  list.replaceChildren();
  if (!visible.length) {
    const messages={
      analytics:'Нет каналов с готовыми отчётами Google Analytics.',
      'needs-auth':'Все каналы авторизованы или ещё не загружены.',
      'awaiting-report':'Нет каналов, ожидающих первого Analytics-отчёта.',
      'public-pending':'У всех каналов уже есть публичные данные.'
    };
    list.append(make('div','empty',channels.length
      ?(messages[filterMode]||'Каналы не найдены.')
      :'Каналы ещё не подключены. Добавь их в VYRON.'));
    return;
  }
  for (const ch of visible) {
    const row = make('div', 'channel-row');
    const left = make('div', 'channel-name');
    const link = make('a', '', ch.name);
    link.href = 'https://www.youtube.com/channel/' + encodeURIComponent(ch.id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    left.append(link,make('small','',ch.updatedAt?'Обновлено '+time(ch.updatedAt):'Ожидает первой синхронизации'));
    if(ch.analyticsAuthorized===false)
      left.append(make('small','caution','Google Analytics: требуется авторизация'));
    else if(ch.analyticsAuthorized===true&&!ch.analytics)
      left.append(make('small','caution','Google Analytics: ожидает первой синхронизации'));
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
      const daily=a.daily||[];
      const sum=key=>daily.reduce((total,item)=>total+(item[key]??0),0);
      const fields = [
        ['Период', number(a.periodDays) + ' дн.'],
        ['Просмотры Analytics', number(a.views)],
        ['Время просмотра', a.watchMinutes == null ? '—' : number(Math.round(a.watchMinutes)) + ' мин'],
        ['Удержание', a.averageViewPercentage == null ? '—' : a.averageViewPercentage.toFixed(1) + '%'],
        ['Средняя длительность',a.avgViewSeconds==null?'—':formatDuration(a.avgViewSeconds)],
        ['Чистый прирост',number((a.subscribersGained??0)-(a.subscribersLost??0))],
        ['Лайки',number(sum('likes'))],['Комментарии',number(sum('comments'))],
        ['Репосты',number(sum('shares'))],
        ['CTR миниатюр','Нужен отдельный Reporting API']
      ];
      for (const [label, value] of fields)extras.append(make('span', '', label + ': ' + value));
      extras.append(make('span', 'mac-stale-label',
        (a.source==='GOOGLE_ANALYTICS_API'?'Google Analytics API':'Кеш VYRON / Mac')+' · '+time(a.updatedAt)));
      const compact=window.matchMedia('(max-width:760px)').matches;
      extras.hidden=compact;
      const expand=make('button','channel-expand',compact?'Подробнее':'Свернуть');
      expand.hidden=!compact;
      expand.addEventListener('click',()=>{
        extras.hidden=!extras.hidden;
        expand.textContent=extras.hidden?'Подробнее':'Свернуть';
      });
      row.append(expand,extras);
    }
    list.append(row);
  }
}
function formatBytes(value) {
  const bytes=Number(value);
  if(!Number.isFinite(bytes)||bytes<0)return '—';
  const units=['Б','КБ','МБ','ГБ','ТБ'];
  let amount=bytes,index=0;
  while(amount>=1024&&index<units.length-1){amount/=1024;index++;}
  return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(amount)+' '+units[index];
}
function formatUptime(seconds) {
  if(!Number.isSafeInteger(seconds)||seconds<0)return '—';
  const days=Math.floor(seconds/86400);
  const hours=Math.floor((seconds%86400)/3600);
  const minutes=Math.floor((seconds%3600)/60);
  return [days?days+' д':null,hours+' ч',minutes+' мин'].filter(Boolean).join(' ');
}
function formatDuration(seconds) {
  if(seconds==null||!Number.isFinite(Number(seconds)))return '—';
  const value=Math.max(0,Math.round(Number(seconds)));
  const hours=Math.floor(value/3600),minutes=Math.floor((value%3600)/60),secs=value%60;
  return hours?hours+' ч '+minutes+' мин':minutes?minutes+' мин '+secs+' с':secs+' с';
}
function svgNode(tag,attrs={}) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  return node;
}
function renderAnalyticsTrend(rows,period,metric='views') {
  const svg=$('analytics-trend'),caption=$('analytics-trend-caption');
  const title=$('analytics-trend-title');
  svg.replaceChildren();
  const specs={
    views:{label:'Просмотры',unit:'просмотров',value:row=>row.views||0},
    engagedViews:{label:'Вовлечённые просмотры',unit:'просмотров',value:row=>row.engagedViews||0},
    watchMinutes:{label:'Время просмотра',unit:'минут',value:row=>row.watchMinutes||0},
    netSubscribers:{label:'Чистый прирост подписчиков',unit:'подписчиков',
      value:row=>(row.subscribersGained||0)-(row.subscribersLost||0)},
    averageViewPercentage:{label:'Среднее удержание',unit:'%',value:row=>
      row.averageViewPercentage==null?null:Number(row.averageViewPercentage)}
  };
  const spec=specs[metric]||specs.views;
  title.textContent='Динамика: '+spec.label.toLowerCase();
  if(!rows.length) {
    caption.textContent='Нет дневных данных Google Analytics. Проверь подключение OAuth и выполни «Обновить всё».';
    return;
  }
  const pointsRows=rows.map(row=>({date:row.date,value:spec.value(row)}))
    .filter(row=>row.value!==null&&Number.isFinite(row.value));
  if(!pointsRows.length) {
    caption.textContent='Google не вернул '+spec.label.toLowerCase()+' за выбранный период.';
    return;
  }
  const values=pointsRows.map(row=>row.value);
  const min=Math.min(0,...values),max=Math.max(0,...values),span=Math.max(1,max-min);
  const width=720,height=190,left=34,right=14,top=16,bottom=24;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const yFor=value=>top+(max-value)/span*plotHeight;
  for(let i=0;i<4;i++){
    const y=top+i*plotHeight/3;
    svg.append(svgNode('path',{d:'M '+left+' '+y+' H '+(width-right),class:'trend-grid'}));
  }
  const coords=values.map((value,index)=>[
    left+(values.length===1?plotWidth/2:index*plotWidth/(values.length-1)),
    yFor(value)
  ]);
  const line=coords.map((point,index)=>(index?'L ':'M ')+point[0]+' '+point[1]).join(' ');
  const baseline=yFor(0);
  const area=line+' L '+coords[coords.length-1][0]+' '+baseline+
    ' L '+coords[0][0]+' '+baseline+' Z';
  svg.append(svgNode('path',{d:area,class:'trend-area'}));
  svg.append(svgNode('path',{d:line,class:'trend-line'}));
  const first=pointsRows[0].date,last=pointsRows[pointsRows.length-1].date;
  const total=values.reduce((sum,value)=>sum+value,0);
  const summary=metric==='averageViewPercentage'
    ?'среднее '+(total/values.length).toFixed(1)+'%'
    :metric==='watchMinutes'
      ?'всего '+number(Math.round(total/60*10)/10)+' ч'
      :metric==='netSubscribers'
        ?'итого '+(total>0?'+':'')+number(total)+' подписчиков'
        :'всего '+number(total)+' '+spec.unit;
  caption.textContent=pointsRows.length+' дней · '+first+' — '+last+' · '+summary;
  $('analytics-trend-range').textContent=period+' дней';
}
function renderAudienceRetention(video,channelName,rows) {
  const svg=$('analytics-retention-curve'),caption=$('analytics-retention-caption');
  svg.replaceChildren();
  if(!rows?.length) {
    caption.textContent='YouTube не вернул кривую удержания для лучшего видео за этот период.';
    return;
  }
  const points=rows.slice().sort((a,b)=>a.elapsedVideoTimeRatio-b.elapsedVideoTimeRatio);
  const width=720,height=190,left=34,right=14,top=16,bottom=24;
  const max=Math.max(1,...points.map(row=>Number(row.audienceWatchRatio)||0));
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  for(let i=0;i<4;i++){
    const y=top+i*plotHeight/3;
    svg.append(svgNode('path',{d:'M '+left+' '+y+' H '+(width-right),class:'trend-grid'}));
  }
  const coords=points.map(row=>[
    left+Math.max(0,Math.min(1,Number(row.elapsedVideoTimeRatio)||0))*plotWidth,
    top+plotHeight-(Math.max(0,Number(row.audienceWatchRatio)||0)/max)*plotHeight
  ]);
  const line=coords.map((point,index)=>(index?'L ':'M ')+point[0]+' '+point[1]).join(' ');
  svg.append(svgNode('path',{d:line,class:'trend-line'}));
  caption.textContent=channelName+' · '+video+' · '+points.length+
    ' сегментов · доля просмотров сегмента относительно просмотров ролика';
}
function renderRanking(targetId,items,{format=value=>number(value),empty='Нет данных за выбранный период'}={}) {
  const container=$(targetId);
  container.replaceChildren();
  if(!items.length){container.append(make('div','analytics-empty',empty));return;}
  const max=Math.max(1,...items.map(item=>Number(item.value)||0));
  for(const item of items){
    const row=make('div','analytics-rank-row');
    const label=make('div','analytics-rank-label');
    if(item.href){
      const link=make('a','',item.label);
      link.href=item.href;link.target='_blank';link.rel='noopener noreferrer';
      label.append(link);
    }else label.textContent=item.label;
    row.append(label,make('strong','analytics-rank-value',format(item.value)));
    const track=make('div','analytics-rank-track'),fill=make('span');
    fill.style.width=Math.max(0,Math.min(100,(Number(item.value)||0)/max*100))+'%';
    track.append(fill);row.append(track);
    const subText=typeof item.sub==='number'?number(item.sub)+' мин просмотра':item.sub;
    if(subText)row.append(make('small','analytics-rank-sub',subText));
    container.append(row);
  }
}
function renderAnalytics(data) {
  const connected=(data.channels||[]).filter(ch=>ch.analytics?.source==='GOOGLE_ANALYTICS_API');
  const period=Number($('analytics-period').value||28);
  const dailyMap=new Map();
  for(const channel of connected)for(const row of channel.analytics.daily||[]){
    const item=dailyMap.get(row.date)||{
      date:row.date,views:0,engagedViews:0,dislikes:0,watchMinutes:0,
      subscribersGained:0,subscribersLost:0,likes:0,comments:0,shares:0,
      redViews:0,redWatchMinutes:0,playlistAdds:0,playlistRemoves:0,
      uniqueViewers:0,uniqueDays:0,weightedDuration:0,weightedRetention:0,weight:0
    };
    const views=row.views||0;
    item.views+=views;item.engagedViews+=row.engagedViews||0;
    item.dislikes+=row.dislikes||0;item.watchMinutes+=row.watchMinutes||0;
    item.subscribersGained+=row.subscribersGained||0;
    item.subscribersLost+=row.subscribersLost||0;
    item.likes+=row.likes||0;item.comments+=row.comments||0;item.shares+=row.shares||0;
    item.redViews+=row.redViews||0;item.redWatchMinutes+=row.redWatchMinutes||0;
    item.playlistAdds+=row.playlistAdds||0;item.playlistRemoves+=row.playlistRemoves||0;
    if(row.uniqueViewers!=null){item.uniqueViewers+=row.uniqueViewers;item.uniqueDays++;}
    item.weightedDuration+=(row.averageViewDuration||0)*views;
    item.weightedRetention+=(row.averageViewPercentage||0)*views;
    item.weight+=views;dailyMap.set(row.date,item);
  }
  const allDaily=[...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(row=>({
    ...row,averageViewDuration:row.weight?row.weightedDuration/row.weight:null,
    averageViewPercentage:row.weight?row.weightedRetention/row.weight:null
  }));
  const daily=allDaily.slice(-period);
  const sum=key=>daily.reduce((total,row)=>total+(row[key]||0),0);
  const views=sum('views'),watchMinutes=sum('watchMinutes');
  const gained=sum('subscribersGained'),lost=sum('subscribersLost');
  const weighted=daily.reduce((total,row)=>total+(row.views||0),0);
  const avgDuration=weighted?daily.reduce((total,row)=>total+
    (row.averageViewDuration||0)*(row.views||0),0)/weighted:null;
  const retention=weighted?daily.reduce((total,row)=>total+
    (row.averageViewPercentage||0)*(row.views||0),0)/weighted:null;
  $('analytics-views').textContent=number(views);
  $('analytics-engaged-views').textContent=number(sum('engagedViews'));
  const uniqueDays=daily.filter(row=>row.uniqueDays>0);
  $('analytics-unique-viewers').textContent=uniqueDays.length
    ?number(Math.round(uniqueDays.reduce((total,row)=>total+row.uniqueViewers,0)/
      uniqueDays.length)):'—';
  $('analytics-watch-hours').textContent=number(Math.round(watchMinutes/60*10)/10);
  $('analytics-net-subs').textContent=(gained-lost>0?'+':'')+number(gained-lost);
  $('analytics-subs-note').textContent=number(gained)+' получено · '+number(lost)+' потеряно';
  $('analytics-retention').textContent=retention==null?'—':retention.toFixed(1)+'%';
  $('analytics-likes').textContent=number(sum('likes'));
  $('analytics-dislikes').textContent=number(sum('dislikes'));
  $('analytics-red-views').textContent=number(sum('redViews'));
  $('analytics-playlist-adds').textContent=number(sum('playlistAdds'));
  $('analytics-playlist-removes').textContent=number(sum('playlistRemoves'));
  $('analytics-comments').textContent=number(sum('comments'));
  $('analytics-shares').textContent=number(sum('shares'));
  $('analytics-avg-duration').textContent=formatDuration(avgDuration);
  const latest=connected.map(ch=>ch.analytics.updatedAt).filter(Boolean).sort().at(-1);
  const totalChannels=(data.channels||[]).length;
  const authorized=data.analyticsSummary?.authorized??connected.length;
  const needsAuthorization=Math.max(0,totalChannels-authorized);
  $('analytics-updated').textContent='Analytics: отчёты '+connected.length+' / '+totalChannels+
    ' · OAuth '+authorized+' / '+totalChannels+
    (needsAuthorization?' · требуется авторизация для '+needsAuthorization:'')+
    ' · последний снимок '+time(latest);
  renderAnalyticsTrend(daily,period,$('analytics-trend-metric').value);

  const topVideos=[];
  const traffic=new Map(),devices=new Map(),countries=new Map(),demographics=new Map(),
    sharing=new Map(),playback=new Map(),operatingSystems=new Map(),liveModes=new Map(),
    subscribed=new Map();
  const add=(map,key,row,weight=1)=>{
    if(!key)return;
    const item=map.get(key)||{label:key,value:0,sub:0};
    item.value+=Number(row.views)||0;
    item.sub+=Number(row.watchMinutes)||0;
    map.set(key,item);
  };
  for(const channel of connected){
    const reports=channel.analytics.reports||{};
    for(const video of reports.topVideos||[])topVideos.push({
      label:video.videoId||'Видео',value:video.views||0,
      sub:channel.name+' · '+(video.creatorContentType||'Видео'),
      href:video.videoId?'https://www.youtube.com/watch?v='+encodeURIComponent(video.videoId):null
    });
    for(const row of reports.trafficSources||[])add(traffic,row.source,row);
    for(const row of reports.devices||[])add(devices,row.deviceType,row);
    for(const row of reports.countries||[])add(countries,row.country,row);
    const channelWeight=Math.max(1,channel.analytics.views||0);
    for(const row of reports.demographics||[]){
      const key=(row.ageGroup||'Возраст не указан')+' · '+(row.gender||'Пол не указан');
      const item=demographics.get(key)||{label:key,weighted:0,weight:0};
      item.weighted+=(Number(row.viewerPercentage)||0)*channelWeight;
      item.weight+=channelWeight;demographics.set(key,item);
    }
    for(const row of reports.sharingServices||[]){
      const key=row.sharingService||'OTHER';
      const item=sharing.get(key)||{label:key,value:0};
      item.value+=Number(row.shares)||0;sharing.set(key,item);
    }
    for(const row of reports.playbackLocations||[])add(playback,row.playbackLocation,row);
    for(const row of reports.operatingSystems||[])add(operatingSystems,row.operatingSystem,row);
    for(const row of reports.liveOrOnDemand||[])add(liveModes,row.liveOrOnDemand,row);
    for(const row of reports.subscribedStatus||[])add(subscribed,row.subscribedStatus,row);
  }
  const byViews=map=>[...map.values()].sort((a,b)=>b.value-a.value).slice(0,8);
  const sourceNames={
    RELATED_VIDEO:'Рекомендованные видео',YT_SEARCH:'Поиск YouTube',BROWSE_FEATURES:'Главная / Обзор',
    EXTERNAL:'Внешние источники',SHORTS:'Лента Shorts',CHANNEL:'Страницы каналов',
    PLAYLIST:'Плейлисты',NOTIFICATION:'Уведомления',END_SCREEN:'Конечные заставки',
    ADVERTISING:'Реклама',DIRECT_OR_UNKNOWN:'Прямые / неизвестные',OTHER:'Другие'
  };
  const deviceNames={MOBILE:'Телефоны',DESKTOP:'Компьютеры',TV:'Телевизоры',
    TABLET:'Планшеты',GAME_CONSOLE:'Игровые консоли',UNKNOWN:'Неизвестно'};
  const sharingNames={COPY_TO_CLIPBOARD:'Копирование ссылки',WHATSAPP:'WhatsApp',
    FACEBOOK:'Facebook',MESSENGER:'Messenger',EMAIL:'Электронная почта',
    TWITTER:'X / Twitter',OTHER:'Другие сервисы'};
  const playbackNames={WATCH:'Страница просмотра YouTube',EMBEDDED:'Встроенный плеер',
    EXTERNAL_APP:'Внешнее приложение',MOBILE:'Мобильное приложение',OTHER:'Другие места'};
  const osNames={ANDROID:'Android',IOS:'iOS',WINDOWS:'Windows',MAC_OS:'macOS',
    LINUX:'Linux',CHROME_OS:'ChromeOS',OTHER:'Другие ОС'};
  const liveNames={LIVE:'Прямые эфиры',ON_DEMAND:'Обычные видео / Shorts'};
  const subscribedNames={SUBSCRIBED:'Подписчики',UNSUBSCRIBED:'Не подписаны'};
  renderRanking('analytics-top-videos',topVideos.sort((a,b)=>b.value-a.value).slice(0,10),{
    empty:'Нет данных о лучших видео. Google Analytics должен завершить первую синхронизацию.'
  });
  const topChannels=connected.map(channel=>({
    label:channel.name,value:channel.analytics.views||0,
    sub:number(Math.round((channel.analytics.watchMinutes||0)/60))+' ч просмотра · '+
      (channel.analytics.averageViewPercentage==null?'удержание —':
        channel.analytics.averageViewPercentage.toFixed(1)+'% удержания'),
    href:'https://www.youtube.com/channel/'+encodeURIComponent(channel.id)
  })).sort((a,b)=>b.value-a.value).slice(0,10);
  renderRanking('analytics-top-channels',topChannels,{
    empty:'Лидеры появятся после первой облачной синхронизации.'
  });
  renderRanking('analytics-traffic',byViews(traffic).map(item=>({
    ...item,label:sourceNames[item.label]||item.label
  })),{empty:'Источники трафика пока не получены.'});
  renderRanking('analytics-devices',byViews(devices).map(item=>({
    ...item,label:deviceNames[item.label]||item.label
  })),{empty:'Разбивка по устройствам пока не получена.'});
  renderRanking('analytics-countries',byViews(countries),{
    empty:'География пока не получена.'
  });
  renderRanking('analytics-demographics',[...demographics.values()].map(item=>({
    label:item.label,value:item.weight?item.weighted/item.weight:0
  })).sort((a,b)=>b.value-a.value).slice(0,8),{
    format:value=>value.toFixed(1)+'%',
    empty:'YouTube не предоставил демографические данные для этого периода.'
  });
  renderRanking('analytics-sharing',[...sharing.values()].sort((a,b)=>b.value-a.value).slice(0,8).map(item=>({
    ...item,label:sharingNames[item.label]||item.label
  })),{empty:'Нет данных о способах распространения видео.'});
  renderRanking('analytics-playback',byViews(playback).map(item=>({
    ...item,label:playbackNames[item.label]||item.label
  })),{empty:'Нет данных о местах воспроизведения.'});
  renderRanking('analytics-os',byViews(operatingSystems).map(item=>({
    ...item,label:osNames[item.label]||item.label
  })),{empty:'Нет данных об операционных системах.'});
  renderRanking('analytics-subscribed',byViews(subscribed).map(item=>({
    ...item,label:subscribedNames[item.label]||item.label
  })),{empty:'Нет данных о просмотрах подписчиков и новых зрителей.'});
  renderRanking('analytics-live',byViews(liveModes).map(item=>({
    ...item,label:liveNames[item.label]||item.label
  })),{empty:'Нет данных по прямым эфирам и видео.'});
  const retentionCandidate=connected.flatMap(channel=>{
    const reports=channel.analytics.reports||{};
    const video=reports.topVideos?.[0];
    return video&&reports.audienceRetention?.length
      ?[{videoId:video.videoId,channelName:channel.name,views:video.views,rows:reports.audienceRetention}]
      :[];
  }).sort((a,b)=>b.views-a.views)[0];
  renderAudienceRetention(retentionCandidate?.videoId,retentionCandidate?.channelName,
    retentionCandidate?.rows);
  if(!connected.length){
    $('analytics-updated').textContent='Нет облачных отчётов Google Analytics. Импортируй пакет VYRON и нажми «Обновить всё».';
  }
}
function renderEvents(events) {
  const list = $('events');
  list.replaceChildren();
  const compacted=compactProgressEvents(events);
  if (!compacted.length) {
    list.append(make('div', 'empty', 'Новые рубежи появятся после следующих обновлений. Первый снимок задаёт исходную точку.'));
    return;
  }
  for (const item of compacted) {
    const {event,count}=item;
    const ready=event.type==='agent_info'&&/^YOUTUBE READY\b/.test(event.title||'');
    const failed=event.type==='upload_failed'||event.type==='render_failed'||event.type==='agent_error';
    const completed=event.type==='upload_completed'||event.type==='render_completed'||ready;
    const icon=event.type==='subscriber_milestone'?'🎉':failed?'⛔':completed?'✅':
      event.type==='upload_progress'||event.type==='render_progress'||
      (event.type==='agent_info'&&/^YOUTUBE PROCESSING\b/.test(event.title||''))?'↗':'•';
    const labels={
      subscriber_milestone:number(event.milestone)+' подписчиков',
      upload_queued:'В очереди',upload_started:'Загрузка началась',
      upload_progress:'Загрузка',upload_completed:'YouTube принял видео',
      upload_failed:'Ошибка загрузки',render_started:'Рендер начался',
      render_progress:'Рендер',render_completed:'Рендер завершён',
      render_failed:'Ошибка рендера',agent_error:'Ошибка агента',
      agent_info:ready?'YouTube: готово':
        /^YOUTUBE PROCESSING\b/.test(event.title||'')?'YouTube: обработка':'Событие агента'
    };
    const row = make('div', 'event'+(failed?' event-error':completed?' event-success':''));
    const text = make('div', 'event-text');
    const details=[];
    if(event.projectId)details.push('Задание '+event.projectId.slice(0,8));
    if(event.errorCode)details.push('Код '+event.errorCode);
    if(event.percent!==null&&event.percent!==undefined)details.push(number(event.percent)+'%');
    if(count>1)details.push(number(count)+' обновлений прогресса объединено');
    text.append(make('strong', '', icon+' '+(event.name||event.title||'Событие VYRON')),
      make('span', 'event-kind', labels[event.type]||event.type.replaceAll('_',' ')));
    if(details.length)text.append(make('span','event-details',details.join(' · ')));
    text.append(make('span', 'event-time', time(event.detectedAt)));
    row.append(text);
    list.append(row);
  }
}
function renderOverviewTrend(rows) {
  const svg=$('overview-trend'),caption=$('overview-trend-caption');
  svg.replaceChildren();
  const points=(rows||[]).slice(-14).map(row=>({
    date:row.date,value:Math.max(0,Number(row.views)||0)
  })).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date));
  if(!points.length) {
    caption.textContent='Нет дневных отчётов Google Analytics. Публичные просмотры обновляются отдельно.';
    return;
  }
  const values=points.map(point=>point.value);
  const max=Math.max(1,...values),width=720,height=150,left=12,right=12,top=12,bottom=12;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const y=value=>top+(max-value)/max*plotHeight;
  for(let i=1;i<4;i++) {
    const gy=top+i*plotHeight/4;
    svg.append(svgNode('path',{d:'M '+left+' '+gy+' H '+(width-right),class:'overview-grid-line'}));
  }
  const coords=values.map((value,index)=>[
    left+(values.length===1?plotWidth/2:index*plotWidth/(values.length-1)),y(value)
  ]);
  const line=coords.map((point,index)=>(index?'L ':'M ')+point[0]+' '+point[1]).join(' ');
  const area=line+' L '+coords[coords.length-1][0]+' '+(height-bottom)+
    ' L '+coords[0][0]+' '+(height-bottom)+' Z';
  svg.append(svgNode('path',{d:area,class:'overview-area'}));
  svg.append(svgNode('path',{d:line,class:'overview-line'}));
  const last=coords[coords.length-1];
  svg.append(svgNode('circle',{cx:last[0],cy:last[1],r:4,class:'overview-point'}));
  const total=values.reduce((sum,value)=>sum+value,0);
  caption.textContent=points[0].date+' — '+points[points.length-1].date+
    ' · '+number(total)+' просмотров · '+points.length+' дней с данными';
}
function renderOverview(data) {
  const channels=data.channels||[];
  const total=channels.length;
  const publicUpdated=channels.filter(channel=>Boolean(channel.updatedAt)).length;
  const googleReports=channels.filter(channel=>channel.analytics?.source==='GOOGLE_ANALYTICS_API').length;
  const authorized=data.analyticsSummary?.authorized??
    channels.filter(channel=>channel.analyticsAuthorized===true).length;
  const percent=(value,whole)=>whole?Math.max(0,Math.min(100,value/whole*100)):0;
  $('overview-channel-count').textContent=number(total);
  $('overview-channel-caption').textContent=total
    ?publicUpdated+' из '+total+' каналов получили публичные счётчики'
    :'Каналы ещё не добавлены в облако';
  $('overview-channel-coverage').textContent='Счётчики '+publicUpdated+' / '+total;
  $('overview-channel-progress').style.width=percent(publicUpdated,total)+'%';
  $('overview-analytics-count').textContent=googleReports+' / '+total;
  $('overview-analytics-caption').textContent=authorized+' OAuth-привязок · '+googleReports+' готовых отчётов';
  $('overview-analytics-progress').style.width=percent(googleReports,total)+'%';

  const devices=data.devices||[];
  const device=devices.slice().sort((a,b)=>
    (Date.parse(b.lastSeenAt||'')||0)-(Date.parse(a.lastSeenAt||'')||0))[0];
  const age=device?.lastSeenAt?Date.now()-Date.parse(device.lastSeenAt):Infinity;
  const macOnline=Boolean(device&&Number.isFinite(age)&&age>=0&&age<180000);
  $('overview-mac-state').textContent=macOnline?'ONLINE':device?'SLEEP / OFFLINE':'НЕ ПОДКЛЮЧЁН';
  $('overview-mac-caption').textContent=macOnline
    ?'Последний сигнал '+time(device.lastSeenAt)
    :device?'Облако работает; новый локальный канал обнаружится после пробуждения Mac'
      :'Установи Mac Bridge один раз для автообнаружения каналов';

  $('topbar-status-text').textContent=navigator.onLine?'Облако подключено':'Нет интернета';
  $('topbar-dot').classList.toggle('offline',!navigator.onLine);
  const status=$('network-status');
  const state=!navigator.onLine?'warning':data.lastError?'warning':data.syncing?'syncing':data.configured?'online':'setup';
  status.dataset.state=state;
  $('network-status-label').textContent=!navigator.onLine?'Нет интернета':
    data.lastError?'Нужно внимание':
    data.syncing?'Синхронизация':data.configured?'Облако активно':'Нужна настройка API';
  if(data.lastSuccessAt) {
    $('overview-sync-time').textContent=new Intl.DateTimeFormat('ru-RU',{
      timeZone:'Asia/Krasnoyarsk',hour:'2-digit',minute:'2-digit'
    }).format(new Date(data.lastSuccessAt));
  } else $('overview-sync-time').textContent='—';
  $('overview-sync-caption').textContent=data.lastError
    ?'Последняя попытка завершилась ошибкой'
    :'Последний успешный цикл · '+time(data.lastSuccessAt);
  renderOverviewTrend(data.analyticsSummary?.daily||[]);

  const list=$('overview-events');
  list.replaceChildren();
  const events=compactProgressEvents(data.events||[]).slice(0,3);
  if(!events.length) {
    list.append(make('p','overview-caption','Пока нет событий. Журнал заполнится после синхронизации VYRON.'));
    return;
  }
  const eventLabels={
    subscriber_milestone:'Новый рубеж подписчиков',
    upload_queued:'Видео добавлено в очередь',
    upload_started:'Загрузка началась',
    upload_progress:'Идёт загрузка видео',
    upload_completed:'YouTube принял видео',
    upload_failed:'Ошибка загрузки',
    render_started:'Рендер начался',
    render_progress:'Рендер выполняется',
    render_completed:'Рендер завершён',
    render_failed:'Ошибка рендера',
    agent_error:'Ошибка Mac Bridge',
    agent_info:'Событие Mac Bridge',
    channel_sync:'Канал синхронизирован',
    schedule_changed:'Расписание изменено'
  };
  for(const item of events) {
    const {event,count}=item;
    const ready=event.type==='agent_info'&&/^YOUTUBE READY\b/.test(event.title||'');
    const failed=['upload_failed','render_failed','agent_error'].includes(event.type);
    const complete=['upload_completed','render_completed'].includes(event.type)||ready;
    const title=event.type==='agent_info'
      ?(ready?'YouTube: готово':/^YOUTUBE PROCESSING\b/.test(event.title||'')
        ?'YouTube: обработка':'Событие Mac Bridge')
      :(eventLabels[event.type]||'Событие VYRON');
    const row=make('div','overview-event');
    row.append(make('span','overview-event-mark',failed?'!':complete?'✓':'·'));
    const copy=make('div','overview-event-copy');
    copy.append(make('strong','',title),
      make('small','',(event.name||event.title||'')+' · '+time(event.detectedAt)+
        (count>1?' · '+number(count)+' обновлений':'') ));
    row.append(copy);
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
  $('refresh').disabled = !data.configured || data.syncing || manualRefreshing;
  renderChannels(data.channels);
  renderAnalytics(data);
  if (!eventHistoryExtended) renderEvents(data.events);
  renderDevices(data);
  renderOverview(data);
  applyMobileView();
}
async function load() {
  if (!accessToken) return showLogin('');
  try {
    if (!schemaChecked) {
      const healthResponse = await fetch('/api/health', {cache:'no-store'});
      const health = await healthResponse.json().catch(() => null);
      if (!health?.ok || health?.d1?.schema !== true) {
        const missing=Array.isArray(health?.d1?.missing)
          ?' · отсутствуют: '+health.d1.missing.join(', '):'';
        throw new Error((health?.error||'Схема D1 неполная')+missing+
          '. Автоматическое изменение базы отключено; используй guarded release workflow.');
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
let analyticsGroupsMobileMode=null;
function applyMobileView() {
  const mobile=window.matchMedia('(max-width:760px)').matches;
  if(analyticsGroupsMobileMode!==mobile) {
    document.querySelectorAll('.analytics-group').forEach(group=>{group.open=!mobile;});
    analyticsGroupsMobileMode=mobile;
  }
  document.querySelectorAll('[data-mobile-view]').forEach(panel=>{
    panel.classList.toggle('mobile-view-hidden',panel.dataset.mobileView!==activeMobileView);
  });
  document.querySelectorAll('[data-mobile-target]').forEach(button=>{
    const active=button.dataset.mobileTarget===activeMobileView;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
}
document.querySelectorAll('[data-mobile-target]').forEach(button=>{
  button.addEventListener('click',()=>{
    activeMobileView=button.dataset.mobileTarget;
    applyMobileView();
    window.scrollTo({top:0,behavior:'smooth'});
  });
});
$('overview-events-open').addEventListener('click',()=>{
  activeMobileView='events';
  applyMobileView();
  window.scrollTo({top:0,behavior:'smooth'});
});
window.addEventListener('resize',applyMobileView);
$('analytics-period').addEventListener('change',()=>{
  if(current)renderAnalytics(current);
});
$('analytics-trend-metric').addEventListener('change',()=>{
  if(current)renderAnalytics(current);
});
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
  const device = devices.slice().sort((a,b)=>
    (Date.parse(b.lastSeenAt||'')||0)-(Date.parse(a.lastSeenAt||'')||0))[0];
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
    for(const id of [
      'mac-uploaded-today','mac-rendered-today','mac-upload-failures','mac-channels-bound',
      'mac-vyron-version','mac-endlume-version','mac-os-version','mac-model',
      'mac-architecture','mac-uptime','mac-memory','mac-root-disk',
      'mac-power-state','mac-disk-state','mac-ready-upload','mac-agent-error'
    ])$(id).textContent='—';
    $('mac-disk-state').classList.remove('state-bad');
    $('mac-agent-error').classList.remove('state-bad');
    return;
  }
  const recent = device.lastSeenAt &&
    Date.now() - Date.parse(device.lastSeenAt) < 180000;
  $('mac-indicator').textContent = recent ? '● Mac онлайн' : '○ Mac спит / нет связи';
  $('mac-state').textContent = recent ? 'На связи' : 'Последнее состояние';
  $('mac-last').textContent = 'Последний сигнал: ' + time(device.lastSeenAt);
  const s = device.status || {};
  $('mac-vyron-version').textContent=s.vyronVersion||'—';
  $('mac-endlume-version').textContent=s.endlumeVersion||'—';
  $('mac-os-version').textContent=s.macOSVersion||'—';
  $('mac-model').textContent=s.macModel||'—';
  $('mac-architecture').textContent=s.architecture||'—';
  $('mac-uptime').textContent=s.uptimeSeconds==null?'—':formatUptime(s.uptimeSeconds);
  $('mac-memory').textContent=s.memoryFreeBytes==null||s.memoryTotalBytes==null
    ?'—':formatBytes(s.memoryFreeBytes)+' / '+formatBytes(s.memoryTotalBytes);
  $('mac-root-disk').textContent=s.rootDiskFreeBytes==null||s.rootDiskTotalBytes==null
    ?'—':formatBytes(s.rootDiskFreeBytes)+' / '+formatBytes(s.rootDiskTotalBytes);
  $('mac-power-state').textContent=s.macAwake===true?'Активен':
    s.macAwake===false?'Сон':'Нет данных';
  $('mac-disk-state').textContent=s.diskOnline===true?'Подключён':
    s.diskOnline===false?'Недоступен':'Нет данных';
  $('mac-ready-upload').textContent=s.jobsReadyUpload==null?'—':number(s.jobsReadyUpload);
  $('mac-agent-error').textContent=s.lastError?String(s.lastError).slice(0,150):'Нет активных ошибок';
  $('mac-disk-state').classList.toggle('state-bad',s.diskOnline===false);
  $('mac-agent-error').classList.toggle('state-bad',Boolean(s.lastError));
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
    const profiles=result.profiles||[];
    const connectedIds=new Set(profiles.map(profile=>profile.channel_id));
    const allChannels=current?.channels||[];
    const total=allChannels.length||profiles.length;
    const missing=allChannels.filter(channel=>!connectedIds.has(channel.id));
    button.disabled=!result.configured;
    counter.textContent=profiles.length+' / '+total+' каналов';
    message.textContent=result.configured
      ? (missing.length
        ? 'Облачная аналитика подключена для '+profiles.length+' из '+total+
          ' каналов. Оставшиеся привязки будут показаны отдельно — повторный импорт пакета должен восстановить их автоматически.'
        : 'Все '+total+' каналов подключены к Google Analytics в режиме чтения.')
      : 'Google OAuth ещё не настроен в Cloudflare.';
    container.replaceChildren();
    for(const profile of profiles) {
      const line=make('div','oauth-profile');
      const name=make('span','',profile.channel_name+' · '+profile.channel_id);
      const status=make('small','',
        profile.last_error?'Проверить: '+profile.last_error:
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
    for(const channel of missing) {
      const line=make('div','oauth-profile oauth-profile-missing');
      line.append(make('span','',channel.name+' · '+channel.id),
        make('small','','Нет привязки refresh token в облаке. Повтори автоматический импорт пакета VYRON.'));
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
$('migration-import').addEventListener('click',async()=>{
  const button=$('migration-import'),message=$('migration-message');
  const file=$('migration-file').files?.[0],password=$('migration-password').value;
  if(!file){message.textContent='Сначала выбери файл .vyron.';return;}
  if(password.length<10){message.textContent='Введи пароль пакета — минимум 10 символов.';return;}
  button.disabled=true;
  try{
    message.textContent='Расшифровываю пакет локально…';
    const bundle=await decryptVyronMigration(await file.arrayBuffer(),password);
    let imported=0,failed=0,processed=0;
    const failedResults=[],channelNames=new Map(bundle.profiles.map(profile=>
      [profile.channelId,profile.channelName||profile.channelId]));
    try {
      for(let offset=0;offset<bundle.profiles.length;offset+=8){
        const chunk=bundle.profiles.slice(offset,offset+8);
        message.textContent=`Проверяю привязки каналов: ${processed} из ${bundle.profiles.length}…`;
        const result=await api('/api/oauth/import-vyron','POST',{
          bundleUuid:bundle.bundleUuid,profiles:chunk
        });
        imported+=result.imported||0;failed+=result.failed||0;processed+=chunk.length;
        for(const item of result.results||[])if(item.status==='failed')
          failedResults.push((channelNames.get(item.channelId)||item.channelId||'Неизвестный канал')+
            ' ('+(item.reason||'IMPORT_FAILED')+')');
      }
    } finally {
      for(const profile of bundle.profiles){
        profile.refreshToken='';profile.clientSecret='';profile.clientId='';
      }
    }
    $('migration-password').value='';$('migration-file').value='';
    message.textContent=failed
      ?`Подключено ${imported} из ${bundle.profiles.length} каналов; не прошли проверку ${failed}. `+
        (failedResults.length?'Проблемы: '+failedResults.join('; ')+'. ':'')+
        'Повторный импорт безопасен.'
      :`Готово: ${imported} из ${bundle.profiles.length} каналов импортировано и проверено Google.`;
    await loadOauthProfiles();
  }catch(error){message.textContent='Импорт не выполнен: '+error.message;}
  finally{button.disabled=false;}
});
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
    const registration=await ensureServiceWorker();
    if(!registration)throw new Error('Service Worker недоступен в этом браузере.');
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
    const reg=await ensureServiceWorker();
    if(!reg)throw new Error('Service Worker недоступен в этом браузере.');
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
  const button=$('refresh'),feedback=$('refresh-feedback');
  manualRefreshing=true;button.disabled=true;
  feedback.textContent='Шаг 1/2 · обновляем публичные счётчики всех каналов…';
  $('state-label').textContent='Запрашиваем свежие данные YouTube…';
  let publicResult=null,publicError='',analyticsTotal=0,analyticsExpected=current?.channels?.length||0,
    analyticsUpdated=0,analyticsFailed=0,analyticsPartial=0,analyticsErrors=[],missingAnalytics=[];
  try {
    try {publicResult=await api('/api/refresh','POST',{});}
    catch(error){publicError=error.message;}
    try {
      const oauth=await api('/api/oauth/profiles');
      const profiles=oauth.profiles||[];
      analyticsTotal=profiles.length;
      const connectedIds=new Set(profiles.map(profile=>profile.channel_id));
      const allChannels=current?.channels||[];
      analyticsExpected=allChannels.length||analyticsTotal;
      missingAnalytics=allChannels.filter(channel=>!connectedIds.has(channel.id)).map(channel=>channel.name);
      if(analyticsTotal){
        const requestId=crypto.randomUUID().replaceAll('-','');
        for(let offset=0;offset<analyticsTotal;offset+=3){
          const completed=Math.min(offset+3,analyticsTotal);
          feedback.textContent='Шаг 2/2 · Google Analytics: '+completed+' / '+analyticsTotal+
            ' подключённых каналов · всего '+analyticsExpected+'…';
          try {
            const batch=await api('/api/analytics/refresh','POST',{offset,requestId});
            analyticsUpdated+=batch.updated||0;
            analyticsFailed+=batch.failed||0;
            analyticsPartial+=batch.partial||0;
          }catch(error){analyticsErrors.push('пакет '+(offset+1)+': '+error.message);}
        }
      }
    }catch(error){analyticsErrors.push(error.message);}
    await load();
    const publicMatch=publicError.match(/updated (\d+)\/(\d+)/);
    const publicSummary=publicError
      ?'Счётчики '+(publicMatch?publicMatch[1]+'/'+publicMatch[2]:'ошибка')+' · '+publicError
      :publicResult?.skipped?'Публичные счётчики уже обновлялись в этом 5-минутном окне'
      :'Счётчики '+(publicResult?.updatedChannels??0)+' / '+(publicResult?.requestedChannels??0);
    const analyticsSummary='Analytics '+analyticsUpdated+' / '+analyticsExpected+
      ' · OAuth '+analyticsTotal+' / '+analyticsExpected+
      (missingAnalytics.length?' · нет привязки: '+missingAnalytics.join(', '):'')+
      (analyticsFailed?' · ошибок '+analyticsFailed:'')+
      (analyticsPartial?' · неполных отчётов '+analyticsPartial:'');
    feedback.textContent=[publicSummary,analyticsSummary,...analyticsErrors].join(' · ');
    $('state-label').textContent=publicError
      ?'Публичное обновление завершилось не полностью. Смотри детали ниже.'
      :analyticsFailed||analyticsErrors.length
        ?'Публичные счётчики обновлены; часть Analytics-отчётов требует проверки.'
        :'Синхронизация завершена.';
  } catch(error) {
    feedback.textContent='Ошибка синхронизации: '+error.message;
    $('state-label').textContent='Обновление завершилось с ошибкой.';
  } finally {
    manualRefreshing=false;
    if(current)$('refresh').disabled=!current.configured||current.syncing;
    else button.disabled=false;
  }
});
$('search').addEventListener('input', () => {
  if (current) renderChannels(current.channels);
});
$('channel-sort').addEventListener('change', () => {
  if (current) renderChannels(current.channels);
});
$('channel-filter').addEventListener('change',()=>{
  if(current)renderChannels(current.channels);
});
// Local UI polling is free: it does NOT make a YouTube API request.
window.addEventListener('offline',()=>{
  const status=$('network-status');
  if(status){
    status.dataset.state='warning';
    $('network-status-label').textContent='Нет интернета';
  }
  $('topbar-status-text').textContent='Нет интернета';
  $('topbar-dot').classList.add('offline');
  if($('state-label'))$('state-label').textContent='Нет соединения. Показываем последнюю загруженную оболочку приложения.';
});
window.addEventListener('online',()=>{
  if(accessToken)load();
});
setInterval(() => {
  if (accessToken && navigator.onLine && !document.hidden) load();
}, 15_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && accessToken && navigator.onLine) load();
});
load();
