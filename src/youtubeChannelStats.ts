import type {YoutubeChannelStatistics} from './types';

export const CHANNEL_STATS_TTL_MS=10*60*1000;

export function channelStatsTimestamp(stats?:YoutubeChannelStatistics|null){
  return stats?.statisticsUpdatedAt||stats?.updatedAt||'';
}

export function isChannelStatsStale(stats?:YoutubeChannelStatistics|null,now=Date.now(),ttlMs=CHANNEL_STATS_TTL_MS){
  const at=Date.parse(channelStatsTimestamp(stats));
  return !Number.isFinite(at)||now-at>=ttlMs;
}

export function exactChannelStat(value?:number|null){
  return typeof value==='number'&&Number.isFinite(value)
    ?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(value)
    :'—';
}

export function compactChannelStat(value?:number|null){
  if(typeof value!=='number'||!Number.isFinite(value))return '—';
  const n=Math.max(0,value);
  if(n<1_000_000)return exactChannelStat(n);
  if(n<1_000_000_000){
    const x=n/1_000_000;
    return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:x>=10?0:1}).format(x)} млн`;
  }
  const x=n/1_000_000_000;
  return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:x>=10?0:1}).format(x)} млрд`;
}

export function subscriberStatLabel(stats?:YoutubeChannelStatistics|null){
  return stats?.hiddenSubscriberCount?'скрыто':compactChannelStat(stats?.subscriberCount??stats?.subscribers);
}

export function normalizeChannelStatistics(next:YoutubeChannelStatistics,previous?:YoutubeChannelStatistics|null):YoutubeChannelStatistics{
  const updated=next.statisticsUpdatedAt||new Date().toISOString();
  return {
    ...previous,
    ...next,
    subscriberCount:next.hiddenSubscriberCount?undefined:next.subscriberCount,
    statisticsUpdatedAt:updated,
    lastAttemptAt:updated,
    syncWarning:undefined,
    // Legacy aliases remain populated so older VYRON views continue to work.
    subscribers:next.hiddenSubscriberCount?undefined:next.subscriberCount,
    views:next.viewCount,
    videos:next.videoCount,
    updatedAt:updated,
  };
}

export function preserveChannelStatisticsOnError(previous:YoutubeChannelStatistics|undefined,error:unknown,at=new Date().toISOString()):YoutubeChannelStatistics{
  return {
    ...(previous||{}),
    lastAttemptAt:at,
    syncWarning:String(error||'Не удалось обновить статистику YouTube'),
  };
}

export function formatStatsUpdatedAt(iso?:string){
  if(!iso)return '—';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime()))return '—';
  return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}


export function formatStatsAge(stats?:YoutubeChannelStatistics|null,now=Date.now()){
  const at=Date.parse(channelStatsTimestamp(stats));
  if(!Number.isFinite(at))return 'данных ещё нет';
  const minutes=Math.max(0,Math.floor((now-at)/60000));
  if(minutes<1)return 'обновлено сейчас';
  if(minutes<60)return `обновлено ${minutes} мин. назад`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `обновлено ${hours} ч. назад`;
  return `обновлено ${Math.floor(hours/24)} дн. назад`;
}

export function channelStatsStatusLabel(stats?:YoutubeChannelStatistics|null,refreshing=false,now=Date.now()){
  if(refreshing)return '↻ Обновление...';
  if(stats?.syncWarning)return '⚠ Не удалось обновить • показаны последние данные';
  if(!channelStatsTimestamp(stats))return 'Данных ещё нет';
  return isChannelStatsStale(stats,now)?`Данные устарели • ${formatStatsAge(stats,now)}`:`✓ ${formatStatsAge(stats,now)}`;
}
