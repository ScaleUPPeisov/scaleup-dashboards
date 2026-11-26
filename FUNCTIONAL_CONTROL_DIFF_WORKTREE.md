# VYRON — структурное сопоставление JSX

Исходный Git-срез: e65bae680637f5c2a8cc60a886a17691d5694263. Целевой рабочий каталог относительно HEAD: 925d07c74a1a141439cd0d5c5b1e1eddb5e11dfd. SHA-256 манифеста файлов: исходный 4a65b6df2e8b4410156bd51c997ab3d63d5a062dbb869d79b72cde8d936c9821, целевой dc5f0d3a3efb54042616ce74f07389dbc3290c3297aa41bf529774eb529e91b7. Режим рабочего каталога включает незакоммиченные и untracked TSX; его содержимое могло измениться после снятия снимка.

Команда: node scripts/functional_parity_controls.cjs e65bae680637f5c2a8cc60a886a17691d5694263 925d07c74a1a141439cd0d5c5b1e1eddb5e11dfd --working-tree > FUNCTIONAL_CONTROL_DIFF_WORKTREE.md

Среда: Node.js v26.8.1, TypeScript 5.9.3. Изучены только файлы src/*.tsx кроме тестов. AST включает интерактивные теги, обработчики, элементы с role/tabIndex и вызовы компонентов. Точное совпадение означает совпадение тега, непосредственного текста, событий, spread и выбранных атрибутов; JSX-дерево, семантика зависимостей и исполнение не сверены. Одни узлы могут представлять множество действий, условных состояний и каналов. Совпадение не означает PASS. Отсутствие совпадения или предполагаемое переименование не означает утрату функционала. Отчёт не содержит данных пользователя.

| Метрика | Количество |
|---|---:|
| Файлы исходного / целевого среза | 72 / 73 |
| Узлы исходного / целевого среза | 1343 / 1420 |
| Точное структурное совпадение в том же файле | 1279 |
| Точное структурное совпадение в другом файле | 0 |
| Исходные узлы без точного соответствия | 64 |
| Новые узлы без точного соответствия | 141 |

## Исходные узлы без точного соответствия

Кандидаты выбираются только эвристически: тот же тег, тот же файл, идентичный непосредственный текст и/или общие идентификаторы в обработчиках. Возможны ложные совпадения, пропущенные перенесённые функции и несколько кандидатов на один узел. Проверять исходные и новые обработчики вручную. Для исходной строки использовать git show e65bae680637f5c2a8cc60a886a17691d5694263:ПУТЬ; ссылка на файл рабочего каталога не отражает старый коммит.

| Исходный узел: файл, строка, колонка, обработчик | Возможные кандидаты APEX |
|---|---|
| src/Analytics360Page.tsx:377:5 button «Собрать выбранный канал»; onClick={()=>void syncDeep(false)} | src/Analytics360Page.tsx:380:5 button; onClick={()=>void syncDeep(false)} |
| src/Analytics360Page.tsx:437:36 tr; onClick={()=>setVideoId(v.videoId)}; onKeyDown={e=>{if(e.key==='Enter')setVideoId(v.videoId)}} | src/Analytics360Page.tsx:438:36 tr; onClick={()=>setVideoId(v.videoId)}; onKeyDown={e=>{if(e.key==='Enter'\|\|e.key===' '){e.preventDefault();setVideoId(v.videoId)}}} |
| src/Analytics360Winners.tsx:108:18 select; onChange={e=>setChannel(e.target.value)} | src/Analytics360Winners.tsx:109:18 select; onChange={e=>{setChannel(e.target.value);setLimit(20)}}<br>src/Analytics360Winners.tsx:112:19 select; onChange={e=>{setClassification(e.target.value);setLimit(20)}} |
| src/Analytics360Winners.tsx:111:19 select; onChange={e=>setClassification(e.target.value)} | src/Analytics360Winners.tsx:112:19 select; onChange={e=>{setClassification(e.target.value);setLimit(20)}}<br>src/Analytics360Winners.tsx:109:18 select; onChange={e=>{setChannel(e.target.value);setLimit(20)}} |
| src/Analytics360Winners.tsx:114:23 select; onChange={e=>setDateScope(e.target.value)} | src/Analytics360Winners.tsx:115:23 select; onChange={e=>{setDateScope(e.target.value);setLimit(20)}}<br>src/Analytics360Winners.tsx:109:18 select; onChange={e=>{setChannel(e.target.value);setLimit(20)}} |
| src/Analytics360Winners.tsx:117:23 select; onChange={e=>setSort(e.target.value as Sort)} | src/Analytics360Winners.tsx:118:23 select; onChange={e=>{setSort(e.target.value as Sort);setLimit(20)}}<br>src/Analytics360Winners.tsx:109:18 select; onChange={e=>{setChannel(e.target.value);setLimit(20)}} |
| src/Analytics360Winners.tsx:118:6 option «По Winner Score» | Кандидат не найден автоматически; проверить вручную |
| src/Analytics360Winners.tsx:132:10 button «Открыть»; onClick={()=>onOpenVideo(v.channelId,v.videoId)} | src/Analytics360Winners.tsx:128:5 button «Открыть»; onClick={()=>onOpenVideo(v.channelId,v.videoId)}<br>src/Analytics360Winners.tsx:130:24 button «Показать ещё»; onClick={()=>setLimit(v=>v+20)} |
| src/App.tsx:309:100 RouteWarmup | Кандидат не найден автоматически; проверить вручную |
| src/App.tsx:310:55 RouteWarmup | Кандидат не найден автоматически; проверить вручную |
| src/BatchControl.tsx:149:67 button «Запустить»; onClick={()=>{const x=pending;setPending(null);void run(x.action,x.channelIds)}} | src/BatchControl.tsx:157:67 button; onClick={()=>{const x=pending;if(x.action==='queue'&&!queueConfirmed)return;const confirmed=x.action==='queue'&&queueConfirmed;setPending(nu |
| src/ChannelsOS.tsx:35:33 input; onChange={e=>setQuery(e.target.value)} | src/ChannelsOS.tsx:36:33 input; onChange={e=>setQuery(e.target.value)}<br>src/HistoryPage.tsx:50:64 input; onChange={e=>{setQuery(e.target.value);setLimit(100)}} |
| src/ChannelsOS.tsx:37:1279 button «✎»; onClick={()=>setEditing(editing===c.id?null:c.id)} | src/ChannelsOS.tsx:60:7 button «Настроить»; onClick={()=>setEditing(editing===c.id?null:c.id)}<br>src/ChannelsOS.tsx:58:7 button «Паспорт»; onClick={()=>setPassportId(c.id)} |
| src/ChannelsOS.tsx:40:50 button «Паспорт»; onClick={()=>setPassportId(c.id)} | src/ChannelsOS.tsx:58:7 button «Паспорт»; onClick={()=>setPassportId(c.id)}<br>src/ChannelsOS.tsx:60:7 button «Настроить»; onClick={()=>setEditing(editing===c.id?null:c.id)} |
| src/ChannelsOS.tsx:40:260 button «Публикация»; onClick={()=>openYoutube(c,'publish')} | src/ChannelsOS.tsx:59:7 button «Публикация»; onClick={()=>openYoutube(c,'publish')}<br>src/ChannelsOS.tsx:58:7 button «Паспорт»; onClick={()=>setPassportId(c.id)} |
| src/ChannelsOS.tsx:40:672 button «Настроить»; onClick={()=>setEditing(editing===c.id?null:c.id)} | src/ChannelsOS.tsx:60:7 button «Настроить»; onClick={()=>setEditing(editing===c.id?null:c.id)}<br>src/ChannelsOS.tsx:58:7 button «Паспорт»; onClick={()=>setPassportId(c.id)} |
| src/CompetitorsPage.tsx:32:111 input; onChange={e=>setName(e.target.value)} | src/CompetitorsPage.tsx:33:78 input; onChange={e=>setName(e.target.value)}<br>src/CompetitorsPage.tsx:33:216 input; onChange={e=>setUrl(e.target.value)} |
| src/CompetitorsPage.tsx:32:209 input; onChange={e=>setUrl(e.target.value)} | src/CompetitorsPage.tsx:33:216 input; onChange={e=>setUrl(e.target.value)}<br>src/CompetitorsPage.tsx:33:78 input; onChange={e=>setName(e.target.value)} |
| src/CompetitorsPage.tsx:34:993 button; onClick={()=>void refreshOne(c.id)} | src/CompetitorsPage.tsx:35:1030 button; onClick={()=>void refreshOne(c.id)}<br>src/CompetitorsPage.tsx:35:1161 button «×»; onClick={()=>remove(c.id)} |
| src/CompetitorsPage.tsx:34:1090 button «×»; onClick={()=>remove(c.id)} | src/CompetitorsPage.tsx:35:1161 button «×»; onClick={()=>remove(c.id)}<br>src/CompetitorsPage.tsx:35:1030 button; onClick={()=>void refreshOne(c.id)} |
| src/DashboardOS.tsx:231:96 button «Production»; onClick={()=>setPage('production')} | src/DashboardOS.tsx:238:96 button «Производство»; onClick={()=>setPage('production')}<br>src/DashboardOS.tsx:232:13 button «Командный центр»; onClick={()=>setPage('autopilot')} |
| src/DashboardOS.tsx:247:13 button «Upload Center»; onClick={()=>setPage('youtube')} | src/DashboardOS.tsx:232:13 button «Командный центр»; onClick={()=>setPage('autopilot')}<br>src/DashboardOS.tsx:238:96 button «Производство»; onClick={()=>setPage('production')} |
| src/HistoryPage.tsx:35:9 input; onChange={e=>{setQuery(e.target.value);setLimit(100)}} | src/HistoryPage.tsx:50:64 input; onChange={e=>{setQuery(e.target.value);setLimit(100)}}<br>src/ChannelsOS.tsx:36:33 input; onChange={e=>setQuery(e.target.value)} |
| src/HistoryPage.tsx:37:9 select; onChange={e=>{setStatus(e.target.value);setLimit(100)}} | src/HistoryPage.tsx:51:35 select; onChange={e=>{setStatus(e.target.value);setLimit(100)}}<br>src/HistoryPage.tsx:55:34 select; onChange={e=>{setChannelId(e.target.value);setLimit(100)}} |
| src/HistoryPage.tsx:43:9 select; onChange={e=>{setChannelId(e.target.value);setLimit(100)}} | src/HistoryPage.tsx:51:35 select; onChange={e=>{setStatus(e.target.value);setLimit(100)}}<br>src/HistoryPage.tsx:55:34 select; onChange={e=>{setChannelId(e.target.value);setLimit(100)}} |
| src/HistoryPage.tsx:47:9 button; onClick={()=>setOldestFirst(x=>!x)} | src/HistoryPage.tsx:58:9 button; onClick={()=>setOldestFirst(x=>!x)} |
| src/LiveContentInventory.tsx:134:24 div; onClick={()=>openPublisher(row.channelId)}; onKeyDown={e=>{if(e.key==='Enter')openPublisher(row.channelId)}} | Кандидат не найден автоматически; проверить вручную |
| src/LiveContentInventory.tsx:142:13 button; onClick={e=>{e.stopPropagation();void chooseRenderFolder(row.channelId)}} | src/LiveContentInventory.tsx:155:15 button; onClick={()=>void chooseRenderFolder(row.channelId)}<br>src/LiveContentInventory.tsx:156:15 button «Проверить»; onClick={()=>void scanInventoryChannel(row.channelId,'manual-channel')} |
| src/LiveContentInventory.tsx:143:13 button «↻ Пересканировать»; onClick={e=>{e.stopPropagation();void scanInventoryChannel(row.channelId,'manual-channel')}} | src/LiveContentInventory.tsx:156:15 button «Проверить»; onClick={()=>void scanInventoryChannel(row.channelId,'manual-channel')}<br>src/LiveContentInventory.tsx:155:15 button; onClick={()=>void chooseRenderFolder(row.channelId)} |
| src/MaterialsManager.tsx:291:34 button «+ РУЧНАЯ СБОРКА»; onClick={openManualAssembly} | src/MaterialsManager.tsx:295:34 button «Ручная сборка»; onClick={openManualAssembly} |
| src/MaterialsManager.tsx:291:133 button «↻ ОБНОВИТЬ»; onClick={()=>void refresh()} | src/MaterialsManager.tsx:295:131 button «Обновить»; onClick={()=>void refresh()}<br>src/MaterialsManager.tsx:313:54 button «Изображения»; onClick={()=>void importImages(ch)} |
| src/MaterialsManager.tsx:314:15 button «+ ИЗОБРАЖЕНИЯ»; onClick={()=>void importImages(ch)} | src/MaterialsManager.tsx:313:54 button «Изображения»; onClick={()=>void importImages(ch)}<br>src/MaterialsManager.tsx:313:307 button «Обновить музыку»; onClick={()=>void reindexMusic(ch.id)} |
| src/MaterialsManager.tsx:316:39 button «↻»; onClick={()=>void reindexMusic(ch.id)} | src/MaterialsManager.tsx:313:307 button «Обновить музыку»; onClick={()=>void reindexMusic(ch.id)}<br>src/MaterialsManager.tsx:313:54 button «Изображения»; onClick={()=>void importImages(ch)} |
| src/MaterialsManager.tsx:317:37 button «ПАПКА»; onClick={()=>void productionManagerApi.openFolder(row.image.rootPath)} | src/MaterialsManager.tsx:313:419 button «Открыть папку»; onClick={()=>void productionManagerApi.openFolder(row.image.rootPath)}<br>src/MaterialsManager.tsx:295:131 button «Обновить»; onClick={()=>void refresh()} |
| src/MaterialsManager.tsx:342:18 div; onMouseDown={()=>{if(!manualBusy)setManualOpen(false)}} | Кандидат не найден автоматически; проверить вручную |
| src/MaterialsManager.tsx:343:7 section; onMouseDown={e=>e.stopPropagation()} | src/MaterialsManager.tsx:338:7 section; onMouseDown={e=>e.stopPropagation()} |
| src/MaterialsManager.tsx:357:38 button «ВЫБРАТЬ ИЗ DOWNLOADS»; onClick={()=>void chooseManualImages()} | src/MaterialsManager.tsx:351:38 button «Выбрать изображения»; onClick={()=>void chooseManualImages()}<br>src/MaterialsManager.tsx:295:131 button «Обновить»; onClick={()=>void refresh()} |
| src/MaterialsManager.tsx:357:183 button «ОЧИСТИТЬ»; onClick={()=>setManualImages([])} | src/MaterialsManager.tsx:351:182 button «Очистить выбор»; onClick={()=>setManualImages([])} |
| src/MaterialsManager.tsx:363:38 button «ВЫБРАТЬ С ДИСКА»; onClick={()=>void chooseManualMusicFiles()} | src/MaterialsManager.tsx:357:38 button «Выбрать файлы»; onClick={()=>void chooseManualMusicFiles()}<br>src/MaterialsManager.tsx:295:131 button «Обновить»; onClick={()=>void refresh()} |
| src/MaterialsManager.tsx:363:158 button «ВЫБРАТЬ ПАПКУ»; onClick={()=>void chooseManualMusicFolder()} | src/MaterialsManager.tsx:357:156 button «Выбрать папку»; onClick={()=>void chooseManualMusicFolder()}<br>src/MaterialsManager.tsx:295:131 button «Обновить»; onClick={()=>void refresh()} |
| src/MaterialsManager.tsx:363:280 button «ОЧИСТИТЬ»; onClick={()=>{setManualMusic([]);setManualMusicRoot('')}} | src/MaterialsManager.tsx:357:278 button «Очистить выбор»; onClick={()=>{setManualMusic([]);setManualMusicRoot('')}} |
| src/MaterialsManager.tsx:380:11 button «ОТМЕНА»; onClick={()=>setManualOpen(false)} | Кандидат не найден автоматически; проверить вручную |
| src/NotificationStack.tsx:39:4 button; onClick={openHistory} | src/NotificationStack.tsx:42:4 button; onClick={openHistory}<br>src/NotificationStack.tsx:43:159 button «Ещё уведомлений: · Открыть историю»; onClick={openHistory} |
| src/NotificationStack.tsx:42:191 button «×»; onClick={()=>setHistoryOpen(false)} | src/NotificationStack.tsx:45:63 button «×»; onClick={()=>setHistoryOpen(false)}<br>src/CompetitorsPage.tsx:35:1161 button «×»; onClick={()=>remove(c.id)} |
| src/ProductionOS.tsx:82:66 button «Обзор»; onClick={()=>{setSection('overview');setTab('queue');setFilter('all')}} | src/ProductionOS.tsx:87:66 button «Обзор»; onClick={()=>{setSection('overview');setTab('queue');changeQueueFilter('all')}} |
| src/ProductionOS.tsx:83:300 button; onClick={()=>setFilter(st)} | src/ProductionOS.tsx:88:300 button; onClick={()=>changeQueueFilter(st)} |
| src/ProductionOS.tsx:83:535 select; onChange={e=>setFilter(e.target.value)} | src/ProductionOS.tsx:88:543 select; onChange={e=>changeQueueFilter(e.target.value)}<br>src/Analytics360Winners.tsx:109:18 select; onChange={e=>{setChannel(e.target.value);setLimit(20)}} |
| src/ProductionOS.tsx:83:1401 button «Снять выделение»; onClick={()=>patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!visibleJobIds.includes(id))})} | src/ProductionOS.tsx:88:1439 button «Снять выделение»; onClick={()=>patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!visibleIdSet.has(id))})}<br>src/ProductionOS.tsx:88:1563 button «Удалить выбранные»; onClick={()=>void deleteJobs(selectedJobIds.filter(id=>visibleIdSet.has(id)),'Удалить выбранные проекты?')} |
| src/ProductionOS.tsx:83:1531 button «Удалить выбранные»; onClick={()=>void deleteJobs(selectedJobIds.filter(id=>visibleJobIds.includes(id)),'Удалить выбранные проекты?')} | src/ProductionOS.tsx:88:1563 button «Удалить выбранные»; onClick={()=>void deleteJobs(selectedJobIds.filter(id=>visibleIdSet.has(id)),'Удалить выбранные проекты?')}<br>src/ProductionOS.tsx:88:1439 button «Снять выделение»; onClick={()=>patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!visibleIdSet.has(id))})} |
| src/PublisherShell.tsx:43:5 button «Очистить черновик»; onClick={p.onClear} | src/PublisherShell.tsx:42:5 button «Очистить черновик»; onClick={p.onClear} |
| src/PublisherShell.tsx:49:28 button; onClick={control.onClick} | src/PublisherShell.tsx:48:28 button; onClick={control.onClick} |
| src/ScheduleOS.tsx:49:530 button «СКРЫТЬ RECOVERY»; onClick={()=>{clearScheduleRecovery(channelId);setRecovery(undefined)}} | src/ScheduleOS.tsx:58:532 button «СКРЫТЬ ВОССТАНОВЛЕНИЕ»; onClick={()=>{clearScheduleRecovery(channelId);setRecovery(undefined)}} |
| src/ScheduleOS.tsx:52:42 summary «PRIVATE — NO SCHEDULE ( ) • включаются только вручную» | Кандидат не найден автоматически; проверить вручную |
| src/ScheduleOS.tsx:56:80 section; onMouseDown={e=>e.stopPropagation()} | src/ScheduleOS.tsx:65:80 section; onMouseDown={e=>e.stopPropagation()} |
| src/SettingsOS.tsx:38:121 button; onClick={()=>onChange(!value)} | src/SettingsOS.tsx:39:121 button; onClick={()=>onChange(!value)} |
| src/SettingsOS.tsx:136:315 button; onClick={()=>setTab(id)} | src/SettingsOS.tsx:142:381 button; onClick={()=>setTab(id)} |
| src/SettingsOS.tsx:140:229 button «COMPACT»; onClick={()=>patch({interfaceDensity:'compact'})} | src/SettingsOS.tsx:146:179 button «Компактно»; onClick={()=>patch({interfaceDensity:'compact'})}<br>src/SettingsOS.tsx:146:382 button «Просторно»; onClick={()=>patch({interfaceDensity:'comfortable'})} |
| src/SettingsOS.tsx:140:371 button «COMFORTABLE»; onClick={()=>patch({interfaceDensity:'comfortable'})} | src/SettingsOS.tsx:146:382 button «Просторно»; onClick={()=>patch({interfaceDensity:'comfortable'})}<br>src/SettingsOS.tsx:146:179 button «Компактно»; onClick={()=>patch({interfaceDensity:'compact'})} |
| src/SettingsOS.tsx:142:141 button «OFF»; onClick={()=>setMode('off')} | src/SettingsOS.tsx:148:138 button «Выключен»; onClick={()=>setMode('off')}<br>src/SettingsOS.tsx:148:257 button «С подсказками»; onClick={()=>setMode('assisted')} |
| src/SettingsOS.tsx:142:227 button «ASSISTED»; onClick={()=>setMode('assisted')} | src/SettingsOS.tsx:148:257 button «С подсказками»; onClick={()=>setMode('assisted')}<br>src/SettingsOS.tsx:148:138 button «Выключен»; onClick={()=>setMode('off')} |
| src/SettingsOS.tsx:142:328 button «FULL LOCAL»; onClick={()=>setMode('full')} | src/SettingsOS.tsx:148:396 button «Локальный»; onClick={()=>setMode('full')}<br>src/SettingsOS.tsx:148:138 button «Выключен»; onClick={()=>setMode('off')} |
| src/UpdateExperience.tsx:22:126 button «Установить и перезапустить»; onClick={()=>void install(blockers)} | src/UpdateExperience.tsx:26:126 button «Установить и перезапустить»; onClick={installSafely} |
| src/YouTubeCenter.tsx:39:195 button; onClick={()=>setQuotaOpen(x=>!x)} | src/YouTubeCenter.tsx:39:92 button; onClick={()=>setQuotaOpen(x=>!x)} |
| src/YouTubeCenter.tsx:39:507 button; onClick={()=>setTab(id)} | src/YouTubeCenter.tsx:39:612 button; onClick={()=>setTab(id)} |

## Целевые узлы без точного соответствия

Новые узлы могут заменять старые или добавлять функции. Ручная проверка обязательна.

| Узел APEX: файл, строка, колонка, обработчик |
|---|
| src/AccountsPage.tsx:381:43 summary |
| src/AccountsPage.tsx:397:235 summary «Данные привязки» |
| src/AccountsPage.tsx:398:24 details |
| src/AccountsPage.tsx:466:5 details |
| src/Analytics360Page.tsx:380:5 button; onClick={()=>void syncDeep(false)} |
| src/Analytics360Page.tsx:385:9 details |
| src/Analytics360Page.tsx:385:48 summary «Настройки сбора» |
| src/Analytics360Page.tsx:386:3 details |
| src/Analytics360Page.tsx:386:38 summary |
| src/Analytics360Page.tsx:389:3 details |
| src/Analytics360Page.tsx:389:38 summary |
| src/Analytics360Page.tsx:438:36 tr; onClick={()=>setVideoId(v.videoId)}; onKeyDown={e=>{if(e.key==='Enter'\|\|e.key===' '){e.preventDefault();setVideoId(v.videoId)}}} |
| src/Analytics360Winners.tsx:97:4 details |
| src/Analytics360Winners.tsx:97:45 summary «Как рассчитывается оценка» |
| src/Analytics360Winners.tsx:99:4 details |
| src/Analytics360Winners.tsx:99:61 summary «Растущие каналы» |
| src/Analytics360Winners.tsx:109:18 select; onChange={e=>{setChannel(e.target.value);setLimit(20)}} |
| src/Analytics360Winners.tsx:112:19 select; onChange={e=>{setClassification(e.target.value);setLimit(20)}} |
| src/Analytics360Winners.tsx:115:23 select; onChange={e=>{setDateScope(e.target.value);setLimit(20)}} |
| src/Analytics360Winners.tsx:118:23 select; onChange={e=>{setSort(e.target.value as Sort);setLimit(20)}} |
| src/Analytics360Winners.tsx:119:6 option «По оценке» |
| src/Analytics360Winners.tsx:127:182 details |
| src/Analytics360Winners.tsx:127:191 summary «Подробнее» |
| src/Analytics360Winners.tsx:128:5 button «Открыть»; onClick={()=>onOpenVideo(v.channelId,v.videoId)} |
| src/Analytics360Winners.tsx:130:24 button «Показать ещё»; onClick={()=>setLimit(v=>v+20)} |
| src/AnalyticsPage.tsx:23:471 svg |
| src/AnalyticsPage.tsx:46:44 summary «Экспорт аналитики» |
| src/AnalyticsPage.tsx:49:424 details |
| src/AnalyticsPage.tsx:63:4 details |
| src/AnalyticsPage.tsx:63:43 summary «Другие показатели» |
| src/App.tsx:305:235 React.Suspense |
| src/App.tsx:305:261 div «Открываем раздел…» |
| src/BatchControl.tsx:155:32 details |
| src/BatchControl.tsx:155:41 summary «Видео ( )» |
| src/BatchControl.tsx:156:39 input; onChange={e=>setQueueConfirmed(e.target.checked)} |
| src/BatchControl.tsx:157:67 button; onClick={()=>{const x=pending;if(x.action==='queue'&&!queueConfirmed)return;const confirmed=x.action==='queue'&&queueConfirmed;setPending(nu |
| src/ChannelsOS.tsx:36:33 input; onChange={e=>setQuery(e.target.value)} |
| src/ChannelsOS.tsx:45:5 details |
| src/ChannelsOS.tsx:46:7 summary «Все показатели» |
| src/ChannelsOS.tsx:58:7 button «Паспорт»; onClick={()=>setPassportId(c.id)} |
| src/ChannelsOS.tsx:59:7 button «Публикация»; onClick={()=>openYoutube(c,'publish')} |
| src/ChannelsOS.tsx:60:7 button «Настроить»; onClick={()=>setEditing(editing===c.id?null:c.id)} |
| src/ChannelsOS.tsx:61:7 details |
| src/ChannelsOS.tsx:61:38 summary «Ещё» |
| src/CompetitorsPage.tsx:33:78 input; onChange={e=>setName(e.target.value)} |
| src/CompetitorsPage.tsx:33:216 input; onChange={e=>setUrl(e.target.value)} |
| src/CompetitorsPage.tsx:35:1030 button; onClick={()=>void refreshOne(c.id)} |
| src/CompetitorsPage.tsx:35:1161 button «×»; onClick={()=>remove(c.id)} |
| src/CompetitorsPage.tsx:35:1672 details |
| src/CompetitorsPage.tsx:35:1708 summary «Все показатели» |
| src/DashboardOS.tsx:180:70 details |
| src/DashboardOS.tsx:180:114 summary «Источник данных» |
| src/DashboardOS.tsx:219:5 details |
| src/DashboardOS.tsx:219:49 summary «Источник данных» |
| src/DashboardOS.tsx:232:13 button «Командный центр»; onClick={()=>setPage('autopilot')} |
| src/DashboardOS.tsx:238:96 button «Производство»; onClick={()=>setPage('production')} |
| src/DashboardOS.tsx:250:4 DashboardUploads; onOpen={()=>setPage('youtube')} |
| src/DashboardOS.tsx:269:11 button «Центр загрузок»; onClick={onOpen} |
| src/HistoryPage.tsx:50:64 input; onChange={e=>{setQuery(e.target.value);setLimit(100)}} |
| src/HistoryPage.tsx:51:35 select; onChange={e=>{setStatus(e.target.value);setLimit(100)}} |
| src/HistoryPage.tsx:55:34 select; onChange={e=>{setChannelId(e.target.value);setLimit(100)}} |
| src/HistoryPage.tsx:58:9 button; onClick={()=>setOldestFirst(x=>!x)} |
| src/HistoryPage.tsx:60:87 p «Найдено · показано» |
| src/HistoryPage.tsx:64:9 details |
| src/HistoryPage.tsx:64:51 summary «Технические сведения» |
| src/LiveContentInventory.tsx:130:5 details |
| src/LiveContentInventory.tsx:130:49 summary «Распределение запаса» |
| src/LiveContentInventory.tsx:131:5 div |
| src/LiveContentInventory.tsx:144:52 button; onClick={()=>openPublisher(row.channelId)} |
| src/LiveContentInventory.tsx:151:13 details |
| src/LiveContentInventory.tsx:151:55 summary «Подробнее» |
| src/LiveContentInventory.tsx:155:15 button; onClick={()=>void chooseRenderFolder(row.channelId)} |
| src/LiveContentInventory.tsx:156:15 button «Проверить»; onClick={()=>void scanInventoryChannel(row.channelId,'manual-channel')} |
| src/LiveContentInventory.tsx:164:7 details |
| src/LiveContentInventory.tsx:164:47 summary «Как определяется готовность» |
| src/MaterialsManager.tsx:295:34 button «Ручная сборка»; onClick={openManualAssembly} |
| src/MaterialsManager.tsx:295:131 button «Обновить»; onClick={()=>void refresh()} |
| src/MaterialsManager.tsx:299:168 span «каналов» |
| src/MaterialsManager.tsx:312:13 details |
| src/MaterialsManager.tsx:312:55 summary «Подробнее» |
| src/MaterialsManager.tsx:313:54 button «Изображения»; onClick={()=>void importImages(ch)} |
| src/MaterialsManager.tsx:313:307 button «Обновить музыку»; onClick={()=>void reindexMusic(ch.id)} |
| src/MaterialsManager.tsx:313:419 button «Открыть папку»; onClick={()=>void productionManagerApi.openFolder(row.image.rootPath)} |
| src/MaterialsManager.tsx:337:18 ModalPortal; onClose={closeManual} |
| src/MaterialsManager.tsx:338:7 section; onMouseDown={e=>e.stopPropagation()} |
| src/MaterialsManager.tsx:340:70 button «×»; onClick={closeManual} |
| src/MaterialsManager.tsx:351:38 button «Выбрать изображения»; onClick={()=>void chooseManualImages()} |
| src/MaterialsManager.tsx:351:182 button «Очистить выбор»; onClick={()=>setManualImages([])} |
| src/MaterialsManager.tsx:357:38 button «Выбрать файлы»; onClick={()=>void chooseManualMusicFiles()} |
| src/MaterialsManager.tsx:357:156 button «Выбрать папку»; onClick={()=>void chooseManualMusicFolder()} |
| src/MaterialsManager.tsx:357:278 button «Очистить выбор»; onClick={()=>{setManualMusic([]);setManualMusicRoot('')}} |
| src/MaterialsManager.tsx:374:11 button «Отмена»; onClick={closeManual} |
| src/NotificationStack.tsx:42:4 button; onClick={openHistory} |
| src/NotificationStack.tsx:43:159 button «Ещё уведомлений: · Открыть историю»; onClick={openHistory} |
| src/NotificationStack.tsx:45:63 button «×»; onClick={()=>setHistoryOpen(false)} |
| src/ProductionOS.tsx:84:344 details |
| src/ProductionOS.tsx:84:384 summary «Дополнительно» |
| src/ProductionOS.tsx:87:66 button «Обзор»; onClick={()=>{setSection('overview');setTab('queue');changeQueueFilter('all')}} |
| src/ProductionOS.tsx:88:300 button; onClick={()=>changeQueueFilter(st)} |
| src/ProductionOS.tsx:88:543 select; onChange={e=>changeQueueFilter(e.target.value)} |
| src/ProductionOS.tsx:88:1439 button «Снять выделение»; onClick={()=>patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!visibleIdSet.has(id))})} |
| src/ProductionOS.tsx:88:1563 button «Удалить выбранные»; onClick={()=>void deleteJobs(selectedJobIds.filter(id=>visibleIdSet.has(id)),'Удалить выбранные проекты?')} |
| src/ProductionOS.tsx:88:4110 button «Показать ещё 50 · осталось»; onClick={()=>setQueueLimit(n=>n+50)} |
| src/PublisherShell.tsx:42:5 button «Очистить черновик»; onClick={p.onClear} |
| src/PublisherShell.tsx:48:28 button; onClick={control.onClick} |
| src/RpmCoverageCard.tsx:24:3 details |
| src/RpmCoverageCard.tsx:24:47 summary «Как считается оценка» |
| src/ScheduleOS.tsx:58:532 button «СКРЫТЬ ВОССТАНОВЛЕНИЕ»; onClick={()=>{clearScheduleRecovery(channelId);setRecovery(undefined)}} |
| src/ScheduleOS.tsx:61:42 summary «Закрытые без даты ( ) · выбираются вручную» |
| src/ScheduleOS.tsx:65:80 section; onMouseDown={e=>e.stopPropagation()} |
| src/SettingsOS.tsx:39:121 button; onClick={()=>onChange(!value)} |
| src/SettingsOS.tsx:142:381 button; onClick={()=>setTab(id)} |
| src/SettingsOS.tsx:146:179 button «Компактно»; onClick={()=>patch({interfaceDensity:'compact'})} |
| src/SettingsOS.tsx:146:382 button «Просторно»; onClick={()=>patch({interfaceDensity:'comfortable'})} |
| src/SettingsOS.tsx:148:138 button «Выключен»; onClick={()=>setMode('off')} |
| src/SettingsOS.tsx:148:257 button «С подсказками»; onClick={()=>setMode('assisted')} |
| src/SettingsOS.tsx:148:396 button «Локальный»; onClick={()=>setMode('full')} |
| src/SystemHealthPanel.tsx:21:4 details |
| src/SystemHealthPanel.tsx:21:48 summary «Источник данных» |
| src/UpdateExperience.tsx:26:126 button «Установить и перезапустить»; onClick={installSafely} |
| src/YouTubeCenter.tsx:39:92 button; onClick={()=>setQuotaOpen(x=>!x)} |
| src/YouTubeCenter.tsx:39:612 button; onClick={()=>setTab(id)} |
| src/apex-ui.tsx:13:9 button; ...props |
| src/apex-ui.tsx:21:9 Button; ...props |
| src/apex-ui.tsx:32:3 input; ...props |
| src/apex-ui.tsx:33:76 small |
| src/apex-ui.tsx:44:3 select; ...props |
| src/apex-ui.tsx:45:76 small |
| src/apex-ui.tsx:54:3 input; ...props |
| src/apex-ui.tsx:58:52 Choice; ...props |
| src/apex-ui.tsx:59:50 Choice; ...props |
| src/apex-ui.tsx:73:9 div |
| src/apex-ui.tsx:89:9 div |
| src/apex-ui.tsx:89:118 button; onClick={()=>onValueChange(item.id)}; onKeyDown={event=>keydown(event,index)} |
| src/apex-ui.tsx:104:66 Button «Назад»; onClick={()=>onPageChange(current-1)} |
| src/apex-ui.tsx:104:199 Button «Далее»; onClick={()=>onPageChange(current+1)} |
| src/apex-ui.tsx:107:9 div |
| src/apex-ui.tsx:110:9 div |
| src/apex-ui.tsx:116:9 ModalPortal; onClose={onClose} |
| src/apex-ui.tsx:116:86 section; onMouseDown={event=>event.stopPropagation()} |
| src/apex-ui.tsx:117:40 IconButton; onClick={onClose} |

## Манифесты SHA-256 содержимого

Они идентифицируют прочитанные файлы, но не включают другие ресурсы приложения.

| Файл | Исходный срез | Целевой срез |
|---|---|---|
| src/AccountsPage.tsx | 9b4ca2e6e4480b32c36f8d04ffd647f7b5c0d53f9e1b21efcb20a5a2516c7a09 | a53052c61af070355b6678d1ed96e4820fe40e550a74561d83249e5a2b243b63 |
| src/ActivityHistory.tsx | bc4b989e4b133898aa92f6381ae06f09f42487fbdee21cf6b62ca05dac60a3c5 | bc4b989e4b133898aa92f6381ae06f09f42487fbdee21cf6b62ca05dac60a3c5 |
| src/AiAnalyticsExport.tsx | b60c07a72163cffb5f1c955f708990183a6a8542912e9c29bdffdbe14b1e5ad8 | b60c07a72163cffb5f1c955f708990183a6a8542912e9c29bdffdbe14b1e5ad8 |
| src/Analytics360Fleet.tsx | d3afe46911a658d20996c37179aa6c6bae5fe567dda6e7ab0fbf5f3320ffb9fc | bd6f97af8d52a493127ab48cbaefe0a5d57cef47ab844848eae68c63bf0f7e3b |
| src/Analytics360Page.tsx | 76531665001761a06906f2231013be64be75faa932a5d24ca7ba57f22838f235 | 631ec38ab16ac89f94ede11a8069a63d68e5d0549b3411f058e5aa2a9616356a |
| src/Analytics360Winners.tsx | 48c2e140439448ce6c615693c728a4b5cc8027f5ecb8062bcba5505de146ffc1 | a3b835468aada19d0e35eb41d70bc18eccd2bd09da1fcc62078da4c387f49d23 |
| src/AnalyticsPage.tsx | 59984e98b021dec972400e93da8901be019514fe3adce9688480ce5285f7a532 | 2be871336efe0da4f63f1bff02f89152c4bcf280927bb1ba5a5260bab8314740 |
| src/App.tsx | e163579abe40812a4e685af409844796925f8dc6b4a74b44ccc573e8a7f93124 | 77cd29c5547703135d1e4cc893cd3a8d3f8f53d965a907e351c4968ac99728e1 |
| src/AuthRecoveryCenter.tsx | d7f6230230224163a7528590e6c9ef64ed939f3cf05d06f4512f7b41dba09ba8 | d7f6230230224163a7528590e6c9ef64ed939f3cf05d06f4512f7b41dba09ba8 |
| src/BatchControl.tsx | 51c04ba290292a1a202dc5461ed7b1ef0bdd4cf37eff9343ac4b5b20b3f0f1e4 | 8a4dc89f3eaad92988f109d24a4f28e7c35556d249b1371836e533285326048e |
| src/ChannelAvatar.tsx | aa1b38b7968a564daaa06cfa75271ca17686fdac9ae20d02de4f4b8e9b592f3b | aa1b38b7968a564daaa06cfa75271ca17686fdac9ae20d02de4f4b8e9b592f3b |
| src/ChannelPassport.tsx | 7e3d6373ab7c99567c6f3429e91900a46cc8b6c9afd6c7ffd8fe71331431e1cb | 7e3d6373ab7c99567c6f3429e91900a46cc8b6c9afd6c7ffd8fe71331431e1cb |
| src/ChannelRunway.tsx | e3d0af7d1add79c0a2e807c9b8fb1db2e8022a2f9f669b2211f537a965cdfefe | e3d0af7d1add79c0a2e807c9b8fb1db2e8022a2f9f669b2211f537a965cdfefe |
| src/ChannelRunwayScheduler.tsx | 1ffba1c3935ef983a1b8953267ded75b30555dfdc12d8efaa2afeb7a4b3dbbcd | 1ffba1c3935ef983a1b8953267ded75b30555dfdc12d8efaa2afeb7a4b3dbbcd |
| src/ChannelStatisticsScheduler.tsx | 5b3f1b79f04046fe51148db93babff86863cabc92d1ec06cf2d326b6fdcd9173 | 5b3f1b79f04046fe51148db93babff86863cabc92d1ec06cf2d326b6fdcd9173 |
| src/ChannelsOS.tsx | 83c5bac0f34799b3c5e1ac5a0541f11ba2803fe36749d94b3c2fdfe47b341d62 | 85bc928616565b8c5722c1d4a6ab488493e19d2e3583cd826b8e47abea18c8e1 |
| src/CommandCenter.tsx | 48d9e81d8f2fbaa3632815b425effa5160b11bf899a0599fb22cdaa09b3148cd | cf074bce31aaa73b4d757569a99c00e2feb98f6db1eee5fa8ca35acfc22b9cbc |
| src/CommandPalette.tsx | 12ab1365a89f2015ce7c8bc0414b8f8871bafa1287529ee15e6b790a4186b50c | 12ab1365a89f2015ce7c8bc0414b8f8871bafa1287529ee15e6b790a4186b50c |
| src/CompetitorsPage.tsx | fcaaa9c033748abedc0b9462b5a085316a07a558893a97946774fb386e1ffcde | 22d7a66624aed2da942aec2d0e0106c110cbb123353959b37eb3d854d66ec7b7 |
| src/DailyOperationsCenter.tsx | cab1a14352b27b02d1ee575080ca416a8c7749ef67f5dae90d79e464d7729c11 | cab1a14352b27b02d1ee575080ca416a8c7749ef67f5dae90d79e464d7729c11 |
| src/DashboardOS.tsx | 9a44b2c1d5471f4d216eb2657e90bfb32ed190c74af92547ea6c65ab5441cfb9 | 86ddaa394504262aef4e5badcb42ee20cdbe2b38f917f733e6d298853dca69dd |
| src/ExistingInventoryMigrationBridge.tsx | 9f40deef3e56606b50cc8b835f58c578b751d733462eb74a4395e303adbb75ad | 9f40deef3e56606b50cc8b835f58c578b751d733462eb74a4395e303adbb75ad |
| src/ExistingVideos.tsx | 9783d77c7db0f408c268dc86de2a23bcd6adc5dee14eb81c408d68ee1d3e4e13 | 9783d77c7db0f408c268dc86de2a23bcd6adc5dee14eb81c408d68ee1d3e4e13 |
| src/GlobalYouTubeCleanup.tsx | 92390246521dd6f0d7010adf17c8a252ac62fc6d94168a499ac39926ebbddad6 | 92390246521dd6f0d7010adf17c8a252ac62fc6d94168a499ac39926ebbddad6 |
| src/HistoryPage.tsx | 04c6faa79876cbffa6671f2e407bde9ffabaf6b4987fa22563cc46a5b31da81a | afcbd9d7133c9654ce15a10066ff131b1a65cba589b11b0dbaa2ed04b4ca03ed |
| src/LiveContentInventory.tsx | 570df1db627c21a1ae2692a573afcdf7dd751015b9639381e9e6829fc87c7078 | 3a7f2b53bb1bd3b96458048d7ded6094e7b425d0f05ef28d3e73fa5d8f71b2b6 |
| src/LiveInventoryBridge.tsx | 7d2e6ae48ca4712fc9ad3dcfbb18ddb243ebacc0508efa85061ab8c6d8023531 | f3bf5486a83f0ff95c2b6b528bb34e96131a535d39c6efb188098b1bd1ce2deb |
| src/LocalProfileMenu.tsx | 619edbb526b110be396edfa12fd85863c7937a262fa13c863cde3c6529dc2ec1 | 619edbb526b110be396edfa12fd85863c7937a262fa13c863cde3c6529dc2ec1 |
| src/M1PerformanceProbe.tsx | b664e9a4b5401792c4012d99a66cb3d4fa4b1087b619a76179a8b35739659767 | b664e9a4b5401792c4012d99a66cb3d4fa4b1087b619a76179a8b35739659767 |
| src/MajorUpdateCelebration.tsx | c4b96839cf8ba53b8a04d7bc1dc89a7288965a85f5fe4a91dc33a52a484105d2 | c4b96839cf8ba53b8a04d7bc1dc89a7288965a85f5fe4a91dc33a52a484105d2 |
| src/MaterialsManager.tsx | 5a1f9caea3cf88cfc96aea7db63ef8a9ab2984d9357bce5766ddf7110b06bd4f | 38f0e56fa8568b19e2ed953aacaeba9df964ea9ca0e0cf21cba3709adf55a620 |
| src/MetadataPage.tsx | cc232bb1311525bcab42b69267725186d165bab59001c9a9dbb771aa5a2bffec | cc232bb1311525bcab42b69267725186d165bab59001c9a9dbb771aa5a2bffec |
| src/MetadataQueueAssignmentBridge.tsx | 56f5eac968e1c049db750a48a06d32b632db1a8b23c26b9ee0aa949c36190353 | f8ec2b62aeb5b50e418bc0fdc26ba8fc487b8c40b5e4af08da6fa30a1f7fac58 |
| src/MetadataQueuePanel.tsx | 379203ccda19b9ecdcca6ca0fc4653e9e6c1a0ce5ac7da0eae740d18a58638da | 379203ccda19b9ecdcca6ca0fc4653e9e6c1a0ce5ac7da0eae740d18a58638da |
| src/MetadataTabs.tsx | 5abf74c53e8214d1a6dcd912c96d45f7822485ef30c5c37385cf87dd87e055cf | 5abf74c53e8214d1a6dcd912c96d45f7822485ef30c5c37385cf87dd87e055cf |
| src/MigrationPanel.tsx | 5539d82bf65214e4a312dc38004dcd6e2965af9a8b0bdf0118a0e314c82e66c4 | 5539d82bf65214e4a312dc38004dcd6e2965af9a8b0bdf0118a0e314c82e66c4 |
| src/ModalPortal.tsx | 4dffe2c2417dc7ca8be9d248de0e71d4edf18fb3920b0a4db72d7451def023cb | 4dffe2c2417dc7ca8be9d248de0e71d4edf18fb3920b0a4db72d7451def023cb |
| src/NotificationStack.tsx | 5b91265a764a84300677da16f3cd7efbeb857750bfcd87a07e27dfac702a9d75 | 44ed492d9b7592a2688b23862d79e5e7a4480287cb94a7d8b99296af58b9c017 |
| src/OAuthInventoryPanel.tsx | b01adb17bb6c317d535f396c21e4058a444a52b31e762897e5570e55726ae2a4 | b01adb17bb6c317d535f396c21e4058a444a52b31e762897e5570e55726ae2a4 |
| src/OwnerInventoryScheduler.tsx | e1866f61a3ac0be2b2cc0f890003f396284f172f551b9d1337af18596f041558 | e1866f61a3ac0be2b2cc0f890003f396284f172f551b9d1337af18596f041558 |
| src/OwnerProfile.tsx | 9aeb2f61a9b7e9eaf0178729ecfb827a42784b905d18e501a67ca075a76ce2eb | 9aeb2f61a9b7e9eaf0178729ecfb827a42784b905d18e501a67ca075a76ce2eb |
| src/ProductionManager.tsx | 0fa3489df1b8a67e884501d77f45705035992ed0f70a3aa8b1d3b42f6c3af120 | e2e5147e06884ff1bef0ba043929c6a8da3105d1adef5920cba46bc4182b6a9d |
| src/ProductionOS.tsx | 73bd11bf0ccd01b7d8249125bc8202319aef33375bbee4219b7d2b4c5a18039d | f65a853ba070b462251e840ef41d13e480940cf60911f068c28abb8a4f7bcf0c |
| src/ProductionPipelinePanel.tsx | 2141cb3979d66886c38a408e7dd544e2d158ff0a69f379d8f2acaf8676f03b4e | 2141cb3979d66886c38a408e7dd544e2d158ff0a69f379d8f2acaf8676f03b4e |
| src/ProductionStatusBridge.tsx | 6765f9a45c2df0917fcdb72deb166bd43c123174a9b8d46bdc992a5b2789a66c | 2776e9e86549707ce7d8872824c6f56d89829bfd262f3cd1295872ec867399bc |
| src/ProductionWorkspace.tsx | 313069ea5ec33cbb641edf4deb77d4408db269420683df38f65de43f324813bd | 313069ea5ec33cbb641edf4deb77d4408db269420683df38f65de43f324813bd |
| src/PublisherOS.tsx | 579c3e915267c911893a09d2bba4ec6db9eadbad59e8d6fbf30dbee5ee21c1c5 | 4f4e5639c036c6ed250737df73bedb717793a6ddc47190ed74558e1785387703 |
| src/PublisherShell.tsx | c2e1db4f1ab7aa05fa7e36e7b4d1f67d2301ad2accc326b8615753bc1297937c | 0ca0facc22c8532801a1de48cd770589a9a39dffc6fd0dd929a5b05663c10049 |
| src/PublisherVideoPicker.tsx | 08d8f6800628408b11540e485dc48448f3bcbd9a418428594d6f29726b08a7ed | 08d8f6800628408b11540e485dc48448f3bcbd9a418428594d6f29726b08a7ed |
| src/QuotaMeter.tsx | 02e7cba9a237f033aa56431c697ccd649174bf7fceb5df3d82ac654d84c07e4c | 02e7cba9a237f033aa56431c697ccd649174bf7fceb5df3d82ac654d84c07e4c |
| src/ReadyVideoInventoryPanel.tsx | 6403940f649a1c91cff13e93b56f75f4a41bbbf8c8c34cd76cc4e2f36ae72b86 | 6403940f649a1c91cff13e93b56f75f4a41bbbf8c8c34cd76cc4e2f36ae72b86 |
| src/RecoveryGate.tsx | 1d85336aae52a1b30a0e06a6c0c1752c8343e1a76a3af71117f0a2109b0a9aa0 | 1d85336aae52a1b30a0e06a6c0c1752c8343e1a76a3af71117f0a2109b0a9aa0 |
| src/ReleaseHistoryTimeline.tsx | 80154356b0e604686bb4936f004c3ce2f54d5a566753d59bc2b6669a4a0ae6af | 80154356b0e604686bb4936f004c3ce2f54d5a566753d59bc2b6669a4a0ae6af |
| src/RpmCoverageCard.tsx | 9299100916523bebe4f197014fcf3b56f9659531771e4b497617517e2d5a6833 | 94f7757e12094a30d37cc405fe34281dd78733db516bd72d7d586df514a097e8 |
| src/SafeArtwork.tsx | afd476fe5b837d6e6953960d1cdac6942c0a7766b4c23bdb7e857c55a7a71f2a | afd476fe5b837d6e6953960d1cdac6942c0a7766b4c23bdb7e857c55a7a71f2a |
| src/ScheduleOS.tsx | 2518b5f53c291f93770cb28b2bf5856580bc28949a8bca9bb6db06f431053224 | 48eb8dcc84db8781103d900cc00fd1980f74664f02ecac12e8b4a1bb90a4accc |
| src/ScheduleWorkspace.tsx | f81e29c0fc3043bf32e274998f4ac3b4f8903eaa1961f6067396c50c611aaafd | f81e29c0fc3043bf32e274998f4ac3b4f8903eaa1961f6067396c50c611aaafd |
| src/ScreenErrorBoundary.tsx | ad231daae532e946a2dbd769db04b14d68f051611ca1e180b3e37e7ef5291560 | ad231daae532e946a2dbd769db04b14d68f051611ca1e180b3e37e7ef5291560 |
| src/SettingsOS.tsx | 5c01d87d815b1eacfcd07eba93b89c619fae68f12ae2f764167d3c8fc7790531 | 01bf27af195e55b25376979f393d848485d0c1973f05a16cfdc12b0520d339de |
| src/StatisticsCenter.tsx | a918b456353434805542c7a0e9e111540627e580a1874d0b0d067ef16b54c54b | a918b456353434805542c7a0e9e111540627e580a1874d0b0d067ef16b54c54b |
| src/SystemHealthPanel.tsx | 5da4290dc617d993271a4a65e92578b94bfc2cd8add3f2eba5056ee2ca0f252a | d93c97c763500953ddfa250b94c918028c667ccf9c8d81bcf8f281135dc1b86a |
| src/TaskCenter.tsx | a6543cd600108d0f6243b9b8fbc23b3a1ce276317711d544a7ae86868d360977 | a6543cd600108d0f6243b9b8fbc23b3a1ce276317711d544a7ae86868d360977 |
| src/UiErrorBoundary.tsx | 8fec4db13e35d4a44030e681d31407d54736733e05e0b6488eca1d094a5e8da6 | 8fec4db13e35d4a44030e681d31407d54736733e05e0b6488eca1d094a5e8da6 |
| src/UpdateExperience.tsx | 16a9f58054233e11bedc767ed61953108638501015433c3de530f407fb88e852 | fa5238f3cf96275d4d0a3e5f744a439ed692902c15b2345ee83843710042ee70 |
| src/UploadCenter.tsx | fbb9ad0ba5eb81bbcc2b13952e1555e66416be804dbdb725d5d067a6d5c3b0f2 | 799c41d6c70a8aede6002f27b95f4f0fc3a274aa1524fd2478623c5ba5258b06 |
| src/UploadProcessingMonitor.tsx | fa5a0d4c31e16c49a372173c1d25caf82f6d6ef9113ce07fda728f2f9ad697a4 | fa5a0d4c31e16c49a372173c1d25caf82f6d6ef9113ce07fda728f2f9ad697a4 |
| src/YouTubeCalendar.tsx | a1dcb2e877f21b395b08c974e6ec2e9bca200e8a29d74c988fb918a1ef91bdb4 | a1dcb2e877f21b395b08c974e6ec2e9bca200e8a29d74c988fb918a1ef91bdb4 |
| src/YouTubeCenter.tsx | 3d3a743080964156facaf9b5d5598271b6ac810e5b803cfe4844cee14f06d77b | b3ab5d712e00b991da88f662dff597186387791eeb9e2a385c494977abbee754 |
| src/YouTubeChannelBar.tsx | 1e1e349167107668d7e5ab3acce13ee11ca328f41d338d17c4c8e70a9813f4d5 | 1e1e349167107668d7e5ab3acce13ee11ca328f41d338d17c4c8e70a9813f4d5 |
| src/YouTubeDataPage.tsx | 7a32e9aa1768e460b6620c5262454b0877acbb338bae2cd1e81958a5e342b39d | 7a32e9aa1768e460b6620c5262454b0877acbb338bae2cd1e81958a5e342b39d |
| src/YouTubeDataTools.tsx | 999a6684811bd164a35e39446a4079b2d60f9697a2c27d2a4834863e696972ab | 999a6684811bd164a35e39446a4079b2d60f9697a2c27d2a4834863e696972ab |
| src/apex-ui.tsx | нет | cbee130d29e400583466e7d2c89f63c0b42dd3c4f18c4b95200053e2c9cb82ff |
| src/main.tsx | 3b19af5f72408ccf9df7150c8e11eefa057d2ca08b782a0104ade3b41a2931eb | ae3a078c4276de5a2b7cae71dc2afe2d3ae0d0bd165a8e0b1763f1dd61240330 |
