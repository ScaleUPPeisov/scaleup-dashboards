#!/usr/bin/env python3
from pathlib import Path
import json, re, sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
VERSION = '2.1.2'

def load_json(rel):
    return json.loads((root / rel).read_text())

def save_json(rel, data):
    (root / rel).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

pkg = load_json('package.json')
pkg['version'] = VERSION
save_json('package.json', pkg)

lock = root / 'package-lock.json'
if lock.exists():
    data = json.loads(lock.read_text())
    data['version'] = VERSION
    if isinstance(data.get('packages'), dict) and isinstance(data['packages'].get(''), dict):
        data['packages']['']['version'] = VERSION
    lock.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

conf = load_json('src-tauri/tauri.conf.json')
conf['version'] = VERSION
save_json('src-tauri/tauri.conf.json', conf)

cargo = root / 'src-tauri/Cargo.toml'
s = cargo.read_text()
s, n = re.subn(r'(?m)^version\s*=\s*"2\.1\.1"\s*$', 'version = "2.1.2"', s, count=1)
if n != 1:
    raise SystemExit('Cargo.toml 2.1.1 version anchor missing')
cargo.write_text(s)

# Keep visible About/version labels aligned without touching test names or migration identifiers.
for p in (root / 'src').rglob('*'):
    if not p.is_file() or p.suffix.lower() not in {'.ts', '.tsx', '.js', '.jsx', '.html'}:
        continue
    text = p.read_text()
    new = text
    for old, repl in [
        ('VYRON v2.1.1', 'VYRON v2.1.2'),
        ('VYRON 2.1.1', 'VYRON 2.1.2'),
        ('Версия 2.1.1', 'Версия 2.1.2'),
        ('version 2.1.1', 'version 2.1.2'),
    ]:
        new = new.replace(old, repl)
    if new != text:
        p.write_text(new)

print('VYRON 2.1.2 version manifests applied')
