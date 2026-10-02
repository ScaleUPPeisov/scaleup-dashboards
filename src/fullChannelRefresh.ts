import {useApp} from './store';
import {scanAllInventories,useLiveInventory} from './renderInventoryRuntime';
import {refreshOwnerInventoriesAuthoritative,type OwnerInventoryRefreshSummary} from './youtubeOwnerInventory';
import {refreshYoutubeChannelStatisticsSelection,type ChannelStatisticsRefreshSummary} from './youtubeChannelStatsRuntime';
import {youtubeQuotaUsage} from './youtubeQuota';
import {recalculateChannelRunway} from './channelRunwayStore';

export type FullChannelRefreshLocalSummary={
  requested:number;
  snapshots:number;
  online:number;
  ready:number;
  issues:number;
};

export type FullChannelRefreshSummary={
  stats?:ChannelStatisticsRefreshSummary;
  owner?:OwnerInventoryRefreshSummary;
  local:FullChannelRefreshLocalSummary;
  errors:string[];
  quotaBefore:number;
  quotaAfter:number;
  quotaDelta:number;
};

function localSummary():FullChannelRefreshLocalSummary{
  const enabled=useApp.getState().channels.filter(c=>c.enabled!==false);
  const snapshots=useLiveInventory.getState().snapshots;
  const rows=enabled.map(c=>snapshots[c.id]).filter(Boolean);
  return{
    requested:enabled.length,
    snapshots:rows.length,
    online:rows.filter(x=>x.folderState==='ONLINE').length,
    ready:rows.reduce((n,x)=>n+x.readyVideos,0),
    issues:rows.filter(x=>x.folderState==='ERROR'||x.folderState==='OFFLINE').length
  };
}

export async function refreshAllChannelData(channelIds:string[]):Promise<FullChannelRefreshSummary>{
  const errors:string[]=[];
  const quotaBefore=youtubeQuotaUsage().used;
  const enabled=useApp.getState().channels.filter(c=>c.enabled!==false);
  const requestedIds=new Set(channelIds.filter(Boolean));
  const requested=enabled.filter(c=>!requestedIds.size||requestedIds.has(c.id));

  // Local Render scan is independent of YouTube and must never spend API quota.
  const localRun=scanAllInventories('manual-all').catch(error=>{
    errors.push('LOCAL_RENDER_SCAN: '+String(error));
  });

  let stats:ChannelStatisticsRefreshSummary|undefined;
  try{
    stats=await refreshYoutubeChannelStatisticsSelection(channelIds,true);
  }catch(error){
    errors.push('YOUTUBE_CHANNEL_STATS: '+String(error));
  }

  let owner:OwnerInventoryRefreshSummary|undefined;
  try{
    // Owner inventory is the authoritative source for future publishAt / Scheduled.
    // It intentionally runs after the stats batch to avoid overlapping YouTube API traffic.
    owner=await refreshOwnerInventoriesAuthoritative(requested,true);
  }catch(error){
    errors.push('YOUTUBE_OWNER_INVENTORY: '+String(error));
  }

  await localRun;
  // Recalculate the persisted schedule-derived fleet view after both authoritative
  // YouTube projections and zero-quota Render inventory have settled.
  recalculateChannelRunway(enabled,new Date(),false);

  // Flush the already-updated Zustand state to the existing persistence layer.
  // This does not touch OAuth/keychain storage and does not replace the database.
  try{await useApp.getState().persist()}catch(error){errors.push('STATE_PERSIST: '+String(error))}

  const quotaAfter=youtubeQuotaUsage().used;
  return{
    stats,
    owner,
    local:localSummary(),
    errors,
    quotaBefore,
    quotaAfter,
    quotaDelta:Math.max(0,quotaAfter-quotaBefore)
  };
}
