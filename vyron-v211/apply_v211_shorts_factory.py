#!/usr/bin/env python3
from pathlib import Path
import shutil,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
assets=Path(__file__).resolve().parent/'assets'
for src,dst in [
 ('shortsCore.ts','src/shortsCore.ts'),('shortsCore.test.ts','src/shortsCore.test.ts'),('ShortsFactory.tsx','src/ShortsFactory.tsx'),('ShortsMetadata.tsx','src/ShortsMetadata.tsx'),('MetadataTabs.tsx','src/MetadataTabs.tsx'),('shorts_factory.rs','src-tauri/src/shorts_factory.rs')]:
 p=assets/src
 if not p.exists(): raise SystemExit(f'missing v211 asset: {p}')
 (root/dst).write_text(p.read_text())

p=root/'src/api.ts';s=p.read_text()
a="import {recordYoutubeApiRequest,recordYoutubeCommand,youtubeGuardedCall,type YoutubeApiRequestEvent} from './youtubeQuota';";b=a+"\nimport {mutateShortsState,recordShortUploadAttempt} from './shortsCore';"
if a not in s: raise SystemExit('api quota import anchor missing')
s=s.replace(a,b,1)
a="export type YoutubeFileFingerprint={fingerprint:string;size:number;modifiedAt:number;path:string};\n";b=a+"export type ShortsProbe={path:string;duration:number;width:number;height:number;hasVideo:boolean;hasAudio:boolean;size:number;format:string};\nexport type ShortsRenderResult={outputPath:string;duration:number;width:number;height:number;hasAudio:boolean;encoder:string;reused:boolean};\n"
if a not in s: raise SystemExit('api type anchor missing')
s=s.replace(a,b,1)
a="  youtubeUploadSessions:()=>invoke<YoutubeUploadSession[]>('youtube_upload_sessions'),\n";b="  shortsProbeSource:(sourcePath:string)=>invoke<ShortsProbe>('shorts_probe_source',{sourcePath}),\n  shortsValidateFile:(outputPath:string,targetDuration:number)=>invoke<ShortsProbe>('shorts_validate_file',{outputPath,targetDuration}),\n  shortsRenderSegment:(sourcePath:string,outputPath:string,start:number,duration:number)=>invoke<ShortsRenderResult>('shorts_render_segment',{sourcePath,outputPath,start,duration}),\n"+a
if a not in s: raise SystemExit('api upload sessions anchor missing')
s=s.replace(a,b,1)
a="  onYoutubeApiRequest:(cb:(data:YoutubeApiRequestEvent)=>void)=>listen<YoutubeApiRequestEvent>('youtube-api-request',e=>{recordYoutubeApiRequest(e.payload);cb(e.payload)}),";b="  onYoutubeApiRequest:(cb:(data:YoutubeApiRequestEvent)=>void)=>listen<YoutubeApiRequestEvent>('youtube-api-request',e=>{recordYoutubeApiRequest(e.payload);if(e.payload.method==='videos.insert'&&e.payload.operationId?.startsWith('short-upload:')){const shortId=e.payload.operationId.slice('short-upload:'.length).split(':')[0];mutateShortsState(s=>recordShortUploadAttempt(s,shortId,e.payload.operationId!,e.payload.at||new Date().toISOString()))}cb(e.payload)}),"
if a not in s: raise SystemExit('api event anchor missing')
s=s.replace(a,b,1);p.write_text(s)

p=root/'src-tauri/src/lib.rs';s=p.read_text()
if 'mod shorts_factory;' not in s:
 a='mod production_manager;'
 if a not in s: raise SystemExit('lib module anchor missing')
 s=s.replace(a,a+'\nmod shorts_factory;',1)
a='            production_manager::production_storage_status,production_manager::start_production_import,production_manager::stop_production_import,production_manager::production_import_status,production_manager::set_production_music_library,production_manager::index_production_music_library,production_manager::build_production_batch,production_manager::resume_production_batch,production_manager::find_production_recovery,production_manager::restart_production_batch,production_manager::read_production_batch_status,production_manager::list_production_batches,production_manager::production_channel_state,production_manager::validate_production_batch,production_manager::validate_production_projects,production_manager::delete_production_batch_projects,production_manager::delete_production_job_folder,production_manager::open_production_batch_in_endlume,production_manager::production_endlume_handoff_consumed,\n'
if a not in s: raise SystemExit('lib invoke anchor missing')
s=s.replace(a,a+'            shorts_factory::shorts_probe_source,shorts_factory::shorts_validate_file,shorts_factory::shorts_render_segment,\n',1);p.write_text(s)

