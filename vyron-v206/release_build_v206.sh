#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-206-wrapper.sh"
python3 - "$ROOT/vyron-v205/release_build_v205.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
# Keep the complete proven 2.0.5 chain, but isolate all temporary/output paths.
s=s.replace('/tmp/vyron-release-build-205.sh','/tmp/vyron-release-build-206-inner.sh')
s=s.replace('.vyron-v205-release','.vyron-v206-release').replace('/tmp/vyron-v205-release-base','/tmp/vyron-v206-release-base')
s=s.replace('/tmp/v205-release-','/tmp/v206-release-')
# The v205 generator itself contains a dynamic f-string for those temp paths.
s=s.replace("f'/tmp/v205-release-{name}'","f'/tmp/v206-release-{name}'")
# Append only the 2.0.6 publisher patch after the already-proven 2.0.5 chain.
needle='python3 "$ROOT/vyron-v205/apply_v205_version.py" .'
if needle not in s:
    raise SystemExit('v206 build: v205 version anchor missing')
s=s.replace(needle,needle+'\\npython3 "$ROOT/vyron-v206/apply_v206_publisher_flow.py" .\\npython3 "$ROOT/vyron-v206/apply_v206_version.py" .',1)
s=s.replace('2.0.5','2.0.6')
s=s.replace('VYRON-2.0.5-macOS-AppleSilicon.dmg','VYRON-2.0.6-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.5-source.tar.gz','VYRON-2.0.6-source.tar.gz')
s=s.replace('VYRON 2.0.5 signed build stage: PASS','VYRON 2.0.6 signed build stage: PASS')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"

# 2.0.6-specific post-build contracts: no API calls are made here.
python3 - "$ROOT/.vyron-v206-release" <<'PY'
from pathlib import Path
import json,sys
r=Path(sys.argv[1])
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.6' and c['version']=='2.0.6'
pub=(r/'src/PublisherOS.tsx').read_text();state=(r/'src/publishWorkspaceState.ts').read_text();sched=(r/'src/publisherSchedule.ts').read_text();yt=(r/'src-tauri/src/youtube.rs').read_text()
assert 'Обложки YouTube — не менять' in pub and 'thumbnails.set: 0 запросов' in pub
assert "const thumbnailsEnabled=draft.thumbs.length>0" in pub and "const thumb=selectedThumbnail(j)" in pub
assert 'Video Uploads сегодня' in pub and "youtubeQuotaBucketUsage('videoUploads')" in pub
assert 'Применить локально' not in pub and 'автоматически' in pub.lower()
for token in ('Из файла','Каждый день','2/2','3/1','Начальная дата','Красноярск'):
    assert token in pub, token
assert "j.title,j.description,j.tags,publishAt" in pub
assert "'В ОЧЕРЕДИ'" in pub
assert "scheduleMode:PublishScheduleMode" in state and "scheduleMode:'file'" in state
assert "timeZone:'Asia/Krasnoyarsk'" in sched and "T${time}:00+07:00" in sched
assert (r/'src/publisherSchedule.test.ts').exists()
assert '"snippet":{"title":title' in yt and '"description":description' in yt and '"tags":tags' in yt
assert 'status["publishAt"]' in yt and 'part=snippet,status' in yt
assert 'youtube_resume_upload' in yt
print('VYRON 2.0.6 publisher-specific signed build contracts: PASS')
PY
