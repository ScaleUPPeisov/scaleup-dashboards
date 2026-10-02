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
 it('YouTube has no hidden heavy keepalive or activation-timer commit train',()=>{
  const app=read('App.tsx'),center=read('YouTubeCenter.tsx'),bar=read('YouTubeChannelBar.tsx'),publisher=read('PublisherOS.tsx');
  expect(app).not.toContain('routeKeepAlive');
  expect(app).not.toContain('youtubeMounted');
  expect(center).toContain('localStorage.setItem(OPEN_TAB_KEY,tab)');
  expect(center).toContain('quotaOpen&&active&&<CachedQuotaMeter');
  expect(bar).toContain('useJobDerived(s=>s.scheduleByChannel[activeId]||EMPTY_SCHEDULE)');
  expect(bar).toContain('!routeActive||!detailsOpen');
  expect(bar).not.toContain('setTimeout(refresh,100)');
  expect(bar).not.toContain('s.jobs');
  expect(publisher).toContain('batchActive?resolvePublisherBatchSchedule');
  expect(publisher).toContain("import {PublisherShell} from './PublisherShell'");
  expect(publisher).toContain("import {PublisherVideoPicker} from './PublisherVideoPicker'");
  expect(publisher).toContain("import {EMPTY_PUBLISHER_DERIVED,usePublisherDerived} from './publisherDerivedRuntime'");
  expect(publisher).toContain('publisherDerived=usePublisherDerived');
  expect(publisher).toContain('dynamicInventory?new Map(allChannelJobs.map');
  expect(publisher).toContain(':publisherDerived.uploadStateById');
  expect(publisher).toContain('return publisherDerived.filters[videoFilter]');
  expect(publisher).toContain('dynamicInventory?uploadStateCounters');
  expect(publisher).toContain(':publisherDerived.counts');
  expect(publisher).toContain('(metadataOpen||draft.rows.length>0)');
  expect(publisher).toContain('(scheduleOpen||selected.length>0)');
  expect(publisher).toContain('initial-active-channel-dispatch-skipped');
  expect(center).toContain('beginYoutubeRouteDiagnostics()');
  expect(read('api.ts')).toContain('nonGateDiagnostics:{youtubeRoute:youtubeRouteDiagnosticsSnapshot()}');
  const derived=read('publisherDerivedRuntime.ts'),picker=read('PublisherVideoPicker.tsx');
  expect(derived).toContain('useApp.subscribe((state,previous)');
  expect(derived).toContain('useLiveInventory.subscribe((state,previous)');
  expect(derived).toContain('filters:{new:selectableJobs,youtube,processing,verify,errors,all:jobs}');
  expect(picker).toContain('useState(24)');
  expect(picker).toContain('p.jobs.slice(0,limit)');
  expect(publisher).not.toContain('vyron:youtube-route-active');
  expect(publisher).not.toContain('setTimeout(()=>{if(routeIsActive())void refreshSessions()},90)');
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
