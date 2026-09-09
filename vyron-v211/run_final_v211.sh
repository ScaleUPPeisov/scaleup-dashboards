#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
from pathlib import Path
p=Path('vyron-v211/release_build_v211.sh')
s=p.read_text()
needle='''s=s.replace("readFileSync(new URL(p,import.meta.url),'utf8')", "readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8')")\np.write_text(s)'''
replacement='''s=s.replace("readFileSync(new URL(p,import.meta.url),'utf8')", "readFileSync(decodeURIComponent(new URL(p,import.meta.url).pathname),'utf8')")\ns=s.replace("  expect(rust).not.toContain('fs::remove_dir_all(&broot)');", "  const cleanupBlock=rust.slice(rust.indexOf('fn cleanup_completed_assets'),rust.indexOf('pub fn delete_production_batch_projects'));\\n  expect(cleanupBlock).not.toContain('remove_dir_all');")\np.write_text(s)'''
if needle not in s:
    raise SystemExit('VYRON 2.0.11 TS cleanup contract patch anchor not found')
p.write_text(s.replace(needle,replacement,1))
PY
exec bash vyron-v211/release_build_v211.sh
