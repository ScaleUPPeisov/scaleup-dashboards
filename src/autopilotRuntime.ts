import {api} from './api';
import {productionManagerApi} from './productionManagerApi';
import {resolveProductionRoot} from './productionPrefs';
import {createMissingJobs,imageAllocation,musicAllocation} from './autopilotCore';
import {useApp} from './store';
import type {AutopilotSummary,Channel,Settings,VideoJob} from './types';
import {humanizeError} from './errorCenter';
import {inventorySnapshot} from './renderInventoryRuntime';
import {recordPerfMetric} from './performanceRuntime';

let running=false;
let lastEndlumeLaunch=0;
const RENDER_REQUEUE_MS=10*60*1000;
const ENDLUME_LAUNCH_COOLDOWN_MS=5*60*1000;
const CHANNEL_CONCURRENCY=3;

type Patch={id:string;patch:Partial<VideoJob>};
type ChannelAutomationSnapshot={
  channel:Channel;
  settings:Settings;
  workspace:string;
  projectRoot:string;
  jobs:VideoJob[];
  jobById:Map<string,VideoJob>;
  inbox:{music:string[];images:string[]};
};

function blankSummary():AutopilotSummary{return {prepared:0,tracksMoved:0,imagesMoved:0,metadataGenerated:0,renderQueued:0,uploads:0,errors:0,notes:[]}}
function logError(summary:AutopilotSummary,label:string,e:unknown){
  summary.errors++;
  const h=humanizeError(e,label.toLocaleLowerCase('ru-RU').includes('endlume')?'endlume':'storage');
  const msg=`${label}: ${h.message}`;
  summary.notes.push(msg);
  useApp.getState().log(msg,'error');
}
function activeJobs(snapshot:ChannelAutomationSnapshot){
  return snapshot.jobs.filter(j=>j.status!=='SCHEDULED'&&j.status!=='ERROR').sort((a,b)=>a.number-b.number);
}
function applyLocal(snapshot:ChannelAutomationSnapshot,id:string,patch:Partial<VideoJob>,patches:Patch[]){
  const before=snapshot.jobById.get(id);if(!before)return;
  const after={...before,...patch} as VideoJob;
  snapshot.jobById.set(id,after);
  const i=snapshot.jobs.findIndex(j=>j.id===id);
  if(i>=0)snapshot.jobs[i]=after;
  const existing=patches.find(x=>x.id===id);
  if(existing)existing.patch={...existing.patch,...patch};
  else patches.push({id,patch});
}
function channelSnapshot(channel:Channel,settings:Settings):ChannelAutomationSnapshot{
  const all=useApp.getState().jobs;
  const jobs=all.filter(j=>j.channelId===channel.id).sort((a,b)=>a.number-b.number);
  return {channel,settings,workspace:settings.workspace,projectRoot:resolveProductionRoot(channel.id,settings.workspace),jobs,jobById:new Map(jobs.map(j=>[j.id,j] as const)),inbox:{music:[],images:[]}};
}
async function ensureFolder(snapshot:ChannelAutomationSnapshot,job:VideoJob,patches:Patch[]){
  if(job.folder)return job.folder;
  const storage=await productionManagerApi.storageStatus(snapshot.projectRoot);
  if(!storage.exists||!storage.writable)throw new Error(storage.error||`Папка проектов недоступна: ${snapshot.projectRoot}`);
  const prepared=await api.prepareJob(snapshot.projectRoot,snapshot.channel.id,snapshot.channel.name,job.number,snapshot.channel.minTracks);
  const patch:Partial<VideoJob>={folder:prepared.folder,status:prepared.status as VideoJob['status'],tracksCount:prepared.tracksCount,coverPath:prepared.coverPath,finalPath:prepared.finalPath,lastAutomationAt:new Date().toISOString()};
  applyLocal(snapshot,job.id,patch,patches);
  return prepared.folder;
}
async function maybeGenerateAi(snapshot:ChannelAutomationSnapshot,job:VideoJob,patches:Patch[]){
  const s=snapshot.settings;
  if(!s.autoGenerateMetadata||job.metadataLocked||job.metadataSource==='ai'||job.metadataSource==='import')return false;
  const meta=await api.aiGenerateMetadata(s.openaiApiKey,s.openaiModel,snapshot.channel.name,snapshot.channel.genre,snapshot.channel.language,snapshot.channel.country,job.number,job.topic,snapshot.channel.seo.aiPrompt);
  const patch:Partial<VideoJob>={title:meta.title,description:meta.description,tags:meta.tags,metadataSource:'ai',lastAutomationAt:new Date().toISOString()};
  applyLocal(snapshot,job.id,patch,patches);
  if(job.folder)await api.writeJobMetadata(job.folder,meta.title,meta.description,meta.tags,job.publishAt,'ai');
  return true;
}

