use chrono::Utc;
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{
    collections::{HashMap,HashSet},
    fs::{self,File},
    io::{Read,Seek,SeekFrom,Write},
    path::{Path,PathBuf},
    process::Command,
    sync::{Arc,Mutex,OnceLock,atomic::{AtomicBool,Ordering}},
    thread,
    time::{Duration,SystemTime,UNIX_EPOCH},
};
use tauri::{AppHandle,Emitter};
use uuid::Uuid;

const SCHEMA_VERSION:u32=1;
const IMAGE_EXT:&[&str]=&["jpg","jpeg","png","webp"];
const AUDIO_EXT:&[&str]=&["mp3","wav","m4a","aac","flac","ogg","opus","aiff","aif","alac"];
static IMPORT_STOPS:OnceLock<Mutex<HashMap<String,Arc<AtomicBool>>>>=OnceLock::new();
static BUILD_LOCK:OnceLock<Mutex<()>>=OnceLock::new();

fn import_stops()->&'static Mutex<HashMap<String,Arc<AtomicBool>>>{IMPORT_STOPS.get_or_init(||Mutex::new(HashMap::new()))}
fn build_lock()->&'static Mutex<()>{BUILD_LOCK.get_or_init(||Mutex::new(()))}
fn now_ms()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64}
fn ext(p:&Path)->String{p.extension().and_then(|x|x.to_str()).unwrap_or("").to_ascii_lowercase()}
fn is_image(p:&Path)->bool{IMAGE_EXT.contains(&ext(p).as_str())}
fn is_audio(p:&Path)->bool{AUDIO_EXT.contains(&ext(p).as_str())}
fn safe_component(raw:&str)->String{
    let mut out=raw.chars().map(|c|if c.is_alphanumeric()||c=='-'||c=='_'||c==' ' {c}else{'_'}).collect::<String>();
    out=out.trim().trim_matches('.').chars().take(80).collect();
    if out.is_empty(){"Channel".into()}else{out}
}
fn channel_key(id:&str)->String{let x=id.chars().filter(|c|c.is_ascii_alphanumeric()||*c=='-'||*c=='_').take(80).collect::<String>();if x.is_empty(){"channel".into()}else{x}}
fn workspace_root(workspace:&str)->Result<PathBuf,String>{
    if workspace.trim().is_empty(){return Err("Workspace VYRON не выбран".into())}
    let root=PathBuf::from(workspace).join("ProductionManager");
    fs::create_dir_all(&root).map_err(|e|format!("Production Manager: не удалось создать папку: {e}"))?;
    Ok(root)
}
fn channel_root(workspace:&str,channel_id:&str)->Result<PathBuf,String>{let p=workspace_root(workspace)?.join("Channels").join(channel_key(channel_id));fs::create_dir_all(&p).map_err(|e|e.to_string())?;Ok(p)}
fn batches_root(workspace:&str,channel_id:&str)->Result<PathBuf,String>{let p=workspace_root(workspace)?.join("Batches").join(channel_key(channel_id));fs::create_dir_all(&p).map_err(|e|e.to_string())?;Ok(p)}
fn write_json_atomic<T:Serialize>(path:&Path,value:&T)->Result<(),String>{
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|e.to_string())?}
    let tmp=path.with_extension(format!("{}.tmp",path.extension().and_then(|x|x.to_str()).unwrap_or("json")));
    fs::write(&tmp,serde_json::to_vec_pretty(value).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    if path.exists(){let _=fs::remove_file(path);}fs::rename(&tmp,path).map_err(|e|e.to_string())
}
fn read_json<T:for<'de>Deserialize<'de>+Default>(path:&Path)->T{fs::read(path).ok().and_then(|b|serde_json::from_slice(&b).ok()).unwrap_or_default()}
fn hash_file(path:&Path)->Result<String,String>{let mut f=File::open(path).map_err(|e|e.to_string())?;let mut h=Sha256::new();let mut buf=[0u8;1024*1024];loop{let n=f.read(&mut buf).map_err(|e|e.to_string())?;if n==0{break}h.update(&buf[..n]);}Ok(hex::encode(h.finalize()))}
fn sequence_hash(ids:&[String])->String{let mut h=Sha256::new();for id in ids{h.update(id.as_bytes());h.update(b"\n");}hex::encode(h.finalize())}
fn modified_ms(meta:&fs::Metadata)->u64{meta.modified().ok().and_then(|x|x.duration_since(UNIX_EPOCH).ok()).map(|x|x.as_millis() as u64).unwrap_or(0)}
fn recursive_audio(root:&Path)->Vec<PathBuf>{
    let mut out=Vec::new();let mut stack=vec![root.to_path_buf()];
    while let Some(dir)=stack.pop(){if let Ok(rd)=fs::read_dir(dir){for e in rd.flatten(){let p=e.path();let ft=e.file_type().ok();if ft.as_ref().map(|x|x.is_symlink()).unwrap_or(false){continue}if ft.as_ref().map(|x|x.is_dir()).unwrap_or(false){stack.push(p)}else if p.is_file()&&is_audio(&p){out.push(p)}}}}
    out.sort();out
}
fn downloads_dir()->Result<PathBuf,String>{let home=std::env::var("HOME").map_err(|_|"Не удалось определить HOME пользователя".to_string())?;let p=PathBuf::from(home).join("Downloads");if !p.is_dir(){return Err("Папка Downloads не найдена".into())}Ok(p)}
fn top_images(dir:&Path)->HashSet<String>{fs::read_dir(dir).ok().into_iter().flatten().filter_map(Result::ok).map(|e|e.path()).filter(|p|p.is_file()&&is_image(p)).map(|p|p.to_string_lossy().to_string()).collect()}
fn nonzero(path:&Path)->bool{path.is_file()&&fs::metadata(path).map(|m|m.len()>0).unwrap_or(false)}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct CollectedImage{pub id:String,pub number:u32,pub path:String,pub source_path:String,pub captured_at:String}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ImportSession{pub schema_version:u32,pub session_id:String,pub channel_id:String,pub channel_name:String,pub active:bool,pub started_at:String,pub stopped_at:Option<String>,pub downloads_path:String,pub import_path:String,pub collected:Vec<CollectedImage>}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ChannelProductionSettings{pub schema_version:u32,pub channel_id:String,pub channel_name:String,pub music_library:String,pub updated_at:String}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct TrackIndexEntry{pub track_id:String,pub path:String,pub size:u64,pub modified_ms:u64,pub duration_sec:f64}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct MusicIndex{pub schema_version:u32,pub library_path:String,pub indexed_at:String,pub tracks:Vec<TrackIndexEntry>}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct TrackUsage{pub track_id:String,pub original_path:String,pub times_used:u64,pub last_used_at:Option<String>,pub batch_ids:Vec<String>}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct MusicHistory{pub schema_version:u32,pub tracks:HashMap<String,TrackUsage>,pub sequence_fingerprints:Vec<String>}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct MusicIndexSummary{pub library_path:String,pub tracks:usize,pub indexed_at:String}

