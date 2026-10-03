import {api} from './api';
import {decodeInventory,decodeLegacyInventory,encodeInventory,type ExistingInventoryCache} from './existingInventoryCodec';

export type InventoryWriteResult={ok:boolean;errorCode?:'STORAGE_UNAVAILABLE'|'STORAGE_QUOTA_EXCEEDED'|'STORAGE_WRITE_FAILED'|'STORAGE_READBACK_FAILED'|'INVENTORY_STORAGE_CORRUPT';error?:string;bytes?:number};

const legacyKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
const summaryKey=(channelId:string)=>`vyron:existing-cache-index:v2:${channelId}`;
const memory=new Map<string,ExistingInventoryCache>();

function legacy(channelId:string){
  if(typeof localStorage==='undefined')return;
  try{return decodeLegacyInventory(JSON.parse(localStorage.getItem(legacyKey(channelId))||'null'))}catch{return}
}
function failure(error:unknown):InventoryWriteResult{
  const name=String((error as any)?.name||''),message=String((error as any)?.message||error||'storage write failed');
  if(/INVENTORY_STORAGE_CORRUPT/i.test(message))return{ok:false,errorCode:'INVENTORY_STORAGE_CORRUPT',error:message};
  if(name==='QuotaExceededError'||/quota/i.test(message))return{ok:false,errorCode:'STORAGE_QUOTA_EXCEEDED',error:message};
  if(/READBACK|MISMATCH/i.test(message))return{ok:false,errorCode:'STORAGE_READBACK_FAILED',error:message};
  return{ok:false,errorCode:'STORAGE_WRITE_FAILED',error:message}
}
function summary(channelId:string,cache:ExistingInventoryCache){
  if(typeof localStorage==='undefined')return;
  const now=Date.now(),scheduled=cache.videos.filter(v=>v.privacyStatus==='private'&&v.publishAt&&Date.parse(v.publishAt)>now).sort((a,b)=>Date.parse(a.publishAt!)-Date.parse(b.publishAt!));
  try{localStorage.setItem(summaryKey(channelId),JSON.stringify({storageSchemaVersion:2,channelId,updatedAt:cache.updatedAt,lastCompleteAt:cache.lastCompleteAt,scheduledVideoCount:scheduled.length,scheduledUntil:scheduled.at(-1)?.publishAt?.slice(0,10)}))}catch{}
}
export function existingInventoryLegacyKey(channelId:string){return legacyKey(channelId)}
export function readExistingInventoryMemory(channelId:string){return memory.get(channelId)||legacy(channelId)}
export async function loadExistingInventory(channelId:string){
  const cached=memory.get(channelId);if(cached)return cached;
  const native=await api.youtubeInventoryRead(channelId);
  if(native.found){
    const decoded=decodeInventory(native.payload);
    if(!decoded)throw new Error('INVENTORY_STORAGE_CORRUPT: invalid native payload');
    memory.set(channelId,decoded);summary(channelId,decoded);return decoded
  }
  const old=legacy(channelId);if(!old)return;
  const result=await writeExistingInventory(channelId,old);
  if(!result.ok)throw new Error(`${result.errorCode}: ${result.error||''}`);
  return memory.get(channelId)
}
export async function writeExistingInventory(channelId:string,input:ExistingInventoryCache):Promise<InventoryWriteResult>{
  try{
    const result=await api.youtubeInventoryWrite(channelId,encodeInventory(channelId,input));
    if(!result.verified)throw new Error('INVENTORY_STORAGE_READBACK_FAILED');
    const readback=await api.youtubeInventoryRead(channelId),decoded=readback.found?decodeInventory(readback.payload):undefined;
    if(!decoded||decoded.updatedAt!==input.updatedAt)throw new Error('INVENTORY_STORAGE_READBACK_FAILED');
    memory.set(channelId,decoded);summary(channelId,decoded);
    return{ok:true,bytes:result.bytes}
  }catch(error){return failure(error)}
}
export async function deleteExistingInventory(channelId:string){
  const result=await api.youtubeInventoryDelete(channelId);
  if(result.ok)memory.delete(channelId);
  return result
}
export function resetExistingInventoryMemoryForTests(){memory.clear()}
