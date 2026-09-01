# VYRON 1.0.0 — Zero Quota Production

Дата релиза: 01.09.2026

## Главное

VYRON 1.0 переводит приложение на строгую модель: вся подготовка выполняется локально, а YouTube API используется только внутри рабочей зоны **YouTube** и только после явного действия пользователя.

## Что изменено

- Удалены фоновые YouTube Intelligence polling/timers со startup и глобального App.
- Autopilot больше физически не может загружать видео в YouTube в фоне. Он обслуживает только локальный Production + ENDLUME pipeline.
- «Каналы», «Аналитика», «Конкуренты» и «Настройки» переведены на локальный cache/state без YouTube Data API.
- Проверка OAuth health, ручное обновление аналитики и поиск/обновление конкурентов централизованы внутри **YouTube**.
- Убрана автоматическая синхронизация Existing Videos при входе/возврате на вкладку.
- Убрана автоматическая загрузка YouTube-видео в Metadata при входе/возврате.
- Existing Videos сохраняет рабочую таблицу, выбранные видео, baseline, последнюю синхронизацию и Undo state локально.
- Persistent Metadata Draft сохранён: SEO pack, parsed records, mapping, порядок, фильтры, расписание и выбранные видео переживают переходы и перезапуск.
- Добавлен persistent Production Workspace по каждому каналу: проект, цель, материалы, рендер, SEO, проверка, расписание, готовность к YouTube.
- Production остаётся полностью без YouTube API.
- Quota Meter отображается только в YouTube.
- Сохранён рабочий Rust YouTube writer: skip identical update, batch list до 50 videoId, combined metadata+schedule update, ownership validation, backup/undo и verification.
- Существующие OAuth/token storage, Tauri identifier, updater endpoint/public key, ENDLUME integration и persistent storage не переименовывались и не заменялись.
- Добавлен premium UI polish с лёгкими transform/opacity анимациями без тяжёлых blur/shadow animations.

## Совместимость

VYRON 1.0.0 обновляется поверх 0.9.9 через существующий подписанный Tauri updater. Старый AppState остаётся совместимым; потенциально опасные legacy-флаги background YouTube refresh/autoupload при hydrate принудительно мигрируются в `false`.

## Zero Regression Gates

Релиз публикуется только после PASS: frontend unit tests, TypeScript production build, Rust tests, cargo check ARM64, Zero Quota contract checks, Tauri ARM64 build, app codesign verification, DMG verification и updater signature artifact verification.
