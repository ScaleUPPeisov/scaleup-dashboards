from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def replace_once(text,old,new,label):
    if text.count(old)!=1:
        raise SystemExit(f'{label}: expected exactly one match, got {text.count(old)}')
    return text.replace(old,new,1)

# scheduleContinuation: allow historical publishedAt evidence without widening all schedule helpers.
p=ROOT/'src/scheduleContinuation.ts'
s=p.read_text()
s=replace_once(s,
"export function inferYoutubePublishClock(videos:YoutubeScheduleLike[],now=new Date()):YoutubePublishClockEvidence|undefined{\n const nowMs=now.getTime();\n const scheduled=videos.filter",
"export function inferYoutubePublishClock(videos:Array<YoutubeScheduleLike&{publishedAt?:string}>,now=new Date()):YoutubePublishClockEvidence|undefined{\n const nowMs=now.getTime();\n const scheduled=videos.filter",
'infer type')
p.write_text(s)

p=ROOT/'src/PublisherOS.tsx'
s=p.read_text()
s=replace_once(s,
"import {PUBLISHER_TIMEZONE,recommendScheduleContinuation,resolvePublisherBatchSchedule} from './scheduleContinuation';",
"import {PUBLISHER_TIMEZONE,futureScheduledPublishAts,inferYoutubePublishClock,recommendScheduleContinuation,resolvePublisherBatchSchedule} from './scheduleContinuation';",
'schedule imports')

start=s.index("type PublisherAdvancedPanel='folders'")
end=s.index('function PublisherOSAdvanced',start)
s=s[:start]+"export function PublisherOS({activityRef}:{activityRef?:React.MutableRefObject<boolean>}={}){\n return <PublisherOSAdvanced activityRef={activityRef}/>;\n}\n\n"+s[end:]
s=replace_once(s,
"function PublisherOSAdvanced({activityRef,initialPanel}:{activityRef?:React.MutableRefObject<boolean>;initialPanel:PublisherAdvancedPanel}){",
"function PublisherOSAdvanced({activityRef}:{activityRef?:React.MutableRefObject<boolean>}){",
'advanced signature')
s=replace_once(s,
" const [foldersOpen,setFoldersOpen]=useState(true),[recoveryOpen,setRecoveryOpen]=useState(true),[metadataOpen,setMetadataOpen]=useState(true),[thumbnailOpen,setThumbnailOpen]=useState(true),[scheduleOpen,setScheduleOpen]=useState(true),[cleanupOpen,setCleanupOpen]=useState(true);\n",
"",
'visibility states')
s=replace_once(s,
" const [scheduleSync,setScheduleSync]=useState<{state:'idle'|'loading'|'ready'|'error';lastScheduled?:string;suggestedStart?:string;note?:string;futureCount:number;occupied:string[];timezone:string}>({state:'idle',futureCount:0,occupied:[],timezone:PUBLISHER_TIMEZONE});",
" const [scheduleSync,setScheduleSync]=useState<{state:'idle'|'loading'|'ready'|'error';lastScheduled?:string;suggestedStart?:string;note?:string;futureCount:number;occupied:string[];timezone:string;youtubeTime?:string;youtubeEvidenceCount?:number;youtubeEvidenceSource?:'scheduled'|'published';youtubeEvidenceAt?:string;syncedAt?:string}>({state:'idle',futureCount:0,occupied:[],timezone:PUBLISHER_TIMEZONE});",
'schedule sync state')
s=replace_once(s,
" const liveSnapshot=useLiveInventory(st=>(foldersOpen||renderScanBusy||Boolean(renderScan))?st.snapshots[channelId]:undefined);",
" const liveSnapshot=useLiveInventory(st=>st.snapshots[channelId]);",
'live snapshot visibility')

