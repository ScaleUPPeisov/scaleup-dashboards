use tauri::{Manager,Emitter};
use tauri_plugin_updater::UpdaterExt;
use std::{fs,io::Read,path::{Path,PathBuf},process::Command};
#[cfg(target_os="macos")]
use std::os::unix::fs::MetadataExt;

fn app_bundle_from_exe(exe:&Path)->Option<PathBuf>{
    exe.ancestors().find(|p|p.extension().and_then(|x|x.to_str())==Some("app")).map(Path::to_path_buf)
}

fn sha256_file(path:&Path)->Result<String,String>{
    use sha2::{Digest,Sha256};
    let mut file=fs::File::open(path).map_err(|e|format!("UPDATER_FILE_HASH_FAILED: {}: {e}",path.display()))?;
    let mut hasher=Sha256::new();
    let mut buf=[0u8;64*1024];
    loop{
        let n=file.read(&mut buf).map_err(|e|format!("UPDATER_FILE_HASH_FAILED: {}: {e}",path.display()))?;
        if n==0{break}
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn sha256_text(value:&str)->String{
    use sha2::{Digest,Sha256};
    hex::encode(Sha256::digest(value.as_bytes()))
}

#[cfg(target_os="macos")]
fn plist_raw(bundle:&Path,key:&str)->Option<String>{
    let info=bundle.join("Contents/Info.plist");
    let output=Command::new("/usr/bin/plutil")
      .args(["-extract",key,"raw","-o","-"])
      .arg(&info)
      .output().ok()?;
    if !output.status.success(){return None}
    let value=String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

#[cfg(target_os="macos")]
fn bundle_executable_path(bundle:&Path)->PathBuf{
    let name=plist_raw(bundle,"CFBundleExecutable").unwrap_or_else(||"channelflow".into());
    bundle.join("Contents/MacOS").join(name)
}

#[cfg(target_os="macos")]
fn canonical_text(path:&Path)->String{
    fs::canonicalize(path).unwrap_or_else(|_|path.to_path_buf()).to_string_lossy().to_string()
}

#[cfg(target_os="macos")]
fn bundle_location(bundle:&Path)->&'static str{
    let text=bundle.to_string_lossy();
    if text.starts_with("/Volumes/"){return"mounted-dmg"}
    if text.starts_with("/Applications/"){return"system-applications"}
    if let Ok(home)=std::env::var("HOME"){
        if bundle.starts_with(Path::new(&home).join("Applications")){return"user-applications"}
    }
    "other"
}

#[cfg(target_os="macos")]
fn codesign_ok(bundle:&Path)->bool{
    Command::new("/usr/bin/codesign").args(["--verify","--deep","--strict"]).arg(bundle).status().map(|s|s.success()).unwrap_or(false)
}

#[cfg(target_os="macos")]
fn app_copy_info(path:&Path,running_bundle:&Path)->serde_json::Value{
    let exists=path.is_dir();
    if !exists{return serde_json::json!({"path":path.to_string_lossy(),"exists":false})}
    let exe=bundle_executable_path(path);
    let path_canonical=canonical_text(path);
    let running_canonical=canonical_text(running_bundle);
    serde_json::json!({
      "path":path.to_string_lossy(),
      "canonicalPath":path_canonical,
      "exists":true,
      "version":plist_raw(path,"CFBundleShortVersionString"),
      "bundleId":plist_raw(path,"CFBundleIdentifier"),
      "executablePath":exe.to_string_lossy(),
      "executableSha256":sha256_file(&exe).ok(),
      "isRunningTarget":path_canonical==running_canonical
    })
}

#[cfg(target_os="macos")]
fn duplicate_app_copies(running_bundle:&Path)->Vec<serde_json::Value>{
    let mut paths=vec![PathBuf::from("/Applications/VYRON.app")];
    if let Ok(home)=std::env::var("HOME"){paths.push(Path::new(&home).join("Applications/VYRON.app"))}
    paths.sort();paths.dedup();
    paths.into_iter().filter(|p|p.is_dir()).map(|p|app_copy_info(&p,running_bundle)).collect()
}

#[cfg(target_os="macos")]
fn safe_sibling_replace_probe(parent:&Path)->Result<(),String>{
    let stem=format!(".vyron-updater-preflight-{}",std::process::id());
    let first=parent.join(format!("{stem}-a.app"));
    let second=parent.join(format!("{stem}-b.app"));
    let _=fs::remove_dir_all(&first);let _=fs::remove_dir_all(&second);
    let result=(||{
        fs::create_dir(&first).map_err(|e|format!("create temporary sibling: {e}"))?;
        fs::write(first.join("probe"),b"vyron").map_err(|e|format!("write temporary sibling: {e}"))?;
        fs::rename(&first,&second).map_err(|e|format!("rename temporary sibling into replacement slot: {e}"))?;
        fs::rename(&second,&first).map_err(|e|format!("rename temporary sibling back: {e}"))?;
        Ok::<(),String>(())
    })();
    let _=fs::remove_dir_all(&first);let _=fs::remove_dir_all(&second);
    result
}

#[cfg(target_os="macos")]
fn mac_runtime_snapshot(app:&tauri::AppHandle,probe_replace:bool)->Result<serde_json::Value,String>{
    let exe=std::env::current_exe().map_err(|e|format!("APP_NOT_REPLACEABLE: current executable: {e}"))?;
    let bundle=app_bundle_from_exe(&exe).ok_or_else(||"APP_NOT_REPLACEABLE: VYRON.app bundle не найден".to_string())?;
    let parent=bundle.parent().ok_or_else(||"APP_NOT_REPLACEABLE: parent bundle directory missing".to_string())?;
    let location=bundle_location(&bundle);
    let running_from_dmg=location=="mounted-dmg";
    let parent_probe=if probe_replace&&!running_from_dmg{safe_sibling_replace_probe(parent)}else if running_from_dmg{Err("mounted DMG".into())}else{Ok(())};
    let bundle_replaceable=parent_probe.is_ok()&&!running_from_dmg;
    let parent_device=fs::metadata(parent).ok().map(|m|m.dev());
    let bundle_device=fs::metadata(&bundle).ok().map(|m|m.dev());
    let copies=duplicate_app_copies(&bundle);
    let canonical_bundle=canonical_text(&bundle);
    let canonical_exe=canonical_text(&exe);
    let exe_sha=sha256_file(&exe).ok();
    Ok(serde_json::json!({
      "currentExecutablePath":exe.to_string_lossy(),
      "currentExecutableCanonicalPath":canonical_exe,
      "currentExecutableSha256":exe_sha,
      "currentAppBundlePath":bundle.to_string_lossy(),
      "currentAppBundleCanonicalPath":canonical_bundle,
      "currentVersion":app.package_info().version.to_string(),
      "bundleVersion":plist_raw(&bundle,"CFBundleShortVersionString"),
      "bundleId":plist_raw(&bundle,"CFBundleIdentifier").unwrap_or_else(||app.config().identifier.clone()),
      "bundleParentDirectory":parent.to_string_lossy(),
      "volumeDevice":bundle_device,
      "parentVolumeDevice":parent_device,
      "writableParent":bundle_replaceable,
      "underApplications":matches!(location,"system-applications"|"user-applications"),
      "runningLocation":location,
      "runningFromDmg":running_from_dmg,
      "bundleReplaceable":bundle_replaceable,
      "replaceProbeError":parent_probe.err(),
      "duplicateAppCopies":copies,
      "duplicateCopies":copies.len()>1,
      "targetPlatform":if cfg!(target_arch="aarch64"){"darwin-aarch64"}else{"darwin-x86_64"},
      "signatureConfigured":true,
      "secretValuesIncluded":false
    }))
}

#[cfg(target_os="macos")]
fn verify_installed_bundle(bundle:&Path,expected_version:&str,previous_executable_sha256:&str)->Result<serde_json::Value,String>{
    if !bundle.is_dir(){
        return Err(format!("APP_REPLACEMENT_NOT_APPLIED: destination={} does not exist",bundle.display()))
    }
    let version=plist_raw(bundle,"CFBundleShortVersionString").unwrap_or_default();
    let bundle_id=plist_raw(bundle,"CFBundleIdentifier").unwrap_or_default();
    let executable=bundle_executable_path(bundle);
    let new_sha=sha256_file(&executable)?;
    if version!=expected_version{
        return Err(format!("APP_REPLACEMENT_NOT_APPLIED: destination={} expectedVersion={} actualVersion={}",bundle.display(),expected_version,version))
    }
    if bundle_id!="studio.channelflow.desktop"{
        return Err(format!("APP_REPLACEMENT_BUNDLE_ID_MISMATCH: destination={} bundleId={}",bundle.display(),bundle_id))
    }
    if !previous_executable_sha256.is_empty()&&new_sha.eq_ignore_ascii_case(previous_executable_sha256){
        return Err(format!("APP_REPLACEMENT_NOT_APPLIED: destination={} executable SHA256 unchanged",bundle.display()))
    }
    if !codesign_ok(bundle){
        return Err(format!("APP_REPLACEMENT_CODESIGN_FAILED: destination={}",bundle.display()))
    }
    Ok(serde_json::json!({
      "verified":true,
      "destinationAppBundlePath":bundle.to_string_lossy(),
      "destinationAppBundleCanonicalPath":canonical_text(bundle),
      "installedVersion":version,
      "bundleId":bundle_id,
      "installedExecutablePath":executable.to_string_lossy(),
      "installedExecutableSha256":new_sha,
      "previousExecutableSha256":previous_executable_sha256,
      "codesignVerified":true
    }))
}

fn manifest_platform_text(raw:&serde_json::Value,target:&str,key:&str)->Option<String>{
    raw.get("platforms")
      .and_then(|x|x.get(target))
      .and_then(|x|x.get(key))
      .and_then(|x|x.as_str())
      .or_else(||raw.get(key).and_then(|x|x.as_str()))
      .map(|x|x.trim().to_string())
      .filter(|x|!x.is_empty())
}

async fn stable_update(app:&tauri::AppHandle)->Result<Option<tauri_plugin_updater::Update>,String>{
    let updater=app.updater_builder().build().map_err(|e|format!("UPDATER_BUILD_FAILED: {e}"))?;
    updater.check().await.map_err(|e|format!("UPDATER_MANIFEST_FETCH_FAILED: {e}"))
}

#[derive(Clone)]
struct DownloadedStableUpdate{
    version:String,
    target:String,
    artifact_sha256:String,
    expected_artifact_sha256:Option<String>,
    manifest_signature_sha256:String,
    download_url:String,
    current_app_bundle_path:String,
    current_executable_sha256:String,
    bytes:Vec<u8>
}
static STABLE_UPDATE_DOWNLOAD:std::sync::OnceLock<std::sync::Mutex<Option<DownloadedStableUpdate>>>=std::sync::OnceLock::new();
fn stable_update_download_state()->&'static std::sync::Mutex<Option<DownloadedStableUpdate>>{
    STABLE_UPDATE_DOWNLOAD.get_or_init(||std::sync::Mutex::new(None))
}

#[tauri::command]
pub fn updater_install_preflight(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    #[cfg(target_os="macos")]
    {
        let snapshot=mac_runtime_snapshot(&app,true)?;
        if snapshot.get("runningFromDmg").and_then(|x|x.as_bool())==Some(true){
            return Err("RUNNING_FROM_DMG: VYRON запущен из DMG. Переместите VYRON.app в Applications.".into())
        }
        Ok(snapshot)
    }
    #[cfg(not(target_os="macos"))]
    {
        Ok(serde_json::json!({
          "currentExecutablePath":std::env::current_exe().ok().map(|p|p.to_string_lossy().to_string()),
          "currentExecutableCanonicalPath":serde_json::Value::Null,
          "currentExecutableSha256":serde_json::Value::Null,
          "currentAppBundlePath":serde_json::Value::Null,
          "currentAppBundleCanonicalPath":serde_json::Value::Null,
          "underApplications":false,"runningLocation":"other","runningFromDmg":false,"bundleReplaceable":true,
          "currentVersion":app.package_info().version.to_string(),"bundleId":app.config().identifier.clone(),
          "targetPlatform":std::env::consts::OS,"signatureConfigured":true,"secretValuesIncluded":false,
          "duplicateAppCopies":[],"duplicateCopies":false
        }))
    }
}

#[tauri::command]
pub fn updater_runtime_diagnostics(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    #[cfg(target_os="macos")]
    {mac_runtime_snapshot(&app,false)}
    #[cfg(not(target_os="macos"))]
    {updater_install_preflight(app)}
}

#[tauri::command]
pub fn prepare_updater_tempdir()->Result<String,String>{
    #[cfg(target_os="macos")]
    {
        let exe=std::env::current_exe().map_err(|e|format!("Updater: current executable: {e}"))?;
        let app=app_bundle_from_exe(&exe).ok_or_else(||"Updater: VYRON.app bundle не найден".to_string())?;
        if app.to_string_lossy().starts_with("/Volumes/"){
            return Err("RUNNING_FROM_DMG: VYRON запущен из DMG. Переместите VYRON.app в Applications.".into())
        }
        let parent=app.parent().ok_or_else(||"APP_NOT_REPLACEABLE: папка VYRON.app не найдена".to_string())?;
        safe_sibling_replace_probe(parent).map_err(|e|format!("APP_NOT_REPLACEABLE: безопасная замена VYRON.app недоступна: {e}"))?;
        let system_tmp=std::env::temp_dir();
        let app_dev=fs::metadata(parent).map_err(|e|format!("Updater: app volume: {e}"))?.dev();
        let tmp_dev=fs::metadata(&system_tmp).map_err(|e|format!("Updater: temp volume: {e}"))?.dev();
        if app_dev==tmp_dev{return Ok(system_tmp.to_string_lossy().into_owned());}
        let local_tmp=parent.join(".vyron-updater-tmp");
        fs::create_dir_all(&local_tmp).map_err(|_|"APP_NOT_REPLACEABLE: Updater не может создать временную папку рядом с VYRON.app. Проверь права на папку приложения.".to_string())?;
        let probe=local_tmp.join(format!(".write-probe-{}",std::process::id()));
        fs::write(&probe,b"vyron").map_err(|_|"Updater: нет записи на том, где расположен VYRON.app".to_string())?;
        let _=fs::remove_file(&probe);
        unsafe{std::env::set_var("TMPDIR",&local_tmp);}
        Ok(local_tmp.to_string_lossy().into_owned())
    }
    #[cfg(not(target_os="macos"))]
    {Ok(std::env::temp_dir().to_string_lossy().into_owned())}
}

#[tauri::command]
pub fn updater_runtime_identity(app:tauri::AppHandle)->serde_json::Value{
    let mut identity=serde_json::json!({
      "productVersion":app.package_info().version.to_string(),
      "buildRevision":build_revision(),
      "commit":build_commit(),
      "channel":update_channel(),
      "bundleId":app.config().identifier.clone(),
      "targetPlatform":if cfg!(target_os="macos"){if cfg!(target_arch="aarch64"){"darwin-aarch64"}else{"darwin-x86_64"}}else{std::env::consts::OS}
    });
    #[cfg(target_os="macos")]
    if let Ok(snapshot)=mac_runtime_snapshot(&app,false){
        if let (Some(dst),Some(src))=(identity.as_object_mut(),snapshot.as_object()){
            for key in ["currentExecutablePath","currentExecutableCanonicalPath","currentExecutableSha256","currentAppBundlePath","currentAppBundleCanonicalPath","runningLocation","duplicateCopies"]{
                if let Some(value)=src.get(key){dst.insert(key.to_string(),value.clone());}
            }
        }
    }
    identity
}

#[tauri::command]
pub async fn updater_stable_check(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    let current=app.package_info().version.to_string();
    let Some(update)=stable_update(&app).await? else{
        return Ok(serde_json::json!({"available":false,"currentVersion":current,"latestVersion":current,"channel":"stable"}))
    };
    let expected_sha=manifest_platform_text(&update.raw_json,&update.target,"sha256");
    Ok(serde_json::json!({
      "available":true,
      "currentVersion":current,
      "latestVersion":update.version,
      "date":update.date.map(|x|x.to_string()),
      "body":update.body,
      "target":update.target,
      "artifactUrl":update.download_url.to_string(),
      "expectedArtifactSha256":expected_sha,
      "manifestSignatureSha256":sha256_text(&update.signature),
      "channel":"stable"
    }))
}

#[tauri::command]
pub async fn updater_stable_download(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    #[cfg(not(target_os="macos"))]
    {let _=app;return Err("UPDATER_STABLE_MAC_ONLY: staged stable download is only used on macOS".into())}
    #[cfg(target_os="macos")]
    {
        let snapshot=mac_runtime_snapshot(&app,true)?;
        if snapshot.get("runningFromDmg").and_then(|x|x.as_bool())==Some(true){
            return Err("RUNNING_FROM_DMG: VYRON запущен из DMG. Переместите VYRON.app в Applications.".into())
        }
        if snapshot.get("bundleReplaceable").and_then(|x|x.as_bool())!=Some(true){
            return Err("APP_NOT_REPLACEABLE: установленный VYRON.app недоступен для безопасной замены".into())
        }
        let Some(update)=stable_update(&app).await? else{return Err("UPDATE_CANDIDATE_NOT_AVAILABLE: update feed no longer contains an installable candidate".into())};
        let expected_sha=manifest_platform_text(&update.raw_json,&update.target,"sha256").map(|x|x.to_ascii_lowercase());
        let target_version=update.version.clone();
        let target=update.target.clone();
        let signature_sha=sha256_text(&update.signature);
        let download_url=update.download_url.to_string();
        let emit_app=app.clone();
        let bytes=update.download(
          move |chunk,total|{let _=emit_app.emit("stable-update-progress",serde_json::json!({"chunkBytes":chunk,"totalBytes":total,"targetVersion":target_version}));},
          ||{}
        ).await.map_err(|e|format!("UPDATER_ARCHIVE_DOWNLOAD_FAILED: {e}"))?;
        let actual_sha=sha256_hex(&bytes);
        if let Some(ref expected)=expected_sha{
            if expected.len()!=64||!expected.chars().all(|c|c.is_ascii_hexdigit()){
                return Err("UPDATER_MANIFEST_SHA_INVALID: manifest sha256 is malformed".into())
            }
            if actual_sha!=*expected{
                return Err(format!("UPDATER_ARTIFACT_SHA_MISMATCH: expected={expected} actual={actual_sha}"))
            }
        }
        let bundle_path=snapshot.get("currentAppBundlePath").and_then(|x|x.as_str()).unwrap_or("").to_string();
        let old_sha=snapshot.get("currentExecutableSha256").and_then(|x|x.as_str()).unwrap_or("").to_string();
        *stable_update_download_state().lock().map_err(|_|"UPDATER_STABLE_DOWNLOAD_STATE_POISONED".to_string())?=Some(DownloadedStableUpdate{
          version:update.version.clone(),target,artifact_sha256:actual_sha.clone(),expected_artifact_sha256:expected_sha.clone(),
          manifest_signature_sha256:signature_sha.clone(),download_url:download_url.clone(),current_app_bundle_path:bundle_path.clone(),
          current_executable_sha256:old_sha.clone(),bytes
        });
        Ok(serde_json::json!({
          "downloaded":true,"targetVersion":update.version,"downloadedArtifactSha256":actual_sha,
          "expectedManifestSha256":expected_sha,"manifestSignatureSha256":signature_sha,"artifactUrl":download_url,
          "runningAppPath":bundle_path,"currentExecutableSha256":old_sha,"signatureVerified":true
        }))
    }
}

#[tauri::command]
pub async fn updater_stable_install(app:tauri::AppHandle,expected_version:String)->Result<serde_json::Value,String>{
    #[cfg(not(target_os="macos"))]
    {let _=(app,expected_version);return Err("UPDATER_STABLE_MAC_ONLY: staged stable install is only used on macOS".into())}
    #[cfg(target_os="macos")]
    {
        let staged=stable_update_download_state().lock().map_err(|_|"UPDATER_STABLE_DOWNLOAD_STATE_POISONED".to_string())?.take()
          .ok_or_else(||"UPDATE_CANDIDATE_LOST: verified updater archive is not staged".to_string())?;
        if staged.version!=expected_version{return Err(format!("UPDATE_VERSION_MISMATCH: expected {expected_version}, staged {}",staged.version))}
        let now=mac_runtime_snapshot(&app,true)?;
        let now_bundle=now.get("currentAppBundlePath").and_then(|x|x.as_str()).unwrap_or("");
        if canonical_text(Path::new(now_bundle))!=canonical_text(Path::new(&staged.current_app_bundle_path)){
            return Err(format!("UPDATE_TARGET_PATH_CHANGED: staged={} running={}",staged.current_app_bundle_path,now_bundle))
        }
        let Some(update)=stable_update(&app).await? else{return Err("UPDATE_CANDIDATE_LOST: signed update candidate is no longer available".into())};
        let expected_sha=manifest_platform_text(&update.raw_json,&update.target,"sha256").map(|x|x.to_ascii_lowercase());
        if update.version!=staged.version||update.target!=staged.target||sha256_text(&update.signature)!=staged.manifest_signature_sha256||expected_sha!=staged.expected_artifact_sha256||update.download_url.to_string()!=staged.download_url{
            return Err("UPDATE_MANIFEST_CHANGED: version/target/signature/hash/url changed after verified download".into())
        }
        update.install(&staged.bytes).map_err(|e|format!("UPDATER_INSTALL_FAILED: {e}"))?;
        let verify=verify_installed_bundle(Path::new(&staged.current_app_bundle_path),&expected_version,&staged.current_executable_sha256)?;
        let mut out=verify.as_object().cloned().unwrap_or_default();
        out.insert("downloadedArtifactSha256".into(),serde_json::Value::String(staged.artifact_sha256));
        out.insert("expectedManifestSha256".into(),staged.expected_artifact_sha256.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null));
        out.insert("manifestSignatureSha256".into(),serde_json::Value::String(staged.manifest_signature_sha256));
        out.insert("artifactUrl".into(),serde_json::Value::String(staged.download_url));
        Ok(serde_json::Value::Object(out))
    }
}

