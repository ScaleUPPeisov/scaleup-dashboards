import React,{useEffect,useMemo,useState} from 'react';
import {useApp} from './store';
import {bufferDays,requiredVideos} from './core';
import {subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeQuotaClockSnapshot,youtubeQuotaUsage} from './youtubeQuota';

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n);
const date=(iso?:string)=>iso?new Date(iso).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';

export function DashboardOS(){
 const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),settings=useApp(s=>s.settings),logs=useApp(s=>s.logs),setPage=useApp(s=>s.setPage);
 const [quota,setQuota]=useState(()=>youtubeQuotaUsage()),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot());
 useEffect(()=>{const off=subscribeYoutubeQuota(()=>setQuota(youtubeQuotaUsage())),offClock=subscribeYoutubeQuotaClock(setClock);return()=>{off();offClock()}},[]);
 const enabled=channels.filter(c=>c.enabled),now=new Date();
 const channelRows=useMemo(()=>enabled.map(c=>{const cj=jobs.filter(j=>j.channelId===c.id),days=bufferDays(c,jobs,now),target=requiredVideos(c);return{c,cj,days,target,ready:cj.filter(j=>j.finalPath||j.status==='READY_UPLOAD'||j.status==='SCHEDULED').length}}).sort((a,b)=>a.days-b.days),[channels,jobs]);
 const next=channelRows[0],errors=jobs.filter(j=>j.status==='ERROR'),readyEndlume=jobs.filter(j=>j.status==='READY_RENDER').length,rendering=jobs.filter(j=>j.status==='RENDERING').length,readyVideo=jobs.filter(j=>j.status==='READY_UPLOAD').length,scheduled=jobs.filter(j=>j.status==='SCHEDULED').length,images=jobs.filter(j=>Boolean(j.coverPath)).length;
 const scheduledDates=jobs.filter(j=>j.publishAt&&j.status==='SCHEDULED').map(j=>j.publishAt!).sort();const scheduledUntil=scheduledDates.at(-1);
 const issues=[...(!settings.endlumePath?[{label:'ENDLUME',text:'Путь к ENDLUME Studio не настроен',page:'settings' as const}]:[]),...enabled.filter(c=>!c.youtubeProfileId).slice(0,3).map(c=>({label:'YouTube',text:`${c.name}: OAuth не подключён`,page:'youtube' as const})),...channelRows.filter(x=>x.days<14).slice(0,3).map(x=>({label:'Запас',text:`${x.c.name}: контента примерно на ${x.days} дн.`,page:'production' as const})),...errors.slice(0,4).map(j=>({label:'Ошибка',text:`VIDEO_${String(j.number).padStart(3,'0')}: ${j.error||'требует внимания'}`,page:'production' as const}))].slice(0,8);
 const remaining=Math.max(0,quota.limit-quota.used);
 return <>
  <div className="masterHero"><div><small>VYRON YT PEISOV • TODAY</small><h1>{next?`Следующий — ${next.c.name}`:'Рабочий центр YouTube'}</h1><p>{next?`Запас канала: ${next.days} дн. • готово ${next.ready}/${next.target}.`:'Добавь канал — дальше здесь будет только то, что нужно сделать.'}</p></div><div className="headerActions">{next&&<button className="primary" onClick={()=>setPage('production')}>Продолжить производство</button>}<button onClick={()=>setPage('youtube')}>Открыть публикацию</button></div></div>

  <div className="masterDashboardGrid">
   <section className="masterCard todayCard"><div className="masterCardHead"><span>01</span><div><small>СЕГОДНЯ</small><h3>{next?.c.name||'Нет активных каналов'}</h3></div></div>{next?<><div className="todayBig"><strong>{next.days}</strong><span>дней запаса</span></div><div className="masterStatLine"><span>План</span><b>{next.target} видео</b></div><div className="masterStatLine"><span>Готово / запланировано</span><b>{next.ready} / {next.target}</b></div><div className="masterProgress"><i style={{width:`${Math.min(100,next.target?next.ready/next.target*100:0)}%`}}/></div><button className="primary full" onClick={()=>setPage('production')}>ПРОДОЛЖИТЬ ПРОИЗВОДСТВО</button></>:<button className="primary" onClick={()=>setPage('channels')}>Добавить канал</button>}</section>

   <section className="masterCard"><div className="masterCardHead"><span>02</span><div><small>ПРОИЗВОДСТВО</small><h3>Локальный pipeline</h3></div></div><div className="masterKpis"><span><small>Изображения в проектах</small><b>{fmt(images)}</b></span><span><small>Проектов</small><b>{fmt(jobs.length)}</b></span><span><small>Готово к ENDLUME</small><b>{fmt(readyEndlume)}</b></span><span><small>Сейчас рендерится</small><b>{fmt(rendering)}</b></span><span><small>Видео готово</small><b>{fmt(readyVideo)}</b></span></div><button onClick={()=>setPage('production')}>Открыть Production →</button></section>

   <section className="masterCard youtubeMasterCard"><div className="masterCardHead"><span>03</span><div><small>YOUTUBE</small><h3>Готово к публикации</h3></div></div><div className="youtubeReadyBig"><strong>{readyVideo}</strong><span>готовых MP4</span></div><div className="masterStatLine"><span>Уже запланировано</span><b>{scheduled}</b></div><div className="masterStatLine"><span>Канал заполнен до</span><b>{date(scheduledUntil)}</b></div><div className="quotaMini"><span><small>YouTube API осталось</small><b>{fmt(remaining)} / {fmt(quota.limit)}</b></span><span><small>Сброс</small><b>{clock.localTime}</b></span><span><small>До сброса</small><b className="mono">{clock.countdown}</b></span></div><button className="primary full" onClick={()=>setPage('youtube')}>ОТКРЫТЬ ПУБЛИКАЦИЮ</button></section>

   <section className={`masterCard attentionCard ${issues.length?'hasIssues':'allGood'}`}><div className="masterCardHead"><span>04</span><div><small>ТРЕБУЕТ ВНИМАНИЯ</small><h3>{issues.length?`${issues.length} пунктов`:'Всё работает нормально'}</h3></div></div>{issues.length?<div className="attentionRows">{issues.map((x,i)=><button key={i} onClick={()=>setPage(x.page)}><i>!</i><span><small>{x.label}</small><b>{x.text}</b></span><em>→</em></button>)}</div>:<div className="allGoodBox"><strong>✓</strong><span><b>Критических проблем нет</b><small>Production, очередь и локальный state без ошибок.</small></span></div>}</section>
  </div>

  <section className="panel masterActivity"><div className="panelHead"><div><small>ПОСЛЕДНИЕ ДЕЙСТВИЯ</small><h3>История VYRON YT PEISOV</h3></div><span>{logs.length} событий</span></div>{logs.length?<div className="activityRows">{logs.slice(0,8).map((l,i)=><div key={i}><time>{new Date(l.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time><span>{l.message}</span></div>)}</div>:<p>Здесь появятся только понятные действия: проект создан, отправлен в ENDLUME, видео готово, загружено на YouTube.</p>}</section>
 </>
}
