import React,{useState} from 'react';
import {useApp} from './store';
import {bufferDays,formatNumber} from './core';
import type {Channel,VideoJob} from './types';

const money=(x?:number)=>x==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(x);
const rpm=(rev?:number,views?:number)=>rev==null||!views?'—':`$${(rev/views*1000).toFixed(2)}`;
function health(c:Channel,jobs:VideoJob[]){let n=100;if(!c.youtubeProfileId)n-=25;if(!c.analytics)n-=15;if(jobs.some(j=>j.channelId===c.id&&j.status==='ERROR'))n-=20;const b=bufferDays(c,jobs);if(b<7)n-=25;else if(b<14)n-=12;return Math.max(0,n)}

export function ChannelsOS(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),addChannel=useApp(s=>s.addChannel),updateChannel=useApp(s=>s.updateChannel),removeChannel=useApp(s=>s.removeChannel),setPage=useApp(s=>s.setPage);
 const [editing,setEditing]=useState<string|null>(null);
 const add=()=>{const c=addChannel({name:`Канал ${channels.length+1}`});setEditing(c.id)};
 return <>
  <div className="pageHeader"><div><small>CHANNEL NETWORK • LOCAL CACHE</small><h1>Каналы</h1><p>Только сохранённые данные последней ручной синхронизации. YouTube API здесь не вызывается.</p></div><div className="headerActions"><button onClick={()=>setPage('youtube')}>Обновить данные в YouTube</button><button className="primary" onClick={add}>+ Добавить канал</button></div></div>
  <div className="cacheNotice"><b>ZERO QUOTA</b><span>Переходы по приложению не расходуют YouTube API quota.</span></div>
  {channels.length===0?<div className="empty"><b>Каналов пока нет</b><p>Добавь локальный канал или подключи реальный аккаунт во вкладке YouTube.</p></div>:<div className="channelOSList">{channels.map(c=>{
   const a=c.analytics,rev=a?.periodDays===28?a.estimatedRevenue:undefined;
   return <article className={`channelOSCard ${editing===c.id?'editing':''}`} key={c.id}>
    <header><div className="channelAvatarOS">{a?.channelThumbnail?<img src={a.channelThumbnail} loading="lazy"/>:c.name.slice(0,2).toUpperCase()}</div><span className="channelIdentity"><b>{c.name}</b><small>{c.youtubeChannelId||'YouTube Channel ID —'}</small><em className={c.youtubeProfileId?'good':'warn'}>{c.youtubeProfileId?'OAuth сохранён локально':'YouTube не привязан'}</em></span><span className="channelHealth"><small>HEALTH</small><b>{health(c,jobs)}</b><em>Reserve {bufferDays(c,jobs)} days</em></span><button onClick={()=>setEditing(editing===c.id?null:c.id)}>✎</button></header>
    <div className="channelMetaLine"><span>Страна <b>{a?.channelCountry||c.country||'—'}</b></span><span>Язык <b>{a?.channelLanguage||c.language||'—'}</b></span><span>Public Videos <b>{c.stats?.videos!=null?formatNumber(c.stats.videos):'—'}</b></span><span>Last Sync <b>{a?.updatedAt?new Date(a.updatedAt).toLocaleString('ru-RU'):'—'}</b></span></div>
    <div className="channelMetricsGrid"><span><small>Subscribers</small><b>{c.stats?.subscribers!=null?formatNumber(c.stats.subscribers):'—'}</b></span><span><small>Total Views</small><b>{c.stats?.views!=null?formatNumber(c.stats.views):'—'}</b></span><span><small>Views 28d</small><b>{a?.periodDays===28?formatNumber(a.views):'—'}</b></span><span><small>Revenue 28d</small><b>{money(rev)}</b></span><span><small>RPM 28d</small><b>{a?.periodDays===28?rpm(rev,a.views):'—'}</b></span><span><small>Scheduled local</small><b>{jobs.filter(j=>j.channelId===c.id&&j.status==='SCHEDULED').length}</b></span></div>
    <div className="channelActions"><button onClick={()=>setPage('youtube')}>Открыть YouTube</button><button onClick={()=>setEditing(editing===c.id?null:c.id)}>{editing===c.id?'Закрыть настройки':'Настроить канал'}</button></div>
    {editing===c.id&&<div className="editGrid channelEdit">
     <label>Название<input value={c.name} onChange={e=>updateChannel(c.id,{name:e.target.value})}/></label><label>Жанр<input value={c.genre} onChange={e=>updateChannel(c.id,{genre:e.target.value})}/></label><label>Язык<input value={c.language} onChange={e=>updateChannel(c.id,{language:e.target.value})}/></label><label>Страна<input value={c.country} onChange={e=>updateChannel(c.id,{country:e.target.value})}/></label>
     <label>Раз в N дней<input type="number" min="1" max="30" value={c.cadenceDays} onChange={e=>updateChannel(c.id,{cadenceDays:+e.target.value||1})}/></label><label>Запас, дней<input type="number" min="7" max="365" value={c.targetBufferDays} onChange={e=>updateChannel(c.id,{targetBufferDays:+e.target.value||60})}/></label>
     <label className="wide">Формулы названий<textarea value={c.seo.titlePatterns.join('\n')} onChange={e=>updateChannel(c.id,{seo:{...c.seo,titlePatterns:e.target.value.split('\n').filter(Boolean)}})}/></label>
     <label className="wide">Шаблон описания<textarea value={c.seo.descriptionTemplate} onChange={e=>updateChannel(c.id,{seo:{...c.seo,descriptionTemplate:e.target.value}})}/></label>
     <label className="wide">Теги<input value={c.seo.tags.join(', ')} onChange={e=>updateChannel(c.id,{seo:{...c.seo,tags:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)}})}/></label>
     <div className="editActions"><button className="danger" onClick={()=>{if(window.confirm(`Удалить ${c.name}? Файлы на диске останутся.`)){removeChannel(c.id);setEditing(null)}}}>Удалить из VYRON YT PEISOV</button><button className="primary" onClick={()=>setEditing(null)}>Готово</button></div>
    </div>}
   </article>
  })}</div>}
 </>
}
