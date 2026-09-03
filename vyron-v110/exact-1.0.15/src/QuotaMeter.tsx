import React,{useEffect,useMemo,useState} from 'react';
import {buildYoutubeQuotaPlan,clearYoutubeQuotaGuard,loadYoutubeQuotaPlan,saveYoutubeQuotaPlan,setYoutubeQuotaLimit,subscribeYoutubeQuota,youtubeQuotaResetLocalInfo,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';

export function QuotaMeter({compact=false,defaultChannels=100}:{compact?:boolean;defaultChannels?:number}){
 const [usage,setUsage]=useState(()=>youtubeQuotaUsage());
 const [guard,setGuard]=useState(()=>youtubeQuotaState());
 const initial=loadYoutubeQuotaPlan();
 const [channels,setChannels]=useState(initial.channels||Math.max(1,defaultChannels));
 const [videos,setVideos]=useState(initial.videosPerChannel||30);
 useEffect(()=>{const refresh=()=>{setUsage(youtubeQuotaUsage());setGuard(youtubeQuotaState())};const off=subscribeYoutubeQuota(refresh);const id=window.setInterval(refresh,1000);return()=>{off();window.clearInterval(id)}},[]);
 const plan=useMemo(()=>buildYoutubeQuotaPlan(channels,videos,usage),[channels,videos,usage.ptDate,usage.limit,usage.used]);
 const pct=Math.min(100,usage.limit?usage.used/usage.limit*100:0);
 const remaining=Math.max(0,usage.limit-usage.used);
 const reset=youtubeQuotaResetLocalInfo();
 const savePlan=()=>{saveYoutubeQuotaPlan({channels,videosPerChannel:videos});setUsage(youtubeQuotaUsage())};
 return <section className={`quotaMeter ${guard.blocked?'blocked':''} ${compact?'compact':''}`}>
  <div className="quotaMeterHead"><div><small>YOUTUBE API QUOTA</small><h3>{guard.blocked?'Пауза по квоте':'Live estimate'}</h3><p>Мгновенный расчёт запросов VYRON. Google Cloud Monitoring может запаздывать на несколько минут.</p></div><span className={guard.blocked?'bad':'good'}>{guard.blocked?'QUOTA EXCEEDED':'TRACKING'}</span></div>
  <div className="quotaMeterStats"><div><small>Использовано</small><b>{usage.used.toLocaleString('ru-RU')}</b><em>из {usage.limit.toLocaleString('ru-RU')}</em></div><div><small>Осталось</small><b>{remaining.toLocaleString('ru-RU')}</b><em>units</em></div><div><small>Сегодня можно</small><b>{plan.todayChannels}</b><em>каналов × {videos} видео</em></div><div><small>Сброс по вашему времени</small><b>{reset.time}</b><em>{reset.date} • 00:00 PT</em></div></div>
  <div className="quotaMeterBar"><i style={{width:`${pct}%`}}/><span>{pct.toFixed(0)}%</span></div>
  {!compact&&<>
   <div className="quotaPlannerControls"><label>Дневной лимит<input type="number" min="1000" step="1000" value={usage.limit} onChange={e=>setUsage(setYoutubeQuotaLimit(Math.max(1000,+e.target.value||10000)))}/></label><label>Каналов в плане<input type="number" min="1" max="1000" value={channels} onChange={e=>setChannels(Math.max(1,+e.target.value||1))}/></label><label>Видео / канал<input type="number" min="1" max="1000" value={videos} onChange={e=>setVideos(Math.max(1,+e.target.value||1))}/></label><button onClick={savePlan}>Сохранить план</button>{guard.blocked&&<button onClick={()=>{clearYoutubeQuotaGuard();setGuard(youtubeQuotaState());setUsage(youtubeQuotaUsage())}}>Проверить снова</button>}</div>
   <div className="quotaPlannerSummary"><span><small>≈ на канал</small><b>{plan.perChannel.toLocaleString('ru-RU')} units</b></span><span><small>Нужно всего</small><b>{plan.totalUnits.toLocaleString('ru-RU')}</b></span><span><small>Полный день</small><b>{plan.fullDayChannels} каналов</b></span><span><small>Оценка срока</small><b>≈ {plan.days} дн.</b></span></div>
   <div className="quotaDayPlan">{plan.rows.map(r=><div key={r.day} className={!r.channels?'emptyDay':''}><b>{r.day===0?'Сегодня':`День ${r.day+1}`}</b><span>{r.channels} каналов</span><small>≈ {r.units.toLocaleString('ru-RU')} units</small></div>)}</div>
   <p className="quotaFinePrint">Планировщик использует консервативную оценку ~52 units на изменяемое видео: один videos.update (50) + обычный read/verify overhead. Уже совпадающие видео VYRON пропускает, поэтому фактический расход может быть ниже. Search/insert с 2026 года имеют отдельные granular buckets и здесь не смешиваются с основным write-пулом.</p>
  </>}
 </section>
}
