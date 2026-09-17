import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {subscribeUploadQueue,uploadQueueSnapshot} from './uploadQueueRuntime';
import {formatDuration,formatUploadBytes,formatUploadSpeed,subscribeUploadTelemetry,uploadTelemetrySnapshot,type UploadTelemetryRecord} from './uploadTelemetry';
import {closeUploadCenter,openUploadCenter,subscribeUploadCenterUi,uploadCenterOpen} from './uploadCenterUi';
import type {ImmutableUploadJob,UploadQueueSnapshot} from './uploadQueue';

function useUploadRuntime(){
 const[queue,setQueue]=useState<UploadQueueSnapshot>(()=>uploadQueueSnapshot()),[telemetry,setTelemetry]=useState(()=>uploadTelemetrySnapshot());
 useEffect(()=>{const offQ=subscribeUploadQueue(setQueue),offT=subscribeUploadTelemetry(setTelemetry);return()=>{offQ();offT()}},[]);
 return{queue,telemetry};
}
function localClock(iso?:string){if(!iso)return'—';const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'—'}
function videoName(spec?:ImmutableUploadJob,jobNumber?:number){const n=spec?.videoNumber??jobNumber;return n!=null?`VIDEO_${String(n).padStart(3,'0')}`:'UPLOAD'}
function runningRecord(spec:ImmutableUploadJob,telemetry:UploadTelemetryRecord[]){return telemetry.find(x=>x.jobId===spec.jobId)}
function percentLabel(row?:UploadTelemetryRecord){return row?.percent==null?'—':`${Math.round(row.percent)}%`}
function etaLabel(row?:UploadTelemetryRecord){return row?.etaSeconds==null?'Расчёт времени…':`≈ ${formatDuration(row.etaSeconds)}`}

export function UploadCenterGlobal(){
 const[open,setOpen]=useState(()=>uploadCenterOpen());useEffect(()=>subscribeUploadCenterUi(setOpen),[]);if(!open)return null;return <UploadCenterModal/>;
}

function UploadCenterModal(){
 const{queue,telemetry}=useUploadRuntime(),channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs);const[clock,setClock]=useState(Date.now());useEffect(()=>{const id=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(id)},[]);
 const queueIds=new Set([...queue.running,...queue.queued].map(x=>x.spec.jobId));
 const orphanActive=telemetry.active.filter(x=>!queueIds.has(x.jobId));
 const activeCount=queue.running.length+orphanActive.length;
 return <div className="modalBackdrop uploadCenterBackdrop" onMouseDown={closeUploadCenter}><section className="uploadCenterModal" onMouseDown={e=>e.stopPropagation()}><div className="panelHead uploadCenterHead"><div><small>GLOBAL UPLOAD CENTER</small><h2>Загрузки YouTube</h2><p>Factual transfer telemetry. Переключение страниц и каналов не меняет destination уже созданного job.</p></div><div className="uploadCenterHeadStats"><span><small>Активные</small><b>{activeCount}</b></span><span><small>В очереди</small><b>{queue.queued.length}</b></span><button onClick={closeUploadCenter}>×</button></div></div><div className="uploadCenterRows">
 {queue.running.map(entry=>{const spec=entry.spec,row=runningRecord(spec,telemetry.active),elapsed=Math.max(0,(clock-Date.parse(row?.startedAt||entry.startedAt||spec.submittedAt))/1000);return <article className="uploadCenterRow running" key={entry.queueId}><div className="uploadIdentity"><small>{spec.channelName}</small><b>{videoName(spec)}</b><span>{spec.title||spec.projectId||spec.filePath.split('/').pop()}</span></div><div className="uploadProgressArea"><div className={`uploadProgressBar ${row?.indeterminate?'indeterminate':''}`}><i style={row?.percent==null?undefined:{width:`${row.percent}%`}}/></div><div className="uploadProgressFacts"><b>{percentLabel(row)}</b><span>{row?.totalBytes?`${formatUploadBytes(row.bytesUploaded)} / ${formatUploadBytes(row.totalBytes)}`:'Определение размера…'}</span><span>{formatUploadSpeed(row?.speedBps)}</span></div></div><div className="uploadTiming"><span><small>Прошло</small><b>{formatDuration(elapsed)}</b></span><span><small>Осталось</small><b>{etaLabel(row)}</b></span><span><small>Завершение</small><b>{row?.expectedFinishAt?`≈ ${localClock(row.expectedFinishAt)}`:'Расчёт времени…'}</b></span></div></article>})}
 {orphanActive.map(row=>{const job=jobs.find(j=>j.id===row.jobId),channel=channels.find(c=>c.id===(row.channelId||job?.channelId)),elapsed=Math.max(0,(clock-Date.parse(row.startedAt))/1000);return <article className="uploadCenterRow running" key={`active:${row.jobId}`}><div className="uploadIdentity"><small>{channel?.name||'YouTube upload'}</small><b>{videoName(undefined,job?.number)}</b><span>{job?.title||row.filePath.split('/').pop()||row.jobId}</span></div><div className="uploadProgressArea"><div className={`uploadProgressBar ${row.indeterminate?'indeterminate':''}`}><i style={row.percent==null?undefined:{width:`${row.percent}%`}}/></div><div className="uploadProgressFacts"><b>{percentLabel(row)}</b><span>{row.totalBytes?`${formatUploadBytes(row.bytesUploaded)} / ${formatUploadBytes(row.totalBytes)}`:'Определение размера…'}</span><span>{formatUploadSpeed(row.speedBps)}</span></div></div><div className="uploadTiming"><span><small>Прошло</small><b>{formatDuration(elapsed)}</b></span><span><small>Осталось</small><b>{etaLabel(row)}</b></span><span><small>Завершение</small><b>{row.expectedFinishAt?`≈ ${localClock(row.expectedFinishAt)}`:'Расчёт времени…'}</b></span></div></article>})}
 {queue.queued.map((entry,index)=><article className="uploadCenterRow queued" key={entry.queueId}><div className="uploadIdentity"><small>{entry.spec.channelName}</small><b>{videoName(entry.spec)}</b><span>{entry.spec.title||entry.spec.projectId}</span></div><div className="queuedState"><b>QUEUED</b><span>Позиция в очереди: {index+1}</span></div><div className="uploadTiming"><span><small>Отправлено в очередь</small><b>{localClock(entry.spec.submittedAt)}</b></span><span><small>Progress</small><b>после старта transfer</b></span></div></article>)}
 {queue.recent.map(entry=><article className={`uploadCenterRow terminal ${entry.state.toLowerCase()}`} key={entry.queueId}><div className="uploadIdentity"><small>{entry.spec.channelName}</small><b>{videoName(entry.spec)}</b><span>{entry.spec.title||entry.spec.projectId||entry.spec.filePath.split('/').pop()}</span></div><div className="queuedState"><b>{entry.state}</b><span>{entry.state==='FAILED'?(entry.error||'Ошибка загрузки'):'Загрузка завершена'}</span></div><div className="uploadTiming"><span><small>Завершено</small><b>{localClock(entry.finishedAt)}</b></span><span><small>Канал</small><b>{entry.spec.channelName}</b></span></div></article>)}
 {!activeCount&&!queue.queued.length&&!queue.recent.length&&<div className="uploadCenterEmpty"><strong>✓</strong><div><b>Активных загрузок нет</b><span>Historical UPLOADING status сам по себе не считается активным transfer.</span></div></div>}
 </div></section></div>;
}

