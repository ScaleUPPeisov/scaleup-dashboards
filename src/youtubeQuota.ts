export type YoutubeQuotaBucket='general'|'videoUploads'|'search';
export type YoutubeApiMethod='channels.list'|'videos.list'|'playlists.list'|'playlistItems.list'|'videos.update'|'videos.insert'|'thumbnails.set'|'playlistItems.insert'|'playlistItems.delete'|'search.list';
export type YoutubeApiRequestEvent={method:string;operationId?:string|null;at?:string};
export type YoutubeQuotaUsage={ptDate:string;limit:number;used:number;calls:number;lastAction?:string};
export type YoutubeQuotaGuard={blocked:boolean;reason?:string;at?:string;resetAt?:string;ptDate?:string;source?:'provider'};
export type YoutubeQuotaCostDef={bucket:YoutubeQuotaBucket;cost:number;label:string};
export type YoutubeQuotaOperation={method:YoutubeApiMethod;count:number;label?:string;itemIds?:string[]};
export type YoutubeQuotaPlan={operations:Array<YoutubeQuotaOperation&{bucket:YoutubeQuotaBucket;unitCost:number;cost:number}>;buckets:Record<YoutubeQuotaBucket,{required:number;used:number;reserved:number;limit:number;available:number;remainingAfter:number;affordable:boolean;limitKnown?:boolean}>;estimatedQuotaCost:number;estimatedVideoUploadCalls:number;affordable:boolean;unpricedMethods:string[]};
export type YoutubeQuotaClock={now:Date;resetAt:Date;remainingMs:number;countdown:string;localTime:string;localDate:string};
export type UploadQuotaLimitSource='google-cloud'|'user-configured'|'default'|'unknown';
export type UploadQuotaState={projectKey:string;quotaDay:string;used:number;calls:number;configuredLimit:number|null;limit:number|null;limitSource:UploadQuotaLimitSource;resetAt:string;lastUpdatedAt:string;reserved:number;remaining:number|null};
export type YoutubeQuotaProjectIdentity={projectKey:string|null;label:string;source:'google-project'|'oauth-client'|'unknown'};

export const DEFAULT_YOUTUBE_DAILY_QUOTA=10000;
// Baseline only. This is NOT a provider-confirmed limit; per-project configuration overrides it.
export const DEFAULT_YOUTUBE_VIDEO_UPLOADS=100;
export const DEFAULT_YOUTUBE_SEARCH_CALLS=100;
export const youtubeQuotaCosts:Record<YoutubeApiMethod,YoutubeQuotaCostDef>={
 'channels.list':{bucket:'general',cost:1,label:'Получение канала'},
 'videos.list':{bucket:'general',cost:1,label:'Чтение видео'},
 'playlists.list':{bucket:'general',cost:1,label:'Список плейлистов'},
 'playlistItems.list':{bucket:'general',cost:1,label:'Чтение плейлиста'},
 'videos.update':{bucket:'general',cost:50,label:'Обновление видео'},
 'thumbnails.set':{bucket:'general',cost:50,label:'Загрузка обложки'},
 'playlistItems.insert':{bucket:'general',cost:50,label:'Добавление в плейлист'},
 'playlistItems.delete':{bucket:'general',cost:50,label:'Удаление из плейлиста'},
 'videos.insert':{bucket:'videoUploads',cost:1,label:'Загрузка видео'},
 'search.list':{bucket:'search',cost:1,label:'Поиск YouTube'}
};

const GUARD_KEY='vyron:youtube-quota-guard:v1';
const OLD_USAGE_KEY='vyron:youtube-quota-usage:v2';
const LEDGER_KEY='vyron:youtube-quota-ledger:v3';
const RESERVATION_KEY='vyron:youtube-quota-reservations:v1';
const PLAN_KEY='vyron:youtube-quota-plan:v1';
const OPERATION_LEDGER_KEY='vyron:youtube-operation-ledger:v1';
const EVT='vyron-youtube-quota-change';
const UNKNOWN_UPLOAD_LIMIT=Number.MAX_SAFE_INTEGER;
const MAX_CONFIGURED_UPLOAD_LIMIT=1_000_000;

