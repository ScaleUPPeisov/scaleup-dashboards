#!/usr/bin/env python3
from pathlib import Path
import json,re,sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
phase=sys.argv[2] if len(sys.argv)>2 else 'all'

def text(rel): return (root/rel).read_text()
def write(rel,s): (root/rel).write_text(s)
def replace_once(rel,old,new):
    p=root/rel;s=p.read_text()
    if old not in s: raise SystemExit(f'{rel}: anchor missing: {old[:120]!r}')
    p.write_text(s.replace(old,new,1))

def recovery():
    # Pure scheduling helpers: use authoritative YouTube publishAt and never emit past slots.
    p=root/'src/publisherSchedule.ts';s=p.read_text()
    if 'latestYoutubeScheduledPublishAt' not in s:
        s += """

export type YoutubeScheduleLike={privacyStatus?:string;publishAt?:string};
export function isFuturePublishAt(iso?:string,now=new Date()){if(!iso)return false;const t=Date.parse(iso);return Number.isFinite(t)&&t>now.getTime()}
export function latestYoutubeScheduledPublishAt(videos:YoutubeScheduleLike[],now=new Date()){
 const rows=videos.filter(v=>v.privacyStatus==='private'&&v.publishAt&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>now.getTime()).map(v=>v.publishAt!).sort((a,b)=>Date.parse(a)-Date.parse(b));return rows.at(-1)
}
export function nextFutureScheduleDate(startDate:string,time:string,now=new Date()){
 let key=DATE.test(startDate)?startDate:todayKrasnoyarskDate(now),guard=0;while(guard++<3700){const iso=publisherKrasnoyarskIso(key,time);if(iso&&isFuturePublishAt(iso,now))return key;key=addCalendarDays(key,1)}return key
}
export function suggestedScheduleStartDate(videos:YoutubeScheduleLike[],time:string,now=new Date()){
 const last=latestYoutubeScheduledPublishAt(videos,now);const base=last?addCalendarDays(todayKrasnoyarskDate(new Date(last)),1):todayKrasnoyarskDate(now);return nextFutureScheduleDate(base,time,now)
}
"""
        p.write_text(s)

    # Error history keeps sanitized human text plus real backend detail and supports one-item removal.
    p=root/'src/errorHistory.ts';s=p.read_text()
    s=s.replace("export type ErrorHistoryItem={id:string;title:string;message:string;createdAt:number};","export type ErrorHistoryItem={id:string;title:string;message:string;technicalDetail?:string;createdAt:number};")
    s=s.replace("export function appendErrorHistory(title:string,message=''){const row={id:crypto.randomUUID(),title,message,createdAt:Date.now()};save([...load(),row]);return row}","export function appendErrorHistory(title:string,message='',technicalDetail=''){const row={id:crypto.randomUUID(),title,message,technicalDetail:technicalDetail||undefined,createdAt:Date.now()};save([...load(),row]);return row}")
    if 'export function removeErrorHistory' not in s:
        s=s.replace("export function clearErrorHistory(){save([])}","export function removeErrorHistory(id:string){save(load().filter(x=>x.id!==id))}\nexport function clearErrorHistory(){save([])}")
    p.write_text(s)

    # Notifications retain real technical detail in Error Center, while user-facing message stays concise.
    p=root/'src/notificationCenter.ts';s=p.read_text()
    s=s.replace("export type AppNotification={id:string;operationId?:string;type:NotificationType;title:string;message?:string;durationMs:number|null;actions:NotificationAction[];createdAt:number};","export type AppNotification={id:string;operationId?:string;type:NotificationType;title:string;message?:string;technicalDetail?:string;durationMs:number|null;actions:NotificationAction[];createdAt:number};")
    s=s.replace("export type NotificationOptions={operationId?:string;durationMs?:number|null;actions?:NotificationAction[]};","export type NotificationOptions={operationId?:string;durationMs?:number|null;actions?:NotificationAction[];technicalDetail?:string};")
    old="const detail:AppNotification={id:crypto.randomUUID(),operationId:options.operationId,type,title:redactSensitive(title),message:redactSensitive(message),durationMs:options.durationMs===undefined?defaults[type]:options.durationMs,actions:options.actions||[],createdAt:now};"
    new="const detail:AppNotification={id:crypto.randomUUID(),operationId:options.operationId,type,title:redactSensitive(title),message:redactSensitive(message),technicalDetail:options.technicalDetail?redactSensitive(options.technicalDetail):undefined,durationMs:options.durationMs===undefined?defaults[type]:options.durationMs,actions:options.actions||[],createdAt:now};"
    if old in s:s=s.replace(old,new,1)
    s=s.replace("if(type==='error')appendErrorHistory(detail.title,detail.message||'');","if(type==='error')appendErrorHistory(detail.title,detail.message||'',detail.technicalDetail||'');")
    p.write_text(s)

    # Map the actual YouTube future-time rejection explicitly.
    p=root/'src/errorCenter.ts';s=p.read_text()
    anchor=" if(s.includes('publishat')||s.includes('schedule')&&s.includes('invalid')||s.includes('расписание')&&s.includes('не принят'))return{code:'SCHEDULE_REJECTED',title:'YouTube не принял расписание',message:'Проверьте дату, время и статус Private. Метаданные и партия сохранены.',detail,retryable:true,action:'retry'};"
    if "code:'SCHEDULE_IN_PAST'" not in s:
        if anchor not in s: raise SystemExit('errorCenter schedule anchor missing')
        ins=" if(s.includes('schedule_in_past')||s.includes('дата публикации уже в прошлом')||s.includes('scheduled publishing time')&&s.includes('future')||s.includes('must be in the future'))return{code:'SCHEDULE_IN_PAST',title:'Дата публикации уже прошла',message:'Дата должна быть позже текущего времени. Обновите расписание с YouTube и повторите.',detail,retryable:true,action:'retry'};\n"+anchor
        s=s.replace(anchor,ins,1)
    p.write_text(s)

    # App Error Center: remove one error, clear all visible errors, and show technical details.
    p=root/'src/App.tsx';s=p.read_text()
    s=s.replace("import {clearErrorHistory,readErrorHistory,subscribeErrorHistory,type ErrorHistoryItem} from './errorHistory';","import {clearErrorHistory,readErrorHistory,removeErrorHistory,subscribeErrorHistory,type ErrorHistoryItem} from './errorHistory';")
    s=s.replace("const version=useRuntimeVersion();const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),auto=useApp(s=>s.settings.autopilotEnabled);","const version=useRuntimeVersion();const channels=useApp(s=>s.channels),jobs=useApp(s=>s.jobs),patchJob=useApp(s=>s.patchJob),auto=useApp(s=>s.settings.autopilotEnabled);")
    old="{jobErrors.map(j=><article key={`job:${j.id}`}><small>Текущая задача • VIDEO_{String(j.number).padStart(3,'0')}</small><b>{j.error}</b></article>)}{history.map(x=><article key={x.id}><small>{new Date(x.createdAt).toLocaleString('ru-RU')}</small><b>{x.title}</b>{x.message&&<p>{x.message}</p>}</article>)}"
    new="{jobErrors.map(j=><article key={`job:${j.id}`}><small>Текущая задача • VIDEO_{String(j.number).padStart(3,'0')}</small><b>{j.error}</b><details><summary>Технические детали</summary><pre>{j.error}</pre></details><button onClick={()=>patchJob(j.id,{error:undefined})}>Убрать ошибку</button></article>)}{history.map(x=><article key={x.id}><small>{new Date(x.createdAt).toLocaleString('ru-RU')}</small><b>{x.title}</b>{x.message&&<p>{x.message}</p>}{x.technicalDetail&&<details><summary>Технические детали</summary><pre>{x.technicalDetail}</pre></details>}<button onClick={()=>{removeErrorHistory(x.id);setHistory(readErrorHistory())}}>Убрать ошибку</button></article>)}"
    if old not in s: raise SystemExit('App Error Center rows anchor missing')
    s=s.replace(old,new,1)
    old="<footer><button onClick={()=>{clearErrorHistory();setHistory([])}} disabled={!history.length}>Очистить историю</button><button className=\"primary\" onClick={()=>setErrorsOpen(false)}>Закрыть</button></footer>"
    new="<footer><button onClick={()=>{jobErrors.forEach(j=>patchJob(j.id,{error:undefined}));clearErrorHistory();setHistory([])}} disabled={!errorCount}>Очистить все ошибки</button><button onClick={()=>{clearErrorHistory();setHistory([])}} disabled={!history.length}>Очистить историю</button><button className=\"primary\" onClick={()=>setErrorsOpen(false)}>Закрыть</button></footer>"
    if old not in s: raise SystemExit('App Error Center footer anchor missing')
    s=s.replace(old,new,1);p.write_text(s)

    # Publisher: authoritative schedule sync, no-past preflight, real upload/backend details.
    p=root/'src/PublisherOS.tsx';s=p.read_text()
    s=s.replace("import {publisherScheduleDates,publisherSchedulePreview,todayKrasnoyarskDate} from './publisherSchedule';","import {isFuturePublishAt,latestYoutubeScheduledPublishAt,publisherKrasnoyarskIso,publisherScheduleDates,publisherSchedulePreview,suggestedScheduleStartDate,todayKrasnoyarskDate} from './publisherSchedule';")
    old="[lastQuotaReport,setLastQuotaReport]=useState<{plannedGeneral:number;actualGeneral:number;plannedUploads:number;actualUploads:number;remainingGeneral:number;remainingUploads:number}|null>(null);"
    new=old+"\n const [scheduleSync,setScheduleSync]=useState<{state:'idle'|'loading'|'ready'|'error';lastScheduled?:string;suggestedStart?:string;note?:string}>({state:'idle'});"
    if old not in s: raise SystemExit('Publisher state anchor missing')
    s=s.replace(old,new,1)
    old="const channelDefaultTime=`${String(channel?.publishHour??18).padStart(2,'0')}:${String(channel?.publishMinute??0).padStart(2,'0')}`,scheduleStart=draft.scheduleStartDate||todayKrasnoyarskDate(),scheduleTime=draft.scheduleTime||channelDefaultTime;"
    new="const channelDefaultTime=`${String(channel?.publishHour??18).padStart(2,'0')}:${String(channel?.publishMinute??0).padStart(2,'0')}`,scheduleTime=draft.scheduleTime||channelDefaultTime,scheduleStart=draft.scheduleStartDate||scheduleSync.suggestedStart||todayKrasnoyarskDate();"
    if old not in s: raise SystemExit('Publisher schedule state anchor missing')
    s=s.replace(old,new,1)
    s=s.replace("useEffect(()=>{if(!channelId)return;saveActivePublishChannel(channelId);setDraft(loadPublishWorkspace(channelId));setFingerprints({});void refreshSessions()},[channelId]);","useEffect(()=>{if(!channelId)return;saveActivePublishChannel(channelId);setDraft(loadPublishWorkspace(channelId));setFingerprints({});setScheduleSync({state:'idle'});void refreshSessions()},[channelId]);")
    anchor=" async function chooseThumbnails(){const x=await api.chooseImages();"
    if anchor not in s: raise SystemExit('Publisher function anchor missing')
    fn=""" async function syncScheduleFromYoutube(){if(!profileId){notifyWarning('Синхронизация недоступна','Подключите YouTube OAuth для этого канала.');return}setScheduleSync({state:'loading'});try{const r=await api.youtubeListExisting(profileId,1000);const lastScheduled=latestYoutubeScheduledPublishAt(r.videos||[]),suggestedStart=suggestedScheduleStartDate(r.videos||[],scheduleTime,new Date());setScheduleSync({state:'ready',lastScheduled,suggestedStart,note:lastScheduled?'Продолжаем после последней отложенной публикации YouTube':'Будущих отложенных публикаций нет — выбрана ближайшая безопасная дата'});const current=draft.scheduleStartDate?publisherKrasnoyarskIso(draft.scheduleStartDate,scheduleTime):'';if(!current||!isFuturePublishAt(current))setDraftPatch({scheduleStartDate:suggestedStart});notifySuccess('Расписание синхронизировано',lastScheduled?`Последняя дата на YouTube: ${scheduleDateTimeLabel(lastScheduled)}. Новая партия начнётся не раньше ${suggestedStart}.`:`Будущих scheduled-видео нет. Старт: ${suggestedStart}.`)}catch(e){const h=humanizeError(e,'youtube');setScheduleSync({state:'error',note:h.message});notifyError(h.title,h.message,{technicalDetail:h.detail})}}
"""
    s=s.replace(anchor,fn+anchor,1)
    old="async function runBatch(requested?:number){if(!channel||!profileId)return;let batch=selected.filter(j=>!sessions.some(x=>x.jobId===j.id)).slice(0,requested||selected.length);"
    new="async function runBatch(requested?:number){if(!channel||!profileId)return;if(draft.scheduleMode!=='file'&&scheduleSync.state!=='ready'){notifyWarning('Сначала синхронизируйте расписание','Для автоматического графика VYRON должен получить последнюю дату publishAt с YouTube.');return}let batch=selected.filter(j=>!sessions.some(x=>x.jobId===j.id)).slice(0,requested||selected.length);"
    if old not in s: raise SystemExit('Publisher runBatch anchor missing')
    s=s.replace(old,new,1)
    old="if(batch.some(j=>!effectivePublishAt(j))){notifyWarning('Pre-flight не пройден','У каждого выбранного видео должна быть дата публикации: publishAt передаётся сразу в первоначальном videos.insert.');return}"
    new=old+"if(batch.some(j=>!isFuturePublishAt(effectivePublishAt(j)))){notifyWarning('Дата публикации уже прошла','Дата должна быть позже текущего времени. Синхронизируйте расписание с YouTube и повторите.');return}"
    if old not in s: raise SystemExit('Publisher schedule preflight anchor missing')
    s=s.replace(old,new,1)
    # Preserve real backend detail for all upload-side notifications generated in this file.
    s=s.replace("notifyError(h.title,h.message)","notifyError(h.title,h.message,{technicalDetail:h.detail})")
    s=s.replace("notifyError(h.title,`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`)","notifyError(h.title,`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`,{technicalDetail:h.detail})")
    old="const missingMetadata=selected.filter(j=>!j.title.trim()).length,missingSchedule=selected.filter(j=>!effectivePublishAt(j)).length,locked=isChannelUploadLocked(channelId),preflightBlocked=!selected.length||!profileId||!quotaPlan.affordable||missingSchedule>0"
    new="const missingMetadata=selected.filter(j=>!j.title.trim()).length,missingSchedule=selected.filter(j=>!effectivePublishAt(j)).length,pastSchedule=selected.some(j=>Boolean(effectivePublishAt(j))&&!isFuturePublishAt(effectivePublishAt(j))),scheduleSyncBlocked=draft.scheduleMode!=='file'&&scheduleSync.state!=='ready',locked=isChannelUploadLocked(channelId),preflightBlocked=!selected.length||!profileId||!quotaPlan.affordable||missingSchedule>0||pastSchedule||scheduleSyncBlocked"
    if old not in s: raise SystemExit('Publisher preflightBlocked anchor missing')
    s=s.replace(old,new,1)
    old="<div className=\"scheduleModeButtons publisherScheduleButtons\">{([['file','Из файла'],['daily','Каждый день'],['2/2','2/2'],['3/1','3/1']] as Array<[PublishScheduleMode,string]>).map(([mode,label])=><button key={mode} type=\"button\" className={draft.scheduleMode===mode?'active':''} onClick={()=>setDraftPatch({scheduleMode:mode,...(mode!=='file'&&!draft.scheduleStartDate?{scheduleStartDate:scheduleStart}:{}),...(mode!=='file'&&!draft.scheduleTime?{scheduleTime:scheduleTime}:{})})}>{label}</button>)}</div>"
    new=old+"{draft.scheduleMode!=='file'&&<div className=\"publishActions\"><button disabled={busy||scheduleSync.state==='loading'||!profileId} onClick={()=>void syncScheduleFromYoutube()}>{scheduleSync.state==='loading'?'СИНХРОНИЗИРУЮ…':'Синхронизировать с YouTube'}</button><span>Последняя дата на YouTube: <b>{scheduleDateTimeLabel(scheduleSync.lastScheduled)}</b></span></div>}{scheduleSync.note&&draft.scheduleMode!=='file'&&<div className={`publishCheck ${scheduleSync.state==='ready'?'good':'warn'}`}><b>{scheduleSync.state==='ready'?'Расписание готово':'Расписание требует внимания'}</b><span>{scheduleSync.note}</span></div>}"
    if old not in s: raise SystemExit('Publisher schedule UI anchor missing')
    s=s.replace(old,new,1)
    p.write_text(s)

    # Release regression tests.
    (root/'src/v2100PublishRecovery.test.ts').write_text("""import {describe,expect,it} from 'vitest';
import {isFuturePublishAt,latestYoutubeScheduledPublishAt,suggestedScheduleStartDate} from './publisherSchedule';
import {readFileSync} from 'node:fs';
const v=(publishAt?:string)=>({privacyStatus:'private',publishAt});
describe('VYRON 2.1 publish recovery',()=>{
 it('uses the last future YouTube publishAt',()=>expect(latestYoutubeScheduledPublishAt([v('2026-09-05T11:00:00Z'),v('2026-09-06T11:00:00Z')],new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-06T11:00:00Z'));
 it('starts after the last YouTube date',()=>expect(suggestedScheduleStartDate([v('2026-09-06T11:00:00Z')],'18:00',new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-07'));
 it('never accepts a past publishAt',()=>{const now=new Date('2026-09-10T10:00:00Z');expect(isFuturePublishAt('2026-09-10T09:59:59Z',now)).toBe(false);expect(isFuturePublishAt('2026-09-10T10:00:01Z',now)).toBe(true)});
 it('wires real details and clearable Error Center',()=>{const p=readFileSync('src/PublisherOS.tsx','utf8'),a=readFileSync('src/App.tsx','utf8'),n=readFileSync('src/notificationCenter.ts','utf8');expect(p).toContain('syncScheduleFromYoutube');expect(p).toContain('pastSchedule');expect(p).toContain('Синхронизировать с YouTube');expect(p).toContain('technicalDetail:h.detail');expect(a).toContain('Очистить все ошибки');expect(a).toContain('Убрать ошибку');expect(a).toContain('Технические детали');expect(n).toContain('technicalDetail?:string')});
});
""")

    # Version all package surfaces and add release history entry.
    v='2.1.0'
    for rel in ('package.json','src-tauri/tauri.conf.json'):
        p=root/rel;x=json.loads(p.read_text());x['version']=v;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
    p=root/'package-lock.json'
    if p.exists():
        x=json.loads(p.read_text());x['version']=v
        if isinstance(x.get('packages'),dict) and isinstance(x['packages'].get(''),dict):x['packages']['']['version']=v
        p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
    p=root/'src-tauri/Cargo.toml';s=p.read_text();m=re.search(r'(?ms)^\[package\]\n(.*?)(?=^\[|\Z)',s)
    if not m: raise SystemExit('Cargo package section missing')
    sec=re.sub(r'(?m)^version\s*=\s*"[^"]+"',f'version = "{v}"',m.group(0),count=1);p.write_text(s[:m.start()]+sec+s[m.end():])
    p=root/'src/releaseHistory.ts';s=p.read_text()
    if "version:'2.1.0'" not in s:
        marker='export const RELEASE_HISTORY=['
        if marker not in s: raise SystemExit('releaseHistory anchor missing')
        entry="\n {date:'10.09.2026',version:'2.1.0',title:'Shorts Factory, Content Buffer & Safe Storage',items:['Publisher продолжает расписание от последнего реального YouTube publishAt и блокирует даты в прошлом.','Error Center показывает техническую ошибку YouTube, позволяет убрать отдельную ошибку и очистить весь счётчик.','Shorts Factory создаёт вертикальные 1080×1920 Shorts из готовых Long Video с отдельными metadata/schedule/recovery.','Content Buffer использует существующий runway канала; Storage Manager получил безопасный архив готовых MP4 без удаления исходного видео.']},"
        s=s.replace(marker,marker+entry,1);p.write_text(s)


