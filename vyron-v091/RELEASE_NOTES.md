# VYRON 0.9.1 — Signed Updater Bootstrap

Дата подготовки: 31.08.2026

## Что меняется

- В приложение впервые встраивается **реальный публичный ключ Tauri Updater**.
- Включается `bundle.createUpdaterArtifacts = true`.
- Канал обновлений переводится на `vyron-updates/latest.json` с реальной подписью.
- Release pipeline обязан получить `TAURI_SIGNING_PRIVATE_KEY` и `TAURI_UPDATER_PUBLIC_KEY` из GitHub Actions Secrets; без них релиз блокируется.
- Для macOS Apple Silicon публикуются `VYRON.app.tar.gz`, `VYRON.app.tar.gz.sig`, `latest.json` и обычный DMG.
- Перед публикацией проходят unit tests, production frontend build, Rust ARM64 check, Tauri build, ARM64 binary check, codesign verify и DMG verify.
- CI отдельно проверяет, что приватный updater-key не попал в frontend `dist` или в release assets.

## Важно

Версии до 0.9.1 использовали placeholder update feed и не имели рабочего доверенного канала подписанных обновлений. Поэтому **0.9.1 устанавливается вручную один последний раз**. После этого 0.9.2 и следующие версии смогут приходить через встроенный VYRON Update Center.

## Совместимость

- Identifier приложения не меняется.
- OAuth-профили, локальное состояние, Workspace, очереди, Metadata Hub и настройки не сбрасываются.
- Бизнес-логика VYRON 0.9.0 не переписывается: 0.9.1 является updater bootstrap поверх неё.
