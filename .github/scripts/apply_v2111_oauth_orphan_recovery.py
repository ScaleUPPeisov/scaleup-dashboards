#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')

def replace_once(path, old, new, label):
    p = root / path
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'{path}: missing anchor {label}')
    p.write_text(s.replace(old, new, 1))

def append_once(path, marker, addition):
    p = root / path
    s = p.read_text()
    if marker not in s:
        p.write_text(s + addition)

# Production macOS Keychain enumeration. `security dump-keychain` is called without -d,
# so only item metadata is parsed; password/token values are never printed or logged.
append_once('src-tauri/src/security.rs', 'pub fn list_secret_accounts(prefix:&str)', r'''

fn keychain_dump_attr(block:&str,name:&str)->Option<String>{
 let marker=format!("\"{name}\"<blob>=");
 for line in block.lines(){
  if let Some(pos)=line.find(&marker){
   let rhs=line[pos+marker.len()..].trim();
   if let Some(rest)=rhs.strip_prefix('"'){if let Some(end)=rest.find('"'){return Some(rest[..end].to_string())}}
  }
 }
 None
}
#[cfg(target_os="macos")]
pub fn list_secret_accounts(prefix:&str)->Result<Vec<String>,String>{
 let out=std::process::Command::new("/usr/bin/security").arg("dump-keychain").output().map_err(|e|format!("KEYCHAIN_ENUM_ERROR: {e}"))?;
 if !out.status.success(){return Err(format!("KEYCHAIN_ENUM_ERROR: security dump-keychain exit={}",out.status))}
 let mut text=String::from_utf8_lossy(&out.stdout).into_owned();text.push_str(&String::from_utf8_lossy(&out.stderr));
 let mut accounts=Vec::new();
 for block in text.split("keychain:"){
  if keychain_dump_attr(block,"svce").as_deref()!=Some(SERVICE){continue}
  if let Some(account)=keychain_dump_attr(block,"acct"){
   if account.starts_with(prefix)&&!accounts.iter().any(|x|x==&account){accounts.push(account)}
  }
 }
 Ok(accounts)
}
#[cfg(not(target_os="macos"))]
pub fn list_secret_accounts(_prefix:&str)->Result<Vec<String>,String>{Ok(Vec::new())}

#[cfg(target_os="macos")]
pub fn secret_modified_rank(account:&str)->Result<Option<String>,String>{
 let out=std::process::Command::new("/usr/bin/security").args(["find-generic-password","-s",SERVICE,"-a",account]).output().map_err(|e|format!("KEYCHAIN_METADATA_ERROR: {e}"))?;
 if !out.status.success(){return Ok(None)}
 let mut text=String::from_utf8_lossy(&out.stdout).into_owned();text.push_str(&String::from_utf8_lossy(&out.stderr));
 for line in text.lines().filter(|l|l.contains("\"mdat\"")){
  if let Some(end)=line.rfind('"'){if let Some(start)=line[..end].rfind('"'){
   let digits:String=line[start+1..end].chars().filter(|c|c.is_ascii_digit()).take(14).collect();
   if digits.len()==14{return Ok(Some(digits))}
  }}
 }
 Ok(None)
}
#[cfg(not(target_os="macos"))]
pub fn secret_modified_rank(_account:&str)->Result<Option<String>,String>{Ok(None)}
''')

