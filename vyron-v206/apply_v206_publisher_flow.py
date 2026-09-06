#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p): return (ROOT/p).read_text()
def w(p,s): (ROOT/p).write_text(s)
def rep(p,a,b,count=1):
    s=r(p)
    if a not in s: raise SystemExit(f'v206 publisher missing anchor {p}: {a[:180]!r}')
    w(p,s.replace(a,b,count))

# -----------------------------------------------------------------------------
# Persist Publisher schedule controls without changing legacy workspace identity.
# Old saved drafts migrate to "file" mode, preserving their existing publishAt.
# -----------------------------------------------------------------------------
p='src/publishWorkspaceState.ts';s=r(p)
s=s.replace("export type PublishWorkspaceDraft={channelId:string;selectedIds:string[];rows:ImportedMetadata[];docx:boolean;thumbs:string[];allowMissingThumbs:boolean;allowDuplicate:boolean;updatedAt:string};",
"export type PublishScheduleMode='file'|'daily'|'2/2'|'3/1';\nexport type PublishWorkspaceDraft={channelId:string;selectedIds:string[];rows:ImportedMetadata[];docx:boolean;thumbs:string[];allowMissingThumbs:boolean;allowDuplicate:boolean;scheduleMode:PublishScheduleMode;scheduleStartDate:string;scheduleTime:string;updatedAt:string};",1)
s=s.replace("const empty=(channelId:string):PublishWorkspaceDraft=>({channelId,selectedIds:[],rows:[],docx:false,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,updatedAt:new Date(0).toISOString()});",
"const empty=(channelId:string):PublishWorkspaceDraft=>({channelId,selectedIds:[],rows:[],docx:false,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,scheduleMode:'file',scheduleStartDate:'',scheduleTime:'',updatedAt:new Date(0).toISOString()});",1)
s=s.replace("allowDuplicate:Boolean(x.allowDuplicate),updatedAt:x.updatedAt||new Date(0).toISOString()",
"allowDuplicate:Boolean(x.allowDuplicate),scheduleMode:(['daily','2/2','3/1'].includes(String(x.scheduleMode))?String(x.scheduleMode):'file') as PublishScheduleMode,scheduleStartDate:String(x.scheduleStartDate||''),scheduleTime:String(x.scheduleTime||''),updatedAt:x.updatedAt||new Date(0).toISOString()",1)
w(p,s)

# -----------------------------------------------------------------------------
# Publisher scheduling uses the exact calendar/pattern semantics already used by
# Metadata: Asia/Krasnoyarsk (+07:00), anchor day starts the publish part of cycle.
# -----------------------------------------------------------------------------
w('src/publisherSchedule.ts',r'''import {addCalendarDays,isPatternPublishDate} from './channelSchedule';
import type {PublishScheduleMode} from './publishWorkspaceState';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function todayKrasnoyarskDate(now=new Date()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=(t:string)=>p.find(x=>x.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`
}
export function publisherKrasnoyarskIso(date:string,time:string){if(!DATE.test(date)||!TIME.test(time))return'';const d=new Date(`${date}T${time}:00+07:00`);return Number.isFinite(d.getTime())?d.toISOString():''}
export function publisherScheduleDates(mode:PublishScheduleMode,startDate:string,time:string,count:number){
 const wanted=Math.max(0,Math.floor(count||0));if(mode==='file'||!wanted||!DATE.test(startDate)||!TIME.test(time))return[] as string[];
 const out:string[]=[];let key=startDate,guard=0;
 if(mode==='daily'){while(out.length<wanted&&guard++<20000){const iso=publisherKrasnoyarskIso(key,time);if(iso)out.push(iso);key=addCalendarDays(key,1)}return out}
 const pattern=mode==='2/2'?{publishDays:2,pauseDays:2,anchorDate:startDate}:{publishDays:3,pauseDays:1,anchorDate:startDate};
 while(out.length<wanted&&guard++<50000){if(isPatternPublishDate(key,pattern)){const iso=publisherKrasnoyarskIso(key,time);if(iso)out.push(iso)}key=addCalendarDays(key,1)}return out
}
export function publisherSchedulePreview(mode:PublishScheduleMode,startDate:string,time:string,count:number){const dates=publisherScheduleDates(mode,startDate,time,count);return{count:dates.length,first:dates[0],last:dates[dates.length-1],dates}}
''')

