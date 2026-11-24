import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Channel} from './types';
const mocks=vi.hoisted(()=>({batches:vi.fn(),status:vi.fn()}));
vi.mock('./productionManagerApi',()=>({productionManagerApi:{batches:mocks.batches,status:mocks.status}}));
vi.mock('./productionPrefs',()=>({readProductionPrefs:()=>({}),resolveProductionRootFromPrefs:()=>'/other-root'}));
import {resetRenderScanOffsetsForTests,scanFactualRenderRuntime} from './renderRuntimeEvidence';
import {createProductionRenderLedger} from './productionRenderTransitions';
import {observeRuntimeRenderTransitions} from './runtimeRenderTransitions';
const channel={id:'fixture'} as Channel;

describe('render evidence completeness',()=>{
 beforeEach(()=>{mocks.batches.mockReset();mocks.status.mockReset();resetRenderScanOffsetsForTests()});
 it('treats one failed root as incomplete even when another root succeeds',async()=>{
  mocks.batches.mockImplementation(async(root:string)=>{if(root==='/other-root')throw new Error('offline');return[]});
  const evidence=await scanFactualRenderRuntime('/workspace',[channel]);
  expect(evidence.reliable).toBe(false);expect(evidence.activeJobIds.size).toBe(0)
 });
 it('treats a failed batch status as incomplete',async()=>{
  mocks.batches.mockResolvedValueOnce([{batchId:'b',status:'Running',manifestPath:'fixture'}]).mockResolvedValueOnce([]);
  mocks.status.mockRejectedValue(new Error('unavailable'));
  expect((await scanFactualRenderRuntime('/workspace',[channel])).reliable).toBe(false)
 });
 it('checks unfinished batches beyond six newer completed ones',async()=>{
  const complete=Array.from({length:6},(_,i)=>({batchId:'done'+i,status:'Completed',projectCount:1,completedProjects:1}));
  const older={batchId:'older',status:'Running',manifestPath:'older'};
  mocks.batches.mockResolvedValueOnce([...complete,older]).mockResolvedValueOnce([]);
  mocks.status.mockResolvedValue({projects:[{jobId:'j',renderStatus:'Rendering'}]});
  const evidence=await scanFactualRenderRuntime('/workspace',[channel]);
  expect(evidence.reliable).toBe(true);expect([...evidence.activeJobIds]).toEqual(['j']);expect(mocks.status).toHaveBeenCalledTimes(1)
 });
 it('marks evidence incomplete when unfinished batches exceed the six-status IO limit',async()=>{
  const batches=Array.from({length:7},(_,i)=>({batchId:'b'+i,status:'Running',manifestPath:'b'+i}));
  mocks.batches.mockResolvedValueOnce(batches).mockResolvedValueOnce([]);
  mocks.status.mockResolvedValue({projects:[]});
  const evidence=await scanFactualRenderRuntime('/workspace',[channel]);
  expect(evidence.reliable).toBe(false);expect(mocks.status).toHaveBeenCalledTimes(6)
 });
 it('rotates fairly through pending and newly completed batches without exceeding the IO limit',async()=>{
  const pending=Array.from({length:8},(_,i)=>({batchId:'p'+i,rootPath:'/pending/'+i,status:'Running',manifestPath:'p'+i}));
  const final=Array.from({length:7},(_,i)=>({batchId:'f'+i,rootPath:'/final/'+i,status:'Completed',projectCount:1,completedProjects:1,manifestPath:'f'+i}));
  mocks.batches.mockImplementation(async(root:string)=>root==='/workspace'?[...final,...pending]:[]);
  mocks.status.mockResolvedValue({projects:[]});
  const seen=new Set<string>();
  for(let i=0;i<3;i++){
   mocks.status.mockClear();
   const result=await scanFactualRenderRuntime('/workspace',[channel],()=>true);
   expect(result.reliable).toBe(false);
   expect(mocks.status).toHaveBeenCalledTimes(6);
   for(const [id] of mocks.status.mock.calls)seen.add(id);
  }
  expect(seen.size).toBe(15);
 });
 it('maintains independent rotation for different channels',async()=>{
  const batches=Array.from({length:8},(_,i)=>({batchId:'p'+i,rootPath:'/p/'+i,status:'Running',manifestPath:'p'+i}));
  mocks.batches.mockImplementation(async(root:string)=>root==='/workspace'?batches:[]);
  mocks.status.mockResolvedValue({projects:[]});
  await scanFactualRenderRuntime('/workspace',[channel]);
  mocks.status.mockClear();
  await scanFactualRenderRuntime('/workspace',[{id:'another'} as Channel]);
  expect(mocks.status.mock.calls.map(([id])=>id)).toEqual(['p0','p1','p2','p3','p4','p5']);
 });
 it('reports active jobs only after successful roots and statuses',async()=>{
  mocks.batches.mockResolvedValueOnce([{batchId:'b',status:'Running',manifestPath:'fixture'}]).mockResolvedValueOnce([]);
  mocks.status.mockResolvedValue({projects:[{jobId:'j',renderStatus:'Rendering'}]});
  const evidence=await scanFactualRenderRuntime('/workspace',[channel]);
  expect(evidence.reliable).toBe(true);expect([...evidence.activeJobIds]).toEqual(['j'])
 });
 it('checks a just-completed batch once after an observed pending project, including after reload',async()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}};
  let ledger=createProductionRenderLedger(storage);
  ledger.observe([{rootPath:'/fixture/batch',batchId:'batch',projectId:'001',jobId:'j',phase:'NOT_READY'}]);
  ledger=createProductionRenderLedger(storage);
  const complete={batchId:'batch',rootPath:'/fixture/batch',status:'Completed',projectCount:1,completedProjects:1,manifestPath:'fixture'};
  const history={batchId:'old',rootPath:'/fixture/old',status:'Completed',projectCount:1,completedProjects:1,manifestPath:'old'};
  mocks.batches.mockResolvedValue([complete,history]);
  mocks.status.mockResolvedValue({batchId:'batch',status:'Completed',projects:[{projectId:'001',jobId:'j',renderStatus:'Completed',outputFile:'/fixture/video.mp4'}]});
  const first=await scanFactualRenderRuntime('/workspace',[channel],(root,id)=>ledger.hasPendingBatch(root,id));
  expect(mocks.status).toHaveBeenCalledTimes(1);
  expect(observeRuntimeRenderTransitions(first.rows,ledger)).toHaveLength(1);
  mocks.status.mockClear();
  const second=await scanFactualRenderRuntime('/workspace',[channel],(root,id)=>ledger.hasPendingBatch(root,id));
  expect(second.rows).toEqual([]);expect(mocks.status).not.toHaveBeenCalled();
 });
});
