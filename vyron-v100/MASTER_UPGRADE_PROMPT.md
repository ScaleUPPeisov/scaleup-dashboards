# VYRON — MASTER OPERATIONAL OVERHAUL PROMPT

## 0. Контекст и запрет на переписывание

Ты дорабатываешь существующее приложение **VYRON — AUTONOMOUS YOUTUBE OS** поверх текущей рабочей ветки 0.9.x.

КРИТИЧЕСКИ:
- НЕ создавать VYRON заново.
- НЕ переписывать рабочий проект с нуля.
- НЕ менять bundle identifier `studio.channelflow.desktop`.
- НЕ удалять существующие OAuth profiles, refresh tokens, channels, local state, workspace, updater, queues, backup/undo и verify-after-update.
- НЕ ломать Google OAuth, YouTube Data API, YouTube Analytics API, Revenue Analytics, ENDLUME integration и подписанный Tauri updater.
- Любая новая схема данных должна иметь безопасную миграцию со старой 0.9.x.
- Никаких fake/demo цифр в production UI.
- Никаких кнопок без реальных handlers.
- Любая bulk write операция YouTube: backup → ownership guard → update → read-back verification.

Главный UX-принцип: **сложность внутри backend, интерфейс простой и понятный без обучения**.

---

# 1. БЛОКЕР: DOCX / SEO PACK IMPORT

Текущая ошибка: в VYRON 0.9.4 часть UI всё ещё показывает старый импорт `JSON / TXT / CSV`; Word/DOCX не интегрирован во все реальные entry points.

Исправить полностью:
- `.docx` доступен и в `YouTube → Загруженные`, и в `YouTube → Метаданные`.
- File picker: `.docx,.json,.txt,.csv`.
- DOCX читать через Mammoth `extractRawText`, никогда через `File.text()`.
- Поддерживать структуру:
  - `VIDEO N`
  - `TITLE:`
  - `DESCRIPTION:`
  - `TAGS:`
  - `PUBLISH TIME:`
- Перед применением показывать preview mapping:
  - `VIDEO 1 → конкретный YouTube videoId/title`
  - `VIDEO 2 → ...`
- Строгая проверка 1:1 для DOCX batch: выбранных роликов = блоков документа; нет пропусков и дублей VIDEO N.
- При ошибке ничего не менять.
- После импорта визуально показывать какие поля изменятся.
- Импорт только подставляет локальный draft. Отправка в YouTube отдельным подтверждением.

Acceptance gate:
1. Реальный DOCX можно выбрать.
2. 30 блоков распознаются как 30.
3. Mapping виден пользователю.
4. Невыбранные видео не меняются.
5. После restart draft/selection не перескакивает на другой канал.

---

# 2. ДОБАВЛЕНИЕ YOUTUBE-КАНАЛА: ВЫБОР БРАУЗЕРА

До начала Google OAuth показывать компактное красивое окно:
**«Через какой браузер открыть Google?»**

На macOS обнаруживать установленные браузеры и показывать только доступные:
- Браузер по умолчанию
- Safari
- Google Chrome
- Firefox
- Brave
- Arc
- Microsoft Edge
- Yandex Browser
- Opera

Требования:
- OAuth URL открывается именно в выбранном браузере.
- Если браузер недоступен — понятная ошибка + выбор другого.
- Запомнить preferred browser отдельно для каждого OAuth profile/channel.
- При reconnect по умолчанию предлагать ранее выбранный браузер.

После успешного OAuth автоматически:
1. получить реальный YouTube `channelId`, title и thumbnail;
2. найти VYRON channel с таким `youtubeChannelId`;
3. если найден — привязать профиль автоматически;
4. если не найден — создать VYRON channel сразу из реальных YouTube данных;
5. исключить обычный сценарий ручного выбора OAuth из dropdown.

Канал нельзя считать добавленным до успешного OAuth и получения реального channelId.

---

# 3. YOUTUBE → ЗАГРУЖЕННЫЕ: НЕ СМЕШИВАТЬ СТАТУСЫ

