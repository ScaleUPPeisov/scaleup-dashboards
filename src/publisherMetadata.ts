import type {ImportedMetadata} from './metadata';
import type {VideoJob} from './types';

const DATE_ONLY=/^\d{4}-\d{2}-\d{2}$/;
function dateKey(raw?:string){if(!raw)return'';const m=String(raw).match(/^(\d{4}-\d{2}-\d{2})/);return m?.[1]||''}
function timeParts(raw?:string){const m=String(raw||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?[+m[1],+m[2]] as const:undefined}
function fixedOffsetIso(day:string,time:string,offsetMinutes:number){
 const tm=timeParts(time);if(!DATE_ONLY.test(day)||!tm)return undefined;const[y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,tm[0],tm[1])-offsetMinutes*60000).toISOString()
}
function ianaLocalIso(day:string,time:string,timeZone:string){
 const tm=timeParts(time);if(!DATE_ONLY.test(day)||!tm)return undefined;const[y,m,d]=day.split('-').map(Number),target=Date.UTC(y,m-1,d,tm[0],tm[1]);let guess=target;
 try{
  for(let n=0;n<3;n++){
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
   const get=(t:string)=>Number(parts.find(x=>x.type===t)?.value||0),represented=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));guess+=target-represented
  }
  const verify=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
  const get=(t:string)=>String(verify.find(x=>x.type===t)?.value||'');const local=`${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  return local===`${day} ${time}`?new Date(guess).toISOString():undefined
 }catch{return undefined}
}
function normalizedRowInstant(row:ImportedMetadata,defaultOffsetMinutes=420){
 const raw=row.publishAt,day=dateKey(raw),time=row.publishTime;
 if(raw&&time&&day){
  if(row.publishTimezone?.includes('/'))return ianaLocalIso(day,time,row.publishTimezone);
  const off=Number.isFinite(row.publishUtcOffsetMinutes)?Number(row.publishUtcOffsetMinutes):defaultOffsetMinutes;return fixedOffsetIso(day,time,off)
 }
 if(raw){if(DATE_ONLY.test(raw))return undefined;const d=new Date(raw);return Number.isFinite(d.getTime())?d.toISOString():undefined}
 return undefined
}
export function metadataRowForJob(rows:ImportedMetadata[],job:VideoJob,index:number){const exact=rows.find(x=>x.number===job.number);if(exact)return exact;const relative=rows.find(x=>x.number===index+1);return relative||rows[index]}
export function metadataPublishAt(row:ImportedMetadata|undefined,fallback?:string,defaultOffsetMinutes=420){
 if(!row)return fallback&&Number.isFinite(Date.parse(fallback))?new Date(fallback).toISOString():undefined;
 const direct=normalizedRowInstant(row,defaultOffsetMinutes);if(direct)return direct;
 if(row.publishTime&&fallback){const tz=row.publishTimezone?.includes('/')?row.publishTimezone:'Asia/Krasnoyarsk',day=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(fallback));return row.publishTimezone?.includes('/')?ianaLocalIso(day,row.publishTime,row.publishTimezone):fixedOffsetIso(day,row.publishTime,Number.isFinite(row.publishUtcOffsetMinutes)?Number(row.publishUtcOffsetMinutes):defaultOffsetMinutes)}
 return undefined
}
export function resolvedUploadMetadata(job:VideoJob,row:ImportedMetadata|undefined,publishAt?:string,defaultCategory='10'){return{title:(row?.title||job.title).trim(),description:row?.description??job.description,tags:row?.tags?.length?row.tags:job.tags,publishAt:publishAt||metadataPublishAt(row,job.publishAt),categoryId:defaultCategory||'10'}}
