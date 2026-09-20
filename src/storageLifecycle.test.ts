import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {recordVerifiedUpload,successfulUploadForHash,markHistoryTrashed} from './storageLifecycle';

const pub=fs.readFileSync('src/PublisherOS.tsx','utf8');
const queueRuntime=fs.readFileSync('src/uploadQueueRuntime.ts','utf8');
const store=fs.readFileSync('src/store.ts','utf8');
const lifecycle=fs.readFileSync('src/storageLifecycle.ts','utf8');
const api=fs.readFileSync('src/api.ts','utf8');
const yt=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
const del=fs.readFileSync('src-tauri/src/local_delete.rs','utf8');
const prod=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');
const delProd=del.split('#[cfg(test)]',1)[0];
function section(src:string,start:string,end:string){const a=src.indexOf(start);const b=src.indexOf(end,a+start.length);expect(a).toBeGreaterThanOrEqual(0);expect(b).toBeGreaterThan(a);return src.slice(a,b)}

const verified=(path='/ready/VIDEO_001.mov',sha='sha-001')=>({
 jobId:'job-1',channelId:'channel-1',profileId:'profile-1',youtubeChannelId:'UC1',youtubeVideoId:'yt-video-1',
 localFilePath:path,originalFilename:path.split('/').pop()||'VIDEO_001.mov',projectId:'project-1',sourceProjectPath:'/production/project-1',
 uploadedAt:'2026-09-12T00:00:00.000Z',fileSize:123456,sha256:sha,publishAt:'2026-09-13T11:00:00.000Z',overrideDuplicate:false,processingState:'READY'
} as any);

describe('Storage Lifecycle + Duplicate Upload Guard',()=>{
 it('verified upload creates UPLOADED persistent history with videoId',()=>{const h=recordVerifiedUpload([],verified());expect(h).toHaveLength(1);expect(h[0].status).toBe('UPLOADED');expect(h[0].youtubeVideoId).toBe('yt-video-1');expect(h[0].sha256).toBe('sha-001')});
 it('same SHA-256 is detected as duplicate',()=>{const h=recordVerifiedUpload([],verified());expect(successfulUploadForHash(h,'sha-001')?.youtubeVideoId).toBe('yt-video-1')});
 it('renamed or moved same file remains duplicate because path is not identity',()=>{const h=recordVerifiedUpload([],verified('/old/VIDEO_001.mov','same-content'));expect(successfulUploadForHash(h,'same-content')).toBeTruthy();expect(successfulUploadForHash(h,'different-content')).toBeFalsy()});
 it('29 NEW + 1 duplicate isolates only duplicate',()=>{const h=recordVerifiedUpload([],verified('/old/a.mov','dup'));const hashes=[...Array.from({length:29},(_,i)=>`new-${i}`),'dup'];const uploadable=hashes.filter(x=>!successfulUploadForHash(h,x));expect(uploadable).toHaveLength(29)});
 it('verification-failed accepted upload persists identity only as uncertain, never cleanup-ready',()=>{const branch=queueRuntime.indexOf('if(uploaded.verified===false)');const persist=queueRuntime.indexOf('const uncertainHistory=recordVerifiedUpload',branch);const end=queueRuntime.indexOf('completePublishAttempt',branch);expect(branch).toBeGreaterThanOrEqual(0);expect(persist).toBeGreaterThan(branch);expect(end).toBeGreaterThan(persist);const block=queueRuntime.slice(branch,end);expect(block).toContain("processingState:'PROCESSING_UNKNOWN'");expect(block).toContain('youtubeVideoId:uploaded.videoId');expect(block).not.toContain("processingState:'READY'")});
 it('resumable verification failure preserves returned videoId and blocks blind duplicate retry',()=>{const start=pub.indexOf('async function resumeUpload');const branch=pub.indexOf('if(uploaded.verified===false)',start);const accepted=pub.indexOf('youtubeVideoId:uploaded.videoId',start);const warning=pub.indexOf('Повторная загрузка заблокирована',branch);expect(start).toBeGreaterThanOrEqual(0);expect(accepted).toBeGreaterThan(start);expect(accepted).toBeLessThan(branch);expect(warning).toBeGreaterThan(branch);expect(pub.slice(branch,warning+120)).not.toContain('youtubeVideoId:undefined')});
 it('moving uploaded local file to Trash keeps publication history',()=>{const h=recordVerifiedUpload([],verified());const next=markHistoryTrashed(h,'job-1');expect(next).toHaveLength(1);expect(next[0].youtubeVideoId).toBe('yt-video-1');expect(next[0].sha256).toBe('sha-001');expect(successfulUploadForHash(next,'sha-001')).toBeTruthy()});
 it('state v9 migration fields are persistent and old datasets remain in store schema',()=>{expect(store).toContain('version:9');expect(store).toContain('uploadHistory');expect(store).toContain('activityJournal');expect(store).toContain('fingerprintCache');expect(store).toContain('projectLifecycle');expect(store).toContain('channels');expect(store).toContain('jobs')});
 it('full-file SHA-256 and cache metadata are wired',()=>{expect(yt).toContain('full_file_sha256');expect(yt).toContain('Sha256');expect(api).toContain('youtube_file_fingerprint');expect(pub).toContain('fingerprintCache');expect(pub).toContain('for(const j of targets)')});
 it('publisher lifecycle still records verified upload proof independently from Production source cleanup',()=>{expect(lifecycle).toContain('SAFE_TO_CLEAN');expect(lifecycle).toContain('youtubeVideoId');expect(lifecycle).toContain('UPLOADED');expect(pub).toContain('nextProjectLifecycle')});
 it('production cleanup uses system Trash, render proof and guarded roots without upload gate',()=>{expect(delProd).toContain('trash::delete');expect(delProd).toContain('allowed');expect(delProd).not.toContain('fs::remove_file(');expect(delProd).not.toContain('fs::remove_dir_all(');const one=section(prod,'pub fn delete_production_job_folder','fn folder_stats');const two=section(prod,'fn cleanup_completed_assets','pub fn cleanup_completed_production_assets');const three=section(prod,'fn delete_production_batch_projects_inner','pub fn open_production_batch_in_endlume');for(const s of [one,two,three]){expect(s).toContain('trash::delete');expect(s).not.toContain('fs::remove_dir_all(')}expect(one).toContain('verified_uploaded_job_ids');expect(one).toContain('canonical_under');expect(two).toContain('validate_cleanup_candidate');expect(two).not.toContain('verified_jobs');expect(prod).toContain('validate_render_media');expect(prod).toContain('CLEANUP_OUTPUT_INSIDE_PROJECT');expect(three).toContain('verified YouTube upload proof')});
 it('UI defaults to New and uploaded items are not normally selectable',()=>{expect(pub).toContain("useState<'new'|'uploaded'|'all'>('new')");expect(pub).toContain('Новые {newCount}');expect(pub).toContain('Загруженные {uploadedCount}');expect(pub).toContain('Все {newCount+uploadedCount}');expect(pub).toContain("disabled={j.status==='UPLOADING'||uploaded}");expect(pub).toContain('Всё равно загрузить повторно')});
 it('remove from list and physical Trash are distinct actions',()=>{expect(pub).toContain('Убрать из списка');expect(pub).toContain('Переместить файл в Корзину');expect(pub).toContain('api.trashLocalFile')});
});
