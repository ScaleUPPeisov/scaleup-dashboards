use std::{collections::{HashMap,HashSet},fs,path::Path,sync::{Mutex,OnceLock,atomic::{AtomicBool,Ordering}}};

const SERVICE:&str="com.scaleup.vyron.security";
const ITEM_NOT_FOUND:i32=-25300;
const AUTH_FAILED:i32=-25293;
const INTERACTION_NOT_ALLOWED:i32=-25308;
const USER_CANCELED:i32=-128;
static KEYCHAIN_ACCESS_BLOCKED:AtomicBool=AtomicBool::new(false);
static SECRET_SESSION_CACHE:OnceLock<Mutex<HashMap<String,String>>>=OnceLock::new();
static SECRET_DENIED_ACCOUNTS:OnceLock<Mutex<HashSet<String>>>=OnceLock::new();
fn secret_cache()->&'static Mutex<HashMap<String,String>>{SECRET_SESSION_CACHE.get_or_init(||Mutex::new(HashMap::new()))}
fn denied_accounts()->&'static Mutex<HashSet<String>>{SECRET_DENIED_ACCOUNTS.get_or_init(||Mutex::new(HashSet::new()))}
fn denied_error(e:&str)->bool{e.contains("KEYCHAIN_AUTH_FAILED")||e.contains("KEYCHAIN_INTERACTION_REQUIRED")||e.contains("KEYCHAIN_USER_CANCELED")||e.contains("KEYCHAIN_ACCESS_DENIED")}
pub fn invalidate_secret_cache(account:&str){if let Ok(mut c)=secret_cache().lock(){c.remove(account);}if let Ok(mut d)=denied_accounts().lock(){d.remove(account);}}
fn remember_secret(account:&str,value:&str){if let Ok(mut c)=secret_cache().lock(){if value.is_empty(){c.remove(account);}else{c.insert(account.to_string(),value.to_string());}}}
fn get_secret_cached_with<F>(account:&str,reader:F)->Result<Option<String>,String> where F:FnOnce(&str)->Result<Option<String>,String>{
 if let Ok(c)=secret_cache().lock(){if let Some(v)=c.get(account){return Ok(Some(v.clone()))}}
 if KEYCHAIN_ACCESS_BLOCKED.load(Ordering::SeqCst)||denied_accounts().lock().map(|d|d.contains(account)).unwrap_or(false){return Err(format!("KEYCHAIN_ACCESS_DENIED_CACHED: Keychain access suppressed after previous denial; account={account}"))}
 match reader(account){
  Ok(Some(v))=>{remember_secret(account,&v);Ok(Some(v))},
  Ok(None)=>Ok(None),
  Err(e)=>{if denied_error(&e){if let Ok(mut d)=denied_accounts().lock(){d.insert(account.to_string());}}Err(e)}
 }
}
pub fn get_secret_cached(account:&str)->Result<Option<String>,String>{get_secret_cached_with(account,get_secret)}

fn keychain_error(kind:&str,account:&str,code:i32,detail:&str)->String{
 if matches!(code,AUTH_FAILED|INTERACTION_NOT_ALLOWED|USER_CANCELED){KEYCHAIN_ACCESS_BLOCKED.store(true,Ordering::SeqCst);}
 match code{
  AUTH_FAILED=>format!("KEYCHAIN_AUTH_FAILED: macOS Keychain отклонил пароль или доступ к записи VYRON. operation={kind}; account={account}; osstatus={code}; detail={detail}"),
  INTERACTION_NOT_ALLOWED=>format!("KEYCHAIN_INTERACTION_REQUIRED: macOS Keychain требует подтверждение пользователя, но диалог сейчас недоступен. operation={kind}; account={account}; osstatus={code}; detail={detail}"),
  USER_CANCELED=>format!("KEYCHAIN_USER_CANCELED: запрос доступа к macOS Keychain был отменён. operation={kind}; account={account}; osstatus={code}; detail={detail}"),
  _=>format!("KEYCHAIN_ERROR: Keychain {kind} {account}: {detail} (OSStatus {code})"),
 }
}

