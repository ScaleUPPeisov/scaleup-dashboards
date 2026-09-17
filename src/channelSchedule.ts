import type {Channel,YoutubeExistingVideo} from './types';

export type ExistingCache={
  version:1;
  updatedAt:string;
  videos:YoutubeExistingVideo[];
  baseline:Record<string,YoutubeExistingVideo>;
  lastUndo:YoutubeExistingVideo[];
  syncInfo:Record<string,unknown>|null;
};
export type ScheduleMode='interval'|'pattern';
export type SchedulePattern={publishDays:number;pauseDays:number;anchorDate:string};
export type ChannelScheduleState={channelId:string;lastPublishedAt?:string;lastScheduledAt?:string;nextAvailableAt?:string;scheduledUntil?:string;scheduleMode:ScheduleMode;publishIntervalDays:number;publishDays:number;pauseDays:number;patternAnchorDate?:string;defaultPublishTime:string;scheduledCount:number;updatedAt?:string};
export type PatternCalendarDay={date:string;kind:'video'|'pause'|'occupied';publishSlot:boolean;occupied:boolean};

const EVENT='vyron-channel-schedule-changed';
const SAFE_CACHE_TIMESTAMP='1970-01-01T00:00:00.000Z';
export const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;

function isRecord(value:unknown):value is Record<string,unknown>{
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}
function finiteNumber(value:unknown,fallback:number){
  return typeof value==='number'&&Number.isFinite(value)?value:fallback;
}
function optionalString(value:unknown){
  return typeof value==='string'&&value.trim()?value:undefined;
}

export function normalizeExistingVideo(value:unknown,index=0,fallbackId=''):YoutubeExistingVideo|undefined{
  if(!isRecord(value))return;
  const id=String(typeof value.id==='string'&&value.id.trim()?value.id:fallbackId).trim();
  if(!id)return;
  const tags=Array.isArray(value.tags)?value.tags.filter((x):x is string=>typeof x==='string').map(x=>x.trim()).filter(Boolean):[];
  const privacyStatus=typeof value.privacyStatus==='string'&&value.privacyStatus.trim()?value.privacyStatus:'private';
  const row:YoutubeExistingVideo={
    ...(value as Partial<YoutubeExistingVideo>),
    id,
    position:finiteNumber(value.position,index),
    title:typeof value.title==='string'?value.title:'',
    description:typeof value.description==='string'?value.description:'',
    tags,
    categoryId:typeof value.categoryId==='string'?value.categoryId:'10',
    privacyStatus,
    selected:value.selected===true
  } as YoutubeExistingVideo;
  row.publishedAt=optionalString(value.publishedAt);
  row.publishAt=optionalString(value.publishAt);
  row.thumbnail=optionalString(value.thumbnail);
  row.duration=optionalString(value.duration);
  row.error=optionalString(value.error);
  row.channelId=optionalString(value.channelId);
  row.views=typeof value.views==='number'&&Number.isFinite(value.views)?value.views:undefined;
  row.likes=typeof value.likes==='number'&&Number.isFinite(value.likes)?value.likes:undefined;
  row.comments=typeof value.comments==='number'&&Number.isFinite(value.comments)?value.comments:undefined;
  row.verified=typeof value.verified==='boolean'?value.verified:undefined;
  row.applyState=value.applyState==='saving'||value.applyState==='done'||value.applyState==='error'||value.applyState==='idle'?value.applyState:undefined;
  return row;
}

export function normalizeExistingVideoList(value:unknown):YoutubeExistingVideo[]{
  if(!Array.isArray(value))return[];
  const out:YoutubeExistingVideo[]=[];
  value.forEach((item,index)=>{const row=normalizeExistingVideo(item,index);if(row)out.push(row)});
  return out;
}

export function normalizeExistingVideoRecord(value:unknown):Record<string,YoutubeExistingVideo>{
  if(!isRecord(value))return{};
  const out:Record<string,YoutubeExistingVideo>={};
  let index=0;
  for(const [key,item] of Object.entries(value)){
    const row=normalizeExistingVideo(item,index++,key);
    if(row)out[row.id]=row;
  }
  return out;
}

function normalizeSyncInfo(value:unknown):Record<string,unknown>|null{
  return isRecord(value)?{...value}:null;
}

export function readExistingCache(channelId:string):ExistingCache|undefined{
  if(!channelId)return;
  try{
    const raw=JSON.parse(localStorage.getItem(existingCacheKey(channelId))||'null');
    if(!isRecord(raw)||raw.version!==1)return;
    return{
      version:1,
      updatedAt:typeof raw.updatedAt==='string'&&raw.updatedAt.trim()?raw.updatedAt:SAFE_CACHE_TIMESTAMP,
      videos:normalizeExistingVideoList(raw.videos),
      baseline:normalizeExistingVideoRecord(raw.baseline),
      lastUndo:normalizeExistingVideoList(raw.lastUndo),
      syncInfo:normalizeSyncInfo(raw.syncInfo)
    };
  }catch{return}
}

