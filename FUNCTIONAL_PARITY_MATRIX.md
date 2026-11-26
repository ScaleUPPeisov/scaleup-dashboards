# VYRON 7.0 APEX — реестр функционального соответствия

Срез: исходный релиз 6.1.17 `e65bae680637f5c2a8cc60a886a17691d5694263` и ветка `feature/vyron-7-apex` на `e7d85fd2`. Исходный коммит доступен в локальном Git; перечисленные ниже компоненты существуют в обоих срезах, кроме явно отмеченных новых элементов. Источники — код и существующие тесты, а не демонстрационные обработчики HTML-эталона.

**Состояние: неполный рабочий реестр, не акт приёмки.** Названия тестов показывают, где искать автоматические проверки, а не доказывают проверку всех сценариев. Последний ранее подтверждённый общий прогон: 1 312 JavaScript-тестов и один пропущенный opt-in генератор; он не заменяет ручную проверку 6.1.17 и APEX. Для каждой строки функциональный и визуальный результат на физическом Mac пока **не подтверждён**. Статус PASS не присвоен ни одной строке.

В ячейках «Маршрут / текущая логика» указан текущий пользовательский путь или место размещения; это не утверждение о соответствии эталону. Для закрытия каждой строки необходимо проверить исходное и новое действие, положительный и ошибочный сценарии и подтвердить неизменность данных. Указанные пути относятся к исходникам в этом репозитории.

## Оболочка и основные разделы

| ID | Функция | Оригинал / исходный обработчик | Маршрут / текущая логика | Существующие тесты / результат |
|---|---|---|---|---|
| SHELL-01 | Навигация по основным разделам | `src/App.tsx`: `Sidebar`, `PageRouter` | `App.tsx`, псевдонимы `autopilot`, `metadata`, `existing`, `publisher`, `accounts`, `content` | `src/uiOverflowAudit.test.ts`, `src/v610M1RoutePerformance.test.ts`; реальная навигация не проверена |
| SHELL-02 | Текущая версия, квоты, статусы и активные ошибки | `App.tsx`: `Topbar` | Общая верхняя панель; состояние через соответствующие хранилища | `src/v610GlobalUploadCounter.test.ts`, `src/youtubeQuota.test.ts`; UI не проверен |
| SHELL-03 | Глобальный поиск по Cmd/Ctrl+K | `src/CommandPalette.tsx` | `CommandPalette` в `App.tsx` | Горячие клавиши и результаты в живом приложении не проверены |
| SHELL-04 | Уведомления, история, действия и группировка toast | `src/NotificationStack.tsx`, `src/notificationCenter.ts` | Центр и очередь `notificationToastQueue.ts` | `src/notificationToastQueue.test.ts`, `src/notificationPersistence.test.ts`; массовая физическая нагрузка не проверена |
| HOME-01 | Сводка каналов и статистики | `src/DashboardOS.tsx`: `OperationsDashboard` | Главная; текущие данные каналов и сохранённые снимки | `src/dashboardLocalInventory.test.ts`, `src/dashboardApexTelemetry.test.tsx`; полный экран не принят |
| HOME-02 | Обновление всех каналов с предварительной оценкой | `DashboardOS.tsx`: `previewAllChannelStatistics` | Главная → подтверждение и обновление | `src/v502FullRefresh.test.ts`; вызовы YouTube на тестовом аккаунте не проверены |
| HOME-03 | Текущие загрузки и системное состояние | `DashboardOS.tsx`, `UploadCenter.tsx` | Главная → карточки загрузок / системы | `src/uploadTelemetry.test.ts`, `src/dashboardApexTelemetry.test.tsx`; параллельная физическая проверка отсутствует |
| CHANNEL-01 | Список, поиск, выбор и сортировка каналов | `src/ChannelsOS.tsx` | Каналы | `src/channelSort.test.ts`, `src/channelsApex.test.tsx`; 33 реальных канала в APEX не открывались |
| CHANNEL-02 | Будущий канал и проверка конфликта имён | `ChannelsOS.tsx`: `createFuture` | Каналы / Производство → будущий канал | `src/futureChannelFlow.test.ts`, `src/channelIdentity.test.ts`; реальное создание не выполнялось |
| CHANNEL-03 | Настройки и маршрутизация активного канала | `ChannelsOS.tsx`: `openYoutube`; `src/publishWorkspaceState.ts` | Каналы → публикация / расписание / аккаунты | `src/youtubeActiveChannelMetadata.test.ts`; переходы на всех каналах не проверены |
| PROD-01 | Просмотр очереди и фильтрация | `src/ProductionOS.tsx`, `src/ProductionWorkspace.tsx` | Производство → обзор и подробная очередь | `src/productionQueueView.test.ts`, `src/v610M1RoutePerformance.test.ts`; визуальная приёмка не выполнена |
| PROD-02 | Создание количества проектов, один / все каналы | `ProductionOS.tsx`: `createExact`, `maintainBuffer` | Производство → создать проекты / поддержать буфер | `src/productionPipeline.test.ts`; 10/20/30/50 проектов не измерены |
| PROD-03 | Выбор корня, состояние и отдельная папка канала | `ProductionOS.tsx`: `chooseProjectRoot` | Производство → хранилище | `tests/productionRoot_v1011.test.ts`; запись на TOSHIBA не выполнялась и запрещена |
| PROD-04 | Сбор изображений из входящей папки, остановка и продолжение | `src/ProductionManager.tsx`: `toggleImport`; `src-tauri/src/production_manager.rs`: `start_production_import`, `stop_production_import` | Производство → сборка | Rust-тесты `acceptance_existing_downloads_are_collectible_on_start`, `import_reservation_blocks_duplicate_start_until_watcher_finishes`, `image_collector_skips_seen_metadata_but_keeps_unseen_order`; реальный диск не проверен |
| PROD-05 | Выбор и индексация музыкальной библиотеки | `ProductionManager.tsx`: `chooseMusic`, `reindexMusic`; Rust `index_production_music_library` | Материалы / сборка → музыка | `src/v510MaterialsManager.test.ts`; Rust `cached_music_name_sort_matches_original_comparator_and_stable_ties`; скорость не измерена |
| PROD-06 | Пакетная сборка, количество проектов и треков, повторное использование | `ProductionManager.tsx`: `buildBatch`; Rust `build_production_batch` | Производство → сборка проектов | `tests/vyron-603-production-hotfix.test.mjs`; реальный прогон и сохранность источников требуют проверки |
| PROD-07 | Ручная сборка из выбранных файлов | `src/MaterialsManager.tsx`: `buildManualProjects`; Rust `build_manual_production_batch` | Материалы → ручная сборка | `src/v512ManualAssembly.test.ts`, `src/manualAssemblyCore.test.ts`; интеграция с ENDLUME не подтверждена |
| PROD-08 | Назначение и изоляция изображений по каналу | `MaterialsManager.tsx`: `importImages`; Rust `materials_manager::import_images`, `mark_assigned` | Материалы → изображения | Rust `duplicate_images_within_one_import_are_not_copied_twice`, `wrong_channel_assignment_is_blocked`; оригиналы на диске не затронуты |
| PROD-09 | Валидация проекта / выбранных проектов | `ProductionManager.tsx`: `validateBatch`; Rust `validate_production_batch`, `validate_production_projects` | Производство → пакет | Rust `production_validation_worker_matches_sync_results_and_preserves_files`; реальный ENDLUME не запущен |
| PROD-10 | Передача и повторная отправка в ENDLUME | `ProductionManager.tsx`: `openEndlume`, `waitForHandoff`; Rust `open_production_batch_in_endlume` | Производство → ENDLUME | `src/productionProjectSelection.test.ts`; обмен с работающим ENDLUME не подтверждён |
| PROD-11 | Восстановление сборки и незавершённой сессии | `ProductionManager.tsx`: `resume`; `src/RecoveryGate.tsx`, `src-tauri/src/recovery.rs` | Производство / восстановление | `src/nativeRecoverySafety.test.ts`, `src/v320RecoveryContracts.test.ts`; реальное восстановление не выполнялось |
| PROD-12 | Удаление выбранных проектов и безопасная очистка | `ProductionManager.tsx`: `deleteBatchProjects`, `cleanupRenderedProject`; `ProductionOS.tsx`: `beginGlobalProjectCleanup` | Производство → предварительная проверка / подтверждение | `src/v2111GlobalCleanup.test.ts`, `src/globalCleanupExecutor.test.ts`; операции на реальных файлах запрещены |
| PROD-13 | Архивирование завершённых видео | `ProductionManager.tsx`: `archiveRenderedVideos`; Rust `archive_production_rendered_videos` | Производство → пакет | Нужны синтетическая и ручная проверки; оригинальные видео не перемещались |
| PROD-14 | Переходы рендера, дедупликация, пакет состояния | `src/ProductionStatusBridge.tsx`, `src/productionRenderTransitions.ts` | Фоновый мост производства и уведомления | `src/productionStatusBatch.test.tsx`, `src/productionRenderTransitions.test.ts`; стабильность UI при реальном рендере не измерена |
| STOCK-01 | Физический запас по папкам, единичная / общая проверка | `src/LiveContentInventory.tsx`: `chooseRenderFolder`, `scanInventoryChannel`, `scanAllInventories` | Запас видео | `src/inventoryApex.test.tsx`, `src/v334LiveContentInventory.test.ts`; фактическое сканирование TOSHIBA не выполнялось |
| STOCK-02 | Неизвестные, устаревшие и нулевые данные | `src/renderInventoryRuntime.ts`, `src/dashboardLocalInventory.ts` | Запас / Главная | `src/dashboardLocalInventory.test.ts`, `src/v612NativeInventoryTruth.test.ts`; необходима визуальная и физическая проверка |
| STOCK-03 | Отпечатки, новое поколение и защита от повтора | `src/publisherInventoryReconcile.ts`, `src/storageLifecycle.ts` | Запас → публикация / проверка поколения | `src/renderFingerprintMatcher.test.ts`, `src/vyron617CurrentGenerationLeafRecovery.test.ts`; реальную загрузку не запускали |
| HIST-01 | Журнал событий и фильтры | `src/HistoryPage.tsx`, `src/activityJournalCore.ts` | История | `src/historyApex.test.tsx`, `src/v2115Rc4ActivityJournal.test.ts`; все типы событий вручную не проверены |

