#!/usr/bin/env python3
from pathlib import Path
import sys,re

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p): return (ROOT/p).read_text()
def w(p,s): (ROOT/p).write_text(s)
def need(p,s,needle):
    if needle not in s: raise SystemExit(f'v209 security missing anchor {p}: {needle[:180]!r}')

# -----------------------------------------------------------------------------
# macOS Keychain + private-file primitives.
# -----------------------------------------------------------------------------
w('src-tauri/src/security.rs',r'''use std::{fs,path::Path};

const SERVICE:&str="com.scaleup.vyron.security";
const ITEM_NOT_FOUND:i32=-25300;

#[cfg(target_os="macos")]
pub fn set_secret(account:&str,value:&str)->Result<(),String>{
 use security_framework::passwords::{delete_generic_password,set_generic_password};
 if value.is_empty(){
  match delete_generic_password(SERVICE,account){Ok(())=>Ok(()),Err(e) if e.code()==ITEM_NOT_FOUND=>Ok(()),Err(e)=>Err(format!("Keychain delete {account}: {e}"))}
 }else{set_generic_password(SERVICE,account,value.as_bytes()).map_err(|e|format!("Keychain write {account}: {e}"))}
}
#[cfg(not(target_os="macos"))]
pub fn set_secret(_account:&str,_value:&str)->Result<(),String>{Err("VYRON secure storage requires macOS Keychain".into())}

#[cfg(target_os="macos")]
pub fn get_secret(account:&str)->Result<Option<String>,String>{
 use security_framework::passwords::get_generic_password;
 match get_generic_password(SERVICE,account){
  Ok(v)=>String::from_utf8(v).map(Some).map_err(|_|format!("Keychain value {account} is not UTF-8")),
  Err(e) if e.code()==ITEM_NOT_FOUND=>Ok(None),
  Err(e)=>Err(format!("Keychain read {account}: {e}")),
 }
}
#[cfg(not(target_os="macos"))]
pub fn get_secret(_account:&str)->Result<Option<String>,String>{Ok(None)}

pub fn delete_secret(account:&str)->Result<(),String>{set_secret(account,"")}

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
 #[test]
 #[cfg(target_os="macos")]
 fn keychain_roundtrip(){
  use std::time::{SystemTime,UNIX_EPOCH};
  let id=format!("test-{}-{}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos());
  set_secret(&id,"vyron-secret-roundtrip").unwrap();
  assert_eq!(get_secret(&id).unwrap().as_deref(),Some("vyron-secret-roundtrip"));
  delete_secret(&id).unwrap();
  assert!(get_secret(&id).unwrap().is_none());
 }
}
''')

# Cargo dependency (macOS-only app; regular dependency keeps generated Cargo simple).
p='src-tauri/Cargo.toml';s=r(p)
if 'security-framework' not in s:
    anchor='[dependencies]'
    need(p,s,anchor)
    s=s.replace(anchor,anchor+'\nsecurity-framework = "3.7.0"',1)
w(p,s)

# Register internal module only; no extra public IPC command is added.
p='src-tauri/src/lib.rs';s=r(p)
if 'mod security;' not in s:
    need(p,s,'mod storage;')
    s=s.replace('mod storage;','mod storage;\nmod security;',1)
w(p,s)

# -----------------------------------------------------------------------------
# State persistence: secrets are in Keychain at rest and rehydrated only in RAM.
# Migration is fail-safe: the old state file is not sanitized until Keychain writes
# succeed. Existing backup is overwritten with sanitized state after first migration.
# -----------------------------------------------------------------------------
p='src-tauri/src/storage.rs';s=r(p)
if 'use crate::security;' not in s:s='use crate::security;\n'+s

insert='''
const STATE_YOUTUBE_API_KEY:&str="state.youtubeApiKey";
const STATE_OPENAI_API_KEY:&str="state.openaiApiKey";

fn state_secret(state:&Value,key:&str)->String{state.get("settings").and_then(Value::as_object).and_then(|x|x.get(key)).and_then(Value::as_str).unwrap_or("").to_string()}
fn set_state_secret(state:&mut Value,key:&str,value:&str){if let Some(x)=state.get_mut("settings").and_then(Value::as_object_mut){x.insert(key.into(),json!(value));}}

fn secure_state_for_disk(state:&Value)->Result<(Value,bool),String>{
 let mut disk=state.clone();let mut migrated=false;
 for (field,account) in [("youtubeApiKey",STATE_YOUTUBE_API_KEY),("openaiApiKey",STATE_OPENAI_API_KEY)]{
  let value=state_secret(state,field);
  if !value.is_empty(){security::set_secret(account,&value)?;migrated=true;}
  set_state_secret(&mut disk,field,"");
 }
 Ok((disk,migrated))
}
fn hydrate_state_secrets(mut state:Value)->Value{
 for (field,account) in [("youtubeApiKey",STATE_YOUTUBE_API_KEY),("openaiApiKey",STATE_OPENAI_API_KEY)]{
  if let Ok(Some(value))=security::get_secret(account){set_state_secret(&mut state,field,&value)}
 }
 state
}
'''
anchor='fn migrated_workspace_path(raw: &str) -> Option<PathBuf> {'
need(p,s,anchor)
if 'STATE_YOUTUBE_API_KEY' not in s:s=s.replace(anchor,insert+'\n'+anchor,1)

