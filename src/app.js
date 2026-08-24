const invoke = window.__TAURI__.core.invoke;
const convertFileSrc = window.__TAURI__.core.convertFileSrc;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const VERSION = '0.2.0';
let selectedVideo = null;
let lastOutput = null;
let selectedStyle = 'clean';
let frameMode = 'face916';
let cutIntensity = 'medium';
let zoomMode = 'soft';
let lang = localStorage.getItem('rf.lang') || 'ru';

const i18n = {
  ru: {
    navHome:'Главная',navProjects:'Проекты',navSettings:'Настройки',heroTitle:'Обычное видео → готовый Reels.',heroText:'Загрузи исходник, выбери стиль и получи вертикальный ролик с умной нарезкой, слежением за лицом и локальными субтитрами.',createReel:'Создать Reels',dropTitle:'Перетащите исходное видео',dropSub:'MP4 · MOV · M4V · или выберите файл',chooseFile:'Выбрать видео',sourceVideo:'Исходное видео',replace:'Заменить',duration:'Длительность',resolution:'Разрешение',fileSize:'Размер',editStyle:'Стиль монтажа',editStyleSub:'Пресет меняет реальную обработку результата',smartCuts:'Smart Cuts',smartCutsSub:'Автоматически сокращает длинные паузы между фразами',smartCutsSafety:'Границы режутся с защитным запасом вокруг распознанной речи — слова не должны обрезаться.',contentGoal:'Цель видео',contentGoalSub:'Подключим после семантической модели, чтобы настройка реально влияла на монтаж',nextModule:'СЛЕДУЮЩИЙ МОДУЛЬ',goalSales:'Продажи',goalExpert:'Экспертный контент',goalPersonal:'Личный блог',goalEducational:'Обучение',goalStory:'История',goalEntertainment:'Развлекательный',frameMode:'Кадрирование',frameModeSub:'Вертикальный 9:16 · 1080×1920',faceTracking:'Face Tracking',faceTrackingLive:'Apple Vision анализирует лицо и плавно двигает crop',autoZoom:'Auto Zoom',autoZoomSub:'Визуальные акценты только на сильных фразах',autoZoomLogic:'Zoom включается по смысловым признакам: важные слова, цифры, вопросы и эмоциональные акценты.',captions:'Автосубтитры',captionsSub:'Whisper работает локально на Mac',highlightKeywords:'Выделять ключевые слова',engineNow:'Что реально включено в эту сборку',engineNowText:'Smart Cuts по паузам, Apple Vision Face Tracking, смысловой Auto Zoom, локальный Whisper и AVFoundation экспорт.',makeReel:'Сделать Reels',ready:'✓ Reels готов',preview:'Открыть',showFinder:'Показать в Finder',projectsTitle:'Проекты',projectsSub:'Только реальные локальные экспорты — без демо-данных.',projectsEmpty:'Пока нет готовых Reels',projectsEmptySub:'После первого успешного экспорта проект появится здесь.',settingsTitle:'Настройки',language:'Язык',languageSub:'Переключает весь интерфейс приложения',performance:'Производительность',performanceSub:'Автоматически уменьшать эффекты интерфейса при просадке',exportDefault:'Экспорт по умолчанию',exportDefaultSub:'Профиль будет включён после перехода на bitrate-controlled writer',updateCenter:'Центр обновлений',currentVersion:'Текущая версия',latestVersion:'Последняя версия',releaseDate:'Дата релиза',releaseTime:'Время релиза',checkUpdates:'Проверить обновления',statusIdle:'Готов к работе',statusIdleText:'Загрузите видео, чтобы начать',statusReady:'Готов к обработке',statusReadyText:'Исходник загружен. Настройте Reels и запускайте.',statusRendering:'Создаю Reels…',statusRenderingText:'Whisper, Smart Cuts, Vision и AVFoundation работают в фоне. Не закрывайте приложение.',statusDone:'Готово',statusDoneText:'Reels экспортирован.',statusError:'Ошибка обработки',updateAvailable:'Доступен ReelsFactory',installRestart:'Установить и перезапустить',checking:'Проверяю…',latestInstalled:'Установлена последняя версия',styleClean:'Чистый деловой монтаж: Smart Cuts Medium, Soft Zoom и спокойные субтитры.',styleDynamic:'Instagram-монтаж: Smart Cuts Medium, Dynamic Zoom и более заметные captions.',styleViral:'Быстрый темп: Smart Cuts High, Dynamic Zoom и крупные акценты.'
  },
  en: {
    navHome:'Home',navProjects:'Projects',navSettings:'Settings',heroTitle:'Raw video → ready Reel.',heroText:'Drop a source video and get a vertical Reel with smart cutting, face tracking and local captions.',createReel:'Create Reel',dropTitle:'Drop your raw video here',dropSub:'MP4 · MOV · M4V · or choose a file',chooseFile:'Choose video',sourceVideo:'Source video',replace:'Replace',duration:'Duration',resolution:'Resolution',fileSize:'Size',editStyle:'Edit style',editStyleSub:'The preset changes real export behavior',smartCuts:'Smart Cuts',smartCutsSub:'Automatically shortens long pauses between phrases',smartCutsSafety:'Cuts keep safety padding around recognized speech so words are not clipped.',contentGoal:'Content Goal',contentGoalSub:'Will be enabled after semantic analysis actually affects the edit',nextModule:'NEXT MODULE',goalSales:'Sales',goalExpert:'Expert',goalPersonal:'Personal',goalEducational:'Educational',goalStory:'Storytelling',goalEntertainment:'Entertainment',frameMode:'Framing',frameModeSub:'Vertical 9:16 · 1080×1920',faceTracking:'Face Tracking',faceTrackingLive:'Apple Vision detects the face and smoothly moves the crop',autoZoom:'Auto Zoom',autoZoomSub:'Visual accents only on strong phrases',autoZoomLogic:'Zoom is triggered by semantic signals: important words, numbers, questions and emotional accents.',captions:'Auto Captions',captionsSub:'Whisper runs locally on your Mac',highlightKeywords:'Highlight keywords',engineNow:'What is actually enabled in this build',engineNowText:'Pause-based Smart Cuts, Apple Vision Face Tracking, semantic Auto Zoom, local Whisper and AVFoundation export.',makeReel:'Create Reel',ready:'✓ Reel ready',preview:'Open',showFinder:'Show in Finder',projectsTitle:'Projects',projectsSub:'Only real local exports — no demo data.',projectsEmpty:'No exported Reels yet',projectsEmptySub:'Your first successful export will appear here.',settingsTitle:'Settings',language:'Language',languageSub:'Changes the entire application language',performance:'Performance',performanceSub:'Automatically reduce UI effects if performance drops',exportDefault:'Default export',exportDefaultSub:'Enabled after bitrate-controlled writer lands',updateCenter:'Update Center',currentVersion:'Current version',latestVersion:'Latest version',releaseDate:'Release date',releaseTime:'Release time',checkUpdates:'Check for updates',statusIdle:'Ready',statusIdleText:'Load a video to begin',statusReady:'Ready to process',statusReadyText:'Source loaded. Configure the Reel and start.',statusRendering:'Creating Reel…',statusRenderingText:'Whisper, Smart Cuts, Vision and AVFoundation are running in the background. Keep the app open.',statusDone:'Done',statusDoneText:'Reel exported.',statusError:'Processing error',updateAvailable:'ReelsFactory available',installRestart:'Install and restart',checking:'Checking…',latestInstalled:'Latest version installed',styleClean:'Clean business edit: Medium Smart Cuts, Soft Zoom and calm captions.',styleDynamic:'Instagram edit: Medium Smart Cuts, Dynamic Zoom and more visible captions.',styleViral:'Fast tempo: High Smart Cuts, Dynamic Zoom and larger accents.'
  }
};

