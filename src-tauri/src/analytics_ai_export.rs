//! Mac AI archive exporter. Read-only YouTube APIs; never persists OAuth credentials.
use chrono::{Duration as Days, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};
use crate::youtube;

const DATA_API: &str = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API: &str = "https://youtubeanalytics.googleapis.com/v2/reports";
const REPORTING_API: &str = "https://youtubereporting.googleapis.com/v1";


static AI_EXPORT_BUSY:std::sync::atomic::AtomicBool=std::sync::atomic::AtomicBool::new(false);
struct AiRunGuard;
impl Drop for AiRunGuard {
    fn drop(&mut self){AI_EXPORT_BUSY.store(false,std::sync::atomic::Ordering::Release);}
}
fn acquire_ai_run()->Result<AiRunGuard,String>{
    AI_EXPORT_BUSY.compare_exchange(false,true,
        std::sync::atomic::Ordering::AcqRel,std::sync::atomic::Ordering::Acquire)
        .map_err(|_|"ANALYTICS_SYNC_ALREADY_RUNNING: сначала завершите текущий сбор данных".to_string())?;
    Ok(AiRunGuard)
}

#[derive(Clone, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AiChannelChoice {
    profile_id: String,
    channel_id: String,
    name: String,
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AiExportRequest {
    channels: Vec<AiChannelChoice>,
    period: String,
    start_date: Option<String>,
    end_date: Option<String>,
    destination: String,
    include_retention: Option<bool>,
    include_reporting: Option<bool>,
}
fn reported_error(v: &Value, status: reqwest::StatusCode) -> String {
    let reason=v.pointer("/error/message").and_then(Value::as_str).unwrap_or("API error");
    format!("HTTP {}: {}",status.as_u16(),reason)
}
fn is_safe_channel_id(value:&str)->bool{
    value.len()==24 && value.starts_with("UC") &&
        value.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-')
}
fn compact_hash(text: &str) -> String {
    let hash=Sha256::digest(text.as_bytes());
    hex::encode(&hash[..12])
}
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(),String> {
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|e.to_string())?}
    let temp=path.with_extension(format!("{}.tmp",Uuid::new_v4()));
    let result=(|| -> Result<(),String> {
        let mut file=File::create(&temp).map_err(|e|e.to_string())?;
        file.write_all(bytes).map_err(|e|e.to_string())?;
        file.sync_all().map_err(|e|e.to_string())?;
        fs::rename(&temp,path).map_err(|e|e.to_string())?;
        Ok(())
    })();
    if result.is_err(){let _=fs::remove_file(temp);}
    result
}
fn save_json(path:&Path,value:&Value)->Result<(),String>{
    write_atomic(path,&serde_json::to_vec_pretty(value).map_err(|e|e.to_string())?)
}
fn read_json(path:&Path)->Option<Value>{
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}
fn is_stable_cache(path:&Path, end:&str)->bool {
    if !path.exists(){return false}
    let boundary=(Utc::now().date_naive()-Days::days(100)).format("%Y-%m-%d").to_string();
    end < boundary.as_str()
}
fn numeric(v:Option<&Value>)->Option<f64>{
    v.and_then(|x|x.as_f64().or_else(||x.as_str().and_then(|s|s.parse::<f64>().ok())))
}
fn text(v:Option<&Value>)->String{
    v.and_then(Value::as_str).unwrap_or("").to_string()
}
fn rows(v:&Value)->Vec<Vec<Value>>{
    v.get("rows").and_then(Value::as_array).map(|a|a.iter().filter_map(|r|r.as_array().cloned()).collect()).unwrap_or_default()
}
fn progress(app:&AppHandle,run:&str,index:usize,total:usize,choice:&AiChannelChoice,stage:&str,detail:&str){
    let _=app.emit("vyron:ai-export-progress",json!({"runId":run,"completed":index,"total":total,
      "channelId":choice.channel_id,"name":choice.name,"stage":stage,"detail":detail,"at":Utc::now().to_rfc3339()}));
}
async fn get_json(app:&AppHandle,client:&reqwest::Client,token:&str,url:&str,params:&[(&str,String)],method:&str)->Result<Value,String>{
    for attempt in 0..3 {
        youtube::emit_youtube_api_request(app,method,None);
        let response=client.get(url).bearer_auth(token).query(params).send().await;
        match response {
            Ok(r)=>{
                let status=r.status();
                let body:Value=r.json().await.map_err(|e|format!("{method}: JSON: {e}"))?;
                if status.is_success(){return Ok(body)}
                let msg=reported_error(&body,status);
                let low=msg.to_lowercase();
                if status.as_u16()==403 && (low.contains("quotaexceeded")||low.contains("dailylimit")){
                    return Err(format!("{method}: {msg}"));
                }
                if (status.as_u16()==429||status.is_server_error()||low.contains("ratelimit")) && attempt<2 {
                    tokio::time::sleep(Duration::from_millis(900*(attempt+1) as u64)).await;
                    continue
                }
                return Err(format!("{method}: {msg}"))
            }
            Err(e) if attempt<2 =>{
                tokio::time::sleep(Duration::from_millis(900*(attempt+1) as u64)).await;
                if attempt==2{return Err(format!("{method}: {e}"))}
            }
            Err(e)=>return Err(format!("{method}: {e}")),
        }
    }
    Err(format!("{method}: retries exhausted"))
}
async fn post_json(app:&AppHandle,client:&reqwest::Client,token:&str,url:&str,body:Value)->Result<Value,String>{
    youtube::emit_youtube_api_request(app,"reporting.jobs.create",None);
    let r=client.post(url).bearer_auth(token).json(&body).send().await.map_err(|e|format!("Reporting job: {e}"))?;
    let st=r.status();let value:Value=r.json().await.map_err(|e|e.to_string())?;
    if st.is_success(){Ok(value)}else{Err(reported_error(&value,st))}
}
async fn cached_query(app:&AppHandle,client:&reqwest::Client,token:&str,cache:&Path,url:&str,params:&[(&str,String)],name:&str,range_end:&str)->Result<Value,String>{
    let key=compact_hash(&format!("{url}?{:?}",params));
    let path=cache.join(format!("{}-{}.json",name,key));
    if is_stable_cache(&path,range_end){if let Some(value)=read_json(&path){return Ok(value)}}
    let fresh=get_json(app,client,token,url,params,name).await?;
    save_json(&path,&fresh)?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(fresh)
}
fn window_dates(start:NaiveDate,end:NaiveDate,span:i64)->Vec<(String,String)>{
    let mut result=Vec::new();let mut d=start;
    while d<=end {
        let finish=std::cmp::min(end,d+Days::days(span-1));
        result.push((d.format("%Y-%m-%d").to_string(),finish.format("%Y-%m-%d").to_string()));
        d=finish+Days::days(1);
    }
    result
}
fn period_dates(request:&AiExportRequest,created:Option<&str>)->Result<(NaiveDate,NaiveDate),String>{
    let end=if request.period=="custom" {request.end_date.as_ref().and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok()).ok_or("Некорректная конечная дата")?}
      else {Utc::now().date_naive()-Days::days(2)};
    let earliest=created.and_then(|s|s.get(0..10)).and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok()).unwrap_or_else(||Utc::now().date_naive()-Days::days(3650));
    let start=match request.period.as_str(){
        "all"=>earliest,
        "365"=>end-Days::days(364),
        "90"=>end-Days::days(89),
        "30"=>end-Days::days(29),
        "custom"=>request.start_date.as_ref().and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok()).ok_or("Некорректная начальная дата")?,
        _=>return Err("Недопустимый период экспорта".into()),
    };
    if start>end || end>Utc::now().date_naive(){return Err("Неверный диапазон дат".into())}
    Ok((start,end))
}
fn csv_field(s:&str)->String {
    format!("\"{}\"",s.replace('"',"\"\""))
}
fn csv_line(fields:&[String])->String {
    fields.iter().map(|x|csv_field(x)).collect::<Vec<_>>().join(",")+"\n"
}
fn vstr(v:&Value)->String {
    if v.is_null(){String::new()}else if let Some(s)=v.as_str(){s.to_string()}else{v.to_string()}
}
fn append_csv(file:&mut File,fields:&[String])->Result<(),String>{
    file.write_all(csv_line(fields).as_bytes()).map_err(|e|e.to_string())
}
fn csv_file(path:&Path,columns:&str)->Result<File,String>{
    let mut f=File::create(path).map_err(|e|e.to_string())?;
    f.write_all(columns.as_bytes()).map_err(|e|e.to_string())?;Ok(f)
}
async fn fetch_inventory(app:&AppHandle,client:&reqwest::Client,token:&str,uploads:&str,channel_id:&str,cache:&Path)->Result<Vec<Value>,String>{
    let mut ids=Vec::<String>::new();let mut seen=HashSet::<String>::new();let mut next=String::new();
    let mut visited=HashSet::<String>::new();
    loop {
        if !visited.insert(next.clone()){return Err("Повторяющийся pageToken; инвентаризация прервана".into())}
        let mut params=vec![("part","contentDetails".to_string()),("playlistId",uploads.to_string()),("maxResults","50".to_string())];
        if !next.is_empty(){params.push(("pageToken",next.clone()))}
        let value=get_json(app,client,token,&format!("{DATA_API}/playlistItems"),&params,"playlistItems.list").await?;
        for item in value.get("items").and_then(Value::as_array).into_iter().flatten(){
            let id=text(item.pointer("/contentDetails/videoId"));
            if !id.is_empty() && seen.insert(id.clone()){ids.push(id)}
        }
        next=text(value.get("nextPageToken"));
        if next.is_empty(){break}
    }
    let mut videos=Vec::<Value>::new();
    for batch in ids.chunks(50) {
        let value=get_json(app,client,token,&format!("{DATA_API}/videos"),
            &[("part","snippet,contentDetails,status,statistics".into()),("id",batch.join(","))],"videos.list").await?;
        for item in value.get("items").and_then(Value::as_array).into_iter().flatten(){
            if item.pointer("/snippet/channelId").and_then(Value::as_str)==Some(channel_id){videos.push(item.clone())}
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let known:HashSet<_>=videos.iter().filter_map(|x|x.get("id").and_then(Value::as_str)).collect();
    let missing=ids.iter().filter(|id|!known.contains(id.as_str())).cloned().collect::<Vec<_>>();
    save_json(&cache.join("inventory_coverage.json"),&json!({"playlistEnumerated":ids.len(),"videosHydrated":videos.len(),
      "missingVideoIds":missing,"complete":missing.is_empty(),"source":"youtube_data_api_v3","fetchedAt":Utc::now().to_rfc3339()}))?;
    Ok(videos)
}
async fn analytics(app:&AppHandle,client:&reqwest::Client,token:&str,cache:&Path,
    start:&str,end:&str,metrics:&str,dimensions:&str,filters:Option<String>,label:&str)->Result<Vec<Vec<Value>>,String>{
    let mut params=vec![("ids","channel==MINE".into()),("startDate",start.into()),("endDate",end.into()),("metrics",metrics.into())];
    if !dimensions.is_empty(){params.push(("dimensions",dimensions.into()));params.push(("sort",dimensions.into()))}
    if let Some(x)=filters{params.push(("filters",x))}
    let mut output=Vec::<Vec<Value>>::new();let mut index=1usize;
    loop{
        let mut q=params.clone();
        q.push(("startIndex",index.to_string()));q.push(("maxResults","20000".into()));
        let result=cached_query(app,client,token,cache,ANALYTICS_API,&q,label,end).await?;
        let batch=rows(&result);
        let size=batch.len();
        output.extend(batch);
        if size<20000{break}
        index+=size;
        if index>3_000_000{return Err("Analytics pagination safety limit; данные неполные".into())}
    }
    Ok(output)
}
fn local_vyron_channel_labels(app:&AppHandle,channel_id:&str)->Value{
    // Export only user-entered classification/schedule fields; no local paths or settings secrets.
    let state=crate::storage::load_state(app.clone());
    let found=state.get("channels").and_then(Value::as_array).into_iter().flatten()
        .find(|c|c.get("youtubeChannelId").and_then(Value::as_str)==Some(channel_id));
    match found{
        Some(c)=>json!({"genre":c.get("genre"),"language":c.get("language"),"country":c.get("country"),
            "cadenceDays":c.get("cadenceDays"),"publishHour":c.get("publishHour"),
            "publishMinute":c.get("publishMinute"),"source":"vyron_local_configuration",
            "meaning":"User-defined channel metadata and preferred schedule, not proven content format or YouTube performance"}),
        None=>Value::Null,
    }
}
fn local_vyron_upload_events(app:&AppHandle,channel_id:&str)->Vec<Value>{
    // Read-only and strict whitelist. Never export local paths, OAuth or any state object.
    let state=crate::storage::load_state(app.clone());
    let mut events=Vec::new();
    for record in state.get("uploadHistory").and_then(Value::as_array).into_iter().flatten(){
        if record.get("youtubeChannelId").and_then(Value::as_str)!=Some(channel_id){continue}
        let video_id=text(record.get("youtubeVideoId"));
        let uploaded_at=text(record.get("uploadedAt"));
        if video_id.is_empty()||uploaded_at.is_empty(){continue}
        events.push(json!({"channelId":channel_id,"videoId":video_id,
            "eventType":"vyron_upload","eventTime":uploaded_at,"timeSource":"vyron_local_upload_history",
            "titleAtUpload":record.get("titleAtUpload"),"scheduledPublishAt":record.get("publishAt"),
            "privacy":"not_recorded","confidence":"locally_recorded"}));
    }
    events
}
fn load_events(cache:&Path)->Vec<Value>{
    read_json(&cache.join("events.json")).and_then(|v|v.as_array().cloned()).unwrap_or_default()
}
fn observe_metadata(cache:&Path,videos:&[Value],channel_id:&str,inventory_complete:bool)->Result<Vec<Value>,String>{
    let previous=read_json(&cache.join("metadata_snapshot.json")).unwrap_or_else(||json!({}));
    let mut current=serde_json::Map::new();let mut events=load_events(cache);
    for v in videos {
        let id=text(v.get("id"));if id.is_empty(){continue}
        let observed=json!({"title":v.pointer("/snippet/title"),"description":v.pointer("/snippet/description"),
            "tags":v.pointer("/snippet/tags"),"thumbnailUrls":v.pointer("/snippet/thumbnails"),"privacyStatus":v.pointer("/status/privacyStatus"),
            "publishedAt":v.pointer("/snippet/publishedAt")});
        if let Some(old)=previous.get(&id){
            for key in ["title","description","tags","thumbnailUrls","privacyStatus","publishedAt"]{
                if old.get(key)!=observed.get(key){
                    events.push(json!({"eventType":format!("video_{key}_changed"),"videoId":id,"channelId":channel_id,
                        "observedAt":Utc::now().to_rfc3339(),"origin":"detected_between_scans",
                        "oldValue":old.get(key),"newValue":observed.get(key),
                        "note":"Время фактического изменения неизвестно; зафиксирован момент обнаружения."}));
                }
            }
        }
        current.insert(id,observed);
    }
    if let Some(known)=previous.as_object(){
        for (id,last) in known{
            if current.contains_key(id){continue}
            if inventory_complete{
                events.push(json!({"channelId":channel_id,"videoId":id,
                    "eventType":"video_missing_from_latest_uploads_inventory",
                    "observedAt":Utc::now().to_rfc3339(),"origin":"detected_between_scans",
                    "confidence":"disappeared_from_complete_inventory_only",
                    "note":"Отсутствует в полном списке YouTube; удаление или изменение приватности не доказано"}));
            }else{
                // Partial hydration must never erase the last known metadata.
                current.insert(id.clone(),last.clone());
            }
        }
    }
    save_json(&cache.join("metadata_snapshot.json"),&Value::Object(current))?;
    save_json(&cache.join("events.json"),&json!(events))?;
    Ok(events)
}
fn video_lifecycle(videos:&[Value],daily:&[Value],channel_id:&str)->Vec<Value>{
    let mut by_video=HashMap::<String,HashMap<String,f64>>::new();
    for row in daily{
        let id=text(row.get("videoId"));
        let day=text(row.get("date"));
        if id.is_empty()||day.is_empty(){continue}
        if let Some(views)=numeric(row.get("views")){
            by_video.entry(id).or_default().insert(day,views);
        }
    }
    let mut output=Vec::new();
    for video in videos{
        let id=text(video.get("id"));
        let date=text(video.pointer("/snippet/publishedAt"));
        if id.is_empty(){continue}
        let published=date.get(..10).and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok());
        let lookup=by_video.get(&id);
        let mut windows=serde_json::Map::new();
        for period in [3i64,7,14,30,90]{
            let mut matched=0usize;
            let mut total=0.0;
            if let Some(start)=published{
                for offset in 0..period{
                    let key=(start+Days::days(offset)).format("%Y-%m-%d").to_string();
                    if let Some(value)=lookup.and_then(|m|m.get(&key)){
                        total+=value;matched+=1;
                    }
                }
            }
            // Missing days are UNKNOWN, not assumed zero. UTC publish dates may
            // cross YouTube Analytics' Pacific calendar day boundaries.
            windows.insert(format!("days{period}"),json!({"views":if matched==period as usize{Some(total)}else{None},
              "observedDays":matched,"requiredDays":period,"complete":matched==period as usize}));
        }
        output.push(json!({"channelId":channel_id,"videoId":id,"publishedAt":date,
            "first24HoursViews":Value::Null,"ageWindowsCalendarDays":windows,
            "publicationTimezone":"UTC","analyticsDayTimezone":"America/Los_Angeles",
            "caveat":"Window alignment by UTC publication calendar date is approximate, not exact hours after upload",
            "source":"derived_from_youtube_analytics_daily"}));
    }
    output
}
fn percent_change(now:f64,before:f64)->Value{if before.abs()<f64::EPSILON {Value::Null}else{json!(((now-before)/before)*100.0)}}
fn contributions_for_window(event:&Value,video_daily:&[Value])->Vec<Value>{
    let days=event.get("windowDays").and_then(Value::as_i64).unwrap_or(0);
    let end=event.get("periodEnd").and_then(Value::as_str).and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok());
    let Some(end)=end else{return vec![]};
    if days<1{return vec![]}
    let current_start=end-Days::days(days-1);
    let previous_start=current_start-Days::days(days);
    let previous_end=current_start-Days::days(1);
    let mut map=HashMap::<String,(f64,f64,usize,usize)>::new();
    for point in video_daily{
        let id=text(point.get("videoId"));
        let date=text(point.get("date"));
        let Some(date)=NaiveDate::parse_from_str(&date,"%Y-%m-%d").ok()else{continue};
        let Some(views)=numeric(point.get("views"))else{continue};
        if id.is_empty(){continue}
        if date<previous_start||date>end{continue}
        let row=map.entry(id).or_insert((0.0,0.0,0,0));
        if date>=current_start{
            row.0+=views;row.2+=1;
        }else if date<=previous_end{
            row.1+=views;row.3+=1;
        }
    }
    let mut out=map.into_iter().map(|(id,(now,prior,observed_now,observed_prior))|{
        let both_complete=observed_now>=days as usize&&observed_prior>=days as usize;
        json!({"videoId":id,"currentObservedViews":now,"previousObservedViews":prior,
            "currentObservedDays":observed_now,"previousObservedDays":observed_prior,
            "requiredDaysPerWindow":days,
            "confirmedDeltaViews":if both_complete{Some(now-prior)}else{None},
            "observedSumDifference":now-prior,
            "evidenceStatus":if both_complete{"complete"}else{"partial_missing_days"},
            "warning":"Observed sum difference is not a confirmed total delta when some daily rows are missing."})
    }).collect::<Vec<_>>();
    out.sort_by(|a,b|{
        let left=numeric(a.get("observedSumDifference")).unwrap_or(0.0).abs();
        let right=numeric(b.get("observedSumDifference")).unwrap_or(0.0).abs();
        right.partial_cmp(&left).unwrap_or(std::cmp::Ordering::Equal)
    });
    out.truncate(25);
    out
}
fn change_findings(channel_id:&str,daily:&[Value])->Vec<Value>{
    let m:HashMap<_,_>=daily.iter().filter_map(|x|Some((x.get("date")?.as_str()?.to_string(),numeric(x.get("views"))?))).collect();
    let mut findings=Vec::new();
    let last=Utc::now().date_naive()-Days::days(3);
    for days in [7i64,28i64]{
        let a=(0..days).map(|i|m.get(&(last-Days::days(i)).format("%Y-%m-%d").to_string()).copied()).collect::<Vec<_>>();
        let b=(days..days*2).map(|i|m.get(&(last-Days::days(i)).format("%Y-%m-%d").to_string()).copied()).collect::<Vec<_>>();
        if a.iter().any(Option::is_none)||b.iter().any(Option::is_none){continue}
        let current:f64=a.iter().flatten().sum();let before:f64=b.iter().flatten().sum();
        let pct=percent_change(current,before);
        findings.push(json!({"channelId":channel_id,"windowDays":days,"periodEnd":last.format("%Y-%m-%d").to_string(),
          "currentViews":current,"previousViews":before,"changePercent":pct,
          "direction":if current>before{"growth"}else if current<before{"decline"}else{"flat"},
          "source":"youtube_analytics_api_v2","status":"observed","hypotheses":[],
          "note":"Изменение измерено, причина не установлена"}));
    }
    findings
}
async fn collect_reporting(app:&AppHandle,client:&reqwest::Client,token:&str,cache:&Path)->Value{
    let mut coverage=json!({"status":"unavailable","source":"youtube_reporting_api_v1","reason":null,
       "reachType":"channel_reach_basic_a1","reports":[]});
    let jobs=match get_json(app,client,token,&format!("{REPORTING_API}/jobs"),&[],"reporting.jobs.list").await{
        Ok(v)=>v,Err(e)=>{coverage["reason"]=json!(e);return coverage}
    };
    let mut job_id=jobs.get("jobs").and_then(Value::as_array).into_iter().flatten()
        .find(|j|j.get("reportTypeId").and_then(Value::as_str)==Some("channel_reach_basic_a1"))
        .map(|j|text(j.get("id"))).unwrap_or_default();
    if job_id.is_empty(){
        match post_json(app,client,token,&format!("{REPORTING_API}/jobs"),json!({"reportTypeId":"channel_reach_basic_a1","name":"VYRON AI Reach"})).await{
            Ok(v)=>{job_id=text(v.get("id"));}
            Err(e)=>{coverage["reason"]=json!(e);return coverage}
        }
    }
    if job_id.is_empty(){coverage["reason"]=json!("Reporting API не вернул ID задания");return coverage}
    let listing=match get_json(app,client,token,&format!("{REPORTING_API}/jobs/{job_id}/reports"),&[],"reporting.reports.list").await{
        Ok(v)=>v,Err(e)=>{coverage["reason"]=json!(e);return coverage}
    };
    let reports=listing.get("reports").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut files=Vec::new();
    for report in reports {
        let url=text(report.get("downloadUrl"));let id=text(report.get("id"));
        if url.is_empty()||id.is_empty(){continue}
        let path=cache.join("reporting").join(format!("reach-{}.csv",compact_hash(&id)));
        if !path.exists(){
            youtube::emit_youtube_api_request(app,"reporting.media.download",None);
            let response=client.get(&url).bearer_auth(token).send().await;
            if let Ok(r)=response{
                if r.status().is_success(){if let Ok(bytes)=r.bytes().await{let _=write_atomic(&path,&bytes);}}
            }
        }
        if path.exists(){files.push(json!({"reportId":id,"file":path.file_name().and_then(|x|x.to_str()),
          "startTime":report.get("startTime"),"endTime":report.get("endTime"),"createdTime":report.get("createTime")}));}
    }
    coverage["reports"]=json!(files);
    coverage["status"]=json!(if files.is_empty(){"pending"}else{"partial"});
    coverage["reason"]=json!(if files.is_empty(){"Задание создано или отчёты пока не опубликованы; повторный экспорт подхватит их."}else{"Исторические отчёты ограничены сроками доступности Google."});
    coverage
}
fn write_document(path:&Path,content:&str)->Result<(),String>{write_atomic(path,content.as_bytes())}
fn copy_reporting(cache:&Path,output:&Path)->Result<(),String>{
    let src=cache.join("reporting");if !src.exists(){return Ok(())}
    let dst=output.join("reporting");fs::create_dir_all(&dst).map_err(|e|e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e|e.to_string())?{
        let entry=entry.map_err(|e|e.to_string())?;if entry.file_type().map_err(|e|e.to_string())?.is_file(){
            fs::copy(entry.path(),dst.join(entry.file_name())).map_err(|e|e.to_string())?;
        }
    }
    Ok(())
}
struct NetworkExport{
    summary:Value,
    coverage:Value,
    channel_daily:Vec<Value>,
    videos:Vec<Value>,
    video_daily:Vec<Value>,
    lifecycle:Vec<Value>,
    traffic:Vec<Value>,
    breakdowns:Vec<Value>,
    retention:Vec<Value>,
    events:Vec<Value>,
    findings:Vec<Value>,
}
async fn collect_channel(app:&AppHandle,client:&reqwest::Client,choice:&AiChannelChoice,request:&AiExportRequest,cache:&Path,
    run:&str,index:usize,total:usize)->Result<NetworkExport,String>{
    progress(app,run,index,total,choice,"OAuth","Проверка токена и владельца");
    let (token,scopes)=youtube::access_token_and_scopes(app,&choice.profile_id).await?;
    let has_analytics=scopes.iter().any(|x|x.ends_with("/yt-analytics.readonly")||x.ends_with("/yt-analytics-monetary.readonly"));
    let has_monetary=scopes.iter().any(|x|x.ends_with("/yt-analytics-monetary.readonly"));
    let mine=get_json(app,client,&token,&format!("{DATA_API}/channels"),
        &[("part","snippet,contentDetails,statistics".into()),("mine","true".into())],"channels.list").await?;
    let own=mine.get("items").and_then(Value::as_array).into_iter().flatten()
        .find(|x|x.get("id").and_then(Value::as_str)==Some(choice.channel_id.as_str()))
        .ok_or("OAuth-профиль не соответствует выбранному каналу; экспорт заблокирован")?;
    let cid=text(own.get("id"));
    let snippet=own.get("snippet").cloned().unwrap_or_else(||json!({}));
    let stat=own.get("statistics").cloned().unwrap_or_else(||json!({}));
    let created=text(snippet.get("publishedAt"));
    let playlist=text(own.pointer("/contentDetails/relatedPlaylists/uploads"));
    if playlist.is_empty(){return Err("YouTube не вернул плейлист загрузок".into())}
    let (start,end)=period_dates(request,Some(&created))?;
    let start_s=start.format("%Y-%m-%d").to_string();
    let end_s=end.format("%Y-%m-%d").to_string();
    let fetched_at=Utc::now().to_rfc3339();
    progress(app,run,index,total,choice,"INVENTORY","Все видео и метаданные");
    let videos=fetch_inventory(app,client,&token,&playlist,&cid,cache).await?;
    let inventory_coverage=read_json(&cache.join("inventory_coverage.json")).unwrap_or(Value::Null);
    let inventory_complete=inventory_coverage.get("complete").and_then(Value::as_bool)==Some(true);
    let mut events=observe_metadata(cache,&videos,&cid,inventory_complete)?;
    events.extend(local_vyron_upload_events(app,&cid));
    let ids=videos.iter().filter_map(|x|x.get("id").and_then(Value::as_str).map(str::to_string)).collect::<Vec<_>>();
    let mut coverage=json!({"channelId":cid,"periodStart":start_s,"periodEnd":end_s,"fetchedAt":fetched_at,
        "metadata":inventory_coverage,"daily":"unavailable","videoDaily":"unavailable",
        "traffic":"unavailable","retention":"unavailable","reach":"unavailable","errors":[]});
    let mut monetary=Value::Null;
    if has_monetary && has_analytics {
        // Monetary data is strictly optional and only exported when Google returns a report.
        match analytics(app,client,&token,cache,&start_s,&end_s,
            "views,estimatedRevenue","",None,"analytics.revenue").await{
            Ok(batch)=>{
                if let Some(row)=batch.first(){
                    let views=numeric(row.first());let revenue=numeric(row.get(1));
                    if let (Some(v),Some(m))=(views,revenue){
                        monetary=json!({"currency":"USD","estimatedRevenue":m,
                            "rpm":if v>0.0{Some(m/v*1000.0)}else{None},
                            "viewsUsedForRpm":v,"source":"youtube_analytics_api_v2",
                            "fetchedAt":fetched_at,"status":"reported"});
                    }
                }
            },
            Err(e)=>coverage["errors"].as_array_mut().unwrap().push(json!({"stage":"monetary","message":e})),
        }
    }
    coverage["monetary"]=json!({"authorized":has_monetary,"available":!monetary.is_null()});
    let mut channel_daily=Vec::new();let mut video_daily=Vec::new();
    let mut traffic=Vec::new();let mut breakdowns=Vec::new();let mut retention=Vec::new();
    if has_analytics{
        progress(app,run,index,total,choice,"CHANNEL_DAILY","История канала по дням");
        let mut failures=Vec::new();let mut successes=0usize;
        for (a,b) in window_dates(start,end,90) {
            match analytics(app,client,&token,cache,&a,&b,
                "views,estimatedMinutesWatched,subscribersGained,subscribersLost,averageViewDuration,averageViewPercentage,likes,comments,shares",
                "day",None,"analytics.channelDaily").await {
                Ok(batch)=>{successes+=1;for r in batch{
                    channel_daily.push(json!({"channelId":cid,"date":r.first(),"views":numeric(r.get(1)),
                    "watchMinutes":numeric(r.get(2)),"subscribersGained":numeric(r.get(3)),
                    "subscribersLost":numeric(r.get(4)),"averageViewDuration":numeric(r.get(5)),
                    "averageViewPercentage":numeric(r.get(6)),"likes":numeric(r.get(7)),"comments":numeric(r.get(8)),"shares":numeric(r.get(9)),"source":"youtube_analytics_api_v2",
                    "fetchedAt":fetched_at}));
                }},
                Err(e)=>{failures.push(format!("{a}..{b}: {e}"));},
            }
        }
        coverage["daily"]=json!(if failures.is_empty(){"available"}else if successes>0{"partial"}else{"unavailable"});
        for error in failures{coverage["errors"].as_array_mut().unwrap().push(json!({"stage":"channelDaily","message":error}));}
        progress(app,run,index,total,choice,"VIDEO_DAILY", &format!("Все видео: {}",ids.len()));
        let mut successes=0usize;let mut failures=0usize;
        for (a,b) in window_dates(start,end,60) {
            for ids_chunk in ids.chunks(25) {
                let filter=format!("video=={}",ids_chunk.join(","));
                match analytics(app,client,&token,cache,&a,&b,
                    "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares",
                    "day,video",Some(filter),"analytics.videoDaily").await{
                    Ok(batch)=>{successes+=1;for r in batch{
                        video_daily.push(json!({"channelId":cid,"date":r.first(),"videoId":r.get(1),
                            "views":numeric(r.get(2)),"watchMinutes":numeric(r.get(3)),
                            "averageViewDuration":numeric(r.get(4)),"averageViewPercentage":numeric(r.get(5)),
                            "subscribersGained":numeric(r.get(6)),"subscribersLost":numeric(r.get(7)),
                            "likes":numeric(r.get(8)),"comments":numeric(r.get(9)),"shares":numeric(r.get(10)),
                            "source":"youtube_analytics_api_v2","fetchedAt":fetched_at}));
                    }},
                    Err(e)=>{failures+=1;if failures<=15{coverage["errors"].as_array_mut().unwrap().push(json!({"stage":"videoDaily","range":[a,b],"message":e}));}},
                }
                if failures>0 && successes==0{break}
            }
            if failures>0 && successes==0{break}
        }
        coverage["videoDaily"]=json!(if failures==0{"available"}else if successes>0{"partial"}else{"unavailable"});
        if failures>15{coverage["errors"].as_array_mut().unwrap().push(json!({"stage":"videoDaily","additionalFailures":failures-15}));}
        progress(app,run,index,total,choice,"TRAFFIC","Источники просмотров");
        match analytics(app,client,&token,cache,&start_s,&end_s,"views,estimatedMinutesWatched","insightTrafficSourceType",None,"analytics.traffic").await{
            Ok(batch)=>{for r in batch{traffic.push(json!({"channelId":cid,"sourceType":r.first(),
                "views":numeric(r.get(1)),"watchMinutes":numeric(r.get(2)),"periodStart":start_s,
                "periodEnd":end_s,"source":"youtube_analytics_api_v2","fetchedAt":fetched_at}));}
                coverage["traffic"]=json!("available")},
            Err(e)=>{coverage["errors"].as_array_mut().unwrap().push(json!({"stage":"traffic","message":e}));},
        }
        // Additional audience breakdowns; kept separate from the traffic API table.
        for (dimension,label) in [("country","geography"),("deviceType","devices"),("subscribedStatus","audience"),("creatorContentType","format")]{
            match analytics(app,client,&token,cache,&start_s,&end_s,
                "views,estimatedMinutesWatched",dimension,None,&format!("analytics.{label}")).await {
                Ok(batch)=>{
                    breakdowns.push(json!({"channelId":cid,"dimension":dimension,
                        "periodStart":start_s,"periodEnd":end_s,
                        "rows":batch.iter().map(|r|json!({"key":r.first(),
                            "views":numeric(r.get(1)),"watchMinutes":numeric(r.get(2))})).collect::<Vec<_>>(),
                        "source":"youtube_analytics_api_v2","fetchedAt":fetched_at}));
                },
                Err(e)=>coverage["errors"].as_array_mut().unwrap().push(json!({"stage":label,"message":e})),
            }
        }
        coverage["audienceBreakdowns"]=json!(if breakdowns.len()==4{"available"}else if breakdowns.is_empty(){"unavailable"}else{"partial"});
        // Google's targeted viewer demographics report uses viewerPercentage,
        // not views. Preserve its denominator semantics; never relabel it views.
        let mut demographic_status=serde_json::Map::new();
        for (dimension,label) in [("ageGroup","age"),("gender","gender")]{
            match analytics(app,client,&token,cache,&start_s,&end_s,
                "viewerPercentage",dimension,None,&format!("analytics.demographics.{label}")).await{
                Ok(batch)=>{
                    let count=batch.len();
                    if count>0{
                        breakdowns.push(json!({"channelId":cid,"dimension":dimension,
                            "periodStart":start_s,"periodEnd":end_s,
                            "rows":batch.into_iter().map(|r|json!({"key":r.first(),
                                "viewerPercentage":numeric(r.get(1))})).collect::<Vec<_>>(),
                            "source":"youtube_analytics_api_v2","fetchedAt":fetched_at}));
                    }
                    demographic_status.insert(dimension.to_string(),json!(if count>0{"AVAILABLE"}else{"INSUFFICIENT_DATA"}));
                },
                Err(e)=>{
                    demographic_status.insert(dimension.to_string(),json!("ERROR"));
                    coverage["errors"].as_array_mut().unwrap().push(json!({"stage":label,"message":e}));
                }
            }
        }
        coverage["demographics"]=Value::Object(demographic_status);
        if request.include_retention.unwrap_or(false){
            progress(app,run,index,total,choice,"RETENTION","Кривые удержания доступных видео");
            let mut found=0usize;
            for (i,id) in ids.iter().enumerate(){
                let filters=format!("video=={id}");
                match analytics(app,client,&token,cache,&start_s,&end_s,
                    "audienceWatchRatio,relativeRetentionPerformance","elapsedVideoTimeRatio",Some(filters),"analytics.retention").await{
                    Ok(batch)=>{if !batch.is_empty(){found+=1;retention.push(json!({"videoId":id,"channelId":cid,
                        "points":batch,"source":"youtube_analytics_api_v2","fetchedAt":fetched_at}));}},
                    Err(e)=>{if i==0{coverage["errors"].as_array_mut().unwrap().push(json!({"stage":"retention","sampleError":e}));}},
                }
            }
            coverage["retention"]=json!(if found>0{"partial"}else{"unavailable"});
        }else{coverage["retention"]=json!("skipped_by_user");}
    }else{
        coverage["errors"].as_array_mut().unwrap().push(json!({"stage":"oauth","message":"YouTube Analytics readonly scope не предоставлен"}));
    }
    if request.include_reporting.unwrap_or(true){
        progress(app,run,index,total,choice,"REACH","YouTube Reporting API: показы и CTR");
        coverage["reach"]=collect_reporting(app,client,&token,cache).await;
    }else{coverage["reach"]=json!({"status":"skipped_by_user"});}
    let mut findings=change_findings(&cid,&channel_daily);
    for event in &mut findings{event["videoContributions"]=json!(contributions_for_window(event,&video_daily));}
    let lifecycle=video_lifecycle(&videos,&video_daily,&cid);
    let recent_begin=end-Days::days(27);
    let new_videos=videos.iter().filter(|v|v.pointer("/snippet/publishedAt").and_then(Value::as_str)
        .and_then(|s|s.get(..10)).and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok())
        .map(|d|d>=recent_begin&&d<=end).unwrap_or(false)).count();
    let summary=json!({"channelId":cid,"name":text(snippet.get("title")),
       "url":format!("https://www.youtube.com/channel/{cid}"),"createdAt":created,
       "subscribers":numeric(stat.get("subscriberCount")),"totalViews":numeric(stat.get("viewCount")),
       "totalPublishedVideos":numeric(stat.get("videoCount")),"exportedVideoRecords":videos.len(),"videosPublishedLast28Days":new_videos,
       "periodStart":start_s,"periodEnd":end_s,"fetchedAt":fetched_at,"source":"youtube_data_api_v3",
       "analyticsAuthorized":has_analytics,"monetaryAuthorized":has_monetary,"monetary":monetary,
       "country":snippet.get("country"),"language":snippet.get("defaultLanguage"),
       "vyronClassification":local_vyron_channel_labels(app,&cid)});
    Ok(NetworkExport{summary,coverage,channel_daily,videos,video_daily,lifecycle,traffic,breakdowns,retention,events,findings})
}
fn winner_engine(summaries:&[Value],findings:&[Value])->Value{
    let mut ranking=Vec::<Value>::new();
    for summary in summaries {
        let id=text(summary.get("channelId"));
        let event28=findings.iter().find(|e|e.get("channelId").and_then(Value::as_str)==Some(id.as_str())
          &&e.get("windowDays").and_then(Value::as_i64)==Some(28));
        let event7=findings.iter().find(|e|e.get("channelId").and_then(Value::as_str)==Some(id.as_str())
          &&e.get("windowDays").and_then(Value::as_i64)==Some(7));
        let growth28=event28.and_then(|e|numeric(e.get("changePercent")));
        let growth7=event7.and_then(|e|numeric(e.get("changePercent")));
        let views28=event28.and_then(|e|numeric(e.get("currentViews")));
        let video_count=numeric(summary.get("exportedVideoRecords"));
        let age=summary.get("createdAt").and_then(Value::as_str)
            .and_then(|s|s.get(..10)).and_then(|s|NaiveDate::parse_from_str(s,"%Y-%m-%d").ok())
            .map(|day|(Utc::now().date_naive()-day).num_days());
        let count=video_count.filter(|v|*v>0.0);
        ranking.push(json!({"channelId":id,"name":summary.get("name"),
          "ageDays":age,"publishedVideoRecords":video_count,
          "videosPublishedLast28Days":summary.get("videosPublishedLast28Days"),
          "genreAndLanguage":summary.get("vyronClassification"),
          "growth28Percent":growth28,"growth7Percent":growth7,
          "current28Views":views28,
          "viewsPerPublishedVideoIn28Days":match(views28,count){(Some(v),Some(n))=>Some(v/n),_=>None},
          "recoverySignal":growth7.zip(growth28).map(|(a,b)|a>0.0&&b<0.0),
          "rankingEligible":growth28.is_some(),
          "rank":Value::Null,
          "caveat":"Rank uses observed 28-day percentage growth only; compare channel age, uploads and views per video separately; not a causal score."}));
    }
    ranking.sort_by(|a,b|{
        let first=numeric(a.get("growth28Percent"));
        let second=numeric(b.get("growth28Percent"));
        second.is_some().cmp(&first.is_some()).then_with(||{
            second.unwrap_or(f64::NEG_INFINITY).partial_cmp(&first.unwrap_or(f64::NEG_INFINITY))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });
    let mut position=0usize;
    for item in &mut ranking {
        if item.get("rankingEligible").and_then(Value::as_bool)==Some(true){
            position+=1;item["rank"]=json!(position);
        }
    }
    json!({"status":"descriptive_comparison_only","methodology":"Comparable 28-day periods. Exclude missing, zero-baseline or incomplete windows from numeric rank. No invented causal explanation.",
          "createdAt":Utc::now().to_rfc3339(),"channels":ranking})
}
fn archive_files(base:&Path)->Result<Vec<PathBuf>,String>{
    fn walk(root:&Path,dir:&Path,out:&mut Vec<PathBuf>)->Result<(),String>{
        for entry in fs::read_dir(dir).map_err(|e|e.to_string())?{
            let entry=entry.map_err(|e|e.to_string())?;let p=entry.path();
            if p.is_dir(){walk(root,&p,out)?}else if p.is_file(){out.push(p)}
        }
        Ok(())
    }
    let mut files=Vec::new();walk(base,base,&mut files)?;files.sort();Ok(files)
}
fn build_zip(staging:&Path,output:&Path)->Result<(),String>{
    let tmp=output.with_extension("partial");
    let result=(||->Result<(),String>{
        let file=File::create(&tmp).map_err(|e|e.to_string())?;
        let mut zip=ZipWriter::new(file);
        let files=archive_files(staging)?;
        for path in &files{
            let name=path.strip_prefix(staging).map_err(|e|e.to_string())?.to_string_lossy().replace('\\',"/");
            if name.starts_with('.') || name.contains("/."){continue}
            zip.start_file(name,SimpleFileOptions::default().compression_method(CompressionMethod::Stored))
                .map_err(|e|e.to_string())?;
            let mut input=File::open(path).map_err(|e|e.to_string())?;
            io::copy(&mut input,&mut zip).map_err(|e|e.to_string())?;
        }
        zip.finish().map_err(|e|e.to_string())?.sync_all().map_err(|e|e.to_string())?;
        let mut archive=ZipArchive::new(File::open(&tmp).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        if archive.len()<12{return Err("ZIP verification: missing expected files".into())}
        for i in 0..archive.len(){
            let mut part=archive.by_index(i).map_err(|e|e.to_string())?;
            io::copy(&mut part,&mut io::sink()).map_err(|e|e.to_string())?;
        }
        fs::rename(&tmp,output).map_err(|e|e.to_string())?;
        Ok(())
    })();
    if result.is_err(){let _=fs::remove_file(&tmp);}
    result
}
fn file_hash(path:&Path)->Result<String,String>{
    let mut file=File::open(path).map_err(|e|e.to_string())?;
    let mut hasher=Sha256::new();let mut chunk=[0u8;65536];
    loop{let n=file.read(&mut chunk).map_err(|e|e.to_string())?;if n==0{break}hasher.update(&chunk[..n])}
    Ok(hex::encode(hasher.finalize()))
}
#[tauri::command]
pub async fn youtube_ai_export(app:AppHandle,request:AiExportRequest)->Result<Value,String>{
    let _run_guard=acquire_ai_run()?;
    #[cfg(not(target_os="macos"))]
    {let _=(app,request);return Err("Экспорт для ИИ доступен только в VYRON Mac".into());}
    #[cfg(target_os="macos")]
    {
        if request.channels.is_empty()||request.channels.len()>200{return Err("Выбери от 1 до 200 каналов".into())}
        if !["all","365","90","30","custom"].contains(&request.period.as_str()){return Err("Недопустимый период".into())}
        if request.period=="custom"{let _=period_dates(&request,None)?;}
        let mut unique=HashSet::new();
        for choice in &request.channels{
            if !unique.insert(choice.channel_id.clone()){return Err("Дублируется Channel ID".into())}
            if !is_safe_channel_id(&choice.channel_id)||choice.profile_id.is_empty(){
                return Err("Некорректная привязка YouTube канала".into())
            }
        }
        let destination=PathBuf::from(&request.destination);
        if !destination.is_dir(){return Err("Выбранная папка не существует".into())}
        let root=app.path().app_data_dir().map_err(|e|e.to_string())?.join("AIAnalytics");
        let cache_root=root.join("cache");fs::create_dir_all(&cache_root).map_err(|e|e.to_string())?;
        let run=Uuid::new_v4().to_string();let staging=root.join("staging").join(&run);
        fs::create_dir_all(staging.join("channels")).map_err(|e|e.to_string())?;
        let client=reqwest::Client::builder().timeout(Duration::from_secs(60)).build().map_err(|e|e.to_string())?;
        let mut summary=Vec::new();let mut coverage=Vec::new();let mut all_events=Vec::new();
        let mut all_retention=Vec::new();let mut all_breakdowns=Vec::new();let mut findings=Vec::new();
        let mut channel_csv=csv_file(&staging.join("CHANNELS_DAILY.csv"),
            "channel_id,date,views,watch_minutes,subscribers_gained,subscribers_lost,average_view_duration,average_view_percentage,likes,comments,shares,source,fetched_at\n")?;
        let mut videos_csv=csv_file(&staging.join("ALL_VIDEOS.csv"),
            "channel_id,video_id,url,title,description,published_at,duration_iso,privacy,category_id,tags,views_public,likes_public,comments_public,source,fetched_at\n")?;
        let mut video_csv=csv_file(&staging.join("VIDEOS_DAILY.csv"),
            "channel_id,video_id,date,views,watch_minutes,average_view_duration,average_view_percentage,subscribers_gained,subscribers_lost,likes,comments,shares,source,fetched_at\n")?;
        let mut lifecycle_csv=csv_file(&staging.join("VIDEO_LIFECYCLE.csv"),
            "channel_id,video_id,published_at,first_24_hours,views_3_days,views_7_days,views_14_days,views_30_days,views_90_days,observed_days_3,observed_days_7,observed_days_14,observed_days_30,observed_days_90,alignment_caveat\n")?;
        let mut traffic_csv=csv_file(&staging.join("TRAFFIC_SOURCES.csv"),
            "channel_id,source_type,views,watch_minutes,start_date,end_date,source,fetched_at\n")?;
        let total=request.channels.len();
        for (i,choice) in request.channels.iter().enumerate(){
            let channel_cache=cache_root.join(&choice.channel_id);
            if let Err(e)=fs::create_dir_all(&channel_cache){coverage.push(json!({"channelId":choice.channel_id,"status":"error","reason":e.to_string()}));continue}
            let out_dir=staging.join("channels").join(&choice.channel_id);
            fs::create_dir_all(&out_dir).map_err(|e|e.to_string())?;
            match collect_channel(&app,&client,choice,&request,&channel_cache,&run,i,total).await{
                Ok(r)=>{
                    if let Err(e)=crate::analytics360_cache::persist(&channel_cache,
                        &r.summary,&r.coverage,&r.channel_daily,&r.videos,&r.video_daily,
                        &r.traffic,&r.breakdowns,&r.retention,&r.events,&r.findings){
                        coverage.push(json!({"channelId":choice.channel_id,"name":choice.name,
                            "status":"error","stage":"analytics360_cache","reason":e}));
                        progress(&app,&run,i+1,total,choice,"ERROR","Не удалось сохранить Analytics 360");
                        continue
                    }

                    save_json(&out_dir.join("channel.json"),&r.summary)?;
                    save_json(&out_dir.join("coverage.json"),&r.coverage)?;
                    save_json(&out_dir.join("videos.json"),&json!(r.videos))?;
                    save_json(&out_dir.join("channel_daily.json"),&json!(r.channel_daily))?;
                    save_json(&out_dir.join("videos_daily.json"),&json!(r.video_daily))?;
                    save_json(&out_dir.join("video_lifecycle.json"),&json!(r.lifecycle))?;
                    save_json(&out_dir.join("traffic.json"),&json!(r.traffic))?;
                    save_json(&out_dir.join("audience_breakdowns.json"),&json!(r.breakdowns))?;
                    save_json(&out_dir.join("retention.json"),&json!(r.retention))?;
                    save_json(&out_dir.join("events.json"),&json!(r.events))?;
                    save_json(&out_dir.join("findings.json"),&json!(r.findings))?;
                    copy_reporting(&channel_cache,&out_dir)?;
                    for v in &r.channel_daily {append_csv(&mut channel_csv,&["channelId","date","views","watchMinutes","subscribersGained","subscribersLost","averageViewDuration","averageViewPercentage","likes","comments","shares","source","fetchedAt"].iter().map(|k|vstr(&v[*k])).collect::<Vec<_>>())?}
                    for v in &r.videos{
                        let id=text(v.get("id"));let tags=v.pointer("/snippet/tags").map(|x|x.to_string()).unwrap_or_default();
                        append_csv(&mut videos_csv,&[choice.channel_id.clone(),id.clone(),format!("https://www.youtube.com/watch?v={id}"),
                            text(v.pointer("/snippet/title")),text(v.pointer("/snippet/description")),
                            text(v.pointer("/snippet/publishedAt")),text(v.pointer("/contentDetails/duration")),
                            text(v.pointer("/status/privacyStatus")),text(v.pointer("/snippet/categoryId")),tags,
                            text(v.pointer("/statistics/viewCount")),text(v.pointer("/statistics/likeCount")),
                            text(v.pointer("/statistics/commentCount")),"youtube_data_api_v3".into(),Utc::now().to_rfc3339()])?;
                    }
                    for v in &r.video_daily{append_csv(&mut video_csv,&["channelId","videoId","date","views","watchMinutes","averageViewDuration","averageViewPercentage","subscribersGained","subscribersLost","likes","comments","shares","source","fetchedAt"].iter().map(|k|vstr(&v[*k])).collect::<Vec<_>>())?}
                    for v in &r.lifecycle {
                        let fields=vec![vstr(&v["channelId"]),vstr(&v["videoId"]),vstr(&v["publishedAt"]),
                            String::new(),vstr(&v["ageWindowsCalendarDays"]["days3"]["views"]),
                            vstr(&v["ageWindowsCalendarDays"]["days7"]["views"]),
                            vstr(&v["ageWindowsCalendarDays"]["days14"]["views"]),
                            vstr(&v["ageWindowsCalendarDays"]["days30"]["views"]),
                            vstr(&v["ageWindowsCalendarDays"]["days90"]["views"]),
                            vstr(&v["ageWindowsCalendarDays"]["days3"]["observedDays"]),
                            vstr(&v["ageWindowsCalendarDays"]["days7"]["observedDays"]),
                            vstr(&v["ageWindowsCalendarDays"]["days14"]["observedDays"]),
                            vstr(&v["ageWindowsCalendarDays"]["days30"]["observedDays"]),
                            vstr(&v["ageWindowsCalendarDays"]["days90"]["observedDays"]),
                            vstr(&v["caveat"])];
                        append_csv(&mut lifecycle_csv,&fields)?;
                    }
                    for v in &r.traffic{append_csv(&mut traffic_csv,&["channelId","sourceType","views","watchMinutes","periodStart","periodEnd","source","fetchedAt"].iter().map(|k|vstr(&v[*k])).collect::<Vec<_>>())?}
                    summary.push(r.summary);coverage.push(r.coverage);
                    all_events.extend(r.events);all_retention.extend(r.retention);all_breakdowns.extend(r.breakdowns);findings.extend(r.findings);
                    progress(&app,&run,i+1,total,choice,"DONE","Данные сохранены в архиве");
                }
                Err(e)=>{
                    coverage.push(json!({"channelId":choice.channel_id,"name":choice.name,
                        "status":"error","reason":e,"fetchedAt":Utc::now().to_rfc3339()}));
                    progress(&app,&run,i+1,total,choice,"ERROR","Канал пропущен; остальные продолжают экспорт");
                }
            }
        }
        drop(channel_csv);drop(videos_csv);drop(video_csv);drop(lifecycle_csv);drop(traffic_csv);
        save_json(&staging.join("ALL_CHANNELS_SUMMARY.json"),&json!(summary))?;
        save_json(&staging.join("DATA_COVERAGE.json"),&json!(coverage))?;
        save_json(&staging.join("RETENTION.json"),&json!(all_retention))?;
        save_json(&staging.join("AUDIENCE_BREAKDOWNS.json"),&json!(all_breakdowns))?;
        save_json(&staging.join("CHANNEL_EVENTS.json"),&json!(all_events))?;
        save_json(&staging.join("GROWTH_AND_DECLINE.json"),&json!(findings))?;
        save_json(&staging.join("WINNER_ENGINE.json"),&winner_engine(&summary,&findings))?;
        let success=summary.len();
        let info=format!("# VYRON AI export\n\nЭкспорт: {}\nКаналов выбрано: {}. Успешно: {}.\n\nИсточники: YouTube Data API v3, YouTube Analytics API v2, YouTube Reporting API v1 (если отчёты доступны).\n\nДаты Analytics: по тихоокеанскому времени YouTube; дата публикации видео — UTC.\nОтсутствующие метрики представлены null/пустым полем; отсутствие строки не равно нулю.\n\nПервые 24 часа нельзя точно восстановить из дневных отчётов. VIDEO_LIFECYCLE.csv содержит приблизительные окна по календарным дням (UTC дата публикации, YouTube Analytics Pacific); при неполных днях числовое значение оставлено пустым.\nCTR и показы поступают из Reporting API, только после генерации и в пределах его доступной истории. Сырые reach CSV размещены в папке канала/reporting.\nИстория названий/описаний/приватности фиксируется только с момента первой синхронизации VYRON. Дата фактического изменения неизвестна.\nНеизвестные причины роста никогда не считаются доказательством.\n\nCSV кодировка UTF-8, JSON и Markdown в корне. Данные каждого канала — channels/<channel_id>/.\n\nПолнота и ошибки: DATA_COVERAGE.json. Никакие OAuth токены и пароли не экспортируются.\n",Utc::now().to_rfc3339(),total,success);
        write_document(&staging.join("AI_README.md"),&info)?;
        write_document(&staging.join("AI_PROMPT.md"),"Проанализируй ВСЕ каналы VYRON по данным архива. Сначала прочитай AI_README.md и DATA_COVERAGE.json. Не трактуй пустое значение как ноль. Сравни изменения просмотров за 7/28 дней, показатели одинакового возраста роликов, watch time с учётом длительности музыкальных видео, потери подписчиков, источники трафика. Используй видео из ALL_VIDEOS.csv, VIDEOS_DAILY.csv и VIDEO_LIFECYCLE.csv без ограничения топ-100. Сформулируй гипотезы, не выдавай их за установленную причину, приведи даты и доказательные метрики. Раздели рекомендации на срочные действия, эксперименты и наблюдение. При недостатке данных явно напиши, что именно отсутствует.\n")?;
        let brief=format!("# Winner Engine input\n\nУспешных каналов: {} из {}.\nПроверенные события роста и падения: {}.\n\nСначала изучи WINNER_ENGINE.json, ALL_CHANNELS_SUMMARY.json, GROWTH_AND_DECLINE.json и DATA_COVERAGE.json. Для каждого сильного канала сверь возраст роликов, публикации, просмотры, удержание, источники трафика. Данные с низкой полнотой не ранжируй как слабый канал.\n",success,total,findings.len());
        write_document(&staging.join("RECOMMENDATIONS_INPUT.md"),&brief)?;
        let mut manifest=BTreeMap::new();
        for path in archive_files(&staging)?{
            let name=path.strip_prefix(&staging).unwrap().to_string_lossy().replace('\\',"/");
            manifest.insert(name,file_hash(&path)?);
        }
        save_json(&staging.join("MANIFEST_SHA256.json"),&json!(manifest))?;
        let output=destination.join(format!("VYRON_AI_ALL_CHANNELS_{}_{}.zip",Utc::now().format("%Y%m%d_%H%M%S"),&run[..8]));
        let stage=staging.clone();let out=output.clone();
        tauri::async_runtime::spawn_blocking(move||build_zip(&stage,&out))
            .await.map_err(|e|e.to_string())??;
        let _=fs::remove_dir_all(&staging);
        Ok(json!({"ok":true,"runId":run,"path":output.to_string_lossy(),"selected":total,
          "successful":success,"failed":total-success,"coverage":coverage,
          "zipSha256":file_hash(&output)?}))
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn csv_quote(){assert_eq!(csv_field("a,\"b\""),"\"a,\"\"b\"\"\"");}
    #[test] fn ranges(){let start=NaiveDate::from_ymd_opt(2026,1,1).unwrap();let end=NaiveDate::from_ymd_opt(2026,4,1).unwrap();
        let v=window_dates(start,end,90);assert_eq!(v.len(),2);assert_eq!(v[1].1,"2026-04-01");}
    #[test] fn baseline_zero_unknown(){assert!(percent_change(12.0,0.0).is_null());}
    #[test] fn channel_id_cannot_escape_cache_directory(){
       assert!(is_safe_channel_id("UC1234567890123456789012"));
       assert!(!is_safe_channel_id("UC../../../secrets"));
       assert!(!is_safe_channel_id("UCbad/path"));
    }
    #[test] fn lifecycle_missing_days_are_unknown(){
       let videos=vec![json!({"id":"video-1","snippet":{"publishedAt":"2026-01-01T21:00:00Z"}})];
       let rows=vec![json!({"videoId":"video-1","date":"2026-01-01","views":10})];
       let out=video_lifecycle(&videos,&rows,"channel-1");
       assert_eq!(out[0]["ageWindowsCalendarDays"]["days3"]["observedDays"],1);
       assert!(out[0]["ageWindowsCalendarDays"]["days3"]["views"].is_null());
       assert!(out[0]["first24HoursViews"].is_null());
    }
}


/// On-demand full-history sync populates the same per-channel Analytics 360 cache
/// without generating a ZIP. No upload or Google account reconnection is attempted.
#[tauri::command]
pub async fn youtube_ai_sync(app:AppHandle,request:AiExportRequest)->Result<Value,String>{
    #[cfg(not(target_os="macos"))]
    {let _=(app,request);return Err("Analytics 360 доступна только на macOS".into())}
    #[cfg(target_os="macos")]
    {
        let _run_guard=acquire_ai_run()?;
        if request.channels.is_empty()||request.channels.len()>100{
            return Err("Выберите от 1 до 100 каналов".into())
        }
        if !["all","365","90","30","custom"].contains(&request.period.as_str()){
            return Err("Недопустимый период".into())
        }
        let mut seen=HashSet::new();
        for c in &request.channels{
            if !is_safe_channel_id(&c.channel_id)||c.profile_id.is_empty()||!seen.insert(&c.channel_id){
                return Err("Некорректный или дублирующийся YouTube Channel ID".into())
            }
        }
        let root=app.path().app_data_dir().map_err(|e|e.to_string())?.join("AIAnalytics").join("cache");
        fs::create_dir_all(&root).map_err(|e|e.to_string())?;
        let client=reqwest::Client::builder().timeout(Duration::from_secs(60)).build().map_err(|e|e.to_string())?;
        let run=Uuid::new_v4().to_string();
        let total=request.channels.len();
        let mut completed=0usize;
        let mut errors=Vec::<Value>::new();
        for (i,c) in request.channels.iter().enumerate(){
            let folder=root.join(&c.channel_id);
            if let Err(e)=fs::create_dir_all(&folder){
                errors.push(json!({"channelId":c.channel_id,"error":e.to_string()}));continue
            }
            match collect_channel(&app,&client,c,&request,&folder,&run,i,total).await {
                Ok(r)=>{
                    match crate::analytics360_cache::persist(&folder,&r.summary,&r.coverage,
                        &r.channel_daily,&r.videos,&r.video_daily,&r.traffic,&r.breakdowns,
                        &r.retention,&r.events,&r.findings){
                        Ok(())=>{
                            completed+=1;
                            progress(&app,&run,i+1,total,c,"DONE","История канала доступна в Analytics 360");
                        },
                        Err(e)=>{
                            errors.push(json!({"channelId":c.channel_id,"error":e}));
                            progress(&app,&run,i+1,total,c,"ERROR","Не удалось сохранить историю");
                        }
                    }
                },
                Err(e)=>{
                    errors.push(json!({"channelId":c.channel_id,"error":e}));
                    progress(&app,&run,i+1,total,c,"ERROR","Ошибка синхронизации канала");
                }
            }
        }
        Ok(json!({"runId":run,"completed":completed,"total":total,
            "errors":errors,"status":if completed==total{"COMPLETE"}else{"PARTIAL"}}))
    }
}
