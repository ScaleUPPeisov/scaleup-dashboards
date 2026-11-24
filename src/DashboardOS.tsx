import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import type {Channel,Page,YoutubeProfile} from './types';
import {humanizeError} from './errorCenter';
import {isFutureChannel} from './channelIdentity';
import {buildReadyVideoInventory} from './readyVideoInventory';
import {subscribeUploadQueue,uploadQueueRuntimeFacts,uploadQueueSnapshot} from './uploadQueueRuntime';
import {formatDuration,formatUploadSpeed,subscribeUploadTelemetry,uploadTelemetrySnapshot} from './uploadTelemetry';
import {loadActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import {CommandCenter} from './CommandCenter';
import {ScreenErrorBoundary} from './ScreenErrorBoundary';
import {activeJobErrors} from './activeErrors';
import {useLiveInventory} from './renderInventoryRuntime';
import {dashboardLocalInventory,dashboardLocalInventoryTotal} from './dashboardLocalInventory';
import {OWNER_INVENTORY_EVENT,aggregateOwnerInventories,ownerInventoryForChannel} from './youtubeOwnerInventory';
import {globalDailyUploadStatus,safeDailyStatus,subscribeGlobalDailyUploadStatus} from './youtubePublishSafety';
import {youtubeQuotaUsage} from './youtubeQuota';
import {buildDailyOperations} from './dailyOperations';
import {SystemHealthPanel} from './SystemHealthPanel';
import {ChannelAvatar} from './ChannelAvatar';
import {ModalPortal} from './ModalPortal';
import {notifySuccess,notifyWarning} from './notificationCenter';
import {planStatisticsProjectBatches} from './youtubeChannelStatsRuntime';
import {refreshAllChannelData} from './fullChannelRefresh';
import {classifyYoutubeChannels} from './youtubeStatisticsCenter';
import {RpmCoverageCard} from './RpmCoverageCard';

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const sameLocalDay=(iso:string|undefined,now:Date)=>{if(!iso)return false;const d=new Date(iso);return !Number.isNaN(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()};
const numeric=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const shortDateTime=(iso?:string)=>iso?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'—';

export function DashboardOS({pageOverride}:{pageOverride?:Extract<Page,'dashboard'|'autopilot'>}={}){const page=useApp(s=>pageOverride||s.page),setPage=useApp(s=>s.setPage);return <ScreenErrorBoundary page={page} onHome={()=>setPage('dashboard')}>{page==='autopilot'?<CommandCenter/>:<OperationsDashboard/>}</ScreenErrorBoundary>}

function exactConnectedCount(channels:Channel[],profiles:YoutubeProfile[]){
 const byId=new Map(profiles.map(x=>[x.id,x]));
 return channels.filter(c=>{
  if(!c.youtubeProfileId||!c.youtubeChannelId)return false;
  const p=byId.get(c.youtubeProfileId);
  return Boolean(p?.channelId&&p.channelId===c.youtubeChannelId)
 }).length
}

function OperationsDashboard(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),settings=useApp(s=>s.settings),uploadHistory=useApp(s=>s.uploadHistory),projectLifecycle=useApp(s=>s.projectLifecycle),fingerprintCache=useApp(s=>s.fingerprintCache),setPage=useApp(s=>s.setPage),liveSnapshots=useLiveInventory(s=>s.snapshots);
 const [queue,setQueue]=useState(()=>uploadQueueSnapshot()),[telemetry,setTelemetry]=useState(()=>uploadTelemetrySnapshot()),[activeId,setActiveId]=useState(()=>loadActivePublishChannel()),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[ownerRevision,setOwnerRevision]=useState(0),[globalUploads,setGlobalUploads]=useState(()=>globalDailyUploadStatus()),[statsBusy,setStatsBusy]=useState(false),[statsPreview,setStatsPreview]=useState<{channelIds:string[];eligible:number;workspace:number;projectGroups:number;requests:number;statsUnits:number;ownerUnits:number;units:number}|null>(null),[statsResult,setStatsResult]=useState('');
 useEffect(()=>{const offQueue=subscribeUploadQueue(setQueue),offTelemetry=subscribeUploadTelemetry(setTelemetry),offActive=subscribeActivePublishChannel(setActiveId),offUploads=subscribeGlobalDailyUploadStatus(()=>setGlobalUploads(globalDailyUploadStatus()));return()=>{offQueue();offTelemetry();offActive();offUploads()}},[]);
 useEffect(()=>{const bump=()=>setOwnerRevision(x=>x+1);window.addEventListener(OWNER_INVENTORY_EVENT,bump);window.addEventListener('vyron-channel-schedule-changed',bump);return()=>{window.removeEventListener(OWNER_INVENTORY_EVENT,bump);window.removeEventListener('vyron-channel-schedule-changed',bump)}},[]);
 const bindingKey=channels.map(c=>c.id+':'+(c.youtubeProfileId||'')+':'+(c.youtubeChannelId||'')).join('|');
 useEffect(()=>{
  let live=true;
  const refresh=()=>void api.youtubeProfiles().then(x=>{if(live)setProfiles(x)}).catch(()=>{});
  const timer=window.setTimeout(refresh,100);window.addEventListener('vyron:oauth-state-changed',refresh);
  return()=>{live=false;window.clearTimeout(timer);window.removeEventListener('vyron:oauth-state-changed',refresh)}
 },[bindingKey]);

 const enabled=useMemo(()=>channels.filter(c=>c.enabled!==false),[channels]);
 const uploadFacts=useMemo(()=>uploadQueueRuntimeFacts(),[queue]);
 const inventory=useMemo(()=>buildReadyVideoInventory(enabled,jobs,uploadHistory,projectLifecycle,fingerprintCache,uploadFacts,new Date()),[enabled,jobs,uploadHistory,projectLifecycle,fingerprintCache,uploadFacts]);
 const localTotal=useMemo(()=>dashboardLocalInventoryTotal(enabled,liveSnapshots),[liveSnapshots,enabled]);
 const localTotalValue=localTotal.ready==null?'Нет данных':fmt(localTotal.ready);
 const localTotalNote=localTotal.missing||localTotal.stale?[localTotal.missing?'нет данных по каналам: '+localTotal.missing:'',localTotal.stale?'устарели: '+localTotal.stale:''].filter(Boolean).join(' • '):'папка Render';
 const ownerByChannel=useMemo(()=>new Map(enabled.map(c=>[c.id,ownerInventoryForChannel(c.id)])),[enabled,ownerRevision]);
 const ownerTotals=useMemo(()=>aggregateOwnerInventories(enabled,undefined,ownerByChannel),[enabled,ownerByChannel]);
 const connectedCount=useMemo(()=>exactConnectedCount(enabled,profiles),[enabled,profiles]);

 const subscriberValues=enabled.map(c=>c.stats?.hiddenSubscriberCount?undefined:(c.stats?.subscriberCount??c.stats?.subscribers)).filter(numeric);
 const viewValues=enabled.map(c=>c.stats?.viewCount??c.stats?.views).filter(numeric);
 const videoValues=enabled.map(c=>c.stats?.videoCount??c.stats?.videos).filter(numeric);
 const statsDataChannels=enabled.filter(c=>numeric(c.stats?.subscriberCount??c.stats?.subscribers)||numeric(c.stats?.viewCount??c.stats?.views)||numeric(c.stats?.videoCount??c.stats?.videos)||Boolean(c.stats?.statisticsUpdatedAt||c.stats?.updatedAt)).length;
 const statsUpdatedAt=enabled.map(c=>c.stats?.statisticsUpdatedAt||c.stats?.updatedAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort().at(-1);
 const subscriberTotal=subscriberValues.reduce((a,b)=>a+b,0),viewTotal=viewValues.reduce((a,b)=>a+b,0),videoTotal=videoValues.reduce((a,b)=>a+b,0);
 const aggregate=(values:number[],total:number)=>values.length?(values.length<enabled.length?'≥ ':'')+fmt(total):'—';
 const ownerExact=connectedCount>0&&ownerTotals.availableChannels===connectedCount&&ownerTotals.partialChannels===0;
 const ownerPrefix=ownerExact?'':'≥';
 const ownerVideoValue=ownerTotals.availableChannels?ownerPrefix+fmt(ownerTotals.total):'—';
 const ownerScheduledValue=ownerTotals.availableChannels?ownerPrefix+fmt(ownerTotals.scheduled):'—';

 const active=enabled.find(c=>c.id===activeId)||enabled[0],activeInv=active?inventory.byChannel[active.id]:undefined,activeLive=active?liveSnapshots[active.id]:undefined,activeOwner=active?ownerByChannel.get(active.id):undefined,activeQueued=active?queue.queued.filter(x=>x.spec.channelId===active.id).length:0;
 const activeLocal=dashboardLocalInventory(activeLive);
 const activeLocalNote=activeLocal.state==='stale'?'Устаревшие данные':activeLocal.state==='unknown'?'Нет подтверждённых данных':'';
 const jobErrors=activeJobErrors(jobs),actionableErrors=jobErrors.length,readyEndlume=jobs.filter(j=>j.status==='READY_RENDER').length,rendering=jobs.filter(j=>j.status==='RENDERING').length;
 const now=new Date(),dailyOps=buildDailyOperations(enabled,uploadHistory,liveSnapshots,now),uploadedTodayRows=uploadHistory.filter(x=>sameLocalDay(x.uploadedAt,now)&&Boolean(x.youtubeVideoId)),uploadedToday=dailyOps.uploadedToday,failedToday=queue.recent.filter(x=>x.state==='FAILED'&&sameLocalDay(x.finishedAt,now)).length;
 const apiQuota=youtubeQuotaUsage();
 const activeTodayChannels=new Set<string>([
  ...uploadedTodayRows.map(x=>x.channelId),
  ...telemetry.active.map(x=>x.channelId).filter(Boolean),
  ...enabled.filter(c=>(ownerByChannel.get(c.id)?.publishedToday||0)>0).map(c=>c.id)
 ]).size;

 const progressRows=useMemo(()=>enabled.map(c=>{
  const subscribers=c.stats?.hiddenSubscriberCount?undefined:(c.stats?.subscriberCount??c.stats?.subscribers);
  const views=c.stats?.viewCount??c.stats?.views;
  if(!numeric(subscribers))return null;
  return{channel:c,subscribers,views:numeric(views)?views:undefined,remaining:Math.max(0,1000-subscribers),pct:Math.max(0,Math.min(100,subscribers/1000*100))}
 }).filter((x):x is NonNullable<typeof x>=>Boolean(x)).sort((a,b)=>a.remaining-b.remaining||b.subscribers-a.subscribers).slice(0,5),[enabled]);
 const configuredRpm=numeric(settings.estimatedRpmUsd)&&settings.estimatedRpmUsd>0?settings.estimatedRpmUsd:undefined;

 const attention=useMemo(()=>{
  const rows:{key:string;label:string;text:string;page:'channels'|'production'|'inventory'|'youtube'|'settings'}[]=[];
  if(dailyOps.unprocessedChannels>0)rows.push({key:'daily-unprocessed',label:dailyOps.unprocessedChannels+' каналов',text:'Ещё не обработано сегодня',page:'inventory'});
  const noRender=enabled.filter(c=>!String(c.renderFolderPath||'').trim()).length;
  if(noRender)rows.push({key:'render-unconfigured',label:noRender+' каналов',text:'Папка Render не выбрана',page:'inventory'});
  for(const c of enabled){
   const inv=liveSnapshots[c.id],owner=ownerByChannel.get(c.id);
   if(inv&&inv.folderState==='ONLINE'&&inv.readyVideos===0)rows.push({key:'stock:'+c.id,label:c.name,text:'Локальный запас Render закончился',page:'inventory'});
   if(!isFutureChannel(c)&&!c.youtubeProfileId)rows.push({key:'oauth:'+c.id,label:c.name,text:'Требуется подключение YouTube OAuth',page:'youtube'});
   if(owner?.available&&!owner.complete)rows.push({key:'owner-partial:'+c.id,label:c.name,text:'Список видео YouTube подтверждён не полностью',page:'youtube'});
   if(c.safeDailyUploadLimit!=null){
    const daily=safeDailyStatus(c.id,c.safeDailyUploadLimit);
    if(!daily.unlimited&&daily.remaining===0)rows.push({key:'daily-limit:'+c.id,label:c.name,text:'Дневной лимит загрузок: '+daily.used+'/'+daily.limit,page:'youtube'})
   }else if(!isFutureChannel(c)&&settings.autoUploadYoutube){
    rows.push({key:'upload-limit:'+c.id,label:c.name,text:'Для авто-YouTube не задан локальный дневной лимит',page:'youtube'})
   }
  }
  for(const j of jobErrors)rows.push({key:'job:'+j.id,label:'VIDEO_'+String(j.number).padStart(3,'0'),text:humanizeError(j.error,'generic').message,page:j.uploadInterruptedAt?'youtube':'production'});
  return rows.slice(0,7)
 },[enabled,liveSnapshots,ownerByChannel,jobErrors,settings.autoUploadYoutube,uploadHistory,dailyOps.unprocessedChannels]);

 const primaryUpload=telemetry.active[0],primaryJob=primaryUpload?jobs.find(j=>j.id===primaryUpload.jobId):undefined,primaryChannel=primaryUpload?channels.find(c=>c.id===primaryUpload.channelId):undefined;
 const ownerCoverage=connectedCount?ownerTotals.availableChannels+'/'+connectedCount+' каналов в owner-cache':'нет подключённых каналов';

 async function previewAllChannelStatistics(){
  if(statsBusy)return;
  const classification=classifyYoutubeChannels(enabled,profiles),config=await api.youtubeGoogleConfig().catch(()=>null),batches=planStatisticsProjectBatches(classification.eligible,config,50);
  const statsUnits=batches.length;
  const ownerUnits=classification.eligible.reduce((sum,row)=>{const cached=ownerInventoryForChannel(row.channel.id),videoCount=cached.available?cached.total:50,pages=Math.max(1,Math.ceil(videoCount/50));return sum+1+pages+(videoCount?pages:0)},0);
  setStatsPreview({channelIds:enabled.map(x=>x.id),eligible:classification.eligible.length,workspace:enabled.length,projectGroups:new Set(batches.map(x=>x.groupKey)).size,requests:batches.length,statsUnits,ownerUnits,units:statsUnits+ownerUnits});
 }
 async function refreshAllChannelStatistics(){
  const plan=statsPreview;if(!plan||statsBusy)return;setStatsPreview(null);setStatsBusy(true);setStatsResult('');
  try{
   const r=await refreshAllChannelData(plan.channelIds);
   const stats=r.stats;
   const statsText=stats?`Статистика: ${stats.updated} / ${plan.eligible}`:'Статистика: ошибка';
   const owner=r.owner,counts=owner?.counts;
   const skipped=[counts?.UNLINKED?`Не подключены: ${counts.UNLINKED}`:'',counts?.MISMATCH?`Несовпадение канала: ${counts.MISMATCH}`:'',counts?.DUPLICATE?`Дубликаты: ${counts.DUPLICATE}`:'',counts?.OAUTH_BLOCKED?`Нет доступа OAuth: ${counts.OAUTH_BLOCKED}`:'',counts?.API_FAILED?`Ошибки API: ${counts.API_FAILED}`:'',counts?.QUOTA_STOPPED?`Остановлено по квоте: ${counts.QUOTA_STOPPED}`:''].filter(Boolean).join(' • ');
   const ownerText=owner?`Расписание: ${owner.updated} / ${plan.workspace} • запросов API: ${owner.apiRequests} • квота: ${owner.quotaUnits}`:'Расписание: ошибка';
   const localText=`Render: ${r.local.online} / ${r.local.requested} • готово: ${r.local.ready}`;
   const text=`${statsText} • ${ownerText} • ${localText} • квота API: +${r.quotaDelta}${skipped?' • '+skipped:''}`;
   setStatsResult(text);
   const partial=Boolean(r.errors.length||!stats||stats.failed||stats.credentialBlocked||!owner||owner.updated!==plan.workspace||owner.failed||owner.stoppedForQuota||r.local.issues);
   if(partial)notifyWarning('Каналы обновлены частично',text+(r.errors.length?' • '+r.errors.slice(0,2).join(' • '):''));
   else notifySuccess('Все каналы обновлены',text);
  }catch(e){notifyWarning('Каналы не обновлены',String(e))}
  finally{setStatsBusy(false)}
 }
 function openRpmSettings(){try{localStorage.setItem('vyron:settings-target-tab','general');localStorage.setItem('vyron:settings-target-section','rpm')}catch{}setPage('settings');window.setTimeout(()=>window.dispatchEvent(new CustomEvent('vyron:settings-target-section',{detail:'rpm'})),0)}

 return <div className="apexDashboard">
  <section className="opsCard networkStatsCard" data-testid="all-channels-network-stats">
   <div className="opsCardHead"><div><h2>Статистика всех каналов</h2><details className="dashboardSourceDetails"><summary>Источник данных</summary><p>Автообновление YouTube: <b>ВЫКЛ</b>. Показаны сохранённые локальные данные.</p></details></div><button className="primary" disabled={statsBusy||!connectedCount} onClick={()=>void previewAllChannelStatistics()}>{statsBusy?'Обновление…':'Обновить все каналы'}</button></div>
   <div className="networkStatsGrid">
    <span><small>Каналов</small><b>{enabled.length}</b></span>
    <span><small>Подключено YouTube</small><b>{connectedCount} / {enabled.length}</b></span>
    <span><small>Подписчики всего</small><b>{aggregate(subscriberValues,subscriberTotal)}</b></span>
    <span><small>Просмотры всего</small><b>{aggregate(viewValues,viewTotal)}</b></span>
    <span><small>Видео на YouTube</small><b>{aggregate(videoValues,videoTotal)}</b></span>
    <span><small>Данные есть</small><b>{statsDataChannels} / {enabled.length}</b></span>
    <span><small>Последнее обновление</small><b>{statsUpdatedAt?new Date(statsUpdatedAt).toLocaleString('ru-RU'):'—'}</b></span>
    <span><small>Источник</small><b>СОХРАНЁННЫЕ ДАННЫЕ</b></span>
   </div>
   {statsResult&&<p className="opsSourceNote">{statsResult}</p>}
  </section>
  {statsPreview&&<ModalPortal onClose={()=>setStatsPreview(null)}><section className="confirmModal statsRefreshPreview" onMouseDown={e=>e.stopPropagation()}>
   <small>ОБНОВИТЬ СТАТИСТИКУ</small><h2>Обновить все доступные каналы?</h2>
   <div className="settingsInfoGrid">
    <span><small>Рабочих каналов</small><b>{statsPreview.workspace}</b></span>
    <span><small>Будет обновлено</small><b>{statsPreview.eligible}</b></span>
    <span><small>Группы проектов API</small><b>{statsPreview.projectGroups}</b></span>
    <span><small>Запросы channels.list</small><b>{statsPreview.requests}</b></span>
    <span><small>Статистика: квота API</small><b>≈ {statsPreview.statsUnits} ед.</b></span>
    <span><small>Расписание: квота API</small><b>≈ {statsPreview.ownerUnits} ед.</b></span>
    <span><small>Оценка всего</small><b>≈ {statsPreview.units} ед.</b></span>
    <span><small>Проверка папок Render</small><b>0 ед.</b></span>
   </div>
   <p>Обновятся статистика, подтверждённое расписание YouTube и локальный запас. Проверка Render не расходует квоту API. Расход на расписание зависит от числа видео; итог появится после обновления.</p>
   <footer><button onClick={()=>setStatsPreview(null)}>ОТМЕНА</button><button className="primary" onClick={()=>void refreshAllChannelStatistics()}>ОБНОВИТЬ</button></footer>
  </section></ModalPortal>}
  <div className="opsKpiGrid v400" data-testid="dashboard-kpis">
   <Kpi label="КАНАЛЫ" value={enabled.length} hint={'YouTube подключено: '+connectedCount}/>
   <Kpi label="ОБРАБОТАНО СЕГОДНЯ" value={dailyOps.processedChannels+' / '+enabled.length} hint={'загружено: '+dailyOps.uploadedToday}/>
   <Kpi label="НЕ ОБРАБОТАНО" value={dailyOps.unprocessedChannels} hint="по истории загрузок за сегодня"/>
   <Kpi label="ЛОКАЛЬНО ГОТОВО" value={localTotalValue} hint={localTotalNote}/>
   <Kpi label="ЗАПЛАНИРОВАНО НА YOUTUBE" value={ownerScheduledValue} hint="подтверждено YouTube"/>
   <Kpi label="ОШИБКИ" value={actionableErrors} hint={actionableErrors?'требуют внимания':'активных ошибок нет'} warn={actionableErrors>0}/>
   <Kpi label="YOUTUBE API" value={apiQuota.limit?apiQuota.used+' / '+apiQuota.limit:'Нет данных'} hint="единиц квоты"/>
   <Kpi label="ЗАГРУЗКИ VYRON" value={globalUploads.used+' / '+globalUploads.limit} hint={'осталось: '+globalUploads.remaining}/>
  </div>

  <SystemHealthPanel profiles={profiles}/>

  <div className="opsDashboardGrid v400">
   <section className="opsCard todayCard">
    <div className="opsCardHead"><div><h2>Сегодня</h2></div></div>
    <div className="opsStats">
     <span><small>Опубликовано</small><b>{ownerTotals.availableChannels?ownerTotals.publishedToday:'—'}</b></span>
     <span><small>Загружено через VYRON</small><b>{uploadedToday}</b></span>
     <span><small>Запланировано на YouTube</small><b>{ownerTotals.availableChannels?ownerTotals.scheduled:'—'}</b></span>
     <span><small>Активных каналов</small><b>{activeTodayChannels}</b></span>
     <span><small>Активные ошибки</small><b>{actionableErrors}</b></span>
     <span><small>Следующая публикация</small><b>{shortDateTime(ownerTotals.nextScheduledAt)}</b></span>
    </div>
    <footer><button onClick={()=>setPage('youtube')}>Открыть YouTube</button></footer>
   </section>

   <section className="opsCard ownerInventoryCard">
    <div className="opsCardHead"><div><h2>Видео на YouTube</h2></div><span className={ownerExact?'ownerTruth exact':'ownerTruth partial'}>{ownerExact?'Полные данные':'Частичные данные'}</span></div>
    <div className="opsStats ownerStates">
     <span><small>Всего доступно владельцу</small><b>{ownerVideoValue}</b></span>
     <span><small>Открытые</small><b>{ownerTotals.availableChannels?ownerPrefix+fmt(ownerTotals.public):'—'}</b></span>
     <span><small>Закрытые</small><b>{ownerTotals.availableChannels?ownerPrefix+fmt(ownerTotals.private):'—'}</b></span>
     <span><small>Запланированные</small><b>{ownerScheduledValue}</b></span>
     <span><small>По ссылке</small><b>{ownerTotals.availableChannels?ownerPrefix+fmt(ownerTotals.unlisted):'—'}</b></span>
    </div>
    <details className="dashboardSourceDetails"><summary>Источник данных</summary><p>Сохранённый список загрузок владельца и данные videos.list. Публичная статистика канала не используется как полное число видео.</p></details>
    <footer><button onClick={()=>setPage('youtube')}>Открыть «Загруженные»</button></footer>
   </section>

   <section className="opsCard">
    <div className="opsCardHead"><div><h2 className="dashboardChannelTitle">{active&&<ChannelAvatar channel={active} size="sm"/>}<span>{active?.name||'Канал не выбран'}</span></h2></div></div>
    {active?<div className="opsStats">
     <span><small>Локально готово</small><b>{activeLocal.ready??'Нет данных'}</b>{activeLocalNote&&<small>{activeLocalNote}</small>}{activeLocal.ready==null&&activeInv&&<small>По задачам: {activeInv.free}</small>}</span>
     <span><small>Запланировано на YouTube</small><b>{activeOwner?.available?activeOwner.scheduled:'—'}</b></span>
     <span><small>Закрытые</small><b>{activeOwner?.available?activeOwner.private:'—'}</b></span>
     <span><small>В очереди</small><b>{activeQueued}</b></span>
     <span><small>Локальный запас</small><b>{activeLocal.runwayDays==null?'Нет данных':activeLocal.runwayDays+' дн.'}</b>{activeLocalNote&&<small>{activeLocalNote}</small>}</span>
    </div>:<p className="opsEmpty">Добавьте канал, чтобы видеть оперативное состояние.</p>}
    <footer><button onClick={()=>setPage('autopilot')}>Командный центр</button><button onClick={()=>setPage('channels')}>Открыть канал</button><button className="primary" onClick={()=>setPage('youtube')}>Публикация</button></footer>
   </section>

   <section className="opsCard">
    <div className="opsCardHead"><div><h2>Локальное производство</h2></div></div>
    <div className="opsStats production"><span><small>Проектов</small><b>{fmt(jobs.length)}</b></span><span><small>MP4 всего</small><b>{fmt(inventory.globalFinalVideoCount)}</b></span><span><small>Готово локально</small><b>{localTotalValue}</b>{(localTotal.missing>0||localTotal.stale>0)&&<small>{localTotalNote}</small>}</span><span><small>Рендерится</small><b>{fmt(rendering)}</b></span><span><small>Готово к ENDLUME</small><b>{fmt(readyEndlume)}</b></span></div>
    <footer><button className="primary" onClick={()=>setPage('inventory')}>Запас видео</button><button onClick={()=>setPage('production')}>Производство</button></footer>
   </section>

   <section className="opsCard progressCard">
    <div className="opsCardHead"><div><h2>Подписчики к монетизации</h2></div></div>
    {progressRows.length?<div className="channelProgressRows">{progressRows.map(x=><div key={x.channel.id}><div className="dashboardProgressIdentity"><ChannelAvatar channel={x.channel} size="sm"/><span><b>{x.channel.name}</b><span>{fmt(x.subscribers)} / 1 000 • осталось {fmt(x.remaining)}</span></span></div><i><em style={{width:x.pct+'%'}}/></i><small>{x.views==null?'Просмотры: нет данных':'Просмотры: '+fmt(x.views)}</small><small>Часы публичного просмотра: нет данных • Просмотры Shorts: нет данных</small></div>)}</div>:<p className="opsEmpty">Нет доступных данных по подписчикам.</p>}
    <p className="opsSourceNote">Ориентировочный прогресс. Достижение 1 000 подписчиков само по себе не означает одобрение монетизации.</p>
    <footer><button onClick={()=>setPage('analytics')}>Аналитика</button></footer>
   </section>

   <RpmCoverageCard channels={enabled} profiles={profiles} rpm={configuredRpm} onSettings={openRpmSettings} onAnalytics={()=>setPage('analytics')}/>

   <section className="opsCard">
    <div className="opsCardHead"><div><h2>Загрузки YouTube</h2></div></div>
    <div className="opsStats"><span><small>В очереди</small><b>{queue.queued.length}</b></span><span><small>Активно</small><b>{telemetry.active.length}</b></span><span><small>Загружено сегодня</small><b>{uploadedToday}</b></span><span><small>Ошибок сегодня</small><b>{failedToday}</b></span></div>
    {primaryUpload?<div className="activeUploadLine"><div><small>{primaryChannel?.name||'Канал'} • {primaryJob?'VIDEO_'+String(primaryJob.number).padStart(3,'0'):'Видео'}</small><b>{primaryUpload.percent==null?'…':Math.round(primaryUpload.percent)+'%'}</b></div><div><span>{formatUploadSpeed(primaryUpload.speedBps)}</span><span>Осталось {formatDuration(primaryUpload.etaSeconds)}</span></div><i><em style={{width:Math.max(0,Math.min(100,primaryUpload.percent||0))+'%'}}/></i></div>:<p className="opsEmpty">Активных загрузок нет</p>}
    <footer><button onClick={()=>setPage('youtube')}>Центр загрузок</button></footer>
   </section>

   <section className={'opsCard attention '+(attention.length?'warn':'good')}>
    <div className="opsCardHead"><div><h2>{attention.length?'Требует внимания ('+attention.length+')':'Всё в порядке'}</h2></div></div>
    {attention.length?<div className="opsAttentionRows">{attention.map(x=><button key={x.key} onClick={()=>setPage(x.page)}><span><b>{x.label}</b><small>{x.text}</small></span><em>→</em></button>)}</div>:<div className="opsAllGood">✓ Активных ошибок нет</div>}
    <footer><button onClick={()=>setPage(attention[0]?.page||'youtube')}>{attention.length?'Показать':'Открыть YouTube'}</button></footer>
   </section>
  </div>
 </div>;
}
function Kpi({label,value,hint,warn=false}:{label:string;value:React.ReactNode;hint?:string;warn?:boolean}){return <div className={'opsKpi '+(warn?'warn':'')}><small>{label}</small><strong>{value}</strong>{hint&&<em>{hint}</em>}</div>}
