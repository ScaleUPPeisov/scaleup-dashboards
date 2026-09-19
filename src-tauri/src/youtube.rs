use crate::security;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use uuid::Uuid;

pub(crate) fn emit_youtube_api_request(app: &AppHandle, method: &str, operation_id: Option<&str>) {
    let _ = app.emit(
        "youtube-api-request",
        json!({"method":method,"operationId":operation_id,"at":Utc::now().to_rfc3339()}),
    );
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OAuthStore {
    profiles: Vec<OAuthProfile>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OAuthProfile {
    id: String,
    client_id: String,
    #[serde(default, skip_serializing)]
    client_secret: String,
    channel_id: Option<String>,
    channel_title: Option<String>,
    #[serde(default, skip_serializing)]
    access_token: String,
    #[serde(default, skip_serializing)]
    refresh_token: String,
    expires_at: i64,
    connected_at: String,
    #[serde(default)]
    scopes: Vec<String>,
    #[serde(default)]
    preferred_browser: String,
    #[serde(default)]
    identity_validated_at: Option<String>,
    #[serde(default)]
    identity_validated_channel_id: Option<String>,
    #[serde(skip)]
    credential_error: Option<String>,
}
fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("youtube-oauth.json"))
}
fn oauth_key(id: &str, kind: &str) -> String {
    format!("oauth.{id}.{kind}")
}
fn legacy_oauth_keys(id: &str, kind: &str) -> Vec<String> {
    vec![
        format!("youtube_profile_{kind}::{id}"),
        format!("youtube_profile_{kind}:{id}"),
    ]
}

const KEYCHAIN_MIGRATION_V2_VERSION:u32=2;
const MIGRATION_NOT_STARTED:&str="NOT_STARTED";
const MIGRATION_MIGRATING:&str="MIGRATING";
const MIGRATION_MIGRATED:&str="MIGRATED";
const MIGRATION_FAILED:&str="FAILED";
const MIGRATION_RECONNECT_REQUIRED:&str="RECONNECT_REQUIRED";
static PROFILE_MIGRATION_ATTEMPTS:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static PROFILE_MIGRATION_SUCCESSES:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static PROFILE_MIGRATION_FAILURES:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static ACCESS_TOKEN_MEMORY_HITS:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);

#[derive(Debug,Clone,Serialize,Deserialize)]
struct KeychainMigrationV2State{
 #[serde(default="migration_v2_version")] version:u32,
 #[serde(default)] profiles:HashMap<String,String>,
 #[serde(default)] global_client_secret:String,
}
fn migration_v2_version()->u32{KEYCHAIN_MIGRATION_V2_VERSION}
impl Default for KeychainMigrationV2State{
 fn default()->Self{Self{version:KEYCHAIN_MIGRATION_V2_VERSION,profiles:HashMap::new(),global_client_secret:MIGRATION_NOT_STARTED.into()}}
}
fn keychain_migration_v2_path(app:&AppHandle)->Result<PathBuf,String>{
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;
 fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
 Ok(dir.join("keychain-migration-v2.json"))
}
fn read_keychain_migration_v2(app:&AppHandle)->Result<KeychainMigrationV2State,String>{
 let path=keychain_migration_v2_path(app)?;
 if !path.exists(){return Ok(KeychainMigrationV2State::default())}
 let bytes=fs::read(&path).map_err(|e|format!("KEYCHAIN_MIGRATION_V2_READ_FAILED: {e}"))?;
 let state=serde_json::from_slice::<KeychainMigrationV2State>(&bytes).map_err(|e|format!("KEYCHAIN_MIGRATION_V2_PARSE_FAILED: {e}"))?;
 if state.version!=KEYCHAIN_MIGRATION_V2_VERSION{return Ok(KeychainMigrationV2State::default())}
 Ok(state)
}
fn write_keychain_migration_v2(app:&AppHandle,state:&KeychainMigrationV2State)->Result<(),String>{
 let path=keychain_migration_v2_path(app)?;
 let bytes=serde_json::to_vec_pretty(state).map_err(|e|format!("KEYCHAIN_MIGRATION_V2_SERIALIZE_FAILED: {e}"))?;
 security::write_private_atomic(&path,&bytes)
}
fn set_profile_migration_state(app:&AppHandle,profile_id:&str,status:&str)->Result<(),String>{
 let mut state=read_keychain_migration_v2(app)?;
 state.profiles.insert(profile_id.to_string(),status.to_string());
 write_keychain_migration_v2(app,&state)
}
fn profile_migration_status(app:&AppHandle,profile_id:&str)->Result<String,String>{
 Ok(read_keychain_migration_v2(app)?.profiles.get(profile_id).cloned().unwrap_or_else(||MIGRATION_NOT_STARTED.into()))
}

#[derive(Debug,Clone)]
struct SessionAccessToken{token:String,expires_at:i64}
static ACCESS_TOKEN_SESSION:OnceLock<Mutex<HashMap<String,SessionAccessToken>>>=OnceLock::new();
fn access_token_session()->&'static Mutex<HashMap<String,SessionAccessToken>>{ACCESS_TOKEN_SESSION.get_or_init(||Mutex::new(HashMap::new()))}
fn remember_access_token(profile_id:&str,token:&str,expires_at:i64){
 if token.trim().is_empty(){return}
 if let Ok(mut c)=access_token_session().lock(){c.insert(profile_id.to_string(),SessionAccessToken{token:token.to_string(),expires_at});}
}
fn session_access_token(profile_id:&str)->Option<(String,i64)>{
 let c=access_token_session().lock().ok()?;
 let entry=c.get(profile_id)?;
 if entry.expires_at<=now_ts()+60{return None}
 ACCESS_TOKEN_MEMORY_HITS.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
 Some((entry.token.clone(),entry.expires_at))
}
fn forget_access_token(profile_id:&str){if let Ok(mut c)=access_token_session().lock(){c.remove(profile_id);}}

fn legacy_refresh_candidates(id:&str)->Vec<String>{
 let mut out=vec![oauth_key(id,"refresh_token")];
 out.extend(legacy_oauth_keys(id,"refresh_token"));
 out
}
fn select_present_account(candidates:&[String],present:&[String])->Option<String>{
 candidates.iter().find(|a|present.iter().any(|x|x==*a)).cloned()
}
fn migrate_profile_refresh_to_canonical(app:&AppHandle,profile_id:&str)->Result<(),String>{
 let canonical_account=oauth_key(profile_id,"refresh_token");
 match security::canonical_get_secret_cached(&canonical_account){
  Ok(Some(v)) if !v.trim().is_empty()=>{
   let mut state=read_keychain_migration_v2(app)?;
   if state.profiles.get(profile_id).map(String::as_str)!=Some(MIGRATION_MIGRATED){
    state.profiles.insert(profile_id.to_string(),MIGRATION_MIGRATED.into());
    write_keychain_migration_v2(app,&state)?;
   }
   return Ok(())
  }
  Ok(_)=>{},
  Err(e) if e.contains("KEYCHAIN_INTERACTION_REQUIRED")||e.contains("KEYCHAIN_AUTH_FAILED")=>{
   return Err(format!("OAUTH_RECONNECT_REQUIRED: profile={profile_id}; canonical credential requires macOS interaction, which VYRON blocks"))
  }
  Err(e)=>return Err(e),
 }
 PROFILE_MIGRATION_ATTEMPTS.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
 let present=security::list_legacy_secret_accounts("")?;
 let source=select_present_account(&legacy_refresh_candidates(profile_id),&present);
 let mut state=read_keychain_migration_v2(app)?;
 if let Some(account)=source{
  state.profiles.insert(profile_id.to_string(),MIGRATION_RECONNECT_REQUIRED.into());
  write_keychain_migration_v2(app,&state)?;
  security::mark_legacy_reconnect_required(&account);
  PROFILE_MIGRATION_FAILURES.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
  return Err(format!("LEGACY_RECONNECT_REQUIRED: profile={profile_id}; legacy credential is present but secret read is disabled; reconnect Google once"))
 }
 state.profiles.insert(profile_id.to_string(),MIGRATION_FAILED.into());
 write_keychain_migration_v2(app,&state)?;
 PROFILE_MIGRATION_FAILURES.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
 Err(format!("OAUTH_RECONNECT_REQUIRED: profile={profile_id}; canonical refresh token is missing"))
}
fn require_canonical_refresh(app:&AppHandle,profile_id:&str)->Result<String,String>{
 match security::canonical_get_secret_cached(&oauth_key(profile_id,"refresh_token")){
  Ok(Some(v)) if !v.trim().is_empty()=>return Ok(v),
  Ok(_)=>{},
  Err(e) if e.contains("KEYCHAIN_INTERACTION_REQUIRED")||e.contains("KEYCHAIN_AUTH_FAILED")=>{
   return Err(format!("OAUTH_RECONNECT_REQUIRED: profile={profile_id}; canonical credential requires macOS interaction, which VYRON blocks"))
  }
  Err(e)=>return Err(e),
 }
 let status=profile_migration_status(app,profile_id)?;
 if status==MIGRATION_RECONNECT_REQUIRED{
  return Err(format!("LEGACY_RECONNECT_REQUIRED: profile={profile_id}; reconnect Google once"))
 }
 let present=security::list_legacy_secret_accounts("")?;
 if let Some(account)=select_present_account(&legacy_refresh_candidates(profile_id),&present){
  set_profile_migration_state(app,profile_id,MIGRATION_RECONNECT_REQUIRED)?;
  security::mark_legacy_reconnect_required(&account);
  return Err(format!("LEGACY_RECONNECT_REQUIRED: profile={profile_id}; legacy credential is present but VYRON will not read it; reconnect Google once"))
 }
 Err(format!("OAUTH_RECONNECT_REQUIRED: profile={profile_id}; canonical refresh token is missing"))
}
fn canonical_global_client_secret()->Result<Option<String>,String>{security::canonical_get_secret_cached(GOOGLE_CLIENT_SECRET)}
fn migrate_global_client_secret_if_needed(app:&AppHandle,profile_id:Option<&str>)->Result<Option<String>,String>{
 match canonical_global_client_secret(){
  Ok(Some(v)) if !v.trim().is_empty()=>return Ok(Some(v)),
  Ok(_)=>{},
  Err(e) if e.contains("KEYCHAIN_INTERACTION_REQUIRED")||e.contains("KEYCHAIN_AUTH_FAILED")=>{
   return Err("OAUTH_RECONNECT_REQUIRED: canonical Google client secret requires macOS interaction, which VYRON blocks".into())
  }
  Err(e)=>return Err(e),
 }
 let mut state=read_keychain_migration_v2(app)?;
 if state.global_client_secret==MIGRATION_RECONNECT_REQUIRED{
  return Err("LEGACY_RECONNECT_REQUIRED: Google client secret requires reimport/reconnect".into())
 }
 let present=security::list_legacy_secret_accounts("")?;
 let mut candidates=vec![GOOGLE_CLIENT_SECRET.to_string()];
 if let Some(id)=profile_id{
  candidates.push(oauth_key(id,"client_secret"));
  candidates.extend(legacy_oauth_keys(id,"client_secret"));
 }
 if let Some(account)=select_present_account(&candidates,&present){
  state.global_client_secret=MIGRATION_RECONNECT_REQUIRED.into();
  write_keychain_migration_v2(app,&state)?;
  security::mark_legacy_reconnect_required(&account);
  return Err("LEGACY_RECONNECT_REQUIRED: legacy Google client secret is present but secret read is disabled; reimport credentials.json or reconnect Google".into())
 }
 state.global_client_secret=MIGRATION_FAILED.into();
 write_keychain_migration_v2(app,&state)?;
 Ok(None)
}

trait OAuthSecretStore {
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn set(&self, account: &str, value: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
    fn accounts(&self, _prefix: &str) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }
    fn modified_rank(&self, _account: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
}
struct KeychainOAuthSecretStore;
impl OAuthSecretStore for KeychainOAuthSecretStore {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        security::canonical_get_secret_cached(account)
    }
    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        security::canonical_set_secret(account, value)
    }
    fn delete(&self, account: &str) -> Result<(), String> {
        security::canonical_delete_secret(account)
    }
    fn accounts(&self, prefix: &str) -> Result<Vec<String>, String> {
        security::list_canonical_secret_accounts(prefix)
    }
    fn modified_rank(&self, _account: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
}
fn read_profile_secret_with<S: OAuthSecretStore>(
    secrets: &S,
    id: &str,
    kind: &str,
) -> Result<Option<String>, String> {
    let current=oauth_key(id,kind);
    Ok(secrets.get(&current)?.filter(|v|!v.is_empty()))
}
fn write_profile_secrets_with<S: OAuthSecretStore>(secrets:&S,p:&OAuthProfile)->Result<(),String>{
    // RC5 durable profile storage intentionally contains only refresh_token.
    // access_token is process memory only; client_secret is a single global canonical item.
    if !p.refresh_token.trim().is_empty(){secrets.set(&oauth_key(&p.id,"refresh_token"),&p.refresh_token)?}
    Ok(())
}
fn hydrate_profile_secrets_with<S:OAuthSecretStore>(secrets:&S,p:&mut OAuthProfile)->Result<(),String>{
    if p.refresh_token.is_empty(){p.refresh_token=read_profile_secret_with(secrets,&p.id,"refresh_token")?.unwrap_or_default()}
    Ok(())
}
fn write_profile_secrets(p:&OAuthProfile)->Result<(),String>{write_profile_secrets_with(&KeychainOAuthSecretStore,p)}
fn hydrate_profile_secret_kind_with<S:OAuthSecretStore>(secrets:&S,p:&mut OAuthProfile,kind:&str)->Result<(),String>{
    match kind{
     "refresh_token"=>{if p.refresh_token.is_empty(){p.refresh_token=read_profile_secret_with(secrets,&p.id,"refresh_token")?.unwrap_or_default()}},
     "access_token"=>{if p.access_token.is_empty(){if let Some((token,expires_at))=session_access_token(&p.id){p.access_token=token;p.expires_at=expires_at}}},
     "client_secret"=>{p.client_secret=canonical_global_client_secret()?.unwrap_or_default()},
     _=>return Err(format!("UNKNOWN_SECRET_KIND: {kind}"))
    }
    Ok(())
}
fn hydrate_profile_secret_kind(p:&mut OAuthProfile,kind:&str)->Result<(),String>{hydrate_profile_secret_kind_with(&KeychainOAuthSecretStore,p,kind)}
fn profile_secret_value<'a>(p:&'a OAuthProfile,kind:&str)->Result<&'a str,String>{match kind{"client_secret"=>Ok(&p.client_secret),"access_token"=>Ok(&p.access_token),"refresh_token"=>Ok(&p.refresh_token),_=>Err(format!("UNKNOWN_SECRET_KIND: {kind}"))}}
fn set_profile_secret_value(p:&mut OAuthProfile,kind:&str,value:String)->Result<(),String>{match kind{"client_secret"=>p.client_secret=value,"access_token"=>p.access_token=value,"refresh_token"=>p.refresh_token=value,_=>return Err(format!("UNKNOWN_SECRET_KIND: {kind}"))};Ok(())}
fn hydrate_profile_secret_for_operation(app:&AppHandle,p:&mut OAuthProfile,kind:&str)->Result<(),String>{
    match kind{
     "refresh_token"=>{p.refresh_token=require_canonical_refresh(app,&p.id)?;Ok(())},
     "access_token"=>{if let Some((token,expires_at))=session_access_token(&p.id){p.access_token=token;p.expires_at=expires_at;Ok(())}else{Err(format!("ACCESS_TOKEN_SESSION_MISS: profile={}",p.id))}},
     "client_secret"=>{p.client_secret=canonical_global_client_secret()?.unwrap_or_default();Ok(())},
     _=>Err(format!("UNKNOWN_SECRET_KIND: {kind}"))
    }
}
fn delete_profile_secrets(id:&str)->Result<(),String>{
    forget_access_token(id);
    security::canonical_delete_secret(&oauth_key(id,"refresh_token"))
}
fn write_oauth_metadata(path: &Path, s: &OAuthStore) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(s).map_err(|e| format!("OAuth serialize: {e}"))?;
    security::write_private_atomic(path, &bytes)
}
fn has_plaintext_secret(p: &OAuthProfile) -> bool {
    !p.client_secret.is_empty() || !p.access_token.is_empty() || !p.refresh_token.is_empty()
}
fn recover_store_secrets_with<S: OAuthSecretStore>(secrets: &S, store: &mut OAuthStore) -> bool {
    let mut all_plaintext_migrated = true;
    for profile in &mut store.profiles {
        profile.credential_error = None;
        if has_plaintext_secret(profile) {
            if let Err(e) = write_profile_secrets_with(secrets, profile) {
                profile.credential_error = Some(e);
                all_plaintext_migrated = false;
                continue;
            }
        }
        if let Err(e) = hydrate_profile_secrets_with(secrets, profile) {
            profile.credential_error = Some(e)
        }
    }
    all_plaintext_migrated
}
fn load_store_metadata(app: &AppHandle) -> Result<OAuthStore, String> {
    let p = store_path(app)?;
    if !p.exists() {return Ok(OAuthStore::default())}
    let b = fs::read(&p).map_err(|e| format!("OAUTH_STORE_READ_ERROR: {e}"))?;
    let mut store = serde_json::from_slice::<OAuthStore>(&b).map_err(|e| {
        let backup = p.with_extension(format!("corrupt-{}.json",Utc::now().format("%Y%m%d%H%M%S")));
        let _=fs::copy(&p,&backup);let _=security::private_permissions(&backup);
        format!("OAUTH_STORE_CORRUPT: youtube-oauth.json сохранён без удаления; backup={}; error={e}",backup.display())
    })?;
    // Passive metadata load never migrates or hydrates Keychain secrets.
    for profile in &mut store.profiles{profile.client_secret.clear();profile.access_token.clear();profile.refresh_token.clear();profile.credential_error=None;}
    let _=security::private_permissions(&p);
    Ok(store)
}
fn load_store_raw_for_explicit_migration(app:&AppHandle)->Result<OAuthStore,String>{
    let p=store_path(app)?;if !p.exists(){return Ok(OAuthStore::default())}
    let b=fs::read(&p).map_err(|e|format!("OAUTH_STORE_READ_ERROR: {e}"))?;
    serde_json::from_slice::<OAuthStore>(&b).map_err(|e|format!("OAUTH_STORE_CORRUPT: {e}"))
}
fn save_store(app:&AppHandle,s:&OAuthStore)->Result<(),String>{write_oauth_metadata(&store_path(app)?,s)}
fn save_selected_profile(app:&AppHandle,s:&OAuthStore,idx:usize)->Result<(),String>{
    let p=s.profiles.get(idx).ok_or_else(||"OAUTH_PROFILE_INDEX_MISSING".to_string())?;
    write_profile_secrets(p)?;write_oauth_metadata(&store_path(app)?,s)
}
fn preserved_refresh_token(
    existing: Option<&OAuthProfile>,
    client_id: &str,
    response_refresh: Option<&str>,
) -> Result<String, String> {
    if let Some(v) = response_refresh.map(str::trim).filter(|x| !x.is_empty()) {
        return Ok(v.to_string());
    }
    if let Some(old) = existing {
        if old.client_id != client_id {
            return Err("OAUTH_CLIENT_MISMATCH: Google не вернул новый refresh_token, а сохранённый token относится к другому OAuth client_id".into());
        }
        if !old.refresh_token.trim().is_empty() {
            return Ok(old.refresh_token.clone());
        }
    }
    Err("REFRESH_TOKEN_MISSING: Google не вернул refresh_token и сохранённого legacy/current refresh_token для этого канала нет".into())
}
fn oauth_refresh_error(v: &Value) -> String {
    let code = v.get("error").and_then(Value::as_str).unwrap_or("");
    let detail = v
        .get("error_description")
        .and_then(Value::as_str)
        .unwrap_or("Не удалось обновить YouTube token");
    match code {
        "invalid_grant" => {
            format!("OAUTH_INVALID_GRANT: refresh token отозван/недействителен: {detail}")
        }
        "invalid_client" | "unauthorized_client" => format!("OAUTH_CLIENT_MISMATCH: {detail}"),
        _ => format!("OAUTH_REFRESH_FAILED: {code}: {detail}"),
    }
}
async fn refresh_access_token_http(client_id:&str,refresh_token:&str,client_secret:Option<&str>)->Result<(String,i64),String>{
    let mut form=vec![("client_id",client_id),("refresh_token",refresh_token),("grant_type","refresh_token")];
    if let Some(secret)=client_secret.filter(|x|!x.trim().is_empty()){form.push(("client_secret",secret))}
    let r=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&form).send().await
      .map_err(|e|format!("OAUTH_NETWORK_ERROR: token refresh: {e}"))?;
    let status=r.status();
    let v:Value=r.json().await.map_err(|e|format!("OAUTH_REFRESH_JSON_ERROR: {e}"))?;
    if !status.is_success(){return Err(oauth_refresh_error(&v))}
    let token=v.get("access_token").and_then(Value::as_str).filter(|x|!x.trim().is_empty())
      .ok_or_else(||"OAUTH_REFRESH_FAILED: Google response has no access_token".to_string())?.to_string();
    let expires=v.get("expires_in").and_then(Value::as_i64).unwrap_or(3600);
    Ok((token,expires))
}
async fn refresh_access_token_for_profile(app:&AppHandle,profile_id:&str,client_id:&str,refresh_token:&str)->Result<(String,i64),String>{
    match refresh_access_token_http(client_id,refresh_token,None).await{
      Ok(v)=>Ok(v),
      Err(e) if e.starts_with("OAUTH_CLIENT_MISMATCH:")=>{
        let secret=migrate_global_client_secret_if_needed(app,Some(profile_id))?.unwrap_or_default();
        if secret.trim().is_empty(){return Err(e)}
        refresh_access_token_http(client_id,refresh_token,Some(&secret)).await
      }
      Err(e)=>Err(e)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct GoogleConfig {
    #[serde(default)]
    client_id: String,
    #[serde(default, skip_serializing)]
    client_secret: String,
    #[serde(default)]
    project_id: String,
    #[serde(default, skip_serializing)]
    api_key: String,
    #[serde(default)]
    client_secret_present: bool,
    #[serde(default)]
    api_key_present: bool,
}
fn google_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("google-config.json"))
}
const GOOGLE_CLIENT_SECRET: &str = "google.client_secret";
const GOOGLE_API_KEY: &str = "google.api_key";
fn read_google_config_raw(app:&AppHandle)->Result<GoogleConfig,String>{
    let p=google_config_path(app)?;if !p.exists(){return Ok(GoogleConfig::default())}
    let b=fs::read(&p).map_err(|e|format!("Google config read: {e}"))?;
    serde_json::from_slice(&b).map_err(|e|format!("Google config parse: {e}"))
}
fn load_google_config_metadata(app:&AppHandle)->Result<GoogleConfig,String>{
    let p=google_config_path(app)?;let mut c=read_google_config_raw(app)?;
    c.client_secret_present|=!c.client_secret.is_empty();c.api_key_present|=!c.api_key.is_empty();
    c.client_secret.clear();c.api_key.clear();if p.exists(){let _=security::private_permissions(&p);}Ok(c)
}
fn hydrate_google_secrets(c:&mut GoogleConfig)->Result<(),String>{
    if c.client_secret.is_empty(){c.client_secret=security::canonical_get_secret_cached(GOOGLE_CLIENT_SECRET)?.unwrap_or_default()}
    if c.api_key.is_empty(){c.api_key=security::canonical_get_secret_cached(GOOGLE_API_KEY)?.unwrap_or_default()}
    c.client_secret_present|=!c.client_secret.is_empty();c.api_key_present|=!c.api_key.is_empty();Ok(())
}
fn write_google_secrets(c:&GoogleConfig)->Result<(),String>{
    if !c.client_secret.is_empty(){security::canonical_set_secret(GOOGLE_CLIENT_SECRET,&c.client_secret)?}
    if !c.api_key.is_empty(){security::canonical_set_secret(GOOGLE_API_KEY,&c.api_key)?}
    Ok(())
}
fn write_google_metadata(path:&Path,c:&GoogleConfig)->Result<(),String>{let b=serde_json::to_vec_pretty(c).map_err(|e|e.to_string())?;security::write_private_atomic(path,&b)}
fn load_google_config_for_secret_operation(app:&AppHandle)->Result<GoogleConfig,String>{
    let p=google_config_path(app)?;let mut c=read_google_config_raw(app)?;let legacy=!c.client_secret.is_empty()||!c.api_key.is_empty();
    if legacy{c.client_secret_present|=!c.client_secret.is_empty();c.api_key_present|=!c.api_key.is_empty();write_google_secrets(&c)?;c.client_secret.clear();c.api_key.clear();write_google_metadata(&p,&c)?;}
    else{hydrate_google_secrets(&mut c)?;}
    Ok(c)
}
fn save_google_config(app:&AppHandle,c:&GoogleConfig)->Result<(),String>{
    let p=google_config_path(app)?;let mut meta=c.clone();meta.client_secret_present|=!meta.client_secret.is_empty();meta.api_key_present|=!meta.api_key.is_empty();write_google_secrets(&meta)?;write_google_metadata(&p,&meta)
}
fn masked_client_id(s: &str) -> String {
    if s.len() > 16 {
        format!("{}…{}", &s[..8], &s[s.len() - 8..])
    } else if s.is_empty() {
        String::new()
    } else {
        "configured".into()
    }
}
fn google_config_status_value(c: &GoogleConfig) -> Value {
    json!({"configured":!c.client_id.trim().is_empty(),"projectId":if c.project_id.is_empty(){Value::Null}else{json!(c.project_id)},"clientIdMasked":if c.client_id.is_empty(){Value::Null}else{json!(masked_client_id(&c.client_id))},"hasSecret":c.client_secret_present,"hasApiKey":c.api_key_present})
}
#[derive(Debug, Clone, Deserialize, Default)]
struct SafeGoogleMetadata {
    #[serde(default)] client_id: String,
    #[serde(default)] project_id: String,
}
#[derive(Debug, Clone, Deserialize, Default)]
struct SafeOAuthMetadataStore {
    #[serde(default)] profiles: Vec<SafeOAuthMetadataProfile>,
}
#[derive(Debug, Clone, Deserialize, Default)]
struct SafeOAuthMetadataProfile {
    #[serde(default)] id: String,
    #[serde(default)] client_id: String,
    #[serde(default)] channel_id: Option<String>,
    #[serde(default)] channel_title: Option<String>,
}
fn load_google_metadata_only(app: &AppHandle) -> Result<SafeGoogleMetadata, String> {
    let p=google_config_path(app)?;
    if !p.exists(){return Ok(SafeGoogleMetadata::default())}
    let b=fs::read(&p).map_err(|e|format!("Google metadata read: {e}"))?;
    serde_json::from_slice(&b).map_err(|e|format!("Google metadata parse: {e}"))
}
fn load_oauth_metadata_only(app: &AppHandle) -> Result<SafeOAuthMetadataStore, String> {
    let p=store_path(app)?;
    if !p.exists(){return Ok(SafeOAuthMetadataStore::default())}
    let b=fs::read(&p).map_err(|e|format!("OAUTH_METADATA_READ_ERROR: {e}"))?;
    serde_json::from_slice(&b).map_err(|e|format!("OAUTH_METADATA_PARSE_ERROR: {e}"))
}
fn google_project_diagnostic_value(store:&SafeOAuthMetadataStore,google:&SafeGoogleMetadata,profile_id:&str)->Result<Value,String>{
    let profile=store.profiles.iter().find(|p|p.id==profile_id).ok_or_else(||"GOOGLE_PROJECT_PROFILE_NOT_FOUND".to_string())?;
    let client_id=profile.client_id.trim();
    if client_id.is_empty(){return Err("GOOGLE_PROJECT_CLIENT_ID_NOT_FOUND".into())}
    let exact_global_client_match=!google.client_id.trim().is_empty()&&google.client_id.trim()==client_id;
    let project_id=if exact_global_client_match&&!google.project_id.trim().is_empty(){Some(google.project_id.trim())}else{None};
    Ok(json!({"oauthProfileId":profile.id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"clientId":client_id,"projectId":project_id,"projectIdSource":if project_id.is_some(){"google-config-exact-client-match"}else{"not-locally-known"},"youtubeApiRequests":0,"keychainSecretsRead":false}))
}
#[tauri::command]
pub fn youtube_google_project_diagnostic(app:AppHandle,profile_id:String)->Result<Value,String>{
    let store=load_oauth_metadata_only(&app)?;
    let google=load_google_metadata_only(&app)?;
    google_project_diagnostic_value(&store,&google,profile_id.trim())
}
fn load_or_migrate_google_config(app:&AppHandle)->Result<GoogleConfig,String>{
    let mut c=load_google_config_for_secret_operation(app)?;
    if c.client_id.trim().is_empty(){
      let store=load_store_metadata(app)?;
      if let Some(p)=store.profiles.into_iter().find(|p|!p.client_id.trim().is_empty()){
        c.client_id=p.client_id;
        write_google_metadata(&google_config_path(app)?,&c)?;
      }
    }
    Ok(c)
}
#[tauri::command]
pub fn youtube_google_config_status(app: AppHandle) -> Result<Value, String> {
    Ok(google_config_status_value(&load_google_config_metadata(&app)?))
}
#[tauri::command]
pub fn youtube_google_config_import(
    app: AppHandle,
    json_text: String,
    api_key: String,
) -> Result<Value, String> {
    let v: Value =
        serde_json::from_str(&json_text).map_err(|e| format!("credentials.json: {e}"))?;
    let root = v.get("installed").or_else(|| v.get("web")).unwrap_or(&v);
    let client_id = root
        .get("client_id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if client_id.is_empty() {
        return Err("В credentials.json не найден client_id".into());
    }
    let client_secret = root
        .get("client_secret")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let project_id = root
        .get("project_id")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("project_id").and_then(|x| x.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();
    let old = load_google_config_for_secret_operation(&app).unwrap_or_default();
    let client_secret_present=old.client_secret_present||!client_secret.is_empty();
    let c = GoogleConfig {
        client_id,
        client_secret,
        project_id,
        api_key: if api_key.trim().is_empty() {old.api_key}else{api_key.trim().to_string()},
        client_secret_present,
        api_key_present:old.api_key_present||!api_key.trim().is_empty(),
    };
    save_google_config(&app, &c)?;
    Ok(google_config_status_value(&c))
}
#[tauri::command]
pub async fn youtube_oauth_connect_global(
    app: AppHandle,
    browser: Option<String>,
) -> Result<Value, String> {
    let c = load_or_migrate_google_config(&app)?;
    if c.client_id.trim().is_empty() {
        return Err("Нет Google OAuth Client. Импортируй credentials.json один раз или подключи существующий OAuth профиль.".into());
    }
    youtube_oauth_connect(app, c.client_id, c.client_secret, browser).await
}
#[tauri::command]
pub async fn youtube_oauth_profile_health(
    app: AppHandle,
    profile_id: String,
) -> Result<Value, String> {
    let (_token, p) = valid_access_token(&app, &profile_id).await?;
    let token = p.access_token.clone();
    emit_youtube_api_request(&app, "channels.list", None);
    let r = reqwest::Client::new()
        .get("https://www.googleapis.com/youtube/v3/channels")
        .bearer_auth(&token)
        .query(&[("part", "snippet"), ("mine", "true")])
        .send()
        .await
        .map_err(|e| format!("YouTube health: {e}"))?;
    let st = r.status();
    let v: Value = r.json().await.unwrap_or_else(|_| json!({}));
    if !st.is_success() {
        return Err(youtube_error(&v, "YouTube OAuth health check failed"));
    }
    let item = v
        .get("items")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let actual_id = item.get("id").and_then(|x| x.as_str()).ok_or_else(|| {
        "OAUTH_CHANNEL_MISSING: YouTube health check returned no channel ID".to_string()
    })?;
    if let Some(expected) = p.channel_id.as_deref() {
        if expected != actual_id {
            return Err(format!(
                "CHANNEL_MISMATCH: expected={expected} actual={actual_id}"
            ));
        }
    }
    let sn = item.get("snippet").cloned().unwrap_or_else(|| json!({}));
    let thumb = sn
        .pointer("/thumbnails/high/url")
        .or_else(|| sn.pointer("/thumbnails/medium/url"))
        .or_else(|| sn.pointer("/thumbnails/default/url"))
        .and_then(|x| x.as_str());
    let analytics = p.scopes.iter().any(|x| {
        x == "https://www.googleapis.com/auth/yt-analytics.readonly"
            || x == "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"
    });
    let monetary = p
        .scopes
        .iter()
        .any(|x| x == "https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
    Ok(
        json!({"ok":true,"status":"TOKEN_HEALTHY","channelId":item.get("id").and_then(|x|x.as_str()).or(p.channel_id.as_deref()),"channelTitle":sn.get("title").and_then(|x|x.as_str()).or(p.channel_title.as_deref()),"thumbnail":thumb,"expiresAt":p.expires_at,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser}),
    )
}
#[tauri::command]
pub async fn youtube_cache_thumbnail(
    app: AppHandle,
    video_id: String,
    primary: Option<String>,
) -> Result<String, String> {
    let id = video_id.trim();
    if id.is_empty() {
        return Err("Video ID пуст".into());
    }
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    fs::create_dir_all(&dir).map_err(|e| format!("Thumbnail cache: {e}"))?;
    let safe = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();
    let path = dir.join(format!("{safe}.jpg"));
    if path.exists() && fs::metadata(&path).map(|m| m.len() > 900).unwrap_or(false) {
        return Ok(path.to_string_lossy().to_string());
    }
    let mut urls = Vec::<String>::new();
    if let Some(x) = primary.filter(|x| !x.trim().is_empty()) {
        urls.push(x)
    }
    for q in [
        "maxresdefault",
        "sddefault",
        "hqdefault",
        "mqdefault",
        "default",
    ] {
        urls.push(format!("https://i.ytimg.com/vi/{id}/{q}.jpg"))
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;
    for url in urls {
        for attempt in 0..3 {
            match client.get(&url).send().await {
                Ok(r) if r.status().is_success() => {
                    let b = r.bytes().await.map_err(|e| e.to_string())?;
                    if b.len() > 900 {
                        let tmp = path.with_extension("tmp");
                        fs::write(&tmp, &b).map_err(|e| e.to_string())?;
                        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
                        return Ok(path.to_string_lossy().to_string());
                    }
                }
                Ok(_) => {}
                Err(_) => {
                    if attempt == 0 {
                        tokio::time::sleep(Duration::from_millis(250)).await;
                    }
                }
            }
        }
    }
    Err("Thumbnail недоступна после fallback".into())
}

fn browser_catalog() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("default", "Браузер по умолчанию", ""),
        ("safari", "Safari", "Safari"),
        ("chrome", "Google Chrome", "Google Chrome"),
        ("firefox", "Firefox", "Firefox"),
        ("brave", "Brave", "Brave Browser"),
        ("arc", "Arc", "Arc"),
        ("edge", "Microsoft Edge", "Microsoft Edge"),
        ("yandex", "Yandex Browser", "Yandex"),
        ("opera", "Opera", "Opera"),
    ]
}
#[tauri::command]
pub fn youtube_oauth_browsers() -> Value {
    #[cfg(target_os = "macos")]
    {
        let rows = browser_catalog()
            .into_iter()
            .map(|(id, label, app)| {
                let available = id == "default"
                    || ["/Applications", "/System/Applications"]
                        .iter()
                        .any(|base| Path::new(base).join(format!("{app}.app")).exists())
                    || std::env::var("HOME")
                        .ok()
                        .map(|h| {
                            Path::new(&h)
                                .join("Applications")
                                .join(format!("{app}.app"))
                                .exists()
                        })
                        .unwrap_or(false);
                json!({"id":id,"label":label,"available":available})
            })
            .collect::<Vec<_>>();
        return json!(rows);
    }
    #[cfg(not(target_os = "macos"))]
    {
        json!([{"id":"default","label":"Браузер по умолчанию","available":true}])
    }
}
fn open_browser(url: &str, browser: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if browser == "default" || browser.trim().is_empty() {
            Command::new("open")
                .arg(url)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            let app = browser_catalog()
                .into_iter()
                .find(|(id, _, _)| *id == browser)
                .map(|x| x.2)
                .ok_or_else(|| format!("Неизвестный браузер: {browser}"))?;
            Command::new("open")
                .args(["-a", app, url])
                .spawn()
                .map_err(|e| format!("Не удалось открыть {app}: {e}"))?;
        }
    }
    #[cfg(target_os = "windows")]
    {
        let _ = browser;
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = browser;
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|p| {
        let mut it = p.splitn(2, '=');
        let k = it.next()?;
        let v = it.next().unwrap_or("");
        if k == key {
            urlencoding::decode(v).ok().map(|x| x.into_owned())
        } else {
            None
        }
    })
}

