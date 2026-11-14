import React,{useEffect,useMemo,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {Channel} from './types';

export type WinnerVideo={
 channelId:string;videoId:string;title?:string|null;publishedAt?:string|null;ageDays?:number|null;
 current7Views?:number|null;previous7Views?:number|null;current28Views?:number|null;
 watchMinutes7?:number|null;averageViewDuration7?:number|null;averagePercentageViewed7?:number|null;
 subscribersNet7?:number|null;winnerScore?:number|null;
 classification:string;scoreStatus:string;peerMedian7Views?:number|null;
 reasons?:string[];anomalies?:string[];
};
export type WinnerChannel={
 channelId:string;name?:string|null;rank?:number|null;growth28Percent?:number|null;
 recoverySignal?:boolean|null;rankingEligible?:boolean;current28Views?:number|null;
};
export type WinnerSnapshot={
 status:string;source:string;offlineApiRequests:number;
 videoWinners:WinnerVideo[];videoAnomalies:WinnerVideo[];channels:WinnerChannel[];
 coverage:{channelId:string;status:string;videosAnalyzed?:number;lastSuccessfulSyncAt?:string;reason?:string}[];
};
type Props={channels:Channel[];onOpenVideo:(channelId:string,videoId:string)=>void};
type Sort='score'|'views'|'growth'|'age';
const classifications:Record<string,string>={
 BREAKOUT:'Прорыв',RISING:'Набирает темп',STABLE_PERFORMER:'Стабильный',
 UNDERPERFORMER:'Ниже нормы',DECLINING:'Снижение',INSUFFICIENT_DATA:'Недостаточно данных'
};
const number=(v:number|null|undefined,digits=0)=>v==null?'—':v.toLocaleString('ru-RU',{maximumFractionDigits:digits});
export function filterAndSortWinnerVideos(rows:readonly WinnerVideo[],channel:string,classification:string,
 sort:Sort,dateScope:string,nowDate=new Date()):WinnerVideo[]{
 const cutoff=dateScope==='all'?null:Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth(),nowDate.getUTCDate())-
  Number(dateScope)*86400000;
 return rows.filter(row=>(channel==='all'||row.channelId===channel)
  &&(classification==='all'||row.classification===classification)
  &&(cutoff===null||(row.publishedAt!==null&&row.publishedAt!==undefined
    &&Number.isFinite(Date.parse(row.publishedAt))&&Date.parse(row.publishedAt)>=cutoff)))
  .sort((a,b)=>{
   const score=(row:WinnerVideo):number|null=>{
    const x=sort==='score'?row.winnerScore:sort==='views'?row.current7Views:
     sort==='growth'&&row.previous7Views!=null&&row.previous7Views>0&&row.current7Views!=null
      ?(row.current7Views-row.previous7Views)/row.previous7Views:sort==='age'?row.ageDays:null;
    return typeof x==='number'&&Number.isFinite(x)?x:null;
   };
   const left=score(a),right=score(b);
   if(left===null&&right!==null)return 1;
   if(right===null&&left!==null)return -1;
   return (right??0)-(left??0)||a.channelId.localeCompare(b.channelId)||a.videoId.localeCompare(b.videoId);
  });
}
export function Analytics360Winners({channels,onOpenVideo}:Props){
 const [result,setResult]=useState<WinnerSnapshot|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const [channel,setChannel]=useState('all');
 const [classification,setClassification]=useState('all');
 const [sort,setSort]=useState<Sort>('score');
 const [dateScope,setDateScope]=useState('all');
 const channelIds=useMemo(()=>[...new Set(channels.map(c=>c.youtubeChannelId)
  .filter((id):id is string=>Boolean(id&&/^UC[a-zA-Z0-9_-]{22}$/.test(id))))],[channels]);
 const key=channelIds.join('|');
 useEffect(()=>{
  if(!channelIds.length){setResult(null);return}
  let live=true;
  setLoading(true);setError('');
  void invoke<WinnerSnapshot>('analytics360_winners',{channelIds})
   .then(value=>{if(live)setResult(value)})
   .catch(e=>{if(live)setError(String(e))})
   .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 // revision deliberately refetches only the local cache, never Google.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,revision]);
 const names=new Map(channels.map(c=>[c.youtubeChannelId||'',c.name]));
 const rows=useMemo(()=>filterAndSortWinnerVideos(result?.videoWinners||[],channel,classification,sort,dateScope),
  [result,channel,classification,sort,dateScope]);
 const anomalies=(result?.videoAnomalies||[]).length;
 const scored=(result?.videoWinners||[]).filter(v=>v.winnerScore!==null&&v.winnerScore!==undefined).length;
 return <section className="panel a360-panel" style={{display:'grid',gap:16}}>
  <div className="a360-row-head">
   <div><small>WINNER ENGINE 2.0 · локальная аналитика</small><h3>Сильные видео, падения и аномалии</h3>
    <p>Оценка 0–100 относительно сопоставимых видео того же канала. Нет обращений к Google при открытии.</p>
   </div>
   <button disabled={loading||!channelIds.length} onClick={()=>setRevision(v=>v+1)}>
    {loading?'Анализирую…':'Пересчитать из кэша'}
   </button>
  </div>
  {error&&<div className="errorBox" role="alert">{error}</div>}
  {result&&<>
   <div className="a360-grid four">
    <article className="a360-kpi"><small>Видео в кэше</small><strong>{number(result.videoWinners.length)}</strong></article>
    <article className="a360-kpi"><small>С обоснованной оценкой</small><strong>{number(scored)}</strong></article>
    <article className="a360-kpi"><small>Обнаруженные аномалии</small><strong>{number(anomalies)}</strong></article>
    <article className="a360-kpi"><small>Каналы с данными</small><strong>{number(result.coverage.filter(x=>x.status==='AVAILABLE').length)}</strong></article>
   </div>
   <small>Score: 70% логарифмического отношения просмотров к медиане ровесников своего канала + 30% изменения за 7 дней. Нужны полные периоды и минимум 3 сопоставимых ролика. CTR без подтверждённых единиц измерения не участвует. Аномалия не объясняет причину.</small>
   {result.coverage.some(v=>v.status!=='AVAILABLE')&&<div className="a360-unavailable">Часть локальных кэшей отсутствует или недоступна. Эти каналы исключены из рейтинга, а не оценены нулём.</div>}
   <section className="a360-subpanel"><h4>Растущие каналы</h4>
    <div className="a360-table-wrap"><table className="a360-fleet-table"><thead><tr><th>Канал</th><th>28 дней</th><th>Просмотры</th></tr></thead><tbody>
    {(result.channels||[]).filter(c=>c.rankingEligible).slice(0,10).map(c=><tr key={c.channelId}>
     <td>{names.get(c.channelId)||c.name||c.channelId}</td>
     <td>{c.growth28Percent==null?'—':number(c.growth28Percent,1)+'%'}</td>
     <td>{number(c.current28Views)}</td>
    </tr>)}
    </tbody></table></div>
   </section>
   <div className="a360-inline">
    <label>Канал <select value={channel} onChange={e=>setChannel(e.target.value)}>
     <option value="all">Все каналы</option>{channelIds.map(id=><option value={id} key={id}>{names.get(id)||id}</option>)}
    </select></label>
    <label>Статус <select value={classification} onChange={e=>setClassification(e.target.value)}>
     <option value="all">Все статусы</option>{Object.entries(classifications).map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>
    <label>Публикация <select value={dateScope} onChange={e=>setDateScope(e.target.value)}>
     <option value="all">Любая дата</option><option value="30">Последние 30 дней</option><option value="90">Последние 90 дней</option>
    </select></label>
    <label>Сортировка <select value={sort} onChange={e=>setSort(e.target.value as Sort)}>
     <option value="score">По Winner Score</option><option value="views">Просмотры за 7 дней</option>
     <option value="growth">Ускорение</option><option value="age">Возраст видео</option>
    </select></label>
   </div>
   <div className="a360-table-wrap"><table className="a360-fleet-table"><thead><tr>
    <th>Видео</th><th>Канал</th><th>Score</th><th>Статус</th><th>7 дней</th><th>Пред. 7 дней</th><th>Аномалии</th><th>Паспорт</th>
   </tr></thead><tbody>
    {rows.slice(0,100).map(v=><tr key={v.channelId+v.videoId}>
     <td title={v.title||undefined}>{v.title||v.videoId}</td>
     <td>{names.get(v.channelId)||v.channelId}</td>
     <td><strong>{number(v.winnerScore)}</strong></td>
     <td>{classifications[v.classification]||v.classification}</td>
     <td>{number(v.current7Views)}</td><td>{number(v.previous7Views)}</td>
     <td title={v.reasons?.join('\n')}>{v.anomalies?.join(', ')||'—'}</td>
     <td><button onClick={()=>onOpenVideo(v.channelId,v.videoId)}>Открыть</button></td>
    </tr>)}
   </tbody></table></div>
   {rows.length>100&&<small>Показаны первые 100 из {rows.length} видео. Уточните фильтры для остальных.</small>}
   {rows.length===0&&<small>Нет видео для выбранных фильтров. Отсутствующие наблюдения не становятся нулями.</small>}
  </>}
  {!result&&!loading&&!error&&<p>Для расчёта сначала нужна локально сохранённая Analytics 360 история.</p>}
 </section>;
}