## YouTube, публикации и расписание

| ID | Функция | Оригинал / исходный обработчик | Маршрут / текущая логика | Существующие тесты / результат |
|---|---|---|---|---|
| YT-01 | Выбор активного канала без потери состояния | `src/YouTubeChannelBar.tsx`, `src/publishWorkspaceState.ts` | YouTube → все вкладки | `src/scheduleChannelSelector.test.ts`, `src/youtubeActiveChannelMetadata.test.ts`; все каналы вручную не проверены |
| PUB-01 | Выбор готовых видео и папок | `src/PublisherOS.tsx`: `chooseChannelRenderFolder`, `chooseChannelProjectsFolder`, `scanRenderFolder`; `src/PublisherVideoPicker.tsx` | YouTube → Публикация | `src/vyron615PublisherHotfix.test.ts`, `src/vyron619PublisherAlwaysOpen.test.tsx`; реальная проверка не выполнена |
| PUB-02 | Импорт DOCX и назначение метаданных | `PublisherOS.tsx`: `readDoc`, `applyLocalPreparation` | Публикация → метаданные | `tests/metadata.test.ts`, `src/publisherMetadata.test.ts`; все форматы и конкретные файлы требуют отдельной проверки |
| PUB-03 | Подбор и сопоставление обложек | `PublisherOS.tsx`: `chooseThumbnails` | Публикация → обложки | `src/vyron618PublisherIntegrity.test.ts`; физические файлы не проверялись |
| PUB-04 | Проверка пакета, ограничения и постановка в очередь | `PublisherOS.tsx`: `runDryRun`, `runBatch`; `src/uploadQueue.ts` | Публикация → проверка / запуск | `src/youtubePublishSafety.test.ts`, `src/uploadQueue.test.ts`; реальную отправку не запускали |
| PUB-05 | Продолжение прерванной загрузки | `PublisherOS.tsx`: `resumeUpload`; `api.youtubeResumeUpload` | Публикация → Recovery | `src/v2100PublishRecovery.test.ts`, `src/vyron617CurrentGenerationLeafRecovery.test.ts`; сессия YouTube не воспроизводилась |
| PUB-07 | Продолжение загрузки мимо общей очереди | `src/PublisherOS.tsx`: `resumeUpload` напрямую вызывает `api.youtubeResumeUpload` | Публикация → Recovery | Требуется доказать совместимость с единым ограничением параллельности и взаимным исключением; физическая проверка не выполнена |
| PUB-06 | Сверка загруженных и удалённых видео | `PublisherOS.tsx`: `reconcileExistingUploads`, `clearRemoteMissing` | Публикация → сверка | `src/publisherInventoryReconcile.ts`, `src/v610PublisherInventoryReconcile.test.ts`; API не вызывался |
| BATCH-01 | Выбор каналов и массовые действия | `src/BatchControl.tsx`: `toggle`, `selectAll`, `request`, `run` | YouTube → массовые операции; единая очередь `enqueueUpload` | `src/batchControlContract.test.ts`; реальную очередь не запускали |
| BATCH-02 | Количество видео отдельно для каждого канала | `BatchControl.tsx`: `run('queue')` использует готовые задачи и лимиты | Целевая панель массовой публикации | **Не подтверждено:** в `BatchControl` отдельный выбор количества на канал не найден; необходимо проверить другие маршруты и реализовать без второй очереди |
| BATCH-03 | Квоты, отпечатки и дубликаты до очереди | `BatchControl.tsx`: `run('queue')`; `api.localSourceStatus`, `api.youtubeFileFingerprint` | Массовая постановка в существующую очередь | `src/youtubeQuotaAtomic.test.ts`, `src/youtubePublishSafety.test.ts`; end-to-end не проверен |
| UPLOAD-01 | Глобальная очередь, пауза / продолжение / отмена | `src/UploadCenter.tsx`, `src/uploadQueueRuntime.ts` | Центр загрузок доступен из общей оболочки | `src/uploadCenterWiring.test.ts`, `src/uploadQueue.test.ts`; работа при переключении реальных экранов не проверена |
| UPLOAD-02 | Прогресс, обработка YouTube, история | `UploadCenter.tsx`, `src/UploadProcessingMonitor.tsx` | Центр загрузок | `src/uploadTelemetry.test.ts`, `src/v2115Rc4ActivityJournal.test.ts`; реальная сеть не использовалась |
| UPLOAD-03 | Очистка подтверждённых локальных источников | `UploadCenter.tsx`: `scanLocalSources`, `trashVerified`; `api.trashLocalFile` | Центр загрузок → безопасная очистка | `src/postUploadCleanup.global.test.ts`, `src/globalCleanupExecutor.test.ts`; TOSHIBA не изменялся |
| META-01 | Импорт файлов DOCX / TXT / JSON / CSV и черновик | `src/MetadataPage.tsx`: `readFiles`, `parsePaste`, `persistCurrentDraft` | YouTube → Метаданные | `tests/metadata.test.ts`, `src/metadataWorkspaceState.test.ts`; все форматы вручную не проверены |
| META-02 | Назначение будущим проектам / YouTube | `MetadataPage.tsx`: `applyFuture`, `applyYoutube`, `apply` | Метаданные → будущие проекты / YouTube | `src/youtubeMetadataPostWriteVerification.test.ts`, `src/metadataAssignmentBridge.test.tsx`; внешний write не выполнялся |
| META-03 | Очередь пакетов метаданных и резервирование | `src/MetadataQueuePanel.tsx`, `src/MetadataQueueAssignmentBridge.tsx`; `api.metadataQueueReserveBatch` | Метаданные → очередь | `src/v610MetadataQueue.test.ts`, `src/metadataAssignmentCandidates.test.ts`; SQLite-файлы APEX не переносились |
| SCHED-01 | Ежедневный, через день, N дней и шаблон публикаций | `MetadataPage.tsx`: `selectInterval`, `selectPattern`, `changePattern` | Метаданные / Расписание | `src/channelSchedule.test.ts`, `src/vyron619ScheduleSources.test.ts`; точные режимы 2/2 и 3/1 требуют визуальной проверки |
| SCHED-02 | Продолжение расписания / ручное начало | `src/scheduleContinuation.ts`, `src/ScheduleOS.tsx` | Расписание | `src/scheduleContinuation.test.ts`, `src/schedulePhysicalRegression.test.ts`; живой YouTube не менялся |
| SCHED-03 | Обновление только даты, предварительный просмотр и восстановление | `ScheduleOS.tsx`: `sync`, `apply`, `continueRecovery`; `api.youtubeUpdateExistingSchedule` | YouTube → Расписание | `src/scheduleOnlyContracts.test.ts`, `src/scheduleChannelSelector.test.ts`; внешний write не выполнялся |
| EXIST-01 | Загруженные видео, фильтры, синхронизация | `src/ExistingVideos.tsx`: `sync`, фильтры | YouTube → Загруженные | `src/youtubeExistingV211.test.ts`, `tests/youtubeExisting.test.ts`; live-синхронизация не выполнялась |
| EXIST-02 | Редактирование и отмена метаданных / плейлиста | `ExistingVideos.tsx`: `undo`; `api.youtubeUpdateExisting`, `api.youtubePlaylistMembership` | Загруженные → подтверждение / Undo | `src/youtubeApplyVerification.test.ts`; live-модификация и Undo не выполнялись |
| PLAN-01 | План каналов и обновление расписания | `src/ChannelRunway.tsx`: `syncChannel`, `refreshRowStats` | YouTube → План каналов | `src/channelRunway.test.ts`, `src/channelPlanYoutubeCoverage.test.ts`; индивидуальные графики 33 каналов не проверены |
| QUOTA-01 | Учёт, лимиты, предохранители API / загрузок | `src/youtubeQuota.ts`, `src/youtubePublishSafety.ts`, `src/QuotaMeter.tsx` | Верхняя панель / YouTube / настройки | `src/dynamicUploadQuota.test.ts`, `src/publisherQuota.test.ts`; live-квота не проверялась |

