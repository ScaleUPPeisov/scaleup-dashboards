#!/usr/bin/env bash
set -euo pipefail
REPO='ScaleUPPeisov/scaleup-dashboards'
TAG='v1.2.0'
VERSION='1.2.0'
BASE='1.1.0'
BASE_SHA='7a0215f734a911fa7754d7f22c5033fe97fcf346ccee9e34a6e43a7664fc18d1'
ROOT="$PWD"
WORK="$ROOT/.vyron-v120-release"
ASSETS='/tmp/vyron-v120-base-assets'

curl -fsSL 'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json' -o /tmp/vyron-live-v120.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-v120.json'))
assert x['version']=='1.1.0',f"Expected live 1.1.0 before release, got {x['version']}"
print('Live 1.1.0 baseline: PASS')
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
test "$GOT" = "$BASE_SHA"
tar -xzf "$ASSETS/VYRON-$BASE-source.tar.gz" -C "$WORK"

python3 - <<PY
import json
from pathlib import Path
r=Path('$WORK');p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='$BASE'
Path('/tmp/v120-id').write_text(c['identifier'])
Path('/tmp/v120-product').write_text(c.get('productName',''))
Path('/tmp/v120-pub').write_text(c['plugins']['updater']['pubkey'])
Path('/tmp/v120-endpoints').write_text(json.dumps(c['plugins']['updater']['endpoints']))
PY

cd "$WORK"
for f in "$ROOT"/vyron-v120/apply_v120_core.py "$ROOT"/vyron-v120/apply_v120_dashboard_settings.py "$ROOT"/vyron-v120/apply_v120_youtube_backend.py "$ROOT"/vyron-v120/apply_v120_publish.py "$ROOT"/vyron-v120/apply_v120_metadata_quota.py "$ROOT"/vyron-v120/apply_v120_production.py "$ROOT"/vyron-v120/apply_v120_testfix.py; do python3 -m py_compile "$f"; done
python3 "$ROOT/vyron-v120/apply_v120_core.py" .
python3 "$ROOT/vyron-v120/apply_v120_dashboard_settings.py" .
python3 "$ROOT/vyron-v120/apply_v120_youtube_backend.py" .
python3 "$ROOT/vyron-v120/apply_v120_publish.py" .
python3 "$ROOT/vyron-v120/apply_v120_metadata_quota.py" .
python3 "$ROOT/vyron-v120/apply_v120_production.py" .
python3 "$ROOT/vyron-v120/apply_v120_testfix.py" .

python3 - <<'PY'
import json,os
from pathlib import Path
p=json.loads(Path('package.json').read_text());c=json.loads(Path('src-tauri/tauri.conf.json').read_text())
assert p['version']=='1.2.0' and c['version']=='1.2.0'
assert c['identifier']==Path('/tmp/v120-id').read_text(),'bundle identifier changed'
assert c.get('productName','')==Path('/tmp/v120-product').read_text(),'technical productName changed'
assert c['plugins']['updater']['pubkey']==Path('/tmp/v120-pub').read_text(),'updater key changed'
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip(),'secret/public key mismatch'
assert json.dumps(c['plugins']['updater']['endpoints'])==Path('/tmp/v120-endpoints').read_text(),'updater endpoints changed'
all_tsx='\n'.join(x.read_text() for x in Path('src').glob('*.tsx'))
for literal in ['VYRON YT PEISOV','ПУБЛИКАЦИЯ НА YOUTUBE','О программе','Лицензия','Эта операция потратит','После операции останется']:
    assert literal in all_tsx,literal
prod=Path('src/ProductionOS.tsx').read_text();assert '>Рендер</button>' not in prod and '>Публикация</button>' not in prod and '>ENDLUME</button>' in prod
pub=Path('src/PublisherOS.tsx').read_text()
for x in ['ПРОВЕРИТЬ НА ОДНОМ','safeDailyUploadLimit','youtubeFileFingerprint','youtubeSetThumbnail','acquireChannelUploadLock','reserveYoutubeQuota']:
    assert x in pub,x
meta=Path('src/MetadataPage.tsx').read_text();assert 'metadataQuotaPlan' in meta and 'reserveYoutubeQuota(operationId,metadataQuotaPlan)' in meta
quota=Path('src/youtubeQuota.ts').read_text();assert 'youtubeOperationActualCost' in quota and 'America/Los_Angeles' in quota
rust=Path('src-tauri/src/youtube.rs').read_text();assert 'youtube_set_thumbnail' in rust and 'youtube_file_fingerprint' in rust
assert 'googleapis.com' not in Path('src/youtubePublishSafety.ts').read_text()
print('VYRON 1.2.0 release contracts: PASS')
PY

echo 'Running complete VYRON 1.2.0 regression before signed packaging...'
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
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "$(cat /tmp/v120-id)"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"
command -v minisign >/dev/null 2>&1 || brew install minisign
base64 -D -i /tmp/v120-pub -o /tmp/vyron-v120.pub
base64 -D -i "$SIG" -o /tmp/v120.minisig
minisign -Vm "$UPDATER" -p /tmp/vyron-v120.pub -x /tmp/v120.minisig

rm -rf release;mkdir release
cat > release/RELEASE_NOTES.md <<'EOF'
# VYRON YT PEISOV 1.2.0 — Full Master

