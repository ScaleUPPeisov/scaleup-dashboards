#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"

# First prove the exact published 2.0.9 source/security/functionality from scratch.
bash "$ROOT/vyron-v209/release_build_v209.sh"
rm -rf "$ROOT/.vyron-v210-release"
mv "$ROOT/.vyron-v209-release" "$ROOT/.vyron-v210-release"
WORK="$ROOT/.vyron-v210-release"
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
# History from the first public VYRON release through this release.
for version in ('2.0.10','2.0.9','2.0.8','2.0.7','2.0.6','2.0.5','2.0.4','2.0.3','2.0.2','2.0.1','2.0.0','1.2.0','1.1.0','1.0.0'):
    assert f"version:'{version}'" in hist,version
for date in ('06.09.2026','05.09.2026','04.09.2026','03.09.2026','01.09.2026'):
    assert date in hist,date
for token in ('RELEASE HISTORY','История обновлений','ЧТО СДЕЛАНО • ОТ И ДО','Видео-обзор обновления','▶ Смотреть от и до','ОФЛАЙН • БЕЗ YOUTUBE API','window.setInterval','3200'):
    assert token in hist,token
assert (r/'src/VyronReleaseHistory.test.ts').exists()
print('VYRON 2.0.10 RELEASE HISTORY UI CONTRACT: PASS')
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

echo 'VYRON 2.0.10 release history + full 2.0.9 regression gate: PASS'
