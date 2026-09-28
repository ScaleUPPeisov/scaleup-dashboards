import {useEffect} from 'react';
import {useApp} from './store';
import {OWNER_INVENTORY_TTL_MS,refreshStaleOwnerInventories} from './youtubeOwnerInventory';

const STARTUP_DELAY_MS=3500;
const RECHECK_MS=Math.max(5*60*1000,Math.floor(OWNER_INVENTORY_TTL_MS/2));

export function OwnerInventoryBridge(){
  const booted=useApp(s=>s.booted);
  const signature=useApp(s=>s.channels.map(c=>[
    c.id,
    c.enabled!==false?'1':'0',
    c.youtubeProfileId||'',
    c.youtubeChannelId||''
  ].join(':')).join('|'));

  useEffect(()=>{
    if(!booted)return;
    let disposed=false;
    const refresh=()=>{if(!disposed)void refreshStaleOwnerInventories(false)};
    const startup=window.setTimeout(refresh,STARTUP_DELAY_MS);
    const periodic=window.setInterval(refresh,RECHECK_MS);
    const onVisible=()=>{if(document.visibilityState==='visible')refresh()};
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('online',refresh);
    return()=>{
      disposed=true;
      window.clearTimeout(startup);
      window.clearInterval(periodic);
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('online',refresh)
    }
  },[booted,signature]);

  return null
}
