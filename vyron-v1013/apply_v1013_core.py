#!/usr/bin/env python3
from pathlib import Path
import json,re

VERSION='1.0.13'
def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.13 core: '+msg)

# ---- exact release version bump ------------------------------------------------
p=Path('package.json'); package=json.loads(p.read_text()); must(package.get('version')=='1.0.12','expected package 1.0.12'); package['version']=VERSION; p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/tauri.conf.json'); conf=json.loads(p.read_text()); must(conf.get('version')=='1.0.12','expected tauri 1.0.12'); conf['version']=VERSION; p.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/Cargo.toml'); s=p.read_text(); must('version = "1.0.12"' in s,'expected Cargo 1.0.12'); p.write_text(s.replace('version = "1.0.12"','version = "1.0.13"',1))
p=Path('package-lock.json')
if p.exists():
    x=json.loads(p.read_text())
    if x.get('version')=='1.0.12': x['version']=VERSION
    if isinstance(x.get('packages'),dict) and isinstance(x['packages'].get(''),dict) and x['packages'][''].get('version')=='1.0.12': x['packages']['']['version']=VERSION
    p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')

# ---- one global notification bus ----------------------------------------------
Path('src/notificationCenter.ts').write_text(r'''export type NotificationType='success'|'info'|'warning'|'error';
export type NotificationAction={label:string;onClick:()=>void;closeAfter?:boolean};
export type AppNotification={id:string;operationId?:string;type:NotificationType;title:string;message?:string;durationMs:number|null;actions:NotificationAction[];createdAt:number};
export type NotificationOptions={operationId?:string;durationMs?:number|null;actions?:NotificationAction[]};
const EVENT='vyron:notification-center';
const seen=new Map<string,number>();
const defaults:Record<NotificationType,number|null>={success:5000,info:7000,warning:9000,error:null};
function cleanSeen(now:number){for(const[k,t]of seen)if(now-t>60*60_000)seen.delete(k);if(seen.size>500){for(const k of [...seen.keys()].slice(0,seen.size-400))seen.delete(k)}}
export function notify(type:NotificationType,title:string,message='',options:NotificationOptions={}){
  const now=Date.now();cleanSeen(now);
  if(options.operationId){if(seen.has(options.operationId))return;seen.set(options.operationId,now)}
  const detail:AppNotification={id:crypto.randomUUID(),operationId:options.operationId,type,title,message,durationMs:options.durationMs===undefined?defaults[type]:options.durationMs,actions:options.actions||[],createdAt:now};
  window.dispatchEvent(new CustomEvent<AppNotification>(EVENT,{detail}));
}
export const notifySuccess=(title:string,message='',options:NotificationOptions={})=>notify('success',title,message,options);
export const notifyInfo=(title:string,message='',options:NotificationOptions={})=>notify('info',title,message,options);
export const notifyWarning=(title:string,message='',options:NotificationOptions={})=>notify('warning',title,message,options);
export const notifyError=(title:string,message='',options:NotificationOptions={})=>notify('error',title,message,options);
export function notifyLegacy(message:string){
  const m=String(message||'').trim();if(!m)return;
  const lower=m.toLocaleLowerCase('ru-RU');
  if(m.startsWith('✓'))return notifySuccess(m.replace(/^✓\s*/,''));
  if(m.startsWith('⚠')||m.startsWith('⏸')||lower.includes('недостаточно')||lower.includes('квота'))return notifyWarning(m.replace(/^[⚠⏸]\s*/,''));
  if(m.startsWith('✕')||lower.includes('не удалось')||lower.includes('ошиб')||lower.includes('недоступ'))return notifyError(m.replace(/^✕\s*/,''));
  notifyInfo(m);
}
export function subscribeNotifications(cb:(n:AppNotification)=>void){const fn=(e:Event)=>cb((e as CustomEvent<AppNotification>).detail);window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)}
''')

