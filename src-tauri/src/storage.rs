use crate::security;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};

static STATE_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
fn state_write_lock() -> &'static Mutex<()> { STATE_WRITE_LOCK.get_or_init(|| Mutex::new(())) }

fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join("state.json"))
}


fn state_mirror_dir(app:&AppHandle)->Result<PathBuf,String>{
    let root=app.path().document_dir().map_err(|e|format!("VYRON documents path: {e}"))?.join("VYRON").join("State");
    fs::create_dir_all(&root).map_err(|e|format!("VYRON state mirror mkdir: {e}"))?;
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        let _=fs::set_permissions(&root,fs::Permissions::from_mode(0o700));
    }
    Ok(root)
}
fn state_mirror_file(app:&AppHandle)->Result<PathBuf,String>{Ok(state_mirror_dir(app)?.join("app-state.json"))}
fn mapping_snapshot(state:&Value)->Value{
    let rows=state.get("channels").and_then(Value::as_array).cloned().unwrap_or_default();
    Value::Array(rows.into_iter().map(|c|json!({
        "id":c.get("id").cloned().unwrap_or(Value::Null),
        "name":c.get("name").cloned().unwrap_or(Value::Null),
        "youtubeProfileId":c.get("youtubeProfileId").cloned().unwrap_or(Value::Null),
        "youtubeChannelId":c.get("youtubeChannelId").cloned().unwrap_or(Value::Null),
        "renderFolderPath":c.get("renderFolderPath").cloned().unwrap_or(Value::Null),
        "projectsFolderPath":c.get("projectsFolderPath").cloned().unwrap_or(Value::Null)
    })).collect())
}
fn write_state_mirror(app:&AppHandle,state:&Value)->Result<(),String>{
    let dir=state_mirror_dir(app)?;
    atomic_write(&dir.join("app-state.json"),state)?;
    atomic_write(&dir.join("channels.json"),&state.get("channels").cloned().unwrap_or_else(||json!([])))?;
    atomic_write(&dir.join("mappings.json"),&mapping_snapshot(state))?;
    Ok(())
}

fn default_state() -> Value {
    json!({"version":10,"channels":[],"jobs":[],"competitors":[],"settings":{"workspace":"","endlumePath":"","youtubeApiKey":"","autoCheckUpdates":true,"reduceMotion":false,"fpsMonitor":true},"logs":[],"uploadHistory":[],"activityJournal":[],"statisticsHistory":{},"fingerprintCache":{},"projectLifecycle":{}})
}

fn exact_two_digits(value:&str)->bool{value.len()==2&&value.bytes().all(|b|b.is_ascii_digit())}
fn strict_performance_channel(value:&Value)->bool{
    let id=value.get("id").and_then(Value::as_str).unwrap_or("");
    let name=value.get("name").and_then(Value::as_str).unwrap_or("");
    id.strip_prefix("perf-channel-").map(exact_two_digits).unwrap_or(false)
        &&name.strip_prefix("Performance Channel ").map(exact_two_digits).unwrap_or(false)
}
fn strict_performance_job(value:&Value)->bool{
    let id=value.get("id").and_then(Value::as_str).unwrap_or("");
    let channel=value.get("channelId").and_then(Value::as_str).unwrap_or("");
    id.strip_prefix("perf-job-").map(|x|x.len()==4&&x.bytes().all(|b|b.is_ascii_digit())).unwrap_or(false)
        &&channel.strip_prefix("perf-channel-").map(exact_two_digits).unwrap_or(false)
}
fn performance_fixture_counts(state:&Value)->(usize,usize){
    let channels=state.get("channels").and_then(Value::as_array).map(|x|x.iter().filter(|v|strict_performance_channel(v)).count()).unwrap_or(0);
    let jobs=state.get("jobs").and_then(Value::as_array).map(|x|x.iter().filter(|v|strict_performance_job(v)).count()).unwrap_or(0);
    (channels,jobs)
}
fn strip_performance_fixtures(mut state:Value)->(Value,usize,usize){
    let mut removed_channels=0usize;let mut removed_jobs=0usize;
    if let Some(rows)=state.get_mut("channels").and_then(Value::as_array_mut){
        rows.retain(|v|{let synthetic=strict_performance_channel(v);if synthetic{removed_channels+=1};!synthetic});
    }
    if let Some(rows)=state.get_mut("jobs").and_then(Value::as_array_mut){
        rows.retain(|v|{let synthetic=strict_performance_job(v);if synthetic{removed_jobs+=1};!synthetic});
    }
    (state,removed_channels,removed_jobs)
}

