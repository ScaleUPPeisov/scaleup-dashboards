#!/usr/bin/env bash
set -euo pipefail
REPO='ScaleUPPeisov/scaleup-dashboards'
TAG='v1.0.13'
VERSION='1.0.13'
BASE='1.0.12'
ROOT="$PWD"
WORK="$ROOT/.vyron-v1013-release"
ASSETS='/tmp/vyron-v1012-assets'

curl -fsSL 'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json' -o /tmp/vyron-live.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live.json'))
assert x['version']=='1.0.12',f"Expected live 1.0.12, got {x['version']}"
print('Live 1.0.12: PASS')
PY

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
# Re-source normalized values from GITHUB_ENV for this same shell.
export TAURI_SIGNING_PRIVATE_KEY="$(grep '^TAURI_SIGNING_PRIVATE_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"
export TAURI_UPDATER_PUBLIC_KEY="$(grep '^TAURI_UPDATER_PUBLIC_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"

rm -rf "$WORK" "$ASSETS";mkdir -p "$WORK" "$ASSETS"
gh release download "v$BASE" --repo "$REPO" --pattern "VYRON-$BASE-source.tar.gz" --pattern 'SOURCE_SHA256.txt' --dir "$ASSETS"
EXPECTED="$(awk '{print $1;exit}' "$ASSETS/SOURCE_SHA256.txt")"
GOT="$(shasum -a 256 "$ASSETS/VYRON-$BASE-source.tar.gz"|awk '{print $1}')"
test "$EXPECTED" = "$GOT"
tar -xzf "$ASSETS/VYRON-$BASE-source.tar.gz" -C "$WORK"
python3 - <<PY
import json
from pathlib import Path
r=Path('$WORK');p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='$BASE'
Path('/tmp/v1012-id').write_text(c['identifier']);Path('/tmp/v1012-pub').write_text(c['plugins']['updater']['pubkey']);Path('/tmp/v1012-endpoints').write_text(json.dumps(c['plugins']['updater']['endpoints']))
PY

cd "$WORK"
python3 "$ROOT/vyron-v1013/apply_v1013_core.py"
python3 "$ROOT/vyron-v1013/apply_v1013_recovery.py"
python3 "$ROOT/vyron-v1013/apply_v1013_schedule.py"
python3 "$ROOT/vyron-v1013/apply_v1013_cleanup.py"
python3 - <<'PY'
import json,os
from pathlib import Path
p=json.loads(Path('package.json').read_text());c=json.loads(Path('src-tauri/tauri.conf.json').read_text())
assert p['version']=='1.0.13' and c['version']=='1.0.13'
assert c['identifier']==Path('/tmp/v1012-id').read_text()
assert c['plugins']['updater']['pubkey']==Path('/tmp/v1012-pub').read_text()
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
assert json.dumps(c['plugins']['updater']['endpoints'])==Path('/tmp/v1012-endpoints').read_text()
assert '<NotificationCenter/>' in Path('src/App.tsx').read_text()
assert '<RecoveryGate/>' in Path('src/App.tsx').read_text()
assert 'Продолжить расписание автоматически' in Path('src/MetadataPage.tsx').read_text()
assert 'await loadYoutube()' not in Path('src/MetadataPage.tsx').read_text()
print('Release contracts: PASS')
PY
! grep -RniE 'youtube_upload_video|youtube_list_existing_videos|youtube_update_existing_video|youtube_channel_analytics|googleapis\.com' src/channelSchedule.ts src/RecoveryGate.tsx src/NotificationStack.tsx src/notificationCenter.ts src/CommandCenter.tsx

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
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "$(cat /tmp/v1012-id)"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
command -v minisign >/dev/null 2>&1 || brew install minisign
base64 -D -i /tmp/v1012-pub -o /tmp/vyron.pub
base64 -D -i "$SIG" -o /tmp/v1013.minisig
minisign -Vm "$UPDATER" -p /tmp/vyron.pub -x /tmp/v1013.minisig

rm -rf release;mkdir release
cat > release/RELEASE_NOTES.md <<'EOF'
# VYRON 1.0.13 — Recovery, Smart Schedule & Notifications

- Единый Notification Center слева сверху: success/info/warning/error, очередь и защита от дублей.
- Command Center показывает готовность раздельно: N / план + процент.
- Встроенный updater явно уведомляет о новой версии и об успешной установке после перезапуска.
- При прерванной Production-сборке VYRON на старте находит persisted checkpoint, показывает 60-секундный recovery dialog и по таймеру продолжает безопасно.
- Готовые проекты не пересоздаются; незавершённая .tmp-папка пересобирается атомарно. «Начать заново» создаёт новый batch и не удаляет старый автоматически.
- Metadata автоматически продолжает расписание конкретного канала от последней локально известной отложенной даты.
- Для графика через 2 дня: 13.09 → 15.09 → 17.09 и т.д.; 34 видео от 15.09 заканчиваются 20.11.2026.
- DOCX PUBLISH TIME сохранён; fallback-время интерпретируется как KRAT (+07), независимо от VPN/часового пояса Mac.
- После успешного применения Metadata локальный Existing Videos cache обновляется сразу, без скрытой повторной YouTube-синхронизации.
- YouTube OAuth/API, Analytics, Competitors, Downloads Collector и ENDLUME bridge не переписывались.
EOF
cp "$DMG" release/VYRON-1.0.13-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-1.0.13-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-1.0.13-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-1.0.13-source.tar.gz > release/SOURCE_SHA256.txt
python3 - <<'PY'
import datetime,json
from pathlib import Path
x={'version':'1.0.13','notes':Path('release/RELEASE_NOTES.md').read_text(),'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'platforms':{'darwin-aarch64':{'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v1.0.13/VYRON.app.tar.gz','signature':Path('release/VYRON.app.tar.gz.sig').read_text().strip()}}}
Path('release/latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1;then
  gh release upload "$TAG" release/* --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --title 'VYRON 1.0.13 — Recovery, Smart Schedule & Notifications' --notes-file release/RELEASE_NOTES.md
else
  gh release create "$TAG" release/* --repo "$REPO" --target "$GITHUB_SHA" --title 'VYRON 1.0.13 — Recovery, Smart Schedule & Notifications' --notes-file release/RELEASE_NOTES.md
fi

cd "$ROOT";git fetch origin main;rm -rf /tmp/vyron-main-v1013;git worktree add /tmp/vyron-main-v1013 origin/main
mkdir -p /tmp/vyron-main-v1013/vyron-updates;cp "$WORK/release/latest.json" /tmp/vyron-main-v1013/vyron-updates/latest.json
cd /tmp/vyron-main-v1013;git config user.name 'github-actions[bot]';git config user.email '41898282+github-actions[bot]@users.noreply.github.com';git add vyron-updates/latest.json
if ! git diff --cached --quiet;then git commit -m 'release(vyron): publish 1.0.13 updater feed';git push origin HEAD:main;fi

gh release view "$TAG" --repo "$REPO" --json tagName,assets > /tmp/v1013-release.json
python3 - <<'PY'
import json,time,urllib.request
r=json.load(open('/tmp/v1013-release.json'));names={x['name'] for x in r['assets']};assert r['tagName']=='v1.0.13'
for n in ['VYRON-1.0.13-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig','VYRON-1.0.13-source.tar.gz']:assert n in names,n
for _ in range(30):
    try:
        x=json.load(urllib.request.urlopen('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'))
        if x.get('version')=='1.0.13':print('Live updater 1.0.13: PASS');break
    except Exception:pass
    time.sleep(3)
else:raise SystemExit('live updater did not reach 1.0.13')
PY
