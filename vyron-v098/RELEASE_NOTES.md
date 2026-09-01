# VYRON 0.9.8 — Quota Guard & Persistent Metadata Session

## Исправлено

- `quotaExceeded` больше не размножается десятками ошибок по разделам VYRON.
- После первого `quotaExceeded` VYRON ставит YouTube Data API на глобальную паузу и не продолжает сжигать запросы до следующего дневного сброса quota.
- Добавлен глобальный Quota Guard banner и ручная кнопка «Проверить снова» после увеличения/сброса quota.
- Фоновая аналитика и competitor refresh не продолжают долбить YouTube Data API, пока quota guard активен.
- Массовая обработка останавливается на первом `quotaExceeded`, сохраняет незавершённую часть и не превращает остаток пачки в десятки красных ошибок.
- Metadata Hub автоматически сохраняет по каждому каналу: распознанный SEO pack, вставленный текст, выбранные ролики, порядок, фильтр, первую дату, интервал и историю последних операций.
- При переходе в другой раздел и возврате рабочая сессия Metadata Hub восстанавливается автоматически без повторной загрузки DOCX.
- При quota pause Metadata Hub оставляет выбранными только незавершённые ролики и сохраняет соответствующие им строки SEO pack для продолжения после сброса quota.
- Успешный `videos.update` расписания считается фактом принятия YouTube; задержка контрольного `videos.list` больше не создаёт ложную ошибку, если дата уже реально появилась в YouTube Studio.

## Экономия YouTube quota

- Перед записью VYRON сравнивает текущие данные с желаемыми и не делает `videos.update`, если видео уже совпадает.
- Если одновременно меняются metadata и schedule, VYRON использует один `videos.update?part=snippet,status` вместо двух отдельных дорогих write-запросов.
- При повторном запуске уже успешно обработанная половина пачки не переписывается заново.

## Безопасность

- OAuth profiles, refresh tokens, channel bindings, backups, ENDLUME settings и существующий state не сбрасываются.
- Bundle identifier и подписанный Tauri updater сохранены.
- Добавлены regression tests на `quotaExceeded` detection и существующие KRAT schedule / YouTube write tests остаются обязательными release gates.