#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct JobLink{pub job_id:String,pub number:u32}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ProductionBuildRequest{
    pub request_id:String,pub workspace:String,pub channel_id:String,pub channel_name:String,
    pub project_count:usize,pub tracks_per_project:usize,pub mode:String,pub allow_image_reuse:bool,
    #[serde(default)] pub job_links:Vec<JobLink>,
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct PlannedTrack{pub track_id:String,pub original_path:String,pub duration_sec:f64,pub destination_name:String}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct PlannedProject{pub project_id:String,pub job_id:Option<String>,pub video_number:Option<u32>,pub image_source:String,pub image_name:String,pub tracks:Vec<PlannedTrack>,pub sequence_fingerprint:String}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BuildPlan{pub schema_version:u32,pub request:Option<ProductionBuildRequest>,pub batch_id:String,pub batch_root:String,pub created_at:String,pub projects:Vec<PlannedProject>}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BuildCheckpoint{pub schema_version:u32,pub batch_id:String,pub completed_projects:usize,pub total_projects:usize,pub status:String,pub updated_at:String}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ManifestTrack{pub track_id:String,pub path:String,pub original_path:String,pub duration_sec:f64}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ManifestProject{pub project_id:String,pub job_id:Option<String>,pub video_number:Option<u32>,pub folder_path:String,pub image_path:String,pub tracks:Vec<ManifestTrack>,pub total_duration_sec:f64,pub status:String,pub sequence_fingerprint:String}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchManifest{
    pub schema_version:u32,pub source:String,pub batch_id:String,pub channel_id:String,pub channel_name:String,pub created_at:String,
    pub project_count:usize,pub tracks_per_project:usize,pub mode:String,pub root_path:String,pub output_dir:String,pub status_path:String,pub status:String,pub projects:Vec<ManifestProject>
}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchSummary{pub batch_id:String,pub channel_id:String,pub channel_name:String,pub created_at:String,pub project_count:usize,pub tracks_assigned:usize,pub status:String,pub manifest_path:String,pub root_path:String,pub completed_projects:usize,pub error_projects:usize}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BuildBatchResult{pub status:String,pub available_images:usize,pub requested_projects:usize,pub batch:Option<BatchSummary>,pub message:Option<String>}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchValidationItem{pub project_id:String,pub ok:bool,pub error:Option<String>}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct BatchValidation{pub batch_id:String,pub ready:usize,pub errors:usize,pub endlume_exists:bool,pub items:Vec<BatchValidationItem>}
#[derive(Clone,Debug,Serialize,Deserialize,Default)]
#[serde(rename_all="camelCase")]
pub struct ChannelProductionState{pub settings:ChannelProductionSettings,pub import_session:ImportSession,pub music:Option<MusicIndexSummary>,pub batches:Vec<BatchSummary>}