export function GlobalUploadIndicator(){
 const{queue,telemetry}=useUploadRuntime();const total=queue.running.length+queue.queued.length+telemetry.active.filter(x=>!queue.running.some(r=>r.spec.jobId===x.jobId)).length;if(!total)return null;
 if(total===1&&queue.running.length===1){const entry=queue.running[0],row=runningRecord(entry.spec,telemetry.active);return <button className="globalUploadIndicator" onClick={openUploadCenter}><span>⬆</span><b>{entry.spec.channelName}</b><small>{row?.percent==null?'transfer':`${Math.round(row.percent)}%`}{row?.etaSeconds!=null?` · ≈ ${Math.ceil(row.etaSeconds/60)} мин`:''}</small></button>}
 return <button className="globalUploadIndicator" onClick={openUploadCenter}><span>⬆</span><b>{total} загрузки</b><small>{queue.running.length} active · {queue.queued.length} queued</small></button>;
}

export function DashboardUploadSummary(){
 const{queue,telemetry}=useUploadRuntime();const active=useMemo(()=>queue.running.map(x=>({entry:x,row:runningRecord(x.spec,telemetry.active)})),[queue,telemetry]);if(!active.length&&!queue.queued.length)return null;
 return <section className="panel dashboardUploads"><div className="panelHead"><div><small>АКТИВНЫЕ ЗАГРУЗКИ</small><h3>{active.length} активных{queue.queued.length?` • ${queue.queued.length} в очереди`:''}</h3></div><button onClick={openUploadCenter}>Открыть Upload Center →</button></div><div className="dashboardUploadRows">{active.slice(0,4).map(({entry,row})=><button key={entry.queueId} onClick={openUploadCenter}><span><small>{entry.spec.channelName}</small><b>{videoName(entry.spec)}</b></span><strong>{row?.percent==null?'…':`${Math.round(row.percent)}%`}</strong><em>{row?.etaSeconds==null?'Расчёт времени…':`≈ ${Math.ceil(row.etaSeconds/60)} мин`}</em></button>)}</div></section>;
}
