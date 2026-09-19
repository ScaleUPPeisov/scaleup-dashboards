use std::{collections::{HashMap,HashSet,VecDeque},fs,path::Path,sync::{Mutex,OnceLock,atomic::{AtomicBool,Ordering}}};

#[derive(Debug,Clone,Default,serde::Serialize)]
struct KeychainAccountRuntimeStats{
 cache_hits:u64,
 cache_misses:u64,
 backend_reads:u64,
 backend_writes:u64,
 backend_deletes:u64,
 acl_migration_attempts:u64,
 acl_migration_successes:u64,
 acl_migration_failures:u64,
 last_osstatus:Option<i32>,
}
#[derive(Debug,Clone,serde::Serialize)]
struct KeychainRuntimeEvent{
 at:String,
 operation:String,
 profile_uuid:Option<String>,
 account_type:String,
 cache:String,
 osstatus:Option<i32>,
 migration_state:Option<String>,
}
#[derive(Default)]
struct KeychainRuntimeState{
 by_account:HashMap<String,KeychainAccountRuntimeStats>,
 events:VecDeque<KeychainRuntimeEvent>,
}
static KEYCHAIN_RUNTIME:OnceLock<Mutex<KeychainRuntimeState>>=OnceLock::new();
fn keychain_runtime()->&'static Mutex<KeychainRuntimeState>{KEYCHAIN_RUNTIME.get_or_init(||Mutex::new(KeychainRuntimeState::default()))}
fn safe_account_parts(account:&str)->(Option<String>,String){
 if let Some(rest)=account.strip_prefix("oauth."){
  for suffix in [".refresh_token",".access_token",".client_secret"]{
   if let Some(id)=rest.strip_suffix(suffix){return(Some(id.to_string()),suffix.trim_start_matches('.').to_string())}
  }
 }
 if account=="google.client_secret"{return(None,"google_client_secret".into())}
 if account=="google.api_key"{return(None,"google_api_key".into())}
 if account.contains("refresh_token"){return(None,"legacy_refresh_token".into())}
 if account.contains("access_token"){return(None,"legacy_access_token".into())}
 if account.contains("client_secret"){return(None,"legacy_client_secret".into())}
 (None,"other".into())
}
fn record_runtime(account:&str,operation:&str,cache:&str,osstatus:Option<i32>,migration_state:Option<&str>){
 let Ok(mut rt)=keychain_runtime().lock() else{return};
 let row=rt.by_account.entry(account.to_string()).or_default();
 match operation{
  "CACHE_HIT"=>row.cache_hits+=1,
  "CACHE_MISS"=>row.cache_misses+=1,
  "READ"=>row.backend_reads+=1,
  "WRITE"=>row.backend_writes+=1,
  "DELETE"=>row.backend_deletes+=1,
  "ACL_MIGRATE_ATTEMPT"=>row.acl_migration_attempts+=1,
  "ACL_MIGRATE_PASS"=>row.acl_migration_successes+=1,
  "ACL_MIGRATE_FAIL"=>row.acl_migration_failures+=1,
  _=>{}
 }
 if osstatus.is_some(){row.last_osstatus=osstatus}
 let (profile_uuid,account_type)=safe_account_parts(account);
 rt.events.push_back(KeychainRuntimeEvent{
  at:chrono::Utc::now().to_rfc3339(),
  operation:operation.to_string(),
  profile_uuid,
  account_type,
  cache:cache.to_string(),
  osstatus,
  migration_state:migration_state.map(str::to_string),
 });
 while rt.events.len()>200{rt.events.pop_front();}
}


const SERVICE:&str="com.scaleup.vyron.security";
pub const LEGACY_SERVICE:&str=SERVICE;
pub const CANONICAL_SERVICE:&str="com.scaleup.vyron.security.v2";
#[cfg(target_os="windows")]
static WINDOWS_ACTIVE_TENANT:OnceLock<Mutex<Option<String>>>=OnceLock::new();
#[cfg(target_os="windows")]
fn windows_tenant()->&'static Mutex<Option<String>>{WINDOWS_ACTIVE_TENANT.get_or_init(||Mutex::new(None))}
#[cfg(target_os="windows")]
pub fn set_active_tenant(user_id:Option<&str>){
 if let Ok(mut slot)=windows_tenant().lock(){*slot=user_id.map(str::trim).filter(|x|!x.is_empty()).map(str::to_string);}
 if let Ok(mut c)=canonical_cache().lock(){c.clear();}
 if let Ok(mut c)=secret_cache().lock(){c.clear();}
}
#[cfg(not(target_os="windows"))]
pub fn set_active_tenant(_user_id:Option<&str>){}

#[cfg(target_os="windows")]
fn windows_scoped_account(account:&str)->String{
 if account.starts_with("license."){return account.to_string()}
 let tenant=windows_tenant().lock().ok().and_then(|x|x.clone()).unwrap_or_else(||"unlicensed".into());
 format!("tenant.{tenant}.{account}")
}


