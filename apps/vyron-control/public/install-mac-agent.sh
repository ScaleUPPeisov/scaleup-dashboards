#!/usr/bin/env bash
set -euo pipefail

WORKER_URL='https://vyron-control.endlume-peisov-3ee6109f.workers.dev'
BRANCH='release/vyron-control-production'
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
OLD_SHA=''
if [[ -d "$SOURCE_DIR/.git" ]]; then
  [[ "$(git -C "$SOURCE_DIR" remote get-url origin)" == "$REPOSITORY" ]] ||
    fail 'Источник Mac Bridge изменён: обновление остановлено.'
  [[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] ||
    fail 'В клоне Mac Bridge есть локальные изменения. Автоматически перезаписывать нельзя.'
  OLD_SHA="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
  printf 'Проверяю новую версию Mac Bridge без изменения установленной...\n'
  if [[ "$(git -C "$SOURCE_DIR" rev-parse --is-shallow-repository)" == "true" ]]; then
    GIT_TERMINAL_PROMPT=0 git -C "$SOURCE_DIR" fetch --unshallow --no-tags origin "$BRANCH"
  else
    GIT_TERMINAL_PROMPT=0 git -C "$SOURCE_DIR" fetch --no-tags origin "$BRANCH"
  fi
elif [[ -e "$SOURCE_DIR" ]]; then
  fail "Путь $SOURCE_DIR уже существует и не является клоном Mac Bridge. Ничего не удалено."
else
  printf 'Загружаю изолированный исходный код Mac Bridge...\n'
  GIT_TERMINAL_PROMPT=0 git clone --no-tags --branch "$BRANCH" "$REPOSITORY" "$SOURCE_DIR"
fi
NEXT_SHA="$(git -C "$SOURCE_DIR" rev-parse FETCH_HEAD 2>/dev/null ||
            git -C "$SOURCE_DIR" rev-parse HEAD)"
[[ "$NEXT_SHA" =~ ^[a-f0-9]{40}$ ]] || fail 'Неверный Git SHA для Mac Bridge.'
if [[ -n "$OLD_SHA" ]]; then
  git -C "$SOURCE_DIR" merge-base --is-ancestor "$OLD_SHA" "$NEXT_SHA" ||
    fail 'Обновление Mac Bridge не является fast-forward: установленная версия сохранена.'
  DIFF_FILES="$(git -C "$SOURCE_DIR" diff --name-only "$OLD_SHA" "$NEXT_SHA")"
  while IFS= read -r changed; do
    [[ -z "$changed" ]] && continue
    case "$changed" in
      apps/vyron-control/*|.github/workflows/vyron-control-*.yml|.github/workflows/vyron-control-*.yaml) ;;
      *) fail 'Новая версия затрагивает файлы вне изолированного Mac Bridge. Отказано.' ;;
    esac
  done <<< "$DIFF_FILES"
fi

# Verify the exact GitHub-signed release SHA and all required successful
# push-triggered CI workflows BEFORE resetting tracked files or installing npm.
RELEASE_SHA="$NEXT_SHA" node --input-type=module <<'NODE'
const sha=process.env.RELEASE_SHA;
const root='https://api.github.com/repos/ScaleUPPeisov/scaleup-dashboards/';
const headers={'Accept':'application/vnd.github+json','User-Agent':'vyron-verified-mac-installer'};
const request=async path=>{
  const response=await fetch(root+path,{headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('GitHub verification unavailable (HTTP '+response.status+')');
  return response.json();
};
const [commit,runs]=await Promise.all([
  request('commits/'+sha),
  request('actions/runs?branch=release%2Fvyron-control-production&per_page=100')
]);
if(commit.sha!==sha||commit.commit?.verification?.verified!==true||
   commit.commit.verification.reason!=='valid')
  throw new Error('Unsigned or unverifiable Git commit; refusing installation');
const expected=['VYRON CONTROL isolated tests','VYRON Privacy Gate','VYRON CONTROL Security Gate'];
const good=new Set((runs.workflow_runs||[]).filter(run=>
  run.head_sha===sha&&run.head_branch==='release/vyron-control-production'&&
  run.event==='push'&&run.status==='completed'&&run.conclusion==='success'
).map(run=>run.name));
for(const name of expected)
  if(!good.has(name))throw new Error('Missing successful release CI: '+name);
console.log('Проверены подпись GitHub, точный Git SHA и три release CI проверки.');
NODE

# The signed target is now trusted; no other application directories are touched.
git -C "$SOURCE_DIR" reset --hard "$NEXT_SHA"
cd "$SOURCE_DIR/apps/vyron-control"
printf 'Устанавливаю проверенные зависимости Mac Bridge...\n'
if ! npm ci --omit=dev --ignore-scripts --no-audit --no-fund; then
  if [[ -n "$OLD_SHA" ]]; then
    git -C "$SOURCE_DIR" reset --hard "$OLD_SHA"
  fi
  fail 'Установка npm зависимостей не удалась. Исходники Mac Bridge восстановлены.'
fi

# Reinstall without copy-pasting secrets when a previous private, owner-only
# agent config already exists. Never display or upload that stored agent token.
AGENT_TOKEN=''
if [[ -f "$AGENT_HOME/config.json" ]]; then
  AGENT_TOKEN="$(AGENT_CONFIG_FILE="$AGENT_HOME/config.json" AGENT_EXPECTED_URL="$WORKER_URL" node --input-type=module <<'NODE'
import {readFile,stat} from 'node:fs/promises';
const file=process.env.AGENT_CONFIG_FILE;
const metadata=await stat(file);
if((metadata.mode&0o077)!==0)throw Error('Existing agent configuration has unsafe permissions');
const config=JSON.parse(await readFile(file,'utf8'));
if(config.url!==process.env.AGENT_EXPECTED_URL||
   typeof config.token!=='string'||config.token.length<32)
  throw Error('Existing agent token configuration is invalid');
process.stdout.write(config.token);
NODE
)"
  printf 'Использую существующий приватный ключ Mac Bridge (значение не показывается).\n'
else
  printf '\nКлюч агента доступен в панели VYRON CONTROL.\n'
  printf 'Вернись в браузер, нажми «Скопировать ключ агента» и вставь его ниже.\n'
  read -r -s -p 'Ключ агента (ввод скрыт): ' AGENT_TOKEN </dev/tty
  printf '\n' >/dev/tty
fi
if (( ${#AGENT_TOKEN} < 32 )); then
  fail 'Ключ короче 32 символов. Установка остановлена.'
fi

printf 'Устанавливаю отдельный LaunchAgent...\n'
VYRON_CONTROL_URL="$WORKER_URL" \
VYRON_AGENT_TOKEN="$AGENT_TOKEN" \
VYRON_DEVICE_ID='macbook_m1' \
npm run agent:install
unset AGENT_TOKEN

printf '\nГотово: проверенный Mac Bridge установлен и будет подключаться при входе в macOS.\n'
printf 'Он не меняет VYRON.app, ENDLUME.app или Google OAuth в Keychain.\n'
printf 'Только реальный Mac сможет отправить heartbeat и статусы заданий.\n'
