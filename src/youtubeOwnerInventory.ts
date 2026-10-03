import {api} from './api';
import {hydrateExistingInventoryCaches,readAuthoritativeExistingSnapshot,readExistingCache,replaceExistingCacheFromSync,scheduleSyncTruthFromInfo} from './channelSchedule';
import {deriveRunwayRecord} from './channelRunwayCore';
import type {Channel,YoutubeExistingVideo} from './types';
import {markYoutubeCache} from './youtubeCache';
import {bindYoutubeQuotaTraceContext,youtubeOperationActualCost,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';
import {classifyYoutubeChannels} from './youtubeStatisticsCenter';
import {loadChannelRunwayStore,upsertChannelRunwayFromYoutube} from './channelRunwayStore';

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

export type OwnerInventoryFleetStatus='UPDATED'|'UNLINKED'|'MISMATCH'|'DUPLICATE'|'OAUTH_BLOCKED'|'API_FAILED'|'PERSISTENCE_FAILED'|'QUOTA_STOPPED'|'FRESH_CACHE';
export type OwnerInventoryRefreshRow={
  channelId:string;channelName:string;status:OwnerInventoryFleetStatus;
  profileId?:string;youtubeChannelId?:string;apiRequests:number;quotaUnits:number;error?:string;
};
export type OwnerInventoryRefreshSummary={
  requested:number;updated:number;failed:number;skippedFresh:number;skippedUnlinked:number;stoppedForQuota:boolean;
  apiRequests:number;quotaUnits:number;rows:OwnerInventoryRefreshRow[];
  counts:Record<OwnerInventoryFleetStatus,number>;
};

const BLOCKED_OWNER_CREDENTIAL_STATES=new Set(['NEEDS_ONE_TIME_LOCAL_MIGRATION','CANONICAL_PRESENT_UNVERIFIED','CHECK_ON_USE','RECOVERABLE','KEYCHAIN_BLOCKED','RECONNECT_REQUIRED','MISSING','WRONG_CHANNEL','FAILED','KEYCHAIN_ERROR']);

function emptyOwnerCounts():Record<OwnerInventoryFleetStatus,number>{
  return{UPDATED:0,UNLINKED:0,MISMATCH:0,DUPLICATE:0,OAUTH_BLOCKED:0,API_FAILED:0,PERSISTENCE_FAILED:0,QUOTA_STOPPED:0,FRESH_CACHE:0}
}
function duplicateExtraChannelIds(channels:Channel[],profiles:Awaited<ReturnType<typeof api.youtubeProfiles>>){
  const classification=classifyYoutubeChannels(channels,profiles),extras=new Set<string>();
  for(const duplicate of classification.duplicates){
    const ordered=duplicate.channelIds.slice().sort();
    for(const id of ordered.slice(1))extras.add(id)
  }
  return{classification,extras}
}
function pushOwnerRow(summary:OwnerInventoryRefreshSummary,row:OwnerInventoryRefreshRow){
  summary.rows.push(row);summary.counts[row.status]++;
  if(row.status==='UPDATED')summary.updated++;
  else if(row.status==='API_FAILED'||row.status==='PERSISTENCE_FAILED')summary.failed++;
  else if(row.status==='FRESH_CACHE')summary.skippedFresh++;
  else if(row.status==='UNLINKED'||row.status==='MISMATCH'||row.status==='DUPLICATE'||row.status==='OAUTH_BLOCKED')summary.skippedUnlinked++;
}
export async function refreshOwnerInventoriesAuthoritative(
  channels:Channel[],
  force=false,
  suppliedProfiles?:Awaited<ReturnType<typeof api.youtubeProfiles>>
):Promise<OwnerInventoryRefreshSummary>{
  const enabled=channels.filter(c=>c.enabled!==false);
  await hydrateExistingInventoryCaches(enabled.map(c=>c.id));
  const summary:OwnerInventoryRefreshSummary={requested:0,updated:0,failed:0,skippedFresh:0,skippedUnlinked:0,stoppedForQuota:false,apiRequests:0,quotaUnits:0,rows:[],counts:emptyOwnerCounts()};
  const profiles=suppliedProfiles||await api.youtubeProfiles();
  const {classification,extras}=duplicateExtraChannelIds(enabled,profiles);
  const unlinked=new Set([...classification.unlinked,...classification.orphans].map(c=>c.id));
  const mismatched=new Set(classification.mismatched.map(c=>c.id));
  const eligibleById=new Map(classification.eligible.map(x=>[x.channel.id,x]));
  let quotaStopped=false;

  for(const channel of enabled){
    const linked=eligibleById.get(channel.id);
    if(extras.has(channel.id)){pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'DUPLICATE',profileId:channel.youtubeProfileId,youtubeChannelId:channel.youtubeChannelId,apiRequests:0,quotaUnits:0});continue}
    if(mismatched.has(channel.id)){pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'MISMATCH',profileId:channel.youtubeProfileId,youtubeChannelId:channel.youtubeChannelId,apiRequests:0,quotaUnits:0});continue}
    if(unlinked.has(channel.id)||!linked){pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'UNLINKED',profileId:channel.youtubeProfileId,youtubeChannelId:channel.youtubeChannelId,apiRequests:0,quotaUnits:0});continue}
    if(BLOCKED_OWNER_CREDENTIAL_STATES.has(String(linked.profile.credentialStatus||''))){
      pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'OAUTH_BLOCKED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests:0,quotaUnits:0,error:'credentialStatus='+String(linked.profile.credentialStatus||'UNKNOWN')});
      continue
    }
    if(!force&&!ownerInventoryCacheStale(channel.id)){
      pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'FRESH_CACHE',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests:0,quotaUnits:0});
      continue
    }
    if(quotaStopped||youtubeQuotaState().blocked||Math.max(0,youtubeQuotaUsage().limit-youtubeQuotaUsage().used)<250){
      quotaStopped=true;summary.stoppedForQuota=true;
      pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'QUOTA_STOPPED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests:0,quotaUnits:0});
      continue
    }

    summary.requested++;
    const cached=ownerInventoryForChannel(channel.id),videoCount=cached.available?cached.total:50;
    const estimatedUnits=1+Math.max(1,Math.ceil(videoCount/50))+(videoCount?Math.ceil(videoCount/50):0);
    const operationId='owner-inventory:'+(force?'manual':'background')+':'+channel.id+':'+Date.now();
    bindYoutubeQuotaTraceContext(operationId,{reason:'OWNER_INVENTORY_REFRESH',channelIds:[channel.id],mode:force?'MANUAL':'BACKGROUND',estimatedUnits});
    try{
      const result=await api.youtubeListExisting(linked.profile.id,5000,operationId);
      const backendApi=Number(result.fullSyncApiRequests),backendQuota=Number(result.fullSyncEstimatedQuotaCost);
      const fallback=!Number.isFinite(backendApi)||backendApi<1?youtubeOperationActualCost(operationId):null;
      const apiRequests=Number.isFinite(backendApi)&&backendApi>=1?backendApi:Object.values(fallback?.methods||{}).reduce((n:number,x:any)=>n+Number(x.calls||0),0);
      const quotaUnits=Number.isFinite(backendQuota)&&backendQuota>=0?backendQuota:Number(fallback?.buckets.general||apiRequests);
      summary.apiRequests+=apiRequests;summary.quotaUnits+=quotaUnits;
      if(result.channelId&&String(result.channelId)!==String(linked.youtubeChannelId)){
        pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'API_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:'AUTHORITATIVE_CHANNEL_ID_MISMATCH'});
        continue
      }
      const cache=await replaceExistingCacheFromSync(channel.id,result.videos||[],result);
      if(!cache.persisted){
        pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'PERSISTENCE_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:`Данные YouTube получены, но VYRON не смог сохранить их локально. API повторно не запускайте. Ошибка: ${cache.persistErrorCode||'STORAGE_WRITE_FAILED'}`});
        continue
      }
      markYoutubeCache('existing',channel.id);
      if(!(result.syncComplete??result.complete)){
        pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'API_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:'AUTHORITATIVE_INVENTORY_INCOMPLETE'});
        continue
      }
      const now=new Date(),expected=deriveRunwayRecord(channel,result.videos||[],now,now.toISOString(),true);
      const runwayWrite=upsertChannelRunwayFromYoutube(channel,result.videos||[],now);
      const persisted=loadChannelRunwayStore().channels[channel.id];
      const readbackOk=runwayWrite.ok&&Boolean(persisted)&&persisted.channelId===channel.id&&Boolean(persisted.lastScheduleSync)&&persisted.scheduledVideoCount===expected.scheduledVideoCount&&persisted.scheduledUntil===expected.scheduledUntil;
      if(!readbackOk){
        pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'PERSISTENCE_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:`Данные YouTube получены, но VYRON не смог сохранить их локально. API повторно не запускайте. Ошибка: ${runwayWrite.errorCode||'STORAGE_READBACK_FAILED'}`});
        continue
      }
      pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'UPDATED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits});
    }catch(error){
      const actual=youtubeOperationActualCost(operationId),apiRequests=Object.values(actual.methods).reduce((n,x)=>n+x.calls,0),quotaUnits=actual.buckets.general;
      summary.apiRequests+=apiRequests;summary.quotaUnits+=quotaUnits;
      pushOwnerRow(summary,{channelId:channel.id,channelName:channel.name,status:'API_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:String(error)});
    }
  }
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(OWNER_INVENTORY_EVENT,{detail:summary}));
  return summary
}

export function refreshStaleOwnerInventories(channels:Channel[],force=false):Promise<OwnerInventoryRefreshSummary>{
  const ids=channels.filter(c=>c.enabled!==false).map(c=>c.id).sort();
  const runKey=(force?'force:':'stale:')+ids.join('|');
  const existing=ownerInventoryRuns.get(runKey);
  if(existing)return existing;
  const task=refreshOwnerInventoriesAuthoritative(channels,force);
  ownerInventoryRuns.set(runKey,task);
  void task.finally(()=>{if(ownerInventoryRuns.get(runKey)===task)ownerInventoryRuns.delete(runKey)});
  return task;
}

