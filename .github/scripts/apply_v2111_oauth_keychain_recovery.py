#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')

def replace_once(path, old, new, label):
    p=root/path; s=p.read_text()
    if old not in s:
        raise SystemExit(f'{path}: missing anchor {label}')
    p.write_text(s.replace(old,new,1))

# OAuth profile gains non-serialized runtime recovery diagnostics and one-time identity proof.
replace_once('src-tauri/src/youtube.rs',
'''#[derive(Debug,Clone,Serialize,Deserialize)]
struct OAuthProfile{id:String,client_id:String,#[serde(default,skip_serializing)] client_secret:String,channel_id:Option<String>,channel_title:Option<String>,#[serde(default,skip_serializing)] access_token:String,#[serde(default,skip_serializing)] refresh_token:String,expires_at:i64,connected_at:String,#[serde(default)] scopes:Vec<String>,#[serde(default)] preferred_browser:String}
''',
'''#[derive(Debug,Clone,Serialize,Deserialize)]
struct OAuthProfile{id:String,client_id:String,#[serde(default,skip_serializing)] client_secret:String,channel_id:Option<String>,channel_title:Option<String>,#[serde(default,skip_serializing)] access_token:String,#[serde(default,skip_serializing)] refresh_token:String,expires_at:i64,connected_at:String,#[serde(default)] scopes:Vec<String>,#[serde(default)] preferred_browser:String,#[serde(default)] identity_validated_at:Option<String>,#[serde(default)] identity_validated_channel_id:Option<String>,#[serde(skip)] credential_error:Option<String>}
''','OAuthProfile')

old='''fn oauth_key(id:&str,kind:&str)->String{format!("oauth.{id}.{kind}")}
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
new=r'''fn oauth_key(id:&str,kind:&str)->String{format!("oauth.{id}.{kind}")}
fn legacy_oauth_keys(id:&str,kind:&str)->Vec<String>{vec![format!("youtube_profile_{kind}::{id}"),format!("youtube_profile_{kind}:{id}")]}

