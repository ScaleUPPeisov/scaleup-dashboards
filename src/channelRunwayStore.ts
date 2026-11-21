import type {Channel,YoutubeExistingVideo} from './types';
import {readAuthoritativeExistingSnapshot,scheduleSyncTruthFromInfo} from './channelSchedule';
import {
  CHANNEL_RUNWAY_STORAGE_KEY,
  deriveRunwayRecord,
  krasnoyarskClock,
  recalculateRunwayRecord,
  type ChannelRunwayRecord,
  type RunwayDataState
} from './channelRunwayCore';

export type ChannelRunwayStore={
  version:1;
  lastLocalCalculation?:string;
  lastKrasnoyarskDate?:string;
  channels:Record<string,ChannelRunwayRecord>;
};

type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export type ChannelRunwayPersistResult={ok:boolean;value:ChannelRunwayStore;errorCode?:'STORAGE_UNAVAILABLE'|'STORAGE_QUOTA_EXCEEDED'|'STORAGE_WRITE_FAILED'|'STORAGE_READBACK_FAILED';error?:string};
const EVENT='vyron-channel-runway';
const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
const VALID_STATUS=new Set(['large','plan','prepare','urgent','ended','no-data']);
const VALID_PRIORITY=new Set(['low','normal','high','critical','unknown']);
const VALID_DATA_STATE=new Set(['CONFIRMED_SCHEDULE','CONFIRMED_EMPTY','PARTIAL_DATA','STALE_CACHE','AUTH_REQUIRED','API_FAILED','UNKNOWN']);

function defaultStore():ChannelRunwayStore{return{version:1,channels:{}}}
function browserStorage(){return typeof localStorage==='undefined'?undefined:localStorage}
function emit(){try{window.dispatchEvent(new Event(EVENT))}catch{}}

function normalizeStoredRecord(id:string,value:unknown):ChannelRunwayRecord|undefined{
  if(!value||typeof value!=='object')return;
  const raw=value as Partial<ChannelRunwayRecord>;
  const channelId=String(raw.channelId||id||'').trim();
  if(!channelId)return;
  const channelName=String(raw.channelName||channelId||'Канал без названия').trim()||'Канал без названия';
  const scheduledVideoCount=Number.isFinite(raw.scheduledVideoCount)?Math.max(0,Math.floor(Number(raw.scheduledVideoCount))):0;
  const runwayDays=Number.isFinite(raw.runwayDays)?Math.max(0,Number(raw.runwayDays)):undefined;
  const averagePublishIntervalDays=Number.isFinite(raw.averagePublishIntervalDays)?Number(raw.averagePublishIntervalDays):undefined;
  const status=VALID_STATUS.has(String(raw.status))?raw.status as ChannelRunwayRecord['status']:'no-data';
  const priority=VALID_PRIORITY.has(String(raw.priority))?raw.priority as ChannelRunwayRecord['priority']:'unknown';
  // Previously persisted v2 CONFIRMED_SCHEDULE records were allowed solely
  // because videos.list found a publishAt, not because Scheduled discovery
  // was exhaustive. Fail closed until independent owner proof is reloaded.
  const unprovenPositive=raw.dataState==='CONFIRMED_SCHEDULE'&&raw.independentScheduleEvidenceVersion!==3;
  const unprovenEmpty=raw.dataState==='CONFIRMED_EMPTY'&&raw.independentScheduleEvidenceVersion!==3;
  return{
    ...raw,
    channelId,
    channelName,
    scheduledVideoCount,
    dataState:unprovenPositive?'PARTIAL_DATA':unprovenEmpty?'UNKNOWN':
      VALID_DATA_STATE.has(String(raw.dataState))?raw.dataState:(raw.scheduledUntil?'STALE_CACHE':'UNKNOWN'),
    averagePublishIntervalDays,
    runwayDays:unprovenPositive||unprovenEmpty?undefined:runwayDays,
    lastLocalCalculation:typeof raw.lastLocalCalculation==='string'&&raw.lastLocalCalculation?raw.lastLocalCalculation:'1970-01-01T00:00:00.000Z',
    status:unprovenPositive||unprovenEmpty?'no-data':status,
    priority:unprovenPositive||unprovenEmpty?'unknown':priority
  } as ChannelRunwayRecord;
}

