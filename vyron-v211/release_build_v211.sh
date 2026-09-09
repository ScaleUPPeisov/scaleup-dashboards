#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v211-release"
ASSETS='/tmp/vyron-v211-release-base'
PATCH_DIR='/tmp/vyron-v211-patch'
SOURCE_SHA='ae47fb1d59dd52ecde8641d0d71043c650534daac2b547111beab6511c67d9d1'
PATCH_SHA='64502df23638bc85c9933ec162121f31007731b56953c3d8fd3bbe7c93725fd4'

say(){ printf '\n==> %s\n' "$*"; }
pass(){ printf '✅ %s\n' "$*"; }

say 'Verify signing material'
test -n "${TAURI_SIGNING_PRIVATE_KEY:-}"
test -n "${TAURI_UPDATER_PUBLIC_KEY:-}"
python3 - <<'PY'
import base64,os
def dec(v):
    try:return base64.b64decode(v.strip(),validate=True).decode()
    except Exception:return None
def norm(name,kind):
    raw=os.environ[name].strip();once=dec(raw)
    if once and once.startswith('untrusted comment:'): out,box=raw,once
    else:
        if not once: raise SystemExit(f'{name}: invalid encoding')
        out=once.strip();box=dec(out)
        if not box or not box.startswith('untrusted comment:'): raise SystemExit(f'{name}: not a Tauri key')
    if kind not in box.splitlines()[0].lower(): raise SystemExit(f'{name}: wrong key type')
    return out
sk=norm('TAURI_SIGNING_PRIVATE_KEY','secret key');pk=norm('TAURI_UPDATER_PUBLIC_KEY','public key')
print(f'::add-mask::{sk}')
with open(os.environ['GITHUB_ENV'],'a') as f:f.write(f'TAURI_SIGNING_PRIVATE_KEY={sk}\nTAURI_UPDATER_PUBLIC_KEY={pk}\n')
PY
export TAURI_SIGNING_PRIVATE_KEY="$(grep '^TAURI_SIGNING_PRIVATE_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"
export TAURI_UPDATER_PUBLIC_KEY="$(grep '^TAURI_UPDATER_PUBLIC_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"
pass 'Signing material normalized'

say 'Reconstruct and verify 2.0.11 patch payload'
rm -rf "$PATCH_DIR"; mkdir -p "$PATCH_DIR"
python3 - "$ROOT" <<'PY2'
import base64,pathlib,sys
root=pathlib.Path(sys.argv[1])/'vyron-v211'
data=''.join(''.join((root/f'payload.a{c}').read_text().split()) for c in 'abcdefgh')
pathlib.Path('/tmp/vyron-v211-portable.tgz').write_bytes(base64.b64decode(data,validate=True))
PY2
GOT_PATCH="$(shasum -a 256 /tmp/vyron-v211-portable.tgz|awk '{print $1}')"
test "$GOT_PATCH" = "$PATCH_SHA"
tar -xzf /tmp/vyron-v211-portable.tgz -C "$PATCH_DIR" --strip-components=1
for n in {1..8}; do test -f "$PATCH_DIR/step${n}_"*.py; done
pass "Patch SHA256 $PATCH_SHA"

say 'Download exact public VYRON 2.0.10 source'
rm -rf "$WORK" "$ASSETS"; mkdir -p "$WORK" "$ASSETS"
gh release download v2.0.10 --repo "$REPO" --pattern 'VYRON-2.0.10-source.tar.gz' --dir "$ASSETS"
GOT_SOURCE="$(shasum -a 256 "$ASSETS/VYRON-2.0.10-source.tar.gz"|awk '{print $1}')"
test "$GOT_SOURCE" = "$SOURCE_SHA"
tar -xzf "$ASSETS/VYRON-2.0.10-source.tar.gz" -C "$WORK"
test "$(node -p "require('$WORK/package.json').version")" = '2.0.10'
pass "Official 2.0.10 source SHA256 $SOURCE_SHA"

