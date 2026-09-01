# VYRON 0.9.7 — YouTube Verify & KRAT Schedule Fix

## Исправлено

- Успешный `videos.update` теперь считается фактом принятия метаданных YouTube; мгновенный `videos.list` больше не может ложно пометить запись как полностью неуспешную.
- Read-after-write verification делает несколько повторных чтений с backoff.
- Title/description сравниваются после нормализации переносов строк и пробелов.
- Tags сравниваются семантически после нормализации, без зависимости от порядка массива.
- Ложный metadata verify больше не останавливает фазу расписания.
- `PUBLISH TIME: 04:00 KRAT` из SEO DOCX объединяется с датой из сетки VYRON и отправляется как RFC3339 `+07:00` (`Asia/Krasnoyarsk`).
- При scheduling VYRON сохраняет `privacyStatus=private`, как требует YouTube Data API для `status.publishAt`.
- Реальная ошибка расписания (`invalidPublishAt` и другие причины YouTube) показывается по конкретному видео.
- Добавлены regression tests на KRAT time-only scheduling и metadata normalization.

## Безопасность

- OAuth profiles, refresh tokens, channel bindings, локальное состояние, backups и ENDLUME settings не сбрасываются.
- Обновление продолжает использовать подписанный Tauri updater для Apple Silicon.
