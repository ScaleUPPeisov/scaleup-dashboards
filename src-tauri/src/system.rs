use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

fn migrate_legacy_workspace(base: &Path) -> Result<PathBuf, String> {
    let legacy = base.join("ChannelFlow");
    let target = base.join("VYRON");

    if target.exists() {
        return Ok(target);
    }

    if legacy.exists() {
        match fs::rename(&legacy, &target) {
            Ok(_) => return Ok(target),
            Err(e) => {
                eprintln!("VYRON workspace migration deferred: {e}");
                return Ok(legacy);
            }
        }
    }

    fs::create_dir_all(&target).map_err(|e| format!("Не удалось создать Workspace VYRON: {e}"))?;
    Ok(target)
}

#[tauri::command]
pub fn diagnostics(app: AppHandle, workspace: String) -> Value {
    let data = app.path().app_data_dir().map(|p| p.display().to_string()).unwrap_or_default();
    let version = app.package_info().version.to_string();
    let p = PathBuf::from(&workspace);
    let exists = !workspace.trim().is_empty() && p.exists();
    let mut writable = false;
    let mut notes = Vec::new();

    if workspace.trim().is_empty() {
        notes.push("Workspace не выбран".to_string());
    } else {
        if !exists {
            if let Err(e) = fs::create_dir_all(&p) {
                notes.push(format!("Не удалось создать Workspace: {e}"));
            }
        }
        if p.exists() {
            let probe = p.join(".vyron_write_test");
            match fs::write(&probe, b"ok") {
                Ok(_) => { writable = true; let _ = fs::remove_file(probe); }
                Err(e) => notes.push(format!("Нет записи в Workspace: {e}")),
            }
        }
    }

    json!({
        "ok": writable,
        "workspaceWritable": writable,
        "workspaceExists": p.exists(),
        "dataDir": data,
        "platform": std::env::consts::OS,
        "appVersion": version,
        "notes": notes
    })
}

#[tauri::command]
pub fn default_workspace(app: AppHandle) -> Result<String, String> {
    let base = app.path().document_dir().or_else(|_| app.path().home_dir())
        .map_err(|e| format!("Не удалось определить папку пользователя: {e}"))?;
    let p = migrate_legacy_workspace(&base)?;
    fs::create_dir_all(&p).map_err(|e| format!("Не удалось создать Workspace: {e}"))?;
    let probe = p.join(".vyron_write_test");
    fs::write(&probe, b"ok").map_err(|e| format!("Нет записи в Workspace: {e}"))?;
    let _ = fs::remove_file(probe);
    Ok(p.display().to_string())
}
