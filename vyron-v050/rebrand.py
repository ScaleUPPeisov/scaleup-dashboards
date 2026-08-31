from pathlib import Path
import json

ROOT = Path('.vyron-v050')

# Visible branding and version strings.
for rel in [
    'src/App.tsx','src/api.ts','src/styles.css','index.html',
    'src-tauri/src/license.rs','src-tauri/src/lib.rs','src-tauri/src/youtube.rs',
    'src-tauri/capabilities/default.json','RELEASE_NOTES.md'
]:
    p = ROOT / rel
    s = p.read_text()
    s = s.replace('CHANNELFLOW', 'VYRON').replace('ChannelFlow', 'VYRON')
    s = s.replace('0.4.0', '0.5.0')
    p.write_text(s)

# JS package branding/version.
p = ROOT / 'package.json'
d = json.loads(p.read_text())
d['name'] = 'vyron'
d['version'] = '0.5.0'
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# Tauri/macOS branding. Keep the legacy identifier intentionally so the new
# app reads the existing license/state/OAuth storage from ChannelFlow 0.4.
p = ROOT / 'src-tauri/tauri.conf.json'
d = json.loads(p.read_text())
d['productName'] = 'VYRON'
d['version'] = '0.5.0'
for w in d.get('app', {}).get('windows', []):
    w['title'] = 'VYRON'
d['bundle']['longDescription'] = 'VYRON plans, prepares, renders and publishes content across a network of YouTube channels.'
d['bundle']['macOS']['bundleName'] = 'VYRON'
d['plugins']['updater']['endpoints'] = [
    'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json',
    'https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/channelflow-updates/latest.json'
]
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# Rust package metadata; keep internal crate/lib names for compatibility.
p = ROOT / 'src-tauri/Cargo.toml'
s = p.read_text()
s = s.replace('version = "0.4.0"', 'version = "0.5.0"', 1)
s = s.replace('description = "ChannelFlow Content Operating System"', 'description = "VYRON Content Operating System"')
s = s.replace('authors = ["ChannelFlow"]', 'authors = ["VYRON"]')
p.write_text(s)

# Free-first UX: ChatGPT Plus + Metadata Inbox is the primary path.
p = ROOT / 'src/App.tsx'
s = p.read_text()
s = s.replace('VYRON 0.4</span>', 'VYRON 0.5</span>')
s = s.replace("<span>OpenAI <b>{s.openaiApiKey?'готов':'не задан'}</b></span>", "<span>Метаданные <b>{s.openaiApiKey?'AI API подключён':'ChatGPT / Inbox'}</b></span>")
s = s.replace(
    'Для полностью автоматической публикации: подключить Google OAuth в Настройках и привязать профиль к каналу. Для AI-метаданных: добавить OpenAI API Key. Для нулевого ручного рендера ENDLUME должен читать RenderQueue — VYRON уже создаёт эту очередь.',
    'Для полностью автоматической публикации: подключить Google OAuth в Настройках и привязать профиль к каналу. Метаданные можно бесплатно импортировать из обычного ChatGPT Plus через Metadata Inbox; платный OpenAI API не обязателен. Для нулевого ручного рендера ENDLUME должен читать RenderQueue — VYRON уже создаёт эту очередь.'
)
s = s.replace('OpenAI — автономные метаданные', 'OpenAI API — опционально')
s = s.replace(
    'API Key хранится локально. Используется Responses API; это отдельный API-доступ, не авторизация обычного ChatGPT.',
    'Не требуется для бесплатного режима. Оставь пустым и используй ChatGPT Plus → Metadata Inbox. API нужен только если позже захочешь полностью фоновую генерацию без открытия ChatGPT.'
)
s = s.replace("<button onClick={()=>patch({openaiModel:'gpt-5.6-luna'})}>GPT-5.6 LUNA</button>", "<button onClick={()=>patch({openaiModel:''})}>ОЧИСТИТЬ</button>")
s = s.replace(
    'В подключённом GitHub отдельного репозитория MusicVault AI сейчас не найдено. До его следующего обновления VYRON уже принимает музыку через Inbox каждого канала.',
    'VYRON принимает музыку через Inbox каждого канала. Следующий шаг — кнопка «Отправить в VYRON» прямо в MusicVault AI, чтобы не переносить файлы вручную.'
)
s = s.replace('Toggle label="AI-метаданные" text="OpenAI создаёт title/description/tags."', 'Toggle label="AI-метаданные (опционально)" text="Только если вручную подключён отдельный API. Для бесплатного режима используй ChatGPT Plus → Metadata Inbox."')
s = s.replace('30.08.2026 • 0.5.0', '31.08.2026 • 0.5.0')
old = '<ul><li>Autonomous Pipeline и восстановление очереди после перезапуска.</li><li>Автораспределение музыки и изображений через Inbox.</li><li>OpenAI Responses API для title / description / tags.</li><li>Google Desktop OAuth + YouTube resumable upload + publishAt.</li><li>RenderQueue bridge для ENDLUME.</li><li>Metadata Inbox JSON/TXT/CSV сохранён как переходный режим.</li></ul>'
new = '<ul><li>Новое имя приложения: VYRON — CONTENT OS.</li><li>VYRON.app / новый фирменный интерфейс и системные названия.</li><li>Автоматическая миграция Documents/ChannelFlow → Documents/VYRON без потери проектов.</li><li>Сохраняются лицензия, каналы, очередь, OAuth-профили и настройки.</li><li>Бесплатный сценарий ChatGPT Plus → Metadata Inbox теперь основной; OpenAI API отмечен как опциональный.</li><li>Подготовлен отдельный VYRON update feed с legacy fallback.</li></ul>'
s = s.replace(old, new)
p.write_text(s)

# No paid model is prefilled in the free-first default.
p = ROOT / 'src/store.ts'
s = p.read_text().replace("openaiApiKey:'',openaiModel:'gpt-5.6-luna'", "openaiApiKey:'',openaiModel:''")
s = s.replace('EMPTY_STATE:AppState={version:4,', 'EMPTY_STATE:AppState={version:5,')
s = s.replace('...s,version:4,channels:', '...s,version:5,channels:')
s = s.replace('const state:AppState={version:4,channels:', 'const state:AppState={version:5,channels:')
p.write_text(s)

p = ROOT / 'src/styles.css'
p.write_text(p.read_text().replace('/* VYRON 0.4 Autonomous Pipeline */', '/* VYRON 0.5 Content OS */'))

(ROOT / 'RELEASE_NOTES.md').write_text('''# VYRON 0.5.0 — Brand Migration\n\n- ChannelFlow is now **VYRON — CONTENT OS**.\n- macOS application bundle is renamed to `VYRON.app`.\n- Existing license, app data, YouTube OAuth profiles, channels, jobs and settings are preserved by keeping the compatibility identifier internally.\n- Existing `Documents/ChannelFlow` workspace is automatically migrated to `Documents/VYRON` when it is safe to do so. If macOS blocks the rename, VYRON keeps using the legacy folder rather than risking data loss.\n- UI, activation, About, diagnostics, OAuth callback and update notices use the VYRON brand.\n- Free-first metadata workflow is clarified: ChatGPT Plus + Metadata Inbox is the default; paid OpenAI API remains optional and is not required.\n- Update configuration adds the VYRON feed while retaining the legacy ChannelFlow feed during migration.\n''')