#[cfg(target_os="windows")]
fn windows_target(service:&str,account:&str)->String{format!("VYRON/{service}/{}",windows_scoped_account(account))}
#[cfg(target_os="windows")]
fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(std::iter::once(0)).collect()}
#[cfg(target_os="windows")]
unsafe fn wide_ptr_to_string(ptr:*const u16)->String{
 if ptr.is_null(){return String::new()}
 let mut len=0usize;
 while *ptr.add(len)!=0{len+=1}
 String::from_utf16_lossy(std::slice::from_raw_parts(ptr,len))
}
#[cfg(target_os="windows")]
fn windows_secret_get(service:&str,account:&str)->Result<Option<String>,String>{
 use windows_sys::Win32::Foundation::{GetLastError,ERROR_NOT_FOUND};
 use windows_sys::Win32::Security::Credentials::{CredFree,CredReadW,CREDENTIALW,CRED_TYPE_GENERIC};
 let target=wide(&windows_target(service,account));
 let mut p:*mut CREDENTIALW=std::ptr::null_mut();
 let ok=unsafe{CredReadW(target.as_ptr(),CRED_TYPE_GENERIC,0,&mut p)};
 if ok==0{
  let code=unsafe{GetLastError()};
  if code==ERROR_NOT_FOUND{return Ok(None)}
  return Err(format!("WINDOWS_CREDENTIAL_READ_FAILED: account={account}; win32={code}"))
 }
 if p.is_null(){return Ok(None)}
 let bytes=unsafe{
  let cred=&*p;
  if cred.CredentialBlob.is_null()||cred.CredentialBlobSize==0{Vec::new()}
  else{std::slice::from_raw_parts(cred.CredentialBlob,cred.CredentialBlobSize as usize).to_vec()}
 };
 unsafe{CredFree(p as *const std::ffi::c_void)};
 String::from_utf8(bytes).map(Some).map_err(|_|format!("WINDOWS_CREDENTIAL_INVALID_UTF8: account={account}"))
}
#[cfg(target_os="windows")]
fn windows_secret_set(service:&str,account:&str,value:&str)->Result<(),String>{
 use windows_sys::Win32::Foundation::GetLastError;
 use windows_sys::Win32::Security::Credentials::{CredDeleteW,CredWriteW,CREDENTIALW,CRED_PERSIST_LOCAL_MACHINE,CRED_TYPE_GENERIC};
 let mut target=wide(&windows_target(service,account));
 if value.is_empty(){
  let ok=unsafe{CredDeleteW(target.as_ptr(),CRED_TYPE_GENERIC,0)};
  if ok==0{
   use windows_sys::Win32::Foundation::ERROR_NOT_FOUND;
   let code=unsafe{GetLastError()};
   if code!=ERROR_NOT_FOUND{return Err(format!("WINDOWS_CREDENTIAL_DELETE_FAILED: account={account}; win32={code}"))}
  }
  return Ok(())
 }
 let mut user=wide(account);
 let blob=value.as_bytes();
 let mut cred:CREDENTIALW=unsafe{std::mem::zeroed()};
 cred.Type=CRED_TYPE_GENERIC;
 cred.TargetName=target.as_mut_ptr();
 cred.CredentialBlobSize=blob.len() as u32;
 cred.CredentialBlob=blob.as_ptr() as *mut u8;
 cred.Persist=CRED_PERSIST_LOCAL_MACHINE;
 cred.UserName=user.as_mut_ptr();
 let ok=unsafe{CredWriteW(&cred,0)};
 if ok==0{let code=unsafe{GetLastError()};return Err(format!("WINDOWS_CREDENTIAL_WRITE_FAILED: account={account}; win32={code}"))}
 Ok(())
}
#[cfg(target_os="windows")]
fn windows_list_accounts(service:&str,prefix:&str)->Result<Vec<String>,String>{
 use windows_sys::Win32::Foundation::{GetLastError,ERROR_NOT_FOUND};
 use windows_sys::Win32::Security::Credentials::{CredEnumerateW,CredFree,CREDENTIALW};
 let scope=windows_scoped_account("");
 let scope_prefix=scope.strip_suffix("").unwrap_or(&scope);
 let tenant_prefix=if let Some(i)=scope_prefix.rfind('.') { &scope_prefix[..=i] } else { scope_prefix };
 let target_prefix=format!("VYRON/{service}/{tenant_prefix}");
 let filter=wide(&(target_prefix.clone()+"*"));
 let mut count=0u32;
 let mut rows:*mut *mut CREDENTIALW=std::ptr::null_mut();
 let ok=unsafe{CredEnumerateW(filter.as_ptr(),0,&mut count,&mut rows)};
 if ok==0{
  let code=unsafe{GetLastError()};
  if code==ERROR_NOT_FOUND{return Ok(Vec::new())}
  return Err(format!("WINDOWS_CREDENTIAL_ENUM_FAILED: win32={code}"))
 }
 let mut out=Vec::new();
 if !rows.is_null(){
  let slice=unsafe{std::slice::from_raw_parts(rows,count as usize)};
  for ptr in slice{
   if ptr.is_null(){continue}
   let target=unsafe{wide_ptr_to_string((**ptr).TargetName)};
   if let Some(account)=target.strip_prefix(&target_prefix){
    if account.starts_with(prefix)&&!out.iter().any(|x|x==account){out.push(account.to_string())}
   }
  }
  unsafe{CredFree(rows as *const std::ffi::c_void)};
 }
 out.sort();
 Ok(out)
}

