import React,{useMemo,useState} from 'react';
import vyronIcon from '../src-tauri/icons/icon.png';
import {useUpdaterRuntime} from './updaterRuntime';
import {useApp} from './store';
import {currentUpdaterBlockers,updaterBlockerText} from './updaterGuard';

const activeStatuses=new Set(['AVAILABLE','DOWNLOADING','VERIFYING','READY_TO_INSTALL','INSTALLING','READY_TO_RESTART','RESTARTING']);
const mb=(n:number)=>n>0?(n/1024/1024).toFixed(n>=100*1024*1024?0:1)+' MB':'—';
export function UpdateExperience(){
 const status=useUpdaterRuntime(s=>s.status),current=useUpdaterRuntime(s=>s.currentVersion),latest=useUpdaterRuntime(s=>s.latestVersion),currentBuild=useUpdaterRuntime(s=>s.currentBuildRevision),latestBuild=useUpdaterRuntime(s=>s.latestBuildRevision),progress=useUpdaterRuntime(s=>s.progress),downloaded=useUpdaterRuntime(s=>s.downloadedBytes),total=useUpdaterRuntime(s=>s.totalBytes),notes=useUpdaterRuntime(s=>s.notes),download=useUpdaterRuntime(s=>s.download),install=useUpdaterRuntime(s=>s.installAndRestart);
 const jobs=useApp(s=>s.jobs),channels=useApp(s=>s.channels),identity=latest+':'+latestBuild,[later,setLater]=useState('');
 const blockers=useMemo(()=>currentUpdaterBlockers(jobs,channels.map(x=>x.id)),[jobs,channels]);
 if(!activeStatuses.has(status)||later===identity)return null;
 const downloading=status==='DOWNLOADING'||status==='VERIFYING',ready=status==='READY_TO_INSTALL';
 return <div className="updateExperienceBackdrop" role="dialog" aria-modal="true"><section className="updateExperience">
   <div className="updateBrand"><img src={vyronIcon} alt="VYRON"/><div><small>VYRON UPDATE</small><h2>Доступно обновление</h2><p>Подписанная Owner Preview сборка. Каналы, OAuth-профили и локальные привязки остаются на месте.</p></div></div>
   <div className="updateVersions"><span><small>Сейчас</small><b>{current||'—'} <em>build {currentBuild||'—'}</em></b></span><i>→</i><span><small>Новая версия</small><b>{latest||'—'} <em>build {latestBuild||'—'}</em></b></span></div>
   {notes&&<div className="updateNotes"><b>Что изменилось</b><p>{notes}</p></div>}
   {downloading&&<div className="updateDownload"><div><b>{status==='VERIFYING'?'Проверка подписи…':'Скачивание обновления'}</b><span>{total>0?mb(downloaded)+' / '+mb(total):''}</span></div><div className="updateProgress"><i style={{width:Math.max(0,Math.min(100,progress))+'%'}}/></div><strong>{Math.round(progress)}%</strong></div>}
   {ready&&blockers.length>0&&<div className="publisherNotice"><b>Сначала завершите активные операции</b><pre>{updaterBlockerText(blockers)}</pre></div>}
   <footer>{status==='AVAILABLE'&&<button className="primary" onClick={()=>void download()}>Обновить сейчас</button>}{ready&&<button className="primary" disabled={blockers.length>0} onClick={()=>void install(blockers)}>Установить и перезапустить</button>}{status==='INSTALLING'&&<b>Установка…</b>}{status==='READY_TO_RESTART'&&<b>Готово к перезапуску…</b>}{status==='RESTARTING'&&<b>VYRON перезапускается…</b>}<button className="secondary" disabled={status==='INSTALLING'||status==='RESTARTING'} onClick={()=>setLater(identity)}>Позже</button></footer>
 </section></div>;
}
