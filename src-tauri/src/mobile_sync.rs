use crate::security;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Manager};

const ENDPOINT: &str = "https://odlseljmogaguyqdlkyv.supabase.co/functions/v1/vyron-mobile-sync-ingest";
const WINDOWS_SESSION_ACCOUNT: &str = "license.session_token";
const SYNC_DEVICE_ACCOUNT: &str = "mobile_sync.device_token";
const MAX_QUEUE: usize = 10_000;
const MAX_BATCH: usize = 100;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueueItem {
    event: Value,
    attempts: u32,
    next_attempt_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SyncRuntimeStatus {
    last_success_at: Option<String>,
    last_error: Option<String>,
    last_server_time: Option<String>,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}
fn now_iso() -> String { chrono::Utc::now().to_rfc3339() }

fn sync_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("mobile-sync");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    security::private_permissions(&root)?;
    Ok(root)
}
fn queue_path(app: &AppHandle) -> Result<PathBuf, String> { Ok(sync_dir(app)?.join("outbox.json")) }
fn status_path(app: &AppHandle) -> Result<PathBuf, String> { Ok(sync_dir(app)?.join("status.json")) }

fn load_queue(app: &AppHandle) -> Result<Vec<QueueItem>, String> {
    let p = queue_path(app)?;
    if !p.exists() { return Ok(Vec::new()); }
    let bytes = fs::read(&p).map_err(|e| format!("MOBILE_SYNC_QUEUE_READ_FAILED: {e}"))?;
    serde_json::from_slice(&bytes).map_err(|e| format!("MOBILE_SYNC_QUEUE_PARSE_FAILED: {e}"))
}
fn save_queue(app: &AppHandle, rows: &[QueueItem]) -> Result<(), String> {
    let bytes = serde_json::to_vec(rows).map_err(|e| e.to_string())?;
    security::write_private_atomic(&queue_path(app)?, &bytes)
}
fn load_status(app: &AppHandle) -> SyncRuntimeStatus {
    status_path(app).ok().and_then(|p| fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}
fn save_status(app: &AppHandle, status: &SyncRuntimeStatus) {
    if let (Ok(path), Ok(bytes)) = (status_path(app), serde_json::to_vec(status)) {
        let _ = security::write_private_atomic(&path, &bytes);
    }
}

fn forbidden_key(key: &str) -> bool {
    let k = key.to_ascii_lowercase().replace('-', "").replace('_', "");
    [
        "accesstoken", "refreshtoken", "clientsecret", "clientidsecret", "oauthcredential",
        "keychain", "credentialmanager", "githubtoken", "authorization", "apikeysecret",
        "servicerole", "password", "privatekey"
    ].iter().any(|x| k.contains(x))
}
fn validate_sanitized(value: &Value) -> Result<(), String> {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                if forbidden_key(k) { return Err(format!("MOBILE_SYNC_SECRET_FIELD_BLOCKED:{k}")); }
                validate_sanitized(v)?;
            }
        }
        Value::Array(items) => for v in items { validate_sanitized(v)?; },
        Value::String(s) if s.len() > 20_000 => return Err("MOBILE_SYNC_STRING_TOO_LARGE".into()),
        _ => {}
    }
    Ok(())
}
fn event_id(value: &Value) -> Option<&str> {
    value.get("event_id").and_then(Value::as_str).filter(|x| !x.trim().is_empty())
}
fn backoff_ms(attempts: u32) -> i64 {
    let exp = 1_i64.checked_shl(attempts.min(8)).unwrap_or(256);
    (1_000 * exp).min(300_000)
}
fn bump(item: &mut QueueItem) {
    item.attempts = item.attempts.saturating_add(1);
    item.next_attempt_ms = now_ms() + backoff_ms(item.attempts);
}
fn due_prefix_indices(queue:&[QueueItem],now:i64)->Vec<usize>{
    queue.iter().enumerate()
        .take_while(|(_,x)|x.next_attempt_ms<=now)
        .take(MAX_BATCH)
        .map(|(i,_)|i)
        .collect()
}
fn auth_secret() -> Result<Option<(String, &'static str)>, String> {
    if let Some(token)=security::canonical_get_secret_cached(SYNC_DEVICE_ACCOUNT)?
        .filter(|x|!x.trim().is_empty()){
        return Ok(Some((token,"x-vyron-sync-device")))
    }
    #[cfg(target_os = "windows")]
    {
        return security::canonical_get_secret_cached(WINDOWS_SESSION_ACCOUNT)
            .map(|v| v.filter(|x| !x.trim().is_empty()).map(|x| (x, "x-vyron-session")));
    }
    #[cfg(not(target_os = "windows"))]
    { Ok(None) }
}

