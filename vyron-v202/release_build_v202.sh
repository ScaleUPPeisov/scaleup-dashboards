#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-202.sh"
python3 - "$ROOT/vyron-v201/release_build_v201.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
s=s.replace('.vyron-v201-release','.vyron-v202-release').replace('/tmp/vyron-v201-release-base','/tmp/vyron-v202-release-base')
for name in ('id','product','pub','endpoints'):
    s=s.replace(f'/tmp/v201-release-{name}',f'/tmp/v202-release-{name}')
anchor='python3 "$ROOT/vyron-v201/apply_v201_version.py" .'
assert anchor in s
s=s.replace(anchor,anchor+'\npython3 "$ROOT/vyron-v202/apply_v202_studio_draft_bridge.py" .\npython3 "$ROOT/vyron-v202/apply_v202_version.py" .',1)
s=s.replace("assert p['version']=='2.0.1' and c['version']=='2.0.1'","assert p['version']=='2.0.2' and c['version']=='2.0.2'")
s=s.replace("assert 'search.list' not in rust","assert 'search.list' not in rust\nassert Path('src-tauri/src/studio_drafts.rs').exists() and '127.0.0.1' in Path('src-tauri/src/studio_drafts.rs').read_text()\nassert 'Черновики Studio' in meta and Path('studio-draft-bridge/manifest.json').exists()")
s=s.replace("= '2.0.1'","= '2.0.2'")
s=s.replace("'2.0.1'","'2.0.2'")
s=s.replace('VYRON-2.0.1-macOS-AppleSilicon.dmg','VYRON-2.0.2-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.1-source.tar.gz','VYRON-2.0.2-source.tar.gz')
s=s.replace('VYRON 2.0.1 signed build stage: PASS','VYRON 2.0.2 signed build stage: PASS')
needle="shasum -a 256 release/VYRON-2.0.2-source.tar.gz > release/SOURCE_SHA256.txt"
assert needle in s
s=s.replace(needle,needle+"\ncd studio-draft-bridge && zip -qr ../release/VYRON-Studio-Draft-Bridge.zip . && cd ..",1)
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
