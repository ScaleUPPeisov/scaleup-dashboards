#!/usr/bin/env bash
set -Eeuo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
: "${TAURI_SIGNING_PRIVATE_KEY:?TAURI_SIGNING_PRIVATE_KEY required}"
: "${TAURI_UPDATER_PUBLIC_KEY:?TAURI_UPDATER_PUBLIC_KEY required}"

REPO=ScaleUPPeisov/scaleup-dashboards
VERSION=2.1.3
TAG=v2.1.3
TARGETED_RUN=34707506552
TARGETED_ARTIFACT=VYRON-2.1.3-updater-hotfix-green-source
GREEN_SHA=0a52bef2b38b1aefd0f0d76b7dd7bcb0763dafc6680cd366c72eb97c0556a9ad
HOTFIX_SOURCE_COMMIT=381b8fa2923c6d854c503d85916ac931b715f302
BASE_212_COMMIT=31b810ae4be4c2937deb440dd4be2d24137c7c29
PUBLISHEROS_SHA=13fcfe32368312dc907b7c1c2a04727ed14e6df3c3933b102ee6c41655593c98
BUNDLE_ID=studio.channelflow.desktop

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "v2.1.3 already exists; refusing duplicate release"
  exit 1
fi

rm -rf green work release download-back
mkdir -p green work
gh run download "$TARGETED_RUN" --repo "$REPO" -n "$TARGETED_ARTIFACT" -D green
test -s green/VYRON-2.1.3-updater-hotfix-source.tar.gz
test "$(awk '{print $1}' green/SOURCE_SHA256.txt)" = "$GREEN_SHA"
test "$(shasum -a 256 green/VYRON-2.1.3-updater-hotfix-source.tar.gz|awk '{print $1}')" = "$GREEN_SHA"
tar -xzf green/VYRON-2.1.3-updater-hotfix-source.tar.gz -C work
test "$(shasum -a 256 work/src/PublisherOS.tsx|awk '{print $1}')" = "$PUBLISHEROS_SHA"

python3 - <<'PY'
import json
c=json.load(open('work/src-tauri/tauri.conf.json'))
assert c['version']=='2.1.3'
assert c['identifier']=='studio.channelflow.desktop'
assert c['bundle']['createUpdaterArtifacts'] is True
assert c['plugins']['updater']['endpoints']==[
 'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json',
 'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json']
caps=json.load(open('work/src-tauri/capabilities/default.json'))['permissions']
assert 'updater:default' in caps and 'process:default' in caps
PY

normalize_key(){
  local name="$1" kind="$2"
  python3 - "$name" "$kind" <<'PY'
import base64,os,sys
name,kind=sys.argv[1:]
raw=os.environ[name].strip()
def b64(v):
  try:return base64.b64decode(v,validate=True).decode()
  except Exception:return None
once=b64(raw)
if once and once.startswith('untrusted comment:'): out,box=raw,once
else:
  if not once: raise SystemExit(f'{name}: invalid encoding')
  out=once.strip(); box=b64(out)
  if not box or not box.startswith('untrusted comment:'): raise SystemExit(f'{name}: invalid Tauri key')
if kind not in box.splitlines()[0].lower(): raise SystemExit(f'{name}: wrong key type')
print(out)
PY
}
export TAURI_SIGNING_PRIVATE_KEY="$(normalize_key TAURI_SIGNING_PRIVATE_KEY 'secret key')"
export TAURI_UPDATER_PUBLIC_KEY="$(normalize_key TAURI_UPDATER_PUBLIC_KEY 'public key')"
echo "::add-mask::$TAURI_SIGNING_PRIVATE_KEY"
python3 - <<'PY'
import json,os
c=json.load(open('work/src-tauri/tauri.conf.json'))
assert c['plugins']['updater']['pubkey'].strip()==os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip()
print('CLIENT PUBLIC KEY = RELEASE SIGNING KEY: PASS')
PY

