use base64::{engine::general_purpose::URL_SAFE_NO_PAD,Engine as _};
use chrono::Utc;
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{fs,io::{Read,Write},net::TcpListener,path::{Path,PathBuf},process::Command,time::{Duration,SystemTime,UNIX_EPOCH}};
use tauri::{AppHandle,Emitter,Manager};
use tokio::io::{AsyncReadExt,AsyncSeekExt};
use uuid::Uuid;

#[derive(Debug,Clone,Serialize,Deserialize,Default)]
struct OAuthStore{profiles:Vec<OAuthProfile>}
#[derive(Debug,Clone,Serialize,Deserialize)]
struct OAuthProfile{id:String,client_id:String,#[serde(default)] client_secret:String,channel_id:Option<String>,channel_title:Option<String>,access_token:String,refresh_token:String,expires_at:i64,connected_at:String,#[serde(default)] scopes:Vec<String>,#[serde(default)] preferred_browser:String}
fn now_ts()->i64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64}
fn store_path(app:&AppHandle)->Result<PathBuf,String>{let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;fs::create_dir_all(&dir).map_err(|e|e.to_string())?;Ok(dir.join("youtube-oauth.json"))}
fn load_store(app:&AppHandle)->Result<OAuthStore,String>{
 let p=store_path(app)?;
 if !p.exists(){return Ok(OAuthStore::default())}
 let b=fs::read(&p).map_err(|e|format!("OAuth store read: {e}"))?;
 match serde_json::from_slice::<OAuthStore>(&b){
  Ok(s)=>Ok(s),
  Err(_e)=>{
   let backup=p.with_extension(format!("corrupt-{}.json",Utc::now().format("%Y%m%d%H%M%S")));
   let _=fs::rename(&p,&backup);
   Ok(OAuthStore::default())
  }
 }
}
fn save_store(app:&AppHandle,s:&OAuthStore)->Result<(),String>{
 let p=store_path(app)?;
 let tmp=p.with_extension("tmp");
 let bytes=serde_json::to_vec_pretty(s).map_err(|e|format!("OAuth serialize: {e}"))?;
 fs::write(&tmp,bytes).map_err(|e|format!("OAuth store write: {e}"))?;
 fs::rename(&tmp,&p).map_err(|e|format!("OAuth store replace: {e}"))?;
 #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;let _=fs::set_permissions(&p,fs::Permissions::from_mode(0o600));}
 Ok(())
}
#[derive(Debug,Clone,Serialize,Deserialize,Default)]
struct GoogleConfig{#[serde(default)] client_id:String,#[serde(default)] client_secret:String,#[serde(default)] project_id:String,#[serde(default)] api_key:String}
fn google_config_path(app:&AppHandle)->Result<PathBuf,String>{let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;fs::create_dir_all(&dir).map_err(|e|e.to_string())?;Ok(dir.join("google-config.json"))}
fn load_google_config(app:&AppHandle)->Result<GoogleConfig,String>{let p=google_config_path(app)?;if !p.exists(){return Ok(GoogleConfig::default())}let b=fs::read(&p).map_err(|e|format!("Google config read: {e}"))?;serde_json::from_slice(&b).map_err(|e|format!("Google config parse: {e}"))}
fn save_google_config(app:&AppHandle,c:&GoogleConfig)->Result<(),String>{let p=google_config_path(app)?;let tmp=p.with_extension("tmp");let b=serde_json::to_vec_pretty(c).map_err(|e|e.to_string())?;fs::write(&tmp,b).map_err(|e|format!("Google config write: {e}"))?;fs::rename(&tmp,&p).map_err(|e|format!("Google config replace: {e}"))?;#[cfg(unix)]{use std::os::unix::fs::PermissionsExt;let _=fs::set_permissions(&p,fs::Permissions::from_mode(0o600));}Ok(())}
fn masked_client_id(s:&str)->String{if s.len()>16{format!("{}…{}",&s[..8],&s[s.len()-8..])}else if s.is_empty(){String::new()}else{"configured".into()}}
fn google_config_status_value(c:&GoogleConfig)->Value{json!({"configured":!c.client_id.trim().is_empty(),"projectId":if c.project_id.is_empty(){Value::Null}else{json!(c.project_id)},"clientIdMasked":if c.client_id.is_empty(){Value::Null}else{json!(masked_client_id(&c.client_id))},"hasSecret":!c.client_secret.is_empty(),"hasApiKey":!c.api_key.is_empty()})}
fn load_or_migrate_google_config(app:&AppHandle)->Result<GoogleConfig,String>{
 let mut c=load_google_config(app)?;
 if c.client_id.trim().is_empty(){
  let store=load_store(app)?;
  if let Some(p)=store.profiles.iter().find(|p|!p.client_id.trim().is_empty()){
   c.client_id=p.client_id.clone();
   c.client_secret=p.client_secret.clone();
   save_google_config(app,&c)?;
  }
 }
 Ok(c)
}
#[tauri::command]
pub fn youtube_google_config_status(app:AppHandle)->Result<Value,String>{Ok(google_config_status_value(&load_or_migrate_google_config(&app)?))}
#[tauri::command]
pub fn youtube_google_config_import(app:AppHandle,json_text:String,api_key:String)->Result<Value,String>{let v:Value=serde_json::from_str(&json_text).map_err(|e|format!("credentials.json: {e}"))?;let root=v.get("installed").or_else(||v.get("web")).unwrap_or(&v);let client_id=root.get("client_id").and_then(|x|x.as_str()).unwrap_or("").trim().to_string();if client_id.is_empty(){return Err("В credentials.json не найден client_id".into())}let client_secret=root.get("client_secret").and_then(|x|x.as_str()).unwrap_or("").trim().to_string();let project_id=root.get("project_id").and_then(|x|x.as_str()).or_else(||v.get("project_id").and_then(|x|x.as_str())).unwrap_or("").trim().to_string();let old=load_google_config(&app).unwrap_or_default();let c=GoogleConfig{client_id,client_secret,project_id,api_key:if api_key.trim().is_empty(){old.api_key}else{api_key.trim().to_string()}};save_google_config(&app,&c)?;Ok(google_config_status_value(&c))}
#[tauri::command]
pub async fn youtube_oauth_connect_global(app:AppHandle,browser:Option<String>)->Result<Value,String>{let c=load_or_migrate_google_config(&app)?;if c.client_id.trim().is_empty(){return Err("Нет Google OAuth Client. Импортируй credentials.json один раз или подключи существующий OAuth профиль.".into())}youtube_oauth_connect(app,c.client_id,c.client_secret,browser).await}
#[tauri::command]
pub async fn youtube_oauth_profile_health(app:AppHandle,profile_id:String)->Result<Value,String>{
 let (_token,p)=valid_access_token(&app,&profile_id).await?;let token=p.access_token.clone();
 let r=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(&token).query(&[("part","snippet"),("mine","true")]).send().await.map_err(|e|format!("YouTube health: {e}"))?;
 let st=r.status();let v:Value=r.json().await.unwrap_or_else(|_|json!({}));if !st.is_success(){return Err(youtube_error(&v,"YouTube OAuth health check failed"))}
 let item=v.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).cloned().unwrap_or_else(||json!({}));let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));let thumb=sn.pointer("/thumbnails/high/url").or_else(||sn.pointer("/thumbnails/medium/url")).or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str());
 let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
 Ok(json!({"ok":true,"status":"TOKEN_HEALTHY","channelId":item.get("id").and_then(|x|x.as_str()).or(p.channel_id.as_deref()),"channelTitle":sn.get("title").and_then(|x|x.as_str()).or(p.channel_title.as_deref()),"thumbnail":thumb,"expiresAt":p.expires_at,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser}))
}
#[tauri::command]
pub async fn youtube_cache_thumbnail(app:AppHandle,video_id:String,primary:Option<String>)->Result<String,String>{let id=video_id.trim();if id.is_empty(){return Err("Video ID пуст".into())}let dir=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("thumbnails");fs::create_dir_all(&dir).map_err(|e|format!("Thumbnail cache: {e}"))?;let safe=id.chars().filter(|c|c.is_ascii_alphanumeric()||*c=='_'||*c=='-').collect::<String>();let path=dir.join(format!("{safe}.jpg"));if path.exists()&&fs::metadata(&path).map(|m|m.len()>900).unwrap_or(false){return Ok(path.to_string_lossy().to_string())}let mut urls=Vec::<String>::new();if let Some(x)=primary.filter(|x|!x.trim().is_empty()){urls.push(x)}for q in ["maxresdefault","sddefault","hqdefault","mqdefault","default"]{urls.push(format!("https://i.ytimg.com/vi/{id}/{q}.jpg"))}let client=reqwest::Client::builder().timeout(Duration::from_secs(12)).build().map_err(|e|e.to_string())?;for url in urls{for attempt in 0..3{match client.get(&url).send().await{Ok(r) if r.status().is_success()=>{let b=r.bytes().await.map_err(|e|e.to_string())?;if b.len()>900{let tmp=path.with_extension("tmp");fs::write(&tmp,&b).map_err(|e|e.to_string())?;fs::rename(&tmp,&path).map_err(|e|e.to_string())?;return Ok(path.to_string_lossy().to_string())}},Ok(_)=>{},Err(_)=>{if attempt==0{tokio::time::sleep(Duration::from_millis(250)).await;}}}}}Err("Thumbnail недоступна после fallback".into())}

