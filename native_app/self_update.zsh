#!/bin/zsh
set -euo pipefail

CURRENT_APP="$1"
SOURCE_URL="$2"
WORK="${TMPDIR:-/tmp}/reelsfactory-native-self-update"
ZIP="$WORK/source.zip"
SRC="$WORK/src"
LOG="$HOME/Library/Logs/ReelsFactory/update.log"
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

notify(){ /usr/bin/osascript -e "display notification \"$1\" with title \"ReelsFactory\"" >/dev/null 2>&1 || true; }
fail(){ echo "ERROR: $1"; notify "Обновление не установлено. Старая версия сохранена."; exit 1; }
trap 'fail "Ошибка на строке $LINENO"' ERR

sleep 1
rm -rf "$WORK"
mkdir -p "$SRC"
/usr/bin/curl -L --fail --retry 3 "$SOURCE_URL" -o "$ZIP"
/usr/bin/ditto -x -k "$ZIP" "$SRC"
PROJECT="$(find "$SRC" -mindepth 1 -maxdepth 1 -type d -print -quit)"
[[ -f "$PROJECT/native_app/ReelsFactoryApp.swift" ]] || fail "Нет native_app/ReelsFactoryApp.swift"

NEW_APP="$WORK/ReelsFactory.app"
mkdir -p "$NEW_APP/Contents/MacOS" "$NEW_APP/Contents/Resources"

/usr/bin/xcrun swiftc "$PROJECT/native_app/ReelsFactoryApp.swift" -O -target arm64-apple-macos13.0 \
  -o "$NEW_APP/Contents/MacOS/ReelsFactory" \
  -framework AppKit -framework WebKit -framework AVFoundation -framework QuartzCore -framework CoreMedia
chmod +x "$NEW_APP/Contents/MacOS/ReelsFactory"

cp "$PROJECT/native_app/index.html" "$NEW_APP/Contents/Resources/index.html"
cp "$PROJECT/native_app/self_update.zsh" "$NEW_APP/Contents/Resources/self_update.zsh"
chmod +x "$NEW_APP/Contents/Resources/self_update.zsh"
cp "$CURRENT_APP/Contents/Resources/whisper-cli" "$NEW_APP/Contents/Resources/whisper-cli"
chmod +x "$NEW_APP/Contents/Resources/whisper-cli"

VERSION="$(grep -E '^let appVersion = ' "$PROJECT/native_app/ReelsFactoryApp.swift" | sed -E 's/.*\"([^\"]+)\".*/\1/')"
cat > "$NEW_APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>ReelsFactory</string>
<key>CFBundleExecutable</key><string>ReelsFactory</string>
<key>CFBundleIdentifier</key><string>com.scaleup.reelsfactory</string>
<key>CFBundleName</key><string>ReelsFactory</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${VERSION}</string>
<key>CFBundleVersion</key><string>${VERSION}</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
printf 'APPL????' > "$NEW_APP/Contents/PkgInfo"
/usr/bin/codesign --force --deep --sign - "$NEW_APP" >/dev/null 2>&1 || true

BACKUP="${CURRENT_APP%.app}.previous.app"
rm -rf "$BACKUP"
[[ -d "$CURRENT_APP" ]] && mv "$CURRENT_APP" "$BACKUP"
if ! /usr/bin/ditto "$NEW_APP" "$CURRENT_APP"; then
  rm -rf "$CURRENT_APP"
  [[ -d "$BACKUP" ]] && mv "$BACKUP" "$CURRENT_APP"
  fail "Не удалось заменить приложение"
fi
/usr/bin/xattr -dr com.apple.quarantine "$CURRENT_APP" >/dev/null 2>&1 || true
/usr/bin/open "$CURRENT_APP"
notify "ReelsFactory обновлён до ${VERSION}."
echo "SUCCESS ${VERSION}"
