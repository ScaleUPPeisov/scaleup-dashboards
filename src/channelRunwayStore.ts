import type {Channel,YoutubeExistingVideo} from './types';
import {
  CHANNEL_RUNWAY_STORAGE_KEY,
  deriveRunwayRecord,
  krasnoyarskClock,
  recalculateRunwayRecord,
  type ChannelRunwayRecord
} from './channelRunwayCore';
import {normalizeExistingVideoList,normalizeExistingVideoRecord} from './channelSchedule';

export type ChannelRunwayStore={
  version:1;
  lastLocalCalculation?:string;
  lastKrasnoyarskDate?:string;
  channels:Record<string,ChannelRunwayRecord>;
};

type StorageLike=Pick<Storage,'getItem'|'setItem'>;
const EVENT='vyron-channel-runway';
const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
const VALID_STATUS=new Set(['large','plan','prepare','urgent','ended','no-data']);
const VALID_PRIORITY=new Set(['low','normal','high','critical','unknown']);

function defaultStore():ChannelRunwayStore{return{version:1,channels:{}}}
function browserStorage(){return typeof localStorage==='undefined'?undefined:localStorage}
function emit(){try{window.dispatchEvent(new Event(EVENT))}catch{}}
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const safeString=(value:unknown)=>typeof value==='string'&&value.trim()?value:undefined;

function normalizeStoredRecord(id:string,value:unknown):ChannelRunwayRecord|undefined{
  if(!isRecord(value))return;
  const raw=value as Partial<ChannelRunwayRecord>;
  const channelId=String(raw.channelId||id||'').trim();
  if(!channelId)return;
  const channelName=String(raw.channelName||channelId||'Канал без названия').trim()||'Канал без названия';
  const scheduledVideoCount=Number.isFinite(raw.scheduledVideoCount)?Math.max(0,Math.floor(Number(raw.scheduledVideoCount))):0;
  const runwayDays=Number.isFinite(raw.runwayDays)?Math.max(0,Number(raw.runwayDays)):undefined;
  const averagePublishIntervalDays=Number.isFinite(raw.averagePublishIntervalDays)?Number(raw.averagePublishIntervalDays):undefined;
  const status=VALID_STATUS.has(String(raw.status))?raw.status as ChannelRunwayRecord['status']:'no-data';
  const priority=VALID_PRIORITY.has(String(raw.priority))?raw.priority as ChannelRunwayRecord['priority']:'unknown';
  return{
    channelId,
    channelName,
    scheduledUntil:safeString(raw.scheduledUntil),
    scheduledVideoCount,
    averagePublishIntervalDays,
    lastScheduleSync:safeString(raw.lastScheduleSync),
    lastLocalCalculation:typeof raw.lastLocalCalculation==='string'&&raw.lastLocalCalculation?raw.lastLocalCalculation:'1970-01-01T00:00:00.000Z',
    runwayDays,
    nextProductionDate:safeString(raw.nextProductionDate),
    status,
    priority
  };
}

export function loadChannelRunwayStore(storage:StorageLike|undefined=browserStorage()):ChannelRunwayStore{
  if(!storage)return defaultStore();
  try{
    const raw=storage.getItem(CHANNEL_RUNWAY_STORAGE_KEY);
    if(!raw)return defaultStore();
    const parsed=JSON.parse(raw) as unknown;
    if(!isRecord(parsed)||parsed.version!==1||!isRecord(parsed.channels))return defaultStore();
    const channels:Record<string,ChannelRunwayRecord>={};
    for(const [id,value] of Object.entries(parsed.channels)){
      const normalized=normalizeStoredRecord(id,value);
      if(normalized)channels[id]=normalized;
    }
    return{
      version:1,
      lastLocalCalculation:safeString(parsed.lastLocalCalculation),
      lastKrasnoyarskDate:safeString(parsed.lastKrasnoyarskDate),
      channels
    };
  }catch{return defaultStore()}
}

