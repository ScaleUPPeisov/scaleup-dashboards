import React,{useEffect} from 'react';
import {api} from './api';
import {nextProjectLifecycle,updateUploadProcessing} from './storageLifecycle';
import {useApp} from './store';
import type {UploadHistoryRecord} from './types';
import {journalProcessingState} from './activityJournalRuntime';

const MIN_ROW_AGE_MS=45_000;
const MAX_PER_PASS=10;
export const PROCESSING_MONITOR_INTERVAL_MS=90_000;
const LONG_RUNNING_MS=30*60_000;

export function processingMonitorCandidates(history:UploadHistoryRecord[],now=Date.now()){
 return history
  .filter(x=>x.status==='UPLOADED'&&!x.trashedAt&&Boolean(x.profileId&&x.youtubeVideoId)&&x.processingState!=='READY'&&x.processingState!=='PROCESSING_FAILED'&&x.processingState!=='REJECTED')
  .filter(x=>{const at=Date.parse(x.processingCheckedAt||x.uploadedAt||'');return !Number.isFinite(at)||now-at>=MIN_ROW_AGE_MS})
  .sort((a,b)=>Date.parse(a.processingCheckedAt||a.uploadedAt||'')-Date.parse(b.processingCheckedAt||b.uploadedAt||''))
  .slice(0,MAX_PER_PASS);
}

let cycleRunning=false;
export async function runUploadProcessingMonitorCycle(){
 if(cycleRunning)return;
 cycleRunning=true;
 try{
  const state=useApp.getState(),rows=processingMonitorCandidates(state.uploadHistory);
  for(const row of rows){
   if(!row.profileId||!row.youtubeVideoId)continue;
   try{
    const p=await api.youtubeVideoProcessingStatus(row.profileId,row.youtubeVideoId,`processing-owner-check:${row.jobId}`);
    const current=useApp.getState(),processingState=p.processingState,remoteError=p.processingFailureReason||p.rejectionReason||undefined,previous=row.processingState;
    const uploadedAt=Date.parse(row.uploadedAt||''),longRunning=!remoteError&&processingState!=='READY'&&processingState!=='PROCESSING_FAILED'&&Number.isFinite(uploadedAt)&&Date.now()-uploadedAt>=LONG_RUNNING_MS;
    const visibilityNote=longRunning?'YouTube всё ещё обрабатывает видео; VYRON продолжает безопасную проверку статуса.':undefined,error=remoteError||visibilityNote;
    const history=updateUploadProcessing(current.uploadHistory,row.jobId,{
      processingState,processingCheckedAt:p.processingCheckedAt,processingStatus:p.processingStatus,
      processingError:error,readyAt:processingState==='READY'?p.processingCheckedAt:undefined,identityVerifiedAt:p.identityVerified?p.processingCheckedAt:undefined
    });
    current.replaceUploadHistory(history);
    const latest=history.slice().reverse().find(x=>x.jobId===row.jobId);if(latest)journalProcessingState(latest,previous,processingState,p.processingCheckedAt,remoteError);
    current.patchJob(row.jobId,{processingState,processingCheckedAt:p.processingCheckedAt,processingError:error});
    const project=Object.entries(current.projectLifecycle).find(([,x])=>x.jobId===row.jobId);
    if(project)current.patchProjectLifecycle(project[0],nextProjectLifecycle(project[1],history));
   }catch(error){
    useApp.getState().patchJob(row.jobId,{processingError:`Проверка статуса YouTube временно недоступна: ${String(error)}`});
   }
  }
 }finally{cycleRunning=false}
}

let mountedOwners=0;
let monitorInterval:ReturnType<typeof setInterval>|undefined;
let initialTimer:ReturnType<typeof setTimeout>|undefined;
function startProcessingMonitorOwner(){
 mountedOwners++;
 if(monitorInterval)return;
 initialTimer=setTimeout(()=>void runUploadProcessingMonitorCycle(),5_000);
 monitorInterval=setInterval(()=>void runUploadProcessingMonitorCycle(),PROCESSING_MONITOR_INTERVAL_MS);
}
function stopProcessingMonitorOwner(){
 mountedOwners=Math.max(0,mountedOwners-1);if(mountedOwners>0)return;
 if(initialTimer){clearTimeout(initialTimer);initialTimer=undefined}
 if(monitorInterval){clearInterval(monitorInterval);monitorInterval=undefined}
}

export function UploadProcessingMonitor(){
 useEffect(()=>{startProcessingMonitorOwner();return()=>stopProcessingMonitorOwner()},[]);
 return null;
}
