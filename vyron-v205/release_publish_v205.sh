#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-205.sh"
python3 - "$ROOT/vyron-v200/release_publish_v200.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v200-release','.vyron-v205-release').replace('v200','v205').replace('V200','V205').replace('2.0.0','2.0.5')
s=s.replace("{'1.2.0','2.0.5'}","{'2.0.4','2.0.5'}")
s=s.replace('VYRON YT PEISOV 2.0.5 — Final','VYRON YT PEISOV 2.0.5 — Updater Discovery Fix')
s=s.replace('## Publish Workspace и YouTube recovery','## Надёжное обнаружение обновлений\n- Исправлен случай, когда установленная 2.0.3 показывала «актуальная версия 2.0.3», хотя новый релиз уже опубликован.\n- Каждый updater check теперь отправляет `Cache-Control: no-cache, no-store, max-age=0` и `Pragma: no-cache`.\n- Добавлен основной endpoint через GitHub latest release asset и сохранён raw GitHub endpoint как резервный.\n- Добавлен regression-контракт на anti-cache updater policy.\n- Исправление «Выбрать все здесь» из 2.0.4 сохранено без изменений.\n\n## Publish Workspace и YouTube recovery')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
