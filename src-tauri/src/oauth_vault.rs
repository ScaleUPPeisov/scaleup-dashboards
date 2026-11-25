use std::{
 collections::HashMap,
 fs::{self,File},
 io::Write,
 path::{Path,PathBuf},
 sync::{Mutex,OnceLock},
};
use base64::{engine::general_purpose::STANDARD as B64,Engine as _};
use chacha20poly1305::{aead::{Aead,KeyInit,Payload},Key,XChaCha20Poly1305,XNonce};
use rand_core::{OsRng,RngCore};
use serde::{Deserialize,Serialize};
use tauri::AppHandle;

use crate::security;

const SCHEMA:u32=1;
const AAD:&[u8]=b"VYRON-OAUTH-VAULT-v1";
const CLIENT_AAD:&[u8]=b"VYRON-OAUTH-CLIENT-v1";

#[derive(Debug,Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct VaultProfile{
 pub profile_uuid:String,
 #[serde(default)] pub expected_channel_id:String,
 #[serde(default)] pub refresh_token:String,
 #[serde(default)] pub client_secret:String,
 #[serde(default)] pub google_email:String,
 #[serde(default)] pub preferred_browser:String,
 #[serde(default)] pub updated_at:String,
 #[serde(default)] pub credential_generation:u32,
 #[serde(default)] pub connected_at:String,
}
#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct PlainVault{
 schema_version:u32,
 #[serde(default)] global_client_id:String,
 #[serde(default)] global_client_secret:String,
 #[serde(default)] profiles:HashMap<String,VaultProfile>,
}
impl Default for PlainVault{
 fn default()->Self{Self{
  schema_version:SCHEMA,
  global_client_id:String::new(),
  global_client_secret:String::new(),
  profiles:HashMap::new(),
 }}
}
#[derive(Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Envelope{schema_version:u32,nonce:String,ciphertext:String}

#[derive(Debug,Clone)]
struct LocalPaths{
 root:PathBuf,
 auth:PathBuf,
 state:PathBuf,
 backups:PathBuf,
 logs:PathBuf,
 auth_backup:PathBuf,
 doc_vault:PathBuf,
 doc_key:PathBuf,
 client_snapshot:PathBuf,
 app_vault:PathBuf,
 app_key:PathBuf,
 legacy_backup:PathBuf,
}

static MASTER_CACHE:OnceLock<Mutex<Option<[u8;32]>>>=OnceLock::new();
static VAULT_CACHE:OnceLock<Mutex<Option<PlainVault>>>=OnceLock::new();
fn master_cache()->&'static Mutex<Option<[u8;32]>>{MASTER_CACHE.get_or_init(||Mutex::new(None))}
fn vault_cache()->&'static Mutex<Option<PlainVault>>{VAULT_CACHE.get_or_init(||Mutex::new(None))}

fn private_file(path:&Path){
 #[cfg(unix)]{
  use std::os::unix::fs::PermissionsExt;
  let _=fs::set_permissions(path,fs::Permissions::from_mode(0o600));
 }
}
fn private_dir(path:&Path){
 #[cfg(unix)]{
  use std::os::unix::fs::PermissionsExt;
  let _=fs::set_permissions(path,fs::Permissions::from_mode(0o700));
 }
}
fn create_private_dir(path:&Path)->Result<(),String>{
 fs::create_dir_all(path).map_err(|e|format!("OAUTH_LOCAL_MKDIR_FAILED: {}: {e}",path.display()))?;
 private_dir(path);
 Ok(())
}
fn local_paths(app:&AppHandle)->Result<LocalPaths,String>{
 let root=crate::apex_paths::documents_root(app)?;
 let auth=crate::apex_paths_fs::private_child_dir(&root,"Auth")?;
 let state=crate::apex_paths_fs::private_child_dir(&root,"State")?;
 let backups=crate::apex_paths_fs::private_child_dir(&root,"Backups")?;
 let logs=crate::apex_paths_fs::private_child_dir(&root,"Logs")?;
 let auth_backup=crate::apex_paths_fs::private_child_dir(&auth,"backup")?;
 let app_dir=crate::apex_paths::data_dir(app)?;
 create_private_dir(&app_dir)?;
 Ok(LocalPaths{
  root,
  auth:auth.clone(),
  state,
  backups:backups.clone(),
  logs,
  auth_backup,
  doc_vault:auth.join("oauth-vault.enc"),
  doc_key:auth.join("vault.key"),
  client_snapshot:auth.join("oauth-client.json.enc"),
  app_vault:app_dir.join("oauth-vault.enc"),
  app_key:app_dir.join("oauth-vault.key"),
  legacy_backup:backups.join("oauth-vault-keychain-legacy.enc"),
 })
}
pub fn ensure_local_storage(app:&AppHandle)->Result<(),String>{let _=local_paths(app)?;Ok(())}

fn decode_key(encoded:&str)->Result<[u8;32],String>{
 let bytes=B64.decode(encoded.trim()).map_err(|_|"OAUTH_VAULT_LOCAL_KEY_INVALID".to_string())?;
 if bytes.len()!=32{return Err("OAUTH_VAULT_LOCAL_KEY_INVALID_LENGTH".into())}
 let mut out=[0u8;32];out.copy_from_slice(&bytes);Ok(out)
}
fn read_key_file(path:&Path)->Result<Option<[u8;32]>,String>{
 if !path.exists(){return Ok(None)}
 let raw=fs::read_to_string(path).map_err(|e|format!("OAUTH_VAULT_LOCAL_KEY_READ_FAILED: {}: {e}",path.display()))?;
 decode_key(&raw).map(Some)
}
fn write_private_atomic(path:&Path,bytes:&[u8])->Result<(),String>{
 if let Some(parent)=path.parent(){create_private_dir(parent)?;}
 let tmp=path.with_extension("tmp");
 {
  let mut file=File::create(&tmp).map_err(|e|format!("OAUTH_LOCAL_TEMP_CREATE_FAILED: {}: {e}",tmp.display()))?;
  file.write_all(bytes).map_err(|e|format!("OAUTH_LOCAL_TEMP_WRITE_FAILED: {}: {e}",tmp.display()))?;
  file.sync_all().map_err(|e|format!("OAUTH_LOCAL_TEMP_SYNC_FAILED: {}: {e}",tmp.display()))?;
 }
 private_file(&tmp);
 if path.exists(){
  #[cfg(target_os="windows")]{
   fs::remove_file(path).map_err(|e|format!("OAUTH_LOCAL_REPLACE_REMOVE_FAILED: {}: {e}",path.display()))?;
  }
 }
 fs::rename(&tmp,path).map_err(|e|format!("OAUTH_LOCAL_ATOMIC_RENAME_FAILED: {}: {e}",path.display()))?;
 private_file(path);
 Ok(())
}
fn cache_key(key:[u8;32]){if let Ok(mut cache)=master_cache().lock(){*cache=Some(key)}}
fn cache_vault(vault:&PlainVault){if let Ok(mut cache)=vault_cache().lock(){*cache=Some(vault.clone())}}
fn clear_caches(){
 if let Ok(mut cache)=master_cache().lock(){*cache=None}
 if let Ok(mut cache)=vault_cache().lock(){*cache=None}
}

