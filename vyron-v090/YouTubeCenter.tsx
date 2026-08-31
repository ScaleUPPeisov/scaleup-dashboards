import React,{useMemo,useState} from 'react';
import {ExistingVideos} from './ExistingVideos';
import {MetadataPage} from './MetadataPage';
import {PublisherOS} from './PublisherOS';
import {useApp} from './store';

type Tab='uploaded'|'metadata'|'queue'|'calendar';

export function YouTubeCenter({initialTab='uploaded'}:{initialTab?:Tab}){
 const [tab,setTab]=useState<Tab>(initialTab);
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs);
 const calendar=useMemo(()=>jobs.filter(j=>j.publishAt&&['READY_UPLOAD','UPLOADING','SCHEDULED','ERROR'].includes(j.status)).sort((a,b)=>(a.publishAt||'').localeCompare(b.publishAt||'')),[jobs]);
 return <>
  <div className="youtubeCenterHead"><div><small>YOUTUBE CENTER</small><h1>YouTube</h1><p>Загруженные ролики, метаданные, очередь и календарь — в одном месте.</p></div><div className="youtubeTabs"><button className={tab==='uploaded'?'active':''} onClick={()=>setTab('uploaded')}>Загруженные</button><button className={tab==='metadata'?'active':''} onClick={()=>setTab('metadata')}>Метаданные</button><button className={tab==='queue'?'active':''} onClick={()=>setTab('queue')}>Очередь</button><button className={tab==='calendar'?'active':''} onClick={()=>setTab('calendar')}>Календарь</button></div></div>
  {tab==='uploaded'&&<ExistingVideos/>}
  {tab==='metadata'&&<MetadataPage/>}
  {tab==='queue'&&<PublisherOS/>}
  {tab==='calendar'&&<section className="panel calendarPanel"><div className="panelHead"><div><small>ALL CHANNELS</small><h3>Календарь публикаций</h3><p>Только реальные даты из project state / YouTube queue.</p></div><span>{calendar.length} публикаций</span></div>{calendar.length===0?<div className="empty"><b>Публикаций пока нет</b><p>Когда у видео появится publishAt, оно будет показано здесь.</p></div>:<div className="calendarList">{calendar.map(j=>{const c=channels.find(x=>x.id===j.channelId);return <div className="calendarRow" key={j.id}><time>{new Date(j.publishAt!).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</time><span><b>{c?.name||'Канал удалён'}</b><small>VIDEO_{String(j.number).padStart(3,'0')} • {j.title||'Без названия'}</small></span><em className={`publishState ${j.status.toLowerCase()}`}>{j.status}</em>{j.youtubeVideoId&&<small>YT: {j.youtubeVideoId}</small>}</div>})}</div>}</section>}
 </>;
}
