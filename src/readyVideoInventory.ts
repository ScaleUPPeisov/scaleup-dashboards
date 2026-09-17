import type {Channel,FingerprintCacheEntry,ProjectLifecycleRecord,UploadHistoryRecord,VideoJob} from './types';
import {scheduleAverageIntervalDays} from './channelSchedule';

export type ReadyVideoInventoryStatus='READY'|'QUEUED'|'UPLOADING'|'SCHEDULED'|'PUBLISHED'|'ERROR';
export type InventoryUploadFact={
  jobId:string;
  channelId:string;
  status:'QUEUED'|'UPLOADING';
  progressPercent?:number|null;
  estimatedRemainingSeconds?:number|null;
};
export type ReadyVideoInventoryItem={
  jobId:string;
  channelId:string;
  channelName:string;
  projectId?:string;
  projectName:string;
  videoCode:string;
  filename:string;
  finalPath?:string;
  status:ReadyVideoInventoryStatus;
  metadataState:string;
  publishAt?:string;
  youtubeVideoId?:string;
  progressPercent?:number|null;
  estimatedRemainingSeconds?:number|null;
  error?:string;
};
export type ChannelReadyInventory={
  channelId:string;
  channelName:string;
  free:number;
  scheduled:number;
  uploading:number;
  published:number;
  errors:number;
  stockDays:number;
  itemIds:string[];
};
export type ReadyVideoInventorySnapshot={
  globalFinalVideoCount:number;
  globalFreeCount:number;
  channels:ChannelReadyInventory[];
  items:ReadyVideoInventoryItem[];
  byChannel:Record<string,ChannelReadyInventory>;
};

const pathKey=(value?:string)=>String(value||'').trim().replace(/\\/g,'/').replace(/\/+$/,'');
const basename=(value?:string)=>{const x=pathKey(value);return x.split('/').filter(Boolean).at(-1)||''};
const videoCode=(job:VideoJob)=>`VIDEO_${String(job.number||0).padStart(3,'0')}`;
const isFuture=(iso:string|undefined,nowMs:number)=>Boolean(iso&&Number.isFinite(Date.parse(iso))&&Date.parse(iso!)>nowMs);

function lifecycleForJob(jobId:string,projectLifecycle:Record<string,ProjectLifecycleRecord>){
  return Object.entries(projectLifecycle||{}).find(([,row])=>row.jobId===jobId);
}
function latestUpload(jobId:string,history:UploadHistoryRecord[]){
  return history.slice().reverse().find(x=>x.jobId===jobId&&x.status==='UPLOADED'&&Boolean(x.youtubeVideoId));
}
function productionVideoExists(job:VideoJob,lifecycle?:ProjectLifecycleRecord){
  const finalPath=pathKey(job.finalPath);if(!finalPath)return false;
  if(!lifecycle)return true;
  return Boolean(lifecycle.renderExists&&lifecycle.renderPath&&pathKey(lifecycle.renderPath)===finalPath);
}

export function isReadyAvailable(
  job:VideoJob,
  uploadHistory:UploadHistoryRecord[],
  projectLifecycle:Record<string,ProjectLifecycleRecord>,
  runtimeUploads:InventoryUploadFact[]=[]
){
  const lifecycle=lifecycleForJob(job.id,projectLifecycle)?.[1];
  if(job.status!=='READY_UPLOAD'||!productionVideoExists(job,lifecycle))return false;
  if(job.error||job.removedFromPublishList||job.youtubeVideoId||job.uploadedAt)return false;
  if(['UPLOADED','TRASHED','FAILED','UPLOADING','QUEUED'].includes(String(job.storageLifecycle||'')))return false;
  if(latestUpload(job.id,uploadHistory))return false;
  if(runtimeUploads.some(x=>x.jobId===job.id&&(x.status==='UPLOADING'||x.status==='QUEUED')))return false;
  return true;
}

