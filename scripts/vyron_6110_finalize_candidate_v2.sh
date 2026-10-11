#!/usr/bin/env bash
set -Eeuo pipefail

REPO="${1:?target repository path required}"
SAFE_BASE="588e2070877512daa637077223c678af6a216831"
PRE_FREEZE_HEAD="3e3ae9416e768733ec20058b691b8d237fb83dbd"
TARGET_BRANCH="hotfix/vyron-6.1.10-product-correctness"
TARGET_VERSION="6.1.10"
ARTIFACT_NAME="VYRON-6.1.10-MACOS-ARM64-CANDIDATE"

cd "$REPO"

echo '=== PHASE 1: EXACT STARTING TREE ==='
test "$(git rev-parse HEAD)" = "$PRE_FREEZE_HEAD"
test -z "$(git status --porcelain)"
git merge-base --is-ancestor "$SAFE_BASE" HEAD
test "$(node -p "require('./package.json').version")" = "6.1.9"
git diff --quiet "$SAFE_BASE"..HEAD -- src-tauri/icons
echo STARTING_TREE=PASS
echo ICON_DIFF_BEFORE=0

echo '=== INSTALL EXACT DEPENDENCIES ==='
npm ci --no-audit --no-fund

echo '=== PHASE 2/3: FINAL VERSION + CHANGELOG + QA GUARD ==='
python3 - <<'PY'
import json
from pathlib import Path

target='6.1.10'
old='6.1.9'

p=Path('package.json')
data=json.loads(p.read_text())
if data.get('version') != old: raise SystemExit(f'package.json expected {old}, got {data.get("version")}')
data['version']=target
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

p=Path('package-lock.json')
data=json.loads(p.read_text())
if data.get('version') != old or data.get('packages',{}).get('',{}).get('version') != old:
    raise SystemExit('package-lock root versions are not exactly 6.1.9')
data['version']=target
data['packages']['']['version']=target
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

p=Path('src-tauri/Cargo.toml')
s=p.read_text()
if s.count('version = "6.1.9"') != 1: raise SystemExit('Cargo.toml root version guard failed')
p.write_text(s.replace('version = "6.1.9"','version = "6.1.10"',1))

p=Path('src-tauri/Cargo.lock')
s=p.read_text()
needle='name = "channelflow"\nversion = "6.1.9"'
if s.count(needle) != 1: raise SystemExit('Cargo.lock channelflow version guard failed')
p.write_text(s.replace(needle,'name = "channelflow"\nversion = "6.1.10"',1))

p=Path('src-tauri/tauri.conf.json')
data=json.loads(p.read_text())
if data.get('version') != old: raise SystemExit('tauri.conf.json version guard failed')
data['version']=target
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

p=Path('src/releaseHistory.ts')
s=p.read_text()
anchor='export const VYRON_RELEASE_HISTORY:ReleaseHistoryEntry[]=[\n'
if s.count(anchor) != 1: raise SystemExit('releaseHistory anchor guard failed')
if '"version":"6.1.10"' in s: raise SystemExit('6.1.10 release history already exists')
entry='''  {\n    "date":"2026-10-11","version":"6.1.10","title":"Product Correctness & Safe Metadata PATCH","type":"PATCH","platforms":["macOS"],\n    "highlights":[\n      "Изменение названия, описания и тегов существующих видео больше не требует выбирать дату и время публикации.",\n      "Изменение расписания теперь является явным opt-in действием.",\n      "OFFLINE Render-диск отделён от настоящего ERROR, а последний подтверждённый запас видео сохраняется при временном отключении диска."\n    ],\n    "sections":{\n      "fixes":[\n        "Изменение названия, описания и тегов существующих видео больше не требует выбирать дату и время публикации.",\n        "Если пользователь не меняет расписание, VYRON не изменяет publishAt.",\n        "Если пользователь не меняет статус доступа, VYRON не изменяет PRIVATE / UNLISTED / PUBLIC.",\n        "Отключённый Render-диск больше не считается настоящей ошибкой."\n      ],\n      "interface":[\n        "Изменение расписания теперь является явным opt-in действием.",\n        "При массовом изменении метаданных VYRON показывает, какие поля изменятся, а какие останутся без изменений.",\n        "ONLINE / OFFLINE / STALE / ERROR отображаются как разные состояния."\n      ],\n      "reliability":[\n        "Последний подтверждённый запас видео остаётся доступен, когда диск временно отключён."\n      ],\n      "technical":[\n        "Обновлены regression guards для native verified inventory storage.",\n        "Исторический QA debt отделён от новых 6.1.10 regressions.",\n        "Иконка VYRON оставлена без изменений по решению владельца."\n      ]\n    },\n    "prerelease":true\n  },\n'''
p.write_text(s.replace(anchor,anchor+entry,1))

