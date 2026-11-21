import {useEffect,useRef} from 'react';
import {hydrateExistingInventoryCaches,migrateLegacyExistingCaches} from './channelSchedule';
import {useApp} from './store';

export const EXISTING_INVENTORY_NATIVE_READY_EVENT='vyron:existing-inventory-native-ready';

export function ExistingInventoryMigrationBridge(){
  const channels=useApp(s=>s.channels),running=useRef(false),done=useRef(false);
  // App state can hydrate from 0 to 33 channels while legacy migration is
  // still running. A bare running.current guard silently lost that update.
  const pendingIds=useRef<string[]|null>(null);
  const signature=channels.map(c=>c.id).sort().join('|');
  useEffect(()=>{
    pendingIds.current=channels.map(c=>c.id);
    if(running.current)return;
    running.current=true;
    void (async()=>{
      const migration=await migrateLegacyExistingCaches();
      while(pendingIds.current!==null){
        const ids=pendingIds.current;
        pendingIds.current=null;
        const hydration=await hydrateExistingInventoryCaches(ids);
        // A newer channel roster supersedes this result. Keep draining it
        // rather than emitting a false "native ready" for 0/33 channels.
        if(pendingIds.current!==null)continue;
        done.current=true;
        window.dispatchEvent(new CustomEvent(EXISTING_INVENTORY_NATIVE_READY_EVENT,{detail:{migration,hydration,apiRequests:0}}));
      }
    })().finally(()=>{running.current=false})
  },[signature]);
  return null
}