#[tauri::command]
pub fn updater_verify_installed_target(app:tauri::AppHandle,expected_version:String,expected_bundle_path:String,previous_executable_sha256:String)->Result<serde_json::Value,String>{
    #[cfg(target_os="macos")]
    {
        let _=app;
        verify_installed_bundle(Path::new(&expected_bundle_path),&expected_version,&previous_executable_sha256)
    }
    #[cfg(not(target_os="macos"))]
    {let _=(app,expected_version,expected_bundle_path,previous_executable_sha256);Ok(serde_json::json!({"verified":true}))}
}

#[tauri::command]
pub fn updater_relaunch_exact(app:tauri::AppHandle,bundle_path:String)->Result<(),String>{
    #[cfg(target_os="macos")]
    {
        let current_exe=std::env::current_exe().map_err(|e|format!("UPDATER_RESTART_FAILED: current executable: {e}"))?;
        let current_bundle=app_bundle_from_exe(&current_exe).ok_or_else(||"UPDATER_RESTART_FAILED: current VYRON.app not found".to_string())?;
        let requested=PathBuf::from(&bundle_path);
        if canonical_text(&current_bundle)!=canonical_text(&requested){
            return Err(format!("UPDATER_RESTART_PATH_MISMATCH: running={} requested={}",current_bundle.display(),requested.display()))
        }
        if !requested.is_dir(){return Err(format!("UPDATER_RESTART_FAILED: updated bundle missing: {}",requested.display()))}
        let status=Command::new("/usr/bin/open").arg("-n").arg(&requested).status().map_err(|e|format!("UPDATER_RESTART_FAILED: open exact bundle: {e}"))?;
        if !status.success(){return Err(format!("UPDATER_RESTART_FAILED: /usr/bin/open returned {status}"))}
        app.exit(0);
        Ok(())
    }
    #[cfg(not(target_os="macos"))]
    {app.request_restart();Ok(())}
}