# QA-only invariant repair: the test must follow the canonical release-history head,
# not freeze a historical calendar date that necessarily changes on a new release.
p=Path('src/v320HistoryUx.test.ts')
s=p.read_text()
old_assert="expect(days[0][0]).toBe('2026-10-01');"
new_assert="expect(days[0][0]).toBe(VYRON_RELEASE_HISTORY[0].date);"
if s.count(old_assert) != 1: raise SystemExit('v320HistoryUx date assertion guard failed')
p.write_text(s.replace(old_assert,new_assert,1))
PY

changed="$(git diff --name-only | sort)"
expected="$(printf '%s\n' \
  package-lock.json \
  package.json \
  src/releaseHistory.ts \
  src/v320HistoryUx.test.ts \
  src-tauri/Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/tauri.conf.json | sort)"
test "$changed" = "$expected"
git diff --check
git diff --quiet "$SAFE_BASE" -- src-tauri/icons
echo FINALIZATION_SCOPE=PASS
printf '%s\n' "$changed"

echo '=== PHASE 4: VERSION / CHANGELOG GUARD ==='
python3 - <<'PY'
import json,re
from pathlib import Path
target='6.1.10'
pkg=json.loads(Path('package.json').read_text())
lock=json.loads(Path('package-lock.json').read_text())
tauri=json.loads(Path('src-tauri/tauri.conf.json').read_text())
cargo=Path('src-tauri/Cargo.toml').read_text()
cargo_lock=Path('src-tauri/Cargo.lock').read_text()
history=Path('src/releaseHistory.ts').read_text()
rust=re.search(r'^version\s*=\s*"([^"]+)"',cargo,re.M).group(1)
lock_rust=re.search(r'name = "channelflow"\nversion = "([^"]+)"',cargo_lock).group(1)
latest=re.search(r'VYRON_RELEASE_HISTORY:[^=]*=\[\s*\{[\s\S]*?"version":"([^"]+)"',history).group(1)
values={
 'PACKAGE_VERSION':pkg['version'],
 'PACKAGE_LOCK_VERSION':lock['version'],
 'PACKAGE_LOCK_ROOT_VERSION':lock['packages']['']['version'],
 'TAURI_VERSION':tauri['version'],
 'RUST_VERSION':rust,
 'RUST_LOCK_VERSION':lock_rust,
 'LATEST_CHANGELOG_VERSION':latest,
}
for k,v in values.items():
    print(f'{k}={v}')
    if v != target: raise SystemExit(f'{k} mismatch: {v}')
