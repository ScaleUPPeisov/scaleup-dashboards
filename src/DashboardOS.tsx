import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {bufferDays} from './core';
import {humanizeError} from './errorCenter';
import {isFutureChannel} from './channelIdentity';
import {buildReadyVideoInventory} from './readyVideoInventory';
import {subscribeUploadQueue,uploadQueueRuntimeFacts,uploadQueueSnapshot} from './uploadQueueRuntime';
import {formatDuration,formatUploadSpeed,subscribeUploadTelemetry,uploadTelemetrySnapshot} from './uploadTelemetry';
import {loadActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import {readErrorHistory,subscribeErrorHistory,type ErrorHistoryItem} from './errorHistory';
import {CommandCenter} from './CommandCenter';

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const sameLocalDay=(iso:string|undefined,now:Date)=>{if(!iso)return false;const d=new Date(iso);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()};

export function DashboardOS(){
 const page=useApp(s=>s.page);
 return page==='autopilot'?<CommandCenter/>:<OperationsDashboard/>;
}

function OperationsDashboard(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),settings=useApp(s=>s.settings),uploadHistory=useApp(s=>s.uploadHistory),projectLifecycle=useApp(s=>s.projectLifecycle),fingerprintCache=useApp(s=>s.fingerprintCache),setPage=useApp(s=>s.setPage);
 const [queue,setQueue]=useState(()=>uploadQueueSnapshot()),[telemetry,setTelemetry]=useState(()=>uploadTelemetrySnapshot()),[activeId,setActiveId]=useState(()=>loadActivePublishChannel()),[history,setHistory]=useState<ErrorHistoryItem[]>(()=>readErrorHistory());
 useEffect(()=>{const offQueue=subscribeUploadQueue(setQueue),offTelemetry=subscribeUploadTelemetry(setTelemetry),offActive=subscribeActivePublishChannel(setActiveId),offErrors=subscribeErrorHistory(()=>setHistory(readErrorHistory()));return()=>{offQueue();offTelemetry();offActive();offErrors()}},[]);
 const enabled=useMemo(()=>channels.filter(c=>c.enabled!==false),[channels]);
 const uploadFacts=useMemo(()=>uploadQueueRuntimeFacts(),[queue]);
 const inventory=useMemo(()=>buildReadyVideoInventory(enabled,jobs,uploadHistory,projectLifecycle,fingerprintCache,uploadFacts,new Date()),[enabled,jobs,uploadHistory,projectLifecycle,fingerprintCache,uploadFacts]);
 const active=enabled.find(c=>c.id===activeId)||enabled[0];
 const activeInv=active?inventory.byChannel[active.id]:undefined;
 const activeQueued=active?queue.queued.filter(x=>x.spec.channelId===active.id).length:0,activeRunning=active?queue.running.filter(x=>x.spec.channelId===active.id).length:0;
 const scheduled=inventory.channels.reduce((n,x)=>n+x.scheduled,0),jobErrors=jobs.filter(j=>j.status==='ERROR'&&j.error),actionableErrors=jobErrors.length+history.length;
 const readyEndlume=jobs.filter(j=>j.status==='READY_RENDER').length,rendering=jobs.filter(j=>j.status==='RENDERING').length;
 const now=new Date(),completedToday=queue.recent.filter(x=>x.state==='SUCCEEDED'&&sameLocalDay(x.finishedAt,now)).length,failedToday=queue.recent.filter(x=>x.state==='FAILED'&&sameLocalDay(x.finishedAt,now)).length;
 const attention=useMemo(()=>{
  const rows:{key:string;label:string;text:string;page:'channels'|'production'|'youtube'|'settings'}[]=[];
  for(const c of enabled){
   const inv=inventory.byChannel[c.id];
   if(inv&&inv.stockDays===0)rows.push({key:`stock:${c.id}`,label:c.name,text:'0 дней запаса готовых видео',page:'production'});
   if(!isFutureChannel(c)&&!c.youtubeProfileId)rows.push({key:`oauth:${c.id}`,label:c.name,text:'требуется подключение YouTube OAuth',page:'youtube'});
   if(!isFutureChannel(c)&&settings.autoUploadYoutube&&!c.safeDailyUploadLimit)rows.push({key:`upload-limit:${c.id}`,label:c.name,text:'для авто-YouTube не задан безопасный 24h-limit',page:'youtube'});
  }
  for(const j of jobErrors)rows.push({key:`job:${j.id}`,label:`VIDEO_${String(j.number).padStart(3,'0')}`,text:humanizeError(j.error,'generic').message,page:j.uploadInterruptedAt?'youtube':'production'});
  for(const e of history)rows.push({key:`history:${e.id}`,label:e.title,text:e.message||e.technicalDetail||'Требуется внимание',page:e.stage?.startsWith('upload')||e.stage?.startsWith('youtube')?'youtube':'settings'});
  return rows.slice(0,5);
 },[enabled,inventory,jobErrors,history,settings.autoUploadYoutube]);
 const primaryUpload=telemetry.active[0];
 const primaryJob=primaryUpload?jobs.find(j=>j.id===primaryUpload.jobId):undefined;
 const primaryChannel=primaryUpload?channels.find(c=>c.id===primaryUpload.channelId):undefined;
 return <>
  <div className="opsKpiGrid" data-testid="dashboard-kpis">
   <Kpi label="КАНАЛЫ" value={channels.length}/><Kpi label="ГОТОВО ВИДЕО" value={inventory.globalFreeCount}/><Kpi label="В ОЧЕРЕДИ" value={queue.queued.length}/><Kpi label="ЗАГРУЖАЕТСЯ" value={telemetry.active.length}/><Kpi label="ЗАПЛАНИРОВАНО" value={scheduled}/><Kpi label="ОШИБКИ" value={actionableErrors} warn={actionableErrors>0}/>
  </div>
  <div className="opsDashboardGrid">
   <section className="opsCard"><div className="opsCardHead"><div><small>ТЕКУЩИЙ КАНАЛ</small><h2>{active?.name||'Канал не выбран'}</h2></div></div>{active?<div className="opsStats"><span><small>Готово</small><b>{activeInv?.free||0}</b></span><span><small>Запланировано</small><b>{activeInv?.scheduled||0}</b></span><span><small>В очереди</small><b>{activeQueued}</b></span><span><small>Загружается</small><b>{activeRunning}</b></span><span><small>Запас</small><b>{activeInv?.stockDays??bufferDays(active,jobs)} дн.</b></span></div>:<p className="opsEmpty">Добавьте канал, чтобы видеть оперативное состояние.</p>}<footer><button onClick={()=>setPage('autopilot')}>Командный центр</button><button onClick={()=>setPage('channels')}>Открыть канал</button><button className="primary" onClick={()=>setPage('youtube')}>Открыть публикацию</button></footer></section>
   <section className="opsCard"><div className="opsCardHead"><div><small>PRODUCTION</small><h2>Локальный pipeline</h2></div></div><div className="opsStats production"><span><small>Проектов</small><b>{fmt(jobs.length)}</b></span><span><small>Файлов MP4 всего</small><b>{fmt(inventory.globalFinalVideoCount)}</b></span><span><small>Свободно для публикации</small><b>{fmt(inventory.globalFreeCount)}</b></span><span><small>Рендерится</small><b>{fmt(rendering)}</b></span><span><small>Готово к ENDLUME</small><b>{fmt(readyEndlume)}</b></span></div><footer><button className="primary" onClick={()=>setPage('production')}>Открыть Production</button></footer></section>
   <section className="opsCard"><div className="opsCardHead"><div><small>UPLOAD QUEUE</small><h2>Загрузка на YouTube</h2></div></div><div className="opsStats"><span><small>В очереди</small><b>{queue.queued.length}</b></span><span><small>Активно</small><b>{telemetry.active.length}</b></span><span><small>Завершено сегодня</small><b>{completedToday}</b></span><span><small>Ошибок сегодня</small><b>{failedToday}</b></span></div>{primaryUpload?<div className="activeUploadLine"><div><small>{primaryChannel?.name||'Канал'} • {primaryJob?`VIDEO_${String(primaryJob.number).padStart(3,'0')}`:'Видео'}</small><b>{primaryUpload.percent==null?'…':`${Math.round(primaryUpload.percent)}%`}</b></div><div><span>{formatUploadSpeed(primaryUpload.speedBps)}</span><span>ETA {formatDuration(primaryUpload.etaSeconds)}</span></div><i><em style={{width:`${Math.max(0,Math.min(100,primaryUpload.percent||0))}%`}}/></i></div>:<p className="opsEmpty">Активных загрузок нет</p>}<footer><button onClick={()=>setPage('youtube')}>Открыть Upload Center</button></footer></section>
   <section className={`opsCard attention ${attention.length?'warn':'good'}`}><div className="opsCardHead"><div><small>ТРЕБУЕТ ВНИМАНИЯ</small><h2>{attention.length?`${attention.length} важных пунктов`:'Всё в порядке'}</h2></div></div>{attention.length?<div className="opsAttentionRows">{attention.map(x=><button key={x.key} onClick={()=>setPage(x.page)}><span><b>{x.label}</b><small>{x.text}</small></span><em>→</em></button>)}</div>:<div className="opsAllGood">✓ Критических проблем нет</div>}<footer><button onClick={()=>setPage(attention[0]?.page||'youtube')}>{attention.length?'Показать все':'Открыть YouTube'}</button></footer></section>
  </div>
 </>;
}

function Kpi({label,value,warn=false}:{label:string;value:number;warn?:boolean}){return <div className={`opsKpi ${warn?'warn':''}`}><small>{label}</small><strong>{fmt(value)}</strong></div>}
