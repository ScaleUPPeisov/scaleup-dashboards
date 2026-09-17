use chrono::Utc;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use uuid::Uuid;

fn safe_name(s: &str) -> String {
    let out: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let t = out.trim().trim_matches('.');
    if t.is_empty() {
        "Channel".into()
    } else {
        t.chars().take(80).collect()
    }
}

fn ext(path: &Path) -> String {
    path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn audio_ext(e: &str) -> bool {
    matches!(e, "mp3" | "wav" | "m4a" | "aac" | "flac" | "ogg" | "opus")
}

fn image_ext(e: &str) -> bool {
    matches!(e, "jpg" | "jpeg" | "png" | "webp")
}

fn track_count(folder: &Path) -> usize {
    fs::read_dir(folder.join("tracks"))
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .count()
}

fn cover_path(folder: &Path) -> Option<PathBuf> {
    fs::read_dir(folder)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("cover."))
                .unwrap_or(false)
        })
}

fn move_file(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    match fs::rename(src, dst) {
        Ok(_) => Ok(()),
        Err(_) => {
            fs::copy(src, dst)
                .map_err(|e| format!("Не удалось скопировать {}: {e}", src.display()))?;
            fs::remove_file(src).map_err(|e| {
                format!(
                    "Файл скопирован, но не удалось удалить входящий {}: {e}",
                    src.display()
                )
            })?;
            Ok(())
        }
    }
}

fn manifest_base(
    channel_id: &str,
    channel_name: &str,
    number: u32,
    folder: &Path,
    min_tracks: usize,
) -> Value {
    json!({
        "id": Uuid::new_v4().to_string(),
        "channelId": channel_id,
        "channel": channel_name,
        "number": number,
        "status": "NEED_IMAGE",
        "tracksDir": folder.join("tracks"),
        "finalPath": folder.join("final.mp4"),
        "minTracks": min_tracks,
        "tracksCount": 0,
        "createdAt": Utc::now().to_rfc3339()
    })
}