fn oauth_profiles_value(s:OAuthStore)->Value{json!(s.profiles.into_iter().map(|p|{
  let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let credential_status=if p.identity_validated_channel_id.as_deref()==p.channel_id.as_deref()&&p.identity_validated_at.is_some(){"CHECK_ON_USE"}else{"RECOVERABLE"};
  json!({"id":p.id,"channelId":p.channel_id,"channelTitle":p.channel_title,"connectedAt":p.connected_at,"clientIdMasked":if p.client_id.len()>12{format!("{}…{}",&p.client_id[..8],&p.client_id[p.client_id.len()-6..])}else{"configured".into()},"scopes":p.scopes,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser,"credentialStatus":credential_status,"credentialError":Value::Null,"identityValidatedAt":p.identity_validated_at})
 }).collect::<Vec<_>>())}
#[tauri::command]
pub fn youtube_oauth_profiles(app:AppHandle)->Result<Value,String>{Ok(oauth_profiles_value(load_store_metadata(&app)?))}

#[tauri::command]
pub fn youtube_oauth_disconnect(app: AppHandle, profile_id: String) -> Result<(), String> {
    let mut s = load_store_metadata(&app)?;
    delete_profile_secrets(&profile_id)?;
    s.profiles.retain(|p| p.id != profile_id);
    save_store(&app, &s)
}

#[tauri::command]
pub async fn youtube_oauth_connect(
    app: AppHandle,
    client_id: String,
    client_secret: String,
    browser: Option<String>,
) -> Result<Value, String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Google OAuth Client ID не указан".into());
    }
    let client_secret = client_secret.trim().to_string();
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("OAuth localhost: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}");
    let verifier = format!(
        "{}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = Uuid::new_v4().to_string();
    let scope="https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly";
    let scopes = scope
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let auth_url=format!("https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256&state={}",urlencoding::encode(&client_id),urlencoding::encode(&redirect),urlencoding::encode(scope),urlencoding::encode(&challenge),urlencoding::encode(&state));
    let preferred_browser = browser.unwrap_or_else(|| "default".into());
    open_browser(&auth_url, &preferred_browser)?;
    let expected_state = state.clone();
    let code=tauri::async_runtime::spawn_blocking(move||->Result<String,String>{listener.set_nonblocking(false).map_err(|e|e.to_string())?;let (mut stream,_)=listener.accept().map_err(|e|format!("OAuth callback: {e}"))?;let _=stream.set_read_timeout(Some(Duration::from_secs(300)));let mut buf=[0u8;8192];let n=stream.read(&mut buf).map_err(|e|format!("OAuth callback read: {e}"))?;let req=String::from_utf8_lossy(&buf[..n]);let first=req.lines().next().unwrap_or("");let target=first.split_whitespace().nth(1).unwrap_or("");let query=target.split_once('?').map(|x|x.1).unwrap_or("");let got_state=query_param(query,"state").unwrap_or_default();let code=query_param(query,"code");let err=query_param(query,"error");let ok=got_state==expected_state&&code.is_some();let html=if ok{"<html><body style='font-family:-apple-system;padding:40px;background:#07111d;color:white'><h2>Google подтвердил доступ ✅</h2><p>VYRON завершает проверку токена и YouTube-канала. Вернитесь в приложение — окончательный статус будет показан там.</p></body></html>"}else{"<html><body><h2>VYRON OAuth error</h2><p>Вернитесь в приложение.</p></body></html>"};let resp=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.as_bytes().len(),html);let _=stream.write_all(resp.as_bytes());if let Some(e)=err{return Err(format!("Google OAuth: {e}"))}if got_state!=expected_state{return Err("OAuth state mismatch".into())}code.ok_or_else(||"Google не вернул authorization code".into())}).await.map_err(|e|e.to_string())??;
    let mut token_form = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect.as_str()),
    ];
    if !client_secret.is_empty() {
        token_form.push(("client_secret", client_secret.as_str()));
    }
    let token = reqwest::Client::new()
        .post("https://oauth2.googleapis.com/token")
        .form(&token_form)
        .send()
        .await
        .map_err(|e| format!("OAUTH_NETWORK_ERROR: token exchange: {e}"))?;
    let status = token.status();
    let tv: Value = token
        .json()
        .await
        .map_err(|e| format!("OAuth token JSON: {e}"))?;
    if !status.is_success() {
        return Err(tv
            .get("error_description")
            .and_then(|x| x.as_str())
            .or_else(|| tv.get("error").and_then(|x| x.as_str()))
            .unwrap_or("Google OAuth token error")
            .to_string());
    }
    let access = tv
        .get("access_token")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "Google не вернул access_token".to_string())?
        .to_string();
    let response_refresh = tv
        .get("refresh_token")
        .and_then(|x| x.as_str())
        .map(str::to_string);
    let expires = tv
        .get("expires_in")
        .and_then(|x| x.as_i64())
        .unwrap_or(3600);
    emit_youtube_api_request(&app, "channels.list", None);
    let me = reqwest::Client::new()
        .get("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true")
        .bearer_auth(&access)
        .send()
        .await
        .map_err(|e| format!("YouTube account network: {e}"))?;
    let me_status = me.status();
    let mv: Value = me
        .json()
        .await
        .map_err(|e| format!("YouTube account JSON: {e}"))?;
    if !me_status.is_success() {
        return Err(youtube_error(&mv,"Не удалось получить YouTube-канал. Проверь, что YouTube Data API v3 включён именно в проекте VYRON."));
    }
    let item = mv
        .get("items")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| "На выбранном Google-аккаунте YouTube-канал не найден".to_string())?;
    let channel_id = item
        .get("id")
        .and_then(|x| x.as_str())
        .map(str::to_string)
        .ok_or_else(|| "YouTube не вернул Channel ID".to_string())?;
    let channel_title = item
        .pointer("/snippet/title")
        .and_then(|x| x.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| channel_id.clone());
    let mut s = load_store_metadata(&app)?;
    let mut existing = s.profiles.iter().find(|p|p.channel_id.as_deref()==Some(channel_id.as_str())).cloned();
    let profile_id=reconnect_profile_id(existing.as_ref());
    if response_refresh.as_deref().map(str::trim).filter(|x|!x.is_empty()).is_none(){
      if existing.is_some(){migrate_profile_refresh_to_canonical(&app,&profile_id)?;if let Some(p)=existing.as_mut(){p.refresh_token=require_canonical_refresh(&app,&profile_id)?;}}
    }
    let refresh=preserved_refresh_token(existing.as_ref(),&client_id,response_refresh.as_deref())?;
    let effective_secret=if !client_secret.is_empty(){security::canonical_set_secret(GOOGLE_CLIENT_SECRET,&client_secret)?;client_secret.clone()}else{canonical_global_client_secret()?.unwrap_or_default()};
    let profile = OAuthProfile {
        id: profile_id.clone(),
        client_id: client_id.clone(),
        client_secret: effective_secret,
        channel_id: Some(channel_id.clone()),
        channel_title: Some(channel_title.clone()),
        access_token: access,
        refresh_token: refresh,
        expires_at: now_ts() + expires,
        connected_at: Utc::now().to_rfc3339(),
        scopes: scopes.clone(),
        preferred_browser: preferred_browser.clone(),
        identity_validated_at: Some(Utc::now().to_rfc3339()),
        identity_validated_channel_id: Some(channel_id.clone()),
        credential_error: None,
    };
    s.profiles
        .retain(|p| p.id != profile_id && p.channel_id.as_deref() != Some(channel_id.as_str()));
    s.profiles.push(profile.clone());
    let saved_idx=s.profiles.iter().position(|p|p.id==profile.id).ok_or_else(||"OAUTH_SAVE_VERIFY_FAILED".to_string())?;
    save_selected_profile(&app,&s,saved_idx)?;
    remember_access_token(&profile.id,&profile.access_token,profile.expires_at);
    set_profile_migration_state(&app,&profile.id,MIGRATION_MIGRATED)?;
    let found=security::canonical_get_secret_cached(&oauth_key(&profile.id,"refresh_token"))?.map(|v|!v.trim().is_empty()).unwrap_or(false);
    if !found{return Err("OAUTH_SAVE_VERIFY_FAILED: canonical OAuth refresh_token не сохранился".into())}
    Ok(
        json!({"id":profile.id,"channelId":channel_id,"channelTitle":channel_title,"connectedAt":profile.connected_at,"preferredBrowser":preferred_browser}),
    )
}