export function loadChannelRunwayStore(storage:StorageLike|undefined=browserStorage()):ChannelRunwayStore{
  if(!storage)return defaultStore();
  try{
    const raw=storage.getItem(CHANNEL_RUNWAY_STORAGE_KEY);
    if(!raw)return defaultStore();
    const parsed=JSON.parse(raw) as ChannelRunwayStore;
    if(parsed?.version!==1||!parsed.channels||typeof parsed.channels!=='object')return defaultStore();
    const channels:Record<string,ChannelRunwayRecord>={};
    for(const [id,value] of Object.entries(parsed.channels)){
      const normalized=normalizeStoredRecord(id,value);
      if(normalized)channels[id]=normalized;
    }
    return{
      version:1,
      lastLocalCalculation:typeof parsed.lastLocalCalculation==='string'?parsed.lastLocalCalculation:undefined,
      lastKrasnoyarskDate:typeof parsed.lastKrasnoyarskDate==='string'?parsed.lastKrasnoyarskDate:undefined,
      channels
    };
  }catch{return defaultStore()}
}

export function saveChannelRunwayStore(value:ChannelRunwayStore,storage:StorageLike|undefined=browserStorage()):ChannelRunwayPersistResult{
  if(!storage)return{ok:false,value,errorCode:'STORAGE_UNAVAILABLE',error:'Channel Runway storage unavailable'};
  try{
    const raw=JSON.stringify(value);
    storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,raw);
    const readback=storage.getItem(CHANNEL_RUNWAY_STORAGE_KEY);
    if(!readback)return{ok:false,value,errorCode:'STORAGE_READBACK_FAILED',error:'Channel Runway readback is empty'};
    const parsed=JSON.parse(readback) as ChannelRunwayStore;
    if(parsed?.version!==1||!parsed.channels||typeof parsed.channels!=='object')return{ok:false,value,errorCode:'STORAGE_READBACK_FAILED',error:'Channel Runway readback mismatch'};
    emit();
    return{ok:true,value};
  }catch(error){
    const name=String((error as any)?.name||''),message=String((error as any)?.message||error||'Channel Runway storage write failed');
    return{ok:false,value,errorCode:name==='QuotaExceededError'||/quota/i.test(message)?'STORAGE_QUOTA_EXCEEDED':'STORAGE_WRITE_FAILED',error:message};
  }
}

type ExistingCache={
  version?:number;
  updatedAt?:string;
  videos?:YoutubeExistingVideo[];
  baseline?:Record<string,YoutubeExistingVideo>;
  syncInfo?:unknown;
};

export function readExistingRunwayCache(channelId:string,storage:StorageLike|undefined=browserStorage()):ExistingCache|undefined{
  if(!storage||!channelId)return;
  try{
    const parsed=JSON.parse(storage.getItem(existingCacheKey(channelId))||'null') as ExistingCache|null;
    if(!parsed||typeof parsed!=='object')return;
    return parsed;
  }catch{return}
}

function channelUnknown(channel:Channel,now:Date){
  return deriveRunwayRecord(channel,[],now,undefined,false);
}

function confirmedBaseline(cache:ExistingCache|undefined){
  if(!cache)return[] as YoutubeExistingVideo[];
  const values=cache.baseline&&typeof cache.baseline==='object'?Object.values(cache.baseline):[];
  return values.filter(Boolean);
}
const validTime=(raw?:string)=>{const n=Date.parse(raw||'');return Number.isFinite(n)?n:0};
// A complete uploads playlist is not sufficient to prove a *zero* Scheduled inventory.
// Positive videos.list + publishAt evidence may be used; negative evidence must be
// explicitly independently validated (never claimed by the 6.1.18 backend).
function trustedScheduledSnapshot(_videos:YoutubeExistingVideo[],info:unknown,_now:Date){
  // A positive videos.list row proves only its own existence, not that
  // all Scheduled videos were discovered. Require independent owner coverage.
  return scheduleSyncTruthFromInfo(info)==='complete';
}

