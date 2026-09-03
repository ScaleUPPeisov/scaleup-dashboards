#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p): return (ROOT/p).read_text()
def w(p,s): (ROOT/p).write_text(s)
def rep(p,a,b,count=1):
 s=r(p)
 if a not in s: raise SystemExit(f'missing quota anchor {p}: {a[:140]!r}')
 w(p,s.replace(a,b,count))

# Central YouTube quota domain. Official YouTube Data API costs verified 2026-09-03.
w('src/youtubeQuota.ts',r'''export type YoutubeQuotaBucket='general'|'videoUploads'|'search';
export type YoutubeApiMethod='channels.list'|'videos.list'|'playlistItems.list'|'videos.update'|'videos.insert'|'thumbnails.set'|'playlistItems.insert'|'search.list';
export type YoutubeApiRequestEvent={method:string;operationId?:string|null;at?:string};
export type YoutubeQuotaUsage={ptDate:string;limit:number;used:number;calls:number;lastAction?:string};
export type YoutubeQuotaGuard={blocked:boolean;reason?:string;at?:string;resetAt?:string};
export type YoutubeQuotaCostDef={bucket:YoutubeQuotaBucket;cost:number;label:string};
export type YoutubeQuotaOperation={method:YoutubeApiMethod;count:number;label?:string;itemIds?:string[]};
export type YoutubeQuotaPlan={operations:Array<YoutubeQuotaOperation&{bucket:YoutubeQuotaBucket;unitCost:number;cost:number}>;buckets:Record<YoutubeQuotaBucket,{required:number;used:number;reserved:number;limit:number;available:number;remainingAfter:number;affordable:boolean}>;estimatedQuotaCost:number;estimatedVideoUploadCalls:number;affordable:boolean;unpricedMethods:string[]};
export type YoutubeQuotaClock={now:Date;resetAt:Date;remainingMs:number;countdown:string;localTime:string;localDate:string};

export const DEFAULT_YOUTUBE_DAILY_QUOTA=10000;
export const DEFAULT_YOUTUBE_VIDEO_UPLOADS=100;
export const DEFAULT_YOUTUBE_SEARCH_CALLS=100;
export const youtubeQuotaCosts:Record<YoutubeApiMethod,YoutubeQuotaCostDef>={
 'channels.list':{bucket:'general',cost:1,label:'Получение канала'},
 'videos.list':{bucket:'general',cost:1,label:'Чтение видео'},
 'playlistItems.list':{bucket:'general',cost:1,label:'Чтение плейлиста'},
 'videos.update':{bucket:'general',cost:50,label:'Обновление видео'},
 'thumbnails.set':{bucket:'general',cost:50,label:'Загрузка обложки'},
 'playlistItems.insert':{bucket:'general',cost:50,label:'Добавление в плейлист'},
 // Since the 2026 granular-quota migration uploads are accounted in a separate Video Uploads bucket.
 'videos.insert':{bucket:'videoUploads',cost:1,label:'Загрузка видео'},
 'search.list':{bucket:'search',cost:1,label:'Поиск YouTube'}
};

const GUARD_KEY='vyron:youtube-quota-guard:v1';
const OLD_USAGE_KEY='vyron:youtube-quota-usage:v2';
const LEDGER_KEY='vyron:youtube-quota-ledger:v3';
const RESERVATION_KEY='vyron:youtube-quota-reservations:v1';
const PLAN_KEY='vyron:youtube-quota-plan:v1';
const EVT='vyron-youtube-quota-change';

type BucketRow={limit:number;used:number;calls:number};
type Ledger={version:3;ptDate:string;buckets:Record<YoutubeQuotaBucket,BucketRow>;lastAction?:string;unpricedAttempts?:Array<{method:string;at:string}>};
type Reservation={id:string;createdAt:string;buckets:Record<YoutubeQuotaBucket,number>};
const limits=()=>({general:DEFAULT_YOUTUBE_DAILY_QUOTA,videoUploads:DEFAULT_YOUTUBE_VIDEO_UPLOADS,search:DEFAULT_YOUTUBE_SEARCH_CALLS});
function lsGet(key:string){try{return typeof localStorage==='undefined'?null:localStorage.getItem(key)}catch{return null}}
function lsSet(key:string,value:string){try{if(typeof localStorage!=='undefined')localStorage.setItem(key,value)}catch{}}
function emit(){try{if(typeof window!=='undefined')window.dispatchEvent(new Event(EVT))}catch{}}
function parts(date:Date,timeZone:string){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).reduce<Record<string,string>>((a,x)=>(a[x.type]=x.value,a),{})}
export function youtubePtDate(now=new Date()){const p=parts(now,'America/Los_Angeles');return `${p.year}-${p.month}-${p.day}`}
function pacificOffsetMs(utc:Date){const p=parts(utc,'America/Los_Angeles');const asUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);return asUtc-utc.getTime()}
export function nextYoutubeQuotaResetAt(now=new Date()){
 const p=parts(now,'America/Los_Angeles');const nominal=Date.UTC(+p.year,+p.month-1,+p.day+1,0,0,0);let guess=new Date(nominal-pacificOffsetMs(new Date(nominal)));
 for(let i=0;i<3;i++){const off=pacificOffsetMs(guess);guess=new Date(nominal-off)}return guess
}
function formatCountdown(ms:number){const s=Math.max(0,Math.floor(ms/1000)),hh=Math.floor(s/3600),mm=Math.floor(s%3600/60),ss=s%60;return [hh,mm,ss].map(x=>String(x).padStart(2,'0')).join(':')}
export function youtubeQuotaClockSnapshot(now=new Date()):YoutubeQuotaClock{const resetAt=nextYoutubeQuotaResetAt(now),remainingMs=Math.max(0,resetAt.getTime()-now.getTime());return{now,resetAt,remainingMs,countdown:formatCountdown(remainingMs),localTime:new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(resetAt),localDate:new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(resetAt)}}
let clockTimer:number|undefined;const clockSubs=new Set<(x:YoutubeQuotaClock)=>void>();
function tickClock(){const x=youtubeQuotaClockSnapshot();for(const cb of clockSubs)cb(x)}
export function subscribeYoutubeQuotaClock(cb:(x:YoutubeQuotaClock)=>void){clockSubs.add(cb);cb(youtubeQuotaClockSnapshot());if(clockSubs.size===1&&typeof window!=='undefined')clockTimer=window.setInterval(tickClock,1000);return()=>{clockSubs.delete(cb);if(!clockSubs.size&&clockTimer!==undefined&&typeof window!=='undefined'){window.clearInterval(clockTimer);clockTimer=undefined}}}
export function youtubeQuotaResetLocalInfo(now=new Date()){const x=youtubeQuotaClockSnapshot(now);return{time:x.localTime,date:x.localDate,resetAt:x.resetAt.toISOString(),countdown:x.countdown}}
function freshLedger(day=youtubePtDate()):Ledger{const l=limits();return{version:3,ptDate:day,buckets:{general:{limit:l.general,used:0,calls:0},videoUploads:{limit:l.videoUploads,used:0,calls:0},search:{limit:l.search,used:0,calls:0}}}}
function readLedger():Ledger{
 const day=youtubePtDate();try{const raw=JSON.parse(lsGet(LEDGER_KEY)||'null');if(raw?.version===3&&raw.ptDate===day){const base=freshLedger(day);return{...base,...raw,buckets:{general:{...base.buckets.general,...raw.buckets?.general},videoUploads:{...base.buckets.videoUploads,...raw.buckets?.videoUploads},search:{...base.buckets.search,...raw.buckets?.search}}}}catch{}
 // Preserve the user's previous general estimate during the migration to the multi-bucket ledger.
 try{const old=JSON.parse(lsGet(OLD_USAGE_KEY)||'null');if(old?.ptDate===day){const next=freshLedger(day);next.buckets.general.limit=Math.max(1,+old.limit||DEFAULT_YOUTUBE_DAILY_QUOTA);next.buckets.general.used=Math.max(0,+old.used||0);next.buckets.general.calls=Math.max(0,+old.calls||0);next.lastAction=old.lastAction;lsSet(LEDGER_KEY,JSON.stringify(next));return next}}catch{}
 const next=freshLedger(day);lsSet(LEDGER_KEY,JSON.stringify(next));return next
}
function saveLedger(x:Ledger){lsSet(LEDGER_KEY,JSON.stringify(x));emit()}
function readReservations():Reservation[]{try{const x=JSON.parse(lsGet(RESERVATION_KEY)||'[]');return Array.isArray(x)?x.filter(r=>r?.id&&r?.buckets):[]}catch{return[]}}
function saveReservations(x:Reservation[]){lsSet(RESERVATION_KEY,JSON.stringify(x));emit()}
function reserved(bucket:YoutubeQuotaBucket,excludeId?:string){return readReservations().filter(x=>x.id!==excludeId).reduce((n,x)=>n+Math.max(0,+x.buckets?.[bucket]||0),0)}
export function youtubeQuotaLedger(){return readLedger()}
export function youtubeQuotaUsage():YoutubeQuotaUsage{const x=readLedger(),g=x.buckets.general;return{ptDate:x.ptDate,limit:g.limit,used:g.used,calls:g.calls,lastAction:x.lastAction}}
export function youtubeQuotaBucketUsage(bucket:YoutubeQuotaBucket){const x=readLedger(),b=x.buckets[bucket];return{ptDate:x.ptDate,...b,reserved:reserved(bucket),available:Math.max(0,b.limit-b.used-reserved(bucket))}}
export function setYoutubeQuotaLimit(limit:number){const x=readLedger();x.buckets.general.limit=Math.max(1,Math.floor(limit));saveLedger(x);return youtubeQuotaUsage()}
export function subscribeYoutubeQuota(cb:()=>void){if(typeof window==='undefined')return()=>{};window.addEventListener(EVT,cb);window.addEventListener('storage',cb);return()=>{window.removeEventListener(EVT,cb);window.removeEventListener('storage',cb)}}
export function recordYoutubeApiRequest(event:YoutubeApiRequestEvent){
 const def=youtubeQuotaCosts[event.method as YoutubeApiMethod],x=readLedger(),at=event.at||new Date().toISOString();
 if(!def){x.unpricedAttempts=[...(x.unpricedAttempts||[]),{method:event.method,at}].slice(-100);x.lastAction=`UNPRICED ${event.method}`;saveLedger(x);return x}
 const b=x.buckets[def.bucket];b.used+=def.cost;b.calls+=1;x.lastAction=`${event.method} +${def.cost} ${def.bucket}`;saveLedger(x);if(event.operationId)consumeYoutubeQuotaReservation(event.operationId,event.method as YoutubeApiMethod);return x
}
export function planYoutubeQuota(ops:YoutubeQuotaOperation[],excludeReservationId?:string):YoutubeQuotaPlan{
 const ledger=readLedger(),unpriced:string[]=[];const rows:YoutubeQuotaPlan['operations']=[];const required:Record<YoutubeQuotaBucket,number>={general:0,videoUploads:0,search:0};
 for(const op of ops){const count=Math.max(0,Math.floor(op.count||0)),def=youtubeQuotaCosts[op.method];if(!def){unpriced.push(op.method);continue}const cost=count*def.cost;required[def.bucket]+=cost;rows.push({...op,count,bucket:def.bucket,unitCost:def.cost,cost})}
 const out={} as YoutubeQuotaPlan['buckets'];for(const bucket of ['general','videoUploads','search'] as YoutubeQuotaBucket[]){const b=ledger.buckets[bucket],res=reserved(bucket,excludeReservationId),available=Math.max(0,b.limit-b.used-res);out[bucket]={required:required[bucket],used:b.used,reserved:res,limit:b.limit,available,remainingAfter:Math.max(0,available-required[bucket]),affordable:required[bucket]<=available}}
 return{operations:rows,buckets:out,estimatedQuotaCost:required.general,estimatedVideoUploadCalls:required.videoUploads,affordable:!unpriced.length&&Object.values(out).every(x=>x.affordable),unpricedMethods:unpriced}
}
export function maxAffordableHomogeneousItems(perItem:YoutubeQuotaOperation[],requested:number,fixed:YoutubeQuotaOperation[]=[]){const fixedPlan=planYoutubeQuota(fixed);let best=0;for(let n=1;n<=Math.max(0,Math.floor(requested));n++){const p=planYoutubeQuota([...fixed,...perItem.map(x=>({...x,count:x.count*n}))]);if(!p.affordable)break;best=n}return{max:best,plan:planYoutubeQuota([...fixed,...perItem.map(x=>({...x,count:x.count*best}))])}}
export function reserveYoutubeQuota(id:string,plan:YoutubeQuotaPlan){if(!id||!plan.affordable)return false;const rows=readReservations().filter(x=>x.id!==id);const buckets={general:plan.buckets.general.required,videoUploads:plan.buckets.videoUploads.required,search:plan.buckets.search.required};rows.push({id,createdAt:new Date().toISOString(),buckets});saveReservations(rows);return true}
export function releaseYoutubeQuotaReservation(id:string){saveReservations(readReservations().filter(x=>x.id!==id))}
export function consumeYoutubeQuotaReservation(id:string,method:YoutubeApiMethod){const def=youtubeQuotaCosts[method];if(!def)return;const rows=readReservations();const row=rows.find(x=>x.id===id);if(!row)return;row.buckets[def.bucket]=Math.max(0,(row.buckets[def.bucket]||0)-def.cost);saveReservations(rows)}
export function youtubeQuotaState():YoutubeQuotaGuard{try{const x=JSON.parse(lsGet(GUARD_KEY)||'null');if(x?.blocked){if(x.resetAt&&Date.now()>=Date.parse(x.resetAt)){clearYoutubeQuotaGuard();return{blocked:false}}return x}}catch{}return{blocked:false}}
export function markYoutubeQuotaExceeded(reason:unknown){const g:YoutubeQuotaGuard={blocked:true,reason:String(reason||'YouTube API quota exceeded'),at:new Date().toISOString(),resetAt:nextYoutubeQuotaResetAt().toISOString()};lsSet(GUARD_KEY,JSON.stringify(g));emit();return g}
export function clearYoutubeQuotaGuard(){try{if(typeof localStorage!=='undefined')localStorage.removeItem(GUARD_KEY)}catch{}emit()}
export function youtubeQuotaMessage(){const g=youtubeQuotaState();return g.blocked?`YouTube API quota временно исчерпана. Сброс: ${youtubeQuotaResetLocalInfo().time}.`:'YouTube API quota доступна.'}
export function isYoutubeQuotaError(error:unknown){const s=String(error||'').toLowerCase();return s.includes('quota')||s.includes('dailylimit')||s.includes('daily limit')||s.includes('rate limit exceeded')}
export async function youtubeGuardedCall<T>(fn:()=>Promise<T>){const g=youtubeQuotaState();if(g.blocked)throw new Error(youtubeQuotaMessage());try{return await fn()}catch(e){if(isYoutubeQuotaError(e))markYoutubeQuotaExceeded(e);throw e}}
// Compatibility estimator for commands that have not yet emitted method-level events. Do not use it for preflight.
export function youtubeQuotaCost(command:string,args?:any,result?:any){if(command==='youtube_channel_stats')return 1;if(command==='youtube_update_existing_video'){if(result?.skipped)return 1;return 51}if(command==='youtube_upload_video')return 0;if(command==='youtube_channel_analytics')return 0;if(command==='youtube_list_existing_videos'){const n=Math.max(1,Number(result?.received||args?.maxResults||1));return 1+Math.ceil(n/50)+Math.ceil(n/50)}if(command==='youtube_backup_existing_videos'){const n=Array.isArray(args?.videos)?args.videos.length:1;return Math.max(1,Math.ceil(n/50))}return 0}
export function recordYoutubeCommand(command:string,args?:any,result?:any){const cost=youtubeQuotaCost(command,args,result);if(cost<=0)return youtubeQuotaUsage();const x=readLedger();x.buckets.general.used+=cost;x.buckets.general.calls+=1;x.lastAction=`${command} +${cost} general`;saveLedger(x);return youtubeQuotaUsage()}
// Legacy capacity helpers retained for backwards compatibility; new UI uses planYoutubeQuota.
export const ESTIMATED_VIDEO_WRITE_UNITS=youtubeQuotaCosts['videos.list'].cost+youtubeQuotaCosts['videos.update'].cost;
export function buildYoutubeQuotaPlan(channels:number,videosPerChannel:number,usage=youtubeQuotaUsage()){const c=Math.max(0,Math.floor(channels)),v=Math.max(1,Math.floor(videosPerChannel)),perChannel=v*ESTIMATED_VIDEO_WRITE_UNITS,totalUnits=c*perChannel,remaining=Math.max(0,usage.limit-usage.used),todayChannels=Math.min(c,Math.floor(remaining/perChannel)),fullDayChannels=Math.max(1,Math.floor(usage.limit/perChannel)),days=c?Math.ceil(Math.max(0,c-todayChannels)/fullDayChannels)+(todayChannels?1:0):0,rows=[] as Array<{day:number;channels:number;units:number}>;let left=c;for(let day=0;left>0;day++){const cap=day===0?todayChannels:fullDayChannels,n=Math.min(left,cap);if(day===0&&cap===0){rows.push({day,channels:0,units:0});continue}rows.push({day,channels:n,units:n*perChannel});left-=n}return{channels:c,videosPerChannel:v,perChannel,totalUnits,remaining,todayChannels,fullDayChannels,days,rows}}
export function saveYoutubeQuotaPlan(x:{channels:number;videosPerChannel:number}){lsSet(PLAN_KEY,JSON.stringify(x))}
export function loadYoutubeQuotaPlan(){try{return JSON.parse(lsGet(PLAN_KEY)||'null')||{channels:100,videosPerChannel:30}}catch{return{channels:100,videosPerChannel:30}}}
''')

