use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    Key, XChaCha20Poly1305, XNonce,
};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{oauth_vault, storage};

const BUNDLE_SCHEMA: u32 = 1;
const AAD: &[u8] = b"VYRON-MIGRATION-BUNDLE-v1";
const MIN_PASSPHRASE: usize = 10;
const MAX_BACKUPS: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleEnvelope {
    schema_version: u32,
    app_version: String,
    source_os: String,
    created_at: String,
    bundle_uuid: String,
    kdf: String,
    salt: String,
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortablePayload {
    schema_version: u32,
    app_version: String,
    source_os: String,
    created_at: String,
    bundle_uuid: String,
    state: Value,
    oauth_vault: Value,
    youtube_metadata: Value,
    google_config: Value,
    browser_state: Value,
    payload_sha256: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct MergeSummary {
    local_channels: usize,
    imported_channels: usize,
    duplicate_channels: usize,
    new_channels: usize,
    after_channels: usize,
    updated_channels: usize,
    deleted_channels: usize,
    imported_profiles: usize,
    existing_profiles: usize,
    new_profiles: usize,
    google_projects: usize,
    remap_required: usize,
    will_delete: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemapRow {
    channel_id: String,
    channel_name: String,
    field: String,
    old_path: String,
}

fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
fn source_os() -> String {
    std::env::consts::OS.to_string()
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    if passphrase.chars().count() < MIN_PASSPHRASE {
        return Err(format!(
            "MIGRATION_PASSPHRASE_TOO_SHORT: minimum {MIN_PASSPHRASE} characters"
        ));
    }
    let params =
        Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| format!("MIGRATION_KDF_PARAMS: {e}"))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| format!("MIGRATION_KDF_FAILED: {e}"))?;
    Ok(key)
}

fn portable_core_bytes(state: &Value, oauth: &Value, youtube: &Value, google: &Value, browser: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&json!({
        "state": state,
        "oauthVault": oauth,
        "youtubeMetadata": youtube,
        "googleConfig": google,
        "browserState": browser
    }))
    .map_err(|e| format!("MIGRATION_PAYLOAD_SERIALIZE_FAILED: {e}"))
}

fn payload_hash(state: &Value, oauth: &Value, youtube: &Value, google: &Value, browser: &Value) -> Result<String, String> {
    Ok(hex::encode(Sha256::digest(portable_core_bytes(
        state, oauth, youtube, google, browser,
    )?)))
}

fn encrypt_payload(payload: &PortablePayload, passphrase: &str) -> Result<Vec<u8>, String> {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(passphrase, &salt)?;
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let plain = serde_json::to_vec(payload)
        .map_err(|e| format!("MIGRATION_PAYLOAD_SERIALIZE_FAILED: {e}"))?;
    let ciphertext = XChaCha20Poly1305::new(Key::from_slice(&key))
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &plain,
                aad: AAD,
            },
        )
        .map_err(|_| "MIGRATION_ENCRYPT_FAILED".to_string())?;
    serde_json::to_vec_pretty(&BundleEnvelope {
        schema_version: BUNDLE_SCHEMA,
        app_version: payload.app_version.clone(),
        source_os: payload.source_os.clone(),
        created_at: payload.created_at.clone(),
        bundle_uuid: payload.bundle_uuid.clone(),
        kdf: "argon2id:m=65536,t=3,p=1 + XChaCha20-Poly1305".into(),
        salt: B64.encode(salt),
        nonce: B64.encode(nonce),
        ciphertext: B64.encode(ciphertext),
    })
    .map_err(|e| format!("MIGRATION_ENVELOPE_SERIALIZE_FAILED: {e}"))
}

