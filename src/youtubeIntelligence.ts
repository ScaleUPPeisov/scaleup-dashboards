import { api } from './api';
import { useApp } from './store';
import type { Competitor } from './types';
import {isYoutubeQuotaError,youtubeQuotaState} from './youtubeQuota';
import {markYoutubeCache,youtubeCacheFresh} from './youtubeCache';
import {humanizeError} from './errorCenter';

let running=false;
export const ANALYTICS_DISABLED_TTL_MS=6*60*60*1000;
const ANALYTICS_DISABLED_KEY='vyron:analytics-api-disabled:v1';
type AnalyticsDisabledRow={profileId:string;at:string;until:string;reason:string};

function readAnalyticsDisabled():Record<string,AnalyticsDisabledRow>{
 try{return JSON.parse(localStorage.getItem(ANALYTICS_DISABLED_KEY)||'{}')}catch{return{}}
}
function writeAnalyticsDisabled(rows:Record<string,AnalyticsDisabledRow>){
 try{localStorage.setItem(ANALYTICS_DISABLED_KEY,JSON.stringify(rows))}catch{}
}
export function isAnalyticsApiDisabledError(error:unknown){
 const s=String(error||'').toLowerCase();
 return s.includes('accessnotconfigured')||
   s.includes('service_disabled')||
   (s.includes('youtube analytics api')&&(s.includes('not been used')||s.includes('disabled')||s.includes('enable')))||
   (s.includes('youtubeanalytics.googleapis.com')&&(s.includes('disabled')||s.includes('not enabled')||s.includes('permission')));
}
export function analyticsApiDisabledState(profileId:string,now=Date.now()){
 const row=readAnalyticsDisabled()[profileId];if(!row)return undefined;
 const until=Date.parse(row.until);if(!Number.isFinite(until)||until<=now){
  const rows=readAnalyticsDisabled();delete rows[profileId];writeAnalyticsDisabled(rows);return undefined
 }
 return row
}
function markAnalyticsApiDisabled(profileId:string,error:unknown){
 const now=Date.now(),rows=readAnalyticsDisabled();
 rows[profileId]={profileId,at:new Date(now).toISOString(),until:new Date(now+ANALYTICS_DISABLED_TTL_MS).toISOString(),reason:String(error)};
 writeAnalyticsDisabled(rows);return rows[profileId]
}
function clearAnalyticsApiDisabled(profileId:string){
 const rows=readAnalyticsDisabled();if(!rows[profileId])return;delete rows[profileId];writeAnalyticsDisabled(rows)
}
const stale=(iso:string|undefined,min:number)=>!iso||Date.now()-new Date(iso).getTime()>=Math.max(5,min)*60_000;
export function competitorChannelRef(c:Competitor){return c.youtubeChannelId||c.url||''}

export async function refreshChannelAnalytics(channelId:string,days=28,force=true,offsetDays=0,allTime=false){
 const s=useApp.getState(),channel=s.channels.find(c=>c.id===channelId);if(!channel?.youtubeProfileId)throw new Error('У канала не привязан YouTube OAuth');
 if(!force&&channel.analytics?.periodDays===days&&Number(channel.analytics?.offsetDays||0)===offsetDays&&(youtubeCacheFresh('analytics',`${channelId}:${days}:${offsetDays}`)||!stale(channel.analytics?.updatedAt,s.settings.youtubeIntelligenceRefreshMin)))return channel.analytics;
 const disabled=analyticsApiDisabledState(channel.youtubeProfileId);
 if(!force&&disabled){
  if(channel.analytics)return channel.analytics;
  throw new Error('ANALYTICS_API_DISABLED_CACHED: YouTube Analytics API не включён; автоматический retry отложен до '+disabled.until)
 }
 try{
  const r=await api.youtubeAnalytics(channel.youtubeProfileId,days,offsetDays,allTime),ps=(r as any).publicStats||{};
  clearAnalyticsApiDisabled(channel.youtubeProfileId);
  s.updateChannel(channel.id,{youtubeChannelId:ps.channelId||channel.youtubeChannelId,stats:{subscribers:ps.subscribers??channel.stats?.subscribers,views:ps.views??channel.stats?.views,videos:ps.videos??channel.stats?.videos,updatedAt:r.updatedAt},analytics:r});markYoutubeCache('analytics',`${channelId}:${days}:${offsetDays}`,Math.max(5,s.settings.youtubeIntelligenceRefreshMin)*60_000);
  return r;
 }catch(error){
  if(isAnalyticsApiDisabledError(error)){
   markAnalyticsApiDisabled(channel.youtubeProfileId,error);
   throw new Error('ANALYTICS_API_DISABLED: YouTube Analytics API не включён. Включите youtubeanalytics.googleapis.com в используемом Google Cloud Project.')
  }
  throw error
 }
}

