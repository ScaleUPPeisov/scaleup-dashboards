use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, fs::File, path::{Path, PathBuf}, process::{Command, Stdio}};

const UPDATE_CHANNEL: &str = "https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/reelsfactory-desktop/update-channel.json";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    version: String,
    notes: String,
    url: String,
    sha256: String,
    filename: String,
    release_date: String,
    release_time: String,
}

#[derive(Debug, Deserialize)]
struct ChannelInfo {
    version: String,
    notes: String,
    source_url: String,
    sha256: Option<String>,
    release_date: Option<String>,
    release_time: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Caption { start: f64, end: f64, text: String }

#[derive(Debug, Clone, Deserialize, Serialize)]
struct EditSegment { start: f64, end: f64 }

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoProbe { duration: f64, width: u32, height: u32, fps: f64, size: u64 }

fn bin_path(name: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("Не найдена папка приложения")?;
    let direct = dir.join(name);
    if direct.exists() { return Ok(direct); }
    let triple = dir.join(format!("{}-aarch64-apple-darwin", name));
    if triple.exists() { return Ok(triple); }
    Err(format!("Не найден модуль {}", name))
}

fn current_app_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent().and_then(|p|p.parent()).and_then(|p|p.parent())
        .map(Path::to_path_buf).ok_or("Не удалось определить ReelsFactory.app".into())
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

fn probe_path(path: &Path) -> Result<VideoProbe, String> {
    let helper = bin_path("reelsfactory-video")?;
    let out = Command::new(helper).arg("probe").arg(path).output().map_err(|e| e.to_string())?;
    if !out.status.success() { return Err(String::from_utf8_lossy(&out.stderr).trim().to_string()); }
    serde_json::from_slice::<VideoProbe>(&out.stdout).map_err(|e| format!("Некорректные метаданные видео: {}", e))
}

#[tauri::command]
fn pick_video() -> Option<String> {
    let out = Command::new("/usr/bin/osascript")
        .args(["-e", "POSIX path of (choose file with prompt \"Choose video for ReelsFactory\" of type {\"public.movie\"})"])
        .output().ok()?;
    if !out.status.success() { return None; }
    let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if p.is_empty() { None } else { Some(p) }
}

#[tauri::command]
async fn probe_video(input: String) -> Result<VideoProbe, String> {
    let p = PathBuf::from(&input);
    if !p.exists() { return Err("Исходный файл не найден".into()); }
    let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["mp4", "mov", "m4v"].contains(&ext.as_str()) { return Err("Поддерживаются MP4, MOV и M4V".into()); }
    probe_path(&p)
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
        let mut lines=block.lines(); let _idx=lines.next(); let ts=match lines.next(){Some(v)=>v,None=>continue};
        let pair:Vec<&str>=ts.split(" --> ").collect(); if pair.len()!=2{continue}
        let (Some(start),Some(end))=(srt_time(pair[0]),srt_time(pair[1])) else {continue};
        let text=lines.collect::<Vec<_>>().join(" ").trim().to_string(); if !text.is_empty(){result.push(Caption{start,end,text});}
    }
    Ok(result)
}

fn cut_parameters(intensity: &str) -> (f64, f64) {
    match intensity {
        "low" => (1.60, 0.35),
        "high" => (0.68, 0.14),
        _ => (1.00, 0.22),
    }
}

fn build_segments(captions: &[Caption], duration: f64, enabled: bool, intensity: &str) -> Vec<EditSegment> {
    let duration = duration.max(0.01);
    if !enabled || captions.is_empty() { return vec![EditSegment { start: 0.0, end: duration }]; }

    let (threshold, padding) = cut_parameters(intensity);
    let mut result = Vec::new();
    let first = &captions[0];
    let mut current_start = if first.start > threshold { (first.start - padding).max(0.0) } else { 0.0 };
    let mut speech_end = first.end.min(duration);

    for caption in captions.iter().skip(1) {
        let start = caption.start.max(0.0).min(duration);
        let end = caption.end.max(start).min(duration);
        let gap = start - speech_end;
        if gap > threshold {
            let keep_end = (speech_end + padding).min(duration);
            if keep_end - current_start > 0.08 {
                result.push(EditSegment { start: current_start, end: keep_end });
            }
            current_start = (start - padding).max(0.0);
        }
        speech_end = speech_end.max(end);
    }

    let trailing_gap = duration - speech_end;
    let final_end = if trailing_gap > threshold { (speech_end + padding).min(duration) } else { duration };
    if final_end - current_start > 0.08 { result.push(EditSegment { start: current_start, end: final_end }); }
    if result.is_empty() { vec![EditSegment { start: 0.0, end: duration }] } else { result }
}

