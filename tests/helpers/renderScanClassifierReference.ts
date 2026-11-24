// Preserved baseline classifier for regression comparison; never used at runtime.
import type {RenderFolderVideoFile} from '../../src/api';
import type {UploadHistoryRecord,VideoJob} from '../../src/types';
import {trustedUploadFingerprintProof} from '../../src/storageLifecycle';

export type RenderScanPrimaryClass='KNOWN_EXACT'|'UPLOADED_LOCAL_COPY'|'NEW_CANDIDATE'|'NEW_GENERATION'|'LEGACY_IDENTITY_UNPROVEN'|'VERIFY_REQUIRED'|'AMBIGUOUS'|'DUPLICATE_LOCAL'|'INVALID';
export type RenderScanRow={
 file:RenderFolderVideoFile;
 sequence?:number;
 matchedJobId?:string;
 matchedHistoryId?:string;
 youtubeVideoId?:string;
 classification:RenderScanPrimaryClass;
 reason:string;
 currentFingerprint?:string;
 currentFileSize?:number;
 historyFingerprint?:string;
 historyFileSize?:number;
 historyUploadedAt?:string;
 historyJobId?:string;
 historyProofSource?:UploadHistoryRecord['fingerprintProofSource'];
};
export type RenderScanSummary={TOTAL_CLASSIFIED_FILES:number;KNOWN_EXACT:number;UPLOADED_LOCAL_COPY:number;NEW_CANDIDATE:number;NEW_GENERATION:number;LEGACY_IDENTITY_UNPROVEN:number;VERIFY_REQUIRED:number;AMBIGUOUS:number;DUPLICATE_LOCAL:number;INVALID:number};
export type RenderScanImportSkip={path:string;name:string;reason:'ALREADY_KNOWN_PATH'|'SEQUENCE_ALREADY_USED'|'MISSING_SEQUENCE'|'NOT_NEW_CANDIDATE'};
export type RenderScanImportPlan={accepted:RenderScanRow[];skipped:RenderScanImportSkip[]};
export type LegacyRecoveryClass='UPLOADED_EXACT'|'NEW_GENERATION'|'DUPLICATE_CONTENT'|'LEGACY_IDENTITY_UNPROVEN'|'VERIFY_REQUIRED_LEGACY'|'INVALID_MEDIA';
export type LegacyRecoveryDecision={row:RenderScanRow;classification:LegacyRecoveryClass;reason:string};
export type LegacyRecoveryPreview={total:number;uploadedExact:LegacyRecoveryDecision[];newGenerations:LegacyRecoveryDecision[];duplicates:LegacyRecoveryDecision[];legacyUnproven:LegacyRecoveryDecision[];verifyRequired:LegacyRecoveryDecision[];invalid:LegacyRecoveryDecision[]};

