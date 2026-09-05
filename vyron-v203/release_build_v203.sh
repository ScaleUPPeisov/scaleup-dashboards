#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-203.sh"
python3 - "$ROOT/vyron-v201/release_build_v201.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
s=s.replace('.vyron-v201-release','.vyron-v203-release').replace('/tmp/vyron-v201-release-base','/tmp/vyron-v203-release-base')
for name in ('id','product','pub','endpoints'):
    s=s.replace(f'/tmp/v201-release-{name}',f'/tmp/v203-release-{name}')
anchor='python3 "$ROOT/vyron-v201/apply_v201_version.py" .'
assert anchor in s
s=s.replace(anchor,anchor+'\npython3 "$ROOT/vyron-v202/apply_v202_studio_draft_bridge.py" .\npython3 "$ROOT/vyron-v202/apply_v202_version.py" .\npython3 "$ROOT/vyron-v203/apply_v203_oauth_discovery.py" .\npython3 "$ROOT/vyron-v203/apply_v203_version.py" .',1)
s=s.replace("assert p['version']=='2.0.1' and c['version']=='2.0.1'","assert p['version']=='2.0.3' and c['version']=='2.0.3'")
s=s.replace("assert 'playlistItems.list' in rust and 'nextPageToken' in rust and 'videos.list' in rust\nassert 'search.list' not in rust","assert 'playlistItems' in rust and 'nextPageToken' in rust and '/videos' in rust\nassert 'snippet,contentDetails,status' in rust\nassert '(\"forMine\",\"true\")' in rust and 'oauth-forMine' in rust and 'draftCandidate' in rust\nassert 'STUDIO DRAFT BRIDGE' not in meta and 'studioDraftsStartBridge' not in meta")
s=s.replace("= '2.0.1'","= '2.0.3'")
s=s.replace("'2.0.1'","'2.0.3'")
s=s.replace('VYRON-2.0.1-macOS-AppleSilicon.dmg','VYRON-2.0.3-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.1-source.tar.gz','VYRON-2.0.3-source.tar.gz')
s=s.replace('VYRON 2.0.1 signed build stage: PASS','VYRON 2.0.3 signed build stage: PASS')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
