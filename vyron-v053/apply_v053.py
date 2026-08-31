from pathlib import Path

root=Path('.vyron-v051')

# Rust OAuth: require/store/use client_secret for token exchange and refresh.
p=root/'src-tauri/src/youtube.rs'
s=p.read_text()
s=s.replace('struct OAuthProfile{id:String,client_id:String,channel_id:Option<String>,channel_title:Option<String>,access_token:String,refresh_token:String,expires_at:i64,connected_at:String,#[serde(default)] scopes:Vec<String>}',
'''struct OAuthProfile{id:String,client_id:String,#[serde(default)] client_secret:String,channel_id:Option<String>,channel_title:Option<String>,access_token:String,refresh_token:String,expires_at:i64,connected_at:String,#[serde(default)] scopes:Vec<String>}''')
s=s.replace('pub async fn youtube_oauth_connect(app:AppHandle,client_id:String)->Result<Value,String>{\n let client_id=client_id.trim().to_string();if client_id.is_empty(){return Err("Google OAuth Client ID не указан".into())}',
'''pub async fn youtube_oauth_connect(app:AppHandle,client_id:String,client_secret:String)->Result<Value,String>{\n let client_id=client_id.trim().to_string();if client_id.is_empty(){return Err("Google OAuth Client ID не указан".into())}\n let client_secret=client_secret.trim().to_string();if client_secret.is_empty(){return Err("Google OAuth Client Secret не указан".into())}''')
old='let token=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&[("client_id",client_id.as_str()),("code",code.as_str()),("code_verifier",verifier.as_str()),("grant_type","authorization_code"),("redirect_uri",redirect.as_str())])'
new='let token=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&[("client_id",client_id.as_str()),("client_secret",client_secret.as_str()),("code",code.as_str()),("code_verifier",verifier.as_str()),("grant_type","authorization_code"),("redirect_uri",redirect.as_str())])'
if old not in s: raise SystemExit('token exchange marker missing')
s=s.replace(old,new,1)
old='let profile=OAuthProfile{id:Uuid::new_v4().to_string(),client_id:client_id.clone(),channel_id:Some(channel_id.clone()),channel_title:Some(channel_title.clone()),access_token:access,refresh_token:refresh,expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),scopes:scopes.clone()};'
new='let profile=OAuthProfile{id:Uuid::new_v4().to_string(),client_id:client_id.clone(),client_secret:client_secret.clone(),channel_id:Some(channel_id.clone()),channel_title:Some(channel_title.clone()),access_token:access,refresh_token:refresh,expires_at:now_ts()+expires,connected_at:Utc::now().to_rfc3339(),scopes:scopes.clone()};'
if old not in s: raise SystemExit('profile marker missing')
s=s.replace(old,new,1)
old='let refresh=s.profiles[idx].refresh_token.clone();let client_id=s.profiles[idx].client_id.clone();if refresh.is_empty(){return Err("Нет refresh_token. Переподключи YouTube с доступом offline.".into())}let r=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&[("client_id",client_id.as_str()),("refresh_token",refresh.as_str()),("grant_type","refresh_token")])'
new='let refresh=s.profiles[idx].refresh_token.clone();let client_id=s.profiles[idx].client_id.clone();let client_secret=s.profiles[idx].client_secret.clone();if refresh.is_empty(){return Err("Нет refresh_token. Переподключи YouTube с доступом offline.".into())}if client_secret.is_empty(){return Err("OAuth-профиль создан без Client Secret. Переподключи YouTube в VYRON 0.5.3.".into())}let r=reqwest::Client::new().post("https://oauth2.googleapis.com/token").form(&[("client_id",client_id.as_str()),("client_secret",client_secret.as_str()),("refresh_token",refresh.as_str()),("grant_type","refresh_token")])'
if old not in s: raise SystemExit('refresh marker missing')
s=s.replace(old,new,1)
p.write_text(s)

