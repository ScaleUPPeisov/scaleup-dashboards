#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
SRC="$ROOT/vyron-v110/release_v110.sh"
TMP='/tmp/vyron-release-v110-v2.sh'
python3 - "$SRC" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
old1="'src-tauri/src/system.rs','src-tauri/src/youtube_intelligence.rs','src-tauri/src/ai.rs',"
new1="'src-tauri/src/system.rs','src-tauri/src/ai.rs',"
old2=" 'src/App.tsx','src/DashboardOS.tsx'"
new2=" 'src/DashboardOS.tsx'"
if src.count(old1)!=1: raise SystemExit('youtube_intelligence protected-scope anchor mismatch')
if src.count(old2)!=1: raise SystemExit('App protected-scope anchor mismatch')
src=src.replace(old1,new1,1).replace(old2,new2,1)
Path(sys.argv[2]).write_text(src)
PY
chmod +x "$TMP"
exec bash "$TMP"
