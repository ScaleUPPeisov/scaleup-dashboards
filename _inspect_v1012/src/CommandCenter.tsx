import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {
  compareRunwayRecords,
  recommendedProductionIntervalDays,
  type ChannelRunwayRecord
} from './channelRunwayCore';
import {loadChannelRunwayStore,subscribeChannelRunway} from './channelRunwayStore';
import {
  buildAttentionItems,
  buildLocalBatchPlan,
  productionForecast,
  productionReadiness,
  recommendedWeeklyLoad
} from './commandCenterCore';
import {
  clearBatchPlan,
  loadCommandCenterStore,
  saveBatchPlan,
  selectCommandCenterChannel,
  subscribeCommandCenter
} from './commandCenterStore';
import {
  buildYoutubeQuotaPlan,
  loadYoutubeQuotaPlan,
  subscribeYoutubeQuota,
  youtubeQuotaUsage
} from './youtubeQuota';

const dateLabel=(key?:string)=>{
  if(!key)return'—';
  const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}.${m[2]}.${m[1]}`:'—';
};
const tempoLabel=(days?:number)=>{
  if(!days||!Number.isFinite(days))return'—';
  if(days>=1)return `1 канал каждые ${Number.isInteger(days)?days:days.toFixed(1).replace('.',',')} дн.`;
  return `${(1/days).toFixed(1).replace('.',',')} каналов / день`;
};
const average=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:undefined;

export function CommandCenter(){
  const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),toast=useApp(s=>s.toast);
  const [runway,setRunway]=useState(()=>loadChannelRunwayStore());
  const [local,setLocal]=useState(()=>loadCommandCenterStore());
  const [quotaTick,setQuotaTick]=useState(0);
  const active=useMemo(()=>channels.filter(c=>c.enabled),[channels]);
  const quotaSettings=loadYoutubeQuotaPlan();
  const batchSize=Math.max(1,quotaSettings.videosPerChannel);
  const [batchCount,setBatchCount]=useState(batchSize);

  useEffect(()=>{
    const offRunway=subscribeChannelRunway(()=>setRunway(loadChannelRunwayStore()));
    const offLocal=subscribeCommandCenter(()=>setLocal(loadCommandCenterStore()));
    const offQuota=subscribeYoutubeQuota(()=>setQuotaTick(x=>x+1));
    return()=>{offRunway();offLocal();offQuota()};
  },[]);

  const selected=active.find(c=>c.id===local.selectedChannelId)||active[0];
  const rows=useMemo(()=>active.map(channel=>({channel,record:runway.channels[channel.id]}))
    .sort((a,b)=>{
      if(a.record&&b.record)return compareRunwayRecords(a.record,b.record);
      if(a.record)return-1;if(b.record)return 1;
      return a.channel.name.localeCompare(b.channel.name,'ru');
    }),[active,runway]);

  const effectiveIntervals=rows
    .map(({channel,record})=>record?.averagePublishIntervalDays||channel.cadenceDays)
    .filter(x=>Number.isFinite(x)&&x>0);
  const avgCadence=average(effectiveIntervals);
  const batchCoverageDays=avgCadence?Math.round(avgCadence*batchSize*10)/10:undefined;
  const tempo=recommendedProductionIntervalDays(active.length,batchCoverageDays||0);
  const weekly=recommendedWeeklyLoad(tempo);
  const forecast=productionForecast(active,runway.channels,jobs,batchSize,new Date());
  const attention=buildAttentionItems(active,runway.channels,jobs,batchSize);
  const usage=youtubeQuotaUsage();void quotaTick;
  const quotaPlan=forecast.dueNow?buildYoutubeQuotaPlan(forecast.dueNow,batchSize,usage):null;
  const capacity=buildYoutubeQuotaPlan(Math.max(1,active.length),batchSize,usage);
  const plan=selected?local.batchPlans[selected.id]:undefined;

  function createPlan(){
    if(!selected)return;
    const next=buildLocalBatchPlan(selected,batchCount,runway.channels[selected.id]?.scheduledUntil,new Date());
    saveBatchPlan(next);setLocal(loadCommandCenterStore());
    toast(`${selected.name}: локальный план ${next.count} видео создан • 0 API units`);
  }

  return <section className="panel commandCenter">
    <div className="commandCenterHead">
      <div><small>VYRON COMMAND CENTER • LOCAL INTELLIGENCE</small><h3>Командный центр</h3><p>Что делать сегодня, какой канал следующий, сколько уже готово и как распределить производство без фоновых YouTube-запросов.</p></div>
      <span className="localOnlyBadge">LOCAL • 0 API</span>
    </div>

    <div className="commandSummary">
      <div><small>КАНАЛОВ</small><b>{active.length}</b><em>активных</em></div>
      <div><small>НУЖНО В ПЛАН</small><b>{forecast.dueNow}</b><em>runway ≤ 45 дней</em></div>
      <div><small>КРИТИЧЕСКИЕ</small><b>{forecast.critical}</b><em>runway ≤ 14 дней</em></div>
      <div><small>ГОТОВО К YOUTUBE</small><b>{forecast.readyToYoutube}</b><em>локально проверено</em></div>
      <div><small>SEO НУЖНО ДОБИТЬ</small><b>{forecast.missingSeo}</b><em>готовое видео без полного SEO</em></div>
      <div><small>КВОТА СЕГОДНЯ</small><b>{capacity.todayChannels}</b><em>каналов по {batchSize} видео</em></div>
      <div><small>КВОТНЫХ ДНЕЙ</small><b>{quotaPlan?.days||0}</b><em>для текущего внимания</em></div>
      <div><small>ТЕМП</small><b>{tempoLabel(tempo)}</b><em>{weekly?`≈ ${weekly} кан./нед.`:'нет данных'}</em></div>
    </div>

    <div className="commandGrid">
      <div className="commandBlock attentionCenter">
        <div className="commandBlockHead"><div><small>ATTENTION CENTER</small><h4>Что требует внимания</h4></div><span>{attention.length}</span></div>
        {attention.length===0?<div className="commandEmpty"><b>Срочных действий нет</b><span>Запасы и локальная подготовка находятся в норме.</span></div>:<div className="attentionList">{attention.slice(0,10).map((item,index)=><div key={`${item.channelId}:${item.title}:${index}`} className={`attentionItem ${item.severity}`}><i/><span><b>{item.channelName} • {item.title}</b><small>{item.detail}</small></span></div>)}</div>}
      </div>

      <div className="commandBlock forecastBlock">
        <div className="commandBlockHead"><div><small>PRODUCTION FORECAST</small><h4>Производственный прогноз</h4></div><span>0 API</span></div>
        <div className="forecastFacts">
          <div><b>{forecast.next7Days}</b><span>каналов войдут в окно производства за 7 дней</span></div>
          <div><b>{batchCoverageDays?`${batchCoverageDays} дн.`:'—'}</b><span>примерный запас одной пачки</span></div>
          <div><b>{Math.max(0,usage.limit-usage.used).toLocaleString('ru-RU')}</b><span>локально учтённых units осталось</span></div>
        </div>
        <p>Command Center не обновляет YouTube сам. Свежесть Scheduled берётся из Channel Runway; ручная синхронизация остаётся во вкладке «План каналов».</p>
      </div>
    </div>

    <div className="commandBlock networkPlan">
      <div className="commandBlockHead"><div><small>NETWORK PLAN</small><h4>Очередь каналов</h4></div><span>{rows.length}</span></div>
      <div className="commandTable">
        <div className="commandRow commandTh"><span>Канал</span><span>Запас</span><span>Готовить</span><span>Production</span><span>Готово к YouTube</span><span>Статус</span></div>
        {rows.map(({channel,record})=>{
          const ready=productionReadiness(channel,jobs,batchSize);
          const runwayDays=record?.runwayDays;
          const status:ChannelRunwayRecord['status']=record?.status||'no-data';
          return <div className="commandRow" key={channel.id}>
            <span><b>{channel.name}</b><small>{record?.scheduledUntil?`до ${dateLabel(record.scheduledUntil)}`:'YouTube не подтверждён'}</small></span>
            <span className={`commandRunway ${status}`}>{runwayDays===undefined?'—':`${runwayDays} дн.`}</span>
            <span>{runwayDays===undefined?'—':runwayDays<=45?'Сейчас':dateLabel(record?.nextProductionDate)}</span>
            <span><b>{ready.progress}%</b><small>{ready.videos}/{batchSize} видео</small></span>
            <span><b>{ready.readyToYoutube}</b><small>из локальных jobs</small></span>
            <span>{status==='large'?'ЗАПАС':status==='plan'?'В ПЛАН':status==='prepare'?'ГОТОВИТЬ':status==='urgent'?'СРОЧНО':status==='ended'?'ЗАКОНЧИЛОСЬ':'НЕТ ДАННЫХ'}</span>
          </div>
        })}
      </div>
    </div>

    <div className="commandBlock batchBuilder">
      <div className="commandBlockHead"><div><small>SMART BATCH BUILDER</small><h4>Локальная пачка</h4></div><span>НЕ ТРОГАЕТ YOUTUBE</span></div>
      {active.length===0?<div className="commandEmpty"><b>Нет активных каналов</b><span>План не создаёт демонстрационные данные.</span></div>:<>
        <div className="batchControls">
          <label>Канал<select value={selected?.id||''} onChange={e=>{selectCommandCenterChannel(e.target.value);setLocal(loadCommandCenterStore())}}>{active.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
          <label>Видео в пачке<input type="number" min="1" max="300" value={batchCount} onChange={e=>setBatchCount(Math.max(1,Math.min(300,+e.target.value||1)))}/></label>
          <button onClick={createPlan}>СОЗДАТЬ ЛОКАЛЬНЫЙ ПЛАН</button>
          {plan&&<button className="secondary" onClick={()=>{clearBatchPlan(plan.channelId);setLocal(loadCommandCenterStore())}}>ОЧИСТИТЬ</button>}
        </div>
        {plan?<div className="batchPreview">
          <div className="batchPreviewHead"><span><b>{plan.channelName}</b><small>{plan.count} видео • интервал {plan.cadenceDays} дн.</small></span><span><b>Первая публикация</b><small>{dateLabel(plan.startDate)}</small></span><span><b>Последняя публикация</b><small>{dateLabel(plan.items.at(-1)?.publishDate)}</small></span></div>
          <div className="batchItems">{plan.items.slice(0,12).map(item=><span key={item.number}><b>{item.label}</b><small>{dateLabel(item.publishDate)}</small></span>)}{plan.items.length>12&&<span className="batchMore"><b>+{plan.items.length-12}</b><small>остальные видео</small></span>}</div>
          <p>План сохранён в `vyron:command-center:v1`. Он не создаёт YouTube-вызовов и не изменяет существующий Production автоматически.</p>
        </div>:<div className="commandEmpty"><b>Пачка ещё не создана</b><span>Если есть подтверждённый Scheduled runway, первая дата будет поставлена после последнего запланированного видео с учётом cadence канала.</span></div>}
      </>}
    </div>
  </section>;
}