const STATE_YOUTUBE_API_KEY: &str = "state.youtubeApiKey";
const STATE_OPENAI_API_KEY: &str = "state.openaiApiKey";

fn state_secret(state: &Value, key: &str) -> String {
    state
        .get("settings")
        .and_then(Value::as_object)
        .and_then(|x| x.get(key))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}
fn set_state_secret(state: &mut Value, key: &str, value: &str) {
    if let Some(x) = state.get_mut("settings").and_then(Value::as_object_mut) {
        x.insert(key.into(), json!(value));
    }
}

fn sanitized_state_for_disk(state: &Value) -> Value {
    let mut disk = state.clone();
    for field in ["youtubeApiKey", "openaiApiKey"] {
        set_state_secret(&mut disk, field, "");
    }
    disk
}
fn secure_state_for_disk(state: &Value) -> Result<(Value, bool), String> {
    let disk = sanitized_state_for_disk(state);
    let mut migrated = false;
    for (field, account) in [
        ("youtubeApiKey", STATE_YOUTUBE_API_KEY),
        ("openaiApiKey", STATE_OPENAI_API_KEY),
    ] {
        let value = state_secret(state, field);
        if !value.is_empty() {
            security::canonical_set_secret(account, &value)?;
            migrated = true;
        }
    }
    Ok((disk, migrated))
}
fn secure_state_for_disk_best_effort(state: &Value) -> (Value, Vec<String>) {
    let disk = sanitized_state_for_disk(state);
    let mut warnings = Vec::new();
    for (field, account) in [
        ("youtubeApiKey", STATE_YOUTUBE_API_KEY),
        ("openaiApiKey", STATE_OPENAI_API_KEY),
    ] {
        let value = state_secret(state, field);
        if !value.is_empty() {
            if let Err(e) = security::canonical_set_secret(account, &value) {
                warnings.push(e)
            }
        }
    }
    (disk, warnings)
}
fn legacy_state_secret_for_operation(app:&AppHandle,field:&str)->Result<Option<String>,String>{
    let path=state_file(app)?;
    if !path.exists(){return Ok(None)}
    let raw=fs::read(&path).map_err(|e|format!("state read: {e}"))?;
    let state:Value=serde_json::from_slice(&raw).map_err(|e|format!("state parse: {e}"))?;
    let value=state_secret(&state,field);
    Ok((!value.is_empty()).then_some(value))
}
fn secret_for_operation(app:&AppHandle,field:&str,account:&str)->Result<String,String>{
    if let Some(v)=security::canonical_get_secret_cached(account)?{if !v.is_empty(){return Ok(v)}}
    if let Some(v)=legacy_state_secret_for_operation(app,field)?{
        // One-time legacy migration is allowed only from an explicit secret-required operation.
        security::canonical_set_secret(account,&v)?;
        let path=state_file(app)?;
        let raw=fs::read(&path).map_err(|e|format!("state read: {e}"))?;
        let state:Value=serde_json::from_slice(&raw).map_err(|e|format!("state parse: {e}"))?;
        atomic_write(&path,&sanitized_state_for_disk(&state))?;
        return Ok(v)
    }
    Err(format!("CREDENTIAL_MISSING: {field} is not configured"))
}
pub(crate) fn youtube_api_key_for_operation(app:&AppHandle,provided:&str)->Result<String,String>{if !provided.trim().is_empty(){Ok(provided.trim().to_string())}else{secret_for_operation(app,"youtubeApiKey",STATE_YOUTUBE_API_KEY)}}
pub(crate) fn openai_api_key_for_operation(app:&AppHandle,provided:&str)->Result<String,String>{if !provided.trim().is_empty(){Ok(provided.trim().to_string())}else{secret_for_operation(app,"openaiApiKey",STATE_OPENAI_API_KEY)}}

