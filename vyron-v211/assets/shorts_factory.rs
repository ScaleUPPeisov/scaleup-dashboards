use serde::Serialize;
use serde_json::Value;
use std::{fs,path::{Path,PathBuf},process::Command};

#[derive(Serialize,Debug)]
#[serde(rename_all="camelCase")]
pub struct ShortsProbe { pub path:String,pub duration:f64,pub width:u64,pub height:u64,pub has_video:bool,pub has_audio:bool,pub size:u64,pub format:String }
#[derive(Serialize,Debug)]
#[serde(rename_all="camelCase")]
pub struct ShortsRenderResult { pub output_path:String,pub duration:f64,pub width:u64,pub height:u64,pub has_audio:bool,pub encoder:String,pub reused:bool }

fn command_output(mut cmd:Command,label:&str)->Result<String,String>{let out=cmd.output().map_err(|e|format!("{label}: не удалось запустить: {e}"))?;if !out.status.success(){let err=String::from_utf8_lossy(&out.stderr);return Err(format!("{label}: {}",err.lines().rev().find(|x|!x.trim().is_empty()).unwrap_or("ошибка процесса")))}Ok(String::from_utf8_lossy(&out.stdout).to_string())}
fn probe(path:&Path)->Result<ShortsProbe,String>{if !path.exists(){return Err(format!("Исходный файл не найден: {}",path.display()))}let meta=fs::metadata(path).map_err(|e|format!("Не удалось прочитать файл: {e}"))?;if meta.len()==0{return Err("Файл имеет нулевой размер".into())}
 let mut c=Command::new("ffprobe");c.args(["-v","error","-show_entries","format=duration,format_name:stream=index,codec_type,width,height","-of","json"]).arg(path);let raw=command_output(c,"FFprobe")?;let v:Value=serde_json::from_str(&raw).map_err(|e|format!("FFprobe JSON: {e}"))?;let streams=v.get("streams").and_then(|x|x.as_array()).cloned().unwrap_or_default();let video=streams.iter().find(|x|x.get("codec_type").and_then(|x|x.as_str())==Some("video"));let has_audio=streams.iter().any(|x|x.get("codec_type").and_then(|x|x.as_str())==Some("audio"));let duration=v.pointer("/format/duration").and_then(|x|x.as_str()).and_then(|x|x.parse::<f64>().ok()).unwrap_or(0.0);let format=v.pointer("/format/format_name").and_then(|x|x.as_str()).unwrap_or("").to_string();Ok(ShortsProbe{path:path.to_string_lossy().into_owned(),duration,width:video.and_then(|x|x.get("width")).and_then(|x|x.as_u64()).unwrap_or(0),height:video.and_then(|x|x.get("height")).and_then(|x|x.as_u64()).unwrap_or(0),has_video:video.is_some(),has_audio,size:meta.len(),format})}
fn validate_output(path:&Path,target:f64)->Result<ShortsProbe,String>{let p=probe(path)?;if !p.has_video{return Err("Short validation: video stream отсутствует".into())}if !p.has_audio{return Err("Short validation: audio stream отсутствует".into())}if p.width!=1080||p.height!=1920{return Err(format!("Short validation: кадр {}×{}, требуется 1080×1920",p.width,p.height))}if (p.duration-target).abs()>1.25{return Err(format!("Short validation: длительность {:.2}s, ожидалось {:.2}s",p.duration,target))}if p.size<1024{return Err("Short validation: файл слишком мал".into())}if !p.format.contains("mp4")&&!p.format.contains("mov"){return Err(format!("Short validation: контейнер {} не MP4",p.format))}Ok(p)}
fn ffmpeg_filter()->&'static str{"[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30[bg2];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg2];[bg2][fg2]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]"}
fn run_render(source:&Path,temp:&Path,start:f64,duration:f64,codec:&str,audio_copy:bool)->Result<(),String>{let mut c=Command::new("ffmpeg");c.args(["-hide_banner","-loglevel","error","-y","-ss",&format!("{start:.3}"),"-i"]).arg(source).args(["-t",&format!("{duration:.3}"),"-filter_complex",ffmpeg_filter(),"-map","[v]","-map","0:a:0","-c:v",codec]);if codec=="h264_videotoolbox"{c.args(["-b:v","10M","-maxrate","16M","-bufsize","20M"]);}else{c.args(["-crf","18","-preset","medium"]);}if audio_copy{c.args(["-c:a","copy"]);}else{c.args(["-c:a","aac","-b:a","256k"]);}c.args(["-movflags","+faststart","-shortest"]).arg(temp);command_output(c,"FFmpeg Shorts render").map(|_|())}

