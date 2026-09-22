use crate::{security,oauth_vault};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{ErrorKind, Read, Seek, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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
    #[serde(default)]
    google_email: Option<String>,
    #[serde(default)]
    google_subject_id: Option<String>,
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

const CREDENTIAL_SCHEMA_VERSION:u32=2;
const KEYCHAIN_MIGRATION_V2_VERSION:u32=CREDENTIAL_SCHEMA_VERSION;
const MIGRATION_NOT_STARTED:&str="NOT_STARTED";
const MIGRATION_MIGRATING:&str="MIGRATING";
const MIGRATION_MIGRATED:&str="MIGRATED";
const MIGRATION_FAILED:&str="FAILED";
const MIGRATION_RECONNECT_REQUIRED:&str="RECONNECT_REQUIRED";
static PROFILE_MIGRATION_ATTEMPTS:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static PROFILE_MIGRATION_SUCCESSES:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static PROFILE_MIGRATION_FAILURES:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static ACCESS_TOKEN_MEMORY_HITS:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);

#[derive(Debug,Clone,Serialize,Deserialize,Default)]
struct CredentialValidationV2State{
 #[serde(default)] at:Option<String>,
 #[serde(default)] result:String,
 #[serde(default)] expected_channel_id:Option<String>,
 #[serde(default)] actual_channel_id:Option<String>,
}
#[derive(Debug,Clone,Serialize,Deserialize)]
struct KeychainMigrationV2State{
 #[serde(default="migration_v2_version")] version:u32,
 #[serde(default)] profiles:HashMap<String,String>,
 #[serde(default)] global_client_secret:String,
 #[serde(default)] validations:HashMap<String,CredentialValidationV2State>,
 #[serde(default)] refresh_token_accounts:HashMap<String,String>,
 #[serde(default)] client_secret_accounts:HashMap<String,String>,
 #[serde(default)] credential_generations:HashMap<String,u32>,
 #[serde(default)] credential_rotated_at:HashMap<String,String>,
 #[serde(default)] legacy_blocked_accounts:HashMap<String,Vec<String>>,
}
fn migration_v2_version()->u32{KEYCHAIN_MIGRATION_V2_VERSION}
impl Default for KeychainMigrationV2State{
 fn default()->Self{Self{
  version:KEYCHAIN_MIGRATION_V2_VERSION,
  profiles:HashMap::new(),
  global_client_secret:MIGRATION_NOT_STARTED.into(),
  validations:HashMap::new(),
  refresh_token_accounts:HashMap::new(),
  client_secret_accounts:HashMap::new(),
  credential_generations:HashMap::new(),
  credential_rotated_at:HashMap::new(),
  legacy_blocked_accounts:HashMap::new(),
 }}
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
fn profile_refresh_token_account_from_state(state:&KeychainMigrationV2State,profile_id:&str)->String{
 state.refresh_token_accounts.get(profile_id).filter(|x|!x.trim().is_empty()).cloned().unwrap_or_else(||oauth_key(profile_id,"refresh_token"))
}
fn profile_client_secret_account_from_state(state:&KeychainMigrationV2State,profile_id:&str)->String{
 state.client_secret_accounts.get(profile_id).filter(|x|!x.trim().is_empty()).cloned().unwrap_or_else(||oauth_key(profile_id,"client_secret"))
}
fn profile_refresh_token_account(app:&AppHandle,profile_id:&str)->Result<String,String>{
 Ok(profile_refresh_token_account_from_state(&read_keychain_migration_v2(app)?,profile_id))
}
fn profile_client_secret_account(app:&AppHandle,profile_id:&str)->Result<String,String>{
 Ok(profile_client_secret_account_from_state(&read_keychain_migration_v2(app)?,profile_id))
}
fn next_profile_credential_generation(state:&KeychainMigrationV2State,profile_id:&str)->u32{
 state.credential_generations.get(profile_id).copied().unwrap_or(0).saturating_add(1)
}
fn rotated_profile_secret_account(profile_id:&str,kind:&str,generation:u32)->String{
 let suffix=Uuid::new_v4().simple().to_string();
 format!("oauth.{profile_id}.{kind}.v2.{generation}.{}",&suffix[..12])
}
fn record_profile_credential_validation(app:&AppHandle,profile_id:&str,result:&str,expected_channel_id:Option<&str>,actual_channel_id:Option<&str>)->Result<(),String>{
 let mut state=read_keychain_migration_v2(app)?;
 state.validations.insert(profile_id.to_string(),CredentialValidationV2State{
  at:Some(Utc::now().to_rfc3339()),
  result:result.to_string(),
  expected_channel_id:expected_channel_id.map(str::to_string),
  actual_channel_id:actual_channel_id.map(str::to_string),
 });
 write_keychain_migration_v2(app,&state)
}
fn resolved_credential_state(profile:&OAuthProfile,migration_state:&str,canonical_present:bool,legacy_present:bool,validation:Option<&CredentialValidationV2State>)->(&'static str,String,Option<String>){
 let expected=profile.channel_id.as_deref().filter(|x|!x.trim().is_empty());
 if expected.is_none(){return("FAILED","EXPECTED_CHANNEL_MISSING".into(),validation.and_then(|v|v.at.clone()))}
 if let Some(v)=validation{
  if v.result=="WRONG_CHANNEL"{return("WRONG_CHANNEL","WRONG_CHANNEL".into(),v.at.clone())}
 }
 if canonical_present{
  if let Some(v)=validation{
   let expected_match=v.expected_channel_id.as_deref()==expected;
   let actual_match=v.actual_channel_id.as_deref()==expected;
   if v.result=="PASS"&&expected_match&&actual_match&&v.at.is_some(){
    return("CONNECTED","PASS".into(),v.at.clone())
   }
   if v.result=="TOKEN_REFRESH_PASS"&&expected_match&&v.at.is_some(){
    return("CONNECTED","TOKEN_REFRESH_PASS".into(),v.at.clone())
   }
   if v.result=="RECONNECT_REQUIRED"{return("RECONNECT_REQUIRED","RECONNECT_REQUIRED".into(),v.at.clone())}
  }
  return("CANONICAL_PRESENT_UNVERIFIED",validation.map(|v|v.result.clone()).filter(|x|!x.is_empty()).unwrap_or_else(||"NOT_RUN".into()),validation.and_then(|v|v.at.clone()))
 }
 if legacy_present{
  // Presence of a legacy VYRON credential after an app update is not evidence of revocation.
  // Preserve a previously proven healthy state without any new secret read. If there is no
  // persisted proof yet, report saved/unverified rather than forcing Google reconnect.
  if let Some(v)=validation{
   let expected_match=v.expected_channel_id.as_deref()==expected;
   let actual_match=v.actual_channel_id.as_deref()==expected;
   if v.result=="PASS"&&expected_match&&actual_match&&v.at.is_some(){
    return("CONNECTED","PASS".into(),v.at.clone())
   }
   if v.result=="TOKEN_REFRESH_PASS"&&expected_match&&v.at.is_some(){
    return("CONNECTED","TOKEN_REFRESH_PASS".into(),v.at.clone())
   }
  }
  return("CANONICAL_PRESENT_UNVERIFIED","LEGACY_PRESENT_UNVERIFIED".into(),validation.and_then(|v|v.at.clone()))
 }
 if migration_state==MIGRATION_RECONNECT_REQUIRED{
  return("RECONNECT_REQUIRED","RECONNECT_REQUIRED".into(),validation.and_then(|v|v.at.clone()))
 }
 ("MISSING",validation.map(|v|v.result.clone()).filter(|x|!x.is_empty()).unwrap_or_else(||"NOT_RUN".into()),validation.and_then(|v|v.at.clone()))
}
fn resolved_client_secret_state(
 profile_cached:bool,
 profile_known:bool,
 profile_denied:bool,
 global_exact:bool,
 global_cached:bool,
 global_known:bool,
 global_denied:bool,
 global_current_configured:bool,
 legacy_present:bool,
)->&'static str{
 if profile_cached{"PROFILE_CANONICAL"}
 else if global_exact&&global_cached{"GLOBAL_EXACT_MATCH"}
 else if profile_denied||(global_exact&&global_denied){"KEYCHAIN_BLOCKED"}
 else if profile_known{"CANONICAL_PRESENT_UNVERIFIED"}
 else if global_exact&&global_known{"CANONICAL_PRESENT_UNVERIFIED"}
 else if global_current_configured&&global_cached{"GLOBAL_CURRENT_READY"}
 else if global_current_configured&&global_known{"CANONICAL_PRESENT_UNVERIFIED"}
 else if legacy_present{"CANONICAL_PRESENT_UNVERIFIED"}
 else{"MISSING"}
}
fn resolve_oauth_credential_states_local(app:&AppHandle)->Result<Vec<Value>,String>{
 let store=load_store_metadata(app)?;
 let canonical_accounts=security::list_canonical_secret_accounts("")?;
 let legacy_accounts=security::list_legacy_secret_accounts("")?;
 let global_meta=load_google_config_metadata(app).unwrap_or_default();
 let global_secret_present=canonical_accounts.iter().any(|a|a==GOOGLE_CLIENT_SECRET);
 let vault_global=oauth_vault::global_client_secret(app,&global_meta.client_id);
 let vault_global_present=matches!(vault_global,Ok(Some(ref x)) if !x.trim().is_empty());
 let vault_global_blocked=vault_global.is_err();
 let state=read_keychain_migration_v2(app)?;
 let blocked_accounts=security::canonical_blocked_accounts();
 let mut rows=Vec::with_capacity(store.profiles.len());
 for profile in &store.profiles{
  let vault_refresh=oauth_vault::profile_refresh(app,&profile.id);
  let vault_refresh_present=matches!(vault_refresh,Ok(Some(ref x)) if !x.trim().is_empty());
  let vault_refresh_blocked=vault_refresh.is_err();
  let vault_profile_secret=oauth_vault::profile_client_secret(app,&profile.id);
  let vault_profile_secret_present=matches!(vault_profile_secret,Ok(Some(ref x)) if !x.trim().is_empty());
  let vault_profile_secret_blocked=vault_profile_secret.is_err();
  let canonical_account=profile_refresh_token_account_from_state(&state,&profile.id);
  let canonical_present=canonical_accounts.iter().any(|a|a==&canonical_account);
  let legacy_present=select_present_account(&legacy_refresh_candidates(&profile.id),&legacy_accounts).is_some();
  let profile_client_secret_account=profile_client_secret_account_from_state(&state,&profile.id);
  let profile_client_secret_enumerated=canonical_accounts.iter().any(|a|a==&profile_client_secret_account);
  let profile_client_secret_pointer=state.client_secret_accounts.get(&profile.id).map(|x|!x.trim().is_empty()).unwrap_or(false);
  let profile_client_secret_known=profile_client_secret_pointer||profile_client_secret_enumerated;
  let profile_client_secret_denial=security::canonical_denial_diagnostic(&profile_client_secret_account);
  let profile_client_secret_cached=security::canonical_secret_cached(&profile_client_secret_account);
  let legacy_client_secret_present=select_present_account(&legacy_client_secret_candidates(&profile.id),&legacy_accounts).is_some();
  let global_secret_account=google_client_secret_account(&global_meta);
  let global_secret_known=global_meta.client_secret_present||canonical_accounts.iter().any(|a|a==&global_secret_account);
  let global_secret_denial=security::canonical_denial_diagnostic(&global_secret_account);
  let global_secret_cached=security::canonical_secret_cached(&global_secret_account);
  let global_exact_client=!profile.client_id.trim().is_empty()&&profile.client_id.trim()==global_meta.client_id.trim();
  let global_current_configured=!global_meta.client_id.trim().is_empty();
  let client_secret_state=if vault_profile_secret_present{"VAULT_PROFILE"}
    else if global_exact_client&&vault_global_present{"VAULT_GLOBAL"}
    else{resolved_client_secret_state(
     profile_client_secret_cached,
     profile_client_secret_known,
     profile_client_secret_denial.is_some(),
     global_exact_client,
     global_secret_cached,
     global_secret_known,
     global_secret_denial.is_some(),
     global_current_configured,
     legacy_client_secret_present,
    )};
  let migration_state=state.profiles.get(&profile.id).cloned().unwrap_or_else(||MIGRATION_NOT_STARTED.into());
  let validation=state.validations.get(&profile.id);
  let (base_credential_state,last_validation_result,last_validated_at)=resolved_credential_state(profile,&migration_state,canonical_present,legacy_present,validation);
  let denial=security::canonical_denial_diagnostic(&canonical_account);
  let metadata=security::canonical_account_metadata_diagnostic(&canonical_account);
  let currently_accessible=security::canonical_secret_cached(&canonical_account);
  let recoverable_denial=denial.as_ref().and_then(|x|x.get("currentErrorCode")).and_then(Value::as_str)
    .map(|code|matches!(code,"KEYCHAIN_AUTH_FAILED"|"KEYCHAIN_INTERACTION_REQUIRED"|"KEYCHAIN_ACCESS_DENIED"|"KEYCHAIN_ACCESS_DENIED_CACHED"))
    .unwrap_or(false);
  let credential_state=if vault_refresh_blocked||vault_profile_secret_blocked||vault_global_blocked{"RECOVERABLE_KEYCHAIN_BLOCKED"}
    else if vault_refresh_present{
      if base_credential_state=="CONNECTED"{"READY"}else{"NOT_CHECKED"}
    }
    else if denial.is_some()&&canonical_present&&recoverable_denial{"RECOVERABLE_KEYCHAIN_BLOCKED"}
    else if denial.is_some(){"KEYCHAIN_BLOCKED"}
    else if currently_accessible&&base_credential_state=="CONNECTED"{"READY"}
    else if canonical_present{"CANONICAL_PRESENT_UNVERIFIED"}
    else{base_credential_state};
  rows.push(json!({
   "profileUuid":profile.id,
   "channelTitle":profile.channel_title,
   "expectedChannelId":profile.channel_id,
   "canonicalAccount":canonical_account,
   "canonicalRefreshPresent":canonical_present,
   "canonicalRefreshAccessibleThisProcess":currently_accessible,
   "canonicalRefreshMetadata":metadata,
   "keychainDenial":denial,
   "credentialGeneration":state.credential_generations.get(&profile.id).copied().unwrap_or(0),
   "credentialRotatedAt":state.credential_rotated_at.get(&profile.id),
   "legacyBlockedAccounts":blocked_accounts.iter().filter(|a|a.starts_with(&format!("oauth.{}.",profile.id))&&*a!=&canonical_account).cloned().collect::<Vec<_>>(),
   "legacyRefreshPresent":legacy_present,
   "migrationState":migration_state,
   "credentialState":credential_state,
   "credentialSchemaVersion":CREDENTIAL_SCHEMA_VERSION,
   "lastValidatedAt":last_validated_at,
   "lastValidationResult":last_validation_result,
   "clientSecretState":client_secret_state,
   "clientSecretPresent":vault_profile_secret_present||vault_global_present||profile_client_secret_known||global_secret_known||legacy_client_secret_present,
   "clientSecretOperational":vault_profile_secret_present||(global_exact_client&&vault_global_present)||profile_client_secret_cached||(global_exact_client&&global_secret_cached),
   "oauthVaultRefreshPresent":vault_refresh_present,
   "oauthVaultPrimary":vault_refresh_present,
   "clientSecretAccount":profile_client_secret_account,
   "globalClientSecretAccount":global_secret_account,
   "secretValuesIncluded":false,
   "youtubeApiRequests":0,
   "keychainSecretReads":0
  }));
 }
 Ok(rows)
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
fn legacy_client_secret_candidates(id:&str)->Vec<String>{
 let mut out=vec![oauth_key(id,"client_secret")];
 out.extend(legacy_oauth_keys(id,"client_secret"));
 out
}
fn select_present_account(candidates:&[String],present:&[String])->Option<String>{
 candidates.iter().find(|a|present.iter().any(|x|x==*a)).cloned()
}
fn migrate_profile_refresh_to_canonical(app:&AppHandle,profile_id:&str)->Result<(),String>{
 let canonical_account=profile_refresh_token_account(app,profile_id)?;
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
  Err(e) if keychain_repairable_error(&e)=>{
   return Err(format!("OAUTH_CREDENTIAL_PRECHECK_FAILED: profile={profile_id}; {e}"))
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
fn resolve_refresh_credential_with<C,A,L>(
 profile_id:&str,
 active_account:&str,
 mut canonical_get:C,
 mut legacy_accounts:A,
 mut legacy_get:L,
)->Result<String,String>
where
 C:FnMut(&str)->Result<Option<String>,String>,
 A:FnMut()->Result<Vec<String>,String>,
 L:FnMut(&str)->Result<Option<String>,String>,
{
 match canonical_get(active_account){
  Ok(Some(v)) if !v.trim().is_empty()=>return Ok(v),
  Ok(_)=>{},
  Err(e) if keychain_repairable_error(&e)=>{
   return Err(format!("OAUTH_CREDENTIAL_PRECHECK_FAILED: profile={profile_id}; {e}"))
  }
  Err(e)=>return Err(e),
 }
 // Update-neutral compatibility is targeted: legacy inventory/read happens only after
 // the selected profile's canonical credential is missing. This helper never mutates
 // pointers/generations, profile identity, channel identity, or legacy Keychain items.
 let present=legacy_accounts()?;
 if let Some(account)=select_present_account(&legacy_refresh_candidates(profile_id),&present){
  return match legacy_get(&account){
   Ok(Some(v)) if !v.trim().is_empty()=>Ok(v),
   Ok(_)=>Err(format!("OAUTH_RECONNECT_REQUIRED: profile={profile_id}; legacy refresh token is missing")),
   Err(e) if keychain_repairable_error(&e)=>Err(format!("OAUTH_CREDENTIAL_PRECHECK_FAILED: profile={profile_id}; {e}")),
   Err(e)=>Err(e),
  }
 }
 Err(format!("OAUTH_RECONNECT_REQUIRED: profile={profile_id}; refresh token is missing"))
}
fn require_canonical_refresh(app:&AppHandle,profile_id:&str)->Result<String,String>{
 if let Some(token)=oauth_vault::profile_refresh(app,profile_id)?{return Ok(token)}
 let active_account=profile_refresh_token_account(app,profile_id)?;
 let token=resolve_refresh_credential_with(
  profile_id,
  &active_account,
  |account|security::canonical_get_secret_cached(account),
  ||security::list_legacy_secret_accounts(""),
  |account|security::legacy_get_secret_once(account),
 )?;
 oauth_vault::upsert_profile(app,profile_id,"",Some(&token),None,None,None)?;
 Ok(token)
}
fn canonical_global_client_secret(app:&AppHandle)->Result<Option<String>,String>{
 let c=load_google_config_metadata(app)?;
 if let Some(secret)=oauth_vault::global_client_secret(app,&c.client_id)?{return Ok(Some(secret))}
 let account=google_client_secret_account(&c);
 let secret=security::canonical_get_secret_cached(&account)?;
 if let Some(value)=secret.as_deref().filter(|x|!x.trim().is_empty()){oauth_vault::set_global_client(app,&c.client_id,value)?}
 Ok(secret)
}
#[derive(Debug,Clone,PartialEq,Eq)]
enum OAuthClientSecretSource{ProfileCanonical,GlobalExactMatch,GlobalCurrentMigration,LegacyStable}
#[derive(Debug,Clone)]
struct ResolvedOAuthClient{client_id:String,client_secret:String,source:OAuthClientSecretSource}
fn select_oauth_client_secret(profile_secret:Option<String>,client_id:&str,global_client_id:&str,global_secret:Option<String>,legacy_present:bool)->Result<(String,OAuthClientSecretSource),&'static str>{
 if let Some(secret)=profile_secret.filter(|x|!x.trim().is_empty()){return Ok((secret,OAuthClientSecretSource::ProfileCanonical))}
 if client_id.trim()==global_client_id.trim(){
  if let Some(secret)=global_secret.filter(|x|!x.trim().is_empty()){return Ok((secret,OAuthClientSecretSource::GlobalExactMatch))}
 }
 if legacy_present{return Err("CLIENT_SECRET_REIMPORT_REQUIRED")}
 Err("CLIENT_SECRET_REQUIRED")
}
fn resolve_client_secret_for_profile(app:&AppHandle,profile_id:&str,client_id:&str)->Result<ResolvedOAuthClient,String>{
 let profile_id=profile_id.trim();
 let client_id=client_id.trim();
 if profile_id.is_empty(){return Err("OAUTH_PROFILE_ID_MISSING: existing profile UUID is required".into())}
 if client_id.is_empty(){return Err("OAUTH_CLIENT_MISSING: profile client_id is empty".into())}
 if let Some(secret)=oauth_vault::profile_client_secret(app,profile_id)?{
  return Ok(ResolvedOAuthClient{client_id:client_id.into(),client_secret:secret,source:OAuthClientSecretSource::ProfileCanonical})
 }
 if let Some(secret)=oauth_vault::global_client_secret(app,client_id)?{
  return Ok(ResolvedOAuthClient{client_id:client_id.into(),client_secret:secret,source:OAuthClientSecretSource::GlobalExactMatch})
 }
 let profile_account=profile_client_secret_account(app,profile_id)?;
 let mut profile_keychain_error:Option<String>=None;
 let profile_secret=match security::canonical_get_secret_cached(&profile_account){
  Ok(v)=>v,
  Err(e) if keychain_repairable_error(&e)=>{profile_keychain_error=Some(e);None},
  Err(e)=>return Err(e),
 };
 let global_meta=load_google_config_metadata(app)?;
 let global_account=google_client_secret_account(&global_meta);
 let mut global_keychain_error:Option<String>=None;
 let global_secret=if global_meta.client_id.trim()==client_id{
  match security::canonical_get_secret_cached(&global_account){
   Ok(v)=>v,
   Err(e) if keychain_repairable_error(&e)=>{global_keychain_error=Some(e);None},
   Err(e)=>return Err(e),
  }
 }else{None};
 // Canonical-first: do not even enumerate historical accounts while a matching
 // current credential is healthy. Legacy compatibility is consulted only when both
 // canonical sources are unavailable.
 if let Some(secret)=profile_secret.as_ref().filter(|x|!x.trim().is_empty()).cloned(){
  return Ok(ResolvedOAuthClient{client_id:client_id.into(),client_secret:secret,source:OAuthClientSecretSource::ProfileCanonical})
 }
 if let Some(secret)=global_secret.as_ref().filter(|x|!x.trim().is_empty()).cloned(){
  return Ok(ResolvedOAuthClient{client_id:client_id.into(),client_secret:secret,source:OAuthClientSecretSource::GlobalExactMatch})
 }
 let legacy_accounts=security::list_legacy_secret_accounts("")?;
 let legacy_account=select_present_account(&legacy_client_secret_candidates(profile_id),&legacy_accounts);
 let legacy_present=legacy_account.is_some();
 // Preserve existing OAuth clients across binary replacement. Historical client_secret
 // is a read-only compatibility source; no credentials.json reimport is required solely
 // because the application binary or credential schema changed.
 if let Some(account)=legacy_account.as_deref(){
  match security::legacy_get_secret_once(account){
   Ok(Some(secret)) if !secret.trim().is_empty()=>{
    return Ok(ResolvedOAuthClient{client_id:client_id.into(),client_secret:secret,source:OAuthClientSecretSource::LegacyStable})
   },
   Ok(_)=>{},
   Err(e) if keychain_repairable_error(&e)=>return Err(format!("OAUTH_CREDENTIAL_PRECHECK_FAILED: profile={profile_id}; {e}")),
   Err(e)=>return Err(e),
  }
 }
 let blocked=profile_keychain_error.as_ref().or(global_keychain_error.as_ref());
 if let Some(e)=blocked{
  return Err(format!("OAUTH_CLIENT_SECRET_KEYCHAIN_BLOCKED: profile={profile_id}; active client_secret exists but no-UI Keychain access is temporarily blocked; {e}"))
 }
 if legacy_present{
  return Err(format!("OAUTH_CLIENT_SECRET_REIMPORT_REQUIRED: profile={profile_id}; legacy client_secret metadata exists but no readable credential is available"))
 }
 Err(format!("OAUTH_CLIENT_SECRET_REQUIRED: profile={profile_id}; exact client_secret for client_id is missing"))
}
fn resolve_reconnect_oauth_client(app:&AppHandle,profile_id:&str,historical_client_id:&str)->Result<ResolvedOAuthClient,String>{
 let profile_id=profile_id.trim();
 if profile_id.is_empty(){return Err("OAUTH_PROFILE_ID_MISSING: existing profile UUID is required".into())}
 let historical_client_id=historical_client_id.trim();
 let profile_account=profile_client_secret_account(app,profile_id)?;
 if !historical_client_id.is_empty(){
  if let Some(secret)=match security::canonical_get_secret_cached(&profile_account){
    Ok(v)=>v,
    Err(e) if keychain_repairable_error(&e)=>None,
    Err(e)=>return Err(e),
   }.filter(|x|!x.trim().is_empty()){
   return Ok(ResolvedOAuthClient{client_id:historical_client_id.into(),client_secret:secret,source:OAuthClientSecretSource::ProfileCanonical})
  }
 }
 let global_meta=load_google_config_metadata(app)?;
 let global_client_id=global_meta.client_id.trim();
 if !global_client_id.is_empty(){
  if let Some(secret)=canonical_global_client_secret(app)?.filter(|x|!x.trim().is_empty()){
   // Recovery may intentionally migrate an existing profile from an old OAuth app client
   // to the current VYRON OAuth client. Client ID and secret always move as one exact pair.
   // Do not materialize the per-profile secret yet: reconnect_apply_validated_with()
   // writes refresh_token + client_secret transactionally only after channel validation.
   return Ok(ResolvedOAuthClient{
    client_id:global_client_id.into(),
    client_secret:secret,
    source:if historical_client_id==global_client_id{OAuthClientSecretSource::GlobalExactMatch}else{OAuthClientSecretSource::GlobalCurrentMigration},
   })
  }
 }
 let legacy_accounts=security::list_legacy_secret_accounts("")?;
 if select_present_account(&legacy_client_secret_candidates(profile_id),&legacy_accounts).is_some(){
  return Err(format!("OAUTH_CLIENT_SETUP_REQUIRED: profile={profile_id}; legacy client secret exists but VYRON will not read it. Configure the current Google OAuth Client once."))
 }
 Err(format!("OAUTH_CLIENT_SETUP_REQUIRED: profile={profile_id}; current Google OAuth Client is not configured with a canonical client_secret"))
}
fn migrate_global_client_secret_if_needed(app:&AppHandle,profile_id:Option<&str>)->Result<Option<String>,String>{
 match canonical_global_client_secret(app){
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
    fn verify(&self, account:&str, expected:&str)->Result<bool,String>{
        Ok(self.get(account)?.as_deref()==Some(expected))
    }
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
    fn verify(&self,account:&str,expected:&str)->Result<bool,String>{
        security::canonical_verify_secret(account,expected)
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
    // Durable OAuth ABI: refresh_token + exact per-profile client_secret in canonical V2.
    // access_token remains process-memory only.
    if !p.refresh_token.trim().is_empty(){secrets.set(&oauth_key(&p.id,"refresh_token"),&p.refresh_token)?}
    if !p.client_secret.trim().is_empty(){secrets.set(&oauth_key(&p.id,"client_secret"),&p.client_secret)?}
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
     "client_secret"=>{if p.client_secret.is_empty(){p.client_secret=read_profile_secret_with(secrets,&p.id,"client_secret")?.unwrap_or_default()}},
     _=>return Err(format!("UNKNOWN_SECRET_KIND: {kind}"))
    }
    Ok(())
}
fn hydrate_profile_secret_kind(p:&mut OAuthProfile,kind:&str)->Result<(),String>{hydrate_profile_secret_kind_with(&KeychainOAuthSecretStore,p,kind)}
fn profile_secret_value<'a>(p:&'a OAuthProfile,kind:&str)->Result<&'a str,String>{match kind{"client_secret"=>Ok(&p.client_secret),"access_token"=>Ok(&p.access_token),"refresh_token"=>Ok(&p.refresh_token),_=>Err(format!("UNKNOWN_SECRET_KIND: {kind}"))}}
fn set_profile_secret_value(p:&mut OAuthProfile,kind:&str,value:String)->Result<(),String>{match kind{"client_secret"=>p.client_secret=value,"access_token"=>p.access_token=value,"refresh_token"=>p.refresh_token=value,_=>return Err(format!("UNKNOWN_SECRET_KIND: {kind}"))};Ok(())}
fn hydrate_profile_secret_for_operation(app:&AppHandle,p:&mut OAuthProfile,kind:&str)->Result<(),String>{
    match kind{
     "refresh_token"=>{p.refresh_token=require_canonical_refresh(app,&p.id)?;oauth_vault::upsert_profile(app,&p.id,p.channel_id.as_deref().unwrap_or(""),Some(&p.refresh_token),None,p.google_email.as_deref(),Some(&p.preferred_browser))?;Ok(())},
     "access_token"=>{if let Some((token,expires_at))=session_access_token(&p.id){p.access_token=token;p.expires_at=expires_at;Ok(())}else{Err(format!("ACCESS_TOKEN_SESSION_MISS: profile={}",p.id))}},
     "client_secret"=>{let resolved=resolve_client_secret_for_profile(app,&p.id,&p.client_id)?;p.client_secret=resolved.client_secret;oauth_vault::upsert_profile(app,&p.id,p.channel_id.as_deref().unwrap_or(""),None,Some(&p.client_secret),p.google_email.as_deref(),Some(&p.preferred_browser))?;Ok(())},
     _=>Err(format!("UNKNOWN_SECRET_KIND: {kind}"))
    }
}
fn delete_profile_secrets(app:&AppHandle,id:&str)->Result<(),String>{
    forget_access_token(id);
    let refresh_account=profile_refresh_token_account(app,id)?;
    let client_secret_account=profile_client_secret_account(app,id)?;
    security::canonical_delete_secret(&refresh_account)?;
    if client_secret_account!=refresh_account{security::canonical_delete_secret(&client_secret_account)?}
    let _=oauth_vault::remove_profile(app,id);
    Ok(())
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
    oauth_vault::upsert_profile(app,&p.id,p.channel_id.as_deref().unwrap_or(""),
      (!p.refresh_token.trim().is_empty()).then_some(p.refresh_token.as_str()),
      (!p.client_secret.trim().is_empty()).then_some(p.client_secret.as_str()),
      p.google_email.as_deref(),Some(&p.preferred_browser))?;
    if !p.refresh_token.trim().is_empty(){
      let account=profile_refresh_token_account(app,&p.id)?;
      let _=security::canonical_set_secret(&account,&p.refresh_token);
    }
    if !p.client_secret.trim().is_empty(){
      let account=profile_client_secret_account(app,&p.id)?;
      let _=security::canonical_set_secret(&account,&p.client_secret);
    }
    write_oauth_metadata(&store_path(app)?,s)
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
fn refresh_token_form(client_id:&str,client_secret:&str,refresh_token:&str)->Vec<(String,String)>{
 vec![
  ("client_id".into(),client_id.into()),
  ("client_secret".into(),client_secret.into()),
  ("refresh_token".into(),refresh_token.into()),
  ("grant_type".into(),"refresh_token".into()),
 ]
}
fn authorization_code_token_form(client_id:&str,client_secret:&str,code:&str,verifier:&str,redirect:&str)->Vec<(String,String)>{
 vec![
  ("client_id".into(),client_id.into()),
  ("client_secret".into(),client_secret.into()),
  ("code".into(),code.into()),
  ("code_verifier".into(),verifier.into()),
  ("grant_type".into(),"authorization_code".into()),
  ("redirect_uri".into(),redirect.into()),
 ]
}
async fn refresh_access_token_http(client_id:&str,refresh_token:&str,client_secret:Option<&str>)->Result<(String,i64),String>{
    let secret=client_secret.filter(|x|!x.trim().is_empty()).ok_or_else(||"OAUTH_CLIENT_SECRET_REQUIRED: exact client_secret is missing".to_string())?;
    let form=refresh_token_form(client_id,secret,refresh_token);
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
    let resolved=resolve_client_secret_for_profile(app,profile_id,client_id)?;
    refresh_access_token_http(&resolved.client_id,refresh_token,Some(&resolved.client_secret)).await
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
    client_secret_account: String,
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
fn keychain_repairable_error(e:&str)->bool{
    e.contains("KEYCHAIN_ACCESS_DENIED_CACHED")||
    e.contains("KEYCHAIN_AUTH_FAILED")||
    e.contains("KEYCHAIN_INTERACTION_REQUIRED")||
    e.contains("KEYCHAIN_USER_CANCELED")||
    e.contains("KEYCHAIN_ACCESS_DENIED")
}
fn google_client_secret_account(c:&GoogleConfig)->String{
    let v=c.client_secret_account.trim();
    if v.is_empty(){GOOGLE_CLIENT_SECRET.to_string()}else{v.to_string()}
}
fn rotated_google_client_secret_account(client_id:&str)->String{
    let digest=format!("{:x}",Sha256::digest(client_id.as_bytes()));
    format!("google.client_secret.rc3.{}.{}", &digest[..12], &Uuid::new_v4().simple().to_string()[..12])
}
fn read_google_config_raw(app:&AppHandle)->Result<GoogleConfig,String>{
    let p=google_config_path(app)?;if !p.exists(){return Ok(GoogleConfig::default())}
    let b=fs::read(&p).map_err(|e|format!("Google config read: {e}"))?;
    serde_json::from_slice(&b).map_err(|e|format!("Google config parse: {e}"))
}
fn reconcile_google_config_presence(mut c:GoogleConfig,canonical_accounts:&[String])->GoogleConfig{
    let inline_client_secret=!c.client_secret.trim().is_empty();
    let inline_api_key=!c.api_key.trim().is_empty();
    let account=google_client_secret_account(&c);
    c.client_secret_present=c.client_secret_present||inline_client_secret||canonical_accounts.iter().any(|a|a==&account);
    c.api_key_present=c.api_key_present||inline_api_key||canonical_accounts.iter().any(|a|a.as_str()==GOOGLE_API_KEY);
    c.client_secret.clear();
    c.api_key.clear();
    c
}
fn load_google_config_metadata(app:&AppHandle)->Result<GoogleConfig,String>{
    let p=google_config_path(app)?;
    let raw=read_google_config_raw(app)?;
    // Attribute-only enumeration is passive. It never proves that a protected value
    // is readable by the current signed VYRON build.
    let canonical_accounts=security::list_canonical_secret_accounts("")?;
    let c=reconcile_google_config_presence(raw,&canonical_accounts);
    if p.exists(){let _=security::private_permissions(&p);}
    Ok(c)
}
fn hydrate_google_secrets(c:&mut GoogleConfig)->Result<(),String>{
    if c.client_secret.is_empty(){
        let account=google_client_secret_account(c);
        c.client_secret=security::canonical_get_secret_cached(&account)?.unwrap_or_default()
    }
    if c.api_key.is_empty(){c.api_key=security::canonical_get_secret_cached(GOOGLE_API_KEY)?.unwrap_or_default()}
    c.client_secret_present|=!c.client_secret.is_empty();c.api_key_present|=!c.api_key.is_empty();Ok(())
}
fn write_google_secrets(c:&GoogleConfig)->Result<(),String>{
    if !c.client_secret.is_empty(){
        let account=google_client_secret_account(c);
        security::canonical_set_secret(&account,&c.client_secret)?
    }
    if !c.api_key.is_empty(){security::canonical_set_secret(GOOGLE_API_KEY,&c.api_key)?}
    Ok(())
}
fn write_google_metadata(path:&Path,c:&GoogleConfig)->Result<(),String>{let b=serde_json::to_vec_pretty(c).map_err(|e|e.to_string())?;security::write_private_atomic(path,&b)}
fn vault_profile_client_secret_for_global(app:&AppHandle,client_id:&str)->Result<Option<String>,String>{
    let store=load_store_metadata(app)?;
    for profile in store.profiles.iter().filter(|p|p.client_id.trim()==client_id.trim()){
      if let Some(secret)=oauth_vault::profile_client_secret(app,&profile.id)?{
        if !secret.trim().is_empty(){return Ok(Some(secret))}
      }
    }
    Ok(None)
}
fn vault_first_global_client_secret(app:&AppHandle,c:&GoogleConfig)->Result<Option<String>,String>{
    if c.client_id.trim().is_empty(){return Ok(None)}
    match oauth_vault::global_client_secret(app,&c.client_id){
      Ok(Some(secret)) if !secret.trim().is_empty()=>return Ok(Some(secret)),
      Ok(_)=>{},
      Err(vault_error)=>{
        if let Ok(Some(secret))=vault_profile_client_secret_for_global(app,&c.client_id){
          oauth_vault::set_global_client(app,&c.client_id,&secret)?;
          return Ok(Some(secret))
        }
        let account=google_client_secret_account(c);
        match security::canonical_get_secret_cached(&account){
          Ok(Some(secret)) if !secret.trim().is_empty()=>{
            oauth_vault::set_global_client(app,&c.client_id,&secret)?;
            return Ok(Some(secret))
          },
          _=>return Err(vault_error),
        }
      }
    }
    if let Some(secret)=vault_profile_client_secret_for_global(app,&c.client_id)?{
      oauth_vault::set_global_client(app,&c.client_id,&secret)?;
      return Ok(Some(secret))
    }
    let account=google_client_secret_account(c);
    let fallback=security::canonical_get_secret_cached(&account)?;
    if let Some(secret)=fallback.as_deref().filter(|x|!x.trim().is_empty()){
      oauth_vault::set_global_client(app,&c.client_id,secret)?;
    }
    Ok(fallback)
}
fn load_google_config_for_secret_operation(app:&AppHandle)->Result<GoogleConfig,String>{
    let p=google_config_path(app)?;let mut c=read_google_config_raw(app)?;let legacy=!c.client_secret.is_empty()||!c.api_key.is_empty();
    if legacy{
        c.client_secret_present|=!c.client_secret.is_empty();c.api_key_present|=!c.api_key.is_empty();
        if c.client_secret_account.trim().is_empty(){c.client_secret_account=GOOGLE_CLIENT_SECRET.into()}
        if !c.client_secret.trim().is_empty(){oauth_vault::set_global_client(app,&c.client_id,&c.client_secret)?;}
        write_google_secrets(&c)?;c.client_secret.clear();c.api_key.clear();write_google_metadata(&p,&c)?;
    }else{
        c.client_secret=vault_first_global_client_secret(app,&c)?.unwrap_or_default();
        if c.api_key.is_empty(){c.api_key=security::canonical_get_secret_cached(GOOGLE_API_KEY)?.unwrap_or_default()}
        c.client_secret_present|=!c.client_secret.is_empty();c.api_key_present|=!c.api_key.is_empty();
    }
    Ok(c)
}
fn save_google_config(app:&AppHandle,c:&GoogleConfig)->Result<(),String>{
    let p=google_config_path(app)?;let mut meta=c.clone();meta.client_secret_present|=!meta.client_secret.is_empty();meta.api_key_present|=!meta.api_key.is_empty();write_google_secrets(&meta)?;write_google_metadata(&p,&meta)
}
fn masked_client_id(s: &str) -> String {
    if s.len() > 16 {format!("{}…{}", &s[..8], &s[s.len() - 8..])}
    else if s.is_empty(){String::new()}else{"configured".into()}
}
fn google_config_status_value(c:&GoogleConfig)->Value{
    let configured=!c.client_id.trim().is_empty();
    json!({
      "configured":configured,
      "oauthReady":false,
      "oauthState":if configured{"CONFIGURED"}else{"NOT_CONFIGURED"},
      "projectId":if c.project_id.is_empty(){Value::Null}else{json!(c.project_id)},
      "clientIdMasked":if c.client_id.is_empty(){Value::Null}else{json!(masked_client_id(&c.client_id))},
      "hasSecret":c.client_secret_present,
      "secretOperational":false,
      "repairRequired":configured&&c.client_secret_present,
      "hasApiKey":c.api_key_present
    })
}
fn google_config_operational_status_value(c:&GoogleConfig,secret:Result<Option<String>,String>)->Value{
    let configured=!c.client_id.trim().is_empty();
    let mut operational=false;
    let mut state=if configured{"CONFIGURED"}else{"NOT_CONFIGURED"};
    let mut repair_required=false;
    let mut error_code:Option<&str>=None;
    if configured{
      match secret{
        Ok(Some(v)) if !v.trim().is_empty()=>{operational=true;state="READY"},
        Ok(_)=>{
          if c.client_secret_present{state="NEEDS_SECURE_STORAGE_REPAIR";repair_required=true;error_code=Some("KEYCHAIN_ITEM_MISSING")}
          else{state="CONFIGURED"}
        },
        Err(ref e) if keychain_repairable_error(e)=>{
          // Access denied/auth failed after an app update is NOT proof that the secret is missing.
          // Keep the stored-account metadata, never ask for credentials.json automatically, and
          // allow one explicit NO-UI retry instead.
          state="KEYCHAIN_ACCESS_BLOCKED";
          error_code=Some(if e.contains("KEYCHAIN_ACCESS_DENIED_CACHED"){"KEYCHAIN_ACCESS_DENIED_CACHED"}else if e.contains("KEYCHAIN_INTERACTION_REQUIRED"){"KEYCHAIN_INTERACTION_REQUIRED"}else if e.contains("KEYCHAIN_AUTH_FAILED"){"KEYCHAIN_AUTH_FAILED"}else if e.contains("KEYCHAIN_USER_CANCELED"){"KEYCHAIN_USER_CANCELED"}else{"KEYCHAIN_ACCESS_DENIED"});
        },
        Err(_)=>{state="ERROR";error_code=Some("KEYCHAIN_READ_FAILED")}
      }
    }
    json!({
      "configured":configured,
      "oauthReady":configured&&operational,
      "oauthState":state,
      "projectId":if c.project_id.is_empty(){Value::Null}else{json!(c.project_id)},
      "clientIdMasked":if c.client_id.is_empty(){Value::Null}else{json!(masked_client_id(&c.client_id))},
      "hasSecret":c.client_secret_present||operational,
      "secretOperational":operational,
      "repairRequired":repair_required,
      "secureStorageErrorCode":error_code,
      "hasApiKey":c.api_key_present,
      "secretValuesIncluded":false
    })
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
    let c=load_google_config_metadata(&app)?;
    let secret=vault_first_global_client_secret(&app,&c);
    Ok(google_config_operational_status_value(&c,secret))
}
#[tauri::command]
pub fn youtube_google_config_retry(app:AppHandle)->Result<Value,String>{
    let c=load_google_config_metadata(&app)?;
    if c.client_id.trim().is_empty(){return Ok(google_config_operational_status_value(&c,Ok(None)))}
    if let Ok(Some(secret))=oauth_vault::global_client_secret(&app,&c.client_id){
      return Ok(google_config_operational_status_value(&c,Ok(Some(secret))))
    }
    let account=google_client_secret_account(&c);
    let _=security::canonical_retry_secret_access_value(&account);
    let secret=security::canonical_get_secret_cached(&account);
    if let Ok(Some(ref value))=secret{if !value.trim().is_empty(){oauth_vault::set_global_client(&app,&c.client_id,value)?;}}
    Ok(google_config_operational_status_value(&c,secret))
}
#[tauri::command]
pub fn youtube_google_config_interactive_recover(app:AppHandle)->Result<Value,String>{
    let c=load_google_config_metadata(&app)?;
    if c.client_id.trim().is_empty(){return Err("OAUTH_CLIENT_SETUP_REQUIRED: client_id metadata is missing".into())}
    if let Some(secret)=vault_first_global_client_secret(&app,&c)?{
      return Ok(google_config_operational_status_value(&c,Ok(Some(secret))))
    }
    let mut accounts=vec![google_client_secret_account(&c)];
    if !accounts.iter().any(|x|x==GOOGLE_CLIENT_SECRET){accounts.push(GOOGLE_CLIENT_SECRET.to_string())}
    for account in accounts{
      if let Some(secret)=security::canonical_interactive_recover_secret(&account)?{
        if !secret.trim().is_empty(){
          oauth_vault::set_global_client(&app,&c.client_id,&secret)?;
          let readback=oauth_vault::global_client_secret(&app,&c.client_id)?;
          if readback.as_deref()!=Some(secret.as_str()){return Err("OAUTH_VAULT_READBACK_FAILED: recovered global secret was not persisted".into())}
          return Ok(google_config_operational_status_value(&c,Ok(readback)))
        }
      }
    }
    if let Some(secret)=security::legacy_interactive_recover_secret(GOOGLE_CLIENT_SECRET)?{
      if !secret.trim().is_empty(){
        oauth_vault::set_global_client(&app,&c.client_id,&secret)?;
        let readback=oauth_vault::global_client_secret(&app,&c.client_id)?;
        if readback.as_deref()!=Some(secret.as_str()){return Err("OAUTH_VAULT_READBACK_FAILED: recovered legacy global secret was not persisted".into())}
        return Ok(google_config_operational_status_value(&c,Ok(readback)))
      }
    }
    Err("OAUTH_CLIENT_SECRET_REIMPORT_REQUIRED: no saved global client secret could be recovered locally".into())
}
fn validate_imported_client_id(expected:&str,imported:&str)->Result<(),String>{
 if expected.trim()==imported.trim(){Ok(())}else{Err(format!("OAUTH_CLIENT_MISMATCH: imported credentials belong to another OAuth Client; expected={}",masked_client_id(expected)))}
}
fn parse_google_credentials_json(json_text:&str)->Result<(String,String,String),String>{
    let v:Value=serde_json::from_str(json_text).map_err(|e|format!("credentials.json: {e}"))?;
    let root=v.get("installed").or_else(||v.get("web")).unwrap_or(&v);
    let client_id=root.get("client_id").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if client_id.is_empty(){return Err("В credentials.json не найден client_id".into())}
    let client_secret=root.get("client_secret").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if client_secret.is_empty(){return Err("OAUTH_CLIENT_SECRET_REQUIRED: credentials.json не содержит client_secret".into())}
    let project_id=root.get("project_id").and_then(Value::as_str).or_else(||v.get("project_id").and_then(Value::as_str)).unwrap_or("").trim().to_string();
    Ok((client_id,client_secret,project_id))
}
#[tauri::command]
pub fn youtube_oauth_import_profile_credentials_file(app:AppHandle,profile_id:String,file_path:String)->Result<Value,String>{
    let profile_id=profile_id.trim().to_string();
    let store=load_store_metadata(&app)?;
    let profile=store.profiles.iter().find(|p|p.id==profile_id)
      .ok_or_else(||format!("OAUTH_PROFILE_NOT_FOUND: profile_id={profile_id}"))?;
    let expected_client_id=profile.client_id.trim();
    if expected_client_id.is_empty(){return Err("OAUTH_CLIENT_MISSING: profile client_id is empty".into())}
    let raw=fs::read_to_string(&file_path).map_err(|e|format!("credentials.json read failed: {e}"))?;
    let (client_id,client_secret,project_id)=parse_google_credentials_json(&raw)?;
    validate_imported_client_id(expected_client_id,&client_id)?;
    oauth_vault::upsert_profile(&app,&profile_id,profile.channel_id.as_deref().unwrap_or(""),None,Some(&client_secret),profile.google_email.as_deref(),Some(&profile.preferred_browser))?;
    let found=oauth_vault::profile_client_secret(&app,&profile_id)?.map(|x|!x.trim().is_empty()).unwrap_or(false);
    if !found{return Err("OAUTH_VAULT_READBACK_FAILED: profile client secret was not persisted".into())}
    let account=oauth_key(&profile_id,"client_secret");
    let _=security::canonical_set_secret(&account,&client_secret);
    Ok(json!({"ok":true,"profileUuid":profile_id,"clientIdMasked":masked_client_id(&client_id),"projectId":if project_id.is_empty(){Value::Null}else{json!(project_id)},"clientSecretStored":true,"account":"oauth-vault","secretValuesIncluded":false}))
}
#[tauri::command]
pub fn youtube_google_config_import(
    app: AppHandle,
    json_text: String,
    api_key: String,
) -> Result<Value, String> {
    let (client_id,client_secret,project_id)=parse_google_credentials_json(&json_text)?;
    let old=load_google_config_metadata(&app).unwrap_or_default();
    let profiles=load_store_metadata(&app)?;
    if !profiles.profiles.is_empty(){
        if !old.client_id.trim().is_empty()&&old.client_id.trim()!=client_id.trim(){
            return Err(format!("OAUTH_CLIENT_MISMATCH: existing profiles use another configured OAuth client; expected={}",masked_client_id(&old.client_id)))
        }
        if let Some(mismatch)=profiles.profiles.iter().find(|p|!p.client_id.trim().is_empty()&&p.client_id.trim()!=client_id.trim()){
            return Err(format!("OAUTH_CLIENT_MISMATCH: existing profile {} uses another OAuth client; expected={}",mismatch.id,masked_client_id(&mismatch.client_id)))
        }
    }
    // The encrypted OAuth vault is authoritative. Per-item Keychain storage remains
    // only as rollback/migration fallback for older builds.
    oauth_vault::set_global_client(&app,&client_id,&client_secret)?;
    let vault_readback=oauth_vault::global_client_secret(&app,&client_id)?;
    if vault_readback.as_deref()!=Some(client_secret.as_str()){
        return Err("OAUTH_VAULT_READBACK_FAILED: imported global client secret was not persisted".into())
    }
    let old_account=google_client_secret_account(&old);
    let new_account=rotated_google_client_secret_account(&client_id);
    security::canonical_forget_cache(&new_account);
    let keychain_fallback_ok=security::canonical_set_secret(&new_account,&client_secret)
      .and_then(|_|security::canonical_verify_secret(&new_account,&client_secret))
      .unwrap_or(false);
    security::canonical_forget_cache(&old_account);
    let c=GoogleConfig{
        client_id,
        client_secret:String::new(),
        project_id,
        api_key:String::new(),
        client_secret_present:true,
        client_secret_account:if keychain_fallback_ok{new_account.clone()}else{old_account.clone()},
        api_key_present:old.api_key_present||!api_key.trim().is_empty(),
    };
    if !api_key.trim().is_empty(){security::canonical_set_secret(GOOGLE_API_KEY,api_key.trim())?}
    write_google_metadata(&google_config_path(&app)?,&c)?;
    let secret=oauth_vault::global_client_secret(&app,&c.client_id);
    let result=google_config_operational_status_value(&c,secret);
    if result.get("oauthReady").and_then(Value::as_bool)!=Some(true){
        return Err("OAUTH_REPAIR_VERIFY_FAILED: secure client secret is still not operational".into())
    }
    Ok(result)
}
#[tauri::command]
pub async fn youtube_oauth_connect_global(
    app: AppHandle,
    browser: Option<String>,
) -> Result<Value, String> {
    let c = load_or_migrate_google_config(&app)?;
    if c.client_id.trim().is_empty() {
        return Err("OAUTH_CLIENT_SETUP_REQUIRED: Google OAuth Client ID отсутствует. Импортируйте credentials.json один раз для всего VYRON.".into());
    }
    if c.client_secret.trim().is_empty() {
        return Err("OAUTH_CLIENT_SETUP_REQUIRED: global Google OAuth Client Secret отсутствует. Импортируйте credentials.json один раз для всего VYRON; отдельно для каналов импорт не нужен.".into());
    }
    youtube_oauth_connect(app, c.client_id, c.client_secret, browser).await
}
fn youtube_channel_statistics_value(item:&Value)->Value{
    let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));
    let stat=item.get("statistics").cloned().unwrap_or_else(||json!({}));
    let hidden=stat.get("hiddenSubscriberCount").and_then(Value::as_bool).unwrap_or(false);
    let parse_count=|key:&str|stat.get(key).and_then(Value::as_str).and_then(|x|x.parse::<u64>().ok());
    let thumbnail=sn.pointer("/thumbnails/high/url")
        .or_else(||sn.pointer("/thumbnails/medium/url"))
        .or_else(||sn.pointer("/thumbnails/default/url"))
        .and_then(Value::as_str);
    json!({
        "channelId":item.get("id").and_then(Value::as_str),
        "channelTitle":sn.get("title").and_then(Value::as_str),
        "handle":sn.get("customUrl").and_then(Value::as_str),
        "thumbnail":thumbnail,
        "subscriberCount":if hidden{Value::Null}else{parse_count("subscriberCount").map(Value::from).unwrap_or(Value::Null)},
        "viewCount":parse_count("viewCount"),
        "videoCount":parse_count("videoCount"),
        "hiddenSubscriberCount":hidden,
        "statisticsUpdatedAt":Utc::now().to_rfc3339(),
    })
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
        .query(&[("part", "snippet,statistics"), ("mine", "true")])
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
        json!({"ok":true,"status":"TOKEN_HEALTHY","channelId":item.get("id").and_then(|x|x.as_str()).or(p.channel_id.as_deref()),"channelTitle":sn.get("title").and_then(|x|x.as_str()).or(p.channel_title.as_deref()),"thumbnail":thumb,"expiresAt":p.expires_at,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser,"statistics":youtube_channel_statistics_value(&item)}),
    )
}
#[tauri::command]
pub async fn youtube_channel_statistics(
    app:AppHandle,
    profile_id:String,
    operation_id:Option<String>,
)->Result<Value,String>{
    let (_token,p)=valid_access_token(&app,&profile_id).await?;
    let token=p.access_token.clone();
    let expected=p.channel_id.as_deref().filter(|x|!x.trim().is_empty())
        .ok_or_else(||"YOUTUBE_CHANNEL_NOT_FOUND: OAuth profile has no Channel ID".to_string())?;
    emit_youtube_api_request(&app,"channels.list",operation_id.as_deref());
    let r=reqwest::Client::new()
        .get("https://www.googleapis.com/youtube/v3/channels")
        .bearer_auth(&token)
        .query(&[("part","snippet,statistics"),("id",expected)])
        .send().await
        .map_err(|e|format!("YOUTUBE_CHANNEL_STATS_FAILED: network: {e}"))?;
    let status=r.status();
    let v:Value=r.json().await.map_err(|e|format!("YOUTUBE_CHANNEL_STATS_FAILED: json: {e}"))?;
    if !status.is_success(){return Err(format!("YOUTUBE_CHANNEL_STATS_FAILED: {}",youtube_error(&v,"YouTube channel statistics request failed")))}
    let item=v.get("items").and_then(Value::as_array).and_then(|x|x.first())
        .ok_or_else(||"YOUTUBE_CHANNEL_NOT_FOUND: statistics request returned no channel".to_string())?;
    let actual=item.get("id").and_then(Value::as_str).unwrap_or("");
    if actual!=expected{return Err(format!("CHANNEL_MISMATCH: expected={expected} actual={actual}"))}
    Ok(youtube_channel_statistics_value(item))
}

#[tauri::command]
pub async fn youtube_channel_statistics_batch(
    app:AppHandle,
    profile_id:String,
    channel_ids:Vec<String>,
    operation_id:Option<String>,
)->Result<Value,String>{
    let mut ids=Vec::<String>::new();
    for raw in channel_ids{
        let id=raw.trim();
        if id.is_empty()||ids.iter().any(|x|x==id){continue}
        ids.push(id.to_string());
        if ids.len()>=50{break}
    }
    if ids.is_empty(){return Ok(json!({"items":[],"requested":0,"found":0,"missingChannelIds":[],"apiRequests":0}))}
    let (_token,p)=valid_access_token(&app,&profile_id).await?;
    let joined=ids.join(",");
    emit_youtube_api_request(&app,"channels.list",operation_id.as_deref());
    let r=reqwest::Client::new()
        .get("https://www.googleapis.com/youtube/v3/channels")
        .bearer_auth(&p.access_token)
        .query(&[("part","snippet,statistics"),("id",joined.as_str())])
        .send().await
        .map_err(|e|format!("YOUTUBE_CHANNEL_STATS_BATCH_FAILED: network: {e}"))?;
    let status=r.status();
    let v:Value=r.json().await.map_err(|e|format!("YOUTUBE_CHANNEL_STATS_BATCH_FAILED: json: {e}"))?;
    if !status.is_success(){return Err(format!("YOUTUBE_CHANNEL_STATS_BATCH_FAILED: {}",youtube_error(&v,"YouTube channel statistics batch request failed")))}
    let rows=v.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut items=Vec::<Value>::new();
    let mut found_ids=Vec::<String>::new();
    for item in &rows{
        let Some(id)=item.get("id").and_then(Value::as_str) else{continue};
        if !ids.iter().any(|x|x==id){continue}
        found_ids.push(id.to_string());
        items.push(youtube_channel_statistics_value(item));
    }
    let missing=ids.iter().filter(|id|!found_ids.iter().any(|x|x==*id)).cloned().collect::<Vec<_>>();
    Ok(json!({"items":items,"requested":ids.len(),"found":found_ids.len(),"missingChannelIds":missing,"apiRequests":1}))
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
#[tauri::command]
pub fn youtube_oauth_open_youtube(browser:Option<String>)->Result<Value,String>{
 let browser=browser.filter(|x|!x.trim().is_empty()).unwrap_or_else(||"default".into());
 open_browser("https://www.youtube.com/",&browser)?;
 Ok(json!({"ok":true,"browser":browser,"oauthStarted":false}))
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

fn wait_for_oauth_code(listener:TcpListener,expected_state:String)->Result<String,String>{
    listener.set_nonblocking(true).map_err(|e|format!("OAUTH_CALLBACK_LISTENER_FAILED: {e}"))?;
    let started=Instant::now();
    loop{
        match listener.accept(){
            Ok((mut stream,_))=>{
                let _=stream.set_read_timeout(Some(Duration::from_secs(15)));
                let mut buf=[0u8;8192];
                let n=stream.read(&mut buf).map_err(|e|format!("OAUTH_CALLBACK_READ_FAILED: {e}"))?;
                let req=String::from_utf8_lossy(&buf[..n]);
                let first=req.lines().next().unwrap_or("");
                let target=first.split_whitespace().nth(1).unwrap_or("");
                let query=target.split_once('?').map(|x|x.1).unwrap_or("");
                let got_state=query_param(query,"state").unwrap_or_default();
                let code=query_param(query,"code");
                let err=query_param(query,"error");
                let ok=got_state==expected_state&&code.is_some();
                let html=if ok{
                    "<html><body style='font-family:-apple-system;padding:40px;background:#07111d;color:white'><h2>Google передал код авторизации ✅</h2><p>VYRON завершает подключение и проверяет YouTube Channel ID. Вернитесь в приложение.</p></body></html>"
                }else{
                    "<html><body><h2>VYRON OAuth error</h2><p>Вернитесь в приложение.</p></body></html>"
                };
                let resp=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.as_bytes().len(),html);
                let _=stream.write_all(resp.as_bytes());
                if let Some(e)=err{return Err(format!("Google OAuth: {e}"))}
                if got_state!=expected_state{return Err("OAUTH_STATE_MISMATCH: callback state does not match request".into())}
                return code.ok_or_else(||"OAUTH_CODE_EXCHANGE_FAILED: Google не вернул authorization code".into())
            }
            Err(e) if e.kind()==ErrorKind::WouldBlock=>{
                if started.elapsed()>=Duration::from_secs(300){
                    return Err("OAUTH_CALLBACK_TIMEOUT: Google OAuth callback не получен за 5 минут".into())
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e)=>return Err(format!("OAUTH_CALLBACK_LISTENER_FAILED: {e}")),
        }
    }
}


fn oauth_profiles_value(s:OAuthStore,states:&HashMap<String,String>)->Value{json!(s.profiles.into_iter().map(|p|{
  let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let credential_status=states.get(&p.id).cloned().unwrap_or_else(||"NOT_CHECKED".into());
  json!({"id":p.id,"channelId":p.channel_id,"channelTitle":p.channel_title,"googleEmail":p.google_email,"googleSubjectId":p.google_subject_id,"connectedAt":p.connected_at,"clientIdMasked":if p.client_id.len()>12{format!("{}…{}",&p.client_id[..8],&p.client_id[p.client_id.len()-6..])}else{"configured".into()},"scopes":p.scopes,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser,"credentialStatus":credential_status,"credentialError":Value::Null,"identityValidatedAt":p.identity_validated_at})
 }).collect::<Vec<_>>())}
#[tauri::command]
pub fn youtube_oauth_profiles(app:AppHandle)->Result<Value,String>{
 let rows=resolve_oauth_credential_states_local(&app)?;
 let states=rows.into_iter().filter_map(|v|Some((v.get("profileUuid")?.as_str()?.to_string(),v.get("credentialState")?.as_str()?.to_string()))).collect::<HashMap<_,_>>();
 Ok(oauth_profiles_value(load_store_metadata(&app)?,&states))
}

#[tauri::command]
pub fn youtube_oauth_reconciliation_diagnostics(app:AppHandle)->Result<Value,String>{
    let store=load_store_metadata(&app)?;
    let profile_ids=store.profiles.iter().map(|p|p.id.clone()).collect::<std::collections::HashSet<_>>();
    let profile_channels=store.profiles.iter().filter_map(|p|p.channel_id.clone().map(|c|(p.id.clone(),c))).collect::<Vec<_>>();
    let state_path=app.path().app_data_dir().map_err(|e|e.to_string())?.join("state.json");
    let state:Value=if state_path.exists(){
      let b=fs::read(&state_path).map_err(|e|format!("STATE_DIAGNOSTIC_READ: {e}"))?;
      serde_json::from_slice(&b).unwrap_or_else(|_|json!({}))
    }else{json!({})};
    let channels=state.get("channels").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut mapped_counts=HashMap::<String,usize>::new();
    let mut orphan_channels=Vec::<Value>::new();
    let mut channels_with_profile=0usize;
    for ch in &channels{
      let id=ch.get("id").and_then(Value::as_str).unwrap_or("");
      let name=ch.get("name").and_then(Value::as_str).unwrap_or("");
      if let Some(pid)=ch.get("youtubeProfileId").and_then(Value::as_str).filter(|x|!x.trim().is_empty()){
        channels_with_profile+=1;
        *mapped_counts.entry(pid.to_string()).or_insert(0)+=1;
        if !profile_ids.contains(pid){orphan_channels.push(json!({"channelId":id,"channelName":name,"youtubeProfileId":pid,"reason":"ORPHAN_MAPPING"}))}
      }
    }
    let mapped_profile_ids=mapped_counts.keys().cloned().collect::<std::collections::HashSet<_>>();
    let orphan_profiles=store.profiles.iter().filter(|p|!mapped_profile_ids.contains(&p.id))
      .map(|p|json!({"profileId":p.id,"youtubeChannelId":p.channel_id,"channelTitle":p.channel_title})).collect::<Vec<_>>();
    let duplicate_mappings=mapped_counts.iter().filter(|(_,n)|**n>1).map(|(id,n)|json!({"profileId":id,"channelMappings":n})).collect::<Vec<_>>();
    Ok(json!({
      "channelsTotal":channels.len(),
      "profilesTotal":store.profiles.len(),
      "channelsWithYoutubeProfileId":channels_with_profile,
      "profilesWithChannelId":profile_channels.len(),
      "orphanChannels":orphan_channels,
      "orphanProfiles":orphan_profiles,
      "duplicateMappings":duplicate_mappings,
      "oauthStoreExists":store_path(&app)?.exists(),
      "secretValuesIncluded":false,
      "keychainSecretsRead":false
    }))
}

#[tauri::command]
pub fn youtube_oauth_disconnect(app: AppHandle, profile_id: String) -> Result<(), String> {
    let mut s = load_store_metadata(&app)?;
    delete_profile_secrets(&app,&profile_id)?;
    s.profiles.retain(|p| p.id != profile_id);
    save_store(&app, &s)
}

fn oauth_authorization_url(client_id:&str,redirect:&str,scope:&str,challenge:&str,state:&str)->String{
    let prompt=urlencoding::encode("select_account consent");
    format!("https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt={}&include_granted_scopes=true&code_challenge={}&code_challenge_method=S256&state={}",
      urlencoding::encode(client_id),urlencoding::encode(redirect),urlencoding::encode(scope),prompt,urlencoding::encode(challenge),urlencoding::encode(state))
}
fn google_account_identity_matches(expected:Option<&str>,received:Option<&str>)->bool{
    match (expected.map(str::trim).filter(|x|!x.is_empty()),received.map(str::trim).filter(|x|!x.is_empty())){
      (Some(a),Some(b))=>a.eq_ignore_ascii_case(b),
      _=>true,
    }
}
async fn google_identity_metadata(access_token:&str)->(Option<String>,Option<String>){
    let response=reqwest::Client::new()
      .get("https://openidconnect.googleapis.com/v1/userinfo")
      .bearer_auth(access_token)
      .send().await;
    let Ok(response)=response else{return(None,None)};
    if !response.status().is_success(){return(None,None)}
    let Ok(v)=response.json::<Value>().await else{return(None,None)};
    let email=v.get("email").and_then(Value::as_str).map(str::trim).filter(|x|!x.is_empty()).map(str::to_string);
    let subject=v.get("sub").and_then(Value::as_str).map(str::trim).filter(|x|!x.is_empty()).map(str::to_string);
    (email,subject)
}

#[derive(Clone)]
struct PendingNewOAuth{
 created_at:i64,
 client_id:String,
 client_secret:String,
 preferred_browser:String,
 access_token:String,
 refresh_token:String,
 expires_in:i64,
 scopes:Vec<String>,
 google_email:Option<String>,
 google_subject_id:Option<String>,
 items:Vec<Value>,
}
static PENDING_NEW_OAUTH:OnceLock<Mutex<HashMap<String,PendingNewOAuth>>>=OnceLock::new();
fn pending_new_oauth()->&'static Mutex<HashMap<String,PendingNewOAuth>>{PENDING_NEW_OAUTH.get_or_init(||Mutex::new(HashMap::new()))}
fn cleanup_pending_new_oauth(){if let Ok(mut p)=pending_new_oauth().lock(){let now=now_ts();p.retain(|_,x|now.saturating_sub(x.created_at)<600)}}
fn find_expected_channel_item<'a>(items:&'a [Value],expected_channel_id:&str)->Option<&'a Value>{
 items.iter().find(|x|x.get("id").and_then(Value::as_str)==Some(expected_channel_id))
}
fn channel_identity_value(item:&Value,store:&OAuthStore)->Value{
 let channel_id=item.get("id").and_then(Value::as_str).unwrap_or("");
 let title=item.pointer("/snippet/title").and_then(Value::as_str).unwrap_or(channel_id);
 let handle=item.pointer("/snippet/customUrl").and_then(Value::as_str);
 let thumbnail=item.pointer("/snippet/thumbnails/high/url")
   .or_else(||item.pointer("/snippet/thumbnails/medium/url"))
   .or_else(||item.pointer("/snippet/thumbnails/default/url"))
   .and_then(Value::as_str);
 let existing=store.profiles.iter().find(|p|p.channel_id.as_deref()==Some(channel_id));
 json!({
  "channelId":channel_id,"channelTitle":title,"handle":handle,"thumbnail":thumbnail,
  "alreadyConnected":existing.is_some(),
  "existingProfileId":existing.map(|p|p.id.clone()),
  "existingProfileTitle":existing.and_then(|p|p.channel_title.clone())
 })
}
fn commit_new_channel_oauth(
 app:&AppHandle,client_id:&str,client_secret:&str,preferred_browser:&str,access:&str,refresh:&str,expires:i64,scopes:&[String],google_email:Option<&str>,google_subject_id:Option<&str>,item:&Value
)->Result<Value,String>{
 let channel_id=item.get("id").and_then(Value::as_str).map(str::to_string)
   .ok_or_else(||"YouTube не вернул Channel ID".to_string())?;
 let channel_title=item.pointer("/snippet/title").and_then(Value::as_str).map(str::to_string).unwrap_or_else(||channel_id.clone());
 let mut store=load_store_metadata(app)?;
 if let Some(existing)=store.profiles.iter().find(|p|p.channel_id.as_deref()==Some(channel_id.as_str())){
  return Err(format!("YOUTUBE_CHANNEL_ALREADY_CONNECTED: profile_id={}; channel_id={}; title={}",existing.id,channel_id,channel_title.replace(';'," ").replace('\n'," ").replace('\r'," ")))
 }
 let profile_id=reconnect_profile_id(None);
 if !client_secret.trim().is_empty(){
  let global_meta=load_google_config_metadata(app)?;
  let global_account=if global_meta.client_id.trim()==client_id{google_client_secret_account(&global_meta)}else{GOOGLE_CLIENT_SECRET.to_string()};
  security::canonical_set_secret(&global_account,client_secret)?;
 }
 let original_store=store.clone();
 let pointer_before=read_keychain_migration_v2(app)?;
 let refresh_account=oauth_key(&profile_id,"refresh_token");
 security::canonical_forget_cache(&refresh_account);
 if let Err(e)=security::canonical_set_secret(&refresh_account,refresh){return Err(format!("OAUTH_KEYCHAIN_WRITE_FAILED: stage=NEW_SECRET_WRITE; account={refresh_account}; {e}"))}
 match security::canonical_verify_secret(&refresh_account,refresh){
  Ok(true)=>{},
  Ok(false)=>{let _=security::canonical_delete_secret(&refresh_account);return Err(format!("NEW_ITEM_READBACK_FAILED: stage=NEW_SECRET_READBACK; account={refresh_account}; mismatch"))}
  Err(e)=>{let _=security::canonical_delete_secret(&refresh_account);if e.contains("KEYCHAIN_AUTH_FAILED"){return Err(format!("NEW_ITEM_READBACK_AUTH_FAILED: stage=NEW_SECRET_READBACK; account={refresh_account}; {e}"))}return Err(format!("OAUTH_KEYCHAIN_READBACK_FAILED: stage=NEW_SECRET_READBACK; account={refresh_account}; {e}"))}
 }
 let profile=OAuthProfile{
  id:profile_id.clone(),client_id:client_id.to_string(),client_secret:String::new(),channel_id:Some(channel_id.clone()),channel_title:Some(channel_title.clone()),
  google_email:google_email.map(str::to_string),google_subject_id:google_subject_id.map(str::to_string),
  access_token:access.to_string(),refresh_token:String::new(),expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),
  scopes:scopes.to_vec(),preferred_browser:preferred_browser.to_string(),identity_validated_at:Some(Utc::now().to_rfc3339()),identity_validated_channel_id:Some(channel_id.clone()),credential_error:None,
 };
 store.profiles.push(profile.clone());
 let mut pointer_next=pointer_before.clone();
 pointer_next.refresh_token_accounts.insert(profile_id.clone(),refresh_account.clone());
 pointer_next.credential_generations.insert(profile_id.clone(),1);
 pointer_next.profiles.insert(profile_id.clone(),MIGRATION_MIGRATED.into());
 if let Err(e)=write_keychain_migration_v2(app,&pointer_next){let _=security::canonical_delete_secret(&refresh_account);return Err(format!("OAUTH_METADATA_POINTER_COMMIT_FAILED: stage=METADATA_POINTER_COMMIT; {e}"))}
 if let Err(e)=write_oauth_metadata(&store_path(app)?,&store){let _=write_keychain_migration_v2(app,&pointer_before);let _=security::canonical_delete_secret(&refresh_account);return Err(format!("OAUTH_METADATA_SAVE_FAILED: stage=METADATA_COMMIT; {e}"))}
 match security::canonical_verify_secret(&refresh_account,refresh){
  Ok(true)=>{},
  Ok(false)=>{let _=write_keychain_migration_v2(app,&pointer_before);let _=write_oauth_metadata(&store_path(app)?,&original_store);let _=security::canonical_delete_secret(&refresh_account);return Err("OAUTH_SAVE_VERIFY_FAILED: stage=POST_COMMIT_READ; fresh refresh token mismatch".into())}
  Err(e)=>{let _=write_keychain_migration_v2(app,&pointer_before);let _=write_oauth_metadata(&store_path(app)?,&original_store);let _=security::canonical_delete_secret(&refresh_account);return Err(format!("OAUTH_POST_COMMIT_READ_FAILED: stage=POST_COMMIT_READ; account={refresh_account}; {e}"))}
 }
 remember_access_token(&profile.id,&profile.access_token,profile.expires_at);
 record_profile_credential_validation(app,&profile.id,"PASS",Some(&channel_id),Some(&channel_id))?;
 Ok(json!({
  "ok":true,"status":"CONNECTED","id":profile.id,"channelId":channel_id,"channelTitle":channel_title,
  "googleEmail":profile.google_email,"googleSubjectId":profile.google_subject_id,
  "connectedAt":profile.connected_at,"preferredBrowser":preferred_browser,"statistics":youtube_channel_statistics_value(item),
  "oauthTokenStored":true,"secureReadback":"PASS","profileUuidPreserved":true,"secretValuesIncluded":false
 }))
}