fn decrypt_payload(bytes: &[u8], passphrase: &str) -> Result<PortablePayload, String> {
    let envelope: BundleEnvelope =
        serde_json::from_slice(bytes).map_err(|e| format!("MIGRATION_BUNDLE_INVALID: {e}"))?;
    if envelope.schema_version != BUNDLE_SCHEMA {
        return Err(format!(
            "MIGRATION_SCHEMA_UNSUPPORTED: {}",
            envelope.schema_version
        ));
    }
    let salt = B64
        .decode(envelope.salt)
        .map_err(|_| "MIGRATION_SALT_INVALID".to_string())?;
    let nonce = B64
        .decode(envelope.nonce)
        .map_err(|_| "MIGRATION_NONCE_INVALID".to_string())?;
    if salt.len() != 16 || nonce.len() != 24 {
        return Err("MIGRATION_ENVELOPE_LENGTH_INVALID".into());
    }
    let ciphertext = B64
        .decode(envelope.ciphertext)
        .map_err(|_| "MIGRATION_CIPHERTEXT_INVALID".to_string())?;
    let key = derive_key(passphrase, &salt)?;
    let plain = XChaCha20Poly1305::new(Key::from_slice(&key))
        .decrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &ciphertext,
                aad: AAD,
            },
        )
        .map_err(|_| {
            "MIGRATION_AUTHENTICATION_FAILED: wrong passphrase or corrupted bundle".to_string()
        })?;
    let payload: PortablePayload = serde_json::from_slice(&plain)
        .map_err(|e| format!("MIGRATION_PAYLOAD_INVALID: {e}"))?;
    if payload.schema_version != BUNDLE_SCHEMA {
        return Err("MIGRATION_PAYLOAD_SCHEMA_INVALID".into());
    }
    let expected = payload_hash(&payload.state, &payload.oauth_vault, &payload.youtube_metadata, &payload.google_config, &payload.browser_state)?;
    if expected != payload.payload_sha256 {
        return Err("MIGRATION_INTEGRITY_FAILED: payload hash mismatch".into());
    }
    if payload.bundle_uuid != envelope.bundle_uuid {
        return Err("MIGRATION_MANIFEST_MISMATCH".into());
    }
    Ok(payload)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("MIGRATION_MKDIR_FAILED: {e}"))?;
    }
    let tmp = path.with_extension("vyron-tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("MIGRATION_WRITE_FAILED: {e}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("MIGRATION_REPLACE_FAILED: {e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("MIGRATION_RENAME_FAILED: {e}"))
}

fn channel_key(v: &Value) -> String {
    let yt = v
        .get("youtubeChannelId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !yt.is_empty() {
        return format!("yt:{yt}");
    }
    let id = v.get("id").and_then(Value::as_str).unwrap_or("").trim();
    format!("local:{id}")
}

fn merge_channel(local: &Value, imported: &Value, remaps: &mut Vec<RemapRow>) -> Value {
    let mut out = local.as_object().cloned().unwrap_or_default();
    if let Some(obj) = imported.as_object() {
        for (k, v) in obj {
            out.insert(k.clone(), v.clone());
        }
    }
    let channel_id = out
        .get("youtubeChannelId")
        .and_then(Value::as_str)
        .or_else(|| out.get("id").and_then(Value::as_str))
        .unwrap_or("")
        .to_string();
    let channel_name = out
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    for field in ["renderFolderPath", "projectsFolderPath"] {
        let local_path = local
            .get(field)
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let imported_path = imported
            .get(field)
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();

        if !local_path.is_empty() && Path::new(&local_path).exists() {
            out.insert(field.into(), Value::String(local_path));
            continue;
        }
        if !imported_path.is_empty() && !Path::new(&imported_path).exists() {
            out.insert(field.into(), Value::String(String::new()));
            remaps.push(RemapRow {
                channel_id: channel_id.clone(),
                channel_name: channel_name.clone(),
                field: field.into(),
                old_path: imported_path,
            });
        }
    }
    Value::Object(out)
}

fn merge_array_by_key(local: &Value, imported: &Value, key_field: &str) -> Value {
    let mut out = local.as_array().cloned().unwrap_or_default();
    let mut index = HashMap::<String, usize>::new();
    for (i, row) in out.iter().enumerate() {
        if let Some(k) = row.get(key_field).and_then(Value::as_str) {
            if !k.is_empty() {
                index.insert(k.to_string(), i);
            }
        }
    }
    for row in imported.as_array().into_iter().flatten() {
        let Some(k) = row.get(key_field).and_then(Value::as_str).filter(|x| !x.is_empty()) else {
            continue;
        };
        if let Some(i) = index.get(k).copied() {
            if let (Some(dst), Some(src)) = (out[i].as_object_mut(), row.as_object()) {
                for (name, value) in src {
                    dst.insert(name.clone(), value.clone());
                }
            }
        } else {
            index.insert(k.to_string(), out.len());
            out.push(row.clone());
        }
    }
    Value::Array(out)
}

fn merge_object_map(local: &Value, imported: &Value) -> Value {
    let mut out = local.as_object().cloned().unwrap_or_default();
    if let Some(src) = imported.as_object() {
        for (k, v) in src {
            out.entry(k.clone()).or_insert_with(|| v.clone());
        }
    }
    Value::Object(out)
}

fn merge_statistics(local: &Value, imported: &Value) -> Value {
    let mut out = local.as_object().cloned().unwrap_or_default();
    if let Some(src) = imported.as_object() {
        for (channel, rows) in src {
            let cur = out.entry(channel.clone()).or_insert_with(|| json!([]));
            *cur = merge_array_by_key(cur, rows, "snapshotId");
        }
    }
    Value::Object(out)
}

fn merge_settings(local: &Value, imported: &Value) -> Value {
    let mut out = local.as_object().cloned().unwrap_or_default();
    if let Some(src) = imported.as_object() {
        for (k, v) in src {
            out.insert(k.clone(), v.clone());
        }
    }
    for path_field in ["workspace", "endlumePath"] {
        let local_value = local
            .get(path_field)
            .and_then(Value::as_str)
            .unwrap_or("");
        if !local_value.is_empty() {
            out.insert(path_field.into(), Value::String(local_value.to_string()));
        }
    }
    for secret in ["youtubeApiKey", "openaiApiKey"] {
        out.insert(secret.into(), Value::String(String::new()));
    }
    Value::Object(out)
}

fn merge_states(local: &Value, imported: &Value) -> (Value, MergeSummary, Vec<RemapRow>) {
    let mut out = local.as_object().cloned().unwrap_or_default();
    let local_channels = local
        .get("channels")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let imported_channels = imported
        .get("channels")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut channels = local_channels.clone();
    let mut index = HashMap::<String, usize>::new();
    for (i, c) in channels.iter().enumerate() {
        index.insert(channel_key(c), i);
    }
    let mut summary = MergeSummary {
        local_channels: local_channels.len(),
        imported_channels: imported_channels.len(),
        ..Default::default()
    };
    let mut remaps = Vec::new();

    for c in &imported_channels {
        let key = channel_key(c);
        if let Some(i) = index.get(&key).copied() {
            summary.duplicate_channels += 1;
            summary.updated_channels += 1;
            channels[i] = merge_channel(&channels[i], c, &mut remaps);
        } else {
            let merged = merge_channel(&json!({}), c, &mut remaps);
            index.insert(key, channels.len());
            channels.push(merged);
            summary.new_channels += 1;
        }
    }
    summary.after_channels = channels.len();
    summary.remap_required = remaps.len();
    summary.deleted_channels = 0;
    summary.will_delete = 0;
    out.insert("channels".into(), Value::Array(channels));

    for (field, key) in [
        ("jobs", "id"),
        ("competitors", "id"),
        ("uploadHistory", "id"),
        ("activityJournal", "eventId"),
    ] {
        out.insert(
            field.into(),
            merge_array_by_key(
                local.get(field).unwrap_or(&Value::Null),
                imported.get(field).unwrap_or(&Value::Null),
                key,
            ),
        );
    }
    out.insert(
        "statisticsHistory".into(),
        merge_statistics(
            local.get("statisticsHistory").unwrap_or(&Value::Null),
            imported.get("statisticsHistory").unwrap_or(&Value::Null),
        ),
    );
    out.insert(
        "fingerprintCache".into(),
        merge_object_map(
            local.get("fingerprintCache").unwrap_or(&Value::Null),
            imported.get("fingerprintCache").unwrap_or(&Value::Null),
        ),
    );
    out.insert(
        "projectLifecycle".into(),
        merge_object_map(
            local.get("projectLifecycle").unwrap_or(&Value::Null),
            imported.get("projectLifecycle").unwrap_or(&Value::Null),
        ),
    );
    out.insert(
        "settings".into(),
        merge_settings(
            local.get("settings").unwrap_or(&Value::Null),
            imported.get("settings").unwrap_or(&Value::Null),
        ),
    );

    let mut logs = local
        .get("logs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for row in imported.get("logs").and_then(Value::as_array).into_iter().flatten() {
        if !logs.iter().any(|x| x == row) {
            logs.push(row.clone());
        }
    }
    if logs.len() > 1000 {
        logs = logs.split_off(logs.len() - 1000);
    }
    out.insert("logs".into(), Value::Array(logs));

    let version = local
        .get("version")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .max(
            imported
                .get("version")
                .and_then(Value::as_u64)
                .unwrap_or(0),
        );
    out.insert("version".into(), json!(version));
    (Value::Object(out), summary, remaps)
}


fn app_data_json(app:&AppHandle,name:&str)->Result<Value,String>{
 let path=app.path().app_data_dir().map_err(|e|format!("MIGRATION_APP_DATA_PATH_FAILED: {e}"))?.join(name);
 if !path.exists(){return Ok(json!({}))}
 let bytes=fs::read(&path).map_err(|e|format!("MIGRATION_METADATA_READ_FAILED: {name}: {e}"))?;
 serde_json::from_slice(&bytes).map_err(|e|format!("MIGRATION_METADATA_PARSE_FAILED: {name}: {e}"))
}
fn scrub_secret_fields(value:&mut Value){
 match value{
  Value::Object(map)=>{
   for key in ["refresh_token","refreshToken","access_token","accessToken","client_secret","clientSecret","api_key","apiKey"]{if map.contains_key(key){map.insert(key.to_string(),Value::String(String::new()));}}
   for child in map.values_mut(){scrub_secret_fields(child);}
  }
  Value::Array(rows)=>for child in rows{scrub_secret_fields(child);},
  _=>{}
 }
}
fn portable_youtube_metadata(app:&AppHandle)->Result<Value,String>{
 let mut v=app_data_json(app,"youtube-oauth.json")?;scrub_secret_fields(&mut v);Ok(v)
}
fn portable_google_config(app:&AppHandle)->Result<Value,String>{
 let mut v=app_data_json(app,"google-config.json")?;scrub_secret_fields(&mut v);Ok(v)
}
fn merge_profile_metadata(local:&Value,imported:&Value)->Value{
 let mut out=local.as_object().cloned().unwrap_or_default();
 if let Some(src)=imported.as_object(){
  for (k,v) in src{
   if matches!(k.as_str(),"refresh_token"|"refreshToken"|"access_token"|"accessToken"|"client_secret"|"clientSecret"){continue}
   if !v.is_null(){out.insert(k.clone(),v.clone());}
  }
 }
 Value::Object(out)
}
fn merge_youtube_metadata(local:&Value,imported:&Value)->Value{
 let mut root=local.as_object().cloned().unwrap_or_default();
 let local_profiles=local.get("profiles").and_then(Value::as_array).cloned().unwrap_or_default();
 let imported_profiles=imported.get("profiles").and_then(Value::as_array).cloned().unwrap_or_default();
 let mut rows=local_profiles;
 let mut index=HashMap::<String,usize>::new();
 for (i,row) in rows.iter().enumerate(){if let Some(id)=row.get("id").and_then(Value::as_str).filter(|x|!x.is_empty()){index.insert(id.to_string(),i);}}
 for row in imported_profiles{
  let Some(id)=row.get("id").and_then(Value::as_str).filter(|x|!x.is_empty()) else{continue};
  if let Some(i)=index.get(id).copied(){rows[i]=merge_profile_metadata(&rows[i],&row);}
  else{let mut clean=row.clone();scrub_secret_fields(&mut clean);index.insert(id.to_string(),rows.len());rows.push(clean);}
 }
 root.insert("profiles".into(),Value::Array(rows));
 Value::Object(root)
}
fn merge_google_config(local:&Value,imported:&Value)->Value{
 let mut out=local.as_object().cloned().unwrap_or_default();
 let local_client=local.get("client_id").or_else(||local.get("clientId")).and_then(Value::as_str).unwrap_or("").trim().to_string();
 let imported_client=imported.get("client_id").or_else(||imported.get("clientId")).and_then(Value::as_str).unwrap_or("").trim().to_string();
 if local_client.is_empty()&&!imported_client.is_empty(){out.insert("client_id".into(),Value::String(imported_client.clone()));}
 let effective_client=if !local_client.is_empty(){local_client}else{imported_client};
 let imported_project=imported.get("project_id").or_else(||imported.get("projectId")).and_then(Value::as_str).unwrap_or("").trim();
 let local_project=local.get("project_id").or_else(||local.get("projectId")).and_then(Value::as_str).unwrap_or("").trim();
 if local_project.is_empty()&&!imported_project.is_empty()&&!effective_client.is_empty(){out.insert("project_id".into(),Value::String(imported_project.to_string()));}
 for (k,v) in imported.as_object().into_iter().flatten(){
  if matches!(k.as_str(),"client_secret"|"clientSecret"|"api_key"|"apiKey"){continue}
  if !out.contains_key(k){out.insert(k.clone(),v.clone());}
 }
 Value::Object(out)
}
fn metadata_paths(app:&AppHandle)->Result<(PathBuf,PathBuf),String>{
 let root=app.path().app_data_dir().map_err(|e|format!("MIGRATION_APP_DATA_PATH_FAILED: {e}"))?;
 Ok((root.join("youtube-oauth.json"),root.join("google-config.json")))
}
fn write_json_private(path:&Path,value:&Value)->Result<(),String>{
 let bytes=serde_json::to_vec_pretty(value).map_err(|e|format!("MIGRATION_METADATA_SERIALIZE_FAILED: {e}"))?;
 write_atomic(path,&bytes)?;
 crate::security::private_permissions(path)
}
fn merge_and_write_metadata(app:&AppHandle,youtube:&Value,google:&Value)->Result<Value,String>{
 let current_youtube=app_data_json(app,"youtube-oauth.json")?;
 let current_google=app_data_json(app,"google-config.json")?;
 let merged_youtube=merge_youtube_metadata(&current_youtube,youtube);
 let merged_google=merge_google_config(&current_google,google);
 let (yp,gp)=metadata_paths(app)?;
 write_json_private(&yp,&merged_youtube)?;
 write_json_private(&gp,&merged_google)?;
 let profiles=merged_youtube.get("profiles").and_then(Value::as_array).map(|x|x.len()).unwrap_or(0);
 Ok(json!({"profiles":profiles,"projectId":merged_google.get("project_id").cloned().unwrap_or(Value::Null),"deleted":0}))
}

fn backup_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("MIGRATION_BACKUP_PATH_FAILED: {e}"))?
        .join("migration-backups");
    fs::create_dir_all(&root).map_err(|e| format!("MIGRATION_BACKUP_MKDIR_FAILED: {e}"))?;
    Ok(root)
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("state.json"))
}

