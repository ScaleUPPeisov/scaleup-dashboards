export type ReleaseType='PATCH'|'MINOR'|'MAJOR'|'RC';
export type ReleaseSectionKey='features'|'fixes'|'interface'|'reliability'|'security'|'technical';
export type ReleaseHistoryEntry={date:string;version:string;title:string;type:ReleaseType;highlights:string[];sections:Partial<Record<ReleaseSectionKey,string[]>>;technicalItems?:string[];technicalBuilds?:number[];tag?:string;publishedAt?:string;prerelease?:boolean};
export const VYRON_RELEASE_HISTORY:ReleaseHistoryEntry[]=[
  {
    "date": "2026-09-23",
    "version": "3.2.1",
    "title": "Physical UI & Safe Cleanup",
    "type": "PATCH",
    "highlights": [
      "🧭 Sidebar снова показывает полные русские названия без обрезки до одной буквы.",
      "🗑️ Добавлена безопасная очистка подтверждённо загруженных локальных видео через системную Корзину.",
      "🌎 Страна канала и язык YouTube берутся из авторитетных YouTube metadata, а не из устаревшего локального RU.",
      "🔒 OAuth continuity и Publisher upload/fingerprint identity сохранены без архитектурной переработки."
    ],
    "sections": {
      "features": [
        "Очистка поддерживает последнюю upload batch и все подтверждённые загрузки текущего канала.",
        "Частичная партия удаляет только успешно подтверждённые файлы; failed/unknown/mismatched остаются на диске."
      ],
      "fixes": [
        "Исправлен legacy CSS width на sidebar label, из-за которого Главная/Каналы/Производство отображались как Г../К../П...",
        "Страна канала теперь следует приоритету live YouTube → сохранённый YouTube cache → ручной fallback.",
        "Язык YouTube больше не подменяется локальным языком приложения/канала."
      ],
      "interface": [
        "Sidebar закреплён на безопасной desktop-ширине 228 px с одинаковой геометрией строк.",
        "Cleanup confirmation показывает количество видео и объём перед перемещением в Корзину."
      ],
      "reliability": [
        "Перед Trash повторно сверяются trusted upload-time SHA-256 + fileSize с текущим физическим файлом.",
        "После cleanup Render folder пересканируется, uploadHistory и YouTube ID сохраняются.",
        "AppleDouble и cross-channel файлы исключены из cleanup candidates."
      ],
      "security": [
        "Permanent delete не используется; применяется системная Корзина macOS.",
        "Новые OAuth scopes не добавлялись."
      ],
      "technical": [
        "Patch поверх verified 3.2.0 build 335 baseline.",
        "Stable feed остаётся заморожен до owner physical acceptance."
      ]
    },
    "technicalItems": [
      "Baseline: 0800e8d72b7cff7d9233e6f9a7f8b003bb7aa6f3.",
      "Stable feed remains frozen pending physical acceptance."
    ],
    "technicalBuilds": []
  },
  {
    "date": "2026-09-23",
    "version": "3.2.0",
    "title": "Crash Recovery & Development Journey",
    "type": "MINOR",
    "highlights": [
      "⚡ 30-секундное безопасное восстановление Production после crash / power loss.",
      "🧭 Полная компактная история VYRON от 0.5.0 с группировкой по дням.",
      "🎨 Единый sidebar active-state и выровненная навигация.",
      "💾 Recovery journal хранится вне VYRON.app и проверяет внешний физический том перед записью."
    ],
    "sections": {
      "features": [
        "Добавлен durable write-ahead recovery journal для Production batches.",
        "Восстановление продолжает batch с последнего проверенного checkpoint и возвращает Production UI context.",
        "Добавлен ручной вход «Восстановить незавершённую работу» после отказа от автопродолжения.",
        "История версий получила поиск, компактные фильтры и раскрываемые детали."
      ],
      "fixes": [
        "Убраны пустой блок «Последние уведомления» и информационная карточка «Целевой рендер».",
        "Sidebar использует ровно один активный пункт, включая внутренние YouTube/Settings/Production маршруты."
      ],
      "interface": [
        "Новый центрированный Recovery Flow с countdown 30 секунд и состоянием ожидания диска.",
        "История сгруппирована по дате и показывает тип PATCH / MINOR / MAJOR / RC."
      ],
      "reliability": [
        "Проекты staging’уются в .vyron-partial и коммитятся атомарным rename после flush.",
        "Recovery повторно проверяет source evidence и не сбрасывает уже завершённые проекты.",
        "Внешний том идентифицируется по Volume UUID; совпадение имени не достаточно при известном UUID.",
        "Повторный crash/recovery остаётся idempotent."
      ],
      "security": [
        "Recovery journal не содержит OAuth refresh/access tokens, client_secret, credentials.json или vault keys.",
        "YouTube uploads не повторяются recovery-модулем; remote state продолжает сверяться существующим resumable/session/history контуром."
      ],
      "technical": [
        "recoverySchemaVersion = 1.",
        "Stable updater feeds остаются заморожены до physical acceptance."
      ]
    },
    "technicalItems": [
      "recoverySchemaVersion = 1.",
      "Stable updater feeds остаются заморожены до physical acceptance."
    ],
    "technicalBuilds": []
  },
  {
    "date": "2026-09-23",
    "version": "3.1.1",
    "title": "Layout & Collision Fix",
    "type": "PATCH",
    "highlights": [
      "Единый layout-contract защищает кнопки, вкладки, topbar и modal footer от переполнения.",
      "OAuth-кнопка «Переподключить» стала компактной без изменения reconnect workflow.",
      "Карточка внешнего диска получила отдельную адаптивную группу действий."
    ],
    "sections": {
      "fixes": [
        "Исправлено переполнение длинных русских подписей и конфликт legacy CSS.",
        "Устранены коллизии topbar и action-групп на узких окнах."
      ],
      "interface": [
        "Добавлены responsive contracts для 1440 / 1280 / 1024 px."
      ],
      "reliability": [],
      "features": [],
      "security": [],
      "technical": [
        "Owner Preview build 331."
      ]
    },
    "technicalItems": [
      "Owner Preview build 331."
    ],
    "technicalBuilds": [
      331
    ]
  },
  {
    "date": "2026-09-23",
    "version": "3.1.0",
    "title": "Analytics, Competitors & Unified UI",
    "type": "MINOR",
    "highlights": [
      "Аналитика обновляется внутри своей страницы.",
      "Конкуренты стали самостоятельным публичным радаром.",
      "Календарь объединён с расписанием.",
      "Обновлены Каналы и Production."
    ],
    "sections": {
      "features": [
        "Самостоятельные Analytics и Competitors workspaces.",
        "Единый Schedule workspace и обновлённый Fleet экран каналов."
      ],
      "fixes": [
        "Исправлен общий процент задач и разделены активные ошибки и история."
      ],
      "interface": [
        "Уплотнён рабочий интерфейс владельца."
      ],
      "reliability": [],
      "security": [],
      "technical": [
        "Owner Preview build 328."
      ]
    },
    "technicalItems": [
      "Owner Preview build 328."
    ],
    "technicalBuilds": [
      328
    ]
  },
  {
    "date": "2026-09-21",
    "version": "3.0.0",
    "title": "Publisher, OAuth Continuity & Clean UI",
    "type": "MAJOR",
    "highlights": [
      "Восстановлен безопасный выбор новых видео и «Выбрать все».",
      "Google/OAuth credentials сохраняются между обновлениями.",
      "Publisher автоматически работает с отдельными Render/Projects папками каналов.",
      "История обновлений и уведомления собраны в единый пользовательский flow."
    ],
    "sections": {
      "features": [
        "Автопоиск отдельных Render и Projects папок каналов."
      ],
      "fixes": [
        "Исправлена идентичность новых физических render-файлов без отключения duplicate protection."
      ],
      "interface": [
        "Упрощён Update Center и YouTube workflow."
      ],
      "reliability": [
        "Обычные обновления не требуют массового Google login или credentials.json."
      ],
      "security": [
        "Сохранены Profile UUID, Channel ID и защищённое credential storage."
      ],
      "technical": [
        "Owner Preview builds: 187 → 193 → 210 → 246 → 270 → 281 → 320."
      ]
    },
    "technicalItems": [
      "Owner Preview builds: 187 → 193 → 210 → 246 → 270 → 281 → 320."
    ],
    "technicalBuilds": [
      187,
      193,
      210,
      246,
      270,
      281,
      320
    ]
  },
  {
    "date": "2026-09-20",
    "version": "2.1.15-rc.7",
    "title": "2.1.15 RC7 — Channel Render Scan + OAuth Update Continuity",
    "type": "RC",
    "highlights": [
      "Publisher render scan now requires an exact folder bound to the stable local channel ID and never silently falls back to the global workspace.",
      "Every supported physical media file receives exactly one primary classification; summary counters cannot exceed the scanned file total.",
      "Existing YouTube proof keeps local copies out of NEW upload candidates and same sequence numbers on different channels do not collide.",
      "RC6 wrong-root scan records are blocked from upload and exposed for metadata-only recovery; physical files are never moved or deleted by repair."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Publisher render scan now requires an exact folder bound to the stable local channel ID and never silently falls back to the global workspace.",
        "Every supported physical media file receives exactly one primary classification; summary counters cannot exceed the scanned file total.",
        "Existing YouTube proof keeps local copies out of NEW upload candidates and same sequence numbers on different channels do not collide.",
        "RC6 wrong-root scan records are blocked from upload and exposed for metadata-only recovery; physical files are never moved or deleted by repair.",
        "Normal application updates preserve active refresh-token account pointers, profile UUIDs, Bundle ID and canonical Keychain service.",
        "13-profile and 50-profile continuity fixtures protect rotated/legacy mixed states without browser launch, credentials.json reimport or mass rotation.",
        "RC6 KEYCHAIN_AUTH_FAILED / OSStatus -25293 generation rotation remains intact."
      ],
      "technical": [
        "Built directly on immutable v2.1.15-rc.6.",
        "This prerelease is intentionally NOT promoted to the macOS updater feed until physical RC6→RC7 OAuth continuity and Glass City Lovers render-scan acceptance pass."
      ]
    },
    "technicalItems": [
      "Built directly on immutable v2.1.15-rc.6.",
      "This prerelease is intentionally NOT promoted to the macOS updater feed until physical RC6→RC7 OAuth continuity and Glass City Lovers render-scan acceptance pass."
    ],
    "tag": "v2.1.15-rc.7",
    "publishedAt": "2026-09-20T18:03:23Z",
    "prerelease": true
  },
  {
    "date": "2026-09-20",
    "version": "2.1.15-rc.6",
    "title": "2.1.15 RC6 — Keychain AuthFailed Recovery",
    "type": "RC",
    "highlights": [
      "A newly validated Google refresh token no longer depends on reading an old blocked Keychain item for rollback.",
      "Proven blocked credentials rotate to a new per-profile secure account generation; the old inaccessible account is preserved untouched.",
      "New secure items must pass a real kSecUseAuthenticationUISkip backend readback before their metadata pointer can become active.",
      "A fresh-item -25293 stops immediately as NEW_ITEM_READBACK_AUTH_FAILED; no rotation loop and no password popup."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "A newly validated Google refresh token no longer depends on reading an old blocked Keychain item for rollback.",
        "Proven blocked credentials rotate to a new per-profile secure account generation; the old inaccessible account is preserved untouched.",
        "New secure items must pass a real kSecUseAuthenticationUISkip backend readback before their metadata pointer can become active.",
        "A fresh-item -25293 stops immediately as NEW_ITEM_READBACK_AUTH_FAILED; no rotation loop and no password popup.",
        "Profile UUID and expected YouTube Channel ID are preserved; WRONG_CHANNEL commits nothing.",
        "Active credential pointers are backward-compatible and idempotent across restart.",
        "New-channel connect also requires genuine secure readback before profile metadata is committed.",
        "GLOBAL credentials.json remains one-time configuration; no mass reconnect or Keychain wipe."
      ],
      "technical": [
        "Built directly on immutable v2.1.15-rc.5.",
        "Fixes the physical RC5 errSecAuthFailed / OSStatus -25293 reconnect incident.",
        "RC5 rapid updater, upload duplicate protection, processing monitor, ENDLUME monotonicity, render recovery, statistics history, Activity Journal and RC2 schedule completeness protections remain.",
        "Automated regression/signing gates are required; physical RC5→RC6 Keychain recovery remains post-release acceptance."
      ]
    },
    "technicalItems": [
      "Built directly on immutable v2.1.15-rc.5.",
      "Fixes the physical RC5 errSecAuthFailed / OSStatus -25293 reconnect incident.",
      "RC5 rapid updater, upload duplicate protection, processing monitor, ENDLUME monotonicity, render recovery, statistics history, Activity Journal and RC2 schedule completeness protections remain.",
      "Automated regression/signing gates are required; physical RC5→RC6 Keychain recovery remains post-release acceptance."
    ],
    "tag": "v2.1.15-rc.6",
    "publishedAt": "2026-09-20T17:01:09Z",
    "prerelease": true
  },
  {
    "date": "2026-09-20",
    "version": "2.1.15-rc.5",
    "title": "2.1.15 RC5 — Rapid Updater Reliability",
    "type": "RC",
    "highlights": [
      "Built directly on immutable v2.1.15-rc.4.",
      "Startup update discovery plus 15-minute automatic checks.",
      "Foreground/network checks after a 5-minute age gate."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": [
        "Built directly on immutable v2.1.15-rc.4.",
        "Startup update discovery plus 15-minute automatic checks.",
        "Foreground/network checks after a 5-minute age gate.",
        "Strict single-flight checks, bounded 15/30/60 minute failure backoff, and updater-error deduplication.",
        "Update Center last/next check visibility and immediate Sidebar availability notice.",
        "Explicit signed install/restart remains blocked during Upload / ENDLUME / Shorts / Schedule work.",
        "Update checks use no-cache headers and consume zero YouTube API quota.",
        "Canonical per-profile refresh-token denials retain the original Keychain OSStatus and allow bounded no-UI recovery instead of permanent process-lifetime blocking.",
        "GLOBAL OAuth readiness is separated from per-profile refresh-token readiness; Keychain failures before OAuth never become false YouTube rejection errors or quota debit.",
        "Basic channel statistics can use one operational OAuth driver for the linked-channel batch while blocked private profiles remain isolated and cached statistics remain visible.",
        "Explicit profile reconnect preserves Profile UUID / expected Channel ID and performs canonical Keychain write + no-UI readback.",
        "RC1/RC2/RC3/RC4 OAuth, schedule, upload reconciliation, ENDLUME, render recovery, Activity Journal and Statistics protections are preserved."
      ]
    },
    "technicalItems": [
      "Built directly on immutable v2.1.15-rc.4.",
      "Startup update discovery plus 15-minute automatic checks.",
      "Foreground/network checks after a 5-minute age gate.",
      "Strict single-flight checks, bounded 15/30/60 minute failure backoff, and updater-error deduplication.",
      "Update Center last/next check visibility and immediate Sidebar availability notice.",
      "Explicit signed install/restart remains blocked during Upload / ENDLUME / Shorts / Schedule work.",
      "Update checks use no-cache headers and consume zero YouTube API quota.",
      "Canonical per-profile refresh-token denials retain the original Keychain OSStatus and allow bounded no-UI recovery instead of permanent process-lifetime blocking.",
      "GLOBAL OAuth readiness is separated from per-profile refresh-token readiness; Keychain failures before OAuth never become false YouTube rejection errors or quota debit.",
      "Basic channel statistics can use one operational OAuth driver for the linked-channel batch while blocked private profiles remain isolated and cached statistics remain visible.",
      "Explicit profile reconnect preserves Profile UUID / expected Channel ID and performs canonical Keychain write + no-UI readback.",
      "RC1/RC2/RC3/RC4 OAuth, schedule, upload reconciliation, ENDLUME, render recovery, Activity Journal and Statistics protections are preserved."
    ],
    "tag": "v2.1.15-rc.5",
    "publishedAt": "2026-09-20T15:56:49Z",
    "prerelease": true
  },
  {
    "date": "2026-09-20",
    "version": "2.1.15-rc.4",
    "title": "2.1.15 RC4 — Activity History + Statistics",
    "type": "RC",
    "highlights": [
      "Adds a durable append-oriented YouTube Activity Journal.",
      "Separates remote YouTube state, VYRON operation history and local source-file lifecycle.",
      "Preserves upload history when original MP4 files are missing or later moved to Trash.",
      "Reconstructs only provable legacy facts and labels them RECONSTRUCTED / LEGACY_IMPORT."
    ],
    "sections": {
      "features": [
        "Adds a durable append-oriented YouTube Activity Journal.",
        "Separates remote YouTube state, VYRON operation history and local source-file lifecycle.",
        "Preserves upload history when original MP4 files are missing or later moved to Trash.",
        "Reconstructs only provable legacy facts and labels them RECONSTRUCTED / LEGACY_IMPORT.",
        "Adds channel/date/type/status/search filters and per-channel daily summaries.",
        "Cleanup candidates are preclassified; already-missing/processing/changed files are excluded before Trash.",
        "Repeated CLEANUP_NOT_READY noise is aggregated into one batch result.",
        "System Trash remains the only destructive cleanup path; no permanent delete.",
        "Adds a separate Multi-Channel Statistics Center with exact linked-channel classification.",
        "Refresh All excludes local-only/future/orphan mappings and deduplicates duplicate YouTube Channel IDs.",
        "Basic channel statistics are fetched in batches up to 50 IDs with factual method-ledger quota accounting.",
        "Existing YouTube Analytics scopes expose period views/watch time/duration/subscriber/engagement metrics without forced reconnect.",
        "Plan Channels now separates local projects from linked YouTube channels and gates YouTube actions on exact mappings."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "RC3 OAuth/Keychain/profile protections and RC2 schedule truth remain intact."
      ],
      "technical": [
        "Built directly on immutable v2.1.15-rc.3.",
        "Journals future uploads, processing transitions, metadata field counts, schedule/inventory operations and explicit OAuth reconnects.",
        "Adds batched videos.list reconciliation and controlled local-source checks.",
        "Adds persistent raw-number statistics snapshots, baseline migration, 24h/7d/30d/monthly history and explicit insufficient-history states.",
        "credentials.json remains explicit import/repair only; Statistics paths never open Finder or trigger OAuth reconnect.",
        "macOS and Windows updater feeds are NOT modified by this prerelease.",
        "Physical reconciliation of existing operator data is required before any stable release or updater promotion."
      ]
    },
    "technicalItems": [
      "Built directly on immutable v2.1.15-rc.3.",
      "Journals future uploads, processing transitions, metadata field counts, schedule/inventory operations and explicit OAuth reconnects.",
      "Adds batched videos.list reconciliation and controlled local-source checks.",
      "Adds persistent raw-number statistics snapshots, baseline migration, 24h/7d/30d/monthly history and explicit insufficient-history states.",
      "credentials.json remains explicit import/repair only; Statistics paths never open Finder or trigger OAuth reconnect.",
      "macOS and Windows updater feeds are NOT modified by this prerelease.",
      "Physical reconciliation of existing operator data is required before any stable release or updater promotion."
    ],
    "tag": "v2.1.15-rc.4",
    "publishedAt": "2026-09-20T11:12:38Z",
    "prerelease": true
  },
  {
    "date": "2026-09-20",
    "version": "2.1.15-rc.3",
    "title": "2.1.15 RC3 — Critical Stabilization",
    "type": "RC",
    "highlights": [
      "OAuth Ready now requires an operational no-UI secure secret read; metadata presence alone is never READY.",
      "OAuth profile metadata loads independently from global Keychain health; orphan mappings are diagnosed, not deleted.",
      "Existing profile UUID / Channel ID mapping remains preserved; exact client-id matching remains enforced.",
      "RC2 authoritative inventory, targeted retry, cache preservation and quota-ledger fixes remain intact."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [
        "OAuth Ready now requires an operational no-UI secure secret read; metadata presence alone is never READY.",
        "OAuth profile metadata loads independently from global Keychain health; orphan mappings are diagnosed, not deleted.",
        "Existing profile UUID / Channel ID mapping remains preserved; exact client-id matching remains enforced.",
        "RC2 authoritative inventory, targeted retry, cache preservation and quota-ledger fixes remain intact.",
        "Upload Center uses factual bytes/speed/elapsed/ETA and persists returned YouTube videoId immediately to prevent duplicate retry.",
        "Local cleanup requires fresh YouTube READY identity + exact fingerprint and uses system Trash only.",
        "Failed, pending and processing sources are retained."
      ],
      "security": [],
      "technical": [
        "Built directly on immutable v2.1.15-rc.2.",
        "Explicit credentials.json repair rotates GLOBAL client_secret to a fresh canonical secure account, verifies readback and clears stale denied cache without deleting old credentials.",
        "Upload accepted is separate from YouTube processing READY; background reconciliation survives app restart.",
        "Production updater feeds are intentionally NOT modified by this prerelease.",
        "Physical OAuth, restart x2, real inventory, upload and Trash acceptance remain REQUIRED before stable/promotion."
      ]
    },
    "technicalItems": [
      "Built directly on immutable v2.1.15-rc.2.",
      "Explicit credentials.json repair rotates GLOBAL client_secret to a fresh canonical secure account, verifies readback and clears stale denied cache without deleting old credentials.",
      "Upload accepted is separate from YouTube processing READY; background reconciliation survives app restart.",
      "Production updater feeds are intentionally NOT modified by this prerelease.",
      "Physical OAuth, restart x2, real inventory, upload and Trash acceptance remain REQUIRED before stable/promotion."
    ],
    "tag": "v2.1.15-rc.3",
    "publishedAt": "2026-09-20T05:29:56Z",
    "prerelease": true
  },
  {
    "date": "2026-09-20",
    "version": "2.1.15-rc.2",
    "title": "2.1.15 RC2 — Schedule Sync Hotfix",
    "type": "RC",
    "highlights": [
      "Separates factual uploads-playlist traversal from advisory pageInfo.totalResults.",
      "A fully exhausted 203-ID playlist with 203 authoritative videos.list rows is complete even if pageInfo.totalResults is stale.",
      "Returns exact incompleteReasons, missing IDs, pagination/truncation facts and diagnostic warnings.",
      "Keeps full-inventory truth separate from schedule truth."
    ],
    "sections": {
      "features": [],
      "fixes": [
        "Separates factual uploads-playlist traversal from advisory pageInfo.totalResults.",
        "A fully exhausted 203-ID playlist with 203 authoritative videos.list rows is complete even if pageInfo.totalResults is stale.",
        "Returns exact incompleteReasons, missing IDs, pagination/truncation facts and diagnostic warnings.",
        "Keeps full-inventory truth separate from schedule truth.",
        "Adds targeted videos.list retry for only missing/unverified IDs.",
        "Publisher shows the concrete reason for incomplete schedule sync and may use only a recent last-complete authoritative snapshot.",
        "Existing full sync remains available.",
        "youtube_list_existing_videos and targeted retry are method-ledger commands; compatibility estimator is not double-debited.",
        "OAuth, Keychain, channel statistics, upload pipeline, ELARA work, Windows and production updater are untouched."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": [
        "Built on immutable RC1 source.",
        "Partial refreshes preserve the last complete cached inventory instead of replacing it with fewer rows.",
        "Physical 203-video channel acceptance is NOT marked PASS until tested on the operator Mac."
      ]
    },
    "technicalItems": [
      "Built on immutable RC1 source.",
      "Partial refreshes preserve the last complete cached inventory instead of replacing it with fewer rows.",
      "Physical 203-video channel acceptance is NOT marked PASS until tested on the operator Mac."
    ],
    "tag": "v2.1.15-rc.2",
    "publishedAt": "2026-09-20T04:33:25Z",
    "prerelease": true
  },
  {
    "date": "2026-09-19",
    "version": "2.1.15-rc.1",
    "title": "2.1.15 RC1 — Add Channel + Statistics",
    "type": "RC",
    "highlights": [
      "Physical-regression candidate for Add Channel OAuth and YouTube channel statistics.",
      "Installed-browser selector and Google select_account/offline consent flow are preserved.",
      "Channel statistics refresh on a ten-minute stale-cache cadence, persist in AppState, and live-update the UI.",
      "Up to 50 known Channel IDs are refreshed in one channels.list batch; fallback errors do not abort the remaining profiles."
    ],
    "sections": {
      "features": [
        "Physical-regression candidate for Add Channel OAuth and YouTube channel statistics.",
        "Installed-browser selector and Google select_account/offline consent flow are preserved.",
        "Channel statistics refresh on a ten-minute stale-cache cadence, persist in AppState, and live-update the UI.",
        "Up to 50 known Channel IDs are refreshed in one channels.list batch; fallback errors do not abort the remaining profiles.",
        "Active-channel and account statistics are larger, show freshness/failure state, and support real manual refresh."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "+ Add Channel never invokes the credentials.json file picker.",
        "OAuth callback has a bounded five-minute listener timeout with state validation.",
        "Reconnect preserves an existing canonical refresh token when Google omits a replacement.",
        "GLOBAL OAuth readiness no longer becomes false solely because passive Keychain enumeration skipped a protected secret item.",
        "Production updater remains VYRON 2.1.14 until physical Google OAuth acceptance succeeds."
      ],
      "technical": [
        "Missing GLOBAL OAuth readiness opens an explicit setup modal; Finder is only opened from the explicit Import credentials action.",
        "Duplicate YouTube Channel IDs are blocked from creating/replacing a profile in the new-channel flow and are routed to explicit Reconnect.",
        "Physical Google account selection, callback, real channel discovery, real statistics and restart persistence are NOT yet marked PASS."
      ]
    },
    "technicalItems": [
      "Missing GLOBAL OAuth readiness opens an explicit setup modal; Finder is only opened from the explicit Import credentials action.",
      "Duplicate YouTube Channel IDs are blocked from creating/replacing a profile in the new-channel flow and are routed to explicit Reconnect.",
      "Physical Google account selection, callback, real channel discovery, real statistics and restart persistence are NOT yet marked PASS."
    ],
    "tag": "v2.1.15-rc.1",
    "publishedAt": "2026-09-19T16:58:18Z",
    "prerelease": true
  },
  {
    "date": "2026-09-19",
    "version": "2.1.14",
    "title": "VYRON 2.1.14",
    "type": "PATCH",
    "highlights": [
      "Added real YouTube subscriberCount, total viewCount and videoCount via channels.list(part=snippet,statistics).",
      "Added cached statistics to active Channel Center and every YouTube account card.",
      "Hidden subscriber counts are displayed as hidden, never fake zero.",
      "Failed stats refresh preserves the last confirmed values."
    ],
    "sections": {
      "features": [
        "Added real YouTube subscriberCount, total viewCount and videoCount via channels.list(part=snippet,statistics).",
        "Added cached statistics to active Channel Center and every YouTube account card.",
        "Hidden subscriber counts are displayed as hidden, never fake zero.",
        "Failed stats refresh preserves the last confirmed values.",
        "Local quota ledger accounts for channel statistics requests.",
        "Automated RC2 and stable regression/build/signing gates passed."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Fixed GLOBAL Google OAuth readiness and Add Channel onboarding.",
        "Preserves existing Profile UUIDs, refresh tokens, channel mappings and app data.",
        "Keeps macOS Keychain non-interactive."
      ],
      "technical": [
        "Stable macOS release from the exact VYRON 2.1.14-rc.2 product source.",
        "Added browser selection and explicit Google account selection.",
        "Stable publication was explicitly authorized before physical Google OAuth/statistics acceptance was completed."
      ]
    },
    "technicalItems": [
      "Stable macOS release from the exact VYRON 2.1.14-rc.2 product source.",
      "Added browser selection and explicit Google account selection.",
      "Stable publication was explicitly authorized before physical Google OAuth/statistics acceptance was completed."
    ],
    "tag": "v2.1.14",
    "publishedAt": "2026-09-19T16:08:01Z",
    "prerelease": false
  },
  {
    "date": "2026-09-19",
    "version": "2.1.14-rc.2",
    "title": "2.1.14 RC2",
    "type": "RC",
    "highlights": [
      "YouTube OAuth onboarding + factual channel statistics candidate.",
      "channels.list(part=snippet,statistics) now supplies subscriberCount, viewCount, videoCount, hiddenSubscriberCount and channel identity metadata.",
      "Channel statistics persist in existing AppState cache and refresh only when stale (30 minutes), on health check, or manual refresh.",
      "Active Channel Center and all account cards show subscribers, total channel views and video count."
    ],
    "sections": {
      "features": [
        "YouTube OAuth onboarding + factual channel statistics candidate.",
        "channels.list(part=snippet,statistics) now supplies subscriberCount, viewCount, videoCount, hiddenSubscriberCount and channel identity metadata.",
        "Channel statistics persist in existing AppState cache and refresh only when stale (30 minutes), on health check, or manual refresh.",
        "Active Channel Center and all account cards show subscribers, total channel views and video count."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "The Add Channel action remains visible and routes through the real GLOBAL OAuth readiness gate.",
        "Existing refresh tokens, Profile UUIDs, channel mappings and Keychain data are preserved.",
        "macOS Keychain remains non-interactive.",
        "New OAuth connections piggyback statistics on the existing channel discovery request, avoiding an extra API unit."
      ],
      "technical": [
        "OAuth Ready is reconciled from actual canonical Keychain account presence, not stale metadata alone.",
        "New-channel OAuth explicitly requests Google account selection plus offline consent.",
        "One GLOBAL OAuth client secret is used for new channels; historical profile-specific secrets remain supported for compatibility.",
        "Failed refresh keeps the last known factual values instead of replacing them with zero.",
        "Physical Google OAuth acceptance is mandatory before any stable 2.1.14 release.",
        "Stable updater feed remains on 2.1.13."
      ]
    },
    "technicalItems": [
      "OAuth Ready is reconciled from actual canonical Keychain account presence, not stale metadata alone.",
      "New-channel OAuth explicitly requests Google account selection plus offline consent.",
      "One GLOBAL OAuth client secret is used for new channels; historical profile-specific secrets remain supported for compatibility.",
      "Failed refresh keeps the last known factual values instead of replacing them with zero.",
      "Physical Google OAuth acceptance is mandatory before any stable 2.1.14 release.",
      "Stable updater feed remains on 2.1.13."
    ],
    "tag": "v2.1.14-rc.2",
    "publishedAt": "2026-09-19T15:50:32Z",
    "prerelease": true
  },
  {
    "date": "2026-09-19",
    "version": "2.1.14-rc.1",
    "title": "2.1.14 RC1",
    "type": "RC",
    "highlights": [
      "YouTube OAuth onboarding repair candidate.",
      "The Add Channel action remains visible and routes through the real GLOBAL OAuth readiness gate.",
      "Existing refresh tokens, Profile UUIDs, channel mappings and Keychain data are preserved.",
      "macOS Keychain remains non-interactive."
    ],
    "sections": {
      "features": [
        "YouTube OAuth onboarding repair candidate."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "The Add Channel action remains visible and routes through the real GLOBAL OAuth readiness gate.",
        "Existing refresh tokens, Profile UUIDs, channel mappings and Keychain data are preserved.",
        "macOS Keychain remains non-interactive."
      ],
      "technical": [
        "OAuth Ready is reconciled from actual canonical Keychain account presence, not stale metadata alone.",
        "New-channel OAuth explicitly requests Google account selection plus offline consent.",
        "One GLOBAL OAuth client secret is used for new channels; historical profile-specific secrets remain supported for compatibility.",
        "Physical Google OAuth acceptance is mandatory before any stable 2.1.14 release.",
        "Stable updater feed remains on 2.1.13."
      ]
    },
    "technicalItems": [
      "OAuth Ready is reconciled from actual canonical Keychain account presence, not stale metadata alone.",
      "New-channel OAuth explicitly requests Google account selection plus offline consent.",
      "One GLOBAL OAuth client secret is used for new channels; historical profile-specific secrets remain supported for compatibility.",
      "Physical Google OAuth acceptance is mandatory before any stable 2.1.14 release.",
      "Stable updater feed remains on 2.1.13."
    ],
    "tag": "v2.1.14-rc.1",
    "publishedAt": "2026-09-19T15:13:13Z",
    "prerelease": true
  },
  {
    "date": "2026-09-19",
    "version": "2.1.13",
    "title": "VYRON 2.1.13",
    "type": "PATCH",
    "highlights": [
      "Existing-channel OAuth rebind hotfix.",
      "Re-authorizing an already-known YouTube Channel ID reuses its existing Profile UUID and channel mapping.",
      "GLOBAL OAuth is ready only when both Client ID and canonical Client Secret are present.",
      "Add Channel no longer opens Google when the global client secret is missing."
    ],
    "sections": {
      "features": [
        "Existing-channel OAuth rebind hotfix.",
        "Re-authorizing an already-known YouTube Channel ID reuses its existing Profile UUID and channel mapping."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "GLOBAL OAuth is ready only when both Client ID and canonical Client Secret are present.",
        "Add Channel no longer opens Google when the global client secret is missing.",
        "After a fresh Google consent, the connect path never falls back to legacy Keychain migration.",
        "credentials.json is a one-time global VYRON setup, not a per-channel requirement.",
        "macOS Keychain remains non-interactive."
      ],
      "technical": [
        "Existing OAuth profiles now expose a direct Reconnect action with explicit browser selection.",
        "Built directly on VYRON 2.1.12 stable after physical Mac evidence."
      ]
    },
    "technicalItems": [
      "Existing OAuth profiles now expose a direct Reconnect action with explicit browser selection.",
      "Built directly on VYRON 2.1.12 stable after physical Mac evidence."
    ],
    "tag": "v2.1.13",
    "publishedAt": "2026-09-19T14:11:13Z",
    "prerelease": false
  },
  {
    "date": "2026-09-19",
    "version": "2.1.12",
    "title": "VYRON 2.1.12",
    "type": "PATCH",
    "highlights": [
      "Browser-first OAuth recovery hotfix.",
      "Restores the existing-profile recovery flow: choose the browser, then choose the correct Google/YouTube account.",
      "Existing Profile UUID and expected YouTube Channel ID remain the identity contract.",
      "Historical profile client_id no longer blocks reconnect when the current VYRON OAuth Client is configured."
    ],
    "sections": {
      "features": [
        "Browser-first OAuth recovery hotfix.",
        "Restores the existing-profile recovery flow: choose the browser, then choose the correct Google/YouTube account.",
        "Existing Profile UUID and expected YouTube Channel ID remain the identity contract."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Historical profile client_id no longer blocks reconnect when the current VYRON OAuth Client is configured.",
        "OAuth client_id and client_secret always migrate as one exact pair; wrong-secret cross-use remains blocked in normal refresh paths.",
        "macOS Keychain remains non-interactive and legacy secrets are not read automatically."
      ],
      "technical": [
        "Profile-specific refresh_token and client_secret are written only after successful channel identity validation.",
        "Built directly on VYRON 2.1.11 stable source after physical Mac evidence from the recovery UI."
      ]
    },
    "technicalItems": [
      "Profile-specific refresh_token and client_secret are written only after successful channel identity validation.",
      "Built directly on VYRON 2.1.11 stable source after physical Mac evidence from the recovery UI."
    ],
    "tag": "v2.1.12",
    "publishedAt": "2026-09-19T13:43:47Z",
    "prerelease": false
  },
  {
    "date": "2026-09-19",
    "version": "2.1.11",
    "title": "VYRON 2.1.11",
    "type": "PATCH",
    "highlights": [
      "OAuth client secret continuity hotfix.",
      "Profile UUID and YouTube channel mappings are preserved.",
      "Fixed reconnect failure \"client_secret is missing\" after successful Google authorization callback.",
      "Client secret is resolved for the exact existing OAuth profile/client before the browser is opened."
    ],
    "sections": {
      "features": [
        "OAuth client secret continuity hotfix.",
        "Profile UUID and YouTube channel mappings are preserved."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Fixed reconnect failure \"client_secret is missing\" after successful Google authorization callback.",
        "Client secret is resolved for the exact existing OAuth profile/client before the browser is opened.",
        "Multiple OAuth client IDs are supported without cross-client secret reuse.",
        "Refresh token and client secret survive ordinary application updates.",
        "macOS Keychain remains non-interactive; legacy Keychain secrets are never read automatically."
      ],
      "technical": [
        "Profile-specific client secrets are stored only in canonical V2 Keychain as oauth.<profile_uuid>.client_secret.",
        "Built directly on VYRON 2.1.10 stable source."
      ]
    },
    "technicalItems": [
      "Profile-specific client secrets are stored only in canonical V2 Keychain as oauth.<profile_uuid>.client_secret.",
      "Built directly on VYRON 2.1.10 stable source."
    ],
    "tag": "v2.1.11",
    "publishedAt": "2026-09-19T13:10:55Z",
    "prerelease": false
  },
  {
    "date": "2026-09-19",
    "version": "2.1.10",
    "title": "VYRON 2.1.10",
    "type": "PATCH",
    "highlights": [
      "OAuth status truth + credential continuity hotfix.",
      "CONNECTED is based on authoritative canonical V2 validation state.",
      "Settings no longer treats Keychain account presence or NOT_RUN as CONNECTED.",
      "Legacy-only profiles are shown as RECONNECT REQUIRED without reading legacy secrets."
    ],
    "sections": {
      "features": [
        "OAuth status truth + credential continuity hotfix.",
        "CONNECTED is based on authoritative canonical V2 validation state."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Settings no longer treats Keychain account presence or NOT_RUN as CONNECTED.",
        "Legacy-only profiles are shown as RECONNECT REQUIRED without reading legacy secrets.",
        "Canonical credentials continue to use com.scaleup.vyron.security.v2 and oauth.<profile_uuid>.refresh_token.",
        "Credential schema v2 is independent from the app version; normal updates preserve Profile UUID and YouTube channel mapping.",
        "macOS Keychain access remains non-interactive; refresh tokens remain outside plaintext app metadata."
      ],
      "technical": [
        "Built directly on VYRON 2.1.9 stable source."
      ]
    },
    "technicalItems": [
      "Built directly on VYRON 2.1.9 stable source."
    ],
    "tag": "v2.1.10",
    "publishedAt": "2026-09-19T12:34:36Z",
    "prerelease": false
  },
  {
    "date": "2026-09-19",
    "version": "2.1.9",
    "title": "VYRON 2.1.9",
    "type": "PATCH",
    "highlights": [
      "YouTube inventory and scheduling improvements from the 2.1.9 RC line are included.",
      "Release authorization: owner override.",
      "Canonical credentials use com.scaleup.vyron.security.v2.",
      "Keychain diagnostics is passive and does not perform secret read/write/delete roundtrips."
    ],
    "sections": {
      "features": [
        "YouTube inventory and scheduling improvements from the 2.1.9 RC line are included.",
        "Release authorization: owner override."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Canonical credentials use com.scaleup.vyron.security.v2.",
        "Keychain diagnostics is passive and does not perform secret read/write/delete roundtrips."
      ],
      "technical": [
        "Secret access uses raw SecItemCopyMatching / SecItemAdd / SecItemUpdate / SecItemDelete with authentication UI skip policy.",
        "Legacy protected OAuth credentials no longer trigger automatic macOS password requests; affected profiles are recovered through explicit Google OAuth reconnect.",
        "Physical RC7 acceptance: not fully completed before release."
      ]
    },
    "technicalItems": [
      "Secret access uses raw SecItemCopyMatching / SecItemAdd / SecItemUpdate / SecItemDelete with authentication UI skip policy.",
      "Legacy protected OAuth credentials no longer trigger automatic macOS password requests; affected profiles are recovered through explicit Google OAuth reconnect.",
      "Physical RC7 acceptance: not fully completed before release."
    ],
    "tag": "v2.1.9",
    "publishedAt": "2026-09-19T05:12:42Z",
    "prerelease": false
  },
  {
    "date": "2026-09-19",
    "version": "2.1.9-rc.7",
    "title": "2.1.9 RC7",
    "type": "RC",
    "highlights": [
      "RC7 fix:",
      "legacy/canonical metadata enumeration uses kSecUseAuthenticationUISkip;",
      "no legacy generic-password wrappers remain in production source.",
      "RC6 YouTube inventory/schedule behavior is preserved."
    ],
    "sections": {
      "features": [
        "RC7 fix:",
        "legacy/canonical metadata enumeration uses kSecUseAuthenticationUISkip;",
        "no legacy generic-password wrappers remain in production source.",
        "RC6 YouTube inventory/schedule behavior is preserved."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "deprecated global SecKeychain no-UI guard remains only as defense in depth;",
        "Keychain diagnostics is passive and performs zero secret reads/writes/deletes;"
      ],
      "technical": [
        "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
        "Physical RC6 failure root cause:",
        "RC6 relied on SecKeychainSetUserInteractionAllowed(false), but password operations use the modern SecItem API;",
        "security-framework get_generic_password calls SecItemCopyMatching with kSecReturnData but without kSecUseAuthenticationUISkip;",
        "ItemSearchOptions only suppresses authentication UI when skip_authenticated_items(true) is explicitly enabled.",
        "secret read uses raw SecItemCopyMatching with kSecUseAuthenticationUISkip;",
        "secret update/delete use SecItemUpdate/SecItemDelete with the same per-query FAIL policy;",
        "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
      ]
    },
    "technicalItems": [
      "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
      "Physical RC6 failure root cause:",
      "RC6 relied on SecKeychainSetUserInteractionAllowed(false), but password operations use the modern SecItem API;",
      "security-framework get_generic_password calls SecItemCopyMatching with kSecReturnData but without kSecUseAuthenticationUISkip;",
      "ItemSearchOptions only suppresses authentication UI when skip_authenticated_items(true) is explicitly enabled.",
      "secret read uses raw SecItemCopyMatching with kSecUseAuthenticationUISkip;",
      "secret update/delete use SecItemUpdate/SecItemDelete with the same per-query FAIL policy;",
      "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
    ],
    "tag": "v2.1.9-rc.7",
    "publishedAt": "2026-09-19T04:24:21Z",
    "prerelease": true
  },
  {
    "date": "2026-09-19",
    "version": "2.1.9-rc.6",
    "title": "2.1.9 RC6",
    "type": "RC",
    "highlights": [
      "RC6 security behavior:",
      "legacy com.scaleup.vyron.security is metadata/presence only;",
      "RC4/RC5 YouTube full-inventory and schedule behavior is preserved.",
      "every native Keychain operation is executed with macOS Keychain user interaction disabled;"
    ],
    "sections": {
      "features": [
        "RC6 security behavior:",
        "legacy com.scaleup.vyron.security is metadata/presence only;",
        "RC4/RC5 YouTube full-inventory and schedule behavior is preserved."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "every native Keychain operation is executed with macOS Keychain user interaction disabled;",
        "normal production code has zero callers of legacy secret reads;",
        "refresh tokens and API keys use com.scaleup.vyron.security.v2;",
        "unavailable legacy credentials return LEGACY_RECONNECT_REQUIRED instead of requesting the Mac/login Keychain password;",
        "Google reconnect preserves the existing OAuth profile UUID;",
        "YouTube inventory no longer auto-migrates legacy refresh tokens;",
        "passive profile/navigation paths do not hydrate secret values;",
        "runtime diagnostics expose blocked interaction and reconnect counters without secret values."
      ],
      "technical": [
        "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
        "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
      ]
    },
    "technicalItems": [
      "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
      "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
    ],
    "tag": "v2.1.9-rc.6",
    "publishedAt": "2026-09-19T03:50:33Z",
    "prerelease": true
  },
  {
    "date": "2026-09-19",
    "version": "2.1.9-rc.5",
    "title": "2.1.9 RC5",
    "type": "RC",
    "highlights": [
      "Keychain changes only:",
      "removes RC4 runtime ACL/owner/permission rebinding;",
      "leaves legacy com.scaleup.vyron.security items untouched;",
      "creates clean canonical com.scaleup.vyron.security.v2 storage;"
    ],
    "sections": {
      "features": [
        "Keychain changes only:",
        "removes RC4 runtime ACL/owner/permission rebinding;",
        "leaves legacy com.scaleup.vyron.security items untouched;",
        "creates clean canonical com.scaleup.vyron.security.v2 storage;",
        "migration checkpoints are written per profile.",
        "RC4 YouTube full-inventory implementation is preserved."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "stores access tokens in process memory only;",
        "stores one global canonical Google client secret when actually required;"
      ],
      "technical": [
        "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
        "migrates only one profile refresh token on explicit Sync;",
        "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
      ]
    },
    "technicalItems": [
      "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
      "migrates only one profile refresh token on explicit Sync;",
      "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
    ],
    "tag": "v2.1.9-rc.5",
    "publishedAt": "2026-09-19T02:59:56Z",
    "prerelease": true
  },
  {
    "date": "2026-09-18",
    "version": "2.1.9-rc.4",
    "title": "2.1.9 RC4",
    "type": "RC",
    "highlights": [
      "Removes search.list from full channel inventory sync.",
      "Exhausts uploads playlist pagination and hydrates video IDs in videos.list batches of 50.",
      "Keeps selection separate from the authoritative inventory baseline.",
      "Partial sync never overwrites the last complete baseline or claims factual zero scheduled videos."
    ],
    "sections": {
      "features": [
        "Removes search.list from full channel inventory sync.",
        "Exhausts uploads playlist pagination and hydrates video IDs in videos.list batches of 50.",
        "Keeps selection separate from the authoritative inventory baseline.",
        "Partial sync never overwrites the last complete baseline or claims factual zero scheduled videos."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Adds lazy one-time ACL rebinding for legacy VYRON OAuth Keychain items.",
        "Keeps secrets in macOS Keychain and session memory only."
      ],
      "technical": [
        "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
        "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
      ]
    },
    "technicalItems": [
      "Internal/personal macOS RC. Stable feed remains on 2.1.8.",
      "Physical acceptance on the same Mac is mandatory before stable 2.1.9."
    ],
    "tag": "v2.1.9-rc.4",
    "publishedAt": "2026-09-18T17:11:02Z",
    "prerelease": true
  },
  {
    "date": "2026-09-18",
    "version": "2.1.9-rc.3",
    "title": "2.1.9 RC3",
    "type": "RC",
    "highlights": [
      "Purpose:",
      "preserve macOS Keychain security;",
      "keep Keychain service com.scaleup.vyron.security unchanged;"
    ],
    "sections": {
      "features": [
        "Purpose:"
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "preserve macOS Keychain security;",
        "keep Keychain service com.scaleup.vyron.security unchanged;"
      ],
      "technical": [
        "Internal/personal macOS RC only. Not Apple Developer ID signed and not notarized.",
        "Stable updater feed remains on VYRON 2.1.8.",
        "replace ad-hoc signing with one persistent self-signed Code Signing identity;",
        "verify stable Designated Requirement across different builds.",
        "Physical Keychain and Schedule acceptance on the user's existing Mac is mandatory before stable 2.1.9."
      ]
    },
    "technicalItems": [
      "Internal/personal macOS RC only. Not Apple Developer ID signed and not notarized.",
      "Stable updater feed remains on VYRON 2.1.8.",
      "replace ad-hoc signing with one persistent self-signed Code Signing identity;",
      "verify stable Designated Requirement across different builds.",
      "Physical Keychain and Schedule acceptance on the user's existing Mac is mandatory before stable 2.1.9."
    ],
    "tag": "v2.1.9-rc.3",
    "publishedAt": "2026-09-18T16:30:06Z",
    "prerelease": true
  },
  {
    "date": "2026-09-18",
    "version": "2.1.9-rc.2",
    "title": "2.1.9 RC2",
    "type": "RC",
    "highlights": [
      "Uses the confirmed full YouTube baseline for future schedule continuation, not the current selection.",
      "Distinguishes incomplete schedule sync from a factual zero-future result.",
      "Reuses OAuth secret material from process memory after the first required secure read.",
      "Avoids rewriting unchanged refresh/client secrets during normal YouTube token validation."
    ],
    "sections": {
      "features": [
        "Uses the confirmed full YouTube baseline for future schedule continuation, not the current selection.",
        "Distinguishes incomplete schedule sync from a factual zero-future result."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Reuses OAuth secret material from process memory after the first required secure read.",
        "Avoids rewriting unchanged refresh/client secrets during normal YouTube token validation."
      ],
      "technical": [
        "RC only. Stable updater feed remains on 2.1.8.",
        "Physical Mac acceptance for Keychain and Schedule is mandatory before stable 2.1.9."
      ]
    },
    "technicalItems": [
      "RC only. Stable updater feed remains on 2.1.8.",
      "Physical Mac acceptance for Keychain and Schedule is mandatory before stable 2.1.9."
    ],
    "tag": "v2.1.9-rc.2",
    "publishedAt": "2026-09-18T00:52:54Z",
    "prerelease": true
  },
  {
    "date": "2026-09-17",
    "version": "2.1.9-rc.1",
    "title": "VYRON 2.1.9-rc.1",
    "type": "RC",
    "highlights": [
      "This candidate fixes malformed legacy persisted Command Center inputs and adds a visible redacted renderer Error Boundary."
    ],
    "sections": {
      "features": [
        "This candidate fixes malformed legacy persisted Command Center inputs and adds a visible redacted renderer Error Boundary."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": [
        "RC only. Stable updater feed remains on 2.1.8.",
        "Physical Mac acceptance is mandatory before stable 2.1.9."
      ]
    },
    "technicalItems": [
      "RC only. Stable updater feed remains on 2.1.8.",
      "Physical Mac acceptance is mandatory before stable 2.1.9."
    ],
    "tag": "v2.1.9-rc.1",
    "publishedAt": "2026-09-17T16:32:51Z",
    "prerelease": true
  },
  {
    "date": "2026-09-17",
    "version": "2.1.8",
    "title": "VYRON 2.1.8",
    "type": "PATCH",
    "highlights": [
      "Восстановлен правильный render path Command Center.",
      "Добавлена безопасная нормализация legacy Channel Runway state.",
      "Исправлен чёрный экран Командного центра.",
      "Исправлен crash при отсутствующем channelName."
    ],
    "sections": {
      "features": [
        "Восстановлен правильный render path Command Center.",
        "Добавлена безопасная нормализация legacy Channel Runway state."
      ],
      "fixes": [
        "Исправлен чёрный экран Командного центра.",
        "Исправлен crash при отсутствующем channelName.",
        "Regression fixes only."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v2.1.8",
    "publishedAt": "2026-09-17T15:04:56Z",
    "prerelease": false
  },
  {
    "date": "2026-09-17",
    "version": "2.1.7",
    "title": "VYRON 2.1.7",
    "type": "PATCH",
    "highlights": [],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v2.1.7",
    "publishedAt": "2026-09-17T12:33:06Z",
    "prerelease": false
  },
  {
    "date": "2026-09-17",
    "version": "2.1.6",
    "title": "VYRON 2.1.6",
    "type": "PATCH",
    "highlights": [
      "Ready Video Inventory по каналам и конкретным MP4.",
      "Live upload progress: bytes, speed, elapsed, ETA и ожидаемое время завершения.",
      "Global Upload Center и глобальный индикатор загрузки.",
      "Исправления регрессий и контрактов 2.1.5 → 2.1.6."
    ],
    "sections": {
      "features": [
        "Ready Video Inventory по каналам и конкретным MP4.",
        "Live upload progress: bytes, speed, elapsed, ETA и ожидаемое время завершения.",
        "Global Upload Center и глобальный индикатор загрузки."
      ],
      "fixes": [
        "Исправления регрессий и контрактов 2.1.5 → 2.1.6."
      ],
      "interface": [],
      "reliability": [],
      "security": [
        "Multi-channel upload queue с изоляцией каналов/OAuth."
      ],
      "technical": [
        "Reconciliation зависших UPLOADING/RENDERING и factual updater blocker."
      ]
    },
    "technicalItems": [
      "Reconciliation зависших UPLOADING/RENDERING и factual updater blocker."
    ],
    "tag": "v2.1.6",
    "publishedAt": "2026-09-17T11:21:59Z",
    "prerelease": false
  },
  {
    "date": "2026-09-14",
    "version": "2.1.5",
    "title": "VYRON 2.1.5",
    "type": "PATCH",
    "highlights": [
      "Global YouTube channel switcher",
      "Channel search",
      "Recent channels",
      "Cross-tab active-channel workflow"
    ],
    "sections": {
      "features": [
        "Global YouTube channel switcher",
        "Channel search",
        "Recent channels",
        "Cross-tab active-channel workflow",
        "Metadata Draft Manager",
        "Unsaved / Saved / Restored / Completed draft states",
        "Channel-scoped draft controls",
        "Multi-channel draft isolation"
      ],
      "fixes": [
        "Reliability fixes"
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v2.1.5",
    "publishedAt": "2026-09-14T12:28:15Z",
    "prerelease": false
  },
  {
    "date": "2026-09-14",
    "version": "2.1.4",
    "title": "VYRON 2.1.4",
    "type": "PATCH",
    "highlights": [
      "Unified active YouTube channel context across Metadata and Schedule.",
      "Schedule selector supports all connected channels with isolated sync/apply state.",
      "Channel-scoped Metadata draft autosave/restore across navigation and remount.",
      "Full frontend/Rust regression and production ARM64 packaging gates passed."
    ],
    "sections": {
      "features": [
        "Unified active YouTube channel context across Metadata and Schedule.",
        "Schedule selector supports all connected channels with isolated sync/apply state.",
        "Channel-scoped Metadata draft autosave/restore across navigation and remount.",
        "Full frontend/Rust regression and production ARM64 packaging gates passed."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Persistent Metadata operation history based on actual operation facts, with no OAuth/Keychain secrets."
      ],
      "technical": [
        "Stable release from the verified final 2.1.4 source freeze.",
        "Updater payload signature verified against the unchanged embedded updater public key."
      ]
    },
    "technicalItems": [
      "Stable release from the verified final 2.1.4 source freeze.",
      "Updater payload signature verified against the unchanged embedded updater public key."
    ],
    "tag": "v2.1.4",
    "publishedAt": "2026-09-14T01:08:25Z",
    "prerelease": false
  },
  {
    "date": "2026-09-12",
    "version": "2.1.3",
    "title": "Updater Hotfix",
    "type": "PATCH",
    "highlights": [
      "Critical updater-only hotfix. No Production, Shorts, Metadata, OAuth, Keychain, YouTube upload, quota, schedule, Storage Lifecycle or ENDLUME changes.",
      "Fixes the stranded same-version 2.1.2 update path, uses the canonical VYRON feed first, preserves the GitHub release manifest fallback, and makes updater check/download/signature/install failures visible instead of silently swallowing them."
    ],
    "sections": {
      "features": [],
      "fixes": [
        "Critical updater-only hotfix. No Production, Shorts, Metadata, OAuth, Keychain, YouTube upload, quota, schedule, Storage Lifecycle or ENDLUME changes.",
        "Fixes the stranded same-version 2.1.2 update path, uses the canonical VYRON feed first, preserves the GitHub release manifest fallback, and makes updater check/download/signature/install failures visible instead of silently swallowing them."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v2.1.3",
    "publishedAt": "2026-09-12T17:22:19Z",
    "prerelease": false
  },
  {
    "date": "2026-09-10",
    "version": "2.1.2",
    "title": "VYRON 2.1.2",
    "type": "PATCH",
    "highlights": [
      "Signing uses the existing ad-hoc production mechanism; Apple notarization is not claimed."
    ],
    "sections": {
      "features": [
        "Signing uses the existing ad-hoc production mechanism; Apple notarization is not claimed."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": [
        "Stable Apple Silicon release from the frozen, fully-regressed VYRON 2.1.2 production source. Includes the validated OAuth/Keychain recovery stack, YouTube runtime/scheduling repair, schedule continuation, dynamic per-project upload quota, persistent upload lifecycle/history, duplicate SHA-256 guard, protected cleanup/system Trash, and Shorts MP4/MOV support."
      ]
    },
    "technicalItems": [
      "Stable Apple Silicon release from the frozen, fully-regressed VYRON 2.1.2 production source. Includes the validated OAuth/Keychain recovery stack, YouTube runtime/scheduling repair, schedule continuation, dynamic per-project upload quota, persistent upload lifecycle/history, duplicate SHA-256 guard, protected cleanup/system Trash, and Shorts MP4/MOV support."
    ],
    "tag": "v2.1.2",
    "publishedAt": "2026-09-10T17:39:32Z",
    "prerelease": false
  },
  {
    "date": "2026-09-10",
    "version": "2.1.1",
    "title": "YouTube Runtime + OAuth/Keychain Recovery",
    "type": "PATCH",
    "highlights": [
      "Корректный MOV MIME video/quicktime и сохранённый MP4/MOV Shorts Factory с real FFmpeg regression.",
      "OAuth/Keychain recovery для legacy 2.0.8/2.0.9: fallback migration, idempotency и сохранение существующего refresh_token, если Google не вернул новый.",
      "Один revoked/missing credential изолируется и не повреждает остальные профили/каналы.",
      "Добавлена channel-ID validation и явная классификация invalid_grant/missing-token/Keychain failures."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Корректный MOV MIME video/quicktime и сохранённый MP4/MOV Shorts Factory с real FFmpeg regression.",
        "OAuth/Keychain recovery для legacy 2.0.8/2.0.9: fallback migration, idempotency и сохранение существующего refresh_token, если Google не вернул новый.",
        "Один revoked/missing credential изолируется и не повреждает остальные профили/каналы.",
        "Добавлена channel-ID validation и явная классификация invalid_grant/missing-token/Keychain failures.",
        "Global project cleanup остаётся безопасным: готовые renders не удаляются."
      ],
      "technical": [
        "Production repair для YouTube selection/preflight/upload pipeline, Videos.list verification и future-safe publishAt."
      ]
    },
    "technicalItems": [
      "Production repair для YouTube selection/preflight/upload pipeline, Videos.list verification и future-safe publishAt."
    ],
    "tag": "v2.1.1",
    "publishedAt": "2026-09-10T14:39:59Z",
    "prerelease": false
  },
  {
    "date": "2026-09-10",
    "version": "2.1.0",
    "title": "Shorts Factory + Production Repair",
    "type": "MINOR",
    "highlights": [
      "Добавлен Shorts Factory: Long → вертикальные Shorts 1080×1920 с реальным FFmpeg pipeline.",
      "Long и Shorts используют единый future-safe scheduler без коллизий занятых слотов.",
      "Добавлены Content Buffer и Storage Manager с безопасным архивированием без автоматического удаления исходников.",
      "Усилен Error Center: очистка истории не меняет ERROR-задачи на SUCCESS; повторная ошибка снова отображается корректно."
    ],
    "sections": {
      "features": [
        "Добавлен Shorts Factory: Long → вертикальные Shorts 1080×1920 с реальным FFmpeg pipeline.",
        "Long и Shorts используют единый future-safe scheduler без коллизий занятых слотов.",
        "Добавлены Content Buffer и Storage Manager с безопасным архивированием без автоматического удаления исходников.",
        "Усилен Error Center: очистка истории не меняет ERROR-задачи на SUCCESS; повторная ошибка снова отображается корректно.",
        "Batch upload больше не засыпает интерфейс десятками toast: причины сохраняются в Error Center, наружу выводится агрегированное уведомление."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Сохранены Keychain recovery, cleanup, category/playlist, backup, quota и предыдущие production fixes."
      ],
      "technical": [
        "Shorts получили metadata workflow, расписание и синхронизацию реального publishAt с YouTube.",
        "Релиз публикуется только из exact signed candidate после полного macOS Apple Silicon gate."
      ]
    },
    "technicalItems": [
      "Shorts получили metadata workflow, расписание и синхронизацию реального publishAt с YouTube.",
      "Релиз публикуется только из exact signed candidate после полного macOS Apple Silicon gate."
    ],
    "tag": "v2.1.0",
    "publishedAt": "2026-09-10T07:24:27Z",
    "prerelease": false
  },
  {
    "date": "2026-09-09",
    "version": "2.0.13",
    "title": "Keychain Recovery",
    "type": "PATCH",
    "highlights": [
      "Исправлено безликое сообщение «VYRON сохранил текущее состояние…» при реальной ошибке macOS Keychain.",
      "Отдельно распознаются: неверный/отклонённый пароль Keychain, отменённый системный запрос и заблокированная интеракция.",
      "После отказа Keychain VYRON не вызывает системный пароль заново при каждом autosave в текущем сеансе.",
      "Локальные проекты, очередь и несекретные настройки продолжают сохраняться даже при временно недоступном Keychain."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Исправлено безликое сообщение «VYRON сохранил текущее состояние…» при реальной ошибке macOS Keychain.",
        "Отдельно распознаются: неверный/отклонённый пароль Keychain, отменённый системный запрос и заблокированная интеракция.",
        "После отказа Keychain VYRON не вызывает системный пароль заново при каждом autosave в текущем сеансе.",
        "Локальные проекты, очередь и несекретные настройки продолжают сохраняться даже при временно недоступном Keychain.",
        "API keys по-прежнему не записываются в state.json; при проблеме защищённого сохранения показывается отдельное предупреждение.",
        "В Настройки → Диагностика добавлена кнопка «Проверить Keychain»: создаётся, читается и удаляется только временная тестовая запись.",
        "Сохранены исправление очистки project assets 2.0.12 и все функции Publisher/Existing Videos/Quota 2.0.11.",
        "Exact candidate опубликован только после полного macOS Apple Silicon gate."
      ],
      "technical": [
        "Добавлены frontend/Rust regression-тесты и настоящий Keychain read/write/delete roundtrip на macOS runner."
      ]
    },
    "technicalItems": [
      "Добавлены frontend/Rust regression-тесты и настоящий Keychain read/write/delete roundtrip на macOS runner."
    ],
    "tag": "v2.0.13",
    "publishedAt": "2026-09-09T14:57:24Z",
    "prerelease": false
  },
  {
    "date": "2026-09-09",
    "version": "2.0.12",
    "title": "Cleanup Command Hotfix",
    "type": "PATCH",
    "highlights": [
      "Исправлена ошибка Command cleanup_completed_production_assets not found.",
      "Tauri-команда очистки project assets теперь зарегистрирована в generate_handler и доступна из UI.",
      "Добавлен regression-тест полной цепочки UI invoke → Rust backend → Tauri command registration.",
      "Сохранены два подтверждения перед массовой очисткой."
    ],
    "sections": {
      "features": [],
      "fixes": [
        "Исправлена ошибка Command cleanup_completed_production_assets not found.",
        "Tauri-команда очистки project assets теперь зарегистрирована в generate_handler и доступна из UI.",
        "Добавлен regression-тест полной цепочки UI invoke → Rust backend → Tauri command registration.",
        "Сохранены два подтверждения перед массовой очисткой.",
        "Очистка по-прежнему работает только для Completed-проектов с существующим готовым MP4 и не удаляет Rendered/*.mp4.",
        "Все функции VYRON 2.0.11 сохранены; обновлена история изменений в Настройки → Обновления.",
        "До публикации exact candidate прошёл полный macOS Apple Silicon gate."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v2.0.12",
    "publishedAt": "2026-09-09T14:10:55Z",
    "prerelease": false
  },
  {
    "date": "2026-09-09",
    "version": "2.0.11",
    "title": "Production Completion",
    "type": "PATCH",
    "highlights": [
      "Resumable upload использует 32 MiB chunks; новая сессия не делает лишний стартовый status-probe; recovery сохранён.",
      "Quota показывает стоимость партии, plan/fact/delta, Video Uploads и сколько роликов ещё доступно сегодня.",
      "Добавлено изменение Category ID.",
      "Добавлены playlist add/remove с pre-read и обязательной post-write проверкой."
    ],
    "sections": {
      "features": [
        "Resumable upload использует 32 MiB chunks; новая сессия не делает лишний стартовый status-probe; recovery сохранён.",
        "Quota показывает стоимость партии, plan/fact/delta, Video Uploads и сколько роликов ещё доступно сегодня.",
        "Добавлено изменение Category ID.",
        "Добавлены playlist add/remove с pre-read и обязательной post-write проверкой.",
        "Backup берётся owner-authorized videos.list непосредственно перед write.",
        "Undo проверяется YouTube и не запускает скрытый общий sync.",
        "Показаны quota План / Факт / Разница / Осталось.",
        "Verified Apply и account isolation из 2.0.10 сохранены.",
        "Полный macOS Apple Silicon final gate прошёл до публикации этого точного candidate."
      ],
      "fixes": [
        "Исправлен выбор расписания: «Из файла», «Каждый день», «2/2», «3/1», отдельное время и preview дат."
      ],
      "interface": [
        "Добавлена безопасная очистка project assets с двумя подтверждениями: удаляются только копии image/music завершённых проектов, готовые MP4 сохраняются.",
        "Ошибки справа сверху кликабельны и открывают Error Center с реальной историей.",
        "Настройки → Обновления показывают историю изменений по датам для 2.0.9, 2.0.10 и 2.0.11."
      ],
      "reliability": [],
      "security": [],
      "technical": [
        "DATE + PUBLISH TIME корректно объединяются в publishAt.",
        "Перед videos.insert заново берутся title, description, tags и publishAt нужного VIDEO_XXX."
      ]
    },
    "technicalItems": [
      "DATE + PUBLISH TIME корректно объединяются в publishAt.",
      "Перед videos.insert заново берутся title, description, tags и publishAt нужного VIDEO_XXX."
    ],
    "tag": "v2.0.11",
    "publishedAt": "2026-09-09T12:46:18Z",
    "prerelease": false
  },
  {
    "date": "2026-09-09",
    "version": "2.0.10",
    "title": "Verified YouTube Apply",
    "type": "PATCH",
    "highlights": [
      "Несовпадение возвращается как ошибка верификации, а не как ложный зелёный результат.",
      "Сохранены writable-поля snippet/status, включая categoryId и defaultLanguage.",
      "Убран скрытый fallback/retry update внутри Apply.",
      "Исправлена запись метаданных уже загруженных видео: после каждого videos.update выполняется обязательный owner-authorized контрольный videos.list."
    ],
    "sections": {
      "features": [
        "Несовпадение возвращается как ошибка верификации, а не как ложный зелёный результат.",
        "Сохранены writable-поля snippet/status, включая categoryId и defaultLanguage.",
        "Убран скрытый fallback/retry update внутри Apply."
      ],
      "fixes": [
        "Исправлена запись метаданных уже загруженных видео: после каждого videos.update выполняется обязательный owner-authorized контрольный videos.list."
      ],
      "interface": [],
      "reliability": [
        "OAuth, macOS Keychain, updater public key/endpoints, Production, ENDLUME, Publisher, Future Channels, Analytics и пользовательское storage сохранены.",
        "Bundle identifier остаётся studio.channelflow.desktop.",
        "Полный macOS Apple Silicon final gate прошёл успешно перед публикацией этого точного candidate."
      ],
      "security": [
        "Preflight учитывает read + update + обязательный verify-read; скрытых API-вызовов после Apply нет.",
        "Для «Загруженных» добавлены quota reservation и фактический accounting.",
        "Проверка принадлежности видео OAuth-каналу сохранена перед записью."
      ],
      "technical": [
        "Успех показывается только если YouTube подтвердил фактические title, description, tags, publishAt и privacyStatus.",
        "Сборка сделана поверх SHA256-проверенного официального source snapshot VYRON 2.0.9."
      ]
    },
    "technicalItems": [
      "Успех показывается только если YouTube подтвердил фактические title, description, tags, publishAt и privacyStatus.",
      "Сборка сделана поверх SHA256-проверенного официального source snapshot VYRON 2.0.9."
    ],
    "tag": "v2.0.10",
    "publishedAt": "2026-09-09T10:34:46Z",
    "prerelease": false
  },
  {
    "date": "2026-09-06",
    "version": "2.0.9",
    "title": "Security Hardening",
    "type": "PATCH",
    "highlights": [
      "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
      "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert.",
      "DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.",
      "В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных."
    ],
    "sections": {
      "features": [
        "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
        "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert.",
        "DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.",
        "В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных.",
        "Локальный статус READY_UPLOAD отображается как «В ОЧЕРЕДИ».",
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "YouTube OAuth access/refresh tokens and client secrets are stored in macOS Keychain instead of plaintext JSON.",
        "Google client secret, YouTube API key and app API-key settings are moved to Keychain and rehydrated only in runtime memory.",
        "Legacy plaintext credential files migrate safely: JSON is sanitized only after successful Keychain writes; migration failure never silently destroys the old working credentials.",
        "Sensitive state/config files and backups use owner-only permissions on macOS/Unix; legacy state backups are sanitized after successful migration.",
        "Logs and notifications redact bearer tokens, OAuth secrets, Google API-key patterns and OpenAI-style secret patterns.",
        "Production, Downloads, ENDLUME, Publisher, Future Channels and the 2.0.8 Production shortcut are unchanged and protected by the full regression gate.",
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.9 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.9 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.9",
    "publishedAt": "2026-09-06T13:59:07Z",
    "prerelease": false
  },
  {
    "date": "2026-09-06",
    "version": "2.0.8",
    "title": "Production Future Channel Shortcut",
    "type": "PATCH",
    "highlights": [
      "В «Производство → Материалы» рядом с выбором канала добавлена кнопка + Будущий канал.",
      "Название можно ввести вручную; новый локальный канал сразу становится текущим в Production.",
      "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
      "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert."
    ],
    "sections": {
      "features": [
        "В «Производство → Материалы» рядом с выбором канала добавлена кнопка + Будущий канал.",
        "Название можно ввести вручную; новый локальный канал сразу становится текущим в Production.",
        "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
        "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert.",
        "DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.",
        "В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных.",
        "Локальный статус READY_UPLOAD отображается как «В ОЧЕРЕДИ».",
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Существующая логика Future Channels 2.0.7, будущая OAuth-привязка по названию, Downloads, Publisher и ENDLUME не изменялись.",
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.8 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.8 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.8",
    "publishedAt": "2026-09-06T13:14:56Z",
    "prerelease": false
  },
  {
    "date": "2026-09-06",
    "version": "2.0.7",
    "title": "Future Channels",
    "type": "PATCH",
    "highlights": [
      "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
      "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert.",
      "DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.",
      "В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных."
    ],
    "sections": {
      "features": [
        "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
        "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert.",
        "DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.",
        "В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных.",
        "Локальный статус READY_UPLOAD отображается как «В ОЧЕРЕДИ».",
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.7 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.7 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.7",
    "publishedAt": "2026-09-06T12:36:06Z",
    "prerelease": false
  },
  {
    "date": "2026-09-06",
    "version": "2.0.6",
    "title": "Publisher Scheduling & Quota",
    "type": "PATCH",
    "highlights": [
      "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
      "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert.",
      "DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.",
      "В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных."
    ],
    "sections": {
      "features": [
        "Обложки по умолчанию не меняются: при отсутствии выбранных изображений thumbnails.set не вызывается.",
        "Video Uploads показывается отдельным живым счётчиком и обновляется после каждого фактического videos.insert.",
        "DOCX/SEO pack сопоставляется с выбранными видео автоматически и локально, без отдельного API-вызова.",
        "В Publisher добавлены режимы расписания: из файла, каждый день, 2/2 и 3/1; время рассчитывается в Asia/Krasnoyarsk как в Метаданных.",
        "Локальный статус READY_UPLOAD отображается как «В ОЧЕРЕДИ».",
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.6 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Название, описание, теги и publishAt отправляются в первоначальном videos.insert; resumable recovery сохранён.",
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.6 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.6",
    "publishedAt": "2026-09-06T10:29:38Z",
    "prerelease": false
  },
  {
    "date": "2026-09-05",
    "version": "2.0.5",
    "title": "Updater Discovery Fix",
    "type": "PATCH",
    "highlights": [
      "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
      "Добавлен persisted freshness layer для YouTube cache.",
      "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
      "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным."
    ],
    "sections": {
      "features": [
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Исправлен случай, когда установленная 2.0.3 показывала «актуальная версия 2.0.3», хотя новый релиз уже опубликован.",
        "Каждый updater check теперь отправляет Cache-Control: no-cache, no-store, max-age=0 и Pragma: no-cache.",
        "Добавлен основной endpoint через GitHub latest release asset и сохранён raw GitHub endpoint как резервный.",
        "Добавлен regression-контракт на anti-cache updater policy.",
        "Исправление «Выбрать все здесь» из 2.0.4 сохранено без изменений.",
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.5 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.5 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.5",
    "publishedAt": "2026-09-05T08:15:28Z",
    "prerelease": false
  },
  {
    "date": "2026-09-05",
    "version": "2.0.4",
    "title": "Select All Stability Fix",
    "type": "PATCH",
    "highlights": [
      "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
      "Добавлен persisted freshness layer для YouTube cache.",
      "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
      "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным."
    ],
    "sections": {
      "features": [
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Исправлен чёрный экран после «Выбрать все здесь» при массовом выборе YouTube-видео до загрузки DOCX.",
        "Schedule preview теперь корректно работает с выбранными видео, даже если для них ещё нет строк metadata.",
        "Добавлен regression на 99 выбранных видео и 0 DOCX-строк.",
        "Массовый выбор остаётся полностью локальной операцией и не расходует YouTube API quota.",
        "OAuth discovery и browser-free YouTube workflow из 2.0.3 сохранены без изменений.",
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.4 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.4 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.4",
    "publishedAt": "2026-09-05T07:48:48Z",
    "prerelease": false
  },
  {
    "date": "2026-09-05",
    "version": "2.0.3",
    "title": "OAuth Video Discovery",
    "type": "PATCH",
    "highlights": [
      "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
      "Добавлен persisted freshness layer для YouTube cache.",
      "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
      "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным."
    ],
    "sections": {
      "features": [
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Никаких расширений Chrome/Brave/Safari для поиска видео не требуется.",
        "Единственный источник авторизации — уже подключённый OAuth-профиль YouTube в VYRON.",
        "Полная история берётся из uploads playlist с пагинацией; playlistItems запрашиваются с snippet/contentDetails/status.",
        "Свежие owned-видео дополнительно проверяются одним официальным forMine-запросом.",
        "Если videos.list ещё не раскрывает owned resource, VYRON больше не выбрасывает найденную строку uploads playlist из списка.",
        "Браузерный Studio Draft Bridge из основного Metadata workflow удалён.",
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.3 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.3 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.3",
    "publishedAt": "2026-09-05T07:01:46Z",
    "prerelease": false
  },
  {
    "date": "2026-09-05",
    "version": "2.0.2",
    "title": "Studio Draft Bridge",
    "type": "PATCH",
    "highlights": [
      "VYRON видит строки «Черновик / Draft», которые ещё не доступны обычному YouTube Data API.",
      "Данные передаются из видимой YouTube Studio только локально через 127.0.0.1:19470.",
      "Обычный API sync 2.0.1 сохранён отдельно и продолжает использовать uploads playlist без search.list.",
      "Черновики Studio показываются отдельным безопасным блоком и не выдаются за готовые API video resources."
    ],
    "sections": {
      "features": [
        "VYRON видит строки «Черновик / Draft», которые ещё не доступны обычному YouTube Data API.",
        "Данные передаются из видимой YouTube Studio только локально через 127.0.0.1:19470.",
        "Обычный API sync 2.0.1 сохранён отдельно и продолжает использовать uploads playlist без search.list.",
        "Черновики Studio показываются отдельным безопасным блоком и не выдаются за готовые API video resources.",
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Cookies, OAuth-токены и скрытые YouTube Studio API не читаются и не используются.",
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.2 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.2 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.2",
    "publishedAt": "2026-09-05T06:09:12Z",
    "prerelease": false
  },
  {
    "date": "2026-09-04",
    "version": "2.0.1",
    "title": "YouTube Sync Hotfix",
    "type": "PATCH",
    "highlights": [
      "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
      "Добавлен persisted freshness layer для YouTube cache.",
      "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
      "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным."
    ],
    "sections": {
      "features": [
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [
        "Исправлен quota rollover и зависший provider guard.",
        "Ручная «Синхронизировать» при доступном локальном ledger делает один реальный API probe.",
        "PRIVATE остаётся на дешёвом uploads playlist pipeline без search.list."
      ],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Старые reservations предыдущего Pacific-day не блокируют новое окно.",
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.1 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Старые reservations предыдущего Pacific-day не блокируют новое окно.",
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.1 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.1",
    "publishedAt": "2026-09-04T16:49:17Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "2.0.0",
    "title": "Final",
    "type": "MAJOR",
    "highlights": [
      "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
      "Добавлен persisted freshness layer для YouTube cache.",
      "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
      "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным."
    ],
    "sections": {
      "features": [
        "Google/network/Tauri ошибки переводятся в понятные пользовательские сообщения.",
        "Добавлен persisted freshness layer для YouTube cache.",
        "Analytics сравнивает последние 7 дней с предыдущими 7 и показывает «Что изменилось / что делать».",
        "Views, retention, CTR, RPM и лучшие видео анализируются только по сохранённым реальным данным.",
        "Главная показывает cached Views/Revenue/trend.",
        "OFF по умолчанию.",
        "Проверяются metadata, schedule, duplicate fingerprint и quota.",
        "Максимум одно подготовленное видео на канал за цикл.",
        "Незавершённая resumable session всегда восстанавливается раньше новой загрузки.",
        "Настройка автопубликации сохраняется между запусками."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Рабочее пространство публикации сохраняет выбранные VIDEO, DOCX metadata, thumbnails, batch settings и активный канал.",
        "YouTube resumable upload session и offset сохраняются между перезапусками VYRON.",
        "После обрыва или закрытия приложения загрузку можно продолжить без второго videos.insert.",
        "Защита блокирует recovery, если исходный MP4 исчез или изменился.",
        "Bundle identifier, technical product identity, updater endpoints/public key, лицензия и пользовательское storage сохранены."
      ],
      "security": [
        "Attention Center учитывает незавершённые uploads, quota risk, channel upload limit, OAuth, Safe Limit, Production и ENDLUME.",
        "Для включения обязательны Safe Mode, OAuth и пользовательский 24h upload limit."
      ],
      "technical": [
        "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
        "2.0.0 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
      ]
    },
    "technicalItems": [
      "Opportunity Radar конкурентов использует view velocity, cadence, similarity и повторяющиеся темы заголовков без выдуманных revenue/RPM/CTR.",
      "2.0.0 собран поверх SHA-проверенного exact source опубликованной 1.2.0."
    ],
    "tag": "v2.0.0",
    "publishedAt": "2026-09-03T17:03:31Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.2.0",
    "title": "Full Master",
    "type": "MINOR",
    "highlights": [
      "Production упрощён до: Обзор → Материалы → Сборка проектов → ENDLUME.",
      "Внутренние состояния рендера сохранены, отдельные пользовательские вкладки «Рендер» и «Публикация» удалены из Production.",
      "Существующий selective ENDLUME handoff сохранён: можно отправлять только выбранные проекты, включая 1 из большой партии.",
      "Production, локальный сбор файлов, preview и ENDLUME handoff не используют YouTube Data API."
    ],
    "sections": {
      "features": [
        "Production упрощён до: Обзор → Материалы → Сборка проектов → ENDLUME.",
        "Внутренние состояния рендера сохранены, отдельные пользовательские вкладки «Рендер» и «Публикация» удалены из Production.",
        "Существующий selective ENDLUME handoff сохранён: можно отправлять только выбранные проекты, включая 1 из большой партии.",
        "Production, локальный сбор файлов, preview и ENDLUME handoff не используют YouTube Data API.",
        "Выбор канала и конкретных готовых MP4 перед загрузкой.",
        "TEST ONE перед массовой публикацией.",
        "DOCX metadata загружается непосредственно в Publish Center; Word может содержать больше записей, чем выбрано видео.",
        "Production Plan не ограничивает DOCX metadata.",
        "Пакетное сопоставление thumbnails и реальная установка через thumbnails.set.",
        "Локальный fingerprint защищает от случайной повторной загрузки одного MP4.",
        "Для канала действует один активный upload batch lock.",
        "Safe Mode включён по умолчанию.",
        "Пользователь может задать собственный безопасный лимит загрузок за rolling 24 часа; VYRON не выдумывает неизвестный точный лимит YouTube.",
        "При фактическом daily-upload-limit дальнейшие загрузки останавливаются.",
        "Перед Metadata Apply и Publish VYRON показывает план операции без обращения к YouTube: текущий доступный budget, стоимость операции, остаток после неё, method calls, время сброса и countdown.",
        "Для batch используется reservation; фактический расход записывается по operationId из реально предпринятых API method calls."
      ],
      "fixes": [],
      "interface": [
        "Видимый бренд приложения: VYRON YT PEISOV.",
        "Главная перестроена в операционный центр без лишнего BI-шума.",
        "Верхняя панель показывает дату с годом, локальный YouTube quota ledger, время следующего сброса и живой countdown.",
        "Countdown рассчитывается локально по 00:00 America/Los_Angeles и не выполняет YouTube API requests."
      ],
      "reliability": [
        "Отдельные разделы «Лицензия» и «О программе».",
        "Существующая бессрочная owner license сохраняется.",
        "Bundle identifier, технический productName, updater endpoints/public key, OAuth/storage/recovery и пользовательские данные сохранены от VYRON 1.1.0."
      ],
      "security": [],
      "technical": [
        "Metadata title/description/tags/schedule продолжают использовать единый videos.update на видео в существующем backend пути, когда это допускает операция.",
        "Runtime version/build metadata отображаются в приложении."
      ]
    },
    "technicalItems": [
      "Metadata title/description/tags/schedule продолжают использовать единый videos.update на видео в существующем backend пути, когда это допускает операция.",
      "Runtime version/build metadata отображаются в приложении."
    ],
    "tag": "v1.2.0",
    "publishedAt": "2026-09-03T15:07:40Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.1.0",
    "title": "Exact YouTube Quota + Selective ENDLUME Handoff",
    "type": "MINOR",
    "highlights": [
      "Учёт YouTube API переведён с приблизительной оценки команд VYRON на фактически предпринятые API method calls.",
      "videos.update учитывается как 50 units в основном Data API budget.",
      "videos.insert учитывается отдельно в Video Uploads bucket и не смешивается с основным дневным write-budget.",
      "Неуспешный фактически отправленный API request также учитывается."
    ],
    "sections": {
      "features": [
        "Учёт YouTube API переведён с приблизительной оценки команд VYRON на фактически предпринятые API method calls.",
        "videos.update учитывается как 50 units в основном Data API budget.",
        "videos.insert учитывается отдельно в Video Uploads bucket и не смешивается с основным дневным write-budget.",
        "Неуспешный фактически отправленный API request также учитывается.",
        "Добавлены локальные reservations перед пакетными операциями.",
        "Расчёт сброса quota привязан к 00:00 America/Los_Angeles и корректно учитывает PST/PDT.",
        "Metadata + schedule по-прежнему объединяются в один videos.update, когда это допускает операция.",
        "Можно выбрать и отправить в ENDLUME только нужные проекты из batch: 1, 5, 30, 1000 и т.д.",
        "Для выбранных проектов создаётся immutable subset manifest; исходный batch.json и остальные проекты не изменяются.",
        "Добавлена проверка только выбранных проектов перед handoff.",
        "Добавлен локальный per-project handoff ledger и статус SENT.",
        "Повторная отправка уже переданного проекта требует явного подтверждения.",
        "VYRON продолжает отслеживать результат ENDLUME в том числе при отдельном Production root на внешнем диске.",
        "После завершения рендера локальный job переводится в READY_UPLOAD, с уведомлением «Видео готово»."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Bundle identifier, updater endpoints/public key, лицензия, storage core, Downloads collector и существующие пользовательские данные не менялись.",
        "Production/ENDLUME не выполняют YouTube API calls."
      ],
      "security": [],
      "technical": [
        "Countdown работает локально через один shared timer и не создаёт YouTube polling.",
        "VYRON 1.1.0 собран поверх точного опубликованного source VYRON 1.0.15 с проверкой SHA256."
      ]
    },
    "technicalItems": [
      "Countdown работает локально через один shared timer и не создаёт YouTube polling.",
      "VYRON 1.1.0 собран поверх точного опубликованного source VYRON 1.0.15 с проверкой SHA256."
    ],
    "tag": "v1.1.0",
    "publishedAt": "2026-09-03T14:00:15Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.15",
    "title": "ENDLUME Image Validation Hotfix",
    "type": "PATCH",
    "highlights": [
      "Исправлена ложная ошибка Production Manager: изображений: 2, должно быть 1.",
      "Удалено ограничение VYRON «в проекте должно быть ровно одно изображение».",
      "Теперь VYRON проверяет только наличие хотя бы одного пригодного изображения; 1, 2 и больше изображений допустимы.",
      "Сначала проверяется точный image_path из batch manifest. Это исключает ложный повторный подсчёт изображения в обычном VYRON batch."
    ],
    "sections": {
      "features": [],
      "fixes": [
        "Исправлена ложная ошибка Production Manager: изображений: 2, должно быть 1.",
        "Удалено ограничение VYRON «в проекте должно быть ровно одно изображение».",
        "Теперь VYRON проверяет только наличие хотя бы одного пригодного изображения; 1, 2 и больше изображений допустимы.",
        "Сначала проверяется точный image_path из batch manifest. Это исключает ложный повторный подсчёт изображения в обычном VYRON batch.",
        "Если manifest image вручную перемещён/переименован, VYRON допускает другое непустое поддерживаемое изображение в папке проекта.",
        "Скрытые файлы вроде .phantom.png не считаются fallback-изображением.",
        "Если пригодных изображений действительно нет, проект по-прежнему корректно блокируется с ошибкой изображение не найдено.",
        "Multi-image transitions и выбор последовательности изображений остаются ответственностью ENDLUME.",
        "Уже созданные batch пересобирать не требуется: после обновления их можно повторно проверить и передать в ENDLUME."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": [
        "Builder VYRON, Downloads Collector, Music distribution, ENDLUME bridge, Metadata, YouTube/OAuth, расписание 3/1, DOCX и A-Z dropdowns не переписывались."
      ]
    },
    "technicalItems": [
      "Builder VYRON, Downloads Collector, Music distribution, ENDLUME bridge, Metadata, YouTube/OAuth, расписание 3/1, DOCX и A-Z dropdowns не переписывались."
    ],
    "tag": "v1.0.15",
    "publishedAt": "2026-09-03T09:00:18Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.14",
    "title": "Schedule Patterns, Flexible DOCX & A-Z Channels",
    "type": "PATCH",
    "highlights": [
      "Добавлен календарный режим публикаций 3 дня видео / 1 день пауза (3/1).",
      "Добавлен общий pattern engine: поддерживает 3/1 и пользовательские publish/pause patterns без отдельного hardcode под один режим.",
      "Pattern привязан к сохранённой anchor date каждого канала: занятая дата пропускается, но день паузы не сдвигается.",
      "Существующий режим «каждые N дней» сохранён и остаётся backward-compatible для каналов со старым cadenceDays."
    ],
    "sections": {
      "features": [
        "Добавлен календарный режим публикаций 3 дня видео / 1 день пауза (3/1).",
        "Добавлен общий pattern engine: поддерживает 3/1 и пользовательские publish/pause patterns без отдельного hardcode под один режим.",
        "Pattern привязан к сохранённой anchor date каждого канала: занятая дата пропускается, но день паузы не сдвигается.",
        "Существующий режим «каждые N дней» сохранён и остаётся backward-compatible для каналов со старым cadenceDays.",
        "Metadata показывает preview с VIDEO и ПАУЗА и применяет те же даты, которые показаны в preview.",
        "PUBLISH TIME из DOCX продолжает переопределять только время конкретного ролика; дата берётся из выбранной schedule strategy.",
        "DOCX больше не привязан к Production Plan: правило теперь Word records >= реально выбранных видео.",
        "Лишние Word-записи разрешены и не применяются; если Word-записей меньше выбранных видео — применение блокируется до YouTube API.",
        "Количество 30/100/300 в Production остаётся только производственным планом и не участвует в Metadata validation.",
        "Command Center / Runway / очереди приоритетов НЕ сортируются A→Z и сохраняют операционный порядок.",
        "Preview/переключение schedule mode/DOCX validation/A-Z сортировка не добавляют скрытых YouTube API запросов."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Существующие Recovery, Notification Center, updater, Downloads Collector, OAuth и ENDLUME bridge сохранены."
      ],
      "technical": [
        "Выпадающие списки выбора каналов отсортированы A → Z, case-insensitive и numeric-aware. Shared channel state не мутируется."
      ]
    },
    "technicalItems": [
      "Выпадающие списки выбора каналов отсортированы A → Z, case-insensitive и numeric-aware. Shared channel state не мутируется."
    ],
    "tag": "v1.0.14",
    "publishedAt": "2026-09-03T08:20:44Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.13",
    "title": "Recovery, Smart Schedule & Notifications",
    "type": "PATCH",
    "highlights": [
      "Единый Notification Center слева сверху: success/info/warning/error, очередь и защита от дублей.",
      "Command Center показывает готовность раздельно: N / план + процент.",
      "Встроенный updater явно уведомляет о новой версии и об успешной установке после перезапуска.",
      "При прерванной Production-сборке VYRON на старте находит persisted checkpoint, показывает 60-секундный recovery dialog и по таймеру продолжает безопасно."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Единый Notification Center слева сверху: success/info/warning/error, очередь и защита от дублей.",
        "Command Center показывает готовность раздельно: N / план + процент.",
        "Встроенный updater явно уведомляет о новой версии и об успешной установке после перезапуска.",
        "При прерванной Production-сборке VYRON на старте находит persisted checkpoint, показывает 60-секундный recovery dialog и по таймеру продолжает безопасно.",
        "Готовые проекты не пересоздаются; незавершённая .tmp-папка пересобирается атомарно. «Начать заново» создаёт новый batch и не удаляет старый автоматически.",
        "Metadata автоматически продолжает расписание конкретного канала от последней локально известной отложенной даты.",
        "Для графика через 2 дня: 13.09 → 15.09 → 17.09 и т.д.; 34 видео от 15.09 заканчиваются 20.11.2026.",
        "DOCX PUBLISH TIME сохранён; fallback-время интерпретируется как KRAT (+07), независимо от VPN/часового пояса Mac.",
        "После успешного применения Metadata локальный Existing Videos cache обновляется сразу, без скрытой повторной YouTube-синхронизации.",
        "YouTube OAuth/API, Analytics, Competitors, Downloads Collector и ENDLUME bridge не переписывались."
      ],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v1.0.13",
    "publishedAt": "2026-09-03T07:37:01Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.12",
    "title": "Production UX & Storage Fix",
    "type": "PATCH",
    "highlights": [
      "Finder теперь открывает именно выбранную папку проектов; файлы по-прежнему раскрываются через Reveal.",
      "Выбор основной папки и отдельной папки канала начинается с текущего сохранённого пути, а не со случайной директории macOS.",
      "Путь storage канонизируется backend и используется как единый источник истины.",
      "Фактические количества изображений, музыки, видео и SEO отделены от размера текущего производственного плана."
    ],
    "sections": {
      "features": [],
      "fixes": [],
      "interface": [
        "Finder теперь открывает именно выбранную папку проектов; файлы по-прежнему раскрываются через Reveal.",
        "Выбор основной папки и отдельной папки канала начинается с текущего сохранённого пути, а не со случайной директории macOS.",
        "Путь storage канонизируется backend и используется как единый источник истины.",
        "Фактические количества изображений, музыки, видео и SEO отделены от размера текущего производственного плана.",
        "План проектов поддерживает 1–10000; музыка на проект — 1–100.",
        "Production упрощён до: Обзор → Материалы → Сборка проектов → Рендер → Публикация.",
        "Command Center переписан человеческим языком: что делать сегодня, какой канал следующий и сколько дней запаса.",
        "YouTube OAuth/API, Analytics, Competitors, Downloads Collector, ручной импорт, ENDLUME status bridge и updater не переписывались.",
        "Переходы по новым экранам не добавляют скрытых YouTube API-запросов."
      ],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v1.0.12",
    "publishedAt": "2026-09-03T06:50:02Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.11",
    "title": "Project Storage Fix",
    "type": "PATCH",
    "highlights": [
      "Рабочий Downloads image collector.",
      "Музыкальная библиотека и история распределения.",
      "ENDLUME handoff protocol.",
      "Production-подготовка по-прежнему не выполняет лишних YouTube API-запросов."
    ],
    "sections": {
      "features": [
        "Рабочий Downloads image collector.",
        "Музыкальная библиотека и история распределения.",
        "ENDLUME handoff protocol.",
        "Production-подготовка по-прежнему не выполняет лишних YouTube API-запросов."
      ],
      "fixes": [
        "В разделе «Производство» теперь всегда видна фактическая папка, в которой будут создаваться файлы новых проектов.",
        "Добавлен прямой выбор основной папки проектов и отдельной папки для текущего канала.",
        "Ручной импорт изображений в «Материалы» теперь создаёт VIDEO_XXX в выбранной Production-папке, а не принудительно в старом Workspace.",
        "Autopilot использует тот же выбранный Production root при создании новых VIDEO_XXX.",
        "Перед созданием проекта VYRON проверяет, что выбранный диск/папка существует и доступен на запись. Если внешний SSD отключён, приложение не создаёт ложную папку на внутреннем диске.",
        "Удаление ручных проектов учитывает их фактическое расположение, включая внешний диск.",
        "Существующие проекты не переносятся и не удаляются. Новое расположение применяется к новым проектам.",
        "Исправление updater Cross-device link из VYRON 1.0.10 сохранено."
      ],
      "interface": [],
      "reliability": [],
      "security": [
        "YouTube OAuth/API, Analytics, Metadata и публикация."
      ],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v1.0.11",
    "publishedAt": "2026-09-03T06:03:13Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.10",
    "title": "Updater EXDEV Hotfix",
    "type": "PATCH",
    "highlights": [
      "Исправлена ошибка Cross-device link (os error 18) при установке обновления VYRON на macOS.",
      "перед downloadAndInstall VYRON сравнивает файловый том системного $TMPDIR и том, где расположен VYRON.app;",
      "если тома разные, временная папка updater создаётся рядом с VYRON.app на том же диске;",
      "штатная Tauri-проверка подписи, скачивание и установка сохранены;"
    ],
    "sections": {
      "features": [],
      "fixes": [
        "Исправлена ошибка Cross-device link (os error 18) при установке обновления VYRON на macOS.",
        "перед downloadAndInstall VYRON сравнивает файловый том системного $TMPDIR и том, где расположен VYRON.app;",
        "если тома разные, временная папка updater создаётся рядом с VYRON.app на том же диске;",
        "штатная Tauri-проверка подписи, скачивание и установка сохранены;",
        "если VYRON запущен непосредственно с read-only DMG/неподходящего тома, вместо сырого os error 18 показывается понятная инструкция перенести VYRON.app в Applications;",
        "Production Workspace, OAuth, YouTube, аналитика, очередь, Metadata Hub и настройки 1.0.9 не изменялись.",
        "Важно: если установленная 1.0.9 уже падает с os error 18, один раз запусти VYRON.app из внутренней папки Applications и повтори обновление. После установки 1.0.10 последующие обновления используют cross-volume protection автоматически."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v1.0.10",
    "publishedAt": "2026-09-03T05:34:48Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.9",
    "title": "Production Storage",
    "type": "PATCH",
    "highlights": [
      "Обновление касается только локального Production Manager и места хранения новых batch-проектов.",
      "в Production появился прозрачный блок «Хранилище проектов» с фактическим путём, типом диска, доступом на запись и свободным местом;",
      "можно выбрать основную папку для новых Production batch через системный macOS folder picker;",
      "поддерживаются внутренний SSD и внешние SSD/HDD в /Volumes/...;"
    ],
    "sections": {
      "features": [
        "Обновление касается только локального Production Manager и места хранения новых batch-проектов.",
        "в Production появился прозрачный блок «Хранилище проектов» с фактическим путём, типом диска, доступом на запись и свободным местом;",
        "можно выбрать основную папку для новых Production batch через системный macOS folder picker;",
        "поддерживаются внутренний SSD и внешние SSD/HDD в /Volumes/...;",
        "для отдельного канала можно задать собственный Production Root либо оставить наследование основной папки;",
        "после сборки VYRON показывает фактический путь batch и позволяет открыть его в Finder.",
        "автоматический сбор изображений из ~/Downloads;",
        "ручной импорт изображений;",
        "распределение музыки и порядок треков;",
        "VYRON → ENDLUME bridge;",
        "updater identity/public key/endpoint;",
        "существующие пользовательские данные.",
        "Production Storage остаётся полностью локальной функцией и не расходует YouTube API quota."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "существующие batch-проекты не перемещаются;",
        "уже работающий Downloads collector продолжает использовать прежний VYRON workspace;",
        "музыкальная библиотека, индекс, history и import session остаются в прежнем control workspace;",
        "выбранный внешний диск влияет только на новые batch-папки;",
        "если внешний диск отключён или недоступен для записи, новая сборка batch блокируется — тихого fallback на SSD Mac нет;",
        "при отсутствии отдельной настройки сохраняется старое поведение 1.0.8.",
        "YouTube OAuth/API, Analytics, SEO, Existing Videos, Publisher, Competitors;"
      ],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v1.0.9",
    "publishedAt": "2026-09-03T05:12:59Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.8",
    "title": "macOS Downloads Permission Hotfix",
    "type": "PATCH",
    "highlights": [
      "macOS запоминает ранее выбранный пользователем запрет. Если для VYRON доступ к Downloads уже был запрещён, после установки 1.0.8 необходимо один раз включить доступ в «Системные настройки → Конфиденциальность и безопасность → Файлы и папки → VYRON → Загрузки» либо сбросить решение командой tccutil reset SystemPolicyDownloadsFolder studio.channelflow.desktop, затем заново открыть VYRON и разрешить системный запрос.",
      "Production UI и дизайн;",
      "ручной импорт изображений;",
      "ENDLUME;"
    ],
    "sections": {
      "features": [
        "macOS запоминает ранее выбранный пользователем запрет. Если для VYRON доступ к Downloads уже был запрещён, после установки 1.0.8 необходимо один раз включить доступ в «Системные настройки → Конфиденциальность и безопасность → Файлы и папки → VYRON → Загрузки» либо сбросить решение командой tccutil reset SystemPolicyDownloadsFolder studio.channelflow.desktop, затем заново открыть VYRON и разрешить системный запрос.",
        "Production UI и дизайн;",
        "ручной импорт изображений;",
        "ENDLUME;",
        "SEO;",
        "Автосбор изображений остаётся полностью локальной операцией и не выполняет YouTube API запросов."
      ],
      "fixes": [
        "Исправление касается только системного доступа VYRON к ~/Downloads, который используется локальным автосбором изображений.",
        "в macOS bundle добавлен NSDownloadsFolderUsageDescription, чтобы система корректно запрашивала и отображала пользователю причину доступа VYRON к папке «Загрузки»;",
        "если текущая сборка уже использует App Sandbox, существующие entitlements сохраняются и дополнительно получают read-only доступ к Downloads; App Sandbox не включается принудительно;",
        "сохранён исправленный в 1.0.7 pipeline: существующие изображения в Downloads не попадают автоматически в seen, рекурсивный поиск и проверка стабильности файла остаются на месте;",
        "release gate проверяет наличие privacy-key непосредственно в собранном VYRON.app/Contents/Info.plist;",
        "bundle identifier, updater trust/public key и updater endpoint не изменяются."
      ],
      "interface": [],
      "reliability": [],
      "security": [
        "YouTube OAuth/API и квота."
      ],
      "technical": [
        "музыка и Batch Builder;"
      ]
    },
    "technicalItems": [
      "музыка и Batch Builder;"
    ],
    "tag": "v1.0.8",
    "publishedAt": "2026-09-03T04:16:40Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.7",
    "title": "Downloads Image Collector Hotfix",
    "type": "PATCH",
    "highlights": [
      "ручная кнопка «+ Импортировать изображения» и её backend;",
      "Production UI и дизайн;",
      "ENDLUME;",
      "SEO;"
    ],
    "sections": {
      "features": [
        "ручная кнопка «+ Импортировать изображения» и её backend;",
        "Production UI и дизайн;",
        "ENDLUME;",
        "SEO;",
        "updater trust, public key, endpoint и Tauri identifier.",
        "Автосбор изображений остаётся полностью локальной операцией и не выполняет YouTube API запросов."
      ],
      "fixes": [
        "Исправление касается только локального автосбора изображений в Production → Автосборка.",
        "устранена причина, из-за которой изображения, уже лежащие в ~/Downloads до нажатия «НАЧАТЬ СБОР», ошибочно попадали в seen и никогда не импортировались;",
        "при старте сессии существующие PNG/JPG/JPEG/WEBP теперь являются нормальными кандидатами на импорт;",
        "дедупликация учитывает только изображения, уже реально сохранённые текущей import-сессией;",
        "сохранены рекурсивный поиск, проверка стабильности файла перед копированием, Unicode/кириллица и COPY-семантика;",
        "добавлена локальная backend-диагностика старта и успешного импорта;",
        "добавлен регрессионный тест на реальный сценарий с именем ChatGPT Image 3 сент. 18_54 (7) — копия 2.png."
      ],
      "interface": [],
      "reliability": [],
      "security": [
        "YouTube OAuth, refresh tokens и YouTube API;"
      ],
      "technical": [
        "музыка и Batch Builder;"
      ]
    },
    "technicalItems": [
      "музыка и Batch Builder;"
    ],
    "tag": "v1.0.7",
    "publishedAt": "2026-09-03T03:55:19Z",
    "prerelease": false
  },
  {
    "date": "2026-09-03",
    "version": "1.0.6",
    "title": "Production Autobuild",
    "type": "PATCH",
    "highlights": [
      "единое выбранное состояние канала в Production;",
      "persistence Production Manager v2: выбранный канал, вкладка, настройки и выбор проектов сохраняются между переходами и перезапусками;",
      "рекурсивный поиск изображений в Downloads и вложенных папках;",
      "устойчивый импорт изображений: недокачанные и 0-byte файлы не принимаются как готовые;"
    ],
    "sections": {
      "features": [
        "единое выбранное состояние канала в Production;",
        "persistence Production Manager v2: выбранный канал, вкладка, настройки и выбор проектов сохраняются между переходами и перезапусками;",
        "рекурсивный поиск изображений в Downloads и вложенных папках;",
        "устойчивый импорт изображений: недокачанные и 0-byte файлы не принимаются как готовые;",
        "распределение изображений: равномерно, случайно, по алфавиту и без повторов;",
        "точное количество проектов: быстрые значения 10 / 15 / 20 / 30 и диапазон 1–100;",
        "массовое выделение, удаление выбранных проектов и удаление всего текущего списка;",
        "локальный ENDLUME handoff с подтверждением получения;",
        "восстановление незавершённого batch и идемпотентное повторное выполнение.",
        "YouTube metadata writer, backup и Undo;",
        "YouTube API-команды и Zero Quota архитектура;",
        "updater trust, public key, endpoint и Tauri identifier;",
        "остальные экраны VYRON.",
        "Production не выполняет YouTube API вызовов."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "YouTube OAuth и refresh tokens;"
      ],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v1.0.6",
    "publishedAt": "2026-09-03T03:14:18Z",
    "prerelease": false
  },
  {
    "date": "2026-09-02",
    "version": "1.0.5",
    "title": "Image Import Reliability",
    "type": "PATCH",
    "highlights": [
      "YouTube API в Production Manager по-прежнему не используется: 0 units.",
      "Каналы, аналитика, конкуренты, Dashboard и Autopilot не изменены.",
      "ENDLUME bridge и формат batch-проектов не изменены.",
      "Tauri identifier, updater endpoint и updater trust key сохранены без изменений."
    ],
    "sections": {
      "features": [
        "YouTube API в Production Manager по-прежнему не используется: 0 units.",
        "Каналы, аналитика, конкуренты, Dashboard и Autopilot не изменены.",
        "ENDLUME bridge и формат batch-проектов не изменены.",
        "Tauri identifier, updater endpoint и updater trust key сохранены без изменений.",
        "Production Manager по-прежнему создаёт плоские папки: 1 изображение + назначенная музыка."
      ],
      "fixes": [
        "Исправлено зависание «СБОР ИДЁТ» при скачивании изображений в Downloads.",
        "Устранена гонка, при которой файл помечался обработанным до завершения скачивания и после этого никогда не подхватывался повторно.",
        "VYRON теперь ждёт стабильный ненулевой файл, копирует его во временный файл и только после проверки полного размера фиксирует изображение как собранное.",
        "Нулевые и ещё дописывающиеся файлы автоматически повторно проверяются, а не теряются.",
        "Ошибка доступа macOS к Downloads больше не скрывается: VYRON показывает понятное сообщение о разрешении «Файлы и папки».",
        "После перезапуска приложения устаревшее сохранённое состояние «СБОР ИДЁТ» больше не выдаётся за живой watcher.",
        "Во время активного сбора интерфейс дополнительно перечитывает локальный import-session, поэтому счётчик не зависит только от одного события UI."
      ],
      "interface": [],
      "reliability": [],
      "security": [
        "YouTube/OAuth/quota/metadata writer не изменены."
      ],
      "technical": [
        "Дата: 03.09.2026"
      ]
    },
    "technicalItems": [
      "Дата: 03.09.2026"
    ],
    "tag": "v1.0.5",
    "publishedAt": "2026-09-02T17:30:16Z",
    "prerelease": false
  },
  {
    "date": "2026-09-02",
    "version": "1.0.4",
    "title": "Production Manager",
    "type": "PATCH",
    "highlights": [
      "Добавлен локальный Production Manager / Автосборка для массовой подготовки проектов VYRON → ENDLUME без расхода YouTube Data API.",
      "активная import-сессия выбранного канала для сбора изображений из Downloads;",
      "собственная безопасная нумерация изображений;",
      "отдельная музыкальная библиотека для каждого канала;"
    ],
    "sections": {
      "features": [
        "Добавлен локальный Production Manager / Автосборка для массовой подготовки проектов VYRON → ENDLUME без расхода YouTube Data API.",
        "активная import-сессия выбранного канала для сбора изображений из Downloads;",
        "собственная безопасная нумерация изображений;",
        "отдельная музыкальная библиотека для каждого канала;",
        "переиндексация добавленных и удалённых треков;",
        "точное количество проектов и песен на проект;",
        "режимы распределения музыки: Равномерно / Случайно / Без повторов в партии;",
        "защита от полностью одинаковых музыкальных последовательностей через fingerprint;",
        "повторное использование песен при нехватке библиотеки с изменением порядка и комбинаций;",
        "изображения по умолчанию не повторяются; повтор разрешается только явным действием пользователя;",
        "плоская структура каждого проекта: 1 изображение + все аудиофайлы без вложенных папок;",
        "batch.json, status.json, checkpoint и история batches;",
        "восстановление незавершённой подготовки после перезапуска;",
        "локальная проверка batch перед передачей в ENDLUME;",
        "кнопка «Открыть в ENDLUME» с прямой передачей manifest без автоматизации мыши;",
        "локальный status bridge для возврата Rendering / Completed / Error в VYRON.",
        "Для прямого batch-import используется совместимый ENDLUME Studio 1.0.0-alpha.8.6 или новее. ENDLUME получает готовые проекты, после чего пользователь выбирает существующие эффекты и параметры рендера один раз для всей партии. Ручной режим ENDLUME сохраняется.",
        "Production Manager выполняет локально и с 0 YouTube API units:",
        "сбор изображений;",
        "индексирование музыки;",
        "создание папок;",
        "распределение треков;",
        "fingerprint/shuffle;",
        "batch/checkpoint/history;",
        "передачу в ENDLUME;",
        "чтение локального статуса ENDLUME;",
        "восстановление незавершённой партии.",
        "Production Manager не добавляет фоновых YouTube API вызовов и не запускает YouTube sync.",
        "Release gate проверяет сценарии 30 изображений + 500 песен → 30 проектов × 15 треков = 450 назначений, нехватку изображений, повторы музыки при библиотеке 100 треков, уникальность последовательностей, idempotency, resume незавершённой партии, persistence, Zero Quota, TypeScript, Rust и ARM64 сборку."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "OAuth и подключённые каналы;",
        "существующие YouTube commands;",
        "Rust YouTube writer;",
        "Existing Videos cache;",
        "Channel Runway и Zero Quota architecture;",
        "Quota Meter;",
        "Dashboard и Command Center;",
        "существующая логика публикации;",
        "secure token storage;",
        "Tauri identifier;",
        "updater endpoint и updater public key;",
        "backup / Undo и ownership validation."
      ],
      "security": [],
      "technical": [
        "Дата релиза: 02.09.2026",
        "idempotent build request и защита от дублирования при повторном запуске;",
        "Metadata Hub / title / description / tags;"
      ]
    },
    "technicalItems": [
      "Дата релиза: 02.09.2026",
      "idempotent build request и защита от дублирования при повторном запуске;",
      "Metadata Hub / title / description / tags;"
    ],
    "tag": "v1.0.4",
    "publishedAt": "2026-09-02T15:58:33Z",
    "prerelease": false
  },
  {
    "date": "2026-09-02",
    "version": "1.0.3",
    "title": "Command Center",
    "type": "PATCH",
    "highlights": [
      "Добавлен локальный VYRON Command Center для ежедневного управления сетью YouTube-каналов без фонового расхода YouTube Data API.",
      "Attention Center: показывает, какие каналы требуют внимания прямо сейчас.",
      "Production Forecast: рассчитывает, какие каналы входят в производственное окно, сколько готово к YouTube и где не хватает SEO.",
      "Network Plan: единая очередь каналов по runway и локальной готовности Production."
    ],
    "sections": {
      "features": [
        "Добавлен локальный VYRON Command Center для ежедневного управления сетью YouTube-каналов без фонового расхода YouTube Data API.",
        "Attention Center: показывает, какие каналы требуют внимания прямо сейчас.",
        "Production Forecast: рассчитывает, какие каналы входят в производственное окно, сколько готово к YouTube и где не хватает SEO.",
        "Network Plan: единая очередь каналов по runway и локальной готовности Production.",
        "Отображается текущая локальная пропускная способность по сохранённому Quota Planner.",
        "Рассчитывается рекомендуемый темп производства по всей сети каналов.",
        "Command Center использует только локальные данные:",
        "Channel Runway;",
        "локальные Production jobs;",
        "локальный Quota Planner;",
        "локальный Command Center storage.",
        "Command Center не импортирует api.ts, не вызывает YouTube API и не запускает синхронизацию при открытии, переключении вкладок, расчётах, сортировке или создании Smart Batch.",
        "Для получения свежего Scheduled-состояния по-прежнему используется только явная ручная кнопка во вкладке План каналов."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Channel Runway и его 06:00 KRAT scheduler;",
        "Metadata Hub;",
        "Existing Videos;",
        "Production Workspace;",
        "Quota Meter и локальное время сброса;",
        "OAuth / secure token storage;",
        "updater endpoint / public key;",
        "Tauri identifier;",
        "ENDLUME integration;",
        "Autopilot;",
        "Rust YouTube writer;",
        "backup / Undo;",
        "ownership validation."
      ],
      "security": [],
      "technical": [
        "Дата релиза: 02.09.2026",
        "Smart Batch Builder: создаёт локальную пачку VIDEO_001...VIDEO_N и даты публикации после последнего подтверждённого Scheduled-видео с учётом cadence канала.",
        "Smart Batch Builder хранит планы в отдельном versioned storage key vyron:command-center:v1.",
        "Перед публикацией VYRON 1.0.3 должен пройти frontend tests, TypeScript production build, Command Center local-only contract, Zero Quota contract, persistence tests, Rust tests, cargo check ARM64, private-key leak scan, Tauri ARM64 build, updater signature verification, codesign verification и DMG verification."
      ]
    },
    "technicalItems": [
      "Дата релиза: 02.09.2026",
      "Smart Batch Builder: создаёт локальную пачку VIDEO_001...VIDEO_N и даты публикации после последнего подтверждённого Scheduled-видео с учётом cadence канала.",
      "Smart Batch Builder хранит планы в отдельном versioned storage key vyron:command-center:v1.",
      "Перед публикацией VYRON 1.0.3 должен пройти frontend tests, TypeScript production build, Command Center local-only contract, Zero Quota contract, persistence tests, Rust tests, cargo check ARM64, private-key leak scan, Tauri ARM64 build, updater signature verification, codesign verification и DMG verification."
    ],
    "tag": "v1.0.3",
    "publishedAt": "2026-09-02T12:31:27Z",
    "prerelease": false
  },
  {
    "date": "2026-09-02",
    "version": "1.0.2",
    "title": "Channel Runway",
    "type": "PATCH",
    "highlights": [
      "Добавлен локальный модуль Channel Runway / План каналов для контроля запаса запланированных публикаций по всем подключённым YouTube-каналам.",
      "По каждому каналу показывается последняя подтверждённая дата Scheduled-видео.",
      "Показывается остаток запаса в днях.",
      "Рассчитывается дата, с которой стоит готовить следующую пачку."
    ],
    "sections": {
      "features": [
        "Добавлен локальный модуль Channel Runway / План каналов для контроля запаса запланированных публикаций по всем подключённым YouTube-каналам.",
        "По каждому каналу показывается последняя подтверждённая дата Scheduled-видео.",
        "Показывается остаток запаса в днях.",
        "Рассчитывается дата, с которой стоит готовить следующую пачку.",
        "Каналы сортируются по срочности и риску.",
        "Добавлена общая сводка по сети каналов: запас, критические каналы, очередь производства, рекомендуемый темп и квотный план.",
        "Ежедневный пересчёт выполняется локально в 06:00 Asia/Krasnoyarsk.",
        "Если VYRON был закрыт в 06:00, пропущенный локальный пересчёт выполняется при следующем запуске.",
        "Данные сохраняются в отдельном versioned storage key vyron:channel-runway:v1.",
        "Пустой или неподтверждённый локальный cache отображается как Нет данных, а не как закончившееся расписание.",
        "Несохранённые локальные черновые даты Existing Videos не используются как подтверждённое расписание.",
        "Channel Runway не расходует YouTube API при:",
        "ежедневном пересчёте;",
        "открытии модуля;",
        "запуске приложения;",
        "сортировке каналов;",
        "расчёте runway, приоритетов, очереди и квотного плана.",
        "YouTube API вызывается только после явного нажатия пользователем кнопки «ОБНОВИТЬ РАСПИСАНИЕ» внутри YouTube.",
        "Перед публикацией 1.0.2 прошёл полный ARM64 release gate: frontend tests, TypeScript production build, Zero Quota + Channel Runway local-only contracts, Rust tests, cargo check ARM64, private-key leak scan, Tauri ARM64 app/DMG build, updater signature verification, codesign verification и DMG verification."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Metadata Hub;",
        "Existing Videos;",
        "Production Workspace;",
        "Quota Meter и локальное время сброса квоты;",
        "OAuth и secure token storage;",
        "updater endpoint/public key;",
        "Tauri identifier;",
        "ENDLUME integration;",
        "Autopilot;",
        "Rust YouTube writer;",
        "backup/Undo;",
        "ownership validation."
      ],
      "security": [],
      "technical": [
        "Дата релиза: 02.09.2026",
        "Для расчёта Scheduled учитываются только подтверждённые YouTube-видео со статусом private и будущим publishAt."
      ]
    },
    "technicalItems": [
      "Дата релиза: 02.09.2026",
      "Для расчёта Scheduled учитываются только подтверждённые YouTube-видео со статусом private и будущим publishAt."
    ],
    "tag": "v1.0.2",
    "publishedAt": "2026-09-02T09:49:01Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "1.0.1",
    "title": "Local Quota Reset",
    "type": "PATCH",
    "highlights": [
      "VYRON теперь показывает время следующего сброса YouTube Data API по локальному времени компьютера пользователя, а не только техническое 00:00 PT.",
      "В Quota Meter поле «Сброс» заменено на «Сброс по вашему времени».",
      "Следующий 00:00 America/Los_Angeles автоматически переводится в системный часовой пояс macOS.",
      "Для компьютера с часовым поясом Красноярска отображается примерно 14:00 летом и 15:00 зимой."
    ],
    "sections": {
      "features": [
        "VYRON теперь показывает время следующего сброса YouTube Data API по локальному времени компьютера пользователя, а не только техническое 00:00 PT.",
        "В Quota Meter поле «Сброс» заменено на «Сброс по вашему времени».",
        "Следующий 00:00 America/Los_Angeles автоматически переводится в системный часовой пояс macOS.",
        "Для компьютера с часовым поясом Красноярска отображается примерно 14:00 летом и 15:00 зимой.",
        "Рядом сохраняется техническая подпись 00:00 PT, чтобы было понятно, от какого правила Google идёт расчёт.",
        "Сообщение при исчерпании квоты также показывает точные локальные дату и время следующего сброса.",
        "1.0.1 публикуется только после PASS: frontend tests, TypeScript production build, Rust tests, cargo check ARM64, Zero Quota/local-reset contract, private-key leak scan, Tauri ARM64 build, app codesign, DMG verify и updater signature verify против доверенного ключа VYRON 0.9.9/1.0.0."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Zero Quota архитектура VYRON 1.0.",
        "YouTube API вызывается только внутри рабочей зоны YouTube и после явного действия пользователя.",
        "Production работает локально без YouTube API.",
        "Existing Videos cache, Metadata Draft, Production Workspace и Undo persistence сохранены.",
        "OAuth/token storage, Tauri identifier, updater endpoint/public key, ENDLUME integration и Rust YouTube writer не менялись."
      ],
      "security": [],
      "technical": [
        "Дата релиза: 01.09.2026",
        "Учитывается переход Pacific Time между PDT и PST, поэтому время пересчитывается автоматически и не захардкожено."
      ]
    },
    "technicalItems": [
      "Дата релиза: 01.09.2026",
      "Учитывается переход Pacific Time между PDT и PST, поэтому время пересчитывается автоматически и не захардкожено."
    ],
    "tag": "v1.0.1",
    "publishedAt": "2026-09-01T16:23:45Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "1.0.0",
    "title": "Zero Quota Production",
    "type": "MAJOR",
    "highlights": [
      "Удалены фоновые YouTube Intelligence polling/timers со startup и глобального App.",
      "Autopilot больше физически не может загружать видео в YouTube в фоне. Он обслуживает только локальный Production + ENDLUME pipeline.",
      "«Каналы», «Аналитика», «Конкуренты» и «Настройки» переведены на локальный cache/state без YouTube Data API.",
      "Убрана автоматическая синхронизация Existing Videos при входе/возврате на вкладку."
    ],
    "sections": {
      "features": [
        "Удалены фоновые YouTube Intelligence polling/timers со startup и глобального App.",
        "Autopilot больше физически не может загружать видео в YouTube в фоне. Он обслуживает только локальный Production + ENDLUME pipeline.",
        "«Каналы», «Аналитика», «Конкуренты» и «Настройки» переведены на локальный cache/state без YouTube Data API.",
        "Убрана автоматическая синхронизация Existing Videos при входе/возврате на вкладку.",
        "Убрана автоматическая загрузка YouTube-видео в Metadata при входе/возврате.",
        "Existing Videos сохраняет рабочую таблицу, выбранные видео, baseline, последнюю синхронизацию и Undo state локально.",
        "Persistent Metadata Draft сохранён: SEO pack, parsed records, mapping, порядок, фильтры, расписание и выбранные видео переживают переходы и перезапуск.",
        "Добавлен persistent Production Workspace по каждому каналу: проект, цель, материалы, рендер, SEO, проверка, расписание, готовность к YouTube.",
        "Production остаётся полностью без YouTube API.",
        "Quota Meter отображается только в YouTube.",
        "Сохранён рабочий Rust YouTube writer: skip identical update, batch list до 50 videoId, combined metadata+schedule update, ownership validation, backup/undo и verification.",
        "Релиз публикуется только после PASS: frontend unit tests, TypeScript production build, Rust tests, cargo check ARM64, Zero Quota contract checks, Tauri ARM64 build, app codesign verification, DMG verification и updater signature artifact verification."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Проверка OAuth health, ручное обновление аналитики и поиск/обновление конкурентов централизованы внутри YouTube.",
        "Существующие OAuth/token storage, Tauri identifier, updater endpoint/public key, ENDLUME integration и persistent storage не переименовывались и не заменялись."
      ],
      "technical": [
        "Дата релиза: 01.09.2026",
        "Добавлен premium UI polish с лёгкими transform/opacity анимациями без тяжёлых blur/shadow animations."
      ]
    },
    "technicalItems": [
      "Дата релиза: 01.09.2026",
      "Добавлен premium UI polish с лёгкими transform/opacity анимациями без тяжёлых blur/shadow animations."
    ],
    "tag": "v1.0.0",
    "publishedAt": "2026-09-01T15:56:18Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.9",
    "title": "Quota Planner & Update Center Fix",
    "type": "PATCH",
    "highlights": [
      "Добавлен постоянно видимый YOUTUBE API QUOTA meter в YouTube Center.",
      "LIVE ESTIMATE считает расход запросов, которые делает VYRON, и обновляется сразу после каждого вызова.",
      "Показывает: использовано, осталось, сколько каналов по текущему плану можно обработать сегодня и время дневного сброса 00:00 PT.",
      "При quotaExceeded счётчик фиксируется на дневном лимите и Quota Guard продолжает блокировать лишние запросы."
    ],
    "sections": {
      "features": [
        "Добавлен постоянно видимый YOUTUBE API QUOTA meter в YouTube Center.",
        "LIVE ESTIMATE считает расход запросов, которые делает VYRON, и обновляется сразу после каждого вызова.",
        "Показывает: использовано, осталось, сколько каналов по текущему плану можно обработать сегодня и время дневного сброса 00:00 PT.",
        "При quotaExceeded счётчик фиксируется на дневном лимите и Quota Guard продолжает блокировать лишние запросы.",
        "Дневной лимит настраиваемый — после официального увеличения quota в Google Cloud достаточно изменить число.",
        "Планировщик по умолчанию рассчитан на 30 видео на канал.",
        "Пользователь задаёт число каналов и видео/канал.",
        "VYRON показывает примерную стоимость одного канала, сколько каналов можно сделать сегодня, сколько в полный следующий день и оценку количества дней.",
        "План сохраняется локально и не пропадает после перехода между разделами/перезапуска.",
        "Оценка консервативная: ~52 units на изменяемое видео (videos.update=50 + обычный read/verify overhead). Уже совпадающие видео пропускаются и могут стоить дешевле.",
        "Удалён hardcoded fallback 0.9.5.",
        "Установленная версия теперь читается из Tauri runtime через getVersion().",
        "Сообщение «Установлена актуальная версия» всегда показывает фактически запущенную сборку.",
        "Это локальный мгновенный счётчик VYRON. Google Cloud quota metrics могут запаздывать и требуют отдельного Cloud Monitoring доступа; поэтому они не выдаются за real-time."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "OAuth profiles, refresh tokens, channels, metadata drafts, ENDLUME settings и существующий state не сбрасываются."
      ],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v0.9.9",
    "publishedAt": "2026-09-01T13:12:03Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.8",
    "title": "Quota Guard & Persistent Session",
    "type": "PATCH",
    "highlights": [
      "Перед записью VYRON сравнивает текущие данные с желаемыми и не делает videos.update, если видео уже совпадает.",
      "Если одновременно меняются metadata и schedule, VYRON использует один videos.update?part=snippet,status вместо двух отдельных дорогих write-запросов.",
      "При повторном запуске уже успешно обработанная половина пачки не переписывается заново.",
      "quotaExceeded больше не размножается десятками ошибок по разделам VYRON."
    ],
    "sections": {
      "features": [
        "Перед записью VYRON сравнивает текущие данные с желаемыми и не делает videos.update, если видео уже совпадает.",
        "Если одновременно меняются metadata и schedule, VYRON использует один videos.update?part=snippet,status вместо двух отдельных дорогих write-запросов.",
        "При повторном запуске уже успешно обработанная половина пачки не переписывается заново."
      ],
      "fixes": [
        "quotaExceeded больше не размножается десятками ошибок по разделам VYRON.",
        "После первого quotaExceeded VYRON ставит YouTube Data API на глобальную паузу и не продолжает сжигать запросы до следующего дневного сброса quota.",
        "Добавлен глобальный Quota Guard banner и ручная кнопка «Проверить снова» после увеличения/сброса quota.",
        "Фоновая аналитика и competitor refresh не продолжают долбить YouTube Data API, пока quota guard активен.",
        "Массовая обработка останавливается на первом quotaExceeded, сохраняет незавершённую часть и не превращает остаток пачки в десятки красных ошибок.",
        "Metadata Hub автоматически сохраняет по каждому каналу: распознанный SEO pack, вставленный текст, выбранные ролики, порядок, фильтр, первую дату, интервал и историю последних операций.",
        "При переходе в другой раздел и возврате рабочая сессия Metadata Hub восстанавливается автоматически без повторной загрузки DOCX.",
        "При quota pause Metadata Hub оставляет выбранными только незавершённые ролики и сохраняет соответствующие им строки SEO pack для продолжения после сброса quota.",
        "Успешный videos.update расписания считается фактом принятия YouTube; задержка контрольного videos.list больше не создаёт ложную ошибку, если дата уже реально появилась в YouTube Studio."
      ],
      "interface": [],
      "reliability": [],
      "security": [
        "OAuth profiles, refresh tokens, channel bindings, backups, ENDLUME settings и существующий state не сбрасываются.",
        "Bundle identifier и подписанный Tauri updater сохранены.",
        "Добавлены regression tests на quotaExceeded detection и существующие KRAT schedule / YouTube write tests остаются обязательными release gates."
      ],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v0.9.8",
    "publishedAt": "2026-09-01T12:07:40Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.7",
    "title": "Verify & KRAT Schedule Fix",
    "type": "PATCH",
    "highlights": [
      "Успешный videos.update теперь считается фактом принятия метаданных YouTube; мгновенный videos.list больше не может ложно пометить запись как полностью неуспешную.",
      "Read-after-write verification делает несколько повторных чтений с backoff.",
      "Title/description сравниваются после нормализации переносов строк и пробелов.",
      "Ложный metadata verify больше не останавливает фазу расписания."
    ],
    "sections": {
      "features": [],
      "fixes": [
        "Успешный videos.update теперь считается фактом принятия метаданных YouTube; мгновенный videos.list больше не может ложно пометить запись как полностью неуспешную.",
        "Read-after-write verification делает несколько повторных чтений с backoff.",
        "Title/description сравниваются после нормализации переносов строк и пробелов.",
        "Ложный metadata verify больше не останавливает фазу расписания.",
        "PUBLISH TIME: 04:00 KRAT из SEO DOCX объединяется с датой из сетки VYRON и отправляется как RFC3339 +07:00 (Asia/Krasnoyarsk).",
        "Добавлены regression tests на KRAT time-only scheduling и metadata normalization."
      ],
      "interface": [],
      "reliability": [],
      "security": [
        "OAuth profiles, refresh tokens, channel bindings, локальное состояние, backups и ENDLUME settings не сбрасываются.",
        "Обновление продолжает использовать подписанный Tauri updater для Apple Silicon."
      ],
      "technical": [
        "Tags сравниваются семантически после нормализации, без зависимости от порядка массива.",
        "При scheduling VYRON сохраняет privacyStatus=private, как требует YouTube Data API для status.publishAt.",
        "Реальная ошибка расписания (invalidPublishAt и другие причины YouTube) показывается по конкретному видео."
      ]
    },
    "technicalItems": [
      "Tags сравниваются семантически после нормализации, без зависимости от порядка массива.",
      "При scheduling VYRON сохраняет privacyStatus=private, как требует YouTube Data API для status.publishAt.",
      "Реальная ошибка расписания (invalidPublishAt и другие причины YouTube) показывается по конкретному видео."
    ],
    "tag": "v0.9.7",
    "publishedAt": "2026-09-01T10:50:34Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.6",
    "title": "YouTube Metadata Write Fix",
    "type": "PATCH",
    "highlights": [
      "Сохранены channel ownership check, OAuth profile isolation и backup до массовой записи. VYRON не помечает операцию полностью успешной без повторного чтения YouTube.",
      "Исправлен критический сценарий массового применения SEO-метаданных к уже загруженным YouTube-видео.",
      "После каждой записи VYRON повторно читает YouTube и подтверждает фактически сохранённые значения.",
      "Ограничение тегов соответствует YouTube Data API: общий бюджет до 500 символов с учётом разделителей/кавычек; пустые и дублирующиеся теги удаляются."
    ],
    "sections": {
      "features": [
        "Сохранены channel ownership check, OAuth profile isolation и backup до массовой записи. VYRON не помечает операцию полностью успешной без повторного чтения YouTube."
      ],
      "fixes": [
        "Исправлен критический сценарий массового применения SEO-метаданных к уже загруженным YouTube-видео.",
        "После каждой записи VYRON повторно читает YouTube и подтверждает фактически сохранённые значения.",
        "Ограничение тегов соответствует YouTube Data API: общий бюджет до 500 символов с учётом разделителей/кавычек; пустые и дублирующиеся теги удаляются.",
        "Описание ограничивается 5000 UTF-8 bytes без разрыва многобайтных символов.",
        "Название ограничивается 100 символами и очищается от недопустимых угловых скобок.",
        "Backend возвращает раздельный результат metadataVerified / scheduleVerified и конкретную причину ошибки scheduleError.",
        "Экран «Метаданные» больше не проглатывает исключения. После операции сохраняется отчёт по каждому видео и видно, что именно не прошло.",
        "Кнопка применения показывает реальный прогресс N/M.",
        "Менеджер загруженных видео также различает полный успех и частичный успех «метаданные сохранены, расписание отклонено».",
        "Улучшено сообщение YouTube API: выводится и error.reason, если Google его вернул."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": [
        "Метаданные (title, description, tags) и расписание (privacyStatus, publishAt) теперь отправляются в YouTube отдельными фазами. Ошибка расписания больше не отменяет успешно записанные название, описание и теги."
      ]
    },
    "technicalItems": [
      "Метаданные (title, description, tags) и расписание (privacyStatus, publishAt) теперь отправляются в YouTube отдельными фазами. Ошибка расписания больше не отменяет успешно записанные название, описание и теги."
    ],
    "tag": "v0.9.6",
    "publishedAt": "2026-09-01T10:18:33Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.5",
    "title": "Operational Overhaul",
    "type": "PATCH",
    "highlights": [
      "Добавлен единый workflow статусов видео PRIVATE / SCHEDULED / PUBLIC с channel-scoped обработкой.",
      "Усилен сценарий работы с последними приватными роликами, включая режим «Последние 30 Private».",
      "Добавлен массовый выбор «Выбрать все» для рабочих операций с партиями видео.",
      "Доработаны экраны YouTube, Каналы, Аналитика, Конкуренты, Производство, Главная и Настройки под общий operational flow."
    ],
    "sections": {
      "features": [
        "Добавлен единый workflow статусов видео PRIVATE / SCHEDULED / PUBLIC с channel-scoped обработкой.",
        "Усилен сценарий работы с последними приватными роликами, включая режим «Последние 30 Private».",
        "Добавлен массовый выбор «Выбрать все» для рабочих операций с партиями видео.",
        "Доработаны экраны YouTube, Каналы, Аналитика, Конкуренты, Производство, Главная и Настройки под общий operational flow.",
        "Добавлен слой оценки/контроля состояния (ОЦЕНКА) без подмены реальных YouTube-данных вымышленными метриками.",
        "Доработан Autopilot Core и интеграция его состояния с основным интерфейсом.",
        "Добавлены отдельные автоматические тесты для YouTube workflow, state migration 0.9.5 и Autopilot.",
        "Backend YouTube/Rust обновлён вместе с frontend-контрактами; ARM64 Rust check проходит в release gate."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Обновление устанавливается поверх VYRON 0.9.4 и сохраняет существующее локальное состояние приложения. Updater artifact подписывается тем же VYRON updater key, что и предыдущие версии."
      ],
      "security": [
        "Усилена миграция локального state между версиями без сброса существующих OAuth-профилей и данных VYRON."
      ],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v0.9.5",
    "publishedAt": "2026-09-01T09:31:50Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.4",
    "title": "Automatic SEO DOCX Import",
    "type": "PATCH",
    "highlights": [
      "VYRON теперь принимает .docx напрямую в разделе YouTube → Загруженные.",
      "Word-файл разбирается как структурированный SEO pack, а не как обычный текстовый файл.",
      "Для DOCX действует строгая 1:1 проверка: количество выбранных видео должно совпадать с количеством блоков, а номера VIDEO 1..N не должны иметь пропусков или дублей.",
      "Если проверка не проходит, VYRON ничего не подставляет и показывает причину."
    ],
    "sections": {
      "features": [
        "VYRON теперь принимает .docx напрямую в разделе YouTube → Загруженные.",
        "Word-файл разбирается как структурированный SEO pack, а не как обычный текстовый файл.",
        "Для DOCX действует строгая 1:1 проверка: количество выбранных видео должно совпадать с количеством блоков, а номера VIDEO 1..N не должны иметь пропусков или дублей.",
        "Если проверка не проходит, VYRON ничего не подставляет и показывает причину.",
        "При смене канала ранее импортированный SEO pack очищается.",
        "PUBLISH TIME извлекается из Word-файла.",
        "Поддерживается KRAT как UTC+7, поэтому 04:00 KRAT превращается в корректный RFC3339/UTC момент для YouTube API.",
        "При «Расставить даты» VYRON использует время из SEO pack для каждого VIDEO, а дату строит от выбранной первой даты и cadence канала.",
        "Если в файле одно и то же время для всей пачки, поле первой даты автоматически переключается на это время."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Импорт не отправляет изменения в YouTube сам по себе: сначала данные подставляются локально для проверки.",
        "Фактическая отправка по-прежнему выполняется только по выбранным видео и сохраняет backup, channel ownership guard и verify-after-update.",
        "Никакие невыбранные видео не меняются."
      ],
      "technical": [
        "Поддерживается структура VIDEO N → TITLE → DESCRIPTION → TAGS → PUBLISH TIME.",
        "После успешной проверки Title, Description и Tags автоматически накладываются только на выбранную партию роликов.",
        "Релиз распространяется через существующий подписанный Tauri updater.",
        "Установленная 0.9.3 должна обнаружить 0.9.4 автоматически через внутреннее и системное уведомление об обновлении."
      ]
    },
    "technicalItems": [
      "Поддерживается структура VIDEO N → TITLE → DESCRIPTION → TAGS → PUBLISH TIME.",
      "После успешной проверки Title, Description и Tags автоматически накладываются только на выбранную партию роликов.",
      "Релиз распространяется через существующий подписанный Tauri updater.",
      "Установленная 0.9.3 должна обнаружить 0.9.4 автоматически через внутреннее и системное уведомление об обновлении."
    ],
    "tag": "v0.9.4",
    "publishedAt": "2026-09-01T07:54:27Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.3",
    "title": "Safe Batch + Notifications",
    "type": "PATCH",
    "highlights": [
      "После обновления можно синхронизировать библиотеку, нажать «Последние 30 Private», затем работать только с этой партией: метаданные → даты → проверка → отправка в YouTube.",
      "После синхронизации VYRON больше не выбирает все Private-видео автоматически.",
      "Добавлены явные области выбора: вручную галочками, «Последние 30 Private», «Все Private», «Снять все».",
      "Счётчик выбранных видео всегда виден перед массовыми действиями."
    ],
    "sections": {
      "features": [
        "После обновления можно синхронизировать библиотеку, нажать «Последние 30 Private», затем работать только с этой партией: метаданные → даты → проверка → отправка в YouTube."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "После синхронизации VYRON больше не выбирает все Private-видео автоматически.",
        "Добавлены явные области выбора: вручную галочками, «Последние 30 Private», «Все Private», «Снять все».",
        "Счётчик выбранных видео всегда виден перед массовыми действиями.",
        "«Расставить даты» работает только с выбранными роликами.",
        "Импорт Metadata GPT применяется только к выбранной группе и не затрагивает остальные видео канала.",
        "При переключении канала очищается предыдущая выборка/синхронизация, чтобы исключить случайную запись в другой канал.",
        "Отправка в YouTube по-прежнему использует backup, ownership guard и повторную проверку YouTube после videos.update."
      ],
      "technical": [
        "Автоматическая проверка остаётся включаемой в Settings → Обновления.",
        "Проверка выполняется при запуске, повторно через 30 секунд и затем каждые 6 часов, пока VYRON запущен.",
        "При обнаружении новой версии VYRON показывает встроенный UpdateNotice.",
        "Добавлено системное уведомление macOS через официальный Tauri notification plugin.",
        "Системное уведомление показывается один раз для каждой новой версии и не спамит при последующих проверках.",
        "При первом обновлении macOS может запросить разрешение на уведомления VYRON."
      ]
    },
    "technicalItems": [
      "Автоматическая проверка остаётся включаемой в Settings → Обновления.",
      "Проверка выполняется при запуске, повторно через 30 секунд и затем каждые 6 часов, пока VYRON запущен.",
      "При обнаружении новой версии VYRON показывает встроенный UpdateNotice.",
      "Добавлено системное уведомление macOS через официальный Tauri notification plugin.",
      "Системное уведомление показывается один раз для каждой новой версии и не спамит при последующих проверках.",
      "При первом обновлении macOS может запросить разрешение на уведомления VYRON."
    ],
    "tag": "v0.9.3",
    "publishedAt": "2026-09-01T07:39:19Z",
    "prerelease": false
  },
  {
    "date": "2026-09-01",
    "version": "0.9.2",
    "title": "Google OAuth Recovery",
    "type": "PATCH",
    "highlights": [
      "После установки 0.9.2 кнопка «+ Добавить YouTube аккаунт» должна быть доступна при наличии уже подключённого Lost Highway FM. Новый канал подключается обычным Google OAuth и автоматически добавляется в VYRON.",
      "Исправлена блокировка кнопки «+ Добавить YouTube аккаунт» после обновления, когда существующий OAuth-профиль сохранён, но отдельный google-config.json отсутствует.",
      "VYRON теперь автоматически восстанавливает Global Google Config из уже сохранённого OAuth-профиля (client_id + client_secret) и сохраняет его локально в app data.",
      "Существующие OAuth-профили, refresh tokens, каналы и локальное состояние не сбрасываются."
    ],
    "sections": {
      "features": [
        "После установки 0.9.2 кнопка «+ Добавить YouTube аккаунт» должна быть доступна при наличии уже подключённого Lost Highway FM. Новый канал подключается обычным Google OAuth и автоматически добавляется в VYRON."
      ],
      "fixes": [
        "Исправлена блокировка кнопки «+ Добавить YouTube аккаунт» после обновления, когда существующий OAuth-профиль сохранён, но отдельный google-config.json отсутствует.",
        "VYRON теперь автоматически восстанавливает Global Google Config из уже сохранённого OAuth-профиля (client_id + client_secret) и сохраняет его локально в app data.",
        "Существующие OAuth-профили, refresh tokens, каналы и локальное состояние не сбрасываются.",
        "Если ни глобального config, ни пригодного существующего OAuth-профиля нет, VYRON по-прежнему безопасно требует импорт credentials.json."
      ],
      "interface": [],
      "reliability": [],
      "security": [],
      "technical": []
    },
    "technicalItems": [],
    "tag": "v0.9.2",
    "publishedAt": "2026-09-01T06:55:01Z",
    "prerelease": false
  },
  {
    "date": "2026-08-31",
    "version": "0.9.1",
    "title": "Updater Bootstrap",
    "type": "PATCH",
    "highlights": [
      "В приложение впервые встраивается реальный публичный ключ Tauri Updater.",
      "Канал обновлений переводится на vyron-updates/latest.json с реальной подписью.",
      "Для macOS Apple Silicon публикуются VYRON.app.tar.gz, VYRON.app.tar.gz.sig, latest.json и обычный DMG.",
      "Версии до 0.9.1 использовали placeholder update feed и не имели рабочего доверенного канала подписанных обновлений. Поэтому 0.9.1 устанавливается вручную один последний раз. После этого 0.9.2 и следующие версии смогут приходить через встроенный VYRON Update Center."
    ],
    "sections": {
      "features": [
        "В приложение впервые встраивается реальный публичный ключ Tauri Updater.",
        "Канал обновлений переводится на vyron-updates/latest.json с реальной подписью.",
        "Для macOS Apple Silicon публикуются VYRON.app.tar.gz, VYRON.app.tar.gz.sig, latest.json и обычный DMG.",
        "Версии до 0.9.1 использовали placeholder update feed и не имели рабочего доверенного канала подписанных обновлений. Поэтому 0.9.1 устанавливается вручную один последний раз. После этого 0.9.2 и следующие версии смогут приходить через встроенный VYRON Update Center."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [
        "Identifier приложения не меняется.",
        "OAuth-профили, локальное состояние, Workspace, очереди, Metadata Hub и настройки не сбрасываются.",
        "Бизнес-логика VYRON 0.9.0 не переписывается: 0.9.1 является updater bootstrap поверх неё."
      ],
      "security": [],
      "technical": [
        "Дата подготовки: 31.08.2026",
        "Включается bundle.createUpdaterArtifacts = true.",
        "Release pipeline обязан получить TAURI_SIGNING_PRIVATE_KEY и TAURI_UPDATER_PUBLIC_KEY из GitHub Actions Secrets; без них релиз блокируется.",
        "Перед публикацией проходят unit tests, production frontend build, Rust ARM64 check, Tauri build, ARM64 binary check, codesign verify и DMG verify.",
        "CI отдельно проверяет, что приватный updater-key не попал в frontend dist или в release assets."
      ]
    },
    "technicalItems": [
      "Дата подготовки: 31.08.2026",
      "Включается bundle.createUpdaterArtifacts = true.",
      "Release pipeline обязан получить TAURI_SIGNING_PRIVATE_KEY и TAURI_UPDATER_PUBLIC_KEY из GitHub Actions Secrets; без них релиз блокируется.",
      "Перед публикацией проходят unit tests, production frontend build, Rust ARM64 check, Tauri build, ARM64 binary check, codesign verify и DMG verify.",
      "CI отдельно проверяет, что приватный updater-key не попал в frontend dist или в release assets."
    ],
    "tag": "v0.9.1",
    "publishedAt": "2026-08-31T17:28:36Z",
    "prerelease": false
  },
  {
    "date": "2026-08-31",
    "version": "0.9.0",
    "title": "VYRON 0.9.0",
    "type": "MINOR",
    "highlights": [
      "Новый VYRON Control Center с exception-based UX.",
      "Основная навигация сокращена до 7 разделов: Главная, Каналы, Производство, YouTube, Аналитика, Конкуренты, Настройки.",
      "Новый YouTube Center: Загруженные / Метаданные / Очередь / Календарь.",
      "Existing Videos Manager сохраняет uploads-playlist pagination и показывает аудит синхронизации."
    ],
    "sections": {
      "features": [
        "Новый VYRON Control Center с exception-based UX.",
        "Основная навигация сокращена до 7 разделов: Главная, Каналы, Производство, YouTube, Аналитика, Конкуренты, Настройки.",
        "Новый YouTube Center: Загруженные / Метаданные / Очередь / Календарь.",
        "Existing Videos Manager сохраняет uploads-playlist pagination и показывает аудит синхронизации.",
        "После каждого videos.update выполняется обязательный videos.list verify. Успех показывается только после подтверждения YouTube.",
        "Реальный Undo отправляет backup обратно в YouTube и также проходит verify.",
        "Thumbnail cache получил расширенный fallback и 3 попытки, UI получил явный Retry.",
        "Каналы и конкуренты переведены в полноширинные вертикальные карточки.",
        "YouTube Analytics расширена периодами, Content/Revenue/Traffic/Geography/Audience tabs и monetary permission.",
        "Revenue/RPM показываются только из реальных YouTube Analytics monetary данных. RPM не заменяет CPM.",
        "Конкуренты используют только публичные данные; private Revenue/RPM/CTR/retention конкурента не имитируются.",
        "Autopilot: OFF / ASSISTED / FULL.",
        "Производство объединяет очередь и входящие материалы, сохраняя ENDLUME workflow.",
        "Analytics snapshots сохраняются локально по channel/date.",
        "Update Center проверяет обновления на запуске, через 30 секунд и каждые 6 часов.",
        "Thumbnail Impressions / CTR отображаются только при наличии реального источника данных; CTR не вычисляется из views.",
        "Audience-срезы показываются только если соответствующий YouTube report реально доступен.",
        "Остаток YouTube API quota не возвращается Data API как прямой счётчик и не выдумывается."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Жёсткая защита записи между аккаунтами: video.channelId должен совпадать с oauthProfile.channelId.",
        "Accounts перенесены в Настройки → YouTube без удаления OAuth-профилей и refresh tokens."
      ],
      "technical": [
        "Дата релиза: 31.08.2026",
        "Перед массовой записью создаётся локальный backup исходных title/description/tags/publishAt/privacy.",
        "Подписанный Tauri updater публикуется только если в GitHub Actions настроен приватный signing key."
      ]
    },
    "technicalItems": [
      "Дата релиза: 31.08.2026",
      "Перед массовой записью создаётся локальный backup исходных title/description/tags/publishAt/privacy.",
      "Подписанный Tauri updater публикуется только если в GitHub Actions настроен приватный signing key."
    ],
    "tag": "v0.9.0",
    "publishedAt": "2026-08-31T16:39:18Z",
    "prerelease": false
  },
  {
    "date": "2026-08-31",
    "version": "0.5.0",
    "title": "CONTENT OS",
    "type": "MINOR",
    "highlights": [
      "ChannelFlow is now VYRON — CONTENT OS.",
      "macOS application bundle is renamed to VYRON.app.",
      "Existing Documents/ChannelFlow workspace is automatically migrated to Documents/VYRON when it is safe to do so. If macOS blocks the rename, VYRON keeps using the legacy folder rather than risking data loss.",
      "Free-first metadata workflow is clarified: ChatGPT Plus + Metadata Inbox is the default; paid OpenAI API remains optional and is not required."
    ],
    "sections": {
      "features": [
        "ChannelFlow is now VYRON — CONTENT OS.",
        "macOS application bundle is renamed to VYRON.app.",
        "Existing Documents/ChannelFlow workspace is automatically migrated to Documents/VYRON when it is safe to do so. If macOS blocks the rename, VYRON keeps using the legacy folder rather than risking data loss.",
        "Free-first metadata workflow is clarified: ChatGPT Plus + Metadata Inbox is the default; paid OpenAI API remains optional and is not required."
      ],
      "fixes": [],
      "interface": [],
      "reliability": [],
      "security": [
        "Existing license, app data, YouTube OAuth profiles, channels, jobs and settings are preserved by keeping the compatibility identifier internally.",
        "UI, activation, About, diagnostics, OAuth callback and update notices use the VYRON brand."
      ],
      "technical": [
        "Update configuration adds the VYRON feed while retaining the legacy ChannelFlow feed during migration."
      ]
    },
    "technicalItems": [
      "Update configuration adds the VYRON feed while retaining the legacy ChannelFlow feed during migration."
    ],
    "tag": "v0.5.0",
    "publishedAt": "2026-08-31T07:50:02Z",
    "prerelease": false
  }
];
const releaseMoment=(x:ReleaseHistoryEntry)=>Date.parse(x.publishedAt||`${x.date}T23:59:59Z`);
export const VYRON_FIRST_RELEASE=VYRON_RELEASE_HISTORY.reduce((first,row)=>releaseMoment(row)<releaseMoment(first)?row:first);
export const VYRON_CURRENT_RELEASE=VYRON_RELEASE_HISTORY[0];
export function groupReleaseHistoryByDay(rows:ReleaseHistoryEntry[]=VYRON_RELEASE_HISTORY){const m=new Map<string,ReleaseHistoryEntry[]>();for(const row of rows){const a=m.get(row.date)||[];a.push(row);m.set(row.date,a)}return[...m.entries()].sort((a,b)=>b[0].localeCompare(a[0]))}
