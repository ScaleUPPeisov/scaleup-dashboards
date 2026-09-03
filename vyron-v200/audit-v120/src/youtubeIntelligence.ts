import { api } from './api';
import { useApp } from './store';
import type { Competitor } from './types';
import {isYoutubeQuotaError,youtubeQuotaState} from './youtubeQuota';

let running=false;
const stale=(iso:string|undefined,min:number)=>!iso||Date.now()-new Date(iso).getTime()>=Math.max(5,min)*60_000;
export function competitorChannelRef(c:Competitor){return c.youtubeChannelId||c.url||''}

export async function refreshChannelAnalytics(channelId:string,days=28,force=true,offsetDays=0,allTime=false){
 const s=useApp.getState(),channel=s.channels.find(c=>c.id===channelId);if(!channel?.youtubeProfileId)throw new Error('У канала не привязан YouTube OAuth');
 if(!force&&channel.analytics?.periodDays===days&&Number(channel.analytics?.offsetDays||0)===offsetDays&&!stale(channel.analytics?.updatedAt,s.settings.youtubeIntelligenceRefreshMin))return channel.analytics;
 const r=await api.youtubeAnalytics(channel.youtubeProfileId,days,offsetDays,allTime),ps=(r as any).publicStats||{};
 s.updateChannel(channel.id,{name:ps.title||channel.name,youtubeChannelId:ps.channelId||channel.youtubeChannelId,stats:{subscribers:ps.subscribers??channel.stats?.subscribers,views:ps.views??channel.stats?.views,videos:ps.videos??channel.stats?.videos,updatedAt:r.updatedAt},analytics:r});
 return r;
}

export async function refreshCompetitor(competitorId:string,force=true){
 const s=useApp.getState(),c=s.competitors.find(x=>x.id===competitorId);if(!c)throw new Error('Конкурент не найден');const own=s.channels.find(x=>x.id===c.channelId);if(!own?.youtubeProfileId)throw new Error(`Для ${own?.name||'канала'} сначала привяжи YouTube OAuth`);if(!force&&!stale(c.updatedAt,Math.max(60,s.settings.youtubeIntelligenceRefreshMin)))return c;
 const r=await api.youtubeCompetitorSnapshot(own.youtubeProfileId,competitorChannelRef(c)),now=r.updatedAt||new Date().toISOString(),snapshot={at:now,subscribers:Number(r.subscribers||0),views:Number(r.views||0),videos:Number(r.videos||0),recentAverageViews:Number(r.recentAverageViews||0)},history=[...(c.history||[]),snapshot].slice(-720);
 s.patchCompetitor(c.id,{youtubeChannelId:r.channelId||c.youtubeChannelId,name:r.name||c.name,thumbnail:r.thumbnail||c.thumbnail,subscribers:r.subscribers??c.subscribers,views:r.views??c.views,videos:r.videos??c.videos,recentAverageViews:r.recentAverageViews??c.recentAverageViews,lastVideoAt:r.lastVideoAt||c.lastVideoAt,latestVideos:r.latestVideos||c.latestVideos,updatedAt:now,history});return r;
}

export async function discoverCompetitorsForChannel(channelId:string,force=false){
 const s=useApp.getState(),own=s.channels.find(c=>c.id===channelId);if(!own?.youtubeProfileId)return 0;const key=`vyron:competitor-discovery:${channelId}`,last=Number(localStorage.getItem(key)||0);if(!force&&Date.now()-last<24*3600_000)return 0;
 const pool=Math.max(10,Math.min(50,s.settings.competitorPoolSize||30));const found=await api.youtubeDiscoverCompetitors(own.youtubeProfileId,Math.min(50,pool));const current=useApp.getState().competitors.filter(c=>c.channelId===channelId);const existing=new Set(current.map(c=>c.youtubeChannelId).filter(Boolean));let added=0;
 for(const x of found){if(existing.has(x.channelId)||x.channelId===own.youtubeChannelId)continue;if(current.length+added>=pool)break;useApp.getState().addCompetitor({id:crypto.randomUUID(),channelId,name:x.name,url:x.url,youtubeChannelId:x.channelId,thumbnail:x.thumbnail,subscribers:x.subscribers,views:x.views,videos:x.videos,history:[],similarity:x.similarity,source:'auto'});existing.add(x.channelId);added++}
 localStorage.setItem(key,String(Date.now()));return added;
}

export async function refreshYoutubeIntelligence(force=false){
 if(running||youtubeQuotaState().blocked)return;running=true;const errors:string[]=[];try{const state=useApp.getState();for(const channel of state.channels.filter(c=>c.enabled&&c.youtubeProfileId)){try{await refreshChannelAnalytics(channel.id,28,force)}catch(e){errors.push(`${channel.name}: ${String(e)}`)}try{await discoverCompetitorsForChannel(channel.id,force)}catch(e){errors.push(`${channel.name} discovery: ${String(e)}`)}const candidates=useApp.getState().competitors.filter(c=>c.channelId===channel.id).sort((a,b)=>(Date.parse(a.updatedAt||'')||0)-(Date.parse(b.updatedAt||'')||0)).filter(c=>force||stale(c.updatedAt,Math.max(60,useApp.getState().settings.youtubeIntelligenceRefreshMin))).slice(0,force?10:3);for(const c of candidates){try{await refreshCompetitor(c.id,true)}catch(e){errors.push(`${c.name}: ${String(e)}`)}}}
 if(errors.length&&!errors.some(isYoutubeQuotaError))useApp.getState().log(`YouTube Intelligence: ${errors.slice(0,8).join(' • ')}`,'warn');else if(force&&!youtubeQuotaState().blocked)useApp.getState().log('YouTube Intelligence обновлён')}finally{running=false}
}
