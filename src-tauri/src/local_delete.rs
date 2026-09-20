use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashLocalFileResult {
    pub trashed: bool,
    pub missing: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSourceStatus {
    pub path: String,
    pub exists: bool,
    pub is_file: bool,
    pub size: Option<u64>,
    pub modified_at: Option<u128>,
}

#[tauri::command]
pub fn local_source_status(path: String) -> Result<LocalSourceStatus, String> {
    let value = path.trim();
    if value.is_empty() {
        return Err("SOURCE_PATH_EMPTY".into());
    }
    let p = PathBuf::from(value);
    if !p.exists() {
        return Ok(LocalSourceStatus {
            path: value.to_string(),
            exists: false,
            is_file: false,
            size: None,
            modified_at: None,
        });
    }
    let md = fs::metadata(&p).map_err(|e| format!("SOURCE_STAT_FAILED: {e}"))?;
    let modified_at = md
        .modified()
        .ok()
        .and_then(|x| x.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|x| x.as_millis());
    Ok(LocalSourceStatus {
        path: value.to_string(),
        exists: true,
        is_file: md.is_file(),
        size: Some(md.len()),
        modified_at,
    })
}

fn allowed_media(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "mp4" | "mov" | "m4v"
    )
}
fn canonical_allowed_root(raw: &str) -> Option<PathBuf> {
    let p = PathBuf::from(raw.trim());
    if raw.trim().is_empty() || !p.exists() {
        return None;
    }
    let c = p.canonicalize().ok()?;
    if c == PathBuf::from("/") {
        return None;
    }
    if let Ok(home) = std::env::var("HOME") {
        if let Ok(h) = PathBuf::from(home).canonicalize() {
            if c == h {
                return None;
            }
        }
    }
    Some(c)
}
fn validate_trash_path(path: &Path, allowed_roots: &[String]) -> Result<PathBuf, String> {
    if !allowed_media(path) {
        return Err("В Корзину можно переместить только MP4, MOV или M4V".into());
    }
    if !path.exists() {
        return Ok(path.to_path_buf());
    }
    if !path.is_file() {
        return Err("Удаление разрешено только для файла".into());
    }
    let canon = path
        .canonicalize()
        .map_err(|e| format!("Не удалось проверить путь: {e}"))?;
    if canon == PathBuf::from("/") {
        return Err("BLOCK: корневой путь запрещён".into());
    }
    if let Ok(home) = std::env::var("HOME") {
        if let Ok(h) = PathBuf::from(home).canonicalize() {
            if canon == h {
                return Err("BLOCK: HOME запрещён".into());
            }
        }
    }
    let roots = allowed_roots
        .iter()
        .filter_map(|x| canonical_allowed_root(x))
        .collect::<Vec<_>>();
    if roots.is_empty() {
        return Err("BLOCK: нет разрешённых VYRON production roots".into());
    }
    if !roots.iter().any(|r| canon.starts_with(r) && canon != *r) {
        return Err("BLOCK: файл находится вне разрешённых VYRON production roots".into());
    }
    Ok(canon)
}

pub fn trash_local_file_impl(
    path: &str,
    allowed_roots: &[String],
) -> Result<TrashLocalFileResult, String> {
    let value = path.trim();
    if value.is_empty() {
        return Err("Путь видео пуст".into());
    }
    let p = PathBuf::from(value);
    if !allowed_media(&p) {
        return Err("В Корзину можно переместить только MP4, MOV или M4V".into());
    }
    if !p.exists() {
        return Ok(TrashLocalFileResult {
            trashed: false,
            missing: true,
        });
    }
    let safe = validate_trash_path(&p, allowed_roots)?;
    trash::delete(&safe).map_err(|e| format!("Не удалось переместить видео в Корзину: {e}"))?;
    Ok(TrashLocalFileResult {
        trashed: true,
        missing: false,
    })
}


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderFolderVideoFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub created_at: Option<u128>,
    pub modified_at: Option<u128>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderFolderScanResult {
    pub root: String,
    pub files: Vec<RenderFolderVideoFile>,
    pub scanned_entries: usize,
    pub truncated: bool,
}

fn system_time_ms(value: Result<std::time::SystemTime, std::io::Error>) -> Option<u128> {
    value.ok()?.duration_since(std::time::UNIX_EPOCH).ok().map(|x| x.as_millis())
}