fn migrated_workspace_path(raw: &str) -> Option<PathBuf> {
    let p = PathBuf::from(raw);
    if p.file_name().and_then(|x| x.to_str()) != Some("ChannelFlow") || !p.exists() {
        return None;
    }
    let parent = p.parent()?;
    let target = parent.join("VYRON");
    if target.exists() {
        return Some(target);
    }
    match fs::rename(&p, &target) {
        Ok(_) => Some(target),
        Err(_) => None,
    }
}

fn migrate_state(mut state: Value) -> (Value, bool) {
    let mut changed = false;
    if let Some(settings) = state.get_mut("settings").and_then(Value::as_object_mut) {
        if let Some(raw) = settings
            .get("workspace")
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            if let Some(new_path) = migrated_workspace_path(&raw) {
                settings.insert("workspace".into(), json!(new_path.display().to_string()));
                changed = true;
            }
        }
    }
    let version = state.get("version").and_then(Value::as_u64).unwrap_or(0);
    if version < 10 {
        if state.get("uploadHistory").is_none() {
            state["uploadHistory"] = json!([]);
        }
        if state.get("activityJournal").is_none() {
            state["activityJournal"] = json!([]);
        }
        if state.get("statisticsHistory").is_none() {
            state["statisticsHistory"] = json!({});
        }
        if state.get("fingerprintCache").is_none() {
            state["fingerprintCache"] = json!({});
        }
        if state.get("projectLifecycle").is_none() {
            state["projectLifecycle"] = json!({});
        }
        state["version"] = json!(10);
        changed = true;
    }
    (state, changed)
}

// macOS: atomic replace on the SAME volume, without unlinking the existing state.
// Keep two previous verified generations. Never migrate the user's Keychain here.
#[cfg(target_os="macos")]
fn durable_replace(path:&Path,bytes:&[u8])->Result<(),String>{
    use std::fs::{File,OpenOptions};
    use std::io::Write;
    let parent=path.parent().ok_or("STATE_INVALID_PARENT")?;
    fs::create_dir_all(parent).map_err(|e|format!("STATE_PARENT: {e}"))?;
    let nonce=uuid::Uuid::new_v4().to_string();
    let temp=path.with_extension(format!("write-{nonce}.tmp"));
    let backup=path.with_extension("bak");
    let backup2=path.with_extension("bak2");
    let is_state=matches!(path.file_name().and_then(|x|x.to_str()),Some("state.json"|"app-state.json"));

    fn synced_file(path:&Path,bytes:&[u8])->Result<(),String>{
        use std::fs::OpenOptions;
        use std::io::Write;
        let mut output=OpenOptions::new().write(true).create_new(true).open(path)
            .map_err(|e|format!("STATE_CREATE: {e}"))?;
        security::private_permissions(path)?;
        output.write_all(bytes).map_err(|e|format!("STATE_WRITE: {e}"))?;
        output.sync_all().map_err(|e|format!("STATE_SYNC: {e}"))?;
        Ok(())
    }

    let result=(||->Result<(),String>{
        synced_file(&temp,bytes)?;
        // Verify the serialized new state before touching the last known good copy.
        let candidate:Value=serde_json::from_slice(&fs::read(&temp).map_err(|e|e.to_string())?)
            .map_err(|e|format!("STATE_NEW_INVALID: {e}"))?;
        if is_state&&!state_looks_valid(&candidate){return Err("STATE_NEW_SCHEMA_INVALID".into())}
        if path.exists(){
            let prior=fs::read(path).map_err(|e|format!("STATE_OLD_READ: {e}"))?;
            if serde_json::from_slice::<Value>(&prior).ok().as_ref()
                .map(|v|!is_state||state_looks_valid(v)).unwrap_or(false){
                if backup.exists(){
                    if let Ok(bytes)=fs::read(&backup){
                        if serde_json::from_slice::<Value>(&bytes).ok().as_ref()
                            .map(|v|!is_state||state_looks_valid(v)).unwrap_or(false){
                            let previous=path.with_extension(format!("backup2-{nonce}.tmp"));
                            let second=(||->Result<(),String>{
                                synced_file(&previous,&bytes)?;
                                fs::rename(&previous,&backup2).map_err(|e|format!("STATE_BACKUP2_REPLACE: {e}"))
                            })();
                            if second.is_err(){let _=fs::remove_file(&previous);}
                            second?;
                        }
                    }
                }
                let new_backup=path.with_extension(format!("backup-{nonce}.tmp"));
                let prepared=(||->Result<(),String>{
                    synced_file(&new_backup,&prior)?;
                    fs::rename(&new_backup,&backup).map_err(|e|format!("STATE_BACKUP_REPLACE: {e}"))
                })();
                if prepared.is_err(){let _=fs::remove_file(&new_backup);}
                prepared?;
            }else{
                // Preserve corrupt bytes separately, never silently replace or destroy them.
                let corrupt=path.with_extension(format!("corrupt-{nonce}.json"));
                synced_file(&corrupt,&prior)?;
            }
        }
        // On macOS rename over an existing regular file is an atomic replacement.
        fs::rename(&temp,path).map_err(|e|format!("STATE_ATOMIC_RENAME: {e}"))?;
        security::private_permissions(path)?;
        // Best effort to flush directory metadata: failure does not mean the
        // already-replaced state was not written.
        let _=File::open(parent).and_then(|dir|dir.sync_all());
        Ok(())
    })();
    if result.is_err(){let _=fs::remove_file(&temp);}
    result
}

