import {addCalendarDays} from './channelSchedule';
import type {ImportedMetadata} from './metadata';
import {metadataPublishAtForDate} from './publisherMetadata';
import type {PublishScheduleMode,PublishTimeSource} from './publishWorkspaceState';
import {publisherKrasnoyarskIso,publisherScheduleDateKeys,publisherScheduleDates,todayKrasnoyarskDate,type YoutubeScheduleLike} from './publisherSchedule';

export const PUBLISHER_TIMEZONE='Asia/Krasnoyarsk';
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
function minuteKey(iso:string|undefined){if(!iso)return NaN;const ms=Date.parse(iso);return Number.isFinite(ms)?Math.floor(ms/60000):NaN}
function localParts(iso:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:PUBLISHER_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));const get=(t:string)=>parts.find(x=>x.type===t)?.value||'';return{date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}}
function validIso(value?:string){if(!value)return;const ms=Date.parse(value);return Number.isFinite(ms)?new Date(ms).toISOString():undefined}
function metadataDateKey(row:ImportedMetadata|undefined,fallbackIso?:string){
 const raw=String(row?.publishAt||'').trim();
 if(DATE.test(raw))return raw;
 const direct=validIso(raw);if(direct)return localParts(direct).date;
 const fallback=validIso(fallbackIso);return fallback?localParts(fallback).date:undefined
}
export function futureScheduledPublishAts(videos:YoutubeScheduleLike[],now=new Date()){return videos.filter(v=>v.privacyStatus==='private'&&v.publishAt&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>now.getTime()).map(v=>new Date(v.publishAt!).toISOString()).sort((a,b)=>Date.parse(a)-Date.parse(b))}
export function recommendScheduleContinuation(videos:YoutubeScheduleLike[],mode:PublishScheduleMode,time:string,now=new Date()){
 const occupied=futureScheduledPublishAts(videos,now),lastPublishAt=occupied.at(-1),today=todayKrasnoyarskDate(now),occupiedKeys=new Set(occupied.map(minuteKey));let date=today;
 if(lastPublishAt){const lastDate=localParts(lastPublishAt).date;date=addCalendarDays(lastDate,mode==='2/2'?2:1)}
 let guard=0;while(guard++<3700){const iso=publisherKrasnoyarskIso(date,time);if(iso&&Date.parse(iso)>now.getTime()&&!occupiedKeys.has(minuteKey(iso)))break;date=addCalendarDays(date,1)}
 return{futureCount:occupied.length,lastPublishAt,recommendedStart:date,occupied,timezone:PUBLISHER_TIMEZONE}
}

export type YoutubePublishClockEvidence={time:string;source:'scheduled'|'published';evidenceCount:number;latestEvidenceAt:string;timezone:typeof PUBLISHER_TIMEZONE};
function inferClockFromInstants(instants:string[],source:YoutubePublishClockEvidence['source']):YoutubePublishClockEvidence|undefined{
 const normalized=instants.map(validIso).filter((x):x is string=>Boolean(x));if(!normalized.length)return;
 const buckets=new Map<string,{count:number;latest:string}>();
 for(const iso of normalized){const time=localParts(iso).time,prev=buckets.get(time);if(!prev||Date.parse(iso)>Date.parse(prev.latest))buckets.set(time,{count:(prev?.count||0)+1,latest:iso});else prev.count++}
 const ranked=[...buckets.entries()].sort((a,b)=>b[1].count-a[1].count||Date.parse(b[1].latest)-Date.parse(a[1].latest));const [time,evidence]=ranked[0];
 return{time,source,evidenceCount:evidence.count,latestEvidenceAt:evidence.latest,timezone:PUBLISHER_TIMEZONE}
}
export function inferYoutubePublishClock(videos:YoutubeScheduleLike[],now=new Date()):YoutubePublishClockEvidence|undefined{
 const nowMs=now.getTime();
 const scheduled=videos.filter(v=>v.privacyStatus==='private'&&Boolean(v.publishAt)&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>nowMs).map(v=>v.publishAt!);
 const scheduledClock=inferClockFromInstants(scheduled,'scheduled');if(scheduledClock)return scheduledClock;
 const published=videos.filter(v=>Boolean(v.publishedAt)&&Number.isFinite(Date.parse(v.publishedAt!))&&Date.parse(v.publishedAt!)<=nowMs).map(v=>v.publishedAt!);
 return inferClockFromInstants(published,'published')
}

