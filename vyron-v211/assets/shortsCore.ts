import {addCalendarDays} from './channelSchedule';
import {publisherKrasnoyarskIso,todayKrasnoyarskDate} from './publisherSchedule';

export type ShortStatus='CREATING'|'READY'|'METADATA_READY'|'QUEUED'|'UPLOADING'|'PRIVATE'|'SCHEDULED'|'PUBLISHED'|'ERROR';
export type ShortMetadataStatus='EMPTY'|'READY'|'CONFLICT';
export type ShortUploadStatus='LOCAL'|'QUEUED'|'UPLOADING'|'PRIVATE'|'ERROR';
export type ShortPublishStatus='UNSCHEDULED'|'SCHEDULED'|'PUBLISHED';
export type ShortSelectionMode='uniform'|'random';
export type ShortRecord={
 id:string;batchId:string;sourceProjectId:string;sourceVideoId:string;sourcePath:string;sourceChannelId:string;
 start:number;end:number;duration:number;outputPath:string;createdAt:string;updatedAt:string;status:ShortStatus;
 metadataStatus:ShortMetadataStatus;uploadStatus:ShortUploadStatus;publishStatus:ShortPublishStatus;
 title:string;description:string;tags:string[];publishAt?:string;privacyStatus:'private'|'public'|'unlisted';
 youtubeVideoId?:string;uploadedAt?:string;error?:string;attempts:number;
};
export type ShortBatch={id:string;channelId:string;sourceProjectIds:string[];requestedPerVideo:number;createdAt:string;updatedAt:string;paused:boolean;status:'QUEUED'|'RUNNING'|'PAUSED'|'DONE'|'ERROR'};
export type ShortPreset={titleTemplates:string[];descriptionTemplate:string;tags:string[]};
export type ShortsState={version:1;records:ShortRecord[];batches:ShortBatch[];presets:Record<string,ShortPreset>;shortUploadEvents:{shortId:string;operationId:string;youtubeVideoId?:string;at:string}[]};
export type Segment={start:number;end:number;duration:number};
export type SegmentPlanOptions={count:number;sourceDuration:number;averageDuration:number;minDuration:number;maxDuration:number;mode:ShortSelectionMode;used?:Segment[];rng?:()=>number};
export type ShortScheduleOptions={startDate:string;times:string[];count:number;occupied?:string[]};

