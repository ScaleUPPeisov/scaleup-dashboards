use serde::Serialize;
use serde_json::Value;
use std::{env, fs, path::{Path, PathBuf}, process::{Command, Output}};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const AUDIBLE_MAX_DB_FLOOR: f64 = -80.0;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShortsAudioStream {
    pub index: u64,
    pub codec: String,
    pub channels: u64,
    pub sample_rate: u64,
    pub duration: f64,
    pub start_time: f64,
    pub bit_rate: u64,
    pub is_default: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShortsProbe {
    pub path: String,
    pub duration: f64,
    pub width: u64,
    pub height: u64,
    pub has_video: bool,
    pub has_audio: bool,
    pub size: u64,
    pub format: String,
    pub audio_streams: Vec<ShortsAudioStream>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShortsSourceFile { pub path: String, pub name: String, pub size: u64, pub extension: String }

fn supported_source(path: &Path) -> bool {
    matches!(path.extension().and_then(|x| x.to_str()).map(|x| x.to_ascii_lowercase()).as_deref(), Some("mp4") | Some("mov"))
}

fn scan_sources(root: &Path) -> Result<Vec<ShortsSourceFile>, String> {
    if !root.is_dir() { return Err(format!("Папка Shorts не найдена: {}", root.display())); }
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("Не удалось прочитать папку {}: {e}", dir.display()))?.filter_map(Result::ok) {
            let ft = match entry.file_type() { Ok(v) => v, Err(_) => continue };
            if ft.is_symlink() { continue; }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { continue; }
            let path = entry.path();
            if ft.is_dir() {
                if name.eq_ignore_ascii_case("VYRON Shorts") { continue; }
                stack.push(path);
                continue;
            }
            if !ft.is_file() || !supported_source(&path) { continue; }
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            if size == 0 { continue; }
            out.push(ShortsSourceFile {
                path: path.to_string_lossy().into_owned(), name, size,
                extension: path.extension().and_then(|x| x.to_str()).unwrap_or("").to_ascii_lowercase(),
            });
        }
    }
    out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn shorts_scan_folder(source_folder: String) -> Result<Vec<ShortsSourceFile>, String> { scan_sources(Path::new(source_folder.trim())) }

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShortsRenderResult {
    pub output_path: String,
    pub duration: f64,
    pub width: u64,
    pub height: u64,
    pub has_audio: bool,
    pub encoder: String,
    pub reused: bool,
    pub audio_stream_index: u64,
    pub audio_max_db: f64,
}

fn command_capture(mut cmd: Command, label: &str) -> Result<Output, String> {
    let out = cmd.output().map_err(|e| format!("{label}: не удалось запустить: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("{label}: {}", err.lines().rev().find(|x| !x.trim().is_empty()).unwrap_or("ошибка процесса")));
    }
    Ok(out)
}
fn command_output(cmd: Command, label: &str) -> Result<String, String> {
    let out = command_capture(cmd, label)?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}
fn media_tool_executable(path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else { return false };
    if !meta.is_file() { return false; }
    #[cfg(unix)] { return meta.permissions().mode() & 0o111 != 0; }
    #[cfg(not(unix))] { true }
}
fn bundled_media_candidates(tool: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(exe) = env::current_exe() {
        if let Some(macos) = exe.parent() {
            out.push(macos.join(tool));
            if let Some(contents) = macos.parent() {
                out.push(contents.join("Resources").join("bin").join(tool));
                out.push(contents.join("Resources").join(tool));
            }
        }
    }
    out
}
fn explicit_media_candidate(tool: &str) -> Option<PathBuf> {
    let key = match tool { "ffmpeg" => "VYRON_FFMPEG_PATH", "ffprobe" => "VYRON_FFPROBE_PATH", _ => return None };
    env::var_os(key).filter(|x| !x.is_empty()).map(PathBuf::from)
}
fn sibling_media_candidate(tool: &str) -> Option<PathBuf> {
    let other = match tool { "ffmpeg" => "ffprobe", "ffprobe" => "ffmpeg", _ => return None };
    explicit_media_candidate(other).and_then(|p| p.parent().map(|d| d.join(tool)))
}
fn path_media_candidate(tool: &str) -> Option<PathBuf> {
    env::var_os("PATH").and_then(|v| env::split_paths(&v).map(|d| d.join(tool)).find(|p| media_tool_executable(p)))
}
pub(crate) fn resolve_media_tool(tool: &str) -> Result<PathBuf, String> {
    let mut checked = Vec::new();
    for p in bundled_media_candidates(tool) { checked.push(p.clone()); if media_tool_executable(&p) { return Ok(p); } }
    if let Some(p) = explicit_media_candidate(tool) { checked.push(p.clone()); if media_tool_executable(&p) { return Ok(p); } }
    if let Some(p) = sibling_media_candidate(tool) { checked.push(p.clone()); if media_tool_executable(&p) { return Ok(p); } }
    let system_paths_enabled = { #[cfg(test)] { env::var_os("VYRON_TEST_DISABLE_SYSTEM_MEDIA_PATHS").is_none() } #[cfg(not(test))] { true } };
    if system_paths_enabled {
        for p in [PathBuf::from("/opt/homebrew/bin").join(tool), PathBuf::from("/usr/local/bin").join(tool)] {
            checked.push(p.clone()); if media_tool_executable(&p) { return Ok(p); }
        }
    }
    if let Some(p) = path_media_candidate(tool) { return Ok(p); }
    let (code, human) = match tool {
        "ffprobe" => ("FFPROBE_NOT_FOUND", "FFprobe не найден"),
        "ffmpeg" => ("FFMPEG_NOT_FOUND", "FFmpeg не найден"),
        _ => ("MEDIA_TOOL_NOT_FOUND", "Медиа-инструмент не найден"),
    };
    let paths = checked.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ");
    Err(format!("{code}: {human}. Проверены: {paths}, PATH"))
}

fn json_num(v: Option<&Value>) -> f64 {
    v.and_then(|x| x.as_str().and_then(|s| s.parse::<f64>().ok()).or_else(|| x.as_f64())).unwrap_or(0.0)
}
fn json_u64(v: Option<&Value>) -> u64 {
    v.and_then(|x| x.as_u64().or_else(|| x.as_str().and_then(|s| s.parse::<u64>().ok()))).unwrap_or(0)
}

pub(crate) fn probe_media(path: &Path) -> Result<ShortsProbe, String> {
    if !path.exists() { return Err(format!("Исходный файл не найден: {}", path.display())); }
    let meta = fs::metadata(path).map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
    if !meta.is_file() || meta.len() == 0 { return Err("Файл имеет нулевой размер".into()); }
    let ffprobe = resolve_media_tool("ffprobe")?;
    let mut c = Command::new(ffprobe);
    c.args(["-v", "error", "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,width,height,channels,sample_rate,duration,start_time,bit_rate:stream_disposition=default", "-of", "json"]).arg(path);
    let raw = command_output(c, "FFprobe")?;
    let v: Value = serde_json::from_str(&raw).map_err(|e| format!("FFprobe JSON: {e}"))?;
    let streams = v.get("streams").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let video = streams.iter().find(|x| x.get("codec_type").and_then(|x| x.as_str()) == Some("video"));
    let audio_streams = streams.iter().filter(|x| x.get("codec_type").and_then(|x| x.as_str()) == Some("audio")).map(|x| ShortsAudioStream {
        index: json_u64(x.get("index")),
        codec: x.get("codec_name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        channels: json_u64(x.get("channels")),
        sample_rate: json_u64(x.get("sample_rate")),
        duration: json_num(x.get("duration")),
        start_time: json_num(x.get("start_time")),
        bit_rate: json_u64(x.get("bit_rate")),
        is_default: x.pointer("/disposition/default").and_then(|x| x.as_u64()).unwrap_or(0) == 1,
    }).collect::<Vec<_>>();
    let mut duration = json_num(v.pointer("/format/duration"));
    if duration <= 0.0 { duration = streams.iter().map(|x| json_num(x.get("duration"))).fold(0.0, f64::max); }
    let format = v.pointer("/format/format_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    Ok(ShortsProbe {
        path: path.to_string_lossy().into_owned(), duration,
        width: video.and_then(|x| x.get("width")).and_then(|x| x.as_u64()).unwrap_or(0),
        height: video.and_then(|x| x.get("height")).and_then(|x| x.as_u64()).unwrap_or(0),
        has_video: video.is_some(), has_audio: !audio_streams.is_empty(), size: meta.len(), format, audio_streams,
    })
}

fn parse_max_volume(stderr: &str) -> Option<f64> {
    stderr.lines().find_map(|line| {
        let (_, rest) = line.split_once("max_volume:")?;
        let raw = rest.trim().split_whitespace().next()?;
        if raw.eq_ignore_ascii_case("-inf") { Some(-200.0) } else { raw.parse::<f64>().ok() }
    })
}
fn audio_max_db(path: &Path, stream_index: u64, start: f64, duration: f64) -> Result<f64, String> {
    let ffmpeg = resolve_media_tool("ffmpeg")?;
    let mut c = Command::new(ffmpeg);
    c.args(["-hide_banner", "-nostats", "-loglevel", "info", "-i"]).arg(path)
        .args(["-ss", &format!("{start:.3}"), "-t", &format!("{duration:.3}"), "-map", &format!("0:{stream_index}"), "-vn", "-sn", "-dn", "-af", "volumedetect", "-f", "null", "-"]);
    let out = command_capture(c, "FFmpeg audio analysis")?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    parse_max_volume(&stderr).ok_or_else(|| "AUDIO_LEVEL_UNKNOWN: FFmpeg не вернул max_volume".to_string())
}
fn select_audible_audio_stream(path: &Path, start: f64, duration: f64) -> Result<(ShortsAudioStream, f64), String> {
    let probe = probe_media(path)?;
    if probe.audio_streams.is_empty() { return Err("SOURCE_AUDIO_MISSING: в исходнике нет audio stream".into()); }
    let mut streams = probe.audio_streams.clone();
    streams.sort_by_key(|s| (!s.is_default, s.index));
    let mut measured = Vec::new();
    for stream in streams {
        if stream.channels == 0 { continue; }
        match audio_max_db(path, stream.index, start, duration) {
            Ok(level) => {
                measured.push(format!("#{} {} {:.1}dB{}", stream.index, stream.codec, level, if stream.is_default { " default" } else { "" }));
                if level > AUDIBLE_MAX_DB_FLOOR { return Ok((stream, level)); }
            }
            Err(e) => measured.push(format!("#{} analysis error: {e}", stream.index)),
        }
    }
    Err(format!("SOURCE_AUDIO_SILENT: выбранный сегмент не содержит слышимого сигнала ({})", measured.join("; ")))
}
fn validate_audible_audio(path: &Path, duration: f64) -> Result<f64, String> {
    let p = probe_media(path)?;
    let Some(stream) = p.audio_streams.first() else { return Err("Short validation: audio stream отсутствует".into()); };
    let level = audio_max_db(path, stream.index, 0.0, duration.min(p.duration).max(0.1))?;
    if level <= AUDIBLE_MAX_DB_FLOOR { return Err(format!("Short validation: audio stream есть, но сигнал практически silent ({level:.1} dB)")); }
    Ok(level)
}
pub(crate) fn validate_render_media(path: &Path, require_audio: bool) -> Result<(), String> {
    let p = probe_media(path)?;
    if !p.has_video || p.duration <= 0.1 || p.size == 0 { return Err("OUTPUT_INVALID: render не содержит валидный video stream/duration".into()); }
    if require_audio {
        if !p.has_audio { return Err("OUTPUT_INVALID: render не содержит audio stream".into()); }
        validate_audible_audio(path, p.duration.min(30.0)).map_err(|e| format!("OUTPUT_INVALID: {e}"))?;
    }
    Ok(())
}

fn validate_output(path: &Path, target: f64) -> Result<(ShortsProbe, f64), String> {
    let p = probe_media(path)?;
    if !p.has_video { return Err("Short validation: video stream отсутствует".into()); }
    if !p.has_audio { return Err("Short validation: audio stream отсутствует".into()); }
    if p.width != 1080 || p.height != 1920 { return Err(format!("Short validation: кадр {}×{}, требуется 1080×1920", p.width, p.height)); }
    if (p.duration - target).abs() > 1.25 { return Err(format!("Short validation: длительность {:.2}s, ожидалось {:.2}s", p.duration, target)); }
    if p.size < 1024 { return Err("Short validation: файл слишком мал".into()); }
    if !p.format.contains("mp4") && !p.format.contains("mov") { return Err(format!("Short validation: контейнер {} не MP4", p.format)); }
    let level = validate_audible_audio(path, target)?;
    Ok((p, level))
}
fn ffmpeg_filter(start: f64, duration: f64, audio_index: u64) -> String {
    format!("[0:v:0]trim=start={start:.3}:duration={duration:.3},setpts=PTS-STARTPTS,split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30[bg2];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg2];[bg2][fg2]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v];[0:{audio_index}]atrim=start={start:.3}:duration={duration:.3},asetpts=PTS-STARTPTS[a]")
}
fn run_render(source: &Path, temp: &Path, start: f64, duration: f64, codec: &str, audio_index: u64) -> Result<(), String> {
    let ffmpeg = resolve_media_tool("ffmpeg")?;
    let filter = ffmpeg_filter(start, duration, audio_index);
    let mut c = Command::new(ffmpeg);
    c.args(["-hide_banner", "-loglevel", "error", "-y", "-i"]).arg(source)
        .args(["-filter_complex", &filter, "-map", "[v]", "-map", "[a]", "-c:v", codec]);
    if codec == "h264_videotoolbox" { c.args(["-b:v", "10M", "-maxrate", "16M", "-bufsize", "20M"]); }
    else { c.args(["-crf", "18", "-preset", "medium"]); }
    c.args(["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", "-shortest"]).arg(temp);
    command_output(c, "FFmpeg Shorts render").map(|_| ())
}

#[tauri::command]
pub fn shorts_probe_source(source_path: String) -> Result<ShortsProbe, String> {
    let source = Path::new(&source_path);
    if !supported_source(source) { return Err("Shorts Factory поддерживает готовые MP4 и MOV".into()); }
    let p = probe_media(source)?;
    if !p.has_video { return Err("Исходное видео не содержит video stream".into()); }
    if !p.has_audio { return Err("Исходное видео не содержит audio stream".into()); }
    if p.duration <= 0.1 { return Err("FFprobe не определил длительность исходного видео".into()); }
    Ok(p)
}

#[tauri::command]
pub fn shorts_validate_file(output_path: String, target_duration: f64) -> Result<ShortsProbe, String> {
    validate_output(Path::new(&output_path), target_duration).map(|x| x.0)
}

fn render_segment_sync(source_path: String, output_path: String, start: f64, duration: f64) -> Result<ShortsRenderResult, String> {
    if start < 0.0 || duration < 1.0 { return Err("Некорректный временной диапазон Short".into()); }
    let source = PathBuf::from(&source_path);
    let src = shorts_probe_source(source_path.clone())?;
    if start + duration > src.duration + 0.25 { return Err(format!("Диапазон {:.2}–{:.2}s выходит за длительность исходника {:.2}s", start, start + duration, src.duration)); }
    let (audio, source_level) = select_audible_audio_stream(&source, start, duration)?;
    let output = PathBuf::from(&output_path);
    if output.exists() {
        if let Ok((v, level)) = validate_output(&output, duration) {
            return Ok(ShortsRenderResult { output_path, duration: v.duration, width: v.width, height: v.height, has_audio: v.has_audio, encoder: "existing-valid".into(), reused: true, audio_stream_index: audio.index, audio_max_db: level });
        }
    }
    if let Some(parent) = output.parent() { fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку Shorts: {e}"))?; }
    let temp = PathBuf::from(format!("{}.part.mp4", output.to_string_lossy()));
    let _ = fs::remove_file(&temp);
    let mut codecs = Vec::new();
    #[cfg(target_os = "macos")] { codecs.push("h264_videotoolbox"); }
    codecs.push("libx264");
    let mut errors = Vec::new();
    let mut used = String::new();
    let mut output_level = source_level;
    for codec in codecs {
        let _ = fs::remove_file(&temp);
        match run_render(&source, &temp, start, duration, codec, audio.index) {
            Ok(_) => match validate_output(&temp, duration) {
                Ok((_, level)) => { used = format!("{codec}+aac+audio-stream-{}", audio.index); output_level = level; break; }
                Err(e) => errors.push(e),
            },
            Err(e) => errors.push(e),
        }
    }
    if used.is_empty() {
        let _ = fs::remove_file(&temp);
        return Err(format!("Short render failed: {}", errors.last().cloned().unwrap_or_else(|| "unknown error".into())));
    }
    if let Err(e) = fs::rename(&temp, &output) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Не удалось финализировать Short: {e}"));
    }
    let (v, level) = validate_output(&output, duration)?;
    Ok(ShortsRenderResult { output_path: output.to_string_lossy().into_owned(), duration: v.duration, width: v.width, height: v.height, has_audio: v.has_audio, encoder: used, reused: false, audio_stream_index: audio.index, audio_max_db: level.max(output_level) })
}

#[tauri::command]
pub async fn shorts_render_segment(source_path: String, output_path: String, start: f64, duration: f64) -> Result<ShortsRenderResult, String> {
    tauri::async_runtime::spawn_blocking(move || render_segment_sync(source_path, output_path, start, duration))
        .await.map_err(|e| format!("Short render worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    static MEDIA_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    fn media_env_lock() -> std::sync::MutexGuard<'static, ()> {
        MEDIA_ENV_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
    fn real_enabled() -> bool { env::var("VYRON_SHORTS_REAL_TEST").ok().as_deref() == Some("1") }
    fn make_av(path: &Path, duration: u32, audio_codec: &str) {
        let ffmpeg = resolve_media_tool("ffmpeg").unwrap();
        let st = Command::new(ffmpeg).args(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000", "-t", &duration.to_string(), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", audio_codec, "-shortest"]).arg(path).status().unwrap();
        assert!(st.success());
    }
    #[test] fn filter_contract() { let f = ffmpeg_filter(1.0, 30.0, 1); assert!(f.contains("scale=1080:1920")); assert!(f.contains("gblur")); assert!(f.contains("overlay")); assert!(f.contains("asetpts=PTS-STARTPTS")); }
    #[test] fn invalid_range_rejected_before_ffmpeg() { let e = render_segment_sync("/missing.mp4".into(), "/tmp/x.mp4".into(), -1.0, 30.0).unwrap_err(); assert!(e.contains("временной диапазон")); }
    #[test] fn folder_scan_accepts_mp4_mov_and_ignores_other_files() { let dir = env::temp_dir().join(format!("vyron-shorts-scan-{}", uuid::Uuid::new_v4())); fs::create_dir_all(dir.join("nested")).unwrap(); fs::create_dir_all(dir.join("VYRON Shorts")).unwrap(); fs::write(dir.join("a.mp4"), b"x").unwrap(); fs::write(dir.join("nested/b.mov"), b"x").unwrap(); fs::write(dir.join("note.txt"), b"x").unwrap(); fs::write(dir.join("VYRON Shorts/old.mp4"), b"x").unwrap(); let rows = shorts_scan_folder(dir.to_string_lossy().into_owned()).unwrap(); assert_eq!(rows.len(), 2); let _ = fs::remove_dir_all(dir); }
    #[cfg(unix)] fn make_exec(path: &Path) { fs::write(path, b"#!/bin/sh\nexit 0\n").unwrap(); let mut perms = fs::metadata(path).unwrap().permissions(); perms.set_mode(0o755); fs::set_permissions(path, perms).unwrap(); }
    #[test] fn bundled_candidate_has_priority() { let tool = "vyron-bundled-media-test"; let exe = env::current_exe().unwrap(); let path = exe.parent().unwrap().join(tool); let _ = fs::remove_file(&path); make_exec(&path); let resolved = resolve_media_tool(tool).unwrap(); assert_eq!(resolved, path); let _ = fs::remove_file(&path); }
    #[test] fn path_fallback_resolves_executable() { let _env_guard = media_env_lock(); let dir = env::temp_dir().join(format!("vyron-media-path-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap(); let tool = "vyron-path-media-test"; let path = dir.join(tool); make_exec(&path); let old = env::var_os("PATH"); env::set_var("PATH", &dir); let resolved = resolve_media_tool(tool).unwrap(); if let Some(v) = old { env::set_var("PATH", v) } else { env::remove_var("PATH") }; assert_eq!(resolved, path); let _ = fs::remove_dir_all(dir); }
    #[test] fn missing_ffprobe_is_structured() { let _env_guard = media_env_lock(); let old_path = env::var_os("PATH"); let old_probe = env::var_os("VYRON_FFPROBE_PATH"); let old_ffmpeg = env::var_os("VYRON_FFMPEG_PATH"); env::set_var("PATH", ""); env::remove_var("VYRON_FFPROBE_PATH"); env::remove_var("VYRON_FFMPEG_PATH"); env::set_var("VYRON_TEST_DISABLE_SYSTEM_MEDIA_PATHS", "1"); let e = resolve_media_tool("ffprobe").unwrap_err(); env::remove_var("VYRON_TEST_DISABLE_SYSTEM_MEDIA_PATHS"); if let Some(v) = old_path { env::set_var("PATH", v) } else { env::remove_var("PATH") }; if let Some(v) = old_probe { env::set_var("VYRON_FFPROBE_PATH", v) } else { env::remove_var("VYRON_FFPROBE_PATH") }; if let Some(v) = old_ffmpeg { env::set_var("VYRON_FFMPEG_PATH", v) } else { env::remove_var("VYRON_FFMPEG_PATH") }; assert!(e.starts_with("FFPROBE_NOT_FOUND:")); }
    #[test] fn finder_like_path_resolves_media_tools_if_enabled() { if !real_enabled() { return; } let _env_guard = media_env_lock(); let old = env::var_os("PATH"); env::set_var("PATH", "/usr/bin:/bin:/usr/sbin:/sbin"); let probe = resolve_media_tool("ffprobe").unwrap(); let ffmpeg = resolve_media_tool("ffmpeg").unwrap(); if let Some(v) = old { env::set_var("PATH", v) } else { env::remove_var("PATH") }; assert!(media_tool_executable(&probe)); assert!(media_tool_executable(&ffmpeg)); }
    #[test] fn real_mp4_audible_if_enabled() {
        if !real_enabled() { return; }
        let dir = env::temp_dir().join(format!("vyron-audio-mp4-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.mp4"); let output = dir.join("short.mp4"); make_av(&source, 36, "aac");
        let r = render_segment_sync(source.to_string_lossy().into_owned(), output.to_string_lossy().into_owned(), 2.0, 28.0).unwrap();
        assert_eq!(r.width, 1080); assert_eq!(r.height, 1920); assert!(r.audio_max_db > AUDIBLE_MAX_DB_FLOOR);
        let p = probe_media(&output).unwrap(); assert_eq!(p.audio_streams.first().map(|x| x.codec.as_str()), Some("aac"));
        let _ = fs::remove_dir_all(dir);
    }
    #[test] fn audible_aac_mov_if_enabled() { if !real_enabled() { return; } let dir = env::temp_dir().join(format!("vyron-audio-a-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap(); let source = dir.join("source.mov"); let output = dir.join("short.mp4"); make_av(&source, 36, "aac"); let r = render_segment_sync(source.to_string_lossy().into_owned(), output.to_string_lossy().into_owned(), 2.0, 28.0).unwrap(); assert!(r.audio_max_db > AUDIBLE_MAX_DB_FLOOR); let _ = fs::remove_dir_all(dir); }
    #[test] fn pcm_mov_transcodes_to_audible_aac_if_enabled() { if !real_enabled() { return; } let dir = env::temp_dir().join(format!("vyron-audio-b-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap(); let source = dir.join("source.mov"); let output = dir.join("short.mp4"); make_av(&source, 36, "pcm_s16le"); let r = render_segment_sync(source.to_string_lossy().into_owned(), output.to_string_lossy().into_owned(), 3.0, 28.0).unwrap(); assert!(r.encoder.contains("+aac+")); assert!(r.audio_max_db > AUDIBLE_MAX_DB_FLOOR); let _ = fs::remove_dir_all(dir); }
    #[test] fn legacy_hardcoded_audio_zero_can_reproduce_silent_output_if_enabled() {
        if !real_enabled() { return; }
        let dir = env::temp_dir().join(format!("vyron-audio-legacy-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap();
        let source = dir.join("source.mov"); let legacy = dir.join("legacy.mp4");
        let ffmpeg = resolve_media_tool("ffmpeg").unwrap();
        let st = Command::new(&ffmpeg).args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=640x360:rate=30","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-f","lavfi","-i","sine=frequency=777:sample_rate=48000","-t","12","-map","0:v","-map","1:a","-map","2:a","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-disposition:a:0","0","-disposition:a:1","default"]).arg(&source).status().unwrap(); assert!(st.success());
        let st = Command::new(&ffmpeg).args(["-hide_banner","-loglevel","error","-y","-ss","1","-i"]).arg(&source).args(["-t","8","-map","0:v:0","-map","0:a:0","-c:v","libx264","-preset","ultrafast","-c:a","aac","-shortest"]).arg(&legacy).status().unwrap(); assert!(st.success());
        let p = probe_media(&legacy).unwrap(); let a = p.audio_streams.first().unwrap(); let level = audio_max_db(&legacy, a.index, 0.0, 8.0).unwrap(); println!("LEGACY_AUDIO0_MAX_DB={level:.1}"); assert!(level <= AUDIBLE_MAX_DB_FLOOR, "legacy mapping unexpectedly audible: {level}");
        let _ = fs::remove_dir_all(dir);
    }
    #[test] fn multiple_tracks_prefers_audible_default_if_enabled() { if !real_enabled() { return; } let dir = env::temp_dir().join(format!("vyron-audio-c-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap(); let source = dir.join("source.mov"); let output = dir.join("short.mp4"); let ffmpeg = resolve_media_tool("ffmpeg").unwrap(); let st = Command::new(ffmpeg).args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=640x360:rate=30","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-f","lavfi","-i","sine=frequency=777:sample_rate=48000","-t","36","-map","0:v","-map","1:a","-map","2:a","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-disposition:a:0","0","-disposition:a:1","default"]).arg(&source).status().unwrap(); assert!(st.success()); let p = probe_media(&source).unwrap(); assert_eq!(p.audio_streams.len(), 2); let default_idx = p.audio_streams.iter().find(|x| x.is_default).unwrap().index; let r = render_segment_sync(source.to_string_lossy().into_owned(), output.to_string_lossy().into_owned(), 2.0, 28.0).unwrap(); println!("SELECTED_AUDIO_STREAM={} DEFAULT_STREAM={} OUTPUT_MAX_DB={:.1}", r.audio_stream_index, default_idx, r.audio_max_db); assert_eq!(r.audio_stream_index, default_idx); assert!(r.audio_max_db > AUDIBLE_MAX_DB_FLOOR); let _ = fs::remove_dir_all(dir); }
    #[test] fn seeked_long_video_keeps_audible_music_if_enabled() { if !real_enabled() { return; } let dir = env::temp_dir().join(format!("vyron-audio-d-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap(); let source = dir.join("long.mov"); let output = dir.join("short.mp4"); make_av(&source, 155, "aac"); let r = render_segment_sync(source.to_string_lossy().into_owned(), output.to_string_lossy().into_owned(), 120.0, 30.0).unwrap(); println!("SEEK120_OUTPUT_DURATION={:.3} OUTPUT_MAX_DB={:.1}", r.duration, r.audio_max_db); assert!((r.duration - 30.0).abs() < 1.25); assert!(r.audio_max_db > AUDIBLE_MAX_DB_FLOOR); let _ = fs::remove_dir_all(dir); }
    #[test] fn silent_audio_is_rejected_if_enabled() { if !real_enabled() { return; } let dir = env::temp_dir().join(format!("vyron-audio-silent-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&dir).unwrap(); let source = dir.join("silent.mov"); let output = dir.join("short.mp4"); let ffmpeg = resolve_media_tool("ffmpeg").unwrap(); let st = Command::new(ffmpeg).args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=640x360:rate=30","-f","lavfi","-i","anullsrc=r=48000:cl=stereo","-t","12","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-shortest"]).arg(&source).status().unwrap(); assert!(st.success()); let e = render_segment_sync(source.to_string_lossy().into_owned(), output.to_string_lossy().into_owned(), 1.0, 8.0).unwrap_err(); assert!(e.contains("SOURCE_AUDIO_SILENT")); let _ = fs::remove_dir_all(dir); }
    #[test] fn real_unicode_mov_probe_and_render_if_enabled() { if !real_enabled() { return; } let root = env::temp_dir().join(format!("vyron-real-{}", uuid::Uuid::new_v4())).join("TOSHIBA EXT").join("ВАЙРОН").join("Render").join("Midnight in Paris"); let outdir = root.join("VYRON Shorts"); fs::create_dir_all(&outdir).unwrap(); let source = root.join("001 — Ready Videos.mov"); let output = outdir.join("001 — Short 001.mp4"); make_av(&source, 12, "aac"); let r = render_segment_sync(source.to_string_lossy().into_owned(), output.to_string_lossy().into_owned(), 1.0, 8.0).unwrap(); assert_eq!(r.width, 1080); assert_eq!(r.height, 1920); assert!(r.has_audio); assert!(r.audio_max_db > AUDIBLE_MAX_DB_FLOOR); let _ = fs::remove_dir_all(root.ancestors().nth(4).unwrap_or(&root)); }
}
