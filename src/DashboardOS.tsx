import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {humanizeError} from './errorCenter';
import {isFutureChannel} from './channelIdentity';
import {subscribeUploadQueue,uploadQueueSnapshot} from './uploadQueueRuntime';
import {formatDuration,formatUploadSpeed,subscribeUploadTelemetry,uploadTelemetrySnapshot} from './uploadTelemetry';
import {loadActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import {CommandCenter} from './CommandCenter';
import {ScreenErrorBoundary} from './ScreenErrorBoundary';
import {activeJobErrors} from './activeErrors';
import {inventoryTotals,useLiveInventory} from './renderInventoryRuntime';
import {ownerInventoryTotals,useYoutubeOwnerInventory} from './youtubeOwnerInventory';
import {publisherDayKey,safeDailyStatus} from './youtubePublishSafety';

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const money=(n:number)=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateTime=(iso?:string)=>iso?new Date(iso).toLocaleString('ru-RU'):'—';

export function DashboardOS(){const page=useApp(s=>s.page),setPage=useApp(s=>s.setPage);return <ScreenErrorBoundary page={page} onHome={()=>setPage('dashboard')}>{page==='autopilot'?<CommandCenter/>:<OperationsDashboard/>}</ScreenErrorBoundary>}

function OperationsDashboard(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),settings=useApp(s=>s.settings),uploadHistory=useApp(s=>s.uploadHistory),setPage=useApp(s=>s.setPage),liveSnapshots=useLiveInventory(s=>s.snapshots),ownerSnapshots=useYoutubeOwnerInventory(s=>s.snapshots),ownerRefreshing=useYoutubeOwnerInventory(s=>s.refreshing),ownerUpdated=useYoutubeOwnerInventory(s=>s.lastBatchAt);
 const [queue,setQueue]=useState(()=>uploadQueueSnapshot()),[telemetry,setTelemetry]=useState(()=>uploadTelemetrySnapshot()),[activeId,setActiveId]=useState(()=>loadActivePublishChannel());
 useEffect(()=>{const offQueue=subscribeUploadQueue(setQueue),offTelemetry=subscribeUploadTelemetry(setTelemetry),offActive=subscribeActivePublishChannel(setActiveId);return()=>{offQueue();offTelemetry();offActive()}},[]);

 const enabled=useMemo(()=>channels.filter(c=>c.enabled!==false),[channels]);
 const liveTotals=useMemo(()=>inventoryTotals(liveSnapshots,enabled),[liveSnapshots,enabled]);
 const ownerTotals=useMemo(()=>ownerInventoryTotals(ownerSnapshots,enabled),[ownerSnapshots,enabled]);
 const connected=enabled.filter(c=>Boolean(c.youtubeProfileId&&c.youtubeChannelId)).length;
 const subscriberKnown=enabled.filter(c=>!c.stats?.hiddenSubscriberCount&&Number.isFinite(Number(c.stats?.subscriberCount??c.stats?.subscribers))).reduce((n,c)=>n+Number(c.stats?.subscriberCount??c.stats?.subscribers??0),0);
 const subscriberHidden=enabled.filter(c=>c.stats?.hiddenSubscriberCount).length;
 const totalViews=enabled.filter(c=>Number.isFinite(Number(c.stats?.viewCount??c.stats?.views))).reduce((n,c)=>n+Number(c.stats?.viewCount??c.stats?.views??0),0);
 const views28=enabled.filter(c=>c.analytics?.periodDays===28).reduce((n,c)=>n+Number(c.analytics?.views||0),0);
 const rpm=Number(settings.estimatedRpmUsd);
 const estimatedRevenue=Number.isFinite(rpm)&&rpm>0?views28/1000*rpm:undefined;

 const todayKey=publisherDayKey(new Date());
 const uploadedToday=uploadHistory.filter(x=>x.status==='UPLOADED'&&Boolean(x.youtubeVideoId)&&publisherDayKey(new Date(x.uploadedAt))===todayKey);
 const publishedToday=Object.values(ownerSnapshots).reduce((n,x)=>n+(x.publishedTodayCount??0),0);
 const scheduledToday=Object.values(ownerSnapshots).reduce((n,x)=>n+(x.scheduledTodayCount??0),0);
 const activeChannelIdsToday=new Set<string>(uploadedToday.map(x=>x.channelId));
 for(const row of Object.values(ownerSnapshots))if((row.publishedTodayCount??0)>0||(row.scheduledTodayCount??0)>0)activeChannelIdsToday.add(row.channelId);
 const nextYoutubePublication=Object.values(ownerSnapshots).map(x=>x.nextScheduledAt).filter((x):x is string=>Boolean(x)).sort((a,b)=>Date.parse(a)-Date.parse(b))[0];

 const active=enabled.find(c=>c.id===activeId)||enabled[0],activeLive=active?liveSnapshots[active.id]:undefined,activeOwner=active?ownerSnapshots[active.id]:undefined,activeQueued=active?queue.queued.filter(x=>x.spec.channelId===active.id).length:0,activeRunning=active?queue.running.filter(x=>x.spec.channelId===active.id).length:0;
 const jobErrors=activeJobErrors(jobs),actionableErrors=jobErrors.length;
 const completedToday=queue.recent.filter(x=>x.state==='SUCCEEDED'&&x.finishedAt&&publisherDayKey(new Date(x.finishedAt))===todayKey).length,failedToday=queue.recent.filter(x=>x.state==='FAILED'&&x.finishedAt&&publisherDayKey(new Date(x.finishedAt))===todayKey).length;

 const attention=useMemo(()=>{
  const rows:{key:string;label:string;text:string;page:'channels'|'production'|'inventory'|'youtube'|'settings'}[]=[];
  for(const c of enabled){
   const inv=liveSnapshots[c.id],owner=ownerSnapshots[c.id],limit=safeDailyStatus(c.id,c.safeDailyUploadLimit);
   if(inv&&inv.folderState==='ONLINE'&&inv.readyVideos===0)rows.push({key:'stock:'+c.id,label:c.name,text:'Локальный запас закончился',page:'inventory'});
   if(!isFutureChannel(c)&&!c.youtubeProfileId)rows.push({key:'oauth:'+c.id,label:c.name,text:'YouTube OAuth не подключён',page:'youtube'});
   if(owner?.complete&&owner.scheduledCount!=null&&owner.scheduledCount<=7)rows.push({key:'schedule:'+c.id,label:c.name,text:'На YouTube реально scheduled: '+owner.scheduledCount,page:'youtube'});
   if(c.safeDailyUploadLimit&&limit.remaining===0)rows.push({key:'limit:'+c.id,label:c.name,text:'Локальный дневной upload limit VYRON: '+limit.used+'/'+limit.limit,page:'channels'})
  }
  for(const j of jobErrors)rows.push({key:'job:'+j.id,label:'VIDEO_'+String(j.number).padStart(3,'0'),text:humanizeError(j.error,'generic').message,page:j.uploadInterruptedAt?'youtube':'production'});
  return rows.slice(0,8)
 },[enabled,liveSnapshots,ownerSnapshots,jobErrors,uploadHistory]);

 const progressChannels=enabled.filter(c=>!c.stats?.hiddenSubscriberCount&&Number.isFinite(Number(c.stats?.subscriberCount??c.stats?.subscribers))).map(c=>({channel:c,subscribers:Number(c.stats?.subscriberCount??c.stats?.subscribers??0)})).sort((a,b)=>b.subscribers-a.subscribers).slice(0,5);
 const primaryUpload=telemetry.active[0],primaryJob=primaryUpload?jobs.find(j=>j.id===primaryUpload.jobId):undefined,primaryChannel=primaryUpload?channels.find(c=>c.id===primaryUpload.channelId):undefined;

 return <div className="commandOverview">
  <div className="opsCardHead commandOverviewHead"><div><small>VYRON 4 • COMMAND OVERVIEW</small><h1>Главная</h1><p>{ownerRefreshing?'Обновляем owner-visible YouTube данные в фоне…':ownerUpdated?'Обновлено '+new Date(ownerUpdated).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Показан сохранённый snapshot • фоновая синхронизация запустится автоматически'}</p></div></div>

  <div className="opsKpiGrid commandKpis" data-testid="dashboard-kpis">
   <Kpi label="КАНАЛЫ" value={enabled.length} sub={'подключено '+connected}/>
   <Kpi label="ПОДПИСЧИКИ" value={fmt(subscriberKnown)} sub={subscriberHidden?'+ '+subscriberHidden+' скрывают показатель':'доступные данные'}/>
   <Kpi label="ВСЕГО ПРОСМОТРОВ" value={fmt(totalViews)} sub="lifetime • public stats"/>
   <Kpi label="OWNER-ВИДЕО" value={fmt(ownerTotals.totalOwnerVisible)} sub={'данные '+ownerTotals.known+'/'+connected+' подключённых'}/>
   <Kpi label="YOUTUBE SCHEDULED" value={ownerTotals.scheduledCount} sub="только real publishAt"/>
   <Kpi label="ЛОКАЛЬНО ГОТОВО" value={liveTotals.ready} sub="Render • не YouTube"/>
   <Kpi label="В ОЧЕРЕДИ" value={queue.queued.length} sub="ещё не YouTube"/>
   <Kpi label="ОШИБКИ" value={actionableErrors} sub="требуют действий" warn={actionableErrors>0}/>
  </div>

  <div className="opsDashboardGrid">
   <section className="opsCard commandToday"><div className="opsCardHead"><div><small>СЕГОДНЯ</small><h2>Фактическая активность</h2></div></div><div className="opsStats">
    <span><small>Опубликовано</small><b>{publishedToday}</b><em>YouTube owner inventory</em></span>
    <span><small>Загружено на YouTube</small><b>{uploadedToday.length}</b><em>успешные VYRON uploads</em></span>
    <span><small>Scheduled сегодня</small><b>{scheduledToday}</b><em>реальный publishAt</em></span>
    <span><small>Активных каналов</small><b>{activeChannelIdsToday.size}</b></span>
    <span><small>Upload queue завершено</small><b>{completedToday}</b></span>
    <span><small>Ошибок upload queue</small><b>{failedToday}</b></span>
    <span><small>Следующая публикация</small><b>{dateTime(nextYoutubePublication)}</b></span>
   </div><footer><button className="primary" onClick={()=>setPage('youtube')}>Открыть YouTube</button></footer></section>

   <section className="opsCard"><div className="opsCardHead"><div><small>ТЕКУЩИЙ КАНАЛ</small><h2>{active?.name||'Канал не выбран'}</h2></div></div>{active?<div className="opsStats">
    <span><small>Локально готово</small><b>{activeLive?.readyVideos??0}</b></span>
    <span><small>Локальный запас</small><b>{activeLive?.runwayDays??0} дн.</b></span>
    <span><small>YouTube scheduled</small><b>{activeOwner?.scheduledCount??'—'}</b></span>
    <span><small>Owner videos</small><b>{activeOwner?.totalOwnerVisible??'—'}</b></span>
    <span><small>Private</small><b>{activeOwner?.privateCount??'—'}</b></span>
    <span><small>В очереди</small><b>{activeQueued}</b></span>
    <span><small>Загружается</small><b>{activeRunning}</b></span>
   </div>:<p className="opsEmpty">Добавьте канал, чтобы видеть оперативное состояние.</p>}<footer><button onClick={()=>setPage('channels')}>Канал</button><button onClick={()=>setPage('inventory')}>Запас</button><button className="primary" onClick={()=>setPage('youtube')}>Публикация</button></footer></section>

   <section className="opsCard monetizationProgress"><div className="opsCardHead"><div><small>ПРОГРЕСС К МОНЕТИЗАЦИИ</small><h2>Подписчики к 1 000</h2><p>Ориентировочный прогресс. Одних подписчиков недостаточно для одобрения монетизации.</p></div></div><div className="channelProgressRows">{progressChannels.map(x=>{const percent=Math.max(0,Math.min(100,x.subscribers/1000*100));return <div className="channelProgressRow" key={x.channel.id}><div><b>{x.channel.name}</b><small>{fmt(x.subscribers)} / 1 000 • осталось {fmt(Math.max(0,1000-x.subscribers))}</small></div><i><em style={{width:percent+'%'}}/></i><span>{percent.toFixed(1)}%</span></div>})}{!progressChannels.length&&<p>Нет доступных данных по подписчикам.</p>}</div><footer><button onClick={()=>setPage('channels')}>Все каналы</button></footer></section>

   <section className="opsCard revenueCard"><div className="opsCardHead"><div><small>ДОХОД • 28 ДНЕЙ</small><h2>{estimatedRevenue==null?'RPM не настроен':'≈ '+money(estimatedRevenue)}</h2></div></div><div className="opsStats"><span><small>Просмотры 28д</small><b>{fmt(views28)}</b></span><span><small>Расчётный RPM</small><b>{estimatedRevenue==null?'—':money(rpm)}</b></span></div><p className="opsEmpty">{estimatedRevenue==null?'Укажите RPM в настройках, чтобы VYRON мог показать ориентировочную оценку.':'Это расчёт по заданному RPM, а не подтверждённый доход YouTube.'}</p><footer><button onClick={()=>setPage('settings')}>{estimatedRevenue==null?'Настроить RPM':'Настройки'}</button><button onClick={()=>setPage('analytics')}>Аналитика</button></footer></section>

   <section className={'opsCard attention '+(attention.length?'warn':'good')}><div className="opsCardHead"><div><small>ТРЕБУЕТ ВНИМАНИЯ</small><h2>{attention.length?attention.length+' важных пунктов':'Всё в порядке'}</h2></div></div>{attention.length?<div className="opsAttentionRows">{attention.map(x=><button key={x.key} onClick={()=>setPage(x.page)}><span><b>{x.label}</b><small>{x.text}</small></span><em>→</em></button>)}</div>:<div className="opsAllGood">✓ Активных проблем по доступным данным нет</div>}<footer><button onClick={()=>setPage(attention[0]?.page||'youtube')}>{attention.length?'Показать':'Открыть YouTube'}</button></footer></section>

   <section className="opsCard"><div className="opsCardHead"><div><small>АКТИВНАЯ ЗАГРУЗКА</small><h2>{primaryUpload?'YouTube transfer':'Нет активной загрузки'}</h2></div></div>{primaryUpload?<div className="activeUploadLine"><div><small>{primaryChannel?.name||'Канал'} • {primaryJob?'VIDEO_'+String(primaryJob.number).padStart(3,'0'):'Видео'}</small><b>{primaryUpload.percent==null?'…':Math.round(primaryUpload.percent)+'%'}</b></div><div><span>{formatUploadSpeed(primaryUpload.speedBps)}</span><span>ETA {formatDuration(primaryUpload.etaSeconds)}</span></div><i><em style={{width:Math.max(0,Math.min(100,primaryUpload.percent||0))+'%'}}/></i></div>:<p className="opsEmpty">Очередь: {queue.queued.length} • локально готово: {liveTotals.ready}</p>}<footer><button onClick={()=>setPage('autopilot')}>Командный центр</button><button onClick={()=>setPage('youtube')}>Upload Center</button></footer></section>
  </div>
 </div>
}
function Kpi({label,value,sub,warn=false}:{label:string;value:React.ReactNode;sub?:string;warn?:boolean}){return <div className={'opsKpi '+(warn?'warn':'')}><small>{label}</small><strong>{value}</strong>{sub&&<span>{sub}</span>}</div>}