const KEY='vyron:shorts:v1';
const EVT='vyron-shorts-change';
export const emptyShortsState=():ShortsState=>({version:1,records:[],batches:[],presets:{},shortUploadEvents:[]});
const safeNum=(v:number,d:number)=>Number.isFinite(v)?v:d;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function normalizeShortsState(raw:any):ShortsState{const base=emptyShortsState();if(!raw||raw.version!==1)return base;return{version:1,records:Array.isArray(raw.records)?raw.records:[],batches:Array.isArray(raw.batches)?raw.batches:[],presets:raw.presets&&typeof raw.presets==='object'?raw.presets:{},shortUploadEvents:Array.isArray(raw.shortUploadEvents)?raw.shortUploadEvents:[]}}
export function readShortsState():ShortsState{try{return normalizeShortsState(JSON.parse(localStorage.getItem(KEY)||'null'))}catch{return emptyShortsState()}}
export function writeShortsState(state:ShortsState){try{localStorage.setItem(KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent(EVT))}catch{}}
export function subscribeShortsState(cb:()=>void){if(typeof window==='undefined')return()=>{};window.addEventListener(EVT,cb);window.addEventListener('storage',cb);return()=>{window.removeEventListener(EVT,cb);window.removeEventListener('storage',cb)}}
export function mutateShortsState(fn:(state:ShortsState)=>ShortsState){const next=fn(readShortsState());writeShortsState(next);return next}
export function patchShort(id:string,patch:Partial<ShortRecord>){return mutateShortsState(s=>({...s,records:s.records.map(r=>r.id===id?{...r,...patch,updatedAt:new Date().toISOString()}:r)}))}
export function patchShortBatch(id:string,patch:Partial<ShortBatch>){return mutateShortsState(s=>({...s,batches:s.batches.map(b=>b.id===id?{...b,...patch,updatedAt:new Date().toISOString()}:b)}))}
export function recoverInterruptedShorts(state:ShortsState){const now=new Date().toISOString();return{...state,records:state.records.map(r=>r.status==='CREATING'?{...r,status:'QUEUED' as const,error:undefined,updatedAt:now}:r),batches:state.batches.map(b=>b.status==='RUNNING'?{...b,status:b.paused?'PAUSED' as const:'QUEUED' as const,updatedAt:now}:b)}}
export function shortOutputPath(sourcePath:string,shortId:string){const clean=sourcePath.replace(/\\/g,'/');const slash=clean.lastIndexOf('/');const dir=slash>=0?clean.slice(0,slash):'';const file=slash>=0?clean.slice(slash+1):clean;const stem=file.replace(/\.[^.]+$/,'');const bits=dir.split('/');const parent=(bits[bits.length-1]||'').toLowerCase()==='long'?bits.slice(0,-1).join('/'):dir;return `${parent}/Shorts/${stem}/${shortId}.mp4`.replace(/^\/\//,'/')}
export function rangesOverlap(a:Segment,b:Segment,epsilon=0.05){return a.start<b.end-epsilon&&b.start<a.end-epsilon}
export function hasRangeConflict(candidate:Segment,used:Segment[]){return used.some(x=>rangesOverlap(candidate,x))}
function findFreeNear(target:number,duration:number,maxStart:number,used:Segment[]){const t=clamp(target,0,maxStart);for(let d=0;d<=Math.ceil(maxStart)+1;d++){for(const sign of d===0?[1]:[1,-1]){const start=clamp(Math.round((t+sign*d)*10)/10,0,maxStart);const c={start,end:start+duration,duration};if(!hasRangeConflict(c,used))return c}}return undefined}
export function planSegments(opts:SegmentPlanOptions):Segment[]{
 const count=Math.max(1,Math.floor(safeNum(opts.count,1))),sourceDuration=safeNum(opts.sourceDuration,0),avg=Math.max(1,safeNum(opts.averageDuration,30));
 const min=clamp(Math.min(safeNum(opts.minDuration,avg),safeNum(opts.maxDuration,avg)),1,sourceDuration),max=clamp(Math.max(safeNum(opts.minDuration,avg),safeNum(opts.maxDuration,avg)),min,sourceDuration),center=clamp(avg,min,max);
 if(sourceDuration<min+0.05)throw new Error('Исходное видео короче выбранной длительности Short');
 const rng=opts.rng||Math.random,used=[...(opts.used||[])],out:Segment[]=[];
 for(let i=0;i<count;i++){
  const duration=Math.round(clamp(center+(rng()-.5)*(max-min),min,max)*10)/10,maxStart=Math.max(0,sourceDuration-duration);
  let seg:Segment|undefined;
  if(opts.mode==='random'){
   for(let k=0;k<3000;k++){const start=Math.round((rng()*maxStart)*10)/10;const c={start,end:start+duration,duration};if(!hasRangeConflict(c,used)){seg=c;break}}
  }else{
   const target=count===1?maxStart/2:maxStart*((i+0.5)/count);seg=findFreeNear(target,duration,maxStart,used);
  }
  if(!seg)throw new Error(`Не удалось найти ${count} неповторяющихся фрагментов без пересечений`);
  out.push(seg);used.push(seg);
 }
 return out.sort((a,b)=>a.start-b.start)
}
export function recordUsedSegments(records:ShortRecord[],sourcePath:string){return records.filter(r=>r.sourcePath===sourcePath).map(r=>({start:r.start,end:r.end,duration:r.duration}))}
export function shortStatusFromRecord(r:ShortRecord):ShortStatus{if(r.error||r.status==='ERROR')return'ERROR';if(r.publishStatus==='PUBLISHED')return'PUBLISHED';if(r.publishStatus==='SCHEDULED')return'SCHEDULED';if(r.uploadStatus==='UPLOADING')return'UPLOADING';if(r.uploadStatus==='PRIVATE')return'PRIVATE';if(r.uploadStatus==='QUEUED'||r.status==='QUEUED')return'QUEUED';if(r.status==='CREATING')return'CREATING';if(r.metadataStatus==='READY')return'METADATA_READY';return'READY'}
export function titleConflict(records:ShortRecord[],channelId:string,title:string,excludeId?:string){const key=title.trim().toLocaleLowerCase('ru-RU');return Boolean(key)&&records.some(r=>r.id!==excludeId&&r.sourceChannelId===channelId&&r.title.trim().toLocaleLowerCase('ru-RU')===key&&(['READY','CONFLICT'].includes(r.metadataStatus)||Boolean(r.youtubeVideoId)))}
export function nextPresetTitle(records:ShortRecord[],channelId:string,templates:string[]){for(const t of templates.map(x=>x.trim()).filter(Boolean))if(!titleConflict(records,channelId,t))return t;return''}
export function shortsScheduleSlots(opts:ShortScheduleOptions){const times=[...new Set(opts.times.filter(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();if(!times.length)throw new Error('Добавьте хотя бы одно время публикации');const wanted=Math.max(0,Math.floor(opts.count));const occupied=new Set((opts.occupied||[]).filter(Boolean));let date=/^\d{4}-\d{2}-\d{2}$/.test(opts.startDate)?opts.startDate:todayKrasnoyarskDate(),guard=0;const out:string[]=[];while(out.length<wanted&&guard++<20000){for(const time of times){const iso=publisherKrasnoyarskIso(date,time);if(iso&&!occupied.has(iso)){out.push(iso);occupied.add(iso);if(out.length>=wanted)break}}date=addCalendarDays(date,1)}if(out.length!==wanted)throw new Error('Не удалось построить расписание Shorts');return out}
export function recordShortUploadAttempt(state:ShortsState,shortId:string,operationId:string,at=new Date().toISOString()){if(state.shortUploadEvents.some(x=>x.operationId===operationId))return state;return{...state,shortUploadEvents:[...state.shortUploadEvents,{shortId,operationId,at}]}}
export function recordShortUpload(state:ShortsState,shortId:string,youtubeVideoId:string,at=new Date().toISOString()){const i=state.shortUploadEvents.map(x=>x.shortId).lastIndexOf(shortId);if(i>=0){const rows=[...state.shortUploadEvents];rows[i]={...rows[i],youtubeVideoId};return{...state,shortUploadEvents:rows}}return{...state,shortUploadEvents:[...state.shortUploadEvents,{shortId,operationId:`short-upload:${shortId}:recovered`,youtubeVideoId,at}]}}
export function shortUploadsToday(state:ShortsState,now=new Date()){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);return state.shortUploadEvents.filter(x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.at))===today).length}
export function canStartShortUpload(r:ShortRecord){return !r.youtubeVideoId&&r.metadataStatus==='READY'&&!['QUEUED','CREATING','UPLOADING'].includes(r.status)&&r.uploadStatus!=='UPLOADING'}
