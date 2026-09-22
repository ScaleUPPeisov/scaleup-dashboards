import {useEffect} from 'react';
import {BACKGROUND_CHANNEL_STATS_TTL_MS,refreshYoutubeChannelStatistics} from './youtubeChannelStatsRuntime';

export function ChannelStatisticsScheduler(){
  useEffect(()=>{
    let cancelled=false;
    const run=()=>{if(!cancelled)void refreshYoutubeChannelStatistics(false).catch(()=>{})};
    run();
    const onOauthReady=()=>run();
    window.addEventListener('vyron:oauth-state-changed',onOauthReady);
    const id=window.setInterval(run,BACKGROUND_CHANNEL_STATS_TTL_MS);
    return()=>{cancelled=true;window.clearInterval(id);window.removeEventListener('vyron:oauth-state-changed',onOauthReady)};
  },[]);
  return null;
}
