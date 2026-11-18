import type {ProductionBuildRuntimeSnapshot} from './productionManagerApi';

/**
 * Historical persisted batches are intentionally excluded: only completion of a
 * real in-process build can be surfaced as a newly finished batch.
 */
export function shouldDisplayLiveBatch(task:ProductionBuildRuntimeSnapshot|null,alreadyShown:ReadonlySet<string>):boolean{
  const id=task?.result?.batch?.batchId;
  return Boolean(task?.state==='COMPLETED'&&id&&!alreadyShown.has(id));
}
export function shouldReconcileLiveBatch(task:ProductionBuildRuntimeSnapshot|null,batchId:string,alreadyReconciled:ReadonlySet<string>):boolean{
  return Boolean(batchId&&task?.state==='COMPLETED'&&task.result?.batch?.batchId===batchId&&!alreadyReconciled.has(batchId));
}
