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
function get<T>(key:string,fallback:T):T{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}}
function set(key:string,v:unknown){try{localStorage.setItem(key,JSON.stringify(v))}catch{}}
function emitGlobalUploadStatusChanged(){for(const cb of [...globalUploadListeners]){try{cb()}catch{}}}
export function subscribeGlobalDailyUploadStatus(cb:()=>void){globalUploadListeners.add(cb);return()=>{globalUploadListeners.delete(cb)}}
export function publishRecords():PublishUploadRecord[]{const x=get<any[]>(RECORDS,[]);return Array.isArray(x)?x:[]}
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
export function restorePublishLedgerFromUploadHistory(history:UploadHistoryRecord[]){
 const current=publishRecords(),existingVideoIds=new Set(current.filter(x=>x.status==='completed'&&x.videoId).map(x=>String(x.videoId)));
 const recovered:PublishUploadRecord[]=[];
 for(const row of history||[]){
  const videoId=String(row.youtubeVideoId||'').trim();
  if(row.status!=='UPLOADED'||!videoId||existingVideoIds.has(videoId))continue;
  existingVideoIds.add(videoId);
  recovered.push({
   id:'history:'+String(row.id||videoId),channelId:row.channelId,jobId:row.jobId,filePath:row.localFilePath||'',
   fingerprint:String(row.sha256||'history:'+videoId),fileSize:Number(row.fileSize)||0,startedAt:row.uploadedAt,
   completedAt:row.uploadedAt,videoId,status:'completed'
  })
 }
 if(!recovered.length)return 0;
 saveRecords([...current,...recovered]);
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
export function uploadsByVyronToday(channelId:string,now=new Date()){return uniqueCompletedUploads(publishRecords()).filter(x=>{if(x.channelId!==channelId)return false;const d=new Date(x.completedAt||x.startedAt);return !Number.isNaN(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()})}
export const VYRON_GLOBAL_DAILY_UPLOAD_LIMIT=100;
export function uploadsByVyronQuotaDay(now=new Date()){
 const day=youtubePtDate(now);
 return uniqueCompletedUploads(publishRecords()).filter(x=>{
  const d=new Date(x.completedAt||x.startedAt);
  return !Number.isNaN(d.getTime())&&youtubePtDate(d)===day
 })
}
export function globalDailyUploadStatus(limit=VYRON_GLOBAL_DAILY_UPLOAD_LIMIT,now=new Date()){
 const safeLimit=Math.max(1,Math.floor(Number(limit)||VYRON_GLOBAL_DAILY_UPLOAD_LIMIT)),used=uploadsByVyronQuotaDay(now).length;
 return{used,limit:safeLimit,remaining:Math.max(0,safeLimit-used),resetAt:nextYoutubeQuotaResetAt(now).toISOString(),quotaDay:youtubePtDate(now)}
}
export function safeDailyStatus(channelId:string,limit?:number,now=new Date()){const used=uploadsByVyronToday(channelId,now).length,explicit=Number.isFinite(limit),unlimited=explicit&&Number(limit)===0,configured=explicit&&Number(limit)>=0,safeLimit=configured&&!unlimited?Math.max(1,Math.floor(Number(limit))):undefined;return{used,limit:safeLimit,remaining:safeLimit==null?undefined:Math.max(0,safeLimit-used),configured,unlimited}}
