#!/usr/bin/env python3
from pathlib import Path
import re

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.13 recovery: '+msg)

# ---- Backend: surface the checkpoint system that already exists -----------------
p=Path('src-tauri/src/production_manager.rs'); s=p.read_text()
old='struct Checkpoint { completed_projects:usize,total_projects:usize,status:String,history_applied:bool,updated_at:String }'
new='''struct Checkpoint { completed_projects:usize,total_projects:usize,status:String,history_applied:bool,updated_at:String }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct RecoveryState {
    pub batch_id:String,pub channel_id:String,pub channel_name:String,pub root_path:String,
    pub completed_projects:usize,pub total_projects:usize,pub current_project:String,pub status:String,pub updated_at:String,pub recoverable:bool
}'''
must(old in s,'Checkpoint struct marker missing');s=s.replace(old,new,1)
# 1.0.12 frontend already supports 10000; remove stale backend-only 1000 ceiling.
must('if req.project_count==0||req.project_count>1000{return Err("Количество проектов должно быть 1–1000".into());}' in s,'legacy 1000 backend cap missing')
s=s.replace('if req.project_count==0||req.project_count>1000{return Err("Количество проектов должно быть 1–1000".into());}','if req.project_count==0||req.project_count>10000{return Err("Количество проектов должно быть 1–10000".into());}',1)

insert=r'''
fn recovery_in_workspace(workspace:&str)->Vec<RecoveryState>{
    let base=PathBuf::from(workspace).join("ProductionManager").join("Batches");
    if !base.is_dir(){return Vec::new();}
    let mut out=Vec::new();
    let channels=match fs::read_dir(&base){Ok(x)=>x,Err(_)=>return out};
    for channel in channels.flatten(){
        if !channel.path().is_dir(){continue;}
        let batches=match fs::read_dir(channel.path()){Ok(x)=>x,Err(_)=>continue};
        for batch in batches.flatten(){
            let broot=batch.path();if !broot.is_dir(){continue;}
            let plan:BuildPlan=read_json(&broot.join("plan.json"));if plan.batch_id.is_empty(){continue;}
            let mut cp:Checkpoint=read_json(&broot.join("checkpoint.json"));
            if cp.total_projects==0{cp.total_projects=plan.projects.len();}
            if matches!(cp.status.as_str(),"Готово"|"Заменено новой сборкой"|"Отменено"){continue;}
            let actual=plan.projects.iter().filter(|p|project_ready(p,&broot.join(&p.project_id))).count();
            if actual!=cp.completed_projects{cp.completed_projects=actual;cp.updated_at=Utc::now().to_rfc3339();let _=atomic_json(&broot.join("checkpoint.json"),&cp);}
            let current=if actual<plan.projects.len(){format!("{:03}",actual+1)}else{"Финализация".into()};
            out.push(RecoveryState{batch_id:plan.batch_id.clone(),channel_id:plan.request.channel_id.clone(),channel_name:plan.request.channel_name.clone(),root_path:broot.to_string_lossy().into_owned(),completed_projects:actual,total_projects:plan.projects.len(),current_project:current,status:cp.status.clone(),updated_at:cp.updated_at.clone(),recoverable:true});
        }
    }
    out
}

#[tauri::command]
pub fn find_production_recovery(workspaces:Vec<String>)->Result<Vec<RecoveryState>,String>{
    let mut seen=HashSet::<String>::new();let mut out=Vec::new();
    for raw in workspaces{let w=raw.trim();if w.is_empty()||!seen.insert(w.to_string()){continue;}out.extend(recovery_in_workspace(w));}
    out.sort_by(|a,b|b.updated_at.cmp(&a.updated_at));Ok(out)
}

#[tauri::command]
pub async fn restart_production_batch(app:AppHandle,manifest_or_root:String)->Result<BatchSummary,String>{
    tauri::async_runtime::spawn_blocking(move||{
        let _g=build_lock().lock().map_err(|_|"Build lock".to_string())?;
        let old_root=if Path::new(&manifest_or_root).is_dir(){PathBuf::from(&manifest_or_root)}else{Path::new(&manifest_or_root).parent().unwrap_or(Path::new(".")).to_path_buf()};
        let old_plan:BuildPlan=read_json(&old_root.join("plan.json"));if old_plan.batch_id.is_empty(){return Err("Не найден план прерванной сборки".into());}
        let mut request=old_plan.request.clone();request.request_id=Uuid::new_v4().to_string();
        let new_plan=plan_build(&request)?;
        let old_cp_path=old_root.join("checkpoint.json");let mut old_cp:Checkpoint=read_json(&old_cp_path);old_cp.status="Заменено новой сборкой".into();old_cp.updated_at=Utc::now().to_rfc3339();atomic_json(&old_cp_path,&old_cp)?;
        execute_plan(Some(&app),&new_plan)
    }).await.map_err(|e|e.to_string())?
}
'''
marker='fn summary_from(m:&BatchManifest,s:&BatchStatus)->BatchSummary{'
must(marker in s,'summary marker missing');s=s.replace(marker,insert+'\n'+marker,1);p.write_text(s)

