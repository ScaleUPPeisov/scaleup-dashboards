import React,{useEffect,useRef} from 'react';
import {api} from './api';
import {notifySuccess} from './notificationCenter';
import {useApp} from './store';
import type {VideoJob} from './types';
import {journal} from './activityJournalRuntime';
import {isRenderReadyTransitionAllowed} from './storageLifecycle';
import {scanFactualRenderRuntime} from './renderRuntimeEvidence';
import {replaceFactualActiveRenders,setRenderMonitoringExpected,invalidateRenderFacts} from './activeOperationFacts';
import {createRenderScanScheduler} from './renderScanScheduler';
import {applyStaleOperationPatches,buildStaleOperationPatches} from './staleOperationReconciliation';
import {productionRenderLedger} from './productionRenderTransitions';
import {observeRuntimeRenderTransitions,runtimeRenderIdentity} from './runtimeRenderTransitions';

// An unmounted bridge may still be awaiting a native scan. Do not overlap it
// with a newly mounted bridge; native commands cannot be cancelled by a timer.
let activeScan:Promise<unknown>|undefined;
async function scanExclusively(workspace:string,channels:ReturnType<typeof useApp.getState>['channels'],stillCurrent:()=>boolean){
  while(activeScan){try{await activeScan}catch{}}
  if(!stillCurrent())return;
  const ledger=productionRenderLedger();
  const scan=scanFactualRenderRuntime(workspace,channels,(rootPath,batchId)=>ledger.hasPendingBatch(rootPath,batchId));
  activeScan=scan;
  try{return await scan}finally{if(activeScan===scan)activeScan=undefined}
}

export function ProductionStatusBridge(){
  const booted=useApp(s=>s.booted),workspace=useApp(s=>s.settings.workspace),channelIdsKey=useApp(s=>s.channels.map(c=>c.id).join('|'));
  const hydrated=useRef(false);
  const scheduler=useRef<ReturnType<typeof createRenderScanScheduler>|null>(null);
  useEffect(()=>{
    if(!booted)return;
    let live=true;
    const run=async()=>{
      const state=useApp.getState(),scanWorkspace=state.settings.workspace,channels=state.channels;
      const scanChannelIds=channels.map(c=>c.id).join('|');
      if(!live||!scanWorkspace||!scanChannelIds)return;
      const stillCurrent=()=>{const current=useApp.getState();return live&&current.settings.workspace===scanWorkspace&&current.channels.map(c=>c.id).join('|')===scanChannelIds};
      const evidence=await scanExclusively(scanWorkspace,channels,stillCurrent);
      if(!evidence||!stillCurrent())return;
      if(!evidence.reliable)invalidateRenderFacts();
        const initialHydration=!hydrated.current;
        const rendered=observeRuntimeRenderTransitions(evidence.rows,productionRenderLedger());
        const newlyRendered=new Set(rendered.map(x=>runtimeRenderIdentity({rootPath:x.rootPath,batchId:x.batchId,projectId:x.row.projectId})));
        const notifications=new Map<string,typeof evidence.rows>();
        for(const item of evidence.rows){
          const {batchId,row}=item;if(!row.jobId)continue;
          const job=useApp.getState().jobs.find(j=>j.id===row.jobId);if(!job)continue;
          const renderKey=`${batchId}:${row.projectId}:${row.outputFile||''}`;
          if(row.renderStatus==='Rendering'){
            if(isRenderReadyTransitionAllowed(job)&&job.status!=='RENDERING')useApp.getState().patchJob(job.id,{status:'RENDERING',error:undefined});
          }else if(row.renderStatus==='Completed'&&row.outputFile){
            const patch:Partial<VideoJob>={};if(job.finalPath!==row.outputFile)patch.finalPath=row.outputFile;if(isRenderReadyTransitionAllowed(job)){patch.status='READY_UPLOAD';patch.error=undefined}if(Object.keys(patch).length)useApp.getState().patchJob(job.id,patch);
            const eventId=`render-complete:${renderKey}`,already=useApp.getState().activityJournal.some(e=>e.eventId===eventId);
            const genuinelyNew=newlyRendered.has(runtimeRenderIdentity({rootPath:item.rootPath,batchId,projectId:row.projectId}));
            if(!already){journal({eventId,eventType:genuinelyNew?'RENDER_COMPLETED':'RENDER_DISCOVERED_LEGACY',status:'SUCCESS',source:genuinelyNew?'LIVE_OPERATION':'LEGACY_IMPORT',channelId:job.channelId,jobId:job.id,localSourcePath:row.outputFile,details:{batchId,projectId:row.projectId,renderStatus:'Completed',firstObservation:genuinelyNew?'runtime-transition':initialHydration?'startup-hydration':'historical-observation'}})}
          }else if(row.renderStatus==='Error'&&!job.youtubeVideoId&&['READY_RENDER','RENDERING'].includes(job.status)){useApp.getState().patchJob(job.id,{status:'ERROR',error:row.error||'ENDLUME: ошибка рендера'})}
        }
        for(const item of rendered){
          const group=notifications.get(item.channelId)||[];group.push(item);notifications.set(item.channelId,group)
        }
        for(const [channelId,group] of notifications){
          const channel=channels.find(c=>c.id===channelId),count=group.length,first=group[0].row;
          const label=channel?.name||'Канал';
          const message=count===1?`${label} • проект ${first.projectId}`:`${label} • проектов: ${count}`;
          notifySuccess(count===1?'Рендер готов':`Рендер готов: ${count} проектов`,message,{
            operationId:`render-completed:${crypto.randomUUID()}`,groupKey:`render-completed:${channelId}`,groupCount:count,groupLabel:label,
            actions:count===1&&first.outputFile?[{label:'Открыть файл',onClick:()=>{void api.openLocal(first.outputFile!)}}]:[]
          });
        }
        hydrated.current=true;
        if(evidence.reliable){
          replaceFactualActiveRenders(evidence.activeJobIds,evidence.observedAtMs);
          const patches=buildStaleOperationPatches(useApp.getState().jobs,{uploadsKnown:false,rendersKnown:true,activeUploadIds:new Set(),activeRenderIds:evidence.activeJobIds,uploadSessionIds:new Set(),now:new Date(evidence.observedAtMs).toISOString()});
          applyStaleOperationPatches(patches,useApp.getState().patchJob);
        }
    };
    const current=createRenderScanScheduler({scan:run,isVisible:()=>document.visibilityState==='visible',onError:error=>{invalidateRenderFacts();console.warn('[VYRON_RENDER_MONITOR]',error)}});
    scheduler.current=current;
    const onVisibility=()=>current.visibilityChanged();
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{live=false;current.stop();if(scheduler.current===current)scheduler.current=null;document.removeEventListener('visibilitychange',onVisibility)};
  },[booted]);
  useEffect(()=>{
    const configured=Boolean(booted&&workspace&&channelIdsKey);
    setRenderMonitoringExpected(configured);
    if(configured)scheduler.current?.request();else scheduler.current?.pause();
    return()=>setRenderMonitoringExpected(false);
  },[booted,workspace,channelIdsKey]);
  return null;
}