function t(k){ return i18n[lang][k] || k; }
function applyLanguage(){
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $$('#langPicker button').forEach(b => b.classList.toggle('active', b.dataset.value === lang));
  updateStyleHint();
  if (!selectedVideo) setStatus(t('statusIdle'), t('statusIdleText'));
  renderProjects();
}

function setStatus(title,text,type='ok'){
  $('#statusTitle').textContent=title;
  $('#statusText').textContent=text;
  $('.status').className='status'+(type==='busy'?' busy':type==='error'?' error':'');
}

$$('.nav').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav').forEach(x=>x.classList.remove('active'));
  $$('.page').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');
  $('#'+btn.dataset.page).classList.add('active');
}));

async function chooseVideo(){
  try { const path=await invoke('pick_video'); if(path) await loadVideo(path); }
  catch(e){ setStatus(t('statusError'), String(e),'error'); }
}

async function loadVideo(path){
  selectedVideo=path;
  $('#videoName').textContent=path.split('/').pop();
  $('#sourcePanel').classList.remove('hidden');
  $('#render').disabled=false;
  try {
    const info=await invoke('probe_video',{input:path});
    $('#videoDuration').textContent=formatDuration(info.duration);
    $('#videoResolution').textContent=`${info.width}×${info.height}`;
    $('#videoFps').textContent=Number(info.fps||0).toFixed(info.fps%1?2:0);
    $('#videoSize').textContent=formatBytes(info.size);
    if (convertFileSrc) $('#sourcePreview').src=convertFileSrc(path);
  } catch(e){
    $('#videoDuration').textContent='—';
    $('#videoResolution').textContent='—';
    $('#videoFps').textContent='—';
    $('#videoSize').textContent='—';
    setStatus(t('statusError'),String(e),'error');
    return;
  }
  setStatus(t('statusReady'),t('statusReadyText'));
}

