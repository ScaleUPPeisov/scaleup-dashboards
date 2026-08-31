from pathlib import Path
import json,re
root=Path('.vyron-v051')

# Rust OAuth fixes
p=root/'src-tauri/src/youtube.rs'; s=p.read_text()
old='fn load_store(app:&AppHandle)->Result<OAuthStore,String>{let p=store_path(app)?;if !p.exists(){return Ok(OAuthStore::default())}let b=fs::read(p).map_err(|e|e.to_string())?;serde_json::from_slice(&b).map_err(|e|format!("OAuth store: {e}"))}\nfn save_store(app:&AppHandle,s:&OAuthStore)->Result<(),String>{let p=store_path(app)?;fs::write(&p,serde_json::to_vec_pretty(s).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;#[cfg(unix)]{use std::os::unix::fs::PermissionsExt;let _=fs::set_permissions(&p,fs::Permissions::from_mode(0o600));}Ok(())}'
new='''fn load_store(app:&AppHandle)->Result<OAuthStore,String>{
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
}'''
assert old in s, 'load/save OAuth marker missing'; s=s.replace(old,new,1)
old="let html=if ok{\"<html><body style='font-family:-apple-system;padding:40px;background:#07111d;color:white'><h2>VYRON подключён к YouTube ✅</h2><p>Можно закрыть это окно и вернуться в приложение.</p></body></html>\"}else{\"<html><body><h2>VYRON OAuth error</h2><p>Вернитесь в приложение.</p></body></html>\"};"
new="let html=if ok{\"<html><body style='font-family:-apple-system;padding:40px;background:#07111d;color:white'><h2>Google подтвердил доступ ✅</h2><p>VYRON завершает проверку токена и YouTube-канала. Вернитесь в приложение — окончательный статус будет показан там.</p></body></html>\"}else{\"<html><body><h2>VYRON OAuth error</h2><p>Вернитесь в приложение.</p></body></html>\"};"
assert old in s, 'OAuth callback HTML marker missing'; s=s.replace(old,new,1)
old='let me=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true").bearer_auth(&access).send().await.map_err(|e|format!("YouTube account: {e}"))?;let mv:Value=me.json().await.unwrap_or_else(|_|json!({}));let item=mv.get("items").and_then(|x|x.as_array()).and_then(|a|a.first());let channel_id=item.and_then(|x|x.get("id")).and_then(|x|x.as_str()).map(str::to_string);let channel_title=item.and_then(|x|x.pointer("/snippet/title")).and_then(|x|x.as_str()).map(str::to_string);\n let profile=OAuthProfile{id:Uuid::new_v4().to_string(),client_id:client_id.clone(),channel_id:channel_id.clone(),channel_title:channel_title.clone(),access_token:access,refresh_token:refresh,expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),scopes:scopes.clone()};let mut s=load_store(&app)?;s.profiles.retain(|p|p.channel_id.is_none()||p.channel_id!=profile.channel_id);s.profiles.push(profile.clone());save_store(&app,&s)?;Ok(json!({"id":profile.id,"channelId":channel_id,"channelTitle":channel_title,"connectedAt":profile.connected_at}))'
new='''if refresh.is_empty(){return Err("Google не вернул refresh_token. Отключи доступ VYRON в Google Account и подключи YouTube заново.".into())}
 let me=reqwest::Client::new().get("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true").bearer_auth(&access).send().await.map_err(|e|format!("YouTube account network: {e}"))?;
 let me_status=me.status();
 let mv:Value=me.json().await.map_err(|e|format!("YouTube account JSON: {e}"))?;
 if !me_status.is_success(){return Err(youtube_error(&mv,"Не удалось получить YouTube-канал. Проверь, что YouTube Data API v3 включён именно в проекте VYRON."))}
 let item=mv.get("items").and_then(|x|x.as_array()).and_then(|a|a.first()).ok_or_else(||"На выбранном Google-аккаунте YouTube-канал не найден".to_string())?;
 let channel_id=item.get("id").and_then(|x|x.as_str()).map(str::to_string).ok_or_else(||"YouTube не вернул Channel ID".to_string())?;
 let channel_title=item.pointer("/snippet/title").and_then(|x|x.as_str()).map(str::to_string).unwrap_or_else(||channel_id.clone());
 let profile=OAuthProfile{id:Uuid::new_v4().to_string(),client_id:client_id.clone(),channel_id:Some(channel_id.clone()),channel_title:Some(channel_title.clone()),access_token:access,refresh_token:refresh,expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),scopes:scopes.clone()};
 let mut s=load_store(&app)?;s.profiles.retain(|p|p.channel_id.as_deref()!=Some(channel_id.as_str()));s.profiles.push(profile.clone());save_store(&app,&s)?;
 let verify=load_store(&app)?;if !verify.profiles.iter().any(|p|p.id==profile.id){return Err("OAuth профиль не сохранился на диск".into())}
 Ok(json!({"id":profile.id,"channelId":channel_id,"channelTitle":channel_title,"connectedAt":profile.connected_at}))'''
assert old in s, 'YouTube channel validation marker missing'; s=s.replace(old,new,1); p.write_text(s)

