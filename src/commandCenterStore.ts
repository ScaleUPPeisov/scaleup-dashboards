import {COMMAND_CENTER_STORAGE_KEY,type BatchPlan} from './commandCenterCore';

type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type CommandCenterStore={version:1;selectedChannelId?:string;batchPlans:Record<string,BatchPlan>;updatedAt?:string};
const EVENT='vyron-command-center';
const defaultStore=():CommandCenterStore=>({version:1,batchPlans:{}});
const browserStorage=()=>typeof localStorage==='undefined'?undefined:localStorage;
const emit=()=>{try{window.dispatchEvent(new Event(EVENT))}catch{}};

export function loadCommandCenterStore(storage:StorageLike|undefined=browserStorage()):CommandCenterStore{
  if(!storage)return defaultStore();
  try{
    const x=JSON.parse(storage.getItem(COMMAND_CENTER_STORAGE_KEY)||'null') as CommandCenterStore|null;
    if(!x||x.version!==1||!x.batchPlans||typeof x.batchPlans!=='object')return defaultStore();
    return x;
  }catch{return defaultStore()}
}

export function saveCommandCenterStore(value:CommandCenterStore,storage:StorageLike|undefined=browserStorage()){
  const next:{version:1;selectedChannelId?:string;batchPlans:Record<string,BatchPlan>;updatedAt:string}={...value,version:1,updatedAt:new Date().toISOString()};
  if(storage)storage.setItem(COMMAND_CENTER_STORAGE_KEY,JSON.stringify(next));
  emit();
  return next;
}

export function saveBatchPlan(plan:BatchPlan,storage:StorageLike|undefined=browserStorage()){
  const current=loadCommandCenterStore(storage);
  return saveCommandCenterStore({...current,selectedChannelId:plan.channelId,batchPlans:{...current.batchPlans,[plan.channelId]:plan}},storage);
}

export function clearBatchPlan(channelId:string,storage:StorageLike|undefined=browserStorage()){
  const current=loadCommandCenterStore(storage);
  const batchPlans={...current.batchPlans};delete batchPlans[channelId];
  return saveCommandCenterStore({...current,batchPlans},storage);
}

export function selectCommandCenterChannel(channelId:string,storage:StorageLike|undefined=browserStorage()){
  const current=loadCommandCenterStore(storage);
  return saveCommandCenterStore({...current,selectedChannelId:channelId},storage);
}

export function subscribeCommandCenter(cb:()=>void){
  if(typeof window==='undefined')return()=>{};
  window.addEventListener(EVENT,cb);
  return()=>window.removeEventListener(EVENT,cb);
}
