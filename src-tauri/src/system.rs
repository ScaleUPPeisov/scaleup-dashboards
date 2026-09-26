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



fn semver_like(value: &str) -> bool {
    let core = value
        .split_once('+')
        .map(|x| x.0)
        .unwrap_or(value)
        .split_once('-')
        .map(|x| x.0)
        .unwrap_or(value);
    let parts = core.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|x| x.is_ascii_digit()))
}

#[tauri::command]
pub async fn updater_manifest_diagnostics(app: AppHandle, endpoint: String) -> Value {
    let endpoint = endpoint.trim().to_string();
    let current = app.package_info().version.to_string();
    if !endpoint.starts_with("https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/") {
        return json!({
            "ok":false,
            "status":"INVALID_ENDPOINT",
            "endpoint":endpoint,
            "currentVersion":current,
            "detail":"Updater diagnostics accepts only the configured ScaleUPPeisov GitHub feed."
        });
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
    {
        Ok(x) => x,
        Err(e) => return json!({"ok":false,"status":"HTTP_CLIENT_FAILED","endpoint":endpoint,"currentVersion":current,"detail":e.to_string()}),
    };
    let response = match client
        .get(&endpoint)
        .header("Cache-Control", "no-cache, no-store, max-age=0")
        .header("Pragma", "no-cache")
        .send()
        .await
    {
        Ok(x) => x,
        Err(e) => return json!({"ok":false,"status":"ENDPOINT_UNREACHABLE","endpoint":endpoint,"currentVersion":current,"detail":e.to_string()}),
    };
    let http_status = response.status().as_u16();
    if !response.status().is_success() {
        return json!({"ok":false,"status":"HTTP_ERROR","endpoint":endpoint,"currentVersion":current,"httpStatus":http_status});
    }
    let bytes = match response.bytes().await {
        Ok(x) => x,
        Err(e) => return json!({"ok":false,"status":"BODY_READ_FAILED","endpoint":endpoint,"currentVersion":current,"httpStatus":http_status,"detail":e.to_string()}),
    };
    let manifest: Value = match serde_json::from_slice(&bytes) {
        Ok(x) => x,
        Err(e) => return json!({"ok":false,"status":"JSON_PARSE_FAILED","endpoint":endpoint,"currentVersion":current,"httpStatus":http_status,"detail":e.to_string()}),
    };

    let version = manifest.get("version").and_then(Value::as_str).unwrap_or("").trim();
    let platform = manifest.pointer("/platforms/windows-x86_64");
    let url = platform.and_then(|x| x.get("url")).and_then(Value::as_str).unwrap_or("").trim();
    let signature = platform
        .and_then(|x| x.get("signature"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let version_valid = semver_like(version);
    let url_valid = url.starts_with("https://");
    let signature_present = !signature.is_empty();
    let platform_present = platform.is_some();
    let schema_valid =
        !version.is_empty() && version_valid && platform_present && url_valid && signature_present;
    let mut errors = Vec::<&str>::new();
    if version.is_empty() { errors.push("VERSION_MISSING"); }
    else if !version_valid { errors.push("VERSION_NOT_SEMVER"); }
    if !platform_present { errors.push("WINDOWS_PLATFORM_MISSING"); }
    if !url_valid { errors.push("DOWNLOAD_URL_INVALID"); }
    if !signature_present { errors.push("SIGNATURE_MISSING"); }

    json!({
        "ok":schema_valid,
        "status":if schema_valid{"READY"}else{"MANIFEST_INVALID"},
        "endpoint":endpoint,
        "httpStatus":http_status,
        "endpointReachable":true,
        "jsonParsed":true,
        "schemaValid":schema_valid,
        "platformKey":"windows-x86_64",
        "platformPresent":platform_present,
        "version":version,
        "semverValid":version_valid,
        "downloadUrl":url,
        "signaturePresent":signature_present,
        "currentVersion":current,
        "comparison":if version.is_empty(){"latest unknown".to_string()}else if current==version{"current == latest".to_string()}else{format!("current {current} -> latest {version}")},
        "errors":errors,
        "installerDownloaded":false,
        "youtubeApiRequests":0
    })
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
    fn updater_semver_validation_accepts_release_and_prerelease() {
        assert!(semver_like("2.1.14"));
        assert!(semver_like("2.1.14-rc.1"));
        assert!(semver_like("2.1.14+build.7"));
        assert!(!semver_like("2.1"));
        assert!(!semver_like("2.1.x"));
    }

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
        let base = std::env::temp_dir().join(format!("vyron-path-{}", uuid::Uuid::new_v4()));
        let root = base.join("Кирилл").join("VYRON Projects");
        fs::create_dir_all(&root).unwrap();
        let file = root.join("проект с пробелами.json");
        fs::write(&file, br#"{"ok":true}"#).unwrap();
        let value: Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        assert_eq!(value["ok"], true);
        let _ = fs::remove_dir_all(base);
    }
}
