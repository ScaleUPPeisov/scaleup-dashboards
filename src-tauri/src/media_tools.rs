use serde_json::Value;
use std::{env,fs,path::{Path,PathBuf},process::{Command,Output}};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

fn command_capture(mut cmd:Command,label:&str)->Result<Output,String>{
 let out=cmd.output().map_err(|e|format!("{label}: не удалось запустить: {e}"))?;
 if !out.status.success(){
  let err=String::from_utf8_lossy(&out.stderr);
  return Err(format!("{label}: {}",err.lines().rev().find(|x|!x.trim().is_empty()).unwrap_or("ошибка процесса")))
 }
 Ok(out)
}
fn command_output(cmd:Command,label:&str)->Result<String,String>{
 let out=command_capture(cmd,label)?;
 Ok(String::from_utf8_lossy(&out.stdout).to_string())
}
fn media_tool_executable(path:&Path)->bool{
 let Ok(meta)=fs::metadata(path) else{return false};
 if !meta.is_file(){return false}
 #[cfg(unix)]{return meta.permissions().mode()&0o111!=0}
 #[cfg(not(unix))]{true}
}
fn bundled_media_candidates(tool:&str)->Vec<PathBuf>{
 let mut out=Vec::new();
 if let Ok(exe)=env::current_exe(){
  if let Some(macos)=exe.parent(){
   out.push(macos.join(tool));
   if let Some(contents)=macos.parent(){
    out.push(contents.join("Resources").join("bin").join(tool));
    out.push(contents.join("Resources").join(tool));
   }
  }
 }
 out
}
fn explicit_media_candidate(tool:&str)->Option<PathBuf>{
 let key=match tool{"ffmpeg"=>"VYRON_FFMPEG_PATH","ffprobe"=>"VYRON_FFPROBE_PATH",_=>return None};
 env::var_os(key).filter(|x|!x.is_empty()).map(PathBuf::from)
}
fn sibling_media_candidate(tool:&str)->Option<PathBuf>{
 let other=match tool{"ffmpeg"=>"ffprobe","ffprobe"=>"ffmpeg",_=>return None};
 explicit_media_candidate(other).and_then(|p|p.parent().map(|d|d.join(tool)))
}
fn path_media_candidate(tool:&str)->Option<PathBuf>{
 env::var_os("PATH").and_then(|v|env::split_paths(&v).map(|d|d.join(tool)).find(|p|media_tool_executable(p)))
}
pub(crate) fn resolve_media_tool(tool:&str)->Result<PathBuf,String>{
 let mut checked=Vec::new();
 for p in bundled_media_candidates(tool){checked.push(p.clone());if media_tool_executable(&p){return Ok(p)}}
 if let Some(p)=explicit_media_candidate(tool){checked.push(p.clone());if media_tool_executable(&p){return Ok(p)}}
 if let Some(p)=sibling_media_candidate(tool){checked.push(p.clone());if media_tool_executable(&p){return Ok(p)}}
 let system_paths_enabled={#[cfg(test)]{env::var_os("VYRON_TEST_DISABLE_SYSTEM_MEDIA_PATHS").is_none()}#[cfg(not(test))]{true}};
 if system_paths_enabled{
  for p in [PathBuf::from("/opt/homebrew/bin").join(tool),PathBuf::from("/usr/local/bin").join(tool)]{
   checked.push(p.clone());if media_tool_executable(&p){return Ok(p)}
  }
 }
 if let Some(p)=path_media_candidate(tool){return Ok(p)}
 let (code,human)=match tool{"ffprobe"=>("FFPROBE_NOT_FOUND","FFprobe не найден"),"ffmpeg"=>("FFMPEG_NOT_FOUND","FFmpeg не найден"),_=>("MEDIA_TOOL_NOT_FOUND","Медиа-инструмент не найден")};
 let paths=checked.iter().map(|p|p.display().to_string()).collect::<Vec<_>>().join(", ");
 Err(format!("{code}: {human}. Проверены: {paths}, PATH"))
}
fn json_num(v:Option<&Value>)->f64{v.and_then(|x|x.as_str().and_then(|s|s.parse::<f64>().ok()).or_else(||x.as_f64())).unwrap_or(0.0)}
fn json_u64(v:Option<&Value>)->u64{v.and_then(|x|x.as_u64().or_else(||x.as_str().and_then(|s|s.parse::<u64>().ok()))).unwrap_or(0)}
#[derive(Debug)]
struct MediaProbe{duration:f64,has_video:bool,has_audio:bool,size:u64,audio_streams:Vec<u64>}
fn probe_media(path:&Path)->Result<MediaProbe,String>{
 if !path.exists(){return Err(format!("Исходный файл не найден: {}",path.display()))}
 let meta=fs::metadata(path).map_err(|e|format!("Не удалось прочитать файл: {e}"))?;
 if !meta.is_file()||meta.len()==0{return Err("Файл имеет нулевой размер".into())}
 let ffprobe=resolve_media_tool("ffprobe")?;
 let mut c=Command::new(ffprobe);
 c.args(["-v","error","-show_entries","format=duration:stream=index,codec_type,duration","-of","json"]).arg(path);
 let raw=command_output(c,"FFprobe")?;
 let v:Value=serde_json::from_str(&raw).map_err(|e|format!("FFprobe JSON: {e}"))?;
 let streams=v.get("streams").and_then(|x|x.as_array()).cloned().unwrap_or_default();
 let has_video=streams.iter().any(|x|x.get("codec_type").and_then(|x|x.as_str())==Some("video"));
 let audio_streams=streams.iter().filter(|x|x.get("codec_type").and_then(|x|x.as_str())==Some("audio")).map(|x|json_u64(x.get("index"))).collect::<Vec<_>>();
 let mut duration=json_num(v.pointer("/format/duration"));
 if duration<=0.0{duration=streams.iter().map(|x|json_num(x.get("duration"))).fold(0.0,f64::max)}
 Ok(MediaProbe{duration,has_video,has_audio:!audio_streams.is_empty(),size:meta.len(),audio_streams})
}
fn parse_max_volume(stderr:&str)->Option<f64>{
 stderr.lines().find_map(|line|{let(_,rest)=line.split_once("max_volume:")?;let raw=rest.trim().split_whitespace().next()?;if raw.eq_ignore_ascii_case("-inf"){Some(-200.0)}else{raw.parse::<f64>().ok()}})
}
fn audio_max_db(path:&Path,stream_index:u64,duration:f64)->Result<f64,String>{
 let ffmpeg=resolve_media_tool("ffmpeg")?;
 let mut c=Command::new(ffmpeg);
 c.args(["-hide_banner","-nostats","-loglevel","info","-i"]).arg(path)
  .args(["-t",&format!("{:.3}",duration.max(0.1)),"-map",&format!("0:{stream_index}"),"-vn","-sn","-dn","-af","volumedetect","-f","null","-"]);
 let out=command_capture(c,"FFmpeg audio analysis")?;
 let stderr=String::from_utf8_lossy(&out.stderr);
 parse_max_volume(&stderr).ok_or_else(||"AUDIO_LEVEL_UNKNOWN: FFmpeg не вернул max_volume".to_string())
}
pub(crate) fn validate_render_media(path:&Path,require_audio:bool)->Result<(),String>{
 let p=probe_media(path)?;
 if !p.has_video||p.duration<=0.1||p.size==0{return Err("OUTPUT_INVALID: render не содержит валидный video stream/duration".into())}
 if require_audio{
  if !p.has_audio{return Err("OUTPUT_INVALID: render не содержит audio stream".into())}
  let stream=*p.audio_streams.first().ok_or_else(||"OUTPUT_INVALID: render не содержит audio stream".to_string())?;
  let level=audio_max_db(path,stream,p.duration.min(30.0))?;
  if level<=-55.0{return Err(format!("OUTPUT_INVALID: audio stream практически silent ({level:.1} dB)"))}
 }
 Ok(())
}
