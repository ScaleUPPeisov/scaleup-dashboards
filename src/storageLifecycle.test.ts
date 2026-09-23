import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {classifyUploadState,cleanupEligibleUpload,recordVerifiedUpload,successfulUploadForHash,markHistoryTrashed,migrateUploadHistoryFingerprintProvenance} from './storageLifecycle';

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

const verified=(path='/ready/VIDEO_001.mov',sha='a'.repeat(64))=>({
 jobId:'job-1',channelId:'channel-1',profileId:'profile-1',youtubeChannelId:'UC1',youtubeVideoId:'yt-video-1',
 localFilePath:path,originalFilename:path.split('/').pop()||'VIDEO_001.mov',projectId:'project-1',sourceProjectPath:'/production/project-1',
 uploadedAt:'2026-09-12T00:00:00.000Z',fileSize:123456,sha256:sha,fingerprintProofSource:'UPLOAD_TIME',fingerprintCapturedAt:'2026-09-12T00:00:00.000Z',sourceGenerationKeyAtUpload:`channel-1:${sha}:123456`,uploadOperationId:'op-1',proofSchemaVersion:1,publishAt:'2026-09-13T11:00:00.000Z',overrideDuplicate:false,processingState:'READY'
} as any);

describe('Storage Lifecycle + Duplicate Upload Guard',()=>{
 it('verified upload creates UPLOADED persistent history with videoId',()=>{const h=recordVerifiedUpload([],verified());expect(h).toHaveLength(1);expect(h[0].status).toBe('UPLOADED');expect(h[0].youtubeVideoId).toBe('yt-video-1');expect(h[0].sha256).toBe('a'.repeat(64))});
 it('same SHA-256 is detected as duplicate',()=>{const h=recordVerifiedUpload([],verified());expect(successfulUploadForHash(h,'a'.repeat(64))?.youtubeVideoId).toBe('yt-video-1')});
 it('successful hash lookup can be scoped to the current channel',()=>{
  const a=recordVerifiedUpload([],verified('/ready/a.mov','a'.repeat(64)));
  const other={...a[0],id:'other',channelId:'channel-2'};
  expect(successfulUploadForHash([other],'a'.repeat(64),'channel-1')).toBeUndefined();
  expect(successfulUploadForHash([other],'a'.repeat(64),'channel-2')?.youtubeVideoId).toBe('yt-video-1');
 });
 it('historical youtubeVideoId alone does not prove the current physical generation',()=>{
  const sha='a'.repeat(64),j:any={id:'job-1',channelId:'channel-1',number:1,folder:'/ready',status:'SCHEDULED',createdAt:'2026-09-12T00:00:00Z',tracksCount:15,minTracks:15,finalPath:'/ready/VIDEO_001.mov',title:'VIDEO_001',description:'',tags:[],storageLifecycle:'UPLOADED',youtubeVideoId:'yt-video-1',processingState:'READY',identityVerifiedAt:'2026-09-12T01:00:00Z'};
  const h=recordVerifiedUpload([],{...verified('/ready/VIDEO_001.mov',sha),fileSize:123456,processingState:'READY',identityVerifiedAt:'2026-09-12T01:00:00Z'});
  expect(classifyUploadState(j,h)).toBe('VERIFY_REQUIRED');
  expect(classifyUploadState({...j,currentSourceFingerprint:sha,currentSourceFileSize:123456},h)).toBe('READY');
  expect(classifyUploadState({...j,currentSourceFingerprint:'b'.repeat(64),currentSourceFileSize:123456},h)).toBe('VERIFY_REQUIRED');
 });
 it('renamed or moved same file remains duplicate because path is not identity',()=>{const h=recordVerifiedUpload([],verified('/old/VIDEO_001.mov','b'.repeat(64)));expect(successfulUploadForHash(h,'b'.repeat(64))).toBeTruthy();expect(successfulUploadForHash(h,'c'.repeat(64))).toBeFalsy()});
 it('29 NEW + 1 duplicate isolates only duplicate',()=>{const h=recordVerifiedUpload([],verified('/old/a.mov','d'.repeat(64)));const hashes=[...Array.from({length:29},(_,i)=>(i+10).toString(16).padStart(64,'0')),'d'.repeat(64)];const uploadable=hashes.filter(x=>!successfulUploadForHash(h,x));expect(uploadable).toHaveLength(29)});
 it('verification-failed accepted upload persists identity only as uncertain, never cleanup-ready',()=>{const branch=queueRuntime.indexOf('if(uploaded.verified===false)');const persist=queueRuntime.indexOf('const uncertainHistory=recordVerifiedUpload',branch);const end=queueRuntime.indexOf('completePublishAttempt',branch);expect(branch).toBeGreaterThanOrEqual(0);expect(persist).toBeGreaterThan(branch);expect(end).toBeGreaterThan(persist);const block=queueRuntime.slice(branch,end);expect(block).toContain("processingState:'PROCESSING_UNKNOWN'");expect(block).toContain('youtubeVideoId:uploaded.videoId');expect(block).not.toContain("processingState:'READY'")});
 it('resumable verification failure preserves returned videoId and blocks blind duplicate retry',()=>{const start=pub.indexOf('async function resumeUpload');const branch=pub.indexOf('if(uploaded.verified===false)',start);const accepted=pub.indexOf('youtubeVideoId:uploaded.videoId',start);const warning=pub.indexOf('Повторная загрузка заблокирована',branch);expect(start).toBeGreaterThanOrEqual(0);expect(accepted).toBeGreaterThan(start);expect(accepted).toBeLessThan(branch);expect(warning).toBeGreaterThan(branch);expect(pub.slice(branch,warning+120)).not.toContain('youtubeVideoId:undefined')});
 it('cleanup never treats replaced bytes at the same path as the uploaded source generation',()=>{
  const sha='d'.repeat(64),base=recordVerifiedUpload([],{...verified('/ready/VIDEO_001.mov',sha),fileSize:123456,processingState:'READY',sourceLifecycle:'PRESENT'})[0];
  const job:any={id:'job-1',channelId:'channel-1',number:1,folder:'/ready',status:'SCHEDULED',createdAt:'2026-09-12T00:00:00Z',tracksCount:15,minTracks:15,finalPath:'/ready/VIDEO_001.mov',title:'VIDEO_001',description:'',tags:[],storageLifecycle:'UPLOADED',youtubeVideoId:'yt-video-1'};
  expect(cleanupEligibleUpload(base,job)).toBe(false);
  expect(cleanupEligibleUpload(base,{...job,currentSourceFingerprint:sha,currentSourceFileSize:123456})).toBe(true);
  expect(cleanupEligibleUpload(base,{...job,currentSourceFingerprint:'e'.repeat(64),currentSourceFileSize:123456})).toBe(false);
 });

 it('legacy reconstructed hashes never become duplicate authority without historical upload fingerprint evidence',()=>{
  const sha='e'.repeat(64),row:any={...verified('/render/001.mov',sha),id:'legacy',status:'UPLOADED'};delete row.fingerprintProofSource;delete row.fingerprintCapturedAt;delete row.uploadOperationId;delete row.proofSchemaVersion;
  const activity:any[]=[
   {eventId:'remote',eventType:'REMOTE_VIDEO_VERIFIED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:'2026-09-20T00:00:00Z',jobId:'job-1',channelId:'channel-1',youtubeVideoId:'yt-video-1'},
   {eventId:'recon',eventType:'RECONCILIATION_COMPLETED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:'2026-09-20T00:00:01Z',jobId:'job-1',channelId:'channel-1',youtubeVideoId:'yt-video-1'}
  ];
  const migrated=migrateUploadHistoryFingerprintProvenance([row],activity,[]);
  expect(migrated[0].fingerprintProofSource).toBe('LEGACY_RECONSTRUCTED');
  expect(successfulUploadForHash(migrated,sha,'channel-1',123456)).toBeUndefined();
 });
 it('legacy record is upgraded only when upload journal and immutable job uploadFingerprint agree',()=>{
  const sha='f'.repeat(64),row:any={...verified('/render/001.mov',sha),id:'legacy',status:'UPLOADED'};delete row.fingerprintProofSource;delete row.fingerprintCapturedAt;delete row.uploadOperationId;delete row.proofSchemaVersion;
  const activity:any[]=[
   {eventId:'start',eventType:'UPLOAD_STARTED',status:'STARTED',source:'LIVE_OPERATION',timestamp:'2026-09-12T00:00:00Z',operationId:'real-op',jobId:'job-1',channelId:'channel-1',details:{fileSize:123456}},
   {eventId:'accepted',eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:'2026-09-12T00:01:00Z',operationId:'real-op',jobId:'job-1',channelId:'channel-1',youtubeVideoId:'yt-video-1'}
  ];
  const jobs:any[]=[{id:'job-1',uploadFingerprint:sha}];
  const migrated=migrateUploadHistoryFingerprintProvenance([row],activity,jobs);
  expect(migrated[0].fingerprintProofSource).toBe('UPLOAD_TIME');
  expect(successfulUploadForHash(migrated,sha,'channel-1',123456)?.youtubeVideoId).toBe('yt-video-1');
 });

 it('moving uploaded local file to Trash keeps publication history',()=>{const h=recordVerifiedUpload([],verified());const next=markHistoryTrashed(h,'job-1');expect(next).toHaveLength(1);expect(next[0].youtubeVideoId).toBe('yt-video-1');expect(next[0].sha256).toBe('a'.repeat(64));expect(successfulUploadForHash(next,'a'.repeat(64))).toBeTruthy()});
 it('state v10 migration fields are persistent and old datasets remain in store schema',()=>{expect(store).toContain('version:10');expect(store).toContain('uploadHistory');expect(store).toContain('activityJournal');expect(store).toContain('statisticsHistory');expect(store).toContain('fingerprintCache');expect(store).toContain('projectLifecycle');expect(store).toContain('channels');expect(store).toContain('jobs')});
 it('full-file SHA-256 and cache metadata are wired',()=>{expect(yt).toContain('full_file_sha256');expect(yt).toContain('Sha256');expect(api).toContain('youtube_file_fingerprint');expect(pub).toContain('fingerprintCache');expect(pub).toContain('for(const j of targets)')});
 it('publisher lifecycle still records verified upload proof independently from Production source cleanup',()=>{expect(lifecycle).toContain('SAFE_TO_CLEAN');expect(lifecycle).toContain('youtubeVideoId');expect(lifecycle).toContain('UPLOADED');expect(pub).toContain('nextProjectLifecycle')});
 it('production cleanup uses system Trash, render proof and guarded roots without upload gate',()=>{expect(delProd).toContain('trash::delete');expect(delProd).toContain('allowed');expect(delProd).not.toContain('fs::remove_file(');expect(delProd).not.toContain('fs::remove_dir_all(');const one=section(prod,'pub fn delete_production_job_folder','fn folder_stats');const two=section(prod,'fn cleanup_completed_assets','pub fn cleanup_completed_production_assets');const three=section(prod,'fn delete_production_batch_projects_inner','pub fn open_production_batch_in_endlume');for(const s of [one,two,three]){expect(s).toContain('trash::delete');expect(s).not.toContain('fs::remove_dir_all(')}expect(one).toContain('verified_uploaded_job_ids');expect(one).toContain('canonical_under');expect(two).toContain('validate_cleanup_candidate');expect(two).not.toContain('verified_jobs');expect(prod).toContain('validate_render_media');expect(prod).toContain('CLEANUP_OUTPUT_INSIDE_PROJECT');expect(three).toContain('verified YouTube upload proof')});
 it('UI defaults to New and current fingerprint candidates are selectable without YouTube-ID verification',()=>{expect(pub).toContain("type VideoFilter='new'|'youtube'|'processing'|'verify'|'errors'|'all'");expect(pub).toContain("useState<VideoFilter>('new')");expect(pub).toContain('Новые {newCount}');expect(pub).toContain('На YouTube {uploadedCount}');expect(pub).toContain('Все {stateCounts.ALL}');expect(pub).not.toContain('Проверить YouTube ID');expect(pub).not.toContain('>Нужна проверка {verifyCount}</button>');expect(pub).toContain("const currentCandidates=rows.filter(r=>r.classification==='NEW_CANDIDATE'||r.classification==='NEW_GENERATION')");expect(pub).toContain('materializeRenderGenerationRows(currentCandidates,false,scanPreview)');expect(pub).toContain("const selectableJobs=useMemo(()=>allChannelJobs.filter(j=>uploadStateById.get(j.id)==='NEW'&&!recoveryJobIds.has(j.id))");expect(pub).toContain("const selectableJobIds=useMemo(()=>new Set(selectableJobs.map(j=>j.id))");expect(pub).toContain("fresh=selectableJobIds.has(j.id)");expect(pub).toContain("disabled={!fresh||busy}");expect(pub).toContain('Доказательство duplicate protection')});
 it('remove from list and physical Trash are distinct actions',()=>{expect(pub).toContain('Убрать из списка');expect(pub).toContain('Переместить в Корзину');expect(pub).toContain('api.trashLocalFile')});
});