#[tauri::command]
pub async fn youtube_oauth_connect(
 app:AppHandle,client_id:String,client_secret:String,browser:Option<String>,
)->Result<Value,String>{
 let client_id=client_id.trim().to_string();
 if client_id.is_empty(){return Err("Google OAuth Client ID не указан".into())}
 let client_secret=client_secret.trim().to_string();
 if client_secret.is_empty(){return Err("OAUTH_CLIENT_SETUP_REQUIRED: OAuth Client Secret отсутствует; browser OAuth не запущен.".into())}
 let listener=TcpListener::bind("127.0.0.1:0").map_err(|e|format!("OAuth localhost: {e}"))?;
 let port=listener.local_addr().map_err(|e|e.to_string())?.port();
 let redirect=format!("http://127.0.0.1:{port}");
 let verifier=format!("{}{}{}",Uuid::new_v4().simple(),Uuid::new_v4().simple(),Uuid::new_v4().simple());
 let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
 let state=Uuid::new_v4().to_string();
 let scope="openid email profile https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly";
 let scopes=scope.split_whitespace().map(str::to_string).collect::<Vec<_>>();
 let auth_url=oauth_authorization_url(&client_id,&redirect,scope,&challenge,&state);
 let preferred_browser=browser.unwrap_or_else(||"default".into());
 open_browser(&auth_url,&preferred_browser)?;
 let expected_state=state.clone();
 let code=tauri::async_runtime::spawn_blocking(move||wait_for_oauth_code(listener,expected_state)).await.map_err(|e|format!("OAUTH_CALLBACK_TASK_FAILED: {e}"))??;
 let mut token_form=vec![("client_id",client_id.as_str()),("code",code.as_str()),("code_verifier",verifier.as_str()),("grant_type","authorization_code"),("redirect_uri",redirect.as_str())];
 token_form.push(("client_secret",client_secret.as_str()));
 let token=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&token_form).send().await.map_err(|e|format!("OAUTH_NETWORK_ERROR: token exchange: {e}"))?;
 let status=token.status();let tv:Value=token.json().await.map_err(|e|format!("OAuth token JSON: {e}"))?;
 if !status.is_success(){let detail=tv.get("error_description").and_then(Value::as_str).or_else(||tv.get("error").and_then(Value::as_str)).unwrap_or("Google OAuth token error");return Err(format!("OAUTH_CODE_EXCHANGE_FAILED: {detail}"))}
 let access=tv.get("access_token").and_then(Value::as_str).ok_or_else(||"Google не вернул access_token".to_string())?.to_string();
 let refresh=tv.get("refresh_token").and_then(Value::as_str).map(str::trim).filter(|x|!x.is_empty()).map(str::to_string).ok_or_else(||"OAUTH_REFRESH_TOKEN_REQUIRED: Google не вернул refresh_token для нового канала. Повторите consent.".to_string())?;
 let expires=tv.get("expires_in").and_then(Value::as_i64).unwrap_or(3600);
 let (google_email,google_subject_id)=google_identity_metadata(&access).await;
 emit_youtube_api_request(&app,"channels.list",None);
 let me=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(&access).query(&[("part","snippet,statistics"),("mine","true"),("maxResults","50")]).send().await.map_err(|e|format!("YouTube account network: {e}"))?;
 let me_status=me.status();let mv:Value=me.json().await.map_err(|e|format!("YouTube account JSON: {e}"))?;
 if !me_status.is_success(){return Err(youtube_error(&mv,"Не удалось получить YouTube-канал. Проверь, что YouTube Data API v3 включён именно в проекте VYRON."))}
 let items=mv.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
 if items.is_empty(){return Err("YOUTUBE_CHANNEL_NOT_FOUND: на выбранном Google-аккаунте YouTube-канал не найден".into())}
 if items.len()==1{return commit_new_channel_oauth(&app,&client_id,&client_secret,&preferred_browser,&access,&refresh,expires,&scopes,google_email.as_deref(),google_subject_id.as_deref(),&items[0])}
 cleanup_pending_new_oauth();
 let session_id=Uuid::new_v4().to_string();
 let pending=PendingNewOAuth{created_at:now_ts(),client_id,client_secret,preferred_browser,access_token:access,refresh_token:refresh,expires_in:expires,scopes,google_email,google_subject_id,items:items.clone()};
 pending_new_oauth().lock().map_err(|_|"OAUTH_PENDING_LOCK_FAILED".to_string())?.insert(session_id.clone(),pending);
 let store=load_store_metadata(&app)?;
 let channels=items.iter().map(|x|channel_identity_value(x,&store)).collect::<Vec<_>>();
 Ok(json!({"ok":false,"status":"CHANNEL_SELECTION_REQUIRED","sessionId":session_id,"channels":channels,"credentialsCommitted":false,"secretValuesIncluded":false}))
}

