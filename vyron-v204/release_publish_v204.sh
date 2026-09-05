#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-204.sh"
python3 - "$ROOT/vyron-v200/release_publish_v200.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v200-release','.vyron-v204-release').replace('v200','v204').replace('V200','V204').replace('2.0.0','2.0.4')
s=s.replace("{'1.2.0','2.0.4'}","{'2.0.3','2.0.4'}")
s=s.replace('VYRON YT PEISOV 2.0.4 — Final','VYRON YT PEISOV 2.0.4 — Select All Stability Fix')
s=s.replace('## Publish Workspace и YouTube recovery','## Metadata Select All Stability\n- Исправлен чёрный экран после «Выбрать все здесь» при массовом выборе YouTube-видео до загрузки DOCX.\n- Schedule preview теперь корректно работает с выбранными видео, даже если для них ещё нет строк metadata.\n- Добавлен regression на 99 выбранных видео и 0 DOCX-строк.\n- Массовый выбор остаётся полностью локальной операцией и не расходует YouTube API quota.\n- OAuth discovery и browser-free YouTube workflow из 2.0.3 сохранены без изменений.\n\n## Publish Workspace и YouTube recovery')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
