#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# ---------- frontend API ----------
p=root/'src/api.ts';s=p.read_text()
anchor="export type ShortsProbe={path:string;duration:number;width:number;height:number;hasVideo:boolean;hasAudio:boolean;size:number;format:string};"
insert=anchor+"\nexport type ShortsSourceFile={path:string;name:string;size:number;extension:string};"
if 'export type ShortsSourceFile=' not in s:
    if anchor not in s: raise SystemExit('ShortsProbe type anchor missing')
    s=s.replace(anchor,insert,1)
anchor="  chooseWorkspace:async()=>{const r=await open({directory:true,multiple:false,title:'Папка VYRON YT PEISOV'});return typeof r==='string'?r:null},"
insert=anchor+"\n  chooseShortsSourceFolder:async()=>{const r=await open({directory:true,multiple:false,title:'Выберите папку с видео для Shorts'});return typeof r==='string'?r:null},\n  chooseShortsOutputFolder:async(defaultPath?:string)=>{const r=await open({directory:true,multiple:false,title:'Папка для готовых Shorts',defaultPath:defaultPath||undefined});return typeof r==='string'?r:null},"
if 'chooseShortsSourceFolder:' not in s:
    if anchor not in s: raise SystemExit('chooseWorkspace anchor missing')
    s=s.replace(anchor,insert,1)
anchor="  shortsProbeSource:(sourcePath:string)=>invoke<ShortsProbe>('shorts_probe_source',{sourcePath}),"
insert="  shortsScanFolder:(sourceFolder:string)=>invoke<ShortsSourceFile[]>('shorts_scan_folder',{sourceFolder}),\n"+anchor
if 'shortsScanFolder:' not in s:
    if anchor not in s: raise SystemExit('shortsProbeSource api anchor missing')
    s=s.replace(anchor,insert,1)
p.write_text(s)

