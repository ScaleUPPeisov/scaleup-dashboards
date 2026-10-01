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
use tauri::{AppHandle,Manager};

use crate::security;

const SCHEMA:u32=1;
const AAD:&[u8]=b"VYRON-OAUTH-VAULT-v1";
const CLIENT_AAD:&[u8]=b"VYRON-OAUTH-CLIENT-v1";
#[cfg(target_os="windows")]
const WINDOWS_VAULT_KEY_ACCOUNT:&str="oauth.vault.master_key";

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
 let documents=app.path().document_dir().map_err(|e|format!("OAUTH_LOCAL_DOCUMENTS_PATH_FAILED: {e}"))?;
 let root=documents.join("VYRON");
 let auth=root.join("Auth");
 let state=root.join("State");
 let backups=root.join("Backups");
 let logs=root.join("Logs");
 let auth_backup=auth.join("backup");
 for dir in [&root,&auth,&state,&backups,&logs,&auth_backup]{create_private_dir(dir)?;}
 let app_dir=app.path().app_data_dir().map_err(|e|format!("OAUTH_VAULT_APP_DATA: {e}"))?;
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

#[derive(Debug,Clone,Copy,PartialEq,Eq)]
enum LocalKeySource{CanonicalCredential,DocumentFile,AppDataFile,Missing}
#[derive(Debug,Clone,Copy)]
struct LocalKeyProbe{
 source:LocalKeySource,
 key:Option<[u8;32]>,
 canonical_credential_present:bool,
 doc_key_present:bool,
 app_key_present:bool,
}
impl LocalKeyProbe{fn available(&self)->bool{self.key.is_some()}}

fn persistent_local_key_probe(app:&AppHandle)->Result<LocalKeyProbe,String>{
 let p=local_paths(app)?;
 let doc_key=read_key_file(&p.doc_key)?;
 let app_key=read_key_file(&p.app_key)?;
 #[cfg(target_os="windows")]
 {
  if let Some(encoded)=security::canonical_get_secret(WINDOWS_VAULT_KEY_ACCOUNT)?{
   let key=decode_key(&encoded)?;
   return Ok(LocalKeyProbe{
    source:LocalKeySource::CanonicalCredential,key:Some(key),
    canonical_credential_present:true,
    doc_key_present:doc_key.is_some(),app_key_present:app_key.is_some()
   })
  }
 }
 if let Some(key)=doc_key{
  return Ok(LocalKeyProbe{
   source:LocalKeySource::DocumentFile,key:Some(key),
   canonical_credential_present:false,doc_key_present:true,app_key_present:app_key.is_some()
  })
 }
 if let Some(key)=app_key{
  return Ok(LocalKeyProbe{
   source:LocalKeySource::AppDataFile,key:Some(key),
   canonical_credential_present:false,doc_key_present:false,app_key_present:true
  })
 }
 Ok(LocalKeyProbe{
  source:LocalKeySource::Missing,key:None,canonical_credential_present:false,
  doc_key_present:false,app_key_present:false
 })
}