Path('src/NotificationCenter.tsx').write_text(r'''import React,{useEffect,useRef,useState} from 'react';
import {subscribeNotifications,type AppNotification} from './notificationCenter';
const MAX_VISIBLE=4;
function ToastCard({item,onClose}:{item:AppNotification;onClose:()=>void}){
  const timer=useRef<number|undefined>(),remaining=useRef(item.durationMs??0),started=useRef(0);
  const start=()=>{if(item.durationMs===null||remaining.current<=0)return;started.current=Date.now();timer.current=window.setTimeout(onClose,remaining.current)};
  const pause=()=>{if(timer.current!==undefined){window.clearTimeout(timer.current);timer.current=undefined;remaining.current=Math.max(0,remaining.current-(Date.now()-started.current))}};
  useEffect(()=>{start();return()=>{if(timer.current!==undefined)window.clearTimeout(timer.current)}},[]);
  return <article className={`vyronNotice ${item.type}`} onMouseEnter={pause} onMouseLeave={start}>
    <i className="vyronNoticeIcon">{item.type==='success'?'✓':item.type==='warning'?'⚠':item.type==='error'?'✕':'ℹ'}</i>
    <div className="vyronNoticeText"><b>{item.title}</b>{item.message&&<p>{item.message}</p>}{item.actions.length>0&&<div className="vyronNoticeActions">{item.actions.map((a,i)=><button key={i} onClick={()=>{a.onClick();if(a.closeAfter!==false)onClose()}}>{a.label}</button>)}</div>}</div>
    <button className="vyronNoticeClose" onClick={onClose} aria-label="Закрыть">×</button>
  </article>
}
export function NotificationCenter(){
  const [visible,setVisible]=useState<AppNotification[]>([]);const queue=useRef<AppNotification[]>([]);
  const fill=(rows:AppNotification[])=>{const next=[...rows];while(next.length<MAX_VISIBLE&&queue.current.length)next.push(queue.current.shift()!);return next};
  useEffect(()=>subscribeNotifications(n=>setVisible(rows=>{if(rows.some(x=>x.operationId&&x.operationId===n.operationId))return rows;if(rows.length<MAX_VISIBLE)return[...rows,n];queue.current.push(n);return rows})),[]);
  const close=(id:string)=>setVisible(rows=>fill(rows.filter(x=>x.id!==id)));
  return <aside className="vyronNotificationCenter" aria-live="polite">{visible.map(x=><ToastCard key={x.id} item={x} onClose={()=>close(x.id)}/>)}</aside>
}
''')

# ---- legacy toast calls now route into the one notification center -------------
p=Path('src/store.ts'); s=p.read_text();
must("import { generateMetadata, slugify } from './core';" in s,'store import marker missing')
s=s.replace("import { generateMetadata, slugify } from './core';","import { generateMetadata, slugify } from './core';\nimport {notifyLegacy} from './notificationCenter';",1)
old="toast:notice=>{set({notice});window.setTimeout(()=>{if(get().notice===notice)set({notice:undefined})},2800)}"
must(old in s,'legacy toast implementation missing');s=s.replace(old,"toast:notice=>{notifyLegacy(notice)}",1);p.write_text(s)

# ---- Command Center readiness domain -------------------------------------------
p=Path('src/commandCenterCore.ts'); s=p.read_text()
insert=r'''
export type ChannelProductionReadiness={
  channelId:string;targetProjects:number;createdProjects:number;renderedVideos:number;readyToPublish:number;percent:number;
  covers:number;music:number;seo:number;schedule:number;errors:number;
};
export function getChannelProductionReadiness(channel:Channel,jobs:VideoJob[],target:number):ChannelProductionReadiness{
  const base=productionReadiness(channel,jobs,target);const rows=jobs.filter(j=>j.channelId===channel.id);
  const percent=Math.max(0,Math.min(100,Math.round((base.readyToYoutube/base.target)*100)));
  return{channelId:channel.id,targetProjects:base.target,createdProjects:rows.length,renderedVideos:base.videos,readyToPublish:base.readyToYoutube,percent,covers:base.covers,music:base.music,seo:base.seo,schedule:base.schedule,errors:base.errors};
}
'''
marker='export function buildAttentionItems('
must(marker in s,'commandCenter insert marker missing');s=s.replace(marker,insert+'\n'+marker,1);p.write_text(s)