fn session_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("import-session.json"))}
fn settings_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("settings.json"))}
fn music_index_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("music-index.json"))}
fn history_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("music-history.json"))}
fn request_map_path(workspace:&str,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(workspace,channel_id)?.join("build-requests.json"))}

#[tauri::command]
pub fn start_production_import(app:AppHandle,workspace:String,channel_id:String,channel_name:String)->Result<ImportSession,String>{
    let downloads=downloads_dir()?;let croot=channel_root(&workspace,&channel_id)?;let session_id=Uuid::new_v4().to_string();let import_dir=croot.join("Imports").join(&session_id);fs::create_dir_all(&import_dir).map_err(|e|e.to_string())?;
    let state_path=session_path(&workspace,&channel_id)?;
    if let Ok(map)=import_stops().lock(){if map.get(&channel_id).map(|f|!f.load(Ordering::SeqCst)).unwrap_or(false){return Err("Для этого канала сбор изображений уже запущен".into())}}
    let state=ImportSession{schema_version:SCHEMA_VERSION,session_id:session_id.clone(),channel_id:channel_id.clone(),channel_name:channel_name.clone(),active:true,started_at:Utc::now().to_rfc3339(),stopped_at:None,downloads_path:downloads.to_string_lossy().into_owned(),import_path:import_dir.to_string_lossy().into_owned(),collected:Vec::new()};
    write_json_atomic(&state_path,&state)?;
    let stop=Arc::new(AtomicBool::new(false));import_stops().lock().map_err(|_|"Import lock poisoned".to_string())?.insert(channel_id.clone(),stop.clone());
    let initial=top_images(&downloads);let app2=app.clone();let cid=channel_id.clone();
    thread::spawn(move||{
        let mut seen=initial;let mut local=state;
        while !stop.load(Ordering::SeqCst){
            let mut candidates=fs::read_dir(&downloads).ok().into_iter().flatten().filter_map(Result::ok).map(|e|e.path()).filter(|p|p.is_file()&&is_image(p)).collect::<Vec<_>>();candidates.sort_by_key(|p|fs::metadata(p).ok().and_then(|m|m.modified().ok()).unwrap_or(UNIX_EPOCH));
            for src in candidates{let key=src.to_string_lossy().to_string();if seen.contains(&key){continue}seen.insert(key.clone());if !nonzero(&src){continue}let no=(local.collected.len()+1) as u32;let ex=ext(&src);let dst=import_dir.join(format!("{:03}.{}",no,ex));if fs::copy(&src,&dst).is_err(){continue}let item=CollectedImage{id:Uuid::new_v4().to_string(),number:no,path:dst.to_string_lossy().into_owned(),source_path:key,captured_at:Utc::now().to_rfc3339()};local.collected.push(item);let _=write_json_atomic(&state_path,&local);let _=app2.emit("production-import-progress",json!({"channelId":cid,"collected":local.collected.len(),"sessionId":local.session_id}));}
            thread::sleep(Duration::from_millis(750));
        }
        local.active=false;local.stopped_at=Some(Utc::now().to_rfc3339());let _=write_json_atomic(&state_path,&local);
    });
    Ok(read_json(&session_path(&workspace,&channel_id)?))
}