trait OAuthSecretStore{fn get(&self,account:&str)->Result<Option<String>,String>;fn set(&self,account:&str,value:&str)->Result<(),String>;fn delete(&self,account:&str)->Result<(),String>;}
struct KeychainOAuthSecretStore;
impl OAuthSecretStore for KeychainOAuthSecretStore{
 fn get(&self,account:&str)->Result<Option<String>,String>{security::get_secret(account)}
 fn set(&self,account:&str,value:&str)->Result<(),String>{security::set_secret(account,value)}
 fn delete(&self,account:&str)->Result<(),String>{security::delete_secret(account)}
}
fn read_profile_secret_with<S:OAuthSecretStore>(secrets:&S,id:&str,kind:&str)->Result<Option<String>,String>{
 let current=oauth_key(id,kind);if let Some(v)=secrets.get(&current)?{if !v.is_empty(){return Ok(Some(v))}}
 for legacy in legacy_oauth_keys(id,kind){if let Some(v)=secrets.get(&legacy)?{if !v.is_empty(){secrets.set(&current,&v)?;return Ok(Some(v))}}}
 Ok(None)
}
fn write_profile_secrets_with<S:OAuthSecretStore>(secrets:&S,p:&OAuthProfile)->Result<(),String>{
 for (kind,value) in [("client_secret",p.client_secret.as_str()),("access_token",p.access_token.as_str()),("refresh_token",p.refresh_token.as_str())]{if !value.is_empty(){secrets.set(&oauth_key(&p.id,kind),value)?;}}
 Ok(())
}
fn hydrate_profile_secrets_with<S:OAuthSecretStore>(secrets:&S,p:&mut OAuthProfile)->Result<(),String>{
 if p.client_secret.is_empty(){p.client_secret=read_profile_secret_with(secrets,&p.id,"client_secret")?.unwrap_or_default()}
 if p.access_token.is_empty(){p.access_token=read_profile_secret_with(secrets,&p.id,"access_token")?.unwrap_or_default()}
 if p.refresh_token.is_empty(){p.refresh_token=read_profile_secret_with(secrets,&p.id,"refresh_token")?.unwrap_or_default()}
 Ok(())
}
fn write_profile_secrets(p:&OAuthProfile)->Result<(),String>{write_profile_secrets_with(&KeychainOAuthSecretStore,p)}
fn hydrate_profile_secrets(p:&mut OAuthProfile)->Result<(),String>{hydrate_profile_secrets_with(&KeychainOAuthSecretStore,p)}
fn delete_profile_secrets(id:&str)->Result<(),String>{let secrets=KeychainOAuthSecretStore;for kind in ["client_secret","access_token","refresh_token"]{secrets.delete(&oauth_key(id,kind))?;}Ok(())}
fn write_oauth_metadata(path:&Path,s:&OAuthStore)->Result<(),String>{let bytes=serde_json::to_vec_pretty(s).map_err(|e|format!("OAuth serialize: {e}"))?;security::write_private_atomic(path,&bytes)}
fn has_plaintext_secret(p:&OAuthProfile)->bool{!p.client_secret.is_empty()||!p.access_token.is_empty()||!p.refresh_token.is_empty()}
fn recover_store_secrets_with<S:OAuthSecretStore>(secrets:&S,store:&mut OAuthStore)->bool{
 let mut all_plaintext_migrated=true;
 for profile in &mut store.profiles{
  profile.credential_error=None;
  if has_plaintext_secret(profile){if let Err(e)=write_profile_secrets_with(secrets,profile){profile.credential_error=Some(e);all_plaintext_migrated=false;continue}}
  if let Err(e)=hydrate_profile_secrets_with(secrets,profile){profile.credential_error=Some(e)}
 }
 all_plaintext_migrated
}
fn load_store(app:&AppHandle)->Result<OAuthStore,String>{
 let p=store_path(app)?;
 if !p.exists(){return Ok(OAuthStore::default())}
 let b=fs::read(&p).map_err(|e|format!("OAUTH_STORE_READ_ERROR: {e}"))?;
 let mut store=serde_json::from_slice::<OAuthStore>(&b).map_err(|e|{
  let backup=p.with_extension(format!("corrupt-{}.json",Utc::now().format("%Y%m%d%H%M%S")));let _=fs::copy(&p,&backup);let _=security::private_permissions(&backup);
  format!("OAUTH_STORE_CORRUPT: youtube-oauth.json сохранён без удаления; backup={}; error={e}",backup.display())
 })?;
 let legacy_plaintext=store.profiles.iter().any(has_plaintext_secret);
 let all_migrated=recover_store_secrets_with(&KeychainOAuthSecretStore,&mut store);
 if legacy_plaintext&&all_migrated{write_oauth_metadata(&p,&store)?;}else{let _=security::private_permissions(&p);}
 Ok(store)
}
fn save_store(app:&AppHandle,s:&OAuthStore)->Result<(),String>{
 let p=store_path(app)?;
 for profile in &s.profiles{if profile.credential_error.is_none(){write_profile_secrets(profile)?;}}
 write_oauth_metadata(&p,s)
}
fn preserved_refresh_token(existing:Option<&OAuthProfile>,client_id:&str,response_refresh:Option<&str>)->Result<String,String>{
 if let Some(v)=response_refresh.map(str::trim).filter(|x|!x.is_empty()){return Ok(v.to_string())}
 if let Some(old)=existing{
  if old.client_id!=client_id{return Err("OAUTH_CLIENT_MISMATCH: Google не вернул новый refresh_token, а сохранённый token относится к другому OAuth client_id".into())}
  if !old.refresh_token.trim().is_empty(){return Ok(old.refresh_token.clone())}
 }
 Err("REFRESH_TOKEN_MISSING: Google не вернул refresh_token и сохранённого legacy/current refresh_token для этого канала нет".into())
}
fn oauth_refresh_error(v:&Value)->String{
 let code=v.get("error").and_then(Value::as_str).unwrap_or("");let detail=v.get("error_description").and_then(Value::as_str).unwrap_or("Не удалось обновить YouTube token");
 match code{"invalid_grant"=>format!("OAUTH_INVALID_GRANT: refresh token отозван/недействителен: {detail}"),"invalid_client"|"unauthorized_client"=>format!("OAUTH_CLIENT_MISMATCH: {detail}"),_=>format!("OAUTH_REFRESH_FAILED: {code}: {detail}")}
}
'''
replace_once('src-tauri/src/youtube.rs',old,new,'OAuth storage block')

old='''#[tauri::command]
pub fn youtube_oauth_profiles(app:AppHandle)->Result<Value,String>{
 let s=load_store(&app)?;
 Ok(json!(s.profiles.into_iter().map(|p|{
  let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  json!({"id":p.id,"channelId":p.channel_id,"channelTitle":p.channel_title,"connectedAt":p.connected_at,"clientIdMasked":if p.client_id.len()>12{format!("{}…{}",&p.client_id[..8],&p.client_id[p.client_id.len()-6..])}else{"configured".into()},"scopes":p.scopes,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser})
 }).collect::<Vec<_>>()))
}
'''
new='''#[tauri::command]
pub fn youtube_oauth_profiles(app:AppHandle)->Result<Value,String>{
 let s=load_store(&app)?;
 Ok(json!(s.profiles.into_iter().map(|p|{
  let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let credential_status=if p.credential_error.is_some(){"KEYCHAIN_ERROR"}else if p.refresh_token.trim().is_empty(){"RECONNECT_REQUIRED"}else if p.identity_validated_channel_id.as_deref()==p.channel_id.as_deref()&&p.identity_validated_at.is_some(){"WORKING"}else{"RECOVERABLE"};
  json!({"id":p.id,"channelId":p.channel_id,"channelTitle":p.channel_title,"connectedAt":p.connected_at,"clientIdMasked":if p.client_id.len()>12{format!("{}…{}",&p.client_id[..8],&p.client_id[p.client_id.len()-6..])}else{"configured".into()},"scopes":p.scopes,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser,"credentialStatus":credential_status,"credentialError":p.credential_error,"identityValidatedAt":p.identity_validated_at})
 }).collect::<Vec<_>>()))
}
'''
replace_once('src-tauri/src/youtube.rs',old,new,'oauth profiles listing')

old=''' let mut token_form=vec![("client_id",client_id.as_str()),("code",code.as_str()),("code_verifier",verifier.as_str()),("grant_type","authorization_code"),("redirect_uri",redirect.as_str())];if !client_secret.is_empty(){token_form.push(("client_secret",client_secret.as_str()));}let token=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&token_form).send().await.map_err(|e|format!("OAuth token network: {e}"))?;let status=token.status();let tv:Value=token.json().await.map_err(|e|format!("OAuth token JSON: {e}"))?;if !status.is_success(){return Err(tv.get("error_description").and_then(|x|x.as_str()).or_else(||tv.get("error").and_then(|x|x.as_str())).unwrap_or("Google OAuth token error").to_string())}let access=tv.get("access_token").and_then(|x|x.as_str()).ok_or_else(||"Google не вернул access_token".to_string())?.to_string();let refresh=tv.get("refresh_token").and_then(|x|x.as_str()).unwrap_or("").to_string();let expires=tv.get("expires_in").and_then(|x|x.as_i64()).unwrap_or(3600);
 if refresh.is_empty(){return Err("Google не вернул refresh_token. Отключи доступ VYRON в Google Account и подключи YouTube заново.".into())}
