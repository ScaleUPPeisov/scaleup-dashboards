import {create} from 'zustand';
import {api,type ExistingVideoSyncResult} from './api';
import {readAuthoritativeExistingSnapshot,readExistingCache,replaceExistingCacheFromSync} from './channelSchedule';
import {useApp} from './store';
import type {Channel,YoutubeExistingVideo,YoutubeProfile} from './types';

export const OWNER_INVENTORY_TTL_MS=15*60_000;
export type OwnerInventoryStatus='NO_DATA'|'CACHED'|'FRESH'|'SYNCING'|'ERROR'|'UNLINKED';

export type YoutubeOwnerInventorySnapshot={
  channelId:string;
  channelName:string;
  profileId?:string;
  youtubeChannelId?:string;
  status:OwnerInventoryStatus;
  complete:boolean;
  updatedAt?:string;
  totalOwnerVisible?:number;
  publicCount?:number;
  privateCount?:number;
  scheduledCount?:number;
  unlistedCount?:number;
  publishedCount?:number;
  nextScheduledAt?:string;
  scheduledUntil?:string;
  lastPublishedAt?:string;
  error?:string;
};

type OwnerInventoryState={
  snapshots:Record<string,YoutubeOwnerInventorySnapshot>;
  refreshing:boolean;
  done:number;
  total:number;
  lastBatchAt?:string;
  setSnapshot:(row:YoutubeOwnerInventorySnapshot)=>void;
  setProgress:(refreshing:boolean,done?:number,total?:number)=>void;
};

export const useYoutubeOwnerInventory=create<OwnerInventoryState>((set)=>({
  snapshots:{},refreshing:false,done:0,total:0,
  setSnapshot:row=>set(s=>({snapshots:{...s.snapshots,[row.channelId]:row}})),
  setProgress:(refreshing,done=0,total=0)=>set({refreshing,done,total,...(!refreshing?{lastBatchAt:new Date().toISOString()}:{})})
}));

function validDate(value?:string){
  const ms=value?Date.parse(value):NaN;
  return Number.isFinite(ms)?ms:undefined
}
function chronological(values:(string|undefined)[]){
  return values.filter((x):x is string=>Boolean(x&&validDate(x)!=null)).sort((a,b)=>Date.parse(a)-Date.parse(b))
}

export function ownerInventoryFromVideos(channel:Pick<Channel,'id'|'name'|'youtubeProfileId'|'youtubeChannelId'>,videos:YoutubeExistingVideo[],updatedAt?:string,complete=true,nowMs=Date.now()):YoutubeOwnerInventorySnapshot{
  let publicCount=0,privateCount=0,scheduledCount=0,unlistedCount=0,publishedCount=0;
  const scheduled:string[]=[],published:string[]=[];
  for(const video of videos){
    const privacy=String(video.privacyStatus||'unknown').toLowerCase();
    const publishAt=validDate(video.publishAt),publishedAt=validDate(video.publishedAt);
    const futureSchedule=privacy==='private'&&publishAt!=null&&publishAt>nowMs;
    if(futureSchedule){scheduledCount++;scheduled.push(video.publishAt!);continue}
    if(privacy==='private')privateCount++;
    else if(privacy==='public'){publicCount++;publishedCount++}
    else if(privacy==='unlisted'){unlistedCount++;publishedCount++}
    if((privacy==='public'||privacy==='unlisted')&&publishedAt!=null)published.push(video.publishedAt!)
  }
  const scheduledSorted=chronological(scheduled),publishedSorted=chronological(published);
  return{
    channelId:channel.id,channelName:channel.name,profileId:channel.youtubeProfileId,youtubeChannelId:channel.youtubeChannelId,
    status:updatedAt?(nowMs-Date.parse(updatedAt)<=OWNER_INVENTORY_TTL_MS?'FRESH':'CACHED'):'NO_DATA',
    complete,updatedAt,totalOwnerVisible:videos.length,publicCount,privateCount,scheduledCount,unlistedCount,publishedCount,
    nextScheduledAt:scheduledSorted[0],scheduledUntil:scheduledSorted.at(-1),lastPublishedAt:publishedSorted.at(-1)
  }
}

function linkedProfile(channel:Channel,profiles:YoutubeProfile[]){
  if(!channel.youtubeProfileId||!channel.youtubeChannelId)return;
  return profiles.find(p=>p.id===channel.youtubeProfileId&&p.channelId===channel.youtubeChannelId)
}
const BLOCKED=new Set(['KEYCHAIN_BLOCKED','RECONNECT_REQUIRED','MISSING','WRONG_CHANNEL','FAILED','KEYCHAIN_ERROR','NEEDS_ONE_TIME_LOCAL_MIGRATION','CANONICAL_PRESENT_UNVERIFIED']);

function cacheSnapshot(channel:Channel){
  const cache=readExistingCache(channel.id);
  if(!cache)return;
  const auth=readAuthoritativeExistingSnapshot(channel.id);
  const videos=auth?.videos||[];
  const updatedAt=auth?.updatedAt||cache.updatedAt;
  const complete=Boolean(auth)||cache.syncInfo?.syncComplete===true||cache.syncInfo?.complete===true;
  return ownerInventoryFromVideos(channel,videos,updatedAt,complete)
}

export function hydrateYoutubeOwnerInventoryFromCache(){
  const store=useYoutubeOwnerInventory.getState();
  for(const channel of useApp.getState().channels){
    const cached=cacheSnapshot(channel);
    if(cached)store.setSnapshot(cached);
    else if(!channel.youtubeProfileId||!channel.youtubeChannelId)store.setSnapshot({channelId:channel.id,channelName:channel.name,status:'UNLINKED',complete:false});
  }
}

