import {addCalendarDays,isPatternPublishDate,krasDateKey,toKratLocalInput} from './channelSchedule';
import {publisherKrasnoyarskIso} from './publisherSchedule';
import type {YoutubeExistingVideo} from './types';

export type ScheduleOnlyMode='daily'|'everyOther'|'interval'|'pattern';
export type ScheduleOnlyStartMode='preserveFirst'|'manual';
export type ScheduleOnlyRowState='READY'|'ALREADY_CORRECT'|'ALREADY_PUBLISHED'|'PRIVATE_NO_SCHEDULE'|'PAST_DATE'|'CONFLICT'|'UNSUPPORTED_STATE';
export type ScheduleOnlyPlanRow={videoId:string;title:string;privacyStatus:string;currentPublishAt?:string;desiredPublishAt?:string;state:ScheduleOnlyRowState;reason?:string;originalIndex:number};
export type ScheduleOnlyPlan={channelId:string;planHash:string;operationId:string;rows:ScheduleOnlyPlanRow[];selectedCount:number;writeCount:number;unchangedCount:number;publishedSkipped:number;privateNoScheduleCount:number;conflictCount:number;pastCount:number;blocked:boolean;startDate?:string;time:string;mode:ScheduleOnlyMode};
export type ScheduleOnlyRecoveryRow={videoId:string;title:string;currentPublishAt?:string;desiredPublishAt:string;status:'PENDING'|'APPLIED'|'FAILED';error?:string};
export type ScheduleOnlyRecovery={version:1;channelId:string;planHash:string;operationId:string;createdAt:string;updatedAt:string;rows:ScheduleOnlyRecoveryRow[]};

