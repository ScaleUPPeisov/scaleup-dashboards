import {useEffect} from 'react';
import {hydrateYoutubeOwnerInventoryFromCache,OWNER_INVENTORY_TTL_MS,refreshYoutubeOwnerInventory} from './youtubeOwnerInventory';

export function YoutubeOwnerInventoryScheduler(){
  useEffect(()=>{
    let cancelled=false,timer:number|undefined;
    const run=()=>{if(!cancelled)void refreshYoutubeOwnerInventory(false).catch(()=>{})};
    hydrateYoutubeOwnerInventoryFromCache();
    timer=window.setTimeout(run,1200);
    const onOauth=()=>run();
    const onCache=()=>hydrateYoutubeOwnerInventoryFromCache();
    window.addEventListener('vyron:oauth-state-changed',onOauth);
    window.addEventListener('vyron-channel-schedule-changed',onCache);
    const id=window.setInterval(run,OWNER_INVENTORY_TTL_MS);
    return()=>{cancelled=true;if(timer)window.clearTimeout(timer);window.clearInterval(id);window.removeEventListener('vyron:oauth-state-changed',onOauth);window.removeEventListener('vyron-channel-schedule-changed',onCache)}
  },[]);
  return null
}
