import type {VideoJob} from './types';

export type PublisherPreflightIssueCode='MISSING_SCHEDULE'|'PAST_SCHEDULE'|'SKIPPED_PAST_DATE'|'MISSING_TITLE'|'DUPLICATE'|'RECOVERY'|'MISSING_THUMBNAIL';
export type PublisherPreflightIssue={code:PublisherPreflightIssueCode;message:string};
export type PublisherPreflightItem={id:string;number:number;valid:boolean;issues:PublisherPreflightIssue[]};
export type PublisherPreflightOptions={
 getPublishAt:(job:VideoJob)=>string|undefined;
 getPastRepairStatus?:(job:VideoJob)=>'UNCHANGED'|'RESCHEDULED'|'SKIPPED_PAST_DATE';
 safeMode:boolean;
 duplicateIds?:Iterable<string>;
 recoveryIds?:Iterable<string>;
 requireThumbnail?:boolean;
 hasThumbnail?:(job:VideoJob)=>boolean;
 nowMs?:number;
};

export function canonicalSelectedJobs(channelJobs:VideoJob[],selectedIds:string[]){
 const selected=new Set(selectedIds);return channelJobs.filter(j=>selected.has(j.id)).sort((a,b)=>a.number-b.number)
}
export function publisherUploadButtonLabel(selectedCount:number,readyCount=selectedCount){
 if(selectedCount<=0)return 'ВЫБЕРИТЕ ВИДЕО';
 if(readyCount<=0)return 'НЕТ ВИДЕО, ГОТОВЫХ К ЗАГРУЗКЕ';
 return `ЗАГРУЗИТЬ ${readyCount} ВИДЕО НА YOUTUBE`
}
export function publisherPreflightItems(jobs:VideoJob[],opts:PublisherPreflightOptions){
 const duplicates=new Set(opts.duplicateIds||[]),recovery=new Set(opts.recoveryIds||[]),now=opts.nowMs??Date.now();
 const items:PublisherPreflightItem[]=jobs.map(job=>{
  const issues:PublisherPreflightIssue[]=[],publishAt=opts.getPublishAt(job),ms=publishAt?Date.parse(publishAt):NaN;
  if(!publishAt||!Number.isFinite(ms))issues.push({code:'MISSING_SCHEDULE',message:'Не удалось получить корректный publishAt'});
  else if(ms<=now){const repair=opts.getPastRepairStatus?.(job);if(repair==='SKIPPED_PAST_DATE')issues.push({code:'SKIPPED_PAST_DATE',message:`Прошедшая дата пропущена без ERROR: ${publishAt}`});else issues.push({code:'PAST_SCHEDULE',message:`Дата публикации уже прошла: ${publishAt}`});}
  if(opts.safeMode&&!job.title.trim())issues.push({code:'MISSING_TITLE',message:'Название видео пустое'});
  if(duplicates.has(job.id))issues.push({code:'DUPLICATE',message:'Файл уже успешно загружался на этот канал'});
  if(recovery.has(job.id))issues.push({code:'RECOVERY',message:'Для видео уже существует resumable upload session'});
  if(opts.requireThumbnail&&!(opts.hasThumbnail?.(job)??false))issues.push({code:'MISSING_THUMBNAIL',message:'Для видео не сопоставлена новая обложка'});
  return{id:job.id,number:job.number,valid:issues.length===0,issues}
 });
 return{items,ready:items.filter(x=>x.valid),blocked:items.filter(x=>!x.valid),readyIds:items.filter(x=>x.valid).map(x=>x.id)}
}


export function publisherGlobalBlockReasons(x:{selectedCount:number;hasProfile:boolean;readyCount:number;quotaAffordable:boolean;scheduleSyncBlocked:boolean;locked:boolean;dailyRemaining?:number}){
 const reasons:string[]=[];
 if(x.selectedCount<=0)reasons.push('Выберите хотя бы одно видео');
 if(!x.hasProfile)reasons.push('Подключите YouTube для этого канала');
 if(x.readyCount<=0)reasons.push('Нет видео, готовых к загрузке');
 if(!x.quotaAffordable)reasons.push('Недостаточно YouTube API quota для этой партии');
 if(x.scheduleSyncBlocked)reasons.push('Сначала синхронизируйте расписание с YouTube');
 if(x.locked)reasons.push('Канал занят текущей загрузкой');
 if(x.dailyRemaining!=null&&x.dailyRemaining<=0)reasons.push('Достигнут безопасный лимит загрузок канала за 24 часа');
 return reasons
}
