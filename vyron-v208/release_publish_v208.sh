#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-208.sh"
python3 - "$ROOT/vyron-v206/release_publish_v206.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
# Publish the exact v206/v207-compatible release machinery as 2.0.8. The only
# product note added is the Production shortcut.
s=src.replace('.vyron-v206-release','.vyron-v208-release').replace('v206','v208').replace('V206','V208').replace('2.0.6','2.0.8')
s=s.replace("{'2.0.5','2.0.8'}","{'2.0.7','2.0.8'}")
s=s.replace('VYRON YT PEISOV 2.0.8 — Publisher Scheduling & Quota','VYRON YT PEISOV 2.0.8 — Production Future Channel Shortcut')
anchor='## Publisher 2.0.8'
notes='''## Production shortcut 2.0.8\n- В «Производство → Материалы» рядом с выбором канала добавлена кнопка `+ Будущий канал`.\n- Название можно ввести вручную; новый локальный канал сразу становится текущим в Production.\n- Существующая логика Future Channels 2.0.7, будущая OAuth-привязка по названию, Downloads, Publisher и ENDLUME не изменялись.\n\n'''
if anchor in s:
    s=s.replace(anchor,notes+anchor,1)
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
