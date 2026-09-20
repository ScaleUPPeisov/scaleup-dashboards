import React,{useEffect,useRef} from 'react';
import {api} from './api';
import {nextProjectLifecycle,updateUploadProcessing} from './storageLifecycle';
import {useApp} from './store';
import type {UploadHistoryRecord} from './types';
import {journalProcessingState} from './activityJournalRuntime';

const CHECK_EVERY_MS=60_000;
const MIN_ROW_AGE_MS=45_000;
const MAX_PER_PASS=10;

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
    const p=await api.youtubeVideoProcessingStatus(row.profileId,row.youtubeVideoId,`processing-monitor:${row.jobId}`);
    const current=useApp.getState();
    const processingState=p.processingState;
    const error=p.processingFailureReason||p.rejectionReason||undefined;
    const previous=row.processingState;
    const history=updateUploadProcessing(current.uploadHistory,row.jobId,{
      processingState,processingCheckedAt:p.processingCheckedAt,processingStatus:p.processingStatus,
      processingError:error,readyAt:processingState==='READY'?p.processingCheckedAt:undefined,identityVerifiedAt:p.identityVerified?p.processingCheckedAt:undefined
    });
    current.replaceUploadHistory(history);
    const latest=history.slice().reverse().find(x=>x.jobId===row.jobId);if(latest)journalProcessingState(latest,previous,processingState,p.processingCheckedAt,error);
    current.patchJob(row.jobId,{processingState,processingCheckedAt:p.processingCheckedAt,processingError:error});
    const project=Object.entries(current.projectLifecycle).find(([,x])=>x.jobId===row.jobId);
    if(project)current.patchProjectLifecycle(project[0],nextProjectLifecycle(project[1],history));
   }catch(error){
    const message=String(error);
    // Local OAuth/keychain failures are deliberately kept as one account incident.
    // Do not turn every processing row into a duplicate Error Center entry.
    useApp.getState().patchJob(row.jobId,{processingError:message});
   }
  }
 }finally{cycleRunning=false}
}

export function UploadProcessingMonitor(){
 const started=useRef(false),booted=useApp(s=>s.booted);
 useEffect(()=>{
  if(!booted||started.current)return;
  started.current=true;
  const first=window.setTimeout(()=>void runUploadProcessingMonitorCycle(),8_000);
  const id=window.setInterval(()=>void runUploadProcessingMonitorCycle(),CHECK_EVERY_MS);
  return()=>{window.clearTimeout(first);window.clearInterval(id);started.current=false}
 },[booted]);
 return null;
}
