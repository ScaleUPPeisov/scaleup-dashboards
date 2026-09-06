#!/usr/bin/env bash
set -euo pipefail
ROOT="$PWD"
TMP="/tmp/vyron-release-publish-210.sh"
python3 - "$ROOT/vyron-v200/release_publish_v200.sh" "$TMP" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text()
s=src.replace('.vyron-v200-release','.vyron-v210-release').replace('v200','v210').replace('V200','V210').replace('2.0.0','2.0.10')
s=s.replace("{'1.2.0','2.0.10'}","{'2.0.9','2.0.10'}")
s=s.replace('VYRON YT PEISOV 2.0.10 — Final','VYRON YT PEISOV 2.0.10 — Release History & Walkthroughs')
anchor='## Publish Workspace и YouTube recovery'
notes='''## История обновлений 2.0.10\n- В «Настройки → Обновления» добавлена полная история VYRON с реальными датами релизов от 1.0.0 до 2.0.10.\n- Каждая версия раскрывается по нажатию в стиле ENDLUME и показывает подробный список «что сделано — от и до».\n- Для каждой версии добавлен встроенный офлайн видео-обзор/пошаговый walkthrough с прогрессом, паузой, назад/дальше и автопроигрыванием.\n- Видео-обзор не использует YouTube API, внешний видеохостинг, OAuth или дополнительные разрешения.\n- Существующий signed updater, кнопки проверки/установки обновления и updater endpoints не переделывались.\n\n## Совместимость с 2.0.9\n- Security Layer с macOS Keychain, безопасной миграцией секретов, 0600 и redaction сохранён без функциональных изменений.\n- Production, Downloads, ENDLUME, Publisher, Future Channels, расписания, resumable upload и quota guards сохранены без изменений.\n- Перед релизом 2.0.10 повторно проходит полный 2.0.9 security/functional regression, затем отдельный 2.0.10 build/test/sign gate.\n\n'''
if anchor not in s:
    raise SystemExit('v210 publish notes anchor missing')
s=s.replace(anchor,notes+anchor,1)
Path(sys.argv[2]).write_text(s)
PY
bash "$TMP"
