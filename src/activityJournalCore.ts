import type {ActivityDetailValue,ActivityEvent,ActivityEventType,ActivitySource,ActivityStatus,Channel,StorageLifecycleState,UploadHistoryRecord,VideoJob} from './types';

const TYPES=new Set<ActivityEventType>([
 'UPLOAD_QUEUED','UPLOAD_STARTED','UPLOAD_PROGRESS','UPLOAD_ACCEPTED','YOUTUBE_PROCESSING','YOUTUBE_READY','UPLOAD_FAILED',
 'METADATA_UPDATE_STARTED','METADATA_UPDATE_SUCCEEDED','METADATA_UPDATE_FAILED','TITLE_UPDATED','DESCRIPTION_UPDATED','TAGS_UPDATED','SCHEDULE_UPDATED','PRIVACY_UPDATED','THUMBNAIL_UPDATED',
 'INVENTORY_SYNC_STARTED','INVENTORY_SYNC_COMPLETED','INVENTORY_SYNC_PARTIAL','SOURCE_TRASH_REQUESTED','SOURCE_TRASHED','SOURCE_MISSING','SOURCE_RECOVERED','OAUTH_RECONNECT','CHANNEL_REBOUND'
]);
const STATUSES=new Set<ActivityStatus>(['STARTED','SUCCESS','FAILED','PARTIAL','INFO']);
const SOURCES=new Set<ActivitySource>(['LIVE_OPERATION','RECONSTRUCTED','LEGACY_IMPORT']);
const FORBIDDEN_KEY=/(access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization[_-]?code|password|credential)/i;
const MAX_EVENTS=20000;

function cleanString(v:unknown,max=1600){return typeof v==='string'?v.slice(0,max):undefined}
function cleanDetails(raw:unknown):Record<string,ActivityDetailValue>|undefined{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
 const out:Record<string,ActivityDetailValue>={};
 for(const [key,value] of Object.entries(raw as Record<string,unknown>)){
  if(FORBIDDEN_KEY.test(key))continue;
  if(typeof value==='string')out[key]=value.slice(0,1000);
  else if(typeof value==='number'&&Number.isFinite(value))out[key]=value;
  else if(typeof value==='boolean'||value===null)out[key]=value;
  else if(Array.isArray(value)){
   const strings=value.filter(x=>typeof x==='string').map(x=>String(x).slice(0,240)).slice(0,100);
   if(strings.length===value.length)out[key]=strings;
   else{
    const numbers=value.filter(x=>typeof x==='number'&&Number.isFinite(x)).map(Number).slice(0,100);
    if(numbers.length===value.length)out[key]=numbers;
   }
  }
 }
 return Object.keys(out).length?out:undefined;
}

export function normalizeActivityEvent(raw:any):ActivityEvent|undefined{
 if(!raw||typeof raw!=='object')return;
 const eventType=TYPES.has(raw.eventType)?raw.eventType:undefined;
 if(!eventType)return;
 const timestamp=cleanString(raw.timestamp,80)||new Date(0).toISOString();
 const eventId=cleanString(raw.eventId,240)||'';
 if(!eventId)return;
 return{
  eventId,
  operationId:cleanString(raw.operationId,240),
  batchId:cleanString(raw.batchId,240),
  timestamp,
  channelId:cleanString(raw.channelId,240),
  channelName:cleanString(raw.channelName,300),
  profileId:cleanString(raw.profileId,240),
  jobId:cleanString(raw.jobId,240),
  youtubeVideoId:cleanString(raw.youtubeVideoId,240),
  localSourcePath:cleanString(raw.localSourcePath,1600),
  eventType,
  status:STATUSES.has(raw.status)?raw.status:'INFO',
  details:cleanDetails(raw.details),
  errorCode:cleanString(raw.errorCode,240),
  source:SOURCES.has(raw.source)?raw.source:'LIVE_OPERATION'
 };
}
export function normalizeActivityJournal(raw:unknown):ActivityEvent[]{
 if(!Array.isArray(raw))return[];
 const seen=new Set<string>(),out:ActivityEvent[]=[];
 for(const row of raw){
  const x=normalizeActivityEvent(row);if(!x||seen.has(x.eventId))continue;seen.add(x.eventId);out.push(x);
 }
 return out.slice(-MAX_EVENTS);
}
export function appendJournalEvent(events:ActivityEvent[],raw:ActivityEvent):ActivityEvent[]{
 const x=normalizeActivityEvent(raw);if(!x)return events;
 const idx=events.findIndex(e=>e.eventId===x.eventId);
 const next=idx>=0?events.map((e,i)=>i===idx?x:e):[...events,x];
 return next.slice(-MAX_EVENTS);
}
export function activityEvent(input:Omit<ActivityEvent,'eventId'|'timestamp'|'source'|'status'> & {eventId?:string;timestamp?:string;source?:ActivitySource;status?:ActivityStatus}):ActivityEvent{
 return normalizeActivityEvent({
  ...input,
  eventId:input.eventId||crypto.randomUUID(),
  timestamp:input.timestamp||new Date().toISOString(),
  source:input.source||'LIVE_OPERATION',
  status:input.status||'INFO'
 })!;
}

