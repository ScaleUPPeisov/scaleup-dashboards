import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {api} from './api';
import {sortChannelsAlphabetically} from './channelSort';
import {loadActivePublishChannel,loadRecentPublishChannels,saveActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import type {Channel,YoutubeProfile} from './types';
import {channelStatsStatusLabel,compactChannelStat,exactChannelStat,isChannelStatsStale,subscriberStatLabel} from './youtubeChannelStats';
import {refreshYoutubeProfileStatistics} from './youtubeChannelStatsRuntime';
import {classifyYoutubeChannels} from './youtubeStatisticsCenter';

export function filterYoutubeChannels(channels:Channel[],query:string){const q=query.trim().toLocaleLowerCase('ru-RU');const ordered=sortChannelsAlphabetically(channels);if(!q)return ordered;return ordered.filter(c=>[c.name,c.slug,c.youtubeChannelId,c.stats?.handle].filter(Boolean).some(v=>String(v).toLocaleLowerCase('ru-RU').includes(q)))}
export function resolveYoutubeActiveChannel(channels:Channel[],saved:string){return channels.some(c=>c.id===saved)?saved:(sortChannelsAlphabetically(channels)[0]?.id||'')}

export function YouTubeChannelBar(){
 const channels=useApp(s=>s.channels),channelKey=channels.map(c=>c.id).join('|');
 const [activeId,setActiveId]=useState(()=>resolveYoutubeActiveChannel(channels,loadActivePublishChannel()));
 const [query,setQuery]=useState(''),[feedback,setFeedback]=useState('');
 const [refreshing,setRefreshing]=useState(false),[profiles,setProfiles]=useState<YoutubeProfile[]>([]);

 useEffect(()=>subscribeActivePublishChannel(id=>{setActiveId(resolveYoutubeActiveChannel(channels,id));const c=channels.find(x=>x.id===id);if(c)setFeedback(`Активный канал: ${c.name}`)}),[channelKey]);
 useEffect(()=>{let live=true;void api.youtubeProfiles().then(p=>{if(live)setProfiles(p)}).catch(()=>{});return()=>{live=false}},[]);
 useEffect(()=>{const resolved=resolveYoutubeActiveChannel(channels,loadActivePublishChannel());if(resolved&&resolved!==loadActivePublishChannel())saveActivePublishChannel(resolved);setActiveId(resolved)},[channelKey]);

 const visible=useMemo(()=>filterYoutubeChannels(channels,query),[channels,query]);
 const active=channels.find(c=>c.id===activeId);
 const activeLinked=classifyYoutubeChannels(active?[active]:[],profiles).linked[0];

 async function refreshActive(force=false){
  const current=useApp.getState().channels.find(c=>c.id===activeId);
  if(!current?.youtubeProfileId||!current.youtubeChannelId)return;
  const profile=profiles.find(p=>p.id===current.youtubeProfileId&&p.channelId===current.youtubeChannelId);
  if(!profile){setFeedback(`⚠ ${current.name}: YouTube profile не связан точно • API call не выполнен`);return}
  if(!force&&!isChannelStatsStale(current.stats))return;
  setRefreshing(true);
  try{
   const stats=await refreshYoutubeProfileStatistics(profile,`active-stats:${current.id}:${Date.now()}`);
   setFeedback(stats?`✓ Статистика ${current.name} обновлена`:`⚠ Не удалось обновить ${current.name}; показаны последние данные`);
  }finally{setRefreshing(false)}
 }

 useEffect(()=>{void refreshActive(false)},[activeId,active?.youtubeProfileId,active?.youtubeChannelId,profiles.length]);

 function choose(nextId:string){
  if(!channels.some(c=>c.id===nextId))return;
  saveActivePublishChannel(nextId);setActiveId(nextId);setQuery('');
  setFeedback(`Активный канал: ${channels.find(c=>c.id===nextId)?.name||nextId}`)
 }

 const stats=active?.stats;
 return <section className="youtubeChannelBar youtubeChannelBarV215" aria-label="Глобальный YouTube канал">
  <div className="youtubeChannelBarTitle">
   <small>YOUTUBE CHANNEL</small>
   <b>{active?.name||'Канал не выбран'}</b>
   <span>{stats?.handle?`${stats.handle} • `:''}{active?.youtubeChannelId||active?.id||'—'} • {activeLinked?'OAuth ✓':'OAuth не подключён'}</span>
   <div className="youtubeChannelStats">
    <span><small>👥 Подписчики</small><b title={stats?.hiddenSubscriberCount?'Подписчики скрыты владельцем канала':exactChannelStat(stats?.subscriberCount??stats?.subscribers)}>{subscriberStatLabel(stats)}</b></span>
    <span><small>👁 Всего просмотров</small><b title={exactChannelStat(stats?.viewCount??stats?.views)}>{compactChannelStat(stats?.viewCount??stats?.views)}</b></span>
    <span><small>🎬 Видео</small><b title={exactChannelStat(stats?.videoCount??stats?.videos)}>{compactChannelStat(stats?.videoCount??stats?.videos)}</b></span>
   </div>
   <div className={stats?.syncWarning?'youtubeStatsState warn':'youtubeStatsState'}>
    <span>{channelStatsStatusLabel(stats,refreshing)}</span>
    <button disabled={refreshing||!activeLinked} onClick={()=>void refreshActive(true)}>{refreshing?'↻ Обновление…':'↻ Обновить'}</button>
   </div>
  </div>
  <label className="youtubeChannelSearch">🔎<input aria-label="Найти канал" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти канал…"/></label>
  <label className="youtubeChannelSelect"><span>Канал</span><select aria-label="Активный YouTube-канал" value={visible.some(c=>c.id===activeId)?activeId:''} onChange={e=>choose(e.target.value)}><option value="" disabled>{visible.length?'Выберите канал':'Нет совпадений'}</option>{visible.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <div className="youtubeChannelFeedback" aria-live="polite">{feedback||`Активный канал: ${active?.name||'—'}`}</div>
 </section>
}