# Pure planner and PT/DST acceptance tests.
w('src/youtubeQuotaPlanner.test.ts',r'''import {describe,it,expect} from 'vitest';
import {ESTIMATED_VIDEO_WRITE_UNITS,nextYoutubeQuotaResetAt,planYoutubeQuota,youtubeQuotaClockSnapshot,youtubeQuotaCosts} from './youtubeQuota';

describe('VYRON 1.1 YouTubeQuotaPlanner',()=>{
 it('centralizes current method costs and separate upload bucket',()=>{
  expect(youtubeQuotaCosts['videos.update']).toEqual(expect.objectContaining({bucket:'general',cost:50}));
  expect(youtubeQuotaCosts['thumbnails.set']).toEqual(expect.objectContaining({bucket:'general',cost:50}));
  expect(youtubeQuotaCosts['videos.insert']).toEqual(expect.objectContaining({bucket:'videoUploads',cost:1}));
  expect(ESTIMATED_VIDEO_WRITE_UNITS).toBe(51);
 });
 it('counts one combined videos.update per video, not one request per changed field',()=>{
  const p=planYoutubeQuota([{method:'videos.list',count:30},{method:'videos.update',count:30}]);
  expect(p.operations.find(x=>x.method==='videos.update')?.count).toBe(30);
  expect(p.buckets.general.required).toBe(30+30*50);
 });
 it('keeps videos.insert outside the 10k general bucket',()=>{
  const p=planYoutubeQuota([{method:'videos.insert',count:15},{method:'thumbnails.set',count:15}]);
  expect(p.buckets.videoUploads.required).toBe(15);
  expect(p.buckets.general.required).toBe(750);
 });
 it('computes next midnight in Pacific Time across DST',()=>{
  const winter=nextYoutubeQuotaResetAt(new Date('2026-01-15T12:00:00Z'));
  const summer=nextYoutubeQuotaResetAt(new Date('2026-07-15T12:00:00Z'));
  expect(winter.toISOString()).toBe('2026-01-16T08:00:00.000Z');
  expect(summer.toISOString()).toBe('2026-07-16T07:00:00.000Z');
 });
 it('countdown is local math only and decreases with time',()=>{
  const a=youtubeQuotaClockSnapshot(new Date('2026-09-03T12:00:00Z'));
  const b=youtubeQuotaClockSnapshot(new Date('2026-09-03T12:00:01Z'));
  expect(b.remainingMs).toBe(a.remainingMs-1000);
 });
});
''')

