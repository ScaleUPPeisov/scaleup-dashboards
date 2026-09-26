use crate::security;
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let d = crate::license::private_data_dir(app)?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join("state.json"))
}

fn default_state() -> Value {
    json!({"version":8,"channels":[],"jobs":[],"competitors":[],"settings":{"workspace":"","endlumePath":"","youtubeApiKey":"","autoCheckUpdates":true,"reduceMotion":false,"fpsMonitor":true},"logs":[],"uploadHistory":[],"fingerprintCache":{},"projectLifecycle":{}})
}

const STATE_YOUTUBE_API_KEY: &str = "state.youtubeApiKey";
const STATE_OPENAI_API_KEY: &str = "state.openaiApiKey";

fn state_secret(state: &Value, key: &str) -> String {
    state
        .get("settings")
        .and_then(Value::as_object)
        .and_then(|x| x.get(key))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}
fn set_state_secret(state: &mut Value, key: &str, value: &str) {
    if let Some(x) = state.get_mut("settings").and_then(Value::as_object_mut) {
        x.insert(key.into(), json!(value));
    }
}

fn sanitized_state_for_disk(state: &Value) -> Value {
    let mut disk = state.clone();
    for field in ["youtubeApiKey", "openaiApiKey"] {
        set_state_secret(&mut disk, field, "");
    }
    disk
}
fn secure_state_for_disk(state: &Value) -> Result<(Value, bool), String> {
    let disk = sanitized_state_for_disk(state);
    let mut migrated = false;
    for (field, account) in [
        ("youtubeApiKey", STATE_YOUTUBE_API_KEY),
        ("openaiApiKey", STATE_OPENAI_API_KEY),
    ] {
        let value = state_secret(state, field);
        if !value.is_empty() {
            security::canonical_set_secret(account, &value)?;
            migrated = true;
        }
    }
    Ok((disk, migrated))
}
fn secure_state_for_disk_best_effort(state: &Value) -> (Value, Vec<String>) {
    let disk = sanitized_state_for_disk(state);
    let mut warnings = Vec::new();
    for (field, account) in [
        ("youtubeApiKey", STATE_YOUTUBE_API_KEY),
        ("openaiApiKey", STATE_OPENAI_API_KEY),
    ] {
        let value = state_secret(state, field);
        if !value.is_empty() {
            if let Err(e) = security::canonical_set_secret(account, &value) {
                warnings.push(e)
            }
        }
    }
    (disk, warnings)
}
fn legacy_state_secret_for_operation(app:&AppHandle,field:&str)->Result<Option<String>,String>{
    let path=state_file(app)?;
    if !path.exists(){return Ok(None)}
    let raw=fs::read(&path).map_err(|e|format!("state read: {e}"))?;
    let state:Value=serde_json::from_slice(&raw).map_err(|e|format!("state parse: {e}"))?;
    let value=state_secret(&state,field);
    Ok((!value.is_empty()).then_some(value))
}
fn secret_for_operation(app:&AppHandle,field:&str,account:&str)->Result<String,String>{
    if let Some(v)=security::canonical_get_secret_cached(account)?{if !v.is_empty(){return Ok(v)}}
    if let Some(v)=legacy_state_secret_for_operation(app,field)?{
        // One-time legacy migration is allowed only from an explicit secret-required operation.
        security::canonical_set_secret(account,&v)?;
        let path=state_file(app)?;
        let raw=fs::read(&path).map_err(|e|format!("state read: {e}"))?;
        let state:Value=serde_json::from_slice(&raw).map_err(|e|format!("state parse: {e}"))?;
        atomic_write(&path,&sanitized_state_for_disk(&state))?;
        return Ok(v)
    }
    Err(format!("CREDENTIAL_MISSING: {field} is not configured"))
}
pub(crate) fn youtube_api_key_for_operation(app:&AppHandle,provided:&str)->Result<String,String>{if !provided.trim().is_empty(){Ok(provided.trim().to_string())}else{secret_for_operation(app,"youtubeApiKey",STATE_YOUTUBE_API_KEY)}}
pub(crate) fn openai_api_key_for_operation(app:&AppHandle,provided:&str)->Result<String,String>{if !provided.trim().is_empty(){Ok(provided.trim().to_string())}else{secret_for_operation(app,"openaiApiKey",STATE_OPENAI_API_KEY)}}

