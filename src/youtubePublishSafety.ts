export type PublishUploadRecord={id:string;channelId:string;jobId:string;filePath:string;fingerprint:string;fileSize:number;startedAt:string;completedAt?:string;videoId?:string;status:'started'|'completed'|'failed';error?:string};
export type ChannelUploadLock={channelId:string;token:string;acquiredAt:string};
const RECORDS='vyron:youtube-publish-records:v1';
// Upload locks protect concurrent videos.insert only while this frontend runtime is alive.
// Resumable sessions are persisted by the Rust backend; a dead frontend process must not
// leave a localStorage lock that disables publishing for up to two hours after restart.
let runtimeLocks:ChannelUploadLock[]=[];
function get<T>(key:string,fallback:T):T{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}}
function set(key:string,v:unknown){try{localStorage.setItem(key,JSON.stringify(v))}catch{}}
export function publishRecords():PublishUploadRecord[]{const x=get<any[]>(RECORDS,[]);return Array.isArray(x)?x:[]}
function saveRecords(rows:PublishUploadRecord[]){set(RECORDS,rows.slice(-2000))}
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
export function safeDailyStatus(channelId:string,limit?:number){const used=uploadsByVyronLast24h(channelId).length;const configured=Number.isFinite(limit)&&Number(limit)>0;const safeLimit=configured?Math.max(1,Math.floor(Number(limit))):undefined;return{used,limit:safeLimit,remaining:safeLimit==null?undefined:Math.max(0,safeLimit-used),configured}}
