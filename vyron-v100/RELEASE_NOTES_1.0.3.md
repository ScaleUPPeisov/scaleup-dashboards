# VYRON 1.0.3 — Command Center

Дата релиза: 02.09.2026

## Главное

Добавлен локальный **VYRON Command Center** для ежедневного управления сетью YouTube-каналов без фонового расхода YouTube Data API.

## Что добавлено

- Attention Center: показывает, какие каналы требуют внимания прямо сейчас.
- Production Forecast: рассчитывает, какие каналы входят в производственное окно, сколько готово к YouTube и где не хватает SEO.
- Network Plan: единая очередь каналов по runway и локальной готовности Production.
- Smart Batch Builder: создаёт локальную пачку `VIDEO_001...VIDEO_N` и даты публикации после последнего подтверждённого Scheduled-видео с учётом cadence канала.
- Отображается текущая локальная пропускная способность по сохранённому Quota Planner.
- Рассчитывается рекомендуемый темп производства по всей сети каналов.
- Smart Batch Builder хранит планы в отдельном versioned storage key `vyron:command-center:v1`.

## Zero Quota

Command Center использует только локальные данные:

- `Channel Runway`;
- локальные Production jobs;
- локальный Quota Planner;
- локальный Command Center storage.

Command Center не импортирует `api.ts`, не вызывает YouTube API и не запускает синхронизацию при открытии, переключении вкладок, расчётах, сортировке или создании Smart Batch.

Для получения свежего Scheduled-состояния по-прежнему используется только явная ручная кнопка во вкладке `План каналов`.

## Сохранено без изменений

- Channel Runway и его 06:00 KRAT scheduler;
- Metadata Hub;
- Existing Videos;
- Production Workspace;
- Quota Meter и локальное время сброса;
- OAuth / secure token storage;
- updater endpoint / public key;
- Tauri identifier;
- ENDLUME integration;
- Autopilot;
- Rust YouTube writer;
- backup / Undo;
- ownership validation.

## Release Gate

Перед публикацией VYRON 1.0.3 должен пройти frontend tests, TypeScript production build, Command Center local-only contract, Zero Quota contract, persistence tests, Rust tests, cargo check ARM64, private-key leak scan, Tauri ARM64 build, updater signature verification, codesign verification и DMG verification.