fn migrated_workspace_path(raw: &str) -> Option<PathBuf> {
    let p = PathBuf::from(raw);
    if p.file_name().and_then(|x| x.to_str()) != Some("ChannelFlow") || !p.exists() {
        return None;
    }
    let parent = p.parent()?;
    let target = parent.join("VYRON");
    if target.exists() {
        return Some(target);
    }
    match fs::rename(&p, &target) {
        Ok(_) => Some(target),
        Err(_) => None,
    }
}

fn migrate_state(mut state: Value) -> (Value, bool) {
    let mut changed = false;
    if let Some(settings) = state.get_mut("settings").and_then(Value::as_object_mut) {
        if let Some(raw) = settings
            .get("workspace")
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            if let Some(new_path) = migrated_workspace_path(&raw) {
                settings.insert("workspace".into(), json!(new_path.display().to_string()));
                changed = true;
            }
        }
    }
    let version = state.get("version").and_then(Value::as_u64).unwrap_or(0);
    if version < 8 {
        if state.get("uploadHistory").is_none() {
            state["uploadHistory"] = json!([]);
        }
        if state.get("fingerprintCache").is_none() {
            state["fingerprintCache"] = json!({});
        }
        if state.get("projectLifecycle").is_none() {
            state["projectLifecycle"] = json!({});
        }
        state["version"] = json!(8);
        changed = true;
    }
    (state, changed)
}

