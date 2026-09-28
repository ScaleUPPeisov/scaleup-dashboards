import {describe,expect,it} from 'vitest';
import type {Channel,VideoJob} from './types';
import type {RenderFolderScanResult,RenderFolderVideoFile} from './api';
import type {RenderScanRow,RenderScanPrimaryClass} from './renderScanClassifier';
import {buildInventorySnapshotFromScan,inventoryLevel,inventoryRunwayDays,preserveOfflineInventory,readyRows} from './renderInventoryRuntime';

const channel=(patch:Partial<Channel>={}):Channel=>({
 id:'c1',name:'Aether Riff',slug:'aether-riff',cadenceDays:1,targetBufferDays:60,publishHour:18,publishMinute:0,
 language:'EN',genre:'Rock',country:'US',minTracks:10,targetDurationMin:120,enabled:true,renderFolderPath:'/Volumes/TOSHIBA EXT/Render/Aether Riff',
 seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]},...patch
});
const file=(n:number,pathPrefix='/Volumes/TOSHIBA EXT/Render/Aether Riff'):RenderFolderVideoFile=>({path:pathPrefix+'/'+String(n).padStart(3,'0')+' — Ready Videos.mov',name:String(n).padStart(3,'0')+' — Ready Videos.mov',size:1000+n,modifiedAt:10000+n});
const row=(n:number,classification:RenderScanPrimaryClass='NEW_CANDIDATE',matchedJobId?:string):RenderScanRow=>({file:file(n),sequence:n,classification,reason:'fixture',matchedJobId});
const scan=(rows:RenderScanRow[]):RenderFolderScanResult=>({root:'/Volumes/TOSHIBA EXT/Render/Aether Riff',files:rows.map(x=>x.file),scannedEntries:rows.length,truncated:false});
const job=(n:number):VideoJob=>({id:'j'+n,channelId:'c1',number:n,folder:'/Projects/'+n,status:'READY_UPLOAD',createdAt:'2026-09-28T00:00:00Z',tracksCount:10,minTracks:10,finalPath:file(n).path,title:'VIDEO '+n,description:'',tags:[],storageLifecycle:'NEW',sourceOrigin:'render-scan'});

