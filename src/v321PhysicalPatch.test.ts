import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {channelCountrySource,channelLanguageSource,normalizeChannelStatistics} from './youtubeChannelStats';
import {confirmedCleanupCandidates,latestChannelUploadBatchId,postUploadCleanupEligible} from './postUploadCleanup';
import {effectiveSourceLifecycle} from './activityJournalCore';
import {markHistoryTrashed} from './storageLifecycle';

const read=(path:string)=>readFileSync(path,'utf8');
const sha=(ch:string)=>ch.repeat(64);
function history(overrides:Record<string,unknown>={}){
 return {
  id:'h1',jobId:'job-1',channelId:'channel-1',profileId:'profile-1',youtubeChannelId:'UC1',youtubeVideoId:'yt1',
  localFilePath:'/Render/VIDEO_001.mov',originalFilename:'VIDEO_001.mov',batchId:'batch-1',
  uploadedAt:'2026-09-23T10:00:00Z',fileSize:1234,sha256:sha('a'),status:'UPLOADED',
  fingerprintProofSource:'UPLOAD_TIME',fingerprintCapturedAt:'2026-09-23T09:59:00Z',
  sourceGenerationKeyAtUpload:`channel-1:${sha('a')}:1234`,uploadOperationId:'op-1',proofSchemaVersion:1,
  sourceLifecycle:'PRESENT',processingState:'READY',identityVerifiedAt:'2026-09-23T10:01:00Z',remoteExists:true,
  ...overrides,
 } as any;
}
function job(overrides:Record<string,unknown>={}){
 return {
  id:'job-1',channelId:'channel-1',number:1,folder:'/Render',status:'SCHEDULED',createdAt:'2026-09-23T08:00:00Z',
  tracksCount:15,minTracks:15,finalPath:'/Render/VIDEO_001.mov',title:'VIDEO_001',description:'',tags:[],
  storageLifecycle:'UPLOADED',youtubeVideoId:'yt1',currentSourceFingerprint:sha('a'),currentSourceFileSize:1234,
  ...overrides,
 } as any;
}

