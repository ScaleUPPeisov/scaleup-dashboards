#!/usr/bin/env python3
from pathlib import Path
import re,sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src/VyronReleaseHistory.tsx'
s=p.read_text()

def block(version,date,title,items):
    lines=[f" {{version:'{version}',date:'{date}',title:'{title}',items:["]
    lines += [f"  '{x}'," for x in items]
    lines += [" ]},"]
    return '\n'.join(lines)

def replace(version,new_block):
    global s
    pat=re.compile(r"\n \{version:'"+re.escape(version)+r"'.*?\n \]\},(?=\n \{version:)",re.S)
    s2,n=pat.subn('\n'+new_block,s,count=1)
    if n!=1: raise SystemExit(f'cannot replace release {version}: {n}')
    s=s2

replace('2.0.5',block('2.0.5','05.09.2026','Updater Discovery Fix',[
 'Исправлен случай, когда установленная версия показывала себя актуальной после публикации нового релиза.',
 'Каждая проверка updater отправляет Cache-Control: no-cache, no-store, max-age=0 и Pragma: no-cache.',
 'Основной endpoint обновлений идёт через GitHub latest release asset; raw GitHub endpoint сохранён как резервный.',
 'Добавлен regression-контракт на anti-cache updater policy.',
 'Исправление массового выбора из 2.0.4 сохранено без функциональных изменений.'
]))
replace('2.0.4',block('2.0.4','05.09.2026','Select All Stability Fix',[
 'Исправлен чёрный экран после «Выбрать все здесь» при массовом выборе YouTube-видео до загрузки DOCX.',
 'Schedule preview корректно работает с выбранными видео, даже когда для них ещё нет строк metadata.',
 'Добавлен regression на 99 выбранных видео и 0 DOCX-строк.',
 'Массовый выбор остаётся полностью локальной операцией и не расходует YouTube API quota.',
 'OAuth discovery и browser-free YouTube workflow из 2.0.3 сохранены без изменений.'
]))
replace('2.0.3',block('2.0.3','05.09.2026','OAuth Video Discovery',[
 'Для поиска видео больше не требуются расширения Chrome, Brave или Safari.',
 'Единственный источник авторизации — уже подключённый OAuth-профиль YouTube в VYRON.',
 'Полная история берётся из uploads playlist с пагинацией; playlistItems запрашиваются со snippet, contentDetails и status.',
 'Свежие owned-видео дополнительно проверяются одним официальным forMine-запросом.',
 'Если videos.list ещё не раскрывает owned resource, найденная строка uploads playlist больше не выбрасывается из списка.',
 'Браузерный Studio Draft Bridge удалён из основного Metadata workflow.'
]))
replace('2.0.2',block('2.0.2','05.09.2026','Studio Draft Bridge',[
 'VYRON видит строки «Черновик / Draft», которые ещё не доступны обычному YouTube Data API.',
 'Данные передаются из видимой YouTube Studio только локально через 127.0.0.1:19470.',
 'Cookies, OAuth-токены и скрытые YouTube Studio API не читаются и не используются.',
 'Обычный API sync сохранён отдельно и продолжает использовать uploads playlist без search.list.',
 'Черновики Studio показываются отдельным безопасным блоком и не выдаются за готовые API video resources.'
]))
replace('2.0.1',block('2.0.1','04.09.2026','YouTube Sync Hotfix',[
 'Исправлены quota rollover и зависший provider guard.',
 'Ручная «Синхронизировать» при доступном локальном ledger выполняет один реальный API probe.',
 'Старые reservations предыдущего Pacific-day больше не блокируют новое окно.',
 'PRIVATE остаётся на дешёвом uploads playlist pipeline без search.list.',
 'Publish Workspace и resumable recovery базовой 2.0.0 сохранены.'
]))

missing=[f'1.0.{i}' for i in range(1,16) if f"version:'1.0.{i}'" not in s]
if len(missing)!=15: raise SystemExit(f'unexpected pre-existing 1.0.x history: missing={missing}')

