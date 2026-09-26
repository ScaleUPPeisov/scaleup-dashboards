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


#[tauri::command]
pub fn endlume_diagnostics(endlume_path: String) -> Value {
    let raw = endlume_path.trim();
    if raw.is_empty() {
        return json!({"ok":false,"status":"PATH_MISSING","detail":"Путь к ENDLUME не выбран"});
    }
    let path = PathBuf::from(raw);
    if !path.exists() {
        return json!({"ok":false,"status":"FILE_NOT_FOUND","detail":"Файл ENDLUME не найден"});
    }
    if !path.is_file() {
        return json!({"ok":false,"status":"NOT_EXECUTABLE","detail":"Выбранный путь не является файлом приложения"});
    }
    #[cfg(target_os = "windows")]
    {
        let is_exe = path
            .extension()
            .and_then(|x| x.to_str())
            .map(|x| x.eq_ignore_ascii_case("exe"))
            .unwrap_or(false);
        if !is_exe {
            return json!({"ok":false,"status":"NOT_EXECUTABLE","detail":"На Windows требуется ENDLUME Studio.exe"});
        }
        if fs::File::open(&path).is_err() {
            return json!({"ok":false,"status":"NOT_EXECUTABLE","detail":"Нет доступа к ENDLUME Studio.exe"});
        }
        let Some(roaming) = std::env::var_os("APPDATA") else {
            return json!({"ok":false,"status":"INBOX_NOT_WRITABLE","detail":"APPDATA не определён"});
        };
        let inbox = PathBuf::from(roaming)
            .join("studio.endlume.desktop")
            .join("VYRON Inbox");
        if let Err(e) = fs::create_dir_all(&inbox) {
            return json!({"ok":false,"status":"INBOX_NOT_WRITABLE","detail":format!("Не удалось создать ENDLUME Inbox: {e}")});
        }
        let probe = inbox.join(format!(".vyron-diag-{}", uuid::Uuid::new_v4()));
        match fs::write(&probe, b"ok") {
            Ok(_) => {
                let _ = fs::remove_file(&probe);
                json!({
                    "ok":true,
                    "status":"READY",
                    "path":path.display().to_string(),
                    "inbox":inbox.display().to_string(),
                    "versionStatus":"VERSION_UNKNOWN",
                    "handshakeStatus":"NOT_RUN",
                    "destructiveActions":false
                })
            }
            Err(e) => json!({"ok":false,"status":"INBOX_NOT_WRITABLE","detail":format!("ENDLUME Inbox недоступен для записи: {e}")}),
        }
    }
    #[cfg(target_os = "macos")]
    {
        let home = match std::env::var("HOME") {
            Ok(v) => v,
            Err(_) => return json!({"ok":false,"status":"INBOX_NOT_WRITABLE","detail":"HOME не определён"}),
        };
        let inbox = PathBuf::from(home)
            .join("Library/Application Support/studio.endlume.desktop/VYRON Inbox");
        if let Err(e) = fs::create_dir_all(&inbox) {
            return json!({"ok":false,"status":"INBOX_NOT_WRITABLE","detail":format!("Не удалось создать ENDLUME Inbox: {e}")});
        }
        let probe = inbox.join(format!(".vyron-diag-{}", uuid::Uuid::new_v4()));
        match fs::write(&probe, b"ok") {
            Ok(_) => {
                let _ = fs::remove_file(&probe);
                json!({"ok":true,"status":"READY","path":path.display().to_string(),"inbox":inbox.display().to_string(),"versionStatus":"VERSION_UNKNOWN","handshakeStatus":"NOT_RUN","destructiveActions":false})
            }
            Err(e) => json!({"ok":false,"status":"INBOX_NOT_WRITABLE","detail":format!("ENDLUME Inbox недоступен для записи: {e}")}),
        }
    }
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        json!({"ok":false,"status":"HANDSHAKE_FAILED","detail":"ENDLUME diagnostics unsupported on this platform"})
    }
}


#[cfg(test)]
mod v214_windows_system_tests {
    use super::*;

    #[test]
    fn endlume_empty_path_is_not_ready() {
        let d = endlume_diagnostics(String::new());
        assert_eq!(d["ok"], false);
        assert_eq!(d["status"], "PATH_MISSING");
    }

    #[test]
    fn endlume_missing_file_is_not_ready() {
        let missing = std::env::temp_dir().join(format!("vyron-missing-{}.exe", uuid::Uuid::new_v4()));
        let d = endlume_diagnostics(missing.to_string_lossy().into_owned());
        assert_eq!(d["ok"], false);
        assert_eq!(d["status"], "FILE_NOT_FOUND");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_non_exe_path_is_rejected() {
        let root = std::env::temp_dir().join(format!("vyron-endlume-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("ENDLUME Studio.app");
        fs::write(&file, b"not-an-exe").unwrap();
        let d = endlume_diagnostics(file.to_string_lossy().into_owned());
        assert_eq!(d["status"], "NOT_EXECUTABLE");
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_unicode_and_space_paths_roundtrip() {
        let root = std::env::temp_dir()
            .join(format!("vyron-path-{}", uuid::Uuid::new_v4()))
            .join("Кирилл")
            .join("VYRON Projects");
        fs::create_dir_all(&root).unwrap();
        let file = root.join("проект с пробелами.json");
        fs::write(&file, br#"{"ok":true}"#).unwrap();
        let value: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        assert_eq!(value["ok"], true);
        let _ = fs::remove_dir_all(root.ancestors().nth(3).unwrap());
    }
}
