import { create } from 'zustand';
import { api } from './api';
import type { ActivityEvent, AppState, Channel, ChannelStatisticsHistory, ChannelStatisticsSnapshot, Competitor, FingerprintCacheEntry, Page, ProjectLifecycleRecord, Settings, UploadHistoryRecord, VideoJob } from './types';
import { generateMetadata, slugify } from './core';
import {notifyError,notifyLegacy,notifyWarning} from './notificationCenter';
import {humanizeError} from './errorCenter';
import {redactSensitive} from './securityRedaction';
import {appendJournalEvent,normalizeActivityJournal} from './activityJournalCore';
import {migrateUploadHistoryFingerprintProvenance} from './storageLifecycle';
import {appendStatisticsSnapshot,normalizeStatisticsHistory} from './youtubeStatisticsCenter';
import {resolvedJobStatus} from './activeErrors';

export const DEFAULT_SETTINGS:Settings={
  workspace:'',renderRootPath:'',endlumePath:'',youtubeApiKey:'',autoCheckUpdates:true,reduceMotion:false,fpsMonitor:true,interfaceDensity:'compact',
  autopilotMode:'off',autopilotEnabled:false,autoCreatePlan:true,autoAssignMusic:true,autoAssignImages:true,autoGenerateMetadata:false,
  autoQueueRender:true,autoOpenEndlume:false,autoUploadYoutube:false,autopilotIntervalSec:30,tracksPerVideo:10,
  openaiApiKey:'',openaiModel:'',youtubeOAuthClientId:'',youtubeCategoryId:'10',
  youtubeIntelligenceAutoRefresh:false,youtubeIntelligenceRefreshMin:30,youtubePublishSafeMode:true,youtubeUploadConcurrency:2,youtubeUploadPerChannelConcurrency:1,metadataConcurrency:3,statisticsConcurrency:3,
  competitorRpmLow:1.2,competitorRpmHigh:4.0,competitorPoolSize:30,publishedVideoCleanupPolicy:'ask',completedProjectCleanupPolicy:'ask',
  endlumeTargetDurationMin:120,endlumeTargetRenderSec:35,endlumeTargetFileMinMb:700,endlumeTargetFileMaxMb:1000,endlumePreserveImageQuality:true,endlumeProjectNaming:'VIDEO_{number}'
};

export const EMPTY_STATE:AppState={version:10,channels:[],jobs:[],competitors:[],settings:DEFAULT_SETTINGS,logs:[],uploadHistory:[],activityJournal:[],statisticsHistory:{},fingerprintCache:{},projectLifecycle:{}};

type Store=AppState&{
  page:Page; booted:boolean; notice?:string;
  hydrate:(s:AppState)=>void; setPage:(p:Page)=>void; persist:()=>Promise<void>;
  addChannel:(p:Partial<Channel>)=>Channel; updateChannel:(id:string,p:Partial<Channel>)=>void; removeChannel:(id:string)=>void;
  setJobs:(jobs:VideoJob[])=>void; patchJob:(id:string,p:Partial<VideoJob>)=>void; addJobs:(jobs:VideoJob[])=>void;
  addCompetitor:(c:Competitor)=>void; patchCompetitor:(id:string,p:Partial<Competitor>)=>void; removeCompetitor:(id:string)=>void;
  patchSettings:(p:Partial<Settings>)=>void; recordUploadHistory:(r:UploadHistoryRecord)=>void; replaceUploadHistory:(rows:UploadHistoryRecord[])=>void; appendActivity:(e:ActivityEvent)=>void; appendActivities:(e:ActivityEvent[])=>void; replaceActivityJournal:(rows:ActivityEvent[])=>void; recordStatisticsSnapshot:(row:ChannelStatisticsSnapshot)=>void; replaceStatisticsHistory:(rows:ChannelStatisticsHistory)=>void; cacheFingerprint:(path:string,e:FingerprintCacheEntry)=>void; cacheFingerprints:(entries:Record<string,FingerprintCacheEntry>)=>void; patchProjectLifecycle:(key:string,p:ProjectLifecycleRecord)=>void; log:(message:string,level?:'info'|'warn'|'error')=>void; toast:(message:string)=>void;
};