Основной рабочий режим — подготовка неопубликованных роликов.

Фильтры должны быть отдельными:
- `PRIVATE` — private без publishAt, по умолчанию;
- `SCHEDULED` — private с publishAt;
- `PUBLIC`;
- `UNLISTED`;
- `ALL` — диагностический режим.

Нельзя смешивать Public и Private в основном batch workflow.

Добавить batch actions:
- **Выбрать все** — только текущий фильтр/видимые результаты;
- **Последние 30 Private**;
- **Все Private**;
- **Снять все**.

Выбор роликов:
- checkbox visual size компактный, но hit-area минимум 40×40 px;
- клик по безопасной области строки/карточки также переключает selection;
- клик по кнопкам, ссылкам, редактору и datetime не должен менять selection;
- выбранная карточка заметно подсвечивается;
- sticky batch bar показывает `Выбрано N` даже при скролле далеко вниз;
- отдельная кнопка `Показать только выбранные`.

---

# 4. 100% ТОЧНОСТЬ СИНХРОНИЗАЦИИ YOUTUBE

Использовать uploads playlist + pagination до конца requested scope.

После sync показывать audit:
- YouTube найдено
- VYRON получено
- Private
- Scheduled
- Public
- Unlisted
- thumbnails ok/error
- last sync

Правила:
- `received != expected` → красный incomplete state; bulk write блокируется.
- при limit >= youtubeFound должно быть `received == youtubeFound`.
- дедупликация строго по videoId.
- ownership: каждый video.channelId должен совпадать с OAuth profile.channelId.
- фильтры строятся из фактического privacyStatus + publishAt.
- thumbnail failure не должен ломать метаданные/синхронизацию.
- Retry thumbnails отдельно.

Перед любой массовой отправкой повторно проверять channel/profile ownership.

---

# 5. КАНАЛЫ: АВТОМАТИЧЕСКАЯ ГИДРАТАЦИЯ

Экран `Каналы` не должен показывать пустые `—`, если OAuth доступен.

При startup / OAuth connect / открытии Channels:
- автоматически подтянуть public stats через Data API;
- автоматически подтянуть Analytics для авторизованных собственных каналов;
- автоматически обновить title/thumbnail/channelId/country/publishedAt где доступно;
- показать `Last sync` и `Data through` отдельно.

Собственные метрики:
- Subscribers
- Total Views
- Views today/7d/28d/90d
- Watch time
- Avg duration
- Avg %
- Subscribers gained/lost/net
- Likes/comments/shares
- Revenue 28d
- RPM 28d

Не утверждать real-time там, где YouTube Analytics API имеет задержку. Показывать фактическую дату последней доступной строки данных и время последней синхронизации.

Убрать обязательную ручную кнопку как единственный способ появления данных. Manual refresh остаётся как override.

---

# 6. АНАЛИТИКА СОБСТВЕННЫХ КАНАЛОВ

Аналитика должна загружаться автоматически для всех OAuth channels при startup и далее по configurable refresh interval.

Экран должен работать сразу после подключения канала.

Периоды:
- Сегодня
- Вчера
- 7 дней
- 28 дней
- 90 дней
- 365 дней
- Всё время

Обязательно:
- общий Network Summary;
- сравнение каналов;
- detail по каналу;
- динамика views/revenue/watch/subscribers;
- top videos;
- weak videos;
- geography/traffic/audience если API реально возвращает;
- реальный Revenue/RPM только при monetary scope;
- отображать причину отсутствия данных, а не просто `—`.

Добавить auto refresh status:
- `Обновлено X мин назад`
- `Данные YouTube доступны по YYYY-MM-DD`
- `Следующая проверка через ...`

---

# 7. КОНКУРЕНТЫ: ЖИВАЯ СИСТЕМА, А НЕ СПИСОК ИЗ 10 КАНАЛОВ

Нельзя один раз найти 10 каналов и показывать их месяц без обновлений.

