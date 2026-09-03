#!/usr/bin/env python3
from pathlib import Path
import re

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.13 schedule: '+msg)

# ---- One local schedule domain over the EXISTING Existing Videos cache ---------
Path('src/channelSchedule.ts').write_text(r'''import type {Channel,YoutubeExistingVideo} from './types';
export type ExistingCache={version:1;updatedAt:string;videos:YoutubeExistingVideo[];baseline:Record<string,YoutubeExistingVideo>;lastUndo:YoutubeExistingVideo[];syncInfo:any};
export type ChannelScheduleState={channelId:string;lastPublishedAt?:string;lastScheduledAt?:string;nextAvailableAt?:string;scheduledUntil?:string;publishIntervalDays:number;defaultPublishTime:string;scheduledCount:number;updatedAt?:string};
const EVENT='vyron-channel-schedule-changed';
export const existingCacheKey=(channelId:string)=>`vyron:existing-cache:v1:${channelId}`;
export function readExistingCache(channelId:string):ExistingCache|undefined{if(!channelId)return;try{const x=JSON.parse(localStorage.getItem(existingCacheKey(channelId))||'null');return x?.version===1?x:undefined}catch{return}}
export function writeExistingCache(channelId:string,x:ExistingCache){if(!channelId)return;try{localStorage.setItem(existingCacheKey(channelId),JSON.stringify(x));window.dispatchEvent(new CustomEvent(EVENT,{detail:{channelId,updatedAt:x.updatedAt}}))}catch{}}
const cloneVideo=(v:YoutubeExistingVideo)=>({...v,tags:[...(v.tags||[])]});
export function replaceExistingCacheFromSync(channelId:string,videos:YoutubeExistingVideo[],syncInfo:any){const rows=videos.map(cloneVideo),baseline=Object.fromEntries(rows.map(v=>[v.id,cloneVideo(v)]));writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:rows,baseline,lastUndo:[],syncInfo})}
export function mergeExistingCacheVideos(channelId:string,updates:YoutubeExistingVideo[]){const prev=readExistingCache(channelId);const map=new Map((prev?.videos||[]).map(v=>[v.id,cloneVideo(v)]));const base={...(prev?.baseline||{})};for(const u of updates){map.set(u.id,cloneVideo(u));base[u.id]=cloneVideo(u)}writeExistingCache(channelId,{version:1,updatedAt:new Date().toISOString(),videos:[...map.values()],baseline:base,lastUndo:prev?.lastUndo||[],syncInfo:prev?.syncInfo||null})}
const pad=(n:number)=>String(n).padStart(2,'0');
function parts(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))return;const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);const get=(t:string)=>p.find(x=>x.type===t)?.value||'';return{date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}}
export function krasDateKey(iso?:string){return iso?parts(iso)?.date:undefined}
export function toKratLocalInput(iso?:string){const p=iso?parts(iso):undefined;return p?`${p.date}T${p.time}`:''}
export function scheduleDateLabel(iso?:string){if(!iso)return'—';const d=new Date(iso);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
function addDays(key:string,days:number){const m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return key;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));d.setUTCDate(d.getUTCDate()+days);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
export function deriveChannelScheduleState(channel:Channel,videos:YoutubeExistingVideo[],updatedAt?:string,excludeIds:string[]=[]):ChannelScheduleState{
  const excluded=new Set(excludeIds),cadence=Math.max(1,Math.floor(channel.cadenceDays||1));const defaultTime=`${pad(channel.publishHour||0)}:${pad(channel.publishMinute||0)}`;
  const visible=videos.filter(v=>!excluded.has(v.id));
  const scheduled=visible.map(v=>v.publishAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const published=visible.map(v=>v.publishedAt).filter((x):x is string=>Boolean(x)&&Number.isFinite(Date.parse(x!))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const lastScheduledAt=scheduled.at(-1),lastPublishedAt=published.at(-1);const scheduledUntil=krasDateKey(lastScheduledAt);const occupied=new Set(scheduled.map(x=>krasDateKey(x)).filter(Boolean) as string[]);
  let nextAvailableAt:string|undefined;
  if(scheduledUntil){let next=addDays(scheduledUntil,cadence);let guard=0;while(occupied.has(next)&&guard++<10000)next=addDays(next,cadence);nextAvailableAt=`${next}T${defaultTime}:00+07:00`}
  return{channelId:channel.id,lastPublishedAt,lastScheduledAt,nextAvailableAt,scheduledUntil,publishIntervalDays:cadence,defaultPublishTime:defaultTime,scheduledCount:scheduled.length,updatedAt};
}
export function getChannelScheduleState(channelId:string,channel:Channel,excludeIds:string[]=[]){const cache=readExistingCache(channelId);return deriveChannelScheduleState(channel,cache?.videos||[],cache?.updatedAt,excludeIds)}
export function subscribeChannelSchedule(cb:(channelId:string)=>void){const fn=(e:Event)=>cb(String((e as CustomEvent<any>).detail?.channelId||''));window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn)}
''')

