import {useEffect} from 'react';
import {BACKGROUND_CHANNEL_STATS_TTL_MS,refreshYoutubeChannelStatistics} from './youtubeChannelStatsRuntime';

export function ChannelStatisticsScheduler(){
  useEffect(()=>{
    let cancelled=false;
    const run=()=>{if(!cancelled)void refreshYoutubeChannelStatistics(false).catch(()=>{})};
    run();
    const id=window.setInterval(run,BACKGROUND_CHANNEL_STATS_TTL_MS);
    return()=>{cancelled=true;window.clearInterval(id)};
  },[]);
  return null;
}