export function recalculateChannelRunway(
  channels:Channel[],
  now=new Date(),
  markDaily=false,
  storage:StorageLike|undefined=browserStorage()
){
  const previous=loadChannelRunwayStore(storage);
  const next:ChannelRunwayStore={...previous,version:1,channels:{...previous.channels},lastLocalCalculation:now.toISOString()};
  for(const channel of channels){
    const prior=previous.channels[channel.id];

    // Prefer the newest *verified* inventory rather than pinning a stale previous
    // value just because it has lastScheduleSync. Never trust legacy zero evidence.
    const native=readAuthoritativeExistingSnapshot(channel.id);
    const cached=readExistingRunwayCache(channel.id,storage);
    const baseline=confirmedBaseline(cached);
    const candidates:Array<{videos:YoutubeExistingVideo[];updatedAt?:string}>=[];
    if(native&&trustedScheduledSnapshot(native.videos,native.syncInfo,now))candidates.push({videos:native.videos,updatedAt:native.updatedAt});
    if(trustedScheduledSnapshot(baseline,cached?.syncInfo,now))candidates.push({videos:baseline,updatedAt:cached?.updatedAt});
    const latest=candidates.sort((a,b)=>validTime(b.updatedAt)-validTime(a.updatedAt))[0];
    // A later failed or partial read invalidates older snapshots without
    // deleting them. Legacy zero cannot pin a misleading complete answer.
    const invalidating=new Set(['PARTIAL_DATA','AUTH_REQUIRED','API_FAILED','UNKNOWN','STALE_CACHE']);
    const priorTime=prior&&invalidating.has(String(prior.dataState))?
      validTime(prior.lastRefreshAttemptAt):
      prior?.dataState==='CONFIRMED_EMPTY'&&prior.inventoryEvidenceVersion!==2?0:
      validTime(prior?.lastScheduleSync);
    if(latest&&validTime(latest.updatedAt)>priorTime){
      const verified=deriveRunwayRecord(channel,latest.videos,now,latest.updatedAt,true);
      next.channels[channel.id]=recalculateRunwayRecord({...verified,inventoryEvidenceVersion:2,independentScheduleEvidenceVersion:3},now);
      continue;
    }
    if(prior){
      const downgraded=prior.dataState==='CONFIRMED_EMPTY'&&prior.inventoryEvidenceVersion!==2
        ?{...prior,dataState:'UNKNOWN' as const,runwayDays:undefined,status:'no-data' as const,priority:'unknown' as const}
        :prior;
      const retained=recalculateRunwayRecord({...downgraded,channelName:channel.name},now);
      // A later incomplete owner refresh invalidates the *current* schedule
      // claim, not previously owner-verified positive videos. If the Runway
      // record lost its count, recover positive observations from the last
      // trustworthy native snapshot as historical evidence only. Never
      // restore CONFIRMED_SCHEDULE, a confirmed zero or live runwayDays here.
      if(retained.dataState==='PARTIAL_DATA'&&latest){
        const observed=deriveRunwayRecord(channel,latest.videos,now,latest.updatedAt,false);
        if(observed.scheduledVideoCount>0){
          const until=[retained.scheduledUntil,observed.scheduledUntil]
            .filter((x):x is string=>Boolean(x)).sort().at(-1);
          next.channels[channel.id]=recalculateRunwayRecord({
            ...retained,
            scheduledVideoCount:Math.max(retained.scheduledVideoCount,observed.scheduledVideoCount),
            scheduledUntil:until,
            lastScheduleSync:retained.lastScheduleSync||latest.updatedAt,
            inventoryEvidenceVersion:2,
            dataState:'PARTIAL_DATA',
            runwayDays:undefined,
            status:'no-data',
            priority:'unknown'
          },now);
          continue;
        }
      }
      next.channels[channel.id]=retained;
      continue;
    }
    if(latest){
      const verified=deriveRunwayRecord(channel,latest.videos,now,latest.updatedAt,true);
      next.channels[channel.id]=recalculateRunwayRecord({...verified,inventoryEvidenceVersion:2,independentScheduleEvidenceVersion:3},now);
      continue;
    }
    next.channels[channel.id]=channelUnknown(channel,now);
  }
  // Recalculation may be scoped to one channel. Pruning all other records here
  // erased the historical Scheduled evidence of the other 32 channels.
  // Explicit channel deletion must be a separate intentional operation.
  if(markDaily)next.lastKrasnoyarskDate=krasnoyarskClock(now).dateKey;
  saveChannelRunwayStore(next,storage);
  return next;
}