# ExistingVideos now imports the common cache helpers instead of defining its own.
p=Path('src/ExistingVideos.tsx'); s=p.read_text()
marker="import {isYoutubeQuotaError,markYoutubeQuotaExceeded,youtubeQuotaMessage,youtubeQuotaState} from './youtubeQuota';"
must(marker in s,'ExistingVideos import marker missing');s=s.replace(marker,marker+"\nimport {readExistingCache,writeExistingCache} from './channelSchedule';",1)
pat=re.compile(r"\ntype ExistingCache=\{version:1;updatedAt:string;videos:YoutubeExistingVideo\[\];baseline:Record<string,YoutubeExistingVideo>;lastUndo:YoutubeExistingVideo\[\];syncInfo:ExistingVideoSyncResult\|null\};\nconst existingCacheKey=.*?\nfunction writeExistingCache\(channelId:string,x:ExistingCache\)\{.*?\}\n",re.S)
s,n=pat.subn('\n',s,count=1);must(n==1,'ExistingVideos private cache block missing');p.write_text(s)

# Default fallback schedule time is explicitly KRAT (+07), never the Mac/VPN timezone.
p=Path('src/youtubeExisting.ts');s=p.read_text()
old="  const local=new Date(`${date}T${time}:00`);\n  return Number.isNaN(local.getTime())?undefined:local.toISOString();"
new="  const krat=new Date(Date.UTC(y,m-1,d,hh,mm)-7*60*60000);\n  return Number.isNaN(krat.getTime())?undefined:krat.toISOString();"
must(old in s,'youtubeExisting timezone fallback missing');s=s.replace(old,new,1);p.write_text(s)

