import type {VideoJob} from './types';

export function clearDeletedProjectWorkspaces(jobs:VideoJob[],deletedJobIds:string[]):VideoJob[]{
 const deleted=new Set(deletedJobIds);
 if(!deleted.size)return jobs;
 return jobs.map(job=>{
  if(!deleted.has(job.id))return job;
  const status=job.youtubeVideoId||job.status==='SCHEDULED'||job.status==='UPLOADING'
   ?job.status
   :job.finalPath?'READY_UPLOAD':'NEED_IMAGE';
  return{...job,folder:'',coverPath:undefined,tracksCount:0,renderQueuedAt:undefined,endlumeSentAt:undefined,error:undefined,status};
 });
}