#[cfg(target_os="macos")]
pub fn set_secret(account:&str,value:&str)->Result<(),String>{
 use security_framework::passwords::{delete_generic_password,set_generic_password};
 invalidate_secret_cache(account);
 let result=if value.is_empty(){
  match delete_generic_password(SERVICE,account){
   Ok(())=>Ok(()),
   Err(e) if e.code()==ITEM_NOT_FOUND=>Ok(()),
   Err(e)=>Err(keychain_error("delete",account,e.code(),&e.to_string())),
  }
 }else{
  set_generic_password(SERVICE,account,value.as_bytes()).map_err(|e|keychain_error("write",account,e.code(),&e.to_string()))
 };
 if result.is_ok()&&!value.is_empty(){remember_secret(account,value)}
 result
}
#[cfg(not(target_os="macos"))]
pub fn set_secret(_account:&str,_value:&str)->Result<(),String>{Err("VYRON secure storage requires macOS Keychain".into())}

#[cfg(target_os="macos")]
pub fn get_secret(account:&str)->Result<Option<String>,String>{
 use security_framework::passwords::get_generic_password;
 match get_generic_password(SERVICE,account){
  Ok(v)=>String::from_utf8(v).map(Some).map_err(|_|format!("KEYCHAIN_ERROR: Keychain value {account} is not UTF-8")),
  Err(e) if e.code()==ITEM_NOT_FOUND=>Ok(None),
  Err(e)=>Err(keychain_error("read",account,e.code(),&e.to_string())),
 }
}
#[cfg(not(target_os="macos"))]
pub fn get_secret(_account:&str)->Result<Option<String>,String>{Ok(None)}

pub fn delete_secret(account:&str)->Result<(),String>{set_secret(account,"")}

pub fn set_secret_for_autosave(account:&str,value:&str)->Result<(),String>{
 if KEYCHAIN_ACCESS_BLOCKED.load(Ordering::SeqCst){return Err("KEYCHAIN_AUTOSAVE_PAUSED: защищённое хранилище временно приостановлено после отказа macOS Keychain; локальное состояние сохраняется без повторного системного запроса".into())}
 if !value.is_empty(){if let Ok(c)=secret_cache().lock(){if c.get(account).map(String::as_str)==Some(value){return Ok(())}}}
 set_secret(account,value)
}

#[tauri::command]
pub fn security_keychain_diagnostics()->Result<serde_json::Value,String>{
 KEYCHAIN_ACCESS_BLOCKED.store(false,Ordering::SeqCst);if let Ok(mut d)=denied_accounts().lock(){d.clear();}
 #[cfg(target_os="macos")]{
  use std::time::{SystemTime,UNIX_EPOCH};
  let account=format!("diagnostic.{}.{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos());
  let secret="vyron-keychain-diagnostic";
  set_secret(&account,secret)?;
  let read=get_secret(&account)?;
  let _=delete_secret(&account);
  if read.as_deref()!=Some(secret){return Err("KEYCHAIN_ERROR: диагностическая запись прочитана некорректно".into())}
  return Ok(serde_json::json!({"ok":true,"status":"KEYCHAIN_OK","service":SERVICE}));
 }
 #[cfg(not(target_os="macos"))]{Ok(serde_json::json!({"ok":false,"status":"UNSUPPORTED"}))}
}

pub fn private_permissions(path:&Path)->Result<(),String>{
 #[cfg(unix)]{
  use std::os::unix::fs::PermissionsExt;
  fs::set_permissions(path,fs::Permissions::from_mode(0o600)).map_err(|e|format!("private permissions {}: {e}",path.display()))?;
 }
 Ok(())
}

pub fn write_private_atomic(path:&Path,bytes:&[u8])->Result<(),String>{
 let tmp=path.with_extension("secure-tmp");
 fs::write(&tmp,bytes).map_err(|e|format!("secure write {}: {e}",tmp.display()))?;
 private_permissions(&tmp)?;
 fs::rename(&tmp,path).map_err(|e|format!("secure replace {}: {e}",path.display()))?;
 private_permissions(path)
}

