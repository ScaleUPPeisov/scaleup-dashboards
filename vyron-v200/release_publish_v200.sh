#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v200-release"
REL="$WORK/release"
TAG='v2.0.0'

curl -fsSL 'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json' -o /tmp/vyron-live-before-v200.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-before-v200.json'))
assert x.get('version')=='1.2.0',f"Live updater must still be 1.2.0 before publish, got {x.get('version')}"
print('Live updater pre-release guard: PASS')
PY

for f in VYRON-2.0.0-macOS-AppleSilicon.dmg VYRON.app.tar.gz VYRON.app.tar.gz.sig VYRON-2.0.0-source.tar.gz SHA256.txt UPDATER_SHA256.txt SOURCE_SHA256.txt; do
test -s "$REL/$f"
done

command -v minisign >/dev/null 2>&1 || brew install minisign
base64 -D -i /tmp/v200-release-pub -o /tmp/vyron-v200.pub
base64 -D -i "$REL/VYRON.app.tar.gz.sig" -o /tmp/vyron-v200.minisig
minisign -Vm "$REL/VYRON.app.tar.gz" -p /tmp/vyron-v200.pub -x /tmp/vyron-v200.minisig

cat > "$REL/RELEASE_NOTES.md" <<'EOF'
# VYRON YT PEISOV 2.0.0 — Final

## Publish Workspace и YouTube recovery
- Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.
- YouTube resumable upload session и offset сохраняются между перезапусками VYRON.
- После обрыва или закрытия приложения загрузку можно продолжить без второго `videos.insert`.
- Защита блокирует recovery, если исходный MP4 исчез или изменился.

## Error Center и YouTube cache
- Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.
- Добавлен persisted freshness layer для YouTube cache.

## Analytics и Competitors
- Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».
- Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.
- Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.

## Dashboard и Attention Center
- Главная показывает cached Views/Revenue/trend.
- Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.

## Опциональная YouTube-автопубликация
- OFF по умолчанию.
- Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit.
- Проверяются metadata, schedule, duplicate fingerprint и quota.
- Максимум одно подготовленное видео на канал за цикл.
- Незавершённая resumable session всегда восстанавливается раньше новой загрузки.
- Настройка автопубликации сохраняется между запусками.

## Совместимость
- 2.0.0 собран поверх SHA-проверенного exact source опубликованной 1.2.0.
- Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены.
EOF

python3 - <<'PY'
import datetime,json
from pathlib import Path
rel=Path('.vyron-v200-release/release')
x={
 'version':'2.0.0',
 'notes':(rel/'RELEASE_NOTES.md').read_text(),
 'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),
 'platforms':{'darwin-aarch64':{
   'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v2.0.0/VYRON.app.tar.gz',
   'signature':(rel/'VYRON.app.tar.gz.sig').read_text().strip()
 }}
}
(rel/'latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$REL"/* --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --title 'VYRON YT PEISOV 2.0.0 — Final' --notes-file "$REL/RELEASE_NOTES.md"
else
  gh release create "$TAG" "$REL"/* --repo "$REPO" --target "$GITHUB_SHA" --title 'VYRON YT PEISOV 2.0.0 — Final' --notes-file "$REL/RELEASE_NOTES.md"
fi

gh release view "$TAG" --repo "$REPO" --json tagName,assets > /tmp/vyron-v200-release.json
python3 - <<'PY'
import json
r=json.load(open('/tmp/vyron-v200-release.json'));names={x['name'] for x in r['assets']}
assert r['tagName']=='v2.0.0'
required={'VYRON-2.0.0-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig','VYRON-2.0.0-source.tar.gz','SOURCE_SHA256.txt','UPDATER_SHA256.txt','latest.json'}
assert required<=names,sorted(required-names)
print('GitHub Release assets: PASS')
PY

git fetch origin main
rm -rf /tmp/vyron-main-v200
git worktree add /tmp/vyron-main-v200 origin/main
mkdir -p /tmp/vyron-main-v200/vyron-updates
cp "$REL/latest.json" /tmp/vyron-main-v200/vyron-updates/latest.json
cd /tmp/vyron-main-v200
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add vyron-updates/latest.json
if ! git diff --cached --quiet; then
  git commit -m 'release(vyron): publish 2.0.0 updater feed'
  git push origin HEAD:main
fi

python3 - <<'PY'
import json,time,urllib.request
for _ in range(40):
    try:
        x=json.load(urllib.request.urlopen('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'))
        if x.get('version')=='2.0.0' and x['platforms']['darwin-aarch64']['url'].endswith('/v2.0.0/VYRON.app.tar.gz'):
            print('LIVE UPDATER 2.0.0: PASS')
            break
    except Exception:
        pass
    time.sleep(3)
else:
    raise SystemExit('Live updater did not reach 2.0.0')
PY

echo 'VYRON YT PEISOV 2.0.0 PUBLISH: PASS'