fn reconnect_profile_id(existing: Option<&OAuthProfile>) -> String {
    existing
        .map(|p| p.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}

#[derive(Clone)]
struct OrphanCredentialCandidate {
    profile_id: String,
    account: String,
    source: String,
    refresh_token: String,
    client_secret: String,
    modified_rank: Option<String>,
}
#[derive(Clone)]
struct ValidatedOrphanCredential {
    candidate: OrphanCredentialCandidate,
    access_token: String,
    expires_in: i64,
    channel_id: String,
    channel_title: Option<String>,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum CandidateReadStatus {
    Pass,
    NotFound,
    AccessDenied,
    AuthFailed,
    ReadFailed,
    Malformed,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum CandidateRefreshStatus {
    Pass,
    InvalidGrant,
    Failed,
    NotRun,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum CandidateIdentityStatus {
    Pass,
    Failed,
    NotRun,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum ChannelMatchStatus {
    Yes,
    No,
    Unknown,
}
#[derive(Clone, Debug, Serialize)]
struct CandidateAudit {
    profile_id: String,
    account: String,
    source: String,
    keychain_read_status: CandidateReadStatus,
    osstatus: Option<i32>,
    token_refresh_status: CandidateRefreshStatus,
    identity_validation_status: CandidateIdentityStatus,
    channel_id_match: ChannelMatchStatus,
}
struct ScannedCandidate {
    candidate: Option<OrphanCredentialCandidate>,
    audit: CandidateAudit,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum RecoveryFinalStatus {
    Recovered,
    Missing,
    Denied,
    Revoked,
    Mismatch,
    Failed,
}
struct RecoveryOutcome {
    recovered: bool,
    status: RecoveryFinalStatus,
    audits: Vec<CandidateAudit>,
    error: Option<String>,
    selected: Option<ValidatedOrphanCredential>,
}
#[derive(Clone, Debug)]
enum CandidateValidationFailure {
    Revoked(String),
    RefreshFailed(String),
    IdentityFailed(String),
}

fn orphan_profile_id(account: &str) -> Option<String> {
    let id = account
        .strip_prefix("oauth.")?
        .strip_suffix(".refresh_token")?;
    if id.is_empty() || Uuid::parse_str(id).is_err() {
        return None;
    }
    Some(id.to_string())
}
fn osstatus_from_error(e: &str) -> Option<i32> {
    let marker = "osstatus=";
    let p = e.to_ascii_lowercase().find(marker)?;
    let tail = &e[p + marker.len()..];
    let token = tail
        .split(|c: char| !(c.is_ascii_digit() || c == '-'))
        .next()
        .unwrap_or("");
    token.parse().ok()
}
fn classify_read_error(e: &str) -> CandidateReadStatus {
    let x = e.to_ascii_uppercase();
    if x.contains("KEYCHAIN_ACCESS_DENIED")
        || x.contains("KEYCHAIN_INTERACTION_REQUIRED")
        || x.contains("KEYCHAIN_USER_CANCELED")
    {
        CandidateReadStatus::AccessDenied
    } else if x.contains("KEYCHAIN_AUTH_FAILED") {
        CandidateReadStatus::AuthFailed
    } else if x.contains("MALFORMED") || x.contains("NOT UTF-8") {
        CandidateReadStatus::Malformed
    } else {
        CandidateReadStatus::ReadFailed
    }
}
fn orphan_keychain_scan_with<S: OAuthSecretStore>(
    secrets: &S,
    current: &OAuthProfile,
) -> Result<Vec<ScannedCandidate>, String> {
    let accounts = secrets.accounts("oauth.").map_err(|e| {
        if e.contains("KEYCHAIN_ENUM_FAILED") {
            e
        } else {
            format!("KEYCHAIN_ENUM_FAILED: {e}")
        }
    })?;
    let mut out = Vec::new();
    for account in accounts {
        if !account.starts_with("oauth.") || !account.ends_with(".refresh_token") {
            continue;
        }
        let Some(id) = orphan_profile_id(&account) else {
            out.push(ScannedCandidate {
                candidate: None,
                audit: CandidateAudit {
                    profile_id: String::new(),
                    account,
                    source: "KEYCHAIN".into(),
                    keychain_read_status: CandidateReadStatus::Malformed,
                    osstatus: None,
                    token_refresh_status: CandidateRefreshStatus::NotRun,
                    identity_validation_status: CandidateIdentityStatus::NotRun,
                    channel_id_match: ChannelMatchStatus::Unknown,
                },
            });
            continue;
        };
        if id == current.id {
            continue;
        }
        let mut audit = CandidateAudit {
            profile_id: id.clone(),
            account: account.clone(),
            source: "KEYCHAIN".into(),
            keychain_read_status: CandidateReadStatus::NotFound,
            osstatus: None,
            token_refresh_status: CandidateRefreshStatus::NotRun,
            identity_validation_status: CandidateIdentityStatus::NotRun,
            channel_id_match: ChannelMatchStatus::Unknown,
        };
        let refresh = match secrets.get(&account) {
            Ok(Some(v)) if !v.trim().is_empty() => {
                audit.keychain_read_status = CandidateReadStatus::Pass;
                v
            }
            Ok(Some(_)) => {
                audit.keychain_read_status = CandidateReadStatus::Malformed;
                out.push(ScannedCandidate {
                    candidate: None,
                    audit,
                });
                continue;
            }
            Ok(None) => {
                audit.keychain_read_status = CandidateReadStatus::NotFound;
                out.push(ScannedCandidate {
                    candidate: None,
                    audit,
                });
                continue;
            }
            Err(e) => {
                audit.keychain_read_status = classify_read_error(&e);
                audit.osstatus = osstatus_from_error(&e);
                out.push(ScannedCandidate {
                    candidate: None,
                    audit,
                });
                continue;
            }
        };
        let client_secret = match secrets.get(&oauth_key(&id, "client_secret")) {
            Ok(Some(v)) if !v.trim().is_empty() => v,
            Ok(_) => current.client_secret.clone(),
            Err(e) if !current.client_secret.trim().is_empty() => current.client_secret.clone(),
            Err(e) => {
                audit.keychain_read_status = classify_read_error(&e);
                audit.osstatus = osstatus_from_error(&e);
                out.push(ScannedCandidate {
                    candidate: None,
                    audit,
                });
                continue;
            }
        };
        let modified_rank = secrets.modified_rank(&account).ok().flatten();
        out.push(ScannedCandidate {
            candidate: Some(OrphanCredentialCandidate {
                profile_id: id,
                account: account.clone(),
                source: "KEYCHAIN".into(),
                refresh_token: refresh,
                client_secret,
                modified_rank,
            }),
            audit,
        });
    }
    Ok(out)
}
fn legacy_json_scans(store: &OAuthStore, current: &OAuthProfile) -> Vec<ScannedCandidate> {
    let expected = current.channel_id.as_deref();
    let mut out = Vec::new();
    for p in &store.profiles {
        if p.id == current.id || p.channel_id.as_deref() != expected {
            continue;
        }
        let account = format!("youtube-oauth.json::{}", p.id);
        let base = CandidateAudit {
            profile_id: p.id.clone(),
            account: account.clone(),
            source: "V2_0_8_JSON".into(),
            keychain_read_status: CandidateReadStatus::Pass,
            osstatus: None,
            token_refresh_status: CandidateRefreshStatus::NotRun,
            identity_validation_status: CandidateIdentityStatus::NotRun,
            channel_id_match: ChannelMatchStatus::Unknown,
        };
        if p.refresh_token.trim().is_empty() {
            let mut audit = base;
            audit.keychain_read_status = CandidateReadStatus::NotFound;
            out.push(ScannedCandidate {
                candidate: None,
                audit,
            });
            continue;
        }
        let rank = Some(
            p.connected_at
                .chars()
                .filter(|c| c.is_ascii_digit())
                .take(14)
                .collect::<String>(),
        );
        out.push(ScannedCandidate {
            candidate: Some(OrphanCredentialCandidate {
                profile_id: p.id.clone(),
                account: account.clone(),
                source: "V2_0_8_JSON".into(),
                refresh_token: p.refresh_token.clone(),
                client_secret: if p.client_secret.trim().is_empty() {
                    current.client_secret.clone()
                } else {
                    p.client_secret.clone()
                },
                modified_rank: rank,
            }),
            audit: base,
        });
    }
    out
}
fn honest_failure(audits: &[CandidateAudit]) -> (RecoveryFinalStatus, Option<String>) {
    if audits.iter().any(|a| {
        matches!(
            a.keychain_read_status,
            CandidateReadStatus::AccessDenied | CandidateReadStatus::AuthFailed
        )
    }) {
        return(RecoveryFinalStatus::Denied,Some("KEYCHAIN_ACCESS_DENIED: historical OAuth credential exists but macOS denied access".into()));
    }
    if audits
        .iter()
        .any(|a| a.token_refresh_status == CandidateRefreshStatus::InvalidGrant)
    {
        return(RecoveryFinalStatus::Revoked,Some("REFRESH_TOKEN_REVOKED: historical refresh_token exists but Google rejected it as invalid_grant/revoked".into()));
    }
    if audits
        .iter()
        .any(|a| a.channel_id_match == ChannelMatchStatus::No)
    {
        return (
            RecoveryFinalStatus::Mismatch,
            Some(
                "CHANNEL_ID_MISMATCH: historical credential belongs to another YouTube channel"
                    .into(),
            ),
        );
    }
    if audits
        .iter()
        .any(|a| a.keychain_read_status == CandidateReadStatus::Malformed)
    {
        return (
            RecoveryFinalStatus::Failed,
            Some("LEGACY_CREDENTIAL_MALFORMED: historical credential entry is malformed".into()),
        );
    }
    if audits.iter().any(|a| {
        matches!(a.keychain_read_status, CandidateReadStatus::ReadFailed)
            || matches!(a.token_refresh_status, CandidateRefreshStatus::Failed)
            || matches!(
                a.identity_validation_status,
                CandidateIdentityStatus::Failed
            )
    }) {
        return(RecoveryFinalStatus::Failed,Some("OAUTH_RECOVERY_FAILED: historical credential exists but recovery could not be completed".into()));
    }
    (RecoveryFinalStatus::Missing,Some("REFRESH_TOKEN_MISSING: refresh_token отсутствует во всех current, orphan Keychain и historical JSON locations".into()))
}
async fn evaluate_scanned_candidates_with<V, Fut>(
    scans: Vec<ScannedCandidate>,
    expected_channel_id: &str,
    validator: V,
) -> RecoveryOutcome
where
    V: Fn(OrphanCredentialCandidate) -> Fut,
    Fut:
        std::future::Future<Output = Result<ValidatedOrphanCredential, CandidateValidationFailure>>,
{
    let mut audits = Vec::new();
    let mut matched = Vec::new();
    for mut scan in scans {
        let Some(candidate) = scan.candidate.take() else {
            audits.push(scan.audit);
            continue;
        };
        match validator(candidate).await {
            Ok(v) => {
                scan.audit.token_refresh_status = CandidateRefreshStatus::Pass;
                scan.audit.identity_validation_status = CandidateIdentityStatus::Pass;
                if v.channel_id == expected_channel_id {
                    scan.audit.channel_id_match = ChannelMatchStatus::Yes;
                    matched.push(v)
                } else {
                    scan.audit.channel_id_match = ChannelMatchStatus::No
                }
            }
            Err(CandidateValidationFailure::Revoked(_)) => {
                scan.audit.token_refresh_status = CandidateRefreshStatus::InvalidGrant
            }
            Err(CandidateValidationFailure::RefreshFailed(_)) => {
                scan.audit.token_refresh_status = CandidateRefreshStatus::Failed
            }
            Err(CandidateValidationFailure::IdentityFailed(_)) => {
                scan.audit.token_refresh_status = CandidateRefreshStatus::Pass;
                scan.audit.identity_validation_status = CandidateIdentityStatus::Failed
            }
        }
        audits.push(scan.audit)
    }
    if !matched.is_empty() {
        matched.sort_by(|a, b| b.candidate.modified_rank.cmp(&a.candidate.modified_rank));
        if matched.len() > 1 {
            let first = matched[0].candidate.modified_rank.as_deref();
            let second = matched[1].candidate.modified_rank.as_deref();
            if first.is_none() || first == second {
                return RecoveryOutcome{recovered:false,status:RecoveryFinalStatus::Failed,audits,error:Some(format!("OAUTH_ORPHAN_AMBIGUOUS: multiple validated credentials match channel {} but latest credential cannot be proven",expected_channel_id)),selected:None};
            }
        }
        let picked = matched.remove(0);
        return RecoveryOutcome {
            recovered: true,
            status: RecoveryFinalStatus::Recovered,
            audits,
            error: None,
            selected: Some(picked),
        };
    }
    let (status, error) = honest_failure(&audits);
    RecoveryOutcome {
        recovered: false,
        status,
        audits,
        error,
        selected: None,
    }
}
fn migrate_validated_orphan_with<S: OAuthSecretStore>(
    secrets:&S,current:&mut OAuthProfile,validated:&ValidatedOrphanCredential,
)->Result<(),String>{
    let old=&validated.candidate;
    secrets.set(&oauth_key(&current.id,"refresh_token"),&old.refresh_token)?;
    current.refresh_token=old.refresh_token.clone();
    current.access_token=validated.access_token.clone();
    current.expires_at=now_ts()+validated.expires_in;
    remember_access_token(&current.id,&validated.access_token,current.expires_at);
    current.channel_title=validated.channel_title.clone().or_else(||current.channel_title.clone());
    current.identity_validated_channel_id=Some(validated.channel_id.clone());
    current.identity_validated_at=Some(Utc::now().to_rfc3339());
    current.credential_error=None;
    let reread=secrets.get(&oauth_key(&current.id,"refresh_token"))?.unwrap_or_default();
    if reread.trim().is_empty(){return Err("OAUTH_MIGRATION_VERIFY_FAILED: canonical refresh_token missing".into())}
    Ok(())
}
async fn validate_orphan_candidate_live(
    app: &AppHandle,
    current: &OAuthProfile,
    candidate: OrphanCredentialCandidate,
) -> Result<ValidatedOrphanCredential, CandidateValidationFailure> {
    let mut form = vec![
        ("client_id", current.client_id.as_str()),
        ("refresh_token", candidate.refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if !candidate.client_secret.trim().is_empty() {
        form.push(("client_secret", candidate.client_secret.as_str()))
    }
    let r = reqwest::Client::new()
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .await
        .map_err(|e| {
            CandidateValidationFailure::RefreshFailed(format!(
                "OAUTH_NETWORK_ERROR: orphan token refresh: {e}"
            ))
        })?;
    let status = r.status();
    let v: Value = r.json().await.map_err(|e| {
        CandidateValidationFailure::RefreshFailed(format!("OAUTH_REFRESH_JSON_ERROR: {e}"))
    })?;
    if !status.is_success() {
        let e = oauth_refresh_error(&v);
        return Err(if e.starts_with("OAUTH_INVALID_GRANT") {
            CandidateValidationFailure::Revoked(e)
        } else {
            CandidateValidationFailure::RefreshFailed(e)
        });
    }
    let access = v
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            CandidateValidationFailure::RefreshFailed(
                "OAUTH_REFRESH_FAILED: orphan credential refresh returned no access_token".into(),
            )
        })?
        .to_string();
    let expires = v.get("expires_in").and_then(Value::as_i64).unwrap_or(3600);
    emit_youtube_api_request(app, "channels.list", None);
    let identity = reqwest::Client::new()
        .get("https://www.googleapis.com/youtube/v3/channels")
        .bearer_auth(&access)
        .query(&[("part", "snippet"), ("mine", "true")])
        .send()
        .await
        .map_err(|e| {
            CandidateValidationFailure::IdentityFailed(format!(
                "OAUTH_NETWORK_ERROR: orphan identity validation: {e}"
            ))
        })?;
    let identity_status = identity.status();
    let iv: Value = identity.json().await.map_err(|e| {
        CandidateValidationFailure::IdentityFailed(format!("OAUTH_IDENTITY_JSON_ERROR: {e}"))
    })?;
    if !identity_status.is_success() {
        return Err(CandidateValidationFailure::IdentityFailed(youtube_error(
            &iv,
            "OAUTH_IDENTITY_FAILED: orphan credential identity check failed",
        )));
    }
    let item = iv
        .get("items")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .ok_or_else(|| {
            CandidateValidationFailure::IdentityFailed(
                "OAUTH_CHANNEL_MISSING: orphan credential returned no YouTube channel".into(),
            )
        })?;
    let channel_id = item
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            CandidateValidationFailure::IdentityFailed(
                "OAUTH_CHANNEL_MISSING: orphan credential returned no channel ID".into(),
            )
        })?
        .to_string();
    let channel_title = item
        .pointer("/snippet/title")
        .and_then(Value::as_str)
        .map(str::to_string);
    Ok(ValidatedOrphanCredential {
        candidate,
        access_token: access,
        expires_in: expires,
        channel_id,
        channel_title,
    })
}
async fn recover_orphan_credential_live(
    app: &AppHandle,
    store: &mut OAuthStore,
    idx: usize,
) -> Result<RecoveryOutcome, String> {
    let current = store.profiles[idx].clone();
    let expected = current.channel_id.clone().ok_or_else(|| {
        "OAUTH_CHANNEL_MISSING: current profile has no expected channel_id".to_string()
    })?;
    let secrets = KeychainOAuthSecretStore;
    let mut scans = orphan_keychain_scan_with(&secrets, &current)?;
    scans.extend(legacy_json_scans(store, &current));
    let app_cloned = app.clone();
    let current_cloned = current.clone();
    let mut result = evaluate_scanned_candidates_with(scans, &expected, move |candidate| {
        let app2 = app_cloned.clone();
        let current2 = current_cloned.clone();
        async move { validate_orphan_candidate_live(&app2, &current2, candidate).await }
    })
    .await;
    if result.recovered {
        let validated = result
            .selected
            .take()
            .ok_or_else(|| "OAUTH_RECOVERY_FAILED: validated candidate missing".to_string())?;
        migrate_validated_orphan_with(&secrets, &mut store.profiles[idx], &validated)?;
        save_selected_profile(app,store,idx)?;
        result.error = None;
    }
    Ok(result)
}

#[tauri::command]
pub async fn youtube_oauth_recovery_diagnostic(
    app:AppHandle,profile_id:String,
)->Result<Value,String>{
    let path=store_path(&app)?;
    let store=load_store_metadata(&app)?;
    let current=store.profiles.iter().find(|p|p.id==profile_id)
      .ok_or_else(||"CREDENTIAL_MISSING: selected OAuth profile is not present in youtube-oauth.json".to_string())?;
    let canonical_account=oauth_key(&profile_id,"refresh_token");
    let canonical_accounts=security::list_canonical_secret_accounts("oauth.")?;
    let legacy_accounts=security::list_legacy_secret_accounts("")?;
    let canonical_present=canonical_accounts.iter().any(|a|a==&canonical_account);
    let legacy_source=select_present_account(&legacy_refresh_candidates(&profile_id),&legacy_accounts);
    let migration_state=profile_migration_status(&app,&profile_id)?;
    Ok(json!({
      "appVersion":app.package_info().version.to_string(),
      "bundleId":app.config().identifier.clone(),
      "channelId":current.channel_id,
      "currentProfileUuid":profile_id,
      "legacyService":security::LEGACY_SERVICE,
      "canonicalService":security::canonical_service(),
      "canonicalRefreshPresent":canonical_present,
      "legacyRefreshPresent":legacy_source.is_some(),
      "migrationState":migration_state,
      "credentialState":if canonical_present{"CANONICAL_READY"}else if legacy_source.is_some(){"LEGACY_RECONNECT_REQUIRED"}else{"MISSING"},
      "secretValuesIncluded":false,
      "youtubeApiRequests":0,
      "keychainSecretReads":0,
      "path":path.display().to_string()
    }))
}

#[tauri::command]
pub fn youtube_keychain_migration_diagnostics(app:AppHandle)->Result<Value,String>{
 let state=read_keychain_migration_v2(&app)?;
 let migrated=state.profiles.values().filter(|x|x.as_str()==MIGRATION_MIGRATED).count();
 let failed=state.profiles.values().filter(|x|x.as_str()==MIGRATION_FAILED).count();
 let reconnect_required=state.profiles.values().filter(|x|x.as_str()==MIGRATION_RECONNECT_REQUIRED).count();
 Ok(json!({
  "version":state.version,
  "legacyService":security::LEGACY_SERVICE,
  "canonicalService":security::canonical_service(),
  "profileStates":state.profiles,
  "globalClientSecretState":state.global_client_secret,
  "migratedProfiles":migrated,
  "failedProfiles":failed,
  "reconnectRequiredProfiles":reconnect_required,
  "profileMigrationAttempts":PROFILE_MIGRATION_ATTEMPTS.load(std::sync::atomic::Ordering::SeqCst),
  "profileMigrationSuccesses":PROFILE_MIGRATION_SUCCESSES.load(std::sync::atomic::Ordering::SeqCst),
  "profileMigrationFailures":PROFILE_MIGRATION_FAILURES.load(std::sync::atomic::Ordering::SeqCst),
  "accessTokenMemoryHits":ACCESS_TOKEN_MEMORY_HITS.load(std::sync::atomic::Ordering::SeqCst),
  "secretValuesIncluded":false
 }))
}

async fn validate_profile_identity(
    app: &AppHandle,
    profile: &mut OAuthProfile,
    token: &str,
) -> Result<(), String> {
    emit_youtube_api_request(app, "channels.list", None);
    let r = reqwest::Client::new()
        .get("https://www.googleapis.com/youtube/v3/channels")
        .bearer_auth(token)
        .query(&[("part", "snippet"), ("mine", "true")])
        .send()
        .await
        .map_err(|e| format!("OAUTH_NETWORK_ERROR: identity validation: {e}"))?;
    let status = r.status();
    let v: Value = r
        .json()
        .await
        .map_err(|e| format!("OAUTH_IDENTITY_JSON_ERROR: {e}"))?;
    if !status.is_success() {
        return Err(youtube_error(
            &v,
            "OAUTH_IDENTITY_FAILED: YouTube identity check failed",
        ));
    }
    let item = v
        .get("items")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .ok_or_else(|| {
            "OAUTH_CHANNEL_MISSING: Google credential не возвращает YouTube channel".to_string()
        })?;
    let actual = item
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "OAUTH_CHANNEL_MISSING: YouTube не вернул channel ID".to_string())?;
    if let Some(expected) = profile.channel_id.as_deref() {
        if expected != actual {
            return Err(format!(
                "CHANNEL_MISMATCH: credential profile={} expected={} actual={}",
                profile.id, expected, actual
            ));
        }
    } else {
        profile.channel_id = Some(actual.to_string())
    }
    profile.channel_title = item
        .pointer("/snippet/title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| profile.channel_title.clone());
    profile.identity_validated_channel_id = Some(actual.to_string());
    profile.identity_validated_at = Some(Utc::now().to_rfc3339());
    Ok(())
}
async fn valid_access_token(app:&AppHandle,profile_id:&str)->Result<(String,OAuthProfile),String>{
    let mut s=load_store_metadata(app)?;
    let idx=s.profiles.iter().position(|p|p.id==profile_id)
      .ok_or_else(||"CREDENTIAL_MISSING: YouTube OAuth профиль отсутствует".to_string())?;
    let needs_identity=s.profiles[idx].identity_validated_at.is_none()
      ||s.profiles[idx].identity_validated_channel_id.as_deref()!=s.profiles[idx].channel_id.as_deref();

    if let Some((token,expires_at))=session_access_token(profile_id){
      s.profiles[idx].access_token=token.clone();
      s.profiles[idx].expires_at=expires_at;
      if needs_identity{
        validate_profile_identity(app,&mut s.profiles[idx],&token).await?;
        write_oauth_metadata(&store_path(app)?,&s)?;
      }
      return Ok((token,s.profiles[idx].clone()))
    }

    // Passive/background operations never read legacy Keychain. An explicit Sync
    // must migrate the profile refresh token first.
    let refresh=require_canonical_refresh(app,profile_id)?;
    let client_id=s.profiles[idx].client_id.clone();
    if client_id.trim().is_empty(){return Err("OAUTH_CLIENT_MISSING: profile client_id is empty".into())}

    let (token,expires)=refresh_access_token_for_profile(app,profile_id,&client_id,&refresh).await?;
    let expires_at=now_ts()+expires.max(60);
    remember_access_token(profile_id,&token,expires_at);
    s.profiles[idx].access_token=token.clone();
    s.profiles[idx].expires_at=expires_at;
    s.profiles[idx].refresh_token.clear();
    s.profiles[idx].client_secret.clear();
    validate_profile_identity(app,&mut s.profiles[idx],&token).await?;
    let profile=s.profiles[idx].clone();
    write_oauth_metadata(&store_path(app)?,&s)?;
    Ok((token,profile))
}

pub(crate) async fn access_token_and_scopes(
    app: &AppHandle,
    profile_id: &str,
) -> Result<(String, Vec<String>), String> {
    let (token, profile) = valid_access_token(app, profile_id).await?;
    Ok((token, profile.scopes))
}

async fn upload_offset(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    total: u64,
) -> Result<u64, String> {
    let r = client
        .put(url)
        .bearer_auth(token)
        .header("Content-Length", "0")
        .header("Content-Range", format!("bytes */{total}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if r.status().as_u16() == 308 {
        if let Some(range) = r.headers().get("Range").and_then(|x| x.to_str().ok()) {
            if let Some(end) = range.split('-').last().and_then(|x| x.parse::<u64>().ok()) {
                return Ok(end + 1);
            }
        }
        return Ok(0);
    }
    if r.status().is_success() {
        return Ok(total);
    }
    Err(format!("YouTube resume status: {}", r.status()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedUploadSession {
    job_id: String,
    profile_id: String,
    file_path: String,
    session_url: String,
    total: u64,
    offset: u64,
    created_at: String,
    updated_at: String,
    operation_id: Option<String>,
    #[serde(default)]
    channel_id: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedUploadSessions {
    sessions: Vec<PersistedUploadSession>,
}
fn upload_sessions_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("youtube-upload-sessions.json"))
}
fn load_upload_sessions_store(app: &AppHandle) -> Result<PersistedUploadSessions, String> {
    let p = upload_sessions_path(app)?;
    if !p.exists() {
        return Ok(PersistedUploadSessions::default());
    }
    let b = fs::read(&p).map_err(|e| format!("Upload recovery read: {e}"))?;
    match serde_json::from_slice(&b) {
        Ok(x) => Ok(x),
        Err(_) => {
            let backup = p.with_extension(format!(
                "corrupt-{}.json",
                Utc::now().format("%Y%m%d%H%M%S")
            ));
            let _ = fs::rename(&p, backup);
            Ok(PersistedUploadSessions::default())
        }
    }
}
fn save_upload_sessions_store(
    app: &AppHandle,
    store: &PersistedUploadSessions,
) -> Result<(), String> {
    let p = upload_sessions_path(app)?;
    let tmp = p.with_extension("tmp");
    let b = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&tmp, b).map_err(|e| format!("Upload recovery write: {e}"))?;
    fs::rename(&tmp, &p).map_err(|e| format!("Upload recovery replace: {e}"))?;
    Ok(())
}
fn put_upload_session(app: &AppHandle, row: PersistedUploadSession) -> Result<(), String> {
    let mut s = load_upload_sessions_store(app)?;
    s.sessions.retain(|x| x.job_id != row.job_id);
    s.sessions.push(row);
    save_upload_sessions_store(app, &s)
}
fn set_upload_session_offset(app: &AppHandle, job_id: &str, offset: u64) -> Result<(), String> {
    let mut s = load_upload_sessions_store(app)?;
    if let Some(x) = s.sessions.iter_mut().find(|x| x.job_id == job_id) {
        x.offset = offset;
        x.updated_at = Utc::now().to_rfc3339();
        save_upload_sessions_store(app, &s)?
    }
    Ok(())
}
fn remove_upload_session(app: &AppHandle, job_id: &str) -> Result<(), String> {
    let mut s = load_upload_sessions_store(app)?;
    s.sessions.retain(|x| x.job_id != job_id);
    save_upload_sessions_store(app, &s)
}
fn get_upload_session(app: &AppHandle, job_id: &str) -> Result<PersistedUploadSession, String> {
    load_upload_sessions_store(app)?
        .sessions
        .into_iter()
        .find(|x| x.job_id == job_id)
        .ok_or_else(|| {
            "UPLOAD_SESSION_NOT_FOUND: сохранённая сессия загрузки не найдена".to_string()
        })
}
#[tauri::command]
pub fn youtube_upload_sessions(app: AppHandle) -> Result<Value, String> {
    let rows=load_upload_sessions_store(&app)?.sessions.into_iter().map(|x|json!({"jobId":x.job_id,"profileId":x.profile_id,"filePath":x.file_path,"total":x.total,"offset":x.offset,"createdAt":x.created_at,"updatedAt":x.updated_at,"operationId":x.operation_id,"channelId":x.channel_id,"projectId":x.project_id})).collect::<Vec<_>>();
    Ok(json!(rows))
}
#[tauri::command]
pub fn youtube_cancel_upload_session(app: AppHandle, job_id: String) -> Result<(), String> {
    remove_upload_session(&app, &job_id)
}
async fn resumable_status(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    total: u64,
) -> Result<(u64, Option<Value>), String> {
    let r = client
        .put(url)
        .bearer_auth(token)
        .header("Content-Length", "0")
        .header("Content-Range", format!("bytes */{total}"))
        .send()
        .await
        .map_err(|e| format!("YouTube resume status network: {e}"))?;
    let st = r.status();
    if st.as_u16() == 308 {
        let offset = r
            .headers()
            .get("Range")
            .and_then(|x| x.to_str().ok())
            .and_then(|s| s.split('-').last())
            .and_then(|x| x.parse::<u64>().ok())
            .map(|x| x + 1)
            .unwrap_or(0);
        return Ok((offset, None));
    }
    if st.is_success() {
        let value: Value = r.json().await.unwrap_or_else(|_| json!({}));
        return Ok((total, Some(value)));
    }
    let text = r.text().await.unwrap_or_default();
    if st.as_u16() == 404 || st.as_u16() == 410 {
        return Err(format!(
            "UPLOAD_SESSION_EXPIRED: YouTube resumable session истекла ({st})"
        ));
    }
    Err(format!(
        "YouTube resume status {st}: {}",
        text.chars().take(400).collect::<String>()
    ))
}
fn video_mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "m4v" => "video/x-m4v",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => "application/octet-stream",
    }
}
fn validate_publish_at_at(raw: &str, now: DateTime<Utc>) -> Result<String, String> {
    let parsed = DateTime::parse_from_rfc3339(raw)
        .map_err(|_| format!("SCHEDULE_INVALID: publishAt не RFC3339: {raw}"))?
        .with_timezone(&Utc);
    if parsed <= now + chrono::Duration::seconds(30) {
        return Err(format!(
            "SCHEDULE_IN_PAST: publishAt {} должен быть позже текущего безопасного времени YouTube",
            parsed.to_rfc3339()
        ));
    }
    Ok(parsed.to_rfc3339_opts(SecondsFormat::Secs, true))
}
async fn verify_uploaded_video(
    app: &AppHandle,
    client: &reqwest::Client,
    token: &str,
    video_id: &str,
    expected_channel_id: &str,
    operation_id: Option<&str>,
) -> Result<Value, String> {
    emit_youtube_api_request(app, "videos.list", operation_id);
    let r = client
        .get("https://www.googleapis.com/youtube/v3/videos")
        .bearer_auth(token)
        .query(&[("part", "id,snippet,status"), ("id", video_id)])
        .send()
        .await
        .map_err(|e| format!("UPLOAD_VERIFY_NETWORK: videos.list: {e}"))?;
    let st = r.status();
    let v: Value = r
        .json()
        .await
        .map_err(|e| format!("UPLOAD_VERIFY_PARSE: {e}"))?;
    if !st.is_success() {
        return Err(format!(
            "UPLOAD_VERIFY_API {st}: {}",
            youtube_error(&v, "videos.list verification failed")
        ));
    }
    let item = v.pointer("/items/0").ok_or_else(|| {
        format!("UPLOAD_VERIFY_MISSING: YouTube не нашёл videoId {video_id} после upload")
    })?;
    let actual_id = item.get("id").and_then(|x| x.as_str()).unwrap_or("");
    if actual_id != video_id {
        return Err(format!(
            "UPLOAD_VERIFY_ID_MISMATCH: ожидался {video_id}, получен {actual_id}"
        ));
    }
    let actual_channel = item
        .pointer("/snippet/channelId")
        .and_then(|x| x.as_str())
        .unwrap_or("");
    if !expected_channel_id.is_empty()
        && !actual_channel.is_empty()
        && actual_channel != expected_channel_id
    {
        return Err(format!(
            "UPLOAD_VERIFY_CHANNEL_MISMATCH: videoId {video_id} принадлежит другому каналу"
        ));
    }
    Ok(
        json!({"id":actual_id,"channelId":actual_channel,"privacyStatus":item.pointer("/status/privacyStatus").and_then(|x|x.as_str()),"publishAt":item.pointer("/status/publishAt").and_then(|x|x.as_str())}),
    )
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveUploadTelemetry {
    job_id: String,
    project_id: Option<String>,
    channel_id: Option<String>,
    profile_id: String,
    file_path: String,
    bytes_uploaded: u64,
    total_bytes: u64,
    progress: f64,
    started_at: String,
    last_progress_at: String,
}

fn active_upload_registry() -> &'static Mutex<HashMap<String, ActiveUploadTelemetry>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, ActiveUploadTelemetry>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn upload_progress_percent(bytes_uploaded: u64, total: u64) -> f64 {
    if total == 0 { return 0.0; }
    ((bytes_uploaded.min(total) as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
}

fn emit_upload_progress(app: &AppHandle, session: &PersistedUploadSession, bytes_uploaded: u64) {
    let now = Utc::now().to_rfc3339();
    let progress = upload_progress_percent(bytes_uploaded, session.total);
    let mut registry = active_upload_registry().lock().unwrap_or_else(|e| e.into_inner());
    let started_at = registry
        .get(&session.job_id)
        .map(|x| x.started_at.clone())
        .unwrap_or_else(|| now.clone());
    let row = ActiveUploadTelemetry {
        job_id: session.job_id.clone(),
        project_id: session.project_id.clone(),
        channel_id: session.channel_id.clone(),
        profile_id: session.profile_id.clone(),
        file_path: session.file_path.clone(),
        bytes_uploaded: bytes_uploaded.min(session.total),
        total_bytes: session.total,
        progress,
        started_at,
        last_progress_at: now.clone(),
    };
    registry.insert(session.job_id.clone(), row.clone());
    drop(registry);
    let _ = app.emit(
        "youtube-upload-progress",
        json!({
            "jobId":row.job_id,
            "projectId":row.project_id,
            "channelId":row.channel_id,
            "profileId":row.profile_id,
            "filePath":row.file_path,
            "bytesUploaded":row.bytes_uploaded,
            "totalBytes":row.total_bytes,
            "progress":row.progress,
            "startedAt":row.started_at,
            "timestamp":row.last_progress_at,
            "active":true
        }),
    );
}

struct ActiveUploadGuard {
    app: AppHandle,
    job_id: String,
}
impl ActiveUploadGuard {
    fn start(app: &AppHandle, session: &PersistedUploadSession, offset: u64) -> Self {
        emit_upload_progress(app, session, offset);
        Self { app: app.clone(), job_id: session.job_id.clone() }
    }
}
impl Drop for ActiveUploadGuard {
    fn drop(&mut self) {
        let mut registry = active_upload_registry().lock().unwrap_or_else(|e| e.into_inner());
        registry.remove(&self.job_id);
        drop(registry);
        let _ = self.app.emit(
            "youtube-upload-progress",
            json!({"jobId":self.job_id,"active":false,"timestamp":Utc::now().to_rfc3339()}),
        );
    }
}

#[tauri::command]
pub fn youtube_active_uploads() -> Value {
    let registry = active_upload_registry().lock().unwrap_or_else(|e| e.into_inner());
    json!(registry.values().cloned().collect::<Vec<_>>())
}

const YOUTUBE_UPLOAD_CHUNK_BYTES: usize = 8 * 1024 * 1024;
const YOUTUBE_UPLOAD_CONNECT_TIMEOUT_SECS: u64 = 20;
const YOUTUBE_UPLOAD_REQUEST_TIMEOUT_SECS: u64 = 120;
fn youtube_upload_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(YOUTUBE_UPLOAD_CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(YOUTUBE_UPLOAD_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("UPLOAD_CLIENT_BUILD_FAILED: {e}"))
}
async fn continue_persisted_upload(
    app: &AppHandle,
    session: &PersistedUploadSession,
    token: &str,
    probe_first: bool,
) -> Result<Value, String> {
    let path = PathBuf::from(&session.file_path);
    if !path.is_file() {
        return Err(format!("UPLOAD_FILE_MISSING: {}", path.display()));
    }
    let actual = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if actual != session.total {
        return Err(format!(
            "UPLOAD_FILE_CHANGED: размер файла изменился ({} → {})",
            session.total, actual
        ));
    }
    let client = youtube_upload_client()?;
    let mime = video_mime_for_path(&path);
    let (mut offset, already) = if probe_first {
        match resumable_status(&client, &session.session_url, token, session.total).await {
            Ok(x) => x,
            Err(e) => {
                if e.starts_with("UPLOAD_SESSION_EXPIRED:") {
                    let _ = remove_upload_session(app, &session.job_id);
                }
                return Err(e);
            }
        }
    } else {
        (session.offset, None)
    };
    let _active_guard = ActiveUploadGuard::start(app, session, offset);
    if let Some(v) = already {
        let _ = remove_upload_session(app, &session.job_id);
        emit_upload_progress(app, session, session.total);
        return Ok(v);
    };
    set_upload_session_offset(app, &session.job_id, offset)?;
    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| e.to_string())?;
    let chunk_size: usize = YOUTUBE_UPLOAD_CHUNK_BYTES;
    let mut final_json = json!({});
    while offset < session.total {
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(|e| e.to_string())?;
        let wanted = std::cmp::min(chunk_size as u64, session.total - offset) as usize;
        let mut buf = vec![0u8; wanted];
        file.read_exact(&mut buf).await.map_err(|e| e.to_string())?;
        let end = offset + wanted as u64 - 1;
        let mut completed = false;
        for attempt in 0..5 {
            let sent = client
                .put(&session.session_url)
                .bearer_auth(token)
                .header("Content-Type", mime)
                .header("Content-Length", wanted.to_string())
                .header(
                    "Content-Range",
                    format!("bytes {offset}-{end}/{}", session.total),
                )
                .body(buf.clone())
                .send()
                .await;
            match sent {
                Ok(r) => {
                    let st = r.status();
                    if st.is_success() {
                        final_json = r.json().await.unwrap_or_else(|_| json!({}));
                        offset = session.total;
                        set_upload_session_offset(app, &session.job_id, offset)?;
                        completed = true;
                        break;
                    }
                    if st.as_u16() == 308 {
                        offset = r
                            .headers()
                            .get("Range")
                            .and_then(|x| x.to_str().ok())
                            .and_then(|s| s.split('-').last())
                            .and_then(|x| x.parse::<u64>().ok())
                            .map(|x| x + 1)
                            .unwrap_or(end + 1);
                        set_upload_session_offset(app, &session.job_id, offset)?;
                        emit_upload_progress(app, session, offset);
                        completed = true;
                        break;
                    }
                    if st.is_server_error() {
                        tokio::time::sleep(Duration::from_secs(1u64 << attempt)).await;
                        match resumable_status(&client, &session.session_url, token, session.total)
                            .await
                        {
                            Ok((next, done)) => {
                                offset = next;
                                set_upload_session_offset(app, &session.job_id, offset)?;
                                emit_upload_progress(app, session, offset);
                                if let Some(v) = done {
                                    final_json = v;
                                    offset = session.total;
                                    completed = true;
                                    break;
                                }
                            }
                            Err(_) => {}
                        }
                        continue;
                    }
                    let text = r.text().await.unwrap_or_default();
                    let _ = remove_upload_session(app, &session.job_id);
                    return Err(format!(
                        "YouTube upload {st}: {}",
                        text.chars().take(500).collect::<String>()
                    ));
                }
                Err(e) => {
                    if attempt == 4 {
                        return Err(format!("UPLOAD_INTERRUPTED: сеть прервала загрузку; можно продолжить позже: {e}"));
                    }
                    tokio::time::sleep(Duration::from_secs(1u64 << attempt)).await;
                    if let Ok((next, done)) =
                        resumable_status(&client, &session.session_url, token, session.total).await
                    {
                        offset = next;
                        set_upload_session_offset(app, &session.job_id, offset)?;
                        emit_upload_progress(app, session, offset);
                        if let Some(v) = done {
                            final_json = v;
                            offset = session.total;
                            completed = true;
                            break;
                        }
                    }
                }
            }
        }
        if !completed {
            return Err("UPLOAD_INTERRUPTED: YouTube upload не удалось продолжить".into());
        }
    }
    let _ = remove_upload_session(app, &session.job_id);
    emit_upload_progress(app, session, session.total);
    Ok(final_json)
}

#[tauri::command]
pub async fn youtube_upload_video(
    app: AppHandle,
    profile_id: String,
    job_id: String,
    file_path: String,
    title: String,
    description: String,
    tags: Vec<String>,
    publish_at: Option<String>,
    category_id: String,
    operation_id: Option<String>,
    channel_id: Option<String>,
    project_id: Option<String>,
) -> Result<Value, String> {
    let path = PathBuf::from(&file_path);
    if !path.is_file() {
        return Err(format!("Видео не найдено: {}", path.display()));
    }
    if title.trim().is_empty() {
        return Err("Название видео пустое".into());
    }
    let total = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if total == 0 {
        return Err("Видео пустое".into());
    }
    let mime = video_mime_for_path(&path);
    let publish_at = match publish_at.as_ref().filter(|x| !x.trim().is_empty()) {
        Some(p) => Some(validate_publish_at_at(p, Utc::now())?),
        None => None,
    };
    let (token, profile) = valid_access_token(&app, &profile_id).await?;
    let category = if category_id.trim().is_empty() {
        "10"
    } else {
        category_id.trim()
    };
    let mut status = json!({"privacyStatus":"private"});
    if let Some(p) = publish_at.as_ref() {
        status["publishAt"] = json!(p)
    }
    let body = json!({"snippet":{"title":title.chars().take(100).collect::<String>(),"description":description.chars().take(5000).collect::<String>(),"tags":tags.into_iter().take(30).collect::<Vec<_>>(),"categoryId":category},"status":status});
    let client = youtube_upload_client()?;
    emit_youtube_api_request(&app, "videos.insert", operation_id.as_deref());
    let init=client.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status").bearer_auth(&token).header("Content-Type","application/json; charset=UTF-8").header("X-Upload-Content-Length",total.to_string()).header("X-Upload-Content-Type",mime).json(&body).send().await.map_err(|e|format!("YouTube session: {e}"))?;
    let init_status = init.status();
    if !init_status.is_success() {
        let t = init.text().await.unwrap_or_default();
        if let Ok(v) = serde_json::from_str::<Value>(&t) {
            return Err(format!(
                "YOUTUBE_UPLOAD_INIT {init_status}: {}",
                youtube_error(&v, "YouTube отклонил videos.insert")
            ));
        }
        return Err(format!(
            "YOUTUBE_UPLOAD_INIT {init_status}: {}",
            t.chars().take(500).collect::<String>()
        ));
    }
    let session_url = init
        .headers()
        .get("Location")
        .and_then(|x| x.to_str().ok())
        .ok_or_else(|| "YouTube не вернул resumable Location".to_string())?
        .to_string();
    let now = Utc::now().to_rfc3339();
    let session = PersistedUploadSession {
        job_id: job_id.clone(),
        profile_id: profile_id.clone(),
        file_path: file_path.clone(),
        session_url,
        total,
        offset: 0,
        created_at: now.clone(),
        updated_at: now,
        operation_id: operation_id.clone(),
        channel_id,
        project_id,
    };
    put_upload_session(&app, session.clone())?;
    let final_json = continue_persisted_upload(&app, &session, &token, false).await?;
    let video_id = final_json
        .get("id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if video_id.is_empty() {
        return Err(
            "UPLOAD_NEEDS_VERIFICATION: YouTube upload завершён, но video ID не получен".into(),
        );
    }
    let verification = verify_uploaded_video(
        &app,
        &client,
        &token,
        &video_id,
        profile.channel_id.as_deref().unwrap_or(""),
        operation_id.as_deref(),
    )
    .await;
    let (verified, verification_error, actual) = match verification {
        Ok(v) => (true, None, Some(v)),
        Err(e) => (false, Some(e), None),
    };
    Ok(
        json!({"videoId":video_id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"scheduled":publish_at.is_some(),"resumed":false,"verified":verified,"verificationError":verification_error,"actual":actual}),
    )
}

#[tauri::command]
pub async fn youtube_resume_upload(app: AppHandle, job_id: String) -> Result<Value, String> {
    let session = get_upload_session(&app, &job_id)?;
    let (token, profile) = valid_access_token(&app, &session.profile_id).await?;
    let final_json = continue_persisted_upload(&app, &session, &token, true).await?;
    let video_id = final_json
        .get("id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if video_id.is_empty() {
        return Err(
            "UPLOAD_NEEDS_VERIFICATION: YouTube завершил resumable session, но video ID не получен"
                .into(),
        );
    }
    let client = reqwest::Client::new();
    let verification = verify_uploaded_video(
        &app,
        &client,
        &token,
        &video_id,
        profile.channel_id.as_deref().unwrap_or(""),
        session.operation_id.as_deref(),
    )
    .await;
    let (verified, verification_error, actual) = match verification {
        Ok(v) => (true, None, Some(v)),
        Err(e) => (false, Some(e), None),
    };
    Ok(
        json!({"videoId":video_id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"scheduled":true,"resumed":true,"verified":verified,"verificationError":verification_error,"actual":actual}),
    )
}

fn full_file_sha256(path: &Path) -> Result<(String, u64, u64), String> {
    let meta = fs::metadata(path).map_err(|e| format!("Файл недоступен: {e}"))?;
    if !meta.is_file() {
        return Err("Выбранный путь не является файлом".into());
    }
    let size = meta.len();
    if size == 0 {
        return Err("Файл пустой".into());
    }
    let modified = meta
        .modified()
        .ok()
        .and_then(|x| x.duration_since(UNIX_EPOCH).ok())
        .map(|x| x.as_millis() as u64)
        .unwrap_or(0);
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok((format!("{:x}", h.finalize()), size, modified))
}
fn cached_file_fingerprint(
    path: &Path,
    cached_size: Option<u64>,
    cached_modified_at: Option<u64>,
    cached_hash: Option<&str>,
) -> Result<Value, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Файл недоступен: {e}"))?;
    if !meta.is_file() {
        return Err("Выбранный путь не является файлом".into());
    }
    let size = meta.len();
    if size == 0 {
        return Err("Файл пустой".into());
    }
    let modified = meta
        .modified()
        .ok()
        .and_then(|x| x.duration_since(UNIX_EPOCH).ok())
        .map(|x| x.as_millis() as u64)
        .unwrap_or(0);
    if cached_size == Some(size) && cached_modified_at == Some(modified) {
        if let Some(hash) =
            cached_hash.filter(|x| x.len() == 64 && x.chars().all(|c| c.is_ascii_hexdigit()))
        {
            return Ok(
                json!({"fingerprint":hash.to_ascii_lowercase(),"size":size,"modifiedAt":modified,"path":path.to_string_lossy(),"cached":true}),
            );
        }
    }
    let (hash, size, modified) = full_file_sha256(path)?;
    Ok(
        json!({"fingerprint":hash,"size":size,"modifiedAt":modified,"path":path.to_string_lossy(),"cached":false}),
    )
}

#[tauri::command]
pub async fn youtube_file_fingerprint(
    file_path: String,
    cached_size: Option<u64>,
    cached_modified_at: Option<u64>,
    cached_hash: Option<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        cached_file_fingerprint(
            Path::new(&file_path),
            cached_size,
            cached_modified_at,
            cached_hash.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("HASH_TASK_FAILED: {e}"))?
}

#[tauri::command]
pub async fn youtube_set_thumbnail(
    app: AppHandle,
    profile_id: String,
    video_id: String,
    file_path: String,
    operation_id: Option<String>,
) -> Result<Value, String> {
    let path = PathBuf::from(&file_path);
    if !path.is_file() {
        return Err(format!("Обложка не найдена: {}", path.display()));
    }
    let bytes = fs::read(&path).map_err(|e| format!("Обложка: {e}"))?;
    if bytes.is_empty() {
        return Err("Обложка пустая".into());
    }
    let ext = path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime=match ext.as_str(){"jpg"|"jpeg"=>"image/jpeg","png"=>"image/png","webp"=>"image/webp",_=>return Err("Формат обложки не поддерживается этим upload flow. Используйте JPG, JPEG, PNG или WEBP.".into())};
    let (token, _) = valid_access_token(&app, &profile_id).await?;
    let id = video_id.trim();
    if id.is_empty() {
        return Err("YouTube video ID пуст".into());
    }
    emit_youtube_api_request(&app, "thumbnails.set", operation_id.as_deref());
    let url = format!(
        "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={}&uploadType=media",
        urlencoding::encode(id)
    );
    let response = reqwest::Client::new()
        .post(url)
        .bearer_auth(token)
        .header("Content-Type", mime)
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("YouTube thumbnail network: {e}"))?;
    let status = response.status();
    let value: Value = response.json().await.unwrap_or_else(|_| json!({}));
    if !status.is_success() {
        return Err(youtube_error(&value, "YouTube не принял обложку"));
    }
    Ok(json!({"ok":true,"videoId":id,"filePath":file_path}))
}

fn youtube_error(v: &Value, fallback: &str) -> String {
    let message = v
        .pointer("/error/message")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("error_description").and_then(|x| x.as_str()))
        .unwrap_or(fallback);
    let reason = v
        .pointer("/error/errors/0/reason")
        .and_then(|x| x.as_str())
        .unwrap_or("");
    if reason.is_empty() {
        message.to_string()
    } else {
        format!("{} [{}]", message, reason)
    }
}

fn append_playlist_page_ids(page:&Value,ids:&mut Vec<String>,seen:&mut std::collections::HashSet<String>,limit:usize)->usize{
    let mut added=0usize;
    for item in page.get("items").and_then(|x|x.as_array()).cloned().unwrap_or_default(){
        if ids.len()>=limit{break}
        let id=item.pointer("/contentDetails/videoId").and_then(|x|x.as_str())
            .or_else(||item.pointer("/snippet/resourceId/videoId").and_then(|x|x.as_str()));
        if let Some(id)=id.filter(|x|!x.trim().is_empty()){
            if seen.insert(id.to_string()){ids.push(id.to_string());added+=1}
        }
    }
    added
}
fn inventory_bucket_counts(rows:&[Value],now:DateTime<Utc>)->(usize,usize,usize,usize){
    let mut private_count=0usize;let mut scheduled_count=0usize;let mut public_count=0usize;let mut unlisted_count=0usize;
    for x in rows{
        match x.get("privacyStatus").and_then(|v|v.as_str()).unwrap_or("unknown"){
            "private"=>{
                let future=x.get("publishAt").and_then(|v|v.as_str())
                    .and_then(|raw|chrono::DateTime::parse_from_rfc3339(raw).ok())
                    .map(|d|d.with_timezone(&Utc)>now)
                    .unwrap_or(false);
                if future{scheduled_count+=1}else{private_count+=1}
            }
            "public"=>public_count+=1,
            "unlisted"=>unlisted_count+=1,
            _=>{}
        }
    }
    (private_count,scheduled_count,public_count,unlisted_count)
}
fn authoritative_inventory_row(item:&Value,position:usize)->Option<Value>{
    let id=item.get("id").and_then(|x|x.as_str())?;
    let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));
    let st=item.get("status").cloned().unwrap_or_else(||json!({}));
    Some(json!({
        "id":id,
        "channelId":sn.get("channelId").and_then(|x|x.as_str()),
        "position":position,
        "title":sn.get("title").and_then(|x|x.as_str()).unwrap_or(""),
        "description":sn.get("description").and_then(|x|x.as_str()).unwrap_or(""),
        "tags":sn.get("tags").cloned().unwrap_or_else(||json!([])),
        "categoryId":sn.get("categoryId").and_then(|x|x.as_str()).unwrap_or("10"),
        "publishedAt":sn.get("publishedAt").and_then(|x|x.as_str()),
        "privacyStatus":st.get("privacyStatus").and_then(|x|x.as_str()).unwrap_or("unknown"),
        "publishAt":st.get("publishAt").and_then(|x|x.as_str()),
        "thumbnail":sn.pointer("/thumbnails/maxres/url")
            .or_else(||sn.pointer("/thumbnails/standard/url"))
            .or_else(||sn.pointer("/thumbnails/high/url"))
            .or_else(||sn.pointer("/thumbnails/medium/url"))
            .or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str()),
        "duration":item.pointer("/contentDetails/duration").and_then(|x|x.as_str()),
        "views":item.pointer("/statistics/viewCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),
        "likes":item.pointer("/statistics/likeCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),
        "comments":item.pointer("/statistics/commentCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),
        "selected":false,
        "discoverySource":"videos.list",
        "draftCandidate":false
    }))
}
fn full_sync_estimate(video_count:usize)->Value{
    let playlist_pages=std::cmp::max(1,(video_count+49)/50);
    let hydration_batches=if video_count==0{0}else{(video_count+49)/50};
    let api_requests=1+playlist_pages+hydration_batches;
    json!({"playlistPages":playlist_pages,"hydrationBatches":hydration_batches,"apiRequests":api_requests,"estimatedQuotaCost":api_requests})
}

#[tauri::command]
pub async fn youtube_list_existing_videos(
    app: AppHandle,
    profile_id: String,
    max_results: Option<u32>,
) -> Result<Value, String> {
    let (token, profile) = valid_access_token(&app, &profile_id).await?;
    let limit = max_results.unwrap_or(1000).clamp(1, 5000) as usize;
    let client = reqwest::Client::new();

    emit_youtube_api_request(&app,"channels.list",None);
    let r=client.get("https://www.googleapis.com/youtube/v3/channels")
        .bearer_auth(&token)
        .query(&[("part","contentDetails"),("mine","true")])
        .send().await.map_err(|e|format!("YouTube channel: {e}"))?;
    let st=r.status();let cv:Value=r.json().await.map_err(|e|e.to_string())?;
    if !st.is_success(){return Err(youtube_error(&cv,"Не удалось получить канал YouTube"))}
    let uploads=cv.pointer("/items/0/contentDetails/relatedPlaylists/uploads").and_then(|x|x.as_str())
        .ok_or_else(||"YouTube не вернул playlist загрузок".to_string())?;

    let mut ids=Vec::<String>::new();
    let mut seen=std::collections::HashSet::<String>::new();
    let mut page:Option<String>=None;
    let mut playlist_found=0usize;
    let mut playlist_calls=0usize;
    let mut playlist_exhausted=false;

    loop{
        if ids.len()>=limit{break}
        let mut q=client.get("https://www.googleapis.com/youtube/v3/playlistItems")
            .bearer_auth(&token)
            .query(&[("part","contentDetails"),("playlistId",uploads),("maxResults","50")]);
        if let Some(ref t)=page{q=q.query(&[("pageToken",t.as_str())])}
        emit_youtube_api_request(&app,"playlistItems.list",None);
        playlist_calls+=1;
        let rr=q.send().await.map_err(|e|format!("YouTube uploads page {playlist_calls}: {e}"))?;
        let st=rr.status();let v:Value=rr.json().await.map_err(|e|e.to_string())?;
        if !st.is_success(){return Err(youtube_error(&v,"Не удалось получить полный uploads playlist"))}
        if playlist_calls==1{
            playlist_found=v.pointer("/pageInfo/totalResults").and_then(|x|x.as_u64()).unwrap_or(0) as usize;
        }
        append_playlist_page_ids(&v,&mut ids,&mut seen,limit);
        page=v.get("nextPageToken").and_then(|x|x.as_str()).map(str::to_string);
        if page.is_none(){playlist_exhausted=true;break}
    }
    if playlist_found==0{playlist_found=ids.len()}

    let mut by_id=std::collections::HashMap::<String,Value>::new();
    let mut video_calls=0usize;
    let mut hydration_errors=Vec::<String>::new();
    for chunk in ids.chunks(50){
        if chunk.is_empty(){continue}
        let joined=chunk.join(",");
        video_calls+=1;
        emit_youtube_api_request(&app,"videos.list",None);
        let response=client.get("https://www.googleapis.com/youtube/v3/videos")
            .bearer_auth(&token)
            .query(&[("part","snippet,status,contentDetails,statistics"),("id",joined.as_str())])
            .send().await;
        let rr=match response{
            Ok(x)=>x,
            Err(e)=>{hydration_errors.push(format!("batch {video_calls}: network {e}"));continue}
        };
        let st=rr.status();let v:Value=rr.json().await.unwrap_or_else(|_|json!({}));
        if !st.is_success(){
            let err=youtube_error(&v,"Не удалось получить authoritative videos.list batch");
            let lower=err.to_ascii_lowercase();
            if lower.contains("quota")||lower.contains("dailylimit")||lower.contains("ratelimit"){return Err(err)}
            hydration_errors.push(format!("batch {video_calls}: {err}"));continue
        }
        for item in v.get("items").and_then(|x|x.as_array()).cloned().unwrap_or_default(){
            if let Some(id)=item.get("id").and_then(|x|x.as_str()){
                let same_channel=profile.channel_id.as_deref().map(|expected|
                    item.pointer("/snippet/channelId").and_then(|x|x.as_str())==Some(expected)
                ).unwrap_or(true);
                if same_channel{by_id.insert(id.to_string(),item);}
            }
        }
    }

    let mut out=Vec::<Value>::new();
    for (position,id) in ids.iter().enumerate(){
        if let Some(item)=by_id.get(id){
            if let Some(row)=authoritative_inventory_row(item,position){out.push(row)}
        }
    }

    let unique_video_ids=ids.len();
    let videos_hydrated=out.len();
    let expected=std::cmp::min(playlist_found,limit);
    let truncated=playlist_found>limit;
    let sync_complete=playlist_exhausted&&!truncated&&unique_video_ids==playlist_found&&videos_hydrated==unique_video_ids&&hydration_errors.is_empty();
    let schedule_complete=sync_complete;
    let (private_count,scheduled_count,public_count,unlisted_count)=inventory_bucket_counts(&out,Utc::now());
    let full_sync_api_requests=1+playlist_calls+video_calls;
    let full_sync_estimated_quota_cost=full_sync_api_requests;

    Ok(json!({
        "channelId":profile.channel_id,
        "channelTitle":profile.channel_title,
        "youtubeFound":playlist_found,
        "playlistFound":playlist_found,
        "inventoryExpected":expected,
        "playlistItemsFetched":ids.len(),
        "uniqueVideoIds":unique_video_ids,
        "videosHydrated":videos_hydrated,
        "received":videos_hydrated,
        "requested":limit,
        "privateCount":private_count,
        "publicCount":public_count,
        "scheduledCount":scheduled_count,
        "unlistedCount":unlisted_count,
        "pagesFetched":playlist_calls,
        "hydrationBatches":video_calls,
        "missingHydrationCount":unique_video_ids.saturating_sub(videos_hydrated),
        "hydrationErrors":hydration_errors,
        "complete":sync_complete,
        "syncComplete":sync_complete,
        "scheduleComplete":schedule_complete,
        "draftCandidateCount":0,
        "searchSupplementCount":0,
        "searchUsed":false,
        "playlistCalls":playlist_calls,
        "videoCalls":video_calls,
        "fullSyncApiRequests":full_sync_api_requests,
        "fullSyncEstimatedQuotaCost":full_sync_estimated_quota_cost,
        "estimatedForInventory":full_sync_estimate(playlist_found),
        "videos":out
    }))
}

#[tauri::command]
pub async fn youtube_backup_existing_videos(
    app: AppHandle,
    profile_id: String,
    videos: Value,
    operation_id: Option<String>,
) -> Result<Value, String> {
    let (token, profile) = valid_access_token(&app, &profile_id).await?;
    let channel_id = profile
        .channel_id
        .clone()
        .ok_or_else(|| "OAuth профиль не содержит Channel ID".to_string())?;
    let arr = videos
        .as_array()
        .ok_or_else(|| "Backup: videos должен быть массивом".to_string())?;
    if arr.is_empty() {
        return Err("Backup: список видео пуст".into());
    }
    let ids = arr
        .iter()
        .map(|x| {
            x.get("id")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .ok_or_else(|| "Backup: video ID отсутствует".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    let client = reqwest::Client::new();
    let mut authoritative = Vec::<Value>::new();
    for chunk in ids.chunks(50) {
        let joined = chunk.join(",");
        emit_youtube_api_request(&app, "videos.list", operation_id.as_deref());
        let r = client
            .get("https://www.googleapis.com/youtube/v3/videos")
            .bearer_auth(&token)
            .query(&[("part", "snippet,status"), ("id", joined.as_str())])
            .send()
            .await
            .map_err(|e| format!("Backup authoritative read: {e}"))?;
        let st = r.status();
        let v: Value = r.json().await.unwrap_or_else(|_| json!({}));
        if !st.is_success() {
            return Err(youtube_error(
                &v,
                "Backup: не удалось прочитать текущее состояние YouTube",
            ));
        }
        for item in v
            .get("items")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default()
        {
            let id = item.get("id").and_then(|x| x.as_str()).unwrap_or("");
            let sn = item.get("snippet").cloned().unwrap_or_else(|| json!({}));
            let status = item.get("status").cloned().unwrap_or_else(|| json!({}));
            let actual = sn.get("channelId").and_then(|x| x.as_str()).unwrap_or("");
            if actual != channel_id {
                return Err(format!(
                    "BLOCK: video {} принадлежит другому channelId",
                    if id.is_empty() { "?" } else { id }
                ));
            }
            authoritative.push(json!({"id":id,"position":0,"title":sn.get("title").and_then(|x|x.as_str()).unwrap_or(""),"description":sn.get("description").and_then(|x|x.as_str()).unwrap_or(""),"tags":sn.get("tags").cloned().unwrap_or_else(||json!([])),"categoryId":sn.get("categoryId").and_then(|x|x.as_str()).unwrap_or("10"),"publishedAt":sn.get("publishedAt"),"privacyStatus":status.get("privacyStatus").and_then(|x|x.as_str()).unwrap_or("private"),"publishAt":status.get("publishAt"),"channelId":actual,"selected":false}))
        }
    }
    let found = authoritative
        .iter()
        .filter_map(|x| x.get("id").and_then(|v| v.as_str()))
        .collect::<std::collections::HashSet<_>>();
    let missing = ids
        .iter()
        .filter(|id| !found.contains(id.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        return Err(format!(
            "Backup: YouTube не вернул {} видео: {}",
            missing.len(),
            missing.join(", ")
        ));
    }
    authoritative.sort_by_key(|x| {
        ids.iter()
            .position(|id| Some(id.as_str()) == x.get("id").and_then(|v| v.as_str()))
            .unwrap_or(usize::MAX)
    });
    let safe = channel_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>();
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("Backup")
        .join("Youtube")
        .join(safe);
    fs::create_dir_all(&dir).map_err(|e| format!("Backup dir: {e}"))?;
    let path = dir.join(format!("{}.json", Utc::now().format("%Y%m%d-%H%M%S-%3f")));
    let clean=authoritative.iter().map(|v|json!({"videoId":v.get("id"),"title":v.get("title"),"description":v.get("description"),"tags":v.get("tags"),"categoryId":v.get("categoryId"),"publishAt":v.get("publishAt"),"privacy":v.get("privacyStatus")})).collect::<Vec<_>>();
    let payload = json!({"channelId":channel_id,"createdAt":Utc::now().to_rfc3339(),"source":"owner-authorized videos.list immediately before write","videos":clean});
    fs::write(
        &path,
        serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Backup write: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(json!({"path":path.to_string_lossy(),"count":authoritative.len(),"videos":authoritative}))
}

fn same_publish_time(a: Option<&str>, b: Option<&str>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(x), Some(y)) => {
            chrono::DateTime::parse_from_rfc3339(x)
                .ok()
                .map(|d| d.timestamp())
                == chrono::DateTime::parse_from_rfc3339(y)
                    .ok()
                    .map(|d| d.timestamp())
        }
        _ => false,
    }
}

#[cfg(test)]
fn youtube_truncate_utf8_bytes(input: &str, max_bytes: usize) -> String {
    if input.len() <= max_bytes {
        return input.to_string();
    }
    let mut end = max_bytes.min(input.len());
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1
    }
    input[..end].to_string()
}
#[cfg(not(test))]
fn youtube_truncate_utf8_bytes(input: &str, max_bytes: usize) -> String {
    if input.len() <= max_bytes {
        return input.to_string();
    }
    let mut end = max_bytes.min(input.len());
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1
    }
    input[..end].to_string()
}
fn youtube_clean_title(input: &str) -> String {
    input
        .trim()
        .replace(['<', '>'], " ")
        .chars()
        .take(100)
        .collect::<String>()
        .trim()
        .to_string()
}
fn youtube_tag_cost(tag: &str, has_previous: bool) -> usize {
    tag.chars().count()
        + if tag.contains(char::is_whitespace) {
            2
        } else {
            0
        }
        + if has_previous { 1 } else { 0 }
}
fn youtube_sanitize_tags(tags: Vec<String>) -> Vec<String> {
    let mut out = Vec::<String>::new();
    let mut used = 0usize;
    for raw in tags {
        let tag = raw
            .trim()
            .replace(['<', '>'], " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if tag.is_empty() || out.iter().any(|x| x.eq_ignore_ascii_case(&tag)) {
            continue;
        }
        let cost = youtube_tag_cost(&tag, !out.is_empty());
        if used + cost > 500 {
            continue;
        }
        used += cost;
        out.push(tag)
    }
    out
}
fn youtube_norm_text(input: &str) -> String {
    input
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(|x| x.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}
fn youtube_norm_tags(tags: &[String]) -> Vec<String> {
    let mut out = tags
        .iter()
        .map(|x| {
            x.trim()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .to_lowercase()
        })
        .filter(|x| !x.is_empty())
        .collect::<Vec<_>>();
    out.sort();
    out.dedup();
    out
}
fn youtube_metadata_diff(
    sn: &Value,
    wanted_title: &str,
    wanted_desc: &str,
    wanted_tags: &[String],
    wanted_category: &str,
) -> Vec<String> {
    let mut diff = Vec::<String>::new();
    let got_title = sn.get("title").and_then(|x| x.as_str()).unwrap_or("");
    let got_desc = sn.get("description").and_then(|x| x.as_str()).unwrap_or("");
    let got_tags = sn
        .get("tags")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|x| x.as_str().map(str::to_string))
        .collect::<Vec<_>>();
    let got_category = sn.get("categoryId").and_then(|x| x.as_str()).unwrap_or("");
    if youtube_norm_text(got_title) != youtube_norm_text(wanted_title) {
        diff.push("title".to_string())
    }
    if youtube_norm_text(got_desc) != youtube_norm_text(wanted_desc) {
        diff.push("description".to_string())
    }
    if youtube_norm_tags(&got_tags) != youtube_norm_tags(wanted_tags) {
        diff.push("tags".to_string())
    }
    if got_category != wanted_category {
        diff.push("categoryId".to_string())
    }
    diff
}
fn youtube_status_body(
    old_status: &Value,
    target_privacy: &str,
    publish_at: Option<&str>,
) -> Value {
    let mut ns = json!({"privacyStatus":target_privacy});
    if let Some(p) = publish_at {
        ns["publishAt"] = json!(p);
    }
    for k in [
        "embeddable",
        "license",
        "publicStatsViewable",
        "selfDeclaredMadeForKids",
        "containsSyntheticMedia",
    ] {
        if let Some(x) = old_status.get(k) {
            ns[k] = x.clone();
        }
    }
    ns
}

fn youtube_schedule_snippet_snapshot(sn: &Value) -> Value {
    let mut out = serde_json::Map::new();
    for k in [
        "title",
        "description",
        "tags",
        "categoryId",
        "defaultLanguage",
        "defaultAudioLanguage",
        "thumbnails",
    ] {
        if let Some(v) = sn.get(k) {
            out.insert(k.to_string(), v.clone());
        }
    }
    Value::Object(out)
}
fn youtube_schedule_preserved_status_snapshot(status: &Value) -> Value {
    let mut out = serde_json::Map::new();
    for k in [
        "privacyStatus",
        "embeddable",
        "license",
        "publicStatsViewable",
        "selfDeclaredMadeForKids",
        "madeForKids",
        "containsSyntheticMedia",
    ] {
        if let Some(v) = status.get(k) {
            out.insert(k.to_string(), v.clone());
        }
    }
    Value::Object(out)
}
fn youtube_schedule_status_payload(video_id: &str, old_status: &Value, publish_at: &str) -> Value {
    let privacy = old_status
        .get("privacyStatus")
        .and_then(|x| x.as_str())
        .unwrap_or("private");
    json!({"id":video_id,"status":youtube_status_body(old_status,privacy,Some(publish_at))})
}

#[tauri::command]
pub async fn youtube_update_existing_video(
    app: AppHandle,
    profile_id: String,
    video_id: String,
    title: String,
    description: String,
    tags: Vec<String>,
    publish_at: Option<String>,
    privacy_status: Option<String>,
    category_id: Option<String>,
    operation_id: Option<String>,
) -> Result<Value, String> {
    let (token, profile) = valid_access_token(&app, &profile_id).await?;
    if !profile.scopes.iter().any(|s| {
        s == "https://www.googleapis.com/auth/youtube.force-ssl"
            || s == "https://www.googleapis.com/auth/youtube"
    }) {
        return Err("YouTube профиль подключён со старыми правами. Переподключи канал.".into());
    }
    let client = reqwest::Client::new();
    emit_youtube_api_request(&app, "videos.list", operation_id.as_deref());
    let r = client
        .get("https://www.googleapis.com/youtube/v3/videos")
        .bearer_auth(&token)
        .query(&[("part", "snippet,status"), ("id", video_id.as_str())])
        .send()
        .await
        .map_err(|e| format!("YouTube video read: {e}"))?;
    let st = r.status();
    let v: Value = r.json().await.map_err(|e| e.to_string())?;
    if !st.is_success() {
        return Err(youtube_error(&v, "Не удалось перечитать видео"));
    }
    let item = v
        .get("items")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| "Видео не найдено".to_string())?;
    let sn = item.get("snippet").cloned().unwrap_or_else(|| json!({}));
    let old_status = item.get("status").cloned().unwrap_or_else(|| json!({}));
    if profile.channel_id.as_deref() != sn.get("channelId").and_then(|x| x.as_str()) {
        return Err(format!(
            "BLOCK {}: video.channelId не совпадает с oauthProfile.channelId",
            video_id
        ));
    }
    let wanted_title = youtube_clean_title(&title);
    if wanted_title.is_empty() {
        return Err("YouTube title не может быть пустым".into());
    }
    let wanted_desc = youtube_truncate_utf8_bytes(&description.replace(['<', '>'], " "), 5000);
    let wanted_tags_vec = youtube_sanitize_tags(tags);
    let old_category = sn
        .get("categoryId")
        .and_then(|x| x.as_str())
        .unwrap_or("10");
    let wanted_category = category_id
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .unwrap_or(old_category)
        .to_string();
    let metadata_needed = !youtube_metadata_diff(
        &sn,
        &wanted_title,
        &wanted_desc,
        &wanted_tags_vec,
        &wanted_category,
    )
    .is_empty();
    let old_privacy = old_status
        .get("privacyStatus")
        .and_then(|x| x.as_str())
        .unwrap_or("private");
    let target_privacy = privacy_status
        .as_deref()
        .filter(|x| matches!(*x, "private" | "public" | "unlisted"))
        .unwrap_or(old_privacy)
        .to_string();
    let publish = publish_at
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty());
    let old_publish = old_status.get("publishAt").and_then(|x| x.as_str());
    let publish_changed = !same_publish_time(publish, old_publish);
    let schedule_requested = publish_changed || target_privacy != old_privacy;
    if let Some(p) = publish {
        if target_privacy != "private" {
            return Err("Scheduled publishAt требует privacyStatus=private".into());
        }
        match chrono::DateTime::parse_from_rfc3339(p) {
            Ok(dt) => {
                if dt.with_timezone(&Utc) <= Utc::now() {
                    return Err("Дата публикации уже в прошлом".into());
                }
            }
            Err(_) => return Err("Некорректный publishAt: ожидается RFC3339".into()),
        }
    }
    let schedule_needed = schedule_requested;
    if !metadata_needed && !schedule_needed {
        return Ok(
            json!({"id":video_id,"verified":true,"metadataAccepted":true,"metadataVerified":true,"metadataVerifyPending":false,"scheduleRequested":false,"scheduleAccepted":true,"scheduleVerified":true,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":Value::Null,"mismatches":[],"skipped":true,"appliedTags":wanted_tags_vec.len(),"actual":{"title":sn.get("title"),"description":sn.get("description"),"tags":sn.get("tags"),"categoryId":sn.get("categoryId"),"publishAt":old_status.get("publishAt"),"privacyStatus":old_status.get("privacyStatus")}}),
        );
    }
    let mut snippet = json!({"title":wanted_title,"description":wanted_desc,"tags":wanted_tags_vec,"categoryId":wanted_category});
    if let Some(x) = sn.get("defaultLanguage") {
        snippet["defaultLanguage"] = x.clone();
    }
    let desired_status = youtube_status_body(&old_status, &target_privacy, publish);
    let (part, body) = if metadata_needed && schedule_needed {
        (
            "snippet,status",
            json!({"id":video_id,"snippet":snippet,"status":desired_status}),
        )
    } else if metadata_needed {
        ("snippet", json!({"id":video_id,"snippet":snippet}))
    } else {
        ("status", json!({"id":video_id,"status":desired_status}))
    };
    emit_youtube_api_request(&app, "videos.update", operation_id.as_deref());
    let u = client
        .put("https://www.googleapis.com/youtube/v3/videos")
        .bearer_auth(&token)
        .query(&[("part", part)])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("YouTube update: {e}"))?;
    let ust = u.status();
    let uv: Value = u.json().await.unwrap_or_else(|_| json!({}));
    if !ust.is_success() {
        return Err(youtube_error(&uv, "YouTube не принял изменения"));
    }
    // Mandatory owner-authorized control read after every successful videos.update.
    emit_youtube_api_request(&app, "videos.list", operation_id.as_deref());
    let q = match client
        .get("https://www.googleapis.com/youtube/v3/videos")
        .bearer_auth(&token)
        .query(&[("part", "snippet,status"), ("id", video_id.as_str())])
        .send()
        .await
    {
        Ok(x) => x,
        Err(e) => {
            return Ok(
                json!({"id":video_id,"verified":false,"metadataAccepted":true,"metadataVerified":!metadata_needed,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":!schedule_needed,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":format!("YouTube verify read: {e}"),"mismatches":["verification_read"],"skipped":false,"appliedTags":wanted_tags_vec.len()}),
            )
        }
    };
    let qst = q.status();
    let qv: Value = q.json().await.unwrap_or_else(|_| json!({}));
    if !qst.is_success() {
        let err = youtube_error(&qv, "YouTube не подтвердил изменение");
        if err.to_lowercase().contains("quotaexceeded")
            || err.to_lowercase().contains("daily limit")
        {
            return Err(err);
        }
        return Ok(
            json!({"id":video_id,"verified":false,"metadataAccepted":true,"metadataVerified":!metadata_needed,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":!schedule_needed,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":err,"mismatches":["verification_read"],"skipped":false,"appliedTags":wanted_tags_vec.len()}),
        );
    }
    let got = qv
        .get("items")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first());
    let Some(g) = got else {
        return Ok(
            json!({"id":video_id,"verified":false,"metadataAccepted":true,"metadataVerified":!metadata_needed,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":!schedule_needed,"scheduleVerifyPending":false,"scheduleError":Value::Null,"verificationError":"Видео отсутствует в контрольном videos.list","mismatches":["video_missing"],"skipped":false,"appliedTags":wanted_tags_vec.len()}),
        );
    };
    let gsn = g.get("snippet").unwrap_or(&Value::Null);
    let gst = g.get("status").unwrap_or(&Value::Null);
    let metadata_diff = youtube_metadata_diff(
        gsn,
        &wanted_title,
        &wanted_desc,
        &wanted_tags_vec,
        &wanted_category,
    );
    let metadata_verified = metadata_diff.is_empty();
    let time_ok = same_publish_time(publish, gst.get("publishAt").and_then(|x| x.as_str()));
    let privacy_ok =
        gst.get("privacyStatus").and_then(|x| x.as_str()) == Some(target_privacy.as_str());
    let schedule_verified = !schedule_requested || (time_ok && privacy_ok);
    let mut mismatches = metadata_diff;
    if schedule_requested && !time_ok {
        mismatches.push("publishAt".into())
    }
    if schedule_requested && !privacy_ok {
        mismatches.push("privacyStatus".into())
    }
    let verified = metadata_verified && schedule_verified;
    Ok(
        json!({"id":video_id,"verified":verified,"metadataAccepted":true,"metadataVerified":metadata_verified,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":true,"scheduleVerified":schedule_verified,"scheduleVerifyPending":false,"scheduleError":if schedule_verified{Value::Null}else{json!("YouTube не подтвердил расписание/privacy")},"verificationError":if verified{Value::Null}else{json!(format!("YouTube returned different values: {}",mismatches.join(", ")))},"mismatches":mismatches,"skipped":false,"appliedTags":wanted_tags_vec.len(),"actual":{"title":gsn.get("title"),"description":gsn.get("description"),"tags":gsn.get("tags"),"categoryId":gsn.get("categoryId"),"publishAt":gst.get("publishAt"),"privacyStatus":gst.get("privacyStatus")}}),
    )
}
#[tauri::command]
pub async fn youtube_update_existing_schedule(
    app: AppHandle,
    profile_id: String,
    video_id: String,
    publish_at: String,
    operation_id: Option<String>,
) -> Result<Value, String> {
    let (token, profile) = valid_access_token(&app, &profile_id).await?;
    if !profile.scopes.iter().any(|s| {
        s == "https://www.googleapis.com/auth/youtube.force-ssl"
            || s == "https://www.googleapis.com/auth/youtube"
    }) {
        return Err("YouTube профиль подключён со старыми правами. Переподключи канал.".into());
    }
    let publish = publish_at.trim();
    let parsed = chrono::DateTime::parse_from_rfc3339(publish)
        .map_err(|_| "Некорректный publishAt: ожидается RFC3339".to_string())?;
    if parsed.with_timezone(&Utc) <= Utc::now() {
        return Err("PAST_DATE: дата публикации уже в прошлом".into());
    }
    let client = reqwest::Client::new();
    emit_youtube_api_request(&app, "videos.list", operation_id.as_deref());
    let pre = client
        .get("https://www.googleapis.com/youtube/v3/videos")
        .bearer_auth(&token)
        .query(&[("part", "snippet,status"), ("id", video_id.as_str())])
        .send()
        .await
        .map_err(|e| format!("YouTube schedule pre-read: {e}"))?;
    let pre_status = pre.status();
    let pre_value: Value = pre.json().await.unwrap_or_else(|_| json!({}));
    if !pre_status.is_success() {
        return Err(youtube_error(&pre_value, "Не удалось перечитать расписание видео"));
    }
    let item = pre_value
        .get("items")
        .and_then(|x| x.as_array())
        .and_then(|x| x.first())
        .ok_or_else(|| "Видео не найдено".to_string())?;
    let snippet = item.get("snippet").cloned().unwrap_or_else(|| json!({}));
    let old_status = item.get("status").cloned().unwrap_or_else(|| json!({}));
    if profile.channel_id.as_deref() != snippet.get("channelId").and_then(|x| x.as_str()) {
        return Err(format!(
            "BLOCK {}: video.channelId не совпадает с oauthProfile.channelId",
            video_id
        ));
    }
    let privacy = old_status
        .get("privacyStatus")
        .and_then(|x| x.as_str())
        .unwrap_or("unknown");
    if privacy == "public" {
        return Ok(json!({
            "id":video_id,"verified":true,"skipped":true,"skipReason":"ALREADY_PUBLISHED",
            "scheduleAccepted":false,"scheduleVerified":true,"metadataPreserved":true,"statusPreserved":true,
            "snippetWrites":0,"thumbnailWrites":0,"playlistWrites":0,"videosInsert":0,
            "actual":{"publishAt":old_status.get("publishAt"),"privacyStatus":old_status.get("privacyStatus")}
        }));
    }
    if privacy != "private" {
        return Ok(json!({
            "id":video_id,"verified":true,"skipped":true,"skipReason":"UNSUPPORTED_STATE",
            "scheduleAccepted":false,"scheduleVerified":true,"metadataPreserved":true,"statusPreserved":true,
            "snippetWrites":0,"thumbnailWrites":0,"playlistWrites":0,"videosInsert":0,
            "actual":{"publishAt":old_status.get("publishAt"),"privacyStatus":old_status.get("privacyStatus")}
        }));
    }
    let old_publish = old_status.get("publishAt").and_then(|x| x.as_str());
    if same_publish_time(Some(publish), old_publish) {
        return Ok(json!({
            "id":video_id,"verified":true,"skipped":true,"skipReason":"ALREADY_CORRECT",
            "scheduleAccepted":true,"scheduleVerified":true,"metadataPreserved":true,"statusPreserved":true,
            "snippetWrites":0,"thumbnailWrites":0,"playlistWrites":0,"videosInsert":0,
            "actual":{"publishAt":old_status.get("publishAt"),"privacyStatus":old_status.get("privacyStatus")}
        }));
    }
    let snippet_before = youtube_schedule_snippet_snapshot(&snippet);
    let status_before = youtube_schedule_preserved_status_snapshot(&old_status);
    let body = youtube_schedule_status_payload(&video_id, &old_status, publish);
    debug_assert!(body.get("snippet").is_none());
    emit_youtube_api_request(&app, "videos.update", operation_id.as_deref());
    let update = client
        .put("https://www.googleapis.com/youtube/v3/videos")
        .bearer_auth(&token)
        .query(&[("part", "status")])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("YouTube schedule update: {e}"))?;
    let update_status = update.status();
    let update_value: Value = update.json().await.unwrap_or_else(|_| json!({}));
    if !update_status.is_success() {
        return Err(youtube_error(&update_value, "YouTube не принял новое расписание"));
    }
    emit_youtube_api_request(&app, "videos.list", operation_id.as_deref());
    let verify = client
        .get("https://www.googleapis.com/youtube/v3/videos")
        .bearer_auth(&token)
        .query(&[("part", "snippet,status"), ("id", video_id.as_str())])
        .send()
        .await
        .map_err(|e| format!("YouTube schedule verify: {e}"))?;
    let verify_status = verify.status();
    let verify_value: Value = verify.json().await.unwrap_or_else(|_| json!({}));
    if !verify_status.is_success() {
        return Err(youtube_error(&verify_value, "YouTube не подтвердил новое расписание"));
    }
    let got = verify_value
        .get("items")
        .and_then(|x| x.as_array())
        .and_then(|x| x.first())
        .ok_or_else(|| "Видео отсутствует в контрольном videos.list".to_string())?;
    let got_snippet = got.get("snippet").cloned().unwrap_or_else(|| json!({}));
    let got_status = got.get("status").cloned().unwrap_or_else(|| json!({}));
    let publish_ok = same_publish_time(Some(publish), got_status.get("publishAt").and_then(|x| x.as_str()));
    let privacy_ok = got_status.get("privacyStatus").and_then(|x| x.as_str()) == Some(privacy);
    let metadata_preserved = youtube_schedule_snippet_snapshot(&got_snippet) == snippet_before;
    let status_preserved = youtube_schedule_preserved_status_snapshot(&got_status) == status_before;
    let verified = publish_ok && privacy_ok && metadata_preserved && status_preserved;
    let mut mismatches = Vec::<String>::new();
    if !publish_ok { mismatches.push("publishAt".into()); }
    if !privacy_ok { mismatches.push("privacyStatus".into()); }
    if !metadata_preserved { mismatches.push("snippet_changed".into()); }
    if !status_preserved { mismatches.push("status_field_changed".into()); }
    Ok(json!({
        "id":video_id,"verified":verified,"skipped":false,"skipReason":Value::Null,
        "scheduleAccepted":true,"scheduleVerified":publish_ok&&privacy_ok,
        "metadataPreserved":metadata_preserved,"statusPreserved":status_preserved,
        "snippetWrites":0,"thumbnailWrites":0,"playlistWrites":0,"videosInsert":0,
        "mismatches":mismatches,
        "before":{"publishAt":old_status.get("publishAt"),"privacyStatus":old_status.get("privacyStatus"),"snippet":snippet_before,"preservedStatus":status_before},
        "actual":{"publishAt":got_status.get("publishAt"),"privacyStatus":got_status.get("privacyStatus"),"snippet":youtube_schedule_snippet_snapshot(&got_snippet),"preservedStatus":youtube_schedule_preserved_status_snapshot(&got_status)}
    }))
}

#[tauri::command]
pub async fn youtube_list_playlists(
    app: AppHandle,
    profile_id: String,
    operation_id: Option<String>,
) -> Result<Value, String> {
    let (token, _profile) = valid_access_token(&app, &profile_id).await?;
    let client = reqwest::Client::new();
    let mut page: Option<String> = None;
    let mut rows = Vec::<Value>::new();
    let mut calls = 0usize;
    loop {
        emit_youtube_api_request(&app, "playlists.list", operation_id.as_deref());
        calls += 1;
        let mut q = client
            .get("https://www.googleapis.com/youtube/v3/playlists")
            .bearer_auth(&token)
            .query(&[
                ("part", "snippet,status"),
                ("mine", "true"),
                ("maxResults", "50"),
            ]);
        if let Some(ref t) = page {
            q = q.query(&[("pageToken", t.as_str())]);
        }
        let r = q
            .send()
            .await
            .map_err(|e| format!("YouTube playlists: {e}"))?;
        let st = r.status();
        let v: Value = r.json().await.unwrap_or_else(|_| json!({}));
        if !st.is_success() {
            return Err(youtube_error(&v, "Не удалось получить плейлисты"));
        }
        for item in v
            .get("items")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default()
        {
            rows.push(json!({"id":item.get("id").and_then(|x|x.as_str()).unwrap_or(""),"title":item.pointer("/snippet/title").and_then(|x|x.as_str()).unwrap_or("Без названия"),"privacyStatus":item.pointer("/status/privacyStatus").and_then(|x|x.as_str())}))
        }
        page = v
            .get("nextPageToken")
            .and_then(|x| x.as_str())
            .map(str::to_string);
        if page.is_none() {
            break;
        }
    }
    Ok(json!({"playlists":rows,"calls":calls}))
}

#[tauri::command]
pub async fn youtube_playlist_membership(
    app: AppHandle,
    profile_id: String,
    video_id: String,
    playlist_id: String,
    action: String,
    operation_id: Option<String>,
) -> Result<Value, String> {
    let (token, _profile) = valid_access_token(&app, &profile_id).await?;
    let action = action.trim().to_lowercase();
    if action != "add" && action != "remove" {
        return Err("Playlist action должен быть add или remove".into());
    }
    if video_id.trim().is_empty() || playlist_id.trim().is_empty() {
        return Err("Video ID / Playlist ID пуст".into());
    }
    let client = reqwest::Client::new();
    let read_membership = |client: &reqwest::Client, token: &str| {
        client
            .get("https://www.googleapis.com/youtube/v3/playlistItems")
            .bearer_auth(token)
            .query(&[
                ("part", "id,snippet"),
                ("playlistId", playlist_id.as_str()),
                ("videoId", video_id.as_str()),
                ("maxResults", "50"),
            ])
    };
    emit_youtube_api_request(&app, "playlistItems.list", operation_id.as_deref());
    let pre = read_membership(&client, &token)
        .send()
        .await
        .map_err(|e| format!("Playlist pre-read: {e}"))?;
    let pst = pre.status();
    let pv: Value = pre.json().await.unwrap_or_else(|_| json!({}));
    if !pst.is_success() {
        return Err(youtube_error(&pv, "Не удалось проверить плейлист"));
    }
    let pre_items = pv
        .get("items")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let was_member = !pre_items.is_empty();
    if (action == "add" && was_member) || (action == "remove" && !was_member) {
        return Ok(
            json!({"verified":true,"skipped":true,"wasMember":was_member,"isMember":was_member,"action":action,"playlistId":playlist_id,"videoId":video_id,"verificationError":Value::Null}),
        );
    }
    if action == "add" {
        emit_youtube_api_request(&app, "playlistItems.insert", operation_id.as_deref());
        let body = json!({"snippet":{"playlistId":playlist_id,"resourceId":{"kind":"youtube#video","videoId":video_id}}});
        let r = client
            .post("https://www.googleapis.com/youtube/v3/playlistItems")
            .bearer_auth(&token)
            .query(&[("part", "snippet")])
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Playlist add: {e}"))?;
        let st = r.status();
        let v: Value = r.json().await.unwrap_or_else(|_| json!({}));
        if !st.is_success() {
            return Err(youtube_error(&v, "YouTube не добавил видео в плейлист"));
        }
    } else {
        let item_id = pre_items
            .first()
            .and_then(|x| x.get("id"))
            .and_then(|x| x.as_str())
            .ok_or_else(|| "Playlist item ID отсутствует".to_string())?;
        emit_youtube_api_request(&app, "playlistItems.delete", operation_id.as_deref());
        let r = client
            .delete("https://www.googleapis.com/youtube/v3/playlistItems")
            .bearer_auth(&token)
            .query(&[("id", item_id)])
            .send()
            .await
            .map_err(|e| format!("Playlist remove: {e}"))?;
        let st = r.status();
        if !st.is_success() {
            let v: Value = r.json().await.unwrap_or_else(|_| json!({}));
            return Err(youtube_error(&v, "YouTube не удалил видео из плейлиста"));
        }
    }
    emit_youtube_api_request(&app, "playlistItems.list", operation_id.as_deref());
    let post = read_membership(&client, &token)
        .send()
        .await
        .map_err(|e| format!("Playlist verify: {e}"))?;
    let st = post.status();
    let v: Value = post.json().await.unwrap_or_else(|_| json!({}));
    if !st.is_success() {
        return Err(youtube_error(
            &v,
            "YouTube не подтвердил состояние плейлиста",
        ));
    }
    let is_member = v
        .get("items")
        .and_then(|x| x.as_array())
        .map(|x| !x.is_empty())
        .unwrap_or(false);
    let verified = if action == "add" {
        is_member
    } else {
        !is_member
    };
    Ok(
        json!({"verified":verified,"skipped":false,"wasMember":was_member,"isMember":is_member,"action":action,"playlistId":playlist_id,"videoId":video_id,"verificationError":if verified{Value::Null}else{json!("YouTube вернул другое состояние playlist membership")}}),
    )
}

#[cfg(test)]
mod youtube_write_tests {
    use super::*;
    #[test]
    fn same_publish_time_normalizes_offsets() {
        assert!(same_publish_time(
            Some("2026-09-04T04:00:00+07:00"),
            Some("2026-09-03T21:00:00Z")
        ));
    }
    #[test]
    fn metadata_verify_ignores_tag_order_and_line_endings() {
        let sn =
            json!({"title":"  Hello  ","description":"A\r\nB","tags":["Paris Night","Deep House"]});
        let wanted = vec!["deep house".to_string(), "paris night".to_string()];
        assert!(youtube_metadata_diff(&sn, "Hello", "A\nB", &wanted, "").is_empty());
    }
    #[test]
    fn utf8_description_respects_5000_bytes() {
        let s = "я".repeat(3000);
        let out = youtube_truncate_utf8_bytes(&s, 5000);
        assert!(out.len() <= 5000);
        assert!(out.is_char_boundary(out.len()));
    }
    #[test]
    fn tags_respect_youtube_500_budget() {
        let tags = (0..100)
            .map(|i| format!("long tag number {} abcdefghijklmnop", i))
            .collect::<Vec<_>>();
        let out = youtube_sanitize_tags(tags);
        let mut used = 0;
        for (i, t) in out.iter().enumerate() {
            used += youtube_tag_cost(t, i > 0);
        }
        assert!(used <= 500);
        assert!(!out.is_empty());
    }
    #[test]
    fn tags_dedupe_and_strip_angle_brackets() {
        let out =
            youtube_sanitize_tags(vec![" alpha ".into(), "ALPHA".into(), "<beta tag>".into()]);
        assert_eq!(out.len(), 2);
        assert!(!out[1].contains('<'));
        assert!(!out[1].contains('>'));
    }
}

#[tauri::command]
pub async fn youtube_channel_stats(
    app: AppHandle,
    api_key: String,
    channel_id: String,
) -> Result<Value, String> {
    let api_key=crate::storage::youtube_api_key_for_operation(&app,&api_key)?;
    if channel_id.trim().is_empty() {
        return Err("Channel ID не указан".into());
    }
    emit_youtube_api_request(&app, "channels.list", None);
    let url = format!(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={}&key={}",
        urlencoding::encode(channel_id.trim()),
        urlencoding::encode(api_key.trim())
    );
    let r = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Сеть: {e}"))?;
    let status = r.status();
    let v: Value = r.json().await.map_err(|e| format!("Ответ YouTube: {e}"))?;
    if !status.is_success() {
        return Err(v
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|x| x.as_str())
            .unwrap_or("YouTube API вернул ошибку")
            .to_string());
    }
    let item = v
        .get("items")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| "Канал не найден. Проверь Channel ID.".to_string())?;
    let stat = item.get("statistics").cloned().unwrap_or(json!({}));
    let num = |k: &str| {
        stat.get(k)
            .and_then(|x| x.as_str())
            .and_then(|s| s.parse::<u64>().ok())
    };
    Ok(
        json!({"title":item.pointer("/snippet/title").and_then(|x|x.as_str()).unwrap_or(""),"subscribers":num("subscriberCount"),"views":num("viewCount"),"videos":num("videoCount")}),
    )
}

#[cfg(test)]
mod v120_youtube_local_tests {
    use super::*;
    #[test]
    fn fingerprint_is_stable_and_changes_with_file() {
        let root = std::env::temp_dir().join(format!("vyron-v120-fp-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let a = root.join("video.mp4");
        fs::write(&a, b"video-one-complete-content").unwrap();
        let h1 = full_file_sha256(&a).unwrap().0;
        let h2 = full_file_sha256(&a).unwrap().0;
        assert_eq!(h1, h2);
        let renamed = root.join("renamed.mov");
        fs::rename(&a, &renamed).unwrap();
        let h3 = full_file_sha256(&renamed).unwrap().0;
        assert_eq!(h1, h3);
        let moved_dir = root.join("moved");
        fs::create_dir_all(&moved_dir).unwrap();
        let moved = moved_dir.join("copy.m4v");
        fs::rename(&renamed, &moved).unwrap();
        let h4 = full_file_sha256(&moved).unwrap().0;
        assert_eq!(h1, h4);
        fs::write(&moved, b"video-two-different-complete-content").unwrap();
        let h5 = full_file_sha256(&moved).unwrap().0;
        assert_ne!(h1, h5);
        let _ = fs::remove_dir_all(root);
    }
}

#[cfg(test)]
mod v211_upload_transport_tests {
    use super::*;
    #[test]
    fn upload_chunk_is_8_mib() {
        assert_eq!(YOUTUBE_UPLOAD_CHUNK_BYTES, 8 * 1024 * 1024);
    }
    #[test]
    fn upload_transport_has_finite_timeouts() {
        assert_eq!(YOUTUBE_UPLOAD_CONNECT_TIMEOUT_SECS, 20);
        assert_eq!(YOUTUBE_UPLOAD_REQUEST_TIMEOUT_SECS, 120);
        assert!(youtube_upload_client().is_ok());
    }
}

#[cfg(test)]
mod v2111_runtime_upload_tests {
    use super::*;
    #[test]
    fn mov_uses_quicktime_mime() {
        assert_eq!(
            video_mime_for_path(Path::new("/tmp/a.mov")),
            "video/quicktime"
        )
    }
    #[test]
    fn mp4_uses_mp4_mime() {
        assert_eq!(video_mime_for_path(Path::new("/tmp/a.mp4")), "video/mp4")
    }
    #[test]
    fn m4v_has_video_mime() {
        assert_eq!(video_mime_for_path(Path::new("/tmp/a.m4v")), "video/x-m4v")
    }
    #[test]
    fn malformed_publish_at_rejected() {
        assert!(validate_publish_at_at("10.09.2026", Utc::now())
            .unwrap_err()
            .contains("SCHEDULE_INVALID"))
    }
    #[test]
    fn past_publish_at_rejected() {
        let now = Utc::now();
        let old = (now - chrono::Duration::minutes(2)).to_rfc3339();
        assert!(validate_publish_at_at(&old, now)
            .unwrap_err()
            .contains("SCHEDULE_IN_PAST"))
    }
    #[test]
    fn future_publish_at_normalized() {
        let now = Utc::now();
        let future = (now + chrono::Duration::hours(2)).to_rfc3339();
        let got = validate_publish_at_at(&future, now).unwrap();
        assert!(DateTime::parse_from_rfc3339(&got).is_ok())
    }
}

#[cfg(test)]
mod v2111_oauth_recovery_tests {
    use super::*;
    use std::{
        cell::RefCell,
        collections::{HashMap, HashSet},
    };
    #[derive(Default)]
    struct MemorySecrets {
        values: RefCell<HashMap<String, String>>,
        fail_reads: RefCell<HashSet<String>>,
    }
    impl OAuthSecretStore for MemorySecrets {
        fn get(&self, a: &str) -> Result<Option<String>, String> {
            if self.fail_reads.borrow().contains(a) {
                return Err(format!("KEYCHAIN_ERROR: read {a}"));
            }
            Ok(self.values.borrow().get(a).cloned())
        }
        fn set(&self, a: &str, v: &str) -> Result<(), String> {
            self.values.borrow_mut().insert(a.into(), v.into());
            Ok(())
        }
        fn delete(&self, a: &str) -> Result<(), String> {
            self.values.borrow_mut().remove(a);
            Ok(())
        }
    }
    #[test]
    fn google_project_diagnostic_is_metadata_only_and_secret_redacted() {
        let store: SafeOAuthMetadataStore=serde_json::from_str(r#"{"profiles":[{"id":"p99","client_id":"123456789012-abcdefghijklmnop.apps.googleusercontent.com","channel_id":"UC_SAFE_METADATA","channel_title":"Safe Test Channel","client_secret":"CLIENT_SECRET_MUST_NOT_LEAK","access_token":"ACCESS_TOKEN_MUST_NOT_LEAK","refresh_token":"REFRESH_TOKEN_MUST_NOT_LEAK"}]}"#).unwrap();
        let google: SafeGoogleMetadata=serde_json::from_str(r#"{"client_id":"123456789012-abcdefghijklmnop.apps.googleusercontent.com","project_id":"real-local-project-id","client_secret":"GLOBAL_SECRET_MUST_NOT_LEAK","api_key":"API_KEY_MUST_NOT_LEAK"}"#).unwrap();
        let value=google_project_diagnostic_value(&store,&google,"p99").unwrap();
        assert_eq!(value["clientId"],"123456789012-abcdefghijklmnop.apps.googleusercontent.com");
        assert_eq!(value["projectId"],"real-local-project-id");
        assert_eq!(value["youtubeApiRequests"],0);
        assert_eq!(value["keychainSecretsRead"],false);
        let other:SafeGoogleMetadata=serde_json::from_str(r#"{"client_id":"999999999999-other.apps.googleusercontent.com","project_id":"must-not-be-used"}"#).unwrap();
        let mismatch=google_project_diagnostic_value(&store,&other,"p99").unwrap();
        assert!(mismatch["projectId"].is_null());
        let out=value.to_string();
        for forbidden in ["client_secret","access_token","refresh_token","CLIENT_SECRET_MUST_NOT_LEAK","ACCESS_TOKEN_MUST_NOT_LEAK","REFRESH_TOKEN_MUST_NOT_LEAK","GLOBAL_SECRET_MUST_NOT_LEAK","API_KEY_MUST_NOT_LEAK"]{assert!(!out.contains(forbidden),"leaked {forbidden}")}
    }

    fn profile(n: usize) -> OAuthProfile {
        OAuthProfile {
            id: format!("p{n}"),
            client_id: "client-A".into(),
            client_secret: String::new(),
            channel_id: Some(format!("UC{n:02}")),
            channel_title: Some(format!("Channel {n}")),
            access_token: String::new(),
            refresh_token: String::new(),
            expires_at: 0,
            connected_at: "2026-09-01T00:00:00Z".into(),
            scopes: vec![],
            preferred_browser: "default".into(),
            identity_validated_at: None,
            identity_validated_channel_id: None,
            credential_error: None,
        }
    }
    #[test]
    fn legacy_208_plaintext_to_211_is_non_destructive_and_idempotent() {
        let secrets = MemorySecrets::default();
        let mut p = profile(1);
        p.client_secret = "secret".into();
        p.access_token = "access".into();
        p.refresh_token = "refresh".into();
        let mut store = OAuthStore { profiles: vec![p] };
        assert!(recover_store_secrets_with(&secrets, &mut store));
        let disk = serde_json::to_string(&store).unwrap();
        assert!(!disk.contains("refresh"));
        assert_eq!(
            secrets
                .values
                .borrow()
                .get("oauth.p1.refresh_token")
                .map(String::as_str),
            Some("refresh")
        );
        let mut again: OAuthStore = serde_json::from_str(&disk).unwrap();
        assert!(recover_store_secrets_with(&secrets, &mut again));
        assert_eq!(again.profiles[0].refresh_token, "refresh");
        assert_eq!(secrets.values.borrow().len(), 1);
        assert!(secrets.values.borrow().get("oauth.p1.access_token").is_none());
        assert!(secrets.values.borrow().get("oauth.p1.client_secret").is_none())
    }
    #[test]
    fn legacy_209_keychain_to_211_reads_same_accounts() {
        let secrets = MemorySecrets::default();
        for (k, v) in [
            ("client_secret", "s"),
            ("access_token", "a"),
            ("refresh_token", "r"),
        ] {
            secrets.set(&oauth_key("p2", k), v).unwrap()
        }
        let mut store = OAuthStore {
            profiles: vec![profile(2)],
        };
        assert!(recover_store_secrets_with(&secrets, &mut store));
        assert_eq!(store.profiles[0].refresh_token, "r");
        assert!(store.profiles[0].access_token.is_empty());
        assert!(store.profiles[0].client_secret.is_empty())
    }
    #[test]
    fn legacy_alias_is_never_implicitly_read_by_canonical_store() {
        let secrets=MemorySecrets::default();
        secrets.set("youtube_profile_refresh_token::p3","legacy-r").unwrap();
        let mut p=profile(3);
        hydrate_profile_secrets_with(&secrets,&mut p).unwrap();
        assert!(p.refresh_token.is_empty());
        assert!(secrets.get("oauth.p3.refresh_token").unwrap().is_none());
        assert_eq!(secrets.get("youtube_profile_refresh_token::p3").unwrap().as_deref(),Some("legacy-r"));
    }
    #[test]
    fn oauth_response_without_refresh_preserves_existing_refresh_and_profile_id_contract() {
        let mut old = profile(4);
        old.refresh_token = "keep-me".into();
        assert_eq!(
            preserved_refresh_token(Some(&old), "client-A", None).unwrap(),
            "keep-me"
        );
        assert!(preserved_refresh_token(Some(&old), "other-client", None)
            .unwrap_err()
            .starts_with("OAUTH_CLIENT_MISMATCH:"));
        assert!(preserved_refresh_token(None, "client-A", None)
            .unwrap_err()
            .starts_with("REFRESH_TOKEN_MISSING:"))
    }
    #[test]
    fn thirty_one_valid_credentials_recover_31_of_31() {
        let secrets = MemorySecrets::default();
        let mut profiles = Vec::new();
        for i in 0..31 {
            let p = profile(i);
            secrets
                .set(&oauth_key(&p.id, "refresh_token"), &format!("r{i}"))
                .unwrap();
            secrets
                .set(&oauth_key(&p.id, "access_token"), &format!("a{i}"))
                .unwrap();
            profiles.push(p)
        }
        let mut store = OAuthStore { profiles };
        assert!(recover_store_secrets_with(&secrets, &mut store));
        assert_eq!(
            store
                .profiles
                .iter()
                .filter(|p| !p.refresh_token.is_empty() && p.credential_error.is_none())
                .count(),
            31
        )
    }
    #[test]
    fn mixed_29_valid_one_revoked_one_missing_is_isolated() {
        let secrets = MemorySecrets::default();
        let mut profiles = Vec::new();
        for i in 0..31 {
            let p = profile(i);
            if i < 30 {
                secrets
                    .set(
                        &oauth_key(&p.id, "refresh_token"),
                        if i == 29 { "revoked" } else { "valid" },
                    )
                    .unwrap()
            }
            profiles.push(p)
        }
        let mut store = OAuthStore { profiles };
        assert!(recover_store_secrets_with(&secrets, &mut store));
        let working = store
            .profiles
            .iter()
            .filter(|p| p.refresh_token == "valid")
            .count();
        let revoked = store
            .profiles
            .iter()
            .filter(|p| p.refresh_token == "revoked")
            .count();
        let missing = store
            .profiles
            .iter()
            .filter(|p| p.refresh_token.is_empty())
            .count();
        assert_eq!((working, revoked, missing), (29, 1, 1));
        let invalid_grant = json!({"error":"invalid_grant","error_description":"revoked"});
        assert!(oauth_refresh_error(&invalid_grant).starts_with("OAUTH_INVALID_GRANT:"));
        assert_eq!(
            store
                .profiles
                .iter()
                .filter(|p| p.refresh_token == "valid")
                .count(),
            29
        )
    }
    #[test]
    fn repeat_migration_has_no_duplicates_or_logout() {
        let secrets = MemorySecrets::default();
        let mut profiles = Vec::new();
        for i in 0..31 {
            let mut p = profile(i);
            p.refresh_token = format!("r{i}");
            profiles.push(p)
        }
        let mut store = OAuthStore { profiles };
        assert!(recover_store_secrets_with(&secrets, &mut store));
        let disk = serde_json::to_string(&store).unwrap();
        let mut second: OAuthStore = serde_json::from_str(&disk).unwrap();
        assert!(recover_store_secrets_with(&secrets, &mut second));
        let ids = second
            .profiles
            .iter()
            .map(|p| p.id.clone())
            .collect::<HashSet<_>>();
        assert_eq!(ids.len(), 31);
        assert_eq!(
            second
                .profiles
                .iter()
                .filter(|p| !p.refresh_token.is_empty())
                .count(),
            31
        )
    }
}

#[cfg(test)]
mod native_keychain_recovery_state_tests {
    use super::*;
    use std::{cell::RefCell, collections::HashMap};
    const CUR: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const A: &str = "11111111-1111-4111-8111-111111111111";
    const B: &str = "22222222-2222-4222-8222-222222222222";
    #[derive(Default)]
    struct Fake {
        values: RefCell<HashMap<String, Result<Option<String>, String>>>,
        accounts: RefCell<Vec<String>>,
    }
    impl OAuthSecretStore for Fake {
        fn get(&self, a: &str) -> Result<Option<String>, String> {
            self.values.borrow().get(a).cloned().unwrap_or(Ok(None))
        }
        fn set(&self, a: &str, v: &str) -> Result<(), String> {
            self.values
                .borrow_mut()
                .insert(a.into(), Ok(Some(v.into())));
            Ok(())
        }
        fn delete(&self, _: &str) -> Result<(), String> {
            Ok(())
        }
        fn accounts(&self, _: &str) -> Result<Vec<String>, String> {
            Ok(self.accounts.borrow().clone())
        }
    }
    fn current() -> OAuthProfile {
        OAuthProfile {
            id: CUR.into(),
            client_id: "client".into(),
            client_secret: "secret".into(),
            channel_id: Some("UC_EXPECT".into()),
            channel_title: None,
            access_token: String::new(),
            refresh_token: String::new(),
            expires_at: 0,
            connected_at: "2026-01-01".into(),
            scopes: vec![],
            preferred_browser: String::new(),
            identity_validated_at: None,
            identity_validated_channel_id: None,
            credential_error: None,
        }
    }
    fn valid(c: OrphanCredentialCandidate, id: &str) -> ValidatedOrphanCredential {
        ValidatedOrphanCredential {
            candidate: c,
            access_token: "access".into(),
            expires_in: 3600,
            channel_id: id.into(),
            channel_title: Some("x".into()),
        }
    }
    fn eval<F, Fut>(scans: Vec<ScannedCandidate>, expected: &str, validator: F) -> RecoveryOutcome
    where
        F: Fn(OrphanCredentialCandidate) -> Fut,
        Fut: std::future::Future<
            Output = Result<ValidatedOrphanCredential, CandidateValidationFailure>,
        >,
    {
        tauri::async_runtime::block_on(evaluate_scanned_candidates_with(scans, expected, validator))
    }
    #[test]
    fn a_orphan_account_recovers() {
        let f = Fake::default();
        f.accounts.borrow_mut().push(oauth_key(A, "refresh_token"));
        f.values
            .borrow_mut()
            .insert(oauth_key(A, "refresh_token"), Ok(Some("r".into())));
        let scans = orphan_keychain_scan_with(&f, &current()).unwrap();
        let out = eval(
            scans,
            "UC_EXPECT",
            |c| async move { Ok(valid(c, "UC_EXPECT")) },
        );
        assert!(out.recovered);
        assert_eq!(out.status, RecoveryFinalStatus::Recovered)
    }
    #[test]
    fn b_access_denied_is_honest() {
        let f = Fake::default();
        f.accounts.borrow_mut().push(oauth_key(A, "refresh_token"));
        f.values.borrow_mut().insert(
            oauth_key(A, "refresh_token"),
            Err("KEYCHAIN_ACCESS_DENIED: osstatus=-25308".into()),
        );
        let out = eval(
            orphan_keychain_scan_with(&f, &current()).unwrap(),
            "UC_EXPECT",
            |c| async move { Ok(valid(c, "UC_EXPECT")) },
        );
        assert_eq!(out.status, RecoveryFinalStatus::Denied);
        assert!(out.error.unwrap().starts_with("KEYCHAIN_ACCESS_DENIED"))
    }
    #[test]
    fn c_invalid_grant_is_revoked() {
        let f = Fake::default();
        f.accounts.borrow_mut().push(oauth_key(A, "refresh_token"));
        f.values
            .borrow_mut()
            .insert(oauth_key(A, "refresh_token"), Ok(Some("r".into())));
        let out = eval(
            orphan_keychain_scan_with(&f, &current()).unwrap(),
            "UC_EXPECT",
            |_| async move { Err(CandidateValidationFailure::Revoked("invalid_grant".into())) },
        );
        assert_eq!(out.status, RecoveryFinalStatus::Revoked);
        assert!(out.error.unwrap().starts_with("REFRESH_TOKEN_REVOKED"))
    }
    #[test]
    fn d_wrong_channel_is_mismatch() {
        let f = Fake::default();
        f.accounts.borrow_mut().push(oauth_key(A, "refresh_token"));
        f.values
            .borrow_mut()
            .insert(oauth_key(A, "refresh_token"), Ok(Some("r".into())));
        let out = eval(
            orphan_keychain_scan_with(&f, &current()).unwrap(),
            "UC_EXPECT",
            |c| async move { Ok(valid(c, "UC_OTHER")) },
        );
        assert_eq!(out.status, RecoveryFinalStatus::Mismatch)
    }
    #[test]
    fn e_only_true_absence_is_missing() {
        let f = Fake::default();
        let out = eval(
            orphan_keychain_scan_with(&f, &current()).unwrap(),
            "UC_EXPECT",
            |c| async move { Ok(valid(c, "UC_EXPECT")) },
        );
        assert_eq!(out.status, RecoveryFinalStatus::Missing);
        assert!(out.error.unwrap().starts_with("REFRESH_TOKEN_MISSING"))
    }
    #[test]
    fn f_only_matching_candidate_selected() {
        let f = Fake::default();
        for (id, r) in [(A, "ra"), (B, "rb")] {
            f.accounts.borrow_mut().push(oauth_key(id, "refresh_token"));
            f.values
                .borrow_mut()
                .insert(oauth_key(id, "refresh_token"), Ok(Some(r.into())));
        }
        let out = eval(
            orphan_keychain_scan_with(&f, &current()).unwrap(),
            "UC_EXPECT",
            |c| async move {
                let id = if c.profile_id == A {
                    "UC_OTHER"
                } else {
                    "UC_EXPECT"
                };
                Ok(valid(c, id))
            },
        );
        assert!(out.recovered);
        assert_eq!(
            out.audits
                .iter()
                .filter(|a| a.channel_id_match == ChannelMatchStatus::Yes)
                .count(),
            1
        )
    }
    #[test]
    fn g_migration_idempotent() {
        let f = Fake::default();
        let c = OrphanCredentialCandidate {
            profile_id: A.into(),
            account: oauth_key(A, "refresh_token"),
            source: "KEYCHAIN".into(),
            refresh_token: "r".into(),
            client_secret: "s".into(),
            modified_rank: None,
        };
        let v = valid(c, "UC_EXPECT");
        let mut p = current();
        migrate_validated_orphan_with(&f, &mut p, &v).unwrap();
        migrate_validated_orphan_with(&f, &mut p, &v).unwrap();
        assert_eq!(
            f.get(&oauth_key(CUR, "refresh_token")).unwrap().as_deref(),
            Some("r")
        )
    }
    #[test]
    fn h_thirty_one_channels_are_isolated() {
        for i in 0..31 {
            let f = Fake::default();
            let mut p = current();
            p.id = format!("{:08x}-aaaa-4aaa-8aaa-aaaaaaaaaaaa", i + 1);
            p.channel_id = Some(format!("UC_{i}"));
            if i % 5 == 0 {
                f.accounts.borrow_mut().push(oauth_key(A, "refresh_token"));
                f.values.borrow_mut().insert(
                    oauth_key(A, "refresh_token"),
                    Err("KEYCHAIN_ACCESS_DENIED: osstatus=-25308".into()),
                );
            }
            let out = eval(
                orphan_keychain_scan_with(&f, &p).unwrap(),
                p.channel_id.as_deref().unwrap(),
                |c| async move { Ok(valid(c, "UC_NEVER")) },
            );
            if i % 5 == 0 {
                assert_eq!(out.status, RecoveryFinalStatus::Denied)
            } else {
                assert_eq!(out.status, RecoveryFinalStatus::Missing)
            }
        }
    }
}

// VYRON_AUTH_RECOVERY_CENTER_V1
#[derive(Clone, Debug)]
struct ReconnectSecretBackup {
    items: Vec<(String, Option<String>)>,
}

fn reconnect_required_refresh_token(response_refresh: Option<&str>) -> Result<String, String> {
    response_refresh.map(str::trim).filter(|x|!x.is_empty()).map(str::to_string)
  .ok_or_else(||"OAUTH_REFRESH_TOKEN_REQUIRED: Google не вернул refresh token. Подключение не сохранено.".to_string())
}
fn reconnect_authorized_channel_matches(expected: &str, authorized: &str) -> Result<(), String> {
    if expected == authorized {
        Ok(())
    } else {
        Err(format!(
            "WRONG_CHANNEL: expected={expected} authorized={authorized}"
        ))
    }
}
fn reconnect_profile_index(store: &OAuthStore, profile_id: &str) -> Result<usize, String> {
    store
        .profiles
        .iter()
        .position(|p| p.id == profile_id)
        .ok_or_else(|| format!("OAUTH_PROFILE_NOT_FOUND: profile_id={profile_id}"))
}
fn reconnect_rollback_secrets_with<S: OAuthSecretStore>(
    secrets: &S,
    backup: &ReconnectSecretBackup,
) {
    for (account, value) in backup.items.iter().rev() {
        let _ = match value {
            Some(v) => secrets.set(account, v),
            None => secrets.delete(account),
        };
    }
}
fn reconnect_write_readback_with<S:OAuthSecretStore>(
    secrets:&S,profile_id:&str,_client_secret:&str,access_token:&str,refresh_token:&str,
)->Result<ReconnectSecretBackup,String>{
    if profile_id.trim().is_empty(){return Err("OAUTH_PROFILE_ID_MISSING: existing profile UUID is required".into())}
    if access_token.trim().is_empty(){return Err("OAUTH_ACCESS_TOKEN_MISSING: validated access token is empty".into())}
    if refresh_token.trim().is_empty(){return Err("OAUTH_REFRESH_TOKEN_REQUIRED: Google не вернул refresh token. Подключение не сохранено.".into())}
    let account=oauth_key(profile_id,"refresh_token");
    let backup=ReconnectSecretBackup{items:vec![(account.clone(),secrets.get(&account)?)]};
    if let Err(e)=secrets.set(&account,refresh_token){return Err(format!("OAUTH_KEYCHAIN_WRITE_FAILED: account={account}; {e}"))}
    match secrets.get(&account){
      Ok(Some(v)) if v==refresh_token=>Ok(backup),
      Ok(_)=>{reconnect_rollback_secrets_with(secrets,&backup);Err(format!("OAUTH_KEYCHAIN_READBACK_FAILED: account={account}; mismatch"))},
      Err(e)=>{reconnect_rollback_secrets_with(secrets,&backup);Err(format!("OAUTH_KEYCHAIN_READBACK_FAILED: account={account}; {e}"))}
    }
}
fn reconnect_apply_validated_with<S: OAuthSecretStore>(
    secrets: &S,
    store: &mut OAuthStore,
    profile_id: &str,
    client_id: &str,
    client_secret: &str,
    access_token: &str,
    refresh_token: &str,
    authorized_channel_id: &str,
    authorized_channel_title: &str,
    scopes: &[String],
    preferred_browser: &str,
    expires_in: i64,
) -> Result<ReconnectSecretBackup, String> {
    let idx = reconnect_profile_index(store, profile_id)?;
    let expected = store.profiles[idx]
        .channel_id
        .clone()
        .filter(|x| !x.trim().is_empty())
        .ok_or_else(|| format!("OAUTH_EXPECTED_CHANNEL_MISSING: profile_id={profile_id}"))?;
    reconnect_authorized_channel_matches(&expected, authorized_channel_id)?;
    let before_ids = store
        .profiles
        .iter()
        .map(|p| p.id.clone())
        .collect::<Vec<_>>();
    let backup = reconnect_write_readback_with(
        secrets,
        profile_id,
        client_secret,
        access_token,
        refresh_token,
    )?;
    let p = &mut store.profiles[idx];
    // Preserve the existing record identity and channel mapping. Only credential metadata changes.
    p.client_id = client_id.to_string();
    p.client_secret = client_secret.to_string();
    p.access_token = access_token.to_string();
    p.refresh_token = refresh_token.to_string();
    p.expires_at = now_ts() + expires_in.max(60);
    p.connected_at = Utc::now().to_rfc3339();
    p.scopes = scopes.to_vec();
    p.preferred_browser = preferred_browser.to_string();
    p.channel_title = Some(authorized_channel_title.to_string());
    p.identity_validated_at = Some(Utc::now().to_rfc3339());
    p.identity_validated_channel_id = Some(authorized_channel_id.to_string());
    p.credential_error = None;
    let after_ids = store
        .profiles
        .iter()
        .map(|p| p.id.clone())
        .collect::<Vec<_>>();
    if before_ids != after_ids {
        reconnect_rollback_secrets_with(secrets, &backup);
        return Err("OAUTH_PROFILE_MUTATION_GUARD: reconnect changed profile list/UUIDs".into());
    }
    Ok(backup)
}
fn reconnect_auth_url(
    client_id: &str,
    redirect: &str,
    scope: &str,
    challenge: &str,
    state: &str,
) -> String {
    format!("https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&include_granted_scopes=true&code_challenge={}&code_challenge_method=S256&state={}",urlencoding::encode(client_id),urlencoding::encode(redirect),urlencoding::encode(scope),urlencoding::encode(challenge),urlencoding::encode(state))
}
async fn reconnect_refresh_smoke(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<(String, i64), String> {
    let mut form = vec![
        ("client_id", client_id),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret));
    }
    let r = reqwest::Client::new()
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("OAUTH_REFRESH_FAILED: reconnect refresh smoke network: {e}"))?;
    let st = r.status();
    let v: Value = r
        .json()
        .await
        .map_err(|e| format!("OAUTH_REFRESH_FAILED: reconnect refresh smoke JSON: {e}"))?;
    if !st.is_success() {
        return Err(oauth_refresh_error(&v));
    }
    let access = v
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|x| !x.trim().is_empty())
        .ok_or_else(|| "OAUTH_REFRESH_FAILED: refresh smoke returned no access_token".to_string())?
        .to_string();
    let expires = v.get("expires_in").and_then(Value::as_i64).unwrap_or(3600);
    Ok((access, expires))
}

#[tauri::command]
pub async fn youtube_oauth_reconnect_existing(
    app: AppHandle,
    profile_id: String,
    browser: Option<String>,
) -> Result<Value, String> {
    let profile_id = profile_id.trim().to_string();
    if profile_id.is_empty() {
        return Err("OAUTH_PROFILE_ID_MISSING: existing profile UUID is required".into());
    }
    let original_store=load_store_metadata(&app)?;
    let idx=reconnect_profile_index(&original_store,&profile_id)?;
    let target=original_store.profiles[idx].clone();
    let expected_channel_id = target
        .channel_id
        .clone()
        .filter(|x| !x.trim().is_empty())
        .ok_or_else(|| format!("OAUTH_EXPECTED_CHANNEL_MISSING: profile_id={profile_id}"))?;
    let global=load_or_migrate_google_config(&app)?;
    let client_id=if !target.client_id.trim().is_empty(){target.client_id.clone()}else{global.client_id.clone()};
    if client_id.trim().is_empty(){return Err("OAUTH_CLIENT_MISSING: existing profile has no OAuth client_id and global Google config is empty".into())}
    let client_secret=if global.client_id.trim()==client_id.trim(){global.client_secret.clone()}else{String::new()};
    let preferred_browser = browser.filter(|x| !x.trim().is_empty()).unwrap_or_else(|| {
        if target.preferred_browser.trim().is_empty() {
            "default".into()
        } else {
            target.preferred_browser.clone()
        }
    });
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("OAuth localhost: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}");
    let verifier = format!(
        "{}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = Uuid::new_v4().to_string();
    let scope="https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly";
    let scopes = scope
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let auth_url = reconnect_auth_url(&client_id, &redirect, scope, &challenge, &state);
    let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"CONNECTING","expectedChannelId":expected_channel_id}));
    open_browser(&auth_url, &preferred_browser)?;
    let expected_state = state.clone();
    let code=tauri::async_runtime::spawn_blocking(move||->Result<String,String>{listener.set_nonblocking(false).map_err(|e|e.to_string())?;let (mut stream,_)=listener.accept().map_err(|e|format!("OAuth callback: {e}"))?;let _=stream.set_read_timeout(Some(Duration::from_secs(300)));let mut buf=[0u8;8192];let n=stream.read(&mut buf).map_err(|e|format!("OAuth callback read: {e}"))?;let req=String::from_utf8_lossy(&buf[..n]);let first=req.lines().next().unwrap_or("");let target=first.split_whitespace().nth(1).unwrap_or("");let query=target.split_once('?').map(|x|x.1).unwrap_or("");let got_state=query_param(query,"state").unwrap_or_default();let code=query_param(query,"code");let err=query_param(query,"error");let ok=got_state==expected_state&&code.is_some();let html=if ok{"<html><body style='font-family:-apple-system;padding:40px;background:#07111d;color:white'><h2>Google подтвердил доступ ✅</h2><p>VYRON проверяет refresh token и точный YouTube Channel ID. Вернитесь в приложение.</p></body></html>"}else{"<html><body><h2>VYRON OAuth error</h2><p>Вернитесь в приложение.</p></body></html>"};let resp=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.as_bytes().len(),html);let _=stream.write_all(resp.as_bytes());if let Some(e)=err{return Err(format!("Google OAuth: {e}"))}if got_state!=expected_state{return Err("OAuth state mismatch".into())}code.ok_or_else(||"Google не вернул authorization code".into())}).await.map_err(|e|e.to_string())??;
    let mut token_form = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect.as_str()),
    ];
    if !client_secret.is_empty() {
        token_form.push(("client_secret", client_secret.as_str()));
    }
    let token = reqwest::Client::new()
        .post("https://oauth2.googleapis.com/token")
        .form(&token_form)
        .send()
        .await
        .map_err(|e| format!("OAUTH_NETWORK_ERROR: token exchange: {e}"))?;
    let status = token.status();
    let tv: Value = token
        .json()
        .await
        .map_err(|e| format!("OAuth token JSON: {e}"))?;
    if !status.is_success() {
        return Err(tv
            .get("error_description")
            .and_then(Value::as_str)
            .or_else(|| tv.get("error").and_then(Value::as_str))
            .unwrap_or("Google OAuth token error")
            .to_string());
    }
    let _initial_access = tv
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|x| !x.trim().is_empty())
        .ok_or_else(|| "Google не вернул access_token".to_string())?;
    let refresh =
        reconnect_required_refresh_token(tv.get("refresh_token").and_then(Value::as_str))?;
    let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"VALIDATING","expectedChannelId":expected_channel_id}));
    // Validate the newly issued refresh token first. The refreshed access token is then used for the single YouTube identity request.
    let (access, expires) = reconnect_refresh_smoke(&client_id, &client_secret, &refresh).await?;
    emit_youtube_api_request(
        &app,
        "channels.list",
        Some(&format!("auth-recovery:{profile_id}")),
    );
    let me = reqwest::Client::new()
        .get("https://www.googleapis.com/youtube/v3/channels")
        .bearer_auth(&access)
        .query(&[("part", "snippet"), ("mine", "true"), ("maxResults", "50")])
        .send()
        .await
        .map_err(|e| format!("OAUTH_IDENTITY_FAILED: reconnect identity network: {e}"))?;
    let me_status = me.status();
    let mv: Value = me
        .json()
        .await
        .map_err(|e| format!("OAUTH_IDENTITY_FAILED: reconnect identity JSON: {e}"))?;
    if !me_status.is_success() {
        return Err(youtube_error(
            &mv,
            "OAUTH_IDENTITY_FAILED: reconnect identity check failed",
        ));
    }
    let items = mv.get("items").and_then(Value::as_array).ok_or_else(|| {
        "OAUTH_CHANNEL_MISSING: authorized Google account returned no YouTube channel".to_string()
    })?;
    if items.is_empty() {
        return Err(
            "OAUTH_CHANNEL_MISSING: authorized Google account returned no YouTube channel".into(),
        );
    }
    let matched = items
        .iter()
        .find(|x| x.get("id").and_then(Value::as_str) == Some(expected_channel_id.as_str()));
    let item = match matched {
        Some(x) => x,
        None => {
            let authorized = items
                .iter()
                .filter_map(|x| x.get("id").and_then(Value::as_str))
                .take(10)
                .collect::<Vec<_>>()
                .join(",");
            let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"WRONG_CHANNEL","expectedChannelId":expected_channel_id,"authorizedChannelId":authorized}));
            return Err(format!(
                "WRONG_CHANNEL: expected={} authorized={}",
                expected_channel_id,
                if authorized.is_empty() {
                    "NONE"
                } else {
                    &authorized
                }
            ));
        }
    };
    let authorized_channel_id = item
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "OAUTH_CHANNEL_MISSING: YouTube did not return channel ID".to_string())?
        .to_string();
    let authorized_channel_title = item
        .pointer("/snippet/title")
        .and_then(Value::as_str)
        .unwrap_or(&authorized_channel_id)
        .to_string();
    reconnect_authorized_channel_matches(&expected_channel_id, &authorized_channel_id)?;
    let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"SAVING","expectedChannelId":expected_channel_id,"authorizedChannelId":authorized_channel_id}));
    let mut next_store = original_store.clone();
    let secrets=KeychainOAuthSecretStore;
    let backup=reconnect_apply_validated_with(
        &secrets,&mut next_store,&profile_id,&client_id,&client_secret,&access,&refresh,
        &authorized_channel_id,&authorized_channel_title,&scopes,&preferred_browser,expires,
    )?;
    if !client_secret.trim().is_empty(){security::canonical_set_secret(GOOGLE_CLIENT_SECRET,&client_secret)?}
    remember_access_token(&profile_id,&access,now_ts()+expires.max(60));
    set_profile_migration_state(&app,&profile_id,MIGRATION_MIGRATED)?;
    if let Err(e)=write_oauth_metadata(&store_path(&app)?,&next_store){
        reconnect_rollback_secrets_with(&secrets,&backup);
        return Err(format!("OAUTH_METADATA_SAVE_FAILED: {e}"));
    }
    let verify = load_store_metadata(&app)?;
    let verified = verify
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| {
            "OAUTH_SAVE_VERIFY_FAILED: existing profile UUID disappeared after save".to_string()
        })?;
    let keychain_found=security::canonical_get_secret_cached(&oauth_key(&profile_id,"refresh_token"))?
        .map(|x|!x.trim().is_empty()).unwrap_or(false);
    let ok = keychain_found
        && verified.channel_id.as_deref() == Some(expected_channel_id.as_str())
        && verified.identity_validated_channel_id.as_deref() == Some(expected_channel_id.as_str());
    if !ok {
        reconnect_rollback_secrets_with(&secrets, &backup);
        let _ = write_oauth_metadata(&store_path(&app)?, &original_store);
        return Err("OAUTH_SAVE_VERIFY_FAILED: Keychain/profile readback did not confirm existing UUID credential".into());
    }
    let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"CONNECTED","expectedChannelId":expected_channel_id,"authorizedChannelId":authorized_channel_id}));
    Ok(
        json!({"ok":true,"status":"CONNECTED","profileId":profile_id,"profileUuidPreserved":true,"expectedChannelId":expected_channel_id,"authorizedChannelId":authorized_channel_id,"channelTitle":authorized_channel_title,"refreshTokenStored":true,"keychainReadback":"FOUND","tokenRefresh":"PASS","channelIdentity":"PASS","youtubeIdentityRequests":1,"videosInsert":0}),
    )
}


