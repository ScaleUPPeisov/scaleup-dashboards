use crate::security;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const OWNER_HASH: &str = "4b5631d4a5b7018be7c5237994ad4ba463a4fc1df33165beab0fedc901733ef9";
const WINDOWS_LICENSE_API: &str = "https://odlseljmogaguyqdlkyv.supabase.co/functions/v1/vyron-client-api";
const WINDOWS_SESSION_ACCOUNT: &str = "license.session_token";
const OFFLINE_GRACE_SECONDS: i64 = 72 * 60 * 60;

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WindowsLicenseCache {
    valid: bool,
    license_id: String,
    user_id: String,
    license_status: String,
    plan: String,
    owner: bool,
    expires_at: Option<String>,
    device_id: String,
    device_status: String,
    masked_key: String,
    activated_at: String,
    last_validated_at: String,
    session_expires_at: Option<String>,
}

fn root_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}
fn legacy_file(app: &AppHandle) -> Result<PathBuf, String> { Ok(root_dir(app)?.join("license.json")) }
fn windows_cache_file(app: &AppHandle) -> Result<PathBuf, String> { Ok(root_dir(app)?.join("license-windows.json")) }
fn device_file(app: &AppHandle) -> Result<PathBuf, String> { Ok(root_dir(app)?.join("device-id")) }

fn mask(key: &str) -> String {
    let normalized = key.trim().to_ascii_uppercase();
    let last = normalized.rsplit('-').next().unwrap_or("");
    if normalized.starts_with("VYRON-") && last.len() == 4 {
        format!("VYRON-****-****-****-{last}")
    } else if normalized.chars().count() >= 9 {
        let a: String = normalized.chars().take(4).collect();
        let b: String = normalized.chars().rev().take(4).collect::<String>().chars().rev().collect();
        format!("{a}••••{b}")
    } else {
        "••••".into()
    }
}

fn read_windows_cache(app: &AppHandle) -> Result<Option<WindowsLicenseCache>, String> {
    let p = windows_cache_file(app)?;
    if !p.exists() { return Ok(None); }
    let bytes = fs::read(&p).map_err(|e| format!("LICENSE_CACHE_READ_FAILED: {e}"))?;
    serde_json::from_slice(&bytes).map(Some).map_err(|e| format!("LICENSE_CACHE_PARSE_FAILED: {e}"))
}
fn write_windows_cache(app: &AppHandle, cache: &WindowsLicenseCache) -> Result<(), String> {
    let p = windows_cache_file(app)?;
    let bytes = serde_json::to_vec_pretty(cache).map_err(|e| e.to_string())?;
    security::write_private_atomic(&p, &bytes)
}
fn device_id(app: &AppHandle) -> Result<String, String> {
    let p = device_file(app)?;
    if let Ok(v) = fs::read_to_string(&p) {
        let v = v.trim();
        if !v.is_empty() { return Ok(v.to_string()); }
    }
    let id = uuid::Uuid::new_v4().to_string();
    security::write_private_atomic(&p, id.as_bytes())?;
    Ok(id)
}
fn parse_time(v: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(v).ok().map(|x| x.with_timezone(&chrono::Utc))
}
fn within_grace(cache: &WindowsLicenseCache) -> bool {
    parse_time(&cache.last_validated_at)
        .map(|t| chrono::Utc::now().signed_duration_since(t).num_seconds() <= OFFLINE_GRACE_SECONDS)
        .unwrap_or(false)
}
fn cache_public(cache: &WindowsLicenseCache, offline_grace: bool) -> Value {
    json!({
        "valid": cache.valid,
        "type": if cache.owner { "owner-lifetime" } else { "managed" },
        "expiresAt": cache.expires_at,
        "maskedKey": cache.masked_key,
        "licenseId": cache.license_id,
        "userId": cache.user_id,
        "licenseStatus": cache.license_status,
        "deviceId": cache.device_id,
        "deviceStatus": cache.device_status,
        "lastValidatedAt": cache.last_validated_at,
        "offlineGrace": offline_grace
    })
}
fn license_message(code: &str) -> &'static str {
    match code {
        "key_format" => "Неверный формат ключа VYRON.",
        "key_invalid" => "Ключ VYRON не найден.",
        "license_paused" => "Лицензия VYRON отключена владельцем.",
        "license_revoked" => "Лицензия VYRON отозвана владельцем.",
        "license_expired" => "Срок действия лицензии VYRON истёк.",
        "device_limit" => "Достигнут лимит устройств для этой лицензии.",
        "device_blocked" => "Это устройство заблокировано владельцем лицензии.",
        "session_expired" | "session_invalid" | "session_missing" => "Сессия лицензии истекла. Введите ключ VYRON повторно.",
        _ => "Не удалось проверить лицензию VYRON."
    }
}

#[cfg(target_os = "windows")]
async fn post_license(action: &str, session: Option<&str>, body: Value) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("LICENSE_HTTP_CLIENT_FAILED: {e}"))?;
    let mut payload = body;
    if let Some(o) = payload.as_object_mut() { o.insert("action".into(), json!(action)); }
    let mut req = client.post(WINDOWS_LICENSE_API).json(&payload);
    if let Some(token) = session { req = req.header("x-vyron-session", token); }
    let response = req.send().await.map_err(|e| format!("LICENSE_SERVER_UNREACHABLE: {e}"))?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|e| format!("LICENSE_RESPONSE_INVALID: {e}"))?;
    if !status.is_success() || value.get("ok").and_then(Value::as_bool) == Some(false) {
        let code = value.get("code").and_then(Value::as_str).unwrap_or("license_error");
        return Err(format!("{code}: {}", license_message(code)));
    }
    Ok(value)
}

