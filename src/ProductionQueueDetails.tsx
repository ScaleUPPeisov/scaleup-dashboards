import React,{memo,useCallback,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import type {JobStatus} from './types';
import {productionManagerApi} from './productionManagerApi';
import {resolveProductionRootFromPrefs,useProductionPrefs} from './productionPrefs';
import {sortChannelsAlphabetically} from './channelSort';
import {MeasuredVirtualList} from './MeasuredVirtualList';

const statusLabel:Record<JobStatus,string>={NEED_IMAGE:'Нужно изображение',WAITING_MUSIC:'Нужно аудио',READY_RENDER:'Готов к ENDLUME',RENDERING:'Рендер',READY_UPLOAD:'Готов к YouTube',UPLOADING:'Загрузка YouTube',SCHEDULED:'Запланирован',ERROR:'Ошибка'};
const stageOrder:JobStatus[]=['NEED_IMAGE','WAITING_MUSIC','READY_RENDER','RENDERING','READY_UPLOAD','UPLOADING','SCHEDULED','ERROR'];
const EMPTY_IDS:string[]=[];

export function ProductionQueueDetails({onCreateProjects}:{onCreateProjects:()=>void}){
  const channels=useApp(s=>s.channels);
  const setJobs=useApp(s=>s.setJobs);
  const settingsWorkspace=useApp(s=>s.settings.workspace);
  const [prefs,patchPrefs]=useProductionPrefs();
  const [filter,setFilter]=useState('all');
  const [busy,setBusy]=useState(false);
  const selectedJobIds=prefs.selectedJobIds||[];

  const visibleJobIds=useApp(s=>{
    if(filter==='all')return s.jobIndex.orderedIds;
    if(stageOrder.includes(filter as JobStatus))return s.jobIndex.idsByStatus[filter as JobStatus]||EMPTY_IDS;
    return s.jobIndex.idsByChannel[filter]||EMPTY_IDS;
  });
  const statusCounts=useApp(s=>s.jobSummary.byStatus);
  const selectedSet=useMemo(()=>new Set(selectedJobIds),[selectedJobIds]);
  const visibleSet=useMemo(()=>new Set(visibleJobIds),[visibleJobIds]);
  const selectedVisible=useMemo(()=>selectedJobIds.filter(id=>visibleSet.has(id)),[selectedJobIds,visibleSet]);

  const toggleJob=useCallback((id:string)=>{
    const current=prefs.selectedJobIds||[];
    patchPrefs({selectedJobIds:current.includes(id)?current.filter(x=>x!==id):[...current,id]});
  },[prefs.selectedJobIds,patchPrefs]);

  function inferJobRoot(folder:string){
    const clean=folder.replace(/\/+$/,'');
    const m=clean.match(/^(.*)\/[^/]+\/Video_\d+$/i);
    return m?.[1]||'';
  }

  async function deleteJobs(ids:string[],label:string){
    const state=useApp.getState();
    const unique=[...new Set(ids)].filter(id=>Boolean(state.jobIndex.byId[id]));
    if(!unique.length||!confirm(label))return;
    setBusy(true);
    try{
      const current=useApp.getState();
      const rows=unique.map(id=>current.jobIndex.byId[id]).filter(Boolean);
      for(const j of rows){
        if(!j.folder)continue;
        const roots=[resolveProductionRootFromPrefs(prefs,j.channelId,settingsWorkspace),inferJobRoot(j.folder),settingsWorkspace].filter((x,i,a)=>x&&a.indexOf(x)===i);
        let done=false,last:unknown;
        for(const root of roots){
          try{await productionManagerApi.deleteJobFolder(root,j.folder,j.id);done=true;break}catch(e){last=e}
        }
        if(!done)throw last||new Error('Не удалось определить хранилище проекта');
      }
      const removeSet=new Set(unique);
      setJobs(useApp.getState().jobs.filter(j=>!removeSet.has(j.id)));
      patchPrefs({selectedJobIds:(prefs.selectedJobIds||[]).filter(id=>!removeSet.has(id))});
      useApp.getState().toast(`Проектов перемещено в Корзину: ${unique.length}`);
    }catch(e){
      useApp.getState().toast(`Не удалось удалить проекты: ${String(e)}`);
    }finally{setBusy(false)}
  }

  const getKey=useCallback((id:string)=>id,[]);
  const renderRow=useCallback((id:string)=><ProductionJobRow jobId={id} selected={selectedSet.has(id)} onToggle={toggleJob}/>,[selectedSet,toggleJob]);

  return <details className="advancedPanel productionQueueDetails">
    <summary>Подробная очередь</summary>
    <div className="productionPipeline">{stageOrder.map(st=><button key={st} className={st==='ERROR'&&statusCounts.ERROR>0?'warn':''} onClick={()=>setFilter(st)}><small>{statusLabel[st]}</small><b>{statusCounts[st]||0}</b></button>)}</div>
    <div className="filterBar">
      <select value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">Все каналы / статусы</option>
        {sortChannelsAlphabetically(channels).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        {stageOrder.map(st=><option key={st} value={st}>{statusLabel[st]}</option>)}
      </select>
      <span>{visibleJobIds.length} задач</span>
    </div>
    {visibleJobIds.length===0?<div className="empty"><b>Нет задач в этом фильтре</b><p>Создай точное число проектов или включи поддержание буфера.</p><button className="primary" onClick={onCreateProjects}>Создать проекты</button></div>:
      <div className="jobs virtualReady">
        <div className="pmBulkBar">
          <span>Выбрано <b>{selectedVisible.length}</b> / {visibleJobIds.length}</span>
          <button onClick={()=>patchPrefs({selectedJobIds:[...new Set([...selectedJobIds,...visibleJobIds])]})}>Выбрать всё</button>
          <button onClick={()=>patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!visibleSet.has(id))})}>Снять выделение</button>
          <button className="danger" disabled={!selectedVisible.length||busy} onClick={()=>void deleteJobs(selectedVisible,'Удалить выбранные проекты?')}>Удалить выбранные</button>
          <button className="danger" disabled={busy} onClick={()=>void deleteJobs(visibleJobIds,'Удалить все проекты в текущем списке?')}>Удалить все</button>
        </div>
        <MeasuredVirtualList items={visibleJobIds} getKey={getKey} estimateSize={112} overscan={8} className="productionVirtualList" renderItem={renderRow}/>
      </div>}
  </details>;
}

