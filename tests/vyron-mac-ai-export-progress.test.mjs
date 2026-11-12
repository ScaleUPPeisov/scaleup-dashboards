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
  // The Rust export continues after page unmount. Reset the module-level
  // operation state instead of an unmounted React component.
  expect(action).toContain('finally{unlisten?.();patchExportUi({running:false,cancelling:false});}');
  expect(ui).toContain('const exportUiSubscribers=new Set');
  expect(ui).toContain('exportUiSubscribers.add(refresh)');
  expect(ui).toContain('exportUiSubscribers.delete(refresh)');
  expect(action).toContain('patchExportUi({progress:{...exportUi.progress,[event.payload.channelId]:event.payload}})');
  expect(action).toContain('if(exportUi.running||chosen.length===0)return;');
 });
});
