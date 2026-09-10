#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src-tauri/src/production_manager.rs';s=p.read_text()
start_marker='#[cfg(test)]\nmod v2111_global_project_cleanup_tests{'
end_marker='#[tauri::command]\npub fn archive_production_rendered_videos'
if start_marker not in s: raise SystemExit('global cleanup test module anchor missing')
start=s.index(start_marker)
end=s.index(end_marker,start)
block=s[start:end].rstrip()
s=s[:start]+s[end:]
cleanup_start=s.index('fn cleanup_completed_assets')
archive_start=s.index(end_marker,cleanup_start)
region=s[cleanup_start:archive_start]
if 'remove_dir_all' in region: raise SystemExit('production cleanup region still contains remove_dir_all')
s=s.rstrip()+'\n\n'+block+'\n'
p.write_text(s)
print('VYRON 2.1.1 cleanup test placement fixed; production safety slice remains recursive-delete free')
