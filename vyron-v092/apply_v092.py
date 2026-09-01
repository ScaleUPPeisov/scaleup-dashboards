from pathlib import Path
import json,re
ROOT=Path('.vyron-v051')
VERSION='0.9.2'

# Backend migration: an existing OAuth profile already contains the Desktop OAuth
# client id/secret. If google-config.json is missing after an app update/migration,
# recover the global config from the first stored profile instead of blocking
# "Add YouTube account". This never exports credentials outside app_data.
p=ROOT/'src-tauri/src/youtube.rs'
s=p.read_text()
old='''#[tauri::command]
pub fn youtube_google_config_status(app:AppHandle)->Result<Value,String>{Ok(google_config_status_value(&load_google_config(&app)?))}
#[tauri::command]
pub fn youtube_google_config_import'''
new='''fn load_or_migrate_google_config(app:&AppHandle)->Result<GoogleConfig,String>{
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
pub fn youtube_google_config_import'''
if old not in s: raise SystemExit('youtube_google_config_status marker missing')
s=s.replace(old,new,1)
old2='''#[tauri::command]
pub async fn youtube_oauth_connect_global(app:AppHandle)->Result<Value,String>{let c=load_google_config(&app)?;if c.client_id.trim().is_empty(){return Err("Сначала импортируй Google credentials.json в разделе Аккаунты".into())}youtube_oauth_connect(app,c.client_id,c.client_secret).await}'''
new2='''#[tauri::command]
pub async fn youtube_oauth_connect_global(app:AppHandle)->Result<Value,String>{let c=load_or_migrate_google_config(&app)?;if c.client_id.trim().is_empty(){return Err("Нет Google OAuth Client. Импортируй credentials.json один раз или подключи существующий OAuth профиль.".into())}youtube_oauth_connect(app,c.client_id,c.client_secret).await}'''
if old2 not in s: raise SystemExit('youtube_oauth_connect_global marker missing')
s=s.replace(old2,new2,1)
p.write_text(s)

# UI: button becomes enabled when either the global config is available OR an
# existing OAuth profile can be used as the migration source. Backend remains the
# authority and will still block safely if no usable client exists.
p=ROOT/'src/AccountsPage.tsx'
s=p.read_text()
s=s.replace("disabled={busy||!config?.configured} onClick={connect}","disabled={busy||(!config?.configured&&!profiles.length)} onClick={connect}",1)
s=s.replace("После импорта credentials.json нажми «Добавить YouTube аккаунт», выбери нужный Gmail и разреши доступ.","Нажми «Добавить YouTube аккаунт», выбери нужный Gmail и разреши доступ. Если уже есть подключённый профиль, VYRON переиспользует его Google OAuth Client автоматически.",1)
p.write_text(s)

# Versions.
for rel in ['package.json','src-tauri/tauri.conf.json']:
 p=ROOT/rel;d=json.loads(p.read_text());d['version']=VERSION;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'package-lock.json';d=json.loads(p.read_text());d['version']=VERSION;d.setdefault('packages',{}).setdefault('',{})['version']=VERSION;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'src-tauri/Cargo.toml';s=p.read_text();s,n=re.subn(r'^version = "0\.9\.1"$',f'version = "{VERSION}"',s,count=1,flags=re.M)
if n!=1: raise SystemExit('Cargo.toml 0.9.1 version marker missing')
p.write_text(s)
for rel in ['src/App.tsx','src/api.ts','src/SettingsOS.tsx']:
 p=ROOT/rel
 if p.exists(): p.write_text(p.read_text().replace('0.9.1',VERSION))
print('VYRON 0.9.2 Google OAuth migration fix applied')
