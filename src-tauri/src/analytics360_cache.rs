//! Read-only, per-channel Analytics 360 materialized view for macOS.
//! Large video/day data never enters the primary VYRON Zustand state.
//! Source of truth remains Google's official API; missing data stays missing.
use chrono::{Duration as Days, NaiveDate, Utc};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::HashMap,fs::{self,File,OpenOptions},io::Write,path::{Path,PathBuf}};
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
/// Persists a complete immutable generation, then publishes ONE atomic pointer.
/// An interrupted save leaves the previously published view intact.
pub(crate) fn persist(
    cache:&Path, summary:&Value,coverage:&Value,channel_daily:&[Value],videos:&[Value],
    video_daily:&[Value],traffic:&[Value],breakdowns:&[Value],
    retention:&[Value],events:&[Value],findings:&[Value],
)->Result<(),String>{
    let cid=summary.get("channelId").and_then(Value::as_str).unwrap_or("");
    if !valid_channel_id(cid){return Err("ANALYTICS_CACHE_INVALID_CHANNEL_ID".into())}
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
    let mut catalog=Vec::with_capacity(videos.len());
    let mut known=std::collections::HashSet::new();
    for video in videos{
        let id=video.get("id").and_then(Value::as_str).unwrap_or("");
        if !valid_video_id(id)||!known.insert(id.to_string()){continue}
        let hashed=key(id);
        catalog.push(public_video_record(video));
        atomic_json(&root.join("video-details").join(format!("{hashed}.json")),video)?;
        if let Some(days)=days_by_video.remove(id){
            atomic_json(&root.join("video-days").join(format!("{hashed}.json")),&json!(days))?;
        }
        if let Some(curve)=retention_by_video.remove(id){
            atomic_json(&root.join("retention").join(format!("{hashed}.json")),&curve)?;
        }
    }
    catalog.sort_by(|a,b|b["publishedAt"].as_str().cmp(&a["publishedAt"].as_str()));
    let index=json!({"schemaVersion":1,"channelId":cid,"generation":generation,
        "updatedAt":Utc::now().to_rfc3339(),"summary":summary,"coverage":coverage,
        "traffic":traffic,"audienceBreakdowns":breakdowns,"events":events,
        "growthAndDecline":findings,"videosTotal":catalog.len()});
    atomic_json(&root.join("overview.json"),&index)?;
    atomic_json(&root.join("channel-daily.json"),&json!(channel_daily))?;
    atomic_json(&root.join("video-catalog.json"),&json!(catalog))?;
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
fn load_from_disk(cache:&Path,page:u32,per_page:u32,period:&str,from:Option<&str>,to:Option<&str>,video_id:Option<&str>)->Result<Value,String>{
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
    let per_page=per_page.clamp(1,100) as usize;
    let offset=(page as usize).saturating_mul(per_page).min(all.len());
    let video_rows=all.iter().skip(offset).take(per_page).cloned().collect::<Vec<_>>();
    let mut detail=Value::Null;let mut video_days=Vec::<Value>::new();let mut retention=Value::Null;
    if let Some(id)=video_id{
        if !valid_video_id(id){return Err("Некорректный Video ID".into())}
        if !all.iter().any(|v|v.get("videoId").and_then(Value::as_str)==Some(id)){return Err("Видео отсутствует в этом канале".into())}
        let filename=format!("{}.json",key(id));
        detail=read_json(&root.join("video-details").join(&filename))?;
        if let Ok(value)=read_json(&root.join("video-days").join(&filename)){
            if let Some(rows)=value.as_array(){video_days=filter_days(rows,start,end)}
        }
        if let Ok(value)=read_json(&root.join("retention").join(filename)){retention=value;}
    }
    Ok(json!({"status":"AVAILABLE","schemaVersion":1,"generation":gen,"updatedAt":pointer.get("updatedAt"),
        "overview":overview,"channelDaily":current,"videos":video_rows,"videoCount":all.len(),
        "page":page,"pageSize":per_page,"videoDetail":detail,"videoDaily":video_days,"retention":retention,
        "period":period,"periodFrom":start.map(|d|d.format("%Y-%m-%d").to_string()),
        "periodTo":end.map(|d|d.format("%Y-%m-%d").to_string())}))
}
#[tauri::command]
pub async fn analytics360_read(
    app:AppHandle,channel_id:String,page:Option<u32>,page_size:Option<u32>,period:Option<String>,
    start_date:Option<String>,end_date:Option<String>,video_id:Option<String>,
)->Result<Value,String>{
    #[cfg(not(target_os="macos"))] {
        let _=(app,channel_id,page,page_size,period,start_date,end_date,video_id);
        return Err("Analytics 360 доступна только на macOS".into());
    }
    #[cfg(target_os="macos")] {
        if !valid_channel_id(&channel_id){return Err("Некорректный Channel ID".into())}
        let cache=app.path().app_data_dir().map_err(|e|e.to_string())?
            .join("AIAnalytics").join("cache").join(channel_id);
        tauri::async_runtime::spawn_blocking(move||load_from_disk(&cache,page.unwrap_or(0),page_size.unwrap_or(40),
            period.as_deref().unwrap_or("28"),start_date.as_deref(),end_date.as_deref(),video_id.as_deref()))
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
    #[test]fn shorter_videos_are_not_mislabeled_shorts(){
        let v=json!({"id":"aBc1234-X_y","contentDetails":{"duration":"PT2M12S"},"snippet":{"title":"music"}});
        assert_eq!(public_video_record(&v)["contentType"],"unknown");
    }
}