fn scan_media_recursive(root: &Path, current: &Path, depth: usize, scanned: &mut usize, truncated: &mut bool, out: &mut Vec<RenderFolderVideoFile>) {
    if depth > 6 || *scanned >= 10000 || out.len() >= 3000 { *truncated = true; return; }
    let Ok(entries) = fs::read_dir(current) else { return };
    for entry in entries.flatten() {
        if *scanned >= 10000 || out.len() >= 3000 { *truncated = true; break; }
        *scanned += 1;
        let p = entry.path(); let Ok(md) = entry.metadata() else { continue };
        if md.is_dir() { scan_media_recursive(root, &p, depth + 1, scanned, truncated, out); continue; }
        if !md.is_file() || !allowed_media(&p) { continue; }
        let Ok(canon) = p.canonicalize() else { continue }; if !canon.starts_with(root) || canon == root { continue; }
        out.push(RenderFolderVideoFile { path: canon.to_string_lossy().into_owned(), name: canon.file_name().and_then(|x| x.to_str()).unwrap_or("").to_string(), size: md.len(), created_at: system_time_ms(md.created()), modified_at: system_time_ms(md.modified()) });
    }
}

pub fn scan_render_folder_impl(path: &str) -> Result<RenderFolderScanResult, String> {
    let root = canonical_allowed_root(path).ok_or_else(|| "RENDER_SCAN_ROOT_INVALID".to_string())?;
    if !root.is_dir() { return Err("RENDER_SCAN_ROOT_NOT_DIRECTORY".into()); }
    let mut files=Vec::new();let mut scanned_entries=0usize;let mut truncated=false;
    scan_media_recursive(&root,&root,0,&mut scanned_entries,&mut truncated,&mut files);files.sort_by(|a,b|a.path.cmp(&b.path));
    Ok(RenderFolderScanResult{root:root.to_string_lossy().into_owned(),files,scanned_entries,truncated})
}

#[tauri::command]
pub fn scan_render_folder(path: String) -> Result<RenderFolderScanResult, String> { scan_render_folder_impl(&path) }

#[tauri::command]
pub fn trash_local_file(
    path: String,
    allowed_roots: Vec<String>,
) -> Result<TrashLocalFileResult, String> {
    trash_local_file_impl(&path, &allowed_roots)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp_root() -> PathBuf {
        let p = std::env::temp_dir().join(format!("vyron-ready-delete-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn missing_mp4_is_a_clean_success() {
        let root = temp_root();
        let p = root.join("missing.mp4");
        let r = trash_local_file_impl(p.to_str().unwrap(), &[root.to_string_lossy().into_owned()])
            .unwrap();
        assert!(r.missing && !r.trashed);
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn directory_is_never_recursively_deleted() {
        let root = temp_root();
        let p = root.join("folder.mp4");
        fs::create_dir_all(&p).unwrap();
        let e = trash_local_file_impl(p.to_str().unwrap(), &[root.to_string_lossy().into_owned()])
            .unwrap_err();
        assert!(e.contains("только для файла"));
        assert!(p.is_dir());
        fs::remove_dir_all(root).unwrap()
    }
    #[test]
    fn non_media_is_rejected() {
        let root = temp_root();
        let p = root.join("note.txt");
        fs::write(&p, b"x").unwrap();
        let e = trash_local_file_impl(p.to_str().unwrap(), &[root.to_string_lossy().into_owned()])
            .unwrap_err();
        assert!(e.contains("MP4, MOV или M4V"));
        assert!(p.exists());
        fs::remove_dir_all(root).unwrap()
    }
    #[test]
    fn path_outside_allowed_root_is_rejected() {
        let root = temp_root();
        let other = temp_root();
        let p = other.join("video.mp4");
        fs::write(&p, b"x").unwrap();
        let e = trash_local_file_impl(p.to_str().unwrap(), &[root.to_string_lossy().into_owned()])
            .unwrap_err();
        assert!(e.contains("вне разрешённых"));
        assert!(p.exists());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(other).unwrap()
    }
    #[test]
    fn root_and_home_are_never_allowed_roots() {
        assert!(canonical_allowed_root("/").is_none());
        if let Ok(home) = std::env::var("HOME") {
            assert!(canonical_allowed_root(&home).is_none())
        }
    }
    #[test]
    fn render_scan_is_local_and_ignores_non_media() {
        let root=temp_root();fs::write(root.join("001 - Ready Videos.mov"),b"video").unwrap();fs::write(root.join("002.mp4"),b"video").unwrap();fs::write(root.join("tracklist.txt"),b"text").unwrap();let nested=root.join("nested");fs::create_dir_all(&nested).unwrap();fs::write(nested.join("003.m4v"),b"video").unwrap();
        let r=scan_render_folder_impl(root.to_str().unwrap()).unwrap();assert_eq!(r.files.len(),3);assert!(!r.files.iter().any(|x|x.name.ends_with(".txt")));fs::remove_dir_all(root).unwrap()
    }
    #[test]
    fn media_types_are_accepted_by_guard() {
        let root = temp_root();
        for ext in ["mp4", "mov", "m4v"] {
            let p = root.join(format!("video.{ext}"));
            fs::write(&p, b"test").unwrap();
            let safe = validate_trash_path(&p, &[root.to_string_lossy().into_owned()]).unwrap();
            assert!(safe.ends_with(format!("video.{ext}")));
            fs::remove_file(p).unwrap()
        }
        fs::remove_dir_all(root).unwrap()
    }
}
