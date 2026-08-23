use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, process::Command};
use tauri::Manager;

#[derive(Debug, Serialize)]
struct UpdateInfo { available: bool, version: String, notes: String, url: String, sha256: String, filename: String }

#[derive(Debug, Deserialize)]
struct Caption { start: f64, end: f64, text: String }

fn bin_path(name: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("Не найдена папка приложения")?;
    let direct = dir.join(name);
    if direct.exists() { return Ok(direct); }
    let triple = dir.join(format!("{}-aarch64-apple-darwin", name));
    if triple.exists() { return Ok(triple); }
    Err(format!("Не найден модуль {}", name))
}

fn run(mut cmd: Command, label: &str) -> Result<(), String> {
    let out = cmd.output().map_err(|e| format!("{}: {}", label, e))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!("{}: {} {}", label, err.trim(), stdout.trim()));
    }
    Ok(())
}

#[tauri::command]
fn pick_video() -> Option<String> {
    let out = Command::new("/usr/bin/osascript")
        .args(["-e", "POSIX path of (choose file with prompt \"Выберите видео для ReelsFactory\")"])
        .output().ok()?;
    if !out.status.success() { return None; }
    let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if p.is_empty() { None } else { Some(p) }
}

fn model_path() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Не найдена Application Support")?.join("ReelsFactory").join("models");
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base.join("ggml-base.bin"))
}