required=[
 'Изменение названия, описания и тегов существующих видео больше не требует выбирать дату и время публикации.',
 'Если пользователь не меняет расписание, VYRON не изменяет publishAt.',
 'Если пользователь не меняет статус доступа, VYRON не изменяет PRIVATE / UNLISTED / PUBLIC.',
 'Отключённый Render-диск больше не считается настоящей ошибкой.',
 'Изменение расписания теперь является явным opt-in действием.',
 'При массовом изменении метаданных VYRON показывает, какие поля изменятся, а какие останутся без изменений.',
 'Последний подтверждённый запас видео остаётся доступен, когда диск временно отключён.',
 'ONLINE / OFFLINE / STALE / ERROR отображаются как разные состояния.',
 'Обновлены regression guards для native verified inventory storage.',
 'Исторический QA debt отделён от новых 6.1.10 regressions.',
 'Иконка VYRON оставлена без изменений по решению владельца.',
]
for x in required:
    if x not in history: raise SystemExit(f'changelog missing: {x}')
print('VERSION_CHANGELOG_GUARD=PASS')
PY

echo '=== PHASE 5: FOCUSED SOURCE ACCEPTANCE ==='
npx vitest run src/vyron6110MetadataPatch.test.ts src/vyron6110MetadataScheduleOptIn.test.ts
echo METADATA=PASS
npx vitest run \
  src/vyron6110InventoryStatusContract.test.ts \
  src/v612NativeInventoryTruth.test.ts \
  src/v612NativeInventoryStress.test.ts \
  src/schedulePhysicalRegression.test.ts \
  src/v2115ScheduleSyncHotfix.test.ts \
  src/youtubeInventoryRc4.test.ts
echo INVENTORY=PASS
npx vitest run src/vyron618PublisherIntegrity.test.ts src/vyron617CurrentGenerationLeafRecovery.test.ts
echo PUBLISHER=PASS
npx vitest run \
  src/channelSchedule.test.ts \
  src/v610MetadataQueue.test.ts \
  src/schedulePhysicalRegression.test.ts \
  src/vyron6110MetadataPatch.test.ts \
  src/vyron6110MetadataScheduleOptIn.test.ts
echo SCHEDULE=PASS
npx vitest run src/v610GlobalUploadCounter.test.ts src/channelRunway.test.ts
echo COUNTERS=PASS
echo RUNWAY=PASS
npx vitest run src/v2115Rc7OauthUpdateContinuity.test.ts
echo AUTH=PASS
npm run build
echo TYPESCRIPT=PASS
cargo check --manifest-path src-tauri/Cargo.toml
echo CARGO=PASS

echo '=== PHASE 5: BASELINE-AWARE EXACT FAILURE KEYS ==='
rm -rf /tmp/vyron-safe-v2
git worktree add --detach /tmp/vyron-safe-v2 "$SAFE_BASE"
(cd /tmp/vyron-safe-v2 && npm ci --no-audit --no-fund >/dev/null && npx vitest run --reporter=json --outputFile=/tmp/vyron-safe-v2.json >/dev/null 2>&1 || true)
(npx vitest run --reporter=json --outputFile=/tmp/vyron-current-v2.json >/dev/null 2>&1 || true)
python3 - <<'PY'
import json
from pathlib import Path

def canonical(path):
    path=path.replace('\\','/')
    for marker in ('/src/','/tests/'):
        if marker in path: return marker[1:]+path.split(marker,1)[1]
    return Path(path).name

def rows(path):
    data=json.loads(Path(path).read_text())
    out=[]
    for f in data.get('testResults',[]):
        file=canonical(f.get('name',''))
        for a in f.get('assertionResults',[]):
            if a.get('status')=='failed':
                name=' > '.join([*(a.get('ancestorTitles') or []),a.get('title','')])
                out.append((file,name))
    return out

safe=rows('/tmp/vyron-safe-v2.json')
cur=rows('/tmp/vyron-current-v2.json')
sk=set(safe); ck=set(cur)
new=sorted(ck-sk); resolved=sorted(sk-ck)
print(f'SAFE_BASE_FAILURES={len(safe)}')
print(f'CURRENT_FAILURES={len(cur)}')
print(f'NEW_6_1_10_FAILURE_KEYS={len(new)}')
print(f'RESOLVED_BASELINE_FAILURE_KEYS={len(resolved)}')
if len(safe) != 68: raise SystemExit(f'unexpected SAFE_BASE failure count {len(safe)}')
if len(cur) != 57: raise SystemExit(f'unexpected current failure count {len(cur)}')
if new:
    print('NEW_FAILURE_KEYS:')
    for x in new: print(x)
    raise SystemExit(1)
