import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {formatNumber} from './core';
import type {AnalyticsBreakdown,AnalyticsPoint,ChannelAnalytics,YoutubeProfile} from './types';
import {refreshChannelAnalytics} from './youtubeIntelligence';
import {loadActivePublishChannel,saveActivePublishChannel,subscribeActivePublishChannel} from './publishWorkspaceState';
import {YouTubeChannelBar} from './YouTubeChannelBar';
import {api} from './api';
import {notifyError,notifySuccess} from './notificationCenter';

type Period='1'|'7'|'28'|'90';
const num=(v?:number,d=0)=>v==null?'—':v.toLocaleString('ru-RU',{maximumFractionDigits:d});
const duration=(sec?:number)=>sec==null?'—':Math.floor(sec/60)+':'+String(Math.round(sec)%60).padStart(2,'0');
const dateTime=(iso?:string)=>iso?new Date(iso).toLocaleString('ru-RU'):'—';
const dayLabel=(period:Period)=>period==='1'?'24 часа':period+' дней';
function rowsFor(a:ChannelAnalytics|undefined,days:number){if(!a?.daily?.length)return[];return a.daily.slice(-days)}
function sum(rows:AnalyticsPoint[],key:'views'|'watchMinutes'|'subscribersGained'|'subscribersLost'){return rows.reduce((n,x)=>n+Number(x[key]||0),0)}
function delta(a:ChannelAnalytics|undefined,days:number,key:'views'|'watchMinutes'|'subscribersNet'){if(!a?.daily||a.daily.length<days*2)return undefined;const current=a.daily.slice(-days),previous=a.daily.slice(-days*2,-days);const calc=(r:AnalyticsPoint[])=>key==='subscribersNet'?sum(r,'subscribersGained')-sum(r,'subscribersLost'):sum(r,key as 'views'|'watchMinutes');return calc(current)-calc(previous)}
function LineChart({rows,value,label}:{rows:AnalyticsPoint[];value:(x:AnalyticsPoint)=>number;label:string}){const vals=rows.map(value),max=Math.max(1,...vals),min=Math.min(0,...vals),range=Math.max(1,max-min),points=vals.map((v,i)=>(rows.length<2?0:i/(rows.length-1)*100)+','+(38-(v-min)/range*34)).join(' ');return <div className="analyticsChart"><div><b>{label}</b><span>{rows.length?rows[0].date+' → '+rows[rows.length-1].date:'Нет данных'}</span></div>{rows.length?<svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points={points}/></svg>:<p>Для периода нет дневных точек.</p>}</div>}
function Breakdown({title,rows}:{title:string;rows:AnalyticsBreakdown[]}){const total=rows.reduce((n,x)=>n+x.views,0);return <section className="panel analyticsBreakdown"><div className="panelHead"><div><small>РАЗБИВКА</small><h3>{title}</h3></div></div>{rows.length?<div className="breakdownRows">{rows.slice(0,10).map(x=>{const pct=total?x.views/total*100:0;return <div key={x.key}><span><b>{x.key}</b><small>{formatNumber(x.views)} просмотров</small></span><em>{pct.toFixed(1)}%</em><i><u style={{width:pct+'%'}}/></i></div>})}</div>:<p>Нет данных.</p>}</section>}
function Kpi({label,value,note}:{label:string;value:React.ReactNode;note?:React.ReactNode}){return <span><small>{label}</small><b>{value}</b>{note&&<em>{note}</em>}</span>}
export function AnalyticsPage(){
 const channels=useApp(s=>s.channels),setPage=useApp(s=>s.setPage);
 const [channelId,setChannelId]=useState(()=>{const saved=loadActivePublishChannel();return channels.some(c=>c.id===saved)?saved:channels[0]?.id||''}),[period,setPeriod]=useState<Period>('28'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[profiles,setProfiles]=useState<YoutubeProfile[]>([]);
 useEffect(()=>subscribeActivePublishChannel(id=>{if(channels.some(c=>c.id===id))setChannelId(id)}),[channels.map(c=>c.id).join('|')]);
 useEffect(()=>{if(channelId)saveActivePublishChannel(channelId)},[channelId]);
 useEffect(()=>{void api.youtubeProfiles().then(setProfiles).catch(()=>setProfiles([]))},[channelId]);
 const channel=channels.find(c=>c.id===channelId),analytics=channel?.analytics,days=Number(period),rows=useMemo(()=>rowsFor(analytics,days),[analytics,days]),exact=analytics?.periodDays===days;
 const views=rows.length?sum(rows,'views'):exact?analytics?.views:undefined,watch=rows.length?sum(rows,'watchMinutes'):exact?analytics?.watchMinutes:undefined,gained=rows.length?sum(rows,'subscribersGained'):exact?analytics?.subscribersGained:undefined,lost=rows.length?sum(rows,'subscribersLost'):exact?analytics?.subscribersLost:undefined,net=gained!=null&&lost!=null?gained-lost:undefined;
 const profile=profiles.find(p=>p.id===channel?.youtubeProfileId),analyticsAuthorized=profile?.analyticsAuthorized!==false;
 async function refresh(){if(!channelId||!channel?.youtubeProfileId){setError('Канал не подключён к YouTube OAuth.');return}setBusy(true);setError('');try{const result=await refreshChannelAnalytics(channelId,days,true);if(!result)throw new Error('YouTube Analytics не вернул данные');notifySuccess('Аналитика обновлена',channel.name+' • '+dayLabel(period),{operationId:'analytics:'+channelId+':'+period})}catch(e){const m=String(e);setError(m);notifyError('Аналитика не обновлена',m,{operationId:'analytics:'+channelId+':'+period})}finally{setBusy(false)}}
 const viewDelta1=delta(analytics,1,'views'),viewDelta7=delta(analytics,7,'views'),viewDelta28=delta(analytics,28,'views'),watchDelta1=delta(analytics,1,'watchMinutes'),watchDelta7=delta(analytics,7,'watchMinutes'),watchDelta28=delta(analytics,28,'watchMinutes'),subDelta1=delta(analytics,1,'subscribersNet'),subDelta7=delta(analytics,7,'subscribersNet'),subDelta28=delta(analytics,28,'subscribersNet');
 const multi=(a:number|undefined,b:number|undefined,d:number|undefined,unit='')=>[a==null?null:'Δ24ч '+(a>0?'+':'')+num(unit? a/60:a,unit?1:0)+(unit?' '+unit:''),b==null?null:'Δ7д '+(b>0?'+':'')+num(unit?b/60:b,unit?1:0)+(unit?' '+unit:''),d==null?null:'Δ28д '+(d>0?'+':'')+num(unit?d/60:d,unit?1:0)+(unit?' '+unit:'')].filter(Boolean).join(' · ')||undefined;
 const insights=[] as Array<{title:string;text:string}>;
 if(viewDelta7!=null)insights.push({title:'Просмотры',text:'За последние 7 дней изменение к предыдущим 7 дням: '+(viewDelta7>=0?'+':'')+formatNumber(viewDelta7)+'.'});
 if(watchDelta7!=null)insights.push({title:'Время просмотра',text:'За последние 7 дней изменение: '+(watchDelta7>=0?'+':'')+num(watchDelta7/60,1)+' ч.'});
 if(subDelta7!=null)insights.push({title:'Подписчики',text:'Net-изменение за последние 7 дней к предыдущим 7 дням: '+(subDelta7>=0?'+':'')+formatNumber(subDelta7)+'.'});
 if(exact&&analytics?.averageViewPercentage!=null)insights.push({title:'Средний процент просмотра',text:'Текущее значение за выбранный период: '+num(analytics.averageViewPercentage,1)+'%.'});
 const moneyAvailable=Boolean(exact&&analytics?.monetaryAuthorized);
 return <div className="analyticsPageV31"><div className="pageHeader"><div><small>YOUTUBE ANALYTICS</small><h1>Аналитика</h1><p>Приватная аналитика выбранного канала. Обновление выполняется здесь, без перехода в другие разделы.</p></div><div className="headerActions"><button className="primary" disabled={busy||!channel} onClick={()=>void refresh()}>{busy?'Обновляю…':'↻ Обновить аналитику'}</button></div></div>
  <YouTubeChannelBar/>
  <div className="analyticsToolbar"><div className="periodTabs analyticsPeriods">{(['1','7','28','90'] as Period[]).map(x=><button key={x} className={period===x?'active':''} onClick={()=>setPeriod(x)}>{dayLabel(x)}</button>)}</div><span>Обновлено: <b>{analytics?.updatedAt?dateTime(analytics.updatedAt):'ещё нет'}</b></span></div>
  {!analyticsAuthorized&&channel?.youtubeProfileId&&<div className="publisherNotice analyticsConsent"><div><b>Для этого профиля нет расширенной YouTube Analytics авторизации</b><span>Рабочая публикация и Data API остаются подключёнными. Дополнительное согласие требуется только этому каналу.</span></div><button onClick={()=>{setPage('youtube');setTimeout(()=>window.dispatchEvent(new Event('vyron:youtube-accounts')),0)}}>Подключить расширенную аналитику</button></div>}
  {error&&<div className="errorBox">{error}</div>}
  {!analytics?<div className="empty analyticsEmpty"><b>Аналитика ещё не синхронизирована</b><p>Нажмите «Обновить аналитику». VYRON останется в этом разделе и сохранит успешный снимок локально.</p></div>:<>
   {!exact&&<div className="cacheNotice"><b>Показаны сохранённые данные</b><span>Точный набор KPI для периода «{dayLabel(period)}» появится после обновления. Дневные просмотры и watch time уже рассчитаны из доступного кэша.</span></div>}
   <div className="channelMetricsGrid analyticsKpis">
    <Kpi label="Просмотры" value={views==null?'—':formatNumber(views)} note={multi(viewDelta1,viewDelta7,viewDelta28)}/>
    <Kpi label="Часы просмотра" value={watch==null?'—':num(watch/60,1)} note={multi(watchDelta1,watchDelta7,watchDelta28,'ч')}/>
    <Kpi label="Средняя длительность" value={exact?duration(analytics.averageViewDuration):'—'}/>
    <Kpi label="Средний % просмотра" value={exact&&analytics.averageViewPercentage!=null?num(analytics.averageViewPercentage,1)+'%':'—'}/>
    <Kpi label="Подписчики сейчас" value={channel?.stats?.subscriberCount??channel?.stats?.subscribers??'—'}/>
    <Kpi label="Получено подписчиков" value={gained==null?'—':formatNumber(gained)}/>
    <Kpi label="Потеряно подписчиков" value={lost==null?'—':formatNumber(lost)}/>
    <Kpi label="Net подписчики" value={net==null?'—':(net>0?'+':'')+formatNumber(net)} note={multi(subDelta1,subDelta7,subDelta28)}/>
    {exact&&analytics.impressions!=null&&<Kpi label="Показы" value={formatNumber(analytics.impressions)}/>}
    {exact&&analytics.impressionCtr!=null&&<Kpi label="CTR" value={num(analytics.impressionCtr,2)+'%'}/>}
    <Kpi label="Likes" value={exact?formatNumber(analytics.likes):'—'}/><Kpi label="Comments" value={exact?formatNumber(analytics.comments):'—'}/><Kpi label="Shares" value={exact?formatNumber(analytics.shares):'—'}/>
    <Kpi label="Доход" value={moneyAvailable?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(analytics.estimatedRevenue||0):'Нет доступа'}/>
    <Kpi label="RPM" value={moneyAvailable&&analytics.estimatedRevenue!=null&&analytics.views>0?'$'+(analytics.estimatedRevenue/analytics.views*1000).toFixed(2):moneyAvailable?'—':'Нет доступа'}/>
   </div>
   <section className="panel analyticsInsights"><div className="panelHead"><div><small>ЧТО ИЗМЕНИЛОСЬ</small><h3>Факты по каналу</h3></div></div><div className="decisionRows">{insights.length?insights.map((x,i)=><article key={i}><i>→</i><span><b>{x.title}</b><p>{x.text}</p></span></article>):<p>Для сравнения нужно минимум два сопоставимых периода в локальном кэше.</p>}</div></section>
   <div className="analyticsCharts"><LineChart rows={rows} value={x=>x.views} label="Просмотры"/><LineChart rows={rows} value={x=>x.watchMinutes/60} label="Watch time, часы"/><LineChart rows={rows} value={x=>x.subscribersGained-x.subscribersLost} label="Net подписчики"/></div>
   <section className="panel analyticsTopVideos"><div className="panelHead"><div><small>TOP VIDEOS</small><h3>Лучшие видео за сохранённый период</h3></div><span>{exact?dayLabel(period):analytics.periodDays+' дней • кэш'}</span></div>{analytics.topVideos?.length?<div className="topVideoTable">{analytics.topVideos.slice(0,10).map(v=><article key={v.id}>{v.thumbnail?<img src={v.thumbnail}/>:<i/>}<div><b>{v.title}</b><small>{v.publishedAt?new Date(v.publishedAt).toLocaleDateString('ru-RU'):'—'}</small></div><span><small>Просмотры</small><b>{formatNumber(v.views)}</b></span><span><small>Watch time</small><b>{num(v.watchMinutes/60,1)} ч</b></span><span><small>Avg duration</small><b>{duration(v.averageViewDuration)}</b></span><span><small>Avg %</small><b>{num(v.averageViewPercentage,1)}%</b></span><span><small>CTR</small><b>—</b></span><span><small>Подписчики</small><b>{v.subscribersGained==null?'—':'+'+formatNumber(v.subscribersGained)}</b></span></article>)}</div>:<p>Нет данных по видео.</p>}</section>
   <div className="analyticsBreakdownGrid"><Breakdown title="Источники трафика" rows={analytics.trafficSources||[]}/><Breakdown title="Страны" rows={analytics.countries||[]}/>{analytics.devices?.length?<Breakdown title="Устройства" rows={analytics.devices}/>:null}{analytics.audience?.length?<Breakdown title="Подписаны / не подписаны" rows={analytics.audience}/>:null}</div>
  </>}</div>;
}
