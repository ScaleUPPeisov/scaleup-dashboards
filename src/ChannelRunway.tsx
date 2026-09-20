import React,{useEffect,useMemo,useState} from 'react';
import {api,type GoogleConfigStatus} from './api';
import {useApp} from './store';
import type {Channel,YoutubeProfile} from './types';
import {classifyYoutubeChannels} from './youtubeStatisticsCenter';
import {refreshYoutubeChannelStatistics,refreshYoutubeProfileStatistics,type ChannelStatisticsRefreshProgress} from './youtubeChannelStatsRuntime';
import {compactChannelStat,subscriberStatLabel} from './youtubeChannelStats';
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
import {buildContentRunway,contentRunwayQuotaView,type ContentRunwaySnapshot} from './contentRunway';
import {scheduleAverageIntervalDays,scheduleDescription} from './channelSchedule';
import {
  buildYoutubeQuotaPlan,
  isYoutubeQuotaError,
  loadYoutubeQuotaPlan,
  subscribeYoutubeQuota,
  youtubeQuotaMessage,
  youtubeQuotaProjectIdentity,
  youtubeQuotaUsage,
  youtubeUploadQuotaState
} from './youtubeQuota';

const statusMeta:Record<ChannelRunwayRecord['status'],{label:string;icon:string}>={
  large:{label:'ЗАПАС БОЛЬШОЙ',icon:'●'},
  plan:{label:'ПОСТАВИТЬ В ПЛАН',icon:'●'},
  prepare:{label:'ГОТОВИТЬ НОВУЮ ПАЧКУ',icon:'●'},
  urgent:{label:'СРОЧНО',icon:'●'},
  ended:{label:'ЗАПАС ЗАКОНЧИЛСЯ',icon:'●'},
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

type RunwayRow={channel:Channel;record:ChannelRunwayRecord;content:ContentRunwaySnapshot;uploadRemaining:number|null;uploadLimitKnown:boolean};

export function ChannelRunway(){
  const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),uploadHistory=useApp(s=>s.uploadHistory),projectLifecycle=useApp(s=>s.projectLifecycle),fingerprintCache=useApp(s=>s.fingerprintCache),toast=useApp(s=>s.toast);
  const [snapshot,setSnapshot]=useState(()=>loadChannelRunwayStore());
  const [busy,setBusy]=useState(''),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[googleConfig,setGoogleConfig]=useState<GoogleConfigStatus>(),[statsBusy,setStatsBusy]=useState(false),[statsProgress,setStatsProgress]=useState<ChannelStatisticsRefreshProgress>({done:0,total:0});
  const [,setQuotaTick]=useState(0);
  const signature=channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.cadenceDays}:${c.scheduleMode||'interval'}:${c.publishIntervalDays||''}:${c.publishDays||''}:${c.pauseDays||''}:${c.patternAnchorDate||''}:${c.youtubeProfileId||''}`).join('|');

  useEffect(()=>{
    setSnapshot(recalculateChannelRunway(channels,new Date(),false));
    const off=subscribeChannelRunway(()=>setSnapshot(loadChannelRunwayStore()));
    return off;
  },[signature]);

  useEffect(()=>subscribeYoutubeQuota(()=>setQuotaTick(x=>x+1)),[]);
  useEffect(()=>{let live=true;void Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig()]).then(([p,c])=>{if(live){setProfiles(p);setGoogleConfig(c)}}).catch(()=>{});return()=>{live=false}},[]);

  const active=useMemo(()=>channels.filter(c=>c.enabled),[channels]);
  const youtubeClassification=useMemo(()=>classifyYoutubeChannels(active,profiles),[active,profiles]);
  const linkedByLocalId=useMemo(()=>new Map(youtubeClassification.linked.map(x=>[x.channel.id,x])),[youtubeClassification]);
  const profileById=useMemo(()=>new Map(profiles.map(p=>[p.id,p])),[profiles]);
  const usage=youtubeQuotaUsage();
  const rows=useMemo(()=>active.map(channel=>{
    const record=snapshot.channels[channel.id];if(!record)return null;
    const content=buildContentRunway(channel,record,jobs,uploadHistory,projectLifecycle,fingerprintCache,new Date());
    const profile=channel.youtubeProfileId?profileById.get(channel.youtubeProfileId):undefined;
    const projectKey=youtubeQuotaProjectIdentity(profile,googleConfig).projectKey;
    const upload=projectKey?youtubeUploadQuotaState(projectKey):null;
    const quota=contentRunwayQuotaView(usage,upload);
    return{channel,record,content,uploadRemaining:quota.uploads.remaining,uploadLimitKnown:quota.uploads.limitKnown} satisfies RunwayRow;
  }).filter((x):x is RunwayRow=>Boolean(x)).sort((a,b)=>a.content.contentRunwayDays-b.content.contentRunwayDays||compareRunwayRecords(a.record,b.record)),[active,snapshot,jobs,uploadHistory,projectLifecycle,fingerprintCache,profileById,googleConfig,usage.ptDate,usage.used,usage.limit]);

  const quotaSettings=loadYoutubeQuotaPlan();
  const batchSize=Math.max(1,quotaSettings.videosPerChannel);
  const capacityPlan=buildYoutubeQuotaPlan(Math.max(1,active.length),batchSize,usage);
  const attention=rows.filter(x=>x.content.contentRunwayDays<=45);
  const reserve=rows.filter(x=>x.content.contentRunwayDays>45);
  const critical=rows.filter(x=>x.content.contentRunwayDays<=14);
  const unknown=rows.filter(x=>x.record.status==='no-data'&&x.content.readyVideoCount===0);
  const attentionPlan=attention.length?buildYoutubeQuotaPlan(attention.length,batchSize,usage):null;
  const effectiveIntervals=rows.map(({channel,record})=>record.averagePublishIntervalDays||scheduleAverageIntervalDays(channel)).filter(x=>Number.isFinite(x)&&x>0);
  const avgCadence=average(effectiveIntervals);
  const batchCoverageDays=avgCadence?Math.round(avgCadence*batchSize*10)/10:undefined;
  const tempo=recommendedProductionIntervalDays(active.length,batchCoverageDays||0);
  const riskRecords=attention.map(x=>({...x.record,runwayDays:x.content.contentRunwayDays}));
  const riskCount=quotaRiskCount(riskRecords,capacityPlan.todayChannels,capacityPlan.fullDayChannels);
  const next=rows[0];
  const today=krasnoyarskClock(new Date()).dateKey;
  const nextStart=next?.record.nextProductionDate;
  const startLabel=nextStart?(nextStart<=today?'Сейчас':dateLabel(nextStart)):'—';
  const calm=critical.length===0&&riskCount===0&&(next?.content.contentRunwayDays??0)>45;
  const totalReady=rows.reduce((n,x)=>n+x.content.readyVideoCount,0);
  const generalRemaining=Math.max(0,usage.limit-usage.used);

  async function syncChannel(channel:Channel){
    const linked=linkedByLocalId.get(channel.id);
    if(!linked){toast(`${channel.name}: YouTube не связан точно с OAuth profile • API call не выполнен`);return}
    setBusy(channel.id);
    try{
      const result=await api.youtubeListExisting(linked.profile.id,1000);
      if(!(result.syncComplete??result.complete)){toast(`${channel.name}: синхронизация неполная • ${result.videosHydrated??result.received}/${result.uniqueVideoIds??result.youtubeFound} • расписание не заменено`);return}
      const nextStore=upsertChannelRunwayFromYoutube(channel,result.videos||[],new Date());
      setSnapshot(nextStore);
      const r=nextStore.channels[channel.id];
      toast(`${channel.name}: расписание обновлено • ${r?.scheduledVideoCount||0} запланировано • до ${dateLabel(r?.scheduledUntil)}`);
    }catch(e){
      toast(isYoutubeQuotaError(e)?youtubeQuotaMessage():`Расписание ${channel.name}: ${String(e)}`);
    }finally{setBusy('')}
  }

  async function refreshAllStats(){
    if(statsBusy)return;setStatsBusy(true);setStatsProgress({done:0,total:youtubeClassification.eligible.length});
    try{const result=await refreshYoutubeChannelStatistics(true,setStatsProgress);toast(result.failed?`YouTube данные: обновлено ${result.updated}, ошибок ${result.failed}`:`✓ YouTube данные: ${result.updated} каналов • API ${result.apiRequests} • quota ${result.quotaUnits}`)}
    catch(e){toast(`Статистика каналов: ${String(e)}`)}finally{setStatsBusy(false)}
  }
  async function refreshRowStats(channel:Channel){
    const linked=linkedByLocalId.get(channel.id);if(!linked){toast(`${channel.name}: YouTube не подключён • API call 0`);return}
    setBusy(`stats:${channel.id}`);try{const ok=await refreshYoutubeProfileStatistics(linked.profile,`runway-stats:${channel.id}:${Date.now()}`);toast(ok?`✓ ${channel.name}: YouTube данные обновлены`:`⚠ ${channel.name}: сохранены последние данные`)}finally{setBusy('')}
  }
  function openStatistics(channel:Channel){sessionStorage.setItem('vyron:statistics:selected-channel',channel.id);window.dispatchEvent(new Event('vyron:youtube-statistics'))}
  function openAccounts(channel:Channel){sessionStorage.setItem('vyron:accounts:focus-channel',channel.id);window.dispatchEvent(new Event('vyron:youtube-accounts'))}

  return <section className="panel channelRunway">
    <div className="runwayHead">
      <div><small>CONTENT RUNWAY • LOCAL + QUOTA AWARE</small><h3>Запас контента</h3><p>VYRON соединяет подтверждённое YouTube-расписание с реально готовыми локальными render-файлами. Local projects и реально подключённые YouTube-каналы считаются отдельно.</p></div>
      <div className="headerActions"><span className="localOnlyBadge">CALCULATION • ZERO API</span><button disabled={statsBusy||!youtubeClassification.eligible.length} onClick={()=>void refreshAllStats()}>{statsBusy?`↻ ${statsProgress.done} / ${statsProgress.total}`:'↻ Обновить YouTube данные'}</button></div>
    </div>

    <div className="runwaySummary">
      <div><small>ВСЕГО ПРОЕКТОВ</small><b>{active.length}</b><em>local VYRON</em></div>
      <div><small>YOUTUBE ПОДКЛЮЧЕНО</small><b>{youtubeClassification.eligible.length}</b><em>exact Profile + Channel ID</em></div>
      <div><small>НЕ ПОДКЛЮЧЕНО</small><b>{youtubeClassification.unlinked.length+youtubeClassification.orphans.length+youtubeClassification.mismatched.length}</b><em>API 0 • duplicates {youtubeClassification.duplicates.length}</em></div>
      <div><small>ГОТОВЫХ ВИДЕО</small><b>{totalReady}</b><em>не загружены • dedupe включён</em></div>
      <div><small>ТРЕБУЮТ ВНИМАНИЯ</small><b>{attention.length}</b><em>content runway ≤ 45 дней</em></div>
      <div><small>КРИТИЧЕСКИЕ</small><b>{critical.length}</b><em>≤ 14 дней</em></div>
      <div><small>GENERAL API</small><b>{generalRemaining.toLocaleString('ru-RU')}</b><em>из {usage.limit.toLocaleString('ru-RU')} local ledger</em></div>
      <div><small>МОЖНО ОБРАБОТАТЬ СЕГОДНЯ</small><b>{capacityPlan.todayChannels}</b><em>по General API плану</em></div>
      <div><small>РЕКОМЕНДУЕМЫЙ ТЕМП</small><b>{tempoLabel(tempo)}</b><em>{batchCoverageDays?`пачка ≈ ${batchCoverageDays} дней`:`пачка ${batchSize} видео`}</em></div>
      <div><small>СЛЕДУЮЩИЙ КАНАЛ</small><b>{next?.channel.name||'—'}</b><em>{next?`content runway ${next.content.contentRunwayDays} дн.`:'нет данных'}</em></div>
    </div>

    <div className={`runwayAdvice ${calm?'good':riskCount?'danger':'work'}`}>
      <b>{calm?'Спешить не нужно.':riskCount?'Есть риск по производственному плану.':'Работа по плану.'}</b>
      <span>{tempo?`При текущем запасе ориентир — ${tempoLabel(tempo)} `:''}{next?`Следующий: ${next.channel.name}, content runway ${next.content.contentRunwayDays} дней до ${dateLabel(next.content.projectedRunwayEnd)}.`:'Сначала синхронизируй расписание каналов.'}{riskCount?` Риск не успеть: ${riskCount}.`:''}</span>
    </div>

    <div className="runwayTable">
      <div className="runwayRow runwayTh">
        <span>Канал</span><span>Запланировано до</span><span>Content runway</span><span>Запас</span><span>Scheduled</span><span>Ready</span><span>Cadence</span><span>Uploads</span><span>Статус</span><span>Действие</span>
      </div>
      {rows.length===0?<div className="empty"><b>Нет активных каналов</b><p>Content Runway не создаёт демонстрационные данные.</p></div>:rows.map(({channel,record,content,uploadRemaining,uploadLimitKnown})=>{
        const meta=statusMeta[content.status];
        return <div className="runwayRow" key={channel.id}>
          <span className="runwayChannel"><b>{channel.name}</b><small>{syncLabel(record.lastScheduleSync)}</small><small>{linkedByLocalId.has(channel.id)?`Subs ${subscriberStatLabel(channel.stats)} • Views ${compactChannelStat(channel.stats?.viewCount??channel.stats?.views)}`:'YouTube: НЕ ПОДКЛЮЧЁН'}</small></span>
          <span><b>{dateLabel(content.scheduledThrough)}</b></span>
          <span><b>{dateLabel(content.projectedRunwayEnd)}</b><small>{content.readyVideoCount?`+${content.readyVideoCount} slots`:'без локального буфера'}</small></span>
          <span className={`runwayDays ${content.status}`}>{`${content.contentRunwayDays} дн.`}</span>
          <span>{content.scheduledVideoCount}</span>
          <span><b>{content.readyVideoCount}</b></span>
          <span>{scheduleDescription(channel)}</span>
          <span className="runwayQuota">{uploadLimitKnown?<><b>{uploadRemaining}</b><small>доступно</small></>:<><b>—</b><small>лимит проекта не подтверждён</small></>}</span>
          <span className={`runwayStatus ${content.status}`}><i>{meta.icon}</i>{meta.label}</span>
          <span>{linkedByLocalId.has(channel.id)?<><button disabled={busy===channel.id} onClick={()=>void syncChannel(channel)}>{busy===channel.id?'СИНХРОНИЗАЦИЯ…':'ОБНОВИТЬ РАСПИСАНИЕ'}</button><button disabled={busy===`stats:${channel.id}`||statsBusy} onClick={()=>void refreshRowStats(channel)}>{busy===`stats:${channel.id}`?'↻…':'↻ YT'}</button><button onClick={()=>openStatistics(channel)}>Статистика</button></>:<button onClick={()=>openAccounts(channel)}>Подключить</button>}</span>
        </div>
      })}
    </div>

    <div className="runwayFoot">
      <span>Расчёт runway: <b>локально • 0 YouTube API</b></span>
      <span>General API: <b>{usage.used.toLocaleString('ru-RU')} / {usage.limit.toLocaleString('ru-RU')}</b></span>
      <span>Video Uploads: <b>отдельный per-project ledger</b></span>
      <span>Размер пачки Quota Planner: <b>{batchSize} видео</b></span>
      <span>План General API для внимания: <b>{attentionPlan?.days||0} квотных дней</b></span>
      <span>Следующее производство: <b>{startLabel}</b></span>
    </div>
  </section>;
}