const OWNER_PREVIEW_ENDPOINT:&str="https://raw.githubusercontent.com/ScaleUPPeisov/vyron-releases/main/updates/owner-preview.json";
fn build_revision()->u64{env!("VYRON_BUILD_REVISION").parse().unwrap_or(0)}
fn build_commit()->&'static str{env!("VYRON_COMMIT_SHA")}
fn update_channel()->&'static str{env!("VYRON_UPDATE_CHANNEL")}
fn preview_revision(version:&str)->Option<u64>{
    let (_,tail)=version.split_once("-preview.")?;
    tail.split('.').next()?.parse().ok()
}
fn preview_product_version(version:&str)->&str{version.split("-preview.").next().unwrap_or(version)}
fn semver_triplet(version:&str)->Option<(u64,u64,u64)>{
    let core=preview_product_version(version).split('-').next()?;
    let mut parts=core.split('.');
    Some((parts.next()?.parse().ok()?,parts.next()?.parse().ok()?,parts.next()?.parse().ok()?))
}
fn owner_preview_available(current_product:&str,current_revision:u64,remote_version:&str)->bool{
    let Some(remote_revision)=preview_revision(remote_version) else{return false};
    match (semver_triplet(current_product),semver_triplet(remote_version)){
      (Some(current),Some(remote)) if remote>current=>true,
      (Some(current),Some(remote)) if remote<current=>false,
      (Some(_),Some(_))=>remote_revision>current_revision,
      _=>false
    }
}

