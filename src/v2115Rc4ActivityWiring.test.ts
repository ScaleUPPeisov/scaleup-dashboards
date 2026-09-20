import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

const read=(p:string)=>fs.readFileSync(p,'utf8');

describe('VYRON 2.1.15 RC4 activity history wiring',()=>{
 it('adds a durable History tab without replacing existing YouTube screens',()=>{
  const center=read('src/YouTubeCenter.tsx');
  expect(center).toContain("['history','История']");
  expect(center).toContain('<ActivityHistory/>');
  for(const label of ['Публикация','Метаданные','Расписание','Загруженные','Аккаунты'])expect(center).toContain(label);
 });
 it('state v9 persists journal and legacy state gets an empty journal rather than invented events',()=>{
  const store=read('src/store.ts'),storage=read('src-tauri/src/storage.rs');
  expect(store).toContain('activityJournal:[]');
  expect(store).toContain('activityJournal:s.activityJournal');
  expect(storage).toContain('"activityJournal"');
  expect(storage).toContain('state["activityJournal"] = json!([])');
 });
 it('upload lifecycle writes factual accepted/processing events and compact progress milestones',()=>{
  const runtime=read('src/uploadQueueRuntime.ts'),app=read('src/App.tsx');
  expect(runtime).toContain("eventType:'UPLOAD_QUEUED'");
  expect(runtime).toContain("eventType:'UPLOAD_STARTED'");
  expect(runtime).toContain("eventType:'UPLOAD_ACCEPTED'");
  expect(app).toContain('journalUploadProgressMilestone');
  expect(read('src/activityJournalRuntime.ts')).toContain('[25,50,75,100]');
 });
 it('metadata journal records summary and real field counters',()=>{
  const m=read('src/MetadataPage.tsx');
  expect(m).toContain("eventType:'METADATA_UPDATE_STARTED'");
  expect(m).toContain("eventType:status==='failed'?'METADATA_UPDATE_FAILED':'METADATA_UPDATE_SUCCEEDED'");
  expect(m).toContain("eventType:'DESCRIPTION_UPDATED'");
  expect(m).toContain("eventType:'TAGS_UPDATED'");
  expect(m).toContain("eventType:'SCHEDULE_UPDATED'");
 });
 it('inventory operations are journaled without weakening RC2 completeness logic',()=>{
  const existing=read('src/ExistingVideos.tsx');
  expect(existing).toContain("eventType:'INVENTORY_SYNC_STARTED'");
  expect(existing).toContain("complete?'INVENTORY_SYNC_COMPLETED':'INVENTORY_SYNC_PARTIAL'");
  expect(existing).toContain('targetedExistingRetryIds');
  expect(existing).toContain('reconcileExistingSyncAfterTargetedRetry');
 });
 it('legacy reconciliation batches videos.list and does not query one video per call',()=>{
  const rust=read('src-tauri/src/youtube.rs'),api=read('src/api.ts');
  expect(rust).toContain('youtube_video_processing_status_batch');
  expect(rust).toContain('for chunk in ids.chunks(50)');
  expect(api).toContain("'youtube_video_processing_status_batch'");
  expect(api).toContain('METHOD_LEDGER_COMMANDS');
 });
 it('local reconciliation is read-only and Trash remains the only destructive local source action',()=>{
  const local=read('src-tauri/src/local_delete.rs').split('#[cfg(test)]',1)[0],history=read('src/ActivityHistory.tsx');
  expect(local).toContain('pub fn local_source_status');
  expect(history).toContain('api.localSourceStatus');
  expect(local).toContain('trash::delete');
  expect(local).not.toContain('fs::remove_file');
 });
 it('cleanup UI preclassifies predictable exclusions and emits batch summary instead of one global error per row',()=>{
  const center=read('src/UploadCenter.tsx');
  expect(center).toContain('cleanupPreclassification');
  expect(center).toContain('Already missing');
  expect(center).toContain('Still processing');
  expect(center).toContain("notifyWarning('Часть файлов не тронута'");
  expect(center).not.toContain("notifyError('Не удалось переместить файл в Корзину'");
 });
 it('journal sanitization rejects token and client-secret detail keys',()=>{
  const core=read('src/activityJournalCore.ts');
  expect(core).toMatch(/access\[_-\]\?token/);
  expect(core).toMatch(/refresh\[_-\]\?token/);
  expect(core).toMatch(/client\[_-\]\?secret/);
 });
});
