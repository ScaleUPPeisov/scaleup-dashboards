import {api} from './api';

export const YOUTUBE_INVENTORY_SCHEMA_VERSION=2;
export const LEGACY_EXISTING_CACHE_PREFIX='vyron:existing-cache:v1:';
export const NATIVE_EXISTING_INDEX_PREFIX='vyron:existing-cache-index:v2:';

export type NativeInventoryEnvelope={
  schemaVersion:2;
  channelId:string;
  updatedAt:string;
  lastCompleteAt?:string;
  syncInfo:unknown;
  lastCompleteSyncInfo?:unknown;
  videos:unknown[];
  baselineDelta:Record<string,unknown>;
  lastUndo:unknown[];
};

export async function readNativeInventory(channelId:string){
  return api.youtubeInventoryRead(channelId);
}
export async function writeNativeInventory(channelId:string,payload:NativeInventoryEnvelope){
  return api.youtubeInventoryWrite(channelId,payload);
}
export async function deleteNativeInventory(channelId:string){
  return api.youtubeInventoryDelete(channelId);
}
export async function nativeInventoryDiagnostics(){
  return api.youtubeInventoryDiagnostics();
}

export function legacyExistingCacheKeys(){
  const keys:string[]=[];
  if(typeof localStorage==='undefined')return keys;
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith(LEGACY_EXISTING_CACHE_PREFIX))keys.push(key);
  }
  return keys;
}
