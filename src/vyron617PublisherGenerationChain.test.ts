import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {VideoJob} from './types';

if(typeof (globalThis as any).window==='undefined'){
  Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});
}

const fx=vi.hoisted(()=>({
  root:'/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Aegean Afterglow',
  files:[] as Array<{path:string;name:string;size:number;modifiedAt:number;fingerprint:string}>,
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
  }
}));

import {useApp} from './store';
import {resetLiveInventoryForTests,scanInventoryChannel,useLiveInventory} from './renderInventoryRuntime';
import {usePublisherDerived} from './publisherDerivedRuntime';
import {publisherInventoryJobs,publisherReadyPathSet} from './publisherInventoryReconcile';
import {readyRows} from './renderInventoryRuntime';
import {uploadStateCounters} from './storageLifecycle';

const channelId='aegean-afterglow';
const hash=(n:number)=>n.toString(16).padStart(64,'0').slice(-64);
const physical=(n:number)=>({
  path:`${fx.root}/${String(n).padStart(3,'0')} — Ready Videos.mov`,
  name:`${String(n).padStart(3,'0')} — Ready Videos.mov`,
  size:500_000_000,
  modifiedAt:1_700_000_000_000+n,
  fingerprint:hash(n),
});
const baseJob=(id:string,n:number,patch:Partial<VideoJob>={}):VideoJob=>({
  id,channelId,number:n,folder:fx.root,status:'READY_UPLOAD',
  createdAt:'2026-10-04T00:00:00.000Z',tracksCount:10,minTracks:10,
  finalPath:physical(n).path,title:`VIDEO_${String(n).padStart(3,'0')}`,description:'',tags:[],
  storageLifecycle:'NEW',sourceOrigin:'render-scan',...patch,
});
const channel:any={
  id:channelId,name:'Aegean Afterglow',slug:'aegean-afterglow',enabled:true,renderFolderPath:fx.root,
  cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,language:'EN',genre:'Music',
  country:'US',minTracks:10,targetDurationMin:120,
  seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:[],banned:[],aiPrompt:''},
};

function prime(jobs:VideoJob[]){
  fx.files=Array.from({length:20},(_,i)=>physical(i+21));
  const fingerprintCache=Object.fromEntries(fx.files.map(f=>[f.path,{
    path:f.path,size:f.size,mtimeMs:f.modifiedAt,sha256:f.fingerprint,computedAt:'2026-10-04T00:00:00.000Z'
  }]));
  useApp.setState({channels:[channel],jobs,uploadHistory:[],fingerprintCache} as any);
  resetLiveInventoryForTests();
}

describe('VYRON 6.1.7 current generation repair',()=>{
  beforeEach(()=>prime([]));

  it('repairs the visible leaf jobs instead of superseded predecessors: Aegean 20 ready / 19 errors',async()=>{
    const jobs:VideoJob[]=[
      baseJob('current-21',21,{
        currentSourceFingerprint:hash(21),currentSourceFileSize:physical(21).size,currentSourceModifiedAt:physical(21).modifiedAt,
        sourceGenerationKey:`${channelId}:${hash(21)}:${physical(21).size}`,
      })
    ];

    for(let n=22;n<=40;n++){
      const previous=baseJob(`previous-${n}`,n,{
        // Legacy predecessor intentionally has no trusted current fingerprint.
        currentSourceFingerprint:undefined,currentSourceFileSize:undefined,currentSourceModifiedAt:undefined,
      });
      const current=baseJob(`current-${n}`,n,{
        status:'ERROR',storageLifecycle:'FAILED',error:'UPLOAD_FAILED: stale pre-accept error',
        currentSourceFingerprint:hash(n),currentSourceFileSize:physical(n).size,currentSourceModifiedAt:physical(n).modifiedAt,
        sourceGenerationKey:`${channelId}:${hash(n)}:${physical(n).size}`,
        sourcePreviousJobId:previous.id,
      });
      jobs.push(previous,current);
    }

    prime(jobs);
    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(20);

    const fresh=useApp.getState().jobs;
    for(let n=22;n<=40;n++){
      const current=fresh.find(j=>j.id===`current-${n}`)!;
      const previous=fresh.find(j=>j.id===`previous-${n}`)!;
      expect(current.status).toBe('READY_UPLOAD');
      expect(current.storageLifecycle).toBe('NEW');
      expect(current.error).toBeUndefined();
      // The predecessor is audit/history state and is not the record repaired for current bytes.
      expect(previous.id).toBe(`previous-${n}`);
    }

    const snap=useLiveInventory.getState().snapshots[channelId];
    const ready=readyRows(snap.rows||[],fresh);
    const readyPaths=publisherReadyPathSet(ready,snap.result!.root);
    const canonical=publisherInventoryJobs({jobs:fresh,channelId,readyPhysicalPaths:readyPaths});
    const counters=uploadStateCounters(canonical,[]);

    expect(canonical).toHaveLength(20);
    expect(canonical.filter(j=>j.id.startsWith('current-'))).toHaveLength(20);
    expect(counters.NEW).toBe(20);
    expect(counters.ERRORS).toBe(0);
    expect(usePublisherDerived.getState().byChannel[channelId].selectableJobs).toHaveLength(20);
  });

  it('prefers the unsuperseded leaf even when the leaf still lacks a fingerprint',async()=>{
    const previous=baseJob('previous-22',22,{
      currentSourceFingerprint:hash(22),currentSourceFileSize:physical(22).size,currentSourceModifiedAt:physical(22).modifiedAt,
      sourceGenerationKey:`${channelId}:${hash(22)}:${physical(22).size}`,
    });
    const current=baseJob('current-22',22,{
      status:'ERROR',storageLifecycle:'FAILED',error:'invalidTags',
      sourcePreviousJobId:previous.id,
      currentSourceFingerprint:undefined,currentSourceFileSize:undefined,currentSourceModifiedAt:undefined,
    });
    prime([previous,current]);

    // Restrict the physical fixture to the one reproduced path.
    fx.files=[physical(22)];
    useApp.getState().cacheFingerprints({[physical(22).path]:{
      path:physical(22).path,size:physical(22).size,mtimeMs:physical(22).modifiedAt,sha256:hash(22),computedAt:'2026-10-04T00:00:00.000Z'
    }});

    const snapshot=await scanInventoryChannel(channelId,'publisher');
    expect(snapshot?.readyVideos).toBe(1);
    const fresh=useApp.getState().jobs;
    const repaired=fresh.find(j=>j.id==='current-22')!;
    expect(repaired.status).toBe('READY_UPLOAD');
    expect(repaired.storageLifecycle).toBe('NEW');
    expect(repaired.currentSourceFingerprint).toBe(hash(22));
    expect(repaired.error).toBeUndefined();

    const derived=usePublisherDerived.getState().byChannel[channelId];
    expect(derived.selectableJobIds.has('current-22')).toBe(true);
    expect(derived.selectableJobIds.has('previous-22')).toBe(false);
  });
});
