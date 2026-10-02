import React,{useMemo} from 'react';
import {useApp} from './store';
import type {Channel,VideoJob} from './types';

const stage=(j?:VideoJob)=>!j?'Нет активных проектов':j.status==='NEED_IMAGE'?'Ждёт изображение':j.status==='WAITING_MUSIC'?'Ждёт музыку':j.status==='READY_RENDER'?'Сборка проекта':j.status==='RENDERING'?'Рендер ENDLUME':j.status==='READY_UPLOAD'?'Готово к YouTube':j.status==='UPLOADING'?'Загрузка YouTube':j.status==='SCHEDULED'?'Запланировано':'Нужно внимание';
const next=(j?:VideoJob)=>!j?'Создать проекты':j.status==='NEED_IMAGE'?'Добавить изображение':j.status==='WAITING_MUSIC'?'Добавить музыку':j.status==='READY_RENDER'?'Открыть в ENDLUME':j.status==='RENDERING'?'Дождаться рендера':j.status==='READY_UPLOAD'?'Открыть публикацию':j.status==='UPLOADING'?'Дождаться загрузки':j.status==='SCHEDULED'?'Готово':'Исправить ошибку';
function jobProgress(j?:VideoJob){if(!j)return 0;let done=0,total=5;if(j.coverPath)done++;if(j.tracksCount>=j.minTracks)done++;if(j.title&&j.description)done++;if(j.finalPath)done++;if(j.youtubeVideoId||j.status==='SCHEDULED')done++;return Math.round(done/total*100)}
type ChannelFacts={current?:VideoJob;remaining:number};
function ChannelRow({channel,facts}:{channel:Channel;facts:ChannelFacts}){
 const {current,remaining}=facts,progress=jobProgress(current);
 return <article className="productionChannelRow"><div className="fleetIdentity">{channel.analytics?.channelThumbnail?<img src={channel.analytics.channelThumbnail}/>:<i>{channel.name.slice(0,2).toUpperCase()}</i>}<span><b>{channel.name}</b><small>{current?'VIDEO_'+String(current.number).padStart(3,'0'):'Проектов нет'}</small></span></div><div className="productionStage"><small>Сейчас</small><b>{stage(current)}</b><span>{progress}%</span><i><em style={{width:progress+'%'}}/></i></div><div className="productionFacts"><span><small>Осталось</small><b>{remaining}</b></span><span><small>Дальше</small><b>{next(current)}</b></span></div><div className="productionFolders"><span className={channel.projectsFolderPath?'ok':'warn'}>Projects {channel.projectsFolderPath?'✓':'—'}</span><span className={channel.renderFolderPath?'ok':'warn'}>Render {channel.renderFolderPath?'✓':'—'}</span></div></article>
}
export function ProductionWorkspace(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs);
 const snapshot=useMemo(()=>{
  const byChannel=new Map<string,ChannelFacts>(),workingIds=new Set<string>();
  let materials=0,building=0,render=0,youtube=0,errors=0;
  for(const j of jobs){
   const facts=byChannel.get(j.channelId)||{current:undefined,remaining:0};
   if(!facts.current||j.status!=='SCHEDULED'&&facts.current.status==='SCHEDULED'||j.status===facts.current.status&&j.number>facts.current.number||j.status!=='SCHEDULED'&&facts.current.status!=='SCHEDULED'&&j.number>facts.current.number)facts.current=j;
   if(j.status!=='SCHEDULED'){facts.remaining++;workingIds.add(j.channelId)}
   byChannel.set(j.channelId,facts);
   if(j.status==='NEED_IMAGE'||j.status==='WAITING_MUSIC')materials++;
   if(j.status==='READY_RENDER'||j.status==='RENDERING')building++;
   if(j.status==='READY_RENDER')render++;
   if(j.status==='READY_UPLOAD')youtube++;
   if(j.status==='ERROR'&&Boolean(j.error?.trim()))errors++;
  }
  return {byChannel,summary:{working:channels.reduce((n,c)=>n+(workingIds.has(c.id)?1:0),0),materials,building,render,youtube,errors}};
 },[channels,jobs]);
 const summary=snapshot.summary;
 return <section className="productionWorkspace compactProduction"><div className="productionSummary"><span><small>Каналы в работе</small><b>{summary.working}</b></span><span><small>Ждут материалов</small><b>{summary.materials}</b></span><span><small>Собираются</small><b>{summary.building}</b></span><span><small>Готовы к рендеру</small><b>{summary.render}</b></span><span><small>Готовы к YouTube</small><b>{summary.youtube}</b></span><span className={summary.errors?'warn':''}><small>Ошибки</small><b>{summary.errors}</b></span></div><div className="productionFleet">{channels.map(c=><ChannelRow key={c.id} channel={c} facts={snapshot.byChannel.get(c.id)||{remaining:0}}/>)}</div>{!channels.length&&<div className="empty"><b>Каналов пока нет</b><p>Добавьте канал, чтобы VYRON показал производственную очередь.</p></div>}<details className="advancedPanel"><summary>Технические сведения</summary><p>Здесь остаются служебные состояния очередей и диагностика. Основной экран показывает только рабочие действия.</p></details></section>
}
