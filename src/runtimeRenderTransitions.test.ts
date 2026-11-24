import {describe,expect,it} from 'vitest';
import {createProductionRenderLedger} from './productionRenderTransitions';
import {observeRuntimeRenderTransitions} from './runtimeRenderTransitions';
import type {RuntimeRenderRow} from './renderRuntimeEvidence';

function storage(){
 const values=new Map<string,string>();
 return{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}};
}
function row(renderStatus:string,outputFile?:string):RuntimeRenderRow{
 const project={projectId:'001',jobId:'job',renderStatus,outputFile};
 return{rootPath:'/fixture/batch',batchId:'batch',channelId:'channel',status:{batchId:'batch',status:'Running',projects:[project]},row:project};
}

describe('background render transitions',()=>{
 it('emits once when a pending project acquires its output path and survives reload',()=>{
  const disk=storage();let ledger=createProductionRenderLedger(disk);
  expect(observeRuntimeRenderTransitions([row('Rendering')],ledger)).toEqual([]);
  expect(ledger.hasPendingBatch('/fixture/batch','batch')).toBe(true);
  ledger=createProductionRenderLedger(disk);
  expect(ledger.hasPendingBatch('/fixture/batch','batch')).toBe(true);
  const completed=row('Completed','/fixture/video.mp4');
  expect(observeRuntimeRenderTransitions([completed],ledger)).toHaveLength(1);
  expect(ledger.hasPendingBatch('/fixture/batch','batch')).toBe(false);
  expect(observeRuntimeRenderTransitions([completed,completed],ledger)).toEqual([]);
  expect(observeRuntimeRenderTransitions([completed],createProductionRenderLedger(disk))).toEqual([]);
 });
 it('does not replay a transition already observed by the production page',()=>{
  const ledger=createProductionRenderLedger(storage());
  observeRuntimeRenderTransitions([row('Rendering')],ledger);
  const completed={batchId:'batch',projectId:'001',rootPath:'/fixture/batch',jobId:'job',outputFile:'/fixture/video.mp4',phase:'SAFE_TO_CLEAN' as const};
  expect(ledger.observe([completed]).safe).toHaveLength(1);
  expect(observeRuntimeRenderTransitions([row('Completed',completed.outputFile)],ledger)).toEqual([]);
 });
 it('seeds historical completion without a notification and deduplicates duplicate rows',()=>{
  const ledger=createProductionRenderLedger(storage()),complete=row('Completed','/fixture/video.mp4');
  expect(observeRuntimeRenderTransitions([complete,complete],ledger)).toEqual([]);
  const next=createProductionRenderLedger(storage());
  observeRuntimeRenderTransitions([row('Rendering')],next);
  expect(observeRuntimeRenderTransitions([complete,complete],next)).toHaveLength(1);
 });
});
