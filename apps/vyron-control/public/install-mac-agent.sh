#!/usr/bin/env bash
set -euo pipefail

WORKER_URL='https://vyron-control.endlume-peisov-3ee6109f.workers.dev'
BRANCH='feature/vyron-control-cloud-mvp-20261113'
REPOSITORY='https://github.com/ScaleUPPeisov/scaleup-dashboards.git'
AGENT_HOME="$HOME/.vyron-control-agent"
SOURCE_DIR="$AGENT_HOME/source"

fail() {
  printf 'VYRON CONTROL Mac Bridge: %s\n' "$1" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail 'Этот установщик предназначен только для macOS.'
command -v git >/dev/null 2>&1 || fail 'Не найден Git. Установи Xcode Command Line Tools и повтори.'
command -v node >/dev/null 2>&1 || fail 'Не найден Node.js 22+. Установи Node.js 22 или новее и повтори.'
command -v npm >/dev/null 2>&1 || fail 'Не найден npm.'
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 22 ]] || fail "Нужен Node.js 22+. Сейчас установлен $(node --version)."

mkdir -p "$AGENT_HOME"
chmod 700 "$AGENT_HOME"

if [[ -d "$SOURCE_DIR/.git" ]]; then
  printf 'Обновляю изолированный исходный код Mac Bridge...\n'
  git -C "$SOURCE_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$SOURCE_DIR" checkout -f "$BRANCH"
  git -C "$SOURCE_DIR" reset --hard FETCH_HEAD
elif [[ -e "$SOURCE_DIR" ]]; then
  fail "Путь $SOURCE_DIR уже существует и не является клоном Mac Bridge. Ничего не удалено."
else
  printf 'Загружаю изолированный исходный код Mac Bridge...\n'
  GIT_TERMINAL_PROMPT=0 git clone --depth 1 --branch "$BRANCH" "$REPOSITORY" "$SOURCE_DIR"
fi

printf '\nКлюч агента доступен в панели VYRON CONTROL.\n'
printf 'Вернись в браузер, нажми «Скопировать ключ агента» и вставь его ниже.\n'
read -r -s -p 'Ключ агента (ввод скрыт): ' AGENT_TOKEN </dev/tty
printf '\n' >/dev/tty
[[ "\${#AGENT_TOKEN}" -ge 32 ]] || fail 'Ключ короче 32 символов. Установка остановлена.'

cd "$SOURCE_DIR/apps/vyron-control"
printf 'Устанавливаю зависимости Mac Bridge...\n'
npm install --omit=dev --no-audit --no-fund

printf 'Устанавливаю отдельный LaunchAgent...\n'
VYRON_CONTROL_URL="$WORKER_URL" \
VYRON_AGENT_TOKEN="$AGENT_TOKEN" \
VYRON_DEVICE_ID='macbook_m1' \
npm run agent:install
unset AGENT_TOKEN

printf '\nГотово. Mac Bridge запущен и будет подключаться при входе в macOS.\n'
printf 'Он передаёт только разрешённые счётчики/события и не читает Keychain.\n'
printf 'Панель обновится автоматически в течение 15–45 секунд.\n'
