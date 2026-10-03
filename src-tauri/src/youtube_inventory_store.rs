use serde_json::{json,Value};
use std::{
    fs::{self,OpenOptions},
    io::Write,
    path::{Path,PathBuf},
};
use tauri::{AppHandle,Manager};

const SCHEMA_VERSION:u64=2;

fn validate_channel_id(channel_id:&str)->Result<(),String>{
    let id=channel_id.trim();
    if id.is_empty()||id.len()>180||id.contains('/')||id.contains('\\')||id=="."||id==".."||id.contains(".."){
        return Err("INVENTORY_STORAGE_INVALID_CHANNEL_ID".into())
    }
    Ok(())
}

fn inventory_root(app:&AppHandle)->Result<PathBuf,String>{
    let root=app.path().app_data_dir().map_err(|e|format!("INVENTORY_STORAGE_PATH_FAILED: {e}"))?.join("youtube-inventory");
    fs::create_dir_all(&root).map_err(|e|format!("INVENTORY_STORAGE_CREATE_FAILED: {e}"))?;
    Ok(root)
}

fn inventory_path_from_root(root:&Path,channel_id:&str)->Result<PathBuf,String>{
    validate_channel_id(channel_id)?;
    Ok(root.join(format!("{channel_id}.json")))
}

fn validate_payload(payload:&Value,channel_id:&str)->Result<(),String>{
    if payload.get("schemaVersion").and_then(Value::as_u64)!=Some(SCHEMA_VERSION){
        return Err("INVENTORY_STORAGE_SCHEMA_MISMATCH".into())
    }
    if payload.get("channelId").and_then(Value::as_str)!=Some(channel_id){
        return Err("INVENTORY_STORAGE_CHANNEL_MISMATCH".into())
    }
    if !payload.get("videos").map(|x|x.is_array()).unwrap_or(false){
        return Err("INVENTORY_STORAGE_VIDEOS_INVALID".into())
    }
    if !payload.get("baselineDelta").map(|x|x.is_object()).unwrap_or(false){
        return Err("INVENTORY_STORAGE_BASELINE_INVALID".into())
    }
    Ok(())
}

fn read_payload_path(path:&Path,channel_id:&str)->Result<Value,String>{
    if !path.exists(){return Err("INVENTORY_STORAGE_NOT_FOUND".into())}
    let bytes=fs::read(path).map_err(|e|format!("INVENTORY_STORAGE_READ_FAILED: {e}"))?;
    let value:Value=serde_json::from_slice(&bytes).map_err(|e|format!("INVENTORY_STORAGE_CORRUPT: {e}"))?;
    validate_payload(&value,channel_id).map_err(|e|format!("INVENTORY_STORAGE_CORRUPT: {e}"))?;
    Ok(value)
}

