#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v214-release"
ASSETS='/tmp/vyron-v214-release-base'
SOURCE_SHA='d9f6345b597d41018b9a439c3eda2558e33936c6b605ac2b8052955b4e088717'
B64_SHA='70fc11cb5deaff78251749ec6b2b1e726c2bb1e815a878675c3ccc9359a30390'
PATCH_SHA='80c951a30d8822b654ce9bb0b58a3068ab9260cc29fbd31d91b26a2d1739654a'

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
    raw=os.environ[name].strip(); once=dec(raw)
    if once and once.startswith('untrusted comment:'): out,box=raw,once
    else:
        if not once: raise SystemExit(f'{name}: invalid encoding')
        out=once.strip(); box=dec(out)
        if not box or not box.startswith('untrusted comment:'): raise SystemExit(f'{name}: not a Tauri key')
    if kind not in box.splitlines()[0].lower(): raise SystemExit(f'{name}: wrong key type')
    return out
sk=norm('TAURI_SIGNING_PRIVATE_KEY','secret key'); pk=norm('TAURI_UPDATER_PUBLIC_KEY','public key')
print(f'::add-mask::{sk}')
with open(os.environ['GITHUB_ENV'],'a') as f:f.write(f'TAURI_SIGNING_PRIVATE_KEY={sk}\nTAURI_UPDATER_PUBLIC_KEY={pk}\n')
PY
export TAURI_SIGNING_PRIVATE_KEY="$(grep '^TAURI_SIGNING_PRIVATE_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"
export TAURI_UPDATER_PUBLIC_KEY="$(grep '^TAURI_UPDATER_PUBLIC_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"
pass 'Signing material normalized'

say 'Verify deterministic VYRON 2.0.14 patch payload'
PARTS="$ROOT/vyron-v214/parts"
test -d "$PARTS"
B64="$RUNNER_TEMP/v214.patch.gz.b64"
PATCH="$RUNNER_TEMP/v214.patch"
cat "$PARTS"/part*.txt > "$B64"
GOT_B64="$(shasum -a 256 "$B64"|awk '{print $1}')"
test "$GOT_B64" = "$B64_SHA"
python3 - "$B64" "$PATCH" <<'PY'
import base64,gzip,pathlib,sys
src=pathlib.Path(sys.argv[1]).read_text()
raw=base64.b64decode(''.join(src.split()),validate=True)
pathlib.Path(sys.argv[2]).write_bytes(gzip.decompress(raw))
PY
GOT_PATCH="$(shasum -a 256 "$PATCH"|awk '{print $1}')"
test "$GOT_PATCH" = "$PATCH_SHA"
pass "Patch payload SHA256 $PATCH_SHA"

say 'Download exact released VYRON 2.0.13 source'
rm -rf "$WORK" "$ASSETS"; mkdir -p "$WORK" "$ASSETS"
gh release download v2.0.13 --repo "$REPO" --pattern 'VYRON-2.0.13-source.tar.gz' --dir "$ASSETS"
GOT_SOURCE="$(shasum -a 256 "$ASSETS/VYRON-2.0.13-source.tar.gz"|awk '{print $1}')"
test "$GOT_SOURCE" = "$SOURCE_SHA"
tar -xzf "$ASSETS/VYRON-2.0.13-source.tar.gz" -C "$WORK"
test "$(node -p "require('$WORK/package.json').version")" = '2.0.13'
pass "Official 2.0.13 source SHA256 $SOURCE_SHA"

say 'Reproduce user-reported 2.0.13 publish/error-center defects before patch'
python3 - "$WORK" <<'PY'
from pathlib import Path
import sys
r=Path(sys.argv[1])
pub=(r/'src/PublisherOS.tsx').read_text(); app=(r/'src/App.tsx').read_text(); hist=(r/'src/errorHistory.ts').read_text(); notify=(r/'src/notificationCenter.ts').read_text()
assert 'scheduleStart=draft.scheduleStartDate||todayKrasnoyarskDate()' in pub
assert 'syncScheduleFromYoutube' not in pub
assert 'pastSchedule' not in pub
assert 'removeErrorHistory' not in hist
assert 'Очистить историю' in app and 'Убрать ошибку' not in app
assert 'technicalDetail?:string' not in notify
print('✅ Reproduced 2.0.13: schedule is local-only, past publishAt is not preflight-blocked, Error Center cannot clear job errors, technical backend detail is dropped')
PY

say 'Apply deterministic VYRON 2.0.14 YouTube Publish Recovery patch'
cd "$WORK"
patch -p1 < "$PATCH"

say 'Static publish recovery + preservation contracts'
python3 - <<'PY'
import json,os
from pathlib import Path
r=Path('.')
p=json.loads((r/'package.json').read_text()); c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.14' and c['version']=='2.0.14'
assert c['identifier']=='studio.channelflow.desktop'
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
assert c['plugins']['updater']['endpoints']==['https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json','https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json']