def storage():
    # Backend safe archive: COPY completed rendered MP4, atomic temp copy, never remove source video.
    p=root/'src-tauri/src/production_manager.rs';s=p.read_text()
    if 'ArchiveRenderedResult' not in s:
        anchor='pub struct CleanupResult { pub eligible_projects:usize,pub cleaned_projects:usize,pub removed_files:usize,pub freed_bytes:u64,pub skipped_projects:usize }'
        if anchor not in s: raise SystemExit('production_manager CleanupResult anchor missing')
        s=s.replace(anchor,anchor+'\n#[derive(Serialize,Default)]\n#[serde(rename_all="camelCase")]\npub struct ArchiveRenderedResult { pub archive_path:String,pub copied_files:usize,pub copied_bytes:u64,pub skipped_files:usize }',1)
        fn="""

#[tauri::command]
pub fn archive_production_rendered_videos(manifest_path:String,archive_root:String)->Result<ArchiveRenderedResult,String>{
    if archive_root.trim().is_empty(){return Err("Папка архива не выбрана".into())}
    let(m,_)=load_manifest(&manifest_path)?;let st:BatchStatus=read_json(Path::new(&m.status_path));let batch_root=PathBuf::from(&m.root_path).canonicalize().map_err(|e|format!("Batch недоступен: {e}"))?;
    let target=PathBuf::from(archive_root.trim()).join(safe_component(&m.channel_name)).join(safe_component(&m.batch_id));fs::create_dir_all(&target).map_err(|e|format!("Не удалось создать архив: {e}"))?;
    let mut out=ArchiveRenderedResult{archive_path:target.to_string_lossy().into_owned(),..Default::default()};
    for row in &st.projects{
        if row.render_status!="Completed"{out.skipped_files+=1;continue}
        let Some(src_raw)=row.output_file.as_ref() else{out.skipped_files+=1;continue};let src=PathBuf::from(src_raw);if !src.is_file(){out.skipped_files+=1;continue}
        let canon=src.canonicalize().map_err(|e|format!("MP4 недоступен: {e}"))?;if !canon.starts_with(&batch_root){return Err(format!("BLOCK: MP4 вне batch: {}",canon.display()))}
        let name=canon.file_name().ok_or_else(||"Некорректное имя MP4".to_string())?;let dst=target.join(name);let bytes=fs::metadata(&canon).map_err(|e|e.to_string())?.len();
        if dst.is_file()&&fs::metadata(&dst).map(|x|x.len()).unwrap_or(0)==bytes{out.skipped_files+=1;continue}
        let tmp=target.join(format!(".{}.part",name.to_string_lossy()));if tmp.exists(){let _=fs::remove_file(&tmp)}fs::copy(&canon,&tmp).map_err(|e|format!("Не удалось скопировать {}: {e}",canon.display()))?;fs::rename(&tmp,&dst).map_err(|e|format!("Не удалось завершить архивирование: {e}"))?;
        // Safety invariant: source rendered MP4 is COPY-ONLY and is never removed here.
        out.copied_files+=1;out.copied_bytes=out.copied_bytes.saturating_add(bytes);
    }
    Ok(out)
}
"""
        anchor2='pub fn cleanup_completed_production_assets(manifest_path:String)->Result<CleanupResult,String>{let(m,_)=load_manifest(&manifest_path)?;let st:BatchStatus=read_json(Path::new(&m.status_path));cleanup_completed_assets(&m,&st)}'
        if anchor2 not in s: raise SystemExit('production_manager cleanup command anchor missing')
        s=s.replace(anchor2,anchor2+fn,1);p.write_text(s)

    p=root/'src/productionManagerApi.ts';s=p.read_text()
    if 'ArchiveRenderedResult' not in s:
        s=s.replace("export type CleanupResult={eligibleProjects:number;cleanedProjects:number;removedFiles:number;freedBytes:number;skippedProjects:number};","export type CleanupResult={eligibleProjects:number;cleanedProjects:number;removedFiles:number;freedBytes:number;skippedProjects:number};\nexport type ArchiveRenderedResult={archivePath:string;copiedFiles:number;copiedBytes:number;skippedFiles:number};")
        s=s.replace("chooseProductionRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка для проектов VYRON',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},","chooseProductionRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка для проектов VYRON',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},\n  chooseArchiveRoot:async(defaultPath?:string)=>{const p=await open({directory:true,multiple:false,title:'Папка безопасного архива MP4',defaultPath:defaultPath||undefined});return typeof p==='string'?p:'';},")
        s=s.replace("cleanupCompletedAssets:(manifestPath:string)=>invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath}),","cleanupCompletedAssets:(manifestPath:string)=>invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath}),\n  archiveRenderedVideos:(manifestPath:string,archiveRoot:string)=>invoke<ArchiveRenderedResult>('archive_production_rendered_videos',{manifestPath,archiveRoot}),")
        p.write_text(s)

    p=root/'src-tauri/src/lib.rs';s=p.read_text()
    if 'production_manager::archive_production_rendered_videos' not in s:
        anchor='production_manager::cleanup_completed_production_assets,'
        if anchor not in s: raise SystemExit('lib cleanup handler anchor missing')
        s=s.replace(anchor,anchor+'production_manager::archive_production_rendered_videos,',1);p.write_text(s)

    p=root/'src/ProductionManager.tsx';s=p.read_text()
    if 'archiveRenderedVideos' not in s:
        anchor='  async function cleanupAllRenderedProjectAssets(){'
        if anchor not in s: raise SystemExit('ProductionManager cleanup function anchor missing')
        fn="""  async function archiveRenderedVideos(){
    const batch=result?.batch;if(!batch){toast('Сначала откройте batch');return}const archiveRoot=await productionManagerApi.chooseArchiveRoot();if(!archiveRoot)return;
    if(!window.confirm(`Скопировать все завершённые MP4 batch ${batch.batchId} в безопасный архив? Исходные видео останутся на месте и автоматически не удаляются.`))return;
    setBusy('archive');try{const r=await productionManagerApi.archiveRenderedVideos(batch.manifestPath,archiveRoot);notifySuccess('MP4 скопированы в архив',`${r.copiedFiles} файлов • ${bytesLabel(r.copiedBytes)} • исходные видео сохранены • пропущено ${r.skippedFiles}.`,{operationId:`archive-rendered:${batch.batchId}:${Date.now()}`});await productionManagerApi.openFolder(r.archivePath)}catch(e){toast(`Не удалось архивировать MP4: ${String(e)}`)}finally{setBusy('')}
  }
"""
        s=s.replace(anchor,fn+anchor,1)
        anchor2="<div className=\"pmActions resultActions\"><button disabled={busy==='validate'} onClick={()=>void validateBatch()}>ПРОВЕРИТЬ</button>"
        if anchor2 not in s: raise SystemExit('ProductionManager result actions anchor missing')
        s=s.replace(anchor2,"<div className=\"pmActions resultActions\"><button disabled={busy==='archive'} onClick={()=>void archiveRenderedVideos()}>{busy==='archive'?'АРХИВИРУЮ…':'АРХИВ MP4'}</button><button disabled={busy==='validate'} onClick={()=>void validateBatch()}>ПРОВЕРИТЬ</button>",1)
        p.write_text(s)

    (root/'src/v2100StorageArchive.test.ts').write_text("""import {describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';
describe('VYRON 2.1 safe storage archive',()=>{it('is copy-only for rendered source video',()=>{const r=readFileSync('src-tauri/src/production_manager.rs','utf8'),a=readFileSync('src/productionManagerApi.ts','utf8'),u=readFileSync('src/ProductionManager.tsx','utf8'),l=readFileSync('src-tauri/src/lib.rs','utf8');const start=r.indexOf('pub fn archive_production_rendered_videos');const end=r.indexOf('\n}',start)+2;const fn=r.slice(start,end);expect(fn).toContain('fs::copy');expect(fn).not.toContain('remove_file(&canon)');expect(fn).not.toContain('remove_dir_all');expect(fn).toContain('source rendered MP4 is COPY-ONLY');expect(a).toContain("archiveRenderedVideos:(manifestPath:string,archiveRoot:string)");expect(u).toContain('АРХИВ MP4');expect(u).toContain('Исходные видео останутся на месте');expect(l).toContain('production_manager::archive_production_rendered_videos')})});
""")

if phase in ('all','recovery'): recovery()
if phase in ('all','storage'): storage()
print(f'VYRON 2.1.0 direct source patch applied: {phase}')
