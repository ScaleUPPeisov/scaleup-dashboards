import type { YoutubeExistingVideo } from './types';
import type { ImportedMetadata } from './metadata';

export function orderedExistingVideos(videos:YoutubeExistingVideo[],order:'oldest'|'newest'){
  const copy=[...videos]; return order==='oldest'?copy.reverse():copy;
}

export function buildExistingSchedule(videos:YoutubeExistingVideo[],startIso:string,cadenceDays:number){
  const start=new Date(startIso); const step=Math.max(1,cadenceDays)*86400000;
  return videos.map((v,i)=>({...v,publishAt:new Date(start.getTime()+i*step).toISOString()}));
}

function isoForCalendarTime(date:string,time:string,offsetMinutes?:number){
  const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number);
  if([y,m,d,hh,mm].some(x=>!Number.isFinite(x)))return undefined;
  if(Number.isFinite(offsetMinutes))return new Date(Date.UTC(y,m-1,d,hh,mm)-Number(offsetMinutes)*60000).toISOString();
  const local=new Date(`${date}T${time}:00`);
  return Number.isNaN(local.getTime())?undefined:local.toISOString();
}

export function buildExistingScheduleFromLocal(videos:YoutubeExistingVideo[],startLocal:string,cadenceDays:number,meta:ImportedMetadata[]=[]){
  const date=startLocal.slice(0,10),fallbackTime=(startLocal.match(/T(\d{2}:\d{2})/)?.[1]||'18:00');
  const base=new Date(`${date}T00:00:00Z`);if(Number.isNaN(base.getTime()))return videos;
  const step=Math.max(1,cadenceDays);
  return videos.map((v,i)=>{
    const d=new Date(base);d.setUTCDate(d.getUTCDate()+i*step);const day=d.toISOString().slice(0,10);
    const m=meta.find(x=>x.number===i+1)||meta[i];
    const time=m?.publishTime||fallbackTime;
    const publishAt=isoForCalendarTime(day,time,m?.publishUtcOffsetMinutes);
    return publishAt?{...v,publishAt}:v
  });
}

export function overlayExistingMetadata(videos:YoutubeExistingVideo[],meta:ImportedMetadata[]){
  return videos.map((v,i)=>{const m=meta.find(x=>x.number===i+1)||meta[i];if(!m)return v;return {...v,title:m.title||v.title,description:m.description||v.description,tags:m.tags?.length?m.tags:v.tags,publishAt:m.publishAt||v.publishAt};});
}
