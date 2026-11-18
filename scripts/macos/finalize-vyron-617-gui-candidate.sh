#!/usr/bin/env bash
# Finalize an independently authenticated, Developer ID signed and Apple notarized VYRON.app.
# Produces the ONE-TIME GUI drag-and-replace DMG and a freshly signed future-updater tarball.
# DO NOT publish these bytes without separate owner approval and on-device migration test.
set -Eeuo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo MACOS_REQUIRED >&2; exit 1; }
: "${VYRON_RC_APP:?VYRON_RC_APP_REQUIRED}"
: "${VYRON_RC_ARCHIVE:?VYRON_RC_ARCHIVE_REQUIRED}"
: "${VYRON_RC_PUBLIC_KEY_B64_FILE:?VYRON_RC_PUBLIC_KEY_B64_FILE_REQUIRED}"
: "${VYRON_RC_EVIDENCE_DIR:?VYRON_RC_EVIDENCE_DIR_REQUIRED}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID_REQUIRED}"
: "${NOTARY_ID:?NOTARY_ID_REQUIRED}"
: "${NOTARY_PASSWORD:?NOTARY_PASSWORD_REQUIRED}"
: "${TAURI_SIGNING_PRIVATE_KEY:?NEW_TAURI_SIGNING_PRIVATE_KEY_REQUIRED}"
: "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:=}"

APP="$VYRON_RC_APP"
ARCHIVE="$VYRON_RC_ARCHIVE"
EVIDENCE="$VYRON_RC_EVIDENCE_DIR"
[[ -d "$APP" && "$(basename "$APP")" == "VYRON.app" ]] || { echo INVALID_PRODUCTION_APP_PATH >&2; exit 1; }
[[ -s "$ARCHIVE" && -s "$ARCHIVE.sig" ]] || { echo TAURI_UPDATER_ARTIFACTS_MISSING >&2; exit 1; }
[[ "$ARCHIVE" == *'/VYRON.app.tar.gz' ]] || { echo INVALID_UPDATER_ARCHIVE_NAME >&2; exit 1; }
mkdir -p "$EVIDENCE"

test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" = studio.channelflow.desktop
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")" = 6.1.17
EXE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
lipo -archs "$APP/Contents/MacOS/$EXE" | tr ' ' '\n' | grep -Fxq arm64
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -F "TeamIdentifier=$APPLE_TEAM_ID"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=4 "$APP"

# Stapling modifies the bundle after the original Tauri archive was created. Re-archive
# the EXACT notarized .app and re-sign using the independently authenticated NEW key.
rm -f "$ARCHIVE" "$ARCHIVE.sig"
COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" -C "$(dirname "$APP")" VYRON.app
tar -tzf "$ARCHIVE" | grep -E '^VYRON.app/(Contents/Info.plist|Contents/MacOS/)' > /dev/null
npx tauri signer sign --app-version 6.1.17 "$ARCHIVE" > "$RUNNER_TEMP/vyron-617-resign-log.txt"
test -s "$ARCHIVE.sig"
openssl base64 -d -A -in "$VYRON_RC_PUBLIC_KEY_B64_FILE" -out "$RUNNER_TEMP/vyron-617-verified.pub"
openssl base64 -d -A -in "$ARCHIVE.sig" -out "$RUNNER_TEMP/vyron-617-verified.sig"
minisign -Vm "$ARCHIVE" -p "$RUNNER_TEMP/vyron-617-verified.pub" -x "$RUNNER_TEMP/vyron-617-verified.sig"
shasum -a 256 "$ARCHIVE" > "$EVIDENCE/archive-sha256.txt"
shasum -a 256 "$ARCHIVE.sig" > "$EVIDENCE/updater-signature-sha256.txt"
shasum -a 256 "$APP/Contents/MacOS/$EXE" > "$EVIDENCE/executable-sha256.txt"

# Single GUI operation on the M1 after out-of-band identity verification:
# open DMG → drag VYRON.app onto Applications → confirm Replace. No Terminal.
STAGE="$RUNNER_TEMP/vyron-617-gui-stage"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/VYRON.app"
ln -s /Applications "$STAGE/Applications"
DMG="$RUNNER_TEMP/VYRON-6.1.17-one-time-GUI.dmg"
hdiutil create -quiet -volname 'VYRON 6.1.17' -srcfolder "$STAGE" -format UDZO -ov "$DMG"
test -s "$DMG"

xcrun notarytool submit "$DMG" --apple-id "$NOTARY_ID" --password "$NOTARY_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait --output-format json > "$RUNNER_TEMP/vyron-617-dmg-notary.json"
node -e "const n=require(process.argv[1]);if(n.status!=='Accepted')throw Error('DMG_NOTARIZATION_NOT_ACCEPTED: '+n.status)" "$RUNNER_TEMP/vyron-617-dmg-notary.json"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"
shasum -a 256 "$DMG" > "$EVIDENCE/one-time-gui-dmg-sha256.txt"
printf 'gui_bootstrap=BUILT_NOT_PUBLISHED\ninstaller=VYRON-6.1.17-one-time-GUI.dmg\nbootstrap_operation=OPEN_DMG_DRAG_VYRON_APP_TO_APPLICATIONS_CONFIRM_REPLACE\nnotarized_app_archive=NEW_KEY_MINISIGN_VERIFIED\ndmg_notarization=ACCEPTED\nkeychain_oauth_migration=OWNER_TEST_NOT_DONE\nrelease=HOLD_UNTIL_OWNER_APPROVAL\n' > "$EVIDENCE/gui-bridge-status.txt"