async fn flush_internal(app: &AppHandle) -> Value {
    let mut queue = match load_queue(app) {
        Ok(x) => x,
        Err(e) => return json!({"ok":false,"queued":0,"state":"queue_error","error":e}),
    };
    let auth = match auth_secret() {
        Ok(Some(x)) => x,
        Ok(None) => return json!({"ok":true,"queued":queue.len(),"state":"unpaired"}),
        Err(e) => return json!({"ok":true,"queued":queue.len(),"state":"secure_storage_unavailable","error":redact_error(&e)}),
    };
    if queue.is_empty() {
        let client=match reqwest::Client::builder().timeout(std::time::Duration::from_secs(4)).build(){
            Ok(x)=>x,
            Err(e)=>return json!({"ok":true,"queued":0,"state":"offline","error":format!("HTTP_CLIENT:{e}")}),
        };
        let response=client.post(ENDPOINT)
            .header(auth.1,auth.0)
            .json(&json!({"action":"heartbeat","app_version":app.package_info().version.to_string()}))
            .send().await;
        let mut status=load_status(app);
        match response{
            Ok(r) if r.status().is_success()=>{
                let value:Value=r.json().await.unwrap_or_else(|_|json!({}));
                status.last_success_at=Some(now_iso());
                status.last_server_time=value.get("serverTime").and_then(Value::as_str).map(str::to_string);
                status.last_error=None;save_status(app,&status);
                return json!({"ok":true,"queued":0,"state":"online","lastSuccessAt":status.last_success_at,"lastServerTime":status.last_server_time})
            }
            Ok(r)=>{
                status.last_error=Some(format!("HEARTBEAT_HTTP:{}",r.status().as_u16()));save_status(app,&status);
                return json!({"ok":true,"queued":0,"state":"offline","lastError":status.last_error})
            }
            Err(e)=>{
                status.last_error=Some(format!("HEARTBEAT_NETWORK:{}",redact_error(&e.to_string())));save_status(app,&status);
                return json!({"ok":true,"queued":0,"state":"offline","lastError":status.last_error})
            }
        }
    }
    let now = now_ms();
    let due=due_prefix_indices(&queue,now);
    if due.is_empty() {
        let s=load_status(app);
        return json!({"ok":true,"queued":queue.len(),"state":"backoff","lastSuccessAt":s.last_success_at,"lastError":s.last_error});
    }

    let events: Vec<Value> = due.iter().map(|i| queue[*i].event.clone()).collect();
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(4)).build() {
        Ok(x) => x,
        Err(e) => return json!({"ok":true,"queued":queue.len(),"state":"queued","error":format!("HTTP_CLIENT:{e}")}),
    };
    let response = client.post(ENDPOINT)
        .header(auth.1, auth.0)
        .json(&json!({"action":"ingest","app_version":app.package_info().version.to_string(),"events":events}))
        .send().await;

    let mut status = load_status(app);
    let response = match response {
        Ok(x) => x,
        Err(e) => {
            for i in due { if let Some(row)=queue.get_mut(i){ bump(row); } }
            status.last_error=Some(format!("NETWORK:{}", redact_error(&e.to_string())));
            save_status(app,&status); let _=save_queue(app,&queue);
            return json!({"ok":true,"queued":queue.len(),"state":"queued","lastError":status.last_error});
        }
    };
    let http_status=response.status();
    let value: Value = match response.json().await {
        Ok(x)=>x,
        Err(e)=>{
            for i in due { if let Some(row)=queue.get_mut(i){ bump(row); } }
            status.last_error=Some(format!("RESPONSE:{}",redact_error(&e.to_string())));
            save_status(app,&status);let _=save_queue(app,&queue);
            return json!({"ok":true,"queued":queue.len(),"state":"queued","lastError":status.last_error});
        }
    };
    if !http_status.is_success() {
        for i in due { if let Some(row)=queue.get_mut(i){ bump(row); } }
        let code=value.get("code").and_then(Value::as_str).unwrap_or("http_error");
        status.last_error=Some(format!("SERVER:{}:{}",http_status.as_u16(),code));
        save_status(app,&status);let _=save_queue(app,&queue);
        return json!({"ok":true,"queued":queue.len(),"state":if http_status.as_u16()==401{"auth_required"}else{"queued"},"lastError":status.last_error});
    }

    let mut successful=std::collections::HashSet::<String>::new();
    let mut permanent=std::collections::HashSet::<String>::new();
    let mut retryable_failed:Option<String>=None;
    let mut permanent_code:Option<String>=None;
    if let Some(results)=value.get("results").and_then(Value::as_array) {
        for result in results {
            let id=result.get("eventId").and_then(Value::as_str).unwrap_or("");
            if id.is_empty(){continue}
            if result.get("ok").and_then(Value::as_bool)==Some(true) {
                successful.insert(id.to_string());
            } else if result.get("retryable").and_then(Value::as_bool)==Some(false) {
                permanent.insert(id.to_string());
                permanent_code=result.get("code").and_then(Value::as_str).map(str::to_string);
            } else {
                retryable_failed=Some(id.to_string());
                break;
            }
        }
    }
    if let Some(failed_id)=retryable_failed.as_deref() {
        if let Some(i)=due.iter().copied().find(|i|event_id(&queue[*i].event)==Some(failed_id)){
            if let Some(row)=queue.get_mut(i){bump(row)}
        }
    }
    queue.retain(|x|{
        let id=event_id(&x.event).unwrap_or("");
        !successful.contains(id)&&!permanent.contains(id)
    });
    status.last_server_time=value.get("serverTime").and_then(Value::as_str).map(str::to_string);
    if let Some(code)=permanent_code {
        status.last_error=Some(format!("PERMANENT_EVENT_REJECTED:{code}"));
    } else if retryable_failed.is_some() {
        status.last_error=Some("RETRYABLE_EVENT_APPLY_FAILED".into());
    } else if !successful.is_empty() {
        status.last_success_at=Some(now_iso());
        status.last_error=None;
    }
    save_status(app,&status);
    let _=save_queue(app,&queue);
    json!({"ok":true,"queued":queue.len(),"state":if queue.is_empty(){"online"}else{"queued"},"accepted":successful.len(),"lastSuccessAt":status.last_success_at,"lastServerTime":status.last_server_time})
}

