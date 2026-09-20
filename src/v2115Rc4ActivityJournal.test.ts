import {describe,expect,it} from 'vitest';
import {activityEvent,appendJournalEvent,cleanupPreclassification,dailySummary,effectiveSourceLifecycle,legacyMetadataJournal,legacyUploadJournal,normalizeActivityJournal} from './activityJournalCore';
import {cleanupEligibleUpload,markHistorySourceState,markHistoryTrashed} from './storageLifecycle';
import type {ActivityEvent,Channel,UploadHistoryRecord,VideoJob} from './types';

const channel={id:'c1',name:'Neon Drive FM'} as Channel;
const upload=(patch:Partial<UploadHistoryRecord>={}):UploadHistoryRecord=>({
 id:'h1',jobId:'j1',channelId:'c1',profileId:'p1',youtubeChannelId:'UC1',youtubeVideoId:'yt1',
 localFilePath:'/tmp/VIDEO_001.mp4',originalFilename:'VIDEO_001.mp4',uploadedAt:'2026-09-20T07:00:00Z',
 fileSize:100,sha256:'a'.repeat(64),status:'UPLOADED',processingState:'READY',readyAt:'2026-09-20T07:20:00Z',
 identityVerifiedAt:'2026-09-20T07:20:00Z',sourceLifecycle:'PRESENT',remoteExists:true,...patch
});
const job:VideoJob={id:'j1',channelId:'c1',number:1,folder:'/tmp/VIDEO_001',status:'SCHEDULED',createdAt:'2026-09-20T07:00:00Z',tracksCount:10,minTracks:10,title:'One',description:'',tags:[],finalPath:'/tmp/VIDEO_001.mp4',storageLifecycle:'UPLOADED',uploadFingerprint:'a'.repeat(64)};