export function legacyUploadJournal(history:UploadHistoryRecord[],channels:Channel[],existing:ActivityEvent[]):ActivityEvent[]{
 const have=new Set(existing.map(x=>x.eventId)),out:ActivityEvent[]=[];
 for(const row of history){
  const channelName=channels.find(c=>c.id===row.channelId)?.name||row.channelId;
  const acceptedId=`legacy:upload-accepted:${row.id}`,liveAccepted=existing.some(e=>e.eventType==='UPLOAD_ACCEPTED'&&e.jobId===row.jobId&&e.youtubeVideoId===row.youtubeVideoId);
  if(row.youtubeVideoId&&row.uploadedAt&&!have.has(acceptedId)&&!liveAccepted)out.push(activityEvent({
   eventId:acceptedId,eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',source:'RECONSTRUCTED',
   timestamp:row.uploadedAt,channelId:row.channelId,channelName,profileId:row.profileId,jobId:row.jobId,youtubeVideoId:row.youtubeVideoId,
   localSourcePath:row.localFilePath,batchId:row.batchId,
   details:{evidence:'uploadHistory',filename:row.originalFilename,fileSize:row.fileSize,publishAt:row.publishAt||'',processingState:row.processingState||'PROCESSING_UNKNOWN'}
  }));
  const readyId=`legacy:youtube-ready:${row.id}`,liveReady=existing.some(e=>e.eventType==='YOUTUBE_READY'&&e.jobId===row.jobId&&e.youtubeVideoId===row.youtubeVideoId);
  if(row.processingState==='READY'&&row.readyAt&&!have.has(readyId)&&!liveReady)out.push(activityEvent({
   eventId:readyId,eventType:'YOUTUBE_READY',status:'SUCCESS',source:'RECONSTRUCTED',
   timestamp:row.readyAt,channelId:row.channelId,channelName,profileId:row.profileId,jobId:row.jobId,youtubeVideoId:row.youtubeVideoId,
   localSourcePath:row.localFilePath,batchId:row.batchId,details:{evidence:'uploadHistory.readyAt'}
  }));
  const trashId=`legacy:source-trashed:${row.id}`,liveTrash=existing.some(e=>e.eventType==='SOURCE_TRASHED'&&e.jobId===row.jobId&&e.youtubeVideoId===row.youtubeVideoId);
  if(row.trashedAt&&!have.has(trashId)&&!liveTrash)out.push(activityEvent({
   eventId:trashId,eventType:'SOURCE_TRASHED',status:'SUCCESS',source:'LEGACY_IMPORT',
   timestamp:row.trashedAt,channelId:row.channelId,channelName,profileId:row.profileId,jobId:row.jobId,youtubeVideoId:row.youtubeVideoId,
   localSourcePath:row.localFilePath,batchId:row.batchId,operationId:row.trashOperationId,
   details:{evidence:'uploadHistory.trashedAt',legacyLifecycle:'TRASHED'}
  }));
 }
 return out;
}

export type LegacyMetadataHistoryRow={
 operationId:string;at:string;channelId:string;channelName:string;selectedVideoCount:number;changedVideoCount:number;
 changedFields:string[];status:'success'|'partial'|'failed';metadataOk:number;total:number;scheduleOk:number;scheduleTotal:number;failed:number;
};
export function legacyMetadataJournal(rows:LegacyMetadataHistoryRow[],existing:ActivityEvent[]):ActivityEvent[]{
 const have=new Set(existing.map(x=>x.eventId)),out:ActivityEvent[]=[];
 for(const row of rows){
  const id=`legacy:metadata:${row.operationId}`;if(have.has(id)||existing.some(e=>e.operationId===row.operationId&&(e.eventType==='METADATA_UPDATE_SUCCEEDED'||e.eventType==='METADATA_UPDATE_FAILED')))continue;
  const status:ActivityStatus=row.status==='success'?'SUCCESS':row.status==='partial'?'PARTIAL':'FAILED';
  out.push(activityEvent({
   eventId:id,eventType:row.status==='failed'?'METADATA_UPDATE_FAILED':'METADATA_UPDATE_SUCCEEDED',status,source:'LEGACY_IMPORT',
   timestamp:row.at,operationId:row.operationId,batchId:row.operationId,channelId:row.channelId,channelName:row.channelName,
   details:{evidence:'metadataWorkspaceState',selected:row.selectedVideoCount,changed:row.changedVideoCount,changedFields:row.changedFields,metadataOk:row.metadataOk,total:row.total,scheduleOk:row.scheduleOk,scheduleTotal:row.scheduleTotal,failed:row.failed}
  }));
 }
 return out;
}