function isFresh(snapshot:YoutubeOwnerInventorySnapshot|undefined,now=Date.now()){
  const at=snapshot?.updatedAt?Date.parse(snapshot.updatedAt):NaN;
  return Number.isFinite(at)&&now-at<OWNER_INVENTORY_TTL_MS&&snapshot?.complete===true
}

const singleRuns=new Map<string,Promise<YoutubeOwnerInventorySnapshot|undefined>>();
export function refreshYoutubeOwnerInventoryChannel(channelId:string,force=false,profilesInput?:YoutubeProfile[]){
  const existing=singleRuns.get(channelId);if(existing)return existing;
  const task=(async()=>{
    const channel=useApp.getState().channels.find(c=>c.id===channelId);if(!channel)return;
    const profiles=profilesInput||await api.youtubeProfiles();
    const profile=linkedProfile(channel,profiles);
    if(!profile){
      const row:YoutubeOwnerInventorySnapshot={channelId:channel.id,channelName:channel.name,status:'UNLINKED',complete:false};
      useYoutubeOwnerInventory.getState().setSnapshot(row);return row
    }
    const cached=cacheSnapshot(channel);
    if(cached)useYoutubeOwnerInventory.getState().setSnapshot(cached);
    if(!force&&isFresh(cached))return cached;
    if(BLOCKED.has(String(profile.credentialStatus||''))){
      const row={...(cached||{channelId:channel.id,channelName:channel.name,complete:false}),profileId:profile.id,youtubeChannelId:channel.youtubeChannelId,status:'ERROR' as const,error:`OAUTH_CREDENTIAL_BLOCKED: ${profile.credentialStatus}`};
      useYoutubeOwnerInventory.getState().setSnapshot(row);return row
    }
    useYoutubeOwnerInventory.getState().setSnapshot({...(cached||{channelId:channel.id,channelName:channel.name,complete:false}),profileId:profile.id,youtubeChannelId:channel.youtubeChannelId,status:'SYNCING'});
    try{
      const result:ExistingVideoSyncResult=await api.youtubeListExisting(profile.id,1000);
      if(result.channelId&&result.channelId!==channel.youtubeChannelId)throw new Error(`OWNER_INVENTORY_CHANNEL_MISMATCH: expected=${channel.youtubeChannelId} actual=${result.channelId}`);
      replaceExistingCacheFromSync(channel.id,result.videos||[],result);
      const authoritative=readAuthoritativeExistingSnapshot(channel.id);
      const videos=authoritative?.videos||(result.videos||[]);
      const updatedAt=authoritative?.updatedAt||new Date().toISOString();
      const complete=Boolean(result.syncComplete??result.complete);
      const row={...ownerInventoryFromVideos(channel,videos,updatedAt,complete),status:complete?'FRESH' as const:'CACHED' as const,error:complete?undefined:'OWNER_INVENTORY_SYNC_INCOMPLETE'};
      useYoutubeOwnerInventory.getState().setSnapshot(row);return row
    }catch(error){
      const row={...(cached||{channelId:channel.id,channelName:channel.name,profileId:profile.id,youtubeChannelId:channel.youtubeChannelId,complete:false}),status:'ERROR' as const,error:String(error)};
      useYoutubeOwnerInventory.getState().setSnapshot(row);return row
    }
  })();
  singleRuns.set(channelId,task);
  void task.finally(()=>{if(singleRuns.get(channelId)===task)singleRuns.delete(channelId)}).catch(()=>undefined);
  return task
}

let allRun:Promise<void>|undefined;
export function refreshYoutubeOwnerInventory(force=false){
  if(allRun)return allRun;
  const task=(async()=>{
    const profiles=await api.youtubeProfiles();
    const channels=useApp.getState().channels.filter(c=>c.enabled!==false&&c.youtubeProfileId&&c.youtubeChannelId);
    const store=useYoutubeOwnerInventory.getState();store.setProgress(true,0,channels.length);
    let done=0;
    try{
      for(const channel of channels){
        await refreshYoutubeOwnerInventoryChannel(channel.id,force,profiles);
        done++;store.setProgress(true,done,channels.length);
        await new Promise(resolve=>setTimeout(resolve,60))
      }
    }finally{store.setProgress(false,done,channels.length)}
  })();
  allRun=task;
  void task.finally(()=>{if(allRun===task)allRun=undefined}).catch(()=>undefined);
  return task
}

export function ownerInventoryTotals(snapshots:Record<string,YoutubeOwnerInventorySnapshot>,channels:Channel[]){
  const ids=new Set(channels.filter(c=>c.enabled!==false).map(c=>c.id));
  const rows=Object.values(snapshots).filter(x=>ids.has(x.channelId));
  const sum=(key:'totalOwnerVisible'|'publicCount'|'privateCount'|'scheduledCount'|'unlistedCount'|'publishedCount')=>rows.reduce((n,x)=>n+(x[key]??0),0);
  return{
    channels:ids.size,known:rows.filter(x=>x.totalOwnerVisible!=null).length,
    totalOwnerVisible:sum('totalOwnerVisible'),publicCount:sum('publicCount'),privateCount:sum('privateCount'),
    scheduledCount:sum('scheduledCount'),unlistedCount:sum('unlistedCount'),publishedCount:sum('publishedCount')
  }
}