# ---------- ShortsFactory: source is a user-selected folder, not Production ----------
p=root/'src/ShortsFactory.tsx'
p.write_text(r'''import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api,type ShortsSourceFile} from './api';
import {useApp} from './store';
import {mutateShortsState,patchShort,patchShortBatch,planSegments,readShortsState,recordUsedSegments,recoverInterruptedShorts,shortStatusFromRecord,subscribeShortsState,type ShortBatch,type ShortRecord,type ShortsState,type ShortSelectionMode,writeShortsState} from './shortsCore';

const statusRu:Record<string,string>={CREATING:'СОЗДАЁТСЯ',READY:'ГОТОВ',METADATA_READY:'METADATA READY',QUEUED:'В ОЧЕРЕДИ',UPLOADING:'ЗАГРУЗКА',PRIVATE:'PRIVATE',SCHEDULED:'SCHEDULED',PUBLISHED:'PUBLISHED',ERROR:'ОШИБКА'};
function useShorts(){const [s,setS]=useState<ShortsState>(()=>readShortsState());useEffect(()=>subscribeShortsState(()=>setS(readShortsState())),[]);return s}
function id(prefix:string){return `${prefix}_${typeof crypto!=='undefined'&&'randomUUID'in crypto?crypto.randomUUID():`${Date.now()}_${Math.random().toString(36).slice(2)}`}`}
function sourceId(path:string){return `file:${path}`}
function sourceStem(path:string){const x=path.replace(/\\/g,'/').split('/').pop()||'video';return x.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}._ -]+/gu,'_').slice(0,90)||'video'}
function outputPath(sourcePath:string,sourceFolder:string,outputFolder:string,shortId:string){const base=(outputFolder||`${sourceFolder.replace(/\/+$/,'')}/VYRON Shorts`).replace(/\/+$/,'');return `${base}/${sourceStem(sourcePath)}/${shortId}.mp4`}

export function ShortsFactory({channelId}:{channelId:string;selectedJobIds?:string[];initialSourceId?:string}){
 const channels=useApp(s=>s.channels),toast=useApp(s=>s.toast);const state=useShorts();const [count,setCount]=useState(20),[avg,setAvg]=useState(30),[min,setMin]=useState(30),[max,setMax]=useState(30),[mode,setMode]=useState<ShortSelectionMode>('uniform'),[busy,setBusy]=useState(false),[planning,setPlanning]=useState(''),[sourceFolder,setSourceFolder]=useState(''),[outputFolder,setOutputFolder]=useState(''),[files,setFiles]=useState<ShortsSourceFile[]>([]),[selectedPaths,setSelectedPaths]=useState<string[]>([]),[scanError,setScanError]=useState('');const worker=useRef(false);const channel=channels.find(c=>c.id===channelId);const owner=channelId||'local-shorts';const rows=state.records.filter(r=>r.sourceChannelId===owner).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const batches=state.batches.filter(b=>b.channelId===owner).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const selected=files.filter(f=>selectedPaths.includes(f.path));
 useEffect(()=>{const s=readShortsState();const r=recoverInterruptedShorts(s);if(JSON.stringify(s)!==JSON.stringify(r))writeShortsState(r)},[]);
 async function chooseSource(){const folder=await api.chooseShortsSourceFolder();if(!folder)return;setBusy(true);setScanError('');try{const found=await api.shortsScanFolder(folder);setSourceFolder(folder);setOutputFolder('');setFiles(found);setSelectedPaths(found.map(x=>x.path));toast(found.length?`Shorts: найдено видео ${found.length}`:'В выбранной папке нет MP4/MOV')}catch(e){setFiles([]);setSelectedPaths([]);setScanError(String(e));toast(`Shorts: ${String(e)}`)}finally{setBusy(false)}}
 async function rescan(){if(!sourceFolder)return;setBusy(true);setScanError('');try{const found=await api.shortsScanFolder(sourceFolder);setFiles(found);setSelectedPaths(prev=>prev.filter(x=>found.some(f=>f.path===x)));toast(`Shorts: найдено видео ${found.length}`)}catch(e){setScanError(String(e));toast(`Shorts: ${String(e)}`)}finally{setBusy(false)}}
 async function chooseOutput(){const folder=await api.chooseShortsOutputFolder(outputFolder||`${sourceFolder.replace(/\/+$/,'')}/VYRON Shorts`);if(folder)setOutputFolder(folder)}
 function toggle(path:string){setSelectedPaths(x=>x.includes(path)?x.filter(p=>p!==path):[...x,path])}
 async function createFrom(list:ShortsSourceFile[]){if(!sourceFolder){toast('Сначала выберите папку с видео');return}if(!list.length){toast('Выберите хотя бы одно видео');return}setBusy(true);const batchId=id('shortbatch'),now=new Date().toISOString();setPlanning(`Проверяю ${list.length} исходников…`);const created:ShortRecord[]=[];const errors:string[]=[];try{for(let index=0;index<list.length;index++){const file=list[index];try{setPlanning(`FFprobe ${index+1}/${list.length}: ${file.name}`);const probe=await api.shortsProbeSource(file.path);const used=recordUsedSegments([...state.records,...created],file.path);const segments=planSegments({count,sourceDuration:probe.duration,averageDuration:avg,minDuration:min,maxDuration:max,mode,used});for(const seg of segments){const sid=id('short');created.push({id:sid,batchId,sourceProjectId:sourceId(file.path),sourceVideoId:sourceId(file.path),sourcePath:file.path,sourceChannelId:owner,start:seg.start,end:seg.end,duration:seg.duration,outputPath:outputPath(file.path,sourceFolder,outputFolder,sid),createdAt:now,updatedAt:now,status:'QUEUED',metadataStatus:'EMPTY',uploadStatus:'LOCAL',publishStatus:'UNSCHEDULED',title:'',description:'',tags:[],privacyStatus:'private',attempts:0})}}catch(e){errors.push(`${file.name}: ${String(e)}`)}}if(created.length){const sourceProjectIds=[...new Set(created.map(x=>x.sourceProjectId))];const batch:ShortBatch={id:batchId,channelId:owner,sourceProjectIds,requestedPerVideo:count,createdAt:now,updatedAt:now,paused:false,status:'QUEUED'};mutateShortsState(s=>({...s,records:[...s.records,...created],batches:[...s.batches,batch]}))}if(errors.length)setScanError(errors.slice(0,10).join('\n'));toast(errors.length?`Shorts: в очередь ${created.length}, пропущено файлов ${errors.length}`:`Shorts поставлены в очередь: ${created.length}`)}finally{setPlanning('');setBusy(false)}}
 useEffect(()=>{if(worker.current)return;const next=state.records.find(r=>r.status==='QUEUED'&&!state.batches.find(b=>b.id===r.batchId)?.paused);if(!next)return;worker.current=true;void(async()=>{patchShort(next.id,{status:'CREATING',error:undefined,attempts:next.attempts+1});patchShortBatch(next.batchId,{status:'RUNNING'});try{const result=await api.shortsRenderSegment(next.sourcePath,next.outputPath,next.start,next.duration);patchShort(next.id,{status:next.metadataStatus==='READY'?'METADATA_READY':'READY',outputPath:result.outputPath,duration:result.duration,error:undefined})}catch(e){patchShort(next.id,{status:'ERROR',error:String(e)})}finally{const fresh=readShortsState(),batch=fresh.batches.find(b=>b.id===next.batchId);if(batch){const br=fresh.records.filter(r=>r.batchId===batch.id);const pending=br.some(r=>r.status==='QUEUED'||r.status==='CREATING');const ok=br.some(r=>r.status!=='ERROR');worker.current=false;patchShortBatch(batch.id,{status:pending?(batch.paused?'PAUSED':'QUEUED'):(ok?'DONE':'ERROR')})}else worker.current=false}})()},[state.records.map(r=>`${r.id}:${r.status}`).join('|'),state.batches.map(b=>`${b.id}:${b.paused}`).join('|')]);
 function pause(id:string,v:boolean){patchShortBatch(id,{paused:v,status:v?'PAUSED':'QUEUED'})}
 function retry(r:ShortRecord){patchShort(r.id,{status:'QUEUED',error:undefined})}
 const counts=useMemo(()=>{const x:Record<string,number>={};for(const r of rows)x[shortStatusFromRecord(r)]=(x[shortStatusFromRecord(r)]||0)+1;return x},[rows]);
 return <div className="shortsFactory">
  <section className="panel"><div className="panelHead"><div><small>SHORTS FACTORY • LOCAL • 0 YOUTUBE API</small><h2>{channel?.name||'Shorts Factory'}</h2><p>Выберите любую папку с MP4/MOV. VYRON создаёт 1080×1920 Shorts с исходным звуком; Production и ENDLUME для выбора источника не нужны.</p></div><span>{rows.length} SHORTS</span></div><div className="shortsKpis"><span><small>Готово</small><b>{counts.READY||0}</b></span><span><small>Metadata</small><b>{counts.METADATA_READY||0}</b></span><span><small>Scheduled</small><b>{counts.SCHEDULED||0}</b></span><span><small>Uploaded</small><b>{(counts.PRIVATE||0)+(counts.SCHEDULED||0)+(counts.PUBLISHED||0)}</b></span><span><small>Published</small><b>{counts.PUBLISHED||0}</b></span><span><small>Errors</small><b>{counts.ERROR||0}</b></span></div></section>
  <section className="panel"><div className="panelHead"><div><small>SOURCE FOLDER</small><h3>Источник видео</h3><p>{sourceFolder||'Папка ещё не выбрана'}</p></div><span>{files.length} VIDEO</span></div><div className="pmActions"><button className="primary" disabled={busy} onClick={()=>void chooseSource()}>ВЫБРАТЬ ПАПКУ С ВИДЕО</button><button disabled={busy||!sourceFolder} onClick={()=>void rescan()}>↻ ОБНОВИТЬ</button><button disabled={busy||!sourceFolder} onClick={()=>void chooseOutput()}>ПАПКА ДЛЯ SHORTS</button></div><div className="workspacePaths"><code>Source: {sourceFolder||'—'}</code><code>Output: {outputFolder||sourceFolder?`${outputFolder||`${sourceFolder.replace(/\/+$/,'')}/VYRON Shorts`}`:'—'}</code></div>{scanError&&<div className="pmStorageError" style={{whiteSpace:'pre-wrap'}}>{scanError}</div>}{files.length?<><div className="pmBulkBar"><span>Выбрано <b>{selected.length}</b> / {files.length}</span><button onClick={()=>setSelectedPaths(files.map(x=>x.path))}>Выбрать всё</button><button onClick={()=>setSelectedPaths([])}>Снять выделение</button></div><div className="shortsSources">{files.map(file=><label className="shortSource" key={file.path}><input type="checkbox" checked={selectedPaths.includes(file.path)} onChange={()=>toggle(file.path)}/><span><b>{file.name}</b><small>{file.path}</small><small>{(file.size/1024/1024).toFixed(1)} MB • {file.extension.toUpperCase()}</small></span></label>)}</div></>:<p>Выберите папку. VYRON найдёт MP4 и MOV сам.</p>}</section>
  <section className="panel"><div className="panelHead"><div><small>SETTINGS</small><h3>Нарезка</h3></div><span>~{avg}s</span></div><div className="shortCountPicker"><label>Количество / VIDEO<input type="number" min="1" max="500" value={count} onChange={e=>setCount(Math.max(1,Math.min(500,+e.target.value||1)))}/></label><div className="presetRow">{[1,5,10,20,30,50].map(n=><button key={n} className={count===n?'active':''} onClick={()=>setCount(n)}>{n}</button>)}</div></div><div className="shortsSettings"><label>Средняя длительность<input type="number" min="5" max="60" value={avg} onChange={e=>{const v=Math.max(5,Math.min(60,+e.target.value||30));if(min===max&&min===avg){setMin(v);setMax(v)}setAvg(v)}}/></label><label>Мин, сек<input type="number" min="5" max="60" value={min} onChange={e=>setMin(Math.max(5,Math.min(60,+e.target.value||30)))}/></label><label>Макс, сек<input type="number" min="5" max="60" value={max} onChange={e=>setMax(Math.max(5,Math.min(60,+e.target.value||30)))}/></label><label>Фрагменты<select value={mode} onChange={e=>setMode(e.target.value as ShortSelectionMode)}><option value="uniform">РАВНОМЕРНО</option><option value="random">СЛУЧАЙНО</option></select></label></div>{planning&&<div className="cacheNotice"><b>ПОДГОТОВКА</b><span>{planning}</span></div>}<div className="publishActions"><button className="primary" disabled={busy||!selected.length} onClick={()=>void createFrom(selected)}>{sourceFolder?`СОЗДАТЬ SHORTS ИЗ ВЫБРАННЫХ (${selected.length})`:'СНАЧАЛА ВЫБЕРИТЕ ПАПКУ'}</button><button disabled={busy||!files.length} onClick={()=>void createFrom(files)}>СОЗДАТЬ SHORTS ИЗ ВСЕХ ({files.length})</button></div></section>
  <section className="panel"><div className="panelHead"><div><small>BATCH QUEUE</small><h3>Прогресс / Pause / Resume</h3></div><span>{batches.length}</span></div>{batches.map(b=>{const br=state.records.filter(r=>r.batchId===b.id),done=br.filter(r=>!['QUEUED','CREATING'].includes(r.status)).length,errors=br.filter(r=>r.status==='ERROR').length;return <div className="shortBatch" key={b.id}><span><b>{done} / {br.length}</b><small>{b.status}{errors?` • errors ${errors}`:''}</small></span><div><button onClick={()=>pause(b.id,!b.paused)}>{b.paused?'RESUME':'PAUSE'}</button></div></div>})}</section>
  <section className="panel"><div className="panelHead"><div><small>SHORTS LIBRARY</small><h3>Локальные файлы</h3></div><span>{rows.length}</span></div>{rows.map(r=><div className="shortRow" key={r.id}><span><b>{sourceStem(r.sourcePath)}</b><small>{r.start.toFixed(1)} → {r.end.toFixed(1)} • {r.duration.toFixed(1)}s</small><small>{r.outputPath}</small></span><em>{statusRu[shortStatusFromRecord(r)]||r.status}</em>{r.error&&<small className="jobError">{r.error}</small>}{r.status==='ERROR'&&<button onClick={()=>retry(r)}>RETRY</button>}</div>)}</section>
 </div>
}
''')

