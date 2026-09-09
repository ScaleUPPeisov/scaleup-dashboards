#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v213-release"
ASSETS='/tmp/vyron-v213-release-base'
SOURCE_SHA='ef644ba9e0f4e9bd093412c9fcde82c376af45eb39b835ffdc3ace3867c2cd08'
PATCH_SHA='4e9ecb9568aa9a7f665c2a932e49750c42698dc4a7524e601abd2319c060ec88'

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

say 'Verify deterministic 2.0.13 patch payload'
PATCH_FILE="$ROOT/vyron-v213/v213.patch"
if [ ! -f "$PATCH_FILE" ]; then
  cat "$ROOT"/vyron-v213/v213.patch.part* > "$RUNNER_TEMP/v213.patch"
  PATCH_FILE="$RUNNER_TEMP/v213.patch"
fi
GOT_PATCH="$(shasum -a 256 "$PATCH_FILE"|awk '{print $1}')"
test "$GOT_PATCH" = "$PATCH_SHA"
pass "Patch SHA256 $PATCH_SHA"

say 'Download exact released VYRON 2.0.12 source'
rm -rf "$WORK" "$ASSETS"; mkdir -p "$WORK" "$ASSETS"
gh release download v2.0.12 --repo "$REPO" --pattern 'VYRON-2.0.12-source.tar.gz' --dir "$ASSETS"
GOT_SOURCE="$(shasum -a 256 "$ASSETS/VYRON-2.0.12-source.tar.gz"|awk '{print $1}')"
test "$GOT_SOURCE" = "$SOURCE_SHA"
tar -xzf "$ASSETS/VYRON-2.0.12-source.tar.gz" -C "$WORK"
test "$(node -p "require('$WORK/package.json').version")" = '2.0.12'
pass "Official 2.0.12 source SHA256 $SOURCE_SHA"

say 'Reproduce reported Keychain UX/storage defect in 2.0.12 base'
python3 - "$WORK" <<'PY'
from pathlib import Path
import sys
r=Path(sys.argv[1])
err=(r/'src/errorCenter.ts').read_text()
storage=(r/'src-tauri/src/storage.rs').read_text()
lib=(r/'src-tauri/src/lib.rs').read_text()
assert 'KEYCHAIN_AUTH_FAILED' not in err
assert "VYRON сохранил текущее состояние" in err
assert 'let (disk,_)=secure_state_for_disk(&state)?;' in storage
start=lib.index('tauri::generate_handler![');end=lib.index('])',start);handler=lib[start:end]
assert 'security::security_keychain_diagnostics' not in handler
print('✅ Reproduced 2.0.12: Keychain errors fall into generic UX and state autosave is strict')
PY

say 'Apply deterministic VYRON 2.0.13 Keychain Recovery patch'
cd "$WORK"
patch -p1 < "$PATCH_FILE"

say 'Static Keychain recovery + preservation contracts'
python3 - <<'PY'
import json,os
from pathlib import Path
r=Path('.')
p=json.loads((r/'package.json').read_text()); c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.13' and c['version']=='2.0.13'
assert c['identifier']=='studio.channelflow.desktop'
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
assert c['plugins']['updater']['endpoints']==['https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json','https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json']

err=(r/'src/errorCenter.ts').read_text(); sec=(r/'src-tauri/src/security.rs').read_text(); storage=(r/'src-tauri/src/storage.rs').read_text(); lib=(r/'src-tauri/src/lib.rs').read_text(); api=(r/'src/api.ts').read_text(); settings=(r/'src/SettingsOS.tsx').read_text(); store=(r/'src/store.ts').read_text()
for token in ('KEYCHAIN_AUTH_FAILED','KEYCHAIN_CANCELED','KEYCHAIN_LOCKED','KEYCHAIN_AUTOSAVE_PAUSED','Настройки → Диагностика'): assert token in err,token
for token in ('AUTH_FAILED:i32=-25293','INTERACTION_NOT_ALLOWED:i32=-25308','USER_CANCELED:i32=-128','KEYCHAIN_ACCESS_BLOCKED','set_secret_for_autosave','security_keychain_diagnostics','keychain_diagnostics_roundtrip'): assert token in sec,token
for token in ('sanitized_state_for_disk','secure_state_for_disk_best_effort','securityWarning','set_secret_for_autosave'): assert token in storage,token
assert 'let (disk,_)=secure_state_for_disk(&state)?;' not in storage
assert "invoke<KeychainDiagnostic>('security_keychain_diagnostics')" in api
assert 'Проверить Keychain' in settings and 'runKeychainDiagnostics' in settings
assert "operationId:'keychain-autosave-warning'" in store
start=lib.index('tauri::generate_handler![');end=lib.index('])',start);handler=lib[start:end]
assert handler.count('security::security_keychain_diagnostics')==1
assert (r/'src/v213KeychainRecovery.test.ts').exists()
hist=(r/'src/releaseHistory.ts').read_text(); assert "version:'2.0.13'" in hist and "version:'2.0.12'" in hist

