from pathlib import Path
import re

project=Path('.vyron-v051')
root=project/'src'

# Settings: close the JSX expression for the async manual update check.
p=root/'SettingsOS.tsx'
s=p.read_text()
old="onClick={async()=>{try{setUpdate(await api.checkUpdate())}catch(e){setUpdate({error:String(e)})}}>Проверить обновления"
new="onClick={async()=>{try{setUpdate(await api.checkUpdate())}catch(e){setUpdate({error:String(e)})}}}>Проверить обновления"
if old not in s:
    raise SystemExit('SettingsOS manual update handler marker missing')
s=s.replace(old,new,1)
s=s.replace("{label:'Updater',status:'Tauri signed updater подключён',ok:true}","{label:'Updater',status:'Update Center настроен',detail:'Подпись новой версии проверяет Tauri updater при установке.'}",1)
p.write_text(s)

# Existing Videos: intentional result limits are not sync mismatches, and Undo only targets verified writes.
p=root/'ExistingVideos.tsx'
s=p.read_text()
old="setBusy(true);let ok=0;try{const saved=await api.youtubeBackupExisting(profileId,backup);"
new="setBusy(true);let ok=0;const verifiedIds=new Set<string>();try{const saved=await api.youtubeBackupExisting(profileId,backup);"
if old not in s:
    raise SystemExit('ExistingVideos verified set anchor missing')
s=s.replace(old,new,1)
old="if(!result?.verified)throw new Error(`YouTube не подтвердил изменение ${v.id}`);ok++;setVideos"
new="if(!result?.verified)throw new Error(`YouTube не подтвердил изменение ${v.id}`);ok++;verifiedIds.add(v.id);setVideos"
if old not in s:
    raise SystemExit('ExistingVideos verified ID marker missing')
s=s.replace(old,new,1)
old="if(ok){setLastUndo(backup);setBaseline(prev=>{const n={...prev};for(const v of selected.filter(x=>x.applyState!=='error'))n[v.id]={...v,tags:[...v.tags]};return n})}"
new="if(ok){setLastUndo(backup.filter(v=>verifiedIds.has(v.id)));setBaseline(prev=>{const n={...prev};for(const v of selected.filter(x=>verifiedIds.has(x.id)))n[v.id]={...v,tags:[...v.tags]};return n})}"
if old not in s:
    raise SystemExit('ExistingVideos baseline marker missing')
s=s.replace(old,new,1)
old="const expected=syncInfo?Math.min(syncInfo.youtubeFound||syncInfo.received,syncInfo.requested||limit):0;const mismatch=Boolean(syncInfo?.complete&&syncInfo.received!==(syncInfo.youtubeFound||syncInfo.received));"
new="const expected=syncInfo?Math.min(syncInfo.youtubeFound||syncInfo.received,syncInfo.requested||limit):0;const mismatch=Boolean(syncInfo&&syncInfo.received!==expected);"
if old not in s:
    raise SystemExit('ExistingVideos sync mismatch marker missing')
s=s.replace(old,new,1)
p.write_text(s)

# Backend generator fix. The replacement in patch_backend_v090 intentionally starts at
# the old function name, so the old argument tail can be concatenated immediately after
# the new function's closing brace as `}(app:AppHandle,...)`. Remove from the exact old
# argument signature up to (but not including) youtube_channel_stats.
p=project/'src-tauri/src/youtube.rs'
s=p.read_text()
legacy_start='(app:AppHandle,profile_id:String,video_id:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>)->Result<Value,String>{'
next_command='#[tauri::command]\npub async fn youtube_channel_stats'
start=s.find(legacy_start)
end=s.find(next_command,start if start>=0 else 0)
if start<0 or end<0 or end<=start:
    raise SystemExit(f'Legacy youtube update tail bounds invalid: start={start}, end={end}')
s=s[:start]+'\n\n'+s[end:]
if s.count('pub async fn youtube_update_existing_video(')!=1:
    raise SystemExit(f'Expected exactly one youtube_update_existing_video, got {s.count("pub async fn youtube_update_existing_video(")}')
if 'privacy_status:Option<String>' not in s or '"verified":true' not in s:
    raise SystemExit('Verified YouTube update implementation missing after cleanup')
if legacy_start in s:
    raise SystemExit('Legacy YouTube update signature still present after cleanup')
p.write_text(s)

# The analytics payload contains many real metrics in one serde_json::json! tree.
# Raise the crate macro expansion ceiling instead of dropping fields.
p=project/'src-tauri/src/lib.rs'
s=p.read_text()
limit='#![recursion_limit = "512"]\n'
if not s.startswith('#![recursion_limit'):
    s=limit+s
elif limit.strip() not in s.splitlines()[:2]:
    s=re.sub(r'^#!\[recursion_limit\s*=\s*"\d+"\]\n',limit,s,count=1)
p.write_text(s)

print('VYRON 0.9.0 frontend + Rust postfix applied')