# ---- Metadata: automatic continuation, preview, no hidden post-write sync --------
p=Path('src/MetadataPage.tsx');s=p.read_text()
marker="import {isYoutubeQuotaError,markYoutubeQuotaExceeded,youtubeQuotaMessage,youtubeQuotaState} from './youtubeQuota';"
must(marker in s,'Metadata import marker missing');s=s.replace(marker,marker+"\nimport {getChannelScheduleState,mergeExistingCacheVideos,replaceExistingCacheFromSync,scheduleDateLabel,toKratLocalInput} from './channelSchedule';\nimport {notifyError,notifySuccess,notifyWarning} from './notificationCenter';",1)
s=s.replace("type MetadataDraft={version:1;updatedAt:string;target:Target;rows:ImportedMetadata[];paste:string;order:'oldest'|'newest';filter:ExistingFilter;docxStrict:boolean;start:string;cadence:number;selectedVideos:YoutubeExistingVideo[];syncStatus:string;history:MetadataHistory[]};","type MetadataDraft={version:1;updatedAt:string;target:Target;rows:ImportedMetadata[];paste:string;order:'oldest'|'newest';filter:ExistingFilter;docxStrict:boolean;start:string;cadence:number;scheduleMode?:'auto'|'manual';selectedVideos:YoutubeExistingVideo[];syncStatus:string;history:MetadataHistory[]};",1)
old="const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),patchJob=useApp(s=>s.patchJob),toast=useApp(s=>s.toast);"
new="const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),patchJob=useApp(s=>s.patchJob),updateChannel=useApp(s=>s.updateChannel),toast=useApp(s=>s.toast);"
must(old in s,'Metadata store selector missing');s=s.replace(old,new,1)
old="[cadence,setCadence]=useState(2),[syncStatus,setSyncStatus]=useState(''),[applyProgress,setApplyProgress]"
new="[cadence,setCadence]=useState(2),[scheduleMode,setScheduleMode]=useState<'auto'|'manual'>('auto'),[scheduleRevision,setScheduleRevision]=useState(0),[syncStatus,setSyncStatus]=useState(''),[applyProgress,setApplyProgress]"
must(old in s,'Metadata state marker missing');s=s.replace(old,new,1)
old="setCadence(d?.cadence||channel?.cadenceDays||2);setTarget(d?.target||'youtube');"
new="setCadence(d?.cadence||channel?.cadenceDays||2);setScheduleMode(d?.scheduleMode||'auto');setTarget(d?.target||'youtube');setScheduleRevision(x=>x+1);"
must(old in s,'Metadata restore marker missing');s=s.replace(old,new,1)
old="const d:MetadataDraft={version:1,updatedAt,target,rows,paste,order,filter,docxStrict,start,cadence,selectedVideos:compactSelected(yt),syncStatus,history};"
new="const d:MetadataDraft={version:1,updatedAt,target,rows,paste,order,filter,docxStrict,start,cadence,scheduleMode,selectedVideos:compactSelected(yt),syncStatus,history};"
must(old in s,'Metadata draft write marker missing');s=s.replace(old,new,1)
s=s.replace("[channelId,target,rows,paste,order,filter,docxStrict,start,cadence,yt,syncStatus,history]","[channelId,target,rows,paste,order,filter,docxStrict,start,cadence,scheduleMode,yt,syncStatus,history]",1)

# Manual YouTube sync remains explicit, but now also refreshes the shared LOCAL cache.
pat=re.compile(r" async function loadYoutube\(\)\{.*?\n const future=",re.S)
m=pat.search(s);must(m is not None,'Metadata loadYoutube function missing')
load_fn=r''' async function loadYoutube(){if(!profileId){setSyncStatus('OAuth не подключён');return}if(youtubeQuotaState().blocked){setSyncStatus(youtubeQuotaMessage());return}setBusy(true);try{const selectedIds=new Set(yt.filter(v=>v.selected).map(v=>v.id));const r=await api.youtubeListExisting(profileId,Math.max(1,Math.min(5000,limit)));const videos=(r.videos||[]).map(v=>({...v,selected:selectedIds.has(v.id)}));setYt(videos);replaceExistingCacheFromSync(channelId,videos,r);setScheduleRevision(x=>x+1);setSyncStatus(r.complete?`✓ ${r.received}/${r.youtubeFound} получено точно`:`⚠ ${r.received}/${Math.min(r.youtubeFound,r.requested)} — синхронизация неполная`);notifySuccess('Данные YouTube обновлены',`Получено ${r.received}/${Math.min(r.youtubeFound,r.requested)} видео.`,{operationId:`youtube-sync:${channelId}:${Date.now()}`})}catch(e){if(isYoutubeQuotaError(e)){markYoutubeQuotaExceeded(e);setSyncStatus(youtubeQuotaMessage());notifyWarning('YouTube quota исчерпана','Синхронизация поставлена на паузу.')}else{setSyncStatus(String(e));notifyError('Не удалось обновить данные YouTube',String(e))}}finally{setBusy(false)}}
 const future='''
s=pat.sub(load_fn,s,count=1)

