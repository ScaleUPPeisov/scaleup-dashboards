use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION:u32=1;
const CHUNK_SIZE:usize=250;
static QUEUE_LOCK:OnceLock<Mutex<()>>=OnceLock::new();
fn queue_lock()->&'static Mutex<()>{QUEUE_LOCK.get_or_init(||Mutex::new(()))}

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct MetadataInput{
    #[serde(default)] pub source_number:Option<u64>,
    #[serde(default)] pub title:Option<String>,
    #[serde(default)] pub description:Option<String>,
    #[serde(default)] pub tags:Vec<String>,
    #[serde(default)] pub publish_at:Option<String>,
    #[serde(default)] pub publish_time:Option<String>,
    #[serde(default)] pub publish_timezone:Option<String>,
    #[serde(default)] pub publish_utc_offset_minutes:Option<i32>,
}

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct MetadataRecord{
    pub id:String,
    pub channel_id:String,
    pub pack_id:String,
    pub sequence:u64,
    #[serde(default)] pub source_number:Option<u64>,
    #[serde(default)] pub title:Option<String>,
    #[serde(default)] pub description:Option<String>,
    #[serde(default)] pub tags:Vec<String>,
    #[serde(default)] pub publish_at:Option<String>,
    #[serde(default)] pub publish_time:Option<String>,
    #[serde(default)] pub publish_timezone:Option<String>,
    #[serde(default)] pub publish_utc_offset_minutes:Option<i32>,
    pub status:String,
    #[serde(default)] pub reserved_job_id:Option<String>,
    #[serde(default)] pub reserved_video_number:Option<u64>,
    #[serde(default)] pub youtube_video_id:Option<String>,
    pub created_at:String,
    #[serde(default)] pub reserved_at:Option<String>,
    #[serde(default)] pub applied_at:Option<String>,
    pub source_hash:String,
    pub record_hash:String,
    #[serde(default)] pub error:Option<String>,
}

#[derive(Debug,Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct QueueCounts{
    available:usize,
    reserved:usize,
    applying:usize,
    applied:usize,
    error:usize,
}

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct PackManifest{
    schema_version:u32,
    pack_id:String,
    channel_id:String,
    channel_name:String,
    source_name:String,
    source_hash:String,
    pack_hash:String,
    created_at:String,
    total:usize,
    chunk_size:usize,
    chunks:usize,
    counts:QueueCounts,
    complete:bool,
    purged:bool,
}

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct PackRef{
    pack_id:String,
    pack_hash:String,
    source_hash:String,
    created_at:String,
    total:usize,
    complete:bool,
    purged:bool,
}

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct ChannelIndex{
    schema_version:u32,
    channel_id:String,
    channel_name:String,
    packs:Vec<PackRef>,
}

#[derive(Debug,Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct QueueSummary{
    channel_id:String,
    total:usize,
    active_total:usize,
    available:usize,
    reserved:usize,
    applying:usize,
    applied:usize,
    error:usize,
    packs:usize,
    complete_packs:usize,
    purged_packs:usize,
    complete_pack_ids:Vec<String>,
    next_sequence:Option<u64>,
}

#[derive(Debug,Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct QueueImportResult{
    pack_id:String,
    pack_hash:String,
    existing:usize,
    added:usize,
    duplicate:bool,
    summary:QueueSummary,
}

#[derive(Debug,Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct QueuePage{
    channel_id:String,
    offset:usize,
    limit:usize,
    total_matching:usize,
    rows:Vec<MetadataRecord>,
}

fn now()->String{chrono::Utc::now().to_rfc3339()}
fn sha256_bytes(bytes:&[u8])->String{hex::encode(Sha256::digest(bytes))}
fn safe_channel_key(channel_id:&str)->String{sha256_bytes(channel_id.as_bytes())[..24].to_string()}

