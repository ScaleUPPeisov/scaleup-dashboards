import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('YouTube WKWebView paint isolation harness',()=>{
 it('runs through real App shell without changing release M1 probe',()=>{
  const app=readFileSync('src/App.tsx','utf8');
  const center=readFileSync('src/YouTubeCenter.tsx','utf8');
  const publisher=readFileSync('src/PublisherOS.tsx','utf8');
  const controller=readFileSync('src/YoutubePaintIsolationController.tsx','utf8');
  const runtime=readFileSync('src/youtubePaintDiagnosticRuntime.tsx','utf8');
  const variant=readFileSync('src/YoutubePaintDiagnosticVariant.tsx','utf8');
  const probe=readFileSync('src/M1PerformanceProbe.tsx','utf8');
  const vite=readFileSync('vite.config.ts','utf8');

  expect(app).toContain('youtubePaintDiagnosticEnabled()?<YoutubePaintIsolationController/>:<M1PerformanceProbe/>');
  expect(controller).toContain("kind:'YOUTUBE_WKWEBVIEW_PAINT_ISOLATION_APP_SHELL'");
  expect(controller).toContain("releaseCandidateChanged:false");
  expect(controller).toContain("baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2'");
  expect(controller).toContain("Array.from({length:35}");
  expect(controller).toContain("Array.from({length:1000}");
  for(const v of ['shell','channelbar','publisher-shell','picker0','picker6','picker12','picker24','select1','select2','production-minimal'])expect(controller).toContain("'"+v+"'");
  expect(center).toContain('<YoutubePaintProfiler id="YouTubeCenter">');
  expect(center).toContain('<YoutubePaintProfiler id="ChannelBar">');
  expect(center).toContain('<YoutubePaintProfiler id="Publisher">');
  expect(publisher).toContain('<YoutubePaintProfiler id="PublisherShell">');
  expect(publisher).toContain('<YoutubePaintProfiler id="PublisherVideoPicker">');
  expect(runtime).toContain('actualDuration');
  expect(variant).toContain('variant===\'select2\'');
  expect(vite).toContain("'react-dom/client':'react-dom/profiling'");
  expect(probe).toContain("const route:Page[]=['dashboard','channels','production','youtube','analytics','settings']");
  expect(probe).toContain('await timedRouteFrames(page,routeFrameTimings,3)');
 });
});