#[cfg(target_os="macos")]
fn atomic_write(path:&Path,state:&Value)->Result<(),String>{
    let bytes=serde_json::to_vec_pretty(state).map_err(|e|e.to_string())?;
    durable_replace(path,&bytes)
}

// Keep non-macOS application behavior untouched.
#[cfg(not(target_os="macos"))]
fn atomic_write(path: &Path, state: &Value) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    if path.exists() {
        let bak = path.with_extension("bak");
        let _ = fs::copy(path, bak);
        let _ = fs::remove_file(path);
    }
    fs::rename(tmp, path).map_err(|e| e.to_string())?;
    security::private_permissions(path)?;
    let bak = path.with_extension("bak");
    if bak.exists() { let _ = security::private_permissions(&bak); }
    Ok(())
}

fn state_looks_valid(v:&Value)->bool{
    v.as_object().is_some() &&
        v.get("channels").and_then(Value::as_array).is_some() &&
        v.get("jobs").and_then(Value::as_array).is_some() &&
        v.get("settings").and_then(Value::as_object).is_some()
}
fn load_valid_candidate(path:&Path)->Option<Value>{
    let bytes=fs::read(path).ok()?;
    let state:Value=serde_json::from_slice(&bytes).ok()?;
    state_looks_valid(&state).then_some(state)
}

// Kept synchronous for internal migration callers. The interactive startup
// instead uses load_state_in_background to avoid blocking the AppKit dispatcher.
#[tauri::command]
pub fn load_state(app: AppHandle) -> Value {
    let path = match state_file(&app) {
        Ok(p) => p,
        Err(_) => return default_state(),
    };
    let primary=load_valid_candidate(&path);
    let recovered_from_mirror=primary.is_none();
    let mirror=state_mirror_file(&app).ok().and_then(|p|load_valid_candidate(&p));
    let backup=load_valid_candidate(&path.with_extension("bak"));
    let backup2=load_valid_candidate(&path.with_extension("bak2"));
    let recovered=primary.or(mirror).or(backup).or(backup2);
    // If an existing file cannot be recovered, NEVER replace it with a blank
    // collection of channels. Return an explicit blocking marker to the UI.
    if recovered.is_none() && path.exists(){
        let mut safe=default_state();
        safe["__stateRecoveryRequired"]=json!(true);
        safe["__stateRecoveryError"]=json!("STATE_UNRECOVERABLE: primary/mirror/backups invalid. Original data preserved; saving blocked.");
        return safe;
    }
    let raw=recovered.unwrap_or_else(default_state);
    let (migrated, changed) = migrate_state(raw);
    let (state,removed_channels,removed_jobs)=strip_performance_fixtures(migrated);
    let repaired=removed_channels>0||removed_jobs>0;
    let legacy_plaintext=!state_secret(&state,"youtubeApiKey").is_empty()||!state_secret(&state,"openaiApiKey").is_empty();
    let mut disk=sanitized_state_for_disk(&state);
    // Passive startup must never read/write Keychain or trigger legacy secret migration.
    // Strict performance fixtures are removed before either the UI or state mirror sees them.
    if (changed||recovered_from_mirror||repaired)&&!legacy_plaintext{let _=atomic_write(&path,&disk);}else if path.exists(){let _=security::private_permissions(&path);}
    let _=write_state_mirror(&app,&disk);
    if repaired{disk["__performanceRepair"]=json!({"removedChannels":removed_channels,"removedJobs":removed_jobs});}
    disk
}

