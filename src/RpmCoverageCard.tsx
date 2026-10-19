import React,{useMemo} from 'react';
import type {Channel,YoutubeProfile} from './types';
import {buildRpmCoverage,estimateRevenueFromRpm} from './rpmCoverage';

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const stateLabel=(state:string)=>state==='VALID'?'данные':state==='NO_ANALYTICS_ACCESS'?'нет доступа Analytics':state==='NOT_CONNECTED'?'не подключён':'нет данных';

export function RpmCoverageCard({channels,profiles,rpm,onSettings,onAnalytics}:{channels:Channel[];profiles:YoutubeProfile[];rpm?:number;onSettings:()=>void;onAnalytics:()=>void}){
 const coverage=useMemo(()=>buildRpmCoverage(channels,profiles),[channels,profiles]);
 const estimate=rpm==null?undefined:estimateRevenueFromRpm(coverage.totalViews,rpm);
 return <section className="opsCard revenueCard" data-testid="rpm-global-coverage">
  <div className="opsCardHead"><div><small>РАСЧЁТНЫЙ ДОХОД • 28 ДНЕЙ • ВСЕ КАНАЛЫ</small><h2>Оценка по заданному RPM</h2></div></div>
  {rpm==null?<p className="opsEmpty">RPM не настроен. VYRON не будет придумывать расчётный доход.</p>:<>
   <div className="opsStats">
    <span><small>Расчётный доход</small><b>≈ {money(estimate||0)}</b></span>
    <span><small>Настроенный RPM</small><b>{money(rpm)}</b></span>
    <span><small>Учтено каналов</small><b>{coverage.validChannels} из {channels.length}</b></span>
    <span><small>Просмотры • 28 дней</small><b>{fmt(coverage.totalViews)}</b></span>
   </div>
   <p className="opsSourceNote">{coverage.zeroViewChannels?`${coverage.zeroViewChannels} с подтверждённым 0 просмотров • `:''}{coverage.noData?`${coverage.noData} без сохранённой 28-day статистики • `:''}{coverage.noAnalyticsAccess?`${coverage.noAnalyticsAccess} без доступа к Analytics • `:''}{coverage.notConnected?`${coverage.notConnected} не подключено • `:''}{coverage.updatedAt?`обновлено ${new Date(coverage.updatedAt).toLocaleString('ru-RU')}`:'нет даты обновления'}</p>
   <details><summary>Проверить расчёт по каналам</summary><div style={{display:'grid',gap:4,marginTop:8}}>{coverage.rows.map(row=><div key={row.channelId} style={{display:'flex',justifyContent:'space-between',gap:12}}><span>{row.channelName}</span><b>{row.state==='VALID'?`${fmt(row.views||0)} views`:stateLabel(row.state)}</b></div>)}<div style={{display:'flex',justifyContent:'space-between',gap:12,borderTop:'1px solid var(--border)',paddingTop:6}}><span>TOTAL</span><b>{fmt(coverage.totalViews)}</b></div></div></details>
  </>}
  <p className="opsSourceNote">Модель: сумма валидных 28-day views всех подключённых каналов ÷ 1000 × настроенный RPM. UNKNOWN не превращается в 0. Это не подтверждённый доход YouTube/AdSense.</p>
  <footer>{rpm==null?<button onClick={onSettings}>Настроить RPM</button>:<><button onClick={onSettings}>Изменить RPM</button><button onClick={onAnalytics}>Открыть аналитику</button></>}</footer>
 </section>
}
