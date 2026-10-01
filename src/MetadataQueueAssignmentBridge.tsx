import React,{useEffect,useRef} from 'react';
import {api} from './api';
import {metadataQueuePublishAtIsFuture,metadataQueueRowAsImported} from './metadataQueue';
import {notifyWarning} from './notificationCenter';
import {useApp} from './store';

const CHANGE_EVENT='vyron:metadata-queue-changed';

export function notifyMetadataQueueChanged(){
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function MetadataQueueAssignmentBridge(){
  const channels=useApp(s=>s.channels);
  const jobs=useApp(s=>s.jobs);
  const running=useRef(false);
  const rerun=useRef(false);
  const attempted=useRef(new Set<string>());
  const timer=useRef<number|undefined>(undefined);

  useEffect(()=>{
    let alive=true;
    const execute=async()=>{
      if(!alive)return;
      if(running.current){rerun.current=true;return}
      running.current=true;
      try{
        const state=useApp.getState();
        const candidateChannelIds=new Set(
          state.jobs
            .filter(j=>Boolean(j.folder)&&!j.youtubeVideoId&&j.metadataSource!=='queue'&&j.metadataSource!=='import'&&j.metadataSource!=='ai'&&!j.metadataLocked)
            .map(j=>j.channelId)
        );
        for(const channelId of candidateChannelIds){
          if(!alive)return;
          const channel=useApp.getState().channels.find(c=>c.id===channelId);
          if(!channel)continue;
          const summary=await api.metadataQueueSummary(channel.id,channel.name).catch(()=>null);
          if(!summary||summary.available<=0)continue;
          const candidates=useApp.getState().jobs
            .filter(j=>j.channelId===channel.id&&Boolean(j.folder)&&!j.youtubeVideoId&&j.metadataSource!=='queue'&&j.metadataSource!=='import'&&j.metadataSource!=='ai'&&!j.metadataLocked)
            .sort((a,b)=>a.number-b.number)
            .filter(j=>!attempted.current.has(channel.id+':'+j.id+':'+j.folder))
            .slice(0,summary.available);
          if(!candidates.length)continue;
          for(const job of candidates)attempted.current.add(channel.id+':'+job.id+':'+job.folder);
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
        if(rerun.current){rerun.current=false;window.setTimeout(()=>void execute(),80)}
      }
    };
    const schedule=()=>{
      if(timer.current)window.clearTimeout(timer.current);
      timer.current=window.setTimeout(()=>void execute(),220);
    };
    const onChanged=()=>{attempted.current.clear();schedule()};
    window.addEventListener(CHANGE_EVENT,onChanged);
    schedule();
    return()=>{
      alive=false;
      if(timer.current)window.clearTimeout(timer.current);
      window.removeEventListener(CHANGE_EVENT,onChanged);
    };
  },[
    channels.map(c=>c.id+':'+c.name).join('|'),
    jobs.map(j=>j.id+':'+j.channelId+':'+j.number+':'+j.folder+':'+(j.metadataSource||'')+':'+String(j.metadataLocked||false)+':'+(j.youtubeVideoId||'')).join('|')
  ]);

  return null;
}
