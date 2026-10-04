import {invoke} from '@tauri-apps/api/core';
import {useApp} from './store';
import {useLiveInventory,type ChannelInventorySnapshot} from './renderInventoryRuntime';
import type {AppState,Channel,ChannelStatisticsSnapshot,JobStatus,VideoJob} from './types';
import {scanFactualRenderRuntime,type RuntimeRenderEvidence} from './renderRuntimeEvidence';

type SyncEvent={
  event_id:string;
  event_type:string;
  entity_type:string;
  entity_key:string;
  desktop_event_at:string;
  payload:Record<string,unknown>;
};

const pending:SyncEvent[]=[];
let timer:number|undefined;
let transportBusy=false;
let started=false;
let initialAppPass=true;
let initialInventoryPass=true;
let offlineAt:string|undefined;
const channelSignatures=new Map<string,string>();
const statsSignatures=new Map<string,string>();
const jobSignatures=new Map<string,string>();
const publisherSignatures=new Map<string,string>();
const endlumeSignatures=new Map<string,string>();
const inventorySignatures=new Map<string,string>();
const renderEvidenceSignatures=new Map<string,string>();
let renderProbeRunning=false;
let lastEndlumeConnectivity:'connected'|'disconnected'|undefined;
let lastEndlumeAggregateState:'idle'|'rendering'|'disconnected'|undefined;
let lastEndlumeHeartbeatAtMs=0;

