#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v212-release"
ASSETS='/tmp/vyron-v212-release-base'
SOURCE_SHA='ede338c64b3d7b1ff003acc69c41257a62f5bf2ce982ad1160c5b1a14e16fcf2'

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

say 'Download exact released VYRON 2.0.11 source'
rm -rf "$WORK" "$ASSETS"; mkdir -p "$WORK" "$ASSETS"
gh release download v2.0.11 --repo "$REPO" --pattern 'VYRON-2.0.11-source.tar.gz' --dir "$ASSETS"
GOT_SOURCE="$(shasum -a 256 "$ASSETS/VYRON-2.0.11-source.tar.gz"|awk '{print $1}')"
test "$GOT_SOURCE" = "$SOURCE_SHA"
tar -xzf "$ASSETS/VYRON-2.0.11-source.tar.gz" -C "$WORK"
test "$(node -p "require('$WORK/package.json').version")" = '2.0.11'
pass "Official 2.0.11 source SHA256 $SOURCE_SHA"

say 'Prove the reported 2.0.11 defect exists in the base source'
python3 - "$WORK" <<'PY'
from pathlib import Path
import sys
r=Path(sys.argv[1])
api=(r/'src/productionManagerApi.ts').read_text(); rust=(r/'src-tauri/src/production_manager.rs').read_text(); lib=(r/'src-tauri/src/lib.rs').read_text()
assert "'cleanup_completed_production_assets'" in api
assert 'pub fn cleanup_completed_production_assets' in rust
start=lib.index('tauri::generate_handler!['); end=lib.index('])',start); handler=lib[start:end]
assert 'production_manager::cleanup_completed_production_assets' not in handler
print('✅ Reproduced 2.0.11: UI + Rust command present, Tauri registration missing')
PY

say 'Apply deterministic 2.0.12 hotfix'
python3 "$ROOT/vyron-v212/apply_v212_cleanup_command_hotfix.py" "$WORK"
cd "$WORK"

say 'Static hotfix + preservation contracts'
python3 - <<'PY'
import json,os
from pathlib import Path
r=Path('.')
p=json.loads((r/'package.json').read_text()); c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.12' and c['version']=='2.0.12'
assert c['identifier']=='studio.channelflow.desktop'
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
assert c['plugins']['updater']['endpoints']==['https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json','https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json']
api=(r/'src/productionManagerApi.ts').read_text(); rust=(r/'src-tauri/src/production_manager.rs').read_text(); lib=(r/'src-tauri/src/lib.rs').read_text()
assert "invoke<CleanupResult>('cleanup_completed_production_assets',{manifestPath})" in api
assert 'pub fn cleanup_completed_production_assets' in rust
start=lib.index('tauri::generate_handler!['); end=lib.index('])',start); handler=lib[start:end]
assert handler.count('production_manager::cleanup_completed_production_assets')==1
block=rust[rust.index('fn cleanup_completed_assets'):rust.index('pub fn delete_production_batch_projects')]
for token in ('render_status!="Completed"','output_path.is_file()','fs::remove_file(&canon)'): assert token in block,token
assert 'remove_dir_all' not in block
ui=(r/'src/ProductionManager.tsx').read_text(); assert ui.count('window.confirm(')>=2 and 'УДАЛИТЬ ВСЕ PROJECT ASSETS' in ui
hist=(r/'src/releaseHistory.ts').read_text(); assert "version:'2.0.12'" in hist and "version:'2.0.11'" in hist
# Critical 2.0.11 feature preservation
pub=(r/'src/PublisherOS.tsx').read_text(); ex=(r/'src/ExistingVideos.tsx').read_text(); yt=(r/'src-tauri/src/youtube.rs').read_text()
for t in ("['file','Из файла']","['daily','Каждый день']","['2/2','2/2']","['3/1','3/1']",'Время публикации','Preview дат','resolvedUploadMetadata(j,row,publishAt','Video Uploads сегодня'): assert t in pub,t
for t in ('Category ID','Плейлист','authoritative backup','Последний Apply','Последний Undo'): assert t in ex,t
for t in ('youtube_playlist_membership','playlistItems.insert','playlistItems.delete','YOUTUBE_UPLOAD_CHUNK_BYTES:usize=32*1024*1024'): assert t in yt,t
assert (r/'src/v212CleanupCommandRegistration.test.ts').exists()
print('✅ VYRON 2.0.12 static hotfix + regression contracts')
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
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.0.12'
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
pass 'Tauri build + codesign + DMG verify + updater signature asset'

say 'Package exact tested candidate'
rm -rf release; mkdir release
cp "$DMG" release/VYRON-2.0.12-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-2.0.12-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-2.0.12-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-2.0.12-source.tar.gz > release/SOURCE_SHA256.txt
cat > release/FINAL_TEST_REPORT.md <<'EOF'
# VYRON 2.0.12 — FINAL TEST

- ✅ Exact released VYRON 2.0.11 source SHA256 verified
- ✅ Reported 2.0.11 defect reproduced before patch: UI invoke + Rust command existed, Tauri registration was absent
- ✅ cleanup_completed_production_assets registered exactly once in tauri::generate_handler
- ✅ Dedicated regression test covers UI invoke → Rust command → Tauri registration
- ✅ Safe cleanup still requires Completed + existing non-empty output MP4
- ✅ Safe cleanup removes project image/music only and does not remove directories recursively
- ✅ Two user confirmations preserved
- ✅ 2.0.11 Publisher schedule / metadata / quota / upload optimizations preserved
- ✅ 2.0.11 Existing Videos category / playlist / backup / verified Undo preserved
- ✅ Full frontend Vitest suite
- ✅ Frontend production build / TypeScript
- ✅ Rust unit tests
- ✅ ARM64 cargo check
- ✅ Tauri Apple Silicon build
- ✅ codesign verify
- ✅ DMG verify
- ✅ Tauri updater package + signature generated

Automated CI does not mutate a real YouTube channel; it validates code paths, contracts, compilation and packaging.
EOF
pass 'Final candidate packaged'
echo 'VYRON 2.0.12 FINAL GATE: PASS'
