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
