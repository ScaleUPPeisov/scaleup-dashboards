import React,{useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {open} from '@tauri-apps/plugin-dialog';
import type {Channel,YoutubeProfile} from './types';

type Choice={profileId:string;channelId:string;name:string};
type Progress={runId:string;completed:number;total:number;channelId:string;name:string;stage:string;detail:string;at:string};
type ExportResult={ok:boolean;path:string;selected:number;successful:number;failed:number;zipSha256:string;coverage:unknown[]};
type Period='all'|'365'|'90'|'30'|'custom';
const stages:Record<string,string>={
 OAuth:'Авторизация',INVENTORY:'Все видео',CHANNEL_DAILY:'История канала',VIDEO_DAILY:'История каждого видео',
 TRAFFIC:'Источники трафика',RETENTION:'Удержание',REACH:'Показы и CTR',DONE:'Готово',ERROR:'Ошибка',
};
export function AiAnalyticsExport({channels,profiles}:{channels:Channel[];profiles:YoutubeProfile[]}){
 const connected=useMemo(()=>{
  const profileMap=new Map(profiles.map(p=>[p.id,p]));
  const result:Choice[]=[];
  const seen=new Set<string>();
  for(const c of channels){
   const id=(c.youtubeChannelId||'').trim(),profileId=(c.youtubeProfileId||'').trim();
   const profile=profileMap.get(profileId);
   if(!id||!profileId||!profile||profile.channelId!==id||seen.has(id))continue;
   result.push({channelId:id,profileId,name:c.name||profile.channelTitle||id});seen.add(id);
  }
  return result;
 },[channels,profiles]);
 const [opened,setOpened]=useState(false);
 const [mode,setMode]=useState<'all'|'selected'>('all');
 const [selected,setSelected]=useState<string[]>([]);
 const [period,setPeriod]=useState<Period>('all');
 const [startDate,setStartDate]=useState('');
 const [endDate,setEndDate]=useState('');
 const [includeRetention,setIncludeRetention]=useState(false);
 const [includeReporting,setIncludeReporting]=useState(true);
 const [running,setRunning]=useState(false);
 const [folder,setFolder]=useState('');
 const [progress,setProgress]=useState<Record<string,Progress>>({});
 const [result,setResult]=useState<ExportResult|null>(null);
 const [error,setError]=useState('');
 const chosen=mode==='all'?connected:connected.filter(c=>selected.includes(c.channelId));
 const completed=Object.values(progress).filter(p=>p.stage==='DONE'||p.stage==='ERROR').length;
 useEffect(()=>{if(!running)return;let unlisten:(()=>void)|undefined;let live=true;
  void listen<Progress>('vyron:ai-export-progress',event=>{
   if(live)setProgress(old=>({...old,[event.payload.channelId]:event.payload}));
  }).then(f=>{if(live)unlisten=f;else f()});
  return()=>{live=false;unlisten?.()};
 },[running]);
 async function chooseFolder():Promise<string|null>{
  const value=await open({directory:true,multiple:false,title:'Выберите папку для AI ZIP'});
  return typeof value==='string'?value:null;
 }
 async function start(){
  if(running||chosen.length===0)return;
  if(period==='custom'&&(!startDate||!endDate||startDate>endDate)){setError('Укажите корректный диапазон дат.');return;}
  setError('');setResult(null);setProgress({});
  let directory=folder;
  if(!directory){try{directory=await chooseFolder()||'';}catch(e){setError(String(e));return;}}
  if(!directory){setError('Папка сохранения не выбрана.');return;}
  setFolder(directory);setRunning(true);
  try{
   // Rust owns OAuth and local cache. No token is ever exposed to the UI.
   const output=await invoke<ExportResult>('youtube_ai_export',{request:{
    channels:chosen,period,startDate:period==='custom'?startDate:null,endDate:period==='custom'?endDate:null,
    destination:directory,includeRetention,includeReporting,
   }});
   setResult(output);
  }catch(e){setError(String(e));}
  finally{setRunning(false);}
 }
 return <section className="panel" style={{marginBottom:16}}>
  <div className="panelHead">
   <div><small>AI INTELLIGENCE · macOS</small><h3>Полный архив всех YouTube-каналов</h3></div>
   <button className="primary" disabled={running||!connected.length} onClick={()=>setOpened(v=>!v)}>
    {opened?'Свернуть параметры':'Экспорт всех каналов для ИИ'}
   </button>
  </div>
  <p style={{margin:'4px 0 14px',opacity:.8}}>Все видео, дневная история, доступные показатели удержания, источники трафика, события и контроль полноты. Архив JSON + CSV + Markdown.</p>
  {opened&&<div style={{display:'grid',gap:14}}>
   <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
    <label>Каналы <select disabled={running} value={mode} onChange={e=>setMode(e.target.value as 'all'|'selected')}>
     <option value="all">Все подключённые ({connected.length})</option><option value="selected">Выбранные</option>
    </select></label>
    <label>Период <select disabled={running} value={period} onChange={e=>setPeriod(e.target.value as Period)}>
     <option value="all">Вся доступная история</option><option value="365">Последний год</option>
     <option value="90">90 дней</option><option value="30">30 дней</option><option value="custom">Свой диапазон</option>
    </select></label>
    {period==='custom'&&<><label>С <input type="date" disabled={running} value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
    <label>По <input type="date" disabled={running} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></>}
   </div>
   {mode==='selected'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8,maxHeight:220,overflowY:'auto'}}>
    {connected.map(c=><label key={c.channelId} style={{display:'flex',alignItems:'center',gap:8}}>
     <input type="checkbox" disabled={running} checked={selected.includes(c.channelId)}
      onChange={e=>setSelected(old=>e.target.checked?[...old,c.channelId]:old.filter(id=>id!==c.channelId))}/>{c.name}
    </label>)}
   </div>}
   <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
    <label style={{display:'flex',alignItems:'center',gap:7}}>
     <input type="checkbox" checked={includeRetention} disabled={running} onChange={e=>setIncludeRetention(e.target.checked)}/>
     Удержание каждого видео (много запросов)
    </label>
    <label style={{display:'flex',alignItems:'center',gap:7}}>
     <input type="checkbox" checked={includeReporting} disabled={running} onChange={e=>setIncludeReporting(e.target.checked)}/>
     Reporting API: показы и CTR, если отчёты доступны
    </label>
   </div>
   <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
    <button disabled={running} onClick={()=>void chooseFolder().then(dir=>{if(dir)setFolder(dir)}).catch(e=>setError(String(e)))}>Выбрать папку на Mac</button>
    <span style={{opacity:.7,overflowWrap:'anywhere'}}>{folder||'Папка не выбрана'}</span>
   </div>
   <div style={{display:'flex',gap:10,alignItems:'center'}}>
    <button className="primary" disabled={running||!chosen.length} onClick={()=>void start()}>
     {running?'Собираю архив…':'Начать экспорт · '+chosen.length+' каналов'}
    </button>
    <span>JSON + CSV + Markdown · локальный кэш · без OAuth-токенов</span>
   </div>
   {running&&<div role="status"><b>Обработано каналов: {completed} из {chosen.length}</b>
    <div style={{display:'grid',gap:7,marginTop:10,maxHeight:260,overflowY:'auto'}}>
     {chosen.map(c=>{const p=progress[c.channelId];return <div key={c.channelId}
      style={{display:'flex',gap:10,justifyContent:'space-between',borderBottom:'1px solid rgba(140,160,180,.15)',paddingBottom:6}}>
      <strong>{c.name}</strong><span>{p?(stages[p.stage]||p.stage)+': '+p.detail:'В очереди'}</span>
     </div>})}
    </div></div>}
   {result&&<div role="status" style={{overflowWrap:'anywhere'}}>
    <b>AI ZIP сформирован: {result.successful} из {result.selected} каналов</b>
    {result.failed>0&&<p>Ошибки по {result.failed} каналам записаны в DATA_COVERAGE.json.</p>}
    <p>Путь: <code>{result.path}</code></p>
    <small>SHA-256: {result.zipSha256}</small>
   </div>}
   {error&&<div className="errorBox" role="alert">{error}</div>}
   <small style={{opacity:.72}}>YouTube не гарантирует все метрики за прошлые годы. Отсутствующие значения остаются пустыми; первый экспорт загружает доступные данные, следующие используют кэш. Не закрывайте VYRON до окончания экспорта.</small>
  </div>}
 </section>;
}