fn browser_catalog()->Vec<(&'static str,&'static str,&'static str)>{vec![
 ("default","Браузер по умолчанию",""),("safari","Safari","Safari"),("chrome","Google Chrome","Google Chrome"),("firefox","Firefox","Firefox"),("brave","Brave","Brave Browser"),("arc","Arc","Arc"),("edge","Microsoft Edge","Microsoft Edge"),("yandex","Yandex Browser","Yandex"),("opera","Opera","Opera")
]}
#[tauri::command]
pub fn youtube_oauth_browsers()->Value{
 #[cfg(target_os="macos")]{let rows=browser_catalog().into_iter().map(|(id,label,app)|{let available=id=="default"||["/Applications","/System/Applications"].iter().any(|base|Path::new(base).join(format!("{app}.app")).exists())||std::env::var("HOME").ok().map(|h|Path::new(&h).join("Applications").join(format!("{app}.app")).exists()).unwrap_or(false);json!({"id":id,"label":label,"available":available})}).collect::<Vec<_>>();return json!(rows)}
 #[cfg(not(target_os="macos"))]{json!([{"id":"default","label":"Браузер по умолчанию","available":true}])}
}
fn open_browser(url:&str,browser:&str)->Result<(),String>{
 #[cfg(target_os="macos")]{if browser=="default"||browser.trim().is_empty(){Command::new("open").arg(url).spawn().map_err(|e|e.to_string())?;}else{let app=browser_catalog().into_iter().find(|(id,_,_)|*id==browser).map(|x|x.2).ok_or_else(||format!("Неизвестный браузер: {browser}"))?;Command::new("open").args(["-a",app,url]).spawn().map_err(|e|format!("Не удалось открыть {app}: {e}"))?;}}
 #[cfg(target_os="windows")]{let _=browser;Command::new("cmd").args(["/C","start","",url]).spawn().map_err(|e|e.to_string())?;}
 #[cfg(target_os="linux")]{let _=browser;Command::new("xdg-open").arg(url).spawn().map_err(|e|e.to_string())?;}
 Ok(())
}
fn query_param(query:&str,key:&str)->Option<String>{query.split('&').find_map(|p|{let mut it=p.splitn(2,'=');let k=it.next()?;let v=it.next().unwrap_or("");if k==key{urlencoding::decode(v).ok().map(|x|x.into_owned())}else{None}})}

#[tauri::command]
pub fn youtube_oauth_profiles(app:AppHandle)->Result<Value,String>{
 let s=load_store(&app)?;
 Ok(json!(s.profiles.into_iter().map(|p|{
  let analytics=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics.readonly"||x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  let monetary=p.scopes.iter().any(|x|x=="https://www.googleapis.com/auth/yt-analytics-monetary.readonly");
  json!({"id":p.id,"channelId":p.channel_id,"channelTitle":p.channel_title,"connectedAt":p.connected_at,"clientIdMasked":if p.client_id.len()>12{format!("{}…{}",&p.client_id[..8],&p.client_id[p.client_id.len()-6..])}else{"configured".into()},"scopes":p.scopes,"analyticsAuthorized":analytics,"monetaryAuthorized":monetary,"preferredBrowser":p.preferred_browser})
 }).collect::<Vec<_>>()))
}

