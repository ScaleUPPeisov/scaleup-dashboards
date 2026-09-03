#!/usr/bin/env bash
set -euo pipefail
REPO='ScaleUPPeisov/scaleup-dashboards'
TAG='v1.1.0'
VERSION='1.1.0'
BASE='1.0.15'
ROOT="$PWD"
WORK="$ROOT/.vyron-v110-release"
ASSETS='/tmp/vyron-v110-base-assets'

curl -fsSL 'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json' -o /tmp/vyron-live-v110.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-v110.json'))
assert x['version']=='1.0.15',f"Expected live 1.0.15, got {x['version']}"
print('Live 1.0.15: PASS')
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
export TAURI_SIGNING_PRIVATE_KEY="$(grep '^TAURI_SIGNING_PRIVATE_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"
export TAURI_UPDATER_PUBLIC_KEY="$(grep '^TAURI_UPDATER_PUBLIC_KEY=' "$GITHUB_ENV"|tail -1|cut -d= -f2-)"

rm -rf "$WORK" "$ASSETS";mkdir -p "$WORK" "$ASSETS"
gh release download "v$BASE" --repo "$REPO" --pattern "VYRON-$BASE-source.tar.gz" --pattern 'SOURCE_SHA256.txt' --dir "$ASSETS"
EXPECTED="$(awk '{print $1;exit}' "$ASSETS/SOURCE_SHA256.txt")"
GOT="$(shasum -a 256 "$ASSETS/VYRON-$BASE-source.tar.gz"|awk '{print $1}')"
test "$EXPECTED" = "$GOT"
tar -xzf "$ASSETS/VYRON-$BASE-source.tar.gz" -C "$WORK"

python3 - <<PY
import hashlib,json
from pathlib import Path
r=Path('$WORK');p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='$BASE'
Path('/tmp/v110-id').write_text(c['identifier'])
Path('/tmp/v110-pub').write_text(c['plugins']['updater']['pubkey'])
Path('/tmp/v110-endpoints').write_text(json.dumps(c['plugins']['updater']['endpoints']))
protected=[
 'src-tauri/src/updater_bridge.rs','src-tauri/src/license.rs','src-tauri/src/storage.rs','src-tauri/src/files.rs','src-tauri/src/system.rs','src-tauri/src/youtube_intelligence.rs','src-tauri/src/ai.rs',
 'src/App.tsx','src/DashboardOS.tsx','src/SettingsOS.tsx','src/MetadataPage.tsx','src/ExistingVideos.tsx','src/PublisherOS.tsx','src/ProductionOS.tsx','src/ProductionWorkspace.tsx','src/CommandCenter.tsx','src/ChannelRunway.tsx','src/RecoveryGate.tsx','src/NotificationStack.tsx','src/notificationCenter.ts','src/channelSchedule.ts','src/channelSort.ts','src/autopilotRuntime.ts','src/productionPrefs.ts','src/main.tsx'
]
Path('/tmp/v110-protected-release.json').write_text(json.dumps({f:hashlib.sha256((r/f).read_bytes()).hexdigest() for f in protected if (r/f).exists()},sort_keys=True))
PY

cd "$WORK"
python3 "$ROOT/vyron-v110/apply_v110_endlume.py" .
python3 "$ROOT/vyron-v110/apply_v110_endlume_fix.py" .
python3 "$ROOT/vyron-v110/apply_v110_endlume_bridge_fix.py" .
python3 "$ROOT/vyron-v110/apply_v110_quota.py" .
python3 "$ROOT/vyron-v110/apply_v110_quota_fix.py" .
python3 "$ROOT/vyron-v110/apply_v110_version.py" .

python3 - <<'PY'
import hashlib,json,os
from pathlib import Path
p=json.loads(Path('package.json').read_text());c=json.loads(Path('src-tauri/tauri.conf.json').read_text())
assert p['version']=='1.1.0' and c['version']=='1.1.0'
assert c['identifier']==Path('/tmp/v110-id').read_text()
assert c['plugins']['updater']['pubkey']==Path('/tmp/v110-pub').read_text()
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
assert json.dumps(c['plugins']['updater']['endpoints'])==Path('/tmp/v110-endpoints').read_text()
for f,h in json.loads(Path('/tmp/v110-protected-release.json').read_text()).items():
    assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h,f'OUT OF SCOPE: {f}'
rust=Path('src-tauri/src/production_manager.rs').read_text()
assert 'collector_seen_at_start' in rust and 'recursive_images' in rust
assert 'project_has_renderable_image' in rust
assert 'selected_project_ids:Option<Vec<String>>' in rust
assert 'validate_production_projects' in rust
assert 'ENDLUME_ALREADY_SENT' in rust
assert '.vyron-handoff-' in rust
assert 'googleapis.com' not in rust
youtube=Path('src-tauri/src/youtube.rs').read_text()
assert 'youtube-oauth.json' in youtube and 'google-config.json' in youtube
assert 'https://www.googleapis.com/auth/youtube.force-ssl' in youtube
assert 'youtube-api-request' in youtube
assert 'emit_youtube_api_request(&app,"videos.insert"' in youtube
quota=Path('src/youtubeQuota.ts').read_text()
assert "'videos.update':{bucket:'general',cost:50" in quota
assert "'videos.insert':{bucket:'videoUploads',cost:1" in quota
assert 'America/Los_Angeles' in quota and 'subscribeYoutubeQuotaClock' in quota
bridge=Path('src/ProductionStatusBridge.tsx').read_text()
assert 'readProductionPrefs' in bridge and 'loadProductionPrefs' not in bridge
print('VYRON 1.1.0 release contracts: PASS')
PY