export function buildReadyVideoInventory(
  channels:Channel[],
  jobs:VideoJob[],
  uploadHistory:UploadHistoryRecord[],
  projectLifecycle:Record<string,ProjectLifecycleRecord>,
  _fingerprintCache:Record<string,FingerprintCacheEntry>,
  runtimeUploads:InventoryUploadFact[]=[] ,
  now=new Date()
):ReadyVideoInventorySnapshot{
  const nowMs=now.getTime(),channelById=new Map(channels.map(c=>[c.id,c])),runtimeByJob=new Map(runtimeUploads.map(x=>[x.jobId,x]));
  const items:ReadyVideoInventoryItem[]=[];
  for(const job of jobs){
    const channel=channelById.get(job.channelId);if(!channel)continue;
    const lifecycleEntry=lifecycleForJob(job.id,projectLifecycle),lifecycle=lifecycleEntry?.[1],upload=latestUpload(job.id,uploadHistory),runtime=runtimeByJob.get(job.id);
    const hasFinal=productionVideoExists(job,lifecycle);
    if(!hasFinal&&!upload&&!runtime&&job.status!=='ERROR'&&job.status!=='SCHEDULED')continue;
    let status:ReadyVideoInventoryStatus|undefined;
    if(runtime?.status==='UPLOADING')status='UPLOADING';
    else if(runtime?.status==='QUEUED')status='QUEUED';
    else if(upload){status=isFuture(upload.publishAt||job.publishAt,nowMs)?'SCHEDULED':'PUBLISHED'}
    else if(job.status==='SCHEDULED'||job.youtubeVideoId||job.storageLifecycle==='UPLOADED'){status=isFuture(job.publishAt,nowMs)?'SCHEDULED':'PUBLISHED'}
    else if(job.status==='ERROR'||job.storageLifecycle==='FAILED'||(job.status==='UPLOADING'&&!runtime))status='ERROR';
    else if(isReadyAvailable(job,uploadHistory,projectLifecycle,runtimeUploads))status='READY';
    if(!status)continue;
    const projectName=basename(lifecycle?.projectPath)||basename(job.folder)||videoCode(job);
    items.push({
      jobId:job.id,channelId:job.channelId,channelName:channel.name,projectId:lifecycle?.projectId,projectName,videoCode:videoCode(job),filename:basename(job.finalPath),finalPath:job.finalPath,status,
      metadataState:job.metadataLocked?'LOCKED':String(job.metadataSource||'template').toUpperCase(),publishAt:upload?.publishAt||job.publishAt,youtubeVideoId:upload?.youtubeVideoId||job.youtubeVideoId,
      progressPercent:runtime?.progressPercent??(status==='UPLOADING'?job.uploadProgress:undefined),estimatedRemainingSeconds:runtime?.estimatedRemainingSeconds,error:job.error
    });
  }
  items.sort((a,b)=>a.channelName.localeCompare(b.channelName,'ru')||a.videoCode.localeCompare(b.videoCode));
  const byChannel:Record<string,ChannelReadyInventory>={};
  for(const channel of channels){
    const rows=items.filter(x=>x.channelId===channel.id),free=rows.filter(x=>x.status==='READY').length,scheduled=rows.filter(x=>x.status==='SCHEDULED').length,uploading=rows.filter(x=>x.status==='UPLOADING'||x.status==='QUEUED').length,published=rows.filter(x=>x.status==='PUBLISHED').length,errors=rows.filter(x=>x.status==='ERROR').length;
    byChannel[channel.id]={channelId:channel.id,channelName:channel.name,free,scheduled,uploading,published,errors,stockDays:Math.max(0,Math.round(free*scheduleAverageIntervalDays(channel))),itemIds:rows.map(x=>x.jobId)};
  }
  const channelRows=channels.map(c=>byChannel[c.id]).filter(Boolean).sort((a,b)=>a.channelName.localeCompare(b.channelName,'ru'));
  return{
    globalFinalVideoCount:jobs.filter(j=>Boolean(j.finalPath)&&j.storageLifecycle!=='TRASHED').length,
    globalFreeCount:channelRows.reduce((n,x)=>n+x.free,0),channels:channelRows,items,byChannel
  };
}

export function filterReadyVideoInventory(items:ReadyVideoInventoryItem[],opts:{channelId?:string;status?:'ALL'|ReadyVideoInventoryStatus|'ACTIVE';query?:string}){
  const q=String(opts.query||'').trim().toLowerCase();
  return items.filter(x=>(!opts.channelId||x.channelId===opts.channelId)&&(opts.status==null||opts.status==='ALL'||(opts.status==='ACTIVE'?(x.status==='UPLOADING'||x.status==='QUEUED'):x.status===opts.status))&&(!q||[x.projectName,x.videoCode,x.filename,x.channelName].some(v=>String(v||'').toLowerCase().includes(q))));
}
