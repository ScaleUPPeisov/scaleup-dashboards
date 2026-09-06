#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"

# First prove the exact published 2.0.9 source/security/functionality from scratch.
bash "$ROOT/vyron-v209/release_build_v209.sh"
rm -rf "$ROOT/.vyron-v210-release"
mv "$ROOT/.vyron-v209-release" "$ROOT/.vyron-v210-release"
WORK="$ROOT/.vyron-v210-release"

# IMPORTANT: Rust/Tauri build metadata stores absolute workspace paths.
# The v209 -> v210 workspace rename makes that cache invalid, so rebuild it
# from zero instead of allowing stale .vyron-v209-release paths into v210.
rm -rf "$WORK/src-tauri/target"
cd "$WORK"

# Fingerprint all functional/security paths that this UI-only update must not touch.
CORE_FILES=(
  src/ProductionOS.tsx
  src/ProductionManager.tsx
  src/PublisherOS.tsx
  src/api.ts
  src/channelIdentity.ts
  src/AccountsPage.tsx
  src/ChannelsOS.tsx
  src/youtubeAutopilot.ts
  src-tauri/src/youtube.rs
  src-tauri/src/storage.rs
  src-tauri/src/security.rs
  src-tauri/src/production_manager.rs
)
shasum -a 256 "${CORE_FILES[@]}" > /tmp/vyron-v210-core-before.sha256

python3 "$ROOT/vyron-v210/apply_v210_release_history.py" .
python3 "$ROOT/vyron-v210/apply_v210_release_history_accuracy.py" .
python3 "$ROOT/vyron-v210/apply_v210_version.py" .

# Zero functional drift outside the isolated Settings history UI.
shasum -a 256 -c /tmp/vyron-v210-core-before.sha256

python3 - <<'PY'
from pathlib import Path
import json,re
r=Path('.')
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.10' and c['version']=='2.0.10'
settings=(r/'src/SettingsOS.tsx').read_text();hist=(r/'src/VyronReleaseHistory.tsx').read_text()
assert "import {VyronReleaseHistory} from './VyronReleaseHistory'" in settings
assert '<VyronReleaseHistory currentVersion={installedVersion||\'2.0.10\'}/>' in settings
# Existing updater is still present with the exact APIs/actions used by 2.0.9.
for token in ('async function checkForUpdate()','api.checkUpdate()','async function installUpdate()','update.install((p:number)=>','Установить и перезапустить','Проверить обновления'):
    assert token in settings,token
# Complete public VYRON history from 1.0.0 through 2.0.10.
versions=[f'2.0.{i}' for i in range(10,-1,-1)]+['1.2.0','1.1.0']+[f'1.0.{i}' for i in range(15,-1,-1)]
for version in versions:
    assert hist.count(f"version:'{version}'")==1,version
assert len(re.findall(r"version:'[0-9]+\.[0-9]+\.[0-9]+'",hist))==29
for date in ('06.09.2026','05.09.2026','04.09.2026','03.09.2026','02.09.2026','01.09.2026'):
    assert date in hist,date
for token in ('RELEASE HISTORY','История обновлений','ЧТО СДЕЛАНО • ОТ И ДО','Видео-обзор обновления','▶ Смотреть от и до','ОФЛАЙН • БЕЗ YOUTUBE API','window.setInterval','3200'):
    assert token in hist,token
# Accuracy sentinels sourced from the original release notes/scripts.
for token in ('Local Quota Reset','Channel Runway','Command Center','Production Manager','Image Import Reliability','Production Autobuild','Downloads Image Collector Hotfix','macOS Downloads Permission Hotfix','Production Storage','macOS Updater EXDEV Hotfix','Project Storage Fix','Production UX & Storage Fix','Recovery, Smart Schedule & Notifications','Schedule Patterns, Flexible DOCX & A-Z Channels','ENDLUME Image Validation Hotfix','Cache-Control: no-cache, no-store, max-age=0','99 выбранных видео и 0 DOCX-строк','127.0.0.1:19470','uploads playlist pipeline без search.list'):
    assert token in hist,token
assert (r/'src/VyronReleaseHistory.test.ts').exists()
print('VYRON 2.0.10 COMPLETE RELEASE HISTORY UI CONTRACT: PASS — 29 releases')
PY

# Run the complete app test/build matrix again after the isolated UI patch.
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin

# Force fresh 2.0.10 bundles; never reuse the 2.0.9 bundle directory.
rm -rf src-tauri/target/aarch64-apple-darwin/release/bundle
npx tauri build --target aarch64-apple-darwin --bundles app,dmg

APP=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -maxdepth 1 -name 'VYRON.app' -print -quit)
DMG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -print -quit)
UPDATER=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz' -print -quit)
SIG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz.sig' -print -quit)
test -d "$APP" -a -s "$DMG" -a -s "$UPDATER" -a -s "$SIG"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.10'
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"

rm -rf release
mkdir release
cp "$DMG" release/VYRON-2.0.10-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-2.0.10-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-2.0.10-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-2.0.10-source.tar.gz > release/SOURCE_SHA256.txt

echo 'VYRON 2.0.10 complete release history + full 2.0.9 regression gate: PASS'