'''
new=''' let mut token_form=vec![("client_id",client_id.as_str()),("code",code.as_str()),("code_verifier",verifier.as_str()),("grant_type","authorization_code"),("redirect_uri",redirect.as_str())];if !client_secret.is_empty(){token_form.push(("client_secret",client_secret.as_str()));}let token=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&token_form).send().await.map_err(|e|format!("OAUTH_NETWORK_ERROR: token exchange: {e}"))?;let status=token.status();let tv:Value=token.json().await.map_err(|e|format!("OAuth token JSON: {e}"))?;if !status.is_success(){return Err(tv.get("error_description").and_then(|x|x.as_str()).or_else(||tv.get("error").and_then(|x|x.as_str())).unwrap_or("Google OAuth token error").to_string())}let access=tv.get("access_token").and_then(|x|x.as_str()).ok_or_else(||"Google не вернул access_token".to_string())?.to_string();let response_refresh=tv.get("refresh_token").and_then(|x|x.as_str()).map(str::to_string);let expires=tv.get("expires_in").and_then(|x|x.as_i64()).unwrap_or(3600);
'''
replace_once('src-tauri/src/youtube.rs',old,new,'token exchange refresh preservation prelude')

old=''' let channel_title=item.pointer("/snippet/title").and_then(|x|x.as_str()).map(str::to_string).unwrap_or_else(||channel_id.clone());
 let profile=OAuthProfile{id:Uuid::new_v4().to_string(),client_id:client_id.clone(),client_secret:client_secret.clone(),channel_id:Some(channel_id.clone()),channel_title:Some(channel_title.clone()),access_token:access,refresh_token:refresh,expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),scopes:scopes.clone(),preferred_browser:preferred_browser.clone()};
 let mut s=load_store(&app)?;s.profiles.retain(|p|p.channel_id.as_deref()!=Some(channel_id.as_str()));s.profiles.push(profile.clone());save_store(&app,&s)?;
 let verify=load_store(&app)?;if !verify.profiles.iter().any(|p|p.id==profile.id){return Err("OAuth профиль не сохранился на диск".into())}
