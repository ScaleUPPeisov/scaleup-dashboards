import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {compareRunwayRecords,type ChannelRunwayRecord} from './channelRunwayCore';
import {loadChannelRunwayStore,subscribeChannelRunway} from './channelRunwayStore';
import {getChannelProductionReadiness,indexJobsByChannel,productionRunwayRecommendation,productionUrgencySummary} from './commandCenterCore';
import {defaultChannelProductionPrefs,useProductionPrefs} from './productionPrefs';
import {getChannelScheduleState,scheduleDateLabel,scheduleDescription} from './channelSchedule';
import type {VideoJob} from './types';
import './command-center-apex.css';

const dateLabel=(key?:string)=>{if(!key)return'—';const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:'—'};
const statusLabel=(status:ChannelRunwayRecord['status'])=>status==='large'?'Запас есть':status==='plan'?'В план':status==='prepare'?'Пора готовить':status==='urgent'?'Срочно':status==='ended'?'Запас закончился':'Нет данных';
const EMPTY_JOBS:VideoJob[]=[];

export function CommandCenter(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),setPage=useApp(s=>s.setPage);const [runway,setRunway]=useState(()=>loadChannelRunwayStore());const [prefs,patchPrefs]=useProductionPrefs();
 useEffect(()=>subscribeChannelRunway(()=>setRunway(loadChannelRunwayStore())),[]);
 const active=useMemo(()=>channels.filter(c=>c.enabled),[channels]);
 const targetFor=(id:string)=>Math.max(1,prefs.byChannel[id]?.projectCount||defaultChannelProductionPrefs().projectCount);
 const jobsByChannel=useMemo(()=>indexJobsByChannel(jobs),[jobs]);
 const readiness=useMemo(()=>new Map(active.map(channel=>[channel.id,getChannelProductionReadiness(channel,jobsByChannel.get(channel.id)||EMPTY_JOBS,targetFor(channel.id))])),[active,jobsByChannel,prefs.byChannel]);
 const rows=useMemo(()=>active.map(channel=>({channel,record:runway.channels[channel.id]})).sort((a,b)=>{if(a.record&&b.record)return compareRunwayRecords(a.record,b.record);if(a.record)return-1;if(b.record)return 1;return a.channel.name.localeCompare(b.channel.name,'ru')}),[active,runway]);
 const forecast=useMemo(()=>productionUrgencySummary(active,runway.channels),[active,runway.channels]);
 const next=rows.find(x=>x.record?.runwayDays!==undefined&&Number(x.record.runwayDays)<=45)||rows[0];
 const nextReady=next?readiness.get(next.channel.id):null;
 const totalReady=active.reduce((n,c)=>n+(readiness.get(c.id)?.readyToPublish||0),0);
 function openProduction(channelId?:string){if(channelId)patchPrefs({selectedChannelId:channelId});setPage('production')}
 return <section className="commandApex" aria-labelledby="command-title">
  <header className="commandApexHeader"><div><small>КОМАНДНЫЙ ЦЕНТР</small><h2 id="command-title">Приоритеты производства</h2><p>Каналы, которым скоро понадобятся новые видео</p></div></header>
  {next?<section className="commandApexPriority" aria-labelledby="command-priority-title"><div><small>СЛЕДУЮЩИЙ КАНАЛ</small><h3 id="command-priority-title">{next.channel.name}</h3><p>{next.record?.runwayDays===undefined?'Нет подтверждённых данных о запасе.':`Запаса примерно на ${next.record.runwayDays} дней`}</p></div><div className="commandApexPriorityFacts"><span>Готово к публикации<strong>{nextReady?`${nextReady.readyToPublish} / ${nextReady.targetProjects}`:'—'}</strong></span><span>График<strong>{scheduleDescription(next.channel)}</strong></span><span>Рекомендация<strong>{productionRunwayRecommendation(next.record?.runwayDays)}</strong></span></div><button className="primary" onClick={()=>openProduction(next.channel.id)}>Открыть производство</button></section>:<div className="commandApexEmpty"><strong>Нет активных каналов</strong><span>Включите канал, чтобы увидеть приоритет производства.</span></div>}
  <section className="commandApexSummary" aria-label="Сводка производства"><div><small>Активные каналы</small><strong>{active.length}</strong></div><div><small>Пора готовить</small><strong>{forecast.dueNow}</strong></div><div><small>Критически мало запаса</small><strong>{forecast.critical}</strong></div><div><small>Готово к публикации</small><strong>{totalReady}</strong></div></section>
  <section className="commandApexChannels" aria-labelledby="command-channels-title"><div className="commandApexSectionHead"><div><h3 id="command-channels-title">Очередь производства</h3><p>Каналы упорядочены по приоритету</p></div><span>{rows.length} каналов</span></div><div className="commandApexRows">{rows.map(({channel,record})=>{const ready=readiness.get(channel.id)!;const runwayDays=record?.runwayDays;const status:ChannelRunwayRecord['status']=record?.status||'no-data';const localSchedule=getChannelScheduleState(channel.id,channel);return <button className="commandApexRow" key={channel.id} onClick={()=>openProduction(channel.id)}><span className="commandApexIdentity"><strong>{channel.name}</strong><small>{localSchedule.lastScheduledAt?`Запланировано до ${scheduleDateLabel(localSchedule.lastScheduledAt)}`:record?.scheduledUntil?`Запланировано до ${dateLabel(record.scheduledUntil)}`:'Расписание ещё не подтверждено'}</small><small>График: {scheduleDescription(channel)}</small></span><span><small>Запас</small><strong>{runwayDays===undefined?'—':`${runwayDays} дн.`}</strong></span><span><small>Производство</small><strong>{runwayDays===undefined?'—':runwayDays<=45?'Сейчас':dateLabel(record?.nextProductionDate)}</strong></span><span><small>Готовность</small><strong>{ready.readyToPublish} / {ready.targetProjects}</strong><small>{ready.percent}% готово к публикации</small></span><span><small>Состояние</small><strong>{statusLabel(status)}</strong></span></button>})}</div></section>
 </section>
}
