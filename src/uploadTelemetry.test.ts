import {describe,expect,it} from 'vitest';
import {advanceUploadSpeed,initialUploadSpeedState,progressFromBytes,uploadEstimate} from './uploadTelemetry';

describe('VYRON 2.1.6 live upload progress math',()=>{
 it('0 / total -> 0%',()=>expect(progressFromBytes(0,100).percent).toBe(0));
 it('50 / 100 -> 50%',()=>expect(progressFromBytes(50,100).percent).toBe(50));
 it('100 / 100 -> 100%',()=>expect(progressFromBytes(100,100).percent).toBe(100));
 it('over total clamps to 100%',()=>expect(progressFromBytes(130,100).percent).toBe(100));
 it('unknown total is indeterminate',()=>expect(progressFromBytes(50,undefined)).toMatchObject({indeterminate:true,percent:undefined}));
 it('negative/corrupt values are safe',()=>{expect(progressFromBytes(-5,100).percent).toBe(0);expect(progressFromBytes(Number.NaN,100).bytesUploaded).toBe(0);expect(progressFromBytes(10,-1).indeterminate).toBe(true)});
});

describe('VYRON 2.1.6 upload speed and ETA',()=>{
 const MB=1024*1024;
 it('single useful sample is not enough for trusted ETA',()=>{let s=initialUploadSpeedState(0);const a=advanceUploadSpeed(s,2000,10*MB);s=a.state;const e=uploadEstimate(s,10*MB,100*MB,2000,a.speedBps);expect(a.speedBps).toBeCloseTo(5*MB,0);expect(e.etaSeconds).toBeUndefined()});
 it('stable samples produce stable approximate speed and factual ETA after warmup',()=>{let s=initialUploadSpeedState(0);let speed=0;for(const [t,b] of [[2000,10],[4000,20],[6000,30]] as const){const x=advanceUploadSpeed(s,t,b*MB);s=x.state;speed=x.speedBps||0}expect(speed).toBeCloseTo(5*MB,0);const e=uploadEstimate(s,30*MB,100*MB,6000,speed);expect(e.usefulSamples).toBe(3);expect(e.etaSeconds).toBeCloseTo(14,1)});
 it('warmup under five seconds keeps ETA unknown',()=>{let s=initialUploadSpeedState(0);let speed=0;for(const [t,b] of [[1000,5],[2000,10],[4000,20]] as const){const x=advanceUploadSpeed(s,t,b*MB);s=x.state;speed=x.speedBps||0}expect(uploadEstimate(s,20*MB,100*MB,4000,speed).etaSeconds).toBeUndefined()});
 it('fewer than three useful samples keeps ETA unknown',()=>{let s=initialUploadSpeedState(0);let speed=0;for(const [t,b] of [[3000,15],[6000,30]] as const){const x=advanceUploadSpeed(s,t,b*MB);s=x.state;speed=x.speedBps||0}expect(uploadEstimate(s,30*MB,100*MB,6000,speed).etaSeconds).toBeUndefined()});
 it('speed spike is smoothed instead of replacing EMA',()=>{let s=initialUploadSpeedState(0);let x=advanceUploadSpeed(s,1000,5*MB);s=x.state;x=advanceUploadSpeed(s,2000,10*MB);s=x.state;const before=x.speedBps!;x=advanceUploadSpeed(s,3000,30*MB);expect(x.speedBps!).toBeGreaterThan(before);expect(x.speedBps!).toBeLessThan(20*MB)});
 it('no byte movement returns zero current speed and unknown ETA',()=>{let s=initialUploadSpeedState(0);let x=advanceUploadSpeed(s,2000,10*MB);s=x.state;x=advanceUploadSpeed(s,6000,10*MB);s=x.state;expect(x.speedBps).toBe(0);expect(uploadEstimate(s,10*MB,100*MB,6000,x.speedBps).etaSeconds).toBeUndefined()});
 it('slower positive samples increase ETA smoothly',()=>{let s=initialUploadSpeedState(0);let speed=0;for(const [t,b] of [[2000,20],[4000,40],[6000,60]] as const){const x=advanceUploadSpeed(s,t,b*MB);s=x.state;speed=x.speedBps||0}const fast=uploadEstimate(s,60*MB,100*MB,6000,speed).etaSeconds!;let x=advanceUploadSpeed(s,8000,62*MB);s=x.state;x=advanceUploadSpeed(s,10000,64*MB);s=x.state;const slow=uploadEstimate(s,64*MB,100*MB,10000,x.speedBps).etaSeconds!;expect(slow).toBeGreaterThan(fast)});
 it('completion always returns ETA=0 and never negative',()=>{let s=initialUploadSpeedState(0);for(const [t,b] of [[2000,20],[4000,50],[6000,100]] as const)s=advanceUploadSpeed(s,t,b*MB).state;const e=uploadEstimate(s,120*MB,100*MB,6000,s.smoothedBps);expect(e.percent).toBe(100);expect(e.etaSeconds).toBe(0);expect(e.etaSeconds).toBeGreaterThanOrEqual(0)});
});

describe('VYRON 2.1.6 multi-channel telemetry isolation',()=>{
 it('keeps ELARA identity while UI context changes and tracks Lost Highway independently',async()=>{
  const mod=await import('./uploadTelemetry');mod.resetUploadTelemetryForTests();
  mod.registerUploadRuntime({jobId:'a',projectId:'pa',channelId:'elara',profileId:'profile-elara',filePath:'/elara.mp4',startedAt:'2026-09-15T10:00:00.000Z'},100,0);
  mod.applyUploadProgressFact({jobId:'a',bytesUploaded:20,totalBytes:100,progress:20,timestamp:'2026-09-15T10:00:06.000Z',active:true});
  // A UI channel switch is deliberately absent from telemetry APIs; no mutable active-channel input exists here.
  mod.registerUploadRuntime({jobId:'b',projectId:'pb',channelId:'lost-highway',profileId:'profile-lost',filePath:'/lost.mp4',startedAt:'2026-09-15T10:00:07.000Z'},200,0);
  mod.applyUploadProgressFact({jobId:'b',bytesUploaded:60,totalBytes:200,progress:30,timestamp:'2026-09-15T10:00:13.000Z',active:true});
  const rows=mod.uploadTelemetrySnapshot().active;const a=rows.find(x=>x.jobId==='a')!,b=rows.find(x=>x.jobId==='b')!;
  expect(a.channelId).toBe('elara');expect(a.profileId).toBe('profile-elara');expect(a.percent).toBe(20);
  expect(b.channelId).toBe('lost-highway');expect(b.profileId).toBe('profile-lost');expect(b.percent).toBe(30);
 });
});
