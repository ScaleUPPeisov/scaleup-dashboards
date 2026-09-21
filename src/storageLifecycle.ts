import type {FingerprintCacheEntry,ProjectLifecycleRecord,UploadHistoryRecord,VideoJob} from './types';

export const STORAGE_STATE_VERSION=10;
export function successfulUploadForHash(history:UploadHistoryRecord[],sha256:string,channelId?:string,fileSize?:number){const h=sha256.trim().toLowerCase();return history.slice().reverse().find(x=>x.status==='UPLOADED'&&Boolean(x.youtubeVideoId)&&!x.staleLinkClearedAt&&(!channelId||x.channelId===channelId)&&(fileSize==null||x.fileSize===fileSize)&&x.sha256.toLowerCase()===h)}
export function duplicateUploadIds(jobs:VideoJob[],fingerprints:Record<string,{sha256:string}>,history:UploadHistoryRecord[],allowOverrideIds:Set<string>=new Set()){return jobs.filter(j=>{if(allowOverrideIds.has(j.id))return false;const fp=fingerprints[j.id];return Boolean(fp&&successfulUploadForHash(history,fp.sha256,j.channelId,(fp as {sha256:string;size?:number}).size))}).map(j=>j.id)}
export function recordVerifiedUpload(history:UploadHistoryRecord[],record:Omit<UploadHistoryRecord,'id'|'status'>){if(!record.youtubeVideoId?.trim())throw new Error('VERIFIED_VIDEO_ID_REQUIRED');if(!record.sha256?.trim())throw new Error('SHA256_REQUIRED');return[...history,{...record,processingState:record.processingState||'UPLOAD_ACCEPTED',id:crypto.randomUUID(),status:'UPLOADED' as const}]}
export function updateUploadProcessing(history:UploadHistoryRecord[],jobId:string,patch:Partial<Pick<UploadHistoryRecord,'processingState'|'processingCheckedAt'|'processingStatus'|'processingError'|'readyAt'|'identityVerifiedAt'>>){return history.map(x=>x.jobId===jobId&&x.status==='UPLOADED'?{...x,...patch}:x)}
export function cleanupEligibleUpload(x:UploadHistoryRecord,job?:VideoJob){if(x.status!=='UPLOADED'||x.processingState!=='READY'||x.remoteExists===false||!x.youtubeVideoId?.trim()||!x.profileId?.trim()||!x.localFilePath?.trim()||!trustedGenerationHash(x.sha256)||Boolean(x.trashedAt)||x.sourceLifecycle!=='PRESENT')return false;if(job){if(job.id!==x.jobId||job.finalPath!==x.localFilePath)return false;if(!currentGenerationMatchesProof(job,x))return false}return true}
export function cacheHit(entry:FingerprintCacheEntry|undefined,size:number,mtimeMs:number){return Boolean(entry&&entry.size===size&&entry.mtimeMs===mtimeMs&&/^[a-f0-9]{64}$/i.test(entry.sha256))}
export function nextProjectLifecycle(base:ProjectLifecycleRecord,history:UploadHistoryRecord[]){const proof=base.jobId?history.slice().reverse().find(x=>x.jobId===base.jobId&&x.status==='UPLOADED'&&x.processingState==='READY'&&Boolean(x.youtubeVideoId)):undefined;return{...base,status:(base.renderExists&&base.renderPath&&proof?'SAFE_TO_CLEAN':'RENDERED') as ProjectLifecycleRecord['status'],youtubeVideoId:proof?.youtubeVideoId,uploadedAt:proof?.uploadedAt,updatedAt:new Date().toISOString()}}
export function canSafelyCleanProject(x:ProjectLifecycleRecord){return x.status==='SAFE_TO_CLEAN'&&Boolean(x.renderExists&&x.renderPath&&x.youtubeVideoId&&x.jobId)}
export function uploadedJobs(history:UploadHistoryRecord[]){return new Set(history.filter(x=>x.status==='UPLOADED'&&Boolean(x.youtubeVideoId)).map(x=>x.jobId))}
export function markHistoryTrashed(history:UploadHistoryRecord[],jobId:string,at=new Date().toISOString(),trashOperationId?:string):UploadHistoryRecord[]{return history.map(x=>x.jobId===jobId&&x.status==='UPLOADED'&&x.processingState==='READY'&&!x.trashedAt?{...x,trashedAt:at,trashOperationId,sourceLifecycle:'TRASHED_BY_VYRON' as const,sourceCheckedAt:at}:x)}
export function markHistorySourceState(history:UploadHistoryRecord[],id:string,sourceLifecycle:UploadHistoryRecord['sourceLifecycle'],at=new Date().toISOString()){return history.map(x=>x.id===id?{...x,sourceLifecycle,sourceCheckedAt:at}:x)}


