# VYRON 0.9.8 — Metadata Session & Schedule Verification Fix

## Исправлено

- Metadata Hub теперь сохраняет рабочую сессию отдельно для каждого канала: импортированные SEO/DOCX записи, выбранные YouTube videoId, режим, сортировку, фильтр, дату старта, интервал и источник.
- При переходе в другой раздел и возврате больше не нужно заново загружать DOCX и повторно выбирать видео.
- После перезапуска приложения рабочая сессия также восстанавливается из локального хранилища.
- `videos.update(part=status)` с HTTP 2xx теперь считается фактом принятия расписания YouTube.
- Проверка `publishAt` сначала использует ответ самого YouTube на update, затем несколько `videos.list` с backoff.
- Задержка read-after-write больше не создаёт ложную красную ошибку, если расписание уже реально установлено в YouTube Studio.
- Добавлены отдельные поля `scheduleAccepted` и `scheduleVerifyPending`.
- Сравнение времени учитывает одинаковый момент времени в разных RFC3339 offset (`04:00 +07:00` = `21:00Z` предыдущего дня).

## Не затрагивается

- OAuth profiles и refresh tokens.
- Каналы и channelId bindings.
- ENDLUME settings.
- Production queue, Analytics, Competitors и Dashboard.
- Существующие backups/Undo и updater configuration.
