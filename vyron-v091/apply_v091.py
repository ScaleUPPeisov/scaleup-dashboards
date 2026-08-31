from pathlib import Path
import base64
import json
import os
import re

ROOT = Path('.vyron-v051')
VERSION = '0.9.1'

pubkey = os.environ.get('TAURI_UPDATER_PUBLIC_KEY', '').strip()
if not pubkey:
    raise SystemExit('TAURI_UPDATER_PUBLIC_KEY is required for VYRON 0.9.1 updater bootstrap')

try:
    decoded = base64.b64decode(pubkey, validate=True).decode('utf-8')
except Exception as e:
    raise SystemExit(f'TAURI_UPDATER_PUBLIC_KEY is not a valid Tauri base64 key: {e}')
if not decoded.startswith('untrusted comment:'):
    raise SystemExit('TAURI_UPDATER_PUBLIC_KEY decoded payload is not a Tauri/minisign public key box')

# Package version and a pinned Tauri CLI release that contains the empty-password
# updater-key fix. Do not allow npm to resolve an older signer implementation.
p = ROOT / 'package.json'
d = json.loads(p.read_text())
d['version'] = VERSION
found_cli = False
for section in ('dependencies', 'devDependencies'):
    if '@tauri-apps/cli' in d.get(section, {}):
        d[section]['@tauri-apps/cli'] = '2.10.1'
        found_cli = True
if not found_cli:
    d.setdefault('devDependencies', {})['@tauri-apps/cli'] = '2.10.1'
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# NPM root package version. npm install in CI resolves the pinned CLI and keeps
# the dependency graph consistent.
p = ROOT / 'package-lock.json'
d = json.loads(p.read_text())
d['version'] = VERSION
d.setdefault('packages', {}).setdefault('', {})['version'] = VERSION
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# Tauri updater trust anchor. 0.9.1 is the one-time bootstrap build that embeds
# the real public key. Future releases MUST keep the same key unless a deliberate
# key-rotation migration is implemented.
p = ROOT / 'src-tauri/tauri.conf.json'
d = json.loads(p.read_text())
d['version'] = VERSION
d.setdefault('bundle', {})['createUpdaterArtifacts'] = True
updater = d.setdefault('plugins', {}).setdefault('updater', {})
updater['pubkey'] = pubkey
updater['endpoints'] = [
    'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json'
]
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# Rust crate version. Preserve crate name/identifier/storage compatibility.
p = ROOT / 'src-tauri/Cargo.toml'
s = p.read_text()
s, n = re.subn(r'^version = "0\.9\.0"$', f'version = "{VERSION}"', s, count=1, flags=re.M)
if n != 1:
    raise SystemExit('Cargo.toml 0.9.0 version marker missing')
p.write_text(s)

# Cargo.lock is generated metadata. Older reconstructed bases may still contain
# 0.8.1 here even after the 0.9.0 patch; update a matching local package marker
# when present, otherwise leave the lockfile to cargo check/build to reconcile.
p = ROOT / 'src-tauri/Cargo.lock'
s = p.read_text()
for crate_name in ('channelflow', 'vyron'):
    pattern = rf'(name = "{re.escape(crate_name)}"\nversion = ")(?:0\.8\.1|0\.9\.0)(")'
    s2, n = re.subn(pattern, rf'\g<1>{VERSION}\2', s, count=1)
    if n:
        s = s2
        break
p.write_text(s)

# Visible/runtime current-version fallbacks. Do not touch API/business logic.
for rel in ['src/App.tsx', 'src/api.ts', 'src/SettingsOS.tsx']:
    p = ROOT / rel
    if p.exists():
        s = p.read_text().replace('0.9.0', VERSION)
        p.write_text(s)

print('VYRON 0.9.1 signed updater bootstrap applied')
