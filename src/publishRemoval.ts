import type {ImportedMetadata} from './metadata';

export type PublishRemovalRepair={selectedIds:string[];rows:ImportedMetadata[]};
export function removeSelectedPublishItems(selectedIds:string[],selectedOrder:string[],rows:ImportedMetadata[],removedIds:string[]):PublishRemovalRepair{
 const removed=new Set(removedIds),indices=new Set<number>();
 selectedOrder.forEach((id,i)=>{if(removed.has(id))indices.add(i)});
 return {
  selectedIds:selectedIds.filter(id=>!removed.has(id)),
  rows:rows.filter((_,i)=>!indices.has(i)),
 };
}