let saveTimer:number|undefined;
let persistInFlight:Promise<void>|null=null;
let persistAgain=false;
const SAVE_DEBOUNCE_MS=550;
function persistedSnapshot(s:Store):AppState{
  return{version:10,channels:s.channels,jobs:s.jobs,competitors:s.competitors,settings:s.settings,logs:s.logs,uploadHistory:s.uploadHistory,activityJournal:s.activityJournal,statisticsHistory:s.statisticsHistory,fingerprintCache:s.fingerprintCache,projectLifecycle:s.projectLifecycle}
}
async function persistStoreState(){
  if(persistInFlight){persistAgain=true;return persistInFlight}
  const run=(async()=>{
    do{
      persistAgain=false;
      const result=await api.saveState(persistedSnapshot(useApp.getState()));
      if(result?.securityWarning){const h=humanizeError(result.securityWarning,'storage');notifyWarning(h.title,h.message,{operationId:'keychain-autosave-warning'})}
    }while(persistAgain)
  })();
  persistInFlight=run;
  try{await run}finally{if(persistInFlight===run)persistInFlight=null}
}
function scheduleSave(){
  window.clearTimeout(saveTimer);
  saveTimer=window.setTimeout(()=>{
    saveTimer=undefined;
    void persistStoreState().catch(e=>{const h=humanizeError(e,'storage');notifyError(h.title,h.message,{operationId:'state-save-failed'})})
  },SAVE_DEBOUNCE_MS)
}
function normalizeJob(j:VideoJob):VideoJob{const status=j.status==='ERROR'&&!String(j.error||'').trim()?resolvedJobStatus(j):j.status;const lifecycle=j.storageLifecycle||(j.youtubeVideoId?'UPLOADED':status==='UPLOADING'?'UPLOADING':status==='ERROR'?'FAILED':j.finalPath?'NEW':undefined);return {...j,status,tags:Array.isArray(j.tags)?j.tags:[],metadataSource:j.metadataSource||'template',uploadProgress:j.uploadProgress||0,storageLifecycle:lifecycle}}
export function normalizeChannel(c:Channel):Channel{
  const raw=c as Partial<Channel>;
  const name=String(raw.name||raw.slug||raw.youtubeChannelId||'Канал без названия').trim()||'Канал без названия';
  return {...c,name,slug:String(raw.slug||slugify(name)),genre:String(raw.genre||'Music'),language:String(raw.language||'RU'),country:String(raw.country||'—'),enabled:raw.enabled!==false,minTracks:raw.minTracks||10,targetBufferDays:raw.targetBufferDays||60,cadenceDays:raw.cadenceDays||4,publishHour:Number.isFinite(raw.publishHour)?Number(raw.publishHour):18,publishMinute:Number.isFinite(raw.publishMinute)?Number(raw.publishMinute):0,targetDurationMin:raw.targetDurationMin||120,seo:{titlePatterns:raw.seo?.titlePatterns?.length?raw.seo.titlePatterns:['{topic} • Session {number}'],descriptionTemplate:raw.seo?.descriptionTemplate||'{title}\n\n{genre}',tags:raw.seo?.tags||[],banned:raw.seo?.banned||[],aiPrompt:raw.seo?.aiPrompt}};
}

