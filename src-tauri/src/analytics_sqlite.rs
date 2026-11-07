//! VYRON Mac Analytics SQLite/WAL engine.
//! Staged additive store: immutable JSON generations remain the recovery source
//! until a transactionally migrated, row-verified SQLite generation is ready.
//! NEVER touches OAuth, app state, Publisher, or Windows storage.
use chrono::{NaiveDate,Utc};
use rusqlite::{params,Connection,OptionalExtension,OpenFlags,Transaction,TransactionBehavior};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::HashSet,fs,path::{Path,PathBuf},time::Duration};
use uuid::Uuid;

const SCHEMA_VERSION:i32=1;
const DB_NAME:&str="analytics-v1.sqlite3";
const SCHEMA:&str=r#"
CREATE TABLE IF NOT EXISTS channels(
 channel_id TEXT PRIMARY KEY NOT NULL, name TEXT, observed_at TEXT NOT NULL,
 source TEXT NOT NULL, completeness TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS videos(
 channel_id TEXT NOT NULL,video_id TEXT NOT NULL,published_at TEXT,
 observed_at TEXT NOT NULL,source TEXT NOT NULL,completeness TEXT NOT NULL,
 payload_json TEXT NOT NULL,PRIMARY KEY(channel_id,video_id),
 FOREIGN KEY(channel_id) REFERENCES channels(channel_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(channel_id,published_at DESC);
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
 FOREIGN KEY(channel_id,video_id) REFERENCES videos(channel_id,video_id) ON DELETE CASCADE);
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
    let bytes=fs::read(path).map_err(|e|format!("SQLITE_FILE_READ: {e}"))?;
    if !bytes.starts_with(b"SQLite format 3\0"){
        return Err("SQLITE_RECOVERY_REQUIRED: invalid existing database header; no replacement attempted".into())
    }
    Ok(())
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
    let quick:String=conn.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    if quick!="ok"{return Err(format!("SQLITE_RECOVERY_REQUIRED: integrity check: {quick}"))}
    Ok(conn)
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
        "audience_demographics"=>"INSERT OR REPLACE INTO audience_demographics(channel_id,generation,item_key,observed_at,source,completeness,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        "devices"=>"INSERT OR REPLACE INTO devices(channel_id,generation,item_key,observed_at,source,completeness,payload_json) VALUES (?1,?2,?3,?4,?5,?6,?7)",
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
    let summary=overview.get("summary").unwrap_or(&Value::Null);
    tx.execute("INSERT INTO channels(channel_id,name,observed_at,source,completeness,payload_json)
        VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(channel_id) DO UPDATE SET
        name=excluded.name,observed_at=excluded.observed_at,source=excluded.source,
        completeness=excluded.completeness,payload_json=excluded.payload_json",
        params![channel,text(summary,"name"),stamp,source(summary,"youtube_data_api_v3"),
        completeness(summary),to_json(summary)?]).map_err(|e|e.to_string())?;
    // Replace only channel-owned materializations, atomically. The last good
    // generation remains committed if any SQL row or verification fails.
    for table in ["retention_points","subtitles","video_daily",
        "reach_daily","video_reach_daily","channel_daily","channel_events",
        "audience_demographics","traffic_sources","devices","videos"]{
        tx.execute(&format!("DELETE FROM {table} WHERE channel_id=?1"),params![channel])
            .map_err(|e|format!("SQLITE_CLEAR_{table}: {e}"))?;
    }
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
        tx.execute("INSERT INTO videos(channel_id,video_id,published_at,observed_at,source,completeness,payload_json)
          VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![channel,id,text(video,"publishedAt"),observed(video,&stamp),
                source(video,"youtube_data_api_v3"),completeness(video),to_json(&detail)?])
            .map_err(|e|format!("SQLITE_INSERT_VIDEO: {e}"))?;
        tx.execute("INSERT INTO metadata_history(channel_id,video_id,generation,observed_at,source,completeness,payload_json)
          VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![channel,id,generation,observed(video,&stamp),"youtube_data_api_v3",
                completeness(video),to_json(video)?]).map_err(|e|e.to_string())?;
        video_rows+=1;
        for row in optional_arr(&root.join("video-days").join(format!("{key}.json")))?{
            if text(&row,"videoId")!=Some(id){return Err("SQLITE_VIDEO_DAILY_IDENTITY_MISMATCH".into())}
            let d=date(&row)?;
            tx.execute("INSERT INTO video_daily(channel_id,video_id,date,views,watch_minutes,observed_at,source,completeness,payload_json)
              VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
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
    for row in daily{
        tx.execute("INSERT INTO channel_daily(channel_id,date,views,watch_minutes,observed_at,source,completeness,payload_json)
            VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![channel,date(row)?,row.get("views").and_then(Value::as_i64),
                row.get("watchMinutes").and_then(Value::as_f64),observed(row,&stamp),
                source(row,"youtube_analytics_api_v2"),completeness(row),to_json(row)?])
            .map_err(|e|format!("SQLITE_CHANNEL_DAILY_IMPORT: {e}"))?;
    }
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
        tx.execute("INSERT OR IGNORE INTO channel_events(channel_id,event_hash,event_type,observed_at,source,completeness,payload_json)
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
        let table=if text(row,"type").map(|x|x.to_ascii_lowercase().contains("device")).unwrap_or(false){
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
    // Compare actual SQL sample payload with original JSON, not only row counts.
    if let Some(first)=daily.first(){
        let stored:String=tx.query_row("SELECT payload_json FROM channel_daily WHERE channel_id=?1 AND date=?2",
            params![channel,date(first)?],|r|r.get(0)).map_err(|e|e.to_string())?;
        let actual:Value=serde_json::from_str(&stored).map_err(|e|e.to_string())?;
        if actual!=*first{return Err("SQLITE_MIGRATION_SAMPLE_MISMATCH".into())}
    }
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
        return Ok(MigrationResult{generation,skipped:true,channels:1,
            channel_days:n[0].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            video_days:n[1].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            videos:n[2].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            reach_rows:n[3].try_into().map_err(|_|"SQLITE_BAD_COUNT")?,
            events:n[4].try_into().map_err(|_|"SQLITE_BAD_COUNT")?});
    }
    // The source is immutable; copy the pointer to an additional recovery marker
    // before any SQLite mutation. Existing generations remain untouched.
    let backup=cache.join(format!("ui-current-pre-sqlite-{}.json",generation));
    if !backup.exists(){
        fs::copy(cache.join("ui-current.json"),&backup).map_err(|e|format!("SQLITE_POINTER_BACKUP: {e}"))?;
    }
    let tx=conn.transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e|format!("SQLITE_BEGIN: {e}"))?;
    let result=import_generation(&tx,channel_id,&generation,&root,&overview,
        &catalog,&daily,&reach,&digest)?;
    tx.commit().map_err(|e|format!("SQLITE_COMMIT: {e}"))?;
    // PASSIVE checkpoint never blocks active readers; backup JSON remains.
    let _=conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
    Ok(result)
}
/// Read only from a source-verified current generation. Never returns rows from
/// an older SQLite generation if the JSON pointer already moved forward.
pub(crate) fn read_channel_days(cache:&Path,channel_id:&str,start:Option<&str>,end:Option<&str>)
 ->Result<Option<Vec<Value>>,String>{
    let path=cache.join(DB_NAME);
    if !path.exists(){return Ok(None)}
    let (generation,_root,_overview,_ptr,_cat,_days,_reach,digest)=canonical_source(cache,channel_id)?;
    let conn=prepare_db(&path)?;
    let verified:Option<String>=conn.query_row(
        "SELECT source_digest FROM analytics_migrations WHERE channel_id=?1 AND generation=?2",
        params![channel_id,generation],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
    if verified.as_deref()!=Some(digest.as_str()){return Ok(None)}
    let mut stmt=conn.prepare(
        "SELECT payload_json FROM channel_daily WHERE channel_id=?1
         AND (?2 IS NULL OR date>=?2) AND (?3 IS NULL OR date<=?3) ORDER BY date")
        .map_err(|e|e.to_string())?;
    let result=stmt.query_map(params![channel_id,start,end],|r|r.get::<_,String>(0))
        .map_err(|e|e.to_string())?;
    let mut out=Vec::new();
    for row in result{
        let json=row.map_err(|e|e.to_string())?;
        out.push(serde_json::from_str(&json).map_err(|e|format!("SQLITE_READ_JSON: {e}"))?);
    }
    Ok(Some(out))
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
            serde_json::to_vec(&json!({"videoId":video_id,"points":[[0.0,0.8],[0.5,0.4]]})).unwrap()).unwrap();
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
    #[test]fn damaged_database_is_not_replaced_with_blank_file(){
        let (cache,id,_)=sample_cache();
        fs::write(cache.join(DB_NAME),b"definitely not SQLite").unwrap();
        let err=migrate_generation(&cache,&id).unwrap_err();
        assert!(err.contains("SQLITE_RECOVERY_REQUIRED"));
        assert_eq!(fs::read(cache.join(DB_NAME)).unwrap(),b"definitely not SQLite");
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
