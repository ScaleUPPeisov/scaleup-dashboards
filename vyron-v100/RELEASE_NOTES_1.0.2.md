# VYRON 1.0.2 — Channel Runway

Дата релиза: 02.09.2026

## Главное

Добавлен локальный модуль **Channel Runway / План каналов** для контроля запаса запланированных публикаций по всем подключённым YouTube-каналам.

## Что добавлено

- По каждому каналу показывается последняя подтверждённая дата Scheduled-видео.
- Показывается остаток запаса в днях.
- Рассчитывается дата, с которой стоит готовить следующую пачку.
- Каналы сортируются по срочности и риску.
- Добавлена общая сводка по сети каналов: запас, критические каналы, очередь производства, рекомендуемый темп и квотный план.
- Ежедневный пересчёт выполняется локально в 06:00 `Asia/Krasnoyarsk`.
- Если VYRON был закрыт в 06:00, пропущенный локальный пересчёт выполняется при следующем запуске.
- Данные сохраняются в отдельном versioned storage key `vyron:channel-runway:v1`.
- Для расчёта Scheduled учитываются только подтверждённые YouTube-видео со статусом `private` и будущим `publishAt`.
- Пустой или неподтверждённый локальный cache отображается как `Нет данных`, а не как закончившееся расписание.
- Несохранённые локальные черновые даты Existing Videos не используются как подтверждённое расписание.

## Zero Quota

Channel Runway не расходует YouTube API при:

- ежедневном пересчёте;
- открытии модуля;
- запуске приложения;
- сортировке каналов;
- расчёте runway, приоритетов, очереди и квотного плана.

YouTube API вызывается только после явного нажатия пользователем кнопки **«ОБНОВИТЬ РАСПИСАНИЕ»** внутри YouTube.

## Сохранено без изменений

- Metadata Hub;
- Existing Videos;
- Production Workspace;
- Quota Meter и локальное время сброса квоты;
- OAuth и secure token storage;
- updater endpoint/public key;
- Tauri identifier;
- ENDLUME integration;
- Autopilot;
- Rust YouTube writer;
- backup/Undo;
- ownership validation.

## Проверки

Перед публикацией 1.0.2 прошёл полный ARM64 release gate: frontend tests, TypeScript production build, Zero Quota + Channel Runway local-only contracts, Rust tests, cargo check ARM64, private-key leak scan, Tauri ARM64 app/DMG build, updater signature verification, codesign verification и DMG verification.