export function writeExistingCache(channelId:string,x:ExistingCache){
  if(!channelId)return;
  const safe:ExistingCache={
    version:1,
    updatedAt:typeof x?.updatedAt==='string'&&x.updatedAt.trim()?x.updatedAt:SAFE_CACHE_TIMESTAMP,
    videos:normalizeExistingVideoList(x?.videos),
    baseline:normalizeExistingVideoRecord(x?.baseline),
    lastUndo:normalizeExistingVideoList(x?.lastUndo),
    syncInfo:normalizeSyncInfo(x?.syncInfo)
  };
  try{
    localStorage.setItem(existingCacheKey(channelId),JSON.stringify(safe));
    window.dispatchEvent(new CustomEvent(EVENT,{detail:{channelId,updatedAt:safe.updatedAt}}));
  }catch{}
}

const cloneVideo=(v:YoutubeExistingVideo)=>({...v,tags:Array.isArray(v?.tags)?[...v.tags]:[]});
export function replaceExistingCacheFromSync(channelId:string,videos:YoutubeExistingVideo[],syncInfo:any){
  const rows=normalizeExistingVideoList(videos).map(cloneVideo),baseline=Object.fromEntries(rows.map(v=>[v.id,cloneVideo(v)]));
  writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:rows,baseline,lastUndo:[],syncInfo:normalizeSyncInfo(syncInfo)});
}
export function mergeExistingCacheVideos(channelId:string,updates:YoutubeExistingVideo[]){
  const prev=readExistingCache(channelId);
  const map=new Map((prev?.videos||[]).map(v=>[v.id,cloneVideo(v)]));
  const base={...(prev?.baseline||{})};
  for(const u of normalizeExistingVideoList(updates)){map.set(u.id,cloneVideo(u));base[u.id]=cloneVideo(u)}
  writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:[...map.values()],baseline:base,lastUndo:prev?.lastUndo||[],syncInfo:prev?.syncInfo||null});
}

