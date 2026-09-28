import React,{useMemo,useState} from 'react';
import {ScheduleOS} from './ScheduleOS';
import {ModalPortal} from './ModalPortal';
import {useApp} from './store';
import {ownerScheduledItems} from './youtubeOwnerInventory';

type View='calendar'|'bulk';
type OwnerScheduleRow={id:string;channelId:string;channelName:string;title:string;publishAt:string};
const dateKey=(iso:string)=>new Date(iso).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
const time=(iso:string)=>new Date(iso).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});

export function ScheduleWorkspace(){
 const channels=useApp(s=>s.channels),ownerYoutubeInventory=useApp(s=>s.ownerYoutubeInventory);
 const [view,setView]=useState<View>('calendar'),[selected,setSelected]=useState<OwnerScheduleRow|null>(null);
 const rows=useMemo(()=>channels.flatMap(channel=>ownerScheduledItems(ownerYoutubeInventory[channel.id]).map(video=>({
   id:video.id,channelId:channel.id,channelName:channel.name,title:video.title,publishAt:video.publishAt
 }))).filter(x=>Number.isFinite(Date.parse(x.publishAt))).sort((a,b)=>Date.parse(a.publishAt)-Date.parse(b.publishAt)),[channels,ownerYoutubeInventory]);
 const future=useMemo(()=>rows.filter(x=>Date.parse(x.publishAt)>=Date.now()-60_000),[rows]);
 const grouped=useMemo(()=>{const map=new Map<string,OwnerScheduleRow[]>();for(const row of future){const key=dateKey(row.publishAt);map.set(key,[...(map.get(key)||[]),row])}return [...map.entries()]},[future]);

 return <section className={'scheduleWorkspace scheduleView-'+view}>
   <div className="settingsTabs osTabs scheduleWorkspaceTabs">
    <button className={view==='calendar'?'active':''} onClick={()=>setView('calendar')}>YouTube расписание</button>
    <button className={view==='bulk'?'active':''} onClick={()=>setView('bulk')}>Локальный план VYRON</button>
   </div>
   <div className="scheduleCalendarPanel">
    <div className="panelHead"><div><small>YOUTUBE • OWNER AUTHORIZED</small><h3>Реальное расписание YouTube</h3><p>Только видео, которые уже физически загружены на YouTube и имеют реальный future publishAt. Локальные Render-файлы и очередь сюда не попадают.</p></div><span>{future.length} scheduled</span></div>
    {grouped.length?<div className="scheduleCalendarGroups">{grouped.map(([day,items])=><section className="panel" key={day}><div className="panelHead"><div><small>ДАТА YOUTUBE</small><h3>{day}</h3></div><b>{items.length}</b></div><div className="scheduleCalendarRows">{items.map(row=><button key={row.channelId+':'+row.id} onClick={()=>setSelected(row)}><span><small>Время</small><strong>{time(row.publishAt)}</strong></span><span><small>{row.channelName} • YouTube ID {row.id}</small><strong>{row.title||'Без названия'}</strong></span><span><small>Статус</small><em>YOUTUBE SCHEDULED</em></span></button>)}</div></section>)}</div>:<div className="empty compactEmpty"><i>◇</i><h3>На YouTube нет подтверждённых будущих публикаций</h3><p>Локальные готовые видео и очередь VYRON считаются отдельно. Дождитесь owner-sync или откройте локальный план.</p><button className="primary" onClick={()=>setView('bulk')}>Открыть локальный план VYRON</button></div>}
   </div>
   <div className="scheduleBulkPanel"><div className="panelHead"><div><small>LOCAL VYRON PLAN</small><h3>Локальное планирование</h3><p>Здесь можно подготовить даты до загрузки. Эти строки не считаются реальным YouTube schedule, пока видео физически не загружено на YouTube.</p></div></div><ScheduleOS/></div>
   {selected&&<ModalPortal onClose={()=>setSelected(null)}><section className="confirmModal scheduleEditModal" onMouseDown={e=>e.stopPropagation()}><small>YOUTUBE SCHEDULED</small><h2>{selected.title||selected.id}</h2><p>{selected.channelName} • {dateKey(selected.publishAt)} в {time(selected.publishAt)}</p><div className="settingsInfoGrid"><span><small>Статус</small><b>YOUTUBE SCHEDULED</b></span><span><small>YouTube ID</small><b>{selected.id}</b></span></div><footer><button className="primary" onClick={()=>setSelected(null)}>Закрыть</button></footer></section></ModalPortal>}
  </section>;
}