echo 'Running complete VYRON 1.1.0 regression before signed packaging...'
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
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "$(cat /tmp/v110-id)"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
command -v minisign >/dev/null 2>&1 || brew install minisign
base64 -D -i /tmp/v110-pub -o /tmp/vyron-v110.pub
base64 -D -i "$SIG" -o /tmp/v110.minisig
minisign -Vm "$UPDATER" -p /tmp/vyron-v110.pub -x /tmp/v110.minisig

rm -rf release;mkdir release
cat > release/RELEASE_NOTES.md <<'EOF'
# VYRON 1.1.0 — Exact YouTube Quota + Selective ENDLUME Handoff

## YouTube quota
- Учёт YouTube API переведён с приблизительной оценки команд VYRON на фактически предпринятые API method calls.
- `videos.update` учитывается как 50 units в основном Data API budget.
- `videos.insert` учитывается отдельно в Video Uploads bucket и не смешивается с основным дневным write-budget.
- Неуспешный фактически отправленный API request также учитывается.
- Добавлены локальные reservations перед пакетными операциями.
- Расчёт сброса quota привязан к 00:00 `America/Los_Angeles` и корректно учитывает PST/PDT.
- Countdown работает локально через один shared timer и не создаёт YouTube polling.
- Metadata + schedule по-прежнему объединяются в один `videos.update`, когда это допускает операция.

## ENDLUME
- Можно выбрать и отправить в ENDLUME только нужные проекты из batch: 1, 5, 30, 1000 и т.д.
- Для выбранных проектов создаётся immutable subset manifest; исходный `batch.json` и остальные проекты не изменяются.
- Добавлена проверка только выбранных проектов перед handoff.
- Добавлен локальный per-project handoff ledger и статус `SENT`.
- Повторная отправка уже переданного проекта требует явного подтверждения.
- VYRON продолжает отслеживать результат ENDLUME в том числе при отдельном Production root на внешнем диске.
- После завершения рендера локальный job переводится в `READY_UPLOAD`, с уведомлением «Видео готово».

## Совместимость
- VYRON 1.1.0 собран поверх точного опубликованного source VYRON 1.0.15 с проверкой SHA256.
- Bundle identifier, updater endpoints/public key, лицензия, storage core, Downloads collector и существующие пользовательские данные не менялись.
- Production/ENDLUME не выполняют YouTube API calls.
EOF
cp "$DMG" release/VYRON-1.1.0-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-1.1.0-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-1.1.0-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-1.1.0-source.tar.gz > release/SOURCE_SHA256.txt
python3 - <<'PY'
import datetime,json
from pathlib import Path
x={'version':'1.1.0','notes':Path('release/RELEASE_NOTES.md').read_text(),'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'platforms':{'darwin-aarch64':{'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v1.1.0/VYRON.app.tar.gz','signature':Path('release/VYRON.app.tar.gz.sig').read_text().strip()}}}
Path('release/latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1;then
  gh release upload "$TAG" release/* --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --title 'VYRON 1.1.0 — Exact YouTube Quota + Selective ENDLUME Handoff' --notes-file release/RELEASE_NOTES.md
else
  gh release create "$TAG" release/* --repo "$REPO" --target "$GITHUB_SHA" --title 'VYRON 1.1.0 — Exact YouTube Quota + Selective ENDLUME Handoff' --notes-file release/RELEASE_NOTES.md
fi

cd "$ROOT"
git fetch origin main
rm -rf /tmp/vyron-main-v110
git worktree add /tmp/vyron-main-v110 origin/main
mkdir -p /tmp/vyron-main-v110/vyron-updates
cp "$WORK/release/latest.json" /tmp/vyron-main-v110/vyron-updates/latest.json
cd /tmp/vyron-main-v110
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add vyron-updates/latest.json
if ! git diff --cached --quiet;then git commit -m 'release(vyron): publish 1.1.0 updater feed';git push origin HEAD:main;fi

gh release view "$TAG" --repo "$REPO" --json tagName,assets > /tmp/v110-release.json
python3 - <<'PY'
import json,time,urllib.request
r=json.load(open('/tmp/v110-release.json'));names={x['name'] for x in r['assets']};assert r['tagName']=='v1.1.0'
for n in ['VYRON-1.1.0-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig','VYRON-1.1.0-source.tar.gz','latest.json']:assert n in names,n
for _ in range(30):
    try:
        x=json.load(urllib.request.urlopen('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'))
        if x.get('version')=='1.1.0':print('Live updater 1.1.0: PASS');break
    except Exception:pass
    time.sleep(3)
else:raise SystemExit('live updater did not reach 1.1.0')
PY
