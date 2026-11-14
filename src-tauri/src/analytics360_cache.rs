//! Read-only, per-channel Analytics 360 materialized view for macOS.
//! Large video/day data never enters the primary VYRON Zustand state.
//! Source of truth remains Google's official API; missing data stays missing.
use chrono::{Duration as Days, NaiveDate, Utc};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::{BTreeMap,HashMap},fs::{self,OpenOptions},io::Write,path::{Path,PathBuf},sync::{Arc,Mutex,OnceLock,Weak}};
use tauri::{AppHandle,Manager};
use uuid::Uuid;

fn valid_channel_id(id:&str)->bool{
    id.len()==24&&id.starts_with("UC")&&id.bytes().all(|x|x.is_ascii_alphanumeric()||x==b'_'||x==b'-')
}
fn valid_video_id(id:&str)->bool{
    id.len()==11&&id.bytes().all(|x|x.is_ascii_alphanumeric()||x==b'_'||x==b'-')
}
fn key(id:&str)->String{hex::encode(Sha256::digest(id.as_bytes()))[..24].to_string()}
fn read_json(path:&Path)->Result<Value,String>{
    let bytes=fs::read(path).map_err(|e|format!("ANALYTICS_CACHE_READ: {}: {e}",path.display()))?;
    serde_json::from_slice(&bytes).map_err(|e|format!("ANALYTICS_CACHE_PARSE: {e}"))
}
fn atomic_json(path:&Path,value:&Value)->Result<(),String>{
    let bytes=serde_json::to_vec(value).map_err(|e|e.to_string())?;
    let tmp=path.with_extension(format!("write-{}.tmp",Uuid::new_v4()));
    let result=(||->Result<(),String>{
        let mut f=OpenOptions::new().write(true).create_new(true).open(&tmp).map_err(|e|e.to_string())?;
        #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;fs::set_permissions(&tmp,fs::Permissions::from_mode(0o600)).map_err(|e|e.to_string())?;}
        f.write_all(&bytes).map_err(|e|e.to_string())?;
        f.sync_all().map_err(|e|e.to_string())?;
        fs::rename(&tmp,path).map_err(|e|e.to_string())?;
        Ok(())
    })();
    if result.is_err(){let _=fs::remove_file(tmp);}
    result
}
/// Immutable generation files can share disk blocks on the same volume.
/// A hard link is used only if serialized JSON bytes are identical; fallback
/// remains atomic. Nothing ever writes through an existing hard-linked inode.
fn write_or_reuse(previous:Option<&Path>,target:&Path,value:&Value)->Result<bool,String>{
    let fresh=serde_json::to_vec(value).map_err(|e|e.to_string())?;
    if let Some(old)=previous{
        if fs::read(old).ok().as_deref()==Some(fresh.as_slice()){
            if fs::hard_link(old,target).is_ok(){return Ok(true)}
        }
    }
    atomic_json(target,value)?;
    Ok(false)
}
fn duration_seconds(value:&str)->Option<u64>{
    if !value.starts_with("PT"){return None}
    let mut digits=String::new();let mut total=0u64;
    for c in value[2..].chars(){
        if c.is_ascii_digit(){digits.push(c);continue}
        let n=digits.parse::<u64>().ok()?;digits.clear();
        total=total.checked_add(match c{'H'=>n*3600,'M'=>n*60,'S'=>n,_=>return None})?;
    }
    if !digits.is_empty(){return None}Some(total)
}
fn public_video_record(v:&Value)->Value{
    let id=v.get("id").and_then(Value::as_str).unwrap_or("");
    let duration=v.pointer("/contentDetails/duration").and_then(Value::as_str).unwrap_or("");
    let length=duration_seconds(duration);
    let live=v.get("liveStreamingDetails").is_some()||v.pointer("/snippet/liveBroadcastContent")
        .and_then(Value::as_str).map(|x|x=="live"||x=="upcoming").unwrap_or(false);
    // YouTube Data API does not provide definitive Shorts identity. Do not
    // misclassify a short, landscape video by duration alone.
    let video_type=if live{"live"}else if length.map(|s|s>180).unwrap_or(false){"video"}else{"unknown"};
    let thumb=["maxres","standard","high","medium","default"].iter()
        .find_map(|res|v.pointer(&format!("/snippet/thumbnails/{res}/url")).and_then(Value::as_str))
        .unwrap_or("");
    json!({"videoId":id,"channelId":v.pointer("/snippet/channelId"),"title":v.pointer("/snippet/title"),
        "thumbnail":thumb,"publishedAt":v.pointer("/snippet/publishedAt"),
        "durationIso":duration,"durationSeconds":length,"contentType":video_type,
        "contentTypeEvidence":if video_type=="unknown"{"not_provided_by_api"}else{"api_metadata"},
        "privacyStatus":v.pointer("/status/privacyStatus"),"viewsPublic":v.pointer("/statistics/viewCount"),
        "likesPublic":v.pointer("/statistics/likeCount"),"commentsPublic":v.pointer("/statistics/commentCount")})
}
fn previous_generation_root(cache:&Path,channel_id:&str)->Option<PathBuf>{
    let pointer=read_json(&cache.join("ui-current.json")).ok()?;
    if pointer.get("channelId").and_then(Value::as_str)!=Some(channel_id){return None}
    let generation=pointer.get("generation").and_then(Value::as_str)?;
    if Uuid::parse_str(generation).is_err(){return None}
    let root=cache.join("ui-generations").join(generation);
    let overview=read_json(&root.join("overview.json")).ok()?;
    (overview.get("channelId").and_then(Value::as_str)==Some(channel_id)).then_some(root)
}
/// Preserve previously reported non-null metrics when a later partial API
/// response omits fields. Explicit numerical zero is a legitimate new value.
/// A carried-forward field retains previous provenance in a dedicated marker.
fn merge_daily_observation(prior:&Value,latest:&Value)->Value{
    let mut merged=latest.clone();
    let Some(old)=prior.as_object()else{return merged};
    let Some(new)=merged.as_object_mut()else{return merged};
    let mut carried=Vec::<String>::new();
    for (k,v) in old {
        if k=="date"||k=="fetchedAt"||k=="source"||k=="_vyronCarriedForwardFields"{
            continue
        }
        if !v.is_null()&&new.get(k).map(|x|x.is_null()).unwrap_or(true){
            new.insert(k.clone(),v.clone());
            carried.push(k.clone());
        }
    }
    if !carried.is_empty(){
        if let Some(prior_stamp)=prior.get("fetchedAt").and_then(Value::as_str){
            new.insert("_vyronPriorFetchedAt".into(),json!(prior_stamp));
        }
        new.insert("_vyronCarriedForwardFields".into(),json!(carried));
    }
    merged
}
/// Merge only rows with valid dates; a partial API response never replaces
/// previously confirmed values with null/missing fields. New explicit zero
/// supersedes earlier values without ambiguity.
fn merge_by_date(previous:&[Value],latest:&[Value])->(Vec<Value>,usize){
    let mut rows=BTreeMap::<String,Value>::new();
    let mut prior_dates=std::collections::HashSet::new();
    let mut latest_dates=std::collections::HashSet::new();
    for row in previous{
        if let Some(day)=row.get("date").and_then(Value::as_str){
            if NaiveDate::parse_from_str(day,"%Y-%m-%d").is_ok(){
                prior_dates.insert(day.to_owned());
                rows.insert(day.to_owned(),row.clone());
            }
        }
    }
    for row in latest{
        if let Some(day)=row.get("date").and_then(Value::as_str){
            if NaiveDate::parse_from_str(day,"%Y-%m-%d").is_ok(){
                latest_dates.insert(day.to_owned());
                let value=rows.get(day).map(|old|merge_daily_observation(old,row))
                    .unwrap_or_else(||row.clone());
                rows.insert(day.to_owned(),value);
            }
        }
    }
    let retained=prior_dates.difference(&latest_dates).count();
    (rows.into_values().collect(),retained)
}
fn merge_reach_by_video_date(prior:&[Value],latest:&[Value])->(Vec<Value>,usize){
    let mut rows=BTreeMap::<(String,String),Value>::new();
    let mut prior_keys=std::collections::HashSet::new();
    let mut new_keys=std::collections::HashSet::new();
    let key_of=|v:&Value|->Option<(String,String)>{
        let date=v.get("date").and_then(Value::as_str)?;
        let video=v.get("videoId").and_then(Value::as_str)?;
        if NaiveDate::parse_from_str(date,"%Y-%m-%d").is_err()||!valid_video_id(video){return None}
        Some((date.into(),video.into()))
    };
    // A newer complete Reporting file for a date replaces the entire older
    // day, not merely the matching video IDs. Otherwise videos removed from
    // the new daily report would remain and inflate reach totals.
    let mut latest_date_stamp=HashMap::<String,String>::new();
    for row in latest{
        let Some((date,_))=key_of(row)else{continue};
        let stamp=row.get("reportCreateTime").and_then(Value::as_str).unwrap_or("");
        if !stamp.is_empty(){
            latest_date_stamp.entry(date).and_modify(|old|{
                if stamp>old.as_str(){*old=stamp.to_string();}
            }).or_insert_with(||stamp.to_string());
        }
    }
    for row in prior{
        if let Some(k)=key_of(row){
            let prior_stamp=row.get("reportCreateTime").and_then(Value::as_str).unwrap_or("");
            if !prior_stamp.is_empty()&&latest_date_stamp.get(&k.0)
                .map(|new_stamp|new_stamp.as_str()>prior_stamp).unwrap_or(false){
                // Old raw downloaded report stays on disk for provenance.
                continue
            }
            prior_keys.insert(k.clone());
            rows.insert(k,row.clone());
        }
    }
    for row in latest{
        if let Some(k)=key_of(row){
            new_keys.insert(k.clone());
            rows.insert(k,row.clone());
        }
    }
    let kept=prior_keys.difference(&new_keys).count();
    (rows.into_values().collect(),kept)
}
fn reach_aggregate(rows:&[Value],start:Option<NaiveDate>,end:Option<NaiveDate>,video_id:Option<&str>)->Vec<Value>{
    let mut by_date=BTreeMap::<String,(u64,f64)>::new();
    for row in rows{
        let Some(day)=row.get("date").and_then(Value::as_str)else{continue};
        let Some(date)=NaiveDate::parse_from_str(day,"%Y-%m-%d").ok()else{continue};
        if start.map(|x|date<x).unwrap_or(false)||end.map(|x|date>x).unwrap_or(false){continue}
        if video_id.map(|id|row.get("videoId").and_then(Value::as_str)!=Some(id)).unwrap_or(false){continue}
        let Some(impressions)=row.get("impressions").and_then(Value::as_u64)else{continue};
        let Some(ctr_raw)=row.get("ctrRaw").and_then(Value::as_f64).filter(|v|v.is_finite())else{continue};
        let point=by_date.entry(day.to_string()).or_insert((0,0.0));
        point.0=point.0.saturating_add(impressions);
        point.1+=impressions as f64*ctr_raw;
    }
    by_date.into_iter().map(|(day,(imps,numerator))|json!({
        "date":day,"observedImpressions":imps,
        "weightedCtrRaw":if imps==0{None}else{Some(numerator/imps as f64)},
        "ctrScale":"UNVERIFIED",
        "coverage":"OBSERVED_REPORT_ROWS_ONLY",
        "source":"youtube_reporting_api_channel_reach_basic_a1",
    })).collect()
}
fn merge_events(previous:&[Value],latest:&[Value])->Vec<Value>{
    let mut result=Vec::with_capacity(previous.len()+latest.len());
    let mut seen=std::collections::HashSet::<String>::new();
    for event in previous.iter().chain(latest){
        // Serialized full JSON key prevents accidentally treating title changes at
        // different times as the same event, without double-counting uploadHistory.
        if let Ok(k)=serde_json::to_string(event){
            if seen.insert(k){result.push(event.clone());}
        }
    }
    result
}
fn event_rows(root:Option<&Path>)->Vec<Value>{
    root.and_then(|p|read_json(&p.join("overview.json")).ok())
        .and_then(|v|v.get("events").and_then(Value::as_array).cloned()).unwrap_or_default()
}
fn prior_value(root:Option<&Path>,folder:&str,file:&str,required:bool)->Result<Option<Value>,String>{
    let Some(root)=root else{return Ok(None)};
    let path=root.join(folder).join(file);
    let exists=path.try_exists().map_err(|_|"ANALYTICS_HISTORY_READ_FAILED".to_string())?;
    if !exists{
        return if required{Err("ANALYTICS_HISTORY_REQUIRED_FILE_MISSING".into())}else{Ok(None)}
    }
    let value=read_json(&path).map_err(|_|"ANALYTICS_HISTORY_INVALID_JSON".to_string())?;
    Ok(Some(value))
}
fn prior_rows(root:Option<&Path>,folder:&str,file:&str,required:bool)->Result<Vec<Value>,String>{
    match prior_value(root,folder,file,required)?{
        Some(value)=>value.as_array().cloned().ok_or_else(||"ANALYTICS_HISTORY_EXPECTED_ARRAY".into()),
        None=>Ok(Vec::new()),
    }
}
fn prior_object(root:Option<&Path>,folder:&str,file:&str,required:bool)->Result<Option<Value>,String>{
    let value=prior_value(root,folder,file,required)?;
    if value.as_ref().map(|v|!v.is_object()).unwrap_or(false){
        return Err("ANALYTICS_HISTORY_EXPECTED_OBJECT".into())
    }
    Ok(value)
}