Для каждого собственного канала:
- хранить competitor pool, например 20–50 каналов;
- discovery обновлять периодически (например ежедневно), а не затирать историю;
- публичные snapshots каждого конкурента обновлять configurable interval (например 30–60 минут, с учетом YouTube quota);
- сохранять history, чтобы считать velocity.

Показывать:
- subscribers
- total views
- video count
- recent average views
- views/day velocity
- subscribers/day velocity
- upload frequency
- last upload
- best recent videos
- growth 7d/28d
- relative position пользователя против конкурента.

Доход конкурента YouTube публично не предоставляет. Поэтому:
- НЕ показывать его как «реальный доход»;
- добавить **Estimated revenue range**;
- формула основана на публичных view velocity / recent views × configurable niche RPM range;
- label всегда `ОЦЕНКА`, tooltip с формулой;
- пользователь может задать RPM диапазон по нише;
- отдельный motivational target: `Если достичь X views/28d при RPM $A–$B → ~$Y–$Z`.

Добавить leaderboard / motivation:
- `Ты vs медиана конкурентов`
- `До TOP-5 не хватает ... views/day`
- `Лидер растёт +.../д`
- `Твоя цель 28d`.

---

# 8. AUTOPILOT: ПОНЯТНАЯ МОЩНОСТЬ И ЛЮБОЕ ЧИСЛО ПРОЕКТОВ

Существующих OFF / ASSISTED / FULL сохранить, но объяснить человечески.

Добавить параметр plan generation:
- `Создать N проектов`, где N от 1 до 1000;
- быстрые presets: 10 / 30 / 50 / 100;
- выбор одного канала / нескольких / всех;
- cadence отдельно на канал;
- target buffer days как альтернативный режим.

Перед созданием показать preview:
- канал;
- сколько проектов будет создано;
- номера VIDEO_XXX;
- диапазон будущих дат;
- потребность в изображениях/музыке.

Autopilot dashboard:
- OFF = только sync/analytics;
- ASSISTED = система готовит, пользователь подтверждает YouTube writes;
- FULL = после явной настройки разрешены auto pipeline/write операции.

Нельзя скрывать, что именно FULL будет делать.

---

# 9. ГЛАВНАЯ: ЗАМЕНИТЬ «БЕЛИБЕРДУ» НА MORNING CONTROL CENTER

Главная должна отвечать на 5 вопросов за 5 секунд:
1. Всё ли работает?
2. Что требует моего внимания?
3. Что сегодня происходит с каналами?
4. Что будет опубликовано следующим?
5. Растём ли мы и сколько заработали?

Структура:
- System status: OAuth / API / updater / ENDLUME / errors;
- Today: views, revenue, subscribers net;
- Next publications: ближайшие 5;
- Attention Inbox: ошибки, нет метаданных, нет image/music, OAuth reconnect;
- Channel Pulse: компактные строки каналов с views 28d, delta, revenue, next publish;
- Autopilot activity: последние действия и следующий цикл;
- Competitor Pulse: кто из конкурентов резко ускорился.

Убрать технические блоки, которые не помогают принять решение.

---

# 10. ПРОИЗВОДСТВО: ПЕРЕСТРОИТЬ В PIPELINE

Сохранить существующую backend очередь и ENDLUME интеграцию, но UI сделать понятным.

Pipeline stages:
`Нужно изображение → Нужно аудио → Готов к ENDLUME → Рендер → Готов к YouTube → Запланирован`.

Показывать Kanban/list toggle или компактные stage counters.

Для каждой задачи:
- канал
- VIDEO number
- image ready?
- tracks x/y
- ENDLUME status
- final.mp4 ready?
- metadata ready?
- planned publish date
- error/next action

Кнопка `Создать проекты` вместо неоднозначного `Заполнить план`.

Batch import images/music должен явно показать куда они распределятся до выполнения.

---

# 11. YOUTUBE: AUTO PROFILE BINDING

В `YouTube → Загруженные` OAuth профиль должен определяться автоматически из выбранного канала.

Обычный пользователь не должен каждый раз выбирать `Канал` + `OAuth` вручную.

