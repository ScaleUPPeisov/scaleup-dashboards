import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord,VideoJob} from './types';

if(typeof (globalThis as any).window==='undefined'){
  Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});
}

const fx=vi.hoisted(()=>({
  root:'/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Aegean Afterglow',
  files:[] as RenderFolderVideoFile[],
  youtubeUploadVideo:vi.fn(),
}));

vi.mock('./api',()=>({
  api:{
    localSourceStatus:vi.fn(async(path:string)=>({exists:path===fx.root,isFile:false,path})),
    scanRenderFolder:vi.fn(async()=>({root:fx.root,files:fx.files.map(x=>({...x})),truncated:false})),
    youtubeFileFingerprint:vi.fn(async(path:string)=>{
      const f=fx.files.find(x=>x.path===path);
      if(!f)throw new Error('FILE_NOT_FOUND');
      return{fingerprint:f.fingerprint!,size:f.size,modifiedAt:f.modifiedAt!};
    }),
    saveState:vi.fn(async()=>({ok:true})),
    youtubeUploadVideo:fx.youtubeUploadVideo,
  }
}));

import {useApp} from './store';
import {resetLiveInventoryForTests,scanInventoryChannel} from './renderInventoryRuntime';
import {usePublisherDerived} from './publisherDerivedRuntime';
import {classifyChannelRenderFiles} from './renderScanClassifier';
import {reconcilePublisherInventory} from './publisherInventoryReconcile';

const channelId='aegean-afterglow';
const hash=(n:number)=>n.toString(16).padStart(64,'0').slice(-64);
const file=(n:number):RenderFolderVideoFile=>({
  path:`${fx.root}/VIDEO_${String(n).padStart(3,'0')}.mov`,
  name:`VIDEO_${String(n).padStart(3,'0')}.mov`,
  size:500_000_000+n,
  modifiedAt:1_700_000_000_000+n,
  fingerprint:hash(n),
});
const job=(id:string,n:number,patch:Partial<VideoJob>={}):VideoJob=>({
  id,channelId,number:n,folder:fx.root,status:'READY_UPLOAD',
  createdAt:`2026-10-04T00:${String(n%60).padStart(2,'0')}:00.000Z`,
  tracksCount:10,minTracks:10,finalPath:file(n).path,
  title:`VIDEO_${String(n).padStart(3,'0')}`,description:'',tags:[],
  storageLifecycle:'NEW',currentSourceFingerprint:hash(n),
  currentSourceFileSize:file(n).size,currentSourceModifiedAt:file(n).modifiedAt??undefined,
  sourceGenerationKey:`${channelId}:${hash(n)}:${file(n).size}`,
  ...patch,
});
const channel:any={
  id:channelId,name:'Aegean Afterglow',slug:'aegean-afterglow',enabled:true,renderFolderPath:fx.root,
  cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'EN',genre:'Music',
  country:'US',minTracks:10,targetDurationMin:120,
  seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:[],banned:[],aiPrompt:''},
};

function prime(jobs:VideoJob[],files:RenderFolderVideoFile[],history:UploadHistoryRecord[]=[]){
  fx.files=files;
  const fingerprintCache=Object.fromEntries(files.map(f=>[f.path,{
    path:f.path,size:f.size,mtimeMs:f.modifiedAt!,sha256:f.fingerprint!,computedAt:'2026-10-04T00:00:00.000Z'
  }]));
  useApp.setState({channels:[channel],jobs,uploadHistory:history,fingerprintCache} as any);
  resetLiveInventoryForTests();
  fx.youtubeUploadVideo.mockClear();
}

