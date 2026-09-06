#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-209-wrapper.sh"
python3 - "$ROOT/vyron-v208/release_build_v208.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
s=s.replace('/tmp/vyron-release-build-208-wrapper.sh','/tmp/vyron-release-build-209-outer.sh')
s=s.replace('/tmp/vyron-release-build-208-inner.sh','/tmp/vyron-release-build-209-inner.sh')
s=s.replace('.vyron-v208-release','.vyron-v209-release')
s=s.replace('/tmp/vyron-v208-release-base','/tmp/vyron-v209-release-base')
s=s.replace('/tmp/v208-release-','/tmp/v209-release-')
s=s.replace("f'/tmp/v208-release-{name}'","f'/tmp/v209-release-{name}'")
needle='python3 "$ROOT/vyron-v208/apply_v208_version.py" .'
if needle not in s: raise SystemExit('v209 build: v208 version anchor missing')
extra='\\npython3 "$ROOT/vyron-v209/apply_v209_security_hardening.py" .\\npython3 "$ROOT/vyron-v209/apply_v209_security_backup_scrub.py" .\\npython3 "$ROOT/vyron-v209/apply_v209_version.py" .'
s=s.replace(needle,needle+extra,1)
s=s.replace('2.0.8','2.0.9')
s=s.replace('VYRON-2.0.8-macOS-AppleSilicon.dmg','VYRON-2.0.9-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.8-source.tar.gz','VYRON-2.0.9-source.tar.gz')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"

python3 - "$ROOT/.vyron-v209-release" <<'PY'
from pathlib import Path
import json,sys,re
r=Path(sys.argv[1])
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.9' and c['version']=='2.0.9'

# Security-at-rest contracts.
sec=(r/'src-tauri/src/security.rs').read_text()
storage=(r/'src-tauri/src/storage.rs').read_text()
yt=(r/'src-tauri/src/youtube.rs').read_text()
cargo=(r/'src-tauri/Cargo.toml').read_text()
redact=(r/'src/securityRedaction.ts').read_text()
store=(r/'src/store.ts').read_text()
notify=(r/'src/notificationCenter.ts').read_text()
assert 'security-framework = "3.7.0"' in cargo
for token in ('set_generic_password','get_generic_password','delete_generic_password','0o600','write_private_atomic','keychain_roundtrip'):
    assert token in sec,token
for token in ('STATE_YOUTUBE_API_KEY','STATE_OPENAI_API_KEY','secure_state_for_disk','hydrate_state_secrets','set_state_secret(&mut disk,field,"")','path.with_extension("bak")'):
    assert token in storage,token
assert 'skip_serializing' in yt
for token in ('oauth.{id}.{kind}','write_profile_secrets','hydrate_profile_secrets','delete_profile_secrets','GOOGLE_CLIENT_SECRET','GOOGLE_API_KEY','write_google_secrets','hydrate_google_secrets'):
    assert token in yt,token
assert 'access_token:String' in yt and 'refresh_token:String' in yt and 'client_secret:String' in yt
assert 'redactSensitive' in redact and 'Bearer [REDACTED]' in redact and 'AIza[REDACTED]' in redact and 'sk-[REDACTED]' in redact
assert 'message:safe' in store and "from './securityRedaction'" in store
assert 'title:redactSensitive(title)' in notify and 'message:redactSensitive(message)' in notify
assert (r/'src/securityRedaction.test.ts').exists()

# Preserve the exact user-facing 2.0.8 shortcut and all previous Production/YouTube behavior.
prod=(r/'src/ProductionOS.tsx').read_text();manager=(r/'src/ProductionManager.tsx').read_text();pub=(r/'src/PublisherOS.tsx').read_text()
assert '+ Будущий канал' in prod and 'setChannelId(created.id)' in prod and 'hasChannelNameConflict(channels,name)' in prod
assert 'youtubeProfileId' not in manager and 'youtubeChannelId' not in manager
for token in ('Обложки YouTube — не менять','Video Uploads сегодня','Из файла','Каждый день','2/2','3/1','Удалить выбранные'):
    assert token in pub,token
print('VYRON 2.0.9 SECURITY + FULL 2.0.8 REGRESSION CONTRACTS: PASS')
PY
