import {describe,expect,it} from 'vitest';
import type {UploadHistoryRecord,VideoJob} from './types';
import {confirmedGlobalCleanupCandidates,postUploadCleanupEligible} from './postUploadCleanup';

function sha(id:string){return id.charCodeAt(0).toString(16).padStart(2,'0').repeat(32)}
function job(id:string,path=`/Render/${id}.mp4`,fingerprint=sha(id)):VideoJob{return{id,channelId:'c-'+id,number:1,folder:id,status:'SCHEDULED',createdAt:'2026-10-18T00:00:00.000Z',tracksCount:1,minTracks:1,title:id,description:'',tags:[],finalPath:path,currentSourceFingerprint:fingerprint,currentSourceFileSize:100,storageLifecycle:'UPLOADED'}}
function row(id:string,path=`/Render/${id}.mp4`,patch:Partial<UploadHistoryRecord>={}):UploadHistoryRecord{return{id:'r-'+id,jobId:id,channelId:'c-'+id,profileId:'p-'+id,youtubeVideoId:'yt-'+id,localFilePath:path,originalFilename:`${id}.mp4`,uploadedAt:'2026-10-18T00:00:00.000Z',fileSize:100,sha256:sha(id),status:'UPLOADED',fingerprintProofSource:'UPLOAD_TIME',sourceLifecycle:'PRESENT',processingState:'READY',identityVerifiedAt:'2026-10-18T00:01:00.000Z',remoteExists:true,...patch}}

describe('global post-upload cleanup',()=>{
 it('requires READY and excludes processing/failed/uncertain records',()=>{
  const j=job('a');
  expect(postUploadCleanupEligible(row('a'),j)).toBe(true);
  expect(postUploadCleanupEligible(row('a',j.finalPath,{processingState:'YOUTUBE_PROCESSING'}),j)).toBe(false);
  expect(postUploadCleanupEligible(row('a',j.finalPath,{processingState:'PROCESSING_FAILED'}),j)).toBe(false);
  expect(postUploadCleanupEligible(row('a',j.finalPath,{youtubeVideoId:''}),j)).toBe(false);
  expect(postUploadCleanupEligible(row('a',j.finalPath,{fingerprintProofSource:'UNKNOWN'}),j)).toBe(false);
 });
 it('aggregates multiple channels and excludes blocked resumable/active jobs',()=>{
  const jobs=[job('a'),job('b'),job('c')],history=jobs.map(x=>row(x.id,x.finalPath));
  const result=confirmedGlobalCleanupCandidates(history,jobs,['c'],[jobs[1].finalPath!]);
  expect(result.map(x=>x.jobId)).toEqual(['a']);
 });
 it('never counts one physical path twice',()=>{
  const same='/Render/same.mp4',sameSha='f'.repeat(64),a=job('a',same,sameSha),b=job('b',same,sameSha);
  expect(confirmedGlobalCleanupCandidates([row('a',same,{sha256:sameSha}),row('b',same,{sha256:sameSha})],[a,b])).toEqual([]);
 });
 it('fails safe on ambiguous identical media proof even through aliased paths',()=>{
  const sameSha='e'.repeat(64),a=job('a','/Render/a.mp4',sameSha),b=job('b','/Alias/a.mp4',sameSha);
  expect(confirmedGlobalCleanupCandidates([row('a',a.finalPath,{sha256:sameSha}),row('b',b.finalPath,{sha256:sameSha})],[a,b])).toEqual([]);
 });
});
