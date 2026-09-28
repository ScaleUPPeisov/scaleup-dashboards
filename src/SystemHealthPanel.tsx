import React,{useMemo,useState} from 'react';
import {useApp} from './store';
import {useLiveInventory} from './renderInventoryRuntime';
import {useUpdaterRuntime} from './updaterRuntime';
import {youtubeQuotaUsage} from './youtubeQuota';
import {buildSystemHealth} from './systemHealth';
import type {YoutubeProfile} from './types';

const icon=(s:string)=>s==='GREEN'?'🟢':s==='YELLOW'?'🟡':s==='RED'?'🔴':'⚪';

export function SystemHealthPanel({profiles}:{profiles:YoutubeProfile[]}){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),settings=useApp(s=>s.settings),booted=useApp(s=>s.booted),snapshots=useLiveInventory(s=>s.snapshots),updaterStatus=useUpdaterRuntime(s=>s.status);
 const [open,setOpen]=useState(false);
 const quota=youtubeQuotaUsage();
 const health=useMemo(()=>buildSystemHealth({channels,profiles,snapshots,jobs,updaterStatus,quotaUsed:quota.used,quotaLimit:quota.limit,workspace:settings.workspace,endlumePath:settings.endlumePath,booted}),[channels,profiles,snapshots,jobs,updaterStatus,quota.used,quota.limit,settings.workspace,settings.endlumePath,booted]);
 return <section className="opsCard systemHealthCard">
   <div className="opsCardHead"><div><small>SYSTEM HEALTH</small><h2>{health.score}%</h2></div><button onClick={()=>setOpen(x=>!x)}>{open?'Скрыть':'Подробнее'}</button></div>
   <div className="systemHealthSummary">{health.items.map(x=><span key={x.id} title={x.detail}><b>{icon(x.state)}</b><small>{x.label}</small></span>)}</div>
   {open&&<div className="systemHealthDetails">{health.items.map(x=><article key={x.id}><b>{icon(x.state)} {x.label}</b><span>{x.detail}</span><small>Вес {x.weight}%</small></article>)}</div>}
   <p className="opsSourceNote">Панель использует уже загруженное локальное/cached состояние и сама не запускает YouTube API refresh.</p>
 </section>
}
