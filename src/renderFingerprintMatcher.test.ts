import {describe,expect,it} from 'vitest';
import {createRenderFingerprintMatcher,renderFileNeedsFingerprint} from './renderScanClassifier';
import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord,VideoJob} from './types';

const root='/fixture/render';
const file=(path:string,name:string,size=123):RenderFolderVideoFile=>({path,name,size,modifiedAt:1});
const job=(patch:Partial<VideoJob>)=>({id:'job',channelId:'c1',number:5,finalPath:root+'/known.mov',...patch}) as VideoJob;
const record=(patch:Partial<UploadHistoryRecord>)=>({channelId:'c1',status:'UPLOADED',youtubeVideoId:'yt',localFilePath:root+'/uploaded.mov',sha256:'a'.repeat(64),fileSize:777,fingerprintProofSource:'UPLOAD_TIME',...patch}) as UploadHistoryRecord;

describe('prepared render fingerprint decisions',()=>{
 it('matches the existing decision for paths, numbers, provenance and other channels',()=>{
  const jobs=[job({}),job({channelId:'c2',number:6,finalPath:root+'/other-channel.mov'}),job({id:'second',number:8,finalPath:'C:\\fixture\\render\\windows.mov'})];
  const history=[record({}),record({channelId:'c2',localFilePath:root+'/other-upload.mov',fileSize:555}),record({localFilePath:root+'/stale.mov',staleLinkClearedAt:'now',fileSize:444}),record({localFilePath:root+'/untrusted.mov',fingerprintProofSource:'UNKNOWN',fileSize:333})];
  const files=[file(root+'/known.mov','known.mov'),file(root+'/uploaded.mov','uploaded.mov'),file(root+'/different.mov','005 - ready.mov'),file(root+'/same-size.mov','random.mov',777),file(root+'/untrusted-size.mov','random.mov',333),file(root+'/stale-size.mov','random.mov',444),file(root+'/other-channel.mov','random.mov'),file(root+'/other-upload.mov','random.mov',555),file('/fixture/render-other/known.mov','005.mov'),file(root+'/unknown.mov','000.mov'),file(root+'/nested/x.mov','008 ready.mov')];
  const prepared=createRenderFingerprintMatcher(jobs,history,'c1',root);
  expect(files.map(prepared)).toEqual(files.map(f=>renderFileNeedsFingerprint(f,jobs,history,'c1',root)));
  expect(files.map(prepared)).toEqual([true,true,true,true,false,false,false,false,false,false,true]);
 });
 it('matches across synthetic 33-channel history and edge-case paths',()=>{
  const jobs=Array.from({length:330},(_,i)=>job({id:'j'+i,channelId:'c'+(i%33),number:i+1,finalPath:`${root}/${i}.mov`}));
  const history=Array.from({length:330},(_,i)=>record({channelId:'c'+(i%33),localFilePath:`${root}/uploaded-${i}.mov`,fileSize:i+1,fingerprintProofSource:i%2?'UPLOAD_TIME':'UNKNOWN'}));
  const files=Array.from({length:1000},(_,i)=>file(i%9===0?`/fixture/render-other/${i}.mov`:`${root}/${i}.mov`,i%7===0?`00${i+1} video.mov`:`video-${i}.mov`,i+1));
  for(let i=0;i<33;i++){
   const id='c'+i,prepared=createRenderFingerprintMatcher(jobs,history,id,root);
   expect(files.map(prepared)).toEqual(files.map(f=>renderFileNeedsFingerprint(f,jobs,history,id,root)));
  }
 });
});