fn rotate_backups(root: &Path) {
    let Ok(mut rows) = fs::read_dir(root).map(|r| {
        r.filter_map(Result::ok)
            .filter(|x| x.path().is_dir())
            .collect::<Vec<_>>()
    }) else {
        return;
    };
    rows.sort_by_key(|x| x.file_name());
    while rows.len() > MAX_BACKUPS {
        let old = rows.remove(0);
        let _ = fs::remove_dir_all(old.path());
    }
}

fn create_rollback_snapshot(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let dir = backup_root(app)?.join(id);
    fs::create_dir_all(&dir).map_err(|e| format!("MIGRATION_BACKUP_CREATE_FAILED: {e}"))?;
    let sp = state_path(app)?;
    if sp.exists() {
        fs::copy(&sp, dir.join("state.json"))
            .map_err(|e| format!("MIGRATION_STATE_BACKUP_FAILED: {e}"))?;
    }
    oauth_vault::copy_encrypted_snapshot(app, &dir.join("oauth-vault.enc"))?;
    let (yp,gp)=metadata_paths(app)?;
    if yp.exists(){fs::copy(&yp,dir.join("youtube-oauth.json")).map_err(|e|format!("MIGRATION_YOUTUBE_METADATA_BACKUP_FAILED: {e}"))?;}
    if gp.exists(){fs::copy(&gp,dir.join("google-config.json")).map_err(|e|format!("MIGRATION_GOOGLE_CONFIG_BACKUP_FAILED: {e}"))?;}
    fs::write(
        dir.join("meta.json"),
        serde_json::to_vec_pretty(&json!({
            "id": id,
            "createdAt": chrono::Utc::now().to_rfc3339()
        }))
        .map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("MIGRATION_BACKUP_META_FAILED: {e}"))?;
    let root = backup_root(app)?;
    rotate_backups(&root);
    Ok(dir)
}