p=root/'src/ProductionOS.tsx';s=p.read_text()
a="import {hasChannelNameConflict} from './channelIdentity';"
if a not in s: raise SystemExit('Production import anchor missing')
s=s.replace(a,a+"\nimport {ShortsFactory} from './ShortsFactory';",1)
a="const [section,setSection]=useState<'overview'|'materials'|'builder'|'endlume'>(()=>tab==='materials'?'materials':tab==='manager'?'builder':'overview');";b="const [section,setSection]=useState<'overview'|'materials'|'builder'|'endlume'|'shorts'>(()=>tab==='materials'?'materials':tab==='manager'?'builder':'overview');const [shortsInitialSourceId,setShortsInitialSourceId]=useState<string|undefined>();"
if a not in s: raise SystemExit('Production section anchor missing')
s=s.replace(a,b,1)
a='<div className="youtubeTabs productionTabs productionNavFour"><button className={section===\'overview\'?\'active\':\'\'} onClick={()=>{setSection(\'overview\');setTab(\'queue\');setFilter(\'all\')}}>Обзор</button><button className={section===\'materials\'?\'active\':\'\'} onClick={()=>{setSection(\'materials\');setTab(\'materials\')}}>Материалы</button><button className={section===\'builder\'?\'active\':\'\'} onClick={()=>{setSection(\'builder\');setTab(\'manager\')}}>Сборка проектов</button><button className={section===\'endlume\'?\'active\':\'\'} onClick={()=>{setSection(\'endlume\');setTab(\'manager\');setFilter(\'all\')}}>ENDLUME</button></div>'
b=a[:-6]+'<button className={section===\'shorts\'?\'active\':\'\'} onClick={()=>{setSection(\'shorts\');setTab(\'queue\')}}>SHORTS</button></div>'
if a not in s: raise SystemExit('Production tabs anchor missing')
s=s.replace(a,b,1)
a="{tab==='queue'&&<>{section==='overview'&&<ProductionWorkspace/>}"
if a not in s: raise SystemExit('Production queue anchor missing')
s=s.replace(a,"{tab==='queue'&&section!=='shorts'&&<>{section==='overview'&&<ProductionWorkspace/>}",1)
a='{j.status===\'READY_UPLOAD\'&&<button className="primary small" onClick={()=>setPage(\'youtube\')}>YouTube</button>}'
if a not in s: raise SystemExit('Production video button anchor missing')
s=s.replace(a,a+'{j.status===\'READY_UPLOAD\'&&j.finalPath&&<button className="small" onClick={()=>{setShortsInitialSourceId(j.id);setSection(\'shorts\');setTab(\'queue\')}}>СОЗДАТЬ SHORTS</button>}',1)
a="  {tab==='materials'&&<>"
if a not in s: raise SystemExit('Production materials anchor missing')
s=s.replace(a,"  {section==='shorts'&&<ShortsFactory channelId={channelId} selectedJobIds={selectedJobIds} initialSourceId={shortsInitialSourceId}/>}\n"+a,1);p.write_text(s)

p=root/'src/YouTubeCenter.tsx';s=p.read_text()
a="import {PublisherOS} from './PublisherOS';import {ExistingVideos} from './ExistingVideos';import {MetadataPage} from './MetadataPage';"
if a not in s: raise SystemExit('YouTubeCenter import anchor missing')
s=s.replace(a,"import {PublisherOS} from './PublisherOS';import {ExistingVideos} from './ExistingVideos';import {MetadataTabs} from './MetadataTabs';",1)
a="{tab==='metadata'&&<MetadataPage/>}"
if a not in s: raise SystemExit('YouTubeCenter metadata anchor missing')
s=s.replace(a,"{tab==='metadata'&&<MetadataTabs/>}",1);p.write_text(s)

