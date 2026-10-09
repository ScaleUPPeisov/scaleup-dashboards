import {nextYoutubeQuotaResetAt,youtubePtDate} from './youtubeQuota';
import type {UploadHistoryRecord} from './types';
export type PublishUploadRecord={id:string;channelId:string;jobId:string;filePath:string;fingerprint:string;fileSize:number;startedAt:string;completedAt?:string;videoId?:string;status:'started'|'completed'|'failed';error?:string};
export type ChannelUploadLock={channelId:string;token:string;acquiredAt:string};
const RECORDS='vyron:youtube-publish-records:v1';
// Upload locks protect concurrent videos.insert only while this frontend runtime is alive.
// Resumable sessions are persisted by the Rust backend; a dead frontend process must not
// leave a localStorage lock that disables publishing for up to two hours after restart.
let runtimeLocks:ChannelUploadLock[]=[];
const globalUploadListeners=new Set<()=>void>();
let durableVerifiedUploads:PublishUploadRecord[]=[];
let durableVerifiedUploadsKey='';
function get<T>(key:string,fallback:T):T{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}}
function set(key:string,v:unknown){try{localStorage.setItem(key,JSON.stringify(v))}catch{}}
function emitGlobalUploadStatusChanged(){for(const cb of [...globalUploadListeners]){try{cb()}catch{}}}
export function subscribeGlobalDailyUploadStatus(cb:()=>void){globalUploadListeners.add(cb);return()=>{globalUploadListeners.delete(cb)}}
// publishRecords() is read once per channel card (safeDailyStatus) and by the topbar, so JSON.parse of the whole ledger on every call is the cost.
// Cache the parsed rows keyed by the exact raw localStorage string: any write (saveRecords, tests, another window) changes the string and invalidates it.
// Every caller builds a new array (map/filter/slice/spread) and never mutates the returned one in place.
let recordsRaw:string|null=null,recordsParsed:PublishUploadRecord[]=[];
export function publishRecords():PublishUploadRecord[]{
 let raw:string|null;
 try{raw=localStorage.getItem(RECORDS)}catch{return[]}
 if(raw===recordsRaw)return recordsParsed;
 let parsed:PublishUploadRecord[]=[];
 try{const v=JSON.parse(raw||'null');parsed=Array.isArray(v)?v:[]}catch{parsed=[]}
 recordsRaw=raw;recordsParsed=parsed;return parsed
}
function saveRecords(rows:PublishUploadRecord[]){set(RECORDS,rows.slice(-2000));emitGlobalUploadStatusChanged()}
function completedUploadKey(row:Pick<PublishUploadRecord,'videoId'|'jobId'|'fingerprint'>){
 const video=String(row.videoId||'').trim();if(video)return 'video:'+video;
 const job=String(row.jobId||'').trim();if(job)return 'job:'+job;
 return 'fingerprint:'+String(row.fingerprint||'').trim()
}
function uniqueCompletedUploads(rows:PublishUploadRecord[]){
 const seen=new Set<string>(),out:PublishUploadRecord[]=[];
 for(const row of rows){
  if(row.status!=='completed'||!row.videoId)continue;
  const key=completedUploadKey(row);if(seen.has(key))continue;seen.add(key);out.push(row)
 }
 return out
}
function verifiedHistoryUploads(history:UploadHistoryRecord[]){
 const seen=new Set<string>(),out:PublishUploadRecord[]=[];
 for(const row of history||[]){
  const videoId=String(row.youtubeVideoId||'').trim();
  if(row.status!=='UPLOADED'||!videoId||seen.has(videoId))continue;
  seen.add(videoId);
  const completedAt=String(row.uploadedAt||'').trim();
  out.push({
   id:'history:'+String(row.id||videoId),channelId:String(row.channelId||''),jobId:String(row.jobId||''),filePath:String(row.localFilePath||''),
   fingerprint:String(row.sha256||'history:'+videoId),fileSize:Number(row.fileSize)||0,startedAt:completedAt,completedAt,videoId,status:'completed'
  })
 }
 return out
}
function globalVerifiedUploads(){
 // Durable uploadHistory wins ordering/timestamps when the same videoId is also present in the runtime ledger.
 return uniqueCompletedUploads([...durableVerifiedUploads,...publishRecords()])
}
export function restorePublishLedgerFromUploadHistory(history:UploadHistoryRecord[]){
 const nextEvidence=verifiedHistoryUploads(history);
 const nextKey=nextEvidence.map(x=>`${x.videoId}@${x.completedAt||x.startedAt}`).sort().join('|');
 const evidenceChanged=nextKey!==durableVerifiedUploadsKey;
 durableVerifiedUploads=nextEvidence;
 durableVerifiedUploadsKey=nextKey;
 const current=publishRecords(),existingVideoIds=new Set(current.filter(x=>x.status==='completed'&&x.videoId).map(x=>String(x.videoId)));
 const recovered:PublishUploadRecord[]=[];
 for(const row of nextEvidence){
  const videoId=String(row.videoId||'').trim();
  if(!videoId||existingVideoIds.has(videoId))continue;
  existingVideoIds.add(videoId);
  recovered.push(row)
 }
 if(recovered.length)saveRecords([...current,...recovered]);
 else if(evidenceChanged)emitGlobalUploadStatusChanged();
 return recovered.length
}
export function uploadsByVyronLast24h(channelId:string,now=Date.now()){const min=now-24*60*60*1000;return publishRecords().filter(x=>x.channelId===channelId&&x.status==='completed'&&Boolean(x.videoId)&&Date.parse(x.completedAt||x.startedAt)>=min)}
export function findSuccessfulUpload(channelId:string,fingerprint:string){return publishRecords().slice().reverse().find(x=>x.channelId===channelId&&x.fingerprint===fingerprint&&x.status==='completed'&&Boolean(x.videoId))}
export function beginPublishAttempt(x:Omit<PublishUploadRecord,'id'|'startedAt'|'status'>){const row:PublishUploadRecord={...x,id:crypto.randomUUID(),startedAt:new Date().toISOString(),status:'started'};saveRecords([...publishRecords(),row]);return row}
export function completePublishAttempt(id:string,videoId:string){const rows=publishRecords().map(x=>x.id===id?{...x,status:'completed' as const,completedAt:new Date().toISOString(),videoId,error:undefined}:x);saveRecords(rows);return rows.find(x=>x.id===id)}
export function failPublishAttempt(id:string,error:unknown){const rows=publishRecords().map(x=>x.id===id?{...x,status:'failed' as const,error:String(error),completedAt:new Date().toISOString()}:x);saveRecords(rows)}
export function interruptedPublishAttempts(channelId?:string){return publishRecords().filter(x=>x.status==='started'&&(!channelId||x.channelId===channelId))}
export function startedPublishAttemptForJob(jobId:string){return publishRecords().slice().reverse().find(x=>x.jobId===jobId&&x.status==='started')}
export function completeStartedPublishAttempt(jobId:string,videoId:string){const row=startedPublishAttemptForJob(jobId);return row?completePublishAttempt(row.id,videoId):undefined}
export function failStartedPublishAttempt(jobId:string,error:unknown){const row=startedPublishAttemptForJob(jobId);if(row)failPublishAttempt(row.id,error);return row}

