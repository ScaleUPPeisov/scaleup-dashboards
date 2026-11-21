import React,{useEffect,useMemo,useState} from 'react';
import {api,type GoogleConfigStatus} from './api';
import {useApp} from './store';
import type {Channel,YoutubeProfile} from './types';
import {classifyYoutubeChannels} from './youtubeStatisticsCenter';
import {refreshYoutubeProfileStatistics,type ChannelStatisticsRefreshProgress} from './youtubeChannelStatsRuntime';
import {refreshAllChannelData} from './fullChannelRefresh';
import {knownOwnerVideoIdsFromUploadHistory,refreshOwnerInventoriesAuthoritative} from './youtubeOwnerInventory';
import {compactChannelStat,subscriberStatLabel} from './youtubeChannelStats';
import {
  compareYoutubeOnlyRunwayPriority,
  calendarDaysBetween,
  dateKeyInKrasnoyarsk,
  runwayStatus,
  runwayDisplayEvidence,
  krasnoyarskClock,
  quotaRiskCount,
  recommendedProductionIntervalDays,
  type ChannelRunwayRecord
} from './channelRunwayCore';
import {
  loadChannelRunwayStore,
  recalculateChannelRunway,
  subscribeChannelRunway
} from './channelRunwayStore';
import {buildContentRunway,confirmedScheduledRunwaySnapshot,contentRunwayQuotaView,type ContentRunwaySnapshot} from './contentRunway';
import {useLiveInventory} from './renderInventoryRuntime';
import {configuredScheduleAverageIntervalDays,intervalDaysFor,scheduleFrequencyTruthLabel} from './channelSchedule';
import {ChannelAvatar} from './ChannelAvatar';
import {calculateLocalChannelRunway,formatLocalCalendarDate,parseLocalCalendarDate,type LocalChannelRunway} from './localChannelRunway';
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
  'no-data':{label:'НЕТ ПОДТВЕРЖДЁННЫХ ДАННЫХ',icon:'●'}
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