fn root(app:&AppHandle)->Result<PathBuf,String>{
    let p=app.path().document_dir().map_err(|e|format!("METADATA_QUEUE_DOCUMENTS_PATH: {e}"))?
        .join("VYRON").join("MetadataQueue");
    fs::create_dir_all(&p).map_err(|e|format!("METADATA_QUEUE_MKDIR: {e}"))?;
    Ok(p)
}
fn channel_root(app:&AppHandle,channel_id:&str)->Result<PathBuf,String>{
    let p=root(app)?.join("channels").join(safe_channel_key(channel_id));
    fs::create_dir_all(&p).map_err(|e|format!("METADATA_QUEUE_CHANNEL_MKDIR: {e}"))?;
    Ok(p)
}
fn index_path(app:&AppHandle,channel_id:&str)->Result<PathBuf,String>{Ok(channel_root(app,channel_id)?.join("index.json"))}
fn pack_root(app:&AppHandle,channel_id:&str,pack_id:&str)->Result<PathBuf,String>{
    Ok(channel_root(app,channel_id)?.join("packs").join(pack_id))
}
fn manifest_path(app:&AppHandle,channel_id:&str,pack_id:&str)->Result<PathBuf,String>{
    Ok(pack_root(app,channel_id,pack_id)?.join("manifest.json"))
}
fn chunk_path(app:&AppHandle,channel_id:&str,pack_id:&str,chunk:usize)->Result<PathBuf,String>{
    Ok(pack_root(app,channel_id,pack_id)?.join("payload").join(format!("chunk-{chunk:06}.json")))
}
fn ledger_path(app:&AppHandle,channel_id:&str,pack_id:&str)->Result<PathBuf,String>{
    Ok(channel_root(app,channel_id)?.join("ledger").join(format!("{pack_id}.json")))
}