describe('VYRON 2.1.15 RC4 persistent activity journal',()=>{
 it('reconstructs only provable legacy upload facts and is idempotent against live events',()=>{
  const first=legacyUploadJournal([upload()],[channel],[]);
  expect(first.map(x=>x.eventType)).toEqual(['UPLOAD_ACCEPTED','YOUTUBE_READY']);
  expect(first.every(x=>x.source==='RECONSTRUCTED')).toBe(true);
  const live=[activityEvent({eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',source:'LIVE_OPERATION',channelId:'c1',jobId:'j1',youtubeVideoId:'yt1'})];
  expect(legacyUploadJournal([upload()],[channel],live).some(x=>x.eventType==='UPLOAD_ACCEPTED')).toBe(false);
 });

 it('never fabricates legacy metadata when no persisted metadata evidence exists',()=>{
  expect(legacyMetadataJournal([],[])).toEqual([]);
  const rows=[{operationId:'m1',at:'2026-09-20T08:00:00Z',channelId:'c1',channelName:'Neon Drive FM',selectedVideoCount:20,changedVideoCount:20,changedFields:['description','tags'],status:'success' as const,metadataOk:20,total:20,scheduleOk:0,scheduleTotal:0,failed:0}];
  const out=legacyMetadataJournal(rows,[]);
  expect(out).toHaveLength(1);
  expect(out[0].source).toBe('LEGACY_IMPORT');
  expect(out[0].details?.changed).toBe(20);
 });

 it('aggregates twenty factual accepted uploads in one day without file-system dependence',()=>{
  const events:ActivityEvent[]=Array.from({length:20},(_,i)=>activityEvent({eventId:'u'+i,eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:'2026-09-20T10:'+String(i).padStart(2,'0')+':00Z',batchId:'batch-20',channelId:'c1',jobId:'j'+i,youtubeVideoId:'yt'+i}));
  const summary=dailySummary(events,'c1');
  const row=Object.values(summary)[0];
  expect(row.uploaded).toBe(20);
 });

 it('aggregates factual metadata field counts',()=>{
  const at='2026-09-20T10:00:00Z';
  const events=[
   activityEvent({eventId:'m',eventType:'METADATA_UPDATE_SUCCEEDED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:at,channelId:'c1',details:{changed:20}}),
   activityEvent({eventId:'d',eventType:'DESCRIPTION_UPDATED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:at,channelId:'c1',details:{count:20}}),
   activityEvent({eventId:'t',eventType:'TAGS_UPDATED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:at,channelId:'c1',details:{count:18}}),
   activityEvent({eventId:'s',eventType:'SCHEDULE_UPDATED',status:'SUCCESS',source:'LIVE_OPERATION',timestamp:at,channelId:'c1',details:{count:12}})
  ];
  const row=Object.values(dailySummary(events,'c1'))[0];
  expect(row.metadata).toBe(20);expect(row.description).toBe(20);expect(row.tags).toBe(18);expect(row.schedule).toBe(12);
 });

 it('append semantics deduplicate stable event ids and migration normalization is idempotent',()=>{
  const e=activityEvent({eventId:'same',eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',source:'LIVE_OPERATION',channelId:'c1'});
  expect(appendJournalEvent(appendJournalEvent([],e),e)).toHaveLength(1);
  expect(normalizeActivityJournal(normalizeActivityJournal([e]))).toEqual([e]);
 });

 it('never persists obvious secret fields in journal details',()=>{
  const e=activityEvent({eventType:'OAUTH_RECONNECT',status:'SUCCESS',source:'LIVE_OPERATION',details:{refresh_token:'secret',clientSecret:'secret2',scope:'GLOBAL'} as any});
  expect(e.details?.refresh_token).toBeUndefined();
  expect((e.details as any)?.clientSecret).toBeUndefined();
  expect(e.details?.scope).toBe('GLOBAL');
 });

 it('local missing does not erase remote upload history or turn it into upload pending',()=>{
  const row=upload({sourceLifecycle:'MISSING_LEGACY_UNKNOWN'});
  expect(row.youtubeVideoId).toBe('yt1');
  expect(row.status).toBe('UPLOADED');
  expect(effectiveSourceLifecycle(row)).toBe('MISSING_LEGACY_UNKNOWN');
  expect(cleanupEligibleUpload(row,job)).toBe(false);
 });

 it('cleanup candidates contain only READY + PRESENT + verified identity',()=>{
  const ready=upload(),processing=upload({id:'h2',jobId:'j2',youtubeVideoId:'yt2',processingState:'YOUTUBE_PROCESSING'}),missing=upload({id:'h3',jobId:'j3',youtubeVideoId:'yt3',sourceLifecycle:'MISSING_LEGACY_UNKNOWN'}),changed=upload({id:'h4',jobId:'j4',youtubeVideoId:'yt4',sourceLifecycle:'SOURCE_CHANGED'}),remoteMissing=upload({id:'h5',jobId:'j5',youtubeVideoId:'yt5',remoteExists:false});
  const c=cleanupPreclassification([ready,processing,missing,changed,remoteMissing],[job]);
  expect(c.eligible.map(x=>x.id)).toEqual(['h1']);
  expect(c.processing.map(x=>x.id)).toContain('h2');
  expect(c.alreadyMissing.map(x=>x.id)).toContain('h3');
  expect(c.changed.map(x=>x.id)).toContain('h4');
  expect(cleanupEligibleUpload(remoteMissing)).toBe(false);
 });

 it('Trash is recorded only after successful lifecycle transition and survives normalization',()=>{
  const at='2026-09-20T12:00:00Z',rows=markHistoryTrashed([upload()],'j1',at,'trash-b1');
  expect(rows[0].sourceLifecycle).toBe('TRASHED_BY_VYRON');
  expect(rows[0].trashedAt).toBe(at);
  expect(rows[0].trashOperationId).toBe('trash-b1');
  expect(effectiveSourceLifecycle(rows[0])).toBe('TRASHED_BY_VYRON');
 });

 it('failed/missing source classification leaves history intact',()=>{
  const rows=markHistorySourceState([upload()],'h1','MISSING_LEGACY_UNKNOWN','2026-09-20T13:00:00Z');
  expect(rows).toHaveLength(1);expect(rows[0].youtubeVideoId).toBe('yt1');expect(rows[0].sourceLifecycle).toBe('MISSING_LEGACY_UNKNOWN');
 });
});
