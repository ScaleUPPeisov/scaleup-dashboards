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
 const [limit,setLimit]=useState(20);
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
 const names=useMemo(()=>new Map(channels.map(c=>[c.youtubeChannelId||'',c.name])),[channels]);
 const rows=useMemo(()=>filterAndSortWinnerVideos(result?.videoWinners||[],channel,classification,sort,dateScope),
  [result,channel,classification,sort,dateScope]);
 const anomalies=(result?.videoAnomalies||[]).length;
 const scored=(result?.videoWinners||[]).filter(v=>v.winnerScore!==null&&v.winnerScore!==undefined).length;
 return <section className="a360-winners" aria-labelledby="a360-winners-title">
  <div className="a360-winners-head">
   <div><small>АНАЛИЗ КОНТЕНТА</small><h2 id="a360-winners-title">Лучшие видео</h2>
    <p>Сравнение роликов внутри каждого канала</p>
   </div>
   <button disabled={loading||!channelIds.length} onClick={()=>setRevision(v=>v+1)}>
    {loading?'Анализируем…':'Обновить анализ'}
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
   <details className="a360-winners-method"><summary>Как рассчитывается оценка</summary><p>Оценка от 0 до 100 сравнивает просмотры с медианой похожих видео того же канала и учитывает изменение за семь дней. Требуются полные периоды и минимум три сопоставимых ролика. CTR без подтверждённых единиц не учитывается; аномалия сама по себе не объясняет причину.</p></details>
   {result.coverage.some(v=>v.status!=='AVAILABLE')&&<div className="a360-unavailable">Часть локальных кэшей отсутствует или недоступна. Эти каналы исключены из рейтинга, а не оценены нулём.</div>}
   <details className="a360-subpanel a360-winners-channels"><summary>Растущие каналы</summary>
    <div className="a360-table-wrap"><table className="a360-fleet-table"><thead><tr><th>Канал</th><th>28 дней</th><th>Просмотры</th></tr></thead><tbody>
    {(result.channels||[]).filter(c=>c.rankingEligible).slice(0,10).map(c=><tr key={c.channelId}>
     <td>{names.get(c.channelId)||c.name||c.channelId}</td>
     <td>{c.growth28Percent==null?'—':number(c.growth28Percent,1)+'%'}</td>
     <td>{number(c.current28Views)}</td>
    </tr>)}
    </tbody></table></div>
   </details>
   <div className="a360-winners-filters">
    <label>Канал <select value={channel} onChange={e=>{setChannel(e.target.value);setLimit(20)}}>
     <option value="all">Все каналы</option>{channelIds.map(id=><option value={id} key={id}>{names.get(id)||id}</option>)}
    </select></label>
    <label>Статус <select value={classification} onChange={e=>{setClassification(e.target.value);setLimit(20)}}>
     <option value="all">Все статусы</option>{Object.entries(classifications).map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>
    <label>Публикация <select value={dateScope} onChange={e=>{setDateScope(e.target.value);setLimit(20)}}>
     <option value="all">Любая дата</option><option value="30">Последние 30 дней</option><option value="90">Последние 90 дней</option>
    </select></label>
    <label>Сортировка <select value={sort} onChange={e=>{setSort(e.target.value as Sort);setLimit(20)}}>
     <option value="score">По оценке</option><option value="views">Просмотры за 7 дней</option>
     <option value="growth">Ускорение</option><option value="age">Возраст видео</option>
    </select></label>
   </div>
   <div className="a360-winners-list-head"><h3>Видео</h3><span>Найдено: {number(rows.length)}</span></div>
   <div className="a360-winners-list">{rows.slice(0,limit).map(v=><article key={v.channelId+':'+v.videoId} className="a360-winner-row">
    <div className="a360-winner-title"><strong>{v.title||v.videoId}</strong><span>{names.get(v.channelId)||v.channelId}</span></div>
    <dl><div><dt>Оценка</dt><dd>{number(v.winnerScore)}</dd></div><div><dt>Последние 7 дней</dt><dd>{number(v.current7Views)}</dd></div><div><dt>Предыдущие 7 дней</dt><dd>{number(v.previous7Views)}</dd></div></dl>
    <div className="a360-winner-state"><b>{classifications[v.classification]||v.classification}</b><span>Аномалии: {v.anomalies?.join(', ')||'—'}</span>{Boolean(v.reasons?.length)&&<details><summary>Подробнее</summary><p>{v.reasons?.join(' · ')}</p></details>}</div>
    <button onClick={()=>onOpenVideo(v.channelId,v.videoId)} aria-label={'Открыть аналитику: '+(v.title||v.videoId)}>Открыть</button>
   </article>)}</div>
   {rows.length>limit&&<button className="a360-winners-more" onClick={()=>setLimit(v=>v+20)}>Показать ещё</button>}
   {rows.length===0&&<p className="a360-winners-empty">Нет видео для выбранных фильтров.</p>}
  </>}
  {!result&&!loading&&!error&&<p>Для расчёта сначала нужна локально сохранённая Analytics 360 история.</p>}
 </section>;
}
