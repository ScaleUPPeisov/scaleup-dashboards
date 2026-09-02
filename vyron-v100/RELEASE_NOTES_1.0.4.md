# VYRON 1.0.4 — Production Manager

Дата релиза: 02.09.2026

## Главное

Добавлен локальный **Production Manager / Автосборка** для массовой подготовки проектов VYRON → ENDLUME без расхода YouTube Data API.

## Что добавлено

- активная import-сессия выбранного канала для сбора изображений из Downloads;
- собственная безопасная нумерация изображений;
- отдельная музыкальная библиотека для каждого канала;
- переиндексация добавленных и удалённых треков;
- точное количество проектов и песен на проект;
- режимы распределения музыки: Равномерно / Случайно / Без повторов в партии;
- защита от полностью одинаковых музыкальных последовательностей через fingerprint;
- повторное использование песен при нехватке библиотеки с изменением порядка и комбинаций;
- изображения по умолчанию не повторяются; повтор разрешается только явным действием пользователя;
- плоская структура каждого проекта: 1 изображение + все аудиофайлы без вложенных папок;
- `batch.json`, `status.json`, checkpoint и история batches;
- восстановление незавершённой подготовки после перезапуска;
- idempotent build request и защита от дублирования при повторном запуске;
- локальная проверка batch перед передачей в ENDLUME;
- кнопка «Открыть в ENDLUME» с прямой передачей manifest без автоматизации мыши;
- локальный status bridge для возврата Rendering / Completed / Error в VYRON.

## ENDLUME

Для прямого batch-import используется совместимый ENDLUME Studio 1.0.0-alpha.8.6 или новее. ENDLUME получает готовые проекты, после чего пользователь выбирает существующие эффекты и параметры рендера один раз для всей партии. Ручной режим ENDLUME сохраняется.

## Zero Quota

Production Manager выполняет локально и с **0 YouTube API units**:

- сбор изображений;
- индексирование музыки;
- создание папок;
- распределение треков;
- fingerprint/shuffle;
- batch/checkpoint/history;
- передачу в ENDLUME;
- чтение локального статуса ENDLUME;
- восстановление незавершённой партии.

Production Manager не добавляет фоновых YouTube API вызовов и не запускает YouTube sync.

## Сохранено без изменений

- OAuth и подключённые каналы;
- существующие YouTube commands;
- Rust YouTube writer;
- Metadata Hub / title / description / tags;
- Existing Videos cache;
- Channel Runway и Zero Quota architecture;
- Quota Meter;
- Dashboard и Command Center;
- существующая логика публикации;
- secure token storage;
- Tauri identifier;
- updater endpoint и updater public key;
- backup / Undo и ownership validation.

## Acceptance

Release gate проверяет сценарии 30 изображений + 500 песен → 30 проектов × 15 треков = 450 назначений, нехватку изображений, повторы музыки при библиотеке 100 треков, уникальность последовательностей, idempotency, resume незавершённой партии, persistence, Zero Quota, TypeScript, Rust и ARM64 сборку.