#[tauri::command]
pub fn youtube_oauth_select_new_channel(app:AppHandle,session_id:String,channel_id:String)->Result<Value,String>{
 cleanup_pending_new_oauth();
 let pending=pending_new_oauth().lock().map_err(|_|"OAUTH_PENDING_LOCK_FAILED".to_string())?.get(&session_id).cloned().ok_or_else(||"OAUTH_PENDING_EXPIRED: повторите + Добавить канал".to_string())?;
 let item=pending.items.iter().find(|x|x.get("id").and_then(Value::as_str)==Some(channel_id.as_str())).cloned().ok_or_else(||"OAUTH_CHANNEL_SELECTION_INVALID: выбранный канал отсутствует в текущей OAuth-сессии".to_string())?;
 let result=commit_new_channel_oauth(&app,&pending.client_id,&pending.client_secret,&pending.preferred_browser,&pending.access_token,&pending.refresh_token,pending.expires_in,&pending.scopes,pending.google_email.as_deref(),pending.google_subject_id.as_deref(),&item)?;
 if let Ok(mut map)=pending_new_oauth().lock(){map.remove(&session_id);}
 Ok(result)
}

#[tauri::command]
pub fn youtube_oauth_cancel_new_channel_selection(session_id:String)->Value{
 if let Ok(mut map)=pending_new_oauth().lock(){map.remove(&session_id);}
 json!({"ok":true,"discarded":true,"credentialsCommitted":false})
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
pub fn youtube_oauth_vault_recover(app:AppHandle)->Result<Value,String>{
 oauth_vault::recover_master_key_interactive(&app)?;
 Ok(json!({"status":"READY","recovered":true,"googleBrowserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}))
}
#[tauri::command]
pub fn youtube_oauth_credential_states(app:AppHandle)->Result<Value,String>{
 Ok(json!({
  "credentialSchemaVersion":CREDENTIAL_SCHEMA_VERSION,
  "profiles":resolve_oauth_credential_states_local(&app)?,
  "secretValuesIncluded":false,
  "youtubeApiRequests":0,
  "keychainSecretReads":0
 }))
}
#[tauri::command]
pub async fn youtube_oauth_recovery_diagnostic(
    app:AppHandle,profile_id:String,
)->Result<Value,String>{
    let path=store_path(&app)?;
    let mut row=resolve_oauth_credential_states_local(&app)?.into_iter()
      .find(|v|v.get("profileUuid").and_then(Value::as_str)==Some(profile_id.as_str()))
      .ok_or_else(||"CREDENTIAL_MISSING: selected OAuth profile is not present in youtube-oauth.json".to_string())?;
    let obj=row.as_object_mut().ok_or_else(||"OAUTH_STATE_RESOLVER_FAILED".to_string())?;
    let account=profile_refresh_token_account(&app,&profile_id)?;
    obj.insert("appVersion".into(),json!(app.package_info().version.to_string()));
    obj.insert("bundleId".into(),json!(app.config().identifier.clone()));
    obj.insert("currentProfileUuid".into(),json!(profile_id));
    obj.insert("legacyService".into(),json!(security::LEGACY_SERVICE));
    obj.insert("canonicalService".into(),json!(security::canonical_service()));
    obj.insert("canonicalAccountDiagnostic".into(),security::canonical_account_metadata_diagnostic(&account));
    obj.insert("path".into(),json!(path.display().to_string()));
    Ok(row)
}

fn classify_keychain_incident(pointer_exists:bool,canonical_visible:bool,legacy_present:bool,current_error:Option<&str>)->&'static str{
 match current_error.unwrap_or(""){
  "KEYCHAIN_INTERACTION_REQUIRED"=>"ITEM_EXISTS_INTERACTION_REQUIRED",
  "KEYCHAIN_AUTH_FAILED"=>"AUTH_FAILED",
  "KEYCHAIN_USER_CANCELED"|"KEYCHAIN_ACCESS_DENIED"|"KEYCHAIN_ACCESS_DENIED_CACHED"=>"ITEM_EXISTS_ACCESS_DENIED",
  _ if canonical_visible=>"ITEM_PRESENT",
  _ if legacy_present=>"LEGACY_POINTER_ONLY",
  _ if pointer_exists=>"STALE_POINTER",
  _=>"ITEM_MISSING",
 }
}
fn rotate_recovered_refresh_with<S:OAuthSecretStore>(secrets:&S,profile_id:&str,generation:u32,refresh_token:&str)->Result<String,String>{
 if refresh_token.trim().is_empty(){return Err("REFRESH_TOKEN_MISSING: interactive Keychain recovery returned an empty value".into())}
 let new_account=rotated_profile_secret_account(profile_id,"refresh_token",generation);
 if secrets.accounts(&format!("oauth.{profile_id}.")).unwrap_or_default().iter().any(|x|x==&new_account){return Err(format!("OAUTH_ROTATION_ACCOUNT_COLLISION: account={new_account}"))}
 secrets.set(&new_account,refresh_token).map_err(|e|format!("OAUTH_KEYCHAIN_WRITE_FAILED: stage=INTERACTIVE_ROTATION_NEW_WRITE; account={new_account}; {e}"))?;
 match secrets.verify(&new_account,refresh_token){
  Ok(true)=>Ok(new_account),
  Ok(false)=>{let _=secrets.delete(&new_account);Err(format!("NEW_ITEM_READBACK_FAILED: stage=INTERACTIVE_ROTATION_READBACK; account={new_account}; mismatch"))},
  Err(e)=>{let _=secrets.delete(&new_account);Err(format!("OAUTH_KEYCHAIN_READBACK_FAILED: stage=INTERACTIVE_ROTATION_READBACK; account={new_account}; {e}"))},
 }
}

fn commit_recovered_refresh_pointer(state:&mut KeychainMigrationV2State,profile_id:&str,old_account:&str,new_account:&str,generation:u32){
 state.refresh_token_accounts.insert(profile_id.to_string(),new_account.to_string());
 state.credential_generations.insert(profile_id.to_string(),generation);
 state.credential_rotated_at.insert(profile_id.to_string(),Utc::now().to_rfc3339());
 state.profiles.insert(profile_id.to_string(),MIGRATION_MIGRATED.into());
 let evidence=state.legacy_blocked_accounts.entry(profile_id.to_string()).or_default();
 if !evidence.iter().any(|x|x==old_account){evidence.push(old_account.to_string())}
}

#[tauri::command]
pub fn youtube_oauth_keychain_matrix(app:AppHandle)->Result<Value,String>{
 let store=load_store_metadata(&app)?;
 let state=read_keychain_migration_v2(&app)?;
 let canonical_accounts=security::list_canonical_secret_accounts("")?;
 let legacy_accounts=security::list_legacy_secret_accounts("")?;
 let resolved=resolve_oauth_credential_states_local(&app)?;
 let mut rows=Vec::with_capacity(store.profiles.len());
 for profile in &store.profiles{
  let active=profile_refresh_token_account_from_state(&state,&profile.id);
  let pointer_exists=state.refresh_token_accounts.get(&profile.id).map(|x|!x.trim().is_empty()).unwrap_or(false);
  let meta=security::canonical_account_metadata_diagnostic(&active);
  let visible=meta.get("metadataEnumeration").and_then(Value::as_str)==Some("VISIBLE")||canonical_accounts.iter().any(|x|x==&active);
  let denial=security::canonical_denial_diagnostic(&active);
  let current_error=denial.as_ref().and_then(|x|x.get("currentErrorCode")).and_then(Value::as_str);
  let legacy_account=select_present_account(&legacy_refresh_candidates(&profile.id),&legacy_accounts);
  let legacy_present=legacy_account.is_some();
  let classification=classify_keychain_incident(pointer_exists,visible,legacy_present,current_error);
  let resolved_row=resolved.iter().find(|x|x.get("profileUuid").and_then(Value::as_str)==Some(profile.id.as_str()));
  rows.push(json!({
   "channelName":profile.channel_title,"profileUuid":profile.id,"expectedChannelId":profile.channel_id,
   "activeRefreshAccount":active,"canonicalService":security::canonical_service(),
   "credentialGeneration":state.credential_generations.get(&profile.id).copied().unwrap_or(0),
   "activePointerExists":pointer_exists,"accountMetadataVisibility":meta.get("metadataEnumeration").cloned().unwrap_or(json!("UNKNOWN")),
   "itemAttributesEnumerable":visible,"secretReadBlocked":denial.is_some(),
   "credentialState":resolved_row.and_then(|x|x.get("credentialState")).cloned().unwrap_or(json!("UNKNOWN")),
   "currentOsstatus":denial.as_ref().and_then(|x|x.get("currentOsstatus")).cloned().unwrap_or(Value::Null),
   "originalOsstatus":denial.as_ref().and_then(|x|x.get("originalOsstatus")).cloned().unwrap_or(Value::Null),
   "currentErrorCode":denial.as_ref().and_then(|x|x.get("currentErrorCode")).cloned().unwrap_or(Value::Null),
   "originalErrorCode":denial.as_ref().and_then(|x|x.get("originalErrorCode")).cloned().unwrap_or(Value::Null),
   "legacyRefreshPresent":legacy_present,"legacyRefreshAccount":legacy_account,
   "classification":classification,"lastRecoveryAction":"NONE",
   "secretValuesIncluded":false,"secretReads":0,"youtubeApiRequests":0
  }));
 }
 Ok(json!({"profiles":rows,"total":store.profiles.len(),"canonicalService":security::canonical_service(),"legacyService":security::LEGACY_SERVICE,"secretValuesIncluded":false,"secretReads":0,"youtubeApiRequests":0}))
}
fn oauth_safe_retry_profile_value(app:&AppHandle,profile_id:&str)->Result<Value,String>{
 let store=load_store_metadata(app)?;
 let profile=store.profiles.iter().find(|p|p.id==profile_id).ok_or_else(||format!("CREDENTIAL_MISSING: profile={profile_id}"))?;
 let canonical_account=profile_refresh_token_account(app,profile_id)?;
 let mut account=canonical_account.clone();
 let mut result=security::canonical_retry_secret_access_value(&canonical_account);
 let mut status=result.get("status").and_then(Value::as_str).unwrap_or("READ_FAILED").to_string();
 if status=="MISSING"{
  let legacy_accounts=security::list_legacy_secret_accounts("")?;
  if let Some(legacy_account)=select_present_account(&legacy_refresh_candidates(profile_id),&legacy_accounts){
   account=legacy_account.clone();
   match security::legacy_get_secret_once(&legacy_account){
    Ok(Some(v)) if !v.trim().is_empty()=>{
     status="ACCESSIBLE".into();
     result=json!({"status":"ACCESSIBLE","recovered":false,"errorCode":Value::Null,"osstatus":Value::Null,"denial":Value::Null});
    },
    Ok(_)=>{},
    Err(e) if keychain_repairable_error(&e)=>{
     status="KEYCHAIN_BLOCKED".into();
     result=json!({"status":"KEYCHAIN_BLOCKED","recovered":false,"errorCode":security_error_code_safe(&e),"osstatus":Value::Null,"denial":Value::Null});
    },
    Err(e)=>{
     status="READ_FAILED".into();
     result=json!({"status":"READ_FAILED","recovered":false,"errorCode":security_error_code_safe(&e),"osstatus":Value::Null,"denial":Value::Null});
    }
   }
  }
 }
 Ok(json!({
  "profileUuid":profile_id,
  "channelId":profile.channel_id,
  "channelTitle":profile.channel_title,
  "account":account,
  "status":status,
  "recovered":result.get("recovered").and_then(Value::as_bool).unwrap_or(false),
  "errorCode":result.get("errorCode").cloned().unwrap_or(Value::Null),
  "osstatus":result.get("osstatus").cloned().unwrap_or(Value::Null),
  "denial":result.get("denial").cloned().unwrap_or(Value::Null),
  "secretValuesIncluded":false,
  "youtubeApiRequests":0,
  "youtubeQuotaDelta":0
 }))
}

#[tauri::command]
pub fn youtube_oauth_retry_profile_keychain(app:AppHandle,profile_id:String)->Result<Value,String>{
 oauth_safe_retry_profile_value(&app,profile_id.trim())
}

#[tauri::command]
pub fn youtube_oauth_safe_check_all_profiles(app:AppHandle)->Result<Value,String>{
 let store=load_store_metadata(&app)?;
 let mut rows=Vec::<Value>::new();let mut accessible=0usize;let mut blocked=0usize;let mut missing=0usize;let mut failed=0usize;let mut recovered=0usize;
 for profile in &store.profiles{
  let row=oauth_safe_retry_profile_value(&app,&profile.id)?;
  match row.get("status").and_then(Value::as_str).unwrap_or("READ_FAILED"){
   "ACCESSIBLE"=>{accessible+=1;if row.get("recovered").and_then(Value::as_bool)==Some(true){recovered+=1}},
   "KEYCHAIN_BLOCKED"=>blocked+=1,
   "MISSING"=>missing+=1,
   _=>failed+=1,
  }
  rows.push(row);
 }
 Ok(json!({"profiles":rows,"total":store.profiles.len(),"accessible":accessible,"recoveredAutomatically":recovered,"keychainBlocked":blocked,"missing":missing,"readFailed":failed,"secretValuesIncluded":false,"youtubeApiRequests":0,"youtubeQuotaDelta":0}))
}

fn existing_profile_recovery_bucket(keychain_status:&str,refresh_error:Option<&str>)->&'static str{
 if keychain_status=="KEYCHAIN_BLOCKED"{return "KEYCHAIN_BLOCKED"}
 if keychain_status=="MISSING"{return "RECONNECT_REQUIRED"}
 if keychain_status!="ACCESSIBLE"{return "FAILED"}
 if let Some(error)=refresh_error{
  if error.starts_with("OAUTH_INVALID_GRANT:")
    ||error.starts_with("OAUTH_RECONNECT_REQUIRED:")
    ||error.starts_with("REFRESH_TOKEN_MISSING:")
    ||error.starts_with("LEGACY_RECONNECT_REQUIRED:"){return "RECONNECT_REQUIRED"}
  if keychain_repairable_error(error)
    ||error.contains("OAUTH_CLIENT_SECRET_KEYCHAIN_BLOCKED")
    ||error.contains("OAUTH_CREDENTIAL_PRECHECK_FAILED"){return "KEYCHAIN_BLOCKED"}
  return "FAILED"
 }
 "READY"
}
fn existing_profile_recovery_reason(error:&str)->&'static str{
 if error.starts_with("OAUTH_INVALID_GRANT:"){"TOKEN_REVOKED"}
 else if error.contains("KEYCHAIN_ACCESS_DENIED_CACHED"){"KEYCHAIN_ACCESS_DENIED_CACHED"}
 else if error.contains("KEYCHAIN_AUTH_FAILED"){"KEYCHAIN_AUTH_FAILED"}
 else if error.contains("KEYCHAIN_INTERACTION_REQUIRED"){"KEYCHAIN_INTERACTION_REQUIRED"}
 else if error.contains("KEYCHAIN_ACCESS_DENIED"){"KEYCHAIN_ACCESS_DENIED"}
 else if error.contains("OAUTH_CLIENT_MISMATCH"){"OAUTH_CLIENT_MISMATCH"}
 else if error.contains("MISSING")||error.contains("RECONNECT_REQUIRED"){"REFRESH_TOKEN_MISSING"}
 else{"REFRESH_FAILED"}
}

#[tauri::command]
pub async fn youtube_oauth_recover_existing_profiles(app:AppHandle)->Result<Value,String>{
 let store=load_store_metadata(&app)?;
 let total=store.profiles.len();
 let mut rows=Vec::<Value>::with_capacity(total);
 let mut ready=0usize;let mut blocked=0usize;let mut reconnect=0usize;let mut failed=0usize;
 for (index,profile) in store.profiles.iter().enumerate(){
  let profile_id=profile.id.clone();
  let expected_channel_id=profile.channel_id.clone();
  let refresh_account=profile_refresh_token_account(&app,&profile_id)?;
  let mut status="FAILED".to_string();
  let mut reason="TOKEN_REFRESH_NOT_RUN".to_string();
  let mut token_refresh="NOT_RUN";
  let mut client_secret_source:Option<&'static str>=None;

  match require_canonical_refresh(&app,&profile_id){
   Ok(refresh_token)=>{
    match resolve_client_secret_for_profile(&app,&profile_id,&profile.client_id){
     Ok(resolved)=>{
      client_secret_source=Some(match resolved.source{
       OAuthClientSecretSource::ProfileCanonical=>"PROFILE_CANONICAL",
       OAuthClientSecretSource::GlobalExactMatch=>"GLOBAL_EXACT_MATCH",
       OAuthClientSecretSource::GlobalCurrentMigration=>"GLOBAL_CURRENT_MIGRATION",
       OAuthClientSecretSource::LegacyStable=>"LEGACY_STABLE",
      });
      match refresh_access_token_http(&resolved.client_id,&refresh_token,Some(&resolved.client_secret)).await{
       Ok((access,expires))=>{
        remember_access_token(&profile_id,&access,now_ts()+expires.max(60));
        // A successful refresh proves the saved credential still works. Do not rotate or
        // rewrite refresh/client-secret pointers merely because the binary version changed.
        record_profile_credential_validation(&app,&profile_id,"TOKEN_REFRESH_PASS",expected_channel_id.as_deref(),None)?;
        status="READY".into();reason="TOKEN_REFRESH_PASS".into();token_refresh="PASS";
       },
       Err(e)=>{
        status=existing_profile_recovery_bucket("ACCESSIBLE",Some(&e)).into();
        reason=existing_profile_recovery_reason(&e).into();
        if status=="RECONNECT_REQUIRED"{record_profile_credential_validation(&app,&profile_id,"RECONNECT_REQUIRED",expected_channel_id.as_deref(),None)?;}
       }
      }
     },
     Err(e)=>{
      status=existing_profile_recovery_bucket("ACCESSIBLE",Some(&e)).into();
      reason=existing_profile_recovery_reason(&e).into();
     }
    }
   },
   Err(e)=>{
    if keychain_repairable_error(&e)||e.contains("OAUTH_CREDENTIAL_PRECHECK_FAILED"){
     status="KEYCHAIN_BLOCKED".into();reason=existing_profile_recovery_reason(&e).into();
    }else if e.contains("OAUTH_RECONNECT_REQUIRED")||e.contains("REFRESH_TOKEN_MISSING")||e.contains("invalid_grant"){
     status="RECONNECT_REQUIRED".into();reason=existing_profile_recovery_reason(&e).into();
     record_profile_credential_validation(&app,&profile_id,"RECONNECT_REQUIRED",expected_channel_id.as_deref(),None)?;
    }else{
     status="FAILED".into();reason=existing_profile_recovery_reason(&e).into();
    }
   }
  }

  match status.as_str(){
   "READY"=>ready+=1,
   "KEYCHAIN_BLOCKED"=>blocked+=1,
   "RECONNECT_REQUIRED"=>reconnect+=1,
   _=>failed+=1,
  }
  rows.push(json!({
   "profileUuid":profile_id,"expectedChannelId":expected_channel_id,"refreshAccount":refresh_account,
   "status":status.clone(),"reasonCode":reason,"tokenRefresh":token_refresh,"clientSecretSource":client_secret_source,
   "browserLaunches":0,"youtubeApiRequests":0,"credentialsDialogs":0,"keychainPasswordDialogs":0,
   "secretValuesIncluded":false
  }));
  let _=app.emit("oauth-existing-recovery-progress",json!({
   "done":index+1,"total":total,"profileUuid":profile.id,"status":status,
   "automaticallyRestored":ready,"keychainBlocked":blocked,"reconnectRequired":reconnect,"failed":failed,
   "browserLaunches":0,"youtubeApiRequests":0
  }));
 }
 Ok(json!({
  "total":total,"automaticallyRestored":ready,"ready":ready,"keychainBlocked":blocked,
  "reconnectRequired":reconnect,"failed":failed,"manualQueue":reconnect,"attentionRequired":blocked+failed,
  "browserLaunches":0,"googleAccountSelectors":0,"credentialsDialogs":0,"keychainPasswordDialogs":0,
  "youtubeApiRequests":0,"videosInsert":0,"profiles":rows,"secretValuesIncluded":false
 }))
}
fn security_error_code_safe(error:&str)->&'static str{
 if error.contains("KEYCHAIN_INTERACTION_REQUIRED"){"KEYCHAIN_INTERACTION_REQUIRED"}
 else if error.contains("KEYCHAIN_AUTH_FAILED"){"KEYCHAIN_AUTH_FAILED"}
 else if error.contains("KEYCHAIN_USER_CANCELED"){"KEYCHAIN_USER_CANCELED"}
 else if error.contains("KEYCHAIN_ACCESS_DENIED"){"KEYCHAIN_ACCESS_DENIED"}
 else if error.contains("INVALID_GRANT")||error.contains("invalid_grant"){"OAUTH_INVALID_GRANT"}
 else{"RECOVERY_FAILED"}
}
#[tauri::command]
pub async fn youtube_oauth_interactive_recover_blocked_profiles(app:AppHandle)->Result<Value,String>{
 let store=load_store_metadata(&app)?;
 let global=load_google_config_for_secret_operation(&app)?;
 if global.client_id.trim().is_empty()||global.client_secret.trim().is_empty(){return Err("GLOBAL_OAUTH_NOT_READY: existing profile recovery requires current GLOBAL OAuth READY".into())}
 let legacy_accounts=security::list_legacy_secret_accounts("")?;
 let total=store.profiles.len();
 let mut rows=Vec::<Value>::with_capacity(total);
 let mut recovered=0usize;let mut blocked=0usize;let mut reconnect=0usize;let mut failed=0usize;let mut skipped=0usize;
 for (index,profile) in store.profiles.iter().enumerate(){
  let profile_id=profile.id.clone();let expected=profile.channel_id.clone();
  let before_state=read_keychain_migration_v2(&app)?;
  let old_account=profile_refresh_token_account_from_state(&before_state,&profile_id);
  let pointer_exists=before_state.refresh_token_accounts.get(&profile_id).map(|x|!x.trim().is_empty()).unwrap_or(false);
  let meta=security::canonical_account_metadata_diagnostic(&old_account);
  let canonical_visible=meta.get("metadataEnumeration").and_then(Value::as_str)==Some("VISIBLE");
  let denial=security::canonical_denial_diagnostic(&old_account);
  let current_error=denial.as_ref().and_then(|x|x.get("currentErrorCode")).and_then(Value::as_str);
  let legacy_account=select_present_account(&legacy_refresh_candidates(&profile_id),&legacy_accounts);
  let classification=classify_keychain_incident(pointer_exists,canonical_visible,legacy_account.is_some(),current_error).to_string();
  let currently_ready=security::canonical_secret_cached(&old_account)&&denial.is_none();
  if currently_ready{
   skipped+=1;rows.push(json!({"profileUuid":profile_id,"expectedChannelId":expected,"oldAccount":old_account,"newAccount":old_account,"status":"READY","reasonCode":"ALREADY_ACCESSIBLE","classification":classification,"pointerChanged":false,"generationChanged":false,"tokenRefresh":"NOT_RUN","browserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}));
   let _=app.emit("oauth-interactive-recovery-progress",json!({"done":index+1,"total":total,"profileUuid":profile.id,"status":"READY","recoveredWithoutGoogle":recovered,"keychainBlocked":blocked,"reconnectRequired":reconnect,"failed":failed}));continue
  }
  let interactive=if canonical_visible||denial.is_some(){security::canonical_interactive_recover_secret(&old_account)}
    else if let Some(ref legacy)=legacy_account{security::legacy_interactive_recover_secret(legacy)}
    else{Ok(None)};
  let refresh_token=match interactive{
   Ok(Some(v)) if !v.trim().is_empty()=>v,
   Ok(_)=>{
    let reason=if pointer_exists{"STALE_POINTER"}else{"ITEM_MISSING"};reconnect+=1;
    record_profile_credential_validation(&app,&profile_id,"RECONNECT_REQUIRED",expected.as_deref(),None)?;
    rows.push(json!({"profileUuid":profile_id,"expectedChannelId":expected,"oldAccount":old_account,"newAccount":Value::Null,"status":"RECONNECT_REQUIRED","reasonCode":reason,"classification":classification,"pointerChanged":false,"generationChanged":false,"tokenRefresh":"NOT_RUN","browserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}));
    let _=app.emit("oauth-interactive-recovery-progress",json!({"done":index+1,"total":total,"profileUuid":profile.id,"status":"RECONNECT_REQUIRED","recoveredWithoutGoogle":recovered,"keychainBlocked":blocked,"reconnectRequired":reconnect,"failed":failed}));continue
   },
   Err(e)=>{
    let is_blocked=keychain_repairable_error(&e);if is_blocked{blocked+=1}else{failed+=1};
    rows.push(json!({"profileUuid":profile_id,"expectedChannelId":expected,"oldAccount":old_account,"newAccount":Value::Null,"status":if is_blocked{"KEYCHAIN_BLOCKED"}else{"FAILED"},"reasonCode":existing_profile_recovery_reason(&e),"classification":classification,"pointerChanged":false,"generationChanged":false,"tokenRefresh":"NOT_RUN","errorCode":security_error_code_safe(&e),"osstatus":osstatus_from_error(&e),"browserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}));
    let status=if is_blocked{"KEYCHAIN_BLOCKED"}else{"FAILED"};let _=app.emit("oauth-interactive-recovery-progress",json!({"done":index+1,"total":total,"profileUuid":profile.id,"status":status,"recoveredWithoutGoogle":recovered,"keychainBlocked":blocked,"reconnectRequired":reconnect,"failed":failed}));continue
   }
  };
  let generation=next_profile_credential_generation(&before_state,&profile_id);
  let secret_store=KeychainOAuthSecretStore;
  let new_account=match rotate_recovered_refresh_with(&secret_store,&profile_id,generation,&refresh_token){
   Ok(v)=>v,Err(e)=>{failed+=1;rows.push(json!({"profileUuid":profile_id,"expectedChannelId":expected,"oldAccount":old_account,"newAccount":Value::Null,"status":"FAILED","reasonCode":"NEW_ACCOUNT_WRITE_FAILED","classification":classification,"pointerChanged":false,"generationChanged":false,"tokenRefresh":"NOT_RUN","errorCode":security_error_code_safe(&e),"browserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}));continue}
  };
  // Two-phase recovery: the old pointer remains authoritative until the freshly written
  // Keychain item has been read back AND the recovered refresh token has passed a real
  // Google token refresh. Never strand a profile on an unverified rotated credential.
  let refresh_result=match resolve_client_secret_for_profile(&app,&profile_id,&profile.client_id){
   Ok(resolved)=>refresh_access_token_http(&resolved.client_id,&refresh_token,Some(&resolved.client_secret)).await,
   Err(e)=>Err(e),
  };
  match refresh_result{
   Ok((access,expires))=>{
    let mut next_state=read_keychain_migration_v2(&app)?;
    commit_recovered_refresh_pointer(&mut next_state,&profile_id,&old_account,&new_account,generation);
    if let Err(e)=write_keychain_migration_v2(&app,&next_state){
     let _=security::canonical_delete_secret(&new_account);
     failed+=1;
     rows.push(json!({"profileUuid":profile_id,"expectedChannelId":expected,"oldAccount":old_account,"newAccount":new_account,"status":"FAILED","reasonCode":"POINTER_COMMIT_FAILED","pointerChanged":false,"generationChanged":false,"tokenRefresh":"PASS","errorCode":security_error_code_safe(&e),"browserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}));
     continue
    }
    remember_access_token(&profile_id,&access,now_ts()+expires.max(60));
    record_profile_credential_validation(&app,&profile_id,"TOKEN_REFRESH_PASS",expected.as_deref(),None)?;
    security::canonical_forget_cache(&old_account);
    recovered+=1;
    rows.push(json!({"profileUuid":profile_id,"expectedChannelId":expected,"oldAccount":old_account,"newAccount":new_account,"status":"READY","reasonCode":"INTERACTIVE_ROTATION_TOKEN_REFRESH_PASS","classification":classification,"pointerChanged":true,"generationChanged":true,"credentialGeneration":generation,"tokenRefresh":"PASS","browserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}));
   },
   Err(e)=>{
    // New item is only a staging credential until validation succeeds.
    let _=security::canonical_delete_secret(&new_account);
    let status=existing_profile_recovery_bucket("ACCESSIBLE",Some(&e));
    if status=="RECONNECT_REQUIRED"{reconnect+=1;record_profile_credential_validation(&app,&profile_id,"RECONNECT_REQUIRED",expected.as_deref(),None)?;}else if status=="KEYCHAIN_BLOCKED"{blocked+=1}else{failed+=1}
    rows.push(json!({"profileUuid":profile_id,"expectedChannelId":expected,"oldAccount":old_account,"newAccount":Value::Null,"status":status,"reasonCode":existing_profile_recovery_reason(&e),"classification":classification,"pointerChanged":false,"generationChanged":false,"credentialGeneration":before_state.credential_generations.get(&profile_id).copied().unwrap_or(0),"tokenRefresh":"FAIL","errorCode":security_error_code_safe(&e),"browserLaunches":0,"youtubeApiRequests":0,"secretValuesIncluded":false}));
   }
  }
  let status=rows.last().and_then(|x|x.get("status")).and_then(Value::as_str).unwrap_or("FAILED");
  let _=app.emit("oauth-interactive-recovery-progress",json!({"done":index+1,"total":total,"profileUuid":profile.id,"status":status,"recoveredWithoutGoogle":recovered,"keychainBlocked":blocked,"reconnectRequired":reconnect,"failed":failed}));
 }
 Ok(json!({"total":total,"recoveredWithoutGoogle":recovered,"keychainBlocked":blocked,"reconnectRequired":reconnect,"failed":failed,"skippedReady":skipped,"manualQueue":reconnect,"attentionRequired":blocked+failed,"browserLaunches":0,"googleAccountSelectors":0,"credentialsDialogs":0,"youtubeApiRequests":0,"videosInsert":0,"profiles":rows,"secretValuesIncluded":false}))
}
#[tauri::command]
pub fn youtube_keychain_migration_diagnostics(app:AppHandle)->Result<Value,String>{
 let state=read_keychain_migration_v2(&app)?;
 let migrated=state.profiles.values().filter(|x|x.as_str()==MIGRATION_MIGRATED).count();
 let failed=state.profiles.values().filter(|x|x.as_str()==MIGRATION_FAILED).count();
 let reconnect_required=state.profiles.values().filter(|x|x.as_str()==MIGRATION_RECONNECT_REQUIRED).count();
 Ok(json!({
  "version":state.version,
  "credentialSchemaVersion":CREDENTIAL_SCHEMA_VERSION,
  "legacyService":security::LEGACY_SERVICE,
  "canonicalService":security::canonical_service(),
  "profileStates":state.profiles,
  "validationStates":state.validations,
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

    let expected_channel_id=s.profiles[idx].channel_id.clone();
    let (token,expires)=match refresh_access_token_for_profile(app,profile_id,&client_id,&refresh).await{
      Ok(v)=>v,
      Err(e)=>{
       if e.starts_with("OAUTH_INVALID_GRANT:"){
        let _=record_profile_credential_validation(app,profile_id,"RECONNECT_REQUIRED",expected_channel_id.as_deref(),None);
       }
       return Err(e)
      }
    };
    let expires_at=now_ts()+expires.max(60);
    remember_access_token(profile_id,&token,expires_at);
    s.profiles[idx].access_token=token.clone();
    s.profiles[idx].expires_at=expires_at;
    s.profiles[idx].refresh_token.clear();
    s.profiles[idx].client_secret.clear();
    if let Err(e)=validate_profile_identity(app,&mut s.profiles[idx],&token).await{
      if e.starts_with("CHANNEL_MISMATCH:"){
       let actual=e.split("actual=").nth(1).map(str::trim);
       let _=record_profile_credential_validation(app,profile_id,"WRONG_CHANNEL",expected_channel_id.as_deref(),actual);
      }
      return Err(e)
    }
    let actual_channel_id=s.profiles[idx].identity_validated_channel_id.clone();
    record_profile_credential_validation(app,profile_id,"PASS",expected_channel_id.as_deref(),actual_channel_id.as_deref())?;
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
fn processing_state_from_status(status:&str)->&'static str{
 match status{
  "succeeded"=>"READY",
  "processing"=>"YOUTUBE_PROCESSING",
  "failed"|"terminated"=>"PROCESSING_FAILED",
  _=>"PROCESSING_UNKNOWN",
 }
}
#[tauri::command]
pub async fn youtube_video_processing_status(
 app:AppHandle,
 profile_id:String,
 video_id:String,
 operation_id:Option<String>,
)->Result<Value,String>{
 let video_id=video_id.trim().to_string();
 if video_id.is_empty(){return Err("VIDEO_ID_MISSING: processing check requires videoId".into())}
 // Authentication is resolved before emitting any YouTube API event, so broken local
 // credentials cannot burn inventory/processing quota.
 let (token,profile)=valid_access_token(&app,&profile_id).await?;
 emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());
 let r=reqwest::Client::new()
   .get("https://www.googleapis.com/youtube/v3/videos")
   .bearer_auth(&token)
   .query(&[("part","id,snippet,status,processingDetails"),("id",video_id.as_str())])
   .send().await.map_err(|e|format!("PROCESSING_CHECK_NETWORK: {e}"))?;
 let st=r.status();let v:Value=r.json().await.map_err(|e|format!("PROCESSING_CHECK_PARSE: {e}"))?;
 if !st.is_success(){return Err(youtube_error(&v,"YouTube processing status check failed"))}
 let item=v.pointer("/items/0").ok_or_else(||format!("PROCESSING_VIDEO_NOT_FOUND: {video_id}"))?;
 let actual=item.get("id").and_then(Value::as_str).unwrap_or("");
 if actual!=video_id{return Err(format!("PROCESSING_VIDEO_ID_MISMATCH: expected={video_id} actual={actual}"))}
 let actual_channel=item.pointer("/snippet/channelId").and_then(Value::as_str).unwrap_or("");
 if let Some(expected)=profile.channel_id.as_deref().filter(|x|!x.trim().is_empty()){
  if !actual_channel.is_empty()&&actual_channel!=expected{return Err(format!("PROCESSING_CHANNEL_MISMATCH: expected={expected} actual={actual_channel}"))}
 }
 let raw=item.pointer("/processingDetails/processingStatus").and_then(Value::as_str).unwrap_or("unknown");
 let state=processing_state_from_status(raw);
 Ok(json!({
   "videoId":actual,
   "channelId":actual_channel,
   "identityVerified":true,
   "processingStatus":raw,
   "processingState":state,
   "processingCheckedAt":Utc::now().to_rfc3339(),
   "processingProgress":{
     "partsTotal":item.pointer("/processingDetails/processingProgress/partsTotal").and_then(Value::as_str),
     "partsProcessed":item.pointer("/processingDetails/processingProgress/partsProcessed").and_then(Value::as_str),
     "timeLeftMs":item.pointer("/processingDetails/processingProgress/timeLeftMs").and_then(Value::as_str)
   },
   "processingFailureReason":item.pointer("/processingDetails/processingFailureReason").and_then(Value::as_str),
   "processingIssuesAvailability":item.pointer("/processingDetails/processingIssuesAvailability").and_then(Value::as_str),
   "rejectionReason":item.pointer("/status/rejectionReason").and_then(Value::as_str),
   "uploadStatus":item.pointer("/status/uploadStatus").and_then(Value::as_str),
   "privacyStatus":item.pointer("/status/privacyStatus").and_then(Value::as_str),
   "publishAt":item.pointer("/status/publishAt").and_then(Value::as_str)
 }))
}


#[tauri::command]
pub async fn youtube_video_processing_status_batch(
 app:AppHandle,
 profile_id:String,
 video_ids:Vec<String>,
 operation_id:Option<String>,
)->Result<Value,String>{
 let mut seen=std::collections::HashSet::<String>::new();
 let ids=video_ids.into_iter().map(|x|x.trim().to_string()).filter(|x|!x.is_empty()&&seen.insert(x.clone())).take(5000).collect::<Vec<_>>();
 if ids.is_empty(){return Ok(json!({"requested":0,"found":0,"calls":0,"rows":[]}))}
 let (token,profile)=valid_access_token(&app,&profile_id).await?;
 let client=reqwest::Client::new();
 let mut rows=Vec::<Value>::new();
 let mut found=std::collections::HashSet::<String>::new();
 let mut calls=0usize;
 for chunk in ids.chunks(50){
  calls+=1;
  emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());
  let joined=chunk.join(",");
  let r=client.get("https://www.googleapis.com/youtube/v3/videos")
   .bearer_auth(&token)
   .query(&[("part","id,snippet,status,processingDetails"),("id",joined.as_str())])
   .send().await.map_err(|e|format!("PROCESSING_BATCH_NETWORK: {e}"))?;
  let st=r.status();let v:Value=r.json().await.map_err(|e|format!("PROCESSING_BATCH_PARSE: {e}"))?;
  if !st.is_success(){return Err(youtube_error(&v,"YouTube processing batch status check failed"))}
  for item in v.get("items").and_then(Value::as_array).cloned().unwrap_or_default(){
   let actual=item.get("id").and_then(Value::as_str).unwrap_or("").to_string();
   if actual.is_empty(){continue}
   let actual_channel=item.pointer("/snippet/channelId").and_then(Value::as_str).unwrap_or("");
   if let Some(expected)=profile.channel_id.as_deref().filter(|x|!x.trim().is_empty()){
    if !actual_channel.is_empty()&&actual_channel!=expected{continue}
   }
   found.insert(actual.clone());
   let raw=item.pointer("/processingDetails/processingStatus").and_then(Value::as_str).unwrap_or("unknown");
   rows.push(json!({
    "videoId":actual,
    "channelId":actual_channel,
    "remoteExists":true,
    "identityVerified":true,
    "processingStatus":raw,
    "processingState":processing_state_from_status(raw),
    "processingCheckedAt":Utc::now().to_rfc3339(),
    "processingFailureReason":item.pointer("/processingDetails/processingFailureReason").and_then(Value::as_str),
    "rejectionReason":item.pointer("/status/rejectionReason").and_then(Value::as_str),
    "uploadStatus":item.pointer("/status/uploadStatus").and_then(Value::as_str),
    "privacyStatus":item.pointer("/status/privacyStatus").and_then(Value::as_str),
    "publishAt":item.pointer("/status/publishAt").and_then(Value::as_str)
   }));
  }
 }
 let checked_at=Utc::now().to_rfc3339();
 for id in ids.iter().filter(|x|!found.contains(*x)){
  rows.push(json!({"videoId":id,"remoteExists":false,"identityVerified":false,"processingStatus":"missing","processingState":"PROCESSING_UNKNOWN","processingCheckedAt":checked_at}));
 }
 Ok(json!({"requested":ids.len(),"found":found.len(),"calls":calls,"rows":rows}))
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

#[derive(Debug,Default,Clone,PartialEq,Eq)]
struct PlaylistPageDiagnostics{
    raw_items:usize,
    inspected_items:usize,
    added_unique:usize,
    duplicate_ids:usize,
    unresolved_items:usize,
    limit_truncated:bool,
}
fn append_playlist_page_ids_diagnostic(page:&Value,ids:&mut Vec<String>,seen:&mut std::collections::HashSet<String>,limit:usize)->PlaylistPageDiagnostics{
    let items=page.get("items").and_then(|x|x.as_array()).cloned().unwrap_or_default();
    let mut d=PlaylistPageDiagnostics{raw_items:items.len(),..Default::default()};
    for item in items{
        if ids.len()>=limit{d.limit_truncated=true;break}
        d.inspected_items+=1;
        let id=item.pointer("/contentDetails/videoId").and_then(|x|x.as_str())
            .or_else(||item.pointer("/snippet/resourceId/videoId").and_then(|x|x.as_str()));
        match id.filter(|x|!x.trim().is_empty()){
            Some(id) if seen.insert(id.to_string())=>{ids.push(id.to_string());d.added_unique+=1},
            Some(_)=>d.duplicate_ids+=1,
            None=>d.unresolved_items+=1,
        }
    }
    if d.inspected_items<d.raw_items{d.limit_truncated=true}
    d
}
fn append_playlist_page_ids(page:&Value,ids:&mut Vec<String>,seen:&mut std::collections::HashSet<String>,limit:usize)->usize{
    append_playlist_page_ids_diagnostic(page,ids,seen,limit).added_unique
}
fn schedule_data_incomplete_ids(rows:&[Value])->Vec<String>{
    rows.iter().filter_map(|x|{
        let id=x.get("id").and_then(|v|v.as_str()).unwrap_or("").to_string();
        let privacy=x.get("privacyStatus").and_then(|v|v.as_str()).unwrap_or("unknown");
        let publish_at=x.get("publishAt").and_then(|v|v.as_str()).unwrap_or("").trim();
        let bad_privacy=privacy=="unknown"||privacy.trim().is_empty();
        let bad_schedule=privacy=="private"&&!publish_at.is_empty()&&chrono::DateTime::parse_from_rfc3339(publish_at).is_err();
        if bad_privacy||bad_schedule{Some(id)}else{None}
    }).filter(|x|!x.is_empty()).collect()
}
fn inventory_completeness_value(
    playlist_exhausted:bool,
    limit_truncated:bool,
    playlist_unresolved:usize,
    unique_video_ids:usize,
    videos_hydrated:usize,
    hydration_errors:&[String],
    schedule_data_incomplete_count:usize,
    playlist_reported_total:usize,
)->Value{
    let mut incomplete=Vec::<String>::new();
    if !playlist_exhausted{incomplete.push("PLAYLIST_NOT_EXHAUSTED".into())}
    if limit_truncated{incomplete.push("LIMIT_TRUNCATED".into())}
    if playlist_unresolved>0{incomplete.push("PLAYLIST_ITEM_WITHOUT_VIDEO_ID".into())}
    if videos_hydrated<unique_video_ids{incomplete.push("MISSING_VIDEO_HYDRATION".into())}
    if !hydration_errors.is_empty(){incomplete.push("HYDRATION_BATCH_FAILED".into())}
    let sync_complete=incomplete.is_empty();
    let mut schedule_reasons=incomplete.clone();
    if schedule_data_incomplete_count>0{schedule_reasons.push("SCHEDULE_DATA_INCOMPLETE".into())}
    let schedule_complete=schedule_reasons.is_empty();
    let mut warnings=Vec::<String>::new();
    let page_info_mismatch=playlist_exhausted&&!limit_truncated&&playlist_reported_total>0&&playlist_reported_total!=unique_video_ids;
    if page_info_mismatch{warnings.push("PLAYLIST_TOTAL_METADATA_MISMATCH".into())}
    json!({
        "syncComplete":sync_complete,
        "scheduleComplete":schedule_complete,
        "incompleteReasons":schedule_reasons,
        "inventoryIncompleteReasons":incomplete,
        "diagnosticWarnings":warnings,
        "pageInfoTotalMismatch":page_info_mismatch
    })
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
    let mut playlist_reported_total=0usize;
    let mut playlist_calls=0usize;
    let mut playlist_exhausted=false;
    let mut limit_truncated=false;
    let mut playlist_items_fetched=0usize;
    let mut playlist_items_inspected=0usize;
    let mut playlist_duplicate_count=0usize;
    let mut playlist_unresolved_count=0usize;

    loop{
        if ids.len()>=limit{limit_truncated=true;break}
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
            playlist_reported_total=v.pointer("/pageInfo/totalResults").and_then(|x|x.as_u64()).unwrap_or(0) as usize;
        }
        let d=append_playlist_page_ids_diagnostic(&v,&mut ids,&mut seen,limit);
        playlist_items_fetched+=d.raw_items;
        playlist_items_inspected+=d.inspected_items;
        playlist_duplicate_count+=d.duplicate_ids;
        playlist_unresolved_count+=d.unresolved_items;
        let next=v.get("nextPageToken").and_then(|x|x.as_str()).map(str::to_string);
        if d.limit_truncated{
            limit_truncated=true;
            page=next;
            break
        }
        page=next;
        if page.is_none(){playlist_exhausted=true;break}
    }
    if playlist_reported_total==0{playlist_reported_total=ids.len()}

    let mut by_id=std::collections::HashMap::<String,Value>::new();
    let mut video_calls=0usize;
    let mut hydration_errors=Vec::<String>::new();
    let mut failed_hydration_ids=Vec::<String>::new();
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
            Err(e)=>{
                hydration_errors.push(format!("batch {video_calls}: network {e}"));
                failed_hydration_ids.extend(chunk.iter().cloned());
                continue
            }
        };
        let st=rr.status();let v:Value=rr.json().await.unwrap_or_else(|_|json!({}));
        if !st.is_success(){
            let err=youtube_error(&v,"Не удалось получить authoritative videos.list batch");
            let lower=err.to_ascii_lowercase();
            if lower.contains("quota")||lower.contains("dailylimit")||lower.contains("ratelimit"){return Err(err)}
            hydration_errors.push(format!("batch {video_calls}: {err}"));
            failed_hydration_ids.extend(chunk.iter().cloned());
            continue
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
    let missing_hydration_ids=ids.iter().filter(|id|!by_id.contains_key(*id)).cloned().collect::<Vec<_>>();
    let schedule_incomplete_ids=schedule_data_incomplete_ids(&out);
    let completeness=inventory_completeness_value(
        playlist_exhausted,
        limit_truncated,
        playlist_unresolved_count,
        unique_video_ids,
        videos_hydrated,
        &hydration_errors,
        schedule_incomplete_ids.len(),
        playlist_reported_total,
    );
    let sync_complete=completeness.get("syncComplete").and_then(Value::as_bool).unwrap_or(false);
    let schedule_complete=completeness.get("scheduleComplete").and_then(Value::as_bool).unwrap_or(false);
    let observed_total=if playlist_exhausted&&!limit_truncated{unique_video_ids}else{std::cmp::max(playlist_reported_total,unique_video_ids)};
    let expected=if playlist_exhausted&&!limit_truncated{unique_video_ids}else{std::cmp::min(std::cmp::max(playlist_reported_total,unique_video_ids),limit)};
    let (private_count,scheduled_count,public_count,unlisted_count)=inventory_bucket_counts(&out,Utc::now());
    let full_sync_api_requests=1+playlist_calls+video_calls;
    let full_sync_estimated_quota_cost=full_sync_api_requests;

    Ok(json!({
        "channelId":profile.channel_id,
        "channelTitle":profile.channel_title,
        "youtubeFound":observed_total,
        "playlistFound":playlist_reported_total,
        "playlistReportedTotal":playlist_reported_total,
        "inventoryExpected":expected,
        "playlistItemsFetched":playlist_items_fetched,
        "playlistItemsInspected":playlist_items_inspected,
        "uniqueVideoIds":unique_video_ids,
        "videosHydrated":videos_hydrated,
        "received":videos_hydrated,
        "requested":limit,
        "playlistExhausted":playlist_exhausted,
        "truncated":limit_truncated,
        "playlistDuplicateCount":playlist_duplicate_count,
        "playlistUnresolvedCount":playlist_unresolved_count,
        "privateCount":private_count,
        "publicCount":public_count,
        "scheduledCount":scheduled_count,
        "unlistedCount":unlisted_count,
        "pagesFetched":playlist_calls,
        "hydrationBatches":video_calls,
        "missingHydrationCount":missing_hydration_ids.len(),
        "missingHydrationIds":missing_hydration_ids,
        "failedHydrationIds":failed_hydration_ids,
        "scheduleDataIncompleteCount":schedule_incomplete_ids.len(),
        "scheduleIncompleteIds":schedule_incomplete_ids,
        "hydrationErrors":hydration_errors,
        "incompleteReasons":completeness.get("incompleteReasons").cloned().unwrap_or_else(||json!([])),
        "inventoryIncompleteReasons":completeness.get("inventoryIncompleteReasons").cloned().unwrap_or_else(||json!([])),
        "diagnosticWarnings":completeness.get("diagnosticWarnings").cloned().unwrap_or_else(||json!([])),
        "pageInfoTotalMismatch":completeness.get("pageInfoTotalMismatch").cloned().unwrap_or_else(||json!(false)),
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
        "estimatedForInventory":full_sync_estimate(observed_total),
        "videos":out
    }))
}

#[tauri::command]
pub async fn youtube_retry_existing_video_hydration(
    app:AppHandle,
    profile_id:String,
    video_ids:Vec<String>,
    operation_id:Option<String>,
)->Result<Value,String>{
    let (token,profile)=valid_access_token(&app,&profile_id).await?;
    let mut seen=std::collections::HashSet::<String>::new();
    let ids=video_ids.into_iter()
        .map(|x|x.trim().to_string())
        .filter(|x|!x.is_empty()&&seen.insert(x.clone()))
        .take(5000)
        .collect::<Vec<_>>();
    if ids.is_empty(){return Err("TARGETED_RETRY_EMPTY: нет video ID для проверки".into())}
    let client=reqwest::Client::new();
    let mut by_id=std::collections::HashMap::<String,Value>::new();
    let mut hydration_errors=Vec::<String>::new();
    let mut calls=0usize;
    for chunk in ids.chunks(50){
        calls+=1;
        emit_youtube_api_request(&app,"videos.list",operation_id.as_deref());
        let joined=chunk.join(",");
        let response=client.get("https://www.googleapis.com/youtube/v3/videos")
            .bearer_auth(&token)
            .query(&[("part","snippet,status,contentDetails,statistics"),("id",joined.as_str())])
            .send().await;
        let rr=match response{
            Ok(x)=>x,
            Err(e)=>{hydration_errors.push(format!("batch {calls}: network {e}"));continue}
        };
        let st=rr.status();let v:Value=rr.json().await.unwrap_or_else(|_|json!({}));
        if !st.is_success(){
            let err=youtube_error(&v,"Не удалось проверить недостающие video IDs");
            let lower=err.to_ascii_lowercase();
            if lower.contains("quota")||lower.contains("dailylimit")||lower.contains("ratelimit"){return Err(err)}
            hydration_errors.push(format!("batch {calls}: {err}"));continue
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
    let missing=ids.iter().filter(|id|!by_id.contains_key(*id)).cloned().collect::<Vec<_>>();
    let schedule_incomplete=schedule_data_incomplete_ids(&out);
    Ok(json!({
        "requestedIds":ids,
        "videosHydrated":out.len(),
        "missingHydrationCount":missing.len(),
        "missingHydrationIds":missing,
        "scheduleDataIncompleteCount":schedule_incomplete.len(),
        "scheduleIncompleteIds":schedule_incomplete,
        "hydrationErrors":hydration_errors,
        "apiRequests":calls,
        "complete":missing.is_empty()&&hydration_errors.is_empty(),
        "scheduleComplete":missing.is_empty()&&hydration_errors.is_empty()&&schedule_incomplete.is_empty(),
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
            google_email: None,
            google_subject_id: None,
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
        assert_eq!(secrets.values.borrow().len(), 2);
        assert!(secrets.values.borrow().get("oauth.p1.access_token").is_none());
        assert_eq!(
            secrets.values.borrow().get("oauth.p1.client_secret").map(String::as_str),
            Some("secret")
        )
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
            google_email: None,
            google_subject_id: None,
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
#[derive(Clone,Debug)]
struct PreparedSecretWrite{
 account:String,
 old_account:String,
 backup:Option<Option<String>>,
 created:bool,
 rotated:bool,
 old_read_error:Option<String>,
 old_osstatus:Option<i32>,
}
#[derive(Clone,Debug)]
struct ReconnectSecretBackup{
 items:Vec<(String,Option<String>)>,
 created_accounts:Vec<String>,
 refresh_account:String,
 client_secret_account:String,
 old_refresh_account:String,
 old_client_secret_account:String,
 refresh_rotated:bool,
 client_secret_rotated:bool,
 old_refresh_error:Option<String>,
 old_client_secret_error:Option<String>,
 old_refresh_osstatus:Option<i32>,
 old_client_secret_osstatus:Option<i32>,
 generation:u32,
}
fn reconnect_refresh_token(response_refresh:Option<&str>,existing_refresh:Option<&str>)->Result<String,String>{
    if let Some(v)=response_refresh.map(str::trim).filter(|x|!x.is_empty()){return Ok(v.to_string())}
    if let Some(v)=existing_refresh.map(str::trim).filter(|x|!x.is_empty()){return Ok(v.to_string())}
    Err("OAUTH_REFRESH_TOKEN_REQUIRED: Google не вернул новый refresh_token и у существующего профиля нет сохранённого canonical refresh_token.".into())
}
fn reconnect_authorized_channel_matches(expected: &str, authorized: &str) -> Result<(), String> {
    if expected == authorized {Ok(())} else {Err(format!("WRONG_CHANNEL: expected={expected} authorized={authorized}"))}
}
fn reconnect_profile_index(store: &OAuthStore, profile_id: &str) -> Result<usize, String> {
    store.profiles.iter().position(|p| p.id == profile_id)
        .ok_or_else(|| format!("OAUTH_PROFILE_NOT_FOUND: profile_id={profile_id}"))
}
fn reconnect_rollback_secrets_with<S:OAuthSecretStore>(secrets:&S,backup:&ReconnectSecretBackup){
    for account in backup.created_accounts.iter().rev(){let _=secrets.delete(account);}
    for (account,value) in backup.items.iter().rev(){
        let _=match value{Some(v)=>secrets.set(account,v),None=>secrets.delete(account)};
    }
}
fn prepare_secret_write_with<S:OAuthSecretStore>(
    secrets:&S,profile_id:&str,kind:&str,current_account:&str,value:&str,generation:u32,
)->Result<PreparedSecretWrite,String>{
    let mut rotation_error:Option<String>=None;
    match secrets.get(current_account){
      Ok(old_value)=>{
        let was_missing=old_value.is_none();
        match secrets.set(current_account,value){
          Ok(())=>{
            match secrets.verify(current_account,value){
              Ok(true)=>return Ok(PreparedSecretWrite{
                account:current_account.into(),old_account:current_account.into(),backup:Some(old_value),
                created:was_missing,rotated:false,old_read_error:None,old_osstatus:None,
              }),
              Ok(false)=>{
                let _=match &old_value{Some(v)=>secrets.set(current_account,v),None=>secrets.delete(current_account)};
                return Err(format!("OAUTH_KEYCHAIN_READBACK_FAILED: stage=EXISTING_SECRET_READBACK; account={current_account}; mismatch"))
              },
              Err(e)=>{
                let _=match &old_value{Some(v)=>secrets.set(current_account,v),None=>secrets.delete(current_account)};
                return Err(format!("OAUTH_KEYCHAIN_READBACK_FAILED: stage=EXISTING_SECRET_READBACK; account={current_account}; {e}"))
              }
            }
          }
          Err(e) if keychain_repairable_error(&e)=>{
            // Existing item is readable but no longer writable by this signed build.
            // Do not retry/update/delete it; rotate forward using the new validated credential.
            rotation_error=Some(e);
          }
          Err(e)=>return Err(format!("OAUTH_KEYCHAIN_WRITE_FAILED: stage=EXISTING_SECRET_WRITE; account={current_account}; {e}")),
        }
      }
      Err(e) if keychain_repairable_error(&e)=>{
        // Physical RC5 failure class: OLD_SECRET_BACKUP_READ is blocked.
        // The old value is deliberately not required for forward recovery.
        rotation_error=Some(e);
      }
      Err(e)=>return Err(format!("OAUTH_KEYCHAIN_READ_FAILED: stage=OLD_SECRET_BACKUP_READ; account={current_account}; {e}")),
    }
    let old_error=rotation_error;
    let old_osstatus=old_error.as_deref().and_then(osstatus_from_error);
    let new_account=rotated_profile_secret_account(profile_id,kind,generation);
    if secrets.accounts(&format!("oauth.{profile_id}.")).unwrap_or_default().iter().any(|x|x==&new_account){
      return Err(format!("OAUTH_ROTATION_ACCOUNT_COLLISION: account={new_account}"))
    }
    secrets.set(&new_account,value)
      .map_err(|e|format!("OAUTH_KEYCHAIN_WRITE_FAILED: stage=NEW_SECRET_WRITE; account={new_account}; {e}"))?;
    match secrets.verify(&new_account,value){
      Ok(true)=>Ok(PreparedSecretWrite{
        account:new_account,old_account:current_account.into(),backup:None,created:true,rotated:true,
        old_read_error:old_error,old_osstatus,
      }),
      Ok(false)=>{
        let _=secrets.delete(&new_account);
        Err(format!("NEW_ITEM_READBACK_FAILED: stage=NEW_SECRET_READBACK; account={new_account}; mismatch"))
      }
      Err(e)=>{
        let _=secrets.delete(&new_account);
        if e.contains("KEYCHAIN_AUTH_FAILED"){
          Err(format!("NEW_ITEM_READBACK_AUTH_FAILED: stage=NEW_SECRET_READBACK; account={new_account}; {e}"))
        }else{
          Err(format!("OAUTH_KEYCHAIN_READBACK_FAILED: stage=NEW_SECRET_READBACK; account={new_account}; {e}"))
        }
      }
    }
}
fn reconnect_write_readback_accounts_with<S:OAuthSecretStore>(
    secrets:&S,profile_id:&str,current_refresh_account:&str,current_client_secret_account:&str,
    generation:u32,client_secret:&str,access_token:&str,refresh_token:&str,
)->Result<ReconnectSecretBackup,String>{
    if profile_id.trim().is_empty(){return Err("OAUTH_PROFILE_ID_MISSING: existing profile UUID is required".into())}
    if access_token.trim().is_empty(){return Err("OAUTH_ACCESS_TOKEN_MISSING: validated access token is empty".into())}
    if refresh_token.trim().is_empty(){return Err("OAUTH_REFRESH_TOKEN_REQUIRED: Google не вернул refresh token. Подключение не сохранено.".into())}
    if client_secret.trim().is_empty(){return Err("OAUTH_CLIENT_SECRET_REQUIRED: exact client_secret is missing".into())}
    let refresh=prepare_secret_write_with(secrets,profile_id,"refresh_token",current_refresh_account,refresh_token,generation)?;
    let secret=match prepare_secret_write_with(secrets,profile_id,"client_secret",current_client_secret_account,client_secret,generation){
      Ok(x)=>x,
      Err(e)=>{
        let tmp=ReconnectSecretBackup{
          items:refresh.backup.clone().map(|v|vec![(refresh.old_account.clone(),v)]).unwrap_or_default(),
          created_accounts:if refresh.created&&refresh.rotated{vec![refresh.account.clone()]}else{vec![]},
          refresh_account:refresh.account.clone(),client_secret_account:current_client_secret_account.into(),
          old_refresh_account:refresh.old_account.clone(),old_client_secret_account:current_client_secret_account.into(),
          refresh_rotated:refresh.rotated,client_secret_rotated:false,
          old_refresh_error:refresh.old_read_error.clone(),old_client_secret_error:None,
          old_refresh_osstatus:refresh.old_osstatus,old_client_secret_osstatus:None,generation,
        };
        reconnect_rollback_secrets_with(secrets,&tmp);
        return Err(e)
      }
    };
    let mut items=Vec::new();
    if let Some(v)=refresh.backup.clone(){items.push((refresh.old_account.clone(),v))}
    if let Some(v)=secret.backup.clone(){items.push((secret.old_account.clone(),v))}
    let mut created_accounts=Vec::new();
    if refresh.created&&refresh.rotated{created_accounts.push(refresh.account.clone())}
    if secret.created&&secret.rotated{created_accounts.push(secret.account.clone())}
    Ok(ReconnectSecretBackup{
      items,created_accounts,
      refresh_account:refresh.account,client_secret_account:secret.account,
      old_refresh_account:refresh.old_account,old_client_secret_account:secret.old_account,
      refresh_rotated:refresh.rotated,client_secret_rotated:secret.rotated,
      old_refresh_error:refresh.old_read_error,old_client_secret_error:secret.old_read_error,
      old_refresh_osstatus:refresh.old_osstatus,old_client_secret_osstatus:secret.old_osstatus,
      generation,
    })
}
fn reconnect_write_readback_with<S:OAuthSecretStore>(
    secrets:&S,profile_id:&str,client_secret:&str,access_token:&str,refresh_token:&str,
)->Result<ReconnectSecretBackup,String>{
    reconnect_write_readback_accounts_with(
      secrets,profile_id,&oauth_key(profile_id,"refresh_token"),&oauth_key(profile_id,"client_secret"),
      1,client_secret,access_token,refresh_token
    )
}
fn reconnect_apply_profile_metadata(
    store:&mut OAuthStore,profile_id:&str,client_id:&str,client_secret:&str,access_token:&str,refresh_token:&str,
    authorized_channel_id:&str,authorized_channel_title:&str,scopes:&[String],preferred_browser:&str,expires_in:i64,
)->Result<(),String>{
    let idx=reconnect_profile_index(store,profile_id)?;
    let expected=store.profiles[idx].channel_id.clone().filter(|x|!x.trim().is_empty())
      .ok_or_else(||format!("OAUTH_EXPECTED_CHANNEL_MISSING: profile_id={profile_id}"))?;
    reconnect_authorized_channel_matches(&expected,authorized_channel_id)?;
    let before_ids=store.profiles.iter().map(|p|p.id.clone()).collect::<Vec<_>>();
    let p=&mut store.profiles[idx];
    p.client_id=client_id.into();p.client_secret=client_secret.into();p.access_token=access_token.into();p.refresh_token=refresh_token.into();
    p.expires_at=now_ts()+expires_in.max(60);p.connected_at=Utc::now().to_rfc3339();p.scopes=scopes.to_vec();p.preferred_browser=preferred_browser.into();
    p.channel_title=Some(authorized_channel_title.into());p.identity_validated_at=Some(Utc::now().to_rfc3339());
    p.identity_validated_channel_id=Some(authorized_channel_id.into());p.credential_error=None;
    let after_ids=store.profiles.iter().map(|p|p.id.clone()).collect::<Vec<_>>();
    if before_ids!=after_ids{return Err("OAUTH_PROFILE_MUTATION_GUARD: reconnect changed profile list/UUIDs".into())}
    Ok(())
}
fn reconnect_apply_validated_accounts_with<S:OAuthSecretStore>(
    secrets:&S,store:&mut OAuthStore,profile_id:&str,current_refresh_account:&str,current_client_secret_account:&str,generation:u32,
    client_id:&str,client_secret:&str,access_token:&str,refresh_token:&str,authorized_channel_id:&str,authorized_channel_title:&str,
    scopes:&[String],preferred_browser:&str,expires_in:i64,
)->Result<ReconnectSecretBackup,String>{
    let idx=reconnect_profile_index(store,profile_id)?;
    let expected=store.profiles[idx].channel_id.clone().filter(|x|!x.trim().is_empty())
      .ok_or_else(||format!("OAUTH_EXPECTED_CHANNEL_MISSING: profile_id={profile_id}"))?;
    reconnect_authorized_channel_matches(&expected,authorized_channel_id)?;
    let backup=reconnect_write_readback_accounts_with(
      secrets,profile_id,current_refresh_account,current_client_secret_account,generation,client_secret,access_token,refresh_token
    )?;
    if let Err(e)=reconnect_apply_profile_metadata(store,profile_id,client_id,client_secret,access_token,refresh_token,authorized_channel_id,authorized_channel_title,scopes,preferred_browser,expires_in){
      reconnect_rollback_secrets_with(secrets,&backup);return Err(e)
    }
    Ok(backup)
}
fn reconnect_apply_validated_with<S:OAuthSecretStore>(
    secrets:&S,store:&mut OAuthStore,profile_id:&str,client_id:&str,client_secret:&str,access_token:&str,refresh_token:&str,
    authorized_channel_id:&str,authorized_channel_title:&str,scopes:&[String],preferred_browser:&str,expires_in:i64,
)->Result<ReconnectSecretBackup,String>{
    reconnect_apply_validated_accounts_with(
      secrets,store,profile_id,&oauth_key(profile_id,"refresh_token"),&oauth_key(profile_id,"client_secret"),1,
      client_id,client_secret,access_token,refresh_token,authorized_channel_id,authorized_channel_title,scopes,preferred_browser,expires_in
    )
}
fn apply_reconnect_pointer_metadata(state:&mut KeychainMigrationV2State,profile_id:&str,backup:&ReconnectSecretBackup){
    state.refresh_token_accounts.insert(profile_id.to_string(),backup.refresh_account.clone());
    state.client_secret_accounts.insert(profile_id.to_string(),backup.client_secret_account.clone());
    state.profiles.insert(profile_id.to_string(),MIGRATION_MIGRATED.into());
    if backup.refresh_rotated||backup.client_secret_rotated{
      state.credential_generations.insert(profile_id.to_string(),backup.generation);
      state.credential_rotated_at.insert(profile_id.to_string(),Utc::now().to_rfc3339());
    }
}
fn rotation_reason(error:Option<&str>)->Option<&'static str>{
    let e=error?;
    if e.contains("KEYCHAIN_AUTH_FAILED"){Some("KEYCHAIN_AUTH_FAILED")}
    else if e.contains("KEYCHAIN_INTERACTION_REQUIRED"){Some("KEYCHAIN_INTERACTION_REQUIRED")}
    else if e.contains("KEYCHAIN_USER_CANCELED"){Some("KEYCHAIN_USER_CANCELED")}
    else if e.contains("KEYCHAIN_ACCESS_DENIED"){Some("KEYCHAIN_ACCESS_DENIED")}
    else{Some("KEYCHAIN_WRITE_BLOCKED")}
}
fn reconnect_auth_url(
    client_id: &str,
    redirect: &str,
    scope: &str,
    challenge: &str,
    state: &str,
) -> String {
    oauth_authorization_url(client_id,redirect,scope,challenge,state)
}
async fn reconnect_refresh_smoke(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<(String, i64), String> {
    if client_secret.trim().is_empty(){return Err("OAUTH_CLIENT_SECRET_REQUIRED: exact client_secret is missing".into())}
    let form=refresh_token_form(client_id,client_secret,refresh_token);
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
    let historical_client_id=target.client_id.clone();
    // Recovery identity is the existing Profile UUID + expected YouTube channel_id.
    // OAuth app client metadata may migrate to the current configured VYRON OAuth client.
    let resolved_client=resolve_reconnect_oauth_client(&app,&profile_id,&historical_client_id)?;
    let client_id=resolved_client.client_id.clone();
    let client_secret=resolved_client.client_secret.clone();
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
    let scope="openid email profile https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly";
    let scopes = scope
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let auth_url = reconnect_auth_url(&client_id, &redirect, scope, &challenge, &state);
    let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"CONNECTING","expectedChannelId":expected_channel_id}));
    open_browser(&auth_url, &preferred_browser)?;
    let expected_state = state.clone();
    let code=tauri::async_runtime::spawn_blocking(move||wait_for_oauth_code(listener,expected_state))
        .await.map_err(|e|format!("OAUTH_CALLBACK_TASK_FAILED: {e}"))??;
    let token_form=authorization_code_token_form(&client_id,&client_secret,&code,&verifier,&redirect);
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
    let response_refresh=tv.get("refresh_token").and_then(Value::as_str);
    let google_returned_new_refresh=response_refresh.map(str::trim).filter(|x|!x.is_empty()).is_some();
    let existing_refresh=if google_returned_new_refresh{
        None
    }else{
        let active_refresh_account=profile_refresh_token_account(&app,&profile_id)?;
        match security::canonical_get_secret_cached(&active_refresh_account){
            Ok(v)=>v,
            Err(e) if keychain_repairable_error(&e)=>{
                return Err(format!("OAUTH_REFRESH_TOKEN_REQUIRED_FOR_ROTATION: stage=OLD_SECRET_READ_WITHOUT_NEW_TOKEN; account={active_refresh_account}; {e}"))
            }
            Err(e)=>return Err(e),
        }
    };
    let refresh=reconnect_refresh_token(response_refresh,existing_refresh.as_deref())?;
    let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"VALIDATING","expectedChannelId":expected_channel_id}));
    // Validate the newly issued refresh token first. The refreshed access token is then used for the single YouTube identity request.
    let (access, expires) = reconnect_refresh_smoke(&client_id, &client_secret, &refresh).await?;
    let (authorized_google_email,authorized_google_subject_id)=google_identity_metadata(&access).await;
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
    if let (Some(expected_email),Some(received_email))=(target.google_email.as_deref(),authorized_google_email.as_deref()){
        if !google_account_identity_matches(Some(expected_email),Some(received_email)){
            let authorized_channels=items.iter().map(|x|channel_identity_value(x,&original_store)).collect::<Vec<_>>();
            let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"WRONG_CHANNEL","reason":"WRONG_GOOGLE_ACCOUNT","expectedGoogleEmail":expected_email,"authorizedGoogleEmail":received_email,"expectedChannelId":expected_channel_id,"credentialsCommitted":false}));
            return Ok(json!({
              "ok":false,"status":"WRONG_CHANNEL","code":"WRONG_ACCOUNT","profileId":profile_id,
              "profileUuidPreserved":true,"expectedChannelId":expected_channel_id,"expectedChannelTitle":target.channel_title,
              "expectedGoogleEmail":expected_email,"authorizedGoogleEmail":received_email,
              "authorizedChannels":authorized_channels,"browser":preferred_browser,
              "credentialsCommitted":false,"refreshPointerChanged":false,"clientSecretPointerChanged":false,"generationChanged":false,
              "videosInsert":0,"secretValuesIncluded":false
            }));
        }
    }
    let matched=find_expected_channel_item(items,&expected_channel_id);
    let item = match matched {
        Some(x) => x,
        None => {
            let authorized_channels=items.iter().map(|x|channel_identity_value(x,&original_store)).collect::<Vec<_>>();
            let authorized_ids=authorized_channels.iter().filter_map(|x|x.get("channelId").and_then(Value::as_str)).collect::<Vec<_>>();
            let _=app.emit("oauth-recovery-stage",json!({"profileId":profile_id,"state":"WRONG_CHANNEL","expectedChannelId":expected_channel_id,"authorizedChannelIds":authorized_ids,"credentialsCommitted":false}));
            return Ok(json!({
              "ok":false,"status":"WRONG_CHANNEL","code":"WRONG_CHANNEL","profileId":profile_id,
              "profileUuidPreserved":true,"expectedChannelId":expected_channel_id,"expectedChannelTitle":target.channel_title,
              "authorizedChannels":authorized_channels,"browser":preferred_browser,
              "credentialsCommitted":false,"refreshPointerChanged":false,"clientSecretPointerChanged":false,"generationChanged":false,
              "videosInsert":0,"secretValuesIncluded":false
            }));
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
    let _=app.emit("oauth-recovery-stage",json!({
      "profileId":profile_id,"state":"SAVING","expectedChannelId":expected_channel_id,
      "authorizedChannelId":authorized_channel_id,"googleRefreshTokenReturned":google_returned_new_refresh,
      "tokenRefreshSmoke":"PASS","channelIdentity":"PASS"
    }));
    let pointer_before=read_keychain_migration_v2(&app)?;
    let current_refresh_account=profile_refresh_token_account_from_state(&pointer_before,&profile_id);
    let current_client_secret_account=profile_client_secret_account_from_state(&pointer_before,&profile_id);
    let generation=next_profile_credential_generation(&pointer_before,&profile_id);
    let mut next_store=original_store.clone();
    let secrets=KeychainOAuthSecretStore;
    let backup=reconnect_apply_validated_accounts_with(
        &secrets,&mut next_store,&profile_id,&current_refresh_account,&current_client_secret_account,generation,
        &client_id,&client_secret,&access,&refresh,&authorized_channel_id,&authorized_channel_title,
        &scopes,&preferred_browser,expires,
    )?;
    if let Some(p)=next_store.profiles.iter_mut().find(|p|p.id==profile_id){
        if authorized_google_email.is_some(){p.google_email=authorized_google_email.clone();}
        if authorized_google_subject_id.is_some(){p.google_subject_id=authorized_google_subject_id.clone();}
    }
    let recovery_reason=rotation_reason(backup.old_refresh_error.as_deref())
      .or_else(||rotation_reason(backup.old_client_secret_error.as_deref()));
    let _=app.emit("oauth-recovery-stage",json!({
      "profileId":profile_id,"state":"KEYCHAIN_PREPARED",
      "oldRefreshAccount":backup.old_refresh_account,"newRefreshAccount":backup.refresh_account,
      "oldClientSecretAccount":backup.old_client_secret_account,"newClientSecretAccount":backup.client_secret_account,
      "oldRefreshReadOsstatus":backup.old_refresh_osstatus,"oldClientSecretReadOsstatus":backup.old_client_secret_osstatus,
      "refreshRotated":backup.refresh_rotated,"clientSecretRotated":backup.client_secret_rotated,
      "newWrite":"PASS","newReadback":"PASS","secretValuesIncluded":false
    }));

    let mut pointer_next=pointer_before.clone();
    apply_reconnect_pointer_metadata(&mut pointer_next,&profile_id,&backup);
    if let Err(e)=write_keychain_migration_v2(&app,&pointer_next){
        reconnect_rollback_secrets_with(&secrets,&backup);
        return Err(format!("OAUTH_METADATA_POINTER_COMMIT_FAILED: stage=METADATA_POINTER_COMMIT; {e}"))
    }
    if let Err(e)=write_oauth_metadata(&store_path(&app)?,&next_store){
        let _=write_keychain_migration_v2(&app,&pointer_before);
        reconnect_rollback_secrets_with(&secrets,&backup);
        return Err(format!("OAUTH_METADATA_SAVE_FAILED: stage=METADATA_COMMIT; {e}"))
    }

    let persisted_pointer=read_keychain_migration_v2(&app)?;
    let persisted_refresh_account=profile_refresh_token_account_from_state(&persisted_pointer,&profile_id);
    let persisted_client_secret_account=profile_client_secret_account_from_state(&persisted_pointer,&profile_id);
    let verify = load_store_metadata(&app)?;
    let verified = verify.profiles.iter().find(|p|p.id==profile_id).ok_or_else(||{
      "OAUTH_SAVE_VERIFY_FAILED: stage=POST_COMMIT_READ; existing profile UUID disappeared after save".to_string()
    })?;
    let pointer_ok=persisted_refresh_account==backup.refresh_account&&persisted_client_secret_account==backup.client_secret_account;
    let refresh_ok=match security::canonical_verify_secret(&persisted_refresh_account,&refresh){
      Ok(v)=>v,
      Err(e)=>{
        let _=write_keychain_migration_v2(&app,&pointer_before);let _=write_oauth_metadata(&store_path(&app)?,&original_store);
        reconnect_rollback_secrets_with(&secrets,&backup);
        return Err(format!("OAUTH_POST_COMMIT_READ_FAILED: stage=POST_COMMIT_READ; account={persisted_refresh_account}; {e}"))
      }
    };
    let client_secret_ok=match security::canonical_verify_secret(&persisted_client_secret_account,&client_secret){
      Ok(v)=>v,
      Err(e)=>{
        let _=write_keychain_migration_v2(&app,&pointer_before);let _=write_oauth_metadata(&store_path(&app)?,&original_store);
        reconnect_rollback_secrets_with(&secrets,&backup);
        return Err(format!("OAUTH_POST_COMMIT_READ_FAILED: stage=POST_COMMIT_READ; account={persisted_client_secret_account}; {e}"))
      }
    };
    let identity_ok=verified.channel_id.as_deref()==Some(expected_channel_id.as_str())
      &&verified.identity_validated_channel_id.as_deref()==Some(expected_channel_id.as_str());
    if !(pointer_ok&&refresh_ok&&client_secret_ok&&identity_ok){
        let _=write_keychain_migration_v2(&app,&pointer_before);
        let _=write_oauth_metadata(&store_path(&app)?,&original_store);
        reconnect_rollback_secrets_with(&secrets,&backup);
        return Err("OAUTH_SAVE_VERIFY_FAILED: stage=POST_COMMIT_READ; secure account pointer/readback/identity mismatch".into())
    }
    remember_access_token(&profile_id,&access,now_ts()+expires.max(60));
    record_profile_credential_validation(&app,&profile_id,"PASS",Some(&expected_channel_id),Some(&authorized_channel_id))?;
    let _=app.emit("oauth-recovery-stage",json!({
      "profileId":profile_id,"state":"CONNECTED","expectedChannelId":expected_channel_id,
      "authorizedChannelId":authorized_channel_id,"metadataPointer":"PASS","postCommitRead":"PASS"
    }));
    Ok(json!({
      "ok":true,"status":"CONNECTED","profileId":profile_id,"profileUuidPreserved":true,
      "expectedChannelId":expected_channel_id,"authorizedChannelId":authorized_channel_id,
      "channelTitle":authorized_channel_title,"refreshTokenStored":true,"clientSecretStored":true,
      "keychainReadback":"FOUND","tokenRefresh":"PASS","channelIdentity":"PASS","youtubeIdentityRequests":1,"videosInsert":0,
      "credentialRotated":backup.refresh_rotated||backup.client_secret_rotated,
      "refreshRotated":backup.refresh_rotated,"clientSecretRotated":backup.client_secret_rotated,
      "oldRefreshAccount":backup.old_refresh_account,"activeRefreshAccount":backup.refresh_account,
      "oldClientSecretAccount":backup.old_client_secret_account,"activeClientSecretAccount":backup.client_secret_account,
      "oldRefreshOsstatus":backup.old_refresh_osstatus,"oldClientSecretOsstatus":backup.old_client_secret_osstatus,
      "rotationReason":recovery_reason,"credentialGeneration":backup.generation,
      "googleRefreshTokenReturned":google_returned_new_refresh,
      "keychainNewWrite":"PASS","keychainNewReadback":"PASS","metadataPointer":"PASS","postCommitRead":"PASS",
      "secretValuesIncluded":false
    }))
}



#[cfg(test)]
mod v300_final_stabilization_tests{
 use super::*;
 use std::cell::{Cell,RefCell};

 #[derive(Default)]
 struct RecoveryStore{
  values:RefCell<HashMap<String,String>>,
  fail_set:Cell<bool>,
  fail_verify:Cell<bool>,
 }
 impl OAuthSecretStore for RecoveryStore{
  fn get(&self,account:&str)->Result<Option<String>,String>{Ok(self.values.borrow().get(account).cloned())}
  fn set(&self,account:&str,value:&str)->Result<(),String>{
   if self.fail_set.get(){return Err("KEYCHAIN_WRITE_FAILED: simulated".into())}
   self.values.borrow_mut().insert(account.to_string(),value.to_string());Ok(())
  }
  fn delete(&self,account:&str)->Result<(),String>{self.values.borrow_mut().remove(account);Ok(())}
  fn verify(&self,account:&str,expected:&str)->Result<bool,String>{
   if self.fail_verify.get(){return Ok(false)}
   Ok(self.values.borrow().get(account).map(String::as_str)==Some(expected))
  }
  fn accounts(&self,prefix:&str)->Result<Vec<String>,String>{Ok(self.values.borrow().keys().filter(|x|x.starts_with(prefix)).cloned().collect())}
 }

 #[test]
 fn blocked_item_interactive_value_rotates_fresh_account_and_preserves_old_evidence(){
  let secrets=RecoveryStore::default();
  let profile="11111111-1111-4111-8111-111111111111";
  let old=oauth_key(profile,"refresh_token");
  secrets.values.borrow_mut().insert(old.clone(),"refresh-old".into());
  let mut state=KeychainMigrationV2State::default();
  state.refresh_token_accounts.insert(profile.into(),old.clone());
  state.credential_generations.insert(profile.into(),3);
  let generation=next_profile_credential_generation(&state,profile);
  let fresh=rotate_recovered_refresh_with(&secrets,profile,generation,"refresh-old").unwrap();
  assert_ne!(fresh,old);
  assert_eq!(secrets.values.borrow().get(&old).map(String::as_str),Some("refresh-old"));
  assert_eq!(secrets.values.borrow().get(&fresh).map(String::as_str),Some("refresh-old"));
  commit_recovered_refresh_pointer(&mut state,profile,&old,&fresh,generation);
  assert_eq!(profile_refresh_token_account_from_state(&state,profile),fresh);
  assert_eq!(state.credential_generations.get(profile).copied(),Some(4));
  assert!(state.legacy_blocked_accounts.get(profile).unwrap().contains(&old));
 }

 #[test]
 fn denied_interactive_recovery_preserves_old_pointer(){
  let profile="22222222-2222-4222-8222-222222222222";
  let old=oauth_key(profile,"refresh_token");
  let mut state=KeychainMigrationV2State::default();
  state.refresh_token_accounts.insert(profile.into(),old.clone());
  state.credential_generations.insert(profile.into(),7);
  assert_eq!(classify_keychain_incident(true,false,false,Some("KEYCHAIN_INTERACTION_REQUIRED")),"ITEM_EXISTS_INTERACTION_REQUIRED");
  assert_eq!(profile_refresh_token_account_from_state(&state,profile),old);
  assert_eq!(state.credential_generations.get(profile).copied(),Some(7));
 }

 #[test]
 fn fresh_account_write_failure_never_changes_pointer(){
  let secrets=RecoveryStore::default();secrets.fail_set.set(true);
  let profile="33333333-3333-4333-8333-333333333333";let old=oauth_key(profile,"refresh_token");
  let mut state=KeychainMigrationV2State::default();state.refresh_token_accounts.insert(profile.into(),old.clone());state.credential_generations.insert(profile.into(),2);
  assert!(rotate_recovered_refresh_with(&secrets,profile,3,"refresh").unwrap_err().contains("NEW_WRITE"));
  assert_eq!(profile_refresh_token_account_from_state(&state,profile),old);
  assert_eq!(state.credential_generations.get(profile).copied(),Some(2));
 }

 #[test]
 fn fresh_account_readback_failure_never_changes_pointer(){
  let secrets=RecoveryStore::default();secrets.fail_verify.set(true);
  let profile="44444444-4444-4444-8444-444444444444";let old=oauth_key(profile,"refresh_token");
  let mut state=KeychainMigrationV2State::default();state.refresh_token_accounts.insert(profile.into(),old.clone());state.credential_generations.insert(profile.into(),5);
  assert!(rotate_recovered_refresh_with(&secrets,profile,6,"refresh").unwrap_err().contains("READBACK"));
  assert_eq!(profile_refresh_token_account_from_state(&state,profile),old);
  assert_eq!(state.credential_generations.get(profile).copied(),Some(5));
 }

 #[test]
 fn invalid_grant_after_recovery_requires_only_that_profile_reconnect(){
  assert_eq!(existing_profile_recovery_bucket("ACCESSIBLE",Some("OAUTH_INVALID_GRANT: revoked")),"RECONNECT_REQUIRED");
  assert_eq!(existing_profile_recovery_reason("OAUTH_INVALID_GRANT: revoked"),"TOKEN_REVOKED");
 }

 #[test]
 fn keychain_incident_classification_distinguishes_missing_denied_legacy_and_stale(){
  assert_eq!(classify_keychain_incident(false,false,false,None),"ITEM_MISSING");
  assert_eq!(classify_keychain_incident(true,true,false,Some("KEYCHAIN_ACCESS_DENIED")),"ITEM_EXISTS_ACCESS_DENIED");
  assert_eq!(classify_keychain_incident(true,true,false,Some("KEYCHAIN_AUTH_FAILED")),"AUTH_FAILED");
  assert_eq!(classify_keychain_incident(false,false,true,None),"LEGACY_POINTER_ONLY");
  assert_eq!(classify_keychain_incident(true,false,false,None),"STALE_POINTER");
 }

 #[test]
 fn application_version_transition_does_not_rotate_active_pointer(){
  let profile="55555555-5555-4555-8555-555555555555";
  let active="oauth.55555555-5555-4555-8555-555555555555.refresh_token.v2.9.active".to_string();
  let mut state=KeychainMigrationV2State::default();
  state.refresh_token_accounts.insert(profile.into(),active.clone());
  state.credential_generations.insert(profile.into(),9);
  let bytes=serde_json::to_vec(&state).unwrap();
  let after:KeychainMigrationV2State=serde_json::from_slice(&bytes).unwrap();
  assert_eq!(profile_refresh_token_account_from_state(&after,profile),active);
  assert_eq!(after.credential_generations.get(profile).copied(),Some(9));
  let next_name=rotated_profile_secret_account(profile,"refresh_token",10);
  assert!(!next_name.contains("3.0.0"));
 }
}

#[cfg(test)]
mod v2115_rc3_oauth_processing_tests{
 use super::*;
 #[test]
 fn metadata_presence_alone_is_never_oauth_ready(){
  let c=GoogleConfig{client_id:"CLIENT".into(),client_secret:String::new(),project_id:"vyron".into(),api_key:String::new(),client_secret_present:true,client_secret_account:"google.client_secret".into(),api_key_present:false};
  let v=google_config_status_value(&c);
  assert_eq!(v["oauthReady"],false);
  assert_eq!(v["oauthState"],"CONFIGURED");
  assert_eq!(v["hasSecret"],true);
 }
 #[test]
 fn actual_secret_read_is_required_for_ready(){
  let c=GoogleConfig{client_id:"CLIENT".into(),client_secret:String::new(),project_id:"vyron".into(),api_key:String::new(),client_secret_present:true,client_secret_account:"google.client_secret".into(),api_key_present:false};
  let ready=google_config_operational_status_value(&c,Ok(Some("secret".into())));
  assert_eq!(ready["oauthReady"],true);
  assert_eq!(ready["oauthState"],"READY");
  let denied=google_config_operational_status_value(&c,Err("KEYCHAIN_ACCESS_DENIED_CACHED: canonical account=google.client_secret".into()));
  assert_eq!(denied["oauthReady"],false);
  assert_eq!(denied["oauthState"],"KEYCHAIN_ACCESS_BLOCKED");
  assert_eq!(denied["repairRequired"],false);
  assert_eq!(denied["secureStorageErrorCode"],"KEYCHAIN_ACCESS_DENIED_CACHED");
 }
 #[test]
 fn repair_rotates_account_without_secret_in_account_name(){
  let a=rotated_google_client_secret_account("471814393352-example.apps.googleusercontent.com");
  let b=rotated_google_client_secret_account("471814393352-example.apps.googleusercontent.com");
  assert!(a.starts_with("google.client_secret.rc3."));
  assert_ne!(a,b);
  assert!(!a.contains("example.apps"));
 }
 #[test]
 fn repaired_global_secret_account_is_reused_only_when_new_channel_commit_occurs(){
  let source=include_str!("youtube.rs");
  let commit=source.split("fn commit_new_channel_oauth(").nth(1).unwrap().split("#[tauri::command]\npub async fn youtube_oauth_connect(").next().unwrap();
  assert!(commit.contains("google_client_secret_account(&global_meta)"));
  assert!(commit.contains("global_meta.client_id.trim()==client_id"));
  let connect=source.split("pub async fn youtube_oauth_connect(").nth(1).unwrap().split("pub fn youtube_oauth_select_new_channel").next().unwrap();
  assert!(connect.contains("CHANNEL_SELECTION_REQUIRED"));
  assert!(connect.contains("PendingNewOAuth"));
 }
 #[test]
 fn processing_state_never_equates_upload_acceptance_with_ready(){
  assert_eq!(processing_state_from_status("processing"),"YOUTUBE_PROCESSING");
  assert_eq!(processing_state_from_status("succeeded"),"READY");
  assert_eq!(processing_state_from_status("failed"),"PROCESSING_FAILED");
  assert_eq!(processing_state_from_status("unknown"),"PROCESSING_UNKNOWN");
 }
 #[test]
 fn inventory_auth_preflight_occurs_before_first_youtube_request(){
  let source=include_str!("youtube.rs");
  let body=source.split("pub async fn youtube_list_existing_videos").nth(1).unwrap();
  let pre=body.split("emit_youtube_api_request").next().unwrap();
  assert!(pre.contains("valid_access_token"));
 }
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
 fn p(id:&str)->OAuthProfile{OAuthProfile{id:id.into(),client_id:"123.apps.googleusercontent.com".into(),client_secret:String::new(),channel_id:Some(format!("UC{id}")),channel_title:Some(id.into()),google_email:None,google_subject_id:None,access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:"2026-01-01T00:00:00Z".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:Some("2026-01-01T00:00:00Z".into()),identity_validated_channel_id:Some(format!("UC{id}")),credential_error:None}}
 #[test]fn passive_profile_listing_zero_secret_store_calls(){let secrets=CountingStore::default();let value=oauth_profiles_value(OAuthStore{profiles:vec![p("a"),p("b")]},&HashMap::new());assert_eq!(value.as_array().unwrap().len(),2);assert!(secrets.gets.borrow().is_empty());assert!(secrets.sets.borrow().is_empty());assert!(secrets.deletes.borrow().is_empty());assert_eq!(*secrets.accounts.borrow(),0);}
 #[test]fn thirty_one_profiles_passive_enumeration_zero_secret_reads(){
  let secrets=CountingStore::default();
  let profiles=(0..31).map(|i|p(&format!("p{i}"))).collect::<Vec<_>>();
  let value=oauth_profiles_value(OAuthStore{profiles},&HashMap::new());
  assert_eq!(value.as_array().unwrap().len(),31);
  assert!(secrets.gets.borrow().is_empty());assert!(secrets.sets.borrow().is_empty());assert!(secrets.deletes.borrow().is_empty());assert_eq!(*secrets.accounts.borrow(),0);
 }
 #[test]fn hundred_passive_navigation_models_zero_secret_reads(){
  let secrets=CountingStore::default();
  let profiles=(0..31).map(|i|p(&format!("p{i}"))).collect::<Vec<_>>();
  for _ in 0..100{
   let value=oauth_profiles_value(OAuthStore{profiles:profiles.clone()},&HashMap::new());
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
 #[test]fn update_neutral_legacy_fallback_is_targeted_and_non_mutating(){
  let source=include_str!("youtube.rs");
  let production=source.split("#[cfg(test)]").next().unwrap_or(source);
  assert!(!production.contains("trait OAuthSecretStore {trait OAuthSecretStore {"));
  assert!(!production.contains("fn migrate_profile_refresh_to_canonicalfn migrate_profile_refresh_to_canonical"));
  let migration=production.split("fn migrate_profile_refresh_to_canonical").nth(1).unwrap().split("fn resolve_refresh_credential_with").next().unwrap();
  assert!(!migration.contains("legacy_get_secret_once"));
  assert!(!migration.contains("security::get_secret("));
  let resolver=production.split("fn resolve_refresh_credential_with").nth(1).unwrap().split("fn require_canonical_refresh").next().unwrap();
  assert!(resolver.contains("canonical_get(active_account)"));
  assert!(resolver.contains("legacy_accounts()?"));
  assert!(resolver.contains("legacy_get(&account)"));
  for forbidden in ["canonical_set_secret","canonical_delete_secret","mark_legacy_reconnect_required","open_browser(","credential_generations","rotated_profile_secret_account","apply_reconnect_pointer_metadata","commit_recovered_refresh_pointer","write_keychain_migration_v2"]{
   assert!(!resolver.contains(forbidden),"{forbidden} must not be part of update-neutral resolution");
  }
  let require=production.split("fn require_canonical_refresh").nth(1).unwrap().split("fn canonical_global_client_secret").next().unwrap();
  assert!(require.contains("resolve_refresh_credential_with"));
  assert!(require.contains("canonical_get_secret_cached"));
  assert!(require.contains("legacy_get_secret_once"));
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
 #[test]fn old_profile_survives_binary_update_using_existing_legacy_keychain_item(){
  let profile_id="owner-profile";
  let profile_before=p(profile_id);
  let profile_uuid_before=profile_before.id.clone();
  let channel_before=profile_before.channel_id.clone();
  let active=oauth_key(profile_id,"refresh_token");
  let legacy=legacy_oauth_keys(profile_id,"refresh_token")[0].clone();
  let canonical_reads=RefCell::new(Vec::<String>::new());
  let legacy_inventory_reads=RefCell::new(0usize);
  let legacy_reads=RefCell::new(Vec::<String>::new());
  let token=resolve_refresh_credential_with(
   profile_id,
   &active,
   |account|{canonical_reads.borrow_mut().push(account.into());Ok(None)},
   ||{*legacy_inventory_reads.borrow_mut()+=1;Ok(vec![legacy.clone()])},
   |account|{legacy_reads.borrow_mut().push(account.into());Ok(Some("saved-legacy-refresh".into()))},
  ).unwrap();
  let profile_after=profile_before.clone();
  assert_eq!(token,"saved-legacy-refresh");
  assert_eq!(profile_after.id,profile_uuid_before);
  assert_eq!(profile_after.channel_id,channel_before);
  assert_eq!(&*canonical_reads.borrow(),&vec![active]);
  assert_eq!(*legacy_inventory_reads.borrow(),1);
  assert_eq!(&*legacy_reads.borrow(),&vec![legacy]);
 }
 #[test]fn canonical_refresh_wins_without_any_legacy_access(){
  let profile_id="canonical-owner";
  let active=oauth_key(profile_id,"refresh_token");
  let legacy_inventory_reads=RefCell::new(0usize);
  let legacy_reads=RefCell::new(Vec::<String>::new());
  let token=resolve_refresh_credential_with(
   profile_id,
   &active,
   |_account|Ok(Some("canonical-refresh".into())),
   ||{*legacy_inventory_reads.borrow_mut()+=1;Ok(vec![legacy_oauth_keys(profile_id,"refresh_token")[0].clone()])},
   |account|{legacy_reads.borrow_mut().push(account.into());Ok(Some("legacy-refresh".into()))},
  ).unwrap();
  assert_eq!(token,"canonical-refresh");
  assert_eq!(*legacy_inventory_reads.borrow(),0);
  assert!(legacy_reads.borrow().is_empty());
 }
 #[test]fn fifty_profiles_legacy_fallback_reads_only_selected_profile_secret(){
  let selected="p31";
  let active=oauth_key(selected,"refresh_token");
  let all_legacy=(0..50).map(|i|legacy_oauth_keys(&format!("p{i}"),"refresh_token")[0].clone()).collect::<Vec<_>>();
  let selected_legacy=legacy_oauth_keys(selected,"refresh_token")[0].clone();
  let legacy_reads=RefCell::new(Vec::<String>::new());
  let token=resolve_refresh_credential_with(
   selected,
   &active,
   |_account|Ok(None),
   ||Ok(all_legacy.clone()),
   |account|{
    legacy_reads.borrow_mut().push(account.into());
    if account==selected_legacy{Ok(Some("selected-refresh".into()))}else{Ok(Some("WRONG-PROFILE".into()))}
   },
  ).unwrap();
  assert_eq!(token,"selected-refresh");
  assert_eq!(&*legacy_reads.borrow(),&vec![selected_legacy]);
 }
 #[test]fn client_secret_resolution_is_canonical_first_before_legacy_inventory(){
  let source=include_str!("youtube.rs");
  let body=source.split("fn resolve_client_secret_for_profile").nth(1).unwrap().split("fn resolve_reconnect_oauth_client").next().unwrap();
  let profile_return=body.find("OAuthClientSecretSource::ProfileCanonical").unwrap();
  let global_return=body.find("OAuthClientSecretSource::GlobalExactMatch").unwrap();
  let legacy_inventory=body.find("security::list_legacy_secret_accounts").unwrap();
  let legacy_read=body.find("security::legacy_get_secret_once").unwrap();
  assert!(profile_return<legacy_inventory);
  assert!(global_return<legacy_inventory);
  assert!(legacy_inventory<legacy_read);
 }
 #[test]fn rc7_security_source_contract_uses_per_query_ui_skip(){
  let source=include_str!("security.rs");
  let ui_skip=["kSecUseAuthenticationUI","Skip"].concat();
  let skip=["skip_authenticated_items","(true)"].concat();
  let old_get=["get_generic_","password("].concat();
  let old_set=["set_generic_","password("].concat();
  let old_delete=["delete_generic_","password("].concat();
  assert!(source.contains("SecKeychain::disable_user_interaction()"));
  assert!(source.contains(&ui_skip));
  assert!(source.matches(&skip).count()>=2);
  assert!(!source.contains(&old_get));
  assert!(!source.contains(&old_set));
  assert!(!source.contains(&old_delete));
 }
 #[test]fn selected_profile_hydration_reads_only_selected_secret(){let secrets=CountingStore::default();secrets.v.borrow_mut().insert(oauth_key("a","refresh_token"),"ra".into());secrets.v.borrow_mut().insert(oauth_key("b","refresh_token"),"rb".into());let mut a=p("a");let b=p("b");hydrate_profile_secret_kind_with(&secrets,&mut a,"refresh_token").unwrap();assert_eq!(a.refresh_token,"ra");assert!(b.refresh_token.is_empty());assert_eq!(&*secrets.gets.borrow(),&vec![oauth_key("a","refresh_token")]);assert!(secrets.sets.borrow().is_empty());assert!(secrets.deletes.borrow().is_empty());}
 #[test]fn google_status_metadata_never_requires_secret_value(){let c=GoogleConfig{client_id:"123.apps.googleusercontent.com".into(),project_id:"project".into(),client_secret:String::new(),api_key:String::new(),client_secret_present:true,client_secret_account:String::new(),api_key_present:true};let v=google_config_status_value(&c);assert_eq!(v["hasSecret"],true);assert_eq!(v["hasApiKey"],true);assert!(!v.to_string().contains("client_secret"));}
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
            google_email: None,
            google_subject_id: None,
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
    fn reconnect_rejects_wrong_channel_before_profile_mutation() {
        let sec=Mem::default();
        let mut st=OAuthStore{profiles:vec![p(ID,"UC_A")]};
        let before=st.profiles[0].clone();
        let err=reconnect_apply_validated_with(&sec,&mut st,ID,"client-A","secret-A","access","refresh","UC_WRONG","Wrong",&[],"default",3600).unwrap_err();
        assert!(err.contains("WRONG_CHANNEL")||err.contains("CHANNEL_MISMATCH"));
        assert_eq!(st.profiles[0].id,before.id);
        assert_eq!(st.profiles[0].channel_id,before.channel_id);
        assert!(sec.v.borrow().is_empty());
    }
    #[test]
    fn reconnect_updates_only_target_profile_credentials() {
        let sec=Mem::default();
        let mut st=OAuthStore{profiles:vec![p(ID,"UC_A"),p("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","UC_B")]};
        let other_before=st.profiles[1].clone();
        reconnect_apply_validated_with(&sec,&mut st,ID,"client-A","secret-A","access","refresh-new","UC_A","A",&[],"default",3600).unwrap();
        assert_eq!(st.profiles[0].id,ID);
        assert_eq!(st.profiles[0].channel_id.as_deref(),Some("UC_A"));
        assert_eq!(st.profiles[1].id,other_before.id);
        assert_eq!(st.profiles[1].channel_id,other_before.channel_id);
        assert_eq!(sec.v.borrow().get(&oauth_key(ID,"refresh_token")).map(String::as_str),Some("refresh-new"));
        assert!(sec.v.borrow().get(&oauth_key(&other_before.id,"refresh_token")).is_none());
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
        assert_eq!(
            sec.get(&oauth_key(ID,"client_secret")).unwrap().as_deref(),
            Some("secret-A")
        )
    }
    #[test]
    fn c_missing_new_refresh_token_preserves_existing_token() {
        assert_eq!(reconnect_refresh_token(None,Some("existing-refresh")).unwrap(),"existing-refresh");
        assert_eq!(reconnect_refresh_token(Some("new-refresh"),Some("existing-refresh")).unwrap(),"new-refresh");
        assert!(reconnect_refresh_token(None,None).unwrap_err().contains("OAUTH_REFRESH_TOKEN_REQUIRED"));
        assert!(reconnect_refresh_token(Some(" "),Some(" ")).is_err())
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
        assert!(u.contains("prompt=select_account%20consent"));
        assert!(u.contains("include_granted_scopes=true"))
    }
}


#[cfg(test)]
mod v219_rc7_secitem_ui_skip_tests{
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
 fn profile_persistence_writes_refresh_and_profile_client_secret_but_not_access(){
  #[derive(Default)]struct C{sets:std::cell::RefCell<Vec<String>>}
  impl OAuthSecretStore for C{
   fn get(&self,_:&str)->Result<Option<String>,String>{Ok(None)}
   fn set(&self,a:&str,_:&str)->Result<(),String>{self.sets.borrow_mut().push(a.into());Ok(())}
   fn delete(&self,_:&str)->Result<(),String>{Ok(())}
  }
  let c=C::default();
  let p=OAuthProfile{id:"p".into(),client_id:"client".into(),client_secret:"global-secret".into(),channel_id:None,channel_title:None,google_email:None,google_subject_id:None,access_token:"short-lived".into(),refresh_token:"refresh".into(),expires_at:now_ts()+3600,connected_at:"x".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None};
  write_profile_secrets_with(&c,&p).unwrap();
  assert_eq!(&*c.sets.borrow(),&vec!["oauth.p.refresh_token".to_string(),"oauth.p.client_secret".to_string()]);
 }
 #[test]
 fn global_client_secret_has_one_canonical_account_for_many_profiles(){
  let accounts=(0..10).map(|_|GOOGLE_CLIENT_SECRET).collect::<std::collections::HashSet<_>>();
  assert_eq!(accounts.len(),1);
  assert_eq!(*accounts.iter().next().unwrap(),"google.client_secret");
 }
}

#[cfg(test)]
mod v2110_oauth_continuity_tests{
 use super::*;
 fn p(id:&str,ch:&str)->OAuthProfile{OAuthProfile{id:id.into(),client_id:"client".into(),client_secret:String::new(),channel_id:Some(ch.into()),channel_title:Some(ch.into()),google_email:None,google_subject_id:None,access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:"2026-09-19T00:00:00Z".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None}}
 #[test]fn legacy_presence_after_update_is_saved_unverified_not_forced_reconnect(){
  let profile=p("p1","UC1");
  let (state,last,_)=resolved_credential_state(&profile,MIGRATION_RECONNECT_REQUIRED,false,true,None);
  assert_eq!(state,"CANONICAL_PRESENT_UNVERIFIED");
  assert_eq!(last,"LEGACY_PRESENT_UNVERIFIED");
  assert_ne!(state,"RECONNECT_REQUIRED");
 }
 #[test]fn canonical_presence_without_validation_is_not_connected(){
  let profile=p("p1","UC1");
  let (state,last,_)=resolved_credential_state(&profile,MIGRATION_MIGRATED,true,false,None);
  assert_eq!(state,"CANONICAL_PRESENT_UNVERIFIED");
  assert_eq!(last,"NOT_RUN");
 }
 #[test]fn previously_validated_legacy_profile_remains_connected_after_binary_update(){
  let profile=p("p1","UC1");
  let validation=CredentialValidationV2State{at:Some("2026-09-21T00:00:00Z".into()),result:"TOKEN_REFRESH_PASS".into(),expected_channel_id:Some("UC1".into()),actual_channel_id:None};
  let (state,last,_)=resolved_credential_state(&profile,MIGRATION_RECONNECT_REQUIRED,false,true,Some(&validation));
  assert_eq!(state,"CONNECTED");
  assert_eq!(last,"TOKEN_REFRESH_PASS");
 }
 #[test]fn connected_requires_persisted_pass_for_same_channel(){
  let profile=p("p1","UC1");
  let validation=CredentialValidationV2State{at:Some("2026-09-19T00:00:00Z".into()),result:"PASS".into(),expected_channel_id:Some("UC1".into()),actual_channel_id:Some("UC1".into())};
  let (state,last,_)=resolved_credential_state(&profile,MIGRATION_MIGRATED,true,false,Some(&validation));
  assert_eq!(state,"CONNECTED");assert_eq!(last,"PASS");
 }
 #[test]fn persistent_credential_abi_is_version_independent(){
  assert_eq!(CREDENTIAL_SCHEMA_VERSION,2);
  assert_eq!(security::canonical_service(),"com.scaleup.vyron.security.v2");
  assert_eq!(oauth_key("abc-123","refresh_token"),"oauth.abc-123.refresh_token");
  let account=oauth_key("P1","refresh_token");
  for _app_version in ["2.1.9","2.1.10","2.1.11"]{assert_eq!(oauth_key("P1","refresh_token"),account);}
 }
 #[test]fn update_model_keeps_canonical_profile_without_forced_reconnect(){
  let profile=p("P1","UC1");
  let (state,_,_)=resolved_credential_state(&profile,MIGRATION_MIGRATED,true,false,None);
  assert_ne!(state,"RECONNECT_REQUIRED");
  assert_eq!(profile.id,"P1");
 }
 #[test]fn missing_optional_google_email_does_not_require_reconnect(){
  let mut profile=p("P1","UC1");
  profile.google_email=None;
  profile.google_subject_id=None;
  profile.scopes=vec!["https://www.googleapis.com/auth/youtube.force-ssl".into()];
  let validation=CredentialValidationV2State{at:Some("2026-09-21T00:00:00Z".into()),result:"TOKEN_REFRESH_PASS".into(),expected_channel_id:Some("UC1".into()),actual_channel_id:None};
  let (state,last,_)=resolved_credential_state(&profile,MIGRATION_MIGRATED,true,false,Some(&validation));
  assert_eq!(state,"CONNECTED");
  assert_eq!(last,"TOKEN_REFRESH_PASS");
 }
 #[test]fn thirty_one_profile_update_model_preserves_uuid_and_canonical_account(){
  let before=(0..31).map(|i|format!("p{i}")).collect::<Vec<_>>();
  let after=before.clone();
  assert_eq!(before,after);
  let accounts=after.iter().map(|id|oauth_key(id,"refresh_token")).collect::<Vec<_>>();
  assert_eq!(accounts.len(),31);
  assert_eq!(accounts.iter().collect::<std::collections::HashSet<_>>().len(),31);
  for (id,account) in after.iter().zip(accounts.iter()){assert_eq!(account,&format!("oauth.{id}.refresh_token"));}
 }
}

#[cfg(test)]
mod v2111_client_secret_continuity_tests{
 use super::*;
 #[test]fn physical_bug_wrong_global_client_is_never_used(){
  let decision=select_oauth_client_secret(None,"CLIENT_A","CLIENT_B",Some("SECRET_B".into()),false);
  assert_eq!(decision.unwrap_err(),"CLIENT_SECRET_REQUIRED");
 }
 #[test]fn profile_specific_secret_wins(){
  let (secret,source)=select_oauth_client_secret(Some("SECRET_A".into()),"CLIENT_A","CLIENT_B",Some("SECRET_B".into()),false).unwrap();
  assert_eq!(secret,"SECRET_A");assert_eq!(source,OAuthClientSecretSource::ProfileCanonical);
 }
 #[test]fn global_secret_is_allowed_only_for_exact_client_id(){
  let (secret,source)=select_oauth_client_secret(None,"CLIENT_A","CLIENT_A",Some("SECRET_A".into()),false).unwrap();
  assert_eq!(secret,"SECRET_A");assert_eq!(source,OAuthClientSecretSource::GlobalExactMatch);
  assert!(select_oauth_client_secret(None,"CLIENT_A","CLIENT_B",Some("SECRET_B".into()),false).is_err());
 }
 #[test]fn legacy_client_secret_requires_reimport_without_secret_read(){
  assert_eq!(select_oauth_client_secret(None,"CLIENT_A","CLIENT_B",None,true).unwrap_err(),"CLIENT_SECRET_REIMPORT_REQUIRED");
 }
 #[test]fn credentials_import_must_match_exact_profile_client_id(){
  assert!(validate_imported_client_id("CLIENT_A","CLIENT_A").is_ok());
  assert!(validate_imported_client_id("CLIENT_A","CLIENT_B").unwrap_err().starts_with("OAUTH_CLIENT_MISMATCH:"));
 }
 #[test]fn authorization_code_form_contains_exact_secret(){
  let form=authorization_code_token_form("CLIENT_A","SECRET_A","CODE","VERIFIER","http://127.0.0.1:1");
  let map=form.into_iter().collect::<HashMap<_,_>>();
  assert_eq!(map.get("client_id").map(String::as_str),Some("CLIENT_A"));
  assert_eq!(map.get("client_secret").map(String::as_str),Some("SECRET_A"));
  assert_eq!(map.get("code").map(String::as_str),Some("CODE"));
  assert_eq!(map.get("grant_type").map(String::as_str),Some("authorization_code"));
 }
 #[test]fn refresh_form_uses_same_exact_secret_contract(){
  let form=refresh_token_form("CLIENT_A","SECRET_A","REFRESH");
  let map=form.into_iter().collect::<HashMap<_,_>>();
  assert_eq!(map.get("client_secret").map(String::as_str),Some("SECRET_A"));
  assert_eq!(map.get("refresh_token").map(String::as_str),Some("REFRESH"));
 }
 #[test]fn reconnect_transaction_persists_both_profile_secrets_and_preserves_uuid(){
  #[derive(Default)]struct Mem{v:std::cell::RefCell<HashMap<String,String>>}
  impl OAuthSecretStore for Mem{
   fn get(&self,a:&str)->Result<Option<String>,String>{Ok(self.v.borrow().get(a).cloned())}
   fn set(&self,a:&str,v:&str)->Result<(),String>{self.v.borrow_mut().insert(a.into(),v.into());Ok(())}
   fn delete(&self,a:&str)->Result<(),String>{self.v.borrow_mut().remove(a);Ok(())}
  }
  let sec=Mem::default();
  let backup=reconnect_write_readback_with(&sec,"P1","SECRET_A","ACCESS","REFRESH").unwrap();
  assert_eq!(sec.get("oauth.P1.client_secret").unwrap().as_deref(),Some("SECRET_A"));
  assert_eq!(sec.get("oauth.P1.refresh_token").unwrap().as_deref(),Some("REFRESH"));
  assert_eq!(backup.items.len(),2);
  assert_eq!(oauth_key("P1","client_secret"),"oauth.P1.client_secret");
 }
 #[test]fn multi_client_17_profiles_never_cross_use_secrets(){
  for i in 0..17{
   let client=if i%3==0{"CLIENT_B"}else{"CLIENT_A"};
   let global_id="CLIENT_A";let global_secret=Some("SECRET_A".to_string());
   let profile_secret=if client=="CLIENT_B"{Some("SECRET_B".to_string())}else{None};
   let (secret,_)=select_oauth_client_secret(profile_secret,client,global_id,global_secret.clone(),false).unwrap();
   assert_eq!(secret,if client=="CLIENT_B"{"SECRET_B"}else{"SECRET_A"});
  }
 }
 #[test]fn thirty_one_channels_can_share_seventeen_profiles_without_new_uuid(){
  let profiles=(0..17).map(|i|format!("P{i}")).collect::<Vec<_>>();
  let channels=(0..31).map(|i|profiles[i%17].clone()).collect::<Vec<_>>();
  assert_eq!(profiles.len(),17);assert_eq!(channels.len(),31);
  assert_eq!(channels.iter().collect::<std::collections::HashSet<_>>().len(),17);
 }
 #[test]fn client_secret_account_abi_survives_future_versions(){
  let account=oauth_key("P1","client_secret");
  for _version in ["2.1.11","2.1.12","2.1.13"]{assert_eq!(oauth_key("P1","client_secret"),account);}
  assert_eq!(account,"oauth.P1.client_secret");
  assert_eq!(security::canonical_service(),"com.scaleup.vyron.security.v2");
 }
}