export function isYoutubeDailyUploadLimitError(error:unknown){const s=String(error||'').toLowerCase();return s.includes('daily upload limit')||s.includes('upload limit')||s.includes('uploadlimitexceeded')||s.includes('too many uploads')||s.includes('dailylimitexceeded')}
function locks():ChannelUploadLock[]{return runtimeLocks}
export function acquireChannelUploadLock(channelId:string){if(runtimeLocks.some(x=>x.channelId===channelId))return null;const token=crypto.randomUUID();runtimeLocks=[...runtimeLocks,{channelId,token,acquiredAt:new Date().toISOString()}];return token}
export function releaseChannelUploadLock(channelId:string,token:string){runtimeLocks=runtimeLocks.filter(x=>!(x.channelId===channelId&&x.token===token))}
export function isChannelUploadLocked(channelId:string){return runtimeLocks.some(x=>x.channelId===channelId)}
export function clearRuntimeChannelUploadLocks(){runtimeLocks=[]}
// Dedupe once per ledger snapshot: publishRecords() returns the same array until the stored string changes, and every card asks for its own channel.
let uniqueSource:PublishUploadRecord[]|null=null,uniqueResult:PublishUploadRecord[]=[];
function uniqueLedgerUploads(){const rows=publishRecords();if(rows!==uniqueSource){uniqueResult=uniqueCompletedUploads(rows);uniqueSource=rows}return uniqueResult}
export function uploadsByVyronToday(channelId:string,now=new Date()){return uniqueLedgerUploads().filter(x=>{if(x.channelId!==channelId)return false;const d=new Date(x.completedAt||x.startedAt);return !Number.isNaN(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()})}
export const VYRON_GLOBAL_DAILY_UPLOAD_LIMIT=100;
export function uploadsByVyronQuotaDay(now=new Date()){
 const day=youtubePtDate(now);
 return globalVerifiedUploads().filter(x=>{
  const d=new Date(x.completedAt||x.startedAt);
  return !Number.isNaN(d.getTime())&&youtubePtDate(d)===day
 })
}
export function globalDailyUploadStatus(limit=VYRON_GLOBAL_DAILY_UPLOAD_LIMIT,now=new Date()){
 const safeLimit=Math.max(1,Math.floor(Number(limit)||VYRON_GLOBAL_DAILY_UPLOAD_LIMIT)),used=uploadsByVyronQuotaDay(now).length;
 return{used,limit:safeLimit,remaining:Math.max(0,safeLimit-used),resetAt:nextYoutubeQuotaResetAt(now).toISOString(),quotaDay:youtubePtDate(now)}
}
export function safeDailyStatus(channelId:string,limit?:number,now=new Date()){const used=uploadsByVyronToday(channelId,now).length,explicit=Number.isFinite(limit),unlimited=explicit&&Number(limit)===0,configured=explicit&&Number(limit)>=0,safeLimit=configured&&!unlimited?Math.max(1,Math.floor(Number(limit))):undefined;return{used,limit:safeLimit,remaining:safeLimit==null?undefined:Math.max(0,safeLimit-used),configured,unlimited}}
