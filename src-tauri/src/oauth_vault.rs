use std::{collections::HashMap,fs::{self,File},io::Write,path::PathBuf,sync::{Mutex,OnceLock}};
use base64::{engine::general_purpose::STANDARD as B64,Engine as _};
use chacha20poly1305::{aead::{Aead,KeyInit,Payload},Key,XChaCha20Poly1305,XNonce};
use rand_core::{OsRng,RngCore};
use serde::{Deserialize,Serialize};
use tauri::{AppHandle,Manager};

use crate::security;

const SCHEMA:u32=1;
const AAD:&[u8]=b"VYRON-OAUTH-VAULT-v1";

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
}
#[derive(Debug,Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct PlainVault{
 schema_version:u32,
 #[serde(default)] global_client_id:String,
 #[serde(default)] global_client_secret:String,
 #[serde(default)] profiles:HashMap<String,VaultProfile>,
}
impl Default for PlainVault{fn default()->Self{Self{schema_version:SCHEMA,global_client_id:String::new(),global_client_secret:String::new(),profiles:HashMap::new()}}}
static MASTER_CACHE:OnceLock<Mutex<Option<[u8;32]>>>=OnceLock::new();
static VAULT_CACHE:OnceLock<Mutex<Option<PlainVault>>>=OnceLock::new();
fn master_cache()->&'static Mutex<Option<[u8;32]>>{MASTER_CACHE.get_or_init(||Mutex::new(None))}
fn vault_cache()->&'static Mutex<Option<PlainVault>>{VAULT_CACHE.get_or_init(||Mutex::new(None))}

#[derive(Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
struct Envelope{schema_version:u32,nonce:String,ciphertext:String}

