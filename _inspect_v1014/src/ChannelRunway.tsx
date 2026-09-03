import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import type {Channel} from './types';
import {
  compareRunwayRecords,
  krasnoyarskClock,
  quotaRiskCount,
  recommendedProductionIntervalDays,
  type ChannelRunwayRecord
} from './channelRunwayCore';
import {
  loadChannelRunwayStore,
  recalculateChannelRunway,
  subscribeChannelRunway,
  upsertChannelRunwayFromYoutube
} from './channelRunwayStore';
import {
  buildYoutubeQuotaPlan,
  isYoutubeQuotaError,
  loadYoutubeQuotaPlan,
  subscribeYoutubeQuota,
  youtubeQuotaMessage,
  youtubeQuotaUsage
} from './youtubeQuota';

const statusMeta:Record<ChannelRunwayRecord['status'],{label:string;icon:string}>={
  large:{label:'ЗАПАС БОЛЬШОЙ',icon:'●'},
  plan:{label:'ПОСТАВИТЬ В ПЛАН',icon:'●'},
  prepare:{label:'ГОТОВИТЬ НОВУЮ ПАЧКУ',icon:'●'},
  urgent:{label:'СРОЧНО',icon:'●'},
  ended:{label:'РАСПИСАНИЕ ЗАКОНЧИЛОСЬ',icon:'●'},
  'no-data':{label:'НЕТ ДАННЫХ',icon:'●'}
};

