import { create } from 'zustand';
import { api } from './api';
import type { AppState, Channel, Competitor, Page, Settings, VideoJob } from './types';
import { generateMetadata, slugify } from './core';
import {notifyLegacy} from './notificationCenter';

export const DEFAULT_SETTINGS:Settings={
  workspace:'',endlumePath:'',youtubeApiKey:'',autoCheckUpdates:true,reduceMotion:false,fpsMonitor:true,
  autopilotMode:'off',autopilotEnabled:false,autoCreatePlan:true,autoAssignMusic:true,autoAssignImages:true,autoGenerateMetadata:false,
  autoQueueRender:true,autoOpenEndlume:false,autoUploadYoutube:false,autopilotIntervalSec:30,tracksPerVideo:10,
  openaiApiKey:'',openaiModel:'',youtubeOAuthClientId:'',youtubeCategoryId:'10',
  youtubeIntelligenceAutoRefresh:false,youtubeIntelligenceRefreshMin:30,youtubePublishSafeMode:true,
  competitorRpmLow:1.2,competitorRpmHigh:4.0,competitorPoolSize:30,
  endlumeTargetDurationMin:120,endlumeTargetRenderSec:35,endlumeTargetFileMinMb:700,endlumeTargetFileMaxMb:1000,endlumePreserveImageQuality:true,endlumeProjectNaming:'VIDEO_{number}'
};

export const EMPTY_STATE:AppState={version:7,channels:[],jobs:[],competitors:[],settings:DEFAULT_SETTINGS,logs:[]};

type Store=AppState&{
  page:Page; booted:boolean; notice?:string;
  hydrate:(s:AppState)=>void; setPage:(p:Page)=>void; persist:()=>Promise<void>;
  addChannel:(p:Partial<Channel>)=>Channel; updateChannel:(id:string,p:Partial<Channel>)=>void; removeChannel:(id:string)=>void;
  setJobs:(jobs:VideoJob[])=>void; patchJob:(id:string,p:Partial<VideoJob>)=>void; addJobs:(jobs:VideoJob[])=>void;
  addCompetitor:(c:Competitor)=>void; patchCompetitor:(id:string,p:Partial<Competitor>)=>void; removeCompetitor:(id:string)=>void;
  patchSettings:(p:Partial<Settings>)=>void; log:(message:string,level?:'info'|'warn'|'error')=>void; toast:(message:string)=>void;
};

let saveTimer:number|undefined;
function scheduleSave(){window.clearTimeout(saveTimer);saveTimer=window.setTimeout(()=>{void useApp.getState().persist()},180)}
function normalizeJob(j:VideoJob):VideoJob{return {...j,tags:Array.isArray(j.tags)?j.tags:[],metadataSource:j.metadataSource||'template',uploadProgress:j.uploadProgress||0}}
function normalizeChannel(c:Channel):Channel{return {...c,minTracks:c.minTracks||10,targetBufferDays:c.targetBufferDays||60,cadenceDays:c.cadenceDays||4,seo:{titlePatterns:c.seo?.titlePatterns?.length?c.seo.titlePatterns:['{topic} • Session {number}'],descriptionTemplate:c.seo?.descriptionTemplate||'{title}\n\n{genre}',tags:c.seo?.tags||[],banned:c.seo?.banned||[],aiPrompt:c.seo?.aiPrompt}}}

export const useApp=create<Store>((set,get)=>({
  ...EMPTY_STATE,page:'dashboard',booted:false,
  hydrate:s=>set({...EMPTY_STATE,...s,version:7,channels:(s.channels||[]).map(normalizeChannel),jobs:(s.jobs||[]).map(normalizeJob),competitors:s.competitors||[],settings:{...DEFAULT_SETTINGS,...s.settings,autoUploadYoutube:false,youtubeIntelligenceAutoRefresh:false},logs:s.logs||[],booted:true}),
  setPage:page=>set({page}),
  persist:async()=>{const s=get();const state:AppState={version:7,channels:s.channels,jobs:s.jobs,competitors:s.competitors,settings:s.settings,logs:s.logs};await api.saveState(state)},
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
  log:(message,level='info')=>{set(s=>({logs:[{at:new Date().toISOString(),level,message},...s.logs].slice(0,500)}));scheduleSave()},
  toast:notice=>{notifyLegacy(notice)}
}));

export function createLocalJob(channel:Channel,number:number,folder:string,status:VideoJob['status']='NEED_IMAGE'){
  const meta=generateMetadata(channel,number);
  return {id:crypto.randomUUID(),channelId:channel.id,number,folder,status,createdAt:new Date().toISOString(),tracksCount:0,minTracks:channel.minTracks,title:meta.title,description:meta.description,tags:meta.tags,metadataSource:'template'} satisfies VideoJob;
}
