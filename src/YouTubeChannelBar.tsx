import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import {sortChannelsAlphabetically} from './channelSort';
import {loadActivePublishChannel,loadRecentPublishChannels,saveActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import type {Channel} from './types';
import {compactChannelStat,exactChannelStat,isChannelStatsStale,normalizeChannelStatistics,preserveChannelStatisticsOnError,subscriberStatLabel} from './youtubeChannelStats';

export function filterYoutubeChannels(channels:Channel[],query:string){const q=query.trim().toLocaleLowerCase('ru-RU');const ordered=sortChannelsAlphabetically(channels);if(!q)return ordered;return ordered.filter(c=>[c.name,c.slug,c.youtubeChannelId,c.stats?.handle].filter(Boolean).some(v=>String(v).toLocaleLowerCase('ru-RU').includes(q)))}
export function resolveYoutubeActiveChannel(channels:Channel[],saved:string){return channels.some(c=>c.id===saved)?saved:(sortChannelsAlphabetically(channels)[0]?.id||'')}

export function YouTubeChannelBar(){
 const channels=useApp(s=>s.channels),channelKey=channels.map(c=>c.id).join('|');
 const [activeId,setActiveId]=useState(()=>resolveYoutubeActiveChannel(channels,loadActivePublishChannel())),[query,setQuery]=useState(''),[recentIds,setRecentIds]=useState(()=>loadRecentPublishChannels()),[feedback,setFeedback]=useState('');
 useEffect(()=>subscribeActivePublishChannel(id=>{setActiveId(resolveYoutubeActiveChannel(channels,id));setRecentIds(loadRecentPublishChannels());const c=channels.find(x=>x.id===id);if(c)setFeedback(`Активный канал: ${c.name}`)}),[channelKey]);
 useEffect(()=>{const resolved=resolveYoutubeActiveChannel(channels,loadActivePublishChannel());if(resolved&&resolved!==loadActivePublishChannel())saveActivePublishChannel(resolved);setActiveId(resolved);setRecentIds(loadRecentPublishChannels().filter(id=>channels.some(c=>c.id===id)))},[channelKey]);
 const visible=useMemo(()=>filterYoutubeChannels(channels,query),[channels,query]),recent=recentIds.map(id=>channels.find(c=>c.id===id)).filter(Boolean) as Channel[],active=channels.find(c=>c.id===activeId);

 useEffect(()=>{
  if(!active?.youtubeProfileId||!active.youtubeChannelId||!isChannelStatsStale(active.stats))return;
  let cancelled=false;
  void api.youtubeChannelStatistics(active.youtubeProfileId).then(stats=>{
   if(cancelled)return;
   const current=useApp.getState().channels.find(x=>x.id===active.id);
   if(current)useApp.getState().updateChannel(active.id,{stats:normalizeChannelStatistics(stats,current.stats)})
  }).catch(error=>{
   if(cancelled)return;
   const current=useApp.getState().channels.find(x=>x.id===active.id);
   if(current)useApp.getState().updateChannel(active.id,{stats:preserveChannelStatisticsOnError(current.stats,error)})
  });
  return()=>{cancelled=true}
 },[activeId,active?.youtubeProfileId,active?.youtubeChannelId,active?.stats?.statisticsUpdatedAt,active?.stats?.updatedAt]);

 function choose(nextId:string){if(!channels.some(c=>c.id===nextId))return;saveActivePublishChannel(nextId);setActiveId(nextId);setRecentIds(loadRecentPublishChannels());setQuery('');setFeedback(`Активный канал: ${channels.find(c=>c.id===nextId)?.name||nextId}`)}
 const stats=active?.stats;
 return <section className="youtubeChannelBar" aria-label="Глобальный YouTube канал">
  <div className="youtubeChannelBarTitle">
   <small>АКТИВНЫЙ КАНАЛ</small>
   <b>{active?.name||'Канал не выбран'}</b>
   <span>{stats?.handle?`${stats.handle} • `:''}{active?.youtubeChannelId||active?.id||'—'} • {active?.youtubeProfileId?'OAuth ✓':'OAuth не подключён'}</span>
   <div className="youtubeChannelStats">
    <span><small>Подписчики</small><b title={stats?.hiddenSubscriberCount?'Подписчики скрыты владельцем канала':exactChannelStat(stats?.subscriberCount??stats?.subscribers)}>{subscriberStatLabel(stats)}</b></span>
    <span><small>Всего просмотров</small><b title={exactChannelStat(stats?.viewCount??stats?.views)}>{compactChannelStat(stats?.viewCount??stats?.views)}</b></span>
    <span><small>Видео</small><b title={exactChannelStat(stats?.videoCount??stats?.videos)}>{compactChannelStat(stats?.videoCount??stats?.videos)}</b></span>
   </div>
  </div>
  <label className="youtubeChannelSearch">🔎<input aria-label="Найти канал" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти канал…"/></label>
  <label className="youtubeChannelSelect"><span>Канал</span><select aria-label="Активный YouTube-канал" value={visible.some(c=>c.id===activeId)?activeId:''} onChange={e=>choose(e.target.value)}><option value="" disabled>{visible.length?'Выберите канал':'Нет совпадений'}</option>{visible.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <div className="youtubeRecentChannels"><small>Недавние</small><div>{recent.length?recent.map(c=><button key={c.id} className={c.id===activeId?'active':''} onClick={()=>choose(c.id)}>{c.name}</button>):<span>пока нет</span>}</div></div>
  <div className="youtubeChannelFeedback" aria-live="polite">{stats?.syncWarning?'Статистика: последние сохранённые данные • обновить сейчас не удалось':feedback||`Активный канал: ${active?.name||'—'}`}</div>
 </section>
}