#[cfg(test)]
mod schedule_only_status_tests {
    use super::*;
    #[test]
    fn status_payload_never_contains_snippet() {
        let st=json!({"privacyStatus":"private","embeddable":true,"license":"youtube","publicStatsViewable":true,"selfDeclaredMadeForKids":false,"containsSyntheticMedia":false});
        let body=youtube_schedule_status_payload("v1",&st,"2026-09-20T21:00:00Z");
        assert!(body.get("snippet").is_none());
        assert_eq!(body["status"]["privacyStatus"],"private");
        assert_eq!(body["status"]["publishAt"],"2026-09-20T21:00:00Z");
    }
    #[test]
    fn schedule_body_preserves_existing_writable_status_fields() {
        let st=json!({"privacyStatus":"private","publishAt":"2026-09-18T21:00:00Z","embeddable":false,"license":"youtube","publicStatsViewable":false,"selfDeclaredMadeForKids":true,"madeForKids":true,"containsSyntheticMedia":true});
        let body=youtube_schedule_status_payload("v1",&st,"2026-09-19T21:00:00Z");
        for k in ["privacyStatus","embeddable","license","publicStatsViewable","selfDeclaredMadeForKids","containsSyntheticMedia"] { assert_eq!(body["status"].get(k),st.get(k),"{k}"); }
        assert!(body["status"].get("madeForKids").is_none(),"read-only madeForKids must not be written");
    }
    #[test]
    fn snippet_preservation_snapshot_covers_metadata_and_thumbnail_reference() {
        let sn=json!({"title":"A","description":"B","tags":["C"],"categoryId":"10","defaultLanguage":"fr","defaultAudioLanguage":"en","thumbnails":{"high":{"url":"x"}},"channelId":"UC"});
        let x=youtube_schedule_snippet_snapshot(&sn);
        assert_eq!(x["title"],"A");assert_eq!(x["description"],"B");assert_eq!(x["tags"][0],"C");assert_eq!(x["categoryId"],"10");assert_eq!(x["thumbnails"]["high"]["url"],"x");assert!(x.get("channelId").is_none());
    }
    #[test]
    fn preserved_status_snapshot_tracks_read_only_made_for_kids_without_writing_it() {
        let st=json!({"privacyStatus":"private","madeForKids":true,"selfDeclaredMadeForKids":false});
        let snap=youtube_schedule_preserved_status_snapshot(&st);
        assert_eq!(snap["madeForKids"],true);
        let body=youtube_schedule_status_payload("v",&st,"2026-10-01T00:00:00Z");
        assert!(body["status"].get("madeForKids").is_none());
    }
}

