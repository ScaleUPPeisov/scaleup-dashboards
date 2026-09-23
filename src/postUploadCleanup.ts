import type {UploadHistoryRecord,VideoJob} from './types';
import {cleanupEligibleUpload,trustedUploadFingerprintProof} from './storageLifecycle';

function basename(path:string){return path.split(/[\\/]/).pop()||path}
function isAppleDouble(path:string){return basename(path).startsWith('._')}

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
  if(!job||job.channelId!==channelId||!cleanupEligibleUpload(row,job))continue;
  seen.add(row.jobId);
  out.push(row);
 }
 return out.reverse();
}

export function cleanupCandidateIds(rows:UploadHistoryRecord[]){return rows.map(row=>row.jobId)}
export function cleanupCandidateBytes(rows:UploadHistoryRecord[]){return rows.reduce((sum,row)=>sum+(Number.isFinite(row.fileSize)?row.fileSize:0),0)}