## Новый рабочий интерфейс
- Видимый бренд приложения: VYRON YT PEISOV.
- Главная перестроена в операционный центр без лишнего BI-шума.
- Верхняя панель показывает дату с годом, локальный YouTube quota ledger, время следующего сброса и живой countdown.
- Countdown рассчитывается локально по 00:00 America/Los_Angeles и не выполняет YouTube API requests.

## Производство и ENDLUME
- Production упрощён до: Обзор → Материалы → Сборка проектов → ENDLUME.
- Внутренние состояния рендера сохранены, отдельные пользовательские вкладки «Рендер» и «Публикация» удалены из Production.
- Существующий selective ENDLUME handoff сохранён: можно отправлять только выбранные проекты, включая 1 из большой партии.
- Production, локальный сбор файлов, preview и ENDLUME handoff не используют YouTube Data API.

## YouTube Publish Center
- Выбор канала и конкретных готовых MP4 перед загрузкой.
- TEST ONE перед массовой публикацией.
- DOCX metadata загружается непосредственно в Publish Center; Word может содержать больше записей, чем выбрано видео.
- Production Plan не ограничивает DOCX metadata.
- Пакетное сопоставление thumbnails и реальная установка через thumbnails.set.
- Локальный fingerprint защищает от случайной повторной загрузки одного MP4.
- Для канала действует один активный upload batch lock.
- Safe Mode включён по умолчанию.
- Пользователь может задать собственный безопасный лимит загрузок за rolling 24 часа; VYRON не выдумывает неизвестный точный лимит YouTube.
- При фактическом daily-upload-limit дальнейшие загрузки останавливаются.

## Quota preflight
- Перед Metadata Apply и Publish VYRON показывает план операции без обращения к YouTube: текущий доступный budget, стоимость операции, остаток после неё, method calls, время сброса и countdown.
- Для batch используется reservation; фактический расход записывается по operationId из реально предпринятых API method calls.
- Metadata title/description/tags/schedule продолжают использовать единый videos.update на видео в существующем backend пути, когда это допускает операция.

## Настройки и совместимость
- Отдельные разделы «Лицензия» и «О программе».
- Runtime version/build metadata отображаются в приложении.
- Существующая бессрочная owner license сохраняется.
- Bundle identifier, технический productName, updater endpoints/public key, OAuth/storage/recovery и пользовательские данные сохранены от VYRON 1.1.0.
EOF
cp "$DMG" release/VYRON-1.2.0-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
shasum -a 256 release/VYRON-1.2.0-macOS-AppleSilicon.dmg > release/SHA256.txt
shasum -a 256 release/VYRON.app.tar.gz > release/UPDATER_SHA256.txt
tar -czf release/VYRON-1.2.0-source.tar.gz --exclude='./node_modules' --exclude='./dist' --exclude='./src-tauri/target' --exclude='./release' .
shasum -a 256 release/VYRON-1.2.0-source.tar.gz > release/SOURCE_SHA256.txt
python3 - <<'PY'
import datetime,json
from pathlib import Path
x={'version':'1.2.0','notes':Path('release/RELEASE_NOTES.md').read_text(),'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'platforms':{'darwin-aarch64':{'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v1.2.0/VYRON.app.tar.gz','signature':Path('release/VYRON.app.tar.gz.sig').read_text().strip()}}}
Path('release/latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1;then
  gh release upload "$TAG" release/* --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --title 'VYRON YT PEISOV 1.2.0 — Full Master' --notes-file release/RELEASE_NOTES.md
else
  gh release create "$TAG" release/* --repo "$REPO" --target "$GITHUB_SHA" --title 'VYRON YT PEISOV 1.2.0 — Full Master' --notes-file release/RELEASE_NOTES.md
fi

cd "$ROOT"
git fetch origin main
rm -rf /tmp/vyron-main-v120
git worktree add /tmp/vyron-main-v120 origin/main
mkdir -p /tmp/vyron-main-v120/vyron-updates
cp "$WORK/release/latest.json" /tmp/vyron-main-v120/vyron-updates/latest.json
cd /tmp/vyron-main-v120
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add vyron-updates/latest.json
if ! git diff --cached --quiet;then git commit -m 'release(vyron): publish 1.2.0 updater feed';git push origin HEAD:main;fi

gh release view "$TAG" --repo "$REPO" --json tagName,assets > /tmp/v120-release.json
python3 - <<'PY'
import json,time,urllib.request
r=json.load(open('/tmp/v120-release.json'));names={x['name'] for x in r['assets']};assert r['tagName']=='v1.2.0'
for n in ['VYRON-1.2.0-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig','VYRON-1.2.0-source.tar.gz','SOURCE_SHA256.txt','UPDATER_SHA256.txt','latest.json']:assert n in names,n
for _ in range(40):
    try:
        x=json.load(urllib.request.urlopen('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'))
        if x.get('version')=='1.2.0' and x['platforms']['darwin-aarch64']['url'].endswith('/v1.2.0/VYRON.app.tar.gz'):
            print('Live updater 1.2.0: PASS');break
    except Exception:pass
    time.sleep(3)
else:raise SystemExit('live updater did not reach 1.2.0')
PY