function stable(value:unknown){return JSON.stringify(value)}
function event(type:string,entity:string,key:string,payload:Record<string,unknown>,at=new Date().toISOString()):SyncEvent{
  return{event_id:crypto.randomUUID(),event_type:type,entity_type:entity,entity_key:key,desktop_event_at:at,payload}
}
function retryableEnqueueResult(value:unknown){
  if(!value||typeof value!=='object')return false;
  const row=value as {ok?:unknown;state?:unknown};
  return row.ok===false&&(row.state==='queue_error'||row.state==='queue_full');
}
function scheduleDrain(delayMs=80){
  if(timer!==undefined||transportBusy||!pending.length)return;
  timer=window.setTimeout(()=>{
    timer=undefined;
    if(transportBusy){scheduleDrain();return}
    const batch=pending.splice(0,100);
    transportBusy=true;
    let retryLater=false;
    void invoke('mobile_sync_enqueue',{events:batch}).then(result=>{
      if(retryableEnqueueResult(result)){
        pending.unshift(...batch);
        retryLater=true;
      }
    }).catch(()=>{
      pending.unshift(...batch);
      retryLater=true;
    }).finally(()=>{
      transportBusy=false;
      if(retryLater)scheduleDrain(5_000);
      else scheduleDrain()
    });
  },delayMs)
}
function enqueue(rows:SyncEvent[]){
  if(rows.length)pending.push(...rows);
  scheduleDrain()
}
function flush(){
  if(transportBusy||pending.length){scheduleDrain();return}
  transportBusy=true;
  void invoke('mobile_sync_flush').catch(()=>{}).finally(()=>{transportBusy=false;scheduleDrain()})
}
function sourceStats(channel:Channel){
  const s=channel.stats;
  return{
    subscriberCount:s?.subscriberCount??s?.subscribers??null,
    viewsTotal:s?.viewCount??s?.views??null,
    videoCount:s?.videoCount??s?.videos??null,
    timestamp:s?.statisticsUpdatedAt??s?.updatedAt??channel.analytics?.updatedAt??new Date().toISOString()
  }
}
function nearestHistorical(rows:ChannelStatisticsSnapshot[],targetMs:number){
  const valid=rows.filter(x=>Number.isFinite(Date.parse(x.capturedAt))&&Date.parse(x.capturedAt)<=targetMs);
  if(!valid.length)return undefined;
  return valid.sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt))[0]
}
function metricDelta(rows:ChannelStatisticsSnapshot[],current:number|null,days:number,field:'subscriberCount'|'viewCount'){
  if(current==null)return null;
  const base=nearestHistorical(rows,Date.now()-days*86400_000);
  const value=base?.[field];
  return typeof value==='number'&&Number.isFinite(value)?current-value:null
}
function safeDaily(channel:Channel,period:number){
  const a=channel.analytics;
  if(!a||a.periodDays!==period)return[];
  return(a.daily||[]).slice(-100).map(x=>({
    date:x.date,views:x.views,watchMinutes:x.watchMinutes,subscribersGained:x.subscribersGained,subscribersLost:x.subscribersLost
  }))
}
function safeTraffic(channel:Channel,period:number){
  const a=channel.analytics;
  if(!a||a.periodDays!==period)return[];
  return(a.trafficSources||[]).slice(0,50).map(x=>({key:x.key,views:x.views,watchMinutes:x.watchMinutes}))
}
function mapProjectStatus(status:JobStatus):'READY_RENDER'|'RENDERING'|'COMPLETED'|'ERROR'|'QUEUED'{
  if(status==='READY_RENDER')return'READY_RENDER';
  if(status==='RENDERING')return'RENDERING';
  if(status==='ERROR')return'ERROR';
  if(status==='READY_UPLOAD'||status==='UPLOADING'||status==='SCHEDULED')return'COMPLETED';
  return'QUEUED'
}
function channelPayload(channel:Channel){
  return{
    desktop_channel_id:channel.id,
    youtube_channel_id:channel.youtubeChannelId||null,
    name:channel.name,
    avatar_url:channel.stats?.thumbnail||channel.analytics?.channelThumbnail||null,
    status:channel.enabled===false?'disabled':'active',
    created_at:null
  }
}
function emitStats(state:AppState,channel:Channel,rows:SyncEvent[]){
  const s=sourceStats(channel),history=state.statisticsHistory[channel.id]||[];
  const subToday=metricDelta(history,s.subscriberCount,1,'subscriberCount');
  const sub7=metricDelta(history,s.subscriberCount,7,'subscriberCount');
  const sub28=metricDelta(history,s.subscriberCount,28,'subscriberCount');
  const viewsToday=metricDelta(history,s.viewsTotal,1,'viewCount');
  const views7=metricDelta(history,s.viewsTotal,7,'viewCount');
  const views28=metricDelta(history,s.viewsTotal,28,'viewCount');
  const sub90=metricDelta(history,s.subscriberCount,90,'subscriberCount');
  const views90=metricDelta(history,s.viewsTotal,90,'viewCount');
  for(const period of [7,28,90] as const){
    const analytics=channel.analytics?.periodDays===period?channel.analytics:undefined;
    const payload={
      desktop_channel_id:channel.id,
      timestamp:s.timestamp,
      period_days:period,
      subscriber_count:s.subscriberCount,
      subscriber_delta_today:subToday,
      subscriber_delta_7d:sub7,
      subscriber_delta_28d:sub28,
      subscriber_delta_period:period===7?sub7:period===28?sub28:sub90,
      views_total:s.viewsTotal,
      views_today:viewsToday,
      views_7d:views7,
      views_28d:views28,
      views_period:period===7?views7:period===28?views28:views90,
      video_count:s.videoCount,
      watch_time:analytics?.watchMinutes??null,
      ctr:analytics?.impressionCtr??null,
      average_view_duration:analytics?.averageViewDuration??null,
      last_published_at:channel.lastUploadAt||null,
      daily_points:safeDaily(channel,period),
      traffic_sources:safeTraffic(channel,period)
    };
    const key=channel.id+':'+period,sig=stable(payload);
    if(statsSignatures.get(key)!==sig){
      statsSignatures.set(key,sig);rows.push(event('channel_stats','channel_stats',key,payload,s.timestamp))
    }
  }
}
function projectPayload(job:VideoJob){
  const status=mapProjectStatus(job.status);
  return{
    desktop_project_id:job.id,
    desktop_channel_id:job.channelId,
    project_name:'VIDEO_'+String(job.number).padStart(3,'0'),
    status,
    progress:status==='COMPLETED'?100:null,
    track_count:job.tracksCount??null,
    duration_seconds:null,
    machine:null,
    created_at:job.createdAt,
    error_message:job.error||job.processingError||null
  }
}
function publisherPayload(job:VideoJob){
  return{
    desktop_job_id:job.id,
    desktop_channel_id:job.channelId,
    status:job.status,
    progress:job.status==='UPLOADING'?(job.uploadProgress??null):null,
    scheduled_at:job.publishAt||null,
    youtube_video_id:job.youtubeVideoId||null,
    error_message:job.error||job.processingError||null
  }
}
function endlumePayload(job:VideoJob){
  const mapped=mapProjectStatus(job.status);
  const state=mapped==='RENDERING'?'rendering':mapped==='COMPLETED'?'completed':mapped==='ERROR'?'failed':null;
  if(!state)return null;
  return{
    desktop_job_id:job.id,
    desktop_project_id:job.id,
    state,
    current_project:'VIDEO_'+String(job.number).padStart(3,'0'),
    progress:state==='completed'?100:null,
    last_activity:null,
    machine_name:null,
    error_message:state==='failed'?(job.error||'ENDLUME render failed'):null
  }
}
function notification(kind:string,key:string,title:string,body:string,entityType:string,entityKey:string,at:string){
  return event('notification','notification',key,{
    event_type:kind,dedup_key:key,title,body,entity_type:entityType,entity_key:entityKey,occurred_at:at
  },at)
}

