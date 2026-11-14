import React,{useEffect,useRef} from 'react';
import {api} from './api';
import {notifySuccess} from './notificationCenter';
import {useApp} from './store';
import type {VideoJob} from './types';
import {journal} from './activityJournalRuntime';
import {isRenderReadyTransitionAllowed} from './storageLifecycle';
import {scanFactualRenderRuntime} from './renderRuntimeEvidence';
import {replaceFactualActiveRenders} from './activeOperationFacts';
import {applyStaleOperationPatches,buildStaleOperationPatches} from './staleOperationReconciliation';

export function ProductionStatusBridge(){
  const booted=useApp(s=>s.booted),workspace=useApp(s=>s.settings.workspace),channelIdsKey=useApp(s=>s.channels.map(c=>c.id).join('|'));
  const observed=useRef(new Map<string,string>()),hydrated=useRef(false);
  useEffect(()=>{
    if(!booted||!workspace||!channelIdsKey)return;
    let live=true,running=false;
    const trackedChannels=new Map<string,number>();
    const TRACK_FOR_MS=12*60*60_000;
    const rememberActiveJobs=()=>{for(const job of useApp.getState().jobs)if(job.status==='RENDERING')trackedChannels.set(job.channelId,Date.now()+TRACK_FOR_MS)};
    rememberActiveJobs();
    const run=async()=>{
      if(running||!live)return;
      rememberActiveJobs();
      const now=Date.now();
      for(const [id,expires] of trackedChannels)if(expires<=now)trackedChannels.delete(id);
      const candidates=useApp.getState().channels.filter(channel=>trackedChannels.has(channel.id));
      if(!candidates.length)return;
      running=true;
      try{
        const evidence=await scanFactualRenderRuntime(workspace,candidates);
        const initialHydration=!hydrated.current;
        for(const item of evidence.rows){
          const {batchId,row}=item;if(!row.jobId)continue;
          const job=useApp.getState().jobs.find(j=>j.id===row.jobId);if(!job)continue;
          const renderKey=`${batchId}:${row.projectId}:${row.outputFile||''}`,previous=observed.current.get(renderKey);
          if(row.renderStatus==='Rendering'){
            if(isRenderReadyTransitionAllowed(job)&&job.status!=='RENDERING')useApp.getState().patchJob(job.id,{status:'RENDERING',error:undefined});
          }else if(row.renderStatus==='Completed'&&row.outputFile){
            const patch:Partial<VideoJob>={};if(job.finalPath!==row.outputFile)patch.finalPath=row.outputFile;if(isRenderReadyTransitionAllowed(job)){patch.status='READY_UPLOAD';patch.error=undefined}if(Object.keys(patch).length)useApp.getState().patchJob(job.id,patch);
            const eventId=`render-complete:${renderKey}`,already=useApp.getState().activityJournal.some(e=>e.eventId===eventId);
            if(!already){const genuinelyNew=!initialHydration&&previous!=null&&previous!=='Completed'&&isRenderReadyTransitionAllowed(job);journal({eventId,eventType:genuinelyNew?'RENDER_COMPLETED':'RENDER_DISCOVERED_LEGACY',status:'SUCCESS',source:genuinelyNew?'LIVE_OPERATION':'LEGACY_IMPORT',channelId:job.channelId,jobId:job.id,localSourcePath:row.outputFile,details:{batchId,projectId:row.projectId,renderStatus:'Completed',firstObservation:genuinelyNew?'runtime-transition':'startup-hydration'}});if(genuinelyNew)notifySuccess('Видео готово',`VIDEO_${String(row.videoNumber||job.number).padStart(3,'0')} • ENDLUME завершил рендер.`,{operationId:`endlume-complete:${renderKey}`,actions:[{label:'Открыть файл',onClick:()=>{void api.openLocal(row.outputFile!)}}]})}
          }else if(row.renderStatus==='Error'&&!job.youtubeVideoId&&['READY_RENDER','RENDERING'].includes(job.status)){useApp.getState().patchJob(job.id,{status:'ERROR',error:row.error||'ENDLUME: ошибка рендера'})}
          observed.current.set(renderKey,row.renderStatus);
        }
        hydrated.current=true;
        if(evidence.reliable){
          replaceFactualActiveRenders(evidence.activeJobIds,evidence.observedAtMs);
          const patches=buildStaleOperationPatches(useApp.getState().jobs,{uploadsKnown:false,rendersKnown:true,activeUploadIds:new Set(),activeRenderIds:evidence.activeJobIds,uploadSessionIds:new Set(),now:new Date(evidence.observedAtMs).toISOString()});
          applyStaleOperationPatches(patches,useApp.getState().patchJob);
        }
      }finally{running=false}
    };
    const onTracking=(event:Event)=>{
      const channelId=(event as CustomEvent<{channelId?:string}>).detail?.channelId;
      if(channelId){trackedChannels.set(channelId,Date.now()+TRACK_FOR_MS);void run()}
    };
    window.addEventListener('vyron:production-render-tracking',onTracking);
    void run();
    const id=window.setInterval(()=>void run(),20_000);
    return()=>{live=false;window.clearInterval(id);window.removeEventListener('vyron:production-render-tracking',onTracking)};
  },[booted,workspace,channelIdsKey]);
  return null;
}
