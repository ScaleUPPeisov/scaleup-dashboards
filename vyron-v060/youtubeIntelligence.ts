import { api } from './api';
import { useApp } from './store';
import type { Competitor } from './types';

let running=false;
const stale=(iso:string|undefined,min:number)=>!iso||Date.now()-new Date(iso).getTime()>=Math.max(5,min)*60_000;

export function competitorChannelRef(c:Competitor){return c.youtubeChannelId||c.url||''}

export async function refreshChannelAnalytics(channelId:string,days=28,force=true){
  const s=useApp.getState();const channel=s.channels.find(c=>c.id===channelId);
  if(!channel?.youtubeProfileId)throw new Error('У канала не привязан YouTube OAuth');
  if(!force&&!stale(channel.analytics?.updatedAt,s.settings.youtubeIntelligenceRefreshMin))return channel.analytics;
  const r=await api.youtubeAnalytics(channel.youtubeProfileId,days);
  const ps=(r as any).publicStats||{};
  s.updateChannel(channel.id,{youtubeChannelId:ps.channelId||channel.youtubeChannelId,stats:{subscribers:ps.subscribers??channel.stats?.subscribers,views:ps.views??channel.stats?.views,videos:ps.videos??channel.stats?.videos,updatedAt:r.updatedAt},analytics:r});
  return r;
}

export async function refreshCompetitor(competitorId:string,force=true){
  const s=useApp.getState();const c=s.competitors.find(x=>x.id===competitorId);if(!c)throw new Error('Конкурент не найден');
  const own=s.channels.find(x=>x.id===c.channelId);if(!own?.youtubeProfileId)throw new Error(`Для ${own?.name||'канала'} сначала привяжи YouTube OAuth`);
  if(!force&&!stale(c.updatedAt,s.settings.youtubeIntelligenceRefreshMin))return c;
  const r=await api.youtubeCompetitorSnapshot(own.youtubeProfileId,competitorChannelRef(c));
  const now=r.updatedAt||new Date().toISOString();
  const snapshot={at:now,subscribers:Number(r.subscribers||0),views:Number(r.views||0),videos:Number(r.videos||0),recentAverageViews:Number(r.recentAverageViews||0)};
  const history=[...(c.history||[]),snapshot].slice(-180);
  s.patchCompetitor(c.id,{youtubeChannelId:r.channelId||c.youtubeChannelId,name:r.name||c.name,thumbnail:r.thumbnail||c.thumbnail,subscribers:r.subscribers??c.subscribers,views:r.views??c.views,videos:r.videos??c.videos,recentAverageViews:r.recentAverageViews??c.recentAverageViews,lastVideoAt:r.lastVideoAt||c.lastVideoAt,latestVideos:r.latestVideos||c.latestVideos,updatedAt:now,history});
  return r;
}

export async function refreshYoutubeIntelligence(force=false){
  if(running)return;running=true;const s=useApp.getState();const errors:string[]=[];
  try{
    for(const channel of s.channels.filter(c=>c.enabled&&c.youtubeProfileId)){
      try{await refreshChannelAnalytics(channel.id,28,force)}catch(e){errors.push(`${channel.name}: ${String(e)}`)}
      const competitors=useApp.getState().competitors.filter(c=>c.channelId===channel.id);
      for(const c of competitors){try{await refreshCompetitor(c.id,force)}catch(e){errors.push(`${c.name}: ${String(e)}`)}}
    }
    if(errors.length){useApp.getState().log(`YouTube Intelligence: ${errors.slice(0,5).join(' • ')}`,'warn')}
    else if(force){useApp.getState().log('YouTube Intelligence обновлён')}
  }finally{running=false}
}
