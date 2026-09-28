import {useEffect,useRef} from 'react';
import {api} from './api';
import {useApp} from './store';
import {scanAllInventories,scanInventoryChannel} from './renderInventoryRuntime';

const WATCH_DEBOUNCE_MS=1500;
const SAFETY_RECONCILE_MS=60_000;

export function LiveInventoryBridge(){
  const booted=useApp(s=>s.booted),channels=useApp(s=>s.channels);
  const timers=useRef(new Map<string,number>());
  const rootsKey=channels.map(c=>`${c.id}:${c.enabled!==false?1:0}:${c.renderFolderPath||''}`).join('|');

  useEffect(()=>{
    if(!booted)return;
    let disposed=false,unlisten:(()=>void)|undefined,periodic:number|undefined;

    const configuredRoots=()=>useApp.getState().channels
      .filter(c=>c.enabled!==false&&Boolean(String(c.renderFolderPath||'').trim()))
      .map(c=>({channelId:c.id,path:String(c.renderFolderPath)}));

    const armWatch=async()=>{
      try{await api.inventoryWatchRoots(configuredRoots())}catch{}
    };
    const scanStartup=async()=>{
      await armWatch();
      if(!disposed)await scanAllInventories('startup');
      if(!disposed)await armWatch();
    };
    const debounce=(channelId:string)=>{
      const prior=timers.current.get(channelId);if(prior!==undefined)window.clearTimeout(prior);
      const timer=window.setTimeout(()=>{
        timers.current.delete(channelId);
        void scanInventoryChannel(channelId,'watcher');
      },WATCH_DEBOUNCE_MS);
      timers.current.set(channelId,timer)
    };
    void api.onRenderInventoryChanged(e=>{if(!disposed&&e.channelId)debounce(e.channelId)}).then(fn=>{unlisten=fn}).catch(()=>{});
    void scanStartup();

    const reconcile=async(reason:'focus'|'periodic')=>{
      if(disposed)return;
      await scanAllInventories(reason);
      if(!disposed)await armWatch()
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')void reconcile('focus')};
    const onFocus=()=>void reconcile('focus');
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onFocus);
    periodic=window.setInterval(()=>void reconcile('periodic'),SAFETY_RECONCILE_MS);

    return()=>{
      disposed=true;
      if(unlisten)unlisten();
      if(periodic!==undefined)window.clearInterval(periodic);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('focus',onFocus);
      for(const timer of timers.current.values())window.clearTimeout(timer);
      timers.current.clear()
    }
  },[booted,rootsKey]);

  return null
}