w('src/publisherSchedule.test.ts',r'''import {describe,expect,it} from 'vitest';
import {publisherKrasnoyarskIso,publisherScheduleDates,publisherSchedulePreview} from './publisherSchedule';

describe('publisher schedule uses Metadata calendar semantics',()=>{
 it('keeps file mode untouched',()=>{expect(publisherScheduleDates('file','2026-09-10','18:00',5)).toEqual([])});
 it('converts Krasnoyarsk wall time to ISO',()=>{expect(publisherKrasnoyarskIso('2026-09-10','18:00')).toBe('2026-09-10T11:00:00.000Z')});
 it('creates every-day schedule',()=>{expect(publisherScheduleDates('daily','2026-09-10','18:00',4)).toEqual(['2026-09-10T11:00:00.000Z','2026-09-11T11:00:00.000Z','2026-09-12T11:00:00.000Z','2026-09-13T11:00:00.000Z'])});
 it('creates 2/2 publish-pause cycle',()=>{expect(publisherScheduleDates('2/2','2026-09-10','18:00',6)).toEqual(['2026-09-10T11:00:00.000Z','2026-09-11T11:00:00.000Z','2026-09-14T11:00:00.000Z','2026-09-15T11:00:00.000Z','2026-09-18T11:00:00.000Z','2026-09-19T11:00:00.000Z'])});
 it('creates 3/1 publish-pause cycle',()=>{const x=publisherSchedulePreview('3/1','2026-09-10','20:30',6);expect(x.dates).toEqual(['2026-09-10T13:30:00.000Z','2026-09-11T13:30:00.000Z','2026-09-12T13:30:00.000Z','2026-09-14T13:30:00.000Z','2026-09-15T13:30:00.000Z','2026-09-16T13:30:00.000Z']);expect(x.first).toBe(x.dates[0]);expect(x.last).toBe(x.dates[5])});
 it('rejects incomplete date/time instead of inventing a schedule',()=>{expect(publisherScheduleDates('daily','','18:00',3)).toEqual([]);expect(publisherScheduleDates('2/2','2026-09-10','',3)).toEqual([])});
});
''')

# -----------------------------------------------------------------------------
# PublisherOS: only the requested flow changes.
# -----------------------------------------------------------------------------
p='src/PublisherOS.tsx';s=r(p)
s=s.replace("import {isYoutubeQuotaError,planYoutubeQuota,releaseYoutubeQuotaReservation,reserveYoutubeQuota,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeOperationActualCost,youtubeQuotaClockSnapshot,youtubeQuotaUsage} from './youtubeQuota';",
"import {isYoutubeQuotaError,planYoutubeQuota,releaseYoutubeQuotaReservation,reserveYoutubeQuota,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeOperationActualCost,youtubeQuotaBucketUsage,youtubeQuotaClockSnapshot,youtubeQuotaUsage} from './youtubeQuota';",1)
s=s.replace("import {clearPublishWorkspace,loadActivePublishChannel,loadPublishWorkspace,saveActivePublishChannel,savePublishWorkspace,type PublishWorkspaceDraft} from './publishWorkspaceState';",
"import {clearPublishWorkspace,loadActivePublishChannel,loadPublishWorkspace,saveActivePublishChannel,savePublishWorkspace,type PublishScheduleMode,type PublishWorkspaceDraft} from './publishWorkspaceState';\nimport {publisherScheduleDates,publisherSchedulePreview,todayKrasnoyarskDate} from './publisherSchedule';",1)
s=s.replace("const status=(j:VideoJob)=>j.status==='READY_UPLOAD'?'ГОТОВО':", "const status=(j:VideoJob)=>j.status==='READY_UPLOAD'?'В ОЧЕРЕДИ':",1)
s=s.replace("const pct=(a:number,b:number)=>b?Math.min(100,Math.max(0,a/b*100)):0;",
"const pct=(a:number,b:number)=>b?Math.min(100,Math.max(0,a/b*100)):0;\nconst scheduleDateTimeLabel=(iso?:string)=>iso?new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Krasnoyarsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)):'—';",1)

