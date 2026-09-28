import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {humanizeError} from './errorCenter';
import {isFutureChannel} from './channelIdentity';
import {subscribeUploadQueue,uploadQueueSnapshot} from './uploadQueueRuntime';
import {subscribeUploadTelemetry,uploadTelemetrySnapshot} from './uploadTelemetry';
import {CommandCenter} from './CommandCenter';
import {ScreenErrorBoundary} from './ScreenErrorBoundary';
import {activeJobErrors} from './activeErrors';
import {inventoryTotals,useLiveInventory} from './renderInventoryRuntime';
import {ownerInventoryTotals,refreshOwnerInventorySmart,useOwnerInventory} from './ownerInventoryRuntime';
import {safeDailyStatus} from './youtubePublishSafety';
import type {Channel,Page} from './types';

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const sameLocalDay=(iso:string|undefined,now:Date)=>{if(!iso)return false;const d=new Date(iso);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()};
const statSubscribers=(c:Channel)=>{if(c.stats?.hiddenSubscriberCount)return undefined;const n=c.stats?.subscriberCount??c.stats?.subscribers;return Number.isFinite(Number(n))?Number(n):undefined};
const statViews=(c:Channel)=>{const n=c.stats?.viewCount??c.stats?.views;return Number.isFinite(Number(n))?Number(n):undefined};
const dateTime=(iso?:string)=>{if(!iso)return'—';const d=new Date(iso);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};
const channelConnected=(c:Channel)=>Boolean(c.youtubeProfileId);

export function DashboardOS(){const page=useApp(s=>s.page),setPage=useApp(s=>s.setPage);return <ScreenErrorBoundary page={page} onHome={()=>setPage('dashboard')}>{page==='autopilot'?<CommandCenter/>:<OperationsDashboard/>}</ScreenErrorBoundary>}