#[tauri::command]
pub fn youtube_oauth_disconnect(app:AppHandle,profile_id:String)->Result<(),String>{let mut s=load_store(&app)?;s.profiles.retain(|p|p.id!=profile_id);save_store(&app,&s)}

#[tauri::command]
pub async fn youtube_oauth_connect(app:AppHandle,client_id:String,client_secret:String,browser:Option<String>)->Result<Value,String>{
 let client_id=client_id.trim().to_string();if client_id.is_empty(){return Err("Google OAuth Client ID не указан".into())}
 let client_secret=client_secret.trim().to_string();
 let listener=TcpListener::bind("127.0.0.1:0").map_err(|e|format!("OAuth localhost: {e}"))?;let port=listener.local_addr().map_err(|e|e.to_string())?.port();let redirect=format!("http://127.0.0.1:{port}");
 let verifier=format!("{}{}{}",Uuid::new_v4().simple(),Uuid::new_v4().simple(),Uuid::new_v4().simple());let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));let state=Uuid::new_v4().to_string();
 let scope="https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/yt-analytics-monetary.readonly";let scopes=scope.split_whitespace().map(str::to_string).collect::<Vec<_>>();
 let auth_url=format!("https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256&state={}",urlencoding::encode(&client_id),urlencoding::encode(&redirect),urlencoding::encode(scope),urlencoding::encode(&challenge),urlencoding::encode(&state));let preferred_browser=browser.unwrap_or_else(||"default".into());open_browser(&auth_url,&preferred_browser)?;
 let expected_state=state.clone();let code=tauri::async_runtime::spawn_blocking(move||->Result<String,String>{listener.set_nonblocking(false).map_err(|e|e.to_string())?;let (mut stream,_)=listener.accept().map_err(|e|format!("OAuth callback: {e}"))?;let _=stream.set_read_timeout(Some(Duration::from_secs(300)));let mut buf=[0u8;8192];let n=stream.read(&mut buf).map_err(|e|format!("OAuth callback read: {e}"))?;let req=String::from_utf8_lossy(&buf[..n]);let first=req.lines().next().unwrap_or("");let target=first.split_whitespace().nth(1).unwrap_or("");let query=target.split_once('?').map(|x|x.1).unwrap_or("");let got_state=query_param(query,"state").unwrap_or_default();let code=query_param(query,"code");let err=query_param(query,"error");let ok=got_state==expected_state&&code.is_some();let html=if ok{"<html><body style='font-family:-apple-system;padding:40px;background:#07111d;color:white'><h2>Google подтвердил доступ ✅</h2><p>VYRON завершает проверку токена и YouTube-канала. Вернитесь в приложение — окончательный статус будет показан там.</p></body></html>"}else{"<html><body><h2>VYRON OAuth error</h2><p>Вернитесь в приложение.</p></body></html>"};let resp=format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",html.as_bytes().len(),html);let _=stream.write_all(resp.as_bytes());if let Some(e)=err{return Err(format!("Google OAuth: {e}"))}if got_state!=expected_state{return Err("OAuth state mismatch".into())}code.ok_or_else(||"Google не вернул authorization code".into())}).await.map_err(|e|e.to_string())??;
 let mut token_form=vec![("client_id",client_id.as_str()),("code",code.as_str()),("code_verifier",verifier.as_str()),("grant_type","authorization_code"),("redirect_uri",redirect.as_str())];if !client_secret.is_empty(){token_form.push(("client_secret",client_secret.as_str()));}let token=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&token_form).send().await.map_err(|e|format!("OAuth token network: {e}"))?;let status=token.status();let tv:Value=token.json().await.map_err(|e|format!("OAuth token JSON: {e}"))?;if !status.is_success(){return Err(tv.get("error_description").and_then(|x|x.as_str()).or_else(||tv.get("error").and_then(|x|x.as_str())).unwrap_or("Google OAuth token error").to_string())}let access=tv.get("access_token").and_then(|x|x.as_str()).ok_or_else(||"Google не вернул access_token".to_string())?.to_string();let refresh=tv.get("refresh_token").and_then(|x|x.as_str()).unwrap_or("").to_string();let expires=tv.get("expires_in").and_then(|x|x.as_i64()).unwrap_or(3600);
 if refresh.is_empty(){return Err("Google не вернул refresh_token. Отключи доступ VYRON в Google Account и подключи YouTube заново.".into())}
 let me=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true").bearer_auth(&access).send().await.map_err(|e|format!("YouTube account network: {e}"))?;
 let me_status=me.status();
 let mv:Value=me.json().await.map_err(|e|format!("YouTube account JSON: {e}"))?;
 if !me_status.is_success(){return Err(youtube_error(&mv,"Не удалось получить YouTube-канал. Проверь, что YouTube Data API v3 включён именно в проекте VYRON."))}
 let item=mv.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).ok_or_else(||"На выбранном Google-аккаунте YouTube-канал не найден".to_string())?;
 let channel_id=item.get("id").and_then(|x|x.as_str()).map(str::to_string).ok_or_else(||"YouTube не вернул Channel ID".to_string())?;
 let channel_title=item.pointer("/snippet/title").and_then(|x|x.as_str()).map(str::to_string).unwrap_or_else(||channel_id.clone());
 let profile=OAuthProfile{id:Uuid::new_v4().to_string(),client_id:client_id.clone(),client_secret:client_secret.clone(),channel_id:Some(channel_id.clone()),channel_title:Some(channel_title.clone()),access_token:access,refresh_token:refresh,expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),scopes:scopes.clone(),preferred_browser:preferred_browser.clone()};
 let mut s=load_store(&app)?;s.profiles.retain(|p|p.channel_id.as_deref()!=Some(channel_id.as_str()));s.profiles.push(profile.clone());save_store(&app,&s)?;
 let verify=load_store(&app)?;if !verify.profiles.iter().any(|p|p.id==profile.id){return Err("OAuth профиль не сохранился на диск".into())}
 Ok(json!({"id":profile.id,"channelId":channel_id,"channelTitle":channel_title,"connectedAt":profile.connected_at,"preferredBrowser":preferred_browser}))
}

