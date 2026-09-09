#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v210-release"
ASSETS='/tmp/vyron-v210-release-base'
SOURCE_SHA='946695817baf9956117701664441c40c01002dc492aaf52350c7628937d7ceee'

test -n "${TAURI_SIGNING_PRIVATE_KEY:-}"
test -n "${TAURI_UPDATER_PUBLIC_KEY:-}"
python3 - <<'PY'
import base64,os
def dec(v):
    try:return base64.b64decode(v.strip(),validate=True).decode()
    except Exception:return None
def norm(name,kind):
    raw=os.environ[name].strip();once=dec(raw)
    if once and once.startswith('untrusted comment:'):out,box=raw,once
    else:
        if not once:raise SystemExit(f'{name}: invalid encoding')
        out=once.strip();box=dec(out)
        if not box or not box.startswith('untrusted comment:'):raise SystemExit(f'{name}: not a Tauri key')
    if kind not in box.splitlines()[0].lower():raise SystemExit(f'{name}: wrong key type')
    return out
sk=norm('TAURI_SIGNING_PRIVATE_KEY','secret key');pk=norm('TAURI_UPDATER_PUBLIC_KEY','public key')
print(f'::add-mask::{sk}')
with open(os.environ['GITHUB_ENV'],'a') as f:f.write(f'TAURI_SIGNING_PRIVATE_KEY={sk}\nTAURI_UPDATER_PUBLIC_KEY={pk}\n')
PY
export TAURI_SIGNING_PRIVATE_KEY="$(grep '^TAURI_SIGNING_PRIVATE_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"
export TAURI_UPDATER_PUBLIC_KEY="$(grep '^TAURI_UPDATER_PUBLIC_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"

rm -rf "$WORK" "$ASSETS"
mkdir -p "$WORK" "$ASSETS"
gh release download v2.0.9 --repo "$REPO" --pattern 'VYRON-2.0.9-source.tar.gz' --dir "$ASSETS"
GOT="$(shasum -a 256 "$ASSETS/VYRON-2.0.9-source.tar.gz" | awk '{print $1}')"
test "$SOURCE_SHA" = "$GOT"
tar -xzf "$ASSETS/VYRON-2.0.9-source.tar.gz" -C "$WORK"
cd "$WORK"

test "$(node -p "require('./package.json').version")" = '2.0.9'
python3 "$ROOT/vyron-v210/apply_v210_youtube_verified_apply.py" .
python3 "$ROOT/vyron-v210/apply_v210_version.py" .

python3 - <<'PY'
import json,os
from pathlib import Path
r=Path('.')
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.10' and c['version']=='2.0.10'
assert c['identifier']=='studio.channelflow.desktop'
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip(),'secret/public key mismatch'
assert c['plugins']['updater']['endpoints']==['https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json','https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json']
yt=(r/'src-tauri/src/youtube.rs').read_text();api=(r/'src/api.ts').read_text();meta=(r/'src/MetadataPage.tsx').read_text();ex=(r/'src/ExistingVideos.tsx').read_text();quota=(r/'src/youtubeQuota.ts').read_text();app=(r/'src/App.tsx').read_text()
block=yt[yt.index('pub async fn youtube_update_existing_video'):yt.index('\n#[cfg(test)]\nmod youtube_write_tests')]
assert 'Mandatory owner-authorized control read after every successful videos.update.' in block
assert 'let verified=metadata_verified&&schedule_verified;' in block
assert '"mismatches":mismatches' in block
assert 'defaultLanguage' in block
assert block.count('emit_youtube_api_request(&app,"videos.update"')==1
assert block.count('emit_youtube_api_request(&app,"videos.list"')==2
assert 'fallback' not in block.lower()
assert 'verificationError?:string|null' in api and 'actual?:{title?:string' in api
assert '!result.metadataVerified' in meta and 'result.scheduleVerified' in meta
assert 'Скрытых fallback/retry запросов внутри Apply нет.' in meta
assert 'if(result.verified)' in ex and 'reserveYoutubeQuota(operationId,plan)' in ex
assert 'Обязательная проверка после videos.update' in ex
assert "return 52" in quota and "ESTIMATED_VIDEO_WRITE_UNITS=youtubeQuotaCosts['videos.list'].cost+youtubeQuotaCosts['videos.update'].cost+youtubeQuotaCosts['videos.list'].cost" in quota
assert (r/'src/youtubeApplyVerification.test.ts').exists()
assert 'Версия 0.9.9' not in app and "update.current||'0.8.1'" not in app
assert 'Версия 2.0.10.' in app and 'Версия <b>2.0.10</b>' in app
sec=(r/'src-tauri/src/security.rs').read_text();storage=(r/'src-tauri/src/storage.rs').read_text();cargo=(r/'src-tauri/Cargo.toml').read_text();redact=(r/'src/securityRedaction.ts').read_text();store=(r/'src/store.ts').read_text();notify=(r/'src/notificationCenter.ts').read_text()
assert 'security-framework = "3.7.0"' in cargo
for token in ('set_generic_password','get_generic_password','delete_generic_password','0o600','write_private_atomic','keychain_roundtrip'): assert token in sec,token
for token in ('STATE_YOUTUBE_API_KEY','STATE_OPENAI_API_KEY','secure_state_for_disk','hydrate_state_secrets','set_state_secret(&mut disk,field,"")','path.with_extension("bak")'): assert token in storage,token
for token in ('write_profile_secrets','hydrate_profile_secrets','delete_profile_secrets','write_google_secrets','hydrate_google_secrets'): assert token in yt,token
assert 'redactSensitive' in redact and 'message:safe' in store and 'title:redactSensitive(title)' in notify
pub=(r/'src/PublisherOS.tsx').read_text();prod=(r/'src/ProductionOS.tsx').read_text();accounts=(r/'src/AccountsPage.tsx').read_text();identity=(r/'src/channelIdentity.ts').read_text();local=(r/'src-tauri/src/local_delete.rs').read_text()
assert 'Обложки YouTube — не менять' in pub and 'Video Uploads сегодня' in pub and 'PUBLISH_AT_REQUIRED' in pub
assert '+ Будущий канал' in prod and 'setChannelId(created.id)' in prod
assert 'const future=findFutureChannelMatch(state.channels,p.channelTitle)' in accounts
assert "normalize('NFKC')" in identity and 'findFutureChannelMatch' in identity
assert 'trash::delete(&p)' in local and 'remove_dir_all' not in local
print('VYRON 2.0.10 SOURCE + REGRESSION CONTRACTS: PASS')
PY

npm ci --no-audit --no-fund
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
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = 'studio.channelflow.desktop'
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

echo 'VYRON 2.0.10 signed build stage: PASS'
