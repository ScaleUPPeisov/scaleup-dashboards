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
            .sort((a,b)=>a.number-b.number);
          let remaining=summary.available;
          for(const job of candidates){
            if(!alive||remaining<=0)break;
            const key=channel.id+':'+job.id+':'+job.folder;
            if(attempted.current.has(key))continue;
            attempted.current.add(key);
            const record=await api.metadataQueueReserve(channel.id,channel.name,job.id,job.number,job.folder||undefined).catch(error=>{
              notifyWarning('Metadata Queue: assignment error',String(error),{operationId:'metadata-queue-assign:'+job.id});
              return null;
            });
            if(!record)break;
            remaining--;
            const row=metadataQueueRowAsImported(record);
            const current=useApp.getState().jobs.find(x=>x.id===job.id);
            if(!current)continue;
            useApp.getState().patchJob(job.id,{
              title:row.title??current.title,
              description:row.description??current.description,
              tags:row.tags?.length?[...row.tags]:current.tags,
              publishAt:metadataQueuePublishAtIsFuture(row.publishAt)?row.publishAt:current.publishAt,
              metadataSource:'queue',
              metadataLocked:true,
              error:undefined,
            });
          }
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