function emitAppState(state:ReturnType<typeof useApp.getState>){
  if(!state.booted)return;
  const rows:SyncEvent[]=[];
  const activeIds=new Set(state.channels.map(x=>x.id));
  for(const oldId of [...channelSignatures.keys()]){
    if(!activeIds.has(oldId)){
      const payload={desktop_channel_id:oldId};
      rows.push(event('channel_delete','channel',oldId,payload));
      channelSignatures.delete(oldId);
      for(const p of [7,28,90])statsSignatures.delete(oldId+':'+p)
    }
  }
  for(const channel of state.channels){
    const payload=channelPayload(channel),sig=stable(payload);
    if(channelSignatures.get(channel.id)!==sig){
      channelSignatures.set(channel.id,sig);rows.push(event('channel_upsert','channel',channel.id,payload))
    }
    emitStats(state,channel,rows)
  }

  const activeJobs=new Set(state.jobs.map(x=>x.id));
  for(const oldId of [...jobSignatures.keys()])if(!activeJobs.has(oldId)){jobSignatures.delete(oldId);publisherSignatures.delete(oldId);endlumeSignatures.delete(oldId)}
  for(const job of state.jobs){
    const project=projectPayload(job),pSig=stable(project),previousProjectSig=jobSignatures.get(job.id);
    if(previousProjectSig!==pSig){
      jobSignatures.set(job.id,pSig);
      rows.push(event('project_upsert','project',job.id,project));
      rows.push(event('project_status','project_status',job.id,{desktop_project_id:job.id,status:project.status,progress:project.progress,error_message:project.error_message,timestamp:new Date().toISOString()}));
      if(!initialAppPass&&previousProjectSig){
        const prev=JSON.parse(previousProjectSig) as typeof project;
        const at=new Date().toISOString();
        if(prev.status!=='COMPLETED'&&project.status==='COMPLETED')rows.push(notification('render_completed','render_completed:'+job.id+':'+at.slice(0,16),'Рендер завершён',String(project.project_name),'project',job.id,at));
        if(prev.status!=='ERROR'&&project.status==='ERROR')rows.push(notification('render_failed','render_failed:'+job.id+':'+at.slice(0,16),'Ошибка рендера',String(project.error_message||project.project_name),'project',job.id,at));
      }
    }
    const pub=publisherPayload(job),pubSig=stable(pub),previousPublisherSig=publisherSignatures.get(job.id);
    if(previousPublisherSig!==pubSig){
      publisherSignatures.set(job.id,pubSig);rows.push(event('publisher_upsert','publisher_job',job.id,pub));
      if(!initialAppPass&&previousPublisherSig){
        const prev=JSON.parse(previousPublisherSig) as typeof pub;
        const at=new Date().toISOString();
        if(!prev.youtube_video_id&&pub.youtube_video_id){
          rows.push(notification('upload_completed','upload_completed:'+job.id+':'+pub.youtube_video_id,'Загрузка завершена',job.title||('VIDEO_'+String(job.number).padStart(3,'0')),'publisher_job',job.id,at))
        }
        if(prev.status==='UPLOADING'&&pub.status==='ERROR'){
          rows.push(notification('upload_failed','upload_failed:'+job.id+':'+String(pub.error_message||'error'),'Ошибка загрузки',String(pub.error_message||job.title||job.id),'publisher_job',job.id,at))
        }else if(prev.status!=='ERROR'&&pub.status==='ERROR'){
          rows.push(notification('publisher_error','publisher_error:'+job.id+':'+String(pub.error_message||'error'),'Ошибка Publisher',String(pub.error_message||job.title||job.id),'publisher_job',job.id,at))
        }
      }
    }
    const end=endlumePayload(job);
    if(end){
      const endSig=stable(end);
      if(endlumeSignatures.get(job.id)!==endSig){endlumeSignatures.set(job.id,endSig);rows.push(event('endlume_upsert','endlume_job',job.id,end))}
    }
  }
  initialAppPass=false;
  enqueue(rows)
}
function inventoryPayload(row:ChannelInventorySnapshot,state:AppState){
  const jobs=state.jobs.filter(x=>x.channelId===row.channelId);
  const scheduled=jobs.filter(x=>x.status==='SCHEDULED').length;
  const published=state.uploadHistory.filter(x=>x.channelId===row.channelId).length;
  const future=jobs.map(x=>x.publishAt).filter((x):x is string=>typeof x==='string'&&Date.parse(x)>Date.now()).sort()[0]||null;
  return{
    desktop_channel_id:row.channelId,
    ready_video_count:row.readyVideos,
    scheduled_video_count:scheduled,
    published_video_count:published,
    remaining_content_days:row.runwayDays,
    last_local_inventory_scan:row.lastScanAt||row.lastConfirmedAt||null,
    next_scheduled_publication:future,
    folder_state:row.folderState,
    stale:row.stale
  }
}
function emitInventory(snapshots:Record<string,ChannelInventorySnapshot>){
  const state=useApp.getState();if(!state.booted)return;
  const rows:SyncEvent[]=[];
  for(const row of Object.values(snapshots)){
    const payload=inventoryPayload(row,state),sig=stable(payload),prev=inventorySignatures.get(row.channelId);
    if(prev!==sig){
      inventorySignatures.set(row.channelId,sig);rows.push(event('inventory_upsert','content_inventory',row.channelId,payload));
      if(!initialInventoryPass&&prev){
        const before=JSON.parse(prev) as typeof payload,at=new Date().toISOString();
        if((before.remaining_content_days??999)>6&&row.runwayDays<=6)rows.push(notification('content_runway_low','runway_low:'+row.channelId+':'+row.runwayDays,'Заканчивается контент',row.channelName+': '+row.runwayDays+' дней','channel',row.channelId,at));
        if((before.remaining_content_days??999)>0&&row.runwayDays<=0)rows.push(notification('content_runway_critical','runway_critical:'+row.channelId,'Контент закончился',row.channelName,'channel',row.channelId,at));
      }
    }
  }
  initialInventoryPass=false;enqueue(rows)
}