export type BatchScheduleItem={publishAt?:string;status:'UNCHANGED'|'RESCHEDULED'|'MISSING';reason?:'PAST'|'CONFLICT'|'MISSING'};
export type ResolvePublisherBatchScheduleOptions={mode:PublishScheduleMode;startDate:string;time:string;count:number;timeSource?:PublishTimeSource;fileTimeRows?:Array<ImportedMetadata|undefined>;filePublishAts?:Array<string|undefined>;occupied?:string[];now?:Date;fallbackIntervalDays?:number};
export function resolvePublisherBatchSchedule(opts:ResolvePublisherBatchScheduleOptions){
 const count=Math.max(0,Math.floor(opts.count||0)),now=opts.now||new Date(),nowMs=now.getTime(),occupiedKeys=new Set((opts.occupied||[]).map(minuteKey).filter(Number.isFinite));const items:BatchScheduleItem[]=[],dates:string[]=[];let conflicts=0,pastCorrected=0;const reserve=(iso:string)=>{occupiedKeys.add(minuteKey(iso));dates.push(iso)};
 const timeSource:PublishTimeSource=opts.timeSource||(opts.mode==='file'?'file':'common');
 if(opts.mode!=='file'){
  const useFileTime=timeSource==='file';
  if(!DATE.test(opts.startDate)||(!useFileTime&&!TIME.test(opts.time)))return{items:Array.from({length:count},()=>({status:'MISSING',reason:'MISSING'} as BatchScheduleItem)),dates,conflicts,pastCorrected};
  if(!useFileTime){
   const candidates=publisherScheduleDates(opts.mode,opts.startDate,opts.time,Math.max(count*8,count+256));for(const iso of candidates){if(items.length>=count)break;const ms=Date.parse(iso),key=minuteKey(iso);if(!Number.isFinite(ms))continue;if(ms<=nowMs){pastCorrected++;continue}if(occupiedKeys.has(key)){conflicts++;continue}reserve(iso);items.push({publishAt:iso,status:'UNCHANGED'})}while(items.length<count)items.push({status:'MISSING',reason:'MISSING'});return{items,dates,conflicts,pastCorrected}
  }
  const rows=opts.fileTimeRows||[],candidateDays=publisherScheduleDateKeys(opts.mode,opts.startDate,Math.max(count*16,count+512)),today=todayKrasnoyarskDate(now);let cursor=0;
  for(let i=0;i<count;i++){
   const row=rows[i];let placed=false,itemPast=false,itemConflict=false;
   while(cursor<candidateDays.length){
    const day=candidateDays[cursor++];
    if(day<today){pastCorrected++;itemPast=true;continue}
    if(!row?.publishTime){items.push({status:'MISSING',reason:'MISSING'});placed=true;break}
    const iso=metadataPublishAtForDate(row,day);if(!iso){items.push({status:'MISSING',reason:'MISSING'});placed=true;break}
    const ms=Date.parse(iso),key=minuteKey(iso);
    if(!Number.isFinite(ms)){items.push({status:'MISSING',reason:'MISSING'});placed=true;break}
    if(ms<=nowMs){pastCorrected++;itemPast=true;continue}
    if(occupiedKeys.has(key)){conflicts++;itemConflict=true;continue}
    reserve(iso);items.push({publishAt:iso,status:itemPast||itemConflict?'RESCHEDULED':'UNCHANGED',...(itemPast||itemConflict?{reason:itemConflict?'CONFLICT':'PAST'}:{})});placed=true;break
   }
   if(!placed)items.push({status:'MISSING',reason:'MISSING'})
  }
  return{items,dates,conflicts,pastCorrected}
 }
 const rows=opts.fileTimeRows||[],file=opts.filePublishAts||[],step=Math.max(1,Math.floor(opts.fallbackIntervalDays||1));
 for(let i=0;i<count;i++){
  const row=rows[i],fallback=file[i];let candidate:string|undefined;
  if(timeSource==='file'){
   candidate=validIso(fallback);
   if(!candidate&&row?.publishTime){const day=metadataDateKey(row,fallback);if(day)candidate=metadataPublishAtForDate(row,day)}
   if(!candidate){const raw=String(row?.publishAt||'').trim();if(raw.includes('T'))candidate=validIso(raw)}
  }else{
   const day=metadataDateKey(row,fallback);if(day&&TIME.test(opts.time))candidate=publisherKrasnoyarskIso(day,opts.time)||undefined
  }
  const parsed=candidate?Date.parse(candidate):NaN;if(!candidate||!Number.isFinite(parsed)){items.push({status:'MISSING',reason:'MISSING'});continue}
  const normalized=new Date(parsed).toISOString(),key=minuteKey(normalized),past=parsed<=nowMs,conflict=occupiedKeys.has(key);if(!past&&!conflict){reserve(normalized);items.push({publishAt:normalized,status:'UNCHANGED'});continue}
  if(past)pastCorrected++;if(conflict)conflicts++;const local=localParts(normalized);let date=local.date,guard=0,found='';while(guard++<10000){date=addCalendarDays(date,step);const iso=publisherKrasnoyarskIso(date,local.time);if(!iso)continue;const ms=Date.parse(iso);if(ms>nowMs&&!occupiedKeys.has(minuteKey(iso))){found=iso;break}}if(found){reserve(found);items.push({publishAt:found,status:'RESCHEDULED',reason:conflict?'CONFLICT':'PAST'})}else items.push({status:'MISSING',reason:'MISSING'})
 }
 return{items,dates,conflicts,pastCorrected}
}