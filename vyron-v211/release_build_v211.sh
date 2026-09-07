#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"

test -n "${TAURI_SIGNING_PRIVATE_KEY:-}"
test -n "${TAURI_UPDATER_PUBLIC_KEY:-}"
python3 - <<'PY'
import base64,os
from pathlib import Path
def dec(v):
    try:return base64.b64decode(v.strip(),validate=True).decode()
    except Exception:return None
def norm(name,kind):
    raw=os.environ[name].strip();once=dec(raw)
    if once and once.startswith('untrusted comment:'): out,box=raw,once
    else:
        if not once:raise SystemExit(f'{name}: invalid encoding')
        out=once.strip();box=dec(out)
        if not box or not box.startswith('untrusted comment:'):raise SystemExit(f'{name}: not a Tauri key')
    if kind not in box.splitlines()[0].lower():raise SystemExit(f'{name}: wrong key type')
    return out
sk=norm('TAURI_SIGNING_PRIVATE_KEY','secret key');pk=norm('TAURI_UPDATER_PUBLIC_KEY','public key')
Path('/tmp/vyron-v211-signing-key').write_text(sk);Path('/tmp/vyron-v211-updater-pubkey').write_text(pk)
os.chmod('/tmp/vyron-v211-signing-key',0o600);os.chmod('/tmp/vyron-v211-updater-pubkey',0o600)
print('VYRON 2.0.11 updater signing material normalized: PASS')
PY
export TAURI_SIGNING_PRIVATE_KEY="$(cat /tmp/vyron-v211-signing-key)"
export TAURI_UPDATER_PUBLIC_KEY="$(cat /tmp/vyron-v211-updater-pubkey)"

bash "$ROOT/vyron-v210/release_build_v210.sh"
rm -rf "$ROOT/.vyron-v211-release"
mv "$ROOT/.vyron-v210-release" "$ROOT/.vyron-v211-release"
WORK="$ROOT/.vyron-v211-release"
rm -rf "$WORK/src-tauri/target"
cd "$WORK"
python3 "$ROOT/vyron-v211/apply_v211_shorts_factory.py" .
python3 "$ROOT/vyron-v211/apply_v211_release_history.py" .
python3 "$ROOT/vyron-v211/apply_v211_version.py" .
python3 - <<'PY'
from pathlib import Path
import json
r=Path('.');p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.11' and c['version']=='2.0.11'
for f in ('src/shortsCore.ts','src/ShortsFactory.tsx','src/ShortsMetadata.tsx','src/MetadataTabs.tsx','src-tauri/src/shorts_factory.rs'):assert (r/f).is_file(),f
prod=(r/'src/ProductionOS.tsx').read_text();meta=(r/'src/ShortsMetadata.tsx').read_text();core=(r/'src/shortsCore.ts').read_text();rust=(r/'src-tauri/src/shorts_factory.rs').read_text();quota=(r/'src/QuotaMeter.tsx').read_text();hist=(r/'src/VyronReleaseHistory.tsx').read_text()
for token in ('SHORTS','СОЗДАТЬ SHORTS','<ShortsFactory'):assert token in prod,token
for token in ('METADATA_READY','ВОЗОБНОВИТЬ ЗАГРУЗКУ','shortsValidateFile','youtubeVideoId','Asia/Krasnoyarsk'):assert token in meta,token
for token in ('recordUsedSegments','planSegments','recoverInterruptedShorts','shortOutputPath','shortUploadsToday'):assert token in core,token
for token in ('h264_videotoolbox','libx264','.part.mp4','1080','1920','shorts_render_segment','real_ffmpeg_fixture_if_enabled'):assert token in rust,token
for token in ('Long Videos','Shorts','Total Video Uploads'):assert token in quota,token
assert "version:'2.0.11'" in hist
print('VYRON 2.0.11 SHORTS STATIC CONTRACT: PASS')
PY
npm test
npm run build
VYRON_SHORTS_REAL_TEST=1 cargo test --manifest-path src-tauri/Cargo.toml --lib -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin
rm -rf src-tauri/target/aarch64-apple-darwin/release/bundle
npx tauri build --target aarch64-apple-darwin --bundles app,dmg
APP=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -maxdepth 1 -name 'VYRON.app' -print -quit)
DMG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -print -quit)
UPDATER=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz' -print -quit)
SIG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz.sig' -print -quit)
test -d "$APP" -a -s "$DMG" -a -s "$UPDATER" -a -s "$SIG"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.11'
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -q 'Signature=adhoc'
hdiutil verify "$DMG"
rm -rf release;mkdir release
cp "$DMG" release/VYRON-2.0.11-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
cp "$ROOT/vyron-v211/RELEASE_NOTES.md" release/RELEASE_NOTES.md
shasum -a 256 release/VYRON-2.0.11-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-2.0.11-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-2.0.11-source.tar.gz > release/SOURCE_SHA256.txt
echo 'VYRON 2.0.11 SHORTS FACTORY FULL GATE: PASS'
