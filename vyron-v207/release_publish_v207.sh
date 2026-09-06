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
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