fn local_key(app:&AppHandle,create:bool)->Result<[u8;32],String>{
 if let Ok(cache)=master_cache().lock(){if let Some(key)=*cache{return Ok(key)}}
 let p=local_paths(app)?;
 #[cfg(target_os="windows")]
 {
  const WINDOWS_VAULT_KEY_ACCOUNT:&str="oauth.vault.master_key";
  if let Some(encoded)=security::canonical_get_secret_cached(WINDOWS_VAULT_KEY_ACCOUNT)?{
   let key=decode_key(&encoded)?;cache_key(key);return Ok(key)
  }
  if let Some(key)=read_key_file(&p.doc_key)?.or(read_key_file(&p.app_key)?){
   let encoded=B64.encode(key);
   security::canonical_set_secret(WINDOWS_VAULT_KEY_ACCOUNT,&encoded)?;
   cache_key(key);return Ok(key)
  }
  if !create{return Err("OAUTH_VAULT_LOCAL_KEY_MISSING".into())}
  let mut key=[0u8;32];OsRng.fill_bytes(&mut key);
  let encoded=B64.encode(key);
  security::canonical_set_secret(WINDOWS_VAULT_KEY_ACCOUNT,&encoded)?;
  cache_key(key);return Ok(key)
 }
 if let Some(key)=read_key_file(&p.doc_key)?{
  if !p.app_key.exists(){let _=write_private_atomic(&p.app_key,B64.encode(key).as_bytes());}
  cache_key(key);return Ok(key)
 }
 if let Some(key)=read_key_file(&p.app_key)?{
  write_private_atomic(&p.doc_key,B64.encode(key).as_bytes())?;
  cache_key(key);return Ok(key)
 }
 if !create{return Err("OAUTH_VAULT_LOCAL_KEY_MISSING".into())}
 let mut key=[0u8;32];OsRng.fill_bytes(&mut key);
 let encoded=B64.encode(key);
 write_private_atomic(&p.doc_key,encoded.as_bytes())?;
 write_private_atomic(&p.app_key,encoded.as_bytes())?;
 // Normal local-key creation performs ZERO Keychain operations. The old Keychain
 // master key is consulted only by the explicit legacy migration/recovery path.
 cache_key(key);
 Ok(key)
}

fn decrypt_envelope(bytes:&[u8],key:&[u8;32],aad:&[u8])->Result<Vec<u8>,String>{
 let envelope:Envelope=serde_json::from_slice(bytes).map_err(|e|format!("OAUTH_VAULT_ENVELOPE_INVALID: {e}"))?;
 if envelope.schema_version!=SCHEMA{return Err(format!("OAUTH_VAULT_SCHEMA_UNSUPPORTED: {}",envelope.schema_version))}
 let nonce=B64.decode(envelope.nonce).map_err(|_|"OAUTH_VAULT_NONCE_INVALID".to_string())?;
 if nonce.len()!=24{return Err("OAUTH_VAULT_NONCE_INVALID_LENGTH".into())}
 let ciphertext=B64.decode(envelope.ciphertext).map_err(|_|"OAUTH_VAULT_CIPHERTEXT_INVALID".to_string())?;
 XChaCha20Poly1305::new(Key::from_slice(key))
  .decrypt(XNonce::from_slice(&nonce),Payload{msg:&ciphertext,aad})
  .map_err(|_|"OAUTH_VAULT_AUTHENTICATION_FAILED".to_string())
}
fn encrypt_bytes(plain:&[u8],key:&[u8;32],aad:&[u8])->Result<Vec<u8>,String>{
 let mut nonce=[0u8;24];OsRng.fill_bytes(&mut nonce);
 let encrypted=XChaCha20Poly1305::new(Key::from_slice(key))
  .encrypt(XNonce::from_slice(&nonce),Payload{msg:plain,aad})
  .map_err(|_|"OAUTH_VAULT_ENCRYPT_FAILED".to_string())?;
 serde_json::to_vec(&Envelope{schema_version:SCHEMA,nonce:B64.encode(nonce),ciphertext:B64.encode(encrypted)})
  .map_err(|e|format!("OAUTH_VAULT_ENVELOPE_SERIALIZE_FAILED: {e}"))
}
fn decode_vault(bytes:&[u8],key:&[u8;32])->Result<PlainVault,String>{
 let plain=decrypt_envelope(bytes,key,AAD)?;
 let vault:PlainVault=serde_json::from_slice(&plain).map_err(|e|format!("OAUTH_VAULT_CONTENT_INVALID: {e}"))?;
 if vault.schema_version!=SCHEMA{return Err("OAUTH_VAULT_CONTENT_SCHEMA_INVALID".into())}
 Ok(vault)
}

/// Secret-free, offline assessment only. This does not import, write files,
/// access Keychain, validate Google tokens, or authorize a second Publisher.
#[derive(Debug,Clone,PartialEq,Eq)]
pub(crate) struct OAuthImportAssessment {
 pub channels:usize,
 pub metadata_profiles:usize,
 pub vault_profiles:usize,
 pub bound_channels:usize,
 pub unlinked_channels:usize,
 pub missing_profiles:usize,
 pub missing_refresh_tokens:usize,
 pub missing_local_client_configuration:usize,
 pub identity_conflicts:usize,
 pub unverified_identities:usize,
 pub unreferenced_profiles:usize,
 pub unreferenced_vault_profiles:usize,
 pub google_validation_performed:bool,
 pub keychain_validation_performed:bool,
}

