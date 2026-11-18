import {useEffect,useRef} from 'react';
import {api} from './api';
import {useApp} from './store';
import {refreshInventoryUploadCounts,scanInventoryChannel,useLiveInventory} from './renderInventoryRuntime';
import {subscribeUploadTelemetry} from './uploadTelemetry';

const WATCH_DEBOUNCE_MS=1500;
const SAFETY_RECONCILE_MS=15*60_000;
const FOCUS_SCAN_DELAY_MS=350;

export function LiveInventoryBridge(){
  const booted=useApp(s=>s.booted),channels=useApp(s=>s.channels);
  const timers=useRef(new Map<string,number>());
  const rootsKey=channels.map(c=>`${c.id}:${c.enabled!==false?1:0}:${c.renderFolderPath||''}`).join('|');

  useEffect(()=>{
    if(!booted)return;
    let disposed=false,unlisten:(()=>void)|undefined,periodic:number|undefined,focusTimer:number|undefined;
    const offUploads=subscribeUploadTelemetry(()=>refreshInventoryUploadCounts());

    const configuredRoots=()=>useApp.getState().channels
      .filter(c=>c.enabled!==false&&Boolean(String(c.renderFolderPath||'').trim()))
      .map(c=>({channelId:c.id,path:String(c.renderFolderPath)}));

    const armWatch=async()=>{
      try{await api.inventoryWatchRoots(configuredRoots())}catch{}
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
    // Cached snapshots render immediately. Watchers and explicit user actions
    // are the normal refresh path; startup never walks every channel/HDD.
    void armWatch();
    refreshInventoryUploadCounts();

    const reconcileOfflineRoots=async()=>{
      if(disposed)return;
      const snapshots=useLiveInventory.getState().snapshots;
      const offline=configuredRoots().filter(x=>snapshots[x.channelId]?.folderState==='OFFLINE');
      for(const row of offline){
        if(disposed)return;
        await scanInventoryChannel(row.channelId,'reconnect');
      }
      if(!disposed)await armWatch();
    };
    const scheduleFocusReconcile=()=>{
      if(disposed)return;
      if(focusTimer!==undefined)window.clearTimeout(focusTimer);
      focusTimer=window.setTimeout(()=>{focusTimer=undefined;void armWatch()},FOCUS_SCAN_DELAY_MS)
    };
    const onVisibility=()=>{if(document.visibilityState==='visible')scheduleFocusReconcile()};
    const onFocus=()=>scheduleFocusReconcile();
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onFocus);
    periodic=window.setInterval(()=>void reconcileOfflineRoots(),SAFETY_RECONCILE_MS);

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
