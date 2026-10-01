use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "webp"];

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageAsset {
    pub asset_id: String,
    pub channel_id: String,
    pub path: String,
    pub source_path: String,
    pub sha256: String,
    pub imported_at: String,
    pub status: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub job_id: Option<String>,
    #[serde(default)]
    pub assigned_at: Option<String>,
    #[serde(default)]
    pub render_completed_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageLibrary {
    pub schema_version: u32,
    pub channel_id: String,
    pub channel_name: String,
    pub updated_at: String,
    pub assets: Vec<ImageAsset>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageSummary {
    pub total: usize,
    pub available: usize,
    pub assigned: usize,
    pub used: usize,
    pub missing: usize,
    pub root_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MaterialsSummary {
    pub channel_id: String,
    pub image: ImageSummary,
    pub music_library_path: String,
    pub music_total: usize,
    pub music_free: usize,
    pub music_assigned: usize,
    pub music_used: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageImportResult {
    pub added: usize,
    pub duplicates: usize,
    pub skipped: usize,
    pub available: usize,
    pub library_path: String,
}

#[derive(Clone, Debug)]
pub struct ImageAssignment {
    pub asset_id: String,
    pub project_id: String,
    pub job_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct RenderedImageUse {
    pub asset_id: String,
    pub project_id: String,
    pub job_id: Option<String>,
    pub completed_at: String,
}

fn channel_key(raw: &str) -> String {
    let s: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(100)
        .collect();
    if s.is_empty() { "channel".into() } else { s }
}

fn image_root(workspace: &str, channel_id: &str) -> Result<PathBuf, String> {
    if workspace.trim().is_empty() {
        return Err("Workspace VYRON не выбран".into());
    }
    if channel_id.trim().is_empty() {
        return Err("Channel ID не выбран".into());
    }
    let p = PathBuf::from(workspace)
        .join("ProductionManager")
        .join("Materials")
        .join("Images")
        .join(channel_key(channel_id));
    fs::create_dir_all(p.join("master")).map_err(|e| format!("Materials Image Library: {e}"))?;
    Ok(p)
}

fn library_path(workspace: &str, channel_id: &str) -> Result<PathBuf, String> {
    Ok(image_root(workspace, channel_id)?.join("library.json"))
}

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn atomic_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let mut f = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&tmp)
        .map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    if let Some(parent) = path.parent() {
        if let Ok(dir) = fs::File::open(parent) {
            let _ = dir.sync_all();
        }
    }
    Ok(())
}

fn ext(path: &Path) -> String {
    path.extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_supported_image(path: &Path) -> bool {
    IMAGE_EXT.contains(&ext(path).as_str())
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 1024 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

fn load_library(workspace: &str, channel_id: &str) -> Result<ImageLibrary, String> {
    let p = library_path(workspace, channel_id)?;
    let mut lib: ImageLibrary = read_json(&p);
    if lib.schema_version == 0 {
        lib.schema_version = SCHEMA_VERSION;
    }
    if lib.channel_id.is_empty() {
        lib.channel_id = channel_id.to_string();
    }
    if lib.channel_id != channel_id {
        return Err("BLOCK: Image Library channelId mismatch".into());
    }
    let mut changed = false;
    for asset in &mut lib.assets {
        if asset.channel_id.is_empty() {
            asset.channel_id = channel_id.to_string();
            changed = true;
        }
        if asset.channel_id != channel_id {
            return Err("BLOCK: cross-channel image asset detected".into());
        }
        if !Path::new(&asset.path).is_file() && asset.status != "MISSING" {
            asset.status = "MISSING".into();
            changed = true;
        }
    }
    if changed {
        lib.updated_at = Utc::now().to_rfc3339();
        atomic_json(&p, &lib)?;
    }
    Ok(lib)
}

fn save_library(workspace: &str, channel_id: &str, lib: &mut ImageLibrary) -> Result<(), String> {
    lib.schema_version = SCHEMA_VERSION;
    lib.channel_id = channel_id.to_string();
    lib.updated_at = Utc::now().to_rfc3339();
    atomic_json(&library_path(workspace, channel_id)?, lib)
}

pub fn available_images(workspace: &str, channel_id: &str) -> Result<Vec<ImageAsset>, String> {
    let lib = load_library(workspace, channel_id)?;
    Ok(lib
        .assets
        .into_iter()
        .filter(|x| x.status == "AVAILABLE" && x.channel_id == channel_id && Path::new(&x.path).is_file())
        .collect())
}

pub fn image_summary(workspace: &str, channel_id: &str) -> Result<ImageSummary, String> {
    let lib = load_library(workspace, channel_id)?;
    let root = image_root(workspace, channel_id)?;
    let mut out = ImageSummary {
        total: lib.assets.len(),
        root_path: root.to_string_lossy().into_owned(),
        ..Default::default()
    };
    for x in lib.assets {
        match x.status.as_str() {
            "AVAILABLE" => out.available += 1,
            "ASSIGNED" => out.assigned += 1,
            "USED" => out.used += 1,
            "MISSING" => out.missing += 1,
            _ => {}
        }
    }
    Ok(out)
}

pub fn import_images(
    workspace: &str,
    channel_id: &str,
    channel_name: &str,
    files: Vec<String>,
) -> Result<ImageImportResult, String> {
    let root = image_root(workspace, channel_id)?;
    let master = root.join("master");
    let mut lib = load_library(workspace, channel_id)?;
    if lib.channel_name.is_empty() {
        lib.channel_name = channel_name.to_string();
    }
    let mut out = ImageImportResult::default();
    for raw in files {
        let src = PathBuf::from(&raw);
        if !src.is_file() || !is_supported_image(&src) {
            out.skipped += 1;
            continue;
        }
        let sha = hash_file(&src)?;
        if lib.assets.iter().any(|x| x.channel_id == channel_id && x.sha256 == sha && x.status != "MISSING") {
            out.duplicates += 1;
            continue;
        }
        let asset_id = Uuid::new_v4().to_string();
        let extension = ext(&src);
        let dst = master.join(format!("{asset_id}.{extension}"));
        let tmp = master.join(format!(".{asset_id}.{extension}.partial"));
        let _ = fs::remove_file(&tmp);
        fs::copy(&src, &tmp).map_err(|e| format!("Не удалось скопировать изображение: {e}"))?;
        let src_size = fs::metadata(&src).map_err(|e| e.to_string())?.len();
        let dst_size = fs::metadata(&tmp).map_err(|e| e.to_string())?.len();
        if src_size == 0 || src_size != dst_size {
            let _ = fs::remove_file(&tmp);
            return Err("Копия изображения не прошла проверку размера".into());
        }
        fs::rename(&tmp, &dst).map_err(|e| format!("Не удалось завершить импорт изображения: {e}"))?;
        lib.assets.push(ImageAsset {
            asset_id,
            channel_id: channel_id.to_string(),
            path: dst.to_string_lossy().into_owned(),
            source_path: raw,
            sha256: sha,
            imported_at: Utc::now().to_rfc3339(),
            status: "AVAILABLE".into(),
            ..Default::default()
        });
        out.added += 1;
    }
    save_library(workspace, channel_id, &mut lib)?;
    out.available = lib.assets.iter().filter(|x| x.status == "AVAILABLE").count();
    out.library_path = root.to_string_lossy().into_owned();
    Ok(out)
}

pub fn mark_assigned(
    workspace: &str,
    channel_id: &str,
    assignments: &[ImageAssignment],
) -> Result<(), String> {
    if assignments.is_empty() { return Ok(()); }
    let mut lib = load_library(workspace, channel_id)?;
    let now = Utc::now().to_rfc3339();
    for row in assignments {
        let asset = lib
            .assets
            .iter_mut()
            .find(|x| x.asset_id == row.asset_id)
            .ok_or_else(|| format!("Image asset {} не найден", row.asset_id))?;
        if asset.channel_id != channel_id {
            return Err("BLOCK: imageAsset.channelId != project.channelId".into());
        }
        if asset.status == "ASSIGNED" && asset.project_id.as_deref() == Some(row.project_id.as_str()) {
            continue;
        }
        if asset.status != "AVAILABLE" {
            return Err(format!("Image asset {} уже не AVAILABLE", row.asset_id));
        }
        asset.status = "ASSIGNED".into();
        asset.project_id = Some(row.project_id.clone());
        asset.job_id = row.job_id.clone();
        asset.assigned_at = Some(now.clone());
    }
    save_library(workspace, channel_id, &mut lib)
}

pub fn mark_rendered_used(
    workspace: &str,
    channel_id: &str,
    rows: &[RenderedImageUse],
) -> Result<(), String> {
    if rows.is_empty() { return Ok(()); }
    let mut lib = load_library(workspace, channel_id)?;
    let mut changed = false;
    for row in rows {
        let Some(asset) = lib.assets.iter_mut().find(|x| x.asset_id == row.asset_id) else { continue };
        if asset.channel_id != channel_id {
            return Err("BLOCK: imageAsset.channelId != render channelId".into());
        }
        if asset.project_id.as_deref() != Some(row.project_id.as_str()) {
            return Err("BLOCK: rendered project does not own image asset".into());
        }
        if let (Some(expected), Some(actual)) = (asset.job_id.as_deref(), row.job_id.as_deref()) {
            if expected != actual {
                return Err("BLOCK: rendered job does not own image asset".into());
            }
        }
        if asset.status != "USED" || asset.render_completed_at.as_deref() != Some(row.completed_at.as_str()) {
            asset.status = "USED".into();
            asset.render_completed_at = Some(row.completed_at.clone());
            changed = true;
        }
    }
    if changed {
        save_library(workspace, channel_id, &mut lib)?;
    }
    Ok(())
}

fn dynamic_json(path: &Path) -> Value {
    fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Value::Null)
}

fn assigned_music_ids(workspace: &str, channel_id: &str) -> HashSet<String> {
    let mut out = HashSet::new();
    let base = PathBuf::from(workspace)
        .join("ProductionManager")
        .join("Batches")
        .join(channel_key(channel_id));
    let Ok(batches) = fs::read_dir(base) else { return out };
    for batch in batches.flatten() {
        if !batch.file_type().map(|x| x.is_dir()).unwrap_or(false) { continue; }
        let manifest = dynamic_json(&batch.path().join("batch.json"));
        let status = dynamic_json(&batch.path().join("status.json"));
        let completed = status
            .get("projects")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|p| p.get("renderStatus").and_then(Value::as_str) == Some("Completed"))
            .filter_map(|p| p.get("projectId").and_then(Value::as_str))
            .map(str::to_string)
            .collect::<HashSet<_>>();
        for p in manifest.get("projects").and_then(Value::as_array).into_iter().flatten() {
            let pid = p.get("projectId").and_then(Value::as_str).unwrap_or("");
            if completed.contains(pid) { continue; }
            if let Some(tracks) = p.get("tracks").and_then(Value::as_array) {
                for t in tracks {
                    if let Some(id) = t.get("trackId").and_then(Value::as_str) {
                        out.insert(id.to_string());
                    }
                }
            }
        }
    }
    out
}

pub fn materials_summary(workspace: &str, channel_id: &str) -> Result<MaterialsSummary, String> {
    let croot = PathBuf::from(workspace)
        .join("ProductionManager")
        .join("Channels")
        .join(channel_key(channel_id));
    let settings = dynamic_json(&croot.join("settings.json"));
    let index = dynamic_json(&croot.join("music-index.json"));
    let history = dynamic_json(&croot.join("music-history.json"));
    let music_total = index
        .get("tracks")
        .and_then(Value::as_array)
        .map(|x| x.len())
        .unwrap_or(0);
    let music_library_path = index
        .get("libraryPath")
        .and_then(Value::as_str)
        .or_else(|| settings.get("musicLibrary").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let music_used = history
        .get("tracks")
        .and_then(Value::as_object)
        .map(|rows| {
            rows.values()
                .filter(|v| v.get("timesUsed").and_then(Value::as_u64).unwrap_or(0) > 0)
                .count()
        })
        .unwrap_or(0);
    let assigned = assigned_music_ids(workspace, channel_id);
    Ok(MaterialsSummary {
        channel_id: channel_id.to_string(),
        image: image_summary(workspace, channel_id)?,
        music_library_path,
        music_total,
        music_free: music_total.saturating_sub(assigned.len()),
        music_assigned: assigned.len(),
        music_used,
    })
}

pub fn downloads_path() -> Result<String, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Не удалось определить домашнюю папку".to_string())?;
    let p = PathBuf::from(home).join("Downloads");
    Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn import_production_material_images(
    workspace: String,
    channel_id: String,
    channel_name: String,
    files: Vec<String>,
) -> Result<ImageImportResult, String> {
    import_images(&workspace, &channel_id, &channel_name, files)
}

#[tauri::command]
pub async fn production_materials_summary(
    workspace: String,
    channel_id: String,
) -> Result<MaterialsSummary, String> {
    tokio::task::spawn_blocking(move || materials_summary(&workspace, &channel_id))
        .await
        .map_err(|e| format!("Materials worker failed: {e}"))?
}

#[tauri::command]
pub async fn production_materials_summaries(
    workspace: String,
    channel_ids: Vec<String>,
) -> Result<Vec<MaterialsSummary>, String> {
    tokio::task::spawn_blocking(move || {
        channel_ids
            .into_iter()
            .filter_map(|channel_id| materials_summary(&workspace, &channel_id).ok())
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| format!("Materials worker failed: {e}"))
}

#[tauri::command]
pub fn production_materials_downloads_path() -> Result<String, String> {
    downloads_path()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_workspace(label: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("vyron-materials-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn write_image(path: &Path, bytes: &[u8]) {
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn duplicate_import_is_idempotent_per_channel() {
        let w = temp_workspace("dedupe");
        let src = w.join("sample.jpg");
        write_image(&src, b"same-image");
        let a = import_images(w.to_str().unwrap(), "neon", "Neon Drive", vec![src.to_string_lossy().into_owned()]).unwrap();
        let b = import_images(w.to_str().unwrap(), "neon", "Neon Drive", vec![src.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(a.added, 1);
        assert_eq!(b.added, 0);
        assert_eq!(b.duplicates, 1);
        assert_eq!(b.available, 1);
        let _ = fs::remove_dir_all(w);
    }

    #[test]
    fn same_bytes_are_isolated_between_channels() {
        let w = temp_workspace("channel-isolation");
        let src = w.join("sample.png");
        write_image(&src, b"same-image");
        let a = import_images(w.to_str().unwrap(), "neon", "Neon Drive", vec![src.to_string_lossy().into_owned()]).unwrap();
        let b = import_images(w.to_str().unwrap(), "aegean", "Aegean Afterglow", vec![src.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(a.added, 1);
        assert_eq!(b.added, 1);
        assert_eq!(available_images(w.to_str().unwrap(), "neon").unwrap().len(), 1);
        assert_eq!(available_images(w.to_str().unwrap(), "aegean").unwrap().len(), 1);
        let _ = fs::remove_dir_all(w);
    }

    #[test]
    fn assigned_image_becomes_used_after_render() {
        let w = temp_workspace("used-state");
        let src = w.join("sample.webp");
        write_image(&src, b"image-data");
        import_images(w.to_str().unwrap(), "neon", "Neon Drive", vec![src.to_string_lossy().into_owned()]).unwrap();
        let asset = available_images(w.to_str().unwrap(), "neon").unwrap().remove(0);
        mark_assigned(w.to_str().unwrap(), "neon", &[ImageAssignment {
            asset_id: asset.asset_id.clone(),
            project_id: "VIDEO_001".into(),
            job_id: Some("job-1".into()),
        }]).unwrap();
        assert_eq!(image_summary(w.to_str().unwrap(), "neon").unwrap().assigned, 1);
        mark_rendered_used(w.to_str().unwrap(), "neon", &[RenderedImageUse {
            asset_id: asset.asset_id,
            project_id: "VIDEO_001".into(),
            job_id: Some("job-1".into()),
            completed_at: "2026-09-30T00:00:00Z".into(),
        }]).unwrap();
        let summary = image_summary(w.to_str().unwrap(), "neon").unwrap();
        assert_eq!(summary.assigned, 0);
        assert_eq!(summary.used, 1);
        assert_eq!(summary.available, 0);
        let _ = fs::remove_dir_all(w);
    }

    #[test]
    fn wrong_channel_assignment_is_blocked() {
        let w = temp_workspace("wrong-channel");
        let src = w.join("sample.jpg");
        write_image(&src, b"channel-owned-image");
        import_images(w.to_str().unwrap(), "neon", "Neon Drive", vec![src.to_string_lossy().into_owned()]).unwrap();
        let asset = available_images(w.to_str().unwrap(), "neon").unwrap().remove(0);
        let foreign = ImageLibrary {
            schema_version: SCHEMA_VERSION,
            channel_id: "aegean".into(),
            channel_name: "Aegean Afterglow".into(),
            updated_at: Utc::now().to_rfc3339(),
            assets: vec![asset.clone()],
        };
        atomic_json(&library_path(w.to_str().unwrap(), "aegean").unwrap(), &foreign).unwrap();
        let err = mark_assigned(w.to_str().unwrap(), "aegean", &[ImageAssignment {
            asset_id: asset.asset_id,
            project_id: "VIDEO_001".into(),
            job_id: Some("job-aegean".into()),
        }]).unwrap_err();
        assert!(err.contains("cross-channel"));
        let _ = fs::remove_dir_all(w);
    }
}