# Frontend API: method-level ledger events are the source of truth for instrumented operations.
p='src/api.ts'
rep(p,"import {recordYoutubeCommand,youtubeGuardedCall} from './youtubeQuota';","import {recordYoutubeApiRequest,recordYoutubeCommand,youtubeGuardedCall,type YoutubeApiRequestEvent} from './youtubeQuota';")
rep(p,
"const ytInvoke=<T>(command:string,args?:Record<string,unknown>)=>youtubeGuardedCall(async()=>{const result=await invoke<T>(command,args);recordYoutubeCommand(command,args,result);return result});",
"const METHOD_LEDGER_COMMANDS=new Set(['youtube_oauth_profile_health','youtube_upload_video','youtube_list_existing_videos','youtube_backup_existing_videos','youtube_update_existing_video']);\nconst ytInvoke=<T>(command:string,args?:Record<string,unknown>)=>youtubeGuardedCall(async()=>{const result=await invoke<T>(command,args);if(!METHOD_LEDGER_COMMANDS.has(command))recordYoutubeCommand(command,args,result);return result});")
rep(p,
"  youtubeBackupExisting:(profileId:string,videos:any[])=>ytInvoke<{path:string;count:number}>('youtube_backup_existing_videos',{profileId,videos}),",
"  youtubeBackupExisting:(profileId:string,videos:any[],operationId?:string)=>ytInvoke<{path:string;count:number}>('youtube_backup_existing_videos',{profileId,videos,operationId}),")
rep(p,
"  youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;skipped?:boolean;appliedTags?:number}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus}),",
"  youtubeUpdateExisting:(profileId:string,videoId:string,title:string,description:string,tags:string[],publishAt?:string,privacyStatus?:string,operationId?:string)=>ytInvoke<{id:string;verified:boolean;metadataAccepted?:boolean;metadataVerified:boolean;metadataVerifyPending?:boolean;scheduleRequested:boolean;scheduleAccepted?:boolean;scheduleVerified:boolean;scheduleVerifyPending?:boolean;scheduleError?:string|null;skipped?:boolean;appliedTags?:number}>('youtube_update_existing_video',{profileId,videoId,title,description,tags,publishAt,privacyStatus,operationId}),")
rep(p,
"  youtubeUpload:(profileId:string,jobId:string,filePath:string,title:string,description:string,tags:string[],publishAt:string|undefined,categoryId:string)=>ytInvoke<YoutubeUploadResult>('youtube_upload_video',{profileId,jobId,filePath,title,description,tags,publishAt,categoryId}),",
"  youtubeUpload:(profileId:string,jobId:string,filePath:string,title:string,description:string,tags:string[],publishAt:string|undefined,categoryId:string,operationId?:string)=>ytInvoke<YoutubeUploadResult>('youtube_upload_video',{profileId,jobId,filePath,title,description,tags,publishAt,categoryId,operationId}),")
rep(p,
"  onYoutubeProgress:(cb:(data:{jobId:string;progress:number})=>void)=>listen<{jobId:string;progress:number}>('youtube-upload-progress',e=>cb(e.payload)),",
"  onYoutubeProgress:(cb:(data:{jobId:string;progress:number})=>void)=>listen<{jobId:string;progress:number}>('youtube-upload-progress',e=>cb(e.payload)),\n  onYoutubeApiRequest:(cb:(data:YoutubeApiRequestEvent)=>void)=>listen<YoutubeApiRequestEvent>('youtube-api-request',e=>{recordYoutubeApiRequest(e.payload);cb(e.payload)}),")