fn remap_captions(captions: &[Caption], segments: &[EditSegment]) -> Vec<Caption> {
    let mut result = Vec::new();
    let mut output_cursor = 0.0;
    for segment in segments {
        let seg_duration = (segment.end - segment.start).max(0.0);
        for caption in captions {
            let overlap_start = caption.start.max(segment.start);
            let overlap_end = caption.end.min(segment.end);
            if overlap_end - overlap_start <= 0.02 { continue; }
            result.push(Caption {
                start: output_cursor + (overlap_start - segment.start),
                end: output_cursor + (overlap_end - segment.start),
                text: caption.text.clone(),
            });
        }
        output_cursor += seg_duration;
    }
    result
}

fn transcribe(input_path: &Path, helper: &Path, work: &Path) -> Result<Vec<Caption>, String> {
    let audio=work.join("audio.m4a");
    let wav=work.join("audio.wav");
    let mut c=Command::new(helper); c.arg("extract-audio").arg(input_path).arg(&audio); run(c,"Извлечение аудио")?;
    let mut a=Command::new("/usr/bin/afconvert"); a.args(["-f","WAVE","-d","LEI16@16000","-c","1"]).arg(&audio).arg(&wav); run(a,"Подготовка аудио")?;
    let model=ensure_model()?;
    let whisper=bin_path("whisper-cli")?;
    let prefix=work.join("transcript");
    let mut w=Command::new(whisper); w.args(["-m"]).arg(model).arg("-f").arg(&wav).args(["-l","auto","-osrt","-of"]).arg(&prefix); run(w,"Распознавание речи")?;
    parse_srt(&PathBuf::from(format!("{}.srt",prefix.display())))
}

