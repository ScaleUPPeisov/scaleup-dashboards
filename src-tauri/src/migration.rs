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

use crate::{oauth_vault, security, storage};

const BUNDLE_SCHEMA: u32 = 2;
const AAD: &[u8] = b"VYRON-MIGRATION-BUNDLE-v2";
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
    integration_secrets: Value,
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

#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct MigrationTxnMarker{
    backup_id:String,
    created_at:String,
    phase:String,
    #[serde(default)]
    remove_secret_accounts_on_rollback:Vec<String>,
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

fn portable_core_bytes(state: &Value, oauth: &Value, youtube: &Value, google: &Value, integration: &Value, browser: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&json!({
        "state": state,
        "oauthVault": oauth,
        "youtubeMetadata": youtube,
        "googleConfig": google,
        "integrationSecrets": integration,
        "browserState": browser
    }))
    .map_err(|e| format!("MIGRATION_PAYLOAD_SERIALIZE_FAILED: {e}"))
}

fn payload_hash(state: &Value, oauth: &Value, youtube: &Value, google: &Value, integration: &Value, browser: &Value) -> Result<String, String> {
    Ok(hex::encode(Sha256::digest(portable_core_bytes(
        state, oauth, youtube, google, integration, browser,
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
    let expected = payload_hash(&payload.state, &payload.oauth_vault, &payload.youtube_metadata, &payload.google_config, &payload.integration_secrets, &payload.browser_state)?;
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
    // Existing local channel identity is authoritative. Replacing it would orphan
    // local jobs/history after a cross-machine merge of the same YouTube channel.
    for stable in ["id","slug","youtubeProfileId"] {
        let local_value=local.get(stable).and_then(Value::as_str).unwrap_or("").trim();
        if !local_value.is_empty(){out.insert(stable.into(),Value::String(local_value.to_string()));}
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
    // Machine-local paths and existing authorization-related settings must survive
    // a merge. Portable state may fill gaps, but it must never erase local secrets.
    for local_authoritative in ["workspace", "endlumePath", "youtubeOAuthClientId"] {
        let local_value = local
            .get(local_authoritative)
            .and_then(Value::as_str)
            .unwrap_or("");
        if !local_value.is_empty() {
            out.insert(local_authoritative.into(), Value::String(local_value.to_string()));
        }
    }
    // API secrets live in secure storage and are migrated separately inside the
    // encrypted bundle. Never source them from portable state JSON.
    for secret in ["youtubeApiKey", "openaiApiKey"] {
        let local_value=local.get(secret).and_then(Value::as_str).unwrap_or("");
        out.insert(secret.into(),Value::String(local_value.to_string()));
    }
    Value::Object(out)
}


fn collision_safe_channel_id(imported_id:&str,youtube_id:&str,used:&mut std::collections::HashSet<String>)->String{
    if !used.contains(imported_id){
        used.insert(imported_id.to_string());
        return imported_id.to_string()
    }
    let seed=format!("{imported_id}|{youtube_id}");
    let digest=hex::encode(Sha256::digest(seed.as_bytes()));
    for n in 12..=digest.len(){
        let candidate=format!("migrated-{}",&digest[..n]);
        if !used.contains(&candidate){used.insert(candidate.clone());return candidate}
    }
    let candidate=format!("migrated-{}",Uuid::new_v4());
    used.insert(candidate.clone());candidate
}
fn build_channel_id_remap(local_channels:&[Value],imported_channels:&[Value])->HashMap<String,String>{
    let mut by_youtube=HashMap::<String,String>::new();
    let mut used=std::collections::HashSet::<String>::new();
    for row in local_channels{
        let yt=row.get("youtubeChannelId").and_then(Value::as_str).unwrap_or("").trim();
        let id=row.get("id").and_then(Value::as_str).unwrap_or("").trim();
        if !id.is_empty(){used.insert(id.to_string());}
        if !yt.is_empty()&&!id.is_empty(){by_youtube.insert(yt.to_string(),id.to_string());}
    }
    let mut out=HashMap::new();
    for row in imported_channels{
        let imported_id=row.get("id").and_then(Value::as_str).unwrap_or("").trim();
        if imported_id.is_empty(){continue}
        let yt=row.get("youtubeChannelId").and_then(Value::as_str).unwrap_or("").trim();
        let final_id=if !yt.is_empty(){
            by_youtube.get(yt).cloned().unwrap_or_else(||collision_safe_channel_id(imported_id,yt,&mut used))
        }else{
            imported_id.to_string()
        };
        out.insert(imported_id.to_string(),final_id);
    }
    out
}
fn remap_channel_id_field(row:&mut Value,map:&HashMap<String,String>){
    let Some(obj)=row.as_object_mut() else{return};
    let Some(old)=obj.get("channelId").and_then(Value::as_str).map(str::to_string) else{return};
    if let Some(new_id)=map.get(&old){obj.insert("channelId".into(),Value::String(new_id.clone()));}
}
fn remap_imported_channel_refs(imported:&Value,map:&HashMap<String,String>)->Value{
    let mut out=imported.clone();
    let Some(root)=out.as_object_mut() else{return out};
    for field in ["jobs","uploadHistory","activityJournal"]{
        if let Some(rows)=root.get_mut(field).and_then(Value::as_array_mut){
            for row in rows{remap_channel_id_field(row,map);}
        }
    }
    if let Some(history)=root.get_mut("statisticsHistory").and_then(Value::as_object_mut){
        let old=std::mem::take(history);
        let mut rebuilt=serde_json::Map::new();
        for (key,mut rows) in old{
            if let Some(items)=rows.as_array_mut(){for row in items{remap_channel_id_field(row,map);}}
            let final_key=map.get(&key).cloned().unwrap_or(key);
            match rebuilt.get_mut(&final_key){
                Some(existing)=>{
                    let merged=merge_array_by_key(existing,&rows,"snapshotId");
                    *existing=merged;
                }
                None=>{rebuilt.insert(final_key,rows);}
            }
        }
        *history=rebuilt;
    }
    out
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
    let channel_id_remap=build_channel_id_remap(&local_channels,&imported_channels);
    let imported_refs=remap_imported_channel_refs(imported,&channel_id_remap);

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
            let mut merged = merge_channel(&json!({}), c, &mut remaps);
            if let Some(imported_id)=c.get("id").and_then(Value::as_str){
                if let Some(final_id)=channel_id_remap.get(imported_id){
                    if let Some(obj)=merged.as_object_mut(){obj.insert("id".into(),Value::String(final_id.clone()));}
                }
            }
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
                imported_refs.get(field).unwrap_or(&Value::Null),
                key,
            ),
        );
    }
    out.insert(
        "statisticsHistory".into(),
        merge_statistics(
            local.get("statisticsHistory").unwrap_or(&Value::Null),
            imported_refs.get("statisticsHistory").unwrap_or(&Value::Null),
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


const INTEGRATION_SECRET_FIELDS:[(&str,&str);2]=[
    ("youtubeApiKey","state.youtubeApiKey"),
    ("openaiApiKey","state.openaiApiKey"),
];

fn portable_integration_secrets(app:&AppHandle)->Value{
    let mut out=serde_json::Map::new();
    if let Ok(value)=storage::youtube_api_key_for_operation(app,""){
        if !value.trim().is_empty(){out.insert("youtubeApiKey".into(),Value::String(value));}
    }
    if let Ok(value)=storage::openai_api_key_for_operation(app,""){
        if !value.trim().is_empty(){out.insert("openaiApiKey".into(),Value::String(value));}
    }
    Value::Object(out)
}
fn integration_cleanup_accounts(value:&Value)->Result<Vec<String>,String>{
    let mut out=Vec::new();
    for (field,account) in INTEGRATION_SECRET_FIELDS{
        let incoming=value.get(field).and_then(Value::as_str).unwrap_or("").trim();
        if incoming.is_empty(){continue}
        let local=security::canonical_get_secret_cached(account)?;
        if local.as_deref().unwrap_or("").trim().is_empty(){out.push(account.to_string());}
    }
    Ok(out)
}
fn merge_integration_secrets(value:&Value)->Result<Value,String>{
    let mut added=0usize;let mut preserved=0usize;
    for (field,account) in INTEGRATION_SECRET_FIELDS{
        let incoming=value.get(field).and_then(Value::as_str).unwrap_or("").trim();
        if incoming.is_empty(){continue}
        let local=security::canonical_get_secret_cached(account)?;
        if local.as_deref().unwrap_or("").trim().is_empty(){
            security::canonical_set_secret(account,incoming)?;
            added+=1;
        }else{preserved+=1;}
    }
    Ok(json!({"added":added,"preservedLocal":preserved,"deleted":0,"secretValuesIncluded":false}))
}
fn cleanup_integration_accounts(accounts:&[String])->Result<(),String>{
    let mut failures=Vec::new();
    for account in accounts{
        if let Err(e)=security::canonical_set_secret(account,""){failures.push(format!("{account}:{e}"));}
    }
    if failures.is_empty(){Ok(())}else{Err(format!("MIGRATION_INTEGRATION_SECRET_ROLLBACK_FAILED: {}",failures.join(";")))}
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

fn restore_optional_file(live:&Path,backup:&Path)->Result<(),String>{
    if backup.exists(){
        let bytes=fs::read(backup).map_err(|e|format!("MIGRATION_ROLLBACK_READ_FAILED: {}: {e}",backup.display()))?;
        write_atomic(live,&bytes)?;
    }else if live.exists(){
        fs::remove_file(live).map_err(|e|format!("MIGRATION_ROLLBACK_REMOVE_FAILED: {}: {e}",live.display()))?;
    }
    Ok(())
}

fn restore_snapshot_dir(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let live_state=state_path(app)?;
    restore_optional_file(&live_state,&dir.join("state.json"))?;
    let oauth = dir.join("oauth-vault.enc");
    if oauth.exists() {
        oauth_vault::restore_encrypted_snapshot(app, &oauth)?;
    }
    let (yp,gp)=metadata_paths(app)?;
    restore_optional_file(&yp,&dir.join("youtube-oauth.json"))?;
    restore_optional_file(&gp,&dir.join("google-config.json"))?;
    Ok(())
}

fn run_with_rollback<T,F,R>(operation:F,rollback:R)->Result<T,String>
where F:FnOnce()->Result<T,String>,R:FnOnce()->Result<(),String>{
    match operation(){
        Ok(value)=>Ok(value),
        Err(primary)=>{
            match rollback(){
                Ok(())=>Err(primary),
                Err(rb)=>Err(format!("{primary}; MIGRATION_ROLLBACK_FAILED: {rb}")),
            }
        }
    }
}


fn transaction_marker_path(app:&AppHandle)->Result<PathBuf,String>{
    Ok(app.path().app_data_dir().map_err(|e|format!("MIGRATION_TXN_PATH_FAILED: {e}"))?.join("migration-transaction.json"))
}
fn valid_backup_id(id:&str)->bool{
    !id.is_empty() && !id.contains('/') && !id.contains('\\') && id!="." && id!=".."
}
fn write_transaction_marker(app:&AppHandle,backup_id:&str,phase:&str,remove_secret_accounts_on_rollback:&[String])->Result<(),String>{
    if !valid_backup_id(backup_id){return Err("MIGRATION_TXN_BACKUP_ID_INVALID".into())}
    let marker=MigrationTxnMarker{
        backup_id:backup_id.to_string(),
        created_at:chrono::Utc::now().to_rfc3339(),
        phase:phase.to_string(),
        remove_secret_accounts_on_rollback:remove_secret_accounts_on_rollback.to_vec(),
    };
    let bytes=serde_json::to_vec_pretty(&marker).map_err(|e|format!("MIGRATION_TXN_SERIALIZE_FAILED: {e}"))?;
    write_atomic(&transaction_marker_path(app)?,&bytes)
}
fn clear_transaction_marker(app:&AppHandle)->Result<(),String>{
    let path=transaction_marker_path(app)?;
    if path.exists(){fs::remove_file(&path).map_err(|e|format!("MIGRATION_TXN_CLEAR_FAILED: {e}"))?;}
    Ok(())
}
pub fn recover_interrupted_import(app:&AppHandle)->Result<(),String>{
    let marker_path=transaction_marker_path(app)?;
    if !marker_path.exists(){return Ok(())}
    let bytes=fs::read(&marker_path).map_err(|e|format!("MIGRATION_TXN_READ_FAILED: {e}"))?;
    let marker:MigrationTxnMarker=serde_json::from_slice(&bytes).map_err(|e|format!("MIGRATION_TXN_INVALID: {e}"))?;
    if !valid_backup_id(&marker.backup_id){return Err("MIGRATION_TXN_BACKUP_ID_INVALID".into())}
    if marker.phase=="COMMITTED"{
        clear_transaction_marker(app)?;
        return Ok(())
    }
    let backup=backup_root(app)?.join(&marker.backup_id);
    if !backup.is_dir(){return Err(format!("MIGRATION_TXN_BACKUP_MISSING: {}",marker.backup_id))}
    restore_snapshot_dir(app,&backup)?;
    cleanup_integration_accounts(&marker.remove_secret_accounts_on_rollback)?;
    clear_transaction_marker(app)?;
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
    let integration_secrets=portable_integration_secrets(&app);
    let created = chrono::Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let checksum = payload_hash(&state, &oauth, &youtube_metadata, &google_config, &integration_secrets, &browser_state)?;
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
        integration_secrets,
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
    let cleanup_accounts=integration_cleanup_accounts(&payload.integration_secrets)?;
    write_transaction_marker(&app,&backup_id,"PREPARED",&cleanup_accounts)?;

    let transaction=run_with_rollback(
        ||{
            storage::save_state(app.clone(), merged).map_err(|e|format!("MIGRATION_STATE_COMMIT_FAILED: {e}"))?;
            let oauth_result=oauth_vault::merge_portable_snapshot(&app,&payload.oauth_vault)
                .map_err(|e|format!("MIGRATION_VAULT_COMMIT_FAILED: {e}"))?;
            let metadata_result=merge_and_write_metadata(&app,&payload.youtube_metadata,&payload.google_config)
                .map_err(|e|format!("MIGRATION_METADATA_COMMIT_FAILED: {e}"))?;
            let integration_result=merge_integration_secrets(&payload.integration_secrets)
                .map_err(|e|format!("MIGRATION_INTEGRATION_SECRET_COMMIT_FAILED: {e}"))?;
            let verify=storage::load_state(app.clone());
            let after=verify.get("channels").and_then(Value::as_array).map(|x|x.len()).unwrap_or(0);
            if after!=summary.after_channels{return Err("MIGRATION_VERIFY_FAILED: channel count mismatch".into())}
            Ok((oauth_result,metadata_result,integration_result))
        },
        ||restore_snapshot_dir(&app,&backup)
    );
    let (oauth_result,metadata_result,integration_result)=match transaction{
        Ok(v)=>v,
        Err(e)=>{
            if !e.contains("MIGRATION_ROLLBACK_FAILED"){
                let _=cleanup_integration_accounts(&cleanup_accounts);
                let _=clear_transaction_marker(&app);
            }
            return Err(e)
        }
    };
    if let Err(mark_error)=write_transaction_marker(&app,&backup_id,"COMMITTED",&cleanup_accounts){
        let rollback=restore_snapshot_dir(&app,&backup);
        let secret_rollback=cleanup_integration_accounts(&cleanup_accounts);
        if rollback.is_ok()&&secret_rollback.is_ok(){let _=clear_transaction_marker(&app);}
        return Err(match (rollback,secret_rollback){
            (Ok(()),Ok(()))=>format!("MIGRATION_COMMIT_MARKER_FAILED: {mark_error}"),
            (rb,sr)=>format!("MIGRATION_COMMIT_MARKER_FAILED: {mark_error}; MIGRATION_ROLLBACK_FAILED: files={rb:?}; secrets={sr:?}")
        })
    }
    // If deletion itself fails, the COMMITTED marker is intentionally left behind;
    // startup will clear it without rolling the successful import back.
    let _=clear_transaction_marker(&app);

    Ok(json!({
        "ok": true,
        "bundleUuid": payload.bundle_uuid,
        "sourceOs": payload.source_os,
        "summary": summary,
        "oauth": oauth_result,
        "metadata": metadata_result,
        "integrationSecrets": integration_result,
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
    let _=clear_transaction_marker(&app);
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
        let integration = json!({});
        let browser = json!({});
        PortablePayload {
            schema_version: BUNDLE_SCHEMA,
            app_version: "3.3.0".into(),
            source_os: "macos".into(),
            created_at: "now".into(),
            bundle_uuid: "u".into(),
            payload_sha256: payload_hash(&state, &oauth, &youtube, &google, &integration, &browser).unwrap(),
            state,
            oauth_vault: oauth,
            youtube_metadata: youtube,
            google_config: google,
            integration_secrets: integration,
            browser_state: browser,
        }
    }




    #[test]
    fn settings_merge_preserves_local_paths_oauth_client_and_api_keys(){
        let local=json!({
            "workspace":"C:\\\\local\\\\workspace",
            "endlumePath":"C:\\\\local\\\\ENDLUME.exe",
            "youtubeOAuthClientId":"local-oauth-client",
            "youtubeApiKey":"local-youtube-key",
            "openaiApiKey":"local-openai-key",
            "youtubeCategoryId":"10",
            "autoCheckUpdates":true
        });
        let imported=json!({
            "workspace":"/Volumes/foreign/workspace",
            "endlumePath":"/Applications/ENDLUME.app",
            "youtubeOAuthClientId":"imported-oauth-client",
            "youtubeApiKey":"imported-youtube-key",
            "openaiApiKey":"imported-openai-key",
            "youtubeCategoryId":"24",
            "autoCheckUpdates":false
        });
        let merged=merge_settings(&local,&imported);
        assert_eq!(merged["workspace"],"C:\\\\local\\\\workspace");
        assert_eq!(merged["endlumePath"],"C:\\\\local\\\\ENDLUME.exe");
        assert_eq!(merged["youtubeOAuthClientId"],"local-oauth-client");
        assert_eq!(merged["youtubeApiKey"],"local-youtube-key");
        assert_eq!(merged["openaiApiKey"],"local-openai-key");
        assert_eq!(merged["youtubeCategoryId"],"24");
        assert_eq!(merged["autoCheckUpdates"],false);

        let fresh=merge_settings(&json!({"youtubeApiKey":"","openaiApiKey":"","youtubeOAuthClientId":""}),&imported);
        assert_eq!(fresh["youtubeApiKey"],"");
        assert_eq!(fresh["openaiApiKey"],"");
        assert_eq!(fresh["youtubeOAuthClientId"],"imported-oauth-client");
    }

    #[test]
    fn migration_transaction_backup_id_rejects_path_traversal(){
        assert!(valid_backup_id("20260927-120000-abc"));
        for bad in ["","..",".","../x","..\\x","x/y","x\\y"]{assert!(!valid_backup_id(bad),"{bad}");}
    }

    #[test]
    fn future_schema_is_rejected_before_merge(){
        let payload=sample_payload();
        let enc=encrypt_payload(&payload,"correct horse battery staple").unwrap();
        let mut envelope:BundleEnvelope=serde_json::from_slice(&enc).unwrap();
        envelope.schema_version=BUNDLE_SCHEMA+1;
        let future=serde_json::to_vec(&envelope).unwrap();
        let local=json!({"channels":[{"id":"keep","youtubeChannelId":"TEST_KEEP"}],"settings":{}});
        let before=local.clone();
        assert!(decrypt_payload(&future,"correct horse battery staple").unwrap_err().contains("MIGRATION_SCHEMA_UNSUPPORTED"));
        assert_eq!(local,before);
    }

    #[test]
    fn foreign_missing_paths_require_remap_but_channel_survives(){
        let local=json!({"channels":[{"id":"local","youtubeChannelId":"TEST_LOCAL","name":"Local"}],"settings":{}});
        let imported=json!({"channels":[{"id":"foreign","youtubeChannelId":"TEST_FOREIGN","name":"Foreign","renderFolderPath":"Z:\\\\definitely-missing\\\\Render","projectsFolderPath":"/definitely/missing/Projects"}],"settings":{}});
        let (merged,summary,remaps)=merge_states(&local,&imported);
        assert_eq!(summary.after_channels,2);
        assert_eq!(summary.deleted_channels,0);
        assert_eq!(remaps.len(),2);
        let foreign=merged["channels"].as_array().unwrap().iter().find(|x|x["youtubeChannelId"]=="TEST_FOREIGN").unwrap();
        assert_eq!(foreign["renderFolderPath"],"");
        assert_eq!(foreign["projectsFolderPath"],"");
    }

    #[test]
    fn google_and_youtube_metadata_merge_without_importing_plaintext_secret_fields(){
        let local_y=json!({"profiles":[{"id":"p1","channelTitle":"Local","refreshToken":"local-secret"}]});
        let imported_y=json!({"profiles":[{"id":"p1","channelTitle":"Imported","refreshToken":"must-not-win"},{"id":"p2","channelTitle":"Two","clientSecret":"must-strip"}]});
        let merged_y=merge_youtube_metadata(&local_y,&imported_y);
        let p1=merged_y["profiles"].as_array().unwrap().iter().find(|x|x["id"]=="p1").unwrap();
        let p2=merged_y["profiles"].as_array().unwrap().iter().find(|x|x["id"]=="p2").unwrap();
        assert_eq!(p1["channelTitle"],"Imported");
        assert_eq!(p1["refreshToken"],"local-secret");
        assert_eq!(p2["clientSecret"],"");

        let local_g=json!({"project_id":"local-project","client_id":"local-client","client_secret":"local-secret"});
        let imported_g=json!({"project_id":"import-project","client_id":"import-client","client_secret":"must-not-import","apiKey":"must-not-import"});
        let merged_g=merge_google_config(&local_g,&imported_g);
        assert_eq!(merged_g["project_id"],"local-project");
        assert_eq!(merged_g["client_id"],"local-client");
        assert_eq!(merged_g["client_secret"],"local-secret");
        assert!(merged_g.get("apiKey").is_none());
    }


    #[test]
    fn rollback_removes_files_that_did_not_exist_before_import(){
        let root=std::env::temp_dir().join(format!("vyron-migration-optional-{}",Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let live=root.join("live.json");
        let absent_backup=root.join("backup.json");
        fs::write(&live,b"created-by-failed-import").unwrap();
        restore_optional_file(&live,&absent_backup).unwrap();
        assert!(!live.exists());

        fs::write(&absent_backup,b"original").unwrap();
        fs::write(&live,b"mutated").unwrap();
        restore_optional_file(&live,&absent_backup).unwrap();
        assert_eq!(fs::read(&live).unwrap(),b"original");
        let _=fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_wrapper_restores_partial_mutation(){
        let root=std::env::temp_dir().join(format!("vyron-migration-rollback-{}",Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let live=root.join("state.json");let backup=root.join("state.backup.json");
        fs::write(&live,b"before").unwrap();fs::copy(&live,&backup).unwrap();
        let result:Result<(),String>=run_with_rollback(
            ||{fs::write(&live,b"partial-after").map_err(|e|e.to_string())?;Err("INJECTED_MIGRATION_FAILURE".into())},
            ||{let bytes=fs::read(&backup).map_err(|e|e.to_string())?;write_atomic(&live,&bytes)}
        );
        assert!(result.unwrap_err().contains("INJECTED_MIGRATION_FAILURE"));
        assert_eq!(fs::read(&live).unwrap(),b"before");
        let _=fs::remove_dir_all(root);
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
                {"id":"foreign","youtubeChannelId":"UC1","name":"New","slug":"foreign-slug","youtubeProfileId":"foreign-profile"},
                {"id":"c","youtubeChannelId":"UC3","name":"C"}
            ],
            "jobs":[{"id":"job-import","channelId":"foreign"}],
            "uploadHistory":[{"id":"up-import","jobId":"job-import","channelId":"foreign"}],
            "activityJournal":[{"eventId":"event-import","channelId":"foreign"}],
            "statisticsHistory":{"foreign":[{"snapshotId":"snap-import","channelId":"foreign"}]},
            "settings":{}
        });
        let (a, s, _) = merge_states(&local, &imported);
        assert_eq!(s.local_channels, 2);
        assert_eq!(s.new_channels, 1);
        assert_eq!(s.duplicate_channels, 1);
        assert_eq!(s.after_channels, 3);
        assert_eq!(s.deleted_channels, 0);
        let uc1=a["channels"].as_array().unwrap().iter().find(|x|x["youtubeChannelId"]=="UC1").unwrap();
        assert_eq!(uc1["id"],"a");
        assert_eq!(a["jobs"][0]["channelId"],"a");
        assert_eq!(a["uploadHistory"][0]["channelId"],"a");
        assert_eq!(a["activityJournal"][0]["channelId"],"a");
        assert_eq!(a["statisticsHistory"]["a"][0]["channelId"],"a");
        assert!(a["statisticsHistory"].get("foreign").is_none());
        let (b, s2, _) = merge_states(&a, &imported);
        assert_eq!(s2.after_channels, 3);
        assert_eq!(s2.new_channels, 0);
        assert_eq!(s2.deleted_channels, 0);
        assert_eq!(b["channels"].as_array().unwrap().len(), 3);
    }


    fn fixture_state(kind:&str)->Value{
        let (channels,workspace)=if kind=="macos"{
            (vec![
                json!({"id":"mac-a","youtubeChannelId":"TEST_CH_A","name":"A","renderFolderPath":"/Volumes/VYRON-Test/A","projectsFolderPath":"/Volumes/VYRON-Test/Projects/A"}),
                json!({"id":"mac-b","youtubeChannelId":"TEST_CH_B","name":"B","renderFolderPath":"/Volumes/VYRON-Test/B","projectsFolderPath":"/Volumes/VYRON-Test/Projects/B"}),
                json!({"id":"mac-c","youtubeChannelId":"TEST_CH_C","name":"C","renderFolderPath":"/Volumes/VYRON-Test/C","projectsFolderPath":"/Volumes/VYRON-Test/Projects/C","settingVersion":1}),
            ],"/Users/fixture/VYRON")
        }else{
            (vec![
                json!({"id":"win-c","youtubeChannelId":"TEST_CH_C","name":"C","renderFolderPath":"Z:\\\\VYRON-Test\\\\C","projectsFolderPath":"Z:\\\\VYRON-Test\\\\Projects\\\\C","settingVersion":2}),
                json!({"id":"win-d","youtubeChannelId":"TEST_CH_D","name":"D","renderFolderPath":"Z:\\\\VYRON-Test\\\\D","projectsFolderPath":"Z:\\\\VYRON-Test\\\\Projects\\\\D"}),
                json!({"id":"win-e","youtubeChannelId":"TEST_CH_E","name":"E","renderFolderPath":"Z:\\\\VYRON-Test\\\\E","projectsFolderPath":"Z:\\\\VYRON-Test\\\\Projects\\\\E"}),
            ],"C:\\\\Users\\\\fixture\\\\VYRON")
        };
        json!({
            "version":33,
            "channels":channels,
            "jobs":[{"id":format!("{kind}-job"),"status":"Pending"}],
            "competitors":[],
            "uploadHistory":[],
            "activityJournal":[],
            "statisticsHistory":{},
            "fingerprintCache":{format!("{kind}-fp"):{"size":123}},
            "projectLifecycle":{format!("{kind}-project"):{"status":"READY"}},
            "settings":{"workspace":workspace,"endlumePath":"","youtubeApiKey":"","openaiApiKey":""},
            "logs":[format!("{kind}-fixture")]
        })
    }
    fn fixture_payload(kind:&str,state:Value)->PortablePayload{
        let oauth=json!({
            "schemaVersion":2,
            "profiles":{
                format!("fixture-profile-{kind}"):{
                    "profileUuid":format!("fixture-profile-{kind}"),
                    "expectedChannelId":if kind=="macos"{"TEST_CH_A"}else{"TEST_CH_D"},
                    "refreshToken":format!("fixture-secret-{kind}"),
                    "clientId":format!("fixture-client-{kind}"),
                    "clientSecret":format!("fixture-client-secret-{kind}"),
                    "googleEmail":"",
                    "preferredBrowser":"",
                    "credentialGeneration":1,
                    "connectedAt":"2026-09-27T00:00:00Z",
                    "updatedAt":"2026-09-27T00:00:00Z"
                }
            }
        });
        let youtube=json!({"profiles":[{"id":format!("fixture-profile-{kind}"),"channelId":if kind=="macos"{"TEST_CH_A"}else{"TEST_CH_D"},"channelTitle":format!("Fixture {kind}")}]});
        let google=json!({"project_id":format!("fixture-project-{kind}"),"client_id":format!("fixture-client-{kind}")});
        let integration=json!({"youtubeApiKey":format!("fixture-youtube-api-{kind}")});
        let browser=json!({"quotaLedger":{"fixture":kind},"operationLedger":[]});
        let checksum=payload_hash(&state,&oauth,&youtube,&google,&integration,&browser).unwrap();
        PortablePayload{
            schema_version:BUNDLE_SCHEMA,
            app_version:"3.3.0".into(),
            source_os:kind.into(),
            created_at:"2026-09-27T00:00:00Z".into(),
            bundle_uuid:format!("fixture-bundle-{kind}"),
            state,
            oauth_vault:oauth,
            youtube_metadata:youtube,
            google_config:google,
            integration_secrets:integration,
            browser_state:browser,
            payload_sha256:checksum,
        }
    }
    fn fixture_channel_ids(state:&Value)->Vec<String>{
        let mut ids=state.get("channels").and_then(Value::as_array).into_iter().flatten()
            .filter_map(|x|x.get("youtubeChannelId").and_then(Value::as_str).map(str::to_string))
            .collect::<Vec<_>>();
        ids.sort();ids
    }

    #[test]
    #[ignore]
    fn cross_platform_fixture_export(){
        let kind=std::env::var("VYRON_FIXTURE_KIND").expect("VYRON_FIXTURE_KIND");
        let out=std::env::var("VYRON_FIXTURE_OUT").expect("VYRON_FIXTURE_OUT");
        let pass=std::env::var("VYRON_FIXTURE_PASS").unwrap_or_else(|_|"fixture-passphrase-330".into());
        let payload=fixture_payload(&kind,fixture_state(&kind));
        let bytes=encrypt_payload(&payload,&pass).unwrap();
        let text=String::from_utf8_lossy(&bytes);
        assert!(!text.contains(&format!("fixture-secret-{kind}")));
        assert!(!text.contains(&format!("fixture-client-secret-{kind}")));
        assert!(!text.contains(&format!("fixture-youtube-api-{kind}")));
        write_atomic(Path::new(&out),&bytes).unwrap();
        let round=decrypt_payload(&fs::read(&out).unwrap(),&pass).unwrap();
        assert_eq!(round.source_os,kind);
        assert_eq!(fixture_channel_ids(&round.state).len(),3);
    }

    #[test]
    #[ignore]
    fn cross_platform_fixture_import_merge_and_reexport(){
        let local_kind=std::env::var("VYRON_FIXTURE_KIND").expect("VYRON_FIXTURE_KIND");
        let input=std::env::var("VYRON_FIXTURE_IN").expect("VYRON_FIXTURE_IN");
        let output=std::env::var("VYRON_FIXTURE_OUT").ok();
        let pass=std::env::var("VYRON_FIXTURE_PASS").unwrap_or_else(|_|"fixture-passphrase-330".into());
        let bytes=fs::read(&input).unwrap();
        assert!(decrypt_payload(&bytes,"definitely-wrong-passphrase").is_err());
        let mut corrupt=bytes.clone();let n=corrupt.len();corrupt[n-5]^=1;
        assert!(decrypt_payload(&corrupt,&pass).is_err());
        let payload=decrypt_payload(&bytes,&pass).unwrap();
        assert_ne!(payload.source_os,local_kind,"fixture must cross an OS boundary");

        let local=fixture_state(&local_kind);
        let (once,s1,remaps1)=merge_states(&local,&payload.state);
        assert_eq!(s1.after_channels,5);
        assert_eq!(s1.deleted_channels,0);
        assert_eq!(fixture_channel_ids(&once),vec!["TEST_CH_A","TEST_CH_B","TEST_CH_C","TEST_CH_D","TEST_CH_E"]);
        assert!(remaps1.len()>=2,"foreign filesystem paths must require remap");

        let mut repeated=once.clone();
        for _ in 0..2{
            let (next,s,_) = merge_states(&repeated,&payload.state);
            assert_eq!(s.after_channels,5);
            assert_eq!(s.new_channels,0);
            assert_eq!(s.deleted_channels,0);
            repeated=next;
        }
        assert_eq!(fixture_channel_ids(&repeated),fixture_channel_ids(&once));
        assert!(repeated.get("fingerprintCache").and_then(Value::as_object).map(|x|x.len()).unwrap_or(0)>=2);
        assert!(repeated.get("projectLifecycle").and_then(Value::as_object).map(|x|x.len()).unwrap_or(0)>=2);

        if let Some(out)=output{
            let next=fixture_payload(&local_kind,repeated);
            let encoded=encrypt_payload(&next,&pass).unwrap();
            write_atomic(Path::new(&out),&encoded).unwrap();
        }
    }


    #[test]
    fn imported_new_channel_id_collision_is_remapped_and_references_follow(){
        let local=json!({
            "channels":[{"id":"same-id","youtubeChannelId":"TEST_LOCAL","name":"Local"}],
            "jobs":[],"uploadHistory":[],"activityJournal":[],"statisticsHistory":{},"settings":{}
        });
        let imported=json!({
            "channels":[{"id":"same-id","youtubeChannelId":"TEST_NEW","name":"Imported"}],
            "jobs":[{"id":"j1","channelId":"same-id"}],
            "uploadHistory":[{"id":"u1","channelId":"same-id"}],
            "activityJournal":[{"eventId":"e1","channelId":"same-id"}],
            "statisticsHistory":{"same-id":[{"snapshotId":"s1","channelId":"same-id"}]},
            "settings":{}
        });
        let (first,s1,_)=merge_states(&local,&imported);
        assert_eq!(s1.after_channels,2);
        let imported_channel=first["channels"].as_array().unwrap().iter().find(|x|x["youtubeChannelId"]=="TEST_NEW").unwrap();
        let new_id=imported_channel["id"].as_str().unwrap();
        assert_ne!(new_id,"same-id");
        assert!(new_id.starts_with("migrated-"));
        assert_eq!(first["jobs"][0]["channelId"],new_id);
        assert_eq!(first["uploadHistory"][0]["channelId"],new_id);
        assert_eq!(first["activityJournal"][0]["channelId"],new_id);
        assert_eq!(first["statisticsHistory"][new_id][0]["channelId"],new_id);
        let (second,s2,_)=merge_states(&first,&imported);
        assert_eq!(s2.after_channels,2);
        assert_eq!(s2.new_channels,0);
        let again=second["channels"].as_array().unwrap().iter().find(|x|x["youtubeChannelId"]=="TEST_NEW").unwrap()["id"].as_str().unwrap();
        assert_eq!(again,new_id);
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