export async function refreshCompetitor(competitorId:string,force=true){
 const s=useApp.getState(),c=s.competitors.find(x=>x.id===competitorId);if(!c)throw new Error('Конкурент не найден');const own=s.channels.find(x=>x.id===c.channelId);if(!own?.youtubeProfileId)throw new Error(`Для ${own?.name||'канала'} сначала привяжи YouTube OAuth`);if(!force&&(youtubeCacheFresh('competitor-snapshot',c.id)||!stale(c.updatedAt,Math.max(60,s.settings.youtubeIntelligenceRefreshMin))))return c;
 const r=await api.youtubeCompetitorSnapshot(own.youtubeProfileId,competitorChannelRef(c)),now=r.updatedAt||new Date().toISOString(),snapshot={at:now,subscribers:Number(r.subscribers||0),views:Number(r.views||0),videos:Number(r.videos||0),recentAverageViews:Number(r.recentAverageViews||0)},history=[...(c.history||[]),snapshot].slice(-720);
 s.patchCompetitor(c.id,{youtubeChannelId:r.channelId||c.youtubeChannelId,name:r.name||c.name,handle:r.handle||c.handle,publishedAt:r.publishedAt||c.publishedAt,country:r.country||c.country,thumbnail:r.thumbnail||c.thumbnail,subscribers:r.subscribers??c.subscribers,views:r.views??c.views,videos:r.videos??c.videos,recentAverageViews:r.recentAverageViews??c.recentAverageViews,lastVideoAt:r.lastVideoAt||c.lastVideoAt,latestVideos:r.latestVideos||c.latestVideos,updatedAt:now,history});markYoutubeCache('competitor-snapshot',c.id);return r;
}

export async function discoverCompetitorsForChannel(channelId:string,force=false){
 const s=useApp.getState(),own=s.channels.find(c=>c.id===channelId);if(!own?.youtubeProfileId)return 0;if(!force&&youtubeCacheFresh('competitor-discovery',channelId))return 0;
 const pool=Math.max(10,Math.min(50,s.settings.competitorPoolSize||30));const found=await api.youtubeDiscoverCompetitors(own.youtubeProfileId,Math.min(50,pool));const current=useApp.getState().competitors.filter(c=>c.channelId===channelId);const existing=new Set(current.map(c=>c.youtubeChannelId).filter(Boolean));let added=0;
 for(const x of found){if(existing.has(x.channelId)||x.channelId===own.youtubeChannelId)continue;if(current.length+added>=pool)break;useApp.getState().addCompetitor({id:crypto.randomUUID(),channelId,name:x.name,url:x.url,youtubeChannelId:x.channelId,handle:x.handle,publishedAt:x.publishedAt,country:x.country,thumbnail:x.thumbnail,subscribers:x.subscribers,views:x.views,videos:x.videos,history:[],similarity:x.similarity,source:'auto'});existing.add(x.channelId);added++}
 markYoutubeCache('competitor-discovery',channelId);return added;
}

export async function refreshYoutubeIntelligence(force=false){
 if(running||youtubeQuotaState().blocked)return;running=true;const errors:string[]=[];try{
  const state=useApp.getState();
  for(const channel of state.channels.filter(c=>c.enabled&&c.youtubeProfileId)){
   try{await refreshChannelAnalytics(channel.id,28,force)}catch(e){errors.push(`${channel.name}: ${humanizeError(e,'analytics').message}`)}
   // VYRON 5.0.0: search.list / competitor discovery is NEVER part of background or aggregate refresh.
   // New competitors are discovered only by the explicit "Найти похожие каналы" action.
   const candidates=useApp.getState().competitors.filter(c=>c.channelId===channel.id).sort((a,b)=>(Date.parse(a.updatedAt||'')||0)-(Date.parse(b.updatedAt||'')||0)).filter(c=>force||stale(c.updatedAt,Math.max(60,useApp.getState().settings.youtubeIntelligenceRefreshMin))).slice(0,force?10:3);
   for(const competitor of candidates){try{await refreshCompetitor(competitor.id,true)}catch(e){errors.push(`${competitor.name}: ${humanizeError(e,'competitors').message}`)}}
  }
  if(errors.length&&!errors.some(isYoutubeQuotaError))useApp.getState().log(`YouTube Intelligence: ${errors.slice(0,8).join(' • ')}`,'warn');
  else if(force&&!youtubeQuotaState().blocked)useApp.getState().log('YouTube Intelligence обновлён');
 }finally{running=false}
}