async fn owner_preview_update(app:&tauri::AppHandle)->Result<Option<tauri_plugin_updater::Update>,String>{
    let current_revision=build_revision();
    let current_product=app.package_info().version.to_string();
    let endpoint=OWNER_PREVIEW_ENDPOINT.parse().map_err(|e|format!("OWNER_PREVIEW_ENDPOINT_INVALID: {e}"))?;
    let updater=app.updater_builder()
      .endpoints(vec![endpoint]).map_err(|e|format!("OWNER_PREVIEW_UPDATER_CONFIG_FAILED: {e}"))?
      .version_comparator(move |_current,remote|{
          owner_preview_available(&current_product,current_revision,&remote.version.to_string())
      })
      .build().map_err(|e|format!("OWNER_PREVIEW_UPDATER_BUILD_FAILED: {e}"))?;
    updater.check().await.map_err(|e|format!("OWNER_PREVIEW_CHECK_FAILED: {e}"))
}

#[tauri::command]
pub async fn updater_owner_preview_check(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    let current_revision=build_revision();
    let Some(update)=owner_preview_update(&app).await? else{
      return Ok(serde_json::json!({
        "available":false,"productVersion":app.package_info().version.to_string(),
        "currentBuildRevision":current_revision,"latestBuildRevision":current_revision,
        "endpoint":OWNER_PREVIEW_ENDPOINT,"channel":"owner-preview"
      }))
    };
    let target_revision=preview_revision(&update.version).ok_or_else(||format!("OWNER_PREVIEW_REVISION_MISSING: {}",update.version))?;
    Ok(serde_json::json!({
      "available":true,
      "productVersion":preview_product_version(&update.version),
      "announcedVersion":update.version,
      "currentBuildRevision":current_revision,
      "latestBuildRevision":target_revision,
      "notes":update.body,
      "date":update.date.map(|x|x.to_string()),
      "artifactUrl":update.download_url.to_string(),
      "endpoint":OWNER_PREVIEW_ENDPOINT,
      "channel":"owner-preview"
    }))
}


