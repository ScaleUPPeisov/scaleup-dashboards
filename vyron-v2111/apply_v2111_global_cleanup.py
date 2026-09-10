#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# ---------- productionManagerApi ----------
p=root/'src/productionManagerApi.ts';s=p.read_text()
anchor='export type CleanupResult={eligibleProjects:number;cleanedProjects:number;removedFiles:number;freedBytes:number;skippedProjects:number};'
insert=anchor+'''\nexport type GlobalProjectCleanupPreview={scannedChannels:number;foundProjects:number;eligibleProjects:number;skippedProjects:number;protectedRenders:number;estimatedBytes:number;errors:string[]};\nexport type GlobalProjectCleanupResult={scannedChannels:number;foundProjects:number;deletedProjects:number;failedProjects:number;skippedProjects:number;protectedRenders:number;bytesFreed:number;deletedJobIds:string[];errors:string[]};'''
if 'export type GlobalProjectCleanupPreview=' not in s:
    if anchor not in s: raise SystemExit('CleanupResult type anchor missing')
    s=s.replace(anchor,insert,1)
anchor="  cleanupCompletedAssets:(manifestPath:string)=>invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath}),"
insert=anchor+"\n  previewGlobalProjectCleanup:(workspaces:string[])=>invoke<GlobalProjectCleanupPreview>('preview_global_production_project_cleanup',{workspaces}),\n  executeGlobalProjectCleanup:(workspaces:string[],confirmed:boolean)=>invoke<GlobalProjectCleanupResult>('execute_global_production_project_cleanup',{workspaces,confirmed}),"
if 'previewGlobalProjectCleanup:' not in s:
    if anchor not in s: raise SystemExit('cleanupCompletedAssets api anchor missing')
    s=s.replace(anchor,insert,1)
p.write_text(s)