# Schedule domain values and channel-specific controls.
marker=" const selectedYt=useMemo(()=>orderedExistingVideos(yt.filter(v=>v.selected),order),[yt,order]);"
must(marker in s,'selectedYt marker missing')
addition=r'''
 const scheduleState=useMemo(()=>channel?getChannelScheduleState(channelId,channel):undefined,[channelId,channel?.id,channel?.cadenceDays,channel?.publishHour,channel?.publishMinute,scheduleRevision,yt.length]);
 const schedulePairs=useMemo(()=>selectedYt.map((v,i)=>({v,row:rows[i]})).filter(x=>scheduleMode==='manual'||!x.v.publishAt),[selectedYt,rows,scheduleMode]);
 const effectiveStart=scheduleMode==='auto'?(scheduleState?.nextAvailableAt?toKratLocalInput(scheduleState.nextAvailableAt):''):start;
 const schedulePreview=useMemo(()=>effectiveStart?buildExistingScheduleFromLocal(schedulePairs.map(x=>x.v),effectiveStart,cadence,schedulePairs.map(x=>x.row)):[],[schedulePairs,effectiveStart,cadence]);
 const previewFirst=schedulePreview[0]?.publishAt,previewLast=schedulePreview.at(-1)?.publishAt;
 const defaultPublishTime=scheduleState?.defaultPublishTime||`${String(channel?.publishHour||0).padStart(2,'0')}:${String(channel?.publishMinute||0).padStart(2,'0')}`;
 function changeCadence(value:number){const next=Math.max(1,Math.min(30,Math.floor(value||1)));setCadence(next);if(channel)updateChannel(channel.id,{cadenceDays:next});setScheduleRevision(x=>x+1)}
 function changeDefaultTime(value:string){const m=value.match(/^(\d{2}):(\d{2})$/);if(!m||!channel)return;updateChannel(channel.id,{publishHour:+m[1],publishMinute:+m[2]});setScheduleRevision(x=>x+1)}
'''
s=s.replace(marker,marker+addition,1)

# Future/local metadata success = typed notification.
s=s.replace("toast(`Будущие видео: применено ${ok}/${rows.length}`)","notifySuccess('Метаданные сохранены',`${ok} из ${rows.length} будущих видео обновлены.`,{operationId:`future-metadata:${channelId}:${Date.now()}`})",1)