fn restore_snapshot_dir(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let state = dir.join("state.json");
    if state.exists() {
        let bytes = fs::read(&state).map_err(|e| e.to_string())?;
        write_atomic(&state_path(app)?, &bytes)?;
    }
    let oauth = dir.join("oauth-vault.enc");
    if oauth.exists() {
        oauth_vault::restore_encrypted_snapshot(app, &oauth)?;
    }
    let (yp,gp)=metadata_paths(app)?;
    let yb=dir.join("youtube-oauth.json");if yb.exists(){write_atomic(&yp,&fs::read(yb).map_err(|e|e.to_string())?)?;}
    let gb=dir.join("google-config.json");if gb.exists(){write_atomic(&gp,&fs::read(gb).map_err(|e|e.to_string())?)?;}
    Ok(())
}

fn read_bundle(path: &str, passphrase: &str) -> Result<PortablePayload, String> {
    let bytes = fs::read(path).map_err(|e| format!("MIGRATION_READ_FAILED: {e}"))?;
    decrypt_payload(&bytes, passphrase)
}

#[tauri::command]
pub fn migration_export(
    app: AppHandle,
    path: String,
    passphrase: String,
    browser_state: Value,
) -> Result<Value, String> {
    let state = storage::load_state(app.clone());
    let oauth = oauth_vault::export_portable_snapshot(&app)?;
    let youtube_metadata=portable_youtube_metadata(&app)?;
    let google_config=portable_google_config(&app)?;
    let created = chrono::Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let checksum = payload_hash(&state, &oauth, &youtube_metadata, &google_config, &browser_state)?;
    let payload = PortablePayload {
        schema_version: BUNDLE_SCHEMA,
        app_version: app_version(),
        source_os: source_os(),
        created_at: created.clone(),
        bundle_uuid: id.clone(),
        state: state.clone(),
        oauth_vault: oauth.clone(),
        youtube_metadata,
        google_config,
        browser_state,
        payload_sha256: checksum,
    };
    let bytes = encrypt_payload(&payload, &passphrase)?;
    write_atomic(Path::new(&path), &bytes)?;
    let profiles = oauth
        .get("profiles")
        .and_then(Value::as_object)
        .map(|x| x.len())
        .unwrap_or(0);
    Ok(json!({
        "ok": true,
        "path": path,
        "bundleUuid": id,
        "createdAt": created,
        "sourceOs": source_os(),
        "channels": state.get("channels").and_then(Value::as_array).map(|x|x.len()).unwrap_or(0),
        "profiles": profiles,
        "encrypted": true,
        "secretValuesLogged": false
    }))
}