fn redact_error(raw:&str)->String{
    let mut s=raw.replace('\n'," ");
    if s.len()>300{s.truncate(300)}
    s
}


fn sync_device_id(app:&AppHandle)->Result<String,String>{
    let p=sync_dir(app)?.join("device-id");
    if let Ok(v)=fs::read_to_string(&p){
        let v=v.trim();
        if !v.is_empty(){return Ok(v.to_string())}
    }
    let id=uuid::Uuid::new_v4().to_string();
    security::write_private_atomic(&p,id.as_bytes())?;
    Ok(id)
}
fn platform_name()->&'static str{
    #[cfg(target_os="macos")] { return "macos"; }
    #[cfg(target_os="windows")] { return "windows"; }
    #[cfg(not(any(target_os="macos",target_os="windows")))] { return "unknown"; }
}
fn device_name()->String{
    std::env::var("COMPUTERNAME").or_else(|_|std::env::var("HOSTNAME")).unwrap_or_else(|_|"VYRON Desktop".into())
}

#[tauri::command]
pub async fn mobile_sync_claim_pairing(app:AppHandle,pairing_code:String)->Result<Value,String>{
    let code=pairing_code.trim().to_ascii_uppercase();
    if code.len()<10||code.len()>16{return Err("MOBILE_SYNC_PAIRING_CODE_FORMAT".into())}
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(8)).build().map_err(|e|format!("MOBILE_SYNC_PAIRING_HTTP:{e}"))?;
    let response=client.post(ENDPOINT).json(&json!({
        "action":"claim_pairing_code",
        "pairing_code":code,
        "device_id":sync_device_id(&app)?,
        "name":device_name(),
        "platform":platform_name(),
        "architecture":std::env::consts::ARCH,
        "app_version":app.package_info().version.to_string()
    })).send().await.map_err(|e|format!("MOBILE_SYNC_PAIRING_NETWORK:{}",redact_error(&e.to_string())))?;
    let status=response.status();
    let value:Value=response.json().await.map_err(|e|format!("MOBILE_SYNC_PAIRING_RESPONSE:{}",redact_error(&e.to_string())))?;
    if !status.is_success()||value.get("ok").and_then(Value::as_bool)!=Some(true){
        let code=value.get("code").and_then(Value::as_str).unwrap_or("pairing_failed");
        return Err(format!("MOBILE_SYNC_PAIRING_FAILED:{code}"))
    }
    let token=value.get("syncDeviceToken").and_then(Value::as_str).ok_or_else(||"MOBILE_SYNC_PAIRING_TOKEN_MISSING".to_string())?;
    security::canonical_set_secret(SYNC_DEVICE_ACCOUNT,token)?;
    security::invalidate_secret_cache(SYNC_DEVICE_ACCOUNT);
    let initial_sync=flush_internal(&app).await;
    Ok(json!({"ok":true,"paired":true,"deviceId":value.get("deviceId").cloned().unwrap_or(Value::Null),"initialSync":initial_sync}))
}