function dedupeHydratedChannels(rows:Channel[]){
  const channels:Channel[]=[];const aliases=new Map<string,string>(),byId=new Map<string,Channel>(),byYoutube=new Map<string,Channel>();let changed=false;
  const merge=(base:Channel,incoming:Channel)=>normalizeChannel({...incoming,...base,
    youtubeProfileId:base.youtubeProfileId||incoming.youtubeProfileId,
    youtubeChannelId:base.youtubeChannelId||incoming.youtubeChannelId,
    renderFolderPath:base.renderFolderPath||incoming.renderFolderPath,
    projectsFolderPath:base.projectsFolderPath||incoming.projectsFolderPath,
    stats:base.stats||incoming.stats,analytics:base.analytics||incoming.analytics,
    seo:{...incoming.seo,...base.seo}
  });
  for(const raw of rows.filter(Boolean).map(normalizeChannel)){
    const youtubeKey=String(raw.youtubeChannelId||'').trim();
    const existing=byId.get(raw.id)||(youtubeKey?byYoutube.get(youtubeKey):undefined);
    if(!existing){channels.push(raw);byId.set(raw.id,raw);if(youtubeKey)byYoutube.set(youtubeKey,raw);continue}
    changed=true;aliases.set(raw.id,existing.id);
    const merged=merge(existing,raw),index=channels.findIndex(x=>x.id===existing.id);
    if(index>=0)channels[index]=merged;byId.set(existing.id,merged);if(merged.youtubeChannelId)byYoutube.set(merged.youtubeChannelId,merged)
  }
  return{channels,aliases,changed}
}
function remapStatisticsHistory(history:ChannelStatisticsHistory,aliases:Map<string,string>):ChannelStatisticsHistory{
  const out:ChannelStatisticsHistory={};
  for(const [channelId,rows] of Object.entries(history||{})){
    const target=aliases.get(channelId)||channelId;
    const bucket=out[target]||(out[target]=[]);
    for(const row of rows||[]){const mapped={...row,channelId:target};if(!bucket.some(x=>x.snapshotId===mapped.snapshotId))bucket.push(mapped)}
  }
  return out
}

