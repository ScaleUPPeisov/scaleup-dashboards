import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../src/AiAnalyticsExport.tsx',import.meta.url),'utf8');
describe('AI export progress subscription lifecycle',()=>{
 it('registers before Rust invoke and detaches even on errors',()=>{
  const start=ui.indexOf('async function start()');
  const end=ui.indexOf('const isMac=',start);
  expect(start).toBeGreaterThanOrEqual(0);
  const action=ui.slice(start,end);
  expect(action.indexOf("unlisten=await listen<Progress>('vyron:ai-export-progress'"))
   .toBeGreaterThanOrEqual(0);
  expect(action.indexOf("unlisten=await listen<Progress>('vyron:ai-export-progress'"))
   .toBeLessThan(action.indexOf("invoke<ExportResult>('youtube_ai_export'"));
  expect(action).toContain('finally{unlisten?.();setRunning(false);}');
 });
});
