import type {Channel,YoutubeExistingVideo} from './types';

export const CHANNEL_RUNWAY_STORAGE_KEY='vyron:channel-runway:v1';
export const KRASNOYARSK_TIME_ZONE='Asia/Krasnoyarsk';
export const RUNWAY_PLAN_THRESHOLD_DAYS=45;

export type ChannelRunwayStatus='large'|'plan'|'prepare'|'urgent'|'ended'|'no-data';
export type ChannelRunwayPriority='low'|'normal'|'high'|'critical'|'unknown';

export type ChannelRunwayRecord={
  channelId:string;
  channelName:string;
  scheduledUntil?:string;
  scheduledVideoCount:number;
  averagePublishIntervalDays?:number;
  lastScheduleSync?:string;
  lastLocalCalculation:string;
  runwayDays?:number;
  nextProductionDate?:string;
  priority:ChannelRunwayPriority;
  status:ChannelRunwayStatus;
};

const DAY_MS=86_400_000;
const pad=(n:number)=>String(n).padStart(2,'0');

function zonedParts(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date);
  const get=(type:string)=>Number(parts.find(x=>x.type===type)?.value||0);
  return{year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute')};
}

export function krasnoyarskClock(now=new Date()){
  const p=zonedParts(now,KRASNOYARSK_TIME_ZONE);
  return{...p,dateKey:`${p.year}-${pad(p.month)}-${pad(p.day)}`};
}

export function dateKeyInKrasnoyarsk(value:string|Date){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return undefined;
  const p=zonedParts(date,KRASNOYARSK_TIME_ZONE);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function keyToUtc(key:string){
  const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return Number.NaN;
  return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]));
}

export function calendarDaysBetween(fromKey:string,toKey:string){
  const a=keyToUtc(fromKey),b=keyToUtc(toKey);
  if(!Number.isFinite(a)||!Number.isFinite(b))return undefined;
  return Math.round((b-a)/DAY_MS);
}

export function subtractCalendarDays(dateKey:string,days:number){
  const t=keyToUtc(dateKey);
  if(!Number.isFinite(t))return undefined;
  const d=new Date(t-Math.max(0,Math.round(days))*DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}

export function runwayStatus(days:number|undefined,known=true):ChannelRunwayStatus{
  if(!known||days===undefined)return'no-data';
  if(days<=0)return'ended';
  if(days<=14)return'urgent';
  if(days<=30)return'prepare';
  if(days<=45)return'plan';
  return'large';
}

export function runwayPriority(status:ChannelRunwayStatus):ChannelRunwayPriority{
  if(status==='ended'||status==='urgent')return'critical';
  if(status==='prepare')return'high';
  if(status==='plan')return'normal';
  if(status==='large')return'low';
  return'unknown';
}

function averageIntervalDays(videos:{at:number}[]){
  if(videos.length<2)return undefined;
  let sum=0,count=0;
  for(let i=1;i<videos.length;i++){
    const diff=(videos[i].at-videos[i-1].at)/DAY_MS;
    if(Number.isFinite(diff)&&diff>0){sum+=diff;count++}
  }
  if(!count)return undefined;
  return Math.round((sum/count)*100)/100;
}

export function deriveRunwayRecord(
  channel:Pick<Channel,'id'|'name'>,
  videos:Pick<YoutubeExistingVideo,'publishAt'|'privacyStatus'>[],
  now=new Date(),
  lastScheduleSync?:string,
  known=true
):ChannelRunwayRecord{
  const current=now.getTime();
  // YouTube Scheduled is represented as privacyStatus=private + future status.publishAt.
  // Ignore public/unlisted/unknown items even if malformed/stale data happens to contain publishAt.
  const scheduled=videos
    .filter(v=>v.privacyStatus==='private')
    .map(v=>({at:v.publishAt?Date.parse(v.publishAt):Number.NaN,publishAt:v.publishAt}))
    .filter(v=>Number.isFinite(v.at)&&v.at>current)
    .sort((a,b)=>a.at-b.at);
  const last=scheduled.at(-1);
  const scheduledUntil=last?.publishAt?dateKeyInKrasnoyarsk(last.publishAt):undefined;
  const today=krasnoyarskClock(now).dateKey;
  const rawDays=scheduledUntil?calendarDaysBetween(today,scheduledUntil):undefined;
  const runwayDays=known?(rawDays===undefined?0:Math.max(0,rawDays)):undefined;
  const status=runwayStatus(runwayDays,known);
  return{
    channelId:channel.id,
    channelName:channel.name,
    scheduledUntil,
    scheduledVideoCount:scheduled.length,
    averagePublishIntervalDays:averageIntervalDays(scheduled),
    lastScheduleSync,
    lastLocalCalculation:now.toISOString(),
    runwayDays,
    nextProductionDate:scheduledUntil?subtractCalendarDays(scheduledUntil,RUNWAY_PLAN_THRESHOLD_DAYS):undefined,
    priority:runwayPriority(status),
    status
  };
}

export function recalculateRunwayRecord(record:ChannelRunwayRecord,now=new Date()):ChannelRunwayRecord{
  const today=krasnoyarskClock(now).dateKey;
  const known=record.status!=='no-data'||Boolean(record.lastScheduleSync)||Boolean(record.scheduledUntil);
  const raw=record.scheduledUntil?calendarDaysBetween(today,record.scheduledUntil):undefined;
  const runwayDays=known?(raw===undefined?0:Math.max(0,raw)):undefined;
  const status=runwayStatus(runwayDays,known);
  return{
    ...record,
    lastLocalCalculation:now.toISOString(),
    runwayDays,
    nextProductionDate:record.scheduledUntil?subtractCalendarDays(record.scheduledUntil,RUNWAY_PLAN_THRESHOLD_DAYS):undefined,
    priority:runwayPriority(status),
    status
  };
}

export function compareRunwayRecords(a:ChannelRunwayRecord,b:ChannelRunwayRecord){
  const ad=a.runwayDays,bd=b.runwayDays;
  if(ad===undefined&&bd===undefined)return a.channelName.localeCompare(b.channelName,'ru');
  if(ad===undefined)return 1;
  if(bd===undefined)return-1;
  return ad-bd||String(a.nextProductionDate||'').localeCompare(String(b.nextProductionDate||''))||a.channelName.localeCompare(b.channelName,'ru');
}

export function recommendedProductionIntervalDays(totalChannels:number,batchCoverageDays:number){
  const channels=Math.max(0,Math.floor(totalChannels||0));
  if(!channels||!Number.isFinite(batchCoverageDays)||batchCoverageDays<=0)return undefined;
  return Math.round((batchCoverageDays/channels)*10)/10;
}

export function processingDayOffset(index:number,todayCapacity:number,fullDayCapacity:number){
  const i=Math.max(0,Math.floor(index));
  const today=Math.max(0,Math.floor(todayCapacity));
  const full=Math.max(1,Math.floor(fullDayCapacity||1));
  if(i<today)return 0;
  return 1+Math.floor((i-today)/full);
}

export function quotaRiskCount(records:ChannelRunwayRecord[],todayCapacity:number,fullDayCapacity:number){
  return records
    .filter(r=>r.runwayDays!==undefined)
    .sort(compareRunwayRecords)
    .reduce((count,r,index)=>count+(Number(r.runwayDays)<=processingDayOffset(index,todayCapacity,fullDayCapacity)?1:0),0);
}