fn patch_manifest(folder: &Path, status: &str, count: usize) -> Result<(), String> {
    let p = folder.join("manifest.json");
    let mut v = fs::read(&p)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(|| json!({}));
    v["status"] = json!(status);
    v["tracksCount"] = json!(count);
    v["updatedAt"] = json!(Utc::now().to_rfc3339());
    fs::write(
        p,
        serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn job_status(
    folder: &Path,
    min_tracks: usize,
) -> (&'static str, usize, Option<PathBuf>, Option<PathBuf>) {
    let count = track_count(folder);
    let cover = cover_path(folder);
    let final_path = folder.join("final.mp4");
    let final_opt = final_path.is_file().then_some(final_path);
    let status = if final_opt.is_some() {
        "READY_UPLOAD"
    } else if cover.is_none() {
        "NEED_IMAGE"
    } else if count >= min_tracks {
        "READY_RENDER"
    } else {
        "WAITING_MUSIC"
    };
    (status, count, cover, final_opt)
}

#[tauri::command]
pub fn prepare_job_folder(
    workspace: String,
    channel_id: String,
    channel_name: String,
    number: u32,
    min_tracks: usize,
) -> Result<Value, String> {
    if workspace.trim().is_empty() {
        return Err("Workspace не выбран".into());
    }
    let folder = PathBuf::from(&workspace)
        .join(safe_name(&channel_name))
        .join(format!("Video_{:03}", number));
    fs::create_dir_all(folder.join("tracks"))
        .map_err(|e| format!("Не удалось создать проект: {e}"))?;

    let manifest = folder.join("manifest.json");
    if !manifest.exists() {
        let v = manifest_base(&channel_id, &channel_name, number, &folder, min_tracks);
        fs::write(
            &manifest,
            serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }

    let (status, count, cover, final_path) = job_status(&folder, min_tracks);
    patch_manifest(&folder, status, count)?;
    Ok(json!({
        "folder": folder,
        "status": status,
        "tracksCount": count,
        "coverPath": cover,
        "finalPath": final_path
    }))
}

#[tauri::command]
pub fn ensure_channel_inbox(workspace: String, channel_name: String) -> Result<Value, String> {
    if workspace.trim().is_empty() {
        return Err("Workspace не выбран".into());
    }
    let root = PathBuf::from(&workspace)
        .join("Inbox")
        .join(safe_name(&channel_name));
    let music = root.join("Music");
    let images = root.join("Images");
    let metadata = root.join("Metadata");
    for p in [&music, &images, &metadata] {
        fs::create_dir_all(p).map_err(|e| format!("Не удалось создать Inbox: {e}"))?;
    }
    Ok(json!({
        "root": root,
        "music": music,
        "images": images,
        "metadata": metadata
    }))
}

#[tauri::command]
pub fn scan_channel_inbox(workspace: String, channel_name: String) -> Result<Value, String> {
    let dirs = ensure_channel_inbox(workspace, channel_name)?;
    let root = PathBuf::from(dirs.get("root").and_then(|x| x.as_str()).unwrap_or(""));
    let collect = |name: &str, kind: &str| -> Vec<String> {
        let mut out: Vec<(std::time::SystemTime, String)> = fs::read_dir(root.join(name))
            .ok()
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter_map(|e| {
                let p = e.path();
                if !p.is_file() {
                    return None;
                }
                let ex = ext(&p);
                let ok = if kind == "audio" {
                    audio_ext(&ex)
                } else if kind == "image" {
                    image_ext(&ex)
                } else {
                    matches!(ex.as_str(), "json" | "txt" | "csv")
                };
                if !ok {
                    return None;
                }
                let t = e
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::UNIX_EPOCH);
                Some((t, p.display().to_string()))
            })
            .collect();
        out.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        out.into_iter().map(|x| x.1).collect()
    };
    Ok(json!({
        "root": root,
        "music": collect("Music", "audio"),
        "images": collect("Images", "image"),
        "metadata": collect("Metadata", "metadata")
    }))
}

#[tauri::command]
pub fn ingest_tracks(
    job_folder: String,
    files: Vec<String>,
    min_tracks: usize,
) -> Result<Value, String> {
    let folder = PathBuf::from(job_folder);
    if !folder.is_dir() {
        return Err("Папка проекта не найдена".into());
    }
    let tracks = folder.join("tracks");
    fs::create_dir_all(&tracks).map_err(|e| e.to_string())?;
    let mut idx = track_count(&folder) + 1;
    for raw in files {
        let src = PathBuf::from(raw);
        if !src.is_file() {
            continue;
        }
        let e = ext(&src);
        if !audio_ext(&e) {
            continue;
        }
        let dst = tracks.join(format!("{:02}.{}", idx, e));
        move_file(&src, &dst)?;
        idx += 1;
    }
    let (status, count, cover, final_path) = job_status(&folder, min_tracks);
    patch_manifest(&folder, status, count)?;
    Ok(json!({
        "tracksCount": count,
        "status": status,
        "coverPath": cover,
        "finalPath": final_path
    }))
}

#[tauri::command]
pub fn ingest_cover(
    job_folder: String,
    file: String,
    min_tracks: usize,
) -> Result<Value, String> {
    let folder = PathBuf::from(job_folder);
    if !folder.is_dir() {
        return Err("Папка проекта не найдена".into());
    }
    let src = PathBuf::from(file);
    if !src.is_file() {
        return Err("Изображение не найдено".into());
    }
    let e = ext(&src);
    if !image_ext(&e) {
        return Err("Неподдерживаемое изображение".into());
    }
    if let Some(old) = cover_path(&folder) {
        let _ = fs::remove_file(old);
    }
    let dst = folder.join(format!("cover.{e}"));
    move_file(&src, &dst)?;
    let (status, count, cover, final_path) = job_status(&folder, min_tracks);
    patch_manifest(&folder, status, count)?;
    Ok(json!({
        "status": status,
        "tracksCount": count,
        "coverPath": cover,
        "finalPath": final_path
    }))
}

#[tauri::command]
pub fn write_job_metadata(
    job_folder: String,
    title: String,
    description: String,
    tags: Vec<String>,
    publish_at: Option<String>,
    source: String,
) -> Result<(), String> {
    let folder = PathBuf::from(job_folder);
    if !folder.is_dir() {
        return Err("Папка проекта не найдена".into());
    }
    let p = folder.join("manifest.json");
    let mut v = fs::read(&p)
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(|| json!({}));
    v["title"] = json!(title);
    v["description"] = json!(description);
    v["tags"] = json!(tags);
    v["publishAt"] = json!(publish_at);
    v["metadataSource"] = json!(source);
    v["updatedAt"] = json!(Utc::now().to_rfc3339());
    fs::write(
        p,
        serde_json::to_vec_pretty(&v).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn enqueue_render(workspace: String, job_folder: String) -> Result<Value, String> {
    let folder = PathBuf::from(&job_folder);
    if !folder.is_dir() {
        return Err("Папка проекта не найдена".into());
    }
    let queue = PathBuf::from(workspace).join("RenderQueue");
    fs::create_dir_all(&queue).map_err(|e| e.to_string())?;
    let number = folder
        .file_name()
        .and_then(|x| x.to_str())
        .unwrap_or("Video");
    let marker = queue.join(format!("{}.json", number));
    let payload = json!({
        "projectFolder": folder,
        "queuedAt": Utc::now().to_rfc3339(),
        "status": "READY_RENDER"
    });
    fs::write(
        &marker,
        serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({"queueFile": marker}))
}

#[tauri::command]
pub fn import_images(
    workspace: String,
    channel_id: String,
    channel_name: String,
    files: Vec<String>,
    min_tracks: usize,
    target_numbers: Vec<u32>,
) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    for (i, raw) in files.into_iter().enumerate() {
        let number = target_numbers.get(i).copied().unwrap_or((i + 1) as u32);
        let prep = prepare_job_folder(
            workspace.clone(),
            channel_id.clone(),
            channel_name.clone(),
            number,
            min_tracks,
        )?;
        let folder = prep
            .get("folder")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let r = ingest_cover(folder.clone(), raw, min_tracks)?;
        result.push(json!({
            "id": Uuid::new_v4().to_string(),
            "channelId": channel_id,
            "number": number,
            "folder": folder,
            "status": r["status"],
            "createdAt": Utc::now().to_rfc3339(),
            "coverPath": r["coverPath"],
            "tracksCount": r["tracksCount"],
            "minTracks": min_tracks,
            "title": "",
            "description": "",
            "tags": []
        }));
    }
    Ok(result)
}

#[tauri::command]
pub fn add_tracks(
    job_folder: String,
    files: Vec<String>,
    min_tracks: usize,
) -> Result<Value, String> {
    let folder = PathBuf::from(&job_folder);
    if !folder.is_dir() {
        return Err("Папка проекта не найдена".into());
    }
    let temp = folder.join(".manual-inbox");
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let mut moved = Vec::new();
    for raw in files {
        let src = PathBuf::from(&raw);
        if !src.is_file() {
            continue;
        }
        let name = src.file_name().and_then(|x| x.to_str()).unwrap_or("track");
        let dst = temp.join(format!("{}-{}", Uuid::new_v4(), name));
        fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        moved.push(dst.display().to_string());
    }
    let r = ingest_tracks(job_folder, moved, min_tracks);
    let _ = fs::remove_dir_all(temp);
    r
}

#[tauri::command]
pub fn refresh_job(job_folder: String, min_tracks: usize) -> Result<Value, String> {
    let folder = PathBuf::from(job_folder);
    if !folder.is_dir() {
        return Ok(json!({"status":"ERROR","error":"Папка проекта не найдена"}));
    }
    let (status, count, cover, final_path) = job_status(&folder, min_tracks);
    patch_manifest(&folder, status, count)?;
    Ok(json!({
        "status": status,
        "tracksCount": count,
        "finalPath": final_path,
        "coverPath": cover,
        "error": Value::Null
    }))
}

#[cfg(target_os = "macos")]
fn finder_open_args(path: &Path, is_dir: bool) -> Vec<std::ffi::OsString> {
    if is_dir { vec![path.as_os_str().to_os_string()] }
    else { vec![std::ffi::OsString::from("-R"), path.as_os_str().to_os_string()] }
}

#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let raw = PathBuf::from(path.trim());
    if !raw.exists() { return Err(format!("Папка или файл больше не существует: {}", raw.display())); }
    let p = raw.canonicalize().map_err(|e| format!("Не удалось определить точный путь {}: {e}", raw.display()))?;
    #[cfg(target_os = "macos")]
    let mut c = {
        let mut x = Command::new("open");
        x.args(finder_open_args(&p, p.is_dir()));
        x
    };
    #[cfg(target_os = "windows")]
    let mut c = {
        let mut x = Command::new("explorer");
        if p.is_dir(){ x.arg(&p); } else { x.arg(format!("/select,{}", p.display())); }
        x
    };
    #[cfg(target_os = "linux")]
    let mut c = {
        let mut x = Command::new("xdg-open");
        x.arg(if p.is_dir(){p.as_path()}else{p.parent().unwrap_or(Path::new("."))});
        x
    };
    c.spawn().map_err(|e| format!("Не удалось открыть {}: {e}", p.display()))?;
    Ok(())
}

#[cfg(all(test,target_os="macos"))]
mod v1012_finder_tests {
    use super::*;
    #[test]
    fn directory_is_opened_directly_not_revealed_in_parent(){
        let dir=std::env::temp_dir().join(format!("vyron-open-dir-{}",Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let args=finder_open_args(&dir,true);
        assert_eq!(args.len(),1);assert_eq!(args[0],dir.as_os_str());
        let _=fs::remove_dir_all(dir);
    }
    #[test]
    fn file_is_revealed_with_dash_r(){
        let file=PathBuf::from("/tmp/vyron-test-file.txt");let args=finder_open_args(&file,false);
        assert_eq!(args.len(),2);assert_eq!(args[0],std::ffi::OsString::from("-R"));assert_eq!(args[1],file.as_os_str());
    }
}

#[tauri::command]
pub fn open_endlume(path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err("ENDLUME Studio не найден по сохранённому пути".into());
    }
    #[cfg(target_os = "macos")]
    let mut c = {
        let mut x = Command::new("open");
        x.arg(&p);
        x
    };
    #[cfg(target_os = "windows")]
    let mut c = Command::new(&p);
    #[cfg(target_os = "linux")]
    let mut c = {
        let mut x = Command::new("xdg-open");
        x.arg(&p);
        x
    };
    c.spawn().map_err(|e| e.to_string())?;
    Ok(())
}
