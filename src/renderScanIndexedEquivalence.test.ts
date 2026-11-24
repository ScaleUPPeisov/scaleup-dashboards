import {describe,expect,it} from 'vitest';
import {classifyChannelRenderFiles} from './renderScanClassifier';
import {classifyChannelRenderFiles as reference} from '../tests/helpers/renderScanClassifierReference';
import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord,VideoJob} from './types';

// Deterministic fixtures exercise collision ordering, generations, stale paths,
// duplicate files and mixed trusted/untrusted histories without user data.
function fixtures(seed:number,channelId:string,jobCount:number,fileCount:number,historyCount:number){
 let value=seed>>>0;
 const next=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value};
 const pick=<T>(xs:readonly T[])=>xs[next()%xs.length];
 const hashes=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64),'not-a-hash'];
 const root='/fixture/'+channelId;
 const jobs:VideoJob[]=Array.from({length:jobCount},(_,i)=>{
  const number=(next()%24)+1,previous=i&&next()%5===0?'j'+(next()%i):undefined;
  const status=pick(['READY_RENDER','RENDERING','READY_UPLOAD','UPLOADING','SCHEDULED'] as const);
  const path=next()%7===0?'/other/'+number+'.mp4':root+'/'+String(number).padStart(3,'0')+'.mp4';
  return {id:'j'+i,channelId:next()%7===0?'other':channelId,number,status,createdAt:pick(['2024-01-01T00:00:00Z','2025-02-01T00:00:00Z','invalid']),
   finalPath:next()%6===0?undefined:path,sourcePreviousJobId:previous,sourceOrigin:next()%5===0?'render-scan':undefined,
   storageLifecycle:pick(['NEW','UPLOADED','TRASHED','UPLOADING',undefined] as const),
   youtubeVideoId:next()%6===0?'video-'+i:undefined,uploadedAt:next()%9===0?'2025-01-01T00:00:00Z':undefined,
   currentSourceFingerprint:pick(hashes),currentSourceFileSize:pick([1,2,3,100,undefined])} as VideoJob;
 });
 const history:UploadHistoryRecord[]=Array.from({length:historyCount},(_,i)=>{
  const job=jobs[next()%jobs.length],number=(next()%24)+1;
  return {id:'h'+i,jobId:next()%3===0?job?.id:undefined,channelId:next()%5===0?'other':channelId,status:next()%7===0?'FAILED':'UPLOADED',
   youtubeVideoId:next()%5===0?'':'remote-'+i,localFilePath:next()%2===0?(job?.finalPath||''):root+'/'+String(number).padStart(3,'0')+'.mp4',
   sha256:pick(hashes),fileSize:pick([1,2,3,100,0]),fingerprintProofSource:pick(['UPLOAD_TIME','UPLOAD_RESUME_TIME','UNKNOWN'] as const),
   uploadedAt:'2025-01-01T00:00:00Z',staleLinkClearedAt:next()%8===0?'2025-01-01T00:00:00Z':undefined} as UploadHistoryRecord;
 });
 const files:RenderFolderVideoFile[]=Array.from({length:fileCount},(_,i)=>{
  const n=(next()%28)+1,name=next()%11===0?'unlabelled.mp4':String(n).padStart(3,'0')+'.mp4';
  return {name,path:next()%13===0?'/other/'+name:root+'/'+name,size:pick([1,2,3,100,0]),fingerprint:next()%4===0?undefined:pick(hashes)};
 });
 return {root,jobs,history,files};
}

describe('indexed render classification matches the original decisions',()=>{
 it('preserves full results across mixed generations, duplicate paths and evidence',()=>{
  for(let seed=1;seed<=32;seed++){
   const {root,jobs,history,files}=fixtures(seed,'channel',60,65,60);
   expect(classifyChannelRenderFiles(files,jobs,history,'channel',root)).toEqual(reference(files,jobs,history,'channel',root));
  }
 });
 it('preserves classifications for 33 separate synthetic channels',()=>{
  for(let i=0;i<33;i++){
   const channelId='channel-'+i,{root,jobs,history,files}=fixtures(i+101,channelId,90,120,70);
   expect(classifyChannelRenderFiles(files,jobs,history,channelId,root)).toEqual(reference(files,jobs,history,channelId,root));
  }
 });
 it('avoids rereading all job paths for every file in a large scan',()=>{
  let pathReads=0;
  const root='/fixture/large';
  const jobs=Array.from({length:200},(_,i)=>{
   const job={id:'j'+i,channelId:'large',number:i+1,status:'READY_UPLOAD',createdAt:'2025-01-01T00:00:00Z'} as VideoJob;
   Object.defineProperty(job,'finalPath',{enumerable:true,get:()=>{pathReads++;return root+'/'+(i+1)+'.mp4'}});
   return job;
  });
  const files=Array.from({length:1000},(_,i)=>({name:(i+1)+'.mp4',path:root+'/'+(i+1)+'.mp4',size:100}));
  const actual=classifyChannelRenderFiles(files,jobs,[],'large',root);
  expect(actual).toHaveLength(files.length);
  expect(pathReads).toBeLessThan(1200);
 });
 it('preserves duplicate evidence priority and non-finite file sizes',()=>{
  const {root,jobs,history,files}=fixtures(81,'channel',20,20,20);
  files.push({...files[0],size:Number.NaN},{...files[1],path:root+'/outside-sequence.mp4',size:Infinity});
  expect(classifyChannelRenderFiles(files,jobs,history,'channel',root)).toEqual(reference(files,jobs,history,'channel',root));
 });
 it('keeps newest verified upload and first matching active job precedence',()=>{
  const root='/fixture/priority',hash='a'.repeat(64);
  const file={name:'001.mp4',path:root+'/001.mp4',size:50,fingerprint:hash};
  const job=(id:string)=>({id,channelId:'c',number:1,status:'READY_UPLOAD',createdAt:'2025-01-01T00:00:00Z',finalPath:file.path,currentSourceFingerprint:hash,currentSourceFileSize:50}) as VideoJob;
  const upload=(id:string)=>({id,jobId:'old',channelId:'c',status:'UPLOADED',youtubeVideoId:'yt-'+id,localFilePath:file.path,sha256:hash,fileSize:50,fingerprintProofSource:'UPLOAD_TIME'}) as UploadHistoryRecord;
  const jobs=[job('first'),job('second')],history=[upload('old'),upload('new')];
  const uploaded=classifyChannelRenderFiles([file],jobs,history,'c',root);
  expect(uploaded).toEqual(reference([file],jobs,history,'c',root));
  expect(uploaded[0].matchedHistoryId).toBe('new');
  const active=classifyChannelRenderFiles([file],jobs,[],'c',root);
  expect(active).toEqual(reference([file],jobs,[],'c',root));
  expect(active[0].matchedJobId).toBe('first');
 });
});
