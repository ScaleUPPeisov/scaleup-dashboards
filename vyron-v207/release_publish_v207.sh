#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-207.sh"
python3 - "$ROOT/vyron-v206/release_publish_v206.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v206-release','.vyron-v207-release').replace('v206','v207').replace('V206','V207').replace('2.0.6','2.0.7')
s=s.replace("{'2.0.5','2.0.7'}","{'2.0.6','2.0.7'}")
s=s.replace('VYRON YT PEISOV 2.0.7 — Publisher Scheduling & Quota','VYRON YT PEISOV 2.0.7 — Future Channels')
needle='## Publisher 2.0.7\n'
if needle not in s:
    raise SystemExit('v207 publish notes anchor missing')
notes='''## Future Channels 2.0.7\n- Можно создавать будущие каналы без YouTube OAuth и заранее выпускать для них изображения, музыку, VIDEO-проекты, batches и рендеры.\n- У будущего канала сразу есть стабильный локальный Channel.id; YouTube channelId/profile привязываются позже без переноса или копирования проектов.\n- При OAuth VYRON сначала ищет уже связанный YouTube ID/profile, затем ровно один будущий канал с тем же нормализованным названием, и только потом создаёт новый локальный канал.\n- Совпадение имени безопасное: Unicode NFKC, trim, сворачивание пробелов и lowercase; неоднозначные дубликаты не объединяются автоматически.\n- Будущий канал без OAuth считается нормальным Production-состоянием и не создаёт ложную ошибку Dashboard/Health.\n- YouTube Autopilot физически не публикует будущий канал до появления youtubeProfileId.\n- Локальное production-name после YouTube binding/analytics не переписывается, поэтому папки и batches не разъезжаются.\n- Автосбор изображений из ~/Downloads, включая уже лежавшие до старта файлы и macOS permission handling, включён в обязательный release regression gate.\n\n'''
s=s.replace(needle,notes+needle,1)
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
