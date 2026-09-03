import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {compareRunwayRecords,type ChannelRunwayRecord} from './channelRunwayCore';
import {loadChannelRunwayStore,subscribeChannelRunway} from './channelRunwayStore';
import {getChannelProductionReadiness,productionForecast,productionReadiness} from './commandCenterCore';
import {defaultChannelProductionPrefs,useProductionPrefs} from './productionPrefs';
import {getChannelScheduleState,scheduleDateLabel} from './channelSchedule';

const dateLabel=(key?:string)=>{if(!key)return'—';const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:'—'};
const statusLabel=(status:ChannelRunwayRecord['status'])=>status==='large'?'Запас есть':status==='plan'?'В план':status==='prepare'?'Пора готовить':status==='urgent'?'Срочно':status==='ended'?'Запас закончился':'Нет данных';

export function CommandCenter(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),setPage=useApp(s=>s.setPage);const [runway,setRunway]=useState(()=>loadChannelRunwayStore());const [prefs,patchPrefs]=useProductionPrefs();
 useEffect(()=>subscribeChannelRunway(()=>setRunway(loadChannelRunwayStore())),[]);
 const active=useMemo(()=>channels.filter(c=>c.enabled),[channels]);
 const targetFor=(id:string)=>Math.max(1,prefs.byChannel[id]?.projectCount||defaultChannelProductionPrefs().projectCount);
 const rows=useMemo(()=>active.map(channel=>({channel,record:runway.channels[channel.id]})).sort((a,b)=>{if(a.record&&b.record)return compareRunwayRecords(a.record,b.record);if(a.record)return-1;if(b.record)return 1;return a.channel.name.localeCompare(b.channel.name,'ru')}),[active,runway]);
 const forecast=productionForecast(active,runway.channels,jobs,Math.max(1,...active.map(c=>targetFor(c.id))),new Date());
 const next=rows.find(x=>x.record?.runwayDays!==undefined&&Number(x.record.runwayDays)<=45)||rows[0];
 const nextReady=next?getChannelProductionReadiness(next.channel,jobs,targetFor(next.channel.id)):null;
 const totalReady=active.reduce((n,c)=>n+productionReadiness(c,jobs,targetFor(c.id)).readyToYoutube,0);
 function openProduction(channelId?:string){if(channelId)patchPrefs({selectedChannelId:channelId});setPage('production')}
 return <section className="panel commandCenter commandCenterSimple">
  <div className="commandCenterHead"><div><small>КОМАНДНЫЙ ЦЕНТР</small><h3>Что делать дальше</h3><p>Показывает, какой канал нужно готовить следующим, сколько контента осталось и что уже готово.</p></div></div>
  {next?<div className="commandToday"><div><small>СЕГОДНЯ</small><h4>{next.channel.name}</h4><p>{next.record?.runwayDays===undefined?'Нет свежих данных о запасе публикаций.':`Видео в запасе примерно на ${next.record.runwayDays} дн.`}</p></div><div className="commandTodayFacts"><span>Запас<b>{next.record?.runwayDays===undefined?'—':`${next.record.runwayDays} дней`}</b></span><span>Готовность{nextReady?<div className="readinessCompact"><b><strong>{nextReady.readyToPublish}</strong><i>/</i><em>{nextReady.targetProjects}</em></b><small>{nextReady.percent}% готово</small><span><i style={{width:`${nextReady.percent}%`}}/></span></div>:<b>—</b>}</span><span>Рекомендация<b>{next.record?.runwayDays!==undefined&&next.record.runwayDays<=14?'Готовить в первую очередь':next.record?.runwayDays!==undefined&&next.record.runwayDays<=45?'Продолжить производство':'Запас пока достаточный'}</b></span></div><button className="primary" onClick={()=>openProduction(next.channel.id)}>Открыть производство</button></div>:<div className="commandEmpty"><b>Нет активных каналов</b><span>Включите канал, чтобы VYRON мог показать производственный приоритет.</span></div>}
  <div className="commandSimpleSummary"><span><small>Активных каналов</small><b>{active.length}</b></span><span><small>Пора готовить</small><b>{forecast.dueNow}</b></span><span><small>Критически мало запаса</small><b>{forecast.critical}</b></span><span><small>Готово к публикации</small><b>{totalReady}</b></span></div>
  <div className="commandBlock networkPlan"><div className="commandBlockHead"><div><small>КАНАЛЫ</small><h4>Очередь производства</h4></div><span>{rows.length}</span></div><div className="commandTable"><div className="commandRow commandTh"><span>Канал</span><span>Запас видео</span><span>Следующее производство</span><span>Готовность</span><span>Статус</span></div>{rows.map(({channel,record})=>{const ready=getChannelProductionReadiness(channel,jobs,targetFor(channel.id));const runwayDays=record?.runwayDays;const status:ChannelRunwayRecord['status']=record?.status||'no-data';const localSchedule=getChannelScheduleState(channel.id,channel);return <button className="commandRow commandChannelRow" key={channel.id} onClick={()=>openProduction(channel.id)}><span><b>{channel.name}</b><small>{localSchedule.lastScheduledAt?`Запланировано до ${scheduleDateLabel(localSchedule.lastScheduledAt)}`:record?.scheduledUntil?`Запланировано до ${dateLabel(record.scheduledUntil)}`:'Расписание ещё не подтверждено'}</small></span><span className={`commandRunway ${status}`}>{runwayDays===undefined?'—':`${runwayDays} дн.`}</span><span>{runwayDays===undefined?'—':runwayDays<=45?'Сейчас':dateLabel(record?.nextProductionDate)}</span><span><div className="readinessCompact tableReady"><b><strong>{ready.readyToPublish}</strong><i>/</i><em>{ready.targetProjects}</em></b><small>{ready.percent}% • готово к публикации</small><span><i style={{width:`${ready.percent}%`}}/></span></div></span><span>{statusLabel(status)}</span></button>})}</div></div>
  <div className="commandFootNote">Данные этого экрана берутся из локально сохранённого расписания и Production. Переход на экран сам по себе не запускает синхронизацию YouTube.</div>
 </section>
}