# ---- Register commands ----------------------------------------------------------
p=Path('src-tauri/src/lib.rs'); s=p.read_text()
old='production_manager::build_production_batch,production_manager::resume_production_batch,production_manager::read_production_batch_status'
new='production_manager::build_production_batch,production_manager::resume_production_batch,production_manager::find_production_recovery,production_manager::restart_production_batch,production_manager::read_production_batch_status'
must(old in s,'lib production command marker missing');s=s.replace(old,new,1);p.write_text(s)

# ---- Frontend API ---------------------------------------------------------------
p=Path('src/productionManagerApi.ts'); s=p.read_text()
marker='export type HandoffReceipt={batchId:string;manifestPath:string;requestPath:string};'
must(marker in s,'productionManagerApi type marker missing')
s=s.replace(marker,marker+"\nexport type RecoveryState={batchId:string;channelId:string;channelName:string;rootPath:string;completedProjects:number;totalProjects:number;currentProject:string;status:string;updatedAt:string;recoverable:boolean};",1)
old="  resume:(manifestOrRoot:string)=>invoke<BatchSummary>('resume_production_batch',{manifestOrRoot}),"
new=old+"\n  findRecovery:(workspaces:string[])=>invoke<RecoveryState[]>('find_production_recovery',{workspaces}),\n  restartRecovery:(manifestOrRoot:string)=>invoke<BatchSummary>('restart_production_batch',{manifestOrRoot}),"
must(old in s,'productionManagerApi resume marker missing');s=s.replace(old,new,1);p.write_text(s)

# ---- Startup recovery UI: 60 sec, default action = CONTINUE --------------------
Path('src/RecoveryGate.tsx').write_text(r'''import React,{useEffect,useMemo,useRef,useState} from 'react';
import {productionManagerApi,type RecoveryState} from './productionManagerApi';
import {readProductionPrefs} from './productionPrefs';
import {useApp} from './store';
import {notifyError,notifyInfo,notifySuccess} from './notificationCenter';

export function RecoveryGate(){
  const booted=useApp(s=>s.booted),workspace=useApp(s=>s.settings.workspace),channels=useApp(s=>s.channels),setPage=useApp(s=>s.setPage);
  const [recovery,setRecovery]=useState<RecoveryState|null>(null),[deadline,setDeadline]=useState<number|null>(null),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[confirmRestart,setConfirmRestart]=useState(false);
  const checked=useRef(false),decided=useRef(false);
  const roots=useMemo(()=>{const p=readProductionPrefs();return [...new Set([workspace,p.productionRoot,...Object.values(p.byChannel||{}).map(x=>x.productionRoot)].filter(Boolean) as string[])]},[workspace,channels.length]);
  useEffect(()=>{if(!booted||checked.current||!roots.length)return;checked.current=true;productionManagerApi.findRecovery(roots).then(rows=>{const first=rows.find(x=>x.recoverable);if(first){decided.current=false;setRecovery(first);setDeadline(Date.now()+60_000);notifyInfo('Предыдущая работа была прервана',`${first.channelName}: готово ${first.completedProjects} / ${first.totalProjects}.`,{operationId:`recovery-found:${first.batchId}`,durationMs:8000})}}).catch(e=>notifyError('Не удалось проверить восстановление',String(e),{operationId:'recovery-scan-error'}))},[booted,roots.join('|')]);
  useEffect(()=>{if(!recovery||deadline===null||confirmRestart)return;const tick=()=>{const t=Date.now();setNow(t);if(t>=deadline&&!decided.current)void resumeNow()};tick();const id=window.setInterval(tick,250);return()=>window.clearInterval(id)},[recovery?.batchId,deadline,confirmRestart]);
  const seconds=deadline===null?0:Math.max(0,Math.ceil((deadline-now)/1000));
  async function resumeNow(){if(!recovery||decided.current)return;decided.current=true;setBusy(true);setDeadline(null);try{const done=await productionManagerApi.resume(recovery.rootPath);notifySuccess('Производство восстановлено',`${done.channelName}: ${done.projectCount} проектов готовы.`,{operationId:`recovery-resumed:${done.batchId}`});setRecovery(null);setPage('production')}catch(e){decided.current=false;setBusy(false);notifyError('Не удалось продолжить производство',String(e),{operationId:`recovery-resume-error:${recovery.batchId}`})}}
  function requestRestart(){if(!recovery||busy)return;setDeadline(null);setConfirmRestart(true)}
  async function restartNow(){if(!recovery||busy)return;decided.current=true;setBusy(true);try{const done=await productionManagerApi.restartRecovery(recovery.rootPath);notifySuccess('Новая сборка создана',`${done.channelName}: ${done.projectCount} проектов. Старая незавершённая сборка сохранена.`,{operationId:`recovery-restarted:${done.batchId}`});setRecovery(null);setPage('production')}catch(e){decided.current=false;setBusy(false);notifyError('Не удалось начать новую сборку',String(e),{operationId:`recovery-restart-error:${recovery.batchId}`})}}
  if(!recovery)return null;
  return <div className="recoveryOverlay"><section className="recoveryDialog">
    <small>ВОССТАНОВЛЕНИЕ VYRON</small><h2>Производство было прервано</h2><h3>{recovery.channelName}</h3>
    <div className="recoveryFacts"><span>Уже готово<b>{recovery.completedProjects} / {recovery.totalProjects}</b></span><span>Текущий проект<b>{recovery.currentProject==='Финализация'?recovery.currentProject:`VIDEO_${recovery.currentProject}`}</b></span></div>
    {!confirmRestart?<><p>Можно продолжить с последнего подтверждённого checkpoint. Готовые проекты не будут пересоздаваться.</p><div className="recoveryCountdown"><small>Автоматическое продолжение через</small><b>{seconds}</b><span>сек.</span></div><footer><button className="primary" disabled={busy} onClick={()=>void resumeNow()}>{busy?'ВОССТАНАВЛИВАЮ…':'ПРОДОЛЖИТЬ'}</button><button disabled={busy} onClick={requestRestart}>НАЧАТЬ ЗАНОВО</button></footer></>:<><div className="recoveryWarning"><b>Начать новую сборку?</b><p>Уже создано {recovery.completedProjects} проектов. Они не будут удалены. VYRON создаст новый batchId и сохранит старую незавершённую сборку.</p></div><footer><button className="danger" disabled={busy} onClick={()=>void restartNow()}>{busy?'СОЗДАЮ…':'НАЧАТЬ НОВУЮ СБОРКУ'}</button><button disabled={busy} onClick={()=>{setConfirmRestart(false);decided.current=false;setDeadline(Date.now()+60_000)}}>ОТМЕНА</button></footer></>}
  </section></div>
}
''')

