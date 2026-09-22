import React,{useMemo,useState} from 'react';
import {ScheduleOS} from './ScheduleOS';
import {ModalPortal} from './ModalPortal';
import {useApp} from './store';
import type {VideoJob} from './types';

type View='calendar'|'bulk';
const statusLabel:Record<string,string>={NEED_IMAGE:'Нужны материалы',WAITING_MUSIC:'Ждёт музыку',READY_RENDER:'Готов к рендеру',RENDERING:'Рендерится',READY_UPLOAD:'Готов к YouTube',UPLOADING:'Загружается',SCHEDULED:'Запланировано',ERROR:'Нужно внимание'};
const dateKey=(iso:string)=>new Date(iso).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
const time=(iso:string)=>new Date(iso).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
export function ScheduleWorkspace(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs);
 const [view,setView]=useState<View>('calendar'),[selected,setSelected]=useState<VideoJob|null>(null);
 const rows=useMemo(()=>jobs.filter(j=>Boolean(j.publishAt)&&Number.isFinite(Date.parse(j.publishAt!))).slice().sort((a,b)=>Date.parse(a.publishAt!)-Date.parse(b.publishAt!)),[jobs]);
 const future=rows.filter(j=>Date.parse(j.publishAt!)>=Date.now()-86400000);
 const grouped=useMemo(()=>{const map=new Map<string,VideoJob[]>();for(const row of future){const key=dateKey(row.publishAt!);map.set(key,[...(map.get(key)||[]),row])}return [...map.entries()]},[future]);
 return <section className={'scheduleWorkspace scheduleView-'+view}>
   <div className="settingsTabs osTabs scheduleWorkspaceTabs"><button className={view==='calendar'?'active':''} onClick={()=>setView('calendar')}>Календарь</button><button className={view==='bulk'?'active':''} onClick={()=>setView('bulk')}>Массовое изменение</button></div>
   <div className="scheduleCalendarPanel">
    <div className="panelHead"><div><small>РАСПИСАНИЕ</small><h3>Календарь публикаций</h3><p>Будущие публикации по сохранённым каналам. Нажмите видео, чтобы открыть изменение расписания.</p></div><span>{future.length} публикаций</span></div>
    {grouped.length?<div className="scheduleCalendarGroups">{grouped.map(([day,items])=><section className="panel" key={day}><div className="panelHead"><div><small>ДАТА</small><h3>{day}</h3></div><b>{items.length}</b></div><div className="scheduleCalendarRows">{items.map(j=>{const c=channels.find(x=>x.id===j.channelId);return <button key={j.id} onClick={()=>setSelected(j)}><span><small>Время</small><strong>{time(j.publishAt!)}</strong></span><span><small>{c?.name||'Канал удалён'} • VIDEO_{String(j.number).padStart(3,'0')}</small><strong>{j.title||'Без названия'}</strong></span><span><small>Статус</small><em>{statusLabel[j.status]||j.status}</em></span></button>})}</div></section>)}</div>:<div className="empty compactEmpty"><i>◇</i><h3>Будущих публикаций нет</h3><p>Перейдите в «Массовое изменение», чтобы назначить даты или продолжить расписание канала.</p><button className="primary" onClick={()=>setView('bulk')}>Открыть массовое изменение</button></div>}
   </div>
   <div className="scheduleBulkPanel"><ScheduleOS/></div>
   {selected&&<ModalPortal onClose={()=>setSelected(null)}><section className="confirmModal scheduleEditModal" onMouseDown={e=>e.stopPropagation()}><small>ПУБЛИКАЦИЯ</small><h2>{selected.title||'VIDEO_'+String(selected.number).padStart(3,'0')}</h2><p>{channels.find(x=>x.id===selected.channelId)?.name||'Канал'} • {dateKey(selected.publishAt!)} в {time(selected.publishAt!)}</p><div className="settingsInfoGrid"><span><small>Статус</small><b>{statusLabel[selected.status]||selected.status}</b></span><span><small>VIDEO</small><b>VIDEO_{String(selected.number).padStart(3,'0')}</b></span></div><footer><button onClick={()=>setSelected(null)}>Закрыть</button><button className="primary" onClick={()=>{setSelected(null);setView('bulk')}}>Изменить расписание</button></footer></section></ModalPortal>}
  </section>;
}
