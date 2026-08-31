# VYRON 0.8.0 — Autonomous YouTube Core

- Новый Account Center: одна глобальная Google Cloud конфигурация для всех YouTube-аккаунтов.
- Импорт Desktop OAuth `credentials.json` один раз; следующие каналы подключаются через Google OAuth без повторного ввода Client ID/Secret.
- После OAuth VYRON автоматически получает YouTube Channel ID/название и создаёт или привязывает канал.
- Token Health: проверка OAuth-профилей и автоматический refresh access token через сохранённый refresh token.
- Desktop OAuth поддерживает Client Secret, если он есть, и PKCE без Secret, если Google-клиент его не выдаёт.
- Thumbnail Engine: локальный cache, maxres/sd/hq/mq/default fallback, retry и remote fallback.
- Existing Videos синхронизирует дополнительные данные `contentDetails/statistics`.
- Массовые изменения YouTube получили Undo для последней применённой пачки.
- Competitor Radar умеет автоматически искать похожие каналы без ручной вставки ссылок; discovery ограничен суточным интервалом.
- Фоновый YouTube Intelligence автоматически добавляет новых конкурентов и затем обновляет их snapshots.
- Плавные переходы страниц и лёгкие transform/opacity-анимации без тяжёлых blur-анимаций.
- Существующие Metadata Hub, Analytics, Publisher, Autopilot, OAuth и ENDLUME pipeline сохранены.

## Не заявляется как полностью завершённое в 0.8.0

- YouTube API audit/compliance для снятия ограничений новых API-upload проектов остаётся внешним требованием Google.
- Полное продолжение resumable upload после перезапуска приложения требует отдельного durable upload-session store.
- Quota Dashboard и виртуализация 1000+ карточек запланированы как следующий слой после проверки 0.8 на реальных аккаунтах.