# ---- Important Production operations get typed success/error notifications ------
p=Path('src/ProductionManager.tsx'); s=p.read_text()
s=s.replace("import {useApp} from './store';","import {useApp} from './store';\nimport {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';",1)
s=s.replace("toast(next.active?'Сбор изображений запущен. Скачивайте изображения в Downloads.':`Сбор завершён: ${next.collected.length} изображений`);","if(next.active)notifyInfo('Сбор изображений запущен','Скачивайте изображения в Downloads.',{operationId:`collector-start:${next.sessionId}`});else notifySuccess('Изображения собраны',`Собрано ${next.collected.length.toLocaleString('ru-RU')} файлов.`,{operationId:`collector-stop:${next.sessionId}:${next.collected.length}`});",1)
s=s.replace("setMusic(indexed);toast(`Музыкальная библиотека: ${indexed.tracks} треков`);","setMusic(indexed);notifySuccess('Музыкальная библиотека обновлена',`${indexed.tracks.toLocaleString('ru-RU')} треков доступно.`,{operationId:`music-index:${channel.id}:${indexed.indexedAt}`});",1)
s=s.replace("try{const indexed=await productionManagerApi.indexMusic(workspace,channelId);setMusic(indexed);toast(`Библиотека обновлена: ${indexed.tracks} треков`)}","try{const indexed=await productionManagerApi.indexMusic(workspace,channelId);setMusic(indexed);notifySuccess('Музыкальная библиотека обновлена',`${indexed.tracks.toLocaleString('ru-RU')} треков доступно.`,{operationId:`music-reindex:${channelId}:${indexed.indexedAt}`})}",1)
s=s.replace("toast(`Batch готов: ${built.batch.projectCount} проектов • ${built.batch.tracksAssigned} музыкальных назначений`);","notifySuccess('Проекты созданы',`${built.batch.projectCount.toLocaleString('ru-RU')} проектов готовы для ENDLUME.`,{operationId:`batch-built:${built.batch.batchId}`});",1)
s=s.replace("toast(`ENDLUME принял batch ${receipt.batchId}`);await refreshState();","notifySuccess('Передано в ENDLUME',`${batch.projectCount.toLocaleString('ru-RU')} проектов отправлены на рендер.`,{operationId:`endlume-handoff:${receipt.batchId}`});await refreshState();",1)
s=s.replace("if(scope==='global')patchPrefs({productionRoot:path});else patchChannelProductionPrefs(channelId,{productionRoot:path});setStorageStatus(status);toast(scope==='global'?'Основная папка проектов сохранена':'Отдельная папка канала сохранена');","if(scope==='global')patchPrefs({productionRoot:path});else patchChannelProductionPrefs(channelId,{productionRoot:path});setStorageStatus(status);notifySuccess('Папка проектов изменена',path,{operationId:`storage:${scope}:${channelId}:${path}`});",1)
p.write_text(s)

