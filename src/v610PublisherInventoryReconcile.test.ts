import {describe,expect,it} from 'vitest';
import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord,VideoJob} from './types';
import {classifyChannelRenderFiles,normalizeRenderPath} from './renderScanClassifier';
import {readyRows} from './renderInventoryRuntime';
import {classifyUploadState} from './storageLifecycle';
import {publisherInventoryJobs,publisherReadyPathSet,reconcilePublisherInventory} from './publisherInventoryReconcile';

const channelId='aegean';
const root='/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Aegean Afterglow';
const hash=(n:number)=>n.toString(16).padStart(64,'0').slice(-64);
const file=(n:number,fp=hash(n),pathRoot=root):RenderFolderVideoFile=>({
  path:pathRoot+'/'+String(n).padStart(3,'0')+' — Ready Videos.mov',
  name:String(n).padStart(3,'0')+' — Ready Videos.mov',
  size:1_000_000+n,
  modifiedAt:1_700_000_000_000+n,
  fingerprint:fp,
});
const job=(n:number,overrides:Partial<VideoJob>={}):VideoJob=>({
  id:'job-'+n,channelId,number:n,folder:root,status:'READY_UPLOAD',createdAt:'2026-10-01T00:00:00Z',
  tracksCount:10,minTracks:10,finalPath:file(n).path,title:'VIDEO_'+String(n).padStart(3,'0'),description:'',tags:[],
  currentSourceFingerprint:hash(n),currentSourceFileSize:file(n).size,currentSourceModifiedAt:file(n).modifiedAt??undefined,
  storageLifecycle:'NEW',...overrides
});
const uploaded=(n:number,fp=hash(n),path=file(n).path,jobId='old-'+n):UploadHistoryRecord=>({
  id:'upload-'+n,jobId,channelId,profileId:'profile',youtubeChannelId:'YT_AEGEAN',youtubeVideoId:'yt-'+n,
  localFilePath:path,originalFilename:path.split('/').pop()!,titleAtUpload:'VIDEO_'+n,uploadedAt:'2026-09-01T00:00:00Z',
  fileSize:file(n,fp).size,sha256:fp,publishAt:'2026-09-02T00:00:00Z',status:'UPLOADED',
  fingerprintProofSource:'UPLOAD_TIME',proofSchemaVersion:1,sourceLifecycle:'PRESENT'
});
function selectable(jobs:VideoJob[],rows:ReturnType<typeof readyRows>){
  const paths=publisherReadyPathSet(rows,root);
  return publisherInventoryJobs({jobs,channelId,readyPhysicalPaths:paths}).filter(j=>classifyUploadState(j,[])==='NEW');
}
function applyPatches(jobs:VideoJob[],patches:ReturnType<typeof reconcilePublisherInventory>['normalizePatches']){
  const m=new Map(patches.map(x=>[x.id,x.patch]));
  return jobs.map(j=>m.has(j.id)?{...j,...m.get(j.id)!}:j);
}
function createdFromRows(rows:ReturnType<typeof reconcilePublisherInventory>['createRows']):VideoJob[]{
  return rows.map((r,i)=>job(r.sequence||i+1,{
    id:'created-'+(i+1),finalPath:r.file.path,sourceOrigin:'render-scan',
    currentSourceFingerprint:r.currentFingerprint||r.file.fingerprint,
    currentSourceFileSize:r.file.size,currentSourceModifiedAt:r.file.modifiedAt??undefined,
  }))
}

