export type YoutubeQuotaBucket='general'|'videoUploads'|'search';
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
const OPERATION_LEDGER_KEY='vyron:youtube-operation-ledger:v1';
const EVT='vyron-youtube-quota-change';

type BucketRow={limit:number;used:number;calls:number};
type Ledger={version:3;ptDate:string;buckets:Record<YoutubeQuotaBucket,BucketRow>;lastAction?:string;unpricedAttempts?:Array<{method:string;at:string}>};
type Reservation={id:string;createdAt:string;buckets:Record<YoutubeQuotaBucket,number>};
type OperationLedgerRow={operationId:string;ptDate:string;updatedAt:string;buckets:Record<YoutubeQuotaBucket,number>;methods:Record<string,{calls:number;cost:number}>};
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
 const day=youtubePtDate();try{const raw=JSON.parse(lsGet(LEDGER_KEY)||'null');if(raw?.version===3&&raw.ptDate===day){const base=freshLedger(day);return{...base,...raw,buckets:{general:{...base.buckets.general,...raw.buckets?.general},videoUploads:{...base.buckets.videoUploads,...raw.buckets?.videoUploads},search:{...base.buckets.search,...raw.buckets?.search}}}}}catch{}
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
function readOperationRows():OperationLedgerRow[]{try{const x=JSON.parse(lsGet(OPERATION_LEDGER_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function saveOperationRows(rows:OperationLedgerRow[]){lsSet(OPERATION_LEDGER_KEY,JSON.stringify(rows.slice(-200)))}
function recordOperationRequest(operationId:string,method:string,bucket:YoutubeQuotaBucket,cost:number,at:string){const day=youtubePtDate();let rows=readOperationRows().filter(x=>x.ptDate===day),row=rows.find(x=>x.operationId===operationId);if(!row){row={operationId,ptDate:day,updatedAt:at,buckets:{general:0,videoUploads:0,search:0},methods:{}};rows.push(row)}row.updatedAt=at;row.buckets[bucket]=(row.buckets[bucket]||0)+cost;const m=row.methods[method]||{calls:0,cost:0};m.calls++;m.cost+=cost;row.methods[method]=m;saveOperationRows(rows)}
export function youtubeOperationActualCost(operationId:string){const row=readOperationRows().find(x=>x.operationId===operationId&&x.ptDate===youtubePtDate());return row||{operationId,ptDate:youtubePtDate(),updatedAt:'',buckets:{general:0,videoUploads:0,search:0},methods:{}}}
export function recordYoutubeApiRequest(event:YoutubeApiRequestEvent){
 const def=youtubeQuotaCosts[event.method as YoutubeApiMethod],x=readLedger(),at=event.at||new Date().toISOString();
 if(!def){x.unpricedAttempts=[...(x.unpricedAttempts||[]),{method:event.method,at}].slice(-100);x.lastAction=`UNPRICED ${event.method}`;saveLedger(x);return x}
 const b=x.buckets[def.bucket];b.used+=def.cost;b.calls+=1;x.lastAction=`${event.method} +${def.cost} ${def.bucket}`;saveLedger(x);if(event.operationId){recordOperationRequest(event.operationId,event.method,def.bucket,def.cost,at);consumeYoutubeQuotaReservation(event.operationId,event.method as YoutubeApiMethod)}return x
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