#[tauri::command]
pub fn stop_production_import(workspace:String,channel_id:String)->Result<ImportSession,String>{
    if let Ok(map)=import_stops().lock(){if let Some(flag)=map.get(&channel_id){flag.store(true,Ordering::SeqCst)}}
    let p=session_path(&workspace,&channel_id)?;let mut s:ImportSession=read_json(&p);s.active=false;if s.stopped_at.is_none(){s.stopped_at=Some(Utc::now().to_rfc3339())}write_json_atomic(&p,&s)?;Ok(s)
}
#[tauri::command]
pub fn production_import_status(workspace:String,channel_id:String)->Result<ImportSession,String>{Ok(read_json(&session_path(&workspace,&channel_id)?))}

#[tauri::command]
pub fn set_production_music_library(workspace:String,channel_id:String,channel_name:String,path:String)->Result<ChannelProductionSettings,String>{
    let p=PathBuf::from(path);let canonical=p.canonicalize().map_err(|_|"Папка музыкальной библиотеки не найдена".to_string())?;if !canonical.is_dir(){return Err("Музыкальная библиотека должна быть папкой".into())}
    let s=ChannelProductionSettings{schema_version:SCHEMA_VERSION,channel_id:channel_id.clone(),channel_name,music_library:canonical.to_string_lossy().into_owned(),updated_at:Utc::now().to_rfc3339()};write_json_atomic(&settings_path(&workspace,&channel_id)?,&s)?;Ok(s)
}

fn wav_duration(path:&Path)->Option<f64>{
    let mut f=File::open(path).ok()?;let mut head=[0u8;12];f.read_exact(&mut head).ok()?;if &head[0..4]!=b"RIFF"||&head[8..12]!=b"WAVE"{return None}let mut byte_rate=0u32;let mut data_size=0u32;
    loop{let mut h=[0u8;8];if f.read_exact(&mut h).is_err(){break}let size=u32::from_le_bytes([h[4],h[5],h[6],h[7]]);if &h[0..4]==b"fmt "{let mut buf=vec![0u8;size as usize];f.read_exact(&mut buf).ok()?;if buf.len()>=12{byte_rate=u32::from_le_bytes([buf[8],buf[9],buf[10],buf[11]])}}else if &h[0..4]==b"data"{data_size=size;let _=f.seek(SeekFrom::Current(size as i64));}else{let _=f.seek(SeekFrom::Current(size as i64));}if size%2==1{let _=f.seek(SeekFrom::Current(1));}}
    if byte_rate>0&&data_size>0{Some(data_size as f64/byte_rate as f64)}else{None}
}
fn afinfo_duration(path:&Path)->Option<f64>{
    #[cfg(target_os="macos")]{let out=Command::new("/usr/bin/afinfo").arg(path).output().ok()?;let text=String::from_utf8_lossy(&out.stdout);for line in text.lines(){let l=line.trim().to_ascii_lowercase();if l.starts_with("estimated duration:"){let raw=line.split(':').nth(1)?.trim().split_whitespace().next()?;if let Ok(v)=raw.parse::<f64>(){return Some(v)}}}None}
    #[cfg(not(target_os="macos"))]{let _=path;None}
}
fn audio_duration(path:&Path)->f64{if ext(path)=="wav"{if let Some(v)=wav_duration(path){return v}}afinfo_duration(path).unwrap_or(0.0)}