async function processChannel(channel:Channel,summary:AutopilotSummary,aiBudget:{left:number}){
  let settings=useApp.getState().settings;
  if(!settings.workspace)return;

  if(settings.autoCreatePlan){
    const all=useApp.getState().jobs;
    const created=createMissingJobs(channel,all);
    if(created.length){
      useApp.getState().addJobs(created);
      summary.prepared+=created.length;
      summary.notes.push(`${channel.name}: создан план +${created.length}`);
    }
  }

  settings=useApp.getState().settings;
  const snapshot=channelSnapshot(channel,settings);
  const patches:Patch[]=[];
  await api.ensureChannelInbox(snapshot.workspace,channel.name);

  for(const job of [...snapshot.jobs]){
    if(job.status==='SCHEDULED'||job.status==='ERROR')continue;
    try{
      const folder=await ensureFolder(snapshot,job,patches);
      if(folder&&!job.folder)summary.prepared++;
    }catch(e){
      applyLocal(snapshot,job.id,{status:'ERROR',error:String(e)},patches);
      logError(summary,`${channel.name} Video_${job.number}: папка`,e);
    }
  }

  const inboxStarted=performance.now();
  snapshot.inbox=await api.scanChannelInbox(snapshot.workspace,channel.name);
  recordPerfMetric('filesystemScan',performance.now()-inboxStarted);

  if(settings.autoAssignMusic&&snapshot.inbox.music.length){
    const alloc=musicAllocation(activeJobs(snapshot),snapshot.inbox.music,channel.minTracks);
    for(const a of alloc){
      const job=snapshot.jobById.get(a.jobId);
      if(!job?.folder)continue;
      try{
        const r=await api.ingestTracks(job.folder,a.files,channel.minTracks);
        applyLocal(snapshot,job.id,{tracksCount:r.tracksCount,status:r.status as VideoJob['status'],lastAutomationAt:new Date().toISOString()},patches);
        summary.tracksMoved+=a.files.length;
      }catch(e){logError(summary,`${channel.name} Video_${job.number}: музыка`,e)}
    }
  }

  if(settings.autoAssignImages&&snapshot.inbox.images.length){
    const alloc=imageAllocation(activeJobs(snapshot),snapshot.inbox.images);
    for(const a of alloc){
      const job=snapshot.jobById.get(a.jobId);
      if(!job?.folder)continue;
      try{
        const r=await api.ingestCover(job.folder,a.file,channel.minTracks);
        applyLocal(snapshot,job.id,{...r,lastAutomationAt:new Date().toISOString()},patches);
        summary.imagesMoved++;
      }catch(e){logError(summary,`${channel.name} Video_${job.number}: изображение`,e)}
    }
  }

  for(const job of activeJobs(snapshot)){
    try{
      if(job.folder){
        const refreshStarted=performance.now();
        const refreshed=await api.refreshJob(job.folder,channel.minTracks);
        recordPerfMetric('filesystemScan',performance.now()-refreshStarted);
        applyLocal(snapshot,job.id,{...refreshed,lastAutomationAt:new Date().toISOString()},patches);
      }
      let current=snapshot.jobById.get(job.id)!;
      if(aiBudget.left>0&&current.folder&&await maybeGenerateAi(snapshot,current,patches)){
        summary.metadataGenerated++;aiBudget.left--;current=snapshot.jobById.get(job.id)!;
      }
      if(current.folder&&current.title)await api.writeJobMetadata(current.folder,current.title,current.description,current.tags,current.publishAt,current.metadataSource||'template');
    }catch(e){logError(summary,`${channel.name} Video_${job.number}: обновление`,e)}
  }

  if(settings.autoQueueRender){
    for(const job of snapshot.jobs.filter(j=>j.status==='READY_RENDER'&&j.folder)){
      const last=job.renderQueuedAt?new Date(job.renderQueuedAt).getTime():0;
      if(last&&Date.now()-last<RENDER_REQUEUE_MS)continue;
      try{
        await api.enqueueRender(snapshot.workspace,job.folder!);
        applyLocal(snapshot,job.id,{renderQueuedAt:new Date().toISOString(),lastAutomationAt:new Date().toISOString()},patches);
        summary.renderQueued++;
      }catch(e){logError(summary,`${channel.name} Video_${job.number}: очередь ENDLUME`,e)}
    }
  }

  if(patches.length)useApp.getState().patchJobsBatch(patches);

  if(settings.autoQueueRender&&settings.autoOpenEndlume&&summary.renderQueued>0&&settings.endlumePath&&Date.now()-lastEndlumeLaunch>ENDLUME_LAUNCH_COOLDOWN_MS){
    try{await api.openEndlume(settings.endlumePath);lastEndlumeLaunch=Date.now()}catch(e){logError(summary,'ENDLUME запуск',e)}
  }
}