# ---------- Rust: scan arbitrary folder and accept MOV/MP4 ----------
p=root/'src-tauri/src/shorts_factory.rs';s=p.read_text()
anchor='pub struct ShortsProbe { pub path:String,pub duration:f64,pub width:u64,pub height:u64,pub has_video:bool,pub has_audio:bool,pub size:u64,pub format:String }'
insert=anchor+r'''
#[derive(Serialize,Debug,Clone)]
#[serde(rename_all="camelCase")]
pub struct ShortsSourceFile { pub path:String,pub name:String,pub size:u64,pub extension:String }
fn supported_source(path:&Path)->bool{matches!(path.extension().and_then(|x|x.to_str()).map(|x|x.to_ascii_lowercase()).as_deref(),Some("mp4")|Some("mov"))}
fn scan_sources(root:&Path)->Result<Vec<ShortsSourceFile>,String>{
 if !root.is_dir(){return Err(format!("Папка Shorts не найдена: {}",root.display()))}
 let mut out=Vec::new();let mut stack=vec![root.to_path_buf()];
 while let Some(dir)=stack.pop(){for entry in fs::read_dir(&dir).map_err(|e|format!("Не удалось прочитать папку {}: {e}",dir.display()))?.filter_map(Result::ok){let ft=match entry.file_type(){Ok(v)=>v,Err(_)=>continue};if ft.is_symlink(){continue}let name=entry.file_name().to_string_lossy().to_string();if name.starts_with('.') {continue}let path=entry.path();if ft.is_dir(){if name.eq_ignore_ascii_case("VYRON Shorts"){continue}stack.push(path);continue}if !ft.is_file()||!supported_source(&path){continue}let size=fs::metadata(&path).map(|m|m.len()).unwrap_or(0);if size==0{continue}out.push(ShortsSourceFile{path:path.to_string_lossy().into_owned(),name,size,extension:path.extension().and_then(|x|x.to_str()).unwrap_or("").to_ascii_lowercase()})}}
 out.sort_by(|a,b|a.path.to_lowercase().cmp(&b.path.to_lowercase()));Ok(out)
}
#[tauri::command]
pub fn shorts_scan_folder(source_folder:String)->Result<Vec<ShortsSourceFile>,String>{scan_sources(Path::new(source_folder.trim()))}
'''
if 'pub struct ShortsSourceFile' not in s:
    if anchor not in s: raise SystemExit('ShortsProbe Rust anchor missing')
    s=s.replace(anchor,insert,1)
