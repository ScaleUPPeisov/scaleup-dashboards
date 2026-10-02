import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(name:string)=>readFileSync(decodeURIComponent(new URL('./'+name,import.meta.url).pathname),'utf8');

describe('VYRON 6.1.0 M1 route pacing hotfix',()=>{
 it('Production shell does not subscribe to the full jobs collection before detailed UI needs it',()=>{
  const src=read('ProductionOS.tsx');
  expect(src).toContain("useProgressiveRouteContent('production',3)");
  expect(src).toContain('useApp(s=>queueDetailsOpen||planOpen?s.jobs:EMPTY_JOBS)');
  expect(src).toContain("routeStage>=1&&<StableProductionPipelinePanel/>");
  expect(src).toContain("routeStage>=2&&<StableProductionWorkspace/>");
  expect(src).not.toContain("useStableRouteContent");
 });
 it('Settings mounts General cards in separate real animation-frame chunks',()=>{
  const src=read('SettingsOS.tsx');
  expect(src).toContain("useProgressiveRouteContent('settings-general',3,tab==='general')");
  expect(src).toContain('{generalStage>=1&&<section className="settingsCard vyronFilesystemCard">');
  expect(src).toContain('{generalStage>=2&&<><section className="settingsCard"><small>INTERFACE</small>');
  expect(src).toContain('{generalStage>=3&&<section className="settingsCard"><small>LOCAL AUTOMATION</small>');
 });
 it('YouTube keeps lightweight route state but removes heavy inactive DOM and mounts visible UI progressively',()=>{
  const app=read('App.tsx'),center=read('YouTubeCenter.tsx'),bar=read('YouTubeChannelBar.tsx');
  expect(app).toContain("const heavyRoute=canonical==='dashboard'||canonical==='channels';");
  expect(app).toContain('const youtubeActive=youtubeSelected;');
  expect(center).toContain("useProgressiveRouteContent('youtube',2,active)");
  expect(center).toContain('routeStage>=2&&<div key={tab+\':\'+activeChannel}');
  expect(bar).toContain('routeActive?(s.jobs||[]):EMPTY_JOBS');
  expect(bar).not.toContain('useStableRouteContent');
 });
 it('records non-gate progressive mount frame diagnostics at a 25 ms budget',()=>{
  const src=read('useProgressiveRouteContent.ts');
  expect(src).toContain('const BUDGET_MS=25');
  expect(src).toContain('[VYRON_ROUTE_MOUNT_BUDGET]');
  expect(src).toContain('requestAnimationFrame(advance)');
 });
 it('preserves the proven Analytics deferral and does not alter M1 probe semantics',()=>{
  const analytics=read('AnalyticsPage.tsx'),probe=read('M1PerformanceProbe.tsx');
  expect(analytics).toContain('useStableRouteContent');
  expect(analytics).toContain('{stableRoute&&<YouTubeChannelBar/>}');
  expect(probe).toContain("const route:Page[]=['dashboard','channels','production','youtube','analytics','settings']");
  expect(probe).toContain('await timedRouteFrames(page,routeFrameTimings,3)');
  expect(probe).toContain("navigationSwitchesPerRound:30");
 });
});
