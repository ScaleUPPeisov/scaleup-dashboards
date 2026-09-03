#!/usr/bin/env python3
from pathlib import Path
import json

VERSION='1.0.10'

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.10: '+msg)

p=Path('package.json'); package=json.loads(p.read_text()); must(package.get('version')=='1.0.9','expected package 1.0.9'); package['version']=VERSION; p.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/tauri.conf.json'); conf=json.loads(p.read_text()); must(conf.get('version')=='1.0.9','expected tauri 1.0.9'); conf['version']=VERSION; p.write_text(json.dumps(conf,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/Cargo.toml'); cargo=p.read_text(); must('version = "1.0.9"' in cargo,'expected Cargo 1.0.9'); p.write_text(cargo.replace('version = "1.0.9"','version = "1.0.10"',1))

bridge=r'''use std::{fs,path::{Path,PathBuf}};
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
'''
Path('src-tauri/src/updater_bridge.rs').write_text(bridge)

p=Path('src-tauri/src/lib.rs'); lib=p.read_text()
if 'mod updater_bridge;' not in lib:
    attr='#![recursion_limit = "512"]\n'
    must(attr in lib,'recursion_limit marker missing')
    lib=lib.replace(attr,attr+'mod updater_bridge;\n',1)
must('tauri::generate_handler![' in lib,'generate_handler marker missing')
if 'updater_bridge::prepare_updater_tempdir' not in lib:
    lib=lib.replace('tauri::generate_handler![','tauri::generate_handler![updater_bridge::prepare_updater_tempdir,',1)
p.write_text(lib)

p=Path('src/api.ts'); api=p.read_text(); needle='await update.downloadAndInstall((event:any)=>{'; must(needle in api,'downloadAndInstall marker missing'); p.write_text(api.replace(needle,"await invoke<string>('prepare_updater_tempdir');\n      "+needle,1))

p=Path('package-lock.json')
if p.exists():
    lock=json.loads(p.read_text())
    if lock.get('version')=='1.0.9': lock['version']=VERSION
    if isinstance(lock.get('packages'),dict) and isinstance(lock['packages'].get(''),dict) and lock['packages']['']['version']=='1.0.9': lock['packages']['']['version']=VERSION
    p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
print('VYRON 1.0.10 updater EXDEV hotfix v2 applied')
