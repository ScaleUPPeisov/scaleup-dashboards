from pathlib import Path
import json

ROOT=Path('.vyron-v051')

# Add native macOS notification plugin.
pkg=ROOT/'package.json'
d=json.loads(pkg.read_text())
d.setdefault('dependencies',{})['@tauri-apps/plugin-notification']='^2.3.3'
pkg.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')

cargo=ROOT/'src-tauri/Cargo.toml'
s=cargo.read_text()
if 'tauri-plugin-notification' not in s:
    anchor='tauri-plugin-updater = "2"\n'
    if anchor not in s: raise SystemExit('Cargo updater dependency anchor missing')
    s=s.replace(anchor,anchor+'tauri-plugin-notification = "2"\n',1)
cargo.write_text(s)

lib=ROOT/'src-tauri/src/lib.rs'
s=lib.read_text()
if 'tauri_plugin_notification::init()' not in s:
    anchor='        .plugin(tauri_plugin_updater::Builder::new().build())\n'
    if anchor not in s: raise SystemExit('lib updater plugin anchor missing')
    s=s.replace(anchor,anchor+'        .plugin(tauri_plugin_notification::init())\n',1)
lib.write_text(s)

cap=ROOT/'src-tauri/capabilities/default.json'
d=json.loads(cap.read_text())
perms=d.setdefault('permissions',[])
if 'notification:default' not in perms: perms.append('notification:default')
cap.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')

# Native notification once per discovered version + existing in-app UpdateNotice.
app=ROOT/'src/App.tsx'
s=app.read_text()
import_anchor="import { SettingsOS } from './SettingsOS';\n"
notify_import="import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';\n"
if notify_import not in s:
    if import_anchor not in s: raise SystemExit('App import anchor missing')
    s=s.replace(import_anchor,import_anchor+notify_import,1)

nav_anchor='const nav:{page:Page;icon:string;label:string}[]=['
helper="""async function notifyUpdateAvailable(version:string){
  const notifiedKey='vyron:update-notified-version';
  if(localStorage.getItem(notifiedKey)===version)return;
  try{
    let granted=await isPermissionGranted();
    if(!granted&&localStorage.getItem('vyron:notification-permission-requested')!=='1'){
      localStorage.setItem('vyron:notification-permission-requested','1');
      granted=(await requestPermission())==='granted';
    }
    if(granted){
      sendNotification({title:`VYRON ${version} доступен`,body:'Новая версия готова. Открой VYRON и нажми «Установить и перезапустить».'});
      localStorage.setItem(notifiedKey,version);
    }
  }catch{}
}

"""
if 'async function notifyUpdateAvailable' not in s:
    if nav_anchor not in s: raise SystemExit('App nav anchor missing')
    s=s.replace(nav_anchor,helper+nav_anchor,1)

old="useEffect(()=>{if(!booted||!settings.autoCheckUpdates)return;let live=true;const run=()=>api.checkUpdate().then(u=>{if(live&&u?.version)setUpdate(u)}).catch(()=>{});void run();const once=window.setTimeout(()=>void run(),30_000);const recurring=window.setInterval(()=>void run(),6*60*60_000);return()=>{live=false;window.clearTimeout(once);window.clearInterval(recurring)}},[booted,settings.autoCheckUpdates]);"
new="useEffect(()=>{if(!booted||!settings.autoCheckUpdates)return;let live=true;const run=()=>api.checkUpdate().then(u=>{if(live&&u?.version){setUpdate(u);void notifyUpdateAvailable(String(u.version))}}).catch(()=>{});void run();const once=window.setTimeout(()=>void run(),30_000);const recurring=window.setInterval(()=>void run(),6*60*60_000);return()=>{live=false;window.clearTimeout(once);window.clearInterval(recurring)}},[booted,settings.autoCheckUpdates]);"
if old not in s: raise SystemExit('App updater cadence anchor missing')
s=s.replace(old,new,1)
app.write_text(s)

settings=ROOT/'src/SettingsOS.tsx'
s=settings.read_text()
s=s.replace('При запуске, через 30 секунд и далее каждые 6 часов.','При запуске, через 30 секунд и далее каждые 6 часов. Новая версия показывает баннер VYRON и системное уведомление macOS.',1)
settings.write_text(s)

print('VYRON 0.9.3 native updater notifications applied')
