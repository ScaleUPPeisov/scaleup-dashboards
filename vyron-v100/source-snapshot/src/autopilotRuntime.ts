import { api } from './api';
import { createMissingJobs, imageAllocation, musicAllocation } from './autopilotCore';
import { useApp } from './store';
import type { AutopilotSummary, Channel, VideoJob } from './types';

let running=false;
let lastEndlumeLaunch=0;
const RENDER_REQUEUE_MS=10*60*1000;
const ENDLUME_LAUNCH_COOLDOWN_MS=5*60*1000;

function blankSummary():AutopilotSummary{return {prepared:0,tracksMoved:0,imagesMoved:0,metadataGenerated:0,renderQueued:0,uploads:0,errors:0,notes:[]}}
function logError(summary:AutopilotSummary,label:string,e:unknown){summary.errors++;const msg=`${label}: ${String(e)}`;summary.notes.push(msg);useApp.getState().log(msg,'error')}

async function ensureFolder(channel:Channel,job:VideoJob,workspace:string){
  if(job.folder)return job.folder;
  const prepared=await api.prepareJob(workspace,channel.id,channel.name,job.number,channel.minTracks);
  const folder=prepared.folder;
  useApp.getState().patchJob(job.id,{folder,status:prepared.status as VideoJob['status'],tracksCount:prepared.tracksCount,coverPath:prepared.coverPath,finalPath:prepared.finalPath,lastAutomationAt:new Date().toISOString()});
  return folder;
}

async function refresh(channel:Channel,jobId:string,folder:string){
  const r=await api.refreshJob(folder,channel.minTracks);
  useApp.getState().patchJob(jobId,{...r,lastAutomationAt:new Date().toISOString()});
  return {...useApp.getState().jobs.find(j=>j.id===jobId)!,...r} as VideoJob;
}

async function generateAi(channel:Channel,job:VideoJob){
  const s=useApp.getState().settings;
  if(!s.autoGenerateMetadata||!s.openaiApiKey||job.metadataLocked||job.metadataSource==='ai'||job.metadataSource==='import')return false;
  const meta=await api.aiGenerateMetadata(s.openaiApiKey,s.openaiModel,channel.name,channel.genre,channel.language,channel.country,job.number,job.topic,channel.seo.aiPrompt);
  useApp.getState().patchJob(job.id,{title:meta.title,description:meta.description,tags:meta.tags,metadataSource:'ai',lastAutomationAt:new Date().toISOString()});
  if(job.folder)await api.writeJobMetadata(job.folder,meta.title,meta.description,meta.tags,job.publishAt,'ai');
  return true;
}

async function processChannel(channel:Channel,summary:AutopilotSummary,aiBudget:{left:number}){
  const state=useApp.getState(),s=state.settings,workspace=s.workspace;
  if(!workspace)return;
  await api.ensureChannelInbox(workspace,channel.name);

  if(s.autoCreatePlan){
    const fresh=useApp.getState().jobs;
    const created=createMissingJobs(channel,fresh);
    if(created.length){useApp.getState().addJobs(created);summary.prepared+=created.length;summary.notes.push(`${channel.name}: создан план +${created.length}`)}
  }

  let jobs=useApp.getState().jobs.filter(j=>j.channelId===channel.id&&j.status!=='SCHEDULED').sort((a,b)=>a.number-b.number);
  for(const job of jobs){
    if(job.status==='ERROR')continue;
    try{const folder=await ensureFolder(channel,job,workspace);if(folder&&!job.folder)summary.prepared++}catch(e){useApp.getState().patchJob(job.id,{status:'ERROR',error:String(e)});logError(summary,`${channel.name} Video_${job.number}: папка`,e)}
  }

  jobs=useApp.getState().jobs.filter(j=>j.channelId===channel.id&&j.status!=='SCHEDULED'&&j.status!=='ERROR').sort((a,b)=>a.number-b.number);
  let inbox=await api.scanChannelInbox(workspace,channel.name);

  if(s.autoAssignMusic&&inbox.music.length){
    const alloc=musicAllocation(jobs,inbox.music,channel.minTracks);
    for(const a of alloc){const j=useApp.getState().jobs.find(x=>x.id===a.jobId);if(!j?.folder)continue;try{const r=await api.ingestTracks(j.folder,a.files,channel.minTracks);useApp.getState().patchJob(j.id,{tracksCount:r.tracksCount,status:r.status as VideoJob['status'],lastAutomationAt:new Date().toISOString()});summary.tracksMoved+=a.files.length}catch(e){logError(summary,`${channel.name} Video_${j.number}: музыка`,e)}}
  }

  jobs=useApp.getState().jobs.filter(j=>j.channelId===channel.id&&j.status!=='SCHEDULED'&&j.status!=='ERROR').sort((a,b)=>a.number-b.number);
  inbox=await api.scanChannelInbox(workspace,channel.name);
  if(s.autoAssignImages&&inbox.images.length){
    const alloc=imageAllocation(jobs,inbox.images);
    for(const a of alloc){const j=useApp.getState().jobs.find(x=>x.id===a.jobId);if(!j?.folder)continue;try{const r=await api.ingestCover(j.folder,a.file,channel.minTracks);useApp.getState().patchJob(j.id,{...r,lastAutomationAt:new Date().toISOString()});summary.imagesMoved++}catch(e){logError(summary,`${channel.name} Video_${j.number}: изображение`,e)}}
  }

  jobs=useApp.getState().jobs.filter(j=>j.channelId===channel.id&&j.status!=='SCHEDULED'&&j.status!=='ERROR').sort((a,b)=>a.number-b.number);
  for(const j of jobs){
    try{
      if(j.folder)await refresh(channel,j.id,j.folder);
      const current=useApp.getState().jobs.find(x=>x.id===j.id)!;
      if(aiBudget.left>0&&current.folder&&await generateAi(channel,current)){summary.metadataGenerated++;aiBudget.left--}
      const after=useApp.getState().jobs.find(x=>x.id===j.id)!;
      if(after.folder&&after.title)await api.writeJobMetadata(after.folder,after.title,after.description,after.tags,after.publishAt,after.metadataSource||'template');
    }catch(e){logError(summary,`${channel.name} Video_${j.number}: обновление`,e)}
  }

  if(s.autoQueueRender){
    jobs=useApp.getState().jobs.filter(j=>j.channelId===channel.id&&j.status==='READY_RENDER'&&j.folder);
    for(const j of jobs){
      const last=j.renderQueuedAt?new Date(j.renderQueuedAt).getTime():0;
      if(last&&Date.now()-last<RENDER_REQUEUE_MS)continue;
      try{await api.enqueueRender(workspace,j.folder);useApp.getState().patchJob(j.id,{renderQueuedAt:new Date().toISOString(),lastAutomationAt:new Date().toISOString()});summary.renderQueued++}catch(e){logError(summary,`${channel.name} Video_${j.number}: очередь ENDLUME`,e)}
    }
    if(s.autoOpenEndlume&&summary.renderQueued>0&&s.endlumePath&&Date.now()-lastEndlumeLaunch>ENDLUME_LAUNCH_COOLDOWN_MS){try{await api.openEndlume(s.endlumePath);lastEndlumeLaunch=Date.now()}catch(e){logError(summary,'ENDLUME запуск',e)}}
  }
}

