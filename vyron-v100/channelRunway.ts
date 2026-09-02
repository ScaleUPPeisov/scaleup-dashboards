import type {Channel,YoutubeExistingVideo} from './types';
import {ESTIMATED_VIDEO_WRITE_UNITS,youtubeQuotaUsage,type YoutubeQuotaUsage} from './youtubeQuota';

export const CHANNEL_RUNWAY_KEY='vyron:channel-runway:v1';
export const CHANNEL_RUNWAY_EVENT='vyron-channel-runway';
export const KRASNOYARSK_TZ='Asia/Krasnoyarsk';
const EXISTING_CACHE_PREFIX='vyron:existing-cache:v1:';
const PRODUCTION_WORKSPACE_KEY='vyron:production-workspace:v1';
const DAY=86_400_000;

export type RunwayStatus='safe'|'plan'|'prepare'|'urgent'|'empty'|'nodata';
export type ChannelRunwayRow={
 channelId:string;channelName:string;enabled:boolean;cadenceDays:number;targetBufferDays:number;
 scheduledUntil?:string;scheduledVideoCount:number;averagePublishIntervalDays:number;lastScheduleSync?:string;
 lastLocalCalculation:string;runwayDays?:number;nextProductionDate?:string;batchVideos:number;batchCoverageDays:number;
 quotaCostEstimate:number;status:RunwayStatus;priorityRank:number;
};
export type ChannelRunwayPlan={
 totalChannels:number;enabledChannels:number;attention:number;critical:number;safe:number;noData:number;
 averageBatchVideos:number;averageBatchCoverageDays:number;recommendedPaceDays:number;recommendedBatchesPerDay:number;
 fullQuotaCapacity:number;remainingQuotaCapacity:number;quotaDaysAll:number;quotaDaysAttention:number;
 quotaLimit:number;quotaUsed:number;quotaRemaining:number;nextChannelId?:string;nextChannelName?:string;nextProductionDate?:string;nextProductionInDays?:number;
};
export type ChannelRunwayState={version:1;calculatedAt:string;calculationDateKrasnoyarsk:string;channelSignature:string;rows:Record<string,ChannelRunwayRow>;plan:ChannelRunwayPlan};

type ExistingCache={version:1;updatedAt?:string;videos?:YoutubeExistingVideo[]};
type ProductionWorkspaceState={version:1;byChannel?:Record<string,{target?:number}>};