export type CanonicalUploadState='NEW'|'QUEUED'|'UPLOADING'|'UPLOAD_ACCEPTED'|'VERIFY_REQUIRED'|'YOUTUBE_PROCESSING'|'READY'|'UPLOAD_FAILED'|'PROCESSING_FAILED'|'REJECTED'|'REMOTE_MISSING'|'SOURCE_MISSING'|'TRASHED';
export function latestUploadRecord(history:UploadHistoryRecord[],jobId:string){return history.slice().reverse().find(x=>x.jobId===jobId&&x.status==='UPLOADED'&&!x.staleLinkClearedAt)}
function trustedGenerationHash(value?:string){return /^[a-f0-9]{64}$/i.test(String(value||'').trim())}
function currentGenerationMatchesProof(job:VideoJob,proof?:UploadHistoryRecord){
 const current=String(job.currentSourceFingerprint||'').trim().toLowerCase();
 if(!proof||!trustedGenerationHash(current)||!trustedGenerationHash(proof.sha256))return false;
 return current===proof.sha256.trim().toLowerCase()&&Number(job.currentSourceFileSize)===Number(proof.fileSize);
}
export function classifyUploadState(job:VideoJob,history:UploadHistoryRecord[]):CanonicalUploadState{
 const proof=latestUploadRecord(history,job.id),videoId=(job.youtubeVideoId||proof?.youtubeVideoId||'').trim();
 if(job.storageLifecycle==='TRASHED'||job.storageLifecycle==='TRASHED_BY_VYRON')return'TRASHED';
 if(videoId||job.storageLifecycle==='UPLOADED'){
  if(job.finalPath&&!currentGenerationMatchesProof(job,proof))return'VERIFY_REQUIRED';
  const remote=job.remoteExists??proof?.remoteExists,processing=job.processingState||proof?.processingState;
  if(remote===false)return'REMOTE_MISSING';
  if(processing==='READY')return'READY';
  if(processing==='YOUTUBE_PROCESSING')return'YOUTUBE_PROCESSING';
  if(processing==='PROCESSING_FAILED')return'PROCESSING_FAILED';
  if(processing==='REJECTED')return'REJECTED';
  if(remote===true&&(job.identityVerifiedAt||proof?.identityVerifiedAt))return'UPLOAD_ACCEPTED';
  if(job.identityVerifiedAt||proof?.identityVerifiedAt)return'UPLOAD_ACCEPTED';
  return'VERIFY_REQUIRED';
 }
 if(!job.finalPath)return'SOURCE_MISSING';
 if(job.storageLifecycle==='QUEUED')return'QUEUED';
 if(job.status==='UPLOADING'||job.storageLifecycle==='UPLOADING')return'UPLOADING';
 if(job.status==='ERROR'||job.storageLifecycle==='FAILED')return'UPLOAD_FAILED';
 return'NEW';
}
export function uploadStateCounters(jobs:VideoJob[],history:UploadHistoryRecord[]){
 const out={NEW:0,ON_YOUTUBE:0,PROCESSING:0,VERIFY_REQUIRED:0,ERRORS:0,ALL:jobs.length};
 for(const job of jobs){const state=classifyUploadState(job,history);if(state==='NEW')out.NEW++;else if(state==='READY'||state==='UPLOAD_ACCEPTED')out.ON_YOUTUBE++;else if(state==='YOUTUBE_PROCESSING'||state==='QUEUED'||state==='UPLOADING')out.PROCESSING++;else if(state==='VERIFY_REQUIRED')out.VERIFY_REQUIRED++;else if(state==='UPLOAD_FAILED'||state==='PROCESSING_FAILED'||state==='REJECTED'||state==='REMOTE_MISSING'||state==='SOURCE_MISSING')out.ERRORS++}
 return out;
}
export function updateUploadRemoteEvidence(history:UploadHistoryRecord[],jobId:string,patch:Partial<Pick<UploadHistoryRecord,'remoteExists'|'remoteCheckedAt'|'processingState'|'processingCheckedAt'|'processingStatus'|'processingError'|'readyAt'|'identityVerifiedAt'|'publishAt'>>){return history.map(x=>x.jobId===jobId&&x.status==='UPLOADED'&&!x.staleLinkClearedAt?{...x,...patch}:x)}
export function clearStaleUploadLink(history:UploadHistoryRecord[],jobId:string,videoId:string,at=new Date().toISOString(),reason='REMOTE_MISSING'){return history.map(x=>x.jobId===jobId&&x.youtubeVideoId===videoId&&!x.staleLinkClearedAt?{...x,staleLinkClearedAt:at,staleLinkClearReason:reason}:x)}
export function isRenderReadyTransitionAllowed(job:VideoJob){return !job.youtubeVideoId&&(job.status==='READY_RENDER'||job.status==='RENDERING')}
