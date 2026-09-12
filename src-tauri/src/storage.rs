use crate::security;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
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
            security::set_secret(account, &value)?;
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
            if let Err(e) = security::set_secret_for_autosave(account, &value) {
                warnings.push(e)
            }
        }
    }
    (disk, warnings)
}
fn hydrate_state_secrets(mut state: Value) -> Value {
    for (field, account) in [
        ("youtubeApiKey", STATE_YOUTUBE_API_KEY),
        ("openaiApiKey", STATE_OPENAI_API_KEY),
    ] {
        if let Ok(Some(value)) = security::get_secret(account) {
            set_state_secret(&mut state, field, &value)
        }
    }
    state
}

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

fn atomic_write(path: &Path, state: &Value) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    if path.exists() {
        let bak = path.with_extension("bak");
        let _ = fs::copy(path, bak);
        let _ = fs::remove_file(path);
    }
    fs::rename(tmp, path).map_err(|e| e.to_string())?;
    security::private_permissions(path)?;
    let bak = path.with_extension("bak");
    if bak.exists() {
        let _ = security::private_permissions(&bak);
    }
    Ok(())
}

#[tauri::command]
pub fn load_state(app: AppHandle) -> Value {
    let path = match state_file(&app) {
        Ok(p) => p,
        Err(_) => return default_state(),
    };
    let raw = fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(default_state);
    let (state, changed) = migrate_state(raw);
    match secure_state_for_disk(&state) {
        Ok((disk, migrated)) => {
            if changed || migrated {
                if atomic_write(&path, &disk).is_ok() && migrated {
                    let bak = path.with_extension("bak");
                    let _ = fs::copy(&path, &bak);
                    let _ = security::private_permissions(&bak);
                }
            } else if path.exists() {
                let _ = security::private_permissions(&path);
            }
            // Any legacy state.bak may still contain old plaintext API keys. Once
            // Keychain persistence succeeded, replace it with the sanitized snapshot.
            let bak = path.with_extension("bak");
            if bak.exists() {
                if let Ok(bytes) = serde_json::to_vec_pretty(&disk) {
                    let _ = fs::write(&bak, bytes);
                    let _ = security::private_permissions(&bak);
                }
            }
            hydrate_state_secrets(disk)
        }
        Err(_) => {
            // Fail-safe compatibility path: keep the legacy file untouched if Keychain
            // migration is unavailable. Runtime remains usable and no data is destroyed.
            if changed {
                let _ = atomic_write(&path, &state);
            }
            state
        }
    }
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
