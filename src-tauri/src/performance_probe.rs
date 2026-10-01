use serde_json::Value;
use std::{fs,path::PathBuf};

fn enabled()->bool{
    std::env::var("VYRON_M1_PERF_PROBE").ok().as_deref()==Some("1")
}

#[tauri::command]
pub fn performance_probe_enabled()->bool{enabled()}

#[tauri::command]
pub fn performance_probe_report(payload:Value)->Result<String,String>{
    if !enabled(){return Err("PERFORMANCE_PROBE_DISABLED".into())}
    let path=std::env::var("VYRON_M1_PERF_REPORT")
        .map(PathBuf::from)
        .unwrap_or_else(|_|std::env::temp_dir().join("vyron-m1-performance.json"));
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|format!("PERFORMANCE_PROBE_MKDIR: {e}"))?;}
    let tmp=path.with_extension(format!("tmp-{}",std::process::id()));
    fs::write(&tmp,serde_json::to_vec_pretty(&payload).map_err(|e|format!("PERFORMANCE_PROBE_SERIALIZE: {e}"))?)
        .map_err(|e|format!("PERFORMANCE_PROBE_WRITE: {e}"))?;
    if path.exists(){fs::remove_file(&path).map_err(|e|format!("PERFORMANCE_PROBE_REPLACE: {e}"))?;}
    fs::rename(&tmp,&path).map_err(|e|format!("PERFORMANCE_PROBE_RENAME: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}