fn prune_generations(cache:&Path,current:&str,channel_id:&str,minimum_age:std::time::Duration)->Result<usize,String>{
    let parent=cache.join("ui-generations");
    if !parent.is_dir(){return Ok(0)}
    let mut known=Vec::<(PathBuf,std::time::SystemTime)>::new();
    for entry in fs::read_dir(&parent).map_err(|e|e.to_string())?{
        let entry=entry.map_err(|e|e.to_string())?;
        if !entry.file_type().map_err(|e|e.to_string())?.is_dir(){continue}
        let name=entry.file_name().to_string_lossy().to_string();
        if !safe_generation(&name){continue}
        let dir=entry.path();
        let overview=match read_json(&dir.join("overview.json")){Ok(v)=>v,Err(_)=>continue};
        if overview.get("channelId").and_then(Value::as_str)!=Some(channel_id){continue}
        let modified=entry.metadata().and_then(|v|v.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        known.push((dir,modified));
    }
    // Always keep at least the current + two complete prior generations,
    // so a concurrent reader or an interrupted recovery can finish safely.
    known.sort_by(|a,b|b.1.cmp(&a.1));
    let now=std::time::SystemTime::now();
    let mut removed=0usize;
    for (i,(dir,modified)) in known.iter().enumerate(){
        if dir.file_name().and_then(|x|x.to_str())==Some(current)||i<3{continue}
        if now.duration_since(*modified).unwrap_or_default()<minimum_age{continue}
        fs::remove_dir_all(dir).map_err(|e|format!("ANALYTICS_OLD_GENERATION_CLEANUP: {e}"))?;
        removed+=1;
    }
    Ok(removed)
}
/// Serialize writers for the same local analytics cache to prevent two
/// concurrent syncs from racing across the JSON-pointer/SQLite-commit boundary.
/// Independent channels retain concurrency. Weak entries prevent unbounded
/// retention of test caches and removed channels.
static ANALYTICS_WRITER_LOCKS:OnceLock<Mutex<HashMap<PathBuf,Weak<Mutex<()>>>>>=OnceLock::new();
fn analytics_writer_lock(cache:&Path)->Arc<Mutex<()>>{
    let map=ANALYTICS_WRITER_LOCKS.get_or_init(||Mutex::new(HashMap::new()));
    let mut registry=map.lock().unwrap_or_else(|e|e.into_inner());
    registry.retain(|_,weak|weak.strong_count()>0);
    if let Some(lock)=registry.get(cache).and_then(Weak::upgrade){return lock}
    let lock=Arc::new(Mutex::new(()));
    registry.insert(cache.to_path_buf(),Arc::downgrade(&lock));
    lock
}
/// Persists a complete immutable generation, then publishes ONE atomic pointer.
/// An interrupted save leaves the previously published view intact.
pub(crate) fn persist(
    cache:&Path, summary:&Value,coverage:&Value,channel_daily:&[Value],videos:&[Value],
    video_daily:&[Value],traffic:&[Value],breakdowns:&[Value],
    retention:&[Value],events:&[Value],_findings:&[Value],
)->Result<(),String>{
    let cid=summary.get("channelId").and_then(Value::as_str).unwrap_or("");
    if !valid_channel_id(cid){return Err("ANALYTICS_CACHE_INVALID_CHANNEL_ID".into())}
    let writer_lock=analytics_writer_lock(cache);
    let _writer_guard=writer_lock.lock().unwrap_or_else(|e|e.into_inner());
    let previous_root=previous_generation_root(cache,cid);
    // A corrupted generation pointer must never turn a partial sync into a fresh
    // history and silently abandon years of confirmed observations.
    if cache.join("ui-current.json").exists() && previous_root.is_none(){
        return Err("ANALYTICS_CACHE_RECOVERY_REQUIRED: previous published generation is invalid; original cache preserved".into())
    }
    let generation=Uuid::new_v4().to_string();
    let root=cache.join("ui-generations").join(&generation);
    for folder in ["video-details","video-days","retention"]{
        fs::create_dir_all(root.join(folder)).map_err(|e|format!("ANALYTICS_MKDIR: {e}"))?;
    }
    let mut days_by_video=HashMap::<String,Vec<Value>>::new();
    for day in video_daily{
        if let Some(id)=day.get("videoId").and_then(Value::as_str).filter(|id|valid_video_id(id)){
            days_by_video.entry(id.to_string()).or_default().push(day.clone());
        }
    }
    let mut retention_by_video=HashMap::<String,Value>::new();
    for row in retention{
        if let Some(id)=row.get("videoId").and_then(Value::as_str).filter(|id|valid_video_id(id)){
            retention_by_video.insert(id.to_string(),row.clone());
        }
    }
    let mut reused_files=0usize;
    let mut preserved_video_days=0usize;
    let mut merged_recent_video_days=Vec::<Value>::new();
    let recent_cutoff=Utc::now().date_naive()-Days::days(62);
    let reach=crate::analytics_reach::read_reach(cache,coverage,cid);
    let previous_reach=prior_rows(previous_root.as_deref(),"","reach-daily.json",false)?;
    let (merged_reach,preserved_reach_rows)=merge_reach_by_video_date(&previous_reach,&reach.rows);
    let mut preserved_retention_curves=0usize;
    let mut catalog=Vec::with_capacity(videos.len());
    let mut known=std::collections::HashSet::new();
    for video in videos{
        let id=video.get("id").and_then(Value::as_str).unwrap_or("");
        if !valid_video_id(id)||!known.insert(id.to_string()){continue}
        let hashed=key(id);
        let mut current_record=public_video_record(video);
        current_record["inventoryObservedNow"]=json!(true);
        current_record["lastObservedAt"]=json!(Utc::now().to_rfc3339());
        catalog.push(current_record);
        let previous_detail=previous_root.as_ref().map(|p|p.join("video-details").join(format!("{hashed}.json")));
        if write_or_reuse(previous_detail.as_deref(),&root.join("video-details").join(format!("{hashed}.json")),video)?{reused_files+=1}
        let file=format!("{hashed}.json");
        let previous_days=prior_rows(previous_root.as_deref(),"video-days",&file,false)?;
        let current_days=days_by_video.remove(id).unwrap_or_default();
        let (merged_days,retained)=merge_by_date(&previous_days,&current_days);
        preserved_video_days+=retained;
        merged_recent_video_days.extend(merged_days.iter().filter(|row|{
            row.get("date").and_then(Value::as_str)
                .and_then(|date|NaiveDate::parse_from_str(date,"%Y-%m-%d").ok())
                .map(|date|date>=recent_cutoff).unwrap_or(false)
        }).cloned());
        if !merged_days.is_empty(){
            let source=previous_root.as_ref().map(|p|p.join("video-days").join(&file));
            if write_or_reuse(source.as_deref(),&root.join("video-days").join(&file),&json!(merged_days))?{reused_files+=1}
        }
        if let Some(curve)=retention_by_video.remove(id){
            let source=previous_root.as_ref().map(|p|p.join("retention").join(&file));
            if write_or_reuse(source.as_deref(),&root.join("retention").join(&file),&curve)?{reused_files+=1}
        }else if let Some(previous)=prior_object(previous_root.as_deref(),"retention",&file,false)?{
            let source=previous_root.as_ref().map(|p|p.join("retention").join(&file));
            if write_or_reuse(source.as_deref(),&root.join("retention").join(&file),&previous)?{reused_files+=1}
            preserved_retention_curves+=1;
        }
    }
    // A video missing from a later authoritative inventory is not proof that
    // it was deleted. Preserve its last known metadata and historical metrics.
    let previous_catalog=prior_rows(previous_root.as_deref(),"","video-catalog.json",true)?;
    let mut historical_only_videos=0usize;
    for old in previous_catalog{
        let id=old.get("videoId").and_then(Value::as_str).filter(|id|valid_video_id(id))
            .ok_or("ANALYTICS_HISTORY_INVALID_VIDEO_ID")?;
        if !known.insert(id.to_string()){continue}
        let file=format!("{}.json",key(id));
        let detail=prior_object(previous_root.as_deref(),"video-details",&file,true)?
            .ok_or("ANALYTICS_HISTORY_REQUIRED_FILE_MISSING")?;
        let mut record=old.clone();
        record["inventoryObservedNow"]=json!(false);
        record["inventoryCaveat"]=json!("Not observed in latest inventory; may be deleted, private, hidden or temporarily unavailable. No deletion inferred.");
        catalog.push(record);
        let source=previous_root.as_ref().map(|p|p.join("video-details").join(&file));
        if write_or_reuse(source.as_deref(),&root.join("video-details").join(&file),&detail)?{reused_files+=1}
        let rows=prior_rows(previous_root.as_deref(),"video-days",&file,false)?;
        if !rows.is_empty(){
                merged_recent_video_days.extend(rows.iter().filter(|row|{
                    row.get("date").and_then(Value::as_str)
                        .and_then(|date|NaiveDate::parse_from_str(date,"%Y-%m-%d").ok())
                        .map(|date|date>=recent_cutoff).unwrap_or(false)
                }).cloned());
                preserved_video_days+=rows.len();
            let source=previous_root.as_ref().map(|p|p.join("video-days").join(&file));
            if write_or_reuse(source.as_deref(),&root.join("video-days").join(&file),&json!(rows))?{reused_files+=1}
        }
        if let Some(previous)=prior_object(previous_root.as_deref(),"retention",&file,false)?{
            let source=previous_root.as_ref().map(|p|p.join("retention").join(&file));
            if write_or_reuse(source.as_deref(),&root.join("retention").join(&file),&previous)?{reused_files+=1}
            preserved_retention_curves+=1;
        }
        historical_only_videos+=1;
    }
    catalog.sort_by(|a,b|b["publishedAt"].as_str().cmp(&a["publishedAt"].as_str()));
    let mut publications=HashMap::<String,u64>::new();
    for v in &catalog {
        if let Some(day)=v.get("publishedAt").and_then(Value::as_str).and_then(|s|s.get(..10)){
            *publications.entry(day.to_string()).or_insert(0)+=1;
        }
    }
    let old_channel_days=prior_rows(previous_root.as_deref(),"","channel-daily.json",true)?;
    let (merged_channel_days,preserved_channel_days)=merge_by_date(&old_channel_days,channel_daily);
    let historic_events=event_rows(previous_root.as_deref());
    let all_events=merge_events(&historic_events,events);
    let mut merged_findings=crate::analytics_ai_export::change_findings(cid,&merged_channel_days);
    for event in &mut merged_findings{
        event["videoContributions"]=json!(crate::analytics_ai_export::contributions_for_window(
            event,&merged_recent_video_days));
    }
    let mut effective_coverage=coverage.clone();
    effective_coverage["reachIngestion"]=reach.coverage;
    effective_coverage["cacheHistoryMerge"]=json!({
        "source":"local_previously_confirmed_api_rows",
        "retainedPriorChannelDays":preserved_channel_days,
        "retainedPriorVideoDays":preserved_video_days,
        "historicalOnlyVideosRetained":historical_only_videos,
        "retainedPriorReachRows":preserved_reach_rows,
        "retainedPriorRetentionCurves":preserved_retention_curves,
        "unchangedSnapshotFilesHardLinked":reused_files,
        "mergedEventCount":all_events.len(),
        "derivedGrowthEventsFromMergedHistory":merged_findings.len(),
        "policy":"New observations supersede prior observations on matching dates, but missing/null metrics are carried forward with _vyronCarriedForwardFields and _vyronPriorFetchedAt; explicit zero is never treated as missing."
    });
    let index=json!({"schemaVersion":1,"channelId":cid,"generation":generation,
        "updatedAt":Utc::now().to_rfc3339(),"summary":summary,"coverage":effective_coverage,
        "traffic":traffic,"audienceBreakdowns":breakdowns,"events":all_events,
        "growthAndDecline":merged_findings,"publicationsByDay":publications,"videosTotal":catalog.len()});
    let fleet_snapshot=json!({
        "schemaVersion":1,"channelId":cid,"updatedAt":index.get("updatedAt"),
        "summary":{"channelId":cid,"name":summary.get("name"),
            "subscribers":summary.get("subscribers"),
            "analyticsAuthorized":summary.get("analyticsAuthorized"),
            "fetchedAt":summary.get("fetchedAt")},
        "growth7":merged_findings.iter().find(|v|v.get("windowDays").and_then(Value::as_i64)==Some(7)),
        "growth28":merged_findings.iter().find(|v|v.get("windowDays").and_then(Value::as_i64)==Some(28)),
        "videosTotal":catalog.len()
    });
    atomic_json(&root.join("fleet-summary.json"),&fleet_snapshot)?;
    atomic_json(&root.join("overview.json"),&index)?;
    atomic_json(&root.join("channel-daily.json"),&json!(merged_channel_days))?;
    atomic_json(&root.join("video-catalog.json"),&json!(catalog))?;
    atomic_json(&root.join("reach-daily.json"),&json!(merged_reach))?;
    let pointer=json!({"schemaVersion":1,"generation":generation,
       "channelId":cid,"updatedAt":Utc::now().to_rfc3339()});
    atomic_json(&cache.join("ui-current.json"),&pointer)?;
    // SQLite is additive, and the verified immutable JSON generation remains
    // a recoverable backup. Never prune JSON generations during migration.
    // Database corruption is surfaced; it is NEVER replaced with an empty DB.
    #[cfg(target_os="macos")]
    crate::analytics_sqlite::migrate_generation(cache,cid)
        .map_err(|e|format!("SQLITE_MIGRATION_FAILED_JSON_INTACT: {e}"))?;
    Ok(())
}
fn period_dates(period:&str,from:Option<&str>,to:Option<&str>)->Result<(Option<NaiveDate>,Option<NaiveDate>),String>{
    let end=Utc::now().date_naive()-Days::days(2);
    match period{
        "7"=>Ok((Some(end-Days::days(6)),Some(end))),
        "28"=>Ok((Some(end-Days::days(27)),Some(end))),
        "90"=>Ok((Some(end-Days::days(89)),Some(end))),
        "365"=>Ok((Some(end-Days::days(364)),Some(end))),
        "all"=>Ok((None,None)),
        "custom"=>{
            let start=from.and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok()).ok_or("Неверная начальная дата")?;
            let stop=to.and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok()).ok_or("Неверная конечная дата")?;
            if start>stop||stop>Utc::now().date_naive(){return Err("Недопустимый диапазон".into())}
            Ok((Some(start),Some(stop)))
        },
        _=>Err("Недопустимый период аналитики".into())
    }
}
fn filter_days(rows:&[Value],start:Option<NaiveDate>,end:Option<NaiveDate>)->Vec<Value>{
    rows.iter().filter(|row|{
        let date=row.get("date").and_then(Value::as_str).and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok());
        date.map(|d|start.map(|x|d>=x).unwrap_or(true)&&end.map(|x|d<=x).unwrap_or(true)).unwrap_or(false)
    }).cloned().collect()
}
fn safe_generation(value:&str)->bool{
    Uuid::parse_str(value).is_ok()
}
fn load_from_disk(cache:&Path,channel_id:&str,page:u32,per_page:u32,period:&str,from:Option<&str>,to:Option<&str>,video_id:Option<&str>,content_type:Option<&str>,sort:Option<&str>)->Result<Value,String>{
    if !valid_channel_id(channel_id){return Err("ANALYTICS_INVALID_REQUEST_CHANNEL".into())}
    let pointer_path=cache.join("ui-current.json");
    if !pointer_path.exists(){return Ok(json!({"status":"NOT_YET_COLLECTED","message":"Сначала синхронизируйте историю этого канала"}))}
    let pointer=read_json(&pointer_path)?;
    // The caller's selected account is the authority, not a copied/corrupt
    // cache pointer. Check before either the SQLite or JSON read path.
    if pointer.get("channelId").and_then(Value::as_str)!=Some(channel_id){
        return Err("ANALYTICS_POINTER_CHANNEL_MISMATCH".into())
    }
    #[cfg(target_os="macos")]
    {
        let cid=pointer.get("channelId").and_then(Value::as_str)
            .ok_or("ANALYTICS_POINTER_CHANNEL_ID_MISSING")?;
        let (start,end)=period_dates(period,from,to)?;
        let start_text=start.map(|d|d.format("%Y-%m-%d").to_string());
        let end_text=end.map(|d|d.format("%Y-%m-%d").to_string());
        if let Some(snapshot)=crate::analytics_sqlite::read_ui_snapshot(cache,cid,page,per_page,period,
            start_text.as_deref(),end_text.as_deref(),video_id,content_type,sort)?{
            return Ok(snapshot)
        }
    }
    let gen=pointer.get("generation").and_then(Value::as_str).unwrap_or("");
    if !safe_generation(gen){return Err("ANALYTICS_CACHE_INVALID_GENERATION".into())}
    let root=cache.join("ui-generations").join(gen);
    let overview=read_json(&root.join("overview.json"))?;
    if overview.get("channelId").and_then(Value::as_str)!=Some(channel_id)
        || overview.get("generation").and_then(Value::as_str)!=Some(gen){
        return Err("ANALYTICS_OVERVIEW_IDENTITY_MISMATCH".into())
    }
    let catalog=read_json(&root.join("video-catalog.json"))?;
    let all=catalog.as_array().ok_or("ANALYTICS_CATALOG_INVALID")?;
    let (start,end)=period_dates(period,from,to)?;
    let json_days=||read_json(&root.join("channel-daily.json"))?
        .as_array().cloned().ok_or_else(||"ANALYTICS_DAILY_INVALID".to_string());
    #[cfg(target_os="macos")]
    let current=match crate::analytics_sqlite::read_channel_days(cache,
        overview.get("channelId").and_then(Value::as_str).unwrap_or(""),
        start.map(|d|d.format("%Y-%m-%d").to_string()).as_deref(),
        end.map(|d|d.format("%Y-%m-%d").to_string()).as_deref())?{
        Some(rows)=>rows,
        None=>filter_days(&json_days()?,start,end),
    };
    #[cfg(not(target_os="macos"))]
    let current=filter_days(&json_days()?,start,end);
    #[cfg(target_os="macos")]
    let sql_reach_channel=crate::analytics_sqlite::read_reach_aggregate(cache,
        overview.get("channelId").and_then(Value::as_str).unwrap_or(""),None,
        start.map(|d|d.format("%Y-%m-%d").to_string()).as_deref(),
        end.map(|d|d.format("%Y-%m-%d").to_string()).as_deref())?;
    #[cfg(target_os="macos")]
    let sql_reach_video=match video_id{
        Some(id)=>crate::analytics_sqlite::read_reach_aggregate(cache,
            overview.get("channelId").and_then(Value::as_str).unwrap_or(""),Some(id),
            start.map(|d|d.format("%Y-%m-%d").to_string()).as_deref(),
            end.map(|d|d.format("%Y-%m-%d").to_string()).as_deref())?,
        None=>Some(Vec::new()),
    };
    #[cfg(target_os="macos")]
    let use_sql_reach=sql_reach_channel.is_some()&&sql_reach_video.is_some();
    #[cfg(not(target_os="macos"))]
    let use_sql_reach=false;
    let (channel_reach,selected_reach)=if use_sql_reach{
        #[cfg(target_os="macos")]
        { (sql_reach_channel.unwrap_or_default(),sql_reach_video.unwrap_or_default()) }
        #[cfg(not(target_os="macos"))]
        { unreachable!() }
    }else{
        let reach=read_json(&root.join("reach-daily.json")).ok()
            .and_then(|v|v.as_array().cloned()).unwrap_or_default();
        (reach_aggregate(&reach,start,end,None),
         video_id.map(|id|reach_aggregate(&reach,start,end,Some(id))).unwrap_or_default())
    };
    let mut visible=all.iter().filter(|v|content_type.filter(|s|*s!="all").map(|wanted|
         v.get("contentType").and_then(Value::as_str)==Some(wanted)).unwrap_or(true)).collect::<Vec<_>>();
    if sort==Some("views"){
        visible.sort_by(|a,b|{
            let count=|v:&&Value|v.get("viewsPublic").and_then(|x|x.as_u64()
                .or_else(||x.as_str().and_then(|s|s.parse::<u64>().ok()))).unwrap_or(0);
            count(b).cmp(&count(a))
        });
    }
    let per_page=per_page.clamp(1,100) as usize;
    let filtered_total=visible.len();
    let offset=(page as usize).saturating_mul(per_page).min(filtered_total);
    let video_rows=visible.into_iter().skip(offset).take(per_page).cloned().collect::<Vec<_>>();
    let mut detail=Value::Null;let mut video_days=Vec::<Value>::new();let mut retention=Value::Null;
    let mut selected_video=Value::Null;
    if let Some(id)=video_id{
        if !valid_video_id(id){return Err("Некорректный Video ID".into())}
        selected_video=all.iter().find(|v|v.get("videoId").and_then(Value::as_str)==Some(id))
            .cloned().ok_or("Видео отсутствует в этом канале")?;
        let filename=format!("{}.json",key(id));
        detail=read_json(&root.join("video-details").join(&filename))?;
        #[cfg(target_os="macos")]
        {
            if let Some(rows)=crate::analytics_sqlite::read_video_days(cache,
                overview.get("channelId").and_then(Value::as_str).unwrap_or(""),id,
                start.map(|d|d.format("%Y-%m-%d").to_string()).as_deref(),
                end.map(|d|d.format("%Y-%m-%d").to_string()).as_deref())?{
                video_days=rows;
            }else if let Ok(value)=read_json(&root.join("video-days").join(&filename)){
                if let Some(rows)=value.as_array(){video_days=filter_days(rows,start,end)}
            }
        }
        #[cfg(not(target_os="macos"))]
        if let Ok(value)=read_json(&root.join("video-days").join(&filename)){
            if let Some(rows)=value.as_array(){video_days=filter_days(rows,start,end)}
        }
        if let Ok(value)=read_json(&root.join("retention").join(filename)){retention=value;}
    }
    Ok(json!({"status":"AVAILABLE","schemaVersion":1,"generation":gen,"updatedAt":pointer.get("updatedAt"),
        "overview":overview,"channelDaily":current,"channelReachDaily":channel_reach,"videoReachDaily":selected_reach,"videos":video_rows,"videoCount":all.len(),
        "page":page,"pageSize":per_page,"filteredVideoCount":filtered_total,"selectedVideo":selected_video,"videoDetail":detail,"videoDaily":video_days,"retention":retention,
        "period":period,"periodFrom":start.map(|d|d.format("%Y-%m-%d").to_string()),
        "periodTo":end.map(|d|d.format("%Y-%m-%d").to_string())}))
}
/// Read the most recently atomically published generation for a channel.
/// Used by AI ZIP so a partial second sync cannot silently truncate the archive.
fn materialized_rows(cache:&Path,channel_id:&str,relative:&Path)->Result<Vec<Value>,String>{
    if !valid_channel_id(channel_id){return Err("ANALYTICS_CACHE_INVALID_CHANNEL_ID".into())}
    let root=previous_generation_root(cache,channel_id).ok_or("ANALYTICS_MATERIALIZED_VIEW_MISSING")?;
    let target=root.join(relative);
    if !target.exists(){return Ok(Vec::new())}
    read_json(&target)?.as_array().cloned().ok_or("ANALYTICS_MATERIALIZED_ROWS_INVALID".into())
}
pub(crate) fn materialized_overview(cache:&Path,channel_id:&str)->Result<Value,String>{
    let root=previous_generation_root(cache,channel_id).ok_or("ANALYTICS_MATERIALIZED_VIEW_MISSING")?;
    let overview=read_json(&root.join("overview.json"))?;
    if overview.get("channelId").and_then(Value::as_str)!=Some(channel_id){
        return Err("ANALYTICS_CHANNEL_MISMATCH".into())
    }
    Ok(overview)
}
pub(crate) fn materialized_channel_daily(cache:&Path,channel_id:&str)->Result<Vec<Value>,String>{
    #[cfg(target_os="macos")]
    if let Some(rows)=crate::analytics_sqlite::read_channel_days(cache,channel_id,None,None)?{
        return Ok(rows);
    }
    materialized_rows(cache,channel_id,Path::new("channel-daily.json"))
}
pub(crate) fn materialized_video_daily(cache:&Path,channel_id:&str,video_id:&str)->Result<Vec<Value>,String>{
    if !valid_video_id(video_id){return Err("ANALYTICS_INVALID_VIDEO_ID".into())}
    #[cfg(target_os="macos")]
    if let Some(rows)=crate::analytics_sqlite::read_video_days(cache,channel_id,video_id,None,None)?{
        return Ok(rows);
    }
    materialized_rows(cache,channel_id,&Path::new("video-days").join(format!("{}.json",key(video_id))))
}
pub(crate) fn materialized_video_records(cache:&Path,channel_id:&str)->Result<Vec<Value>,String>{
    let catalog=materialized_rows(cache,channel_id,Path::new("video-catalog.json"))?;
    let root=previous_generation_root(cache,channel_id).ok_or("ANALYTICS_MATERIALIZED_VIEW_MISSING")?;
    let mut out=Vec::with_capacity(catalog.len());
    for item in catalog{
        let Some(id)=item.get("videoId").and_then(Value::as_str).filter(|id|valid_video_id(id))else{continue};
        let file=root.join("video-details").join(format!("{}.json",key(id)));
        let mut record=read_json(&file)?;
        record["_vyronHistoricalRecord"]=json!({
            "inventoryObservedNow":item.get("inventoryObservedNow"),
            "lastObservedAt":item.get("lastObservedAt"),
            "inventoryCaveat":item.get("inventoryCaveat"),
            "source":"local_last_confirmed_youtube_data_api_snapshot"
        });
        out.push(record);
    }
    Ok(out)
}
/// AI ZIP must reflect the last atomically published MERGED retention data,
/// not only the curves returned by the most recent partial API request.
/// JSON generations are immutable; preserve the original curve object and
/// provenance rather than reconstructing it from sampled SQL points.
pub(crate) fn materialized_retention(cache:&Path,channel_id:&str)->Result<Vec<Value>,String>{
    if !valid_channel_id(channel_id){return Err("ANALYTICS_CACHE_INVALID_CHANNEL_ID".into())}
    let root=previous_generation_root(cache,channel_id)
        .ok_or("ANALYTICS_MATERIALIZED_VIEW_MISSING")?;
    let catalog=read_json(&root.join("video-catalog.json"))?;
    let items=catalog.as_array().ok_or("ANALYTICS_CATALOG_INVALID")?;
    let mut seen=std::collections::HashSet::<String>::new();
    let mut curves=Vec::<Value>::new();
    for row in items{
        let id=row.get("videoId").and_then(Value::as_str)
            .filter(|id|valid_video_id(id)).ok_or("ANALYTICS_CATALOG_VIDEO_ID_INVALID")?;
        if !seen.insert(id.to_owned()){return Err("ANALYTICS_CATALOG_DUPLICATE_VIDEO_ID".into())}
        let path=root.join("retention").join(format!("{}.json",key(id)));
        if !path.exists(){continue}
        let curve=read_json(&path)?;
        if curve.get("videoId").and_then(Value::as_str)!=Some(id){
            return Err("ANALYTICS_RETENTION_WRONG_VIDEO".into())
        }
        if curve.get("channelId").and_then(Value::as_str)
            .map(|actual|actual!=channel_id).unwrap_or(false){
            return Err("ANALYTICS_RETENTION_WRONG_CHANNEL".into())
        }
        curves.push(curve);
    }
    Ok(curves)
}
pub(crate) fn materialized_reach_daily(cache:&Path,channel_id:&str)->Result<Vec<Value>,String>{
    materialized_rows(cache,channel_id,Path::new("reach-daily.json"))
}