export const useApp=create<Store>((set,get)=>({
  ...EMPTY_STATE,page:'dashboard',booted:false,
  hydrate:s=>{const dedup=dedupeHydratedChannels((s.channels||[]).filter(Boolean)),remap=(id:string)=>dedup.aliases.get(id)||id,jobs=(s.jobs||[]).filter(Boolean).map(j=>normalizeJob({...j,channelId:remap(j.channelId)})),activityJournal=normalizeActivityJournal((s as any).activityJournal).map(e=>e.channelId&&dedup.aliases.has(e.channelId)?{...e,channelId:remap(e.channelId)}:e),rawHistory:Array<UploadHistoryRecord>=Array.isArray((s as any).uploadHistory)?(s as any).uploadHistory.map((x:UploadHistoryRecord)=>dedup.aliases.has(x.channelId)?{...x,channelId:remap(x.channelId)}:x):[],uploadHistory=migrateUploadHistoryFingerprintProvenance(rawHistory,activityJournal,jobs),provenanceChanged=uploadHistory.some((x,i)=>x.fingerprintProofSource!==rawHistory[i]?.fingerprintProofSource||x.proofSchemaVersion!==rawHistory[i]?.proofSchemaVersion),statisticsHistory=remapStatisticsHistory(normalizeStatisticsHistory((s as any).statisticsHistory),dedup.aliases),competitors=(s.competitors||[]).map(x=>dedup.aliases.has(x.channelId)?{...x,channelId:remap(x.channelId)}:x);set({...EMPTY_STATE,...s,version:10,channels:dedup.channels,jobs,competitors,settings:{...DEFAULT_SETTINGS,...s.settings,youtubeIntelligenceAutoRefresh:false},logs:s.logs||[],uploadHistory,activityJournal,statisticsHistory,fingerprintCache:(s as any).fingerprintCache||{},projectLifecycle:(s as any).projectLifecycle||{},booted:true});if(provenanceChanged||dedup.changed)scheduleSave()},
  setPage:page=>set({page}),
  persist:persistStoreState,
  addChannel:p=>{
    const id=crypto.randomUUID();const name=(p.name||'Новый канал').trim();const defaultTracks=get().settings.tracksPerVideo||10;
    const channel:Channel={id,name,slug:slugify(name),cadenceDays:p.cadenceDays||2,targetBufferDays:p.targetBufferDays||60,publishHour:p.publishHour??18,publishMinute:p.publishMinute??0,language:p.language||'RU',genre:p.genre||'Music',country:p.country||'Россия',minTracks:p.minTracks||defaultTracks,targetDurationMin:p.targetDurationMin||get().settings.endlumeTargetDurationMin||120,enabled:p.enabled??true,youtubeProfileId:p.youtubeProfileId,youtubeChannelId:p.youtubeChannelId,seo:p.seo||{titlePatterns:['{topic} • Session {number}','{genre} — {topic} | Mix {number}'],descriptionTemplate:'{title}\n\nНовая подборка в стиле {genre}.',tags:[p.genre||'music','mix','playlist'],banned:[],aiPrompt:''}};
    set(s=>({channels:[...s.channels,channel]}));scheduleSave();return channel;
  },
  updateChannel:(id,p)=>{set(s=>({channels:s.channels.map(c=>c.id===id?normalizeChannel({...c,...p}):c)}));scheduleSave()},
  removeChannel:id=>{set(s=>({channels:s.channels.filter(c=>c.id!==id),jobs:s.jobs.filter(j=>j.channelId!==id),competitors:s.competitors.filter(c=>c.channelId!==id)}));scheduleSave()},
  setJobs:jobs=>{set({jobs:jobs.map(normalizeJob)});scheduleSave()},
  patchJob:(id,p)=>{set(s=>({jobs:s.jobs.map(j=>j.id===id?normalizeJob({...j,...p}):j)}));scheduleSave()},
  addJobs:jobs=>{set(s=>({jobs:[...s.jobs,...jobs.map(normalizeJob)]}));scheduleSave()},
  addCompetitor:c=>{set(s=>({competitors:[...s.competitors,c]}));scheduleSave()},
  patchCompetitor:(id,p)=>{set(s=>({competitors:s.competitors.map(c=>c.id===id?{...c,...p}:c)}));scheduleSave()},
  removeCompetitor:id=>{set(s=>({competitors:s.competitors.filter(c=>c.id!==id)}));scheduleSave()},
  patchSettings:p=>{set(s=>({settings:{...s.settings,...p}}));scheduleSave()},
  recordUploadHistory:r=>{set(s=>({uploadHistory:[...s.uploadHistory,r]}));scheduleSave()},
  replaceUploadHistory:rows=>{set({uploadHistory:rows});scheduleSave()},
  appendActivity:e=>{set(s=>({activityJournal:appendJournalEvent(s.activityJournal,e)}));scheduleSave()},
  appendActivities:rows=>{set(s=>({activityJournal:rows.reduce((acc,e)=>appendJournalEvent(acc,e),s.activityJournal)}));scheduleSave()},
  replaceActivityJournal:rows=>{set({activityJournal:normalizeActivityJournal(rows)});scheduleSave()},
  recordStatisticsSnapshot:row=>{set(s=>({statisticsHistory:appendStatisticsSnapshot(s.statisticsHistory,row)}));scheduleSave()},
  replaceStatisticsHistory:rows=>{set({statisticsHistory:normalizeStatisticsHistory(rows)});scheduleSave()},
  cacheFingerprint:(path,e)=>{set(s=>({fingerprintCache:{...s.fingerprintCache,[path]:e}}));scheduleSave()},
  cacheFingerprints:entries=>{if(!Object.keys(entries).length)return;set(s=>({fingerprintCache:{...s.fingerprintCache,...entries}}));scheduleSave()},
  patchProjectLifecycle:(key,p)=>{set(s=>({projectLifecycle:{...s.projectLifecycle,[key]:p}}));scheduleSave()},
  log:(message,level='info')=>{const safe=redactSensitive(message);set(s=>({logs:[{at:new Date().toISOString(),level,message:safe},...s.logs].slice(0,500)}));scheduleSave()},
  toast:notice=>{notifyLegacy(notice)}
}));

export function createLocalJob(channel:Channel,number:number,folder:string,status:VideoJob['status']='NEED_IMAGE'){
  const meta=generateMetadata(channel,number);
  return {id:crypto.randomUUID(),channelId:channel.id,number,folder,status,createdAt:new Date().toISOString(),tracksCount:0,minTracks:channel.minTracks,title:meta.title,description:meta.description,tags:meta.tags,metadataSource:'template'} satisfies VideoJob;
}