#[derive(Clone)]
struct DownloadedOwnerPreview{
    announced_version:String,
    build_revision:u64,
    artifact_sha256:String,
    bytes:Vec<u8>,
}
static OWNER_PREVIEW_DOWNLOAD:std::sync::OnceLock<std::sync::Mutex<Option<DownloadedOwnerPreview>>>=std::sync::OnceLock::new();
fn owner_preview_download_state()->&'static std::sync::Mutex<Option<DownloadedOwnerPreview>>{
    OWNER_PREVIEW_DOWNLOAD.get_or_init(||std::sync::Mutex::new(None))
}
fn sha256_hex(bytes:&[u8])->String{
    use sha2::{Digest,Sha256};
    hex::encode(Sha256::digest(bytes))
}

#[tauri::command]
pub async fn updater_owner_preview_download(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    let Some(update)=owner_preview_update(&app).await? else{return Err("OWNER_PREVIEW_NO_UPDATE: preview build is already current".into())};
    let target_revision=preview_revision(&update.version).ok_or_else(||format!("OWNER_PREVIEW_REVISION_MISSING: {}",update.version))?;
    let expected_sha=update.raw_json.get("artifactSha256").and_then(|x|x.as_str()).unwrap_or("").trim().to_ascii_lowercase();
    if expected_sha.len()!=64||!expected_sha.chars().all(|c|c.is_ascii_hexdigit()){
        return Err("OWNER_PREVIEW_ARTIFACT_SHA_MISSING: manifest must contain artifactSha256".into())
    }
    let emit_app=app.clone();
    let bytes=update.download(
      move |chunk,total|{
        let _=emit_app.emit("owner-preview-update-progress",serde_json::json!({"chunkBytes":chunk,"totalBytes":total,"targetBuildRevision":target_revision}));
      },
      ||{}
    ).await.map_err(|e|format!("OWNER_PREVIEW_DOWNLOAD_FAILED: {e}"))?;
    // Tauri has already verified minisign before returning bytes. Bind the verified bytes
    // to the owner-preview manifest as a second identity check.
    let actual_sha=sha256_hex(&bytes);
    if actual_sha!=expected_sha{
        return Err(format!("OWNER_PREVIEW_ARTIFACT_SHA_MISMATCH: expected={expected_sha} actual={actual_sha}"))
    }
    let announced_version=update.version.clone();
    *owner_preview_download_state().lock().map_err(|_|"OWNER_PREVIEW_DOWNLOAD_STATE_POISONED".to_string())?=Some(DownloadedOwnerPreview{
      announced_version:announced_version.clone(),build_revision:target_revision,artifact_sha256:actual_sha.clone(),bytes
    });
    Ok(serde_json::json!({"downloaded":true,"announcedVersion":announced_version,"targetBuildRevision":target_revision,"artifactSha256":actual_sha,"signatureVerified":true,"channel":"owner-preview"}))
}

