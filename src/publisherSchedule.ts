import {addCalendarDays,isPatternPublishDate} from './channelSchedule';
import type {PublishScheduleMode} from './publishWorkspaceState';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function todayKrasnoyarskDate(now=new Date()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=(t:string)=>p.find(x=>x.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`
}
export function publisherKrasnoyarskIso(date:string,time:string){if(!DATE.test(date)||!TIME.test(time))return'';const d=new Date(`${date}T${time}:00+07:00`);return Number.isFinite(d.getTime())?d.toISOString():''}
export function publisherScheduleDates(mode:PublishScheduleMode,startDate:string,time:string,count:number){
 const wanted=Math.max(0,Math.floor(count||0));if(mode==='file'||!wanted||!DATE.test(startDate)||!TIME.test(time))return[] as string[];
 const out:string[]=[];let key=startDate,guard=0;
 if(mode==='daily'){while(out.length<wanted&&guard++<20000){const iso=publisherKrasnoyarskIso(key,time);if(iso)out.push(iso);key=addCalendarDays(key,1)}return out}
 const pattern=mode==='2/2'?{publishDays:2,pauseDays:2,anchorDate:startDate}:{publishDays:3,pauseDays:1,anchorDate:startDate};
 while(out.length<wanted&&guard++<50000){if(isPatternPublishDate(key,pattern)){const iso=publisherKrasnoyarskIso(key,time);if(iso)out.push(iso)}key=addCalendarDays(key,1)}return out
}
export function publisherSchedulePreview(mode:PublishScheduleMode,startDate:string,time:string,count:number){const dates=publisherScheduleDates(mode,startDate,time,count);return{count:dates.length,first:dates[0],last:dates[dates.length-1],dates}}


export type YoutubeScheduleLike={privacyStatus?:string;publishAt?:string};
export function isFuturePublishAt(iso?:string,now=new Date()){if(!iso)return false;const t=Date.parse(iso);return Number.isFinite(t)&&t>now.getTime()}
export function latestYoutubeScheduledPublishAt(videos:YoutubeScheduleLike[],now=new Date()){
 const rows=videos.filter(v=>v.privacyStatus==='private'&&v.publishAt&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>now.getTime()).map(v=>v.publishAt!).sort((a,b)=>Date.parse(a)-Date.parse(b));return rows.at(-1)
}
export function nextFutureScheduleDate(startDate:string,time:string,now=new Date()){
 let key=DATE.test(startDate)?startDate:todayKrasnoyarskDate(now),guard=0;while(guard++<3700){const iso=publisherKrasnoyarskIso(key,time);if(iso&&isFuturePublishAt(iso,now))return key;key=addCalendarDays(key,1)}return key
}
export function suggestedScheduleStartDate(videos:YoutubeScheduleLike[],time:string,now=new Date()){
 const last=latestYoutubeScheduledPublishAt(videos,now);const base=last?addCalendarDays(todayKrasnoyarskDate(new Date(last)),1):todayKrasnoyarskDate(now);return nextFutureScheduleDate(base,time,now)
}


export type PublisherUnifiedSlotOptions={startDate:string;times:string[];count:number;occupied?:string[];now?:Date};
export function publisherUnifiedChannelSlots(opts:PublisherUnifiedSlotOptions){
 const times=[...new Set((opts.times||[]).filter(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
 if(!times.length)throw new Error('Добавьте хотя бы одно время публикации');
 const wanted=Math.max(0,Math.floor(Number.isFinite(opts.count)?opts.count:0)),now=opts.now||new Date(),nowMs=now.getTime();
 const occupiedInstants=(opts.occupied||[]).map(x=>Date.parse(x)).filter(Number.isFinite);
 const occupied=new Set(occupiedInstants);
 const floor=Math.max(nowMs,...occupiedInstants);
 let date=/^\d{4}-\d{2}-\d{2}$/.test(opts.startDate)?opts.startDate:todayKrasnoyarskDate(now),guard=0;
 const out:string[]=[];
 while(out.length<wanted&&guard++<20000){
  for(const time of times){
   const iso=publisherKrasnoyarskIso(date,time);if(!iso)continue;const ms=Date.parse(iso);
   if(!Number.isFinite(ms)||ms<=floor||occupied.has(ms))continue;
   out.push(iso);occupied.add(ms);if(out.length>=wanted)break;
  }
  date=addCalendarDays(date,1);
 }
 if(out.length!==wanted)throw new Error('Не удалось построить единое расписание канала');
 return out;
}


export type PastDateRepairPolicy=
 |{kind:'daily';time:string}
 |{kind:'interval';intervalDays:number;time?:string}
 |{kind:'pattern';publishDays:number;pauseDays:number;anchorDate:string;time:string}
 |{kind:'unavailable'};
export type PastDateRepairResult={status:'UNCHANGED'|'RESCHEDULED'|'SKIPPED_PAST_DATE';publishAt?:string};
export function repairPastPublishAt(publishAt:string|undefined,policy:PastDateRepairPolicy,now=new Date()):PastDateRepairResult{
 if(!publishAt||!Number.isFinite(Date.parse(publishAt)))return{status:'SKIPPED_PAST_DATE'};if(Date.parse(publishAt)>now.getTime())return{status:'UNCHANGED',publishAt};if(policy.kind==='unavailable')return{status:'SKIPPED_PAST_DATE'};
 const originalKey=todayKrasnoyarskDate(new Date(publishAt));
 if(policy.kind==='interval'){
  const step=Math.max(1,Math.floor(policy.intervalDays||1)),time=policy.time||new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Krasnoyarsk',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(publishAt));let key=originalKey,guard=0;
  while(guard++<10000){key=addCalendarDays(key,step);const iso=publisherKrasnoyarskIso(key,time);if(iso&&Date.parse(iso)>now.getTime())return{status:'RESCHEDULED',publishAt:iso}}
 }
 if(policy.kind==='daily'){
  let key=todayKrasnoyarskDate(now),guard=0;while(guard++<10000){const iso=publisherKrasnoyarskIso(key,policy.time);if(iso&&Date.parse(iso)>now.getTime())return{status:'RESCHEDULED',publishAt:iso};key=addCalendarDays(key,1)}
 }
 if(policy.kind==='pattern'){
  const pattern={publishDays:Math.max(1,policy.publishDays),pauseDays:Math.max(1,policy.pauseDays),anchorDate:policy.anchorDate};let key=todayKrasnoyarskDate(now),guard=0;while(guard++<20000){const iso=publisherKrasnoyarskIso(key,policy.time);if(isPatternPublishDate(key,pattern)&&iso&&Date.parse(iso)>now.getTime())return{status:'RESCHEDULED',publishAt:iso};key=addCalendarDays(key,1)}
 }
 return{status:'SKIPPED_PAST_DATE'}
}