old=""" const selected=channelJobs.filter(j=>draft.selectedIds.includes(j.id)).sort((a,b)=>a.number-b.number),thumbMap=useMemo(()=>mapThumbnailsToJobs(selected,draft.thumbs),[selected.map(j=>j.id).join('|'),draft.thumbs.join('|')]);
 const thumbCount=selected.filter(j=>Boolean(thumbMap[j.id]||j.thumbnailPath)).length,missingThumbs=Math.max(0,selected.length-thumbCount),coverage=metadataCoverage(draft.rows,selected.length),daily=safeDailyStatus(channelId,channel?.safeDailyUploadLimit),duplicates=selected.filter(j=>fingerprints[j.id]&&findSuccessfulUpload(channelId,fingerprints[j.id].fingerprint));
 const quotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.insert',count:selected.length,label:'Загрузка видео'},{method:'thumbnails.set',count:thumbCount,label:'Обложки'}]),[selected.length,thumbCount,quotaRev]),quota=youtubeQuotaUsage(),recovery=sessions.filter(x=>channelJobs.some(j=>j.id===x.jobId));"""
new=""" const selected=channelJobs.filter(j=>draft.selectedIds.includes(j.id)).sort((a,b)=>a.number-b.number),thumbMap=useMemo(()=>mapThumbnailsToJobs(selected,draft.thumbs),[selected.map(j=>j.id).join('|'),draft.thumbs.join('|')]);
 const thumbnailsEnabled=draft.thumbs.length>0,selectedThumbnail=(j:VideoJob)=>thumbnailsEnabled?(thumbMap[j.id]||j.thumbnailPath||''):'';
 const thumbCount=thumbnailsEnabled?selected.filter(j=>Boolean(selectedThumbnail(j))).length:0,missingThumbs=thumbnailsEnabled?Math.max(0,selected.length-thumbCount):0,coverage=metadataCoverage(draft.rows,selected.length),daily=safeDailyStatus(channelId,channel?.safeDailyUploadLimit),duplicates=selected.filter(j=>fingerprints[j.id]&&findSuccessfulUpload(channelId,fingerprints[j.id].fingerprint));
 const channelDefaultTime=`${String(channel?.publishHour??18).padStart(2,'0')}:${String(channel?.publishMinute??0).padStart(2,'0')}`,scheduleStart=draft.scheduleStartDate||todayKrasnoyarskDate(),scheduleTime=draft.scheduleTime||channelDefaultTime;
 const scheduleDates=useMemo(()=>publisherScheduleDates(draft.scheduleMode,scheduleStart,scheduleTime,selected.length),[draft.scheduleMode,scheduleStart,scheduleTime,selected.length]),schedulePreview=useMemo(()=>publisherSchedulePreview(draft.scheduleMode,scheduleStart,scheduleTime,selected.length),[draft.scheduleMode,scheduleStart,scheduleTime,selected.length]);
 const effectivePublishAt=(j:VideoJob)=>draft.scheduleMode==='file'?j.publishAt:scheduleDates[selected.findIndex(x=>x.id===j.id)];
 const quotaPlan=useMemo(()=>planYoutubeQuota([{method:'videos.insert',count:selected.length,label:'Загрузка видео'},{method:'thumbnails.set',count:thumbCount,label:'Обложки'}]),[selected.length,thumbCount,quotaRev]),quota=youtubeQuotaUsage(),uploadUsage=youtubeQuotaBucketUsage('videoUploads'),recovery=sessions.filter(x=>channelJobs.some(j=>j.id===x.jobId));"""
