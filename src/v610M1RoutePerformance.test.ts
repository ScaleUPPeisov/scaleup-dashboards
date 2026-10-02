import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(name:string)=>readFileSync(decodeURIComponent(new URL('./'+name,import.meta.url).pathname),'utf8');

describe('VYRON 6.1.0 M1 route pacing hotfix',()=>{
 it('hot routes do not schedule React stage commits across the first RAFs',()=>{
  for(const name of ['ProductionOS.tsx','SettingsOS.tsx','YouTubeCenter.tsx']){
   const src=read(name);
   expect(src).not.toContain('useProgressiveRouteContent');
   expect(src).not.toContain('requestAnimationFrame(');
  }
 });
 it('Production shell avoids an unconditional full-jobs subscription and leaf summaries use mutation-time cache',()=>{
  const shell=read('ProductionOS.tsx'),pipeline=read('ProductionPipelinePanel.tsx'),workspace=read('ProductionWorkspace.tsx');
  expect(shell).not.toContain('useApp(s=>s.jobs)');
  expect(shell).toContain('queueDetailsOpen||planOpen?s.jobs:EMPTY_JOBS');
  expect(pipeline).toContain('useJobDerived(s=>s.pipeline)');
  expect(workspace).toContain('useJobDerived(s=>s.workspaceByChannel)');
 });
 it('Settings uses one stable General render path with browser-native offscreen containment',()=>{
  const src=read('SettingsOS.tsx'),css=read('styles.css');
  expect(src).not.toContain('generalStage');
  expect(src).toContain('settingsDeferredCard');
  expect(css).toContain('content-visibility:auto');
  expect(css).toContain('contain-intrinsic-size:auto 190px');
 });
 it('YouTube keeps only active heavy body mounted and channel schedule facts do not subscribe to all jobs',()=>{
  const center=read('YouTubeCenter.tsx'),bar=read('YouTubeChannelBar.tsx'),publisher=read('PublisherOS.tsx');
  expect(center).toContain('{active&&<div key={tab+\':\'+activeChannel}');
  expect(center).not.toContain('routeStage');
  expect(bar).toContain('useJobDerived(s=>s.scheduleByChannel[activeId]||EMPTY_SCHEDULE)');
  expect(bar).not.toContain('s.jobs');
  expect(publisher).toContain('useJobDerived(s=>s.jobsByChannel[channelId]||EMPTY_JOBS)');
 });
 it('global Sidebar inventory calculation is not embedded in the Zustand selector',()=>{
  const src=read('App.tsx');
  expect(src).toContain('useLiveInventory(s=>s.snapshots)');
  expect(src).toContain('useMemo(()=>inventoryTotals(inventorySnapshots,channels).ready');
  expect(src).not.toContain('useLiveInventory(s=>inventoryTotals(');
 });
 it('preserves Analytics and M1 probe semantics',()=>{
  const analytics=read('AnalyticsPage.tsx'),probe=read('M1PerformanceProbe.tsx');
  expect(analytics).toContain('useStableRouteContent');
  expect(analytics).toContain('{stableRoute&&<YouTubeChannelBar/>}');
  expect(probe).toContain("const route:Page[]=['dashboard','channels','production','youtube','analytics','settings']");
  expect(probe).toContain('await timedRouteFrames(page,routeFrameTimings,3)');
  expect(probe).toContain("navigationSwitchesPerRound:30");
 });
});
