#!/usr/bin/env python3
from pathlib import Path
import subprocess,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src/PublisherOS.tsx';s=p.read_text()
old='// compatibility regression contract: appendErrorHistory(h.title,message,h.detail)'
new='/* compatibility regression contract: appendErrorHistory(h.title,message,h.detail) */'
if old not in s: raise SystemExit('line-comment compatibility marker missing')
p.write_text(s.replace(old,new,1))
subprocess.run([sys.executable,str(Path(__file__).with_name('apply_v2111_gatefix3.py')),str(root)],check=True)
print('VYRON 2.1.1 gatefix2 applied')