export function saveChannelRunwayStore(value:ChannelRunwayStore,storage:StorageLike|undefined=browserStorage()){
  const channels:Record<string,ChannelRunwayRecord>={};
  for(const [id,raw] of Object.entries(isRecord(value?.channels)?value.channels:{})){
    const normalized=normalizeStoredRecord(id,raw);
    if(normalized)channels[id]=normalized;
  }
  const safe:ChannelRunwayStore={
    version:1,
    lastLocalCalculation:safeString(value?.lastLocalCalculation),
    lastKrasnoyarskDate:safeString(value?.lastKrasnoyarskDate),
    channels
  };
  if(storage)storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify(safe));
  emit();
  return safe;
}

type ExistingCache={
  version?:number;
  updatedAt?:string;
  videos:YoutubeExistingVideo[];
  baseline:Record<string,YoutubeExistingVideo>;
  syncInfo:Record<string,unknown>|null;
};

export function readExistingRunwayCache(channelId:string,storage:StorageLike|undefined=browserStorage()):ExistingCache|undefined{
  if(!storage||!channelId)return;
  try{
    const parsed=JSON.parse(storage.getItem(existingCacheKey(channelId))||'null') as unknown;
    if(!isRecord(parsed))return;
    return{
      version:typeof parsed.version==='number'?parsed.version:undefined,
      updatedAt:safeString(parsed.updatedAt),
      videos:normalizeExistingVideoList(parsed.videos),
      baseline:normalizeExistingVideoRecord(parsed.baseline),
      syncInfo:isRecord(parsed.syncInfo)?{...parsed.syncInfo}:null
    };
  }catch{return}
}

function channelUnknown(channel:Channel,now:Date){
  return deriveRunwayRecord(channel,[],now,undefined,false);
}

function confirmedBaseline(cache:ExistingCache|undefined){
  if(!cache)return[] as YoutubeExistingVideo[];
  return Object.values(cache.baseline);
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

    // Explicit Channel Runway sync is authoritative. Daily recalculation only advances the calendar.
    if(prior?.lastScheduleSync){
      next.channels[channel.id]=recalculateRunwayRecord({...prior,channelName:String(channel.name||channel.id||'Канал без названия')},now);
      continue;
    }

    // Existing Videos stores drafts/selections in `videos`, so they are never used as YouTube truth here.
    // Bootstrap only from its normalized baseline. An empty cache without syncInfo means "Нет данных", not 0 days.
    const cached=readExistingRunwayCache(channel.id,storage);
    const baseline=confirmedBaseline(cached);
    const cacheKnown=Boolean(cached?.syncInfo||baseline.length);
    if(cacheKnown){
      next.channels[channel.id]=deriveRunwayRecord(channel,baseline,now,undefined,true);
      continue;
    }

    next.channels[channel.id]=prior?recalculateRunwayRecord({...prior,channelName:String(channel.name||channel.id||'Канал без названия')},now):channelUnknown(channel,now);
  }
  const validIds=new Set(channels.map(c=>c.id));
  for(const id of Object.keys(next.channels))if(!validIds.has(id))delete next.channels[id];
  if(markDaily)next.lastKrasnoyarskDate=krasnoyarskClock(now).dateKey;
  return saveChannelRunwayStore(next,storage);
}

export function upsertChannelRunwayFromYoutube(
  channel:Channel,
  videos:YoutubeExistingVideo[],
  now=new Date(),
  storage:StorageLike|undefined=browserStorage()
){
  const current=loadChannelRunwayStore(storage);
  const record=deriveRunwayRecord(channel,normalizeExistingVideoList(videos),now,now.toISOString(),true);
  const next:ChannelRunwayStore={
    ...current,
    version:1,
    lastLocalCalculation:now.toISOString(),
    channels:{...current.channels,[channel.id]:record}
  };
  return saveChannelRunwayStore(next,storage);
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
