import React,{useEffect,useRef} from 'react';
import {api} from './api';
import {metadataQueuePublishAtIsFuture,metadataQueueRowAsImported} from './metadataQueue';
import {notifyWarning} from './notificationCenter';
import {useApp} from './store';
import {metadataAssignmentInputsChanged,metadataAssignmentKey,metadataChannelsNeedingAssignment,needsMetadataAssignment} from './metadataAssignmentCandidates';

const CHANGE_EVENT='vyron:metadata-queue-changed';

export function notifyMetadataQueueChanged(){
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function MetadataQueueAssignmentBridge(){
  const running=useRef(false);
  const rerun=useRef(false);
  const attempted=useRef(new Set<string>());
  const timer=useRef<number|undefined>(undefined);
  const wake=useRef<(()=>void)|undefined>(undefined);

  useEffect(()=>{
    let alive=true;
    const execute=async()=>{
      if(!alive)return;
      if(running.current){rerun.current=true;return}
      running.current=true;
      try{
        const state=useApp.getState();
        // Avoid entering the synchronous queue IPC for a channel whose jobs
        // were already attempted. Queue-change events clear this set.
        const candidateChannelIds=metadataChannelsNeedingAssignment(state.jobs,attempted.current);
        for(const channelId of candidateChannelIds){
          if(!alive)return;
          const channel=useApp.getState().channels.find(c=>c.id===channelId);
          if(!channel)continue;
          const summary=await api.metadataQueueSummary(channel.id,channel.name).catch(()=>null);
          if(!summary||summary.available<=0)continue;
          const candidates=useApp.getState().jobs
            .filter(j=>j.channelId===channel.id&&needsMetadataAssignment(j))
            .sort((a,b)=>a.number-b.number)
            .filter(j=>!attempted.current.has(metadataAssignmentKey(j)))
            .slice(0,summary.available);
          if(!candidates.length)continue;
          for(const job of candidates)attempted.current.add(metadataAssignmentKey(job));
          const reserved=await api.metadataQueueReserveBatch(channel.id,channel.name,candidates.map(job=>({
            jobId:job.id,videoNumber:job.number,projectFolder:job.folder||undefined
          }))).catch(error=>{
            notifyWarning('Metadata Queue: batch assignment error',String(error),{operationId:'metadata-queue-assign:'+channel.id});
            return [];
          });
          if(!alive||!reserved.length)continue;
          const byId=new Map(useApp.getState().jobs.map(j=>[j.id,j] as const));
          const patches=[] as Array<{id:string;patch:Partial<(typeof candidates)[number]>}>;
          for(const result of reserved){
            if(!result.record)continue;
            const current=byId.get(result.jobId);
            if(!current)continue;
            const row=metadataQueueRowAsImported(result.record);
            patches.push({id:current.id,patch:{
              title:row.title??current.title,
              description:row.description??current.description,
              tags:row.tags?.length?[...row.tags]:current.tags,
              publishAt:metadataQueuePublishAtIsFuture(row.publishAt)?row.publishAt:current.publishAt,
              metadataSource:'queue',
              metadataLocked:true,
              error:undefined,
            }});
          }
          if(patches.length)useApp.getState().patchJobsBatch(patches);
        }
      }finally{
        running.current=false;
        if(rerun.current){rerun.current=false;wake.current?.()}
      }
    };
    const schedule=(delay=220)=>{
      if(!alive)return;
      if(timer.current!==undefined)window.clearTimeout(timer.current);
      timer.current=window.setTimeout(()=>{timer.current=undefined;void execute()},delay);
    };
    const wakeCurrent=()=>schedule(80);
    wake.current=wakeCurrent;
    const onChanged=()=>{attempted.current.clear();schedule()};
    window.addEventListener(CHANGE_EVENT,onChanged);
    // Keep this global bridge outside React's jobs subscription: most job
    // patches do not affect assignment and should not rerender or rescan it.
    const unsubscribe=useApp.subscribe((next,previous)=>{
      if(metadataAssignmentInputsChanged(previous,next))schedule();
    });
    schedule();
    return()=>{
      alive=false;
      if(timer.current!==undefined)window.clearTimeout(timer.current);
      timer.current=undefined;
      if(wake.current===wakeCurrent)wake.current=undefined;
      unsubscribe();
      window.removeEventListener(CHANGE_EVENT,onChanged);
    };
  },[]);

  return null;
}
