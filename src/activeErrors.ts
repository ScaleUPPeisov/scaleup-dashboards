import type {JobStatus,VideoJob} from './types';

export function resolvedJobStatus(job:VideoJob):JobStatus{
  if(job.finalPath)return 'READY_UPLOAD';
  if(job.coverPath&&job.tracksCount>=job.minTracks)return 'READY_RENDER';
  if(job.coverPath)return 'WAITING_MUSIC';
  return 'NEED_IMAGE';
}
export function activeJobErrors(jobs:VideoJob[]){return jobs.filter(j=>j.status==='ERROR'&&Boolean(j.error?.trim()))}
export function activeErrorCount(jobs:VideoJob[]){return activeJobErrors(jobs).length}
export function clearActiveJobErrorPatch(job:VideoJob):Pick<VideoJob,'status'|'error'>{return{status:resolvedJobStatus(job),error:undefined}}