fn write_payload_atomic_path(path:&Path,channel_id:&str,payload:&Value)->Result<usize,String>{
    validate_payload(payload,channel_id)?;
    let parent=path.parent().ok_or_else(||"INVENTORY_STORAGE_PATH_FAILED".to_string())?;
    fs::create_dir_all(parent).map_err(|e|format!("INVENTORY_STORAGE_CREATE_FAILED: {e}"))?;
    let bytes=serde_json::to_vec(payload).map_err(|e|format!("INVENTORY_STORAGE_SERIALIZE_FAILED: {e}"))?;
    let nonce=format!("{}.{}.tmp",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default());
    let tmp=parent.join(format!(".{channel_id}.{nonce}"));
    let backup=parent.join(format!(".{channel_id}.bak"));
    {
        let mut file=OpenOptions::new().write(true).create_new(true).open(&tmp).map_err(|e|format!("INVENTORY_STORAGE_WRITE_FAILED: {e}"))?;
        file.write_all(&bytes).map_err(|e|format!("INVENTORY_STORAGE_WRITE_FAILED: {e}"))?;
        file.sync_all().map_err(|e|format!("INVENTORY_STORAGE_FSYNC_FAILED: {e}"))?;
    }
    let tmp_read=read_payload_path(&tmp,channel_id)?;
    validate_payload(&tmp_read,channel_id)?;
    let had_previous=path.exists();
    if had_previous{
        let _=fs::remove_file(&backup);
        fs::rename(path,&backup).map_err(|e|{let _=fs::remove_file(&tmp);format!("INVENTORY_STORAGE_BACKUP_FAILED: {e}")})?;
    }
    if let Err(e)=fs::rename(&tmp,path){
        if had_previous{let _=fs::rename(&backup,path);}
        let _=fs::remove_file(&tmp);
        return Err(format!("INVENTORY_STORAGE_REPLACE_FAILED: {e}"))
    }
    let verified=match read_payload_path(path,channel_id){
        Ok(v)=>v,
        Err(e)=>{
            let _=fs::remove_file(path);
            if had_previous{let _=fs::rename(&backup,path);}
            return Err(format!("INVENTORY_STORAGE_READBACK_FAILED: {e}"))
        }
    };
    validate_payload(&verified,channel_id).map_err(|e|format!("INVENTORY_STORAGE_READBACK_FAILED: {e}"))?;
    if had_previous{let _=fs::remove_file(&backup);}
    #[cfg(unix)]{
        use std::os::unix::fs::PermissionsExt;
        let _=fs::set_permissions(path,fs::Permissions::from_mode(0o600));
    }
    Ok(bytes.len())
}

#[tauri::command]
pub fn youtube_inventory_read(app:AppHandle,channel_id:String)->Result<Value,String>{
    let root=inventory_root(&app)?;
    let path=inventory_path_from_root(&root,&channel_id)?;
    if !path.exists(){
        return Ok(json!({"found":false,"schemaVersion":SCHEMA_VERSION,"channelId":channel_id,"path":path.to_string_lossy()}))
    }
    let payload=read_payload_path(&path,&channel_id)?;
    Ok(json!({"found":true,"schemaVersion":SCHEMA_VERSION,"channelId":channel_id,"path":path.to_string_lossy(),"payload":payload}))
}

#[tauri::command]
pub fn youtube_inventory_write(app:AppHandle,channel_id:String,payload:Value)->Result<Value,String>{
    let root=inventory_root(&app)?;
    let path=inventory_path_from_root(&root,&channel_id)?;
    let bytes=write_payload_atomic_path(&path,&channel_id,&payload)?;
    let readback=read_payload_path(&path,&channel_id)?;
    Ok(json!({
        "ok":true,"verified":true,"schemaVersion":SCHEMA_VERSION,"channelId":channel_id,
        "path":path.to_string_lossy(),"bytes":bytes,"updatedAt":readback.get("updatedAt").cloned().unwrap_or(Value::Null)
    }))
}

#[tauri::command]
pub fn youtube_inventory_delete(app:AppHandle,channel_id:String)->Result<Value,String>{
    let root=inventory_root(&app)?;
    let path=inventory_path_from_root(&root,&channel_id)?;
    if path.exists(){fs::remove_file(&path).map_err(|e|format!("INVENTORY_STORAGE_DELETE_FAILED: {e}"))?;}
    Ok(json!({"ok":true,"channelId":channel_id,"deleted":!path.exists()}))
}

#[tauri::command]
pub fn youtube_inventory_diagnostics(app:AppHandle)->Result<Value,String>{
    let root=inventory_root(&app)?;
    let mut files=0u64;let mut bytes=0u64;let mut corrupt=0u64;
    for entry in fs::read_dir(&root).map_err(|e|format!("INVENTORY_STORAGE_READDIR_FAILED: {e}"))?{
        let entry=entry.map_err(|e|format!("INVENTORY_STORAGE_READDIR_FAILED: {e}"))?;
        let path=entry.path();
        if path.extension().and_then(|x|x.to_str())!=Some("json"){continue}
        files+=1;
        bytes+=entry.metadata().map(|m|m.len()).unwrap_or(0);
        let channel_id=path.file_stem().and_then(|x|x.to_str()).unwrap_or("");
        if read_payload_path(&path,channel_id).is_err(){corrupt+=1;}
    }
    Ok(json!({"schemaVersion":SCHEMA_VERSION,"root":root.to_string_lossy(),"files":files,"bytes":bytes,"corrupt":corrupt}))
}

