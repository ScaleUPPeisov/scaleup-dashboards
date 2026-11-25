import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';

const fixture=vi.hoisted(()=>({healthRenders:0}));
vi.mock('./SystemHealthPanel',()=>({SystemHealthPanel:()=>{fixture.healthRenders++;return <div>Состояние системы</div>}}));
vi.mock('./RpmCoverageCard',()=>({RpmCoverageCard:()=>null}));
vi.mock('./api',()=>({api:{youtubeProfiles:vi.fn().mockResolvedValue([])}}));

describe('APEX dashboard upload isolation',()=>{
 afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals()});
 it('updates upload progress without rerendering the dashboard on progress-only events',async()=>{
  vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const events=new EventTarget();
  vi.stubGlobal('window',{addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),setTimeout,clearTimeout,requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),0),cancelAnimationFrame:clearTimeout});
  const {EMPTY_STATE,useApp}=await import('./store');
  const {DashboardOS}=await import('./DashboardOS');
  const {registerUploadRuntime,applyUploadProgressFact,resetUploadTelemetryForTests}=await import('./uploadTelemetry');
  // @ts-expect-error Test renderer has no bundled TypeScript declarations.
  const {act,create}=await import('react-test-renderer');
  resetUploadTelemetryForTests();fixture.healthRenders=0;
  useApp.setState({...EMPTY_STATE,channels:[],jobs:[],booted:true});
  let view:any;
  await act(async()=>{view=create(<DashboardOS/>);await Promise.resolve()});
  await act(async()=>{registerUploadRuntime({jobId:'fixture-job',channelId:'fixture-channel',profileId:'fixture-profile',filePath:'/fixture',startedAt:new Date().toISOString()},100,10);await vi.advanceTimersByTimeAsync(150)});
  const afterStart=fixture.healthRenders;
  await act(async()=>{applyUploadProgressFact({jobId:'fixture-job',channelId:'fixture-channel',timestamp:new Date(Date.now()+1000).toISOString(),bytesUploaded:50,totalBytes:100});await vi.advanceTimersByTimeAsync(150)});
  expect(fixture.healthRenders).toBe(afterStart);
  expect(JSON.stringify(view.toJSON())).toContain('50%');
  await act(async()=>view.unmount());resetUploadTelemetryForTests();
 });
});