# Replace applyYoutube to use automatic continuation and local reconciliation instead of hidden post-write sync.
pat=re.compile(r" async function applyYoutube\(\)\{.*?\n async function apply\(\)",re.S)
m=pat.search(s);must(m is not None,'Metadata applyYoutube function missing')
apply_fn=r''' async function applyYoutube(){
  if(!profileId||!selectedYt.length)return;if(docxStrict&&rows.length!==selectedYt.length){toast('DOCX не применён: количество выбранных видео изменилось после импорта');return}if(youtubeQuotaState().blocked){toast(youtubeQuotaMessage());return}
  if(scheduleMode==='auto'&&schedulePairs.length>0&&!effectiveStart){notifyWarning('Нет будущего расписания','На канале нет будущих отложенных публикаций. Выберите первую дату вручную.');return}
  setBusy(true);setApplyReport(null);let metadataOk=0,scheduleOk=0,scheduleTotal=0,failed=0,pausedByQuota=false;const issues:ApplyIssue[]=[];const completedIds=new Set<string>();const cacheUpdates:YoutubeExistingVideo[]=[];
  try{
    const scheduled=effectiveStart?buildExistingScheduleFromLocal(schedulePairs.map(x=>x.v),effectiveStart,cadence,schedulePairs.map(x=>x.row)):[];const scheduleById=new Map(scheduled.map(v=>[v.id,v.publishAt]));await api.youtubeBackupExisting(profileId,selectedYt);let done=0;
    for(const m of matches){const v=m.video,r=m.row;if(!v)continue;done++;setApplyProgress(`${done}/${matched}`);try{
      const basePublishAt=scheduleById.get(v.id)||v.publishAt;const publishAt=v.privacyStatus==='private'?resolveKratPublishAt(r.publishAt,basePublishAt):v.publishAt;
      const title=r.title||v.title,description=r.description||v.description,tags=r.tags?.length?r.tags:v.tags;const result=await api.youtubeUpdateExisting(profileId,v.id,title,description,tags,publishAt,v.privacyStatus);
      if(result.metadataAccepted===false){failed++;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:'YouTube не принял title/description/tags'});continue}metadataOk++;let updated:YoutubeExistingVideo={...v,title,description,tags};
      if(result.scheduleRequested){scheduleTotal++;if(result.scheduleAccepted!==false){scheduleOk++;completedIds.add(v.id);updated={...updated,publishAt}}else{failed++;const err=result.scheduleError||'YouTube не принял расписание';if(isYoutubeQuotaError(err)){markYoutubeQuotaExceeded(err);pausedByQuota=true;issues.push({videoId:v.id,title:v.title,phase:'schedule',error:youtubeQuotaMessage()});cacheUpdates.push(updated);break}issues.push({videoId:v.id,title:v.title,phase:'schedule',error:err})}}
      else completedIds.add(v.id);cacheUpdates.push(updated);
    }catch(e){if(isYoutubeQuotaError(e)){markYoutubeQuotaExceeded(e);pausedByQuota=true;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:youtubeQuotaMessage()});break}failed++;issues.push({videoId:v.id,title:v.title,phase:'metadata',error:String(e)})}}
    if(cacheUpdates.length){mergeExistingCacheVideos(channelId,cacheUpdates);const byId=new Map(cacheUpdates.map(v=>[v.id,v]));setYt(prev=>prev.map(v=>byId.get(v.id)?{...byId.get(v.id)!,selected:v.selected}:v));setScheduleRevision(x=>x+1)}
    let pending=0;if(pausedByQuota){const remainingMatches=matches.filter(x=>x.video&&!completedIds.has(x.video.id));const pendingIds=new Set(remainingMatches.map(x=>x.video!.id));const pendingRows=remainingMatches.map(x=>x.row);setRows(pendingRows);setYt(prev=>prev.map(v=>({...v,selected:pendingIds.has(v.id)})));pending=pendingIds.size;setSyncStatus(`⏸ Квота YouTube исчерпана • сохранено ${completedIds.size} • осталось ${pending}`)}
    const report:ApplyReport={metadataOk,total:matched,scheduleOk,scheduleTotal,failed,issues,pausedByQuota,pending,at:new Date().toISOString()};setApplyReport(report);const h:MetadataHistory={at:report.at!,metadataOk,total:matched,scheduleOk,scheduleTotal,failed,pausedByQuota};setHistory(x=>[h,...x].slice(0,20));
    if(pausedByQuota)notifyWarning('Выполнение приостановлено',`Квота YouTube закончилась. Осталось ${pending}; выбранная пачка сохранена.`);
    else if(metadataOk===matched&&scheduleOk===scheduleTotal&&failed===0){const after=channel?getChannelScheduleState(channelId,channel):undefined;notifySuccess(scheduleTotal?'Метаданные и расписание применены':'Метаданные применены',`${metadataOk} из ${matched} видео успешно обновлены.${after?.scheduledUntil?` Канал запланирован до ${scheduleDateLabel(after.lastScheduledAt)}.`:''}`,{operationId:`metadata-apply:${channelId}:${report.at}`})}
    else notifyWarning('Выполнено частично',`Обновлено ${metadataOk} из ${matched}. Не удалось: ${Math.max(failed,matched-metadataOk)}.`,{operationId:`metadata-partial:${channelId}:${report.at}`});
  }catch(e){if(isYoutubeQuotaError(e)){markYoutubeQuotaExceeded(e);setSyncStatus(youtubeQuotaMessage());notifyWarning('YouTube quota исчерпана','Черновик сохранён для продолжения.')}else{const issue={videoId:'BATCH',title:'Пакетная операция',phase:'metadata' as const,error:String(e)};setApplyReport({metadataOk,total:matched,scheduleOk,scheduleTotal,failed:failed+1,issues:[...issues,issue],at:new Date().toISOString()});notifyError('Не удалось применить метаданные',String(e))}}
  finally{setApplyProgress('');setBusy(false)}
 }
 async function apply()'''
s=pat.sub(apply_fn,s,count=1)