export function syncObservedRenderEvidence(evidence:RuntimeRenderEvidence){
  const state=useApp.getState();
  const at=new Date(evidence.observedAtMs).toISOString();
  const rows:SyncEvent[]=[];
  const connectivity:'connected'|'disconnected'=evidence.reliable?'connected':'disconnected';
  const aggregateState:'idle'|'rendering'|'disconnected'=evidence.reliable?(evidence.activeJobIds.size?'rendering':'idle'):'disconnected';
  const previousConnectivity=lastEndlumeConnectivity;
  const heartbeatDue=evidence.observedAtMs-lastEndlumeHeartbeatAtMs>=30_000;
  if(previousConnectivity!==connectivity||lastEndlumeAggregateState!==aggregateState||heartbeatDue){
    lastEndlumeConnectivity=connectivity;
    lastEndlumeAggregateState=aggregateState;
    lastEndlumeHeartbeatAtMs=evidence.observedAtMs;
    rows.push(event('endlume_upsert','endlume_job','__endlume_state__',{
      desktop_job_id:'__endlume_state__',
      state:aggregateState,
      current_project:null,
      progress:null,
      last_activity:at,
      machine_name:null,
      error_message:evidence.reliable?null:'ENDLUME_RUNTIME_UNAVAILABLE',
      updated_at:at
    },at));
    if(previousConnectivity==='connected'&&connectivity==='disconnected'){
      rows.push(notification('endlume_disconnected','endlume_disconnected:'+at.slice(0,16),'ENDLUME отключён','Desktop не видит runtime ENDLUME','endlume','__endlume_state__',at))
    }
  }
  for(const item of evidence.rows){
    const r=item.row;if(!r.jobId)continue;
    const job=state.jobs.find(x=>x.id===r.jobId);if(!job)continue;
    const status=r.renderStatus==='Rendering'?'RENDERING':r.renderStatus==='Completed'?'COMPLETED':r.renderStatus==='Error'?'ERROR':null;
    if(!status)continue;
    const progress=status==='COMPLETED'?100:(typeof r.progress==='number'&&Number.isFinite(r.progress)?Math.max(0,Math.min(100,r.progress)):null);
    const key=r.jobId;
    const fact={desktop_project_id:key,status,progress,error_message:r.error||null,timestamp:at};
    const sig=stable(fact);
    if(renderEvidenceSignatures.get(key)===sig)continue;
    renderEvidenceSignatures.set(key,sig);
    rows.push(event('project_status','project_status',key,fact,at));
    rows.push(event('endlume_upsert','endlume_job',key,{
      desktop_job_id:key,
      desktop_project_id:key,
      state:status==='RENDERING'?'rendering':status==='COMPLETED'?'completed':'failed',
      current_project:'VIDEO_'+String(r.videoNumber||job.number).padStart(3,'0'),
      progress,
      last_activity:at,
      machine_name:null,
      error_message:r.error||null,
      updated_at:at
    },at));
  }
  enqueue(rows)
}

