#!/usr/bin/env bash
set -euo pipefail
REPO='ScaleUPPeisov/scaleup-dashboards';ROOT="$PWD";WORK="$ROOT/.vyron-v211-release";REL="$WORK/release";TAG='v2.0.11'
gh api "repos/$REPO/contents/vyron-updates/latest.json?ref=main" --jq .content | tr -d '\n' | base64 --decode > /tmp/vyron-live-before-v211.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-before-v211.json'));v=x.get('version');assert v in {'2.0.9','2.0.11'},f'Unexpected live updater version before 2.0.11 publish: {v}'
if v=='2.0.11':
 p=x.get('platforms',{}).get('darwin-aarch64',{});assert p.get('url','').endswith('/v2.0.11/VYRON.app.tar.gz');assert p.get('signature')
print('Updater predecessor/current guard: PASS')
PY
for f in VYRON-2.0.11-macOS-AppleSilicon.dmg VYRON.app.tar.gz VYRON.app.tar.gz.sig VYRON-2.0.11-source.tar.gz SHA256.txt UPDATER_SHA256.txt SOURCE_SHA256.txt RELEASE_NOTES.md;do test -s "$REL/$f";done
python3 - <<'PY'
import datetime,json
from pathlib import Path
rel=Path('.vyron-v211-release/release');x={'version':'2.0.11','notes':(rel/'RELEASE_NOTES.md').read_text(),'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'platforms':{'darwin-aarch64':{'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v2.0.11/VYRON.app.tar.gz','signature':(rel/'VYRON.app.tar.gz.sig').read_text().strip()}}};assert x['platforms']['darwin-aarch64']['signature'];(rel/'latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1;then
 TARGET=$(gh release view "$TAG" --repo "$REPO" --json targetCommitish --jq .targetCommitish);test "$TARGET" = "$GITHUB_SHA" || { echo "Existing v2.0.11 targets unexpected commit $TARGET";exit 1; };gh release upload "$TAG" "$REL"/* --repo "$REPO" --clobber;gh release edit "$TAG" --repo "$REPO" --title 'VYRON YT PEISOV 2.0.11 — Shorts Factory' --notes-file "$REL/RELEASE_NOTES.md"
else gh release create "$TAG" "$REL"/* --repo "$REPO" --target "$GITHUB_SHA" --title 'VYRON YT PEISOV 2.0.11 — Shorts Factory' --notes-file "$REL/RELEASE_NOTES.md";fi
gh release view "$TAG" --repo "$REPO" --json tagName,targetCommitish,assets > /tmp/vyron-v211-release.json
python3 - <<'PY'
import json,os
r=json.load(open('/tmp/vyron-v211-release.json'));names={x['name'] for x in r['assets']};assert r['tagName']=='v2.0.11';assert r['targetCommitish']==os.environ['GITHUB_SHA'];req={'VYRON-2.0.11-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig','VYRON-2.0.11-source.tar.gz','SOURCE_SHA256.txt','UPDATER_SHA256.txt','SHA256.txt','RELEASE_NOTES.md','latest.json'};assert req<=names,sorted(req-names);print('VYRON 2.0.11 GitHub Release assets: PASS')
PY
git fetch origin main;rm -rf /tmp/vyron-main-v211;git worktree add /tmp/vyron-main-v211 origin/main;mkdir -p /tmp/vyron-main-v211/vyron-updates;cp "$REL/latest.json" /tmp/vyron-main-v211/vyron-updates/latest.json;cd /tmp/vyron-main-v211;git config user.name 'github-actions[bot]';git config user.email '41898282+github-actions[bot]@users.noreply.github.com';git add vyron-updates/latest.json;if ! git diff --cached --quiet;then git commit -m 'release(vyron): publish 2.0.11 updater feed';git push origin HEAD:main;fi
gh api "repos/$REPO/contents/vyron-updates/latest.json?ref=main" --jq .content | tr -d '\n' | base64 --decode > /tmp/vyron-live-api-v211.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-api-v211.json'));assert x.get('version')=='2.0.11';p=x['platforms']['darwin-aarch64'];assert p['url'].endswith('/v2.0.11/VYRON.app.tar.gz');assert p.get('signature');print('GITHUB MAIN UPDATER 2.0.11: PASS')
PY
echo 'VYRON YT PEISOV 2.0.11 PUBLISH: PASS'
