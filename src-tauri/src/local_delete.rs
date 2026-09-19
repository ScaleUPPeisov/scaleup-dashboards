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
fn home_dir_from_env() -> Option<PathBuf> {
    let key = if cfg!(target_os = "windows") { "USERPROFILE" } else { "HOME" };
    std::env::var_os(key).map(PathBuf::from)
}
fn is_filesystem_root(path: &Path) -> bool {
    path.parent().is_none()
}
fn canonical_allowed_root(raw: &str) -> Option<PathBuf> {
    let p = PathBuf::from(raw.trim());
    if raw.trim().is_empty() || !p.exists() { return None; }
    let c = p.canonicalize().ok()?;
    if is_filesystem_root(&c) { return None; }
    if let Some(home) = home_dir_from_env() {
        if let Ok(h) = home.canonicalize() {
            if c == h { return None; }
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
    if is_filesystem_root(&canon) {
        return Err("BLOCK: корневой путь запрещён".into());
    }
    if let Some(home) = home_dir_from_env() {
        if let Ok(h) = home.canonicalize() {
            if canon == h { return Err("BLOCK: домашняя папка запрещена".into()); }
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
        #[cfg(not(target_os = "windows"))]
        assert!(canonical_allowed_root("/").is_none());
        #[cfg(target_os = "windows")]
        if let Some(root) = std::env::var_os("SystemDrive").map(|x| format!("{}\\", x.to_string_lossy())) {
            assert!(canonical_allowed_root(&root).is_none())
        }
        if let Some(home) = home_dir_from_env() {
            assert!(canonical_allowed_root(&home.to_string_lossy()).is_none())
        }
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