#[tauri::command]
pub fn migration_preview(
    app: AppHandle,
    path: String,
    passphrase: String,
) -> Result<Value, String> {
    let payload = read_bundle(&path, &passphrase)?;
    let local = storage::load_state(app.clone());
    let (_, mut summary, remaps) = merge_states(&local, &payload.state);
    let oauth_plan = oauth_vault::portable_merge_plan(&app,&payload.oauth_vault)?;
    summary.imported_profiles = oauth_plan
        .get("importedProfiles")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    summary.existing_profiles = oauth_plan
        .get("existingProfiles")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    summary.new_profiles = oauth_plan
        .get("newProfiles")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    summary.google_projects = usize::from(
        payload.google_config.get("project_id").or_else(||payload.google_config.get("projectId"))
            .and_then(Value::as_str).map(str::trim).filter(|x|!x.is_empty()).is_some()
    );
    Ok(json!({
        "sourceOs": payload.source_os,
        "appVersion": payload.app_version,
        "createdAt": payload.created_at,
        "bundleUuid": payload.bundle_uuid,
        "summary": summary,
        "remap": remaps,
        "willDelete": 0
    }))
}

#[tauri::command]
pub fn migration_import(
    app: AppHandle,
    path: String,
    passphrase: String,
) -> Result<Value, String> {
    let payload = read_bundle(&path, &passphrase)?;
    let local = storage::load_state(app.clone());
    let (merged, mut summary, remaps) = merge_states(&local, &payload.state);
    let oauth_plan = oauth_vault::portable_merge_plan(&app,&payload.oauth_vault)?;
    summary.imported_profiles = oauth_plan
        .get("importedProfiles")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    summary.existing_profiles = oauth_plan
        .get("existingProfiles")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    summary.new_profiles = oauth_plan
        .get("newProfiles")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;

    let backup_id = format!(
        "{}-{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S"),
        Uuid::new_v4()
    );
    let backup = create_rollback_snapshot(&app, &backup_id)?;

    if let Err(e) = storage::save_state(app.clone(), merged) {
        let _ = restore_snapshot_dir(&app, &backup);
        return Err(format!("MIGRATION_STATE_COMMIT_FAILED: {e}"));
    }

    let oauth_result = match oauth_vault::merge_portable_snapshot(&app, &payload.oauth_vault) {
        Ok(v) => v,
        Err(e) => {
            let _ = restore_snapshot_dir(&app, &backup);
            return Err(format!("MIGRATION_VAULT_COMMIT_FAILED: {e}"));
        }
    };

    let metadata_result=match merge_and_write_metadata(&app,&payload.youtube_metadata,&payload.google_config){
        Ok(v)=>v,
        Err(e)=>{let _=restore_snapshot_dir(&app,&backup);return Err(format!("MIGRATION_METADATA_COMMIT_FAILED: {e}"))}
    };

    let verify = storage::load_state(app.clone());
    let after = verify
        .get("channels")
        .and_then(Value::as_array)
        .map(|x| x.len())
        .unwrap_or(0);
    if after != summary.after_channels {
        let _ = restore_snapshot_dir(&app, &backup);
        return Err("MIGRATION_VERIFY_FAILED: channel count mismatch".into());
    }

    Ok(json!({
        "ok": true,
        "bundleUuid": payload.bundle_uuid,
        "sourceOs": payload.source_os,
        "summary": summary,
        "oauth": oauth_result,
        "metadata": metadata_result,
        "remap": remaps,
        "browserState": payload.browser_state,
        "rollbackSnapshot": backup_id,
        "willDelete": 0,
        "refreshPending": true
    }))
}