$('#pickVideo').addEventListener('click',chooseVideo);
$('#pickVideoTop').addEventListener('click',chooseVideo);
$('#replaceVideo').addEventListener('click',chooseVideo);

const dropZone=$('#dropZone');
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('dragging')}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('dragging')}));
dropZone.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0]; const p=f?.path; if(p) loadVideo(p);});
(async()=>{try{const w=window.__TAURI__?.webview?.getCurrentWebview?.(); if(w?.onDragDropEvent) await w.onDragDropEvent(event=>{if(event.payload?.type==='drop'&&event.payload.paths?.[0]) loadVideo(event.payload.paths[0]);});}catch(e){console.warn('native drop',e)}})();

function selectSegment(root,value){ $$(root+' button').forEach(b=>b.classList.toggle('active',b.dataset.value===value)); }
function applyEditPreset(style){
  if(style==='clean'){
    cutIntensity='medium'; zoomMode='soft'; $('#captionStyle').value='clean';
  } else if(style==='dynamic'){
    cutIntensity='medium'; zoomMode='dynamic'; $('#captionStyle').value='dynamic';
  } else {
    cutIntensity='high'; zoomMode='dynamic'; $('#captionStyle').value='bold';
  }
  $('#smartCuts').checked=true;
  selectSegment('#cutPicker',cutIntensity);
  selectSegment('#zoomPicker',zoomMode);
}
$('#stylePicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;selectedStyle=b.dataset.value;selectSegment('#stylePicker',selectedStyle);applyEditPreset(selectedStyle);updateStyleHint();});
$('#framePicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;frameMode=b.dataset.value;selectSegment('#framePicker',frameMode);});
$('#cutPicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cutIntensity=b.dataset.value;selectSegment('#cutPicker',cutIntensity);});
$('#zoomPicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;zoomMode=b.dataset.value;selectSegment('#zoomPicker',zoomMode);});
function updateStyleHint(){ $('#styleHint').textContent=t(selectedStyle==='clean'?'styleClean':selectedStyle==='dynamic'?'styleDynamic':'styleViral'); }

$('#langPicker').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;lang=b.dataset.value;localStorage.setItem('rf.lang',lang);applyLanguage();});
$('#reduceEffects').checked=localStorage.getItem('rf.reduceEffects')!=='false';
$('#reduceEffects').addEventListener('change',e=>{localStorage.setItem('rf.reduceEffects',String(e.target.checked));document.body.classList.toggle('reduced-effects',e.target.checked&&matchMedia('(prefers-reduced-motion: reduce)').matches)});
$('#exportDefault').value=localStorage.getItem('rf.exportDefault')||'balanced';
$('#exportDefault').disabled=true;

$('#render').addEventListener('click',async()=>{
  if(!selectedVideo)return;
  $('#render').disabled=true;
  $('#result').classList.add('hidden');
  setStatus(t('statusRendering'),t('statusRenderingText'),'busy');
  try{
    const out=await invoke('process_video',{
      input:selectedVideo,
      aspect:frameMode,
      captions:$('#captions').checked,
      captionStyle:$('#captionStyle').value,
      highlightKeywords:$('#highlightKeywords').checked,
      smartCuts:$('#smartCuts').checked,
      cutIntensity,
      zoomMode
    });
    lastOutput=out;
    $('#resultPath').textContent=out;
    $('#result').classList.remove('hidden');
    setStatus(t('statusDone'),t('statusDoneText'));
    saveProject({name:selectedVideo.split('/').pop(),source:selectedVideo,output:out,status:'Ready',createdAt:new Date().toISOString(),style:selectedStyle,frame:frameMode,smartCuts:$('#smartCuts').checked,cutIntensity,zoomMode});
  }catch(e){setStatus(t('statusError'),String(e),'error');}
  finally{$('#render').disabled=false;}
});
$('#showResult').addEventListener('click',()=>lastOutput&&invoke('reveal_file',{path:lastOutput}));
$('#previewResult').addEventListener('click',()=>lastOutput&&invoke('open_file',{path:lastOutput}));

function projects(){try{return JSON.parse(localStorage.getItem('rf.projects')||'[]')}catch{return[]}}
function saveProject(p){const items=projects();items.unshift(p);localStorage.setItem('rf.projects',JSON.stringify(items.slice(0,100)));renderProjects();}
function renderProjects(){
  const list=$('#projectsList'), items=projects(); list.innerHTML=''; $('#projectsEmpty').classList.toggle('hidden',items.length>0);
  items.forEach((p,i)=>{const el=document.createElement('article');el.className='project-row';el.innerHTML=`<div class="project-thumb">RF</div><div class="project-main"><b>${escapeHtml(p.name)}</b><span>${new Date(p.createdAt).toLocaleString(lang==='ru'?'ru-RU':'en-US')} · ${escapeHtml(p.style||'clean')} · ${escapeHtml(p.zoomMode||'off')}</span></div><span class="project-status">${p.status}</span><div class="project-actions"><button data-open="${i}" class="ghost">${t('preview')}</button><button data-find="${i}" class="ghost">Finder</button><button data-delete="${i}" class="ghost danger-text">×</button></div>`;list.appendChild(el)});
  $$('[data-open]').forEach(b=>b.onclick=()=>invoke('open_file',{path:items[+b.dataset.open].output}));
  $$('[data-find]').forEach(b=>b.onclick=()=>invoke('reveal_file',{path:items[+b.dataset.find].output}));
  $$('[data-delete]').forEach(b=>b.onclick=()=>{items.splice(+b.dataset.delete,1);localStorage.setItem('rf.projects',JSON.stringify(items));renderProjects()});
}
function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatDuration(v){v=Math.max(0,Number(v)||0);const m=Math.floor(v/60),s=Math.floor(v%60);return `${m}:${String(s).padStart(2,'0')}`}
function formatBytes(n){n=Number(n)||0;if(!n)return'—';const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i<2?0:1)} ${u[i]}`}

async function checkUpdates(manual=false){
  if(manual)$('#updateState').textContent=t('checking');
  try{
    const info=await invoke('check_for_update');
    $('#latestVersion').textContent=info.version||VERSION;
    if(info.releaseDate)$('#releaseDate').textContent=info.releaseDate;
    if(info.releaseTime)$('#releaseTime').textContent=info.releaseTime;
    if(info.available){
      $('#updateTitle').textContent=`${t('updateAvailable')} ${info.version}`;
      $('#updateNotes').textContent=info.notes||'';
      $('#updateBanner').classList.remove('hidden');
      $('#installUpdate').textContent=t('installRestart');
      $('#installUpdate').onclick=async()=>{await invoke('download_update',{url:info.url,sha256:info.sha256,filename:info.filename})};
      if(manual)$('#updateState').textContent=`${info.version}`;
    } else if(manual) $('#updateState').textContent=t('latestInstalled');
  }catch(e){if(manual)$('#updateState').textContent=String(e)}
}
$('#checkUpdate').addEventListener('click',()=>checkUpdates(true));
applyEditPreset('clean');
applyLanguage();
renderProjects();
checkUpdates(false);