fn atomic_write(path:&Path,bytes:&[u8])->Result<(),String>{
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|format!("METADATA_QUEUE_MKDIR: {e}"))?;}
    let tmp=path.with_extension(format!("tmp-{}",std::process::id()));
    fs::write(&tmp,bytes).map_err(|e|format!("METADATA_QUEUE_WRITE: {e}"))?;
    if path.exists(){fs::remove_file(path).map_err(|e|format!("METADATA_QUEUE_REPLACE: {e}"))?;}
    fs::rename(&tmp,path).map_err(|e|format!("METADATA_QUEUE_RENAME: {e}"))
}
fn write_json<T:Serialize>(path:&Path,value:&T)->Result<(),String>{
    let bytes=serde_json::to_vec_pretty(value).map_err(|e|format!("METADATA_QUEUE_SERIALIZE: {e}"))?;
    atomic_write(path,&bytes)
}
fn read_json<T:for<'de>Deserialize<'de>>(path:&Path)->Result<T,String>{
    let bytes=fs::read(path).map_err(|e|format!("METADATA_QUEUE_READ {}: {e}",path.display()))?;
    serde_json::from_slice(&bytes).map_err(|e|format!("METADATA_QUEUE_PARSE {}: {e}",path.display()))
}
fn empty_index(channel_id:&str,channel_name:&str)->ChannelIndex{
    ChannelIndex{schema_version:SCHEMA_VERSION,channel_id:channel_id.to_string(),channel_name:channel_name.to_string(),packs:Vec::new()}
}
fn load_index(app:&AppHandle,channel_id:&str,channel_name:&str)->Result<ChannelIndex,String>{
    let path=index_path(app,channel_id)?;
    if !path.exists(){return Ok(empty_index(channel_id,channel_name))}
    let mut x:ChannelIndex=read_json(&path)?;
    if x.channel_id!=channel_id{return Err("METADATA_QUEUE_CHANNEL_ID_MISMATCH".into())}
    if !channel_name.trim().is_empty(){x.channel_name=channel_name.to_string();}
    Ok(x)
}
fn save_index(app:&AppHandle,index:&ChannelIndex)->Result<(),String>{
    write_json(&index_path(app,&index.channel_id)?,index)
}
fn load_manifest(app:&AppHandle,channel_id:&str,pack_id:&str)->Result<PackManifest,String>{
    read_json(&manifest_path(app,channel_id,pack_id)?)
}
fn save_manifest(app:&AppHandle,m:&PackManifest)->Result<(),String>{
    write_json(&manifest_path(app,&m.channel_id,&m.pack_id)?,m)
}
fn load_chunk(app:&AppHandle,channel_id:&str,pack_id:&str,chunk:usize)->Result<Vec<MetadataRecord>,String>{
    let p=chunk_path(app,channel_id,pack_id,chunk)?;
    if !p.exists(){return Ok(Vec::new())}
    read_json(&p)
}
fn save_chunk(app:&AppHandle,channel_id:&str,pack_id:&str,chunk:usize,rows:&[MetadataRecord])->Result<(),String>{
    write_json(&chunk_path(app,channel_id,pack_id,chunk)?,&rows)
}
fn record_hash(input:&MetadataInput)->Result<String,String>{
    let bytes=serde_json::to_vec(input).map_err(|e|format!("METADATA_QUEUE_RECORD_SERIALIZE: {e}"))?;
    Ok(sha256_bytes(&bytes))
}
fn effective_source_hash(source_hash:&str,source_name:&str,records:&[MetadataInput])->Result<String,String>{
    let raw=source_hash.trim();
    if !raw.is_empty(){return Ok(raw.to_ascii_lowercase())}
    let bytes=serde_json::to_vec(&(source_name,records)).map_err(|e|format!("METADATA_QUEUE_SOURCE_SERIALIZE: {e}"))?;
    Ok(sha256_bytes(&bytes))
}
fn pack_hash(channel_id:&str,source_hash:&str,records:&[MetadataInput])->Result<String,String>{
    let mut h=Sha256::new();
    h.update(channel_id.as_bytes());h.update(b"\0");h.update(source_hash.as_bytes());
    for r in records{h.update(record_hash(r)?.as_bytes());}
    Ok(hex::encode(h.finalize()))
}
fn status_rank(status:&str)->u8{
    match status{
        "AVAILABLE"=>0,
        "RESERVED"=>1,
        "APPLYING"=>2,
        "ERROR"=>3,
        "APPLIED"|"SAFE_TO_PURGE"=>4,
        _=>0,
    }
}
fn counts(rows:&[MetadataRecord])->QueueCounts{
    let mut c=QueueCounts::default();
    for r in rows{match r.status.as_str(){
        "AVAILABLE"=>c.available+=1,
        "RESERVED"=>c.reserved+=1,
        "APPLYING"=>c.applying+=1,
        "APPLIED"|"SAFE_TO_PURGE"=>c.applied+=1,
        "ERROR"=>c.error+=1,
        _=>{}
    }}
    c
}
fn read_pack_records(app:&AppHandle,m:&PackManifest)->Result<Vec<MetadataRecord>,String>{
    if m.purged{return Ok(Vec::new())}
    let mut out=Vec::with_capacity(m.total);
    for i in 0..m.chunks{out.extend(load_chunk(app,&m.channel_id,&m.pack_id,i)?);}
    Ok(out)
}
fn refresh_manifest(app:&AppHandle,m:&mut PackManifest)->Result<(),String>{
    if m.purged{return Ok(())}
    let rows=read_pack_records(app,m)?;
    m.total=rows.len();
    m.counts=counts(&rows);
    m.complete=m.total>0&&m.counts.available==0&&m.counts.reserved==0&&m.counts.applying==0&&m.counts.error==0&&m.counts.applied==m.total;
    save_manifest(app,m)
}
fn update_index_pack(app:&AppHandle,index:&mut ChannelIndex,m:&PackManifest)->Result<(),String>{
    if let Some(p)=index.packs.iter_mut().find(|x|x.pack_id==m.pack_id){
        p.pack_hash=m.pack_hash.clone();p.source_hash=m.source_hash.clone();p.total=m.total;p.complete=m.complete;p.purged=m.purged;
    }else{
        index.packs.push(PackRef{pack_id:m.pack_id.clone(),pack_hash:m.pack_hash.clone(),source_hash:m.source_hash.clone(),created_at:m.created_at.clone(),total:m.total,complete:m.complete,purged:m.purged});
    }
    save_index(app,index)
}
fn queue_summary_locked(app:&AppHandle,channel_id:&str,channel_name:&str)->Result<QueueSummary,String>{
    let index=load_index(app,channel_id,channel_name)?;
    let mut total=0usize;let mut active_total=0usize;let mut c=QueueCounts::default();let mut complete=0usize;let mut purged=0usize;let mut complete_ids=Vec::new();let mut next=None;
    for p in &index.packs{
        let m=load_manifest(app,channel_id,&p.pack_id)?;
        total+=m.total;
        if m.purged{purged+=1;}else{
            active_total+=m.total;c.available+=m.counts.available;c.reserved+=m.counts.reserved;c.applying+=m.counts.applying;c.applied+=m.counts.applied;c.error+=m.counts.error;
            if next.is_none()&&m.counts.available>0{
                'outer:for chunk in 0..m.chunks{for row in load_chunk(app,channel_id,&m.pack_id,chunk)?{if row.status=="AVAILABLE"{next=Some(row.sequence);break 'outer}}}
            }
        }
        if m.complete{complete+=1;if !m.purged{complete_ids.push(m.pack_id.clone());}}
    }
    Ok(QueueSummary{channel_id:channel_id.to_string(),total,active_total,available:c.available,reserved:c.reserved,applying:c.applying,applied:c.applied,error:c.error,packs:index.packs.len(),complete_packs:complete,purged_packs:purged,complete_pack_ids:complete_ids,next_sequence:next})
}
fn write_sidecar(project_folder:&str,record:&MetadataRecord)->Result<(),String>{
    if project_folder.trim().is_empty(){return Ok(())}
    let path=Path::new(project_folder).join("metadata.json");
    let value=json!({
        "schemaVersion":1,
        "channelId":record.channel_id,
        "jobId":record.reserved_job_id,
        "videoNumber":record.reserved_video_number,
        "metadataRecordId":record.id,
        "metadataPackId":record.pack_id,
        "title":record.title,
        "description":record.description,
        "tags":record.tags,
        "publishAt":record.publish_at,
        "publishTime":record.publish_time,
        "timezone":record.publish_timezone,
        "publishUtcOffsetMinutes":record.publish_utc_offset_minutes,
        "status":record.status,
        "createdAt":record.created_at,
        "reservedAt":record.reserved_at,
        "appliedAt":record.applied_at,
        "youtubeVideoId":record.youtube_video_id
    });
    write_json(&path,&value)
}
fn mutate_by_job<F>(app:&AppHandle,channel_id:&str,job_id:&str,mutator:F)->Result<Option<MetadataRecord>,String>
where F:FnOnce(&mut MetadataRecord){
    let mut index=load_index(app,channel_id,"")?;
    for p in index.packs.clone(){
        let mut m=load_manifest(app,channel_id,&p.pack_id)?;
        if m.purged{continue}
        for chunk in 0..m.chunks{
            let mut rows=load_chunk(app,channel_id,&m.pack_id,chunk)?;
            if let Some(pos)=rows.iter().position(|r|r.reserved_job_id.as_deref()==Some(job_id)){
                mutator(&mut rows[pos]);
                let out=rows[pos].clone();
                save_chunk(app,channel_id,&m.pack_id,chunk,&rows)?;
                refresh_manifest(app,&mut m)?;
                update_index_pack(app,&mut index,&m)?;
                return Ok(Some(out))
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn metadata_queue_import(
    app:AppHandle,
    channel_id:String,
    channel_name:String,
    source_name:String,
    source_hash:String,
    records:Vec<MetadataInput>,
)->Result<QueueImportResult,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    if channel_id.trim().is_empty(){return Err("METADATA_QUEUE_CHANNEL_REQUIRED".into())}
    if records.is_empty(){return Err("METADATA_QUEUE_RECORDS_REQUIRED".into())}
    let src_hash=effective_source_hash(&source_hash,&source_name,&records)?;
    let p_hash=pack_hash(&channel_id,&src_hash,&records)?;
    let mut index=load_index(&app,&channel_id,&channel_name)?;
    if let Some(existing)=index.packs.iter().find(|p|p.pack_hash==p_hash||(!src_hash.is_empty()&&p.source_hash==src_hash)){
        let summary=queue_summary_locked(&app,&channel_id,&channel_name)?;
        return Ok(QueueImportResult{pack_id:existing.pack_id.clone(),pack_hash:existing.pack_hash.clone(),existing:existing.total,added:0,duplicate:true,summary})
    }
    let created=now();
    let pack_id=format!("PACK_{}_{}",
        chrono::Utc::now().format("%Y-%m-%d_%H%M%S"),
        &p_hash[..10]
    );
    let mut out=Vec::with_capacity(records.len());
    for (i,input) in records.iter().enumerate(){
        let rh=record_hash(input)?;
        let id=sha256_bytes(format!("{channel_id}\0{p_hash}\0{}\0{rh}",i+1).as_bytes())[..32].to_string();
        out.push(MetadataRecord{
            id,channel_id:channel_id.clone(),pack_id:pack_id.clone(),sequence:(i+1) as u64,
            source_number:input.source_number,title:input.title.clone(),description:input.description.clone(),tags:input.tags.clone(),
            publish_at:input.publish_at.clone(),publish_time:input.publish_time.clone(),publish_timezone:input.publish_timezone.clone(),
            publish_utc_offset_minutes:input.publish_utc_offset_minutes,status:"AVAILABLE".into(),reserved_job_id:None,reserved_video_number:None,
            youtube_video_id:None,created_at:created.clone(),reserved_at:None,applied_at:None,source_hash:src_hash.clone(),record_hash:rh,error:None,
        })
    }
    let chunks=(out.len()+CHUNK_SIZE-1)/CHUNK_SIZE;
    for chunk in 0..chunks{
        let start=chunk*CHUNK_SIZE;let end=(start+CHUNK_SIZE).min(out.len());
        save_chunk(&app,&channel_id,&pack_id,chunk,&out[start..end])?;
    }
    let m=PackManifest{
        schema_version:SCHEMA_VERSION,pack_id:pack_id.clone(),channel_id:channel_id.clone(),channel_name:channel_name.clone(),
        source_name,source_hash:src_hash,pack_hash:p_hash.clone(),created_at:created,total:out.len(),chunk_size:CHUNK_SIZE,chunks,
        counts:counts(&out),complete:false,purged:false
    };
    save_manifest(&app,&m)?;
    update_index_pack(&app,&mut index,&m)?;
    let summary=queue_summary_locked(&app,&channel_id,&channel_name)?;
    Ok(QueueImportResult{pack_id,pack_hash:p_hash,existing:0,added:out.len(),duplicate:false,summary})
}

#[tauri::command]
pub fn metadata_queue_summary(app:AppHandle,channel_id:String,channel_name:String)->Result<QueueSummary,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    queue_summary_locked(&app,&channel_id,&channel_name)
}

#[tauri::command]
pub fn metadata_queue_page(app:AppHandle,channel_id:String,channel_name:String,offset:usize,limit:usize,status:Option<String>)->Result<QueuePage,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    let index=load_index(&app,&channel_id,&channel_name)?;
    let limit=limit.clamp(1,250);let wanted=status.unwrap_or_default();
    let mut rows=Vec::with_capacity(limit);let mut seen=0usize;let mut total_matching=0usize;
    for p in index.packs{
        let m=load_manifest(&app,&channel_id,&p.pack_id)?;
        if m.purged{continue}
        for chunk in 0..m.chunks{
            for row in load_chunk(&app,&channel_id,&m.pack_id,chunk)?{
                if !wanted.is_empty()&&row.status!=wanted{continue}
                if seen>=offset&&rows.len()<limit{rows.push(row.clone());}
                seen+=1;total_matching+=1;
            }
        }
    }
    Ok(QueuePage{channel_id,offset,limit,total_matching,rows})
}

#[tauri::command]
pub fn metadata_queue_reserve(app:AppHandle,channel_id:String,channel_name:String,job_id:String,video_number:u64,project_folder:Option<String>)->Result<Option<MetadataRecord>,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    if job_id.trim().is_empty(){return Err("METADATA_QUEUE_JOB_REQUIRED".into())}
    let mut index=load_index(&app,&channel_id,&channel_name)?;
    for p in index.packs.clone(){
        let mut m=load_manifest(&app,&channel_id,&p.pack_id)?;
        if m.purged{continue}
        for chunk in 0..m.chunks{
            let mut rows=load_chunk(&app,&channel_id,&m.pack_id,chunk)?;
            if let Some(pos)=rows.iter().position(|r|r.reserved_job_id.as_deref()==Some(job_id.as_str())){
                let out=rows[pos].clone();
                if let Some(folder)=project_folder.as_deref(){write_sidecar(folder,&out)?;}
                return Ok(Some(out))
            }
            if let Some(pos)=rows.iter().position(|r|r.status=="AVAILABLE"){
                let at=now();rows[pos].status="RESERVED".into();rows[pos].reserved_job_id=Some(job_id.clone());rows[pos].reserved_video_number=Some(video_number);rows[pos].reserved_at=Some(at);rows[pos].error=None;
                let out=rows[pos].clone();
                save_chunk(&app,&channel_id,&m.pack_id,chunk,&rows)?;
                refresh_manifest(&app,&mut m)?;
                update_index_pack(&app,&mut index,&m)?;
                if let Some(folder)=project_folder.as_deref(){write_sidecar(folder,&out)?;}
                return Ok(Some(out))
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn metadata_queue_mark_applying(app:AppHandle,channel_id:String,job_id:String)->Result<Option<MetadataRecord>,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    mutate_by_job(&app,&channel_id,&job_id,|r|{
        if matches!(r.status.as_str(),"RESERVED"|"ERROR"|"APPLYING"){r.status="APPLYING".into();r.error=None;}
    })
}

#[tauri::command]
pub fn metadata_queue_mark_applied(app:AppHandle,channel_id:String,job_id:String,youtube_video_id:String,project_folder:Option<String>)->Result<Option<MetadataRecord>,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    let row=mutate_by_job(&app,&channel_id,&job_id,|r|{
        r.status="APPLIED".into();r.youtube_video_id=Some(youtube_video_id.clone());r.applied_at=Some(now());r.error=None;
    })?;
    if let (Some(folder),Some(r))=(project_folder.as_deref(),row.as_ref()){write_sidecar(folder,r)?;}
    Ok(row)
}

#[tauri::command]
pub fn metadata_queue_mark_error(app:AppHandle,channel_id:String,job_id:String,error:String,project_folder:Option<String>)->Result<Option<MetadataRecord>,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    let row=mutate_by_job(&app,&channel_id,&job_id,|r|{
        if r.status!="APPLIED"&&r.status!="SAFE_TO_PURGE"{r.status="ERROR".into();r.error=Some(error.clone());}
    })?;
    if let (Some(folder),Some(r))=(project_folder.as_deref(),row.as_ref()){write_sidecar(folder,r)?;}
    Ok(row)
}

#[tauri::command]
pub fn metadata_queue_purge_pack(app:AppHandle,channel_id:String,pack_id:String)->Result<QueueSummary,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    let mut index=load_index(&app,&channel_id,"")?;
    let mut m=load_manifest(&app,&channel_id,&pack_id)?;
    if m.purged{return queue_summary_locked(&app,&channel_id,&index.channel_name)}
    refresh_manifest(&app,&mut m)?;
    if !m.complete{return Err("METADATA_QUEUE_PACK_NOT_COMPLETE".into())}
    let rows=read_pack_records(&app,&m)?;
    let ledger:Vec<Value>=rows.iter().map(|r|json!({
        "packId":r.pack_id,"packHash":m.pack_hash,"channelId":r.channel_id,"recordId":r.id,"recordHash":r.record_hash,
        "youtubeVideoId":r.youtube_video_id,"jobId":r.reserved_job_id,"appliedAt":r.applied_at
    })).collect();
    write_json(&ledger_path(&app,&channel_id,&pack_id)?,&json!({"schemaVersion":1,"packId":pack_id,"packHash":m.pack_hash,"channelId":channel_id,"records":ledger}))?;
    let payload=pack_root(&app,&channel_id,&m.pack_id)?.join("payload");
    if payload.exists(){trash::delete(&payload).map_err(|e|format!("METADATA_QUEUE_TRASH_FAILED: {e}"))?;}
    m.purged=true;save_manifest(&app,&m)?;update_index_pack(&app,&mut index,&m)?;
    queue_summary_locked(&app,&channel_id,&index.channel_name)
}