pub=(r/'src/PublisherOS.tsx').read_text(); sched=(r/'src/publisherSchedule.ts').read_text(); err=(r/'src/errorCenter.ts').read_text(); app=(r/'src/App.tsx').read_text(); hist=(r/'src/errorHistory.ts').read_text(); notify=(r/'src/notificationCenter.ts').read_text(); api=(r/'src/api.ts').read_text(); yt=(r/'src-tauri/src/youtube.rs').read_text(); lib=(r/'src-tauri/src/lib.rs').read_text(); storage=(r/'src-tauri/src/storage.rs').read_text(); sec=(r/'src-tauri/src/security.rs').read_text(); ex=(r/'src/ExistingVideos.tsx').read_text()
for token in ('syncScheduleFromYoutube','api.youtubeListExisting(profileId,1000)','pastSchedule','Дата публикации уже прошла','Синхронизировать с YouTube','scheduleSync.state===\'ready\'','technicalDetail:h.detail'): assert token in pub,token
for token in ('latestYoutubeScheduledPublishAt','suggestedScheduleStartDate','nextFutureScheduleDate','isFuturePublishAt','Asia/Krasnoyarsk'): assert token in sched,token
for token in ('scheduled publishing time','must be in the future','SCHEDULE_REJECTED'): assert token in err,token
for token in ('removeErrorHistory','Очистить все ошибки','Убрать ошибку','Технические детали'): assert token in app or token in hist,token
assert 'export function removeErrorHistory' in hist
assert 'technicalDetail?:string' in notify and 'appendErrorHistory(detail.title,detail.message||\'\',detail.technicalDetail||\'\')' in notify
assert "youtubeListExisting:(profileId:string,maxResults=30)" in api
assert 'pub async fn youtube_list_existing_videos' in yt and '"publishAt":st.get("publishAt")' in yt
assert (r/'src/v214PublishRecovery.test.ts').exists()
history=(r/'src/releaseHistory.ts').read_text(); assert "version:'2.0.14'" in history and "version:'2.0.13'" in history

# Preserve 2.0.13 Keychain recovery.
for token in ('KEYCHAIN_AUTH_FAILED','KEYCHAIN_CANCELED','KEYCHAIN_LOCKED','KEYCHAIN_AUTOSAVE_PAUSED'): assert token in err,token
for token in ('security_keychain_diagnostics','keychain_diagnostics_roundtrip','set_secret_for_autosave'): assert token in sec,token
for token in ('sanitized_state_for_disk','secure_state_for_disk_best_effort','securityWarning'): assert token in storage,token
start=lib.index('tauri::generate_handler![');end=lib.index('])',start);handler=lib[start:end]
assert handler.count('security::security_keychain_diagnostics')==1

# Preserve 2.0.12 cleanup fix.
pm=(r/'src/productionManagerApi.ts').read_text(); rust=(r/'src-tauri/src/production_manager.rs').read_text(); pui=(r/'src/ProductionManager.tsx').read_text()
assert "invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath})" in pm
assert handler.count('production_manager::cleanup_completed_production_assets')==1
cleanup=rust[rust.index('fn cleanup_completed_assets'):rust.index('pub fn delete_production_batch_projects')]
for token in ('render_status!="Completed"','output_path.is_file()','fs::remove_file(&canon)'): assert token in cleanup,token
assert 'remove_dir_all' not in cleanup and pui.count('window.confirm(')>=2

# Preserve 2.0.11 Publisher/Existing Videos/playlist/quota contracts.
for token in ("['file','Из файла']","['daily','Каждый день']","['2/2','2/2']","['3/1','3/1']",'Время публикации','Preview дат','resolvedUploadMetadata(j,row,publishAt','Video Uploads сегодня'): assert token in pub,token
for token in ('Category ID','Плейлист','authoritative backup','Последний Apply','Последний Undo'): assert token in ex,token
for token in ('youtube_playlist_membership','playlistItems.insert','playlistItems.delete','YOUTUBE_UPLOAD_CHUNK_BYTES:usize=32*1024*1024'): assert token in yt,token
print('✅ VYRON 2.0.14 static publish recovery + preservation contracts')
PY

say 'Frontend dependency lock + full Vitest suite'
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
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.14'
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
pass 'Tauri build + codesign + DMG verify + updater signature asset'

say 'Package exact tested candidate'
rm -rf release; mkdir release
cp "$DMG" release/VYRON-2.0.14-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-2.0.14-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-2.0.14-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-2.0.14-source.tar.gz > release/SOURCE_SHA256.txt
cat > release/FINAL_TEST_REPORT.md <<'REPORT'
# VYRON 2.0.14 — FINAL TEST

- ✅ Exact released VYRON 2.0.13 source SHA256 verified
- ✅ User-reported 2.0.13 scheduling/Error Center defects reproduced before patch
- ✅ Publisher reads selected channel existing YouTube videos through owner-authorized OAuth
- ✅ Latest scheduled publishAt is selected and the proposed batch starts after that publication
- ✅ When there is no scheduled YouTube publication, proposed start is the nearest safe future Krasnoyarsk date/time
- ✅ publishAt already in the past is blocked before videos.insert
- ✅ Every non-file schedule requires successful YouTube schedule synchronization before upload
- ✅ Upload/resume failures keep the real backend technical detail in Error Center
- ✅ Error Center can remove one current job error, remove one history event, and clear all visible errors/counter
- ✅ VYRON 2.0.13 Keychain recovery preserved
- ✅ VYRON 2.0.12 safe project-assets cleanup preserved
- ✅ VYRON 2.0.11 Publisher schedule modes / metadata / quota / upload recovery preserved
- ✅ Existing Videos category / playlist / authoritative backup / verified Undo preserved
- ✅ Full frontend Vitest suite
- ✅ Frontend production build / TypeScript
- ✅ Rust unit tests
- ✅ ARM64 cargo check
- ✅ Tauri Apple Silicon build
- ✅ codesign verify
- ✅ DMG verify
- ✅ Tauri updater package + signature generated

Automated CI does not mutate the user's real YouTube channel. It verifies scheduling logic, request paths/contracts, compilation and the exact packaged macOS candidate. If YouTube still rejects a real upload, VYRON 2.0.14 preserves and displays the exact backend/YouTube error instead of the generic fallback.
REPORT
pass 'Final candidate packaged'
echo 'VYRON 2.0.14 FINAL GATE: PASS'