## Аналитика, инструменты и настройки

| ID | Функция | Оригинал / исходный обработчик | Маршрут / текущая логика | Существующие тесты / результат |
|---|---|---|---|---|
| ANALYTICS-01 | Обзор и графики выбранного периода | `src/Analytics360Page.tsx`: `load`, `Graph`; `src/AnalyticsPage.tsx` | Аналитика → обзор / резервный экран | `src/analytics360Core.test.ts`, `src/analyticsApexMetrics.test.ts`; реальный визуальный график не принят |
| ANALYTICS-02 | Сбор истории одного / всех каналов | `Analytics360Page.tsx`: `syncDeep`, `quickRefresh` | Аналитика → сбор / настройки сбора | `tests/vyron-mac-analytics-sync-worker.test.mjs`; API не вызывался |
| ANALYTICS-03 | Видео, аудитория, источники, удержание и экспорт | `Analytics360Page.tsx`: `VideoPanel`; `src/AiAnalyticsExport.tsx` | Аналитика → вкладки и экспорт | `src/Analytics360Fleet.test.ts`; каждый график и экспорт не проверены вручную |
| WINNER-01 | Рейтинг и аномалии на локальных данных | `src/Analytics360Winners.tsx`, `filterAndSortWinnerVideos` | Аналитика → Лучшие видео | `src/Analytics360Winners.test.ts`, `src/analytics360Apex.test.tsx`; фактические данные не исследовались повторно |
| COMP-01 | Добавление, удаление, обновление и поиск конкурентов | `src/CompetitorsPage.tsx`: `addOne`, `refreshOne`, `refreshAll`, `discover` | Конкуренты | `src/competitorMath.test.ts`; запросы к YouTube не выполнялись |
| COMMAND-01 | Приоритет, запас и переход к производству | `src/CommandCenter.tsx`: `openProduction`; `src/commandCenterCore.ts` | Командный центр | `src/commandCenter.test.ts`, `src/commandCenterRuntimeHotfix.test.tsx`; фактические приоритеты не подтверждены |
| AUTH-01 | Настройка OAuth Client и безопасное восстановление | `src/AccountsPage.tsx`: `importCredentials`, `recoverSavedGlobalOauth`; `src/AuthRecoveryCenter.tsx` | YouTube → Аккаунты / Настройки | `src/authRecoveryCore.test.ts`, `src/finalAuthRecoveryUi.test.ts`; секреты не открывались |
| AUTH-02 | Подключение, выбор канала, повторный вход, отмена | `AccountsPage.tsx`: `askBrowser`, `reconnectExisting`, `chooseNewAuthorizedChannel`, `cancelNewChannelSelection` | Аккаунты → браузер / выбор канала | `src/v2114OauthOnboarding.test.ts`, `src/v2113ExistingChannelRebind.test.ts`; Google login не выполнялся |
| AUTH-03 | Диагностика 33 существующих профилей / Keychain | `AccountsPage.tsx`: `checkProfile`, `safeRetryProfile`, `checkAll`; `api.youtubeOauthCredentialStates` | Аккаунты / настройки диагностики | `src/v213KeychainRecovery.test.ts`, `src/accountApexStatus.test.ts`; live Keychain не проверялся |
| AUTH-04 | Перенос защищённого snapshot | `src-tauri/src/oauth_vault.rs`, тестовый `oauth_snapshot_transaction.rs` | Отдельный будущий процесс импорта | Rust `oauth_snapshot_transaction::tests` с 33 фиктивными связками; **реальный перенос не реализован / не проверен** |
| SETTINGS-01 | Рабочая папка и предварительный просмотр структуры | `src/SettingsOS.tsx`: `chooseVyronRoot`, `applyVyronRoot`; `api.vyronFilesystemPreview` | Настройки → общие | `src/settingsApex.test.tsx`; применение к TOSHIBA запрещено |
| SETTINGS-02 | Плотность, уменьшение анимаций, RPM, автопилот | `SettingsOS.tsx`: `Toggle`, `saveRpm`, `setMode` | Настройки → общие | `src/v501OwnerHotfix.test.ts`, `src/settingsApex.test.tsx`; каждое состояние не проверено вручную |
| SETTINGS-03 | ENDLUME, OAuth-диагностика, лицензия | `SettingsOS.tsx`, `src/OAuthInventoryPanel.tsx` | Настройки → соответствующие разделы | `src/v213KeychainRecovery.test.ts`; реальные секреты и лицензия APEX не проверены |
| SETTINGS-04 | Обновления и защита активных операций | `SettingsOS.tsx`: `checkForUpdate`, `installDownloadedUpdate`; `src/updaterRuntime.ts` | Настройки → обновления | `src/updaterGuard.test.ts`, `src/updaterPolicy.test.ts`; установка 7.0 не выполнялась |
| SETTINGS-05 | Резервирование и восстановление | `src/MigrationPanel.tsx`, `src-tauri/src/storage.rs`, `src-tauri/src/oauth_vault.rs` | Настройки → резервные копии | `src/nativeRecoverySafety.test.ts`; восстановление в рабочие каталоги и Keychain не выполнялось |