#[cfg(test)]
mod tests{
 use super::*;
 static KEYCHAIN_TEST_STATE_LOCK:std::sync::Mutex<()>=std::sync::Mutex::new(());
 fn reset_keychain_test_state(){
  KEYCHAIN_ACCESS_BLOCKED.store(false,Ordering::SeqCst);
  if let Ok(mut c)=secret_cache().lock(){c.clear();}
  if let Ok(mut d)=denied_accounts().lock(){d.clear();}
 }
 struct KeychainTestGuard{_lock:std::sync::MutexGuard<'static,()>}
 impl Drop for KeychainTestGuard{fn drop(&mut self){reset_keychain_test_state();}}
 fn keychain_test_guard()->KeychainTestGuard{
  let lock=KEYCHAIN_TEST_STATE_LOCK.lock().unwrap_or_else(|e|e.into_inner());
  reset_keychain_test_state();
  KeychainTestGuard{_lock:lock}
 }
 #[test]
 fn keychain_errors_are_actionable(){
  let _guard=keychain_test_guard();
  assert!(keychain_error("read","x",AUTH_FAILED,"bad").starts_with("KEYCHAIN_AUTH_FAILED:"));
  assert!(keychain_error("read","x",INTERACTION_NOT_ALLOWED,"locked").starts_with("KEYCHAIN_INTERACTION_REQUIRED:"));
  assert!(keychain_error("read","x",USER_CANCELED,"cancel").starts_with("KEYCHAIN_USER_CANCELED:"));
 }
 #[test]
 fn session_cache_second_access_has_zero_backend_reads(){
  let _guard=keychain_test_guard();
  use std::sync::atomic::{AtomicUsize,Ordering as AO};
  static READS:AtomicUsize=AtomicUsize::new(0);let account="test.cache.session";invalidate_secret_cache(account);READS.store(0,AO::SeqCst);
  let first=get_secret_cached_with(account,|_|{READS.fetch_add(1,AO::SeqCst);Ok(Some("secret".into()))}).unwrap();
  let second=get_secret_cached_with(account,|_|{READS.fetch_add(1,AO::SeqCst);Ok(Some("wrong".into()))}).unwrap();
  assert_eq!(first.as_deref(),Some("secret"));assert_eq!(second.as_deref(),Some("secret"));assert_eq!(READS.load(AO::SeqCst),1);eprintln!("SESSION_CACHE_BACKEND_READS={}",READS.load(AO::SeqCst));invalidate_secret_cache(account);
 }
 #[test]
 fn post_save_verification_uses_session_cache(){
  let _guard=keychain_test_guard();
  use std::sync::atomic::{AtomicUsize,Ordering as AO};
  static READS:AtomicUsize=AtomicUsize::new(0);let account="test.cache.post-save";invalidate_secret_cache(account);READS.store(0,AO::SeqCst);
  // set_secret() calls remember_secret() after a successful native write. Model that successful write here without touching the real Keychain.
  remember_secret(account,"saved-secret");
  let verified=get_secret_cached_with(account,|_|{READS.fetch_add(1,AO::SeqCst);Ok(Some("backend-should-not-run".into()))}).unwrap();
  assert_eq!(verified.as_deref(),Some("saved-secret"));assert_eq!(READS.load(AO::SeqCst),0);invalidate_secret_cache(account);
 }
 #[test]
 fn denial_guard_blocks_retry_loop(){
  let _guard=keychain_test_guard();
  use std::sync::atomic::{AtomicUsize,Ordering as AO};
  static READS:AtomicUsize=AtomicUsize::new(0);let account="test.cache.denial";invalidate_secret_cache(account);READS.store(0,AO::SeqCst);
  let e=get_secret_cached_with(account,|_|{READS.fetch_add(1,AO::SeqCst);Err("KEYCHAIN_ACCESS_DENIED: denied".into())}).unwrap_err();assert!(e.contains("DENIED"));
  let e2=get_secret_cached_with(account,|_|{READS.fetch_add(1,AO::SeqCst);Ok(Some("must-not-read".into()))}).unwrap_err();assert!(e2.contains("DENIED_CACHED"));assert_eq!(READS.load(AO::SeqCst),1);invalidate_secret_cache(account);
 }
 #[test]
 #[cfg(target_os="macos")]
 fn keychain_diagnostics_roundtrip(){
  let _guard=keychain_test_guard();
  let v=security_keychain_diagnostics().unwrap();
  assert_eq!(v.get("ok").and_then(|x|x.as_bool()),Some(true));
  assert_eq!(v.get("status").and_then(|x|x.as_str()),Some("KEYCHAIN_OK"));
 }
 #[test]
 #[cfg(target_os="macos")]
 fn keychain_roundtrip(){
  let _guard=keychain_test_guard();
  use std::time::{SystemTime,UNIX_EPOCH};
  let id=format!("test-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos());
  set_secret(&id,"vyron-secret-roundtrip").unwrap();
  assert_eq!(get_secret(&id).unwrap().as_deref(),Some("vyron-secret-roundtrip"));
  delete_secret(&id).unwrap();
  assert!(get_secret(&id).unwrap().is_none());
 }
}



#[derive(Debug,Clone,serde::Serialize,PartialEq,Eq)]
#[serde(rename_all="SCREAMING_SNAKE_CASE")]
pub enum KeychainReadStatus{Found,NotFound,AccessDenied,AuthFailed,EnumerationFailed,ReadFailed,Malformed,UnknownOsstatus}
#[derive(Debug,Clone,serde::Serialize)]
pub struct KeychainProbe{pub status:KeychainReadStatus,pub osstatus:Option<i32>}

fn classified_status(code:i32,operation:&str)->KeychainReadStatus{
 match code{
  ITEM_NOT_FOUND=>KeychainReadStatus::NotFound,
  AUTH_FAILED=>KeychainReadStatus::AuthFailed,
  INTERACTION_NOT_ALLOWED|USER_CANCELED=>KeychainReadStatus::AccessDenied,
  _ if operation=="enumerate"=>KeychainReadStatus::EnumerationFailed,
  _=>KeychainReadStatus::UnknownOsstatus,
 }
}
pub fn keychain_service()->&'static str{SERVICE}

#[cfg(target_os="macos")]
fn native_attributes(account:Option<&str>)->Result<Vec<std::collections::HashMap<String,String>>,String>{
 use security_framework::item::{ItemClass,ItemSearchOptions,Limit};
 let mut q=ItemSearchOptions::new();
 q.class(ItemClass::generic_password()).service(SERVICE).load_attributes(true).limit(Limit::All).cloud_sync(None::<bool>);
 if let Some(a)=account{q.account(a);}
 match q.search(){
  Ok(rows)=>{
   let mut out=Vec::with_capacity(rows.len());
   for row in rows{
    let attrs=row.simplify_dict().ok_or_else(||"KEYCHAIN_ENUM_FAILED: status=MALFORMED; native SecItemCopyMatching returned a non-attribute result".to_string())?;
    out.push(attrs);
   }
   Ok(out)
  }
  Err(e) if e.code()==ITEM_NOT_FOUND=>Ok(Vec::new()),
  Err(e)=>{let code=e.code();Err(format!("KEYCHAIN_ENUM_FAILED: status={:?}; osstatus={}; detail={}",classified_status(code,"enumerate"),code,e))}
 }
}
#[cfg(not(target_os="macos"))]
fn native_attributes(_account:Option<&str>)->Result<Vec<std::collections::HashMap<String,String>>,String>{Ok(Vec::new())}

#[cfg(target_os="macos")]
pub fn list_secret_accounts(prefix:&str)->Result<Vec<String>,String>{
 let mut accounts=Vec::new();
 for attrs in native_attributes(None)?{
  let Some(account)=attrs.get("acct").cloned() else{continue};
  if account.starts_with(prefix)&&!accounts.iter().any(|x|x==&account){accounts.push(account)}
 }
 accounts.sort();Ok(accounts)
}
#[cfg(not(target_os="macos"))]
pub fn list_secret_accounts(_prefix:&str)->Result<Vec<String>,String>{Ok(Vec::new())}

#[cfg(target_os="macos")]
pub fn secret_modified_rank(account:&str)->Result<Option<String>,String>{
 let rows=native_attributes(Some(account))?;
 Ok(rows.into_iter().find_map(|a|a.get("mdat").cloned().or_else(||a.get("cdat").cloned())))
}
#[cfg(not(target_os="macos"))]
pub fn secret_modified_rank(_account:&str)->Result<Option<String>,String>{Ok(None)}

#[cfg(target_os="macos")]
pub fn probe_secret(account:&str)->KeychainProbe{
 use security_framework::passwords::get_generic_password;
 match get_generic_password(SERVICE,account){
  Ok(v)=>if String::from_utf8(v).is_ok(){KeychainProbe{status:KeychainReadStatus::Found,osstatus:None}}else{KeychainProbe{status:KeychainReadStatus::Malformed,osstatus:None}},
  Err(e)=>{let code=e.code();KeychainProbe{status:classified_status(code,"read"),osstatus:Some(code)}}
 }
}
#[cfg(not(target_os="macos"))]
pub fn probe_secret(_account:&str)->KeychainProbe{KeychainProbe{status:KeychainReadStatus::NotFound,osstatus:None}}


#[cfg(test)]
mod native_enumeration_tests{
 use super::*;
 #[test]
 #[cfg(target_os="macos")]
 fn native_secitemcopymatching_lists_service_accounts(){use std::time::{SystemTime,UNIX_EPOCH};let id=format!("oauth.11111111-1111-4111-8111-{:012}.refresh_token",SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()%1_000_000_000_000);set_secret(&id,"test-only").unwrap();let rows=list_secret_accounts("oauth.").unwrap();assert!(rows.contains(&id));delete_secret(&id).unwrap();}
}


// VYRON_GLOBAL_OAUTH_INVENTORY_V1
fn inventory_oauth_account_parts(account:&str)->Option<(String,&'static str)>{
 let rest=account.strip_prefix("oauth.")?;
 for (suffix,kind) in [(".refresh_token","refresh_token"),(".access_token","access_token"),(".client_secret","client_secret")]{
  if let Some(id)=rest.strip_suffix(suffix){if !id.trim().is_empty(){return Some((id.to_string(),kind))}}
 }
 None
}
fn inventory_osstatus(detail:&str)->Option<i32>{
 for marker in ["osstatus=","OSStatus "]{
  if let Some(i)=detail.find(marker){
   let tail=&detail[i+marker.len()..];
   let token:String=tail.chars().take_while(|c|c.is_ascii_digit()||*c=='-').collect();
   if let Ok(v)=token.parse::<i32>(){return Some(v)}
  }
 }
 None
}
#[tauri::command]
pub fn security_oauth_inventory(app:tauri::AppHandle)->Result<serde_json::Value,String>{
 use std::collections::{BTreeMap,BTreeSet};
 use tauri::Manager;
 let service=SERVICE.to_string();
 let data_dir=app.path().app_data_dir().map_err(|e|format!("APP_DATA_DIR_FAILED: {e}"))?;
 let json_path=data_dir.join("youtube-oauth.json");
 let mut json_status="NOT_FOUND".to_string();
 let mut json_profiles=0usize;
 let mut json_refresh_tokens=0usize;
 let mut current_ids=BTreeSet::<String>::new();
 let mut json_error:Option<String>=None;
 if json_path.exists(){
  match fs::read(&json_path){
   Ok(bytes)=>match serde_json::from_slice::<serde_json::Value>(&bytes){
    Ok(v)=>{
     json_status="FOUND".into();
     if let Some(ps)=v.get("profiles").and_then(|x|x.as_array()){
      json_profiles=ps.len();
      for p in ps{
       if let Some(id)=p.get("id").and_then(|x|x.as_str()).filter(|x|!x.trim().is_empty()){current_ids.insert(id.to_string());}
       if p.get("refresh_token").and_then(|x|x.as_str()).map(|x|!x.trim().is_empty()).unwrap_or(false){json_refresh_tokens+=1;}
      }
     }
    }
    Err(e)=>{json_status="READ_FAILED".into();json_error=Some(format!("JSON_PARSE_FAILED: {e}"));}
   },
   Err(e)=>{json_status="READ_FAILED".into();json_error=Some(format!("JSON_READ_FAILED: {e}"));}
  }
 }
 let accounts=match list_secret_accounts(""){
  Ok(v)=>v,
  Err(e)=>return Ok(serde_json::json!({
   "app_version":env!("CARGO_PKG_VERSION"),"bundle_id":"studio.channelflow.desktop","service":service,
   "enumeration_status":"FAIL","osstatus":inventory_osstatus(&e),"enumeration_error":e,
   "total_service_accounts":0,"refresh_token_accounts":0,"access_token_accounts":0,"client_secret_accounts":0,"unique_oauth_profile_uuids":0,
   "profiles":[],"current_channel_profiles":current_ids.len(),"current_uuid_with_refresh_token":0,"current_uuid_without_refresh_token":current_ids.len(),
   "keychain_uuid_not_present_in_current_database":0,"orphan_profile_uuid_count":0,"readable_orphan_refresh_tokens":0,"denied_orphan_refresh_tokens":0,"failed_orphan_refresh_tokens":0,
   "historical_json":{"exact_path":json_path.display().to_string(),"file":json_status,"profiles_in_json":json_profiles,"profiles_with_refresh_token":json_refresh_tokens,"error":json_error}
  })),
 };
 let mut by_id:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();
 let mut refresh_count=0usize;let mut access_count=0usize;let mut secret_count=0usize;
 for account in &accounts{
  if let Some((id,kind))=inventory_oauth_account_parts(account){
   match kind{"refresh_token"=>refresh_count+=1,"access_token"=>access_count+=1,"client_secret"=>secret_count+=1,_=>{}}
   by_id.entry(id).or_default().insert(kind.to_string());
  }
 }
 let mut all_ids:BTreeSet<String>=by_id.keys().cloned().collect();
 all_ids.extend(current_ids.iter().cloned());
 let mut rows=Vec::<serde_json::Value>::new();
 let mut current_with=0usize;let mut orphan_count=0usize;let mut orphan_readable=0usize;let mut orphan_denied=0usize;let mut orphan_failed=0usize;
 for id in all_ids{
  let kinds=by_id.get(&id).cloned().unwrap_or_default();
  let refresh_present=kinds.contains("refresh_token");
  let is_current=current_ids.contains(&id);let is_orphan=!is_current&&by_id.contains_key(&id);
  if is_current&&refresh_present{current_with+=1}
  if is_orphan{orphan_count+=1}
  // Passive inventory is account-presence only. Never read secret values here.
  let (read_status,read_osstatus,read_error):(String,Option<i32>,Option<String>)=("NOT_RUN".to_string(),None,None);
  let _=&mut orphan_readable;let _=&mut orphan_denied;let _=&mut orphan_failed;
  rows.push(serde_json::json!({
   "profile_uuid":id,"is_current":is_current,"is_orphan":is_orphan,
   "refresh_token_account":if refresh_present{"PRESENT"}else{"ABSENT"},
   "access_token_account":if kinds.contains("access_token"){"PRESENT"}else{"ABSENT"},
   "client_secret_account":if kinds.contains("client_secret"){"PRESENT"}else{"ABSENT"},
   "refresh_token_read":read_status,"refresh_read_osstatus":read_osstatus,"refresh_read_error":read_error
  }));
 }
 Ok(serde_json::json!({
  "app_version":env!("CARGO_PKG_VERSION"),"bundle_id":"studio.channelflow.desktop","service":service,
  "enumeration_status":"PASS","osstatus":0,"enumeration_error":serde_json::Value::Null,
  "total_service_accounts":accounts.len(),"refresh_token_accounts":refresh_count,"access_token_accounts":access_count,"client_secret_accounts":secret_count,"unique_oauth_profile_uuids":by_id.len(),
  "profiles":rows,"current_channel_profiles":current_ids.len(),"current_uuid_with_refresh_token":current_with,"current_uuid_without_refresh_token":current_ids.len().saturating_sub(current_with),
  "keychain_uuid_not_present_in_current_database":orphan_count,"orphan_profile_uuid_count":orphan_count,
  "readable_orphan_refresh_tokens":orphan_readable,"denied_orphan_refresh_tokens":orphan_denied,"failed_orphan_refresh_tokens":orphan_failed,
  "historical_json":{"exact_path":json_path.display().to_string(),"file":json_status,"profiles_in_json":json_profiles,"profiles_with_refresh_token":json_refresh_tokens,"error":json_error}
 }))
}