# ---- Recovery CSS ---------------------------------------------------------------
p=Path('src/styles.css'); s=p.read_text();s+=r'''
/* VYRON 1.0.13 — persisted power-loss recovery */
.recoveryOverlay{position:fixed;inset:0;z-index:10030;display:grid;place-items:center;background:rgba(1,7,12,.68);backdrop-filter:blur(7px);padding:20px}.recoveryDialog{width:min(560px,calc(100vw - 34px));border:1px solid #24485e;background:#081723;border-radius:18px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.45)}.recoveryDialog>small{color:#58d9ff;font-size:8px;letter-spacing:.16em;font-weight:900}.recoveryDialog h2{margin:6px 0 2px;font-size:24px}.recoveryDialog h3{margin:0 0 16px;color:#86a7ba;font-size:13px}.recoveryDialog>p{color:#819cac;font-size:11px;line-height:1.55}.recoveryFacts{display:grid;grid-template-columns:1fr 1fr;gap:9px}.recoveryFacts span{border:1px solid #17364a;background:#07131d;border-radius:11px;padding:11px;color:#718d9e;font-size:9px}.recoveryFacts b{display:block;margin-top:4px;color:#e5f4fa;font-size:16px}.recoveryCountdown{display:flex;align-items:baseline;justify-content:center;gap:8px;margin:22px 0}.recoveryCountdown small{color:#7895a6}.recoveryCountdown b{font-size:48px;color:#65e0c0;line-height:1}.recoveryCountdown span{color:#7895a6}.recoveryDialog footer{display:flex;gap:9px;justify-content:flex-end}.recoveryWarning{border:1px solid rgba(255,181,80,.32);background:rgba(255,181,80,.045);border-radius:12px;padding:14px;margin:16px 0}.recoveryWarning b{color:#ffc068}.recoveryWarning p{color:#8da0aa;font-size:10px;line-height:1.5}.recoveryDialog .danger{border-color:rgba(255,105,124,.5);color:#ff8a9c}
@media(max-width:600px){.recoveryFacts{grid-template-columns:1fr}.recoveryDialog footer{flex-direction:column}.recoveryDialog footer button{width:100%}}
''';p.write_text(s)

# ---- Rust regression: interrupted temp + persisted checkpoint -------------------
p=Path('src-tauri/src/production_manager_tests.rs'); s=p.read_text();s+=r'''

#[test]
fn acceptance_power_loss_checkpoint_is_detected_and_resumes_without_duplicates(){
    let(ws,cid,name)=fixture(6,50);let plan=plan_build(&request(&ws,&cid,&name,6,10,"even",false)).unwrap();let root=PathBuf::from(&plan.batch_root);
    let first=&plan.projects[0];let d=root.join(&first.project_id);fs::create_dir_all(&d).unwrap();fs::copy(&first.image_source,d.join(&first.image_name)).unwrap();for t in &first.tracks{fs::copy(&t.source,d.join(&t.dest_name)).unwrap();}
    let cp_path=root.join("checkpoint.json");let mut cp:Checkpoint=read_json(&cp_path);cp.completed_projects=1;cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp).unwrap();
    let partial=root.join(".002.tmp");fs::create_dir_all(&partial).unwrap();fs::write(partial.join("broken.mp3"),b"partial").unwrap();
    let rows=find_production_recovery(vec![ws.to_string_lossy().into_owned()]).unwrap();assert_eq!(rows.len(),1);assert_eq!(rows[0].completed_projects,1);assert_eq!(rows[0].current_project,"002");
    let done=execute_plan(None,&plan).unwrap();assert_eq!(done.project_count,6);assert!(!partial.exists());assert!(project_ready(first,&d));
    assert!(find_production_recovery(vec![ws.to_string_lossy().into_owned()]).unwrap().is_empty());cleanup(&ws);
}

#[test]
fn acceptance_recovery_scan_never_creates_missing_external_mount(){
    let missing=std::env::temp_dir().join(format!("vyron-missing-recovery-{}",Uuid::new_v4())).join("not-mounted");assert!(!missing.exists());
    let rows=find_production_recovery(vec![missing.to_string_lossy().into_owned()]).unwrap();assert!(rows.is_empty());assert!(!missing.exists());
}
''';p.write_text(s)

print('VYRON 1.0.13 recovery patch applied')
