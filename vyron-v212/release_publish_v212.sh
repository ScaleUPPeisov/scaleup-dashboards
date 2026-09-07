#!/usr/bin/env bash
set -euo pipefail

REPO='ScaleUPPeisov/scaleup-dashboards'
ROOT="$PWD"
WORK="$ROOT/.vyron-v212-release"
REL="$WORK/release"
TAG='v2.0.12'
VERSION='2.0.12'

: "${GITHUB_SHA:?GITHUB_SHA is required}"
test -d "$WORK"

APP=$(find "$WORK/src-tauri/target/aarch64-apple-darwin/release/bundle/macos" -maxdepth 1 -name 'VYRON.app' -print -quit)
DMG=$(find "$WORK/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg" -name '*.dmg' -print -quit)
UPDATER=$(find "$WORK/src-tauri/target/aarch64-apple-darwin/release/bundle" -name '*.app.tar.gz' -print -quit)
SIG=$(find "$WORK/src-tauri/target/aarch64-apple-darwin/release/bundle" -name '*.app.tar.gz.sig' -print -quit)

test -d "$APP"
test -s "$DMG"
test -s "$UPDATER"
test -s "$SIG"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION"
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil verify "$DMG"

# Never reuse the inherited 2.0.11 release directory: package only the artifacts
# rebuilt after every 2.0.12 patch has been applied.
rm -rf "$REL"
mkdir -p "$REL"
cp "$DMG" "$REL/VYRON-2.0.12-macOS-AppleSilicon.dmg"
cp "$UPDATER" "$REL/VYRON.app.tar.gz"
cp "$SIG" "$REL/VYRON.app.tar.gz.sig"
cp "$ROOT/vyron-v212/RELEASE_NOTES.md" "$REL/RELEASE_NOTES.md"
(
  cd "$REL"
  shasum -a 256 'VYRON-2.0.12-macOS-AppleSilicon.dmg' > SHA256.txt
  shasum -a 256 'VYRON.app.tar.gz' > UPDATER_SHA256.txt
)
tar -C "$WORK" -czf "$REL/VYRON-2.0.12-source.tar.gz" \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./src-tauri/target' \
  --exclude='./release' \
  .
(
  cd "$REL"
  shasum -a 256 'VYRON-2.0.12-source.tar.gz' > SOURCE_SHA256.txt
)

for f in \
  VYRON-2.0.12-macOS-AppleSilicon.dmg \
  VYRON.app.tar.gz \
  VYRON.app.tar.gz.sig \
  VYRON-2.0.12-source.tar.gz \
  SHA256.txt UPDATER_SHA256.txt SOURCE_SHA256.txt RELEASE_NOTES.md; do
  test -s "$REL/$f"
done

# The public updater currently comes directly from main/vyron-updates/latest.json.
# Allow the known public predecessor or an idempotent rerun of this exact release.
gh api "repos/$REPO/contents/vyron-updates/latest.json?ref=main" --jq .content \
  | tr -d '\n' | base64 --decode > /tmp/vyron-live-before-v212.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-before-v212.json'))
v=x.get('version')
assert v in {'2.0.9','2.0.12'}, f'Unexpected live updater version before 2.0.12 publish: {v}'
if v=='2.0.12':
    p=x.get('platforms',{}).get('darwin-aarch64',{})
    assert p.get('url','').endswith('/v2.0.12/VYRON.app.tar.gz')
    assert p.get('signature')
print('VYRON 2.0.12 updater predecessor/current guard: PASS')
PY