# ---------- Rust production_manager global safe cleanup ----------
p=root/'src-tauri/src/production_manager.rs';s=p.read_text()
anchor='pub fn cleanup_completed_production_assets(manifest_path:String)->Result<CleanupResult,String>{let(m,_)=load_manifest(&manifest_path)?;let st:BatchStatus=read_json(Path::new(&m.status_path));cleanup_completed_assets(&m,&st)}'
block=r'''
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct GlobalProjectCleanupPreview { pub scanned_channels:usize,pub found_projects:usize,pub eligible_projects:usize,pub skipped_projects:usize,pub protected_renders:usize,pub estimated_bytes:u64,pub errors:Vec<String> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct GlobalProjectCleanupResult { pub scanned_channels:usize,pub found_projects:usize,pub deleted_projects:usize,pub failed_projects:usize,pub skipped_projects:usize,pub protected_renders:usize,pub bytes_freed:u64,pub deleted_job_ids:Vec<String>,pub errors:Vec<String> }
#[derive(Clone,Debug)]
struct GlobalCleanupCandidate { folder:PathBuf,bytes:u64,job_id:Option<String>,label:String }
fn directory_bytes(path:&Path)->u64{let mut total=0u64;let mut stack=vec![path.to_path_buf()];while let Some(dir)=stack.pop(){if let Ok(rd)=fs::read_dir(dir){for e in rd.flatten(){let ft=match e.file_type(){Ok(v)=>v,Err(_)=>continue};if ft.is_symlink(){continue}if ft.is_dir(){stack.push(e.path())}else if ft.is_file(){total=total.saturating_add(e.metadata().map(|m|m.len()).unwrap_or(0))}}}}total}
fn global_manifest_paths(workspaces:&[String])->Vec<PathBuf>{let mut out=Vec::new();let mut seen=HashSet::new();for raw in workspaces{let w=raw.trim();if w.is_empty(){continue}let base=PathBuf::from(w).join("ProductionManager").join("Batches");if !base.is_dir(){continue}let channels=match fs::read_dir(&base){Ok(x)=>x,Err(_)=>continue};for ch in channels.flatten(){if !ch.file_type().map(|x|x.is_dir()).unwrap_or(false){continue}let batches=match fs::read_dir(ch.path()){Ok(x)=>x,Err(_)=>continue};for b in batches.flatten(){if !b.file_type().map(|x|x.is_dir()).unwrap_or(false){continue}let m=b.path().join("batch.json");if m.is_file(){let key=m.to_string_lossy().into_owned();if seen.insert(key){out.push(m)}}}}}out}
fn collect_global_cleanup(workspaces:&[String])->(GlobalProjectCleanupPreview,Vec<GlobalCleanupCandidate>){let mut preview=GlobalProjectCleanupPreview::default();let mut candidates=Vec::new();let mut channels=HashSet::new();let mut folders=HashSet::new();for mp in global_manifest_paths(workspaces){let (m,_)=match load_manifest(mp.to_string_lossy().as_ref()){Ok(x)=>x,Err(e)=>{preview.errors.push(format!("{}: {e}",mp.display()));continue}};channels.insert(m.channel_id.clone());let status:BatchStatus=read_json(Path::new(&m.status_path));let batch_root=PathBuf::from(&m.root_path);let root_can=match batch_root.canonicalize(){Ok(x)=>x,Err(e)=>{preview.errors.push(format!("{}: batch root недоступен: {e}",m.batch_id));continue}};let rendered=batch_root.join("Rendered");let rendered_can=rendered.canonicalize().ok();for project in &m.projects{preview.found_projects+=1;let folder=PathBuf::from(&project.folder_path);if !folder.is_dir(){preview.skipped_projects+=1;continue}let row=match status.projects.iter().find(|x|x.project_id==project.project_id){Some(x)=>x,None=>{preview.skipped_projects+=1;continue}};if row.render_status!="Completed"{preview.skipped_projects+=1;continue}let output=match row.output_file.as_deref(){Some(x) if !x.trim().is_empty()=>PathBuf::from(x),_=>{preview.skipped_projects+=1;continue}};let output_meta=match fs::metadata(&output){Ok(x) if x.is_file()&&x.len()>0=>x,_=>{preview.skipped_projects+=1;continue}};let folder_can=match folder.canonicalize(){Ok(x)=>x,Err(_)=>{preview.skipped_projects+=1;continue}};let output_can=match output.canonicalize(){Ok(x)=>x,Err(_)=>{preview.skipped_projects+=1;continue}};let under_rendered=rendered_can.as_ref().map(|r|output_can.starts_with(r)).unwrap_or(false);let safe_folder=folder_can.starts_with(&root_can)&&folder_can!=root_can&&!rendered_can.as_ref().map(|r|folder_can.starts_with(r)).unwrap_or(false);let separate_render=!output_can.starts_with(&folder_can);if !safe_folder||!under_rendered||!separate_render{preview.skipped_projects+=1;continue}preview.protected_renders+=1;let key=folder_can.to_string_lossy().into_owned();if !folders.insert(key){continue}let bytes=directory_bytes(&folder_can);preview.eligible_projects+=1;preview.estimated_bytes=preview.estimated_bytes.saturating_add(bytes);candidates.push(GlobalCleanupCandidate{folder:folder_can,bytes,job_id:project.job_id.clone(),label:format!("{} / {} / {}",m.channel_name,m.batch_id,project.project_id)});let _=&output_meta;}}
 preview.scanned_channels=channels.len();(preview,candidates)}
#[tauri::command]
pub fn preview_global_production_project_cleanup(workspaces:Vec<String>)->Result<GlobalProjectCleanupPreview,String>{Ok(collect_global_cleanup(&workspaces).0)}
fn execute_global_cleanup_with<F>(workspaces:&[String],confirmed:bool,mut delete:F)->Result<GlobalProjectCleanupResult,String> where F:FnMut(&Path)->Result<(),String>{if !confirmed{return Err("Требуется явное подтверждение удаления PROJECT-папок".into())}let (preview,candidates)=collect_global_cleanup(workspaces);let mut result=GlobalProjectCleanupResult{scanned_channels:preview.scanned_channels,found_projects:preview.found_projects,skipped_projects:preview.skipped_projects,protected_renders:preview.protected_renders,errors:preview.errors,..Default::default()};for c in candidates{match delete(&c.folder){Ok(_)=>{result.deleted_projects+=1;result.bytes_freed=result.bytes_freed.saturating_add(c.bytes);if let Some(id)=c.job_id{if !result.deleted_job_ids.contains(&id){result.deleted_job_ids.push(id)}}},Err(e)=>{result.failed_projects+=1;result.errors.push(format!("{}: {e}",c.label))}}}Ok(result)}
#[tauri::command]
pub fn execute_global_production_project_cleanup(workspaces:Vec<String>,confirmed:bool)->Result<GlobalProjectCleanupResult,String>{execute_global_cleanup_with(&workspaces,confirmed,|path|trash::delete(path).map_err(|e|format!("Не удалось переместить PROJECT-папку в Корзину: {e}")))}
'''
if 'pub struct GlobalProjectCleanupPreview' not in s:
    if anchor not in s: raise SystemExit('cleanup command anchor missing')
    s=s.replace(anchor,anchor+'\n'+block,1)