old=""" const channelDefaultTime=`${String(channel?.publishHour??18).padStart(2,'0')}:${String(channel?.publishMinute??0).padStart(2,'0')}`,scheduleTime=draft.scheduleTime||channelDefaultTime,scheduleStart=scheduleStartMode==='continue'?(scheduleSync.suggestedStart||''):draft.scheduleStartDate;
 const fileTimeRows=batchActive?selected.map((j,i)=>metadataRowForJob(draft.rows,j,i)):[],useFileTime=batchActive&&draft.scheduleMode!=='file'&&draft.scheduleTimeSource==='file',schedulePlanningTime=useFileTime?(fileTimeRows.find(x=>x?.publishTime)?.publishTime||scheduleTime):scheduleTime;
 const filePublishAts=batchActive?selected.map((j,i)=>{const row=fileTimeRows[i];return metadataPublishAt(row,row?undefined:j.publishAt)}):[];
 const missingPublishTimeIds=useFileTime?new Set(selected.filter((_j,i)=>!fileTimeRows[i]?.publishTime).map(j=>j.id)):EMPTY_PATH_SET;
 const scheduleRowsKey=batchActive?JSON.stringify(draft.rows):'';const scheduleResolution=useMemo(()=>batchActive?resolvePublisherBatchSchedule({mode:draft.scheduleMode,startDate:scheduleStart,time:scheduleTime,count:selected.length,timeSource:useFileTime?'file':'common',fileTimeRows,filePublishAts,occupied:scheduleSync.state==='ready'?scheduleSync.occupied:[],fallbackIntervalDays:Math.max(1,channel?.publishIntervalDays||channel?.cadenceDays||1)}):EMPTY_BATCH_SCHEDULE,[batchActive,draft.scheduleMode,draft.scheduleTimeSource,scheduleStart,scheduleTime,selectedKey,scheduleRowsKey,scheduleSync.state,scheduleSync.occupied.join('|'),channel?.publishIntervalDays,channel?.cadenceDays]);"""
new=""" const channelDefaultTime=`${String(channel?.publishHour??18).padStart(2,'0')}:${String(channel?.publishMinute??0).padStart(2,'0')}`,scheduleTime=draft.scheduleTime||channelDefaultTime,scheduleStart=scheduleStartMode==='continue'?(scheduleSync.suggestedStart||''):draft.scheduleStartDate;
 const fileTimeRows=batchActive?selected.map((j,i)=>metadataRowForJob(draft.rows,j,i)):[],useFileTime=batchActive&&draft.scheduleTimeSource==='file',youtubeTime=draft.scheduleTimeSource==='youtube'?(scheduleSync.youtubeTime||''):'',effectiveScheduleTime=draft.scheduleTimeSource==='youtube'?youtubeTime:scheduleTime,schedulePlanningTime=useFileTime?(fileTimeRows.find(x=>x?.publishTime)?.publishTime||scheduleTime):effectiveScheduleTime;
 const filePublishAts=batchActive?selected.map((j,i)=>{const row=fileTimeRows[i];return metadataPublishAt(row,row?undefined:j.publishAt)}):[];
 const missingPublishTimeIds=useFileTime?new Set(selected.filter((_j,i)=>!fileTimeRows[i]?.publishTime).map(j=>j.id)):EMPTY_PATH_SET;
 const scheduleRowsKey=batchActive?JSON.stringify(draft.rows):'';const scheduleResolution=useMemo(()=>batchActive?resolvePublisherBatchSchedule({mode:draft.scheduleMode,startDate:scheduleStart,time:effectiveScheduleTime,count:selected.length,timeSource:draft.scheduleTimeSource,fileTimeRows,filePublishAts,occupied:scheduleSync.state==='ready'?scheduleSync.occupied:[],fallbackIntervalDays:Math.max(1,channel?.publishIntervalDays||channel?.cadenceDays||1)}):EMPTY_BATCH_SCHEDULE,[batchActive,draft.scheduleMode,draft.scheduleTimeSource,scheduleStart,effectiveScheduleTime,selectedKey,scheduleRowsKey,scheduleSync.state,scheduleSync.youtubeTime,scheduleSync.occupied.join('|'),channel?.publishIntervalDays,channel?.cadenceDays]);"""