fn path(app:&AppHandle)->Result<PathBuf,String>{
 let dir=app.path().app_data_dir().map_err(|e|format!("OAUTH_VAULT_APP_DATA: {e}"))?;
 fs::create_dir_all(&dir).map_err(|e|format!("OAUTH_VAULT_MKDIR: {e}"))?;
 Ok(dir.join("oauth-vault.enc"))
}
fn master_key(interactive:bool,create:bool)->Result<[u8;32],String>{
 if let Ok(cache)=master_cache().lock(){if let Some(key)=*cache{return Ok(key)}}
 let existing=security::oauth_vault_master_key_get(interactive).map_err(|e|format!("OAUTH_VAULT_MASTER_KEY_BLOCKED: {e}"))?;
 let encoded=if let Some(v)=existing.filter(|x|!x.trim().is_empty()){v}else{
  if !create{return Err("OAUTH_VAULT_MASTER_KEY_MISSING".into())}
  let mut raw=[0u8;32];OsRng.fill_bytes(&mut raw);let encoded=B64.encode(raw);
  security::oauth_vault_master_key_set(&encoded).map_err(|e|format!("OAUTH_VAULT_MASTER_KEY_WRITE_FAILED: {e}"))?;
  encoded
 };
 let bytes=B64.decode(encoded.trim()).map_err(|_|"OAUTH_VAULT_MASTER_KEY_INVALID".to_string())?;
 if bytes.len()!=32{return Err("OAUTH_VAULT_MASTER_KEY_INVALID_LENGTH".into())}
 let mut out=[0u8;32];out.copy_from_slice(&bytes);if let Ok(mut cache)=master_cache().lock(){*cache=Some(out)}Ok(out)
}
fn read(app:&AppHandle,interactive:bool)->Result<PlainVault,String>{
 if let Ok(cache)=vault_cache().lock(){if let Some(v)=cache.as_ref(){return Ok(v.clone())}}
 let p=path(app)?;
 if !p.exists(){return Ok(PlainVault::default())}
 let envelope:Envelope=serde_json::from_slice(&fs::read(&p).map_err(|e|format!("OAUTH_VAULT_READ_FAILED: {e}"))?).map_err(|e|format!("OAUTH_VAULT_ENVELOPE_INVALID: {e}"))?;
 if envelope.schema_version!=SCHEMA{return Err(format!("OAUTH_VAULT_SCHEMA_UNSUPPORTED: {}",envelope.schema_version))}
 let key=master_key(interactive,false)?;
 let nonce=B64.decode(envelope.nonce).map_err(|_|"OAUTH_VAULT_NONCE_INVALID".to_string())?;
 if nonce.len()!=24{return Err("OAUTH_VAULT_NONCE_INVALID_LENGTH".into())}
 let ciphertext=B64.decode(envelope.ciphertext).map_err(|_|"OAUTH_VAULT_CIPHERTEXT_INVALID".to_string())?;
 let cipher=XChaCha20Poly1305::new(Key::from_slice(&key));
 let plain=cipher.decrypt(XNonce::from_slice(&nonce),Payload{msg:&ciphertext,aad:AAD}).map_err(|_|"OAUTH_VAULT_AUTHENTICATION_FAILED".to_string())?;
 let vault:PlainVault=serde_json::from_slice(&plain).map_err(|e|format!("OAUTH_VAULT_CONTENT_INVALID: {e}"))?;
 if vault.schema_version!=SCHEMA{return Err("OAUTH_VAULT_CONTENT_SCHEMA_INVALID".into())}
 if let Ok(mut cache)=vault_cache().lock(){*cache=Some(vault.clone())}Ok(vault)
}
fn write(app:&AppHandle,vault:&PlainVault)->Result<(),String>{
 let p=path(app)?;let key=master_key(false,true)?;
 let plain=serde_json::to_vec(vault).map_err(|e|format!("OAUTH_VAULT_SERIALIZE_FAILED: {e}"))?;
 let mut nonce=[0u8;24];OsRng.fill_bytes(&mut nonce);
 let cipher=XChaCha20Poly1305::new(Key::from_slice(&key));
 let encrypted=cipher.encrypt(XNonce::from_slice(&nonce),Payload{msg:&plain,aad:AAD}).map_err(|_|"OAUTH_VAULT_ENCRYPT_FAILED".to_string())?;
 let envelope=serde_json::to_vec(&Envelope{schema_version:SCHEMA,nonce:B64.encode(nonce),ciphertext:B64.encode(encrypted)}).map_err(|e|format!("OAUTH_VAULT_ENVELOPE_SERIALIZE_FAILED: {e}"))?;
 let tmp=p.with_extension("enc.tmp");let backup=p.with_extension("enc.bak");
 {
  let mut f=File::create(&tmp).map_err(|e|format!("OAUTH_VAULT_TEMP_CREATE_FAILED: {e}"))?;
  f.write_all(&envelope).map_err(|e|format!("OAUTH_VAULT_TEMP_WRITE_FAILED: {e}"))?;
  f.sync_all().map_err(|e|format!("OAUTH_VAULT_TEMP_SYNC_FAILED: {e}"))?;
 }
 if p.exists(){let _=fs::copy(&p,&backup);}
 fs::rename(&tmp,&p).map_err(|e|format!("OAUTH_VAULT_ATOMIC_RENAME_FAILED: {e}"))?;
 #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;let _=fs::set_permissions(&p,fs::Permissions::from_mode(0o600));let _=fs::set_permissions(&backup,fs::Permissions::from_mode(0o600));}
 if let Ok(mut cache)=vault_cache().lock(){*cache=Some(vault.clone())}Ok(())
}
pub fn profile_refresh(app:&AppHandle,profile_id:&str)->Result<Option<String>,String>{
 Ok(read(app,false)?.profiles.get(profile_id).map(|x|x.refresh_token.clone()).filter(|x|!x.trim().is_empty()))
}
pub fn profile_client_secret(app:&AppHandle,profile_id:&str)->Result<Option<String>,String>{
 Ok(read(app,false)?.profiles.get(profile_id).map(|x|x.client_secret.clone()).filter(|x|!x.trim().is_empty()))
}
pub fn global_client_secret(app:&AppHandle,client_id:&str)->Result<Option<String>,String>{
 let v=read(app,false)?;if !client_id.trim().is_empty()&&v.global_client_id.trim()!=client_id.trim(){return Ok(None)}Ok((!v.global_client_secret.trim().is_empty()).then_some(v.global_client_secret))
}
pub fn upsert_profile(app:&AppHandle,profile_id:&str,channel_id:&str,refresh_token:Option<&str>,client_secret:Option<&str>,email:Option<&str>,browser:Option<&str>)->Result<(),String>{
 let mut v=read(app,false).or_else(|e|if e=="OAUTH_VAULT_MASTER_KEY_MISSING"{Ok(PlainVault::default())}else{Err(e)})?;
 let row=v.profiles.entry(profile_id.to_string()).or_insert_with(||VaultProfile{profile_uuid:profile_id.to_string(),..Default::default()});
 if !channel_id.trim().is_empty(){row.expected_channel_id=channel_id.to_string()}
 if let Some(x)=refresh_token.filter(|x|!x.trim().is_empty()){row.refresh_token=x.to_string()}
 if let Some(x)=client_secret.filter(|x|!x.trim().is_empty()){row.client_secret=x.to_string()}
 if let Some(x)=email{row.google_email=x.to_string()}if let Some(x)=browser{row.preferred_browser=x.to_string()}
 row.updated_at=chrono::Utc::now().to_rfc3339();write(app,&v)
}
pub fn set_global_client(app:&AppHandle,client_id:&str,client_secret:&str)->Result<(),String>{
 let mut v=read(app,false).or_else(|e|if e=="OAUTH_VAULT_MASTER_KEY_MISSING"{Ok(PlainVault::default())}else{Err(e)})?;
 v.global_client_id=client_id.to_string();v.global_client_secret=client_secret.to_string();write(app,&v)
}
pub fn remove_profile(app:&AppHandle,profile_id:&str)->Result<(),String>{let mut v=read(app,false)?;v.profiles.remove(profile_id);write(app,&v)}
pub fn recover_master_key_interactive(app:&AppHandle)->Result<(),String>{let _=master_key(true,false)?;let _=read(app,true)?;Ok(())}
#[cfg(test)]
mod tests{
 use super::*;
 #[test] fn schema_is_stable(){assert_eq!(SCHEMA,1);assert_eq!(AAD,b"VYRON-OAUTH-VAULT-v1")}
}
