import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord,VideoJob} from './types';

export type RenderScanPrimaryClass='KNOWN_EXACT'|'UPLOADED_LOCAL_COPY'|'NEW_CANDIDATE'|'NEW_GENERATION'|'VERIFY_REQUIRED'|'AMBIGUOUS'|'DUPLICATE_LOCAL'|'INVALID';
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
};
export type RenderScanSummary={TOTAL_CLASSIFIED_FILES:number;KNOWN_EXACT:number;UPLOADED_LOCAL_COPY:number;NEW_CANDIDATE:number;NEW_GENERATION:number;VERIFY_REQUIRED:number;AMBIGUOUS:number;DUPLICATE_LOCAL:number;INVALID:number};
export type RenderScanImportSkip={path:string;name:string;reason:'ALREADY_KNOWN_PATH'|'SEQUENCE_ALREADY_USED'|'MISSING_SEQUENCE'|'NOT_NEW_CANDIDATE'};
export type RenderScanImportPlan={accepted:RenderScanRow[];skipped:RenderScanImportSkip[]};

export function renderSequence(name:string){const m=name.match(/^0*(\d{1,5})(?:\D|$)/);if(!m)return;const n=Number(m[1]);return Number.isFinite(n)&&n>0?n:undefined}
export function normalizeRenderPath(value:string){let s=String(value||'').trim().replace(/\\/g,'/');while(s.length>1&&s.endsWith('/'))s=s.slice(0,-1);if(/^[A-Z]:\//.test(s))s=s[0].toLowerCase()+s.slice(1);return s}
export function renderPathInsideRoot(path:string,root:string){const p=normalizeRenderPath(path),r=normalizeRenderPath(root);return Boolean(p&&r&&(p===r||p.startsWith(r+'/')))}
export function trustedSha256(value?:string){return /^[a-f0-9]{64}$/i.test(String(value||'').trim())}
function currentFingerprint(file:RenderFolderVideoFile){const fp=String(file.fingerprint||'').trim().toLowerCase();return trustedSha256(fp)?fp:undefined}
function successfulHistory(history:UploadHistoryRecord[],channelId:string){return history.filter(x=>x.channelId===channelId&&x.status==='UPLOADED'&&Boolean(x.youtubeVideoId)&&!x.staleLinkClearedAt)}
function trustedHistory(x:UploadHistoryRecord){return trustedSha256(x.sha256)&&Number.isFinite(x.fileSize)&&x.fileSize>0}
function historyMatchesFile(x:UploadHistoryRecord,file:RenderFolderVideoFile){const fp=currentFingerprint(file);return Boolean(fp&&trustedHistory(x)&&x.sha256.trim().toLowerCase()===fp&&x.fileSize===file.size)}
function historyForJob(history:UploadHistoryRecord[],channelId:string,jobId?:string){if(!jobId)return;return successfulHistory(history,channelId).slice().reverse().find(x=>x.jobId===jobId)}
function latestHistoryAtPath(history:UploadHistoryRecord[],channelId:string,path:string){const p=normalizeRenderPath(path);return successfulHistory(history,channelId).slice().reverse().find(x=>normalizeRenderPath(x.localFilePath)===p)}
function verifiedHistoryForFile(history:UploadHistoryRecord[],channelId:string,file:RenderFolderVideoFile){return successfulHistory(history,channelId).slice().reverse().find(x=>historyMatchesFile(x,file))}
function rowEvidence(base:RenderScanRow,h?:UploadHistoryRecord):RenderScanRow{return h?{...base,matchedHistoryId:h.id,historyJobId:h.jobId,youtubeVideoId:h.youtubeVideoId,historyFingerprint:h.sha256||undefined,historyFileSize:h.fileSize,historyUploadedAt:h.uploadedAt}:base}
function isHistoricalGeneration(job:VideoJob){return Boolean(job.youtubeVideoId||job.storageLifecycle==='UPLOADED'||job.status==='SCHEDULED'||job.uploadedAt)}
function currentGenerationFingerprint(job:VideoJob){const fp=String(job.currentSourceFingerprint||'').trim().toLowerCase();return trustedSha256(fp)?fp:undefined}
function sourceMatchesCurrentJob(job:VideoJob,file:RenderFolderVideoFile){const fp=currentFingerprint(file),jobFp=currentGenerationFingerprint(job);return Boolean(fp&&jobFp&&fp===jobFp&&job.currentSourceFileSize===file.size)}
function historicalEvidenceForJob(job:VideoJob,history:UploadHistoryRecord[],channelId:string){return historyForJob(history,channelId,job.id)||successfulHistory(history,channelId).slice().reverse().find(x=>normalizeRenderPath(x.localFilePath)===normalizeRenderPath(job.finalPath||''))}
function staleWrongRootScanJob(job:VideoJob,history:UploadHistoryRecord[],channelId:string,exactRoot:string){if(!job.finalPath||renderPathInsideRoot(job.finalPath,exactRoot))return false;if(historicalEvidenceForJob(job,history,channelId))return false;return job.sourceOrigin==='render-scan'||job.scanRecoveryState==='CROSS_CHANNEL_SCAN_RECOVERY_REQUIRED'}

export function renderFileNeedsFingerprint(file:RenderFolderVideoFile,jobs:VideoJob[],history:UploadHistoryRecord[],channelId:string,exactRoot:string){
 const path=normalizeRenderPath(file.path),sequence=renderSequence(file.name);
 if(!renderPathInsideRoot(path,exactRoot))return false;
 const scoped=jobs.filter(j=>j.channelId===channelId);
 if(scoped.some(j=>normalizeRenderPath(j.finalPath||'')===path))return true;
 if(successfulHistory(history,channelId).some(x=>normalizeRenderPath(x.localFilePath)===path))return true;
 if(sequence&&scoped.some(j=>j.number===sequence))return true;
 return false;
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
  const activeExact=exactJobs.find(j=>!isHistoricalGeneration(j));
  if(activeExact){
   const jobFp=currentGenerationFingerprint(activeExact);
   if(fp&&jobFp&&fp!==jobFp)return base('NEW_GENERATION','ACTIVE_EXACT_PATH_SOURCE_CHANGED',activeExact.id);
   if(!fp||!jobFp||sourceMatchesCurrentJob(activeExact,file))return base('KNOWN_EXACT',jobFp?'CURRENT_GENERATION_FINGERPRINT_MATCH':'EXACT_CURRENT_GENERATION_PATH',activeExact.id);
  }

  const historicalExact=exactJobs.find(j=>isHistoricalGeneration(j));
  const pathHistory=latestHistoryAtPath(historyRows,channelId,path);
  if(historicalExact||pathHistory){
   const proof=historicalExact?historicalEvidenceForJob(historicalExact,historyRows,channelId):pathHistory;
   if(!fp)return rowEvidence(base('VERIFY_REQUIRED','CURRENT_FINGERPRINT_REQUIRED_FOR_HISTORICAL_PATH',historicalExact?.id||proof?.jobId),proof);
   if(proof&&trustedHistory(proof))return rowEvidence(base('NEW_GENERATION','EXACT_PATH_PHYSICAL_FINGERPRINT_CHANGED',historicalExact?.id||proof.jobId),proof);
   return rowEvidence(base('VERIFY_REQUIRED','LEGACY_UPLOAD_HAS_NO_TRUSTED_FINGERPRINT',historicalExact?.id||proof?.jobId),proof);
  }

  if(fp){
   const currentJob=scoped.find(j=>!isHistoricalGeneration(j)&&currentGenerationFingerprint(j)===fp&&j.currentSourceFileSize===file.size);
   if(currentJob)return base('KNOWN_EXACT','CURRENT_GENERATION_FINGERPRINT_MATCH',currentJob.id);
  }

  if(!sequence)return base('INVALID','SEQUENCE_NOT_FOUND');

  const sameNumber=scoped.filter(j=>j.number===sequence&&!staleWrongRootScanJob(j,historyRows,channelId,exactRoot));
  const activeSame=sameNumber.find(j=>!isHistoricalGeneration(j));
  if(activeSame){
   if(fp&&sourceMatchesCurrentJob(activeSame,file))return base('KNOWN_EXACT','SAME_ACTIVE_GENERATION_FINGERPRINT_MATCH',activeSame.id);
   return base('AMBIGUOUS','ACTIVE_CURRENT_GENERATION_USES_SEQUENCE',activeSame.id);
  }

  const historicalSame=sameNumber.find(j=>isHistoricalGeneration(j));
  if(historicalSame){
   const proof=historicalEvidenceForJob(historicalSame,historyRows,channelId);
   if(!fp)return rowEvidence(base('VERIFY_REQUIRED','CURRENT_FINGERPRINT_REQUIRED_FOR_REUSED_SEQUENCE',historicalSame.id),proof);
   if(proof&&trustedHistory(proof))return rowEvidence(base('NEW_GENERATION','HISTORICAL_SEQUENCE_REUSED_WITH_NEW_FINGERPRINT',historicalSame.id),proof);
   return rowEvidence(base('VERIFY_REQUIRED','HISTORICAL_SEQUENCE_HAS_NO_TRUSTED_FINGERPRINT',historicalSame.id),proof);
  }

  return base('NEW_CANDIDATE','NO_EXISTING_CHANNEL_GENERATION_EVIDENCE');
 });
}

