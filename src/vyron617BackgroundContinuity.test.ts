import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');
describe('VYRON 6.1.17 background continuity contracts',()=>{
 it('keeps Production batch state outside the page and forbids concurrent builds',()=>{
  const runtime=read('src/productionManagerApi.ts');
  const page=read('src/ProductionManager.tsx');
  expect(runtime).toContain('const productionSnapshots=new Map');
  expect(runtime).toContain("task.state==='RUNNING'");
  expect(runtime).toContain('productionSnapshots.set(request.channelId,task)');
  expect(page).toContain('productionBuildRuntime.subscribe(sync)');
  expect(page).toContain('productionBuildRuntime.start(');
 });
 it('preserves AI ZIP progress, cancellation, selected channels and result after route unmount',()=>{
  const ui=read('src/AiAnalyticsExport.tsx');
  expect(ui).toContain('const exportUi:ExportUiSnapshot=');
  expect(ui).toContain('activeChoices:currentChoices');
  expect(ui).toContain('exportUiSubscribers.add(refresh)');
  expect(ui).toContain('return()=>{exportUiSubscribers.delete(refresh)}');
  expect(ui).toContain('if(exportUi.running||chosen.length===0)return');
  expect(ui).toContain('if(!exportUi.running||exportUi.cancelling)return');
  expect(ui).toContain('finally{unlisten?.();patchExportUi({running:false,cancelling:false});}');
  expect(ui).toContain("new Event('vyron:analytics-cache-updated')");
 });
 it('keeps fleet sync off the page lifecycle with one listener and channel identity matching',()=>{
  const page=read('src/Analytics360Page.tsx');
  expect(page).toContain('const deepSyncSnapshot:DeepSyncSnapshot=');
  expect(page).toContain('deepSyncObservers.add(update)');
  expect(page).toContain('return()=>{deepSyncObservers.delete(update)}');
  expect(page).toContain('if(deepSyncSnapshot.running)return');
  expect(page).toContain('byProfile.get(profileId)?.channelId!==id');
  const begin=page.indexOf('async function syncDeep(all=false)');
  const end=page.indexOf('async function quickRefresh',begin);
  const action=page.slice(begin,end);
  expect(action.indexOf("listen<Progress>('vyron:ai-export-progress'"))
   .toBeLessThan(action.indexOf("invoke<{status:string;completed:number;total:number;errors:"));
  expect(action).toContain('stop?.();');
  expect(action).toContain('patchDeepSync({running:false})');
 });
 it('opens History locally without a YouTube route and never auto-resumes crash recovery',()=>{
  const app=read('src/App.tsx'),gate=read('src/RecoveryGate.tsx');
  expect(app).toContain("id:'history',page:'history'");
  expect(app).toContain("canonical==='history'?<HistoryPage/>");
  expect(app).not.toContain("id:'history',page:'youtube'");
  expect(gate).not.toContain('Date.now()+30_000');
  expect(gate).toContain('if(!candidate||decided.current||!candidate.safeToResume)return');
 });
});
