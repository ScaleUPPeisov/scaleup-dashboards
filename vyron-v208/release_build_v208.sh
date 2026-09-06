#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-208-wrapper.sh"
python3 - "$ROOT/vyron-v207/release_build_v207.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
# Reuse the exact green 2.0.7 release gate, change only output/version and append
# the single Production shortcut patch.
s=s.replace('/tmp/vyron-release-build-207-wrapper.sh','/tmp/vyron-release-build-208-inner.sh')
s=s.replace('.vyron-v207-release','.vyron-v208-release')
needle='python3 "$ROOT/vyron-v207/apply_v207_version.py" .'
if needle not in s:
    raise SystemExit('v208 build: v207 version anchor missing')
s=s.replace(needle,needle+'\\npython3 "$ROOT/vyron-v208/apply_v208_production_future_channel_button.py" .\\npython3 "$ROOT/vyron-v208/apply_v208_version.py" .',1)
s=s.replace("assert p['version']=='2.0.7' and c['version']=='2.0.7'","assert p['version']=='2.0.8' and c['version']=='2.0.8'",1)
s=s.replace('VYRON-2.0.7-macOS-AppleSilicon.dmg','VYRON-2.0.8-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.7-source.tar.gz','VYRON-2.0.8-source.tar.gz')
s=s.replace('VYRON 2.0.7 signed build stage: PASS','VYRON 2.0.8 signed build stage: PASS')
s=s.replace("print('VYRON 2.0.7 future channels + 2.0.6 regression contracts: PASS')","print('VYRON 2.0.8 base 2.0.7 + 2.0.6 regression contracts: PASS')")
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"

# The only new product contract in 2.0.8.
python3 - "$ROOT/.vyron-v208-release" <<'PY'
from pathlib import Path
import json,sys
r=Path(sys.argv[1])
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.8' and c['version']=='2.0.8'
prod=(r/'src/ProductionOS.tsx').read_text()
assert '+ Будущий канал' in prod
assert 'const created=addChannel({name})' in prod
assert 'setChannelId(created.id)' in prod
assert 'hasChannelNameConflict(channels,name)' in prod
assert 'Создать будущий канал' in prod
assert 'Deep House France 2026' in prod
assert 'youtubeProfileId' not in prod and 'youtubeChannelId' not in prod
assert (r/'src/productionFutureChannelShortcut.test.ts').exists()
# Existing Future Channels matching remains untouched and present.
accounts=(r/'src/AccountsPage.tsx').read_text();identity=(r/'src/channelIdentity.ts').read_text()
assert 'const future=findFutureChannelMatch(state.channels,p.channelTitle)' in accounts
assert 'matches.length===1' in identity
print('VYRON 2.0.8 Production future-channel shortcut contracts: PASS')
PY