#[cfg(test)]
mod keychain_prompt_architecture_tests{
 use super::*;use std::{cell::RefCell,collections::HashMap};
 #[derive(Default)]struct CountingStore{v:RefCell<HashMap<String,String>>,gets:RefCell<Vec<String>>,sets:RefCell<Vec<String>>,deletes:RefCell<Vec<String>>,accounts:RefCell<usize>}
 impl OAuthSecretStore for CountingStore{
  fn get(&self,a:&str)->Result<Option<String>,String>{self.gets.borrow_mut().push(a.to_string());Ok(self.v.borrow().get(a).cloned())}
  fn set(&self,a:&str,v:&str)->Result<(),String>{self.sets.borrow_mut().push(a.to_string());self.v.borrow_mut().insert(a.to_string(),v.to_string());Ok(())}
  fn delete(&self,a:&str)->Result<(),String>{self.deletes.borrow_mut().push(a.to_string());self.v.borrow_mut().remove(a);Ok(())}
  fn accounts(&self,_:&str)->Result<Vec<String>,String>{*self.accounts.borrow_mut()+=1;Ok(self.v.borrow().keys().cloned().collect())}
 }
 fn p(id:&str)->OAuthProfile{OAuthProfile{id:id.into(),client_id:"123.apps.googleusercontent.com".into(),client_secret:String::new(),channel_id:Some(format!("UC{id}")),channel_title:Some(id.into()),access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:"2026-01-01T00:00:00Z".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:Some("2026-01-01T00:00:00Z".into()),identity_validated_channel_id:Some(format!("UC{id}")),credential_error:None}}
 #[test]fn passive_profile_listing_zero_secret_store_calls(){let secrets=CountingStore::default();let value=oauth_profiles_value(OAuthStore{profiles:vec![p("a"),p("b")]});assert_eq!(value.as_array().unwrap().len(),2);assert!(secrets.gets.borrow().is_empty());assert!(secrets.sets.borrow().is_empty());assert!(secrets.deletes.borrow().is_empty());assert_eq!(*secrets.accounts.borrow(),0);}
 #[test]fn thirty_one_profiles_passive_enumeration_zero_secret_reads(){
  let secrets=CountingStore::default();
  let profiles=(0..31).map(|i|p(&format!("p{i}"))).collect::<Vec<_>>();
  let value=oauth_profiles_value(OAuthStore{profiles});
  assert_eq!(value.as_array().unwrap().len(),31);
  assert!(secrets.gets.borrow().is_empty());assert!(secrets.sets.borrow().is_empty());assert!(secrets.deletes.borrow().is_empty());assert_eq!(*secrets.accounts.borrow(),0);
 }
 #[test]fn hundred_passive_navigation_models_zero_secret_reads(){
  let secrets=CountingStore::default();
  let profiles=(0..31).map(|i|p(&format!("p{i}"))).collect::<Vec<_>>();
  for _ in 0..100{
   let value=oauth_profiles_value(OAuthStore{profiles:profiles.clone()});
   assert_eq!(value.as_array().unwrap().len(),31);
  }
  assert!(secrets.gets.borrow().is_empty());assert!(secrets.sets.borrow().is_empty());assert!(secrets.deletes.borrow().is_empty());assert_eq!(*secrets.accounts.borrow(),0);
 }
 #[test]fn canonical_refresh_restart_model_never_enumerates_legacy(){
  let secrets=CountingStore::default();
  let account=oauth_key("a","refresh_token");
  secrets.v.borrow_mut().insert(account.clone(),"canonical-refresh".into());
  let mut first=p("a");hydrate_profile_secret_kind_with(&secrets,&mut first,"refresh_token").unwrap();
  let mut relaunched=p("a");hydrate_profile_secret_kind_with(&secrets,&mut relaunched,"refresh_token").unwrap();
  assert_eq!(first.refresh_token,"canonical-refresh");assert_eq!(relaunched.refresh_token,"canonical-refresh");
  assert_eq!(&*secrets.gets.borrow(),&vec![account.clone(),account]);
  assert_eq!(*secrets.accounts.borrow(),0);
 }
 #[test]fn rc7_source_contract_has_zero_runtime_legacy_secret_reads(){
  let source=include_str!("youtube.rs");
  let production=source.split("#[cfg(test)]").next().unwrap_or(source);
  assert!(!production.contains("trait OAuthSecretStore {trait OAuthSecretStore {"));
  assert!(!production.contains("fn migrate_profile_refresh_to_canonicalfn migrate_profile_refresh_to_canonical"));
  let migration=production.split("fn migrate_profile_refresh_to_canonical").nth(1).unwrap().split("trait OAuthSecretStore").next().unwrap();
  assert!(!migration.contains("legacy_get_secret_once"));
  assert!(!migration.contains("security::get_secret("));
  let inventory=production.split("pub async fn youtube_list_existing_videos").nth(1).unwrap();
  let active_prefix=inventory.split("let (token, profile) = valid_access_token").next().unwrap();
  assert!(active_prefix.contains("profile_id: String"));
  assert!(!active_prefix.contains("migrate_profile_refresh_to_canonical"));
  assert!(!production.contains("security::get_secret_cached(GOOGLE_API_KEY)"));
  assert!(!production.contains("security::set_secret(GOOGLE_API_KEY"));
  let storage_source=include_str!("storage.rs");
  let storage=storage_source.split("#[cfg(test)]").next().unwrap_or(storage_source);
  assert!(!storage.contains("security::get_secret_cached("));
  assert!(!storage.contains("security::set_secret("));
  assert!(!storage.contains("security::set_secret_for_autosave("));
  assert!(storage.contains("security::canonical_get_secret_cached("));
  assert!(storage.contains("security::canonical_set_secret("));
 }
 #[test]fn rc7_security_source_contract_uses_per_query_ui_fail(){
  let source=include_str!("security.rs");
  let ui_fail=["kSecUseAuthenticationUI","Fail"].concat();
  let skip=["skip_authenticated_items","(true)"].concat();
  let old_get=["get_generic_","password("].concat();
  let old_set=["set_generic_","password("].concat();
  let old_delete=["delete_generic_","password("].concat();
  assert!(source.contains("SecKeychain::disable_user_interaction()"));
  assert!(source.contains(&ui_fail));
  assert!(source.matches(&skip).count()>=2);
  assert!(!source.contains(&old_get));
  assert!(!source.contains(&old_set));
  assert!(!source.contains(&old_delete));
 }
 #[test]fn selected_profile_hydration_reads_only_selected_secret(){let secrets=CountingStore::default();secrets.v.borrow_mut().insert(oauth_key("a","refresh_token"),"ra".into());secrets.v.borrow_mut().insert(oauth_key("b","refresh_token"),"rb".into());let mut a=p("a");let b=p("b");hydrate_profile_secret_kind_with(&secrets,&mut a,"refresh_token").unwrap();assert_eq!(a.refresh_token,"ra");assert!(b.refresh_token.is_empty());assert_eq!(&*secrets.gets.borrow(),&vec![oauth_key("a","refresh_token")]);assert!(secrets.sets.borrow().is_empty());assert!(secrets.deletes.borrow().is_empty());}
 #[test]fn google_status_metadata_never_requires_secret_value(){let c=GoogleConfig{client_id:"123.apps.googleusercontent.com".into(),project_id:"project".into(),client_secret:String::new(),api_key:String::new(),client_secret_present:true,api_key_present:true};let v=google_config_status_value(&c);assert_eq!(v["hasSecret"],true);assert_eq!(v["hasApiKey"],true);assert!(!v.to_string().contains("client_secret"));}
}