# Secret fields are never intentionally persisted to state.json.
assert 'for field in ["youtubeApiKey","openaiApiKey"]{set_state_secret(&mut disk,field,"");}' in storage

# Preserve 2.0.12 cleanup fix and 2.0.11 user features.
pm=(r/'src/productionManagerApi.ts').read_text(); rust=(r/'src-tauri/src/production_manager.rs').read_text(); ui=(r/'src/ProductionManager.tsx').read_text(); pub=(r/'src/PublisherOS.tsx').read_text(); ex=(r/'src/ExistingVideos.tsx').read_text(); yt=(r/'src-tauri/src/youtube.rs').read_text()
assert "invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath})" in pm
assert 'production_manager::cleanup_completed_production_assets' in handler
block=rust[rust.index('fn cleanup_completed_assets'):rust.index('pub fn delete_production_batch_projects')]
for token in ('render_status!="Completed"','output_path.is_file()','fs::remove_file(&canon)'): assert token in block,token
assert 'remove_dir_all' not in block
assert ui.count('window.confirm(')>=2 and 'УДАЛИТЬ ВСЕ PROJECT ASSETS' in ui
for t in ("['file','Из файла']","['daily','Каждый день']","['2/2','2/2']","['3/1','3/1']",'Время публикации','Preview дат','resolvedUploadMetadata(j,row,publishAt','Video Uploads сегодня'): assert t in pub,t
for t in ('Category ID','Плейлист','authoritative backup','Последний Apply','Последний Undo'): assert t in ex,t
for t in ('youtube_playlist_membership','playlistItems.insert','playlistItems.delete','YOUTUBE_UPLOAD_CHUNK_BYTES:usize=32*1024*1024'): assert t in yt,t
print('✅ VYRON 2.0.13 static Keychain recovery + preservation contracts')
PY

say 'Frontend dependency lock + full Vitest suite'
npm ci --no-audit --no-fund
npm test
pass 'Frontend Vitest suite'

say 'Frontend production build / TypeScript'
npm run build
pass 'Frontend production build'

say 'Rust unit tests, including real macOS Keychain roundtrip + diagnostic command'
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
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.13'
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
pass 'Tauri build + codesign + DMG verify + updater signature asset'

say 'Package exact tested candidate'
rm -rf release; mkdir release
cp "$DMG" release/VYRON-2.0.13-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-2.0.13-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-2.0.13-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-2.0.13-source.tar.gz > release/SOURCE_SHA256.txt
cat > release/FINAL_TEST_REPORT.md <<'REPORT'
# VYRON 2.0.13 — FINAL TEST

- ✅ Exact released VYRON 2.0.12 source SHA256 verified
- ✅ Reported 2.0.12 Keychain UX/storage defect reproduced before patch
- ✅ Keychain OSStatus auth/cancel/interaction errors map to actionable UI instead of UNKNOWN fallback
- ✅ Keychain failure pauses repeated autosave Keychain prompts for the session
- ✅ Local state autosave continues when Keychain is unavailable
- ✅ youtubeApiKey/openaiApiKey are still stripped from state.json
- ✅ Settings → Diagnostics → macOS Keychain probe registered UI → API → Rust → Tauri
- ✅ Real macOS Keychain roundtrip and diagnostic command run in Rust tests
- ✅ 2.0.12 safe project-assets cleanup preserved
- ✅ 2.0.11 Publisher schedules/metadata/quota/upload behavior preserved
- ✅ 2.0.11 Existing Videos category/playlist/backup/verified Undo preserved
- ✅ Full frontend Vitest suite
- ✅ Frontend production build / TypeScript
- ✅ Rust unit tests
- ✅ ARM64 cargo check
- ✅ Tauri Apple Silicon build
- ✅ codesign verify
- ✅ DMG verify
- ✅ Tauri updater package + signature generated

CI cannot deliberately type an incorrect human macOS login password into the system dialog. The error classification is tested with the real OSStatus codes, while successful Keychain read/write/delete is exercised on the macOS runner.
REPORT
pass 'Final candidate packaged'
echo 'VYRON 2.0.13 FINAL GATE: PASS'
