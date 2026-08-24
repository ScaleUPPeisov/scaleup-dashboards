use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, os::unix::fs::PermissionsExt, path::{Path, PathBuf}, process::{Command, Stdio}};

const RELEASES_API: &str = "https://api.github.com/repos/ScaleUPPeisov/scaleup-dashboards/releases?per_page=100";

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
struct GithubAsset { name: String, browser_download_url: String }

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
    draft: bool,
    prerelease: bool,
}

#[derive(Debug, Deserialize)]
struct ReleaseManifest { version: String, sha256: String, file: String }

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

fn curl_bytes(url: &str, label: &str) -> Result<Vec<u8>, String> {
    let out = Command::new("/usr/bin/curl")
        .args(["-fsSL", "--connect-timeout", "10", "--retry", "3", "-H", "Accept: application/vnd.github+json", "-A", "ReelsFactory-Updater"])
        .arg(url).output().map_err(|e| format!("{}: {}", label, e))?;
    if !out.status.success() {
        return Err(format!("{}: {}", label, String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(out.stdout)
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
    match intensity { "low" => (1.60, 0.35), "high" => (0.68, 0.14), _ => (1.00, 0.22) }
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
            if keep_end - current_start > 0.08 { result.push(EditSegment { start: current_start, end: keep_end }); }
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
            result.push(Caption { start: output_cursor + (overlap_start - segment.start), end: output_cursor + (overlap_end - segment.start), text: caption.text.clone() });
        }
        output_cursor += seg_duration;
    }
    result
}

fn transcribe(input_path: &Path, helper: &Path, work: &Path) -> Result<Vec<Caption>, String> {
    let audio=work.join("audio.m4a"); let wav=work.join("audio.wav");
    let mut c=Command::new(helper); c.arg("extract-audio").arg(input_path).arg(&audio); run(c,"Извлечение аудио")?;
    let mut a=Command::new("/usr/bin/afconvert"); a.args(["-f","WAVE","-d","LEI16@16000","-c","1"]).arg(&audio).arg(&wav); run(a,"Подготовка аудио")?;
    let model=ensure_model()?; let whisper=bin_path("whisper-cli")?; let prefix=work.join("transcript");
    let mut w=Command::new(whisper); w.args(["-m"]).arg(model).arg("-f").arg(&wav).args(["-l","auto","-osrt","-of"]).arg(&prefix); run(w,"Распознавание речи")?;
    parse_srt(&PathBuf::from(format!("{}.srt",prefix.display())))
}

#[tauri::command(rename_all = "camelCase")]
async fn process_video(input: String, aspect: String, captions: bool, caption_style: String, highlight_keywords: bool, smart_cuts: bool, cut_intensity: String, zoom_mode: String) -> Result<String, String> {
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
    let rendered_json=work.join("captions.json"); let segments_json=work.join("segments.json");
    let visible_captions: Vec<Caption> = if captions { remapped.clone() } else { Vec::new() };
    fs::write(&rendered_json,serde_json::to_vec(&visible_captions).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    fs::write(&segments_json,serde_json::to_vec(&segments).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;

    let safe_style = match caption_style.as_str() { "clean"|"dynamic"|"bold"|"minimal"|"podcast" => caption_style, _ => "clean".into() };
    let safe_zoom = match zoom_mode.as_str() { "soft"|"dynamic" => zoom_mode, _ => "off".into() };
    let safe_aspect = match aspect.as_str() { "fit916"|"crop916"|"face916"|"original" => aspect, _ => "face916".into() };
    let mut r=Command::new(&helper);
    r.arg("render").arg(&input_path).arg(&output).arg(&rendered_json).arg(&segments_json).arg(&safe_aspect).arg(&safe_style).arg(if highlight_keywords{"1"}else{"0"}).arg(&safe_zoom);
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
fn reels_version(tag: &str) -> Option<String> { tag.strip_prefix("reelsfactory-v").map(|v| v.to_string()) }

#[tauri::command]
fn check_for_update(app: tauri::AppHandle) -> Result<UpdateInfo,String>{
    let current=app.package_info().version.to_string();
    let bytes=curl_bytes(RELEASES_API,"Проверка обновлений")?;
    let releases:Vec<GithubRelease>=serde_json::from_slice(&bytes).map_err(|e|format!("Некорректный ответ GitHub Releases: {}",e))?;
    let mut candidates:Vec<(Vec<u32>,String,GithubRelease)>=releases.into_iter().filter(|r| !r.draft && !r.prerelease).filter_map(|r| reels_version(&r.tag_name).map(|v|(semver(&v),v,r))).collect();
    candidates.sort_by(|a,b| a.0.cmp(&b.0));
    let (_,version,release)=candidates.pop().ok_or("Релизы ReelsFactory пока не опубликованы")?;
    let dmg=release.assets.iter().find(|a| a.name == format!("ReelsFactory_{}_M1.dmg",version)).or_else(|| release.assets.iter().find(|a| a.name.starts_with("ReelsFactory_") && a.name.ends_with("_M1.dmg"))).ok_or("В релизе отсутствует ReelsFactory DMG")?;
    let manifest_asset=release.assets.iter().find(|a|a.name=="reelsfactory-manifest.json").ok_or("В релизе отсутствует контрольный manifest")?;
    let manifest_bytes=curl_bytes(&manifest_asset.browser_download_url,"Проверка manifest")?;
    let manifest:ReleaseManifest=serde_json::from_slice(&manifest_bytes).map_err(|e|format!("Некорректный manifest: {}",e))?;
    if manifest.version!=version || manifest.file!=dmg.name || manifest.sha256.len()!=64 { return Err("Manifest обновления не соответствует DMG".into()); }
    let (release_date,release_time)=release.published_at.as_deref().and_then(|s|s.split_once('T')).map(|(d,t)|(d.to_string(),t.trim_end_matches('Z').to_string())).unwrap_or_else(||("".into(),"".into()));
    let available=semver(&version)>semver(&current);
    Ok(UpdateInfo{available,version,notes:release.body.unwrap_or_default(),url:dmg.browser_download_url.clone(),sha256:manifest.sha256,filename:dmg.name.clone(),release_date,release_time})
}

#[tauri::command]
async fn download_update(app: tauri::AppHandle, url:String, sha256:String, filename:String)->Result<(),String>{
    if !filename.starts_with("ReelsFactory_") || !filename.ends_with("_M1.dmg") { return Err("Недопустимое имя файла обновления".into()); }
    if sha256.len()!=64 { return Err("Обновление не имеет валидной SHA-256 подписи manifest".into()); }
    let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_secs();
    let work=std::env::temp_dir().join(format!("reelsfactory-update-{}",stamp));
    fs::create_dir_all(&work).map_err(|e|e.to_string())?;
    let dmg=work.join("ReelsFactory-update.dmg");
    let mut c=Command::new("/usr/bin/curl");
    c.args(["-L","--fail","--retry","3","--connect-timeout","15","-A","ReelsFactory-Updater","-o"]).arg(&dmg).arg(&url);
    run(c,"Скачивание обновления")?;
    let bytes=fs::read(&dmg).map_err(|e|e.to_string())?; let got=format!("{:x}",Sha256::digest(&bytes));
    if got!=sha256 { return Err("Контрольная сумма DMG не совпала. Обновление отменено".into()); }

    let current_app=current_app_path()?;
    let log_dir=dirs::home_dir().ok_or("Не найдена домашняя папка")?.join("Library/Logs/ReelsFactory");
    fs::create_dir_all(&log_dir).map_err(|e|e.to_string())?;
    let log_path=log_dir.join("update.log"); let script=work.join("install-update.zsh");
    let script_body=r#"#!/bin/zsh
set -u
DMG="$1"
CURRENT="$2"
LOG="$3"
exec >>"$LOG" 2>&1

echo "===== ReelsFactory DMG update $(date) ====="
sleep 2
MOUNT=""
cleanup(){ if [[ -n "$MOUNT" ]]; then /usr/bin/hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true; fi }
trap cleanup EXIT
ATTACH=$(/usr/bin/hdiutil attach -nobrowse -readonly "$DMG") || exit 20
MOUNT=$(printf '%s\n' "$ATTACH" | /usr/bin/sed -n 's#^.*\(/Volumes/.*\)$#\1#p' | /usr/bin/tail -1)
[[ -d "$MOUNT" ]] || exit 21
NEW_APP="$MOUNT/ReelsFactory.app"
if [[ ! -d "$NEW_APP" ]]; then NEW_APP=$(/usr/bin/find "$MOUNT" -type d -name 'ReelsFactory.app' -print | /usr/bin/head -1); fi
[[ -d "$NEW_APP" ]] || exit 22
BACKUP="${CURRENT%.app}.previous.app"
rm -rf "$BACKUP"
if [[ -d "$CURRENT" ]]; then mv "$CURRENT" "$BACKUP" || exit 23; fi
if ! /usr/bin/ditto "$NEW_APP" "$CURRENT"; then
  rm -rf "$CURRENT"
  [[ -d "$BACKUP" ]] && mv "$BACKUP" "$CURRENT"
  exit 24
fi
/usr/bin/xattr -dr com.apple.quarantine "$CURRENT" >/dev/null 2>&1 || true
cleanup
MOUNT=""
/usr/bin/open "$CURRENT"
/usr/bin/osascript -e 'display notification "Обновление установлено" with title "ReelsFactory"' >/dev/null 2>&1 || true
echo "SUCCESS"
"#;
    fs::write(&script,script_body).map_err(|e|e.to_string())?;
    let mut permissions=fs::metadata(&script).map_err(|e|e.to_string())?.permissions(); permissions.set_mode(0o755); fs::set_permissions(&script,permissions).map_err(|e|e.to_string())?;
    Command::new("/bin/zsh").arg(&script).arg(&dmg).arg(&current_app).arg(&log_path).stdout(Stdio::null()).stderr(Stdio::null()).stdin(Stdio::null()).spawn().map_err(|e|format!("Не удалось запустить установку обновления: {}",e))?;
    app.exit(0); Ok(())
}

fn main(){
    tauri::Builder::default()
      .invoke_handler(tauri::generate_handler![pick_video,probe_video,process_video,reveal_file,open_file,check_for_update,download_update])
      .run(tauri::generate_context!())
      .expect("error while running ReelsFactory");
}