fn durable_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("state parent create: {e}"))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|e| format!("state temp open: {e}"))?;
    file.write_all(bytes).map_err(|e| format!("state temp write: {e}"))?;
    file.sync_all().map_err(|e| format!("state temp sync: {e}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn replace_file_atomic(src: &Path, dst: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let src_w = src.as_os_str().encode_wide().chain(std::iter::once(0)).collect::<Vec<_>>();
    let dst_w = dst.as_os_str().encode_wide().chain(std::iter::once(0)).collect::<Vec<_>>();
    let ok = unsafe {
        MoveFileExW(
            src_w.as_ptr(),
            dst_w.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        return Err(format!("state atomic replace: {}", std::io::Error::last_os_error()));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_file_atomic(src: &Path, dst: &Path) -> Result<(), String> {
    fs::rename(src, dst).map_err(|e| format!("state atomic replace: {e}"))
}

fn read_valid_json(path: &Path) -> Result<Value, String> {
    let bytes = fs::read(path).map_err(|e| format!("state read {}: {e}", path.display()))?;
    serde_json::from_slice::<Value>(&bytes)
        .map_err(|e| format!("state parse {}: {e}", path.display()))
}

fn archive_corrupt(path: &Path, label: &str) -> Option<PathBuf> {
    if !path.exists() {
        return None;
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let archived = parent.join(format!(
        "{label}.corrupt-{}.json",
        chrono::Utc::now().timestamp_millis()
    ));
    if fs::rename(path, &archived).is_ok() {
        let _ = security::private_permissions(&archived);
        return Some(archived);
    }
    if fs::copy(path, &archived).is_ok() {
        let _ = security::private_permissions(&archived);
        return Some(archived);
    }
    None
}

fn recovered_state(mut state: Value, reason: &str) -> Value {
    let at = chrono::Utc::now().to_rfc3339();
    state["stateRecovery"] = json!({"status":"RECOVERED","reason":reason,"at":at});
    if state.get("logs").and_then(Value::as_array).is_none() {
        state["logs"] = json!([]);
    }
    if let Some(logs) = state.get_mut("logs").and_then(Value::as_array_mut) {
        logs.push(json!({
            "at": at,
            "level": "info",
            "message": format!("Локальное состояние автоматически восстановлено из state.bak: {reason}")
        }));
    }
    state
}

fn recovery_default(message: String) -> Value {
    let mut state = default_state();
    state["stateRecovery"] = json!({"status":"FAILED","message":message});
    if let Some(logs) = state.get_mut("logs").and_then(Value::as_array_mut) {
        logs.push(json!({
            "at": chrono::Utc::now().to_rfc3339(),
            "level": "error",
            "message": "VYRON не смог восстановить локальное состояние. Повреждённые state-файлы сохранены для диагностики."
        }));
    }
    state
}

fn atomic_write(path: &Path, state: &Value) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let bak = path.with_extension("bak");
    let bak_tmp = path.with_extension("bak.tmp");
    let bytes = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;

    durable_write(&tmp, &bytes)?;
    serde_json::from_slice::<Value>(&fs::read(&tmp).map_err(|e| e.to_string())?)
        .map_err(|e| format!("state temp validation failed: {e}"))?;

    if path.exists() && read_valid_json(path).is_ok() {
        let backup_bytes = fs::read(path).map_err(|e| format!("state backup read: {e}"))?;
        serde_json::from_slice::<Value>(&backup_bytes)
            .map_err(|e| format!("state backup validation failed: {e}"))?;
        // Write the backup through a writable handle and fsync it before replacing state.bak.
        // Opening a copied file read-only and calling sync_all() fails with ERROR_ACCESS_DENIED
        // on Windows runners.
        durable_write(&bak_tmp, &backup_bytes)?;
        replace_file_atomic(&bak_tmp, &bak)?;
        let _ = security::private_permissions(&bak);
    }

    // Crucially, state.json is never deleted first. On Windows MoveFileExW performs
    // a replace-in-place, so a crash before this point leaves the previous state valid.
    replace_file_atomic(&tmp, path)?;
    security::private_permissions(path)?;
    Ok(())
}

fn load_state_from_path(path: &Path) -> Value {
    let bak = path.with_extension("bak");

    if !path.exists() {
        if !bak.exists() {
            return default_state();
        }
        match read_valid_json(&bak) {
            Ok(recovered) => {
                let recovered = recovered_state(recovered, "state.json отсутствовал");
                if atomic_write(path, &recovered).is_ok() {
                    return recovered;
                }
                return recovery_default("STATE_RECOVERY_WRITE_FAILED".into());
            }
            Err(backup_error) => {
                archive_corrupt(&bak, "state.bak");
                return recovery_default(format!("STATE_BACKUP_CORRUPT: {backup_error}"));
            }
        }
    }

    match read_valid_json(path) {
        Ok(state) => state,
        Err(primary_error) => match read_valid_json(&bak) {
            Ok(recovered) => {
                archive_corrupt(path, "state");
                let recovered = recovered_state(recovered, "state.json был повреждён");
                if atomic_write(path, &recovered).is_ok() {
                    recovered
                } else {
                    recovery_default(format!(
                        "STATE_RECOVERY_WRITE_FAILED: primary={primary_error}"
                    ))
                }
            }
            Err(backup_error) => {
                archive_corrupt(path, "state");
                archive_corrupt(&bak, "state.bak");
                recovery_default(format!(
                    "STATE_RECOVERY_FAILED: primary={primary_error}; backup={backup_error}"
                ))
            }
        },
    }
}

#[tauri::command]
pub fn load_state(app: AppHandle) -> Value {
    let path = match state_file(&app) {
        Ok(p) => p,
        Err(_) => return default_state(),
    };
    let raw = load_state_from_path(&path);
    let (state, changed) = migrate_state(raw);
    let legacy_plaintext=!state_secret(&state,"youtubeApiKey").is_empty()||!state_secret(&state,"openaiApiKey").is_empty();
    let disk=sanitized_state_for_disk(&state);
    // Passive startup must never read/write secure storage or trigger legacy secret migration.
    // If legacy plaintext exists, keep the original file untouched until an explicit
    // secret-required operation performs the one-time migration.
    if changed&&!legacy_plaintext{let _=atomic_write(&path,&disk);}else if path.exists(){let _=security::private_permissions(&path);}
    disk
}

#[tauri::command]
pub fn save_state(app: AppHandle, state: Value) -> Result<Value, String> {
    let p = state_file(&app)?;
    let (disk, warnings) = secure_state_for_disk_best_effort(&state);
    atomic_write(&p, &disk)?;
    Ok(
        json!({"ok":true,"securityWarning":warnings.first().cloned(),"securityWarnings":warnings.len()}),
    )
}

#[cfg(test)]
mod v213_storage_tests {
    use super::*;
    #[test]
    fn v7_to_v8_preserves_existing_data_and_is_idempotent() {
        let state = json!({"version":7,"channels":[{"id":"c1"}],"jobs":[{"id":"j1","channelId":"c1"}],"competitors":[{"id":"x"}],"settings":{"workspace":"/tmp/vyron"},"logs":[{"message":"keep"}]});
        let (m, changed) = migrate_state(state);
        assert!(changed);
        assert_eq!(m["version"], 8);
        assert_eq!(m["channels"][0]["id"], "c1");
        assert_eq!(m["jobs"][0]["id"], "j1");
        assert!(m["uploadHistory"].as_array().unwrap().is_empty());
        assert!(m["fingerprintCache"].as_object().unwrap().is_empty());
        assert!(m["projectLifecycle"].as_object().unwrap().is_empty());
        let (m2, changed2) = migrate_state(m.clone());
        assert!(!changed2);
        assert_eq!(m2, m);
    }
    #[test]
    fn atomic_write_keeps_previous_valid_state_as_backup() {
        let root = std::env::temp_dir().join(format!("vyron-state-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.json");
        atomic_write(&path, &json!({"version":8,"channels":[{"id":"old"}]})).unwrap();
        atomic_write(&path, &json!({"version":8,"channels":[{"id":"new"}]})).unwrap();
        assert_eq!(read_valid_json(&path).unwrap()["channels"][0]["id"], "new");
        assert_eq!(read_valid_json(&path.with_extension("bak")).unwrap()["channels"][0]["id"], "old");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn crash_after_temp_write_before_replace_leaves_primary_intact() {
        let root = std::env::temp_dir().join(format!("vyron-state-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.json");
        atomic_write(&path, &json!({"version":8,"channels":[{"id":"stable"}],"jobs":[{"id":"j1"}]})).unwrap();
        let tmp = path.with_extension("tmp");
        let pending = serde_json::to_vec_pretty(&json!({"version":8,"channels":[{"id":"pending"}]})).unwrap();
        durable_write(&tmp, &pending).unwrap();
        // Simulated power loss here: replace_file_atomic is intentionally not called.
        let loaded = read_valid_json(&path).unwrap();
        assert_eq!(loaded["channels"][0]["id"], "stable");
        assert_eq!(loaded["jobs"][0]["id"], "j1");
        assert!(tmp.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_primary_recovers_from_valid_backup() {
        let root = std::env::temp_dir().join(format!("vyron-state-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.json");
        fs::write(path.with_extension("bak"), br#"{"version":8,"channels":[{"id":"c1"}],"jobs":[]}"#).unwrap();
        let recovered = load_state_from_path(&path);
        assert_eq!(recovered["channels"][0]["id"], "c1");
        assert_eq!(recovered["stateRecovery"]["status"], "RECOVERED");
        assert!(recovered["logs"].as_array().unwrap().iter().any(|x| x["level"] == "info"));
        assert_eq!(read_valid_json(&path).unwrap()["channels"][0]["id"], "c1");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn corrupt_primary_recovers_from_valid_backup_without_losing_channels() {
        let root = std::env::temp_dir().join(format!("vyron-state-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.json");
        fs::write(&path, b"{broken").unwrap();
        fs::write(path.with_extension("bak"), br#"{"version":8,"channels":[{"id":"c1"}],"jobs":[{"id":"j1"}],"uploadHistory":[{"id":"u1"}],"fingerprintCache":{"x":"y"},"projectLifecycle":{"p":"ready"},"settings":{"workspace":"D:\\VYRON","endlumePath":"C:\\ENDLUME Studio.exe"}}"#).unwrap();
        let recovered = load_state_from_path(&path);
        assert_eq!(recovered["channels"][0]["id"], "c1");
        assert_eq!(recovered["jobs"][0]["id"], "j1");
        assert_eq!(recovered["uploadHistory"][0]["id"], "u1");
        assert_eq!(recovered["stateRecovery"]["status"], "RECOVERED");
        assert_eq!(recovered["fingerprintCache"]["x"], "y");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn corrupt_primary_and_backup_surface_explicit_recovery_error() {
        let root = std::env::temp_dir().join(format!("vyron-state-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.json");
        fs::write(&path, b"{broken").unwrap();
        fs::write(path.with_extension("bak"), b"{also-broken").unwrap();
        let recovered = load_state_from_path(&path);
        assert_eq!(recovered["stateRecovery"]["status"], "FAILED");
        assert!(recovered["logs"].as_array().unwrap().iter().any(|x| x["level"] == "error"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sanitized_state_never_writes_api_secrets_to_disk() {
        let state = json!({"settings":{"youtubeApiKey":"AIza-secret","openaiApiKey":"sk-secret","workspace":"/tmp/vyron"},"channels":[{"id":"c1"}]});
        let disk = sanitized_state_for_disk(&state);
        assert_eq!(
            disk.pointer("/settings/youtubeApiKey")
                .and_then(Value::as_str),
            Some("")
        );
        assert_eq!(
            disk.pointer("/settings/openaiApiKey")
                .and_then(Value::as_str),
            Some("")
        );
        assert_eq!(
            disk.pointer("/settings/workspace").and_then(Value::as_str),
            Some("/tmp/vyron")
        );
        assert_eq!(
            disk.pointer("/channels/0/id").and_then(Value::as_str),
            Some("c1")
        );
    }
}
