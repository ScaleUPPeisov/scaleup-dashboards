import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import {scanInventoryChannel} from './renderInventoryRuntime';
import {ownerInventoryForChannel,refreshStaleOwnerInventories} from './youtubeOwnerInventory';
import {refreshYoutubeChannelStatisticsSelection} from './youtubeChannelStatsRuntime';
import {configureUploadQueue,enqueueUpload,uploadQueueHasActiveJob} from './uploadQueueRuntime';
import {globalDailyUploadStatus,safeDailyStatus} from './youtubePublishSafety';
import {youtubeQuotaProjectIdentity} from './youtubeQuota';
import {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';
import type {Channel,YoutubeProfile} from './types';

type Action='scan'|'oauth'|'youtube'|'stats'|'queue'|'metadata';

function ownerSyncEstimate(channelId:string){
 const x=ownerInventoryForChannel(channelId),n=x.available?x.total:50,pages=Math.max(1,Math.ceil(n/50)),hydrate=n?Math.ceil(n/50):0;
 return 1+pages+hydrate
}

export function BatchControl(){
 const channels=useApp(s=>s.channels).filter(c=>c.enabled!==false),jobs=useApp(s=>s.jobs),patchJob=useApp(s=>s.patchJob),settings=useApp(s=>s.settings);
 const [selected,setSelected]=useState<string[]>([]),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[googleConfig,setGoogleConfig]=useState<any>(),[busy,setBusy]=useState<Action|null>(null),[expanded,setExpanded]=useState(false);
 useEffect(()=>{let live=true;void Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig().catch(()=>null)]).then(([p,g])=>{if(live){setProfiles(p);setGoogleConfig(g)}}).catch(()=>{});return()=>{live=false}},[channels.map(c=>c.youtubeProfileId||'').join('|')]);
 const selectedChannels=useMemo(()=>channels.filter(c=>selected.includes(c.id)),[channels,selected]);
 const profileById=useMemo(()=>new Map(profiles.map(p=>[p.id,p])),[profiles]);
 const connected=selectedChannels.filter(c=>{const p=c.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined;return Boolean(p?.channelId&&c.youtubeChannelId===p.channelId)});
 const readyJobs=useMemo(()=>jobs.filter(j=>{
   if(!selected.includes(j.channelId)||j.status!=='READY_UPLOAD'||!j.finalPath||j.youtubeVideoId||uploadQueueHasActiveJob(j.id))return false;
   if(!j.title?.trim()||!j.description?.trim()||!j.tags?.length||!j.publishAt||Date.parse(j.publishAt)<=Date.now())return false;
   const c=channels.find(x=>x.id===j.channelId),p=c?.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined;
   return Boolean(c?.youtubeChannelId&&p?.channelId===c.youtubeChannelId)
 }),[jobs,selected,channels,profiles]);
 const renderFolders=selectedChannels.filter(c=>Boolean(c.renderFolderPath)).length;
 const syncUnits=selectedChannels.reduce((n,c)=>n+ownerSyncEstimate(c.id),0);
 const statsMaxUnits=connected.length;
 const queueGeneralUnits=readyJobs.length*2;
 const globalRemaining=globalDailyUploadStatus().remaining;
 const toggle=(id:string)=>setSelected(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);
 const selectAll=()=>setSelected(x=>x.length===channels.length?[]:channels.map(c=>c.id));
 async function run(action:Action){
  if(busy||!selectedChannels.length)return;setBusy(action);
  try{
   if(action==='scan'){
    for(const c of selectedChannels)await scanInventoryChannel(c.id,'manual-channel');
    notifySuccess('Batch: Render проверен',selectedChannels.length+' каналов • YouTube API: 0 units.');
   }else if(action==='oauth'){
    const states=await api.youtubeOauthCredentialStates(),map=new Map(states.profiles.map(x=>[x.profileUuid,x.credentialState]));
    const ready=selectedChannels.filter(c=>c.youtubeProfileId&&map.get(c.youtubeProfileId)==='READY').length;
    const attention=selectedChannels.filter(c=>c.youtubeProfileId&&map.get(c.youtubeProfileId)!=='READY').length;
    notifyInfo('Batch: OAuth state',`READY: ${ready} • требуют внимания: ${attention} • YouTube API: 0 units.`);
   }else if(action==='youtube'){
    const r=await refreshStaleOwnerInventories(selectedChannels,true);
    if(r.failed)notifyWarning('Batch: YouTube sync частично завершён',`Обновлено: ${r.updated} • ошибок: ${r.failed} • запросов каналов: ${r.requested}.`);
    else notifySuccess('Batch: YouTube sync завершён',`Обновлено каналов: ${r.updated} • estimated preview: ≈${syncUnits} general units.`);
   }else if(action==='stats'){
    const r=await refreshYoutubeChannelStatisticsSelection(selectedChannels.map(c=>c.id),true);
    if(r.failed||r.credentialBlocked)notifyWarning('Batch: Statistics частично обновлена',`Обновлено: ${r.updated} • ошибок: ${r.failed} • OAuth blocked: ${r.credentialBlocked} • actual: ${r.quotaUnits} units.`);
    else notifySuccess('Batch: Statistics обновлена',`${r.updated} каналов • ${r.apiRequests} API requests • actual ${r.quotaUnits} units.`);
   }else if(action==='metadata'){
    let updated=0,failed=0;
    for(const j of jobs.filter(x=>selected.includes(x.channelId)&&Boolean(x.folder)&&x.status!=='UPLOADING'&&x.status!=='SCHEDULED')){
     const c=channels.find(x=>x.id===j.channelId);if(!c||!j.folder)continue;
     try{patchJob(j.id,await api.refreshJob(j.folder,c.minTracks));updated++}catch{failed++}
    }
    if(failed)notifyWarning('Batch: Metadata обновлена частично',`Проектов обновлено: ${updated} • ошибок: ${failed} • YouTube API: 0.`);
    else notifySuccess('Batch: Metadata обновлена',`Проектов: ${updated} • YouTube API: 0.`);
   }else if(action==='queue'){
    if(!readyJobs.length){notifyWarning('Batch: нечего ставить в очередь','Нужны READY_UPLOAD + final.mp4 + title/description/tags + будущий publishAt + READY OAuth.');return}
    configureUploadQueue(settings.youtubeUploadConcurrency||2,settings.youtubeUploadPerChannelConcurrency||1);
    const batchId='batch-control:'+Date.now(),perChannelUsed=new Map<string,number>();let queued=0,blocked=0;
    for(const j of readyJobs.slice(0,Math.max(0,globalRemaining))){
      const c=channels.find(x=>x.id===j.channelId),p=c?.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined;
      if(!c||!p||!j.finalPath||!j.publishAt){blocked++;continue}
      const localLimit=safeDailyStatus(c.id,c.safeDailyUploadLimit),used=perChannelUsed.get(c.id)||0;
      if(localLimit.remaining!=null&&used>=localLimit.remaining){blocked++;continue}
      try{
       const st=await api.localSourceStatus(j.finalPath);if(!st.exists||!st.isFile)throw new Error('LOCAL_FILE_REQUIRED');
       const cache=useApp.getState().fingerprintCache[j.finalPath];
       const fp=await api.youtubeFileFingerprint(j.finalPath,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);
       const project=youtubeQuotaProjectIdentity(p,googleConfig);
       enqueueUpload({
        jobId:j.id,batchId,localVideoIdentity:c.id+':'+j.id+':'+fp.fingerprint,videoNumber:j.number,
        channelId:c.id,channelName:c.name,profileId:p.id,youtubeChannelId:c.youtubeChannelId,filePath:j.finalPath,
        fingerprint:fp.fingerprint,fileSize:fp.size,modifiedAt:fp.modifiedAt,publishAt:j.publishAt,title:j.title,
        description:j.description,tags:[...j.tags],categoryId:settings.youtubeCategoryId||'10',metadataSource:j.metadataSource||'existing',
        quotaProjectKey:project.projectKey||undefined,
        quotaOperations:[{method:'videos.insert',count:1,label:'Загрузка видео'},{method:'videos.list',count:2,label:'Проверка видео / processing'}],
        allowDuplicate:false,submittedAt:new Date().toISOString()
       });
       perChannelUsed.set(c.id,used+1);queued++;
      }catch{blocked++}
    }
    if(queued)notifySuccess('Batch: добавлено в очередь',`${queued} видео • ${selectedChannels.length} выбранных каналов • общий лимит VYRON сохранён.`);
    if(blocked)notifyWarning('Batch: часть видео не добавлена',`Заблокировано preflight: ${blocked}. Никаких duplicate upload не создано.`);
   }
  }catch(error){notifyError('Batch operation failed',String(error))}
  finally{setBusy(null)}
 }
 if(!channels.length)return null;
 return <section className="batchControl">
  <div className="batchControlHead"><div><small>BATCH CONTROL</small><h3>Массовые действия</h3><p>Выберите каналы. Перед сетевыми действиями видна оценка quota; локальные операции стоят 0 API.</p></div><button onClick={()=>setExpanded(x=>!x)}>{expanded?'Скрыть':'Открыть'}</button></div>
  {expanded&&<>
   <div className="batchPreview">
    <span><small>Выбрано</small><b>{selectedChannels.length}</b></span>
    <span><small>Render folders</small><b>{renderFolders} / {selectedChannels.length}</b></span>
    <span><small>READY для queue</small><b>{readyJobs.length}</b></span>
    <span><small>Sync YouTube</small><b>≈ {syncUnits} units</b></span>
    <span><small>Statistics</small><b>≤ {statsMaxUnits} units</b></span>
    <span><small>Queue verify</small><b>≈ {queueGeneralUnits} general + {readyJobs.length} uploads</b></span>
   </div>
   <div className="batchChannelPicker"><button className="batchAll" onClick={selectAll}>{selected.length===channels.length?'Снять все':'Выбрать все'}</button>{channels.map(c=><label key={c.id} className={selected.includes(c.id)?'selected':''}><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>toggle(c.id)}/><span>{c.name}</span></label>)}</div>
   <div className="batchActions">
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>void run('scan')}>{busy==='scan'?'Сканирую…':'Сканировать Render · 0 API'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>void run('oauth')}>{busy==='oauth'?'Проверяю…':'Проверить OAuth · 0 API'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>void run('youtube')}>{busy==='youtube'?'Синхронизирую…':'Синхронизировать YouTube'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>void run('stats')}>{busy==='stats'?'Обновляю…':'Обновить Statistics'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>void run('metadata')}>{busy==='metadata'?'Обновляю…':'Обновить Metadata · 0 API'}</button>
    <button className="primary" disabled={!selected.length||!readyJobs.length||Boolean(busy)||globalRemaining<=0} onClick={()=>void run('queue')}>{busy==='queue'?'Ставлю…':`Добавить в очередь · ${Math.min(readyJobs.length,globalRemaining)}`}</button>
   </div>
  </>}
 </section>
}
