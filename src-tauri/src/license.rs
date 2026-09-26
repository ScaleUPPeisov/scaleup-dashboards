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
fn offline_grace_eligible_at(cache: &WindowsLicenseCache, now: chrono::DateTime<chrono::Utc>) -> bool {
    if !cache.valid
        || !cache.license_status.eq_ignore_ascii_case("active")
        || !cache.device_status.eq_ignore_ascii_case("active")
    {
        return false;
    }
    let Some(last) = parse_time(&cache.last_validated_at) else { return false; };
    let age = now.signed_duration_since(last).num_seconds();
    if !(0..=OFFLINE_GRACE_SECONDS).contains(&age) {
        return false;
    }
    if let Some(raw_expires) = cache.expires_at.as_deref() {
        let Some(expires) = parse_time(raw_expires) else { return false; };
        if expires <= now {
            return false;
        }
    }
    // sessionExpiresAt is deliberately not a grace blocker: the 72h last-known-good
    // window exists to bridge temporary inability to refresh/validate the session.
    true
}
fn within_grace(cache: &WindowsLicenseCache) -> bool {
    offline_grace_eligible_at(cache, chrono::Utc::now())
}

fn authoritative_denial_code(code: &str) -> bool {
    matches!(
        code,
        "license_paused"
            | "license_revoked"
            | "license_expired"
            | "device_blocked"
            | "device_limit"
            | "session_invalid"
            | "session_expired"
            | "session_missing"
    )
}
fn authoritative_denial_error(error: &str) -> bool {
    error.split(':').next().map(authoritative_denial_code).unwrap_or(false)
}
fn transient_license_error(error: &str) -> bool {
    error.starts_with("LICENSE_TRANSIENT:") || error.starts_with("LICENSE_REMOTE_ERROR:")
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
        .map_err(|e| format!("LICENSE_TRANSIENT: http client: {e}"))?;
    let mut payload = body;
    if let Some(o) = payload.as_object_mut() { o.insert("action".into(), json!(action)); }
    let mut req = client.post(WINDOWS_LICENSE_API).json(&payload);
    if let Some(token) = session { req = req.header("x-vyron-session", token); }
    let response = req
        .send()
        .await
        .map_err(|e| format!("LICENSE_TRANSIENT: network/tls/timeout: {e}"))?;
    let status = response.status();
    let body = response
        .bytes()
        .await
        .map_err(|e| format!("LICENSE_TRANSIENT: response body: {e}"))?;

    if status.is_server_error() {
        return Err(format!("LICENSE_TRANSIENT: HTTP {}", status.as_u16()));
    }

    let value: Value = serde_json::from_slice(&body)
        .map_err(|e| format!("LICENSE_TRANSIENT: invalid JSON response: {e}"))?;

    if !status.is_success() || value.get("ok").and_then(Value::as_bool) == Some(false) {
        let code = value.get("code").and_then(Value::as_str).unwrap_or("license_error");
        if authoritative_denial_code(code) {
            return Err(format!("{code}: {}", license_message(code)));
        }
        // Unknown proxy/CDN/backend responses are not allowed to destroy last-known-good.
        return Err(format!("LICENSE_REMOTE_ERROR:{code}: {}", license_message(code)));
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
        let Some(mut cache) = read_windows_cache(&app).ok().flatten() else { security::set_active_tenant(None); return json!({"valid":false}); };
        security::set_active_tenant(Some(&cache.user_id));
        let session = match security::canonical_get_secret_cached(WINDOWS_SESSION_ACCOUNT) {
            Ok(Some(x)) if !x.trim().is_empty() => x,
            Ok(_) if within_grace(&cache) => {
                let mut public = cache_public(&cache, true);
                public["warning"] = json!("LICENSE_SESSION_LOCAL_MISSING: cached active license kept inside offline grace");
                return public;
            }
            Err(e) if within_grace(&cache) => {
                let mut public = cache_public(&cache, true);
                public["warning"] = json!(format!("LICENSE_SECURE_STORAGE_TRANSIENT: {e}"));
                return public;
            }
            Ok(_) => {
                return json!({"valid":false,"reason":"session_missing_local","userId":cache.user_id,"licenseId":cache.license_id,"licenseStatus":cache.license_status,"cachePreserved":true});
            }
            Err(e) => {
                return json!({"valid":false,"reason":format!("secure_storage_unavailable: {e}"),"userId":cache.user_id,"licenseId":cache.license_id,"licenseStatus":cache.license_status,"cachePreserved":true});
            }
        };
        match post_license("status", Some(&session), json!({"app_version": app.package_info().version.to_string()})).await {
            Ok(value) => {
                let activated = cache.activated_at.clone();
                cache = cache_from_response(cache.masked_key.clone(), &value);
                cache.activated_at = activated;
                let _ = write_windows_cache(&app, &cache);
                cache_public(&cache, false)
            }
            Err(e) if transient_license_error(&e) && within_grace(&cache) => {
                let mut public = cache_public(&cache, true);
                public["warning"] = json!(e);
                public
            }
            Err(e) if authoritative_denial_error(&e) => {
                cache.valid = false;
                if e.starts_with("license_paused:") { cache.license_status = "paused".into(); }
                if e.starts_with("license_revoked:") { cache.license_status = "revoked".into(); }
                if e.starts_with("license_expired:") { cache.license_status = "expired".into(); }
                if e.starts_with("device_blocked:") { cache.device_status = "blocked".into(); }
                let _ = write_windows_cache(&app, &cache);
                json!({"valid":false,"reason":e,"userId":cache.user_id,"licenseId":cache.license_id,"licenseStatus":cache.license_status})
            }
            Err(e) => {
                // Transient/unknown infrastructure errors outside grace may block this launch,
                // but they must never poison the last-known-good cache.
                json!({"valid":false,"reason":e,"userId":cache.user_id,"licenseId":cache.license_id,"licenseStatus":cache.license_status,"cachePreserved":true})
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
        security::set_active_tenant(Some(&cache.user_id));
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


#[cfg(test)]
mod v214_license_tests {
    use super::*;

    fn active_cache(now: chrono::DateTime<chrono::Utc>) -> WindowsLicenseCache {
        WindowsLicenseCache {
            valid: true,
            license_status: "active".into(),
            device_status: "active".into(),
            last_validated_at: now.to_rfc3339(),
            expires_at: Some((now + chrono::Duration::days(30)).to_rfc3339()),
            ..Default::default()
        }
    }

    #[test]
    fn offline_grace_boundary_71h59m_and_72h_are_allowed() {
        let now = chrono::Utc::now();
        let mut c = active_cache(now - chrono::Duration::hours(71) - chrono::Duration::minutes(59));
        assert!(offline_grace_eligible_at(&c, now));
        c.last_validated_at = (now - chrono::Duration::hours(72)).to_rfc3339();
        assert!(offline_grace_eligible_at(&c, now));
    }

    #[test]
    fn offline_grace_72h01m_is_rejected() {
        let now = chrono::Utc::now();
        let c = active_cache(now - chrono::Duration::hours(72) - chrono::Duration::minutes(1));
        assert!(!offline_grace_eligible_at(&c, now));
    }

    #[test]
    fn offline_grace_rejects_expired_revoked_or_blocked_cache() {
        let now = chrono::Utc::now();
        let mut c = active_cache(now);
        c.expires_at = Some((now - chrono::Duration::seconds(1)).to_rfc3339());
        assert!(!offline_grace_eligible_at(&c, now));
        let mut c = active_cache(now);
        c.license_status = "revoked".into();
        assert!(!offline_grace_eligible_at(&c, now));
        let mut c = active_cache(now);
        c.device_status = "blocked".into();
        assert!(!offline_grace_eligible_at(&c, now));
    }

    #[test]
    fn offline_grace_rejects_malformed_expiry() {
        let now = chrono::Utc::now();
        let mut c = active_cache(now);
        c.expires_at = Some("not-a-date".into());
        assert!(!offline_grace_eligible_at(&c, now));
    }

    #[test]
    fn only_documented_denials_are_authoritative() {
        assert!(authoritative_denial_error("license_revoked: revoked"));
        assert!(authoritative_denial_error("device_limit: limit"));
        assert!(!authoritative_denial_error("LICENSE_TRANSIENT: HTTP 503"));
        assert!(!authoritative_denial_error("LICENSE_REMOTE_ERROR:proxy_error"));
        assert!(transient_license_error("LICENSE_TRANSIENT: invalid JSON response"));
        assert!(transient_license_error("LICENSE_REMOTE_ERROR:proxy_error"));
    }
}
