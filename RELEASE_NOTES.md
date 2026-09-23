# VYRON 3.2.0 — Crash Recovery & Development Journey

## Новое
- Durable write-ahead recovery journal для Production хранится вне VYRON.app в Application Support.
- При незавершённой локальной сборке VYRON показывает Recovery Flow с 30-секундным countdown и безопасно продолжает с последнего подтверждённого checkpoint.
- Project output создаётся через .vyron-partial, flush/sync и atomic rename; повторный recovery не дублирует уже завершённые проекты.
- Для внешних томов сохраняется Volume UUID. Если TOSHIBA EXT отсутствует или подключён другой физический диск, автоматическая запись блокируется до повторной проверки.
- Добавлен ручной вход «Восстановить незавершённую работу» после отказа от автоматического восстановления.
- Task Center и Activity History получили состояния и события recovery.

## История VYRON
- Каноническая история восстановлена по GitHub Releases, существующей structured history и release metadata от VYRON 0.5.0 (31.08.2026).
- Версии сгруппированы по дням в компактной timeline.
- Добавлены поиск, фильтры, раскрываемые категории и свернутые технические сведения.
- Owner Preview build numbers не отображаются как отдельные продуктовые релизы.

## UX
- Sidebar использует единый row/icon-slot contract и ровно один active item для внутренних маршрутов.
- Удалён пустой Settings-блок «Последние уведомления», notification runtime сохранён.
- Удалена информационная карточка ENDLUME «Целевой рендер»; путь ENDLUME, выбор и открытие сохранены.
- Сохраняется глобальный anti-overflow contract для русских labels.

## Safety
- Recovery journal не содержит OAuth secrets, refresh/access tokens, credentials.json или vault keys.
- Crash recovery не выполняет YouTube videos.insert и не меняет OAuth architecture.
- Remote upload после restart продолжает использовать существующую resumable-session / uploadHistory / YouTube reconciliation защиту от дублей.
- Stable updater feeds не меняются до physical acceptance владельца.