fn copy_dir_recursive(src:&Path,dst:&Path)->Result<(),String>{
    fs::create_dir_all(dst).map_err(|e|format!("METADATA_QUEUE_BACKUP_MKDIR: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e|format!("METADATA_QUEUE_BACKUP_READDIR: {e}"))?.filter_map(Result::ok){
        let from=entry.path();let to=dst.join(entry.file_name());
        if from.is_dir(){copy_dir_recursive(&from,&to)?;}else{fs::copy(&from,&to).map_err(|e|format!("METADATA_QUEUE_BACKUP_COPY {}: {e}",from.display()))?;}
    }
    Ok(())
}

pub fn backup_to(app:&AppHandle,backup_dir:&Path)->Result<(),String>{
    let live=root(app)?;
    let target=backup_dir.join("metadata-queue");
    if target.exists(){fs::remove_dir_all(&target).map_err(|e|format!("METADATA_QUEUE_BACKUP_REPLACE: {e}"))?;}
    if live.exists(){copy_dir_recursive(&live,&target)?;}
    Ok(())
}

pub fn restore_from(app:&AppHandle,backup_dir:&Path)->Result<(),String>{
    let live=root(app)?;
    let saved=backup_dir.join("metadata-queue");
    if live.exists(){fs::remove_dir_all(&live).map_err(|e|format!("METADATA_QUEUE_ROLLBACK_REMOVE: {e}"))?;}
    if saved.exists(){copy_dir_recursive(&saved,&live)?;}else{fs::create_dir_all(&live).map_err(|e|format!("METADATA_QUEUE_ROLLBACK_MKDIR: {e}"))?;}
    Ok(())
}

pub fn portable_snapshot(app:&AppHandle)->Result<Value,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    let channels_root=root(app)?.join("channels");
    if !channels_root.exists(){return Ok(json!({"schemaVersion":1,"channels":[]}))}
    let mut channels=Vec::new();
    for entry in fs::read_dir(&channels_root).map_err(|e|format!("METADATA_QUEUE_EXPORT_READDIR: {e}"))?.filter_map(Result::ok){
        let p=entry.path().join("index.json");if !p.exists(){continue}
        let index:ChannelIndex=read_json(&p)?;
        let mut packs=Vec::new();
        for pref in &index.packs{
            let m=load_manifest(app,&index.channel_id,&pref.pack_id)?;
            let records=if m.purged{Vec::new()}else{read_pack_records(app,&m)?};
            let ledger_path=ledger_path(app,&index.channel_id,&pref.pack_id)?;
            let ledger:Value=if ledger_path.exists(){read_json(&ledger_path)?}else{Value::Null};
            packs.push(json!({"manifest":m,"records":records,"ledger":ledger}));
        }
        channels.push(json!({"index":index,"packs":packs}));
    }
    Ok(json!({"schemaVersion":1,"channels":channels}))
}

