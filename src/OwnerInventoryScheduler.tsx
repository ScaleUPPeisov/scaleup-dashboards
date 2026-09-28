import {useEffect} from 'react';
import {useApp} from './store';
import {OWNER_INVENTORY_TTL_MS,refreshStaleOwnerInventories} from './youtubeOwnerInventory';

export function OwnerInventoryScheduler(){
  const booted=useApp(s=>s.booted);
  useEffect(()=>{
    if(!booted)return;
    let cancelled=false,timer:number|undefined;
    const run=()=>{if(cancelled)return;void refreshStaleOwnerInventories(useApp.getState().channels,false).catch(()=>{})};
    timer=window.setTimeout(run,2500);
    const onOauth=()=>{window.clearTimeout(timer);timer=window.setTimeout(run,1500)};
    window.addEventListener('vyron:oauth-state-changed',onOauth);
    const id=window.setInterval(run,OWNER_INVENTORY_TTL_MS);
    return()=>{cancelled=true;window.clearTimeout(timer);window.clearInterval(id);window.removeEventListener('vyron:oauth-state-changed',onOauth)}
  },[booted]);
  return null
}
