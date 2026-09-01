use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join("state.json"))
}

fn default_state() -> Value {
    json!({"version":4,"channels":[],"jobs":[],"competitors":[],"settings":{"workspace":"","endlumePath":"","youtubeApiKey":"","autoCheckUpdates":true,"reduceMotion":false,"fpsMonitor":true},"logs":[]})
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
        if let Some(raw) = settings.get("workspace").and_then(Value::as_str).map(str::to_string) {
            if let Some(new_path) = migrated_workspace_path(&raw) {
                settings.insert("workspace".into(), json!(new_path.display().to_string()));
                changed = true;
            }
        }
    }
    if state.get("version").and_then(Value::as_u64).unwrap_or(0) < 5 {
        state["version"] = json!(5);
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
    Ok(())
}

#[tauri::command]
pub fn load_state(app: AppHandle) -> Value {
    let path = match state_file(&app) { Ok(p) => p, Err(_) => return default_state() };
    let state = fs::read(&path).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).unwrap_or_else(default_state);
    let (state, changed) = migrate_state(state);
    if changed { let _ = atomic_write(&path, &state); }
    state
}

#[tauri::command]
pub fn save_state(app: AppHandle, state: Value) -> Result<(), String> {
    let p = state_file(&app)?;
    atomic_write(&p, &state)
}