/// Validate an authenticated backup held entirely in memory. The caller must
/// separately verify snapshot provenance and establish a transactional write
/// boundary before an import can ever be offered.
pub(crate) fn assess_oauth_import(
 state_json:&[u8], metadata_json:&[u8], vault_envelope:&[u8], encoded_key:&str,
)->Result<OAuthImportAssessment,&'static str>{
 use std::collections::{HashMap,HashSet};
 const MAX_STATE:usize=128*1024*1024;
 const MAX_AUTH:usize=32*1024*1024;
 if state_json.len()>MAX_STATE||metadata_json.len()>MAX_AUTH||vault_envelope.len()>MAX_AUTH||encoded_key.len()>4096{return Err("OAUTH_IMPORT_INPUT_TOO_LARGE")}
 let key=decode_key(encoded_key).map_err(|_|"OAUTH_IMPORT_KEY_INVALID")?;
 let vault=decode_vault(vault_envelope,&key).map_err(|_|"OAUTH_IMPORT_VAULT_INVALID")?;
 let state:serde_json::Value=serde_json::from_slice(state_json).map_err(|_|"OAUTH_IMPORT_STATE_INVALID")?;
 let metadata:serde_json::Value=serde_json::from_slice(metadata_json).map_err(|_|"OAUTH_IMPORT_METADATA_INVALID")?;
 let channels=state.get("channels").and_then(|x|x.as_array()).ok_or("OAUTH_IMPORT_STATE_INVALID")?;
 let profiles=metadata.get("profiles").and_then(|x|x.as_array()).ok_or("OAUTH_IMPORT_METADATA_INVALID")?;
 let mut by_profile=HashMap::new();
 for profile in profiles{
  let id=profile.get("id").and_then(|x|x.as_str()).map(str::trim).filter(|x|!x.is_empty()).ok_or("OAUTH_IMPORT_METADATA_INVALID")?;
  let channel=profile.get("channel_id").or_else(||profile.get("channelId")).and_then(|x|x.as_str()).map(str::trim).filter(|x|!x.is_empty());
  let client=profile.get("client_id").or_else(||profile.get("clientId")).and_then(|x|x.as_str()).map(str::trim).filter(|x|!x.is_empty());
  if by_profile.insert(id,(channel,client)).is_some(){return Err("OAUTH_IMPORT_DUPLICATE_PROFILE")}
 }
 // The map key and profile UUID are independent pieces of the authenticated
 // schema; an inconsistency must not be silently accepted.
 if vault.profiles.iter().any(|(id,p)|id.trim().is_empty()||p.profile_uuid.trim()!=id){return Err("OAUTH_IMPORT_VAULT_IDENTITY_INVALID")}
 let mut referenced=HashSet::new();
 let mut channel_ids=HashSet::new();
 let mut report=OAuthImportAssessment{channels:channels.len(),metadata_profiles:profiles.len(),vault_profiles:vault.profiles.len(),bound_channels:0,unlinked_channels:0,missing_profiles:0,missing_refresh_tokens:0,missing_local_client_configuration:0,identity_conflicts:0,unverified_identities:0,unreferenced_profiles:0,unreferenced_vault_profiles:0,google_validation_performed:false,keychain_validation_performed:false};
 for channel in channels{
  let id=channel.get("id").and_then(|x|x.as_str()).map(str::trim).filter(|x|!x.is_empty()).ok_or("OAUTH_IMPORT_STATE_INVALID")?;
  if !channel_ids.insert(id){return Err("OAUTH_IMPORT_DUPLICATE_CHANNEL")}
  let profile=channel.get("youtubeProfileId").and_then(|x|x.as_str()).map(str::trim).filter(|x|!x.is_empty());
  let channel_id=channel.get("youtubeChannelId").and_then(|x|x.as_str()).map(str::trim).filter(|x|!x.is_empty());
  let Some(profile_id)=profile else{report.unlinked_channels+=1;continue};
  if !referenced.insert(profile_id){report.identity_conflicts+=1;continue}
  let Some((metadata_channel,metadata_client))=by_profile.get(profile_id).copied() else{report.missing_profiles+=1;continue};
  let Some(credential)=vault.profiles.get(profile_id) else{report.missing_refresh_tokens+=1;continue};
  let client_ready=metadata_client.is_some_and(|client|!credential.client_secret.trim().is_empty()||(!vault.global_client_secret.trim().is_empty()&&vault.global_client_id.trim()==client));
  if !client_ready{report.missing_local_client_configuration+=1}
  if credential.refresh_token.trim().is_empty(){report.missing_refresh_tokens+=1;continue}
  let expected=credential.expected_channel_id.trim();
  let vault_channel=(!expected.is_empty()).then_some(expected);
  let known=[channel_id,metadata_channel,vault_channel];
  if known.iter().flatten().any(|id|known.iter().flatten().any(|other|id!=other)){
   report.identity_conflicts+=1;continue
  }
  match (channel_id,metadata_channel,vault_channel){
   (Some(a),Some(b),Some(c)) if a==b&&b==c=>report.bound_channels+=1,
   _=>report.unverified_identities+=1,
  }
 }
 report.unreferenced_profiles=by_profile.keys().filter(|id|!referenced.contains(*id)).count();
 report.unreferenced_vault_profiles=vault.profiles.keys().filter(|id|!referenced.contains(id.as_str())).count();
 Ok(report)
}
fn decode_keychain_master(encoded:&str)->Result<[u8;32],String>{
 let bytes=B64.decode(encoded.trim()).map_err(|_|"OAUTH_VAULT_LEGACY_MASTER_KEY_INVALID".to_string())?;
 if bytes.len()!=32{return Err("OAUTH_VAULT_LEGACY_MASTER_KEY_INVALID_LENGTH".into())}
 let mut out=[0u8;32];out.copy_from_slice(&bytes);Ok(out)
}
fn preserve_legacy_vault_once(p:&LocalPaths)->Result<(),String>{
 if p.legacy_backup.exists()||!p.app_vault.exists(){return Ok(())}
 fs::copy(&p.app_vault,&p.legacy_backup).map_err(|e|format!("OAUTH_VAULT_LEGACY_BACKUP_FAILED: {e}"))?;
 private_file(&p.legacy_backup);
 Ok(())
}
fn rotate_backups(p:&LocalPaths){
 let b1=p.backups.join("oauth-vault-1.enc");
 let b2=p.backups.join("oauth-vault-2.enc");
 let b3=p.backups.join("oauth-vault-3.enc");
 if b2.exists(){let _=fs::copy(&b2,&b3);private_file(&b3);}
 if b1.exists(){let _=fs::copy(&b1,&b2);private_file(&b2);}
 if p.doc_vault.exists(){let _=fs::copy(&p.doc_vault,&b1);private_file(&b1);}
}
fn verify_encrypted_vault(bytes:&[u8],key:&[u8;32],expected:&PlainVault)->Result<(),String>{
 let got=decode_vault(bytes,key)?;
 if got.global_client_id!=expected.global_client_id||got.profiles.len()!=expected.profiles.len(){
  return Err("OAUTH_VAULT_TRANSACTION_VERIFY_FAILED".into())
 }
 Ok(())
}
fn write_client_snapshot(p:&LocalPaths,vault:&PlainVault,key:&[u8;32])->Result<(),String>{
 let snapshot=serde_json::to_vec(&serde_json::json!({
  "schemaVersion":SCHEMA,
  "globalClientId":vault.global_client_id,
  "globalClientSecret":vault.global_client_secret,
 })).map_err(|e|format!("OAUTH_CLIENT_SNAPSHOT_SERIALIZE_FAILED: {e}"))?;
 let enc=encrypt_bytes(&snapshot,key,CLIENT_AAD)?;
 write_private_atomic(&p.client_snapshot,&enc)
}
fn write_profile_snapshot(p:&LocalPaths,vault:&PlainVault)->Result<(),String>{
 let rows:Vec<serde_json::Value>=vault.profiles.values().map(|x|serde_json::json!({
  "profileUuid":x.profile_uuid,
  "expectedChannelId":x.expected_channel_id,
  "googleEmail":x.google_email,
  "preferredBrowser":x.preferred_browser,
  "updatedAt":x.updated_at,
  "connectedAt":x.connected_at,
  "credentialGeneration":x.credential_generation
 })).collect();
 let bytes=serde_json::to_vec_pretty(&rows).map_err(|e|format!("OAUTH_PROFILE_SNAPSHOT_SERIALIZE_FAILED: {e}"))?;
 write_private_atomic(&p.state.join("profiles.json"),&bytes)
}
fn write(app:&AppHandle,vault:&PlainVault)->Result<(),String>{
 let p=local_paths(app)?;
 let key=local_key(app,true)?;
 preserve_legacy_vault_once(&p)?;
 let plain=serde_json::to_vec(vault).map_err(|e|format!("OAUTH_VAULT_SERIALIZE_FAILED: {e}"))?;
 let envelope=encrypt_bytes(&plain,&key,AAD)?;
 verify_encrypted_vault(&envelope,&key,vault)?;
 rotate_backups(&p);
 write_private_atomic(&p.doc_vault,&envelope)?;
 let readback=fs::read(&p.doc_vault).map_err(|e|format!("OAUTH_VAULT_READBACK_FAILED: {e}"))?;
 verify_encrypted_vault(&readback,&key,vault)?;
 // Application Support is a working mirror, never the only copy.
 write_private_atomic(&p.app_vault,&envelope)?;
 write_client_snapshot(&p,vault,&key)?;
 write_profile_snapshot(&p,vault)?;
 cache_vault(vault);
 Ok(())
}

