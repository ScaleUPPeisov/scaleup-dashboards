# VYRON APEX — статический инвентарь элементов управления

Снимок рабочих файлов на HEAD 925d07c7, включая незакоммиченные изменения, исходный 6.1.17 e65bae680637f5c2a8cc60a886a17691d5694263. Связанный реестр: [FUNCTIONAL_PARITY_MATRIX.md](FUNCTIONAL_PARITY_MATRIX.md).

Результат всех строк: **поведение не проверено; PASS отсутствует**. Список получен из AST всех файлов src/*.tsx, исключая тесты; указаны интерактивные HTML-элементы, элементы с обработчиками и все вызовы React-компонентов. Строки с одинаковым номером содержат разные позиции в исходном файле. Наличие файла в 6.1.17 не доказывает совпадение элемента, его достижимость или сохранение функционала. Текст и выражения сокращены; источник по ссылке первичен.

Компоненты могут возвращать произвольное количество элементов из данных, ветвиться по условиям и создавать элементы через spread props, порталы или нативные API. Один JSX-узел может представлять много действий, а компонент без обработчика может содержать внутренние кнопки. Для каждого узла нужны сравнение исходного релиза и текущего состояния, проверка положительного/ошибочного сценария, клавиатуры, побочных эффектов и фиксация результата. Реальные пользовательские данные не считывались.

## src/AccountsPage.tsx

Разделы реестра: AUTH. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [369:5](src/AccountsPage.tsx#L369) | button | динамически / вложено / нет текста | onClick={checkAll} |
| [370:5](src/AccountsPage.tsx#L370) | button | динамически / вложено / нет текста | onClick={()=>void refreshAllStats(true)} |
| [371:5](src/AccountsPage.tsx#L371) | button | + Добавить канал | onClick={()=>void askBrowser('')} |
| [379:3](src/AccountsPage.tsx#L379) | input | динамически / вложено / нет текста | onChange={e=>{void importCredentials(e.target.files);e.currentTarget.value=''}}; type="file" |
| [381:3](src/AccountsPage.tsx#L381) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [381:43](src/AccountsPage.tsx#L381) | summary | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [390:310](src/AccountsPage.tsx#L390) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [390:319](src/AccountsPage.tsx#L390) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [390:415](src/AccountsPage.tsx#L390) | button | Восстановить сохранённый доступ | onClick={()=>void recoverSavedGlobalOauth()} |
| [390:544](src/AccountsPage.tsx#L390) | button | Повторить безопасную проверку | onClick={()=>void retryGlobalOauth()} |
| [391:331](src/AccountsPage.tsx#L391) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [391:340](src/AccountsPage.tsx#L391) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [391:436](src/AccountsPage.tsx#L391) | button | Восстановить сохранённый доступ | onClick={()=>void recoverSavedGlobalOauth()} |
| [393:41](src/AccountsPage.tsx#L393) | button | Восстановить сохранённый доступ | onClick={()=>void recoverSavedGlobalOauth()} |
| [393:170](src/AccountsPage.tsx#L393) | button | динамически / вложено / нет текста | onClick={()=>file.current?.click()} |
| [393:329](src/AccountsPage.tsx#L393) | input | динамически / вложено / нет текста | onChange={e=>patchSettings({youtubeApiKey:e.target.value.trim()})}; type="password" |
| [397:226](src/AccountsPage.tsx#L397) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [397:235](src/AccountsPage.tsx#L397) | summary | Данные привязки | нет в этом узле; проверить родителя и вложенный компонент |
| [397:657](src/AccountsPage.tsx#L397) | button | Повторить безопасную проверку | onClick={checkAll} |
| [398:24](src/AccountsPage.tsx#L398) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [398:59](src/AccountsPage.tsx#L398) | summary | OAuth credential diagnostics • без secret values | нет в этом узле; проверить родителя и вложенный компонент |
| [427:9](src/AccountsPage.tsx#L427) | button | Проверить | onClick={()=>void checkProfile(p)} |
| [428:48](src/AccountsPage.tsx#L428) | button | Безопасный retry | onClick={()=>void safeRetryProfile(p)} |
| [429:9](src/AccountsPage.tsx#L429) | button | динамически / вложено / нет текста | onClick={()=>void refreshProfileStats(p)} |
| [430:9](src/AccountsPage.tsx#L430) | button | динамически / вложено / нет текста | onClick={()=>void askBrowser(p.id)}; title={credentialState==='KEYCHAIN_BLOCKED'?'Войти заново через браузер':'Переподключить через браузер'}; aria-label={credentialState==='KEYCHAIN_BLOCKED'?'Войти заново через браузер' |
| [431:9](src/AccountsPage.tsx#L431) | button | Удалить | onClick={async()=>{await api.youtubeDisconnect(p.id);await refresh()}} |
| [439:20](src/AccountsPage.tsx#L439) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>{setOauthSetupOpen(false);setPendingAddAfterGlobalRepair(false)}} |
| [440:4](src/AccountsPage.tsx#L440) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [445:13](src/AccountsPage.tsx#L445) | button | Отмена | onClick={()=>{setOauthSetupOpen(false);setPendingAddAfterGlobalRepair(false)}} |
| [445:138](src/AccountsPage.tsx#L445) | button | Повторить безопасную проверку | onClick={()=>void retryGlobalOauth()} |
| [445:239](src/AccountsPage.tsx#L445) | button | динамически / вложено / нет текста | onClick={()=>file.current?.click()} |
| [449:210](src/AccountsPage.tsx#L449) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setPreReconnectProfileId('')} |
| [450:4](src/AccountsPage.tsx#L450) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [455:13](src/AccountsPage.tsx#L455) | button | Отмена | onClick={()=>setPreReconnectProfileId('')} |
| [455:79](src/AccountsPage.tsx#L455) | button | Открыть YouTube | onClick={()=>void openYoutubeForProfile(preReconnectProfileId)} |
| [455:175](src/AccountsPage.tsx#L455) | button | Выбрать браузер и продолжить | onClick={()=>{const id=preReconnectProfileId;setPreReconnectProfileId('');void openBrowserPicker(id)}} |
| [459:18](src/AccountsPage.tsx#L459) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setWrongChannel(null)} |
| [460:4](src/AccountsPage.tsx#L460) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [465:375](src/AccountsPage.tsx#L465) | button | Открыть этот канал в VYRON | onClick={()=>{const id=ch.existingProfileId!;setWrongChannel(null);window.setTimeout(()=>document.getElementById('oauth-profile-${id}')?.scrollIntoView({behavior:'smooth',block:'center'}),50)}} |
| [466:5](src/AccountsPage.tsx#L466) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [466:14](src/AccountsPage.tsx#L466) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [467:13](src/AccountsPage.tsx#L467) | button | Отмена | onClick={()=>setWrongChannel(null)} |
| [467:72](src/AccountsPage.tsx#L467) | button | Открыть YouTube | onClick={()=>void api.youtubeOpenYoutube(wrongChannel.browser)} |
| [467:168](src/AccountsPage.tsx#L467) | button | Выбрать другой браузер | onClick={()=>{const w=wrongChannel;setWrongChannel(null);void openBrowserPicker(w.profileId)}} |
| [467:302](src/AccountsPage.tsx#L467) | button | Попробовать ещё раз | onClick={()=>{const w=wrongChannel;setWrongChannel(null);void reconnectExisting(w.profileId,w.browser)}} |
| [471:25](src/AccountsPage.tsx#L471) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>void cancelNewChannelSelection()} |
| [472:4](src/AccountsPage.tsx#L472) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [476:72](src/AccountsPage.tsx#L476) | button | динамически / вложено / нет текста | onClick={()=>void chooseNewAuthorizedChannel(ch)} |
| [477:13](src/AccountsPage.tsx#L477) | button | Отмена | onClick={()=>void cancelNewChannelSelection()} |
| [480:17](src/AccountsPage.tsx#L480) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>{setBrowserOpen(false);setPendingProfileId('')}} |
| [481:4](src/AccountsPage.tsx#L481) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [485:51](src/AccountsPage.tsx#L485) | button | динамически / вложено / нет текста | onClick={()=>setBrowser(x.id)} |
| [486:13](src/AccountsPage.tsx#L486) | button | Отмена | onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}} |
| [486:98](src/AccountsPage.tsx#L486) | button | Продолжить через | onClick={()=>void connect()} |
| [490:15](src/AccountsPage.tsx#L490) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setDuplicate(null)} |
| [491:4](src/AccountsPage.tsx#L491) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [497:13](src/AccountsPage.tsx#L497) | button | Отмена | onClick={()=>setDuplicate(null)} |
| [497:69](src/AccountsPage.tsx#L497) | button | Переподключить | onClick={()=>{const id=duplicate.profileId;setDuplicate(null);void askBrowser(id)}} |

## src/ActivityHistory.tsx

Разделы реестра: HIST. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [68:315](src/ActivityHistory.tsx#L68) | button | динамически / вложено / нет текста | onClick={()=>void reconcileLocal()} |
| [68:440](src/ActivityHistory.tsx#L68) | button | динамически / вложено / нет текста | onClick={()=>void reconcileRemote()} |
| [69:57](src/ActivityHistory.tsx#L69) | select | динамически / вложено / нет текста | onChange={e=>setChannelId(e.target.value)} |
| [69:139](src/ActivityHistory.tsx#L69) | option | Все каналы | нет в этом узле; проверить родителя и вложенный компонент |
| [69:193](src/ActivityHistory.tsx#L69) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [69:253](src/ActivityHistory.tsx#L69) | select | динамически / вложено / нет текста | onChange={e=>setRange(e.target.value as Range)} |
| [69:323](src/ActivityHistory.tsx#L69) | option | Сегодня | нет в этом узле; проверить родителя и вложенный компонент |
| [69:361](src/ActivityHistory.tsx#L69) | option | Вчера | нет в этом узле; проверить родителя и вложенный компонент |
| [69:401](src/ActivityHistory.tsx#L69) | option | 7 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [69:435](src/ActivityHistory.tsx#L69) | option | 30 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [69:471](src/ActivityHistory.tsx#L69) | option | Всё | нет в этом узле; проверить родителя и вложенный компонент |
| [69:512](src/ActivityHistory.tsx#L69) | select | динамически / вложено / нет текста | onChange={e=>setKind(e.target.value as Kind)} |
| [69:579](src/ActivityHistory.tsx#L69) | option | Все операции | нет в этом узле; проверить родителя и вложенный компонент |
| [69:620](src/ActivityHistory.tsx#L69) | option | Upload | нет в этом узле; проверить родителя и вложенный компонент |
| [69:658](src/ActivityHistory.tsx#L69) | option | Metadata | нет в этом узле; проверить родителя и вложенный компонент |
| [69:700](src/ActivityHistory.tsx#L69) | option | Schedule | нет в этом узле; проверить родителя и вложенный компонент |
| [69:742](src/ActivityHistory.tsx#L69) | option | Statistics | нет в этом узле; проверить родителя и вложенный компонент |
| [69:783](src/ActivityHistory.tsx#L69) | option | Cleanup | нет в этом узле; проверить родителя и вложенный компонент |
| [69:823](src/ActivityHistory.tsx#L69) | option | Recovery | нет в этом узле; проверить родителя и вложенный компонент |
| [69:865](src/ActivityHistory.tsx#L69) | option | Ошибки | нет в этом узле; проверить родителя и вложенный компонент |
| [69:911](src/ActivityHistory.tsx#L69) | select | динамически / вложено / нет текста | onChange={e=>setStatus(e.target.value)} |
| [69:974](src/ActivityHistory.tsx#L69) | option | Все статусы | нет в этом узле; проверить родителя и вложенный компонент |
| [69:1014](src/ActivityHistory.tsx#L69) | option | SUCCESS | нет в этом узле; проверить родителя и вложенный компонент |
| [69:1054](src/ActivityHistory.tsx#L69) | option | PARTIAL | нет в этом узле; проверить родителя и вложенный компонент |
| [69:1094](src/ActivityHistory.tsx#L69) | option | FAILED | нет в этом узле; проверить родителя и вложенный компонент |
| [69:1132](src/ActivityHistory.tsx#L69) | option | INFO | нет в этом узле; проверить родителя и вложенный компонент |
| [69:1175](src/ActivityHistory.tsx#L69) | input | динамически / вложено / нет текста | onChange={e=>setQuery(e.target.value)} |
| [74:580](src/ActivityHistory.tsx#L74) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [74:589](src/ActivityHistory.tsx#L74) | summary | Факты | нет в этом узле; проверить родителя и вложенный компонент |

## src/AiAnalyticsExport.tsx

Разделы реестра: ANALYTICS / WINNER. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [131:4](src/AiAnalyticsExport.tsx#L131) | button | динамически / вложено / нет текста | onClick={()=>{const next=!opened;setOpened(next);patchExportUi({opened:next})}} |
| [138:18](src/AiAnalyticsExport.tsx#L138) | select | динамически / вложено / нет текста | onChange={e=>{const next=e.target.value as 'offline'\|'online';setExportMode(next);if(next==='offline')setPeriod('all')}} |
| [139:6](src/AiAnalyticsExport.tsx#L139) | option | Из локального кэша · без интернета | нет в этом узле; проверить родителя и вложенный компонент |
| [140:6](src/AiAnalyticsExport.tsx#L140) | option | Обновить YouTube и экспортировать | нет в этом узле; проверить родителя и вложенный компонент |
| [142:19](src/AiAnalyticsExport.tsx#L142) | select | динамически / вложено / нет текста | onChange={e=>setMode(e.target.value as 'all'\|'selected')} |
| [143:6](src/AiAnalyticsExport.tsx#L143) | option | Все доступные ( ) | нет в этом узле; проверить родителя и вложенный компонент |
| [143:67](src/AiAnalyticsExport.tsx#L143) | option | Выбранные | нет в этом узле; проверить родителя и вложенный компонент |
| [145:19](src/AiAnalyticsExport.tsx#L145) | select | динамически / вложено / нет текста | onChange={e=>setPeriod(e.target.value as Period)} |
| [146:6](src/AiAnalyticsExport.tsx#L146) | option | Вся доступная история | нет в этом узле; проверить родителя и вложенный компонент |
| [146:56](src/AiAnalyticsExport.tsx#L146) | option | Последний год | нет в этом узле; проверить родителя и вложенный компонент |
| [147:6](src/AiAnalyticsExport.tsx#L147) | option | 90 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [147:41](src/AiAnalyticsExport.tsx#L147) | option | 30 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [147:76](src/AiAnalyticsExport.tsx#L147) | option | Свой диапазон | нет в этом узле; проверить родителя и вложенный компонент |
| [149:36](src/AiAnalyticsExport.tsx#L149) | input | динамически / вложено / нет текста | onChange={e=>setStartDate(e.target.value)}; type="date" |
| [150:15](src/AiAnalyticsExport.tsx#L150) | input | динамически / вложено / нет текста | onChange={e=>setEndDate(e.target.value)}; type="date" |
| [154:6](src/AiAnalyticsExport.tsx#L154) | input | динамически / вложено / нет текста | onChange={e=>setSelected(old=>e.target.checked?[...old,c.channelId]:old.filter(id=>id!==c.channelId))}; type="checkbox" |
| [160:6](src/AiAnalyticsExport.tsx#L160) | input | динамически / вложено / нет текста | onChange={e=>setIncludeRetention(e.target.checked)}; type="checkbox" |
| [164:6](src/AiAnalyticsExport.tsx#L164) | input | динамически / вложено / нет текста | onChange={e=>setIncludeReporting(e.target.checked)}; type="checkbox" |
| [169:5](src/AiAnalyticsExport.tsx#L169) | button | Выбрать папку на Mac | onClick={()=>void chooseFolder().then(dir=>{if(dir){setFolder(dir);patchExportUi({folder:dir})}}).catch(e=>setError(String(e)))} |
| [173:5](src/AiAnalyticsExport.tsx#L173) | button | динамически / вложено / нет текста | onClick={()=>void start()} |
| [176:15](src/AiAnalyticsExport.tsx#L176) | button | динамически / вложено / нет текста | onClick={()=>void cancel()} |
| [179:14](src/AiAnalyticsExport.tsx#L179) | div | динамически / вложено / нет текста | role="status" |
| [186:13](src/AiAnalyticsExport.tsx#L186) | div | динамически / вложено / нет текста | role="status" |
| [191:47](src/AiAnalyticsExport.tsx#L191) | button | Открыть файл в Finder | onClick={()=>void invoke('reveal_path',{path:result.path}) .catch(e=>patchExportUi({error:'Не удалось открыть ZIP в Finder: '+String(e)}))} |
| [194:26](src/AiAnalyticsExport.tsx#L194) | small | Остановка запрошена: незавершённый ZIP не будет опубликован. Уже подтверждённая аналитика других кан | role="status" |
| [195:12](src/AiAnalyticsExport.tsx#L195) | div | динамически / вложено / нет текста | role="alert" |

## src/Analytics360Fleet.tsx

Разделы реестра: ANALYTICS / WINNER. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [106:4](src/Analytics360Fleet.tsx#L106) | button | динамически / вложено / нет текста | onClick={onRefresh}; title="Прочитать сохранённую аналитику с диска, без Google API" |
| [116:24](src/Analytics360Fleet.tsx#L116) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [116:66](src/Analytics360Fleet.tsx#L116) | summary | Что требует внимания · | нет в этом узле; проверить родителя и вложенный компонент |
| [117:39](src/Analytics360Fleet.tsx#L117) | button | динамически / вложено / нет текста | onClick={()=>onChoose(r.channel.id)} |
| [122:20](src/Analytics360Fleet.tsx#L122) | select | динамически / вложено / нет текста | onChange={e=>setFilter(e.target.value as typeof filter)} |
| [123:5](src/Analytics360Fleet.tsx#L123) | option | Все | нет в этом узле; проверить родителя и вложенный компонент |
| [123:37](src/Analytics360Fleet.tsx#L123) | option | Требуют внимания | нет в этом узле; проверить родителя и вложенный компонент |
| [124:5](src/Analytics360Fleet.tsx#L124) | option | Есть готовые | нет в этом узле; проверить родителя и вложенный компонент |
| [124:48](src/Analytics360Fleet.tsx#L124) | option | С аналитикой | нет в этом узле; проверить родителя и вложенный компонент |
| [126:23](src/Analytics360Fleet.tsx#L126) | select | динамически / вложено / нет текста | onChange={e=>setSort(e.target.value as typeof sort)} |
| [127:5](src/Analytics360Fleet.tsx#L127) | option | По предупреждениям | нет в этом узле; проверить родителя и вложенный компонент |
| [127:58](src/Analytics360Fleet.tsx#L127) | option | Название | нет в этом узле; проверить родителя и вложенный компонент |
| [128:5](src/Analytics360Fleet.tsx#L128) | option | Рост за 28 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [128:52](src/Analytics360Fleet.tsx#L128) | option | Готовые видео | нет в этом узле; проверить родителя и вложенный компонент |
| [138:19](src/Analytics360Fleet.tsx#L138) | tr | динамически / вложено / нет текста | onClick={()=>onChoose(r.channel.id)}; onKeyDown={e=>{if(e.key==='Enter'\|\|e.key===' '){e.preventDefault();onChoose(r.channel.id)}}}; tabIndex={0} |

## src/Analytics360Page.tsx

Разделы реестра: ANALYTICS / WINNER. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [123:4](src/Analytics360Page.tsx#L123) | svg | динамически / вложено / нет текста | role="img"; aria-label={title+' по доступным датам; пробелы означают отсутствие данных'} |
| [138:7](src/Analytics360Page.tsx#L138) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [153:20](src/Analytics360Page.tsx#L153) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [167:13](src/Analytics360Page.tsx#L167) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [182:323](src/Analytics360Page.tsx#L182) | button | Закрыть | onClick={onClose} |
| [183:35](src/Analytics360Page.tsx#L183) | Kpi (компонент) | динамически / вложено / нет текста | name="Просмотры (публичный счётчик)" |
| [183:142](src/Analytics360Page.tsx#L183) | Kpi (компонент) | динамически / вложено / нет текста | name="Лайки" |
| [183:225](src/Analytics360Page.tsx#L183) | Kpi (компонент) | динамически / вложено / нет текста | name="Комментарии" |
| [183:320](src/Analytics360Page.tsx#L183) | Kpi (компонент) | динамически / вложено / нет текста | name="Дней с аналитикой" |
| [184:3](src/Analytics360Page.tsx#L184) | Graph (компонент) | динамически / вложено / нет текста | title="Просмотры видео по датам" |
| [188:5](src/Analytics360Page.tsx#L188) | Kpi (компонент) | динамически / вложено / нет текста | name="Наблюдаемые показы обложек" |
| [189:5](src/Analytics360Page.tsx#L189) | Kpi (компонент) | динамически / вложено / нет текста | name="CTR · исходное значение Google" |
| [197:5](src/Analytics360Page.tsx#L197) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [201:4](src/Analytics360Page.tsx#L201) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [201:13](src/Analytics360Page.tsx#L201) | summary | Описание | нет в этом узле; проверить родителя и вложенный компонент |
| [202:7](src/Analytics360Page.tsx#L202) | a | Открыть на YouTube | нет в этом узле; проверить родителя и вложенный компонент |
| [215:9](src/Analytics360Page.tsx#L215) | Analytics360Fleet (компонент) | динамически / вложено / нет текста | ...props |
| [375:19](src/Analytics360Page.tsx#L375) | AnalyticsPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [379:35](src/Analytics360Page.tsx#L379) | button | динамически / вложено / нет текста | onClick={()=>void quickRefresh()} |
| [380:5](src/Analytics360Page.tsx#L380) | button | динамически / вложено / нет текста | onClick={()=>void syncDeep(false)} |
| [382:3](src/Analytics360Page.tsx#L382) | YouTubeChannelBar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [385:9](src/Analytics360Page.tsx#L385) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [385:48](src/Analytics360Page.tsx#L385) | summary | Настройки сбора | нет в этом узле; проверить родителя и вложенный компонент |
| [385:118](src/Analytics360Page.tsx#L385) | input | динамически / вложено / нет текста | onChange={e=>setIncludeRetention(e.target.checked)}; type="checkbox" |
| [385:272](src/Analytics360Page.tsx#L385) | input | динамически / вложено / нет текста | onChange={e=>setIncludeReporting(e.target.checked)}; type="checkbox" |
| [385:423](src/Analytics360Page.tsx#L385) | button | динамически / вложено / нет текста | onClick={()=>void syncDeep(true)} |
| [386:3](src/Analytics360Page.tsx#L386) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [386:38](src/Analytics360Page.tsx#L386) | summary | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [386:133](src/Analytics360Page.tsx#L386) | FleetSubscriber (компонент) | динамически / вложено / нет текста | onChoose={choose}; onRefresh={refreshFleet} |
| [389:3](src/Analytics360Page.tsx#L389) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [389:38](src/Analytics360Page.tsx#L389) | summary | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [389:132](src/Analytics360Page.tsx#L389) | AiAnalyticsExport (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [390:13](src/Analytics360Page.tsx#L390) | div | динамически / вложено / нет текста | role="status" |
| [391:27](src/Analytics360Page.tsx#L391) | p | динамически / вложено / нет текста | role="status" |
| [392:133](src/Analytics360Page.tsx#L392) | button | динамически / вложено / нет текста | onClick={()=>{setTab(t);setVideoId(null)}} |
| [393:112](src/Analytics360Page.tsx#L393) | button | динамически / вложено / нет текста | onClick={()=>{setPeriod(p);setVideoPage(0)}} |
| [394:61](src/Analytics360Page.tsx#L394) | input | динамически / вложено / нет текста | onChange={e=>setStartDate(e.target.value)}; type="date" |
| [394:160](src/Analytics360Page.tsx#L394) | input | динамически / вложено / нет текста | onChange={e=>setEndDate(e.target.value)}; type="date" |
| [395:11](src/Analytics360Page.tsx#L395) | div | динамически / вложено / нет текста | role="alert" |
| [398:21](src/Analytics360Page.tsx#L398) | Analytics360Winners (компонент) | динамически / вложено / нет текста | onOpenVideo={(channelId,chosenVideoId)=>{ const next=channels.find(c=>c.youtubeChannelId===channelId); if(!next)return; saveActivePublishChannel(next.id);setActiveId(next.id); setVideoPage(0);setVideoId(chosenVideoId);se |
| [406:5](src/Analytics360Page.tsx#L406) | Kpi (компонент) | динамически / вложено / нет текста | name={period==='all'?'Просмотры всего · публичный счётчик YouTube':'Просмотры · '+selectedPeriodText} |
| [407:5](src/Analytics360Page.tsx#L407) | Kpi (компонент) | динамически / вложено / нет текста | name={period==='all'?'Часы просмотра · вся история':'Часы просмотра'} |
| [408:5](src/Analytics360Page.tsx#L408) | Kpi (компонент) | динамически / вложено / нет текста | name="Подписчиков получено" |
| [409:5](src/Analytics360Page.tsx#L409) | Kpi (компонент) | динамически / вложено / нет текста | name="Чистый прирост" |
| [410:5](src/Analytics360Page.tsx#L410) | Kpi (компонент) | динамически / вложено / нет текста | name="Потеря подписчиков" |
| [411:5](src/Analytics360Page.tsx#L411) | Kpi (компонент) | динамически / вложено / нет текста | name="Всего подписчиков" |
| [412:5](src/Analytics360Page.tsx#L412) | Kpi (компонент) | динамически / вложено / нет текста | name="Средняя длительность" |
| [413:5](src/Analytics360Page.tsx#L413) | Kpi (компонент) | динамически / вложено / нет текста | name="Опубликованных видео" |
| [415:4](src/Analytics360Page.tsx#L415) | Graph (компонент) | динамически / вложено / нет текста | title="Просмотры" |
| [416:35](src/Analytics360Page.tsx#L416) | Graph (компонент) | динамически / вложено / нет текста | title="Время просмотра, минуты" |
| [416:134](src/Analytics360Page.tsx#L416) | Graph (компонент) | динамически / вложено / нет текста | title="Чистый прирост подписчиков" |
| [419:167](src/Analytics360Page.tsx#L419) | button | динамически / вложено / нет текста | onClick={()=>{setTab('content');setVideoId(v.videoId)}} |
| [420:6](src/Analytics360Page.tsx#L420) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [422:35](src/Analytics360Page.tsx#L422) | BreakdownCard (компонент) | динамически / вложено / нет текста | title="Источники трафика" |
| [423:5](src/Analytics360Page.tsx#L423) | BreakdownCard (компонент) | динамически / вложено / нет текста | title="География зрителей" |
| [427:5](src/Analytics360Page.tsx#L427) | Kpi (компонент) | динамически / вложено / нет текста | name="Просмотры" |
| [428:5](src/Analytics360Page.tsx#L428) | Kpi (компонент) | динамически / вложено / нет текста | name="Показы обложек · доступные отчёты" |
| [429:5](src/Analytics360Page.tsx#L429) | Kpi (компонент) | динамически / вложено / нет текста | name="CTR · исходное число Google" |
| [430:5](src/Analytics360Page.tsx#L430) | Kpi (компонент) | динамически / вложено / нет текста | name="Средний % просмотра" |
| [432:4](src/Analytics360Page.tsx#L432) | Graph (компонент) | динамически / вложено / нет текста | title="Просмотры опубликованного контента" |
| [434:5](src/Analytics360Page.tsx#L434) | select | динамически / вложено / нет текста | onChange={e=>{setVideoType(e.target.value);setVideoPage(0)}}; aria-label="Тип контента" |
| [434:118](src/Analytics360Page.tsx#L434) | option | Все форматы | нет в этом узле; проверить родителя и вложенный компонент |
| [434:158](src/Analytics360Page.tsx#L434) | option | Обычные видео | нет в этом узле; проверить родителя и вложенный компонент |
| [434:202](src/Analytics360Page.tsx#L434) | option | Трансляции | нет в этом узле; проверить родителя и вложенный компонент |
| [434:242](src/Analytics360Page.tsx#L434) | option | Неопределённый формат / Shorts | нет в этом узле; проверить родителя и вложенный компонент |
| [435:5](src/Analytics360Page.tsx#L435) | select | динамически / вложено / нет текста | onChange={e=>{setVideoSort(e.target.value);setVideoPage(0)}}; aria-label="Сортировка видео" |
| [435:122](src/Analytics360Page.tsx#L435) | option | Новые сначала | нет в этом узле; проверить родителя и вложенный компонент |
| [435:167](src/Analytics360Page.tsx#L435) | option | Популярные сначала | нет в этом узле; проверить родителя и вложенный компонент |
| [438:36](src/Analytics360Page.tsx#L438) | tr | динамически / вложено / нет текста | onClick={()=>setVideoId(v.videoId)}; onKeyDown={e=>{if(e.key==='Enter'\|\|e.key===' '){e.preventDefault();setVideoId(v.videoId)}}}; tabIndex={0} |
| [442:48](src/Analytics360Page.tsx#L442) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [444:5](src/Analytics360Page.tsx#L444) | button | ← Назад | onClick={()=>setVideoPage(p=>Math.max(0,p-1))} |
| [445:5](src/Analytics360Page.tsx#L445) | button | Вперёд → | onClick={()=>setVideoPage(p=>p+1)} |
| [447:29](src/Analytics360Page.tsx#L447) | VideoPanel (компонент) | динамически / вложено / нет текста | onClose={()=>setVideoId(null)} |
| [448:92](src/Analytics360Page.tsx#L448) | button | Закрыть | onClick={()=>setVideoId(null)} |
| [449:35](src/Analytics360Page.tsx#L449) | BreakdownCard (компонент) | динамически / вложено / нет текста | title="Источники трафика" |
| [450:77](src/Analytics360Page.tsx#L450) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [453:36](src/Analytics360Page.tsx#L453) | Kpi (компонент) | динамически / вложено / нет текста | name="Получено подписчиков" |
| [453:90](src/Analytics360Page.tsx#L453) | Kpi (компонент) | динамически / вложено / нет текста | name="Потеряно подписчиков" |
| [453:142](src/Analytics360Page.tsx#L453) | Kpi (компонент) | динамически / вложено / нет текста | name="Чистый прирост" |
| [453:193](src/Analytics360Page.tsx#L453) | Kpi (компонент) | динамически / вложено / нет текста | name="Уникальные зрители" |
| [454:35](src/Analytics360Page.tsx#L454) | BreakdownCard (компонент) | динамически / вложено / нет текста | title="География · все доступные страны" |
| [455:5](src/Analytics360Page.tsx#L455) | BreakdownCard (компонент) | динамически / вложено / нет текста | title="Устройства · время просмотра" |
| [456:5](src/Analytics360Page.tsx#L456) | BreakdownCard (компонент) | динамически / вложено / нет текста | title="Время просмотра с подпиской / без подписки" |
| [457:5](src/Analytics360Page.tsx#L457) | DemographicsCard (компонент) | динамически / вложено / нет текста | title="Возраст зрителей" |
| [458:5](src/Analytics360Page.tsx#L458) | DemographicsCard (компонент) | динамически / вложено / нет текста | title="Пол зрителей" |
| [459:88](src/Analytics360Page.tsx#L459) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [460:97](src/Analytics360Page.tsx#L460) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [461:5](src/Analytics360Page.tsx#L461) | BreakdownCard (компонент) | динамически / вложено / нет текста | title="Просмотры собственного контента по форматам" |
| [462:67](src/Analytics360Page.tsx#L462) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [463:77](src/Analytics360Page.tsx#L463) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [472:10](src/Analytics360Page.tsx#L472) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [479:6](src/Analytics360Page.tsx#L479) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [485:6](src/Analytics360Page.tsx#L485) | Availability (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |

## src/Analytics360Winners.tsx

Разделы реестра: ANALYTICS / WINNER. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [85:4](src/Analytics360Winners.tsx#L85) | button | динамически / вложено / нет текста | onClick={()=>setRevision(v=>v+1)} |
| [89:11](src/Analytics360Winners.tsx#L89) | div | динамически / вложено / нет текста | role="alert" |
| [97:4](src/Analytics360Winners.tsx#L97) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [97:45](src/Analytics360Winners.tsx#L97) | summary | Как рассчитывается оценка | нет в этом узле; проверить родителя и вложенный компонент |
| [99:4](src/Analytics360Winners.tsx#L99) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [99:61](src/Analytics360Winners.tsx#L99) | summary | Растущие каналы | нет в этом узле; проверить родителя и вложенный компонент |
| [109:18](src/Analytics360Winners.tsx#L109) | select | динамически / вложено / нет текста | onChange={e=>{setChannel(e.target.value);setLimit(20)}} |
| [110:6](src/Analytics360Winners.tsx#L110) | option | Все каналы | нет в этом узле; проверить родителя и вложенный компонент |
| [110:65](src/Analytics360Winners.tsx#L110) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [112:19](src/Analytics360Winners.tsx#L112) | select | динамически / вложено / нет текста | onChange={e=>{setClassification(e.target.value);setLimit(20)}} |
| [113:6](src/Analytics360Winners.tsx#L113) | option | Все статусы | нет в этом узле; проверить родителя и вложенный компонент |
| [113:97](src/Analytics360Winners.tsx#L113) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [115:23](src/Analytics360Winners.tsx#L115) | select | динамически / вложено / нет текста | onChange={e=>{setDateScope(e.target.value);setLimit(20)}} |
| [116:6](src/Analytics360Winners.tsx#L116) | option | Любая дата | нет в этом узле; проверить родителя и вложенный компонент |
| [116:45](src/Analytics360Winners.tsx#L116) | option | Последние 30 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [116:90](src/Analytics360Winners.tsx#L116) | option | Последние 90 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [118:23](src/Analytics360Winners.tsx#L118) | select | динамически / вложено / нет текста | onChange={e=>{setSort(e.target.value as Sort);setLimit(20)}} |
| [119:6](src/Analytics360Winners.tsx#L119) | option | По оценке | нет в этом узле; проверить родителя и вложенный компонент |
| [119:46](src/Analytics360Winners.tsx#L119) | option | Просмотры за 7 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [120:6](src/Analytics360Winners.tsx#L120) | option | Ускорение | нет в этом узле; проверить родителя и вложенный компонент |
| [120:47](src/Analytics360Winners.tsx#L120) | option | Возраст видео | нет в этом узле; проверить родителя и вложенный компонент |
| [127:182](src/Analytics360Winners.tsx#L127) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [127:191](src/Analytics360Winners.tsx#L127) | summary | Подробнее | нет в этом узле; проверить родителя и вложенный компонент |
| [128:5](src/Analytics360Winners.tsx#L128) | button | Открыть | onClick={()=>onOpenVideo(v.channelId,v.videoId)}; aria-label={'Открыть аналитику: '+(v.title\|\|v.videoId)} |
| [130:24](src/Analytics360Winners.tsx#L130) | button | Показать ещё | onClick={()=>setLimit(v=>v+20)} |

## src/AnalyticsPage.tsx

Разделы реестра: ANALYTICS. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [23:471](src/AnalyticsPage.tsx#L23) | svg | динамически / вложено / нет текста | role="img"; aria-label={label+' за выбранный период'} |
| [44:195](src/AnalyticsPage.tsx#L44) | button | динамически / вложено / нет текста | onClick={()=>void refresh()} |
| [45:17](src/AnalyticsPage.tsx#L45) | YouTubeChannelBar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [46:3](src/AnalyticsPage.tsx#L46) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [46:44](src/AnalyticsPage.tsx#L46) | summary | Экспорт аналитики | нет в этом узле; проверить родителя и вложенный компонент |
| [46:80](src/AnalyticsPage.tsx#L46) | AiAnalyticsExport (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [47:154](src/AnalyticsPage.tsx#L47) | button | динамически / вложено / нет текста | onClick={()=>setPeriod(x)} |
| [48:321](src/AnalyticsPage.tsx#L48) | button | Подключить расширенную аналитику | onClick={()=>{setPage('youtube');setTimeout(()=>window.dispatchEvent(new Event('vyron:youtube-accounts')),0)}} |
| [49:424](src/AnalyticsPage.tsx#L49) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [49:433](src/AnalyticsPage.tsx#L49) | summary | Подробнее | нет в этом узле; проверить родителя и вложенный компонент |
| [49:586](src/AnalyticsPage.tsx#L49) | button | Открыть Google Cloud | onClick={()=>void api.openWeb('https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com'+(googleProjectId?'?project='+encodeURIComponent(googleProjectId):''))} |
| [49:804](src/AnalyticsPage.tsx#L49) | button | динамически / вложено / нет текста | onClick={()=>void refresh()} |
| [54:5](src/AnalyticsPage.tsx#L54) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [55:5](src/AnalyticsPage.tsx#L55) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [56:5](src/AnalyticsPage.tsx#L56) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [57:5](src/AnalyticsPage.tsx#L57) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [58:5](src/AnalyticsPage.tsx#L58) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [59:5](src/AnalyticsPage.tsx#L59) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [60:5](src/AnalyticsPage.tsx#L60) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [61:5](src/AnalyticsPage.tsx#L61) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [63:4](src/AnalyticsPage.tsx#L63) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [63:43](src/AnalyticsPage.tsx#L63) | summary | Другие показатели | нет в этом узле; проверить родителя и вложенный компонент |
| [64:42](src/AnalyticsPage.tsx#L64) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [65:44](src/AnalyticsPage.tsx#L65) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [66:5](src/AnalyticsPage.tsx#L66) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [66:86](src/AnalyticsPage.tsx#L66) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [66:163](src/AnalyticsPage.tsx#L66) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [67:5](src/AnalyticsPage.tsx#L67) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [68:5](src/AnalyticsPage.tsx#L68) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [71:37](src/AnalyticsPage.tsx#L71) | LineChart (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [71:98](src/AnalyticsPage.tsx#L71) | LineChart (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [71:181](src/AnalyticsPage.tsx#L71) | LineChart (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [73:44](src/AnalyticsPage.tsx#L73) | Breakdown (компонент) | динамически / вложено / нет текста | title="Источники трафика" |
| [73:118](src/AnalyticsPage.tsx#L73) | Breakdown (компонент) | динамически / вложено / нет текста | title="Страны" |
| [73:203](src/AnalyticsPage.tsx#L73) | Breakdown (компонент) | динамически / вложено / нет текста | title="Устройства" |
| [73:293](src/AnalyticsPage.tsx#L73) | Breakdown (компонент) | динамически / вложено / нет текста | title="Подписаны / не подписаны" |

## src/App.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [275:26](src/App.tsx#L275) | div | динамически / вложено / нет текста | role="alert" |
| [278:5](src/App.tsx#L278) | button | Повторить запуск | onClick={()=>window.location.reload()} |
| [280:31](src/App.tsx#L280) | Boot (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [281:28](src/App.tsx#L281) | Activation (компонент) | динамически / вложено / нет текста | onActivated={setLicense} |
| [282:36](src/App.tsx#L282) | ExistingInventoryMigrationBridge (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:71](src/App.tsx#L282) | LiveInventoryBridge (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:93](src/App.tsx#L282) | ChannelRunwayScheduler (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:118](src/App.tsx#L282) | ProductionStatusBridge (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:143](src/App.tsx#L282) | ChannelStatisticsScheduler (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:172](src/App.tsx#L282) | OwnerInventoryScheduler (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:198](src/App.tsx#L282) | UploadProcessingMonitor (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:224](src/App.tsx#L282) | RecoveryGate (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:239](src/App.tsx#L282) | Sidebar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:272](src/App.tsx#L282) | Topbar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:281](src/App.tsx#L282) | PageRouter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:319](src/App.tsx#L282) | GlobalTaskIndicator (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:341](src/App.tsx#L282) | GlobalUploadIndicator (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:365](src/App.tsx#L282) | UploadCenterGlobal (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:386](src/App.tsx#L282) | GlobalTaskCenter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:405](src/App.tsx#L282) | CommandPalette (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:422](src/App.tsx#L282) | MetadataQueueAssignmentBridge (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:454](src/App.tsx#L282) | PublishLedgerHydrator (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:478](src/App.tsx#L282) | M1PerformanceProbe (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:512](src/App.tsx#L282) | FpsMonitor (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:526](src/App.tsx#L282) | UpdateExperience (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:545](src/App.tsx#L282) | MajorUpdateCelebration (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [282:570](src/App.tsx#L282) | NotificationCenter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [284:82](src/App.tsx#L284) | DashboardUploadSummary (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [284:107](src/App.tsx#L284) | DashboardOS (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [287:117](src/App.tsx#L287) | YouTubeCenter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [294:45](src/App.tsx#L294) | DashboardUploadSummary (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [294:70](src/App.tsx#L294) | DashboardOS (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [295:29](src/App.tsx#L295) | ChannelsOS (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [296:54](src/App.tsx#L296) | ProductionOS (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [297:28](src/App.tsx#L297) | HistoryPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [298:30](src/App.tsx#L298) | LiveContentInventory (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [299:32](src/App.tsx#L299) | CompetitorsPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [300:118](src/App.tsx#L300) | React.Suspense (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [300:194](src/App.tsx#L300) | Analytics360Page (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [300:231](src/App.tsx#L300) | AnalyticsPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [301:53](src/App.tsx#L301) | SettingsOS (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [305:22](src/App.tsx#L305) | UiErrorBoundary (компонент) | динамически / вложено / нет текста | onHome={()=>setPage('dashboard')} |
| [305:89](src/App.tsx#L305) | CachedYouTubeRoute (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [305:163](src/App.tsx#L305) | UiErrorBoundary (компонент) | динамически / вложено / нет текста | onHome={()=>setPage('dashboard')} |
| [305:235](src/App.tsx#L305) | React.Suspense (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [305:261](src/App.tsx#L305) | div | Открываем раздел… | role="status" |
| [311:493](src/App.tsx#L311) | input | динамически / вложено / нет текста | onChange={e=>setKey(e.target.value)}; onKeyDown={e=>e.key==='Enter'&&document.getElementById('activate')?.click()} |
| [311:730](src/App.tsx#L311) | button | динамически / вложено / нет текста | onClick={async()=>{setBusy(true);setError('');try{onActivated(await api.activate(key))}catch(e){setError(String(e))}finally{setBusy(false)}}} |
| [312:555](src/App.tsx#L312) | SafeArtwork (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [312:1067](src/App.tsx#L312) | button | динамически / вложено / нет текста | onClick={open} |
| [312:1225](src/App.tsx#L312) | SidebarIcon (компонент) | динамически / вложено / нет текста | name={n.icon} |
| [312:1434](src/App.tsx#L312) | OwnerProfile (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [321:1054](src/App.tsx#L321) | button | динамически / вложено / нет текста | onClick={()=>setErrorsOpen(true)} |
| [321:1238](src/App.tsx#L321) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setErrorsOpen(false)} |
| [321:1310](src/App.tsx#L321) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [321:1564](src/App.tsx#L321) | button | × | onClick={()=>setErrorsOpen(false)} |
| [321:1791](src/App.tsx#L321) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [321:1800](src/App.tsx#L321) | summary | Технические детали | нет в этом узле; проверить родителя и вложенный компонент |
| [321:1867](src/App.tsx#L321) | button | Убрать ошибку | onClick={()=>patchJob(j.id,clearActiveJobErrorPatch(j))} |
| [321:1985](src/App.tsx#L321) | details | динамически / вложено / нет текста | onToggle={e=>setHistoryExpanded(e.currentTarget.open)} |
| [321:2049](src/App.tsx#L321) | summary | История ошибок ( ) | нет в этом узле; проверить родителя и вложенный компонент |
| [321:2510](src/App.tsx#L321) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [321:2519](src/App.tsx#L321) | summary | Технические детали | нет в этом узле; проверить родителя и вложенный компонент |
| [321:2597](src/App.tsx#L321) | button | Убрать из истории | onClick={()=>{removeErrorHistory(x.id);setHistory(readErrorHistory())}} |
| [321:2809](src/App.tsx#L321) | button | Очистить активные | onClick={()=>{jobErrors.forEach(j=>patchJob(j.id,clearActiveJobErrorPatch(j)))}} |
| [321:2947](src/App.tsx#L321) | button | Очистить историю | onClick={()=>{clearErrorHistory();setHistory([])}} |
| [321:3058](src/App.tsx#L321) | button | Закрыть | onClick={()=>setErrorsOpen(false)} |
| [327:1](src/App.tsx#L327) | PageHeader (компонент) | динамически / вложено / нет текста | title="Что происходит сейчас" |
| [327:281](src/App.tsx#L327) | button | динамически / вложено / нет текста | onClick={()=>setPage('autopilot')} |
| [328:30](src/App.tsx#L328) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [328:96](src/App.tsx#L328) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [328:169](src/App.tsx#L328) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [328:290](src/App.tsx#L328) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [328:413](src/App.tsx#L328) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [328:532](src/App.tsx#L328) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [329:22](src/App.tsx#L329) | Empty (компонент) | динамически / вложено / нет текста | onClick={()=>setPage('channels')}; title="Добавь первый канал" |
| [329:601](src/App.tsx#L329) | button | динамически / вложено / нет текста | onClick={()=>setPage('production')} |
| [330:457](src/App.tsx#L330) | SystemCard (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [334:1](src/App.tsx#L334) | PageHeader (компонент) | динамически / вложено / нет текста | title="Автопилот" |
| [334:199](src/App.tsx#L334) | button | ↻ INBOX | onClick={()=>void loadInboxes()} |
| [334:274](src/App.tsx#L334) | button | динамически / вложено / нет текста | onClick={run} |
| [335:338](src/App.tsx#L335) | button | динамически / вложено / нет текста | onClick={()=>patch({autopilotEnabled:!settings.autopilotEnabled})} |
| [336:30](src/App.tsx#L336) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [336:137](src/App.tsx#L336) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [336:281](src/App.tsx#L336) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [336:395](src/App.tsx#L336) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [336:500](src/App.tsx#L336) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [336:607](src/App.tsx#L336) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [337:511](src/App.tsx#L337) | button | динамически / вложено / нет текста | onClick={()=>patch({[key]:!val} as any)} |
| [339:421](src/App.tsx#L339) | button | ОТКРЫТЬ INBOX | onClick={async()=>{try{const v=await api.ensureChannelInbox(settings.workspace,c.name);await api.openLocal(v.root)}catch(e){toast(String(e))}}} |
| [340:412](src/App.tsx#L340) | button | ОТКРЫТЬ НАСТРОЙКИ | onClick={()=>setPage('settings')} |
| [344:1](src/App.tsx#L344) | PageHeader (компонент) | динамически / вложено / нет текста | title="Мои каналы" |
| [344:165](src/App.tsx#L344) | button | + ДОБАВИТЬ КАНАЛ | onClick={()=>{const c=addChannel({name:'Канал ${channels.length+1}'});setEditing(c.id);toast('Канал добавлен')}} |
| [345:22](src/App.tsx#L345) | Empty (компонент) | динамически / вложено / нет текста | onClick={()=>{const c=addChannel({name:'Новый канал'});setEditing(c.id)}}; title="Каналов пока нет" |
| [345:576](src/App.tsx#L345) | button | ✎ | onClick={()=>setEditing(editing===c.id?null:c.id)} |
| [345:1026](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{name:e.target.value})} |
| [345:1124](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{genre:e.target.value})} |
| [345:1224](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{language:e.target.value})} |
| [345:1332](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{country:e.target.value})} |
| [345:1444](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{cadenceDays:+e.target.value\|\|1})}; type="number" |
| [345:1598](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{targetBufferDays:+e.target.value\|\|60})}; type="number" |
| [345:1768](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{minTracks:+e.target.value\|\|10})}; type="number" |
| [345:1926](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{targetDurationMin:+e.target.value\|\|120})}; type="number" |
| [345:2101](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>{const [h,m]=e.target.value.split(':').map(Number);updateChannel(c.id,{publishHour:h,publishMinute:m})}}; type="time" |
| [345:2361](src/App.tsx#L345) | select | динамически / вложено / нет текста | onChange={e=>{const p=profiles.find(x=>x.id===e.target.value);updateChannel(c.id,{youtubeProfileId:e.target.value\|\|undefined,youtubeChannelId:p?.channelId})}} |
| [345:2559](src/App.tsx#L345) | option | — не привязан — | нет в этом узле; проверить родителя и вложенный компонент |
| [345:2617](src/App.tsx#L345) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [345:2752](src/App.tsx#L345) | textarea | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{seo:{...c.seo,titlePatterns:e.target.value.split('\n').filter(Boolean)}})} |
| [345:2957](src/App.tsx#L345) | textarea | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{seo:{...c.seo,descriptionTemplate:e.target.value}})} |
| [345:3124](src/App.tsx#L345) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{seo:{...c.seo,tags:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)}})} |
| [345:3322](src/App.tsx#L345) | textarea | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{seo:{...c.seo,aiPrompt:e.target.value}})} |
| [345:3556](src/App.tsx#L345) | button | УДАЛИТЬ ИЗ VYRON YT PEISOV | onClick={()=>{if(confirm('Удалить ${c.name}? Файлы на диске останутся.')){removeChannel(c.id);setEditing(null)}}} |
| [345:3732](src/App.tsx#L345) | button | ГОТОВО | onClick={()=>setEditing(null)} |
| [348:1](src/App.tsx#L348) | PageHeader (компонент) | динамически / вложено / нет текста | title="Производственная очередь" |
| [348:173](src/App.tsx#L348) | button | динамически / вложено / нет текста | onClick={refreshAll} |
| [348:275](src/App.tsx#L348) | button | ЗАПОЛНИТЬ ДО 60 ДНЕЙ | onClick={createPlan} |
| [349:28](src/App.tsx#L349) | select | динамически / вложено / нет текста | onChange={e=>setFilter(e.target.value)} |
| [349:91](src/App.tsx#L349) | option | Все каналы | нет в этом узле; проверить родителя и вложенный компонент |
| [349:175](src/App.tsx#L349) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [350:22](src/App.tsx#L350) | Empty (компонент) | динамически / вложено / нет текста | onClick={createPlan}; title="Очередь пустая" |
| [350:883](src/App.tsx#L350) | button | ПАПКА | onClick={()=>api.reveal(j.folder)} |
| [350:970](src/App.tsx#L350) | button | + МУЗЫКА | onClick={async()=>{const files=await api.chooseTracks();if(!files.length\|\|!j.folder)return;try{const r=await api.addTracks(j.folder,files,c?.minTracks\|\|j.minTracks);patchJob(j.id,{tracksCount:r.tracksCount,status:r.s |
| [350:1347](src/App.tsx#L350) | button | В ENDLUME | onClick={async()=>{try{await api.enqueueRender(settings.workspace,j.folder);patchJob(j.id,{renderQueuedAt:new Date().toISOString()});if(settings.endlumePath)await api.openEndlume(settings.endlumePath);toast('Проект отпра |
| [350:1698](src/App.tsx#L350) | button | YOUTUBE | onClick={()=>setPage('publisher')} |
| [350:1805](src/App.tsx#L350) | button | ПОВТОРИТЬ | onClick={async()=>{if(!j.folder)return;try{patchJob(j.id,{...(await api.refreshJob(j.folder,c?.minTracks\|\|j.minTracks)),error:undefined})}catch(e){patchJob(j.id,{error:String(e)})}}} |
| [353:1](src/App.tsx#L353) | PageHeader (компонент) | динамически / вложено / нет текста | title="Входящие файлы" |
| [353:205](src/App.tsx#L353) | button | + ИМПОРТИРОВАТЬ ИЗОБРАЖЕНИЯ | onClick={importImages} |
| [354:32](src/App.tsx#L354) | select | динамически / вложено / нет текста | onChange={e=>{setChannelId(e.target.value);setInbox(undefined)}} |
| [354:123](src/App.tsx#L354) | option | — канал — | нет в этом узле; проверить родителя и вложенный компонент |
| [354:203](src/App.tsx#L354) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [354:263](src/App.tsx#L354) | button | ОТКРЫТЬ MUSIC INBOX | onClick={async()=>{const r=await ensure();if(r)await api.openLocal(r.music)}} |
| [354:377](src/App.tsx#L354) | button | ОТКРЫТЬ IMAGE INBOX | onClick={async()=>{const r=await ensure();if(r)await api.openLocal(r.images)}} |
| [355:910](src/App.tsx#L355) | button | ОТКРЫТЬ CHATGPT | onClick={()=>api.openWeb('https://chatgpt.com')} |
| [358:807](src/App.tsx#L358) | PageHeader (компонент) | динамически / вложено / нет текста | title="Конкуренты" |
| [358:984](src/App.tsx#L358) | select | динамически / вложено / нет текста | onChange={e=>setChannelId(e.target.value)} |
| [358:1053](src/App.tsx#L358) | option | К какому каналу | нет в этом узле; проверить родителя и вложенный компонент |
| [358:1139](src/App.tsx#L358) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [358:1199](src/App.tsx#L358) | input | динамически / вложено / нет текста | onChange={e=>setName(e.target.value)} |
| [358:1281](src/App.tsx#L358) | input | динамически / вложено / нет текста | onChange={e=>setUrl(e.target.value)} |
| [358:1384](src/App.tsx#L358) | button | ДОБАВИТЬ | onClick={()=>{add({id:crypto.randomUUID(),channelId,name,url});setName('');setUrl('')}} |
| [358:1575](src/App.tsx#L358) | Empty (компонент) | динамически / вложено / нет текста | title="Конкурентов нет" |
| [358:2093](src/App.tsx#L358) | button | ОТКРЫТЬ | onClick={()=>api.openWeb(c.url)} |
| [358:2150](src/App.tsx#L358) | button | ↻ ОБНОВИТЬ | onClick={()=>refresh(c)} |
| [358:2228](src/App.tsx#L358) | button | × | onClick={()=>remove(c.id)} |
| [360:526](src/App.tsx#L360) | PageHeader (компонент) | динамически / вложено / нет текста | title="Состояние сети" |
| [360:1026](src/App.tsx#L360) | button | ↻ | onClick={()=>refresh(c)} |
| [363:1](src/App.tsx#L363) | input | динамически / вложено / нет текста | onChange={e=>{void read(e.target.files);e.currentTarget.value=''}}; type="file" |
| [364:1](src/App.tsx#L364) | PageHeader (компонент) | динамически / вложено / нет текста | title="Публикации" |
| [364:193](src/App.tsx#L364) | button | + МЕТАДАННЫЕ | onClick={()=>input.current?.click()} |
| [364:277](src/App.tsx#L364) | button | динамически / вложено / нет текста | onClick={uploadAll} |
| [365:309](src/App.tsx#L365) | select | динамически / вложено / нет текста | onChange={e=>setMetaChannel(e.target.value)} |
| [365:382](src/App.tsx#L365) | option | Все каналы | нет в этом узле; проверить родителя и вложенный компонент |
| [365:463](src/App.tsx#L365) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [365:523](src/App.tsx#L365) | button | ВЫБРАТЬ | onClick={()=>input.current?.click()} |
| [365:584](src/App.tsx#L365) | button | ПРИМЕНИТЬ | onClick={apply} |
| [365:877](src/App.tsx#L365) | button | ОЧИСТИТЬ | onClick={()=>{setRows([]);setFiles([])}} |
| [367:19](src/App.tsx#L367) | Empty (компонент) | динамически / вложено / нет текста | title="Нет готовых MP4" |
| [367:439](src/App.tsx#L367) | input | динамически / вложено / нет текста | onChange={e=>patchJob(j.id,{title:e.target.value,metadataLocked:true})} |
| [367:551](src/App.tsx#L367) | textarea | динамически / вложено / нет текста | onChange={e=>patchJob(j.id,{description:e.target.value,metadataLocked:true})} |
| [367:662](src/App.tsx#L367) | input | динамически / вложено / нет текста | onChange={e=>patchJob(j.id,{tags:e.target.value.split(',').map(x=>x.trim()).filter(Boolean),metadataLocked:true})} |
| [367:1008](src/App.tsx#L367) | input | динамически / вложено / нет текста | onChange={e=>patchJob(j.id,{publishAt:new Date(e.target.value).toISOString(),metadataLocked:true})}; type="datetime-local" |
| [367:1391](src/App.tsx#L367) | button | ЗАГРУЗИТЬ | onClick={()=>upload(j)} |
| [370:1](src/App.tsx#L370) | PageHeader (компонент) | динамически / вложено / нет текста | title="Настройки" |
| [371:136](src/App.tsx#L371) | button | динамически / вложено / нет текста | onClick={()=>setTab(t)} |
| [372:193](src/App.tsx#L372) | input | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [372:268](src/App.tsx#L372) | button | ВЫБРАТЬ | onClick={async()=>{const p=await api.chooseWorkspace();if(p)patch({workspace:p})}} |
| [372:375](src/App.tsx#L372) | button | ОТКРЫТЬ | onClick={()=>s.workspace&&api.openLocal(s.workspace)} |
| [372:668](src/App.tsx#L372) | input | динамически / вложено / нет текста | onChange={e=>{const n=Number(e.target.value);patch({estimatedRpmUsd:Number.isFinite(n)&&n>0?n:undefined})}}; type="number" |
| [372:1066](src/App.tsx#L372) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({fpsMonitor:v})} |
| [372:1190](src/App.tsx#L372) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({reduceMotion:v})} |
| [373:138](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autopilotEnabled:v})} |
| [373:271](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoCreatePlan:v})} |
| [373:433](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoAssignMusic:v})} |
| [373:572](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoAssignImages:v})} |
| [373:719](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoGenerateMetadata:v})} |
| [373:957](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoQueueRender:v})} |
| [373:1115](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoOpenEndlume:v})} |
| [373:1279](src/App.tsx#L373) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoUploadYoutube:v})} |
| [373:1562](src/App.tsx#L373) | input | динамически / вложено / нет текста | onChange={e=>patch({autopilotIntervalSec:Math.max(10,+e.target.value\|\|30)})}; type="number" |
| [373:1746](src/App.tsx#L373) | input | динамически / вложено / нет текста | onChange={e=>patch({tracksPerVideo:+e.target.value\|\|10})}; type="number" |
| [374:198](src/App.tsx#L374) | input | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [374:270](src/App.tsx#L374) | button | ВЫБРАТЬ | onClick={async()=>{const p=await api.chooseEndlume();if(p)patch({endlumePath:p})}} |
| [374:393](src/App.tsx#L374) | button | ОТКРЫТЬ | onClick={()=>api.openEndlume(s.endlumePath)} |
| [374:856](src/App.tsx#L374) | input | динамически / вложено / нет текста | onChange={e=>patch({openaiApiKey:e.target.value.trim()})}; type="password" |
| [374:1028](src/App.tsx#L374) | input | динамически / вложено / нет текста | onChange={e=>patch({openaiModel:e.target.value.trim()})} |
| [374:1115](src/App.tsx#L374) | button | ОЧИСТИТЬ | onClick={()=>patch({openaiModel:''})} |
| [374:1354](src/App.tsx#L374) | input | динамически / вложено / нет текста | onChange={e=>patch({youtubeOAuthClientId:e.target.value.trim()})} |
| [374:1546](src/App.tsx#L374) | input | динамически / вложено / нет текста | onChange={e=>setOauthSecret(e.target.value.trim())}; type="password" |
| [374:1950](src/App.tsx#L374) | button | динамически / вложено / нет текста | onClick={async()=>{setConnecting(true);setOauthError(false);setOauthMessage('OAuth: ожидаю подтверждение Google…');try{const p=await api.youtubeConnect(s.youtubeOAuthClientId,oauthSecret);setOauthSecret('');if(p.status== |
| [374:2839](src/App.tsx#L374) | button | ↻ ОБНОВИТЬ | onClick={async()=>{try{const p=await refreshProfiles();toast(p.length?'OAuth профилей: ${p.length}':'OAuth профили не найдены')}catch(e){toast(String(e))}}} |
| [374:3308](src/App.tsx#L374) | button | ОТКЛЮЧИТЬ | onClick={async()=>{await api.youtubeDisconnect(p.id);await refreshProfiles()}} |
| [374:3496](src/App.tsx#L374) | input | динамически / вложено / нет текста | onChange={e=>patch({youtubeCategoryId:e.target.value.trim()\|\|'10'})} |
| [374:3804](src/App.tsx#L374) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({youtubeIntelligenceAutoRefresh:v})} |
| [374:4067](src/App.tsx#L374) | input | динамически / вложено / нет текста | onChange={e=>patch({youtubeIntelligenceRefreshMin:Math.max(15,+e.target.value\|\|30)})}; type="number" |
| [374:4570](src/App.tsx#L374) | input | динамически / вложено / нет текста | onChange={e=>patch({youtubeApiKey:e.target.value.trim()})}; type="password" |
| [375:453](src/App.tsx#L375) | input | динамически / вложено / нет текста | onChange={e=>setKey(e.target.value)} |
| [375:510](src/App.tsx#L375) | button | АКТИВИРОВАТЬ | onClick={async()=>{try{setLicense(await api.activate(key))}catch(e){toast(String(e))}}} |
| [376:206](src/App.tsx#L376) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoCheckUpdates:v})} |
| [376:360](src/App.tsx#L376) | button | ПРОВЕРИТЬ ОБНОВЛЕНИЯ | onClick={async()=>{try{setUpdate(await api.checkUpdate())}catch(e){setUpdate({error:String(e)})}}} |
| [376:850](src/App.tsx#L376) | button | ОБНОВИТЬ И ПЕРЕЗАПУСТИТЬ | onClick={async()=>{setProgress(0);try{await update.install((p:number)=>setProgress(p))}catch(e){setProgress(null);toast(String(e))}}} |
| [377:104](src/App.tsx#L377) | button | ЗАПУСТИТЬ ПРОВЕРКУ | onClick={async()=>{try{let ws=s.workspace;if(!ws){ws=await api.defaultWorkspace();patch({workspace:ws})}setDiag(await api.diagnostics(ws))}catch(e){setDiag({ok:false,notes:[String(e)]})}}} |
| [380:121](src/App.tsx#L380) | button | динамически / вложено / нет текста | onClick={()=>onChange(!value)} |
| [381:181](src/App.tsx#L381) | button | динамически / вложено / нет текста | onClick={onClick} |
| [427:420](src/App.tsx#L427) | button | ОБНОВИТЬ | onClick={()=>void download()} |
| [427:1058](src/App.tsx#L427) | button | УСТАНОВИТЬ И ПЕРЕЗАПУСТИТЬ | onClick={()=>void installNow()} |
| [427:1455](src/App.tsx#L427) | button | ПОВТОРИТЬ | onClick={()=>void check({force:true})} |

## src/AuthRecoveryCenter.tsx

Разделы реестра: AUTH. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [172:3](src/AuthRecoveryCenter.tsx#L172) | input | динамически / вложено / нет текста | onChange={e=>{void importGlobalCredentials(e.target.files);e.currentTarget.value=''}}; type="file" |
| [173:308](src/AuthRecoveryCenter.tsx#L173) | button | Обновить статусы | onClick={()=>void load()} |
| [175:529](src/AuthRecoveryCenter.tsx#L175) | button | Восстановить сохранённый доступ | onClick={()=>void recoverSavedGlobal()} |
| [175:710](src/AuthRecoveryCenter.tsx#L175) | button | Повторить безопасную проверку | onClick={()=>void retryGlobal()} |
| [175:808](src/AuthRecoveryCenter.tsx#L175) | button | динамически / вложено / нет текста | onClick={()=>credentialsFile.current?.click()} |
| [177:307](src/AuthRecoveryCenter.tsx#L177) | button | динамически / вложено / нет текста | onClick={()=>void runAutomaticRecovery(false)} |
| [179:434](src/AuthRecoveryCenter.tsx#L179) | button | Восстановить доступ OAuth Vault | onClick={async()=>{try{setBusy('interactive');await api.youtubeOauthVaultRecover();await load();notifyYoutubeOauthStateChanged();}finally{setBusy('')}}} |
| [179:653](src/AuthRecoveryCenter.tsx#L179) | button | динамически / вложено / нет текста | onClick={()=>void runInteractiveRecovery()} |
| [185:364](src/AuthRecoveryCenter.tsx#L185) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [185:373](src/AuthRecoveryCenter.tsx#L185) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [185:610](src/AuthRecoveryCenter.tsx#L185) | button | Восстановить GLOBAL OAuth Client | onClick={()=>credentialsFile.current?.click()} |
| [185:759](src/AuthRecoveryCenter.tsx#L185) | button | Повторить безопасную проверку | onClick={()=>void retryProfile(r.profileId)} |
| [185:868](src/AuthRecoveryCenter.tsx#L185) | button | Восстановить доступ Keychain | onClick={()=>void runInteractiveRecovery()} |
| [185:1191](src/AuthRecoveryCenter.tsx#L185) | button | Переподключить через браузер | onClick={()=>prepareReconnect(r.profileId)} |
| [188:98](src/AuthRecoveryCenter.tsx#L188) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setPreReconnectProfileId('')} |
| [189:4](src/AuthRecoveryCenter.tsx#L189) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [193:13](src/AuthRecoveryCenter.tsx#L193) | button | Отмена | onClick={()=>setPreReconnectProfileId('')} |
| [193:79](src/AuthRecoveryCenter.tsx#L193) | button | Открыть YouTube | onClick={()=>void openYoutubeForProfile(preReconnectProfileId)} |
| [193:175](src/AuthRecoveryCenter.tsx#L193) | button | Выбрать браузер и продолжить | onClick={()=>{const id=preReconnectProfileId;setPreReconnectProfileId('');void chooseBrowser(id)}} |
| [196:18](src/AuthRecoveryCenter.tsx#L196) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setWrongChannel(null)} |
| [196:67](src/AuthRecoveryCenter.tsx#L196) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [200:4](src/AuthRecoveryCenter.tsx#L200) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [200:13](src/AuthRecoveryCenter.tsx#L200) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [201:12](src/AuthRecoveryCenter.tsx#L201) | button | Отмена | onClick={()=>setWrongChannel(null)} |
| [201:71](src/AuthRecoveryCenter.tsx#L201) | button | Открыть YouTube | onClick={()=>void api.youtubeOpenYoutube(wrongChannel.browser)} |
| [201:167](src/AuthRecoveryCenter.tsx#L201) | button | Выбрать другой браузер | onClick={()=>{const w=wrongChannel;setWrongChannel(null);void chooseBrowser(w.profileId)}} |
| [201:297](src/AuthRecoveryCenter.tsx#L201) | button | Попробовать ещё раз | onClick={()=>{const w=wrongChannel;setWrongChannel(null);void reconnect(w.profileId,w.browser)}} |
| [203:17](src/AuthRecoveryCenter.tsx#L203) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>{setBrowserOpen(false);setPendingProfileId('')}} |
| [203:92](src/AuthRecoveryCenter.tsx#L203) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [203:465](src/AuthRecoveryCenter.tsx#L203) | button | динамически / вложено / нет текста | onClick={()=>setSelectedBrowser(x.id)} |
| [203:706](src/AuthRecoveryCenter.tsx#L203) | button | Отмена | onClick={()=>{setBrowserOpen(false);setPendingProfileId('')}} |
| [203:791](src/AuthRecoveryCenter.tsx#L203) | button | Продолжить через | onClick={()=>void confirmBrowserReconnect()} |

## src/BatchControl.tsx

Разделы реестра: BATCH. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [125:126](src/BatchControl.tsx#L125) | button | динамически / вложено / нет текста | onClick={()=>setExpanded(x=>!x)} |
| [135:40](src/BatchControl.tsx#L135) | button | динамически / вложено / нет текста | onClick={selectAll} |
| [135:244](src/BatchControl.tsx#L135) | input | динамически / вложено / нет текста | onChange={()=>toggle(c.id)}; type="checkbox" |
| [137:5](src/BatchControl.tsx#L137) | button | динамически / вложено / нет текста | onClick={()=>request('scan')} |
| [138:5](src/BatchControl.tsx#L138) | button | динамически / вложено / нет текста | onClick={()=>request('oauth')} |
| [139:5](src/BatchControl.tsx#L139) | button | динамически / вложено / нет текста | onClick={()=>request('youtube')} |
| [140:5](src/BatchControl.tsx#L140) | button | динамически / вложено / нет текста | onClick={()=>request('stats')} |
| [141:5](src/BatchControl.tsx#L141) | button | динамически / вложено / нет текста | onClick={()=>request('metadata')} |
| [142:5](src/BatchControl.tsx#L142) | button | динамически / вложено / нет текста | onClick={()=>request('queue')} |
| [145:13](src/BatchControl.tsx#L145) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setPending(null)} |
| [145:57](src/BatchControl.tsx#L145) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [154:5](src/BatchControl.tsx#L154) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [154:14](src/BatchControl.tsx#L154) | summary | Каналы ( ) | нет в этом узле; проверить родителя и вложенный компонент |
| [155:39](src/BatchControl.tsx#L155) | input | динамически / вложено / нет текста | onChange={e=>setQueueConfirmed(e.target.checked)}; type="checkbox" |
| [156:13](src/BatchControl.tsx#L156) | button | Отмена | onClick={()=>setPending(null)} |
| [156:67](src/BatchControl.tsx#L156) | button | динамически / вложено / нет текста | onClick={()=>{const x=pending;if(x.action==='queue'&&!queueConfirmed)return;const confirmed=x.action==='queue'&&queueConfirmed;setPending(null);setQueueConfirmed(false);void run(x.action,x.channelIds,x.jobs\|\|[],confirm |

## src/ChannelAvatar.tsx

Разделы реестра: CHANNEL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [38:10](src/ChannelAvatar.tsx#L38) | img | динамически / вложено / нет текста | onLoad={()=>{ try{if(localStorage.getItem(key)!==src)localStorage.setItem(key,src)}catch{} }}; onError={()=>{ const fallback=cachedAvatar(key); if(fallback&&fallback!==src){recordYoutubeRouteEvent('ChannelAvatar','state- |

## src/ChannelPassport.tsx

Разделы реестра: CHANNEL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [25:9](src/ChannelPassport.tsx#L25) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={onClose} |
| [25:40](src/ChannelPassport.tsx#L25) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [26:151](src/ChannelPassport.tsx#L26) | button | × | onClick={onClose} |
| [69:4](src/ChannelPassport.tsx#L69) | button | Загрузить | onClick={()=>open('publisher')} |
| [70:31](src/ChannelPassport.tsx#L70) | button | Открыть YouTube | onClick={()=>void api.openWeb('https://www.youtube.com/channel/'+channel.youtubeChannelId)} |
| [71:4](src/ChannelPassport.tsx#L71) | button | Открыть Render | onClick={()=>channel.renderFolderPath?void api.reveal(channel.renderFolderPath):open('inventory')} |
| [72:4](src/ChannelPassport.tsx#L72) | button | Analytics | onClick={()=>open('analytics')} |
| [73:4](src/ChannelPassport.tsx#L73) | button | Metadata | onClick={()=>open('metadata')} |
| [74:4](src/ChannelPassport.tsx#L74) | button | Schedule / История | onClick={()=>open('youtube')} |
| [75:4](src/ChannelPassport.tsx#L75) | button | Проверить OAuth | onClick={()=>open('youtube')} |

## src/ChannelRunway.tsx

Разделы реестра: PLAN. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [204:100](src/ChannelRunway.tsx#L204) | button | динамически / вложено / нет текста | onClick={()=>void refreshAllStats()} |
| [233:67](src/ChannelRunway.tsx#L233) | ChannelAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [242:52](src/ChannelRunway.tsx#L242) | button | динамически / вложено / нет текста | onClick={()=>void syncChannel(channel)} |
| [242:196](src/ChannelRunway.tsx#L242) | button | динамически / вложено / нет текста | onClick={()=>void refreshRowStats(channel)} |
| [242:350](src/ChannelRunway.tsx#L242) | button | Статистика | onClick={()=>openStatistics(channel)} |
| [242:419](src/ChannelRunway.tsx#L242) | button | Подключить | onClick={()=>openAccounts(channel)} |

## src/ChannelsOS.tsx

Разделы реестра: CHANNEL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [35:129](src/ChannelsOS.tsx#L35) | button | + Будущий канал | onClick={()=>setCreating(true)} |
| [36:33](src/ChannelsOS.tsx#L36) | input | динамически / вложено / нет текста | onChange={e=>setQuery(e.target.value)}; aria-label="Поиск каналов" |
| [36:410](src/ChannelsOS.tsx#L36) | button | динамически / вложено / нет текста | onClick={()=>setFilter(id)} |
| [37:3](src/ChannelsOS.tsx#L37) | BatchControl (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [38:1017](src/ChannelsOS.tsx#L38) | ChannelAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [45:5](src/ChannelsOS.tsx#L45) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [46:7](src/ChannelsOS.tsx#L46) | summary | Все показатели | нет в этом узле; проверить родителя и вложенный компонент |
| [58:7](src/ChannelsOS.tsx#L58) | button | Паспорт | onClick={()=>setPassportId(c.id)}; aria-label={'Паспорт: ${c.name}'} |
| [59:7](src/ChannelsOS.tsx#L59) | button | Публикация | onClick={()=>openYoutube(c,'publish')}; aria-label={'Публикация: ${c.name}'} |
| [60:7](src/ChannelsOS.tsx#L60) | button | Настроить | onClick={()=>setEditing(editing===c.id?null:c.id)}; aria-label={'Настроить: ${c.name}'} |
| [61:7](src/ChannelsOS.tsx#L61) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [61:38](src/ChannelsOS.tsx#L61) | summary | Ещё | aria-label={'Другие действия: ${c.name}'} |
| [62:30](src/ChannelsOS.tsx#L62) | button | YouTube | onClick={()=>void api.openWeb('https://www.youtube.com/channel/'+c.youtubeChannelId)} |
| [63:9](src/ChannelsOS.tsx#L63) | button | Аналитика | onClick={()=>{saveActivePublishChannel(c.id);setPage('analytics')}} |
| [64:9](src/ChannelsOS.tsx#L64) | button | Расписание | onClick={()=>openYoutube(c,'schedule')} |
| [65:9](src/ChannelsOS.tsx#L65) | button | Папки | onClick={()=>{if(c.projectsFolderPath)void api.reveal(c.projectsFolderPath);else if(c.renderFolderPath)void api.reveal(c.renderFolderPath);else setEditing(c.id)}} |
| [68:107](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{name:e.target.value})} |
| [68:205](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{genre:e.target.value})} |
| [68:305](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{language:e.target.value})} |
| [68:413](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{country:e.target.value})} |
| [68:525](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{cadenceDays:+e.target.value\|\|1})}; type="number" |
| [68:681](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{targetBufferDays:+e.target.value\|\|60})}; type="number" |
| [68:864](src/ChannelsOS.tsx#L68) | select | динамически / вложено / нет текста | onChange={e=>{const n=+e.target.value;updateChannel(c.id,{safeDailyUploadLimit:n<0?undefined:n})}} |
| [68:1034](src/ChannelsOS.tsx#L68) | option | не настроен | нет в этом узле; проверить родителя и вложенный компонент |
| [68:1073](src/ChannelsOS.tsx#L68) | option | без ограничения VYRON | нет в этом узле; проверить родителя и вложенный компонент |
| [68:1121](src/ChannelsOS.tsx#L68) | option | 10 | нет в этом узле; проверить родителя и вложенный компонент |
| [68:1151](src/ChannelsOS.tsx#L68) | option | 20 | нет в этом узле; проверить родителя и вложенный компонент |
| [68:1181](src/ChannelsOS.tsx#L68) | option | 30 | нет в этом узле; проверить родителя и вложенный компонент |
| [68:1266](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{renderFolderPath:e.target.value\|\|undefined})} |
| [68:1430](src/ChannelsOS.tsx#L68) | input | динамически / вложено / нет текста | onChange={e=>updateChannel(c.id,{projectsFolderPath:e.target.value\|\|undefined})} |
| [68:1589](src/ChannelsOS.tsx#L68) | button | Управление Google в Аккаунтах | onClick={()=>openYoutube(c,'accounts')} |
| [68:1675](src/ChannelsOS.tsx#L68) | button | Удалить | onClick={()=>{if(window.confirm('Удалить '+c.name+' из VYRON? Файлы на диске останутся.')){removeChannel(c.id);setEditing(null)}}} |
| [68:1849](src/ChannelsOS.tsx#L68) | button | Готово | onClick={()=>setEditing(null)} |
| [70:227](src/ChannelsOS.tsx#L70) | ChannelPassport (компонент) | динамически / вложено / нет текста | onClose={()=>setPassportId(null)} |
| [71:14](src/ChannelsOS.tsx#L71) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setCreating(false)} |
| [71:60](src/ChannelsOS.tsx#L71) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [71:264](src/ChannelsOS.tsx#L71) | input | динамически / вложено / нет текста | onChange={e=>setFutureName(e.target.value)}; onKeyDown={e=>{if(e.key==='Enter')createFuture()}} |
| [71:412](src/ChannelsOS.tsx#L71) | button | Отмена | onClick={()=>setCreating(false)} |
| [71:468](src/ChannelsOS.tsx#L71) | button | Создать | onClick={createFuture} |

## src/CommandCenter.tsx

Разделы реестра: COMMAND. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [30:664](src/CommandCenter.tsx#L30) | button | Открыть производство | onClick={()=>openProduction(next.channel.id)} |
| [32:551](src/CommandCenter.tsx#L32) | button | динамически / вложено / нет текста | onClick={()=>openProduction(channel.id)} |

## src/CommandPalette.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [50:9](src/CommandPalette.tsx#L50) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setOpen(false)} |
| [50:100](src/CommandPalette.tsx#L50) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [51:56](src/CommandPalette.tsx#L51) | input | динамически / вложено / нет текста | onChange={e=>{setQuery(e.target.value);setIndex(0)}}; onKeyDown={keyboard} |
| [52:73](src/CommandPalette.tsx#L52) | button | динамически / вложено / нет текста | onMouseEnter={()=>setIndex(i)}; onClick={item.run} |

## src/CompetitorsPage.tsx

Разделы реестра: COMP. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [30:182](src/CompetitorsPage.tsx#L30) | button | динамически / вложено / нет текста | onClick={()=>void discover()} |
| [30:319](src/CompetitorsPage.tsx#L30) | button | динамически / вложено / нет текста | onClick={()=>void refreshAll()} |
| [31:3](src/CompetitorsPage.tsx#L31) | YouTubeChannelBar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [33:78](src/CompetitorsPage.tsx#L33) | input | динамически / вложено / нет текста | onChange={e=>setName(e.target.value)}; aria-label="Название канала конкурента" |
| [33:216](src/CompetitorsPage.tsx#L33) | input | динамически / вложено / нет текста | onChange={e=>setUrl(e.target.value)}; aria-label="Адрес канала конкурента" |
| [33:344](src/CompetitorsPage.tsx#L33) | button | Добавить | onClick={()=>void addOne()} |
| [35:1030](src/CompetitorsPage.tsx#L35) | button | динамически / вложено / нет текста | onClick={()=>void refreshOne(c.id)}; aria-label={'Обновить ${c.name}'} |
| [35:1161](src/CompetitorsPage.tsx#L35) | button | × | onClick={()=>remove(c.id)}; aria-label={'Удалить ${c.name}'} |
| [35:1314](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1402](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1484](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1557](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1672](src/CompetitorsPage.tsx#L35) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1708](src/CompetitorsPage.tsx#L35) | summary | Все показатели | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1776](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1851](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:1933](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2020](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2090](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2191](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2294](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2395](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2485](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2592](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:2722](src/CompetitorsPage.tsx#L35) | Metric (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:3447](src/CompetitorsPage.tsx#L35) | button | Открыть YouTube | onClick={()=>void api.openWeb(c.url)} |
| [35:3517](src/CompetitorsPage.tsx#L35) | button | Обновить этого конкурента | onClick={()=>void refreshOne(c.id)} |

## src/DailyOperationsCenter.tsx

Разделы реестра: HOME. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [65:54](src/DailyOperationsCenter.tsx#L65) | button | динамически / вложено / нет текста | onClick={()=>setFilter(id)} |
| [73:11](src/DailyOperationsCenter.tsx#L73) | span | динамически / вложено / нет текста | onClick={()=>row.uploadedToday&&setDetailChannel(row.channelId)}; onKeyDown={e=>{if(e.key==='Enter'&&row.uploadedToday)setDetailChannel(row.channelId)}}; role="button"; tabIndex={0} |
| [75:13](src/DailyOperationsCenter.tsx#L75) | select | динамически / вложено / нет текста | onChange={e=>setTarget(row.channelId,e.target.value)}; onClick={e=>e.stopPropagation()}; aria-label={'Дневная цель '+row.channelName} |
| [76:15](src/DailyOperationsCenter.tsx#L76) | option | Без цели | нет в этом узле; проверить родителя и вложенный компонент |
| [76:50](src/DailyOperationsCenter.tsx#L76) | option | 1/день | нет в этом узле; проверить родителя и вложенный компонент |
| [76:83](src/DailyOperationsCenter.tsx#L76) | option | 5/день | нет в этом узле; проверить родителя и вложенный компонент |
| [76:116](src/DailyOperationsCenter.tsx#L76) | option | 10/день | нет в этом узле; проверить родителя и вложенный компонент |
| [83:98](src/DailyOperationsCenter.tsx#L83) | button | Открыть | onClick={()=>act(row)} |
| [89:87](src/DailyOperationsCenter.tsx#L89) | button | × | onClick={()=>setDetailChannel(undefined)} |

## src/DashboardOS.tsx

Разделы реестра: HOME. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [35:181](src/DashboardOS.tsx#L35) | ScreenErrorBoundary (компонент) | динамически / вложено / нет текста | onHome={()=>setPage('dashboard')} |
| [35:268](src/DashboardOS.tsx#L35) | CommandCenter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:285](src/DashboardOS.tsx#L35) | OperationsDashboard (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [152:134](src/DashboardOS.tsx#L152) | button | Командный центр | onClick={()=>setPage('autopilot')} |
| [153:18](src/DashboardOS.tsx#L153) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setStatsPreview(null)} |
| [153:67](src/DashboardOS.tsx#L153) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [166:12](src/DashboardOS.tsx#L166) | button | ОТМЕНА | onClick={()=>setStatsPreview(null)} |
| [166:71](src/DashboardOS.tsx#L166) | button | ОБНОВИТЬ | onClick={()=>void refreshAllChannelStatistics()} |
| [169:4](src/DashboardOS.tsx#L169) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [170:4](src/DashboardOS.tsx#L170) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [171:4](src/DashboardOS.tsx#L171) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [172:4](src/DashboardOS.tsx#L172) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [173:4](src/DashboardOS.tsx#L173) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [174:4](src/DashboardOS.tsx#L174) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [175:4](src/DashboardOS.tsx#L175) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [176:4](src/DashboardOS.tsx#L176) | Kpi (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [180:70](src/DashboardOS.tsx#L180) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [180:114](src/DashboardOS.tsx#L180) | summary | Источник данных | нет в этом узле; проверить родителя и вложенный компонент |
| [180:246](src/DashboardOS.tsx#L180) | button | динамически / вложено / нет текста | onClick={()=>void previewAllChannelStatistics()} |
| [194:3](src/DashboardOS.tsx#L194) | SystemHealthPanel (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [207:13](src/DashboardOS.tsx#L207) | button | Открыть YouTube | onClick={()=>setPage('youtube')} |
| [219:5](src/DashboardOS.tsx#L219) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [219:49](src/DashboardOS.tsx#L219) | summary | Источник данных | нет в этом узле; проверить родителя и вложенный компонент |
| [220:13](src/DashboardOS.tsx#L220) | button | Открыть «Загруженные» | onClick={()=>setPage('youtube')} |
| [224:86](src/DashboardOS.tsx#L224) | ChannelAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [232:13](src/DashboardOS.tsx#L232) | button | Командный центр | onClick={()=>setPage('autopilot')} |
| [232:80](src/DashboardOS.tsx#L232) | button | Открыть канал | onClick={()=>setPage('channels')} |
| [232:144](src/DashboardOS.tsx#L232) | button | Публикация | onClick={()=>setPage('youtube')} |
| [238:13](src/DashboardOS.tsx#L238) | button | Запас видео | onClick={()=>setPage('inventory')} |
| [238:96](src/DashboardOS.tsx#L238) | button | Производство | onClick={()=>setPage('production')} |
| [243:151](src/DashboardOS.tsx#L243) | ChannelAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [245:13](src/DashboardOS.tsx#L245) | button | Аналитика | onClick={()=>setPage('analytics')} |
| [248:4](src/DashboardOS.tsx#L248) | RpmCoverageCard (компонент) | динамически / вложено / нет текста | onSettings={openRpmSettings}; onAnalytics={()=>setPage('analytics')} |
| [250:4](src/DashboardOS.tsx#L250) | DashboardUploads (компонент) | динамически / вложено / нет текста | onOpen={()=>setPage('youtube')} |
| [254:75](src/DashboardOS.tsx#L254) | button | динамически / вложено / нет текста | onClick={()=>setPage(x.page)} |
| [255:13](src/DashboardOS.tsx#L255) | button | динамически / вложено / нет текста | onClick={()=>setPage(attention[0]?.page\|\|'youtube')} |
| [269:11](src/DashboardOS.tsx#L269) | button | Центр загрузок | onClick={onOpen} |

## src/ExistingVideos.tsx

Разделы реестра: EXIST. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [32:19](src/ExistingVideos.tsx#L32) | button | ↻ Повторить | onClick={e=>{e.stopPropagation();setRetry(x=>x+1)}} |
| [34:9](src/ExistingVideos.tsx#L34) | img | динамически / вложено / нет текста | onLoad={()=>onState(video.id,'ok')}; onError={()=>{const n=fallback+1;if(remotes[n]){setFallback(n);setSrc(remotes[n]);return}setFailed(true);onState(video.id,'error')}} |
| [147:262](src/ExistingVideos.tsx#L147) | button | динамически / вложено / нет текста | onClick={sync} |
| [147:372](src/ExistingVideos.tsx#L147) | button | Проверить недостающие • | onClick={()=>void retryMissing()} |
| [147:481](src/ExistingVideos.tsx#L147) | button | ОТПРАВИТЬ В YOUTUBE • | onClick={()=>setConfirm(true)} |
| [149:246](src/ExistingVideos.tsx#L149) | button | ↶ ОТМЕНИТЬ | onClick={undo} |
| [151:3](src/ExistingVideos.tsx#L151) | input | динамически / вложено / нет текста | onChange={e=>{void read(e.target.files);e.currentTarget.value=''}}; type="file" |
| [152:48](src/ExistingVideos.tsx#L152) | select | динамически / вложено / нет текста | onChange={e=>switchExistingChannel(e.target.value)} |
| [152:171](src/ExistingVideos.tsx#L152) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [152:398](src/ExistingVideos.tsx#L152) | select | динамически / вложено / нет текста | onChange={e=>setLimit(+e.target.value)} |
| [152:460](src/ExistingVideos.tsx#L152) | option | 30 | нет в этом узле; проверить родителя и вложенный компонент |
| [152:479](src/ExistingVideos.tsx#L152) | option | 50 | нет в этом узле; проверить родителя и вложенный компонент |
| [152:498](src/ExistingVideos.tsx#L152) | option | 100 | нет в этом узле; проверить родителя и вложенный компонент |
| [152:518](src/ExistingVideos.tsx#L152) | option | 200 | нет в этом узле; проверить родителя и вложенный компонент |
| [152:538](src/ExistingVideos.tsx#L152) | option | 500 | нет в этом узле; проверить родителя и вложенный компонент |
| [152:558](src/ExistingVideos.tsx#L152) | option | 1000 | нет в этом узле; проверить родителя и вложенный компонент |
| [152:579](src/ExistingVideos.tsx#L152) | option | 5000 | нет в этом узле; проверить родителя и вложенный компонент |
| [152:635](src/ExistingVideos.tsx#L152) | select | динамически / вложено / нет текста | onChange={e=>setOrder(e.target.value as any)} |
| [152:703](src/ExistingVideos.tsx#L152) | option | старые → новые | нет в этом узле; проверить родителя и вложенный компонент |
| [152:749](src/ExistingVideos.tsx#L152) | option | новые → старые | нет в этом узле; проверить родителя и вложенный компонент |
| [152:829](src/ExistingVideos.tsx#L152) | select | динамически / вложено / нет текста | onChange={e=>setSortMode(e.target.value as any)} |
| [152:903](src/ExistingVideos.tsx#L152) | option | дата ↑ | нет в этом узле; проверить родителя и вложенный компонент |
| [152:942](src/ExistingVideos.tsx#L152) | option | дата ↓ | нет в этом узле; проверить родителя и вложенный компонент |
| [152:982](src/ExistingVideos.tsx#L152) | option | YouTube: старые → новые | нет в этом узле; проверить родителя и вложенный компонент |
| [152:1044](src/ExistingVideos.tsx#L152) | option | YouTube: новые → старые | нет в этом узле; проверить родителя и вложенный компонент |
| [152:1106](src/ExistingVideos.tsx#L152) | option | сначала Private | нет в этом узле; проверить родителя и вложенный компонент |
| [152:1194](src/ExistingVideos.tsx#L152) | input | динамически / вложено / нет текста | onChange={e=>setStart(e.target.value)}; type="datetime-local" |
| [152:1305](src/ExistingVideos.tsx#L152) | input | динамически / вложено / нет текста | onChange={e=>setCadence(+e.target.value\|\|1)}; type="number" |
| [152:1413](src/ExistingVideos.tsx#L152) | button | Расставить даты • | onClick={schedule} |
| [152:1512](src/ExistingVideos.tsx#L152) | button | ⬆ Загрузить SEO DOCX • | onClick={()=>file.current?.click()} |
| [152:1651](src/ExistingVideos.tsx#L152) | input | динамически / вложено / нет текста | onChange={e=>setBulkCategory(e.target.value)} |
| [152:1751](src/ExistingVideos.tsx#L152) | button | Category → выбранным | onClick={applyBulkCategory} |
| [152:1866](src/ExistingVideos.tsx#L152) | button | ↻ Плейлисты | onClick={loadPlaylists} |
| [152:1961](src/ExistingVideos.tsx#L152) | select | динамически / вложено / нет текста | onChange={e=>setPlaylistId(e.target.value)} |
| [152:2032](src/ExistingVideos.tsx#L152) | option | не менять | нет в этом узле; проверить родителя и вложенный компонент |
| [152:2085](src/ExistingVideos.tsx#L152) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [152:2169](src/ExistingVideos.tsx#L152) | select | динамически / вложено / нет текста | onChange={e=>setPlaylistAction(e.target.value as PlaylistAction)} |
| [152:2266](src/ExistingVideos.tsx#L152) | option | не менять | нет в этом узле; проверить родителя и вложенный компонент |
| [152:2305](src/ExistingVideos.tsx#L152) | option | добавить | нет в этом узле; проверить родителя и вложенный компонент |
| [152:2342](src/ExistingVideos.tsx#L152) | option | удалить | нет в этом узле; проверить родителя и вложенный компонент |
| [153:92](src/ExistingVideos.tsx#L153) | button | PRIVATE | onClick={()=>setFilter('private')} |
| [153:212](src/ExistingVideos.tsx#L153) | button | SCHEDULED | onClick={()=>setFilter('scheduled')} |
| [153:340](src/ExistingVideos.tsx#L153) | button | PUBLIC | onClick={()=>setFilter('public')} |
| [153:456](src/ExistingVideos.tsx#L153) | button | UNLISTED | onClick={()=>setFilter('unlisted')} |
| [153:580](src/ExistingVideos.tsx#L153) | button | ВСЕ | onClick={()=>setFilter('all')} |
| [153:799](src/ExistingVideos.tsx#L153) | button | Выбрать все здесь | onClick={selectVisible} |
| [153:857](src/ExistingVideos.tsx#L153) | button | Последние 30 Private | onClick={()=>selectLatestPrivate(30)} |
| [153:932](src/ExistingVideos.tsx#L153) | button | динамически / вложено / нет текста | onClick={()=>setSelectedOnly(x=>!x)} |
| [153:1034](src/ExistingVideos.tsx#L153) | button | Снять всё | onClick={selectNone} |
| [156:229](src/ExistingVideos.tsx#L156) | article | динамически / вложено / нет текста | onClick={e=>{if((e.target as HTMLElement).closest('button,input,select,textarea,label,a'))return;toggleSelected(v.id)}} |
| [156:534](src/ExistingVideos.tsx#L156) | label | динамически / вложено / нет текста | onClick={e=>e.stopPropagation()} |
| [156:603](src/ExistingVideos.tsx#L156) | input | динамически / вложено / нет текста | onChange={e=>setVideos(x=>x.map(z=>z.id===v.id?{...z,selected:e.target.checked}:z))}; type="checkbox" |
| [156:771](src/ExistingVideos.tsx#L156) | button | динамически / вложено / нет текста | onClick={e=>{e.stopPropagation();toggleSelected(v.id)}} |
| [156:863](src/ExistingVideos.tsx#L156) | VideoThumb (компонент) | динамически / вложено / нет текста | onState={(id,s)=>setThumbs(x=>x[id]===s?x:{...x,[id]:s})} |
| [156:1273](src/ExistingVideos.tsx#L156) | input | динамически / вложено / нет текста | onChange={e=>setVideos(x=>x.map(z=>z.id===v.id?{...z,publishAt:e.target.value?new Date(e.target.value).toISOString():undefined}:z))}; type="datetime-local" |
| [156:1801](src/ExistingVideos.tsx#L156) | button | динамически / вложено / нет текста | onClick={()=>toggle(v.id)} |
| [156:1960](src/ExistingVideos.tsx#L156) | input | динамически / вложено / нет текста | onChange={e=>setVideos(x=>x.map(z=>z.id===v.id?{...z,title:e.target.value}:z))} |
| [156:2103](src/ExistingVideos.tsx#L156) | textarea | динамически / вложено / нет текста | onChange={e=>setVideos(x=>x.map(z=>z.id===v.id?{...z,description:e.target.value}:z))} |
| [156:2258](src/ExistingVideos.tsx#L156) | input | динамически / вложено / нет текста | onChange={e=>setVideos(x=>x.map(z=>z.id===v.id?{...z,tags:e.target.value.split(',').map(a=>a.trim()).filter(Boolean)}:z))} |
| [156:2441](src/ExistingVideos.tsx#L156) | input | динамически / вложено / нет текста | onChange={e=>setVideos(x=>x.map(z=>z.id===v.id?{...z,categoryId:e.target.value}:z))} |
| [156:2583](src/ExistingVideos.tsx#L156) | select | динамически / вложено / нет текста | onChange={e=>setVideos(x=>x.map(z=>z.id===v.id?{...z,privacyStatus:e.target.value}:z))} |
| [156:2703](src/ExistingVideos.tsx#L156) | option | PRIVATE | нет в этом узле; проверить родителя и вложенный компонент |
| [156:2743](src/ExistingVideos.tsx#L156) | option | UNLISTED | нет в этом узле; проверить родителя и вложенный компонент |
| [156:2785](src/ExistingVideos.tsx#L156) | option | PUBLIC | нет в этом узле; проверить родителя и вложенный компонент |
| [157:13](src/ExistingVideos.tsx#L157) | div | динамически / вложено / нет текста | onMouseDown={()=>setConfirm(false)} |
| [157:80](src/ExistingVideos.tsx#L157) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [157:1171](src/ExistingVideos.tsx#L157) | button | ОТМЕНА | onClick={()=>setConfirm(false)} |
| [157:1226](src/ExistingVideos.tsx#L157) | button | ОТПРАВИТЬ В YOUTUBE | onClick={apply} |

## src/GlobalYouTubeCleanup.tsx

Разделы реестра: QUOTA. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [75:4](src/GlobalYouTubeCleanup.tsx#L75) | button | Посмотреть | onClick={()=>setOpen(true)} |
| [76:4](src/GlobalYouTubeCleanup.tsx#L76) | button | В Корзину | onClick={()=>setOpen(true)} |
| [78:10](src/GlobalYouTubeCleanup.tsx#L78) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>!busy&&setOpen(false)} |
| [78:105](src/GlobalYouTubeCleanup.tsx#L78) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [82:4](src/GlobalYouTubeCleanup.tsx#L82) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [82:18](src/GlobalYouTubeCleanup.tsx#L82) | summary | Посмотреть файлы | нет в этом узле; проверить родителя и вложенный компонент |
| [84:12](src/GlobalYouTubeCleanup.tsx#L84) | button | Отмена | onClick={()=>setOpen(false)} |
| [84:80](src/GlobalYouTubeCleanup.tsx#L84) | button | динамически / вложено / нет текста | onClick={()=>void moveToTrash()} |

## src/HistoryPage.tsx

Разделы реестра: HIST. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [50:64](src/HistoryPage.tsx#L50) | input | динамически / вложено / нет текста | onChange={e=>{setQuery(e.target.value);setLimit(100)}} |
| [51:35](src/HistoryPage.tsx#L51) | select | динамически / вложено / нет текста | onChange={e=>{setStatus(e.target.value);setLimit(100)}} |
| [52:11](src/HistoryPage.tsx#L52) | option | Все статусы | нет в этом узле; проверить родителя и вложенный компонент |
| [52:51](src/HistoryPage.tsx#L52) | option | Успешные | нет в этом узле; проверить родителя и вложенный компонент |
| [52:92](src/HistoryPage.tsx#L52) | option | Ошибки | нет в этом узле; проверить родителя и вложенный компонент |
| [53:11](src/HistoryPage.tsx#L53) | option | Частичные | нет в этом узле; проверить родителя и вложенный компонент |
| [53:53](src/HistoryPage.tsx#L53) | option | Запущенные | нет в этом узле; проверить родителя и вложенный компонент |
| [53:96](src/HistoryPage.tsx#L53) | option | Информация | нет в этом узле; проверить родителя и вложенный компонент |
| [55:34](src/HistoryPage.tsx#L55) | select | динамически / вложено / нет текста | onChange={e=>{setChannelId(e.target.value);setLimit(100)}} |
| [56:11](src/HistoryPage.tsx#L56) | option | Все каналы | нет в этом узле; проверить родителя и вложенный компонент |
| [56:67](src/HistoryPage.tsx#L56) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [58:9](src/HistoryPage.tsx#L58) | button | динамически / вложено / нет текста | onClick={()=>setOldestFirst(x=>!x)}; aria-label={'Порядок: '+(oldestFirst?'сначала старые':'сначала новые')} |
| [60:87](src/HistoryPage.tsx#L60) | p | Найдено · показано | role="status" |
| [64:9](src/HistoryPage.tsx#L64) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [64:51](src/HistoryPage.tsx#L64) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [66:31](src/HistoryPage.tsx#L66) | button | Показать ещё 100 | onClick={()=>setLimit(x=>x+100)} |

## src/LiveContentInventory.tsx

Разделы реестра: STOCK. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [117:9](src/LiveContentInventory.tsx#L117) | button | динамически / вложено / нет текста | onClick={()=>void chooseAllRenderFolders()} |
| [118:9](src/LiveContentInventory.tsx#L118) | button | динамически / вложено / нет текста | onClick={()=>void scanAllInventories('manual-all')} |
| [122:5](src/LiveContentInventory.tsx#L122) | DailyOperationsCenter (компонент) | динамически / вложено / нет текста | onChooseRender={channelId=>void chooseRenderFolder(channelId)} |
| [130:5](src/LiveContentInventory.tsx#L130) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [130:49](src/LiveContentInventory.tsx#L130) | summary | Распределение запаса | нет в этом узле; проверить родителя и вложенный компонент |
| [131:5](src/LiveContentInventory.tsx#L131) | div | динамически / вложено / нет текста | role="status" |
| [144:52](src/LiveContentInventory.tsx#L144) | button | динамически / вложено / нет текста | onClick={()=>openPublisher(row.channelId)} |
| [151:13](src/LiveContentInventory.tsx#L151) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:55](src/LiveContentInventory.tsx#L151) | summary | Подробнее | нет в этом узле; проверить родителя и вложенный компонент |
| [155:15](src/LiveContentInventory.tsx#L155) | button | динамически / вложено / нет текста | onClick={()=>void chooseRenderFolder(row.channelId)} |
| [156:15](src/LiveContentInventory.tsx#L156) | button | Проверить | onClick={()=>void scanInventoryChannel(row.channelId,'manual-channel')} |
| [164:7](src/LiveContentInventory.tsx#L164) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [164:47](src/LiveContentInventory.tsx#L164) | summary | Как определяется готовность | нет в этом узле; проверить родителя и вложенный компонент |

## src/LocalProfileMenu.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [56:5](src/LocalProfileMenu.tsx#L56) | button | динамически / вложено / нет текста | onClick={()=>setOpen(true)}; title="Профиль VYRON" |
| [57:7](src/LocalProfileMenu.tsx#L57) | ProfileAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [61:12](src/LocalProfileMenu.tsx#L61) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setOpen(false)} |
| [62:7](src/LocalProfileMenu.tsx#L62) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [65:11](src/LocalProfileMenu.tsx#L65) | button | × | onClick={()=>setOpen(false)} |
| [69:11](src/LocalProfileMenu.tsx#L69) | ProfileAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [71:38](src/LocalProfileMenu.tsx#L71) | input | динамически / вложено / нет текста | onChange={e=>setName(e.target.value)}; onBlur={saveName}; onKeyDown={e=>{if(e.key==='Enter')saveName()}} |
| [74:15](src/LocalProfileMenu.tsx#L74) | button | динамически / вложено / нет текста | onClick={()=>void chooseAvatar()} |
| [75:38](src/LocalProfileMenu.tsx#L75) | button | Убрать фото | onClick={()=>saveLocalProfile({...active,avatarDataUrl:undefined,avatarPath:undefined})} |
| [83:111](src/LocalProfileMenu.tsx#L83) | button | + Добавить пользователя | onClick={addUser} |
| [85:13](src/LocalProfileMenu.tsx#L85) | button | динамически / вложено / нет текста | onClick={()=>switchTo(profile.id)} |
| [86:15](src/LocalProfileMenu.tsx#L86) | ProfileAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [90:38](src/LocalProfileMenu.tsx#L90) | button | Удалить | onClick={()=>{deleteLocalProfile(profile.id);setError('')}} |
| [94:17](src/LocalProfileMenu.tsx#L94) | button | Готово | onClick={()=>{saveName();setOpen(false)}} |

## src/MajorUpdateCelebration.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [66:22](src/MajorUpdateCelebration.tsx#L66) | div | динамически / вложено / нет текста | role="dialog" |
| [72:7](src/MajorUpdateCelebration.tsx#L72) | SafeArtwork (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [86:28](src/MajorUpdateCelebration.tsx#L86) | button | динамически / вложено / нет текста | onClick={()=>setDetails(x=>!x)} |
| [87:9](src/MajorUpdateCelebration.tsx#L87) | button | Начать работу | onClick={finish} |

## src/MaterialsManager.tsx

Разделы реестра: PROD. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [295:34](src/MaterialsManager.tsx#L295) | button | Ручная сборка | onClick={openManualAssembly} |
| [295:131](src/MaterialsManager.tsx#L295) | button | Обновить | onClick={()=>void refresh()} |
| [299:168](src/MaterialsManager.tsx#L299) | span | каналов | role="status" |
| [312:13](src/MaterialsManager.tsx#L312) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [312:55](src/MaterialsManager.tsx#L312) | summary | Подробнее | нет в этом узле; проверить родителя и вложенный компонент |
| [313:54](src/MaterialsManager.tsx#L313) | button | Изображения | onClick={()=>void importImages(ch)} |
| [313:156](src/MaterialsManager.tsx#L313) | button | динамически / вложено / нет текста | onClick={()=>void chooseMusic(ch)} |
| [313:307](src/MaterialsManager.tsx#L313) | button | Обновить музыку | onClick={()=>void reindexMusic(ch.id)} |
| [313:419](src/MaterialsManager.tsx#L313) | button | Открыть папку | onClick={()=>void productionManagerApi.openFolder(row.image.rootPath)} |
| [327:9](src/MaterialsManager.tsx#L327) | select | динамически / вложено / нет текста | onChange={e=>patchPrefs({cleanupPolicy:e.target.value as 'prompt'\|'never'\|'auto3d'\|'afterUpload'})} |
| [328:11](src/MaterialsManager.tsx#L328) | option | Предлагать очистку | нет в этом узле; проверить родителя и вложенный компонент |
| [329:11](src/MaterialsManager.tsx#L329) | option | Никогда | нет в этом узле; проверить родителя и вложенный компонент |
| [330:11](src/MaterialsManager.tsx#L330) | option | Автоматически через 3 дня | нет в этом узле; проверить родителя и вложенный компонент |
| [331:11](src/MaterialsManager.tsx#L331) | option | После успешной загрузки на YouTube | нет в этом узле; проверить родителя и вложенный компонент |
| [334:34](src/MaterialsManager.tsx#L334) | button | динамически / вложено / нет текста | onClick={()=>void previewCleanup()} |
| [334:155](src/MaterialsManager.tsx#L334) | button | динамически / вложено / нет текста | onClick={()=>void cleanSafeProjects()} |
| [337:18](src/MaterialsManager.tsx#L337) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={closeManual} |
| [338:7](src/MaterialsManager.tsx#L338) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()}; role="dialog" |
| [340:70](src/MaterialsManager.tsx#L340) | button | × | onClick={closeManual}; aria-label="Закрыть ручную сборку" |
| [343:11](src/MaterialsManager.tsx#L343) | select | динамически / вложено / нет текста | onChange={e=>changeManualChannel(e.target.value)} |
| [344:37](src/MaterialsManager.tsx#L344) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [351:38](src/MaterialsManager.tsx#L351) | button | Выбрать изображения | onClick={()=>void chooseManualImages()} |
| [351:182](src/MaterialsManager.tsx#L351) | button | Очистить выбор | onClick={()=>setManualImages([])} |
| [357:38](src/MaterialsManager.tsx#L357) | button | Выбрать файлы | onClick={()=>void chooseManualMusicFiles()} |
| [357:156](src/MaterialsManager.tsx#L357) | button | Выбрать папку | onClick={()=>void chooseManualMusicFolder()} |
| [357:278](src/MaterialsManager.tsx#L357) | button | Очистить выбор | onClick={()=>{setManualMusic([]);setManualMusicRoot('')}} |
| [374:11](src/MaterialsManager.tsx#L374) | button | Отмена | onClick={closeManual} |
| [375:11](src/MaterialsManager.tsx#L375) | button | динамически / вложено / нет текста | onClick={()=>void buildManualProjects()} |

## src/MetadataPage.tsx

Разделы реестра: META. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [134:337](src/MetadataPage.tsx#L134) | input | динамически / вложено / нет текста | onChange={e=>setChangeSchedule(e.target.checked)}; type="checkbox" |
| [134:478](src/MetadataPage.tsx#L134) | button | динамически / вложено / нет текста | onClick={apply} |
| [135:619](src/MetadataPage.tsx#L135) | button | Продолжить | onClick={()=>document.getElementById('metadata-source')?.scrollIntoView({behavior:'smooth',block:'start'})} |
| [135:813](src/MetadataPage.tsx#L135) | button | Очистить | onClick={()=>clearCurrentDraft()} |
| [136:3](src/MetadataPage.tsx#L136) | MetadataQueuePanel (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [137:1031](src/MetadataPage.tsx#L137) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [137:1040](src/MetadataPage.tsx#L137) | summary | Показать расчёт | нет в этом узле; проверить родителя и вложенный компонент |
| [139:22](src/MetadataPage.tsx#L139) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [139:65](src/MetadataPage.tsx#L139) | summary | История операций • • | нет в этом узле; проверить родителя и вложенный компонент |
| [140:228](src/MetadataPage.tsx#L140) | button | Закрыть | onClick={()=>setApplyReport(null)} |
| [141:3](src/MetadataPage.tsx#L141) | input | динамически / вложено / нет текста | onChange={e=>{void readFiles(e.target.files);e.currentTarget.value=''}}; type="file" |
| [143:155](src/MetadataPage.tsx#L143) | button | Загрузить DOCX / файл | onClick={()=>file.current?.click()} |
| [143:269](src/MetadataPage.tsx#L143) | textarea | динамически / вложено / нет текста | onChange={e=>setPaste(e.target.value)} |
| [143:504](src/MetadataPage.tsx#L143) | button | Разобрать текст GPT | onClick={parsePaste} |
| [143:586](src/MetadataPage.tsx#L143) | button | Очистить | onClick={()=>clearCurrentDraft()} |
| [144:160](src/MetadataPage.tsx#L144) | select | динамически / вложено / нет текста | onChange={e=>switchMetadataChannel(e.target.value)} |
| [144:283](src/MetadataPage.tsx#L144) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [144:389](src/MetadataPage.tsx#L144) | button | динамически / вложено / нет текста | onClick={()=>setTarget('future')} |
| [144:546](src/MetadataPage.tsx#L144) | button | динамически / вложено / нет текста | onClick={()=>setTarget('youtube')} |
| [144:1033](src/MetadataPage.tsx#L144) | input | динамически / вложено / нет текста | onChange={e=>setLimit(+e.target.value\|\|1000)}; type="number" |
| [144:1156](src/MetadataPage.tsx#L144) | select | динамически / вложено / нет текста | onChange={e=>setOrder(e.target.value as any)} |
| [144:1224](src/MetadataPage.tsx#L144) | option | новые → старые | нет в этом узле; проверить родителя и вложенный компонент |
| [144:1270](src/MetadataPage.tsx#L144) | option | старые → новые | нет в этом узле; проверить родителя и вложенный компонент |
| [144:1333](src/MetadataPage.tsx#L144) | button | ↻ Синхронизировать | onClick={loadYoutube} |
| [146:226](src/MetadataPage.tsx#L146) | button | Выбрать все здесь | onClick={selectVisible} |
| [146:284](src/MetadataPage.tsx#L146) | button | Последние 30 Private | onClick={selectLatest30} |
| [146:346](src/MetadataPage.tsx#L146) | button | Снять всё | onClick={selectNone} |
| [146:433](src/MetadataPage.tsx#L146) | button | PRIVATE | onClick={()=>setFilter('private')} |
| [146:535](src/MetadataPage.tsx#L146) | button | SCHEDULED | onClick={()=>setFilter('scheduled')} |
| [146:643](src/MetadataPage.tsx#L146) | button | PUBLIC | onClick={()=>setFilter('public')} |
| [146:742](src/MetadataPage.tsx#L146) | button | UNLISTED | onClick={()=>setFilter('unlisted')} |
| [146:915](src/MetadataPage.tsx#L146) | button | динамически / вложено / нет текста | onClick={()=>toggle(v.id)} |
| [146:1541](src/MetadataPage.tsx#L146) | button | Каждый день | onClick={()=>selectInterval(1)} |
| [146:1660](src/MetadataPage.tsx#L146) | button | Через день | onClick={()=>selectInterval(2)} |
| [146:1778](src/MetadataPage.tsx#L146) | button | 3 дня / 1 пауза | onClick={()=>selectPattern(3,1,false)} |
| [146:1956](src/MetadataPage.tsx#L146) | button | Настроить | onClick={()=>selectPattern(patternPublishDays,patternPauseDays,true)} |
| [146:2332](src/MetadataPage.tsx#L146) | input | динамически / вложено / нет текста | onChange={e=>changePattern(+e.target.value\|\|1,patternPauseDays)}; type="number" |
| [146:2488](src/MetadataPage.tsx#L146) | input | динамически / вложено / нет текста | onChange={e=>changePattern(patternPublishDays,+e.target.value\|\|1)}; type="number" |
| [146:2650](src/MetadataPage.tsx#L146) | input | динамически / вложено / нет текста | onChange={e=>changePatternAnchor(e.target.value)}; type="date" |
| [146:2820](src/MetadataPage.tsx#L146) | button | Продолжить расписание автоматически | onClick={()=>setScheduleMode('auto')} |
| [146:2956](src/MetadataPage.tsx#L146) | button | Указать первую дату вручную | onClick={()=>setScheduleMode('manual')} |
| [146:4847](src/MetadataPage.tsx#L146) | button | Повторить синхронизацию | onClick={()=>void loadYoutube()} |
| [146:5148](src/MetadataPage.tsx#L146) | input | динамически / вложено / нет текста | onChange={e=>setStart(e.target.value)}; type="datetime-local" |
| [146:5272](src/MetadataPage.tsx#L146) | input | динамически / вложено / нет текста | onChange={e=>changeCadence(+e.target.value\|\|1)}; type="number" |
| [146:5408](src/MetadataPage.tsx#L146) | input | динамически / вложено / нет текста | onChange={e=>changeDefaultTime(e.target.value)}; type="time" |

## src/MetadataQueuePanel.tsx

Разделы реестра: META. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [70:208](src/MetadataQueuePanel.tsx#L70) | button | динамически / вложено / нет текста | onClick={()=>void importCurrent()} |
| [82:240](src/MetadataQueuePanel.tsx#L82) | button | УДАЛИТЬ ИСПОЛЬЗОВАННЫЙ PACK | onClick={()=>void purge(summary!.completePackIds[0])} |
| [82:373](src/MetadataQueuePanel.tsx#L82) | button | ОСТАВИТЬ | onClick={()=>notifyInfo('Pack оставлен','Данные не удалены.')} |
| [83:34](src/MetadataQueuePanel.tsx#L83) | input | динамически / вложено / нет текста | onChange={e=>{setOfferCleanup(e.target.checked);try{localStorage.setItem('vyron:metadata-queue:offer-cleanup:v1',e.target.checked?'1':'0')}catch{}}}; type="checkbox" |
| [84:56](src/MetadataQueuePanel.tsx#L84) | select | динамически / вложено / нет текста | onChange={e=>{setOffset(0);setStatus(e.target.value)}} |
| [84:134](src/MetadataQueuePanel.tsx#L84) | option | Все активные | нет в этом узле; проверить родителя и вложенный компонент |
| [84:172](src/MetadataQueuePanel.tsx#L84) | option | AVAILABLE | нет в этом узле; проверить родителя и вложенный компонент |
| [84:216](src/MetadataQueuePanel.tsx#L84) | option | RESERVED | нет в этом узле; проверить родителя и вложенный компонент |
| [84:258](src/MetadataQueuePanel.tsx#L84) | option | APPLYING | нет в этом узле; проверить родителя и вложенный компонент |
| [84:300](src/MetadataQueuePanel.tsx#L84) | option | APPLIED | нет в этом узле; проверить родителя и вложенный компонент |
| [84:340](src/MetadataQueuePanel.tsx#L84) | option | ERROR | нет в этом узле; проверить родителя и вложенный компонент |
| [84:496](src/MetadataQueuePanel.tsx#L84) | button | ← | onClick={()=>setOffset(Math.max(0,offset-PAGE_SIZE))} |
| [84:590](src/MetadataQueuePanel.tsx#L84) | button | → | onClick={()=>setOffset(offset+PAGE_SIZE)} |

## src/MetadataTabs.tsx

Разделы реестра: META. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [3:70](src/MetadataTabs.tsx#L3) | MetadataPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |

## src/MigrationPanel.tsx

Разделы реестра: SETTINGS / DATA. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [199:24](src/MigrationPanel.tsx#L199) | input | динамически / вложено / нет текста | onChange={e=>setPassphrase(e.target.value)}; type="password" |
| [201:5](src/MigrationPanel.tsx#L201) | button | Создать пакет переноса | onClick={doExport} |
| [202:5](src/MigrationPanel.tsx#L202) | button | Выбрать пакет | onClick={chooseImport} |
| [203:5](src/MigrationPanel.tsx#L203) | button | Проверить импорт | onClick={doPreview} |
| [221:29](src/MigrationPanel.tsx#L221) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [221:64](src/MigrationPanel.tsx#L221) | summary | Пути другой ОС: | нет в этом узле; проверить родителя и вложенный компонент |
| [223:5](src/MigrationPanel.tsx#L223) | button | Импортировать и MERGE | onClick={doImport} |
| [224:5](src/MigrationPanel.tsx#L224) | button | Restore previous migration snapshot | onClick={restore} |

## src/ModalPortal.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [23:22](src/ModalPortal.tsx#L23) | div | динамически / вложено / нет текста | onMouseDown={e=>{if(e.target===e.currentTarget&&closeOnBackdrop&&onClose)onClose()}}; role="presentation"; tabIndex={-1} |

## src/NotificationStack.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [19:10](src/NotificationStack.tsx#L19) | article | динамически / вложено / нет текста | onMouseEnter={pause}; onMouseLeave={start} |
| [21:268](src/NotificationStack.tsx#L21) | button | динамически / вложено / нет текста | onClick={()=>{a.onClick();if(a.closeAfter!==false)onClose()}} |
| [22:5](src/NotificationStack.tsx#L22) | button | × | onClick={onClose}; aria-label="Закрыть" |
| [42:4](src/NotificationStack.tsx#L42) | button | динамически / вложено / нет текста | onClick={openHistory}; aria-label="Уведомления"; title="Уведомления" |
| [43:82](src/NotificationStack.tsx#L43) | ToastCard (компонент) | динамически / вложено / нет текста | onClose={()=>close(x.id)} |
| [43:159](src/NotificationStack.tsx#L43) | button | Ещё уведомлений: · Открыть историю | onClick={openHistory}; type="button" |
| [44:18](src/NotificationStack.tsx#L44) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setHistoryOpen(false)} |
| [44:67](src/NotificationStack.tsx#L44) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [45:63](src/NotificationStack.tsx#L45) | button | × | onClick={()=>setHistoryOpen(false)}; aria-label="Закрыть" |
| [47:77](src/NotificationStack.tsx#L47) | HistoryRow (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [48:13](src/NotificationStack.tsx#L48) | button | Очистить историю | onClick={()=>{clearNotificationHistory();setHistory([])}} |
| [48:131](src/NotificationStack.tsx#L48) | button | Закрыть | onClick={()=>setHistoryOpen(false)} |

## src/OAuthInventoryPanel.tsx

Разделы реестра: AUTH. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [19:362](src/OAuthInventoryPanel.tsx#L19) | button | динамически / вложено / нет текста | onClick={scan} |
| [19:484](src/OAuthInventoryPanel.tsx#L19) | button | Скопировать безопасный отчёт | onClick={copy} |
| [19:1449](src/OAuthInventoryPanel.tsx#L19) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [19:1463](src/OAuthInventoryPanel.tsx#L19) | summary | Безопасный inventory report | нет в этом узле; проверить родителя и вложенный компонент |

## src/OwnerProfile.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [53:5](src/OwnerProfile.tsx#L53) | button | динамически / вложено / нет текста | onClick={()=>setOpen(true)}; title="Профиль владельца" |
| [57:12](src/OwnerProfile.tsx#L57) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setOpen(false)} |
| [57:54](src/OwnerProfile.tsx#L57) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [58:166](src/OwnerProfile.tsx#L58) | button | × | onClick={()=>setOpen(false)} |
| [60:9](src/OwnerProfile.tsx#L60) | button | динамически / вложено / нет текста | onClick={()=>void chooseAvatar()} |
| [61:53](src/OwnerProfile.tsx#L61) | select | динамически / вложено / нет текста | onChange={e=>{const next=e.target.value as 'OWNER'\|'MANAGER';setDraft(x=>({...x,mode:next,role:x.role===DEFAULT_ROLE\|\|x.role==='Manager'?next==='OWNER'?DEFAULT_ROLE:'Manager':x.role}))}} |
| [61:267](src/OwnerProfile.tsx#L61) | option | OWNER | нет в этом узле; проверить родителя и вложенный компонент |
| [61:303](src/OwnerProfile.tsx#L61) | option | MANAGER | нет в этом узле; проверить родителя и вложенный компонент |
| [62:32](src/OwnerProfile.tsx#L62) | input | динамически / вложено / нет текста | onChange={e=>setDraft(x=>({...x,name:e.target.value}))} |
| [63:33](src/OwnerProfile.tsx#L63) | input | динамически / вложено / нет текста | onChange={e=>setDraft(x=>({...x,role:e.target.value}))} |
| [64:46](src/OwnerProfile.tsx#L64) | input | динамически / вложено / нет текста | onChange={e=>setDraft(x=>({...x,company:e.target.value}))} |
| [66:15](src/OwnerProfile.tsx#L66) | button | Отмена | onClick={()=>setOpen(false)} |
| [66:67](src/OwnerProfile.tsx#L66) | button | Сохранить | onClick={save} |

## src/ProductionManager.tsx

Разделы реестра: PROD. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [320:645](src/ProductionManager.tsx#L320) | button | динамически / вложено / нет текста | onClick={toggleImport} |
| [321:374](src/ProductionManager.tsx#L321) | button | ВЫБРАТЬ ПАПКУ | onClick={chooseMusic} |
| [321:472](src/ProductionManager.tsx#L321) | button | ОБНОВИТЬ БИБЛИОТЕКУ | onClick={reindexMusic} |
| [325:88](src/ProductionManager.tsx#L325) | button | − | onClick={()=>setProjectCount(v=>clamp(v-1,1,10000))} |
| [325:159](src/ProductionManager.tsx#L325) | input | динамически / вложено / нет текста | onChange={e=>setProjectCount(clamp(+e.target.value,1,10000))}; type="number" |
| [325:284](src/ProductionManager.tsx#L325) | button | + | onClick={()=>setProjectCount(v=>clamp(v+1,1,10000))} |
| [325:443](src/ProductionManager.tsx#L325) | button | динамически / вложено / нет текста | onClick={()=>setTracksPerProject(n)} |
| [325:590](src/ProductionManager.tsx#L325) | input | динамически / вложено / нет текста | onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}; aria-label="Песен на проект"; type="range" |
| [325:747](src/ProductionManager.tsx#L325) | input | динамически / вложено / нет текста | onChange={e=>setTracksPerProject(clamp(+e.target.value,1,100))}; type="number" |
| [325:917](src/ProductionManager.tsx#L325) | input | динамически / вложено / нет текста | onChange={e=>setAllowImageReuse(e.target.checked)}; type="checkbox" |
| [326:46](src/ProductionManager.tsx#L326) | button | динамически / вложено / нет текста | onClick={()=>setMode(m.id)} |
| [328:203](src/ProductionManager.tsx#L328) | button | СОБРАТЬ ТОЛЬКО | onClick={()=>setProjectCount(result.availableImages\|\|1)} |
| [328:316](src/ProductionManager.tsx#L328) | button | РАЗРЕШИТЬ ПОВТОР | onClick={()=>{setAllowImageReuse(true);void buildBatch(true)}} |
| [330:34](src/ProductionManager.tsx#L330) | button | динамически / вложено / нет текста | onClick={()=>void buildBatch()} |
| [333:364](src/ProductionManager.tsx#L333) | button | ОТКРЫТЬ ПАПКУ BATCH | onClick={()=>void productionManagerApi.openFolder(result.batch!.rootPath)} |
| [333:1416](src/ProductionManager.tsx#L333) | button | Выбрать всё | onClick={()=>setSelectedProjects(batchStatus.projects.map(p=>p.projectId))} |
| [333:1520](src/ProductionManager.tsx#L333) | button | Снять выделение | onClick={()=>setSelectedProjects([])} |
| [333:1590](src/ProductionManager.tsx#L333) | button | Удалить выбранные | onClick={()=>void deleteBatchProjects(selectedProjectIds,false)} |
| [333:1763](src/ProductionManager.tsx#L333) | button | Удалить все | onClick={()=>void deleteBatchProjects(batchStatus.projects.map(p=>p.projectId),true)} |
| [333:2014](src/ProductionManager.tsx#L333) | input | динамически / вложено / нет текста | onChange={()=>toggleProject(p.projectId)}; type="checkbox" |
| [333:2449](src/ProductionManager.tsx#L333) | button | динамически / вложено / нет текста | onClick={e=>{e.preventDefault();e.stopPropagation();void cleanupRenderedProject(p.projectId)}}; type="button" |
| [333:2732](src/ProductionManager.tsx#L333) | button | динамически / вложено / нет текста | onClick={()=>void archiveRenderedVideos()} |
| [333:2863](src/ProductionManager.tsx#L333) | button | ПРОВЕРИТЬ | onClick={()=>void validateBatch()} |
| [333:2953](src/ProductionManager.tsx#L333) | button | ОТПРАВИТЬ В ENDLUME ( ) | onClick={()=>void openEndlume()} |
| [335:173](src/ProductionManager.tsx#L335) | button | Восстановить незавершённую работу | onClick={openRecoveryFlow} |
| [335:250](src/ProductionManager.tsx#L335) | button | динамически / вложено / нет текста | onClick={()=>void cleanupAllRenderedProjectAssets()} |
| [335:449](src/ProductionManager.tsx#L335) | button | ↻ ОБНОВИТЬ | onClick={()=>void refreshState()} |
| [335:817](src/ProductionManager.tsx#L335) | button | динамически / вложено / нет текста | onClick={()=>{setResult({status:'ready',availableImages:collected,requestedProjects:batch.projectCount,batch});patchChannelProductionPrefs(channelId,{lastBatchId:batch.batchId,selectedProjectIds:[]});void productionManag |
| [335:1439](src/ProductionManager.tsx#L335) | strong | динамически / вложено / нет текста | onClick={e=>{e.stopPropagation();void resume(batch)}} |

## src/ProductionOS.tsx

Разделы реестра: PROD. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [84:193](src/ProductionOS.tsx#L84) | button | динамически / вложено / нет текста | onClick={refreshAll} |
| [84:286](src/ProductionOS.tsx#L84) | button | Поддержать буфер | onClick={maintainBuffer} |
| [84:344](src/ProductionOS.tsx#L84) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [84:384](src/ProductionOS.tsx#L84) | summary | Дополнительно | нет в этом узле; проверить родителя и вложенный компонент |
| [84:416](src/ProductionOS.tsx#L84) | button | динамически / вложено / нет текста | onClick={()=>void beginGlobalProjectCleanup()} |
| [84:590](src/ProductionOS.tsx#L84) | button | + Создать проекты | onClick={()=>setPlanOpen(true)} |
| [85:673](src/ProductionOS.tsx#L85) | button | ИЗМЕНИТЬ ПАПКУ | onClick={()=>void chooseProjectRoot('global')} |
| [85:775](src/ProductionOS.tsx#L85) | button | ОТДЕЛЬНАЯ ПАПКА ДЛЯ КАНАЛА | onClick={()=>void chooseProjectRoot('channel')} |
| [85:881](src/ProductionOS.tsx#L85) | button | ОТКРЫТЬ В FINDER | onClick={()=>void productionManagerApi.openFolder(projectRoot)} |
| [86:26](src/ProductionOS.tsx#L86) | StableProductionPipelinePanel (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [87:66](src/ProductionOS.tsx#L87) | button | Обзор | onClick={()=>{setSection('overview');setTab('queue');changeQueueFilter('all')}} |
| [87:249](src/ProductionOS.tsx#L87) | button | Материалы | onClick={()=>{setSection('materials');setTab('materials')}} |
| [87:418](src/ProductionOS.tsx#L87) | button | Сборка проектов | onClick={()=>{setSection('builder');setTab('manager')}} |
| [88:21](src/ProductionOS.tsx#L88) | StableProductionWorkspace (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [88:49](src/ProductionOS.tsx#L88) | details | динамически / вложено / нет текста | onToggle={e=>setQueueDetailsOpen(e.currentTarget.open)} |
| [88:187](src/ProductionOS.tsx#L88) | summary | Подробная очередь | нет в этом узле; проверить родителя и вложенный компонент |
| [88:300](src/ProductionOS.tsx#L88) | button | динамически / вложено / нет текста | onClick={()=>changeQueueFilter(st)} |
| [88:543](src/ProductionOS.tsx#L88) | select | динамически / вложено / нет текста | onChange={e=>changeQueueFilter(e.target.value)}; aria-label="Фильтр очереди" |
| [88:642](src/ProductionOS.tsx#L88) | option | Все каналы / статусы | нет в этом узле; проверить родителя и вложенный компонент |
| [88:736](src/ProductionOS.tsx#L88) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [88:807](src/ProductionOS.tsx#L88) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [88:1055](src/ProductionOS.tsx#L88) | button | Создать проекты | onClick={()=>setPlanOpen(true)} |
| [88:1317](src/ProductionOS.tsx#L88) | button | Выбрать всё | onClick={()=>patchPrefs({selectedJobIds:[...new Set([...selectedJobIds,...visibleJobIds])]})} |
| [88:1439](src/ProductionOS.tsx#L88) | button | Снять выделение | onClick={()=>patchPrefs({selectedJobIds:selectedJobIds.filter(id=>!visibleIdSet.has(id))})} |
| [88:1563](src/ProductionOS.tsx#L88) | button | Удалить выбранные | onClick={()=>void deleteJobs(selectedJobIds.filter(id=>visibleIdSet.has(id)),'Удалить выбранные проекты?')} |
| [88:1782](src/ProductionOS.tsx#L88) | button | Удалить все | onClick={()=>void deleteJobs(visibleJobIds,'Удалить все проекты в текущем списке?')} |
| [88:2095](src/ProductionOS.tsx#L88) | input | динамически / вложено / нет текста | onChange={()=>toggleJob(j.id)}; type="checkbox" |
| [88:2913](src/ProductionOS.tsx#L88) | button | Папка | onClick={()=>api.reveal(j.folder)} |
| [88:3000](src/ProductionOS.tsx#L88) | button | + Аудио | onClick={async()=>{const files=await api.chooseTracks();if(!files.length\|\|!j.folder)return;try{const r=await api.addTracks(j.folder,files,ch?.minTracks\|\|j.minTracks);patchJob(j.id,{tracksCount:r.tracksCount,status:r. |
| [88:3387](src/ProductionOS.tsx#L88) | button | В ENDLUME | onClick={async()=>{try{await api.enqueueRender(settings.workspace,j.folder);patchJob(j.id,{renderQueuedAt:new Date().toISOString()});if(settings.endlumePath)await api.openEndlume(settings.endlumePath);toast('Проект отпра |
| [88:3746](src/ProductionOS.tsx#L88) | button | YouTube | onClick={()=>setPage('youtube')} |
| [88:3851](src/ProductionOS.tsx#L88) | button | Повторить | onClick={async()=>{if(!j.folder)return;try{patchJob(j.id,{...(await api.refreshJob(j.folder,ch?.minTracks\|\|j.minTracks)),error:undefined})}catch(e){patchJob(j.id,{error:String(e)})}}} |
| [88:4110](src/ProductionOS.tsx#L88) | button | Показать ещё 50 · осталось | onClick={()=>setQueueLimit(n=>n+50)} |
| [89:68](src/ProductionOS.tsx#L89) | select | динамически / вложено / нет текста | onChange={e=>{setChannelId(e.target.value);setInbox(undefined)}} |
| [89:159](src/ProductionOS.tsx#L89) | option | — канал — | нет в этом узле; проверить родителя и вложенный компонент |
| [89:239](src/ProductionOS.tsx#L89) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [89:299](src/ProductionOS.tsx#L89) | button | + Будущий канал | onClick={()=>{setFutureName('');setFutureOpen(true)}} |
| [89:385](src/ProductionOS.tsx#L89) | button | + Импортировать изображения | onClick={importImages} |
| [89:502](src/ProductionOS.tsx#L89) | ProductionManager (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [90:21](src/ProductionOS.tsx#L90) | ProductionManager (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [92:39](src/ProductionOS.tsx#L92) | div | динамически / вложено / нет текста | onMouseDown={()=>setCleanupPhase(0)} |
| [92:107](src/ProductionOS.tsx#L92) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [92:1834](src/ProductionOS.tsx#L92) | button | ОТМЕНА | onClick={()=>{setCleanupPhase(0);setCleanupPreview(null)}} |
| [92:1916](src/ProductionOS.tsx#L92) | button | динамически / вложено / нет текста | onClick={()=>{setCleanupConfirmed(false);setCleanupPhase(2)}} |
| [93:39](src/ProductionOS.tsx#L93) | div | динамически / вложено / нет текста | onMouseDown={()=>setCleanupPhase(1)} |
| [93:107](src/ProductionOS.tsx#L93) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [93:417](src/ProductionOS.tsx#L93) | input | динамически / вложено / нет текста | onChange={e=>setCleanupConfirmed(e.target.checked)}; type="checkbox" |
| [93:623](src/ProductionOS.tsx#L93) | button | НАЗАД | onClick={()=>setCleanupPhase(1)} |
| [93:701](src/ProductionOS.tsx#L93) | button | динамически / вложено / нет текста | onClick={()=>void executeGlobalProjectCleanup()} |
| [94:14](src/ProductionOS.tsx#L94) | div | динамически / вложено / нет текста | onMouseDown={()=>setFutureOpen(false)} |
| [94:84](src/ProductionOS.tsx#L94) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [94:359](src/ProductionOS.tsx#L94) | input | динамически / вложено / нет текста | onChange={e=>setFutureName(e.target.value)}; onKeyDown={e=>{if(e.key==='Enter')createFutureChannel()}} |
| [94:774](src/ProductionOS.tsx#L94) | button | Отмена | onClick={()=>setFutureOpen(false)} |
| [94:832](src/ProductionOS.tsx#L94) | button | Создать будущий канал | onClick={createFutureChannel} |
| [95:14](src/ProductionOS.tsx#L95) | div | динамически / вложено / нет текста | onMouseDown={()=>setPlanOpen(false)} |
| [95:82](src/ProductionOS.tsx#L95) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [95:279](src/ProductionOS.tsx#L95) | button | динамически / вложено / нет текста | onClick={()=>setPlanCount(n)} |
| [95:394](src/ProductionOS.tsx#L95) | input | динамически / вложено / нет текста | onChange={e=>setPlanCount(Math.max(1,Math.min(1000,+e.target.value\|\|1)))}; type="number" |
| [95:579](src/ProductionOS.tsx#L95) | button | динамически / вложено / нет текста | onClick={()=>setPlanScope('one')} |
| [95:729](src/ProductionOS.tsx#L95) | button | динамически / вложено / нет текста | onClick={()=>setPlanScope('all')} |
| [95:921](src/ProductionOS.tsx#L95) | select | динамически / вложено / нет текста | onChange={e=>setChannelId(e.target.value)} |
| [95:1035](src/ProductionOS.tsx#L95) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [95:1392](src/ProductionOS.tsx#L95) | button | Отмена | onClick={()=>setPlanOpen(false)} |
| [95:1448](src/ProductionOS.tsx#L95) | button | Создать проектов | onClick={createExact} |

## src/ProductionPipelinePanel.tsx

Разделы реестра: PROD. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [12:79](src/ProductionPipelinePanel.tsx#L12) | React.Fragment (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |

## src/ProductionWorkspace.tsx

Разделы реестра: PROD. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [17:587](src/ProductionWorkspace.tsx#L17) | ChannelRow (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [17:810](src/ProductionWorkspace.tsx#L17) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [17:845](src/ProductionWorkspace.tsx#L17) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |

## src/PublisherOS.tsx

Разделы реестра: YT / PUB. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [54:9](src/PublisherOS.tsx#L54) | PublisherOSAdvanced (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [555:3](src/PublisherOS.tsx#L555) | PublisherShell (компонент) | динамически / вложено / нет текста | onChannel={setChannelId}; onClear={()=>{setDraft(clearPublishWorkspace(channelId));notifyInfo('Черновик очищен','Файлы на диске не удалены.')}}; onFolders={()=>scrollPublisherSection('publisher-folders')}; onRecovery={() |
| [556:206](src/PublisherOS.tsx#L556) | button | динамически / вложено / нет текста | onClick={()=>void discoverChannelFolders(false)} |
| [556:587](src/PublisherOS.tsx#L556) | button | Открыть | onClick={()=>channelRenderFolder&&api.openLocal(channelRenderFolder)} |
| [556:713](src/PublisherOS.tsx#L556) | button | Изменить | onClick={()=>void chooseChannelRenderFolder()} |
| [556:1005](src/PublisherOS.tsx#L556) | button | Открыть | onClick={()=>channelProjectsFolder&&api.openLocal(channelProjectsFolder)} |
| [556:1137](src/PublisherOS.tsx#L556) | button | Изменить | onClick={()=>void chooseChannelProjectsFolder()} |
| [557:863](src/PublisherOS.tsx#L557) | button | Продолжить | onClick={()=>resumeUpload(x)} |
| [557:956](src/PublisherOS.tsx#L557) | button | Отменить recovery | onClick={async()=>{await api.youtubeCancelUploadSession(x.jobId);void refreshSessions();notifyInfo('Локальная recovery-сессия удалена','Видео автоматически заново не загружается.')}} |
| [559:322](src/PublisherOS.tsx#L559) | button | Новые | onClick={()=>setVideoFilter('new')} |
| [559:435](src/PublisherOS.tsx#L559) | button | На YouTube | onClick={()=>setVideoFilter('youtube')} |
| [559:566](src/PublisherOS.tsx#L559) | button | Обрабатываются | onClick={()=>setVideoFilter('processing')} |
| [559:709](src/PublisherOS.tsx#L559) | button | Ошибки | onClick={()=>setVideoFilter('errors')} |
| [559:831](src/PublisherOS.tsx#L559) | button | Все | onClick={()=>setVideoFilter('all')} |
| [559:987](src/PublisherOS.tsx#L559) | button | Выбрать все | onClick={()=>setDraftPatch({selectedIds:channelJobs.filter(j=>selectableJobIds.has(j.id)).map(j=>j.id)})} |
| [559:1181](src/PublisherOS.tsx#L559) | button | Снять выбор | onClick={()=>setDraftPatch({selectedIds:[]})} |
| [559:1255](src/PublisherOS.tsx#L559) | button | динамически / вложено / нет текста | onClick={()=>void scanRenderFolder()} |
| [559:1403](src/PublisherOS.tsx#L559) | button | Проверить статус YouTube | onClick={()=>void reconcileExistingUploads()} |
| [559:1690](src/PublisherOS.tsx#L559) | button | Найти автоматически | onClick={()=>void autoDiscoverChannelRenderFolder()} |
| [559:1811](src/PublisherOS.tsx#L559) | button | Выбрать папку | onClick={()=>void chooseChannelRenderFolder()} |
| [559:1920](src/PublisherOS.tsx#L559) | button | Убрать выбранные | onClick={()=>setRemoveRequest({ids:selected.filter(j=>j.status!=='UPLOADING').map(j=>j.id),label:'Убрать из списка: ${selected.filter(j=>j.status!=='UPLOADING').length}'})} |
| [559:2213](src/PublisherOS.tsx#L559) | button | Удалить загруженные из партии ( ) | onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(batchCleanupRows),label:'Удалить загруженные из этой партии: ${batchCleanupRows.length}',cleanupMode:'batch'})} |
| [559:2551](src/PublisherOS.tsx#L559) | button | Очистить подтверждённо загруженные ( ) | onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(channelCleanupRows),label:'Очистить подтверждённо загруженные видео: ${channelCleanupRows.length}',cleanupMode:'channel'})} |
| [559:3034](src/PublisherOS.tsx#L559) | button | Найти автоматически | onClick={()=>void autoDiscoverChannelRenderFolder()} |
| [559:3123](src/PublisherOS.tsx#L559) | button | Выбрать папку | onClick={()=>void chooseChannelRenderFolder()} |
| [559:3604](src/PublisherOS.tsx#L559) | button | Повторить | onClick={()=>void scanRenderFolder()} |
| [559:3694](src/PublisherOS.tsx#L559) | button | Изменить папку | onClick={()=>void chooseChannelRenderFolder()} |
| [559:4407](src/PublisherOS.tsx#L559) | button | Добавить новые ( ) | onClick={addScannedRenderCandidates} |
| [559:4571](src/PublisherOS.tsx#L559) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [559:4580](src/PublisherOS.tsx#L559) | summary | Технические сведения legacy identity | нет в этом узле; проверить родителя и вложенный компонент |
| [559:5306](src/PublisherOS.tsx#L559) | button | Считать текущие физические файлы новыми поколениями ( ) | onClick={confirmLegacyNewGenerations} |
| [559:5584](src/PublisherOS.tsx#L559) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [559:5593](src/PublisherOS.tsx#L559) | summary | Результат добавления | нет в этом узле; проверить родителя и вложенный компонент |
| [559:6002](src/PublisherOS.tsx#L559) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [559:6011](src/PublisherOS.tsx#L559) | summary | Все физические файлы канала ( ) | нет в этом узле; проверить родителя и вложенный компонент |
| [559:6756](src/PublisherOS.tsx#L559) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [559:6765](src/PublisherOS.tsx#L559) | summary | Показать доказательство статуса | нет в этом узле; проверить родителя и вложенный компонент |
| [559:8016](src/PublisherOS.tsx#L559) | button | Проверить текущий файл | onClick={()=>void recheckRenderIdentity(row)} |
| [559:8150](src/PublisherOS.tsx#L559) | button | Считать текущий файл новой версией | onClick={()=>void treatVerifyRowAsNewGeneration(row)} |
| [559:8351](src/PublisherOS.tsx#L559) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [559:8360](src/PublisherOS.tsx#L559) | summary | старая запись другого канала скрыта | нет в этом узле; проверить родителя и вложенный компонент |
| [559:8670](src/PublisherOS.tsx#L559) | button | Убрать ошибочную запись из публикации | onClick={()=>removeWrongScanJob(j)} |
| [559:8777](src/PublisherOS.tsx#L559) | button | Перепривязать к правильному каналу | onClick={()=>rebindWrongScanJob(j)} |
| [559:8907](src/PublisherOS.tsx#L559) | PublisherVideoPicker (компонент) | динамически / вложено / нет текста | onToggle={id=>setDraftPatch({selectedIds:draft.selectedIds.includes(id)?draft.selectedIds.filter(x=>x!==id):[...draft.selectedIds,id]})}; onRemove={j=>setRemoveRequest({ids:[j.id],label:'VIDEO_'+String(j.number).padStart |
| [560:186](src/PublisherOS.tsx#L560) | input | динамически / вложено / нет текста | onChange={e=>void readDoc(e.target.files)}; type="file" |
| [560:302](src/PublisherOS.tsx#L560) | button | динамически / вложено / нет текста | onClick={()=>docInput.current?.click()} |
| [561:234](src/PublisherOS.tsx#L561) | button | динамически / вложено / нет текста | onClick={chooseThumbnails} |
| [561:386](src/PublisherOS.tsx#L561) | button | Не менять обложки YouTube | onClick={()=>setDraftPatch({thumbs:[],allowMissingThumbs:false})} |
| [561:892](src/PublisherOS.tsx#L561) | input | динамически / вложено / нет текста | onChange={e=>setDraftPatch({allowMissingThumbs:e.target.checked})}; type="checkbox" |
| [564:282](src/PublisherOS.tsx#L564) | button | динамически / вложено / нет текста | onClick={()=>{if(mode!==draft.scheduleMode)setScheduleSync(x=>({...x,state:'idle',note:undefined}));setDraftPatch({scheduleMode:mode,...(mode!=='file'&&!draft.scheduleTime?{scheduleTime:scheduleTime}:{})})}}; type="butto |
| [564:739](src/PublisherOS.tsx#L564) | input | динамически / вложено / нет текста | onChange={e=>{const intervalDays=Math.max(1,Math.floor(Number(e.target.value)\|\|1));setScheduleSync(x=>({...x,state:'idle',note:'Интервал изменён'}));setDraftPatch({intervalDays})}}; aria-label="Интервал публикации"; ty |
| [565:114](src/PublisherOS.tsx#L565) | button | Из файла | onClick={()=>{if(draft.scheduleTimeSource!=='file')setScheduleSync(x=>({...x,state:'idle',note:'Источник времени изменён'}));setDraftPatch({scheduleTimeSource:'file'})}}; type="button" |
| [565:381](src/PublisherOS.tsx#L565) | button | Задать время | onClick={()=>{if(draft.scheduleTimeSource!=='common')setScheduleSync(x=>({...x,state:'idle',note:'Источник времени изменён'}));setDraftPatch({scheduleTimeSource:'common'})}}; type="button" |
| [565:658](src/PublisherOS.tsx#L565) | button | Как на YouTube | onClick={()=>{if(draft.scheduleTimeSource!=='youtube')setScheduleSync(x=>({...x,state:'idle',note:'Получите фактическое время с YouTube'}));setDraftPatch({scheduleTimeSource:'youtube'})}}; type="button" |
| [566:67](src/PublisherOS.tsx#L566) | button | Продолжить расписание канала | onClick={()=>setScheduleStartMode('continue')}; type="button" |
| [566:228](src/PublisherOS.tsx#L566) | button | Начать с даты | onClick={()=>setScheduleStartMode('manual')}; type="button" |
| [567:37](src/PublisherOS.tsx#L567) | button | динамически / вложено / нет текста | onClick={()=>void syncScheduleFromYoutube()} |
| [569:278](src/PublisherOS.tsx#L569) | button | Использовать рекомендуемую | onClick={()=>setScheduleStartMode('continue')} |
| [569:368](src/PublisherOS.tsx#L569) | button | Изменить дату начала | onClick={()=>setScheduleStartMode('manual')} |
| [571:80](src/PublisherOS.tsx#L571) | input | динамически / вложено / нет текста | onChange={e=>setDraftPatch({scheduleStartDate:e.target.value})}; type="date" |
| [572:89](src/PublisherOS.tsx#L572) | input | динамически / вложено / нет текста | onChange={e=>{setDraftPatch({scheduleTime:e.target.value});if(scheduleSync.state==='ready')setScheduleSync(x=>({...x,state:'idle',note:'Время изменено — синхронизируйте расписание повторно'}))}}; type="time" |
| [577:5](src/PublisherOS.tsx#L577) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [577:14](src/PublisherOS.tsx#L577) | summary | Технические сведения расписания | нет в этом узле; проверить родителя и вложенный компонент |
| [582:642](src/PublisherOS.tsx#L582) | button | Удалить загруженные из партии ( ) | onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(batchCleanupRows),label:'Удалить загруженные из этой партии: ${batchCleanupRows.length}',cleanupMode:'batch'})} |
| [582:980](src/PublisherOS.tsx#L582) | button | Очистить подтверждённо загруженные ( ) | onClick={()=>setRemoveRequest({ids:cleanupCandidateIds(channelCleanupRows),label:'Очистить подтверждённо загруженные видео: ${channelCleanupRows.length}',cleanupMode:'channel'})} |
| [583:639](src/PublisherOS.tsx#L583) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [583:648](src/PublisherOS.tsx#L583) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [583:4366](src/PublisherOS.tsx#L583) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [583:4375](src/PublisherOS.tsx#L583) | summary | Доказательство duplicate protection | нет в этом узле; проверить родителя и вложенный компонент |
| [583:4684](src/PublisherOS.tsx#L583) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [583:4693](src/PublisherOS.tsx#L583) | summary | Технические сведения запроса | нет в этом узле; проверить родителя и вложенный компонент |
| [583:5838](src/PublisherOS.tsx#L583) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [583:5847](src/PublisherOS.tsx#L583) | summary | Почему заблокировано | нет в этом узле; проверить родителя и вложенный компонент |
| [583:6067](src/PublisherOS.tsx#L583) | button | динамически / вложено / нет текста | onClick={()=>void runDryRun()} |
| [583:6219](src/PublisherOS.tsx#L583) | button | ЗАГРУЗИТЬ 1 ТЕСТОВОЕ | onClick={()=>runBatch(1)} |
| [583:6316](src/PublisherOS.tsx#L583) | button | динамически / вложено / нет текста | onClick={()=>runBatch()} |
| [583:7021](src/PublisherOS.tsx#L583) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [583:7030](src/PublisherOS.tsx#L583) | summary | Технические сведения квоты | нет в этом узле; проверить родителя и вложенный компонент |
| [584:19](src/PublisherOS.tsx#L584) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>!busy&&setRemoveRequest(null)} |
| [584:76](src/PublisherOS.tsx#L584) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [584:1152](src/PublisherOS.tsx#L584) | button | Отмена | onClick={()=>setRemoveRequest(null)} |
| [584:1257](src/PublisherOS.tsx#L584) | button | Скрыть из списка | onClick={()=>void removeReady(removeRequest.ids,false)} |
| [584:1363](src/PublisherOS.tsx#L584) | button | Переместить в Корзину | onClick={()=>void removeReady(removeRequest.ids,true)} |

## src/PublisherShell.tsx

Разделы реестра: YT / PUB. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [42:5](src/PublisherShell.tsx#L42) | button | Очистить черновик | onClick={p.onClear}; type="button" |
| [48:28](src/PublisherShell.tsx#L48) | button | динамически / вложено / нет текста | onClick={control.onClick}; type="button" |

## src/PublisherVideoPicker.tsx

Разделы реестра: YT / PUB. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [40:7](src/PublisherVideoPicker.tsx#L40) | input | динамически / вложено / нет текста | onChange={()=>fresh&&p.onToggle(j.id)}; type="checkbox" |
| [47:30](src/PublisherVideoPicker.tsx#L47) | button | Очистить связь | onClick={()=>p.onClearRemoteMissing(j)} |
| [48:6](src/PublisherVideoPicker.tsx#L48) | button | Действия | onClick={()=>p.onRemove(j)} |
| [52:25](src/PublisherVideoPicker.tsx#L52) | button | динамически / вложено / нет текста | onClick={()=>setLimit(x=>Math.min(p.jobs.length,x+24))} |

## src/QuotaMeter.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [16:74](src/QuotaMeter.tsx#L16) | input | динамически / вложено / нет текста | onChange={e=>setUsage(setYoutubeQuotaLimit(Math.max(1000,+e.target.value\|\|10000)))}; type="number" |
| [16:253](src/QuotaMeter.tsx#L16) | input | динамически / вложено / нет текста | onChange={e=>setChannels(Math.max(1,+e.target.value\|\|1))}; type="number" |
| [16:397](src/QuotaMeter.tsx#L16) | input | динамически / вложено / нет текста | onChange={e=>setVideos(Math.max(1,+e.target.value\|\|1))}; type="number" |
| [16:517](src/QuotaMeter.tsx#L16) | button | Сохранить план | onClick={savePlan} |
| [16:583](src/QuotaMeter.tsx#L16) | button | Проверить снова | onClick={()=>{clearYoutubeQuotaGuard();setGuard(youtubeQuotaState());setUsage(youtubeQuotaUsage())}} |

## src/ReadyVideoInventoryPanel.tsx

Разделы реестра: STOCK. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [16:274](src/ReadyVideoInventoryPanel.tsx#L16) | button | динамически / вложено / нет текста | onClick={()=>setChannelId(channelId===x.channelId?'':x.channelId)} |
| [17:51](src/ReadyVideoInventoryPanel.tsx#L17) | select | динамически / вложено / нет текста | onChange={e=>setChannelId(e.target.value)} |
| [17:120](src/ReadyVideoInventoryPanel.tsx#L17) | option | Все каналы | нет в этом узле; проверить родителя и вложенный компонент |
| [17:182](src/ReadyVideoInventoryPanel.tsx#L17) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [17:284](src/ReadyVideoInventoryPanel.tsx#L17) | select | динамически / вложено / нет текста | onChange={e=>setStatus(e.target.value as any)} |
| [17:354](src/ReadyVideoInventoryPanel.tsx#L17) | option | Все | нет в этом узле; проверить родителя и вложенный компонент |
| [17:386](src/ReadyVideoInventoryPanel.tsx#L17) | option | Свободные | нет в этом узле; проверить родителя и вложенный компонент |
| [17:426](src/ReadyVideoInventoryPanel.tsx#L17) | option | Запланированные | нет в этом узле; проверить родителя и вложенный компонент |
| [17:476](src/ReadyVideoInventoryPanel.tsx#L17) | option | Загружаются | нет в этом узле; проверить родителя и вложенный компонент |
| [17:519](src/ReadyVideoInventoryPanel.tsx#L17) | option | Опубликованные | нет в этом узле; проверить родителя и вложенный компонент |
| [17:568](src/ReadyVideoInventoryPanel.tsx#L17) | option | Ошибки | нет в этом узле; проверить родителя и вложенный компонент |
| [17:662](src/ReadyVideoInventoryPanel.tsx#L17) | input | динамически / вложено / нет текста | onChange={e=>setQuery(e.target.value)} |

## src/RecoveryGate.tsx

Разделы реестра: BG / DATA. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [119:13](src/RecoveryGate.tsx#L119) | button | динамически / вложено / нет текста | onClick={()=>void resumeNow()} |
| [119:152](src/RecoveryGate.tsx#L119) | button | Не восстанавливать | onClick={()=>void dismiss()} |
| [119:232](src/RecoveryGate.tsx#L119) | button | динамически / вложено / нет текста | onClick={()=>setDetails(x=>!x)} |

## src/ReleaseHistoryTimeline.tsx

Разделы реестра: HIST. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [21:27](src/ReleaseHistoryTimeline.tsx#L21) | SafeArtwork (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [25:3](src/ReleaseHistoryTimeline.tsx#L25) | button | динамически / вложено / нет текста | onClick={onToggle} |
| [28:51](src/ReleaseHistoryTimeline.tsx#L28) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [28:89](src/ReleaseHistoryTimeline.tsx#L28) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [46:33](src/ReleaseHistoryTimeline.tsx#L46) | input | динамически / вложено / нет текста | onChange={e=>setQuery(e.target.value)} |
| [46:186](src/ReleaseHistoryTimeline.tsx#L46) | button | динамически / вложено / нет текста | onClick={()=>setFilter(id)} |
| [47:262](src/ReleaseHistoryTimeline.tsx#L47) | ReleaseCard (компонент) | динамически / вложено / нет текста | onToggle={()=>setExpanded(x=>x===row.version?'':row.version)} |

## src/RpmCoverageCard.tsx

Разделы реестра: HOME. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [22:4](src/RpmCoverageCard.tsx#L22) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [22:13](src/RpmCoverageCard.tsx#L22) | summary | Проверить расчёт по каналам | нет в этом узле; проверить родителя и вложенный компонент |
| [24:3](src/RpmCoverageCard.tsx#L24) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [24:47](src/RpmCoverageCard.tsx#L24) | summary | Как считается оценка | нет в этом узле; проверить родителя и вложенный компонент |
| [25:22](src/RpmCoverageCard.tsx#L25) | button | Настроить RPM | onClick={onSettings} |
| [25:76](src/RpmCoverageCard.tsx#L25) | button | Изменить RPM | onClick={onSettings} |
| [25:126](src/RpmCoverageCard.tsx#L25) | button | Открыть аналитику | onClick={onAnalytics} |

## src/SafeArtwork.tsx

Разделы реестра: SHELL / CHANNEL / STOCK. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [7:12](src/SafeArtwork.tsx#L7) | span | динамически / вложено / нет текста | role="img"; aria-label={alt\|\|'VYRON'} |
| [9:10](src/SafeArtwork.tsx#L9) | img | динамически / вложено / нет текста | onError={()=>setFailed(true)} |

## src/ScheduleOS.tsx

Разделы реестра: SCHED. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [49:156](src/ScheduleOS.tsx#L49) | button | динамически / вложено / нет текста | onClick={sync} |
| [51:106](src/ScheduleOS.tsx#L51) | select | динамически / вложено / нет текста | onChange={e=>switchChannel(e.target.value)}; aria-label="Канал" |
| [51:278](src/ScheduleOS.tsx#L51) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [56:84](src/ScheduleOS.tsx#L56) | button | Календарь | onClick={()=>setView('calendar')} |
| [56:219](src/ScheduleOS.tsx#L56) | button | Массовое изменение | onClick={()=>setView('bulk')} |
| [57:292](src/ScheduleOS.tsx#L57) | button | динамически / вложено / нет текста | onClick={()=>{setSelectedIds([v.id]);setView('bulk')}} |
| [58:316](src/ScheduleOS.tsx#L58) | button | ПРОДОЛЖИТЬ | onClick={()=>void continueRecovery('pending')} |
| [58:431](src/ScheduleOS.tsx#L58) | button | ПОВТОРИТЬ НЕУДАВШИЕСЯ | onClick={()=>void continueRecovery('failed')} |
| [58:532](src/ScheduleOS.tsx#L58) | button | СКРЫТЬ ВОССТАНОВЛЕНИЕ | onClick={()=>{clearScheduleRecovery(channelId);setRecovery(undefined)}} |
| [59:222](src/ScheduleOS.tsx#L59) | button | Выбрать все будущие | onClick={selectAllFuture} |
| [59:284](src/ScheduleOS.tsx#L59) | button | Снять выбор | onClick={()=>setSelectedIds([])} |
| [59:345](src/ScheduleOS.tsx#L59) | button | динамически / вложено / нет текста | onClick={()=>setSelectedOnly(x=>!x)} |
| [59:470](src/ScheduleOS.tsx#L59) | input | динамически / вложено / нет текста | onChange={e=>setSelectFrom(e.target.value)}; type="date" |
| [59:561](src/ScheduleOS.tsx#L59) | button | Выбрать от даты | onClick={selectFromDate} |
| [60:79](src/ScheduleOS.tsx#L60) | input | динамически / вложено / нет текста | onChange={()=>toggle(v.id)}; type="checkbox" |
| [61:33](src/ScheduleOS.tsx#L61) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [61:42](src/ScheduleOS.tsx#L61) | summary | Закрытые без даты ( ) · выбираются вручную | нет в этом узле; проверить родителя и вложенный компонент |
| [61:207](src/ScheduleOS.tsx#L61) | input | динамически / вложено / нет текста | onChange={()=>toggle(v.id)}; type="checkbox" |
| [63:236](src/ScheduleOS.tsx#L63) | button | Каждый день | onClick={()=>setMode('daily')} |
| [63:334](src/ScheduleOS.tsx#L63) | button | Через день | onClick={()=>setMode('everyOther')} |
| [63:441](src/ScheduleOS.tsx#L63) | button | Каждые N дней | onClick={()=>setMode('interval')} |
| [63:547](src/ScheduleOS.tsx#L63) | button | 3 дня / 1 пауза | onClick={()=>setMode('pattern')} |
| [63:692](src/ScheduleOS.tsx#L63) | button | СЖАТЬ РАСПИСАНИЕ | onClick={compress} |
| [63:744](src/ScheduleOS.tsx#L63) | button | РАСТЯНУТЬ РАСПИСАНИЕ | onClick={stretch} |
| [63:832](src/ScheduleOS.tsx#L63) | input | динамически / вложено / нет текста | onChange={e=>setIntervalDays(Math.max(1,+e.target.value\|\|1))}; type="number" |
| [63:1006](src/ScheduleOS.tsx#L63) | input | динамически / вложено / нет текста | onChange={e=>setPublishDays(Math.max(1,+e.target.value\|\|1))}; type="number" |
| [63:1146](src/ScheduleOS.tsx#L63) | input | динамически / вложено / нет текста | onChange={e=>setPauseDays(Math.max(1,+e.target.value\|\|1))}; type="number" |
| [63:1291](src/ScheduleOS.tsx#L63) | input | динамически / вложено / нет текста | onChange={e=>setTime(e.target.value)}; type="time" |
| [63:1420](src/ScheduleOS.tsx#L63) | input | динамически / вложено / нет текста | onChange={()=>setStartMode('preserveFirst')}; type="radio" |
| [63:1611](src/ScheduleOS.tsx#L63) | input | динамически / вложено / нет текста | onChange={()=>setStartMode('manual')}; type="radio" |
| [63:1760](src/ScheduleOS.tsx#L63) | input | динамически / вложено / нет текста | onChange={e=>setManualStartDate(e.target.value)}; type="date" |
| [64:1771](src/ScheduleOS.tsx#L64) | button | ПРИМЕНИТЬ НОВЫЕ ДАТЫ | onClick={()=>setConfirm(true)} |
| [65:13](src/ScheduleOS.tsx#L65) | div | динамически / вложено / нет текста | onMouseDown={()=>setConfirm(false)} |
| [65:80](src/ScheduleOS.tsx#L65) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()}; role="dialog" |
| [65:951](src/ScheduleOS.tsx#L65) | button | ОТМЕНА | onClick={()=>setConfirm(false)} |
| [65:1006](src/ScheduleOS.tsx#L65) | button | ИЗМЕНИТЬ РАСПИСАНИЕ ДЛЯ ВИДЕО | onClick={()=>void apply()} |

## src/ScheduleWorkspace.tsx

Разделы реестра: SCHED. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [18:63](src/ScheduleWorkspace.tsx#L18) | button | Календарь | onClick={()=>setView('calendar')} |
| [18:165](src/ScheduleWorkspace.tsx#L18) | button | Массовое изменение | onClick={()=>setView('bulk')} |
| [21:329](src/ScheduleWorkspace.tsx#L21) | button | динамически / вложено / нет текста | onClick={()=>setSelected(j)} |
| [21:868](src/ScheduleWorkspace.tsx#L21) | button | Открыть массовое изменение | onClick={()=>setView('bulk')} |
| [23:39](src/ScheduleWorkspace.tsx#L23) | ScheduleOS (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [24:15](src/ScheduleWorkspace.tsx#L24) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setSelected(null)} |
| [24:60](src/ScheduleWorkspace.tsx#L24) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [24:602](src/ScheduleWorkspace.tsx#L24) | button | Закрыть | onClick={()=>setSelected(null)} |
| [24:658](src/ScheduleWorkspace.tsx#L24) | button | Изменить расписание | onClick={()=>{setSelected(null);setView('bulk')}} |

## src/ScreenErrorBoundary.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [38:12](src/ScreenErrorBoundary.tsx#L38) | section | динамически / вложено / нет текста | role="alert" |
| [38:224](src/ScreenErrorBoundary.tsx#L38) | button | Вернуться на главную | onClick={this.home} |
| [38:301](src/ScreenErrorBoundary.tsx#L38) | button | Скопировать диагностику | onClick={this.copy} |

## src/SettingsOS.tsx

Разделы реестра: SETTINGS / DATA. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [39:121](src/SettingsOS.tsx#L39) | button | динамически / вложено / нет текста | onClick={()=>onChange(!value)}; type="button"; role="switch" |
| [142:381](src/SettingsOS.tsx#L142) | button | динамически / вложено / нет текста | onClick={()=>setTab(id)}; type="button" |
| [144:171](src/SettingsOS.tsx#L144) | input | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [144:246](src/SettingsOS.tsx#L144) | button | Выбрать | onClick={async()=>{const p=await api.chooseWorkspace();if(p)patch({workspace:p})}} |
| [144:353](src/SettingsOS.tsx#L144) | button | Открыть | onClick={()=>s.workspace&&api.openLocal(s.workspace)} |
| [145:348](src/SettingsOS.tsx#L145) | input | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [145:427](src/SettingsOS.tsx#L145) | button | динамически / вложено / нет текста | onClick={()=>void chooseVyronRoot()} |
| [145:536](src/SettingsOS.tsx#L145) | button | Открыть | onClick={()=>s.vyronRootPath&&api.openLocal(s.vyronRootPath)} |
| [146:179](src/SettingsOS.tsx#L146) | button | Компактно | onClick={()=>patch({interfaceDensity:'compact'})} |
| [146:382](src/SettingsOS.tsx#L146) | button | Просторно | onClick={()=>patch({interfaceDensity:'comfortable'})} |
| [146:605](src/SettingsOS.tsx#L146) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({reduceMotion:v})} |
| [147:270](src/SettingsOS.tsx#L147) | input | динамически / вложено / нет текста | onChange={e=>setRpmInput(e.target.value)}; type="number" |
| [147:422](src/SettingsOS.tsx#L147) | button | СОХРАНИТЬ | onClick={saveRpm} |
| [148:138](src/SettingsOS.tsx#L148) | button | Выключен | onClick={()=>setMode('off')} |
| [148:257](src/SettingsOS.tsx#L148) | button | С подсказками | onClick={()=>setMode('assisted')} |
| [148:396](src/SettingsOS.tsx#L148) | button | Локальный | onClick={()=>setMode('full')} |
| [148:650](src/SettingsOS.tsx#L148) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [148:685](src/SettingsOS.tsx#L148) | summary | Расширенные параметры | нет в этом узле; проверить родителя и вложенный компонент |
| [148:753](src/SettingsOS.tsx#L148) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoCreatePlan:v})} |
| [148:893](src/SettingsOS.tsx#L148) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoAssignMusic:v})} |
| [148:1035](src/SettingsOS.tsx#L148) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoAssignImages:v})} |
| [148:1190](src/SettingsOS.tsx#L148) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoQueueRender:v})} |
| [150:14](src/SettingsOS.tsx#L150) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={()=>setFsPreview(undefined)} |
| [150:65](src/SettingsOS.tsx#L150) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [150:1156](src/SettingsOS.tsx#L150) | button | ОТМЕНА | onClick={()=>setFsPreview(undefined)} |
| [150:1217](src/SettingsOS.tsx#L150) | button | динамически / вложено / нет текста | onClick={()=>void applyVyronRoot()} |
| [151:51](src/SettingsOS.tsx#L151) | AuthRecoveryCenter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:360](src/SettingsOS.tsx#L151) | select | динамически / вложено / нет текста | onChange={e=>setQuotaProfileId(e.target.value)} |
| [151:439](src/SettingsOS.tsx#L151) | option | Выберите OAuth профиль | нет в этом узле; проверить родителя и вложенный компонент |
| [151:509](src/SettingsOS.tsx#L151) | option | • | нет в этом узле; проверить родителя и вложенный компонент |
| [151:2114](src/SettingsOS.tsx#L151) | button | динамически / вложено / нет текста | onClick={()=>setClientIdVisible(x=>!x)} |
| [151:2268](src/SettingsOS.tsx#L151) | button | СКОПИРОВАТЬ CLIENT ID | onClick={async()=>{if(!googleProjectDiag?.clientId)return;await navigator.clipboard.writeText(googleProjectDiag.clientId);notifySuccess('Client ID скопирован','В буфер скопирован только OAuth client_id.')}} |
| [151:2553](src/SettingsOS.tsx#L151) | button | ОТКРЫТЬ GOOGLE CLOUD | onClick={()=>api.openWeb(googleCloudConsoleUrl(projectId))} |
| [151:2650](src/SettingsOS.tsx#L151) | button | динамически / вложено / нет текста | onClick={()=>void runLocalGoogleProjectDiagnostics()} |
| [151:3206](src/SettingsOS.tsx#L151) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:3215](src/SettingsOS.tsx#L151) | summary | Каналы этого API project ( ) | нет в этом узле; проверить родителя и вложенный компонент |
| [151:4703](src/SettingsOS.tsx#L151) | select | динамически / вложено / нет текста | onChange={e=>setQuotaProfileId(e.target.value)} |
| [151:4782](src/SettingsOS.tsx#L151) | option | Выберите OAuth профиль | нет в этом узле; проверить родителя и вложенный компонент |
| [151:4852](src/SettingsOS.tsx#L151) | option | • | нет в этом узле; проверить родителя и вложенный компонент |
| [151:5036](src/SettingsOS.tsx#L151) | input | динамически / вложено / нет текста | onChange={e=>setQuotaLimitInput(e.target.value)}; type="number" |
| [151:5585](src/SettingsOS.tsx#L151) | button | Сохранить | onClick={saveUploadQuota} |
| [151:5657](src/SettingsOS.tsx#L151) | button | Вернуть значение по умолчанию | onClick={resetUploadQuota} |
| [151:6249](src/SettingsOS.tsx#L151) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>{patch({youtubePublishSafeMode:v});if(!v&&s.autoUploadYoutube)patch({autoUploadYoutube:false})}} |
| [151:6632](src/SettingsOS.tsx#L151) | select | динамически / вложено / нет текста | onChange={e=>patch({youtubeUploadConcurrency:Math.max(1,Math.min(8,Number(e.target.value)\|\|2))})} |
| [151:6802](src/SettingsOS.tsx#L151) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:6940](src/SettingsOS.tsx#L151) | select | динамически / вложено / нет текста | onChange={e=>patch({youtubeUploadPerChannelConcurrency:Math.max(1,Math.min(4,Number(e.target.value)\|\|1))})} |
| [151:7122](src/SettingsOS.tsx#L151) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:7294](src/SettingsOS.tsx#L151) | select | динамически / вложено / нет текста | onChange={e=>patch({metadataConcurrency:Math.max(1,Math.min(12,Number(e.target.value)\|\|3))})} |
| [151:7454](src/SettingsOS.tsx#L151) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:7596](src/SettingsOS.tsx#L151) | select | динамически / вложено / нет текста | onChange={e=>patch({statisticsConcurrency:Math.max(1,Math.min(12,Number(e.target.value)\|\|3))})} |
| [151:7760](src/SettingsOS.tsx#L151) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:8238](src/SettingsOS.tsx#L151) | button | Открыть YouTube | onClick={()=>setPage('youtube')} |
| [151:8333](src/SettingsOS.tsx#L151) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [151:8381](src/SettingsOS.tsx#L151) | summary | Advanced YouTube | нет в этом узле; проверить родителя и вложенный компонент |
| [151:8439](src/SettingsOS.tsx#L151) | input | динамически / вложено / нет текста | onChange={e=>patch({youtubeCategoryId:e.target.value.trim()\|\|'10'})} |
| [152:22](src/SettingsOS.tsx#L152) | MigrationPanel (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [153:265](src/SettingsOS.tsx#L153) | input | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [153:337](src/SettingsOS.tsx#L153) | button | Выбрать | onClick={async()=>{const p=await api.chooseEndlume();if(p)patch({endlumePath:p})}} |
| [153:460](src/SettingsOS.tsx#L153) | button | Открыть | onClick={()=>api.openEndlume(s.endlumePath)} |
| [154:945](src/SettingsOS.tsx#L154) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [154:980](src/SettingsOS.tsx#L154) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [154:2226](src/SettingsOS.tsx#L154) | button | Проверить установку | onClick={async()=>{try{const p=await api.updaterInstallPreflight();useUpdaterRuntime.setState({preflight:p});if(p.runningFromDmg)notifyWarning('VYRON запущен из DMG','Переместите VYRON.app в Applications один раз.');else |
| [154:2788](src/SettingsOS.tsx#L154) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({autoCheckUpdates:v})} |
| [154:2982](src/SettingsOS.tsx#L154) | button | динамически / вложено / нет текста | onClick={()=>void checkForUpdate()} |
| [154:4186](src/SettingsOS.tsx#L154) | button | ОБНОВИТЬ | onClick={()=>void useUpdaterRuntime.getState().download()} |
| [154:4679](src/SettingsOS.tsx#L154) | button | УСТАНОВИТЬ И ПЕРЕЗАПУСТИТЬ | onClick={()=>void installDownloadedUpdate()} |
| [154:5313](src/SettingsOS.tsx#L154) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [154:5322](src/SettingsOS.tsx#L154) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [154:5417](src/SettingsOS.tsx#L154) | button | ПОВТОРИТЬ | onClick={()=>void checkForUpdate()} |
| [154:5523](src/SettingsOS.tsx#L154) | ReleaseHistoryTimeline (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [156:96](src/SettingsOS.tsx#L156) | SafeArtwork (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [157:22](src/SettingsOS.tsx#L157) | OAuthInventoryPanel (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [158:278](src/SettingsOS.tsx#L158) | Toggle (компонент) | динамически / вложено / нет текста | onChange={v=>patch({fpsMonitor:v})} |
| [158:683](src/SettingsOS.tsx#L158) | button | динамически / вложено / нет текста | onClick={()=>void copySafeDiagnosticReport()} |
| [158:822](src/SettingsOS.tsx#L158) | button | динамически / вложено / нет текста | onClick={runDiagnostics} |
| [158:1142](src/SettingsOS.tsx#L158) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [158:1151](src/SettingsOS.tsx#L158) | summary | Подробнее | нет в этом узле; проверить родителя и вложенный компонент |
| [158:1463](src/SettingsOS.tsx#L158) | button | динамически / вложено / нет текста | onClick={runKeychainDiagnostics} |
| [158:1854](src/SettingsOS.tsx#L158) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [158:1887](src/SettingsOS.tsx#L158) | summary | Подробнее | нет в этом узле; проверить родителя и вложенный компонент |
| [158:2174](src/SettingsOS.tsx#L158) | button | OAuth / Keychain matrix | onClick={()=>void runKeychainMatrix()} |
| [158:2331](src/SettingsOS.tsx#L158) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [158:2371](src/SettingsOS.tsx#L158) | summary | OAuth / Keychain • profiles • secret values: 0 | нет в этом узле; проверить родителя и вложенный компонент |
| [158:3568](src/SettingsOS.tsx#L158) | button | динамически / вложено / нет текста | onClick={runOauthRecoveryDiagnostic} |
| [158:3775](src/SettingsOS.tsx#L158) | select | динамически / вложено / нет текста | onChange={e=>{setOauthDiagProfileId(e.target.value);setOauthDiag(undefined)}} |
| [158:3888](src/SettingsOS.tsx#L158) | option | Выберите канал | нет в этом узле; проверить родителя и вложенный компонент |
| [158:3975](src/SettingsOS.tsx#L158) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [158:4069](src/SettingsOS.tsx#L158) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [158:4109](src/SettingsOS.tsx#L158) | summary | Safe diagnostic result • | нет в этом узле; проверить родителя и вложенный компонент |
| [158:6114](src/SettingsOS.tsx#L158) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [158:6123](src/SettingsOS.tsx#L158) | summary | Operation ID | нет в этом узле; проверить родителя и вложенный компонент |

## src/StatisticsCenter.tsx

Разделы реестра: ANALYTICS / WINNER. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [74:285](src/StatisticsCenter.tsx#L74) | button | динамически / вложено / нет текста | onClick={()=>void refreshAll()} |
| [74:494](src/StatisticsCenter.tsx#L74) | button | динамически / вложено / нет текста | onClick={()=>setShowUnlinked(x=>!x)} |
| [77:171](src/StatisticsCenter.tsx#L77) | select | динамически / вложено / нет текста | onChange={e=>setSort(e.target.value as SortKey)} |
| [77:241](src/StatisticsCenter.tsx#L77) | option | Канал | нет в этом узле; проверить родителя и вложенный компонент |
| [77:276](src/StatisticsCenter.tsx#L77) | option | Подписчики | нет в этом узле; проверить родителя и вложенный компонент |
| [77:323](src/StatisticsCenter.tsx#L77) | option | Просмотры | нет в этом узле; проверить родителя и вложенный компонент |
| [77:363](src/StatisticsCenter.tsx#L77) | option | Видео | нет в этом узле; проверить родителя и вложенный компонент |
| [77:400](src/StatisticsCenter.tsx#L77) | option | Подписчики 24ч | нет в этом узле; проверить родителя и вложенный компонент |
| [77:445](src/StatisticsCenter.tsx#L77) | option | Подписчики 7д | нет в этом узле; проверить родителя и вложенный компонент |
| [77:488](src/StatisticsCenter.tsx#L77) | option | Просмотры 7д | нет в этом узле; проверить родителя и вложенный компонент |
| [77:532](src/StatisticsCenter.tsx#L77) | option | Последнее обновление | нет в этом узле; проверить родителя и вложенный компонент |
| [77:585](src/StatisticsCenter.tsx#L77) | option | Ошибка | нет в этом узле; проверить родителя и вложенный компонент |
| [77:631](src/StatisticsCenter.tsx#L77) | button | динамически / вложено / нет текста | onClick={()=>setDesc(x=>!x)} |
| [79:273](src/StatisticsCenter.tsx#L79) | ChannelAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [79:1221](src/StatisticsCenter.tsx#L79) | button | динамически / вложено / нет текста | onClick={()=>void refreshOne(row)} |
| [79:1315](src/StatisticsCenter.tsx#L79) | button | Подробнее | onClick={()=>openDetail(row.channel.id)} |
| [82:637](src/StatisticsCenter.tsx#L82) | button | Подключить YouTube | onClick={()=>connectChannel(c)} |
| [83:168](src/StatisticsCenter.tsx#L83) | button | Закрыть | onClick={()=>{setSelected('');sessionStorage.removeItem('vyron:statistics:selected-channel')}} |
| [84:36](src/StatisticsCenter.tsx#L84) | select | динамически / вложено / нет текста | onChange={e=>setPeriod(e.target.value as StatisticsPeriod)} |
| [84:119](src/StatisticsCenter.tsx#L84) | option | Сегодня | нет в этом узле; проверить родителя и вложенный компонент |
| [84:157](src/StatisticsCenter.tsx#L84) | option | Вчера | нет в этом узле; проверить родителя и вложенный компонент |
| [84:197](src/StatisticsCenter.tsx#L84) | option | 7 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [84:231](src/StatisticsCenter.tsx#L84) | option | 30 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [84:267](src/StatisticsCenter.tsx#L84) | option | Этот месяц | нет в этом узле; проверить родителя и вложенный компонент |
| [84:308](src/StatisticsCenter.tsx#L84) | option | Прошлый месяц | нет в этом узле; проверить родителя и вложенный компонент |
| [84:356](src/StatisticsCenter.tsx#L84) | option | 90 дней | нет в этом узле; проверить родителя и вложенный компонент |
| [84:392](src/StatisticsCenter.tsx#L84) | option | Всё время VYRON | нет в этом узле; проверить родителя и вложенный компонент |
| [84:436](src/StatisticsCenter.tsx#L84) | option | Произвольный период | нет в этом узле; проверить родителя и вложенный компонент |
| [84:518](src/StatisticsCenter.tsx#L84) | input | динамически / вложено / нет текста | onChange={e=>setCustom(x=>({...x,from:e.target.value}))}; type="date" |
| [84:615](src/StatisticsCenter.tsx#L84) | input | динамически / вложено / нет текста | onChange={e=>setCustom(x=>({...x,to:e.target.value}))}; type="date" |
| [84:712](src/StatisticsCenter.tsx#L84) | select | динамически / вложено / нет текста | onChange={e=>setGroup(e.target.value as Group)} |
| [84:782](src/StatisticsCenter.tsx#L84) | option | Все точки | нет в этом узле; проверить родителя и вложенный компонент |
| [84:823](src/StatisticsCenter.tsx#L84) | option | По дням | нет в этом узле; проверить родителя и вложенный компонент |
| [84:859](src/StatisticsCenter.tsx#L84) | option | По неделям | нет в этом узле; проверить родителя и вложенный компонент |
| [84:899](src/StatisticsCenter.tsx#L84) | option | По месяцам | нет в этом узле; проверить родителя и вложенный компонент |
| [88:149](src/StatisticsCenter.tsx#L88) | button | динамически / вложено / нет текста | onClick={()=>void refreshAnalytics()} |
| [88:492](src/StatisticsCenter.tsx#L88) | AnalyticsFacts (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [95:1110](src/StatisticsCenter.tsx#L95) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [95:1119](src/StatisticsCenter.tsx#L95) | summary | Analytics по дням • | нет в этом узле; проверить родителя и вложенный компонент |

## src/SystemHealthPanel.tsx

Разделы реестра: HOME. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [18:126](src/SystemHealthPanel.tsx#L18) | button | динамически / вложено / нет текста | onClick={()=>setOpen(x=>!x)} |
| [21:4](src/SystemHealthPanel.tsx#L21) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [21:48](src/SystemHealthPanel.tsx#L21) | summary | Источник данных | нет в этом узле; проверить родителя и вложенный компонент |

## src/TaskCenter.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [26:9](src/TaskCenter.tsx#L26) | button | динамически / вложено / нет текста | onClick={openTaskCenter}; title="Открыть центр задач" |
| [29:109](src/TaskCenter.tsx#L29) | TaskCenterModal (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [35:9](src/TaskCenter.tsx#L35) | div | динамически / вложено / нет текста | onMouseDown={closeTaskCenter} |
| [35:89](src/TaskCenter.tsx#L35) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [36:276](src/TaskCenter.tsx#L36) | button | × | onClick={closeTaskCenter} |
| [38:4](src/TaskCenter.tsx#L38) | button | Активные | onClick={()=>setFilter('active')} |
| [39:4](src/TaskCenter.tsx#L39) | button | Очередь | onClick={()=>setFilter('queued')} |
| [40:4](src/TaskCenter.tsx#L40) | button | Внимание | onClick={()=>setFilter('attention')} |
| [41:4](src/TaskCenter.tsx#L41) | button | Ошибки | onClick={()=>setFilter('failed')} |
| [42:4](src/TaskCenter.tsx#L42) | button | Готово | onClick={()=>setFilter('completed')} |
| [43:4](src/TaskCenter.tsx#L43) | button | Все | onClick={()=>setFilter('all')} |
| [48:186](src/TaskCenter.tsx#L48) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [48:195](src/TaskCenter.tsx#L48) | summary | Ошибка | нет в этом узле; проверить родителя и вложенный компонент |
| [50:11](src/TaskCenter.tsx#L50) | button | Очистить завершённые | onClick={clearCompletedTasks} |
| [50:107](src/TaskCenter.tsx#L50) | button | Очистить ошибки | onClick={clearFailedTasks} |
| [50:211](src/TaskCenter.tsx#L50) | button | Очистить историю | onClick={clearTaskHistory} |
| [50:296](src/TaskCenter.tsx#L50) | button | Закрыть | onClick={closeTaskCenter} |

## src/UiErrorBoundary.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [39:12](src/UiErrorBoundary.tsx#L39) | section | динамически / вложено / нет текста | role="alert" |
| [43:7](src/UiErrorBoundary.tsx#L43) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [44:9](src/UiErrorBoundary.tsx#L44) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [48:9](src/UiErrorBoundary.tsx#L48) | button | Повторить | onClick={this.retry} |
| [49:29](src/UiErrorBoundary.tsx#L49) | button | На главную | onClick={this.props.onHome} |

## src/UpdateExperience.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [20:9](src/UpdateExperience.tsx#L20) | div | динамически / вложено / нет текста | role="dialog" |
| [26:35](src/UpdateExperience.tsx#L26) | button | Обновить сейчас | onClick={()=>void download()} |
| [26:126](src/UpdateExperience.tsx#L26) | button | Установить и перезапустить | onClick={installSafely} |
| [26:398](src/UpdateExperience.tsx#L26) | button | Позже | onClick={()=>setLater(identity)} |

## src/UploadCenter.tsx

Разделы реестра: HOME. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [26:134](src/UploadCenter.tsx#L26) | UploadCenterModal (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [111:11](src/UploadCenter.tsx#L111) | div | динамически / вложено / нет текста | onMouseDown={closeUploadCenter} |
| [111:95](src/UploadCenter.tsx#L111) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [112:504](src/UploadCenter.tsx#L112) | button | × | onClick={closeUploadCenter} |
| [118:998](src/UploadCenter.tsx#L118) | button | Проверить и продолжить | onClick={()=>resumePausedUpload(entry.spec.jobId)} |
| [118:1088](src/UploadCenter.tsx#L118) | button | Убрать из очереди | onClick={()=>removeQueuedUpload(entry.spec.jobId)} |
| [119:352](src/UploadCenter.tsx#L119) | button | Убрать из очереди | onClick={()=>removeQueuedUpload(entry.spec.jobId)} |
| [123:197](src/UploadCenter.tsx#L123) | button | Вся история | onClick={()=>{useApp.getState().setPage('youtube');closeUploadCenter();setTimeout(()=>window.dispatchEvent(new Event('vyron:youtube-history')),0)}} |
| [123:373](src/UploadCenter.tsx#L123) | button | динамически / вложено / нет текста | onClick={()=>void scanLocalSources()} |
| [123:539](src/UploadCenter.tsx#L123) | button | Очистить безопасные • | onClick={()=>setCleanupOpen(true)} |
| [123:1138](src/UploadCenter.tsx#L123) | details | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [123:1147](src/UploadCenter.tsx#L123) | summary | Технические сведения | нет в этом узле; проверить родителя и вложенный компонент |
| [125:16](src/UploadCenter.tsx#L125) | div | динамически / вложено / нет текста | onMouseDown={()=>!cleanupBusy&&setCleanupOpen(false)} |
| [125:101](src/UploadCenter.tsx#L125) | section | динамически / вложено / нет текста | onMouseDown={e=>e.stopPropagation()} |
| [125:1005](src/UploadCenter.tsx#L125) | button | Оставить всё | onClick={()=>setCleanupOpen(false)} |
| [125:1093](src/UploadCenter.tsx#L125) | button | динамически / вложено / нет текста | onClick={()=>void trashVerified()} |
| [130:125](src/UploadCenter.tsx#L130) | button | динамически / вложено / нет текста | onClick={openUploadCenter} |
| [131:9](src/UploadCenter.tsx#L131) | button | динамически / вложено / нет текста | onClick={openUploadCenter} |
| [136:279](src/UploadCenter.tsx#L136) | button | Открыть Upload Center → | onClick={openUploadCenter} |
| [136:427](src/UploadCenter.tsx#L136) | button | динамически / вложено / нет текста | onClick={openUploadCenter} |

## src/YouTubeCalendar.tsx

Разделы реестра: SCHED. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [3:81](src/YouTubeCalendar.tsx#L3) | MetadataPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |

## src/YouTubeCenter.tsx

Разделы реестра: YT / PUB. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [37:32](src/YouTubeCenter.tsx#L37) | CachedPublisher (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:97](src/YouTubeCenter.tsx#L37) | ExistingVideos (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:132](src/YouTubeCenter.tsx#L37) | MetadataTabs (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:181](src/YouTubeCenter.tsx#L37) | ScheduleWorkspace (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:218](src/YouTubeCenter.tsx#L37) | CommandCenter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:250](src/YouTubeCenter.tsx#L37) | ChannelRunway (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:286](src/YouTubeCenter.tsx#L37) | StatisticsCenter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:322](src/YouTubeCenter.tsx#L37) | ActivityHistory (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [37:368](src/YouTubeCenter.tsx#L37) | AccountsPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [39:92](src/YouTubeCenter.tsx#L39) | button | динамически / вложено / нет текста | onClick={()=>setQuotaOpen(x=>!x)}; type="button" |
| [39:324](src/YouTubeCenter.tsx#L39) | CachedGlobalCleanup (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [39:428](src/YouTubeCenter.tsx#L39) | CachedQuotaMeter (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [39:478](src/YouTubeCenter.tsx#L39) | CachedYouTubeChannelBar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [39:612](src/YouTubeCenter.tsx#L39) | button | динамически / вложено / нет текста | onClick={()=>setTab(id)}; type="button" |
| [39:842](src/YouTubeCenter.tsx#L39) | UiErrorBoundary (компонент) | динамически / вложено / нет текста | onHome={()=>setPage('dashboard')} |

## src/YouTubeChannelBar.tsx

Разделы реестра: YT / PUB. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [31:150](src/YouTubeChannelBar.tsx#L31) | ChannelAvatar (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [33:85](src/YouTubeChannelBar.tsx#L33) | input | динамически / вложено / нет текста | onChange={e=>setQuery(e.target.value)}; aria-label="Найти канал" |
| [33:206](src/YouTubeChannelBar.tsx#L33) | select | динамически / вложено / нет текста | onChange={e=>choose(e.target.value)}; aria-label="Активный YouTube-канал" |
| [33:340](src/YouTubeChannelBar.tsx#L33) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [33:441](src/YouTubeChannelBar.tsx#L33) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [33:501](src/YouTubeChannelBar.tsx#L33) | button | динамически / вложено / нет текста | onClick={()=>setDetailsOpen(x=>!x)} |
| [33:622](src/YouTubeChannelBar.tsx#L33) | button | динамически / вложено / нет текста | onClick={()=>void refreshActive()} |

## src/YouTubeDataPage.tsx

Разделы реестра: YT / PUB. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [3:77](src/YouTubeDataPage.tsx#L3) | AnalyticsPage (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |

## src/YouTubeDataTools.tsx

Разделы реестра: YT / PUB. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [18:373](src/YouTubeDataTools.tsx#L18) | select | динамически / вложено / нет текста | onChange={e=>setChannelId(e.target.value)} |
| [18:487](src/YouTubeDataTools.tsx#L18) | option | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [18:596](src/YouTubeDataTools.tsx#L18) | button | динамически / вложено / нет текста | onClick={analytics} |
| [18:827](src/YouTubeDataTools.tsx#L18) | button | динамически / вложено / нет текста | onClick={discover} |
| [18:1002](src/YouTubeDataTools.tsx#L18) | button | динамически / вложено / нет текста | onClick={refreshCompetitors} |

## src/apex-ui.tsx

Разделы реестра: SHELL. Файл в 6.1.17: не найден по этому пути.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [13:9](src/apex-ui.tsx#L13) | button | динамически / вложено / нет текста | ...props; type={type} |
| [21:9](src/apex-ui.tsx#L21) | Button (компонент) | динамически / вложено / нет текста | ...props; aria-label={label} |
| [32:3](src/apex-ui.tsx#L32) | input | динамически / вложено / нет текста | ...props |
| [33:76](src/apex-ui.tsx#L33) | small | динамически / вложено / нет текста | role="alert" |
| [44:3](src/apex-ui.tsx#L44) | select | динамически / вложено / нет текста | ...props |
| [45:76](src/apex-ui.tsx#L45) | small | динамически / вложено / нет текста | role="alert" |
| [54:3](src/apex-ui.tsx#L54) | input | динамически / вложено / нет текста | ...props; type="checkbox"; role={kind==='switch'?'switch':undefined} |
| [58:52](src/apex-ui.tsx#L58) | Choice (компонент) | динамически / вложено / нет текста | ...props |
| [59:50](src/apex-ui.tsx#L59) | Choice (компонент) | динамически / вложено / нет текста | ...props |
| [73:9](src/apex-ui.tsx#L73) | div | динамически / вложено / нет текста | role="alert" |
| [89:9](src/apex-ui.tsx#L89) | div | динамически / вложено / нет текста | role="tablist"; aria-label={label} |
| [89:118](src/apex-ui.tsx#L89) | button | динамически / вложено / нет текста | onClick={()=>onValueChange(item.id)}; onKeyDown={event=>keydown(event,index)}; type="button"; role="tab"; tabIndex={value===item.id?0:-1} |
| [104:66](src/apex-ui.tsx#L104) | Button (компонент) | Назад | onClick={()=>onPageChange(current-1)} |
| [104:199](src/apex-ui.tsx#L104) | Button (компонент) | Далее | onClick={()=>onPageChange(current+1)} |
| [107:9](src/apex-ui.tsx#L107) | div | динамически / вложено / нет текста | role="region"; aria-label="Действия с выбранными" |
| [110:9](src/apex-ui.tsx#L110) | div | динамически / вложено / нет текста | role="status" |
| [116:9](src/apex-ui.tsx#L116) | ModalPortal (компонент) | динамически / вложено / нет текста | onClose={onClose} |
| [116:86](src/apex-ui.tsx#L116) | section | динамически / вложено / нет текста | onMouseDown={event=>event.stopPropagation()}; role="dialog" |
| [117:40](src/apex-ui.tsx#L117) | IconButton (компонент) | динамически / вложено / нет текста | onClick={onClose} |

## src/main.tsx

Разделы реестра: SHELL. Файл в 6.1.17: есть.

| Позиция | Узел | Текст JSX | Обработчики / доступность / spread |
|---|---|---|---|
| [20:53](src/main.tsx#L20) | React.StrictMode (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |
| [20:71](src/main.tsx#L20) | App (компонент) | динамически / вложено / нет текста | нет в этом узле; проверить родителя и вложенный компонент |

## Границы

Просмотрены 73 файлов TSX; найдено 1418 узлов в файлах с JSX, включая вызовы компонентов. Файлов с отображаемыми узлами, отсутствующих по тому же пути в исходном Git-срезе: 1. Динамически созданные DOM-узлы, нативные меню и диалоги, код вне src/*.tsx, привязки через события в эффектах, автоматизированные действия и соответствия после перемещения компонентов требуют отдельного сопоставления. Список нельзя использовать как свидетельство сохранности функциональности или безопасности.
