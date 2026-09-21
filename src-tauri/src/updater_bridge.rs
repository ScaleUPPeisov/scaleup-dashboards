use tauri::{Manager,Emitter};
use tauri_plugin_updater::UpdaterExt;
use std::{fs,path::{Path,PathBuf}};
#[cfg(target_os="macos")]
use std::os::unix::fs::MetadataExt;

fn app_bundle_from_exe(exe:&Path)->Option<PathBuf>{
    exe.ancestors().find(|p|p.extension().and_then(|x|x.to_str())==Some("app")).map(Path::to_path_buf)
}


#[tauri::command]
pub fn updater_install_preflight(app:tauri::AppHandle)->Result<serde_json::Value,String>{
    #[cfg(target_os="macos")]
    {
        let exe=std::env::current_exe().map_err(|e|format!("APP_NOT_REPLACEABLE: current executable: {e}"))?;
        let bundle=app_bundle_from_exe(&exe).ok_or_else(||"APP_NOT_REPLACEABLE: VYRON.app bundle не найден".to_string())?;
        let bundle_text=bundle.to_string_lossy().to_string();
        let running_from_dmg=bundle_text.starts_with("/Volumes/");
        let under_applications=bundle_text.starts_with("/Applications/")||std::env::var("HOME").ok().map(|h|bundle.starts_with(Path::new(&h).join("Applications"))).unwrap_or(false);
        let parent=bundle.parent().ok_or_else(||"APP_NOT_REPLACEABLE: parent bundle directory missing".to_string())?;
        let probe=parent.join(format!(".vyron-updater-preflight-{}",std::process::id()));
        let replaceable=if running_from_dmg{false}else{match fs::write(&probe,b"vyron"){Ok(())=>{let _=fs::remove_file(&probe);true},Err(_)=>false}};
        let platform=if cfg!(target_arch="aarch64"){"darwin-aarch64"}else{"darwin-x86_64"};
        Ok(serde_json::json!({
          "currentExecutablePath":exe.to_string_lossy(),
          "currentAppBundlePath":bundle_text,
          "underApplications":under_applications,
          "runningFromDmg":running_from_dmg,
          "bundleReplaceable":replaceable,
          "currentVersion":app.package_info().version.to_string(),
          "bundleId":app.config().identifier.clone(),
          "targetPlatform":platform,
          "signatureConfigured":true,
          "secretValuesIncluded":false
        }))
    }
    #[cfg(not(target_os="macos"))]
    {
        Ok(serde_json::json!({
          "currentExecutablePath":std::env::current_exe().ok().map(|p|p.to_string_lossy().to_string()),
          "currentAppBundlePath":serde_json::Value::Null,
          "underApplications":false,
          "runningFromDmg":false,
          "bundleReplaceable":true,
          "currentVersion":app.package_info().version.to_string(),
          "bundleId":app.config().identifier.clone(),
          "targetPlatform":std::env::consts::OS,
          "signatureConfigured":true,
          "secretValuesIncluded":false
        }))
    }
}

#[tauri::command]
pub fn prepare_updater_tempdir()->Result<String,String>{
    #[cfg(target_os="macos")]
    {
        let exe=std::env::current_exe().map_err(|e|format!("Updater: current executable: {e}"))?;
        let app=app_bundle_from_exe(&exe).ok_or_else(||"Updater: VYRON.app bundle не найден".to_string())?;
        if app.to_string_lossy().starts_with("/Volumes/"){
            return Err("RUNNING_FROM_DMG: VYRON запущен из установочного образа. Переместите VYRON.app в Applications один раз.".into())
        }
        let parent=app.parent().ok_or_else(||"APP_NOT_REPLACEABLE: папка VYRON.app не найдена".to_string())?;
        let system_tmp=std::env::temp_dir();
        let app_dev=fs::metadata(parent).map_err(|e|format!("Updater: app volume: {e}"))?.dev();
        let tmp_dev=fs::metadata(&system_tmp).map_err(|e|format!("Updater: temp volume: {e}"))?.dev();
        if app_dev==tmp_dev{return Ok(system_tmp.to_string_lossy().into_owned());}
        let local_tmp=parent.join(".vyron-updater-tmp");
        fs::create_dir_all(&local_tmp).map_err(|_|{
            "APP_NOT_REPLACEABLE: Updater не может создать временную папку рядом с VYRON.app. Проверь права на папку приложения.".to_string()
        })?;
        let probe=local_tmp.join(format!(".write-probe-{}",std::process::id()));
        fs::write(&probe,b"vyron").map_err(|_|"Updater: нет записи на том, где расположен VYRON.app".to_string())?;
        let _=fs::remove_file(&probe);
        unsafe{std::env::set_var("TMPDIR",&local_tmp);}
        Ok(local_tmp.to_string_lossy().into_owned())
    }
    #[cfg(not(target_os="macos"))]
    {Ok(std::env::temp_dir().to_string_lossy().into_owned())}
}


const OWNER_PREVIEW_ENDPOINT:&str="https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/owner-preview.json";
fn build_revision()->u64{env!("VYRON_BUILD_REVISION").parse().unwrap_or(0)}
fn build_commit()->&'static str{env!("VYRON_COMMIT_SHA")}
fn update_channel()->&'static str{env!("VYRON_UPDATE_CHANNEL")}
fn preview_revision(version:&str)->Option<u64>{
    let (_,tail)=version.split_once("-preview.")?;
    tail.split('.').next()?.parse().ok()
}
fn preview_product_version(version:&str)->&str{version.split("-preview.").next().unwrap_or(version)}

#[tauri::command]
pub fn updater_runtime_identity(app:tauri::AppHandle)->serde_json::Value{
    serde_json::json!({
      "productVersion":app.package_info().version.to_string(),
      "buildRevision":build_revision(),
      "commit":build_commit(),
      "channel":update_channel(),
      "bundleId":app.config().identifier.clone()
    })
}

async fn owner_preview_update(app:&tauri::AppHandle)->Result<Option<tauri_plugin_updater::Update>,String>{
    let current_revision=build_revision();
    let endpoint=OWNER_PREVIEW_ENDPOINT.parse().map_err(|e|format!("OWNER_PREVIEW_ENDPOINT_INVALID: {e}"))?;
    let updater=app.updater_builder()
      .endpoints(vec![endpoint]).map_err(|e|format!("OWNER_PREVIEW_UPDATER_CONFIG_FAILED: {e}"))?
      .version_comparator(move |_current,remote|{
          preview_revision(&remote.version.to_string()).map(|r|r>current_revision).unwrap_or(false)
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
