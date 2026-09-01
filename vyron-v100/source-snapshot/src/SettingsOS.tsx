import React,{useEffect,useState} from 'react';
import {api,type GoogleConfigStatus,type YoutubeProfileHealth} from './api';
import {AccountsPage} from './AccountsPage';
import {useApp} from './store';
import type {AutopilotMode,LicenseStatus,YoutubeProfile} from './types';
import {QuotaMeter} from './QuotaMeter';

type Tab='general'|'youtube'|'autopilot'|'endlume'|'updates'|'diagnostics';

type DiagRow={label:string;status:string;ok?:boolean;detail?:string};

function Toggle({label,text,value,onChange}:{label:string;text:string;value:boolean;onChange:(v:boolean)=>void}){
 return <button className="toggleRow" type="button" onClick={()=>onChange(!value)}>
  <div><b>{label}</b><small>{text}</small></div><i className={value?'on':''}><em/></i>
 </button>;
}

export function SettingsOS({license}:{license:LicenseStatus}){
 const s=useApp(x=>x.settings);
 const patch=useApp(x=>x.patchSettings);
 const logs=useApp(x=>x.logs);
 const toast=useApp(x=>x.toast);
 const setPage=useApp(x=>x.setPage);
 const [tab,setTab]=useState<Tab>('general');
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]);
 const [config,setConfig]=useState<GoogleConfigStatus|null>(null);
 const [update,setUpdate]=useState<any>();
 const [progress,setProgress]=useState<number|null>(null);
 const [stage,setStage]=useState('');
 const [diag,setDiag]=useState<DiagRow[]>([]);
 const [checking,setChecking]=useState(false);
 const [installedVersion,setInstalledVersion]=useState('');

 async function refreshYoutube(){
  const [p,c]=await Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig()]);
  setProfiles(p);setConfig(c);
 }
 useEffect(()=>{void refreshYoutube().catch(()=>{});void api.appVersion().then(setInstalledVersion).catch(()=>{})},[]);

 const mode:AutopilotMode=s.autopilotMode||'off';
 const setMode=(m:AutopilotMode)=>{
  if(m==='off')patch({autopilotMode:m,autopilotEnabled:false,autoUploadYoutube:false});
  else if(m==='assisted')patch({autopilotMode:m,autopilotEnabled:true,autoUploadYoutube:false});
  else patch({autopilotMode:m,autopilotEnabled:true,autoUploadYoutube:true});
 };

 async function reconnectRevenue(){
  setChecking(true);
  try{
   const browser=localStorage.getItem('vyron:oauth-browser')||'default';
   const p=await api.youtubeConnectGlobal(browser);
   toast(`Revenue Analytics: переподключён ${p.channelTitle||p.channelId||'канал'}`);
   await refreshYoutube();
  }catch(e){toast(String(e))}finally{setChecking(false)}
 }

 async function runDiagnostics(){
  setChecking(true);
  try{
   let ws=s.workspace;
   if(!ws){ws=await api.defaultWorkspace();patch({workspace:ws})}
   const core=await api.diagnostics(ws);
   let p:YoutubeProfile[]=[];let c:GoogleConfigStatus|null=null;
   try{[p,c]=await Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig()])}catch{}
   const hh:YoutubeProfileHealth[]=[];
   for(const x of p){
    try{hh.push(await api.youtubeProfileHealth(x.id))}
    catch(e){hh.push({ok:false,status:'RECONNECT_REQUIRED',error:String(e)})}
   }
   const monetary=p.length>0&&p.every(x=>x.monetaryAuthorized);
   setDiag([
    {label:'Google configuration',status:c?.configured?'Готово':'Не настроено',ok:Boolean(c?.configured)},
    {label:'OAuth',status:p.length?`${p.length} профилей`:'Нет профилей',ok:p.length>0,detail:hh.filter(x=>!x.ok).map(x=>x.error).filter(Boolean).join(' • ')},
    {label:'YouTube Data API',status:hh.some(x=>x.ok)?'Доступен':'Не подтверждён',ok:hh.some(x=>x.ok)},
    {label:'YouTube Analytics',status:p.some(x=>x.analyticsAuthorized)?'Разрешён':'Нет разрешения',ok:p.some(x=>x.analyticsAuthorized)},
    {label:'Revenue Analytics',status:monetary?'Разрешён':'Требуется monetary scope',ok:monetary},
    {label:'ENDLUME',status:s.endlumePath?'Путь настроен':'Не выбран',ok:Boolean(s.endlumePath)},
    {label:'Workspace',status:core.workspaceWritable?'Доступен для записи':'Проблема записи',ok:core.workspaceWritable},
    {label:'Updater',status:'Tauri signed updater подключён',ok:true},
    {label:'Internet / Google',status:hh.some(x=>x.ok)?'Google API отвечает':'Не подтверждён',ok:hh.some(x=>x.ok)},
   ]);
  }catch(e){setDiag([{label:'Диагностика',status:'Ошибка',ok:false,detail:String(e)}])}
  finally{setChecking(false)}
 }

 async function checkForUpdate(){
  try{setUpdate(await api.checkUpdate())}
  catch(e){setUpdate({error:String(e)})}
 }
 async function installUpdate(){
  setProgress(0);setStage('Downloading');
  try{
   await update.install((p:number)=>{setProgress(p);if(p>=100)setStage('Verifying signature / Installing')});
  }catch(e){
   setProgress(null);setStage('Обновление не установлено. Текущая версия сохранена.');toast(String(e));
  }
 }

 const tabLabel=(t:Tab)=>t==='general'?'Общие':t==='youtube'?'YouTube':t==='autopilot'?'Автопилот':t==='endlume'?'ENDLUME':t==='updates'?'Обновления':'Диагностика';

 return <>
  <div className="pageHeader"><div><small>SETTINGS</small><h1>Настройки</h1><p>Главные параметры на виду. Технические детали остаются в Advanced и Диагностике.</p></div></div>
  <div className="settingsTabs osTabs">{(['general','youtube','autopilot','endlume','updates','diagnostics'] as Tab[]).map(t=><button className={tab===t?'active':''} key={t} onClick={()=>setTab(t)}>{tabLabel(t)}</button>)}</div>

  {tab==='general'&&<div className="settingsStack">
   <section className="settingsCard"><h3>Workspace</h3><p>Inbox, проекты, очередь, backup и локальное состояние VYRON.</p><div className="pathLine"><input readOnly value={s.workspace} placeholder="создаётся автоматически"/><button onClick={async()=>{const p=await api.chooseWorkspace();if(p)patch({workspace:p})}}>Выбрать</button><button onClick={()=>s.workspace&&api.openLocal(s.workspace)}>Открыть</button></div></section>
   <section className="settingsCard"><h3>Интерфейс</h3><div className="toggleRows"><Toggle label="FPS monitor" text="Показывать текущий FPS интерфейса." value={s.fpsMonitor} onChange={v=>patch({fpsMonitor:v})}/><Toggle label="Уменьшить анимации" text="Отключить декоративные переходы." value={s.reduceMotion} onChange={v=>patch({reduceMotion:v})}/></div></section>
   <section className="settingsCard"><h3>Конкуренты — модель оценки</h3><p>Чужой доход YouTube не раскрывает. Этот диапазон используется только для явно помеченной ОЦЕНКИ.</p><div className="settingsInlineGrid"><label>RPM минимум, $<input type="number" min="0" step="0.1" value={s.competitorRpmLow} onChange={e=>patch({competitorRpmLow:Math.max(0,+e.target.value||0)})}/></label><label>RPM максимум, $<input type="number" min="0" step="0.1" value={s.competitorRpmHigh} onChange={e=>patch({competitorRpmHigh:Math.max(s.competitorRpmLow,+e.target.value||0)})}/></label><label>Пул конкурентов<input type="number" min="10" max="50" value={s.competitorPoolSize} onChange={e=>patch({competitorPoolSize:Math.max(10,Math.min(50,+e.target.value||30))})}/></label><label>Фоновая синхронизация, мин<input type="number" min="15" max="360" value={s.youtubeIntelligenceRefreshMin} onChange={e=>patch({youtubeIntelligenceRefreshMin:Math.max(15,+e.target.value||30)})}/></label></div></section>
   <section className="settingsCard"><h3>Лицензия</h3><p>{license.valid?'VYRON активирован':'Требуется активация'} • {license.type||'—'}</p></section>
   <details className="settingsCard advancedPanel"><summary>Advanced</summary><div className="advancedInner"><label>OpenAI API — опционально<input type="password" value={s.openaiApiKey} onChange={e=>patch({openaiApiKey:e.target.value.trim()})}/></label><label>OpenAI model<input value={s.openaiModel} onChange={e=>patch({openaiModel:e.target.value.trim()})}/></label><label>YouTube category<input value={s.youtubeCategoryId} onChange={e=>patch({youtubeCategoryId:e.target.value.trim()||'10'})}/></label></div></details>
  </div>}

  {tab==='youtube'&&<div className="settingsStack"><QuotaMeter defaultChannels={Math.max(1,profiles.length)}/><section className="settingsCard youtubeStatusCard"><div className="panelHead"><div><small>GLOBAL GOOGLE CONFIG</small><h3>Состояние YouTube</h3></div><button disabled={checking} onClick={()=>refreshYoutube()}>{checking?'…':'↻ Проверить'}</button></div><div className="configChecks"><span className={config?.configured?'good':''}>Google Credentials <b>{config?.configured?'✓':'—'}</b></span><span className={profiles.some(x=>x.analyticsAuthorized)?'good':''}>YouTube Analytics <b>{profiles.some(x=>x.analyticsAuthorized)?'✓':'—'}</b></span><span className={profiles.length>0&&profiles.every(x=>x.monetaryAuthorized)?'good':''}>Revenue Analytics <b>{profiles.length>0&&profiles.every(x=>x.monetaryAuthorized)?'✓':'—'}</b></span></div>{profiles.some(x=>!x.monetaryAuthorized)&&<div className="revenuePermission"><div><b>Доход — нет разрешения</b><p>Для денежной аналитики нужен reconnect с monetary scope.</p></div><button className="primary" disabled={checking||!config?.configured} onClick={reconnectRevenue}>Подключить доход</button></div>}</section><AccountsPage/></div>}

  {tab==='autopilot'&&<div className="settingsStack">
   <section className="settingsCard autopilotExplain"><h3>Режим Autopilot</h3><div className="modeSwitch large"><button className={mode==='off'?'active':''} onClick={()=>setMode('off')}>OFF<small>Только sync и analytics</small></button><button className={mode==='assisted'?'active':''} onClick={()=>setMode('assisted')}>ASSISTED<small>Готовит всё, YouTube write подтверждаешь ты</small></button><button className={mode==='full'?'active':''} onClick={()=>setMode('full')}>FULL<small>Pipeline может публиковать сам</small></button></div><div className="autopilotWhat"><span><b>OFF</b>Не создаёт/не публикует проекты автоматически.</span><span><b>ASSISTED</b>Поддерживает очередь, материалы и рендер; изменения YouTube остаются под подтверждением.</span><span><b>FULL</b>После явной настройки разрешён полный pipeline до публикации.</span></div></section>
   <section className="settingsCard"><div className="panelHead"><div><h3>Количество проектов</h3><p>Можно создать 10, 30, 50, 100 или своё число до 1000.</p></div><button className="primary compactAction" onClick={()=>setPage('production')}>Открыть планировщик</button></div><div className="presetRow static">{[10,30,50,100].map(n=><span key={n}>{n}</span>)}<span>1–1000</span></div></section>
   <details className="settingsCard advancedPanel"><summary>Advanced Autopilot</summary><div className="toggleRows"><Toggle label="Поддерживать план" text="Создавать недостающие VIDEO_XXX по target buffer." value={s.autoCreatePlan} onChange={v=>patch({autoCreatePlan:v})}/><Toggle label="Распределять музыку" text="Inbox/Music → проекты." value={s.autoAssignMusic} onChange={v=>patch({autoAssignMusic:v})}/><Toggle label="Распределять изображения" text="1 изображение = 1 проект." value={s.autoAssignImages} onChange={v=>patch({autoAssignImages:v})}/><Toggle label="AI metadata" text="Только при подключённом API." value={s.autoGenerateMetadata} onChange={v=>patch({autoGenerateMetadata:v})}/><Toggle label="ENDLUME queue" text="Создавать render marker." value={s.autoQueueRender} onChange={v=>patch({autoQueueRender:v})}/><Toggle label="Открывать ENDLUME" text="Открывать приложение при render задачах." value={s.autoOpenEndlume} onChange={v=>patch({autoOpenEndlume:v})}/><Toggle label="YouTube autoupload" text="Только FULL режим." value={s.autoUploadYoutube} onChange={v=>patch({autoUploadYoutube:v})}/></div><label>Интервал цикла, сек<input type="number" min="10" max="3600" value={s.autopilotIntervalSec} onChange={e=>patch({autopilotIntervalSec:Math.max(10,+e.target.value||30)})}/></label></details>
  </div>}

  {tab==='endlume'&&<div className="settingsStack">
   <section className="settingsCard"><h3>ENDLUME Studio</h3><p>Настройки сохраняются в state и не должны исчезать после обновления VYRON.</p><div className="pathLine"><input readOnly value={s.endlumePath} placeholder="ENDLUME Studio.app"/><button onClick={async()=>{const p=await api.chooseEndlume();if(p)patch({endlumePath:p})}}>Выбрать</button>{s.endlumePath&&<button onClick={()=>api.openEndlume(s.endlumePath)}>Открыть</button>}</div></section>
   <section className="settingsCard endlumeRules"><div className="panelHead"><div><small>PROJECT RULES</small><h3>Текущая схема производства</h3></div></div><div className="settingsInlineGrid"><label>Треков на проект<input type="number" min="1" max="100" value={s.tracksPerVideo} onChange={e=>patch({tracksPerVideo:Math.max(1,+e.target.value||10)})}/></label><label>Целевая длительность, мин<input type="number" min="1" max="600" value={s.endlumeTargetDurationMin} onChange={e=>patch({endlumeTargetDurationMin:Math.max(1,+e.target.value||120)})}/></label><label>Цель рендера, сек<input type="number" min="1" max="3600" value={s.endlumeTargetRenderSec} onChange={e=>patch({endlumeTargetRenderSec:Math.max(1,+e.target.value||35)})}/></label><label>Файл минимум, МБ<input type="number" min="100" max="10000" value={s.endlumeTargetFileMinMb} onChange={e=>patch({endlumeTargetFileMinMb:Math.max(100,+e.target.value||700)})}/></label><label>Файл максимум, МБ<input type="number" min="100" max="10000" value={s.endlumeTargetFileMaxMb} onChange={e=>patch({endlumeTargetFileMaxMb:Math.max(s.endlumeTargetFileMinMb,+e.target.value||1000)})}/></label><label>Именование проектов<input value={s.endlumeProjectNaming} onChange={e=>patch({endlumeProjectNaming:e.target.value||'VIDEO_{number}'})}/></label></div><div className="toggleRows"><Toggle label="Сохранять исходное качество изображения" text="Не ухудшать исходное изображение при handoff в ENDLUME." value={s.endlumePreserveImageQuality} onChange={v=>patch({endlumePreserveImageQuality:v})}/></div><div className="endlumeSummary"><span><b>1</b> изображение / проект</span><span><b>{s.tracksPerVideo}</b> треков / проект</span><span><b>~{s.endlumeTargetDurationMin}</b> минут видео</span><span><b>~{s.endlumeTargetRenderSec}</b> сек цель рендера</span><span><b>{s.endlumeTargetFileMinMb}–{s.endlumeTargetFileMaxMb}</b> МБ</span></div></section>
  </div>}

  {tab==='updates'&&<section className="settingsCard"><h3>Update Center</h3><p>Текущая версия: {installedVersion||'определяю…'}</p><Toggle label="Проверять автоматически" text="При запуске, через 30 секунд и далее каждые 6 часов." value={s.autoCheckUpdates} onChange={v=>patch({autoCheckUpdates:v})}/><button className="settingsAction" onClick={checkForUpdate}>Проверить обновления</button>{update?.none&&<div className="successBox">Установлена актуальная версия {update.current||installedVersion||'—'}.</div>}{update?.version&&<div className="updateFound"><b>Доступна: {update.version}</b><p>{update.body}</p>{stage&&<strong>{stage}</strong>}{progress!==null&&<div className="progress"><i style={{width:`${progress}%`}}/><span>{progress.toFixed(0)}%</span></div>}<button className="primary" onClick={installUpdate}>Установить и перезапустить</button></div>}{update?.error&&<div className="errorBox">Обновление не установлено. Текущая версия сохранена.<details><summary>Technical detail</summary>{update.error}</details></div>}</section>}

  {tab==='diagnostics'&&<div className="settingsStack"><section className="settingsCard"><div className="panelHead"><div><h3>Диагностика</h3><p>Проверка OAuth, API, ENDLUME, Workspace и updater.</p></div><button className="primary" disabled={checking} onClick={runDiagnostics}>{checking?'Проверяю…':'Запустить проверку'}</button></div>{diag.length>0&&<div className="diagnosticGrid">{diag.map((x,i)=><div key={i} className={x.ok===false?'bad':x.ok?'good':''}><span><b>{x.label}</b><em>{x.status}</em></span>{x.detail&&<details><summary>Technical detail</summary><p>{x.detail}</p></details>}</div>)}</div>}</section><section className="settingsCard"><h3>Последние события</h3><div className="logs">{logs.length?logs.slice(0,60).map((l,i)=><div key={i} className={l.level}><small>{new Date(l.at).toLocaleString('ru-RU')}</small><span>{l.message}</span></div>):<p>Событий пока нет.</p>}</div></section></div>}
 </>;
}