fn read_legacy_with_keychain(app:&AppHandle,interactive:bool,p:&LocalPaths)->Result<PlainVault,String>{
 let source=if p.legacy_backup.exists(){&p.legacy_backup}else{&p.app_vault};
 if !source.exists(){return Err("OAUTH_VAULT_LEGACY_SOURCE_MISSING".into())}
 let encoded=security::oauth_vault_master_key_get(interactive)
  .map_err(|e|format!("OAUTH_VAULT_LEGACY_KEYCHAIN_MIGRATION_REQUIRED: {e}"))?
  .filter(|x|!x.trim().is_empty())
  .ok_or_else(||"OAUTH_VAULT_LEGACY_MASTER_KEY_MISSING".to_string())?;
 let old_key=decode_keychain_master(&encoded)?;
 let bytes=fs::read(source).map_err(|e|format!("OAUTH_VAULT_LEGACY_READ_FAILED: {e}"))?;
 decode_vault(&bytes,&old_key)
}
fn migrate_legacy_vault(app:&AppHandle,vault:&PlainVault,p:&LocalPaths)->Result<(),String>{
 preserve_legacy_vault_once(p)?;
 clear_caches();
 let _=local_key(app,true)?;
 write(app,vault)?;
 clear_caches();
 let check=read_local(app)?;
 if check.global_client_id!=vault.global_client_id||check.profiles.len()!=vault.profiles.len(){
  return Err("OAUTH_VAULT_LEGACY_MIGRATION_VERIFY_FAILED".into())
 }
 Ok(())
}
fn read_local(app:&AppHandle)->Result<PlainVault,String>{
 let p=local_paths(app)?;
 let key=local_key(app,false)?;
 if p.doc_vault.exists(){
  let bytes=fs::read(&p.doc_vault).map_err(|e|format!("OAUTH_VAULT_READ_FAILED: {e}"))?;
  return decode_vault(&bytes,&key)
 }
 if p.app_vault.exists(){
  let bytes=fs::read(&p.app_vault).map_err(|e|format!("OAUTH_VAULT_READ_FAILED: {e}"))?;
  let vault=decode_vault(&bytes,&key)?;
  write_private_atomic(&p.doc_vault,&bytes)?;
  return Ok(vault)
 }
 Ok(PlainVault::default())
}
fn migration_pending(error:&str)->bool{
 error.contains("OAUTH_VAULT_LEGACY_KEYCHAIN_MIGRATION_REQUIRED")
  ||error.contains("OAUTH_VAULT_LEGACY_MASTER_KEY_MISSING")
  ||error.contains("OAUTH_VAULT_LOCAL_KEY_MISSING")
}
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
enum StartupKeyPlan{LocalPersistent,LegacyKeychainMigration,Empty}
fn startup_key_plan(local_key_present:bool,legacy_vault_present:bool)->StartupKeyPlan{
 if local_key_present{StartupKeyPlan::LocalPersistent}
 else if legacy_vault_present{StartupKeyPlan::LegacyKeychainMigration}
 else{StartupKeyPlan::Empty}
}
fn read(app:&AppHandle,interactive:bool)->Result<PlainVault,String>{
 if let Ok(cache)=vault_cache().lock(){if let Some(v)=cache.as_ref(){return Ok(v.clone())}}
 let p=local_paths(app)?;
 match startup_key_plan(p.doc_key.exists()||p.app_key.exists(),p.app_vault.exists()||p.legacy_backup.exists()){
  StartupKeyPlan::LocalPersistent=>{
   let vault=read_local(app)?;
   cache_vault(&vault);Ok(vault)
  },
  StartupKeyPlan::LegacyKeychainMigration=>{
   match read_legacy_with_keychain(app,interactive,&p){
    Ok(vault)=>{migrate_legacy_vault(app,&vault,&p)?;cache_vault(&vault);Ok(vault)},
    Err(e)=>Err(e),
   }
  },
  StartupKeyPlan::Empty=>Ok(PlainVault::default()),
 }
}
fn read_for_lookup(app:&AppHandle)->Result<Option<PlainVault>,String>{
 match read(app,false){
  Ok(v)=>Ok(Some(v)),
  Err(e) if migration_pending(&e)=>Ok(None),
  Err(e)=>Err(e),
 }
}
fn read_for_update(app:&AppHandle)->Result<PlainVault,String>{
 match read(app,false){
  Ok(v)=>Ok(v),
  Err(e) if migration_pending(&e)=>{
   // Keep the unreadable build-270 vault intact as a legacy backup and rebuild the
   // new local vault from still-readable canonical/legacy fallback credentials.
   let p=local_paths(app)?;
   preserve_legacy_vault_once(&p)?;
   Ok(PlainVault::default())
  },
  Err(e)=>Err(e),
 }
}

