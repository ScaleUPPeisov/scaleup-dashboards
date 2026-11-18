// VYRON -> Cloud production snapshot. Explicit safe allowlist: never export local paths,
// OAuth, filesystem metadata, raw project content or machine credentials.
import {createHash} from 'node:crypto';

const CHANNEL=/^UC[A-Za-z0-9_-]{22}$/;
const STATUS=new Set(['NEED_IMAGE','WAITING_MUSIC','READY_RENDER','RENDERING',
  'READY_UPLOAD','UPLOADING','SCHEDULED','ERROR']);
const date=value=>{
  if(typeof value!=='string')return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms) && ms>Date.UTC(2010,0,1) &&
    ms<Date.now()+366*86400000 ? new Date(ms).toISOString():null;
};
const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const percent=value=>Number.isFinite(value)&&value>=0&&value<=100?Math.round(value):null;
const stableId=(prefix,id)=>prefix+'_'+createHash('sha256').update(String(id)).digest('hex').slice(0,32);

export function mirrorProduction(state,now=new Date()){
  const registry=new Map((state?.channels||[]).filter(c=>
    typeof c?.id==='string'&&CHANNEL.test(c?.youtubeChannelId||''))
    .map(c=>[c.id,c.youtubeChannelId]));
  const rows=[],seen=new Set();
  for(const job of Array.isArray(state?.jobs)?state.jobs:[]){
    if(!STATUS.has(job?.status)||typeof job.id!=='string')continue;
    const channelId=registry.get(job.channelId);
    if(!channelId)continue; // Never guess channel identity from title.
    const id=stableId('job',job.id);
    if(seen.has(id))continue;
    seen.add(id);
    rows.push({
      id,channelId,status:job.status,
      title:text(job.title,120)||'Видео без названия',
      progress:job.status==='UPLOADING'?percent(job.uploadProgress):null, // Never label upload progress as ENDLUME render progress.
      plannedPublishAt:date(job.publishAt),
      createdAt:date(job.createdAt),
      // This is a local VYRON plan, NOT verified YouTube schedule.
      scheduleSource:'MAC_LOCAL_UNVERIFIED'
    });
    if(rows.length===300)break;
  }
  return {
    source:'VYRON_MAC',
    generatedAt:now.toISOString(),
    items:rows,
    // Zero rows is a valid snapshot; the Worker archives missing jobs instead of deleting history.
    truncated:Array.isArray(state?.jobs)&&state.jobs.length>300
  };
}
