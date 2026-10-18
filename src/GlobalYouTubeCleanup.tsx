import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import type {UploadHistoryRecord} from './types';
import {ModalPortal} from './ModalPortal';
import {cleanupCandidateBytes,confirmedGlobalCleanupCandidates} from './postUploadCleanup';
import {executeGlobalCleanup} from './globalCleanupExecutor';
import {markHistorySourceState,markHistoryTrashed} from './storageLifecycle';
import {journal} from './activityJournalRuntime';
import {scanInventoryChannel} from './renderInventoryRuntime';

const gb=(bytes:number)=>bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GB`:bytes>=1024**2?`${(bytes/1024**2).toFixed(1)} MB`:`${Math.round(bytes/1024)} KB`;

type Snapshot={rows:UploadHistoryRecord[];loading:boolean;checkedAt?:string};

export function GlobalYouTubeCleanup(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),uploadHistory=useApp(s=>s.uploadHistory),settings=useApp(s=>s.settings),patchJob=useApp(s=>s.patchJob),replaceUploadHistory=useApp(s=>s.replaceUploadHistory),toast=useApp(s=>s.toast);
 const [snapshot,setSnapshot]=useState<Snapshot>({rows:[],loading:true}),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[lastResult,setLastResult]=useState<{moved:number;failed:number}|null>(null);
 const signature=useMemo(()=>uploadHistory.map(x=>`${x.id}:${x.sourceLifecycle||''}:${x.processingState||''}:${x.trashedAt||''}`).join('|')+'|'+jobs.map(x=>`${x.id}:${x.status}:${x.storageLifecycle||''}:${x.finalPath||''}`).join('|'),[uploadHistory,jobs]);

 const resolveRows=useCallback(async()=>{
  const [sessions,active]=await Promise.all([api.youtubeUploadSessions().catch(()=>[]),api.youtubeActiveUploads().catch(()=>[])]);
  const blockedJobs=[...sessions.map(x=>x.jobId),...active.map(x=>x.jobId)];
  const blockedPaths=sessions.map(x=>x.filePath);
  const proofs=confirmedGlobalCleanupCandidates(useApp.getState().uploadHistory,useApp.getState().jobs,blockedJobs,blockedPaths);
  const checked=await Promise.all(proofs.map(async row=>({row,status:await api.localSourceStatus(row.localFilePath).catch(()=>null)})));
  return checked.filter(x=>x.status?.exists&&x.status.isFile&&Number(x.status.size)===Number(x.row.fileSize)).map(x=>x.row);
 },[]);

 const refresh=useCallback(async()=>{
  setSnapshot(prev=>({...prev,loading:true}));
  const rows=await resolveRows().catch(()=>[]);
  setSnapshot({rows,loading:false,checkedAt:new Date().toISOString()});
 },[resolveRows]);
 useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),180);return()=>window.clearTimeout(timer)},[signature,refresh]);

 const bytes=cleanupCandidateBytes(snapshot.rows),channelCounts=useMemo(()=>{
  const map=new Map<string,number>();for(const row of snapshot.rows)map.set(row.channelId,(map.get(row.channelId)||0)+1);return map
 },[snapshot.rows]);
 const channelName=(id:string)=>channels.find(c=>c.id===id)?.name||id;
 const allowedRoots=(row:UploadHistoryRecord)=>{const channel=channels.find(c=>c.id===row.channelId);return[channel?.renderFolderPath,settings.renderRootPath].filter((x):x is string=>Boolean(x&&x.trim())).filter((x,i,a)=>a.indexOf(x)===i)};

 async function moveToTrash(){
  if(busy||!snapshot.rows.length)return;setBusy(true);setLastResult(null);
  const operationId=`global-youtube-cleanup:${Date.now()}`;
  try{
   // Re-resolve immediately before mutation so a newly started resumable/active upload blocks cleanup.
   const current=await resolveRows();const selected=new Set(snapshot.rows.map(x=>x.id));const rows=current.filter(x=>selected.has(x.id));
   const result=await executeGlobalCleanup(rows,{
    localStatus:path=>api.localSourceStatus(path),
    fingerprint:async path=>{const fp=await api.youtubeFileFingerprint(path);return{fingerprint:fp.fingerprint,size:fp.size}},
    trash:(path,roots)=>api.trashLocalFile(path,roots),
    allowedRoots
   });
   let next=[...useApp.getState().uploadHistory];const changedChannels=new Set<string>();
   for(const item of result.rows){
    const row=item.record,at=new Date().toISOString();
    if(item.status==='MOVED'){
     next=markHistoryTrashed(next,row.jobId,at,operationId);patchJob(row.jobId,{storageLifecycle:'TRASHED_BY_VYRON',removedFromPublishList:true});changedChannels.add(row.channelId);
     journal({eventId:`${operationId}:${row.id}`,eventType:'SOURCE_TRASHED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:at,operationId,batchId:operationId,channelId:row.channelId,channelName:channelName(row.channelId),profileId:row.profileId,jobId:row.jobId,youtubeVideoId:row.youtubeVideoId,localSourcePath:row.localFilePath,details:{fileSize:row.fileSize,permanentDelete:false,globalCleanup:true}})
    }else if(item.status==='MISSING')next=markHistorySourceState(next,row.id,'MISSING_LEGACY_UNKNOWN',at);
    else if(item.status==='SOURCE_CHANGED')next=markHistorySourceState(next,row.id,'SOURCE_CHANGED',at);
   }
   replaceUploadHistory(next);
   await Promise.all(Array.from(changedChannels,id=>scanInventoryChannel(id,'cleanup').catch(()=>undefined)));
   setLastResult({moved:result.moved,failed:result.failed});
   if(result.failed)toast(`Очистка: в Корзину ${result.moved} • не перемещено ${result.failed}`);else toast(`✓ ${result.moved} видео перемещено в Корзину macOS`);
   await refresh();
  }catch(error){toast(`Глобальная очистка: ${String(error)}`)}finally{setBusy(false)}
 }

 return <>
  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'8px 12px',border:'1px solid var(--border)',borderRadius:12,margin:'0 0 10px'}} data-testid="global-youtube-cleanup">
   <div style={{minWidth:160,flex:'1 1 auto'}}><small>ОЧИСТКА ДИСКА • ВСЕ КАНАЛЫ</small><div><b>{snapshot.loading?'Проверяю…':snapshot.rows.length?`${snapshot.rows.length} видео • ${gb(bytes)}`:'Нет загруженных файлов для очистки'}</b></div>{!snapshot.loading&&snapshot.rows.length>0&&<small>{channelCounts.size} каналов • только YouTube READY</small>}</div>
   <button disabled={snapshot.loading||!snapshot.rows.length||busy} onClick={()=>setOpen(true)}>Посмотреть</button>
   <button className="primary" disabled={snapshot.loading||!snapshot.rows.length||busy} onClick={()=>setOpen(true)}>В Корзину</button>
  </div>
  {open&&<ModalPortal onClose={()=>!busy&&setOpen(false)} closeOnBackdrop={!busy} closeOnEscape={!busy}><section className="confirmModal" style={{maxWidth:960,maxHeight:'86vh',overflow:'auto'}} onMouseDown={e=>e.stopPropagation()}>
   <small>ГОТОВО К ОЧИСТКЕ</small><h2>{snapshot.rows.length} видео • {gb(bytes)} • {channelCounts.size} каналов</h2>
   <p>Все строки подтверждены локальным upload ledger, имеют YouTube video ID, состояние <b>READY</b>, проверенный upload-time fingerprint и существующий локальный файл. Файлы будут перемещены в системную Корзину. Безвозвратного удаления нет.</p>
   <div style={{display:'grid',gap:4,margin:'12px 0'}}>{Array.from(channelCounts.entries()).sort((a,b)=>channelName(a[0]).localeCompare(channelName(b[0]))).map(([id,count])=><div key={id}><b>{channelName(id)}</b> — {count}</div>)}</div>
   <details open><summary>Посмотреть файлы</summary><div style={{overflowX:'auto'}}><table style={{width:'100%',fontSize:12}}><thead><tr><th>Канал</th><th>Файл</th><th>Размер</th><th>YouTube ID</th><th>Состояние</th></tr></thead><tbody>{snapshot.rows.map(row=><tr key={row.id}><td>{channelName(row.channelId)}</td><td title={row.localFilePath}>{row.originalFilename||row.localFilePath}</td><td>{gb(row.fileSize)}</td><td>{row.youtubeVideoId}</td><td>{row.processingState}</td></tr>)}</tbody></table></div></details>
   {lastResult&&<p><b>Последняя операция:</b> перемещено {lastResult.moved} • не перемещено {lastResult.failed}</p>}
   <footer><button disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button className="primary" disabled={busy||!snapshot.rows.length} onClick={()=>void moveToTrash()}>{busy?'Проверяю и перемещаю…':`Переместить ${snapshot.rows.length} видео в Корзину`}</button></footer>
  </section></ModalPortal>}
 </>;
}