# Frontend API signature.
p=root/'src/api.ts'; s=p.read_text()
s=s.replace("youtubeConnect:(clientId:string)=>invoke<YoutubeProfile>('youtube_oauth_connect',{clientId}),","youtubeConnect:(clientId:string,clientSecret:string)=>invoke<YoutubeProfile>('youtube_oauth_connect',{clientId,clientSecret}),")
s=s.replace("current:'0.5.0'","current:'0.5.3'")
p.write_text(s)

# Settings UI: transient password field; never persist in global AppState.
p=root/'src/App.tsx'; s=p.read_text()
old="[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[connecting,setConnecting]=useState(false),[oauthMessage,setOauthMessage]=useState(''),[oauthError,setOauthError]=useState(false),"
new="[profiles,setProfiles]=useState<YoutubeProfile[]>([]),[connecting,setConnecting]=useState(false),[oauthSecret,setOauthSecret]=useState(''),[oauthMessage,setOauthMessage]=useState(''),[oauthError,setOauthError]=useState(false),"
if old not in s: raise SystemExit('Settings state marker missing')
s=s.replace(old,new,1)
old='<input className="wideInput" placeholder="Google OAuth Client ID …apps.googleusercontent.com" value={s.youtubeOAuthClientId} onChange={e=>patch({youtubeOAuthClientId:e.target.value.trim()})}/><div className="cardActions"><button className="primary" disabled={connecting||!s.youtubeOAuthClientId} onClick={async()=>{setConnecting(true);setOauthError(false);setOauthMessage(\'OAuth: ожидаю подтверждение Google…\');try{const p=await api.youtubeConnect(s.youtubeOAuthClientId);const m=`YouTube подключён: ${p.channelTitle||p.channelId||\'канал\'}`;setOauthMessage(m);toast(m);log(m);await refreshProfiles()}catch(e){const m=`OAuth: ${String(e)}`;setOauthError(true);setOauthMessage(m);toast(m);log(m,\'error\')}finally{setConnecting(false)}}}>'
new='<input className="wideInput" placeholder="Google OAuth Client ID …apps.googleusercontent.com" value={s.youtubeOAuthClientId} onChange={e=>patch({youtubeOAuthClientId:e.target.value.trim()})}/><input className="wideInput" type="password" autoComplete="off" placeholder="Google OAuth Client Secret — вводится один раз" value={oauthSecret} onChange={e=>setOauthSecret(e.target.value.trim())}/><small className="note">Client Secret не сохраняется в общих настройках и не выводится в логах. После успешного OAuth он хранится только внутри локального OAuth-профиля.</small><div className="cardActions"><button className="primary" disabled={connecting||!s.youtubeOAuthClientId||!oauthSecret} onClick={async()=>{setConnecting(true);setOauthError(false);setOauthMessage(\'OAuth: ожидаю подтверждение Google…\');try{const p=await api.youtubeConnect(s.youtubeOAuthClientId,oauthSecret);setOauthSecret(\'\');const m=`YouTube подключён: ${p.channelTitle||p.channelId||\'канал\'}`;setOauthMessage(m);toast(m);log(m);await refreshProfiles()}catch(e){const m=`OAuth: ${String(e)}`;setOauthError(true);setOauthMessage(m);toast(m);log(m,\'error\')}finally{setConnecting(false)}}}>'
if old not in s: raise SystemExit('OAuth UI marker missing')
s=s.replace(old,new,1)
s=s.replace('Версия 0.5.2. Проверка версии работает внутри приложения.','Версия 0.5.3. Проверка версии работает внутри приложения.')
s=s.replace("update.current||'0.5.2'","update.current||'0.5.3'")
p.write_text(s)

# Versions.
for rel in ['package.json','src-tauri/tauri.conf.json']:
    p=root/rel; t=p.read_text().replace('"version": "0.5.2"','"version": "0.5.3"'); p.write_text(t)
p=root/'src-tauri/Cargo.toml'; t=p.read_text().replace('version = "0.5.2"','version = "0.5.3"',1); p.write_text(t)
