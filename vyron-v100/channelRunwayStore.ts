import type {Channel,YoutubeExistingVideo} from './types';
import {
  CHANNEL_RUNWAY_STORAGE_KEY,
  deriveRunwayRecord,
  krasnoyarskClock,
  recalculateRunwayRecord,
  type ChannelRunwayRecord
} from './channelRunwayCore';

export type ChannelRunwayStore={
  version:1;
  lastLocalCalculation?:string;
  lastKrasnoyarskDate?:string;
  channels:Record<string,ChannelRunwayRecord>;
};

type StorageLike=Pick<Storage,'getItem'|'setItem'>;
const EVENT='vyron-channel-runway';
const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;

function defaultStore():ChannelRunwayStore{return{version:1,channels:{}}}
function browserStorage(){return typeof localStorage==='undefined'?undefined:localStorage}
function emit(){try{window.dispatchEvent(new Event(EVENT))}catch{}}

export function loadChannelRunwayStore(storage:StorageLike|undefined=browserStorage()):ChannelRunwayStore{
  if(!storage)return defaultStore();
  try{
    const raw=storage.getItem(CHANNEL_RUNWAY_STORAGE_KEY);
    if(!raw)return defaultStore();
    const parsed=JSON.parse(raw) as ChannelRunwayStore;
    if(parsed?.version!==1||!parsed.channels||typeof parsed.channels!=='object')return defaultStore();
    return parsed;
  }catch{return defaultStore()}
}

export function saveChannelRunwayStore(value:ChannelRunwayStore,storage:StorageLike|undefined=browserStorage()){
  if(storage)storage.setItem(CHANNEL_RUNWAY_STORAGE_KEY,JSON.stringify(value));
  emit();
  return value;
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
      next.channels[channel.id]=recalculateRunwayRecord({...prior,channelName:channel.name},now);
      continue;
    }

    // Existing Videos stores drafts/selections in `videos`, so they are never used as YouTube truth here.
    // Bootstrap only from its baseline. An empty cache without syncInfo means "Нет данных", not 0 days.
    const cached=readExistingRunwayCache(channel.id,storage);
    const baseline=confirmedBaseline(cached);
    const cacheKnown=Boolean(cached?.syncInfo||baseline.length);
    if(cacheKnown){
      next.channels[channel.id]=deriveRunwayRecord(channel,baseline,now,undefined,true);
      continue;
    }

    next.channels[channel.id]=prior?recalculateRunwayRecord({...prior,channelName:channel.name},now):channelUnknown(channel,now);
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
  const record=deriveRunwayRecord(channel,videos,now,now.toISOString(),true);
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
