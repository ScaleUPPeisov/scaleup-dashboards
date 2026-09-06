#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-209.sh"
python3 - "$ROOT/vyron-v206/release_publish_v206.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v206-release','.vyron-v209-release').replace('v206','v209').replace('V206','V209').replace('2.0.6','2.0.9')
s=s.replace("{'2.0.5','2.0.9'}","{'2.0.8','2.0.9'}")
s=s.replace('VYRON YT PEISOV 2.0.9 — Publisher Scheduling & Quota','VYRON YT PEISOV 2.0.9 — Security Hardening')
anchor='## Publisher 2.0.9'
notes='''## Security Hardening 2.0.9\n- YouTube OAuth access/refresh tokens and client secrets are stored in macOS Keychain instead of plaintext JSON.\n- Google client secret, YouTube API key and app API-key settings are moved to Keychain and rehydrated only in runtime memory.\n- Legacy plaintext credential files migrate safely: JSON is sanitized only after successful Keychain writes; migration failure never silently destroys the old working credentials.\n- Sensitive state/config files and backups use owner-only permissions on macOS/Unix; legacy state backups are sanitized after successful migration.\n- Logs and notifications redact bearer tokens, OAuth secrets, Google API-key patterns and OpenAI-style secret patterns.\n- Production, Downloads, ENDLUME, Publisher, Future Channels and the 2.0.8 Production shortcut are unchanged and protected by the full regression gate.\n\n'''
if anchor in s:
    s=s.replace(anchor,notes+anchor,1)
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