s=replace_once(s,old,new,'schedule computation')
s=replace_once(s,
" const latestCleanupBatchId=cleanupOpen?latestChannelUploadBatchId(uploadHistory,channelId):undefined;\n const batchCleanupRows=useMemo(()=>cleanupOpen&&latestCleanupBatchId?confirmedCleanupCandidates(uploadHistory,channelScopedJobs,channelId,latestCleanupBatchId):[],[cleanupOpen,uploadHistory,channelScopedJobs,channelId,latestCleanupBatchId]);\n const channelCleanupRows=useMemo(()=>cleanupOpen?confirmedCleanupCandidates(uploadHistory,channelScopedJobs,channelId):[],[cleanupOpen,uploadHistory,channelScopedJobs,channelId]);",
" const latestCleanupBatchId=latestChannelUploadBatchId(uploadHistory,channelId);\n const batchCleanupRows=useMemo(()=>latestCleanupBatchId?confirmedCleanupCandidates(uploadHistory,channelScopedJobs,channelId,latestCleanupBatchId):[],[uploadHistory,channelScopedJobs,channelId,latestCleanupBatchId]);\n const channelCleanupRows=useMemo(()=>confirmedCleanupCandidates(uploadHistory,channelScopedJobs,channelId),[uploadHistory,channelScopedJobs,channelId]);",
'cleanup visibility')

s=replace_once(s,
"time:scheduleTime,count:targets.length,timeSource:draft.scheduleMode!=='file'&&draft.scheduleTimeSource==='file'?'file':'common'",
"time:effectiveScheduleTime,count:targets.length,timeSource:draft.scheduleTimeSource",
'local schedule source')
s=replace_once(s,
"draft.scheduleTimeSource,scheduleStart,scheduleTime]);",
"draft.scheduleTimeSource,scheduleStart,scheduleTime,scheduleSync.youtubeTime]);",
'local prep deps')

sync_start=s.index(' async function syncScheduleFromYoutube(){')
sync_end=s.index(' async function chooseThumbnails',sync_start)
new_sync=""" async function syncScheduleFromYoutube(){if(!profileId){notifyWarning('Синхронизация недоступна','Подключите YouTube OAuth для этого канала.');return}setScheduleSync(x=>({...x,state:'loading'}));try{const r=await api.youtubeListExisting(profileId,1000);void replaceExistingCacheFromSync(channelId,r.videos||[],r);const scheduleComplete=r.scheduleComplete??(r.complete&&!r.draftCandidateCount);let source=r.videos||[],sourceNote='';if(!scheduleComplete){const reasons=existingSyncIncompleteSummary(r),snapshot=readAuthoritativeExistingSnapshot(channelId),at=snapshot?.updatedAt?Date.parse(snapshot.updatedAt):NaN,ageMs=Number.isFinite(at)?Date.now()-at:Number.POSITIVE_INFINITY,fresh=Boolean(snapshot?.videos.length)&&ageMs>=0&&ageMs<=15*60*1000;if(fresh&&snapshot){source=snapshot.videos;sourceNote=`Текущая проверка неполная: ${reasons.join(' • ')}. Расписание рассчитано по последней полной синхронизации ${new Date(snapshot.updatedAt!).toLocaleString('ru-RU')}.`}else{const note=`Синхронизация канала неполная: ${reasons.join(' • ')}`;setScheduleSync(x=>({...x,state:'error',note}));notifyWarning('Синхронизация канала неполная',`${reasons.join(' • ')}. Откройте «Загруженные» → «Проверить недостающие»; полный inventory повторно читать не требуется, если известны missing IDs.`);return}}const now=new Date(),evidence=inferYoutubePublishClock(source,now),occupied=futureScheduledPublishAts(source,now),syncedAt=now.toISOString();if(draft.scheduleTimeSource==='youtube'&&!evidence){const note=sourceNote||'На YouTube нет достоверного времени публикации: private без publishAt не используется как доказательство.';setScheduleSync({state:'ready',note,futureCount:occupied.length,occupied,timezone:PUBLISHER_TIMEZONE,syncedAt});notifyWarning('Время с YouTube не определено',note);return}const planningTime=draft.scheduleTimeSource==='youtube'?evidence!.time:schedulePlanningTime,plan=recommendScheduleContinuation(source,draft.scheduleMode,planningTime,now),note=sourceNote||(plan.lastPublishAt?'Продолжаем после последней отложенной публикации YouTube':'Будущих отложенных публикаций нет — выбрана ближайшая безопасная дата');setScheduleSync({state:'ready',lastScheduled:plan.lastPublishAt,suggestedStart:plan.recommendedStart,note,futureCount:plan.futureCount,occupied:plan.occupied,timezone:plan.timezone,youtubeTime:evidence?.time,youtubeEvidenceCount:evidence?.evidenceCount,youtubeEvidenceSource:evidence?.source,youtubeEvidenceAt:evidence?.latestEvidenceAt,syncedAt});if(sourceNote)notifyWarning('Использован последний полный snapshot',sourceNote);else notifySuccess('Расписание синхронизировано',evidence?`Время с YouTube: ${evidence.time} KRAT • определено по ${evidence.evidenceCount} видео.`:plan.lastPublishAt?`Последняя дата на YouTube: ${scheduleDateTimeLabel(plan.lastPublishAt)}. Рекомендуемое начало: ${plan.recommendedStart}.`:`Будущих scheduled-видео нет. Рекомендуемое начало: ${plan.recommendedStart}.`)}catch(e){const h=humanizeError(e,'youtube');setScheduleSync(x=>({...x,state:'error',note:h.message}));notifyError(h.title,h.message,{technicalDetail:h.detail})}}
"""
s=s[:sync_start]+new_sync+s[sync_end:]