static LEGACY_BACKEND_READS:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static CANONICAL_BACKEND_READS:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static CANONICAL_BACKEND_WRITES:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static CANONICAL_BACKEND_DELETES:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static CANONICAL_SESSION_CACHE:OnceLock<Mutex<HashMap<String,String>>>=OnceLock::new();
static CANONICAL_DENIED_ACCOUNTS:OnceLock<Mutex<HashSet<String>>>=OnceLock::new();
static KEYCHAIN_NO_UI_MUTEX:OnceLock<Mutex<()>>=OnceLock::new();
static INTERACTIVE_UI_REQUESTS_BLOCKED:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static LEGACY_RECONNECT_REQUIRED_COUNT:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
fn canonical_cache()->&'static Mutex<HashMap<String,String>>{CANONICAL_SESSION_CACHE.get_or_init(||Mutex::new(HashMap::new()))}
fn canonical_denied()->&'static Mutex<HashSet<String>>{CANONICAL_DENIED_ACCOUNTS.get_or_init(||Mutex::new(HashSet::new()))}
fn keychain_no_ui_mutex()->&'static Mutex<()>{KEYCHAIN_NO_UI_MUTEX.get_or_init(||Mutex::new(()))}
#[cfg(target_os="macos")]
fn with_keychain_no_ui<T,F>(f:F)->Result<T,String> where F:FnOnce()->Result<T,String>{
 let _serial=keychain_no_ui_mutex().lock().map_err(|_|"KEYCHAIN_NO_UI_LOCK_POISONED".to_string())?;
 use security_framework::os::macos::keychain::SecKeychain;
 let _ui=SecKeychain::disable_user_interaction().map_err(|e|format!("KEYCHAIN_NO_UI_GUARD_FAILED: osstatus={}; detail={e}",e.code()))?;
 f()
}
#[cfg(not(target_os="macos"))]
fn with_keychain_no_ui<T,F>(f:F)->Result<T,String> where F:FnOnce()->Result<T,String>{f()}
pub fn mark_legacy_reconnect_required(account:&str){
 LEGACY_RECONNECT_REQUIRED_COUNT.fetch_add(1,Ordering::SeqCst);
 record_runtime(account,"LEGACY_RECONNECT_REQUIRED","NONE",None,Some("RECONNECT_REQUIRED"));
}
const ITEM_NOT_FOUND:i32=-25300;
const AUTH_FAILED:i32=-25293;
const INTERACTION_NOT_ALLOWED:i32=-25308;
const USER_CANCELED:i32=-128;
const DUPLICATE_ITEM:i32=-25299;
static KEYCHAIN_ACCESS_BLOCKED:AtomicBool=AtomicBool::new(false);
static SECRET_SESSION_CACHE:OnceLock<Mutex<HashMap<String,String>>>=OnceLock::new();
static SECRET_DENIED_ACCOUNTS:OnceLock<Mutex<HashSet<String>>>=OnceLock::new();
fn secret_cache()->&'static Mutex<HashMap<String,String>>{SECRET_SESSION_CACHE.get_or_init(||Mutex::new(HashMap::new()))}
fn denied_accounts()->&'static Mutex<HashSet<String>>{SECRET_DENIED_ACCOUNTS.get_or_init(||Mutex::new(HashSet::new()))}
fn denied_error(e:&str)->bool{e.contains("KEYCHAIN_AUTH_FAILED")||e.contains("KEYCHAIN_INTERACTION_REQUIRED")||e.contains("KEYCHAIN_USER_CANCELED")||e.contains("KEYCHAIN_ACCESS_DENIED")}

#[cfg(target_os="macos")]
fn secitem_no_ui_base_query(service:&str,account:&str)->Vec<(core_foundation::string::CFString,core_foundation::base::CFType)>{
 use core_foundation::base::{TCFType};
 use core_foundation::string::CFString;
 use security_framework_sys::item::{
  kSecAttrAccount,kSecAttrService,kSecClass,kSecClassGenericPassword,
  kSecUseAuthenticationUI,kSecUseAuthenticationUISkip,
 };
 unsafe{
  vec![
   (CFString::wrap_under_get_rule(kSecClass),CFString::wrap_under_get_rule(kSecClassGenericPassword).into_CFType()),
   (CFString::wrap_under_get_rule(kSecAttrService),CFString::from(service).into_CFType()),
   (CFString::wrap_under_get_rule(kSecAttrAccount),CFString::from(account).into_CFType()),
   (CFString::wrap_under_get_rule(kSecUseAuthenticationUI),CFString::wrap_under_get_rule(kSecUseAuthenticationUISkip).into_CFType()),
  ]
 }
}

#[cfg(target_os="macos")]
fn secitem_no_ui_get(service:&str,account:&str,kind:&str)->Result<Option<Vec<u8>>,String>{
 use core_foundation::base::{TCFType,CFType};
 use core_foundation::boolean::CFBoolean;
 use core_foundation::data::CFData;
 use core_foundation::dictionary::CFDictionary;
 use core_foundation::string::CFString;
 use core_foundation_sys::base::{CFGetTypeID,CFRelease,CFTypeRef};
 use core_foundation_sys::data::CFDataRef;
 use security_framework_sys::item::kSecReturnData;
 use security_framework_sys::keychain_item::SecItemCopyMatching;

 let mut pairs=secitem_no_ui_base_query(service,account);
 unsafe{pairs.push((CFString::wrap_under_get_rule(kSecReturnData),CFBoolean::from(true).into_CFType()));}
 let query=CFDictionary::from_CFType_pairs(&pairs);
 let mut ret:CFTypeRef=std::ptr::null();
 let status=unsafe{SecItemCopyMatching(query.as_concrete_TypeRef(),&mut ret)};
 if status==ITEM_NOT_FOUND{return Ok(None)}
 if status!=0{return Err(keychain_error(kind,account,status,"SecItemCopyMatching UI=SKIP"))}
 if ret.is_null(){return Ok(None)}
 unsafe{
  if CFGetTypeID(ret)!=CFData::type_id(){CFRelease(ret);return Err(format!("KEYCHAIN_ERROR: {kind} returned non-data; account={account}"))}
  let data=CFData::wrap_under_create_rule(ret as CFDataRef);
  Ok(Some(data.bytes().to_vec()))
 }
}

