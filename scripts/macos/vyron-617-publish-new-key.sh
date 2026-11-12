#!/usr/bin/env bash
# Publish VYRON 6.1.17 as a NEW-KEY prerelease from the owner's Mac.
# Do not change stable latest.json: already-installed 6.1.16 trusts a leaked key.
set -Eeuo pipefail
umask 077
fail(){ echo "BLOCKER=$1" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$ROOT"
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || fail REQUIRES_APPLE_SILICON
[[ "$(id -u)" != 0 ]] || fail DO_NOT_RUN_AS_ROOT
[[ "$(git branch --show-current)" == feature/vyron-macos-ultimate ]] || fail WRONG_GIT_BRANCH
[[ -z "$(git status --porcelain)" ]] || fail UNCOMMITTED_SOURCE_CHANGES
command -v gh >/dev/null || fail INSTALL_GITHUB_CLI_FIRST
gh auth status -h github.com >/dev/null 2>&1 || fail LOGIN_TO_GH_FIRST
if gh release view v6.1.17 --repo ScaleUPPeisov/vyron-releases >/dev/null 2>&1; then
  fail RELEASE_617_ALREADY_EXISTS_REFUSE_OVERWRITE
fi
KEY="$HOME/.vyron-release-keys/vyron-updater-2026.key"
PUB="$KEY.pub"
[[ -s "$KEY" && -s "$PUB" ]] || fail ROTATED_KEYS_MISSING
chmod 600 "$KEY"
EXPECTED=6f95fd039839eaa94cb378a67a0205e42e449a84c978674e20c5fb5abcfdfb19
[[ "$(shasum -a 256 "$PUB" | awk '{print $1}')" == "$EXPECTED" ]] || fail PUBLIC_KEY_FINGERPRINT_MISMATCH
node --test scripts/macos/test-vyron-617-rotated-public-key.mjs scripts/macos/test-vyron-rotated-updater.mjs
npm run build

# Protect installed 6.1.16's bundle identity and Keychain designated requirement.
CURRENT=''
for candidate in /Applications/VYRON.app "$HOME/Applications/VYRON.app"; do
  if [[ -d "$candidate" ]]; then CURRENT="$candidate"; break; fi
done
[[ -n "$CURRENT" ]] || fail INSTALLED_APP_NOT_FOUND
codesign --verify --deep --strict "$CURRENT" || fail CURRENT_CODESIGN_INVALID
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$CURRENT/Contents/Info.plist")" == 6.1.16 ]] || fail INSTALLED_VERSION_NOT_616
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$CURRENT/Contents/Info.plist")" == studio.channelflow.desktop ]] || fail OLD_BUNDLE_ID_MISMATCH
OLD_REQ="$(codesign -dr - "$CURRENT" 2>&1 | sed -n 's/^designated => //p')"
[[ -n "$OLD_REQ" && "$OLD_REQ" != *cdhash* ]] || fail OLD_CODESIGN_IDENTITY_NOT_STABLE
SIGNING_IDENTITY="$(printenv APPLE_SIGNING_IDENTITY 2>/dev/null || true)"
if [[ -z "$SIGNING_IDENTITY" ]]; then SIGNING_IDENTITY='VYRON Local Code Signing'; fi
security find-identity -v -p codesigning | grep -F "\"$SIGNING_IDENTITY\"" >/dev/null || fail MAC_CODESIGN_CERTIFICATE_NOT_IN_KEYCHAIN
printf 'SOURCE_SHA=%s\n' "$(git rev-parse HEAD)"
printf 'NEW_PUBLIC_KEY_SHA256=%s\n' "$EXPECTED"
printf 'Signing password (hidden): ' >&2
IFS= read -rs KEY_PASSWORD
printf '\n' >&2
[[ -n "$KEY_PASSWORD" ]] || fail KEY_PASSWORD_EMPTY
export TAURI_SIGNING_PRIVATE_KEY="$KEY"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$KEY_PASSWORD"
export APPLE_SIGNING_IDENTITY="$SIGNING_IDENTITY"
export CARGO_BUILD_JOBS=2
cleanup(){ unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD KEY_PASSWORD; }
trap cleanup EXIT
npx tauri build --target aarch64-apple-darwin --bundles app,dmg --config src-tauri/tauri.617-rotated.conf.json
cleanup
trap - EXIT

