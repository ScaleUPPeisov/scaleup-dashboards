export type YoutubeQuotaState={blocked:boolean;ptDate?:string;detectedAt?:string;reason?:string};
export type YoutubeQuotaUsage={ptDate:string;limit:number;used:number;calls:number;updatedAt?:string;lastAction?:string};
export type YoutubeQuotaPlanState={channels:number;videosPerChannel:number};
export type YoutubeQuotaPlan={perChannel:number;remaining:number;todayChannels:number;fullDayChannels:number;days:number;totalUnits:number;rows:{day:number;channels:number;units:number}[]};
const KEY='vyron:youtube-quota-guard:v1';
const USAGE_KEY='vyron:youtube-quota-usage:v2';
const PLAN_KEY='vyron:youtube-quota-plan:v1';
const EVENT='vyron-youtube-quota';
export const DEFAULT_YOUTUBE_DAILY_QUOTA=10000;
export const ESTIMATED_VIDEO_WRITE_UNITS=52; // one videos.update (50) + normal read/verify overhead
const ptDate=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=(t:string)=>parts.find(x=>x.type===t)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`};
const emit=()=>{try{window.dispatchEvent(new Event(EVENT))}catch{}};
const safeInt=(v:unknown,fallback:number)=>{const n=Math.floor(Number(v));return Number.isFinite(n)&&n>=0?n:fallback};
export function isYoutubeQuotaError(error:unknown){const s=String(error||'').toLowerCase();return s.includes('quotaexceeded')||s.includes('exceeded your quota')||s.includes('dailylimitexceeded')||s.includes('youtube_quota_paused')}
export function youtubeQuotaState():YoutubeQuotaState{try{const raw=localStorage.getItem(KEY);if(!raw)return{blocked:false};const x=JSON.parse(raw) as YoutubeQuotaState;if(!x?.blocked)return{blocked:false};if(x.ptDate!==ptDate()){localStorage.removeItem(KEY);return{blocked:false}}return x}catch{return{blocked:false}}}
function readUsage():YoutubeQuotaUsage{const today=ptDate();try{const raw=localStorage.getItem(USAGE_KEY);if(raw){const x=JSON.parse(raw) as YoutubeQuotaUsage;if(x.ptDate===today){return{ptDate:today,limit:Math.max(1,safeInt(x.limit,DEFAULT_YOUTUBE_DAILY_QUOTA)),used:safeInt(x.used,0),calls:safeInt(x.calls,0),updatedAt:x.updatedAt,lastAction:x.lastAction}}const previousLimit=Math.max(1,safeInt(x.limit,DEFAULT_YOUTUBE_DAILY_QUOTA));return{ptDate:today,limit:previousLimit,used:0,calls:0}}}catch{}return{ptDate:today,limit:DEFAULT_YOUTUBE_DAILY_QUOTA,used:0,calls:0}}
function saveUsage(x:YoutubeQuotaUsage){localStorage.setItem(USAGE_KEY,JSON.stringify(x));emit();return x}
export function youtubeQuotaUsage(){const x=readUsage();const guard=youtubeQuotaState();if(guard.blocked&&x.used<x.limit){x.used=x.limit;return saveUsage(x)}return x}
export function youtubeQuotaRemaining(){const x=youtubeQuotaUsage();return Math.max(0,x.limit-x.used)}
export function setYoutubeQuotaLimit(limit:number){const x=readUsage();x.limit=Math.max(1,Math.floor(limit||DEFAULT_YOUTUBE_DAILY_QUOTA));x.used=Math.min(x.used,x.limit);x.updatedAt=new Date().toISOString();return saveUsage(x)}
export function recordYoutubeQuota(units:number,action:string){const n=Math.max(0,Math.ceil(Number(units)||0));if(!n)return youtubeQuotaUsage();const x=readUsage();x.used=Math.min(x.limit,Math.max(0,x.used+n));x.calls+=1;x.updatedAt=new Date().toISOString();x.lastAction=action;return saveUsage(x)}
export function youtubeQuotaCost(command:string,args?:Record<string,unknown>,result?:any){
 if(command==='youtube_oauth_profile_health'||command==='youtube_channel_stats')return 1;
 if(command==='youtube_list_existing_videos'){
  const received=Math.max(0,Number(result?.received||0));const found=Math.max(received,Number(result?.youtubeFound||0));const requested=Math.max(1,Number(result?.requested||args?.maxResults||received||1));const n=Math.min(found,requested);return 1+Math.max(1,Math.ceil(n/50))+Math.max(1,Math.ceil(received/50));
 }
 if(command==='youtube_backup_existing_videos'){const n=Array.isArray(args?.videos)?(args?.videos as unknown[]).length:Number(result?.count||0);return Math.max(1,Math.ceil(Math.max(1,n)/50));}
 if(command==='youtube_update_existing_video'){
  if(result?.skipped)return 1;
  let cost=1; // initial videos.list
  const metadata=Boolean(result?.metadataAccepted);const scheduleRequested=Boolean(result?.scheduleRequested);const scheduleAccepted=Boolean(result?.scheduleAccepted);
  if(metadata&&scheduleRequested&&!scheduleAccepted)cost+=100; // combined update + metadata fallback
  else if(metadata||scheduleAccepted)cost+=50;
  if(result?.metadataVerifyPending||result?.scheduleVerifyPending)cost+=2;
  return cost;
 }
 // Analytics API has a separate quota model. Search/insert moved to granular buckets in 2026.
 if(command==='youtube_channel_analytics')return 0;
 if(command==='youtube_discover_competitors')return 1;
 if(command==='youtube_competitor_snapshot')return 4;
 if(command==='youtube_upload_video')return 0;
 return 1;
}
export function recordYoutubeCommand(command:string,args?:Record<string,unknown>,result?:any){return recordYoutubeQuota(youtubeQuotaCost(command,args,result),command)}
export function markYoutubeQuotaExceeded(error:unknown){const state:YoutubeQuotaState={blocked:true,ptDate:ptDate(),detectedAt:new Date().toISOString(),reason:String(error||'quotaExceeded')};localStorage.setItem(KEY,JSON.stringify(state));const x=readUsage();x.used=x.limit;x.updatedAt=new Date().toISOString();x.lastAction='quotaExceeded';saveUsage(x);emit();return state}
export function clearYoutubeQuotaGuard(){localStorage.removeItem(KEY);emit()}
export function youtubeQuotaMessage(){return 'Квота YouTube Data API исчерпана. VYRON поставил YouTube-запросы на паузу до следующего сброса дневной квоты (00:00 PT). Черновики и незавершённые пачки сохранены.'}
export function assertYoutubeQuotaAvailable(){const q=youtubeQuotaState();if(q.blocked)throw new Error(`YOUTUBE_QUOTA_PAUSED: ${youtubeQuotaMessage()}`)}
export async function youtubeGuardedCall<T>(fn:()=>Promise<T>):Promise<T>{assertYoutubeQuotaAvailable();try{return await fn()}catch(e){if(isYoutubeQuotaError(e)){markYoutubeQuotaExceeded(e);throw new Error(`YOUTUBE_QUOTA_PAUSED: ${youtubeQuotaMessage()}`)}throw e}}
export function subscribeYoutubeQuota(cb:()=>void){window.addEventListener(EVENT,cb);return()=>window.removeEventListener(EVENT,cb)}
export function loadYoutubeQuotaPlan():YoutubeQuotaPlanState{try{const x=JSON.parse(localStorage.getItem(PLAN_KEY)||'{}');return{channels:Math.max(1,safeInt(x.channels,100)),videosPerChannel:Math.max(1,safeInt(x.videosPerChannel,30))}}catch{return{channels:100,videosPerChannel:30}}}
export function saveYoutubeQuotaPlan(plan:YoutubeQuotaPlanState){const x={channels:Math.max(1,Math.floor(plan.channels||1)),videosPerChannel:Math.max(1,Math.floor(plan.videosPerChannel||1))};localStorage.setItem(PLAN_KEY,JSON.stringify(x));emit();return x}
export function buildYoutubeQuotaPlan(channels:number,videosPerChannel:number,usage=youtubeQuotaUsage()):YoutubeQuotaPlan{
 const c=Math.max(1,Math.floor(channels||1));const v=Math.max(1,Math.floor(videosPerChannel||1));
 const sync=1+Math.max(1,Math.ceil(v/50))*2;const perChannel=v*ESTIMATED_VIDEO_WRITE_UNITS+sync;const remaining=Math.max(0,usage.limit-usage.used);const todayChannels=Math.floor(remaining/perChannel);const fullDayChannels=Math.max(1,Math.floor(usage.limit/perChannel));const totalUnits=c*perChannel;
 let left=c;const rows:{day:number;channels:number;units:number}[]=[];let day=0;
 const first=Math.min(left,todayChannels);rows.push({day:0,channels:first,units:first*perChannel});left-=first;
 while(left>0&&rows.length<8){day++;const take=Math.min(left,fullDayChannels);rows.push({day,channels:take,units:take*perChannel});left-=take}
 const days=(todayChannels>0?1:0)+Math.ceil(Math.max(0,c-todayChannels)/fullDayChannels);
 return{perChannel,remaining,todayChannels,fullDayChannels,days,totalUnits,rows};
}