# App installs one global event listener; no network polling is involved.
p='src/App.tsx'
rep(p,"  useEffect(()=>{let unlisten:(()=>void)|undefined;void api.onYoutubeProgress(({jobId,progress})=>patchJob(jobId,{uploadProgress:progress,status:'UPLOADING'})).then(fn=>unlisten=fn);return()=>unlisten?.()},[]);",
"  useEffect(()=>{let unlisten:(()=>void)|undefined;void api.onYoutubeProgress(({jobId,progress})=>patchJob(jobId,{uploadProgress:progress,status:'UPLOADING'})).then(fn=>unlisten=fn);return()=>unlisten?.()},[]);\n  useEffect(()=>{let unlisten:(()=>void)|undefined;void api.onYoutubeApiRequest(()=>{}).then(fn=>unlisten=fn);return()=>unlisten?.()},[]);")

# Rust request-attempt instrumentation. Events fire immediately BEFORE Data API requests, including requests that later fail.
p='src-tauri/src/youtube.rs'
rep(p,"use uuid::Uuid;","use uuid::Uuid;\n\npub(crate) fn emit_youtube_api_request(app:&AppHandle,method:&str,operation_id:Option<&str>){let _=app.emit(\"youtube-api-request\",json!({\"method\":method,\"operationId\":operation_id,\"at\":Utc::now().to_rfc3339()}));}")
# Profile health
rep(p,' let (_token,p)=valid_access_token(&app,&profile_id).await?;let token=p.access_token.clone();\n let r=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels")', ' let (_token,p)=valid_access_token(&app,&profile_id).await?;let token=p.access_token.clone();\n emit_youtube_api_request(&app,"channels.list",None);\n let r=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels")')
# OAuth connection ownership channel read.
rep(p,' let me=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true")', ' emit_youtube_api_request(&app,"channels.list",None);\n let me=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true")')
# upload signature + insert attempt
rep(p,'pub async fn youtube_upload_video(app:AppHandle,profile_id:String,job_id:String,file_path:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>,category_id:String)->Result<Value,String>{',
      'pub async fn youtube_upload_video(app:AppHandle,profile_id:String,job_id:String,file_path:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>,category_id:String,operation_id:Option<String>)->Result<Value,String>{')
