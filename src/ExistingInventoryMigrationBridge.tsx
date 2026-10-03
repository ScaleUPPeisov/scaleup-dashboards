import {useEffect,useRef} from 'react';
import {hydrateExistingInventoryCaches,migrateLegacyExistingCaches} from './channelSchedule';
import {useApp} from './store';

export const EXISTING_INVENTORY_NATIVE_READY_EVENT='vyron:existing-inventory-native-ready';

export function ExistingInventoryMigrationBridge(){
  const channels=useApp(s=>s.channels),running=useRef(false),done=useRef(false);
  const signature=channels.map(c=>c.id).sort().join('|');
  useEffect(()=>{
    if(running.current)return;
    running.current=true;
    void (async()=>{
      const migration=await migrateLegacyExistingCaches();
      const hydration=await hydrateExistingInventoryCaches(channels.map(c=>c.id));
      done.current=true;
      window.dispatchEvent(new CustomEvent(EXISTING_INVENTORY_NATIVE_READY_EVENT,{detail:{migration,hydration,apiRequests:0}}));
    })().finally(()=>{running.current=false})
  },[signature]);
  return null
}