pub fn profile_refresh(app:&AppHandle,profile_id:&str)->Result<Option<String>,String>{
 let Some(v)=read_for_lookup(app)? else{return Ok(None)};
 Ok(v.profiles.get(profile_id).map(|x|x.refresh_token.clone()).filter(|x|!x.trim().is_empty()))
}
pub fn profile_client_secret(app:&AppHandle,profile_id:&str)->Result<Option<String>,String>{
 let Some(v)=read_for_lookup(app)? else{return Ok(None)};
 Ok(v.profiles.get(profile_id).map(|x|x.client_secret.clone()).filter(|x|!x.trim().is_empty()))
}
pub fn global_client_secret(app:&AppHandle,client_id:&str)->Result<Option<String>,String>{
 let Some(v)=read_for_lookup(app)? else{return Ok(None)};
 if !client_id.trim().is_empty()&&v.global_client_id.trim()!=client_id.trim(){return Ok(None)}
 Ok((!v.global_client_secret.trim().is_empty()).then_some(v.global_client_secret))
}
pub fn upsert_profile(
 app:&AppHandle,
 profile_id:&str,
 channel_id:&str,
 refresh_token:Option<&str>,
 client_secret:Option<&str>,
 email:Option<&str>,
 browser:Option<&str>,
)->Result<(),String>{
 let mut v=read_for_update(app)?;
 let now=chrono::Utc::now().to_rfc3339();
 let row=v.profiles.entry(profile_id.to_string()).or_insert_with(||VaultProfile{
  profile_uuid:profile_id.to_string(),
  connected_at:now.clone(),
  ..Default::default()
 });
 if !channel_id.trim().is_empty(){row.expected_channel_id=channel_id.to_string()}
 if let Some(x)=refresh_token.filter(|x|!x.trim().is_empty()){row.refresh_token=x.to_string()}
 if let Some(x)=client_secret.filter(|x|!x.trim().is_empty()){row.client_secret=x.to_string()}
 if let Some(x)=email{row.google_email=x.to_string()}
 if let Some(x)=browser{row.preferred_browser=x.to_string()}
 row.updated_at=now;
 write(app,&v)
}
pub fn set_global_client(app:&AppHandle,client_id:&str,client_secret:&str)->Result<(),String>{
 let mut v=read_for_update(app)?;
 v.global_client_id=client_id.to_string();
 v.global_client_secret=client_secret.to_string();
 write(app,&v)
}
pub fn remove_profile(app:&AppHandle,profile_id:&str)->Result<(),String>{
 let mut v=read_for_update(app)?;v.profiles.remove(profile_id);write(app,&v)
}
pub fn clear_profile_refresh(app:&AppHandle,profile_id:&str)->Result<(),String>{
 let mut v=read_for_update(app)?;
 if let Some(row)=v.profiles.get_mut(profile_id){row.refresh_token.clear();row.updated_at=chrono::Utc::now().to_rfc3339();}
 write(app,&v)
}

pub fn recover_master_key_interactive(app:&AppHandle)->Result<(),String>{
 let p=local_paths(app)?;
 // Healthy local storage means Keychain is irrelevant; recovery is already complete.
 if (p.doc_key.exists()||p.app_key.exists())&&read_local(app).is_ok(){return Ok(())}
 let legacy=read_legacy_with_keychain(app,true,&p)?;
 let current=read_local(app).unwrap_or_default();
 let mut merged=legacy;
 if !current.global_client_id.trim().is_empty(){merged.global_client_id=current.global_client_id}
 if !current.global_client_secret.trim().is_empty(){merged.global_client_secret=current.global_client_secret}
 for (id,row) in current.profiles{merged.profiles.insert(id,row);}
 migrate_legacy_vault(app,&merged,&p)
}

pub fn local_storage_status(app:&AppHandle)->Result<serde_json::Value,String>{
 let p=local_paths(app)?;
 let local_key=p.doc_key.exists()||p.app_key.exists();
 let local_vault=p.doc_vault.exists();
 let readable=if local_key&&local_vault{read_local(app).is_ok()}else{false};
 let backup_count=[1,2,3].iter().filter(|n|p.backups.join(format!("oauth-vault-{n}.enc")).exists()).count();
 Ok(serde_json::json!({
  "root":p.root.display().to_string(),
  "authPath":p.auth.display().to_string(),
  "statePath":p.state.display().to_string(),
  "logsPath":p.logs.display().to_string(),
  "authBackupPath":p.auth_backup.display().to_string(),
  "vaultPath":p.doc_vault.display().to_string(),
  "keyPath":p.doc_key.display().to_string(),
  "localKeyPresent":local_key,
  "localVaultPresent":local_vault,
  "localVaultReadable":readable,
  "legacyVaultPresent":p.legacy_backup.exists(),
  "backupCount":backup_count,
  "keychainRequiredForNormalStartup":false,
  "secretValuesIncluded":false
 }))
}