# Private permissions for state + backup.
old='''    fs::rename(tmp, path).map_err(|e| e.to_string())?;
    Ok(())'''
new='''    fs::rename(tmp, path).map_err(|e| e.to_string())?;
    security::private_permissions(path)?;
    let bak = path.with_extension("bak");if bak.exists(){let _=security::private_permissions(&bak);}
    Ok(())'''
need(p,s,old);s=s.replace(old,new,1)

start=s.index('#[tauri::command]\npub fn load_state')
end=len(s)
new_tail=r'''#[tauri::command]
pub fn load_state(app: AppHandle) -> Value {
    let path = match state_file(&app) { Ok(p) => p, Err(_) => return default_state() };
    let raw = fs::read(&path).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok()).unwrap_or_else(default_state);
    let (state, changed) = migrate_state(raw);
    match secure_state_for_disk(&state){
      Ok((disk,migrated))=>{
        if changed||migrated{
          if atomic_write(&path,&disk).is_ok()&&migrated{
            let bak=path.with_extension("bak");let _=fs::copy(&path,&bak);let _=security::private_permissions(&bak);
          }
        }else if path.exists(){let _=security::private_permissions(&path);}
        hydrate_state_secrets(disk)
      },
      Err(_)=>{
        // Fail-safe compatibility path: keep the legacy file untouched if Keychain
        // migration is unavailable. Runtime remains usable and no data is destroyed.
        if changed{let _=atomic_write(&path,&state);}state
      }
    }
}

#[tauri::command]
pub fn save_state(app: AppHandle, state: Value) -> Result<(), String> {
    let p = state_file(&app)?;
    let (disk,_)=secure_state_for_disk(&state)?;
    atomic_write(&p,&disk)
}
'''
s=s[:start]+new_tail
w(p,s)

# -----------------------------------------------------------------------------
# YouTube OAuth + Google config: metadata stays in JSON, secret material goes to
# Keychain. Legacy plaintext files are sanitized only after ALL Keychain writes
# succeed. Runtime profiles are hydrated so all existing call sites stay unchanged.
# -----------------------------------------------------------------------------
p='src-tauri/src/youtube.rs';s=r(p)
if 'use crate::security;' not in s:s='use crate::security;\n'+s
old='struct OAuthProfile{id:String,client_id:String,#[serde(default)] client_secret:String,channel_id:Option<String>,channel_title:Option<String>,access_token:String,refresh_token:String,expires_at:i64,connected_at:String,#[serde(default)] scopes:Vec<String>,#[serde(default)] preferred_browser:String}'
new='struct OAuthProfile{id:String,client_id:String,#[serde(default,skip_serializing)] client_secret:String,channel_id:Option<String>,channel_title:Option<String>,#[serde(default,skip_serializing)] access_token:String,#[serde(default,skip_serializing)] refresh_token:String,expires_at:i64,connected_at:String,#[serde(default)] scopes:Vec<String>,#[serde(default)] preferred_browser:String}'
need(p,s,old);s=s.replace(old,new,1)

