import React,{useEffect} from 'react';
import {useApp} from './store';
import {maybeRunDailyChannelRunway} from './channelRunwayStore';

export function ChannelRunwayScheduler(){
  const channels=useApp(s=>s.channels);
  const signature=channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.scheduleMode||''}:${c.publishIntervalDays||''}:${c.publishDays||''}:${c.pauseDays||''}:${c.patternAnchorDate||''}:${c.youtubeProfileId||''}`).join('|');
  useEffect(()=>{
    const tick=()=>{try{void maybeRunDailyChannelRunway(channels,new Date())}catch(error){useApp.getState().log(`CHANNEL_RUNWAY_SCHEDULER_ERROR • ${String(error)}`,'error')}};
    tick();
    const id=window.setInterval(tick,60_000);
    return()=>window.clearInterval(id);
  },[signature]);
  return null;
}