const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const safePositive=(n:unknown,fallback:number)=>{const x=Number(n);return Number.isFinite(x)&&x>0?x:fallback};
const dateParts=(d:Date,timeZone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
const part=(p:Intl.DateTimeFormatPart[],type:string)=>Number(p.find(x=>x.type===type)?.value||0);
export function dateKeyInZone(input:Date|string, timeZone=KRASNOYARSK_TZ){const d=input instanceof Date?input:new Date(input);if(!Number.isFinite(d.getTime()))return'';const p=dateParts(d,timeZone);return `${part(p,'year')}-${String(part(p,'month')).padStart(2,'0')}-${String(part(p,'day')).padStart(2,'0')}`}
const dateKeyUtc=(key:string)=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(key);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN};
export function addDaysToDateKey(key:string,days:number){const t=dateKeyUtc(key);if(!Number.isFinite(t))return'';const d=new Date(t+Math.trunc(days)*DAY);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`}
export function daysBetweenDateKeys(from:string,to:string){const a=dateKeyUtc(from),b=dateKeyUtc(to);return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/DAY):0}
export function formatDateKeyRu(key?:string){if(!key)return'—';const t=dateKeyUtc(key);return Number.isFinite(t)?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(t)):'—'}
export function runwayDaysFor(scheduledUntil:string|undefined,now=new Date()){if(!scheduledUntil)return undefined;const end=dateKeyInZone(scheduledUntil),today=dateKeyInZone(now);return end&&today?Math.max(0,daysBetweenDateKeys(today,end)):undefined}

function zonedWallToInstant(year:number,month:number,day:number,hour:number,minute:number,timeZone:string){
 const target=Date.UTC(year,month-1,day,hour,minute,0);let guess=target;
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){const p=fmt.formatToParts(new Date(guess));const wall=Date.UTC(part(p,'year'),part(p,'month')-1,part(p,'day'),part(p,'hour'),part(p,'minute'),part(p,'second'));const delta=target-wall;if(!delta)break;guess+=delta}
 return new Date(guess);
}
export function nextKrasnoyarskSixAt(now=new Date()){
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:KRASNOYARSK_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const p=fmt.formatToParts(now);const y=part(p,'year'),m=part(p,'month'),d=part(p,'day');
 let candidate=zonedWallToInstant(y,m,d,6,0,KRASNOYARSK_TZ);
 if(candidate.getTime()<=now.getTime()+500){const base=new Date(Date.UTC(y,m-1,d)+DAY);candidate=zonedWallToInstant(base.getUTCFullYear(),base.getUTCMonth()+1,base.getUTCDate(),6,0,KRASNOYARSK_TZ)}
 return candidate;
}
export function isAtOrAfterKrasnoyarskSix(now=new Date()){const fmt=new Intl.DateTimeFormat('en-US',{timeZone:KRASNOYARSK_TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const p=fmt.formatToParts(now);return part(p,'hour')>6||(part(p,'hour')===6&&part(p,'minute')>=0)}

export function statusForRunway(days?:number):{status:RunwayStatus;priorityRank:number}{
 if(days===undefined)return{status:'nodata',priorityRank:2};
 if(days<=0)return{status:'empty',priorityRank:0};
 if(days<=14)return{status:'urgent',priorityRank:1};
 if(days<=30)return{status:'prepare',priorityRank:3};
 if(days<=45)return{status:'plan',priorityRank:4};
 return{status:'safe',priorityRank:5};
}

export function channelSignature(channels:Channel[]){return channels.map(c=>`${c.id}:${c.enabled?1:0}:${c.cadenceDays}:${c.targetBufferDays}`).sort().join('|')}
function readExistingCache(channelId:string):ExistingCache|undefined{try{const x=JSON.parse(localStorage.getItem(EXISTING_CACHE_PREFIX+channelId)||'null');return x?.version===1?x:undefined}catch{return}}
function readProductionTargets(){const out:Record<string,number>={};try{const x=JSON.parse(localStorage.getItem(PRODUCTION_WORKSPACE_KEY)||'null') as ProductionWorkspaceState;if(x?.version===1)for(const [id,p] of Object.entries(x.byChannel||{})){const n=Number(p?.target);if(Number.isFinite(n)&&n>0)out[id]=Math.floor(n)}}catch{}return out}
export function readChannelRunwayState():ChannelRunwayState|undefined{try{const x=JSON.parse(localStorage.getItem(CHANNEL_RUNWAY_KEY)||'null');return x?.version===1?x:undefined}catch{return}}
function emit(){try{window.dispatchEvent(new Event(CHANNEL_RUNWAY_EVENT))}catch{}}
export function subscribeChannelRunway(cb:()=>void){window.addEventListener(CHANNEL_RUNWAY_EVENT,cb);return()=>window.removeEventListener(CHANNEL_RUNWAY_EVENT,cb)}

export function buildChannelRunwayRows(channels:Channel[],cacheByChannel:Record<string,ExistingCache|undefined>,productionTargets:Record<string,number>,now=new Date(),previous?:ChannelRunwayState){
 const rows:Record<string,ChannelRunwayRow>={};const nowMs=now.getTime();const calculatedAt=now.toISOString();
 for(const c of channels){
  const cadence=Math.max(1,safePositive(c.cadenceDays,1));const defaultBatch=Math.max(1,Math.ceil(safePositive(c.targetBufferDays,60)/cadence));const batchVideos=Math.max(1,Math.floor(productionTargets[c.id]||defaultBatch));const batchCoverageDays=Math.max(1,Math.round(batchVideos*cadence));const quotaCostEstimate=batchVideos*ESTIMATED_VIDEO_WRITE_UNITS+(1+2*Math.max(1,Math.ceil(batchVideos/50)));
  const cache=cacheByChannel[c.id];const prev=previous?.rows?.[c.id];let scheduledUntil=prev?.scheduledUntil,scheduledVideoCount=prev?.scheduledVideoCount||0,averagePublishIntervalDays=prev?.averagePublishIntervalDays||cadence,lastScheduleSync=prev?.lastScheduleSync;
  if(cache){
   const scheduled=(cache.videos||[]).filter(v=>Boolean(v.publishAt)&&v.privacyStatus!=='public'&&Date.parse(v.publishAt!)>nowMs).sort((a,b)=>Date.parse(a.publishAt!)-Date.parse(b.publishAt!));
   scheduledVideoCount=scheduled.length;scheduledUntil=scheduled.at(-1)?.publishAt;lastScheduleSync=cache.updatedAt;
   if(scheduled.length>=2){const diffs=scheduled.slice(1).map((v,i)=>(Date.parse(v.publishAt!)-Date.parse(scheduled[i].publishAt!))/DAY).filter(n=>Number.isFinite(n)&&n>0);if(diffs.length)averagePublishIntervalDays=Math.round((diffs.reduce((a,b)=>a+b,0)/diffs.length)*10)/10}
   else averagePublishIntervalDays=cadence;
  }
  const runwayDays=runwayDaysFor(scheduledUntil,now);const leadDays=clamp(Math.round(batchCoverageDays*.75),14,45);const scheduledKey=scheduledUntil?dateKeyInZone(scheduledUntil):'';const nextProductionDate=scheduledKey?addDaysToDateKey(scheduledKey,-leadDays):undefined;const st=statusForRunway(runwayDays);
  rows[c.id]={channelId:c.id,channelName:c.name,enabled:c.enabled,cadenceDays:cadence,targetBufferDays:Math.max(1,safePositive(c.targetBufferDays,batchCoverageDays)),scheduledUntil,scheduledVideoCount,averagePublishIntervalDays,lastScheduleSync,lastLocalCalculation:calculatedAt,runwayDays,nextProductionDate,batchVideos,batchCoverageDays,quotaCostEstimate,status:st.status,priorityRank:st.priorityRank};
 }
 return rows;
}

export function buildChannelRunwayPlan(rows:Record<string,ChannelRunwayRow>,quota:YoutubeQuotaUsage,now=new Date()):ChannelRunwayPlan{
 const all=Object.values(rows),enabled=all.filter(r=>r.enabled),production=enabled.filter(r=>r.status!=='nodata'),attentionRows=production.filter(r=>r.status!=='safe');
 const avg=(xs:number[],fallback=0)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:fallback;
 const averageBatchVideos=Math.max(1,Math.round(avg(enabled.map(r=>r.batchVideos),1)));const averageBatchCoverageDays=Math.max(1,Math.round(avg(enabled.map(r=>r.batchCoverageDays),1)));const averageCost=Math.max(1,avg(enabled.map(r=>r.quotaCostEstimate),1));
 const quotaLimit=Math.max(1,quota.limit||10_000),quotaUsed=Math.max(0,quota.used||0),quotaRemaining=Math.max(0,quotaLimit-quotaUsed);const fullQuotaCapacity=Math.floor(quotaLimit/averageCost),remainingQuotaCapacity=Math.floor(quotaRemaining/averageCost);
 const allCost=enabled.reduce((s,r)=>s+r.quotaCostEstimate,0),attentionCost=attentionRows.reduce((s,r)=>s+r.quotaCostEstimate,0);const quotaDaysAll=enabled.length?Math.max(1,Math.ceil(allCost/quotaLimit)):0,quotaDaysAttention=attentionRows.length?Math.max(1,Math.ceil(attentionCost/quotaLimit)):0;
 const demandPerDay=enabled.reduce((s,r)=>s+1/Math.max(1,r.batchCoverageDays),0);const recommendedPaceDays=demandPerDay>0?Math.max(1,Math.round(1/demandPerDay)):0;const recommendedBatchesPerDay=Math.round(demandPerDay*100)/100;
 const queue=production.slice().sort((a,b)=>{const ad=a.nextProductionDate?dateKeyUtc(a.nextProductionDate):Number.POSITIVE_INFINITY,bd=b.nextProductionDate?dateKeyUtc(b.nextProductionDate):Number.POSITIVE_INFINITY;return a.priorityRank-b.priorityRank||ad-bd||(a.runwayDays??99999)-(b.runwayDays??99999)||a.channelName.localeCompare(b.channelName)});const next=queue[0];const today=dateKeyInZone(now);const nextProductionInDays=next?.nextProductionDate?daysBetweenDateKeys(today,next.nextProductionDate):undefined;
 return{totalChannels:all.length,enabledChannels:enabled.length,attention:enabled.filter(r=>r.status!=='safe').length,critical:enabled.filter(r=>r.status==='empty'||r.status==='urgent').length,safe:enabled.filter(r=>r.status==='safe').length,noData:enabled.filter(r=>r.status==='nodata').length,averageBatchVideos,averageBatchCoverageDays,recommendedPaceDays,recommendedBatchesPerDay,fullQuotaCapacity,remainingQuotaCapacity,quotaDaysAll,quotaDaysAttention,quotaLimit,quotaUsed,quotaRemaining,nextChannelId:next?.channelId,nextChannelName:next?.channelName,nextProductionDate:next?.nextProductionDate,nextProductionInDays};
}

export function calculateChannelRunway(channels:Channel[],now=new Date(),quota:YoutubeQuotaUsage=youtubeQuotaUsage(),previous=readChannelRunwayState()){
 const caches=Object.fromEntries(channels.map(c=>[c.id,readExistingCache(c.id)]));const rows=buildChannelRunwayRows(channels,caches,readProductionTargets(),now,previous);const state:ChannelRunwayState={version:1,calculatedAt:now.toISOString(),calculationDateKrasnoyarsk:dateKeyInZone(now),channelSignature:channelSignature(channels),rows,plan:buildChannelRunwayPlan(rows,quota,now)};return state;
}
export function recalculateChannelRunway(channels:Channel[],now=new Date()){const state=calculateChannelRunway(channels,now);try{localStorage.setItem(CHANNEL_RUNWAY_KEY,JSON.stringify(state))}catch{}emit();return state}
export function shouldRunDailyChannelRunway(state:ChannelRunwayState|undefined,channels:Channel[],now=new Date()){if(!state)return true;if(state.channelSignature!==channelSignature(channels))return true;return state.calculationDateKrasnoyarsk!==dateKeyInZone(now)&&isAtOrAfterKrasnoyarskSix(now)}
