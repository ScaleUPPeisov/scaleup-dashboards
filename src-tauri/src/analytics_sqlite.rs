//! VYRON Mac Analytics SQLite/WAL engine.
//! Staged additive store: immutable JSON generations remain the recovery source
//! until a transactionally migrated, row-verified SQLite generation is ready.
//! NEVER touches OAuth, app state, Publisher, or Windows storage.
use chrono::{NaiveDate,Utc};
use rusqlite::{params,Connection,OptionalExtension,OpenFlags,Transaction,TransactionBehavior};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::HashSet,fs,io::{Read,Write},path::{Path,PathBuf},time::Duration};
use uuid::Uuid;

const SCHEMA_VERSION:i32=2;
const DB_NAME:&str="analytics-v1.sqlite3";
// Fault injection is thread-local and only available to Rust test builds.
// Production never throws synthetic errors and no user data is accessed.
#[cfg(test)]
thread_local!{static INJECT_MIGRATION_STAGE:std::cell::Cell<usize>=const{std::cell::Cell::new(0)};}
#[cfg(test)]
fn migration_fault_point(stage:usize)->Result<(),String>{
    if INJECT_MIGRATION_STAGE.with(|f|f.get()==stage){
        return Err(format!("SQLITE_TEST_INJECTED_INTERRUPTION_STAGE_{stage}"))
    }
    Ok(())
}
#[cfg(not(test))]
fn migration_fault_point(_stage:usize)->Result<(),String>{Ok(())}
const SCHEMA:&str=r#"
CREATE TABLE IF NOT EXISTS channels(
 channel_id TEXT PRIMARY KEY NOT NULL, name TEXT, observed_at TEXT NOT NULL,
 source TEXT NOT NULL, completeness TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS videos(
 channel_id TEXT NOT NULL,video_id TEXT NOT NULL,published_at TEXT,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,catalog_json TEXT,content_type TEXT,views_public INTEGER,
 PRIMARY KEY(channel_id,video_id),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(channel_id,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_content ON videos(channel_id,content_type,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(channel_id,views_public DESC);
CREATE TABLE IF NOT EXISTS channel_daily(
 channel_id TEXT NOT NULL,date TEXT NOT NULL,views INTEGER,watch_minutes REAL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,date),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_channel_daily_date ON channel_daily(date,channel_id);
CREATE TABLE IF NOT EXISTS video_daily(
 channel_id TEXT NOT NULL,video_id TEXT NOT NULL,date TEXT NOT NULL,views INTEGER,watch_minutes REAL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,video_id,date),
 FOREIGN KEY(channel_id,video_id) REFERENCES videos(channel_id,video_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_video_daily_date ON video_daily(channel_id,date,video_id);
CREATE TABLE IF NOT EXISTS reach_daily(
 channel_id TEXT NOT NULL,date TEXT NOT NULL,impressions INTEGER,ctr_raw REAL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,date),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS video_reach_daily(
 channel_id TEXT NOT NULL,video_id TEXT NOT NULL,date TEXT NOT NULL,
 impressions INTEGER,ctr_raw REAL,ctr_scale TEXT NOT NULL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,video_id,date),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_video_reach_day ON video_reach_daily(channel_id,date);
CREATE TABLE IF NOT EXISTS audience_demographics(
 channel_id TEXT NOT NULL,generation TEXT NOT NULL,item_key TEXT NOT NULL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,generation,item_key),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS traffic_sources(
 channel_id TEXT NOT NULL,generation TEXT NOT NULL,source_type TEXT NOT NULL,item_key TEXT NOT NULL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,generation,item_key),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_traffic_type ON traffic_sources(channel_id,source_type);
CREATE TABLE IF NOT EXISTS devices(
 channel_id TEXT NOT NULL,generation TEXT NOT NULL,item_key TEXT NOT NULL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,generation,item_key),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS subtitles(
 channel_id TEXT NOT NULL,video_id TEXT NOT NULL,track_id TEXT NOT NULL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,video_id,track_id),
 FOREIGN KEY(channel_id,video_id) REFERENCES videos(channel_id,video_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS retention_points(
 channel_id TEXT NOT NULL,video_id TEXT NOT NULL,point_index INTEGER NOT NULL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,video_id,point_index),
 FOREIGN KEY(channel_id,video_id) REFERENCES videos(channel_id,video_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS channel_events(
 channel_id TEXT NOT NULL,event_hash TEXT NOT NULL,event_type TEXT,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,event_hash),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_channel_events_time ON channel_events(channel_id,observed_at);
CREATE TABLE IF NOT EXISTS metadata_history(
 channel_id TEXT NOT NULL,video_id TEXT NOT NULL,generation TEXT NOT NULL,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,video_id,generation),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS sync_jobs(
 channel_id TEXT NOT NULL,generation TEXT NOT NULL,status TEXT NOT NULL,
 started_at TEXT NOT NULL,finished_at TEXT,source_digest TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,generation),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS data_coverage(
 channel_id TEXT NOT NULL,generation TEXT NOT NULL,observed_at TEXT NOT NULL,
 source TEXT NOT NULL,completeness TEXT NOT NULL,payload_json TEXT NOT NULL,
 PRIMARY KEY(channel_id,generation),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS analytics_overviews(
 channel_id TEXT NOT NULL,generation TEXT NOT NULL,updated_at TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,generation),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS analytics_migrations(
 channel_id TEXT NOT NULL,generation TEXT NOT NULL,source_digest TEXT NOT NULL,
 verified_at TEXT NOT NULL,channel_days INTEGER NOT NULL,video_days INTEGER NOT NULL,
 videos INTEGER NOT NULL,reach_rows INTEGER NOT NULL,events INTEGER NOT NULL,
 PRIMARY KEY(channel_id,generation));
"#;

#[derive(Debug,Clone,PartialEq)]
pub(crate) struct MigrationResult{
    pub generation:String,pub skipped:bool,pub channels:usize,pub videos:usize,
    pub channel_days:usize,pub video_days:usize,pub reach_rows:usize,pub events:usize,
}
fn valid_channel(id:&str)->bool{id.len()==24&&id.starts_with("UC")&&id.bytes().all(|x|x.is_ascii_alphanumeric()||x==b'_'||x==b'-')}
fn valid_video(id:&str)->bool{id.len()==11&&id.bytes().all(|x|x.is_ascii_alphanumeric()||x==b'_'||x==b'-')}
fn hash(s:&str)->String{hex::encode(Sha256::digest(s.as_bytes()))}
fn video_path_key(id:&str)->String{hash(id)[..24].to_string()}
fn obj(path:&Path)->Result<Value,String>{
    let b=fs::read(path).map_err(|e|format!("SQLITE_JSON_READ: {}: {e}",path.display()))?;
    serde_json::from_slice(&b).map_err(|e|format!("SQLITE_JSON_PARSE: {}: {e}",path.display()))
}
fn arr(path:&Path)->Result<Vec<Value>,String>{
    obj(path)?.as_array().cloned().ok_or_else(||format!("SQLITE_SOURCE_NOT_ARRAY: {}",path.display()))
}
fn optional_arr(path:&Path)->Result<Vec<Value>,String>{
    if path.exists(){arr(path)}else{Ok(Vec::new())}
}
fn text<'a>(v:&'a Value,key:&str)->Option<&'a str>{v.get(key).and_then(Value::as_str)}
fn observed<'a>(v:&'a Value,default:&'a str)->&'a str{text(v,"fetchedAt").or_else(||text(v,"observedAt")).unwrap_or(default)}
fn source<'a>(v:&'a Value,default:&'a str)->&'a str{text(v,"source").unwrap_or(default)}
fn completeness(v:&Value)->&str{text(v,"completeness").or_else(||text(v,"status")).unwrap_or("OBSERVED_API_DATA")}
fn to_json(v:&Value)->Result<String,String>{serde_json::to_string(v).map_err(|e|e.to_string())}
fn date(v:&Value)->Result<&str,String>{
    let s=text(v,"date").ok_or("SQLITE_SOURCE_DATE_MISSING")?;
    NaiveDate::parse_from_str(s,"%Y-%m-%d").map_err(|_|"SQLITE_SOURCE_DATE_INVALID".to_string())?;
    Ok(s)
}
fn verify_header(path:&Path)->Result<(),String>{
    if !path.exists(){return Ok(())}
    let mut file=fs::File::open(path).map_err(|e|format!("SQLITE_FILE_OPEN: {e}"))?;
    let mut header=[0u8;16];
    file.read_exact(&mut header).map_err(|_|"SQLITE_RECOVERY_REQUIRED: unreadable existing database header".to_string())?;
    if &header!=b"SQLite format 3\0"{
        return Err("SQLITE_RECOVERY_REQUIRED: invalid existing database header; no replacement attempted".into())
    }
    Ok(())
}
/// Preserve the JSON generation pointer before the first SQLite write.
///
/// A plain `fs::copy` can leave a truncated file if the process or machine
/// stops mid-copy.  Worse, the old implementation accepted any pre-existing
/// backup without checking it, so a later restart could silently keep that
/// damaged recovery marker forever.  Write through a private temporary file,
/// fsync it, atomically rename it, then byte-verify the durable result.  An
/// existing backup is immutable: disagreement is a recovery error, never an
/// automatic overwrite.
fn ensure_pointer_backup(cache:&Path,generation:&str)->Result<PathBuf,String>{
    Uuid::parse_str(generation).map_err(|_|"SQLITE_POINTER_INVALID_GENERATION".to_string())?;
    let source=cache.join("ui-current.json");
    let bytes=fs::read(&source).map_err(|e|format!("SQLITE_POINTER_BACKUP_READ: {e}"))?;
    let source_pointer:Value=serde_json::from_slice(&bytes)
        .map_err(|e|format!("SQLITE_POINTER_BACKUP_SOURCE_PARSE: {e}"))?;
    let backup=cache.join(format!("ui-current-pre-sqlite-{generation}.json"));
    if backup.exists(){
        let existing=fs::read(&backup).map_err(|e|format!("SQLITE_POINTER_BACKUP_VERIFY: {e}"))?;
        let backup_pointer:Value=serde_json::from_slice(&existing)
            .map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: pointer backup is not valid JSON: {e}"))?;
        for field in ["channelId","generation"]{
            if text(&backup_pointer,field)!=text(&source_pointer,field){
                return Err(format!("SQLITE_RECOVERY_REQUIRED: immutable pointer backup {field} mismatch"))
            }
        }
        return Ok(backup)
    }
    let temporary=cache.join(format!(".ui-current-pre-sqlite-{generation}-{}.tmp",Uuid::new_v4()));
    let write_result=(||->Result<(),String>{
        let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&temporary)
            .map_err(|e|format!("SQLITE_POINTER_BACKUP_CREATE: {e}"))?;
        #[cfg(unix)]{
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|e|format!("SQLITE_POINTER_BACKUP_PERMISSIONS: {e}"))?;
        }
        file.write_all(&bytes).map_err(|e|format!("SQLITE_POINTER_BACKUP_WRITE: {e}"))?;
        file.sync_all().map_err(|e|format!("SQLITE_POINTER_BACKUP_SYNC: {e}"))?;
        drop(file);
        fs::rename(&temporary,&backup).map_err(|e|format!("SQLITE_POINTER_BACKUP_RENAME: {e}"))?;
        #[cfg(unix)]{
            fs::File::open(cache).and_then(|directory|directory.sync_all())
                .map_err(|e|format!("SQLITE_POINTER_BACKUP_DIRECTORY_SYNC: {e}"))?;
        }
        Ok(())
    })();
    if write_result.is_err(){let _=fs::remove_file(&temporary);}
    write_result?;
    let durable=fs::read(&backup).map_err(|e|format!("SQLITE_POINTER_BACKUP_VERIFY: {e}"))?;
    if durable!=bytes{
        return Err("SQLITE_RECOVERY_REQUIRED: pointer backup checksum mismatch".into())
    }
    Ok(backup)
}
fn prepare_db(path:&Path)->Result<Connection,String>{
    verify_header(path)?;
    let existed=path.exists();
    let conn=Connection::open_with_flags(path,OpenFlags::SQLITE_OPEN_READ_WRITE|
        OpenFlags::SQLITE_OPEN_CREATE|OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e|format!("SQLITE_OPEN: {e}"))?;
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path,fs::Permissions::from_mode(0o600))
            .map_err(|e|format!("SQLITE_PRIVATE_PERMISSIONS: {e}"))?;
    }
    conn.busy_timeout(Duration::from_secs(5)).map_err(|e|e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;PRAGMA temp_store=MEMORY;")
        .map_err(|e|format!("SQLITE_PRAGMAS: {e}"))?;
    let version:i32=conn.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    if version>SCHEMA_VERSION{return Err("SQLITE_RECOVERY_REQUIRED: database schema newer than application".into())}
    if existed && version==0{return Err("SQLITE_RECOVERY_REQUIRED: existing database lacks schema version".into())}
    if version==0{
        // Transactional DDL avoids partially installed schema after a power loss.
        conn.execute_batch("BEGIN IMMEDIATE;").map_err(|e|e.to_string())?;
        if let Err(e)=conn.execute_batch(SCHEMA){
            let _=conn.execute_batch("ROLLBACK;");
            return Err(format!("SQLITE_SCHEMA_CREATE: {e}"));
        }
        conn.pragma_update(None,"user_version",SCHEMA_VERSION).map_err(|e|e.to_string())?;
        conn.execute_batch("COMMIT;").map_err(|e|e.to_string())?;
    }
    if version==1{
        // Crash-safe v1 -> v2 upgrade; legacy generation markers are invalidated,
        // so JSON remains the source until a full v2 reimport is verified.
        conn.execute_batch("BEGIN IMMEDIATE;
            ALTER TABLE videos ADD COLUMN catalog_json TEXT;
            ALTER TABLE videos ADD COLUMN content_type TEXT;
            ALTER TABLE videos ADD COLUMN views_public INTEGER;
            CREATE INDEX IF NOT EXISTS idx_videos_content ON videos(channel_id,content_type,published_at DESC);
            CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(channel_id,views_public DESC);
            CREATE TABLE IF NOT EXISTS analytics_overviews(
              channel_id TEXT NOT NULL,generation TEXT NOT NULL,updated_at TEXT NOT NULL,
              payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,generation),
              FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
            DELETE FROM analytics_migrations;
            PRAGMA user_version=2;
            COMMIT;").map_err(|e|format!("SQLITE_V1_TO_V2_MIGRATION: {e}"))?;
    }
    let quick:String=conn.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    if quick!="ok"{return Err(format!("SQLITE_RECOVERY_REQUIRED: integrity check: {quick}"))}
    Ok(conn)
}
fn read_current_verified(cache:&Path,channel_id:&str)->Result<Option<Connection>,String>{
    if !valid_channel(channel_id){return Err("SQLITE_INVALID_CHANNEL_ID".into())}
    let path=cache.join(DB_NAME);
    if !path.exists(){return Ok(None)}
    verify_header(&path)?;
    let pointer=obj(&cache.join("ui-current.json"))?;
    if text(&pointer,"channelId")!=Some(channel_id){
        return Err("SQLITE_POINTER_CHANNEL_MISMATCH".into())
    }
    let generation=text(&pointer,"generation").ok_or("SQLITE_POINTER_MISSING_GENERATION")?;
    Uuid::parse_str(generation).map_err(|_|"SQLITE_POINTER_INVALID_GENERATION".to_string())?;
    // READ_ONLY is important: ordinary UI lookups cannot create a replacement
    // database or modify OAuth/analytics data after a storage failure.
    let conn=Connection::open_with_flags(&path,
        OpenFlags::SQLITE_OPEN_READ_ONLY|OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: read-only open failed: {e}"))?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(|e|e.to_string())?;
    let schema:i32=conn.query_row("PRAGMA user_version",[],|r|r.get(0))
        .map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: schema read failed: {e}"))?;
    if schema==1{return Ok(None)}
    if schema!=SCHEMA_VERSION{return Err("SQLITE_RECOVERY_REQUIRED: unrecognized database schema".into())}
    let exists=conn.query_row("SELECT 1 FROM analytics_migrations WHERE channel_id=?1 AND generation=?2",
        params![channel_id,generation],|r|r.get::<_,i64>(0))
        .optional().map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: migration marker read failed: {e}"))?;
    if exists.is_none(){return Ok(None)}
    Ok(Some(conn))
}
fn canonical_source(cache:&Path,channel_id:&str)->Result<(String,PathBuf,Value,Value,Vec<Value>,Vec<Value>,Vec<Value>,String),String>{
    if !valid_channel(channel_id){return Err("SQLITE_INVALID_CHANNEL_ID".into())}
    let pointer=obj(&cache.join("ui-current.json"))?;
    let gen=text(&pointer,"generation").ok_or("SQLITE_POINTER_MISSING_GENERATION")?;
    Uuid::parse_str(gen).map_err(|_|"SQLITE_POINTER_INVALID_GENERATION".to_string())?;
    if text(&pointer,"channelId")!=Some(channel_id){return Err("SQLITE_POINTER_CHANNEL_MISMATCH".into())}
    let root=cache.join("ui-generations").join(gen);
    let overview=obj(&root.join("overview.json"))?;
    if text(&overview,"channelId")!=Some(channel_id) || text(&overview,"generation")!=Some(gen){
        return Err("SQLITE_OVERVIEW_IDENTITY_MISMATCH".into())
    }
    let catalog=arr(&root.join("video-catalog.json"))?;
    let daily=arr(&root.join("channel-daily.json"))?;
    let reach=arr(&root.join("reach-daily.json"))?;
    let mut digest=Sha256::new();
    // Canonical digest of source files and their paths; it changes with a
    // byte-level mutation even when the generation UUID is reused by accident.
    for file in ["overview.json","video-catalog.json","channel-daily.json","reach-daily.json"]{
        digest.update(file.as_bytes());
        digest.update(fs::read(root.join(file)).map_err(|e|e.to_string())?);
    }
    for video in &catalog{
        let id=text(video,"videoId").ok_or("SQLITE_CATALOG_VIDEO_ID_MISSING")?;
        if !valid_video(id){return Err("SQLITE_CATALOG_VIDEO_ID_INVALID".into())}
        if video.get("channelId").and_then(Value::as_str).filter(|x|!x.is_empty())
            .map(|actual|actual!=channel_id).unwrap_or(false){
            return Err("SQLITE_CATALOG_VIDEO_CHANNEL_MISMATCH".into())
        }
        let key=video_path_key(id);
        for folder in ["video-details","video-days","retention"]{
            let path=root.join(folder).join(format!("{key}.json"));
            if path.exists(){
                digest.update(folder.as_bytes());digest.update(id.as_bytes());
                digest.update(fs::read(&path).map_err(|e|e.to_string())?);
            }else if folder=="video-details"{
                return Err("SQLITE_MISSING_VIDEO_DETAILS".into())
            }
        }
    }
    Ok((gen.into(),root,overview,pointer,catalog,daily,reach,hex::encode(digest.finalize())))
}
fn insert_json_row(tx:&Transaction<'_>,table:&str,channel:&str,generation:&str,i:usize,
  row:&Value,observed_at:&str,kind:&str)->Result<(),String>{
    let (id_type,source_type)=(format!("{generation}:{i}"),source(row,kind));
    let data=to_json(row)?;
    let sql=match table{
        "audience_demographics"=>"INSERT INTO audience_demographics(channel_id,generation,item_key,observed_at,source,completeness,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        "devices"=>"INSERT INTO devices(channel_id,generation,item_key,observed_at,source,completeness,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        _=>return Err("SQLITE_UNSAFE_DYNAMIC_TABLE".into())
    };
    tx.execute(sql,params![channel,generation,id_type,observed(row,observed_at),
        source_type,completeness(row),data]).map_err(|e|e.to_string())?;
    Ok(())
}
fn aggregate_reach(rows:&[Value])->Result<Vec<Value>,String>{
    use std::collections::BTreeMap;
    let mut by=BTreeMap::<String,(u64,f64)>::new();
    for row in rows{
        let day=date(row)?.to_string();
        let imp=row.get("impressions").and_then(Value::as_u64).ok_or("SQLITE_REACH_IMPRESSIONS_MISSING")?;
        let raw=row.get("ctrRaw").and_then(Value::as_f64).filter(|v|v.is_finite())
            .ok_or("SQLITE_REACH_RAW_CTR_MISSING")?;
        let item=by.entry(day).or_insert((0,0.0));
        item.0=item.0.checked_add(imp).ok_or("SQLITE_REACH_OVERFLOW")?;
        item.1+=imp as f64*raw;
    }
    Ok(by.into_iter().map(|(date,(impressions,total))|json!({
        "date":date,"impressions":impressions,"ctrRaw":if impressions>0{Some(total/impressions as f64)}else{None},
        "ctrScale":"UNVERIFIED","source":"youtube_reporting_api_channel_reach_basic_a1",
        "completeness":"OBSERVED_REPORT_ROWS_ONLY"
    })).collect())
}
fn import_generation(tx:&Transaction<'_>,channel:&str,generation:&str,root:&Path,overview:&Value,
   catalog:&[Value],daily:&[Value],reach:&[Value],digest:&str)->Result<MigrationResult,String>{
    let stamp=Utc::now().to_rfc3339();
    // Historical sync_jobs rows are the immutable source-digest ledger. The
    // active analytics_migrations marker deliberately tracks only the current
    // materialized generation and is deleted when switching A -> B. A later
    // B -> A therefore MUST check the historical ledger before replacing any
    // generation-specific SQL rows; a reused UUID with different bytes is a
    // recovery error, never an automatic overwrite.
    let previous_digest:Option<String>=tx.query_row(
        "SELECT source_digest FROM sync_jobs WHERE channel_id=?1 AND generation=?2",
        params![channel,generation],|r|r.get(0))
        .optional().map_err(|e|format!("SQLITE_HISTORICAL_DIGEST_READ: {e}"))?;
    if let Some(ref prior)=previous_digest{
        if prior!=digest{
            return Err("SQLITE_RECOVERY_REQUIRED: historical source generation digest changed".into())
        }
        let previous_overview:Option<String>=tx.query_row(
            "SELECT payload_json FROM analytics_overviews WHERE channel_id=?1 AND generation=?2",
            params![channel,generation],|r|r.get(0))
            .optional().map_err(|e|format!("SQLITE_HISTORICAL_OVERVIEW_READ: {e}"))?;
        let Some(old_json)=previous_overview else{
            return Err("SQLITE_RECOVERY_REQUIRED: verified historical overview missing".into())
        };
        let old_value:Value=serde_json::from_str(&old_json)
            .map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: historical overview damaged: {e}"))?;
        if old_value!=*overview{
            return Err("SQLITE_RECOVERY_REQUIRED: historical overview does not match source".into())
        }
    }
    // Re-importing the same verified generation is explicitly supported.
    // These tables have a (channel_id,generation,...) primary key. Clear only
    // THAT generation, never the entire channel or another channel's history.
    // A failure anywhere rolls back these deletes together with all new rows.
    for table in ["analytics_overviews","metadata_history","traffic_sources",
        "audience_demographics","devices","data_coverage","sync_jobs"]{
        tx.execute(&format!("DELETE FROM {table} WHERE channel_id=?1 AND generation=?2"),
            params![channel,generation])
            .map_err(|e|format!("SQLITE_GENERATION_REIMPORT_CLEAR_{table}: {e}"))?;
    }
    let summary=overview.get("summary").unwrap_or(&Value::Null);
    tx.execute("INSERT INTO channels(channel_id,name,observed_at,source,completeness,payload_json)
        VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(channel_id) DO UPDATE SET
        name=excluded.name,observed_at=excluded.observed_at,source=excluded.source,
        completeness=excluded.completeness,payload_json=excluded.payload_json",
        params![channel,text(summary,"name"),stamp,source(summary,"youtube_data_api_v3"),
        completeness(summary),to_json(summary)?]).map_err(|e|e.to_string())?;
    tx.execute("INSERT INTO analytics_overviews(channel_id,generation,updated_at,payload_json)
        VALUES(?1,?2,?3,?4)",
        params![channel,generation,stamp,to_json(overview)?])
        .map_err(|e|format!("SQLITE_OVERVIEW_IMPORT: {e}"))?;
    // Only the CURRENT generation may advertise verified SQL rows. Old
    // migration markers would become dangerous after replacing data: a user
    // rolling back the JSON pointer could otherwise read newer SQLite rows
    // while seeing an older generation ID. Keep old JSON source intact.
    tx.execute("DELETE FROM analytics_migrations WHERE channel_id=?1",
        params![channel]).map_err(|e|format!("SQLITE_CLEAR_OLD_VERIFICATION: {e}"))?;
    // Replace only channel-owned materializations, atomically. The last good
    // generation remains committed if any SQL row or verification fails.
    for table in ["retention_points","subtitles","video_daily",
        "reach_daily","video_reach_daily","channel_daily","channel_events","videos"]{
        tx.execute(&format!("DELETE FROM {table} WHERE channel_id=?1"),params![channel])
            .map_err(|e|format!("SQLITE_CLEAR_{table}: {e}"))?;
    }
    migration_fault_point(1)?;
    // Prepared statements persist across the entire batch transaction: no SQL
    // parser allocation for each of 1,000,000 per-video observations.
    let mut video_day_insert=tx.prepare_cached(
        "INSERT INTO video_daily(channel_id,video_id,date,views,watch_minutes,observed_at,source,completeness,payload_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)"
    ).map_err(|e|format!("SQLITE_PREPARE_VIDEO_DAILY: {e}"))?;
    let mut seen=HashSet::<String>::new();let mut video_rows=0usize;let mut daily_rows=0usize;
    for video in catalog{
        let id=text(video,"videoId").ok_or("SQLITE_MISSING_VIDEO_ID")?;
        if !seen.insert(id.to_string()){return Err("SQLITE_DUPLICATE_VIDEO_ID".into())}
        let key=video_path_key(id);
        let detail=obj(&root.join("video-details").join(format!("{key}.json")))?;
        if text(&detail,"id")!=Some(id){return Err("SQLITE_VIDEO_DETAILS_MISMATCH".into())}
        if detail.pointer("/snippet/channelId").and_then(Value::as_str)
            .filter(|v|!v.is_empty()).map(|x|x!=channel).unwrap_or(false){
            return Err("SQLITE_VIDEO_DETAILS_WRONG_CHANNEL".into())
        }
        let views=video.get("viewsPublic").and_then(Value::as_i64)
            .or_else(||text(video,"viewsPublic").and_then(|s|s.parse::<i64>().ok()));
        tx.execute("INSERT INTO videos(channel_id,video_id,published_at,observed_at,source,completeness,
              payload_json,catalog_json,content_type,views_public)
          VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![channel,id,text(video,"publishedAt"),observed(video,&stamp),
                source(video,"youtube_data_api_v3"),completeness(video),to_json(&detail)?,
                to_json(video)?,text(video,"contentType"),views])
            .map_err(|e|format!("SQLITE_INSERT_VIDEO: {e}"))?;
        tx.execute("INSERT INTO metadata_history(channel_id,video_id,generation,observed_at,source,completeness,payload_json)
          VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![channel,id,generation,observed(video,&stamp),"youtube_data_api_v3",
                completeness(video),to_json(video)?]).map_err(|e|e.to_string())?;
        video_rows+=1;
        for row in optional_arr(&root.join("video-days").join(format!("{key}.json")))?{
            if text(&row,"videoId")!=Some(id){return Err("SQLITE_VIDEO_DAILY_IDENTITY_MISMATCH".into())}
            let d=date(&row)?;
            video_day_insert.execute(
                params![channel,id,d,row.get("views").and_then(Value::as_i64),
                    row.get("watchMinutes").and_then(Value::as_f64),
                    observed(&row,&stamp),source(&row,"youtube_analytics_api_v2"),
                    completeness(&row),to_json(&row)?])
                .map_err(|e|format!("SQLITE_VIDEO_DAILY_IMPORT: {e}"))?;
            daily_rows+=1;
        }
        if let Some(curve)=root.join("retention").join(format!("{key}.json"))
            .exists().then(||obj(&root.join("retention").join(format!("{key}.json")))).transpose()?{
            if text(&curve,"videoId")!=Some(id){return Err("SQLITE_RETENTION_ID_MISMATCH".into())}
            if text(&curve,"channelId").map(|x|x!=channel).unwrap_or(false){
                return Err("SQLITE_RETENTION_CHANNEL_MISMATCH".into())
            }
            // -1 is the authoritative full curve snapshot. Reconstructed point
            // arrays would discard coverage, fetchedAt, source and API metadata.
            // Keep normal point indices >=0 for efficient detail/analysis queries.
            tx.execute("INSERT INTO retention_points(channel_id,video_id,point_index,observed_at,source,completeness,payload_json)
                  VALUES(?1,?2,-1,?3,?4,?5,?6)",
                params![channel,id,observed(&curve,&stamp),
                    source(&curve,"youtube_analytics_api_v2"),completeness(&curve),to_json(&curve)?])
                .map_err(|e|format!("SQLITE_RETENTION_SNAPSHOT_IMPORT: {e}"))?;
            if let Some(points)=curve.get("points").and_then(Value::as_array){
                for (n,point) in points.iter().enumerate(){
                    tx.execute("INSERT INTO retention_points(channel_id,video_id,point_index,observed_at,source,completeness,payload_json)
                     VALUES(?1,?2,?3,?4,?5,?6,?7)",
                        params![channel,id,n as i64,observed(&curve,&stamp),
                            source(&curve,"youtube_analytics_api_v2"),completeness(&curve),to_json(point)?])
                        .map_err(|e|format!("SQLITE_RETENTION_IMPORT: {e}"))?;
                }
            }
        }
    }
    migration_fault_point(2)?;
    for row in daily{
        tx.execute("INSERT INTO channel_daily(channel_id,date,views,watch_minutes,observed_at,source,completeness,payload_json)
            VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![channel,date(row)?,row.get("views").and_then(Value::as_i64),
                row.get("watchMinutes").and_then(Value::as_f64),observed(row,&stamp),
                source(row,"youtube_analytics_api_v2"),completeness(row),to_json(row)?])
            .map_err(|e|format!("SQLITE_CHANNEL_DAILY_IMPORT: {e}"))?;
    }
    migration_fault_point(3)?;
    for row in reach{
        let id=text(row,"videoId").ok_or("SQLITE_REACH_VIDEO_MISSING")?;
        if !valid_video(id){return Err("SQLITE_REACH_VIDEO_INVALID".into())}
        tx.execute("INSERT INTO video_reach_daily(channel_id,video_id,date,impressions,ctr_raw,ctr_scale,observed_at,source,completeness,payload_json)
            VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![channel,id,date(row)?,row.get("impressions").and_then(Value::as_i64),
                row.get("ctrRaw").and_then(Value::as_f64),text(row,"ctrScale").unwrap_or("UNVERIFIED"),
                observed(row,&stamp),source(row,"youtube_reporting_api"),
                completeness(row),to_json(row)?]).map_err(|e|format!("SQLITE_REACH_IMPORT: {e}"))?;
    }
    for row in aggregate_reach(reach)?{
        tx.execute("INSERT INTO reach_daily(channel_id,date,impressions,ctr_raw,observed_at,source,completeness,payload_json)
          VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![channel,date(&row)?,row.get("impressions").and_then(Value::as_i64),
                row.get("ctrRaw").and_then(Value::as_f64),stamp,
                source(&row,"youtube_reporting_api"),completeness(&row),to_json(&row)?])
          .map_err(|e|format!("SQLITE_REACH_AGGREGATE: {e}"))?;
    }
    let events=overview.get("events").and_then(Value::as_array).cloned().unwrap_or_default();
    for event in &events{
        let payload=to_json(event)?;
        tx.execute("INSERT INTO channel_events(channel_id,event_hash,event_type,observed_at,source,completeness,payload_json)
          VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![channel,hash(&payload),text(event,"eventType"),observed(event,&stamp),
                source(event,"detected_between_scans"),completeness(event),payload])
            .map_err(|e|format!("SQLITE_EVENT_IMPORT: {e}"))?;
    }
    let traffic=overview.get("traffic").and_then(Value::as_array).cloned().unwrap_or_default();
    for (i,row) in traffic.iter().enumerate(){
        tx.execute("INSERT INTO traffic_sources(channel_id,generation,source_type,item_key,observed_at,source,completeness,payload_json)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![channel,generation,text(row,"sourceType").unwrap_or("UNKNOWN"),
                format!("{generation}:{i}"),observed(row,&stamp),source(row,"youtube_analytics_api_v2"),
                completeness(row),to_json(row)?]).map_err(|e|e.to_string())?;
    }
    let audiences=overview.get("audienceBreakdowns").and_then(Value::as_array).cloned().unwrap_or_default();
    for (i,row) in audiences.iter().enumerate(){
        // The Analytics API collector records device categories in "dimension",
        // not "type". Preserve the legacy "type" fallback for older snapshots.
        let table=if ["dimension","type"].iter().filter_map(|field|text(row,field))
            .any(|value|value.to_ascii_lowercase().contains("device")){
            "devices"
        }else{"audience_demographics"};
        insert_json_row(tx,table,channel,generation,i,row,&stamp,"youtube_analytics_api_v2")?;
    }
    let coverage=overview.get("coverage").unwrap_or(&Value::Null);
    tx.execute("INSERT INTO data_coverage(channel_id,generation,observed_at,source,completeness,payload_json)
      VALUES(?1,?2,?3,?4,?5,?6)",
        params![channel,generation,stamp,source(coverage,"youtube_api_collection"),
            completeness(coverage),to_json(coverage)?]).map_err(|e|e.to_string())?;
    tx.execute("INSERT INTO sync_jobs(channel_id,generation,status,started_at,finished_at,source_digest,payload_json)
     VALUES(?1,?2,'VERIFIED',?3,?3,?4,?5)",
        params![channel,generation,stamp,digest,to_json(&json!({"status":"VERIFIED","generation":generation}))?])
        .map_err(|e|e.to_string())?;
    let result=MigrationResult{generation:generation.to_string(),skipped:false,channels:1,
        videos:video_rows,channel_days:daily.len(),video_days:daily_rows,reach_rows:reach.len(),events:events.len()};
    let count=|table:&str|->Result<i64,String>{
        tx.query_row(&format!("SELECT COUNT(*) FROM {table} WHERE channel_id=?1"),params![channel],|r|r.get(0))
            .map_err(|e|e.to_string())
    };
    if count("videos")?!=video_rows as i64||count("channel_daily")?!=daily.len() as i64
        ||count("video_daily")?!=daily_rows as i64||count("video_reach_daily")?!=reach.len() as i64
        ||count("channel_events")?!=events.len() as i64{
        return Err("SQLITE_MIGRATION_ROW_COUNT_MISMATCH".into())
    }
    // SQLite FK enforcement is on for the entire transaction; verify again
    // before marking the generation authoritative to detect structural mistakes.
    let bad_relation:Option<String>=tx.query_row("PRAGMA foreign_key_check",[],|r|r.get(0))
        .optional().map_err(|e|format!("SQLITE_FOREIGN_KEY_CHECK: {e}"))?;
    if let Some(table)=bad_relation{
        return Err(format!("SQLITE_FOREIGN_KEY_INTEGRITY_FAILED: {table}"))
    }
    // Compare actual SQL sample payload with original JSON, not only row counts.
    if let Some(first)=daily.first(){
        let stored:String=tx.query_row("SELECT payload_json FROM channel_daily WHERE channel_id=?1 AND date=?2",
            params![channel,date(first)?],|r|r.get(0)).map_err(|e|e.to_string())?;
        let actual:Value=serde_json::from_str(&stored).map_err(|e|e.to_string())?;
        if actual!=*first{return Err("SQLITE_MIGRATION_SAMPLE_MISMATCH".into())}
    }
    migration_fault_point(4)?;
    tx.execute("INSERT INTO analytics_migrations(channel_id,generation,source_digest,verified_at,channel_days,video_days,videos,reach_rows,events)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![channel,generation,digest,stamp,daily.len() as i64,daily_rows as i64,
            video_rows as i64,reach.len() as i64,events.len() as i64])
        .map_err(|e|format!("SQLITE_VERIFICATION_COMMIT: {e}"))?;
    Ok(result)
}
/// Idempotent migration of latest published JSON generation; no deletion of
/// legacy generations, no mutation of OAuth state, one transaction per channel.
pub(crate) fn migrate_generation(cache:&Path,channel_id:&str)->Result<MigrationResult,String>{
    let (generation,root,overview,_pointer,catalog,daily,reach,digest)=canonical_source(cache,channel_id)?;
    fs::create_dir_all(cache).map_err(|e|e.to_string())?;
    // Establish and verify the immutable recovery marker before opening or
    // creating SQLite. A damaged backup cannot cause any database mutation.
    ensure_pointer_backup(cache,&generation)?;
    let path=cache.join(DB_NAME);
    let mut conn=prepare_db(&path)?;
    if let Some((old_digest,counts))=conn.query_row(
       "SELECT source_digest,channel_days,video_days,videos,reach_rows,events
        FROM analytics_migrations WHERE channel_id=?1 AND generation=?2",
        params![channel_id,generation],|r|Ok((r.get::<_,String>(0)?,
            [r.get::<_,i64>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?,r.get::<_,i64>(4)?,r.get::<_,i64>(5)?])))
        .optional().map_err(|e|e.to_string())?{
        if old_digest!=digest{return Err("SQLITE_RECOVERY_REQUIRED: source generation bytes changed after verification".into())}
        let n=counts;
        // A receipt alone does not prove the current materialized rows survived
        // a crash, disk edit or external write. Fail closed, preserving JSON.
        let expected=[daily.len() as i64,n[1],catalog.len() as i64,reach.len() as i64,
            overview.get("events").and_then(Value::as_array).map(|a|a.len()).unwrap_or(0) as i64];
        if n!=expected{return Err("SQLITE_RECOVERY_REQUIRED: receipt/source counts disagree".into())}
        for (table,want) in ["channel_daily","video_daily","videos","video_reach_daily","channel_events"]
            .iter().zip(expected){
            let actual:i64=conn.query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE channel_id=?1"),
                params![channel_id],|r|r.get(0))
                .map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: count {table}: {e}"))?;
            if actual!=want{
                return Err(format!("SQLITE_RECOVERY_REQUIRED: receipt rows missing or altered in {table}"))
            }
        }
        if let Some(first)=daily.first(){
            let stored:String=conn.query_row(
                "SELECT payload_json FROM channel_daily WHERE channel_id=?1 AND date=?2",
                params![channel_id,date(first)?],|r|r.get(0))
                .map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: sample row read: {e}"))?;
            let stored_value:Value=serde_json::from_str(&stored)
                .map_err(|e|format!("SQLITE_RECOVERY_REQUIRED: sample payload invalid: {e}"))?;
            if stored_value!=*first{
                return Err("SQLITE_RECOVERY_REQUIRED: stored sample differs from verified JSON".into())
            }
        }
        return Ok(MigrationResult{generation,skipped:true,channels:1,
            channel_days:n[0].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            video_days:n[1].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            videos:n[2].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            reach_rows:n[3].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            events:n[4].try_into().map_err(|_|"SQLITE_BAD_COUNT")?});
    }
    let tx=conn.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e|format!("SQLITE_BEGIN: {e}"))?;
    let result=import_generation(&tx,channel_id,&generation,&root,&overview,
        &catalog,&daily,&reach,&digest)?;
    // An external process may have published another JSON generation while
    // this writer was importing. Never commit a stale generation as current.
    // The SQL transaction rolls back automatically on this error.
    let active=obj(&cache.join("ui-current.json"))?;
    if text(&active,"channelId")!=Some(channel_id)
       ||text(&active,"generation")!=Some(generation.as_str()){
        return Err("SQLITE_CONCURRENT_GENERATION_CHANGED: source JSON preserved".into())
    }
    migration_fault_point(5)?;
    tx.commit().map_err(|e|format!("SQLITE_COMMIT: {e}"))?;
    // PASSIVE checkpoint has bounded impact on readers. A busy checkpoint is
    // not database corruption: the committed generation remains usable.
    let _checkpoint_state:Result<(i64,i64,i64),_>=conn.query_row(
        "PRAGMA wal_checkpoint(PASSIVE)",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?)));
    Ok(result)
}
/// Read only from a source-verified current generation. Never returns rows from
/// an older SQLite generation if the JSON pointer already moved forward.
pub(crate) fn read_channel_days(cache:&Path,channel_id:&str,start:Option<&str>,end:Option<&str>)
 ->Result<Option<Vec<Value>>,String>{
    let Some(conn)=read_current_verified(cache,channel_id)? else{return Ok(None)};
    let mut stmt=conn.prepare(
        "SELECT payload_json FROM channel_daily WHERE channel_id=?1
         AND (?2 IS NULL OR date>=?2) AND (?3 IS NULL OR date<=?3) ORDER BY date")
        .map_err(|e|e.to_string())?;
    let result=stmt.query_map(params![channel_id,start,end],|r|r.get::<_,String>(0))
        .map_err(|e|e.to_string())?;
    let mut out=Vec::new();
    for row in result{
        let value=row.map_err(|e|e.to_string())?;
        out.push(serde_json::from_str(&value).map_err(|e|format!("SQLITE_READ_JSON: {e}"))?);
    }
    Ok(Some(out))
}
/// Indexed reach aggregation avoids materializing millions of per-video CSV
/// rows just to render a per-day graph; raw CTR units remain UNVERIFIED.
pub(crate) fn read_reach_aggregate(cache:&Path,channel_id:&str,video_id:Option<&str>,
 start:Option<&str>,end:Option<&str>)->Result<Option<Vec<Value>>,String>{
    if video_id.map(|id|!valid_video(id)).unwrap_or(false){return Err("SQLITE_INVALID_VIDEO_ID".into())}
    let Some(conn)=read_current_verified(cache,channel_id)? else{return Ok(None)};
    let (sql,by_video)=if video_id.is_some(){(
        "SELECT date,SUM(impressions),CASE WHEN SUM(impressions)>0
          THEN SUM(impressions*ctr_raw)/SUM(impressions) ELSE NULL END
         FROM video_reach_daily WHERE channel_id=?1 AND video_id=?2
          AND (?3 IS NULL OR date>=?3) AND (?4 IS NULL OR date<=?4)
          AND ctr_raw IS NOT NULL AND impressions IS NOT NULL
         GROUP BY date ORDER BY date",true
    )}else{(
        "SELECT date,impressions,ctr_raw
         FROM reach_daily WHERE channel_id=?1
          AND (?2 IS NULL OR date>=?2) AND (?3 IS NULL OR date<=?3)
         ORDER BY date",false
    )};
    let mut stmt=conn.prepare(sql).map_err(|e|e.to_string())?;
    let mut cursor=if by_video{
        stmt.query(params![channel_id,video_id,start,end]).map_err(|e|e.to_string())?
    }else{
        stmt.query(params![channel_id,start,end]).map_err(|e|e.to_string())?
    };
    let mut result=Vec::new();
    while let Some(row)=cursor.next().map_err(|e|e.to_string())?{
        let date:String=row.get(0).map_err(|e|e.to_string())?;
        let impressions:Option<i64>=row.get(1).map_err(|e|e.to_string())?;
        let ctr_raw:Option<f64>=row.get(2).map_err(|e|e.to_string())?;
        result.push(json!({
            "date":date,"observedImpressions":impressions,
            "weightedCtrRaw":ctr_raw,"ctrScale":"UNVERIFIED",
            "coverage":"OBSERVED_REPORT_ROWS_ONLY",
            "source":"youtube_reporting_api_channel_reach_basic_a1"
        }));
    }
    Ok(Some(result))
}
pub(crate) fn read_video_days(cache:&Path,channel_id:&str,video_id:&str,start:Option<&str>,end:Option<&str>)
 ->Result<Option<Vec<Value>>,String>{
    if !valid_video(video_id){return Err("SQLITE_INVALID_VIDEO_ID".into())}
    let Some(conn)=read_current_verified(cache,channel_id)? else{return Ok(None)};
    let mut stmt=conn.prepare(
        "SELECT payload_json FROM video_daily WHERE channel_id=?1 AND video_id=?2
         AND (?3 IS NULL OR date>=?3) AND (?4 IS NULL OR date<=?4) ORDER BY date")
        .map_err(|e|e.to_string())?;
    let result=stmt.query_map(params![channel_id,video_id,start,end],|r|r.get::<_,String>(0))
        .map_err(|e|e.to_string())?;
    let mut out=Vec::new();
    for row in result{
        let value=row.map_err(|e|e.to_string())?;
        out.push(serde_json::from_str(&value).map_err(|e|format!("SQLITE_VIDEO_JSON: {e}"))?);
    }
    Ok(Some(out))
}

/// One-channel SQL-backed Analytics 360 view. It reads only the requested
/// video page and date range; millions of unrelated rows never enter React.
/// A result is emitted only if the current generation has a VERIFIED marker.
pub(crate) fn read_ui_snapshot(cache:&Path,channel_id:&str,page:u32,per_page:u32,period:&str,
    start:Option<&str>,end:Option<&str>,video_id:Option<&str>,
    content_type:Option<&str>,sort:Option<&str>)->Result<Option<Value>,String>{
    if video_id.map(|x|!valid_video(x)).unwrap_or(false){
        return Err("SQLITE_INVALID_VIDEO_ID".into())
    }
    let Some(conn)=read_current_verified(cache,channel_id)?else{return Ok(None)};
    let pointer=obj(&cache.join("ui-current.json"))?;
    let generation=text(&pointer,"generation").ok_or("SQLITE_POINTER_GENERATION_MISSING")?;
    let overview_json:String=conn.query_row(
        "SELECT payload_json FROM analytics_overviews WHERE channel_id=?1 AND generation=?2",
        params![channel_id,generation],|r|r.get(0))
        .map_err(|e|format!("SQLITE_OVERVIEW_READ: {e}"))?;
    let overview:Value=serde_json::from_str(&overview_json)
        .map_err(|e|format!("SQLITE_OVERVIEW_JSON_INVALID: {e}"))?;
    if text(&overview,"channelId")!=Some(channel_id){
        return Err("SQLITE_OVERVIEW_CHANNEL_MISMATCH".into())
    }
    let wanted=content_type.filter(|v|*v!="all");
    let filtered_total:i64=conn.query_row(
        "SELECT COUNT(*) FROM videos WHERE channel_id=?1 AND (?2 IS NULL OR content_type=?2)",
        params![channel_id,wanted],|r|r.get(0)).map_err(|e|e.to_string())?;
    let videos_total:i64=conn.query_row(
        "SELECT COUNT(*) FROM videos WHERE channel_id=?1",params![channel_id],
        |r|r.get(0)).map_err(|e|e.to_string())?;
    let per_page=per_page.clamp(1,100) as i64;
    let offset=(page as i64).saturating_mul(per_page).min(filtered_total);
    let catalog_sql=if sort==Some("views"){
        "SELECT catalog_json FROM videos WHERE channel_id=?1 AND
           (?2 IS NULL OR content_type=?2) ORDER BY views_public DESC,published_at DESC
           LIMIT ?3 OFFSET ?4"
    }else{
        "SELECT catalog_json FROM videos WHERE channel_id=?1 AND
           (?2 IS NULL OR content_type=?2) ORDER BY published_at DESC
           LIMIT ?3 OFFSET ?4"
    };
    let mut stmt=conn.prepare(catalog_sql).map_err(|e|e.to_string())?;
    let rows=stmt.query_map(params![channel_id,wanted,per_page,offset],|r|r.get::<_,String>(0))
        .map_err(|e|e.to_string())?;
    let mut videos=Vec::new();
    for row in rows{
        let data=row.map_err(|e|e.to_string())?;
        videos.push(serde_json::from_str::<Value>(&data)
            .map_err(|e|format!("SQLITE_CATALOG_JSON_INVALID: {e}"))?);
    }
    drop(stmt);
    let (mut selected,mut details,mut retention)=(Value::Null,Value::Null,Value::Null);
    let mut selected_days=Vec::<Value>::new();
    if let Some(id)=video_id{
        let pair=conn.query_row(
            "SELECT catalog_json,payload_json FROM videos WHERE channel_id=?1 AND video_id=?2",
            params![channel_id,id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))
            .optional().map_err(|e|e.to_string())?
            .ok_or("Видео отсутствует в этом канале")?;
        selected=serde_json::from_str(&pair.0).map_err(|e|e.to_string())?;
        details=serde_json::from_str(&pair.1).map_err(|e|e.to_string())?;
        selected_days=read_video_days(cache,channel_id,id,start,end)?
            .ok_or("SQLITE_VERIFIED_VIDEO_DAYS_UNAVAILABLE")?;
        let stored:Option<String>=conn.query_row(
            "SELECT payload_json FROM retention_points
             WHERE channel_id=?1 AND video_id=?2 AND point_index=-1",
            params![channel_id,id],|r|r.get(0))
            .optional().map_err(|e|format!("SQLITE_RETENTION_READ: {e}"))?;
        if let Some(snapshot)=stored{
            let exact:Value=serde_json::from_str(&snapshot)
                .map_err(|e|format!("SQLITE_RETENTION_JSON_INVALID: {e}"))?;
            if text(&exact,"videoId")!=Some(id) ||
                text(&exact,"channelId").map(|x|x!=channel_id).unwrap_or(false){
                return Err("SQLITE_RETENTION_SNAPSHOT_IDENTITY_MISMATCH".into())
            }
            retention=exact;
        }else{
            // Compatibility with already migrated v2 databases. Retain all
            // original metadata from the immutable published JSON generation.
            let key=video_path_key(id);
            let source=cache.join("ui-generations").join(generation)
                .join("retention").join(format!("{key}.json"));
            if source.exists(){
                let exact=obj(&source)?;
                if text(&exact,"videoId")!=Some(id)||
                    text(&exact,"channelId").map(|x|x!=channel_id).unwrap_or(false){
                    return Err("SQLITE_RETENTION_LEGACY_IDENTITY_MISMATCH".into())
                }
                retention=exact;
            }
        }
    }
    let channel_daily=read_channel_days(cache,channel_id,start,end)?
        .ok_or("SQLITE_VERIFIED_CHANNEL_DAYS_UNAVAILABLE")?;
    let channel_reach=read_reach_aggregate(cache,channel_id,None,start,end)?
        .ok_or("SQLITE_VERIFIED_CHANNEL_REACH_UNAVAILABLE")?;
    let video_reach=if let Some(id)=video_id{
        read_reach_aggregate(cache,channel_id,Some(id),start,end)?
            .ok_or("SQLITE_VERIFIED_VIDEO_REACH_UNAVAILABLE")?
    }else{Vec::new()};
    Ok(Some(json!({
        "status":"AVAILABLE","schemaVersion":2,"generation":generation,
        "updatedAt":pointer.get("updatedAt"),"overview":overview,
        "channelDaily":channel_daily,"channelReachDaily":channel_reach,
        "videoReachDaily":video_reach,"videos":videos,
        "videoCount":videos_total,"filteredVideoCount":filtered_total,
        "page":page,"pageSize":per_page,"selectedVideo":selected,
        "videoDetail":details,"videoDaily":selected_days,"retention":retention,
        "period":period,"periodFrom":start,"periodTo":end,
        "storageEngine":"sqlite_wal","storageVerified":true
    })))
}

#[cfg(test)]
mod tests{
    use super::*;
    fn sample_cache()->(PathBuf,String,String){
        let cache=std::env::temp_dir().join(format!("vyron-sqlite-test-{}",Uuid::new_v4()));
        let id="UC1234567890123456789012".to_string();
        let generation=Uuid::new_v4().to_string();
        let root=cache.join("ui-generations").join(&generation);
        fs::create_dir_all(root.join("video-details")).unwrap();
        fs::create_dir_all(root.join("video-days")).unwrap();
        fs::create_dir_all(root.join("retention")).unwrap();
        let video_id="aBc1234-X_y";
        fs::write(root.join("video-details").join(format!("{}.json",video_path_key(video_id))),
            serde_json::to_vec(&json!({"id":video_id,"snippet":{"channelId":id,"publishedAt":"2026-01-01T00:00:00Z"}})).unwrap()).unwrap();
        fs::write(root.join("video-days").join(format!("{}.json",video_path_key(video_id))),
            serde_json::to_vec(&json!([{"videoId":video_id,"date":"2026-01-01","views":12,"source":"api"}])).unwrap()).unwrap();
        fs::write(root.join("retention").join(format!("{}.json",video_path_key(video_id))),
            serde_json::to_vec(&json!({"videoId":video_id,"points":[[0.0,0.8],[0.5,0.4]],"retentionStatus":"PARTIAL","fetchedAt":"2026-10-01T07:00:00Z","provenance":"api_observed"})).unwrap()).unwrap();
        let docs=[
            ("overview.json",json!({"channelId":id,"generation":generation,"updatedAt":"2026-01-02",
                "summary":{"channelId":id,"name":"Test"},"coverage":{"status":"PARTIAL"},
                "events":[{"eventType":"vyron_upload","videoId":video_id}],"traffic":[],"audienceBreakdowns":[]})),
            ("video-catalog.json",json!([{"videoId":video_id,"channelId":id,"publishedAt":"2026-01-01T00:00:00Z"}])),
            ("channel-daily.json",json!([{"date":"2026-01-01","views":12,"watchMinutes":30.0,"source":"api"}])),
            ("reach-daily.json",json!([{"date":"2026-01-01","videoId":video_id,"impressions":500,"ctrRaw":0.03,"ctrScale":"UNVERIFIED"}]))
        ];
        for (name,value) in docs{fs::write(root.join(name),serde_json::to_vec(&value).unwrap()).unwrap();}
        fs::write(cache.join("ui-current.json"),
            serde_json::to_vec(&json!({"schemaVersion":1,"channelId":id,"generation":generation})).unwrap()).unwrap();
        (cache,id,generation)
    }
    fn activate(cache:&Path,channel:&str,generation:&str){
        fs::write(cache.join("ui-current.json"),
            serde_json::to_vec(&json!({"channelId":channel,"generation":generation})).unwrap()).unwrap();
    }
    fn clone_generation(cache:&Path,channel:&str,original:&str,views:i64)->String{
        let next=Uuid::new_v4().to_string();
        let source=cache.join("ui-generations").join(original);
        let target=cache.join("ui-generations").join(&next);
        for subdir in ["video-details","video-days","retention"]{
            fs::create_dir_all(target.join(subdir)).unwrap();
            for entry in fs::read_dir(source.join(subdir)).unwrap(){
                let entry=entry.unwrap();
                fs::copy(entry.path(),target.join(subdir).join(entry.file_name())).unwrap();
            }
        }
        for filename in ["video-catalog.json","reach-daily.json"]{
            fs::copy(source.join(filename),target.join(filename)).unwrap();
        }
        let mut overview=obj(&source.join("overview.json")).unwrap();
        overview["generation"]=json!(next);
        fs::write(target.join("overview.json"),serde_json::to_vec(&overview).unwrap()).unwrap();
        fs::write(target.join("channel-daily.json"),
            serde_json::to_vec(&json!([{"date":"2026-01-01","views":views,"watchMinutes":30.0,
                "subscribersGained":3,"subscribersLost":1,"source":"api"}])).unwrap()).unwrap();
        activate(cache,channel,&next);
        next
    }
    fn assert_channel_views(cache:&Path,channel:&str,views:i64){
        let rows=read_channel_days(cache,channel,None,None).unwrap().unwrap();
        assert_eq!(rows.len(),1);
        assert_eq!(rows[0]["views"],views);
    }
    #[test]fn device_dimension_is_stored_as_devices_without_misclassifying_demographics(){
        let (cache,id,generation)=sample_cache();
        let overview_path=cache.join("ui-generations").join(&generation).join("overview.json");
        let mut overview=obj(&overview_path).unwrap();
        overview["audienceBreakdowns"]=json!([
            {"dimension":"deviceType","rows":[{"key":"MOBILE","views":24}]},
            {"dimension":"ageGroup","rows":[{"key":"age18-24","viewerPercentage":33.0}]},
            {"type":"legacy_device","rows":[{"key":"DESKTOP","views":5}]}
        ]);
        fs::write(&overview_path,serde_json::to_vec(&overview).unwrap()).unwrap();
        migrate_generation(&cache,&id).unwrap();
        let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
        let devices:i64=conn.query_row(
            "SELECT COUNT(*) FROM devices WHERE channel_id=?1 AND generation=?2",
            params![id,generation],|r|r.get(0)).unwrap();
        let demographics:i64=conn.query_row(
            "SELECT COUNT(*) FROM audience_demographics WHERE channel_id=?1 AND generation=?2",
            params![id,generation],|r|r.get(0)).unwrap();
        assert_eq!(devices,2,"current and legacy device rows must be in devices");
        assert_eq!(demographics,1,"ageGroup must remain demographic data");
        let first:String=conn.query_row(
            "SELECT payload_json FROM devices WHERE channel_id=?1 AND generation=?2 ORDER BY item_key LIMIT 1",
            params![id,generation],|r|r.get(0)).unwrap();
        let payload:Value=serde_json::from_str(&first).unwrap();
        assert_eq!(payload["dimension"],"deviceType");
        drop(conn);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn migrates_verified_json_to_wal_and_keeps_original(){
        let (cache,id,_)=sample_cache();
        let initial=migrate_generation(&cache,&id).unwrap();
        assert_eq!((initial.videos,initial.video_days,initial.channel_days,initial.reach_rows,initial.events),(1,1,1,1,1));
        let again=migrate_generation(&cache,&id).unwrap();
        assert!(again.skipped);
        let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
        let journal:String=conn.query_row("PRAGMA journal_mode",[],|r|r.get(0)).unwrap();
        let fks:i64=conn.query_row("PRAGMA foreign_keys",[],|r|r.get(0)).unwrap();
        assert_eq!(journal.to_ascii_lowercase(),"wal");assert_eq!(fks,1);
        assert!(cache.join("ui-current.json").exists());
        let rows=read_channel_days(&cache,&id,Some("2026-01-01"),Some("2026-01-01")).unwrap().unwrap();
        assert_eq!(rows.len(),1);assert_eq!(rows[0]["views"],12);
        let video=read_video_days(&cache,&id,"aBc1234-X_y",Some("2026-01-01"),None).unwrap().unwrap();
        assert_eq!(video.len(),1);assert_eq!(video[0]["views"],12);
        let reach=read_reach_aggregate(&cache,&id,None,Some("2026-01-01"),None).unwrap().unwrap();
        assert_eq!(reach.len(),1);
        assert_eq!(reach[0]["observedImpressions"],500);
        assert_eq!(reach[0]["ctrScale"],"UNVERIFIED");
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn pointer_backup_is_atomic_private_and_verified_before_database_creation(){
        let (cache,id,generation)=sample_cache();
        let pointer=fs::read(cache.join("ui-current.json")).unwrap();
        let backup=cache.join(format!("ui-current-pre-sqlite-{generation}.json"));
        migrate_generation(&cache,&id).unwrap();
        assert_eq!(fs::read(&backup).unwrap(),pointer);
        assert!(!fs::read_dir(&cache).unwrap().any(|entry|{
            entry.unwrap().file_name().to_string_lossy().ends_with(".tmp")
        }));
        #[cfg(unix)]{
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(&backup).unwrap().permissions().mode()&0o777,0o600);
        }
        // A semantically identical pointer produced by a newer writer may
        // contain different optional fields; the immutable recovery identity
        // is channel + generation, not JSON whitespace or field ordering.
        activate(&cache,&id,&generation);
        assert!(migrate_generation(&cache,&id).unwrap().skipped);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn corrupt_pointer_backup_fails_closed_before_sqlite_is_created(){
        let (cache,id,generation)=sample_cache();
        let source=fs::read(cache.join("ui-current.json")).unwrap();
        let backup=cache.join(format!("ui-current-pre-sqlite-{generation}.json"));
        fs::write(&backup,b"{truncated").unwrap();
        let error=migrate_generation(&cache,&id).unwrap_err();
        assert!(error.contains("SQLITE_RECOVERY_REQUIRED"),"{error}");
        assert!(!cache.join(DB_NAME).exists(),"backup gate must precede SQLite creation");
        assert_eq!(fs::read(cache.join("ui-current.json")).unwrap(),source);
        assert_eq!(fs::read(&backup).unwrap(),b"{truncated");
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn missing_sql_rows_never_pass_idempotent_receipt_check(){
        let (cache,id,generation)=sample_cache();
        migrate_generation(&cache,&id).unwrap();
        let source=cache.join("ui-generations").join(&generation).join("channel-daily.json");
        let original=fs::read(&source).unwrap();
        let pointer=fs::read(cache.join("ui-current.json")).unwrap();
        {
            let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
            conn.execute("DELETE FROM channel_daily WHERE channel_id=?1",params![id]).unwrap();
        }
        let err=migrate_generation(&cache,&id).unwrap_err();
        assert!(err.contains("SQLITE_RECOVERY_REQUIRED"),"{err}");
        assert!(err.contains("channel_daily"),"{err}");
        assert_eq!(fs::read(&source).unwrap(),original);
        assert_eq!(fs::read(cache.join("ui-current.json")).unwrap(),pointer);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn changed_sql_payload_with_unchanged_row_count_is_not_silently_trusted(){
        let (cache,id,_)=sample_cache();
        migrate_generation(&cache,&id).unwrap();
        {
            let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
            conn.execute("UPDATE channel_daily SET payload_json=?1 WHERE channel_id=?2",
                params![r#"{"date":"2026-01-01","views":999}"#,id]).unwrap();
        }
        let err=migrate_generation(&cache,&id).unwrap_err();
        assert!(err.contains("SQLITE_RECOVERY_REQUIRED"),"{err}");
        assert!(err.contains("stored sample"),"{err}");
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn malformed_video_identity_rolls_back_without_erasing_json(){
        let (cache,id,generation)=sample_cache();
        let root=cache.join("ui-generations").join(generation);
        let path=root.join("video-days").join(format!("{}.json",video_path_key("aBc1234-X_y")));
        fs::write(&path,b"[{\"videoId\":\"bbbbbbbbbbb\",\"date\":\"2026-01-01\",\"views\":12}]").unwrap();
        let err=migrate_generation(&cache,&id).unwrap_err();
        assert!(err.contains("SQLITE_VIDEO_DAILY_IDENTITY_MISMATCH"));
        assert!(path.exists());
        let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
        let count:i64=conn.query_row("SELECT COUNT(*) FROM analytics_migrations",[],|r|r.get(0)).unwrap();
        assert_eq!(count,0);
        let _=fs::remove_dir_all(cache);
    }
    /// Explicit stress fixture, never touches the owner's real data or OAuth.
    /// 50 channels x 200 videos x 100 days = 1,000,000 video-day rows.
    /// Run: cargo test --locked --lib analytics_sqlite::tests::stress_fleet_50_10k_1m -- --ignored --nocapture
    #[test]
    #[ignore = "10k video / 1m daily-row macOS stress benchmark; execute as separate CI performance gate"]
    fn stress_fleet_50_10k_1m(){
        use std::time::Instant;
        let root=std::env::temp_dir().join(format!("vyron-sqlite-stress-{}",Uuid::new_v4()));
        let started=Instant::now();
        let mut total_db_bytes=0u64;let mut insert_ms=0u128;let mut queries_ms=0u128;
        let mut peak_rss_kb=0u64;
        let day_zero=NaiveDate::from_ymd_opt(2026,1,1).unwrap();
        for channel_index in 0..50{
            let cid=format!("UC{:022}",channel_index);
            let cache=root.join(&cid);
            let generation=Uuid::new_v4().to_string();
            let gen_root=cache.join("ui-generations").join(&generation);
            for folder in ["video-details","video-days","retention"]{
                fs::create_dir_all(gen_root.join(folder)).unwrap();
            }
            let mut catalog=Vec::with_capacity(200);
            for video_index in 0..200{
                let vid=format!("{:011}",channel_index*200+video_index);
                let detail=json!({"id":vid,"snippet":{"channelId":cid,"title":format!("Track {video_index}"),
                    "publishedAt":"2026-01-01T00:00:00Z"}});
                fs::write(gen_root.join("video-details").join(format!("{}.json",video_path_key(&vid))),
                    serde_json::to_vec(&detail).unwrap()).unwrap();
                catalog.push(json!({"videoId":vid,"channelId":cid,"title":format!("Track {video_index}"),
                    "publishedAt":"2026-01-01T00:00:00Z","contentType":"video","viewsPublic":"1000"}));
                let records=(0..100).map(|n|{
                    let day=day_zero+chrono::Duration::days(n);
                    json!({"videoId":vid,"date":day.format("%Y-%m-%d").to_string(),
                        "views":10+n,"watchMinutes":120.0,"source":"synthetic_performance_fixture",
                        "fetchedAt":"2026-05-01T00:00:00Z"})
                }).collect::<Vec<_>>();
                fs::write(gen_root.join("video-days").join(format!("{}.json",video_path_key(&vid))),
                    serde_json::to_vec(&records).unwrap()).unwrap();
                // Each video has a relatively large synthetic retention curve.
                let points=(0..25).map(|x|json!([x as f64/25.0,1.0-x as f64/40.0])).collect::<Vec<_>>();
                fs::write(gen_root.join("retention").join(format!("{}.json",video_path_key(&vid))),
                    serde_json::to_vec(&json!({"videoId":vid,"points":points})).unwrap()).unwrap();
            }
            let days=(0..100).map(|n|{
                let day=day_zero+chrono::Duration::days(n);
                json!({"date":day.format("%Y-%m-%d").to_string(),"views":2200,
                    "watchMinutes":12000.0,"source":"synthetic_performance_fixture"})
            }).collect::<Vec<_>>();
            let overview=json!({"channelId":cid,"generation":generation,
                "summary":{"channelId":cid,"name":format!("Synthetic Channel {channel_index}")},
                "events":[],"coverage":{"status":"AVAILABLE"},
                "traffic":[],"audienceBreakdowns":[]});
            for (filename,value) in [
                ("overview.json",overview),("video-catalog.json",json!(catalog)),
                ("channel-daily.json",json!(days)),("reach-daily.json",json!([]))
            ]{
                fs::write(gen_root.join(filename),serde_json::to_vec(&value).unwrap()).unwrap();
            }
            fs::write(cache.join("ui-current.json"),
                serde_json::to_vec(&json!({"channelId":cid,"generation":generation})).unwrap()).unwrap();
            let insert_start=Instant::now();
            let result=migrate_generation(&cache,&cid).unwrap();
            insert_ms+=insert_start.elapsed().as_millis();
            assert_eq!(result.videos,200);
            assert_eq!(result.video_days,20000);
            let query_start=Instant::now();
            let page=read_ui_snapshot(&cache,&cid,1,40,"all",None,None,None,None,Some("views"))
                .unwrap().unwrap();
            assert_eq!(page["videoCount"],200);
            assert_eq!(page["videos"].as_array().unwrap().len(),40);
            assert_eq!(page["channelDaily"].as_array().unwrap().len(),100);
            queries_ms+=query_start.elapsed().as_millis();
            total_db_bytes+=fs::metadata(cache.join(DB_NAME)).unwrap().len();
            if let Ok(raw)=std::process::Command::new("ps").args([
                "-o","rss=","-p",&std::process::id().to_string()]).output(){
                if let Ok(value)=String::from_utf8(raw.stdout){
                    peak_rss_kb=peak_rss_kb.max(value.trim().parse::<u64>().unwrap_or(0));
                }
            }
        }
        eprintln!("VYRON_SQLITE_SYNTHETIC_BENCH: channels=50 videos=10000 video_daily=1000000 retention_points=250000");
        eprintln!("VYRON_SQLITE_SYNTHETIC_BENCH: migration_ms={} query_ms={} sqlite_bytes={} peak_process_rss_kb={} total_ms={}",
            insert_ms,queries_ms,total_db_bytes,peak_rss_kb,started.elapsed().as_millis());
        assert!(total_db_bytes>0);
        let _=fs::remove_dir_all(root);
    }
    #[test]fn verified_sqlite_page_matches_json_source_and_video_passport(){
        let (cache,id,_)=sample_cache();
        migrate_generation(&cache,&id).unwrap();
        let p=read_ui_snapshot(&cache,&id,0,40,"all",None,None,
            Some("aBc1234-X_y"),Some("all"),Some("recent")).unwrap().unwrap();
        assert_eq!(p["storageEngine"],"sqlite_wal");
        assert_eq!(p["videoCount"],1);
        assert_eq!(p["videos"][0]["videoId"],"aBc1234-X_y");
        assert_eq!(p["selectedVideo"]["videoId"],"aBc1234-X_y");
        assert_eq!(p["videoDetail"]["id"],"aBc1234-X_y");
        assert_eq!(p["videoDaily"][0]["views"],12);
        assert_eq!(p["channelDaily"][0]["views"],12);
        assert_eq!(p["retention"]["points"].as_array().unwrap().len(),2);
        assert_eq!(p["retention"]["retentionStatus"],"PARTIAL");
        assert_eq!(p["retention"]["provenance"],"api_observed");
        assert_eq!(p["retention"]["fetchedAt"],"2026-10-01T07:00:00Z");
        assert_eq!(p["channelReachDaily"][0]["observedImpressions"],500);
        let empty_page=read_ui_snapshot(&cache,&id,12,40,"all",None,None,
            None,None,None).unwrap().unwrap();
        assert_eq!(empty_page["filteredVideoCount"],1);
        assert_eq!(empty_page["videos"].as_array().unwrap().len(),0);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn rollback_to_older_json_generation_never_reads_newer_sqlite_values(){
        let (cache,id,original_generation)=sample_cache();
        let original_pointer=fs::read(cache.join("ui-current.json")).unwrap();
        migrate_generation(&cache,&id).unwrap();
        let next=Uuid::new_v4().to_string();
        let source=cache.join("ui-generations").join(&original_generation);
        let target=cache.join("ui-generations").join(&next);
        for subdir in ["video-details","video-days","retention"]{
            fs::create_dir_all(target.join(subdir)).unwrap();
            for entry in fs::read_dir(source.join(subdir)).unwrap(){
                let entry=entry.unwrap();
                fs::copy(entry.path(),target.join(subdir).join(entry.file_name())).unwrap();
            }
        }
        for filename in ["video-catalog.json","reach-daily.json"]{
            fs::copy(source.join(filename),target.join(filename)).unwrap();
        }
        let mut overview=obj(&source.join("overview.json")).unwrap();
        overview["generation"]=json!(next);
        fs::write(target.join("overview.json"),serde_json::to_vec(&overview).unwrap()).unwrap();
        let changed=json!([{"date":"2026-01-01","views":99,"watchMinutes":30.0}]);
        fs::write(target.join("channel-daily.json"),serde_json::to_vec(&changed).unwrap()).unwrap();
        fs::write(cache.join("ui-current.json"),
            serde_json::to_vec(&json!({"channelId":id,"generation":next})).unwrap()).unwrap();
        migrate_generation(&cache,&id).unwrap();
        let newer=read_channel_days(&cache,&id,None,None).unwrap().unwrap();
        assert_eq!(newer[0]["views"],99);
        // Rollback is a pointer operation, not an implicit SQL reimport.
        fs::write(cache.join("ui-current.json"),original_pointer).unwrap();
        assert!(read_channel_days(&cache,&id,None,None).unwrap().is_none());
        // The old source remains readable; an explicit remigration can verify it.
        migrate_generation(&cache,&id).unwrap();
        let rolled_back=read_channel_days(&cache,&id,None,None).unwrap().unwrap();
        assert_eq!(rolled_back[0]["views"],12);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn value_level_json_sql_parity_survives_reopen_wal_checkpoint_and_foreign_keys(){
        let (cache,channel,generation)=sample_cache();
        let root=cache.join("ui-generations").join(&generation);
        let mut overview=obj(&root.join("overview.json")).unwrap();
        overview["traffic"]=json!([{"sourceType":"YT_SEARCH","views":22,
            "watchMinutes":18.25,"fetchedAt":"2026-10-01T00:00:00Z"}]);
        overview["audienceBreakdowns"]=json!([{"type":"device","views":8},
            {"type":"age","views":14}]);
        fs::write(root.join("overview.json"),serde_json::to_vec(&overview).unwrap()).unwrap();
        let daily=json!([{"date":"2026-01-01","views":12,"watchMinutes":30.0,
            "subscribersGained":6,"subscribersLost":2,"fetchedAt":"2026-10-01T00:00:00Z"}]);
        fs::write(root.join("channel-daily.json"),serde_json::to_vec(&daily).unwrap()).unwrap();
        let video_id="aBc1234-X_y";
        let video_days=json!([{"videoId":video_id,"date":"2026-01-01","views":12,
            "subscribersGained":3,"subscribersLost":1,"averageViewPercentage":64.5,
            "watchMinutes":24.125,"source":"youtube_analytics_api_v2"}]);
        fs::write(root.join("video-days").join(format!("{}.json",video_path_key(video_id))),
            serde_json::to_vec(&video_days).unwrap()).unwrap();
        migrate_generation(&cache,&channel).unwrap();
        {
            let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
            let version:i32=conn.query_row("PRAGMA user_version",[],|r|r.get(0)).unwrap();
            assert_eq!(version,SCHEMA_VERSION);
            let fk:i64=conn.query_row("PRAGMA foreign_keys",[],|r|r.get(0)).unwrap();
            assert_eq!(fk,1);
            let invalid:Option<String>=conn.query_row("PRAGMA foreign_key_check",[],|r|r.get(0))
                .optional().unwrap();
            assert_eq!(invalid,None);
            let check:String=conn.query_row("PRAGMA integrity_check",[],|r|r.get(0)).unwrap();
            assert_eq!(check,"ok");
            for (table,source) in [
                ("channel_daily",daily[0].clone()),
                ("video_daily",video_days[0].clone()),
                ("video_reach_daily",obj(&root.join("reach-daily.json")).unwrap()[0].clone()),
                ("analytics_overviews",overview.clone()),
                ("data_coverage",overview["coverage"].clone()),
                ("metadata_history",obj(&root.join("video-catalog.json")).unwrap()[0].clone())
            ] {
                let raw:String=conn.query_row(
                    &format!("SELECT payload_json FROM {table} WHERE channel_id=?1 LIMIT 1"),
                    params![channel],|r|r.get(0)).unwrap();
                let sql:Value=serde_json::from_str(&raw).unwrap();
                assert_eq!(sql,source,"{table} JSON↔SQLite payload diverged");
            }
            let curve=obj(&root.join("retention").join(format!("{}.json",video_path_key(video_id)))).unwrap();
            let raw:String=conn.query_row(
                "SELECT payload_json FROM retention_points WHERE channel_id=?1 AND video_id=?2 AND point_index=-1",
                params![channel,video_id],|r|r.get(0)).unwrap();
            assert_eq!(serde_json::from_str::<Value>(&raw).unwrap(),curve);
            let event:String=conn.query_row(
                "SELECT payload_json FROM channel_events WHERE channel_id=?1",
                params![channel],|r|r.get(0)).unwrap();
            assert_eq!(serde_json::from_str::<Value>(&event).unwrap(),overview["events"][0]);
            let traffic:String=conn.query_row(
                "SELECT payload_json FROM traffic_sources WHERE channel_id=?1 AND generation=?2",
                params![channel,generation],|r|r.get(0)).unwrap();
            assert_eq!(serde_json::from_str::<Value>(&traffic).unwrap(),overview["traffic"][0]);
            for table in ["devices","audience_demographics"]{
                let raw:String=conn.query_row(
                    &format!("SELECT payload_json FROM {table} WHERE channel_id=?1"),
                    params![channel],|r|r.get(0)).unwrap();
                let value:Value=serde_json::from_str(&raw).unwrap();
                assert!(overview["audienceBreakdowns"].as_array().unwrap().contains(&value));
            }
            let checkpoint:(i64,i64,i64)=conn.query_row(
                "PRAGMA wal_checkpoint(PASSIVE)",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
            assert_eq!(checkpoint.0,0,"WAL readers blocked checkpoint");
        }
        assert_channel_views(&cache,&channel,12);
        assert!(migrate_generation(&cache,&channel).unwrap().skipped);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn interrupted_transaction_never_removes_verified_data_and_unknown_schema_is_read_only(){
        let (cache,channel,_)=sample_cache();
        migrate_generation(&cache,&channel).unwrap();
        {
            let mut conn=prepare_db(&cache.join(DB_NAME)).unwrap();
            let tx=conn.transaction_with_behavior(TransactionBehavior::Immediate).unwrap();
            tx.execute("DELETE FROM channel_daily WHERE channel_id=?1",params![channel]).unwrap();
            assert_eq!(tx.query_row("SELECT COUNT(*) FROM channel_daily WHERE channel_id=?1",
                params![channel],|r|r.get::<_,i64>(0)).unwrap(),0);
            // Simulated process termination: leave without COMMIT; DROP rolls back.
        }
        assert_channel_views(&cache,&channel,12);
        {
            let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
            conn.pragma_update(None,"user_version",999).unwrap();
        }
        let error=read_channel_days(&cache,&channel,None,None).unwrap_err();
        assert!(error.contains("SQLITE_RECOVERY_REQUIRED"),"{error}");
        let error=migrate_generation(&cache,&channel).unwrap_err();
        assert!(error.contains("SQLITE_RECOVERY_REQUIRED"),"{error}");
        assert!(cache.join("ui-current.json").exists());
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn wal_readers_never_return_wrong_generation_during_switch(){
        use std::sync::{Arc,Barrier};
        let (cache,channel,a)=sample_cache();
        migrate_generation(&cache,&channel).unwrap();
        let b=clone_generation(&cache,&channel,&a,99);
        let start=Arc::new(Barrier::new(9));
        let mut readers=Vec::new();
        for _ in 0..8{
            let start=start.clone();let path=cache.clone();let cid=channel.clone();
            readers.push(std::thread::spawn(move||{
                start.wait();
                for _ in 0..30{
                    // Readers may see old pointer until writer enters, but must
                    // never get a fabricated or cross-channel value.
                    if let Some(rows)=read_channel_days(&path,&cid,None,None).unwrap(){
                        let v=rows.first().unwrap()["views"].as_i64().unwrap();
                        assert!(v==12||v==99,"unverified SQL generation");
                    }
                }
            }));
        }
        start.wait();
        migrate_generation(&cache,&channel).unwrap();
        for thread in readers{thread.join().unwrap()}
        assert_channel_views(&cache,&channel,99);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn a_b_a_b_switches_preserve_all_historical_receipts_and_no_duplicates(){
        let (cache,channel,a)=sample_cache();
        // Populate generation-keyed tables before initial verification.
        let root=cache.join("ui-generations").join(&a);
        let mut overview=obj(&root.join("overview.json")).unwrap();
        overview["traffic"]=json!([{"sourceType":"YT_SEARCH","views":27}]);
        overview["audienceBreakdowns"]=json!([{"type":"device","views":13},
            {"type":"age","views":14}]);
        fs::write(root.join("overview.json"),serde_json::to_vec(&overview).unwrap()).unwrap();
        migrate_generation(&cache,&channel).unwrap();
        let b=clone_generation(&cache,&channel,&a,99);
        migrate_generation(&cache,&channel).unwrap();
        assert_channel_views(&cache,&channel,99);
        activate(&cache,&channel,&a);
        assert!(read_channel_days(&cache,&channel,None,None).unwrap().is_none());
        migrate_generation(&cache,&channel).unwrap();
        assert_channel_views(&cache,&channel,12);
        activate(&cache,&channel,&b);
        assert!(read_channel_days(&cache,&channel,None,None).unwrap().is_none());
        migrate_generation(&cache,&channel).unwrap();
        assert_channel_views(&cache,&channel,99);
        assert!(migrate_generation(&cache,&channel).unwrap().skipped);
        let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
        for table in ["analytics_overviews","metadata_history","sync_jobs",
            "data_coverage","traffic_sources","audience_demographics","devices"]{
            let count:i64=conn.query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE channel_id=?1"),
                params![channel],|r|r.get(0)).unwrap();
            let expected=2;
            assert_eq!(count,expected,"{table} generated duplicates or lost history");
        }
        let active:i64=conn.query_row(
            "SELECT COUNT(*) FROM analytics_migrations WHERE channel_id=?1",
            params![channel],|r|r.get(0)).unwrap();
        assert_eq!(active,1);
        assert!(root.join("overview.json").exists());
        assert!(cache.join("ui-generations").join(b).join("overview.json").exists());
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn historical_digest_change_is_rejected_before_any_sql_replacement(){
        let (cache,channel,a)=sample_cache();
        migrate_generation(&cache,&channel).unwrap();
        let b=clone_generation(&cache,&channel,&a,99);
        migrate_generation(&cache,&channel).unwrap();
        let original=cache.join("ui-generations").join(&a).join("channel-daily.json");
        fs::write(&original,b"[{\"date\":\"2026-01-01\",\"views\":999}]").unwrap();
        activate(&cache,&channel,&a);
        let error=migrate_generation(&cache,&channel).unwrap_err();
        assert!(error.contains("SQLITE_RECOVERY_REQUIRED"),"{error}");
        activate(&cache,&channel,&b);
        assert_channel_views(&cache,&channel,99);
        let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
        let still_verified:i64=conn.query_row(
            "SELECT COUNT(*) FROM analytics_migrations WHERE channel_id=?1 AND generation=?2",
            params![channel,b],|r|r.get(0)).unwrap();
        assert_eq!(still_verified,1);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn malformed_json_never_replaces_last_verified_sql_generation(){
        let (cache,channel,a)=sample_cache();
        migrate_generation(&cache,&channel).unwrap();
        let b=clone_generation(&cache,&channel,&a,99);
        let source=cache.join("ui-generations").join(&b).join("channel-daily.json");
        fs::write(&source,b"{invalid-json}").unwrap();
        let err=migrate_generation(&cache,&channel).unwrap_err();
        assert!(err.contains("SQLITE_JSON_PARSE"),"{err}");
        activate(&cache,&channel,&a);
        assert_channel_views(&cache,&channel,12);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn failed_import_after_sql_deletes_rolls_back_full_transaction(){
        let (cache,channel,a)=sample_cache();
        migrate_generation(&cache,&channel).unwrap();
        let b=clone_generation(&cache,&channel,&a,99);
        // canonical_source digests this file and can parse it. The failure
        // occurs after SQL writes and replacement deletes have begun.
        let invalid=cache.join("ui-generations").join(&b).join("video-days")
            .join(format!("{}.json",video_path_key("aBc1234-X_y")));
        fs::write(&invalid,serde_json::to_vec(&json!([
            {"videoId":"aBc1234-X_y","date":"2026-01-01","views":20},
            {"videoId":"WRONG-ID00","date":"2026-01-02","views":50}
        ])).unwrap()).unwrap();
        let error=migrate_generation(&cache,&channel).unwrap_err();
        assert!(error.contains("SQLITE_VIDEO_DAILY_IDENTITY_MISMATCH"),"{error}");
        activate(&cache,&channel,&a);
        assert_channel_views(&cache,&channel,12);
        let conn=prepare_db(&cache.join(DB_NAME)).unwrap();
        let count:i64=conn.query_row(
            "SELECT COUNT(*) FROM analytics_overviews WHERE channel_id=?1",
            params![channel],|r|r.get(0)).unwrap();
        assert_eq!(count,1);
        let incomplete:i64=conn.query_row(
            "SELECT COUNT(*) FROM sync_jobs WHERE channel_id=?1 AND generation=?2",
            params![channel,b],|r|r.get(0)).unwrap();
        assert_eq!(incomplete,0);
        assert!(invalid.exists());
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn wrong_channel_reads_and_migrations_do_not_expose_any_other_channel(){
        let (cache,channel,_)=sample_cache();
        migrate_generation(&cache,&channel).unwrap();
        let other="UC2222222222222222222222";
        assert!(read_channel_days(&cache,other,None,None).is_err());
        assert!(migrate_generation(&cache,other).is_err());
        assert_channel_views(&cache,&channel,12);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn two_independent_channel_stores_remain_isolated(){
        let (one,channel_a,_)=sample_cache();
        let (two,_same_id,b)=sample_cache();
        let channel_b="UC3333333333333333333333";
        let root=two.join("ui-generations").join(&b);
        for path in [
            two.join("ui-current.json"),root.join("overview.json"),
            root.join("video-catalog.json"),
            root.join("video-details").join(format!("{}.json",video_path_key("aBc1234-X_y")))
        ]{
            let contents=fs::read_to_string(&path).unwrap().replace(&channel_a,channel_b);
            fs::write(&path,contents).unwrap();
        }
        let th=std::thread::spawn({let path=one.clone();let id=channel_a.clone();
            move||migrate_generation(&path,&id).unwrap()});
        let result=migrate_generation(&two,channel_b).unwrap();
        assert_eq!(result.videos,1);
        th.join().unwrap();
        assert_channel_views(&one,&channel_a,12);
        assert_channel_views(&two,channel_b,12);
        assert!(read_channel_days(&two,&channel_a,None,None).is_err());
        assert!(read_channel_days(&one,channel_b,None,None).is_err());
        let _=fs::remove_dir_all(one);
        let _=fs::remove_dir_all(two);
    }
    #[test]fn five_migration_interruptions_preserve_previous_verified_sql_and_source_json(){
        let (cache,channel,original)=sample_cache();
        migrate_generation(&cache,&channel).unwrap();
        let next=clone_generation(&cache,&channel,&original,99);
        let pointer=fs::read(cache.join("ui-current.json")).unwrap();
        let next_source=cache.join("ui-generations").join(&next).join("channel-daily.json");
        let bytes=fs::read(&next_source).unwrap();
        for stage in 1..=5{
            INJECT_MIGRATION_STAGE.with(|setting|setting.set(stage));
            let result=migrate_generation(&cache,&channel);
            INJECT_MIGRATION_STAGE.with(|setting|setting.set(0));
            let error=result.expect_err("injected migration must fail");
            assert!(error.contains(&format!("SQLITE_TEST_INJECTED_INTERRUPTION_STAGE_{stage}")),"{error}");
            assert_eq!(fs::read(&next_source).unwrap(),bytes,"source JSON must remain immutable");
            assert_eq!(fs::read(cache.join("ui-current.json")).unwrap(),pointer,
                "pointer must never be modified by failed SQL import");
            let db=prepare_db(&cache.join(DB_NAME)).unwrap();
            let marker:i64=db.query_row(
                "SELECT COUNT(*) FROM analytics_migrations WHERE channel_id=?1 AND generation=?2",
                params![channel,next],|r|r.get(0)).unwrap();
            assert_eq!(marker,0,"interrupted generation cannot claim verification");
            drop(db);
            activate(&cache,&channel,&original);
            assert_channel_views(&cache,&channel,12);
            activate(&cache,&channel,&next);
        }
        migrate_generation(&cache,&channel).unwrap();
        assert_channel_views(&cache,&channel,99);
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn damaged_database_is_not_replaced_with_blank_file(){
        let (cache,id,_)=sample_cache();
        fs::write(cache.join(DB_NAME),b"definitely not SQLite").unwrap();
        let err=migrate_generation(&cache,&id).unwrap_err();
        assert!(err.contains("SQLITE_RECOVERY_REQUIRED"));
        assert_eq!(fs::read(cache.join(DB_NAME)).unwrap(),b"definitely not SQLite");
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn truncated_database_page_fails_integrity_without_touching_json_history(){
        let (cache,id,generation)=sample_cache();
        migrate_generation(&cache,&id).unwrap();
        let source=cache.join("ui-generations").join(generation).join("channel-daily.json");
        let source_bytes=fs::read(&source).unwrap();
        let database=cache.join(DB_NAME);
        {
            let conn=prepare_db(&database).unwrap();
            let _:Result<(i64,i64,i64),_>=conn.query_row(
                "PRAGMA wal_checkpoint(TRUNCATE)",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?)));
        }
        let original_len=fs::metadata(&database).unwrap().len();
        assert!(original_len>4096);
        fs::OpenOptions::new().write(true).open(&database).unwrap().set_len(100).unwrap();
        let error=migrate_generation(&cache,&id).unwrap_err();
        assert!(error.contains("SQLITE_")||error.to_ascii_lowercase().contains("database"),"{error}");
        assert_eq!(fs::metadata(&database).unwrap().len(),100,"damaged DB must not be replaced");
        assert_eq!(fs::read(&source).unwrap(),source_bytes,"JSON recovery history is immutable");
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn wrong_channel_and_changed_same_generation_are_rejected(){
        let (cache,id,generation)=sample_cache();
        assert!(migrate_generation(&cache,"UC2222222222222222222222").is_err());
        migrate_generation(&cache,&id).unwrap();
        let path=cache.join("ui-generations").join(generation).join("channel-daily.json");
        fs::write(&path,b"[{\"date\":\"2026-01-01\",\"views\":999}]").unwrap();
        let err=migrate_generation(&cache,&id).unwrap_err();
        assert!(err.contains("SQLITE_RECOVERY_REQUIRED"));
        let _=fs::remove_dir_all(cache);
    }
}