async fn valid_access_token(app:&AppHandle,profile_id:&str)->Result<(String,OAuthProfile),String>{let mut s=load_store(app)?;let idx=s.profiles.iter().position(|p|p.id==profile_id).ok_or_else(||"YouTube профиль не найден. Подключи канал заново.".to_string())?;if s.profiles[idx].expires_at>now_ts()+60{return Ok((s.profiles[idx].access_token.clone(),s.profiles[idx].clone()))}let refresh=s.profiles[idx].refresh_token.clone();let client_id=s.profiles[idx].client_id.clone();let client_secret=s.profiles[idx].client_secret.clone();if refresh.is_empty(){return Err("Нет refresh_token. Переподключи YouTube с доступом offline.".into())}let mut refresh_form=vec![("client_id",client_id.as_str()),("refresh_token",refresh.as_str()),("grant_type","refresh_token")];if !client_secret.is_empty(){refresh_form.push(("client_secret",client_secret.as_str()));}let r=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&refresh_form).send().await.map_err(|e|format!("OAuth refresh network: {e}"))?;let status=r.status();let v:Value=r.json().await.map_err(|e|e.to_string())?;if !status.is_success(){return Err(v.get("error_description").and_then(|x|x.as_str()).unwrap_or("Не удалось обновить YouTube token").to_string())}let token=v.get("access_token").and_then(|x|x.as_str()).ok_or_else(||"Нет нового access_token".to_string())?.to_string();let expires=v.get("expires_in").and_then(|x|x.as_i64()).unwrap_or(3600);s.profiles[idx].access_token=token.clone();s.profiles[idx].expires_at=now_ts()+expires;let profile=s.profiles[idx].clone();save_store(app,&s)?;Ok((token,profile))}

pub(crate) async fn access_token_and_scopes(app:&AppHandle,profile_id:&str)->Result<(String,Vec<String>),String>{let (token,profile)=valid_access_token(app,profile_id).await?;Ok((token,profile.scopes))}

async fn upload_offset(client:&reqwest::Client,url:&str,token:&str,total:u64)->Result<u64,String>{let r=client.put(url).bearer_auth(token).header("Content-Length","0").header("Content-Range",format!("bytes */{total}")).send().await.map_err(|e|e.to_string())?;if r.status().as_u16()==308{if let Some(range)=r.headers().get("Range").and_then(|x|x.to_str().ok()){if let Some(end)=range.split('-').last().and_then(|x|x.parse::<u64>().ok()){return Ok(end+1)}}return Ok(0)}if r.status().is_success(){return Ok(total)}Err(format!("YouTube resume status: {}",r.status()))}

#[tauri::command]
pub async fn youtube_upload_video(app:AppHandle,profile_id:String,job_id:String,file_path:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>,category_id:String)->Result<Value,String>{
 let path=PathBuf::from(&file_path);if !path.is_file(){return Err(format!("Видео не найдено: {}",path.display()))}if title.trim().is_empty(){return Err("Название видео пустое".into())}let total=fs::metadata(&path).map_err(|e|e.to_string())?.len();if total==0{return Err("Видео пустое".into())}
 let (token,profile)=valid_access_token(&app,&profile_id).await?;let category=if category_id.trim().is_empty(){"10"}else{category_id.trim()};let mut status=json!({"privacyStatus":"private"});if let Some(p)=publish_at.as_ref().filter(|x|!x.trim().is_empty()){status["publishAt"]=json!(p)}let body=json!({"snippet":{"title":title.chars().take(100).collect::<String>(),"description":description.chars().take(5000).collect::<String>(),"tags":tags.into_iter().take(30).collect::<Vec<_>>(),"categoryId":category},"status":status});
 let client=reqwest::Client::new();let init=client.post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status").bearer_auth(&token).header("Content-Type","application/json; charset=UTF-8").header("X-Upload-Content-Length",total.to_string()).header("X-Upload-Content-Type","video/mp4").json(&body).send().await.map_err(|e|format!("YouTube session: {e}"))?;let init_status=init.status();if !init_status.is_success(){let t=init.text().await.unwrap_or_default();return Err(format!("YouTube upload init {init_status}: {}",t.chars().take(500).collect::<String>()))}let session=init.headers().get("Location").and_then(|x|x.to_str().ok()).ok_or_else(||"YouTube не вернул resumable Location".to_string())?.to_string();
 let mut file=tokio::fs::File::open(&path).await.map_err(|e|e.to_string())?;let chunk_size:usize=8*1024*1024;let mut offset:u64=0;let mut final_json=json!({});while offset<total{file.seek(std::io::SeekFrom::Start(offset)).await.map_err(|e|e.to_string())?;let wanted=std::cmp::min(chunk_size as u64,total-offset) as usize;let mut buf=vec![0u8;wanted];file.read_exact(&mut buf).await.map_err(|e|e.to_string())?;let end=offset+wanted as u64-1;let mut completed=false;for attempt in 0..5{let sent=client.put(&session).bearer_auth(&token).header("Content-Type","video/mp4").header("Content-Length",wanted.to_string()).header("Content-Range",format!("bytes {offset}-{end}/{total}")).body(buf.clone()).send().await;match sent{Ok(r)=>{let st=r.status();if st.is_success(){final_json=r.json().await.unwrap_or_else(|_|json!({}));offset=total;completed=true;break}if st.as_u16()==308{offset=r.headers().get("Range").and_then(|x|x.to_str().ok()).and_then(|s|s.split('-').last()).and_then(|x|x.parse::<u64>().ok()).map(|x|x+1).unwrap_or(end+1);let pct=(offset as f64/total as f64*100.0).min(100.0);let _=app.emit("youtube-upload-progress",json!({"jobId":job_id,"progress":pct}));completed=true;break}if st.is_server_error(){tokio::time::sleep(Duration::from_secs(1u64<<attempt)).await;offset=upload_offset(&client,&session,&token,total).await.unwrap_or(offset);continue}let text=r.text().await.unwrap_or_default();return Err(format!("YouTube upload {st}: {}",text.chars().take(500).collect::<String>()))},Err(e)=>{if attempt==4{return Err(format!("YouTube upload network: {e}"))}tokio::time::sleep(Duration::from_secs(1u64<<attempt)).await;offset=upload_offset(&client,&session,&token,total).await.unwrap_or(offset)}}}if !completed{return Err("YouTube upload не удалось продолжить".into())}}
 let video_id=final_json.get("id").and_then(|x|x.as_str()).unwrap_or("").to_string();let _=app.emit("youtube-upload-progress",json!({"jobId":job_id,"progress":100.0}));Ok(json!({"videoId":video_id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"scheduled":publish_at.is_some()}))
}


