#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-202.sh"
python3 - "$ROOT/vyron-v200/release_publish_v200.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v200-release','.vyron-v202-release').replace('v200','v202').replace('V200','V202').replace('2.0.0','2.0.2')
s=s.replace("{'1.2.0','2.0.2'}","{'2.0.1','2.0.2'}")
s=s.replace('VYRON YT PEISOV 2.0.2 — Final','VYRON YT PEISOV 2.0.2 — Studio Draft Bridge')
s=s.replace('## Publish Workspace и YouTube recovery','## Studio Draft Bridge\n- VYRON видит строки «Черновик / Draft», которые ещё не доступны обычному YouTube Data API.\n- Данные передаются из видимой YouTube Studio только локально через 127.0.0.1:19470.\n- Cookies, OAuth-токены и скрытые YouTube Studio API не читаются и не используются.\n- Обычный API sync 2.0.1 сохранён отдельно и продолжает использовать uploads playlist без search.list.\n- Черновики Studio показываются отдельным безопасным блоком и не выдаются за готовые API video resources.\n\n## Publish Workspace и YouTube recovery')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
if [ -s "$ROOT/.vyron-v202-release/release/VYRON-Studio-Draft-Bridge.zip" ]; then
  gh release upload v2.0.2 "$ROOT/.vyron-v202-release/release/VYRON-Studio-Draft-Bridge.zip" --repo ScaleUPPeisov/scaleup-dashboards --clobber
fi