p=Path('src/CommandCenter.tsx'); s=p.read_text()
s=s.replace("import {productionForecast,productionReadiness} from './commandCenterCore';","import {getChannelProductionReadiness,productionForecast,productionReadiness} from './commandCenterCore';",1)
s=s.replace("const nextReady=next?productionReadiness(next.channel,jobs,targetFor(next.channel.id)):null;","const nextReady=next?getChannelProductionReadiness(next.channel,jobs,targetFor(next.channel.id)):null;",1)
s=s.replace("<span>Готовность<b>{nextReady?`${nextReady.videos} из ${nextReady.target}`:'—'}</b></span>","<span>Готовность{nextReady?<div className=\"readinessCompact\"><b><strong>{nextReady.readyToPublish}</strong><i>/</i><em>{nextReady.targetProjects}</em></b><small>{nextReady.percent}% готово</small><span><i style={{width:`${nextReady.percent}%`}}/></span></div>:<b>—</b>}</span>",1)
old="const ready=productionReadiness(channel,jobs,targetFor(channel.id));const runwayDays=record?.runwayDays;"
new="const ready=getChannelProductionReadiness(channel,jobs,targetFor(channel.id));const runwayDays=record?.runwayDays;"
must(old in s,'CommandCenter row readiness marker missing');s=s.replace(old,new,1)
old="<span><b>{ready.videos} из {ready.target}</b><small>{ready.readyToYoutube} полностью готовы</small></span>"
new="<span><div className=\"readinessCompact tableReady\"><b><strong>{ready.readyToPublish}</strong><i>/</i><em>{ready.targetProjects}</em></b><small>{ready.percent}% • готово к публикации</small><span><i style={{width:`${ready.percent}%`}}/></span></div></span>"
must(old in s,'CommandCenter readiness cell missing');s=s.replace(old,new,1);p.write_text(s)

