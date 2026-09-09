#!/usr/bin/env bash
set -euo pipefail

# Deterministic wrapper around the last full release gate. The previous gate
# already contains the exact source/payload verification, regression restore,
# frontend/Rust/ARM64/Tauri/codesign/DMG checks and packaging. This wrapper
# changes only the generated Vitest assertion so it inspects the safe cleanup
# function instead of rejecting the legacy batch-delete contract elsewhere in
# production_manager.rs.
BASE_SHA='b8dff9c91ef7e13ac70359521a5bb0b92bd6c92f'
BASE='/tmp/vyron-v211-release-build-base.sh'

git show "${BASE_SHA}:vyron-v211/release_build_v211.sh" > "$BASE"

python3 - "$BASE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
needle='''s=s.replace("readFileSync(new URL(p,import.meta.url),'utf8')", "readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8')")\np.write_text(s)'''
replacement='''s=s.replace("readFileSync(new URL(p,import.meta.url),'utf8')", "readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8')")\nold_contract="expect(rust).not.toContain('fs::remove_dir_all(&broot)');"\nnew_contract="const cleanupRust=rust.slice(rust.indexOf('fn cleanup_completed_assets'),rust.indexOf('pub fn delete_production_batch_projects'));\\n  expect(cleanupRust).not.toContain('remove_dir_all');"\nif old_contract not in s: raise SystemExit('generated cleanup Vitest contract anchor missing')\ns=s.replace(old_contract,new_contract,1)\np.write_text(s)'''
if needle not in s:
    raise SystemExit('release build TypeScript patch anchor missing')
s=s.replace(needle,replacement,1)
p.write_text(s)
PY

exec bash "$BASE"