Dropdown OAuth убрать из основного интерфейса; оставить только Advanced/Diagnostics.

Если selected channel не имеет OAuth:
- показать одну понятную CTA `Подключить YouTube`;
- после OAuth автоматически вернуться к этому каналу и начать sync.

---

# 12. НАСТРОЙКИ И ENDLUME — НИЧЕГО НЕ ТЕРЯТЬ

Существующие настройки пользователя должны сохраняться между версиями.

ENDLUME section восстановить/расширить, не сводить только к пути приложения.

Хранить:
- путь ENDLUME Studio;
- workspace / RenderQueue;
- auto-open behavior;
- project naming;
- track/image rules;
- render handoff preferences;
- любые существующие ранее сохранённые поля — мигрировать, не удалять.

Добавить Settings migration test: update 0.9.x → новая версия не теряет старые поля.

---

# 13. ДИЗАЙН / UX

Структуру sidebar сохранить:
- Главная
- Каналы
- Производство
- YouTube
- Аналитика
- Конкуренты
- Настройки

Не делать новый визуальный продукт с нуля.

Доработать текущий стиль:
- более компактные кнопки;
- единая высота controls;
- primary action только одна на контекст;
- secondary actions менее массивные;
- destructive красный только для опасных действий;
- нормальные hover/focus/pressed states;
- плавность 60 FPS;
- sticky bulk toolbar;
- большие hit targets без визуально огромных кнопок;
- selected state хорошо заметен;
- таблицы/списки сканируются по вертикали;
- русская локализация основного UI, английские API-термины только где оправдано.

---

# 14. BACKGROUND REFRESH ENGINE

После запуска VYRON автоматически:
1. health check OAuth profiles;
2. hydrate channels;
3. refresh own public stats;
4. refresh Analytics по расписанию;
5. refresh competitor public snapshots по расписанию;
6. check production filesystem/ENDLUME queue;
7. check updater.

Использовать throttling, cache и quota-aware scheduler. Не запускать 100 конкурентных запросов одновременно.

UI обязан показывать:
- что сейчас обновляется;
- последнюю успешную синхронизацию;
- ошибку только если она требует внимания.

---

# 15. RELEASE / QA GATES

Релиз запрещено публиковать, пока не зелёные:
- unit tests;
- TypeScript production build;
- Rust ARM64 check;
- updater signing;
- private-key leakage scan;
- state migration tests;
- OAuth channel isolation tests;
- DOCX real-flow test;
- YouTube pagination/dedup tests;
- status classification tests Private/Scheduled/Public;
- selection hit-area/batch-selection component tests;
- no-dead-buttons audit.

Manual smoke checklist:
1. Existing 0.9.x state loads unchanged.
2. Existing OAuth profiles remain connected.
3. Add channel → browser picker → OAuth → auto-bind.
4. Channel stats appear without manual binding.
5. Analytics begins loading automatically.
6. YouTube sync returns exact expected count.
7. Private filter does not contain Public.
8. Select all visible works.
9. Whole safe selection area is clickable.
10. DOCX imports and shows exact 1:1 mapping.
11. Bulk YouTube update changes only selected videoIds.
12. Competitor snapshots refresh and history grows.
13. Estimated competitor revenue is explicitly labelled estimate.
14. Autopilot can create 10 and 100 projects without hardcoded cap.
15. ENDLUME settings survive update.
16. Updater discovers next signed release and can install/restart.

---

# 16. DEFINITION OF DONE

VYRON считается готовым не когда «экран нарисован», а когда пользователь может:

**подключить любой из множества Google/YouTube аккаунтов через нужный браузер → канал появляется сам → данные и аналитика подтягиваются автоматически → пользователь видит понятную Главную → может создать 10/30/100 проектов → подготовить материалы → импортировать DOCX SEO pack → выбрать нужные Private видео без путаницы → назначить даты → отправить только выбранные ролики → увидеть подтверждение YouTube → параллельно видеть живую динамику конкурентов и понятную оценку цели/дохода.**
