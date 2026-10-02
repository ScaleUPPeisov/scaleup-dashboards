import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('YouTube WKWebView paint isolation harness',()=>{
 it('is diagnostic-only and preserves release probe semantics',()=>{
  const app=readFileSync('src/App.tsx','utf8'),diag=readFileSync('src/YoutubePaintIsolationProbe.tsx','utf8'),probe=readFileSync('src/M1PerformanceProbe.tsx','utf8');
  expect(app).toContain("VITE_YT_PAINT_DIAG==='1'");
  expect(diag).toContain("kind:'YOUTUBE_WKWEBVIEW_PAINT_ISOLATION'");
  expect(diag).toContain("releaseCandidateChanged:false");
  expect(diag).toContain("baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2'");
  expect(diag).toContain("Array.from({length:35}");
  expect(diag).toContain("Array.from({length:1000}");
  expect(diag).toContain("rows:0");
  expect(diag).toContain("rows:6");
  expect(diag).toContain("rows:12");
  expect(diag).toContain("rows:24");
  expect(diag).toContain("selects:1");
  expect(diag).toContain("selects:2");
  expect(diag).toContain("ytPaintMinimal");
  expect(diag).toContain('<Profiler id="YouTubeCenter"');
  expect(diag).toContain('<Profiler id="ChannelBar"');
  expect(diag).toContain('<Profiler id="Publisher"');
  expect(diag).toContain('<Profiler id="PublisherShell"');
  expect(diag).toContain('<Profiler id="PublisherVideoPicker"');
  expect(probe).toContain("const route:Page[]=['dashboard','channels','production','youtube','analytics','settings']");
  expect(probe).toContain('await timedRouteFrames(page,routeFrameTimings,3)');
 });
});