fn youtube_error(v:&Value,fallback:&str)->String{
 let message=v.pointer("/error/message").and_then(|x|x.as_str()).or_else(||v.get("error_description").and_then(|x|x.as_str())).unwrap_or(fallback);
 let reason=v.pointer("/error/errors/0/reason").and_then(|x|x.as_str()).unwrap_or("");
 if reason.is_empty(){message.to_string()}else{format!("{} [{}]",message,reason)}
}

#[tauri::command]
pub async fn youtube_list_existing_videos(app:AppHandle,profile_id:String,max_results:Option<u32>)->Result<Value,String>{
 let (token,profile)=valid_access_token(&app,&profile_id).await?;let limit=max_results.unwrap_or(1000).clamp(1,5000) as usize;let client=reqwest::Client::new();
 let r=client.get("https://www.googleapis.com/youtube/v3/channels").bearer_auth(&token).query(&[("part","contentDetails"),("mine","true")]).send().await.map_err(|e|format!("YouTube channel: {e}"))?;let st=r.status();let cv:Value=r.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&cv,"Не удалось получить канал YouTube"))}let uploads=cv.pointer("/items/0/contentDetails/relatedPlaylists/uploads").and_then(|x|x.as_str()).ok_or_else(||"YouTube не вернул playlist загрузок".to_string())?;
 let mut ids=Vec::<String>::new();let mut page:Option<String>=None;let mut youtube_found:usize=0;
 while ids.len()<limit{
  let mut q=client.get("https://www.googleapis.com/youtube/v3/playlistItems").bearer_auth(&token).query(&[("part","contentDetails"),("playlistId",uploads),("maxResults","50")]);if let Some(ref t)=page{q=q.query(&[("pageToken",t.as_str())]);}
  let r=q.send().await.map_err(|e|format!("YouTube uploads: {e}"))?;let st=r.status();let v:Value=r.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&v,"Не удалось получить список загрузок"))}
  if youtube_found==0{youtube_found=v.pointer("/pageInfo/totalResults").and_then(|x|x.as_u64()).unwrap_or(0) as usize;}
  if let Some(items)=v.get("items").and_then(|x|x.as_array()){for item in items{if ids.len()>=limit{break}if let Some(id)=item.pointer("/contentDetails/videoId").and_then(|x|x.as_str()){ids.push(id.to_string())}}}
  page=v.get("nextPageToken").and_then(|x|x.as_str()).map(str::to_string);if page.is_none(){break}
 }
 if youtube_found==0{youtube_found=ids.len()}
 let mut by_id=std::collections::HashMap::<String,Value>::new();for chunk in ids.chunks(50){let joined=chunk.join(",");let r=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status,contentDetails,statistics"),("id",joined.as_str())]).send().await.map_err(|e|format!("YouTube videos: {e}"))?;let st=r.status();let v:Value=r.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&v,"Не удалось получить данные видео"))}for item in v.get("items").and_then(|x|x.as_array()).cloned().unwrap_or_default(){if let Some(id)=item.get("id").and_then(|x|x.as_str()){by_id.insert(id.to_string(),item);}}}
 let mut out=Vec::new();for (position,id) in ids.iter().enumerate(){if let Some(item)=by_id.get(id){let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));let st=item.get("status").cloned().unwrap_or_else(||json!({}));out.push(json!({"id":id,"channelId":sn.get("channelId").and_then(|x|x.as_str()),"position":position,"title":sn.get("title").and_then(|x|x.as_str()).unwrap_or(""),"description":sn.get("description").and_then(|x|x.as_str()).unwrap_or(""),"tags":sn.get("tags").cloned().unwrap_or_else(||json!([])),"categoryId":sn.get("categoryId").and_then(|x|x.as_str()).unwrap_or("10"),"publishedAt":sn.get("publishedAt").and_then(|x|x.as_str()),"privacyStatus":st.get("privacyStatus").and_then(|x|x.as_str()).unwrap_or("unknown"),"publishAt":st.get("publishAt").and_then(|x|x.as_str()),"thumbnail":sn.pointer("/thumbnails/maxres/url").or_else(||sn.pointer("/thumbnails/standard/url")).or_else(||sn.pointer("/thumbnails/high/url")).or_else(||sn.pointer("/thumbnails/medium/url")).or_else(||sn.pointer("/thumbnails/default/url")).and_then(|x|x.as_str()),"duration":item.pointer("/contentDetails/duration").and_then(|x|x.as_str()),"views":item.pointer("/statistics/viewCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),"likes":item.pointer("/statistics/likeCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),"comments":item.pointer("/statistics/commentCount").and_then(|x|x.as_str()).and_then(|x|x.parse::<u64>().ok()),"selected":false}));}}
 let scheduled_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("private")&&x.get("publishAt").and_then(|v|v.as_str()).is_some()).count();let private_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("private")&&x.get("publishAt").and_then(|v|v.as_str()).is_none()).count();let public_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("public")).count();let unlisted_count=out.iter().filter(|x|x.get("privacyStatus").and_then(|v|v.as_str())==Some("unlisted")).count();let expected=std::cmp::min(youtube_found,limit);let complete=out.len()==expected;
 Ok(json!({"channelId":profile.channel_id,"channelTitle":profile.channel_title,"youtubeFound":youtube_found,"received":out.len(),"requested":limit,"privateCount":private_count,"publicCount":public_count,"scheduledCount":scheduled_count,"unlistedCount":unlisted_count,"complete":complete,"videos":out}))
}

