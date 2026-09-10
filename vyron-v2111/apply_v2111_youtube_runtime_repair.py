#!/usr/bin/env python3
from pathlib import Path
import json,re,sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

def read(rel): return (root/rel).read_text()
def write(rel,s):
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def replace_once(rel,old,new):
    p=root/rel;s=p.read_text()
    if old not in s: raise SystemExit(f'{rel}: anchor missing: {old[:180]!r}')
    p.write_text(s.replace(old,new,1))

# -----------------------------------------------------------------------------
# Version 2.1.1
# -----------------------------------------------------------------------------
pkg=json.loads(read('package.json'));pkg['version']='2.1.1';write('package.json',json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
conf=json.loads(read('src-tauri/tauri.conf.json'));conf['version']='2.1.1';write('src-tauri/tauri.conf.json',json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
p=root/'src-tauri/Cargo.toml';s=p.read_text();s,n=re.subn(r'(?m)^version\s*=\s*"2\.1\.0"\s*$', 'version = "2.1.1"',s,count=1)
if n!=1: raise SystemExit('Cargo.toml 2.1.0 version anchor missing')
p.write_text(s)

# -----------------------------------------------------------------------------
# Canonical selection + per-item preflight. One invalid item must not poison all.
# -----------------------------------------------------------------------------
write('src/publisherRuntime.ts',r'''import type {VideoJob} from './types';

export type PublisherPreflightIssueCode='MISSING_SCHEDULE'|'PAST_SCHEDULE'|'MISSING_TITLE'|'DUPLICATE'|'RECOVERY'|'MISSING_THUMBNAIL';
export type PublisherPreflightIssue={code:PublisherPreflightIssueCode;message:string};
export type PublisherPreflightItem={id:string;number:number;valid:boolean;issues:PublisherPreflightIssue[]};
export type PublisherPreflightOptions={
 getPublishAt:(job:VideoJob)=>string|undefined;
 safeMode:boolean;
 duplicateIds?:Iterable<string>;
 recoveryIds?:Iterable<string>;
 requireThumbnail?:boolean;
 hasThumbnail?:(job:VideoJob)=>boolean;
 nowMs?:number;
};

export function canonicalSelectedJobs(channelJobs:VideoJob[],selectedIds:string[]){
 const selected=new Set(selectedIds);return channelJobs.filter(j=>selected.has(j.id)).sort((a,b)=>a.number-b.number)
}
export function publisherUploadButtonLabel(selectedCount:number,readyCount=selectedCount){
 if(selectedCount<=0)return 'ВЫБЕРИТЕ ВИДЕО';
 if(readyCount<=0)return 'НЕТ ВИДЕО, ГОТОВЫХ К ЗАГРУЗКЕ';
 return `ЗАГРУЗИТЬ ${readyCount} ВИДЕО НА YOUTUBE`
}
export function publisherPreflightItems(jobs:VideoJob[],opts:PublisherPreflightOptions){
 const duplicates=new Set(opts.duplicateIds||[]),recovery=new Set(opts.recoveryIds||[]),now=opts.nowMs??Date.now();
 const items:PublisherPreflightItem[]=jobs.map(job=>{
  const issues:PublisherPreflightIssue[]=[],publishAt=opts.getPublishAt(job),ms=publishAt?Date.parse(publishAt):NaN;
  if(!publishAt||!Number.isFinite(ms))issues.push({code:'MISSING_SCHEDULE',message:'Не удалось получить корректный publishAt'});
  else if(ms<=now)issues.push({code:'PAST_SCHEDULE',message:`Дата публикации уже прошла: ${publishAt}`});
  if(opts.safeMode&&!job.title.trim())issues.push({code:'MISSING_TITLE',message:'Название видео пустое'});
  if(duplicates.has(job.id))issues.push({code:'DUPLICATE',message:'Файл уже успешно загружался на этот канал'});
  if(recovery.has(job.id))issues.push({code:'RECOVERY',message:'Для видео уже существует resumable upload session'});
  if(opts.requireThumbnail&&!(opts.hasThumbnail?.(job)??false))issues.push({code:'MISSING_THUMBNAIL',message:'Для видео не сопоставлена новая обложка'});
  return{id:job.id,number:job.number,valid:issues.length===0,issues}
 });
 return{items,ready:items.filter(x=>x.valid),blocked:items.filter(x=>!x.valid),readyIds:items.filter(x=>x.valid).map(x=>x.id)}
}
''')

# -----------------------------------------------------------------------------
# Metadata: preserve date-only input and build timezone-aware RFC3339 instants.
# -----------------------------------------------------------------------------
p=root/'src/metadata.ts';s=p.read_text()
s=s.replace("  const d=new Date(s);\n  return Number.isNaN(d.getTime())?undefined:d.toISOString()", "  if(/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return s;\n  const d=new Date(s);\n  return Number.isNaN(d.getTime())?undefined:d.toISOString()")
old="""  const zoneMatch=s.match(/\\b(KRAT|MSK|UTC|GMT)\\b/i);
  let publishTimezone=zoneMatch?.[1]?.toUpperCase();
  let publishUtcOffsetMinutes=publishTimezone?ZONE_OFFSETS[publishTimezone]:undefined;"""
new="""  const zoneMatch=s.match(/\\b(KRAT|MSK|UTC|GMT)\\b/i),ianaMatch=s.match(/\\b([A-Za-z_]+\\/[A-Za-z_]+)\\b/);
  let publishTimezone=ianaMatch?.[1]||zoneMatch?.[1]?.toUpperCase();
  let publishUtcOffsetMinutes=publishTimezone&&ZONE_OFFSETS[publishTimezone]!==undefined?ZONE_OFFSETS[publishTimezone]:undefined;"""
if old not in s: raise SystemExit('metadata timezone anchor missing')
s=s.replace(old,new,1);p.write_text(s)

write('src/publisherMetadata.ts',r'''import type {ImportedMetadata} from './metadata';
import type {VideoJob} from './types';

const DATE_ONLY=/^\d{4}-\d{2}-\d{2}$/;
function dateKey(raw?:string){if(!raw)return'';const m=String(raw).match(/^(\d{4}-\d{2}-\d{2})/);return m?.[1]||''}
function timeParts(raw?:string){const m=String(raw||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?[+m[1],+m[2]] as const:undefined}
function fixedOffsetIso(day:string,time:string,offsetMinutes:number){
 const tm=timeParts(time);if(!DATE_ONLY.test(day)||!tm)return undefined;const[y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,tm[0],tm[1])-offsetMinutes*60000).toISOString()
}
function ianaLocalIso(day:string,time:string,timeZone:string){
 const tm=timeParts(time);if(!DATE_ONLY.test(day)||!tm)return undefined;const[y,m,d]=day.split('-').map(Number),target=Date.UTC(y,m-1,d,tm[0],tm[1]);let guess=target;
 try{
  for(let n=0;n<3;n++){
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
   const get=(t:string)=>Number(parts.find(x=>x.type===t)?.value||0),represented=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));guess+=target-represented
  }
  const verify=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
  const get=(t:string)=>String(verify.find(x=>x.type===t)?.value||'');const local=`${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  return local===`${day} ${time}`?new Date(guess).toISOString():undefined
 }catch{return undefined}
}
function normalizedRowInstant(row:ImportedMetadata,defaultOffsetMinutes=420){
 const raw=row.publishAt,day=dateKey(raw),time=row.publishTime;
 if(raw&&time&&day){
  if(row.publishTimezone?.includes('/'))return ianaLocalIso(day,time,row.publishTimezone);
  const off=Number.isFinite(row.publishUtcOffsetMinutes)?Number(row.publishUtcOffsetMinutes):defaultOffsetMinutes;return fixedOffsetIso(day,time,off)
 }
 if(raw){if(DATE_ONLY.test(raw))return undefined;const d=new Date(raw);return Number.isFinite(d.getTime())?d.toISOString():undefined}
 return undefined
}
export function metadataRowForJob(rows:ImportedMetadata[],job:VideoJob,index:number){const exact=rows.find(x=>x.number===job.number);if(exact)return exact;const relative=rows.find(x=>x.number===index+1);return relative||rows[index]}
export function metadataPublishAt(row:ImportedMetadata|undefined,fallback?:string,defaultOffsetMinutes=420){
 if(!row)return fallback&&Number.isFinite(Date.parse(fallback))?new Date(fallback).toISOString():undefined;
 const direct=normalizedRowInstant(row,defaultOffsetMinutes);if(direct)return direct;
 if(row.publishTime&&fallback){const tz=row.publishTimezone?.includes('/')?row.publishTimezone:'Asia/Krasnoyarsk',day=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(fallback));return row.publishTimezone?.includes('/')?ianaLocalIso(day,row.publishTime,row.publishTimezone):fixedOffsetIso(day,row.publishTime,Number.isFinite(row.publishUtcOffsetMinutes)?Number(row.publishUtcOffsetMinutes):defaultOffsetMinutes)}
 return undefined
}
export function resolvedUploadMetadata(job:VideoJob,row:ImportedMetadata|undefined,publishAt?:string,defaultCategory='10'){return{title:(row?.title||job.title).trim(),description:row?.description??job.description,tags:row?.tags?.length?row.tags:job.tags,publishAt:publishAt||metadataPublishAt(row,job.publishAt),categoryId:defaultCategory||'10'}}
''')

# -----------------------------------------------------------------------------
# Structured Error Center fields while preserving all existing call sites.
# -----------------------------------------------------------------------------
p=root/'src/errorHistory.ts';s=p.read_text()
s=s.replace("export type ErrorHistoryItem={id:string;title:string;message:string;technicalDetail?:string;createdAt:number};","export type ErrorStage='selection'|'metadata'|'schedule'|'preflight'|'upload-init'|'upload-transfer'|'youtube-insert'|'metadata-apply'|'schedule-apply'|'verification';\nexport type ErrorHistoryMeta={errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage};\nexport type ErrorHistoryItem={id:string;title:string;message:string;technicalDetail?:string;errorCode?:string;videoId?:string;filePath?:string;stage?:ErrorStage;createdAt:number};")
old="export function appendErrorHistory(title:string,message='',technicalDetail=''){const row={id:crypto.randomUUID(),title,message,technicalDetail:technicalDetail||undefined,createdAt:Date.now()};save([...load(),row]);return row}"
new="export function appendErrorHistory(title:string,message='',technicalDetail='',meta:ErrorHistoryMeta={}){const row:ErrorHistoryItem={id:crypto.randomUUID(),title,message,technicalDetail:technicalDetail||undefined,errorCode:meta.errorCode,videoId:meta.videoId,filePath:meta.filePath,stage:meta.stage,createdAt:Date.now()};save([...load(),row]);return row}"
if old not in s: raise SystemExit('errorHistory append anchor missing')
s=s.replace(old,new,1);p.write_text(s)

# Error mapping must surface actual YouTube root cause instead of UNKNOWN generic.
p=root/'src/errorCenter.ts';s=p.read_text()
if 'function youtubeRootMessage' not in s:
    s=s.replace("const lower=(e:unknown)=>String(e??'').toLocaleLowerCase('ru-RU');",r'''const lower=(e:unknown)=>String(e??'').toLocaleLowerCase('ru-RU');
function youtubeRootMessage(detail:string){
 const jsonStart=detail.indexOf('{');if(jsonStart>=0){try{const v=JSON.parse(detail.slice(jsonStart));const m=v?.error?.message||v?.error_description;const r=v?.error?.errors?.[0]?.reason;if(m)return `${m}${r?` [${r}]`:''}`}catch{}}
 const quoted=detail.match(/"message"\s*:\s*"([^"]+)"/i)?.[1],reason=detail.match(/"reason"\s*:\s*"([^"]+)"/i)?.[1];if(quoted)return `${quoted}${reason?` [${reason}]`:''}`;
 return detail.replace(/^Error:\s*/i,'').slice(0,500)
}''',1)
anchor=" if(context==='update')return{code:'UPDATE',title:'Обновление не установлено',message:'Текущая версия приложения сохранена. Можно повторить проверку обновлений позже.',detail,retryable:true,action:'retry'};"
insert=anchor+"\n if(context==='upload'||context==='youtube'||s.includes('youtube upload')||s.includes('youtube session'))return{code:'YOUTUBE_RUNTIME',title:'YouTube отклонил операцию',message:youtubeRootMessage(detail),detail,retryable:true,action:'retry'};"
if anchor not in s: raise SystemExit('errorCenter fallback anchor missing')
s=s.replace(anchor,insert,1);p.write_text(s)

# -----------------------------------------------------------------------------
# PublisherOS: one canonical selection, truthful preflight, partial batch, logging,
# immediate videoId persistence, verification failure without duplicate re-upload.
# -----------------------------------------------------------------------------
p=root/'src/PublisherOS.tsx';s=p.read_text()
s=s.replace("import {batchFailureToast,type BatchFailure} from './errorPresentationPolicy';","import {batchFailureToast,type BatchFailure} from './errorPresentationPolicy';\nimport {canonicalSelectedJobs,publisherPreflightItems,publisherUploadButtonLabel} from './publisherRuntime';")
s=s.replace("const selected=channelJobs.filter(j=>draft.selectedIds.includes(j.id)).sort((a,b)=>a.number-b.number),thumbMap=useMemo(()=>mapThumbnailsToJobs(selected,draft.thumbs),[selected.map(j=>j.id).join('|'),draft.thumbs.join('|')]);","const selected=canonicalSelectedJobs(channelJobs,draft.selectedIds),thumbMap=useMemo(()=>mapThumbnailsToJobs(selected,draft.thumbs),[selected.map(j=>j.id).join('|'),draft.thumbs.join('|')]);")
old=" const quotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.insert',count:selected.length,label:'Загрузка видео'},{method:'thumbnails.set',count:thumbCount,label:'Обложки'}]),[selected.length,thumbCount,quotaRev]),quota=youtubeQuotaUsage(),uploadUsage=youtubeQuotaBucketUsage('videoUploads'),recovery=sessions.filter(x=>channelJobs.some(j=>j.id===x.jobId));"
new=""" const recovery=sessions.filter(x=>channelJobs.some(j=>j.id===x.jobId)),preflight=publisherPreflightItems(selected,{getPublishAt:effectivePublishAt,safeMode:settings.youtubePublishSafeMode,duplicateIds:draft.allowDuplicate?[]:duplicates.map(x=>x.id),recoveryIds:recovery.map(x=>x.jobId),requireThumbnail:thumbnailsEnabled&&!draft.allowMissingThumbs,hasThumbnail:selectedThumbnail}),uploadableSelected=selected.filter(j=>preflight.readyIds.includes(j.id)),blockedItems=preflight.blocked,uploadableThumbCount=thumbnailsEnabled?uploadableSelected.filter(j=>Boolean(selectedThumbnail(j))).length:0;
 const quotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.insert',count:uploadableSelected.length,label:'Загрузка видео'},{method:'videos.list',count:uploadableSelected.length,label:'Проверка загрузки'},{method:'thumbnails.set',count:uploadableThumbCount,label:'Обложки'}]),[uploadableSelected.length,uploadableThumbCount,quotaRev]),quota=youtubeQuotaUsage(),uploadUsage=youtubeQuotaBucketUsage('videoUploads');"""
if old not in s: raise SystemExit('Publisher quota/preflight anchor missing')
s=s.replace(old,new,1)
start_old="async function runBatch(requested?:number){if(!channel||!profileId)return;if(draft.scheduleMode!=='file'&&scheduleSync.state!=='ready'){notifyWarning('Сначала синхронизируйте расписание','Для автоматического графика VYRON должен получить последнюю дату publishAt с YouTube.');return}let batch=selected.filter(j=>!sessions.some(x=>x.jobId===j.id)).slice(0,requested||selected.length);"
start_new="async function runBatch(requested?:number){log(`[UPLOAD] button clicked channel=${channelId} selected=${selected.length} ready=${uploadableSelected.length}`);if(!channel||!profileId){notifyWarning('Загрузка недоступна','Для канала не найден активный YouTube OAuth профиль.');return}if(draft.scheduleMode!=='file'&&scheduleSync.state!=='ready'){notifyWarning('Сначала синхронизируйте расписание','Для автоматического графика VYRON должен получить последнюю дату publishAt с YouTube.');return}if(blockedItems.length){for(const x of blockedItems){const j=selected.find(v=>v.id===x.id),message=`VIDEO_${String(x.number).padStart(3,'0')}: ${x.issues.map(i=>i.message).join(' • ')}`;if(j)patchJob(j.id,{error:message});appendErrorHistory('Pre-flight: видео пропущено',message,x.issues.map(i=>i.code).join(','),{errorCode:x.issues[0]?.code,videoId:x.id,filePath:j?.finalPath,stage:'preflight'})}notifyWarning('Часть видео пропущена',`${blockedItems.length} видео не прошли pre-flight. Остальные ${uploadableSelected.length} продолжают обработку.`)}let batch=uploadableSelected.slice(0,requested||uploadableSelected.length);"
if start_old not in s: raise SystemExit('Publisher runBatch start anchor missing')
s=s.replace(start_old,start_new,1)
# Remove old batch-wide blockers now handled per video.
for old in [
"if(batch.some(j=>!effectivePublishAt(j))){notifyWarning('Pre-flight не пройден','У каждого выбранного видео должна быть дата публикации: publishAt передаётся сразу в первоначальном videos.insert.');return}",
"if(batch.some(j=>!isFuturePublishAt(effectivePublishAt(j)))){notifyWarning('Дата публикации уже прошла','Дата должна быть позже текущего времени. Синхронизируйте расписание с YouTube и повторите.');return}",
"if(settings.youtubePublishSafeMode&&batch.some(j=>!j.title.trim())){notifyWarning('Pre-flight не пройден','Для Safe Mode нужно название у каждого выбранного видео.');return}",
"if(draft.thumbs.length>0&&batch.some(j=>!(thumbMap[j.id]||j.thumbnailPath))&&!draft.allowMissingThumbs){notifyWarning('Обложек меньше, чем видео','Подтвердите продолжение без обложек для оставшихся видео.');return}",
"const dup=batch.filter(j=>fingerprints[j.id]&&findSuccessfulUpload(channelId,fingerprints[j.id].fingerprint));if(dup.length&&!draft.allowDuplicate){notifyWarning('Найдены уже загруженные файлы',`${dup.length} видео имеют успешный fingerprint на этом канале.`);return}"
]:
    if old not in s: raise SystemExit(f'Publisher old blocker missing: {old[:80]}')
    s=s.replace(old,'',1)
# Correct quota reservation for actual ready batch incl. videos.list verification.
old="const operationId=`publish:${channelId}:${Date.now()}`,plan=planYoutubeQuota([{method:'videos.insert',count:batch.length,label:'Загрузка видео'},{method:'thumbnails.set',count:thumbnailsEnabled?batch.filter(j=>Boolean(selectedThumbnail(j))).length:0,label:'Обложки'}]);"
new="const operationId=`publish:${channelId}:${Date.now()}`,plan=planYoutubeQuota([{method:'videos.insert',count:batch.length,label:'Загрузка видео'},{method:'videos.list',count:batch.length,label:'Проверка загрузки'},{method:'thumbnails.set',count:thumbnailsEnabled?batch.filter(j=>Boolean(selectedThumbnail(j))).length:0,label:'Обложки'}]);log(`[PREFLIGHT] input=${selected.length} ready=${batch.length} blocked=${blockedItems.length}`);"
if old not in s: raise SystemExit('Publisher operation plan anchor missing')
s=s.replace(old,new,1)
# Log schedule before upload.
old="const payload=resolvedUploadMetadata(j,row,publishAt,settings.youtubeCategoryId);"
new="const payload=resolvedUploadMetadata(j,row,publishAt,settings.youtubeCategoryId);log(`[SCHEDULE] VIDEO_${String(j.number).padStart(3,'0')} mode=${draft.scheduleMode} publishAt=${payload.publishAt||'missing'}`);"
if old not in s: raise SystemExit('Publisher payload anchor missing')
s=s.replace(old,new,1)
# Immediately persist ID, then gate SUCCESS on videos.list verification.
old="if(!uploaded.videoId)throw new Error('YouTube не вернул video ID');completePublishAttempt(attempt.id,uploaded.videoId);updateChannel(channelId,{lastUploadAt:new Date().toISOString(),knownUploadLimitState:'ok',lastDailyLimitError:undefined});let thumbError=''"
new="""if(!uploaded.videoId)throw new Error('UPLOAD_NEEDS_VERIFICATION: YouTube не вернул video ID');completePublishAttempt(attempt.id,uploaded.videoId);patchJob(j.id,{youtubeVideoId:uploaded.videoId,uploadProgress:100});log(`[YOUTUBE] videos.insert returned videoId=${uploaded.videoId} verified=${uploaded.verified!==false}`);if(uploaded.verified===false){const reason=uploaded.verificationError||'YouTube videoId получен, но videos.list verification не подтверждена';patchJob(j.id,{status:'ERROR',youtubeVideoId:uploaded.videoId,error:reason,uploadProgress:100,uploadedAt:new Date().toISOString()});appendErrorHistory('Загрузка требует проверки',`VIDEO_${String(j.number).padStart(3,'0')}: ${reason}`,reason,{errorCode:'UPLOAD_VERIFY_FAILED',videoId:uploaded.videoId,filePath:j.finalPath,stage:'verification'});batchFailures.push({id:j.id,message:`VIDEO_${String(j.number).padStart(3,'0')}: ${reason}`,technicalDetail:reason});continue}updateChannel(channelId,{lastUploadAt:new Date().toISOString(),knownUploadLimitState:'ok',lastDailyLimitError:undefined});let thumbError=''"""
if old not in s: raise SystemExit('Publisher upload result anchor missing')
s=s.replace(old,new,1)
# Structured upload errors.
old="appendErrorHistory(h.title,message,h.detail);batchFailures.push({id:j.id,message,technicalDetail:h.detail})"
new="appendErrorHistory(h.title,message,h.detail,{errorCode:h.code,videoId:j.id,filePath:j.finalPath,stage:'upload-transfer'});batchFailures.push({id:j.id,message,technicalDetail:h.detail})"
if old not in s: raise SystemExit('Publisher upload error anchor missing')
s=s.replace(old,new,1)
# Resume: persist returned ID and do not claim success if verification is false.
old="if(!uploaded.videoId)throw new Error('UPLOAD_NEEDS_VERIFICATION: YouTube не вернул video ID');completeStartedPublishAttempt(j.id,uploaded.videoId);let thumbError=''"
new="if(!uploaded.videoId)throw new Error('UPLOAD_NEEDS_VERIFICATION: YouTube не вернул video ID');completeStartedPublishAttempt(j.id,uploaded.videoId);patchJob(j.id,{youtubeVideoId:uploaded.videoId,uploadProgress:100});if(uploaded.verified===false){const reason=uploaded.verificationError||'videos.list verification не подтверждена';patchJob(j.id,{status:'ERROR',youtubeVideoId:uploaded.videoId,error:reason,uploadInterruptedAt:undefined});appendErrorHistory('Загрузка требует проверки',`VIDEO_${String(j.number).padStart(3,'0')}: ${reason}`,reason,{errorCode:'UPLOAD_VERIFY_FAILED',videoId:uploaded.videoId,filePath:j.finalPath,stage:'verification'});return}let thumbError=''"
if old not in s: raise SystemExit('Publisher resume verification anchor missing')
s=s.replace(old,new,1)
# Truthful counters and global blocking only when there is no valid item.
old="const missingMetadata=selected.filter(j=>!j.title.trim()).length,missingSchedule=selected.filter(j=>!effectivePublishAt(j)).length,pastSchedule=selected.some(j=>Boolean(effectivePublishAt(j))&&!isFuturePublishAt(effectivePublishAt(j))),scheduleSyncBlocked=draft.scheduleMode!=='file'&&scheduleSync.state!=='ready',locked=isChannelUploadLocked(channelId),preflightBlocked=!selected.length||!profileId||!quotaPlan.affordable||missingSchedule>0||pastSchedule||scheduleSyncBlocked||(settings.youtubePublishSafeMode&&(missingMetadata>0||duplicates.length>0||locked))||(draft.thumbs.length>0&&missingThumbs>0&&!draft.allowMissingThumbs)||(daily.remaining!=null&&daily.remaining<=0)||recovery.some(x=>draft.selectedIds.includes(x.jobId));"
new="const missingMetadata=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_TITLE')).length,missingSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='MISSING_SCHEDULE')).length,pastSchedule=preflight.items.filter(x=>x.issues.some(i=>i.code==='PAST_SCHEDULE')).length,scheduleSyncBlocked=draft.scheduleMode!=='file'&&scheduleSync.state!=='ready',locked=isChannelUploadLocked(channelId),preflightBlocked=!selected.length||!profileId||!uploadableSelected.length||!quotaPlan.affordable||scheduleSyncBlocked||locked||(daily.remaining!=null&&daily.remaining<=0);"
if old not in s: raise SystemExit('Publisher final preflight anchor missing')
s=s.replace(old,new,1)
# Add blocked count to UI and truthful request plan/button.
s=s.replace("<span><small>Без schedule</small><b>{missingSchedule}</b></span><span><small>Duplicate</small><b>{duplicates.length}</b></span>","<span><small>Без schedule</small><b>{missingSchedule}</b></span><span><small>Дата в прошлом</small><b>{pastSchedule}</b></span><span><small>Blocked</small><b>{blockedItems.length}</b></span><span><small>Duplicate</small><b>{duplicates.length}</b></span>",1)
old="<details><summary>Показать request plan</summary>{quotaPlan.operations.map((x,i)=><p key={i}>{x.count} × {x.method} = {x.cost} ({x.bucket})</p>)}</details>"
new="<details><summary>Показать request plan</summary>{quotaPlan.operations.map((x,i)=><p key={i}>{x.count} × {x.method} = {x.cost} ({x.bucket})</p>)}{blockedItems.map(x=><p key={`blocked:${x.id}`}>VIDEO_{String(x.number).padStart(3,'0')} — BLOCKED: {x.issues.map(i=>i.message).join(' • ')}</p>)}</details>"
if old not in s: raise SystemExit('Publisher request plan anchor missing')
s=s.replace(old,new,1)
old="<button className=\"primary\" disabled={busy||preflightBlocked} onClick={()=>runBatch()}>ЗАГРУЗИТЬ {selected.length} ВИДЕО НА YOUTUBE</button>"
new="<button className=\"primary\" disabled={busy||preflightBlocked} onClick={()=>runBatch()}>{publisherUploadButtonLabel(selected.length,uploadableSelected.length)}</button>"
if old not in s: raise SystemExit('Publisher upload button anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# -----------------------------------------------------------------------------
# Frontend upload result: backend verification is explicit.
# -----------------------------------------------------------------------------
p=root/'src/api.ts';s=p.read_text()
s=s.replace("export type YoutubeUploadResult={videoId?:string;channelId?:string;channelTitle?:string;scheduled:boolean;resumed?:boolean};","export type YoutubeUploadResult={videoId?:string;channelId?:string;channelTitle?:string;scheduled:boolean;resumed?:boolean;verified?:boolean;verificationError?:string;actual?:{id?:string;channelId?:string;privacyStatus?:string;publishAt?:string|null}};")
p.write_text(s)

# -----------------------------------------------------------------------------
# Rust uploader: correct MIME, backend schedule safety, real videos.list verify.
# -----------------------------------------------------------------------------
p=root/'src-tauri/src/youtube.rs';s=p.read_text()
s=s.replace('use chrono::Utc;','use chrono::{DateTime,SecondsFormat,Utc};')
anchor='const YOUTUBE_UPLOAD_CHUNK_BYTES:usize=32*1024*1024;'
if anchor not in s: raise SystemExit('youtube chunk anchor missing')
helpers=r'''fn video_mime_for_path(path:&Path)->&'static str{match path.extension().and_then(|x|x.to_str()).unwrap_or("").to_ascii_lowercase().as_str(){"mp4"=>"video/mp4","mov"=>"video/quicktime","m4v"=>"video/x-m4v","webm"=>"video/webm","mkv"=>"video/x-matroska","avi"=>"video/x-msvideo",_=>"application/octet-stream"}}
fn validate_publish_at_at(raw:&str,now:DateTime<Utc>)->Result<String,String>{let parsed=DateTime::parse_from_rfc3339(raw).map_err(|_|format!("SCHEDULE_INVALID: publishAt не RFC3339: {raw}"))?.with_timezone(&Utc);if parsed<=now+chrono::Duration::seconds(30){return Err(format!("SCHEDULE_IN_PAST: publishAt {} должен быть позже текущего безопасного времени YouTube",parsed.to_rfc3339()))}Ok(parsed.to_rfc3339_opts(SecondsFormat::Secs,true))}
async fn verify_uploaded_video(app:&AppHandle,client:&reqwest::Client,token:&str,video_id:&str,expected_channel_id:&str,operation_id:Option<&str>)->Result<Value,String>{emit_youtube_api_request(app,"videos.list",operation_id);let r=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(token).query(&[("part","id,snippet,status"),("id",video_id)]).send().await.map_err(|e|format!("UPLOAD_VERIFY_NETWORK: videos.list: {e}"))?;let st=r.status();let v:Value=r.json().await.map_err(|e|format!("UPLOAD_VERIFY_PARSE: {e}"))?;if !st.is_success(){return Err(format!("UPLOAD_VERIFY_API {st}: {}",youtube_error(&v,"videos.list verification failed")))}let item=v.pointer("/items/0").ok_or_else(||format!("UPLOAD_VERIFY_MISSING: YouTube не нашёл videoId {video_id} после upload"))?;let actual_id=item.get("id").and_then(|x|x.as_str()).unwrap_or("");if actual_id!=video_id{return Err(format!("UPLOAD_VERIFY_ID_MISMATCH: ожидался {video_id}, получен {actual_id}"))}let actual_channel=item.pointer("/snippet/channelId").and_then(|x|x.as_str()).unwrap_or("");if !expected_channel_id.is_empty()&&!actual_channel.is_empty()&&actual_channel!=expected_channel_id{return Err(format!("UPLOAD_VERIFY_CHANNEL_MISMATCH: videoId {video_id} принадлежит другому каналу"))}Ok(json!({"id":actual_id,"channelId":actual_channel,"privacyStatus":item.pointer("/status/privacyStatus").and_then(|x|x.as_str()),"publishAt":item.pointer("/status/publishAt").and_then(|x|x.as_str())}))}
'''
s=s.replace(anchor,helpers+anchor,1)
# MIME for every resumed chunk.
old='let client=reqwest::Client::new();let (mut offset,already)='
new='let client=reqwest::Client::new();let mime=video_mime_for_path(&path);let (mut offset,already)='
if old not in s: raise SystemExit('youtube continue client anchor missing')
s=s.replace(old,new,1)
s=s.replace('.header("Content-Type","video/mp4").header("Content-Length",wanted.to_string())','.header("Content-Type",mime).header("Content-Length",wanted.to_string())',1)
# Validate publishAt and correct initial MIME.
old='let (token,profile)=valid_access_token(&app,&profile_id).await?;let category=if category_id.trim().is_empty(){"10"}else{category_id.trim()};let mut status=json!({"privacyStatus":"private"});if let Some(p)=publish_at.as_ref().filter(|x|!x.trim().is_empty()){status["publishAt"]=json!(p)}let body='
new='let mime=video_mime_for_path(&path);let publish_at=match publish_at.as_ref().filter(|x|!x.trim().is_empty()){Some(p)=>Some(validate_publish_at_at(p,Utc::now())?),None=>None};let (token,profile)=valid_access_token(&app,&profile_id).await?;let category=if category_id.trim().is_empty(){"10"}else{category_id.trim()};let mut status=json!({"privacyStatus":"private"});if let Some(p)=publish_at.as_ref(){status["publishAt"]=json!(p)}let body='
if old not in s: raise SystemExit('youtube upload schedule anchor missing')
s=s.replace(old,new,1)
s=s.replace('.header("X-Upload-Content-Type","video/mp4").json(&body)','.header("X-Upload-Content-Type",mime).json(&body)',1)
# Better init error extraction.
old='if !init_status.is_success(){let t=init.text().await.unwrap_or_default();return Err(format!("YouTube upload init {init_status}: {}",t.chars().take(500).collect::<String>()))}'
new='if !init_status.is_success(){let t=init.text().await.unwrap_or_default();if let Ok(v)=serde_json::from_str::<Value>(&t){return Err(format!("YOUTUBE_UPLOAD_INIT {init_status}: {}",youtube_error(&v,"YouTube отклонил videos.insert")))}return Err(format!("YOUTUBE_UPLOAD_INIT {init_status}: {}",t.chars().take(500).collect::<String>()))}'
if old not in s: raise SystemExit('youtube init error anchor missing')
s=s.replace(old,new,1)
# Verify initial upload. Never discard a real videoId merely because verification failed.
old='let final_json=continue_persisted_upload(&app,&session,&token,false).await?;let video_id=final_json.get("id").and_then(|x|x.as_str()).unwrap_or("").to_string();Ok(json!({"videoId":video_id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"scheduled":publish_at.is_some(),"resumed":false}))'
new='let final_json=continue_persisted_upload(&app,&session,&token,false).await?;let video_id=final_json.get("id").and_then(|x|x.as_str()).unwrap_or("").to_string();if video_id.is_empty(){return Err("UPLOAD_NEEDS_VERIFICATION: YouTube upload завершён, но video ID не получен".into())}let verification=verify_uploaded_video(&app,&client,&token,&video_id,&profile.channel_id,operation_id.as_deref()).await;let(verified,verification_error,actual)=match verification{Ok(v)=>(true,None,Some(v)),Err(e)=>(false,Some(e),None)};Ok(json!({"videoId":video_id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"scheduled":publish_at.is_some(),"resumed":false,"verified":verified,"verificationError":verification_error,"actual":actual}))'
if old not in s: raise SystemExit('youtube upload return anchor missing')
s=s.replace(old,new,1)
# Verify resume too.
old='pub async fn youtube_resume_upload(app:AppHandle,job_id:String)->Result<Value,String>{let session=get_upload_session(&app,&job_id)?;let (token,profile)=valid_access_token(&app,&session.profile_id).await?;let final_json=continue_persisted_upload(&app,&session,&token,true).await?;let video_id=final_json.get("id").and_then(|x|x.as_str()).unwrap_or("").to_string();if video_id.is_empty(){return Err("UPLOAD_NEEDS_VERIFICATION: YouTube завершил resumable session, но video ID не получен".into())}Ok(json!({"videoId":video_id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"scheduled":true,"resumed":true}))}'
new='pub async fn youtube_resume_upload(app:AppHandle,job_id:String)->Result<Value,String>{let session=get_upload_session(&app,&job_id)?;let (token,profile)=valid_access_token(&app,&session.profile_id).await?;let final_json=continue_persisted_upload(&app,&session,&token,true).await?;let video_id=final_json.get("id").and_then(|x|x.as_str()).unwrap_or("").to_string();if video_id.is_empty(){return Err("UPLOAD_NEEDS_VERIFICATION: YouTube завершил resumable session, но video ID не получен".into())}let client=reqwest::Client::new();let verification=verify_uploaded_video(&app,&client,&token,&video_id,&profile.channel_id,session.operation_id.as_deref()).await;let(verified,verification_error,actual)=match verification{Ok(v)=>(true,None,Some(v)),Err(e)=>(false,Some(e),None)};Ok(json!({"videoId":video_id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"scheduled":true,"resumed":true,"verified":verified,"verificationError":verification_error,"actual":actual}))}'
if old not in s: raise SystemExit('youtube resume return anchor missing')
s=s.replace(old,new,1)
# Rust regression tests.
s += r'''

#[cfg(test)]
mod v2111_runtime_upload_tests{
 use super::*;
 #[test]fn mov_uses_quicktime_mime(){assert_eq!(video_mime_for_path(Path::new("/tmp/a.mov")),"video/quicktime")}
 #[test]fn mp4_uses_mp4_mime(){assert_eq!(video_mime_for_path(Path::new("/tmp/a.mp4")),"video/mp4")}
 #[test]fn m4v_has_video_mime(){assert_eq!(video_mime_for_path(Path::new("/tmp/a.m4v")),"video/x-m4v")}
 #[test]fn malformed_publish_at_rejected(){assert!(validate_publish_at_at("10.09.2026",Utc::now()).unwrap_err().contains("SCHEDULE_INVALID"))}
 #[test]fn past_publish_at_rejected(){let now=Utc::now();let old=(now-chrono::Duration::minutes(2)).to_rfc3339();assert!(validate_publish_at_at(&old,now).unwrap_err().contains("SCHEDULE_IN_PAST"))}
 #[test]fn future_publish_at_normalized(){let now=Utc::now();let future=(now+chrono::Duration::hours(2)).to_rfc3339();let got=validate_publish_at_at(&future,now).unwrap();assert!(DateTime::parse_from_rfc3339(&got).is_ok())}
}
'''
p.write_text(s)

# -----------------------------------------------------------------------------
# Frontend regressions: exact screenshot bug + schedule + partial batch + errors.
# -----------------------------------------------------------------------------
write('src/v2111PublisherRuntime.test.ts',r'''import {describe,it,expect} from 'vitest';
import {canonicalSelectedJobs,publisherPreflightItems,publisherUploadButtonLabel} from './publisherRuntime';
import {metadataPublishAt} from './publisherMetadata';
import {humanizeError} from './errorCenter';
import type {VideoJob} from './types';
const job=(n:number,p:Partial<VideoJob>={}):VideoJob=>({id:`j${n}`,channelId:'c',number:n,folder:'/tmp',status:'READY_UPLOAD',createdAt:'2026-01-01T00:00:00Z',tracksCount:1,minTracks:1,finalPath:`/tmp/${n}.mov`,title:`Title ${n}`,description:'d',tags:['x'],...p});
const future='2030-09-20T11:00:00.000Z';
describe('VYRON 2.1.1 publisher runtime repair',()=>{
 it('visible 10 selected 10 canonical batch 10',()=>{const jobs=Array.from({length:10},(_,i)=>job(i+1));expect(canonicalSelectedJobs(jobs,jobs.map(x=>x.id))).toHaveLength(10)});
 it('stale selected IDs are ignored',()=>expect(canonicalSelectedJobs([job(1)],['gone'])).toHaveLength(0));
 it('selection is sorted by video number',()=>expect(canonicalSelectedJobs([job(3),job(1),job(2)],['j1','j2','j3']).map(x=>x.number)).toEqual([1,2,3]));
 it('zero selected button says choose videos',()=>expect(publisherUploadButtonLabel(0,0)).toBe('ВЫБЕРИТЕ ВИДЕО'));
 it('one selected button says upload 1',()=>expect(publisherUploadButtonLabel(1,1)).toContain('ЗАГРУЗИТЬ 1 ВИДЕО'));
 it('15 selected are represented honestly',()=>expect(publisherUploadButtonLabel(15,15)).toContain('ЗАГРУЗИТЬ 15 ВИДЕО'));
 it('valid future schedule passes',()=>expect(publisherPreflightItems([job(1)],{getPublishAt:()=>future,safeMode:true,nowMs:Date.parse('2026-09-10T10:00:00Z')}).ready).toHaveLength(1));
 it('missing schedule blocks only affected video',()=>{const r=publisherPreflightItems([job(1),job(2)],{getPublishAt:j=>j.id==='j1'?undefined:future,safeMode:true,nowMs:0});expect(r.blocked.map(x=>x.id)).toEqual(['j1']);expect(r.ready.map(x=>x.id)).toEqual(['j2'])});
 it('past schedule blocks only affected video',()=>{const r=publisherPreflightItems([job(1),job(2)],{getPublishAt:j=>j.id==='j1'?'2020-01-01T00:00:00Z':future,safeMode:true,nowMs:Date.parse('2026-01-01T00:00:00Z')});expect(r.blocked).toHaveLength(1);expect(r.ready).toHaveLength(1)});
 it('missing title blocks only affected video in safe mode',()=>{const r=publisherPreflightItems([job(1,{title:''}),job(2)],{getPublishAt:()=>future,safeMode:true,nowMs:0});expect(r.blocked[0].issues[0].code).toBe('MISSING_TITLE');expect(r.ready[0].id).toBe('j2')});
 it('duplicate blocks only duplicate video',()=>{const r=publisherPreflightItems([job(1),job(2)],{getPublishAt:()=>future,safeMode:true,duplicateIds:['j1'],nowMs:0});expect(r.blocked.map(x=>x.id)).toEqual(['j1']);expect(r.ready.map(x=>x.id)).toEqual(['j2'])});
 it('recovery session blocks new insert only for that video',()=>{const r=publisherPreflightItems([job(1),job(2)],{getPublishAt:()=>future,safeMode:true,recoveryIds:['j2'],nowMs:0});expect(r.ready.map(x=>x.id)).toEqual(['j1']);expect(r.blocked[0].issues[0].code).toBe('RECOVERY')});
 it('missing required thumbnail is per item',()=>{const r=publisherPreflightItems([job(1),job(2)],{getPublishAt:()=>future,safeMode:true,requireThumbnail:true,hasThumbnail:j=>j.id==='j2',nowMs:0});expect(r.blocked.map(x=>x.id)).toEqual(['j1']);expect(r.ready.map(x=>x.id)).toEqual(['j2'])});
 it('DATE + PUBLISH TIME defaults to Krasnoyarsk +07',()=>expect(metadataPublishAt({number:1,publishAt:'2026-09-20',publishTime:'18:00',source:'x'})).toBe('2026-09-20T11:00:00.000Z'));
 it('date-only without publish time is not a valid schedule',()=>expect(metadataPublishAt({number:1,publishAt:'2026-09-20',source:'x'})).toBeUndefined());
 it('Asia/Krasnoyarsk IANA timezone is honored',()=>expect(metadataPublishAt({number:1,publishAt:'2026-09-20',publishTime:'18:00',publishTimezone:'Asia/Krasnoyarsk',source:'x'})).toBe('2026-09-20T11:00:00.000Z'));
 it('YouTube upload init 400 exposes actual API message',()=>{const h=humanizeError('YOUTUBE_UPLOAD_INIT 400: Invalid value for: publishAt [invalidPublishAt]','upload');expect(h.title).toContain('YouTube');expect(h.message).toContain('Invalid value')});
 it('unknown upload errors are no longer generic state-saved text',()=>{const h=humanizeError('YOUTUBE_UPLOAD_INIT 500: backend exploded','upload');expect(h.message).toContain('backend exploded');expect(h.message).not.toContain('VYRON сохранил текущее состояние')});
});
''')
write('src/v2111PublisherWiring.test.ts',r'''import {describe,it,expect} from 'vitest';import fs from 'node:fs';
const pub=fs.readFileSync(new URL('./PublisherOS.tsx',import.meta.url),'utf8');const api=fs.readFileSync(new URL('./api.ts',import.meta.url),'utf8');
describe('2.1.1 real PublisherOS wiring',()=>{
 it('uses canonical selected jobs',()=>expect(pub).toContain('canonicalSelectedJobs(channelJobs,draft.selectedIds)'));
 it('button uses truthful label helper',()=>expect(pub).toContain('publisherUploadButtonLabel(selected.length,uploadableSelected.length)'));
 it('batch executes uploadable subset not all selected',()=>expect(pub).toContain('let batch=uploadableSelected.slice'));
 it('blocked items are persisted individually',()=>expect(pub).toContain("stage:'preflight'"));
 it('upload click instrumentation exists',()=>expect(pub).toContain('[UPLOAD] button clicked'));
 it('preflight instrumentation exists',()=>expect(pub).toContain('[PREFLIGHT] input='));
 it('schedule instrumentation exists',()=>expect(pub).toContain('[SCHEDULE] VIDEO_'));
 it('returned YouTube id is persisted before verification branch',()=>expect(pub.indexOf('patchJob(j.id,{youtubeVideoId:uploaded.videoId,uploadProgress:100})')).toBeLessThan(pub.indexOf('if(uploaded.verified===false)')));
 it('verification failure keeps videoId and ERROR',()=>expect(pub).toContain("status:'ERROR',youtubeVideoId:uploaded.videoId"));
 it('quota plan includes real videos.list verification',()=>expect(pub).toContain("method:'videos.list'"));
 it('frontend invokes existing youtube_upload_video command',()=>expect(api).toContain("ytInvoke<YoutubeUploadResult>('youtube_upload_video'"));
});
''')

print('VYRON 2.1.1 YouTube runtime repair patch applied')
