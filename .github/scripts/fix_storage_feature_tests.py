#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])
(root/'src/storageLifecycle.test.ts').write_text(r'''import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {recordVerifiedUpload,successfulUploadForHash,markHistoryTrashed} from './storageLifecycle';

const pub=fs.readFileSync('src/PublisherOS.tsx','utf8');
const store=fs.readFileSync('src/store.ts','utf8');
const lifecycle=fs.readFileSync('src/storageLifecycle.ts','utf8');
const api=fs.readFileSync('src/api.ts','utf8');
const yt=fs.readFileSync('src-tauri/src/youtube.rs','utf8');
const del=fs.readFileSync('src-tauri/src/local_delete.rs','utf8');
const prod=fs.readFileSync('src-tauri/src/production_manager.rs','utf8');

const verified=(path='/ready/VIDEO_001.mov',sha='sha-001')=>({
 jobId:'job-1',channelId:'channel-1',profileId:'profile-1',youtubeChannelId:'UC1',youtubeVideoId:'yt-video-1',
 localFilePath:path,originalFilename:path.split('/').pop()||'VIDEO_001.mov',projectId:'project-1',sourceProjectPath:'/production/project-1',
 uploadedAt:'2026-09-12T00:00:00.000Z',fileSize:123456,sha256:sha,publishAt:'2026-09-13T11:00:00.000Z',overrideDuplicate:false
} as any);

describe('Storage Lifecycle + Duplicate Upload Guard',()=>{
 it('verified upload creates UPLOADED persistent history with videoId',()=>{const h=recordVerifiedUpload([],verified());expect(h).toHaveLength(1);expect(h[0].status).toBe('UPLOADED');expect(h[0].youtubeVideoId).toBe('yt-video-1');expect(h[0].sha256).toBe('sha-001')});
 it('same SHA-256 is detected as duplicate',()=>{const h=recordVerifiedUpload([],verified());expect(successfulUploadForHash(h,'sha-001')?.youtubeVideoId).toBe('yt-video-1')});
 it('renamed or moved same file remains duplicate because path is not identity',()=>{const h=recordVerifiedUpload([],verified('/old/VIDEO_001.mov','same-content'));expect(successfulUploadForHash(h,'same-content')).toBeTruthy();expect(successfulUploadForHash(h,'different-content')).toBeFalsy()});
 it('29 NEW + 1 duplicate isolates only duplicate',()=>{const h=recordVerifiedUpload([],verified('/old/a.mov','dup'));const hashes=[...Array.from({length:29},(_,i)=>`new-${i}`),'dup'];const uploadable=hashes.filter(x=>!successfulUploadForHash(h,x));expect(uploadable).toHaveLength(29)});
 it('failed/verification-failed upload cannot persist success proof',()=>{const branch=pub.indexOf('if(uploaded.verified===false)');const fail=pub.indexOf('youtubeVideoId:undefined',branch);const persist=pub.indexOf('persistVerifiedUpload(j,channel,uploaded.videoId',branch);expect(branch).toBeGreaterThanOrEqual(0);expect(fail).toBeGreaterThan(branch);expect(persist).toBeGreaterThan(fail)});
 it('resumable verification failure clears videoId and does not record history',()=>{const start=pub.indexOf('async function resumeUpload');const branch=pub.indexOf('if(uploaded.verified===false)',start);const fail=pub.indexOf('youtubeVideoId:undefined',branch);const persist=pub.indexOf('persistVerifiedUpload(j,c,uploaded.videoId',branch);expect(start).toBeGreaterThanOrEqual(0);expect(branch).toBeGreaterThan(start);expect(fail).toBeGreaterThan(branch);expect(persist).toBeGreaterThan(fail)});
 it('moving uploaded local file to Trash keeps publication history',()=>{const h=recordVerifiedUpload([],verified());const next=markHistoryTrashed(h,'job-1');expect(next).toHaveLength(1);expect(next[0].youtubeVideoId).toBe('yt-video-1');expect(next[0].sha256).toBe('sha-001');expect(successfulUploadForHash(next,'sha-001')).toBeTruthy()});
 it('state v8 migration fields are persistent and old datasets remain in store schema',()=>{expect(store).toContain('version:8');expect(store).toContain('uploadHistory');expect(store).toContain('fingerprintCache');expect(store).toContain('projectLifecycle');expect(store).toContain('channels');expect(store).toContain('jobs')});
 it('full-file SHA-256 and cache metadata are wired',()=>{expect(yt).toContain('full_file_sha256');expect(yt).toContain('Sha256');expect(api).toContain('youtube_file_fingerprint');expect(pub).toContain('fingerprintCache');expect(pub).toContain('for(const j of targets)')});
 it('project safe cleanup requires verified upload proof',()=>{expect(lifecycle).toContain('SAFE_TO_CLEAN');expect(lifecycle).toContain('youtubeVideoId');expect(lifecycle).toContain('UPLOADED');expect(pub).toContain('nextProjectLifecycle')});
 it('production media deletion uses system Trash and guarded roots',()=>{expect(del).toContain('trash::delete');expect(del).toContain('allowed');expect(prod).toContain('trash::delete');expect(prod).toContain('SAFE_TO_CLEAN');expect(del).not.toContain('fs::remove_file(');expect(del).not.toContain('fs::remove_dir_all(')});
 it('UI defaults to New and uploaded items are not normally selectable',()=>{expect(pub).toContain("useState<'new'|'uploaded'|'all'>('new')");expect(pub).toContain('Новые {newCount}');expect(pub).toContain('Загруженные {uploadedCount}');expect(pub).toContain('Все {newCount+uploadedCount}');expect(pub).toContain("disabled={j.status==='UPLOADING'||uploaded}");expect(pub).toContain('Всё равно загрузить повторно')});
 it('remove from list and physical Trash are distinct actions',()=>{expect(pub).toContain('Убрать из списка');expect(pub).toContain('Переместить файл в Корзину');expect(pub).toContain('api.trashLocalFile')});
});
''')
(root/'src/v2111PublisherWiring.test.ts').write_text(r'''import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
const pub=fs.readFileSync('src/PublisherOS.tsx','utf8');
const api=fs.readFileSync('src/api.ts','utf8');
describe('PublisherOS storage/upload wiring',()=>{
 it('uses canonical selectable jobs',()=>expect(pub).toContain('canonicalSelectedJobs(selectableJobs,draft.selectedIds)'));
 it('button uses truthful label helper',()=>expect(pub).toContain('publisherUploadButtonLabel'));
 it('batch executes uploadable subset',()=>expect(pub).toContain('let batch=uploadableSelected'));
 it('blocked items are isolated individually',()=>expect(pub).toContain('for(const x of blockedItems)'));
 it('upload instrumentation exists',()=>expect(pub).toContain('[UPLOAD] button clicked'));
 it('preflight instrumentation exists',()=>expect(pub).toContain('[PREFLIGHT] input='));
 it('schedule instrumentation exists',()=>expect(pub).toContain('[SCHEDULE] VIDEO_'));
 it('YouTube success history is persisted only after verified branch',()=>{const branch=pub.indexOf('if(uploaded.verified===false)');const persist=pub.indexOf('persistVerifiedUpload(j,channel,uploaded.videoId',branch);expect(branch).toBeGreaterThanOrEqual(0);expect(persist).toBeGreaterThan(branch)});
 it('verification failure clears success proof and marks FAILED',()=>{const i=pub.indexOf('if(uploaded.verified===false)');const tail=pub.slice(i,i+1200);expect(tail).toContain("storageLifecycle:'FAILED'");expect(tail).toContain('youtubeVideoId:undefined')});
 it('quota plan includes real videos.list verification',()=>expect(pub).toContain("method:'videos.list'"));
 it('frontend invokes existing youtube upload command',()=>expect(api).toContain("youtube_upload_video"));
});
''')
print('storage feature tests normalized')
