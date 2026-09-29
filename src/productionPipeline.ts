import type {UploadHistoryRecord,VideoJob} from './types';

export type ProductionPipelineStage='SOURCE'|'READY'|'RENDERING'|'RENDERED'|'METADATA'|'READY_UPLOAD'|'UPLOADING'|'PROCESSING'|'SCHEDULED'|'PUBLISHED'|'ERROR';
export type ProductionPipelineSnapshot={
 total:number;counts:Record<ProductionPipelineStage,number>;publishedToday:number;bottleneck:{tone:'ok'|'warn'|'danger';title:string;detail:string;stage?:ProductionPipelineStage}
};

export const PRODUCTION_PIPELINE_ORDER:ProductionPipelineStage[]=['SOURCE','READY','RENDERING','RENDERED','METADATA','READY_UPLOAD','UPLOADING','PROCESSING','SCHEDULED','PUBLISHED'];

function metadataReady(job:VideoJob){return Boolean(job.title?.trim()&&job.description?.trim()&&job.tags?.length)}
function isFuture(iso:string|undefined,now:Date){if(!iso)return false;const t=Date.parse(iso);return Number.isFinite(t)&&t>now.getTime()}
function isPastOrNow(iso:string|undefined,now:Date){if(!iso)return false;const t=Date.parse(iso);return Number.isFinite(t)&&t<=now.getTime()}
function sameLocalDay(iso:string|undefined,now:Date){if(!iso)return false;const d=new Date(iso);return !Number.isNaN(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()}

export function productionPipelineStage(job:VideoJob,now=new Date()):ProductionPipelineStage{
 if(job.status==='ERROR')return'ERROR';
 if(job.youtubeVideoId){
  if(job.processingState&&job.processingState!=='READY')return'PROCESSING';
  if(job.remotePrivacyStatus==='public'||isPastOrNow(job.publishAt,now))return'PUBLISHED';
  if(job.status==='SCHEDULED'||isFuture(job.publishAt,now))return'SCHEDULED';
  return'PROCESSING';
 }
 if(job.status==='UPLOADING')return'UPLOADING';
 if(job.status==='RENDERING')return'RENDERING';
 if(job.finalPath){
  if(metadataReady(job)&&isFuture(job.publishAt,now))return'READY_UPLOAD';
  if(metadataReady(job))return'METADATA';
  return'RENDERED';
 }
 if(job.status==='READY_RENDER')return'READY';
 return'SOURCE'
}

export function buildProductionPipeline(jobs:VideoJob[],history:UploadHistoryRecord[]=[],now=new Date()):ProductionPipelineSnapshot{
 const counts={} as Record<ProductionPipelineStage,number>;
 for(const stage of [...PRODUCTION_PIPELINE_ORDER,'ERROR' as const])counts[stage]=0;
 for(const job of jobs)counts[productionPipelineStage(job,now)]++;
 const todaySeen=new Set<string>();
 for(const row of history){
  if(row.status!=='UPLOADED'||!row.youtubeVideoId||!sameLocalDay(row.uploadedAt,now))continue;
  todaySeen.add(row.youtubeVideoId)
 }
 const activeAfterSource=PRODUCTION_PIPELINE_ORDER.slice(1).reduce((n,s)=>n+counts[s],0);
 let bottleneck:ProductionPipelineSnapshot['bottleneck'];
 if(counts.ERROR>0)bottleneck={tone:'danger',title:'Есть ошибки в Production',detail:'Исправьте '+counts.ERROR+' задач, прежде чем наращивать очередь.',stage:'ERROR'};
 else if(counts.SOURCE>0&&activeAfterSource===0)bottleneck={tone:'warn',title:'Рендер не выполняется',detail:'Есть '+counts.SOURCE+' исходных задач, но ни одна не дошла до READY / ENDLUME.',stage:'SOURCE'};
 else if(counts.READY>0&&counts.RENDERING===0)bottleneck={tone:'warn',title:'ENDLUME ждёт запуск',detail:'Готово к рендеру: '+counts.READY+'. Активных рендеров нет.',stage:'READY'};
 else if(counts.READY_UPLOAD>=5&&counts.UPLOADING===0)bottleneck={tone:'warn',title:'Publisher остановлен',detail:'К загрузке готово '+counts.READY_UPLOAD+' видео, активных загрузок нет.',stage:'READY_UPLOAD'};
 else if((counts.RENDERED+counts.METADATA+counts.READY_UPLOAD)>=20&&counts.SCHEDULED<10&&counts.UPLOADING===0)bottleneck={tone:'warn',title:'Требуется загрузка',detail:'Локальный готовый контент заметно опережает YouTube schedule.',stage:'READY_UPLOAD'};
 else if(counts.RENDERING>0)bottleneck={tone:'ok',title:'Pipeline работает',detail:'Сейчас рендерится '+counts.RENDERING+' задач.',stage:'RENDERING'};
 else bottleneck={tone:'ok',title:'Критического bottleneck нет',detail:'Следите за READY TO UPLOAD и запасом YouTube schedule.'};
 return{total:jobs.length,counts,publishedToday:todaySeen.size,bottleneck}
}
