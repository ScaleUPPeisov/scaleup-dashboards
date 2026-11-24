use std::{fs, path::{Path, PathBuf}};

/// The experimental branch never derives its writable root from the bundle ID:
/// the base configuration still carries the stable ID and must not redirect
/// these paths into the stable application's data.
pub(crate) fn private_child_dir(base: &Path, name: &str) -> Result<PathBuf, String> {
    if !base.is_absolute() {
        return Err("APEX_DATA_BASE_NOT_ABSOLUTE".into());
    }
    if Path::new(name).components().count() != 1 || !matches!(Path::new(name).components().next(), Some(std::path::Component::Normal(_))) {
        return Err("APEX_DATA_NAME_INVALID".into());
    }
    let base = fs::canonicalize(base).map_err(|e| format!("APEX_DATA_BASE_UNAVAILABLE: {e}"))?;
    let root = base.join(name);
    match fs::symlink_metadata(&root) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("APEX_DATA_ROOT_NOT_PRIVATE_DIRECTORY".into());
        }
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let mut builder = fs::DirBuilder::new();
            #[cfg(unix)] {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            match builder.create(&root) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(format!("APEX_DATA_ROOT_CREATE_FAILED: {e}")),
            }
        }
        Err(e) => return Err(format!("APEX_DATA_ROOT_STAT_FAILED: {e}")),
    }
    let metadata = fs::symlink_metadata(&root).map_err(|e|format!("APEX_DATA_ROOT_STAT_FAILED: {e}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() || fs::canonicalize(&root).map_err(|e|e.to_string())? != root {
        return Err("APEX_DATA_ROOT_NOT_PRIVATE_DIRECTORY".into());
    }
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err("APEX_DATA_ROOT_PERMISSIONS_TOO_OPEN".into());
        }
    }
    Ok(root)
}

pub(crate) fn private_data_dir(base: &Path) -> Result<PathBuf, String> {
    private_child_dir(base, "studio.channelflow.apex")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_base() -> PathBuf {
        let name = format!("vyron-apex-paths-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos());
        let path = std::env::temp_dir().join(name);
        fs::create_dir(&path).unwrap();
        path
    }

    #[test]
    fn creates_distinct_private_root_and_rejects_relative_base() {
        let base = temp_base();
        let root = private_data_dir(&base).unwrap();
        assert_eq!(root.file_name().unwrap(), "studio.channelflow.apex");
        assert_ne!(root, fs::canonicalize(&base).unwrap().join("studio.channelflow.desktop"));
        assert_eq!(private_data_dir(&base).unwrap(), root);
        assert!(private_data_dir(Path::new("relative")).is_err());
        assert!(private_child_dir(&root, "../escape").is_err());
        assert_eq!(private_child_dir(&root, "Documents").unwrap(), root.join("Documents"));
        fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_or_accessible_root() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let base = temp_base();
        let target = base.join("target");
        fs::create_dir(&target).unwrap();
        let root = base.join("studio.channelflow.apex");
        symlink(&target, &root).unwrap();
        assert!(private_data_dir(&base).is_err());
        fs::remove_file(&root).unwrap();
        let private = private_data_dir(&base).unwrap();
        symlink(&target, private.join("Documents")).unwrap();
        assert!(private_child_dir(&private, "Documents").is_err());
        fs::remove_file(private.join("Documents")).unwrap();
        fs::remove_dir(&root).unwrap();
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(private_data_dir(&base).is_err());
        fs::remove_dir_all(base).unwrap();
    }
}