#[tauri::command]
pub async fn mobile_sync_enqueue(app: AppHandle, events: Vec<Value>) -> Value {
    if events.is_empty() { return flush_internal(&app).await; }
    let mut queue=match load_queue(&app){Ok(x)=>x,Err(e)=>return json!({"ok":false,"state":"queue_error","error":e})};
    let existing:std::collections::HashSet<String>=queue.iter().filter_map(|x|event_id(&x.event).map(str::to_string)).collect();
    for mut event in events.into_iter().take(MAX_BATCH) {
        if let Err(e)=validate_sanitized(&event){return json!({"ok":false,"state":"blocked","error":e})}
        if event_id(&event).is_none() {
            if let Some(obj)=event.as_object_mut(){obj.insert("event_id".into(),json!(uuid::Uuid::new_v4().to_string()));}
        }
        let id=event_id(&event).unwrap_or("").to_string();
        if existing.contains(&id)||queue.iter().any(|x|event_id(&x.event)==Some(id.as_str())){continue}
        if queue.len()>=MAX_QUEUE{break}
        queue.push(QueueItem{event,attempts:0,next_attempt_ms:0});
    }
    if let Err(e)=save_queue(&app,&queue){return json!({"ok":false,"state":"queue_error","error":e})}
    flush_internal(&app).await
}

#[tauri::command]
pub async fn mobile_sync_flush(app: AppHandle) -> Value { flush_internal(&app).await }

#[tauri::command]
pub fn mobile_sync_status(app: AppHandle) -> Value {
    let queued=load_queue(&app).map(|x|x.len()).unwrap_or(0);
    let s=load_status(&app);
    let paired=auth_secret().ok().flatten().is_some();
    json!({"ok":true,"queued":queued,"paired":paired,"lastSuccessAt":s.last_success_at,"lastError":s.last_error,"lastServerTime":s.last_server_time})
}

#[tauri::command]
pub fn mobile_sync_set_device_token(token:String) -> Result<Value,String> {
    let token=token.trim();
    if token.len()<24||token.len()>512{return Err("MOBILE_SYNC_DEVICE_TOKEN_FORMAT".into())}
    security::canonical_set_secret(SYNC_DEVICE_ACCOUNT,token)?;
    security::invalidate_secret_cache(SYNC_DEVICE_ACCOUNT);
    Ok(json!({"ok":true,"paired":true}))
}

#[tauri::command]
pub fn mobile_sync_clear_device_token() -> Result<Value,String> {
    security::canonical_delete_secret(SYNC_DEVICE_ACCOUNT)?;
    security::invalidate_secret_cache(SYNC_DEVICE_ACCOUNT);
    Ok(json!({"ok":true,"paired":false}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backoff_is_bounded(){
        assert_eq!(backoff_ms(0),1_000);
        assert!(backoff_ms(4)>=16_000);
        assert_eq!(backoff_ms(99),256_000);
    }
    #[test]
    fn secret_fields_are_rejected(){
        assert!(validate_sanitized(&json!({"payload":{"refresh_token":"nope"}})).is_err());
        assert!(validate_sanitized(&json!({"payload":{"youtube_channel_id":"UC123","views":4}})).is_ok());
    }
    #[test]
    fn reconnect_flush_never_skips_backoff_head(){
        let item=|id:&str,next:i64|QueueItem{
            event:json!({"event_id":id}),
            attempts:0,
            next_attempt_ms:next,
        };
        let queue=vec![item("00000000-0000-4000-a000-000000000001",0),item("00000000-0000-4000-a000-000000000002",5000),item("00000000-0000-4000-a000-000000000003",0)];
        assert_eq!(due_prefix_indices(&queue,1000),vec![0]);
        assert_eq!(due_prefix_indices(&queue,6000),vec![0,1,2]);
    }
}
