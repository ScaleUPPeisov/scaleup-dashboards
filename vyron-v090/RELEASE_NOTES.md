# VYRON 0.9.0 — Autonomous YouTube OS

Дата релиза: 31.08.2026

## Главное

- Новый VYRON Control Center с exception-based UX.
- Основная навигация сокращена до 7 разделов: Главная, Каналы, Производство, YouTube, Аналитика, Конкуренты, Настройки.
- Новый YouTube Center: Загруженные / Метаданные / Очередь / Календарь.
- Existing Videos Manager сохраняет uploads-playlist pagination и показывает аудит синхронизации.
- Перед массовой записью создаётся локальный backup исходных title/description/tags/publishAt/privacy.
- После каждого videos.update выполняется обязательный videos.list verify. Успех показывается только после подтверждения YouTube.
- Реальный Undo отправляет backup обратно в YouTube и также проходит verify.
- Жёсткая защита записи между аккаунтами: video.channelId должен совпадать с oauthProfile.channelId.
- Thumbnail cache получил расширенный fallback и 3 попытки, UI получил явный Retry.
- Каналы и конкуренты переведены в полноширинные вертикальные карточки.
- YouTube Analytics расширена периодами, Content/Revenue/Traffic/Geography/Audience tabs и monetary permission.
- Revenue/RPM показываются только из реальных YouTube Analytics monetary данных. RPM не заменяет CPM.
- Конкуренты используют только публичные данные; private Revenue/RPM/CTR/retention конкурента не имитируются.
- Autopilot: OFF / ASSISTED / FULL.
- Accounts перенесены в Настройки → YouTube без удаления OAuth-профилей и refresh tokens.
- Производство объединяет очередь и входящие материалы, сохраняя ENDLUME workflow.
- Analytics snapshots сохраняются локально по channel/date.
- Update Center проверяет обновления на запуске, через 30 секунд и каждые 6 часов.

## Совместимость

VYRON 0.9.0 обновляет существующую 0.8.1 in-place. Идентификатор приложения и существующая миграция ChannelFlow → VYRON сохранены. Рабочие OAuth-профили, state, проекты и очереди не обнуляются.

## Ограничения, которые не маскируются

- Thumbnail Impressions / CTR отображаются только при наличии реального источника данных; CTR не вычисляется из views.
- Audience-срезы показываются только если соответствующий YouTube report реально доступен.
- Остаток YouTube API quota не возвращается Data API как прямой счётчик и не выдумывается.
- Подписанный Tauri updater публикуется только если в GitHub Actions настроен приватный signing key.
