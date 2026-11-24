import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {useLiveInventory} from './renderInventoryRuntime';
import {useUpdaterRuntime} from './updaterRuntime';
import {youtubeQuotaUsage} from './youtubeQuota';
import {buildSystemHealth} from './systemHealth';
import type {YoutubeProfile} from './types';

const stateLabel=(s:string)=>s==='GREEN'?'Норма':s==='YELLOW'?'Внимание':s==='RED'?'Ошибка':'Нет данных';

export function SystemHealthPanel({profiles}:{profiles:YoutubeProfile[]}){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),settings=useApp(s=>s.settings),booted=useApp(s=>s.booted),snapshots=useLiveInventory(s=>s.snapshots),updaterStatus=useUpdaterRuntime(s=>s.status);
 const [open,setOpen]=useState(false);
 useEffect(()=>{const fn=()=>{setOpen(true);window.requestAnimationFrame(()=>document.getElementById('vyron-system-health')?.scrollIntoView({behavior:'smooth',block:'center'}))};window.addEventListener('vyron:open-system-health',fn);return()=>window.removeEventListener('vyron:open-system-health',fn)},[]);
 const quota=youtubeQuotaUsage();
 const health=useMemo(()=>buildSystemHealth({channels,profiles,snapshots,jobs,updaterStatus,quotaUsed:quota.used,quotaLimit:quota.limit,workspace:settings.workspace,endlumePath:settings.endlumePath,booted}),[channels,profiles,snapshots,jobs,updaterStatus,quota.used,quota.limit,settings.workspace,settings.endlumePath,booted]);
 return <section id="vyron-system-health" className="opsCard systemHealthCard">
   <div className="opsCardHead"><div><h2>Состояние системы</h2><strong className="healthScore">{health.score}%</strong></div><button aria-expanded={open} aria-controls="vyron-system-health-details" onClick={()=>setOpen(x=>!x)}>{open?'Скрыть':'Подробнее'}</button></div>
   <div className="systemHealthSummary">{health.items.map(x=><span key={x.id} title={x.detail}><b className={`healthState healthState--${x.state.toLowerCase()}`}>{stateLabel(x.state)}</b><small>{x.label}</small></span>)}</div>
   {open&&<div id="vyron-system-health-details" className="systemHealthDetails">{health.items.map(x=><article key={x.id}><b>{stateLabel(x.state)}: {x.label}</b><span>{x.detail}</span><small>Вес {x.weight}%</small></article>)}</div>}
   <details className="dashboardSourceDetails"><summary>Источник данных</summary><p>Сохранённое состояние. Панель не запускает обновление YouTube API.</p></details>
 </section>
}