#[cfg(test)]
mod tests{
    use super::*;
    fn root(name:&str)->PathBuf{
        let p=std::env::temp_dir().join(format!("vyron-inventory-test-{name}-{}-{}",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()));
        fs::create_dir_all(&p).unwrap();p
    }
    fn video(id:usize,large:bool)->Value{
        json!({
          "id":format!("v{id}"),"position":id,"title":format!("Title {id}"),
          "description":if large{"x".repeat(4000)}else{"desc".into()},
          "tags":if large{vec!["deep-house".repeat(10);20]}else{vec!["deep".into(),"house".into()]},
          "categoryId":"10","privacyStatus":"private","publishAt":"2099-01-18T11:00:00Z",
          "thumbnail":"https://i.ytimg.com/example.jpg","views":123456,"likes":1000,"comments":10
        })
    }
    fn payload(channel:&str,count:usize,large:bool)->Value{
        json!({"schemaVersion":2,"channelId":channel,"updatedAt":"2026-10-03T00:00:00Z","lastCompleteAt":"2026-10-03T00:00:00Z",
          "syncInfo":{"scheduleComplete":true,"syncComplete":true},"lastCompleteSyncInfo":{"scheduleComplete":true,"syncComplete":true},
          "videos":(0..count).map(|i|video(i,large)).collect::<Vec<_>>(),"baselineDelta":{},"lastUndo":[]})
    }
    #[test]
    fn atomic_roundtrip_preserves_previous_on_invalid_new_payload(){
        let r=root("atomic");let p=inventory_path_from_root(&r,"c1").unwrap();let good=payload("c1",20,false);
        write_payload_atomic_path(&p,"c1",&good).unwrap();
        let bad=json!({"schemaVersion":2,"channelId":"wrong","videos":[],"baselineDelta":{}});
        assert!(write_payload_atomic_path(&p,"c1",&bad).is_err());
        assert_eq!(read_payload_path(&p,"c1").unwrap()["videos"].as_array().unwrap().len(),20);
        let _=fs::remove_dir_all(r);
    }
    #[test]
    fn thirty_one_channels_times_one_hundred_large_videos_succeed(){
        let r=root("31x100");
        for c in 0..31{
            let id=format!("channel-{c:02}");let p=inventory_path_from_root(&r,&id).unwrap();
            write_payload_atomic_path(&p,&id,&payload(&id,100,true)).unwrap();
            assert_eq!(read_payload_path(&p,&id).unwrap()["videos"].as_array().unwrap().len(),100);
        }
        assert_eq!(fs::read_dir(&r).unwrap().filter_map(Result::ok).filter(|e|e.path().extension().and_then(|x|x.to_str())==Some("json")).count(),31);
        let _=fs::remove_dir_all(r);
    }
    #[test]
    fn one_channel_one_thousand_videos_succeeds(){
        let r=root("1000");let p=inventory_path_from_root(&r,"large-channel").unwrap();
        write_payload_atomic_path(&p,"large-channel",&payload("large-channel",1000,true)).unwrap();
        assert_eq!(read_payload_path(&p,"large-channel").unwrap()["videos"].as_array().unwrap().len(),1000);
        let _=fs::remove_dir_all(r);
    }
    #[test]
    fn corrupt_json_returns_explicit_corrupt_error(){
        let r=root("corrupt");let p=inventory_path_from_root(&r,"c1").unwrap();fs::write(&p,b"{broken").unwrap();
        let err=read_payload_path(&p,"c1").unwrap_err();
        assert!(err.contains("INVENTORY_STORAGE_CORRUPT"));
        let _=fs::remove_dir_all(r);
    }
}