function dateLabel(key?:string){
  if(!key)return'—';
  const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return'—';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function syncLabel(value?:string){
  if(!value)return'YouTube не синхронизирован';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return'YouTube не синхронизирован';
  return `Синхр. ${new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)}`;
}

function tempoLabel(days?:number){
  if(!days||!Number.isFinite(days))return'—';
  if(days>=1){
    const rounded=Number.isInteger(days)?String(days):days.toFixed(1).replace('.',',');
    return `1 канал каждые ${rounded} дн.`;
  }
  const perDay=Math.round((1/days)*10)/10;
  return `${String(perDay).replace('.',',')} каналов / день`;
}

function average(values:number[]){
  if(!values.length)return undefined;
  return values.reduce((a,b)=>a+b,0)/values.length;
}

export function ChannelRunway(){
  const channels=useApp(s=>s.channels),toast=useApp(s=>s.toast);
  const [snapshot,setSnapshot]=useState(()=>loadChannelRunwayStore());
  const [busy,setBusy]=useState(''),[,setQuotaTick]=useState(0);
  const signature=channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.cadenceDays}:${c.youtubeProfileId||''}`).join('|');

  useEffect(()=>{
    setSnapshot(recalculateChannelRunway(channels,new Date(),false));
    const off=subscribeChannelRunway(()=>setSnapshot(loadChannelRunwayStore()));
    return off;
  },[signature]);

  useEffect(()=>subscribeYoutubeQuota(()=>setQuotaTick(x=>x+1)),[]);

  const active=useMemo(()=>channels.filter(c=>c.enabled),[channels]);
  const rows=useMemo(()=>active.map(channel=>({channel,record:snapshot.channels[channel.id]}))
    .filter((x):x is {channel:Channel;record:ChannelRunwayRecord}=>Boolean(x.record))
    .sort((a,b)=>compareRunwayRecords(a.record,b.record)),[active,snapshot]);

  const usage=youtubeQuotaUsage();
  const quotaSettings=loadYoutubeQuotaPlan();
  const batchSize=Math.max(1,quotaSettings.videosPerChannel);
  const capacityPlan=buildYoutubeQuotaPlan(Math.max(1,active.length),batchSize,usage);
  const attention=rows.filter(x=>x.record.runwayDays!==undefined&&x.record.runwayDays<=45);
  const reserve=rows.filter(x=>Number(x.record.runwayDays)>45);
  const critical=rows.filter(x=>x.record.runwayDays!==undefined&&x.record.runwayDays<=14);
  const unknown=rows.filter(x=>x.record.runwayDays===undefined);
  const attentionPlan=attention.length?buildYoutubeQuotaPlan(attention.length,batchSize,usage):null;
  const effectiveIntervals=rows.map(({channel,record})=>record.averagePublishIntervalDays||channel.cadenceDays).filter(x=>Number.isFinite(x)&&x>0);
  const avgCadence=average(effectiveIntervals);
  const batchCoverageDays=avgCadence?Math.round(avgCadence*batchSize*10)/10:undefined;
  const tempo=recommendedProductionIntervalDays(active.length,batchCoverageDays||0);
  const riskCount=quotaRiskCount(attention.map(x=>x.record),capacityPlan.todayChannels,capacityPlan.fullDayChannels);
  const next=rows.find(x=>x.record.runwayDays!==undefined);
  const today=krasnoyarskClock(new Date()).dateKey;
  const nextStart=next?.record.nextProductionDate;
  const startLabel=nextStart?(nextStart<=today?'Сейчас':dateLabel(nextStart)):'—';
  const calm=critical.length===0&&riskCount===0&&(next?.record.runwayDays??0)>45;

  async function syncChannel(channel:Channel){
    if(!channel.youtubeProfileId){toast(`У ${channel.name} не привязан YouTube OAuth`);return}
    setBusy(channel.id);
    try{
      const result=await api.youtubeListExisting(channel.youtubeProfileId,1000);
      const nextStore=upsertChannelRunwayFromYoutube(channel,result.videos||[],new Date());
      setSnapshot(nextStore);
      const r=nextStore.channels[channel.id];
      toast(`${channel.name}: расписание обновлено • ${r?.scheduledVideoCount||0} запланировано • до ${dateLabel(r?.scheduledUntil)}`);
    }catch(e){
      toast(isYoutubeQuotaError(e)?youtubeQuotaMessage():`Расписание ${channel.name}: ${String(e)}`);
    }finally{setBusy('')}
  }

  return <section className="panel channelRunway">
    <div className="runwayHead">
      <div><small>CHANNEL RUNWAY • LOCAL PLANNER</small><h3>План каналов</h3><p>Запас публикаций, очередь производства и квотный план считаются локально. Ежедневный пересчёт — 06:00 Asia/Krasnoyarsk, 0 API units.</p></div>
      <span className="localOnlyBadge">LOCAL • ZERO QUOTA</span>
    </div>

    <div className="runwaySummary">
      <div><small>ВСЕГО КАНАЛОВ</small><b>{active.length}</b><em>{unknown.length?`${unknown.length} без данных`:'данные локальные'}</em></div>
      <div><small>ТРЕБУЮТ ВНИМАНИЯ</small><b>{attention.length}</b><em>запас ≤ 45 дней</em></div>
      <div><small>В ЗАПАСЕ</small><b>{reserve.length}</b><em>больше 45 дней</em></div>
      <div><small>КРИТИЧЕСКИЕ</small><b>{critical.length}</b><em>≤ 14 дней</em></div>
      <div><small>МОЖНО ОБРАБОТАТЬ СЕГОДНЯ</small><b>{capacityPlan.todayChannels}</b><em>по текущей квоте</em></div>
      <div><small>КВОТНЫХ ДНЕЙ НУЖНО</small><b>{attentionPlan?.days||0}</b><em>для каналов внимания</em></div>
      <div><small>РЕКОМЕНДУЕМЫЙ ТЕМП</small><b>{tempoLabel(tempo)}</b><em>{batchCoverageDays?`пачка ≈ ${batchCoverageDays} дней`:`пачка ${batchSize} видео`}</em></div>
      <div><small>СЛЕДУЮЩИЙ КАНАЛ</small><b>{next?.channel.name||'—'}</b><em>{next?`начать: ${startLabel}`:'нет данных'}</em></div>
    </div>

    <div className={`runwayAdvice ${calm?'good':riskCount?'danger':'work'}`}>
      <b>{calm?'Спешить не нужно.':riskCount?'Есть риск по квоте.':'Работа по плану.'}</b>
      <span>{tempo?`При текущем запасе ориентир — ${tempoLabel(tempo)} `:''}{next?`Следующий: ${next.channel.name}, запас ${next.record.runwayDays??'—'} дней.`:'Сначала синхронизируй расписание каналов.'}{riskCount?` Риск не успеть: ${riskCount}.`:''}</span>
    </div>

    <div className="runwayTable">
      <div className="runwayRow runwayTh">
        <span>Канал</span><span>Запланировано до</span><span>Осталось</span><span>Видео</span><span>Интервал</span><span>Готовить с</span><span>Статус</span><span>Действие</span>
      </div>
      {rows.length===0?<div className="empty"><b>Нет активных каналов</b><p>Channel Runway не создаёт демонстрационные данные.</p></div>:rows.map(({channel,record})=>{
        const meta=statusMeta[record.status];
        return <div className="runwayRow" key={channel.id}>
          <span className="runwayChannel"><b>{channel.name}</b><small>{syncLabel(record.lastScheduleSync)}</small></span>
          <span><b>{dateLabel(record.scheduledUntil)}</b></span>
          <span className={`runwayDays ${record.status}`}>{record.runwayDays===undefined?'—':`${record.runwayDays} дн.`}</span>
          <span>{record.runwayDays===undefined?'—':record.scheduledVideoCount}</span>
          <span>{record.runwayDays===undefined?'—':record.averagePublishIntervalDays?`1 / ${String(record.averagePublishIntervalDays).replace('.',',')} дн.`:`≈ 1 / ${channel.cadenceDays} дн.`}</span>
          <span>{record.runwayDays===undefined?'—':record.runwayDays<=45?'Сейчас':dateLabel(record.nextProductionDate)}</span>
          <span className={`runwayStatus ${record.status}`}><i>{meta.icon}</i>{meta.label}</span>
          <span><button disabled={busy===channel.id||!channel.youtubeProfileId} onClick={()=>void syncChannel(channel)}>{busy===channel.id?'СИНХРОНИЗАЦИЯ…':'ОБНОВИТЬ РАСПИСАНИЕ'}</button></span>
        </div>
      })}
    </div>

    <div className="runwayFoot">
      <span>Ежедневный локальный расчёт: <b>06:00 KRAT</b></span>
      <span>Размер пачки из Quota Planner: <b>{batchSize} видео</b></span>
      <span>Остаток квоты: <b>{Math.max(0,usage.limit-usage.used).toLocaleString('ru-RU')} units</b></span>
    </div>
  </section>;
}