## Данные, фоновые сервисы и границы изоляции

| ID | Возможность | Исходный компонент / операция | Размещение в APEX | Проверка / результат |
|---|---|---|---|---|
| DATA-01 | Загрузка и сохранение локального состояния | `src-tauri/src/storage.rs`: `load_state_in_background`, `save_state` | `src/api.ts`, отдельный APEX storage | `src/apexDataPaths.test.ts`; полное восстановление реальных данных не выполнялось |
| DATA-02 | JSON-снимки YouTube inventory | `src-tauri/src/youtube_inventory_store.rs`: `youtube_inventory_read`, `youtube_inventory_write`, `youtube_inventory_delete` | `src/existingInventoryNative.ts` | `src/v612NativeInventoryTruth.test.ts`, `src/v612NativeInventoryStress.test.ts`; пользовательские БД не модифицировались |
| DATA-03 | SQLite / локальный кэш Analytics 360 | `src-tauri/src/analytics360_cache.rs`: `analytics360_read`, `analytics360_fleet` | `src/Analytics360Page.tsx` | `src/Analytics360Fleet.test.ts`; перенос и фактические записи не проверены |
| DATA-04 | Журнал восстановления | `src-tauri/src/recovery.rs`: `checkpoint`, `complete`, `recovery_candidates` | `RecoveryGate`, производство | `src/nativeRecoverySafety.test.ts`; отключение питания не проверялось |
| DATA-05 | История загрузок и video ID | `src/storageLifecycle.ts`, `src/youtubePublishSafety.ts` | Publisher / история / очередь | `src/storageLifecycle.test.ts`, `src/v503UploadCounterRestore.test.ts`; реальная миграция не проведена |
| DATA-06 | OAuth vault и Keychain namespace | `src-tauri/src/oauth_vault.rs`, `src-tauri/src/security.rs` | `apex_paths`, `apex_guard` | `src/apexKeychainIsolation.test.ts`; доступ к реальному Keychain не проверялся |
| BG-01 | Наблюдение папок и локальный запас | `src/LiveInventoryBridge.tsx`, `src-tauri/src/inventory_watch.rs` | Общая оболочка | `src/renderScanScheduler.test.ts`, `src/renderInventoryResponsiveness.test.ts`; длительная работа на HDD не проверена |
| BG-02 | Статистика, восстановление загрузок и обработка | `src/ChannelStatisticsScheduler.tsx`, `src/UploadProcessingMonitor.tsx`, `src/RecoveryGate.tsx` | Общая оболочка | `src/startupQuotaProbe.test.ts`, `src/v2100PublishRecovery.test.ts`; одновременная нагрузка не измерена |
| BG-03 | Сохранённый прямой автозагрузчик | `src/youtubeAutopilot.ts`: `runYoutubeAutopilotForChannel` вызывает `api.youtubeUpload` / `api.youtubeResumeUpload` напрямую | Текущий `autopilotRuntime.ts` не вызывает этот путь; `src/v501OwnerHotfix.test.ts` проверяет отсутствие вызова | **Не считать единым runtime без проверки:** по поиску production-кода вызовов не обнаружено; не подключать к UI без согласования с единой очередью |
| BG-04 | Старый локальный Publisher | `src/App.tsx`: `function Publisher()` содержит прямой `api.youtubeUpload` | В текущем `PageRouter` `publisher` маршрутизируется в `YouTubeCenter`; ссылок на локальный компонент в `App.tsx` кроме декларации не найдено | **Вероятно недостижим, требует подтверждения:** нельзя повторно подключить как независимую очередь при редизайне |
| ISO-01 | Только чтение внешних материалов | `src-tauri/src/apex_guard.rs`, `scripts/apex_isolation/` | Экспериментальный запуск | Синтетические тесты не доказывают полную файловую изоляцию; APEX не запускался |
| ISO-02 | Сетевые запросы WebKit / Publisher | `scripts/apex_isolation/webkit_probe.py`, `scripts/apex_isolation/webkit_filters_probe.py` | Пока только синтетический стенд | Показан обход `deny network*` WebKit; фильтр ограниченного набора прошёл фиктивный тест, HTTPS/WSS/WebRTC/XPC не доказаны; guard сохранён |
| ISO-03 | Независимая резервная копия внешних материалов | Владелец принял отсутствие второго накопителя | Вне области переноса / тестирования | Принятый риск; не препятствует разработке. Не копировать и не изменять TOSHIBA EXT |

Покнопочный статический инвентарь элементов и привязок находится в [FUNCTIONAL_CONTROL_INVENTORY.md](FUNCTIONAL_CONTROL_INVENTORY.md). Динамические варианты и подтверждение каждого сценария остаются открыты.

Сопоставление исходного Git-среза и коммита APEX: [FUNCTIONAL_CONTROL_DIFF.md](FUNCTIONAL_CONTROL_DIFF.md); дополнительно снят [рабочий каталог с незакоммиченными изменениями](FUNCTIONAL_CONTROL_DIFF_WORKTREE.md). Генератор и команда воспроизведения указаны в отчётах. [Ручная классификация расхождений](FUNCTIONAL_CONTROL_REVIEW.md) отдельно фиксирует изменённую область открытия Publisher в запасе и открытый вопрос количества видео на канал. Для коммитов точного структурного соответствия нет у 63 исходных JSX-узлов; это список ручной проверки, не количество утраченных функций. Для рабочего снимка таких узлов 64. Исходный фильтр Производства `setFilter` изменён на `changeQueueFilter`; массовый запуск в рабочем снимке содержит дополнительную проверку подтверждения: семантику обоих изменений ещё нужно проверить.

## Оставшееся для полноценной матрицы

1. Разбить перечисленные группы на **каждую** кнопку, меню, диалог, переключатель, клавиатурную команду и каждую точку IPC/SQLite с уникальным ID; сверить исходный релиз и финальные маршруты, не обследуя заново внешние материалы.
2. Для каждого пункта зафиксировать положительный сценарий, ошибки, фактический тест, результат и скриншот APEX рядом с утверждённым эталоном. Особо проверить массовую публикацию и индивидуальное количество видео на канал.
3. На синтетических данных проверить изоляцию файлов, WebKit и сетевых помощников, отсутствие второго рабочего Publisher, точное восстановление и отсутствие записи в данные 6.1.17. **Не снимать guard, пока эти доказательства отсутствуют.**
4. Только после безопасного запуска выполнить измерения времени кадров и отклика, CPU/GPU/RAM/нагрева, сборку 10/20/30/50 проектов и длительную одновременную работу; сравнить с физическим 6.1.17 и зафиксированным APEX baseline.
5. До проверки всех строк, сохранности авторизаций и подписанной сборки не утверждать 100% функционального соответствия и не заменять рабочую 6.1.17.