pub fn export_portable_snapshot(app:&AppHandle)->Result<serde_json::Value,String>{
 let vault=read(app,false)?;
 let profiles=vault.profiles.iter().map(|(id,row)|(id.clone(),serde_json::to_value(row).unwrap_or(serde_json::Value::Null))).collect::<serde_json::Map<String,serde_json::Value>>();
 Ok(serde_json::json!({
  "schemaVersion":SCHEMA,
  "globalClientId":vault.global_client_id,
  "globalClientSecret":vault.global_client_secret,
  "profiles":profiles
 }))
}

fn portable_profile_map(value:&serde_json::Value)->Result<HashMap<String,VaultProfile>,String>{
 let mut out=HashMap::new();
 let rows=value.get("profiles").and_then(serde_json::Value::as_object).ok_or_else(||"MIGRATION_OAUTH_PROFILES_INVALID".to_string())?;
 for (id,row) in rows{
  let mut profile:VaultProfile=serde_json::from_value(row.clone()).map_err(|e|format!("MIGRATION_OAUTH_PROFILE_INVALID: {id}: {e}"))?;
  if profile.profile_uuid.trim().is_empty(){profile.profile_uuid=id.clone();}
  if profile.profile_uuid!=*id{return Err(format!("MIGRATION_OAUTH_PROFILE_ID_MISMATCH: key={id} profile={}",profile.profile_uuid))}
  out.insert(id.clone(),profile);
 }
 Ok(out)
}

pub fn portable_merge_plan(app:&AppHandle,value:&serde_json::Value)->Result<serde_json::Value,String>{
 let imported=portable_profile_map(value)?;
 let local=read_for_lookup(app)?.unwrap_or_default();
 let existing=imported.keys().filter(|id|local.profiles.contains_key(*id)).count();
 Ok(serde_json::json!({
  "importedProfiles":imported.len(),
  "existingProfiles":existing,
  "newProfiles":imported.len().saturating_sub(existing),
  "willDelete":0
 }))
}

fn choose_newer<'a>(local:&'a VaultProfile,imported:&'a VaultProfile)->&'a VaultProfile{
 let l=&local.updated_at;let i=&imported.updated_at;
 if !i.trim().is_empty()&&(l.trim().is_empty()||i>l){imported}else{local}
}

fn merge_portable_into_local(local:&mut PlainVault,value:&serde_json::Value)->Result<(usize,usize),String>{
 let imported=portable_profile_map(value)?;
 let mut added=0usize;let mut updated=0usize;
 if local.global_client_id.trim().is_empty(){
  if let Some(x)=value.get("globalClientId").and_then(serde_json::Value::as_str).filter(|x|!x.trim().is_empty()){local.global_client_id=x.to_string();}
 }
 if local.global_client_secret.trim().is_empty(){
  if let Some(x)=value.get("globalClientSecret").and_then(serde_json::Value::as_str).filter(|x|!x.trim().is_empty()){local.global_client_secret=x.to_string();}
 }
 for (id,incoming) in imported{
  if let Some(current)=local.profiles.get_mut(&id){
   let newer=choose_newer(current,&incoming).clone();
   // Preserve any usable local secure credential; imported credentials only fill gaps.
   if current.refresh_token.trim().is_empty()&&!incoming.refresh_token.trim().is_empty(){current.refresh_token=incoming.refresh_token.clone();}
   if current.client_secret.trim().is_empty()&&!incoming.client_secret.trim().is_empty(){current.client_secret=incoming.client_secret.clone();}
   if !newer.expected_channel_id.trim().is_empty(){current.expected_channel_id=newer.expected_channel_id;}
   if !newer.google_email.trim().is_empty(){current.google_email=newer.google_email;}
   if !newer.preferred_browser.trim().is_empty(){current.preferred_browser=newer.preferred_browser;}
   current.credential_generation=current.credential_generation.max(incoming.credential_generation);
   if !newer.updated_at.trim().is_empty(){current.updated_at=newer.updated_at;}
   if current.connected_at.trim().is_empty(){current.connected_at=incoming.connected_at;}
   updated+=1;
  }else{
   local.profiles.insert(id,incoming);added+=1;
  }
 }
 Ok((added,updated))
}

pub fn merge_portable_snapshot(app:&AppHandle,value:&serde_json::Value)->Result<serde_json::Value,String>{
 let mut local=read_for_update(app)?;
 let existing_before=local.profiles.len();
 let (added,updated)=merge_portable_into_local(&mut local,value)?;
 write(app,&local)?;
 clear_caches();
 let verify=read(app,false)?;
 if verify.profiles.len()!=local.profiles.len(){return Err("MIGRATION_OAUTH_VERIFY_FAILED: profile count mismatch".into())}
 Ok(serde_json::json!({
  "ok":true,
  "existingBefore":existing_before,
  "added":added,
  "updated":updated,
  "after":verify.profiles.len(),
  "deleted":0,
  "secretValuesIncluded":false
 }))
}

pub fn copy_encrypted_snapshot(app:&AppHandle,destination:&Path)->Result<(),String>{
 let p=local_paths(app)?;
 if !p.doc_vault.exists(){
  let empty=PlainVault::default();
  write(app,&empty)?;
 }
 fs::copy(&p.doc_vault,destination).map_err(|e|format!("MIGRATION_OAUTH_BACKUP_FAILED: {e}"))?;
 private_file(destination);
 Ok(())
}

pub fn restore_encrypted_snapshot(app:&AppHandle,source:&Path)->Result<(),String>{
 let p=local_paths(app)?;
 let key=local_key(app,false)?;
 let bytes=fs::read(source).map_err(|e|format!("MIGRATION_OAUTH_RESTORE_READ_FAILED: {e}"))?;
 let _=decode_vault(&bytes,&key)?;
 write_private_atomic(&p.doc_vault,&bytes)?;
 write_private_atomic(&p.app_vault,&bytes)?;
 clear_caches();
 let _=read(app,false)?;
 Ok(())
}

