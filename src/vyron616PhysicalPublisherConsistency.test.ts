import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {UploadHistoryRecord,VideoJob} from './types';

if(typeof (globalThis as any).window==='undefined'){
  Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});
}

const fx=vi.hoisted(()=>({
  root:'/Volumes/TOSHIBA EXT/Render/Consistency',
  files:[] as Array<{path:string;name:string;size:number;modifiedAt:number;fingerprint:string}>,
  youtubeUploadVideo:vi.fn(),
}));

vi.mock('./api',()=>({
  api:{
    localSourceStatus:vi.fn(async(path:string)=>({exists:path===fx.root,isFile:false,path})),
    scanRenderFolder:vi.fn(async()=>({root:fx.root,files:fx.files.map(x=>({...x})),truncated:false})),
    youtubeFileFingerprint:vi.fn(async(path:string)=>{
      const f=fx.files.find(x=>x.path===path);
      if(!f)throw new Error('FILE_NOT_FOUND');
      return{fingerprint:f.fingerprint,size:f.size,modifiedAt:f.modifiedAt};
    }),
    saveState:vi.fn(async()=>({ok:true})),
    youtubeUploadVideo:fx.youtubeUploadVideo,
  }
}));

import {useApp} from './store';
import {resetLiveInventoryForTests,scanInventoryChannel,useLiveInventory} from './renderInventoryRuntime';
import {usePublisherDerived} from './publisherDerivedRuntime';
import {classifyUploadState} from './storageLifecycle';

const channelId='consistency';
const hash=(n:number)=>n.toString(16).padStart(64,'0').slice(-64);
const file=(n:number)=>({
  path:`${fx.root}/${String(n).padStart(3,'0')}.mov`,
  name:`${String(n).padStart(3,'0')}.mov`,
  size:500_000_000+n,
  modifiedAt:1_700_000_000_000+n,
  fingerprint:hash(n),
});
const job=(n:number,patch:Partial<VideoJob>={}):VideoJob=>({
  id:`job-${n}`,channelId,number:n,folder:fx.root,status:'READY_UPLOAD',
  createdAt:'2026-10-04T00:00:00.000Z',tracksCount:10,minTracks:10,
  finalPath:file(n).path,title:`VIDEO_${String(n).padStart(3,'0')}`,description:'',tags:[],
  storageLifecycle:'NEW',currentSourceFingerprint:hash(n),currentSourceFileSize:file(n).size,
  currentSourceModifiedAt:file(n).modifiedAt,sourceGenerationKey:`${channelId}:${hash(n)}:${file(n).size}`,
  ...patch,
});
const channel:any={
  id:channelId,name:'Consistency',slug:'consistency',enabled:true,renderFolderPath:fx.root,
  cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'EN',genre:'Music',
  country:'US',minTracks:10,targetDurationMin:120,
  seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:[],banned:[],aiPrompt:''},
};

function prime(jobs:VideoJob[],history:UploadHistoryRecord[]=[]){
  fx.files=jobs.map(j=>file(j.number));
  const fingerprintCache=Object.fromEntries(fx.files.map(f=>[f.path,{
    path:f.path,size:f.size,mtimeMs:f.modifiedAt,sha256:f.fingerprint,computedAt:'2026-10-04T00:00:00.000Z'
  }]));
  useApp.setState({channels:[channel],jobs,uploadHistory:history,fingerprintCache} as any);
  resetLiveInventoryForTests();
  fx.youtubeUploadVideo.mockClear();
}

