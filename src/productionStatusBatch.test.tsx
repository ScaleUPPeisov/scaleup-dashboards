import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {VideoJob} from './types';

const fixture=vi.hoisted(()=>({rows:[] as any[],notify:vi.fn()}));
vi.mock('./renderRuntimeEvidence',()=>({scanFactualRenderRuntime:vi.fn(async()=>({rows:fixture.rows,reliable:false,activeJobIds:new Set(),observedAtMs:1}))}));
vi.mock('./runtimeRenderTransitions',()=>({observeRuntimeRenderTransitions:(rows:unknown[])=>rows,runtimeRenderIdentity:(x:{rootPath:string;batchId:string;projectId:string})=>JSON.stringify([x.rootPath,x.batchId,x.projectId])}));
vi.mock('./productionRenderTransitions',()=>({productionRenderLedger:()=>({hasPendingBatch:()=>false})}));
vi.mock('./renderScanScheduler',()=>({createRenderScanScheduler:({scan}:{scan:()=>Promise<void>})=>({request:()=>void scan(),pause:()=>{},stop:()=>{},visibilityChanged:()=>{}})}));
vi.mock('./notificationCenter',()=>({notifySuccess:fixture.notify,notifyError:vi.fn(),notifyWarning:vi.fn()}));
vi.mock('./activeOperationFacts',()=>({replaceFactualActiveRenders:()=>{},setRenderMonitoringExpected:()=>{},invalidateRenderFacts:()=>{}}));
vi.mock('./api',()=>({api:{openLocal:vi.fn()}}));

import {EMPTY_STATE,useApp} from './store';
import {ProductionStatusBridge} from './ProductionStatusBridge';

afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();fixture.notify.mockClear()});

describe('production render scan batching',()=>{
 it('publishes hundreds of completed projects with one jobs update and one grouped notification',async()=>{
  vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const doc=new EventTarget();Object.defineProperty(doc,'visibilityState',{value:'visible'});
  vi.stubGlobal('document',doc);vi.stubGlobal('window',{setTimeout,clearTimeout});
  const jobs=Array.from({length:200},(_,i)=>({id:`job-${i}`,channelId:'channel',number:i+1,status:'RENDERING',folder:'/fixture',createdAt:'2026-01-01T00:00:00Z',title:'',description:'',tracksCount:1,minTracks:1,tags:[]} as VideoJob));
  fixture.rows=jobs.map((job,i)=>({rootPath:'/fixture',batchId:'batch',channelId:'channel',row:{jobId:job.id,projectId:`project-${i}`,renderStatus:'Completed',outputFile:`/fixture/${i}.mp4`}}));
  useApp.setState({...EMPTY_STATE,booted:true,settings:{...EMPTY_STATE.settings,workspace:'/fixture'},channels:[{id:'channel',name:'Канал'} as any],jobs,activityJournal:[]});
  let jobUpdates=0,journalUpdates=0;
  const off=useApp.subscribe((next,previous)=>{if(next.jobs!==previous.jobs)jobUpdates++;if(next.activityJournal!==previous.activityJournal)journalUpdates++});
  // @ts-expect-error Test renderer has no bundled TypeScript declarations.
  const {act,create}=await import('react-test-renderer');let view:any;
  await act(async()=>{view=create(<ProductionStatusBridge/>);await Promise.resolve();await Promise.resolve();await Promise.resolve()});
  expect(useApp.getState().jobs.every(job=>job.status==='READY_UPLOAD')).toBe(true);
  expect(useApp.getState().activityJournal).toHaveLength(200);
  expect(jobUpdates).toBe(1);expect(journalUpdates).toBe(1);
  expect(fixture.notify).toHaveBeenCalledTimes(1);
  expect(fixture.notify.mock.calls[0][0]).toBe('Рендер готов: 200 проектов');
  await act(async()=>view.unmount());off();
 });
});
