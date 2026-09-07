# VYRON YT PEISOV 2.0.11 — Shorts Factory

## Shorts Factory
- В «Производство» добавлен отдельный раздел SHORTS и действие «СОЗДАТЬ SHORTS» для READY_UPLOAD Long VIDEO.
- Источник — готовый MP4 с video+audio. Результат — 1080×1920: исходный 16:9 кадр поверх размытого фона, исходный звук, без субтитров.
- Batch: 1/5/10/20/30/50 и пользовательское количество до 500 Shorts на исходник.
- Диапазоны не пересекаются и не переиспользуются после ошибки/перезапуска; очередь сохраняется, PAUSE/RESUME восстанавливаются.
- Рендеры складываются в `Render/<channel>/Shorts/<source-video>/<short-id>.mp4`.

## Metadata, schedule, YouTube
- В YouTube Metadata добавлены отдельные вкладки VIDEO / SHORTS.
- Для Shorts используются отдельные metadata presets; title/description/tags обязательны для METADATA_READY.
- Duplicate title блокируется внутри канала.
- Расписание рассчитывается локально в Asia/Krasnoyarsk: 1/2/3/5 публикаций в день или пользовательское число уникальных времён.
- Перед upload выполняется повторная FFprobe-проверка локального Short.
- Существующий resumable upload pipeline сохранён: активная session возобновляется без второго `videos.insert`; повторный upload блокируется, если уже сохранён `youtubeVideoId`.

## FFmpeg / validation
- Hardware-first: `h264_videotoolbox`, fallback `libx264`; audio copy, fallback AAC.
- Output создаётся через временный `.part.mp4`, проверяется FFprobe и только после этого финализируется.
- Проверяются video+audio, 1080×1920, длительность и непустой MP4.

## Quota и совместимость
- Quota Meter отдельно показывает Long Videos, Shorts и Total Video Uploads.
- Production, Downloads, ENDLUME, Future Channels, Publisher, OAuth и Security Layer 2.0.9 не переписывались.
- 2.0.11 включает интерфейс истории обновлений 2.0.10; установленный 2.0.9 может обновиться напрямую до 2.0.11.