fn local_key(app:&AppHandle,create:bool)->Result<[u8;32],String>{
 if let Ok(cache)=master_cache().lock(){if let Some(key)=*cache{return Ok(key)}}
 let p=local_paths(app)?;
 #[cfg(target_os="windows")]
 {
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
 let source=if p.legacy_backup.exists(){&p.legacy_backup}else if p.app_vault.exists(){&p.app_vault}else{&p.doc_vault};
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
fn read_local_with_key(p:&LocalPaths,key:&[u8;32],mirror_app_to_doc:bool)->Result<PlainVault,String>{
 if p.doc_vault.exists(){
  let bytes=fs::read(&p.doc_vault).map_err(|e|format!("OAUTH_VAULT_READ_FAILED: {e}"))?;
  return decode_vault(&bytes,key)
 }
 if p.app_vault.exists(){
  let bytes=fs::read(&p.app_vault).map_err(|e|format!("OAUTH_VAULT_READ_FAILED: {e}"))?;
  let vault=decode_vault(&bytes,key)?;
  if mirror_app_to_doc{write_private_atomic(&p.doc_vault,&bytes)?;}
  return Ok(vault)
 }
 Ok(PlainVault::default())
}
fn read_local(app:&AppHandle)->Result<PlainVault,String>{
 let p=local_paths(app)?;
 let key=local_key(app,false)?;
 read_local_with_key(&p,&key,true)
}
fn migration_pending(error:&str)->bool{
 error.contains("OAUTH_VAULT_LEGACY_KEYCHAIN_MIGRATION_REQUIRED")
  ||error.contains("OAUTH_VAULT_LEGACY_MASTER_KEY_MISSING")
  ||error.contains("OAUTH_VAULT_LOCAL_KEY_MISSING")
}
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
enum StartupKeyPlan{LocalPersistent,LegacyKeychainMigration,Empty}
fn startup_key_plan(local_key_available:bool,vault_or_legacy_present:bool)->StartupKeyPlan{
 if local_key_available{StartupKeyPlan::LocalPersistent}
 else if vault_or_legacy_present{StartupKeyPlan::LegacyKeychainMigration}
 else{StartupKeyPlan::Empty}
}
fn read(app:&AppHandle,interactive:bool)->Result<PlainVault,String>{
 if let Ok(cache)=vault_cache().lock(){if let Some(v)=cache.as_ref(){return Ok(v.clone())}}
 let p=local_paths(app)?;
 let vault_or_legacy_present=p.doc_vault.exists()||p.app_vault.exists()||p.legacy_backup.exists();
 let current_key_available=match local_key(app,false){
  Ok(_)=>true,
  Err(e) if e.contains("OAUTH_VAULT_LOCAL_KEY_MISSING")=>false,
  Err(e)=>return Err(e),
 };
 match startup_key_plan(current_key_available,vault_or_legacy_present){
  StartupKeyPlan::LocalPersistent=>{
   // Current Windows Credential Manager key always wins. Key-file existence is
   // never used to select the startup architecture.
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
 // A readable current vault through the resolved current key is authoritative,
 // including Windows Credential Manager with zero vault.key files.
 if local_key(app,false).is_ok()&&read_local(app).is_ok(){return Ok(())}
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
 let probe=persistent_local_key_probe(app)?;
 let local_key=probe.available();
 let local_vault=p.doc_vault.exists()||p.app_vault.exists();
 let readable=match probe.key.as_ref(){
  Some(key) if local_vault=>read_local_with_key(&p,key,false).is_ok(),
  _=>false,
 };
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
  "localKeySource":format!("{:?}",probe.source),
  "canonicalCredentialPresent":probe.canonical_credential_present,
  "docKeyFilePresent":probe.doc_key_present,
  "appKeyFilePresent":probe.app_key_present,
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

#[derive(Debug,Clone,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase")]
struct VaultSnapshotMeta{
 existed:bool,
 source:String,
 storage_kind:String,
 current_local_key_present:bool,
 current_canonical_key_present:bool,
 doc_key_file_present:bool,
 app_key_file_present:bool,
}

fn classify_snapshot_bytes(bytes:&[u8],key:Option<&[u8;32]>)->&'static str{
 match key{
  Some(key) if decode_vault(bytes,key).is_ok()=>"current-local",
  _=>"opaque-legacy",
 }
}

fn snapshot_from_paths(
 p:&LocalPaths,
 destination:&Path,
 probe:&LocalKeyProbe,
)->Result<VaultSnapshotMeta,String>{
 let (source_name,source_path)=if p.doc_vault.exists(){
  ("doc",&p.doc_vault)
 }else if p.app_vault.exists(){
  ("app",&p.app_vault)
 }else{
  return Ok(VaultSnapshotMeta{
   existed:false,source:"none".into(),storage_kind:"absent".into(),
   current_local_key_present:probe.available(),
   current_canonical_key_present:probe.canonical_credential_present,
   doc_key_file_present:probe.doc_key_present,app_key_file_present:probe.app_key_present,
  })
 };
 let bytes=fs::read(source_path).map_err(|e|format!("MIGRATION_OAUTH_BACKUP_READ_FAILED: {e}"))?;
 if let Some(parent)=destination.parent(){fs::create_dir_all(parent).map_err(|e|format!("MIGRATION_OAUTH_BACKUP_MKDIR_FAILED: {e}"))?;}
 fs::write(destination,&bytes).map_err(|e|format!("MIGRATION_OAUTH_BACKUP_FAILED: {e}"))?;
 private_file(destination);
 Ok(VaultSnapshotMeta{
  existed:true,source:source_name.into(),
  storage_kind:classify_snapshot_bytes(&bytes,probe.key.as_ref()).into(),
  current_local_key_present:probe.available(),
  current_canonical_key_present:probe.canonical_credential_present,
  doc_key_file_present:probe.doc_key_present,app_key_file_present:probe.app_key_present,
 })
}

pub fn copy_encrypted_snapshot(app:&AppHandle,destination:&Path)->Result<serde_json::Value,String>{
 let p=local_paths(app)?;
 // Read-only probe + raw encrypted byte copy. No key creation, no vault write,
 // no Credential Manager mutation, no profile mutation.
 let probe=persistent_local_key_probe(app)?;
 let meta=snapshot_from_paths(&p,destination,&probe)?;
 serde_json::to_value(meta).map_err(|e|format!("MIGRATION_OAUTH_BACKUP_META_FAILED: {e}"))
}

fn parse_snapshot_meta(
 metadata:Option<&serde_json::Value>,
 source_exists:bool,
 probe:&LocalKeyProbe,
 source_bytes:Option<&[u8]>,
)->Result<VaultSnapshotMeta,String>{
 if let Some(value)=metadata{
  if !value.is_null(){
   return serde_json::from_value(value.clone()).map_err(|e|format!("MIGRATION_OAUTH_SNAPSHOT_META_INVALID: {e}"))
  }
 }
 // 6.0.2 rollback snapshots had no OAuth metadata. Safely classify them:
 // if the snapshot decrypts with the CURRENT canonical/local key, it is current-local.
 // Otherwise preserve it as opaque bytes and never demand the obsolete legacy key.
 let kind=source_bytes.map(|b|classify_snapshot_bytes(b,probe.key.as_ref())).unwrap_or("absent");
 Ok(VaultSnapshotMeta{
  existed:source_exists,source:if source_exists{"doc".into()}else{"none".into()},
  storage_kind:kind.into(),
  current_local_key_present:probe.available(),
  current_canonical_key_present:probe.canonical_credential_present,
  doc_key_file_present:probe.doc_key_present,app_key_file_present:probe.app_key_present,
 })
}

fn remove_file_if_exists(path:&Path)->Result<(),String>{
 if path.exists(){fs::remove_file(path).map_err(|e|format!("MIGRATION_OAUTH_RESTORE_REMOVE_FAILED: {}: {e}",path.display()))?;}
 Ok(())
}

fn restore_snapshot_to_paths(
 p:&LocalPaths,
 source:&Path,
 meta:&VaultSnapshotMeta,
 current_key:Option<&[u8;32]>,
)->Result<(),String>{
 if !meta.existed||meta.storage_kind=="absent"{
  remove_file_if_exists(&p.doc_vault)?;
  remove_file_if_exists(&p.app_vault)?;
  return Ok(())
 }
 let bytes=fs::read(source).map_err(|e|format!("MIGRATION_OAUTH_RESTORE_READ_FAILED: {e}"))?;
 match meta.storage_kind.as_str(){
  "current-local"=>{
   let key=current_key.ok_or_else(||"MIGRATION_OAUTH_CURRENT_LOCAL_KEY_MISSING".to_string())?;
   let _=decode_vault(&bytes,key)?;
   write_private_atomic(&p.doc_vault,&bytes)?;
   write_private_atomic(&p.app_vault,&bytes)?;
   let _=read_local_with_key(p,key,false)?;
  },
  "opaque-legacy"=>{
   // Opaque legacy bytes are restored byte-for-byte. Never validate them with
   // the new current key and never request the obsolete legacy key during rollback.
   if meta.source=="app"{
    write_private_atomic(&p.app_vault,&bytes)?;
    remove_file_if_exists(&p.doc_vault)?;
   }else{
    write_private_atomic(&p.doc_vault,&bytes)?;
    remove_file_if_exists(&p.app_vault)?;
   }
  },
  other=>return Err(format!("MIGRATION_OAUTH_SNAPSHOT_KIND_UNSUPPORTED: {other}")),
 }
 Ok(())
}

pub fn restore_encrypted_snapshot(
 app:&AppHandle,
 source:&Path,
 metadata:Option<&serde_json::Value>,
)->Result<(),String>{
 let p=local_paths(app)?;
 let probe=persistent_local_key_probe(app)?;
 let bytes=if source.exists(){Some(fs::read(source).map_err(|e|format!("MIGRATION_OAUTH_RESTORE_READ_FAILED: {e}"))?)}else{None};
 let meta=parse_snapshot_meta(metadata,source.exists(),&probe,bytes.as_deref())?;
 restore_snapshot_to_paths(&p,source,&meta,probe.key.as_ref())?;

 #[cfg(target_os="windows")]
 if !meta.current_canonical_key_present{
  // If the import created the canonical key after a snapshot that had none,
  // rollback restores that absence. No secret material is stored in metadata.
  security::canonical_delete_secret(WINDOWS_VAULT_KEY_ACCOUNT)?;
 }

 clear_caches();
 Ok(())
}

#[cfg(test)]
mod tests{
 use super::*;
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