export type SourceClassification='PRESENT'|'TRASHED_BY_VYRON'|'MISSING_LEGACY_UNKNOWN'|'SOURCE_CHANGED'|'UNKNOWN';
export function effectiveSourceLifecycle(row:UploadHistoryRecord):SourceClassification{
 if(row.sourceLifecycle==='TRASHED_BY_VYRON'||row.trashedAt)return'TRASHED_BY_VYRON';
 if(row.sourceLifecycle==='PRESENT')return'PRESENT';
 if(row.sourceLifecycle==='SOURCE_CHANGED')return'SOURCE_CHANGED';
 if(row.sourceLifecycle==='MISSING_EXTERNAL'||row.sourceLifecycle==='MISSING_LEGACY_UNKNOWN')return'MISSING_LEGACY_UNKNOWN';
 return'UNKNOWN';
}
export function cleanupPreclassification(history:UploadHistoryRecord[],jobs:VideoJob[]){
 const result={eligible:[] as UploadHistoryRecord[],alreadyMissing:[] as UploadHistoryRecord[],processing:[] as UploadHistoryRecord[],changed:[] as UploadHistoryRecord[],verification:[] as UploadHistoryRecord[],trashed:[] as UploadHistoryRecord[]};
 for(const row of history){
  const source=effectiveSourceLifecycle(row),job=jobs.find(j=>j.id===row.jobId);
  if(source==='TRASHED_BY_VYRON'){result.trashed.push(row);continue}
  if(source==='MISSING_LEGACY_UNKNOWN'){result.alreadyMissing.push(row);continue}
  if(source==='SOURCE_CHANGED'){result.changed.push(row);continue}
  if(row.processingState!=='READY'){result.processing.push(row);continue}
  const identity=Boolean(row.youtubeVideoId?.trim()&&row.profileId?.trim()&&row.localFilePath?.trim()&&row.sha256?.trim()&&row.identityVerifiedAt);
  const jobMatch=!job||(job.finalPath===row.localFilePath&&(!job.uploadFingerprint||job.uploadFingerprint.toLowerCase()===row.sha256.toLowerCase()));
  if(source==='PRESENT'&&identity&&jobMatch)result.eligible.push(row);else result.verification.push(row);
 }
 return result;
}
export function activityDayKey(iso:string){
 const d=new Date(iso);if(!Number.isFinite(d.getTime()))return'unknown';
 return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function dailySummary(events:ActivityEvent[],channelId?:string){
 const out:Record<string,{uploaded:number;ready:number;processing:number;failed:number;metadata:number;schedule:number;description:number;tags:number;lastAt?:string}>={};
 for(const e of events.filter(x=>!channelId||x.channelId===channelId)){
  const key=activityDayKey(e.timestamp),x=out[key]||(out[key]={uploaded:0,ready:0,processing:0,failed:0,metadata:0,schedule:0,description:0,tags:0});
  if(e.eventType==='UPLOAD_ACCEPTED')x.uploaded++;
  if(e.eventType==='YOUTUBE_READY')x.ready++;
  if(e.eventType==='YOUTUBE_PROCESSING')x.processing++;
  if(e.eventType==='UPLOAD_FAILED'||e.status==='FAILED')x.failed++;
  if(e.eventType==='METADATA_UPDATE_SUCCEEDED')x.metadata+=Number(e.details?.changed||e.details?.metadataOk||1);
  if(e.eventType==='SCHEDULE_UPDATED')x.schedule+=Number(e.details?.count||1);
  if(e.eventType==='DESCRIPTION_UPDATED')x.description+=Number(e.details?.count||1);
  if(e.eventType==='TAGS_UPDATED')x.tags+=Number(e.details?.count||1);
  if(!x.lastAt||e.timestamp>x.lastAt)x.lastAt=e.timestamp;
 }
 return out;
}
