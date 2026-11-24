import type {RuntimeRenderRow} from './renderRuntimeEvidence';
import type {RenderObservation} from './productionRenderTransitions';

type Ledger={observe:(rows:RenderObservation[])=>{rendered:RenderObservation[];safe:RenderObservation[]}};
export const runtimeRenderIdentity=(x:{rootPath:string;batchId:string;projectId:string})=>JSON.stringify([x.rootPath,x.batchId,x.projectId]);

/** Record a coherent scan once; return only first, persisted transitions. */
export function observeRuntimeRenderTransitions(rows:RuntimeRenderRow[],ledger:Ledger){
 const observations:RenderObservation[]=rows.filter(x=>Boolean(x.rootPath&&x.row.projectId)).map(({batchId,rootPath,row})=>({
  batchId,rootPath,projectId:row.projectId,jobId:row.jobId,startedAt:row.startedAt,
  handoffSentAt:row.handoffSentAt,handoffCount:row.handoffCount,outputFile:row.outputFile,
  phase:row.renderStatus==='Completed'&&row.outputFile?'RENDERED':'NOT_READY'
 }));
 const transitions=ledger.observe(observations),pending=new Set(transitions.rendered.map(runtimeRenderIdentity));
 const rendered:RuntimeRenderRow[]=[];
 for(const item of rows){
  const id=runtimeRenderIdentity({rootPath:item.rootPath,batchId:item.batchId,projectId:item.row.projectId});
  if(pending.delete(id))rendered.push(item);
 }
 return rendered;
}
