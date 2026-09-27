import {describe,expect,it} from 'vitest';
import {completedRenderEvidenceId,completedRenderPatch} from './renderLifecycle';
import type {VideoJob} from './types';

const job=(patch:Partial<VideoJob>={}):VideoJob=>({
 id:'job-1',channelId:'c1',number:1,folder:'C:\\Projects\\001',status:'SCHEDULED',
 createdAt:'2026-09-27T00:00:00Z',tracksCount:10,minTracks:10,
 finalPath:'C:\\Render\\Video 001.mp4',title:'x',description:'',tags:[],
 storageLifecycle:'UPLOADED',youtubeVideoId:'YT-OLD',uploadedAt:'2026-09-27T03:00:00Z',
 uploadFingerprint:'old-sha',...patch
});
const row=(startedAt:string)=>({
 projectId:'project-1',jobId:'job-1',videoNumber:1,renderStatus:'Completed',
 outputFile:'C:\\Render\\Video 001.mp4',startedAt
});

describe('completed render lifecycle parity',()=>{
 it('seeds old completion evidence without rolling an already uploaded job back',()=>{
  const old=row('2026-09-27T02:00:00Z');
  const patch=completedRenderPatch(job(),'batch-old',old)!;
  expect(patch).toEqual({
   renderEvidenceId:completedRenderEvidenceId('batch-old',old),
   renderStartedAt:'2026-09-27T02:00:00Z'
  });
  expect(patch.status).toBeUndefined();
  expect(patch.youtubeVideoId).toBeUndefined();
 });
 it('is idempotent for the exact same completed render evidence',()=>{
  const old=row('2026-09-27T02:00:00Z');
  const id=completedRenderEvidenceId('batch-old',old);
  expect(completedRenderPatch(job({renderEvidenceId:id,renderStartedAt:old.startedAt}),'batch-old',old)).toBeNull();
 });
 it('newer physical render resets current upload markers but preserves history outside the job',()=>{
  const newer=row('2026-09-27T04:00:00Z');
  const patch=completedRenderPatch(job({renderEvidenceId:'batch-old|project-1|2026-09-27T02:00:00Z|old',renderStartedAt:'2026-09-27T02:00:00Z'}),'batch-new',newer)!;
  expect(patch).toEqual(expect.objectContaining({
   status:'READY_UPLOAD',storageLifecycle:'RENDERED',
   finalPath:'C:\\Render\\Video 001.mp4',
   renderEvidenceId:completedRenderEvidenceId('batch-new',newer),
   renderStartedAt:'2026-09-27T04:00:00Z',
   removedFromPublishList:false
  }));
  expect('youtubeVideoId' in patch).toBe(true);expect(patch.youtubeVideoId).toBeUndefined();
  expect('uploadedAt' in patch).toBe(true);expect(patch.uploadedAt).toBeUndefined();
  expect('uploadFingerprint' in patch).toBe(true);expect(patch.uploadFingerprint).toBeUndefined();
 });
 it('ignores an older completion after a newer render identity is already stored',()=>{
  const older=row('2026-09-27T01:00:00Z');
  expect(completedRenderPatch(job({renderEvidenceId:'new',renderStartedAt:'2026-09-27T04:00:00Z'}),'batch-old',older)).toBeNull();
 });
});