const ProductionJobRow=memo(function ProductionJobRow({jobId,selected,onToggle}:{jobId:string;selected:boolean;onToggle:(id:string)=>void}){
  const job=useApp(s=>s.jobIndex.byId[jobId]);
  const channel=useApp(s=>job?s.channels.find(x=>x.id===job.channelId):undefined);
  const patchJob=useApp(s=>s.patchJob);
  const workspace=useApp(s=>s.settings.workspace);
  const endlumePath=useApp(s=>s.settings.endlumePath);
  const setPage=useApp(s=>s.setPage);
  const toast=useApp(s=>s.toast);
  if(!job)return null;
  return <article className="job productionJob" data-production-job-row={job.id}>
    <label className="pmJobCheck"><input type="checkbox" checked={selected} onChange={()=>onToggle(job.id)}/></label>
    <div className={`jobStatus ${job.status.toLowerCase()}`}>{statusLabel[job.status]}</div>
    <div className="jobMain">
      <small>{channel?.name||'Канал удалён'} • VIDEO_{String(job.number).padStart(3,'0')}</small>
      <b>{job.title||'Метаданные ещё не готовы'}</b>
      <span>Изображение {job.coverPath?'✓':'—'} • треков {job.tracksCount}/{job.minTracks} • final.mp4 {job.finalPath?'✓':'—'} • metadata {job.title&&job.description?'✓':'—'}</span>
      <span>{job.publishAt?`Публикация: ${new Date(job.publishAt).toLocaleString('ru-RU')}`:'Дата публикации не назначена'}</span>
      {job.status==='UPLOADING'&&<div className="miniProgress"><i style={{width:`${job.uploadProgress||0}%`}}/></div>}
      {job.error&&<em className="jobError">{job.error}</em>}
    </div>
    <div className="jobActions">
      {job.folder&&<button onClick={()=>api.reveal(job.folder!)}>Папка</button>}
      {job.status==='WAITING_MUSIC'&&<button className="primary small" onClick={async()=>{
        const files=await api.chooseTracks();if(!files.length||!job.folder)return;
        try{const r=await api.addTracks(job.folder,files,channel?.minTracks||job.minTracks);patchJob(job.id,{tracksCount:r.tracksCount,status:r.status as JobStatus})}
        catch(e){patchJob(job.id,{status:'ERROR',error:String(e)})}
      }}>+ Аудио</button>}
      {job.status==='READY_RENDER'&&job.folder&&<button className="primary small" onClick={async()=>{
        try{await api.enqueueRender(workspace,job.folder!);patchJob(job.id,{renderQueuedAt:new Date().toISOString()});if(endlumePath)await api.openEndlume(endlumePath);toast('Проект отправлен в ENDLUME RenderQueue')}
        catch(e){toast(String(e))}
      }}>В ENDLUME</button>}
      {job.status==='READY_UPLOAD'&&<button className="primary small" onClick={()=>setPage('youtube')}>YouTube</button>}
      {job.status==='ERROR'&&<button onClick={async()=>{
        if(!job.folder)return;
        try{patchJob(job.id,{...(await api.refreshJob(job.folder,channel?.minTracks||job.minTracks)),error:undefined})}
        catch(e){patchJob(job.id,{error:String(e)})}
      }}>Повторить</button>}
    </div>
  </article>;
});
