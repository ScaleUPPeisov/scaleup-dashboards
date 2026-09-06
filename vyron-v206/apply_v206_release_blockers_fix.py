#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def rep(path,a,b,count=1):
    p=ROOT/path;s=p.read_text()
    if a not in s: raise SystemExit(f'v206 release-blocker anchor missing {path}: {a[:180]!r}')
    p.write_text(s.replace(a,b,count))

# TypeScript: metadataSource is optional on legacy jobs, but writeJobMetadata
# requires an explicit source string. normalizeJob already treats legacy jobs as
# template metadata, so keep that same contract here.
rep('src/PublisherOS.tsx',"x?'import':j.metadataSource","x?'import':(j.metadataSource||'template')")

# ImportedMetadata requires source. Keep the test fixtures structurally valid so
# npm run build proves the same types as production.
rep('src/publishRemoval.test.ts',"const row=(n:number)=>({number:n,title:`TITLE ${n}`,description:`DESC ${n}`,tags:[`tag${n}`]});","const row=(n:number)=>({number:n,title:`TITLE ${n}`,description:`DESC ${n}`,tags:[`tag${n}`],source:'test'});")

# The production command never recursively deletes directories. The directory
# test itself can clean up its empty temporary directory with remove_dir.
rep('src-tauri/src/local_delete.rs','assert!(!r.missing||r.trashed)','assert!(r.missing&&!r.trashed)')
rep('src-tauri/src/local_delete.rs','fs::remove_dir_all(p).unwrap()','fs::remove_dir(p).unwrap()')

print('VYRON 2.0.6 release blockers fix: PASS')
