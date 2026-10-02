import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(name:string)=>readFileSync(decodeURIComponent(new URL('./'+name,import.meta.url).pathname),'utf8');

describe('VYRON 6.1.0 M1 route pacing hotfix',()=>{
 it('Production defers secondary overview work and scopes live inventory to the selected channel',()=>{
  const src=read('ProductionOS.tsx');
  expect(src).toContain('useStableRouteContent');
  expect(src).toContain("useLiveInventory(s=>channelId?s.snapshots[channelId]:undefined)");
  expect(src).toContain("section==='overview'&&stableRoute&&<StableProductionPipelinePanel/>");
  expect(src).toContain("stableRoute&&<StableProductionWorkspace/>");
  expect(src).toContain('[projectRoot,stableRoute]');
 });
 it('Settings renders the visible workspace card before deferred secondary general cards',()=>{
  const src=read('SettingsOS.tsx');
  expect(src).toContain('const stableRoute=useStableRouteContent()');
  expect(src).toContain('{stableRoute&&<><section className="settingsCard vyronFilesystemCard">');
 });
 it('Analytics defers channel context and heavy cached analytics body until route stability',()=>{
  const src=read('AnalyticsPage.tsx');
  expect(src).toContain('{stableRoute&&<YouTubeChannelBar/>}');
  expect(src).toContain('stableRoute?rowsFor(analytics,days):[]');
 });
 it('YouTube channel context does not scan all jobs during transient route navigation',()=>{
  const src=read('YouTubeChannelBar.tsx');
  expect(src).toContain('stableRoute?(s.jobs||[]):EMPTY_JOBS');
 });
 it('does not modify probe semantics or thresholds',()=>{
  const src=read('M1PerformanceProbe.tsx');
  expect(src).toContain("const route:Page[]=['dashboard','channels','production','youtube','analytics','settings']");
  expect(src).toContain('await timedRouteFrames(page,routeFrameTimings,3)');
  expect(src).toContain("navigationSwitchesPerRound:30");
 });
});