## Инвентарь зарегистрированных Tauri IPC-команд

Автоматически снят по `src-tauri/src/lib.rs` на HEAD `090e218f`; регистрация в исходном релизе сверена с `e65bae680637f5c2a8cc60a886a17691d5694263`. Упоминания в интерфейсе и тестах найдены по точной строке команды: это указатели для трассировки, не доказательство достижимости или работающего сценария. Прямые API Tauri-плагинов и динамически сформированные вызовы требуют отдельной проверки. **Для всех строк результат функциональной проверки: не подтверждён.**

| ID | Зарегистрированный обработчик | 6.1.17 | Строковые упоминания в интерфейсе | Тесты, содержащие строку команды |
|---|---|---|---|---|
| IPC-001 | `src-tauri/src/studio_drafts.rs`: `studio_drafts_start_bridge` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-002 | `src-tauri/src/studio_drafts.rs`: `studio_drafts_list` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-003 | `src-tauri/src/studio_drafts.rs`: `studio_drafts_clear` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-004 | `src-tauri/src/updater_bridge.rs`: `updater_install_preflight` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-005 | `src-tauri/src/updater_bridge.rs`: `updater_runtime_diagnostics` | зарегистрирован | `src/api.ts` | `src/v612RealMacUpdaterHotfix.test.ts` |
| IPC-006 | `src-tauri/src/updater_bridge.rs`: `prepare_updater_tempdir` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-007 | `src-tauri/src/updater_bridge.rs`: `updater_runtime_identity` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-008 | `src-tauri/src/updater_bridge.rs`: `updater_stable_check` | зарегистрирован | `src/api.ts` | `src/v612RealMacUpdaterHotfix.test.ts` |
| IPC-009 | `src-tauri/src/updater_bridge.rs`: `updater_stable_download` | зарегистрирован | `src/api.ts` | `src/v612RealMacUpdaterHotfix.test.ts` |
| IPC-010 | `src-tauri/src/updater_bridge.rs`: `updater_stable_install` | зарегистрирован | `src/api.ts` | `src/v612RealMacUpdaterHotfix.test.ts` |
| IPC-011 | `src-tauri/src/updater_bridge.rs`: `updater_verify_installed_target` | зарегистрирован | `src/api.ts` | `src/v612RealMacUpdaterHotfix.test.ts` |
| IPC-012 | `src-tauri/src/updater_bridge.rs`: `updater_relaunch_exact` | зарегистрирован | `src/api.ts` | `src/v612RealMacUpdaterHotfix.test.ts` |
| IPC-013 | `src-tauri/src/updater_bridge.rs`: `updater_owner_preview_check` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-014 | `src-tauri/src/updater_bridge.rs`: `updater_owner_preview_download` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-015 | `src-tauri/src/updater_bridge.rs`: `updater_owner_preview_install` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-016 | `src-tauri/src/license.rs`: `license_status` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-017 | `src-tauri/src/license.rs`: `activate_license` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-018 | `src-tauri/src/migration.rs`: `migration_export` | зарегистрирован | `src/MigrationPanel.tsx` | не сопоставлен |
| IPC-019 | `src-tauri/src/migration.rs`: `migration_preview` | зарегистрирован | `src/MigrationPanel.tsx` | не сопоставлен |
| IPC-020 | `src-tauri/src/migration.rs`: `migration_import` | зарегистрирован | `src/MigrationPanel.tsx` | не сопоставлен |
| IPC-021 | `src-tauri/src/migration.rs`: `migration_restore_latest` | зарегистрирован | `src/MigrationPanel.tsx` | `src/v500Contract.test.ts` |
| IPC-022 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_import` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-023 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_summary` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-024 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_page` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-025 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_reserve` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-026 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_reserve_batch` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-027 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_mark_applying` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-028 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_mark_applied` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-029 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_mark_error` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-030 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_purge_pack` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-031 | `src-tauri/src/metadata_queue.rs`: `metadata_queue_cleanup_performance_fixtures` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-032 | `src-tauri/src/performance_probe.rs`: `performance_probe_enabled` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-033 | `src-tauri/src/performance_probe.rs`: `performance_probe_assert_isolated` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-034 | `src-tauri/src/performance_probe.rs`: `performance_probe_cleanup` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-035 | `src-tauri/src/performance_probe.rs`: `performance_probe_report` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-036 | `src-tauri/src/storage.rs`: `load_state` | зарегистрирован | не найдено; трассировать | не сопоставлен |
| IPC-037 | `src-tauri/src/storage.rs`: `load_state_in_background` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-038 | `src-tauri/src/storage.rs`: `save_state` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-039 | `src-tauri/src/youtube_inventory_store.rs`: `youtube_inventory_read` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-040 | `src-tauri/src/youtube_inventory_store.rs`: `youtube_inventory_write` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-041 | `src-tauri/src/youtube_inventory_store.rs`: `youtube_inventory_delete` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-042 | `src-tauri/src/youtube_inventory_store.rs`: `youtube_inventory_diagnostics` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-043 | `src-tauri/src/profile.rs`: `profile_import_avatar` | зарегистрирован | `src/api.ts` | `src/v401Hotfix.test.ts` |
| IPC-044 | `src-tauri/src/profile.rs`: `profile_avatar_data` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-045 | `src-tauri/src/security.rs`: `security_keychain_diagnostics` | зарегистрирован | `src/api.ts` | `src/v213KeychainRecovery.test.ts` |
| IPC-046 | `src-tauri/src/security.rs`: `security_keychain_runtime_diagnostics` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-047 | `src-tauri/src/security.rs`: `security_canonical_account_diagnostic` | зарегистрирован | не найдено; трассировать | не сопоставлен |
| IPC-048 | `src-tauri/src/security.rs`: `security_canonical_retry_secret_access` | зарегистрирован | не найдено; трассировать | не сопоставлен |
| IPC-049 | `src-tauri/src/security.rs`: `security_oauth_inventory` | зарегистрирован | `src/api.ts` | `src/v2110OauthContinuity.test.ts` |
| IPC-050 | `src-tauri/src/files.rs`: `store_profile_avatar` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-051 | `src-tauri/src/files.rs`: `import_images` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-052 | `src-tauri/src/files.rs`: `add_tracks` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-053 | `src-tauri/src/files.rs`: `refresh_job` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-054 | `src-tauri/src/files.rs`: `prepare_job_folder` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-055 | `src-tauri/src/files.rs`: `ensure_channel_inbox` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-056 | `src-tauri/src/files.rs`: `scan_channel_inbox` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-057 | `src-tauri/src/files.rs`: `ingest_tracks` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-058 | `src-tauri/src/files.rs`: `ingest_cover` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-059 | `src-tauri/src/files.rs`: `write_job_metadata` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-060 | `src-tauri/src/files.rs`: `enqueue_render` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-061 | `src-tauri/src/files.rs`: `reveal_path` | зарегистрирован | `src/AiAnalyticsExport.tsx`, `src/api.ts`, `src/productionManagerApi.ts` | не сопоставлен |
| IPC-062 | `src-tauri/src/files.rs`: `open_endlume` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-063 | `src-tauri/src/local_delete.rs`: `trash_local_file` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-064 | `src-tauri/src/local_delete.rs`: `local_source_status` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-065 | `src-tauri/src/local_delete.rs`: `scan_render_folder` | зарегистрирован | `src/api.ts` | `src/v2115Rc4ActivityWiring.test.ts` |
| IPC-066 | `src-tauri/src/local_delete.rs`: `discover_channel_folders` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-067 | `src-tauri/src/local_delete.rs`: `vyron_filesystem_preview` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-068 | `src-tauri/src/local_delete.rs`: `vyron_filesystem_apply` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-069 | `src-tauri/src/inventory_watch.rs`: `inventory_watch_roots` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-070 | `src-tauri/src/system.rs`: `diagnostics` | зарегистрирован | `src/App.tsx`, `src/SettingsOS.tsx`, `src/CommandPalette.tsx`, `src/api.ts` | `src/v601WindowsHotfix.test.ts` |
| IPC-071 | `src-tauri/src/system.rs`: `default_workspace` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-072 | `src-tauri/src/youtube.rs`: `youtube_channel_stats` | зарегистрирован | `src/youtubeQuota.ts`, `src/api.ts` | не сопоставлен |
| IPC-073 | `src-tauri/src/youtube.rs`: `youtube_oauth_vault_recover` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-074 | `src-tauri/src/youtube.rs`: `youtube_oauth_local_storage_status` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-075 | `src-tauri/src/youtube.rs`: `youtube_oauth_credential_states` | зарегистрирован | `src/api.ts` | `src/v2110OauthContinuity.test.ts` |
| IPC-076 | `src-tauri/src/youtube.rs`: `youtube_oauth_recovery_diagnostic` | зарегистрирован | `src/api.ts` | `src/nativeRecoverySafety.test.ts` |
| IPC-077 | `src-tauri/src/youtube.rs`: `youtube_oauth_retry_profile_keychain` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-078 | `src-tauri/src/youtube.rs`: `youtube_oauth_safe_check_all_profiles` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-079 | `src-tauri/src/youtube.rs`: `youtube_oauth_recover_existing_profiles` | зарегистрирован | `src/api.ts` | `src/v300OauthContinuity.test.ts` |
| IPC-080 | `src-tauri/src/youtube.rs`: `youtube_oauth_keychain_matrix` | зарегистрирован | `src/api.ts` | `src/v300FinalPhysicalStabilization.test.ts` |
| IPC-081 | `src-tauri/src/youtube.rs`: `youtube_oauth_interactive_recover_blocked_profiles` | зарегистрирован | `src/api.ts` | `src/v300FinalPhysicalStabilization.test.ts` |
| IPC-082 | `src-tauri/src/youtube.rs`: `youtube_keychain_migration_diagnostics` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-083 | `src-tauri/src/youtube.rs`: `youtube_oauth_browsers` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-084 | `src-tauri/src/youtube_intelligence.rs`: `youtube_channel_analytics` | зарегистрирован | `src/youtubeQuota.ts`, `src/api.ts` | не сопоставлен |
| IPC-085 | `src-tauri/src/analytics_ai_export.rs`: `youtube_ai_export` | зарегистрирован | `src/AiAnalyticsExport.tsx` | `tests/vyron-mac-ai-export-progress.test.mjs` |
| IPC-086 | `src-tauri/src/analytics_ai_export.rs`: `youtube_ai_export_cancel` | зарегистрирован | `src/AiAnalyticsExport.tsx` | не сопоставлен |
| IPC-087 | `src-tauri/src/analytics_ai_export.rs`: `youtube_ai_sync` | зарегистрирован | `src/Analytics360Page.tsx` | не сопоставлен |
| IPC-088 | `src-tauri/src/analytics_ai_export.rs`: `analytics360_winners` | зарегистрирован | `src/Analytics360Winners.tsx` | `src/__apex_visual_fixture.test.tsx` |
| IPC-089 | `src-tauri/src/analytics360_cache.rs`: `analytics360_read` | зарегистрирован | `src/Analytics360Page.tsx` | не сопоставлен |
| IPC-090 | `src-tauri/src/analytics360_cache.rs`: `analytics360_fleet` | зарегистрирован | `src/Analytics360Page.tsx` | не сопоставлен |
| IPC-091 | `src-tauri/src/youtube_intelligence.rs`: `youtube_competitor_snapshot` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-092 | `src-tauri/src/youtube_intelligence.rs`: `youtube_discover_competitors` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-093 | `src-tauri/src/youtube.rs`: `youtube_oauth_profiles` | зарегистрирован | `src/api.ts` | `src/v2111TauriInvoke.test.ts` |
| IPC-094 | `src-tauri/src/youtube.rs`: `youtube_oauth_reconciliation_diagnostics` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-095 | `src-tauri/src/youtube.rs`: `youtube_google_project_diagnostic` | зарегистрирован | `src/api.ts` | `src/googleProjectDiagnostics.test.ts` |
| IPC-096 | `src-tauri/src/youtube.rs`: `youtube_google_config_status` | зарегистрирован | `src/api.ts` | `src/v2111TauriInvoke.test.ts` |
| IPC-097 | `src-tauri/src/youtube.rs`: `youtube_google_config_retry` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-098 | `src-tauri/src/youtube.rs`: `youtube_google_config_interactive_recover` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-099 | `src-tauri/src/youtube.rs`: `youtube_google_config_import` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-100 | `src-tauri/src/youtube.rs`: `youtube_oauth_import_profile_credentials_file` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-101 | `src-tauri/src/youtube.rs`: `youtube_oauth_connect_global` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-102 | `src-tauri/src/youtube.rs`: `youtube_oauth_reconnect_existing` | зарегистрирован | `src/api.ts` | `src/v300FinalPhysicalStabilization.test.ts` |
| IPC-103 | `src-tauri/src/youtube.rs`: `youtube_oauth_open_youtube` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-104 | `src-tauri/src/youtube.rs`: `youtube_oauth_select_new_channel` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-105 | `src-tauri/src/youtube.rs`: `youtube_oauth_cancel_new_channel_selection` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-106 | `src-tauri/src/youtube.rs`: `youtube_oauth_profile_health` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-107 | `src-tauri/src/youtube.rs`: `youtube_channel_statistics` | зарегистрирован | `src/api.ts` | `src/v2114ChannelStatistics.test.ts` |
| IPC-108 | `src-tauri/src/youtube.rs`: `youtube_channel_statistics_batch` | зарегистрирован | `src/api.ts` | `src/v2115AddChannelStats.test.ts`, `src/v2115Rc4StatisticsCenter.test.ts` |
| IPC-109 | `src-tauri/src/youtube.rs`: `youtube_cache_thumbnail` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-110 | `src-tauri/src/youtube.rs`: `youtube_oauth_connect` | зарегистрирован | `src/api.ts` | `src/v300OauthPersistence.test.ts` |
| IPC-111 | `src-tauri/src/youtube.rs`: `youtube_oauth_disconnect` | зарегистрирован | `src/api.ts` | `src/v331ConnectivityOauthQuotaHotfix.test.ts` |
| IPC-112 | `src-tauri/src/youtube.rs`: `youtube_upload_video` | зарегистрирован | `src/youtubeQuota.ts`, `src/api.ts` | `src/v2111TauriInvoke.test.ts`, `src/v2111PublisherWiring.test.ts`, `src/v320RecoveryContracts.test.ts` |
| IPC-113 | `src-tauri/src/youtube.rs`: `youtube_resume_upload` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-114 | `src-tauri/src/youtube.rs`: `youtube_upload_sessions` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-115 | `src-tauri/src/youtube.rs`: `youtube_active_uploads` | зарегистрирован | `src/api.ts` | `src/uploadCenterWiring.test.ts` |
| IPC-116 | `src-tauri/src/youtube.rs`: `youtube_cancel_upload_session` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-117 | `src-tauri/src/youtube.rs`: `youtube_video_processing_status` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-118 | `src-tauri/src/youtube.rs`: `youtube_video_processing_status_batch` | зарегистрирован | `src/api.ts` | `src/v2115Rc4ActivityWiring.test.ts` |
| IPC-119 | `src-tauri/src/youtube.rs`: `youtube_set_thumbnail` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-120 | `src-tauri/src/youtube.rs`: `youtube_file_fingerprint` | зарегистрирован | `src/api.ts` | `src/storageLifecycle.test.ts` |
| IPC-121 | `src-tauri/src/youtube.rs`: `youtube_list_existing_videos` | зарегистрирован | `src/youtubeQuota.ts`, `src/api.ts` | `src/v2115ScheduleSyncHotfix.test.ts` |
| IPC-122 | `src-tauri/src/youtube.rs`: `youtube_retry_existing_video_hydration` | зарегистрирован | `src/api.ts` | `src/v2115ScheduleSyncHotfix.test.ts` |
| IPC-123 | `src-tauri/src/youtube.rs`: `youtube_backup_existing_videos` | зарегистрирован | `src/youtubeQuota.ts`, `src/api.ts` | не сопоставлен |
| IPC-124 | `src-tauri/src/youtube.rs`: `youtube_update_existing_video` | зарегистрирован | `src/youtubeQuota.ts`, `src/api.ts` | не сопоставлен |
| IPC-125 | `src-tauri/src/youtube.rs`: `youtube_update_existing_schedule` | зарегистрирован | `src/api.ts` | `src/scheduleOnlyContracts.test.ts` |
| IPC-126 | `src-tauri/src/youtube.rs`: `youtube_list_playlists` | зарегистрирован | `src/api.ts` | не сопоставлен |
| IPC-127 | `src-tauri/src/youtube.rs`: `youtube_playlist_membership` | зарегистрирован | `src/api.ts` | `src/v211FeatureContracts.test.ts` |
| IPC-128 | `src-tauri/src/materials_manager.rs`: `production_materials_downloads_path` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-129 | `src-tauri/src/materials_manager.rs`: `import_production_material_images` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-130 | `src-tauri/src/materials_manager.rs`: `production_materials_summary` | зарегистрирован | `src/productionManagerApi.ts` | `src/v510MaterialsManager.test.ts` |
| IPC-131 | `src-tauri/src/materials_manager.rs`: `production_materials_summaries` | зарегистрирован | `src/productionManagerApi.ts` | `tests/materials-freeze-regression.test.mjs` |
| IPC-132 | `src-tauri/src/production_manager.rs`: `production_storage_status` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-133 | `src-tauri/src/production_manager.rs`: `start_production_import` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-134 | `src-tauri/src/production_manager.rs`: `stop_production_import` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-135 | `src-tauri/src/production_manager.rs`: `production_import_status` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-136 | `src-tauri/src/production_manager.rs`: `set_production_music_library` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-137 | `src-tauri/src/production_manager.rs`: `index_production_music_library` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-138 | `src-tauri/src/production_manager.rs`: `scan_manual_production_music` | зарегистрирован | `src/productionManagerApi.ts` | `src/v512ManualAssembly.test.ts` |
| IPC-139 | `src-tauri/src/production_manager.rs`: `build_manual_production_batch` | зарегистрирован | `src/productionManagerApi.ts` | `src/v512ManualAssembly.test.ts` |
| IPC-140 | `src-tauri/src/production_manager.rs`: `build_production_batch` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-141 | `src-tauri/src/production_manager.rs`: `resume_production_batch` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-142 | `src-tauri/src/production_manager.rs`: `resume_production_recovery` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-143 | `src-tauri/src/production_manager.rs`: `find_production_recovery` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-144 | `src-tauri/src/production_manager.rs`: `restart_production_batch` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-145 | `src-tauri/src/recovery.rs`: `recovery_candidates` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-146 | `src-tauri/src/recovery.rs`: `recovery_refresh_candidate` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-147 | `src-tauri/src/recovery.rs`: `recovery_dismiss_session` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-148 | `src-tauri/src/recovery.rs`: `recovery_mark_clean_shutdown` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-149 | `src-tauri/src/production_manager.rs`: `read_production_batch_status` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-150 | `src-tauri/src/production_manager.rs`: `list_production_batches` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-151 | `src-tauri/src/production_manager.rs`: `production_channel_state` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-152 | `src-tauri/src/production_manager.rs`: `validate_production_batch` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-153 | `src-tauri/src/production_manager.rs`: `validate_production_projects` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-154 | `src-tauri/src/production_manager.rs`: `delete_production_batch_projects` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-155 | `src-tauri/src/production_manager.rs`: `preview_completed_production_projects` | зарегистрирован | `src/productionManagerApi.ts` | `src/v512ManualAssembly.test.ts` |
| IPC-156 | `src-tauri/src/production_manager.rs`: `cleanup_completed_production_assets` | зарегистрирован | `src/productionManagerApi.ts` | `src/v211FeatureContracts.test.ts`, `src/v212CleanupCommandRegistration.test.ts` |
| IPC-157 | `src-tauri/src/production_manager.rs`: `cleanup_completed_production_projects` | зарегистрирован | `src/productionManagerApi.ts` | `src/v512ManualAssembly.test.ts` |
| IPC-158 | `src-tauri/src/production_manager.rs`: `apply_production_cleanup_policy` | зарегистрирован | `src/productionManagerApi.ts` | `src/v510MaterialsManager.test.ts` |
| IPC-159 | `src-tauri/src/production_manager.rs`: `preview_global_production_project_cleanup` | зарегистрирован | `src/productionManagerApi.ts` | `src/v2111GlobalCleanup.test.ts` |
| IPC-160 | `src-tauri/src/production_manager.rs`: `execute_global_production_project_cleanup` | зарегистрирован | `src/productionManagerApi.ts` | `src/v2111GlobalCleanup.test.ts` |
| IPC-161 | `src-tauri/src/production_manager.rs`: `archive_production_rendered_videos` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-162 | `src-tauri/src/production_manager.rs`: `delete_production_job_folder` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-163 | `src-tauri/src/production_manager.rs`: `open_production_batch_in_endlume` | зарегистрирован | `src/productionManagerApi.ts` | `src/v512ManualAssembly.test.ts` |
| IPC-164 | `src-tauri/src/production_manager.rs`: `production_endlume_handoff_consumed` | зарегистрирован | `src/productionManagerApi.ts` | не сопоставлен |
| IPC-165 | `src-tauri/src/ai.rs`: `ai_generate_metadata` | зарегистрирован | `src/api.ts` | `src/scheduleOnlyContracts.test.ts` |

### Удалённые / изменённые регистрации исходного релиза

На момент снимка точные пары `модуль::команда` исходного реестра не исчезли из текущего; поведение и доступность не проверены.

## Таблицы SQLite Analytics 360 из схемы

Список извлечён из `src-tauri/src/analytics_sqlite.rs`; каждая строка требует независимого сопоставления конкретных SELECT / INSERT / UPDATE / DELETE, миграций, сбоев и тестов. Наличие таблицы в исходнике не подтверждает её целостность или фактический перенос. Базы пользователя не открывались.

| ID | Таблица / исходный модуль | Операции и миграция | Результат |
|---|---|---|---|
| SQL-001 | `analytics_sqlite.rs`: `channels` | перечислить конкретные операции и миграции | не проверено |
| SQL-002 | `analytics_sqlite.rs`: `videos` | перечислить конкретные операции и миграции | не проверено |
| SQL-003 | `analytics_sqlite.rs`: `channel_daily` | перечислить конкретные операции и миграции | не проверено |
| SQL-004 | `analytics_sqlite.rs`: `video_daily` | перечислить конкретные операции и миграции | не проверено |
| SQL-005 | `analytics_sqlite.rs`: `reach_daily` | перечислить конкретные операции и миграции | не проверено |
| SQL-006 | `analytics_sqlite.rs`: `video_reach_daily` | перечислить конкретные операции и миграции | не проверено |
| SQL-007 | `analytics_sqlite.rs`: `audience_demographics` | перечислить конкретные операции и миграции | не проверено |
| SQL-008 | `analytics_sqlite.rs`: `traffic_sources` | перечислить конкретные операции и миграции | не проверено |
| SQL-009 | `analytics_sqlite.rs`: `devices` | перечислить конкретные операции и миграции | не проверено |
| SQL-010 | `analytics_sqlite.rs`: `subtitles` | перечислить конкретные операции и миграции | не проверено |
| SQL-011 | `analytics_sqlite.rs`: `retention_points` | перечислить конкретные операции и миграции | не проверено |
| SQL-012 | `analytics_sqlite.rs`: `channel_events` | перечислить конкретные операции и миграции | не проверено |
| SQL-013 | `analytics_sqlite.rs`: `metadata_history` | перечислить конкретные операции и миграции | не проверено |
| SQL-014 | `analytics_sqlite.rs`: `sync_jobs` | перечислить конкретные операции и миграции | не проверено |
| SQL-015 | `analytics_sqlite.rs`: `data_coverage` | перечислить конкретные операции и миграции | не проверено |
| SQL-016 | `analytics_sqlite.rs`: `analytics_overviews` | перечислить конкретные операции и миграции | не проверено |
| SQL-017 | `analytics_sqlite.rs`: `analytics_migrations` | перечислить конкретные операции и миграции | не проверено |

`youtube_inventory_store.rs` хранит снимки в JSON, а не SQLite. Статический поиск `CREATE TABLE` по одному модулю не доказывает отсутствие иных баз данных; остальные хранилища необходимо сопоставить отдельно.


## Клавиатура и фокус: конкретные сценарии

Статус всех сценариев: **не проверено исполнением**. Колонка «источник» указывает наличие кода APEX, а не сохранение поведения версии 6.1.17.

| ID | Действие | Точка реализации | Что проверить при приёмке |
|---|---|---|---|
| KEY-01 | Cmd/Ctrl+K открыть и закрыть командную палитру | `src/CommandPalette.tsx` | Перехват, повторное нажатие, отсутствие конфликта с полями ввода |
| KEY-02 | Escape закрыть палитру | `src/CommandPalette.tsx` | Фокус после закрытия, вложенные диалоги |
| KEY-03 | Стрелки вверх/вниз выбрать команду, Enter выполнить | `src/CommandPalette.tsx` | Пустой список, поиск, корректная выбранная команда |
| KEY-04 | Escape закрыть модальное окно, если разрешено | `src/ModalPortal.tsx` | У каждого диалога отдельно проверить использование портала и настройки отмены |
| KEY-05 | Tab и Shift+Tab внутри модального окна | `src/ModalPortal.tsx` | Порядок, захват фокуса и восстановление после закрытия |
| KEY-06 | Enter создать будущий канал в Производстве | `src/ProductionOS.tsx` | Пустое название, дубли, успех и отмена на тестовых данных |
| KEY-07 | Доступ с клавиатуры к таблицам, графикам, меню и прочим диалогам | Компоненты разделов и стандартные HTML-контролы | Все отдельные кнопки, сортировка, выбор строк, подписи и состояние фокуса ещё не проверены |

## Фоновые операции: конкретные точки

Записи фиксируют код текущего APEX. Совпадение с 6.1.17, отсутствие блокировок и побочных записей не подтверждены.

| ID | Операция / триггер | Код | Необходимая проверка |
|---|---|---|---|
| TASK-01 | Сканирование запасов при начальной загрузке, фокусе, возвращении видимости и периодическом reconciliation | `src/LiveInventoryBridge.tsx` | Отмена при размонтировании, запрет записи в материалы, нагрузка на HDD и UI |
| TASK-02 | Планировщик проверки рендеров, интервалы видимого/скрытого состояния | `src/renderScanScheduler.ts` | Нет параллельных обходов, остановка, время основного потока |
| TASK-03 | Контроль обработки загрузок: начальный таймер и интервал 90 секунд | `src/UploadProcessingMonitor.tsx` | Одна копия цикла, завершение на выходе, без запросов без оснований |
| TASK-04 | Пересчёт плана каналов при изменении сигнатуры и каждую минуту | `src/ChannelRunwayScheduler.tsx` | Суточная идемпотентность и отсутствие конфликтов при изменении настроек |
| TASK-05 | Назначение очереди метаданных с отложенным запуском по событию изменений | `src/MetadataQueueAssignmentBridge.tsx` | Очередь, отмена, синхронизация и стоимость IPC при пакетах |
| TASK-06 | Миграция и гидратация локального кэша существующих видео при изменении списка каналов | `src/ExistingInventoryMigrationBridge.tsx` | Тестовая изоляция записей, повторный запуск, прерывание, сохранение данных |
| TASK-07 | Поиск кандидатов восстановления после загрузки и по событию открытия | `src/RecoveryGate.tsx` | Не запускать второй Publisher; проверять только на фиктивных данных, без автоматического продолжения |
| TASK-08 | Запись истории уведомлений по таймеру, при скрытии и выходе | `src/notificationCenter.ts` | Дедупликация, восстановление истории, отсутствие записи в профиль 6.1.17 |
| TASK-09 | Фоновый исполнитель очереди загрузок | `src/uploadQueueRuntime.ts` | Остановка/возобновление, повторные события, общая конкуренция с остальными входами в загрузку |
| TASK-10 | Переходы состояния завершённого рендера | `src/productionRenderTransitions.ts` | Идемпотентность и сохранение увиденных событий при перезапуске и перечитывании диска |
| TASK-11 | Автообновление приложения | `src/updaterRuntime.ts`, `src-tauri/src/updater_bridge.rs` | Изоляция экспериментальной сборки; не заменять 6.1.17 |
| TASK-12 | Автоматическая статистика владельца и inventory | `src/ChannelStatisticsScheduler.tsx`, `src/OwnerInventoryScheduler.tsx` | Компоненты сейчас возвращают `null`, код заявляет ручную синхронизацию; убедиться, что ручные действия доступны |
| TASK-13 | Прямой автопилот загрузки и восстановления | `src/youtubeAutopilot.ts` | Найти действующую точку вызова и доказать общий runtime/ограничитель; см. BG-03 |

Этот реестр дополняет групповой список выше и не является доказательством полного охвата всех таймеров, IPC, каналов и пользовательских действий.