rep(p,' let client=reqwest::Client::new();let init=client.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status")',
      ' let client=reqwest::Client::new();emit_youtube_api_request(&app,"videos.insert",operation_id.as_deref());let init=client.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status")')
# list existing method events
rep(p,' let (token,profile)=valid_access_token(&app,&profile_id).await?;let limit=max_results.unwrap_or(1000).clamp(1,5000) as usize;let client=reqwest::Client::new();\n let r=client.get("https://www.googleapis.com/youtube/v3/channels")',
      ' let (token,profile)=valid_access_token(&app,&profile_id).await?;let limit=max_results.unwrap_or(1000).clamp(1,5000) as usize;let client=reqwest::Client::new();\n emit_youtube_api_request(&app,"channels.list",None);\n let r=client.get("https://www.googleapis.com/youtube/v3/channels")')
rep(p,'  let mut q=client.get("https://www.googleapis.com/youtube/v3/playlistItems")', '  emit_youtube_api_request(&app,"playlistItems.list",None);let mut q=client.get("https://www.googleapis.com/youtube/v3/playlistItems")')
rep(p,' let mut by_id=std::collections::HashMap::<String,Value>::new();for chunk in ids.chunks(50){let joined=chunk.join(",");let r=client.get("https://www.googleapis.com/youtube/v3/videos")',
      ' let mut by_id=std::collections::HashMap::<String,Value>::new();for chunk in ids.chunks(50){let joined=chunk.join(",");emit_youtube_api_request(&app,"videos.list",None);let r=client.get("https://www.googleapis.com/youtube/v3/videos")')
