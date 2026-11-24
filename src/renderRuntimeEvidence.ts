import {productionManagerApi,type BatchStatus} from './productionManagerApi';
import {readProductionPrefs,resolveProductionRootFromPrefs} from './productionPrefs';
import type {Channel} from './types';
export type RuntimeRenderRow={batchId:string;rootPath:string;channelId:string;status:BatchStatus;row:BatchStatus['projects'][number]};
export type RuntimeRenderEvidence={activeJobIds:Set<string>;rows:RuntimeRenderRow[];reliable:boolean;observedAtMs:number};
const scanOffsets=new Map<string,number>();
/** Bound disk work without permanently starving later batches. */
function selectFairly<T>(key:string,rows:T[],limit:number):T[]{
 if(rows.length<=limit){scanOffsets.delete(key);return rows}
 const start=(scanOffsets.get(key)||0)%rows.length;
 const selected=Array.from({length:limit},(_,index)=>rows[(start+index)%rows.length]);
 scanOffsets.set(key,(start+limit)%rows.length);
 return selected;
}
export function resetRenderScanOffsetsForTests(){scanOffsets.clear()}
export async function scanFactualRenderRuntime(workspace:string,channels:Channel[],hasPendingBatch?:(rootPath:string,batchId:string)=>boolean):Promise<RuntimeRenderEvidence>{
 const prefs=readProductionPrefs(),activeJobIds=new Set<string>(),rows:RuntimeRenderRow[]=[];
 let reliable=true;
 const activeKeys=new Set(channels.map(channel=>JSON.stringify([workspace,channel.id])));
 for(const key of scanOffsets.keys())if(!activeKeys.has(key))scanOffsets.delete(key);
 for(const channel of channels){
  const roots=[workspace,resolveProductionRootFromPrefs(prefs,channel.id,workspace)].filter((x,i,a)=>Boolean(x)&&a.indexOf(x)===i);
  let batches=[] as Awaited<ReturnType<typeof productionManagerApi.batches>>,rootSuccess=0;
  for(const root of roots){try{batches.push(...await productionManagerApi.batches(root,channel.id));rootSuccess++}catch{reliable=false}}
  if(roots.length&&rootSuccess===0)continue;
  // A batch id is only unique within its root. Preserve distinct workspaces.
  batches=[...new Map(batches.map(b=>[JSON.stringify([b.rootPath,b.batchId]),b])).values()];
  const completed=(batch:typeof batches[number])=>['Completed','Завершено'].includes(batch.status)&&batch.completedProjects>=batch.projectCount;
  const pending=batches.filter(batch=>!completed(batch));
  // Read a just-completed batch once when a persisted project was previously
  // pending. Otherwise the last transition disappears when the batch becomes
  // fully complete between polls. Old completed batches remain unscanned.
  const final=batches.filter(batch=>completed(batch)&&Boolean(batch.rootPath)&&Boolean(hasPendingBatch?.(batch.rootPath,batch.batchId)));
  const selected=selectFairly(JSON.stringify([workspace,channel.id]),[...final,...pending],6);
  if(selected.length<pending.length+final.length)reliable=false;
  for(const batch of selected){
   let status:BatchStatus;try{status=await productionManagerApi.status(batch.manifestPath)}catch{reliable=false;continue}
   for(const row of status.projects){
    rows.push({batchId:batch.batchId,rootPath:batch.rootPath,channelId:channel.id,status,row});
    if(row.jobId&&row.renderStatus==='Rendering')activeJobIds.add(row.jobId)
   }
  }
 }
 return{activeJobIds,rows,reliable,observedAtMs:Date.now()}
}