s=replace_once(s,
"scheduleSyncBlocked=draft.scheduleMode!=='file'&&scheduleStartMode==='continue'&&scheduleSync.state!=='ready'",
"scheduleSyncBlocked=((draft.scheduleMode!=='file'&&scheduleStartMode==='continue')||draft.scheduleTimeSource==='youtube')&&(scheduleSync.state!=='ready'||(draft.scheduleTimeSource==='youtube'&&!scheduleSync.youtubeTime))",
'sync block')

old_shell="<PublisherShell channels={orderedChannels} channelId={channelId} selectedCount={draft.selectedIds.length} newCount={newCount} uploadedCount={uploadedCount} processingCount={processingCount} errorCount={errorCount} folderReady={Boolean(channelRenderFolder&&channelProjectsFolder)} recoveryCount={sessions.length} onChannel={setChannelId} onClear={()=>{setDraft(clearPublishWorkspace(channelId));notifyInfo('Черновик очищен','Файлы на диске не удалены.')}} onFolders={()=>setFoldersOpen(x=>!x)} onRecovery={()=>{setRecoveryOpen(x=>!x);if(!recoveryOpen)void refreshSessions()}} onMetadata={()=>setMetadataOpen(x=>!x)} onThumbs={()=>setThumbnailOpen(x=>!x)} onSchedule={()=>setScheduleOpen(x=>!x)} onCleanup={()=>setCleanupOpen(x=>!x)}/>
"
new_shell="<PublisherShell channels={orderedChannels} channelId={channelId} selectedCount={draft.selectedIds.length} newCount={newCount} uploadedCount={uploadedCount} processingCount={processingCount} errorCount={errorCount} folderReady={Boolean(channelRenderFolder&&channelProjectsFolder)} recoveryCount={sessions.length} onChannel={setChannelId} onClear={()=>{setDraft(clearPublishWorkspace(channelId));notifyInfo('Черновик очищен','Файлы на диске не удалены.')}} onFolders={()=>scrollPublisherSection('publisher-folders')} onRecovery={()=>{void refreshSessions();scrollPublisherSection('publisher-recovery')}} onMetadata={()=>scrollPublisherSection('publisher-metadata')} onThumbs={()=>scrollPublisherSection('publisher-thumbs')} onSchedule={()=>scrollPublisherSection('publisher-schedule')} onCleanup={()=>scrollPublisherSection('publisher-cleanup')}/>
"
s=replace_once(s,old_shell,new_shell,'shell navigation')
return_marker=' return <>\n  <PublisherShell'
s=replace_once(s,return_marker," const scrollPublisherSection=(id:string)=>{if(typeof document!=='undefined')document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})};\n return <>\n  <PublisherShell",'scroll helper')