p=root/'src/QuotaMeter.tsx';s=p.read_text()
a="buildYoutubeQuotaPlan,clearYoutubeQuotaGuard,loadYoutubeQuotaPlan,saveYoutubeQuotaPlan,setYoutubeQuotaLimit,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeQuotaClockSnapshot,youtubeQuotaState,youtubeQuotaUsage"
if a not in s: raise SystemExit('Quota import list anchor missing')
s=s.replace(a,a.replace('youtubeQuotaClockSnapshot','youtubeQuotaBucketUsage,youtubeQuotaClockSnapshot'),1)
a="from './youtubeQuota';";s=s.replace(a,a+"\nimport {readShortsState,shortUploadsToday,subscribeShortsState} from './shortsCore';",1)
a=" const [usage,setUsage]=useState(()=>youtubeQuotaUsage()),[guard,setGuard]=useState(()=>youtubeQuotaState()),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot());"
if a not in s: raise SystemExit('Quota state anchor missing')
s=s.replace(a," const [usage,setUsage]=useState(()=>youtubeQuotaUsage()),[guard,setGuard]=useState(()=>youtubeQuotaState()),[clock,setClock]=useState(()=>youtubeQuotaClockSnapshot()),[shortRev,setShortRev]=useState(0);",1)
a=" useEffect(()=>{const refresh=()=>{setUsage(youtubeQuotaUsage());setGuard(youtubeQuotaState())};const off=subscribeYoutubeQuota(refresh),offClock=subscribeYoutubeQuotaClock(setClock);return()=>{off();offClock()}},[]);"
if a not in s: raise SystemExit('Quota effect anchor missing')
s=s.replace(a," useEffect(()=>{const refresh=()=>{setUsage(youtubeQuotaUsage());setGuard(youtubeQuotaState())};const off=subscribeYoutubeQuota(refresh),offClock=subscribeYoutubeQuotaClock(setClock),offShort=subscribeShortsState(()=>setShortRev(x=>x+1));return()=>{off();offClock();offShort()}},[]);",1)
a=" const plan=useMemo(()=>buildYoutubeQuotaPlan(channels,videos,usage),[channels,videos,usage.ptDate,usage.limit,usage.used]);const pct=Math.min(100,usage.limit?usage.used/usage.limit*100:0),remaining=Math.max(0,usage.limit-usage.used);"
if a not in s: raise SystemExit('Quota plan anchor missing')
s=s.replace(a,a+"const uploadUsage=youtubeQuotaBucketUsage('videoUploads'),shortUploads=shortUploadsToday(readShortsState()),longUploads=Math.max(0,uploadUsage.used-shortUploads);void shortRev;",1)
a='  <div className="quotaMeterBar"><i style={{width:`${pct}%`}}/><span>{pct.toFixed(0)}%</span></div>\n'
if a not in s: raise SystemExit('Quota bar anchor missing')
s=s.replace(a,a+'  <div className="videoUploadsSplit"><span><small>Long Videos</small><b>{longUploads}</b></span><span><small>Shorts</small><b>{shortUploads}</b></span><span><small>Total Video Uploads</small><b>{uploadUsage.used}</b></span></div>\n',1);p.write_text(s)

p=root/'src/styles.css';s=p.read_text();marker='/* VYRON 2.0.11 — Shorts Factory only */'
css='''\n/* VYRON 2.0.11 — Shorts Factory only */\n.shortsFactory,.shortsMetadata{display:grid;gap:16px}.shortsKpis,.videoUploadsSplit{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-top:12px}.shortsKpis span,.videoUploadsSplit span{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel2)}.shortsKpis small,.videoUploadsSplit small{opacity:.7}.shortsKpis b,.videoUploadsSplit b{font-size:18px}.shortsSettings{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.shortsSettings label{display:grid;gap:6px}.shortsSettings textarea{min-height:82px}.shortsSources,.shortsMetaList{display:grid;gap:8px}.shortSource,.shortBatch,.shortRow{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:12px;padding:10px 12px}.shortSource.suggested{outline:1px solid var(--cyan)}.shortSource span,.shortBatch span,.shortRow span{display:grid;gap:3px;min-width:0}.shortSource small,.shortRow small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.shortRow{align-items:flex-start}.shortRow em{font-style:normal;font-size:11px;white-space:nowrap}.metadataTypeTabs{margin-bottom:14px}.shortMetaRow{display:grid;grid-template-columns:auto 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}.shortMetaRow>div{display:grid;gap:8px}.shortMetaRow textarea{min-height:74px}.shortMetaFoot{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;opacity:.8}.shortsMetadata label{display:grid;gap:6px;margin:8px 0}.shortsMetadata textarea{width:100%;min-height:70px}.productionNavFour{grid-template-columns:repeat(5,minmax(0,1fr))}.shortCountPicker{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.shortCountPicker label{display:grid;gap:6px;min-width:150px}.presetRow{display:flex;gap:6px;flex-wrap:wrap}.presetRow button.active{border-color:var(--cyan);box-shadow:0 0 0 1px var(--cyan) inset}\n'''
if marker not in s:s+=css
p.write_text(s)
print('VYRON 2.0.11 Shorts Factory patch applied')
