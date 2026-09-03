#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v200-release"
ASSETS='/tmp/vyron-v200-release-base'

rm -rf "$WORK" "$ASSETS"
mkdir -p "$WORK" "$ASSETS"
gh release download v1.2.0 --repo "$REPO" --pattern 'VYRON-1.2.0-source.tar.gz' --pattern 'SOURCE_SHA256.txt' --dir "$ASSETS"
EXPECTED="$(awk '{print $1;exit}' "$ASSETS/SOURCE_SHA256.txt")"
GOT="$(shasum -a 256 "$ASSETS/VYRON-1.2.0-source.tar.gz" | awk '{print $1}')"
test "$EXPECTED" = "$GOT"
tar -xzf "$ASSETS/VYRON-1.2.0-source.tar.gz" -C "$WORK"

python3 - <<PY
import json
from pathlib import Path
r=Path('$WORK');p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='1.2.0'
Path('/tmp/v200-release-id').write_text(c['identifier'])
Path('/tmp/v200-release-product').write_text(c.get('productName',''))
Path('/tmp/v200-release-pub').write_text(c['plugins']['updater']['pubkey'])
Path('/tmp/v200-release-endpoints').write_text(json.dumps(c['plugins']['updater']['endpoints']))
PY

cd "$WORK"
python3 "$ROOT/vyron-v200/apply_v200_persistence_recovery.py" .
python3 "$ROOT/vyron-v200/apply_v200_intelligence_errors.py" .
python3 "$ROOT/vyron-v200/apply_v200_autopilot_attention.py" .
python3 "$ROOT/vyron-v200/apply_v200_settings_importfix.py" .
python3 "$ROOT/vyron-v200/apply_v200_rust_fingerprintfix.py" .
python3 "$ROOT/vyron-v200/apply_v200_version.py" .

python3 - <<'PY'
import json
from pathlib import Path
p=json.loads(Path('package.json').read_text());c=json.loads(Path('src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.0' and c['version']=='2.0.0'
assert c['identifier']==Path('/tmp/v200-release-id').read_text()
assert c.get('productName','')==Path('/tmp/v200-release-product').read_text()
assert c['plugins']['updater']['pubkey']==Path('/tmp/v200-release-pub').read_text()
assert json.dumps(c['plugins']['updater']['endpoints'])==Path('/tmp/v200-release-endpoints').read_text()
rust=Path('src-tauri/src/youtube.rs').read_text()
assert 'fn local_file_fingerprint(path:&Path)->Result<Value,String>' in rust
assert 'pub async fn youtube_resume_upload' in rust
print('VYRON 2.0.0 signed-build source contracts: PASS')
PY

npm install --no-audit --no-fund
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin
npx tauri build --target aarch64-apple-darwin --bundles app,dmg

APP=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -maxdepth 1 -name 'VYRON.app' -print -quit)
DMG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -print -quit)
UPDATER=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz' -print -quit)
SIG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz.sig' -print -quit)
test -d "$APP" -a -s "$DMG" -a -s "$UPDATER" -a -s "$SIG"
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "$(cat /tmp/v200-release-id)"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.0'
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"

rm -rf release
mkdir release
cp "$DMG" release/VYRON-2.0.0-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-2.0.0-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-2.0.0-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-2.0.0-source.tar.gz > release/SOURCE_SHA256.txt

echo 'VYRON 2.0.0 signed build stage: PASS'
