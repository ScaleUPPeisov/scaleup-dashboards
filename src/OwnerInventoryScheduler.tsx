import {useEffect} from 'react';
import {useApp} from './store';
import {OWNER_INVENTORY_TTL_MS,refreshStaleOwnerInventories} from './youtubeOwnerInventory';

export const OWNER_INVENTORY_COLD_START_DELAY_MS=125_000;
export const OWNER_INVENTORY_OAUTH_DEBOUNCE_MS=5_000;

export function OwnerInventoryScheduler(){
  const booted=useApp(s=>s.booted);
  useEffect(()=>{
    if(!booted)return;
    let cancelled=false,timer:number|undefined;
    const startedAt=Date.now();
    const run=()=>{if(cancelled)return;void refreshStaleOwnerInventories(useApp.getState().channels,false).catch(()=>{})};
    const arm=(delay:number)=>{window.clearTimeout(timer);timer=window.setTimeout(run,Math.max(0,delay))};
    // Heavy owner-inventory sync can paginate through many videos. Never let it consume the
    // first-two-minute cold-start budget; cached snapshots remain immediately available.
    arm(OWNER_INVENTORY_COLD_START_DELAY_MS);
    const onOauth=()=>{
      const coldStartRemaining=OWNER_INVENTORY_COLD_START_DELAY_MS-(Date.now()-startedAt);
      arm(Math.max(OWNER_INVENTORY_OAUTH_DEBOUNCE_MS,coldStartRemaining));
    };
    window.addEventListener('vyron:oauth-state-changed',onOauth);
    const id=window.setInterval(run,OWNER_INVENTORY_TTL_MS);
    return()=>{cancelled=true;window.clearTimeout(timer);window.clearInterval(id);window.removeEventListener('vyron:oauth-state-changed',onOauth)}
  },[booted]);
  return null
}