# add unit tests before existing archive function, after new functions.
test_anchor='#[tauri::command]\npub fn archive_production_rendered_videos'
tests=r'''
#[cfg(test)]
mod v2111_global_project_cleanup_tests{
 use super::*;
 fn fixture()->(PathBuf,PathBuf,PathBuf){let workspace=std::env::temp_dir().join(format!("vyron-global-cleanup-{}",Uuid::new_v4()));let batch=workspace.join("ProductionManager/Batches/channel/batch-1");let project=batch.join("001");let rendered=batch.join("Rendered");fs::create_dir_all(&project).unwrap();fs::create_dir_all(&rendered).unwrap();fs::write(project.join("image.jpg"),vec![1u8;4096]).unwrap();fs::write(project.join("track.mp3"),vec![2u8;8192]).unwrap();let output=rendered.join("001.mp4");fs::write(&output,vec![3u8;2048]).unwrap();let status_path=batch.join("status.json");let manifest=BatchManifest{schema_version:SCHEMA_VERSION,source:"test".into(),batch_id:"batch-1".into(),channel_id:"channel".into(),channel_name:"Channel".into(),root_path:batch.to_string_lossy().into_owned(),output_dir:rendered.to_string_lossy().into_owned(),status_path:status_path.to_string_lossy().into_owned(),projects:vec![ManifestProject{project_id:"001".into(),job_id:Some("job-001".into()),folder_path:project.to_string_lossy().into_owned(),image_path:project.join("image.jpg").to_string_lossy().into_owned(),..Default::default()}],project_count:1,..Default::default()};let status=BatchStatus{batch_id:"batch-1".into(),projects:vec![BatchProjectStatus{project_id:"001".into(),job_id:Some("job-001".into()),render_status:"Completed".into(),output_file:Some(output.to_string_lossy().into_owned()),..Default::default()}],..Default::default()};atomic_json(&batch.join("batch.json"),&manifest).unwrap();atomic_json(&status_path,&status).unwrap();(workspace,project,output)}
 #[test]fn preview_is_global_and_protects_render(){let (workspace,project,output)=fixture();let p=preview_global_production_project_cleanup(vec![workspace.to_string_lossy().into_owned()]).unwrap();assert_eq!(p.scanned_channels,1);assert_eq!(p.found_projects,1);assert_eq!(p.eligible_projects,1);assert_eq!(p.protected_renders,1);assert!(p.estimated_bytes>=12288);assert!(project.exists()&&output.exists());let _=fs::remove_dir_all(workspace);}
 #[test]fn execute_requires_backend_confirmation(){let (workspace,project,output)=fixture();let e=execute_global_cleanup_with(&[workspace.to_string_lossy().into_owned()],false,|p|fs::remove_dir_all(p).map_err(|e|e.to_string())).unwrap_err();assert!(e.contains("подтверждение"));assert!(project.exists()&&output.exists());let _=fs::remove_dir_all(workspace);}
 #[test]fn execute_removes_only_project_folder_and_preserves_render(){let (workspace,project,output)=fixture();let r=execute_global_cleanup_with(&[workspace.to_string_lossy().into_owned()],true,|p|fs::remove_dir_all(p).map_err(|e|e.to_string())).unwrap();assert_eq!(r.deleted_projects,1);assert_eq!(r.failed_projects,0);assert_eq!(r.deleted_job_ids,vec!["job-001"]);assert!(!project.exists());assert!(output.exists());let _=fs::remove_dir_all(workspace);}
 #[test]fn incomplete_project_is_skipped(){let (workspace,project,output)=fixture();let status_path=workspace.join("ProductionManager/Batches/channel/batch-1/status.json");let mut st:BatchStatus=read_json(&status_path);st.projects[0].render_status="Rendering".into();atomic_json(&status_path,&st).unwrap();let p=preview_global_production_project_cleanup(vec![workspace.to_string_lossy().into_owned()]).unwrap();assert_eq!(p.eligible_projects,0);assert_eq!(p.skipped_projects,1);assert!(project.exists()&&output.exists());let _=fs::remove_dir_all(workspace);}
}
'''
if 'mod v2111_global_project_cleanup_tests' not in s:
    if test_anchor not in s: raise SystemExit('archive function anchor missing')
    s=s.replace(test_anchor,tests+'\n'+test_anchor,1)