#[tauri::command]
pub fn migration_restore_latest(app: AppHandle) -> Result<Value, String> {
    let root = backup_root(&app)?;
    let mut rows = fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|x| x.path().is_dir())
        .collect::<Vec<_>>();
    rows.sort_by_key(|x| x.file_name());
    let Some(last) = rows.last() else {
        return Err("MIGRATION_BACKUP_NOT_FOUND".into());
    };
    restore_snapshot_dir(&app, &last.path())?;
    Ok(json!({
        "ok": true,
        "snapshot": last.file_name().to_string_lossy(),
        "deleted": 0
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> PortablePayload {
        let state = json!({"channels":[]});
        let oauth = json!({"profiles":{}});
        let youtube = json!({"profiles":[]});
        let google = json!({});
        let browser = json!({});
        PortablePayload {
            schema_version: 1,
            app_version: "3.3.0".into(),
            source_os: "macos".into(),
            created_at: "now".into(),
            bundle_uuid: "u".into(),
            payload_sha256: payload_hash(&state, &oauth, &youtube, &google, &browser).unwrap(),
            state,
            oauth_vault: oauth,
            youtube_metadata: youtube,
            google_config: google,
            browser_state: browser,
        }
    }

    #[test]
    fn encryption_rejects_tamper_and_wrong_password() {
        let payload = sample_payload();
        let enc = encrypt_payload(&payload, "correct horse battery staple").unwrap();
        assert!(decrypt_payload(&enc, "wrong password x").is_err());
        let mut broken = enc.clone();
        let n = broken.len();
        broken[n - 8] ^= 1;
        assert!(decrypt_payload(&broken, "correct horse battery staple").is_err());
    }

    #[test]
    fn channel_merge_is_idempotent_and_never_deletes() {
        let local = json!({
            "version":10,
            "channels":[
                {"id":"a","youtubeChannelId":"UC1","name":"Old"},
                {"id":"b","youtubeChannelId":"UC2","name":"B"}
            ],
            "settings":{}
        });
        let imported = json!({
            "version":10,
            "channels":[
                {"id":"foreign","youtubeChannelId":"UC1","name":"New"},
                {"id":"c","youtubeChannelId":"UC3","name":"C"}
            ],
            "settings":{}
        });
        let (a, s, _) = merge_states(&local, &imported);
        assert_eq!(s.local_channels, 2);
        assert_eq!(s.new_channels, 1);
        assert_eq!(s.duplicate_channels, 1);
        assert_eq!(s.after_channels, 3);
        assert_eq!(s.deleted_channels, 0);
        let (b, s2, _) = merge_states(&a, &imported);
        assert_eq!(s2.after_channels, 3);
        assert_eq!(s2.new_channels, 0);
        assert_eq!(s2.deleted_channels, 0);
        assert_eq!(b["channels"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn thirty_plus_ten_with_seven_duplicates_is_thirty_three() {
        let local = (0..30)
            .map(|i| json!({"id":format!("l{i}"),"youtubeChannelId":format!("UC{i}")}))
            .collect::<Vec<_>>();
        let mut imported = (0..7)
            .map(|i| json!({"id":format!("dup{i}"),"youtubeChannelId":format!("UC{i}")}))
            .collect::<Vec<_>>();
        imported.extend(
            (30..33).map(|i| json!({"id":format!("new{i}"),"youtubeChannelId":format!("UC{i}")})),
        );
        let (_, s, _) = merge_states(
            &json!({"channels":local,"settings":{}}),
            &json!({"channels":imported,"settings":{}}),
        );
        assert_eq!(s.after_channels, 33);
        assert_eq!(s.duplicate_channels, 7);
        assert_eq!(s.new_channels, 3);
        assert_eq!(s.deleted_channels, 0);
    }
}
