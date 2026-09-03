# VYRON 1.0.10 — macOS Updater EXDEV Hotfix

Исправлена ошибка `Cross-device link (os error 18)` при установке обновления VYRON на macOS.

- перед `downloadAndInstall` VYRON сравнивает файловый том системного `$TMPDIR` и том, где расположен `VYRON.app`;
- если тома разные, временная папка updater создаётся рядом с VYRON.app на том же диске;
- штатная Tauri-проверка подписи, скачивание и установка сохранены;
- если VYRON запущен непосредственно с read-only DMG/неподходящего тома, вместо сырого `os error 18` показывается понятная инструкция перенести VYRON.app в Applications;
- Production Workspace, OAuth, YouTube, аналитика, очередь, Metadata Hub и настройки 1.0.9 не изменялись.

Важно: если установленная 1.0.9 уже падает с `os error 18`, один раз запусти VYRON.app из внутренней папки Applications и повтори обновление. После установки 1.0.10 последующие обновления используют cross-volume protection автоматически.