#[cfg(target_os="macos")]
fn secitem_no_ui_set(service:&str,account:&str,value:&[u8],kind:&str)->Result<(),String>{
 use core_foundation::base::{TCFType,CFType};
 use core_foundation::data::CFData;
 use core_foundation::dictionary::CFDictionary;
 use core_foundation::string::CFString;
 use security_framework_sys::item::kSecValueData;
 use security_framework_sys::keychain_item::{SecItemAdd,SecItemUpdate};

 let mut add_pairs=secitem_no_ui_base_query(service,account);
 unsafe{add_pairs.push((CFString::wrap_under_get_rule(kSecValueData),CFData::from_buffer(value).into_CFType()));}
 let add=CFDictionary::from_CFType_pairs(&add_pairs);
 let status=unsafe{SecItemAdd(add.as_concrete_TypeRef(),std::ptr::null_mut())};
 if status==0{return Ok(())}
 if status!=DUPLICATE_ITEM{return Err(keychain_error(kind,account,status,"SecItemAdd UI=SKIP"))}

 let query_pairs=secitem_no_ui_base_query(service,account);
 let query=CFDictionary::from_CFType_pairs(&query_pairs);
 let update_pairs=unsafe{vec![(CFString::wrap_under_get_rule(kSecValueData),CFData::from_buffer(value).into_CFType())]};
 let update=CFDictionary::from_CFType_pairs(&update_pairs);
 let update_status=unsafe{SecItemUpdate(query.as_concrete_TypeRef(),update.as_concrete_TypeRef())};
 if update_status==0{Ok(())}else{Err(keychain_error(kind,account,update_status,"SecItemUpdate UI=SKIP"))}
}

#[cfg(target_os="macos")]
fn secitem_no_ui_delete(service:&str,account:&str,kind:&str)->Result<(),String>{
 use core_foundation::base::TCFType;
 use core_foundation::dictionary::CFDictionary;
 use security_framework_sys::keychain_item::SecItemDelete;
 let pairs=secitem_no_ui_base_query(service,account);
 let query=CFDictionary::from_CFType_pairs(&pairs);
 let status=unsafe{SecItemDelete(query.as_concrete_TypeRef())};
 if status==0||status==ITEM_NOT_FOUND{Ok(())}else{Err(keychain_error(kind,account,status,"SecItemDelete UI=SKIP"))}
}
pub fn invalidate_secret_cache(account:&str){if let Ok(mut c)=secret_cache().lock(){c.remove(account);}if let Ok(mut d)=denied_accounts().lock(){d.remove(account);}}
fn remember_secret(account:&str,value:&str){if let Ok(mut c)=secret_cache().lock(){if value.is_empty(){c.remove(account);}else{c.insert(account.to_string(),value.to_string());}}}
fn forget_secret(account:&str){if let Ok(mut c)=secret_cache().lock(){c.remove(account);}}
fn cached_secret_matches(account:&str,value:&str)->bool{secret_cache().lock().map(|c|c.get(account).map(String::as_str)==Some(value)).unwrap_or(false)}
fn get_secret_cached_with<F>(account:&str,reader:F)->Result<Option<String>,String> where F:FnOnce(&str)->Result<Option<String>,String>{
 if let Ok(c)=secret_cache().lock(){if let Some(v)=c.get(account){record_runtime(account,"CACHE_HIT","HIT",None,None);return Ok(Some(v.clone()))}}
 record_runtime(account,"CACHE_MISS","MISS",None,None);
 if KEYCHAIN_ACCESS_BLOCKED.load(Ordering::SeqCst)||denied_accounts().lock().map(|d|d.contains(account)).unwrap_or(false){return Err(format!("KEYCHAIN_ACCESS_DENIED_CACHED: Keychain access suppressed after previous denial; account={account}"))}
 match reader(account){
  Ok(Some(v))=>{remember_secret(account,&v);Ok(Some(v))},
  Ok(None)=>Ok(None),
  Err(e)=>{if denied_error(&e){if let Ok(mut d)=denied_accounts().lock(){d.insert(account.to_string());}}Err(e)}
 }
}
pub fn get_secret_cached(account:&str)->Result<Option<String>,String>{get_secret_cached_with(account,get_secret)}

#[cfg(target_os="macos")]
pub fn canonical_get_secret(account:&str)->Result<Option<String>,String>{
 CANONICAL_BACKEND_READS.fetch_add(1,Ordering::SeqCst);
 with_keychain_no_ui(||match secitem_no_ui_get(CANONICAL_SERVICE,account,"canonical_read_ui_skip"){
  Ok(Some(v))=>{record_runtime(&format!("canonical::{account}"),"READ","SECITEM_UI_FAIL",Some(0),None);String::from_utf8(v).map(Some).map_err(|_|format!("KEYCHAIN_ERROR: canonical Keychain value {account} is not UTF-8"))},
  Ok(None)=>{record_runtime(&format!("canonical::{account}"),"READ","SECITEM_UI_FAIL",Some(ITEM_NOT_FOUND),None);Ok(None)},
  Err(e)=>{record_runtime(&format!("canonical::{account}"),"READ","SECITEM_UI_FAIL",None,None);Err(e)},
 })
}
#[cfg(target_os="windows")]
pub fn canonical_get_secret(account:&str)->Result<Option<String>,String>{
 CANONICAL_BACKEND_READS.fetch_add(1,Ordering::SeqCst);
 let r=windows_secret_get(CANONICAL_SERVICE,account);
 if r.is_ok(){record_runtime(&format!("canonical::{account}"),"READ","WINDOWS_CREDENTIAL_MANAGER",Some(0),None);}
 r
}
#[cfg(all(not(target_os="macos"),not(target_os="windows")))]
pub fn canonical_get_secret(_account:&str)->Result<Option<String>,String>{Ok(None)}