# Frontend: persistent OAuth status instead of silent failure
p=root/'src/App.tsx'; s=p.read_text()
old="function Settings({license,setLicense}:{license:LicenseStatus;setLicense:(x:LicenseStatus)=>void}){const s=useApp(x=>x.settings),patch=useApp(x=>x.patchSettings),logs=useApp(x=>x.logs),toast=useApp(x=>x.toast);const [tab,setTab]=useState<'general'|'autopilot'|'integrations'|'subscription'|'updates'|'diagnostics'|'about'>('general'),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[connecting,setConnecting]=useState(false),[update,setUpdate]=useState<any>(),[progress,setProgress]=useState<number|null>(null),[diag,setDiag]=useState<any>(),[key,setKey]=useState('');const refreshProfiles=()=>api.youtubeProfiles().then(setProfiles).catch(()=>setProfiles([]));useEffect(()=>{void refreshProfiles()},[]);return <>"
new="function Settings({license,setLicense}:{license:LicenseStatus;setLicense:(x:LicenseStatus)=>void}){const s=useApp(x=>x.settings),patch=useApp(x=>x.patchSettings),logs=useApp(x=>x.logs),toast=useApp(x=>x.toast),log=useApp(x=>x.log);const [tab,setTab]=useState<'general'|'autopilot'|'integrations'|'subscription'|'updates'|'diagnostics'|'about'>('general'),[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[connecting,setConnecting]=useState(false),[oauthMessage,setOauthMessage]=useState(''),[oauthError,setOauthError]=useState(false),[update,setUpdate]=useState<any>(),[progress,setProgress]=useState<number|null>(null),[diag,setDiag]=useState<any>(),[key,setKey]=useState('');const refreshProfiles=async()=>{try{const p=await api.youtubeProfiles();setProfiles(p);setOauthError(false);setOauthMessage(p.length?`OAuth: подключено профилей — ${p.length}`:'OAuth: сохранённых YouTube-профилей пока нет');return p}catch(e){const m=`OAuth storage: ${String(e)}`;setProfiles([]);setOauthError(true);setOauthMessage(m);log(m,'error');throw e}};useEffect(()=>{void refreshProfiles().catch(()=>{})},[]);return <>"
assert old in s, 'Settings OAuth state marker missing'; s=s.replace(old,new,1)
old="onClick={async()=>{setConnecting(true);try{const p=await api.youtubeConnect(s.youtubeOAuthClientId);toast(`YouTube подключён: ${p.channelTitle||p.channelId||'канал'}`);await refreshProfiles()}catch(e){toast(String(e))}finally{setConnecting(false)}}}"
new="onClick={async()=>{setConnecting(true);setOauthError(false);setOauthMessage('OAuth: ожидаю подтверждение Google…');try{const p=await api.youtubeConnect(s.youtubeOAuthClientId);const m=`YouTube подключён: ${p.channelTitle||p.channelId||'канал'}`;setOauthMessage(m);toast(m);log(m);await refreshProfiles()}catch(e){const m=`OAuth: ${String(e)}`;setOauthError(true);setOauthMessage(m);toast(m);log(m,'error')}finally{setConnecting(false)}}}"
assert old in s, 'Connect handler marker missing'; s=s.replace(old,new,1)
old='<button onClick={()=>void refreshProfiles()}>↻ ОБНОВИТЬ</button></div>{profiles.map(p=>'
new='<button onClick={async()=>{try{const p=await refreshProfiles();toast(p.length?`OAuth профилей: ${p.length}`:\'OAuth профили не найдены\')}catch(e){toast(String(e))}}}>↻ ОБНОВИТЬ</button></div>{oauthMessage&&<div className={oauthError?\'errorBox\':profiles.length?\'successBox\':\'publisherNotice\'}>{oauthMessage}</div>}{profiles.map(p=>'
assert old in s, 'Refresh UI marker missing'; s=s.replace(old,new,1)
s=s.replace('VYRON 0.5.1 • macOS Apple Silicon','VYRON 0.5.2 • macOS Apple Silicon')
s=s.replace('<span className="crumb">VYRON 0.5.1</span>','<span className="crumb">VYRON 0.5.2</span>')
s=s.replace('Версия 0.5.0. Проверка версии работает внутри приложения.','Версия 0.5.2. Проверка версии работает внутри приложения.')
s=s.replace("update.current||'0.5.0'","update.current||'0.5.2'")
s=s.replace('<span>Версия <b>0.5.0</b></span>','<span>Версия <b>0.5.2</b></span>')
p.write_text(s)

# Version metadata
for fn in [root/'package.json',root/'src-tauri/tauri.conf.json']:
 d=json.loads(fn.read_text()); d['version']='0.5.2'; fn.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'src-tauri/Cargo.toml'; s=p.read_text(); s,n=re.subn(r'^version = "0\.5\.1"$','version = "0.5.2"',s,count=1,flags=re.M); assert n==1; p.write_text(s)
p=root/'package-lock.json'; d=json.loads(p.read_text()); d['version']='0.5.2'; d.setdefault('packages',{}).setdefault('',{})['version']='0.5.2'; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=root/'src-tauri/Cargo.lock'; s=p.read_text(); old='name = "channelflow"\nversion = "0.5.1"'; assert old in s; p.write_text(s.replace(old,'name = "channelflow"\nversion = "0.5.2"',1))
print('VYRON 0.5.2 OAuth fix applied')
