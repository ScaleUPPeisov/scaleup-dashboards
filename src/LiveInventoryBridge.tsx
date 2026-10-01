import {useEffect,useRef} from 'react';
import {api} from './api';
import {useApp} from './store';
import {refreshInventoryUploadCounts,scanAllInventories,scanInventoryChannel} from './renderInventoryRuntime';
import {subscribeUploadTelemetry} from './uploadTelemetry';
import {isMaterialsInventoryPaused} from './materialsPerfDiag';

const WATCH_DEBOUNCE_MS=1500;
const SAFETY_RECONCILE_MS=15*60_000;
const FOCUS_RESCAN_MIN_MS=5*60_000;
const INITIAL_SCAN_DELAY_MS=900;
const FOCUS_SCAN_DELAY_MS=350;

export function LiveInventoryBridge(){
  const booted=useApp(s=>s.booted),channels=useApp(s=>s.channels);
  const timers=useRef(new Map<string,number>());
  const rootsKey=channels.map(c=>`${c.id}:${c.enabled!==false?1:0}:${c.renderFolderPath||''}`).join('|');

  useEffect(()=>{
    if(!booted)return;
    let disposed=false,unlisten:(()=>void)|undefined,periodic:number|undefined,focusTimer:number|undefined,lastFullScanAt=0;
    const offUploads=subscribeUploadTelemetry(()=>refreshInventoryUploadCounts());

    const configuredRoots=()=>useApp.getState().channels
      .filter(c=>c.enabled!==false&&Boolean(String(c.renderFolderPath||'').trim()))
      .map(c=>({channelId:c.id,path:String(c.renderFolderPath)}));

    const armWatch=async()=>{
      try{await api.inventoryWatchRoots(configuredRoots())}catch{}
    };
    const scanStartup=async()=>{
      if(isMaterialsInventoryPaused())return;
      await armWatch();
      await new Promise<void>(resolve=>window.setTimeout(resolve,INITIAL_SCAN_DELAY_MS));
      if(!disposed&&!isMaterialsInventoryPaused()){lastFullScanAt=Date.now();await scanAllInventories('startup')}
      if(!disposed)await armWatch();
    };
    const debounce=(channelId:string)=>{
      if(isMaterialsInventoryPaused())return;
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
      if(disposed||isMaterialsInventoryPaused())return;
      const now=Date.now();
      if(reason==='focus'&&now-lastFullScanAt<FOCUS_RESCAN_MIN_MS)return;
      lastFullScanAt=now;
      await scanAllInventories(reason);
      if(!disposed)await armWatch()
    };
    const scheduleFocusReconcile=()=>{
      if(disposed)return;
      if(focusTimer!==undefined)window.clearTimeout(focusTimer);
      focusTimer=window.setTimeout(()=>{focusTimer=undefined;void reconcile('focus')},FOCUS_SCAN_DELAY_MS)
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')scheduleFocusReconcile()};
    const onFocus=()=>scheduleFocusReconcile();
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onFocus);
    periodic=window.setInterval(()=>void reconcile('periodic'),SAFETY_RECONCILE_MS);

    return()=>{
      disposed=true;
      if(unlisten)unlisten();
      offUploads();
      if(periodic!==undefined)window.clearInterval(periodic);
      if(focusTimer!==undefined)window.clearTimeout(focusTimer);
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('focus',onFocus);
      for(const timer of timers.current.values())window.clearTimeout(timer);
      timers.current.clear()
    }
  },[booted,rootsKey]);

  return null
}