# Single-line core sections: unwrap visibility conditions and attach stable anchors.
lines=s.splitlines(True)
out=[]
for line in lines:
    if '{foldersOpen&&<section className="panel channelFolderBindings">' in line:
        line=line.replace('{foldersOpen&&<section className="panel channelFolderBindings">','<section id="publisher-folders" className="panel channelFolderBindings">',1)
        if line.rstrip().endswith('</section>}'):
            nl='\n' if line.endswith('\n') else ''
            line=line.rstrip('\n')[:-1]+nl
    if '{recoveryOpen&&recovery.length>0&&<section className="panel recoveryPublishPanel">' in line:
        line=line.replace('{recoveryOpen&&recovery.length>0&&<section className="panel recoveryPublishPanel">','<section id="publisher-recovery" className="panel recoveryPublishPanel">',1)
        line=line.replace('<div className="recoveryUploadRows">{recovery.map(', '<div className="recoveryUploadRows">{recovery.length===0?<div className="publishCheck"><b>Незавершённых загрузок нет</b><span>Незавершённых resumable-сессий для этого канала нет.</span></div>:recovery.map(',1)
        if line.rstrip().endswith('</section>}'):
            nl='\n' if line.endswith('\n') else ''
            line=line.rstrip('\n')[:-1]+nl
    if '{(metadataOpen||draft.rows.length>0)&&<section className="panel publishStep">' in line:
        line=line.replace('{(metadataOpen||draft.rows.length>0)&&<section className="panel publishStep">','<section id="publisher-metadata" className="panel publishStep">',1)
        if line.rstrip().endswith('</section>}'):
            nl='\n' if line.endswith('\n') else ''
            line=line.rstrip('\n')[:-1]+nl
    if '{(thumbnailOpen||draft.thumbs.length>0)&&<section className="panel publishStep">' in line:
        line=line.replace('{(thumbnailOpen||draft.thumbs.length>0)&&<section className="panel publishStep">','<section id="publisher-thumbs" className="panel publishStep">',1)
        if line.rstrip().endswith('</section>}'):
            nl='\n' if line.endswith('\n') else ''
            line=line.rstrip('\n')[:-1]+nl
    if '{(scheduleOpen||selected.length>0)&&<section className="panel publishStep">' in line:
        line=line.replace('{(scheduleOpen||selected.length>0)&&<section className="panel publishStep">','<section id="publisher-schedule" className="panel publishStep">',1)
    out.append(line)
s=''.join(out)
s=replace_once(s,'   </section>}\n  </div>\n  {selected.length>0&&<section className={`panel quotaPreflightCard','   </section>\n  </div>\n  <section id="publisher-cleanup" className="panel publishStep publisherCleanupPanel"><div className="panelHead"><div><small>ОЧИСТКА</small><h3>Очистка</h3><p>Только подтверждённо загруженные локальные файлы. YouTube не изменяется.</p></div><span>{channelCleanupRows.length}</span></div><div className={`publishCheck ${channelCleanupRows.length?\'good\':\'\'}`}><b>{channelCleanupRows.length?`Готово к безопасной очистке: ${channelCleanupRows.length}`:\'Нет файлов для очистки\'}</b><span>Файлы перемещаются в Корзину только при trusted upload-time fingerprint + YouTube ID.</span></div><div className="publishActions">{batchCleanupRows.length>0&&<button className="danger" disabled={busy||sourceAvailability!==\'ONLINE\'} onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(batchCleanupRows),label:`Удалить загруженные из этой партии: ${batchCleanupRows.length}`,cleanupMode:\'batch\'})}>Удалить загруженные из партии ({batchCleanupRows.length})</button>}{channelCleanupRows.length>0&&<button className="danger" disabled={busy||sourceAvailability!==\'ONLINE\'} onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(channelCleanupRows),label:`Очистить подтверждённо загруженные видео: ${channelCleanupRows.length}`,cleanupMode:\'channel\'})}>Очистить подтверждённо загруженные ({channelCleanupRows.length})</button>}</div></section>\n  {selected.length>0&&<section className={`panel quotaPreflightCard','schedule close + cleanup')