async function runPool<T>(items:T[],limit:number,worker:(item:T)=>Promise<void>){
  let cursor=0;
  const count=Math.max(1,Math.min(limit,items.length||1));
  await Promise.all(Array.from({length:count},async()=>{
    while(true){
      const index=cursor++;
      if(index>=items.length)return;
      await worker(items[index]);
    }
  }));
}

export async function runAutopilotCycle(manual=false):Promise<AutopilotSummary>{
  if(running)return {...blankSummary(),notes:['Цикл уже выполняется']};
  running=true;
  const summary=blankSummary();
  try{
    let settings=useApp.getState().settings;
    if(!settings.workspace){
      try{
        const workspace=await api.defaultWorkspace();
        useApp.getState().patchSettings({workspace});
        settings=useApp.getState().settings;
      }catch(e){logError(summary,'Workspace',e);return summary}
    }
    if(!manual&&!settings.autopilotEnabled)return {...summary,notes:['Автопилот выключен']};

    const channels=useApp.getState().channels.filter(c=>c.enabled);
    const aiBudget={left:3};
    await runPool(channels,CHANNEL_CONCURRENCY,async channel=>{
      try{
        const inv=inventorySnapshot(channel.id);
        if(inv?.folderState==='OFFLINE')summary.notes.push(`${channel.name}: Render OFFLINE • last known ready ${inv.readyVideos}`);
        await processChannel(channel,summary,aiBudget);
      }catch(e){logError(summary,`${channel.name}: цикл`,e)}
    });

    const moved=summary.tracksMoved+summary.imagesMoved+summary.renderQueued+summary.metadataGenerated+summary.prepared+summary.uploads;
    if(moved||summary.errors)useApp.getState().log(`Autopilot: папки ${summary.prepared}, треки ${summary.tracksMoved}, изображения ${summary.imagesMoved}, AI ${summary.metadataGenerated}, рендер ${summary.renderQueued}, YouTube ${summary.uploads}, ошибок ${summary.errors}`,summary.errors?'warn':'info');
    return summary;
  }finally{running=false}
}