say 'Apply deterministic 2.0.11 patch'
for f in "$PATCH_DIR"/step{1..8}_*.py; do python3 "$f" "$WORK"; done
python3 - "$WORK/src/v211FeatureContracts.test.ts" <<'PY2'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
s=s.replace("readFileSync(new URL(p,import.meta.url),'utf8')", "readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8')")
p.write_text(s)
PY2
python3 - "$WORK/src-tauri/src/production_manager.rs" <<'PY2'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
old='if m.projects.is_empty(){atomic_json(&mp,&m)?;atomic_json(&status_path,&st)?;return Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:None})}'
new='if m.projects.is_empty(){fs::remove_dir_all(&broot).map_err(|e|format!("Не удалось удалить batch: {e}"))?;return Ok(DeleteResult{deleted_project_ids,deleted_job_ids,batch:None})}'
if old not in s: raise SystemExit('delete-all regression restore anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
PY2
cd "$WORK"

say 'Static requested-feature and regression contracts'
python3 - <<'PY'
import json,os,re
from pathlib import Path
r=Path('.')
p=json.loads((r/'package.json').read_text()); c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.11' and c['version']=='2.0.11'
assert c['identifier']=='studio.channelflow.desktop'
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
assert c['plugins']['updater']['endpoints']==['https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json','https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json']
pub=(r/'src/PublisherOS.tsx').read_text(); sched=(r/'src/publisherSchedule.ts').read_text(); meta=(r/'src/publisherMetadata.ts').read_text(); quota=(r/'src/publisherQuota.ts').read_text()
for t in ("['file','Из файла']","['daily','Каждый день']","['2/2','2/2']","['3/1','3/1']",'Время публикации','Preview дат','resolvedUploadMetadata(j,row,publishAt','Video Uploads сегодня','Можно загрузить сегодня','Quota: план / факт'): assert t in pub,t
assert "mode==='2/2'" in sched and 'publishDays:3,pauseDays:1' in sched
assert 'row.publishAt&&row.publishTime' in meta and 'metadataRowForJob' in meta
assert 'publisherVideoCapacity' in quota and 'quotaDelta' in quota
yt=(r/'src-tauri/src/youtube.rs').read_text(); ex=(r/'src/ExistingVideos.tsx').read_text()
for t in ('categoryId','youtube_playlist_membership','playlistItems.insert','playlistItems.delete','playlistItems.list','source":"owner-authorized videos.list immediately before write','YOUTUBE_UPLOAD_CHUNK_BYTES:usize=32*1024*1024','continue_persisted_upload(&app,&session,&token,false)'): assert t in yt,t
block=yt[yt.index('pub async fn youtube_update_existing_video'):yt.index('\n#[tauri::command]\npub async fn youtube_list_playlists')]
assert block.count('emit_youtube_api_request(&app,"videos.update"')==1
assert block.count('emit_youtube_api_request(&app,"videos.list"')==2
assert 'let verified=metadata_verified&&schedule_verified;' in block
for t in ('Category ID','Плейлист','authoritative backup','Последний Apply','Последний Undo','План <b>','Факт <b>','Разница <b>','Осталось <b>'): assert t in ex,t
undo=ex[ex.index('async function undo()'):ex.index(' const displayDate=')]; assert 'await sync()' not in undo
prod=(r/'src/ProductionManager.tsx').read_text(); rustprod=(r/'src-tauri/src/production_manager.rs').read_text()
assert prod.count('window.confirm(')>=2 and 'УДАЛИТЬ ВСЕ PROJECT ASSETS' in prod
assert 'cleanup_completed_production_assets' in rustprod and 'render_status!="Completed"' in rustprod and 'output_path.is_file()' in rustprod
cleanup_block=rustprod[rustprod.index('fn cleanup_completed_assets'):rustprod.index('pub fn delete_production_batch_projects')]; assert 'remove_dir_all' not in cleanup_block
app=(r/'src/App.tsx').read_text(); settings=(r/'src/SettingsOS.tsx').read_text(); history=(r/'src/releaseHistory.ts').read_text()
assert 'setErrorsOpen(true)' in app and 'Ошибки VYRON' in app
assert 'Что менялось по дням' in settings
for v in ("version:'2.0.9'","version:'2.0.10'","version:'2.0.11'"): assert v in history
sec=(r/'src-tauri/src/security.rs').read_text(); storage=(r/'src-tauri/src/storage.rs').read_text(); cargo=(r/'src-tauri/Cargo.toml').read_text(); pm=(r/'src/ProductionOS.tsx').read_text(); local=(r/'src-tauri/src/local_delete.rs').read_text()
assert 'security-framework = "3.7.0"' in cargo
for t in ('set_generic_password','get_generic_password','delete_generic_password','write_private_atomic'): assert t in sec,t
for t in ('secure_state_for_disk','hydrate_state_secrets','path.with_extension("bak")'): assert t in storage,t
assert '+ Будущий канал' in pm and 'setChannelId(created.id)' in pm
assert 'trash::delete(&p)' in local
for f in ('src/v211FeatureContracts.test.ts','src/youtubeExistingV211.test.ts','src/publisherMetadata.test.ts','src/publisherQuota.test.ts','src/publisherSchedule.test.ts'): assert (r/f).exists(),f
print('✅ VYRON 2.0.11 static feature + regression contracts')
PY

say 'Frontend dependency lock + tests'
npm ci --no-audit --no-fund
npm test
pass 'Frontend Vitest suite'

say 'Frontend production build / TypeScript'
npm run build
pass 'Frontend production build'

say 'Rust unit tests'
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --nocapture
pass 'Rust tests'

say 'Rust ARM64 compile check'
rustup target add aarch64-apple-darwin >/dev/null
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin
pass 'cargo check aarch64-apple-darwin'

say 'Tauri macOS Apple Silicon app + DMG + signed updater'
npx tauri build --target aarch64-apple-darwin --bundles app,dmg
APP=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -maxdepth 1 -name 'VYRON.app' -print -quit)
DMG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -print -quit)
UPDATER=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz' -print -quit)
SIG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz.sig' -print -quit)
test -d "$APP" -a -s "$DMG" -a -s "$UPDATER" -a -s "$SIG"
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = 'studio.channelflow.desktop'
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.11'
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
pass 'Tauri build + codesign + DMG verify + updater signature asset'

