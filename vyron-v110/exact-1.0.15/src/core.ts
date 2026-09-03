import type { Channel, Priority, VideoJob } from './types';

export function slugify(value:string){return value.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'channel'}
export function requiredVideos(channel:Channel){return Math.ceil(channel.targetBufferDays/Math.max(1,channel.cadenceDays));}
export function futureScheduledJobs(channel:Channel,jobs:VideoJob[],now=new Date()){
  return jobs.filter(j=>j.channelId===channel.id&&j.status==='SCHEDULED'&&j.publishAt&&new Date(j.publishAt)>=now).length;
}
export function bufferDays(channel:Channel,jobs:VideoJob[],now=new Date()){
  const scheduled=jobs.filter(j=>j.channelId===channel.id&&j.status==='SCHEDULED'&&j.publishAt).map(j=>new Date(j.publishAt!)).filter(d=>d>=now).sort((a,b)=>a.getTime()-b.getTime());
  if(!scheduled.length)return 0;
  const last=scheduled[scheduled.length-1];
  return Math.max(0,Math.ceil((last.getTime()-now.getTime())/86400000));
}
export function deficit(channel:Channel,jobs:VideoJob[],now=new Date()){
  const existing=jobs.filter(j=>j.channelId===channel.id&&j.status!=='ERROR'&&(j.status!=='SCHEDULED'||!j.publishAt||new Date(j.publishAt)>=now)).length;
  return Math.max(0,requiredVideos(channel)-existing);
}
export function priorityFor(days:number):Priority{return days<14?'red':days<30?'orange':days<45?'yellow':'green'}
export function nextPublishSlots(channel:Channel,jobs:VideoJob[],count:number,now=new Date()){
  const used=new Set(jobs.filter(j=>j.channelId===channel.id&&j.publishAt).map(j=>new Date(j.publishAt!).toISOString().slice(0,10)));
  const result:string[]=[];
  let cursor=new Date(now);
  cursor.setHours(channel.publishHour,channel.publishMinute,0,0);
  if(cursor<=now)cursor.setDate(cursor.getDate()+1);
  while(result.length<count){
    if(!used.has(cursor.toISOString().slice(0,10)))result.push(cursor.toISOString());
    cursor=new Date(cursor.getTime()+channel.cadenceDays*86400000);
  }
  return result;
}
export function generateMetadata(channel:Channel,number:number,topic?:string){
  const cleanTopic=(topic||channel.genre||'Music').trim();
  const pattern=channel.seo.titlePatterns[number%Math.max(1,channel.seo.titlePatterns.length)]||'{topic} • Session {number}';
  const title=pattern.replaceAll('{topic}',cleanTopic).replaceAll('{genre}',channel.genre).replaceAll('{number}',String(number).padStart(3,'0')).slice(0,100);
  const description=(channel.seo.descriptionTemplate||'{title}\n\n{genre} • {country}').replaceAll('{title}',title).replaceAll('{topic}',cleanTopic).replaceAll('{genre}',channel.genre).replaceAll('{country}',channel.country).slice(0,4800);
  const tags=[...new Set([cleanTopic,channel.genre,channel.country,...channel.seo.tags].map(x=>x.trim()).filter(Boolean).filter(t=>!channel.seo.banned.some(b=>t.toLowerCase().includes(b.toLowerCase()))))].slice(0,30);
  return {title,description,tags};
}
export function formatNumber(n?:number){if(n===undefined)return '—';return new Intl.NumberFormat('ru-RU',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n)}