BASE=src-tauri/target/aarch64-apple-darwin/release/bundle
APP="$BASE/macos/VYRON.app"
ARCHIVE="$BASE/macos/VYRON.app.tar.gz"
SIG="$ARCHIVE.sig"
DMG="$(find "$BASE/dmg" -maxdepth 1 -name '*.dmg' -print -quit)"
[[ -d "$APP" && -s "$ARCHIVE" && -s "$SIG" && -n "$DMG" && -s "$DMG" ]] || fail SIGNED_ARTIFACTS_MISSING
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")" == 6.1.17 ]] || fail BUILT_VERSION_WRONG
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" == studio.channelflow.desktop ]] || fail BUILT_BUNDLE_ID_WRONG
codesign --verify --deep --strict "$APP" || fail BUILT_CODESIGN_INVALID
NEW_REQ="$(codesign -dr - "$APP" 2>&1 | sed -n 's/^designated => //p')"
[[ "$NEW_REQ" == "$OLD_REQ" ]] || fail CODESIGN_IDENTITY_CHANGED
hdiutil verify "$DMG" || fail DMG_INVALID
OUT="$HOME/.vyron-release-candidates/v6.1.17"
mkdir -p "$OUT"
cp "$ARCHIVE" "$OUT/VYRON.app.tar.gz"
cp "$SIG" "$OUT/VYRON.app.tar.gz.sig"
cp "$DMG" "$OUT/VYRON-6.1.17-arm64.dmg"
shasum -a 256 "$OUT/VYRON.app.tar.gz" | awk '{print $1}' > "$OUT/VYRON.app.tar.gz.sha256"
shasum -a 256 "$OUT/VYRON-6.1.17-arm64.dmg" | awk '{print $1}' > "$OUT/VYRON-6.1.17-arm64.dmg.sha256"
git rev-parse HEAD > "$OUT/source-head.txt"
cat > "$OUT/RELEASE-NOTES.md" <<'NOTES'
VYRON 6.1.17 — first macOS ARM64 prerelease signed with the rotated Tauri updater key.
New installs can use the existing GitHub endpoint for future new-key updates.
IMPORTANT: installed VYRON 6.1.16 trusts a compromised legacy updater key and
cannot safely auto-upgrade to 6.1.17. A one-time separately authenticated
installation is required; the old key must never be reused to publish a bridge.
Release packaging does not touch local user data, SQLite, OAuth or Keychain.
No Gatekeeper acceptance/notarization is claimed.
New updater public-key SHA256:
6f95fd039839eaa94cb378a67a0205e42e449a84c978674e20c5fb5abcfdfb19
NOTES
gh release create v6.1.17 --repo ScaleUPPeisov/vyron-releases \
  --prerelease --title "VYRON 6.1.17 (new updater key)" \
  --notes-file "$OUT/RELEASE-NOTES.md" \
  "$OUT/VYRON-6.1.17-arm64.dmg" \
  "$OUT/VYRON-6.1.17-arm64.dmg.sha256" \
  "$OUT/VYRON.app.tar.gz" "$OUT/VYRON.app.tar.gz.sig" \
  "$OUT/VYRON.app.tar.gz.sha256" "$OUT/source-head.txt"
printf 'NEW_KEY_PRERELEASE_PUBLISHED=PASS\n'
printf 'STABLE_FEED_UNCHANGED=PASS\n'
printf 'EXISTING_616_IN_APP_MIGRATION=BLOCKED_PENDING_TRUSTED_TRANSITION\n'
printf 'URL=https://github.com/ScaleUPPeisov/vyron-releases/releases/tag/v6.1.17\n'