#[tauri::command]
pub fn shorts_probe_source(source_path:String)->Result<ShortsProbe,String>{let source=Path::new(&source_path);if source.extension().and_then(|x|x.to_str()).map(|x|x.eq_ignore_ascii_case("mp4"))!=Some(true){return Err("Shorts Factory принимает только готовый MP4".into())}let p=probe(source)?;if !p.has_video{return Err("Исходный MP4 не содержит video stream".into())}if !p.has_audio{return Err("Исходный MP4 не содержит audio stream".into())}if p.duration<=0.1{return Err("FFprobe не определил длительность исходного MP4".into())}Ok(p)}

#[tauri::command]
pub fn shorts_validate_file(output_path:String,target_duration:f64)->Result<ShortsProbe,String>{validate_output(Path::new(&output_path),target_duration)}

#[tauri::command]
pub fn shorts_render_segment(source_path:String,output_path:String,start:f64,duration:f64)->Result<ShortsRenderResult,String>{if start<0.0||duration<1.0{return Err("Некорректный временной диапазон Short".into())}let source=PathBuf::from(&source_path);let src=shorts_probe_source(source_path.clone())?;if start+duration>src.duration+0.25{return Err(format!("Диапазон {:.2}–{:.2}s выходит за длительность исходника {:.2}s",start,start+duration,src.duration))}let output=PathBuf::from(&output_path);if output.exists(){if let Ok(v)=validate_output(&output,duration){return Ok(ShortsRenderResult{output_path, duration:v.duration,width:v.width,height:v.height,has_audio:v.has_audio,encoder:"existing-valid".into(),reused:true})}}
 if let Some(parent)=output.parent(){fs::create_dir_all(parent).map_err(|e|format!("Не удалось создать папку Shorts: {e}"))?}let temp=PathBuf::from(format!("{}.part.mp4",output.to_string_lossy()));let _=fs::remove_file(&temp);
 let mut attempts:Vec<(&str,bool)>=Vec::new();#[cfg(target_os="macos")]{attempts.push(("h264_videotoolbox",true));attempts.push(("h264_videotoolbox",false));}attempts.push(("libx264",true));attempts.push(("libx264",false));let mut errors=Vec::new();let mut used="";
 for (codec,copy_audio) in attempts{let _=fs::remove_file(&temp);match run_render(&source,&temp,start,duration,codec,copy_audio){Ok(_)=>match validate_output(&temp,duration){Ok(_)=>{used=if copy_audio{if codec=="h264_videotoolbox"{"h264_videotoolbox+audio-copy"}else{"libx264+audio-copy"}}else{if codec=="h264_videotoolbox"{"h264_videotoolbox+aac-fallback"}else{"libx264+aac-fallback"}};break},Err(e)=>errors.push(e)},Err(e)=>errors.push(e)}}if used.is_empty(){let _=fs::remove_file(&temp);return Err(format!("Short render failed: {}",errors.last().cloned().unwrap_or_else(||"unknown error".into())))}if let Err(e)=fs::rename(&temp,&output){let _=fs::remove_file(&temp);return Err(format!("Не удалось финализировать Short: {e}"))};let v=validate_output(&output,duration)?;Ok(ShortsRenderResult{output_path:output.to_string_lossy().into_owned(),duration:v.duration,width:v.width,height:v.height,has_audio:v.has_audio,encoder:used.into(),reused:false})}

#[cfg(test)]
mod tests{use super::*;
#[test]fn filter_contract(){let f=ffmpeg_filter();assert!(f.contains("scale=1080:1920"));assert!(f.contains("gblur"));assert!(f.contains("overlay"));assert!(f.contains("format=yuv420p"));}
#[test]fn invalid_range_rejected_before_ffmpeg(){let e=shorts_render_segment("/missing.mp4".into(),"/tmp/x.mp4".into(),-1.0,30.0).unwrap_err();assert!(e.contains("временной диапазон"));}
#[test]fn real_ffmpeg_fixture_if_enabled(){
 if std::env::var("VYRON_SHORTS_REAL_TEST").ok().as_deref()!=Some("1"){return}
 let dir=std::env::temp_dir().join(format!("vyron-shorts-real-{}",std::process::id()));let _=fs::remove_dir_all(&dir);fs::create_dir_all(&dir).unwrap();
 let source=dir.join("long.mp4");let output=dir.join("short.mp4");
 let st=Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=640x360:rate=30","-f","lavfi","-i","sine=frequency=880:sample_rate=48000","-t","36","-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-c:a","aac","-shortest"]).arg(&source).status().unwrap();assert!(st.success());
 let r=shorts_render_segment(source.to_string_lossy().into_owned(),output.to_string_lossy().into_owned(),2.0,28.0).unwrap();assert_eq!(r.width,1080);assert_eq!(r.height,1920);assert!(r.has_audio);assert!((r.duration-28.0).abs()<1.25);let _=fs::remove_dir_all(&dir);
}}