#[cfg(target_os = "windows")]
fn cache_from_response(existing_mask: String, value: &Value) -> WindowsLicenseCache {
    let now = chrono::Utc::now().to_rfc3339();
    WindowsLicenseCache {
        valid: value.get("allowed").and_then(Value::as_bool).unwrap_or(false),
        license_id: value.get("licenseId").and_then(Value::as_str).unwrap_or("").to_string(),
        user_id: value.get("userId").and_then(Value::as_str).unwrap_or("").to_string(),
        license_status: value.get("licenseStatus").and_then(Value::as_str).unwrap_or("unknown").to_string(),
        plan: value.get("plan").and_then(Value::as_str).unwrap_or("managed").to_string(),
        owner: value.get("owner").and_then(Value::as_bool).unwrap_or(false),
        expires_at: value.get("expiresAt").and_then(Value::as_str).map(str::to_string),
        device_id: value.get("deviceId").and_then(Value::as_str).unwrap_or("").to_string(),
        device_status: value.get("deviceStatus").and_then(Value::as_str).unwrap_or("unknown").to_string(),
        masked_key: existing_mask,
        activated_at: now.clone(),
        last_validated_at: now,
        session_expires_at: value.get("sessionExpiresAt").and_then(Value::as_str).map(str::to_string),
    }
}

pub fn active_user_id(app: &AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return Ok(read_windows_cache(app)?.and_then(|x| (!x.user_id.trim().is_empty()).then_some(x.user_id)));
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = app; Ok(None) }
}

pub fn private_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = root_dir(app)?;
    #[cfg(target_os = "windows")]
    {
        let user = active_user_id(app)?.ok_or_else(|| "LICENSE_REQUIRED: VYRON license is not active".to_string())?;
        let d = root.join("users").join(user);
        fs::create_dir_all(&d).map_err(|e| e.to_string())?;
        return Ok(d);
    }
    #[cfg(not(target_os = "windows"))]
    { Ok(root) }
}

#[tauri::command]
pub async fn license_status(app: AppHandle) -> Value {
    #[cfg(target_os = "windows")]
    {
        let Some(mut cache) = read_windows_cache(&app).ok().flatten() else { return json!({"valid":false}); };
        let session = match security::canonical_get_secret_cached(WINDOWS_SESSION_ACCOUNT) {
            Ok(Some(x)) if !x.trim().is_empty() => x,
            _ => return json!({"valid":false,"reason":"session_missing","userId":cache.user_id}),
        };
        match post_license("status", Some(&session), json!({"app_version": app.package_info().version.to_string()})).await {
            Ok(value) => {
                let activated = cache.activated_at.clone();
                cache = cache_from_response(cache.masked_key.clone(), &value);
                cache.activated_at = activated;
                let _ = write_windows_cache(&app, &cache);
                cache_public(&cache, false)
            }
            Err(e) if e.starts_with("LICENSE_SERVER_UNREACHABLE:") && cache.valid && within_grace(&cache) => cache_public(&cache, true),
            Err(e) => {
                cache.valid = false;
                if e.starts_with("license_paused:") { cache.license_status = "paused".into(); }
                if e.starts_with("license_revoked:") { cache.license_status = "revoked".into(); }
                if e.starts_with("license_expired:") { cache.license_status = "expired".into(); }
                let _ = write_windows_cache(&app, &cache);
                json!({"valid":false,"reason":e,"userId":cache.user_id,"licenseId":cache.license_id,"licenseStatus":cache.license_status})
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        legacy_file(&app).ok().and_then(|p| fs::read(p).ok()).and_then(|b| serde_json::from_slice::<Value>(&b).ok()).unwrap_or(json!({"valid":false}))
    }
}

#[tauri::command]
pub async fn activate_license(app: AppHandle, key: String) -> Result<Value, String> {
    let key = key.trim();
    if key.is_empty() { return Err("Введите ключ VYRON".into()); }
    #[cfg(target_os = "windows")]
    {
        let device = device_id(&app)?;
        let value = post_license("activate", None, json!({
            "key": key,
            "device_id": device,
            "platform": "windows",
            "architecture": std::env::consts::ARCH,
            "app_version": app.package_info().version.to_string(),
            "device_name": std::env::var("COMPUTERNAME").unwrap_or_default()
        })).await?;
        let session = value.get("sessionToken").and_then(Value::as_str).ok_or_else(|| "LICENSE_SESSION_MISSING".to_string())?;
        security::canonical_set_secret(WINDOWS_SESSION_ACCOUNT, session)?;
        let cache = cache_from_response(mask(key), &value);
        write_windows_cache(&app, &cache)?;
        return Ok(cache_public(&cache, false));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let digest = hex::encode(Sha256::digest(key.as_bytes()));
        if digest != OWNER_HASH { return Err("Ключ не найден. Используй тот же ключ владельца, что и в ENDLUME Studio.".into()); }
        let v = json!({"valid":true,"type":"owner-lifetime","expiresAt":null,"maskedKey":mask(key),"activatedAt":chrono::Utc::now()});
        let p = legacy_file(&app)?;
        let tmp = p.with_extension("tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        if p.exists() { let _ = fs::remove_file(&p); }
        fs::rename(tmp, p).map_err(|e| e.to_string())?;
        Ok(v)
    }
}