pub fn canonical_get_secret_cached(account:&str)->Result<Option<String>,String>{
 if let Ok(c)=canonical_cache().lock(){if let Some(v)=c.get(account){record_runtime(&format!("canonical::{account}"),"CACHE_HIT","HIT",None,None);return Ok(Some(v.clone()))}}
 record_runtime(&format!("canonical::{account}"),"CACHE_MISS","MISS",None,None);
 if canonical_denied().lock().map(|d|d.contains(account)).unwrap_or(false){return Err(format!("KEYCHAIN_ACCESS_DENIED_CACHED: canonical account={account}"))}
 match canonical_get_secret(account){
  Ok(Some(v))=>{if let Ok(mut c)=canonical_cache().lock(){c.insert(account.to_string(),v.clone());}Ok(Some(v))},
  Ok(None)=>Ok(None),
  Err(e)=>{if denied_error(&e){if let Ok(mut d)=canonical_denied().lock(){d.insert(account.to_string());}}Err(e)}
 }
}
pub fn canonical_forget_cache(account:&str){
 if let Ok(mut c)=canonical_cache().lock(){c.remove(account);}
 if let Ok(mut d)=canonical_denied().lock(){d.remove(account);}
}
#[cfg(target_os="macos")]
pub fn canonical_set_secret(account:&str,value:&str)->Result<(),String>{
 if !value.is_empty(){
  if let Ok(c)=canonical_cache().lock(){if c.get(account).map(String::as_str)==Some(value){return Ok(())}}
 }
 let result=with_keychain_no_ui(||if value.is_empty(){
  match secitem_no_ui_delete(CANONICAL_SERVICE,account,"canonical_delete_ui_skip"){
   Ok(())=>{CANONICAL_BACKEND_DELETES.fetch_add(1,Ordering::SeqCst);record_runtime(&format!("canonical::{account}"),"DELETE","SECITEM_UI_FAIL",Some(0),None);Ok(())},
   Err(e)=>Err(e)
  }
 }else{
  CANONICAL_BACKEND_WRITES.fetch_add(1,Ordering::SeqCst);
  match secitem_no_ui_set(CANONICAL_SERVICE,account,value.as_bytes(),"canonical_write_ui_skip"){
   Ok(())=>{record_runtime(&format!("canonical::{account}"),"WRITE","SECITEM_UI_FAIL",Some(0),None);Ok(())},
   Err(e)=>Err(e)
  }
 });
 if result.is_ok(){
  if value.is_empty(){canonical_forget_cache(account)}
  else{if let Ok(mut c)=canonical_cache().lock(){c.insert(account.to_string(),value.to_string());}if let Ok(mut d)=canonical_denied().lock(){d.remove(account);}}
 }
 result
}
#[cfg(target_os="windows")]
pub fn canonical_set_secret(account:&str,value:&str)->Result<(),String>{
 if !value.is_empty(){if let Ok(cache)=canonical_cache().lock(){if cache.get(account).map(String::as_str)==Some(value){return Ok(())}}}
 let r=windows_secret_set(CANONICAL_SERVICE,account,value);
 if r.is_ok(){
  if value.is_empty(){CANONICAL_BACKEND_DELETES.fetch_add(1,Ordering::SeqCst);canonical_forget_cache(account);record_runtime(&format!("canonical::{account}"),"DELETE","WINDOWS_CREDENTIAL_MANAGER",Some(0),None);}
  else{CANONICAL_BACKEND_WRITES.fetch_add(1,Ordering::SeqCst);if let Ok(mut cache)=canonical_cache().lock(){cache.insert(account.to_string(),value.to_string());}record_runtime(&format!("canonical::{account}"),"WRITE","WINDOWS_CREDENTIAL_MANAGER",Some(0),None);}
 }
 r
}
#[cfg(all(not(target_os="macos"),not(target_os="windows")))]
pub fn canonical_set_secret(_account:&str,_value:&str)->Result<(),String>{Err("VYRON secure storage is unsupported on this platform".into())}
pub fn canonical_delete_secret(account:&str)->Result<(),String>{canonical_set_secret(account,"")}
pub fn canonical_verify_secret(account:&str,expected:&str)->Result<bool,String>{
 canonical_forget_cache(account);
 Ok(canonical_get_secret(account)?.as_deref()==Some(expected))
}
pub fn legacy_get_secret_once(account:&str)->Result<Option<String>,String>{get_secret(account)}
pub fn canonical_service()->&'static str{CANONICAL_SERVICE}

