import {describe,it,expect,vi} from 'vitest';
import {createProductionRenderLedger,type RenderObservation} from './productionRenderTransitions';
function fixture(){
 const values=new Map<string,string>();
 const storage={getItem:vi.fn((key:string)=>values.get(key)??null),setItem:vi.fn((key:string,value:string)=>{values.set(key,value)})};
 return{storage,values};
}
const row=(phase:RenderObservation['phase'],projectId='p1',patch:Partial<RenderObservation>={}):RenderObservation=>({batchId:'batch',projectId,rootPath:'/fixture',jobId:'job-'+projectId,phase,...patch});
describe('persisted production render transitions',()=>{
 it('seeds historical completion silently and never replays it after poll or restart',()=>{
  const {storage}=fixture(),first=createProductionRenderLedger(storage);
  expect(first.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
  expect(first.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(createProductionRenderLedger(storage).observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
 });
 it('emits each actual transition once and survives restart',()=>{
  const {storage}=fixture(),first=createProductionRenderLedger(storage);
  first.observe([row('NOT_READY')]);
  expect(first.observe([row('RENDERED')]).rendered).toHaveLength(1);
  expect(first.observe([row('RENDERED')]).rendered).toHaveLength(0);
  const second=createProductionRenderLedger(storage);
  expect(second.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(1);
  expect(second.observe([row('RENDERED')]).safe).toHaveLength(0);
  expect(second.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
  expect(createProductionRenderLedger(storage).observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
 });
 it('tracks separate projects and new render generations without duplicating old completions',()=>{
  const {storage}=fixture(),ledger=createProductionRenderLedger(storage);
  ledger.observe([row('NOT_READY','a',{startedAt:'one'}),row('NOT_READY','b',{startedAt:'one'})]);
  const done=ledger.observe([row('SAFE_TO_CLEAN','a',{startedAt:'one'}),row('SAFE_TO_CLEAN','b',{startedAt:'one'})]);
  expect(done.safe.map(x=>x.projectId)).toEqual(['a','b']);
  ledger.observe([row('NOT_READY','a',{startedAt:'two'})]);
  expect(ledger.observe([row('SAFE_TO_CLEAN','a',{startedAt:'two'})]).safe).toHaveLength(1);
  expect(ledger.observe([row('SAFE_TO_CLEAN','b',{startedAt:'one'})]).safe).toHaveLength(0);
 });
 it('does not treat acquired job or render metadata as a fresh generation during a running operation',()=>{
  const {storage}=fixture(),ledger=createProductionRenderLedger(storage);
  ledger.observe([row('NOT_READY','a',{jobId:null,handoffCount:0})]);
  expect(ledger.observe([row('SAFE_TO_CLEAN','a',{jobId:'job-a',startedAt:'start',handoffCount:1,outputFile:'/fixture/video'})]).safe).toHaveLength(1);
 });
 it('suppresses alerts if persistent storage is unavailable',()=>{
  const storage={getItem:()=>null,setItem:()=>{throw new Error('unavailable')}};
  const ledger=createProductionRenderLedger(storage);
  ledger.observe([row('NOT_READY')]);
  expect(ledger.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
  expect(ledger.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
 });
 it('does not regress a confirmed safe state when a background observer knows only rendered',()=>{
  const {storage}=fixture(),ledger=createProductionRenderLedger(storage);
  ledger.observe([row('NOT_READY')]);
  expect(ledger.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(1);
  const writes=storage.setItem.mock.calls.length;
  expect(ledger.observe([row('RENDERED')])).toEqual({rendered:[],safe:[]});
  expect(storage.setItem).toHaveBeenCalledTimes(writes);
  expect(ledger.observe([row('SAFE_TO_CLEAN')]).safe).toHaveLength(0);
 });
 it('ignores delayed observations of a previous handoff across observers and reload',()=>{
  const {storage}=fixture(),first=createProductionRenderLedger(storage);
  const generation=(phase:RenderObservation['phase'],count:number)=>row(phase,'a',{handoffCount:count,startedAt:`2026-11-24T10:00:0${count}Z`});
  first.observe([generation('NOT_READY',1)]);
  expect(first.observe([generation('SAFE_TO_CLEAN',1)]).safe).toHaveLength(1);
  first.observe([generation('NOT_READY',2)]);
  expect(first.observe([generation('SAFE_TO_CLEAN',2)]).safe).toHaveLength(1);
  const restored=createProductionRenderLedger(storage);
  const writes=storage.setItem.mock.calls.length;
  expect(restored.observe([generation('NOT_READY',1)])).toEqual({rendered:[],safe:[]});
  expect(restored.observe([generation('SAFE_TO_CLEAN',2)])).toEqual({rendered:[],safe:[]});
  expect(storage.setItem).toHaveBeenCalledTimes(writes);
  restored.observe([generation('NOT_READY',3)]);
  expect(restored.observe([generation('SAFE_TO_CLEAN',3)]).safe).toHaveLength(1);
 });
 it('rejects older valid render start times even without handoff counts',()=>{
  const {storage}=fixture(),ledger=createProductionRenderLedger(storage);
  const generation=(phase:RenderObservation['phase'],second:number)=>row(phase,'a',{startedAt:`2026-11-24T10:00:0${second}Z`});
  ledger.observe([generation('NOT_READY',1)]);ledger.observe([generation('SAFE_TO_CLEAN',1)]);
  ledger.observe([generation('NOT_READY',2)]);expect(ledger.observe([generation('SAFE_TO_CLEAN',2)]).safe).toHaveLength(1);
  expect(ledger.observe([generation('NOT_READY',1)])).toEqual({rendered:[],safe:[]});
  expect(ledger.observe([generation('SAFE_TO_CLEAN',2)]).safe).toHaveLength(0);
 });
 it('coalesces repeated observations and returns a batch of distinct completions once',()=>{
  const {storage}=fixture(),ledger=createProductionRenderLedger(storage);
  const waiting=Array.from({length:1000},(_,i)=>row('NOT_READY',String(i)));
  ledger.observe(waiting);
  const completed=waiting.map(x=>({...x,phase:'SAFE_TO_CLEAN' as const}));
  expect(ledger.observe(completed).safe).toHaveLength(1000);
  const writes=storage.setItem.mock.calls.length;
  for(let i=0;i<5;i++)expect(ledger.observe(completed).safe).toHaveLength(0);
  expect(storage.setItem).toHaveBeenCalledTimes(writes);
 });
 it('indexes pending batches across reload and clears them only after every project completes',()=>{
  const {storage}=fixture(),ledger=createProductionRenderLedger(storage);
  ledger.observe([row('NOT_READY','a'),row('NOT_READY','b')]);
  expect(ledger.hasPendingBatch('/fixture','batch')).toBe(true);
  const restored=createProductionRenderLedger(storage);
  expect(restored.hasPendingBatch('/fixture','batch')).toBe(true);
  expect(restored.hasPendingBatch('/different','batch')).toBe(false);
  restored.observe([row('RENDERED','a')]);
  expect(restored.hasPendingBatch('/fixture','batch')).toBe(true);
  restored.observe([row('SAFE_TO_CLEAN','b')]);
  expect(restored.hasPendingBatch('/fixture','batch')).toBe(false);
 });
});
