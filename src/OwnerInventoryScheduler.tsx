import {useEffect} from 'react';
import {hydrateOwnerInventoryFromCache,refreshOwnerInventorySmart} from './ownerInventoryRuntime';

export function OwnerInventoryScheduler(){
 useEffect(()=>{
  let cancelled=false,timer:number|undefined;
  const hydrate=()=>{if(!cancelled)hydrateOwnerInventoryFromCache()};
  const run=()=>{if(!cancelled)void refreshOwnerInventorySmart(false).catch(()=>{})};
  hydrate();
  timer=window.setTimeout(run,1800);
  const onCache=()=>hydrate();
  const onOauth=()=>{hydrate();window.setTimeout(run,500)};
  window.addEventListener('vyron-channel-schedule-changed',onCache);
  window.addEventListener('vyron:oauth-state-changed',onOauth);
  const interval=window.setInterval(run,15*60_000);
  return()=>{cancelled=true;if(timer)window.clearTimeout(timer);window.clearInterval(interval);window.removeEventListener('vyron-channel-schedule-changed',onCache);window.removeEventListener('vyron:oauth-state-changed',onOauth)}
 },[]);
 return null
}