#[cfg(test)]
mod tests{
 use super::*;
 fn fake_import_fixture(count:usize)->(Vec<u8>,Vec<u8>,Vec<u8>,String){
  let key=[42u8;32];
  let mut vault=PlainVault{global_client_id:"test-client".into(),global_client_secret:"test-secret-never-print".into(),..Default::default()};
  let mut channels=Vec::new();let mut profiles=Vec::new();
  for i in 0..count{
   let profile=format!("profile-{i}");let channel=format!("UC-test-{i}");
   channels.push(serde_json::json!({"id":format!("channel-{i}"),"youtubeProfileId":profile,"youtubeChannelId":channel}));
   profiles.push(serde_json::json!({"id":profile,"channel_id":channel,"client_id":"test-client"}));
   vault.profiles.insert(profile.clone(),VaultProfile{profile_uuid:profile,expected_channel_id:channel,refresh_token:"test-refresh-never-print".into(),..Default::default()});
  }
  let encrypted=encrypt_bytes(&serde_json::to_vec(&vault).unwrap(),&key,AAD).unwrap();
  (serde_json::to_vec(&serde_json::json!({"channels":channels})).unwrap(),serde_json::to_vec(&serde_json::json!({"profiles":profiles})).unwrap(),encrypted,B64.encode(key))
 }
 #[test]fn import_assessment_authenticates_and_checks_33_bindings_without_exposing_secrets(){
  let(state,metadata,vault,key)=fake_import_fixture(33);
  let report=assess_oauth_import(&state,&metadata,&vault,&key).unwrap();
  assert_eq!(report.channels,33);assert_eq!(report.metadata_profiles,33);assert_eq!(report.vault_profiles,33);assert_eq!(report.bound_channels,33);
  assert_eq!(report.missing_profiles,0);assert_eq!(report.missing_refresh_tokens,0);assert_eq!(report.missing_local_client_configuration,0);
  assert_eq!(report.identity_conflicts,0);assert_eq!(report.unverified_identities,0);
  assert!(!report.google_validation_performed);assert!(!report.keychain_validation_performed);
  let printable=format!("{report:?}");assert!(!printable.contains("test-secret-never-print"));assert!(!printable.contains("test-refresh-never-print"));
 }
 #[test]fn import_assessment_rejects_wrong_key_tampering_invalid_schema_and_duplicate_profiles(){
  let(state,metadata,vault,key)=fake_import_fixture(1);
  assert_eq!(assess_oauth_import(&state,&metadata,&vault,&B64.encode([43u8;32])),Err("OAUTH_IMPORT_VAULT_INVALID"));
  let mut envelope:serde_json::Value=serde_json::from_slice(&vault).unwrap();envelope["schemaVersion"]=serde_json::json!(99);
  assert_eq!(assess_oauth_import(&state,&metadata,&serde_json::to_vec(&envelope).unwrap(),&key),Err("OAUTH_IMPORT_VAULT_INVALID"));
  assert_eq!(assess_oauth_import(b"{}",&metadata,&vault,&key),Err("OAUTH_IMPORT_STATE_INVALID"));
  let duplicate=serde_json::json!({"profiles":[{"id":"p"},{"id":"p"}]});
  assert_eq!(assess_oauth_import(&state,&serde_json::to_vec(&duplicate).unwrap(),&vault,&key),Err("OAUTH_IMPORT_DUPLICATE_PROFILE"));
  let mut tampered:serde_json::Value=serde_json::from_slice(&vault).unwrap();
  let mut ciphertext=B64.decode(tampered["ciphertext"].as_str().unwrap()).unwrap();ciphertext[0]^=1;
  tampered["ciphertext"]=serde_json::json!(B64.encode(ciphertext));
  assert_eq!(assess_oauth_import(&state,&metadata,&serde_json::to_vec(&tampered).unwrap(),&key),Err("OAUTH_IMPORT_VAULT_INVALID"));
 }
 #[test]fn import_assessment_distinguishes_missing_conflicting_and_unverified_data(){
  let(state,metadata,vault,key)=fake_import_fixture(3);
  let mut state:serde_json::Value=serde_json::from_slice(&state).unwrap();
  state["channels"][0]["youtubeChannelId"]=serde_json::json!("UC-conflict");
  state["channels"][1]["youtubeChannelId"]=serde_json::Value::Null;
  state["channels"][2]["youtubeProfileId"]=serde_json::json!("unknown");
  let report=assess_oauth_import(&serde_json::to_vec(&state).unwrap(),&metadata,&vault,&key).unwrap();
  assert_eq!(report.identity_conflicts,1);assert_eq!(report.unverified_identities,1);assert_eq!(report.missing_profiles,1);
  assert_eq!(report.bound_channels,0);assert_eq!(report.unreferenced_profiles,1);assert_eq!(report.unreferenced_vault_profiles,1);
 }
 #[test]fn import_assessment_flags_a_known_conflict_even_when_third_identity_is_missing(){
  let(state,metadata,vault,key)=fake_import_fixture(1);
  let key_bytes=decode_key(&key).unwrap();let mut decoded=decode_vault(&vault,&key_bytes).unwrap();
  decoded.profiles.get_mut("profile-0").unwrap().expected_channel_id.clear();
  let changed=encrypt_bytes(&serde_json::to_vec(&decoded).unwrap(),&key_bytes,AAD).unwrap();
  let mut state:serde_json::Value=serde_json::from_slice(&state).unwrap();state["channels"][0]["youtubeChannelId"]=serde_json::json!("UC-other");
  let report=assess_oauth_import(&serde_json::to_vec(&state).unwrap(),&metadata,&changed,&key).unwrap();
  assert_eq!(report.identity_conflicts,1);assert_eq!(report.unverified_identities,0);assert_eq!(report.bound_channels,0);
 }
 #[test]fn import_assessment_reports_missing_refresh_and_local_client_without_guessing_keychain_state(){
  let(state,metadata,vault,key)=fake_import_fixture(2);
  let key_bytes=decode_key(&key).unwrap();let mut decoded=decode_vault(&vault,&key_bytes).unwrap();
  decoded.profiles.get_mut("profile-0").unwrap().refresh_token.clear();
  decoded.global_client_secret.clear();
  let changed=encrypt_bytes(&serde_json::to_vec(&decoded).unwrap(),&key_bytes,AAD).unwrap();
  let report=assess_oauth_import(&state,&metadata,&changed,&key).unwrap();
  assert_eq!(report.missing_refresh_tokens,1);assert_eq!(report.missing_local_client_configuration,2);
  assert!(!report.google_validation_performed);assert!(!report.keychain_validation_performed);
 }
 #[test]fn schema_is_stable(){assert_eq!(SCHEMA,1);assert_eq!(AAD,b"VYRON-OAUTH-VAULT-v1")}
 #[test]fn local_key_precedes_legacy_keychain_even_when_old_vault_exists(){
  assert_eq!(startup_key_plan(true,true),StartupKeyPlan::LocalPersistent);
  assert_eq!(startup_key_plan(true,false),StartupKeyPlan::LocalPersistent);
  assert_eq!(startup_key_plan(false,true),StartupKeyPlan::LegacyKeychainMigration);
 }
 #[test]fn keychain_minus_25293_is_irrelevant_when_local_key_exists(){
  let simulated_keychain_error="KEYCHAIN_AUTH_FAILED: osstatus=-25293";
  assert_eq!(startup_key_plan(true,true),StartupKeyPlan::LocalPersistent);
  assert!(simulated_keychain_error.contains("-25293"));
 }
 #[test]fn encrypted_global_client_survives_original_credentials_file_deletion(){
  let mut key=[0u8;32];OsRng.fill_bytes(&mut key);
  let vault=PlainVault{global_client_id:"client-A".into(),global_client_secret:"secret-S".into(),..Default::default()};
  let plain=serde_json::to_vec(&vault).unwrap();
  let enc=encrypt_bytes(&plain,&key,AAD).unwrap();
  let out=decode_vault(&enc,&key).unwrap();
  assert_eq!(out.global_client_id,"client-A");
  assert_eq!(out.global_client_secret,"secret-S");
 }
 #[test]fn thousand_profiles_need_one_vault_decrypt_not_keychain_per_profile(){
  let mut key=[0u8;32];OsRng.fill_bytes(&mut key);
  let mut vault=PlainVault::default();
  for i in 0..1000{
   let id=format!("profile-{i}");
   vault.profiles.insert(id.clone(),VaultProfile{profile_uuid:id,expected_channel_id:format!("UC{i}"),refresh_token:format!("refresh-{i}"),..Default::default()});
  }
  let enc=encrypt_bytes(&serde_json::to_vec(&vault).unwrap(),&key,AAD).unwrap();
  let out=decode_vault(&enc,&key).unwrap();
  assert_eq!(out.profiles.len(),1000);
  assert_eq!(out.profiles.get("profile-999").unwrap().refresh_token,"refresh-999");
 }
 #[test]fn legacy_vault_can_be_reencrypted_with_new_local_key_without_google(){
  let mut old=[0u8;32];let mut new=[0u8;32];OsRng.fill_bytes(&mut old);OsRng.fill_bytes(&mut new);
  let mut vault=PlainVault{global_client_id:"client".into(),global_client_secret:"secret".into(),..Default::default()};
  vault.profiles.insert("p1".into(),VaultProfile{profile_uuid:"p1".into(),expected_channel_id:"UC1".into(),refresh_token:"refresh".into(),..Default::default()});
  let old_enc=encrypt_bytes(&serde_json::to_vec(&vault).unwrap(),&old,AAD).unwrap();
  let recovered=decode_vault(&old_enc,&old).unwrap();
  let new_enc=encrypt_bytes(&serde_json::to_vec(&recovered).unwrap(),&new,AAD).unwrap();
  let migrated=decode_vault(&new_enc,&new).unwrap();
  assert_eq!(migrated.profiles.get("p1").unwrap().refresh_token,"refresh");
  assert_eq!(migrated.global_client_secret,"secret");
 }

 #[test]fn portable_merge_is_idempotent_preserves_local_secret_and_never_deletes(){
  let mut local=PlainVault{global_client_id:"local-client".into(),global_client_secret:"local-secret".into(),..Default::default()};
  local.profiles.insert("p1".into(),VaultProfile{
   profile_uuid:"p1".into(),expected_channel_id:"TEST_CH_LOCAL".into(),refresh_token:"local-refresh".into(),client_secret:"local-client-secret".into(),
   google_email:"old@example.test".into(),preferred_browser:"old".into(),updated_at:"2026-09-26T00:00:00Z".into(),credential_generation:2,connected_at:"2026-09-20T00:00:00Z".into()
  });
  local.profiles.insert("p-local-only".into(),VaultProfile{profile_uuid:"p-local-only".into(),refresh_token:"keep-me".into(),..Default::default()});
  let incoming=serde_json::json!({
   "globalClientId":"import-client","globalClientSecret":"import-secret",
   "profiles":{
    "p1":{"profileUuid":"p1","expectedChannelId":"TEST_CH_IMPORTED","refreshToken":"import-refresh","clientSecret":"import-client-secret","googleEmail":"new@example.test","preferredBrowser":"new","updatedAt":"2026-09-27T00:00:00Z","credentialGeneration":3,"connectedAt":"2026-09-27T00:00:00Z"},
    "p2":{"profileUuid":"p2","expectedChannelId":"TEST_CH_TWO","refreshToken":"p2-refresh","clientSecret":"p2-secret","updatedAt":"2026-09-27T00:00:00Z","credentialGeneration":1}
   }
  });
  let (added,updated)=merge_portable_into_local(&mut local,&incoming).unwrap();
  assert_eq!((added,updated),(1,1));
  assert_eq!(local.profiles.len(),3);
  let p1=local.profiles.get("p1").unwrap();
  assert_eq!(p1.refresh_token,"local-refresh");
  assert_eq!(p1.client_secret,"local-client-secret");
  assert_eq!(p1.expected_channel_id,"TEST_CH_IMPORTED");
  assert_eq!(p1.credential_generation,3);
  assert!(local.profiles.contains_key("p-local-only"));
  assert_eq!(local.global_client_id,"local-client");
  assert_eq!(local.global_client_secret,"local-secret");
  let (added2,updated2)=merge_portable_into_local(&mut local,&incoming).unwrap();
  assert_eq!((added2,updated2),(0,2));
  assert_eq!(local.profiles.len(),3);
  assert_eq!(local.profiles.get("p1").unwrap().refresh_token,"local-refresh");
 }
 #[test]fn local_storage_contract_is_stable(){
  let source=include_str!("oauth_vault.rs");
  for part in ["VYRON","Auth","State","Backups","Logs","oauth-vault.enc","vault.key","oauth-client.json.enc","profiles.json"]{assert!(source.contains(part));}
 }
}
