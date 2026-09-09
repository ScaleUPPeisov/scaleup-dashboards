#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
TAG='v2.0.10'
VERSION='2.0.10'
TESTED_SHA='80d8ce2e571f869135d5880e4fd9e5c09034145c'
CANDIDATE_RUN_ID='34339110306'
CANDIDATE_NAME='VYRON-2.0.10-final-candidate'
ROOT="$PWD"
REL='/tmp/vyron-v210-publish'

rm -rf "$REL"
mkdir -p "$REL"

# Publish only the exact candidate that passed the macOS Apple Silicon final gate.
RUN_JSON="$(gh run view "$CANDIDATE_RUN_ID" --repo "$REPO" --json conclusion,headSha,status)"
python3 - "$RUN_JSON" "$TESTED_SHA" <<'PY'
import json,sys
x=json.loads(sys.argv[1]); expected=sys.argv[2]
assert x['status']=='completed',x
assert x['conclusion']=='success',x
assert x['headSha']==expected,(x['headSha'],expected)
print('Exact tested final-gate run: PASS')
PY

gh run download "$CANDIDATE_RUN_ID" --repo "$REPO" --name "$CANDIDATE_NAME" --dir "$REL"

for f in VYRON-2.0.10-macOS-AppleSilicon.dmg VYRON.app.tar.gz VYRON.app.tar.gz.sig VYRON-2.0.10-source.tar.gz SHA256.txt UPDATER_SHA256.txt SOURCE_SHA256.txt; do
  test -s "$REL/$f"
done

python3 - "$REL" <<'PY'
from pathlib import Path
import hashlib,sys
r=Path(sys.argv[1])
def verify(sumfile,artifact):
    expected=(r/sumfile).read_text().split()[0]
    got=hashlib.sha256((r/artifact).read_bytes()).hexdigest()
    assert got==expected,(artifact,expected,got)
verify('SHA256.txt','VYRON-2.0.10-macOS-AppleSilicon.dmg')
verify('UPDATER_SHA256.txt','VYRON.app.tar.gz')
verify('SOURCE_SHA256.txt','VYRON-2.0.10-source.tar.gz')
print('Candidate SHA256 files: PASS')
PY

# Verify updater signature against the same public key used by installed clients.
test -n "${TAURI_UPDATER_PUBLIC_KEY:-}"
command -v minisign >/dev/null 2>&1 || brew install minisign
python3 - "$REL" <<'PY'
import base64,os,sys
from pathlib import Path
r=Path(sys.argv[1])
raw=os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
try:
    once=base64.b64decode(raw,validate=True)
    if once.startswith(b'untrusted comment:'):
        public=once
    else:
        public=base64.b64decode(once.strip(),validate=True)
except Exception:
    raise SystemExit('TAURI_UPDATER_PUBLIC_KEY has unexpected encoding')
if not public.startswith(b'untrusted comment:'):
    raise SystemExit('TAURI_UPDATER_PUBLIC_KEY is not a minisign public key')
Path('/tmp/vyron-v210.pub').write_bytes(public)
sig=(r/'VYRON.app.tar.gz.sig').read_text().strip()
try:
    decoded=base64.b64decode(sig,validate=True)
except Exception:
    decoded=sig.encode()
Path('/tmp/vyron-v210.minisig').write_bytes(decoded)
PY
minisign -Vm "$REL/VYRON.app.tar.gz" -p /tmp/vyron-v210.pub -x /tmp/vyron-v210.minisig

# Guard the live feed: only 2.0.9 -> 2.0.10, or idempotent 2.0.10 republish.
gh api "repos/$REPO/contents/vyron-updates/latest.json?ref=main" --jq .content | tr -d '\n' | base64 --decode > /tmp/vyron-v210-before.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-v210-before.json'))
v=x.get('version')
assert v in {'2.0.9','2.0.10'},f'Unexpected live updater version before publish: {v}'
print(f'Live updater pre-release guard: {v} -> 2.0.10 allowed')
PY

cat > "$REL/RELEASE_NOTES.md" <<'EOF'
# VYRON YT PEISOV 2.0.10 — Verified YouTube Apply

