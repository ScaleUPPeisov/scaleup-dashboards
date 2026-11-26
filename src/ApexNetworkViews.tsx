import React,{useMemo,useState} from 'react';
import type {Channel} from './types';

export type NetworkViewDay={date:string;views:number|null;covered:number};
/** Sum only supplied daily analytics, never derive historical views from a lifetime total.
 * A missing day remains null; partial coverage is explicit. Dates are reporting dates. */
export function networkViewDays(channels:readonly Channel[],days:number,now=Date.now()):NetworkViewDay[]{
 const end=new Date(now);end.setUTCHours(0,0,0,0);end.setUTCDate(end.getUTCDate()-1);
 const result=Array.from({length:days},(_,i)=>({date:new Date(end.getTime()-(days-i-1)*86400000).toISOString().slice(0,10),views:null as number|null,covered:0}));
 const byDate=new Map(result.map(row=>[row.date,row]));
 for(const c of channels){
  const unique=new Map<string,number>();
  for(const row of c.analytics?.daily||[])if(byDate.has(row.date)&&Number.isFinite(row.views)&&row.views>=0)unique.set(row.date,row.views);
  for(const [date,views] of unique){const day=byDate.get(date)!;day.views=(day.views??0)+views;day.covered++}
 }
 return result;
}
export function ApexNetworkViews({channels}:{channels:Channel[]}){
 const [period,setPeriod]=useState(28);
 const rows=useMemo(()=>networkViewDays(channels,period),[channels,period]);
 const known=rows.filter(r=>r.views!==null),sum=known.reduce((n,r)=>n+(r.views??0),0),partial=known.length!==rows.length||known.some(r=>r.covered!==channels.length);
 const max=Math.max(1,...known.map(r=>r.views||0)),width=600,step=width/rows.length;
 return <section className="opsCard apexNetworkChart"><div className="opsCardHead"><h2>Просмотры</h2><select aria-label="Период просмотров" value={period} onChange={e=>setPeriod(Number(e.target.value))}><option value={7}>7 дней</option><option value={28}>28 дней</option><option value={90}>90 дней</option></select></div>
 <div className="apexNetworkChartTotal">{known.length?(partial?'≥ ':'')+sum.toLocaleString('ru-RU'):'—'}</div>
 {known.length?<><svg viewBox="0 0 650 190" role="img" aria-label="Просмотры по дням из сохранённой аналитики" preserveAspectRatio="none">
 {[0,1,2,3,4].map(i=><g key={i}><line x1="45" x2="645" y1={12+i*38} y2={12+i*38} stroke="#30313a" strokeDasharray="3 4"/><text x="1" y={15+i*38}>{Math.round(max*(4-i)/4).toLocaleString('ru-RU')}</text></g>)}
 {rows.map((r,i)=>r.views!==null?<rect key={r.date} x={45+i*step} y={164-(r.views/max)*152} width={Math.max(1,step-2)} height={Math.max(1,r.views/max*152)} fill={r.covered===channels.length?'#a78bfa':'#69538f'}><title>{r.date}: {r.views.toLocaleString('ru-RU')} · {r.covered}/{channels.length} каналов</title></rect>:null)}
 <text x="45" y="184">{rows[0]?.date}</text><text x="645" y="184" textAnchor="end">{rows.at(-1)?.date}</text>
 </svg><p className="apexNetworkChartNote">{partial?'Частичные данные · ':''}{known.length} / {rows.length} дней с данными. Пропуски не считаются нулём. Источник: сохранённая аналитика.</p></>:<p className="opsEmpty">Нет дневной аналитики за выбранный период. Обновите данные в разделе «Аналитика».</p>}
 </section>;
}
