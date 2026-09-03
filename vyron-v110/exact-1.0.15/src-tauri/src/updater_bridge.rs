use std::{fs,path::{Path,PathBuf}};
#[cfg(target_os="macos")]
use std::os::unix::fs::MetadataExt;

fn app_bundle_from_exe(exe:&Path)->Option<PathBuf>{
    exe.ancestors().find(|p|p.extension().and_then(|x|x.to_str())==Some("app")).map(Path::to_path_buf)
}

#[tauri::command]
pub fn prepare_updater_tempdir()->Result<String,String>{
    #[cfg(target_os="macos")]
    {
        let exe=std::env::current_exe().map_err(|e|format!("Updater: current executable: {e}"))?;
        let app=app_bundle_from_exe(&exe).ok_or_else(||"Updater: VYRON.app bundle не найден".to_string())?;
        let parent=app.parent().ok_or_else(||"Updater: папка VYRON.app не найдена".to_string())?;
        let system_tmp=std::env::temp_dir();
        let app_dev=fs::metadata(parent).map_err(|e|format!("Updater: app volume: {e}"))?.dev();
        let tmp_dev=fs::metadata(&system_tmp).map_err(|e|format!("Updater: temp volume: {e}"))?.dev();
        if app_dev==tmp_dev{return Ok(system_tmp.to_string_lossy().into_owned());}
        let local_tmp=parent.join(".vyron-updater-tmp");
        fs::create_dir_all(&local_tmp).map_err(|_|{
            if app.to_string_lossy().starts_with("/Volumes/"){
                "VYRON запущен с другого/только-чтение диска. Перемести VYRON.app в папку Программы (Applications), запусти его оттуда и повтори обновление.".to_string()
            }else{"Updater не может создать временную папку рядом с VYRON.app. Проверь права на папку приложения.".to_string()}
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
