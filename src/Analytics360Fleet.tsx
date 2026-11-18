import React,{useMemo,useState} from 'react';
import type {Channel,VideoJob,YoutubeProfile,UploadHistoryRecord} from './types';

export type FleetReport={
 channelId:string;status:'AVAILABLE'|'NOT_YET_COLLECTED'|'CACHE_READ_ERROR'|'INVALID_CHANNEL_ID';
 updatedAt?:string|null;videosTotal?:number;
 growth7?:{changePercent?:number|null;status?:string}|null;
 growth28?:{changePercent?:number|null;status?:string}|null;
 summary?:{analyticsAuthorized?:boolean;name?:string;subscribers?:number|null}|null;
};
export type FleetRow={
 channel:Channel; oauth:string;reportStatus:string;growth28:number|null;
 ready:number;scheduled:number;errors:number;nextPublication:string|null;
 lastUpload:string|null;localRunwayDays:number|null;
 statsUpdatedAt:string|null; warnings:string[];attention:number;
};
const badOAuth=new Set(['KEYCHAIN_BLOCKED','RECONNECT_REQUIRED','WRONG_CHANNEL','FAILED','MISSING','KEYCHAIN_ERROR']);
function newest(a:string|null,b:string|null){return !a?b:!b?a:a>b?a:b}
export function buildFleetRows(channels:Channel[],profiles:YoutubeProfile[],jobs:VideoJob[],
 uploads:UploadHistoryRecord[],reports:FleetReport[],nowMs=Date.now()):FleetRow[]{
 const profilesById=new Map(profiles.map(p=>[p.id,p]));
 const reportByChannel=new Map(reports.map(r=>[r.channelId,r]));
 const perChannel=new Map<string,{ready:number;scheduled:number;errors:number;nextMs:number|null;lastScheduledMs:number|null}>();
 const uploadsByChannel=new Map<string,string>();
 for(const job of jobs){
  const v=perChannel.get(job.channelId)||{ready:0,scheduled:0,errors:0,nextMs:null,lastScheduledMs:null};
  if(job.status==='READY_UPLOAD')v.ready++;
  if(job.status==='SCHEDULED'){
   v.scheduled++;
   const ms=job.publishAt?Date.parse(job.publishAt):NaN;
   if(Number.isFinite(ms)&&ms>=nowMs){
    v.nextMs=v.nextMs===null?ms:Math.min(v.nextMs,ms);
    v.lastScheduledMs=v.lastScheduledMs===null?ms:Math.max(v.lastScheduledMs,ms);
   }
  }
  if(job.status==='ERROR')v.errors++;
  perChannel.set(job.channelId,v);
 }
 for(const upload of uploads){
  if(!upload.uploadedAt)continue;
  uploadsByChannel.set(upload.channelId,newest(uploadsByChannel.get(upload.channelId)||null,upload.uploadedAt)!);
 }
 return channels.map(channel=>{
  const jobs=perChannel.get(channel.id)||{ready:0,scheduled:0,errors:0,nextMs:null,lastScheduledMs:null};
  const profile=channel.youtubeProfileId?profilesById.get(channel.youtubeProfileId):undefined;
  const valid=Boolean(profile&&profile.channelId===channel.youtubeChannelId&&channel.youtubeChannelId);
  const oauth=valid?(profile?.credentialStatus||'NOT_CHECKED'):'NOT_LINKED';
  const report=channel.youtubeChannelId?reportByChannel.get(channel.youtubeChannelId):undefined;
  const percentage=report?.growth28?.changePercent;
  const growth28=typeof percentage==='number'&&Number.isFinite(percentage)?percentage:null;
  const nextPublication=jobs.nextMs===null?null:new Date(jobs.nextMs).toISOString();
  const lastUpload=uploadsByChannel.get(channel.id)||channel.lastUploadAt||null;
  const statsUpdatedAt=report?.updatedAt||channel.stats?.statisticsUpdatedAt||channel.analytics?.updatedAt||null;
  const warnings:string[]=[];
  if(!valid)warnings.push('OAuth не привязан к точному Channel ID');
  else if(badOAuth.has(oauth))warnings.push('OAuth: '+oauth);
  if(jobs.errors>0)warnings.push('Ошибок локальных задач: '+jobs.errors);
  if(jobs.ready===0&&jobs.scheduled===0&&channel.enabled)warnings.push('Нет готовых или запланированных локальных видео');
  if(report?.status==='CACHE_READ_ERROR')warnings.push('Ошибка чтения локальной аналитики');
  const attention=warnings.length;
  return{
   channel,oauth,reportStatus:report?.status||'NOT_YET_COLLECTED',growth28,
   ready:jobs.ready,scheduled:jobs.scheduled,errors:jobs.errors,nextPublication,lastUpload,
   localRunwayDays:jobs.lastScheduledMs===null?null:Math.max(0,Math.ceil((jobs.lastScheduledMs-nowMs)/86400000)),
   statsUpdatedAt,warnings,attention
  };
 });
}
const number=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('ru-RU',{maximumFractionDigits:1});
const stamp=(v:string|null|undefined)=>v?new Date(v).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'—';
const oauthLabel:Record<string,string>={
 READY:'Готов',WORKING:'Работает',NOT_CHECKED:'Не проверен',CHECK_ON_USE:'Проверка при запросе',
 CANONICAL_PRESENT_UNVERIFIED:'Ожидает проверки',RECOVERABLE:'Восстановим',
 KEYCHAIN_BLOCKED:'Keychain заблокирован',RECONNECT_REQUIRED:'Нужен вход',
 WRONG_CHANNEL:'Channel ID не совпадает',MISSING:'Токен отсутствует',KEYCHAIN_ERROR:'Ошибка Keychain',
 FAILED:'Ошибка',NOT_LINKED:'Не привязан',NEEDS_ONE_TIME_LOCAL_MIGRATION:'Нужна локальная миграция'
};
type Props={
 channels:Channel[];profiles:YoutubeProfile[];jobs:VideoJob[];uploads:UploadHistoryRecord[];
 reports:FleetReport[];loading:boolean;activeId:string|undefined;
 onChoose:(id:string)=>void;onRefresh:()=>void;
};
export function Analytics360Fleet({channels,profiles,jobs,uploads,reports,loading,activeId,onChoose,onRefresh}:Props){
 const [filter,setFilter]=useState<'all'|'attention'|'ready'|'synced'>('all');
 const [sort,setSort]=useState<'attention'|'name'|'growth'|'ready'>('attention');
 const rows=useMemo(()=>buildFleetRows(channels,profiles,jobs,uploads,reports),[channels,profiles,jobs,uploads,reports]);
 const shown=useMemo(()=>{
  const chosen=rows.filter(r=>filter==='attention'?r.attention>0:filter==='ready'?r.ready>0:filter==='synced'?r.reportStatus==='AVAILABLE':true);
  return chosen.sort((a,b)=>{
   if(sort==='growth'){
    if(a.growth28==null)return 1;if(b.growth28==null)return -1;
    return b.growth28-a.growth28;
   }
   if(sort==='ready')return b.ready-a.ready;
   if(sort==='name')return a.channel.name.localeCompare(b.channel.name,'ru');
   return b.attention-a.attention||a.channel.name.localeCompare(b.channel.name,'ru');
  });
 },[rows,filter,sort]);
 const attention=rows.filter(r=>r.attention>0);
 const affected=rows.filter(r=>r.oauth==='NOT_LINKED'||badOAuth.has(r.oauth)).length;
 return <section className="panel a360-fleet">
  <div className="a360-row-head">
   <div><h3>Fleet Command Center · {channels.length} каналов</h3>
    <small>Локальное состояние VYRON и последний опубликованный снимок Analytics 360. Никаких новых запросов к Google при открытии таблицы.</small>
   </div>
   <button onClick={onRefresh} disabled={loading} title="Прочитать сохранённую аналитику с диска, без Google API">
    {loading?'Читаю снимки…':'Обновить локальную сводку'}
   </button>
  </div>
  <div className="a360-grid four">
   <div className="a360-kpi"><small>Каналов</small><strong>{number(rows.length)}</strong></div>
   <div className="a360-kpi"><small>Требуют внимания</small><strong>{number(attention.length)}</strong></div>
   <div className="a360-kpi"><small>OAuth: проблемы привязки</small><strong>{number(affected)}</strong></div>
   <div className="a360-kpi"><small>Готовы к загрузке · локально</small><strong>{number(rows.reduce((a,r)=>a+r.ready,0))}</strong></div>
  </div>
  {attention.length>0&&<details className="a360-fleet-attention"><summary>Что требует внимания · {attention.length}</summary>
   <div>{attention.slice(0,12).map(r=><button key={r.channel.id} onClick={()=>onChoose(r.channel.id)} className="a360-fleet-warning">
    <b>{r.channel.name}</b><span>{r.warnings.join(' · ')}</span>
   </button>)}</div>
  </details>}
  <div className="a360-inline">
   <label>Показать <select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
    <option value="all">Все</option><option value="attention">Требуют внимания</option>
    <option value="ready">Есть готовые</option><option value="synced">С аналитикой</option>
   </select></label>
   <label>Сортировать <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}>
    <option value="attention">По предупреждениям</option><option value="name">Название</option>
    <option value="growth">Рост за 28 дней</option><option value="ready">Готовые видео</option>
   </select></label>
   <span className="a360-fleet-count">{shown.length} из {rows.length}</span>
  </div>
  <div className="a360-table-wrap">
   <table className="a360-fleet-table"><thead><tr>
    <th>Канал</th><th>Google OAuth</th><th>Аналитика</th><th>Рост 28 дней</th>
    <th>Готово</th><th>Локально в плане</th><th>Ошибки</th><th>Запас, дни*</th>
    <th>Ближайшая публикация*</th><th>Последняя загрузка</th><th>Обновлено</th>
   </tr></thead><tbody>
    {shown.map(r=><tr key={r.channel.id} className={r.channel.id===activeId?'a360-fleet-active':''}
      onClick={()=>onChoose(r.channel.id)} tabIndex={0}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onChoose(r.channel.id)}}}>
     <td><strong>{r.channel.name}</strong>{r.warnings.length>0&&<span title={r.warnings.join('\n')}> ⚠</span>}</td>
     <td>{oauthLabel[r.oauth]||r.oauth}</td><td>{r.reportStatus==='AVAILABLE'?'Собрана':r.reportStatus==='CACHE_READ_ERROR'?'Ошибка':'Нет снимка'}</td>
     <td>{r.growth28==null?'—':(r.growth28>0?'+':'')+number(r.growth28)+'%'}</td>
     <td>{number(r.ready)}</td><td>{number(r.scheduled)}</td><td>{number(r.errors)}</td>
     <td>{number(r.localRunwayDays)}</td><td>{stamp(r.nextPublication)}</td>
     <td>{stamp(r.lastUpload)}</td><td>{stamp(r.statsUpdatedAt)}</td>
    </tr>)}
   </tbody></table>
  </div>
  <small>* Ближайшая публикация и запас рассчитаны только по локальным задачам VYRON со статусом SCHEDULED. Это не полный серверный Channel Runway YouTube. Рост за 28 дней выводится только при подтверждённых двух периодах.</small>
 </section>;
}
