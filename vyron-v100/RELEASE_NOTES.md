# VYRON 1.0.1 — Local Quota Reset

Дата релиза: 01.09.2026

## Главное

VYRON теперь показывает время следующего сброса YouTube Data API **по локальному времени компьютера пользователя**, а не только техническое `00:00 PT`.

## Что изменено в 1.0.1

- В Quota Meter поле «Сброс» заменено на **«Сброс по вашему времени»**.
- Следующий `00:00 America/Los_Angeles` автоматически переводится в системный часовой пояс macOS.
- Учитывается переход Pacific Time между PDT и PST, поэтому время пересчитывается автоматически и не захардкожено.
- Для компьютера с часовым поясом Красноярска отображается примерно **14:00 летом** и **15:00 зимой**.
- Рядом сохраняется техническая подпись `00:00 PT`, чтобы было понятно, от какого правила Google идёт расчёт.
- Сообщение при исчерпании квоты также показывает точные локальные дату и время следующего сброса.

## Сохранено без изменений

- Zero Quota архитектура VYRON 1.0.
- YouTube API вызывается только внутри рабочей зоны YouTube и после явного действия пользователя.
- Production работает локально без YouTube API.
- Existing Videos cache, Metadata Draft, Production Workspace и Undo persistence сохранены.
- OAuth/token storage, Tauri identifier, updater endpoint/public key, ENDLUME integration и Rust YouTube writer не менялись.

## Проверки релиза

1.0.1 публикуется только после PASS: frontend tests, TypeScript production build, Rust tests, cargo check ARM64, Zero Quota/local-reset contract, private-key leak scan, Tauri ARM64 build, app codesign, DMG verify и updater signature verify против доверенного ключа VYRON 0.9.9/1.0.0.
