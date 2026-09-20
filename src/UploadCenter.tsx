import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {api} from './api';
import {cleanupEligibleUpload,markHistoryTrashed} from './storageLifecycle';
import {cleanupPreclassification,effectiveSourceLifecycle} from './activityJournalCore';
import {journal} from './activityJournalRuntime';
import {notifyError,notifySuccess,notifyWarning} from './notificationCenter';
import {removeQueuedUpload,subscribeUploadQueue,uploadQueueSnapshot} from './uploadQueueRuntime';
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
 const{queue,telemetry}=useUploadRuntime(),channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),history=useApp(s=>s.uploadHistory),settings=useApp(s=>s.settings),fingerprints=useApp(s=>s.fingerprintCache),replaceUploadHistory=useApp(s=>s.replaceUploadHistory);
 const[clock,setClock]=useState(Date.now()),[cleanupOpen,setCleanupOpen]=useState(false),[cleanupBusy,setCleanupBusy]=useState(false),[sourceScanBusy,setSourceScanBusy]=useState(false);
 useEffect(()=>{const id=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(id)},[]);
 const queueIds=new Set([...queue.running,...queue.queued].map(x=>x.spec.jobId));
 const orphanActive=telemetry.active.filter(x=>!queueIds.has(x.jobId));
 const activeCount=queue.running.length+orphanActive.length;
 const succeeded=queue.recent.filter(x=>x.state==='SUCCEEDED'),failed=queue.recent.filter(x=>x.state==='FAILED');
 const batchTotal=queue.queued.length+queue.running.length+queue.recent.length;
 const batchDone=succeeded.length+failed.length;
 const cleanup=cleanupPreclassification(history,jobs),cleanupCandidates=cleanup.eligible.filter(x=>cleanupEligibleUpload(x,jobs.find(j=>j.id===x.jobId)));
 const processingKept=cleanup.processing.length;
 const failedSources=jobs.filter(x=>x.status==='ERROR'&&x.finalPath&&x.storageLifecycle!=='TRASHED').length;
 const persisted=history.slice().reverse().slice(0,12);
 async function scanLocalSources(){
  if(sourceScanBusy)return;setSourceScanBusy(true);
  try{
   const current=useApp.getState().uploadHistory,next=[...current];
   for(let i=0;i<next.length;i++){
    const row=next[i],at=new Date().toISOString(),prev=effectiveSourceLifecycle(row);
    if(row.trashedAt||row.sourceLifecycle==='TRASHED_BY_VYRON'){next[i]={...row,sourceLifecycle:'TRASHED_BY_VYRON',sourceCheckedAt:at};continue}
    if(!row.localFilePath){next[i]={...row,sourceLifecycle:'MISSING_LEGACY_UNKNOWN',sourceCheckedAt:at};continue}
    try{
     const st=await api.localSourceStatus(row.localFilePath);
     const source=!st.exists||!st.isFile?'MISSING_LEGACY_UNKNOWN':row.fileSize>0&&st.size!=null&&Number(st.size)!==Number(row.fileSize)?'SOURCE_CHANGED':'PRESENT';
     next[i]={...row,sourceLifecycle:source,sourceCheckedAt:at};
     if(prev!==source)journal({eventId:'source-state:'+row.id+':'+source,eventType:source==='PRESENT'?'SOURCE_RECOVERED':'SOURCE_MISSING',status:'INFO',source:'LIVE_OPERATION',timestamp:at,channelId:row.channelId,channelName:channels.find(c=>c.id===row.channelId)?.name,profileId:row.profileId,jobId:row.jobId,youtubeVideoId:row.youtubeVideoId,localSourcePath:row.localFilePath,details:{sourceLifecycle:source,evidence:'filesystem stat'}});
    }catch{next[i]={...row,sourceLifecycle:'MISSING_LEGACY_UNKNOWN',sourceCheckedAt:at}}
   }
   replaceUploadHistory(next);
  }finally{setSourceScanBusy(false)}
 }
 useEffect(()=>{void scanLocalSources()},[]);
 async function trashVerified(){
  if(cleanupBusy)return;setCleanupBusy(true);
  const trashOperationId=`cleanup-batch:${Date.now()}`;let moved=0,alreadyMissing=0,notReady=0,changed=0,verifyFailed=0;
  try{
   let nextHistory=[...useApp.getState().uploadHistory];
   for(const record of cleanupCandidates){
    const job=useApp.getState().jobs.find(j=>j.id===record.jobId),channel=channels.find(c=>c.id===record.channelId);
    if(!cleanupEligibleUpload(record,job)){verifyFailed++;continue}
    journal({eventId:trashOperationId+':requested:'+record.id,eventType:'SOURCE_TRASH_REQUESTED',status:'STARTED',source:'LIVE_OPERATION',operationId:trashOperationId,batchId:trashOperationId,channelId:record.channelId,channelName:channel?.name,profileId:record.profileId,jobId:record.jobId,youtubeVideoId:record.youtubeVideoId,localSourcePath:record.localFilePath,details:{filename:record.originalFilename}});
    try{
     const processing=await api.youtubeVideoProcessingStatus(record.profileId!,record.youtubeVideoId,`${trashOperationId}:verify:${record.jobId}`);
     const idx=nextHistory.findIndex(x=>x.id===record.id),checkedAt=processing.processingCheckedAt||new Date().toISOString();
     if(idx>=0)nextHistory[idx]={...nextHistory[idx],remoteExists:true,remoteCheckedAt:checkedAt,processingState:processing.processingState,processingCheckedAt:checkedAt,identityVerifiedAt:processing.identityVerified?checkedAt:nextHistory[idx].identityVerifiedAt};
     if(processing.processingState!=='READY'||!processing.identityVerified){notReady++;continue}
     const local=await api.localSourceStatus(record.localFilePath);
     if(!local.exists||!local.isFile){
      alreadyMissing++;if(idx>=0)nextHistory[idx]={...nextHistory[idx],sourceLifecycle:'MISSING_LEGACY_UNKNOWN',sourceCheckedAt:new Date().toISOString()};
      journal({eventId:trashOperationId+':missing:'+record.id,eventType:'SOURCE_MISSING',status:'INFO',source:'LIVE_OPERATION',operationId:trashOperationId,batchId:trashOperationId,channelId:record.channelId,channelName:channel?.name,profileId:record.profileId,jobId:record.jobId,youtubeVideoId:record.youtubeVideoId,localSourcePath:record.localFilePath,details:{reason:'already missing before Trash',filename:record.originalFilename}});continue
     }
     const cached=useApp.getState().fingerprintCache[record.localFilePath];
     const fp=await api.youtubeFileFingerprint(record.localFilePath,cached?{size:cached.size,mtimeMs:cached.mtimeMs,sha256:cached.sha256}:undefined);
     if(fp.fingerprint.toLowerCase()!==record.sha256.toLowerCase()||fp.size!==record.fileSize){
      changed++;if(idx>=0)nextHistory[idx]={...nextHistory[idx],sourceLifecycle:'SOURCE_CHANGED',sourceCheckedAt:new Date().toISOString()};continue
     }
     const roots=[settings.workspace,record.sourceProjectPath||''].filter(Boolean);
     const result=await api.trashLocalFile(record.localFilePath,roots);
     if(!result.trashed){
      if(result.missing){alreadyMissing++;if(idx>=0)nextHistory[idx]={...nextHistory[idx],sourceLifecycle:'MISSING_LEGACY_UNKNOWN',sourceCheckedAt:new Date().toISOString()};continue}
      verifyFailed++;continue
     }
     const now=new Date().toISOString();nextHistory=markHistoryTrashed(nextHistory,record.jobId,now,trashOperationId);
     if(job)useApp.getState().patchJob(record.jobId,{storageLifecycle:'TRASHED_BY_VYRON'});
     journal({eventId:trashOperationId+':trashed:'+record.id,eventType:'SOURCE_TRASHED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:now,operationId:trashOperationId,batchId:trashOperationId,channelId:record.channelId,channelName:channel?.name,profileId:record.profileId,jobId:record.jobId,youtubeVideoId:record.youtubeVideoId,localSourcePath:record.localFilePath,details:{filename:record.originalFilename,permanentDelete:false}});
     moved++;
    }catch{verifyFailed++}
   }
   replaceUploadHistory(nextHistory);
   if(moved)notifySuccess('Локальные исходники перемещены в Корзину',`${moved} файлов • permanent delete: NO.`,{operationId:trashOperationId});
   const skipped=alreadyMissing+notReady+changed+verifyFailed;
   if(skipped)notifyWarning('Часть файлов не тронута',`Уже отсутствуют: ${alreadyMissing} • YouTube не READY: ${notReady} • изменены: ${changed} • проверка не прошла: ${verifyFailed}. Повторных CLEANUP_NOT_READY уведомлений по каждому файлу нет.`,{operationId:trashOperationId+':summary'});
   setCleanupOpen(false)
  }finally{setCleanupBusy(false)}
 }
 return <><div className="modalBackdrop uploadCenterBackdrop" onMouseDown={closeUploadCenter}><section className="uploadCenterModal" onMouseDown={e=>e.stopPropagation()}>
  <div className="panelHead uploadCenterHead"><div><small>GLOBAL UPLOAD CENTER</small><h2>Загрузки YouTube</h2><p>Только фактические bytes/chunks. Upload accepted и YouTube processing READY — разные состояния.</p></div><div className="uploadCenterHeadStats"><span><small>В очереди</small><b>{queue.queued.length}</b></span><span><small>Загружаются</small><b>{activeCount}</b></span><span><small>Успешно</small><b>{succeeded.length}</b></span><span><small>Ошибки</small><b>{failed.length}</b></span><button onClick={closeUploadCenter}>×</button></div></div>
  {batchTotal>0&&<div className="syncAudit"><span>Batch <b>{batchDone}/{batchTotal}</b></span><span>Осталось <b>{queue.queued.length+queue.running.length}</b></span><span>Processing source kept <b>{processingKept}</b></span><span>Failed source kept <b>{failedSources}</b></span></div>}
  {!activeCount&&!queue.queued.length&&queue.recent.length>0&&<div className={failed.length?'publisherNotice':'successBox'}><b>Загрузка партии завершена</b><p>Успешно: {succeeded.length} • Ошибки: {failed.length}. Processing/failed файлы автоматически не удаляются.</p></div>}
  <div className="uploadCenterRows">
  {queue.running.map(entry=>{const spec=entry.spec,row=runningRecord(spec,telemetry.active),elapsed=Math.max(0,(clock-Date.parse(row?.startedAt||entry.startedAt||spec.submittedAt))/1000);return <article className="uploadCenterRow running" key={entry.queueId}><div className="uploadIdentity"><small>{spec.channelName}</small><b>{videoName(spec)}</b><span>{spec.filePath.split('/').pop()} • {spec.title}</span></div><div className="uploadProgressArea"><div className={`uploadProgressBar ${row?.indeterminate?'indeterminate':''}`}><i style={row?.percent==null?undefined:{width:`${row.percent}%`}}/></div><div className="uploadProgressFacts"><b>{percentLabel(row)}</b><span>{row?.totalBytes?`${formatUploadBytes(row.bytesUploaded)} / ${formatUploadBytes(row.totalBytes)}`:'Определение размера…'}</span><span>{formatUploadSpeed(row?.speedBps)}</span></div></div><div className="uploadTiming"><span><small>Прошло</small><b>{formatDuration(elapsed)}</b></span><span><small>Осталось</small><b>{etaLabel(row)}</b></span><span><small>Завершение</small><b>{row?.expectedFinishAt?`≈ ${localClock(row.expectedFinishAt)}`:'Расчёт времени…'}</b></span></div></article>})}
  {orphanActive.map(row=>{const job=jobs.find(j=>j.id===row.jobId),channel=channels.find(c=>c.id===(row.channelId||job?.channelId)),elapsed=Math.max(0,(clock-Date.parse(row.startedAt))/1000);return <article className="uploadCenterRow running" key={`active:${row.jobId}`}><div className="uploadIdentity"><small>{channel?.name||'YouTube upload'}</small><b>{videoName(undefined,job?.number)}</b><span>{row.filePath.split('/').pop()} • {job?.title||row.jobId}</span></div><div className="uploadProgressArea"><div className={`uploadProgressBar ${row.indeterminate?'indeterminate':''}`}><i style={row.percent==null?undefined:{width:`${row.percent}%`}}/></div><div className="uploadProgressFacts"><b>{percentLabel(row)}</b><span>{row.totalBytes?`${formatUploadBytes(row.bytesUploaded)} / ${formatUploadBytes(row.totalBytes)}`:'Определение размера…'}</span><span>{formatUploadSpeed(row.speedBps)}</span></div></div><div className="uploadTiming"><span><small>Прошло</small><b>{formatDuration(elapsed)}</b></span><span><small>Осталось</small><b>{etaLabel(row)}</b></span><span><small>Завершение</small><b>{row.expectedFinishAt?`≈ ${localClock(row.expectedFinishAt)}`:'Расчёт времени…'}</b></span></div></article>})}
  {queue.queued.map((entry,index)=><article className="uploadCenterRow queued" key={entry.queueId}><div className="uploadIdentity"><small>{entry.spec.channelName}</small><b>{videoName(entry.spec)}</b><span>{entry.spec.filePath.split('/').pop()} • {entry.spec.title}</span></div><div className="queuedState"><b>QUEUED</b><span>Позиция: {index+1}</span><button onClick={()=>removeQueuedUpload(entry.spec.jobId)}>Убрать из очереди</button></div><div className="uploadTiming"><span><small>Отправлено</small><b>{localClock(entry.spec.submittedAt)}</b></span><span><small>Progress</small><b>после старта transfer</b></span></div></article>)}
  {queue.recent.map(entry=>{const job=jobs.find(j=>j.id===entry.spec.jobId),ok=entry.state==='SUCCEEDED';return <article className={`uploadCenterRow ${ok?'done':'error'}`} key={entry.queueId}><div className="uploadIdentity"><small>{entry.spec.channelName}</small><b>{videoName(entry.spec)}</b><span>{entry.spec.filePath.split('/').pop()}</span></div><div className="queuedState"><b>{ok?'✓ UPLOAD COMPLETED':'❌ НЕ ЗАГРУЖЕНО'}</b><span>{job?.youtubeVideoId?`YouTube video ID: ${job.youtubeVideoId}`:entry.error||job?.error||'Ошибка загрузки'}</span><span>{job?.uploadedAt?`Завершено: ${new Date(job.uploadedAt).toLocaleString('ru-RU')}`:''}</span><span>{job?.publishAt?`Scheduled: ${new Date(job.publishAt).toLocaleString('ru-RU')}`:''}</span><span>YouTube processing: {job?.processingState||'не подтверждено'}</span></div></article>})}
  {!activeCount&&!queue.queued.length&&!queue.recent.length&&<div className="uploadCenterEmpty"><strong>✓</strong><div><b>Активных загрузок нет</b><span>История ниже сохраняется после перезапуска.</span></div></div>}
  </div>
  {persisted.length>0&&<section className="panel"><div className="panelHead"><div><small>PERSISTED UPLOAD HISTORY</small><h3>Последние загрузки</h3></div><div className="headerActions"><button disabled={sourceScanBusy} onClick={()=>void scanLocalSources()}>{sourceScanBusy?'Проверяю…':'Проверить локальные файлы'}</button>{cleanupCandidates.length>0&&<button onClick={()=>setCleanupOpen(true)}>Очистить безопасные • {cleanupCandidates.length}</button>}</div></div>{persisted.map(x=><div className="actionRow" key={x.id}><div><b>{x.titleAtUpload||x.originalFilename}</b><small>{x.youtubeVideoId} • {new Date(x.uploadedAt).toLocaleString('ru-RU')}</small><small>YouTube: {x.remoteExists===false?'REMOTE MISSING':x.processingState||'UPLOAD_ACCEPTED'} • Local: {effectiveSourceLifecycle(x)}</small></div><em>{x.trashedAt?'TRASHED_BY_VYRON':x.sourceLifecycle||'UNKNOWN'}</em></div>)}</section>}
 </section></div>
 {cleanupOpen&&<div className="modalBackdrop" onMouseDown={()=>!cleanupBusy&&setCleanupOpen(false)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>SAFE LOCAL CLEANUP</small><h2>В Корзину попадут только безопасные исходники</h2><p>До операции VYRON уже исключил predictable non-candidates. Перед каждым Trash выполняется повторная YouTube READY + identity + fingerprint проверка.</p><div className="syncAudit"><span>Eligible <b>{cleanupCandidates.length}</b></span><span>Already missing <b>{cleanup.alreadyMissing.length}</b></span><span>Still processing <b>{cleanup.processing.length}</b></span><span>Source changed <b>{cleanup.changed.length}</b></span><span>Verification pending <b>{cleanup.verification.length}</b></span><span>Already trashed <b>{cleanup.trashed.length}</b></span></div><div className="errorCenterRows">{cleanupCandidates.map(x=><article key={x.id}><b>{x.originalFilename}</b><small>{x.youtubeVideoId} • READY • PRESENT</small></article>)}</div><footer><button disabled={cleanupBusy} onClick={()=>setCleanupOpen(false)}>Оставить всё</button><button className="primary" disabled={cleanupBusy||!cleanupCandidates.length} onClick={()=>void trashVerified()}>{cleanupBusy?'Проверяю…':`Переместить ${cleanupCandidates.length} файлов в Корзину`}</button></footer></section></div>}
 </>;
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
