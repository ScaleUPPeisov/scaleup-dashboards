import type {Channel,YoutubeExistingVideo} from './types';
export type ExistingCache={version:1;updatedAt:string;videos:YoutubeExistingVideo[];baseline:Record<string,YoutubeExistingVideo>;lastUndo:YoutubeExistingVideo[];syncInfo:any;lastCompleteAt?:string;lastCompleteSyncInfo?:any};
export type ScheduleMode='interval'|'pattern';
export type SchedulePattern={publishDays:number;pauseDays:number;anchorDate:string};
export type ScheduleSyncTruth='complete'|'incomplete'|'unknown';
export type ChannelScheduleState={channelId:string;lastPublishedAt?:string;lastScheduledAt?:string;nextAvailableAt?:string;scheduledUntil?:string;scheduleMode:ScheduleMode;publishIntervalDays:number;publishDays:number;pauseDays:number;patternAnchorDate?:string;defaultPublishTime:string;scheduledCount:number;updatedAt?:string;syncTruth:ScheduleSyncTruth};
export type PatternCalendarDay={date:string;kind:'video'|'pause'|'occupied';publishSlot:boolean;occupied:boolean};
const EVENT='vyron-channel-schedule-changed';
export const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
const isRecord=(x:unknown):x is Record<string,unknown>=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const optionalString=(x:unknown)=>typeof x==='string'&&x.trim()?x:undefined;
function normalizeExistingVideo(value:unknown,index=0):YoutubeExistingVideo|undefined{
  if(!isRecord(value))return;
  const id=optionalString(value.id);
  if(!id)return;
  const applyState=['idle','saving','done','error'].includes(String(value.applyState))?value.applyState as YoutubeExistingVideo['applyState']:undefined;
  const num=(x:unknown)=>Number.isFinite(Number(x))?Number(x):undefined;
  return{
    id,
    position:Number.isFinite(Number(value.position))?Number(value.position):index,
    title:typeof value.title==='string'?value.title:'',
    description:typeof value.description==='string'?value.description:'',
    tags:Array.isArray(value.tags)?value.tags.filter((x):x is string=>typeof x==='string'):[],
    categoryId:typeof value.categoryId==='string'?value.categoryId:'10',
    publishedAt:optionalString(value.publishedAt),
    privacyStatus:typeof value.privacyStatus==='string'?value.privacyStatus:'',
    publishAt:optionalString(value.publishAt),
    thumbnail:optionalString(value.thumbnail),
    duration:optionalString(value.duration),
    views:num(value.views),likes:num(value.likes),comments:num(value.comments),
    selected:value.selected===true,
    applyState,
    error:optionalString(value.error),
    channelId:optionalString(value.channelId),
    verified:typeof value.verified==='boolean'?value.verified:undefined
  };
}
function normalizeVideoArray(value:unknown){return Array.isArray(value)?value.map(normalizeExistingVideo).filter((x):x is YoutubeExistingVideo=>Boolean(x)):[]}
function normalizeBaseline(value:unknown){
  if(!isRecord(value))return{} as Record<string,YoutubeExistingVideo>;
  const out:Record<string,YoutubeExistingVideo>={};
  let index=0;
  for(const [key,row] of Object.entries(value)){const video=normalizeExistingVideo(row,index++);if(video)out[key||video.id]=video}
  return out;
}
function normalizeSyncInfo(value:unknown){return value===null||isRecord(value)?value:null}
export function scheduleSyncTruthFromInfo(value:unknown):ScheduleSyncTruth{
  if(!isRecord(value))return'unknown';
  if(value.scheduleComplete===true)return'complete';
  if(value.scheduleComplete===false||value.complete===false)return'incomplete';
  if(value.complete===true)return Number(value.draftCandidateCount||0)>0?'incomplete':'complete';
  return'unknown';
}
export function futureScheduledVideos(videos:YoutubeExistingVideo[],nowMs=Date.now()){
  return normalizeVideoArray(videos).filter(v=>v.privacyStatus==='private'&&Boolean(v.publishAt)&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>nowMs).sort((a,b)=>Date.parse(a.publishAt!)-Date.parse(b.publishAt!));
}
function authoritativeCacheVideos(cache:ExistingCache|undefined){
  if(!cache)return[] as YoutubeExistingVideo[];
  const baseline=Object.values(cache.baseline||{});
  return baseline.length?normalizeVideoArray(baseline):normalizeVideoArray(cache.videos);
}
export function readAuthoritativeExistingInventory(channelId:string){
  return authoritativeCacheVideos(readExistingCache(channelId)).map(cloneVideo);
}
export function readExistingCache(channelId:string):ExistingCache|undefined{
  if(!channelId)return;
  try{
    const x=JSON.parse(localStorage.getItem(existingCacheKey(channelId))||'null');
    if(!isRecord(x)||x.version!==1)return;
    return{version:1,updatedAt:optionalString(x.updatedAt)||'1970-01-01T00:00:00.000Z',videos:normalizeVideoArray(x.videos),baseline:normalizeBaseline(x.baseline),lastUndo:normalizeVideoArray(x.lastUndo),syncInfo:normalizeSyncInfo(x.syncInfo),lastCompleteAt:optionalString(x.lastCompleteAt),lastCompleteSyncInfo:normalizeSyncInfo(x.lastCompleteSyncInfo)};
  }catch{return}
}
export function writeExistingCache(channelId:string,x:ExistingCache){
 if(!channelId)return;
 try{
  const prev=readExistingCache(channelId);
  const payload:ExistingCache={...x,lastCompleteAt:x.lastCompleteAt??prev?.lastCompleteAt,lastCompleteSyncInfo:x.lastCompleteSyncInfo??prev?.lastCompleteSyncInfo};
  localStorage.setItem(existingCacheKey(channelId),JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(EVENT,{detail:{channelId,updatedAt:payload.updatedAt}}))
 }catch{}
}
const cloneVideo=(v:YoutubeExistingVideo)=>({...v,tags:[...(Array.isArray(v.tags)?v.tags:[])]});
export function mergeInventoryRowsPreservingCached(previous:YoutubeExistingVideo[],incoming:YoutubeExistingVideo[]){
 const map=new Map(normalizeVideoArray(previous).map(v=>[v.id,cloneVideo(v)]));
 for(const row of normalizeVideoArray(incoming))map.set(row.id,cloneVideo(row));
 return [...map.values()].sort((a,b)=>(a.position??0)-(b.position??0));
}
const uniqueStrings=(values:unknown[])=>[...new Set(values.filter((x):x is string=>typeof x==='string'&&Boolean(x.trim())).map(x=>x.trim()))];
export function targetedExistingRetryIds(syncInfo:any){
 if(!isRecord(syncInfo))return[] as string[];
 return uniqueStrings([
  ...(Array.isArray(syncInfo.missingHydrationIds)?syncInfo.missingHydrationIds:[]),
  ...(Array.isArray(syncInfo.failedHydrationIds)?syncInfo.failedHydrationIds:[]),
  ...(Array.isArray(syncInfo.scheduleIncompleteIds)?syncInfo.scheduleIncompleteIds:[])
 ]);
}
const REASON_LABELS:Record<string,string>={
 PLAYLIST_NOT_EXHAUSTED:'Uploads playlist не дочитан до конца',
 LIMIT_TRUNCATED:'Синхронизация остановлена установленным лимитом',
 PLAYLIST_ITEM_WITHOUT_VIDEO_ID:'В uploads playlist есть элементы без доступного videoId',
 MISSING_VIDEO_HYDRATION:'Не все video ID подтверждены через videos.list',
 HYDRATION_BATCH_FAILED:'Один или несколько batches videos.list завершились ошибкой',
 SCHEDULE_DATA_INCOMPLETE:'Для части видео status / publishAt нельзя подтвердить достоверно'
};
export function existingSyncIncompleteSummary(syncInfo:any){
 if(!isRecord(syncInfo))return['Нет диагностических данных синхронизации'];
 const reasons=Array.isArray(syncInfo.incompleteReasons)?uniqueStrings(syncInfo.incompleteReasons):[];
 if(!reasons.length&&syncInfo.scheduleComplete===false)return['YouTube inventory не подтверждён как полный для расписания'];
 return reasons.map(code=>{
  if(code==='MISSING_VIDEO_HYDRATION')return `${Number(syncInfo.missingHydrationCount||0)} видео не подтверждено через videos.list`;
  if(code==='PLAYLIST_ITEM_WITHOUT_VIDEO_ID')return `${Number(syncInfo.playlistUnresolvedCount||0)} элементов uploads playlist не содержат доступного videoId`;
  if(code==='LIMIT_TRUNCATED')return `Лимит ${Number(syncInfo.requested||0)} остановил inventory до полного обхода playlist`;
  if(code==='HYDRATION_BATCH_FAILED'&&Array.isArray(syncInfo.hydrationErrors)&&syncInfo.hydrationErrors.length)return `videos.list: ${syncInfo.hydrationErrors.join(' • ')}`;
  if(code==='SCHEDULE_DATA_INCOMPLETE')return `${Number(syncInfo.scheduleDataIncompleteCount||0)} видео не имеют достоверного status / publishAt`;
  return REASON_LABELS[code]||code;
 });
}
export function existingSyncDiagnosticWarnings(syncInfo:any){
 if(!isRecord(syncInfo))return[] as string[];
 const warnings=Array.isArray(syncInfo.diagnosticWarnings)?uniqueStrings(syncInfo.diagnosticWarnings):[];
 return warnings.map(code=>code==='PLAYLIST_TOTAL_METADATA_MISMATCH'
  ?`YouTube pageInfo.totalResults (${Number(syncInfo.playlistReportedTotal??syncInfo.playlistFound??0)}) не совпал с фактически дочитанным uploads playlist (${Number(syncInfo.uniqueVideoIds??0)}); используется фактический исчерпанный playlist`
  :code);
}
export function reconcileExistingSyncAfterTargetedRetry(syncInfo:any,currentVideos:YoutubeExistingVideo[],retry:any){
 const merged=mergeInventoryRowsPreservingCached(currentVideos,Array.isArray(retry?.videos)?retry.videos:[]);
 const baseReasons=Array.isArray(syncInfo?.inventoryIncompleteReasons)?uniqueStrings(syncInfo.inventoryIncompleteReasons):Array.isArray(syncInfo?.incompleteReasons)?uniqueStrings(syncInfo.incompleteReasons).filter(x=>x!=='SCHEDULE_DATA_INCOMPLETE'):[];
 const structural=baseReasons.filter(x=>!['MISSING_VIDEO_HYDRATION','HYDRATION_BATCH_FAILED'].includes(x));
 const missing=uniqueStrings(Array.isArray(retry?.missingHydrationIds)?retry.missingHydrationIds:[]);
 const retryErrors=Array.isArray(retry?.hydrationErrors)?retry.hydrationErrors.filter((x:any)=>typeof x==='string'):[] as string[];
 const scheduleIncomplete=uniqueStrings(Array.isArray(retry?.scheduleIncompleteIds)?retry.scheduleIncompleteIds:[]);
 const inventoryReasons=[...structural,...(missing.length?['MISSING_VIDEO_HYDRATION']:[]),...(retryErrors.length?['HYDRATION_BATCH_FAILED']:[])];
 const scheduleReasons=[...inventoryReasons,...(scheduleIncomplete.length?['SCHEDULE_DATA_INCOMPLETE']:[])];
 const uniqueCount=Number(syncInfo?.uniqueVideoIds||merged.length);
 const nextInfo={...syncInfo,
  missingHydrationIds:missing,missingHydrationCount:missing.length,
  failedHydrationIds:missing,hydrationErrors:retryErrors,
  scheduleIncompleteIds:scheduleIncomplete,scheduleDataIncompleteCount:scheduleIncomplete.length,
  videosHydrated:Math.max(0,uniqueCount-missing.length),received:Math.max(0,uniqueCount-missing.length),
  inventoryIncompleteReasons:inventoryReasons,incompleteReasons:scheduleReasons,
  syncComplete:inventoryReasons.length===0,complete:inventoryReasons.length===0,scheduleComplete:scheduleReasons.length===0
 };
 return{videos:merged,syncInfo:nextInfo};
}
export function replaceExistingCacheFromSync(channelId:string,videos:YoutubeExistingVideo[],syncInfo:any){
 const rows=normalizeVideoArray(videos).map(cloneVideo),prev=readExistingCache(channelId),complete=syncInfo?.syncComplete===true||syncInfo?.complete===true,now=new Date().toISOString();
 const displayRows=complete?rows:mergeInventoryRowsPreservingCached(prev?.videos||[],rows);
 const baseline=complete?Object.fromEntries(rows.map(v=>[v.id,cloneVideo(v)])):(prev?.baseline||{});
 writeExistingCache(channelId,{version:1,updatedAt:now,videos:displayRows,baseline,lastUndo:complete?[]:(prev?.lastUndo||[]),syncInfo:normalizeSyncInfo(syncInfo),lastCompleteAt:complete?now:prev?.lastCompleteAt,lastCompleteSyncInfo:complete?normalizeSyncInfo(syncInfo):prev?.lastCompleteSyncInfo})
 return{videos:displayRows,baseline,lastCompleteAt:complete?now:prev?.lastCompleteAt};
}
export function readAuthoritativeExistingSnapshot(channelId:string){
 const cache=readExistingCache(channelId),videos=authoritativeCacheVideos(cache).map(cloneVideo);
 if(!cache||!videos.length)return;
 const currentComplete=scheduleSyncTruthFromInfo(cache.syncInfo)==='complete';
 return{videos,updatedAt:cache.lastCompleteAt||(currentComplete?cache.updatedAt:undefined),syncInfo:cache.lastCompleteSyncInfo||(currentComplete?cache.syncInfo:null)};
}
export function mergeExistingCacheVideos(channelId:string,updates:YoutubeExistingVideo[]){const prev=readExistingCache(channelId);const map=new Map((prev?.videos||[]).map(v=>[v.id,cloneVideo(v)]));const base={...(prev?.baseline||{})};for(const u of normalizeVideoArray(updates)){map.set(u.id,cloneVideo(u));base[u.id]=cloneVideo(u)}writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:[...map.values()],baseline:base,lastUndo:prev?.lastUndo||[],syncInfo:prev?.syncInfo||null,lastCompleteAt:prev?.lastCompleteAt,lastCompleteSyncInfo:prev?.lastCompleteSyncInfo})}
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
function occupiedDates(videos:YoutubeExistingVideo[],excludeIds:string[]=[]){const excluded=new Set(excludeIds);return new Set(normalizeVideoArray(videos).filter(v=>!excluded.has(v.id)).map(v=>krasDateKey(v.publishAt)).filter(Boolean) as string[])}
export function deriveChannelScheduleState(channel:Channel,videos:YoutubeExistingVideo[],updatedAt?:string,excludeIds:string[]=[]):ChannelScheduleState{
  const mode=scheduleModeFor(channel),interval=intervalDaysFor(channel),publishDays=Math.max(1,Math.floor(channel.publishDays||3)),pauseDays=Math.max(1,Math.floor(channel.pauseDays||1));const defaultTime=`${pad(channel.publishHour||0)}:${pad(channel.publishMinute||0)}`;
  const excluded=new Set(excludeIds),visible=normalizeVideoArray(videos).filter(v=>!excluded.has(v.id));const scheduled=visible.map(v=>v.publishAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));const published=visible.map(v=>v.publishedAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const lastScheduledAt=scheduled.length?scheduled[scheduled.length-1]:undefined,lastPublishedAt=published.length?published[published.length-1]:undefined,scheduledUntil=krasDateKey(lastScheduledAt),occupied=occupiedDates(visible);
  let nextKey:string|undefined;
  if(mode==='pattern'){
    const anchor=channel.patternAnchorDate;
    if(anchor){let k=scheduledUntil?addCalendarDays(scheduledUntil,1):anchor;let guard=0;const pattern={publishDays,pauseDays,anchorDate:anchor};while(guard++<20000&&(!isPatternPublishDate(k,pattern)||occupied.has(k)))k=addCalendarDays(k,1);nextKey=k}
  }else if(scheduledUntil){let k=addCalendarDays(scheduledUntil,interval),guard=0;while(guard++<10000&&occupied.has(k))k=addCalendarDays(k,interval);nextKey=k}
  return{channelId:channel.id,lastPublishedAt,lastScheduledAt,nextAvailableAt:nextKey?toKratIso(nextKey,defaultTime):undefined,scheduledUntil,scheduleMode:mode,publishIntervalDays:interval,publishDays,pauseDays,patternAnchorDate:channel.patternAnchorDate,defaultPublishTime:defaultTime,scheduledCount:scheduled.length,updatedAt,syncTruth:'unknown'};
}
export function getChannelScheduleState(channelId:string,channel:Channel,excludeIds:string[]=[],nowMs=Date.now()){
  const cache=readExistingCache(channelId),source=authoritativeCacheVideos(cache),futureIds=new Set(futureScheduledVideos(source,nowMs).map(v=>v.id));
  const factual=source.map(v=>futureIds.has(v.id)?v:{...v,publishAt:undefined});
  return{...deriveChannelScheduleState(channel,factual,cache?.updatedAt,excludeIds),syncTruth:scheduleSyncTruthFromInfo(cache?.syncInfo)};
}
export function generatePatternSchedule(channel:Channel,videos:YoutubeExistingVideo[],count:number,excludeIds:string[]=[]){
  const pattern=patternFor(channel);if(!pattern)return{dates:[] as string[],calendar:[] as PatternCalendarDay[]};const cacheVideos=readExistingCache(channel.id)?.videos||normalizeVideoArray(videos),occupied=occupiedDates(cacheVideos,excludeIds),state=deriveChannelScheduleState(channel,cacheVideos,undefined,excludeIds),time=state.defaultPublishTime;let k=state.nextAvailableAt?krasDateKey(state.nextAvailableAt):pattern.anchorDate;if(!k)return{dates:[],calendar:[]};
  const dates:string[]=[],calendar:PatternCalendarDay[]=[];let guard=0;
  while(dates.length<count&&guard++<50000){const publishSlot=isPatternPublishDate(k,pattern),busy=occupied.has(k);calendar.push({date:k,kind:publishSlot?(busy?'occupied':'video'):'pause',publishSlot,occupied:busy});if(publishSlot&&!busy){dates.push(toKratIso(k,time));occupied.add(k)}k=addCalendarDays(k,1)}
  return{dates,calendar};
}
export function generateIntervalSchedule(channel:Channel,videos:YoutubeExistingVideo[],count:number,excludeIds:string[]=[]){const safeVideos=normalizeVideoArray(videos);const state=deriveChannelScheduleState(channel,safeVideos,undefined,excludeIds);let k=state.nextAvailableAt?krasDateKey(state.nextAvailableAt):undefined;if(!k)return[];const occupied=occupiedDates(safeVideos,excludeIds),days=intervalDaysFor(channel),time=state.defaultPublishTime,out:string[]=[];let guard=0;while(out.length<count&&guard++<20000){if(!occupied.has(k)){out.push(toKratIso(k,time));occupied.add(k)}k=addCalendarDays(k,days)}return out}
export function subscribeChannelSchedule(cb:(channelId:string)=>void){const fn=(e:Event)=>cb(String((e as CustomEvent<any>).detail?.channelId||''));window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)}