describe('VYRON 6.1.0 Publisher inventory reconciliation blocker',()=>{
  it('TEST 1: 30 physical NEW_CANDIDATE rows become 30 Publisher jobs/selectable',()=>{
    const files=Array.from({length:30},(_,i)=>file(i+11));
    const rows=classifyChannelRenderFiles(files,[],[],channelId,root);
    expect(rows.every(r=>r.classification==='NEW_CANDIDATE')).toBe(true);
    const ready=readyRows(rows,[]);
    const rec=reconcilePublisherInventory({channelId,exactRoot:root,ready,jobs:[]});
    expect(rec.createRows).toHaveLength(30);
    const jobs=createdFromRows(rec.createRows);
    expect(selectable(jobs,ready)).toHaveLength(30);
  });

  it('TEST 2: 30 legacy jobs without sourceOrigin remain visible and normalize',()=>{
    const jobs=Array.from({length:30},(_,i)=>job(i+11,{sourceOrigin:undefined}));
    const files=jobs.map(j=>file(j.number));
    const rows=classifyChannelRenderFiles(files,jobs,[],channelId,root);
    const ready=readyRows(rows,jobs);
    expect(ready).toHaveLength(30);
    const rec=reconcilePublisherInventory({channelId,exactRoot:root,ready,jobs});
    expect(rec.normalizePatches).toHaveLength(30);
    const normalized=applyPatches(jobs,rec.normalizePatches);
    expect(normalized.every(j=>j.sourceOrigin==='render-scan'&&j.status==='READY_UPLOAD')).toBe(true);
    expect(selectable(normalized,ready)).toHaveLength(30);
  });

  it('TEST 3: 30 KNOWN_EXACT legacy-origin rows are 30 selectable when no upload proof exists',()=>{
    const jobs=Array.from({length:30},(_,i)=>job(i+11,{sourceOrigin:undefined}));
    const rows=classifyChannelRenderFiles(jobs.map(j=>file(j.number)),jobs,[],channelId,root);
    expect(rows.every(r=>r.classification==='KNOWN_EXACT')).toBe(true);
    const ready=readyRows(rows,jobs);
    const rec=reconcilePublisherInventory({channelId,exactRoot:root,ready,jobs});
    const normalized=applyPatches(jobs,rec.normalizePatches);
    expect(selectable(normalized,ready).map(j=>j.number)).toEqual(jobs.map(j=>j.number));
  });

  it('TEST 4: 10 trusted uploaded exact bytes are excluded; remaining 20 are ready/selectable',()=>{
    const files=Array.from({length:30},(_,i)=>file(i+11));
    const history=files.slice(0,10).map((f,i)=>uploaded(i+11,f.fingerprint!,f.path));
    for(let i=0;i<10;i++)history[i].fileSize=files[i].size;
    const rows=classifyChannelRenderFiles(files,[],history,channelId,root);
    expect(rows.filter(r=>r.classification==='UPLOADED_LOCAL_COPY')).toHaveLength(10);
    const ready=readyRows(rows,[]);
    expect(ready).toHaveLength(20);
    const rec=reconcilePublisherInventory({channelId,exactRoot:root,ready,jobs:[]});
    const jobs=createdFromRows(rec.createRows);
    expect(selectable(jobs,ready)).toHaveLength(20);
  });

  it('TEST 5: same path and VIDEO number with changed fingerprint is NEW_GENERATION and selectable',()=>{
    const oldHash=hash(100),newHash=hash(101),path=file(11).path;
    const oldJob=job(11,{id:'old-job',youtubeVideoId:'yt-old',uploadedAt:'2026-09-01T00:00:00Z',storageLifecycle:'UPLOADED',currentSourceFingerprint:oldHash});
    const proof=uploaded(11,oldHash,path,'old-job');
    proof.fileSize=file(11,oldHash).size;
    const current={...file(11,newHash),size:proof.fileSize+1};
    const rows=classifyChannelRenderFiles([current],[oldJob],[proof],channelId,root);
    expect(rows[0].classification).toBe('NEW_GENERATION');
    const ready=readyRows(rows,[oldJob]);
    const rec=reconcilePublisherInventory({channelId,exactRoot:root,ready,jobs:[oldJob]});
    expect(rec.createRows).toHaveLength(1);
    expect(selectable(createdFromRows(rec.createRows),ready)).toHaveLength(1);
  });

  it('TEST 6: byte-identical trusted upload at another filename/path is not selectable',()=>{
    const fp=hash(222);
    const current=file(11,fp);
    const proof=uploaded(99,fp,root+'/099 — Old Name.mov','historical-job');
    proof.fileSize=current.size;
    const rows=classifyChannelRenderFiles([current],[],[proof],channelId,root);
    expect(rows[0].classification).toBe('UPLOADED_LOCAL_COPY');
    expect(readyRows(rows,[])).toHaveLength(0);
  });

  it('TEST 7: two stale jobs from another channel stay hidden while 30 correct files are selectable',()=>{
    const otherRoot='/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Other Channel';
    const stale=[job(11,{id:'other-1',channelId:'other',finalPath:otherRoot+'/011 — Ready Videos.mov'}),job(12,{id:'other-2',channelId:'other',finalPath:otherRoot+'/012 — Ready Videos.mov'})];
    const files=Array.from({length:30},(_,i)=>file(i+11));
    const rows=classifyChannelRenderFiles(files,stale,[],channelId,root);
    const ready=readyRows(rows,stale);
    const rec=reconcilePublisherInventory({channelId,exactRoot:root,ready,jobs:stale});
    const created=createdFromRows(rec.createRows);
    expect(publisherInventoryJobs({jobs:[...stale,...created],channelId,readyPhysicalPaths:publisherReadyPathSet(ready,root)})).toHaveLength(30);
    expect(created.every(j=>normalizeRenderPath(j.finalPath||'').startsWith(normalizeRenderPath(root)+'/'))).toBe(true);
  });

  it('TEST 8: one scan is enough for Select All state — no reload/second scan required',()=>{
    const files=Array.from({length:30},(_,i)=>file(i+11));
    const rows=classifyChannelRenderFiles(files,[],[],channelId,root),ready=readyRows(rows,[]);
    const rec=reconcilePublisherInventory({channelId,exactRoot:root,ready,jobs:[]});
    const jobs=createdFromRows(rec.createRows);
    const visible=publisherInventoryJobs({jobs,channelId,readyPhysicalPaths:rec.readyPhysicalPaths});
    const selectedIds=visible.filter(j=>classifyUploadState(j,[])==='NEW').map(j=>j.id);
    expect(selectedIds).toHaveLength(30);
    expect(new Set(selectedIds).size).toBe(30);
  });
});
