#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"

# Prove the complete current VYRON/Shorts candidate first.
bash "$ROOT/vyron-v211/release_build_v211.sh"
rm -rf "$ROOT/.vyron-v212-release"
mv "$ROOT/.vyron-v211-release" "$ROOT/.vyron-v212-release"
WORK="$ROOT/.vyron-v212-release"
rm -rf "$WORK/src-tauri/target"
cd "$WORK"

# Fingerprint everything outside the requested image-material path.
CORE_FILES=(
  src/PublisherOS.tsx src/MetadataPage.tsx src/ShortsFactory.tsx src/ShortsMetadata.tsx
  src/channelIdentity.ts src/AccountsPage.tsx src/ChannelsOS.tsx src/youtubeAutopilot.ts
  src-tauri/src/youtube.rs src-tauri/src/storage.rs src-tauri/src/security.rs src-tauri/src/shorts_factory.rs
)
shasum -a 256 "${CORE_FILES[@]}" > /tmp/vyron-v212-core-before.sha256

python3 "$ROOT/vyron-v212/apply_v212_image_folder_import.py" .
python3 "$ROOT/vyron-v212/apply_v212_release_history.py" .
python3 "$ROOT/vyron-v212/apply_v212_version.py" .

# The requested feature may touch only Production image collection, API wiring, lib registration, tests, version/history/styles if needed.
shasum -a 256 -c /tmp/vyron-v212-core-before.sha256

python3 - <<'PY'
from pathlib import Path
import json
r=Path('.')
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.12' and c['version']=='2.0.12'
pm=(r/'src/ProductionManager.tsx').read_text();api=(r/'src/productionManagerApi.ts').read_text();rust=(r/'src-tauri/src/production_manager.rs').read_text();lib=(r/'src-tauri/src/lib.rs').read_text();hist=(r/'src/VyronReleaseHistory.tsx').read_text()
for token in ('НАЧАТЬ СБОР','ИМПОРТ ИЗ ПАПКИ','chooseImageFolder','importImageFolder'):
    assert token in pm,token
for token in ('chooseImageFolder','importImageFolder','import_production_image_folder'):
    assert token in api,token
for token in ('import_production_image_folder','recursive_images(&source)','session.collected.push','Сначала завершите активный сбор изображений из Downloads'):
    assert token in rust,token
assert 'production_manager::import_production_image_folder' in lib
assert "version:'2.0.12'" in hist
# Existing collector remains present.
for token in ('start_production_import','spawn_import_watcher','downloads_dir()','collector_seen_at_start'):
    assert token in rust,token
# No project prerequisite in folder import block.
block=rust[rust.index('pub fn import_production_image_folder'):rust.index('pub fn set_production_music_library')]
assert 'BuildRequest' not in block and 'project_count' not in block
print('VYRON 2.0.12 IMAGE FOLDER IMPORT STATIC CONTRACT: PASS')
PY

npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin

rm -rf src-tauri/target/aarch64-apple-darwin/release/bundle
npx tauri build --target aarch64-apple-darwin --bundles app,dmg
APP=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -maxdepth 1 -name 'VYRON.app' -print -quit)
DMG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -print -quit)
test -d "$APP" -a -s "$DMG"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.12'
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
echo 'VYRON 2.0.12 IMAGE FOLDER IMPORT FULL GATE: PASS'