start=s.index('fn load_store(app:&AppHandle)->Result<OAuthStore,String>{')
end=s.index('#[derive(Debug,Clone,Serialize,Deserialize,Default)]\nstruct GoogleConfig',start)
oauth_block=r'''fn oauth_key(id:&str,kind:&str)->String{format!("oauth.{id}.{kind}")}
fn write_profile_secrets(p:&OAuthProfile)->Result<(),String>{
 for (kind,value) in [("client_secret",p.client_secret.as_str()),("access_token",p.access_token.as_str()),("refresh_token",p.refresh_token.as_str())]{if !value.is_empty(){security::set_secret(&oauth_key(&p.id,kind),value)?;}}
 Ok(())
}
fn hydrate_profile_secrets(p:&mut OAuthProfile)->Result<(),String>{
 if p.client_secret.is_empty(){p.client_secret=security::get_secret(&oauth_key(&p.id,"client_secret"))?.unwrap_or_default()}
 if p.access_token.is_empty(){p.access_token=security::get_secret(&oauth_key(&p.id,"access_token"))?.unwrap_or_default()}
 if p.refresh_token.is_empty(){p.refresh_token=security::get_secret(&oauth_key(&p.id,"refresh_token"))?.unwrap_or_default()}
 Ok(())
}
fn delete_profile_secrets(id:&str)->Result<(),String>{for kind in ["client_secret","access_token","refresh_token"]{security::delete_secret(&oauth_key(id,kind))?;}Ok(())}
fn write_oauth_metadata(path:&Path,s:&OAuthStore)->Result<(),String>{let bytes=serde_json::to_vec_pretty(s).map_err(|e|format!("OAuth serialize: {e}"))?;security::write_private_atomic(path,&bytes)}

fn load_store(app:&AppHandle)->Result<OAuthStore,String>{
 let p=store_path(app)?;
 if !p.exists(){return Ok(OAuthStore::default())}
 let b=fs::read(&p).map_err(|e|format!("OAuth store read: {e}"))?;
 let mut store=match serde_json::from_slice::<OAuthStore>(&b){
  Ok(s)=>s,
  Err(_)=>{let backup=p.with_extension(format!("corrupt-{}.json",Utc::now().format("%Y%m%d%H%M%S")));let _=fs::rename(&p,&backup);let _=security::private_permissions(&backup);return Ok(OAuthStore::default())}
 };
 let legacy=store.profiles.iter().any(|x|!x.client_secret.is_empty()||!x.access_token.is_empty()||!x.refresh_token.is_empty());
 if legacy{
  // Do not rewrite plaintext until every Keychain write has succeeded.
  for profile in &store.profiles{write_profile_secrets(profile)?;}
  write_oauth_metadata(&p,&store)?;
 }else{let _=security::private_permissions(&p);}
 for profile in &mut store.profiles{hydrate_profile_secrets(profile)?;}
 Ok(store)
}
fn save_store(app:&AppHandle,s:&OAuthStore)->Result<(),String>{
 let p=store_path(app)?;
 for profile in &s.profiles{write_profile_secrets(profile)?;}
 write_oauth_metadata(&p,s)
}
'''
s=s[:start]+oauth_block+s[end:]

old='struct GoogleConfig{#[serde(default)] client_id:String,#[serde(default)] client_secret:String,#[serde(default)] project_id:String,#[serde(default)] api_key:String}'
new='struct GoogleConfig{#[serde(default)] client_id:String,#[serde(default,skip_serializing)] client_secret:String,#[serde(default)] project_id:String,#[serde(default,skip_serializing)] api_key:String}'
need(p,s,old);s=s.replace(old,new,1)

start=s.index('fn load_google_config(app:&AppHandle)->Result<GoogleConfig,String>{')
end=s.index('fn masked_client_id',start)
google_block=r'''const GOOGLE_CLIENT_SECRET:&str="google.client_secret";
const GOOGLE_API_KEY:&str="google.api_key";
fn hydrate_google_secrets(c:&mut GoogleConfig)->Result<(),String>{
 if c.client_secret.is_empty(){c.client_secret=security::get_secret(GOOGLE_CLIENT_SECRET)?.unwrap_or_default()}
 if c.api_key.is_empty(){c.api_key=security::get_secret(GOOGLE_API_KEY)?.unwrap_or_default()}
 Ok(())
}
fn write_google_secrets(c:&GoogleConfig)->Result<(),String>{if !c.client_secret.is_empty(){security::set_secret(GOOGLE_CLIENT_SECRET,&c.client_secret)?;}if !c.api_key.is_empty(){security::set_secret(GOOGLE_API_KEY,&c.api_key)?;}Ok(())}
fn write_google_metadata(path:&Path,c:&GoogleConfig)->Result<(),String>{let b=serde_json::to_vec_pretty(c).map_err(|e|e.to_string())?;security::write_private_atomic(path,&b)}
fn load_google_config(app:&AppHandle)->Result<GoogleConfig,String>{
 let p=google_config_path(app)?;if !p.exists(){let mut c=GoogleConfig::default();hydrate_google_secrets(&mut c)?;return Ok(c)}
 let b=fs::read(&p).map_err(|e|format!("Google config read: {e}"))?;let mut c:GoogleConfig=serde_json::from_slice(&b).map_err(|e|format!("Google config parse: {e}"))?;
 let legacy=!c.client_secret.is_empty()||!c.api_key.is_empty();
 if legacy{write_google_secrets(&c)?;write_google_metadata(&p,&c)?;}else{let _=security::private_permissions(&p);}
 hydrate_google_secrets(&mut c)?;Ok(c)
}
fn save_google_config(app:&AppHandle,c:&GoogleConfig)->Result<(),String>{let p=google_config_path(app)?;write_google_secrets(c)?;write_google_metadata(&p,c)}
'''
s=s[:start]+google_block+s[end:]

