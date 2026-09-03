import type {Channel,YoutubeExistingVideo} from './types';
export type ExistingCache={version:1;updatedAt:string;videos:YoutubeExistingVideo[];baseline:Record<string,YoutubeExistingVideo>;lastUndo:YoutubeExistingVideo[];syncInfo:any};
export type ChannelScheduleState={channelId:string;lastPublishedAt?:string;lastScheduledAt?:string;nextAvailableAt?:string;scheduledUntil?:string;publishIntervalDays:number;defaultPublishTime:string;scheduledCount:number;updatedAt?:string};
const EVENT='vyron-channel-schedule-changed';
export const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
export function readExistingCache(channelId:string):ExistingCache|undefined{if(!channelId)return;try{const x=JSON.parse(localStorage.getItem(existingCacheKey(channelId))||'null');return x?.version===1?x:undefined}catch{return}}
export function writeExistingCache(channelId:string,x:ExistingCache){if(!channelId)return;try{localStorage.setItem(existingCacheKey(channelId),JSON.stringify(x));window.dispatchEvent(new CustomEvent(EVENT,{detail:{channelId,updatedAt:x.updatedAt}}))}catch{}}
const cloneVideo=(v:YoutubeExistingVideo)=>({...v,tags:[...(v.tags||[])]});
export function replaceExistingCacheFromSync(channelId:string,videos:YoutubeExistingVideo[],syncInfo:any){const rows=videos.map(cloneVideo),baseline=Object.fromEntries(rows.map(v=>[v.id,cloneVideo(v)]));writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:rows,baseline,lastUndo:[],syncInfo})}
export function mergeExistingCacheVideos(channelId:string,updates:YoutubeExistingVideo[]){const prev=readExistingCache(channelId);const map=new Map((prev?.videos||[]).map(v=>[v.id,cloneVideo(v)]));const base={...(prev?.baseline||{})};for(const u of updates){map.set(u.id,cloneVideo(u));base[u.id]=cloneVideo(u)}writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:[...map.values()],baseline:base,lastUndo:prev?.lastUndo||[],syncInfo:prev?.syncInfo||null})}
const pad=(n:number)=>String(n).padStart(2,'0');
function parts(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return;const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);const get=(t:string)=>p.find(x=>x.type===t)?.value||'';return{date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}}
export function krasDateKey(iso?:string){return iso?parts(iso)?.date:undefined}
export function toKratLocalInput(iso?:string){const p=iso?parts(iso):undefined;return p?`${p.date}T${p.time}`:''}
export function scheduleDateLabel(iso?:string){if(!iso)return'—';const d=new Date(iso);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
function addDays(key:string,days:number){const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return key;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));d.setUTCDate(d.getUTCDate()+days);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
export function deriveChannelScheduleState(channel:Channel,videos:YoutubeExistingVideo[],updatedAt?:string,excludeIds:string[]=[]):ChannelScheduleState{
  const excluded=new Set(excludeIds),cadence=Math.max(1,Math.floor(channel.cadenceDays||1));const defaultTime=`${pad(channel.publishHour||0)}:${pad(channel.publishMinute||0)}`;
  const visible=videos.filter(v=>!excluded.has(v.id));
  const scheduled=visible.map(v=>v.publishAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const published=visible.map(v=>v.publishedAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const lastScheduledAt=scheduled.length?scheduled[scheduled.length-1]:undefined,lastPublishedAt=published.length?published[published.length-1]:undefined;const scheduledUntil=krasDateKey(lastScheduledAt);const occupied=new Set(scheduled.map(x=>krasDateKey(x)).filter(Boolean) as string[]);
  let nextAvailableAt:string|undefined;
  if(scheduledUntil){let next=addDays(scheduledUntil,cadence);let guard=0;while(occupied.has(next)&&guard++<10000)next=addDays(next,cadence);nextAvailableAt=`${next}T${defaultTime}:00+07:00`}
  return{channelId:channel.id,lastPublishedAt,lastScheduledAt,nextAvailableAt,scheduledUntil,publishIntervalDays:cadence,defaultPublishTime:defaultTime,scheduledCount:scheduled.length,updatedAt};
}
export function getChannelScheduleState(channelId:string,channel:Channel,excludeIds:string[]=[]){const cache=readExistingCache(channelId);return deriveChannelScheduleState(channel,cache?.videos||[],cache?.updatedAt,excludeIds)}
export function subscribeChannelSchedule(cb:(channelId:string)=>void){const fn=(e:Event)=>cb(String((e as CustomEvent<any>).detail?.channelId||''));window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)}
