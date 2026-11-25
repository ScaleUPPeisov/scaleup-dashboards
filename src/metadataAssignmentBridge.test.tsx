import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Channel,VideoJob} from './types';

const mocks=vi.hoisted(()=>({summary:vi.fn(),reserve:vi.fn()}));
vi.mock('./api',()=>({api:{metadataQueueSummary:mocks.summary,metadataQueueReserveBatch:mocks.reserve}}));
import {EMPTY_STATE,useApp} from './store';
import {MetadataQueueAssignmentBridge,notifyMetadataQueueChanged} from './MetadataQueueAssignmentBridge';

const channel={id:'channel',name:'Fixture'} as Channel;
const job:VideoJob={id:'job',channelId:'channel',number:1,folder:'/fixture/one',status:'READY_RENDER',createdAt:'2026-01-01T00:00:00Z',tracksCount:0,minTracks:1,title:'',description:'',tags:[]};
function browser(){
 const events=new EventTarget();
 const win={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),setTimeout,clearTimeout};
 vi.stubGlobal('window',win);
 if(typeof globalThis.CustomEvent==='undefined')vi.stubGlobal('CustomEvent',class<T> extends Event{detail:T|undefined;constructor(name:string,init?:{detail?:T}){super(name);this.detail=init?.detail}});
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
}

describe('metadata assignment bridge',()=>{
 beforeEach(()=>{
  vi.useFakeTimers();browser();mocks.summary.mockReset();mocks.reserve.mockReset();
  mocks.summary.mockResolvedValue({available:1});mocks.reserve.mockResolvedValue([]);
  useApp.setState({...EMPTY_STATE,channels:[channel],jobs:[job],booted:true});
 });
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals()});
 it('does not rerun queue work for progress-only updates, but retries a changed path or queue',async()=>{
  // @ts-expect-error Test renderer is a development-only dependency without bundled types.
  const {act,create}=await import('react-test-renderer');
  let renderer:any;
  await act(async()=>{renderer=create(<MetadataQueueAssignmentBridge/>)});
  await act(async()=>{await vi.advanceTimersByTimeAsync(220)});
  expect(mocks.summary).toHaveBeenCalledTimes(1);expect(mocks.reserve).toHaveBeenCalledTimes(1);
  await act(async()=>{useApp.setState({jobs:[{...job,uploadProgress:10}]});await vi.advanceTimersByTimeAsync(1000)});
  expect(mocks.summary).toHaveBeenCalledTimes(1);
  await act(async()=>{useApp.setState({jobs:[{...job,folder:'/fixture/two'}]});await vi.advanceTimersByTimeAsync(220)});
  expect(mocks.summary).toHaveBeenCalledTimes(2);
  await act(async()=>{notifyMetadataQueueChanged();await vi.advanceTimersByTimeAsync(220)});
  expect(mocks.summary).toHaveBeenCalledTimes(3);
  await act(async()=>{renderer.unmount()});
 });
 it('retries the latest input after an in-flight queue read settles',async()=>{
  // @ts-expect-error Test renderer is a development-only dependency without bundled types.
  const {act,create}=await import('react-test-renderer');
  let finish!:(value:{available:number})=>void;
  mocks.summary.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
  let renderer:any;
  await act(async()=>{renderer=create(<MetadataQueueAssignmentBridge/>)});
  await act(async()=>{await vi.advanceTimersByTimeAsync(220)});
  await act(async()=>{useApp.setState({jobs:[{...job,folder:'/fixture/two'}]});await vi.advanceTimersByTimeAsync(220)});
  expect(mocks.summary).toHaveBeenCalledTimes(1);
  await act(async()=>{finish({available:0});await Promise.resolve();await vi.advanceTimersByTimeAsync(80)});
  expect(mocks.summary).toHaveBeenCalledTimes(2);
  await act(async()=>{renderer.unmount()});
 });
});