p.write_text(s)

# ---------- register commands ----------
p=root/'src-tauri/src/lib.rs';s=p.read_text()
anchor='production_manager::cleanup_completed_production_assets,production_manager::archive_production_rendered_videos'
replace='production_manager::cleanup_completed_production_assets,production_manager::preview_global_production_project_cleanup,production_manager::execute_global_production_project_cleanup,production_manager::archive_production_rendered_videos'
if 'production_manager::preview_global_production_project_cleanup' not in s:
    if anchor not in s: raise SystemExit('production cleanup registration anchor missing')
    s=s.replace(anchor,replace,1)
p.write_text(s)

# ---------- ProductionOS: one global all-channel button + two-step confirmation ----------
p=root/'src/ProductionOS.tsx';s=p.read_text()
old="import {productionManagerApi,type ProductionStorageStatus} from './productionManagerApi';"
new="import {productionManagerApi,type ProductionStorageStatus,type GlobalProjectCleanupPreview} from './productionManagerApi';\nimport {notifyError,notifySuccess} from './notificationCenter';"
if 'type GlobalProjectCleanupPreview' not in s:
    if old not in s: raise SystemExit('ProductionOS api import anchor missing')
    s=s.replace(old,new,1)
anchor='const [projectStorage,setProjectStorage]=useState<ProductionStorageStatus|null>(null);'
insert=anchor+"const [cleanupPreview,setCleanupPreview]=useState<GlobalProjectCleanupPreview|null>(null),[cleanupPhase,setCleanupPhase]=useState<0|1|2>(0),[cleanupConfirmed,setCleanupConfirmed]=useState(false),[cleanupBusy,setCleanupBusy]=useState(false);"
if 'cleanupPreview,setCleanupPreview' not in s:
    if anchor not in s: raise SystemExit('ProductionOS state anchor missing')
    s=s.replace(anchor,insert,1)