describe('VYRON 6.1.6 physical READY / Publisher consistency',()=>{
  beforeEach(()=>prime([]));

  it('one scan repairs exact 20 READY / 19 ERROR contradiction through the real stores',async()=>{
    const jobs=Array.from({length:20},(_,i)=>job(i+1,i<19?{
      status:'ERROR',storageLifecycle:'FAILED',error:i%2
        ?'YOUTUBE_UPLOAD_INIT 400 Bad Request: invalidTags'
        :'UPLOAD_FAILED: old pre-accept failure',
    }:{}));
    prime(jobs);

    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(20);

    const fresh=useApp.getState().jobs.filter(j=>j.channelId===channelId);
    expect(fresh).toHaveLength(20);
    expect(fresh.every(j=>j.status==='READY_UPLOAD'&&j.storageLifecycle==='NEW'&&!j.error&&!j.removedFromPublishList)).toBe(true);
    expect(fresh.every(j=>classifyUploadState(j,[])==='NEW')).toBe(true);

    const derived=usePublisherDerived.getState().byChannel[channelId];
    expect(derived.counts.NEW).toBe(20);
    expect(derived.counts.ERRORS).toBe(0);
    expect(derived.selectableJobs).toHaveLength(20);
    expect(derived.filters.errors).toHaveLength(0);
    expect(derived.filters.new).toHaveLength(20);
    expect(fx.youtubeUploadVideo).not.toHaveBeenCalled();
  });

  it('legacy invalidTags and generic FAILED jobs both become immediately selectable after one scan',async()=>{
    const cases=[
      job(22,{status:'ERROR',storageLifecycle:'FAILED',error:'YOUTUBE_UPLOAD_INIT 400 invalidTags'}),
      job(23,{status:'ERROR',storageLifecycle:'FAILED',error:'network/pre-accept upload failure'}),
    ];
    prime(cases);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(2);
    const derived=usePublisherDerived.getState().byChannel[channelId];
    expect(derived.selectableJobIds.has('job-22')).toBe(true);
    expect(derived.selectableJobIds.has('job-23')).toBe(true);
    expect(derived.counts.ERRORS).toBe(0);
  });

  it('does not restore TRASHED_BY_VYRON + YouTube ID when identical bytes still exist',async()=>{
    const trashed=job(11,{
      status:'SCHEDULED',storageLifecycle:'TRASHED_BY_VYRON',youtubeVideoId:'abc123',
      uploadedAt:'2026-10-03T00:00:00.000Z',
    });
    prime([trashed]);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(0);
    const fresh=useApp.getState().jobs.find(j=>j.id===trashed.id)!;
    expect(fresh.storageLifecycle).toBe('TRASHED_BY_VYRON');
    expect(fresh.youtubeVideoId).toBe('abc123');
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobs).toHaveLength(0);
    expect(fx.youtubeUploadVideo).not.toHaveBeenCalled();
  });

  it('trusted successful SHA256 + size proof remains duplicate-protected',async()=>{
    const failed=job(12,{status:'ERROR',storageLifecycle:'FAILED',error:'old upload error'});
    const proof:UploadHistoryRecord={
      id:'history-12',jobId:failed.id,channelId,profileId:'profile',youtubeChannelId:'YT',
      youtubeVideoId:'yt-12',localFilePath:failed.finalPath!,originalFilename:'012.mov',
      titleAtUpload:'VIDEO_012',uploadedAt:'2026-10-03T00:00:00.000Z',
      fileSize:file(12).size,sha256:hash(12),publishAt:'2026-10-03T01:00:00.000Z',
      status:'UPLOADED',fingerprintProofSource:'UPLOAD_TIME',proofSchemaVersion:1,sourceLifecycle:'PRESENT',
    };
    prime([failed],[proof]);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(0);
    expect(useApp.getState().jobs.find(j=>j.id===failed.id)?.storageLifecycle).toBe('FAILED');
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobs).toHaveLength(0);
    expect(fx.youtubeUploadVideo).not.toHaveBeenCalled();
  });

  it('does not reset a queued current physical job to NEW',async()=>{
    const queued=job(24,{storageLifecycle:'QUEUED'});
    prime([queued]);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(0);
    expect(useApp.getState().jobs.find(j=>j.id===queued.id)?.storageLifecycle).toBe('QUEUED');
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobs).toHaveLength(0);
  });

  it('final snapshot and derived runtime are based on the same fresh patched store revision',async()=>{
    const failed=job(25,{status:'ERROR',storageLifecycle:'FAILED',error:'UPLOAD_FAILED'});
    prime([failed]);
    await scanInventoryChannel(channelId,'publisher');

    const snapshot=useLiveInventory.getState().snapshots[channelId];
    const canonical=useApp.getState().jobs.find(j=>j.id===failed.id)!;
    const derived=usePublisherDerived.getState().byChannel[channelId];

    expect(snapshot.readyVideos).toBe(1);
    expect(canonical.status).toBe('READY_UPLOAD');
    expect(canonical.storageLifecycle).toBe('NEW');
    expect(derived.uploadStateById.get(failed.id)).toBe('NEW');
    expect(derived.selectableJobIds.has(failed.id)).toBe(true);
    expect(derived.filters.errors.some(j=>j.id===failed.id)).toBe(false);
    expect(derived.filters.new.some(j=>j.id===failed.id)).toBe(true);
  });
});