# ---- App: global notifications + correct runtime version + update success -------
p=Path('src/App.tsx'); s=p.read_text()
must("import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';" in s,'App notification import marker missing')
s=s.replace("import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';","import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';\nimport {NotificationCenter} from './NotificationCenter';\nimport {notifyError,notifyInfo,notifySuccess} from './notificationCenter';\nimport {RecoveryGate} from './RecoveryGate';",1)
old="const run=()=>api.checkUpdate().then(u=>{if(live&&u?.version){setUpdate(u);void notifyUpdateAvailable(String(u.version))}}).catch(()=>{});"
new="const run=()=>api.checkUpdate().then(u=>{if(live&&u?.version){setUpdate(u);notifyInfo(`Доступно обновление VYRON ${u.version}`,'Новая версия готова к установке.',{operationId:`update-available:${u.version}`});void notifyUpdateAvailable(String(u.version))}}).catch(()=>{});"
must(old in s,'App update check marker missing');s=s.replace(old,new,1)
# Startup confirmation after successful updater relaunch.
marker="useEffect(()=>{document.documentElement.classList.toggle('reduceMotion',settings.reduceMotion)},[settings.reduceMotion]);"
must(marker in s,'App reduceMotion marker missing');s=s.replace(marker,"useEffect(()=>{if(!booted)return;void api.appVersion().then(v=>{const expected=localStorage.getItem('vyron:update-installing-version');if(expected&&expected===v){localStorage.removeItem('vyron:update-installing-version');notifySuccess('Обновление установлено',`VYRON обновлён до версии ${v}.`,{operationId:`update-installed:${v}`})}})},[booted]);\n  "+marker,1)
old="return <div className=\"appShell\"><ChannelRunwayScheduler/><ProductionStatusBridge/><Sidebar page={page} setPage={setPage}/><main className=\"main\"><Topbar/><div className=\"pageWrap\" key={page}>{screen}</div></main>{settings.fpsMonitor&&<FpsMonitor/>}{notice&&<div className=\"toast\">{notice}</div>}{update&&<UpdateNotice update={update} onLater={()=>setUpdate(null)}/>}<div className=\"bgGlow a\"/><div className=\"bgGlow b\"/></div>"
new="return <div className=\"appShell\"><ChannelRunwayScheduler/><ProductionStatusBridge/><RecoveryGate/><Sidebar page={page} setPage={setPage}/><main className=\"main\"><Topbar/><div className=\"pageWrap\" key={page}>{screen}</div></main>{settings.fpsMonitor&&<FpsMonitor/>}<NotificationCenter/>{update&&<UpdateNotice update={update} onLater={()=>setUpdate(null)}/>}<div className=\"bgGlow a\"/><div className=\"bgGlow b\"/></div>"
must(old in s,'App shell marker missing');s=s.replace(old,new,1)
# Runtime version hook and remove stale 1.0.8 from the chrome.
marker='function Boot(){'
must(marker in s,'Boot marker missing');s=s.replace(marker,"function useRuntimeVersion(){const [version,setVersion]=useState('');useEffect(()=>{void api.appVersion().then(setVersion).catch(()=>{})},[]);return version}\n"+marker,1)
s=s.replace("function Activation({onActivated}:{onActivated:(x:LicenseStatus)=>void}){const [key,setKey]", "function Activation({onActivated}:{onActivated:(x:LicenseStatus)=>void}){const version=useRuntimeVersion();const [key,setKey]",1)
s=s.replace('<small>VYRON 1.0.8 • macOS Apple Silicon</small>','<small>VYRON {version||\'…\'} • macOS Apple Silicon</small>',1)
s=s.replace("function Topbar(){const channels=useApp", "function Topbar(){const version=useRuntimeVersion();const channels=useApp",1)
s=s.replace('<span className="crumb">VYRON 1.0.8</span>','<span className="crumb">VYRON {version||\'…\'}</span>',1)
# Existing updater UI: mark expected version before install and expose errors through global notification center.
old="onClick={async()=>{setProgress(0);try{await update.install((p:number)=>setProgress(p))}catch(e){setProgress(null);setError(String(e))}}}>ОБНОВИТЬ</button>"
new="onClick={async()=>{setProgress(0);localStorage.setItem('vyron:update-installing-version',String(update.version));try{await update.install((p:number)=>setProgress(p))}catch(e){localStorage.removeItem('vyron:update-installing-version');setProgress(null);setError(String(e));notifyError('Не удалось установить обновление',String(e))}}}>ОБНОВИТЬ</button>"
must(old in s,'UpdateNotice install marker missing');s=s.replace(old,new,1);p.write_text(s)

# ---- Settings updater uses the same success/error notification contract ----------
p=Path('src/SettingsOS.tsx'); s=p.read_text()
s=s.replace("import type {AutopilotMode,LicenseStatus} from './types';","import type {AutopilotMode,LicenseStatus} from './types';\nimport {notifyError,notifyInfo,notifySuccess} from './notificationCenter';",1)
old="async function checkForUpdate(){try{setUpdate(await api.checkUpdate())}catch(e){setUpdate({error:String(e)})}}"
new="async function checkForUpdate(){try{const next=await api.checkUpdate();setUpdate(next);if(next?.none)notifySuccess('VYRON обновлён',`Установлена актуальная версия ${next.current||installedVersion||'—'}.`,{operationId:`update-latest:${next.current||installedVersion}`});else if(next?.version)notifyInfo(`Доступно обновление VYRON ${next.version}`,'Можно установить и перезапустить приложение.',{operationId:`settings-update:${next.version}`})}catch(e){setUpdate({error:String(e)});notifyError('Не удалось проверить обновления',String(e))}}"
must(old in s,'Settings checkForUpdate marker missing');s=s.replace(old,new,1)
old="async function installUpdate(){setProgress(0);setStage('Downloading');try{await update.install((p:number)=>{setProgress(p);if(p>=100)setStage('Verifying signature / Installing')})}catch(e){setProgress(null);setStage('Обновление не установлено. Текущая версия сохранена.');toast(String(e))}}"
new="async function installUpdate(){setProgress(0);setStage('Загрузка');localStorage.setItem('vyron:update-installing-version',String(update.version||''));try{await update.install((p:number)=>{setProgress(p);if(p>=100)setStage('Проверка подписи и установка')})}catch(e){localStorage.removeItem('vyron:update-installing-version');setProgress(null);setStage('Обновление не установлено. Текущая версия сохранена.');notifyError('Не удалось установить обновление',String(e))}}"
must(old in s,'Settings installUpdate marker missing');s=s.replace(old,new,1);p.write_text(s)