export function summarizeRenderScan(rows:RenderScanRow[]):RenderScanSummary{
 const out:RenderScanSummary={TOTAL_CLASSIFIED_FILES:rows.length,KNOWN_EXACT:0,UPLOADED_LOCAL_COPY:0,NEW_CANDIDATE:0,NEW_GENERATION:0,VERIFY_REQUIRED:0,AMBIGUOUS:0,DUPLICATE_LOCAL:0,INVALID:0};
 for(const row of rows)out[row.classification]++;
 const sum=out.KNOWN_EXACT+out.UPLOADED_LOCAL_COPY+out.NEW_CANDIDATE+out.NEW_GENERATION+out.VERIFY_REQUIRED+out.AMBIGUOUS+out.DUPLICATE_LOCAL+out.INVALID;
 if(sum!==out.TOTAL_CLASSIFIED_FILES)throw new Error(`RENDER_SCAN_COUNTER_INVARIANT_FAILED: total=${out.TOTAL_CLASSIFIED_FILES} sum=${sum}`);
 return out;
}

export function crossChannelScanRecoveryJobs(jobs:VideoJob[],history:UploadHistoryRecord[],channelId:string,exactRoot:string){
 if(!exactRoot.trim())return[];
 return jobs.filter(j=>{
  if(j.channelId!==channelId||!j.finalPath||renderPathInsideRoot(j.finalPath,exactRoot))return false;
  if(historicalEvidenceForJob(j,history,channelId))return false;
  return j.sourceOrigin==='render-scan'||j.storageLifecycle==='NEW'||j.status==='READY_UPLOAD'||j.scanRecoveryState==='CROSS_CHANNEL_SCAN_RECOVERY_REQUIRED';
 });
}

