import React,{useEffect,useMemo,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {useApp} from './store';
import {api} from './api';
import type {Channel,ChannelAnalytics,YoutubeProfile} from './types';
import {refreshChannelAnalytics} from './youtubeIntelligence';
import {calendarMetricTotal,decimateExtrema} from './analytics360Core';
import {AnalyticsPage} from './AnalyticsPage';
import {AiAnalyticsExport} from './AiAnalyticsExport';
import {YouTubeChannelBar} from './YouTubeChannelBar';
import {loadActivePublishChannel,saveActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import './Analytics360.css';

type Tab='overview'|'content'|'audience'|'trends';
type Period='7'|'28'|'90'|'365'|'all'|'custom';
type Day={date:string;views?:number|null;watchMinutes?:number|null;subscribersGained?:number|null;subscribersLost?:number|null;averageViewDuration?:number|null;averageViewPercentage?:number|null;likes?:number|null;comments?:number|null;shares?:number|null};
type Video={
 videoId:string;channelId?:string;title?:string;thumbnail?:string;publishedAt?:string;
 durationIso?:string;durationSeconds?:number|null;contentType?:string;
 viewsPublic?:string|number|null;likesPublic?:string|number|null;commentsPublic?:string|number|null;privacyStatus?:string;
};
type Breakdown={channelId:string;dimension:string;periodStart?:string;periodEnd?:string;rows:{key?:string;views?:number|null;watchMinutes?:number|null;viewerPercentage?:number|null}[]};
type Finding={
 channelId:string;windowDays:number;periodEnd:string;currentViews:number;previousViews:number;
 changePercent:number|null;direction:string;source:string;status:string;note:string;
 videoContributions?:{videoId:string;currentObservedViews:number;previousObservedViews:number;confirmedDeltaViews?:number|null;observedSumDifference:number;evidenceStatus:string}[];
};
type Overview={
 schemaVersion:number;updatedAt:string;
 summary:{channelId:string;name:string;createdAt?:string;subscribers?:number|null;totalViews?:number|null;totalPublishedVideos?:number|null;periodStart?:string;periodEnd?:string;analyticsAuthorized?:boolean;monetary?:{estimatedRevenue?:number;rpm?:number;currency?:string}|null;videosPublishedLast28Days?:number};
 coverage:Record<string,unknown>;
 audienceBreakdowns:Breakdown[];
 traffic:{sourceType?:string;views?:number|null;watchMinutes?:number|null}[];
 growthAndDecline:Finding[];
 publicationsByDay:Record<string,number>;
 videosTotal:number;events:{eventType:string;observedAt?:string;eventTime?:string;videoId?:string;note?:string}[];
};
type Snapshot={
 status:'AVAILABLE'|'NOT_YET_COLLECTED';updatedAt?:string;overview?:Overview;
 channelDaily?:Day[];videos?:Video[];videoCount?:number;filteredVideoCount?:number;
 page?:number;pageSize?:number;selectedVideo?:Video|null;videoDetail?:any;videoDaily?:Day[];retention?:any;
 period?:Period;periodFrom?:string|null;periodTo?:string|null;message?:string;
};
type Progress={channelId:string;name:string;stage:string;detail:string;completed:number;total:number};
const periodLabels:Record<Period,string>={'7':'7 дней','28':'28 дней','90':'90 дней','365':'365 дней',all:'Всё время',custom:'Свои даты'};
const tabLabels:Record<Tab,string>={overview:'Обзор',content:'Контент',audience:'Аудитория',trends:'Тренды и выводы'};
const absent='Недоступно';
const num=(v:unknown,digits=0):string=>{
 if(v===null||v===undefined||v==='')return '—';
 const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:digits}):'—';
};
const percent=(v:unknown)=>v===null||v===undefined?'—':num(v,1)+'%';
const displayDate=(s?:string|null)=>s?new Date(s).toLocaleDateString('ru-RU'):'—';
const displayTime=(s?:string)=>s?new Date(s).toLocaleString('ru-RU'):'—';
const signed=(v:number|null|undefined)=>v==null?'—':(v>0?'+':'')+num(v,1);
const duration=(s:unknown)=>{const n=Number(s);if(s==null||!Number.isFinite(n))return '—';return Math.floor(n/60)+':'+String(Math.round(n%60)).padStart(2,'0')};
const unit=(n:number|null|undefined,suffix:string)=>n==null?'—':num(n,1)+' '+suffix;
const sourceNames:Record<string,string>={
 RELATED_VIDEO:'Рекомендуемые видео',SUBSCRIBER:'Подписки',YT_SEARCH:'Поиск YouTube',
 YT_OTHER_PAGE:'Другие страницы YouTube',YT_CHANNEL:'Страницы каналов',PLAYLIST:'Плейлисты',
 EXT_URL:'Внешние сайты',NO_LINK_OTHER:'Прямые и неизвестные',
 SHORTS:'Shorts',LIVE_STREAM:'Трансляции',VIDEO_ON_DEMAND:'Обычные видео',UNSPECIFIED:'Не определено',
 BROWSE_FEATURES:'Главная и функции выбора контента'
};
function safeSum(items:Day[],key:keyof Day):number|null{
 const values=items.map(r=>r[key]).filter((x):x is number=>typeof x==='number'&&Number.isFinite(x));
 return values.length?values.reduce((a,b)=>a+b,0):null;
}
function deltaFor(finding:Finding|undefined){return finding?.changePercent==null?'Нет сравнимого периода':signed(finding.changePercent)+'% к прошлому периоду'}
function Availability({status='NOT_PROVIDED_BY_API',message}:{status?:string;message:string}){
 return <div className="a360-unavailable"><span>{status.replaceAll('_',' ')}</span><p>{message}</p></div>;
}
function Graph({days,publications={},metric='views',title}:{days:Day[];publications?:Record<string,number>;metric?:'views'|'watchMinutes'|'subscribers';title:string}){
 // Null is a missing measurement, never an implied zero. Break lines across missing dates.
 const rows=useMemo(()=>[...days].sort((a,b)=>a.date.localeCompare(b.date)),[days]);
 const valueOf=(d:Day):number|null=>{
  if(metric==='subscribers')return typeof d.subscribersGained==='number'&&typeof d.subscribersLost==='number'
    ?d.subscribersGained-d.subscribersLost:null;
  const v=d[metric];return typeof v==='number'&&Number.isFinite(v)?v:null;
 };
 const values=rows.map(valueOf),valid=values.filter((x):x is number=>x!=null);
 const low=metric==='subscribers'?Math.min(0,...valid):0;
 const high=Math.max(1,...valid);
 const span=Math.max(1,high-low),width=760,height=164;
 const startMs=rows.length?Date.parse(rows[0].date+'T00:00:00Z'):0;
 const endMs=rows.length?Date.parse(rows[rows.length-1].date+'T00:00:00Z'):0;
 const x=(date:string)=>endMs>startMs?(Date.parse(date+'T00:00:00Z')-startMs)/(endMs-startMs)*width:width/2;
 const y=(value:number)=>height-12-((value-low)/span)*(height-28);
 const segments:{date:string;v:number}[][]=[];let current:{date:string;v:number}[]=[];
 for(let i=0;i<rows.length;i++){
  const value=values[i],prior=i>0?Date.parse(rows[i-1].date+'T00:00:00Z'):NaN;
  const now=Date.parse(rows[i].date+'T00:00:00Z');
  if(value===null||(!Number.isNaN(prior)&&now-prior!==86400000)){
   if(current.length)segments.push(current);
   current=[];
  }
  if(value!==null)current.push({date:rows[i].date,v:value});
 }
 if(current.length)segments.push(current);
 const missing=values.some(v=>v===null)||rows.some((d,i)=>i>0&&Date.parse(d.date+'T00:00:00Z')-Date.parse(rows[i-1].date+'T00:00:00Z')!==86400000);
 const allPublishMarkers=rows.flatMap((d,i)=>publications[d.date]?[{d,i}]:[]);
 const markerStride=Math.max(1,Math.ceil(allPublishMarkers.length/240));
 const publishMarkers=allPublishMarkers.filter((_,i)=>i%markerStride===0);

 return <div className="a360-chart">
  <div className="a360-chart-heading"><strong>{title}</strong><small>{rows.length?rows[0].date+' — '+rows[rows.length-1].date:'Нет подтверждённых дневных данных'}</small></div>
  {valid.length?<>
   <svg role="img" aria-label={title+' по доступным датам; пробелы означают отсутствие данных'} viewBox={'0 0 '+width+' '+height} preserveAspectRatio="none">
    <line x1={0} y1={height-12} x2={width} y2={height-12} className="a360-axis"/>
    {segments.map((part,i)=>part.length>1?
     <polyline key={i} className="a360-trend-line" fill="none" points={decimateExtrema(part,500).map(p=>x(p.date).toFixed(2)+','+y(p.v).toFixed(2)).join(' ')}/>:
     <circle key={i} cx={x(part[0].date)} cy={y(part[0].v)} r={2.2} fill="#55ddfa"/>)}
    {publishMarkers.map(({d,i})=><g key={d.date}>
      <line x1={x(d.date)} y1={0} x2={x(d.date)} y2={height-12} className="a360-published-line"/>
      {values[i]!==null&&<circle cx={x(d.date)} cy={y(values[i]!)} r={3.3} className="a360-published-dot">
       <title>{d.date+' • Публикаций: '+publications[d.date]+' • '+title+': '+num(values[i])}</title>
      </circle>}
     </g>)}
    {rows.length<=120?rows.map((d,i)=>values[i]!==null?<circle key={i} cx={x(d.date)} cy={y(values[i]!)} r={5} fill="transparent" stroke="transparent">
     <title>{d.date+': '+num(values[i])+'; публикаций '+(publications[d.date]||0)}</title>
    </circle>:null):null}
   </svg><div className="a360-graph-foot"><span>{rows[0].date}</span><span>{missing?'Есть пропуски: линия прервана':'Вертикальная линия — публикация'}{markerStride>1?' · отметки: '+publishMarkers.length+' из '+allPublishMarkers.length:''}</span><span>{rows[rows.length-1].date}</span></div>
  </>:<Availability message="Данные за этот период ещё не получены через официальный YouTube Analytics API." status="NOT_YET_COLLECTED"/>}
 </div>;
}
function Kpi({name,value,detail}:{name:string;value:string;detail?:string}){
 return <article className="a360-kpi"><small>{name}</small><strong>{value}</strong>{detail&&<span>{detail}</span>}</article>;
}
function BreakdownCard({title,values,showWatch=false}:{title:string;values?:{key?:string;views?:number|null;watchMinutes?:number|null}[];showWatch?:boolean}){
 const values2=values||[];
 const base=values2.reduce((n,v)=>n+Number(showWatch?v.watchMinutes||0:v.views||0),0);
 return <section className="panel a360-panel"><h3>{title}</h3>
  {values2.length?<div className="a360-breakdowns">{values2.map((x,i)=>{
   const quantity=Number(showWatch?x.watchMinutes||0:x.views||0),share=base?quantity/base*100:0;
   return <div key={String(x.key||'')+i} className="a360-breakdown-row">
    <div><b>{sourceNames[x.key||'']||x.key||'Неизвестно'}</b><span>{percent(share)} · {num(quantity,1)} {showWatch?'мин':'просмотров'}</span></div>
    <div className="a360-bar"><i style={{width:share+'%'}}/></div>
   </div>})}</div>:<Availability message="Разбивка отсутствует в доступной статистике канала." status="NOT_YET_COLLECTED"/>}
 </section>;
}
const demographics:Record<string,string>={
 'age13-17':'13–17','age18-24':'18–24','age25-34':'25–34','age35-44':'35–44',
 'age45-54':'45–54','age55-64':'55–64','age65-':'65+',male:'Мужчины',female:'Женщины',
 user_specified:'Другая категория'
};
function DemographicsCard({title,rows}:{title:string;rows?:{key?:string;viewerPercentage?:number|null}[]}){
 return <section className="panel a360-panel"><h3>{title}</h3>
  {rows?.length?<div className="a360-breakdowns">{rows.map((row,i)=>{
   const share=row.viewerPercentage;
   return <div key={String(row.key||'')+i} className="a360-breakdown-row"><div><b>{demographics[row.key||'']||row.key||'Неизвестно'}</b><span>{share==null?'—':num(share,1)+'%'}</span></div>
    <div className="a360-bar"><i style={{width:Math.max(0,Math.min(100,share||0))+'%'}}/></div></div>
  })}</div>:<Availability status="NOT_YET_COLLECTED" message="У Google ещё нет доступного отчёта по этой категории."/>}
  <small>viewerPercentage из YouTube Analytics API. Категории относятся к доступной выборке Google, а не ко всем просмотрам.</small>
 </section>
}
const parseN=(v:unknown):number|null=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
function VideoPanel({video,detail,daily,retention,onClose}:{video:Video;detail:any;daily:Day[];retention:any;onClose:()=>void}){
 const snippet=detail?.snippet||{},stats=detail?.statistics||{},points:Array<any>=Array.isArray(retention?.points)?retention.points:[];
 const finite=points.map(x=>Array.isArray(x)?[Number(x[0]),Number(x[1])]:[]).filter(x=>x.length===2&&x.every(Number.isFinite));
 const maxRatio=Math.max(1,...finite.map(p=>p[1])),curve=finite.map(x=>(Math.min(1,Math.max(0,x[0]))*100).toFixed(2)+','+(72-Math.min(maxRatio,x[1])/maxRatio*66).toFixed(2)).join(' ');
 return <section className="panel a360-video-detail"><div className="a360-details-head"><div><small>АНАЛИТИКА ВИДЕО · {video.videoId}</small><h3>{video.title}</h3><p>{displayDate(video.publishedAt)} · {duration(video.durationSeconds)} · {video.contentType==='unknown'?'Формат не определён API':video.contentType}</p></div><button onClick={onClose}>Закрыть</button></div>
  <div className="a360-grid four"><Kpi name="Просмотры (публичный счётчик)" value={num(parseN(stats.viewCount)??parseN(video.viewsPublic))}/><Kpi name="Лайки" value={num(parseN(stats.likeCount)??parseN(video.likesPublic))}/><Kpi name="Комментарии" value={num(parseN(stats.commentCount)??parseN(video.commentsPublic))}/><Kpi name="Дней с аналитикой" value={num(daily.length)}/></div>
  <Graph days={daily} title="Просмотры видео по датам"/>
  <div className="a360-grid two"><section className="a360-subpanel"><h4>Удержание аудитории</h4>
   {finite.length?<><svg viewBox="0 0 100 75" preserveAspectRatio="none" className="a360-retention-svg">
    <polyline points={curve} fill="none" stroke="#55dbff" strokeWidth={1.2}/></svg>
    <small>Нормированная позиция в видео. Значения выше 100% не обрезаются.</small></>:
    <Availability status="NOT_YET_COLLECTED" message="Кривая удержания не загружена или Google не предоставил показатель."/>}
  </section><section className="a360-subpanel"><h4>Метаданные</h4>
   <p><b>Video ID: </b>{video.videoId}</p><p><b>Статус: </b>{video.privacyStatus||'Не определён'}</p>
   <p><b>Теги: </b>{Array.isArray(snippet.tags)?snippet.tags.join(', '):'Нет данных'}</p>
   <details><summary>Описание</summary><p style={{whiteSpace:'pre-wrap'}}>{snippet.description||'Нет данных'}</p></details>
   <p><a href={'https://www.youtube.com/watch?v='+video.videoId} target="_blank" rel="noreferrer">Открыть на YouTube</a></p>
  </section></div>
  <small className="a360-footnote">Показы, CTR, точные первые 24/48 часов и подробные источники трафика каждого видео отображаются только при наличии подтверждённых отчётов. Публичный счётчик не равен просмотрам за выбранный период.</small>
 </section>;
}
function Fleet({channels,onChoose}:{channels:Channel[];onChoose:(channelId:string)=>void}){
 const [sort,setSort]=useState<'name'|'views'|'growth'>('name');
 const rows=useMemo(()=>[...channels].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ru'):sort==='views'?
  Number(b.analytics?.views||0)-Number(a.analytics?.views||0):Number(b.analytics?.views||0)-Number(a.analytics?.views||0)),[channels,sort]);
 return <details className="panel a360-fleet"><summary>Все каналы · быстрый обзор ({channels.length})</summary>
  <p>Локальные сохранённые снимки. Для точной межканальной аналитики используйте полную синхронизацию.</p>
  <div className="a360-inline"><label>Сортировка <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="name">Название</option><option value="views">Просмотры в сохранённом снимке</option></select></label></div>
  <div className="a360-table-wrap"><table><thead><tr><th>Канал</th><th>Подписчики</th><th>Просмотры*</th><th>Часы*</th><th>Видео</th><th>Обновлено</th></tr></thead><tbody>{rows.map(c=><tr key={c.id} onClick={()=>onChoose(c.id)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onChoose(c.id)}}><td><b>{c.name}</b></td><td>{num(c.stats?.subscriberCount??c.stats?.subscribers)}</td><td>{num(c.analytics?.views)}</td><td>{num(c.analytics?.watchMinutes==null?null:c.analytics.watchMinutes/60,1)}</td><td>{num(c.stats?.videoCount??c.stats?.videos)}</td><td>{displayDate(c.analytics?.updatedAt)}</td></tr>)}</tbody></table></div>
  <small>* Период может различаться между каналами; такие цифры нельзя использовать для точного рейтинга без синхронизации одного периода.</small>
 </details>;
}
export function Analytics360Page(){
 const isMac=typeof navigator!=='undefined'&&/mac/i.test(navigator.platform||navigator.userAgent);
 const channels=useApp(s=>s.channels),setPage=useApp(s=>s.setPage);
 const [activeId,setActiveId]=useState(()=>loadActivePublishChannel()||channels[0]?.id||'');
 const [tab,setTab]=useState<Tab>('overview'),[period,setPeriod]=useState<Period>('28');
 const [startDate,setStartDate]=useState(''),[endDate,setEndDate]=useState('');
 const [profiles,setProfiles]=useState<YoutubeProfile[]>([]);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(false);
 const [error,setError]=useState(''),[syncing,setSyncing]=useState(false),[refreshing,setRefreshing]=useState(false);
 const [progress,setProgress]=useState<Progress|null>(null),[includeRetention,setIncludeRetention]=useState(false);
 const [videoPage,setVideoPage]=useState(0),[videoType,setVideoType]=useState('all'),[videoSort,setVideoSort]=useState('recent');
 const [videoId,setVideoId]=useState<string|null>(null);
 const refreshToken=useRef(0);
 const active=channels.find(c=>c.id===activeId)||channels[0];
 const matching=profiles.find(p=>p.id===active?.youtubeProfileId&&p.channelId===active?.youtubeChannelId);
 const eligible=Boolean(matching&&active?.youtubeProfileId&&active?.youtubeChannelId);
 useEffect(()=>subscribeActivePublishChannel(id=>{if(channels.some(c=>c.id===id)){setActiveId(id);setVideoPage(0);setVideoId(null)}}),[channels.map(c=>c.id).join('|')]);
 useEffect(()=>{if(!channels.some(c=>c.id===activeId)&&channels[0])setActiveId(channels[0].id)},[channels.map(c=>c.id).join('|'),activeId]);
 useEffect(()=>{let live=true;const reload=()=>void api.youtubeProfiles().then(p=>{if(live)setProfiles(p)}).catch(()=>{if(live)setProfiles([])});
  reload();window.addEventListener('vyron:oauth-state-changed',reload);
  return()=>{live=false;window.removeEventListener('vyron:oauth-state-changed',reload)};
 },[]);
 function choose(id:string){if(!channels.some(c=>c.id===id))return;saveActivePublishChannel(id);setActiveId(id);setVideoPage(0);setVideoId(null)}
 async function load(){
  if(!active?.youtubeChannelId){setSnapshot(null);return}
  const version=++refreshToken.current;setLoading(true);setError('');
  try{
   const result=await invoke<Snapshot>('analytics360_read',{
    channelId:active.youtubeChannelId,page:videoPage,pageSize:40,period,
    startDate:period==='custom'?startDate:null,endDate:period==='custom'?endDate:null,
    videoId,contentType:videoType,sort:videoSort,
   });
   if(version===refreshToken.current)setSnapshot(result);
  }catch(e){if(version===refreshToken.current){setSnapshot(null);setError(String(e))}}
  finally{if(version===refreshToken.current)setLoading(false)}
 }
 useEffect(()=>{if(!isMac)return;if(period==='custom'&&(!startDate||!endDate||startDate>endDate))return;
  void load();
 },[active?.youtubeChannelId,period,startDate,endDate,videoPage,videoType,videoSort,videoId,isMac]);
 useEffect(()=>{if(!syncing)return;let alive=true;let unlisten:(()=>void)|undefined;
  void listen<Progress>('vyron:ai-export-progress',e=>{if(alive&&e.payload.channelId===active?.youtubeChannelId)setProgress(e.payload)}).then(stop=>{if(alive)unlisten=stop;else stop()});
  return()=>{alive=false;unlisten?.()};
 },[syncing,active?.youtubeChannelId]);
 async function syncDeep(){
  if(!active?.youtubeChannelId||!active.youtubeProfileId||syncing)return;
  setSyncing(true);setError('');setProgress(null);
  try{
   const output=await invoke<{status:string;completed:number;errors:{error:string}[]}>('youtube_ai_sync',{request:{
    channels:[{profileId:active.youtubeProfileId,channelId:active.youtubeChannelId,name:active.name}],
    period:'all',startDate:null,endDate:null,destination:'',
    includeRetention,includeReporting:false
   }});
   if(output.completed===0)throw new Error(output.errors.map(e=>e.error).join(' | ')||'Синхронизация не завершена');
   await load();
  }catch(e){setError(String(e))}
  finally{setSyncing(false)}
 }
 async function quickRefresh(){
  if(!active?.youtubeProfileId)return;setRefreshing(true);setError('');
  try{await refreshChannelAnalytics(active.id,28,true)}catch(e){setError(String(e))}finally{setRefreshing(false)}
 }
 const ov=snapshot?.status==='AVAILABLE'?snapshot.overview:undefined;
 const fallback=active?.analytics;
 const daily:Day[]=snapshot?.status==='AVAILABLE'?(snapshot.channelDaily||[]):((fallback?.periodDays===Number(period))?fallback.daily:[]);
 const exactStart=snapshot?.periodFrom||ov?.summary?.periodStart||null;
 const exactEnd=snapshot?.periodTo||ov?.summary?.periodEnd||null;
 const viewsResult=calendarMetricTotal(daily,'views',exactStart,exactEnd);
 const watchResult=calendarMetricTotal(daily,'watchMinutes',exactStart,exactEnd);
 const gainedResult=calendarMetricTotal(daily,'subscribersGained',exactStart,exactEnd);
 const lostResult=calendarMetricTotal(daily,'subscribersLost',exactStart,exactEnd);
 const views=viewsResult.value,watch=watchResult.value,gained=gainedResult.value,lost=lostResult.value;
 const nowNet=gained!=null&&lost!=null?gained-lost:null;
 // Legacy summary is a separate official API snapshot, never mixed into an incomplete new series.
 const eligibleFallback=snapshot?.status!=='AVAILABLE'&&fallback?.periodDays===Number(period);
 const currentViews=views??(eligibleFallback?fallback?.views:null);
 const currentWatch=watch??(eligibleFallback?fallback?.watchMinutes:null);
 const channelsShown=Number(ov?.videosTotal??snapshot?.videoCount??0);
 const anyVideo=Boolean(videoId&&snapshot?.videos?.some(v=>v.videoId===videoId));
 const activeVideo=snapshot?.selectedVideo?.videoId===videoId?snapshot.selectedVideo:snapshot?.videos?.find(v=>v.videoId===videoId)||null;
 const observations=ov?.growthAndDecline||[];
 const breakdowns=ov?.audienceBreakdowns||[];
 const group=(key:string)=>breakdowns.find(b=>b.dimension===key)?.rows;
 const featured=ov?.publicationsByDay||{};
 const selectedPeriodText=periodLabels[period];
 const coverage=ov?.coverage||{};
 // Never convert an API omission into a zero or a fake Studio metric.
 if(!isMac)return <AnalyticsPage/>;
 return <div className="a360">
  <header className="pageHeader a360-head"><div><small>YOUTUBE ANALYTICS · VYRON MAC</small><h1>Analytics 360°</h1>
   <p>Настоящие метрики всех каналов, раздельная история каждого видео, никаких выдуманных CTR или первых 48 часов.</p></div>
   <div className="headerActions"><button disabled={refreshing||!active?.youtubeProfileId} onClick={()=>void quickRefresh()}>{refreshing?'Обновляю…':'↻ Быстрая статистика'}</button>
    <button className="primary" disabled={syncing||!eligible} onClick={()=>void syncDeep()}>{syncing?'Синхронизация…':'Собрать всю историю канала'}</button>
   </div></header>
  <Fleet channels={channels} onChoose={choose}/>
  <AiAnalyticsExport channels={channels} profiles={profiles}/>
  <YouTubeChannelBar/>
  <div className="a360-sync"><div><strong>{active?.name||'Канал не выбран'}</strong>
   <span>Channel ID: {active?.youtubeChannelId||'Не привязан'} · OAuth: {eligible?'профиль совпадает':'нужна проверка'} · Архив: {ov?displayTime(ov.updatedAt):'не собран'}</span>
   {ov&&<span>История: {ov.summary.createdAt?displayDate(ov.summary.createdAt):'—'} → {ov.summary?.createdAt?'доступные даты API':'—'} · Видео: {channelsShown} · Данные: {String(coverage.daily||'NOT_YET_COLLECTED')}</span>}
  </div><label><input type="checkbox" checked={includeRetention} onChange={e=>setIncludeRetention(e.target.checked)} disabled={syncing}/> Полные кривые удержания (дольше)</label></div>
  {syncing&&<div className="a360-progress" role="status"><div className="a360-spinner"/><span>{progress?progress.name+' · '+progress.stage+' · '+progress.detail:'Подготовка безопасной синхронизации…'}</span></div>}
  <div className="a360-toolbar"><nav className="a360-tabs" aria-label="Разделы аналитики">{(Object.keys(tabLabels) as Tab[]).map(t=><button key={t} aria-current={tab===t?'page':undefined} className={tab===t?'active':''} onClick={()=>{setTab(t);setVideoId(null)}}>{tabLabels[t]}</button>)}</nav>
   <div className="a360-periods">{(Object.keys(periodLabels) as Period[]).map(p=><button key={p} className={p===period?'active':''} onClick={()=>{setPeriod(p);setVideoPage(0)}}>{periodLabels[p]}</button>)}</div></div>
  {period==='custom'&&<div className="a360-inline"><label>С <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>По <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></div>}
  {error&&<div role="alert" className="errorBox">{error}</div>}
  {loading&&<p className="a360-wait">Загрузка сохранённой статистики выбранного канала…</p>}
  {!loading&&snapshot?.status==='NOT_YET_COLLECTED'&&<div className="panel a360-note"><b>Полная история пока не синхронизирована</b><p>Нажмите «Собрать всю историю канала». Данные сохранятся локально в отдельных файлах; OAuth не будет сброшен. Быстрая аналитика в VYRON останется доступной.</p></div>}
  {!loading&&tab==='overview'&&<>
   <div className="a360-grid four">
    <Kpi name={'Просмотры · '+selectedPeriodText} value={num(currentViews)} detail={viewsResult.status==='AVAILABLE'?(period==='28'?deltaFor(observations.find(x=>x.windowDays===28)):'Полный подтверждённый ряд'):'Данные: '+viewsResult.status}/>
    <Kpi name="Часы просмотра" value={currentWatch==null?'—':num(currentWatch/60,1)}/>
    <Kpi name="Подписчиков получено" value={num(gained??(eligibleFallback?fallback?.subscribersGained:null))}/>
    <Kpi name="Чистый прирост" value={signed(nowNet??(eligibleFallback&&fallback?fallback.subscribersGained-fallback.subscribersLost:null))}/>
    <Kpi name="Потеря подписчиков" value={num(lost??(eligibleFallback?fallback?.subscribersLost:null))}/>
    <Kpi name="Всего подписчиков" value={num(ov?.summary.subscribers??active?.stats?.subscriberCount??active?.stats?.subscribers)}/>
    <Kpi name="Средняя длительность" value={fallback?.periodDays===Number(period)?duration(fallback.averageViewDuration):'—'}/>
    <Kpi name="Опубликованных видео" value={num(ov?.summary.totalPublishedVideos??active?.stats?.videoCount??active?.stats?.videos)}/>
   </div>
   <Graph days={daily} metric="views" title="Просмотры" publications={featured}/>
   <div className="a360-grid two"><Graph days={daily} metric="watchMinutes" title="Время просмотра, минуты" publications={featured}/><Graph days={daily} metric="subscribers" title="Чистый прирост подписчиков" publications={featured}/></div>
   <section className="panel a360-panel"><h3>Самые популярные видео</h3>
    <p>Публичные накопленные просмотры, не просмотры выбранного периода. Для точного ранжирования по периоду нужны дневные данные каждого видео.</p>
    {snapshot?.videos?.length?<div className="a360-video-grid">{[...snapshot.videos].sort((a,b)=>Number(b.viewsPublic||0)-Number(a.viewsPublic||0)).slice(0,6).map(v=><button key={v.videoId} className="a360-video-card" onClick={()=>{setTab('content');setVideoId(v.videoId)}}>{v.thumbnail?<img src={v.thumbnail} loading="lazy"/>:<span/>}<strong>{v.title||v.videoId}</strong><small>{num(parseN(v.viewsPublic))} просмотров · {displayDate(v.publishedAt)}</small></button>)}</div>:
     <Availability status="NOT_YET_COLLECTED" message="Список роликов станет доступен после глубокой синхронизации."/>}
   </section>
   <div className="a360-grid two"><BreakdownCard title="Источники трафика" values={ov?.traffic?.map(t=>({key:t.sourceType,views:t.views,watchMinutes:t.watchMinutes}))||fallback?.trafficSources||[]}/>
    <BreakdownCard title="География зрителей" values={group('country')||fallback?.countries||[]}/></div>
  </>}
  {!loading&&tab==='content'&&<>
   <div className="a360-grid four">
    <Kpi name="Просмотры" value={num(currentViews)}/>
    <Kpi name="Показы обложек" value={fallback?.impressions!=null&&fallback.periodDays===Number(period)?num(fallback.impressions):'—'} detail="Не подменяется охватом"/>
    <Kpi name="CTR обложек" value={fallback?.impressionCtr!=null&&fallback.periodDays===Number(period)?percent(fallback.impressionCtr):'—'} detail="Только при прямом источнике"/>
    <Kpi name="Средний % просмотра" value={fallback?.averageViewPercentage!=null&&fallback.periodDays===Number(period)?percent(fallback.averageViewPercentage):'—'}/>
   </div>
   <Graph days={daily} title="Просмотры опубликованного контента" publications={featured}/>
   <section className="panel a360-panel"><div className="a360-row-head"><h3>Все видео канала</h3><div className="a360-inline">
    <select aria-label="Тип контента" value={videoType} onChange={e=>{setVideoType(e.target.value);setVideoPage(0)}}><option value="all">Все форматы</option><option value="video">Обычные видео</option><option value="live">Трансляции</option><option value="unknown">Неопределённый формат / Shorts</option></select>
    <select aria-label="Сортировка видео" value={videoSort} onChange={e=>{setVideoSort(e.target.value);setVideoPage(0)}}><option value="recent">Новые сначала</option><option value="views">Популярные сначала</option></select>
   </div></div>
   <div className="a360-table-wrap"><table><thead><tr><th>Видео</th><th>Опубликовано</th><th>Длительность</th><th>Просмотры всего</th><th>Статус</th></tr></thead><tbody>
    {(snapshot?.videos||[]).map(v=><tr key={v.videoId} onClick={()=>setVideoId(v.videoId)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setVideoId(v.videoId)}}>
     <td><div className="a360-video-name">{v.thumbnail?<img src={v.thumbnail} loading="lazy"/>:<span/>}<strong>{v.title||v.videoId}</strong></div></td>
     <td>{displayDate(v.publishedAt)}</td><td>{duration(v.durationSeconds)}</td><td>{num(parseN(v.viewsPublic))}</td><td>{v.privacyStatus||'—'}</td>
    </tr>)}
   </tbody></table>{!snapshot?.videos?.length&&<Availability status="NOT_YET_COLLECTED" message="В этом фильтре нет подтверждённых видео. Shorts без доказательного признака не назначаются автоматически."/>}</div>
   <div className="a360-pagination"><span>Роликов: {snapshot?.filteredVideoCount??0} · Страница {videoPage+1}</span>
    <button disabled={videoPage===0} onClick={()=>setVideoPage(p=>Math.max(0,p-1))}>← Назад</button>
    <button disabled={(videoPage+1)*40>=Number(snapshot?.filteredVideoCount||0)} onClick={()=>setVideoPage(p=>p+1)}>Вперёд →</button></div>
   </section>
   {videoId&&<>{activeVideo?<VideoPanel video={activeVideo} detail={snapshot?.videoDetail} daily={snapshot?.videoDaily||[]} retention={snapshot?.retention} onClose={()=>setVideoId(null)}/>:
    <div className="panel"><p>Не удалось прочитать сохранённые данные выбранного видео.</p><button onClick={()=>setVideoId(null)}>Закрыть</button></div>}</>}
   <div className="a360-grid two"><BreakdownCard title="Источники трафика" values={ov?.traffic?.map(t=>({key:t.sourceType,views:t.views,watchMinutes:t.watchMinutes}))}/>
   <section className="panel a360-panel"><h3>Ключевые моменты удержания</h3><Availability status="PARTIAL" message="Подробные кривые для выбранных видео доступны после включения сбора удержания. Автоматические пики и спады не имитируются без временных точек API."/></section></div>
  </>}
  {!loading&&tab==='audience'&&<>
   <div className="a360-grid four"><Kpi name="Получено подписчиков" value={num(gained)}/><Kpi name="Потеряно подписчиков" value={num(lost)}/><Kpi name="Чистый прирост" value={signed(nowNet)}/><Kpi name="Уникальные зрители" value="—" detail="Не равно просмотрам"/></div>
   <div className="a360-grid two"><BreakdownCard title="География · все доступные страны" values={group('country')} />
    <BreakdownCard title="Устройства · время просмотра" values={group('deviceType')} showWatch/>
    <BreakdownCard title="Время просмотра с подпиской / без подписки" values={group('subscribedStatus')} showWatch/>
    <DemographicsCard title="Возраст зрителей" rows={group("ageGroup")}/>
    <DemographicsCard title="Пол зрителей" rows={group("gender")}/>
    <section className="panel a360-panel"><h3>Новые, случайные, постоянные зрители</h3><Availability status="NOT_PROVIDED_BY_API" message="Внутренние сегменты YouTube Studio могут быть недоступны через официальные API."/></section>
    <section className="panel a360-panel"><h3>Когда аудитория смотрит YouTube · 7 × 24 часа</h3><Availability status="NOT_PROVIDED_BY_API" message="Достоверная тепловая карта активности аудитории не предоставлена. График просмотров собственных роликов не является заменой."/></section>
    <BreakdownCard title="Просмотры собственного контента по форматам" values={group("creatorContentType")}/>
    <section className="panel a360-panel"><h3>Языки субтитров</h3><Availability status="NOT_YET_COLLECTED" message="Требуется подтверждённый отчёт YouTube Reporting API о субтитрах."/></section>
    <section className="panel a360-panel"><h3>Что ещё смотрит аудитория</h3><Availability status="NOT_PROVIDED_BY_API" message="Данные о других просматриваемых каналах и роликах отсутствуют в официальном наборе, доступном VYRON."/></section>
   </div>
  </>}
  {!loading&&tab==='trends'&&<>
   <div className="a360-grid two">{[7,28].map(window=><section key={window} className="panel a360-panel"><h3>Изменения за {window} дней</h3>
    {observations.find(x=>x.windowDays===window)?(()=>{
     const f=observations.find(x=>x.windowDays===window)!;
     return <><div className="a360-trend-number">{signed(f.changePercent)}%</div><p>Текущий период: {num(f.currentViews)} · прошлый: {num(f.previousViews)} просмотров. Последняя дата: {f.periodEnd}</p>
       <small>{f.note||'Динамика подтверждена, причина не установлена.'}</small></>;
    })():<Availability status="INSUFFICIENT_DATA" message="Требуются два сопоставимых периода без пропусков в исходных данных."/>}
   </section>)}</div>
   <section className="panel a360-panel"><h3>Какие видео повлияли на динамику</h3>
    {observations.flatMap(f=>(f.videoContributions||[]).slice(0,12).map(v=>({...v,windowDays:f.windowDays}))).length?
     <div className="a360-table-wrap"><table><thead><tr><th>Видео</th><th>Период</th><th>Сейчас, наблюдаемые</th><th>Раньше, наблюдаемые</th><th>Изменение</th><th>Полнота</th></tr></thead><tbody>
      {observations.flatMap(f=>(f.videoContributions||[]).slice(0,12).map(v=>({...v,windowDays:f.windowDays}))).map((v,i)=><tr key={v.videoId+'-'+i}><td>{v.videoId}</td><td>{v.windowDays} дн.</td><td>{num(v.currentObservedViews)}</td><td>{num(v.previousObservedViews)}</td><td>{v.confirmedDeltaViews==null?'Не подтверждено':signed(v.confirmedDeltaViews)}</td><td>{v.evidenceStatus}</td></tr>)}
     </tbody></table></div>:
     <Availability status="INSUFFICIENT_DATA" message="Нет достаточно полных дневных данных для расчёта вклада отдельных видео."/>}
   </section>
   <section className="panel a360-panel"><h3>Гипотезы роста и падения</h3><p>Сначала сравниваются: изменения показов, CTR, источников трафика, удержания, частоты публикаций, возраста роликов, длительности и жанра. Наличие корреляции не означает доказанную причину.</p>
    <p><b>Проверенная причина:</b> не установлена автоматически. Для AI-анализа используйте полный ZIP-архив и список неполных метрик в DATA_COVERAGE.json.</p></section>
   <section className="panel a360-panel"><h3>История обнаруженных изменений</h3>
    {ov?.events?.length?<div className="a360-event-list">{ov.events.slice(-60).reverse().map((e,i)=><div key={e.videoId+'-'+i}><span>{displayTime(e.observedAt||e.eventTime)}</span><b>{e.eventType.replaceAll('_',' ')}</b><code>{e.videoId||''}</code><small>{e.note||''}</small></div>)}</div>:
     <Availability status="NOT_YET_COLLECTED" message="История появляется только после первой синхронизации; прошедшие изменения заголовков и обложек задним числом не восстанавливаются."/>}
   </section>
  </>}
  <footer className="a360-footnote">Источники: YouTube Data API v3, Analytics API v2 и Reporting API там, где доступен. Даты в API и YouTube Studio могут различаться из-за часовых поясов и задержки публикации статистики. Данные одного канала никогда не используются для другого.</footer>
 </div>;
}