async function probeRenderProgress(force=false){
  if(renderProbeRunning)return;
  const state=useApp.getState();
  if(!state.booted||!state.settings.workspace)return;
  if(!force&&!state.jobs.some(x=>x.status==='RENDERING'))return;
  renderProbeRunning=true;
  try{
    const evidence=await scanFactualRenderRuntime(state.settings.workspace,state.channels);
    syncObservedRenderEvidence(evidence)
  }catch{}finally{renderProbeRunning=false}
}

export function startMobileSyncBridge(){
  if(started)return;started=true;
  emitAppState(useApp.getState());
  emitInventory(useLiveInventory.getState().snapshots);
  const unsubApp=useApp.subscribe(state=>emitAppState(state));
  const unsubInventory=useLiveInventory.subscribe(state=>emitInventory(state.snapshots));
  const interval=window.setInterval(flush,10_000);
  const renderInterval=window.setInterval(()=>void probeRenderProgress(),1_000);
  const connectivityInterval=window.setInterval(()=>void probeRenderProgress(true),7_000);
  void probeRenderProgress(true);
  const online=()=>{
    if(offlineAt){
      const at=offlineAt;offlineAt=undefined;
      enqueue([notification('desktop_offline','desktop_offline:'+at.slice(0,16),'Desktop снова в сети','VYRON восстановил подключение','device','desktop',at)])
    }
    flush()
  };
  const offline=()=>{offlineAt=new Date().toISOString()};
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  window.addEventListener('beforeunload',()=>{unsubApp();unsubInventory();window.clearInterval(interval);window.clearInterval(renderInterval);window.clearInterval(connectivityInterval);window.removeEventListener('online',online);window.removeEventListener('offline',offline)},{once:true});
}

export function mobileSyncBridgeTestHooks(){
  return{mapProjectStatus,retryableEnqueueResult}
}