replace_once('src-tauri/src/youtube.rs',
'''trait OAuthSecretStore{fn get(&self,account:&str)->Result<Option<String>,String>;fn set(&self,account:&str,value:&str)->Result<(),String>;fn delete(&self,account:&str)->Result<(),String>;}
struct KeychainOAuthSecretStore;
impl OAuthSecretStore for KeychainOAuthSecretStore{
 fn get(&self,account:&str)->Result<Option<String>,String>{security::get_secret(account)}
 fn set(&self,account:&str,value:&str)->Result<(),String>{security::set_secret(account,value)}
 fn delete(&self,account:&str)->Result<(),String>{security::delete_secret(account)}
}
''',
'''trait OAuthSecretStore{
 fn get(&self,account:&str)->Result<Option<String>,String>;
 fn set(&self,account:&str,value:&str)->Result<(),String>;
 fn delete(&self,account:&str)->Result<(),String>;
 fn accounts(&self,_prefix:&str)->Result<Vec<String>,String>{Ok(Vec::new())}
 fn modified_rank(&self,_account:&str)->Result<Option<String>,String>{Ok(None)}
}
struct KeychainOAuthSecretStore;
impl OAuthSecretStore for KeychainOAuthSecretStore{
 fn get(&self,account:&str)->Result<Option<String>,String>{security::get_secret(account)}
 fn set(&self,account:&str,value:&str)->Result<(),String>{security::set_secret(account,value)}
 fn delete(&self,account:&str)->Result<(),String>{security::delete_secret(account)}
 fn accounts(&self,prefix:&str)->Result<Vec<String>,String>{security::list_secret_accounts(prefix)}
 fn modified_rank(&self,account:&str)->Result<Option<String>,String>{security::secret_modified_rank(account)}
}
''','OAuthSecretStore enumeration')

replace_once('src-tauri/src/youtube.rs',
'let profile_id=existing.as_ref().map(|p|p.id.clone()).unwrap_or_else(||Uuid::new_v4().to_string());',
'let profile_id=reconnect_profile_id(existing.as_ref());',
'reconnect profile UUID')

