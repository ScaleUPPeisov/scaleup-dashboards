use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read,Write},
    path::{Component, Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};
use sha2::{Digest,Sha256};
use uuid::Uuid;

pub const RECOVERY_SCHEMA_VERSION:u32=1;
const MAX_DIAGNOSTIC_SESSIONS:usize=20;

#[derive(Clone,Debug,Serialize,Deserialize,Default,PartialEq,Eq)]
#[serde(rename_all="camelCase")]
pub struct RecoveryVolumeIdentity{
    pub external:bool,
    pub volume_name:Option<String>,
    pub volume_uuid:Option<String>,
    pub mount_path:Option<String>,
}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct RecoveryFileEvidence{
    pub project_id:String,
    pub path:String,
    pub size:u64,
    pub modified_ms:u64,
    pub sha256:Option<String>,
    pub volume:Option<RecoveryVolumeIdentity>,
    pub volume_relative_path:Option<String>,
}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct RecoveryUiContext{
    pub page:Option<String>,
    pub channel_id:Option<String>,
    pub production_tab:Option<String>,
    pub selected_batch_id:Option<String>,
    pub selected_project_ids:Vec<String>,
    pub filter:Option<String>,
}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ProductionRecoverySeed{
    pub recovery_session_id:String,
    pub batch_id:String,
    pub channel_id:String,
    pub channel_name:String,
    pub root_path:String,
    pub project_ids:Vec<String>,
    pub job_ids:Vec<String>,
    pub source_paths:Vec<(String,String)>,
    pub destination_paths:Vec<String>,
    pub total_projects:usize,
    pub ui_context:Option<RecoveryUiContext>,
}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct RecoveryJournalSession{
    pub recovery_schema_version:u32,
    pub recovery_session_id:String,
    pub operation_type:String,
    pub state:String,
    pub batch_id:String,
    pub channel_id:String,
    pub channel_name:String,
    pub root_path:String,
    pub project_ids:Vec<String>,
    pub job_ids:Vec<String>,
    pub source_evidence:Vec<RecoveryFileEvidence>,
    pub destination_paths:Vec<String>,
    pub current_step:String,
    pub completed_steps:Vec<String>,
    pub created_at:String,
    pub updated_at:String,
    pub progress:f64,
    pub total_projects:usize,
    pub completed_projects:usize,
    pub last_checkpoint:String,
    pub external_volume:Option<RecoveryVolumeIdentity>,
    pub safe_resume_strategy:String,
    pub ui_context:Option<RecoveryUiContext>,
    pub dismissed_at:Option<String>,
    pub completed_at:Option<String>,
    pub last_error:Option<String>,
}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct RecoveryCandidate{
    pub recovery_schema_version:u32,
    pub recovery_session_id:String,
    pub operation_type:String,
    pub state:String,
    pub batch_id:String,
    pub channel_id:String,
    pub channel_name:String,
    pub root_path:String,
    pub resolved_root_path:Option<String>,
    pub completed_projects:usize,
    pub total_projects:usize,
    pub progress:f64,
    pub last_checkpoint:String,
    pub updated_at:String,
    pub safe_to_resume:bool,
    pub wait_reason:Option<String>,
    pub required_volume_name:Option<String>,
    pub dismissed:bool,
    pub previous_session_ended_cleanly:bool,
    pub schema_compatible:bool,
    pub ui_context:Option<RecoveryUiContext>,
}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct RuntimeMarker{
    runtime_session_id:String,
    started_at:String,
    updated_at:String,
    clean_shutdown:bool,
}

fn recovery_dir(app:&AppHandle)->Result<PathBuf,String>{
    let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("recovery");
    fs::create_dir_all(&dir).map_err(|e|format!("recovery mkdir: {e}"))?;
    Ok(dir)
}
fn sessions_dir(app:&AppHandle)->Result<PathBuf,String>{
    let dir=recovery_dir(app)?.join("sessions");
    fs::create_dir_all(&dir).map_err(|e|format!("recovery sessions mkdir: {e}"))?;
    Ok(dir)
}
fn session_path(app:&AppHandle,id:&str)->Result<PathBuf,String>{Ok(sessions_dir(app)?.join(format!("{id}.json")))}
fn runtime_path(app:&AppHandle)->Result<PathBuf,String>{Ok(recovery_dir(app)?.join("runtime.json"))}
fn boot_path(app:&AppHandle)->Result<PathBuf,String>{Ok(recovery_dir(app)?.join("boot.json"))}

