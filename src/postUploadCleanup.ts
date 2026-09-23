import type {UploadHistoryRecord,VideoJob} from './types';
import {trustedUploadFingerprintProof} from './storageLifecycle';

function basename(path:string){return path.split(/[\\/]/).pop()||path}
function isAppleDouble(path:string){return basename(path).startsWith('._')}

export function postUploadCleanupEligible(row:UploadHistoryRecord,job?:VideoJob){
 const acceptedState=row.processingState==='UPLOAD_ACCEPTED'||row.processingState==='YOUTUBE_PROCESSING'||row.processingState==='READY';
 if(row.status!=='UPLOADED'||!acceptedState||!row.identityVerifiedAt||row.remoteExists===false||!row.youtubeVideoId?.trim()||!row.profileId?.trim()||!row.localFilePath?.trim()||!trustedUploadFingerprintProof(row)||Boolean(row.trashedAt)||row.sourceLifecycle!=='PRESENT')return false;
 if(job){
  if(job.id!==row.jobId||job.channelId!==row.channelId||job.finalPath!==row.localFilePath)return false;
  const current=String(job.currentSourceFingerprint||'').trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/i.test(current)||current!==row.sha256.trim().toLowerCase()||Number(job.currentSourceFileSize)!==Number(row.fileSize))return false;
 }
 return true;
}

export function latestChannelUploadBatchId(history:UploadHistoryRecord[],channelId:string){
 return history.slice().reverse().find(row=>
  row.channelId===channelId&&
  row.status==='UPLOADED'&&
  Boolean(row.youtubeVideoId?.trim())&&
  Boolean(row.batchId?.trim())&&
  trustedUploadFingerprintProof(row)
 )?.batchId;
}

export function confirmedCleanupCandidates(
 history:UploadHistoryRecord[],
 jobs:VideoJob[],
 channelId:string,
 batchId?:string
){
 const byJob=new Map(jobs.filter(job=>job.channelId===channelId).map(job=>[job.id,job] as const));
 const seen=new Set<string>();
 const out:UploadHistoryRecord[]=[];
 for(const row of history.slice().reverse()){
  if(row.channelId!==channelId||seen.has(row.jobId))continue;
  if(batchId&&row.batchId!==batchId)continue;
  if(isAppleDouble(row.localFilePath||row.originalFilename||''))continue;
  const job=byJob.get(row.jobId);
  if(!job||job.channelId!==channelId||!postUploadCleanupEligible(row,job))continue;
  seen.add(row.jobId);
  out.push(row);
 }
 return out.reverse();
}

export function cleanupCandidateIds(rows:UploadHistoryRecord[]){return rows.map(row=>row.jobId)}
export function cleanupCandidateBytes(rows:UploadHistoryRecord[]){const seen=new Set<string>();let total=0;for(const row of rows.slice().reverse()){if(seen.has(row.jobId))continue;seen.add(row.jobId);if(Number.isFinite(row.fileSize))total+=row.fileSize}return total}
