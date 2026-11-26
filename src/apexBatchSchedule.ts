import type {Channel,VideoJob} from './types';
import {addCalendarDays,isPatternPublishDate} from './channelSchedule';
import {publisherKrasnoyarskIso,todayKrasnoyarskDate} from './publisherSchedule';

export type BatchScheduleEvidence={updatedAt:string;complete:boolean;youtubeChannelId?:string;occupied:string[]};
export const BATCH_SCHEDULE_MAX_AGE_MS=6*60*60*1000;
const day=(iso:string)=>todayKrasnoyarskDate(new Date(iso));
const validDay=(key:string)=>/^\d{4}-\d{2}-\d{2}$/.test(key)&&Number.isFinite(Date.parse(key+'T00:00:00Z'))&&new Date(key+'T00:00:00Z').toISOString().slice(0,10)===key;
const validInt=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
export function scheduleEvidenceValid(channel:Channel,evidence:BatchScheduleEvidence|undefined,nowMs:number){
 const at=Date.parse(evidence?.updatedAt||'');
 return Boolean(channel.youtubeChannelId&&evidence?.complete&&evidence.youtubeChannelId===channel.youtubeChannelId&&Number.isFinite(at)&&at<=nowMs&&nowMs-at<BATCH_SCHEDULE_MAX_AGE_MS&&evidence.occupied.every(x=>Number.isFinite(Date.parse(x))));
}
export function scheduleConfigKey(channel:Channel){return JSON.stringify([channel.id,channel.youtubeChannelId,channel.youtubeProfileId,channel.scheduleMode,channel.publishIntervalDays,channel.cadenceDays,channel.publishDays,channel.pauseDays,channel.patternAnchorDate,channel.publishHour,channel.publishMinute])}
export function continuationPlan(channel:Channel,jobs:readonly VideoJob[],evidence:BatchScheduleEvidence|undefined,localOccupied:readonly string[],nowMs=Date.now()):{dates:Map<string,string>;reason?:string}{
 const dates=new Map<string,string>();
 const fail=(reason:string)=>({dates:new Map<string,string>(),reason});
 if(!evidence||!scheduleEvidenceValid(channel,evidence,nowMs))return fail('Нужно полное актуальное расписание YouTube именно этого канала');
 if(!validInt(channel.publishHour,0,23)||!validInt(channel.publishMinute,0,59))return fail('Не задано корректное время публикации');
 if(jobs.some(j=>j.channelId!==channel.id)||new Set(jobs.map(j=>j.id)).size!==jobs.length)return fail('Неверная принадлежность проектов');
 const time=[channel.publishHour,channel.publishMinute].map(n=>String(n).padStart(2,'0')).join(':');
 const step=channel.publishIntervalDays??channel.cadenceDays;
 const pattern=channel.scheduleMode==='pattern';
 if(pattern?(!channel.patternAnchorDate||!validDay(channel.patternAnchorDate)||!validInt(channel.publishDays,1,366)||!validInt(channel.pauseDays,1,366)):!validInt(step,1,366))return fail('Периодичность канала не настроена');
 const occupied=[...evidence.occupied,...localOccupied];
 if(occupied.some(x=>!Number.isFinite(Date.parse(x))))return fail('Обнаружена некорректная занятая дата');
 const future=occupied.map(Date.parse).filter(x=>x>nowMs);
 const last=future.reduce((a,b)=>Math.max(a,b),-Infinity);
 let key=Number.isFinite(last)?addCalendarDays(day(new Date(last).toISOString()),pattern?1:step):day(new Date(nowMs).toISOString());
 const patternSpec={anchorDate:channel.patternAnchorDate||'',publishDays:channel.publishDays||1,pauseDays:channel.pauseDays||1};
 if(pattern&&key<patternSpec.anchorDate)key=patternSpec.anchorDate;
 for(const job of jobs){
  let found=false;
  for(let guard=0;guard<20000;guard++){
   const iso=publisherKrasnoyarskIso(key,time);
   if(iso&&Date.parse(iso)>nowMs&&(!pattern||isPatternPublishDate(key,patternSpec))){
    dates.set(job.id,iso);key=addCalendarDays(key,pattern?1:step);found=true;break;
   }
   key=addCalendarDays(key,1);
  }
  if(!found)return fail('Не удалось построить безопасное расписание');
 }
 return{dates};
}