export function upsertChannelRunwayFromYoutube(
  channel:Channel,
  videos:YoutubeExistingVideo[],
  now=new Date(),
  storage:StorageLike|undefined=browserStorage()
){
  const current=loadChannelRunwayStore(storage);
  const record={...deriveRunwayRecord(channel,videos,now,now.toISOString(),true),inventoryEvidenceVersion:2 as const,independentScheduleEvidenceVersion:3 as const,lastRefreshAttemptAt:now.toISOString(),lastRefreshError:undefined};
  const next:ChannelRunwayStore={
    ...current,
    version:1,
    lastLocalCalculation:now.toISOString(),
    channels:{...current.channels,[channel.id]:record}
  };
  return saveChannelRunwayStore(next,storage);
}

// Failed/partial refresh never replaces the last verified date or count with zero.
export function markRunwayRefreshIssue(
  channel:Pick<Channel,'id'|'name'>,
  dataState:Extract<RunwayDataState,'PARTIAL_DATA'|'AUTH_REQUIRED'|'API_FAILED'|'UNKNOWN'>,
  error:string,
  now=new Date(),
  storage:StorageLike|undefined=browserStorage(),
  observedVideos?:YoutubeExistingVideo[]
){
  const current=loadChannelRunwayStore(storage);
  const previous=current.channels[channel.id]||deriveRunwayRecord(channel,[],now,undefined,false);
  const partial=deriveRunwayRecord(channel,observedVideos||[],now,undefined,false);
  // Verified observations can only increase a lower-bound date/count here;
  // they cannot establish the exhaustive scheduled inventory.
  const mostRecent=[previous.scheduledUntil,partial.scheduledUntil].filter((x):x is string=>Boolean(x)).sort().at(-1);
  const record=recalculateRunwayRecord({
    ...previous,
    channelName:channel.name,
    scheduledUntil:mostRecent,
    scheduledVideoCount:Math.max(previous.scheduledVideoCount,partial.scheduledVideoCount),
    dataState,
    lastRefreshAttemptAt:now.toISOString(),
    lastRefreshError:error,
    // Preserve the actual latest owner-visible evidence without overwriting
    // the historic baseline with a falsely complete schedule or a false zero.
    lastObservedAt:observedVideos===undefined?previous.lastObservedAt:now.toISOString(),
    lastObservedScheduledCount:observedVideos===undefined?previous.lastObservedScheduledCount:partial.scheduledVideoCount,
    lastObservedScheduledUntil:observedVideos===undefined?previous.lastObservedScheduledUntil:partial.scheduledUntil,
    runwayDays:undefined,
    status:'no-data',
    priority:'unknown'
  },now);
  return saveChannelRunwayStore({
    ...current,
    lastLocalCalculation:now.toISOString(),
    channels:{...current.channels,[channel.id]:record}
  },storage);
}

export function shouldRunDailyChannelRunway(store:ChannelRunwayStore,now=new Date()){
  const clock=krasnoyarskClock(now);
  if(store.lastKrasnoyarskDate===clock.dateKey)return false;
  return clock.hour>6||(clock.hour===6&&clock.minute>=0);
}

export function maybeRunDailyChannelRunway(
  channels:Channel[],
  now=new Date(),
  storage:StorageLike|undefined=browserStorage()
){
  const current=loadChannelRunwayStore(storage);
  if(!shouldRunDailyChannelRunway(current,now))return false;
  recalculateChannelRunway(channels,now,true,storage);
  return true;
}

export function subscribeChannelRunway(cb:()=>void){
  if(typeof window==='undefined')return()=>{};
  window.addEventListener(EVENT,cb);
  return()=>window.removeEventListener(EVENT,cb);
}
