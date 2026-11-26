import React,{useEffect,useMemo,useState} from 'react';
import {ModalPortal} from './ModalPortal';
import {api} from './api';
import {useApp} from './store';
import {scanInventoryChannel} from './renderInventoryRuntime';
import {ownerInventoryForChannel,refreshStaleOwnerInventories} from './youtubeOwnerInventory';
import {refreshYoutubeChannelStatisticsSelection} from './youtubeChannelStatsRuntime';
import {configureUploadQueue,enqueueUpload,uploadQueueHasActiveJob} from './uploadQueueRuntime';
import {globalDailyUploadStatus,safeDailyStatus} from './youtubePublishSafety';
import {youtubeQuotaProjectIdentity} from './youtubeQuota';
import {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';
import type {Channel,VideoJob,YoutubeProfile} from './types';
import {batchJobStillMatches,isFuturePublishAt} from './batchUploadSafety';
import './apex-batch.css';

type Action='scan'|'oauth'|'youtube'|'stats'|'queue'|'metadata';
type ChannelBinding={channelId:string;profileId:string;youtubeChannelId:string};
let batchExecutionPromise:Promise<void>|null=null;

function ownerSyncEstimate(channelId:string){
 const x=ownerInventoryForChannel(channelId),n=x.available?x.total:50,pages=Math.max(1,Math.ceil(n/50)),hydrate=n?Math.ceil(n/50):0;
 return 1+pages+hydrate
}

export function BatchControl(){
 const channels=useApp(s=>s.channels).filter(c=>c.enabled!==false),jobs=useApp(s=>s.jobs),patchJob=useApp(s=>s.patchJob),settings=useApp(s=>s.settings);
 const [selected,setSelected]=useState<string[]>([]),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[googleConfig,setGoogleConfig]=useState<any>(),[busy,setBusy]=useState<Action|null>(null),[expanded,setExpanded]=useState(false),[pending,setPending]=useState<{action:Action;channelIds:string[];jobs?:VideoJob[];bindings?:ChannelBinding[]}|null>(null),[queueConfirmed,setQueueConfirmed]=useState(false);
 useEffect(()=>{let live=true;void Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig().catch(()=>null)]).then(([p,g])=>{if(live){setProfiles(p);setGoogleConfig(g)}}).catch(()=>{});return()=>{live=false}},[channels.map(c=>c.youtubeProfileId||'').join('|')]);
 const [quantities,setQuantities]=useState<Record<string,number>>({}),[excluded,setExcluded]=useState<string[]>([]),[query,setQuery]=useState('');
 const selectedChannels=useMemo(()=>channels.filter(c=>selected.includes(c.id)),[channels,selected]);
 const profileById=useMemo(()=>new Map(profiles.map(p=>[p.id,p])),[profiles]);
 const connected=selectedChannels.filter(c=>{const p=c.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined;return Boolean(p?.channelId&&c.youtubeChannelId===p.channelId)});
 const readyJobs=useMemo(()=>jobs.filter(j=>{
   if(j.status!=='READY_UPLOAD'||!j.finalPath||j.youtubeVideoId||uploadQueueHasActiveJob(j.id))return false;
   if(!j.title?.trim()||!j.description?.trim()||!j.tags?.length||!isFuturePublishAt(j.publishAt))return false;
   const c=channels.find(x=>x.id===j.channelId),p=c?.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined;
   return Boolean(c?.youtubeChannelId&&p?.channelId===c.youtubeChannelId)
 }),[jobs,channels,profiles]);
 const readyByChannel=useMemo(()=>{const result=new Map<string,VideoJob[]>();for(const j of readyJobs){const list=result.get(j.channelId)||[];list.push(j);result.set(j.channelId,list)}return result},[readyJobs]);
 const chosenJobs=selectedChannels.flatMap(c=>{const candidates=(readyByChannel.get(c.id)||[]).filter(j=>!excluded.includes(j.id));return candidates.slice(0,Math.min(candidates.length,quantities[c.id]??candidates.length))});
 const visibleChannels=channels.filter(c=>c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const setQuantity=(id:string,value:string)=>{const count=Number(value);setQuantities(prev=>({...prev,[id]:Number.isFinite(count)?Math.max(0,Math.min(readyByChannel.get(id)?.length||0,Math.floor(count))):0}))};
 const renderFolders=selectedChannels.filter(c=>Boolean(c.renderFolderPath)).length;
 const syncUnits=selectedChannels.reduce((n,c)=>n+ownerSyncEstimate(c.id),0);
 const statsMaxUnits=connected.length;
 const queueGeneralUnits=chosenJobs.length*2;
 const globalRemaining=globalDailyUploadStatus().remaining;
 const toggle=(id:string)=>setSelected(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);
 const selectAll=()=>setSelected(x=>x.length===channels.length?[]:channels.map(c=>c.id));
 function run(action:Action,lockedIds:string[]=selected,lockedJobs:VideoJob[]=[],allowRealQueue=false,lockedBindings:ChannelBinding[]=[]):Promise<void>{
  if(action==='queue'&&!allowRealQueue)return Promise.resolve();
  if(batchExecutionPromise)return batchExecutionPromise;
  const task=(async()=>{  const locked=new Set(lockedIds),batchChannels=channels.filter(c=>locked.has(c.id));
  const batchReadyJobs=lockedJobs.filter(j=>locked.has(j.channelId)),bindings=new Map(lockedBindings.map(x=>[x.channelId,x])),batchSyncUnits=batchChannels.reduce((n,c)=>n+ownerSyncEstimate(c.id),0);
  if(!batchChannels.length)return;setBusy(action);
  try{
   if(action==='scan'){
    for(const c of batchChannels)await scanInventoryChannel(c.id,'manual-channel');
    notifySuccess('Папки рендера проверены',batchChannels.length+' каналов • квота YouTube API: 0.');
   }else if(action==='oauth'){
    const states=await api.youtubeOauthCredentialStates(),map=new Map(states.profiles.map(x=>[x.profileUuid,x.credentialState]));
    const ready=batchChannels.filter(c=>c.youtubeProfileId&&map.get(c.youtubeProfileId)==='READY').length;
    const attention=batchChannels.filter(c=>c.youtubeProfileId&&map.get(c.youtubeProfileId)!=='READY').length;
    notifyInfo('Проверка учётных данных завершена',`Готовы к проверке: ${ready} • требуют внимания: ${attention} • квота YouTube API: 0.`);
   }else if(action==='youtube'){
    const r=await refreshStaleOwnerInventories(batchChannels,true);
    if(r.failed)notifyWarning('Синхронизация YouTube завершена частично',`Обновлено: ${r.updated} • ошибок: ${r.failed} • запросов каналов: ${r.requested}.`);
    else notifySuccess('Синхронизация YouTube завершена',`Обновлено каналов: ${r.updated} • оценка перед запуском: ≈${batchSyncUnits} единиц квоты.`);
   }else if(action==='stats'){
    const r=await refreshYoutubeChannelStatisticsSelection(batchChannels.map(c=>c.id),true);
    if(r.failed||r.credentialBlocked)notifyWarning('Статистика обновлена частично',`Обновлено: ${r.updated} • ошибок: ${r.failed} • нет доступа OAuth: ${r.credentialBlocked} • расход: ${r.quotaUnits} единиц квоты.`);
    else notifySuccess('Статистика обновлена',`${r.updated} каналов • ${r.apiRequests} запросов API • расход: ${r.quotaUnits} единиц квоты.`);
   }else if(action==='metadata'){
    let updated=0,failed=0;
    for(const j of jobs.filter(x=>locked.has(x.channelId)&&Boolean(x.folder)&&x.status!=='UPLOADING'&&x.status!=='SCHEDULED')){
     const c=channels.find(x=>x.id===j.channelId);if(!c||!j.folder)continue;
     try{patchJob(j.id,await api.refreshJob(j.folder,c.minTracks));updated++}catch{failed++}
    }
    if(failed)notifyWarning('Метаданные обновлены частично',`Проектов обновлено: ${updated} • ошибок: ${failed} • YouTube API: 0.`);
    else notifySuccess('Метаданные обновлены',`Проектов: ${updated} • YouTube API: 0.`);
   }else if(action==='queue'){
    if(!batchReadyJobs.length){notifyWarning('Нет видео для очереди','Нужны готовое видео, название, описание, теги, будущая дата публикации и подключённый аккаунт.');return}
    configureUploadQueue(settings.youtubeUploadConcurrency||2,settings.youtubeUploadPerChannelConcurrency||1);
    const batchId='batch-control:'+Date.now(),perChannelUsed=new Map<string,number>();let queued=0,blocked=Math.max(0,batchReadyJobs.length-Math.max(0,globalRemaining));
    for(const j of batchReadyJobs.slice(0,Math.max(0,globalRemaining))){
      const c=channels.find(x=>x.id===j.channelId),p=c?.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined;
      const binding=bindings.get(j.channelId);
      if(!c||!p||!binding||binding.profileId!==p.id||binding.youtubeChannelId!==c.youtubeChannelId||!j.finalPath||!j.publishAt){blocked++;continue}
      const before=useApp.getState();
      if(!batchJobStillMatches(j,before.jobs.find(x=>x.id===j.id),before.channels.find(x=>x.id===j.channelId),p,uploadQueueHasActiveJob(j.id))){blocked++;continue}
      const localLimit=safeDailyStatus(c.id,c.safeDailyUploadLimit),used=perChannelUsed.get(c.id)||0;
      if(localLimit.remaining!=null&&used>=localLimit.remaining){blocked++;continue}
      try{
       const st=await api.localSourceStatus(j.finalPath);if(!st.exists||!st.isFile)throw new Error('LOCAL_FILE_REQUIRED');
       const cache=useApp.getState().fingerprintCache[j.finalPath];
       const fp=await api.youtubeFileFingerprint(j.finalPath,cache?{size:cache.size,mtimeMs:cache.mtimeMs,sha256:cache.sha256}:undefined);
       const latest=useApp.getState(),current=latest.jobs.find(x=>x.id===j.id),currentChannel=latest.channels.find(x=>x.id===j.channelId);
       if(!batchJobStillMatches(j,current,currentChannel,p,uploadQueueHasActiveJob(j.id)))throw new Error('BATCH_CONFIRMATION_STALE');
       const project=youtubeQuotaProjectIdentity(p,googleConfig);
       enqueueUpload({
        jobId:j.id,batchId,localVideoIdentity:c.id+':'+j.id+':'+fp.fingerprint,videoNumber:j.number,
        channelId:c.id,channelName:c.name,profileId:p.id,youtubeChannelId:c.youtubeChannelId,filePath:j.finalPath,
        fingerprint:fp.fingerprint,fileSize:fp.size,modifiedAt:fp.modifiedAt,publishAt:j.publishAt,title:j.title,
        description:j.description,tags:[...j.tags],categoryId:settings.youtubeCategoryId||'10',metadataSource:j.metadataSource||'existing',
        quotaProjectKey:project.projectKey||undefined,
        quotaOperations:[{method:'videos.insert',count:1,label:'Загрузка видео'},{method:'videos.list',count:2,label:'Проверка обработки видео'}],
        allowDuplicate:false,submittedAt:new Date().toISOString()
       });
       perChannelUsed.set(c.id,used+1);queued++;
      }catch{blocked++}
    }
    if(queued)notifySuccess('Видео добавлены в очередь',`${queued} видео • ${batchChannels.length} выбранных каналов • общий лимит VYRON сохранён.`);
    if(blocked)notifyWarning('Часть видео не добавлена',`Не прошли проверку: ${blocked}. Повторные загрузки не созданы.`);
   }
  }catch(error){notifyError('Массовое действие не выполнено',String(error))}
  finally{setBusy(null)}
  })();
  batchExecutionPromise=task;
  void task.finally(()=>{if(batchExecutionPromise===task)batchExecutionPromise=null});
  return task
 }
 const actionLabel:Record<Action,string>={scan:'Проверить папки рендера',oauth:'Проверить OAuth',youtube:'Синхронизировать YouTube',stats:'Обновить статистику',queue:'Добавить в очередь',metadata:'Обновить метаданные'};
 const pendingChannels=pending?channels.filter(c=>pending.channelIds.includes(c.id)):[];
 const pendingReadyJobs=pending?.jobs||[];
 const pendingRenderFolders=pendingChannels.filter(c=>Boolean(c.renderFolderPath)).length;
 const pendingSyncUnits=pendingChannels.reduce((n,c)=>n+ownerSyncEstimate(c.id),0);
 const pendingConnected=pendingChannels.filter(c=>{const p=c.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined;return Boolean(p?.channelId&&c.youtubeChannelId===p.channelId)}).length;
 const pendingProjects=pending?jobs.filter(j=>pending.channelIds.includes(j.channelId)).length:0;
 const pendingQuota=pending?.action==='youtube'?'≈ '+pendingSyncUnits+' ед. квоты':pending?.action==='stats'?'≤ '+pendingConnected+' ед. квоты':pending?.action==='queue'?'≈ '+(pendingReadyJobs.length*2)+' ед. квоты + '+pendingReadyJobs.length+' загрузок':'0 ед. квоты YouTube API';
 const request=(action:Action)=>{if(!busy&&selected.length){setQueueConfirmed(false);setPending({action,channelIds:[...selected],...(action==='queue'?{jobs:chosenJobs.map(j=>({...j,tags:[...j.tags]})),bindings:connected.map(c=>({channelId:c.id,profileId:c.youtubeProfileId!,youtubeChannelId:c.youtubeChannelId!}))}:{})})}};
 if(!channels.length)return null;
 return <section className="batchControl">
  <div className="batchControlHead"><div><h2>Массовые действия</h2><p>Оценка расхода квоты появится перед запуском.</p></div><button aria-expanded={expanded} aria-controls={expanded?'batch-controls':undefined} onClick={()=>setExpanded(x=>!x)}>{expanded?'Скрыть':'Открыть'}</button></div>
  {expanded&&<div id="batch-controls">
   <div className="batchPreview">
    <span><small>Выбрано</small><b>{selectedChannels.length}</b></span>
    <span><small>Папки рендера</small><b>{renderFolders} / {selectedChannels.length}</b></span>
    <span><small>В выбранном пакете</small><b>{chosenJobs.length}</b></span>
    <span><small>Синхронизация YouTube</small><b>≈ {syncUnits} ед.</b></span>
    <span><small>Статистика</small><b>≤ {statsMaxUnits} ед.</b></span>
    <span><small>Проверка очереди</small><b>≈ {queueGeneralUnits} ед. + {chosenJobs.length} загрузок</b></span>
   </div>
   <div className="apexBatchToolbar"><button className="batchAll" disabled={Boolean(busy)} onClick={selectAll}>{selected.length===channels.length?'Снять все':'Выбрать все'}</button><input type="search" aria-label="Найти канал" placeholder="Найти канал…" value={query} onChange={e=>setQuery(e.target.value)}/><span>{selectedChannels.length} / {channels.length} каналов · {chosenJobs.length} видео</span></div>
   <div className="apexBatchTable"><table><thead><tr><th>Выбор</th><th>Канал</th><th>Готово</th><th>В пакет</th><th>Привязка</th><th>Видео</th></tr></thead><tbody>{visibleChannels.map(c=>{
    const candidates=readyByChannel.get(c.id)||[],available=candidates.filter(j=>!excluded.includes(j.id)),isSelected=selected.includes(c.id),p=c.youtubeProfileId?profileById.get(c.youtubeProfileId):undefined,linked=Boolean(p?.channelId&&p.channelId===c.youtubeChannelId);
    return <tr key={c.id}><td><input type="checkbox" aria-label={'Выбрать '+c.name} checked={isSelected} disabled={Boolean(busy)} onChange={()=>toggle(c.id)}/></td><td><b>{c.name}</b></td><td>{candidates.length}</td><td><input type="number" aria-label={'Количество видео '+c.name} min={0} max={available.length} step={1} disabled={!isSelected||Boolean(busy)} value={Math.min(available.length,quantities[c.id]??available.length)} onChange={e=>setQuantity(c.id,e.target.value)}/></td><td><span className={linked?'apexBatchLinked':'apexBatchBlocked'}>{linked?'Привязан':'Проверить OAuth'}</span></td><td><details><summary>Выбрать видео ({available.length})</summary><div className="apexBatchVideos">{candidates.length?candidates.map(j=><label key={j.id}><input type="checkbox" aria-label={'Включить VIDEO_'+String(j.number).padStart(3,'0')+' '+c.name} disabled={!isSelected||Boolean(busy)} checked={!excluded.includes(j.id)} onChange={()=>setExcluded(prev=>prev.includes(j.id)?prev.filter(id=>id!==j.id):[...prev,j.id])}/><span>VIDEO_{String(j.number).padStart(3,'0')} · {j.title}<small>{j.publishAt}</small></span></label>):<small>Нет видео, готовых по метаданным и дате.</small>}</div></details></td></tr>
   })}</tbody></table>{!visibleChannels.length&&<p className="apexBatchEmpty">Каналы не найдены.</p>}</div>
   <div className="batchActions">
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>request('scan')}>{busy==='scan'?'Сканирую…':'Проверить рендер · 0 API'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>request('oauth')}>{busy==='oauth'?'Проверяю…':'Проверить OAuth · 0 API'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>request('youtube')}>{busy==='youtube'?'Синхронизирую…':'Синхронизировать YouTube'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>request('stats')}>{busy==='stats'?'Обновляю…':'Обновить статистику'}</button>
    <button disabled={!selected.length||Boolean(busy)} onClick={()=>request('metadata')}>{busy==='metadata'?'Обновляю…':'Обновить метаданные · 0 API'}</button>
    <button className="primary" disabled={!selected.length||!chosenJobs.length||Boolean(busy)||globalRemaining<=0} onClick={()=>request('queue')}>{busy==='queue'?'Ставлю…':`Добавить в очередь · ${Math.min(chosenJobs.length,globalRemaining)}`}</button>
   </div>
  </div>}
  {pending&&<ModalPortal onClose={()=>setPending(null)}><section className="confirmModal batchPreviewModal" onMouseDown={e=>e.stopPropagation()}>
    <small>ПРОВЕРКА ДЕЙСТВИЯ</small><h2>{actionLabel[pending.action]}</h2>
    <p>Набор каналов зафиксирован. Отмена не запускает ни одной операции.</p>
    <div className="settingsInfoGrid">
      <span><small>Будет обработано</small><b>{pendingChannels.length} каналов</b></span>
      <span><small>Видео / задачи</small><b>{pending.action==='queue'?pendingReadyJobs.length:pendingProjects}</b></span>
      <span><small>YouTube API</small><b>{pendingQuota}</b></span>
      <span><small>Локальных папок</small><b>{pendingRenderFolders}</b></span>
    </div>
    <details><summary>Каналы ({pendingChannels.length})</summary><div className="logs">{pendingChannels.map(c=><div key={c.id}><b>{c.name}</b><small>{c.id}</small></div>)}</div></details>
    {pending.action==='queue'&&<details><summary>Видео ({pendingReadyJobs.length})</summary><div className="logs">{pendingReadyJobs.map(j=><div key={j.id}><b>{j.title}</b><small>{pendingChannels.find(c=>c.id===j.channelId)?.name||j.channelId} · VIDEO_{String(j.number).padStart(3,'0')} · {j.publishAt}</small></div>)}</div></details>}
    {pending.action==='queue'&&<label><input type="checkbox" checked={queueConfirmed} onChange={e=>setQueueConfirmed(e.target.checked)}/> Я подтверждаю реальную загрузку выбранных видео на YouTube. Она начнётся после постановки в очередь.</label>}
    <footer><button onClick={()=>setPending(null)}>Отмена</button><button className="primary" disabled={pending.action==='queue'&&!queueConfirmed} onClick={()=>{const x=pending;if(x.action==='queue'&&!queueConfirmed)return;const confirmed=x.action==='queue'&&queueConfirmed;setPending(null);setQueueConfirmed(false);void run(x.action,x.channelIds,x.jobs||[],confirmed,x.bindings||[])}}>{pending.action==='queue'?'Подтвердить загрузку':'Запустить'}</button></footer>
  </section></ModalPortal>}
 </section>
}