fn durable_atomic_json<T:Serialize>(path:&Path,value:&T)->Result<(),String>{
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|e.to_string())?}
    let tmp=path.with_extension(format!("{}.tmp",Uuid::new_v4()));
    let bytes=serde_json::to_vec_pretty(value).map_err(|e|e.to_string())?;
    let mut f=OpenOptions::new().create_new(true).write(true).open(&tmp).map_err(|e|e.to_string())?;
    f.write_all(&bytes).map_err(|e|e.to_string())?;
    f.sync_all().map_err(|e|e.to_string())?;
    drop(f);
    #[cfg(target_os="windows")]
    if path.exists(){fs::remove_file(path).map_err(|e|e.to_string())?;}
    fs::rename(&tmp,path).map_err(|e|e.to_string())?;
    #[cfg(unix)]
    if let Some(parent)=path.parent(){if let Ok(dir)=File::open(parent){let _=dir.sync_all();}}
    Ok(())
}
fn read_json<T:for<'de>Deserialize<'de>+Default>(path:&Path)->T{
    fs::read(path).ok().and_then(|b|serde_json::from_slice(&b).ok()).unwrap_or_default()
}
fn modified_ms(meta:&fs::Metadata)->u64{
    use std::time::UNIX_EPOCH;
    meta.modified().ok().and_then(|t|t.duration_since(UNIX_EPOCH).ok()).map(|d|d.as_millis() as u64).unwrap_or(0)
}
fn external_mount_root(path:&Path)->Option<PathBuf>{
    let parts=path.components().collect::<Vec<_>>();
    if parts.len()<3{return None}
    if parts[0]!=Component::RootDir{return None}
    let a=parts[1].as_os_str().to_string_lossy();
    if a!="Volumes"{return None}
    let name=parts[2].as_os_str();
    Some(PathBuf::from("/Volumes").join(name))
}
fn parse_diskutil_info(text:&str,mount:&Path)->RecoveryVolumeIdentity{
    let field=|name:&str|text.lines().find_map(|line|{
        let (k,v)=line.split_once(':')?;
        (k.trim()==name).then(||v.trim().to_string())
    }).filter(|x|!x.is_empty()&&x!="Not applicable");
    RecoveryVolumeIdentity{
        external:true,
        volume_name:field("Volume Name").or_else(||mount.file_name().map(|x|x.to_string_lossy().into_owned())),
        volume_uuid:field("Volume UUID").or_else(||field("Disk / Partition UUID")),
        mount_path:Some(mount.to_string_lossy().into_owned()),
    }
}
fn volume_identity_for_path(path:&Path)->RecoveryVolumeIdentity{
    let Some(mount)=external_mount_root(path) else{return RecoveryVolumeIdentity{external:false,..Default::default()}};
    #[cfg(target_os="macos")]
    {
        if let Ok(out)=Command::new("diskutil").arg("info").arg(&mount).output(){
            if out.status.success(){return parse_diskutil_info(&String::from_utf8_lossy(&out.stdout),&mount)}
        }
    }
    RecoveryVolumeIdentity{external:true,volume_name:mount.file_name().map(|x|x.to_string_lossy().into_owned()),volume_uuid:None,mount_path:Some(mount.to_string_lossy().into_owned())}
}
fn volume_identity_matches(expected:&RecoveryVolumeIdentity,actual:&RecoveryVolumeIdentity)->bool{
    if !expected.external{return !actual.external}
    if !actual.external{return false}
    match(expected.volume_uuid.as_deref(),actual.volume_uuid.as_deref()){
        (Some(a),Some(b))=>a.eq_ignore_ascii_case(b),
        (Some(_),None)=>false,
        _=>expected.volume_name.as_deref().is_some()&&expected.volume_name==actual.volume_name,
    }
}
fn relative_to_volume(path:&Path,volume:&RecoveryVolumeIdentity)->Option<String>{
    let mount=PathBuf::from(volume.mount_path.as_deref()?);
    path.strip_prefix(mount).ok().map(|p|p.to_string_lossy().trim_start_matches('/').to_string())
}
fn mounted_volumes()->Vec<(PathBuf,RecoveryVolumeIdentity)>{
    let mut out=Vec::new();
    let Ok(rd)=fs::read_dir("/Volumes") else{return out};
    for e in rd.flatten(){
        if !e.path().is_dir(){continue}
        let id=volume_identity_for_path(&e.path());
        if id.external{out.push((e.path(),id))}
    }
    out
}
fn resolve_external_path(original:&str,expected:&RecoveryVolumeIdentity,relative:Option<&str>)->Result<PathBuf,String>{
    if !expected.external{return Ok(PathBuf::from(original))}
    let mut wrong_volume_at_original_mount=false;
    if let Some(mount)=expected.mount_path.as_deref(){
        let m=PathBuf::from(mount);
        if m.exists(){
            let actual=volume_identity_for_path(&m);
            if volume_identity_matches(expected,&actual){
                return Ok(relative.map(|r|m.join(r)).unwrap_or_else(||PathBuf::from(original)))
            }
            wrong_volume_at_original_mount=expected.volume_uuid.is_some();
        }
    }
    for (mount,actual) in mounted_volumes(){
        if volume_identity_matches(expected,&actual){
            return Ok(relative.map(|r|mount.join(r)).unwrap_or(mount))
        }
    }
    if wrong_volume_at_original_mount{Err("WRONG_VOLUME".into())}else{Err("DRIVE_MISSING".into())}
}
fn small_image_sha256(path:&Path,size:u64)->Option<String>{
    let ext=path.extension()?.to_string_lossy().to_ascii_lowercase();
    if !matches!(ext.as_str(),"jpg"|"jpeg"|"png"|"webp"|"avif"|"heic")||size>64*1024*1024{return None}
    let mut f=File::open(path).ok()?;
    let mut h=Sha256::new();
    let mut buf=[0u8;1024*1024];
    loop{let n=f.read(&mut buf).ok()?;if n==0{break}h.update(&buf[..n]);}
    Some(hex::encode(h.finalize()))
}
fn capture_evidence(project_id:&str,path:&str)->Result<RecoveryFileEvidence,String>{
    let p=PathBuf::from(path);
    let meta=fs::metadata(&p).map_err(|_|format!("SOURCE_MISSING:{path}"))?;
    if !meta.is_file()||meta.len()==0{return Err(format!("SOURCE_INVALID:{path}"))}
    let volume=volume_identity_for_path(&p);
    let rel=if volume.external{relative_to_volume(&p,&volume)}else{None};
    Ok(RecoveryFileEvidence{
        project_id:project_id.into(),path:path.into(),size:meta.len(),modified_ms:modified_ms(&meta),
        sha256:small_image_sha256(&p,meta.len()),volume:volume.external.then_some(volume),volume_relative_path:rel
    })
}
fn validate_evidence(e:&RecoveryFileEvidence)->Result<PathBuf,String>{
    let p=if let Some(v)=e.volume.as_ref(){resolve_external_path(&e.path,v,e.volume_relative_path.as_deref())?}else{PathBuf::from(&e.path)};
    let meta=fs::metadata(&p).map_err(|_|"SOURCE_MISSING".to_string())?;
    if !meta.is_file()||meta.len()!=e.size{return Err("SOURCE_CHANGED".into())}
    if e.modified_ms>0&&modified_ms(&meta)!=e.modified_ms{return Err("SOURCE_CHANGED".into())}
    if let Some(expected)=e.sha256.as_ref(){if small_image_sha256(&p,meta.len()).as_deref()!=Some(expected.as_str()){return Err("SOURCE_CHANGED".into())}}
    Ok(p)
}
fn save_session(app:&AppHandle,s:&RecoveryJournalSession)->Result<(),String>{
    durable_atomic_json(&session_path(app,&s.recovery_session_id)?,s)
}
fn load_sessions(app:&AppHandle)->Result<Vec<RecoveryJournalSession>,String>{
    let mut out=Vec::new();
    for e in fs::read_dir(sessions_dir(app)?).map_err(|e|e.to_string())?.flatten(){
        if e.path().extension().and_then(|x|x.to_str())!=Some("json"){continue}
        if let Ok(bytes)=fs::read(e.path()){
            if let Ok(s)=serde_json::from_slice::<RecoveryJournalSession>(&bytes){out.push(s)}
        }
    }
    out.sort_by(|a,b|b.updated_at.cmp(&a.updated_at));
    Ok(out)
}
fn runtime_was_clean(app:&AppHandle)->bool{
    let Ok(path)=boot_path(app) else{return true};
    read_json::<RuntimeMarker>(&path).clean_shutdown
}
fn prune_history(app:&AppHandle){
    let Ok(mut rows)=load_sessions(app) else{return};
    let mut terminal=rows.drain(..).filter(|s|matches!(s.state.as_str(),"COMPLETED"|"ABANDONED")).collect::<Vec<_>>();
    terminal.sort_by(|a,b|b.updated_at.cmp(&a.updated_at));
    for s in terminal.into_iter().skip(MAX_DIAGNOSTIC_SESSIONS){
        if let Ok(p)=session_path(app,&s.recovery_session_id){let _=fs::remove_file(p);}
    }
}

