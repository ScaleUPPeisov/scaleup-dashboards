import React,{useMemo} from 'react';
import type {Channel,YoutubeProfile} from './types';
import {buildRpmCoverage,estimateRevenueFromRpm} from './rpmCoverage';

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const stateLabel=(state:string)=>state==='VALID'?'данные':state==='NO_ANALYTICS_ACCESS'?'нет доступа Analytics':state==='NOT_CONNECTED'?'не подключён':'нет данных';

export function RpmCoverageCard({channels,profiles,rpm,onSettings,onAnalytics}:{channels:Channel[];profiles:YoutubeProfile[];rpm?:number;onSettings:()=>void;onAnalytics:()=>void}){
 const coverage=useMemo(()=>buildRpmCoverage(channels,profiles),[channels,profiles]);
 const estimate=rpm==null||coverage.validChannels===0?undefined:estimateRevenueFromRpm(coverage.totalViews,rpm);
 return <section className="opsCard revenueCard" data-testid="rpm-global-coverage">
  <div className="opsCardHead"><div><h2>Оценка дохода за 28 дней</h2><p className="opsSourceNote">Расчётная оценка, не подтверждённый доход YouTube/AdSense.</p></div></div>
  {rpm==null?<p className="opsEmpty">RPM не настроен. Оценка дохода недоступна.</p>:<>
   <div className="opsStats">
    <span><small>Расчётный доход</small><b>{estimate==null?'Нет данных':'≈ '+money(estimate)}</b></span>
    <span><small>Настроенный RPM</small><b>{money(rpm)}</b></span>
    <span><small>Учтено каналов</small><b>{coverage.validChannels} из {channels.length}</b></span>
    <span><small>Просмотры • 28 дней</small><b>{fmt(coverage.totalViews)}</b></span>
   </div>
   <p className="opsSourceNote">{coverage.zeroViewChannels?`${coverage.zeroViewChannels} с подтверждённым 0 просмотров • `:''}{coverage.noData?`${coverage.noData} без сохранённой статистики за 28 дней • `:''}{coverage.noAnalyticsAccess?`${coverage.noAnalyticsAccess} без доступа к Analytics • `:''}{coverage.notConnected?`${coverage.notConnected} не подключено • `:''}{coverage.updatedAt?`обновлено ${new Date(coverage.updatedAt).toLocaleString('ru-RU')}`:'нет даты обновления'}</p>
   <details><summary>Проверить расчёт по каналам</summary><div style={{display:'grid',gap:4,marginTop:8}}>{coverage.rows.map(row=><div key={row.channelId} style={{display:'flex',justifyContent:'space-between',gap:12}}><span>{row.channelName}</span><b>{row.state==='VALID'?`${fmt(row.views||0)} просмотров`:stateLabel(row.state)}</b></div>)}<div style={{display:'flex',justifyContent:'space-between',gap:12,borderTop:'1px solid var(--border)',paddingTop:6}}><span>Всего</span><b>{fmt(coverage.totalViews)}</b></div></div></details>
  </>}
  <details className="dashboardSourceDetails"><summary>Как считается оценка</summary><p>Просмотры за 28 дней по каналам с данными ÷ 1 000 × настроенный RPM. Отсутствующие данные не заменяются нулём. Это не подтверждённый доход YouTube/AdSense.</p></details>
  <footer>{rpm==null?<button onClick={onSettings}>Настроить RPM</button>:<><button onClick={onSettings}>Изменить RPM</button><button onClick={onAnalytics}>Открыть аналитику</button></>}</footer>
 </section>
}
