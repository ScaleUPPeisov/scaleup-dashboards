import type {JobStatus,VideoJob} from './types';
import {emptyProductionPipelineCounts,productionPipelineStage,type ProductionPipelineStage} from './productionPipeline';

export const JOB_STATUSES:JobStatus[]=['NEED_IMAGE','WAITING_MUSIC','READY_RENDER','RENDERING','READY_UPLOAD','UPLOADING','SCHEDULED','ERROR'];

export type JobSummary={
  total:number;
  activeErrors:number;
  byStatus:Record<JobStatus,number>;
  byChannel:Record<string,number>;
  byChannelStatus:Record<string,Partial<Record<JobStatus,number>>>;
  maxNumberByChannel:Record<string,number>;
  readyRender:number;
  rendering:number;
  pipelineCounts:Record<ProductionPipelineStage,number>;
  revision:number;
};

function emptyStatus():Record<JobStatus,number>{
  return {NEED_IMAGE:0,WAITING_MUSIC:0,READY_RENDER:0,RENDERING:0,READY_UPLOAD:0,UPLOADING:0,SCHEDULED:0,ERROR:0};
}
export function emptyJobSummary(revision=0):JobSummary{
  return {total:0,activeErrors:0,byStatus:emptyStatus(),byChannel:{},byChannelStatus:{},maxNumberByChannel:{},readyRender:0,rendering:0,pipelineCounts:emptyProductionPipelineCounts(),revision};
}
function isActiveError(j:VideoJob){return j.status==='ERROR'&&Boolean(j.error?.trim())}
function cloneSummary(source:JobSummary,revision=source.revision+1):JobSummary{
  const byChannelStatus:JobSummary['byChannelStatus']={};
  for(const [id,row] of Object.entries(source.byChannelStatus))byChannelStatus[id]={...row};
  return {...source,byStatus:{...source.byStatus},byChannel:{...source.byChannel},byChannelStatus,maxNumberByChannel:{...source.maxNumberByChannel},pipelineCounts:{...source.pipelineCounts},revision};
}
function addMutable(s:JobSummary,j:VideoJob){
  s.total++;
  s.byStatus[j.status]=(s.byStatus[j.status]||0)+1;
  s.byChannel[j.channelId]=(s.byChannel[j.channelId]||0)+1;
  const row=s.byChannelStatus[j.channelId]||(s.byChannelStatus[j.channelId]={});
  row[j.status]=(row[j.status]||0)+1;
  s.maxNumberByChannel[j.channelId]=Math.max(s.maxNumberByChannel[j.channelId]||0,j.number||0);
  if(j.status==='READY_RENDER')s.readyRender++;
  if(j.status==='RENDERING')s.rendering++;
  if(isActiveError(j))s.activeErrors++;
  s.pipelineCounts[productionPipelineStage(j)]=(s.pipelineCounts[productionPipelineStage(j)]||0)+1;
}
function removeMutable(s:JobSummary,j:VideoJob){
  s.total=Math.max(0,s.total-1);
  s.byStatus[j.status]=Math.max(0,(s.byStatus[j.status]||0)-1);
  s.byChannel[j.channelId]=Math.max(0,(s.byChannel[j.channelId]||0)-1);
  const row=s.byChannelStatus[j.channelId]||(s.byChannelStatus[j.channelId]={});
  row[j.status]=Math.max(0,(row[j.status]||0)-1);
  if(j.status==='READY_RENDER')s.readyRender=Math.max(0,s.readyRender-1);
  if(j.status==='RENDERING')s.rendering=Math.max(0,s.rendering-1);
  if(isActiveError(j))s.activeErrors=Math.max(0,s.activeErrors-1);
  const pipelineStage=productionPipelineStage(j);s.pipelineCounts[pipelineStage]=Math.max(0,(s.pipelineCounts[pipelineStage]||0)-1);
}
export function buildJobSummary(jobs:VideoJob[],revision=0):JobSummary{
  const s=emptyJobSummary(revision);
  for(const j of jobs)addMutable(s,j);
  return s;
}
export function appendJobsToSummary(source:JobSummary,jobs:VideoJob[]):JobSummary{
  if(!jobs.length)return source;
  const s=cloneSummary(source);
  for(const j of jobs)addMutable(s,j);
  return s;
}
export function replaceJobsInSummary(source:JobSummary,replacements:Array<{before:VideoJob;after:VideoJob}>):JobSummary{
  if(!replacements.length)return source;
  if(replacements.some(x=>x.before.channelId!==x.after.channelId||x.before.number!==x.after.number))return source;
  const relevant=replacements.filter(({before,after})=>before.status!==after.status||isActiveError(before)!==isActiveError(after)||productionPipelineStage(before)!==productionPipelineStage(after));
  if(!relevant.length)return source;
  const s=cloneSummary(source);
  for(const {before,after} of relevant){removeMutable(s,before);addMutable(s,after)}
  return s;
}
