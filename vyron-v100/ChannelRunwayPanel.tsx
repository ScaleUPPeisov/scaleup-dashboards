import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {dateKeyInZone,formatDateKeyRu,nextKrasnoyarskSixAt,readChannelRunwayState,recalculateChannelRunway,subscribeChannelRunway,type ChannelRunwayRow,type RunwayStatus} from './channelRunway';
import './ChannelRunway.css';

const statusLabel:Record<RunwayStatus,string>={safe:'ЗАПАС БОЛЬШОЙ',plan:'ПОСТАВИТЬ В ПЛАН',prepare:'ГОТОВИТЬ ПАЧКУ',urgent:'СРОЧНО',empty:'РАСПИСАНИЕ ЗАКОНЧИЛОСЬ',nodata:'НЕТ ДАННЫХ'};
const statusIcon:Record<RunwayStatus,string>={safe:'●',plan:'●',prepare:'●',urgent:'●',empty:'●',nodata:'○'};
const localDate=(iso?:string)=>iso?formatDateKeyRu(dateKeyInZone(iso)):'—';
const localDateTime=(iso?:string)=>{if(!iso)return'—';const d=new Date(iso);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d):'—'};

export function ChannelRunway({onOpenSync}:{onOpenSync?:()=>void}){
 const channels=useApp(s=>s.channels);const [state,setState]=useState(()=>readChannelRunwayState());
 useEffect(()=>{setState(recalculateChannelRunway(channels));const off=subscribeChannelRunway(()=>setState(readChannelRunwayState()));return off},[channels.map(c=>`${c.id}:${c.enabled}:${c.cadenceDays}:${c.targetBufferDays}`).join('|')]);
 const rows=useMemo(()=>Object.values(state?.rows||{}).sort((a,b)=>a.priorityRank-b.priorityRank||(a.runwayDays??99999)-(b.runwayDays??99999)||a.channelName.localeCompare(b.channelName)),[state]);
 const plan=state?.plan;const nextSix=nextKrasnoyarskSixAt(new Date());
 const pace=plan?.recommendedBatchesPerDay&&plan.recommendedBatchesPerDay>1?`≈ ${Math.round(plan.recommendedBatchesPerDay*10)/10} канала/день`:plan?.recommendedPaceDays?`≈ 1 канал каждые ${plan.recommendedPaceDays} дн.`:'—';
 const nextText=plan?.nextChannelName?`${plan.nextChannelName}${plan.nextProductionInDays!==undefined?(plan.nextProductionInDays<=0?' • начинать сейчас':` • через ${plan.nextProductionInDays} дн.`):''}`:'—';
 return <section className="channelRunway">
  <div className="runwayHero panel"><div><small>CHANNEL RUNWAY • LOCAL ONLY</small><h3>План каналов</h3><p>Запас запланированных публикаций, очередь производства и квотный план. Ежедневный пересчёт — локально, без YouTube API.</p></div><div className="runwayHeroActions"><span className="localOnlyBadge">0 API units</span><button onClick={()=>setState(recalculateChannelRunway(channels))}>Пересчитать локально</button>{onOpenSync&&<button className="primary" onClick={onOpenSync}>Открыть синхронизацию</button>}</div></div>
  <div className="runwayMetrics">
   <Metric label="ВСЕГО КАНАЛОВ" value={plan?.enabledChannels??channels.filter(c=>c.enabled).length} note={`${plan?.totalChannels??channels.length} в системе`}/>
   <Metric label="ТРЕБУЮТ ВНИМАНИЯ" value={plan?.attention??0} note="≤45 дней или нет данных"/>
   <Metric label="КРИТИЧЕСКИЕ" value={plan?.critical??0} note="≤14 дней" tone="danger"/>
   <Metric label="КВОТА / ДЕНЬ" value={plan?.fullQuotaCapacity??0} note={`≈ каналов × ${plan?.averageBatchVideos??'—'} видео`}/>
   <Metric label="КВОТНЫХ ДНЕЙ" value={plan?.quotaDaysAll??0} note="на полный цикл всех каналов"/>
   <Metric label="РЕКОМЕНДУЕМЫЙ ТЕМП" value={pace} note={`средняя пачка ≈ ${plan?.averageBatchCoverageDays??'—'} дней`}/>
  </div>
  <div className="runwayDecision panel"><div><small>СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</small><h3>{nextText}</h3><p>{plan?.nextProductionDate?`Плановая дата начала: ${formatDateKeyRu(plan.nextProductionDate)}.`:'Сначала синхронизируй расписание нужных каналов вручную во вкладке «Загруженные».'}</p></div><div className="runwayDecisionStats"><span><small>Сегодня по остатку квоты</small><b>{plan?.remainingQuotaCapacity??0} каналов</b></span><span><small>Квота</small><b>{(plan?.quotaRemaining??0).toLocaleString('ru-RU')} / {(plan?.quotaLimit??0).toLocaleString('ru-RU')}</b></span><span><small>Следующий авторасчёт</small><b>{new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Krasnoyarsk'}).format(nextSix)} KRAT</b></span></div></div>
  <div className="panel runwayTablePanel"><div className="panelHead"><div><small>ВСЕ КАНАЛЫ</small><h3>Запланировано до</h3><p>Источник — только сохранённый локальный cache последней ручной YouTube-синхронизации/применённого расписания.</p></div><span>{state?`Расчёт: ${localDateTime(state.calculatedAt)}`:'Нет расчёта'}</span></div>
   {rows.length===0?<div className="empty"><b>Каналов пока нет</b><p>После добавления каналов Runway рассчитает очередь автоматически.</p></div>:<div className="runwayTable"><div className="runwayTr runwayTh"><span>Канал</span><span>Запланировано до</span><span>Осталось</span><span>Видео</span><span>Интервал</span><span>Следующая пачка</span><span>Статус</span></div>{rows.map(r=><RunwayRow key={r.channelId} row={r}/>)}</div>}
  </div>
  <div className="runwayFoot"><b>06:00 Asia/Krasnoyarsk</b><span>Если VYRON закрыт в 06:00, пропущенный расчёт выполняется при следующем запуске/возврате приложения. YouTube API при этом не вызывается.</span></div>
 </section>
}

function Metric({label,value,note,tone=''}:{label:string;value:React.ReactNode;note:string;tone?:string}){return <div className={`runwayMetric ${tone}`}><small>{label}</small><b>{value}</b><span>{note}</span></div>}
function RunwayRow({row:r}:{row:ChannelRunwayRow}){return <div className={`runwayTr status-${r.status}`}><span className="runwayChannel"><i className={`runwayDot ${r.status}`}/><b>{r.channelName}</b><small>{r.enabled?'активен':'выключен'} • раз в {r.cadenceDays} дн.</small></span><span><b>{localDate(r.scheduledUntil)}</b><small>{r.lastScheduleSync?`sync ${localDateTime(r.lastScheduleSync)}`:'нет ручной sync'}</small></span><span className="runwayDays"><b>{r.runwayDays===undefined?'—':`${r.runwayDays} дн.`}</b><small>запас</small></span><span><b>{r.scheduledVideoCount}</b><small>в будущем</small></span><span><b>{r.averagePublishIntervalDays?`${r.averagePublishIntervalDays} дн.`:'—'}</b><small>публикация</small></span><span><b>{formatDateKeyRu(r.nextProductionDate)}</b><small>≈ {r.batchVideos} видео / {r.batchCoverageDays} дн.</small></span><span className={`runwayStatus ${r.status}`}><i>{statusIcon[r.status]}</i>{statusLabel[r.status]}</span></div>}