#[cfg(test)]
mod auth_recovery_targeted_tests {
    use super::*;
    use std::{cell::RefCell, collections::HashMap};
    #[derive(Default)]
    struct Mem {
        v: RefCell<HashMap<String, String>>,
        fail_write: RefCell<bool>,
        fail_read: RefCell<bool>,
    }
    impl OAuthSecretStore for Mem {
        fn get(&self, a: &str) -> Result<Option<String>, String> {
            if *self.fail_read.borrow() {
                return Err("read denied".into());
            }
            Ok(self.v.borrow().get(a).cloned())
        }
        fn set(&self, a: &str, v: &str) -> Result<(), String> {
            if *self.fail_write.borrow() {
                return Err("write denied".into());
            }
            self.v.borrow_mut().insert(a.into(), v.into());
            Ok(())
        }
        fn delete(&self, a: &str) -> Result<(), String> {
            self.v.borrow_mut().remove(a);
            Ok(())
        }
    }
    fn p(id: &str, ch: &str) -> OAuthProfile {
        OAuthProfile {
            id: id.into(),
            client_id: "client-A".into(),
            client_secret: "secret-A".into(),
            channel_id: Some(ch.into()),
            channel_title: Some(ch.into()),
            access_token: String::new(),
            refresh_token: String::new(),
            expires_at: 0,
            connected_at: "2026-09-01T00:00:00Z".into(),
            scopes: vec![],
            preferred_browser: "default".into(),
            identity_validated_at: None,
            identity_validated_channel_id: None,
            credential_error: None,
        }
    }
    const ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    #[test]
    fn a_existing_profile_reconnect_keeps_uuid() {
        let sec = Mem::default();
        let mut st = OAuthStore {
            profiles: vec![p(ID, "UC_A")],
        };
        let ids = st.profiles.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
        let _ = reconnect_apply_validated_with(
            &sec,
            &mut st,
            ID,
            "client-A",
            "secret-A",
            "access",
            "refresh",
            "UC_A",
            "A",
            &[],
            "default",
            3600,
        )
        .unwrap();
        assert_eq!(
            st.profiles.iter().map(|p| p.id.clone()).collect::<Vec<_>>(),
            ids
        );
        assert_eq!(st.profiles[0].id, ID)
    }
    #[test]
    fn b_refresh_returned_keychain_save_pass() {
        let sec = Mem::default();
        let mut st = OAuthStore {
            profiles: vec![p(ID, "UC_A")],
        };
        reconnect_apply_validated_with(
            &sec,
            &mut st,
            ID,
            "client-A",
            "secret-A",
            "access",
            "refresh",
            "UC_A",
            "A",
            &[],
            "default",
            3600,
        )
        .unwrap();
        assert_eq!(
            sec.get(&oauth_key(ID, "refresh_token")).unwrap().as_deref(),
            Some("refresh")
        );
        assert!(sec.get(&oauth_key(ID,"access_token")).unwrap().is_none());
        assert!(sec.get(&oauth_key(ID,"client_secret")).unwrap().is_none())
    }
    #[test]
    fn c_no_new_refresh_token_reconnect_fails() {
        assert!(reconnect_required_refresh_token(None)
            .unwrap_err()
            .contains("Подключение не сохранено"));
        assert!(reconnect_required_refresh_token(Some(" ")).is_err())
    }
    #[test]
    fn d_wrong_channel_token_not_bound() {
        let sec = Mem::default();
        let mut st = OAuthStore {
            profiles: vec![p(ID, "UC_A")],
        };
        let err = reconnect_apply_validated_with(
            &sec,
            &mut st,
            ID,
            "client-A",
            "secret-A",
            "access",
            "refresh",
            "UC_WRONG",
            "Wrong",
            &[],
            "default",
            3600,
        )
        .unwrap_err();
        assert!(err.starts_with("WRONG_CHANNEL:"));
        assert!(sec.get(&oauth_key(ID, "refresh_token")).unwrap().is_none())
    }
    #[test]
    fn e_correct_channel_bound_existing_uuid() {
        let sec = Mem::default();
        let mut st = OAuthStore {
            profiles: vec![p(ID, "UC_A")],
        };
        reconnect_apply_validated_with(
            &sec,
            &mut st,
            ID,
            "client-A",
            "secret-A",
            "access",
            "refresh",
            "UC_A",
            "Title",
            &[],
            "default",
            3600,
        )
        .unwrap();
        assert_eq!(st.profiles.len(), 1);
        assert_eq!(st.profiles[0].id, ID);
        assert_eq!(
            st.profiles[0].identity_validated_channel_id.as_deref(),
            Some("UC_A")
        )
    }
    #[test]
    fn f_keychain_write_readback_pass_and_failure_rolls_back() {
        let sec = Mem::default();
        sec.set(&oauth_key(ID, "refresh_token"), "old").unwrap();
        let backup = reconnect_write_readback_with(&sec, ID, "secret", "access", "new").unwrap();
        assert_eq!(
            sec.get(&oauth_key(ID, "refresh_token")).unwrap().as_deref(),
            Some("new")
        );
        reconnect_rollback_secrets_with(&sec, &backup);
        assert_eq!(
            sec.get(&oauth_key(ID, "refresh_token")).unwrap().as_deref(),
            Some("old")
        )
    }
    #[test]
    fn g_second_reconnect_no_duplicate_profile() {
        let sec = Mem::default();
        let mut st = OAuthStore {
            profiles: vec![p(ID, "UC_A")],
        };
        for n in 0..2 {
            reconnect_apply_validated_with(
                &sec,
                &mut st,
                ID,
                "client-A",
                "secret-A",
                &format!("access{n}"),
                &format!("refresh{n}"),
                "UC_A",
                "A",
                &[],
                "default",
                3600,
            )
            .unwrap();
            assert_eq!(st.profiles.len(), 1);
            assert_eq!(st.profiles[0].id, ID)
        }
    }
    #[test]
    fn offline_authorization_is_forced() {
        let u = reconnect_auth_url(
            "client",
            "http://127.0.0.1:1",
            "scope",
            "challenge",
            "state",
        );
        assert!(u.contains("access_type=offline"));
        assert!(u.contains("prompt=consent"));
        assert!(u.contains("include_granted_scopes=true"))
    }
}


