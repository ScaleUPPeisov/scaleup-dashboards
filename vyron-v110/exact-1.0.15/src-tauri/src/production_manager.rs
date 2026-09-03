use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex, OnceLock, atomic::{AtomicBool, Ordering}},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const IMAGE_EXT: &[&str] = &["jpg","jpeg","png","webp"];
const AUDIO_EXT: &[&str] = &["mp3","wav","m4a","aac","flac","ogg","opus","aiff","aif","alac"];

static IMPORT_STOPS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
static BUILD_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn import_stops() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    IMPORT_STOPS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn build_lock() -> &'static Mutex<()> { BUILD_LOCK.get_or_init(|| Mutex::new(())) }
fn ext(p: &Path) -> String { p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase() }
fn is_image(p: &Path) -> bool { IMAGE_EXT.contains(&ext(p).as_str()) }
fn is_audio(p: &Path) -> bool { AUDIO_EXT.contains(&ext(p).as_str()) }
fn nonempty_image(p:&Path)->bool{p.is_file()&&is_image(p)&&fs::metadata(p).map(|m|m.len()>0).unwrap_or(false)}
fn project_has_renderable_image(folder:&Path,manifest_image:&Path)->bool{
    if nonempty_image(manifest_image){return true;}
    fs::read_dir(folder).ok().into_iter().flatten().filter_map(Result::ok).any(|e|{
        let name=e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {return false;}
        let ft=match e.file_type(){Ok(x)=>x,Err(_)=>return false};
        if !ft.is_file(){return false;}
        nonempty_image(&e.path())
    })
}
fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}
fn safe_component(raw: &str) -> String {
    let mut s: String = raw.chars().map(|c| if c.is_alphanumeric() || c=='-' || c=='_' || c==' ' { c } else { '_' }).collect();
    s = s.trim().trim_matches('.').chars().take(80).collect();
    if s.is_empty() { "Channel".into() } else { s }
}
fn channel_key(raw: &str) -> String {
    let s: String = raw.chars().filter(|c| c.is_ascii_alphanumeric() || *c=='-' || *c=='_').take(100).collect();
    if s.is_empty() { "channel".into() } else { s }
}
fn root(workspace: &str) -> Result<PathBuf,String> {
    if workspace.trim().is_empty() { return Err("Workspace VYRON не выбран".into()); }
    let p = PathBuf::from(workspace).join("ProductionManager");
    fs::create_dir_all(&p).map_err(|e| format!("Production Manager: {e}"))?;
    Ok(p)
}
fn channel_root(workspace: &str, channel_id: &str) -> Result<PathBuf,String> {
    let p = root(workspace)?.join("Channels").join(channel_key(channel_id));
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn batch_root_parent(workspace: &str, channel_id: &str) -> Result<PathBuf,String> {
    let p = root(workspace)?.join("Batches").join(channel_key(channel_id));
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn atomic_json<T: Serialize>(path: &Path, value: &T) -> Result<(),String> {
    if let Some(parent)=path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let tmp=path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if path.exists() { let _=fs::remove_file(path); }
    fs::rename(tmp,path).map_err(|e| e.to_string())
}
fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}
fn hash_file(path: &Path) -> Result<String,String> {
    let mut f=fs::File::open(path).map_err(|e| e.to_string())?;
    let mut h=Sha256::new(); let mut buf=[0u8;1024*1024];
    loop { let n=f.read(&mut buf).map_err(|e| e.to_string())?; if n==0 {break;} h.update(&buf[..n]); }
    Ok(hex::encode(h.finalize()))
}
fn seq_hash(ids: &[String]) -> String {
    let mut h=Sha256::new();
    for id in ids { h.update(id.as_bytes()); h.update(b"\n"); }
    hex::encode(h.finalize())
}
fn seed64(s:&str)->u64 { let h=Sha256::digest(s.as_bytes()); u64::from_le_bytes(h[0..8].try_into().unwrap()) }
fn shuffle<T>(v:&mut [T], mut x:u64) {
    if x==0 {x=0x9e3779b97f4a7c15;}
    for i in (1..v.len()).rev() {
        x ^= x<<13; x ^= x>>7; x ^= x<<17;
        v.swap(i,(x as usize)%(i+1));
    }
}
fn recursive_images(root:&Path)->Result<Vec<PathBuf>,String>{
    let mut out=Vec::new();let mut stack=vec![root.to_path_buf()];
    while let Some(dir)=stack.pop(){
        let rd=fs::read_dir(&dir).map_err(|e|if dir==root{format!("VYRON не может читать папку Downloads: {e}")}else{format!("Не удалось прочитать {}: {e}",dir.display())})?;
        for e in rd.filter_map(Result::ok){let p=e.path();let ft=match e.file_type(){Ok(x)=>x,Err(_)=>continue};if ft.is_symlink(){continue}let name=e.file_name().to_string_lossy().to_string();if name.starts_with('.') {continue}if ft.is_dir(){stack.push(p)}else if ft.is_file()&&is_image(&p){out.push(p)}}
    }
    out.sort_by_key(|p|fs::metadata(p).ok().and_then(|m|m.modified().ok()).unwrap_or(UNIX_EPOCH));Ok(out)
}
fn image_snapshot(dir:&Path)->HashSet<String>{recursive_images(dir).unwrap_or_default().into_iter().map(|p|p.to_string_lossy().into_owned()).collect()}

fn downloads_dir()->Result<PathBuf,String>{
    let home=std::env::var("HOME").map_err(|_|"Не удалось определить домашнюю папку".to_string())?;
    let p=PathBuf::from(home).join("Downloads");
    if !p.is_dir(){return Err("Папка Downloads не найдена".into())} Ok(p)
}
fn recursive_audio(root:&Path)->Vec<PathBuf>{
    let mut out=Vec::new(); let mut stack=vec![root.to_path_buf()];
    while let Some(dir)=stack.pop() {
        if let Ok(rd)=fs::read_dir(dir) {
            for e in rd.flatten() {
                let p=e.path();
                if e.file_type().map(|x|x.is_symlink()).unwrap_or(false){continue;}
                if p.is_dir(){stack.push(p)} else if p.is_file()&&is_audio(&p){out.push(p)}
            }
        }
    }
    out.sort(); out
}
fn audio_duration(path:&Path)->f64{
    #[cfg(target_os="macos")]
    {
        if let Ok(o)=Command::new("/usr/bin/afinfo").arg(path).output() {
            let t=String::from_utf8_lossy(&o.stdout);
            for line in t.lines() {
                if line.trim().to_ascii_lowercase().starts_with("estimated duration:") {
                    if let Some(x)=line.split(':').nth(1).and_then(|x|x.trim().split_whitespace().next()).and_then(|x|x.parse::<f64>().ok()) { return x; }
                }
            }
        }
    }
    0.0
}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct CollectedImage { pub id:String, pub number:u32, pub path:String, pub source_path:String, pub captured_at:String }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ImportSession {
    pub schema_version:u32,pub session_id:String,pub channel_id:String,pub channel_name:String,pub active:bool,
    pub started_at:String,pub stopped_at:Option<String>,pub downloads_path:String,pub import_path:String,pub collected:Vec<CollectedImage>
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ChannelSettings { pub schema_version:u32,pub channel_id:String,pub channel_name:String,pub music_library:String,pub updated_at:String }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct TrackIndex { pub track_id:String,pub path:String,pub size:u64,pub modified_ms:u64,pub duration_sec:f64 }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct MusicIndex { pub schema_version:u32,pub library_path:String,pub indexed_at:String,pub tracks:Vec<TrackIndex> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct TrackUsage { pub track_id:String,pub original_path:String,pub times_used:u64,pub last_used_at:Option<String>,pub batch_ids:Vec<String> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct MusicHistory { pub schema_version:u32,pub tracks:HashMap<String,TrackUsage>,pub sequence_fingerprints:Vec<String> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct MusicSummary { pub library_path:String,pub tracks:usize,pub indexed_at:String }

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct JobLink { pub job_id:String,pub number:u32 }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BuildRequest {
    pub request_id:String,pub workspace:String,pub output_workspace:Option<String>,pub channel_id:String,pub channel_name:String,pub project_count:usize,
    pub tracks_per_project:usize,pub mode:String,pub allow_image_reuse:bool,pub job_links:Vec<JobLink>
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ManifestTrack { pub track_id:String,pub path:String,pub original_path:String,pub duration_sec:f64 }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ManifestProject {
    pub project_id:String,pub job_id:Option<String>,pub video_number:Option<u32>,pub folder_path:String,pub image_path:String,
    pub tracks:Vec<ManifestTrack>,pub total_duration_sec:f64,pub status:String,pub sequence_fingerprint:String
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchManifest {
    pub schema_version:u32,pub source:String,pub batch_id:String,pub channel_id:String,pub channel_name:String,pub created_at:String,
    pub project_count:usize,pub tracks_per_project:usize,pub mode:String,pub root_path:String,pub output_dir:String,pub status_path:String,
    pub status:String,pub projects:Vec<ManifestProject>
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchProjectStatus {
    pub project_id:String,pub job_id:Option<String>,pub video_number:Option<u32>,pub render_status:String,pub output_file:Option<String>,
    pub duration:Option<f64>,pub file_size:Option<u64>,pub error:Option<String>
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchStatus { pub batch_id:String,pub status:String,pub updated_at:String,pub projects:Vec<BatchProjectStatus> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchSummary {
    pub batch_id:String,pub channel_id:String,pub channel_name:String,pub created_at:String,pub project_count:usize,pub tracks_assigned:usize,
    pub status:String,pub manifest_path:String,pub root_path:String,pub completed_projects:usize,pub error_projects:usize
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BuildResult { pub status:String,pub available_images:usize,pub requested_projects:usize,pub batch:Option<BatchSummary>,pub message:Option<String> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ValidationItem { pub project_id:String,pub ok:bool,pub error:Option<String> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct Validation { pub batch_id:String,pub ready:usize,pub errors:usize,pub endlume_exists:bool,pub items:Vec<ValidationItem> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct DeleteResult { pub deleted_project_ids:Vec<String>,pub deleted_job_ids:Vec<String>,pub batch:Option<BatchSummary> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct HandoffReceipt { pub batch_id:String,pub manifest_path:String,pub request_path:String }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ChannelState { pub settings:ChannelSettings,pub import_session:ImportSession,pub music:Option<MusicSummary>,pub batches:Vec<BatchSummary> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct PlanTrack { track_id:String,source:String,duration_sec:f64,dest_name:String }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct PlanProject { project_id:String,job_id:Option<String>,video_number:Option<u32>,image_source:String,image_name:String,tracks:Vec<PlanTrack>,sequence_fingerprint:String }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ProductionStorageStatus { pub path:String,pub exists:bool,pub writable:bool,pub external:bool,pub free_bytes:Option<u64>,pub error:Option<String> }

fn storage_free_bytes(path:&Path)->Option<u64>{
    let out=std::process::Command::new("df").arg("-Pk").arg(path).output().ok()?;
    if !out.status.success(){return None;}
    let text=String::from_utf8_lossy(&out.stdout);let line=text.lines().filter(|x|!x.trim().is_empty()).last()?;
    let cols=line.split_whitespace().collect::<Vec<_>>();if cols.len()<4{return None;}
    cols.get(3)?.parse::<u64>().ok().map(|kb|kb.saturating_mul(1024))
}
fn storage_probe(path:&Path)->ProductionStorageStatus{
    let display=path.to_string_lossy().into_owned();let external=display.starts_with("/Volumes/");
    if !path.exists(){return ProductionStorageStatus{path:display,exists:false,writable:false,external,free_bytes:None,error:Some("Production-диск или папка недоступны".into())};}
    if !path.is_dir(){return ProductionStorageStatus{path:display,exists:true,writable:false,external,free_bytes:None,error:Some("Production Workspace должен быть папкой".into())};}
    let probe=path.join(format!(".vyron-write-probe-{}",Uuid::new_v4()));
    let writable=std::fs::OpenOptions::new().write(true).create_new(true).open(&probe).map(|_|{let _=fs::remove_file(&probe);true}).unwrap_or(false);
    ProductionStorageStatus{path:display,exists:true,writable,external,free_bytes:storage_free_bytes(path),error:if writable{None}else{Some("Нет доступа на запись в Production Workspace".into())}}
}
fn resolve_output_workspace(req:&BuildRequest)->Result<String,String>{
    let chosen=req.output_workspace.as_deref().map(str::trim).filter(|x|!x.is_empty()).unwrap_or(req.workspace.trim());
    if chosen.is_empty(){return Err("Production Workspace не выбран".into());}
    if chosen!=req.workspace.trim(){let st=storage_probe(Path::new(chosen));if !st.exists||!st.writable{return Err(st.error.unwrap_or_else(||format!("Production Workspace недоступен: {chosen}")));}}
    Ok(chosen.to_string())
}
#[tauri::command]
pub fn production_storage_status(path:String)->ProductionStorageStatus{let raw=PathBuf::from(path.trim());let exact=raw.canonicalize().unwrap_or(raw);storage_probe(&exact)}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct BuildPlan { schema_version:u32,request:BuildRequest,batch_id:String,batch_root:String,created_at:String,projects:Vec<PlanProject> }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
struct Checkpoint { completed_projects:usize,total_projects:usize,status:String,history_applied:bool,updated_at:String }
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct RecoveryState {
    pub batch_id:String,pub channel_id:String,pub channel_name:String,pub root_path:String,
    pub completed_projects:usize,pub total_projects:usize,pub current_project:String,pub status:String,pub updated_at:String,pub recoverable:bool
}

fn session_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("import-session.json"))}
fn settings_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("settings.json"))}
fn index_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("music-index.json"))}
fn history_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("music-history.json"))}
fn requests_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("build-requests.json"))}

#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
struct ImportProbe { size:u64, modified_ms:u64, stable_cycles:u8 }

fn import_runtime_active(channel_id:&str)->bool{
    import_stops().lock().ok().and_then(|m|m.get(channel_id).cloned()).map(|flag|!flag.load(Ordering::SeqCst)).unwrap_or(false)
}
fn normalize_import_runtime(workspace:&str,channel_id:&str,mut session:ImportSession)->ImportSession{
    if session.active && !import_runtime_active(channel_id){
        session.active=false;
        if session.stopped_at.is_none(){session.stopped_at=Some(Utc::now().to_rfc3339());}
        if let Ok(path)=session_path(workspace,channel_id){let _=atomic_json(&path,&session);}
    }
    session
}
fn import_candidate_ready(src:&Path,pending:&mut HashMap<String,ImportProbe>)->bool{
    let key=src.to_string_lossy().into_owned();
    let meta=match fs::metadata(src){Ok(m)=>m,Err(_)=>{pending.remove(&key);return false;}};
    if meta.len()==0{pending.remove(&key);return false;}
    let now=ImportProbe{size:meta.len(),modified_ms:modified_ms(&meta),stable_cycles:0};
    match pending.get_mut(&key){
        Some(prev) if prev.size==now.size && prev.modified_ms==now.modified_ms=>{
            prev.stable_cycles=prev.stable_cycles.saturating_add(1);
            prev.stable_cycles>=1
        }
        _=>{pending.insert(key,now);false}
    }
}

fn collector_seen_at_start(session:&ImportSession,_startup_snapshot:&HashSet<String>)->HashSet<String>{
    // Only files already persisted by THIS session are duplicates.
    // Images merely present in Downloads before Start remain valid candidates.
    session.collected.iter().map(|x|x.source_path.clone()).collect()
}

fn spawn_import_watcher(app:AppHandle, workspace:String, channel_id:String, mut session:ImportSession, baseline:HashSet<String>) -> Result<(),String> {
    let stop=Arc::new(AtomicBool::new(false));
    import_stops().lock().map_err(|_|"Import lock".to_string())?.insert(channel_id.clone(),stop.clone());
    let state_path=session_path(&workspace,&channel_id)?;
    let downloads=PathBuf::from(&session.downloads_path);
    let import_dir=PathBuf::from(&session.import_path);
    eprintln!("[image-collector] session started channel={} session={} downloads={} restored={}",channel_id,session.session_id,downloads.display(),session.collected.len());
    thread::spawn(move || {

        let mut seen=collector_seen_at_start(&session,&baseline);
        let mut pending=HashMap::<String,ImportProbe>::new();
        let mut last_error:Option<String>=None;
        while !stop.load(Ordering::SeqCst) {
            let files=match recursive_images(&downloads){
                Ok(files)=>{last_error=None;files}
                Err(e)=>{let message=format!("{e}. Разрешите VYRON доступ к Downloads в настройках macOS «Конфиденциальность и безопасность → Файлы и папки».");if last_error.as_deref()!=Some(message.as_str()){let _=app.emit("production-import-error",json!({"channelId":channel_id,"sessionId":session.session_id,"message":message}));last_error=Some(message);}thread::sleep(Duration::from_millis(650));continue;}
            };
            for src in files {
                let key=src.to_string_lossy().into_owned();
                if seen.contains(&key){continue;}
                if !import_candidate_ready(&src,&mut pending){continue;}
                let before=match fs::metadata(&src){Ok(x) if x.len()>0=>x,_=>continue};
                let before_size=before.len();
                let before_modified=modified_ms(&before);
                let no=(session.collected.len()+1) as u32;
                let extension=ext(&src);
                let dst=import_dir.join(format!("{:03}.{}",no,extension));
                let tmp=import_dir.join(format!(".{:03}.{}.partial",no,extension));
                let _=fs::remove_file(&tmp);
                if let Err(e)=fs::copy(&src,&tmp){
                    let _=app.emit("production-import-error",json!({"channelId":channel_id,"sessionId":session.session_id,"message":format!("Не удалось скопировать изображение: {e}")}));
                    continue;
                }
                let after=match fs::metadata(&src){Ok(x)=>x,Err(_)=>{let _=fs::remove_file(&tmp);continue;}};
                let copied=fs::metadata(&tmp).map(|m|m.len()).unwrap_or(0);
                if after.len()!=before_size || modified_ms(&after)!=before_modified || copied!=before_size{
                    let _=fs::remove_file(&tmp);
                    pending.insert(key.clone(),ImportProbe{size:after.len(),modified_ms:modified_ms(&after),stable_cycles:0});
                    continue;
                }
                if let Err(e)=fs::rename(&tmp,&dst){
                    let _=fs::remove_file(&tmp);
                    let _=app.emit("production-import-error",json!({"channelId":channel_id,"sessionId":session.session_id,"message":format!("Не удалось сохранить изображение в VYRON: {e}")}));
                    continue;
                }
                seen.insert(key.clone());
                pending.remove(&key);
                let item=CollectedImage{id:Uuid::new_v4().to_string(),number:no,path:dst.to_string_lossy().into_owned(),source_path:key,captured_at:Utc::now().to_rfc3339()};
                session.collected.push(item);
                eprintln!("[image-collector] imported channel={} session={} count={} source={}",channel_id,session.session_id,session.collected.len(),session.collected.last().map(|x|x.source_path.as_str()).unwrap_or(""));
                let _=atomic_json(&state_path,&session);
                let _=app.emit("production-import-progress",json!({"channelId":channel_id,"sessionId":session.session_id,"collected":session.collected.len(),"bytes":before_size}));
            }
            thread::sleep(Duration::from_millis(650));
        }
        session.active=false;
        session.stopped_at=Some(Utc::now().to_rfc3339());
        let _=atomic_json(&state_path,&session);
        if let Ok(mut map)=import_stops().lock(){map.remove(&channel_id);}
    });
    Ok(())
}

#[tauri::command]
pub fn start_production_import(app:AppHandle, workspace:String, channel_id:String, channel_name:String)->Result<ImportSession,String>{
    if let Ok(map)=import_stops().lock() {
        if map.get(&channel_id).map(|x|!x.load(Ordering::SeqCst)).unwrap_or(false){return Err("Сбор изображений уже запущен".into());}
    }
    let downloads=downloads_dir()?;
    fs::read_dir(&downloads).map_err(|e|format!("VYRON не может читать папку Downloads: {e}. Разрешите VYRON доступ к Downloads в настройках macOS «Конфиденциальность и безопасность → Файлы и папки»."))?;
    let croot=channel_root(&workspace,&channel_id)?;
    let sp=session_path(&workspace,&channel_id)?;
    let old:ImportSession=read_json(&sp);
    let (session,baseline)=if old.active && !old.session_id.is_empty() && Path::new(&old.import_path).is_dir() {
        (old,image_snapshot(&downloads))
    } else {
        let sid=Uuid::new_v4().to_string(); let import_dir=croot.join("Imports").join(&sid); fs::create_dir_all(&import_dir).map_err(|e|e.to_string())?;
        (ImportSession{schema_version:SCHEMA_VERSION,session_id:sid,channel_id:channel_id.clone(),channel_name,active:true,started_at:Utc::now().to_rfc3339(),stopped_at:None,downloads_path:downloads.to_string_lossy().into_owned(),import_path:import_dir.to_string_lossy().into_owned(),collected:Vec::new()},image_snapshot(&downloads))
    };
    let mut active=session.clone(); active.active=true; active.stopped_at=None; atomic_json(&sp,&active)?;
    spawn_import_watcher(app,workspace,channel_id,active.clone(),baseline)?;
    Ok(active)
}

#[tauri::command]
pub fn stop_production_import(workspace:String, channel_id:String)->Result<ImportSession,String>{
    if let Ok(map)=import_stops().lock(){if let Some(x)=map.get(&channel_id){x.store(true,Ordering::SeqCst);}}
    let p=session_path(&workspace,&channel_id)?; let mut s:ImportSession=read_json(&p); s.active=false; s.stopped_at=Some(Utc::now().to_rfc3339()); atomic_json(&p,&s)?; Ok(s)
}
#[tauri::command]
pub fn production_import_status(workspace:String,channel_id:String)->Result<ImportSession,String>{let s:ImportSession=read_json(&session_path(&workspace,&channel_id)?);Ok(normalize_import_runtime(&workspace,&channel_id,s))}

#[tauri::command]
pub fn set_production_music_library(workspace:String,channel_id:String,channel_name:String,path:String)->Result<ChannelSettings,String>{
    let p=PathBuf::from(path).canonicalize().map_err(|_|"Папка музыкальной библиотеки не найдена".to_string())?;
    if !p.is_dir(){return Err("Музыкальная библиотека должна быть папкой".into());}
    let s=ChannelSettings{schema_version:SCHEMA_VERSION,channel_id:channel_id.clone(),channel_name,music_library:p.to_string_lossy().into_owned(),updated_at:Utc::now().to_rfc3339()};
    atomic_json(&settings_path(&workspace,&channel_id)?,&s)?; Ok(s)
}
fn index_music_sync(workspace:&str,channel_id:&str)->Result<MusicIndex,String>{
    let s:ChannelSettings=read_json(&settings_path(workspace,channel_id)?);
    if s.music_library.is_empty(){return Err("Сначала выбери папку музыки".into());}
    let lib=PathBuf::from(&s.music_library).canonicalize().map_err(|_|"Музыкальная библиотека недоступна".to_string())?;
    let old:MusicIndex=read_json(&index_path(workspace,channel_id)?); let old_map=old.tracks.into_iter().map(|t|(t.path.clone(),t)).collect::<HashMap<_,_>>();
    let mut tracks=Vec::new();
    for p in recursive_audio(&lib) {
        let m=fs::metadata(&p).map_err(|e|e.to_string())?; if m.len()==0{continue;}
        let ps=p.to_string_lossy().into_owned(); let mm=modified_ms(&m);
        if let Some(prev)=old_map.get(&ps).filter(|x|x.size==m.len()&&x.modified_ms==mm){tracks.push(prev.clone());continue;}
        tracks.push(TrackIndex{track_id:hash_file(&p)?,path:ps,size:m.len(),modified_ms:mm,duration_sec:audio_duration(&p)});
    }
    tracks.sort_by(|a,b|{let an=Path::new(&a.path).file_name().and_then(|x|x.to_str()).unwrap_or("").to_lowercase();let bn=Path::new(&b.path).file_name().and_then(|x|x.to_str()).unwrap_or("").to_lowercase();an.cmp(&bn).then_with(||a.path.cmp(&b.path))});
    let idx=MusicIndex{schema_version:SCHEMA_VERSION,library_path:lib.to_string_lossy().into_owned(),indexed_at:Utc::now().to_rfc3339(),tracks};
    atomic_json(&index_path(workspace,channel_id)?,&idx)?; Ok(idx)
}
#[tauri::command]
pub async fn index_production_music_library(workspace:String,channel_id:String)->Result<MusicSummary,String>{
    let idx=tauri::async_runtime::spawn_blocking(move||index_music_sync(&workspace,&channel_id)).await.map_err(|e|e.to_string())??;
    Ok(MusicSummary{library_path:idx.library_path,tracks:idx.tracks.len(),indexed_at:idx.indexed_at})
}

fn next_batch_id(parent:&Path,channel_name:&str)->String{
    let date=Utc::now().format("%Y-%m-%d").to_string(); let prefix=format!("{}_BATCH_{}_",safe_component(channel_name),date);
    let mut max=0u32;
    if let Ok(rd)=fs::read_dir(parent){for e in rd.flatten(){let n=e.file_name().to_string_lossy().to_string();if let Some(x)=n.strip_prefix(&prefix).and_then(|x|x.parse::<u32>().ok()){max=max.max(x);}}}
    format!("{}{:03}",prefix,max+1)
}
fn choose_sequence(mode:&str,tracks:&[TrackIndex],history:&MusicHistory,planned:&HashMap<String,u64>,global_pool:&mut Vec<usize>,cursor:&mut usize,count:usize,batch_id:&str,project_no:usize,seen:&HashSet<String>)->Result<Vec<usize>,String>{
    if tracks.len()<count{return Err(format!("В библиотеке {} уникальных треков, на проект нужно {}",tracks.len(),count));}
    for attempt in 0..100 {
        let salt=format!("{batch_id}:{project_no}:{attempt}:{mode}"); let mut picked=Vec::new();
        match mode {
            "even" => {
                let mut s=(0..tracks.len()).map(|i|{
                    let id=&tracks[i].track_id; let used=history.tracks.get(id).map(|x|x.times_used).unwrap_or(0)+planned.get(id).copied().unwrap_or(0);
                    (used,seed64(&format!("{salt}:{id}")),i)
                }).collect::<Vec<_>>();
                s.sort_by_key(|x|(x.0,x.1)); picked=s.into_iter().take(count).map(|x|x.2).collect();
            },
            "alphabetical" => {
                let mut local=HashSet::new();while picked.len()<count{if *cursor>=tracks.len(){*cursor=0;}let i=*cursor;*cursor+=1;if local.insert(i){picked.push(i);}}
            },
            "no-repeat" => {
                let mut local=HashSet::new();
                while picked.len()<count {
                    if *cursor>=global_pool.len(){*global_pool=(0..tracks.len()).collect();shuffle(global_pool,seed64(&format!("{salt}:cycle")));*cursor=0;}
                    let i=global_pool[*cursor];*cursor+=1;if local.insert(i){picked.push(i);}
                }
            },
            _ => { let mut p=(0..tracks.len()).collect::<Vec<_>>();shuffle(&mut p,seed64(&salt));picked=p.into_iter().take(count).collect(); }
        }
        if mode!="alphabetical"{shuffle(&mut picked,seed64(&format!("{salt}:order")));}
        let mut ids=picked.iter().map(|i|tracks[*i].track_id.clone()).collect::<Vec<_>>();
        if mode=="alphabetical"&&seen.contains(&seq_hash(&ids))&&picked.len()>1{let n=picked.len();picked.rotate_left((project_no+attempt+1)%n);ids=picked.iter().map(|i|tracks[*i].track_id.clone()).collect();}
        if !seen.contains(&seq_hash(&ids)){return Ok(picked);}
    }
    Err("Не удалось создать уникальную последовательность музыки".into())
}
fn plan_build(req:&BuildRequest)->Result<BuildPlan,String>{
    if req.project_count==0||req.project_count>10000{return Err("Количество проектов должно быть 1–10000".into());}
    if req.tracks_per_project==0||req.tracks_per_project>100{return Err("Песен на проект должно быть 1–100".into());}
    if !matches!(req.mode.as_str(),"even"|"random"|"alphabetical"|"no-repeat"){return Err("Неизвестный режим распределения".into());}
    let session:ImportSession=read_json(&session_path(&req.workspace,&req.channel_id)?);
    if session.collected.is_empty(){return Err("Сначала собери изображения".into());}
    if req.project_count>session.collected.len()&&!req.allow_image_reuse{return Err(format!("INSUFFICIENT_IMAGES:{}:{}",session.collected.len(),req.project_count));}
    let idx=index_music_sync(&req.workspace,&req.channel_id)?;
    if idx.tracks.len()<req.tracks_per_project{return Err(format!("В библиотеке недостаточно уникальных треков: {} < {}",idx.tracks.len(),req.tracks_per_project));}
    let history:MusicHistory=read_json(&history_path(&req.workspace,&req.channel_id)?);
    // Source/control state always remains in req.workspace. Only the NEW batch
    // destination may use output_workspace. This is the backwards-compatibility
    // boundary that keeps the working Downloads collector and music index intact.
    let output_workspace=resolve_output_workspace(req)?;
    let parent=batch_root_parent(&output_workspace,&req.channel_id)?; let bid=next_batch_id(&parent,&req.channel_name); let broot=parent.join(&bid);
    fs::create_dir_all(&broot).map_err(|e|e.to_string())?;
    let mut seen=history.sequence_fingerprints.iter().cloned().collect::<HashSet<_>>();
    let mut planned=HashMap::<String,u64>::new(); let mut pool=(0..idx.tracks.len()).collect::<Vec<_>>();shuffle(&mut pool,seed64(&bid));let mut cursor=0usize;
    let mut projects=Vec::new();
    for i in 0..req.project_count {
        let image=&session.collected[i%session.collected.len()];
        let picks=choose_sequence(&req.mode,&idx.tracks,&history,&planned,&mut pool,&mut cursor,req.tracks_per_project,&bid,i,&seen)?;
        let ids=picks.iter().map(|x|idx.tracks[*x].track_id.clone()).collect::<Vec<_>>();let fp=seq_hash(&ids);seen.insert(fp.clone());
        let mut pt=Vec::new();
        for (pos,ti) in picks.iter().enumerate(){
            let t=&idx.tracks[*ti];*planned.entry(t.track_id.clone()).or_insert(0)+=1;
            let src=Path::new(&t.path);let stem=src.file_stem().and_then(|x|x.to_str()).unwrap_or("track");let ex=ext(src);
            pt.push(PlanTrack{track_id:t.track_id.clone(),source:t.path.clone(),duration_sec:t.duration_sec,dest_name:format!("{:03}_{}.{}",pos+1,safe_component(stem),ex)});
        }
        let link=req.job_links.get(i);
        projects.push(PlanProject{project_id:format!("{:03}",i+1),job_id:link.map(|x|x.job_id.clone()),video_number:link.map(|x|x.number),image_source:image.path.clone(),image_name:format!("image.{}",ext(Path::new(&image.path))),tracks:pt,sequence_fingerprint:fp});
    }
    let plan=BuildPlan{schema_version:SCHEMA_VERSION,request:req.clone(),batch_id:bid,batch_root:broot.to_string_lossy().into_owned(),created_at:Utc::now().to_rfc3339(),projects};
    atomic_json(&broot.join("plan.json"),&plan)?;atomic_json(&broot.join("checkpoint.json"),&Checkpoint{completed_projects:0,total_projects:req.project_count,status:"Подготовка".into(),history_applied:false,updated_at:Utc::now().to_rfc3339()})?;
    Ok(plan)
}
fn project_ready(plan:&PlanProject,folder:&Path)->bool{
    if !folder.is_dir(){return false;} let image=folder.join(&plan.image_name);if !image.is_file()||fs::metadata(&image).map(|m|m.len()==0).unwrap_or(true){return false;}
    plan.tracks.iter().all(|t|{let p=folder.join(&t.dest_name);p.is_file()&&fs::metadata(p).map(|m|m.len()>0).unwrap_or(false)})
}
fn execute_plan(app:Option<&AppHandle>,plan:&BuildPlan)->Result<BatchSummary,String>{
    let broot=PathBuf::from(&plan.batch_root);let cp_path=broot.join("checkpoint.json");let mut cp:Checkpoint=read_json(&cp_path);
    for (i,p) in plan.projects.iter().enumerate(){
        let final_dir=broot.join(&p.project_id);
        if !project_ready(p,&final_dir){
            let tmp=broot.join(format!(".{}.tmp",&p.project_id)); if tmp.exists(){let _=fs::remove_dir_all(&tmp);}fs::create_dir_all(&tmp).map_err(|e|e.to_string())?;
            fs::copy(&p.image_source,tmp.join(&p.image_name)).map_err(|e|format!("Изображение {}: {e}",p.project_id))?;
            for t in &p.tracks{fs::copy(&t.source,tmp.join(&t.dest_name)).map_err(|e|format!("Трек {}: {e}",t.source))?;}
            if final_dir.exists(){let _=fs::remove_dir_all(&final_dir);}fs::rename(&tmp,&final_dir).map_err(|e|e.to_string())?;
        }
        cp.completed_projects=i+1;cp.status="Подготовка".into();cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp)?;
        if let Some(a)=app{let _=a.emit("production-batch-progress",json!({"batchId":plan.batch_id,"completed":i+1,"total":plan.projects.len(),"stage":"files"}));}
    }
    let mut manifest=BatchManifest{schema_version:SCHEMA_VERSION,source:"VYRON Production Manager".into(),batch_id:plan.batch_id.clone(),channel_id:plan.request.channel_id.clone(),channel_name:plan.request.channel_name.clone(),created_at:plan.created_at.clone(),project_count:plan.projects.len(),tracks_per_project:plan.request.tracks_per_project,mode:plan.request.mode.clone(),root_path:plan.batch_root.clone(),output_dir:broot.join("Rendered").to_string_lossy().into_owned(),status_path:broot.join("status.json").to_string_lossy().into_owned(),status:"Готово".into(),projects:Vec::new()};
    fs::create_dir_all(&manifest.output_dir).map_err(|e|e.to_string())?;
    for p in &plan.projects{
        let folder=broot.join(&p.project_id);let tracks=p.tracks.iter().map(|t|ManifestTrack{track_id:t.track_id.clone(),path:folder.join(&t.dest_name).to_string_lossy().into_owned(),original_path:t.source.clone(),duration_sec:t.duration_sec}).collect::<Vec<_>>();
        manifest.projects.push(ManifestProject{project_id:p.project_id.clone(),job_id:p.job_id.clone(),video_number:p.video_number,folder_path:folder.to_string_lossy().into_owned(),image_path:folder.join(&p.image_name).to_string_lossy().into_owned(),total_duration_sec:tracks.iter().map(|x|x.duration_sec).sum(),tracks,status:"Waiting".into(),sequence_fingerprint:p.sequence_fingerprint.clone()});
    }
    atomic_json(&broot.join("batch.json"),&manifest)?;
    if !cp.history_applied{
        let hp=history_path(&plan.request.workspace,&plan.request.channel_id)?;let mut h:MusicHistory=read_json(&hp);h.schema_version=SCHEMA_VERSION;
        for p in &plan.projects{h.sequence_fingerprints.push(p.sequence_fingerprint.clone());for t in &p.tracks{let x=h.tracks.entry(t.track_id.clone()).or_insert(TrackUsage{track_id:t.track_id.clone(),original_path:t.source.clone(),times_used:0,last_used_at:None,batch_ids:Vec::new()});x.times_used+=1;x.last_used_at=Some(Utc::now().to_rfc3339());if !x.batch_ids.contains(&plan.batch_id){x.batch_ids.push(plan.batch_id.clone());}}}
        if h.sequence_fingerprints.len()>10000{let n=h.sequence_fingerprints.len()-10000;h.sequence_fingerprints.drain(0..n);}atomic_json(&hp,&h)?;cp.history_applied=true;
    }
    cp.status="Готово".into();cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp)?;
    let status=BatchStatus{batch_id:plan.batch_id.clone(),status:"Готово".into(),updated_at:Utc::now().to_rfc3339(),projects:manifest.projects.iter().map(|p|BatchProjectStatus{project_id:p.project_id.clone(),job_id:p.job_id.clone(),video_number:p.video_number,render_status:"Waiting".into(),output_file:None,duration:None,file_size:None,error:None}).collect()};
    atomic_json(Path::new(&manifest.status_path),&status)?;
    Ok(summary_from(&manifest,&status))
}

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

fn summary_from(m:&BatchManifest,s:&BatchStatus)->BatchSummary{
    BatchSummary{batch_id:m.batch_id.clone(),channel_id:m.channel_id.clone(),channel_name:m.channel_name.clone(),created_at:m.created_at.clone(),project_count:m.project_count,tracks_assigned:m.projects.iter().map(|p|p.tracks.len()).sum(),status:s.status.clone(),manifest_path:Path::new(&m.root_path).join("batch.json").to_string_lossy().into_owned(),root_path:m.root_path.clone(),completed_projects:s.projects.iter().filter(|p|p.render_status=="Completed").count(),error_projects:s.projects.iter().filter(|p|p.render_status=="Error").count()}
}
fn request_map(workspace:&str,channel_id:&str)->Result<HashMap<String,String>,String>{Ok(read_json(&requests_path(workspace,channel_id)?))}
fn save_request_map(workspace:&str,channel_id:&str,m:&HashMap<String,String>)->Result<(),String>{atomic_json(&requests_path(workspace,channel_id)?,m)}
fn load_manifest(path_or_root:&str)->Result<(BatchManifest,PathBuf),String>{
    let p=PathBuf::from(path_or_root);let mp=if p.is_dir(){p.join("batch.json")}else{p};let m:BatchManifest=serde_json::from_slice(&fs::read(&mp).map_err(|_|"batch.json не найден".to_string())?).map_err(|e|format!("batch.json: {e}"))?;Ok((m,mp))
}
#[tauri::command]
pub async fn build_production_batch(app:AppHandle,request:BuildRequest)->Result<BuildResult,String>{
    let available=read_json::<ImportSession>(&session_path(&request.workspace,&request.channel_id)?).collected.len();
    if request.project_count>available&&!request.allow_image_reuse{return Ok(BuildResult{status:"insufficient_images".into(),available_images:available,requested_projects:request.project_count,batch:None,message:Some(format!("Доступно {available}, запрошено {}",request.project_count))});}
    let app2=app.clone();
    tauri::async_runtime::spawn_blocking(move||{
        let _g=build_lock().lock().map_err(|_|"Build lock".to_string())?;
        let mut map=request_map(&request.workspace,&request.channel_id)?;
        if let Some(path)=map.get(&request.request_id).cloned(){if let Ok((m,_))=load_manifest(&path){let s:BatchStatus=read_json(Path::new(&m.status_path));return Ok(BuildResult{status:"ready".into(),available_images:available,requested_projects:request.project_count,batch:Some(summary_from(&m,&s)),message:None});}}
        let plan=plan_build(&request)?;let summary=execute_plan(Some(&app2),&plan)?;map.insert(request.request_id.clone(),summary.manifest_path.clone());save_request_map(&request.workspace,&request.channel_id,&map)?;
        Ok(BuildResult{status:"ready".into(),available_images:available,requested_projects:request.project_count,batch:Some(summary),message:None})
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn resume_production_batch(app:AppHandle,manifest_or_root:String)->Result<BatchSummary,String>{
    tauri::async_runtime::spawn_blocking(move||{let root=if Path::new(&manifest_or_root).is_dir(){PathBuf::from(&manifest_or_root)}else{Path::new(&manifest_or_root).parent().unwrap_or(Path::new(".")).to_path_buf()};let plan:BuildPlan=read_json(&root.join("plan.json"));if plan.batch_id.is_empty(){let(m,_)=load_manifest(&manifest_or_root)?;let s:BatchStatus=read_json(Path::new(&m.status_path));return Ok(summary_from(&m,&s));}execute_plan(Some(&app),&plan)}).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub fn read_production_batch_status(manifest_path:String)->Result<BatchStatus,String>{let(m,_)=load_manifest(&manifest_path)?;Ok(read_json(Path::new(&m.status_path)))}
#[tauri::command]
pub fn list_production_batches(workspace:String,channel_id:String)->Result<Vec<BatchSummary>,String>{
    let parent=batch_root_parent(&workspace,&channel_id)?;let mut out=Vec::new();
    if let Ok(rd)=fs::read_dir(parent){for e in rd.flatten(){let p=e.path();if !p.is_dir(){continue;}if let Ok((m,_))=load_manifest(&p.to_string_lossy()){let s:BatchStatus=read_json(Path::new(&m.status_path));out.push(summary_from(&m,&s));}}}
    out.sort_by(|a,b|b.created_at.cmp(&a.created_at));Ok(out)
}
#[tauri::command]
pub fn production_channel_state(workspace:String,channel_id:String)->Result<ChannelState,String>{
    let settings:ChannelSettings=read_json(&settings_path(&workspace,&channel_id)?);let import_session:ImportSession=normalize_import_runtime(&workspace,&channel_id,read_json(&session_path(&workspace,&channel_id)?));let idx:MusicIndex=read_json(&index_path(&workspace,&channel_id)?);
    let music=if idx.library_path.is_empty(){None}else{Some(MusicSummary{library_path:idx.library_path,tracks:idx.tracks.len(),indexed_at:idx.indexed_at})};
    Ok(ChannelState{settings,import_session,music,batches:list_production_batches(workspace,channel_id)?})
}
#[tauri::command]
pub fn validate_production_batch(manifest_path:String,endlume_path:String)->Result<Validation,String>{
    let(m,_)=load_manifest(&manifest_path)?;let mut items=Vec::new();let mut fps=HashSet::new();
    for p in &m.projects{
        let mut errs=Vec::new();let folder=Path::new(&p.folder_path);
        if !folder.is_dir(){errs.push("папка проекта не найдена".to_string());}
        // VYRON validates renderability, not the number of visual assets. ENDLUME owns
        // multi-image transitions and may legitimately use 1, 2 or more images.
        // Prefer the exact manifest image produced by VYRON. If it was manually changed
        // or removed, accept any other non-hidden supported image in the project folder.
        if !project_has_renderable_image(folder,Path::new(&p.image_path)){
            errs.push("изображение не найдено".to_string());
        }
        if p.tracks.len()!=m.tracks_per_project{errs.push(format!("треков: {}, должно быть {}",p.tracks.len(),m.tracks_per_project));}
        for t in &p.tracks{let q=Path::new(&t.path);if !q.is_file(){errs.push(format!("нет {}",q.file_name().and_then(|x|x.to_str()).unwrap_or("track")));}else if fs::metadata(q).map(|x|x.len()==0).unwrap_or(true){errs.push("найден 0-byte аудиофайл".into());}if !is_audio(q){errs.push("неподдерживаемый аудиоформат".into());}}
        if !fps.insert(p.sequence_fingerprint.clone()){errs.push("повтор музыкальной последовательности".into());}
        items.push(ValidationItem{project_id:p.project_id.clone(),ok:errs.is_empty(),error:if errs.is_empty(){None}else{Some(errs.join(" • "))}});
    }
    let ready=items.iter().filter(|x|x.ok).count();let errors=items.len()-ready;Ok(Validation{batch_id:m.batch_id,ready,errors,endlume_exists:Path::new(&endlume_path).exists(),items})
}
fn canonical_under(root:&Path,path:&Path)->Result<PathBuf,String>{let r=root.canonicalize().map_err(|_|"Workspace недоступен".to_string())?;let p=path.canonicalize().map_err(|_|format!("Путь не найден: {}",path.display()))?;if !p.starts_with(&r){return Err("Отказано: путь проекта находится вне workspace VYRON".into())}Ok(p)}
#[tauri::command]
pub fn delete_production_job_folder(workspace:String,folder:String)->Result<(),String>{if folder.trim().is_empty(){return Ok(())}let root=PathBuf::from(workspace);let p=PathBuf::from(folder);if !p.exists(){return Ok(())}let safe=canonical_under(&root,&p)?;if safe==root.canonicalize().map_err(|e|e.to_string())?{return Err("Нельзя удалить корень workspace".into())}fs::remove_dir_all(safe).map_err(|e|format!("Не удалось удалить папку проекта: {e}"))}

#[tauri::command]
pub fn delete_production_batch_projects(manifest_path:String,project_ids:Vec<String>)->Result<DeleteResult,String>{
    let(mut m,mp)=load_manifest(&manifest_path)?;let wanted=project_ids.into_iter().collect::<HashSet<_>>();if wanted.is_empty(){return Ok(DeleteResult{deleted_project_ids:Vec::new(),deleted_job_ids:Vec::new(),batch:Some(summary_from(&m,&read_json(Path::new(&m.status_path))))})}
    let selected=m.projects.iter().filter(|p|wanted.contains(&p.project_id)).cloned().collect::<Vec<_>>();if selected.is_empty(){return Err("Выбранные проекты не найдены в batch".into())}
    let deleted_project_ids=selected.iter().map(|p|p.project_id.clone()).collect::<Vec<_>>();let deleted_job_ids=selected.iter().filter_map(|p|p.job_id.clone()).collect::<Vec<_>>();for p in &selected{let dir=PathBuf::from(&p.folder_path);if dir.exists(){let root=PathBuf::from(&m.root_path).canonicalize().map_err(|e|e.to_string())?;let safe=dir.canonicalize().map_err(|e|e.to_string())?;if safe.starts_with(&root)&&safe!=root{fs::remove_dir_all(safe).map_err(|e|format!("Не удалось удалить проект {}: {e}",p.project_id))?}}}
    m.projects.retain(|p|!wanted.contains(&p.project_id));m.project_count=m.projects.len();
    let status_path=PathBuf::from(&m.status_path);let mut st:BatchStatus=read_json(&status_path);st.projects.retain(|p|!wanted.contains(&p.project_id));st.status=if st.projects.is_empty(){"Удалён".into()}else{"Готово".into()};st.updated_at=Utc::now().to_rfc3339();
    let broot=PathBuf::from(&m.root_path);let plan_path=broot.join("plan.json");if plan_path.exists(){let mut plan:BuildPlan=read_json(&plan_path);plan.projects.retain(|p|!wanted.contains(&p.project_id));plan.request.project_count=plan.projects.len();atomic_json(&plan_path,&plan)?;let cp_path=broot.join("checkpoint.json");let mut cp:Checkpoint=read_json(&cp_path);cp.total_projects=plan.projects.len();cp.completed_projects=cp.completed_projects.min(cp.total_projects);cp.updated_at=Utc::now().to_rfc3339();atomic_json(&cp_path,&cp)?;}
    if m.projects.is_empty(){fs::remove_dir_all(&broot).map_err(|e|format!("Не удалось удалить batch: {e}"))?;return Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:None})}
    atomic_json(&mp,&m)?;atomic_json(&status_path,&st)?;let summary=summary_from(&m,&st);Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:Some(summary)})
}

#[tauri::command]
pub fn open_production_batch_in_endlume(endlume_path:String,manifest_path:String)->Result<HandoffReceipt,String>{
    let(m,_)=load_manifest(&manifest_path)?;let app=PathBuf::from(&endlume_path);if !app.exists(){return Err("ENDLUME Studio не найден".into());}
    #[cfg(target_os="macos")]
    {
        let home=std::env::var("HOME").map_err(|_|"HOME не найден".to_string())?;let inbox=PathBuf::from(home).join("Library/Application Support/studio.endlume.desktop/VYRON Inbox");fs::create_dir_all(&inbox).map_err(|e|e.to_string())?;
        let request=inbox.join(format!("{}.json",safe_component(&m.batch_id)));atomic_json(&request,&json!({"schemaVersion":1,"batchId":m.batch_id,"manifestPath":manifest_path,"requestedAt":Utc::now().to_rfc3339()}))?;
        if !request.is_file(){return Err("Не удалось создать inbox-запрос ENDLUME".into())}Command::new("open").arg(&app).spawn().map_err(|e|format!("Не удалось открыть ENDLUME: {e}"))?;
        return Ok(HandoffReceipt{batch_id:m.batch_id,manifest_path,request_path:request.to_string_lossy().into_owned()});
    }
    #[cfg(not(target_os="macos"))]
    {Command::new(&app).spawn().map_err(|e|e.to_string())?;Ok(HandoffReceipt{batch_id:m.batch_id,manifest_path,request_path:String::new()})}
}
#[tauri::command]
pub fn production_endlume_handoff_consumed(request_path:String)->Result<bool,String>{if request_path.is_empty(){return Ok(true)}Ok(!Path::new(&request_path).exists())}

#[cfg(test)]
#[path = "production_manager_tests.rs"]
mod production_manager_tests;

#[cfg(test)]
mod v1015_image_validation_tests {
    use super::*;

    fn temp_project(name:&str)->PathBuf{
        let p=std::env::temp_dir().join(format!("vyron-v1015-{name}-{}",Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn one_manifest_image_is_valid(){
        let d=temp_project("one");let img=d.join("image.png");fs::write(&img,b"png").unwrap();
        assert!(project_has_renderable_image(&d,&img));let _=fs::remove_dir_all(d);
    }

    #[test]
    fn multiple_images_are_valid_for_endlume(){
        let d=temp_project("many");let img=d.join("image.png");fs::write(&img,b"png").unwrap();fs::write(d.join("transition.jpg"),b"jpg").unwrap();
        assert!(project_has_renderable_image(&d,&img));let _=fs::remove_dir_all(d);
    }

    #[test]
    fn fallback_image_is_valid_if_manifest_path_was_changed(){
        let d=temp_project("fallback");fs::write(d.join("other.webp"),b"webp").unwrap();
        assert!(project_has_renderable_image(&d,&d.join("missing.png")));let _=fs::remove_dir_all(d);
    }

    #[test]
    fn hidden_phantom_image_does_not_make_empty_project_valid(){
        let d=temp_project("hidden");fs::write(d.join(".phantom.png"),b"hidden").unwrap();
        assert!(!project_has_renderable_image(&d,&d.join("missing.png")));let _=fs::remove_dir_all(d);
    }
}