func=r'''
 const globalCleanupRoots=()=>[settings.workspace,prefs.productionRoot,...Object.values(prefs.byChannel||{}).map(x=>x.productionRoot)].map(x=>(x||'').trim()).filter((x,i,a)=>Boolean(x)&&a.indexOf(x)===i);
 async function beginGlobalProjectCleanup(){const roots=globalCleanupRoots();if(!roots.length){toast('Нет настроенных Production workspace для очистки');return}setCleanupBusy(true);try{const preview=await productionManagerApi.previewGlobalProjectCleanup(roots);if(!preview.eligibleProjects){toast(`PROJECT-папок для безопасного удаления нет • пропущено ${preview.skippedProjects}`);return}setCleanupPreview(preview);setCleanupConfirmed(false);setCleanupPhase(1)}catch(e){notifyError('Не удалось проверить PROJECT-папки',String(e),{operationId:`global-project-cleanup-preview:${Date.now()}`})}finally{setCleanupBusy(false)}}
 async function executeGlobalProjectCleanup(){if(!cleanupPreview||!cleanupConfirmed)return;const roots=globalCleanupRoots();setCleanupBusy(true);try{const r=await productionManagerApi.executeGlobalProjectCleanup(roots,true);if(r.deletedJobIds.length)setJobs(useApp.getState().jobs.filter(j=>!r.deletedJobIds.includes(j.id)));setCleanupPhase(0);setCleanupPreview(null);setCleanupConfirmed(false);notifySuccess('PROJECT-папки очищены',`Все каналы • удалено ${r.deletedProjects} • освобождено ${(r.bytesFreed/1024/1024/1024).toFixed(2)} GB • готовые рендеры защищены: ${r.protectedRenders}.`,{operationId:`global-project-cleanup:${Date.now()}`});if(r.errors.length)notifyError('Не все PROJECT-папки удалены',`${r.failedProjects} ошибок. ${r.errors.slice(0,12).join(' | ')}`,{operationId:`global-project-cleanup-errors:${Date.now()}`})}catch(e){notifyError('Глобальная очистка PROJECT-папок не выполнена',String(e),{operationId:`global-project-cleanup-failed:${Date.now()}`})}finally{setCleanupBusy(false)}}
'''
if 'beginGlobalProjectCleanup' not in s:
    anchor=' return <>\n'
    if anchor not in s: raise SystemExit('ProductionOS return anchor missing')
    s=s.replace(anchor,func+anchor,1)
# Add global button to page header.
old='<div className="headerActions"><button disabled={busy} onClick={refreshAll}>{busy?\'Проверяю…\':\'↻ Обновить статусы\'}</button><button onClick={maintainBuffer}>Поддержать буфер</button><button className="primary compactAction" onClick={()=>setPlanOpen(true)}>+ Создать проекты</button></div>'
new='<div className="headerActions"><button disabled={busy} onClick={refreshAll}>{busy?\'Проверяю…\':\'↻ Обновить статусы\'}</button><button onClick={maintainBuffer}>Поддержать буфер</button><button className="danger" disabled={cleanupBusy} onClick={()=>void beginGlobalProjectCleanup()}>{cleanupBusy?\'ПРОВЕРЯЮ…\':\'ОЧИСТИТЬ PROJECT-ПАПКИ ВСЕХ КАНАЛОВ\'}</button><button className="primary compactAction" onClick={()=>setPlanOpen(true)}>+ Создать проекты</button></div>'
if 'ОЧИСТИТЬ PROJECT-ПАПКИ ВСЕХ КАНАЛОВ' not in s:
    if old not in s: raise SystemExit('ProductionOS header actions anchor missing')
    s=s.replace(old,new,1)
