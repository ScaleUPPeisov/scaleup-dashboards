#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p):return (ROOT/p).read_text()
def w(p,s):(ROOT/p).write_text(s)
def rep(p,a,b,count=1):
 s=r(p)
 if a not in s:raise SystemExit(f'v120 backend missing anchor {p}: {a[:160]!r}')
 w(p,s.replace(a,b,count))

p='src-tauri/src/youtube.rs';s=r(p)
# std::io::Seek is needed only for local fingerprinting.
s=s.replace('io::{Read,Write}', 'io::{Read,Write,Seek}')
anchor='''fn youtube_error(v:&Value,fallback:&str)->String{'''
if anchor not in s:raise SystemExit('youtube_error anchor missing')
insert=r'''
fn local_file_fingerprint(path:&Path)->Result<Value,String>{
 let meta=fs::metadata(path).map_err(|e|format!("Файл недоступен: {e}"))?;if !meta.is_file(){return Err("Выбранный путь не является файлом".into())}let size=meta.len();if size==0{return Err("Файл пустой".into())}
 let modified=meta.modified().ok().and_then(|x|x.duration_since(UNIX_EPOCH).ok()).map(|x|x.as_secs()).unwrap_or(0);
 let mut file=fs::File::open(path).map_err(|e|e.to_string())?;let chunk=std::cmp::min(size,1024*1024) as usize;let mut first=vec![0u8;chunk];file.read_exact(&mut first).map_err(|e|e.to_string())?;
 let mut last=Vec::new();if size>chunk as u64{let tail=std::cmp::min(size,1024*1024) as usize;file.seek(std::io::SeekFrom::End(-(tail as i64))).map_err(|e|e.to_string())?;last.resize(tail,0);file.read_exact(&mut last).map_err(|e|e.to_string())?}
 let mut h=Sha256::new();h.update(b"VYRON-YT-PEISOV-FILE-FINGERPRINT-V1");h.update(size.to_le_bytes());h.update(modified.to_le_bytes());h.update(&first);h.update(&last);let fingerprint=format!("{:x}",h.finalize());Ok(json!({"fingerprint":fingerprint,"size":size,"modifiedAt":modified,"path":path.to_string_lossy()}))
}

#[tauri::command]
pub fn youtube_file_fingerprint(file_path:String)->Result<Value,String>{local_file_fingerprint(Path::new(&file_path))}

#[tauri::command]
pub async fn youtube_set_thumbnail(app:AppHandle,profile_id:String,video_id:String,file_path:String,operation_id:Option<String>)->Result<Value,String>{
 let path=PathBuf::from(&file_path);if !path.is_file(){return Err(format!("Обложка не найдена: {}",path.display()))}let bytes=fs::read(&path).map_err(|e|format!("Обложка: {e}"))?;if bytes.is_empty(){return Err("Обложка пустая".into())}let ext=path.extension().and_then(|x|x.to_str()).unwrap_or("").to_ascii_lowercase();let mime=match ext.as_str(){"jpg"|"jpeg"=>"image/jpeg","png"=>"image/png","webp"=>"image/webp",_=>return Err("Формат обложки не поддерживается этим upload flow. Используйте JPG, JPEG, PNG или WEBP.".into())};
 let (token,_)=valid_access_token(&app,&profile_id).await?;let id=video_id.trim();if id.is_empty(){return Err("YouTube video ID пуст".into())}emit_youtube_api_request(&app,"thumbnails.set",operation_id.as_deref());
 let url=format!("https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={}&uploadType=media",urlencoding::encode(id));let response=reqwest::Client::new().post(url).bearer_auth(token).header("Content-Type",mime).body(bytes).send().await.map_err(|e|format!("YouTube thumbnail network: {e}"))?;let status=response.status();let value:Value=response.json().await.unwrap_or_else(|_|json!({}));if !status.is_success(){return Err(youtube_error(&value,"YouTube не принял обложку"))}Ok(json!({"ok":true,"videoId":id,"filePath":file_path}))
}

'''
s=s.replace(anchor,insert+anchor,1)
# Test pure local fingerprint helper.
s += r'''

#[cfg(test)]
mod v120_youtube_local_tests{
 use super::*;
 #[test]
 fn fingerprint_is_stable_and_changes_with_file(){let p=std::env::temp_dir().join(format!("vyron-v120-fp-{}.mp4",Uuid::new_v4()));fs::write(&p,b"video-one").unwrap();let a=local_file_fingerprint(&p).unwrap()["fingerprint"].as_str().unwrap().to_string();let b=local_file_fingerprint(&p).unwrap()["fingerprint"].as_str().unwrap().to_string();assert_eq!(a,b);fs::write(&p,b"video-two-different").unwrap();let c=local_file_fingerprint(&p).unwrap()["fingerprint"].as_str().unwrap().to_string();assert_ne!(a,c);let _=fs::remove_file(p);}
}
'''
w(p,s)

# Register commands beside existing YouTube upload command.
p='src-tauri/src/lib.rs';s=r(p)
needle='youtube::youtube_upload_video,'
if needle not in s:raise SystemExit('lib youtube upload registration missing')
s=s.replace(needle,needle+'youtube::youtube_set_thumbnail,youtube::youtube_file_fingerprint,',1);w(p,s)

# Frontend API.
p='src/api.ts';s=r(p)
s=s.replace("export type YoutubeUploadResult={videoId?:string;channelId?:string;channelTitle?:string;scheduled:boolean};", "export type YoutubeUploadResult={videoId?:string;channelId?:string;channelTitle?:string;scheduled:boolean};\nexport type YoutubeFileFingerprint={fingerprint:string;size:number;modifiedAt:number;path:string};")
s=s.replace("'youtube_backup_existing_videos','youtube_update_existing_video'", "'youtube_backup_existing_videos','youtube_update_existing_video','youtube_set_thumbnail'")
needle="  youtubeUpload:(profileId:string,jobId:string,filePath:string,title:string,description:string,tags:string[],publishAt:string|undefined,categoryId:string,operationId?:string)=>ytInvoke<YoutubeUploadResult>('youtube_upload_video',{profileId,jobId,filePath,title,description,tags,publishAt,categoryId,operationId}),"
if needle not in s:raise SystemExit('api youtubeUpload anchor missing')
s=s.replace(needle,needle+"\n  youtubeSetThumbnail:(profileId:string,videoId:string,filePath:string,operationId?:string)=>ytInvoke<{ok:boolean;videoId:string;filePath:string}>('youtube_set_thumbnail',{profileId,videoId,filePath,operationId}),\n  youtubeFileFingerprint:(filePath:string)=>invoke<YoutubeFileFingerprint>('youtube_file_fingerprint',{filePath}),",1);w(p,s)

print('VYRON 1.2 YouTube backend patch applied')