fn ensure_model() -> Result<PathBuf, String> {
    let path = model_path()?;
    if path.exists() && fs::metadata(&path).map(|m| m.len() > 100_000_000).unwrap_or(false) { return Ok(path); }
    let tmp = path.with_extension("download");
    let mut c = Command::new("/usr/bin/curl");
    c.args(["-L", "--fail", "--retry", "3", "--progress-bar", "-o"]).arg(&tmp)
      .arg("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin");
    run(c, "Загрузка Whisper-модели")?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn srt_time(s: &str) -> Option<f64> {
    let t = s.trim().replace(',', ".");
    let parts: Vec<&str> = t.split(':').collect();
    if parts.len()!=3 { return None; }
    let h:f64=parts[0].parse().ok()?; let m:f64=parts[1].parse().ok()?; let sec:f64=parts[2].parse().ok()?;
    Some(h*3600.0+m*60.0+sec)
}

fn parse_srt(path: &Path) -> Result<Vec<Caption>, String> {
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?.replace("\r\n", "\n");
    let mut result=Vec::new();
    for block in raw.split("\n\n") {
        let mut lines=block.lines(); let _idx=lines.next();
        let ts=match lines.next(){Some(v)=>v,None=>continue};
        let pair:Vec<&str>=ts.split(" --> ").collect(); if pair.len()!=2{continue}
        let (Some(start),Some(end))=(srt_time(pair[0]),srt_time(pair[1])) else {continue};
        let text=lines.collect::<Vec<_>>().join(" ").trim().to_string();
        if !text.is_empty(){result.push(Caption{start,end,text});}
    }
    Ok(result)
}

#[tauri::command]
async fn process_video(input: String, aspect: String, captions: bool) -> Result<String, String> {
    let input_path=PathBuf::from(&input); if !input_path.exists(){return Err("Исходный файл не найден".into())}
    let desktop=dirs::desktop_dir().ok_or("Не найден рабочий стол")?;
    let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_secs();
    let output=desktop.join(format!("ReelsFactory-{}.mp4",stamp));
    let helper=bin_path("reelsfactory-video")?;
    let work=std::env::temp_dir().join(format!("reelsfactory-{}",stamp)); fs::create_dir_all(&work).map_err(|e|e.to_string())?;
    let captions_json=work.join("captions.json");
    if captions {
        let audio=work.join("audio.m4a"); let wav=work.join("audio.wav");
        let mut c=Command::new(&helper); c.arg("extract-audio").arg(&input_path).arg(&audio); run(c,"Извлечение аудио")?;
        let mut a=Command::new("/usr/bin/afconvert"); a.args(["-f","WAVE","-d","LEI16@16000","-c","1"]).arg(&audio).arg(&wav); run(a,"Подготовка аудио")?;
        let model=ensure_model()?; let whisper=bin_path("whisper-cli")?; let prefix=work.join("transcript");
        let mut w=Command::new(whisper); w.args(["-m"]).arg(model).arg("-f").arg(&wav).args(["-l","auto","-osrt","-of"]).arg(&prefix); run(w,"Распознавание речи")?;
        let srt=PathBuf::from(format!("{}.srt",prefix.display())); let parsed=parse_srt(&srt)?;
        fs::write(&captions_json,serde_json::to_vec(&parsed).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    } else { fs::write(&captions_json,"[]").map_err(|e|e.to_string())?; }
    let mut r=Command::new(&helper); r.arg("render").arg(&input_path).arg(&output).arg(&captions_json).arg(&aspect); run(r,"Экспорт видео")?;
    let _=fs::remove_dir_all(&work);
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
fn reveal_file(path:String)->Result<(),String>{ let mut c=Command::new("/usr/bin/open"); c.args(["-R"]).arg(path); run(c,"Finder") }

fn semver(v:&str)->Vec<u32>{v.trim_start_matches('v').split('.').take(3).map(|x|x.parse().unwrap_or(0)).collect()}

#[tauri::command]
fn check_for_update(app: tauri::AppHandle) -> Result<UpdateInfo,String>{
    let current=app.package_info().version.to_string();
    let out=Command::new("/usr/bin/curl").args(["-fsSL","-H","Accept: application/vnd.github+json","https://api.github.com/repos/ScaleUPPeisov/scaleup-dashboards/releases?per_page=20"]).output().map_err(|e|e.to_string())?;
    if !out.status.success(){return Err("GitHub update channel недоступен".into())}
    let releases:serde_json::Value=serde_json::from_slice(&out.stdout).map_err(|e|e.to_string())?;
    let Some(arr)=releases.as_array() else{return Err("Некорректный ответ update channel".into())};
    for rel in arr{
        let tag=rel["tag_name"].as_str().unwrap_or(""); if !tag.starts_with("reelsfactory-v"){continue}
        let version=tag.trim_start_matches("reelsfactory-v").to_string();
        if semver(&version)<=semver(&current){return Ok(UpdateInfo{available:false,version:current,notes:String::new(),url:String::new(),sha256:String::new(),filename:String::new()})}
        let assets=rel["assets"].as_array().cloned().unwrap_or_default();
        let dmg=assets.iter().find(|a|a["name"].as_str().unwrap_or("").ends_with(".dmg")).ok_or("В релизе нет DMG")?;
        let manifest=assets.iter().find(|a|a["name"].as_str().unwrap_or("")=="reelsfactory-manifest.json");
        let mut sha=String::new();
        if let Some(m)=manifest { if let Some(u)=m["browser_download_url"].as_str(){ if let Ok(o)=Command::new("/usr/bin/curl").args(["-fsSL",u]).output(){ if let Ok(j)=serde_json::from_slice::<serde_json::Value>(&o.stdout){sha=j["sha256"].as_str().unwrap_or("").to_string();}}}}
        return Ok(UpdateInfo{available:true,version,notes:rel["body"].as_str().unwrap_or("Новое обновление ReelsFactory").to_string(),url:dmg["browser_download_url"].as_str().unwrap_or("").to_string(),sha256:sha,filename:dmg["name"].as_str().unwrap_or("ReelsFactory.dmg").to_string()})
    }
    Ok(UpdateInfo{available:false,version:current,notes:String::new(),url:String::new(),sha256:String::new(),filename:String::new()})
}

#[tauri::command]
async fn download_update(url:String,sha256:String,filename:String)->Result<(),String>{
    let dest=dirs::download_dir().ok_or("Не найдена папка Загрузки")?.join(filename);
    let mut c=Command::new("/usr/bin/curl"); c.args(["-L","--fail","--progress-bar","-o"]).arg(&dest).arg(&url); run(c,"Скачивание обновления")?;
    if !sha256.is_empty(){let bytes=fs::read(&dest).map_err(|e|e.to_string())?; let got=format!("{:x}",Sha256::digest(&bytes)); if got!=sha256{return Err("Контрольная сумма обновления не совпала".into())}}
    let mut o=Command::new("/usr/bin/open"); o.arg(&dest); run(o,"Открытие обновления")
}

fn main(){
    tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![pick_video,process_video,reveal_file,check_for_update,download_update])
      .run(tauri::generate_context!())
      .expect("error while running ReelsFactory");
}
