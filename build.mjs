import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('src', 'dist', { recursive: true });

for (const file of ['dist/app.js', 'dist/index.html']) {
  let raw = readFileSync(file, 'utf8').replaceAll('0.2.0', version);
  if (file.endsWith('app.js')) {
    raw = raw
      .replace("let selectedStyle = 'clean';", "let selectedStyle = 'dynamic';")
      .replace("let zoomMode = 'soft';", "let zoomMode = 'dynamic';")
      .replace("applyEditPreset('clean');", "selectSegment('#stylePicker','dynamic');applyEditPreset('dynamic');")
      .replace("heroTitle:'Обычное видео → готовый Reels.'", "heroTitle:'Длинное видео → готовый AI Reels.'")
      .replace("heroText:'Загрузи исходник, выбери стиль и получи вертикальный ролик с умной нарезкой, слежением за лицом и локальными субтитрами.'", "heroText:'AI сам разбирает речь, выбирает сильные фрагменты, собирает короткий Reels, удерживает человека в кадре и прожигает динамические субтитры.'")
      .replace("smartCuts:'Smart Cuts'", "smartCuts:'AI Cut'")
      .replace("smartCutsSub:'Автоматически сокращает длинные паузы между фразами'", "smartCutsSub:'Выбирает сильные смысловые блоки и собирает короткий ролик'")
      .replace("smartCutsSafety:'Границы режутся с защитным запасом вокруг распознанной речи — слова не должны обрезаться.'", "smartCutsSafety:'Для длинного исходника AI стремится к 35–60 сек. Резка идёт по границам распознанной речи, без обрыва слов.'")
      .replace("engineNowText:'Smart Cuts по паузам, Apple Vision Face Tracking, смысловой Auto Zoom, локальный Whisper и AVFoundation экспорт.'", "engineNowText:'AI Cut по транскрипту, Apple Vision Face/Person Tracking, Dynamic Zoom, локальный Whisper, обязательные captions и AVFoundation экспорт.'")
      .replace("statusRenderingText:'Whisper, Smart Cuts, Vision и AVFoundation работают в фоне. Не закрывайте приложение.'", "statusRenderingText:'Whisper строит транскрипт → AI Cut выбирает лучшие фрагменты → Vision кадрирует → captions прожигаются → AVFoundation экспортирует.'")
      .replace("styleDynamic:'Instagram-монтаж: Smart Cuts Medium, Dynamic Zoom и более заметные captions.'", "styleDynamic:'AI Reels: смысловая нарезка до короткого ролика, Dynamic Zoom, Face/Person Tracking и динамические captions.'")
      .replace("heroTitle:'Raw video → ready Reel.'", "heroTitle:'Long video → ready AI Reel.'")
      .replace("heroText:'Drop a source video and get a vertical Reel with smart cutting, face tracking and local captions.'", "heroText:'AI analyzes speech, selects the strongest moments, builds a short Reel, tracks the person and burns dynamic captions.'")
      .replace("smartCuts:'Smart Cuts'", "smartCuts:'AI Cut'")
      .replace("smartCutsSub:'Automatically shortens long pauses between phrases'", "smartCutsSub:'Selects strong semantic blocks and builds a short edit'")
      .replace("smartCutsSafety:'Cuts keep safety padding around recognized speech so words are not clipped.'", "smartCutsSafety:'Long sources target roughly 35–60 seconds. Cuts follow recognized speech boundaries so words are not clipped.'")
      .replace("engineNowText:'Pause-based Smart Cuts, Apple Vision Face Tracking, semantic Auto Zoom, local Whisper and AVFoundation export.'", "engineNowText:'Transcript-driven AI Cut, Apple Vision Face/Person Tracking, Dynamic Zoom, local Whisper, mandatory captions and AVFoundation export.'")
      .replace("styleDynamic:'Instagram edit: Medium Smart Cuts, Dynamic Zoom and more visible captions.'", "styleDynamic:'AI Reel edit: semantic selection, Dynamic Zoom, Face/Person Tracking and dynamic captions.'");
  }
  if (file.endsWith('index.html')) {
    raw = raw.replace('id="highlightKeywords" type="checkbox"', 'id="highlightKeywords" type="checkbox" checked');
  }
  writeFileSync(file, raw, 'utf8');
}

console.log(`ReelsFactory frontend built · v${version} · AI Cut Dynamic default`);
