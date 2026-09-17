import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import type {ImmutableUploadJob,UploadQueueEntry,UploadQueueSnapshot} from './uploadQueue';
import {errorAttributionParts} from './errorHistory';
import {uploadFailureHistoryMeta} from './uploadQueueRuntime';

const queueFixture=vi.hoisted(()=>({snapshot:{concurrency:2,queued:[],running:[],recent:[]} as UploadQueueSnapshot}));
vi.mock('./uploadQueueRuntime',async importOriginal=>{
  const actual=await importOriginal<typeof import('./uploadQueueRuntime')>();
  return{...actual,uploadQueueSnapshot:()=>queueFixture.snapshot,subscribeUploadQueue:()=>()=>{}};
});
vi.mock('./uploadTelemetry',async importOriginal=>{
  const actual=await importOriginal<typeof import('./uploadTelemetry')>();
  return{...actual,uploadTelemetrySnapshot:()=>({version:0,active:[]}),subscribeUploadTelemetry:()=>()=>{}};
});
vi.mock('./uploadCenterUi',()=>({uploadCenterOpen:()=>true,subscribeUploadCenterUi:()=>()=>{},closeUploadCenter:()=>{},openUploadCenter:()=>{}}));
vi.mock('./store',()=>({useApp:(selector:(state:any)=>unknown)=>selector({channels:[],jobs:[]})}));

import {UploadCenterGlobal} from './UploadCenter';

function spec(jobId:string,channelId:string):ImmutableUploadJob{return{jobId,projectId:`project-${jobId}`,localVideoIdentity:`local-${jobId}`,videoNumber:Number(jobId.replace(/\D/g,''))||1,channelId,channelName:`Channel ${channelId}`,profileId:`profile-${channelId}`,filePath:`/tmp/${jobId}.mp4`,fingerprint:`fingerprint-${jobId}`,fileSize:123,modifiedAt:1,publishAt:'2030-01-01T00:00:00Z',title:`Title ${jobId}`,description:'desc',tags:['tag'],categoryId:'10',quotaOperations:[{method:'videos.insert',count:1}],allowDuplicate:false,submittedAt:'2026-09-17T10:00:00Z'}}
function terminal(state:'SUCCEEDED'|'FAILED',jobId:string,channelId:string,error?:string):UploadQueueEntry{return{queueId:`q-${jobId}`,spec:spec(jobId,channelId),state,submittedSequence:1,startedAt:'2026-09-17T10:00:01Z',finishedAt:'2026-09-17T10:01:00Z',error}}

describe('VYRON 2.1.6 final acceptance regressions',()=>{
 it('upload failure attribution is immutable and complete enough for Error Center channel/project diagnosis',()=>{const s=spec('j7','A');const meta=uploadFailureHistoryMeta(s,'UPLOAD_FAILED');expect(meta).toEqual(expect.objectContaining({channelId:'A',profileId:'profile-A',projectId:'project-j7',videoId:'j7',filePath:'/tmp/j7.mp4',stage:'upload-transfer',errorCode:'UPLOAD_FAILED'}));expect(errorAttributionParts({...meta})).toEqual(['channel:A','project:project-j7','video:j7','file:/tmp/j7.mp4','profile:profile-A'])});
 it('Global Upload Center renders both successful and failed terminal queue entries with factual identity',()=>{queueFixture.snapshot={concurrency:2,queued:[],running:[],recent:[terminal('FAILED','j2','B','network broke'),terminal('SUCCEEDED','j1','A')]};const html=renderToStaticMarkup(React.createElement(UploadCenterGlobal));expect(html).toContain('FAILED');expect(html).toContain('network broke');expect(html).toContain('Channel B');expect(html).toContain('SUCCEEDED');expect(html).toContain('Channel A');expect(html).toContain('VIDEO_002');expect(html).toContain('VIDEO_001')});
});
