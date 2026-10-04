#!/bin/zsh
set -euo pipefail

CURRENT_APP="$1"
WHISPER_BIN="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$HOME/Library/Logs/ReelsFactory"
LOG="$LOG_DIR/update.log"
mkdir -p "$LOG_DIR"
exec >>"$LOG" 2>&1

echo "===== ReelsFactory self-update $(date) ====="
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:$PATH"

notify(){ /usr/bin/osascript -e "display notification \"$1\" with title \"ReelsFactory\"" >/dev/null 2>&1 || true; }
fail(){
  echo "ERROR: $1"
  notify "Обновление не установлено. Старая версия сохранена."
  exit 1
}
trap 'fail "Ошибка на строке $LINENO"' ERR

for tool in node npm cargo swiftc; do
  command -v "$tool" >/dev/null 2>&1 || fail "Не найден $tool"
done

cd "$ROOT"
mkdir -p src-tauri/binaries

# Whisper уже находится внутри установленного ReelsFactory: переиспользуем проверенный бинарник.
cp -f "$WHISPER_BIN" src-tauri/binaries/whisper-cli-aarch64-apple-darwin
chmod +x src-tauri/binaries/whisper-cli-aarch64-apple-darwin

# Native video engine компилируется из новой версии исходника.
swiftc native/VideoProcessor.swift -O -target arm64-apple-macos13.0 \
  -o src-tauri/binaries/reelsfactory-video-aarch64-apple-darwin \
  -framework AVFoundation -framework AppKit -framework QuartzCore -framework CoreMedia
chmod +x src-tauri/binaries/reelsfactory-video-aarch64-apple-darwin

npm install --no-audit --no-fund
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin
npx tauri build --target aarch64-apple-darwin --bundles app

NEW_APP="$(find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -maxdepth 1 -type d -name 'ReelsFactory.app' -print -quit)"
[[ -d "$NEW_APP" ]] || fail "Новая ReelsFactory.app не собрана"

/usr/bin/codesign --force --deep --sign - "$NEW_APP" || true
BACKUP="${CURRENT_APP%.app}.previous.app"
rm -rf "$BACKUP"

if [[ -d "$CURRENT_APP" ]]; then mv "$CURRENT_APP" "$BACKUP"; fi
if ! /usr/bin/ditto "$NEW_APP" "$CURRENT_APP"; then
  rm -rf "$CURRENT_APP"
  [[ -d "$BACKUP" ]] && mv "$BACKUP" "$CURRENT_APP"
  fail "Не удалось заменить приложение"
fi

/usr/bin/xattr -dr com.apple.quarantine "$CURRENT_APP" 2>/dev/null || true
/usr/bin/open "$CURRENT_APP"
notify "Обновление установлено. Новая версия запущена."
echo "SUCCESS: $CURRENT_APP"
