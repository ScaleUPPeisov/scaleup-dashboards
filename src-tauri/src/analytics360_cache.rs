//! Read-only, per-channel Analytics 360 materialized view for macOS.
//! Large video/day data never enters the primary VYRON Zustand state.
//! Source of truth remains Google's official API; missing data stays missing.
use chrono::{Duration as Days, NaiveDate, Utc};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::{BTreeMap,HashMap},fs::{self,OpenOptions},io::Write,path::{Path,PathBuf}};
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
/// Merge only rows with a real calendar date. Fresh API rows supersede old
/// observations for the same date, while untouched dates keep their original
/// source/fetchedAt provenance. A partial new API sync cannot erase history.
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
                rows.insert(day.to_owned(),row.clone());
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
    for row in prior{
        if let Some(k)=key_of(row){prior_keys.insert(k.clone());rows.insert(k,row.clone());}
    }
    for row in latest{
        if let Some(k)=key_of(row){new_keys.insert(k.clone());rows.insert(k,row.clone());}
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
fn optional_prior_rows(root:Option<&Path>,folder:&str,file:&str)->Vec<Value>{
    root.and_then(|p|read_json(&p.join(folder).join(file)).ok())
        .and_then(|v|v.as_array().cloned()).unwrap_or_default()
}

/// Persists a complete immutable generation, then publishes ONE atomic pointer.
/// An interrupted save leaves the previously published view intact.
pub(crate) fn persist(
    cache:&Path, summary:&Value,coverage:&Value,channel_daily:&[Value],videos:&[Value],
    video_daily:&[Value],traffic:&[Value],breakdowns:&[Value],
    retention:&[Value],events:&[Value],findings:&[Value],
)->Result<(),String>{
    let cid=summary.get("channelId").and_then(Value::as_str).unwrap_or("");
    if !valid_channel_id(cid){return Err("ANALYTICS_CACHE_INVALID_CHANNEL_ID".into())}
    let previous_root=previous_generation_root(cache,cid);
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
    let mut preserved_video_days=0usize;
    let reach=crate::analytics_reach::read_reach(cache,coverage,cid);
    let previous_reach=optional_prior_rows(previous_root.as_deref(),"","reach-daily.json");
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
        atomic_json(&root.join("video-details").join(format!("{hashed}.json")),video)?;
        let file=format!("{hashed}.json");
        let previous_days=optional_prior_rows(previous_root.as_deref(),"video-days",&file);
        let current_days=days_by_video.remove(id).unwrap_or_default();
        let (merged_days,retained)=merge_by_date(&previous_days,&current_days);
        preserved_video_days+=retained;
        if !merged_days.is_empty(){
            atomic_json(&root.join("video-days").join(&file),&json!(merged_days))?;
        }
        if let Some(curve)=retention_by_video.remove(id){
            atomic_json(&root.join("retention").join(&file),&curve)?;
        }else if let Some(previous)=previous_root.as_ref()
            .and_then(|p|read_json(&p.join("retention").join(&file)).ok()){
            atomic_json(&root.join("retention").join(&file),&previous)?;
            preserved_retention_curves+=1;
        }
    }
    // A video missing from a later authoritative inventory is not proof that
    // it was deleted. Preserve its last known metadata and historical metrics.
    let previous_catalog=previous_root.as_ref()
        .and_then(|r|read_json(&r.join("video-catalog.json")).ok())
        .and_then(|v|v.as_array().cloned()).unwrap_or_default();
    let mut historical_only_videos=0usize;
    for old in previous_catalog{
        let Some(id)=old.get("videoId").and_then(Value::as_str).filter(|id|valid_video_id(id))else{continue};
        if !known.insert(id.to_string()){continue}
        let file=format!("{}.json",key(id));
        let Some(detail)=previous_root.as_ref()
            .and_then(|r|read_json(&r.join("video-details").join(&file)).ok())else{continue};
        let mut record=old.clone();
        record["inventoryObservedNow"]=json!(false);
        record["inventoryCaveat"]=json!("Not observed in latest inventory; may be deleted, private, hidden or temporarily unavailable. No deletion inferred.");
        catalog.push(record);
        atomic_json(&root.join("video-details").join(&file),&detail)?;
        if let Some(previous)=previous_root.as_ref()
            .and_then(|r|read_json(&r.join("video-days").join(&file)).ok()){
            atomic_json(&root.join("video-days").join(&file),&previous)?;
            preserved_video_days+=previous.as_array().map(Vec::len).unwrap_or(0);
        }
        if let Some(previous)=previous_root.as_ref()
            .and_then(|r|read_json(&r.join("retention").join(&file)).ok()){
            atomic_json(&root.join("retention").join(&file),&previous)?;
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
    let old_channel_days=optional_prior_rows(previous_root.as_deref(),"","channel-daily.json");
    let (merged_channel_days,preserved_channel_days)=merge_by_date(&old_channel_days,channel_daily);
    let mut effective_coverage=coverage.clone();
    effective_coverage["reachIngestion"]=reach.coverage;
    effective_coverage["cacheHistoryMerge"]=json!({
        "source":"local_previously_confirmed_api_rows",
        "retainedPriorChannelDays":preserved_channel_days,
        "retainedPriorVideoDays":preserved_video_days,
        "historicalOnlyVideosRetained":historical_only_videos,
        "retainedPriorReachRows":preserved_reach_rows,
        "retainedPriorRetentionCurves":preserved_retention_curves,
        "policy":"New observations supersede prior observations on matching dates; untouched earlier confirmed dates retain original source and fetchedAt."
    });
    let index=json!({"schemaVersion":1,"channelId":cid,"generation":generation,
        "updatedAt":Utc::now().to_rfc3339(),"summary":summary,"coverage":effective_coverage,
        "traffic":traffic,"audienceBreakdowns":breakdowns,"events":events,
        "growthAndDecline":findings,"publicationsByDay":publications,"videosTotal":catalog.len()});
    atomic_json(&root.join("overview.json"),&index)?;
    atomic_json(&root.join("channel-daily.json"),&json!(merged_channel_days))?;
    atomic_json(&root.join("video-catalog.json"),&json!(catalog))?;
    atomic_json(&root.join("reach-daily.json"),&json!(merged_reach))?;
    let pointer=json!({"schemaVersion":1,"generation":generation,
       "channelId":cid,"updatedAt":Utc::now().to_rfc3339()});
    atomic_json(&cache.join("ui-current.json"),&pointer)?;
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
fn load_from_disk(cache:&Path,page:u32,per_page:u32,period:&str,from:Option<&str>,to:Option<&str>,video_id:Option<&str>,content_type:Option<&str>,sort:Option<&str>)->Result<Value,String>{
    let pointer_path=cache.join("ui-current.json");
    if !pointer_path.exists(){return Ok(json!({"status":"NOT_YET_COLLECTED","message":"Сначала синхронизируйте историю этого канала"}))}
    let pointer=read_json(&pointer_path)?;
    let gen=pointer.get("generation").and_then(Value::as_str).unwrap_or("");
    if !safe_generation(gen){return Err("ANALYTICS_CACHE_INVALID_GENERATION".into())}
    let root=cache.join("ui-generations").join(gen);
    let overview=read_json(&root.join("overview.json"))?;
    let catalog=read_json(&root.join("video-catalog.json"))?;
    let all_days=read_json(&root.join("channel-daily.json"))?;
    let all=catalog.as_array().ok_or("ANALYTICS_CATALOG_INVALID")?;
    let days=all_days.as_array().ok_or("ANALYTICS_DAILY_INVALID")?;
    let (start,end)=period_dates(period,from,to)?;
    let current=filter_days(days,start,end);
    let reach=read_json(&root.join("reach-daily.json")).ok()
        .and_then(|v|v.as_array().cloned()).unwrap_or_default();
    let channel_reach=reach_aggregate(&reach,start,end,None);
    let selected_reach=video_id.map(|id|reach_aggregate(&reach,start,end,Some(id)))
        .unwrap_or_default();
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
pub(crate) fn materialized_channel_daily(cache:&Path,channel_id:&str)->Result<Vec<Value>,String>{
    materialized_rows(cache,channel_id,Path::new("channel-daily.json"))
}
pub(crate) fn materialized_video_daily(cache:&Path,channel_id:&str,video_id:&str)->Result<Vec<Value>,String>{
    if !valid_video_id(video_id){return Err("ANALYTICS_INVALID_VIDEO_ID".into())}
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
pub(crate) fn materialized_reach_daily(cache:&Path,channel_id:&str)->Result<Vec<Value>,String>{
    materialized_rows(cache,channel_id,Path::new("reach-daily.json"))
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
            .join("AIAnalytics").join("cache").join(channel_id);
        tauri::async_runtime::spawn_blocking(move||load_from_disk(&cache,page.unwrap_or(0),page_size.unwrap_or(40),
            period.as_deref().unwrap_or("28"),start_date.as_deref(),end_date.as_deref(),video_id.as_deref(),content_type.as_deref(),sort.as_deref()))
            .await.map_err(|e|format!("ANALYTICS_READ_TASK_FAILED: {e}"))?
    }
}
#[cfg(test)]
mod tests{
    use super::*;
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
        let cid="UC1234567890123456789012",vid="aBc1234-X_y";
        let video=json!({"id":vid,"snippet":{"channelId":cid,"publishedAt":"2024-01-01T00:00:00Z","title":"Previously uploaded"}});
        let summary=json!({"channelId":cid});
        persist(&temp,&summary,&json!({}),&[],&[video],
            &[json!({"videoId":vid,"date":"2024-01-02","views":43})],&[],&[],&[],&[],&[]).unwrap();
        persist(&temp,&summary,&json!({}),&[],&[],&[],&[],&[],&[],&[],&[]).unwrap();
        let result=load_from_disk(&temp,0,40,"all",None,None,Some(vid),None,None).unwrap();
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
        let result=load_from_disk(&temp,0,40,"all",None,None,Some(vid),Some("all"),None).unwrap();
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
        let r=load_from_disk(&temp,0,1,"all",None,None,Some("bbbbbbbbbbb"),Some("all"),None).unwrap();
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