async function uploadOne(summary:AutopilotSummary){
  const s=useApp.getState().settings;
  if(!s.autoUploadYoutube)return;
  const job=useApp.getState().jobs.find(j=>j.status==='READY_UPLOAD'&&j.finalPath);
  if(!job)return;
  const channel=useApp.getState().channels.find(c=>c.id===job.channelId);
  if(!channel?.youtubeProfileId){summary.notes.push(`${channel?.name||'Канал'} Video_${job.number}: YouTube OAuth не привязан`);return}
  useApp.getState().patchJob(job.id,{status:'UPLOADING',uploadProgress:0,error:undefined});
  try{
    const r=await api.youtubeUpload(channel.youtubeProfileId,job.id,job.finalPath!,job.title,job.description,job.tags,job.publishAt,s.youtubeCategoryId);
    useApp.getState().patchJob(job.id,{status:'SCHEDULED',youtubeVideoId:r.videoId,uploadProgress:100,uploadedAt:new Date().toISOString(),lastAutomationAt:new Date().toISOString()});summary.uploads++;
  }catch(e){useApp.getState().patchJob(job.id,{status:'ERROR',error:String(e)});logError(summary,`${channel.name} Video_${job.number}: YouTube`,e)}
}

export async function runAutopilotCycle(manual=false):Promise<AutopilotSummary>{
  if(running)return {...blankSummary(),notes:['Цикл уже выполняется']};
  running=true;const summary=blankSummary();
  try{
    let s=useApp.getState().settings;
    if(!s.workspace){try{const workspace=await api.defaultWorkspace();useApp.getState().patchSettings({workspace});s=useApp.getState().settings}catch(e){logError(summary,'Workspace',e);return summary}}
    if(!manual&&!s.autopilotEnabled)return {...summary,notes:['Автопилот выключен']};
    const aiBudget={left:3};
    for(const channel of useApp.getState().channels.filter(c=>c.enabled)){try{await processChannel(channel,summary,aiBudget)}catch(e){logError(summary,`${channel.name}: цикл`,e)}}
    await uploadOne(summary);
    const moved=summary.tracksMoved+summary.imagesMoved+summary.renderQueued+summary.uploads+summary.metadataGenerated+summary.prepared;
    if(moved||summary.errors)useApp.getState().log(`Autopilot: папки ${summary.prepared}, треки ${summary.tracksMoved}, изображения ${summary.imagesMoved}, AI ${summary.metadataGenerated}, рендер ${summary.renderQueued}, YouTube ${summary.uploads}, ошибок ${summary.errors}`,summary.errors?'warn':'info');
    await useApp.getState().persist();
    return summary;
  }finally{running=false}
}