if len(resolved) != 11: raise SystemExit(f'unexpected resolved baseline count {len(resolved)}')
PY

echo '=== PHASE 6: FINAL DIFF AUDIT ==='
python3 - <<'PY'
import json, os, re, subprocess
from pathlib import Path
base='588e2070877512daa637077223c678af6a216831'

def at(ref,path): return subprocess.check_output(['git','show',f'{ref}:{path}'],text=True)
def current(path): return Path(path).read_text()

classifications={
 'src-tauri/src/youtube.rs':'METADATA_PATCH',
 'src/api.ts':'METADATA_PATCH',
 'src/metadataPatch.ts':'METADATA_PATCH,SCHEDULE_OPT_IN',
 'src/ExistingVideos.tsx':'METADATA_PATCH,SCHEDULE_OPT_IN',
 'src/MetadataPage.tsx':'METADATA_PATCH,SCHEDULE_OPT_IN',
 'src/dailyOperations.ts':'INVENTORY_STATUS,INVENTORY_CACHE',
 'src/DailyOperationsCenter.tsx':'INVENTORY_STATUS,INVENTORY_CACHE',
 'src/releaseHistory.ts':'CHANGELOG',
 'package.json':'VERSION_METADATA',
 'package-lock.json':'VERSION_METADATA',
 'src-tauri/Cargo.toml':'VERSION_METADATA',
 'src-tauri/Cargo.lock':'VERSION_METADATA',
 'src-tauri/tauri.conf.json':'VERSION_METADATA',
}
raw=subprocess.check_output(['git','diff','--name-only',base,'--'],text=True).splitlines()
production=set(); unexplained=[]
for path in raw:
    if path in classifications:
        production.add(path); continue
    is_test=path.startswith('tests/') or '.test.' in path
    is_evidence=path.startswith('VYRON')
    is_qa=path.startswith('.github/workflows/') or path.startswith('scripts/vyron_6110_')
    if (path.startswith('src/') or path.startswith('src-tauri/') or path in ('package.json','package-lock.json')) and not (is_test or is_evidence or is_qa):
        unexplained.append(path)
expected=set(classifications)
if production != expected or unexplained:
    raise SystemExit(f'production classification mismatch missing={sorted(expected-production)} extra={sorted(production-expected)} unexplained={unexplained}')
print('CHANGED_PRODUCTION_FILES:')
for p in sorted(production): print(f'{p} => {classifications[p]}')
print('QA_ONLY_FILE=src/v320HistoryUx.test.ts')

exact_files=[
 'src/youtubePublishSafety.ts','src/uploadQueue.ts','src/UploadProcessingMonitor.tsx',
 'src/publisherIntegrity.ts','src/channelIdentity.ts','src/channelRunwayStore.ts',
 'src/youtubeOauthState.ts','src-tauri/src/security.rs','src-tauri/src/oauth_vault.rs',
 'src-tauri/src/profile.rs'
]
for path in exact_files:
    if at(base,path) != current(path): raise SystemExit(f'UNEXPECTED_PROTECTED_FILE_DIFF={path}')

def normalize_api(text):
    text=re.sub(r'^export type YoutubeExistingMutationPatch=.*\n','',text,flags=re.M)
    out=[]; seen=0
    for line in text.splitlines(True):
        if 'youtubeUpdateExisting:' in line:
            out.append('  youtubeUpdateExisting: <ALLOWED_METADATA_UPDATE_EXISTING>,\n'); seen+=1
        else: out.append(line)
    if seen != 1: raise SystemExit(f'api youtubeUpdateExisting occurrences={seen}')
    return ''.join(out)
