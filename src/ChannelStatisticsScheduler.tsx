import {useEffect} from 'react';
import {CHANNEL_STATS_TTL_MS} from './youtubeChannelStats';
import {refreshYoutubeChannelStatistics} from './youtubeChannelStatsRuntime';

export function ChannelStatisticsScheduler(){
  useEffect(()=>{
    let cancelled=false;
    const run=()=>{if(!cancelled)void refreshYoutubeChannelStatistics(false).catch(()=>{})};
    run();
    const id=window.setInterval(run,CHANNEL_STATS_TTL_MS);
    return()=>{cancelled=true;window.clearInterval(id)};
  },[]);
  return null;
}