# backup signature/events
rep(p,'pub async fn youtube_backup_existing_videos(app:AppHandle,profile_id:String,videos:Value)->Result<Value,String>{',
      'pub async fn youtube_backup_existing_videos(app:AppHandle,profile_id:String,videos:Value,operation_id:Option<String>)->Result<Value,String>{')
rep(p,' for chunk in ids.chunks(50){let joined=chunk.join(",");let r=client.get("https://www.googleapis.com/youtube/v3/videos")',
      ' for chunk in ids.chunks(50){let joined=chunk.join(",");emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());let r=client.get("https://www.googleapis.com/youtube/v3/videos")')
# update signature and all method attempts in this command.
rep(p,'pub async fn youtube_update_existing_video(app:AppHandle,profile_id:String,video_id:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>,privacy_status:Option<String>)->Result<Value,String>{',
      'pub async fn youtube_update_existing_video(app:AppHandle,profile_id:String,video_id:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>,privacy_status:Option<String>,operation_id:Option<String>)->Result<Value,String>{')
rep(p,' let client=reqwest::Client::new();\n let r=client.get("https://www.googleapis.com/youtube/v3/videos")',
      ' let client=reqwest::Client::new();\n emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());\n let r=client.get("https://www.googleapis.com/youtube/v3/videos")')