# Replace the old always-manual schedule mini block with auto continuation + fallback manual mode.
old='<div className="scheduleMini"><label>Первая дата<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Каждые N дней<input type="number" min="1" max="30" value={cadence} onChange={e=>setCadence(+e.target.value||1)}/></label><small>Если DOCX содержит PUBLISH TIME, используется его время и выбранные здесь даты/интервал.</small></div>'
new=r'''<div className="scheduleMini scheduleSmart"><div className="scheduleSmartHead"><div><b>Расписание канала</b><small>{scheduleState?.updatedAt?`Локальные данные обновлены ${new Date(scheduleState.updatedAt).toLocaleString('ru-RU')}`:'Используются сохранённые данные канала'}</small></div></div><div className="scheduleModeButtons"><button className={scheduleMode==='auto'?'active':''} onClick={()=>setScheduleMode('auto')}>Продолжить расписание автоматически</button><button className={scheduleMode==='manual'?'active':''} onClick={()=>setScheduleMode('manual')}>Указать первую дату вручную</button></div>{scheduleMode==='auto'?scheduleState?.lastScheduledAt?<><div className="scheduleFacts"><span><small>Запланировано до</small><b>{scheduleDateLabel(scheduleState.lastScheduledAt)}</b></span><span><small>Следующая дата</small><b>{scheduleDateLabel(scheduleState.nextAvailableAt)}</b></span><span><small>Интервал</small><b>каждые {cadence} дн.</b></span><span><small>Время</small><b>{defaultPublishTime}</b></span></div>{schedulePreview.length>0&&<div className="scheduleBatchPreview"><b>Новая партия: {scheduleDateLabel(previewFirst)} → {scheduleDateLabel(previewLast)}</b><small>{schedulePreview.length} видео • первая свободная дата выбрана автоматически</small><div>{schedulePreview.slice(0,6).map((v,i)=><span key={v.id}>{String(i+1).padStart(3,'0')} → {scheduleDateLabel(v.publishAt)}</span>)}{schedulePreview.length>6&&<span>… ещё {schedulePreview.length-6}</span>}</div></div>}</>:<div className="scheduleNoFuture"><b>На канале нет будущих отложенных публикаций</b><span>Выберите «Указать первую дату вручную», чтобы задать начало расписания.</span></div>:<label>Первая дата<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label>}<label>Публиковать каждые N дней<input type="number" min="1" max="30" value={cadence} onChange={e=>changeCadence(+e.target.value||1)}/></label><label>Время по умолчанию<input type="time" value={defaultPublishTime} onChange={e=>changeDefaultTime(e.target.value)}/></label><small>Если DOCX содержит PUBLISH TIME, для конкретного видео используется его время. Даты продолжают расписание текущего канала.</small></div>'''
must(old in s,'Metadata old scheduleMini block missing');s=s.replace(old,new,1);p.write_text(s)

# ---- Command Center reads the same local scheduled-until state ------------------
p=Path('src/CommandCenter.tsx');s=p.read_text()
marker="import {defaultChannelProductionPrefs,useProductionPrefs} from './productionPrefs';"
must(marker in s,'CommandCenter import marker missing');s=s.replace(marker,marker+"\nimport {getChannelScheduleState,scheduleDateLabel} from './channelSchedule';",1)
old="return <button className=\"commandRow commandChannelRow\" key={channel.id} onClick={()=>openProduction(channel.id)}><span><b>{channel.name}</b><small>{record?.scheduledUntil?`Запланировано до ${dateLabel(record.scheduledUntil)}`:'Расписание ещё не подтверждено'}</small></span>"
new="const localSchedule=getChannelScheduleState(channel.id,channel);return <button className=\"commandRow commandChannelRow\" key={channel.id} onClick={()=>openProduction(channel.id)}><span><b>{channel.name}</b><small>{localSchedule.lastScheduledAt?`Запланировано до ${scheduleDateLabel(localSchedule.lastScheduledAt)}`:record?.scheduledUntil?`Запланировано до ${dateLabel(record.scheduledUntil)}`:'Расписание ещё не подтверждено'}</small></span>"
must(old in s,'CommandCenter scheduled-until marker missing');s=s.replace(old,new,1);p.write_text(s)

