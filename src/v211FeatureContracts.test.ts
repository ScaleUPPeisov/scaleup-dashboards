import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8');

describe('VYRON 2.0.11 requested feature contracts',()=>{
 it('Publisher exposes file/daily/2-2/3-1 schedule buttons and time preview',()=>{
  const s=read('./PublisherOS.tsx');
  for(const token of ["['file','Из файла']","['daily','Каждый день']","['2/2','2/2']","['3/1','3/1']",'Время публикации','Preview дат'])expect(s).toContain(token);
 });
 it('Publisher resolves metadata before queueing and queue persists it before videos.insert',()=>{
  const publisher=read('./PublisherOS.tsx'),queue=read('./uploadQueueRuntime.ts');
  expect(publisher).toContain('resolvedUploadMetadata(j,row,publishAt');
  expect(publisher.indexOf('resolvedUploadMetadata(j,row,publishAt')).toBeLessThan(publisher.indexOf('enqueueUpload({'));
  expect(queue.indexOf('api.writeJobMetadata')).toBeGreaterThanOrEqual(0);
  expect(queue.indexOf('api.writeJobMetadata')).toBeLessThan(queue.indexOf('api.youtubeUpload('));
 });
 it('Production cleanup is double-confirmed and preserves rendered output contract',()=>{
  const ui=read('./ProductionManager.tsx'),rust=read('../src-tauri/src/production_manager.rs');
  expect((ui.match(/window\.confirm\(/g)||[]).length).toBeGreaterThanOrEqual(2);
  expect(ui).toContain('УДАЛИТЬ ВСЕ PROJECT ASSETS');
  expect(rust).toContain('cleanup_completed_production_assets');
  expect(rust).toContain('output_file');
  const cleanupRust=rust.slice(rust.indexOf('fn cleanup_completed_assets'),rust.indexOf('pub fn delete_production_batch_projects'));
  expect(cleanupRust).not.toContain('remove_dir_all');
 });
 it('Topbar errors are clickable and updates contain dated history',()=>{
  expect(read('./App.tsx')).toContain('setErrorsOpen(true)');
  expect(read('./SettingsOS.tsx')).toContain('Что менялось по дням');
  expect(read('./releaseHistory.ts')).toContain("version:'2.0.11'");
 });
 it('Existing Videos has category, playlist, authoritative backup, quota fact report and no sync in Undo',()=>{
  const ui=read('./ExistingVideos.tsx'),rust=read('../src-tauri/src/youtube.rs');
  for(const token of ['Category ID','Плейлист','authoritative backup','Последний Apply','Последний Undo'])expect(ui).toContain(token);
  const undo=ui.slice(ui.indexOf('async function undo()'),ui.indexOf(' const displayDate='));
  expect(undo).not.toContain('await sync()');
  expect(rust).toContain('source":"owner-authorized videos.list immediately before write');
  expect(rust).toContain('youtube_playlist_membership');
 });
});