anchor='''async fn validate_profile_identity(app:&AppHandle,profile:&mut OAuthProfile,token:&str)->Result<(),String>{'''
insertion=r'''
fn reconnect_profile_id(existing:Option<&OAuthProfile>)->String{existing.map(|p|p.id.clone()).unwrap_or_else(||Uuid::new_v4().to_string())}

#[derive(Clone,Debug)]
struct OrphanCredentialCandidate{profile_id:String,refresh_token:String,client_secret:String,modified_rank:Option<String>}
#[derive(Clone,Debug)]
struct ValidatedOrphanCredential{candidate:OrphanCredentialCandidate,access_token:String,expires_in:i64,channel_id:String,channel_title:Option<String>}

fn orphan_profile_id(account:&str)->Option<String>{
 let id=account.strip_prefix("oauth.")?.strip_suffix(".refresh_token")?;
 if id.is_empty()||Uuid::parse_str(id).is_err(){return None}
 Some(id.to_string())
}
fn orphan_keychain_candidates_with<S:OAuthSecretStore>(secrets:&S,current:&OAuthProfile)->Result<Vec<OrphanCredentialCandidate>,String>{
 let mut out=Vec::new();
 for account in secrets.accounts("oauth.")?{
  let Some(id)=orphan_profile_id(&account) else{continue};if id==current.id{continue}
  let refresh=match secrets.get(&account){Ok(Some(v)) if !v.trim().is_empty()=>v,_=>continue};
  let client_secret=secrets.get(&oauth_key(&id,"client_secret")).ok().flatten().filter(|v|!v.trim().is_empty()).unwrap_or_else(||current.client_secret.clone());
  let modified_rank=secrets.modified_rank(&account).ok().flatten();
  out.push(OrphanCredentialCandidate{profile_id:id,refresh_token:refresh,client_secret,modified_rank});
 }
 Ok(out)
}
fn legacy_json_candidates(store:&OAuthStore,current:&OAuthProfile)->Vec<OrphanCredentialCandidate>{
 let expected=current.channel_id.as_deref();let mut out=Vec::new();
 for p in &store.profiles{
  if p.id==current.id||p.channel_id.as_deref()!=expected||p.refresh_token.trim().is_empty(){continue}
  let rank=Some(p.connected_at.chars().filter(|c|c.is_ascii_digit()).take(14).collect::<String>());
  out.push(OrphanCredentialCandidate{profile_id:p.id.clone(),refresh_token:p.refresh_token.clone(),client_secret:if p.client_secret.trim().is_empty(){current.client_secret.clone()}else{p.client_secret.clone()},modified_rank:rank});
 }
 out
}
fn merge_orphan_candidates(mut a:Vec<OrphanCredentialCandidate>,b:Vec<OrphanCredentialCandidate>)->Vec<OrphanCredentialCandidate>{
 for c in b{if !a.iter().any(|x|x.profile_id==c.profile_id){a.push(c)}}a
}
async fn select_orphan_candidate_with<V,Fut>(candidates:Vec<OrphanCredentialCandidate>,expected_channel_id:&str,validator:V)->Result<Option<ValidatedOrphanCredential>,String>
where V:Fn(OrphanCredentialCandidate)->Fut,Fut:std::future::Future<Output=Result<ValidatedOrphanCredential,String>>{
 let mut matched=Vec::new();
 for candidate in candidates{match validator(candidate).await{Ok(v) if v.channel_id==expected_channel_id=>matched.push(v),Ok(_)=>{},Err(_)=>{}}}
 if matched.is_empty(){return Ok(None)}
 matched.sort_by(|a,b|b.candidate.modified_rank.cmp(&a.candidate.modified_rank));
 if matched.len()>1{
  let first=matched[0].candidate.modified_rank.as_deref();let second=matched[1].candidate.modified_rank.as_deref();
  if first.is_none()||first==second{return Err(format!("OAUTH_ORPHAN_AMBIGUOUS: multiple validated credentials match channel {} but latest credential cannot be proven",expected_channel_id))}
 }
 Ok(Some(matched.remove(0)))
}
fn migrate_validated_orphan_with<S:OAuthSecretStore>(secrets:&S,current:&mut OAuthProfile,validated:&ValidatedOrphanCredential)->Result<(),String>{
 let old=&validated.candidate;
 secrets.set(&oauth_key(&current.id,"refresh_token"),&old.refresh_token)?;
 secrets.set(&oauth_key(&current.id,"access_token"),&validated.access_token)?;
 if !old.client_secret.trim().is_empty(){secrets.set(&oauth_key(&current.id,"client_secret"),&old.client_secret)?;current.client_secret=old.client_secret.clone()}
 current.refresh_token=old.refresh_token.clone();current.access_token=validated.access_token.clone();current.expires_at=now_ts()+validated.expires_in;
 current.channel_title=validated.channel_title.clone().or_else(||current.channel_title.clone());current.identity_validated_channel_id=Some(validated.channel_id.clone());current.identity_validated_at=Some(Utc::now().to_rfc3339());current.credential_error=None;
 let reread=secrets.get(&oauth_key(&current.id,"refresh_token"))?.unwrap_or_default();if reread.trim().is_empty(){return Err("OAUTH_MIGRATION_VERIFY_FAILED: current refresh_token is still missing after validated migration".into())}
 Ok(())
}
async fn validate_orphan_candidate_live(app:&AppHandle,current:&OAuthProfile,candidate:OrphanCredentialCandidate)->Result<ValidatedOrphanCredential,String>{
 let mut form=vec![("client_id",current.client_id.as_str()),("refresh_token",candidate.refresh_token.as_str()),("grant_type","refresh_token")];if !candidate.client_secret.trim().is_empty(){form.push(("client_secret",candidate.client_secret.as_str()))}
 let r=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&form).send().await.map_err(|e|format!("OAUTH_NETWORK_ERROR: orphan token refresh: {e}"))?;let status=r.status();let v:Value=r.json().await.map_err(|e|format!("OAUTH_REFRESH_JSON_ERROR: {e}"))?;if !status.is_success(){return Err(oauth_refresh_error(&v))}
 let access=v.get("access_token").and_then(Value::as_str).ok_or_else(||"OAUTH_REFRESH_FAILED: orphan credential refresh returned no access_token".to_string())?.to_string();let expires=v.get("expires_in").and_then(Value::as_i64).unwrap_or(3600);
 emit_youtube_api_request(app,"channels.list",None);let identity=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(&access).query(&[("part","snippet"),("mine","true")]).send().await.map_err(|e|format!("OAUTH_NETWORK_ERROR: orphan identity validation: {e}"))?;let identity_status=identity.status();let iv:Value=identity.json().await.map_err(|e|format!("OAUTH_IDENTITY_JSON_ERROR: {e}"))?;if !identity_status.is_success(){return Err(youtube_error(&iv,"OAUTH_IDENTITY_FAILED: orphan credential identity check failed"))}
 let item=iv.get("items").and_then(Value::as_array).and_then(|a|a.first()).ok_or_else(||"OAUTH_CHANNEL_MISSING: orphan credential returned no YouTube channel".to_string())?;let channel_id=item.get("id").and_then(Value::as_str).ok_or_else(||"OAUTH_CHANNEL_MISSING: orphan credential returned no channel ID".to_string())?.to_string();let channel_title=item.pointer("/snippet/title").and_then(Value::as_str).map(str::to_string);
 Ok(ValidatedOrphanCredential{candidate,access_token:access,expires_in:expires,channel_id,channel_title})
}
async fn recover_orphan_credential_live(app:&AppHandle,store:&mut OAuthStore,idx:usize)->Result<bool,String>{
 let current=store.profiles[idx].clone();let expected=current.channel_id.clone().ok_or_else(||"OAUTH_CHANNEL_MISSING: current profile has no expected channel_id".to_string())?;let secrets=KeychainOAuthSecretStore;
 let keychain=orphan_keychain_candidates_with(&secrets,&current)?;let json=legacy_json_candidates(store,&current);let candidates=merge_orphan_candidates(keychain,json);if candidates.is_empty(){return Ok(false)}
 let app_cloned=app.clone();let current_cloned=current.clone();let selected=select_orphan_candidate_with(candidates,&expected,move |candidate|{let app2=app_cloned.clone();let current2=current_cloned.clone();async move{validate_orphan_candidate_live(&app2,&current2,candidate).await}}).await?;
 let Some(validated)=selected else{return Ok(false)};migrate_validated_orphan_with(&secrets,&mut store.profiles[idx],&validated)?;save_store(app,store)?;
 Ok(!security::get_secret(&oauth_key(&store.profiles[idx].id,"refresh_token"))?.unwrap_or_default().trim().is_empty())
}

'''
replace_once('src-tauri/src/youtube.rs',anchor,insertion+anchor,'orphan recovery implementation')