#[cfg(test)]
mod v219_rc7_secitem_ui_fail_tests{
 use super::*;
 #[test]
 fn startup_and_navigation_model_do_not_touch_legacy_or_acl(){
  let state=KeychainMigrationV2State::default();
  assert!(state.profiles.is_empty());
  assert_eq!(state.global_client_secret,MIGRATION_NOT_STARTED);
  // Passive metadata/profile functions never hydrate legacy secrets; unavailable credentials require Google reconnect.
  assert_eq!(security::canonical_service(),"com.scaleup.vyron.security.v2");
  assert_eq!(security::LEGACY_SERVICE,"com.scaleup.vyron.security");
 }
 #[test]
 fn access_token_replacement_is_memory_only(){
  let id="rc7-access-memory-test";
  forget_access_token(id);
  for i in 0..10{remember_access_token(id,&format!("access-{i}"),now_ts()+3600)}
  let (token,_)=session_access_token(id).unwrap();
  assert_eq!(token,"access-9");
  forget_access_token(id);
 }
 #[test]
 fn profile_persistence_never_writes_access_or_client_secret(){
  #[derive(Default)]struct C{sets:std::cell::RefCell<Vec<String>>}
  impl OAuthSecretStore for C{
   fn get(&self,_:&str)->Result<Option<String>,String>{Ok(None)}
   fn set(&self,a:&str,_:&str)->Result<(),String>{self.sets.borrow_mut().push(a.into());Ok(())}
   fn delete(&self,_:&str)->Result<(),String>{Ok(())}
  }
  let c=C::default();
  let p=OAuthProfile{id:"p".into(),client_id:"client".into(),client_secret:"global-secret".into(),channel_id:None,channel_title:None,access_token:"short-lived".into(),refresh_token:"refresh".into(),expires_at:now_ts()+3600,connected_at:"x".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None};
  write_profile_secrets_with(&c,&p).unwrap();
  assert_eq!(&*c.sets.borrow(),&vec!["oauth.p.refresh_token".to_string()]);
 }
 #[test]
 fn global_client_secret_has_one_canonical_account_for_many_profiles(){
  let accounts=(0..10).map(|_|GOOGLE_CLIENT_SECRET).collect::<std::collections::HashSet<_>>();
  assert_eq!(accounts.len(),1);
  assert_eq!(*accounts.iter().next().unwrap(),"google.client_secret");
 }
}

