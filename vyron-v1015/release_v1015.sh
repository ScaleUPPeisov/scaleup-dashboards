#!/usr/bin/env bash
set -euo pipefail
REPO='ScaleUPPeisov/scaleup-dashboards'
TAG='v1.0.15'
VERSION='1.0.15'
BASE='1.0.14'
ROOT="$PWD"
WORK="$ROOT/.vyron-v1015-release"
ASSETS='/tmp/vyron-v1014-release-assets'

curl -fsSL 'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json' -o /tmp/vyron-live-v1015.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-v1015.json'))
assert x['version']=='1.0.14',f"Expected live 1.0.14, got {x['version']}"
print('Live 1.0.14: PASS')
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
Path('/tmp/v1014-id').write_text(c['identifier'])
Path('/tmp/v1014-pub').write_text(c['plugins']['updater']['pubkey'])
Path('/tmp/v1014-endpoints').write_text(json.dumps(c['plugins']['updater']['endpoints']))
protected=['src-tauri/src/youtube.rs','src-tauri/src/storage.rs','src-tauri/src/system.rs','src-tauri/src/updater_bridge.rs','src-tauri/src/files.rs','src/ProductionManager.tsx','src/productionManagerApi.ts','src/MetadataPage.tsx','src/ExistingVideos.tsx','src/PublisherOS.tsx','src/ProductionOS.tsx','src/ProductionWorkspace.tsx','src/CommandCenter.tsx','src/ChannelRunway.tsx','src/RecoveryGate.tsx','src/NotificationStack.tsx','src/notificationCenter.ts','src/channelSchedule.ts','src/channelSort.ts','src/autopilotRuntime.ts']
Path('/tmp/v1014-protected-release.json').write_text(json.dumps({f:hashlib.sha256((r/f).read_bytes()).hexdigest() for f in protected if (r/f).exists()},sort_keys=True))
PY

cd "$WORK"
python3 "$ROOT/vyron-v1015/apply_v1015_image_validation.py"

python3 - <<'PY'
import hashlib,json,os
from pathlib import Path
p=json.loads(Path('package.json').read_text());c=json.loads(Path('src-tauri/tauri.conf.json').read_text())
assert p['version']=='1.0.15' and c['version']=='1.0.15'
assert c['identifier']==Path('/tmp/v1014-id').read_text()
assert c['plugins']['updater']['pubkey']==Path('/tmp/v1014-pub').read_text()
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
assert json.dumps(c['plugins']['updater']['endpoints'])==Path('/tmp/v1014-endpoints').read_text()
for f,h in json.loads(Path('/tmp/v1014-protected-release.json').read_text()).items():
    assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h,f'OUT OF SCOPE: {f}'
rust=Path('src-tauri/src/production_manager.rs').read_text()
assert 'project_has_renderable_image' in rust
assert 'multiple_images_are_valid_for_endlume' in rust
assert 'images.len()!=1' not in rust
assert 'изображений: {}, должно быть 1' not in rust
assert 'errs.push("изображение не найдено".to_string())' in rust
assert 'fs::copy(&p.image_source,tmp.join(&p.image_name))' in rust
print('VYRON 1.0.15 release contracts: PASS')
PY
! grep -RniE 'youtube_upload_video|youtube_list_existing_videos|youtube_update_existing_video|youtube_channel_analytics|googleapis\.com' src-tauri/src/production_manager.rs

echo 'Running full regression before signed packaging...'
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
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "$(cat /tmp/v1014-id)"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
command -v minisign >/dev/null 2>&1 || brew install minisign
base64 -D -i /tmp/v1014-pub -o /tmp/vyron-v1015.pub
base64 -D -i "$SIG" -o /tmp/v1015.minisig
minisign -Vm "$UPDATER" -p /tmp/vyron-v1015.pub -x /tmp/v1015.minisig

rm -rf release;mkdir release
cat > release/RELEASE_NOTES.md <<'EOF'
# VYRON 1.0.15 — ENDLUME Image Validation Hotfix

- Исправлена ложная ошибка Production Manager: `изображений: 2, должно быть 1`.
- Удалено ограничение VYRON «в проекте должно быть ровно одно изображение».
- Теперь VYRON проверяет только наличие хотя бы одного пригодного изображения; 1, 2 и больше изображений допустимы.
- Сначала проверяется точный `image_path` из batch manifest. Это исключает ложный повторный подсчёт изображения в обычном VYRON batch.
- Если manifest image вручную перемещён/переименован, VYRON допускает другое непустое поддерживаемое изображение в папке проекта.
- Скрытые файлы вроде `.phantom.png` не считаются fallback-изображением.
- Если пригодных изображений действительно нет, проект по-прежнему корректно блокируется с ошибкой `изображение не найдено`.
- Multi-image transitions и выбор последовательности изображений остаются ответственностью ENDLUME.
- Builder VYRON, Downloads Collector, Music distribution, ENDLUME bridge, Metadata, YouTube/OAuth, расписание 3/1, DOCX и A-Z dropdowns не переписывались.
- Уже созданные batch пересобирать не требуется: после обновления их можно повторно проверить и передать в ENDLUME.
EOF
cp "$DMG" release/VYRON-1.0.15-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-1.0.15-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-1.0.15-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-1.0.15-source.tar.gz > release/SOURCE_SHA256.txt
python3 - <<'PY'
import datetime,json
from pathlib import Path
x={'version':'1.0.15','notes':Path('release/RELEASE_NOTES.md').read_text(),'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'platforms':{'darwin-aarch64':{'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v1.0.15/VYRON.app.tar.gz','signature':Path('release/VYRON.app.tar.gz.sig').read_text().strip()}}}
Path('release/latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1;then
  gh release upload "$TAG" release/* --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --title 'VYRON 1.0.15 — ENDLUME Image Validation Hotfix' --notes-file release/RELEASE_NOTES.md
else
  gh release create "$TAG" release/* --repo "$REPO" --target "$GITHUB_SHA" --title 'VYRON 1.0.15 — ENDLUME Image Validation Hotfix' --notes-file release/RELEASE_NOTES.md
fi

cd "$ROOT"
git fetch origin main
rm -rf /tmp/vyron-main-v1015
git worktree add /tmp/vyron-main-v1015 origin/main
mkdir -p /tmp/vyron-main-v1015/vyron-updates
cp "$WORK/release/latest.json" /tmp/vyron-main-v1015/vyron-updates/latest.json
cd /tmp/vyron-main-v1015
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add vyron-updates/latest.json
if ! git diff --cached --quiet;then git commit -m 'release(vyron): publish 1.0.15 updater feed';git push origin HEAD:main;fi

gh release view "$TAG" --repo "$REPO" --json tagName,assets > /tmp/v1015-release.json
python3 - <<'PY'
import json,time,urllib.request
r=json.load(open('/tmp/v1015-release.json'));names={x['name'] for x in r['assets']};assert r['tagName']=='v1.0.15'
for n in ['VYRON-1.0.15-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig','VYRON-1.0.15-source.tar.gz']:assert n in names,n
for _ in range(30):
    try:
        x=json.load(urllib.request.urlopen('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'))
        if x.get('version')=='1.0.15':print('Live updater 1.0.15: PASS');break
    except Exception:pass
    time.sleep(3)
else:raise SystemExit('live updater did not reach 1.0.15')
PY