type BucketRow={limit:number;used:number;calls:number};
type UploadProjectRow={quotaDay:string;used:number;calls:number;configuredLimit:number|null;limitSource:UploadQuotaLimitSource;lastUpdatedAt:string};
type LegacyUploadRow={quotaDay:string;used:number;calls:number;claimedBy?:string};
type LedgerV4={version:4;ptDate:string;buckets:{general:BucketRow;search:BucketRow};uploadProjects:Record<string,UploadProjectRow>;legacyUpload?:LegacyUploadRow;lastAction?:string;unpricedAttempts?:Array<{method:string;at:string}>};
type Reservation={id:string;createdAt:string;projectKey?:string;buckets:Record<YoutubeQuotaBucket,number>};
type OperationLedgerRow={operationId:string;ptDate:string;updatedAt:string;projectKey?:string;buckets:Record<YoutubeQuotaBucket,number>;methods:Record<string,{calls:number;cost:number}>};

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
let lastClockPtDate=youtubePtDate();
function tickClock(){const x=youtubeQuotaClockSnapshot(),day=youtubePtDate(x.now),rolled=day!==lastClockPtDate;lastClockPtDate=day;youtubeQuotaState(x.now);if(rolled){readLedger(x.now);emit()}for(const cb of clockSubs)cb(x)}
export function subscribeYoutubeQuotaClock(cb:(x:YoutubeQuotaClock)=>void){clockSubs.add(cb);cb(youtubeQuotaClockSnapshot());if(clockSubs.size===1&&typeof window!=='undefined')clockTimer=window.setInterval(tickClock,1000);return()=>{clockSubs.delete(cb);if(!clockSubs.size&&clockTimer!==undefined&&typeof window!=='undefined'){window.clearInterval(clockTimer);clockTimer=undefined}}}
export function youtubeQuotaResetLocalInfo(now=new Date()){const x=youtubeQuotaClockSnapshot(now);return{time:x.localTime,date:x.localDate,resetAt:x.resetAt.toISOString(),countdown:x.countdown}}
function freshLedger(day=youtubePtDate()):LedgerV4{return{version:4,ptDate:day,buckets:{general:{limit:DEFAULT_YOUTUBE_DAILY_QUOTA,used:0,calls:0},search:{limit:DEFAULT_YOUTUBE_SEARCH_CALLS,used:0,calls:0}},uploadProjects:{}}}
function normalizeUploadRow(row:any,day:string,now:Date):UploadProjectRow{
 const same=row?.quotaDay===day;return{quotaDay:day,used:same?Math.max(0,+row?.used||0):0,calls:same?Math.max(0,+row?.calls||0):0,configuredLimit:Number.isFinite(+row?.configuredLimit)&&+row.configuredLimit>0?Math.min(MAX_CONFIGURED_UPLOAD_LIMIT,Math.floor(+row.configuredLimit)):null,limitSource:row?.limitSource==='user-configured'||row?.limitSource==='google-cloud'||row?.limitSource==='unknown'?row.limitSource:'default',lastUpdatedAt:same&&row?.lastUpdatedAt?String(row.lastUpdatedAt):now.toISOString()}
}
function readLedger(now=new Date()):LedgerV4{
 const day=youtubePtDate(now);let raw:any=null;try{raw=JSON.parse(lsGet(LEDGER_KEY)||'null')}catch{}
 if(raw?.version===4){const next=freshLedger(day);next.lastAction=raw.lastAction;next.unpricedAttempts=raw.unpricedAttempts;const same=raw.ptDate===day;if(same){next.buckets.general={...next.buckets.general,...raw.buckets?.general};next.buckets.search={...next.buckets.search,...raw.buckets?.search}}else{next.buckets.general.limit=Math.max(1,+raw.buckets?.general?.limit||DEFAULT_YOUTUBE_DAILY_QUOTA);next.buckets.search.limit=Math.max(1,+raw.buckets?.search?.limit||DEFAULT_YOUTUBE_SEARCH_CALLS)}for(const [key,row] of Object.entries(raw.uploadProjects||{}))next.uploadProjects[key]=normalizeUploadRow(row,day,now);if(raw.legacyUpload){next.legacyUpload={quotaDay:day,used:same?Math.max(0,+raw.legacyUpload.used||0):0,calls:same?Math.max(0,+raw.legacyUpload.calls||0):0,claimedBy:raw.legacyUpload.claimedBy}}if(!same)lsSet(LEDGER_KEY,JSON.stringify(next));return next}
 if(raw?.version===3){const next=freshLedger(day),same=raw.ptDate===day;if(same){next.buckets.general={...next.buckets.general,...raw.buckets?.general};next.buckets.search={...next.buckets.search,...raw.buckets?.search};next.legacyUpload={quotaDay:day,used:Math.max(0,+raw.buckets?.videoUploads?.used||0),calls:Math.max(0,+raw.buckets?.videoUploads?.calls||0)}}next.lastAction=raw.lastAction;next.unpricedAttempts=raw.unpricedAttempts;lsSet(LEDGER_KEY,JSON.stringify(next));return next}
 // Preserve the previous general estimate during migration from the pre-ledger state.
 try{const old=JSON.parse(lsGet(OLD_USAGE_KEY)||'null');if(old?.ptDate===day){const next=freshLedger(day);next.buckets.general.limit=Math.max(1,+old.limit||DEFAULT_YOUTUBE_DAILY_QUOTA);next.buckets.general.used=Math.max(0,+old.used||0);next.buckets.general.calls=Math.max(0,+old.calls||0);next.lastAction=old.lastAction;lsSet(LEDGER_KEY,JSON.stringify(next));return next}}catch{}
 const next=freshLedger(day);lsSet(LEDGER_KEY,JSON.stringify(next));return next
}
function saveLedger(x:LedgerV4){lsSet(LEDGER_KEY,JSON.stringify(x));emit()}
function cleanProjectPart(x:string){return x.trim().replace(/[^a-zA-Z0-9._:@\-…]/g,'_').slice(0,160)}
function maskedClientMatches(a:string,b:string){if(a===b)return true;const split=(x:string)=>{const i=x.indexOf('…');return i<0?[x,'']:[x.slice(0,i),x.slice(i+1)]};const [ap,as]=split(a),[bp,bs]=split(b);return Boolean(ap&&bp&&ap===bp&&as&&bs&&(as.endsWith(bs)||bs.endsWith(as)))}
export function youtubeQuotaProjectIdentity(profile?:{clientIdMasked?:string|null}|null,config?:{projectId?:string|null;clientIdMasked?:string|null}|null):YoutubeQuotaProjectIdentity{
 const masked=String(profile?.clientIdMasked||'').trim(),globalMasked=String(config?.clientIdMasked||'').trim(),project=String(config?.projectId||'').trim();
 if(project&&masked&&globalMasked&&maskedClientMatches(masked,globalMasked))return{projectKey:`gcp:${cleanProjectPart(project)}`,label:project,source:'google-project'};
 if(masked)return{projectKey:`oauth-client:${cleanProjectPart(masked)}`,label:masked,source:'oauth-client'};
 return{projectKey:null,label:'Не удалось определить API-проект для квоты',source:'unknown'}
}
function ensureUploadProject(ledger:LedgerV4,projectKey:string,now=new Date()){const day=youtubePtDate(now);let row=ledger.uploadProjects[projectKey];let changed=false;if(!row){row=normalizeUploadRow(null,day,now);ledger.uploadProjects[projectKey]=row;changed=true}if(ledger.legacyUpload?.quotaDay===day&&!ledger.legacyUpload.claimedBy&&(ledger.legacyUpload.used>0||ledger.legacyUpload.calls>0)){row.used+=ledger.legacyUpload.used;row.calls+=ledger.legacyUpload.calls;row.lastUpdatedAt=now.toISOString();ledger.legacyUpload.claimedBy=projectKey;changed=true}return{row,changed}}
export function registerYoutubeUploadProject(projectKey:string,now=new Date()){if(!projectKey)return youtubeUploadQuotaState('',now);const ledger=readLedger(now),x=ensureUploadProject(ledger,projectKey,now);if(x.changed)saveLedger(ledger);return uploadStateFrom(ledger,projectKey,x.row,now)}
function readReservations(now=new Date()):Reservation[]{try{const x=JSON.parse(lsGet(RESERVATION_KEY)||'[]'),day=youtubePtDate(now);return Array.isArray(x)?x.filter(r=>r?.id&&r?.buckets&&(!r.createdAt||youtubePtDate(new Date(r.createdAt))===day)):[]}catch{return[]}}
function saveReservations(x:Reservation[]){lsSet(RESERVATION_KEY,JSON.stringify(x));emit()}
function reserved(bucket:YoutubeQuotaBucket,excludeId?:string,projectKey?:string,now=new Date()){return readReservations(now).filter(x=>x.id!==excludeId&&(bucket!=='videoUploads'||!projectKey||x.projectKey===projectKey)).reduce((n,x)=>n+Math.max(0,+x.buckets?.[bucket]||0),0)}
function uploadStateFrom(ledger:LedgerV4,projectKey:string,row:UploadProjectRow,now=new Date()):UploadQuotaState{const limit=row.limitSource==='unknown'?null:(row.configuredLimit??DEFAULT_YOUTUBE_VIDEO_UPLOADS),res=reserved('videoUploads',undefined,projectKey,now),remaining=limit==null?null:Math.max(0,limit-row.used-res);return{projectKey,quotaDay:row.quotaDay,used:row.used,calls:row.calls,configuredLimit:row.configuredLimit,limit,limitSource:row.limitSource,resetAt:nextYoutubeQuotaResetAt(now).toISOString(),lastUpdatedAt:row.lastUpdatedAt,reserved:res,remaining}}
export function youtubeUploadQuotaState(projectKey:string|null|undefined,now=new Date()):UploadQuotaState{if(!projectKey)return{projectKey:'',quotaDay:youtubePtDate(now),used:0,calls:0,configuredLimit:null,limit:null,limitSource:'unknown',resetAt:nextYoutubeQuotaResetAt(now).toISOString(),lastUpdatedAt:now.toISOString(),reserved:0,remaining:null};const ledger=readLedger(now),x=ensureUploadProject(ledger,projectKey,now);if(x.changed)saveLedger(ledger);return uploadStateFrom(ledger,projectKey,x.row,now)}
export function setYoutubeUploadQuotaLimit(projectKey:string,limit:number){if(!projectKey)throw new Error('UPLOAD_QUOTA_PROJECT_REQUIRED');const n=Math.floor(Number(limit));if(!Number.isFinite(n)||n<1||n>MAX_CONFIGURED_UPLOAD_LIMIT)throw new Error(`UPLOAD_QUOTA_LIMIT_INVALID: expected 1..${MAX_CONFIGURED_UPLOAD_LIMIT}`);const now=new Date(),ledger=readLedger(now),x=ensureUploadProject(ledger,projectKey,now);x.row.configuredLimit=n;x.row.limitSource='user-configured';x.row.lastUpdatedAt=now.toISOString();saveLedger(ledger);return uploadStateFrom(ledger,projectKey,x.row,now)}
export function resetYoutubeUploadQuotaLimit(projectKey:string){if(!projectKey)throw new Error('UPLOAD_QUOTA_PROJECT_REQUIRED');const now=new Date(),ledger=readLedger(now),x=ensureUploadProject(ledger,projectKey,now);x.row.configuredLimit=null;x.row.limitSource='default';x.row.lastUpdatedAt=now.toISOString();saveLedger(ledger);return uploadStateFrom(ledger,projectKey,x.row,now)}
export function youtubeQuotaLedger(){return readLedger()}
export function youtubeQuotaUsage():YoutubeQuotaUsage{const x=readLedger(),g=x.buckets.general;return{ptDate:x.ptDate,limit:g.limit,used:g.used,calls:g.calls,lastAction:x.lastAction}}
export function youtubeQuotaBucketUsage(bucket:YoutubeQuotaBucket,projectKey?:string){const x=readLedger();if(bucket==='videoUploads'){if(projectKey){const u=youtubeUploadQuotaState(projectKey);return{ptDate:u.quotaDay,limit:u.limit??0,used:u.used,calls:u.calls,reserved:u.reserved,available:u.remaining??0,limitKnown:u.limit!==null}}const used=Object.values(x.uploadProjects).reduce((n,r)=>n+(r.quotaDay===x.ptDate?r.used:0),0)+(!x.legacyUpload?.claimedBy&&x.legacyUpload?.quotaDay===x.ptDate?x.legacyUpload.used:0);return{ptDate:x.ptDate,limit:0,used,calls:0,reserved:reserved(bucket),available:0,limitKnown:false}}const b=x.buckets[bucket];return{ptDate:x.ptDate,...b,reserved:reserved(bucket),available:Math.max(0,b.limit-b.used-reserved(bucket)),limitKnown:true}}
export function setYoutubeQuotaLimit(limit:number){const x=readLedger();x.buckets.general.limit=Math.max(1,Math.floor(limit));saveLedger(x);return youtubeQuotaUsage()}
export function subscribeYoutubeQuota(cb:()=>void){if(typeof window==='undefined')return()=>{};window.addEventListener(EVT,cb);window.addEventListener('storage',cb);return()=>{window.removeEventListener(EVT,cb);window.removeEventListener('storage',cb)}}
function readOperationRows():OperationLedgerRow[]{try{const x=JSON.parse(lsGet(OPERATION_LEDGER_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function saveOperationRows(rows:OperationLedgerRow[]){lsSet(OPERATION_LEDGER_KEY,JSON.stringify(rows.slice(-200)))}
function recordOperationRequest(operationId:string,method:string,bucket:YoutubeQuotaBucket,cost:number,at:string,projectKey?:string){const day=youtubePtDate(new Date(at)),rows=readOperationRows().filter(x=>x.ptDate===day);let row=rows.find(x=>x.operationId===operationId);if(!row){row={operationId,ptDate:day,updatedAt:at,projectKey,buckets:{general:0,videoUploads:0,search:0},methods:{}};rows.push(row)}row.updatedAt=at;if(projectKey)row.projectKey=projectKey;row.buckets[bucket]=(row.buckets[bucket]||0)+cost;const m=row.methods[method]||{calls:0,cost:0};m.calls++;m.cost+=cost;row.methods[method]=m;saveOperationRows(rows)}
export function youtubeOperationActualCost(operationId:string){const row=readOperationRows().find(x=>x.operationId===operationId&&x.ptDate===youtubePtDate());return row||{operationId,ptDate:youtubePtDate(),updatedAt:'',buckets:{general:0,videoUploads:0,search:0},methods:{}}}
export function bindYoutubeQuotaOperationProject(operationId:string,projectKey:string){if(!operationId||!projectKey)return;registerYoutubeUploadProject(projectKey);const now=new Date(),day=youtubePtDate(now),rows=readOperationRows().filter(x=>x.ptDate===day);let row=rows.find(x=>x.operationId===operationId);if(!row){row={operationId,ptDate:day,updatedAt:now.toISOString(),projectKey,buckets:{general:0,videoUploads:0,search:0},methods:{}};rows.push(row)}else{row.projectKey=projectKey;row.updatedAt=now.toISOString()}saveOperationRows(rows)}
export function recordYoutubeApiRequest(event:YoutubeApiRequestEvent){
 const def=youtubeQuotaCosts[event.method as YoutubeApiMethod],at=event.at||new Date().toISOString(),now=new Date(at),x=readLedger(now);
 if(!def){x.unpricedAttempts=[...(x.unpricedAttempts||[]),{method:event.method,at}].slice(-100);x.lastAction=`UNPRICED ${event.method}`;saveLedger(x);return x}
 const reservation=event.operationId?readReservations(now).find(r=>r.id===event.operationId):undefined,operationRow=event.operationId?readOperationRows().find(r=>r.operationId===event.operationId&&r.ptDate===youtubePtDate(now)):undefined,projectKey=reservation?.projectKey||operationRow?.projectKey;
 if(def.bucket==='videoUploads'){
  if(projectKey){const p=ensureUploadProject(x,projectKey,now).row;p.used+=def.cost;p.calls+=1;p.lastUpdatedAt=at}else{x.legacyUpload=x.legacyUpload?.quotaDay===x.ptDate?x.legacyUpload:{quotaDay:x.ptDate,used:0,calls:0};x.legacyUpload.used+=def.cost;x.legacyUpload.calls+=1}
 }else{const b=x.buckets[def.bucket];b.used+=def.cost;b.calls+=1}
 x.lastAction=`${event.method} +${def.cost} ${def.bucket}`;saveLedger(x);if(event.operationId){recordOperationRequest(event.operationId,event.method,def.bucket,def.cost,at,projectKey);consumeYoutubeQuotaReservation(event.operationId,event.method as YoutubeApiMethod)}return x
}
export function planYoutubeQuota(ops:YoutubeQuotaOperation[],excludeReservationId?:string,projectKey?:string):YoutubeQuotaPlan{
 const ledger=readLedger(),unpriced:string[]=[];const rows:YoutubeQuotaPlan['operations']=[];const required:Record<YoutubeQuotaBucket,number>={general:0,videoUploads:0,search:0};
 for(const op of ops){const count=Math.max(0,Math.floor(op.count||0)),def=youtubeQuotaCosts[op.method];if(!def){unpriced.push(op.method);continue}const cost=count*def.cost;required[def.bucket]+=cost;rows.push({...op,count,bucket:def.bucket,unitCost:def.cost,cost})}
 const out={} as YoutubeQuotaPlan['buckets'];for(const bucket of ['general','videoUploads','search'] as YoutubeQuotaBucket[]){if(bucket==='videoUploads'){const u=youtubeUploadQuotaState(projectKey);const res=projectKey?reserved(bucket,excludeReservationId,projectKey):0;if(u.limit===null){out[bucket]={required:required[bucket],used:u.used,reserved:res,limit:0,available:UNKNOWN_UPLOAD_LIMIT,remainingAfter:UNKNOWN_UPLOAD_LIMIT,affordable:true,limitKnown:false}}else{const available=Math.max(0,u.limit-u.used-res);out[bucket]={required:required[bucket],used:u.used,reserved:res,limit:u.limit,available,remainingAfter:Math.max(0,available-required[bucket]),affordable:required[bucket]<=available,limitKnown:true}}}else{const b=ledger.buckets[bucket],res=reserved(bucket,excludeReservationId),available=Math.max(0,b.limit-b.used-res);out[bucket]={required:required[bucket],used:b.used,reserved:res,limit:b.limit,available,remainingAfter:Math.max(0,available-required[bucket]),affordable:required[bucket]<=available,limitKnown:true}}}
 return{operations:rows,buckets:out,estimatedQuotaCost:required.general,estimatedVideoUploadCalls:required.videoUploads,affordable:!unpriced.length&&Object.values(out).every(x=>x.affordable),unpricedMethods:unpriced}
}
export function maxAffordableHomogeneousItems(perItem:YoutubeQuotaOperation[],requested:number,fixed:YoutubeQuotaOperation[]=[],projectKey?:string){const fixedPlan=planYoutubeQuota(fixed,undefined,projectKey);let best=0;for(let n=1;n<=Math.max(0,Math.floor(requested));n++){const p=planYoutubeQuota([...fixed,...perItem.map(x=>({...x,count:x.count*n}))],undefined,projectKey);if(!p.affordable)break;best=n}return{max:best,plan:best?planYoutubeQuota([...fixed,...perItem.map(x=>({...x,count:x.count*best}))],undefined,projectKey):fixedPlan}}
export function reserveYoutubeQuota(id:string,plan:YoutubeQuotaPlan,projectKey?:string){if(!id||!plan.affordable)return false;if(projectKey)registerYoutubeUploadProject(projectKey);const rows=readReservations().filter(x=>x.id!==id);const buckets={general:plan.buckets.general.required,videoUploads:plan.buckets.videoUploads.required,search:plan.buckets.search.required};rows.push({id,createdAt:new Date().toISOString(),projectKey,buckets});saveReservations(rows);return true}
export function reserveYoutubeQuotaAtomic(id:string,operations:YoutubeQuotaOperation[],projectKey?:string){const plan=planYoutubeQuota(operations,id,projectKey);if(!id||!plan.affordable)return{reserved:false,plan};return{reserved:reserveYoutubeQuota(id,plan,projectKey),plan}}
export function releaseYoutubeQuotaReservation(id:string){saveReservations(readReservations().filter(x=>x.id!==id))}
export function consumeYoutubeQuotaReservation(id:string,method:YoutubeApiMethod){const def=youtubeQuotaCosts[method];if(!def)return;const rows=readReservations();const row=rows.find(x=>x.id===id);if(!row)return;row.buckets[def.bucket]=Math.max(0,(row.buckets[def.bucket]||0)-def.cost);saveReservations(rows)}
export function shouldClearYoutubeQuotaGuard(g:YoutubeQuotaGuard,now=new Date()){if(!g?.blocked)return false;const day=youtubePtDate(now);if(g.ptDate&&g.ptDate!==day)return true;if(g.resetAt){const reset=Date.parse(g.resetAt);if(Number.isFinite(reset)&&now.getTime()>=reset)return true}return false}
export function youtubeQuotaState(now=new Date()):YoutubeQuotaGuard{try{const x=JSON.parse(lsGet(GUARD_KEY)||'null') as YoutubeQuotaGuard|null;if(x?.blocked){if(shouldClearYoutubeQuotaGuard(x,now)){clearYoutubeQuotaGuard();return{blocked:false}}return x}}catch{}return{blocked:false}}
export function markYoutubeQuotaExceeded(reason:unknown){const now=new Date(),g:YoutubeQuotaGuard={blocked:true,reason:String(reason||'YouTube API quota exceeded'),at:now.toISOString(),resetAt:nextYoutubeQuotaResetAt(now).toISOString(),ptDate:youtubePtDate(now),source:'provider'};lsSet(GUARD_KEY,JSON.stringify(g));emit();return g}
export function clearYoutubeQuotaGuard(){try{if(typeof localStorage!=='undefined')localStorage.removeItem(GUARD_KEY)}catch{}emit()}
export function youtubeQuotaMessage(){const g=youtubeQuotaState();return g.blocked?`YouTube API вернул quotaExceeded. Ручная синхронизация может выполнить один контрольный запрос. Сброс: ${youtubeQuotaResetLocalInfo().time}.`:'YouTube API quota доступна.'}
export function isYoutubeQuotaError(error:unknown){const s=String(error||'').toLowerCase();return s.includes('youtube_quota_paused')||s.includes('quotaexceeded')||s.includes('dailylimitexceeded')||s.includes('ratelimitexceeded')||s.includes('rate limit exceeded')||s.includes('daily limit exceeded')||s.includes('quota exceeded')}
export function beginManualYoutubeQuotaProbe(){const g=youtubeQuotaState();if(!g.blocked)return true;const u=youtubeQuotaUsage();if(u.used>=u.limit)return false;clearYoutubeQuotaGuard();return true}
export async function youtubeGuardedCall<T>(fn:()=>Promise<T>){const g=youtubeQuotaState();if(g.blocked)throw new Error(`YOUTUBE_LOCAL_QUOTA_PAUSE: ${youtubeQuotaMessage()}`);try{return await fn()}catch(e){if(isYoutubeQuotaError(e))markYoutubeQuotaExceeded(e);throw e}}
// Compatibility estimator for commands that have not yet emitted method-level events. Do not use it for preflight.
export function youtubeQuotaCost(command:string,args?:any,result?:any){if(command==='youtube_channel_stats')return 1;if(command==='youtube_update_existing_video'){if(result?.skipped)return 1;return 52}if(command==='youtube_upload_video')return 0;if(command==='youtube_channel_analytics')return 0;if(command==='youtube_list_existing_videos'){const n=Math.max(1,Number(result?.received||args?.maxResults||1));return 1+Math.ceil(n/50)+Math.ceil(n/50)}if(command==='youtube_backup_existing_videos'){const n=Array.isArray(args?.videos)?args.videos.length:1;return Math.max(1,Math.ceil(n/50))}return 0}
export function recordYoutubeCommand(command:string,args?:any,result?:any){const cost=youtubeQuotaCost(command,args,result);if(cost<=0)return youtubeQuotaUsage();const x=readLedger();x.buckets.general.used+=cost;x.buckets.general.calls+=1;x.lastAction=`${command} +${cost} general`;saveLedger(x);return youtubeQuotaUsage()}
// Legacy capacity helpers retained for backwards compatibility; new UI uses planYoutubeQuota.
export const ESTIMATED_VIDEO_WRITE_UNITS=youtubeQuotaCosts['videos.list'].cost+youtubeQuotaCosts['videos.update'].cost+youtubeQuotaCosts['videos.list'].cost;
export function buildYoutubeQuotaPlan(channels:number,videosPerChannel:number,usage=youtubeQuotaUsage()){const c=Math.max(0,Math.floor(channels)),v=Math.max(1,Math.floor(videosPerChannel)),perChannel=v*ESTIMATED_VIDEO_WRITE_UNITS,totalUnits=c*perChannel,remaining=Math.max(0,usage.limit-usage.used),todayChannels=Math.min(c,Math.floor(remaining/perChannel)),fullDayChannels=Math.max(1,Math.floor(usage.limit/perChannel)),days=c?Math.ceil(Math.max(0,c-todayChannels)/fullDayChannels)+(todayChannels?1:0):0,rows=[] as Array<{day:number;channels:number;units:number}>;let left=c;for(let day=0;left>0;day++){const cap=day===0?todayChannels:fullDayChannels,n=Math.min(left,cap);if(day===0&&cap===0){rows.push({day,channels:0,units:0});continue}rows.push({day,channels:n,units:n*perChannel});left-=n}return{channels:c,videosPerChannel:v,perChannel,totalUnits,remaining,todayChannels,fullDayChannels,days,rows}}
export function saveYoutubeQuotaPlan(x:{channels:number;videosPerChannel:number}){lsSet(PLAN_KEY,JSON.stringify(x))}
export function loadYoutubeQuotaPlan(){try{return JSON.parse(lsGet(PLAN_KEY)||'null')||{channels:100,videosPerChannel:30}}catch{return{channels:100,videosPerChannel:30}}}