# Every write in update command. Exact snippets are distinct.
rep(p,'  let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status")])',
      '  emit_youtube_api_request(&app,"videos.update",operation_id.as_deref());let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status")])')
rep(p,'   let mu=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet")])',
      '   emit_youtube_api_request(&app,"videos.update",operation_id.as_deref());let mu=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet")])')
rep(p,'  let body=json!({"id":video_id,"snippet":snippet});let u=client.put("https://www.googleapis.com/youtube/v3/videos")',
      '  let body=json!({"id":video_id,"snippet":snippet});emit_youtube_api_request(&app,"videos.update",operation_id.as_deref());let u=client.put("https://www.googleapis.com/youtube/v3/videos")')
rep(p,'  let body=json!({"id":video_id,"status":desired_status});let u=client.put("https://www.googleapis.com/youtube/v3/videos")',
      '  let body=json!({"id":video_id,"status":desired_status});emit_youtube_api_request(&app,"videos.update",operation_id.as_deref());let u=client.put("https://www.googleapis.com/youtube/v3/videos")')
rep(p,'for delay in [300u64,1200]{tokio::time::sleep(std::time::Duration::from_millis(delay)).await;let q=client.get("https://www.googleapis.com/youtube/v3/videos")',
      'for delay in [300u64,1200]{tokio::time::sleep(std::time::Duration::from_millis(delay)).await;emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());let q=client.get("https://www.googleapis.com/youtube/v3/videos")')