## YouTube metadata Apply
- Исправлена запись метаданных уже загруженных видео: после каждого `videos.update` выполняется обязательный owner-authorized контрольный `videos.list`.
- Успех показывается только если YouTube подтвердил фактические `title`, `description`, `tags`, `publishAt` и `privacyStatus`.
- Несовпадение возвращается как ошибка верификации, а не как ложный зелёный результат.
- Сохранены writable-поля snippet/status, включая `categoryId` и `defaultLanguage`.
- Убран скрытый fallback/retry update внутри Apply.

## Quota и безопасность
- Preflight учитывает read + update + обязательный verify-read; скрытых API-вызовов после Apply нет.
- Для «Загруженных» добавлены quota reservation и фактический accounting.
- Проверка принадлежности видео OAuth-каналу сохранена перед записью.

## Совместимость
- Сборка сделана поверх SHA256-проверенного официального source snapshot VYRON 2.0.9.
- OAuth, macOS Keychain, updater public key/endpoints, Production, ENDLUME, Publisher, Future Channels, Analytics и пользовательское storage сохранены.
- Bundle identifier остаётся `studio.channelflow.desktop`.
- Полный macOS Apple Silicon final gate прошёл успешно перед публикацией этого точного candidate.
EOF

python3 - "$REL" <<'PY'
import datetime,json,sys
from pathlib import Path
r=Path(sys.argv[1])
x={
  'version':'2.0.10',
  'notes':(r/'RELEASE_NOTES.md').read_text(),
  'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),
  'platforms':{
    'darwin-aarch64':{
      'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v2.0.10/VYRON.app.tar.gz',
      'signature':(r/'VYRON.app.tar.gz.sig').read_text().strip()
    }
  }
}
(r/'latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$REL"/* --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" --title 'VYRON YT PEISOV 2.0.10 — Verified YouTube Apply' --notes-file "$REL/RELEASE_NOTES.md" --latest
else
  gh release create "$TAG" "$REL"/* --repo "$REPO" --target "$TESTED_SHA" --title 'VYRON YT PEISOV 2.0.10 — Verified YouTube Apply' --notes-file "$REL/RELEASE_NOTES.md" --latest
fi

# Publish updater feed to main so existing 2.0.9 installations discover 2.0.10.
git fetch origin main
rm -rf /tmp/vyron-main-v210
git worktree add /tmp/vyron-main-v210 origin/main
mkdir -p /tmp/vyron-main-v210/vyron-updates
cp "$REL/latest.json" /tmp/vyron-main-v210/vyron-updates/latest.json
cd /tmp/vyron-main-v210
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add vyron-updates/latest.json
if ! git diff --cached --quiet; then
  git commit -m 'release(vyron): publish 2.0.10 updater feed'
  git push origin HEAD:main
fi

# Authoritative production verification.
gh release view "$TAG" --repo "$REPO" --json tagName,isDraft,isPrerelease,assets,targetCommitish > /tmp/vyron-v210-release.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-v210-release.json'))
assert x['tagName']=='v2.0.10' and not x['isDraft'] and not x['isPrerelease']
names={a['name'] for a in x['assets']}
required={'VYRON-2.0.10-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig','VYRON-2.0.10-source.tar.gz','latest.json','RELEASE_NOTES.md','SHA256.txt','UPDATER_SHA256.txt','SOURCE_SHA256.txt'}
assert required<=names,sorted(required-names)
print('GitHub Release v2.0.10 assets: PASS')
PY

gh api "repos/$REPO/contents/vyron-updates/latest.json?ref=main" --jq .content | tr -d '\n' | base64 --decode > /tmp/vyron-v210-live.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-v210-live.json'))
assert x.get('version')=='2.0.10',x.get('version')
p=x['platforms']['darwin-aarch64']
assert p['url'].endswith('/v2.0.10/VYRON.app.tar.gz') and p.get('signature')
print('Main updater feed 2.0.10: PASS')
PY

test "$(gh api "repos/$REPO/releases/latest" --jq .tag_name)" = 'v2.0.10'
echo 'VYRON 2.0.10 PRODUCTION PUBLISH: PASS'
