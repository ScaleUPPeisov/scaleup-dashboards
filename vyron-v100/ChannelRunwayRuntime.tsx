import {useEffect} from 'react';
import {useApp} from './store';
import {channelSignature,nextKrasnoyarskSixAt,readChannelRunwayState,recalculateChannelRunway,shouldRunDailyChannelRunway} from './channelRunway';

export function ChannelRunwayRuntime(){
 const channels=useApp(s=>s.channels);const signature=channelSignature(channels);
 useEffect(()=>{
  let timer=0;
  const recalcIfNeeded=()=>{const state=readChannelRunwayState();if(shouldRunDailyChannelRunway(state,channels,new Date()))recalculateChannelRunway(channels,new Date())};
  const arm=()=>{if(timer)window.clearTimeout(timer);const at=nextKrasnoyarskSixAt(new Date());const ms=Math.max(1000,at.getTime()-Date.now()+750);timer=window.setTimeout(()=>{recalculateChannelRunway(channels,new Date());arm()},ms)};
  const onVisible=()=>{if(document.visibilityState==='visible'){recalcIfNeeded();arm()}};
  recalcIfNeeded();arm();document.addEventListener('visibilitychange',onVisible);
  return()=>{if(timer)window.clearTimeout(timer);document.removeEventListener('visibilitychange',onVisible)};
 },[signature]);
 return null;
}