# ---- CSS: top-left stack + clear readiness --------------------------------------
p=Path('src/styles.css'); s=p.read_text();s+=r'''
/* VYRON 1.0.13 — one global notification center */
.vyronNotificationCenter{position:fixed;z-index:10040;top:16px;left:206px;width:min(390px,calc(100vw - 226px));display:flex;flex-direction:column;gap:9px;pointer-events:none}.vyronNotice{pointer-events:auto;display:grid;grid-template-columns:30px minmax(0,1fr) 24px;gap:10px;align-items:start;padding:13px 12px;border:1px solid #244457;border-radius:13px;background:rgba(6,19,29,.97);box-shadow:0 14px 38px rgba(0,0,0,.28);backdrop-filter:blur(12px);animation:vyronNoticeIn .18s ease-out}.vyronNotice.success{border-color:rgba(77,226,185,.48)}.vyronNotice.info{border-color:rgba(76,205,255,.42)}.vyronNotice.warning{border-color:rgba(255,190,81,.5)}.vyronNotice.error{border-color:rgba(255,101,124,.55)}.vyronNoticeIcon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font-style:normal;font-weight:900;background:#102839}.vyronNotice.success .vyronNoticeIcon{color:#54e2b9}.vyronNotice.info .vyronNoticeIcon{color:#55cdfd}.vyronNotice.warning .vyronNoticeIcon{color:#ffc265}.vyronNotice.error .vyronNoticeIcon{color:#ff7187}.vyronNoticeText b{display:block;color:#e9f6fb;font-size:12px}.vyronNoticeText p{margin:4px 0 0;color:#89a5b5;font-size:10px;line-height:1.45}.vyronNoticeActions{display:flex;gap:7px;margin-top:9px}.vyronNoticeActions button{padding:6px 9px;font-size:8px}.vyronNoticeClose{border:0!important;background:transparent!important;color:#698697!important;padding:0!important;font-size:17px!important;min-height:24px}.vyronNoticeClose:hover{color:#dceff7!important;transform:none!important}@keyframes vyronNoticeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.readinessCompact{display:flex!important;flex-direction:column;gap:3px;min-width:90px}.readinessCompact>b{display:flex!important;align-items:baseline;gap:7px!important;font-size:13px!important;color:#e8f6fb!important}.readinessCompact>b strong{font-size:16px;color:#67e1c0}.readinessCompact>b i{font-style:normal;color:#557385;font-weight:500}.readinessCompact>b em{font-style:normal;color:#c4d7e1;font-size:13px}.readinessCompact>small{font-size:8px!important;color:#738d9d!important}.readinessCompact>span{display:block!important;height:3px;border-radius:10px;background:#203242;overflow:hidden;margin-top:2px}.readinessCompact>span>i{display:block;height:100%;background:linear-gradient(90deg,#43d8ff,#5de5bd);border-radius:inherit}.tableReady{min-width:115px}
@media(max-width:760px){.vyronNotificationCenter{left:12px;right:12px;top:12px;width:auto}.readinessCompact{min-width:72px}}
''';p.write_text(s)

print('VYRON 1.0.13 core notification/readiness patch applied')
