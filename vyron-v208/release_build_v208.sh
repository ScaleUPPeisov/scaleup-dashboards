#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-build-208-wrapper.sh"
python3 - "$ROOT/vyron-v205/release_build_v205.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
# Exact proven v205 build chain, extended through v206/v207 and ONE v208 patch.
s=s.replace('/tmp/vyron-release-build-205.sh','/tmp/vyron-release-build-208-inner.sh')
s=s.replace('.vyron-v205-release','.vyron-v208-release').replace('/tmp/vyron-v205-release-base','/tmp/vyron-v208-release-base')
s=s.replace('/tmp/v205-release-','/tmp/v208-release-')
s=s.replace("f'/tmp/v205-release-{name}'","f'/tmp/v208-release-{name}'")
needle='python3 "$ROOT/vyron-v205/apply_v205_version.py" .'
if needle not in s:
    raise SystemExit('v208 build: v205 version anchor missing')
extra='\\npython3 "$ROOT/vyron-v206/apply_v206_publisher_flow.py" .\\npython3 "$ROOT/vyron-v206/apply_v206_ready_video_delete.py" .\\npython3 "$ROOT/vyron-v206/apply_v206_release_blockers_fix.py" .\\npython3 "$ROOT/vyron-v206/apply_v206_version.py" .\\npython3 "$ROOT/vyron-v207/apply_v207_future_channels.py" .\\npython3 "$ROOT/vyron-v207/apply_v207_future_channel_semantics.py" .\\npython3 "$ROOT/vyron-v207/apply_v207_version.py" .\\npython3 "$ROOT/vyron-v208/apply_v208_production_future_channel_button.py" .\\npython3 "$ROOT/vyron-v208/apply_v208_version.py" .'
s=s.replace(needle,needle+extra,1)
s=s.replace('2.0.5','2.0.8')
s=s.replace('VYRON-2.0.5-macOS-AppleSilicon.dmg','VYRON-2.0.8-macOS-AppleSilicon.dmg')
s=s.replace('VYRON-2.0.5-source.tar.gz','VYRON-2.0.8-source.tar.gz')
s=s.replace('VYRON 2.0.5 signed build stage: PASS','VYRON 2.0.8 signed build stage: PASS')
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"

# Full 2.0.7 regression contracts + the single 2.0.8 shortcut contract.
python3 - "$ROOT/.vyron-v208-release" <<'PY'
from pathlib import Path
import json,sys
r=Path(sys.argv[1])
p=json.loads((r/'package.json').read_text());c=json.loads((r/'src-tauri/tauri.conf.json').read_text())
assert p['version']=='2.0.8' and c['version']=='2.0.8'

# Preserve signed 2.0.6 Publisher/YouTube/local-delete contracts.
pub=(r/'src/PublisherOS.tsx').read_text();state=(r/'src/publishWorkspaceState.ts').read_text();sched=(r/'src/publisherSchedule.ts').read_text();yt=(r/'src-tauri/src/youtube.rs').read_text();rem=(r/'src/publishRemoval.ts').read_text();local=(r/'src-tauri/src/local_delete.rs').read_text();lib=(r/'src-tauri/src/lib.rs').read_text();api=(r/'src/api.ts').read_text()
assert 'Обложки YouTube — не менять' in pub and 'thumbnails.set: 0 запросов' in pub
assert "const thumbnailsEnabled=draft.thumbs.length>0" in pub and "const thumb=selectedThumbnail(j)" in pub
assert 'Video Uploads сегодня' in pub and "youtubeQuotaBucketUsage('videoUploads')" in pub
assert 'Применить локально' not in pub and 'автоматически' in pub.lower()
for token in ('Из файла','Каждый день','2/2','3/1','Начальная дата','Красноярск'):
    assert token in pub,token
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

# Preserve all 2.0.7 Future Channels semantics.
identity=(r/'src/channelIdentity.ts').read_text();accounts=(r/'src/AccountsPage.tsx').read_text();channels=(r/'src/ChannelsOS.tsx').read_text();manager=(r/'src/ProductionManager.tsx').read_text();dash=(r/'src/DashboardOS.tsx').read_text();intel=(r/'src/youtubeIntelligence.ts').read_text();auto=(r/'src/youtubeAutopilot.ts').read_text();settings=(r/'src/SettingsOS.tsx').read_text()
assert "normalize('NFKC')" in identity and 'findFutureChannelMatch' in identity and 'matches.length===1' in identity
assert 'youtubeChannelId===p.channelId||x.youtubeProfileId===p.id' in accounts
assert "const future=findFutureChannelMatch(state.channels,p.channelTitle)" in accounts
assert "mode:'future'" in accounts and "mode:'created'" in accounts
assert 'name:p.channelTitle||exact.name' not in accounts
assert '+ Будущий канал' in channels and 'Создать будущий канал' in channels and 'БУДУЩИЙ • YouTube не подключён' in channels
assert 'hasChannelNameConflict' in channels and "setPage('youtube')}>{isFutureChannel(c)?'Подключить YouTube позже':'Открыть YouTube'}" in channels
assert "setPage(isFutureChannel(c)?'accounts':'youtube')" not in channels
assert "if(!isFutureChannel(c)){if(!c.youtubeProfileId)n-=25;if(!c.analytics)n-=15}" in channels
assert 'youtubeProfileId' not in manager and 'youtubeChannelId' not in manager
assert '!isFutureChannel(c)&&!c.youtubeProfileId' in dash and '!isFutureChannel(c)&&settings.autoUploadYoutube' in dash
assert 'name:ps.title||channel.name' not in intel
assert 'if(!s.autoUploadYoutube||!s.youtubePublishSafeMode||!channel.youtubeProfileId||!channel.safeDailyUploadLimit)return' in auto
if 'const missing=channels.filter' in settings: assert 'c.enabled&&!isFutureChannel(c)&&(!c.youtubeProfileId||!c.safeDailyUploadLimit)' in settings
assert (r/'src/channelIdentity.test.ts').exists() and (r/'src/futureChannelFlow.test.ts').exists() and (r/'src/futureChannelSemantics.test.ts').exists()

# ONLY new 2.0.8 product contract: Production -> Materials shortcut.
prod=(r/'src/ProductionOS.tsx').read_text()
mat=prod[prod.index("tab==='materials'"):prod.index('<ProductionManager view="materials"/>')]
assert '+ Будущий канал' in mat and '+ Импортировать изображения' in mat
assert mat.index('+ Будущий канал') < mat.index('+ Импортировать изображения')
assert 'const created=addChannel({name})' in prod
assert 'setChannelId(created.id)' in prod
assert 'hasChannelNameConflict(channels,name)' in prod
assert 'Создать будущий канал' in prod and 'Deep House France 2026' in prod
assert 'youtubeProfileId' not in prod and 'youtubeChannelId' not in prod
assert (r/'src/productionFutureChannelShortcut.test.ts').exists()
print('VYRON 2.0.8 full regression + one Production shortcut: PASS')
PY