describe('VYRON 6.1.7 current generation leaf recovery',()=>{
  beforeEach(()=>prime([],[]));

  it('exact Aegean 20 ready / 19 leaf errors becomes 20 selectable and 0 stale errors after ONE scan',async()=>{
    const files=Array.from({length:20},(_,i)=>file(i+21));
    const jobs:VideoJob[]=[job('leaf-21',21)];

    for(let n=22;n<=40;n++){
      const previous=job(`previous-${n}`,n,{
        currentSourceFingerprint:undefined,currentSourceFileSize:undefined,currentSourceModifiedAt:undefined,
        sourceGenerationKey:undefined,status:'READY_UPLOAD',storageLifecycle:'NEW',
        createdAt:'2026-10-03T00:00:00.000Z',
      });
      const leaf=job(`leaf-${n}`,n,{
        sourcePreviousJobId:previous.id,status:'ERROR',storageLifecycle:'FAILED',
        error:'UPLOAD_FAILED',createdAt:'2026-10-04T00:00:00.000Z',
      });
      jobs.push(previous,leaf);
    }

    prime(jobs,files);
    const snapshot=await scanInventoryChannel(channelId,'publisher');

    expect(snapshot?.physicalFiles).toBe(20);
    expect(snapshot?.readyVideos).toBe(20);

    const fresh=useApp.getState().jobs;
    for(let n=22;n<=40;n++){
      const leaf=fresh.find(j=>j.id===`leaf-${n}`)!;
      expect(leaf.status).toBe('READY_UPLOAD');
      expect(leaf.storageLifecycle).toBe('NEW');
      expect(leaf.error).toBeUndefined();
      expect(leaf.removedFromPublishList).toBe(false);
      expect(leaf.currentSourceFingerprint).toBe(hash(n));
      expect(leaf.currentSourceFileSize).toBe(file(n).size);
    }

    const derived=usePublisherDerived.getState().byChannel[channelId];
    expect(derived.selectableJobs).toHaveLength(20);
    expect(derived.filters.new).toHaveLength(20);
    expect(derived.counts.ERRORS).toBe(0);
    expect(derived.filters.errors).toHaveLength(0);
    expect(derived.selectableJobs.map(j=>j.id).sort()).toEqual(
      ['leaf-21',...Array.from({length:19},(_,i)=>`leaf-${i+22}`)].sort()
    );
    expect(derived.selectableJobs.some(j=>j.id.startsWith('previous-'))).toBe(false);
    expect(fx.youtubeUploadVideo).not.toHaveBeenCalled();
  });

  it('classifier and reconciliation patch the unsuperseded leaf, never its predecessor',()=>{
    const current=file(22);
    const previous=job('previous-22',22,{
      currentSourceFingerprint:undefined,currentSourceFileSize:undefined,
      status:'ERROR',storageLifecycle:'FAILED',error:'OLD_PREDECESSOR_ERROR',
      createdAt:'2026-10-03T00:00:00.000Z',
    });
    const leaf=job('leaf-22',22,{
      sourcePreviousJobId:previous.id,status:'ERROR',storageLifecycle:'FAILED',
      error:'UPLOAD_FAILED',createdAt:'2026-10-04T00:00:00.000Z',
    });

    const rows=classifyChannelRenderFiles([current],[previous,leaf],[],channelId,fx.root);
    expect(rows[0].classification).toBe('KNOWN_EXACT');
    expect(rows[0].matchedJobId).toBe(leaf.id);

    const rec=reconcilePublisherInventory({channelId,exactRoot:fx.root,ready:rows,jobs:[previous,leaf]});
    expect(rec.normalizePatches.map(x=>x.id)).toEqual([leaf.id]);
    expect(rec.normalizePatches.some(x=>x.id===previous.id)).toBe(false);
  });

  it('legacy ERROR/FAILED leaf without fingerprint binds fresh physical fingerprint to the leaf',async()=>{
    const previous=job('previous-30',30,{
      currentSourceFingerprint:undefined,currentSourceFileSize:undefined,
      createdAt:'2026-10-03T00:00:00.000Z',
    });
    const leaf=job('leaf-30',30,{
      sourcePreviousJobId:previous.id,status:'ERROR',storageLifecycle:'FAILED',error:'UPLOAD_FAILED',
      currentSourceFingerprint:undefined,currentSourceFileSize:undefined,currentSourceModifiedAt:undefined,
      sourceGenerationKey:undefined,createdAt:'2026-10-04T00:00:00.000Z',
    });
    prime([previous,leaf],[file(30)]);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(1);

    const fresh=useApp.getState().jobs;
    const repaired=fresh.find(j=>j.id===leaf.id)!;
    expect(repaired.status).toBe('READY_UPLOAD');
    expect(repaired.storageLifecycle).toBe('NEW');
    expect(repaired.currentSourceFingerprint).toBe(hash(30));
    expect(repaired.currentSourceFileSize).toBe(file(30).size);
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobIds.has(leaf.id)).toBe(true);
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobIds.has(previous.id)).toBe(false);
  });

  it('active QUEUED leaf is not repaired or replaced by its predecessor',async()=>{
    const previous=job('previous-31',31,{currentSourceFingerprint:undefined,currentSourceFileSize:undefined});
    const leaf=job('leaf-31',31,{
      sourcePreviousJobId:previous.id,storageLifecycle:'QUEUED',
      currentSourceFingerprint:undefined,currentSourceFileSize:undefined,sourceGenerationKey:undefined,
    });
    prime([previous,leaf],[file(31)]);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(0);
    expect(useApp.getState().jobs.find(j=>j.id===leaf.id)?.storageLifecycle).toBe('QUEUED');
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobs).toHaveLength(0);
  });

  it('historical trusted successful bytes remain protected and are never restored',async()=>{
    const previous=job('previous-32',32,{currentSourceFingerprint:undefined,currentSourceFileSize:undefined});
    const leaf=job('leaf-32',32,{
      sourcePreviousJobId:previous.id,status:'ERROR',storageLifecycle:'FAILED',error:'UPLOAD_FAILED',
    });
    const proof:UploadHistoryRecord={
      id:'history-32',jobId:leaf.id,channelId,profileId:'profile',youtubeChannelId:'YT',
      youtubeVideoId:'yt-32',localFilePath:file(32).path,originalFilename:file(32).name,
      titleAtUpload:'VIDEO_032',uploadedAt:'2026-10-03T00:00:00.000Z',
      fileSize:file(32).size,sha256:hash(32),publishAt:'2026-10-03T01:00:00.000Z',
      status:'UPLOADED',fingerprintProofSource:'UPLOAD_TIME',proofSchemaVersion:1,sourceLifecycle:'PRESENT',
    };
    prime([previous,leaf],[file(32)],[proof]);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(0);
    expect(useApp.getState().jobs.find(j=>j.id===leaf.id)?.storageLifecycle).toBe('FAILED');
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobs).toHaveLength(0);
  });

  it('TRASHED_BY_VYRON leaf with YouTube identity remains protected',async()=>{
    const previous=job('previous-33',33,{currentSourceFingerprint:undefined,currentSourceFileSize:undefined});
    const leaf=job('leaf-33',33,{
      sourcePreviousJobId:previous.id,status:'SCHEDULED',storageLifecycle:'TRASHED_BY_VYRON',
      youtubeVideoId:'abc123',uploadedAt:'2026-10-03T00:00:00.000Z',
    });
    prime([previous,leaf],[file(33)]);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(0);
    const fresh=useApp.getState().jobs.find(j=>j.id===leaf.id)!;
    expect(fresh.storageLifecycle).toBe('TRASHED_BY_VYRON');
    expect(fresh.youtubeVideoId).toBe('abc123');
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobs).toHaveLength(0);
  });
});
