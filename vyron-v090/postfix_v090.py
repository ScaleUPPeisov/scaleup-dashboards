from pathlib import Path

root=Path('.vyron-v051/src')

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

print('VYRON 0.9.0 frontend postfix applied')