fn keychain_error(kind:&str,account:&str,code:i32,detail:&str)->String{
 if code==INTERACTION_NOT_ALLOWED{INTERACTIVE_UI_REQUESTS_BLOCKED.fetch_add(1,Ordering::SeqCst);}
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
 let result=with_keychain_no_ui(||if value.is_empty(){
  match secitem_no_ui_delete(SERVICE,account,"legacy_delete_ui_skip"){
   Ok(())=>{record_runtime(account,"DELETE","SECITEM_UI_FAIL",Some(0),None);Ok(())},
   Err(e)=>Err(e),
  }
 }else{
  match secitem_no_ui_set(SERVICE,account,value.as_bytes(),"legacy_write_ui_skip"){
   Ok(())=>{record_runtime(account,"WRITE","SECITEM_UI_FAIL",Some(0),None);Ok(())},
   Err(e)=>Err(e)
  }
 });
 if result.is_ok(){
  KEYCHAIN_ACCESS_BLOCKED.store(false,Ordering::SeqCst);
  if let Ok(mut d)=denied_accounts().lock(){d.remove(account);}
  if value.is_empty(){forget_secret(account)}else{remember_secret(account,value)}
 }
 result
}
#[cfg(target_os="windows")]
pub fn set_secret(account:&str,value:&str)->Result<(),String>{
 let r=windows_secret_set(SERVICE,account,value);
 if r.is_ok(){if value.is_empty(){forget_secret(account)}else{remember_secret(account,value)}}
 r
}
#[cfg(all(not(target_os="macos"),not(target_os="windows")))]
pub fn set_secret(_account:&str,_value:&str)->Result<(),String>{Err("VYRON secure storage is unsupported on this platform".into())}

fn set_secret_if_changed_with<F>(account:&str,value:&str,writer:F)->Result<(),String> where F:FnOnce(&str,&str)->Result<(),String>{
 if !value.is_empty()&&cached_secret_matches(account,value){return Ok(())}
 writer(account,value)
}
pub fn set_secret_if_changed(account:&str,value:&str)->Result<(),String>{set_secret_if_changed_with(account,value,set_secret)}

#[cfg(target_os="macos")]
pub fn get_secret(account:&str)->Result<Option<String>,String>{
 LEGACY_BACKEND_READS.fetch_add(1,Ordering::SeqCst);
 with_keychain_no_ui(||match secitem_no_ui_get(SERVICE,account,"legacy_read_ui_skip"){
  Ok(Some(v))=>{record_runtime(account,"READ","SECITEM_UI_FAIL",Some(0),None);String::from_utf8(v).map(Some).map_err(|_|format!("KEYCHAIN_ERROR: Keychain value {account} is not UTF-8"))},
  Ok(None)=>{record_runtime(account,"READ","SECITEM_UI_FAIL",Some(ITEM_NOT_FOUND),None);Ok(None)},
  Err(e)=>{record_runtime(account,"READ","SECITEM_UI_FAIL",None,None);Err(e)},
 })
}
#[cfg(target_os="windows")]
pub fn get_secret(account:&str)->Result<Option<String>,String>{
 LEGACY_BACKEND_READS.fetch_add(1,Ordering::SeqCst);
 windows_secret_get(SERVICE,account)
}
#[cfg(all(not(target_os="macos"),not(target_os="windows")))]
pub fn get_secret(_account:&str)->Result<Option<String>,String>{Ok(None)}

pub fn delete_secret(account:&str)->Result<(),String>{set_secret(account,"")}

pub fn set_secret_for_autosave(account:&str,value:&str)->Result<(),String>{
 if KEYCHAIN_ACCESS_BLOCKED.load(Ordering::SeqCst){return Err("KEYCHAIN_AUTOSAVE_PAUSED: защищённое хранилище временно приостановлено после отказа macOS Keychain; локальное состояние сохраняется без повторного системного запроса".into())}
 set_secret_if_changed(account,value)
}

#[tauri::command]
pub fn security_keychain_diagnostics()->Result<serde_json::Value,String>{
 #[cfg(target_os="macos")]{
  // RC7 diagnostic is deliberately passive: no secret write/read/delete roundtrip.
  // It only enumerates non-authenticated attributes with kSecUseAuthenticationUISkip.
  let canonical_visible=list_canonical_secret_accounts("")?.len();
  let legacy_visible=list_legacy_secret_accounts("")?.len();
  return Ok(serde_json::json!({
   "ok":true,
   "status":"NO_UI_POLICY_ACTIVE",
   "service":CANONICAL_SERVICE,
   "legacyService":LEGACY_SERVICE,
   "canonicalVisibleAccounts":canonical_visible,
   "legacyVisibleAccounts":legacy_visible,
   "secretValuesIncluded":false,
   "secretReads":0,
   "secretWrites":0,
   "authenticationUi":"FAIL_OR_SKIP"
  }));
 }
 #[cfg(not(target_os="macos"))]{Ok(serde_json::json!({"ok":false,"status":"UNSUPPORTED"}))}
}

