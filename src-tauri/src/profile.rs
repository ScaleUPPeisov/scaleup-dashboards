use base64::Engine;
use serde::Serialize;
use std::{fs,path::{Path,PathBuf}};
use tauri::{AppHandle,Manager};

#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ProfileAvatarPayload{
    pub path:String,
    pub data_url:String,
}

fn profile_dir(app:&AppHandle)->Result<PathBuf,String>{
    let dir=app.path().app_data_dir().map_err(|e|format!("PROFILE_DATA_DIR: {e}"))?.join("profile");
    fs::create_dir_all(&dir).map_err(|e|format!("PROFILE_MKDIR: {e}"))?;
    Ok(dir)
}
fn allowed_ext(path:&Path)->Option<&'static str>{
    match path.extension().and_then(|x|x.to_str()).unwrap_or("").to_ascii_lowercase().as_str(){
        "png"=>Some("png"),
        "jpg"|"jpeg"=>Some("jpg"),
        "webp"=>Some("webp"),
        _=>None
    }
}
fn mime_for(ext:&str)->&'static str{match ext{"png"=>"image/png","webp"=>"image/webp",_=>"image/jpeg"}}
fn avatar_payload(path:&Path,ext:&str)->Result<ProfileAvatarPayload,String>{
    let bytes=fs::read(path).map_err(|e|format!("PROFILE_AVATAR_READ: {e}"))?;
    if bytes.is_empty(){return Err("PROFILE_AVATAR_EMPTY".into())}
    if bytes.len()>8*1024*1024{return Err("PROFILE_AVATAR_TOO_LARGE".into())}
    let b64=base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(ProfileAvatarPayload{path:path.to_string_lossy().into_owned(),data_url:format!("data:{};base64,{}",mime_for(ext),b64)})
}

#[tauri::command]
pub fn profile_import_avatar(app:AppHandle,path:String)->Result<ProfileAvatarPayload,String>{
    let source=PathBuf::from(path.trim());
    if !source.is_file(){return Err("PROFILE_AVATAR_NOT_FILE".into())}
    let ext=allowed_ext(&source).ok_or_else(||"PROFILE_AVATAR_FORMAT_UNSUPPORTED".to_string())?;
    let dir=profile_dir(&app)?;
    for old in ["avatar.png","avatar.jpg","avatar.webp"]{let _=fs::remove_file(dir.join(old));}
    let target=dir.join(format!("avatar.{ext}"));
    fs::copy(&source,&target).map_err(|e|format!("PROFILE_AVATAR_COPY: {e}"))?;
    avatar_payload(&target,ext)
}

#[tauri::command]
pub fn profile_avatar_data(app:AppHandle,path:String)->Result<ProfileAvatarPayload,String>{
    let dir=profile_dir(&app)?.canonicalize().map_err(|e|format!("PROFILE_CANON_DIR: {e}"))?;
    let candidate=PathBuf::from(path.trim());
    let canon=candidate.canonicalize().map_err(|e|format!("PROFILE_AVATAR_MISSING: {e}"))?;
    if !canon.starts_with(&dir){return Err("PROFILE_AVATAR_OUTSIDE_PRIVATE_DIR".into())}
    let ext=allowed_ext(&canon).ok_or_else(||"PROFILE_AVATAR_FORMAT_UNSUPPORTED".to_string())?;
    avatar_payload(&canon,ext)
}