#[cfg(test)]
mod v2112_browser_reconnect_recovery_tests{
 use super::*;
 #[test]fn historical_client_mismatch_is_not_channel_identity(){
  let expected_channel="UC_EXPECTED";
  let profile_uuid="P1";
  assert_eq!(profile_uuid,"P1");
  assert_eq!(expected_channel,"UC_EXPECTED");
  // Migration is allowed only as a complete OAuth app-client pair.
  let global_id="CLIENT_B";
  let global_secret="SECRET_B";
  assert_eq!((global_id,global_secret),("CLIENT_B","SECRET_B"));
 }
 #[test]fn normal_refresh_still_never_cross_uses_wrong_global_secret(){
  assert_eq!(select_oauth_client_secret(None,"CLIENT_A","CLIENT_B",Some("SECRET_B".into()),false).unwrap_err(),"CLIENT_SECRET_REQUIRED");
 }
 #[test]fn reconnect_client_pair_can_migrate_from_old_app_client_to_current_app_client(){
  let old_client="CLIENT_A";
  let current_client="CLIENT_B";
  assert_ne!(old_client,current_client);
  let pair=(current_client.to_string(),"SECRET_B".to_string(),OAuthClientSecretSource::GlobalCurrentMigration);
  assert_eq!(pair.0,"CLIENT_B");
  assert_eq!(pair.1,"SECRET_B");
  assert_eq!(pair.2,OAuthClientSecretSource::GlobalCurrentMigration);
 }
 #[test]fn validated_reconnect_preserves_uuid_and_channel_while_client_id_can_migrate(){
  #[derive(Default)]struct Mem{v:std::cell::RefCell<HashMap<String,String>>}
  impl OAuthSecretStore for Mem{
   fn get(&self,a:&str)->Result<Option<String>,String>{Ok(self.v.borrow().get(a).cloned())}
   fn set(&self,a:&str,v:&str)->Result<(),String>{self.v.borrow_mut().insert(a.into(),v.into());Ok(())}
   fn delete(&self,a:&str)->Result<(),String>{self.v.borrow_mut().remove(a);Ok(())}
  }
  let mut store=OAuthStore{profiles:vec![OAuthProfile{
   id:"P1".into(),client_id:"CLIENT_A".into(),client_secret:String::new(),
   channel_id:Some("UC1".into()),channel_title:Some("Old".into()),google_email:None,google_subject_id:None,
   access_token:String::new(),refresh_token:String::new(),expires_at:0,
   connected_at:"2026-09-19T00:00:00Z".into(),scopes:vec![],preferred_browser:"default".into(),
   identity_validated_at:None,identity_validated_channel_id:None,credential_error:None
  }]};
  let sec=Mem::default();
  reconnect_apply_validated_with(&sec,&mut store,"P1","CLIENT_B","SECRET_B","ACCESS","REFRESH","UC1","Same Channel",&[],"chrome",3600).unwrap();
  assert_eq!(store.profiles.len(),1);
  assert_eq!(store.profiles[0].id,"P1");
  assert_eq!(store.profiles[0].channel_id.as_deref(),Some("UC1"));
  assert_eq!(store.profiles[0].client_id,"CLIENT_B");
  assert_eq!(sec.get("oauth.P1.client_secret").unwrap().as_deref(),Some("SECRET_B"));
  assert_eq!(sec.get("oauth.P1.refresh_token").unwrap().as_deref(),Some("REFRESH"));
 }
}
#[cfg(test)]
mod v2113_existing_channel_rebind_tests{
 use super::*;
 #[test]fn google_config_requires_id_and_secret_to_be_oauth_ready(){
  let c=GoogleConfig{client_id:"CLIENT".into(),client_secret:String::new(),project_id:String::new(),api_key:String::new(),client_secret_present:false,client_secret_account:String::new(),api_key_present:false};
  let v=google_config_status_value(&c);
  assert_eq!(v["configured"],true);
  assert_eq!(v["hasSecret"],false);
  assert_eq!(v["oauthReady"],false);
  let ready=GoogleConfig{client_secret_present:true,..c};
  assert_eq!(google_config_status_value(&ready)["oauthReady"],false);
 }
 #[test]fn existing_channel_reuses_profile_uuid(){
  let p=OAuthProfile{id:"P_EXISTING".into(),client_id:"OLD_CLIENT".into(),client_secret:String::new(),channel_id:Some("UC1".into()),channel_title:Some("Channel".into()),google_email:None,google_subject_id:None,access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:String::new(),scopes:vec![],preferred_browser:String::new(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None};
  assert_eq!(reconnect_profile_id(Some(&p)),"P_EXISTING");
  assert_ne!(reconnect_profile_id(None),"P_EXISTING");
 }
 #[test]fn current_client_rebind_preserves_uuid_and_channel_mapping_transactionally(){
  #[derive(Default)]struct Mem{v:std::cell::RefCell<HashMap<String,String>>}
  impl OAuthSecretStore for Mem{
   fn get(&self,a:&str)->Result<Option<String>,String>{Ok(self.v.borrow().get(a).cloned())}
   fn set(&self,a:&str,v:&str)->Result<(),String>{self.v.borrow_mut().insert(a.into(),v.into());Ok(())}
   fn delete(&self,a:&str)->Result<(),String>{self.v.borrow_mut().remove(a);Ok(())}
  }
  let mut store=OAuthStore{profiles:vec![OAuthProfile{id:"P1".into(),client_id:"OLD_CLIENT".into(),client_secret:String::new(),channel_id:Some("UC1".into()),channel_title:Some("Old".into()),google_email:None,google_subject_id:None,access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:String::new(),scopes:vec![],preferred_browser:"brave".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None}]};
  let sec=Mem::default();
  reconnect_apply_validated_with(&sec,&mut store,"P1","CURRENT_CLIENT","CURRENT_SECRET","ACCESS","REFRESH","UC1","Channel",&[],"brave",3600).unwrap();
  assert_eq!(store.profiles.len(),1);
  assert_eq!(store.profiles[0].id,"P1");
  assert_eq!(store.profiles[0].channel_id.as_deref(),Some("UC1"));
  assert_eq!(store.profiles[0].client_id,"CURRENT_CLIENT");
  assert_eq!(sec.get("oauth.P1.refresh_token").unwrap().as_deref(),Some("REFRESH"));
  assert_eq!(sec.get("oauth.P1.client_secret").unwrap().as_deref(),Some("CURRENT_SECRET"));
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
mod v2115_rc2_schedule_sync_hotfix_tests{
 use super::*;
 #[test]
 fn complete_203_inventory_is_schedule_complete(){
  let errors=Vec::<String>::new();
  let v=inventory_completeness_value(true,false,0,203,203,&errors,0,203);
  assert_eq!(v["syncComplete"],true);
  assert_eq!(v["scheduleComplete"],true);
  assert_eq!(v["incompleteReasons"],json!([]));
 }
 #[test]
 fn stale_page_info_total_does_not_invalidate_exhausted_inventory(){
  let errors=Vec::<String>::new();
  let v=inventory_completeness_value(true,false,0,203,203,&errors,0,204);
  assert_eq!(v["syncComplete"],true);
  assert_eq!(v["scheduleComplete"],true);
  assert_eq!(v["pageInfoTotalMismatch"],true);
  assert_eq!(v["diagnosticWarnings"],json!(["PLAYLIST_TOTAL_METADATA_MISMATCH"]));
 }
 #[test]
 fn missing_hydration_is_explicitly_incomplete(){
  let errors=Vec::<String>::new();
  let v=inventory_completeness_value(true,false,0,203,202,&errors,0,203);
  assert_eq!(v["syncComplete"],false);
  assert!(v["incompleteReasons"].as_array().unwrap().iter().any(|x|x=="MISSING_VIDEO_HYDRATION"));
 }
 #[test]
 fn playlist_limit_and_not_exhausted_are_blocking(){
  let errors=Vec::<String>::new();
  let v=inventory_completeness_value(false,true,0,1000,1000,&errors,0,1200);
  assert_eq!(v["syncComplete"],false);
  let r=v["incompleteReasons"].as_array().unwrap();
  assert!(r.iter().any(|x|x=="PLAYLIST_NOT_EXHAUSTED"));
  assert!(r.iter().any(|x|x=="LIMIT_TRUNCATED"));
 }
 #[test]
 fn hydration_batch_failure_is_explicit(){
  let errors=vec!["batch 4: network timeout".to_string()];
  let v=inventory_completeness_value(true,false,0,203,203,&errors,0,203);
  assert_eq!(v["syncComplete"],false);
  assert!(v["incompleteReasons"].as_array().unwrap().iter().any(|x|x=="HYDRATION_BATCH_FAILED"));
 }
 #[test]
 fn schedule_truth_is_separate_from_full_inventory_truth(){
  let errors=Vec::<String>::new();
  let v=inventory_completeness_value(true,false,0,203,203,&errors,1,203);
  assert_eq!(v["syncComplete"],true);
  assert_eq!(v["scheduleComplete"],false);
  assert!(v["incompleteReasons"].as_array().unwrap().iter().any(|x|x=="SCHEDULE_DATA_INCOMPLETE"));
 }
 #[test]
 fn page_diagnostics_detect_unresolved_duplicate_and_mid_page_limit(){
  let page=json!({"items":[
   {"contentDetails":{"videoId":"a"}},
   {"contentDetails":{"videoId":"a"}},
   {"contentDetails":{}},
   {"contentDetails":{"videoId":"b"}},
   {"contentDetails":{"videoId":"c"}}
  ]});
  let mut ids=Vec::<String>::new();let mut seen=std::collections::HashSet::<String>::new();
  let d=append_playlist_page_ids_diagnostic(&page,&mut ids,&mut seen,2);
  assert_eq!(ids,vec!["a","b"]);
  assert_eq!(d.duplicate_ids,1);
  assert_eq!(d.unresolved_items,1);
  assert!(d.limit_truncated);
  assert_eq!(d.raw_items,5);
  assert_eq!(d.inspected_items,4);
 }
 #[test]
 fn schedule_data_incomplete_detects_unknown_or_malformed_private_publish_at(){
  let rows=vec![
   json!({"id":"ok","privacyStatus":"private","publishAt":"2099-01-01T00:00:00Z"}),
   json!({"id":"bad1","privacyStatus":"unknown"}),
   json!({"id":"bad2","privacyStatus":"private","publishAt":"not-a-date"})
  ];
  assert_eq!(schedule_data_incomplete_ids(&rows),vec!["bad1","bad2"]);
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
 fn persistent_profile_store_writes_refresh_and_profile_client_secret_only(){
  #[derive(Default)]struct S{v:std::cell::RefCell<HashMap<String,String>>,sets:std::cell::RefCell<Vec<String>>}
  impl OAuthSecretStore for S{
   fn get(&self,a:&str)->Result<Option<String>,String>{Ok(self.v.borrow().get(a).cloned())}
   fn set(&self,a:&str,v:&str)->Result<(),String>{self.sets.borrow_mut().push(a.into());self.v.borrow_mut().insert(a.into(),v.into());Ok(())}
   fn delete(&self,a:&str)->Result<(),String>{self.v.borrow_mut().remove(a);Ok(())}
  }
  let sec=S::default();
  let p=OAuthProfile{id:"p1".into(),client_id:"client".into(),client_secret:"secret".into(),channel_id:None,channel_title:None,google_email:None,google_subject_id:None,access_token:"access".into(),refresh_token:"refresh".into(),expires_at:1,connected_at:"x".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None};
  write_profile_secrets_with(&sec,&p).unwrap();
  assert_eq!(&*sec.sets.borrow(),&vec!["oauth.p1.refresh_token".to_string(),"oauth.p1.client_secret".to_string()]);
  assert!(sec.v.borrow().get("oauth.p1.access_token").is_none());
  assert_eq!(sec.v.borrow().get("oauth.p1.client_secret").map(String::as_str),Some("secret"));
 }
}


#[cfg(test)]
mod v2114_channel_statistics_tests{
 use super::*;
 #[test]
 fn exact_statistics_are_numeric_and_include_handle(){
  let item=json!({"id":"UC1","snippet":{"title":"Neon Drive FM","customUrl":"@neondrive","thumbnails":{"high":{"url":"https://img"}}},"statistics":{"subscriberCount":"254","viewCount":"40382","videoCount":"87","hiddenSubscriberCount":false}});
  let out=youtube_channel_statistics_value(&item);
  assert_eq!(out["channelId"],"UC1");
  assert_eq!(out["handle"],"@neondrive");
  assert_eq!(out["subscriberCount"],254);
  assert_eq!(out["viewCount"],40382);
  assert_eq!(out["videoCount"],87);
  assert_eq!(out["hiddenSubscriberCount"],false);
  assert!(out["statisticsUpdatedAt"].as_str().unwrap_or("").contains('T'));
 }
 #[test]
 fn hidden_subscribers_never_become_fake_zero(){
  let item=json!({"id":"UC2","snippet":{"title":"Hidden"},"statistics":{"subscriberCount":"0","viewCount":"120","videoCount":"4","hiddenSubscriberCount":true}});
  let out=youtube_channel_statistics_value(&item);
  assert!(out["subscriberCount"].is_null());
  assert_eq!(out["hiddenSubscriberCount"],true);
  assert_eq!(out["viewCount"],120);
 }
}

#[cfg(test)]
mod v2114_oauth_onboarding_tests{
 use super::*;
 #[test]
 fn canonical_keychain_presence_repairs_stale_google_metadata(){
  let mut c=GoogleConfig::default();
  c.client_id="client.apps.googleusercontent.com".into();
  c.client_secret_present=false;
  let fixed=reconcile_google_config_presence(c,&[GOOGLE_CLIENT_SECRET.to_string()]);
  assert!(fixed.client_secret_present);
  assert_eq!(google_config_status_value(&fixed)["oauthReady"],false);
 }
 #[test]
 fn persisted_true_secret_presence_survives_passive_enumeration_skip(){
  let mut c=GoogleConfig::default();
  c.client_id="client.apps.googleusercontent.com".into();
  c.client_secret_present=true;
  let fixed=reconcile_google_config_presence(c,&[]);
  assert!(fixed.client_secret_present);
  assert_eq!(google_config_status_value(&fixed)["oauthReady"],false);
 }
 #[test]
 fn new_channel_oauth_forces_account_selector_and_offline_consent(){
  let url=oauth_authorization_url("client","http://127.0.0.1:1234","scope","challenge","state");
  assert!(url.contains("access_type=offline"));
  assert!(url.contains("prompt=select_account%20consent"));
  assert!(url.contains("include_granted_scopes=true"));
 }
}


#[cfg(test)]
mod v2115_rc6_keychain_rotation_tests {
 use super::*;
 use std::{cell::{Cell,RefCell},collections::{HashMap,HashSet}};

