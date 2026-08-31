# VYRON — настройка подписанных обновлений

Это одноразовая настройка доверенного канала Tauri Updater.

## Почему нужен bootstrap 0.9.1

VYRON 0.9.0 уже содержит Update Center, но ранее опубликованный `vyron-updates/latest.json` был placeholder-каналом и в GitHub Actions не было приватного signing key. Публичный ключ должен быть встроен в само приложение до того, как оно сможет безопасно принимать следующие обновления.

Поэтому 0.9.1 устанавливается вручную один последний раз. После этого 0.9.2+ могут устанавливаться через VYRON.

## 1. Создать updater key pair на Mac

Не отправляй приватный ключ в ChatGPT, мессенджеры, issue, commit или файл репозитория.

```bash
mkdir -p "$HOME/.tauri"
npx --yes @tauri-apps/cli@2.10.1 signer generate -w "$HOME/.tauri/vyron-updater.key" -p ""
chmod 600 "$HOME/.tauri/vyron-updater.key"
```

Будут созданы:

- `~/.tauri/vyron-updater.key` — PRIVATE KEY, только для GitHub Actions Secret;
- `~/.tauri/vyron-updater.key.pub` — PUBLIC KEY, он безопасен для встраивания в приложение.

## 2. Добавить GitHub Actions Secrets

Репозиторий: `ScaleUPPeisov/scaleup-dashboards`

Открой: **Settings → Secrets and variables → Actions → New repository secret**.

Создай два секрета:

### TAURI_SIGNING_PRIVATE_KEY

На Mac:

```bash
pbcopy < "$HOME/.tauri/vyron-updater.key"
```

Вставь значение в GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`.

### TAURI_UPDATER_PUBLIC_KEY

На Mac:

```bash
pbcopy < "$HOME/.tauri/vyron-updater.key.pub"
```

Вставь значение в GitHub Secret `TAURI_UPDATER_PUBLIC_KEY`.

Для ключа, созданного командой выше с `-p ""`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` создавать не нужно. Workflow поддерживает этот secret для будущего варианта с паролем.

## 3. Что делает CI

Workflow `.github/workflows/vyron-v091-updater-release.yml`:

1. Блокирует релиз, если updater secrets отсутствуют.
2. Проверяет формат public/private key без печати ключей в лог.
3. Криптографически проверяет, что public/private являются одной парой.
4. Встраивает public key в `tauri.conf.json`.
5. Запускает unit tests, frontend production build и Rust ARM64 check.
6. Проверяет, что private key не попал в frontend/release files.
7. Собирает VYRON.app, DMG и Tauri updater artifact.
8. Требует реальный `VYRON.app.tar.gz.sig`.
9. Проверяет ARM64 binary, codesign и DMG.
10. Публикует GitHub Release `v0.9.1`.
11. Публикует реальный `main/vyron-updates/latest.json` с той же подписью.
12. Перечитывает опубликованный feed и сравнивает signature с локальной перед завершением job.

## 4. После установки VYRON 0.9.1

Следующие релизы используют тот же `TAURI_SIGNING_PRIVATE_KEY`. Публичный ключ менять нельзя без отдельной процедуры key rotation, иначе уже установленные приложения перестанут доверять новым версиям.

Храни резервную копию `~/.tauri/vyron-updater.key` в безопасном месте. Потеря приватного ключа означает потерю возможности выпускать обновления для уже установленных копий VYRON через текущий trust chain.