fn write_imported_pack(app:&AppHandle,target_channel:&str,target_name:&str,mut m:PackManifest,mut records:Vec<MetadataRecord>,ledger:Value,forced_pack_id:Option<String>)->Result<PackManifest,String>{
    if let Some(id)=forced_pack_id{m.pack_id=id;}
    m.channel_id=target_channel.to_string();m.channel_name=target_name.to_string();
    for r in &mut records{r.channel_id=target_channel.to_string();r.pack_id=m.pack_id.clone();}
    m.total=records.len().max(m.total);
    if !m.purged{
        m.chunks=(records.len()+CHUNK_SIZE-1)/CHUNK_SIZE;m.chunk_size=CHUNK_SIZE;m.counts=counts(&records);
        m.complete=m.total>0&&m.counts.available==0&&m.counts.reserved==0&&m.counts.applying==0&&m.counts.error==0&&m.counts.applied==m.total;
        for chunk in 0..m.chunks{let s=chunk*CHUNK_SIZE;let e=(s+CHUNK_SIZE).min(records.len());save_chunk(app,target_channel,&m.pack_id,chunk,&records[s..e])?;}
    }
    save_manifest(app,&m)?;
    if !ledger.is_null(){write_json(&ledger_path(app,target_channel,&m.pack_id)?,&ledger)?;}
    Ok(m)
}