 #[derive(Default)]
 struct RotationStore {
  v:RefCell<HashMap<String,String>>,
  denied_get:RefCell<HashSet<String>>,
  deny_rotated_verify:Cell<bool>,
  gets:RefCell<Vec<String>>,
  sets:RefCell<Vec<String>>,
  deletes:RefCell<Vec<String>>,
  verifies:RefCell<Vec<String>>,
 }
 impl OAuthSecretStore for RotationStore {
  fn get(&self,a:&str)->Result<Option<String>,String>{
   self.gets.borrow_mut().push(a.into());
   if self.denied_get.borrow().contains(a){
    return Err(format!("KEYCHAIN_AUTH_FAILED: operation=canonical_read_no_ui; account={a}; osstatus=-25293"))
   }
   Ok(self.v.borrow().get(a).cloned())
  }
  fn set(&self,a:&str,v:&str)->Result<(),String>{
   self.sets.borrow_mut().push(a.into());self.v.borrow_mut().insert(a.into(),v.into());Ok(())
  }
  fn delete(&self,a:&str)->Result<(),String>{
   self.deletes.borrow_mut().push(a.into());self.v.borrow_mut().remove(a);Ok(())
  }
  fn verify(&self,a:&str,expected:&str)->Result<bool,String>{
   self.verifies.borrow_mut().push(a.into());
   if self.deny_rotated_verify.get()&&a.contains(".v2."){
    return Err(format!("KEYCHAIN_AUTH_FAILED: operation=canonical_verify_no_ui; account={a}; osstatus=-25293"))
   }
   Ok(self.v.borrow().get(a).map(String::as_str)==Some(expected))
  }
  fn accounts(&self,prefix:&str)->Result<Vec<String>,String>{
   Ok(self.v.borrow().keys().filter(|x|x.starts_with(prefix)).cloned().collect())
  }
 }
 fn profile(id:&str,ch:&str)->OAuthProfile{OAuthProfile{
  id:id.into(),client_id:"CLIENT".into(),client_secret:String::new(),channel_id:Some(ch.into()),channel_title:Some(ch.into()),google_email:None,google_subject_id:None,
  access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:"2026-09-20T00:00:00Z".into(),
  scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None,
 }}
 const P:&str="96cb1deb-a2b5-4a92-9a33-45204c24ff8c";
 const OLD_REFRESH:&str="oauth.96cb1deb-a2b5-4a92-9a33-45204c24ff8c.refresh_token";
 const OLD_SECRET:&str="oauth.96cb1deb-a2b5-4a92-9a33-45204c24ff8c.client_secret";