'''
new=''' let channel_title=item.pointer("/snippet/title").and_then(|x|x.as_str()).map(str::to_string).unwrap_or_else(||channel_id.clone());
 let mut s=load_store(&app)?;let existing=s.profiles.iter().find(|p|p.channel_id.as_deref()==Some(channel_id.as_str())).cloned();let refresh=preserved_refresh_token(existing.as_ref(),&client_id,response_refresh.as_deref())?;let profile_id=existing.as_ref().map(|p|p.id.clone()).unwrap_or_else(||Uuid::new_v4().to_string());let effective_secret=if client_secret.is_empty(){existing.as_ref().map(|p|p.client_secret.clone()).unwrap_or_default()}else{client_secret.clone()};
 let profile=OAuthProfile{id:profile_id.clone(),client_id:client_id.clone(),client_secret:effective_secret,channel_id:Some(channel_id.clone()),channel_title:Some(channel_title.clone()),access_token:access,refresh_token:refresh,expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),scopes:scopes.clone(),preferred_browser:preferred_browser.clone(),identity_validated_at:Some(Utc::now().to_rfc3339()),identity_validated_channel_id:Some(channel_id.clone()),credential_error:None};
 s.profiles.retain(|p|p.id!=profile_id&&p.channel_id.as_deref()!=Some(channel_id.as_str()));s.profiles.push(profile.clone());save_store(&app,&s)?;
 let verify=load_store(&app)?;if !verify.profiles.iter().any(|p|p.id==profile.id&&!p.refresh_token.trim().is_empty()){return Err("OAUTH_SAVE_VERIFY_FAILED: OAuth профиль/refresh_token не сохранился".into())}