say 'Package exact tested candidate'
rm -rf release; mkdir release
cp "$DMG" release/VYRON-2.0.11-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-2.0.11-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-2.0.11-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-2.0.11-source.tar.gz > release/SOURCE_SHA256.txt
cat > release/FINAL_TEST_REPORT.md <<'EOF'
# VYRON 2.0.11 — FINAL TEST

- ✅ Patch payload SHA256 verified
- ✅ Official VYRON 2.0.10 source SHA256 verified
- ✅ Publisher schedule: Из файла / Каждый день / 2/2 / 3/1 + time + preview
- ✅ Publisher DATE + PUBLISH TIME metadata mapping
- ✅ Publisher title / description / tags / publishAt resolved before videos.insert
- ✅ Publisher YouTube quota capacity + plan/fact/delta
- ✅ Resumable upload: 32 MiB chunks; new session skips redundant initial probe; recovery preserved
- ✅ Project asset cleanup: two confirmations; Completed + output required; rendered MP4 preserved
- ✅ Clickable top-right Error Center
- ✅ Settings → Updates dated changelog (2.0.9 / 2.0.10 / 2.0.11)
- ✅ Existing Videos category update
- ✅ Playlist add/remove with pre-read + mandatory verify
- ✅ Authoritative owner-authorized backup before write
- ✅ Verified Undo without hidden sync
- ✅ Existing Videos quota plan / fact / delta / remaining
- ✅ Mandatory post-videos.update verify and channel isolation preserved
- ✅ Frontend Vitest suite
- ✅ Frontend production build / TypeScript
- ✅ Rust unit tests
- ✅ ARM64 cargo check
- ✅ Tauri Apple Silicon build
- ✅ codesign verify
- ✅ DMG verify
- ✅ Tauri updater package + signature generated

Note: automated CI validates request graphs, contracts, compilation, packaging and local behavior. It does not mutate a real YouTube channel because CI has no user's OAuth test channel/video.
EOF
pass 'Final candidate packaged'

echo 'VYRON 2.0.11 FINAL GATE: PASS'