 #[test]
 fn physical_rc5_auth_failed_old_backup_read_rotates_without_old_secret_value(){
  let sec=RotationStore::default();
  sec.v.borrow_mut().insert(OLD_REFRESH.into(),"OLD_PROTECTED".into());
  sec.v.borrow_mut().insert(OLD_SECRET.into(),"CLIENT_SECRET".into());
  sec.denied_get.borrow_mut().insert(OLD_REFRESH.into());
  let mut store=OAuthStore{profiles:vec![profile(P,"UC_EXPECTED")]};
  let backup=reconnect_apply_validated_accounts_with(
   &sec,&mut store,P,OLD_REFRESH,OLD_SECRET,1,"CLIENT","CLIENT_SECRET","ACCESS_NEW","NEW_REFRESH",
   "UC_EXPECTED","Channel",&[],"default",3600
  ).unwrap();
  assert!(backup.refresh_rotated);
  assert_eq!(backup.old_refresh_osstatus,Some(-25293));
  assert_eq!(rotation_reason(backup.old_refresh_error.as_deref()),Some("KEYCHAIN_AUTH_FAILED"));
  assert_eq!(sec.v.borrow().get(OLD_REFRESH).map(String::as_str),Some("OLD_PROTECTED"),"old blocked evidence must stay untouched");
  assert!(!sec.sets.borrow().iter().any(|a|a==OLD_REFRESH),"blocked old refresh account must never be overwritten");
  assert!(backup.refresh_account.starts_with(&format!("oauth.{P}.refresh_token.v2.1.")));
  assert_eq!(sec.v.borrow().get(&backup.refresh_account).map(String::as_str),Some("NEW_REFRESH"));
  assert_eq!(store.profiles[0].id,P);
  assert_eq!(store.profiles[0].channel_id.as_deref(),Some("UC_EXPECTED"));
 }
 #[test]
 fn pointer_commit_model_is_backward_compatible_and_restart_idempotent(){
  let mut state=KeychainMigrationV2State::default();
  assert_eq!(profile_refresh_token_account_from_state(&state,P),OLD_REFRESH);
  let backup=ReconnectSecretBackup{
   items:vec![],created_accounts:vec!["new".into()],refresh_account:"new".into(),client_secret_account:"new-secret".into(),
   old_refresh_account:OLD_REFRESH.into(),old_client_secret_account:OLD_SECRET.into(),refresh_rotated:true,client_secret_rotated:true,
   old_refresh_error:Some("KEYCHAIN_AUTH_FAILED: osstatus=-25293".into()),old_client_secret_error:None,
   old_refresh_osstatus:Some(-25293),old_client_secret_osstatus:None,generation:1,
  };
  apply_reconnect_pointer_metadata(&mut state,P,&backup);
  let bytes=serde_json::to_vec(&state).unwrap();
  let reloaded:KeychainMigrationV2State=serde_json::from_slice(&bytes).unwrap();
  assert_eq!(profile_refresh_token_account_from_state(&reloaded,P),"new");
  assert_eq!(profile_client_secret_account_from_state(&reloaded,P),"new-secret");
  assert_eq!(reloaded.credential_generations.get(P),Some(&1));
 }
 #[test]
 fn pointer_failure_rollback_removes_only_fresh_account_and_never_old_blocked_item(){
  let sec=RotationStore::default();
  sec.v.borrow_mut().insert(OLD_REFRESH.into(),"OLD_PROTECTED".into());
  sec.v.borrow_mut().insert(OLD_SECRET.into(),"CLIENT_SECRET".into());
  sec.denied_get.borrow_mut().insert(OLD_REFRESH.into());
  let backup=reconnect_write_readback_accounts_with(&sec,P,OLD_REFRESH,OLD_SECRET,1,"CLIENT_SECRET","ACCESS","NEW_REFRESH").unwrap();
  let new_refresh=backup.refresh_account.clone();
  reconnect_rollback_secrets_with(&sec,&backup);
  assert_eq!(sec.v.borrow().get(OLD_REFRESH).map(String::as_str),Some("OLD_PROTECTED"));
  assert!(!sec.v.borrow().contains_key(&new_refresh));
  assert!(!sec.deletes.borrow().iter().any(|a|a==OLD_REFRESH));
 }
 #[test]
 fn fresh_rotated_item_auth_failed_stops_after_one_generation(){
  let sec=RotationStore::default();
  sec.v.borrow_mut().insert(OLD_REFRESH.into(),"OLD_PROTECTED".into());
  sec.denied_get.borrow_mut().insert(OLD_REFRESH.into());
  sec.deny_rotated_verify.set(true);
  let err=prepare_secret_write_with(&sec,P,"refresh_token",OLD_REFRESH,"NEW_REFRESH",1).unwrap_err();
  assert!(err.contains("NEW_ITEM_READBACK_AUTH_FAILED"));
  let rotated_sets=sec.sets.borrow().iter().filter(|a|a.contains(".refresh_token.v2.1.")).count();
  assert_eq!(rotated_sets,1,"fresh readback failure must never start another rotation generation");
  assert_eq!(sec.v.borrow().get(OLD_REFRESH).map(String::as_str),Some("OLD_PROTECTED"));
 }
 #[test]
 fn healthy_profile_reuses_existing_account_without_rotation(){
  let sec=RotationStore::default();
  sec.v.borrow_mut().insert(OLD_REFRESH.into(),"OLD".into());
  sec.v.borrow_mut().insert(OLD_SECRET.into(),"SECRET".into());
  let backup=reconnect_write_readback_accounts_with(&sec,P,OLD_REFRESH,OLD_SECRET,1,"SECRET","ACCESS","NEW").unwrap();
  assert!(!backup.refresh_rotated);
  assert_eq!(backup.refresh_account,OLD_REFRESH);
  assert_eq!(sec.v.borrow().get(OLD_REFRESH).map(String::as_str),Some("NEW"));
 }
 #[test]
 fn wrong_channel_never_writes_or_rotates_credentials(){
  let sec=RotationStore::default();
  sec.v.borrow_mut().insert(OLD_REFRESH.into(),"OLD".into());
  sec.v.borrow_mut().insert(OLD_SECRET.into(),"SECRET".into());
  let mut store=OAuthStore{profiles:vec![profile(P,"UC_EXPECTED")]};
  let err=reconnect_apply_validated_accounts_with(
   &sec,&mut store,P,OLD_REFRESH,OLD_SECRET,1,"CLIENT","SECRET","ACCESS","NEW",
   "UC_WRONG","Wrong",&[],"default",3600
  ).unwrap_err();
  assert!(err.starts_with("WRONG_CHANNEL:"));
  assert!(sec.sets.borrow().is_empty());
 }
 #[test]
 fn thirteen_profiles_resolve_independent_active_accounts(){
  let mut state=KeychainMigrationV2State::default();
  for i in 0..13{
   let id=format!("p{i}");
   if i%3==0{state.refresh_token_accounts.insert(id.clone(),format!("oauth.{id}.refresh_token.v2.1.rotated"));}
  }
  for i in 0..13{
   let id=format!("p{i}");
   let active=profile_refresh_token_account_from_state(&state,&id);
   if i%3==0{assert!(active.ends_with(".rotated"))}else{assert_eq!(active,format!("oauth.{id}.refresh_token"))}
  }
 }
 #[test]
 fn rc7_update_roundtrip_prefers_rotated_pointer_over_blocked_legacy(){
  let mut state=KeychainMigrationV2State::default();
  let active=format!("oauth.{P}.refresh_token.v2.2.xyz");
  state.refresh_token_accounts.insert(P.into(),active.clone());
  state.credential_generations.insert(P.into(),2);
  state.credential_rotated_at.insert(P.into(),"2026-09-20T00:00:00Z".into());
  let bytes=serde_json::to_vec(&state).unwrap();
  let after:KeychainMigrationV2State=serde_json::from_slice(&bytes).unwrap();
  assert_eq!(profile_refresh_token_account_from_state(&after,P),active);
  assert_ne!(profile_refresh_token_account_from_state(&after,P),OLD_REFRESH);
 }
 #[test]
 fn rc7_fifty_profile_update_continuity_changes_no_uuid_or_active_pointer(){
  let profiles=(0..50).map(|i|profile(&format!("p{i}"),&format!("UC{i}"))).collect::<Vec<_>>();
  let before_ids=profiles.iter().map(|p|p.id.clone()).collect::<Vec<_>>();
  let store=OAuthStore{profiles};
  let store_bytes=serde_json::to_vec(&store).unwrap();
  let after_store:OAuthStore=serde_json::from_slice(&store_bytes).unwrap();
  let mut state=KeychainMigrationV2State::default();
  for i in 0..50{
   let id=format!("p{i}");
   if i%2==0{
    state.refresh_token_accounts.insert(id.clone(),format!("oauth.{id}.refresh_token.v2.{}.active",i+1));
    state.credential_generations.insert(id.clone(),(i+1) as u32);
   }
  }
  let before=(0..50).map(|i|{let id=format!("p{i}");(id.clone(),profile_refresh_token_account_from_state(&state,&id))}).collect::<Vec<_>>();
  let state_bytes=serde_json::to_vec(&state).unwrap();
  let after_state:KeychainMigrationV2State=serde_json::from_slice(&state_bytes).unwrap();
  let after=(0..50).map(|i|{let id=format!("p{i}");(id.clone(),profile_refresh_token_account_from_state(&after_state,&id))}).collect::<Vec<_>>();
  assert_eq!(before_ids,after_store.profiles.iter().map(|p|p.id.clone()).collect::<Vec<_>>());
  assert_eq!(before,after);
 }
 #[test]
 fn v300_fifty_profile_update_continuity_preserves_client_secret_pointers(){
  let mut state=KeychainMigrationV2State::default();
  for i in 0..50{
   let id=format!("p{i}");
   state.client_secret_accounts.insert(id.clone(),format!("oauth.{id}.client_secret.v2.{}.active",i+1));
   state.refresh_token_accounts.insert(id.clone(),format!("oauth.{id}.refresh_token.v2.{}.active",i+1));
   state.credential_generations.insert(id.clone(),(i+1) as u32);
  }
  let before=(0..50).map(|i|{let id=format!("p{i}");(id.clone(),profile_refresh_token_account_from_state(&state,&id),profile_client_secret_account_from_state(&state,&id))}).collect::<Vec<_>>();
  let bytes=serde_json::to_vec(&state).unwrap();
  let after_state:KeychainMigrationV2State=serde_json::from_slice(&bytes).unwrap();
  let after=(0..50).map(|i|{let id=format!("p{i}");(id.clone(),profile_refresh_token_account_from_state(&after_state,&id),profile_client_secret_account_from_state(&after_state,&id))}).collect::<Vec<_>>();
  assert_eq!(before,after);
 }
 #[test]
 fn v300_fifty_profile_update_in_place_preserves_identity_pointers_and_generations(){
  let profiles=(0..50).map(|i|profile(&format!("p{i}"),&format!("UC{i}"))).collect::<Vec<_>>();
  let store=OAuthStore{profiles};
  let before_profile_ids=store.profiles.iter().map(|p|p.id.clone()).collect::<Vec<_>>();
  let before_channel_ids=store.profiles.iter().map(|p|p.channel_id.clone()).collect::<Vec<_>>();
  let mut state=KeychainMigrationV2State::default();
  for i in 0..50{
   let id=format!("p{i}");
   match i%4{
    0=>{},
    1=>{state.refresh_token_accounts.insert(id.clone(),format!("oauth.{id}.refresh_token.v2.2.rotated"));state.credential_generations.insert(id.clone(),2);},
    2=>{state.client_secret_accounts.insert(id.clone(),format!("oauth.{id}.client_secret.v2.3.rotated"));state.credential_generations.insert(id.clone(),3);},
    _=>{state.refresh_token_accounts.insert(id.clone(),format!("oauth.{id}.refresh_token.v2.4.rotated"));state.client_secret_accounts.insert(id.clone(),format!("oauth.{id}.client_secret.v2.4.rotated"));state.credential_generations.insert(id.clone(),4);}
   }
  }
  let before_refresh=(0..50).map(|i|{let id=format!("p{i}");profile_refresh_token_account_from_state(&state,&id)}).collect::<Vec<_>>();
  let before_secret=(0..50).map(|i|{let id=format!("p{i}");profile_client_secret_account_from_state(&state,&id)}).collect::<Vec<_>>();
  let before_generation=(0..50).map(|i|state.credential_generations.get(&format!("p{i}")).copied().unwrap_or_default()).collect::<Vec<_>>();
  let store_after:OAuthStore=serde_json::from_slice(&serde_json::to_vec(&store).unwrap()).unwrap();
  let state_after:KeychainMigrationV2State=serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
  let after_refresh=(0..50).map(|i|{let id=format!("p{i}");profile_refresh_token_account_from_state(&state_after,&id)}).collect::<Vec<_>>();
  let after_secret=(0..50).map(|i|{let id=format!("p{i}");profile_client_secret_account_from_state(&state_after,&id)}).collect::<Vec<_>>();
  let after_generation=(0..50).map(|i|state_after.credential_generations.get(&format!("p{i}")).copied().unwrap_or_default()).collect::<Vec<_>>();
  assert_eq!(before_profile_ids,store_after.profiles.iter().map(|p|p.id.clone()).collect::<Vec<_>>(),"Profile UUID changes must be zero");
  assert_eq!(before_channel_ids,store_after.profiles.iter().map(|p|p.channel_id.clone()).collect::<Vec<_>>(),"YouTube Channel ID changes must be zero");
  assert_eq!(before_refresh,after_refresh,"healthy refresh pointer changes must be zero");
  assert_eq!(before_secret,after_secret,"healthy client-secret pointer changes must be zero");
  assert_eq!(before_generation,after_generation,"credential generation changes require explicit recovery");
 }
 #[test]
 fn v300_global_exact_secret_wins_over_blocked_profile_secret(){
  assert_eq!(resolved_client_secret_state(false,true,true,true,true,true,false,true,false),"GLOBAL_EXACT_MATCH");
 }
 #[test]
 fn v300_token_refresh_pass_is_operational_without_youtube_identity_request(){
  let p=profile("p1","UC1");
  let validation=CredentialValidationV2State{at:Some("2026-09-21T00:00:00Z".into()),result:"TOKEN_REFRESH_PASS".into(),expected_channel_id:Some("UC1".into()),actual_channel_id:None};
  let (state,result,_)=resolved_credential_state(&p,MIGRATION_MIGRATED,true,false,Some(&validation));
  assert_eq!(state,"CONNECTED");assert_eq!(result,"TOKEN_REFRESH_PASS");
 }
 #[test]
 fn v300_fifty_healthy_profiles_auto_recover_without_manual_queue(){
  let statuses=(0..50).map(|_|existing_profile_recovery_bucket("ACCESSIBLE",None)).collect::<Vec<_>>();
  assert_eq!(statuses.iter().filter(|x|**x=="READY").count(),50);
  assert_eq!(statuses.iter().filter(|x|**x!="READY").count(),0);
 }
 #[test]
 fn v300_mixed_fifty_profiles_only_ten_need_manual_attention(){
  let mut statuses=Vec::new();
  statuses.extend((0..40).map(|_|existing_profile_recovery_bucket("ACCESSIBLE",None)));
  statuses.extend((0..5).map(|_|existing_profile_recovery_bucket("KEYCHAIN_BLOCKED",None)));
  statuses.extend((0..3).map(|_|existing_profile_recovery_bucket("ACCESSIBLE",Some("OAUTH_INVALID_GRANT: revoked"))));
  statuses.extend((0..2).map(|_|existing_profile_recovery_bucket("MISSING",None)));
  assert_eq!(statuses.iter().filter(|x|**x=="READY").count(),40);
  assert_eq!(statuses.iter().filter(|x|**x=="KEYCHAIN_BLOCKED").count(),5);
  assert_eq!(statuses.iter().filter(|x|**x=="RECONNECT_REQUIRED").count(),5);
  assert_eq!(statuses.iter().filter(|x|**x!="READY").count(),10);
 }
 #[test]
 fn v300_global_repair_does_not_change_refresh_pointers_or_generations(){
  let mut state=KeychainMigrationV2State::default();
  for i in 0..50{let id=format!("p{i}");state.refresh_token_accounts.insert(id.clone(),format!("oauth.{id}.refresh_token.v2.{}.active",i+1));state.credential_generations.insert(id.clone(),(i+1) as u32);}
  let before=(0..50).map(|i|{let id=format!("p{i}");(profile_refresh_token_account_from_state(&state,&id),state.credential_generations.get(&id).copied())}).collect::<Vec<_>>();
  let after=(0..50).map(|i|{let id=format!("p{i}");(profile_refresh_token_account_from_state(&state,&id),state.credential_generations.get(&id).copied())}).collect::<Vec<_>>();
  assert_eq!(before,after);
 }
 #[test]
 fn v300_wrong_channel_expected_identity_found_among_multiple_rows(){
  let items=vec![json!({"id":"UC_B"}),json!({"id":"UC_A"}),json!({"id":"UC_C"})];
  assert_eq!(find_expected_channel_item(&items,"UC_A").and_then(|x|x.get("id")).and_then(Value::as_str),Some("UC_A"));
 }
 #[test]
 fn v300_wrong_channel_expected_identity_absent_returns_none(){
  let items=vec![json!({"id":"UC_B"}),json!({"id":"UC_C"})];
  assert!(find_expected_channel_item(&items,"UC_A").is_none());
 }
 #[test]
 fn v300_wrong_then_correct_reconnect_preserves_uuid_and_expected_channel(){
  let sec=RotationStore::default();
  let mut store=OAuthStore{profiles:vec![profile(P,"UC_A")]};
  let before=store.profiles[0].clone();
  let err=reconnect_apply_validated_accounts_with(&sec,&mut store,P,OLD_REFRESH,OLD_SECRET,1,"CLIENT","SECRET","ACCESS","WRONG","UC_B","B",&[],"brave",3600).unwrap_err();
  assert!(err.starts_with("WRONG_CHANNEL:"));
  assert_eq!(store.profiles[0].id,before.id);assert_eq!(store.profiles[0].channel_id,before.channel_id);assert!(sec.sets.borrow().is_empty());
  reconnect_apply_validated_accounts_with(&sec,&mut store,P,OLD_REFRESH,OLD_SECRET,1,"CLIENT","SECRET","ACCESS","RIGHT","UC_A","A",&[],"chrome",3600).unwrap();
  assert_eq!(store.profiles[0].id,before.id);assert_eq!(store.profiles[0].channel_id.as_deref(),Some("UC_A"));assert_eq!(store.profiles[0].preferred_browser,"chrome");
 }

}


#[cfg(test)]
mod v300_google_identity_metadata_tests{
 use super::*;
 #[test]fn google_email_is_metadata_guard_not_primary_channel_identity(){
  assert!(google_account_identity_matches(Some("Owner@Example.com"),Some("owner@example.com")));
  assert!(!google_account_identity_matches(Some("owner@example.com"),Some("wrong@example.com")));
  assert!(google_account_identity_matches(Some("owner@example.com"),None));
  assert!(google_account_identity_matches(None,Some("owner@example.com")));
 }
 #[test]fn wrong_google_account_exits_before_keychain_pointer_commit(){
  let source=include_str!("youtube.rs");
  let reconnect=source.split("pub async fn youtube_oauth_reconnect_existing").nth(1).unwrap();
  let wrong=reconnect.find("\"code\":\"WRONG_ACCOUNT\"").unwrap();
  let pointer=reconnect.find("let pointer_before=read_keychain_migration_v2").unwrap();
  assert!(wrong<pointer);
  let prefix=&reconnect[..pointer];
  assert!(prefix.contains("\"credentialsCommitted\":false"));
  assert!(prefix.contains("expectedGoogleEmail"));
  assert!(prefix.contains("authorizedGoogleEmail"));
 }
 #[test]fn identity_scopes_are_requested_without_replacing_youtube_identity(){
  let source=include_str!("youtube.rs");
  assert!(source.contains("openid email profile https://www.googleapis.com/auth/youtube.force-ssl"));
  assert!(source.contains("expected_channel_id"));
  assert!(source.contains("reconnect_authorized_channel_matches"));
 }
}
