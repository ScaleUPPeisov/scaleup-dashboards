import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {testFilePath} from './testFilePath';

const read=(p:string)=>readFileSync(testFilePath(p,import.meta.url),'utf8');

describe('VYRON 2.1.6 live upload wiring',()=>{
 it('routes high-frequency upload progress only into transient telemetry',()=>{
   const app=read('./App.tsx');
   expect(app).toContain('api.onYoutubeProgress(applyUploadProgressFact)');
   expect(app).not.toMatch(/onYoutubeProgress\([^\n]*patchJob/);
 });
 it('backend progress carries factual byte totals and safe immutable identity',()=>{
   const rust=read('../src-tauri/src/youtube.rs');
   for(const token of ['"bytesUploaded"','"totalBytes"','"jobId"','"projectId"','"channelId"','"profileId"','"timestamp"'])expect(rust).toContain(token);
   expect(rust).toContain('youtube_active_uploads');
   expect(rust).not.toMatch(/ActiveUploadTelemetry[\s\S]{0,900}(refresh_token|access_token|client_secret)/);
 });
 it('Upload Center represents running and queued jobs, can remove queued jobs, and has no fake running cancel',()=>{
   const center=read('./UploadCenter.tsx');
   expect(center).toContain('queue.running.map');
   expect(center).toContain('queue.queued.map');
   expect(center).toContain('Позиция в очереди');
   expect(center).toContain('removeQueuedUpload');
   expect(center).toContain('Убрать из очереди');
   expect(center).toContain('Расчёт времени…');
   expect(center).not.toContain('Отменить');
 });
 it('global indicator and Dashboard integration are wired',()=>{
   expect(read('./App.tsx')).toContain('<GlobalUploadIndicator/>');
   expect(read('./App.tsx')).toContain('<UploadCenterGlobal/>');
   expect(read('./App.tsx')).toContain('<DashboardUploadSummary/>');
 });
});
