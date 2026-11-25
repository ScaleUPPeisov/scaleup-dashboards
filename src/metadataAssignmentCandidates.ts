import type {Channel,VideoJob} from './types';

/** Identify jobs which can still receive a queue record. */
export function metadataAssignmentKey(job:VideoJob){return `${job.channelId}:${job.id}:${job.folder}`}
export function needsMetadataAssignment(job:VideoJob){
 return Boolean(job.folder)&&!job.youtubeVideoId&&job.metadataSource!=='queue'&&job.metadataSource!=='import'&&job.metadataSource!=='ai'&&!job.metadataLocked;
}
/** Preserve the original job/channel ordering while skipping already attempted work. */
export function metadataChannelsNeedingAssignment(jobs:VideoJob[],attempted:ReadonlySet<string>){
 const ids=new Set<string>();
 for(const job of jobs)if(needsMetadataAssignment(job)&&!attempted.has(metadataAssignmentKey(job)))ids.add(job.channelId);
 return ids;
}

/** Only fields that affect queue assignment should schedule another scan. */
export function metadataAssignmentInputsChanged(
 previous:{channels:Channel[];jobs:VideoJob[]},
 next:{channels:Channel[];jobs:VideoJob[]},
){
 if(previous.channels!==next.channels){
  if(previous.channels.length!==next.channels.length)return true;
  for(let i=0;i<next.channels.length;i++){
   const a=previous.channels[i],b=next.channels[i];
   if(a!==b&&(a.id!==b.id||a.name!==b.name))return true;
  }
 }
 if(previous.jobs!==next.jobs){
  if(previous.jobs.length!==next.jobs.length)return true;
  for(let i=0;i<next.jobs.length;i++){
   const a=previous.jobs[i],b=next.jobs[i];
   if(a!==b&&(a.id!==b.id||a.channelId!==b.channelId||a.number!==b.number||a.folder!==b.folder
    ||(a.metadataSource||'')!==(b.metadataSource||'')||Boolean(a.metadataLocked)!==Boolean(b.metadataLocked)
    ||(a.youtubeVideoId||'')!==(b.youtubeVideoId||'')))return true;
  }
 }
 return false;
}
