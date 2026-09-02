import React,{useMemo,useState} from 'react';
import {ExistingVideos} from './ExistingVideos';
import {MetadataPage} from './MetadataPage';
import {PublisherOS} from './PublisherOS';
import {AccountsPage} from './AccountsPage';
import {YouTubeDataTools} from './YouTubeDataTools';
import {ChannelRunway} from './ChannelRunway';
import {useApp} from './store';
import {QuotaMeter} from './QuotaMeter';

type Tab='uploaded'|'metadata'|'queue'|'calendar'|'runway'|'data'|'accounts';
export function YouTubeCenter({initialTab='uploaded'}:{initialTab?:Tab}){
 const [tab,setTab]=useState<Tab>(initialTab);const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs);
 const calendar=useMemo(()=>jobs.filter(j=>j.publishAt&&['READY_UPLOAD','UPLOADING','SCHEDULED','ERROR'].includes(j.status)).sort((a,b)=>(a.publishAt||'').localeCompare(b.publishAt||'')),[jobs]);
 const tabs:[Tab,string][]=[['uploaded','Загруженные'],['metadata','Метаданные'],['queue','Очередь'],['calendar','Календарь'],['runway','План каналов'],['data','Данные YouTube'],['accounts','Аккаунты']];
 return <><div className="youtubeCenterHead"><div><small>YOUTUBE CENTER • API ZONE</small><h1>YouTube</h1><p>Единственная зона VYRON, где разрешены YouTube API-вызовы. Синхронизация и обновления запускаются только твоим действием.</p></div><div className="youtubeTabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div></div><QuotaMeter compact defaultChannels={Math.max(1,channels.length)}/><div className="youtubePolicyNotice"><b>ZERO HIDDEN QUOTA</b><span>Нет startup sync, polling, background refresh или API-запросов при возврате на вкладку.</span></div>{tab==='uploaded'&&<ExistingVideos/>}{tab==='metadata'&&<MetadataPage/>}{tab==='queue'&&<PublisherOS/>}{tab==='runway'&&<ChannelRunway/>}{tab==='data'&&<YouTubeDataTools/>}{tab==='accounts'&&<AccountsPage/>}{tab==='calendar'&&<section className="panel calendarPanel"><div className="panelHead"><div><small>ALL CHANNELS</small><h3>Календарь публикаций</h3><p>Локальные даты из project state / YouTube queue.</p></div><span>{calendar.length} публикаций</span></div>{calendar.length===0?<div className="empty"><b>Публикаций пока нет</b><p>Когда у видео появится publishAt, оно будет показано здесь.</p></div>:<div className="calendarList">{calendar.map(j=>{const c=channels.find(x=>x.id===j.channelId);return <div className="calendarRow" key={j.id}><time>{new Date(j.publishAt!).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</time><span><b>{c?.name||'Канал удалён'}</b><small>VIDEO_{String(j.number).padStart(3,'0')} • {j.title||'Без названия'}</small></span><em className={`publishState ${j.status.toLowerCase()}`}>{j.status}</em>{j.youtubeVideoId&&<small>YT: {j.youtubeVideoId}</small>}</div>})}</div>}</section>}</>
}