'''
replace_once('src-tauri/src/youtube.rs',old,new,'profile replacement/preserved refresh')

old='''async fn valid_access_token(app:&AppHandle,profile_id:&str)->Result<(String,OAuthProfile),String>{let mut s=load_store(app)?;let idx=s.profiles.iter().position(|p|p.id==profile_id).ok_or_else(||"YouTube профиль не найден. Подключи канал заново.".to_string())?;if s.profiles[idx].expires_at>now_ts()+60{return Ok((s.profiles[idx].access_token.clone(),s.profiles[idx].clone()))}let refresh=s.profiles[idx].refresh_token.clone();let client_id=s.profiles[idx].client_id.clone();let client_secret=s.profiles[idx].client_secret.clone();if refresh.is_empty(){return Err("Нет refresh_token. Переподключи YouTube с доступом offline.".into())}let mut refresh_form=vec![("client_id",client_id.as_str()),("refresh_token",refresh.as_str()),("grant_type","refresh_token")];if !client_secret.is_empty(){refresh_form.push(("client_secret",client_secret.as_str()));}let r=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&refresh_form).send().await.map_err(|e|format!("OAuth refresh network: {e}"))?;let status=r.status();let v:Value=r.json().await.map_err(|e|e.to_string())?;if !status.is_success(){return Err(v.get("error_description").and_then(|x|x.as_str()).unwrap_or("Не удалось обновить YouTube token").to_string())}let token=v.get("access_token").and_then(|x|x.as_str()).ok_or_else(||"Нет нового access_token".to_string())?.to_string();let expires=v.get("expires_in").and_then(|x|x.as_i64()).unwrap_or(3600);s.profiles[idx].access_token=token.clone();s.profiles[idx].expires_at=now_ts()+expires;let profile=s.profiles[idx].clone();save_store(app,&s)?;Ok((token,profile))}
'''
new=r'''async fn validate_profile_identity(app:&AppHandle,profile:&mut OAuthProfile,token:&str)->Result<(),String>{
 emit_youtube_api_request(app,"channels.list",None);let r=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(token).query(&[("part","snippet"),("mine","true")]).send().await.map_err(|e|format!("OAUTH_NETWORK_ERROR: identity validation: {e}"))?;let status=r.status();let v:Value=r.json().await.map_err(|e|format!("OAUTH_IDENTITY_JSON_ERROR: {e}"))?;if !status.is_success(){return Err(youtube_error(&v,"OAUTH_IDENTITY_FAILED: YouTube identity check failed"))}let item=v.get("items").and_then(Value::as_array).and_then(|a|a.first()).ok_or_else(||"OAUTH_CHANNEL_MISSING: Google credential не возвращает YouTube channel".to_string())?;let actual=item.get("id").and_then(Value::as_str).ok_or_else(||"OAUTH_CHANNEL_MISSING: YouTube не вернул channel ID".to_string())?;if let Some(expected)=profile.channel_id.as_deref(){if expected!=actual{return Err(format!("CHANNEL_MISMATCH: credential profile={} expected={} actual={}",profile.id,expected,actual))}}else{profile.channel_id=Some(actual.to_string())}profile.channel_title=item.pointer("/snippet/title").and_then(Value::as_str).map(str::to_string).or_else(||profile.channel_title.clone());profile.identity_validated_channel_id=Some(actual.to_string());profile.identity_validated_at=Some(Utc::now().to_rfc3339());Ok(())
}
async fn valid_access_token(app:&AppHandle,profile_id:&str)->Result<(String,OAuthProfile),String>{
 let mut s=load_store(app)?;let idx=s.profiles.iter().position(|p|p.id==profile_id).ok_or_else(||"CREDENTIAL_MISSING: YouTube OAuth профиль отсутствует во всех current/legacy storage locations".to_string())?;if let Some(e)=s.profiles[idx].credential_error.clone(){return Err(e)}
 let needs_identity=s.profiles[idx].identity_validated_at.is_none()||s.profiles[idx].identity_validated_channel_id.as_deref()!=s.profiles[idx].channel_id.as_deref();
 if s.profiles[idx].expires_at>now_ts()+60&&!s.profiles[idx].access_token.trim().is_empty(){let token=s.profiles[idx].access_token.clone();if needs_identity{validate_profile_identity(app,&mut s.profiles[idx],&token).await?;save_store(app,&s)?;}return Ok((token,s.profiles[idx].clone()))}
 let refresh=s.profiles[idx].refresh_token.clone();let client_id=s.profiles[idx].client_id.clone();let client_secret=s.profiles[idx].client_secret.clone();if refresh.trim().is_empty(){return Err("REFRESH_TOKEN_MISSING: refresh_token отсутствует во всех current/legacy credential locations".into())}let mut refresh_form=vec![("client_id",client_id.as_str()),("refresh_token",refresh.as_str()),("grant_type","refresh_token")];if !client_secret.is_empty(){refresh_form.push(("client_secret",client_secret.as_str()));}let r=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&refresh_form).send().await.map_err(|e|format!("OAUTH_NETWORK_ERROR: token refresh: {e}"))?;let status=r.status();let v:Value=r.json().await.map_err(|e|format!("OAUTH_REFRESH_JSON_ERROR: {e}"))?;if !status.is_success(){return Err(oauth_refresh_error(&v))}let token=v.get("access_token").and_then(Value::as_str).ok_or_else(||"OAUTH_REFRESH_FAILED: Google response has no access_token".to_string())?.to_string();let expires=v.get("expires_in").and_then(Value::as_i64).unwrap_or(3600);s.profiles[idx].access_token=token.clone();s.profiles[idx].expires_at=now_ts()+expires;validate_profile_identity(app,&mut s.profiles[idx],&token).await?;let profile=s.profiles[idx].clone();save_store(app,&s)?;Ok((token,profile))
}
'''
replace_once('src-tauri/src/youtube.rs',old,new,'valid_access_token')

old=''' let item=v.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).cloned().unwrap_or_else(||json!({}));let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));let thumb=sn.pointer("/thumbnails/high/url").or_else(||sn.pointer("/thumbnails/medium/url")).or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str());
 let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