function OperationsDashboard(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),uploadHistory=useApp(s=>s.uploadHistory),setPage=useApp(s=>s.setPage);
 const liveSnapshots=useLiveInventory(s=>s.snapshots),ownerSnapshots=useOwnerInventory(s=>s.snapshots),ownerSyncing=useOwnerInventory(s=>s.syncing);
 const [queue,setQueue]=useState(()=>uploadQueueSnapshot()),[telemetry,setTelemetry]=useState(()=>uploadTelemetrySnapshot());
 useEffect(()=>{const offQueue=subscribeUploadQueue(setQueue),offTelemetry=subscribeUploadTelemetry(setTelemetry);return()=>{offQueue();offTelemetry()}},[]);

 const enabled=useMemo(()=>channels.filter(c=>c.enabled!==false),[channels]);
 const liveTotals=useMemo(()=>inventoryTotals(liveSnapshots,enabled),[liveSnapshots,enabled]);
 const ownerTotals=useMemo(()=>ownerInventoryTotals(ownerSnapshots,enabled),[ownerSnapshots,enabled]);
 const connected=enabled.filter(channelConnected).length;
 const subscriberRows=enabled.map(c=>({c,value:statSubscribers(c)})).filter((x):x is {c:Channel;value:number}=>x.value!==undefined);
 const viewRows=enabled.map(c=>({c,value:statViews(c)})).filter((x):x is {c:Channel;value:number}=>x.value!==undefined);
 const totalSubscribers=subscriberRows.reduce((n,x)=>n+x.value,0),totalViews=viewRows.reduce((n,x)=>n+x.value,0);
 const now=new Date(),uploadedToday=uploadHistory.filter(x=>x.status==='UPLOADED'&&sameLocalDay(x.uploadedAt,now)).length;
 const jobErrors=activeJobErrors(jobs),actionableErrors=jobErrors.length;
 const nextScheduled=Object.values(ownerSnapshots).map(x=>x.nextScheduledAt).filter((x):x is string=>Boolean(x)&&Date.parse(x)>Date.now()).sort((a,b)=>Date.parse(a)-Date.parse(b))[0];

 const progressRows=subscriberRows.slice().sort((a,b)=>Math.max(0,1000-a.value)-Math.max(0,1000-b.value)).slice(0,6);
 const revenueRows=enabled.filter(c=>Number.isFinite(Number(c.analytics?.estimatedRevenue))).map(c=>({revenue:Number(c.analytics!.estimatedRevenue),views:Number(c.analytics?.views||0),rpm:Number(c.analytics?.rpm)}));
 const revenue28=revenueRows.reduce((n,x)=>n+x.revenue,0),revenueViews=revenueRows.reduce((n,x)=>n+(Number.isFinite(x.views)?x.views:0),0);
 const rpmRows=revenueRows.filter(x=>Number.isFinite(x.rpm)),weightedRpm=revenueViews>0&&revenue28>0?revenue28/revenueViews*1000:(rpmRows.length?rpmRows.reduce((n,x)=>n+x.rpm,0)/rpmRows.length:undefined);

 const attention=useMemo(()=>{
  const rows:{key:string;label:string;text:string;page:Page}[]=[];
  for(const c of enabled){
   const local=liveSnapshots[c.id],owner=ownerSnapshots[c.id],daily=safeDailyStatus(c.id,c.safeDailyUploadLimit);
   if(local&&local.folderState==='ONLINE'&&local.readyVideos===0)rows.push({key:'stock:'+c.id,label:c.name,text:'Локальный запас Render закончился',page:'inventory'});
   if(!isFutureChannel(c)&&!c.youtubeProfileId)rows.push({key:'oauth:'+c.id,label:c.name,text:'Не подключён YouTube OAuth',page:'youtube'});
   if(c.youtubeProfileId&&owner?.status==='UNAVAILABLE')rows.push({key:'owner:'+c.id,label:c.name,text:'Owner inventory YouTube ещё не синхронизирован',page:'youtube'});
   if(owner&&owner.status!=='UNAVAILABLE'&&owner.scheduledCount<=7)rows.push({key:'schedule:'+c.id,label:c.name,text:'На YouTube реально запланировано: '+owner.scheduledCount,page:'youtube'});
   if(daily.configured&&daily.remaining===0)rows.push({key:'limit:'+c.id,label:c.name,text:'Локальный upload limit достигнут: '+daily.used+'/'+daily.limit,page:'youtube'});
  }
  for(const j of jobErrors)rows.push({key:'job:'+j.id,label:'VIDEO_'+String(j.number).padStart(3,'0'),text:humanizeError(j.error,'generic').message,page:j.uploadInterruptedAt?'youtube':'production'});
  return rows.slice(0,7)
 },[enabled,liveSnapshots,ownerSnapshots,jobErrors]);

 const unavailableSubscribers=Math.max(0,enabled.length-subscriberRows.length),unavailableViews=Math.max(0,enabled.length-viewRows.length);
 const ownerVideosValue=ownerTotals.availableChannels?fmt(ownerTotals.total):'—';
 const refreshOwner=()=>void refreshOwnerInventorySmart(false).catch(()=>{});

 return <div className="v4Dashboard">
  <div className="v4OverviewHeader">
   <div><small>VYRON 4.0 • COMMAND OVERVIEW</small><h1>Главная</h1><p>Локальный запас и фактическое состояние YouTube показаны раздельно.</p></div>
   <div><span className={ownerSyncing?'syncing':'fresh'}>{ownerSyncing?'● Обновляем данные…':'● Smart cache активен'}</span><button onClick={refreshOwner} disabled={ownerSyncing}>↻ ОБНОВИТЬ STALE</button></div>
  </div>

  <div className="opsKpiGrid v4KpiGrid" data-testid="dashboard-kpis">
   <Kpi label="КАНАЛЫ" value={fmt(enabled.length)} note={'подключено: '+connected}/>
   <Kpi label="ПОДПИСЧИКИ" value={fmt(totalSubscribers)} note={unavailableSubscribers?'нет данных: '+unavailableSubscribers:'все доступны'}/>
   <Kpi label="ПРОСМОТРЫ" value={fmt(totalViews)} note={unavailableViews?'нет данных: '+unavailableViews:'lifetime views'}/>
   <Kpi label="OWNER-ВИДЕО" value={ownerVideosValue} note={ownerTotals.availableChannels?'каналов: '+ownerTotals.availableChannels:'ожидает sync'}/>
   <Kpi label="ЛОКАЛЬНО ГОТОВО" value={fmt(liveTotals.ready)} note="Render • не YouTube"/>
   <Kpi label="YOUTUBE SCHEDULED" value={ownerTotals.availableChannels?fmt(ownerTotals.scheduledCount):'—'} note="только real publishAt"/>
   <Kpi label="ОШИБКИ" value={fmt(actionableErrors)} note={actionableErrors?'требуют внимания':'активных нет'} warn={actionableErrors>0}/>
  </div>

  <div className="opsDashboardGrid v4OverviewGrid">
   <section className="opsCard v4Today">
    <div className="opsCardHead"><div><small>СЕГОДНЯ</small><h2>Оперативная сводка</h2></div><span>{new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'long'}).format(now)}</span></div>
    <div className="opsStats v4TodayStats">
     <span><small>Опубликовано</small><b>{ownerTotals.availableChannels?ownerTotals.publishedToday:'—'}</b></span>
     <span><small>Загружено на YouTube</small><b>{uploadedToday}</b></span>
     <span><small>Запланировано</small><b>{ownerTotals.availableChannels?ownerTotals.scheduledCount:'—'}</b></span>
     <span><small>В очереди</small><b>{queue.queued.length}</b></span>
     <span><small>Загружается</small><b>{telemetry.active.length}</b></span>
     <span><small>Ошибки</small><b>{actionableErrors}</b></span>
    </div>
    <div className="v4NextPublish"><small>Следующая реальная публикация YouTube</small><b>{dateTime(nextScheduled)}</b></div>
   </section>

   <section className={'opsCard attention '+(attention.length?'warn':'good')}>
    <div className="opsCardHead"><div><small>ТРЕБУЕТ ВНИМАНИЯ</small><h2>{attention.length?attention.length+' пунктов':'Всё в порядке'}</h2></div></div>
    {attention.length?<div className="opsAttentionRows">{attention.map(x=><button key={x.key} onClick={()=>setPage(x.page)}><span><b>{x.label}</b><small>{x.text}</small></span><em>→</em></button>)}</div>:<div className="opsAllGood">✓ Критичных действий сейчас нет</div>}
   </section>

   <section className="opsCard v4ProgressCard">
    <div className="opsCardHead"><div><small>ПРОГРЕСС К МОНЕТИЗАЦИИ</small><h2>Каналы ближе всего к 1 000 подписчиков</h2><p>Ориентировочный прогресс. Одних подписчиков недостаточно для одобрения монетизации.</p></div><button onClick={()=>setPage('analytics')}>Аналитика →</button></div>
    {progressRows.length?<div className="v4ProgressRows">{progressRows.map(({c,value})=>{
     const pct=Math.max(0,Math.min(100,value/1000*100)),left=Math.max(0,1000-value),owner=ownerSnapshots[c.id],views=statViews(c);
     return <button key={c.id} onClick={()=>setPage('channels')}><div className="v4ProgressIdentity"><b>{c.name}</b><small>{fmt(value)} / 1 000 • осталось {fmt(left)}</small></div><div className="v4ProgressBar"><i><em style={{width:pct+'%'}}/></i><span>{pct.toFixed(1)}%</span></div><div className="v4ProgressMeta"><span>Просмотры <b>{views===undefined?'Нет данных':fmt(views)}</b></span><span>Owner-видео <b>{owner&&owner.status!=='UNAVAILABLE'?owner.total:'Нет данных'}</b></span><span>Следующая публикация <b>{owner?.nextScheduledAt?dateTime(owner.nextScheduledAt):'Нет данных'}</b></span></div></button>
    })}</div>:<p className="opsEmpty">Статистика подписчиков пока недоступна.</p>}
   </section>

   <section className="opsCard">
    <div className="opsCardHead"><div><small>YOUTUBE OWNER INVENTORY</small><h2>Что реально находится на YouTube</h2></div><span>{ownerTotals.availableChannels}/{enabled.length} каналов</span></div>
    <div className="opsStats v4OwnerStats">
     <span><small>Всего owner-visible</small><b>{ownerTotals.availableChannels?fmt(ownerTotals.total):'—'}</b></span>
     <span><small>Public</small><b>{ownerTotals.availableChannels?fmt(ownerTotals.publicCount):'—'}</b></span>
     <span><small>Private</small><b>{ownerTotals.availableChannels?fmt(ownerTotals.privateCount):'—'}</b></span>
     <span><small>Scheduled</small><b>{ownerTotals.availableChannels?fmt(ownerTotals.scheduledCount):'—'}</b></span>
     <span><small>Unlisted</small><b>{ownerTotals.availableChannels?fmt(ownerTotals.unlistedCount):'—'}</b></span>
    </div>
    <p className="v4TruthNote">Локальные Render-файлы не увеличивают эти числа и не продлевают YouTube schedule.</p>
    <footer><button onClick={()=>setPage('youtube')}>Открыть YouTube</button></footer>
   </section>

   <section className="opsCard">
    <div className="opsCardHead"><div><small>ДОХОД • 28 ДНЕЙ</small><h2>{revenueRows.length?money(revenue28):'Нет данных'}</h2></div></div>
    {revenueRows.length?<div className="opsStats v4RevenueStats"><span><small>Расчётный доход</small><b>{money(revenue28)}</b></span><span><small>Расчётный RPM</small><b>{weightedRpm===undefined?'Нет данных':money(weightedRpm)}</b></span><span><small>Каналов с monetary data</small><b>{revenueRows.length}</b></span></div>:<div className="opsEmpty">RPM / revenue не доступны. VYRON не подставляет выдуманное значение.</div>}
    <footer><button onClick={()=>setPage('analytics')}>Открыть аналитику</button></footer>
   </section>

   <section className="opsCard v4QuickActions">
    <div className="opsCardHead"><div><small>БЫСТРЫЕ ДЕЙСТВИЯ</small><h2>Рабочие разделы</h2></div></div>
    <div><button onClick={()=>setPage('inventory')}>Запас видео <b>{liveTotals.ready}</b></button><button onClick={()=>setPage('youtube')}>YouTube <b>{ownerTotals.availableChannels?ownerTotals.scheduledCount:'—'}</b></button><button onClick={()=>setPage('production')}>Производство</button><button onClick={()=>setPage('analytics')}>Аналитика</button><button onClick={()=>setPage('settings')}>Настройки</button></div>
   </section>
  </div>
 </div>
}

function Kpi({label,value,note,warn=false}:{label:string;value:string|number;note:string;warn?:boolean}){return <div className={'opsKpi '+(warn?'warn':'')}><small>{label}</small><strong>{value}</strong><span className="v4KpiNote">{note}</span></div>}