pub fn initialize_runtime(app:&AppHandle)->Result<(),String>{
    let rp=runtime_path(app)?;
    let previous:RuntimeMarker=read_json(&rp);
    let boot=RuntimeMarker{
        runtime_session_id:previous.runtime_session_id.clone(),
        started_at:previous.started_at.clone(),
        updated_at:Utc::now().to_rfc3339(),
        clean_shutdown:previous.runtime_session_id.is_empty()||previous.clean_shutdown,
    };
    durable_atomic_json(&boot_path(app)?,&boot)?;
    let current=RuntimeMarker{
        runtime_session_id:Uuid::new_v4().to_string(),
        started_at:Utc::now().to_rfc3339(),
        updated_at:Utc::now().to_rfc3339(),
        clean_shutdown:false,
    };
    durable_atomic_json(&rp,&current)?;
    prune_history(app);
    Ok(())
}
pub fn mark_clean_shutdown(app:&AppHandle)->Result<(),String>{
    let unfinished=load_sessions(app)?.iter().any(|s|matches!(s.state.as_str(),"ACTIVE"|"WAITING"|"RECOVERING"));
    let mut m:RuntimeMarker=read_json(&runtime_path(app)?);
    if m.runtime_session_id.is_empty(){m.runtime_session_id=Uuid::new_v4().to_string();m.started_at=Utc::now().to_rfc3339();}
    m.clean_shutdown=!unfinished;
    m.updated_at=Utc::now().to_rfc3339();
    durable_atomic_json(&runtime_path(app)?,&m)
}
pub fn begin_production_session(app:&AppHandle,seed:ProductionRecoverySeed)->Result<String,String>{
    let id=if seed.recovery_session_id.trim().is_empty(){Uuid::new_v4().to_string()}else{seed.recovery_session_id.clone()};
    let mut unique=HashSet::new();
    let mut evidence=Vec::new();
    for (project_id,path) in seed.source_paths{
        if !unique.insert(path.clone()){continue}
        evidence.push(capture_evidence(&project_id,&path)?);
    }
    let root=PathBuf::from(&seed.root_path);
    let volume=volume_identity_for_path(&root);
    let stamp=Utc::now().to_rfc3339();
    let session=RecoveryJournalSession{
        recovery_schema_version:RECOVERY_SCHEMA_VERSION,recovery_session_id:id.clone(),operation_type:"PRODUCTION_BATCH".into(),state:"ACTIVE".into(),
        batch_id:seed.batch_id,channel_id:seed.channel_id,channel_name:seed.channel_name,root_path:seed.root_path,
        project_ids:seed.project_ids,job_ids:seed.job_ids,source_evidence:evidence,destination_paths:seed.destination_paths,
        current_step:"PLAN_PERSISTED".into(),completed_steps:vec!["PLAN_PERSISTED".into()],created_at:stamp.clone(),updated_at:stamp,
        progress:0.0,total_projects:seed.total_projects,completed_projects:0,last_checkpoint:"План сохранён".into(),
        external_volume:volume.external.then_some(volume),safe_resume_strategy:"VERIFY_CHECKPOINT_THEN_RESUME".into(),ui_context:seed.ui_context,
        dismissed_at:None,completed_at:None,last_error:None
    };
    save_session(app,&session)?;
    Ok(id)
}
pub fn checkpoint(app:&AppHandle,id:&str,step:&str,completed:usize,total:usize,last_checkpoint:&str)->Result<(),String>{
    let p=session_path(app,id)?;
    let mut s:RecoveryJournalSession=serde_json::from_slice(&fs::read(&p).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    if !matches!(s.state.as_str(),"ACTIVE"|"RECOVERING"|"WAITING"|"DISMISSED"){return Ok(())}
    s.state="ACTIVE".into();s.current_step=step.into();
    if !s.completed_steps.iter().any(|x|x==step){s.completed_steps.push(step.into())}
    s.completed_projects=completed.min(total);s.total_projects=total;
    s.progress=if total==0{0.0}else{(s.completed_projects as f64/total as f64*100.0).clamp(0.0,100.0)};
    s.last_checkpoint=last_checkpoint.into();s.updated_at=Utc::now().to_rfc3339();s.last_error=None;
    save_session(app,&s)
}
pub fn mark_waiting(app:&AppHandle,id:&str,reason:&str)->Result<(),String>{
    let p=session_path(app,id)?;let mut s:RecoveryJournalSession=read_json(&p);
    if s.recovery_session_id.is_empty(){return Err("RECOVERY_SESSION_NOT_FOUND".into())}
    s.state="WAITING".into();s.last_error=Some(reason.into());s.updated_at=Utc::now().to_rfc3339();save_session(app,&s)
}
pub fn complete(app:&AppHandle,id:&str)->Result<(),String>{
    let p=session_path(app,id)?;let mut s:RecoveryJournalSession=read_json(&p);
    if s.recovery_session_id.is_empty(){return Ok(())}
    let at=Utc::now().to_rfc3339();s.state="COMPLETED".into();s.current_step="READY".into();s.progress=100.0;s.completed_projects=s.total_projects;
    s.last_checkpoint="Готово".into();s.updated_at=at.clone();s.completed_at=Some(at);s.last_error=None;save_session(app,&s)?;prune_history(app);Ok(())
}
pub fn session(app:&AppHandle,id:&str)->Result<RecoveryJournalSession,String>{
    let s:RecoveryJournalSession=read_json(&session_path(app,id)?);
    if s.recovery_session_id.is_empty(){Err("RECOVERY_SESSION_NOT_FOUND".into())}else{Ok(s)}
}
fn candidate_from_session(app:&AppHandle,s:&RecoveryJournalSession)->RecoveryCandidate{
    let clean=runtime_was_clean(app);
    if s.recovery_schema_version>RECOVERY_SCHEMA_VERSION{
        return RecoveryCandidate{recovery_schema_version:s.recovery_schema_version,recovery_session_id:s.recovery_session_id.clone(),operation_type:s.operation_type.clone(),state:s.state.clone(),batch_id:s.batch_id.clone(),channel_id:s.channel_id.clone(),channel_name:s.channel_name.clone(),root_path:s.root_path.clone(),completed_projects:s.completed_projects,total_projects:s.total_projects,progress:s.progress,last_checkpoint:s.last_checkpoint.clone(),updated_at:s.updated_at.clone(),safe_to_resume:false,wait_reason:Some("RECOVERY_SCHEMA_NEWER".into()),dismissed:s.state=="DISMISSED",previous_session_ended_cleanly:clean,schema_compatible:false,ui_context:s.ui_context.clone(),..Default::default()}
    }
    let mut wait=None;
    let mut required_volume_name=s.external_volume.as_ref().and_then(|v|v.volume_name.clone());
    let resolved_root=if let Some(v)=s.external_volume.as_ref(){
        let rel=relative_to_volume(Path::new(&s.root_path),v);
        match resolve_external_path(&s.root_path,v,rel.as_deref()){Ok(p)=>Some(p),Err(e)=>{wait=Some(e);None}}
    }else{Some(PathBuf::from(&s.root_path))};
    if wait.is_none(){
        for e in &s.source_evidence{
            if let Err(reason)=validate_evidence(e){
                if required_volume_name.is_none(){required_volume_name=e.volume.as_ref().and_then(|v|v.volume_name.clone());}
                wait=Some(reason);break
            }
        }
    }
    if wait.is_none(){
        if let Some(root)=resolved_root.as_ref(){
            if !root.exists(){wait=Some("DESTINATION_MISSING".into())}
        }
    }
    RecoveryCandidate{
        recovery_schema_version:s.recovery_schema_version,recovery_session_id:s.recovery_session_id.clone(),operation_type:s.operation_type.clone(),state:s.state.clone(),
        batch_id:s.batch_id.clone(),channel_id:s.channel_id.clone(),channel_name:s.channel_name.clone(),root_path:s.root_path.clone(),
        resolved_root_path:resolved_root.map(|p|p.to_string_lossy().into_owned()),completed_projects:s.completed_projects,total_projects:s.total_projects,progress:s.progress,
        last_checkpoint:s.last_checkpoint.clone(),updated_at:s.updated_at.clone(),safe_to_resume:wait.is_none(),wait_reason:wait,
        required_volume_name,dismissed:s.state=="DISMISSED",
        previous_session_ended_cleanly:clean,schema_compatible:true,ui_context:s.ui_context.clone(),
    }
}
#[tauri::command]
pub fn recovery_candidates(app:AppHandle,include_dismissed:Option<bool>)->Result<Vec<RecoveryCandidate>,String>{
    let include=include_dismissed.unwrap_or(false);
    let mut rows=load_sessions(&app)?.into_iter()
        .filter(|s|matches!(s.state.as_str(),"ACTIVE"|"WAITING"|"RECOVERING"|"DISMISSED"))
        .filter(|s|include||s.state!="DISMISSED")
        .map(|s|candidate_from_session(&app,&s)).collect::<Vec<_>>();
    rows.sort_by(|a,b|b.updated_at.cmp(&a.updated_at));
    Ok(rows)
}
#[tauri::command]
pub fn recovery_dismiss_session(app:AppHandle,recovery_session_id:String)->Result<(),String>{
    let p=session_path(&app,&recovery_session_id)?;let mut s:RecoveryJournalSession=read_json(&p);
    if s.recovery_session_id.is_empty(){return Err("RECOVERY_SESSION_NOT_FOUND".into())}
    s.state="DISMISSED".into();s.dismissed_at=Some(Utc::now().to_rfc3339());s.updated_at=Utc::now().to_rfc3339();save_session(&app,&s)
}
#[tauri::command]
pub fn recovery_refresh_candidate(app:AppHandle,recovery_session_id:String)->Result<RecoveryCandidate,String>{
    let s=session(&app,&recovery_session_id)?;Ok(candidate_from_session(&app,&s))
}
#[tauri::command]
pub fn recovery_mark_clean_shutdown(app:AppHandle)->Result<(),String>{mark_clean_shutdown(&app)}

pub fn resolve_session_root(app:&AppHandle,id:&str)->Result<(RecoveryJournalSession,PathBuf),String>{
    let s=session(app,id)?;let candidate=candidate_from_session(app,&s);
    if !candidate.schema_compatible{return Err("RECOVERY_SCHEMA_NEWER".into())}
    if !candidate.safe_to_resume{
        let reason=candidate.wait_reason.unwrap_or_else(||"RECOVERY_UNSAFE".into());let _=mark_waiting(app,id,&reason);return Err(reason)
    }
    let root=PathBuf::from(candidate.resolved_root_path.unwrap_or(s.root_path.clone()));
    Ok((s,root))
}
pub fn remap_recovery_source_path(s:&RecoveryJournalSession,original:&str)->Result<String,String>{
    if let Some(e)=s.source_evidence.iter().find(|e|e.path==original){
        if let Some(v)=e.volume.as_ref(){return Ok(resolve_external_path(original,v,e.volume_relative_path.as_deref())?.to_string_lossy().into_owned())}
    }
    Ok(original.into())
}
pub fn remap_recovery_directory_path(s:&RecoveryJournalSession,original:&str)->Result<String,String>{
    let p=Path::new(original);
    for e in &s.source_evidence{
        let Some(v)=e.volume.as_ref() else{continue};
        let Some(mount)=v.mount_path.as_deref() else{continue};
        let mount_path=Path::new(mount);
        if let Ok(rel)=p.strip_prefix(mount_path){
            return Ok(resolve_external_path(original,v,Some(&rel.to_string_lossy()))?.to_string_lossy().into_owned())
        }
    }
    if let Some(v)=s.external_volume.as_ref(){
        if let Some(mount)=v.mount_path.as_deref(){
            if let Ok(rel)=p.strip_prefix(Path::new(mount)){
                return Ok(resolve_external_path(original,v,Some(&rel.to_string_lossy()))?.to_string_lossy().into_owned())
            }
        }
    }
    Ok(original.into())
}
pub fn set_recovering(app:&AppHandle,id:&str)->Result<(),String>{
    let p=session_path(app,id)?;let mut s:RecoveryJournalSession=read_json(&p);
    if s.recovery_session_id.is_empty(){return Err("RECOVERY_SESSION_NOT_FOUND".into())}
    s.state="RECOVERING".into();s.updated_at=Utc::now().to_rfc3339();s.dismissed_at=None;save_session(app,&s)
}

#[cfg(test)]
mod tests{
    use super::*;
    fn temp(name:&str)->PathBuf{std::env::temp_dir().join(format!("vyron-recovery-{name}-{}",Uuid::new_v4()))}
    #[test]
    fn durable_atomic_write_roundtrips(){
        let d=temp("atomic");fs::create_dir_all(&d).unwrap();let p=d.join("x.json");
        durable_atomic_json(&p,&HashMap::from([("ok",true)])).unwrap();
        let x:HashMap<String,bool>=read_json(&p);assert_eq!(x.get("ok"),Some(&true));let _=fs::remove_dir_all(d);
    }
    #[test]
    fn evidence_detects_source_change(){
        let d=temp("evidence");fs::create_dir_all(&d).unwrap();let p=d.join("a.bin");fs::write(&p,b"abc").unwrap();
        let e=capture_evidence("001",&p.to_string_lossy()).unwrap();assert!(validate_evidence(&e).is_ok());
        fs::write(&p,b"abcdef").unwrap();assert_eq!(validate_evidence(&e).unwrap_err(),"SOURCE_CHANGED");let _=fs::remove_dir_all(d);
    }
    #[test]
    fn same_name_wrong_uuid_is_never_same_volume(){
        let a=RecoveryVolumeIdentity{external:true,volume_name:Some("TOSHIBA EXT".into()),volume_uuid:Some("UUID-A".into()),mount_path:Some("/Volumes/TOSHIBA EXT".into())};
        let b=RecoveryVolumeIdentity{external:true,volume_name:Some("TOSHIBA EXT".into()),volume_uuid:Some("UUID-B".into()),mount_path:Some("/Volumes/TOSHIBA EXT".into())};
        assert!(!volume_identity_matches(&a,&b));
    }
    #[test]
    fn journal_schema_contains_no_secret_fields(){
        let s=RecoveryJournalSession{recovery_schema_version:RECOVERY_SCHEMA_VERSION,recovery_session_id:"r".into(),operation_type:"PRODUCTION_BATCH".into(),..Default::default()};
        let raw=serde_json::to_string(&s).unwrap().to_ascii_lowercase();
        for forbidden in ["refresh_token","access_token","client_secret","vault_key","credentials_json"]{assert!(!raw.contains(forbidden))}
    }
}
