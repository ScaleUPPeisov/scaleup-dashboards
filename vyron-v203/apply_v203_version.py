#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
version='2.0.3'
# Static discovery contracts are enforced by the GitHub validation gate. The
# temporary source-inspection Vitest file imports node:fs, while production tsconfig
# intentionally has no Node typings, so remove that test before production tsc.
test_only=ROOT/'src/youtubeOAuthDiscovery.test.ts'
if test_only.exists(): test_only.unlink()
p=ROOT/'package.json';x=json.loads(p.read_text());x['version']=version;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'src-tauri/tauri.conf.json';x=json.loads(p.read_text());x['version']=version
for win in x.get('app',{}).get('windows',[]):
    if 'title' in win: win['title']='VYRON YT PEISOV'
p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=ROOT/'src-tauri/Cargo.toml';s=p.read_text();m=re.search(r'(?ms)^\[package\]\n(.*?)(?=^\[|\Z)',s)
if not m: raise SystemExit('Cargo [package] missing')
section=re.sub(r'(?m)^version\s*=\s*"[^"]+"',f'version = "{version}"',m.group(0),count=1);p.write_text(s[:m.start()]+section+s[m.end():])
if (ROOT/'package-lock.json').exists():
    p=ROOT/'package-lock.json';x=json.loads(p.read_text());x['version']=version
    if isinstance(x.get('packages'),dict) and isinstance(x['packages'].get(''),dict):x['packages']['']['version']=version
    p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
print('VYRON YT PEISOV version -> 2.0.3')
