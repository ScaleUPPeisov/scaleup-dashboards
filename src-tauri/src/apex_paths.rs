use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub(crate) fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().data_dir().map_err(|e|format!("APEX_DATA_BASE_UNAVAILABLE: {e}"))?;
    crate::apex_paths_fs::private_data_dir(&base)
}

pub(crate) fn documents_root(app: &AppHandle) -> Result<PathBuf, String> {
    crate::apex_paths_fs::private_child_dir(&data_dir(app)?, "Documents")
}