const pad=(n:number)=>String(n).padStart(2,'0');
function parts(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return;const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);const get=(t:string)=>p.find(x=>x.type===t)?.value||'';return{date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}}
export function krasDateKey(iso?:string){return iso?parts(iso)?.date:undefined}
export function toKratLocalInput(iso?:string){const p=iso?parts(iso):undefined;return p?`${p.date}T${p.time}`:''}
export function scheduleDateLabel(iso?:string){if(!iso)return'—';const d=new Date(iso);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
export function dateKeyLabel(key?:string){if(!key)return'—';const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:'—'}
function parseKey(key:string){const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN}
export function addCalendarDays(key:string,days:number){const n=parseKey(key);if(!Number.isFinite(n))return key;const d=new Date(n);d.setUTCDate(d.getUTCDate()+days);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
function diffDays(anchor:string,key:string){const a=parseKey(anchor),b=parseKey(key);return Number.isFinite(a)&&Number.isFinite(b)?Math.floor((b-a)/86400000):0}
export function scheduleModeFor(channel:Channel):ScheduleMode{return channel.scheduleMode==='pattern'?'pattern':'interval'}
export function intervalDaysFor(channel:Channel){return Math.max(1,Math.floor(channel.publishIntervalDays||channel.cadenceDays||1))}
export function patternFor(channel:Channel):SchedulePattern|undefined{if(scheduleModeFor(channel)!=='pattern')return;const anchor=channel.patternAnchorDate;return anchor?{publishDays:Math.max(1,Math.floor(channel.publishDays||3)),pauseDays:Math.max(1,Math.floor(channel.pauseDays||1)),anchorDate:anchor}:undefined}
export function scheduleLabel(channel:Channel){return scheduleModeFor(channel)==='pattern'?`${Math.max(1,Math.floor(channel.publishDays||3))} / ${Math.max(1,Math.floor(channel.pauseDays||1))}`:intervalDaysFor(channel)===1?'каждый день':intervalDaysFor(channel)===2?'через день':`каждые ${intervalDaysFor(channel)} дн.`}
export function scheduleDescription(channel:Channel){return scheduleModeFor(channel)==='pattern'?`${Math.max(1,Math.floor(channel.publishDays||3))} дня публикаций / ${Math.max(1,Math.floor(channel.pauseDays||1))} день пауза`:scheduleLabel(channel)}
export function scheduleAverageIntervalDays(channel:Channel){if(scheduleModeFor(channel)==='pattern'){const p=Math.max(1,Math.floor(channel.publishDays||3)),q=Math.max(1,Math.floor(channel.pauseDays||1));return(p+q)/p}return intervalDaysFor(channel)}
export function isPatternPublishDate(key:string,pattern:SchedulePattern){const cycle=Math.max(2,pattern.publishDays+pattern.pauseDays);const delta=diffDays(pattern.anchorDate,key);if(delta<0)return false;const pos=((delta%cycle)+cycle)%cycle;return pos<pattern.publishDays}
function toKratIso(date:string,time:string){return new Date(`${date}T${time}:00+07:00`).toISOString()}
function occupiedDates(videos:YoutubeExistingVideo[],excludeIds:string[]=[]){const excluded=new Set(excludeIds);return new Set(normalizeExistingVideoList(videos).filter(v=>!excluded.has(v.id)).map(v=>krasDateKey(v.publishAt)).filter(Boolean) as string[])}
export function deriveChannelScheduleState(channel:Channel,videos:YoutubeExistingVideo[],updatedAt?:string,excludeIds:string[]=[]):ChannelScheduleState{
  const mode=scheduleModeFor(channel),interval=intervalDaysFor(channel),publishDays=Math.max(1,Math.floor(channel.publishDays||3)),pauseDays=Math.max(1,Math.floor(channel.pauseDays||1));const defaultTime=`${pad(channel.publishHour||0)}:${pad(channel.publishMinute||0)}`;
  const excluded=new Set(excludeIds),visible=normalizeExistingVideoList(videos).filter(v=>!excluded.has(v.id));const scheduled=visible.map(v=>v.publishAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));const published=visible.map(v=>v.publishedAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const lastScheduledAt=scheduled.length?scheduled[scheduled.length-1]:undefined,lastPublishedAt=published.length?published[published.length-1]:undefined,scheduledUntil=krasDateKey(lastScheduledAt),occupied=occupiedDates(visible);
  let nextKey:string|undefined;
  if(mode==='pattern'){
    const anchor=channel.patternAnchorDate;
    if(anchor){let k=scheduledUntil?addCalendarDays(scheduledUntil,1):anchor;let guard=0;const pattern={publishDays,pauseDays,anchorDate:anchor};while(guard++<20000&&(!isPatternPublishDate(k,pattern)||occupied.has(k)))k=addCalendarDays(k,1);nextKey=k}
  }else if(scheduledUntil){let k=addCalendarDays(scheduledUntil,interval),guard=0;while(guard++<10000&&occupied.has(k))k=addCalendarDays(k,interval);nextKey=k}
  return{channelId:String(channel.id||''),lastPublishedAt,lastScheduledAt,nextAvailableAt:nextKey?toKratIso(nextKey,defaultTime):undefined,scheduledUntil,scheduleMode:mode,publishIntervalDays:interval,publishDays,pauseDays,patternAnchorDate:channel.patternAnchorDate,defaultPublishTime:defaultTime,scheduledCount:scheduled.length,updatedAt};
}
export function getChannelScheduleState(channelId:string,channel:Channel,excludeIds:string[]=[]){const cache=readExistingCache(channelId);return deriveChannelScheduleState(channel,cache?.videos||[],cache?.updatedAt,excludeIds)}
export function generatePatternSchedule(channel:Channel,videos:YoutubeExistingVideo[],count:number,excludeIds:string[]=[]){
  const pattern=patternFor(channel);if(!pattern)return{dates:[] as string[],calendar:[] as PatternCalendarDay[]};const cacheVideos=readExistingCache(channel.id)?.videos||normalizeExistingVideoList(videos),occupied=occupiedDates(cacheVideos,excludeIds),state=deriveChannelScheduleState(channel,cacheVideos,undefined,excludeIds),time=state.defaultPublishTime;let k=state.nextAvailableAt?krasDateKey(state.nextAvailableAt):pattern.anchorDate;if(!k)return{dates:[],calendar:[]};
  const dates:string[]=[],calendar:PatternCalendarDay[]=[];let guard=0;
  while(dates.length<count&&guard++<50000){const publishSlot=isPatternPublishDate(k,pattern),busy=occupied.has(k);calendar.push({date:k,kind:publishSlot?(busy?'occupied':'video'):'pause',publishSlot,occupied:busy});if(publishSlot&&!busy){dates.push(toKratIso(k,time));occupied.add(k)}k=addCalendarDays(k,1)}
  return{dates,calendar};
}
export function generateIntervalSchedule(channel:Channel,videos:YoutubeExistingVideo[],count:number,excludeIds:string[]=[]){const safeVideos=normalizeExistingVideoList(videos);const state=deriveChannelScheduleState(channel,safeVideos,undefined,excludeIds);let k=state.nextAvailableAt?krasDateKey(state.nextAvailableAt):undefined;if(!k)return[];const occupied=occupiedDates(safeVideos,excludeIds),days=intervalDaysFor(channel),time=state.defaultPublishTime,out:string[]=[];let guard=0;while(out.length<count&&guard++<20000){if(!occupied.has(k)){out.push(toKratIso(k,time));occupied.add(k)}k=addCalendarDays(k,days)}return out}
export function subscribeChannelSchedule(cb:(channelId:string)=>void){const fn=(e:Event)=>cb(String((e as CustomEvent<any>).detail?.channelId||''));window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)}
