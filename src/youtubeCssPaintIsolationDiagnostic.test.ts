import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('YouTube CSS paint isolation harness',()=>{
 it('is diagnostic-only and preserves release probe semantics',()=>{
  const app=readFileSync('src/App.tsx','utf8');
  const diag=readFileSync('src/YoutubeCssPaintIsolationController.tsx','utf8');
  const probe=readFileSync('src/M1PerformanceProbe.tsx','utf8');
  expect(app).toContain("VITE_YT_CSS_PAINT_DIAG==='1'");
  expect(diag).toContain("kind:'YOUTUBE_WKWEBVIEW_CSS_PAINT_ISOLATION'");
  expect(diag).toContain("releaseCandidateChanged:false");
  expect(diag).toContain("baseHead:'4de188b2cf50d3f58cd7074a6e57ccb67c15e1b2'");
  expect(diag).toContain("samplesPerVariant:20");
  expect(diag).toContain("routeOrder:['dashboard','channels','production','youtube']");
  for(const v of ['shadows','gradients','transitions','filters','opaque','pseudo'])expect(diag).toContain("'"+v+"'");
  expect(diag).toContain("box-shadow:none!important;text-shadow:none!important");
  expect(diag).toContain("background-image:none!important");
  expect(diag).toContain("transition:none!important;animation:none!important");
  expect(diag).toContain("filter:none!important;backdrop-filter:none!important");
  expect(diag).toContain("opaqueRules");
  expect(diag).toContain("pseudoRules");
  expect(probe).toContain("const route:Page[]=['dashboard','channels','production','youtube','analytics','settings']");
  expect(probe).toContain('await timedRouteFrames(page,routeFrameTimings,3)');
 });
});