if old not in s: raise SystemExit('v206 publisher derived-state anchor missing')
s=s.replace(old,new,1)

old_read=""" async function readDoc(fl:FileList|null){if(!fl?.length)return;const out:ImportedMetadata[]=[];let strict=false;for(const f of Array.from(fl)){const isDocx=f.name.toLowerCase().endsWith('.docx');strict=strict||isDocx;const text=isDocx?(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value:await f.text();out.push(...parseMetadataFile(f.name,text))}out.sort((a,b)=>(a.number??Number.MAX_SAFE_INTEGER)-(b.number??Number.MAX_SAFE_INTEGER));setDraftPatch({rows:out,docx:strict});const c=metadataCoverage(out,selected.length);if(selected.length&&!c.ok)notifyWarning('Недостаточно метаданных',`Word: ${out.length} • выбрано видео: ${selected.length} • не хватает: ${c.missing}`);else notifySuccess('Word-файл сохранён в рабочем пространстве',selected.length?`${out.length} записей • будет применено ${selected.length}${c.surplus?` • лишних ${c.surplus}`:''}`:`Распознано ${out.length}. Черновик переживёт переходы и перезапуск.`)}
 function applyLocalMetadata(){if(!selected.length)return;if(draft.rows.length<selected.length){notifyWarning('Недостаточно метаданных',`Word: ${draft.rows.length} • видео: ${selected.length}`);return}selected.forEach((j,i)=>{const x=draft.rows[i];const p:Partial<VideoJob>={metadataSource:'import',metadataLocked:true};if(x.title)p.title=x.title;if(x.description)p.description=x.description;if(x.tags?.length)p.tags=x.tags;const nextTime=x.publishAt||mergePublishTime(j.publishAt,x.publishTime);if(nextTime)p.publishAt=nextTime;patchJob(j.id,p);if(j.folder)void api.writeJobMetadata(j.folder,p.title||j.title,p.description||j.description,p.tags||j.tags,p.publishAt||j.publishAt,'import')});notifySuccess('Метаданные подготовлены',`${selected.length} видео обновлены локально. YouTube API: 0.`)}"""
new_read=""" async function readDoc(fl:FileList|null){if(!fl?.length)return;const out:ImportedMetadata[]=[];let strict=false;for(const f of Array.from(fl)){const isDocx=f.name.toLowerCase().endsWith('.docx');strict=strict||isDocx;const text=isDocx?(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value:await f.text();out.push(...parseMetadataFile(f.name,text))}out.sort((a,b)=>(a.number??Number.MAX_SAFE_INTEGER)-(b.number??Number.MAX_SAFE_INTEGER));setDraftPatch({rows:out,docx:strict});const c=metadataCoverage(out,selected.length);if(selected.length&&!c.ok)notifyWarning('Недостаточно метаданных',`Word: ${out.length} • выбрано видео: ${selected.length} • не хватает: ${c.missing}`);else{if(selected.length)applyLocalPreparation(out,selected,true);notifySuccess('Word-файл сохранён и применён локально',selected.length?`${out.length} записей • автоматически применено ${selected.length}${c.surplus?` • лишних ${c.surplus}`:''} • YouTube API: 0`:`Распознано ${out.length}. После выбора видео метаданные применятся автоматически.`)}}
 function applyLocalPreparation(rows:ImportedMetadata[],targets:VideoJob[],silent=false){if(!targets.length)return;const haveRows=rows.length>=targets.length;if(rows.length&&!haveRows){if(!silent)notifyWarning('Недостаточно метаданных',`Word: ${rows.length} • видео: ${targets.length}`);return}const generated=publisherScheduleDates(draft.scheduleMode,scheduleStart,scheduleTime,targets.length);targets.forEach((j,i)=>{const x=haveRows?rows[i]:undefined;const p:Partial<VideoJob>={};if(x){p.metadataSource='import';p.metadataLocked=true;if(x.title)p.title=x.title;if(x.description)p.description=x.description;if(x.tags?.length)p.tags=x.tags}const nextTime=draft.scheduleMode==='file'?(x?(x.publishAt||mergePublishTime(j.publishAt,x.publishTime)):j.publishAt):generated[i];if(nextTime)p.publishAt=nextTime;if(Object.keys(p).length){patchJob(j.id,p);if(j.folder)void api.writeJobMetadata(j.folder,p.title||j.title,p.description||j.description,p.tags||j.tags,p.publishAt||j.publishAt,x?'import':j.metadataSource)}});if(!silent)notifySuccess('Метаданные подготовлены',`${targets.length} видео обновлены локально. YouTube API: 0.`)}
 useEffect(()=>{if(!selected.length)return;if((draft.rows.length>=selected.length&&draft.rows.length>0)||draft.scheduleMode!=='file')applyLocalPreparation(draft.rows,selected,true)},[selected.map(j=>j.id).join('|'),JSON.stringify(draft.rows),draft.scheduleMode,scheduleStart,scheduleTime]);"""