describe('VYRON 3.2.1 physical regression patch',()=>{
 it('forces full readable sidebar labels and defeats legacy 17px span width',()=>{
  const app=read('src/App.tsx'),css=read('src/ui-layout-contract.css');
  for(const label of ['Главная','Каналы','Производство','YouTube','Аналитика','Конкуренты','Настройки'])expect(app).toContain(label);
  expect(css).toContain('width:228px!important');
  expect(css).toContain('flex:0 0 228px!important');
  expect(css).toContain('.sidebar nav .sidebarLabel');
  expect(css).toContain('width:auto!important');
  expect(css).toContain('text-overflow:clip!important');
  expect(css).toContain('overflow:visible!important');
 });
 it('keeps account and external-disk actions wrap-safe with the short reconnect label',()=>{
  const accounts=read('src/AccountsPage.tsx'),publisher=read('src/PublisherOS.tsx'),css=read('src/ui-layout-contract.css');
  expect(accounts).toContain("'Переподключить'");
  expect(accounts).toContain('Переподключить через браузер');
  expect(publisher).toContain('>Повторить</button>');
  expect(publisher).toContain('>Изменить папку</button>');
  expect(css).toContain('.renderSourceOfflineActions');
  expect(css).toContain('flex-wrap:wrap');
 });
 it('offers only trusted current generations for channel cleanup',()=>{
  const good=history(),badHash=history({id:'h2',jobId:'job-2',localFilePath:'/Render/VIDEO_002.mov',originalFilename:'VIDEO_002.mov',sha256:sha('b'),sourceGenerationKeyAtUpload:`channel-1:${sha('b')}:1234`});
  const other=history({id:'h3',jobId:'job-3',channelId:'channel-2',batchId:'batch-other'});
  const apple=history({id:'h4',jobId:'job-4',localFilePath:'/Render/._VIDEO_004.mov',originalFilename:'._VIDEO_004.mov'});
  const rows=confirmedCleanupCandidates([good,badHash,other,apple],[job(),job({id:'job-2',number:2,finalPath:'/Render/VIDEO_002.mov',currentSourceFingerprint:sha('c')}),job({id:'job-3',channelId:'channel-2'}),job({id:'job-4',number:4,finalPath:'/Render/._VIDEO_004.mov'})],'channel-1');
  expect(rows.map(x=>x.jobId)).toEqual(['job-1']);
 });
 it('allows a verified accepted upload to become cleanup-ready but blocks processing unknown',()=>{
  const accepted=history({processingState:'UPLOAD_ACCEPTED',identityVerifiedAt:'2026-09-23T10:00:01Z'});
  expect(postUploadCleanupEligible(accepted,job())).toBe(true);
  expect(postUploadCleanupEligible({...accepted,processingState:'YOUTUBE_PROCESSING'},job())).toBe(true);
  expect(postUploadCleanupEligible({...accepted,processingState:'PROCESSING_UNKNOWN'},job())).toBe(false);
  expect(postUploadCleanupEligible({...accepted,identityVerifiedAt:undefined},job())).toBe(false);
 });
 it('supports partial batch cleanup without including failed or verify-required sources',()=>{
  const ok1=history({id:'a',jobId:'job-1',batchId:'batch-partial'});
  const ok2=history({id:'b',jobId:'job-2',batchId:'batch-partial',localFilePath:'/Render/VIDEO_002.mov',originalFilename:'VIDEO_002.mov',sha256:sha('b'),sourceGenerationKeyAtUpload:`channel-1:${sha('b')}:2222`,fileSize:2222});
  const verify=history({id:'c',jobId:'job-3',batchId:'batch-partial',localFilePath:'/Render/VIDEO_003.mov',originalFilename:'VIDEO_003.mov',processingState:'PROCESSING_UNKNOWN'});
  const jobs=[job(),job({id:'job-2',number:2,finalPath:'/Render/VIDEO_002.mov',currentSourceFingerprint:sha('b'),currentSourceFileSize:2222}),job({id:'job-3',number:3,finalPath:'/Render/VIDEO_003.mov'})];
  expect(latestChannelUploadBatchId([ok1,ok2,verify],'channel-1')).toBe('batch-partial');
  expect(confirmedCleanupCandidates([ok1,ok2,verify],jobs,'channel-1','batch-partial').map(x=>x.jobId)).toEqual(['job-1','job-2']);
 });
 it('records intentional cleanup as TRASHED_BY_VYRON instead of an unexpected missing source',()=>{
  const moved=markHistoryTrashed([history({processingState:'YOUTUBE_PROCESSING'})],'job-1','2026-09-23T10:02:00Z','cleanup-op');
  expect(moved[0].sourceLifecycle).toBe('TRASHED_BY_VYRON');
  expect(effectiveSourceLifecycle(moved[0])).toBe('TRASHED_BY_VYRON');
  expect(moved[0].youtubeVideoId).toBe('yt1');
  expect(moved[0].sha256).toBe(sha('a'));
 });
 it('keeps Trash, history preservation and post-cleanup rescan explicit in Publisher',()=>{
  const p=read('src/PublisherOS.tsx'),del=read('src-tauri/src/local_delete.rs');
  expect(p).toContain('postUploadCleanupEligible(currentProof,j)');
  expect(p).toContain('api.youtubeFileFingerprint');
  expect(p).toContain('fp.fingerprint.toLowerCase()!==proof.sha256.toLowerCase()||fp.size!==proof.fileSize');
  expect(p).toContain('Переместить в Корзину');
  expect(p).toContain('if(deleteFromDisk&&channelRenderFolder)void scanRenderFolder()');
  expect(p).toContain('replaceUploadHistory(nextHistory)');
  expect(del).toContain('trash::delete(&safe)');
  expect(del).not.toContain('fs::remove_file(&safe)');
 });
 it('uses live YouTube country first and never guesses YouTube language from local RU',()=>{
  const live=normalizeChannelStatistics({country:'US',defaultLanguage:'en',statisticsUpdatedAt:'2026-09-23T10:00:00Z'} as any,{country:'RU',defaultLanguage:'ru'} as any);
  expect(channelCountrySource(live,'GB','Россия')).toBe('US');
  expect(channelCountrySource(undefined,'US','Россия')).toBe('US');
  expect(channelCountrySource(undefined,undefined,'Россия')).toBe('Россия');
  expect(channelLanguageSource(live,'ru')).toBe('en');
  expect(channelLanguageSource(undefined,undefined)).toBe('—');
  const bar=read('src/YouTubeChannelBar.tsx'),rust=read('src-tauri/src/youtube.rs');
  expect(bar).toContain('Страна канала');
  expect(bar).toContain('Язык YouTube');
  expect(bar).not.toContain("active?.analytics?.channelLanguage||active?.language");
  expect(rust).toContain('"country":sn.get("country")');
  expect(rust).toContain('"defaultLanguage":sn.get("defaultLanguage")');
 });
});
