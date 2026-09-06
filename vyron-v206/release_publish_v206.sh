#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-206.sh"
python3 - "$ROOT/vyron-v200/release_publish_v200.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v200-release','.vyron-v206-release').replace('v200','v206').replace('V200','V206').replace('2.0.0','2.0.6')
s=s.replace("{'1.2.0','2.0.6'}","{'2.0.5','2.0.6'}")
s=s.replace('VYRON YT PEISOV 2.0.6 — Final','VYRON YT PEISOV 2.0.6 — Publisher Scheduling & Quota')
s=s.replace('## Publish Workspace и YouTube recovery','''## Publisher 2.0.6\n- Обложки по умолчанию не меняются: при отсутствии выбранных изображений `thumbnails.set` не вызывается.\n- Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического `videos.insert`.\n- DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.\n- В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных.\n- Название, описание, теги и `publishAt` отправляются в первоначальном `videos.insert`; resumable recovery сохранён.\n- Локальный статус READY_UPLOAD отображается как «В ОЧЕРЕДИ».\n\n## Publish Workspace и YouTube recovery''')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