legacy=[
block('1.0.15','03.09.2026','ENDLUME Image Validation Hotfix',[
 'Исправлена ложная ошибка Production Manager «изображений: 2, должно быть 1».',
 'Удалено ограничение «в проекте должно быть ровно одно изображение»: 1, 2 и больше изображений допустимы.',
 'Сначала проверяется точный image_path из batch manifest; это исключает ложный повторный подсчёт изображения.',
 'Если manifest image перемещён или переименован, допускается другое непустое поддерживаемое изображение в папке проекта.',
 'Скрытые файлы вроде .phantom.png не считаются fallback-изображением.',
 'Если пригодного изображения действительно нет, проект блокируется с ошибкой «изображение не найдено».',
 'Multi-image transitions и выбор последовательности изображений остаются ответственностью ENDLUME.',
 'Уже созданные batch пересобирать не требуется: после обновления их можно повторно проверить и передать в ENDLUME.'
]),
block('1.0.14','03.09.2026','Schedule Patterns, Flexible DOCX & A-Z Channels',[
 'Добавлен календарный режим публикаций 3 дня видео / 1 день пауза (3/1).',
 'Добавлен общий pattern engine для publish/pause patterns; pattern привязан к anchor date конкретного канала.',
 'Старый режим «каждые N дней» сохранён для каналов со старым cadenceDays.',
 'Metadata preview показывает VIDEO и ПАУЗА и применяет те же даты, которые показаны в preview.',
 'PUBLISH TIME из DOCX переопределяет только время конкретного ролика; дата берётся из выбранной schedule strategy.',
 'DOCX validation использует правило Word records >= реально выбранных видео; лишние записи допустимы.',
 'Выпадающие списки каналов отсортированы A → Z, case-insensitive и numeric-aware; операционный порядок Runway/Command Center не меняется.',
 'Preview, schedule mode, DOCX validation и A-Z сортировка не добавляют скрытых YouTube API-запросов.'
]),
block('1.0.13','03.09.2026','Recovery, Smart Schedule & Notifications',[
 'Добавлен единый Notification Center: success, info, warning, error, очередь и защита от дублей.',
 'Command Center показывает готовность раздельно: N / план и процент.',
 'Updater явно уведомляет о новой версии и об успешной установке после перезапуска.',
 'При прерванной Production-сборке на старте находится persisted checkpoint и показывается 60-секундный recovery dialog.',
 'Готовые проекты не пересоздаются; незавершённая .tmp-папка пересобирается атомарно.',
 'Metadata автоматически продолжает расписание конкретного канала от последней локально известной отложенной даты.',
 'DOCX PUBLISH TIME сохранён; fallback-время интерпретируется как KRAT (+07) независимо от VPN и часового пояса Mac.',
 'После Metadata локальный Existing Videos cache обновляется сразу без скрытой повторной YouTube-синхронизации.'
]),
block('1.0.12','03.09.2026','Production UX & Storage Fix',[
 'Открытие папок и файлов унифицировано через один backend Finder/reveal_path pipeline.',
 'Folder picker открывается от текущего реально сохранённого пути для музыки и Production root.',
 'Backend канонизирует Production storage path, чтобы UI сохранял и показывал фактическое расположение.',
 'Планирование Production расширено до 10 000 проектов без искусственного ограничения 1000.',
 'Production Manager разделён на представления «Материалы» и «Сборщик», сохраняя общий локальный state.',
 'Режимы распределения приведены к поддерживаемым локальным вариантам без изменения YouTube-контура.',
 'Исправления storage/UX выполняются локально и не добавляют YouTube API-вызовов.'
]),
block('1.0.11','03.09.2026','Project Storage Fix',[
 'В Production всегда видна фактическая папка, где будут создаваться новые проекты.',
 'Добавлен прямой выбор основной папки проектов и отдельной папки текущего канала.',
 'Ручной импорт в «Материалы» создаёт VIDEO_XXX в выбранной Production-папке, а не принудительно в старом Workspace.',
 'Autopilot использует тот же выбранный Production root для новых VIDEO_XXX.',
 'Перед созданием проекта проверяется существование и доступ на запись; отключённый внешний SSD не вызывает тихий fallback.',
 'Удаление ручных проектов учитывает их фактическое расположение; существующие проекты автоматически не переносятся.'
]),
block('1.0.10','03.09.2026','macOS Updater EXDEV Hotfix',[
 'Исправлена ошибка Cross-device link (os error 18) при установке обновления на macOS.',
 'Перед downloadAndInstall сравнивается том системного TMPDIR и том, где расположен VYRON.app.',
 'Если тома разные, временная папка updater создаётся рядом с VYRON.app на том же диске.',
 'Штатная Tauri-проверка подписи, скачивание и установка сохранены.',
 'При запуске с read-only DMG вместо сырого os error 18 показывается инструкция перенести VYRON.app в Applications.'
]),
block('1.0.9','03.09.2026','Production Storage',[
 'Добавлен блок «Хранилище проектов» с фактическим путём, типом диска, доступом на запись и свободным местом.',
 'Основную папку новых Production batch можно выбрать системным macOS folder picker.',
 'Поддерживаются внутренний SSD и внешние SSD/HDD в /Volumes.',
 'Для отдельного канала можно задать собственный Production Root или наследовать общий.',
 'После сборки показывается фактический путь batch с открытием в Finder.',
 'Существующие batch не перемещаются; выбранный диск влияет только на новые batch-папки.',
 'Если внешний диск отключён или недоступен для записи, новая сборка блокируется без тихого fallback.'
]),
block('1.0.8','03.09.2026','macOS Downloads Permission Hotfix',[
 'В macOS bundle добавлен NSDownloadsFolderUsageDescription для системного доступа к ~/Downloads.',
 'Если App Sandbox уже используется, существующие entitlements сохраняются и получают read-only доступ к Downloads; sandbox не включается принудительно.',
 'Pipeline 1.0.7 сохранён: существующие изображения не попадают автоматически в seen, остаются recursive scan и file stability checks.',
 'Release gate проверяет privacy-key непосредственно в собранном VYRON.app/Contents/Info.plist.',
 'Bundle identifier, updater public key и endpoint не меняются.',
 'Для ранее отклонённого разрешения добавлена понятная инструкция через «Файлы и папки» macOS.'
]),
block('1.0.7','03.09.2026','Downloads Image Collector Hotfix',[
 'Исправлена причина, из-за которой изображения, уже лежащие в ~/Downloads до «НАЧАТЬ СБОР», попадали в seen и никогда не импортировались.',
 'Существующие PNG/JPG/JPEG/WEBP при старте сессии стали нормальными кандидатами на импорт.',
 'Дедупликация учитывает только изображения, реально сохранённые текущей import-сессией.',
 'Сохранены recursive scan, проверка стабильности файла, Unicode/кириллица и COPY-семантика.',
 'Добавлена локальная backend-диагностика старта и успешного импорта.',
 'Автосбор остаётся полностью локальным и не выполняет YouTube API-запросов.'
]),
block('1.0.6','03.09.2026','Production Autobuild',[
 'Добавлено единое выбранное состояние канала в Production.',
 'Production Manager v2 сохраняет канал, вкладку, настройки и выбор проектов между переходами и перезапусками.',
 'Добавлен рекурсивный поиск изображений в Downloads и вложенных папках с защитой от 0-byte и недокачанных файлов.',
 'Добавлены режимы распределения изображений: равномерно, случайно, по алфавиту и без повторов.',
 'Количество проектов настраивается в диапазоне 1–100 с быстрыми значениями 10/15/20/30.',
 'Добавлены массовое выделение, удаление выбранных проектов и очистка текущего списка.',
 'ENDLUME handoff получил подтверждение получения, recovery batch и idempotent повторное выполнение.'
]),
block('1.0.5','03.09.2026','Image Import Reliability',[
 'Исправлено зависание «СБОР ИДЁТ» при скачивании изображений в Downloads.',
 'Устранена гонка: файл больше не считается обработанным до завершения скачивания.',
 'VYRON ждёт стабильный ненулевой файл, копирует во временный и фиксирует импорт только после проверки полного размера.',
 'Нулевые и ещё дописывающиеся файлы повторно проверяются, а не теряются.',
 'Ошибка доступа macOS к Downloads показывает понятное сообщение о разрешении «Файлы и папки».',
 'После перезапуска устаревшее состояние «СБОР ИДЁТ» не выдаётся за живой watcher; UI перечитывает import-session.'
]),
block('1.0.4','02.09.2026','Production Manager',[
 'Добавлен локальный Production Manager / Автосборка для массовой подготовки VYRON → ENDLUME.',
 'Добавлена import-сессия канала для изображений из Downloads, безопасная нумерация и отдельная музыкальная библиотека.',
 'Количество проектов и песен на проект задаётся точно; музыка распределяется равномерно, случайно или без повторов.',
 'Fingerprint защищает от полностью одинаковых музыкальных последовательностей; при нехватке библиотеки песни переиспользуются с другим порядком.',
 'Проект создаётся плоско: изображение и все аудиофайлы без вложенных папок, с batch.json/status.json/checkpoint/history.',
 'Незавершённая подготовка восстанавливается после перезапуска; build request идемпотентный.',
 'Передача manifest в ENDLUME и локальный status bridge не используют YouTube API.'
]),
block('1.0.3','02.09.2026','Command Center',[
 'Добавлен локальный VYRON Command Center для ежедневного управления сетью каналов без фонового YouTube API.',
 'Attention Center показывает каналы, требующие внимания.',
 'Production Forecast рассчитывает производственное окно, готовность к YouTube и нехватку SEO.',
 'Network Plan формирует общую очередь каналов по runway и локальной готовности Production.',
 'Smart Batch Builder создаёт локальную пачку VIDEO_001...VIDEO_N и даты после последнего подтверждённого Scheduled-видео.',
 'Command Center использует только локальные Channel Runway, Production jobs, Quota Planner и versioned storage.'
]),
block('1.0.2','02.09.2026','Channel Runway',[
 'Добавлен локальный Channel Runway / План каналов для контроля запаса Scheduled-публикаций.',
 'По каждому каналу показываются последняя подтверждённая Scheduled-дата, запас в днях и дата подготовки следующей пачки.',
 'Каналы сортируются по срочности и риску; добавлена общая сводка сети и рекомендуемый темп.',
 'Ежедневный пересчёт выполняется локально в 06:00 Asia/Krasnoyarsk; пропущенный пересчёт выполняется при следующем запуске.',
 'Данные хранятся в versioned storage key vyron:channel-runway:v1.',
 'Scheduled учитывает только подтверждённые private-видео с будущим publishAt; пустой cache показывается как «Нет данных».',
 'YouTube API вызывается только после явного «ОБНОВИТЬ РАСПИСАНИЕ».'
]),
block('1.0.1','01.09.2026','Local Quota Reset',[
 'Quota Meter показывает «Сброс по вашему времени», а не только техническое 00:00 PT.',
 'Следующий 00:00 America/Los_Angeles автоматически переводится в системный часовой пояс macOS.',
 'Переход PDT/PST учитывается автоматически, время не захардкожено.',
 'Для Красноярска отображается примерно 14:00 летом и 15:00 зимой.',
 'Техническая подпись 00:00 PT сохранена, а сообщение об исчерпании quota показывает точные локальные дату и время.',
 'Zero Quota, Production, Existing Videos, Metadata Draft, OAuth/updater identity и ENDLUME сохранены без изменений.'
])
]
anchor="\n {version:'1.0.0'"
if anchor not in s: raise SystemExit('1.0.0 anchor missing')
s=s.replace(anchor,'\n'+'\n'.join(legacy)+anchor,1)

versions=re.findall(r"version:'([0-9]+\.[0-9]+\.[0-9]+)'",s)
expected=[f'1.0.{i}' for i in range(16)] + ['1.1.0','1.2.0'] + [f'2.0.{i}' for i in range(11)]
for v in expected:
    if versions.count(v)!=1: raise SystemExit(f'history version {v}: count={versions.count(v)}')
if len(versions)!=len(expected): raise SystemExit(f'unexpected history versions: {versions}')

p.write_text(s)
print(f'VYRON 2.0.10 RELEASE HISTORY ACCURACY: PASS ({len(versions)} releases)')