export function planRenderScanImport(rows:RenderScanRow[],existingJobs:VideoJob[],ignoredJobIds:ReadonlySet<string>=new Set()):RenderScanImportPlan{
 const active=existingJobs.filter(j=>!ignoredJobIds.has(j.id)&&!isHistoricalGeneration(j));
 const usedPaths=new Set(active.map(j=>normalizeRenderPath(j.finalPath||'')).filter(Boolean)),usedNumbers=new Set(active.map(j=>j.number)),accepted:RenderScanRow[]=[],skipped:RenderScanImportSkip[]=[];
 for(const row of rows){
  if(row.classification!=='NEW_CANDIDATE'&&row.classification!=='NEW_GENERATION'){skipped.push({path:row.file.path,name:row.file.name,reason:'NOT_NEW_CANDIDATE'});continue}
  const path=normalizeRenderPath(row.file.path);
  if(usedPaths.has(path)){skipped.push({path:row.file.path,name:row.file.name,reason:'ALREADY_KNOWN_PATH'});continue}
  if(!row.sequence){skipped.push({path:row.file.path,name:row.file.name,reason:'MISSING_SEQUENCE'});continue}
  if(usedNumbers.has(row.sequence)){skipped.push({path:row.file.path,name:row.file.name,reason:'SEQUENCE_ALREADY_USED'});continue}
  usedPaths.add(path);usedNumbers.add(row.sequence);accepted.push(row);
 }
 return{accepted,skipped};
}
