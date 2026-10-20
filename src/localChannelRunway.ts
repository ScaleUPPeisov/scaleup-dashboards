import {calendarDaysBetween} from './channelRunwayCore';
import {addCalendarDays} from './channelSchedule';

export type LocalChannelRunwayInput={
  now:Date;
  youtubeScheduledThrough?:Date|null;
  localVideoCount:number;
  publicationIntervalDays:number;
};

export type LocalChannelRunway={
  localStockDays:number;
  coverageThrough:Date|null;
  totalRunwayDays:number;
};

export type LocalChannelRunwayPriorityRow={
  channel:{name:string};
  localRunway:LocalChannelRunway;
};

function startOfLocalDay(value:Date){
  return new Date(value.getFullYear(),value.getMonth(),value.getDate())
}

function validDate(value:Date|null|undefined):value is Date{
  return Boolean(value)&&Number.isFinite(value!.getTime())
}

function localDateKey(value:Date){
  const pad=(part:number)=>String(part).padStart(2,'0');
  return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`
}

export function calculateLocalChannelRunway(input:LocalChannelRunwayInput):LocalChannelRunway{
  const safeVideoCount=Number.isFinite(input.localVideoCount)?Math.max(0,Math.floor(input.localVideoCount)):0;
  const safeInterval=Number.isFinite(input.publicationIntervalDays)&&input.publicationIntervalDays>0
    ?Math.max(1,Math.floor(input.publicationIntervalDays))
    :1;
  const localStockDays=safeVideoCount*safeInterval;
  const today=startOfLocalDay(input.now);
  const youtubeThrough=validDate(input.youtubeScheduledThrough)?startOfLocalDay(input.youtubeScheduledThrough):null;
  const futureYoutubeThrough=youtubeThrough&&youtubeThrough>today?youtubeThrough:null;

  if(safeVideoCount===0&&!futureYoutubeThrough){
    return{localStockDays:0,coverageThrough:null,totalRunwayDays:0}
  }

  const todayKey=localDateKey(today);
  const coverageKey=addCalendarDays(localDateKey(futureYoutubeThrough||today),localStockDays);
  const coverageThrough=parseLocalCalendarDate(coverageKey)!;
  return{
    localStockDays,
    coverageThrough,
    totalRunwayDays:Math.max(0,calendarDaysBetween(todayKey,coverageKey)??0)
  }
}

export function compareLocalChannelRunwayPriority(a:LocalChannelRunwayPriorityRow,b:LocalChannelRunwayPriorityRow){
  const byRunway=a.localRunway.totalRunwayDays-b.localRunway.totalRunwayDays;
  if(byRunway!==0)return byRunway;
  const aCoverage=a.localRunway.coverageThrough?.getTime()??Number.NEGATIVE_INFINITY;
  const bCoverage=b.localRunway.coverageThrough?.getTime()??Number.NEGATIVE_INFINITY;
  if(aCoverage!==bCoverage)return aCoverage-bCoverage;
  return a.channel.name.localeCompare(b.channel.name,'ru')
}

export function parseLocalCalendarDate(value?:string|null){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  return date.getFullYear()===Number(match[1])&&date.getMonth()===Number(match[2])-1&&date.getDate()===Number(match[3])?date:null
}

export function formatLocalCalendarDate(value:Date){
  return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(value)
}
