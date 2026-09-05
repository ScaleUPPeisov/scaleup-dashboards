#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-205.sh"
python3 - "$ROOT/vyron-v201/release_build_v201.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
s=s.replace('.vyron-v201-release','.vyron-v205-release').replace('/tmp/vyron-v201-release-base','/tmp/vyron-v205-release-base')
for name in ('id','product','pub','endpoints'):
    s=s.replace(f'/tmp/v201-release-{name}',f'/tmp/v205-release-{name}')
anchor='python3 "$ROOT/vyron-v201/apply_v201_version.py" .'
assert anchor in s
s=s.replace(anchor,anchor+'\npython3 "$ROOT/vyron-v202/apply_v202_studio_draft_bridge.py" .\npython3 "$ROOT/vyron-v202/apply_v202_version.py" .\npython3 "$ROOT/vyron-v203/apply_v203_oauth_discovery.py" .\npython3 "$ROOT/vyron-v203/apply_v203_version.py" .\npython3 "$ROOT/vyron-v204/apply_v204_selectall_crash_fix.py" .\npython3 "$ROOT/vyron-v204/apply_v204_version.py" .\npython3 "$ROOT/vyron-v205/apply_v205_updater_discovery.py" .\npython3 "$ROOT/vyron-v205/apply_v205_version.py" .',1)
s=s.replace("assert p['version']=='2.0.1' and c['version']=='2.0.1'","assert p['version']=='2.0.5' and c['version']=='2.0.5'")
old_endpoint="assert json.dumps(c['plugins']['updater']['endpoints'])==Path('/tmp/v205-release-endpoints').read_text()"
new_endpoint="assert c['plugins']['updater']['endpoints']==['https://github.com/ScaleUPPeisov/scaleup-dashboards/releases/latest/download/latest.json','https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json']"
assert old_endpoint in s
s=s.replace(old_endpoint,new_endpoint,1)
s=s.replace("assert 'playlistItems.list' in rust and 'nextPageToken' in rust and 'videos.list' in rust\nassert 'search.list' not in rust","assert 'playlistItems' in rust and 'nextPageToken' in rust and '/videos' in rust\nassert 'snippet,contentDetails,status' in rust\nassert '(\"forMine\",\"true\")' in rust and 'oauth-forMine' in rust and 'draftCandidate' in rust\nassert 'STUDIO DRAFT BRIDGE' not in meta and 'studioDraftsStartBridge' not in meta\ny=Path('src/youtubeExisting.ts').read_text()\nassert 'meta:(ImportedMetadata|undefined)[]=[]' in y and 'meta.find(x=>x?.number===i+1)' in y\nassert Path('src/youtubeExisting.selectAll.test.ts').exists()\napi=Path('src/api.ts').read_text();policy=Path('src/updaterPolicy.ts').read_text()\nassert 'check(UPDATER_CHECK_OPTIONS)' in api and \"from './updaterPolicy'\" in api\nassert \"'Cache-Control':'no-cache, no-store, max-age=0'\" in policy and \"'Pragma':'no-cache'\" in policy\nassert Path('src/updaterPolicy.test.ts').exists()")
s=s.replace("= '2.0.1'","= '2.0.5'")
s=s.replace("'2.0.1'","'2.0.5'")
s=s.replace('VYRON-2.0.1-macOS-AppleSilicon.dmg','VYRON-2.0.5-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.1-source.tar.gz','VYRON-2.0.5-source.tar.gz')
s=s.replace('VYRON 2.0.1 signed build stage: PASS','VYRON 2.0.5 signed build stage: PASS')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