# Replace the schedule selector header with explicit independent DATE / TIME groups.
marker_start='    <div className="panelHead"><div><small>04 • SCHEDULE</small><h3>Когда публиковать</h3></div><span>{draft.scheduleMode===\'file\'?\'ИЗ ФАЙЛА\':draft.scheduleMode.toUpperCase()}</span></div>\n'
marker_end='    <div className="scheduleModeButtons publisherScheduleButtons"><button type="button" className={scheduleStartMode===\'continue\'?\'active\':\'\'}'
a=s.index(marker_start);b=s.index(marker_end,a)
selector="""    <div className="panelHead"><div><small>04 • SCHEDULE</small><h3>Когда публиковать</h3></div><span>{draft.scheduleMode==='file'?'ИЗ ФАЙЛА':draft.scheduleMode.toUpperCase()} • {draft.scheduleTimeSource==='file'?'ВРЕМЯ ИЗ ФАЙЛА':draft.scheduleTimeSource==='youtube'?'КАК НА YOUTUBE':'ОБЩЕЕ ВРЕМЯ'}</span></div>
    <div className="publishCheck good"><b>ДАТЫ</b><div className="scheduleModeButtons publisherScheduleButtons">{([['file','Из файла'],['daily','Каждый день'],['2/2','2/2'],['3/1','3/1']] as Array<[PublishScheduleMode,string]>).map(([mode,label])=><button key={mode} type="button" className={draft.scheduleMode===mode?'active':''} onClick={()=>{if(mode!==draft.scheduleMode)setScheduleSync(x=>({...x,state:'idle',note:undefined}));setDraftPatch({scheduleMode:mode,...(mode!=='file'&&!draft.scheduleTime?{scheduleTime:scheduleTime}:{})})}}>{label}</button>)}</div><span>{draft.scheduleMode==='file'?'Календарные даты берутся из metadata каждого VIDEO. Время выбирается отдельно.':'Даты строятся выбранным календарным графиком.'}</span></div>
    <div className="publishCheck good"><b>ВРЕМЯ</b><div className="scheduleModeButtons publisherScheduleButtons"><button type="button" className={draft.scheduleTimeSource==='file'?'active':''} onClick={()=>{if(draft.scheduleTimeSource!=='file')setScheduleSync(x=>({...x,state:'idle',note:'Источник времени изменён'}));setDraftPatch({scheduleTimeSource:'file'})}}>Из файла</button><button type="button" className={draft.scheduleTimeSource==='common'?'active':''} onClick={()=>{if(draft.scheduleTimeSource!=='common')setScheduleSync(x=>({...x,state:'idle',note:'Источник времени изменён'}));setDraftPatch({scheduleTimeSource:'common'})}}>Задать время</button><button type="button" className={draft.scheduleTimeSource==='youtube'?'active':''} onClick={()=>{if(draft.scheduleTimeSource!=='youtube')setScheduleSync(x=>({...x,state:'idle',note:'Получите фактическое время с YouTube'}));setDraftPatch({scheduleTimeSource:'youtube'})}}>Как на YouTube</button></div><span>{draft.scheduleTimeSource==='file'?'Время берётся из соответствующей metadata-строки каждого VIDEO.':draft.scheduleTimeSource==='youtube'?'Используется только доказанное publishAt / publishedAt из авторизованного YouTube inventory.':'Одно общее время применяется к каждой разрешённой дате.'}</span></div>
"""
s=s[:a]+selector+s[b:]

