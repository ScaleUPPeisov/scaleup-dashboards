#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-201.sh"
python3 - "$ROOT/vyron-v200/release_publish_v200.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v200-release','.vyron-v201-release').replace('v200','v201').replace('V200','V201').replace('2.0.0','2.0.1')
s=s.replace("{'1.2.0','2.0.1'}","{'2.0.0','2.0.1'}")
s=s.replace('VYRON YT PEISOV 2.0.1 — Final','VYRON YT PEISOV 2.0.1 — YouTube Sync Hotfix')
s=s.replace('## Publish Workspace и YouTube recovery','## YouTube Sync Hotfix\n- Исправлен quota rollover и зависший provider guard.\n- Ручная «Синхронизировать» при доступном локальном ledger делает один реальный API probe.\n- Старые reservations предыдущего Pacific-day не блокируют новое окно.\n- PRIVATE остаётся на дешёвом uploads playlist pipeline без search.list.\n\n## Publish Workspace и YouTube recovery')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