describe('VYRON 3.3.4 Live Content Inventory acceptance',()=>{
 it('A initial physical scan: 40 genuine candidates => ready 40',()=>{
  const rows=Array.from({length:40},(_,i)=>row(i+1));
  const x=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[]);
  expect(x.readyVideos).toBe(40);expect(x.newCandidates).toBe(40);expect(x.physicalFiles).toBe(40);expect(x.runwayDays).toBe(40)
 });
 it('B manual deletion changes only current inventory 40 -> 37',()=>{
  const before=Array.from({length:40},(_,i)=>row(i+1)),after=before.slice(0,37);
  expect(buildInventorySnapshotFromScan(channel(),scan(before),before,[]).readyVideos).toBe(40);
  expect(buildInventorySnapshotFromScan(channel(),scan(after),after,[]).readyVideos).toBe(37)
 });
 it('C add ten changes current inventory 37 -> 47',()=>{
  const before=Array.from({length:37},(_,i)=>row(i+1)),after=Array.from({length:47},(_,i)=>row(i+1));
  expect(buildInventorySnapshotFromScan(channel(),scan(before),before,[]).readyVideos).toBe(37);
  expect(buildInventorySnapshotFromScan(channel(),scan(after),after,[]).readyVideos).toBe(47)
 });
 it('D successful upload + cleanup removes one physical ready row 47 -> 46',()=>{
  const before=Array.from({length:47},(_,i)=>row(i+1)),after=before.slice(1);
  expect(buildInventorySnapshotFromScan(channel(),scan(before),before,[]).readyVideos).toBe(47);
  expect(buildInventorySnapshotFromScan(channel(),scan(after),after,[]).readyVideos).toBe(46)
 });
 it('upload lifecycle is READY -1 / UPLOADING +1, then cleanup does not double-decrement ready',()=>{
  const readyJob=job(1),baseRows=[row(1,'KNOWN_EXACT',readyJob.id),...Array.from({length:46},(_,i)=>row(i+2))];
  const before=buildInventorySnapshotFromScan(channel(),scan(baseRows),baseRows,[readyJob],0);
  expect(before.readyVideos).toBe(47);expect(before.uploadingVideos).toBe(0);

  const uploadingJob={...readyJob,status:'UPLOADING' as const,storageLifecycle:'UPLOADING' as const};
  const during=buildInventorySnapshotFromScan(channel(),scan(baseRows),baseRows,[uploadingJob],1);
  expect(during.readyVideos).toBe(46);expect(during.uploadingVideos).toBe(1);

  const uploadedRows=[row(1,'UPLOADED_LOCAL_COPY',readyJob.id),...baseRows.slice(1)];
  const afterUpload=buildInventorySnapshotFromScan(channel(),scan(uploadedRows),uploadedRows,[{...readyJob,status:'SCHEDULED',storageLifecycle:'UPLOADED',youtubeVideoId:'YT1'}],0);
  expect(afterUpload.readyVideos).toBe(46);expect(afterUpload.uploadedLocalCopies).toBe(1);expect(afterUpload.physicalFiles).toBe(47);

  const afterCleanupRows=uploadedRows.slice(1);
  const afterCleanup=buildInventorySnapshotFromScan(channel(),scan(afterCleanupRows),afterCleanupRows,[],0);
  expect(afterCleanup.readyVideos).toBe(46);expect(afterCleanup.physicalFiles).toBe(46)
 });
 it('E uploaded local copy stays physical but is excluded from ready',()=>{
  const rows=[row(1,'NEW_CANDIDATE'),row(2,'UPLOADED_LOCAL_COPY')],x=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[]);
  expect(x.physicalFiles).toBe(2);expect(x.readyVideos).toBe(1);expect(x.uploadedLocalCopies).toBe(1)
 });
 it('F same-path changed bytes classified NEW_GENERATION are ready',()=>{
  const rows=[row(1,'NEW_GENERATION','old-job')],x=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[]);
  expect(x.readyVideos).toBe(1);expect(x.newGenerations).toBe(1)
 });
 it('known exact current READY_UPLOAD job remains counted after Publisher materializes it',()=>{
  const j=job(1),rows=[row(1,'KNOWN_EXACT',j.id)];
  expect(readyRows(rows,[j])).toHaveLength(1);
  expect(buildInventorySnapshotFromScan(channel(),scan(rows),rows,[j]).knownReady).toBe(1)
 });
 it('physical KNOWN_EXACT render remains stock even if an old local job status drifted',()=>{
  const j={...job(1),status:'READY_RENDER' as const,storageLifecycle:'RENDERED' as const},rows=[row(1,'KNOWN_EXACT',j.id)];
  expect(readyRows(rows,[j])).toHaveLength(1);
  const x=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[j]);
  expect(x.readyVideos).toBe(1);expect(x.knownReady).toBe(1);expect(x.runwayDays).toBe(1)
 });
 it('UPLOADING is shown separately and never counted as ready',()=>{
  const j={...job(1),status:'UPLOADING' as const,storageLifecycle:'UPLOADING' as const},rows=[row(1,'KNOWN_EXACT',j.id)];
  expect(readyRows(rows,[j])).toHaveLength(0);
  const x=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[j],1);
  expect(x.readyVideos).toBe(0);expect(x.uploadingVideos).toBe(1)
 });
 it('G external disk OFFLINE retains last confirmed 40 instead of becoming zero',()=>{
  const rows=Array.from({length:40},(_,i)=>row(i+1)),online=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[]);
  const offline=preserveOfflineInventory(channel(),online,0,'RENDER_FOLDER_OFFLINE');
  expect(offline.folderState).toBe('OFFLINE');expect(offline.stale).toBe(true);expect(offline.readyVideos).toBe(40);expect(offline.lastConfirmedAt).toBe(online.lastConfirmedAt)
 });
 it('changing configured render path never carries the old folder count into a different folder',()=>{
  const rows=Array.from({length:40},(_,i)=>row(i+1)),online=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[]);
  const changed=preserveOfflineInventory(channel({renderFolderPath:'/Volumes/OTHER/Render/Aether Riff'}),online,0,'RENDER_FOLDER_OFFLINE');
  expect(changed.readyVideos).toBe(0);expect(changed.renderFolderPath).toBe('/Volumes/OTHER/Render/Aether Riff')
 });
 it('H reconnect fresh scan replaces stale snapshot truthfully',()=>{
  const rows=Array.from({length:42},(_,i)=>row(i+1)),online=buildInventorySnapshotFromScan(channel(),scan(rows),rows,[]);
  expect(online.folderState).toBe('ONLINE');expect(online.stale).toBe(false);expect(online.readyVideos).toBe(42)
 });
 it('inventory runway is literal daily stock: 30 ready videos = 30 days',()=>{
  expect(inventoryRunwayDays(channel({publishIntervalDays:1}),40)).toBe(40);
  expect(inventoryRunwayDays(channel({scheduleMode:'pattern',publishDays:2,pauseDays:2,patternAnchorDate:'2026-09-28'}),40)).toBe(40);
  expect(inventoryRunwayDays(channel({scheduleMode:'pattern',publishDays:3,pauseDays:1,patternAnchorDate:'2026-09-28'}),30)).toBe(30)
 });
 it('status thresholds match default policy',()=>{
  expect(inventoryLevel(20,20)).toBe('NORMAL');expect(inventoryLevel(10,10)).toBe('SOON');expect(inventoryLevel(3,3)).toBe('LOW');expect(inventoryLevel(0,0)).toBe('EMPTY');expect(inventoryLevel(40,40,true)).toBe('OFFLINE')
 });
});