fn fleet_summaries(cache_root:&Path,channel_ids:&[String])->Vec<Value>{
    let mut out=Vec::with_capacity(channel_ids.len());
    let mut seen=std::collections::HashSet::new();
    for channel_id in channel_ids{
        if !valid_channel_id(channel_id)||!seen.insert(channel_id){
            out.push(json!({"channelId":channel_id,"status":"INVALID_CHANNEL_ID"}));continue
        }
        let cache=cache_root.join(channel_id);
        let pointer_path=cache.join("ui-current.json");
        if !pointer_path.exists(){
            out.push(json!({"channelId":channel_id,"status":"NOT_YET_COLLECTED"}));continue
        }
        let summary=(||->Result<Value,String>{
            let pointer=read_json(&pointer_path)?;
            if pointer.get("channelId").and_then(Value::as_str)!=Some(channel_id.as_str()){
                return Err("ANALYTICS_FLEET_WRONG_CHANNEL".into())
            }
            let generation=pointer.get("generation").and_then(Value::as_str).unwrap_or("");
            if !safe_generation(generation){return Err("ANALYTICS_FLEET_INVALID_GENERATION".into())}
            let compact=cache.join("ui-generations").join(generation).join("fleet-summary.json");
            if compact.exists(){
                // Fast path: ~1 small file per channel, not the entire historical
                // event log and channel metadata for each of 35–50 channels.
                let data=read_json(&compact)?;
                if data.get("channelId").and_then(Value::as_str)!=Some(channel_id.as_str()){
                    return Err("ANALYTICS_FLEET_COMPACT_CHANNEL_MISMATCH".into())
                }
                return Ok(data)
            }
            let old=materialized_overview(&cache,channel_id)?;
            let findings=old.get("growthAndDecline").and_then(Value::as_array);
            let find=|days:i64|findings.and_then(|rows|rows.iter()
                .find(|v|v.get("windowDays").and_then(Value::as_i64)==Some(days))).cloned();
            Ok(json!({"channelId":channel_id,"updatedAt":old.get("updatedAt"),
                "summary":old.get("summary"),"videosTotal":old.get("videosTotal"),
                "growth7":find(7),"growth28":find(28)}))
        })();
        match summary{
            Ok(mut v)=>{v["status"]=json!("AVAILABLE");out.push(v);},
            Err(e)=>out.push(json!({"channelId":channel_id,"status":"CACHE_READ_ERROR","error":e})),
        }
    }
    out
}
#[tauri::command]
pub async fn analytics360_fleet(app:AppHandle,channel_ids:Vec<String>)->Result<Vec<Value>,String>{
    #[cfg(not(target_os="macos"))]{
        let _=(app,channel_ids);
        return Err("Analytics 360 Fleet доступна только на macOS".into())
    }
    #[cfg(target_os="macos")]{
        if channel_ids.len()>200{return Err("Выберите не более 200 каналов".into())}
        let root=app.path().app_data_dir().map_err(|e|e.to_string())?
            .join("AIAnalytics").join("cache");
        tauri::async_runtime::spawn_blocking(move||fleet_summaries(&root,&channel_ids))
            .await.map_err(|e|format!("ANALYTICS_FLEET_TASK_FAILED: {e}"))
    }
}