pub fn merge_portable_snapshot(app:&AppHandle,value:&Value,channel_remap:&HashMap<String,String>)->Result<Value,String>{
    let _guard=queue_lock().lock().map_err(|_|"METADATA_QUEUE_LOCK_POISONED".to_string())?;
    let mut packs_added=0usize;let mut packs_merged=0usize;let mut records_upgraded=0usize;
    for ch in value.get("channels").and_then(Value::as_array).into_iter().flatten(){
        let imported_index:ChannelIndex=serde_json::from_value(ch.get("index").cloned().unwrap_or(Value::Null)).map_err(|e|format!("METADATA_QUEUE_MIGRATION_INDEX: {e}"))?;
        let target_id=channel_remap.get(&imported_index.channel_id).cloned().unwrap_or_else(||imported_index.channel_id.clone());
        let mut local_index=load_index(app,&target_id,&imported_index.channel_name)?;
        for pv in ch.get("packs").and_then(Value::as_array).into_iter().flatten(){
            let imported_manifest:PackManifest=serde_json::from_value(pv.get("manifest").cloned().unwrap_or(Value::Null)).map_err(|e|format!("METADATA_QUEUE_MIGRATION_MANIFEST: {e}"))?;
            let imported_records:Vec<MetadataRecord>=serde_json::from_value(pv.get("records").cloned().unwrap_or_else(||json!([]))).map_err(|e|format!("METADATA_QUEUE_MIGRATION_RECORDS: {e}"))?;
            let ledger=pv.get("ledger").cloned().unwrap_or(Value::Null);
            if let Some(existing_ref)=local_index.packs.iter().find(|p|p.pack_hash==imported_manifest.pack_hash).cloned(){
                let mut local_manifest=load_manifest(app,&target_id,&existing_ref.pack_id)?;
                if local_manifest.purged{packs_merged+=1;continue}
                let mut local_records=read_pack_records(app,&local_manifest)?;
                let mut by_hash=HashMap::<String,usize>::new();for (i,r) in local_records.iter().enumerate(){by_hash.insert(r.record_hash.clone(),i);}
                for incoming in imported_records{
                    if let Some(i)=by_hash.get(&incoming.record_hash).copied(){
                        if status_rank(&incoming.status)>status_rank(&local_records[i].status){
                            let keep_channel=local_records[i].channel_id.clone();let keep_pack=local_records[i].pack_id.clone();
                            local_records[i]=incoming;local_records[i].channel_id=keep_channel;local_records[i].pack_id=keep_pack;records_upgraded+=1;
                        }
                    }
                }
                local_manifest=write_imported_pack(app,&target_id,&local_index.channel_name,local_manifest,local_records,ledger,None)?;
                update_index_pack(app,&mut local_index,&local_manifest)?;packs_merged+=1;
            }else{
                let mut target_pack=imported_manifest.pack_id.clone();
                if local_index.packs.iter().any(|p|p.pack_id==target_pack){target_pack=format!("{}-{}",&target_pack,&imported_manifest.pack_hash[..8]);}
                let m=write_imported_pack(app,&target_id,&local_index.channel_name,imported_manifest,imported_records,ledger,Some(target_pack))?;
                update_index_pack(app,&mut local_index,&m)?;packs_added+=1;
            }
        }
    }
    Ok(json!({"packsAdded":packs_added,"packsMerged":packs_merged,"recordsUpgraded":records_upgraded,"deleted":0}))
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn status_never_moves_applied_backwards(){assert!(status_rank("APPLIED")>status_rank("ERROR"));assert!(status_rank("ERROR")>status_rank("AVAILABLE"))}
    #[test]
    fn chunking_has_no_fifty_record_limit(){let n=5_000usize;assert_eq!((n+CHUNK_SIZE-1)/CHUNK_SIZE,20);let bigger=100_000usize;assert_eq!((bigger+CHUNK_SIZE-1)/CHUNK_SIZE,400)}
    #[test]
    fn record_fingerprint_is_stable(){
        let row=MetadataInput{source_number:Some(1),title:Some("A".into()),description:Some("B".into()),tags:vec!["x".into()],publish_at:None,publish_time:None,publish_timezone:None,publish_utc_offset_minutes:None};
        assert_eq!(record_hash(&row).unwrap(),record_hash(&row).unwrap());
    }
}
