import {create} from 'zustand';
import {api,type ExistingVideoSyncResult} from './api';
import {readAuthoritativeExistingSnapshot,replaceExistingCacheFromSync} from './channelSchedule';
import {useApp} from './store';
import type {Channel,YoutubeExistingVideo} from './types';
import {markYoutubeCache,youtubeCacheFresh} from './youtubeCache';
import {isYoutubeQuotaError,markYoutubeQuotaExceeded,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';

export type OwnerInventoryStatus='UNAVAILABLE'|'CACHED'|'SYNCING'|'FRESH'|'ERROR';
export type OwnerInventorySnapshot={
 channelId:string;channelName:string;status:OwnerInventoryStatus;
 total:number;publicCount:number;privateCount:number;scheduledCount:number;unlistedCount:number;
 publishedToday:number;nextScheduledAt?:string;lastScheduledAt?:string;scheduleFrequency?:string;updatedAt?:string;
 complete:boolean;error?:string
};
type OwnerInventoryState={snapshots:Record<string,OwnerInventorySnapshot>;syncing:boolean;revision:number;setSnapshot:(x:OwnerInventorySnapshot)=>void;setSyncing:(x:boolean)=>void};
const AUTO_OWNER_TTL_MS=60*60_000;
const MIN_GENERAL_QUOTA_RESERVE=100;

const localDayKey=(value:string|Date)=>{const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const futurePublishAt=(v:YoutubeExistingVideo,nowMs:number)=>v.privacyStatus==='private'&&Boolean(v.publishAt)&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>nowMs;
export function inferYoutubeScheduleFrequency(times:string[]){
 const sorted=times.filter(x=>Number.isFinite(Date.parse(x))).sort((a,b)=>Date.parse(a)-Date.parse(b));
 if(sorted.length<2)return undefined;
 const days=[] as number[];
 for(let i=1;i<sorted.length;i++)days.push(Math.round((Date.parse(sorted[i])-Date.parse(sorted[i-1]))/86400000));
 const first=days[0];
 if(!first||days.some(x=>x!==first))return'Нерегулярно';
 if(first===1)return'Каждый день';
 if(first===2)return'Через день';
 return'Каждые '+first+' дн.'
}

export function summarizeOwnerInventory(channel:Pick<Channel,'id'|'name'>,videos:YoutubeExistingVideo[],updatedAt?:string,complete=true,now=new Date()):OwnerInventorySnapshot{
 const nowMs=now.getTime(),scheduled=videos.filter(v=>futurePublishAt(v,nowMs)),scheduledIds=new Set(scheduled.map(v=>v.id));
 const publicRows=videos.filter(v=>v.privacyStatus==='public');
 const privateRows=videos.filter(v=>v.privacyStatus==='private'&&!scheduledIds.has(v.id));
 const unlisted=videos.filter(v=>v.privacyStatus==='unlisted');
 const times=scheduled.map(v=>v.publishAt!).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b));
 const today=localDayKey(now);
 return{
  channelId:channel.id,channelName:channel.name,status:updatedAt?'CACHED':'UNAVAILABLE',
  total:videos.length,publicCount:publicRows.length,privateCount:privateRows.length,scheduledCount:scheduled.length,unlistedCount:unlisted.length,
  publishedToday:publicRows.filter(v=>v.publishedAt&&localDayKey(v.publishedAt)===today).length,
  nextScheduledAt:times[0],lastScheduledAt:times.at(-1),scheduleFrequency:inferYoutubeScheduleFrequency(times),updatedAt,complete
 }
}
function unavailable(channel:Pick<Channel,'id'|'name'>):OwnerInventorySnapshot{return{channelId:channel.id,channelName:channel.name,status:'UNAVAILABLE',total:0,publicCount:0,privateCount:0,scheduledCount:0,unlistedCount:0,publishedToday:0,complete:false}}
export function ownerInventoryFromCache(channel:Pick<Channel,'id'|'name'>){
 const cached=readAuthoritativeExistingSnapshot(channel.id);
 return cached?summarizeOwnerInventory(channel,cached.videos,cached.updatedAt,cached.syncInfo?.syncComplete===true):unavailable(channel)
}
export const useOwnerInventory=create<OwnerInventoryState>((set)=>({
 snapshots:{},syncing:false,revision:0,
 setSnapshot:x=>set(s=>({snapshots:{...s.snapshots,[x.channelId]:x},revision:s.revision+1})),
 setSyncing:x=>set({syncing:x})
}));
export function hydrateOwnerInventoryFromCache(){
 const channels=useApp.getState().channels.filter(c=>c.enabled!==false),snapshots:Record<string,OwnerInventorySnapshot>={};
 for(const c of channels)snapshots[c.id]=ownerInventoryFromCache(c);
 useOwnerInventory.setState(s=>({snapshots,syncing:s.syncing,revision:s.revision+1}));
 return snapshots
}
function cacheFreshEnough(channelId:string,now=Date.now()){
 if(youtubeCacheFresh('existing',channelId,now))return true;
 const snapshot=readAuthoritativeExistingSnapshot(channelId),at=snapshot?.updatedAt?Date.parse(snapshot.updatedAt):NaN;
 return Number.isFinite(at)&&now-at<AUTO_OWNER_TTL_MS
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function syncOwnerChannel(channel:Channel,force=false){
 if(!channel.youtubeProfileId)return ownerInventoryFromCache(channel);
 if(!force&&cacheFreshEnough(channel.id))return ownerInventoryFromCache(channel);
 if(youtubeQuotaState().blocked)return ownerInventoryFromCache(channel);
 const usage=youtubeQuotaUsage(),remaining=Math.max(0,usage.limit-usage.used);
 if(remaining<MIN_GENERAL_QUOTA_RESERVE)return ownerInventoryFromCache(channel);
 const previous=useOwnerInventory.getState().snapshots[channel.id]||ownerInventoryFromCache(channel);
 useOwnerInventory.getState().setSnapshot({...previous,status:'SYNCING',error:undefined});
 try{
  const result:ExistingVideoSyncResult=await api.youtubeListExisting(channel.youtubeProfileId,5000);
  replaceExistingCacheFromSync(channel.id,result.videos||[],result);
  markYoutubeCache('existing',channel.id,AUTO_OWNER_TTL_MS);
  const authoritative=readAuthoritativeExistingSnapshot(channel.id);
  const next=summarizeOwnerInventory(channel,authoritative?.videos||result.videos||[],authoritative?.updatedAt||new Date().toISOString(),Boolean(result.syncComplete??result.complete));
  useOwnerInventory.getState().setSnapshot({...next,status:'FRESH'});
  return next
 }catch(error){
  const text=String(error);
  useOwnerInventory.getState().setSnapshot({...previous,status:'ERROR',error:text});
  if(isYoutubeQuotaError(error))markYoutubeQuotaExceeded(error);
  return useOwnerInventory.getState().snapshots[channel.id]
 }
}
export async function refreshOwnerInventoryChannel(channelId:string,force=true){
 hydrateOwnerInventoryFromCache();
 const channel=useApp.getState().channels.find(c=>c.id===channelId);
 if(!channel)return;
 useOwnerInventory.getState().setSyncing(true);
 try{return await syncOwnerChannel(channel,force)}
 finally{useOwnerInventory.getState().setSyncing(false)}
}
let smartSyncInFlight:Promise<void>|null=null;
export function refreshOwnerInventorySmart(force=false){
 if(smartSyncInFlight)return smartSyncInFlight;
 const run=(async()=>{
  hydrateOwnerInventoryFromCache();
  if(youtubeQuotaState().blocked)return;
  useOwnerInventory.getState().setSyncing(true);
  try{
   const channels=useApp.getState().channels.filter(c=>c.enabled!==false&&Boolean(c.youtubeProfileId));
   for(const channel of channels){
    const before=youtubeQuotaUsage();
    if(Math.max(0,before.limit-before.used)<MIN_GENERAL_QUOTA_RESERVE)break;
    await syncOwnerChannel(channel,force);
    if(youtubeQuotaState().blocked)break;
    await sleep(250)
   }
  }finally{useOwnerInventory.getState().setSyncing(false)}
 })();
 smartSyncInFlight=run;
 void run.finally(()=>{if(smartSyncInFlight===run)smartSyncInFlight=null}).catch(()=>undefined);
 return run
}
export function ownerInventoryTotals(snapshots:Record<string,OwnerInventorySnapshot>,channels:Channel[]){
 const ids=new Set(channels.filter(c=>c.enabled!==false).map(c=>c.id)),rows=Object.values(snapshots).filter(x=>ids.has(x.channelId)&&x.status!=='UNAVAILABLE');
 return{
  availableChannels:rows.length,
  total:rows.reduce((n,x)=>n+x.total,0),
  publicCount:rows.reduce((n,x)=>n+x.publicCount,0),
  privateCount:rows.reduce((n,x)=>n+x.privateCount,0),
  scheduledCount:rows.reduce((n,x)=>n+x.scheduledCount,0),
  unlistedCount:rows.reduce((n,x)=>n+x.unlistedCount,0),
  publishedToday:rows.reduce((n,x)=>n+x.publishedToday,0)
 }
}
