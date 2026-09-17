import React,{useEffect} from 'react';
import {useApp} from './store';
import {maybeRunDailyChannelRunway} from './channelRunwayStore';

export function ChannelRunwayScheduler(){
  const channels=useApp(s=>s.channels);
  const signature=channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.cadenceDays}:${c.youtubeProfileId||''}`).join('|');
  useEffect(()=>{
    const tick=()=>{void maybeRunDailyChannelRunway(channels,new Date())};
    tick();
    const id=window.setInterval(tick,60_000);
    return()=>window.clearInterval(id);
  },[signature]);
  return null;
}
