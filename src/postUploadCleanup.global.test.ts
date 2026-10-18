import {describe,expect,it} from 'vitest';
import type {UploadHistoryRecord,VideoJob} from './types';
import {confirmedGlobalCleanupCandidates,postUploadCleanupEligible} from './postUploadCleanup';

const SHA='a'.repeat(64);
function job(id:string,path=`/Render/${id}.mp4`):VideoJob{return{id,channelId:'c-'+id,number:1,folder:id,status:'SCHEDULED',createdAt:'2026-10-18T00:00:00.000Z',tracksCount:1,minTracks:1,title:id,description:'',tags:[],finalPath:path,currentSourceFingerprint:SHA,currentSourceFileSize:100,storageLifecycle:'UPLOADED'}}
function row(id:string,path=`/Render/${id}.mp4`,patch:Partial<UploadHistoryRecord>={}):UploadHistoryRecord{return{id:'r-'+id,jobId:id,channelId:'c-'+id,profileId:'p-'+id,youtubeVideoId:'yt-'+id,localFilePath:path,originalFilename:`${id}.mp4`,uploadedAt:'2026-10-18T00:00:00.000Z',fileSize:100,sha256:SHA,status:'UPLOADED',fingerprintProofSource:'UPLOAD_TIME',sourceLifecycle:'PRESENT',processingState:'READY',identityVerifiedAt:'2026-10-18T00:01:00.000Z',remoteExists:true,...patch}}

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
  const same='/Render/same.mp4',a=job('a',same),b=job('b',same);
  expect(confirmedGlobalCleanupCandidates([row('a',same),row('b',same)],[a,b])).toEqual([]);
 });
 it('fails safe on ambiguous identical media proof even through aliased paths',()=>{
  const a=job('a','/Render/a.mp4'),b=job('b','/Alias/a.mp4');
  expect(confirmedGlobalCleanupCandidates([row('a',a.finalPath),row('b',b.finalPath)],[a,b])).toEqual([]);
 });
});