#[tauri::command]
pub fn security_keychain_runtime_diagnostics()->serde_json::Value{
 let snapshot=keychain_runtime().lock().ok();
 let mut accounts=Vec::<serde_json::Value>::new();
 let mut total_reads=0u64;let mut total_writes=0u64;let mut total_deletes=0u64;let mut cache_hits=0u64;let mut cache_misses=0u64;
 let mut migration_attempts=0u64;let mut migration_successes=0u64;let mut migration_failures=0u64;
 if let Some(rt)=snapshot.as_ref(){
  for (account,row) in &rt.by_account{
   let (profile_uuid,account_type)=safe_account_parts(account);
   total_reads+=row.backend_reads;total_writes+=row.backend_writes;total_deletes+=row.backend_deletes;cache_hits+=row.cache_hits;cache_misses+=row.cache_misses;
   migration_attempts+=row.acl_migration_attempts;migration_successes+=row.acl_migration_successes;migration_failures+=row.acl_migration_failures;
   accounts.push(serde_json::json!({
    "profileUuid":profile_uuid,"accountType":account_type,
    "cacheHits":row.cache_hits,"cacheMisses":row.cache_misses,
    "backendReads":row.backend_reads,"backendWrites":row.backend_writes,"backendDeletes":row.backend_deletes,
    "migrationAttempts":row.acl_migration_attempts,"migrationSuccesses":row.acl_migration_successes,"migrationFailures":row.acl_migration_failures,
    "lastOsstatus":row.last_osstatus
   }));
  }
 }
 accounts.sort_by(|a,b|a.get("profileUuid").and_then(|x|x.as_str()).unwrap_or("").cmp(b.get("profileUuid").and_then(|x|x.as_str()).unwrap_or(""))
  .then(a.get("accountType").and_then(|x|x.as_str()).unwrap_or("").cmp(b.get("accountType").and_then(|x|x.as_str()).unwrap_or(""))));
 let events=snapshot.as_ref().map(|rt|rt.events.iter().cloned().collect::<Vec<_>>()).unwrap_or_default();
 serde_json::json!({
  "legacyService":LEGACY_SERVICE,
  "canonicalService":CANONICAL_SERVICE,
  "backendReads":total_reads,"backendWrites":total_writes,"backendDeletes":total_deletes,
  "legacyBackendReads":LEGACY_BACKEND_READS.load(Ordering::SeqCst),
  "canonicalBackendReads":CANONICAL_BACKEND_READS.load(Ordering::SeqCst),
  "canonicalBackendWrites":CANONICAL_BACKEND_WRITES.load(Ordering::SeqCst),
  "canonicalBackendDeletes":CANONICAL_BACKEND_DELETES.load(Ordering::SeqCst),
  "interactiveUiRequestsBlocked":INTERACTIVE_UI_REQUESTS_BLOCKED.load(Ordering::SeqCst),
  "legacyReconnectRequired":LEGACY_RECONNECT_REQUIRED_COUNT.load(Ordering::SeqCst),
  "aclMutations":0,
  "cacheHits":cache_hits,"cacheMisses":cache_misses,
  "migrationAttempts":migration_attempts,"migrationSuccesses":migration_successes,"migrationFailures":migration_failures,
  "accounts":accounts,"events":events,
  "secretValuesIncluded":false
 })
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
  if let Ok(mut c)=canonical_cache().lock(){c.clear();}
  if let Ok(mut d)=canonical_denied().lock(){d.clear();}
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
 fn same_value_write_is_suppressed_for_the_process_session(){
  let _guard=keychain_test_guard();
  use std::sync::atomic::{AtomicUsize,Ordering as AO};
  static WRITES:AtomicUsize=AtomicUsize::new(0);let account="test.cache.same-write";invalidate_secret_cache(account);WRITES.store(0,AO::SeqCst);
  remember_secret(account,"same");
  set_secret_if_changed_with(account,"same",|_,_|{WRITES.fetch_add(1,AO::SeqCst);Ok(())}).unwrap();
  assert_eq!(WRITES.load(AO::SeqCst),0);
  set_secret_if_changed_with(account,"changed",|_,_|{WRITES.fetch_add(1,AO::SeqCst);Ok(())}).unwrap();
  assert_eq!(WRITES.load(AO::SeqCst),1);
  invalidate_secret_cache(account);
 }
 #[test]
 fn canonical_session_cache_avoids_second_backend_read_model(){
  let _guard=keychain_test_guard();
  let account="oauth.test.refresh_token";
  if let Ok(mut c)=canonical_cache().lock(){c.insert(account.to_string(),"secret".to_string());}
  let before=CANONICAL_BACKEND_READS.load(Ordering::SeqCst);
  assert_eq!(canonical_get_secret_cached(account).unwrap().as_deref(),Some("secret"));
  assert_eq!(canonical_get_secret_cached(account).unwrap().as_deref(),Some("secret"));
  assert_eq!(CANONICAL_BACKEND_READS.load(Ordering::SeqCst),before);
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
 fn runtime_diagnostics_never_contains_secret_values(){
  let _guard=keychain_test_guard();
  remember_secret("oauth.11111111-1111-4111-8111-111111111111.refresh_token","SUPER_SECRET_VALUE");
  record_runtime("oauth.11111111-1111-4111-8111-111111111111.refresh_token","CACHE_HIT","HIT",None,None);
  let text=security_keychain_runtime_diagnostics().to_string();
  assert!(!text.contains("SUPER_SECRET_VALUE"));
  assert!(text.contains("refresh_token"));
 }
 #[test]
 #[cfg(target_os="macos")]
 fn keychain_diagnostics_is_passive_and_no_ui(){
  let _guard=keychain_test_guard();
  let before_reads=CANONICAL_BACKEND_READS.load(Ordering::SeqCst);
  let before_writes=CANONICAL_BACKEND_WRITES.load(Ordering::SeqCst);
  let before_deletes=CANONICAL_BACKEND_DELETES.load(Ordering::SeqCst);
  let v=security_keychain_diagnostics().unwrap();
  assert_eq!(v.get("ok").and_then(|x|x.as_bool()),Some(true));
  assert_eq!(v.get("status").and_then(|x|x.as_str()),Some("NO_UI_POLICY_ACTIVE"));
  assert_eq!(v.get("secretValuesIncluded").and_then(|x|x.as_bool()),Some(false));
  assert_eq!(v.get("secretReads").and_then(|x|x.as_u64()),Some(0));
  assert_eq!(v.get("secretWrites").and_then(|x|x.as_u64()),Some(0));
  assert_eq!(CANONICAL_BACKEND_READS.load(Ordering::SeqCst),before_reads);
  assert_eq!(CANONICAL_BACKEND_WRITES.load(Ordering::SeqCst),before_writes);
  assert_eq!(CANONICAL_BACKEND_DELETES.load(Ordering::SeqCst),before_deletes);
 }
 #[test]
 fn per_query_no_ui_policy_is_present_in_production_source(){
  let source=include_str!("security.rs");
  let ui_skip=["kSecUseAuthenticationUI","Skip"].concat();
  let copy=["SecItemCopy","Matching"].concat();
  let update=["SecItem","Update"].concat();
  let delete=["SecItem","Delete"].concat();
  let skip=["skip_authenticated_items","(true)"].concat();
  let old_get=["get_generic_","password("].concat();
  let old_set=["set_generic_","password("].concat();
  let old_delete=["delete_generic_","password("].concat();
  assert!(source.contains(&ui_skip));
  assert!(source.contains(&copy));
  assert!(source.contains(&update));
  assert!(source.contains(&delete));
  assert!(source.matches(&skip).count()>=2);
  assert!(!source.contains(&old_get));
  assert!(!source.contains(&old_set));
  assert!(!source.contains(&old_delete));
  let diag=source.split("pub fn security_keychain_diagnostics()").nth(1).unwrap().split("pub fn security_keychain_runtime_diagnostics()").next().unwrap();
  assert!(!diag.contains("canonical_get_secret("));
  assert!(!diag.contains("canonical_set_secret("));
  assert!(!diag.contains("canonical_delete_secret("));
  assert!(diag.contains("\"secretReads\":0"));
  assert!(diag.contains("\"secretWrites\":0"));
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
 q.class(ItemClass::generic_password()).service(SERVICE).load_attributes(true).limit(Limit::All).cloud_sync(None::<bool>).skip_authenticated_items(true);
 if let Some(a)=account{q.account(a);}
 with_keychain_no_ui(||match q.search(){
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
 })
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
#[cfg(target_os="windows")]
pub fn list_secret_accounts(prefix:&str)->Result<Vec<String>,String>{windows_list_accounts(SERVICE,prefix)}
#[cfg(all(not(target_os="macos"),not(target_os="windows")))]
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
 if secret_cache().lock().map(|c|c.contains_key(account)).unwrap_or(false){return KeychainProbe{status:KeychainReadStatus::Found,osstatus:None}}
 match native_attributes(Some(account)){
  Ok(rows) if !rows.is_empty()=>KeychainProbe{status:KeychainReadStatus::Found,osstatus:None},
  Ok(_)=>KeychainProbe{status:KeychainReadStatus::NotFound,osstatus:None},
  Err(e)=>KeychainProbe{status:KeychainReadStatus::ReadFailed,osstatus:inventory_osstatus(&e)},
 }
}
#[cfg(not(target_os="macos"))]
pub fn probe_secret(_account:&str)->KeychainProbe{KeychainProbe{status:KeychainReadStatus::NotFound,osstatus:None}}



#[cfg(target_os="macos")]
fn native_attributes_for_service(service:&str,account:Option<&str>)->Result<Vec<std::collections::HashMap<String,String>>,String>{
 use security_framework::item::{ItemClass,ItemSearchOptions,Limit};
 let mut q=ItemSearchOptions::new();
 q.class(ItemClass::generic_password()).service(service).load_attributes(true).limit(Limit::All).cloud_sync(None::<bool>).skip_authenticated_items(true);
 if let Some(a)=account{q.account(a);}
 with_keychain_no_ui(||match q.search(){
  Ok(rows)=>{
   let mut out=Vec::with_capacity(rows.len());
   for row in rows{
    let attrs=row.simplify_dict().ok_or_else(||"KEYCHAIN_ENUM_FAILED: malformed native attributes".to_string())?;
    out.push(attrs);
   }
   Ok(out)
  }
  Err(e) if e.code()==ITEM_NOT_FOUND=>Ok(Vec::new()),
  Err(e)=>Err(format!("KEYCHAIN_ENUM_FAILED: service={service}; osstatus={}; detail={}",e.code(),e))
 })
}
#[cfg(not(target_os="macos"))]
fn native_attributes_for_service(_service:&str,_account:Option<&str>)->Result<Vec<std::collections::HashMap<String,String>>,String>{Ok(Vec::new())}

#[cfg(target_os="windows")]
pub fn list_canonical_secret_accounts(prefix:&str)->Result<Vec<String>,String>{windows_list_accounts(CANONICAL_SERVICE,prefix)}
#[cfg(not(target_os="windows"))]
pub fn list_canonical_secret_accounts(prefix:&str)->Result<Vec<String>,String>{
 let mut accounts=Vec::new();
 for attrs in native_attributes_for_service(CANONICAL_SERVICE,None)?{
  let Some(account)=attrs.get("acct").cloned() else{continue};
  if account.starts_with(prefix)&&!accounts.iter().any(|x|x==&account){accounts.push(account)}
 }
 accounts.sort();Ok(accounts)
}
pub fn list_legacy_secret_accounts(prefix:&str)->Result<Vec<String>,String>{list_secret_accounts(prefix)}

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
 let data_dir=crate::license::private_data_dir(&app).map_err(|e|format!("APP_DATA_DIR_FAILED: {e}"))?;
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
