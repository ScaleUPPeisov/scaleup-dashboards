import type {Channel,FingerprintCacheEntry,ProjectLifecycleRecord,UploadHistoryRecord,VideoJob} from './types';
import type {ChannelRunwayRecord,ChannelRunwayStatus} from './channelRunwayCore';
import {calendarDaysBetween,runwayStatus} from './channelRunwayCore';
import {addCalendarDays,intervalDaysFor,isPatternPublishDate,patternFor,scheduleDescription} from './channelSchedule';
import {publisherKrasnoyarskIso,todayKrasnoyarskDate} from './publisherSchedule';
import type {UploadQuotaState,YoutubeQuotaUsage} from './youtubeQuota';

export type ReadyContentSnapshot={
  channelId:string;
  readyCount:number;
  jobIds:string[];
  duplicateCount:number;
  invalidCount:number;
};

export type ContentRunwaySnapshot={
  channelId:string;
  scheduledThrough?:string;
  scheduledVideoCount:number;
  readyVideoCount:number;
  projectedRunwayEnd?:string;
  contentRunwayDays:number;
  scheduledRunwayDays:number;
  projectedReadySlots:string[];
  cadenceLabel:string;
  status:ChannelRunwayStatus;
  deficitDays:number;
};

export type ContentRunwayQuotaView={
  general:{used:number;limit:number;remaining:number};
  uploads:{used:number;limit:number|null;remaining:number|null;limitKnown:boolean;limitSource?:string;resetAt?:string};
};

const normalized=(value?:string)=>String(value||'').trim();
const fingerprintKey=(value?:string)=>normalized(value).toLowerCase();
const pathKey=(value?:string)=>normalized(value).replace(/\\/g,'/').replace(/\/+$/,'');

type PreparedReadyContext={
  uploadedJobs:Set<string>;
  uploadedHashes:Set<string>;
  lifecycleByJob:Map<string,ProjectLifecycleRecord>;
  jobsByChannel:Map<string,VideoJob[]>;
};
let preparedReadyCache:{
  jobs:VideoJob[];
  uploadHistory:UploadHistoryRecord[];
  projectLifecycle:Record<string,ProjectLifecycleRecord>;
  value:PreparedReadyContext;
}|undefined;

function preparedReadyContext(
  jobs:VideoJob[],
  uploadHistory:UploadHistoryRecord[],
  projectLifecycle:Record<string,ProjectLifecycleRecord>
):PreparedReadyContext{
  const hit=preparedReadyCache;
  if(hit&&hit.jobs===jobs&&hit.uploadHistory===uploadHistory&&hit.projectLifecycle===projectLifecycle)return hit.value;
  const uploadedJobs=new Set<string>(),uploadedHashes=new Set<string>();
  for(const row of uploadHistory){
    if(row.status!=='UPLOADED')continue;
    if(row.youtubeVideoId)uploadedJobs.add(row.jobId);
    const hash=fingerprintKey(row.sha256);if(hash)uploadedHashes.add(hash)
  }
  const lifecycleByJob=new Map<string,ProjectLifecycleRecord>();
  for(const row of Object.values(projectLifecycle||{}))if(row.jobId)lifecycleByJob.set(row.jobId,row);
  const jobsByChannel=new Map<string,VideoJob[]>();
  for(const job of jobs){
    const rows=jobsByChannel.get(job.channelId);
    if(rows)rows.push(job);else jobsByChannel.set(job.channelId,[job])
  }
  const value={uploadedJobs,uploadedHashes,lifecycleByJob,jobsByChannel};
  preparedReadyCache={jobs,uploadHistory,projectLifecycle,value};
  return value
}

export function readyContentForChannel(
  channelId:string,
  jobs:VideoJob[],
  uploadHistory:UploadHistoryRecord[],
  projectLifecycle:Record<string,ProjectLifecycleRecord>,
  fingerprintCache:Record<string,FingerprintCacheEntry>
):ReadyContentSnapshot{
  const prepared=preparedReadyContext(jobs,uploadHistory,projectLifecycle);
  const seen=new Set<string>(),jobIds:string[]=[];
  let duplicateCount=0,invalidCount=0;
  for(const job of prepared.jobsByChannel.get(channelId)||[]){
    const finalPath=pathKey(job.finalPath);
    const invalid=
      job.status!=='READY_UPLOAD'||
      !finalPath||
      Boolean(job.error)||
      Boolean(job.removedFromPublishList)||
      Boolean(job.youtubeVideoId)||
      Boolean(job.uploadedAt)||
      prepared.uploadedJobs.has(job.id)||
      job.storageLifecycle==='UPLOADED'||
      job.storageLifecycle==='TRASHED'||
      job.storageLifecycle==='FAILED'||
      job.storageLifecycle==='UPLOADING';
    if(invalid){invalidCount++;continue}
    const lifecycle=prepared.lifecycleByJob.get(job.id);
    if(lifecycle&&(!lifecycle.renderExists||!lifecycle.renderPath||pathKey(lifecycle.renderPath)!==finalPath)){invalidCount++;continue}
    const sha=fingerprintKey(job.uploadFingerprint||fingerprintCache[job.finalPath||'']?.sha256);
    if(sha&&prepared.uploadedHashes.has(sha)){duplicateCount++;continue}
    const identity=sha?`sha:${sha}`:`path:${finalPath}`;
    if(seen.has(identity)){duplicateCount++;continue}
    seen.add(identity);jobIds.push(job.id)
  }
  return{channelId,readyCount:jobIds.length,jobIds,duplicateCount,invalidCount}
}