const RECOVERY_PREFIX='vyron:schedule-only:recovery:v1:';
const minuteKey=(iso?:string)=>{const n=iso?Date.parse(iso):NaN;return Number.isFinite(n)?Math.floor(n/60000):NaN};
const dateMs=(key:string)=>{const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN};
const diffDays=(a:string,b:string)=>{const x=dateMs(a),y=dateMs(b);return Number.isFinite(x)&&Number.isFinite(y)?Math.round((y-x)/86400000):NaN};
export function kratTime(iso?:string){return iso?toKratLocalInput(iso).slice(11,16):''}
export function isFutureScheduled(v:YoutubeExistingVideo,now=new Date()){const t=v.publishAt?Date.parse(v.publishAt):NaN;return v.privacyStatus==='private'&&Number.isFinite(t)&&t>now.getTime()}
export function isPrivateNoSchedule(v:YoutubeExistingVideo){return v.privacyStatus==='private'&&(!v.publishAt||!Number.isFinite(Date.parse(v.publishAt)))}
export function futureScheduledVideos(videos:YoutubeExistingVideo[],now=new Date()){return videos.filter(v=>isFutureScheduled(v,now)).sort((a,b)=>Date.parse(a.publishAt!)-Date.parse(b.publishAt!)||a.position-b.position||a.id.localeCompare(b.id))}
export function privateNoScheduleVideos(videos:YoutubeExistingVideo[]){return videos.filter(isPrivateNoSchedule).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id))}
export function inferScheduleSummary(videos:YoutubeExistingVideo[],now=new Date()){
 const rows=futureScheduledVideos(videos,now),dates=rows.map(v=>krasDateKey(v.publishAt)!).filter(Boolean),times=rows.map(v=>kratTime(v.publishAt)).filter(Boolean),uniqueTimes=[...new Set(times)];
 const diffs=dates.slice(1).map((x,i)=>diffDays(dates[i],x)).filter(Number.isFinite),same=diffs.length&&diffs.every(x=>x===diffs[0]);
 const cadence=!rows.length?'нет будущего расписания':rows.length===1?'1 будущее видео':same&&diffs[0]===1?'каждый день':same&&diffs[0]===2?'через день':same?`каждые ${diffs[0]} дн.`:'смешанный график';
 return{futureCount:rows.length,cadence,time:uniqueTimes.length===1?uniqueTimes[0]:(uniqueTimes.length?'разное':'—'),firstPublishAt:rows[0]?.publishAt,lastPublishAt:rows.at(-1)?.publishAt};
}
function fnv1a(input:string){let h=0x811c9dc5;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16).padStart(8,'0')}
function nextDates(mode:ScheduleOnlyMode,startDate:string,time:string,count:number,intervalDays:number,publishDays:number,pauseDays:number){
 const out:string[]=[];let key=startDate,guard=0;const step=mode==='daily'?1:mode==='everyOther'?2:Math.max(1,Math.floor(intervalDays||1));const pattern={publishDays:Math.max(1,Math.floor(publishDays||3)),pauseDays:Math.max(1,Math.floor(pauseDays||1)),anchorDate:startDate};
 while(out.length<count&&guard++<50000){if(mode!=='pattern'||isPatternPublishDate(key,pattern)){const iso=publisherKrasnoyarskIso(key,time);if(iso)out.push(iso)}key=addCalendarDays(key,mode==='pattern'?1:step)}return out;
}
export function buildScheduleOnlyPlan(opts:{channelId:string;videos:YoutubeExistingVideo[];selectedIds:string[];mode:ScheduleOnlyMode;startMode:ScheduleOnlyStartMode;manualStartDate?:string;time?:string;intervalDays?:number;publishDays?:number;pauseDays?:number;now?:Date}){
 const now=opts.now||new Date(),selectedSet=new Set(opts.selectedIds),indexed=opts.videos.map((video,originalIndex)=>({video,originalIndex}));
 const selected=indexed.filter(x=>selectedSet.has(x.video.id)).sort((a,b)=>{const ta=a.video.publishAt?Date.parse(a.video.publishAt):NaN,tb=b.video.publishAt?Date.parse(b.video.publishAt):NaN;const aa=Number.isFinite(ta)?ta:Number.POSITIVE_INFINITY,bb=Number.isFinite(tb)?tb:Number.POSITIVE_INFINITY;return aa-bb||a.originalIndex-b.originalIndex||a.video.id.localeCompare(b.video.id)});
 const schedulable=selected.filter(({video})=>video.privacyStatus==='private'&&(isFutureScheduled(video,now)||isPrivateNoSchedule(video)));
 const firstScheduled=schedulable.find(x=>isFutureScheduled(x.video,now));
 const startDate=opts.startMode==='manual'?opts.manualStartDate:krasDateKey(firstScheduled?.video.publishAt);
 const time=(opts.time||kratTime(firstScheduled?.video.publishAt)||'04:00').trim();
 const dates=startDate?nextDates(opts.mode,startDate,time,schedulable.length,opts.intervalDays||1,opts.publishDays||3,opts.pauseDays||1):[];
 const desiredById=new Map(schedulable.map((x,i)=>[x.video.id,dates[i]]));
 const occupied=new Map<number,YoutubeExistingVideo>();for(const v of opts.videos){if(selectedSet.has(v.id)||!isFutureScheduled(v,now))continue;const k=minuteKey(v.publishAt);if(Number.isFinite(k))occupied.set(k,v)}
 const rows:ScheduleOnlyPlanRow[]=selected.map(({video,originalIndex})=>{
  if(video.privacyStatus==='public')return{videoId:video.id,title:video.title,privacyStatus:video.privacyStatus,currentPublishAt:video.publishAt,state:'ALREADY_PUBLISHED',reason:'ALREADY_PUBLISHED',originalIndex};
  if(video.privacyStatus!=='private')return{videoId:video.id,title:video.title,privacyStatus:video.privacyStatus,currentPublishAt:video.publishAt,state:'UNSUPPORTED_STATE',reason:'UNSUPPORTED_STATE',originalIndex};
  const desired=desiredById.get(video.id);if(!desired)return{videoId:video.id,title:video.title,privacyStatus:video.privacyStatus,currentPublishAt:video.publishAt,state:isPrivateNoSchedule(video)?'PRIVATE_NO_SCHEDULE':'PAST_DATE',reason:isPrivateNoSchedule(video)?'START_REQUIRED':'NOT_FUTURE_SCHEDULED',originalIndex};
  const dm=Date.parse(desired);if(!Number.isFinite(dm)||dm<=now.getTime())return{videoId:video.id,title:video.title,privacyStatus:video.privacyStatus,currentPublishAt:video.publishAt,desiredPublishAt:desired,state:'PAST_DATE',reason:'PAST_DATE',originalIndex};
  const occ=occupied.get(minuteKey(desired));if(occ)return{videoId:video.id,title:video.title,privacyStatus:video.privacyStatus,currentPublishAt:video.publishAt,desiredPublishAt:desired,state:'CONFLICT',reason:`OCCUPIED:${occ.id}`,originalIndex};
  if(Number.isFinite(minuteKey(video.publishAt))&&minuteKey(video.publishAt)===minuteKey(desired))return{videoId:video.id,title:video.title,privacyStatus:video.privacyStatus,currentPublishAt:video.publishAt,desiredPublishAt:desired,state:'ALREADY_CORRECT',reason:'ALREADY_CORRECT',originalIndex};
  return{videoId:video.id,title:video.title,privacyStatus:video.privacyStatus,currentPublishAt:video.publishAt,desiredPublishAt:desired,state:'READY',originalIndex};
 });
 const hashInput=JSON.stringify({channelId:opts.channelId,mode:opts.mode,startDate,time,rows:rows.filter(r=>r.desiredPublishAt).map(r=>[r.videoId,r.desiredPublishAt])}),planHash=fnv1a(hashInput),writeCount=rows.filter(r=>r.state==='READY').length;
 return{channelId:opts.channelId,planHash,operationId:`schedule-only:${opts.channelId}:${planHash}`,rows,selectedCount:rows.length,writeCount,unchangedCount:rows.filter(r=>r.state==='ALREADY_CORRECT').length,publishedSkipped:rows.filter(r=>r.state==='ALREADY_PUBLISHED').length,privateNoScheduleCount:rows.filter(r=>r.state==='PRIVATE_NO_SCHEDULE').length,conflictCount:rows.filter(r=>r.state==='CONFLICT').length,pastCount:rows.filter(r=>r.state==='PAST_DATE').length,blocked:!startDate||!time||rows.some(r=>r.state==='CONFLICT'||r.state==='PAST_DATE'||r.state==='UNSUPPORTED_STATE'||r.state==='PRIVATE_NO_SCHEDULE'),startDate,time,mode:opts.mode} satisfies ScheduleOnlyPlan;
}
export function recoveryFromPlan(plan:ScheduleOnlyPlan):ScheduleOnlyRecovery{return{version:1,channelId:plan.channelId,planHash:plan.planHash,operationId:plan.operationId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),rows:plan.rows.filter(r=>r.state==='READY'&&r.desiredPublishAt).map(r=>({videoId:r.videoId,title:r.title,currentPublishAt:r.currentPublishAt,desiredPublishAt:r.desiredPublishAt!,status:'PENDING'}))}}
export function loadScheduleRecovery(channelId:string,storage:Pick<Storage,'getItem'>=localStorage){try{const x=JSON.parse(storage.getItem(RECOVERY_PREFIX+channelId)||'null');return x?.version===1?x as ScheduleOnlyRecovery:undefined}catch{return}}
export function saveScheduleRecovery(x:ScheduleOnlyRecovery,storage:Pick<Storage,'setItem'>=localStorage){x.updatedAt=new Date().toISOString();storage.setItem(RECOVERY_PREFIX+x.channelId,JSON.stringify(x));return x}
export function clearScheduleRecovery(channelId:string,storage:Pick<Storage,'removeItem'>=localStorage){storage.removeItem(RECOVERY_PREFIX+channelId)}
export function recoveryCounts(x?:ScheduleOnlyRecovery){const rows=x?.rows||[];return{applied:rows.filter(r=>r.status==='APPLIED').length,failed:rows.filter(r=>r.status==='FAILED').length,pending:rows.filter(r=>r.status==='PENDING').length,total:rows.length}}
