import type {Channel,VideoJob} from './types';
import type {ChannelRunwayRecord} from './channelRunwayCore';
import {calendarDaysBetween,krasnoyarskClock} from './channelRunwayCore';

export const COMMAND_CENTER_STORAGE_KEY='vyron:command-center:v1';
const DAY_MS=86_400_000;
const pad=(n:number)=>String(n).padStart(2,'0');
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const rowsFor=(jobs:unknown,channelId:string)=>Array.isArray(jobs)?jobs.filter(isRecord).filter(j=>String(j.channelId||'')===channelId):[];

export type ProductionReadiness={
  channelId:string;
  target:number;
  covers:number;
  music:number;
  videos:number;
  seo:number;
  schedule:number;
  readyToYoutube:number;
  errors:number;
  progress:number;
};

export type BatchPlanItem={number:number;label:string;publishDate:string;publishAt:string};
export type BatchPlan={
  id:string;
  channelId:string;
  channelName:string;
  createdAt:string;
  count:number;
  cadenceDays:number;
  startDate:string;
  items:BatchPlanItem[];
};

export type AttentionSeverity='critical'|'warning'|'info';
export type AttentionItem={channelId:string;channelName:string;severity:AttentionSeverity;title:string;detail:string};

export function addCalendarDays(dateKey:string,days:number){
  const m=String(dateKey||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return undefined;
  const t=Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))+Math.round(days)*DAY_MS;
  const d=new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}

export function kratPublishAt(dateKey:string,hour:number,minute:number){
  return `${dateKey}T${pad(Math.max(0,Math.min(23,Math.floor(hour||0))))}:${pad(Math.max(0,Math.min(59,Math.floor(minute||0))))}:00+07:00`;
}

export function buildLocalBatchPlan(channel:Channel,count:number,scheduledUntil?:string,now=new Date()):BatchPlan{
  const safeCount=Math.max(1,Math.min(300,Math.floor(count||1)));
  const cadence=Math.max(1,Math.floor(channel.cadenceDays||1));
  const today=krasnoyarskClock(now).dateKey;
  const first=scheduledUntil?addCalendarDays(scheduledUntil,cadence)||today:today;
  const items:Array<BatchPlanItem>=[];
  for(let i=0;i<safeCount;i++){
    const publishDate=addCalendarDays(first,i*cadence)||first;
    items.push({number:i+1,label:`VIDEO_${String(i+1).padStart(3,'0')}`,publishDate,publishAt:kratPublishAt(publishDate,channel.publishHour,channel.publishMinute)});
  }
  return{
    id:`${channel.id}:${now.getTime()}`,
    channelId:String(channel.id||''),
    channelName:String(channel.name||channel.id||'Канал без названия'),
    createdAt:now.toISOString(),
    count:safeCount,
    cadenceDays:cadence,
    startDate:first,
    items
  };
}

export function productionReadiness(channel:Channel,jobs:VideoJob[],target:number):ProductionReadiness{
  const channelId=String(channel?.id||'');
  const rows=rowsFor(jobs,channelId);
  const safeTarget=Math.max(1,Math.floor(Number.isFinite(target)?target:1));
  const covers=rows.filter(j=>Boolean(text(j.coverPath))).length;
  const music=rows.filter(j=>Number.isFinite(j.tracksCount)&&Number.isFinite(j.minTracks)&&Number(j.tracksCount)>=Number(j.minTracks)).length;
  const videos=rows.filter(j=>Boolean(text(j.finalPath))).length;
  const seo=rows.filter(j=>Boolean(text(j.title)&&text(j.description)&&Array.isArray(j.tags)&&j.tags.length)).length;
  const schedule=rows.filter(j=>Boolean(text(j.publishAt))).length;
  const readyToYoutube=rows.filter(j=>Boolean(text(j.finalPath)&&text(j.title)&&text(j.description)&&Array.isArray(j.tags)&&j.tags.length&&text(j.publishAt)&&j.status!=='ERROR')).length;
  const errors=rows.filter(j=>j.status==='ERROR').length;
  const dimensions=[covers,music,videos,seo,schedule].map(n=>Math.min(1,n/safeTarget));
  const progress=Math.round((dimensions.reduce((a,b)=>a+b,0)/dimensions.length)*100);
  return{channelId,target:safeTarget,covers,music,videos,seo,schedule,readyToYoutube,errors,progress};
}

