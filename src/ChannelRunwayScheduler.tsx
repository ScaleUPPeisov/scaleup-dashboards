import React,{useEffect} from 'react';
import {useApp} from './store';
import {maybeRunDailyChannelRunway,recalculateChannelRunway} from './channelRunwayStore';
import {EXISTING_INVENTORY_NATIVE_READY_EVENT} from './ExistingInventoryMigrationBridge';

export function ChannelRunwayScheduler(){
  const signature=useApp(s=>s.channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.scheduleMode||''}:${c.publishIntervalDays||''}:${c.publishDays||''}:${c.pauseDays||''}:${c.patternAnchorDate||''}:${c.youtubeProfileId||''}`).join('|'));
  useEffect(()=>{
    const tick=()=>{try{void maybeRunDailyChannelRunway(useApp.getState().channels,new Date())}catch(error){useApp.getState().log(`CHANNEL_RUNWAY_SCHEDULER_ERROR • ${String(error)}`,'error')}};
    tick();
    // A daily-run marker can already be set when VYRON 6.1.26 starts. In that
    // case the periodic scheduler intentionally skips another calculation.
    // Independently reconcile the persisted v2 records to v3 *after* native
    // inventories have been hydrated, without touching YouTube or any secrets.
    const nativeReady=()=>{
      try{recalculateChannelRunway(useApp.getState().channels,new Date(),false)}
      catch(error){useApp.getState().log('CHANNEL_RUNWAY_NATIVE_RECALC_ERROR • '+String(error),'error')}
    };
    window.addEventListener(EXISTING_INVENTORY_NATIVE_READY_EVENT,nativeReady);
    const id=window.setInterval(tick,60_000);
    return()=>{window.clearInterval(id);window.removeEventListener(EXISTING_INVENTORY_NATIVE_READY_EVENT,nativeReady)};
  },[signature]);
  return null;
}