if normalize_api(at(base,'src/api.ts')) != normalize_api(current('src/api.ts')):
    raise SystemExit('UNEXPECTED_PROTECTED_DIFF=src/api.ts outside metadata allowlist')

def remove_rust_fn(text,fn_name):
    m=re.search(rf'(?m)^(?:#\[[^\n]+\]\n)*\s*(?:pub\s+)?(?:async\s+)?fn\s+{re.escape(fn_name)}\b',text)
    if not m: raise SystemExit(f'Rust function not found: {fn_name}')
    start=m.start(); brace=text.find('{',m.end())
    if brace < 0: raise SystemExit(f'opening brace not found: {fn_name}')
    depth=0; i=brace; in_str=False; escape=False
    while i < len(text):
        ch=text[i]
        if in_str:
            if escape: escape=False
            elif ch=='\\': escape=True
            elif ch=='"': in_str=False
        else:
            if ch=='"': in_str=True
            elif ch=='{': depth+=1
            elif ch=='}':
                depth-=1
                if depth==0:
                    end=i+1
                    while end<len(text) and text[end] in '\r\n': end+=1
                    return text[:start]+f'<ALLOWED_METADATA_FN:{fn_name}>\n'+text[end:]
        i+=1
    raise SystemExit(f'closing brace not found: {fn_name}')
if remove_rust_fn(at(base,'src-tauri/src/youtube.rs'),'youtube_update_existing_video') != remove_rust_fn(current('src-tauri/src/youtube.rs'),'youtube_update_existing_video'):
    raise SystemExit('UNEXPECTED_PROTECTED_DIFF=youtube.rs outside metadata function')

def normalize_tauri(text):
    data=json.loads(text); data['version']='<VERSION_METADATA>'
    return json.dumps(data,sort_keys=True,separators=(',',':'))
if normalize_tauri(at(base,'src-tauri/tauri.conf.json')) != normalize_tauri(current('src-tauri/tauri.conf.json')):
    raise SystemExit('UNEXPECTED_PROTECTED_DIFF=tauri.conf.json outside version metadata')
print('PROTECTED_FUNCTIONAL_DIFF=0')
PY
git diff --quiet "$SAFE_BASE" -- src-tauri/icons
echo ICON_DIFF=0

echo '=== PHASE 7: FREEZE EXACTLY ONE CANDIDATE COMMIT ==='
test "$(git rev-parse HEAD)" = "$PRE_FREEZE_HEAD"
git config user.name 'VYRON QA'
git config user.email 'vyron-qa@users.noreply.github.com'
git add \
  package.json package-lock.json src/releaseHistory.ts src/v320HistoryUx.test.ts \
  src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
staged="$(git diff --cached --name-only | sort)"
expected_staged="$(printf '%s\n' \
  package-lock.json package.json src/releaseHistory.ts src/v320HistoryUx.test.ts \
  src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/tauri.conf.json | sort)"
test "$staged" = "$expected_staged"
git diff --cached --check
git commit -m 'release(vyron): freeze 6.1.10 product candidate'
CANDIDATE_HEAD="$(git rev-parse HEAD)"
test "$(git rev-parse HEAD^)" = "$PRE_FREEZE_HEAD"
test -z "$(git status --porcelain)"
git push origin "HEAD:$TARGET_BRANCH"
echo "VYRON_6_1_10_CANDIDATE_HEAD=$CANDIDATE_HEAD"