python3 - <<'PY'
import datetime,json
from pathlib import Path
rel=Path('.vyron-v212-release/release')
sig=(rel/'VYRON.app.tar.gz.sig').read_text().strip()
assert sig
x={
  'version':'2.0.12',
  'notes':(rel/'RELEASE_NOTES.md').read_text(),
  'pub_date':datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),
  'platforms':{
    'darwin-aarch64':{
      'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v2.0.12/VYRON.app.tar.gz',
      'signature':sig,
    }
  }
}
(rel/'latest.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
PY
test -s "$REL/latest.json"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  TARGET=$(gh release view "$TAG" --repo "$REPO" --json targetCommitish --jq .targetCommitish)
  test "$TARGET" = "$GITHUB_SHA" || {
    echo "Existing $TAG targets unexpected commit $TARGET"
    exit 1
  }
  gh release upload "$TAG" "$REL"/* --repo "$REPO" --clobber
  gh release edit "$TAG" --repo "$REPO" \
    --title 'VYRON YT PEISOV 2.0.12 — Production Materials & Project Cleanup' \
    --notes-file "$REL/RELEASE_NOTES.md"
else
  gh release create "$TAG" "$REL"/* --repo "$REPO" --target "$GITHUB_SHA" \
    --title 'VYRON YT PEISOV 2.0.12 — Production Materials & Project Cleanup' \
    --notes-file "$REL/RELEASE_NOTES.md"
fi

gh release view "$TAG" --repo "$REPO" --json tagName,targetCommitish,isDraft,isPrerelease,assets > /tmp/vyron-v212-release.json
python3 - <<'PY'
import json,os
r=json.load(open('/tmp/vyron-v212-release.json'))
assert r['tagName']=='v2.0.12'
assert r['targetCommitish']==os.environ['GITHUB_SHA']
assert not r['isDraft'] and not r['isPrerelease']
names={x['name'] for x in r['assets']}
required={
 'VYRON-2.0.12-macOS-AppleSilicon.dmg','VYRON.app.tar.gz','VYRON.app.tar.gz.sig',
 'VYRON-2.0.12-source.tar.gz','SOURCE_SHA256.txt','UPDATER_SHA256.txt','SHA256.txt',
 'RELEASE_NOTES.md','latest.json'
}
assert required<=names, sorted(required-names)
print('VYRON 2.0.12 GitHub Release assets: PASS')
PY

# Only after the public release is complete do we switch the authoritative updater.
git fetch origin main
rm -rf /tmp/vyron-main-v212
git worktree add /tmp/vyron-main-v212 origin/main
mkdir -p /tmp/vyron-main-v212/vyron-updates
cp "$REL/latest.json" /tmp/vyron-main-v212/vyron-updates/latest.json
cd /tmp/vyron-main-v212
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add vyron-updates/latest.json
if ! git diff --cached --quiet; then
  git commit -m 'release(vyron): publish 2.0.12 updater feed'
  git push origin HEAD:main
fi
cd "$ROOT"

gh api "repos/$REPO/contents/vyron-updates/latest.json?ref=main" --jq .content \
  | tr -d '\n' | base64 --decode > /tmp/vyron-live-api-v212.json
python3 - <<'PY'
import json
x=json.load(open('/tmp/vyron-live-api-v212.json'))
assert x.get('version')=='2.0.12'
p=x['platforms']['darwin-aarch64']
assert p['url'].endswith('/v2.0.12/VYRON.app.tar.gz')
assert p.get('signature')
print('GITHUB MAIN UPDATER 2.0.12: PASS')
PY

gh release view "$TAG" --repo "$REPO" --json tagName,targetCommitish,assets > /tmp/vyron-v212-public-final.json
python3 - <<'PY'
import json,os
r=json.load(open('/tmp/vyron-v212-public-final.json'))
assert r['tagName']=='v2.0.12' and r['targetCommitish']==os.environ['GITHUB_SHA']
names={x['name'] for x in r['assets']}
assert 'VYRON-2.0.12-macOS-AppleSilicon.dmg' in names
assert 'VYRON.app.tar.gz' in names and 'VYRON.app.tar.gz.sig' in names
print('PUBLIC VYRON 2.0.12 FINAL VERIFY: PASS')
PY

echo 'VYRON YT PEISOV 2.0.12 PUBLISH: PASS'