s=replace_once(s,
"    {scheduleSync.state==='ready'&&<div className=\"publishCheck good\"><b>Рекомендуемое начало: {scheduleSync.suggestedStart||'—'} {useFileTime?'• время из файла':scheduleTime}</b><span>{scheduleSync.note}</span><div className=\"publishActions\"><button onClick={()=>setScheduleStartMode('continue')}>Использовать рекомендуемую</button><button onClick={()=>setScheduleStartMode('manual')}>Изменить дату начала</button></div></div>}\n",
"    {scheduleSync.state==='ready'&&<div className=\"publishCheck good\"><b>Рекомендуемое начало: {scheduleSync.suggestedStart||'—'} {useFileTime?'• время из файла':effectiveScheduleTime||'• время не определено'}</b><span>{scheduleSync.note}</span><div className=\"publishActions\"><button onClick={()=>setScheduleStartMode('continue')}>Использовать рекомендуемую</button><button onClick={()=>setScheduleStartMode('manual')}>Изменить дату начала</button></div></div>}\n    {draft.scheduleTimeSource==='youtube'&&<div className={`publishCheck ${scheduleSync.youtubeTime?'good':'warn'}`}><b>{scheduleSync.youtubeTime?`Время с YouTube: ${scheduleSync.youtubeTime} KRAT`:'Время с YouTube не определено'}</b><span>{scheduleSync.youtubeTime?`Определено по ${scheduleSync.youtubeEvidenceCount||0} видео • ${scheduleSync.youtubeEvidenceSource==='scheduled'?'future scheduled/private publishAt':'фактический publishedAt'}${scheduleSync.syncedAt?` • Последняя синхронизация: ${new Date(scheduleSync.syncedAt).toLocaleString('ru-RU')}`:''}`:'VYRON не придумывает время: private без publishAt не считается доказательством.'}</span></div>}\n",
'youtube evidence UI')
s=replace_once(s,
"    {draft.scheduleMode!=='file'&&draft.scheduleTimeSource==='common'&&<label className=\"checkLine\">Время публикации <input type=\"time\" value={scheduleTime} onChange={e=>{setDraftPatch({scheduleTime:e.target.value});if(scheduleSync.state==='ready')setScheduleSync(x=>({...x,state:'idle',note:'Время изменено — синхронизируйте расписание повторно'}))}}/></label>}\n",
"    {draft.scheduleTimeSource==='common'&&<label className=\"checkLine\">Время публикации <input type=\"time\" value={scheduleTime} onChange={e=>{setDraftPatch({scheduleTime:e.target.value});if(scheduleSync.state==='ready')setScheduleSync(x=>({...x,state:'idle',note:'Время изменено — синхронизируйте расписание повторно'}))}}/></label>}\n",
'manual time UI')

# Replace coupled schedule explanation with independent source status blocks.
lines=s.splitlines(True);out=[]
for line in lines:
    if "{draft.scheduleMode==='file'?<div className=\"publishCheck good\"><b>Дата и время из метаданных" in line:
        out.append("    {draft.scheduleMode==='file'&&<div className=\"publishCheck good\"><b>Даты из метаданных</b><span>Используется только календарная дата каждого VIDEO. Источник времени выбран отдельно выше.</span></div>}\n")
        out.append("    {useFileTime?<div className={`publishCheck ${missingPublishTime?'warn':'good'}`}><b>{missingPublishTime?`Не указано время: ${missingPublishTime}`:'Индивидуальное время из файла распознано'}</b><span>Отсутствие PUBLISH TIME блокирует только соответствующий VIDEO.</span></div>:draft.scheduleTimeSource==='common'?<div className=\"publishCheck good\"><b>Общее время: {scheduleTime} KRAT</b><span>Время применяется к каждой разрешённой дате и не меняет даты из файла.</span></div>:null}\n")
    else:
        out.append(line)
s=''.join(out)
s=s.replace("    <small>{draft.scheduleMode==='file'?'Для «Из файла» используются полные дата и время из метаданных.':'Дата определяется выбранным графиком; источник времени задаётся отдельно.'}</small>","    <small>Дата и время — независимые источники. Preview выше показывает итоговый timestamp каждого VIDEO до загрузки.</small>",1)

# Source invariant: no visibility state or visibility toggles may remain.
for forbidden in ('foldersOpen','recoveryOpen','metadataOpen','thumbnailOpen','scheduleOpen','cleanupOpen','setFoldersOpen','setRecoveryOpen','setMetadataOpen','setThumbnailOpen','setScheduleOpen','setCleanupOpen'):
    if forbidden in s:
        raise SystemExit(f'publisher visibility invariant failed: {forbidden} still present')

p.write_text(s)
print('VYRON_6_1_9_PRODUCT_PATCH=APPLIED')