#[tauri::command]
pub async fn youtube_backup_existing_videos(app:AppHandle,profile_id:String,videos:Value)->Result<Value,String>{
 let (token,profile)=valid_access_token(&app,&profile_id).await?;let channel_id=profile.channel_id.clone().ok_or_else(||"OAuth профиль не содержит Channel ID".to_string())?;let arr=videos.as_array().ok_or_else(||"Backup: videos должен быть массивом".to_string())?;if arr.is_empty(){return Err("Backup: список видео пуст".into())}
 let ids=arr.iter().map(|x|x.get("id").and_then(|v|v.as_str()).map(str::to_string).ok_or_else(||"Backup: video ID отсутствует".to_string())).collect::<Result<Vec<_>,_>>()?;let client=reqwest::Client::new();
 for chunk in ids.chunks(50){let joined=chunk.join(",");let r=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet"),("id",joined.as_str())]).send().await.map_err(|e|format!("Backup ownership check: {e}"))?;let st=r.status();let v:Value=r.json().await.unwrap_or_else(|_|json!({}));if !st.is_success(){return Err(youtube_error(&v,"Backup: не удалось проверить владельца видео"))}for item in v.get("items").and_then(|x|x.as_array()).cloned().unwrap_or_default(){let actual=item.pointer("/snippet/channelId").and_then(|x|x.as_str()).unwrap_or("");if actual!=channel_id{return Err(format!("BLOCK: video {} принадлежит другому channelId",item.get("id").and_then(|x|x.as_str()).unwrap_or("?")))}}}
 let safe=channel_id.chars().filter(|c|c.is_ascii_alphanumeric()||*c=='_'||*c=='-').collect::<String>();let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("Backup").join("Youtube").join(safe);fs::create_dir_all(&dir).map_err(|e|format!("Backup dir: {e}"))?;let path=dir.join(format!("{}.json",Utc::now().format("%Y%m%d-%H%M%S-%3f")));
 let clean=arr.iter().map(|v|json!({"videoId":v.get("id"),"title":v.get("title"),"description":v.get("description"),"tags":v.get("tags"),"publishAt":v.get("publishAt"),"privacy":v.get("privacyStatus")})).collect::<Vec<_>>();let payload=json!({"channelId":channel_id,"createdAt":Utc::now().to_rfc3339(),"videos":clean});fs::write(&path,serde_json::to_vec_pretty(&payload).map_err(|e|e.to_string())?).map_err(|e|format!("Backup write: {e}"))?;#[cfg(unix)]{use std::os::unix::fs::PermissionsExt;let _=fs::set_permissions(&path,fs::Permissions::from_mode(0o600));}
 Ok(json!({"path":path.to_string_lossy(),"count":arr.len()}))
}

fn same_publish_time(a:Option<&str>,b:Option<&str>)->bool{match (a,b){(None,None)=>true,(Some(x),Some(y))=>chrono::DateTime::parse_from_rfc3339(x).ok().map(|d|d.timestamp())==chrono::DateTime::parse_from_rfc3339(y).ok().map(|d|d.timestamp()),_=>false}}

#[cfg(test)]
fn youtube_truncate_utf8_bytes(input:&str,max_bytes:usize)->String{
 if input.len()<=max_bytes{return input.to_string()}
 let mut end=max_bytes.min(input.len());while end>0&&!input.is_char_boundary(end){end-=1}input[..end].to_string()
}
#[cfg(not(test))]
fn youtube_truncate_utf8_bytes(input:&str,max_bytes:usize)->String{
 if input.len()<=max_bytes{return input.to_string()}
 let mut end=max_bytes.min(input.len());while end>0&&!input.is_char_boundary(end){end-=1}input[..end].to_string()
}
fn youtube_clean_title(input:&str)->String{input.trim().replace(['<','>']," ").chars().take(100).collect::<String>().trim().to_string()}
fn youtube_tag_cost(tag:&str,has_previous:bool)->usize{tag.chars().count()+if tag.contains(char::is_whitespace){2}else{0}+if has_previous{1}else{0}}
fn youtube_sanitize_tags(tags:Vec<String>)->Vec<String>{
 let mut out=Vec::<String>::new();let mut used=0usize;
 for raw in tags{let tag=raw.trim().replace(['<','>']," ").split_whitespace().collect::<Vec<_>>().join(" ");if tag.is_empty()||out.iter().any(|x|x.eq_ignore_ascii_case(&tag)){continue}let cost=youtube_tag_cost(&tag,!out.is_empty());if used+cost>500{continue}used+=cost;out.push(tag)}out
}
fn youtube_norm_text(input:&str)->String{input.replace("\r\n","\n").replace('\r',"\n").lines().map(|x|x.trim_end()).collect::<Vec<_>>().join("\n").trim().to_string()}
fn youtube_norm_tags(tags:&[String])->Vec<String>{let mut out=tags.iter().map(|x|x.trim().split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()).filter(|x|!x.is_empty()).collect::<Vec<_>>();out.sort();out.dedup();out}
fn youtube_metadata_diff(sn:&Value,wanted_title:&str,wanted_desc:&str,wanted_tags:&[String])->Vec<String>{let mut diff=Vec::<String>::new();let got_title=sn.get("title").and_then(|x|x.as_str()).unwrap_or("");let got_desc=sn.get("description").and_then(|x|x.as_str()).unwrap_or("");let got_tags=sn.get("tags").and_then(|x|x.as_array()).cloned().unwrap_or_default().into_iter().filter_map(|x|x.as_str().map(str::to_string)).collect::<Vec<_>>();if youtube_norm_text(got_title)!=youtube_norm_text(wanted_title){diff.push("title".to_string())}if youtube_norm_text(got_desc)!=youtube_norm_text(wanted_desc){diff.push("description".to_string())}if youtube_norm_tags(&got_tags)!=youtube_norm_tags(wanted_tags){diff.push("tags".to_string())}diff}
fn youtube_status_body(old_status:&Value,target_privacy:&str,publish_at:Option<&str>)->Value{
 let mut ns=json!({"privacyStatus":target_privacy});if let Some(p)=publish_at{ns["publishAt"]=json!(p);}for k in ["embeddable","license","publicStatsViewable","selfDeclaredMadeForKids","containsSyntheticMedia"]{if let Some(x)=old_status.get(k){ns[k]=x.clone();}}ns
}

#[tauri::command]
pub async fn youtube_update_existing_video(app:AppHandle,profile_id:String,video_id:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>,privacy_status:Option<String>)->Result<Value,String>{
 let (token,profile)=valid_access_token(&app,&profile_id).await?;
 if !profile.scopes.iter().any(|s|s=="https://www.googleapis.com/auth/youtube.force-ssl"||s=="https://www.googleapis.com/auth/youtube"){return Err("YouTube профиль подключён со старыми правами. Переподключи канал.".into())}
 let client=reqwest::Client::new();
 let r=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status"),("id",video_id.as_str())]).send().await.map_err(|e|format!("YouTube video read: {e}"))?;
 let st=r.status();let v:Value=r.json().await.map_err(|e|e.to_string())?;if !st.is_success(){return Err(youtube_error(&v,"Не удалось перечитать видео"))}
 let item=v.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).ok_or_else(||"Видео не найдено".to_string())?;
 let sn=item.get("snippet").cloned().unwrap_or_else(||json!({}));let old_status=item.get("status").cloned().unwrap_or_else(||json!({}));
 if profile.channel_id.as_deref()!=sn.get("channelId").and_then(|x|x.as_str()){return Err(format!("BLOCK {}: video.channelId не совпадает с oauthProfile.channelId",video_id))}
 let wanted_title=youtube_clean_title(&title);if wanted_title.is_empty(){return Err("YouTube title не может быть пустым".into())}
 let wanted_desc=youtube_truncate_utf8_bytes(&description,5000);let wanted_tags_vec=youtube_sanitize_tags(tags);let category=sn.get("categoryId").and_then(|x|x.as_str()).unwrap_or("10").to_string();
 let metadata_needed=!youtube_metadata_diff(&sn,&wanted_title,&wanted_desc,&wanted_tags_vec).is_empty();
 let old_privacy=old_status.get("privacyStatus").and_then(|x|x.as_str()).unwrap_or("private");
 let target_privacy=privacy_status.as_deref().filter(|x|matches!(*x,"private"|"public"|"unlisted")).unwrap_or(old_privacy).to_string();
 let publish=publish_at.as_deref().map(str::trim).filter(|x|!x.is_empty());
 let schedule_requested=publish.is_some()||target_privacy!=old_privacy;
 let mut schedule_pre_error:Option<String>=None;
 if publish.is_some()&&target_privacy!="private"{schedule_pre_error=Some("Scheduled publishAt требует privacyStatus=private".into())}
 if let Some(p)=publish{match chrono::DateTime::parse_from_rfc3339(p){Ok(dt)=>{if dt.with_timezone(&Utc)<=Utc::now(){schedule_pre_error=Some("Дата публикации уже в прошлом".into())}},Err(_)=>schedule_pre_error=Some("Некорректный publishAt: ожидается RFC3339".into())}}
 let status_changed=target_privacy!=old_privacy||match publish{Some(w)=>!same_publish_time(Some(w),old_status.get("publishAt").and_then(|x|x.as_str())),None=>false};
 let schedule_needed=schedule_requested&&status_changed&&schedule_pre_error.is_none();
 if !metadata_needed&&!schedule_needed{
  return Ok(json!({"id":video_id,"verified":true,"metadataAccepted":true,"metadataVerified":true,"metadataVerifyPending":false,"scheduleRequested":schedule_requested,"scheduleAccepted":schedule_pre_error.is_none(),"scheduleVerified":schedule_pre_error.is_none(),"scheduleVerifyPending":false,"scheduleError":schedule_pre_error,"skipped":true,"appliedTags":wanted_tags_vec.len()}))
 }
 let snippet=json!({"title":wanted_title,"description":wanted_desc,"tags":wanted_tags_vec,"categoryId":category});
 let desired_status=youtube_status_body(&old_status,&target_privacy,publish);
 let mut metadata_accepted=!metadata_needed;let mut schedule_accepted=!schedule_needed&&schedule_pre_error.is_none();let mut response=Value::Null;let mut schedule_error=schedule_pre_error.clone();
 if metadata_needed&&schedule_needed{
  let body=json!({"id":video_id,"snippet":snippet,"status":desired_status});
  let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status")]).json(&body).send().await.map_err(|e|format!("YouTube combined update: {e}"))?;
  let ust=u.status();let uv:Value=u.json().await.unwrap_or_else(|_|json!({}));
  if ust.is_success(){metadata_accepted=true;schedule_accepted=true;response=uv}else{
   let err=youtube_error(&uv,"YouTube не принял metadata/schedule");if err.to_lowercase().contains("quotaexceeded")||err.to_lowercase().contains("daily limit"){return Err(err)}
   let sb=json!({"id":video_id,"snippet":snippet});
   let mu=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet")]).json(&sb).send().await.map_err(|e|format!("YouTube metadata fallback: {e}"))?;
   let mst=mu.status();let mv:Value=mu.json().await.unwrap_or_else(|_|json!({}));if !mst.is_success(){return Err(format!("METADATA: {}",youtube_error(&mv,"YouTube не принял title/description/tags")))}
   metadata_accepted=true;response=mv;schedule_error=Some(err);
  }
 }else if metadata_needed{
  let body=json!({"id":video_id,"snippet":snippet});let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet")]).json(&body).send().await.map_err(|e|format!("YouTube metadata update: {e}"))?;let ust=u.status();let uv:Value=u.json().await.unwrap_or_else(|_|json!({}));if !ust.is_success(){return Err(format!("METADATA: {}",youtube_error(&uv,"YouTube не принял title/description/tags")))}metadata_accepted=true;response=uv;
 }else if schedule_needed{
  let body=json!({"id":video_id,"status":desired_status});let u=client.put("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","status")]).json(&body).send().await.map_err(|e|format!("YouTube schedule update: {e}"))?;let ust=u.status();let uv:Value=u.json().await.unwrap_or_else(|_|json!({}));if !ust.is_success(){let err=youtube_error(&uv,"YouTube не принял расписание/privacy");if err.to_lowercase().contains("quotaexceeded")||err.to_lowercase().contains("daily limit"){return Err(err)}schedule_error=Some(err)}else{schedule_accepted=true;response=uv}
 }
 if metadata_needed&&!metadata_accepted{return Err("YouTube metadata write не подтверждён".into())}
 let mut metadata_verified=!metadata_needed;let mut schedule_verified=!schedule_needed&&schedule_error.is_none();
 if metadata_accepted&&metadata_needed{metadata_verified=youtube_metadata_diff(response.get("snippet").unwrap_or(&Value::Null),&wanted_title,&wanted_desc,&wanted_tags_vec).is_empty()}
 if schedule_accepted&&schedule_needed{let rs=response.get("status").unwrap_or(&Value::Null);let time_ok=publish.map(|w|same_publish_time(Some(w),rs.get("publishAt").and_then(|x|x.as_str()))).unwrap_or(true);let privacy_ok=rs.get("privacyStatus").and_then(|x|x.as_str())==Some(target_privacy.as_str());schedule_verified=time_ok&&privacy_ok}
 if (metadata_accepted&&!metadata_verified)||(schedule_accepted&&!schedule_verified){for delay in [300u64,1200]{tokio::time::sleep(std::time::Duration::from_millis(delay)).await;let q=client.get("https://www.googleapis.com/youtube/v3/videos").bearer_auth(&token).query(&[("part","snippet,status"),("id",video_id.as_str())]).send().await;if let Ok(q)=q{let qs=q.status();let qv:Value=q.json().await.unwrap_or_else(|_|json!({}));if !qs.is_success(){continue}if let Some(g)=qv.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()){if metadata_accepted{metadata_verified=youtube_metadata_diff(g.get("snippet").unwrap_or(&Value::Null),&wanted_title,&wanted_desc,&wanted_tags_vec).is_empty()}if schedule_accepted&&schedule_needed{let gs=g.get("status").unwrap_or(&Value::Null);let time_ok=publish.map(|w|same_publish_time(Some(w),gs.get("publishAt").and_then(|x|x.as_str()))).unwrap_or(true);let privacy_ok=gs.get("privacyStatus").and_then(|x|x.as_str())==Some(target_privacy.as_str());schedule_verified=time_ok&&privacy_ok}if metadata_verified&&(!schedule_accepted||schedule_verified){break}}}}
 }
 Ok(json!({"id":video_id,"verified":metadata_accepted&&(!schedule_requested||schedule_accepted),"metadataAccepted":metadata_accepted,"metadataVerified":metadata_verified,"metadataVerifyPending":metadata_accepted&&!metadata_verified,"scheduleRequested":schedule_requested,"scheduleAccepted":schedule_accepted,"scheduleVerified":schedule_verified,"scheduleVerifyPending":schedule_accepted&&schedule_needed&&!schedule_verified,"scheduleError":schedule_error,"skipped":false,"appliedTags":wanted_tags_vec.len()}))
}