function publishTime(channel:Channel){return `${String(channel.publishHour||0).padStart(2,'0')}:${String(channel.publishMinute||0).padStart(2,'0')}`}
function firstFutureIntervalDate(channel:Channel,startKey:string,now:Date){
  let key=startKey,guard=0;const time=publishTime(channel);
  while(guard++<10000){const iso=publisherKrasnoyarskIso(key,time);if(iso&&Date.parse(iso)>now.getTime())return key;key=addCalendarDays(key,1)}
  return key;
}

export function projectReadyPublishSlots(channel:Channel,scheduledThrough:string|undefined,readyCount:number,now=new Date()){
  const wanted=Math.max(0,Math.floor(readyCount||0));
  if(!wanted)return[] as string[];
  const out:string[]=[],time=publishTime(channel),today=todayKrasnoyarskDate(now),pattern=patternFor(channel);
  if(pattern){
    let key=scheduledThrough?addCalendarDays(scheduledThrough,1):(pattern.anchorDate>today?pattern.anchorDate:today),guard=0;
    while(out.length<wanted&&guard++<50000){
      const iso=publisherKrasnoyarskIso(key,time);
      if(isPatternPublishDate(key,pattern)&&iso&&Date.parse(iso)>now.getTime())out.push(iso);
      key=addCalendarDays(key,1);
    }
    return out;
  }
  const step=intervalDaysFor(channel);
  let key=scheduledThrough?addCalendarDays(scheduledThrough,step):firstFutureIntervalDate(channel,today,now);
  let guard=0;
  while(out.length<wanted&&guard++<20000){
    const iso=publisherKrasnoyarskIso(key,time);
    if(iso&&Date.parse(iso)>now.getTime())out.push(iso);
    key=addCalendarDays(key,step);
  }
  return out;
}

export function buildContentRunway(
  channel:Channel,
  record:ChannelRunwayRecord|undefined,
  jobs:VideoJob[],
  uploadHistory:UploadHistoryRecord[],
  projectLifecycle:Record<string,ProjectLifecycleRecord>,
  fingerprintCache:Record<string,FingerprintCacheEntry>,
  now=new Date()
):ContentRunwaySnapshot{
  const ready=readyContentForChannel(channel.id,jobs,uploadHistory,projectLifecycle,fingerprintCache);
  const projectedReadySlots=projectReadyPublishSlots(channel,record?.scheduledUntil,ready.readyCount,now);
  const projectedRunwayEnd=projectedReadySlots.length
    ?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(projectedReadySlots.at(-1)!))
    :record?.scheduledUntil;
  const today=todayKrasnoyarskDate(now);
  const rawDays=projectedRunwayEnd?calendarDaysBetween(today,projectedRunwayEnd):0;
  const contentRunwayDays=Math.max(0,rawDays??0);
  return{
    channelId:channel.id,
    scheduledThrough:record?.scheduledUntil,
    scheduledVideoCount:record?.scheduledVideoCount||0,
    readyVideoCount:ready.readyCount,
    projectedRunwayEnd,
    contentRunwayDays,
    scheduledRunwayDays:Math.max(0,record?.runwayDays||0),
    projectedReadySlots,
    cadenceLabel:scheduleDescription(channel),
    status:runwayStatus(contentRunwayDays,true),
    deficitDays:Math.max(0,Math.max(0,channel.targetBufferDays||0)-contentRunwayDays)
  };
}


export function confirmedScheduledRunwaySnapshot(
  channel:Channel,
  base:ContentRunwaySnapshot,
  record:ChannelRunwayRecord|undefined,
  readyVideoCount:number,
  now=new Date()
):ContentRunwaySnapshot{
  const known=Boolean(record&&record.status!=='no-data');
  const confirmedDays=known?Math.max(0,Number(record?.runwayDays)||0):0;
  const ready=Math.max(0,Math.floor(Number(readyVideoCount)||0));
  const projectedReadySlots=projectReadyPublishSlots(channel,record?.scheduledUntil,ready,now);
  const projectedRunwayEnd=projectedReadySlots.length
    ?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(projectedReadySlots.at(-1)!))
    :record?.scheduledUntil;
  const today=todayKrasnoyarskDate(now);
  const projectedDays=projectedRunwayEnd?Math.max(0,calendarDaysBetween(today,projectedRunwayEnd)??0):0;
  const contentDays=known||ready?projectedDays:0;
  return{
    ...base,
    scheduledThrough:record?.scheduledUntil,
    scheduledVideoCount:record?.scheduledVideoCount||0,
    readyVideoCount:ready,
    projectedRunwayEnd,
    contentRunwayDays:contentDays,
    scheduledRunwayDays:confirmedDays,
    projectedReadySlots,
    status:known||ready?runwayStatus(contentDays,true):'no-data',
    deficitDays:Math.max(0,Math.max(0,channel.targetBufferDays||0)-contentDays)
  };
}

export function contentRunwayQuotaView(general:YoutubeQuotaUsage,upload?:UploadQuotaState|null):ContentRunwayQuotaView{
  return{
    general:{used:general.used,limit:general.limit,remaining:Math.max(0,general.limit-general.used)},
    uploads:{used:upload?.used||0,limit:upload?.limit??null,remaining:upload?.remaining??null,limitKnown:Boolean(upload?.limit!=null),limitSource:upload?.limitSource,resetAt:upload?.resetAt}
  };
}