if old_read not in s: raise SystemExit('v206 publisher DOCX anchor missing')
s=s.replace(old_read,new_read,1)

# Resume must never upload a thumbnail while the workspace is explicitly in
# "do not change YouTube thumbnails" mode.
s=s.replace("const thumb=j.thumbnailPath||thumbMap[j.id];if(thumb){", "const thumb=selectedThumbnail(j);if(thumb){",1)

# Use effective generated schedule directly in the upload call so a click cannot
# race React's local persistence effect. Thumbnail requests are opt-in only.
s=s.replace("if(settings.youtubePublishSafeMode&&batch.some(j=>!j.title.trim()||!j.publishAt))",
"if(settings.youtubePublishSafeMode&&batch.some(j=>!j.title.trim()||!effectivePublishAt(j)))",1)
s=s.replace("{method:'thumbnails.set',count:batch.filter(j=>Boolean(thumbMap[j.id]||j.thumbnailPath)).length,label:'Обложки'}",
"{method:'thumbnails.set',count:thumbnailsEnabled?batch.filter(j=>Boolean(selectedThumbnail(j))).length:0,label:'Обложки'}",1)
s=s.replace("const uploaded=await api.youtubeUpload(profileId,j.id,j.finalPath,j.title,j.description,j.tags,j.publishAt,settings.youtubeCategoryId,operationId);",
"const publishAt=effectivePublishAt(j);if(publishAt&&publishAt!==j.publishAt)patchJob(j.id,{publishAt});const uploaded=await api.youtubeUpload(profileId,j.id,j.finalPath,j.title,j.description,j.tags,publishAt,settings.youtubeCategoryId,operationId);",1)
s=s.replace("let thumbError='',thumb=thumbMap[j.id]||j.thumbnailPath;if(thumb){", "let thumbError='',thumb=selectedThumbnail(j);if(thumb){",1)

# Preflight schedule check uses the effective schedule, not stale job state.
s=s.replace("const missingMetadata=selected.filter(j=>!j.title.trim()).length,missingSchedule=selected.filter(j=>!j.publishAt).length,locked=",
"const missingMetadata=selected.filter(j=>!j.title.trim()).length,missingSchedule=selected.filter(j=>!effectivePublishAt(j)).length,locked=",1)