# API-key stats now receives AppHandle automatically and accounts the attempted channels.list even on failure.
rep(p,'pub async fn youtube_channel_stats(api_key:String,channel_id:String)->Result<Value,String>{if api_key.trim().is_empty()',
      'pub async fn youtube_channel_stats(app:AppHandle,api_key:String,channel_id:String)->Result<Value,String>{if api_key.trim().is_empty()')
rep(p,'let url=format!("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={}&key={}"',
      'emit_youtube_api_request(&app,"channels.list",None);let url=format!("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={}&key={}"')

# Instrument Data API requests embedded in Analytics/Competitors. YouTube Analytics API has its own quota and is intentionally not put into Data API ledger.
p='src-tauri/src/youtube_intelligence.rs'
rep(p,' let client=reqwest::Client::new();let cr=client.get("https://www.googleapis.com/youtube/v3/channels")',
      ' let client=reqwest::Client::new();youtube::emit_youtube_api_request(&app,"channels.list",None);let cr=client.get("https://www.googleapis.com/youtube/v3/channels")')
rep(p,'let r=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet"),("id",joined.as_str())])',
      'youtube::emit_youtube_api_request(&app,"videos.list",None);let r=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet"),("id",joined.as_str())])')
rep(p,'let r=client.get("https://www.googleapis.com/youtube/v3/playlistItems").bearer_auth(&token).query(&[("part","id"),("playlistId",uploads),("maxResults","1")])',
      'youtube::emit_youtube_api_request(&app,"playlistItems.list",None);let r=client.get("https://www.googleapis.com/youtube/v3/playlistItems").bearer_auth(&token).query(&[("part","id"),("playlistId",uploads),("maxResults","1")])')
# resolve_channel_ref needs app so @handle lookup is accounted.
rep(p,'async fn resolve_channel_ref(token:&str,channel_ref:&str)->Result<String,String>{', 'async fn resolve_channel_ref(app:&AppHandle,token:&str,channel_ref:&str)->Result<String,String>{')
rep(p,'if !handle.is_empty(){let r=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels")', 'if !handle.is_empty(){youtube::emit_youtube_api_request(app,"channels.list",None);let r=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels")')
rep(p,'let channel_id=resolve_channel_ref(&token,&channel_ref).await?;', 'let channel_id=resolve_channel_ref(&app,&token,&channel_ref).await?;')
# Competitor discovery/snapshot exact Data API attempts.
rep(p,'let client=reqwest::Client::new();let cr=client.get("https://www.googleapis.com/youtube/v3/channels")', 'let client=reqwest::Client::new();youtube::emit_youtube_api_request(&app,"channels.list",None);let cr=client.get("https://www.googleapis.com/youtube/v3/channels")')
rep(p,'let pr=client.get("https://www.googleapis.com/youtube/v3/playlistItems").bearer_auth(&token).query(&[("part","snippet")', 'youtube::emit_youtube_api_request(&app,"playlistItems.list",None);let pr=client.get("https://www.googleapis.com/youtube/v3/playlistItems").bearer_auth(&token).query(&[("part","snippet")')
rep(p,'let sr=client.get("https://www.googleapis.com/youtube/v3/search").bearer_auth(&token)', 'youtube::emit_youtube_api_request(&app,"search.list",None);let sr=client.get("https://www.googleapis.com/youtube/v3/search").bearer_auth(&token)')
rep(p,'let rr=client.get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(&token)', 'youtube::emit_youtube_api_request(&app,"channels.list",None);let rr=client.get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(&token)')
rep(p,'let client=reqwest::Client::new();let r=client.get("https://www.googleapis.com/youtube/v3/channels")', 'let client=reqwest::Client::new();youtube::emit_youtube_api_request(&app,"channels.list",None);let r=client.get("https://www.googleapis.com/youtube/v3/channels")')
rep(p,'if !uploads.is_empty(){let pr=client.get("https://www.googleapis.com/youtube/v3/playlistItems")', 'if !uploads.is_empty(){youtube::emit_youtube_api_request(&app,"playlistItems.list",None);let pr=client.get("https://www.googleapis.com/youtube/v3/playlistItems")')
rep(p,'if !ids.is_empty(){let joined=ids.join(",");let vr=client.get("https://www.googleapis.com/youtube/v3/videos")', 'if !ids.is_empty(){let joined=ids.join(",");youtube::emit_youtube_api_request(&app,"videos.list",None);let vr=client.get("https://www.googleapis.com/youtube/v3/videos")')

print('VYRON 1.1.0 quota planner/request ledger patch applied')
