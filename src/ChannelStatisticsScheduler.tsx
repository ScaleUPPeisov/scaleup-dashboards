import {useEffect} from 'react';
import {useApp} from './store';
import {BACKGROUND_CHANNEL_STATS_TTL_MS,refreshYoutubeChannelStatistics} from './youtubeChannelStatsRuntime';

export const CHANNEL_STATS_TRIGGER_DEBOUNCE_MS=5_000;

export function ChannelStatisticsScheduler(){
  const booted=useApp(s=>s.booted);
  useEffect(()=>{
    if(!booted)return;
    let cancelled=false,timer:number|undefined;
    const run=()=>{if(!cancelled)void refreshYoutubeChannelStatistics(false).catch(()=>{})};
    const arm=(delay=CHANNEL_STATS_TRIGGER_DEBOUNCE_MS)=>{window.clearTimeout(timer);timer=window.setTimeout(run,delay)};
    // One stale-only batched pass after hydration. OAuth/focus-like bursts collapse into the same pass.
    arm(750);
    const onOauthReady=()=>arm();
    window.addEventListener('vyron:oauth-state-changed',onOauthReady);
    const id=window.setInterval(run,BACKGROUND_CHANNEL_STATS_TTL_MS);
    return()=>{cancelled=true;window.clearTimeout(timer);window.clearInterval(id);window.removeEventListener('vyron:oauth-state-changed',onOauthReady)};
  },[booted]);
  return null;
}