old='pub fn shorts_probe_source(source_path:String)->Result<ShortsProbe,String>{let source=Path::new(&source_path);if source.extension().and_then(|x|x.to_str()).map(|x|x.eq_ignore_ascii_case("mp4"))!=Some(true){return Err("Shorts Factory принимает только готовый MP4".into())}let p=probe(source)?;if !p.has_video{return Err("Исходный MP4 не содержит video stream".into())}if !p.has_audio{return Err("Исходный MP4 не содержит audio stream".into())}if p.duration<=0.1{return Err("FFprobe не определил длительность исходного MP4".into())}Ok(p)}'
new='pub fn shorts_probe_source(source_path:String)->Result<ShortsProbe,String>{let source=Path::new(&source_path);if !supported_source(source){return Err("Shorts Factory поддерживает готовые MP4 и MOV".into())}let p=probe(source)?;if !p.has_video{return Err("Исходное видео не содержит video stream".into())}if !p.has_audio{return Err("Исходное видео не содержит audio stream".into())}if p.duration<=0.1{return Err("FFprobe не определил длительность исходного видео".into())}Ok(p)}'
if old not in s: raise SystemExit('MP4-only shorts_probe_source anchor missing')
s=s.replace(old,new,1)
# Add real folder/MOV tests before final tests module close.
needle=' let r=shorts_render_segment(source.to_string_lossy().into_owned(),output.to_string_lossy().into_owned(),2.0,28.0).unwrap();assert_eq!(r.width,1080);assert_eq!(r.height,1920);assert!(r.has_audio);assert!((r.duration-28.0).abs()<1.25);let _=fs::remove_dir_all(&dir);\n}}'
replacement=''' let r=shorts_render_segment(source.to_string_lossy().into_owned(),output.to_string_lossy().into_owned(),2.0,28.0).unwrap();assert_eq!(r.width,1080);assert_eq!(r.height,1920);assert!(r.has_audio);assert!((r.duration-28.0).abs()<1.25);let _=fs::remove_dir_all(&dir);\n}\n#[test]fn folder_scan_accepts_mp4_mov_and_ignores_other_files(){let dir=std::env::temp_dir().join(format!("vyron-shorts-scan-{}",uuid::Uuid::new_v4()));fs::create_dir_all(dir.join("nested")).unwrap();fs::create_dir_all(dir.join("VYRON Shorts")).unwrap();fs::write(dir.join("a.mp4"),b"x").unwrap();fs::write(dir.join("nested/b.mov"),b"x").unwrap();fs::write(dir.join("note.txt"),b"x").unwrap();fs::write(dir.join("VYRON Shorts/old.mp4"),b"x").unwrap();let rows=shorts_scan_folder(dir.to_string_lossy().into_owned()).unwrap();assert_eq!(rows.len(),2);assert!(rows.iter().any(|x|x.extension=="mp4"));assert!(rows.iter().any(|x|x.extension=="mov"));let _=fs::remove_dir_all(dir);}\n#[test]fn real_ffmpeg_mov_fixture_if_enabled(){if std::env::var("VYRON_SHORTS_REAL_TEST").ok().as_deref()!=Some("1"){return}let dir=std::env::temp_dir().join(format!("vyron-shorts-mov-real-{}",std::process::id()));let _=fs::remove_dir_all(&dir);fs::create_dir_all(&dir).unwrap();let source=dir.join("long.mov");let output=dir.join("short.mp4");let st=Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=640x360:rate=30","-f","lavfi","-i","sine=frequency=660:sample_rate=48000","-t","34","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-shortest"]).arg(&source).status().unwrap();assert!(st.success());let before=fs::metadata(&source).unwrap().len();let r=shorts_render_segment(source.to_string_lossy().into_owned(),output.to_string_lossy().into_owned(),1.0,28.0).unwrap();assert_eq!(r.width,1080);assert_eq!(r.height,1920);assert!(r.has_audio);assert!((r.duration-28.0).abs()<1.25);assert_eq!(fs::metadata(&source).unwrap().len(),before);let _=fs::remove_dir_all(&dir);}\n}'''
if 'real_ffmpeg_mov_fixture_if_enabled' not in s:
    if needle not in s: raise SystemExit('Shorts tests tail anchor missing')
    s=s.replace(needle,replacement,1)
