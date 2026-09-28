import {api,type ExistingVideoSyncResult} from './api';
import {useApp} from './store';
import type {Channel,YoutubeOwnerInventorySnapshot} from './types';

export const OWNER_INVENTORY_TTL_MS=30*60*1000;
export const OWNER_INVENTORY_MAX_RESULTS=5000;

function isoOrUndefined(value?:string){
  if(!value)return undefined;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?new Date(ms).toISOString():undefined
}

export function ownerInventorySnapshotFromSync(channel:Channel,result:ExistingVideoSyncResult,refreshedAt=new Date().toISOString()):YoutubeOwnerInventorySnapshot{
  const youtubeChannelId=String(result.channelId||channel.youtubeChannelId||'').trim();
  const profileId=String(channel.youtubeProfileId||'').trim();
  if(!youtubeChannelId)throw new Error('OWNER_INVENTORY_CHANNEL_ID_MISSING');
  if(!profileId)throw new Error('OWNER_INVENTORY_PROFILE_ID_MISSING');

  const publicCount=Math.max(0,Number(result.publicCount)||0);
  const privateCount=Math.max(0,Number(result.privateCount)||0);
  const scheduledCount=Math.max(0,Number(result.scheduledCount)||0);
  const unlistedCount=Math.max(0,Number(result.unlistedCount)||0);
  const total=publicCount+privateCount+scheduledCount+unlistedCount;
  const scheduledItems=(result.videos||[])
    .filter(v=>v.privacyStatus==='private'&&Boolean(v.publishAt))
    .map(v=>({id:v.id,title:v.title||v.id,publishAt:isoOrUndefined(v.publishAt)! as string,privacyStatus:'private' as const}))
    .filter(v=>Boolean(v.publishAt))
    .sort((a,b)=>Date.parse(a.publishAt)-Date.parse(b.publishAt));
  const latestScheduledAt=scheduledItems.at(-1)?.publishAt;

  return{
    channelId:channel.id,
    youtubeChannelId,
    profileId,
    refreshedAt:new Date(refreshedAt).toISOString(),
    total,
    publicCount,
    privateCount,
    scheduledCount,
    unlistedCount,
    latestScheduledAt,
    scheduledItems,
    complete:Boolean(result.syncComplete??result.complete),
    scheduleComplete:Boolean(result.scheduleComplete??result.complete),
    apiRequests:Math.max(0,Number(result.fullSyncApiRequests)||0),
    estimatedQuotaCost:Math.max(0,Number(result.fullSyncEstimatedQuotaCost)||0),
    incompleteReasons:[...(result.inventoryIncompleteReasons||[]),...(result.incompleteReasons||[])].filter(Boolean)
  }
}

export function ownerInventoryIsFresh(row:YoutubeOwnerInventorySnapshot|undefined,now=Date.now(),ttl=OWNER_INVENTORY_TTL_MS){
  if(!row?.refreshedAt)return false;
  const at=Date.parse(row.refreshedAt);
  return Number.isFinite(at)&&now-at>=0&&now-at<ttl
}

const inFlight=new Map<string,Promise<YoutubeOwnerInventorySnapshot|undefined>>();

export function refreshOwnerInventoryForChannel(channelId:string,force=false):Promise<YoutubeOwnerInventorySnapshot|undefined>{
  const current=inFlight.get(channelId);
  if(current)return current;

  const task=(async()=>{
    const state=useApp.getState();
    const channel=state.channels.find(c=>c.id===channelId);
    if(!channel?.youtubeProfileId||!channel.youtubeChannelId)return undefined;
    const cached=state.ownerYoutubeInventory[channel.id];
    if(!force&&ownerInventoryIsFresh(cached))return cached;

    const result=await api.youtubeListExisting(channel.youtubeProfileId,OWNER_INVENTORY_MAX_RESULTS);
    if(result.channelId&&result.channelId!==channel.youtubeChannelId){
      throw new Error(`OWNER_INVENTORY_WRONG_CHANNEL: expected=${channel.youtubeChannelId} actual=${result.channelId}`)
    }
    const snapshot=ownerInventorySnapshotFromSync(channel,result);
    useApp.getState().setOwnerYoutubeInventory(channel.id,snapshot);
    return snapshot
  })().finally(()=>{if(inFlight.get(channelId)===task)inFlight.delete(channelId)});

  inFlight.set(channelId,task);
  return task
}

export async function refreshStaleOwnerInventories(force=false){
  const state=useApp.getState();
  const ids=state.channels
    .filter(c=>c.enabled!==false&&Boolean(c.youtubeProfileId)&&Boolean(c.youtubeChannelId))
    .filter(c=>force||!ownerInventoryIsFresh(state.ownerYoutubeInventory[c.id]))
    .map(c=>c.id);
  let cursor=0;
  const errors:Array<{channelId:string;error:string}>=[];
  const worker=async()=>{
    while(true){
      const index=cursor++;
      if(index>=ids.length)return;
      const channelId=ids[index];
      try{await refreshOwnerInventoryForChannel(channelId,force)}
      catch(error){errors.push({channelId,error:String(error)})}
    }
  };
  await Promise.all(Array.from({length:Math.min(2,Math.max(1,ids.length))},()=>worker()));
  return{requested:ids.length,errors}
}

export function ownerInventoryTotals(channels:Channel[],rows:Record<string,YoutubeOwnerInventorySnapshot>){
  const enabled=channels.filter(c=>c.enabled!==false&&c.youtubeProfileId&&c.youtubeChannelId);
  const snapshots=enabled.map(c=>rows[c.id]).filter((x):x is YoutubeOwnerInventorySnapshot=>Boolean(x));
  return{
    connected:enabled.length,
    refreshed:snapshots.length,
    complete:snapshots.filter(x=>x.complete).length,
    ownerVisible:snapshots.reduce((n,x)=>n+x.total,0),
    publicCount:snapshots.reduce((n,x)=>n+x.publicCount,0),
    privateCount:snapshots.reduce((n,x)=>n+x.privateCount,0),
    scheduledCount:snapshots.reduce((n,x)=>n+x.scheduledCount,0),
    unlistedCount:snapshots.reduce((n,x)=>n+x.unlistedCount,0),
    allComplete:snapshots.length===enabled.length&&snapshots.every(x=>x.complete)
  }
}

export function ownerScheduledItems(row:YoutubeOwnerInventorySnapshot|undefined){return Array.isArray(row?.scheduledItems)?row!.scheduledItems:[]}