# ---- Schedule CSS ---------------------------------------------------------------
p=Path('src/styles.css');s=p.read_text();s+=r'''
/* VYRON 1.0.13 — channel schedule continuation */
.scheduleSmart{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}.scheduleSmartHead{display:flex;align-items:center;justify-content:space-between}.scheduleSmartHead b{font-size:11px;color:#e5f4fa}.scheduleSmartHead small{display:block;color:#6d899b;font-size:8px;margin-top:2px}.scheduleModeButtons{display:flex;gap:7px}.scheduleModeButtons button{flex:1;border:1px solid #1d3b4e;background:#071621;color:#86a1b2;border-radius:9px;padding:9px;font-size:8px;font-weight:800}.scheduleModeButtons button.active{border-color:rgba(72,221,194,.4);background:rgba(72,221,194,.08);color:#70e3c3}.scheduleFacts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.scheduleFacts span{border:1px solid #173548;background:#07131d;border-radius:9px;padding:9px}.scheduleFacts small{display:block;color:#668396;font-size:7px}.scheduleFacts b{display:block;color:#e0f0f7;font-size:10px;margin-top:3px}.scheduleBatchPreview{border:1px solid rgba(75,210,255,.25);background:rgba(75,210,255,.035);border-radius:10px;padding:10px}.scheduleBatchPreview>b{font-size:10px;color:#dff3fa}.scheduleBatchPreview>small{display:block;color:#6f8c9e;font-size:8px;margin:2px 0 8px}.scheduleBatchPreview>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.scheduleBatchPreview span{font-size:8px;color:#91a8b5}.scheduleNoFuture{border:1px solid rgba(255,187,81,.3);background:rgba(255,187,81,.04);border-radius:10px;padding:10px}.scheduleNoFuture b{display:block;color:#ffc26c;font-size:9px}.scheduleNoFuture span{display:block;color:#8398a5;font-size:8px;margin-top:3px}@media(max-width:900px){.scheduleFacts{grid-template-columns:repeat(2,minmax(0,1fr))}.scheduleBatchPreview>div{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.scheduleModeButtons{flex-direction:column}.scheduleFacts{grid-template-columns:1fr}.scheduleBatchPreview>div{grid-template-columns:1fr}}
''';p.write_text(s)

# ---- Pure schedule regression tests --------------------------------------------
Path('src/channelSchedule.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import {deriveChannelScheduleState,toKratLocalInput} from './channelSchedule';
import {buildExistingScheduleFromLocal} from './youtubeExisting';
import type {Channel,YoutubeExistingVideo} from './types';
const channel:Channel={id:'riviera',name:'Riviera Sax Club',slug:'riviera',cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Sax',country:'FR',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}};
const v=(id:string,publishAt?:string):YoutubeExistingVideo=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',publishAt,selected:false});
describe('channel schedule continuation',()=>{
 it('continues 13 Sep on 15 Sep for two-day cadence',()=>{const rows=['01','03','05','07','09','11','13'].map((d,i)=>v(String(i),`2026-09-${d}T18:00:00+07:00`));const s=deriveChannelScheduleState(channel,rows);expect(s.scheduledUntil).toBe('2026-09-13');expect(s.nextAvailableAt).toBe('2026-09-15T18:00:00+07:00')});
 it('respects an already occupied 15 Sep and continues on 17 Sep',()=>{const rows=[v('a','2026-09-13T18:00:00+07:00'),v('b','2026-09-15T18:00:00+07:00')];expect(deriveChannelScheduleState(channel,rows).nextAvailableAt).toBe('2026-09-17T18:00:00+07:00')});
 it('34 videos after 13 Sep end on 20 Nov',()=>{const state=deriveChannelScheduleState(channel,[v('old','2026-09-13T18:00:00+07:00')]);const videos=Array.from({length:34},(_,i)=>v(`n${i}`));const plan=buildExistingScheduleFromLocal(videos,toKratLocalInput(state.nextAvailableAt),2,[]);expect(plan[0].publishAt).toBe('2026-09-15T11:00:00.000Z');expect(plan.at(-1)?.publishAt).toBe('2026-11-20T11:00:00.000Z')});
 it('fallback time is KRAT even when Mac timezone differs',()=>{const plan=buildExistingScheduleFromLocal([v('x')],'2026-09-15T18:00',2,[]);expect(plan[0].publishAt).toBe('2026-09-15T11:00:00.000Z')});
});
''')

print('VYRON 1.0.13 automatic schedule patch applied')
