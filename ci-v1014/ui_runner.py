#!/usr/bin/env python3
from pathlib import Path

source_path=Path('../vyron-v1014/apply_v1014_ui.py')
src=source_path.read_text()
old='s=pat.sub(block,s,count=1)'
if src.count(old)!=1:
    raise SystemExit(f'VYRON 1.0.14 UI runner: expected one regex replacement call, found {src.count(old)}')
src=src.replace(old,'s=pat.sub(lambda _m:block,s,count=1)',1)
ns={'__name__':'__main__','__file__':str(source_path)}
exec(compile(src,str(source_path),'exec'),ns,ns)
