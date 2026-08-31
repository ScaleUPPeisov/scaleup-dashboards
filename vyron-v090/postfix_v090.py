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
# Do not claim the updater is cryptographically signed from a static diagnostics label.
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

# Backend generator fix: patch_backend_v090 replaces the old function name but the old
# signature/body can remain directly after the new verified update function. Remove only
# that exact legacy duplicate, preserving the following youtube_channel_stats command.
p=project/'src-tauri/src/youtube.rs'
s=p.read_text()
legacy_tail=re.compile(
    r'\n\(app:AppHandle,profile_id:String,video_id:String,title:String,description:String,tags:Vec<String>,publish_at:Option<String>\)->Result<Value,String>\{.*?\n\}\n\n#\[tauri::command\]\npub async fn youtube_channel_stats',
    re.S,
)
s2,n=legacy_tail.subn('\n\n#[tauri::command]\npub async fn youtube_channel_stats',s,count=1)
if n!=1:
    raise SystemExit(f'Legacy youtube_update_existing_video tail: expected 1, got {n}')
if s2.count('pub async fn youtube_update_existing_video(')!=1:
    raise SystemExit('Expected exactly one youtube_update_existing_video after cleanup')
if 'privacy_status:Option<String>' not in s2 or '"verified":true' not in s2:
    raise SystemExit('Verified YouTube update implementation missing after cleanup')
p.write_text(s2)

# The analytics payload intentionally contains many real metrics in one serde_json::json!
# tree. Raise the crate macro expansion ceiling instead of dropping fields.
p=project/'src-tauri/src/lib.rs'
s=p.read_text()
limit='#![recursion_limit = "512"]\n'
if not s.startswith('#![recursion_limit'):
    s=limit+s
elif limit.strip() not in s.splitlines()[:2]:
    s=re.sub(r'^#!\[recursion_limit\s*=\s*"\d+"\]\n',limit,s,count=1)
p.write_text(s)

print('VYRON 0.9.0 frontend + Rust postfix applied')