#[cfg(test)]
mod youtube_write_tests{use super::*;#[test]fn same_publish_time_normalizes_offsets(){assert!(same_publish_time(Some("2026-09-04T04:00:00+07:00"),Some("2026-09-03T21:00:00Z")));}#[test]fn metadata_verify_ignores_tag_order_and_line_endings(){let sn=json!({"title":"  Hello  ","description":"A\r\nB","tags":["Paris Night","Deep House"]});let wanted=vec!["deep house".to_string(),"paris night".to_string()];assert!(youtube_metadata_diff(&sn,"Hello","A\nB",&wanted).is_empty());}#[test]fn utf8_description_respects_5000_bytes(){let s="я".repeat(3000);let out=youtube_truncate_utf8_bytes(&s,5000);assert!(out.len()<=5000);assert!(out.is_char_boundary(out.len()));}#[test]fn tags_respect_youtube_500_budget(){let tags=(0..100).map(|i|format!("long tag number {} abcdefghijklmnop",i)).collect::<Vec<_>>();let out=youtube_sanitize_tags(tags);let mut used=0;for (i,t) in out.iter().enumerate(){used+=youtube_tag_cost(t,i>0);}assert!(used<=500);assert!(!out.is_empty());}#[test]fn tags_dedupe_and_strip_angle_brackets(){let out=youtube_sanitize_tags(vec![" alpha ".into(),"ALPHA".into(),"<beta tag>".into()]);assert_eq!(out.len(),2);assert!(!out[1].contains('<'));assert!(!out[1].contains('>'));}}

#[tauri::command]
pub async fn youtube_channel_stats(api_key:String,channel_id:String)->Result<Value,String>{if api_key.trim().is_empty(){return Err("YouTube API Key не указан".into())}if channel_id.trim().is_empty(){return Err("Channel ID не указан".into())}let url=format!("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={}&key={}",urlencoding::encode(channel_id.trim()),urlencoding::encode(api_key.trim()));let r=reqwest::Client::new().get(url).send().await.map_err(|e|format!("Сеть: {e}"))?;let status=r.status();let v:Value=r.json().await.map_err(|e|format!("Ответ YouTube: {e}"))?;if !status.is_success(){return Err(v.get("error").and_then(|e|e.get("message")).and_then(|x|x.as_str()).unwrap_or("YouTube API вернул ошибку").to_string())}let item=v.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).ok_or_else(||"Канал не найден. Проверь Channel ID.".to_string())?;let stat=item.get("statistics").cloned().unwrap_or(json!({}));let num=|k:&str|stat.get(k).and_then(|x|x.as_str()).and_then(|s|s.parse::<u64>().ok());Ok(json!({"title":item.pointer("/snippet/title").and_then(|x|x.as_str()).unwrap_or(""),"subscribers":num("subscriberCount"),"views":num("viewCount"),"videos":num("videoCount")}))}