// Disk reads, backup validation and mirror writes can stall on slow storage.
// Dispatch interactive startup to the blocking pool; do not change the
// existing read/migration behavior or silently hydrate an empty state.
#[tauri::command]
pub async fn load_state_in_background(app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || load_state(app))
        .await
        .map_err(|e| format!("STATE_LOAD_TASK_FAILED: {e}"))
}

fn save_state_impl(app: &AppHandle, state: Value) -> Result<Value, String> {
    if state.get("__stateRecoveryRequired").and_then(Value::as_bool)==Some(true){
        return Err("STATE_RECOVERY_REQUIRED: refusing to persist an empty recovered state".into());
    }
    #[cfg(target_os="macos")]
    {
        let existing=state_file(app)?;
        if existing.exists() && load_valid_candidate(&existing).is_none(){
            return Err("STATE_RECOVERY_REQUIRED: original state is invalid; recover from a verified backup first".into());
        }
    }
    let (perf_channels,perf_jobs)=performance_fixture_counts(&state);
    if perf_channels>0||perf_jobs>0{return Err(format!("PERFORMANCE_FIXTURE_PERSISTENCE_BLOCKED: channels={perf_channels} jobs={perf_jobs}"))}
    let _write_guard=state_write_lock().lock().map_err(|_|"STATE_WRITE_LOCK_POISONED".to_string())?;
    let p = state_file(app)?;
    let (disk, warnings) = secure_state_for_disk_best_effort(&state);
    atomic_write(&p, &disk)?;
    let mirror_warning=write_state_mirror(app,&disk).err();
    Ok(json!({"ok":true,"securityWarning":warnings.first().cloned().or(mirror_warning),"securityWarnings":warnings.len()}))
}

pub(crate) fn save_state_sync(app: AppHandle, state: Value) -> Result<Value, String> {
    save_state_impl(&app,state)
}

#[tauri::command]
pub async fn save_state(app: AppHandle, state: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || save_state_impl(&app,state))
        .await
        .map_err(|e|format!("STATE_SAVE_TASK_FAILED: {e}"))?
}