#[tauri::command(rename_all = "camelCase")]
async fn process_video(
    input: String,
    aspect: String,
    captions: bool,
    caption_style: String,
    highlight_keywords: bool,
    smart_cuts: bool,
    cut_intensity: String,
    zoom_mode: String,
) -> Result<String, String> {
    let input_path=PathBuf::from(&input);
    if !input_path.exists(){return Err("Исходный файл не найден".into())}
    let desktop=dirs::desktop_dir().ok_or("Не найден рабочий стол")?;
    let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_secs();
    let output=desktop.join(format!("ReelsFactory-{}.mp4",stamp));
    let helper=bin_path("reelsfactory-video")?;
    let work=std::env::temp_dir().join(format!("reelsfactory-{}",stamp));
    fs::create_dir_all(&work).map_err(|e|e.to_string())?;

    let metadata = probe_path(&input_path)?;
    let needs_transcript = captions || smart_cuts || zoom_mode != "off";
    let transcript = if needs_transcript { transcribe(&input_path, &helper, &work)? } else { Vec::new() };
    let segments = build_segments(&transcript, metadata.duration, smart_cuts, &cut_intensity);
    let remapped = remap_captions(&transcript, &segments);

    let analysis_json=work.join("analysis-captions.json");
    let rendered_json=work.join("captions.json");
    let segments_json=work.join("segments.json");
    fs::write(&analysis_json,serde_json::to_vec(&remapped).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    let visible_captions: Vec<Caption> = if captions { remapped.clone() } else { Vec::new() };
    fs::write(&rendered_json,serde_json::to_vec(&visible_captions).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    fs::write(&segments_json,serde_json::to_vec(&segments).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;

    let safe_style = match caption_style.as_str() { "clean"|"dynamic"|"bold"|"minimal"|"podcast" => caption_style, _ => "clean".into() };
    let safe_zoom = match zoom_mode.as_str() { "soft"|"dynamic" => zoom_mode, _ => "off".into() };
    let safe_aspect = match aspect.as_str() { "fit916"|"crop916"|"face916"|"original" => aspect, _ => "face916".into() };

    let mut r=Command::new(&helper);
    r.arg("render")
      .arg(&input_path)
      .arg(&output)
      .arg(&rendered_json)
      .arg(&segments_json)
      .arg(&safe_aspect)
      .arg(&safe_style)
      .arg(if highlight_keywords{"1"}else{"0"})
      .arg(&safe_zoom);
    let result=run(r,"Экспорт видео");
    let _=fs::remove_dir_all(&work);
    result?;
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
fn reveal_file(path:String)->Result<(),String>{ let mut c=Command::new("/usr/bin/open"); c.args(["-R"]).arg(path); run(c,"Finder") }

#[tauri::command]
fn open_file(path:String)->Result<(),String>{ let mut c=Command::new("/usr/bin/open"); c.arg(path); run(c,"Open") }

fn semver(v:&str)->Vec<u32>{ v.trim_start_matches('v').split('.').take(3).map(|x|x.parse().unwrap_or(0)).collect() }

#[tauri::command]
fn check_for_update(app: tauri::AppHandle) -> Result<UpdateInfo,String>{
    let current=app.package_info().version.to_string();
    let out=Command::new("/usr/bin/curl").args(["-fsSL","--connect-timeout","8",UPDATE_CHANNEL]).output().map_err(|e|e.to_string())?;
    if !out.status.success(){return Err("Канал обновлений ReelsFactory недоступен".into())}
    let channel:ChannelInfo=serde_json::from_slice(&out.stdout).map_err(|e|format!("Некорректный update-channel: {}",e))?;
    let available=semver(&channel.version)>semver(&current);
    Ok(UpdateInfo{available,version:channel.version,notes:channel.notes,url:channel.source_url,sha256:channel.sha256.unwrap_or_default(),filename:"ReelsFactory-update-source.zip".into(),release_date:channel.release_date.unwrap_or_default(),release_time:channel.release_time.unwrap_or_default()})
}

#[tauri::command]
async fn download_update(app: tauri::AppHandle, url:String, sha256:String, filename:String)->Result<(),String>{
    let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_secs();
    let work=std::env::temp_dir().join(format!("reelsfactory-self-update-{}",stamp)); let extracted=work.join("src"); fs::create_dir_all(&extracted).map_err(|e|e.to_string())?;
    let zip=work.join(if filename.is_empty(){"ReelsFactory-update-source.zip"}else{&filename});
    let mut c=Command::new("/usr/bin/curl"); c.args(["-L","--fail","--retry","3","-o"]).arg(&zip).arg(&url); run(c,"Скачивание обновления")?;
    if !sha256.is_empty(){let bytes=fs::read(&zip).map_err(|e|e.to_string())?;let got=format!("{:x}",Sha256::digest(&bytes));if got!=sha256{return Err("Контрольная сумма обновления не совпала".into())}}
    let mut unzip=Command::new("/usr/bin/ditto"); unzip.args(["-x","-k"]).arg(&zip).arg(&extracted); run(unzip,"Распаковка обновления")?;
    let root=fs::read_dir(&extracted).map_err(|e|e.to_string())?.filter_map(Result::ok).map(|e|e.path()).find(|p|p.is_dir()).ok_or("Не найдены исходники обновления")?;
    let script=root.join("scripts/self_update.zsh"); if !script.exists(){return Err("В обновлении отсутствует self_update.zsh".into())}
    let log_dir=dirs::home_dir().ok_or("Не найдена домашняя папка")?.join("Library/Logs/ReelsFactory"); fs::create_dir_all(&log_dir).map_err(|e|e.to_string())?;
    let log_path=log_dir.join("update.log"); let stdout=File::create(&log_path).map_err(|e|e.to_string())?; let stderr=stdout.try_clone().map_err(|e|e.to_string())?;
    let current_app=current_app_path()?; let whisper=bin_path("whisper-cli")?;
    Command::new("/bin/zsh").arg(&script).arg(&current_app).arg(&whisper).stdout(Stdio::from(stdout)).stderr(Stdio::from(stderr)).stdin(Stdio::null()).spawn().map_err(|e|format!("Не удалось запустить установщик: {}",e))?;
    app.exit(0); Ok(())
}

fn main(){
    tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![pick_video,probe_video,process_video,reveal_file,open_file,check_for_update,download_update])
      .run(tauri::generate_context!())
      .expect("error while running ReelsFactory");
}
