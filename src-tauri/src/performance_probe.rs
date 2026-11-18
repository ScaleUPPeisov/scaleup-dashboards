use chrono::Utc;
use serde::Serialize;
use serde_json::{json,Value};
use std::{env,fs,path::{Path,PathBuf}};
#[cfg(target_os="macos")]
use std::process::Command;

const OWNER_REPORT_MAX_BYTES:usize=1024*1024;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct PerformanceRuntimeSample{
    cpu_percent:Option<f64>,
    rss_bytes:Option<u64>,
    captured_at:String,
}

fn sensitive_report_key(key:&str)->bool{
    let normalized:String=key.chars().filter(|c|c.is_ascii_alphanumeric()).flat_map(|c|c.to_lowercase()).collect();
    ["token","secret","password","privatekey","apikey","credential"].iter().any(|part|normalized.contains(part))
}

fn validate_owner_report(value:&Value)->Result<(),String>{
    match value{
        Value::Object(map)=>for(key,value) in map{
            if sensitive_report_key(key){return Err(format!("PERFORMANCE_REPORT_SENSITIVE_KEY: {key}"))}
            validate_owner_report(value)?;
        },
        Value::Array(rows)=>for value in rows{validate_owner_report(value)?},
        _=>{}
    }
    Ok(())
}

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
pub fn performance_probe_report(payload:Value)->Result<String,String>{
    if !enabled(){return Err("PERFORMANCE_PROBE_DISABLED".into())}
    validated_storage_root(false)?;
    let path=env::var("VYRON_M1_PERF_REPORT")
        .map(PathBuf::from)
        .unwrap_or_else(|_|env::temp_dir().join("vyron-m1-performance.json"));
    if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|format!("PERFORMANCE_PROBE_MKDIR: {e}"))?;}
    let tmp=path.with_extension(format!("tmp-{}",std::process::id()));
    fs::write(&tmp,serde_json::to_vec_pretty(&payload).map_err(|e|format!("PERFORMANCE_PROBE_SERIALIZE: {e}"))?)
        .map_err(|e|format!("PERFORMANCE_PROBE_WRITE: {e}"))?;
    if path.exists(){fs::remove_file(&path).map_err(|e|format!("PERFORMANCE_PROBE_REPLACE: {e}"))?;}
    fs::rename(&tmp,&path).map_err(|e|format!("PERFORMANCE_PROBE_RENAME: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn performance_runtime_sample()->PerformanceRuntimeSample{
    let mut cpu_percent=None;
    let mut rss_bytes=None;
    #[cfg(target_os="macos")]
    if let Ok(output)=Command::new("/bin/ps").args(["-o","%cpu=,rss=","-p",&std::process::id().to_string()]).output(){
        if output.status.success(){
            let text=String::from_utf8_lossy(&output.stdout);
            let mut fields=text.split_whitespace();
            cpu_percent=fields.next().and_then(|x|x.parse::<f64>().ok());
            rss_bytes=fields.next().and_then(|x|x.parse::<u64>().ok()).map(|kb|kb.saturating_mul(1024));
        }
    }
    PerformanceRuntimeSample{cpu_percent,rss_bytes,captured_at:Utc::now().to_rfc3339()}
}

#[tauri::command]
pub fn performance_diagnostic_export(path:String,payload:Value)->Result<String,String>{
    validate_owner_report(&payload)?;
    let path=PathBuf::from(path);
    if !path.is_absolute(){return Err("PERFORMANCE_REPORT_PATH_NOT_ABSOLUTE".into())}
    if path.extension().and_then(|x|x.to_str()).map(|x|x.eq_ignore_ascii_case("json"))!=Some(true){
        return Err("PERFORMANCE_REPORT_EXTENSION_MUST_BE_JSON".into())
    }
    let parent=path.parent().ok_or_else(||"PERFORMANCE_REPORT_PARENT_MISSING".to_string())?;
    if !parent.is_dir(){return Err("PERFORMANCE_REPORT_PARENT_NOT_FOUND".into())}
    let bytes=serde_json::to_vec_pretty(&payload).map_err(|e|format!("PERFORMANCE_REPORT_SERIALIZE: {e}"))?;
    if bytes.len()>OWNER_REPORT_MAX_BYTES{return Err("PERFORMANCE_REPORT_TOO_LARGE".into())}
    let tmp=parent.join(format!(".vyron-performance-{}-{}.tmp",std::process::id(),Utc::now().timestamp_millis()));
    fs::write(&tmp,bytes).map_err(|e|format!("PERFORMANCE_REPORT_WRITE: {e}"))?;
    #[cfg(target_os="windows")]
    if path.exists(){fs::remove_file(&path).map_err(|e|format!("PERFORMANCE_REPORT_REPLACE: {e}"))?;}
    fs::rename(&tmp,&path).map_err(|e|format!("PERFORMANCE_REPORT_RENAME: {e}"))?;
    Ok(path.to_string_lossy().to_string())
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
    #[test]
    fn owner_report_rejects_secret_shaped_keys(){
        assert!(validate_owner_report(&json!({"runtime":{"rssMb":42}})).is_ok());
        assert!(validate_owner_report(&json!({"oauth":{"access_token":"hidden"}})).is_err());
        assert!(validate_owner_report(&json!({"clientSecret":"hidden"})).is_err());
    }
}

