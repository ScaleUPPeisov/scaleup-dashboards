import type {JobStatus,VideoJob} from './types';
import {JOB_STATUSES} from './jobSummary';

export type JobRuntimeIndex={
  byId:Record<string,VideoJob>;
  orderedIds:string[];
  idsByChannel:Record<string,string[]>;
  idsByStatus:Record<JobStatus,string[]>;
};

function emptyStatusIds():Record<JobStatus,string[]>{
  return {NEED_IMAGE:[],WAITING_MUSIC:[],READY_RENDER:[],RENDERING:[],READY_UPLOAD:[],UPLOADING:[],SCHEDULED:[],ERROR:[]};
}
function sortIds(ids:string[],byId:Record<string,VideoJob>){
  return ids.sort((a,b)=>(byId[a]?.number||0)-(byId[b]?.number||0));
}
export function buildJobRuntimeIndex(jobs:VideoJob[]):JobRuntimeIndex{
  const byId:Record<string,VideoJob>={},idsByChannel:Record<string,string[]>={},idsByStatus=emptyStatusIds();
  for(const j of jobs){
    byId[j.id]=j;
    (idsByChannel[j.channelId]||(idsByChannel[j.channelId]=[])).push(j.id);
    idsByStatus[j.status].push(j.id);
  }
  const orderedIds=sortIds(jobs.map(j=>j.id),byId);
  for(const ids of Object.values(idsByChannel))sortIds(ids,byId);
  for(const status of JOB_STATUSES)sortIds(idsByStatus[status],byId);
  return {byId,orderedIds,idsByChannel,idsByStatus};
}
export function patchJobRuntimeIndex(source:JobRuntimeIndex,replacements:Array<{before:VideoJob;after:VideoJob}>,allJobs:VideoJob[]):JobRuntimeIndex{
  if(!replacements.length)return source;
  if(replacements.some(x=>x.before.channelId!==x.after.channelId||x.before.number!==x.after.number))return buildJobRuntimeIndex(allJobs);
  const byId={...source.byId};
  const affected=new Set<JobStatus>();
  for(const {before,after} of replacements){
    byId[after.id]=after;
    if(before.status!==after.status){affected.add(before.status);affected.add(after.status)}
  }
  if(!affected.size)return {...source,byId};
  const idsByStatus={...source.idsByStatus};
  for(const status of affected){
    idsByStatus[status]=source.orderedIds.filter(id=>byId[id]?.status===status);
  }
  return {...source,byId,idsByStatus};
}
