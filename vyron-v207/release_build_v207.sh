#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-207-wrapper.sh"
python3 - "$ROOT/vyron-v205/release_build_v205.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
# Keep the complete proven 2.0.5 -> 2.0.6 chain, but isolate all temporary and
# output paths for the 2.0.7 candidate.
s=s.replace('/tmp/vyron-release-build-205.sh','/tmp/vyron-release-build-207-inner.sh')
s=s.replace('.vyron-v205-release','.vyron-v207-release').replace('/tmp/vyron-v205-release-base','/tmp/vyron-v207-release-base')
s=s.replace('/tmp/v205-release-','/tmp/v207-release-')
s=s.replace("f'/tmp/v205-release-{name}'","f'/tmp/v207-release-{name}'")
needle='python3 "$ROOT/vyron-v205/apply_v205_version.py" .'
if needle not in s:
    raise SystemExit('v207 build: v205 version anchor missing')
extra='\\npython3 "$ROOT/vyron-v206/apply_v206_publisher_flow.py" .\\npython3 "$ROOT/vyron-v206/apply_v206_ready_video_delete.py" .\\npython3 "$ROOT/vyron-v206/apply_v206_release_blockers_fix.py" .\\npython3 "$ROOT/vyron-v206/apply_v206_version.py" .\\npython3 "$ROOT/vyron-v207/apply_v207_future_channels.py" .\\npython3 "$ROOT/vyron-v207/apply_v207_future_channel_semantics.py" .\\npython3 "$ROOT/vyron-v207/apply_v207_version.py" .'
s=s.replace(needle,needle+extra,1)
s=s.replace('2.0.5','2.0.7')
s=s.replace('VYRON-2.0.5-macOS-AppleSilicon.dmg','VYRON-2.0.7-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.5-source.tar.gz','VYRON-2.0.7-source.tar.gz')
s=s.replace('VYRON 2.0.5 signed build stage: PASS','VYRON 2.0.7 signed build stage: PASS')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"

# 2.0.7-specific post-build contracts. These checks are local and use no
# YouTube API quota.
python3 - "$ROOT/.vyron-v207-release" <<'PY'
from pathlib import Path
import json,sys
r=Path(sys.argv[1])
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.7' and c['version']=='2.0.7'

# Preserve all signed 2.0.6 publisher contracts.
pub=(r/'src/PublisherOS.tsx').read_text();state=(r/'src/publishWorkspaceState.ts').read_text();sched=(r/'src/publisherSchedule.ts').read_text();yt=(r/'src-tauri/src/youtube.rs').read_text();rem=(r/'src/publishRemoval.ts').read_text();local=(r/'src-tauri/src/local_delete.rs').read_text();lib=(r/'src-tauri/src/lib.rs').read_text();api=(r/'src/api.ts').read_text()
assert 'Обложки YouTube — не менять' in pub and 'thumbnails.set: 0 запросов' in pub
assert "const thumbnailsEnabled=draft.thumbs.length>0" in pub and "const thumb=selectedThumbnail(j)" in pub
assert 'Video Uploads сегодня' in pub and "youtubeQuotaBucketUsage('videoUploads')" in pub
assert 'Применить локально' not in pub and 'автоматически' in pub.lower()
for token in ('Из файла','Каждый день','2/2','3/1','Начальная дата','Красноярск'):
    assert token in pub, token
assert "j.title,j.description,j.tags,publishAt" in pub
assert "PUBLISH_AT_REQUIRED" in pub and "preflightBlocked=!selected.length||!profileId||!quotaPlan.affordable||missingSchedule>0" in pub
assert "'В ОЧЕРЕДИ'" in pub
assert "scheduleMode:PublishScheduleMode" in state and "scheduleMode:'file'" in state
assert "timeZone:'Asia/Krasnoyarsk'" in sched and "T${time}:00+07:00" in sched
assert (r/'src/publisherSchedule.test.ts').exists()
assert (r/'src/publishRemoval.test.ts').exists() and '40-video batch' in (r/'src/publishRemoval.test.ts').read_text()
assert 'Удалить выбранные' in pub and 'Убрать только из VYRON' in pub and 'Удалить из VYRON и с диска' in pub
assert 'YouTube API: 0' in pub and 'trashLocalFile' in pub
assert "invoke<{trashed:boolean;missing:boolean}>('trash_local_file'" in api
assert 'trash::delete(&p)' in local and 'remove_dir_all' not in local and 'youtube' not in local.lower()
assert 'local_delete::trash_local_file' in lib and 'trash = "5"' in (r/'src-tauri/Cargo.toml').read_text()
assert 'youtube' not in rem.lower()
assert '"snippet":{"title":title' in yt and '"description":description' in yt and '"tags":tags' in yt
assert 'status["publishAt"]' in yt and 'part=snippet,status' in yt
assert 'youtube_resume_upload' in yt

# Future-channel architecture and UI.
identity=(r/'src/channelIdentity.ts').read_text();accounts=(r/'src/AccountsPage.tsx').read_text();channels=(r/'src/ChannelsOS.tsx').read_text();production=(r/'src/ProductionManager.tsx').read_text();dash=(r/'src/DashboardOS.tsx').read_text();intel=(r/'src/youtubeIntelligence.ts').read_text();auto=(r/'src/youtubeAutopilot.ts').read_text();settings=(r/'src/SettingsOS.tsx').read_text()
assert "normalize('NFKC')" in identity and 'findFutureChannelMatch' in identity and 'matches.length===1' in identity
assert 'youtubeChannelId===p.channelId||x.youtubeProfileId===p.id' in accounts
assert "const future=findFutureChannelMatch(state.channels,p.channelTitle)" in accounts
assert "mode:'future'" in accounts and "mode:'created'" in accounts
assert 'name:p.channelTitle||exact.name' not in accounts
assert '+ Будущий канал' in channels and 'Создать будущий канал' in channels and 'БУДУЩИЙ • YouTube не подключён' in channels
assert 'hasChannelNameConflict' in channels and "setPage(isFutureChannel(c)?'accounts':'youtube')" in channels
assert "if(!isFutureChannel(c)){if(!c.youtubeProfileId)n-=25;if(!c.analytics)n-=15}" in channels
assert 'youtubeProfileId' not in production and 'youtubeChannelId' not in production
assert '!isFutureChannel(c)&&!c.youtubeProfileId' in dash and '!isFutureChannel(c)&&settings.autoUploadYoutube' in dash
assert 'name:ps.title||channel.name' not in intel
assert 'if(!s.autoUploadYoutube||!s.youtubePublishSafeMode||!channel.youtubeProfileId||!channel.safeDailyUploadLimit)return' in auto
if 'const missing=channels.filter' in settings: assert 'c.enabled&&!isFutureChannel(c)&&(!c.youtubeProfileId||!c.safeDailyUploadLimit)' in settings
assert (r/'src/channelIdentity.test.ts').exists() and (r/'src/futureChannelFlow.test.ts').exists() and (r/'src/futureChannelSemantics.test.ts').exists()
print('VYRON 2.0.7 future channels + 2.0.6 regression contracts: PASS')
PY
