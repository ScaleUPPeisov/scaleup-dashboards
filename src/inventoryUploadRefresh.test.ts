import {afterEach,describe,expect,it} from 'vitest';
import type {Channel,VideoJob} from './types';
import type {UploadTelemetryRecord,UploadTelemetrySnapshot} from './uploadTelemetry';
import {useApp} from './store';
import {inventoryLevel,inventoryRunwayDays,readyRows,refreshInventoryUploadCounts,resetLiveInventoryForTests,useLiveInventory,type ChannelInventorySnapshot} from './renderInventoryRuntime';
import {normalizeRenderPath,type RenderScanRow} from './renderScanClassifier';

const channel=(id:string)=>({id,name:id,enabled:true}) as Channel;
const job=(id:string,channelId:string,status:VideoJob['status']='READY_UPLOAD')=>({id,channelId,status,number:1,finalPath:'/fixture/'+id+'.mp4',createdAt:'2025-01-01T00:00:00Z'}) as VideoJob;
const row=(id:string,classification:RenderScanRow['classification']='KNOWN_EXACT'):RenderScanRow=>({file:{name:id+'.mp4',path:'/fixture/'+id+'.mp4',size:1},matchedJobId:id,classification,reason:'fixture'});
const snapshot=(id:string,rows:RenderScanRow[],offline=false)=>({channelId:id,channelName:id,renderFolderPath:'/fixture',folderState:offline?'OFFLINE':'ONLINE',stale:offline,rows,readyVideos:7,uploadingVideos:0,runwayDays:7,level:offline?'OFFLINE':'NORMAL'}) as ChannelInventorySnapshot;
const active=(jobId:string,channelId:string,filePath='/fixture/'+jobId+'.mp4')=>({jobId,channelId,filePath,profileId:'fixture',startedAt:'2025-01-01T00:00:00Z',lastProgressAt:'2025-01-01T00:00:00Z',bytesUploaded:1,indeterminate:true,usefulSamples:0,elapsedSeconds:1}) as UploadTelemetryRecord;
const facts=(records:UploadTelemetryRecord[]):UploadTelemetrySnapshot=>({version:1,active:records});

// Baseline semantics used before indexing: recalculate every channel independently.
function reference(channels:Channel[],jobs:VideoJob[],snapshots:Record<string,ChannelInventorySnapshot>,telemetry:UploadTelemetryRecord[]){
 const next={...snapshots};
 for(const c of channels){
  const current=next[c.id];if(!current)continue;
  const running=telemetry.filter(x=>x.channelId===c.id),uploading=running.length;
  let {readyVideos,runwayDays,level}=current;
  if(current.folderState==='ONLINE'&&current.rows){
   const unavailable=new Set<string>();
   for(const item of running)if(item.filePath)unavailable.add(normalizeRenderPath(item.filePath));
   for(const item of jobs.filter(j=>j.channelId===c.id)){
    const blocked=item.status==='UPLOADING'||Boolean(item.youtubeVideoId)||Boolean(item.uploadedAt)||Boolean(item.removedFromPublishList)||['UPLOADED','TRASHED','TRASHED_BY_VYRON'].includes(String(item.storageLifecycle||''));
    if(blocked&&item.finalPath)unavailable.add(normalizeRenderPath(item.finalPath));
   }
   readyVideos=readyRows(current.rows,jobs).filter(r=>!unavailable.has(normalizeRenderPath(r.file.path))).length;
   runwayDays=inventoryRunwayDays(c,readyVideos);level=inventoryLevel(readyVideos,runwayDays);
  }
  if(uploading!==current.uploadingVideos||readyVideos!==current.readyVideos||runwayDays!==current.runwayDays||level!==current.level)next[c.id]={...current,uploadingVideos:uploading,readyVideos,runwayDays,level};
 }
 return next;
}
afterEach(()=>resetLiveInventoryForTests());
describe('live inventory upload refresh',()=>{
 it('matches the previous results for 200 synthetic channels and mixed states',()=>{
  const channels=Array.from({length:200},(_,i)=>channel('c'+i));
  const jobs=channels.flatMap((c,i)=>[job('j'+i,c.id,i%3===0?'UPLOADING':'READY_UPLOAD'),job('old'+i,c.id,'SCHEDULED')]);
  const snapshots=Object.fromEntries(channels.map((c,i)=>[c.id,snapshot(c.id,[row('j'+i),row('new'+i,'NEW_CANDIDATE')],i%11===0)]));
  const telemetry=channels.filter((_,i)=>i%5===0).map((c,i)=>active('j'+(i*5),c.id));
  const expected=reference(channels,jobs,snapshots,telemetry);
  useApp.setState({channels,jobs});useLiveInventory.setState({snapshots});
  refreshInventoryUploadCounts(facts(telemetry));
  expect(useLiveInventory.getState().snapshots).toEqual(expected);
 });
 it('skips repeated whole-inventory work when only upload progress changes',()=>{
  let pathReads=0;
  const c=channel('c'),j=job('j','c','UPLOADING');
  Object.defineProperty(j,'finalPath',{get:()=>{pathReads++;return '/fixture/j.mp4'}});
  useApp.setState({channels:[c],jobs:[j]});useLiveInventory.setState({snapshots:{c:snapshot('c',[row('j')])}});
  const first=active('j','c');refreshInventoryUploadCounts(facts([first]));
  expect(pathReads).toBeGreaterThan(0);pathReads=0;
  const before=useLiveInventory.getState().snapshots;
  refreshInventoryUploadCounts(facts([{...first,bytesUploaded:300,elapsedSeconds:15}]));
  expect(pathReads).toBe(0);expect(useLiveInventory.getState().snapshots).toBe(before);
 });
 it('recalculates immediately for start, finish, job changes and new snapshots',()=>{
  const c=channel('c'),j=job('j','c');
  useApp.setState({channels:[c],jobs:[j]});useLiveInventory.setState({snapshots:{c:snapshot('c',[row('j')])}});
  refreshInventoryUploadCounts(facts([]));expect(useLiveInventory.getState().snapshots.c.readyVideos).toBe(1);
  refreshInventoryUploadCounts(facts([active('j','c')]));expect(useLiveInventory.getState().snapshots.c.readyVideos).toBe(0);expect(useLiveInventory.getState().snapshots.c.uploadingVideos).toBe(1);
  refreshInventoryUploadCounts(facts([]));expect(useLiveInventory.getState().snapshots.c.readyVideos).toBe(1);
  useApp.setState({jobs:[{...j,status:'UPLOADING'}]});refreshInventoryUploadCounts(facts([]));expect(useLiveInventory.getState().snapshots.c.readyVideos).toBe(0);
  useApp.setState({jobs:[j]});useLiveInventory.setState({snapshots:{c:snapshot('c',[row('j'),row('other','NEW_CANDIDATE')])}});
  refreshInventoryUploadCounts(facts([]));expect(useLiveInventory.getState().snapshots.c.readyVideos).toBe(2);
 });
});