replace_once('src-tauri/src/youtube.rs',
''' let mut s=load_store(app)?;let idx=s.profiles.iter().position(|p|p.id==profile_id).ok_or_else(||"CREDENTIAL_MISSING: YouTube OAuth профиль отсутствует во всех current/legacy storage locations".to_string())?;if let Some(e)=s.profiles[idx].credential_error.clone(){return Err(e)}
 let needs_identity=s.profiles[idx].identity_validated_at.is_none()||s.profiles[idx].identity_validated_channel_id.as_deref()!=s.profiles[idx].channel_id.as_deref();
''',
''' let mut s=load_store(app)?;let idx=s.profiles.iter().position(|p|p.id==profile_id).ok_or_else(||"CREDENTIAL_MISSING: YouTube OAuth профиль отсутствует во всех current/legacy storage locations".to_string())?;if let Some(e)=s.profiles[idx].credential_error.clone(){return Err(e)}
 if s.profiles[idx].refresh_token.trim().is_empty(){if !recover_orphan_credential_live(app,&mut s,idx).await?{return Err("REFRESH_TOKEN_MISSING: refresh_token отсутствует во всех current/legacy credential locations".into())}}
 let needs_identity=s.profiles[idx].identity_validated_at.is_none()||s.profiles[idx].identity_validated_channel_id.as_deref()!=s.profiles[idx].channel_id.as_deref();
''','valid_access_token orphan recovery hook')

