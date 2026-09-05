#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-203.sh"
python3 - "$ROOT/vyron-v200/release_publish_v200.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v200-release','.vyron-v203-release').replace('v200','v203').replace('V200','V203').replace('2.0.0','2.0.3')
s=s.replace("{'1.2.0','2.0.3'}","{'2.0.2','2.0.3'}")
s=s.replace('VYRON YT PEISOV 2.0.3 — Final','VYRON YT PEISOV 2.0.3 — OAuth Video Discovery')
s=s.replace('## Publish Workspace и YouTube recovery','## YouTube OAuth Video Discovery\n- Никаких расширений Chrome/Brave/Safari для поиска видео не требуется.\n- Единственный источник авторизации — уже подключённый OAuth-профиль YouTube в VYRON.\n- Полная история берётся из uploads playlist с пагинацией; playlistItems запрашиваются с snippet/contentDetails/status.\n- Свежие owned-видео дополнительно проверяются одним официальным forMine-запросом.\n- Если videos.list ещё не раскрывает owned resource, VYRON больше не выбрасывает найденную строку uploads playlist из списка.\n- Браузерный Studio Draft Bridge из основного Metadata workflow удалён.\n\n## Publish Workspace и YouTube recovery')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
