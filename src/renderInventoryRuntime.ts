import {create} from 'zustand';
import {api,type RenderFolderScanResult,type RenderFolderVideoFile} from './api';
import {useApp} from './store';
import type {Channel,UploadHistoryRecord,VideoJob} from './types';
import {
  classifyChannelRenderFiles,
  normalizeRenderPath,
  renderFileNeedsFingerprint,
  summarizeRenderScan,
  type RenderScanRow,
  type RenderScanSummary
} from './renderScanClassifier';
import {scheduleAverageIntervalDays} from './channelSchedule';
import {uploadTelemetrySnapshot} from './uploadTelemetry';

export type InventoryFolderState='ONLINE'|'OFFLINE'|'SCANNING'|'ERROR';
export type InventoryLevel='NORMAL'|'SOON'|'LOW'|'EMPTY'|'OFFLINE';
export type InventoryScanReason='startup'|'watcher'|'manual-all'|'manual-channel'|'focus'|'periodic'|'cleanup'|'upload'|'reconnect'|'publisher';
export type InventoryAuditEvent={id:string;at:string;channelId:string;kind:'SCAN'|'ADD'|'REMOVE'|'OFFLINE'|'RECONNECT'|'ERROR';message:string;readyBefore?:number;readyAfter?:number};
export type ChannelInventorySnapshot={
  channelId:string;
  channelName:string;
  renderFolderPath:string;
  folderState:InventoryFolderState;
  stale:boolean;
  physicalFiles:number;
  readyVideos:number;
  uploadingVideos:number;
  uploadedLocalCopies:number;
  newCandidates:number;
  newGenerations:number;
  knownReady:number;
  verifyRequired:number;
  invalid:number;
  runwayDays:number;
  level:InventoryLevel;
  lastScanAt?:string;
  lastConfirmedAt?:string;
  error?:string;
  result?:RenderFolderScanResult;
  rows?:RenderScanRow[];
  summary?:RenderScanSummary;
};
export type InventoryTotals={ready:number;channels:number;normal:number;soon:number;low:number;empty:number;offline:number;uploading:number};
type LiveInventoryState={
  snapshots:Record<string,ChannelInventorySnapshot>;
  audit:InventoryAuditEvent[];
  globalScanning:boolean;
  setSnapshot:(row:ChannelInventorySnapshot)=>void;
  pushAudit:(row:InventoryAuditEvent)=>void;
  setGlobalScanning:(value:boolean)=>void;
};