p=root/'src-tauri/src/youtube.rs';s=p.read_text()
if 'mod v2111_orphan_recovery_tests' not in s:
    s += r'''

#[cfg(test)]
mod v2111_orphan_recovery_tests{
 use super::*;use std::{cell::RefCell,collections::HashMap};
 const OLD_A:&str="11111111-1111-4111-8111-111111111111";const OLD_B:&str="22222222-2222-4222-8222-222222222222";const OLD_C:&str="33333333-3333-4333-8333-333333333333";const NEW_A:&str="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 #[derive(Default)]struct FakeSecrets{values:RefCell<HashMap<String,String>>,ranks:RefCell<HashMap<String,String>>}
 impl OAuthSecretStore for FakeSecrets{
  fn get(&self,a:&str)->Result<Option<String>,String>{Ok(self.values.borrow().get(a).cloned())}
  fn set(&self,a:&str,v:&str)->Result<(),String>{self.values.borrow_mut().insert(a.into(),v.into());Ok(())}
  fn delete(&self,a:&str)->Result<(),String>{self.values.borrow_mut().remove(a);Ok(())}
  fn accounts(&self,prefix:&str)->Result<Vec<String>,String>{Ok(self.values.borrow().keys().filter(|k|k.starts_with(prefix)).cloned().collect())}
  fn modified_rank(&self,a:&str)->Result<Option<String>,String>{Ok(self.ranks.borrow().get(a).cloned())}
 }
 fn p(id:&str,channel:&str)->OAuthProfile{OAuthProfile{id:id.into(),client_id:"client-A".into(),client_secret:"current-secret".into(),channel_id:Some(channel.into()),channel_title:Some(channel.into()),access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:"2026-09-01T00:00:00Z".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None}}
 fn validated(c:OrphanCredentialCandidate,channel:&str)->ValidatedOrphanCredential{ValidatedOrphanCredential{candidate:c,access_token:format!("access-{channel}"),expires_in:3600,channel_id:channel.into(),channel_title:Some(channel.into())}}
 fn channel_for(refresh:&str)->&'static str{match refresh{"refresh-A"=>"CHANNEL_A","refresh-B"=>"CHANNEL_B","refresh-C"=>"CHANNEL_C",_=>"UNKNOWN"}}
 fn select(candidates:Vec<OrphanCredentialCandidate>,expected:&str)->Result<Option<ValidatedOrphanCredential>,String>{tauri::async_runtime::block_on(select_orphan_candidate_with(candidates,expected,|c|async move{let ch=channel_for(&c.refresh_token);Ok(validated(c,ch))}))}
 #[test]fn a_orphan_uuid_recovery(){let sec=FakeSecrets::default();sec.set(&oauth_key(OLD_A,"refresh_token"),"refresh-A").unwrap();sec.set(&oauth_key(OLD_A,"client_secret"),"old-secret").unwrap();sec.ranks.borrow_mut().insert(oauth_key(OLD_A,"refresh_token"),"20260910120000".into());let mut cur=p(NEW_A,"CHANNEL_A");let candidates=orphan_keychain_candidates_with(&sec,&cur).unwrap();assert_eq!(candidates.len(),1);let v=select(candidates,"CHANNEL_A").unwrap().unwrap();migrate_validated_orphan_with(&sec,&mut cur,&v).unwrap();assert_eq!(sec.get(&oauth_key(NEW_A,"refresh_token")).unwrap().as_deref(),Some("refresh-A"));assert_eq!(sec.get(&oauth_key(OLD_A,"refresh_token")).unwrap().as_deref(),Some("refresh-A"));assert_eq!(cur.identity_validated_channel_id.as_deref(),Some("CHANNEL_A"))}
 #[test]fn b_wrong_channel_rejection(){let sec=FakeSecrets::default();sec.set(&oauth_key(OLD_B,"refresh_token"),"refresh-B").unwrap();let cur=p(NEW_A,"CHANNEL_A");let v=select(orphan_keychain_candidates_with(&sec,&cur).unwrap(),"CHANNEL_A").unwrap();assert!(v.is_none());assert!(sec.get(&oauth_key(NEW_A,"refresh_token")).unwrap().is_none())}
 #[test]fn c_multiple_orphan_matching(){let sec=FakeSecrets::default();for(id,token,rank)in[(OLD_A,"refresh-B","20260910110000"),(OLD_B,"refresh-A","20260910120000"),(OLD_C,"refresh-C","20260910130000")]{sec.set(&oauth_key(id,"refresh_token"),token).unwrap();sec.ranks.borrow_mut().insert(oauth_key(id,"refresh_token"),rank.into())}let cur=p(NEW_A,"CHANNEL_A");let v=select(orphan_keychain_candidates_with(&sec,&cur).unwrap(),"CHANNEL_A").unwrap().unwrap();assert_eq!(v.candidate.profile_id,OLD_B)}
 #[test]fn d_v208_json_recovery(){let legacy=r#"{"profiles":[{"id":"11111111-1111-4111-8111-111111111111","client_id":"client-A","client_secret":"legacy-secret","channel_id":"CHANNEL_A","channel_title":"A","access_token":"legacy-access","refresh_token":"refresh-A","expires_at":0,"connected_at":"2026-08-31T12:34:56Z","scopes":[],"preferred_browser":"default"}]}"#;let mut store:OAuthStore=serde_json::from_str(legacy).unwrap();let mut cur=p(NEW_A,"CHANNEL_A");let candidates=legacy_json_candidates(&store,&cur);assert_eq!(candidates.len(),1);let v=select(candidates,"CHANNEL_A").unwrap().unwrap();let sec=FakeSecrets::default();migrate_validated_orphan_with(&sec,&mut cur,&v).unwrap();assert_eq!(sec.get(&oauth_key(NEW_A,"refresh_token")).unwrap().as_deref(),Some("refresh-A"));assert_eq!(store.profiles[0].refresh_token,"refresh-A");store.profiles.push(cur);assert_eq!(store.profiles.len(),2)}
 #[test]fn e_refresh_token_preservation(){let mut old=p(NEW_A,"CHANNEL_A");old.refresh_token="keep-refresh".into();assert_eq!(preserved_refresh_token(Some(&old),"client-A",None).unwrap(),"keep-refresh");assert_eq!(preserved_refresh_token(Some(&old),"client-A",Some("   ")).unwrap(),"keep-refresh");assert_eq!(preserved_refresh_token(Some(&old),"client-A",Some("new-refresh")).unwrap(),"new-refresh")}
 #[test]fn f_reconnect_uuid_consistency(){let old=p(NEW_A,"CHANNEL_A");assert_eq!(reconnect_profile_id(Some(&old)),NEW_A);let created=reconnect_profile_id(None);assert!(Uuid::parse_str(&created).is_ok());assert_ne!(created,NEW_A)}
 #[test]fn g_idempotency(){let sec=FakeSecrets::default();sec.set(&oauth_key(OLD_A,"refresh_token"),"refresh-A").unwrap();let mut cur=p(NEW_A,"CHANNEL_A");let c=orphan_keychain_candidates_with(&sec,&cur).unwrap();let v=select(c,"CHANNEL_A").unwrap().unwrap();migrate_validated_orphan_with(&sec,&mut cur,&v).unwrap();let count=sec.values.borrow().len();migrate_validated_orphan_with(&sec,&mut cur,&v).unwrap();assert_eq!(sec.values.borrow().len(),count);assert_eq!(sec.get(&oauth_key(OLD_A,"refresh_token")).unwrap().as_deref(),Some("refresh-A"));assert_eq!(sec.get(&oauth_key(NEW_A,"refresh_token")).unwrap().as_deref(),Some("refresh-A"))}
 #[test]fn h_thirty_one_channel_isolation(){let sec=FakeSecrets::default();let mut profiles=Vec::new();for i in 0..31{let id=format!("{:08x}-0000-4000-8000-{:012x}",i+1,i+1);let mut x=p(&id,&format!("CHANNEL_{i}"));if i<29{x.refresh_token=format!("current-{i}");sec.set(&oauth_key(&x.id,"refresh_token"),&x.refresh_token).unwrap()}profiles.push(x)}let orphan_id="99999999-9999-4999-8999-999999999999";sec.set(&oauth_key(orphan_id,"refresh_token"),"refresh-A").unwrap();sec.ranks.borrow_mut().insert(oauth_key(orphan_id,"refresh_token"),"20260910140000".into());profiles[29].channel_id=Some("CHANNEL_A".into());for i in 29..31{if profiles[i].refresh_token.is_empty(){let candidates=orphan_keychain_candidates_with(&sec,&profiles[i]).unwrap();if let Some(v)=select(candidates,profiles[i].channel_id.as_deref().unwrap()).unwrap(){migrate_validated_orphan_with(&sec,&mut profiles[i],&v).unwrap()}}}assert_eq!(profiles.iter().filter(|p|!p.refresh_token.is_empty()).count(),30);assert!(profiles[30].refresh_token.is_empty());assert_eq!(sec.get(&oauth_key(orphan_id,"refresh_token")).unwrap().as_deref(),Some("refresh-A"))}
}
'''
    p.write_text(s)

print('VYRON OAuth orphan recovery production patch applied')