p.write_text(s)

# ---------- register new Rust command ----------
p=root/'src-tauri/src/lib.rs';s=p.read_text()
old='shorts_factory::shorts_probe_source,shorts_factory::shorts_validate_file,shorts_factory::shorts_render_segment'
new='shorts_factory::shorts_scan_folder,shorts_factory::shorts_probe_source,shorts_factory::shorts_validate_file,shorts_factory::shorts_render_segment'
if 'shorts_factory::shorts_scan_folder' not in s:
    if old not in s: raise SystemExit('shorts command registration anchor missing')
    s=s.replace(old,new,1)
p.write_text(s)

# ---------- frontend contracts ----------
p=root/'src/v2111ShortsFolder.test.ts';p.write_text(r'''import fs from 'node:fs';import {describe,expect,it} from 'vitest';
describe('VYRON 2.1.1 folder-based Shorts Factory contracts',()=>{
 const ui=fs.readFileSync('src/ShortsFactory.tsx','utf8'),api=fs.readFileSync('src/api.ts','utf8'),rust=fs.readFileSync('src-tauri/src/shorts_factory.rs','utf8'),lib=fs.readFileSync('src-tauri/src/lib.rs','utf8');
 it('uses a user-selected directory and no READY_UPLOAD Production source list',()=>{expect(ui).toContain('ВЫБРАТЬ ПАПКУ С ВИДЕО');expect(ui).toContain('api.shortsScanFolder');expect(ui).not.toContain("jobs.filter(j=>j.channelId===channelId&&j.status==='READY_UPLOAD'")});
 it('supports MP4 and MOV end to end',()=>{expect(api).toContain("invoke<ShortsSourceFile[]>('shorts_scan_folder'");expect(rust).toContain('Some("mp4")|Some("mov")');expect(rust).toContain('real_ffmpeg_mov_fixture_if_enabled');expect(lib).toContain('shorts_factory::shorts_scan_folder')});
 it('writes Shorts outside the source file and never removes/renames source',()=>{expect(ui).toContain('/VYRON Shorts');const render=rust.slice(rust.indexOf('pub fn shorts_render_segment'),rust.indexOf('#[cfg(test)]'));expect(render).not.toContain('remove_file(&source)');expect(render).not.toContain('rename(&source')});
 it('aggregates planning errors instead of one toast per source failure',()=>{expect(ui).toContain('const errors:string[]=[]');expect(ui).toContain('пропущено файлов ${errors.length}')});
});
''')
print('VYRON 2.1.1 folder-based Shorts patch applied')