export function renderSequence(name:string){const m=name.match(/^0*(\d{1,5})(?:\D|$)/);if(!m)return;const n=Number(m[1]);return Number.isFinite(n)&&n>0?n:undefined}
export function normalizeRenderPath(value:string){let s=String(value||'').trim().replace(/\\/g,'/');while(s.length>1&&s.endsWith('/'))s=s.slice(0,-1);if(/^[A-Z]:\//.test(s))s=s[0].toLowerCase()+s.slice(1);return s}
export function renderPathInsideRoot(path:string,root:string){const p=normalizeRenderPath(path),r=normalizeRenderPath(root);return Boolean(p&&r&&(p===r||p.startsWith(r+'/')))}
export function trustedSha256(value?:string){return /^[a-f0-9]{64}$/i.test(String(value||'').trim())}
function currentFingerprint(file:RenderFolderVideoFile){const fp=String(file.fingerprint||'').trim().toLowerCase();return trustedSha256(fp)?fp:undefined}
function successfulHistory(history:UploadHistoryRecord[],channelId:string){return history.filter(x=>x.channelId===channelId&&x.status==='UPLOADED'&&Boolean(x.youtubeVideoId)&&!x.staleLinkClearedAt)}
function trustedHistory(x:UploadHistoryRecord){return trustedUploadFingerprintProof(x)}
function historyMatchesFile(x:UploadHistoryRecord,file:RenderFolderVideoFile){const fp=currentFingerprint(file);return Boolean(fp&&trustedHistory(x)&&x.sha256.trim().toLowerCase()===fp&&x.fileSize===file.size)}
function historyForJob(history:UploadHistoryRecord[],channelId:string,jobId?:string){if(!jobId)return;return successfulHistory(history,channelId).slice().reverse().find(x=>x.jobId===jobId)}
function latestHistoryAtPath(history:UploadHistoryRecord[],channelId:string,path:string){const p=normalizeRenderPath(path);return successfulHistory(history,channelId).slice().reverse().find(x=>normalizeRenderPath(x.localFilePath)===p)}
function verifiedHistoryForFile(history:UploadHistoryRecord[],channelId:string,file:RenderFolderVideoFile){return successfulHistory(history,channelId).slice().reverse().find(x=>historyMatchesFile(x,file))}
function rowEvidence(base:RenderScanRow,h?:UploadHistoryRecord):RenderScanRow{return h?{...base,matchedHistoryId:h.id,historyJobId:h.jobId,youtubeVideoId:h.youtubeVideoId,historyFingerprint:h.sha256||undefined,historyFileSize:h.fileSize,historyUploadedAt:h.uploadedAt,historyProofSource:h.fingerprintProofSource}:base}
function isHistoricalGeneration(job:VideoJob){return Boolean(job.youtubeVideoId||job.storageLifecycle==='UPLOADED'||job.status==='SCHEDULED'||job.uploadedAt)}
export function canRefreshCurrentGenerationEvidence(job:VideoJob){return !isHistoricalGeneration(job)}
function currentGenerationFingerprint(job:VideoJob){const fp=String(job.currentSourceFingerprint||'').trim().toLowerCase();return trustedSha256(fp)?fp:undefined}
function sourceMatchesCurrentJob(job:VideoJob,file:RenderFolderVideoFile){const fp=currentFingerprint(file),jobFp=currentGenerationFingerprint(job);return Boolean(fp&&jobFp&&fp===jobFp&&job.currentSourceFileSize===file.size)}
function currentGenerationLeaf(candidates:VideoJob[],scoped:VideoJob[],file:RenderFolderVideoFile){
 const active=candidates.filter(j=>!isHistoricalGeneration(j));
 if(!active.length)return;
 // Any descendant generation, including an uploaded/trashed historical leaf,
 // supersedes its predecessor. Never fall back to a referenced predecessor.
 const superseded=new Set(scoped.filter(j=>j.sourcePreviousJobId).map(j=>j.sourcePreviousJobId!));
 const leaves=active.filter(j=>!superseded.has(j.id));
 if(!leaves.length)return;
 return leaves.find(j=>sourceMatchesCurrentJob(j,file))
   ||leaves.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
}
function currentGenerationRecoveryBlocked(job:VideoJob){
 return Boolean(
  job.youtubeVideoId||job.uploadedAt
  ||['UPLOADED','TRASHED','TRASHED_BY_VYRON','QUEUED','UPLOADING'].includes(String(job.storageLifecycle||''))
  ||job.status==='UPLOADING'||job.status==='SCHEDULED'
 );
}
function historicalEvidenceForJob(job:VideoJob,history:UploadHistoryRecord[],channelId:string){return historyForJob(history,channelId,job.id)||successfulHistory(history,channelId).slice().reverse().find(x=>normalizeRenderPath(x.localFilePath)===normalizeRenderPath(job.finalPath||''))}
function staleWrongRootScanJob(job:VideoJob,history:UploadHistoryRecord[],channelId:string,exactRoot:string){if(!job.finalPath||renderPathInsideRoot(job.finalPath,exactRoot))return false;if(historicalEvidenceForJob(job,history,channelId))return false;return job.sourceOrigin==='render-scan'||job.scanRecoveryState==='CROSS_CHANNEL_SCAN_RECOVERY_REQUIRED'}

export function renderFileNeedsFingerprint(file:RenderFolderVideoFile,jobs:VideoJob[],history:UploadHistoryRecord[],channelId:string,exactRoot:string){
 const path=normalizeRenderPath(file.path),sequence=renderSequence(file.name);
 if(!renderPathInsideRoot(path,exactRoot))return false;
 const scoped=jobs.filter(j=>j.channelId===channelId);
 if(scoped.some(j=>normalizeRenderPath(j.finalPath||'')===path))return true;
 const successful=successfulHistory(history,channelId);
 if(successful.some(x=>normalizeRenderPath(x.localFilePath)===path))return true;
 if(sequence&&scoped.some(j=>j.number===sequence))return true;
 // A byte-identical file must also have the same byte size. Hash renamed/moved
 // candidates only when same-channel uploaded history contains that size.
 if(successful.some(x=>trustedHistory(x)&&x.fileSize===file.size))return true;
 return false;
}

/** Prepare the same fingerprint decision once per channel scan. */
export function createRenderFingerprintMatcher(jobs:VideoJob[],history:UploadHistoryRecord[],channelId:string,exactRoot:string){
 const scoped=jobs.filter(j=>j.channelId===channelId),successful=successfulHistory(history,channelId);
 const jobPaths=new Set(scoped.map(j=>normalizeRenderPath(j.finalPath||'')));
 const sequences=new Set(scoped.map(j=>j.number));
 const historyPaths=new Set(successful.map(x=>normalizeRenderPath(x.localFilePath)));
 const uploadedSizes=new Set(successful.filter(trustedHistory).map(x=>x.fileSize));
 return (file:RenderFolderVideoFile)=>{
  const path=normalizeRenderPath(file.path),sequence=renderSequence(file.name);
  if(!renderPathInsideRoot(path,exactRoot))return false;
  return jobPaths.has(path)||historyPaths.has(path)||Boolean(sequence&&sequences.has(sequence))||uploadedSizes.has(file.size);
 }
}

export function classifyChannelRenderFiles(files:RenderFolderVideoFile[],jobs:VideoJob[],history:UploadHistoryRecord[],channelId:string,exactRoot:string):RenderScanRow[]{
 const scoped=jobs.filter(j=>j.channelId===channelId),seen=new Set<string>(),historyRows=successfulHistory(history,channelId);
 return files.map(file=>{
  const path=normalizeRenderPath(file.path),sequence=renderSequence(file.name),fp=currentFingerprint(file);
  const base=(classification:RenderScanPrimaryClass,reason:string,matchedJobId?:string):RenderScanRow=>({file,sequence,matchedJobId,classification,reason,currentFingerprint:fp,currentFileSize:file.size});
  if(!renderPathInsideRoot(path,exactRoot))return base('INVALID','OUTSIDE_EXACT_CHANNEL_ROOT');
  if(seen.has(path))return base('DUPLICATE_LOCAL','DUPLICATE_CANONICAL_PATH');seen.add(path);

  const verified=verifiedHistoryForFile(historyRows,channelId,file);
  if(verified)return rowEvidence(base('UPLOADED_LOCAL_COPY',normalizeRenderPath(verified.localFilePath)===path?'FINGERPRINT_VERIFIED_EXACT_PATH_UPLOAD':'FINGERPRINT_VERIFIED_SAME_CHANNEL_UPLOAD',verified.jobId),verified);

  const exactJobs=scoped.filter(j=>normalizeRenderPath(j.finalPath||'')===path);
  const activeExact=currentGenerationLeaf(exactJobs,scoped,file);
  if(activeExact){
   if(currentGenerationRecoveryBlocked(activeExact))return base('VERIFY_REQUIRED','CURRENT_LEAF_RECOVERY_BLOCKED',activeExact.id);
   if(fp&&sourceMatchesCurrentJob(activeExact,file))return base('KNOWN_EXACT','CURRENT_GENERATION_FINGERPRINT_MATCH',activeExact.id);
   if(fp)return base('NEW_GENERATION','ACTIVE_EXACT_PATH_SOURCE_CHANGED',activeExact.id);
   return base('VERIFY_REQUIRED','CURRENT_FINGERPRINT_REQUIRED_FOR_ACTIVE_PATH',activeExact.id);
  }

  const historicalExact=exactJobs.find(j=>isHistoricalGeneration(j));
  const pathHistory=latestHistoryAtPath(historyRows,channelId,path);
  if(historicalExact||pathHistory){
   const proof=historicalExact?historicalEvidenceForJob(historicalExact,historyRows,channelId):pathHistory;
   if(!fp)return rowEvidence(base('VERIFY_REQUIRED','CURRENT_FINGERPRINT_REQUIRED_FOR_HISTORICAL_PATH',historicalExact?.id||proof?.jobId),proof);
   // A historical job's own current-generation fingerprint is enough to prove that
   // the same bytes are still sitting on disk. Do not manufacture a NEW generation
   // merely because trusted uploadHistory is missing; YouTube ID/uploadedAt/trash wins.
   if(historicalExact&&sourceMatchesCurrentJob(historicalExact,file)){
    return rowEvidence(base('UPLOADED_LOCAL_COPY','HISTORICAL_JOB_CURRENT_GENERATION_MATCH',historicalExact.id),proof);
   }
   if(proof&&trustedHistory(proof))return rowEvidence(base('NEW_GENERATION','EXACT_PATH_PHYSICAL_FINGERPRINT_CHANGED',historicalExact?.id||proof.jobId),proof);
   // Legacy upload records without trusted fingerprint must not deadlock genuinely changed bytes.
   return rowEvidence(base('NEW_GENERATION','LEGACY_HISTORY_WITHOUT_FINGERPRINT_CURRENT_BYTES_UNSEEN',historicalExact?.id||proof?.jobId),proof);
  }

  if(fp){
   const currentJob=scoped.find(j=>!isHistoricalGeneration(j)&&currentGenerationFingerprint(j)===fp&&j.currentSourceFileSize===file.size);
   if(currentJob)return base('KNOWN_EXACT','CURRENT_GENERATION_FINGERPRINT_MATCH',currentJob.id);
  }

  if(!sequence)return base('INVALID','SEQUENCE_NOT_FOUND');

  const sameNumber=scoped.filter(j=>j.number===sequence&&!staleWrongRootScanJob(j,historyRows,channelId,exactRoot));
  const activeSame=currentGenerationLeaf(sameNumber,scoped,file);
  if(activeSame){
   if(currentGenerationRecoveryBlocked(activeSame))return base('VERIFY_REQUIRED','CURRENT_LEAF_RECOVERY_BLOCKED',activeSame.id);
   if(fp&&sourceMatchesCurrentJob(activeSame,file))return base('KNOWN_EXACT','SAME_ACTIVE_GENERATION_FINGERPRINT_MATCH',activeSame.id);
   if(fp)return base('NEW_GENERATION','ACTIVE_SEQUENCE_REUSED_WITH_NEW_FINGERPRINT',activeSame.id);
   return base('VERIFY_REQUIRED','CURRENT_FINGERPRINT_REQUIRED_FOR_REUSED_SEQUENCE',activeSame.id);
  }

  const historicalSame=sameNumber.find(j=>isHistoricalGeneration(j));
  if(historicalSame){
   const proof=historicalEvidenceForJob(historicalSame,historyRows,channelId);
   if(!fp)return rowEvidence(base('VERIFY_REQUIRED','CURRENT_FINGERPRINT_REQUIRED_FOR_REUSED_SEQUENCE',historicalSame.id),proof);
   if(proof&&trustedHistory(proof))return rowEvidence(base('NEW_GENERATION','HISTORICAL_SEQUENCE_REUSED_WITH_NEW_FINGERPRINT',historicalSame.id),proof);
   return rowEvidence(base('NEW_GENERATION','LEGACY_SEQUENCE_WITHOUT_FINGERPRINT_CURRENT_BYTES_UNSEEN',historicalSame.id),proof);
  }

  return base('NEW_CANDIDATE','NO_EXISTING_CHANNEL_GENERATION_EVIDENCE');
 });
}