modal=r'''
   {cleanupPreview&&cleanupPhase===1&&<div className="modalBackdrop" onMouseDown={()=>setCleanupPhase(0)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>GLOBAL PROJECT CLEANUP • PREVIEW</small><h2>Очистить PROJECT-папки всех каналов?</h2><p>VYRON нашёл только manifest-подтверждённые рабочие PROJECT-папки, у которых готовый render уже существует отдельно в папке Rendered.</p><div className="pmChecklist"><span>Каналов<b>{cleanupPreview.scannedChannels}</b></span><span>Найдено проектов<b>{cleanupPreview.foundProjects}</b></span><span>К удалению<b>{cleanupPreview.eligibleProjects}</b></span><span>Пропущено<b>{cleanupPreview.skippedProjects}</b></span><span>Рендеров защищено<b>{cleanupPreview.protectedRenders}</b></span></div><div className="cacheNotice"><b>БУДЕТ ОСВОБОЖДЕНО</b><span>{(cleanupPreview.estimatedBytes/1024/1024/1024).toFixed(2)} GB</span></div><div className="cacheNotice"><b>ГОТОВЫЕ ВИДЕО НЕ УДАЛЯЮТСЯ</b><span>Rendered, Ready Videos, Shorts, исходники, музыка, metadata, OAuth и настройки не входят в очистку.</span></div><footer><button onClick={()=>{setCleanupPhase(0);setCleanupPreview(null)}}>ОТМЕНА</button><button className="primary" onClick={()=>{setCleanupConfirmed(false);setCleanupPhase(2)}}>ПРОДОЛЖИТЬ</button></footer></section></div>}
   {cleanupPreview&&cleanupPhase===2&&<div className="modalBackdrop" onMouseDown={()=>setCleanupPhase(1)}><section className="confirmModal" onMouseDown={e=>e.stopPropagation()}><small>FINAL CONFIRMATION</small><h2>Подтвердить удаление PROJECT-папок?</h2><p>Будет перемещено в Корзину: <b>{cleanupPreview.eligibleProjects}</b> проектных папок. Готовые рендеры сохраняются.</p><label className="pmJobCheck"><input type="checkbox" checked={cleanupConfirmed} onChange={e=>setCleanupConfirmed(e.target.checked)}/><span>Я понимаю, что проектные папки будут удалены.</span></label><footer><button disabled={cleanupBusy} onClick={()=>setCleanupPhase(1)}>НАЗАД</button><button className="danger" disabled={!cleanupConfirmed||cleanupBusy} onClick={()=>void executeGlobalProjectCleanup()}>{cleanupBusy?'УДАЛЯЮ…':'УДАЛИТЬ PROJECT-ПАПКИ'}</button></footer></section></div>}
'''
if 'GLOBAL PROJECT CLEANUP • PREVIEW' not in s:
    anchor='   {futureOpen&&'
    if anchor not in s: raise SystemExit('ProductionOS modal anchor missing')
    s=s.replace(anchor,modal+anchor,1)
p.write_text(s)

# ---------- contracts ----------
p=root/'src/v2111GlobalCleanup.test.ts';p.write_text(r'''import fs from 'node:fs';import {describe,expect,it} from 'vitest';
describe('VYRON 2.1.1 global project cleanup contracts',()=>{
 const ui=fs.readFileSync('src/ProductionOS.tsx','utf8'),api=fs.readFileSync('src/productionManagerApi.ts','utf8'),rust=fs.readFileSync('src-tauri/src/production_manager.rs','utf8'),lib=fs.readFileSync('src-tauri/src/lib.rs','utf8');
 it('is global and does not depend on active channel',()=>{expect(ui).toContain('ОЧИСТИТЬ PROJECT-ПАПКИ ВСЕХ КАНАЛОВ');expect(ui).toContain('Object.values(prefs.byChannel||{})');expect(api).toContain("preview_global_production_project_cleanup");expect(api).toContain("execute_global_production_project_cleanup")});
 it('requires two UI phases plus explicit checkbox and backend confirmation',()=>{expect(ui).toContain('cleanupPhase===1');expect(ui).toContain('cleanupPhase===2');expect(ui).toContain('cleanupConfirmed');expect(ui).toContain('Я понимаю, что проектные папки будут удалены');expect(rust).toContain('Требуется явное подтверждение удаления PROJECT-папок')});
 it('protects Rendered output and moves only manifest-known project folder to Trash',()=>{expect(rust).toContain('let rendered=batch_root.join("Rendered")');expect(rust).toContain('under_rendered');expect(rust).toContain('separate_render');expect(rust).toContain('trash::delete(path)');expect(rust).not.toContain('trash::delete(&batch_root)')});
 it('commands are registered exactly in the existing Tauri handler',()=>{expect(lib).toContain('production_manager::preview_global_production_project_cleanup');expect(lib).toContain('production_manager::execute_global_production_project_cleanup')});
});
''')
print('VYRON 2.1.1 global PROJECT cleanup patch applied')