old_ui="""   <section className=\"panel publishStep\"><div className=\"panelHead\"><div><small>02 • DOCX</small><h3>Метаданные</h3></div><span>{draft.rows.length}</span></div><input ref={docInput} type=\"file\" accept=\".docx,.txt,.json,.csv\" hidden onChange={e=>void readDoc(e.target.files)}/><button className=\"primary\" onClick={()=>docInput.current?.click()}>{draft.rows.length?'Заменить Word / SEO pack':'Загрузить Word / SEO pack'}</button><div className={`publishCheck ${coverage.ok?'good':selected.length?'warn':''}`}><b>{draft.rows.length} записей</b><span>{selected.length?coverage.ok?`Хватает для ${selected.length}; лишних ${coverage.surplus}`:`Не хватает ${coverage.missing}`:'Выберите видео'}</span></div><button disabled={!coverage.ok} onClick={applyLocalMetadata}>Применить локально</button><small>Разобранные данные уже сохранены — повторно выбирать DOCX после перехода между вкладками не нужно.</small></section>
   <section className=\"panel publishStep\"><div className=\"panelHead\"><div><small>03 • THUMBNAILS</small><h3>Обложки</h3></div><span>{thumbCount}/{selected.length}</span></div><button className=\"primary\" onClick={chooseThumbnails}>{draft.thumbs.length?'Заменить изображения':'Выбрать изображения'}</button><div className={`publishCheck ${missingThumbs?'warn':'good'}`}><b>{draft.thumbs.length} файлов</b><span>{missingThumbs?`Без новой обложки: ${missingThumbs}`:'Сопоставление готово'}</span></div>{missingThumbs>0&&draft.thumbs.length>0&&<label className=\"checkLine\"><input type=\"checkbox\" checked={draft.allowMissingThumbs} onChange={e=>setDraftPatch({allowMissingThumbs:e.target.checked})}/>Продолжить без обложки для {missingThumbs}</label>}<small>THUMBNAIL_001 → VIDEO_001; остальные — по естественному порядку.</small></section>
  </div>
  <section className={`panel quotaPreflightCard ${preflightBlocked?'blocked':'ready'}`}><div className=\"panelHead\"><div><small>04 • ZERO-API PRE-FLIGHT</small>"""