export type ChannelProductionReadiness={
  channelId:string;targetProjects:number;createdProjects:number;renderedVideos:number;readyToPublish:number;percent:number;
  covers:number;music:number;seo:number;schedule:number;errors:number;
};
export function getChannelProductionReadiness(channel:Channel,jobs:VideoJob[],target:number):ChannelProductionReadiness{
  const base=productionReadiness(channel,jobs,target),rows=rowsFor(jobs,String(channel?.id||''));
  const percent=Math.max(0,Math.min(100,Math.round((base.readyToYoutube/base.target)*100)));
  return{channelId:String(channel?.id||''),targetProjects:base.target,createdProjects:rows.length,renderedVideos:base.videos,readyToPublish:base.readyToYoutube,percent,covers:base.covers,music:base.music,seo:base.seo,schedule:base.schedule,errors:base.errors};
}

export function buildAttentionItems(
  channels:Channel[],
  runway:Record<string,ChannelRunwayRecord>,
  jobs:VideoJob[],
  batchSize:number
){
  const items:AttentionItem[]=[];
  for(const channel of (Array.isArray(channels)?channels:[]).filter(c=>c?.enabled)){
    const channelId=String(channel?.id||'');
    const channelName=String(channel?.name||channelId||'Канал без названия');
    const r=runway?.[channelId];
    const p=productionReadiness(channel,jobs,batchSize);
    if(!r||r.runwayDays===undefined){
      items.push({channelId,channelName,severity:'warning',title:'Нет подтверждённого расписания',detail:'Нужна ручная синхронизация расписания внутри YouTube.'});
    }else if(r.runwayDays<=14){
      items.push({channelId,channelName,severity:'critical',title:`Запас ${r.runwayDays} дн.`,detail:'Новая пачка нужна в приоритетном порядке.'});
    }else if(r.runwayDays<=30){
      items.push({channelId,channelName,severity:'warning',title:`Запас ${r.runwayDays} дн.`,detail:'Пора готовить следующую пачку.'});
    }else if(r.runwayDays<=45){
      items.push({channelId,channelName,severity:'info',title:`Запас ${r.runwayDays} дн.`,detail:'Канал уже нужно поставить в производственный план.'});
    }
    if(p.videos>p.seo){
      items.push({channelId,channelName,severity:'warning',title:`SEO не готово: ${p.videos-p.seo}`,detail:'Есть готовые видео без полного title / description / tags.'});
    }
    if(p.readyToYoutube>0){
      items.push({channelId,channelName,severity:'info',title:`Готово к YouTube: ${p.readyToYoutube}`,detail:'Файлы, SEO и локальное расписание уже заполнены.'});
    }
  }
  const rank:Record<AttentionSeverity,number>={critical:0,warning:1,info:2};
  return items.sort((a,b)=>rank[a.severity]-rank[b.severity]||String(a.channelName||'').localeCompare(String(b.channelName||''),'ru'));
}

export function productionForecast(
  channels:Channel[],
  runway:Record<string,ChannelRunwayRecord>,
  jobs:VideoJob[],
  batchSize:number,
  now=new Date()
){
  const active=(Array.isArray(channels)?channels:[]).filter(c=>c?.enabled);
  const today=krasnoyarskClock(now).dateKey;
  let dueNow=0,next7Days=0,critical=0,readyToYoutube=0,missingSeo=0;
  for(const channel of active){
    const r=runway?.[String(channel?.id||'')];
    if(r?.runwayDays!==undefined){
      if(r.runwayDays<=45)dueNow++;
      if(r.runwayDays<=14)critical++;
      if(r.nextProductionDate){
        const days=calendarDaysBetween(today,r.nextProductionDate);
        if(days!==undefined&&days>=0&&days<=7)next7Days++;
      }
    }
    const p=productionReadiness(channel,jobs,batchSize);
    readyToYoutube+=p.readyToYoutube;
    missingSeo+=Math.max(0,p.videos-p.seo);
  }
  return{channels:active.length,dueNow,next7Days,critical,readyToYoutube,missingSeo};
}

export function recommendedWeeklyLoad(tempoDays:number|undefined){
  if(!tempoDays||!Number.isFinite(tempoDays)||tempoDays<=0)return undefined;
  return Math.round((7/tempoDays)*10)/10;
}
