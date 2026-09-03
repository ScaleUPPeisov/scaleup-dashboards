#!/usr/bin/env python3
from pathlib import Path
import json,re,sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
version='1.1.0'

# package.json
p=root/'package.json'
data=json.loads(p.read_text())
data['version']=version
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# Cargo.toml: only package version in [package]
p=root/'src-tauri/Cargo.toml'
s=p.read_text()
m=re.search(r'(?ms)^\[package\]\n(.*?)(?=^\[|\Z)',s)
if not m: raise SystemExit('Cargo [package] section not found')
section=m.group(0)
new_section=re.sub(r'(?m)^version\s*=\s*"[^"]+"',f'version = "{version}"',section,count=1)
if new_section==section: raise SystemExit('Cargo package version not found')
p.write_text(s[:m.start()]+new_section+s[m.end():])

# tauri.conf.json
p=root/'src-tauri/tauri.conf.json'
data=json.loads(p.read_text())
data['version']=version
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

print('VYRON version set to',version)