#[cfg(test)]
mod v213_storage_tests {
    use super::*;
    #[test]
    fn legacy_to_v10_preserves_existing_data_and_is_idempotent() {
        let state = json!({"version":7,"channels":[{"id":"c1"}],"jobs":[{"id":"j1","channelId":"c1"}],"competitors":[{"id":"x"}],"settings":{"workspace":"/tmp/vyron"},"logs":[{"message":"keep"}]});
        let (m, changed) = migrate_state(state);
        assert!(changed);
        assert_eq!(m["version"], 10);
        assert_eq!(m["channels"][0]["id"], "c1");
        assert_eq!(m["jobs"][0]["id"], "j1");
        assert!(m["uploadHistory"].as_array().unwrap().is_empty());
        assert!(m["activityJournal"].as_array().unwrap().is_empty());
        assert!(m["statisticsHistory"].as_object().unwrap().is_empty());
        assert!(m["fingerprintCache"].as_object().unwrap().is_empty());
        assert!(m["projectLifecycle"].as_object().unwrap().is_empty());
        let (m2, changed2) = migrate_state(m.clone());
        assert!(!changed2);
        assert_eq!(m2, m);
    }
    #[test]
    fn performance_fixture_cleanup_is_strict_and_preserves_real_rows(){
        let state=json!({"channels":[
            {"id":"real-1","name":"Performance Channel 01"},
            {"id":"perf-channel-01","name":"Performance Channel 01"},
            {"id":"perf-channel-02","name":"Real Channel"}
        ],"jobs":[
            {"id":"real-job","channelId":"perf-channel-01"},
            {"id":"perf-job-0001","channelId":"perf-channel-01"},
            {"id":"perf-job-0002","channelId":"real-1"}
        ]});
        let (clean,channels,jobs)=strip_performance_fixtures(state);
        assert_eq!(channels,1);assert_eq!(jobs,1);
        assert_eq!(clean["channels"].as_array().unwrap().len(),2);
        assert_eq!(clean["jobs"].as_array().unwrap().len(),2);
        assert_eq!(performance_fixture_counts(&clean),(0,0));
    }

    #[test]
    fn state_validator_rejects_empty_and_corrupt_shape(){
        assert!(!state_looks_valid(&json!(null)));
        assert!(!state_looks_valid(&json!({"channels":[]})));
        assert!(state_looks_valid(&default_state()));
    }
    #[cfg(target_os="macos")]
    #[test]
    fn macos_mirror_channels_array_is_allowed(){
        let root=std::env::temp_dir().join(format!("vyron-array-test-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path=root.join("channels.json");
        let channels=json!([{"id":"channel-1"}]);
        atomic_write(&path,&channels).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap(),channels);
        let _=fs::remove_dir_all(root);
    }
    #[cfg(target_os="macos")]
    #[test]
    fn macos_replace_is_atomic_and_generational(){
        let root=std::env::temp_dir().join(format!("vyron-state-test-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let file=root.join("state.json");
        let mut original=default_state();
        original["channels"]=json!([{"id":"A"}]);
        atomic_write(&file,&original).unwrap();
        let mut next=original.clone();next["channels"]=json!([{"id":"A"},{"id":"B"}]);
        atomic_write(&file,&next).unwrap();
        assert_eq!(load_valid_candidate(&file).unwrap()["channels"].as_array().unwrap().len(),2);
        assert_eq!(load_valid_candidate(&file.with_extension("bak")).unwrap()["channels"].as_array().unwrap().len(),1);
        let _=fs::remove_dir_all(root);
    }
    #[cfg(target_os="macos")]
    #[test]
    fn failed_backup_rotation_preserves_primary(){
        let root=std::env::temp_dir().join(format!("vyron-state-test-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let file=root.join("state.json");let old=default_state();
        atomic_write(&file,&old).unwrap();
        fs::create_dir(file.with_extension("bak")).unwrap();
        let mut next=old.clone();next["channels"]=json!([{"id":"must-not-appear"}]);
        assert!(atomic_write(&file,&next).is_err());
        assert_eq!(load_valid_candidate(&file).unwrap(),old);
        let _=fs::remove_dir_all(root);
    }
    #[test]
    fn sanitized_state_never_writes_api_secrets_to_disk() {
        let state = json!({"settings":{"youtubeApiKey":"AIza-secret","openaiApiKey":"sk-secret","workspace":"/tmp/vyron"},"channels":[{"id":"c1"}]});
        let disk = sanitized_state_for_disk(&state);
        assert_eq!(
            disk.pointer("/settings/youtubeApiKey")
                .and_then(Value::as_str),
            Some("")
        );
        assert_eq!(
            disk.pointer("/settings/openaiApiKey")
                .and_then(Value::as_str),
            Some("")
        );
        assert_eq!(
            disk.pointer("/settings/workspace").and_then(Value::as_str),
            Some("/tmp/vyron")
        );
        assert_eq!(
            disk.pointer("/channels/0/id").and_then(Value::as_str),
            Some("c1")
        );
    }
}