new_ui="""   <section className=\"panel publishStep\"><div className=\"panelHead\"><div><small>02 • DOCX</small><h3>Метаданные</h3></div><span>{draft.rows.length}</span></div><input ref={docInput} type=\"file\" accept=\".docx,.txt,.json,.csv\" hidden onChange={e=>void readDoc(e.target.files)}/><button className=\"primary\" onClick={()=>docInput.current?.click()}>{draft.rows.length?'Заменить Word / SEO pack':'Загрузить Word / SEO pack'}</button><div className={`publishCheck ${coverage.ok?'good':selected.length?'warn':''}`}><b>{draft.rows.length} записей</b><span>{selected.length?coverage.ok?`Автоматически применено к ${selected.length}; лишних ${coverage.surplus} • YouTube API: 0`:`Не хватает ${coverage.missing}`:'Выберите видео — сопоставление выполнится автоматически'}</span></div><small>VIDEO_001 → запись 001. Название, описание и теги применяются локально без отдельной кнопки и без YouTube API.</small></section>
   <section className=\"panel publishStep\"><div className=\"panelHead\"><div><small>03 • THUMBNAILS</small><h3>Обложки</h3></div><span>{thumbnailsEnabled?`${thumbCount}/${selected.length}`:'НЕ МЕНЯТЬ'}</span></div><button className=\"primary\" onClick={chooseThumbnails}>{draft.thumbs.length?'Заменить изображения':'Выбрать новые обложки'}</button>{thumbnailsEnabled&&<button onClick={()=>setDraftPatch({thumbs:[],allowMissingThumbs:false})}>Не менять обложки YouTube</button>}<div className={`publishCheck ${thumbnailsEnabled&&missingThumbs?'warn':'good'}`}><b>{thumbnailsEnabled?`${draft.thumbs.length} файлов`:'Обложки YouTube — не менять'}</b><span>{!thumbnailsEnabled?'thumbnails.set: 0 запросов':missingThumbs?`Без новой обложки: ${missingThumbs}`:'Сопоставление готово'}</span></div>{missingThumbs>0&&thumbnailsEnabled&&<label className=\"checkLine\"><input type=\"checkbox\" checked={draft.allowMissingThumbs} onChange={e=>setDraftPatch({allowMissingThumbs:e.target.checked})}/>Продолжить без обложки для {missingThumbs}</label>}<small>{thumbnailsEnabled?'THUMBNAIL_001 → VIDEO_001; остальные — по естественному порядку.':'Существующие обложки на YouTube остаются как есть.'}</small></section>
   <section className=\"panel publishStep\"><div className=\"panelHead\"><div><small>04 • SCHEDULE</small><h3>Когда публиковать</h3></div><span>{draft.scheduleMode==='file'?'ИЗ ФАЙЛА':draft.scheduleMode.toUpperCase()}</span></div><select value={draft.scheduleMode} onChange={e=>{const mode=e.target.value as PublishScheduleMode;setDraftPatch({scheduleMode:mode,...(mode!=='file'&&!draft.scheduleStartDate?{scheduleStartDate:scheduleStart}:{}),...(mode!=='file'&&!draft.scheduleTime?{scheduleTime:scheduleTime}:{})})}}><option value=\"file\">Из файла</option><option value=\"daily\">Каждый день</option><option value=\"2/2\">2/2</option><option value=\"3/1\">3/1</option></select>{draft.scheduleMode==='file'?<div className=\"publishCheck good\"><b>Дата и время из метаданных</b><span>publishAt берётся из Word / SEO pack</span></div>:<><label className=\"checkLine\">Начальная дата <input type=\"date\" value={scheduleStart} onChange={e=>setDraftPatch({scheduleStartDate:e.target.value})}/></label><label className=\"checkLine\">Время <input type=\"time\" value={scheduleTime} onChange={e=>setDraftPatch({scheduleTime:e.target.value})}/></label><div className={`publishCheck ${schedulePreview.count===selected.length?'good':'warn'}`}><b>{schedulePreview.count?`${scheduleDateTimeLabel(schedulePreview.first)} → ${scheduleDateTimeLabel(schedulePreview.last)}`:'Выберите видео'}</b><span>{draft.scheduleMode==='daily'?'Публикация каждый день':draft.scheduleMode==='2/2'?'2 дня публикации / 2 дня пауза':'3 дня публикации / 1 день пауза'} • Красноярск</span></div></>}<small>Расписание рассчитывается локально; при загрузке готовый publishAt уходит сразу в videos.insert.</small></section>
  </div>
  <section className={`panel quotaPreflightCard ${preflightBlocked?'blocked':'ready'}`}><div className=\"panelHead\"><div><small>05 • ZERO-API PRE-FLIGHT</small>"""
if old_ui not in s: raise SystemExit('v206 publisher UI anchor missing')
s=s.replace(old_ui,new_ui,1)

# Make actual per-request Video Upload consumption visible. This reads the local
# ledger and updates through the existing quota event after every videos.insert.
s=s.replace("<span><small>Video Uploads</small><b>{uploads.required} / доступно {uploads.available}</b></span>",
"<span><small>Video Uploads сегодня</small><b>{uploadUsage.used} / {uploadUsage.limit}</b></span><span><small>Эта партия</small><b>+{uploads.required} videos.insert</b></span><span><small>После партии</small><b>{Math.min(uploadUsage.limit,uploadUsage.used+uploads.required)} / {uploadUsage.limit}</b></span>",1)
s=s.replace("<p className=\"quotaFinePrint\">Черновик сохранён:",
"<p className=\"quotaFinePrint\">Video Uploads обновляется после каждого фактического videos.insert; дополнительных YouTube API запросов для счётчика нет.</p><p className=\"quotaFinePrint\">Черновик сохранён:",1)

w(p,s)
print('VYRON 2.0.6 publisher flow patch: PASS')