#[tauri::command]
pub async fn analytics360_read(
    app:AppHandle,channel_id:String,page:Option<u32>,page_size:Option<u32>,period:Option<String>,
    start_date:Option<String>,end_date:Option<String>,video_id:Option<String>,content_type:Option<String>,sort:Option<String>,
)->Result<Value,String>{
    #[cfg(not(target_os="macos"))] {
        let _=(app,channel_id,page,page_size,period,start_date,end_date,video_id,content_type,sort);
        return Err("Analytics 360 доступна только на macOS".into());
    }
    #[cfg(target_os="macos")] {
        if !valid_channel_id(&channel_id){return Err("Некорректный Channel ID".into())}
        let cache=app.path().app_data_dir().map_err(|e|e.to_string())?
            .join("AIAnalytics").join("cache").join(&channel_id);
        tauri::async_runtime::spawn_blocking(move||load_from_disk(&cache,&channel_id,page.unwrap_or(0),page_size.unwrap_or(40),
            period.as_deref().unwrap_or("28"),start_date.as_deref(),end_date.as_deref(),video_id.as_deref(),content_type.as_deref(),sort.as_deref()))
            .await.map_err(|e|format!("ANALYTICS_READ_TASK_FAILED: {e}"))?
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn corrupt_prior_rows_never_publish_a_truncated_history(){
        for file in ["channel-daily.json".to_string(),"video-catalog.json".to_string(),
            "reach-daily.json".to_string(),format!("video-days/{}.json",key("aBc1234-X_y"))]{
            for bad in [b"{broken".as_slice(),b"{}".as_slice()]{
                let temp=std::env::temp_dir().join(format!("vyron-corrupt-history-{}",Uuid::new_v4()));
                fs::create_dir_all(&temp).unwrap();
                let cid="UC1234567890123456789012";
                let videos=vec![json!({"id":"aBc1234-X_y","snippet":{"channelId":cid}})];
                persist(&temp,&json!({"channelId":cid}),&json!({}),
                    &[json!({"date":"2026-01-01","views":99})],&videos,
                    &[json!({"videoId":"aBc1234-X_y","date":"2026-01-01","views":42})],
                    &[],&[],&[],&[],&[]).unwrap();
                let pointer_before=fs::read(temp.join("ui-current.json")).unwrap();
                let root=previous_generation_root(&temp,cid).unwrap();
                fs::write(root.join(&file),bad).unwrap();
                let error=persist(&temp,&json!({"channelId":cid}),&json!({}),
                    &[],&videos,&[],&[],&[],&[],&[],&[]).unwrap_err();
                assert!(error.starts_with("ANALYTICS_HISTORY_"),"{error}");
                assert_eq!(fs::read(temp.join("ui-current.json")).unwrap(),pointer_before);
                assert_eq!(fs::read(root.join(&file)).unwrap(),bad);
                fs::remove_dir_all(temp).unwrap();
            }
        }
    }
    #[test]fn missing_required_history_is_not_an_empty_history(){
        let temp=std::env::temp_dir().join(format!("vyron-missing-history-{}",Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        assert!(prior_rows(None,"","channel-daily.json",true).unwrap().is_empty());
        assert!(prior_rows(Some(&temp),"video-days","not-collected.json",false).unwrap().is_empty());
        assert_eq!(prior_rows(Some(&temp),"","channel-daily.json",true).unwrap_err(),
            "ANALYTICS_HISTORY_REQUIRED_FILE_MISSING");
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]fn historical_video_corruption_is_not_silently_dropped(){
        let cid="UC1234567890123456789012";
        let vid="aBc1234-X_y";
        for folder in ["video-details","video-days","retention"]{
            let temp=std::env::temp_dir().join(format!("vyron-historical-corruption-{}",Uuid::new_v4()));
            fs::create_dir_all(&temp).unwrap();
            persist(&temp,&json!({"channelId":cid}),&json!({}),&[],
                &[json!({"id":vid,"snippet":{"channelId":cid}})],
                &[json!({"videoId":vid,"date":"2026-01-01","views":42})],&[],&[],
                &[json!({"videoId":vid,"points":[[0,1]]})],&[],&[]).unwrap();
            let pointer_before=fs::read(temp.join("ui-current.json")).unwrap();
            let source=previous_generation_root(&temp,cid).unwrap().join(folder).join(format!("{}.json",key(vid)));
            fs::write(&source,b"{broken").unwrap();
            // The video is absent from the new inventory, but its old history
            // must still be read successfully before publishing a generation.
            assert!(persist(&temp,&json!({"channelId":cid}),&json!({}),
                &[],&[],&[],&[],&[],&[],&[],&[]).unwrap_err().starts_with("ANALYTICS_HISTORY_"));
            assert_eq!(fs::read(temp.join("ui-current.json")).unwrap(),pointer_before);
            assert_eq!(fs::read(source).unwrap(),b"{broken");
            fs::remove_dir_all(temp).unwrap();
        }
    }
    #[test]fn selected_channel_rejects_a_copied_foreign_cache_without_mutation(){
        let temp=std::env::temp_dir().join(format!("vyron-wrong-channel-{}",Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let owner="UC1234567890123456789012";
        let selected="UC2222222222222222222222";
        persist(&temp,&json!({"channelId":owner}),&json!({}),
            &[json!({"date":"2026-01-01","views":99})],&[],&[],&[],&[],&[],&[],&[]).unwrap();
        let pointer_before=fs::read(temp.join("ui-current.json")).unwrap();
        let error=load_from_disk(&temp,selected,0,40,"all",None,None,None,None,None).unwrap_err();
        assert_eq!(error,"ANALYTICS_POINTER_CHANNEL_MISMATCH");
        assert_eq!(fs::read(temp.join("ui-current.json")).unwrap(),pointer_before);
        let actual=load_from_disk(&temp,owner,0,40,"all",None,None,None,None,None).unwrap();
        assert_eq!(actual["channelDaily"][0]["views"],99);
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]fn json_fallback_rejects_overview_channel_and_generation_mismatch(){
        let temp=std::env::temp_dir().join(format!("vyron-wrong-overview-{}",Uuid::new_v4()));
        let cid="UC1234567890123456789012";
        let generation=Uuid::new_v4().to_string();
        let root=temp.join("ui-generations").join(&generation);
        fs::create_dir_all(&root).unwrap();
        atomic_json(&temp.join("ui-current.json"),&json!({"channelId":cid,"generation":generation})).unwrap();
        for overview in [
            json!({"channelId":"UC2222222222222222222222","generation":generation}),
            json!({"channelId":cid,"generation":Uuid::new_v4().to_string()}),
        ]{
            atomic_json(&root.join("overview.json"),&overview).unwrap();
            let before=fs::read(root.join("overview.json")).unwrap();
            let error=load_from_disk(&temp,cid,0,40,"all",None,None,None,None,None).unwrap_err();
            assert_eq!(error,"ANALYTICS_OVERVIEW_IDENTITY_MISMATCH");
            assert_eq!(fs::read(root.join("overview.json")).unwrap(),before);
        }
        fs::remove_dir_all(temp).unwrap();
    }
    #[test]fn safe_ids(){
        assert!(valid_channel_id("UC1234567890123456789012"));
        assert!(!valid_channel_id("UC../../../../unsafe/path"));
        assert!(valid_video_id("aBc1234-X_y"));
        assert!(!valid_video_id("../secrets/"));
        assert!(safe_generation("0b16fd1b-664a-43e2-9c54-8ea8f3b71a06"));
        assert!(!safe_generation("../../"));
    }
    #[test]fn missing_days_are_not_invented(){
        let rows=vec![json!({"date":"2026-01-03","views":5}),json!({"date":"2026-01-05","views":7})];
        let result=filter_days(&rows,NaiveDate::from_ymd_opt(2026,1,4),NaiveDate::from_ymd_opt(2026,1,5));
        assert_eq!(result.len(),1);assert_eq!(result[0]["views"],7);
    }
    #[test]fn missing_video_in_new_inventory_keeps_confirmed_history(){
        let temp=std::env::temp_dir().join(format!("vyron-history-video-{}",Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let cid="UC1234567890123456789012";let vid="aBc1234-X_y";
        let video=json!({"id":vid,"snippet":{"channelId":cid,"publishedAt":"2024-01-01T00:00:00Z","title":"Previously uploaded"}});
        let summary=json!({"channelId":cid});
        persist(&temp,&summary,&json!({}),&[],&[video],
            &[json!({"videoId":vid,"date":"2024-01-02","views":43})],&[],&[],&[],&[],&[]).unwrap();
        persist(&temp,&summary,&json!({}),&[],&[],&[],&[],&[],&[],&[],&[]).unwrap();
        let result=load_from_disk(&temp,cid,0,40,"all",None,None,Some(vid),None,None).unwrap();
        assert_eq!(result["videoCount"],1);
        assert_eq!(result["selectedVideo"]["inventoryObservedNow"],false);
        assert_eq!(result["videoDaily"][0]["views"],43);
        assert_eq!(materialized_video_records(&temp,cid).unwrap()[0]["_vyronHistoricalRecord"]["inventoryObservedNow"],false);
        let _=fs::remove_dir_all(temp);
    }
    #[test]fn materialized_history_access_is_channel_scoped(){
        let root=std::env::temp_dir().join(format!("vyron-mat-{}",Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();let id="UC1234567890123456789012";
        let video="aBc1234-X_y";
        persist(&root,&json!({"channelId":id}),&json!({}),
            &[json!({"date":"2026-01-02","views":7})],
            &[json!({"id":video,"snippet":{"channelId":id,"publishedAt":"2026-01-02T00:00:00Z"}})],
            &[json!({"videoId":video,"date":"2026-01-02","views":7})],
            &[],&[],&[],&[],&[]).unwrap();
        assert_eq!(materialized_channel_daily(&root,id).unwrap().len(),1);
        assert_eq!(materialized_video_daily(&root,id,video).unwrap().len(),1);
        assert!(materialized_channel_daily(&root,"UC2222222222222222222222").is_err());
        assert!(materialized_video_daily(&root,id,"../unsafe").is_err());
        let _=fs::remove_dir_all(root);
    }
    #[test]fn newer_daily_reporting_backfill_replaces_absent_video_rows(){
        let old=vec![
            json!({"date":"2026-01-01","videoId":"aBc1234-X_y","impressions":400,
              "ctrRaw":0.04,"reportCreateTime":"2026-01-03T10:00:00Z"}),
            json!({"date":"2026-01-01","videoId":"bbbbbbbbbbb","impressions":100,
              "ctrRaw":0.02,"reportCreateTime":"2026-01-03T10:00:00Z"})];
        let new=vec![json!({"date":"2026-01-01","videoId":"bbbbbbbbbbb","impressions":110,
              "ctrRaw":0.02,"reportCreateTime":"2026-01-04T10:00:00Z"})];
        let (merged,retained)=merge_reach_by_video_date(&old,&new);
        assert_eq!(retained,0);
        assert_eq!(merged.len(),1);
        assert_eq!(merged[0]["videoId"],"bbbbbbbbbbb");
        assert_eq!(merged[0]["impressions"],110);
    }
    #[test]fn reach_join_preserves_every_video_and_weights_impressions(){
        let prior=vec![json!({"date":"2026-01-01","videoId":"aBc1234-X_y","impressions":400,"ctrRaw":0.04})];
        let fresh=vec![json!({"date":"2026-01-01","videoId":"bbbbbbbbbbb","impressions":600,"ctrRaw":0.08})];
        let (rows,kept)=merge_reach_by_video_date(&prior,&fresh);
        assert_eq!(kept,1);assert_eq!(rows.len(),2);
        let totals=reach_aggregate(&rows,None,None,None);
        assert_eq!(totals[0]["observedImpressions"],1000);
        assert!((totals[0]["weightedCtrRaw"].as_f64().unwrap()-0.064).abs()<0.0001);
        assert_eq!(totals[0]["ctrScale"],"UNVERIFIED");
        let only_one=reach_aggregate(&rows,None,None,Some("aBc1234-X_y"));
        assert_eq!(only_one[0]["observedImpressions"],400);
    }
    #[cfg(unix)]
    #[test]fn identical_snapshot_uses_hard_link_and_changed_file_uses_new_inode(){
        use std::os::unix::fs::MetadataExt;
        let root=std::env::temp_dir().join(format!("vyron-reuse-analytics-{}",Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let original=root.join("original.json");
        let linked=root.join("linked.json");
        let changed=root.join("changed.json");
        let data=json!({"date":"2026-01-01","views":24});
        atomic_json(&original,&data).unwrap();
        assert!(write_or_reuse(Some(&original),&linked,&data).unwrap());
        assert_eq!(fs::metadata(&original).unwrap().ino(),fs::metadata(&linked).unwrap().ino());
        assert!(!write_or_reuse(Some(&original),&changed,&json!({"date":"2026-01-01","views":25})).unwrap());
        assert_ne!(fs::metadata(&original).unwrap().ino(),fs::metadata(&changed).unwrap().ino());
        let _=fs::remove_dir_all(root);
    }
    #[test]fn corrupted_published_generation_cannot_be_silently_overwritten(){
        let root=std::env::temp_dir().join(format!("vyron-corrupt-analytics-{}",Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("ui-current.json"),b"{invalid pointer").unwrap();
        let channel="UC1234567890123456789012";
        let error=persist(&root,&json!({"channelId":channel}),&json!({}),
            &[],&[],&[],&[],&[],&[],&[],&[]).unwrap_err();
        assert!(error.contains("ANALYTICS_CACHE_RECOVERY_REQUIRED"));
        assert_eq!(fs::read(root.join("ui-current.json")).unwrap(),b"{invalid pointer");
        let _=fs::remove_dir_all(root);
    }
    #[test]fn old_generations_are_pruned_but_latest_three_survive(){
        let root=std::env::temp_dir().join(format!("vyron-prune-analytics-{}",Uuid::new_v4()));
        fs::create_dir_all(root.join("ui-generations")).unwrap();
        let cid="UC1234567890123456789012";
        let mut generations=Vec::new();
        for _ in 0..5{
            let id=Uuid::new_v4().to_string();
            let dir=root.join("ui-generations").join(&id);
            fs::create_dir(&dir).unwrap();
            atomic_json(&dir.join("overview.json"),&json!({"channelId":cid})).unwrap();
            generations.push(id);
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let last=generations.last().unwrap();
        let removed=prune_generations(&root,last,cid,std::time::Duration::ZERO).unwrap();
        assert_eq!(removed,2);
        assert!(root.join("ui-generations").join(last).exists());
        let survivors=fs::read_dir(root.join("ui-generations")).unwrap().count();
        assert_eq!(survivors,3);
        let _=fs::remove_dir_all(root);
    }
    #[test]fn event_history_retained_and_deduplicated_across_resyncs(){
        let root=std::env::temp_dir().join(format!("vyron-event-history-{}",Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let cid="UC1234567890123456789012";
        let first=json!({"eventType":"video_title_changed","videoId":"aBc1234-X_y","observedAt":"2026-01-01T12:00:00Z"});
        let next=json!({"eventType":"vyron_upload","videoId":"bbbbbbbbbbb","eventTime":"2026-01-02T12:00:00Z"});
        persist(&root,&json!({"channelId":cid}),&json!({}),&[],&[],&[],&[],&[],
            &[],&[first.clone()],&[]).unwrap();
        persist(&root,&json!({"channelId":cid}),&json!({}),&[],&[],&[],&[],&[],
            &[],&[first.clone(),next.clone()],&[]).unwrap();
        let report=load_from_disk(&root,cid,0,40,"all",None,None,None,None,None).unwrap();
        let events=report["overview"]["events"].as_array().unwrap();
        assert_eq!(events.len(),2);
        assert_eq!(events[0],first);
        assert_eq!(events[1],next);
        let _=fs::remove_dir_all(root);
    }
    #[test]fn partial_same_day_row_must_not_erase_a_prior_metric(){
        let previous=vec![json!({"date":"2026-01-01","views":18,"watchMinutes":42,
            "fetchedAt":"2026-01-03","source":"youtube_analytics_api_v2"})];
        let latest=vec![json!({"date":"2026-01-01","views":0,"watchMinutes":null,
            "fetchedAt":"2026-01-04","source":"youtube_analytics_api_v2"})];
        let (merged,retained)=merge_by_date(&previous,&latest);
        assert_eq!(retained,0);
        assert_eq!(merged[0]["views"],0);
        assert_eq!(merged[0]["watchMinutes"],42);
        assert_eq!(merged[0]["_vyronPriorFetchedAt"],"2026-01-03");
        assert_eq!(merged[0]["_vyronCarriedForwardFields"][0],"watchMinutes");
    }
    #[test]fn missing_new_field_is_carried_forward_with_provenance(){
        let (merged,_)=merge_by_date(
           &[json!({"date":"2026-01-01","views":10,"likes":2,"fetchedAt":"old"})],
           &[json!({"date":"2026-01-01","views":14,"fetchedAt":"new"})]);
        assert_eq!(merged[0]["views"],14);
        assert_eq!(merged[0]["likes"],2);
        assert_eq!(merged[0]["fetchedAt"],"new");
    }
    #[test]fn merge_counts_only_prior_days_missing_in_latest_batch(){
        let (merged,retained)=merge_by_date(
            &[json!({"date":"2026-01-01","views":3,"fetchedAt":"old"}),
              json!({"date":"2026-01-02","views":7,"fetchedAt":"old"})],
            &[json!({"date":"2026-01-02","views":8,"fetchedAt":"new"})]);
        assert_eq!(merged.len(),2);
        assert_eq!(retained,1);
        assert_eq!(merged[1]["views"],8);
        assert_eq!(merged[0]["fetchedAt"],"old");
    }
    #[test]fn compact_fleet_cache_does_not_include_full_events_or_per_video_history(){
        let root=std::env::temp_dir().join(format!("vyron-fleet-small-{}",Uuid::new_v4()));
        let cid="UC1234567890123456789012";
        let cache=root.join(cid);
        fs::create_dir_all(&cache).unwrap();
        let event=json!({"eventType":"video_title_changed","oldValue":"VERY_LONG_TEXT","videoId":"aBc1234-X_y"});
        persist(&cache,&json!({"channelId":cid,"name":"Music"}),&json!({}),&[],
            &[],&[],&[],&[],&[],&[event],&[]).unwrap();
        let pointer=read_json(&cache.join("ui-current.json")).unwrap();
        let gen=pointer["generation"].as_str().unwrap();
        let compact=fs::read_to_string(cache.join("ui-generations").join(gen).join("fleet-summary.json")).unwrap();
        assert!(!compact.contains("VERY_LONG_TEXT"));
        assert!(!compact.contains("video-days"));
        let rows=fleet_summaries(&root,&[cid.to_string()]);
        assert_eq!(rows.len(),1);
        assert_eq!(rows[0]["status"],"AVAILABLE");
        assert_eq!(rows[0]["summary"]["name"],"Music");
        let _=fs::remove_dir_all(root);
    }
    #[test]fn fleet_reads_its_own_published_cache_and_marks_missing_channel(){
        let root=std::env::temp_dir().join(format!("vyron-fleet-analytics-{}",Uuid::new_v4()));
        let a="UC1234567890123456789012".to_string();
        let b="UC2222222222222222222222".to_string();
        fs::create_dir_all(root.join(&a)).unwrap();
        persist(&root.join(&a),&json!({"channelId":a,"name":"A"}),&json!({}),
            &[],&[],&[],&[],&[],&[],&[],&[]).unwrap();
        let result=fleet_summaries(&root,&[a.clone(),b.clone()]);
        assert_eq!(result.len(),2);
        assert_eq!(result[0]["status"],"AVAILABLE");
        assert_eq!(result[0]["summary"]["channelId"],a);
        assert_eq!(result[1]["status"],"NOT_YET_COLLECTED");
        let _=fs::remove_dir_all(root);
    }
    #[test]fn concurrent_same_channel_syncs_preserve_all_confirmed_daily_rows(){
        let cache=std::env::temp_dir().join(format!("vyron-concurrent-cache-{}",Uuid::new_v4()));
        fs::create_dir_all(&cache).unwrap();
        let cid="UC1234567890123456789012";
        let mut threads=Vec::new();
        for index in 0..8{
            let own=cache.clone();
            threads.push(std::thread::spawn(move||{
                let day=format!("2026-09-{:02}",index+1);
                let row=json!({"date":day,"views":index+1,
                    "source":"synthetic_concurrent_sync","fetchedAt":"2026-10-01"});
                persist(&own,&json!({"channelId":cid}),&json!({}),&[row],
                    &[],&[],&[],&[],&[],&[],&[]).unwrap();
            }));
        }
        for thread in threads{thread.join().unwrap()}
        let view=materialized_channel_daily(&cache,cid).unwrap();
        assert_eq!(view.len(),8);
        for index in 0..8{
            assert!(view.iter().any(|v|v["views"]==index+1));
        }
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn partial_retention_resync_appears_in_full_ai_archive(){
        let cache=std::env::temp_dir().join(format!("vyron-retention-export-{}",Uuid::new_v4()));
        fs::create_dir_all(&cache).unwrap();
        let cid="UC1234567890123456789012";
        let first="aBc1234-X_y";
        let second="bbbbbbbbbbb";
        let make=|id:&str|json!({"id":id,"snippet":{"channelId":cid,
            "publishedAt":"2025-01-01T00:00:00Z","title":"Song"}});
        let old=json!({"channelId":cid,"videoId":first,"status":"AVAILABLE",
            "points":[[0.0,1.0],[1.0,0.15]],"fetchedAt":"2026-10-01T00:00:00Z",
            "source":"youtube_analytics_api_v2","curveMetadata":"KEEP"});
        persist(&cache,&json!({"channelId":cid}),&json!({}),&[],
            &[make(first),make(second)],&[],&[],&[],&[old.clone()],&[],&[]).unwrap();
        let new=json!({"channelId":cid,"videoId":second,
            "points":[[0.0,0.8],[1.0,0.2]],"fetchedAt":"2026-11-01T00:00:00Z"});
        persist(&cache,&json!({"channelId":cid}),&json!({}),&[],
            &[make(first),make(second)],&[],&[],&[],&[new.clone()],&[],&[]).unwrap();
        let results=materialized_retention(&cache,cid).unwrap();
        assert_eq!(results.len(),2);
        assert!(results.contains(&old));
        assert!(results.contains(&new));
        assert_eq!(results[0]["curveMetadata"],"KEEP");
        let _=fs::remove_dir_all(cache);
    }
    #[test]fn incomplete_resync_retains_earlier_channel_and_video_days(){
        let temp=std::env::temp_dir().join(format!("vyron-analytics-merge-{}",Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let channel="UC1234567890123456789012";
        let vid="aBc1234-X_y";
        let videos=vec![json!({"id":vid,"snippet":{"channelId":channel,"title":"Song","publishedAt":"2026-01-01T00:00:00Z"}})];
        let summary=json!({"channelId":channel});
        persist(&temp,&summary,&json!({}),
            &[json!({"date":"2026-01-01","views":9,"source":"youtube_analytics_api_v2","fetchedAt":"2026-02-01"})],
            &videos,&[json!({"videoId":vid,"date":"2026-01-01","views":9,"fetchedAt":"2026-02-01"})],
            &[],&[],&[json!({"videoId":vid,"points":[[0,1]]})],&[],&[]).unwrap();
        persist(&temp,&summary,&json!({"daily":"partial"}),
            &[json!({"date":"2026-01-02","views":2,"fetchedAt":"2026-02-02"})],
            &videos,&[json!({"videoId":vid,"date":"2026-01-02","views":2,"fetchedAt":"2026-02-02"})],
            &[],&[],&[],&[],&[]).unwrap();
        let result=load_from_disk(&temp,channel,0,40,"all",None,None,Some(vid),Some("all"),None).unwrap();
        assert_eq!(result["channelDaily"].as_array().unwrap().len(),2);
        assert_eq!(result["channelDaily"][0]["fetchedAt"],"2026-02-01");
        assert_eq!(result["videoDaily"].as_array().unwrap().len(),2);
        assert_eq!(result["retention"]["points"][0][1],1);
        assert_eq!(result["overview"]["coverage"]["cacheHistoryMerge"]["retainedPriorChannelDays"],1);
        let _=fs::remove_dir_all(temp);
    }
    #[test]fn out_of_page_video_can_open_its_detail(){
        let temp=std::env::temp_dir().join(format!("vyron-analytics-detail-{}",Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();
        let channel="UC1234567890123456789012";
        let videos=vec![
            json!({"id":"aBc1234-X_y","snippet":{"channelId":channel,"title":"New","publishedAt":"2026-11-01T09:00:00Z"}}),
            json!({"id":"bbbbbbbbbbb","snippet":{"channelId":channel,"title":"Older","publishedAt":"2026-01-01T09:00:00Z"}}),
        ];
        persist(&temp,&json!({"channelId":channel}),&json!({}),&[],&videos,&[],&[],&[],&[],&[],&[]).unwrap();
        let r=load_from_disk(&temp,channel,0,1,"all",None,None,Some("bbbbbbbbbbb"),Some("all"),None).unwrap();
        assert_eq!(r["videoCount"],2);
        assert_eq!(r["videos"].as_array().unwrap().len(),1);
        assert_eq!(r["videos"][0]["videoId"],"aBc1234-X_y");
        assert_eq!(r["selectedVideo"]["videoId"],"bbbbbbbbbbb");
        assert_eq!(r["videoDetail"]["id"],"bbbbbbbbbbb");
        let _=fs::remove_dir_all(temp);
    }
    #[test]fn shorter_videos_are_not_mislabeled_shorts(){
        let v=json!({"id":"aBc1234-X_y","contentDetails":{"duration":"PT2M12S"},"snippet":{"title":"music"}});
        assert_eq!(public_video_record(&v)["contentType"],"unknown");
    }
}