#[tauri::command]
pub async fn updater_owner_preview_install(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    let staged=owner_preview_download_state().lock().map_err(|_|"OWNER_PREVIEW_DOWNLOAD_STATE_POISONED".to_string())?.take()
      .ok_or_else(||"OWNER_PREVIEW_NOT_DOWNLOADED: download and signature verification must complete first".to_string())?;
    let Some(update)=owner_preview_update(&app).await? else{
      return Err("OWNER_PREVIEW_MANIFEST_CHANGED: update disappeared after download".into())
    };
    let target_revision=preview_revision(&update.version).ok_or_else(||format!("OWNER_PREVIEW_REVISION_MISSING: {}",update.version))?;
    let manifest_sha=update.raw_json.get("artifactSha256").and_then(|x|x.as_str()).unwrap_or("").trim().to_ascii_lowercase();
    if update.version!=staged.announced_version||target_revision!=staged.build_revision||manifest_sha!=staged.artifact_sha256{
      return Err("OWNER_PREVIEW_MANIFEST_CHANGED: version/revision/artifact changed after verified download".into())
    }
    update.install(&staged.bytes).map_err(|e|format!("OWNER_PREVIEW_INSTALL_FAILED: {e}"))?;
    Ok(serde_json::json!({
      "installed":true,
      "productVersion":preview_product_version(&update.version),
      "targetBuildRevision":target_revision,
      "artifactSha256":staged.artifact_sha256,
      "signatureVerified":true,
      "channel":"owner-preview"
    }))
}


#[cfg(test)]
mod owner_preview_revision_tests{
 use super::*;
 #[test]fn same_product_higher_revision_is_available(){
  assert!(owner_preview_available("3.0.0",164,"3.0.0-preview.165"));
 }
 #[test]fn same_product_same_revision_is_up_to_date(){
  assert!(!owner_preview_available("3.0.0",165,"3.0.0-preview.165"));
 }
 #[test]fn lower_or_malformed_revision_is_never_selected(){
  assert!(!owner_preview_available("3.0.0",165,"3.0.0-preview.164"));
  assert!(!owner_preview_available("3.0.0",165,"3.0.0"));
 }
 #[test]fn preview_version_keeps_product_version_three_zero_zero(){
  assert_eq!(preview_product_version("3.0.0-preview.165"),"3.0.0");
  assert_eq!(preview_revision("3.0.0-preview.165"),Some(165));
   assert!(owner_preview_available("3.0.0",320,"3.1.0-preview.321"));
   assert!(owner_preview_available("3.1.0",321,"3.1.0-preview.322"));
   assert!(!owner_preview_available("3.1.0",321,"3.0.1-preview.999"));
 }
}