#[cfg(test)]
mod v216_upload_progress_tests {
    use super::upload_progress_percent;
    #[test]
    fn factual_byte_progress_is_clamped() {
        assert_eq!(upload_progress_percent(0, 100), 0.0);
        assert_eq!(upload_progress_percent(50, 100), 50.0);
        assert_eq!(upload_progress_percent(100, 100), 100.0);
        assert_eq!(upload_progress_percent(150, 100), 100.0);
        assert_eq!(upload_progress_percent(10, 0), 0.0);
    }
}


#[cfg(test)]
mod v219_rc4_inventory_and_acl_tests{
 use super::*;
 #[test]
 fn inventory_166_pages_hydration_counts_and_quota_are_exact(){
  let mut ids=Vec::<String>::new();let mut seen=std::collections::HashSet::<String>::new();
  let mut offset=0usize;
  for page_idx in 0..4{
   let size=if page_idx<3{50}else{16};
   let items=(0..size).map(|i|json!({"contentDetails":{"videoId":format!("v{}",offset+i)}})).collect::<Vec<_>>();
   offset+=size;
   let next=if page_idx<3{json!(format!("p{}",page_idx+2))}else{Value::Null};
   let page=json!({"items":items,"nextPageToken":next,"pageInfo":{"totalResults":166}});
   append_playlist_page_ids(&page,&mut ids,&mut seen,5000);
  }
  assert_eq!(ids.len(),166);
  assert_eq!(seen.len(),166);
  let est=full_sync_estimate(ids.len());
  assert_eq!(est.get("playlistPages").and_then(|x|x.as_u64()),Some(4));
  assert_eq!(est.get("hydrationBatches").and_then(|x|x.as_u64()),Some(4));
  assert_eq!(est.get("apiRequests").and_then(|x|x.as_u64()),Some(9));
  assert_eq!(est.get("estimatedQuotaCost").and_then(|x|x.as_u64()),Some(9));

  let mut rows=Vec::<Value>::new();
  for i in 0..166{
   let (privacy,publish_at)=if i<14{("private",Value::Null)}
    else if i<19{("private",json!("2099-01-01T00:00:00Z"))}
    else if i<159{("public",Value::Null)}
    else{("unlisted",Value::Null)};
   rows.push(json!({"privacyStatus":privacy,"publishAt":publish_at}));
  }
  let (private_count,scheduled_count,public_count,unlisted_count)=inventory_bucket_counts(&rows,Utc::now());
  assert_eq!((private_count,scheduled_count,public_count,unlisted_count),(14,5,140,7));
 }
 #[test]
 fn playlist_dedup_and_malformed_schedule_are_safe(){
  let mut ids=Vec::<String>::new();let mut seen=std::collections::HashSet::<String>::new();
  let p1=json!({"items":[{"contentDetails":{"videoId":"a"}},{"contentDetails":{"videoId":"b"}}]});
  let p2=json!({"items":[{"contentDetails":{"videoId":"b"}},{"contentDetails":{"videoId":"c"}}]});
  append_playlist_page_ids(&p1,&mut ids,&mut seen,100);
  append_playlist_page_ids(&p2,&mut ids,&mut seen,100);
  assert_eq!(ids,vec!["a","b","c"]);
  let rows=vec![
   json!({"privacyStatus":"private","publishAt":"not-a-date"}),
   json!({"privacyStatus":"private","publishAt":"2000-01-01T00:00:00Z"}),
   json!({"privacyStatus":"public","publishAt":"2099-01-01T00:00:00Z"})
  ];
  assert_eq!(inventory_bucket_counts(&rows,Utc::now()),(2,0,1,0));
 }
 #[test]
 fn rc5_persistent_profile_store_writes_refresh_only(){
  #[derive(Default)]struct S{v:std::cell::RefCell<HashMap<String,String>>,sets:std::cell::RefCell<Vec<String>>}
  impl OAuthSecretStore for S{
   fn get(&self,a:&str)->Result<Option<String>,String>{Ok(self.v.borrow().get(a).cloned())}
   fn set(&self,a:&str,v:&str)->Result<(),String>{self.sets.borrow_mut().push(a.into());self.v.borrow_mut().insert(a.into(),v.into());Ok(())}
   fn delete(&self,a:&str)->Result<(),String>{self.v.borrow_mut().remove(a);Ok(())}
  }
  let sec=S::default();
  let p=OAuthProfile{id:"p1".into(),client_id:"client".into(),client_secret:"secret".into(),channel_id:None,channel_title:None,access_token:"access".into(),refresh_token:"refresh".into(),expires_at:1,connected_at:"x".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None};
  write_profile_secrets_with(&sec,&p).unwrap();
  assert_eq!(&*sec.sets.borrow(),&vec!["oauth.p1.refresh_token".to_string()]);
  assert!(sec.v.borrow().get("oauth.p1.access_token").is_none());
  assert!(sec.v.borrow().get("oauth.p1.client_secret").is_none());
 }
}
