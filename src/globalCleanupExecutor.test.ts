import {describe,expect,it,vi} from 'vitest';
import type {UploadHistoryRecord} from './types';
import {executeGlobalCleanup} from './globalCleanupExecutor';

const SHA='a'.repeat(64);
function row(id:string):UploadHistoryRecord{return{id,jobId:id,channelId:'c',profileId:'p',youtubeVideoId:'yt-'+id,localFilePath:'/Render/'+id+'.mp4',originalFilename:id+'.mp4',uploadedAt:'2026-10-18T00:00:00Z',fileSize:100,sha256:SHA,status:'UPLOADED',fingerprintProofSource:'UPLOAD_TIME',sourceLifecycle:'PRESENT',processingState:'READY',identityVerifiedAt:'2026-10-18T00:01:00Z'}}

describe('global cleanup executor',()=>{
 it('uses only injected Trash operation and preserves partial failures',async()=>{
  const trash=vi.fn(async(path:string)=>path.endsWith('a.mp4')?{trashed:true,missing:false}:{trashed:false,missing:false});
  const result=await executeGlobalCleanup([row('a'),row('b')],{
   localStatus:async()=>({exists:true,isFile:true,size:100}),
   fingerprint:async()=>({fingerprint:SHA,size:100}),
   trash,
   allowedRoots:()=>['/Render']
  });
  expect(trash).toHaveBeenCalledTimes(2);
  expect(result.moved).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.rows.map(x=>x.status)).toEqual(['MOVED','TRASH_FAILED']);
 });
 it('never calls Trash when source proof changed',async()=>{
  const trash=vi.fn();
  const result=await executeGlobalCleanup([row('a')],{
   localStatus:async()=>({exists:true,isFile:true,size:100}),
   fingerprint:async()=>({fingerprint:'b'.repeat(64),size:100}),
   trash:trash as any,
   allowedRoots:()=>['/Render']
  });
  expect(trash).not.toHaveBeenCalled();
  expect(result.rows[0].status).toBe('SOURCE_CHANGED');
 });
});
