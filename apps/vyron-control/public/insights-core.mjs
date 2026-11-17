// Deterministic decision support. No AI calls and no causal claims.
const DAY=86400000;
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value+'T00:00:00Z'));
const sum=(items,key)=>items.reduce((v,x)=>v+(Number(x?.[key])||0),0);
function ratioMessage(value,baseline){
  const pct=(value-baseline)/baseline*100;
  return (pct>=0?'+':'')+Math.round(pct)+'%';
}
export function channelMomentum(channel,now=new Date()){
  const a=channel?.analytics;
  if(a?.source!=='GOOGLE_ANALYTICS_API')return null;
  const rows=(Array.isArray(a.daily)?a.daily:[]).filter(x=>iso(x?.date)&&
    Number.isFinite(Number(x.views))&&Number(x.views)>=0)
    .slice().sort((x,y)=>x.date.localeCompare(y.date));
  // Compare matching 7-day windows only. Stale or irregular periods are excluded.
  const dedup=[...new Map(rows.map(x=>[x.date,x])).values()];
  if(dedup.length<14)return null;
  const days=dedup.slice(-14);
  const first=Date.parse(days[0].date+'T00:00:00Z');
  const last=Date.parse(days[13].date+'T00:00:00Z');
  if(last-first!==13*DAY||now.getTime()-last>5*DAY)return null;
  const previous=sum(days.slice(0,7),'views');
  const latest=sum(days.slice(7),'views');
  const gainPrevious=sum(days.slice(0,7),'subscribersGained')-
    sum(days.slice(0,7),'subscribersLost');
  const gainLatest=sum(days.slice(7),'subscribersGained')-
    sum(days.slice(7),'subscribersLost');
  return {id:channel.id,name:channel.name,periodEnd:days[13].date,
    previous,latest,change:previous>0?(latest-previous)/previous:null,
    gainPrevious,gainLatest,source:'GOOGLE_ANALYTICS_API'};
}
export function buildDeterministicInsights(data,now=new Date()){
  const channels=Array.isArray(data?.channels)?data.channels:[];
  const rows=[];
  const momentum=channels.map(c=>channelMomentum(c,now)).filter(Boolean);
  for(const m of momentum){
    if(m.previous>=50&&m.change!==null&&m.change<=-.3)
      rows.push({severity:'critical',title:'Падение просмотров — '+m.name,
        body:'Просмотры за последние 7 дней ниже предыдущих 7 дней. Причина не установлена.',
        evidence:m.previous+' → '+m.latest+' ('+ratioMessage(m.latest,m.previous)+
          ') · '+m.periodEnd+' · YouTube Analytics API'});
    else if(m.previous>=50&&m.change!==null&&m.change>=.5)
      rows.push({severity:'opportunity',title:'Ускорение просмотров — '+m.name,
        body:'Рост за сопоставимые 7-дневные окна. Изучи новые публикации и источники трафика.',
        evidence:m.previous+' → '+m.latest+' ('+ratioMessage(m.latest,m.previous)+
          ') · '+m.periodEnd+' · YouTube Analytics API'});
    if(m.gainPrevious>5&&m.gainLatest<m.gainPrevious/2)
      rows.push({severity:'warning',title:'Замедление прироста — '+m.name,
        body:'Чистый прирост подписчиков снизился по отношению к прошлой неделе.',
        evidence:m.gainPrevious+' → '+m.gainLatest+
          ' · '+m.periodEnd+' · YouTube Analytics API'});
  }
  const knownSchedule=channels.filter(x=>Number.isFinite(x.scheduledContentDays) &&
    x.scheduledContentDays>=0);
  for(const channel of knownSchedule.filter(x=>x.scheduledContentDays<3)){
    rows.push({severity:'critical',title:'Низкий запас публикаций — '+channel.name,
      body:'Проверь подтверждённое расписание загрузок. Локальные файлы не учитываются.',
      evidence:'Осталось: '+channel.scheduledContentDays+' дней · подтверждённое расписание'});
  }
  if(channels.length&&!knownSchedule.length)rows.push({
    severity:'warning',title:'Расписание YouTube ещё не подтверждено',
    body:'В облаке нет достоверного остатка дней. Локальные задания VYRON не заменяют проверку на YouTube.',
    evidence:'Подтверждённых расписаний: 0 / '+channels.length
  });
  const leaders=channels.filter(c=>c.analytics?.source==='GOOGLE_ANALYTICS_API')
    .flatMap(c=>{
      const top=(c.analytics?.reports?.topVideos||[])
        .filter(v=>Number.isFinite(Number(v.views))&&Number(v.views)>=0);
      if(top.length<5)return [];
      const numbers=top.map(v=>Number(v.views)).sort((a,b)=>a-b);
      const median=numbers[Math.floor(numbers.length/2)];
      const best=top.slice().sort((a,b)=>Number(b.views)-Number(a.views))[0];
      if(median<30||Number(best.views)<median*3)return [];
      return [{severity:'opportunity',title:'Лидер среди доступных видео — '+c.name,
        body:'У лучшего видео значительно больше просмотров, чем медиана ограниченной выборки лучших видео. Это наблюдение, не прогноз.',
        evidence:Number(best.views)+' против медианы '+median+
          ' · YouTube Analytics API topVideos'}];
    });
  rows.push(...leaders);
  const priority={critical:0,warning:1,opportunity:2};
  return rows.sort((a,b)=>priority[a.severity]-priority[b.severity])
    .slice(0,12);
}
