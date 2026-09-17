import {addCalendarDays} from './channelSchedule';
import type {PublishScheduleMode} from './publishWorkspaceState';
import {publisherKrasnoyarskIso,publisherScheduleDates,todayKrasnoyarskDate,type YoutubeScheduleLike} from './publisherSchedule';

export const PUBLISHER_TIMEZONE='Asia/Krasnoyarsk';
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
function minuteKey(iso:string|undefined){if(!iso)return NaN;const ms=Date.parse(iso);return Number.isFinite(ms)?Math.floor(ms/60000):NaN}
function localParts(iso:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:PUBLISHER_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));const get=(t:string)=>parts.find(x=>x.type===t)?.value||'';return{date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}}
export function futureScheduledPublishAts(videos:YoutubeScheduleLike[],now=new Date()){return videos.filter(v=>v.privacyStatus==='private'&&v.publishAt&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>now.getTime()).map(v=>new Date(v.publishAt!).toISOString()).sort((a,b)=>Date.parse(a)-Date.parse(b))}
export function recommendScheduleContinuation(videos:YoutubeScheduleLike[],mode:PublishScheduleMode,time:string,now=new Date()){
 const occupied=futureScheduledPublishAts(videos,now),lastPublishAt=occupied.at(-1),today=todayKrasnoyarskDate(now),occupiedKeys=new Set(occupied.map(minuteKey));let date=today;
 if(lastPublishAt){const lastDate=localParts(lastPublishAt).date;date=addCalendarDays(lastDate,mode==='2/2'?2:1)}
 let guard=0;while(guard++<3700){const iso=publisherKrasnoyarskIso(date,time);if(iso&&Date.parse(iso)>now.getTime()&&!occupiedKeys.has(minuteKey(iso)))break;date=addCalendarDays(date,1)}
 return{futureCount:occupied.length,lastPublishAt,recommendedStart:date,occupied,timezone:PUBLISHER_TIMEZONE}
}
export type BatchScheduleItem={publishAt?:string;status:'UNCHANGED'|'RESCHEDULED'|'MISSING';reason?:'PAST'|'CONFLICT'|'MISSING'};
export type ResolvePublisherBatchScheduleOptions={mode:PublishScheduleMode;startDate:string;time:string;count:number;filePublishAts?:Array<string|undefined>;occupied?:string[];now?:Date;fallbackIntervalDays?:number};
export function resolvePublisherBatchSchedule(opts:ResolvePublisherBatchScheduleOptions){
 const count=Math.max(0,Math.floor(opts.count||0)),now=opts.now||new Date(),nowMs=now.getTime(),occupiedKeys=new Set((opts.occupied||[]).map(minuteKey).filter(Number.isFinite));const items:BatchScheduleItem[]=[],dates:string[]=[];let conflicts=0,pastCorrected=0;const reserve=(iso:string)=>{occupiedKeys.add(minuteKey(iso));dates.push(iso)};
 if(opts.mode!=='file'){
  if(!DATE.test(opts.startDate)||!TIME.test(opts.time))return{items:Array.from({length:count},()=>({status:'MISSING',reason:'MISSING'} as BatchScheduleItem)),dates,conflicts,pastCorrected};
  const candidates=publisherScheduleDates(opts.mode,opts.startDate,opts.time,Math.max(count*8,count+256));for(const iso of candidates){if(items.length>=count)break;const ms=Date.parse(iso),key=minuteKey(iso);if(!Number.isFinite(ms))continue;if(ms<=nowMs){pastCorrected++;continue}if(occupiedKeys.has(key)){conflicts++;continue}reserve(iso);items.push({publishAt:iso,status:'UNCHANGED'})}while(items.length<count)items.push({status:'MISSING',reason:'MISSING'});return{items,dates,conflicts,pastCorrected}
 }
 const step=Math.max(1,Math.floor(opts.fallbackIntervalDays||1)),file=opts.filePublishAts||[];for(let i=0;i<count;i++){const candidate=file[i],parsed=candidate?Date.parse(candidate):NaN;if(!candidate||!Number.isFinite(parsed)){items.push({status:'MISSING',reason:'MISSING'});continue}const normalized=new Date(parsed).toISOString(),key=minuteKey(normalized),past=parsed<=nowMs,conflict=occupiedKeys.has(key);if(!past&&!conflict){reserve(normalized);items.push({publishAt:normalized,status:'UNCHANGED'});continue}if(past)pastCorrected++;if(conflict)conflicts++;const local=localParts(normalized);let date=local.date,guard=0,found='';while(guard++<10000){date=addCalendarDays(date,step);const iso=publisherKrasnoyarskIso(date,local.time);if(!iso)continue;const ms=Date.parse(iso);if(ms>nowMs&&!occupiedKeys.has(minuteKey(iso))){found=iso;break}}if(found){reserve(found);items.push({publishAt:found,status:'RESCHEDULED',reason:conflict?'CONFLICT':'PAST'})}else items.push({status:'MISSING',reason:'MISSING'})}return{items,dates,conflicts,pastCorrected}
}