function evidenceLabel(state?:ChannelRunwayRecord['dataState']){
  switch(state){
    case 'CONFIRMED_SCHEDULE':return'YouTube • расписание подтверждено';
    case 'CONFIRMED_EMPTY':return'YouTube • пустое расписание подтверждено';
    case 'PARTIAL_DATA':return'Часть данных YouTube • нельзя считать запас нулевым';
    case 'STALE_CACHE':return'Устаревший кеш • требуется обновление';
    case 'AUTH_REQUIRED':return'Требуется доступ OAuth';
    case 'API_FAILED':return'Ошибка YouTube API • запас неизвестен';
    default:return'Расписание не подтверждено';
  }
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

type RunwayRow={channel:Channel;record:ChannelRunwayRecord;content:ContentRunwaySnapshot;localRunway:LocalChannelRunway;uploadRemaining:number|null;uploadLimitKnown:boolean};

export function ChannelRunway(){
  const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),uploadHistory=useApp(s=>s.uploadHistory),projectLifecycle=useApp(s=>s.projectLifecycle),fingerprintCache=useApp(s=>s.fingerprintCache),toast=useApp(s=>s.toast);
  const liveSnapshots=useLiveInventory(s=>s.snapshots);
  const [snapshot,setSnapshot]=useState(()=>loadChannelRunwayStore());
  const [busy,setBusy]=useState(''),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[googleConfig,setGoogleConfig]=useState<GoogleConfigStatus>(),[statsBusy,setStatsBusy]=useState(false),[statsProgress,setStatsProgress]=useState<ChannelStatisticsRefreshProgress>({done:0,total:0});
  const [fleetAudit,setFleetAudit]=useState<{done:number;total:number;confirmed:number;partial:number;blocked:number;searches:number;searchFailures:number;searchExhausted:number;searchPageLimited:number;searchHalted?:string;errors:number}|null>(null);
  const [,setQuotaTick]=useState(0);
  const signature=channels.map(c=>`${c.id}:${c.name}:${c.enabled}:${c.cadenceDays}:${c.scheduleMode||'interval'}:${c.publishIntervalDays||''}:${c.publishDays||''}:${c.pauseDays||''}:${c.patternAnchorDate||''}:${c.youtubeProfileId||''}`).join('|');

  useEffect(()=>{
    setSnapshot(recalculateChannelRunway(channels,new Date(),false));
    const off=subscribeChannelRunway(()=>setSnapshot(loadChannelRunwayStore()));
    const onNativeInventory=()=>setSnapshot(recalculateChannelRunway(useApp.getState().channels,new Date(),false));
    window.addEventListener('vyron:existing-inventory-native-ready',onNativeInventory);
    return()=>{off();window.removeEventListener('vyron:existing-inventory-native-ready',onNativeInventory)}
  },[signature]);

  useEffect(()=>{
    let timer:number|undefined;
    const off=subscribeYoutubeQuota(()=>{
      if(timer!==undefined)window.clearTimeout(timer);
      timer=window.setTimeout(()=>{timer=undefined;setQuotaTick(x=>x+1)},450)
    });
    return()=>{if(timer!==undefined)window.clearTimeout(timer);off()}
  },[]);
  useEffect(()=>{let live=true;void Promise.all([api.youtubeProfiles(),api.youtubeGoogleConfig()]).then(([p,c])=>{if(live){setProfiles(p);setGoogleConfig(c)}}).catch(()=>{});return()=>{live=false}},[]);

  const active=useMemo(()=>channels.filter(c=>c.enabled),[channels]);
  const youtubeClassification=useMemo(()=>classifyYoutubeChannels(active,profiles),[active,profiles]);
  const linkedByLocalId=useMemo(()=>new Map(youtubeClassification.linked.map(x=>[x.channel.id,x])),[youtubeClassification]);
  const profileById=useMemo(()=>new Map(profiles.map(p=>[p.id,p])),[profiles]);
  const usage=youtubeQuotaUsage();
  const rowState=useMemo(()=>{
    let failures=0;
    const now=new Date();
    const rows=active.map(channel=>{
      try{
        const record=snapshot.channels[channel.id];if(!record){failures++;return null}
        const baseContent=buildContentRunway(channel,record,jobs,uploadHistory,projectLifecycle,fingerprintCache,now);
        const liveReady=liveSnapshots[channel.id]?.readyVideos;
        const content=confirmedScheduledRunwaySnapshot(channel,baseContent,record,Number.isFinite(liveReady)?Number(liveReady):baseContent.readyVideoCount);
        const localRunway=calculateLocalChannelRunway({now,youtubeScheduledThrough:parseLocalCalendarDate(content.scheduledThrough),localVideoCount:content.readyVideoCount,publicationIntervalDays:intervalDaysFor(channel)});
        const profile=channel.youtubeProfileId?profileById.get(channel.youtubeProfileId):undefined;
        const projectKey=youtubeQuotaProjectIdentity(profile,googleConfig).projectKey;
        const upload=projectKey?youtubeUploadQuotaState(projectKey):null;
        const quota=contentRunwayQuotaView(usage,upload);
        return{channel,record,content,localRunway,uploadRemaining:quota.uploads.remaining,uploadLimitKnown:quota.uploads.limitKnown} satisfies RunwayRow;
      }catch{failures++;return null}
    }).filter((x):x is RunwayRow=>Boolean(x)).sort((a,b)=>{
      const rank=(row:RunwayRow)=>{
        const evidence=runwayDisplayEvidence(row.record,now);
        return{
          channelName:row.channel.name,
          remoteScheduledDays:row.content.remoteScheduledDays,
          scheduledUntil:evidence.scheduledUntil,
          known:evidence.kind==='CURRENT',
          historicalScheduledDays:evidence.kind!=='CURRENT'?evidence.daysRemaining:undefined
        };
      };
      return compareYoutubeOnlyRunwayPriority(rank(a),rank(b));
    });
    return{rows,failures}
  },[active,snapshot,jobs,uploadHistory,projectLifecycle,fingerprintCache,liveSnapshots,profileById,googleConfig,usage.ptDate,usage.used,usage.limit]);
  const rows=rowState.rows,rowFailures=rowState.failures;
  const productionPriorityRows=rows;

  const quotaSettings=loadYoutubeQuotaPlan();
  const batchSize=Math.max(1,quotaSettings.videosPerChannel);
  const capacityPlan=buildYoutubeQuotaPlan(Math.max(1,active.length),batchSize,usage);
  // Unknown channels require action; historical dates remain planning evidence.
  const attention=rows.filter(x=>{const e=runwayDisplayEvidence(x.record);return e.kind==='UNKNOWN'||(e.daysRemaining!==undefined&&e.daysRemaining<=45)});
  const critical=rows.filter(x=>{const days=runwayDisplayEvidence(x.record).daysRemaining;return days!==undefined&&days<=14});
  const attentionPlan=attention.length?buildYoutubeQuotaPlan(attention.length,batchSize,usage):null;
  const effectiveIntervals=rows.map(({channel,record})=>record.averagePublishIntervalDays||configuredScheduleAverageIntervalDays(channel)).filter((x):x is number=>Number.isFinite(x)&&Number(x)>0);
  const avgCadence=average(effectiveIntervals);
  const batchCoverageDays=avgCadence?Math.round(avgCadence*batchSize*10)/10:undefined;
  const tempo=recommendedProductionIntervalDays(active.length,batchCoverageDays||0);
  const riskRecords=attention.map(x=>({...x.record,runwayDays:runwayDisplayEvidence(x.record).daysRemaining}));
  const riskCount=quotaRiskCount(riskRecords,capacityPlan.todayChannels,capacityPlan.fullDayChannels);
  const next=productionPriorityRows.find(x=>runwayDisplayEvidence(x.record).daysRemaining!==undefined)||productionPriorityRows[0];
  const nextEvidence=next?runwayDisplayEvidence(next.record):undefined;
  const today=krasnoyarskClock(new Date()).dateKey;
  const nextStart=next?.record.nextProductionDate;
  const startLabel=nextStart?(nextStart<=today?'Сейчас':dateLabel(nextStart)):'—';
  const calm=attention.length===0&&critical.length===0&&riskCount===0;
  const totalReady=rows.reduce((n,x)=>n+x.content.readyVideoCount,0);
  const generalRemaining=Math.max(0,usage.limit-usage.used);

  async function syncChannel(channel:Channel){
    const linked=linkedByLocalId.get(channel.id);
    if(!linked){toast(`${channel.name}: YouTube не связан точно с OAuth profile • API call не выполнен`);return}
    setBusy(channel.id);
    try{
      // A locally recorded owner upload may still be Scheduled even when the
      // Google uploads playlist omits it or the history publishAt is missing.
      // The native layer rechecks its real status via videos.list.
      const knownOwnerVideoIds=knownOwnerVideoIdsFromUploadHistory(uploadHistory,channel);
      const result=await refreshOwnerInventoriesAuthoritative([channel],true,profiles,{[channel.id]:knownOwnerVideoIds});
      const row=result.rows[0];
      setSnapshot(loadChannelRunwayStore());
      const r=loadChannelRunwayStore().channels[channel.id];
      if(row?.status==='UPDATED')toast(`${channel.name}: расписание обновлено • ${r?.scheduledVideoCount||0} запланировано • до ${dateLabel(r?.scheduledUntil)} • API ${row.apiRequests} • quota ${row.quotaUnits}`);
      else if(row?.status==='PARTIAL_DATA'){
        const until=row.observedThrough?dateLabel(dateKeyInKrasnoyarsk(row.observedThrough)):'—';
        const evidence=Number(row.observedScheduled||0)>0
          ? `через videos.list подтверждено минимум ${row.observedScheduled} Scheduled • до ${until}`
          : 'количество Scheduled неизвестно';
        toast(`${channel.name}: ${evidence} • полнота НЕ подтверждена • ${(row.diagnosticReasons||[]).join(', ')||row.error||'неполная выдача'}`);
      }else toast(`${channel.name}: расписание не обновлено • ${row?.status||'API_FAILED'}${row?.error?' • '+row.error:''}${row?.diagnosticReasons?.length?' • '+row.diagnosticReasons.join(', '):''}`);
    }catch(e){
      toast(isYoutubeQuotaError(e)?youtubeQuotaMessage():`Расписание ${channel.name}: ${String(e)}`);
    }finally{setBusy('')}
  }

  async function refreshAllStats(){
    if(statsBusy)return;
    setStatsBusy(true);setStatsProgress({done:0,total:active.length});setFleetAudit(null);
    try{
      const result=await refreshAllChannelData(active.map(c=>c.id),progress=>{
        setStatsProgress({done:progress.done,total:progress.total});
      });
      setSnapshot(loadChannelRunwayStore());
      setStatsProgress({done:result.owner?.rows.length||0,total:active.length});
      const owner=result.owner,counts=owner?.counts;
      const updated=owner?.updated||0;
      setFleetAudit({
        done:owner?.rows.length||0,total:active.length,confirmed:counts?.UPDATED||0,
        partial:counts?.PARTIAL_DATA||0,blocked:(counts?.UNLINKED||0)+(counts?.MISMATCH||0)+(counts?.DUPLICATE||0)+(counts?.OAUTH_BLOCKED||0)+(counts?.QUOTA_STOPPED||0),
        searches:owner?.deepSearchChannels||0,searchFailures:owner?.deepSearchFailedChannels||0,searchExhausted:owner?.deepSearchExhaustedChannels||0,searchPageLimited:owner?.deepSearchPageLimitedChannels||0,searchHalted:owner?.deepSearchSystemicStopCode,errors:result.errors.length+(counts?.API_FAILED||0)+(counts?.PERSISTENCE_FAILED||0)
      });
      const skipped=[
        counts?.UNLINKED?`UNLINKED ${counts.UNLINKED}`:'',
        counts?.MISMATCH?`MISMATCH ${counts.MISMATCH}`:'',
        counts?.DUPLICATE?`DUPLICATE ${counts.DUPLICATE}`:'',
        counts?.OAUTH_BLOCKED?`OAUTH_BLOCKED ${counts.OAUTH_BLOCKED}`:'',
        counts?.API_FAILED?`API_FAILED ${counts.API_FAILED}`:'',
        counts?.PARTIAL_DATA?`PARTIAL_DATA ${counts.PARTIAL_DATA}`:'',
        counts?.PERSISTENCE_FAILED?`PERSISTENCE_FAILED ${counts.PERSISTENCE_FAILED}`:'',
        counts?.QUOTA_STOPPED?`QUOTA_STOPPED ${counts.QUOTA_STOPPED}`:''
      ].filter(Boolean).join(' • ');
      const stats=result.stats;
      const complete=Boolean(owner&&updated===active.length&&!owner.failed&&!owner.stoppedForQuota&&!result.errors.length&&(!stats||(!stats.failed&&!stats.credentialBlocked)));
      const text=`Проверено ${owner?.rows.length||0}/${active.length} • подтверждено ${updated} • Search попыток ${owner?.deepSearchChannels||0} • Search ошибок ${owner?.deepSearchFailedChannels||0} • Search завершён ${owner?.deepSearchExhaustedChannels||0} • лимит страниц ${owner?.deepSearchPageLimitedChannels||0}${owner?.deepSearchSystemicStopCode?' • Search остановлен '+owner.deepSearchSystemicStopCode:''} • inventory API ${owner?.apiRequests||0} • general quota ${owner?.quotaUnits||0} • search calls ${owner?.searchCalls||0} • Render READY ${result.local.ready} • local quota 0${skipped?' • '+skipped:''}`;
      toast((complete?'✓ ':'⚠ ')+text);
    }catch(e){
      setFleetAudit({done:0,total:active.length,confirmed:0,partial:0,blocked:0,searches:0,searchFailures:0,searchExhausted:0,searchPageLimited:0,errors:1});
      toast(`Обновление всех каналов: ${String(e)}`);
    }
    finally{setStatsBusy(false)}
  }
  async function refreshRowStats(channel:Channel){
    const linked=linkedByLocalId.get(channel.id);if(!linked){toast(`${channel.name}: YouTube не подключён • API call 0`);return}
    setBusy(`stats:${channel.id}`);try{const ok=await refreshYoutubeProfileStatistics(linked.profile,`runway-stats:${channel.id}:${Date.now()}`);toast(ok?`✓ ${channel.name}: YouTube данные обновлены`:`⚠ ${channel.name}: сохранены последние данные`)}finally{setBusy('')}
  }
  function openStatistics(channel:Channel){sessionStorage.setItem('vyron:statistics:selected-channel',channel.id);window.dispatchEvent(new Event('vyron:youtube-statistics'))}
  function openAccounts(channel:Channel){sessionStorage.setItem('vyron:accounts:focus-channel',channel.id);window.dispatchEvent(new Event('vyron:youtube-accounts'))}

  return <section className="panel channelRunway">
    <div className="runwayHead">
      <div><small>YOUTUBE RUNWAY • LOCAL RESERVE SEPARATE</small><h3>Запас контента</h3><p>Главный ориентир — подтверждённая дата, до которой видео уже есть на YouTube. Локальный Render показан отдельно и никогда не продлевает YouTube-даты.</p></div>
      <div className="headerActions"><span className="localOnlyBadge">LOCAL READY • ZERO API</span><button disabled={statsBusy||!active.length} onClick={()=>void refreshAllStats()}>{statsBusy?`↻ ${statsProgress.done} / ${statsProgress.total}`:'↻ ОБНОВИТЬ ВСЕ КАНАЛЫ'}</button></div>
    </div>
    {fleetAudit&&<div className="runwayFleetAudit" role="status">
      <b>Обработано {fleetAudit.done}/{fleetAudit.total} каналов (полнота каждого расписания отдельно)</b>
      <span className="fleetOk">Подтверждено {fleetAudit.confirmed}</span>
      <span className="fleetPartial">Неполные данные {fleetAudit.partial}</span>
      <span className="fleetBlocked">Недоступно {fleetAudit.blocked}</span>
      <span>Search попыток {fleetAudit.searches} • ошибок {fleetAudit.searchFailures} • до конца {fleetAudit.searchExhausted} • лимит страниц {fleetAudit.searchPageLimited}</span>
      {fleetAudit.searchHalted&&<span className="fleetError">Search остановлен: {fleetAudit.searchHalted} • повторять тот же фильтр для остальных каналов запрещено</span>}
      {fleetAudit.errors>0&&<span className="fleetError">Ошибки {fleetAudit.errors}</span>}
      {fleetAudit.done!==fleetAudit.total&&<strong>Не все каналы проверены!</strong>}
    </div>}
    {rowFailures>0&&<div className="errorBox"><b>Часть данных «Плана каналов» повреждена или несовместима</b><p>VYRON пропустил {rowFailures} проблемных каналов вместо падения всего интерфейса. Каналы, OAuth и настройки не изменены.</p></div>}

    <div className="runwaySummary">
      <div><small>ВСЕГО ПРОЕКТОВ</small><b>{active.length}</b><em>local VYRON</em></div>
      <div><small>YOUTUBE ПОДКЛЮЧЕНО</small><b>{youtubeClassification.eligible.length}</b><em>exact Profile + Channel ID</em></div>
      <div><small>НЕ ПОДКЛЮЧЕНО</small><b>{youtubeClassification.unlinked.length+youtubeClassification.orphans.length+youtubeClassification.mismatched.length}</b><em>API 0 • duplicates {youtubeClassification.duplicates.length}</em></div>
      <div><small>ГОТОВЫХ ВИДЕО</small><b>{totalReady}</b><em>локально • не означает uploaded</em></div>
      <div><small>ТРЕБУЮТ ВНИМАНИЯ</small><b>{attention.length}</b><em>≤ 45 дней • включая неизвестные</em></div>
      <div><small>КРИТИЧЕСКИЕ</small><b>{critical.length}</b><em>YouTube ≤ 14 дней</em></div>
      <div><small>GENERAL API</small><b>{generalRemaining.toLocaleString('ru-RU')}</b><em>из {usage.limit.toLocaleString('ru-RU')} local ledger</em></div>
      <div><small>МОЖНО ОБРАБОТАТЬ СЕГОДНЯ</small><b>{capacityPlan.todayChannels}</b><em>по General API плану</em></div>
      <div><small>РЕКОМЕНДУЕМЫЙ ТЕМП</small><b>{tempoLabel(tempo)}</b><em>{batchCoverageDays?`пачка ≈ ${batchCoverageDays} дней`:`пачка ${batchSize} видео`}</em></div>
      <div><small>СЛЕДУЮЩИЙ КАНАЛ</small><b>{next?.channel.name||'—'}</b><em>{nextEvidence?.daysRemaining!==undefined?`${nextEvidence.kind==='CURRENT'?'YouTube подтверждено':'Историческая/частичная оценка'} • ${nextEvidence.daysRemaining} дн.`:'запас неизвестен • нужна проверка'}</em></div>
    </div>

    <div className={`runwayAdvice ${calm?'good':riskCount?'danger':'work'}`}>
      <b>{calm?'Спешить не нужно.':riskCount?'Есть риск по производственному плану.':'Работа по плану.'}</b>
      <span>{tempo?`При текущем запасе ориентир — ${tempoLabel(tempo)} `:''}{next?`Следующий: ${next.channel.name}, ${nextEvidence?.daysRemaining===undefined?'запас неизвестен':`${nextEvidence.kind==='CURRENT'?'подтверждено':'оценка по историческим/частичным данным'} ${nextEvidence.daysRemaining} дней`}.`:'Сначала синхронизируй расписание каналов.'}{riskCount?` Риск не успеть: ${riskCount}.`:''}</span>
    </div>

    <div className="runwayTable">
      <div className="runwayRow runwayTh">
        <span>Канал</span><span>На YouTube до</span><span>На диске</span><span>Остаток дней на YouTube</span><span>Scheduled</span><span>Ready</span><span>Cadence</span><span>Uploads</span><span>Статус</span><span>Действие</span>
      </div>
      {rows.length===0?<div className="empty"><b>Нет активных каналов</b><p>Content Runway не создаёт демонстрационные данные.</p></div>:rows.map(({channel,record,content,localRunway,uploadRemaining,uploadLimitKnown})=>{
        const evidence=runwayDisplayEvidence(record);
        const isCurrent=evidence.kind==='CURRENT';
        const isObserved=evidence.kind==='OBSERVED_PARTIAL';
        const isHistorical=evidence.kind==='HISTORICAL';
        const hasEvidence=evidence.daysRemaining!==undefined;
        const shownThrough=evidence.scheduledUntil;
        const shownDays=evidence.daysRemaining;
        const youtubeStatus=runwayStatus(shownDays,isCurrent);
        const meta=isCurrent?statusMeta[youtubeStatus]:hasEvidence
          ?{label:isObserved?'ЧАСТИЧНО ПОДТВЕРЖДЕНО':'ИСТОРИЧЕСКИЙ ЗАПАС • СВЕРИТЬ',icon:'◐'}
          :{label:record.dataState==='API_FAILED'?'ОШИБКА API • ЗАПАС НЕИЗВЕСТЕН':'НУЖНА ПРОВЕРКА YOUTUBE',icon:'◐'};
        const diagnosticCodes=(record.lastRefreshError||'AUTHORITATIVE_INVENTORY_INCOMPLETE')
          .split(' | ').filter(x=>x&&x!=='AUTHORITATIVE_INVENTORY_INCOMPLETE');
        const preciseSearchCodes=diagnosticCodes.filter(x=>x.startsWith('OWNER_SEARCH_HTTP_')||x==='OWNER_SEARCH_NETWORK_ERROR');
        const partialReason=record.dataState==='PARTIAL_DATA'
          ?[...preciseSearchCodes,...diagnosticCodes.filter(x=>!preciseSearchCodes.includes(x))].slice(0,3).join(' • ')||'COVERAGE_UNVERIFIED'
          :'';
        const visibleTone=hasEvidence?runwayStatus(shownDays,true):'no-data';
        const rowTone=isCurrent?youtubeStatus:hasEvidence?'partial':'unknown';
        return <div className={`runwayRow runwayRow-${rowTone}`} key={channel.id}>
          <span className="runwayChannel runwayChannelWithAvatar"><ChannelAvatar channel={channel} size="sm"/><span><b>{channel.name}</b><small>{syncLabel(record.lastScheduleSync)}</small><small title={record.lastRefreshError||''}>{partialReason?('Причина: '+partialReason):evidenceLabel(record.dataState)}</small><small>{linkedByLocalId.has(channel.id)?`Subs ${subscriberStatLabel(channel.stats)} • Views ${compactChannelStat(channel.stats?.viewCount??channel.stats?.views)}`:'YouTube: НЕ ПОДКЛЮЧЁН'}</small></span></span>
          <span>{shownThrough?<><b>📺 {dateLabel(shownThrough)}</b><small>{record.status==='no-data'?(record.dataState==='PARTIAL_DATA'?(freshObserved?'свежая дата owner-проверки • полнота неизвестна':'историческая дата • свежая полнота неизвестна'):'последняя сохранённая дата • не подтверждена'):content.remoteScheduledDays>0?`ещё ${content.remoteScheduledDays} дн.`:'подтверждённое расписание закончилось'}</small></>:<><b>{record.status==='no-data'?'📺 Нет подтверждённых данных':'📺 Будущих видео нет'}</b><small>{evidenceLabel(record.dataState)}</small></>}</span>
          <span>{content.readyVideoCount?<><b>💾 {content.readyVideoCount} видео</b><small>только локальные файлы</small></>:<><b>💾 0 видео</b><small>локального запаса нет</small></>}</span>
          <span title="Остаток дней на YouTube — только подтверждённое расписание"><b className={`runwayDays ${visibleTone} ${record.status==='no-data'?'historical':''}`}>{record.status==='no-data'?(partialDays===undefined?'—':`${historicalPartial?'≈':'≥'}${partialDays} дн.*`):`${content.remoteScheduledDays} дн.`}</b><small>{record.status==='no-data'?(partialObserved?(historicalPartial?'* Исторический кэш Scheduled: текущий запас не подтверждён':'* Свежая owner-проверка: подтверждены отдельные Scheduled, полнота неизвестна'):evidenceLabel(record.dataState)):content.remoteScheduledDays>0&&content.scheduledThrough?`до ${dateLabel(content.scheduledThrough)}`:'пустое расписание подтверждено'}</small><small>{record.status==='no-data'?'Локальный прогноз с резервом':'Общий прогноз с локальным резервом'}: {localRunway.totalRunwayDays} дн.{localRunway.coverageThrough?` • до ${formatLocalCalendarDate(localRunway.coverageThrough)}`:''}</small></span>
          <span title={evidenceLabel(record.dataState)}>{record.status==='no-data'?(partialObserved?(historicalPartial?`${record.scheduledVideoCount} (кэш)*`:`≥${record.lastObservedScheduledCount}*`):'—'):content.scheduledVideoCount}</span>
          <span><b>{content.readyVideoCount}</b></span>
          <span>{scheduleFrequencyTruthLabel(channel,record)}</span>
          <span className="runwayQuota">{uploadLimitKnown?<><b>{uploadRemaining}</b><small>доступно</small></>:<><b>—</b><small>лимит проекта не подтверждён</small></>}</span>
          <span className={`runwayStatus ${rowTone}`}><i>{meta.icon}</i>{meta.label}</span>
          <span>{linkedByLocalId.has(channel.id)?<><button disabled={statsBusy||busy===channel.id} onClick={()=>void syncChannel(channel)}>{busy===channel.id?'СИНХРОНИЗАЦИЯ…':'ОБНОВИТЬ РАСПИСАНИЕ'}</button><button disabled={busy===`stats:${channel.id}`||statsBusy} onClick={()=>void refreshRowStats(channel)}>{busy===`stats:${channel.id}`?'↻…':'↻ YT'}</button><button onClick={()=>openStatistics(channel)}>Статистика</button></>:<button onClick={()=>openAccounts(channel)}>Подключить</button>}</span>
        </div>
      })}
    </div>

    <div className="runwayFoot">
      <span>YouTube date: <b>только authoritative remote schedule</b></span>
      <span>Local stock: <b>отдельно • 0 YouTube API</b></span>
      <span>General API: <b>{usage.used.toLocaleString('ru-RU')} / {usage.limit.toLocaleString('ru-RU')}</b></span>
      <span>Video Uploads: <b>отдельный per-project ledger</b></span>
      <span>Размер пачки Quota Planner: <b>{batchSize} видео</b></span>
      <span>План General API для внимания: <b>{attentionPlan?.days||0} квотных дней</b></span>
      <span>Следующее производство: <b>{startLabel}</b></span>
    </div>
  </section>;
}