# Disconnect removes the corresponding Keychain entries as well.
old='pub fn youtube_oauth_disconnect(app:AppHandle,profile_id:String)->Result<(),String>{let mut s=load_store(&app)?;s.profiles.retain(|p|p.id!=profile_id);save_store(&app,&s)}'
new='pub fn youtube_oauth_disconnect(app:AppHandle,profile_id:String)->Result<(),String>{let mut s=load_store(&app)?;delete_profile_secrets(&profile_id)?;s.profiles.retain(|p|p.id!=profile_id);save_store(&app,&s)}'
need(p,s,old);s=s.replace(old,new,1)
w(p,s)

# -----------------------------------------------------------------------------
# Frontend redaction. This changes only representation of secret-like text; it
# does not change API arguments or application behavior.
# -----------------------------------------------------------------------------
w('src/securityRedaction.ts',r'''export function redactSensitive(value:unknown){
 let s=String(value??'');
 s=s.replace(/Bearer\s+[A-Za-z0-9._~+\/=\-]+/gi,'Bearer [REDACTED]');
 s=s.replace(/(access_token|refresh_token|client_secret|api_key|youtubeApiKey|openaiApiKey)\s*[:=]\s*["']?([^&\s"',}]+)/gi,'$1=[REDACTED]');
 s=s.replace(/AIza[0-9A-Za-z_-]{20,}/g,'AIza[REDACTED]');
 s=s.replace(/sk-[A-Za-z0-9_-]{16,}/g,'sk-[REDACTED]');
 return s
}
''')
w('src/securityRedaction.test.ts',r'''import {describe,expect,it} from 'vitest';import {redactSensitive} from './securityRedaction';
describe('security redaction',()=>{
 it('redacts bearer/oauth/google/openai secrets',()=>{const s=redactSensitive('Bearer abc.def access_token=secret refresh_token=refresh client_secret=hidden AIza123456789012345678901234 sk-1234567890abcdefghijkl');expect(s).not.toContain('abc.def');expect(s).not.toContain('secret');expect(s).not.toContain('refresh');expect(s).not.toContain('hidden');expect(s).toContain('[REDACTED]')});
 it('leaves ordinary diagnostics readable',()=>{expect(redactSensitive('Downloads: 40 images, ENDLUME ready')).toBe('Downloads: 40 images, ENDLUME ready')});
});
''')

p='src/store.ts';s=r(p)
anchor="import {notifyLegacy} from './notificationCenter';"
need(p,s,anchor)
if "from './securityRedaction'" not in s:s=s.replace(anchor,anchor+"\nimport {redactSensitive} from './securityRedaction';",1)
old="log:(message,level='info')=>{set(s=>({logs:[{at:new Date().toISOString(),level,message},...s.logs].slice(0,500)}));scheduleSave()},"
new="log:(message,level='info')=>{const safe=redactSensitive(message);set(s=>({logs:[{at:new Date().toISOString(),level,message:safe},...s.logs].slice(0,500)}));scheduleSave()},"
need(p,s,old);s=s.replace(old,new,1)
w(p,s)

p='src/notificationCenter.ts';s=r(p)
if "from './securityRedaction'" not in s:s="import {redactSensitive} from './securityRedaction';\n"+s
old="const detail:AppNotification={id:crypto.randomUUID(),operationId:options.operationId,type,title,message,durationMs:options.durationMs===undefined?defaults[type]:options.durationMs,actions:options.actions||[],createdAt:now};"
new="const detail:AppNotification={id:crypto.randomUUID(),operationId:options.operationId,type,title:redactSensitive(title),message:redactSensitive(message),durationMs:options.durationMs===undefined?defaults[type]:options.durationMs,actions:options.actions||[],createdAt:now};"
need(p,s,old);s=s.replace(old,new,1)
w(p,s)

print('VYRON 2.0.9 security hardening applied')
