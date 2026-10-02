use serde_json::{json,Value};
use std::{env,fs,path::{Path,PathBuf}};

fn enabled()->bool{
    env::var("VYRON_M1_PERF_PROBE").ok().as_deref()==Some("1")
}

fn allowed_isolated_root(root:&Path,temp_root:&Path,runner_temp:Option<&Path>)->bool{
    root.is_absolute()&&(root.starts_with(temp_root)||runner_temp.map(|p|root.starts_with(p)).unwrap_or(false))
}

fn validated_storage_root(create:bool)->Result<PathBuf,String>{
    if !enabled(){return Err("PERFORMANCE_PROBE_DISABLED".into())}
    let raw=env::var("VYRON_M1_PERF_ROOT").map_err(|_|"PERFORMANCE_PROBE_NOT_ISOLATED: VYRON_M1_PERF_ROOT missing".to_string())?;
    let root=PathBuf::from(raw);
    let runner=env::var("RUNNER_TEMP").ok().map(PathBuf::from);
    if !allowed_isolated_root(&root,&env::temp_dir(),runner.as_deref()){
        return Err(format!("PERFORMANCE_PROBE_NOT_ISOLATED: root={} must be under OS temp or RUNNER_TEMP",root.display()))
    }
    if create{
        fs::create_dir_all(&root).map_err(|e|format!("PERFORMANCE_PROBE_ROOT_MKDIR: {e}"))?;
        fs::write(root.join(".vyron-m1-performance-root"),format!("pid={}\n",std::process::id()))
            .map_err(|e|format!("PERFORMANCE_PROBE_ROOT_MARKER: {e}"))?;
    }
    Ok(root)
}

pub(crate) fn performance_storage_root()->Result<PathBuf,String>{validated_storage_root(true)}

#[tauri::command]
pub fn performance_probe_enabled()->bool{enabled()}

#[tauri::command]
pub fn performance_probe_assert_isolated()->Result<String,String>{
    Ok(performance_storage_root()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn performance_probe_cleanup()->Result<Value,String>{
    let root=validated_storage_root(false)?;
    let existed=root.exists();
    if existed{fs::remove_dir_all(&root).map_err(|e|format!("PERFORMANCE_PROBE_CLEANUP: {e}"))?;}
    Ok(json!({"root":root.to_string_lossy(),"removed":existed}))
}

#[tauri::command]
pub fn performance_probe_css_variant()->Result<String,String>{
    if !enabled(){return Err("PERFORMANCE_PROBE_DISABLED".into())}
    if env::var("VYRON_M1_PARITY_DIAG").ok().as_deref()!=Some("1"){
        return Err("M1_CSS_VARIANT_REQUIRES_DIAGNOSTIC_BUILD".into())
    }
    let variant=env::var("VYRON_M1_CSS_VARIANT").unwrap_or_else(|_|"base".into()).to_ascii_lowercase();
    match variant.as_str(){
        "base"|"shadows"|"gradients"|"transitions"|"filters"|"opaque"|"pseudo"=>Ok(variant),
        _=>Err(format!("INVALID_M1_CSS_VARIANT:{variant}"))
    }
}

#[tauri::command]
pub fn performance_probe_report(mut payload:Value)->Result<String,String>{
    if !enabled(){return Err("PERFORMANCE_PROBE_DISABLED".into())}
    validated_storage_root(false)?;
    let path=env::var("VYRON_M1_PERF_REPORT")
        .map(PathBuf::from)
        .unwrap_or_else(|_|env::temp_dir().join("vyron-m1-performance.json"));
    if env::var("VYRON_M1_PARITY_DIAG").ok().as_deref()==Some("1"){
        if let Value::Object(ref mut map)=payload{
            map.insert("parityRunner".into(),json!({
                "architecture":env::var("VYRON_M1_PARITY_RUNNER_ARCH").unwrap_or_default(),
                "macOS":env::var("VYRON_M1_PARITY_MACOS").unwrap_or_default(),
                "baseHead":env::var("VYRON_M1_PARITY_BASE_HEAD").unwrap_or_default()
            }));
        }
    }
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|format!("PERFORMANCE_PROBE_MKDIR: {e}"))?;}
    let tmp=path.with_extension(format!("tmp-{}",std::process::id()));
    fs::write(&tmp,serde_json::to_vec_pretty(&payload).map_err(|e|format!("PERFORMANCE_PROBE_SERIALIZE: {e}"))?)
        .map_err(|e|format!("PERFORMANCE_PROBE_WRITE: {e}"))?;
    if path.exists(){fs::remove_file(&path).map_err(|e|format!("PERFORMANCE_PROBE_REPLACE: {e}"))?;}
    fs::rename(&tmp,&path).map_err(|e|format!("PERFORMANCE_PROBE_RENAME: {e}"))?;
    let out=path.to_string_lossy().to_string();
    if env::var("VYRON_M1_PARITY_EXIT_AFTER_REPORT").ok().as_deref()==Some("1"){
        std::process::exit(0);
    }
    Ok(out)
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn isolation_accepts_only_temp_roots(){
        let temp=Path::new("/tmp");
        assert!(allowed_isolated_root(Path::new("/tmp/vyron-m1-performance-1"),temp,None));
        assert!(!allowed_isolated_root(Path::new("/Users/kirill/Library/Application Support/studio.channelflow.desktop"),temp,None));
        assert!(!allowed_isolated_root(Path::new("relative/vyron-m1"),temp,None));
    }
    #[test]
    fn runner_temp_is_explicitly_allowed(){
        assert!(allowed_isolated_root(Path::new("/Users/runner/work/_temp/vyron-m1-profile"),Path::new("/private/tmp"),Some(Path::new("/Users/runner/work/_temp"))));
    }
}