rustup target add aarch64-apple-darwin
cd work
npm ci --no-audit --no-fund
npx tauri build --target aarch64-apple-darwin --bundles app,dmg
APP=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -maxdepth 1 -name 'VYRON.app' -print -quit)
DMG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name '*.dmg' -print -quit)
UPDATER=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz' -print -quit)
SIG=$(find src-tauri/target/aarch64-apple-darwin/release/bundle -name '*.app.tar.gz.sig' -print -quit)
test -d "$APP" && test -s "$DMG" && test -s "$UPDATER" && test -s "$SIG"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.1.3'
test "$(plutil -extract CFBundleVersion raw -o - "$APP/Contents/Info.plist")" = '2.1.3'
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "$BUNDLE_ID"
EXE=$(plutil -extract CFBundleExecutable raw -o - "$APP/Contents/Info.plist")
file "$APP/Contents/MacOS/$EXE" | grep -q arm64
otool -hv "$APP/Contents/MacOS/$EXE" | grep -q ARM64
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -qi 'Signature=adhoc'
hdiutil verify "$DMG"
M="$RUNNER_TEMP/v213-build-mount"; rm -rf "$M"; mkdir -p "$M"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$M" >/dev/null
trap 'hdiutil detach "$M" >/dev/null 2>&1 || true' EXIT
MAPP="$M/VYRON.app"; test -d "$MAPP"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$MAPP/Contents/Info.plist")" = '2.1.3'
test "$(plutil -extract CFBundleIdentifier raw -o - "$MAPP/Contents/Info.plist")" = "$BUNDLE_ID"
MEXE=$(plutil -extract CFBundleExecutable raw -o - "$MAPP/Contents/Info.plist")
file "$MAPP/Contents/MacOS/$MEXE" | grep -q arm64
codesign --verify --deep --strict --verbose=2 "$MAPP"
hdiutil detach "$M" >/dev/null; trap - EXIT

mkdir release
cp "$DMG" release/VYRON-2.1.3-macOS-AppleSilicon.dmg
cp "$UPDATER" release/VYRON.app.tar.gz
cp "$SIG" release/VYRON.app.tar.gz.sig
cp "$GITHUB_WORKSPACE/green/VYRON-2.1.3-updater-hotfix-source.tar.gz" release/VYRON-2.1.3-source.tar.gz
(cd release && shasum -a 256 VYRON-2.1.3-macOS-AppleSilicon.dmg > SHA256.txt)
(cd release && shasum -a 256 VYRON.app.tar.gz > UPDATER_SHA256.txt)
(cd release && shasum -a 256 VYRON-2.1.3-source.tar.gz > SOURCE_SHA256.txt)

cat > release/FINAL_TEST_REPORT.md <<EOF
# VYRON 2.1.3 — UPDATER HOTFIX
- Base production source: $BASE_212_COMMIT
- Targeted updater gate: $TARGETED_RUN — PASS
- Source diff guard: PASS — updater/version only
- TypeScript: PASS
- Frontend production build: PASS
- Production/YouTube/Shorts/Storage: unchanged byte-for-byte where guarded
- ARM64: PASS
- codesign: PASS — ad-hoc
- Notarization: N/A
- Full Rust / real FFmpeg: not rerun because those modules are unchanged
EOF
cat > release/RELEASE_NOTES.md <<'EOF'
# VYRON 2.1.3 — Updater Hotfix
Critical updater-only hotfix. No Production, Shorts, Metadata, OAuth, Keychain, YouTube upload, quota, schedule, Storage Lifecycle or ENDLUME changes.

Fixes the stranded same-version 2.1.2 update path, uses the canonical VYRON feed first, preserves the GitHub release manifest fallback, and makes updater check/download/signature/install failures visible instead of silently swallowing them.
EOF

cd "$GITHUB_WORKSPACE"
if ! command -v minisign >/dev/null; then brew install minisign; fi
python3 - <<'PY'
import base64,os,pathlib
pathlib.Path('/tmp/v213.pub').write_bytes(base64.b64decode(os.environ['TAURI_UPDATER_PUBLIC_KEY'].strip(),validate=True))
pathlib.Path('/tmp/v213.sig').write_bytes(base64.b64decode(pathlib.Path('work/release/VYRON.app.tar.gz.sig').read_text().strip(),validate=True))
PY
minisign -Vm work/release/VYRON.app.tar.gz -p /tmp/v213.pub -x /tmp/v213.sig

