import {decodeLegacyInventory} from './existingInventoryCodec';
import {existingInventoryLegacyKey,loadExistingInventory,writeExistingInventory} from './existingInventoryNative';
import {verifiedLegacyInventoryRetire} from './existingInventoryLegacyRetire';

export type InventoryMigrationSummary={scanned:number;migrated:number;failed:number;removedLegacy:number;apiRequests:0;failures:Array<{channelId:string;error:string}>};
const PREFIX='vyron:existing-cache:v1:';

export async function migrateLegacyExistingInventories():Promise<InventoryMigrationSummary>{
  const out:InventoryMigrationSummary={scanned:0,migrated:0,failed:0,removedLegacy:0,apiRequests:0,failures:[]};
  if(typeof localStorage==='undefined')return out;
  const keys:string[]=[];
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(PREFIX))keys.push(key)}
  for(const key of keys){
    const channelId=key.slice(PREFIX.length);out.scanned++;
    let legacy;
    try{legacy=decodeLegacyInventory(JSON.parse(localStorage.getItem(existingInventoryLegacyKey(channelId))||'null'))}catch{}
    if(!legacy){out.failed++;out.failures.push({channelId,error:'LEGACY_INVENTORY_INVALID'});continue}
    const write=await writeExistingInventory(channelId,legacy);
    if(!write.ok){out.failed++;out.failures.push({channelId,error:`${write.errorCode||'STORAGE_WRITE_FAILED'}: ${write.error||''}`});continue}
    try{
      const verified=await loadExistingInventory(channelId);
      if(!verified||verified.updatedAt!==legacy.updatedAt)throw new Error('INVENTORY_STORAGE_READBACK_FAILED');
      if(!verifiedLegacyInventoryRetire(channelId))throw new Error('LEGACY_CACHE_REMOVE_FAILED');
      out.migrated++;out.removedLegacy++;
    }catch(error){out.failed++;out.failures.push({channelId,error:String(error)})}
  }
  return out
}
export async function hydrateExistingInventories(channelIds:string[]){
  const result={loaded:0,missing:0,corrupt:[] as Array<{channelId:string;error:string}>};
  for(const channelId of [...new Set(channelIds.filter(Boolean))]){
    try{(await loadExistingInventory(channelId))?result.loaded++:result.missing++}
    catch(error){result.corrupt.push({channelId,error:String(error)})}
  }
  return result
}