fn index_music_sync(workspace:&str,channel_id:&str)->Result<MusicIndex,String>{
    let settings:ChannelProductionSettings=read_json(&settings_path(workspace,channel_id)?);if settings.music_library.trim().is_empty(){return Err("Сначала выбери папку музыки для канала".into())}
    let root=PathBuf::from(&settings.music_library).canonicalize().map_err(|_|"Музыкальная библиотека недоступна".to_string())?;let old:MusicIndex=read_json(&music_index_path(workspace,channel_id)?);let old_map=old.tracks.into_iter().map(|t|(t.path.clone(),t)).collect::<HashMap<_,_>>();let mut tracks=Vec::new();
    for p in recursive_audio(&root){let meta=fs::metadata(&p).map_err(|e|e.to_string())?;if meta.len()==0{continue}let path=p.to_string_lossy().into_owned();let mm=modified_ms(&meta);if let Some(prev)=old_map.get(&path).filter(|x|x.size==meta.len()&&x.modified_ms==mm){tracks.push(prev.clone());continue}let id=hash_file(&p)?;tracks.push(TrackIndexEntry{track_id:id,path,size:meta.len(),modified_ms:mm,duration_sec:audio_duration(&p)});}
    tracks.sort_by(|a,b|a.path.cmp(&b.path));let idx=MusicIndex{schema_version:SCHEMA_VERSION,library_path:root.to_string_lossy().into_owned(),indexed_at:Utc::now().to_rfc3339(),tracks};write_json_atomic(&music_index_path(workspace,channel_id)?,&idx)?;Ok(idx)
}
#[tauri::command]
pub async fn index_production_music_library(workspace:String,channel_id:String)->Result<MusicIndexSummary,String>{
    let idx=tauri::async_runtime::spawn_blocking(move||index_music_sync(&workspace,&channel_id)).await.map_err(|e|e.to_string())??;Ok(MusicIndexSummary{library_path:idx.library_path,tracks:idx.tracks.len(),indexed_at:idx.indexed_at})
}

fn seed64(text:&str)->u64{let h=Sha256::digest(text.as_bytes());u64::from_le_bytes(h[0..8].try_into().unwrap())}
fn shuffle<T>(v:&mut [T],mut seed:u64){if v.len()<2{return}for i in (1..v.len()).rev(){seed^=seed<<13;seed^=seed>>7;seed^=seed<<17;let j=(seed as usize)%(i+1);v.swap(i,j)}}
fn choose_sequence(mode:&str,tracks:&[TrackIndexEntry],history:&MusicHistory,planned:&mut HashMap<String,u64>,global_cursor:&mut usize,global_pool:&mut Vec<usize>,count:usize,batch_id:&str,project_no:usize,seen:&HashSet<String>)->Result<Vec<usize>,String>{
    if tracks.len()<count{return Err(format!("В библиотеке {} уникальных треков, а на один проект требуется {count}",tracks.len()))}
    for attempt in 0..80usize{
        let salt=format!("{batch_id}:{project_no}:{attempt}:{mode}");let mut picked=Vec::new();
        if mode=="even"{
            let mut scored=(0..tracks.len()).map(|i|{let id=&tracks[i].track_id;let used=history.tracks.get(id).map(|x|x.times_used).unwrap_or(0)+planned.get(id).copied().unwrap_or(0);(used,seed64(&format!("{salt}:{id}")),i)}).collect::<Vec<_>>();scored.sort_by_key(|x|(x.0,x.1));picked=scored.into_iter().take(count).map(|x|x.2).collect();
        }else if mode=="no-repeat"{
            let mut local=HashSet::new();while picked.len()<count{if *global_cursor>=global_pool.len(){*global_pool=(0..tracks.len()).collect();shuffle(global_pool,seed64(&format!("{salt}:cycle:{}",picked.len())));*global_cursor=0}let i=global_pool[*global_cursor];*global_cursor+=1;if local.insert(i){picked.push(i)}}
        }else{let mut pool=(0..tracks.len()).collect::<Vec<_>>();shuffle(&mut pool,seed64(&salt));picked=pool.into_iter().take(count).collect();}
        shuffle(&mut picked,seed64(&format!("{salt}:order")));if project_no>0&&picked.len()>1{let first=tracks[picked[0]].track_id.clone();let last=tracks[picked[picked.len()-1]].track_id.clone();if first==last{picked.rotate_left(1)}}
        let ids=picked.iter().map(|i|tracks[*i].track_id.clone()).collect::<Vec<_>>();if !seen.contains(&sequence_hash(&ids)){return Ok(picked)}
    }
    Err("Не удалось создать уникальный порядок музыки после 80 попыток".into())
}

fn next_batch_id(root:&Path,channel_name:&str)->String{let date=Utc::now().format("%Y-%m-%d").to_string();let prefix=format!("{}_BATCH_{}_",