const emptySummary=():RenderScanSummary=>({TOTAL_CLASSIFIED_FILES:0,KNOWN_EXACT:0,UPLOADED_LOCAL_COPY:0,NEW_CANDIDATE:0,NEW_GENERATION:0,LEGACY_IDENTITY_UNPROVEN:0,VERIFY_REQUIRED:0,AMBIGUOUS:0,DUPLICATE_LOCAL:0,INVALID:0});
const nowIso=()=>new Date().toISOString();
const eventId=(channelId:string,kind:string)=>`inventory:${channelId}:${kind}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;

export const useLiveInventory=create<LiveInventoryState>((set)=>({
  snapshots:{},
  audit:[],
  globalScanning:false,
  setSnapshot:row=>set(s=>({snapshots:{...s.snapshots,[row.channelId]:row}})),
  pushAudit:row=>set(s=>({audit:[row,...s.audit].slice(0,60)})),
  setGlobalScanning:value=>set({globalScanning:value})
}));

function activeReadyJob(job:VideoJob|undefined){
  if(!job)return false;
  if(job.removedFromPublishList||job.youtubeVideoId||job.uploadedAt)return false;
  if(job.storageLifecycle==='UPLOADED'||job.storageLifecycle==='TRASHED'||job.storageLifecycle==='TRASHED_BY_VYRON'||job.storageLifecycle==='FAILED')return false;
  return job.status==='READY_UPLOAD';
}
export function readyRows(rows:RenderScanRow[],jobs:VideoJob[]){
  const byId=new Map(jobs.map(j=>[j.id,j]));
  return rows.filter(row=>{
    const matched=row.matchedJobId?byId.get(row.matchedJobId):undefined;
    if(matched?.status==='UPLOADING')return false;
    if(row.classification==='NEW_CANDIDATE'||row.classification==='NEW_GENERATION')return true;
    if(row.classification!=='KNOWN_EXACT')return false;
    return activeReadyJob(matched)
  });
}
function uploadingForChannel(channelId:string,_jobs:VideoJob[]){
  return uploadTelemetrySnapshot().active.filter(x=>x.channelId===channelId).length
}
export function inventoryLevel(ready:number,runwayDays:number,offline=false):InventoryLevel{
  if(offline)return'OFFLINE';
  if(ready<=0)return'EMPTY';
  if(runwayDays<=6)return'LOW';
  if(runwayDays<=14)return'SOON';
  return'NORMAL'
}
export function inventoryRunwayDays(channel:Channel,ready:number){
  return Math.max(0,Math.round(ready*scheduleAverageIntervalDays(channel)))
}
export function inventoryTotals(snapshots:Record<string,ChannelInventorySnapshot>,channels:Channel[]):InventoryTotals{
  const ids=new Set(channels.filter(c=>c.enabled!==false).map(c=>c.id));
  const rows=Object.values(snapshots).filter(x=>ids.has(x.channelId));
  return{
    ready:rows.reduce((n,x)=>n+x.readyVideos,0),
    channels:ids.size,
    normal:rows.filter(x=>x.level==='NORMAL').length,
    soon:rows.filter(x=>x.level==='SOON').length,
    low:rows.filter(x=>x.level==='LOW').length,
    empty:rows.filter(x=>x.level==='EMPTY').length,
    offline:rows.filter(x=>x.level==='OFFLINE').length,
    uploading:rows.reduce((n,x)=>n+x.uploadingVideos,0)
  }
}
function baseSnapshot(channel:Channel,previous?:ChannelInventorySnapshot):ChannelInventorySnapshot{
  const configuredPath=String(channel.renderFolderPath||'');
  if(previous&&normalizeRenderPath(previous.renderFolderPath)===normalizeRenderPath(configuredPath))return previous;
  return{
    channelId:channel.id,channelName:channel.name,renderFolderPath:configuredPath,
    folderState:'OFFLINE',stale:true,physicalFiles:0,readyVideos:0,uploadingVideos:0,uploadedLocalCopies:0,
    newCandidates:0,newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:0,level:'OFFLINE'
  }
}
export function preserveOfflineInventory(channel:Channel,previous?:ChannelInventorySnapshot,uploading=0,error?:string):ChannelInventorySnapshot{
  const prior=baseSnapshot(channel,previous);
  return{...prior,channelId:channel.id,channelName:channel.name,renderFolderPath:String(channel.renderFolderPath||''),folderState:'OFFLINE',stale:true,uploadingVideos:uploading,level:'OFFLINE',error}
}
function offlineSnapshot(channel:Channel,previous?:ChannelInventorySnapshot,error?:string):ChannelInventorySnapshot{
  return preserveOfflineInventory(channel,previous,uploadingForChannel(channel.id,useApp.getState().jobs),error)
}
function errorSnapshot(channel:Channel,previous:ChannelInventorySnapshot|undefined,error:string):ChannelInventorySnapshot{
  const prior=baseSnapshot(channel,previous);
  return{...prior,channelId:channel.id,channelName:channel.name,renderFolderPath:String(channel.renderFolderPath||''),folderState:'ERROR',stale:true,error}
}

async function fingerprintNeededFiles(result:RenderFolderScanResult,jobs:VideoJob[],history:UploadHistoryRecord[],channelId:string){
  const cache=useApp.getState().fingerprintCache;
  const files:RenderFolderVideoFile[]=new Array(result.files.length);
  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++;if(i>=result.files.length)return;
      const file=result.files[i];
      if(!renderFileNeedsFingerprint(file,jobs,history,channelId,result.root)){files[i]=file;continue}
      const cached=cache[file.path];
      if(cached&&cached.size===file.size&&Number(cached.mtimeMs)===Number(file.modifiedAt||0)&&/^[a-f0-9]{64}$/i.test(cached.sha256)){
        files[i]={...file,fingerprint:cached.sha256};continue
      }
      try{
        const fp=await api.youtubeFileFingerprint(file.path,cached?{size:cached.size,mtimeMs:cached.mtimeMs,sha256:cached.sha256}:undefined);
        useApp.getState().cacheFingerprint(file.path,{path:file.path,size:fp.size,mtimeMs:fp.modifiedAt,sha256:fp.fingerprint,computedAt:nowIso()});
        files[i]={...file,size:fp.size,modifiedAt:fp.modifiedAt,fingerprint:fp.fingerprint}
      }catch{files[i]=file}
    }
  };
  await Promise.all(Array.from({length:Math.min(3,Math.max(1,result.files.length))},()=>worker()));
  return{...result,files}
}

export function buildInventorySnapshotFromScan(channel:Channel,result:RenderFolderScanResult,rows:RenderScanRow[],jobs:VideoJob[],uploading=0,lastScanAt=nowIso()):ChannelInventorySnapshot{
  const summary=summarizeRenderScan(rows),ready=readyRows(rows,jobs),knownReady=ready.filter(x=>x.classification==='KNOWN_EXACT').length,readyCount=ready.length,runwayDays=inventoryRunwayDays(channel,readyCount);
  return{
    channelId:channel.id,channelName:channel.name,renderFolderPath:result.root,folderState:'ONLINE',stale:false,
    physicalFiles:result.files.length,readyVideos:readyCount,uploadingVideos:uploading,uploadedLocalCopies:summary.UPLOADED_LOCAL_COPY,
    newCandidates:summary.NEW_CANDIDATE,newGenerations:summary.NEW_GENERATION,knownReady,
    verifyRequired:summary.VERIFY_REQUIRED+summary.LEGACY_IDENTITY_UNPROVEN,invalid:summary.INVALID+summary.AMBIGUOUS+summary.DUPLICATE_LOCAL,
    runwayDays,level:inventoryLevel(readyCount,runwayDays),lastScanAt,lastConfirmedAt:lastScanAt,result,rows,summary
  }
}

function auditFor(previous:ChannelInventorySnapshot|undefined,next:ChannelInventorySnapshot,reason:InventoryScanReason){
  const store=useLiveInventory.getState(),before=previous?.readyVideos??0,after=next.readyVideos,delta=after-before;
  if(next.folderState==='OFFLINE'){
    if(previous?.folderState!=='OFFLINE')store.pushAudit({id:eventId(next.channelId,'offline'),at:nowIso(),channelId:next.channelId,kind:'OFFLINE',message:`Диск / папка OFFLINE • последний подтверждённый snapshot: ${after} видео`,readyBefore:before,readyAfter:after});
    return
  }
  if(previous?.folderState==='OFFLINE'&&next.folderState==='ONLINE')store.pushAudit({id:eventId(next.channelId,'reconnect'),at:nowIso(),channelId:next.channelId,kind:'RECONNECT',message:`Папка снова ONLINE • fresh inventory: ${after}`,readyBefore:before,readyAfter:after});
  if(delta>0)store.pushAudit({id:eventId(next.channelId,'add'),at:nowIso(),channelId:next.channelId,kind:'ADD',message:`+${delta} новых видео • готово: ${after}`,readyBefore:before,readyAfter:after});
  else if(delta<0)store.pushAudit({id:eventId(next.channelId,'remove'),at:nowIso(),channelId:next.channelId,kind:'REMOVE',message:reason==='cleanup'?`−${Math.abs(delta)} после подтверждённой cleanup • готово: ${after}`:`−${Math.abs(delta)} локальный файл исчез • готово: ${after}`,readyBefore:before,readyAfter:after});
  else if(reason!=='periodic'&&reason!=='watcher')store.pushAudit({id:eventId(next.channelId,'scan'),at:nowIso(),channelId:next.channelId,kind:'SCAN',message:`scan: ${after} ready • ${next.physicalFiles} физических файлов`,readyBefore:before,readyAfter:after})
}

export async function scanInventoryChannel(channelId:string,reason:InventoryScanReason='manual-channel'):Promise<ChannelInventorySnapshot|undefined>{
  const state=useApp.getState(),channel=state.channels.find(c=>c.id===channelId);
  if(!channel)return;
  const store=useLiveInventory.getState(),previous=store.snapshots[channelId],root=String(channel.renderFolderPath||'').trim();
  if(!root){
    const next=offlineSnapshot(channel,previous,'RENDER_FOLDER_NOT_CONFIGURED');store.setSnapshot(next);auditFor(previous,next,reason);return next
  }
  store.setSnapshot({...baseSnapshot(channel,previous),channelName:channel.name,renderFolderPath:root,folderState:'SCANNING',stale:Boolean(previous?.stale),error:undefined});
  const status=await api.localSourceStatus(root).catch(()=>null);
  if(!status?.exists||status.isFile){
    const next=offlineSnapshot(channel,previous,'RENDER_FOLDER_OFFLINE');store.setSnapshot(next);auditFor(previous,next,reason);return next
  }
  try{
    const current=useApp.getState(),cheap=await api.scanRenderFolder(root),result=await fingerprintNeededFiles(cheap,current.jobs,current.uploadHistory,channelId);
    const rows=classifyChannelRenderFiles(result.files,current.jobs,current.uploadHistory,channelId,result.root);
    const next=buildInventorySnapshotFromScan(channel,result,rows,current.jobs,uploadingForChannel(channelId,current.jobs));
    store.setSnapshot(next);auditFor(previous,next,reason);return next
  }catch(error){
    const next=errorSnapshot(channel,previous,String(error));store.setSnapshot(next);
    store.pushAudit({id:eventId(channelId,'error'),at:nowIso(),channelId,kind:'ERROR',message:`scan error: ${String(error)}`,readyBefore:previous?.readyVideos,readyAfter:previous?.readyVideos});
    return next
  }
}

export async function scanAllInventories(reason:InventoryScanReason='manual-all'){
  const store=useLiveInventory.getState();store.setGlobalScanning(true);
  try{
    const ids=useApp.getState().channels.filter(c=>c.enabled!==false&&Boolean(String(c.renderFolderPath||'').trim())).map(c=>c.id);
    let cursor=0;
    const worker=async()=>{while(true){const i=cursor++;if(i>=ids.length)return;await scanInventoryChannel(ids[i],reason)}};
    await Promise.all(Array.from({length:Math.min(3,Math.max(1,ids.length))},()=>worker()))
  }finally{store.setGlobalScanning(false)}
}

export function markInventoryAfterCleanup(channelId:string){return scanInventoryChannel(channelId,'cleanup')}
export function refreshInventoryUploadCounts(){
  const store=useLiveInventory.getState(),state=useApp.getState(),next={...store.snapshots};let changed=false;
  for(const channel of state.channels){
    const current=next[channel.id];if(!current)continue;
    const uploading=uploadingForChannel(channel.id,state.jobs);
    if(uploading!==current.uploadingVideos){next[channel.id]={...current,uploadingVideos:uploading};changed=true}
  }
  if(changed)useLiveInventory.setState({snapshots:next})
}
export function inventorySnapshot(channelId:string){return useLiveInventory.getState().snapshots[channelId]}
export function resetLiveInventoryForTests(){useLiveInventory.setState({snapshots:{},audit:[],globalScanning:false})}