echo '=== PHASE 8: BUILD EXACT MACOS ARM64 CANDIDATE ==='
test "$(git rev-parse HEAD)" = "$CANDIDATE_HEAD"
test "$(uname -m)" = "arm64"
npm run tauri:build -- --bundles app
test "$(git rev-parse HEAD)" = "$CANDIDATE_HEAD"
APP="$(find src-tauri/target -type d -path '*/release/bundle/macos/VYRON.app' -print -quit)"
test -n "$APP" && test -d "$APP"
INFO="$APP/Contents/Info.plist"
PRODUCT="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$INFO")"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFO")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$INFO")"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO")"
EXE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$INFO")"
EXE="$APP/Contents/MacOS/$EXE_NAME"
ICON="$APP/Contents/Resources/icon.icns"
ARCH="$(lipo -archs "$EXE")"
test "$PRODUCT" = "VYRON"
test "$VERSION" = "6.1.10"
test "$BUILD" = "6.1.10"
test "$BUNDLE_ID" = "studio.channelflow.desktop"
test "$ARCH" = "arm64"
test -f "$ICON"
codesign --verify --deep --strict "$APP"

rm -rf candidate-out
mkdir -p candidate-out
COPY="candidate-out/$ARTIFACT_NAME.app"
ditto "$APP" "$COPY"
EXE_SHA="$(shasum -a 256 "$EXE" | awk '{print $1}')"
INFO_SHA="$(shasum -a 256 "$INFO" | awk '{print $1}')"
ICON_SHA="$(shasum -a 256 "$ICON" | awk '{print $1}')"
(
  cd "$COPY"
  find . -type f -print | LC_ALL=C sort | while IFS= read -r f; do
    printf '%s  %s\n' "$(shasum -a 256 "$f" | awk '{print $1}')" "${f#./}"
  done
) > candidate-out/BUNDLE_MANIFEST_SHA256.txt

tar -C candidate-out -czf "candidate-out/$ARTIFACT_NAME.tar.gz" "$ARTIFACT_NAME.app"
cat > candidate-out/CANDIDATE_EVIDENCE.txt <<EOF
VYRON_6_1_10_CANDIDATE_STATUS=SOURCE_AND_BUILD_PASS
BASE=$SAFE_BASE
PRE_FREEZE_HEAD=$PRE_FREEZE_HEAD
CANDIDATE_HEAD=$CANDIDATE_HEAD
VERSION=$VERSION
BUILD=$BUILD
PRODUCT=$PRODUCT
BUNDLE_ID=$BUNDLE_ID
ARCH=$ARCH
CODESIGN=PASS
APP_EXECUTABLE_SHA256=$EXE_SHA
INFOPLIST_SHA256=$INFO_SHA
ICON_SHA256=$ICON_SHA
SAFE_BASE_FAILURES=68
CURRENT_FAILURES=57
NEW_6_1_10_FAILURE_KEYS=0
RESOLVED_BASELINE_FAILURE_KEYS=11
METADATA=PASS
INVENTORY=PASS
PUBLISHER=PASS
SCHEDULE=PASS
COUNTERS=PASS
RUNWAY=PASS
AUTH=PASS
TYPESCRIPT=PASS
CARGO=PASS
PROTECTED_FUNCTIONAL_DIFF=0
ICON_DIFF=0
QA_ONLY_HISTORY_GUARD=src/v320HistoryUx.test.ts
PRODUCTION_APP_BEFORE=NOT_AVAILABLE_IN_GITHUB_RUNNER
OWNER_APPLICATION_REPLACED=NO_BY_GITHUB_WORKFLOW
PHYSICAL_MAC_ACCEPTANCE=BLOCKED_NOT_RUN_HERE
RELEASE_AUTHORIZED=NO
RELEASE=BLOCKED_PENDING_OWNER_APPROVAL
EOF
cat candidate-out/CANDIDATE_EVIDENCE.txt

echo '=== STOP: NO RELEASE ==='
echo "VYRON_6_1_10_CANDIDATE_HEAD=$CANDIDATE_HEAD"
echo GITHUB_RELEASE_CREATED=NO
echo LIVE_UPDATER_MANIFEST_CHANGED=NO
echo PRODUCTION_INSTALL_PERFORMED=NO
echo RELEASE_AUTHORIZED=NO
echo RELEASE=BLOCKED_PENDING_OWNER_APPROVAL
