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
 const transitions=ledger.observe(observations),pending=new Map(transitions.rendered.map(x=>[runtimeRenderIdentity(x),x]));
 const rendered:RuntimeRenderRow[]=[];
 for(const item of rows){
  const id=runtimeRenderIdentity({rootPath:item.rootPath,batchId:item.batchId,projectId:item.row.projectId});
  const observed=pending.get(id);
  // A duplicate earlier row may still say Rendering or refer to an old
  // output. Notify only for the completed observation the ledger accepted.
  if(observed&&item.row.renderStatus==='Completed'&&item.row.outputFile&&item.row.outputFile===observed.outputFile&&item.row.jobId===observed.jobId&&item.row.startedAt===observed.startedAt&&item.row.handoffSentAt===observed.handoffSentAt&&item.row.handoffCount===observed.handoffCount){pending.delete(id);rendered.push(item)}
 }
 return rendered;
}
