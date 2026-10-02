import {create} from 'zustand';
import {useApp} from './store';
import {buildProductionPipeline,type ProductionPipelineSnapshot} from './productionPipeline';
import type {VideoJob} from './types';

export type ProductionChannelFacts={current?:VideoJob;remaining:number};
export type ProductionWorkspaceSummary={working:number;materials:number;building:number;render:number;youtube:number;errors:number};
export type YoutubeScheduleFacts={nextScheduled?:string;scheduledCount:number};

type JobDerivedState={
 jobsByChannel:Record<string,VideoJob[]>;
 maxJobNumberByChannel:Record<string,number>;
 workspaceByChannel:Record<string,ProductionChannelFacts>;
 workspaceSummary:ProductionWorkspaceSummary;
 scheduleByChannel:Record<string,YoutubeScheduleFacts>;
 pipeline:ProductionPipelineSnapshot;
};

export const EMPTY_JOBS:VideoJob[]=[];
export const EMPTY_SCHEDULE:YoutubeScheduleFacts={scheduledCount:0};

function buildDerived(){
 const state=useApp.getState(),jobs=state.jobs,channels=state.channels,now=Date.now();
 const jobsByChannel:Record<string,VideoJob[]>={},maxJobNumberByChannel:Record<string,number>={},workspaceByChannel:Record<string,ProductionChannelFacts>={},scheduleByChannel:Record<string,YoutubeScheduleFacts>={};
 const workingIds=new Set<string>();
 let materials=0,building=0,render=0,youtube=0,errors=0;
 for(const j of jobs){
  (jobsByChannel[j.channelId]||(jobsByChannel[j.channelId]=[])).push(j);
  maxJobNumberByChannel[j.channelId]=Math.max(maxJobNumberByChannel[j.channelId]||0,j.number);
  const facts=workspaceByChannel[j.channelId]||(workspaceByChannel[j.channelId]={remaining:0});
  if(!facts.current||j.status!=='SCHEDULED'&&facts.current.status==='SCHEDULED'||j.status===facts.current.status&&j.number>facts.current.number||j.status!=='SCHEDULED'&&facts.current.status!=='SCHEDULED'&&j.number>facts.current.number)facts.current=j;
  if(j.status!=='SCHEDULED'){facts.remaining++;workingIds.add(j.channelId)}
  if(j.status==='NEED_IMAGE'||j.status==='WAITING_MUSIC')materials++;
  if(j.status==='READY_RENDER'||j.status==='RENDERING')building++;
  if(j.status==='READY_RENDER')render++;
  if(j.status==='READY_UPLOAD')youtube++;
  if(j.status==='ERROR'&&Boolean(j.error?.trim()))errors++;
  if(j.publishAt){
   const at=Date.parse(j.publishAt);
   if(Number.isFinite(at)&&at>now){
    const current=scheduleByChannel[j.channelId]||(scheduleByChannel[j.channelId]={scheduledCount:0});
    current.scheduledCount++;
    if(!current.nextScheduled||at<Date.parse(current.nextScheduled))current.nextScheduled=j.publishAt;
   }
  }
 }
 const workspaceSummary={working:channels.reduce((n,c)=>n+(workingIds.has(c.id)?1:0),0),materials,building,render,youtube,errors};
 return{jobsByChannel,maxJobNumberByChannel,workspaceByChannel,workspaceSummary,scheduleByChannel,pipeline:buildProductionPipeline(jobs,state.uploadHistory,new Date(now))}
}

export const useJobDerived=create<JobDerivedState>(()=>buildDerived());

useApp.subscribe((state,previous)=>{
 if(state.jobs===previous.jobs&&state.channels===previous.channels&&state.uploadHistory===previous.uploadHistory)return;
 useJobDerived.setState(buildDerived());
});
