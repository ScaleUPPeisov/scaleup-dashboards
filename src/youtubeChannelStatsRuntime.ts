import {api} from './api';
import {useApp} from './store';
import type {YoutubeChannelStatistics,YoutubeProfile} from './types';
import {isChannelStatsStale,normalizeChannelStatistics,preserveChannelStatisticsOnError} from './youtubeChannelStats';

export type ChannelStatisticsRefreshProgress={done:number;total:number};
export type ChannelStatisticsRefreshSummary={done:number;total:number;updated:number;failed:number};

const profileRuns=new Map<string,Promise<YoutubeChannelStatistics|null>>();
let allRun:Promise<ChannelStatisticsRefreshSummary>|undefined;

function boundChannel(profile:YoutubeProfile){
  return useApp.getState().channels.find(c=>c.youtubeChannelId===profile.channelId||c.youtubeProfileId===profile.id);
}

function apply(profile:YoutubeProfile,stats:YoutubeChannelStatistics){
  const channel=boundChannel(profile);
  if(!channel)return false;
  useApp.getState().updateChannel(channel.id,{stats:normalizeChannelStatistics(stats,channel.stats)});
  return true;
}

function preserve(profile:YoutubeProfile,error:unknown){
  const channel=boundChannel(profile);
  if(!channel)return;
  useApp.getState().updateChannel(channel.id,{stats:preserveChannelStatisticsOnError(channel.stats,error)});
}

export function refreshYoutubeProfileStatistics(profile:YoutubeProfile){
  if(!profile.id||!profile.channelId)return Promise.resolve(null);
  const existing=profileRuns.get(profile.id);
  if(existing)return existing;
  const task=(async()=>{
    try{
      const stats=await api.youtubeChannelStatistics(profile.id);
      apply(profile,stats);
      return stats;
    }catch(error){
      preserve(profile,error);
      return null;
    }finally{
      if(profileRuns.get(profile.id)===task)profileRuns.delete(profile.id);
    }
  })();
  profileRuns.set(profile.id,task);
  return task;
}

async function runAll(force:boolean,onProgress?:((p:ChannelStatisticsRefreshProgress)=>void)):Promise<ChannelStatisticsRefreshSummary>{
  const profiles=await api.youtubeProfiles();
  const entries=profiles.filter(p=>{
    const channel=boundChannel(p);
    return !!p.id&&!!p.channelId&&!!channel&&(force||isChannelStatsStale(channel.stats));
  });
  const total=entries.length;
  let done=0,updated=0,failed=0;
  onProgress?.({done,total});
  if(!total)return{done,total,updated,failed};

  // YouTube channels.list accepts up to 50 IDs. A single authenticated request can
  // read public channel statistics for the whole known channel batch, which keeps a
  // 31-channel VYRON workspace to one quota unit when the batch succeeds.
  for(let offset=0;offset<entries.length;offset+=50){
    const chunk=entries.slice(offset,offset+50);
    const driver=chunk[0];
    try{
      const batch=await api.youtubeChannelStatisticsBatch(driver.id,chunk.map(p=>p.channelId!));
      const byId=new Map(batch.items.filter(x=>x.channelId).map(x=>[x.channelId!,x]));
      for(const profile of chunk){
        const stats=byId.get(profile.channelId!);
        if(stats&&apply(profile,stats))updated++;
        else{failed++;preserve(profile,'YOUTUBE_CHANNEL_STATS_MISSING: '+profile.channelId)}
        done++;onProgress?.({done,total});
      }
    }catch(batchError){
      // One stale/invalid driver profile must not abort the remaining accounts.
      // Fallback is controlled in groups of three and each profile remains single-flight.
      for(let i=0;i<chunk.length;i+=3){
        const group=chunk.slice(i,i+3);
        const result=await Promise.all(group.map(async profile=>{
          const stats=await refreshYoutubeProfileStatistics(profile);
          return{profile,ok:!!stats};
        }));
        for(const row of result){
          if(row.ok)updated++;else failed++;
          done++;onProgress?.({done,total});
        }
      }
      void batchError;
    }
  }
  return{done,total,updated,failed};
}

export function refreshYoutubeChannelStatistics(
  force=false,
  onProgress?:((p:ChannelStatisticsRefreshProgress)=>void),
){
  if(allRun)return allRun;
  const task=runAll(force,onProgress).finally(()=>{if(allRun===task)allRun=undefined});
  allRun=task;
  return task;
}

export function channelStatisticsRefreshRunning(){return !!allRun}
