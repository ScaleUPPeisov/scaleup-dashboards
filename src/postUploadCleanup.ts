import type {UploadHistoryRecord,VideoJob} from './types';
import {trustedUploadFingerprintProof} from './storageLifecycle';

function basename(path:string){return path.split(/[\\/]/).pop()||path}
function isAppleDouble(path:string){return basename(path).startsWith('._')}
export function cleanupPathIdentity(path:string){return path.trim().replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/\/$/,'')}
function mediaProofIdentity(row:UploadHistoryRecord){return `${String(row.sha256||'').trim().toLowerCase()}:${Number(row.fileSize)||0}`}

export function postUploadCleanupEligible(row:UploadHistoryRecord,job?:VideoJob){
 // Cleanup is intentionally stricter than upload-success classification: YouTube processing
 // must be fully READY before VYRON may offer the local source for Trash.
 if(row.status!=='UPLOADED'||row.processingState!=='READY'||!row.identityVerifiedAt||row.remoteExists===false||!row.youtubeVideoId?.trim()||!row.profileId?.trim()||!row.localFilePath?.trim()||!trustedUploadFingerprintProof(row)||Boolean(row.trashedAt)||row.sourceLifecycle!=='PRESENT')return false;
 if(job){
  if(job.id!==row.jobId||job.channelId!==row.channelId||job.finalPath!==row.localFilePath)return false;
  const current=String(job.currentSourceFingerprint||'').trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/i.test(current)||current!==row.sha256.trim().toLowerCase()||Number(job.currentSourceFileSize)!==Number(row.fileSize))return false;
  if(job.status==='UPLOADING'||job.storageLifecycle==='UPLOADING')return false;
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

export function confirmedGlobalCleanupCandidates(
 history:UploadHistoryRecord[],
 jobs:VideoJob[],
 blockedJobIds:Iterable<string>=[],
 blockedPaths:Iterable<string>=[]
){
 const blockedJobs=new Set(blockedJobIds);
 const blockedPhysicalPaths=new Set(Array.from(blockedPaths,cleanupPathIdentity));
 const byJob=new Map(jobs.map(job=>[job.id,job] as const));
 const latestSeen=new Set<string>();
 const candidates:UploadHistoryRecord[]=[];
 for(const row of history.slice().reverse()){
  if(latestSeen.has(row.jobId))continue;
  latestSeen.add(row.jobId);
  if(blockedJobs.has(row.jobId)||isAppleDouble(row.localFilePath||row.originalFilename||''))continue;
  const pathIdentity=cleanupPathIdentity(row.localFilePath||'');
  if(!pathIdentity||blockedPhysicalPaths.has(pathIdentity))continue;
  const job=byJob.get(row.jobId);
  if(!job||!postUploadCleanupEligible(row,job))continue;
  candidates.push(row);
 }
 // Fail safe: if one physical path is claimed by multiple successful records, none of those
 // records is globally cleanable until the ambiguity is resolved.
 const pathCounts=new Map<string,number>();
 const proofCounts=new Map<string,number>();
 for(const row of candidates){
  const path=cleanupPathIdentity(row.localFilePath);pathCounts.set(path,(pathCounts.get(path)||0)+1);
  const proof=mediaProofIdentity(row);proofCounts.set(proof,(proofCounts.get(proof)||0)+1);
 }
 // Proof duplicates are also excluded. This is deliberately conservative and catches the
 // same physical media referenced through aliased/symlinked paths without risking deletion.
 return candidates.filter(row=>pathCounts.get(cleanupPathIdentity(row.localFilePath))===1&&proofCounts.get(mediaProofIdentity(row))===1).reverse();
}

export function cleanupCandidateIds(rows:UploadHistoryRecord[]){return rows.map(row=>row.jobId)}
export function cleanupCandidateBytes(rows:UploadHistoryRecord[]){const seen=new Set<string>();let total=0;for(const row of rows.slice().reverse()){const key=cleanupPathIdentity(row.localFilePath)||row.jobId;if(seen.has(key))continue;seen.add(key);if(Number.isFinite(row.fileSize))total+=row.fileSize}return total}