'''
new=''' let item=v.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).cloned().unwrap_or_else(||json!({}));let actual_id=item.get("id").and_then(|x|x.as_str()).ok_or_else(||"OAUTH_CHANNEL_MISSING: YouTube health check returned no channel ID".to_string())?;if let Some(expected)=p.channel_id.as_deref(){if expected!=actual_id{return Err(format!("CHANNEL_MISMATCH: expected={expected} actual={actual_id}"))}}let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));let thumb=sn.pointer("/thumbnails/high/url").or_else(||sn.pointer("/thumbnails/medium/url")).or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str());
 let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
'''
replace_once('src-tauri/src/youtube.rs',old,new,'profile health identity')

p=root/'src-tauri/src/youtube.rs';s=p.read_text()
if 'mod v2111_oauth_recovery_tests' not in s:
    s += r'''

#[cfg(test)]
mod v2111_oauth_recovery_tests{
 use super::*;use std::{cell::RefCell,collections::{HashMap,HashSet}};
 #[derive(Default)]struct MemorySecrets{values:RefCell<HashMap<String,String>>,fail_reads:RefCell<HashSet<String>>}
 impl OAuthSecretStore for MemorySecrets{
  fn get(&self,a:&str)->Result<Option<String>,String>{if self.fail_reads.borrow().contains(a){return Err(format!("KEYCHAIN_ERROR: read {a}"))}Ok(self.values.borrow().get(a).cloned())}
  fn set(&self,a:&str,v:&str)->Result<(),String>{self.values.borrow_mut().insert(a.into(),v.into());Ok(())}
  fn delete(&self,a:&str)->Result<(),String>{self.values.borrow_mut().remove(a);Ok(())}
 }
 fn profile(n:usize)->OAuthProfile{OAuthProfile{id:format!("p{n}"),client_id:"client-A".into(),client_secret:String::new(),channel_id:Some(format!("UC{n:02}")),channel_title:Some(format!("Channel {n}")),access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:"2026-09-01T00:00:00Z".into(),scopes:vec![],preferred_browser:"default".into(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None}}
 #[test]fn legacy_208_plaintext_to_211_is_non_destructive_and_idempotent(){let secrets=MemorySecrets::default();let mut p=profile(1);p.client_secret="secret".into();p.access_token="access".into();p.refresh_token="refresh".into();let mut store=OAuthStore{profiles:vec![p]};assert!(recover_store_secrets_with(&secrets,&mut store));let disk=serde_json::to_string(&store).unwrap();assert!(!disk.contains("refresh"));assert_eq!(secrets.values.borrow().get("oauth.p1.refresh_token").map(String::as_str),Some("refresh"));let mut again:OAuthStore=serde_json::from_str(&disk).unwrap();assert!(recover_store_secrets_with(&secrets,&mut again));assert_eq!(again.profiles[0].refresh_token,"refresh");assert_eq!(secrets.values.borrow().len(),3)}
 #[test]fn legacy_209_keychain_to_211_reads_same_accounts(){let secrets=MemorySecrets::default();for(k,v)in[("client_secret","s"),("access_token","a"),("refresh_token","r")]{secrets.set(&oauth_key("p2",k),v).unwrap()}let mut store=OAuthStore{profiles:vec![profile(2)]};assert!(recover_store_secrets_with(&secrets,&mut store));assert_eq!(store.profiles[0].refresh_token,"r");assert_eq!(store.profiles[0].access_token,"a")}
 #[test]fn legacy_alias_is_copied_not_deleted(){let secrets=MemorySecrets::default();secrets.set("youtube_profile_refresh_token::p3","legacy-r").unwrap();let mut p=profile(3);hydrate_profile_secrets_with(&secrets,&mut p).unwrap();assert_eq!(p.refresh_token,"legacy-r");assert_eq!(secrets.get("oauth.p3.refresh_token").unwrap().as_deref(),Some("legacy-r"));assert_eq!(secrets.get("youtube_profile_refresh_token::p3").unwrap().as_deref(),Some("legacy-r"))}
 #[test]fn oauth_response_without_refresh_preserves_existing_refresh_and_profile_id_contract(){let mut old=profile(4);old.refresh_token="keep-me".into();assert_eq!(preserved_refresh_token(Some(&old),"client-A",None).unwrap(),"keep-me");assert!(preserved_refresh_token(Some(&old),"other-client",None).unwrap_err().starts_with("OAUTH_CLIENT_MISMATCH:"));assert!(preserved_refresh_token(None,"client-A",None).unwrap_err().starts_with("REFRESH_TOKEN_MISSING:"))}
 #[test]fn thirty_one_valid_credentials_recover_31_of_31(){let secrets=MemorySecrets::default();let mut profiles=Vec::new();for i in 0..31{let p=profile(i);secrets.set(&oauth_key(&p.id,"refresh_token"),&format!("r{i}" )).unwrap();secrets.set(&oauth_key(&p.id,"access_token"),&format!("a{i}" )).unwrap();profiles.push(p)}let mut store=OAuthStore{profiles};assert!(recover_store_secrets_with(&secrets,&mut store));assert_eq!(store.profiles.iter().filter(|p|!p.refresh_token.is_empty()&&p.credential_error.is_none()).count(),31)}
 #[test]fn mixed_29_valid_one_revoked_one_missing_is_isolated(){let secrets=MemorySecrets::default();let mut profiles=Vec::new();for i in 0..31{let p=profile(i);if i<30{secrets.set(&oauth_key(&p.id,"refresh_token"),if i==29{"revoked"}else{"valid"}).unwrap()}profiles.push(p)}let mut store=OAuthStore{profiles};assert!(recover_store_secrets_with(&secrets,&mut store));let working=store.profiles.iter().filter(|p|p.refresh_token=="valid").count();let revoked=store.profiles.iter().filter(|p|p.refresh_token=="revoked").count();let missing=store.profiles.iter().filter(|p|p.refresh_token.is_empty()).count();assert_eq!((working,revoked,missing),(29,1,1));let invalid_grant=json!({"error":"invalid_grant","error_description":"revoked"});assert!(oauth_refresh_error(&invalid_grant).starts_with("OAUTH_INVALID_GRANT:"));assert_eq!(store.profiles.iter().filter(|p|p.refresh_token=="valid").count(),29)}
 #[test]fn repeat_migration_has_no_duplicates_or_logout(){let secrets=MemorySecrets::default();let mut profiles=Vec::new();for i in 0..31{let mut p=profile(i);p.refresh_token=format!("r{i}");profiles.push(p)}let mut store=OAuthStore{profiles};assert!(recover_store_secrets_with(&secrets,&mut store));let disk=serde_json::to_string(&store).unwrap();let mut second:OAuthStore=serde_json::from_str(&disk).unwrap();assert!(recover_store_secrets_with(&secrets,&mut second));let ids=second.profiles.iter().map(|p|p.id.clone()).collect::<HashSet<_>>();assert_eq!(ids.len(),31);assert_eq!(second.profiles.iter().filter(|p|!p.refresh_token.is_empty()).count(),31)}
}
'''
    p.write_text(s)

print('VYRON 2.1.1 OAuth/Keychain recovery patch applied')