python3 - <<'PY'
import datetime,json,pathlib
sig=pathlib.Path('work/release/VYRON.app.tar.gz.sig').read_text().strip(); assert sig
d={'version':'2.1.3','notes':'VYRON 2.1.3 updater hotfix','pub_date':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'platforms':{'darwin-aarch64':{'url':'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v2.1.3/VYRON.app.tar.gz','signature':sig}}}
pathlib.Path('work/release/latest.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
PY

gh release create "$TAG" --repo "$REPO" --target "$HOTFIX_SOURCE_COMMIT" --title 'VYRON 2.1.3 — Updater Hotfix' --notes-file work/release/RELEASE_NOTES.md \
  work/release/VYRON-2.1.3-macOS-AppleSilicon.dmg work/release/VYRON.app.tar.gz work/release/VYRON.app.tar.gz.sig \
  work/release/VYRON-2.1.3-source.tar.gz work/release/SHA256.txt work/release/UPDATER_SHA256.txt work/release/SOURCE_SHA256.txt \
  work/release/FINAL_TEST_REPORT.md work/release/RELEASE_NOTES.md work/release/latest.json

test "$(gh release view "$TAG" --repo "$REPO" --json isDraft --jq '.isDraft|tostring')" = false
test "$(gh release view "$TAG" --repo "$REPO" --json isPrerelease --jq '.isPrerelease|tostring')" = false

mkdir download-back
gh release download "$TAG" --repo "$REPO" --dir download-back
cd download-back
for f in VYRON-2.1.3-macOS-AppleSilicon.dmg VYRON.app.tar.gz VYRON.app.tar.gz.sig VYRON-2.1.3-source.tar.gz SHA256.txt UPDATER_SHA256.txt SOURCE_SHA256.txt latest.json; do test -s "$f"; done
test "$(awk '{print $1}' SHA256.txt)" = "$(shasum -a 256 VYRON-2.1.3-macOS-AppleSilicon.dmg|awk '{print $1}')"
test "$(awk '{print $1}' UPDATER_SHA256.txt)" = "$(shasum -a 256 VYRON.app.tar.gz|awk '{print $1}')"
test "$(awk '{print $1}' SOURCE_SHA256.txt)" = "$GREEN_SHA"
hdiutil verify VYRON-2.1.3-macOS-AppleSilicon.dmg
M="$RUNNER_TEMP/v213-release-mount"; rm -rf "$M"; mkdir -p "$M"
hdiutil attach VYRON-2.1.3-macOS-AppleSilicon.dmg -nobrowse -readonly -mountpoint "$M" >/dev/null
trap 'hdiutil detach "$M" >/dev/null 2>&1 || true' EXIT
APP="$M/VYRON.app"; test -d "$APP"
test "$(plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = '2.1.3'
test "$(plutil -extract CFBundleIdentifier raw -o - "$APP/Contents/Info.plist")" = "$BUNDLE_ID"
EXE=$(plutil -extract CFBundleExecutable raw -o - "$APP/Contents/Info.plist")
file "$APP/Contents/MacOS/$EXE" | grep -q arm64
codesign --verify --deep --strict --verbose=2 "$APP"
hdiutil detach "$M" >/dev/null; trap - EXIT
python3 - <<'PY'
import base64,os,pathlib
pathlib.Path('/tmp/v213-back.sig').write_bytes(base64.b64decode(pathlib.Path('VYRON.app.tar.gz.sig').read_text().strip(),validate=True))
PY
minisign -Vm VYRON.app.tar.gz -p /tmp/v213.pub -x /tmp/v213-back.sig
DMG_SHA=$(awk '{print $1}' SHA256.txt)
UPDATER_SHA=$(awk '{print $1}' UPDATER_SHA256.txt)
cd "$GITHUB_WORKSPACE"

CONTENT=$(base64 -i download-back/latest.json | tr -d '\n')
for path in vyron-updates/latest.json channelflow-updates/latest.json; do
  META=$(gh api "repos/$REPO/contents/$path?ref=main")
  SHA=$(printf '%s' "$META"|python3 -c 'import sys,json;print(json.load(sys.stdin)["sha"])')
  gh api --method PUT "repos/$REPO/contents/$path" -f message='VYRON updater: activate 2.1.3 hotfix compatibility feed' -f content="$CONTENT" -f sha="$SHA" -f branch=main >/dev/null
done

for path in vyron-updates/latest.json channelflow-updates/latest.json; do
  out="/tmp/$(basename "$(dirname "$path")").json"
  gh api "repos/$REPO/contents/$path?ref=main" --jq .content | base64 --decode > "$out"
done
python3 - <<'PY'
import json,pathlib
sig=pathlib.Path('download-back/VYRON.app.tar.gz.sig').read_text().strip()
for p in ['/tmp/vyron-updates.json','/tmp/channelflow-updates.json']:
 d=json.load(open(p)); assert d['version']=='2.1.3'; x=d['platforms']['darwin-aarch64']; assert x['url']=='https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v2.1.3/VYRON.app.tar.gz'; assert x['signature']==sig
PY
curl -L --fail --show-error -o /tmp/VYRON.app.tar.gz 'https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/download/v2.1.3/VYRON.app.tar.gz'
test -s /tmp/VYRON.app.tar.gz
test "$(shasum -a 256 /tmp/VYRON.app.tar.gz|awk '{print $1}')" = "$UPDATER_SHA"
minisign -Vm /tmp/VYRON.app.tar.gz -p /tmp/v213.pub -x /tmp/v213-back.sig

echo "V213_DMG_SHA256=$DMG_SHA"
echo "V213_UPDATER_SHA256=$UPDATER_SHA"
echo 'VYRON 2.1.3 RELEASE + DOWNLOAD-BACK + BOTH FEEDS: PASS'
