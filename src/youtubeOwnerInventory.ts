import {api} from './api';
import {readAuthoritativeExistingSnapshot,readExistingCache,replaceExistingCacheFromSync,scheduleSyncTruthFromInfo} from './channelSchedule';
import type {Channel,YoutubeExistingVideo} from './types';
import {markYoutubeCache} from './youtubeCache';
import {bindYoutubeQuotaTraceContext,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';

export const OWNER_INVENTORY_TTL_MS=6*60*60*1000;
export const OWNER_INVENTORY_EVENT='vyron:owner-inventory-refresh';
const ownerInventoryRuns=new Map<string,Promise<OwnerInventoryRefreshSummary>>();

export type OwnerYoutubeInventorySnapshot={
  channelId:string;
  available:boolean;
  complete:boolean;
  updatedAt?:string;
  total:number;
  public:number;
  private:number;
  scheduled:number;
  unlisted:number;
  published:number;
  nextScheduledAt?:string;
  lastScheduledAt?:string;
  publishedToday:number;
};

export type OwnerYoutubeInventoryTotals={
  availableChannels:number;
  completeChannels:number;
  partialChannels:number;
  total:number;
  public:number;
  private:number;
  scheduled:number;
  unlisted:number;
  published:number;
  publishedToday:number;
  nextScheduledAt?:string;
};

const isFuture=(iso:string|undefined,now:number)=>Boolean(iso&&Number.isFinite(Date.parse(iso))&&Date.parse(iso)>now);
const sameLocalDay=(iso:string|undefined,now:Date)=>{
  if(!iso)return false;
  const d=new Date(iso);
  return !Number.isNaN(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()
};

export function ownerInventoryFromVideos(channelId:string,videos:YoutubeExistingVideo[],updatedAt?:string,syncInfo?:unknown,nowMs=Date.now()):OwnerYoutubeInventorySnapshot{
  const now=new Date(nowMs);
  let publicCount=0,privateCount=0,scheduled=0,unlisted=0,publishedToday=0;
  const future:string[]=[];
  for(const video of videos){
    const privacy=String(video.privacyStatus||'').toLowerCase();
    if(privacy==='private'){
      if(isFuture(video.publishAt,nowMs)){scheduled++;future.push(video.publishAt!)}
      else privateCount++;
      continue
    }
    if(privacy==='public'){
      publicCount++;
      if(sameLocalDay(video.publishedAt,now))publishedToday++;
      continue
    }
    if(privacy==='unlisted'){
      unlisted++;
      if(sameLocalDay(video.publishedAt,now))publishedToday++
    }
  }
  future.sort((a,b)=>Date.parse(a)-Date.parse(b));
  return{
    channelId,
    available:true,
    complete:scheduleSyncTruthFromInfo(syncInfo)==='complete',
    updatedAt,
    total:videos.length,
    public:publicCount,
    private:privateCount,
    scheduled,
    unlisted,
    published:publicCount+unlisted,
    nextScheduledAt:future[0],
    lastScheduledAt:future.at(-1),
    publishedToday
  }
}

export function ownerInventoryForChannel(channelId:string,nowMs=Date.now()):OwnerYoutubeInventorySnapshot{
  const snapshot=readAuthoritativeExistingSnapshot(channelId);
  if(!snapshot)return{channelId,available:false,complete:false,total:0,public:0,private:0,scheduled:0,unlisted:0,published:0,publishedToday:0};
  return ownerInventoryFromVideos(channelId,snapshot.videos,snapshot.updatedAt,snapshot.syncInfo,nowMs)
}

export function aggregateOwnerInventories(channels:Channel[],nowMs=Date.now()):OwnerYoutubeInventoryTotals{
  const rows=channels.filter(c=>c.enabled!==false).map(c=>ownerInventoryForChannel(c.id,nowMs)).filter(x=>x.available);
  const future=rows.map(x=>x.nextScheduledAt).filter((x):x is string=>Boolean(x)).sort((a,b)=>Date.parse(a)-Date.parse(b));
  return{
    availableChannels:rows.length,
    completeChannels:rows.filter(x=>x.complete).length,
    partialChannels:rows.filter(x=>!x.complete).length,
    total:rows.reduce((n,x)=>n+x.total,0),
    public:rows.reduce((n,x)=>n+x.public,0),
    private:rows.reduce((n,x)=>n+x.private,0),
    scheduled:rows.reduce((n,x)=>n+x.scheduled,0),
    unlisted:rows.reduce((n,x)=>n+x.unlisted,0),
    published:rows.reduce((n,x)=>n+x.published,0),
    publishedToday:rows.reduce((n,x)=>n+x.publishedToday,0),
    nextScheduledAt:future[0]
  }
}

export function ownerInventoryCacheStale(channelId:string,nowMs=Date.now(),ttlMs=OWNER_INVENTORY_TTL_MS){
  const cache=readExistingCache(channelId);
  const at=Date.parse(cache?.lastCompleteAt||cache?.updatedAt||'');
  return !Number.isFinite(at)||nowMs-at>=ttlMs
}

export type OwnerInventoryRefreshSummary={requested:number;updated:number;failed:number;skippedFresh:number;skippedUnlinked:number;stoppedForQuota:boolean};

export function refreshStaleOwnerInventories(channels:Channel[],force=false):Promise<OwnerInventoryRefreshSummary>{
  const ids=channels.filter(c=>c.enabled!==false).map(c=>c.id).sort();
  const runKey=(force?'force:':'stale:')+ids.join('|');
  const existing=ownerInventoryRuns.get(runKey);
  if(existing)return existing;
  const task=(async():Promise<OwnerInventoryRefreshSummary>=>{
  const summary:OwnerInventoryRefreshSummary={requested:0,updated:0,failed:0,skippedFresh:0,skippedUnlinked:0,stoppedForQuota:false};
  const profiles=await api.youtubeProfiles();
  const byId=new Map(profiles.map(x=>[x.id,x]));
  for(const channel of channels.filter(c=>c.enabled!==false)){
    const profile=channel.youtubeProfileId?byId.get(channel.youtubeProfileId):undefined;
    if(!profile?.id||!profile.channelId||!channel.youtubeChannelId||profile.channelId!==channel.youtubeChannelId){summary.skippedUnlinked++;continue}
    if(!force&&!ownerInventoryCacheStale(channel.id)){summary.skippedFresh++;continue}
    const usage=youtubeQuotaUsage();
    if(youtubeQuotaState().blocked||Math.max(0,usage.limit-usage.used)<250){summary.stoppedForQuota=true;break}
    summary.requested++;
    try{
      const cached=ownerInventoryForChannel(channel.id),videoCount=cached.available?cached.total:50;
      const estimatedUnits=1+Math.max(1,Math.ceil(videoCount/50))+(videoCount?Math.ceil(videoCount/50):0);
      const operationId='owner-inventory:'+(force?'manual':'background')+':'+channel.id+':'+Date.now();
      bindYoutubeQuotaTraceContext(operationId,{reason:'OWNER_INVENTORY_REFRESH',channelIds:[channel.id],mode:force?'MANUAL':'BACKGROUND',estimatedUnits});
      const result=await api.youtubeListExisting(profile.id,5000,operationId);
      replaceExistingCacheFromSync(channel.id,result.videos||[],result);
      markYoutubeCache('existing',channel.id);
      summary.updated++;
    }catch{
      summary.failed++
    }
  }
  window.dispatchEvent(new CustomEvent(OWNER_INVENTORY_EVENT,{detail:summary}));
  return summary
})();
  ownerInventoryRuns.set(runKey,task);
  void task.finally(()=>{if(ownerInventoryRuns.get(runKey)===task)ownerInventoryRuns.delete(runKey)});
  return task;
}
